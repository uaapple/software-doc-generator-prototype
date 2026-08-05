import ast
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
VERIFIER = ROOT / "scripts" / "verify_image_archive.py"
REVISION = "sha256:" + "a" * 64


def json_bytes(value):
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


def add_bytes(archive, name, content):
    member = tarfile.TarInfo(name)
    member.size = len(content)
    archive.addfile(member, io.BytesIO(content))


def build_archive(path, *, revision=REVISION, config_name=None, unsafe=False):
    config = json_bytes(
        {
            "architecture": "amd64",
            "os": "linux",
            "config": {"Labels": {"org.opencontainers.image.revision": revision}},
        }
    )
    config_digest = hashlib.sha256(config).hexdigest()
    config_path = config_name or f"blobs/sha256/{config_digest}"
    layer = b"layer-content"
    layer_digest = hashlib.sha256(layer).hexdigest()
    manifest = json_bytes(
        [
            {
                "Config": config_path,
                "RepoTags": ["example.invalid/app:test"],
                "Layers": [f"blobs/sha256/{layer_digest}"],
            }
        ]
    )
    descriptor = json_bytes({"schemaVersion": 2})
    descriptor_digest = hashlib.sha256(descriptor).hexdigest()
    index = json_bytes(
        {
            "schemaVersion": 2,
            "manifests": [{"digest": f"sha256:{descriptor_digest}"}],
        }
    )
    with tarfile.open(path, "w") as archive:
        add_bytes(archive, "manifest.json", manifest)
        add_bytes(archive, "index.json", index)
        add_bytes(archive, config_path, config)
        add_bytes(archive, f"blobs/sha256/{layer_digest}", layer)
        add_bytes(archive, f"blobs/sha256/{descriptor_digest}", descriptor)
        if unsafe:
            add_bytes(archive, "../escape", b"forbidden")
    return hashlib.sha256(path.read_bytes()).hexdigest()


class VerifyImageArchiveTests(unittest.TestCase):
    def test_verifier_source_is_python38_compatible(self):
        source = VERIFIER.read_text(encoding="utf-8")
        ast.parse(source, filename=str(VERIFIER), feature_version=(3, 8))
        self.assertNotIn(".removeprefix(", source)
        self.assertNotIn(".removesuffix(", source)

    def run_verifier(self, archive, *extra):
        return subprocess.run(
            [
                sys.executable,
                str(VERIFIER),
                str(archive),
                "--expect-images",
                "1",
                "--expect-os",
                "linux",
                "--expect-architecture",
                "amd64",
                "--expect-revision",
                REVISION,
                *extra,
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_accepts_closed_archive_identity_chain(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            archive = pathlib.Path(temporary_directory) / "image.tar"
            archive_sha256 = build_archive(archive)
            result = self.run_verifier(
                archive, "--expect-archive-sha256", archive_sha256
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["status"], "passed")
            self.assertEqual(report["imageCount"], 1)
            self.assertEqual(report["images"][0]["imageRevision"], REVISION)
            self.assertTrue(report["images"][0]["configImageId"].startswith("sha256:"))
            self.assertEqual(len(report["ociTopLevelDigests"]), 1)

    def test_rejects_config_content_address_mismatch(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            archive = pathlib.Path(temporary_directory) / "image.tar"
            build_archive(
                archive,
                config_name=f"blobs/sha256/{'0' * 64}",
            )
            result = self.run_verifier(archive)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("content digest mismatch", result.stderr)

    def test_rejects_revision_mismatch(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            archive = pathlib.Path(temporary_directory) / "image.tar"
            build_archive(archive, revision="sha256:" + "b" * 64)
            result = self.run_verifier(archive)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("archive revision mismatch", result.stderr)

    def test_rejects_unsafe_member(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            archive = pathlib.Path(temporary_directory) / "image.tar"
            build_archive(archive, unsafe=True)
            result = self.run_verifier(archive)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("unsafe archive member path", result.stderr)


if __name__ == "__main__":
    unittest.main()
