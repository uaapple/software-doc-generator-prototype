#!/usr/bin/env python3
"""Atomically manage the non-secret Hermes model selection before Worker start."""

from __future__ import annotations

import os
from pathlib import Path
import re
import sys
import tempfile

import yaml


PROFILE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
MANAGED_KEYS = "model.provider, model.default"


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be non-empty before the Hermes Worker starts")
    return value


def selected_profiles() -> list[str]:
    profiles = ["default"]
    for name in ("HERMES_PROFILE", "TCSD_STAGE_HERMES_PROFILE"):
        profile = os.environ.get(name, "").strip()
        if not profile or profile == "default" or profile in profiles:
            continue
        if not PROFILE_PATTERN.fullmatch(profile) or profile in {".", ".."}:
            raise RuntimeError(f"{name} contains an invalid Hermes profile name")
        profiles.append(profile)
    return profiles


def config_path(home: Path, profile: str) -> Path:
    if profile == "default":
        return home / "config.yaml"
    return home / "profiles" / profile / "config.yaml"


def validate_target(home: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.parent.resolve().is_relative_to(home):
        raise RuntimeError("Hermes profile config directory escapes HERMES_HOME")
    if target.is_symlink():
        raise RuntimeError("Hermes config.yaml cannot be a symbolic link")


def load_config(target: Path) -> dict:
    if not target.exists():
        return {}
    payload = yaml.safe_load(target.read_text(encoding="utf-8"))
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise RuntimeError(f"Hermes config must contain a YAML mapping: {target}")
    return payload


def atomic_write_yaml(target: Path, payload: dict) -> bool:
    rendered = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False)
    existing = target.read_text(encoding="utf-8") if target.exists() else None
    if existing == rendered:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent, prefix=".config.yaml.", suffix=".tmp"
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(rendered)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        directory_descriptor = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        temporary.unlink(missing_ok=True)
    return True


def configure() -> None:
    provider = required_environment("HERMES_INFERENCE_PROVIDER")
    model = required_environment("HERMES_INFERENCE_MODEL")
    home = Path(required_environment("HERMES_HOME")).expanduser().resolve()
    for profile in selected_profiles():
        target = config_path(home, profile)
        validate_target(home, target)
        payload = load_config(target)
        model_config = payload.get("model")
        if model_config is None:
            model_config = {}
            payload["model"] = model_config
        if not isinstance(model_config, dict):
            raise RuntimeError(f"Hermes model config must be a YAML mapping: {target}")
        model_config["provider"] = provider
        model_config["default"] = model
        changed = atomic_write_yaml(target, payload)
        action = "updated" if changed else "verified"
        print(
            f"Hermes profile {profile} {action}; managed keys: {MANAGED_KEYS}",
            flush=True,
        )


def main() -> None:
    configure()
    arguments = sys.argv[1:]
    if arguments == ["--configure-only"]:
        return
    if not arguments:
        raise RuntimeError("Hermes Worker entrypoint requires a server command")
    os.execvp(arguments[0], arguments)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Hermes Worker configuration failed: {error}", file=sys.stderr)
        raise SystemExit(1)
