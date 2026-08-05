#!/usr/bin/env python3
"""Verify a docker save/OCI archive without extracting it."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import tarfile
from typing import Any


class VerificationError(RuntimeError):
    """Raised when an archive identity or safety gate fails."""


def sha256_stream(stream: Any) -> str:
    digest = hashlib.sha256()
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            return digest.hexdigest()
        digest.update(chunk)


def safe_member_name(value: str) -> str:
    normalized = str(value or "").replace("\\", "/")
    parts = pathlib.PurePosixPath(normalized).parts
    if (
        not normalized
        or normalized.startswith("/")
        or any(part in {"", ".", ".."} for part in parts)
    ):
        raise VerificationError(f"unsafe archive member path: {value!r}")
    return normalized


def content_digest_from_path(value: str) -> str | None:
    normalized = safe_member_name(value)
    if normalized.startswith("blobs/sha256/"):
        candidate = normalized[len("blobs/sha256/") :]
    else:
        candidate = pathlib.PurePosixPath(normalized).name
        if candidate.endswith(".json"):
            candidate = candidate[: -len(".json")]
    if len(candidate) == 64 and all(character in "0123456789abcdef" for character in candidate):
        return candidate
    return None


class ArchiveReader:
    def __init__(self, archive_path: pathlib.Path):
        self.archive_path = archive_path
        self.archive = tarfile.open(archive_path, mode="r:*")
        self.members: dict[str, tarfile.TarInfo] = {}
        for member in self.archive.getmembers():
            name = safe_member_name(member.name.rstrip("/"))
            if name in self.members:
                raise VerificationError(f"duplicate archive member: {name}")
            if member.issym() or member.islnk() or member.isdev():
                raise VerificationError(f"unsupported archive member type: {name}")
            self.members[name] = member

    def close(self) -> None:
        self.archive.close()

    def read_bytes(self, name: str, *, maximum_bytes: int = 16 * 1024 * 1024) -> bytes:
        normalized = safe_member_name(name)
        member = self.members.get(normalized)
        if member is None or not member.isfile():
            raise VerificationError(f"required archive file is missing: {normalized}")
        if member.size > maximum_bytes:
            raise VerificationError(f"archive metadata file is too large: {normalized}")
        stream = self.archive.extractfile(member)
        if stream is None:
            raise VerificationError(f"unable to read archive file: {normalized}")
        return stream.read()

    def sha256_member(self, name: str) -> str:
        normalized = safe_member_name(name)
        member = self.members.get(normalized)
        if member is None or not member.isfile():
            raise VerificationError(f"required archive blob is missing: {normalized}")
        stream = self.archive.extractfile(member)
        if stream is None:
            raise VerificationError(f"unable to read archive blob: {normalized}")
        return sha256_stream(stream)


def read_json(reader: ArchiveReader, name: str) -> Any:
    try:
        return json.loads(reader.read_bytes(name).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise VerificationError(f"invalid JSON in {name}: {error}") from error


def verify_content_address(reader: ArchiveReader, name: str) -> str:
    expected = content_digest_from_path(name)
    actual = reader.sha256_member(name)
    if expected and actual != expected:
        raise VerificationError(
            f"content digest mismatch for {name}: expected sha256:{expected}, got sha256:{actual}"
        )
    return actual


def verify_archive(arguments: argparse.Namespace) -> dict[str, Any]:
    archive_path = pathlib.Path(arguments.archive).resolve()
    if not archive_path.is_file():
        raise VerificationError(f"archive does not exist: {archive_path}")
    archive_sha256 = sha256_stream(archive_path.open("rb"))
    if arguments.expect_archive_sha256 and archive_sha256 != arguments.expect_archive_sha256:
        raise VerificationError(
            "archive SHA-256 mismatch: "
            f"expected {arguments.expect_archive_sha256}, got {archive_sha256}"
        )

    reader = ArchiveReader(archive_path)
    try:
        manifest = read_json(reader, "manifest.json")
        if not isinstance(manifest, list):
            raise VerificationError("manifest.json must contain an image array")
        if len(manifest) != arguments.expect_images:
            raise VerificationError(
                f"expected {arguments.expect_images} image(s), found {len(manifest)}"
            )

        images = []
        for entry in manifest:
            if not isinstance(entry, dict):
                raise VerificationError("manifest image entry must be an object")
            config_path = safe_member_name(entry.get("Config", ""))
            config_digest = verify_content_address(reader, config_path)
            config = read_json(reader, config_path)
            os_name = str(config.get("os") or config.get("Os") or "")
            architecture = str(config.get("architecture") or config.get("Architecture") or "")
            labels = config.get("config", {}).get("Labels") or config.get("Config", {}).get("Labels") or {}
            revision = str(labels.get("org.opencontainers.image.revision") or "")
            if os_name != arguments.expect_os:
                raise VerificationError(
                    f"archive OS mismatch: expected {arguments.expect_os}, got {os_name or '<empty>'}"
                )
            if architecture != arguments.expect_architecture:
                raise VerificationError(
                    "archive architecture mismatch: "
                    f"expected {arguments.expect_architecture}, got {architecture or '<empty>'}"
                )
            if revision != arguments.expect_revision:
                raise VerificationError(
                    f"archive revision mismatch: expected {arguments.expect_revision}, "
                    f"got {revision or '<empty>'}"
                )
            layers = entry.get("Layers")
            if not isinstance(layers, list) or not layers:
                raise VerificationError("manifest image entry must contain at least one layer")
            layer_digests = []
            for layer_path in layers:
                normalized_layer_path = safe_member_name(layer_path)
                layer_digests.append(
                    f"sha256:{verify_content_address(reader, normalized_layer_path)}"
                )
            repo_tags = entry.get("RepoTags") or []
            if not isinstance(repo_tags, list) or any(not isinstance(tag, str) for tag in repo_tags):
                raise VerificationError("manifest RepoTags must be a string array")
            images.append(
                {
                    "configPath": config_path,
                    "configImageId": f"sha256:{config_digest}",
                    "os": os_name,
                    "architecture": architecture,
                    "imageRevision": revision,
                    "repoTags": repo_tags,
                    "layerCount": len(layer_digests),
                    "layerDigests": layer_digests,
                }
            )

        top_level_digests = []
        if "index.json" in reader.members:
            index = read_json(reader, "index.json")
            descriptors = index.get("manifests") if isinstance(index, dict) else None
            if not isinstance(descriptors, list) or not descriptors:
                raise VerificationError("index.json must contain at least one manifest descriptor")
            for descriptor in descriptors:
                digest = str(descriptor.get("digest") or "")
                if not digest.startswith("sha256:") or len(digest) != 71:
                    raise VerificationError(f"invalid OCI index digest: {digest!r}")
                blob_path = f"blobs/sha256/{digest[len('sha256:') :]}"
                verify_content_address(reader, blob_path)
                top_level_digests.append(digest)

        return {
            "status": "passed",
            "archive": archive_path.name,
            "archiveSha256": archive_sha256,
            "imageCount": len(images),
            "images": images,
            "ociTopLevelDigests": top_level_digests,
        }
    finally:
        reader.close()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("--expect-images", type=int, required=True)
    parser.add_argument("--expect-os", required=True)
    parser.add_argument("--expect-architecture", required=True)
    parser.add_argument("--expect-revision", required=True)
    parser.add_argument("--expect-archive-sha256")
    arguments = parser.parse_args()
    if arguments.expect_images < 1:
        parser.error("--expect-images must be positive")
    if arguments.expect_archive_sha256 and (
        len(arguments.expect_archive_sha256) != 64
        or any(character not in "0123456789abcdef" for character in arguments.expect_archive_sha256)
    ):
        parser.error("--expect-archive-sha256 must be a lowercase SHA-256 hex digest")
    return arguments


def main() -> int:
    try:
        report = verify_archive(parse_arguments())
    except (OSError, tarfile.TarError, VerificationError) as error:
        print(f"IMAGE_ARCHIVE_VERIFICATION_FAILED: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
