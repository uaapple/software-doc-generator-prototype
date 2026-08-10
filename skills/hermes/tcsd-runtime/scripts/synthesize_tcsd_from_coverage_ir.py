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


def validator_module() -> Any:
    path = Path(__file__).with_name("validate_logical_mcdc_mapping.py")
    spec = importlib.util.spec_from_file_location("tcsd_mapping_validator", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def signature(item: dict[str, Any]) -> str:
    controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
    return json.dumps({"inputs": controller.get("direct_inputs", {}), "params": controller.get("parameters", {}), "stimulus": item.get("stimulus", {})}, sort_keys=True, default=str)


def obligation_for_item(item: dict[str, Any]) -> dict[str, Any]:
    controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
    stimulus = item.get("stimulus") if isinstance(item.get("stimulus"), dict) else {}
    obligation = {
        "id": item["id"],
        "block_path": (item.get("block") or {}).get("path"),
        "required_outcome": item.get("required_outcome"),
        "match": {"inputs": controller.get("direct_inputs") or {}, "params": controller.get("parameters") or {}},
    }
    if stimulus.get("steps"):
        obligation["stimulus"] = stimulus
    return obligation


def spec_snapshots(spec: dict[str, Any]) -> list[dict[str, Any]]:
    validator = validator_module()
    snapshots: list[dict[str, Any]] = []
    for row, test in enumerate(spec.get("tests", []), start=1):
        test_id = str(test.get("id") or f"TC_{row:03d}")
        name = str(test.get("name") or "")
        inputs, params = validator.parse_assignments(str(test.get("initialization") or ""))
        snapshots.append(validator.snapshot(test_id=test_id, row=row, name=name, phase="initialization", step_index=None, inputs=inputs, params=params))
        snapshots.extend(validator.parse_action_snapshots(str(test.get("action") or ""), test_id=test_id, row=row, name=name, init_inputs=inputs, init_params=params))
    return snapshots


def synthesize(spec: dict[str, Any], ir: dict[str, Any], *, max_new_tests: int = 50) -> tuple[dict[str, Any], list[dict[str, str]]]:
    augment = augment_module()
    base = augment.baseline_initialization(spec, None)
    existing = {str(test.get("id")) for test in spec.get("tests", [])}
    seen: set[str] = set()
    skipped: list[dict[str, str]] = []
    snapshots = spec_snapshots(spec)
    index = augment.next_test_index(spec)
    added = 0
    for item in sorted(ir.get("items", []), key=lambda value: str(value.get("id"))):
        if added >= max_new_tests:
            break
        if item.get("coverage_class") not in {"Condition", "Decision", "MCDC"}:
            continue
        reachability = item.get("reachability") if isinstance(item.get("reachability"), dict) else {}
        if reachability.get("status") != "required":
            issue_text = " ".join(str(value) for value in reachability.get("issues", []))
            reason = str(reachability.get("status") or "unresolved")
            if "threshold" in issue_text.lower():
                reason = "unresolved_threshold"
            skipped.append({"id": str(item.get("id")), "reason": reason})
            continue
        key = signature(item)
        if key in seen:
            skipped.append({"id": str(item.get("id")), "reason": "duplicate_candidate"})
            continue
        controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
        inputs, params = controller.get("direct_inputs") or {}, controller.get("parameters") or {}
        stimulus = item.get("stimulus") if isinstance(item.get("stimulus"), dict) else {}
        if not (inputs or params or stimulus.get("steps")):
            skipped.append({"id": str(item.get("id")), "reason": "unresolved_controller"})
            continue
        obligation = obligation_for_item(item)
        validator = validator_module()
        matched, _ = validator.find_match(obligation, snapshots, tolerance=1e-9, require_planned_test=False)
        if matched:
            skipped.append({"id": str(item.get("id")), "reason": "duplicate_existing_test"})
            seen.add(key)
            continue
        while f"TC_{index:03d}" in existing:
            index += 1
        spec.setdefault("tests", []).append(augment.build_test(index, obligation, augment.merge_initialization(base, inputs, params)))
        existing.add(f"TC_{index:03d}")
        seen.add(key)
        index += 1
        added += 1
    return spec, skipped


def synthesis_report(
    *,
    input_count: int,
    result: dict[str, Any],
    skipped: list[dict[str, str]],
    planned_candidate_count: int,
) -> dict[str, Any]:
    output_count = len(result.get("tests", []))
    skipped_by_reason: dict[str, int] = {}
    for item in skipped:
        reason = str(item.get("reason") or "unknown")
        skipped_by_reason[reason] = skipped_by_reason.get(reason, 0) + 1
    return {
        "schema": "simulink-ut-tcsd-coverage-ir-synthesis/v1",
        "input_test_count": input_count,
        "output_test_count": output_count,
        "planned_candidate_count": planned_candidate_count,
        "added": output_count - input_count,
        "skipped": skipped,
        "skipped_by_reason": skipped_by_reason,
        "duplicate_skipped_count": sum(
            count for reason, count in skipped_by_reason.items() if reason.startswith("duplicate")
        ),
        "control_conflict_skipped_count": skipped_by_reason.get("unresolved_controller", 0),
        "unresolved_threshold_skipped_count": sum(
            count for reason, count in skipped_by_reason.items() if "threshold" in reason
        ),
        "deduplication_basis": "controller direct_inputs + parameters + full temporal stimulus",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--coverage-ir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-new-tests", type=int, default=50)
    parser.add_argument("--report-json")
    args = parser.parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    input_count = len(spec.get("tests", []))
    ir = json.loads(Path(args.coverage_ir).read_text(encoding="utf-8"))
    result, skipped = synthesize(spec, ir, max_new_tests=args.max_new_tests)
    planned_candidate_count = sum(
        1
        for item in ir.get("items", [])
        if isinstance(item, dict)
        and item.get("coverage_class") in {"Condition", "Decision", "MCDC"}
        and (item.get("reachability") or {}).get("status") == "required"
        and (
            (item.get("controller") or {}).get("direct_inputs")
            or (item.get("controller") or {}).get("parameters")
            or (item.get("stimulus") or {}).get("steps")
        )
    )
    report = synthesis_report(
        input_count=input_count,
        result=result,
        skipped=skipped,
        planned_candidate_count=planned_candidate_count,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.report_json:
        report_path = Path(args.report_json)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
