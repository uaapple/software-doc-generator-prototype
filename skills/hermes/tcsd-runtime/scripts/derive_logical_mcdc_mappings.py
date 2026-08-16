#!/usr/bin/env python3
"""Derive executable MC/DC port mappings from trace_logical_mcdc output.

The MATLAB tracer records a structural source tree. This adapter converts the
trace into the true_inputs/false_inputs and true_params/false_params schema
consumed by build_logical_mcdc_obligations.py. It deliberately leaves dynamic
or ambiguous paths unresolved so the MATLAB probe remains a hard fallback.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

IDENTIFIER_RE = re.compile(r"^[A-Za-z_]\w*$")


@dataclass
class State:
    inputs: dict[str, Any] = field(default_factory=dict)
    params: dict[str, Any] = field(default_factory=dict)
    issues: list[str] = field(default_factory=list)

    @property
    def resolved(self) -> bool:
        return not self.issues and bool(self.inputs or self.params)


def values_equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return left is right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isclose(float(left), float(right), rel_tol=0.0, abs_tol=1e-12)
    return left == right


def merge_states(states: list[State], where: str) -> State:
    merged = State()
    for state in states:
        merged.issues.extend(state.issues)
        for kind in ("inputs", "params"):
            target = getattr(merged, kind)
            for key, value in getattr(state, kind).items():
                if key in target and not values_equal(target[key], value):
                    merged.issues.append(f"{where}: conflicting {kind} assignment for {key}")
                else:
                    target[key] = value
    return merged


def child_traces(node: dict[str, Any]) -> list[dict[str, Any]]:
    children = node.get("inputs") or []
    if isinstance(children, dict):
        children = [children]
    result: list[dict[str, Any]] = []
    for child in children:
        if isinstance(child, dict):
            trace = child.get("trace") if isinstance(child.get("trace"), dict) else child
            result.append(trace)
    return result


def parse_literal(raw: Any) -> Any | None:
    text = str(raw or "").strip()
    if text.lower() in {"true", "on"}:
        return True
    if text.lower() in {"false", "off"}:
        return False
    try:
        return float(text)
    except ValueError:
        return None


def derive_state(node: dict[str, Any], desired: bool, where: str) -> State:
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        name = str(node.get("signal") or node.get("name") or "").strip()
        return State(inputs={name: int(desired)}) if name else State(issues=[f"{where}: unnamed root input"])

    if kind == "constant":
        value = str(node.get("value") or "").strip()
        literal = parse_literal(value)
        if literal is not None:
            actual = bool(literal)
            if actual == desired:
                return State(issues=[f"{where}: literal constant {value} has no executable stimulus"])
            return State(issues=[f"{where}: literal constant {value} cannot become {desired}"])
        if IDENTIFIER_RE.match(value):
            return State(params={value: int(desired)})
        return State(issues=[f"{where}: unresolved Constant value {value!r}"])

    if kind == "logic":
        operator = str(node.get("operator") or "").upper()
        children = child_traces(node)
        if operator == "NOT" and len(children) == 1:
            return derive_state(children[0], not desired, f"{where}/NOT")
        if operator not in {"AND", "OR"} or not children:
            return State(issues=[f"{where}: unsupported logical operator {operator!r}"])
        if (operator == "AND" and desired) or (operator == "OR" and not desired):
            child_desired = desired
            return merge_states(
                [derive_state(child, child_desired, f"{where}/{operator}[{index}]") for index, child in enumerate(children, 1)],
                where,
            )
        baseline = True if operator == "AND" else False
        for toggle_index, child in enumerate(children):
            states = []
            for index, candidate in enumerate(children):
                target = desired if index == toggle_index else baseline
                states.append(derive_state(candidate, target, f"{where}/{operator}[{index + 1}]"))
            merged = merge_states(states, where)
            if merged.resolved:
                return merged
        return State(issues=[f"{where}: no conflict-free {operator} mapping for output {desired}"])

    if kind in {"subsystem_inport", "subsystem_outport", "subsystem", "from", "goto"}:
        source = node.get("source")
        if isinstance(source, dict):
            return derive_state(source, desired, f"{where}/{kind}")
        children = child_traces(node)
        if len(children) == 1:
            return derive_state(children[0], desired, f"{where}/{kind}")

    if kind in {"relational", "stateful", "switch", "minmax", "abs", "block"}:
        return State(issues=[f"{where}: dynamic {kind} path requires a probe or explicit override"])
    return State(issues=[f"{where}: unsupported trace kind {kind!r}"])


def reports_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    operators = payload.get("operators")
    # MATLAB jsonencode emits a bare object for a single (or zero-element)
    # struct array; normalize both shapes back to a list before use.
    if isinstance(operators, dict):
        payload = {**payload, "operators": [operators]}
    if isinstance(payload.get("operators"), list):
        return [payload]
    return [value for value in payload.values() if isinstance(value, dict) and isinstance(value.get("operators"), list)]


def derive_report(report: dict[str, Any]) -> dict[str, Any]:
    operators = []
    for op_index, operator in enumerate(report.get("operators", []), 1):
        if not isinstance(operator, dict):
            continue
        mapped = {
            "id": operator.get("id") or operator.get("sid") or f"LOGIC_{op_index:03d}",
            "block_path": operator.get("block_path"),
            "sid": operator.get("sid"),
            "operator": operator.get("operator"),
            "ports": [],
        }
        for port in operator.get("ports", []):
            if not isinstance(port, dict):
                continue
            index = int(port.get("index") or len(mapped["ports"]) + 1)
            trace = port.get("trace") if isinstance(port.get("trace"), dict) else {}
            true_state = derive_state(trace, True, f"{mapped['id']}.port{index}.true")
            false_state = derive_state(trace, False, f"{mapped['id']}.port{index}.false")
            mapped_port: dict[str, Any] = {"index": index, "source_trace": trace}
            if true_state.resolved:
                mapped_port["true_inputs"] = true_state.inputs
                mapped_port["true_params"] = true_state.params
            if false_state.resolved:
                mapped_port["false_inputs"] = false_state.inputs
                mapped_port["false_params"] = false_state.params
            issues = true_state.issues + false_state.issues
            if issues:
                mapped_port["mapping_issues"] = issues
            mapped["ports"].append(mapped_port)
        operators.append(mapped)
    return {
        "schema": "simulink-ut-logical-mcdc-mapping/v1",
        "model": report.get("model"),
        "operators": operators,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--traces", required=True, help="trace_logical_mcdc JSON output")
    parser.add_argument("--output", required=True, help="derived logical-operator mapping JSON")
    args = parser.parse_args()
    payload = json.loads(Path(args.traces).read_text(encoding="utf-8"))
    reports = reports_from_payload(payload)
    if not reports:
        raise SystemExit("trace JSON does not contain a logical operator report")
    if len(reports) != 1:
        raise SystemExit("trace JSON contains multiple models; pass a model-specific trace file")
    result = derive_report(reports[0])
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    unresolved_ports = sum(
        1
        for operator in result["operators"]
        for port in operator["ports"]
        if port.get("mapping_issues")
    )
    print(json.dumps({"output": str(out), "operator_count": len(result["operators"]), "unresolved_ports": unresolved_ports}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
