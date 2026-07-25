from __future__ import annotations

import argparse
import importlib
import importlib.metadata
import json
import sys
from pathlib import Path


MODULES = {
    "pyyaml": "yaml",
    "openpyxl": "openpyxl",
}


def normalized_name(value: str) -> str:
    return value.strip().lower().replace("_", "-")


def load_requirements(path: Path) -> dict[str, tuple[str, str]]:
    requirements: dict[str, tuple[str, str]] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "==" not in line:
            raise ValueError(f"requirement must use an exact == pin: {line}")
        distribution, expected = (part.strip() for part in line.split("==", 1))
        if not distribution or not expected:
            raise ValueError(f"invalid pinned requirement: {line}")
        requirements[normalized_name(distribution)] = (distribution, expected)
    if not requirements:
        raise ValueError("requirements file is empty")
    return requirements


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--requirements", required=True)
    args = parser.parse_args()

    if sys.version_info[:2] != (3, 11):
        raise RuntimeError(
            f"TCSD requires Python 3.11, received {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        )

    requirements_path = Path(args.requirements).resolve()
    requirements = load_requirements(requirements_path)
    versions: dict[str, str] = {}
    for normalized, (distribution, expected) in requirements.items():
        actual = importlib.metadata.version(distribution)
        if actual != expected:
            raise RuntimeError(
                f"{distribution} version mismatch: expected {expected}, received {actual}"
            )
        versions[distribution] = actual
        module_name = MODULES.get(normalized)
        if module_name:
            module = importlib.import_module(module_name)
            module_version = str(getattr(module, "__version__", ""))
            if module_version != expected:
                raise RuntimeError(
                    f"{module_name} module version mismatch: expected {expected}, received {module_version or 'unknown'}"
                )

    print(
        json.dumps(
            {
                "ok": True,
                "python": sys.version.split()[0],
                "executable": sys.executable,
                "requirements": str(requirements_path),
                "versions": versions,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"TCSD Python dependency gate failed: {error}", file=sys.stderr)
        raise SystemExit(1)
