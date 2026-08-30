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
import re
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

    Prefer the authoritative ``selector_domain`` field emitted by
    build_decision_obligations (intersection over every MPS the input drives);
    fall back to aggregating ``<sid>_selector_<v>`` match values (union of the
    individually emitted legal values, kept only as a historical-data
    fallback). Root-input boundary recipes (relational false side,
    root_input_boundary) otherwise pick a purely mathematical value (x == 2
    false -> 3) that is out of the domain and aborts the simulation on the MPS
    (VehCfg_A01 Multiport Switch4 / ibsw_stREEVBatDrvRngCfg).
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
        match = obligation.get("match") if isinstance(obligation.get("match"), dict) else {}
        inputs = match.get("inputs")
        if not isinstance(inputs, dict):
            continue
        declared = obligation.get("selector_domain")
        if isinstance(declared, list) and declared:
            try:
                values = {int(value) for value in declared}
            except (TypeError, ValueError):
                continue
            for name in inputs:
                key = str(name)
                domains[key] = values if key not in domains else domains[key] & values
            continue
        if "_selector_" not in str(obligation.get("id") or ""):
            continue
        for name, value in inputs.items():
            try:
                value = int(value)
            except (TypeError, ValueError):
                continue
            key = str(name)
            if key not in domains:
                domains[key] = {value}
            else:
                domains[key].add(value)
    # An intersection that becomes empty is a *known* conflict (no value can
    # run every driven MPS simultaneously); keep it so callers mark items
    # unresolved instead of treating the input as unconstrained.
    return dict(domains)


RELATIONAL_OUTCOME_RE = re.compile(
    r"^relational (true|false) \(([A-Za-z_]\w*) ([<>=~!]+) ([-+]?\d+(?:\.\d+)?)\)$"
)


def _in_domain(operator: str, constant: float, domain: set[int], desired: bool) -> float | None:
    candidates = [
        value for value in domain
        if ((value > constant if operator == ">" else
             value >= constant if operator == ">=" else
             value < constant if operator == "<" else
             value <= constant if operator == "<=" else
             value == constant if operator == "==" else
             value != constant) == desired)
    ]
    if not candidates:
        return None
    return float(min(candidates, key=lambda value: (abs(value - constant), value)))


def resolve_in_selector_domain(item: dict[str, Any], domains: dict[str, set[int]]) -> list[dict[str, Any]]:
    """Resolve controller and temporal input values against known selector domains.

    Out-of-domain controller values are replaced with the nearest in-domain
    value that still satisfies the declared ``required_outcome`` (recorded as
    ``selector_domain_rechoice``). Temporal (stimulus) values are never
    rewritten in place -- changing them could destroy an edge/state transition
    -- so they only ever downgrade the item to unresolved. When the outcome
    cannot be satisfied inside the domain (or the domain is empty = no value
    runs every driven MPS), the item is marked unresolved with a
    ``selector_domain_constraint`` reason/issue (VehCfg_A01 regression:
    3 -> 1 for ``== 2 false``; ``<= 2 false`` has no in-domain solution).
    """
    adjusted: list[dict[str, Any]] = []
    if not domains:
        return adjusted
    match = RELATIONAL_OUTCOME_RE.match(str(item.get("required_outcome") or ""))
    controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
    direct = controller.get("direct_inputs") if isinstance(controller.get("direct_inputs"), dict) else {}

    def fail(name: str, value: float, reason_suffix: str) -> None:
        reach = item.setdefault("reachability", {})
        if reach.get("status") in ("required", "", None):
            reach["status"] = "unresolved"
        ordered = sorted(domains.get(str(name), set()))
        message = (
            f"selector_domain_constraint: {name}={value:g} 不在合法域 {ordered}"
            f"（{'域内无任何可同时驱动所有 MPS 的值' if not ordered else '无法在域内保持目标语义'}）：{reason_suffix}"
        )
        reach["reason"] = message
        issues = [str(issue) for issue in (reach.get("issues") or [])]
        issues.append(message)
        reach["issues"] = issues
        adjusted.append({"input": str(name), "was": value, "now": None, "reason": "selector_domain_constraint"})

    for container, mutate in ((direct, True),):
        for name, raw in list(container.items()):
            domain = domains.get(str(name))
            if domain is None:
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if value.is_integer() and int(value) in domain:
                continue
            chosen = None
            if match and match.group(2) == str(name):
                chosen = _in_domain(match.group(3), float(match.group(4)), domain, match.group(1) == "true")
            if chosen is not None and mutate:
                container[name] = chosen
                adjusted.append({"input": str(name), "was": value, "now": chosen, "reason": "selector_domain_rechoice"})
                continue
            fail(str(name), value, match.group(1) + " " + match.group(3) + " " + match.group(4) if match else "无法解析目标语义")
    # Temporal stimulus: do not rewrite values (edge/state semantics), only
    # guard against out-of-domain values reaching Stage 8 unchanged.
    stimulus = item.get("stimulus") if isinstance(item.get("stimulus"), dict) else {}
    for scope in ("initial_inputs",):
        container = stimulus.get(scope)
        if isinstance(container, dict):
            for name, raw in list(container.items()):
                domain = domains.get(str(name))
                if domain is None:
                    continue
                try:
                    value = float(raw)
                except (TypeError, ValueError):
                    continue
                if value.is_integer() and int(value) in domain:
                    continue
                fail(str(name), value, f"{scope} 时域值超出合法域（不改写以避免破坏边沿/状态转换）")
    for step in stimulus.get("steps") or []:
        if not isinstance(step, dict):
            continue
        updates = step.get("input_updates")
        if not isinstance(updates, dict):
            continue
        for name, raw in list(updates.items()):
            domain = domains.get(str(name))
            if domain is None:
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if value.is_integer() and int(value) in domain:
                continue
            fail(str(name), value, "step input_updates 超出合法域（不改写以避免破坏边沿/状态转换）")
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
        adjusted = resolve_in_selector_domain(item, domains)
        if adjusted:
            notes = item.setdefault("value_domain_notes", [])
            for entry in adjusted:
                notes.append(dict(entry))
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
