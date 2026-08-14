#!/usr/bin/env python3
"""Build bounded executable probe cases for unresolved state/timing conditions."""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

IDENTIFIER_RE = re.compile(r"^[A-Za-z_]\w*$")
DEFAULT_HOLDS = (0.1, 1.0, 5.0)
DEFAULT_MAX_CANDIDATES_PER_TARGET = 8
DEFAULT_MAX_TOTAL_CANDIDATES = 384
TEST_FIELDS = {
    "row", "test_id", "init_values", "init_params", "steps", "evidence_step", "target",
}
TARGET_FIELDS = {
    "operator_id", "port_index", "pattern_type", "control_input",
    "control_transition", "expected_target_transition", "hold_s",
}
STEP_FIELDS = {"index", "delay_s", "input_updates", "param_updates"}


@dataclass
class Dependencies:
    inputs: set[str] = field(default_factory=set)
    params: dict[str, Any] = field(default_factory=dict)
    temporal_thresholds: list[float] = field(default_factory=list)
    value_thresholds: list[float] = field(default_factory=list)
    stateful: bool = False
    unsupported: set[str] = field(default_factory=set)

    def merge(self, other: "Dependencies") -> None:
        self.inputs.update(other.inputs)
        self.params.update(other.params)
        self.temporal_thresholds.extend(other.temporal_thresholds)
        self.value_thresholds.extend(other.value_thresholds)
        self.stateful = self.stateful or other.stateful
        self.unsupported.update(other.unsupported)


def child_traces(node: dict[str, Any]) -> list[dict[str, Any]]:
    children = node.get("inputs") or []
    if isinstance(children, dict):
        children = [children]
    return [
        child.get("trace") if isinstance(child.get("trace"), dict) else child
        for child in children
        if isinstance(child, dict)
    ]


def numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, dict) and "value" in value:
        return numeric(value["value"])
    try:
        result = float(str(value).strip())
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def temporal_constant(node: dict[str, Any]) -> bool:
    labels = " ".join(
        str(node.get(key) or "")
        for key in ("name", "value", "semantic", "blockType", "maskType", "referenceBlock")
    ).lower()
    compact = re.sub(r"[^a-z0-9]+", "", labels)
    return any(token in compact for token in (
        "delay", "dly", "timer", "duration", "debounce", "holdtime", "waittime", "turnon", "turnoff"
    )) or bool(re.search(r"(?:^|_)ti(?:_|$)|ti_c$", labels))


def collect_dependencies(node: dict[str, Any]) -> Dependencies:
    result = Dependencies()
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        name = str(node.get("signal") or node.get("name") or "").strip()
        if name:
            result.inputs.add(name)
        return result
    if kind == "constant":
        raw = str(node.get("value") or "").strip()
        resolved = numeric(node.get("resolvedValue"))
        if resolved is None:
            resolved = numeric(raw)
        if resolved is not None:
            if temporal_constant(node):
                result.temporal_thresholds.append(resolved)
            else:
                result.value_thresholds.append(resolved)
        if IDENTIFIER_RE.match(raw) and numeric(raw) is None:
            result.params[raw] = node.get("resolvedValue")
        return result
    if kind == "stateful":
        result.stateful = True
    supported = {
        "relational", "stateful", "switch", "minmax", "abs", "block", "logic",
        "subsystem_inport", "subsystem_outport", "subsystem", "from", "goto",
        "constant", "root_inport", "outport", "datatypeconversion",
    }
    if kind and kind not in supported:
        result.unsupported.add(kind)
    source = node.get("source")
    if isinstance(source, dict):
        result.merge(collect_dependencies(source))
    for child in child_traces(node):
        result.merge(collect_dependencies(child))
    return result


