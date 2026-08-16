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


def port_state(port: dict[str, Any], desired: bool) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[tuple[str, str, float]]]:
    label = "true" if desired else "false"
    inputs, params = state_from_container(port, label)
    alternates = port.get(f"{label}_alternates") or []
    ranges: list[tuple[str, str, float]] = []
    for item in port.get(f"{label}_ranges") or []:
        if isinstance(item, list) and len(item) == 3:
            ranges.append((str(item[0]), str(item[1]), float(item[2])))
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
    return inputs, params, missing, alternates, ranges


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


# ── algebraic unreachability (strict implication between sibling ports) ──────
#
# When two AND/OR inputs compare the SAME signal with constants, one condition
# can strictly imply the other (e.g. (x>0.01) implies (x>0)). Then the implied
# (weaker) port's MC/DC independent-effect vector is algebraically impossible:
#   AND: strong port true forces weak port true  -> weak port (T,F) impossible
#   OR : weak port true forces strong port true  -> weak port (F,T) impossible
# Those vectors are marked `unreachable` at build time with algebraic evidence,
# so they never enter the required denominator and Stage 10 need not re-prove
# the same implication on every run (B04 RampLimiter2 AND(233,234) case).

IMPLY_OPS = {">", ">=", "<", "<=", "==", "~="}


def flip_op(op: str) -> str:
    return {"<": ">", ">": "<", "<=": ">=", ">=": "<=", "==": "==", "~=": "~="}.get(op, op)


def constant_value(trace: Any) -> float | None:
    """Numeric value of a Constant trace leaf, or None."""
    if not isinstance(trace, dict):
        return None
    if str(trace.get("kind") or "").lower() != "constant":
        return None
    for key in ("resolvedValue", "value", "resolved_value"):
        raw = trace.get(key)
        if raw is None:
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    return None


def resolve_constant(trace: Any, depth: int = 0) -> float | None:
    """Follow passthrough blocks, subsystem inports and From/Goto links to the
    underlying Constant value (B04 RampLimiter2: LimitUp -> Constant7 with
    resolvedValue 0.01). Returns None when the leaf is not a resolvable
    constant or the chain is too deep / cyclic."""
    if not isinstance(trace, dict) or depth > 8:
        return None
    kind = str(trace.get("kind") or "").lower()
    if kind == "constant":
        return constant_value(trace)
    if kind in ("subsystem_inport", "from"):
        return resolve_constant(trace.get("source"), depth + 1)
    if kind == "block":
        semantic = str(trace.get("semantic") or "").lower()
        if semantic in ("datatypeconversion", "signalconversion", "unitconversion",
                        "convert", "passthrough", "transfer"):
            inputs = trace.get("inputs")
            if isinstance(inputs, dict):
                return resolve_constant(inputs.get("trace"), depth + 1)
            if isinstance(inputs, list) and inputs and isinstance(inputs[0], dict):
                return resolve_constant(inputs[0].get("trace"), depth + 1)
        return None
    return None


def signal_leaf_id(trace: Any) -> str | None:
    """Canonical identity of the signal side of a comparison: the top block
    SID, or the root Inport SID/name. Constants have no signal identity."""
    if not isinstance(trace, dict):
        return None
    kind = str(trace.get("kind") or "").lower()
    if kind == "constant":
        return None
    sid = trace.get("sid")
    if kind == "root_inport":
        return f"inport:{sid or trace.get('name') or trace.get('signal')}"
    if sid:
        return f"block:{sid}"
    return None


def comparison_fact(port: dict[str, Any]) -> tuple[str, str, float] | None:
    """(signal_id, op, constant) for a relational port trace, or None when not
    statically decidable (stateful path, variable parameter, unknown leaf)."""
    trace = port.get("source_trace") or port.get("trace")
    if not isinstance(trace, dict) or str(trace.get("kind") or "").lower() != "relational":
        return None
    op = str(trace.get("operator") or "").strip()
    if op not in IMPLY_OPS:
        return None
    inputs = trace.get("inputs")
    if not isinstance(inputs, list) or len(inputs) < 2:
        return None
    first, second = inputs[0].get("trace"), inputs[1].get("trace")
    first_constant = resolve_constant(first)
    second_constant = resolve_constant(second)
    first_signal = signal_leaf_id(first)
    second_signal = signal_leaf_id(second)
    if second_constant is not None and first_constant is None and first_signal is not None:
        return first_signal, op, second_constant
    if first_constant is not None and second_constant is None and second_signal is not None:
        return second_signal, flip_op(op), first_constant
    return None


def implies(left: tuple[str, str, float], right: tuple[str, str, float]) -> bool:
    """True when `left` true implies `right` true on the same signal."""
    left_id, left_op, left_c = left
    right_id, right_op, right_c = right
    if left_id != right_id:
        return False
    if left_op == ">" and right_op in (">", ">="):
        return left_c >= right_c
    if left_op == ">=" and right_op == ">=":
        return left_c >= right_c
    if left_op == ">=" and right_op == ">":
        return left_c > right_c
    if left_op == "<" and right_op in ("<", "<="):
        return left_c <= right_c
    if left_op == "<=" and right_op == "<=":
        return left_c <= right_c
    if left_op == "<=" and right_op == "<":
        return left_c < right_c
    if left_op == "==":
        if right_op in (">=", "<="):
            return True
        if right_op == "==":
            return left_c == right_c
        if right_op == ">":
            return left_c > right_c
        if right_op == "<":
            return left_c < right_c
        if right_op == "~=":
            return left_c != right_c
        return False
    if left_op == "~=" and right_op == "~=":
        return left_c == right_c
    return False


