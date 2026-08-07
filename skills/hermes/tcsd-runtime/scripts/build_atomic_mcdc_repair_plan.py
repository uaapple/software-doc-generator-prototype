#!/usr/bin/env python3
"""Build a minimal, executable atomic-condition MC/DC repair plan.

The structural Logical Operator trace is converted to a Boolean AST. Nested
AND/OR/NOT blocks are kept in the expression while root inputs, scalar
parameters, and relational expressions become atomic conditions. The emitted
tests are a small unique-cause MC/DC set, never a root-input truth table.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


IDENTIFIER_RE = re.compile(r"^[A-Za-z_]\w*$")


@dataclass
class Atom:
    id: str
    kind: str
    source: dict[str, Any]
    label: str


@dataclass
class Recipe:
    inputs: dict[str, Any] = field(default_factory=dict)
    params: dict[str, Any] = field(default_factory=dict)
    hold_s: float = 0.1
    strategy: str = "direct"
    issues: list[str] = field(default_factory=list)

    @property
    def resolved(self) -> bool:
        return not self.issues and bool(self.inputs or self.params)


def children(node: dict[str, Any]) -> list[dict[str, Any]]:
    raw = node.get("inputs") or []
    if isinstance(raw, dict):
        raw = [raw]
    result: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        trace = item.get("trace") if isinstance(item.get("trace"), dict) else item
        result.append(trace)
    return result


def unwrap(node: dict[str, Any]) -> dict[str, Any]:
    kind = str(node.get("kind") or "").lower()
    if kind in {"subsystem_inport", "subsystem_outport", "subsystem", "from", "goto"}:
        source = node.get("source")
        if isinstance(source, dict):
            return unwrap(source)
        nested = children(node)
        if len(nested) == 1:
            return unwrap(nested[0])
    return node


def atom_key(node: dict[str, Any]) -> str:
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        return f"root:{node.get('signal') or node.get('name')}"
    if kind == "constant":
        return f"constant:{node.get('value')}"
    return f"{kind}:{node.get('sid') or node.get('path') or json.dumps(node, sort_keys=True)}"


def atom_label(node: dict[str, Any]) -> str:
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        return str(node.get("signal") or node.get("name") or "root input")
    if kind == "constant":
        return str(node.get("value") or "constant")
    if kind == "relational":
        return str(node.get("path") or node.get("name") or node.get("sid") or "relational")
    return str(node.get("path") or node.get("name") or node.get("sid") or kind)


def build_ast(node: dict[str, Any], atoms: list[Atom], by_key: dict[str, int]) -> dict[str, Any]:
    node = unwrap(node)
    kind = str(node.get("kind") or "").lower()
    operator = str(node.get("operator") or "").upper()
    nested = children(node)
    if kind == "logic" and operator in {"AND", "OR", "NOT"} and nested:
        return {"kind": "logic", "operator": operator, "children": [build_ast(item, atoms, by_key) for item in nested]}

    key = atom_key(node)
    if key not in by_key:
        by_key[key] = len(atoms)
        atoms.append(Atom(id=f"C{len(atoms) + 1}", kind=kind, source=node, label=atom_label(node)))
    return {"kind": "atom", "index": by_key[key]}


def evaluate(ast: dict[str, Any], values: tuple[bool, ...]) -> bool:
    if ast["kind"] == "atom":
        return values[int(ast["index"])]
    op = ast["operator"]
    child_values = [evaluate(child, values) for child in ast["children"]]
    if op == "NOT":
        return not child_values[0]
    if op == "AND":
        return all(child_values)
    return any(child_values)


def unique_cause_pairs(ast: dict[str, Any], count: int) -> dict[int, list[tuple[tuple[bool, ...], tuple[bool, ...]]]]:
    all_vectors = list(itertools.product((False, True), repeat=count))
    outputs = {vector: evaluate(ast, vector) for vector in all_vectors}
    pairs: dict[int, list[tuple[tuple[bool, ...], tuple[bool, ...]]]] = {i: [] for i in range(count)}
    for vector in all_vectors:
        for index in range(count):
            toggled = list(vector)
            toggled[index] = not toggled[index]
            other = tuple(toggled)
            if vector < other and outputs[vector] != outputs[other]:
                pairs[index].append((vector, other))
    return pairs


def select_minimal_vectors(
    pairs: dict[int, list[tuple[tuple[bool, ...], tuple[bool, ...]]]],
) -> tuple[
    list[tuple[bool, ...]],
    dict[int, tuple[tuple[bool, ...], tuple[bool, ...]]],
    list[int],
]:
    missing = [index for index, options in pairs.items() if not options]
    feasible = {index: options for index, options in pairs.items() if options}
    if not feasible:
        return [], {}, missing

    candidates = sorted({vector for options in feasible.values() for pair in options for vector in pair})
    best_seed: tuple[bool, ...] | None = None
    best_covered: set[int] = set()
    for vector in candidates:
        covered = {index for index, options in feasible.items() if any(vector in pair for pair in options)}
        if len(covered) > len(best_covered):
            best_seed, best_covered = vector, covered

    selected: set[tuple[bool, ...]] = {best_seed} if best_seed is not None else set()
    chosen: dict[int, tuple[tuple[bool, ...], tuple[bool, ...]]] = {}
    uncovered = set(feasible)
    while uncovered:
        best: tuple[int, tuple[tuple[bool, ...], tuple[bool, ...]]] | None = None
        best_cost = math.inf
        best_reuse = -1
        for index in sorted(uncovered):
            for pair in feasible[index]:
                cost = sum(vector not in selected for vector in pair)
                reuse = 2 - cost
                if cost < best_cost or (cost == best_cost and reuse > best_reuse):
                    best = (index, pair)
                    best_cost = cost
                    best_reuse = reuse
        assert best is not None
        index, pair = best
        selected.update(pair)
        chosen[index] = pair
        uncovered.remove(index)
    return sorted(selected), chosen, missing


def parse_literal(raw: Any) -> float | None:
    try:
        return float(str(raw).strip())
    except ValueError:
        return None


def symbolic_constant(node: dict[str, Any]) -> str | None:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() != "constant":
        return None
    value = str(node.get("value") or "").strip()
    return value if IDENTIFIER_RE.match(value) else None


def direct_root(node: dict[str, Any]) -> str | None:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() == "root_inport":
        return str(node.get("signal") or node.get("name") or "").strip() or None
    return None


def contains_kind(node: dict[str, Any], expected: set[str]) -> bool:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() in expected:
        return True
    return any(contains_kind(item, expected) for item in children(node))


def relational_recipe(node: dict[str, Any], desired: bool) -> Recipe:
    op = str(node.get("operator") or "").strip()
    terms = children(node)
    if len(terms) != 2:
        return Recipe(issues=["relational condition does not have two traced operands"])

    left_root, right_root = direct_root(terms[0]), direct_root(terms[1])
    left_param, right_param = symbolic_constant(terms[0]), symbolic_constant(terms[1])
    left_literal = parse_literal(unwrap(terms[0]).get("value")) if str(unwrap(terms[0]).get("kind") or "").lower() == "constant" else None
    right_literal = parse_literal(unwrap(terms[1]).get("value")) if str(unwrap(terms[1]).get("kind") or "").lower() == "constant" else None

    if right_param and op in {">", ">="} and contains_kind(terms[0], {"stateful", "switch", "minmax"}):
        return Recipe(
            params={right_param: 0 if desired else 1},
            hold_s=0.02,
            strategy="nonnegative_stateful_value_vs_parameter_threshold",
        )
    if left_param and op in {"<", "<="} and contains_kind(terms[1], {"stateful", "switch", "minmax"}):
        return Recipe(
            params={left_param: 0 if desired else 1},
            hold_s=0.02,
            strategy="parameter_threshold_vs_nonnegative_stateful_value",
        )
    if left_root and right_literal is not None:
        delta = max(1.0, abs(right_literal) * 0.01)
        if op in {">", ">="}:
            value = right_literal + delta if desired else right_literal - delta
        elif op in {"<", "<="}:
            value = right_literal - delta if desired else right_literal + delta
        elif op == "==":
            value = right_literal if desired else right_literal + delta
        elif op == "~=":
            value = right_literal + delta if desired else right_literal
        else:
            return Recipe(issues=[f"unsupported relational operator {op!r}"])
        return Recipe(inputs={left_root: value}, strategy="root_input_boundary")
    if right_root and left_literal is not None:
        delta = max(1.0, abs(left_literal) * 0.01)
        if op in {">", ">="}:
            value = left_literal - delta if desired else left_literal + delta
        elif op in {"<", "<="}:
            value = left_literal + delta if desired else left_literal - delta
        elif op == "==":
            value = left_literal if desired else left_literal + delta
        elif op == "~=":
            value = left_literal + delta if desired else left_literal
        else:
            return Recipe(issues=[f"unsupported relational operator {op!r}"])
        return Recipe(inputs={right_root: value}, strategy="root_input_boundary")
    return Recipe(issues=["relational condition lacks a safe executable controller mapping"])


def atom_recipe(atom: Atom, desired: bool) -> Recipe:
    node = unwrap(atom.source)
    if atom.kind == "root_inport":
        name = str(node.get("signal") or node.get("name") or "").strip()
        return Recipe(inputs={name: int(desired)}) if name else Recipe(issues=["unnamed root input"])
    if atom.kind == "constant":
        value = str(node.get("value") or "").strip()
        if IDENTIFIER_RE.match(value):
            return Recipe(params={value: int(desired)}, strategy="scalar_parameter")
        return Recipe(issues=[f"literal constant {value!r} is not controllable"])
    if atom.kind == "relational":
        return relational_recipe(node, desired)
    return Recipe(issues=[f"unsupported atomic condition kind {atom.kind!r}"])


def merge_recipe(target: Recipe, source: Recipe, where: str) -> None:
    target.hold_s = max(target.hold_s, source.hold_s)
    target.issues.extend(source.issues)
    for category in ("inputs", "params"):
        destination = getattr(target, category)
        for key, value in getattr(source, category).items():
            if key in destination and destination[key] != value:
                target.issues.append(f"{where}: conflicting {category} value for {key}")
            else:
                destination[key] = value


def reports(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload.get("operators"), list):
        return [payload]
    return [item for item in payload.values() if isinstance(item, dict) and isinstance(item.get("operators"), list)]


def referenced_logic_ids(node: dict[str, Any], found: set[str]) -> None:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() == "logic":
        identity = str(node.get("sid") or "")
        if identity:
            found.add(identity)
    for child in children(node):
        referenced_logic_ids(child, found)


def top_operators(report: dict[str, Any]) -> list[dict[str, Any]]:
    referenced: set[str] = set()
    for operator in report.get("operators", []):
        for port in operator.get("ports", []):
            trace = port.get("trace") if isinstance(port, dict) else None
            if isinstance(trace, dict):
                referenced_logic_ids(trace, referenced)
    result = [operator for operator in report.get("operators", []) if str(operator.get("sid") or operator.get("id") or "") not in referenced]
    return result or list(report.get("operators", []))


def vector_label(vector: tuple[bool, ...]) -> str:
    return "".join("T" if value else "F" for value in vector)


def build_for_operator(model: str, operator: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    root = {
        "kind": "logic",
        "operator": str(operator.get("operator") or "").upper(),
        "inputs": [port.get("trace", {}) for port in operator.get("ports", []) if isinstance(port, dict)],
    }
    atoms: list[Atom] = []
    ast = build_ast(root, atoms, {})
    if not atoms:
        return [], {"operator_id": operator.get("id"), "condition_count": 0, "issues": ["no atomic conditions"]}
    if len(atoms) > 12:
        return [], {"operator_id": operator.get("id"), "condition_count": len(atoms), "issues": ["more than 12 atomic conditions; bounded planner stopped"]}

    pairs = unique_cause_pairs(ast, len(atoms))
    selected, chosen, missing = select_minimal_vectors(pairs)
    if len(selected) > 2 * len(atoms) + 2:
        raise ValueError("minimal MC/DC planner exceeded the bounded 2N+2 case limit")

    obligations: list[dict[str, Any]] = []
    op_id = str(operator.get("id") or operator.get("sid") or "LOGIC")
    for index in missing:
        atom = atoms[index]
        obligations.append(
            {
                "id": f"{op_id}_condition_{atom.id}_infeasible",
                "model": model,
                "block_path": operator.get("block_path"),
                "sid": operator.get("sid") or operator.get("id"),
                "operator": operator.get("operator"),
                "coverage_class": "MCDC",
                "status": "unsupported",
                "required_outcome": f"no unique-cause pair available for condition {atom.id}",
                "condition_states": {},
                "match": {"inputs": {}, "params": {}},
                "issues": [f"no_unique_cause_pair: condition {atom.id}"],
            }
        )
    for vector in selected:
        recipe = Recipe(hold_s=0.1)
        condition_states: dict[str, bool] = {}
        strategies: dict[str, str] = {}
        for index, desired in enumerate(vector):
            atom = atoms[index]
            condition_states[atom.id] = desired
            item_recipe = atom_recipe(atom, desired)
            strategies[atom.id] = item_recipe.strategy
            merge_recipe(recipe, item_recipe, atom.id)
        label = vector_label(vector)
        status = "required" if recipe.resolved else "unresolved"
        obligations.append(
            {
                "id": f"{op_id}_atomic_{label}",
                "model": model,
                "block_path": operator.get("block_path"),
                "sid": operator.get("sid") or operator.get("id"),
                "operator": operator.get("operator"),
                "coverage_class": "MCDC",
                "status": status,
                "required_outcome": f"atomic_condition_vector={label}; output={str(evaluate(ast, vector)).lower()}",
                "condition_states": condition_states,
                "match": {"inputs": recipe.inputs, "params": recipe.params},
                "hold_s": recipe.hold_s,
                "mapping_strategies": strategies,
                "issues": recipe.issues,
            }
        )

    condition_pairs = []
    for index, pair in sorted(chosen.items()):
        condition_pairs.append(
            {
                "condition_id": atoms[index].id,
                "condition_label": atoms[index].label,
                "false_true_pair": [vector_label(pair[0]), vector_label(pair[1])],
            }
        )
    summary = {
        "operator_id": op_id,
        "block_path": operator.get("block_path"),
        "condition_count": len(atoms),
        "emitted_vector_count": len(selected),
        "max_allowed_vectors": 2 * len(atoms) + 2,
        "conditions": [{"id": atom.id, "kind": atom.kind, "label": atom.label} for atom in atoms],
        "pairs": condition_pairs,
        "issues": [issue for item in obligations for issue in item.get("issues", [])],
    }
    return obligations, summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logical-traces", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.logical_traces).read_text(encoding="utf-8"))
    matched = reports(payload)
    if len(matched) != 1:
        raise SystemExit("logical trace input must contain exactly one model report")
    report = matched[0]
    model = str(report.get("model") or "")
    obligations: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    for operator in top_operators(report):
        built, summary = build_for_operator(model, operator)
        obligations.extend(built)
        decisions.append(summary)

    unresolved = sum(item.get("status") != "required" for item in obligations)
    result = {
        "schema": "simulink-ut-atomic-mcdc-repair-plan/v1",
        "model": model,
        "generation_mode": "minimal_unique_cause",
        "summary": {
            "decision_count": len(decisions),
            "obligation_count": len(obligations),
            "unresolved_count": unresolved,
            "decisions": decisions,
        },
        "obligations": obligations,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "obligations": len(obligations), "unresolved": unresolved}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
