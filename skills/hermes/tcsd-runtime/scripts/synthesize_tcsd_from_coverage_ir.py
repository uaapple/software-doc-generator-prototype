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


def member_pair_ids(item: dict[str, Any]) -> set[str]:
    outcome = str(item.get("required_outcome") or "")
    vector = outcome.split("atomic_condition_vector=", 1)[1].split(";", 1)[0] if "atomic_condition_vector=" in outcome else ""
    return {
        str(pair.get("pair_id"))
        for pair in item.get("mcdcPairs", [])
        if isinstance(pair, dict)
        and pair.get("pair_id")
        and vector in {pair.get("false_vector"), pair.get("true_vector")}
    }


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


def pair_first_items(ir: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Order executable items by complete MC/DC pair value, never file name."""
    items = [item for item in ir.get("items", []) if isinstance(item, dict)]
    executable = {
        str(item.get("id")): item
        for item in items
        if item.get("coverage_class") == "MCDC"
        and (item.get("reachability") or {}).get("status") == "required"
        and item.get("mcdcPairs")
        and (
            (item.get("controller") or {}).get("direct_inputs")
            or (item.get("controller") or {}).get("parameters")
            or (item.get("stimulus") or {}).get("steps")
        )
    }
    pair_members: dict[str, dict[str, dict[str, Any]]] = {}
    pair_meta: dict[str, dict[str, Any]] = {}
    for item in executable.values():
        outcome = str(item.get("required_outcome") or "")
        vector = outcome.split("atomic_condition_vector=", 1)[1].split(";", 1)[0] if "atomic_condition_vector=" in outcome else ""
        for pair in item.get("mcdcPairs", []):
            pair_id = str(pair.get("pair_id") or "")
            if not pair_id or vector not in {pair.get("false_vector"), pair.get("true_vector")}:
                continue
            pair_members.setdefault(pair_id, {})[vector] = item
            pair_meta[pair_id] = pair

    complete: list[tuple[str, list[dict[str, Any]]]] = []
    for pair_id, members in pair_members.items():
        pair = pair_meta[pair_id]
        vectors = [str(pair.get("false_vector") or ""), str(pair.get("true_vector") or "")]
        if all(vector in members for vector in vectors):
            complete.append((pair_id, [members[vector] for vector in vectors]))

    by_block: dict[str, list[tuple[str, list[dict[str, Any]]]]] = {}
    for pair in complete:
        block = str((pair[1][0].get("block") or {}).get("path") or "")
        by_block.setdefault(block, []).append(pair)

    def block_key(value: tuple[str, list[tuple[str, list[dict[str, Any]]]]]) -> tuple[Any, ...]:
        block, pairs = value
        unique = {signature(item) for _, members in pairs for item in members}
        tier = min(0 if item.get("planningTier") == "top" else 1 for _, members in pairs for item in members)
        efficiency = len(pairs) / max(1, len(unique))
        return (tier, -efficiency, block)

    ordered: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    pair_count = 0
    for _, pairs in sorted(by_block.items(), key=block_key):
        remaining = list(pairs)
        block_signatures: set[str] = set()
        while remaining:
            pair_id, members = min(
                remaining,
                key=lambda pair: (
                    sum(signature(item) not in block_signatures for item in pair[1]),
                    pair[0],
                ),
            )
            remaining.remove((pair_id, members))
            for item in members:
                block_signatures.add(signature(item))
                identity = str(item.get("id"))
                if identity not in seen_ids:
                    ordered.append(item)
                    seen_ids.add(identity)
            pair_count += 1

    for item in sorted(items, key=lambda value: (
        0 if value.get("coverage_class") == "MCDC" else 1,
        str(value.get("id")),
    )):
        identity = str(item.get("id"))
        if identity not in seen_ids:
            ordered.append(item)
            seen_ids.add(identity)
    return ordered, {
        "complete_pair_count": pair_count,
        "pair_first_item_count": sum(bool(item.get("mcdcPairs")) for item in ordered[:len(seen_ids)]),
    }


def synthesize(spec: dict[str, Any], ir: dict[str, Any], *, max_new_tests: int = 50) -> tuple[dict[str, Any], list[dict[str, str]]]:
    augment = augment_module()
    base = augment.baseline_initialization(spec, None)
    existing = {str(test.get("id")) for test in spec.get("tests", [])}
    seen: set[str] = set()
    skipped: list[dict[str, str]] = []
    snapshots = spec_snapshots(spec)
    index = augment.next_test_index(spec)
    added = 0
    last_selected_pair_ids: set[str] = set()
    closing_pair_ids: set[str] | None = None
    ordered_items, _ = pair_first_items(ir)
    for item in ordered_items:
        item_pair_ids = member_pair_ids(item)
        if added >= max_new_tests and closing_pair_ids is None:
            # The configured budget is a soft ceiling.  Preserve the MC/DC
            # meaning of the last selected vector by also admitting its
            # missing counterpart(s), without opening new pair chains.
            closing_pair_ids = set(last_selected_pair_ids)
        if closing_pair_ids is not None and not item_pair_ids.intersection(closing_pair_ids):
            continue
        if added >= max_new_tests and not closing_pair_ids:
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
        if closing_pair_ids is None:
            last_selected_pair_ids = item_pair_ids
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