def facts_for_operator(operator: dict[str, Any]) -> list[tuple[str, str, float] | None]:
    ports = operator.get("ports") or operator.get("inputs") or []
    if not isinstance(ports, list):
        return []
    return [comparison_fact(port) if isinstance(port, dict) else None for port in ports]


def algebraic_unreachable_ports(operator_kind: str, facts: list[tuple[str, str, float] | None]) -> dict[int, tuple[int, str]]:
    """Port index (1-based) -> (implied_by_port_index, evidence) whose MC/DC
    independent-effect toggle vector is algebraically impossible."""
    if operator_kind not in {"AND", "OR"} or len(facts) < 2:
        return {}
    result: dict[int, tuple[int, str]] = {}
    for j, fact_j in enumerate(facts):
        if fact_j is None:
            continue
        for k, fact_k in enumerate(facts):
            if k == j or fact_k is None:
                continue
            if operator_kind == "AND" and implies(fact_k, fact_j):
                _, _, k_c = fact_k
                _, _, j_c = fact_j
                result[j + 1] = (
                    k + 1,
                    f"port{j + 1} false independent-effect vector (T..F) impossible: "
                    f"port{k + 1} condition (same signal, {fact_k[1]}{k_c:g}) strictly implies "
                    f"port{j + 1} condition ({fact_j[1]}{j_c:g}); strong true forces weak true.",
                )
                break
            if operator_kind == "OR" and implies(fact_j, fact_k):
                _, _, j_c = fact_j
                _, _, k_c = fact_k
                result[j + 1] = (
                    k + 1,
                    f"port{j + 1} true independent-effect vector (F..T) impossible: "
                    f"port{j + 1} condition (same signal, {fact_j[1]}{j_c:g}) strictly implies "
                    f"port{k + 1} condition ({fact_k[1]}{k_c:g}); weak true forces strong true.",
                )
                break
    return result


def algebraic_unreachable_vector(
    operator_kind: str,
    facts: list[tuple[str, str, float] | None],
    toggle_index: int,
) -> str | None:
    """Evidence string when the single-toggle vector at `toggle_index` (1-based)
    is algebraically impossible, else None."""
    if toggle_index is None:
        return None
    unreachable = algebraic_unreachable_ports(operator_kind, facts)
    entry = unreachable.get(toggle_index)
    return entry[1] if entry else None


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


def solve_interval(constraints: list[tuple[str, float]]) -> float | None:
    """Intersect u-side constraints of the form (op, constant) and return a
    representative value, or None when the interval is empty (structurally
    unsatisfiable) or contains no usable value."""
    import math
    lo, hi = float("-inf"), float("inf")
    lo_open = hi_open = False
    for op, c in constraints:
        if op in ("<=", "<"):
            open_ = op == "<"
            if c < hi or (c == hi and (hi_open or not open_)):
                hi, hi_open = c, open_
        elif op in (">=", ">"):
            open_ = op == ">"
            if c > lo or (c == lo and (lo_open or not open_)):
                lo, lo_open = c, open_
        elif op == "==":
            lo = hi = float(c)
            lo_open = hi_open = False
        elif op == "~=":
            return None
        else:
            return None
    if lo > hi or (lo == hi and (lo_open or hi_open)):
        return None
    if math.isinf(lo) and math.isinf(hi):
        return 0.0
    if math.isinf(hi):
        value = math.ceil(lo) if not lo_open else math.floor(lo) + 1
        if value < lo or (lo_open and value <= lo):
            value = lo if not lo_open else lo + 1.0
        return float(value)
    if math.isinf(lo):
        value = math.floor(hi) if not hi_open else math.ceil(hi) - 1
        if value > hi or (hi_open and value >= hi):
            value = hi if not hi_open else hi - 1.0
        return float(value)
    value = math.ceil(lo) if not lo_open else math.floor(lo) + 1
    if value < hi or (value == hi and not hi_open):
        return float(value)
    value = math.floor(hi) if not hi_open else math.ceil(hi) - 1
    if value > lo or (value == lo and not lo_open):
        return float(value)
    mid = (lo + hi) / 2.0
    if (mid > lo or (mid == lo and not lo_open)) and (mid < hi or (mid == hi and not hi_open)):
        return mid
    return None


