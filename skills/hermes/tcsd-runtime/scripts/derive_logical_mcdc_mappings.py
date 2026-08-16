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
    alternates: list[dict[str, Any]] = field(default_factory=list)
    ranges: list[tuple[str, str, float]] = field(default_factory=list)  # (input_name, u_op, constant)

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
    def combine(chosen: list[dict[str, Any]]) -> State:
        merged = State()
        for index, state in enumerate(states):
            merged.issues.extend(state.issues)
            for kind in ("inputs", "params"):
                target = getattr(merged, kind)
                for key, value in getattr(state, kind).items():
                    if key in target and not values_equal(target[key], value):
                        merged.issues.append(f"{where}: conflicting {kind} assignment for {key}")
                    else:
                        target[key] = value
        return merged

    base = combine([{} for _ in states])
    if not base.issues:
        return base
    # Conflict: try alternate boundary values per state (small cartesian
    # search) to satisfy the combined constraints, e.g. window comparators
    # where one side's boundary value must shift inside the other's range.
    import itertools
    alternate_sets = [state.alternates or [{}] for state in states]
    if max(len(alt) for alt in alternate_sets) <= 1:
        return base
    for combo in itertools.product(*alternate_sets):
        trial = combine(list(combo))
        if not trial.issues:
            return trial
    return base


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


def leaf_control(node: dict[str, Any]) -> tuple[str, Any] | None:
    """Resolve a trace leaf to ("input", name) / ("const", number) /
    ("param", name) or None when it is not statically controllable."""
    if not isinstance(node, dict):
        return None
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        name = str(node.get("signal") or node.get("name") or "").strip()
        return ("input", name) if name else None
    if kind == "constant":
        raw = str(node.get("value") or "").strip()
        resolved = parse_literal(node.get("resolvedValue"))
        if resolved is None:
            resolved = parse_literal(raw)
        if resolved is not None:
            return ("const", float(resolved))
        if IDENTIFIER_RE.match(raw):
            return ("param", raw)
        return None
    if kind in {"subsystem_inport", "subsystem_outport", "subsystem", "from", "goto"}:
        source = node.get("source")
        if isinstance(source, dict):
            return leaf_control(source)
        children = child_traces(node)
        if len(children) == 1:
            return leaf_control(children[0])
        return None
    return None


def relational_static_state(node: dict[str, Any], desired: bool, where: str) -> State:
    """Statically map a relational comparison whose operands resolve to a
    root input and a literal constant (or a parameter with a resolved
    default). Returns the boundary-value assignment for the desired outcome,
    or an issue state when the path is not statically controllable."""
    operator = str(node.get("operator") or "").strip()
    children = child_traces(node)
    if operator not in {"<", "<=", ">", ">=", "==", "~="} or len(children) != 2:
        return State(issues=[f"{where}: unsupported relational operator {operator!r}"])
    left = leaf_control(children[0])
    right = leaf_control(children[1])
    pairs = {
        ("<=", "input", "const"): (0, 1), ("<", "input", "const"): (-1, 0),
        (">=", "input", "const"): (0, -1), (">", "input", "const"): (1, 0),
        ("==", "input", "const"): (0, 1), ("~=", "input", "const"): (1, 0),
        ("<=", "const", "input"): (0, -1), ("<", "const", "input"): (1, 0),
        (">=", "const", "input"): (0, 1), (">", "const", "input"): (-1, 0),
        ("==", "const", "input"): (0, 1), ("~=", "const", "input"): (1, 0),
    }
    # 一 input 一 const（如 u <= R 或 R <= u）
    key = (operator, left[0] if left else "", right[0] if right else "")
    if key in pairs:
        true_delta, false_delta = pairs[key]
        delta = true_delta if desired else false_delta
        variable, fixed = (left, right) if left[0] == "input" else (right, left)
        name = variable[1]
        base_value = float(fixed[1]) + delta
        # Constraint ranges let vector merges solve combined intervals, e.g.
        # `u<=30` (true) together with `50<=u` (false) is satisfiable at any
        # u in (30, 50) even though the independent boundaries conflict.
        u_op_true, u_op_false = relational_ops(operator, key[1] == "input")
        range_op = u_op_true if desired else u_op_false
        candidates = [float(fixed[1]) + offset for offset in (-1.0, 0.0, 1.0)]
        alternates = [{name: value} for value in candidates if value != base_value]
        return State(inputs={name: base_value}, alternates=alternates,
                     ranges=[(name, range_op, float(fixed[1]))])
    if left and left[0] == "const" and right and right[0] == "const":
        return State(issues=[f"{where}: literal constants {left[1]} and {right[1]} leave no executable stimulus"])
    return State(issues=[f"{where}: dynamic relational path requires a probe or explicit override"])


def relational_ops(operator: str, input_is_left: bool) -> tuple[str, str]:
    """Map a relational operator to the u-side constraint operators for the
    desired true and false outcomes. Returns (op_true, op_false)."""
    if input_is_left:
        table = {
            "<=": ("<=", ">"), "<": ("<", ">="),
            ">=": (">=", "<"), ">": (">", "<="),
            "==": ("==", "~="), "~=": ("~=", "=="),
        }
    else:
        table = {
            "<=": (">=", "<"), "<": (">", "<="),
            ">=": ("<=", ">"), ">": ("<", ">="),
            "==": ("==", "~="), "~=": ("~=", "=="),
        }
    return table.get(operator, ("", ""))
    if left and left[0] == "const" and right and right[0] == "const":
        return State(issues=[f"{where}: literal constants {left[1]} and {right[1]} leave no executable stimulus"])
    return State(issues=[f"{where}: dynamic relational path requires a probe or explicit override"])


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

    if kind == "relational":
        return relational_static_state(node, desired, where)
    if kind in {"stateful", "switch", "minmax", "abs", "block"}:
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
                if true_state.alternates:
                    mapped_port["true_alternates"] = true_state.alternates
                if true_state.ranges:
                    mapped_port["true_ranges"] = [list(item) for item in true_state.ranges]
            if false_state.resolved:
                mapped_port["false_inputs"] = false_state.inputs
                mapped_port["false_params"] = false_state.params
                if false_state.alternates:
                    mapped_port["false_alternates"] = false_state.alternates
                if false_state.ranges:
                    mapped_port["false_ranges"] = [list(item) for item in false_state.ranges]
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
