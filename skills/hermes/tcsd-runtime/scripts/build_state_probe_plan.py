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


@dataclass
class Dependencies:
    inputs: set[str] = field(default_factory=set)
    params: dict[str, Any] = field(default_factory=dict)
    thresholds: list[float] = field(default_factory=list)
    stateful: bool = False
    unsupported: set[str] = field(default_factory=set)

    def merge(self, other: "Dependencies") -> None:
        self.inputs.update(other.inputs)
        self.params.update(other.params)
        self.thresholds.extend(other.thresholds)
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
            result.thresholds.append(resolved)
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
    values = set(DEFAULT_HOLDS)
    margin = max(2.0 * sample_time, 0.02)
    for threshold in deps.thresholds:
        if threshold > 0:
            values.add(threshold + margin)
            values.add(max(sample_time, threshold - margin))
    return sorted(round(min(max(value, sample_time), 60.0), 9) for value in values if value > 0)


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


def build_plan(report: dict[str, Any], max_candidates: int, sample_time: float) -> dict[str, Any]:
    tests: list[dict[str, Any]] = []
    targets: list[dict[str, Any]] = []
    seen: set[str] = set()
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
            }
            if not deps.inputs:
                target["status"] = "unsupported_semantics" if deps.unsupported else "candidate_exhausted"
                targets.append(target)
                continue
            param_values = normalize_param_values(deps.params)
            if pattern in {"rising-edge", "falling-edge"}:
                start, end = (0, 1) if pattern == "rising-edge" else (1, 0)
                for control in sorted(deps.inputs):
                    if target["candidate_count"] >= max_candidates:
                        break
                    key = json.dumps([op_id, index, pattern, control, sibling_inputs, sibling_params, param_values], sort_keys=True)
                    if key in seen:
                        continue
                    seen.add(key)
                    init_values = dict(sibling_inputs)
                    init_values.update({name: 0 for name in deps.inputs})
                    init_values[control] = start
                    init_params = dict(sibling_params)
                    init_params.update(param_values)
                    test_id = f"STATE_PROBE_{len(tests) + 1:04d}"
                    tests.append(
                        {
                            "row": len(tests) + 1,
                            "test_id": test_id,
                            "init_values": init_values,
                            "init_params": init_params,
                            "steps": edge_steps(control=control, start=start, end=end, sample_time=sample_time),
                            "evidence_step": 2,
                            "target": {
                                "operator_id": op_id,
                                "port_index": index,
                                "pattern_type": pattern,
                                "control_input": control,
                                "transition": f"{start}->{end}",
                                "hold_s": sample_time,
                            },
                        }
                    )
                    target["candidate_count"] += 1
                if target["candidate_count"] >= max_candidates:
                    target["bounded"] = True
                if not target["candidate_count"]:
                    target["status"] = "candidate_exhausted"
                targets.append(target)
                continue
            holds = hold_candidates(deps, sample_time)
            for control in sorted(deps.inputs):
                for start, end in ((0, 1), (1, 0)):
                    for hold in holds:
                        if target["candidate_count"] >= max_candidates:
                            break
                        key = json.dumps([op_id, index, control, start, end, hold, sibling_inputs, sibling_params, param_values], sort_keys=True)
                        if key in seen:
                            continue
                        seen.add(key)
                        init_values = dict(sibling_inputs)
                        init_values.update({name: 0 for name in deps.inputs})
                        init_values[control] = start
                        init_params = dict(sibling_params)
                        init_params.update(param_values)
                        steps = [
                            {"index": 1, "delay_s": sample_time, "input_updates": {control: end}, "param_updates": {}},
                            {"index": 2, "delay_s": hold, "input_updates": {}, "param_updates": {}},
                        ]
                        test_id = f"STATE_PROBE_{len(tests) + 1:04d}"
                        tests.append(
                            {
                                "row": len(tests) + 1,
                                "test_id": test_id,
                                "init_values": init_values,
                                "init_params": init_params,
                                "steps": steps,
                                "target": {
                                    "operator_id": op_id,
                                    "port_index": index,
                                    "control_input": control,
                                    "transition": f"{start}->{end}",
                                    "hold_s": hold,
                                },
                            }
                        )
                        target["candidate_count"] += 1
                    if target["candidate_count"] >= max_candidates:
                        break
                if target["candidate_count"] >= max_candidates:
                    break
            if target["candidate_count"] >= max_candidates:
                target["bounded"] = True
            if not target["candidate_count"]:
                target["status"] = "candidate_exhausted"
            targets.append(target)
    return {
        "schema": "simulink-ut-state-probe-plan/v1",
        "model": report.get("model"),
        "limits": {"max_candidates_per_port": max_candidates},
        "targets": targets,
        "tests": tests,
        "summary": {
            "target_count": len(targets),
            "candidate_count": len(tests),
            "unplanned_count": sum(1 for item in targets if item["status"] != "planned"),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--traces", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-candidates-per-port", type=int, default=32)
    parser.add_argument("--sample-time", type=float, default=0.01)
    args = parser.parse_args()
    payload = json.loads(Path(args.traces).read_text(encoding="utf-8"))
    items = reports(payload)
    if len(items) != 1:
        raise SystemExit("state probe planner requires one model-specific logical trace")
    plan = build_plan(items[0], max(1, args.max_candidates_per_port), max(1e-6, args.sample_time))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **plan["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
