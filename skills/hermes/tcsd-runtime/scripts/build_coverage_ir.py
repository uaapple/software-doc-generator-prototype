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
        "stimulus": norm_stimulus(item.get("stimulus")),
        "reachability": {"status": status, "reason": item.get("reason"), "issues": item.get("issues") or []},
        "simulation_evidence": evidence if isinstance(evidence, dict) else {},
        "source_obligation_id": item.get("id"),
    }


def selector_domains(decision_obligations: dict[str, Any] | None) -> dict[str, set[int]]:
    """Collect MPS selector value domains from decision obligations.

    Selector obligations are emitted as `<sid>_selector_<v>` with a single
    numeric match input; together they define the legal selector domain of a
    root input (e.g. ibsw_stREEVBatDrvRngCfg -> {0,1,2}). Root-input boundary
    recipes (relational false side, root_input_boundary) otherwise pick a
    purely mathematical value (x <= 2 false -> 3) that is out of the domain
    and aborts the simulation on the MPS (VehCfg_A01 Multiport Switch4).
    """
    domains: dict[str, set[int]] = {}
    if not decision_obligations:
        return domains
    raw = decision_obligations.get("obligations", decision_obligations)
    if not isinstance(raw, list):
        return domains
    for obligation in raw:
        if not isinstance(obligation, dict):
            continue
        if "_selector_" not in str(obligation.get("id") or ""):
            continue
        match = obligation.get("match") if isinstance(obligation.get("match"), dict) else {}
        inputs = match.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for name, value in inputs.items():
            try:
                value = int(value)
            except (TypeError, ValueError):
                continue
            domains.setdefault(str(name), set()).add(value)
    return {name: values for name, values in domains.items() if values}


def clamp_to_selector_domains(item: dict[str, Any], domains: dict[str, set[int]]) -> list[dict[str, Any]]:
    """Clamp controller/stimulus input values into known selector domains.

    Returns the list of adjusted entries (input, was, now) so the IR stays
    transparent about the fix; an empty list means nothing was adjusted.
    """
    adjusted: list[dict[str, Any]] = []
    if not domains:
        return adjusted

    def fix(values: dict[str, Any]) -> dict[str, Any]:
        for name, raw in list(values.items()):
            domain = domains.get(str(name))
            if not domain:
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if value.is_integer() and int(value) in domain:
                continue
            ordered = sorted(domain)
            nearest = min(ordered, key=lambda candidate: (abs(candidate - value), candidate))
            adjusted.append({"input": str(name), "was": value, "now": nearest})
            values[name] = nearest
        return values

    controller = item.get("controller")
    if isinstance(controller, dict) and isinstance(controller.get("direct_inputs"), dict):
        controller["direct_inputs"] = fix(controller["direct_inputs"])
    stimulus = item.get("stimulus")
    if isinstance(stimulus, dict):
        if isinstance(stimulus.get("initial_inputs"), dict):
            stimulus["initial_inputs"] = fix(stimulus["initial_inputs"])
        for step in stimulus.get("steps") or []:
            if isinstance(step, dict) and isinstance(step.get("input_updates"), dict):
                step["input_updates"] = fix(step["input_updates"])
    return adjusted


def build_ir(
    trace_payload: dict[str, Any], *, probe_payload: dict[str, Any] | None = None,
    evidence_obligations: dict[str, Any] | None = None,
    decision_obligations: dict[str, Any] | None = None,
) -> dict[str, Any]:
    operators = trace_payload.get("operators")
    if isinstance(operators, dict):
        # MATLAB jsonencode emits a bare object for a single operator struct.
        trace_payload = {**trace_payload, "operators": [operators]}
    reports = [trace_payload] if isinstance(trace_payload.get("operators"), list) else [v for v in trace_payload.values() if isinstance(v, dict) and isinstance(v.get("operators"), list)]
    model = str(trace_payload.get("model") or (reports[0].get("model") if reports else ""))
    planner = planner_module()
    items: list[dict[str, Any]] = []
    for report in reports:
        for operator in planner.top_operators(report):
            op_id = str(operator.get("id") or operator.get("sid") or operator.get("block_path"))
            # A decision is always explicit even when detailed MCDC mapping is unsupported.
            items.append(normalize_item({
                "id": f"{op_id}_decision", "model": model, "block_path": operator.get("block_path"),
                "sid": operator.get("sid") or op_id, "required_outcome": "logical output true and false",
                "status": "required", "operator_inputs": {"operator": operator.get("operator")},
            }, "Decision", model=model))
            planned, summary = planner.build_for_operator(model, operator)
            for obligation in planned:
                items.append(normalize_item(obligation, "MCDC", model=model))
                for condition, desired in (obligation.get("condition_states") or {}).items():
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
    if probe_payload:
        for item in items:
            evidence = probe_payload.get(model, probe_payload).get("observations", []) if isinstance(probe_payload.get(model, probe_payload), dict) else []
            item["simulation_evidence"]["observation_count"] = len(evidence) if isinstance(evidence, list) else 0
    # Probe-derived obligations carry the only trustworthy temporal stimulus and
    # are therefore allowed to replace structural planning items with the same
    # identity. Unsupported/unresolved items are retained verbatim as evidence.
    for extra in (evidence_obligations, decision_obligations):
        if not extra:
            continue
        raw_items = extra.get("obligations", extra)
        if isinstance(raw_items, list):
            for obligation in raw_items:
                if isinstance(obligation, dict):
                    items.append(normalize_item(obligation, str(obligation.get("coverage_class") or "MCDC"), model=model))
    # Stable ID ordering makes output independent of traversal/dict order.
    unique = {item["id"]: item for item in items}
    values = [unique[key] for key in sorted(unique)]
    # MPS selector inputs carry a legal value domain from decision
    # obligations; purely mathematical root-input boundary values (e.g. 3 for
    # "x <= 2 false") may fall outside it and abort the simulation. Clamp and
    # record transparency notes (VehCfg_A01 Multiport Switch4 regression).
    domains = selector_domains(decision_obligations)
    for item in values:
        adjusted = clamp_to_selector_domains(item, domains)
        if adjusted:
            notes = item.setdefault("value_domain_notes", [])
            for entry in adjusted:
                notes.append({**entry, "reason": "selector_domain_clamp"})
    return {"schema": SCHEMA, "model": model, "items": values, "summary": {status: sum(item["reachability"]["status"] == status for item in values) for status in sorted(VALID_STATUS)}}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logical-traces", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--probe-results")
    parser.add_argument("--obligations", help="probe or coverage-report-derived obligations to merge into the IR")
    parser.add_argument("--decision-obligations", help="simulink-ut-decision-obligations/v1 to merge into the IR")
    args = parser.parse_args()
    result = build_ir(
        load(args.logical_traces), probe_payload=load(args.probe_results) if args.probe_results else None,
        evidence_obligations=load(args.obligations) if args.obligations else None,
        decision_obligations=load(args.decision_obligations) if args.decision_obligations else None,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "items": len(result["items"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
