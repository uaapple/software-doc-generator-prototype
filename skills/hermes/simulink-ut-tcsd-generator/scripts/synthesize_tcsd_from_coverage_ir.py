#!/usr/bin/env python3
"""Append minimal, deduplicated executable TCSD cases from Coverage IR."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


def augment_module() -> Any:
    path = Path(__file__).with_name("augment_tcsd_for_mcdc.py")
    spec = importlib.util.spec_from_file_location("tcsd_augment", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def signature(item: dict[str, Any]) -> str:
    controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
    return json.dumps({"inputs": controller.get("direct_inputs", {}), "params": controller.get("parameters", {}), "stimulus": item.get("stimulus", {})}, sort_keys=True, default=str)


def synthesize(spec: dict[str, Any], ir: dict[str, Any], *, max_new_tests: int = 50) -> tuple[dict[str, Any], list[dict[str, str]]]:
    augment = augment_module()
    base = augment.baseline_initialization(spec, None)
    existing = {str(test.get("id")) for test in spec.get("tests", [])}
    seen: set[str] = set()
    skipped: list[dict[str, str]] = []
    index = augment.next_test_index(spec)
    for item in sorted(ir.get("items", []), key=lambda value: str(value.get("id"))):
        if len(seen) >= max_new_tests:
            break
        if item.get("coverage_class") not in {"Decision", "MCDC"}:
            continue
        reachability = item.get("reachability") if isinstance(item.get("reachability"), dict) else {}
        if reachability.get("status") != "required":
            skipped.append({"id": str(item.get("id")), "reason": str(reachability.get("status") or "unresolved")})
            continue
        key = signature(item)
        if key in seen:
            continue
        controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
        inputs, params = controller.get("direct_inputs") or {}, controller.get("parameters") or {}
        stimulus = item.get("stimulus") if isinstance(item.get("stimulus"), dict) else {}
        if not (inputs or params or stimulus.get("steps")):
            skipped.append({"id": str(item.get("id")), "reason": "unresolved_controller"})
            continue
        while f"TC_{index:03d}" in existing:
            index += 1
        obligation = {"id": item["id"], "block_path": (item.get("block") or {}).get("path"), "required_outcome": item.get("required_outcome"), "match": {"inputs": inputs, "params": params}}
        if stimulus.get("steps"):
            obligation["stimulus"] = stimulus
        spec.setdefault("tests", []).append(augment.build_test(index, obligation, augment.merge_initialization(base, inputs, params)))
        existing.add(f"TC_{index:03d}")
        seen.add(key)
        index += 1
    return spec, skipped


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--coverage-ir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-new-tests", type=int, default=50)
    args = parser.parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    ir = json.loads(Path(args.coverage_ir).read_text(encoding="utf-8"))
    result, skipped = synthesize(spec, ir, max_new_tests=args.max_new_tests)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "added": len(result.get("tests", [])) - len(spec.get("tests", [])), "skipped": skipped}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