def static_state(node: dict[str, Any], desired: bool) -> tuple[dict[str, Any], dict[str, Any], bool]:
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        name = str(node.get("signal") or node.get("name") or "").strip()
        return ({name: int(desired)}, {}, bool(name))
    if kind == "constant":
        raw = str(node.get("value") or "").strip()
        if IDENTIFIER_RE.match(raw) and numeric(raw) is None:
            return ({}, {raw: int(desired)}, True)
        return ({}, {}, False)
    if kind == "logic":
        operator = str(node.get("operator") or "").upper()
        children = child_traces(node)
        if operator == "NOT" and len(children) == 1:
            return static_state(children[0], not desired)
        if operator in {"AND", "OR"} and children:
            child_target = desired if (operator == "AND" and desired) or (operator == "OR" and not desired) else (operator == "OR")
            inputs: dict[str, Any] = {}
            params: dict[str, Any] = {}
            for child in children:
                child_inputs, child_params, ok = static_state(child, child_target)
                if not ok:
                    return {}, {}, False
                if any(key in inputs and inputs[key] != value for key, value in child_inputs.items()):
                    return {}, {}, False
                if any(key in params and params[key] != value for key, value in child_params.items()):
                    return {}, {}, False
                inputs.update(child_inputs)
                params.update(child_params)
            return inputs, params, True
    source = node.get("source")
    if isinstance(source, dict):
        return static_state(source, desired)
    children = child_traces(node)
    if len(children) == 1 and kind in {"subsystem_inport", "subsystem_outport", "subsystem", "from", "goto", "datatypeconversion"}:
        return static_state(children[0], desired)
    return {}, {}, False


def reports(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload.get("operators"), list):
        return [payload]
    return [item for item in payload.values() if isinstance(item, dict) and isinstance(item.get("operators"), list)]


def hold_candidates(deps: Dependencies, sample_time: float) -> list[float]:
    margin = max(2.0 * sample_time, 0.02)
    thresholds = sorted({value for value in deps.temporal_thresholds if value > 0})
    if not thresholds:
        return [round(max(sample_time, value), 9) for value in DEFAULT_HOLDS]
    primary = min(60.0, max(thresholds) + margin)
    values = [primary]
    for threshold in reversed(thresholds):
        if threshold > 0:
            values.extend([threshold + margin, max(sample_time, threshold - margin)])
    result: list[float] = []
    for value in values:
        normalized = round(min(max(value, sample_time), 60.0), 9)
        if normalized not in result:
            result.append(normalized)
    return result


