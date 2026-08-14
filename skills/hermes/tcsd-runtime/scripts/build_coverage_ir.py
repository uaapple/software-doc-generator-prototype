#!/usr/bin/env python3
"""Create the deterministic, evidence-carrying TCSD Coverage IR.

The IR is deliberately independent of a particular model: it retains the
controller assignments, nested-logic context, temporal stimulus and simulation
evidence required to turn a coverage item into an executable TCSD case.  It is
also the contract between structural analysis and the bounded repair pass.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

SCHEMA = "simulink-ut-tcsd-coverage-ir/v1"
VALID_STATUS = {"required", "unsupported", "unresolved", "unreachable", "covered"}
MAX_TRACE_BYTES = 16 * 1024 * 1024
MAX_OPERATOR_COUNT = 200_000


def structured_error(code: str, message: str, details: dict[str, Any] | None = None) -> int:
    payload: dict[str, Any] = {
        "schema": "tcsd-deterministic-script-error/v1",
        "code": code,
        "message": message,
    }
    if details:
        payload["details"] = details
    print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
    return 1


def load(path: str | Path) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}


def norm_map(value: Any) -> dict[str, Any]:
    return {str(k): v for k, v in value.items()} if isinstance(value, dict) else {}


def norm_stimulus(value: Any) -> dict[str, Any]:
    value = value if isinstance(value, dict) else {}
    steps = value.get("steps") or []
    if isinstance(steps, dict):
        steps = [steps]
    return {
        "initial_inputs": norm_map(value.get("initial_inputs")),
        "initial_params": norm_map(value.get("initial_params")),
        "steps": [
            {
                "index": int(step.get("index") or index),
                "delay_s": float(step.get("delay_s") or 0),
                "input_updates": norm_map(step.get("input_updates")),
                "param_updates": norm_map(step.get("param_updates")),
            }
            for index, step in enumerate(steps, 1) if isinstance(step, dict)
        ],
        "evidence_step": value.get("evidence_step"),
    }


def planner_module() -> Any:
    path = Path(__file__).with_name("build_atomic_mcdc_repair_plan.py")
    spec = importlib.util.spec_from_file_location("tcsd_atomic_planner", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def contains_temporal_trace(node: Any) -> bool:
    if isinstance(node, dict):
        kind = str(node.get("kind") or "").lower()
        labels = " ".join(
            str(node.get(key) or "")
            for key in ("name", "maskType", "referenceBlock", "semantic", "blockType")
        ).lower()
        compact = "".join(character for character in labels if character.isalnum())
        if kind == "stateful" or any(
            token in compact
            for token in ("edgerising", "edgefalling", "risingedge", "fallingedge")
        ):
            return True
        return any(contains_temporal_trace(value) for value in node.values())
    if isinstance(node, list):
        return any(contains_temporal_trace(value) for value in node)
    return False


def normalize_item(item: dict[str, Any], coverage_class: str, *, model: str) -> dict[str, Any]:
    status = str(item.get("status") or "required").lower()
    if status not in VALID_STATUS:
        status = "unresolved"
    match = item.get("match") if isinstance(item.get("match"), dict) else {}
    evidence = item.get("simulation_evidence") or item.get("probe_evidence") or {}
    return {
        "id": str(item.get("id") or f"{coverage_class}_{len(str(item))}"),
        "model": item.get("model") or model,
        "coverage_class": coverage_class,
        "block": {"path": item.get("block_path"), "sid": item.get("sid")},
        "required_outcome": item.get("required_outcome"),
        "controller": {"direct_inputs": norm_map(match.get("inputs")), "parameters": norm_map(match.get("params"))},
        "nested_logic": item.get("condition_states") or item.get("operator_inputs") or {},
        "sensitization_context": item.get("sensitization_context") or {},
        "patternType": item.get("pattern_type") or "",
        "controlRecipe": item.get("control_recipe") if isinstance(item.get("control_recipe"), dict) else {},
        "mcdcPairs": item.get("mcdc_pairs") if isinstance(item.get("mcdc_pairs"), list) else [],
        "detectorEvidence": item.get("detector_evidence") if isinstance(item.get("detector_evidence"), dict) else {},
        "stimulus": norm_stimulus(item.get("stimulus")),
        "reachability": {"status": status, "reason": item.get("reason"), "issues": item.get("issues") or []},
        "simulation_evidence": evidence if isinstance(evidence, dict) else {},
        "source_obligation_id": item.get("id"),
    }


def build_ir(
    trace_payload: dict[str, Any], *, probe_payload: dict[str, Any] | None = None,
    evidence_obligations: dict[str, Any] | None = None,
    include_nested_operators: bool = False,
) -> dict[str, Any]:
    planner = planner_module()
    reports = planner.reports(trace_payload)
    if not reports:
        raise ValueError("logical traces contain no operator reports")
    model = str(trace_payload.get("model") or (reports[0].get("model") if reports else ""))
    items: list[dict[str, Any]] = []
    operator_count = 0
    for report in reports:
        top = planner.top_operators(report)
        if include_nested_operators:
            top_ids = {str(item.get("id") or item.get("sid") or "") for item in top}
            nested = [
                item for item in planner.operator_records(report)
                if str(item.get("id") or item.get("sid") or "") not in top_ids
            ]
            operators = [*top, *nested]
        else:
            operators = top
        operator_count += len(operators)
        if operator_count > MAX_OPERATOR_COUNT:
            raise ValueError(
                f"logical operator count {operator_count} exceeds the supported limit "
                f"({MAX_OPERATOR_COUNT})"
            )
        for operator in operators:
            operator_start = len(items)
            operator_id = str(operator.get("id") or operator.get("sid") or "")
            planning_tier = "top" if operator_id in {str(item.get("id") or item.get("sid") or "") for item in top} else "nested"
            op_id = str(operator.get("id") or operator.get("sid") or operator.get("block_path"))
            # A decision is always explicit even when detailed MCDC mapping is unsupported.
            items.append(normalize_item({
                "id": f"{op_id}_decision", "model": model, "block_path": operator.get("block_path"),
                "sid": operator.get("sid") or op_id, "required_outcome": "logical output true and false",
                "status": "required", "operator_inputs": {"operator": operator.get("operator")},
            }, "Decision", model=model))
            planned, summary = planner.build_for_operator(model, operator)
            for obligation in planned:
                obligation_class = str(obligation.get("coverage_class") or "MCDC")
                items.append(normalize_item(obligation, obligation_class, model=model))
                condition_states = (obligation.get("condition_states") or {}) if obligation_class == "MCDC" else {}
                for condition, desired in condition_states.items():
                    items.append(normalize_item({
                        "id": f"{obligation['id']}_{condition}", "model": model,
                        "block_path": operator.get("block_path"), "sid": operator.get("sid"),
                        "required_outcome": f"{condition}={str(desired).lower()}", "status": obligation.get("status"),
                        "match": obligation.get("match"), "condition_states": {condition: desired},
                        "issues": obligation.get("issues", []),
                    }, "Condition", model=model))
            if summary.get("issues"):
                items.append(normalize_item({
                    "id": f"{op_id}_analysis", "model": model, "block_path": operator.get("block_path"),
                    "sid": operator.get("sid"), "status": "unsupported", "reason": "; ".join(summary["issues"]),
                }, "MCDC", model=model))
            for planned_item in items[operator_start:]:
                planned_item["planningTier"] = planning_tier
    if probe_payload:
        for item in items:
            evidence = probe_payload.get(model, probe_payload).get("observations", []) if isinstance(probe_payload.get(model, probe_payload), dict) else []
            item["simulation_evidence"]["observation_count"] = len(evidence) if isinstance(evidence, list) else 0
    # Probe-derived obligations carry the only trustworthy temporal stimulus and
    # are therefore allowed to replace structural planning items with the same
    # identity. Unsupported/unresolved items are retained verbatim as evidence.
    if evidence_obligations:
        raw_items = evidence_obligations.get("obligations", evidence_obligations)
        if isinstance(raw_items, list):
            for obligation in raw_items:
                if isinstance(obligation, dict):
                    items.append(normalize_item(obligation, str(obligation.get("coverage_class") or "MCDC"), model=model))
    # Stable ID ordering makes output independent of traversal/dict order.
    unique = {item["id"]: item for item in items}
    values = [unique[key] for key in sorted(unique)]
    status_summary = {
        status: sum(item["reachability"]["status"] == status for item in values)
        for status in sorted(VALID_STATUS)
    }
    executable = [
        item for item in values
        if item["reachability"]["status"] == "required"
        and (
            item["controller"]["direct_inputs"]
            or item["controller"]["parameters"]
            or item["stimulus"]["steps"]
        )
    ]
    issue_text = {
        item["id"]: " ".join(str(value) for value in item["reachability"].get("issues", []))
        for item in values
    }
    readiness = {
        "totalTargetCount": len(values),
        "executableTargetCount": len(executable),
        "missingRootControlPathCount": sum(
            item["reachability"]["status"] == "unresolved"
            and any(token in issue_text[item["id"]].lower() for token in ("controller", "root input", "mapping"))
            for item in values
        ),
        "unresolvedThresholdCount": sum(
            item["reachability"]["status"] == "unresolved"
            and any(token in issue_text[item["id"]].lower() for token in ("threshold", "constant value", "resolved"))
            for item in values
        ),
        "temporalStateTargetCount": sum(
            contains_temporal_trace(port.get("trace"))
            for report in reports
            for operator in planner.operator_records(report)
            if isinstance(operator, dict)
            for port in operator.get("ports", [])
            if isinstance(port, dict)
        ),
        "unsupportedTargetCount": status_summary.get("unsupported", 0),
    }
    return {
        "schema": SCHEMA,
        "model": model,
        "items": values,
        "summary": {**status_summary, "executionReadiness": readiness},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logical-traces", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--probe-results")
    parser.add_argument("--obligations", help="probe or coverage-report-derived obligations to merge into the IR")
    parser.add_argument("--include-nested-operators", action="store_true")
    args = parser.parse_args()
    try:
        trace_path = Path(args.logical_traces)
        if not trace_path.is_file():
            return structured_error("coverage_ir_traces_missing", f"logical traces file not found: {trace_path}")
        if trace_path.stat().st_size > MAX_TRACE_BYTES:
            return structured_error(
                "coverage_ir_traces_too_large",
                f"logical traces file exceeds the supported size ({trace_path.stat().st_size} > {MAX_TRACE_BYTES} bytes)",
            )
        trace_payload = load(trace_path)
        if not isinstance(trace_payload, dict):
            return structured_error("coverage_ir_traces_invalid", "logical traces must be a JSON object")
        obligations_payload = load(args.obligations) if args.obligations else None
        probe_payload = load(args.probe_results) if args.probe_results else None
        result = build_ir(
            trace_payload,
            probe_payload=probe_payload,
            evidence_obligations=obligations_payload,
            include_nested_operators=args.include_nested_operators,
        )
    except (KeyError, TypeError, ValueError, RecursionError, IndexError, MemoryError, OSError) as cause:
        return structured_error(
            "coverage_ir_build_failed",
            f"{type(cause).__name__}: {cause}",
        )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "items": len(result["items"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