def resolve_with_alternates(match_inputs: dict[str, Any], match_params: dict[str, Any],
                            conflicts: list[dict[str, Any]], alternates: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Try alternate boundary values to satisfy combined constraints.

    Each alternate is a candidate mapping (inputs or params) for the port that
    just conflicted. Only the conflicting keys are re-tried, and only when the
    alternate keeps every previously merged key consistent.
    """
    import itertools
    for combo in itertools.product(*([alt] for alt in alternates)):
        trial_inputs = dict(match_inputs)
        trial_params = dict(match_params)
        ok = True
        for candidate in combo:
            for key, value in candidate.items():
                target = trial_inputs if key in match_inputs or key not in match_params else trial_params
                if key in target and not values_equal(target[key], value):
                    ok = False
                    break
                target[key] = value
            if not ok:
                break
        if ok:
            return trial_inputs, trial_params
    return None


def build_obligation(
    *,
    model: str | None,
    operator: dict[str, Any],
    operator_index: int,
    operator_kind: str,
    ports: list[dict[str, Any]],
    vector: dict[int, bool],
    unreachable_reason: str | None = None,
) -> dict[str, Any]:
    op_id = operator_id(operator, operator_index)
    label = vector_label(operator_kind, vector)
    common_inputs, common_params = state_from_container(operator)
    match_inputs = dict(common_inputs)
    match_params = dict(common_params)
    issues: list[dict[str, Any]] = []
    port_facts: list[dict[str, Any]] = []

    all_ranges: list[tuple[str, str, float]] = []
    for idx, desired in vector.items():
        port = ports[idx - 1]
        inputs, params, missing, alternates, ranges = port_state(port, desired)
        issues.extend(missing)
        all_ranges.extend(ranges)
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
    if issues and all_ranges:
        # Solve combined interval constraints for the same input, e.g. window
        # comparators: `u<=30` (true) and `50<=u` (false) intersect at (30, 50).
        by_name: dict[str, list[tuple[str, float]]] = {}
        for name, op, c in all_ranges:
            by_name.setdefault(name, []).append((op, c))
        solution = {}
        solvable = True
        for name, constraints in by_name.items():
            value = solve_interval(constraints)
            if value is None:
                solvable = False
                break
            solution[name] = value
        if solvable and solution:
            match_inputs.update(solution)
            # Re-verify every merged key stays consistent.
            conflicts = []
            merged = {}
            for state in (match_inputs,):
                for key, value in state.items():
                    if key in merged and not values_equal(merged[key], value):
                        conflicts.append({"code": "conflicting_assignment", "key": key, "left": merged[key], "right": value})
                    merged[key] = value
            issues = [issue for issue in issues if issue.get("code") != "conflicting_assignment"]
        else:
            # Fall back to alternate boundary candidates.
            resolved = resolve_with_alternates(match_inputs, match_params, conflicts, [alt for _, _, _, alts, _ in [port_state(ports[idx - 1], desired) for idx, desired in vector.items()] for alt in alts])
            if resolved is not None:
                match_inputs, match_params = resolved
                issues = [issue for issue in issues if issue.get("code") != "conflicting_assignment"]

    if unreachable_reason:
        return {
            "id": f"{op_id}_{label}",
            "model": model,
            "block_path": operator.get("block_path") or operator.get("path"),
            "sid": operator.get("sid"),
            "operator": operator_kind,
            "coverage_class": "MCDC",
            "status": "unreachable",
            "required_outcome": f"operator_input_vector={''.join('T' if vector[i] else 'F' for i in sorted(vector))}; output={output_for_vector(operator_kind, vector)}",
            "operator_inputs": {str(idx): value for idx, value in vector.items()},
            "source_ports": port_facts,
            "match": {
                "inputs": match_inputs,
                "params": match_params,
            },
            "reason": unreachable_reason,
            "evidence_state": "unreachable_algebraic",
            "issues": issues,
        }
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

        facts = facts_for_operator(operator)
        vector_specs = [make_required_vector(operator_kind, len(normalized_ports), None)]
        for idx in range(1, len(normalized_ports) + 1):
            vector_specs.append(make_required_vector(operator_kind, len(normalized_ports), idx))
        for vector in vector_specs:
            # Toggle vectors flip exactly one port away from the baseline
            # (AND single-false, OR single-true); the baseline has no toggle.
            if operator_kind == "AND":
                toggle = next((idx for idx, desired in vector.items() if not desired), None)
            else:
                toggle = next((idx for idx, desired in vector.items() if desired), None)
            unreachable_reason = None
            if toggle is not None and len(normalized_ports) >= 2:
                unreachable_reason = algebraic_unreachable_vector(operator_kind, facts, toggle)
            obligations.append(
                build_obligation(
                    model=model,
                    operator=operator,
                    operator_index=operator_index,
                    operator_kind=operator_kind,
                    ports=normalized_ports,
                    vector=vector,
                    unreachable_reason=unreachable_reason,
                )
            )

    required_count = sum(1 for item in obligations if item.get("status") == "required")
    unresolved_count = sum(1 for item in obligations if item.get("status") == "unresolved")
    unreachable_count = sum(1 for item in obligations if item.get("status") == "unreachable")
    return {
        "schema": SCHEMA,
        "model": model,
        "summary": {
            "operator_count": len(as_items(data)),
            "obligation_count": len(obligations),
            "required_count": required_count,
            "unresolved_count": unresolved_count,
            "unreachable_count": unreachable_count,
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