def potential_impact_counts(coverage_ir: dict[str, Any] | None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in (coverage_ir or {}).get("items", []):
        if not isinstance(item, dict):
            continue
        reachability = item.get("reachability") if isinstance(item.get("reachability"), dict) else {}
        if reachability.get("status") in {"unsupported", "unreachable"}:
            continue
        block = item.get("block") if isinstance(item.get("block"), dict) else {}
        operator_id = str(block.get("sid") or item.get("operator_id") or "").strip()
        if operator_id:
            counts[operator_id] = counts.get(operator_id, 0) + 1
    return counts


def priority_record(
    *, operator_id: str, deps: Dependencies, pattern: str, impact_counts: dict[str, int]
) -> dict[str, Any]:
    impact = int(impact_counts.get(operator_id, 0))
    unique_path = len(deps.inputs) == 1
    threshold_known = bool(deps.temporal_thresholds)
    value_threshold_known = bool(deps.value_thresholds)
    if not deps.unsupported and (pattern or threshold_known) and unique_path:
        confidence = "high"
    elif not deps.unsupported and (pattern or threshold_known or deps.stateful):
        confidence = "medium"
    else:
        confidence = "low"
    score = impact * 100 + (20 if unique_path else 0) + (10 if threshold_known else 0) + (5 if pattern else 0)
    return {
        "potential_impact_count": impact,
        "unique_control_path": unique_path,
        "temporal_threshold_known": threshold_known,
        "value_threshold_known": value_threshold_known,
        "derivation_confidence": confidence,
        "priority_score": score,
    }


def generic_steps(
    *, control: str, end: float, hold: float, sample_time: float
) -> list[dict[str, Any]]:
    return [
        {"index": 1, "delay_s": sample_time, "input_updates": {}, "param_updates": {}},
        {"index": 2, "delay_s": sample_time, "input_updates": {control: end}, "param_updates": {}},
        {"index": 3, "delay_s": hold, "input_updates": {}, "param_updates": {}},
    ]


def stimulus_transitions(deps: Dependencies) -> list[tuple[float, float]]:
    thresholds = sorted({value for value in deps.value_thresholds if math.isfinite(value)})
    if not thresholds:
        return [(0, 1), (1, 0)]
    scale = max(1.0, max(abs(value) for value in thresholds))
    margin = max(1.0, scale * 0.05)
    values: list[float] = [0.0]
    for threshold in thresholds:
        values.extend([threshold + margin, threshold - margin])
    normalized: list[float] = []
    for value in values:
        candidate = round(value, 9)
        if candidate not in normalized:
            normalized.append(candidate)
    transitions: list[tuple[float, float]] = []
    for end in normalized[1:]:
        transitions.append((0.0, end))
        transitions.append((end, 0.0))
    return transitions or [(0, 1), (1, 0)]


def trace_value(
    node: dict[str, Any],
    *,
    inputs: dict[str, Any],
    params: dict[str, Any],
    settled: bool,
) -> Any:
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        return inputs.get(str(node.get("signal") or node.get("name") or "").strip())
    if kind == "constant":
        raw = str(node.get("value") or "").strip()
        return params.get(raw, node.get("resolvedValue", numeric(raw)))
    if kind == "stateful":
        if not settled:
            return numeric(node.get("resolvedInitialCondition", node.get("initialCondition")))
        children = child_traces(node)
        return trace_value(children[0], inputs=inputs, params=params, settled=settled) if children else None
    source = node.get("source")
    if isinstance(source, dict) and kind in {
        "subsystem_inport", "subsystem_outport", "subsystem", "from", "goto", "datatypeconversion"
    }:
        return trace_value(source, inputs=inputs, params=params, settled=settled)
    children = child_traces(node)
    values = [trace_value(child, inputs=inputs, params=params, settled=settled) for child in children]
    if any(value is None for value in values):
        return None
    if kind == "abs" and len(values) == 1:
        return abs(float(values[0]))
    if kind == "relational" and len(values) == 2:
        left, right = values
        return {
            ">": left > right,
            ">=": left >= right,
            "<": left < right,
            "<=": left <= right,
            "==": left == right,
            "~=": left != right,
            "!=": left != right,
        }.get(str(node.get("operator") or ""))
    if kind == "logic":
        operator = str(node.get("operator") or "").upper()
        if operator == "NOT" and len(values) == 1:
            return not bool(values[0])
        if operator == "AND":
            return all(bool(value) for value in values)
        if operator == "OR":
            return any(bool(value) for value in values)
    if kind == "switch" and len(values) >= 3:
        criteria = str(node.get("criteria") or "")
        threshold = numeric(node.get("resolvedThreshold", node.get("threshold"))) or 0
        control = float(values[1])
        selected = control != 0 if "~= 0" in criteria else control >= threshold
        return values[0] if selected else values[2]
    if kind == "block":
        semantic = str(node.get("semantic") or "").lower()
        block_type = str(node.get("blockType") or "").lower()
        if semantic == "sum" or block_type == "sum":
            signs = str((node.get("params") or {}).get("Inputs") or "+" * len(values))
            total = 0.0
            for index, value in enumerate(values):
                total += (-1 if index < len(signs) and signs[index] == "-" else 1) * float(value)
            return total
        if semantic == "product" or block_type == "product":
            modes = str((node.get("params") or {}).get("Inputs") or "*" * len(values))
            total = 1.0
            for index, value in enumerate(values):
                if index < len(modes) and modes[index] == "/":
                    if float(value) == 0:
                        return None
                    total /= float(value)
                else:
                    total *= float(value)
            return total
        if semantic == "datatypeconversion" and len(values) == 1:
            return values[0]
    if len(values) == 1 and kind in {"subsystem_inport", "subsystem_outport", "subsystem", "from", "goto", "datatypeconversion"}:
        return values[0]
    return None


def expected_target_transition(
    trace: dict[str, Any],
    *,
    initial_inputs: dict[str, Any],
    final_inputs: dict[str, Any],
    params: dict[str, Any],
) -> str:
    start = trace_value(trace, inputs=initial_inputs, params=params, settled=False)
    end = trace_value(trace, inputs=final_inputs, params=params, settled=True)
    if not isinstance(start, bool) and isinstance(start, (int, float)) and start in {0, 1}:
        start = bool(start)
    if not isinstance(end, bool) and isinstance(end, (int, float)) and end in {0, 1}:
        end = bool(end)
    if not isinstance(start, bool) or not isinstance(end, bool) or start == end:
        return ""
    return f"{int(start)}->{int(end)}"


def normalize_param_values(params: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, raw in params.items():
        value = numeric(raw)
        if value is not None:
            result[name] = int(value) if value.is_integer() else value
    return result


def edge_pattern(node: dict[str, Any]) -> str:
    labels = " ".join(
        str(node.get(key) or "")
        for key in ("name", "maskType", "referenceBlock", "semantic", "blockType")
    ).lower()
    compact = re.sub(r"[^a-z0-9]+", "", labels)
    rising_tokens = ("edgerising", "risingedge", "detectrise", "detectincrease")
    falling_tokens = ("edgefalling", "fallingedge", "detectfall", "detectdecrease")
    if any(token in compact for token in rising_tokens):
        return "rising-edge"
    if any(token in compact for token in falling_tokens):
        return "falling-edge"
    source = node.get("source")
    if isinstance(source, dict):
        detected = edge_pattern(source)
        if detected:
            return detected
    for child in child_traces(node):
        detected = edge_pattern(child)
        if detected:
            return detected
    return ""


def edge_steps(*, control: str, start: int, end: int, sample_time: float) -> list[dict[str, Any]]:
    return [
        {"index": 1, "delay_s": sample_time, "input_updates": {}, "param_updates": {}},
        {"index": 2, "delay_s": sample_time, "input_updates": {control: end}, "param_updates": {}},
        {"index": 3, "delay_s": sample_time, "input_updates": {}, "param_updates": {}},
        {"index": 4, "delay_s": sample_time, "input_updates": {control: start}, "param_updates": {}},
    ]


def joint_edge_steps(
    *, controls: list[str], start: int, end: int, sample_time: float
) -> list[dict[str, Any]]:
    return [
        {"index": 1, "delay_s": sample_time, "input_updates": {}, "param_updates": {}},
        {"index": 2, "delay_s": sample_time, "input_updates": {name: end for name in controls}, "param_updates": {}},
        {"index": 3, "delay_s": sample_time, "input_updates": {}, "param_updates": {}},
        {"index": 4, "delay_s": sample_time, "input_updates": {name: start for name in controls}, "param_updates": {}},
    ]


def validate_test_schema(tests: list[dict[str, Any]]) -> None:
    for index, test in enumerate(tests, start=1):
        fields = set(test)
        if fields != TEST_FIELDS:
            raise ValueError(
                f"state probe test {index} fields differ from the required schema: "
                f"missing={sorted(TEST_FIELDS - fields)}, extra={sorted(fields - TEST_FIELDS)}"
            )
        target = test.get("target")
        if not isinstance(target, dict):
            raise ValueError(f"state probe test {index} target must be an object")
        target_fields = set(target)
        if target_fields != TARGET_FIELDS:
            raise ValueError(
                f"state probe test {index} target fields differ from the required schema: "
                f"missing={sorted(TARGET_FIELDS - target_fields)}, "
                f"extra={sorted(target_fields - TARGET_FIELDS)}"
            )
        steps = test.get("steps")
        if not isinstance(steps, list) or not steps:
            raise ValueError(f"state probe test {index} steps must be a non-empty array")
        for step_index, step in enumerate(steps, start=1):
            if not isinstance(step, dict):
                raise ValueError(f"state probe test {index} step {step_index} must be an object")
            step_fields = set(step)
            if step_fields != STEP_FIELDS:
                raise ValueError(
                    f"state probe test {index} step {step_index} fields differ from the required schema: "
                    f"missing={sorted(STEP_FIELDS - step_fields)}, "
                    f"extra={sorted(step_fields - STEP_FIELDS)}"
                )


def limit_candidates(
    tests: list[dict[str, Any]],
    targets: list[dict[str, Any]],
    max_total_candidates: int,
) -> tuple[list[dict[str, Any]], int]:
    if len(tests) <= max_total_candidates:
        return tests, 0
    groups: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for test in tests:
        target = test.get("target") if isinstance(test.get("target"), dict) else {}
        key = (str(target.get("operator_id") or ""), int(target.get("port_index") or 0))
        groups.setdefault(key, []).append(test)
    selected: list[dict[str, Any]] = []
    depth = 0
    while len(selected) < max_total_candidates:
        added = False
        for values in groups.values():
            if depth < len(values):
                selected.append(values[depth])
                added = True
                if len(selected) >= max_total_candidates:
                    break
        if not added:
            break
        depth += 1
    selected_counts: dict[tuple[str, int], int] = {}
    for index, test in enumerate(selected, start=1):
        target = test["target"]
        key = (str(target.get("operator_id") or ""), int(target.get("port_index") or 0))
        selected_counts[key] = selected_counts.get(key, 0) + 1
        test["row"] = index
        test["test_id"] = f"STATE_PROBE_{index:04d}"
    for target in targets:
        key = (str(target.get("operator_id") or ""), int(target.get("port_index") or 0))
        original_count = int(target.get("candidate_count") or 0)
        retained_count = selected_counts.get(key, 0)
        target["candidate_count"] = retained_count
        if retained_count < original_count:
            target["bounded"] = True
            target["truncated_candidate_count"] = (
                int(target.get("truncated_candidate_count") or 0)
                + original_count
                - retained_count
            )
    return selected, len(tests) - len(selected)


def build_plan(
    report: dict[str, Any],
    max_candidates: int,
    sample_time: float,
    max_total_candidates: int = DEFAULT_MAX_TOTAL_CANDIDATES,
    coverage_ir: dict[str, Any] | None = None,
) -> dict[str, Any]:
    primary_tests: list[dict[str, Any]] = []
    backup_tests: list[dict[str, Any]] = []
    targets: list[dict[str, Any]] = []
    seen: set[str] = set()
    impact_counts = potential_impact_counts(coverage_ir)

    def append_candidates(target: dict[str, Any], candidates: list[dict[str, Any]]) -> None:
        if not candidates:
            target["status"] = "candidate_exhausted"
            targets.append(target)
            return
        candidates.sort(
            key=lambda candidate: (
                0 if str((candidate.get("target") or {}).get("expected_target_transition") or "") else 1,
            )
        )
        primary = candidates[0]
        strict_candidate_count = sum(
            1 for candidate in candidates
            if str((candidate.get("target") or {}).get("expected_target_transition") or "")
        )
        primary_is_strict = bool(str((primary.get("target") or {}).get("expected_target_transition") or ""))
        if strict_candidate_count and not primary_is_strict:
            raise ValueError(
                f"state probe target {target.get('operator_id')}#{target.get('port_index')} "
                "has a provable candidate but did not select it as primary"
            )
        primary["row"] = len(primary_tests) + 1
        primary["test_id"] = f"STATE_PROBE_PRIMARY_{len(primary_tests) + 1:04d}"
        primary_tests.append(primary)
        for candidate in candidates[1:max_candidates]:
            candidate["row"] = len(backup_tests) + 1
            candidate["test_id"] = f"STATE_PROBE_BACKUP_{len(backup_tests) + 1:04d}"
            backup_tests.append(candidate)
        target["candidate_count"] = 1
        target["primary_candidate_count"] = 1
        target["backup_candidate_count"] = min(max(0, len(candidates) - 1), max(0, max_candidates - 1))
        target["available_candidate_count"] = len(candidates)
        target["strict_candidate_count"] = strict_candidate_count
        target["primary_preflight_status"] = "strict" if primary_is_strict else "causal_only"
        target["causal_only_reason"] = (
            ""
            if primary_is_strict
            else (
                "unsupported_evaluator_structure"
                if target.get("value_threshold_known")
                else "missing_threshold_evidence"
            )
        )
        if len(candidates) > max_candidates:
            target["bounded"] = True
            target["truncated_candidate_count"] = len(candidates) - max_candidates
        targets.append(target)

    for operator in report.get("operators", []):
        if not isinstance(operator, dict):
            continue
        op_id = str(operator.get("id") or operator.get("sid") or operator.get("block_path") or "")
        op_kind = str(operator.get("operator") or "").upper()
        ports = [port for port in operator.get("ports", []) if isinstance(port, dict)]
        sensitized = True if op_kind == "AND" else False
        for port in ports:
            index = int(port.get("index") or 0)
            trace = port.get("trace") if isinstance(port.get("trace"), dict) else {}
            deps = collect_dependencies(trace)
            pattern = edge_pattern(trace)
            if not deps.stateful and not deps.unsupported and not pattern:
                continue
            sibling_inputs: dict[str, Any] = {}
            sibling_params: dict[str, Any] = {}
            for sibling in ports:
                if sibling is port:
                    continue
                sibling_trace = sibling.get("trace") if isinstance(sibling.get("trace"), dict) else {}
                inputs, params, ok = static_state(sibling_trace, sensitized)
                if ok:
                    sibling_inputs.update(inputs)
                    sibling_params.update(params)
            target = {
                "operator_id": op_id,
                "port_index": index,
                "stateful": deps.stateful,
                "root_inputs": sorted(deps.inputs),
                "parameters": sorted(deps.params),
                "unsupported_semantics": sorted(deps.unsupported),
                "pattern_type": pattern or "generic-state-timing",
                "candidate_count": 0,
                "status": "planned",
                **priority_record(
                    operator_id=op_id,
                    deps=deps,
                    pattern=pattern,
                    impact_counts=impact_counts,
                ),
            }
            if not deps.inputs:
                target["status"] = "unsupported_semantics" if deps.unsupported else "candidate_exhausted"
                targets.append(target)
                continue
            param_values = normalize_param_values(deps.params)
            candidates: list[dict[str, Any]] = []
            if pattern in {"rising-edge", "falling-edge"}:
                start, end = (0, 1) if pattern == "rising-edge" else (1, 0)
                controls = sorted(deps.inputs)
                if len(controls) > 1:
                    init_values = dict(sibling_inputs)
                    init_values.update({name: start for name in controls})
                    candidates.append({
                        "row": 0,
                        "test_id": "",
                        "init_values": init_values,
                        "init_params": {**sibling_params, **param_values},
                        "steps": joint_edge_steps(
                            controls=controls,
                            start=start,
                            end=end,
                            sample_time=sample_time,
                        ),
                        "evidence_step": 2,
                        "target": {
                            "operator_id": op_id,
                            "port_index": index,
                            "pattern_type": pattern,
                            "control_input": ",".join(controls),
                            "control_transition": f"all:{start}->{end}",
                            "expected_target_transition": "",
                            "hold_s": sample_time,
                        },
                    })
                for control in sorted(deps.inputs):
                    key = json.dumps([op_id, index, pattern, control, sibling_inputs, sibling_params, param_values], sort_keys=True)
                    if key in seen:
                        continue
                    seen.add(key)
                    init_values = dict(sibling_inputs)
                    init_values.update({name: 0 for name in deps.inputs})
                    init_values[control] = start
                    init_params = dict(sibling_params)
                    init_params.update(param_values)
                    final_inputs = dict(init_values)
                    final_inputs[control] = end
                    target_transition = expected_target_transition(
                        trace,
                        initial_inputs=init_values,
                        final_inputs=final_inputs,
                        params=init_params,
                    )
                    candidates.append(
                        {
                            "row": 0,
                            "test_id": "",
                            "init_values": init_values,
                            "init_params": init_params,
                            "steps": edge_steps(control=control, start=start, end=end, sample_time=sample_time),
                            "evidence_step": 2,
                            "target": {
                                "operator_id": op_id,
                                "port_index": index,
                                "pattern_type": pattern,
                                "control_input": control,
                                "control_transition": f"{start}->{end}",
                                "expected_target_transition": target_transition,
                                "hold_s": sample_time,
                            },
                        }
                    )
                append_candidates(target, candidates)
                continue
            holds = hold_candidates(deps, sample_time)
            controls = sorted(deps.inputs)
            for hold in holds:
                for context_value in (0, 1):
                    for control in controls:
                        for start, end in stimulus_transitions(deps):
                            key = json.dumps(
                                [op_id, index, context_value, control, start, end, hold,
                                 sibling_inputs, sibling_params, param_values],
                                sort_keys=True,
                            )
                            if key in seen:
                                continue
                            seen.add(key)
                            init_values = dict(sibling_inputs)
                            init_values.update({name: context_value for name in deps.inputs})
                            init_values[control] = start
                            init_params = dict(sibling_params)
                            init_params.update(param_values)
                            final_inputs = dict(init_values)
                            final_inputs[control] = end
                            expected_transition = expected_target_transition(
                                trace,
                                initial_inputs=init_values,
                                final_inputs=final_inputs,
                                params=init_params,
                            )
                            steps = generic_steps(
                                control=control,
                                end=end,
                                hold=hold,
                                sample_time=sample_time,
                            )
                            candidates.append({
                                "row": 0,
                                "test_id": "",
                                "init_values": init_values,
                                "init_params": init_params,
                                "steps": steps,
                                "evidence_step": 3,
                                "target": {
                                    "operator_id": op_id,
                                    "port_index": index,
                                    "pattern_type": "generic-state-timing",
                                    "control_input": control,
                                    "control_transition": f"{start}->{end}",
                                    "expected_target_transition": expected_transition,
                                    "hold_s": hold,
                                },
                            })
            append_candidates(target, candidates)
    # 每个可规划目标的主候选是最低保障，不能再被全局数量上限裁掉。
    # 全局上限只约束后续追加候选；主候选数量超过上限时如实记录扩容。
    required_primary_count = len(primary_tests)
    effective_primary_budget = max(max(1, max_total_candidates), required_primary_count)
    primary_tests, truncated_count = limit_candidates(
        primary_tests,
        targets,
        effective_primary_budget,
    )
    validate_test_schema(primary_tests)
    validate_test_schema(backup_tests)
    return {
        "schema": "simulink-ut-state-probe-plan/v1",
        "model": report.get("model"),
        "limits": {
            "max_candidates_per_port": max_candidates,
            "max_total_candidates": max(1, max_total_candidates),
            "effective_primary_budget": effective_primary_budget,
        },
        "targets": targets,
        "tests": primary_tests,
        "backup_tests": backup_tests,
        "summary": {
            "target_count": len(targets),
            "candidate_count": len(primary_tests),
            "primary_candidate_count": len(primary_tests),
            "backup_candidate_count": len(backup_tests),
            "truncated_candidate_count": sum(
                int(item.get("truncated_candidate_count") or 0)
                for item in targets
            ),
            "global_truncated_candidate_count": truncated_count,
            "primary_budget_expanded": required_primary_count > max(1, max_total_candidates),
            "unplanned_count": sum(1 for item in targets if item["status"] != "planned"),
            "strict_primary_count": sum(
                1 for item in targets if item.get("primary_preflight_status") == "strict"
            ),
            "causal_only_primary_count": sum(
                1 for item in targets if item.get("primary_preflight_status") == "causal_only"
            ),
            "preflight_failure_count": sum(
                1 for item in targets
                if int(item.get("strict_candidate_count") or 0) > 0
                and item.get("primary_preflight_status") != "strict"
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--traces", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--max-candidates-per-port",
        type=int,
        default=DEFAULT_MAX_CANDIDATES_PER_TARGET,
    )
    parser.add_argument(
        "--max-total-candidates",
        type=int,
        default=DEFAULT_MAX_TOTAL_CANDIDATES,
    )
    parser.add_argument("--sample-time", type=float, default=0.01)
    parser.add_argument("--coverage-ir", default="")
    args = parser.parse_args()
    payload = json.loads(Path(args.traces).read_text(encoding="utf-8"))
    items = reports(payload)
    if len(items) != 1:
        raise SystemExit("state probe planner requires one model-specific logical trace")
    plan = build_plan(
        items[0],
        max(1, args.max_candidates_per_port),
        max(1e-6, args.sample_time),
        max(1, args.max_total_candidates),
        json.loads(Path(args.coverage_ir).read_text(encoding="utf-8")) if args.coverage_ir else None,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **plan["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
