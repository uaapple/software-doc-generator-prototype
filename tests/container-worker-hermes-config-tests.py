#!/usr/bin/env python3
"""Regression tests for the Worker Hermes config initialization gate."""

from __future__ import annotations

import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

import yaml


ROOT = Path(__file__).resolve().parents[1]
CONFIGURATOR = ROOT / "containers" / "worker" / "configure-hermes.py"
PROVIDER = "provider-test-placeholder"
MODEL = "model-test-placeholder"
API_KEY = "api-key-test-placeholder"
BASE_URL = "https://provider.test.invalid"


def environment(home: Path, **overrides: str) -> dict[str, str]:
    values = os.environ.copy()
    for name in (
        "HERMES_PROFILE",
        "TCSD_STAGE_HERMES_PROFILE",
        "HERMES_INFERENCE_PROVIDER",
        "HERMES_INFERENCE_MODEL",
        "DEEPSEEK_API_KEY",
        "DEEPSEEK_BASE_URL",
    ):
        values.pop(name, None)
    values.update(
        {
            "HERMES_HOME": str(home),
            "HERMES_INFERENCE_PROVIDER": PROVIDER,
            "HERMES_INFERENCE_MODEL": MODEL,
            "DEEPSEEK_API_KEY": API_KEY,
            "DEEPSEEK_BASE_URL": BASE_URL,
        }
    )
    values.update(overrides)
    return values


def run_configurator(
    home: Path, *arguments: str, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CONFIGURATOR), *arguments],
        cwd=ROOT,
        env=env or environment(home),
        text=True,
        capture_output=True,
        check=False,
    )


def read_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


with tempfile.TemporaryDirectory(prefix="sdg-hermes-config-") as temporary:
    root = Path(temporary)

    empty_home = root / "empty-home"
    first = run_configurator(empty_home, "--configure-only")
    assert first.returncode == 0, first.stderr
    default_config = empty_home / "config.yaml"
    assert read_yaml(default_config) == {
        "model": {"provider": PROVIDER, "default": MODEL}
    }
    assert stat.S_IMODE(default_config.stat().st_mode) == 0o600
    assert PROVIDER not in first.stdout
    assert MODEL not in first.stdout
    assert API_KEY not in first.stdout
    assert BASE_URL not in first.stdout

    existing_home = root / "existing-home"
    existing_home.mkdir()
    existing_config = existing_home / "config.yaml"
    existing_config.write_text(
        yaml.safe_dump(
            {
                "logging": {"level": "debug"},
                "model": {"provider": "old", "default": "old", "temperature": 0.2},
                "tools": {"enabled": True},
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    updated = run_configurator(existing_home, "--configure-only")
    assert updated.returncode == 0, updated.stderr
    payload = read_yaml(existing_config)
    assert payload["logging"] == {"level": "debug"}
    assert payload["tools"] == {"enabled": True}
    assert payload["model"] == {
        "provider": PROVIDER,
        "default": MODEL,
        "temperature": 0.2,
    }
    serialized = existing_config.read_text(encoding="utf-8")
    assert API_KEY not in serialized
    assert BASE_URL not in serialized
    before = (serialized, existing_config.stat().st_ino, existing_config.stat().st_mtime_ns)
    repeated = run_configurator(existing_home, "--configure-only")
    assert repeated.returncode == 0, repeated.stderr
    after = (
        existing_config.read_text(encoding="utf-8"),
        existing_config.stat().st_ino,
        existing_config.stat().st_mtime_ns,
    )
    assert after == before
    assert "verified" in repeated.stdout

    profiles_home = root / "profiles-home"
    profiles_env = environment(
        profiles_home,
        HERMES_PROFILE="application-profile",
        TCSD_STAGE_HERMES_PROFILE="stage-profile",
    )
    profiles = run_configurator(profiles_home, "--configure-only", env=profiles_env)
    assert profiles.returncode == 0, profiles.stderr
    for config_path in (
        profiles_home / "config.yaml",
        profiles_home / "profiles" / "application-profile" / "config.yaml",
        profiles_home / "profiles" / "stage-profile" / "config.yaml",
    ):
        assert read_yaml(config_path)["model"] == {
            "provider": PROVIDER,
            "default": MODEL,
        }

    fake_chat = root / "fake-hermes-chat.py"
    fake_chat.write_text(
        "\n".join(
            [
                "import os",
                "from pathlib import Path",
                "import sys",
                "import yaml",
                "home = Path(os.environ['HERMES_HOME'])",
                "profile = os.environ.get('TCSD_STAGE_HERMES_PROFILE', '').strip()",
                "config = home / 'config.yaml' if not profile or profile == 'default' else home / 'profiles' / profile / 'config.yaml'",
                "payload = yaml.safe_load(config.read_text(encoding='utf-8'))",
                "assert sys.argv[1:3] == ['chat', '-q']",
                "assert payload['model']['provider'] == os.environ['EXPECTED_PROVIDER']",
                "assert payload['model']['default'] == os.environ['EXPECTED_MODEL']",
                "print('fake chat accepted persisted model selection')",
            ]
        ),
        encoding="utf-8",
    )
    chat_home = root / "chat-home"
    chat_env = environment(
        chat_home,
        TCSD_STAGE_HERMES_PROFILE="stage-profile",
        EXPECTED_PROVIDER=PROVIDER,
        EXPECTED_MODEL=MODEL,
    )
    chat = run_configurator(
        chat_home,
        sys.executable,
        str(fake_chat),
        "chat",
        "-q",
        "smoke",
        env=chat_env,
    )
    assert chat.returncode == 0, chat.stderr
    assert "fake chat accepted persisted model selection" in chat.stdout

    missing_provider_env = environment(root / "missing-provider")
    missing_provider_env["HERMES_INFERENCE_PROVIDER"] = ""
    missing_provider = run_configurator(
        root / "missing-provider", "--configure-only", env=missing_provider_env
    )
    assert missing_provider.returncode != 0
    assert "HERMES_INFERENCE_PROVIDER must be non-empty" in missing_provider.stderr

    invalid_profile_env = environment(
        root / "invalid-profile", TCSD_STAGE_HERMES_PROFILE="../escape"
    )
    invalid_profile = run_configurator(
        root / "invalid-profile", "--configure-only", env=invalid_profile_env
    )
    assert invalid_profile.returncode != 0
    assert "invalid Hermes profile name" in invalid_profile.stderr

    symlink_home = root / "symlink-home"
    symlink_home.mkdir()
    outside_config = root / "outside-config.yaml"
    outside_config.write_text("outside: unchanged\n", encoding="utf-8")
    (symlink_home / "config.yaml").symlink_to(outside_config)
    symlink_result = run_configurator(symlink_home, "--configure-only")
    assert symlink_result.returncode != 0
    assert "cannot be a symbolic link" in symlink_result.stderr
    assert outside_config.read_text(encoding="utf-8") == "outside: unchanged\n"

print("Worker Hermes config initialization tests passed.")
