#!/usr/bin/env python3
"""Build Logical Operator MC/DC obligations from a traceability spec.

The input spec is intentionally simple so an agent can write it after SATK/model
inspection. Each Logical Operator port must say which root inputs or scalar
parameters make that operator input true and false. This script expands those
port facts into the default MC/DC vectors:

- OR: all-false baseline plus one single-true vector per input port.
- AND: all-true baseline plus one single-false vector per input port.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


SCHEMA = "simulink-ut-logical-mcdc-obligations/v1"
INDEXED_KEY_REPLACEMENTS = ("[", "]")


def as_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    items = (
        data.get("operators")
        or data.get("logical_operators")
        or data.get("logicalOperators")
        or []
    )
    if not isinstance(items, list):
        raise ValueError("logical operator spec must contain an operators list")
    return [item for item in items if isinstance(item, dict)]


def values_equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return left is right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isclose(float(left), float(right), rel_tol=0.0, abs_tol=1e-12)
    return left == right


def normalize_key(raw_key: str) -> str:
    key = str(raw_key).strip()
    if not key:
        return key
    if "[" in key and key.endswith("]"):
        base, index = key[:-1].split("[", 1)
        return f"{base.strip()}[{index.strip()}]"
    parts = key.split()
    if len(parts) == 2 and parts[1].isdigit():
        return f"{parts[0]}[{parts[1]}]"
    return key


def normalize_value_map(value_map: Any) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    if not isinstance(value_map, dict):
        return normalized
    for raw_key, raw_value in value_map.items():
        key = normalize_key(str(raw_key))
        if isinstance(raw_value, list):
            for index, item in enumerate(raw_value, start=1):
                normalized[f"{key}[{index}]"] = item
        elif isinstance(raw_value, dict) and raw_value and all(str(k).isdigit() for k in raw_value):
            for raw_index, item in raw_value.items():
                normalized[f"{key}[{raw_index}]"] = item
        else:
            normalized[key] = raw_value
    return normalized


def combine_maps(
    left: dict[str, Any],
    right: dict[str, Any],
    *,
    conflict_prefix: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    combined = dict(left)
    conflicts: list[dict[str, Any]] = []
    for key, value in right.items():
        if key in combined and not values_equal(combined[key], value):
            conflicts.append(
                {
                    "code": "conflicting_assignment",
                    "where": conflict_prefix,
                    "key": key,
                    "left": combined[key],
                    "right": value,
                }
            )
            continue
        combined[key] = value
    return combined, conflicts


def state_from_container(container: dict[str, Any], prefix: str = "") -> tuple[dict[str, Any], dict[str, Any]]:
    if prefix:
        nested = container.get(prefix) or {}
        inputs = nested.get("inputs", {}) if isinstance(nested, dict) else {}
        params = nested.get("params", {}) if isinstance(nested, dict) else {}
        inputs = inputs or container.get(f"{prefix}_inputs", {}) or container.get(f"{prefix}_assignments", {})
        params = params or container.get(f"{prefix}_params", {}) or container.get(f"{prefix}_parameters", {})
    else:
        inputs = (
            container.get("inputs")
            or container.get("expected_inputs")
            or container.get("assignments")
            or container.get("common_inputs")
            or {}
        )
        params = (
            container.get("params")
            or container.get("parameters")
            or container.get("expected_params")
            or container.get("common_params")
            or {}
        )
    return normalize_value_map(inputs), normalize_value_map(params)


def merge_states(
    base_inputs: dict[str, Any],
    base_params: dict[str, Any],
    next_inputs: dict[str, Any],
    next_params: dict[str, Any],
    *,
    where: str,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    inputs, input_conflicts = combine_maps(base_inputs, next_inputs, conflict_prefix=f"{where}.inputs")
    params, param_conflicts = combine_maps(base_params, next_params, conflict_prefix=f"{where}.params")
    return inputs, params, input_conflicts + param_conflicts


def port_state(port: dict[str, Any], desired: bool) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    label = "true" if desired else "false"
    inputs, params = state_from_container(port, label)
    missing: list[dict[str, Any]] = []
    if not inputs and not params:
        missing.append(
            {
                "code": "missing_port_mapping",
                "port": port.get("index"),
                "desired": label,
                "message": f"port lacks {label}_inputs/{label}_params mapping",
            }
        )
    return inputs, params, missing


def operator_id(operator: dict[str, Any], index: int) -> str:
    return str(operator.get("id") or operator.get("name") or operator.get("sid") or f"LOGIC_{index:03d}")


def normalize_operator_kind(raw: Any) -> str:
    text = str(raw or "").strip().upper()
    if text in {"AND", "OR"}:
        return text
    return text


def make_required_vector(operator_kind: str, port_count: int, toggle_index: int | None) -> dict[int, bool]:
    if operator_kind == "OR":
        vector = {idx: False for idx in range(1, port_count + 1)}
        if toggle_index is not None:
            vector[toggle_index] = True
        return vector
    vector = {idx: True for idx in range(1, port_count + 1)}
    if toggle_index is not None:
        vector[toggle_index] = False
    return vector


def vector_label(operator_kind: str, vector: dict[int, bool]) -> str:
    letters = "".join("T" if vector[idx] else "F" for idx in sorted(vector))
    if operator_kind == "OR" and set(vector.values()) == {False}:
        return "baseline_all_false"
    if operator_kind == "AND" and set(vector.values()) == {True}:
        return "baseline_all_true"
    return f"vector_{letters}"


def output_for_vector(operator_kind: str, vector: dict[int, bool]) -> bool:
    values = list(vector.values())
    return any(values) if operator_kind == "OR" else all(values)


def build_obligation(
    *,
    model: str | None,
    operator: dict[str, Any],
    operator_index: int,
    operator_kind: str,
    ports: list[dict[str, Any]],
    vector: dict[int, bool],
) -> dict[str, Any]:
    op_id = operator_id(operator, operator_index)
    label = vector_label(operator_kind, vector)
    common_inputs, common_params = state_from_container(operator)
    match_inputs = dict(common_inputs)
    match_params = dict(common_params)
    issues: list[dict[str, Any]] = []
    port_facts: list[dict[str, Any]] = []

    for idx, desired in vector.items():
        port = ports[idx - 1]
        inputs, params, missing = port_state(port, desired)
        issues.extend(missing)
        match_inputs, match_params, conflicts = merge_states(
            match_inputs,
            match_params,
            inputs,
            params,
            where=f"{op_id}.port{idx}",
        )
        issues.extend(conflicts)
        port_facts.append(
            {
                "index": idx,
                "name": port.get("name"),
                "source": port.get("source"),
                "desired_value": desired,
            }
        )

    status = "required" if not issues else "unresolved"
    return {
        "id": f"{op_id}_{label}",
        "model": model,
        "block_path": operator.get("block_path") or operator.get("path"),
        "sid": operator.get("sid"),
        "operator": operator_kind,
        "coverage_class": "MCDC",
        "status": status,
        "required_outcome": f"operator_input_vector={''.join('T' if vector[i] else 'F' for i in sorted(vector))}; output={output_for_vector(operator_kind, vector)}",
        "operator_inputs": {str(idx): value for idx, value in vector.items()},
        "source_ports": port_facts,
        "match": {
            "inputs": match_inputs,
            "params": match_params,
        },
        "evidence_state": "needs_workbook_mapping" if status == "required" else "needs_manual_resolution",
        "issues": issues,
    }


def build_obligations(data: dict[str, Any]) -> dict[str, Any]:
    model = data.get("model") or data.get("model_name")
    obligations: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for operator_index, operator in enumerate(as_items(data), start=1):
        operator_kind = normalize_operator_kind(operator.get("operator") or operator.get("operator_type"))
        if operator_kind not in {"AND", "OR"}:
            skipped.append(
                {
                    "id": operator_id(operator, operator_index),
                    "code": "unsupported_operator",
                    "operator": operator_kind,
                }
            )
            continue
        ports = operator.get("ports") or operator.get("inputs") or []
        if not isinstance(ports, list) or not ports:
            skipped.append(
                {
                    "id": operator_id(operator, operator_index),
                    "code": "missing_ports",
                    "operator": operator_kind,
                }
            )
            continue
        normalized_ports = [port if isinstance(port, dict) else {"source": str(port)} for port in ports]
        for idx, port in enumerate(normalized_ports, start=1):
            port.setdefault("index", idx)

        vector_specs = [make_required_vector(operator_kind, len(normalized_ports), None)]
        for idx in range(1, len(normalized_ports) + 1):
            vector_specs.append(make_required_vector(operator_kind, len(normalized_ports), idx))
        for vector in vector_specs:
            obligations.append(
                build_obligation(
                    model=model,
                    operator=operator,
                    operator_index=operator_index,
                    operator_kind=operator_kind,
                    ports=normalized_ports,
                    vector=vector,
                )
            )

    required_count = sum(1 for item in obligations if item.get("status") == "required")
    unresolved_count = sum(1 for item in obligations if item.get("status") == "unresolved")
    return {
        "schema": SCHEMA,
        "model": model,
        "summary": {
            "operator_count": len(as_items(data)),
            "obligation_count": len(obligations),
            "required_count": required_count,
            "unresolved_count": unresolved_count,
            "skipped_count": len(skipped),
        },
        "obligations": obligations,
        "skipped": skipped,
    }


def print_report(report: dict[str, Any]) -> None:
    summary = report.get("summary", {})
    print(
        "Logical MC/DC obligations built: "
        f"{summary.get('required_count', 0)} required, "
        f"{summary.get('unresolved_count', 0)} unresolved, "
        f"{summary.get('skipped_count', 0)} skipped."
    )
    unresolved = [item for item in report.get("obligations", []) if item.get("status") == "unresolved"]
    for item in unresolved[:20]:
        print(f"- unresolved {item.get('id')}: {item.get('block_path')}", file=sys.stderr)
        for issue in item.get("issues", []):
            print(f"  {issue.get('code')}: {issue}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logical-operators", required=True, help="JSON spec with Logical Operator port mappings")
    parser.add_argument("--output", required=True, help="Output coverage_obligations.json path")
    parser.add_argument(
        "--allow-unresolved",
        action="store_true",
        help="Write unresolved obligations and return success; default returns failure so gaps are repaired or waived explicitly.",
    )
    args = parser.parse_args()

    data = json.loads(Path(args.logical_operators).read_text(encoding="utf-8"))
    report = build_obligations(data)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print_report(report)
    unresolved_count = report.get("summary", {}).get("unresolved_count", 0)
    return 0 if args.allow_unresolved or unresolved_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
