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
MAX_ATOMIC_CONDITIONS = 16


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
    if kind == "membership":
        return "membership:" + json.dumps(
            {
                "root": node.get("root_input"),
                "values": node.get("values") or [],
            },
            sort_keys=True,
        )
    return f"{kind}:{node.get('sid') or node.get('path') or json.dumps(node, sort_keys=True)}"


def atom_label(node: dict[str, Any]) -> str:
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        return str(node.get("signal") or node.get("name") or "root input")
    if kind == "constant":
        return str(node.get("value") or "constant")
    if kind == "relational":
        return str(node.get("path") or node.get("name") or node.get("sid") or "relational")
    if kind == "membership":
        return f"{node.get('root_input') or 'root input'} in resolved value set"
    return str(node.get("path") or node.get("name") or node.get("sid") or kind)


def build_ast(node: dict[str, Any], atoms: list[Atom], by_key: dict[str, int]) -> dict[str, Any]:
    node = unwrap(node)
    kind = str(node.get("kind") or "").lower()
    operator = str(node.get("operator") or "").upper()
    nested = children(node)
    if kind == "logic" and operator == "OR":
        membership = membership_controller(node)
        if membership:
            node = {"kind": "membership", **membership}
            kind = "membership"
            nested = []
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


def masked_value(ast: dict[str, Any], values: tuple[bool, ...], target_index: int) -> bool | None:
    """Evaluate while treating the target condition as unknown.

    ``None`` means the enclosing expression still depends on the target. A
    concrete Boolean means another branch masks the target for this vector.
    """
    if ast["kind"] == "atom":
        return None if int(ast["index"]) == target_index else values[int(ast["index"])]
    op = ast["operator"]
    children = [masked_value(child, values, target_index) for child in ast["children"]]
    if op == "NOT":
        return None if children[0] is None else not children[0]
    if op == "AND":
        if any(value is False for value in children):
            return False
        return None if any(value is None for value in children) else True
    if any(value is True for value in children):
        return True
    return None if any(value is None for value in children) else False


def masking_pairs(ast: dict[str, Any], count: int) -> dict[int, list[tuple[tuple[bool, ...], tuple[bool, ...]]]]:
    all_vectors = list(itertools.product((False, True), repeat=count))
    outputs = {vector: evaluate(ast, vector) for vector in all_vectors}
    pairs: dict[int, list[tuple[tuple[bool, ...], tuple[bool, ...]]]] = {i: [] for i in range(count)}
    for index in range(count):
        false_vectors = [vector for vector in all_vectors if not vector[index] and masked_value(ast, vector, index) is None]
        true_vectors = [vector for vector in all_vectors if vector[index] and masked_value(ast, vector, index) is None]
        for false_vector in false_vectors:
            for true_vector in true_vectors:
                if outputs[false_vector] != outputs[true_vector]:
                    pairs[index].append((false_vector, true_vector))
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


def resolved_constant(node: dict[str, Any]) -> tuple[float, str, str] | None:
    kind = str(node.get("kind") or "").lower()
    labels = " ".join(
        str(node.get(key) or "")
        for key in ("name", "maskType", "referenceBlock", "semantic", "blockType")
    ).lower()
    compact = re.sub(r"[^a-z0-9]+", "", labels)
    nested = children(node)
    source = node.get("source") if isinstance(node.get("source"), dict) else None
    operands = ([source] if source is not None else []) + nested
    if kind == "abs" and len(operands) == 1:
        resolved = resolved_constant(operands[0])
        if resolved is None:
            return None
        value, source_name, expression = resolved
        return abs(value), f"abs({source_name})", f"abs({expression})"
    if "opposite" in compact:
        for operand in operands:
            resolved = resolved_constant(operand)
            if resolved is not None:
                value, source_name, expression = resolved
                return -value, f"opposite({source_name})", f"-({expression})"
        return None
    unwrapped = unwrap(node)
    if unwrapped is not node:
        return resolved_constant(unwrapped)
    node = unwrapped
    if str(node.get("kind") or "").lower() != "constant":
        return None
    expression = str(node.get("value") or "").strip()
    literal = parse_literal(expression)
    if literal is not None:
        return literal, "model_literal", expression
    resolved = parse_literal(node.get("resolvedValue"))
    if resolved is None:
        return None
    source = str(node.get("resolvedSource") or "resolved_workspace_symbol")
    return resolved, source, expression


def direct_root(node: dict[str, Any]) -> str | None:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() == "root_inport":
        return str(node.get("signal") or node.get("name") or "").strip() or None
    return None


def resolved_block_parameter(node: dict[str, Any], name: str) -> tuple[float, str] | None:
    params = node.get("params") if isinstance(node.get("params"), dict) else {}
    value = parse_literal(params.get(f"{name}Resolved"))
    if value is None:
        value = parse_literal(params.get(name))
    if value is None:
        return None
    return value, str(params.get(f"{name}ResolvedSource") or "model_parameter")


def affine_root_controller(node: dict[str, Any]) -> dict[str, Any] | None:
    node = unwrap(node)
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        root = direct_root(node)
        if not root:
            return None
        return {
            "root_input": root,
            "scale": 1.0,
            "offset": 0.0,
            "data_type": str(node.get("dataType") or ""),
            "chain": [],
        }
    if kind != "block":
        return None
    semantic = str(node.get("semantic") or node.get("blockType") or "").lower()
    nested = children(node)
    if len(nested) != 1:
        return None
    upstream = affine_root_controller(nested[0])
    if not upstream:
        return None
    chain = list(upstream["chain"])
    if semantic == "gain":
        resolved = resolved_block_parameter(node, "Gain")
        if not resolved or math.isclose(resolved[0], 0.0, rel_tol=0.0, abs_tol=1e-15):
            return None
        gain, source = resolved
        upstream["scale"] *= gain
        upstream["offset"] *= gain
        chain.append({"kind": "gain", "path": node.get("path"), "value": gain, "source": source})
    elif semantic == "bias":
        resolved = resolved_block_parameter(node, "Bias")
        if not resolved:
            return None
        bias, source = resolved
        upstream["offset"] += bias
        chain.append({"kind": "bias", "path": node.get("path"), "value": bias, "source": source})
    elif semantic == "datatypeconversion":
        params = node.get("params") if isinstance(node.get("params"), dict) else {}
        output_type = str(params.get("OutDataTypeStr") or "")
        chain.append({"kind": "data_type_conversion", "path": node.get("path"), "dataType": output_type})
    else:
        return None
    upstream["chain"] = chain
    return upstream


def contains_kind(node: dict[str, Any], expected: set[str]) -> bool:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() in expected:
        return True
    return any(contains_kind(item, expected) for item in children(node))


def relational_controller(node: dict[str, Any]) -> dict[str, Any] | None:
    terms = children(node)
    if len(terms) != 2:
        return None
    left_affine, right_affine = affine_root_controller(terms[0]), affine_root_controller(terms[1])
    left_constant, right_constant = resolved_constant(terms[0]), resolved_constant(terms[1])
    if left_affine and right_constant:
        threshold, source, expression = right_constant
        root_boundary = (threshold - float(left_affine["offset"])) / float(left_affine["scale"])
        return {
            **left_affine,
            "root_on_left": True,
            "threshold": threshold,
            "root_boundary": root_boundary,
            "threshold_source": source,
            "threshold_expression": expression,
            "operator": str(node.get("operator") or "").strip(),
        }
    if right_affine and left_constant:
        threshold, source, expression = left_constant
        root_boundary = (threshold - float(right_affine["offset"])) / float(right_affine["scale"])
        return {
            **right_affine,
            "root_on_left": False,
            "threshold": threshold,
            "root_boundary": root_boundary,
            "threshold_source": source,
            "threshold_expression": expression,
            "operator": str(node.get("operator") or "").strip(),
        }
    return None


def membership_controller(node: dict[str, Any]) -> dict[str, Any] | None:
    node = unwrap(node)
    if str(node.get("kind") or "").lower() != "logic" or str(node.get("operator") or "").upper() != "OR":
        return None
    controllers: list[dict[str, Any]] = []
    for term in children(node):
        term = unwrap(term)
        if str(term.get("kind") or "").lower() != "relational":
            return None
        controller = relational_controller(term)
        if not controller or controller.get("operator") != "==" or controller.get("chain"):
            return None
        controllers.append(controller)
    if len(controllers) < 2:
        return None
    roots = {str(item.get("root_input") or "") for item in controllers}
    if len(roots) != 1 or "" in roots:
        return None
    values = sorted({float(item["root_boundary"]) for item in controllers})
    if len(values) != len(controllers):
        return None
    return {
        "root_input": next(iter(roots)),
        "values": values,
        "data_type": str(controllers[0].get("data_type") or ""),
        "value_sources": [
            {
                "value": float(item["root_boundary"]),
                "expression": item.get("threshold_expression"),
                "source": item.get("threshold_source"),
            }
            for item in controllers
        ],
        "path": node.get("path"),
        "sid": node.get("sid"),
    }


def mux_root_inputs(node: dict[str, Any]) -> list[dict[str, Any]] | None:
    node = unwrap(node)
    if (
        str(node.get("kind") or "").lower() != "block"
        or str(node.get("semantic") or node.get("blockType") or "").lower() != "mux"
    ):
        return None
    controllers: list[dict[str, Any]] = []
    for term in children(node):
        controller = affine_root_controller(term)
        if not controller or controller.get("chain"):
            return None
        controllers.append(controller)
    return controllers or None


def mux_relational_recipe(node: dict[str, Any], desired: bool) -> Recipe | None:
    operator = str(node.get("operator") or "").strip()
    if operator not in {"==", "~="}:
        return None
    terms = children(node)
    if len(terms) != 2:
        return None
    left_mux, right_mux = mux_root_inputs(terms[0]), mux_root_inputs(terms[1])
    left_constant, right_constant = resolved_constant(terms[0]), resolved_constant(terms[1])
    if left_mux and right_constant:
        controllers, threshold = left_mux, float(right_constant[0])
    elif right_mux and left_constant:
        controllers, threshold = right_mux, float(left_constant[0])
    else:
        return None
    wants_equal = desired if operator == "==" else not desired
    assignments = {str(item["root_input"]): threshold for item in controllers}
    if not wants_equal:
        first = controllers[0]
        alternate = next(
            (value for _, value in boundary_values(threshold, str(first.get("data_type") or "")) if not math.isclose(value, threshold, rel_tol=0.0, abs_tol=1e-12)),
            None,
        )
        if alternate is None:
            return Recipe(issues=["mux comparison has no safe non-equal root-input value"])
        assignments[str(first["root_input"])] = alternate
    return Recipe(inputs=assignments, strategy="mux_root_input_equality")


def membership_recipe(node: dict[str, Any], desired: bool) -> Recipe:
    root = str(node.get("root_input") or "")
    values = [float(value) for value in node.get("values") or []]
    if not root or not values:
        return Recipe(issues=["membership condition has no resolved root input or values"])
    if desired:
        return Recipe(inputs={root: values[0]}, strategy="root_input_membership")
    minimum, maximum, step = numeric_domain(str(node.get("data_type") or ""))
    delta = step or 1.0
    candidates = [max(values) + delta, min(values) - delta, 0.0]
    for candidate in candidates:
        if minimum is not None and candidate < minimum - 1e-12:
            continue
        if maximum is not None and candidate > maximum + 1e-12:
            continue
        if all(not math.isclose(candidate, value, rel_tol=0.0, abs_tol=1e-12) for value in values):
            return Recipe(inputs={root: candidate}, strategy="root_input_membership")
    return Recipe(issues=["membership condition has no safe value outside the resolved set"])


def comparison_result(operator: str, left: float, right: float) -> bool:
    if operator == ">":
        return left > right
    if operator == ">=":
        return left >= right
    if operator == "<":
        return left < right
    if operator == "<=":
        return left <= right
    if operator == "==":
        return math.isclose(left, right, rel_tol=0.0, abs_tol=1e-12)
    if operator == "~=":
        return not math.isclose(left, right, rel_tol=0.0, abs_tol=1e-12)
    raise ValueError(f"unsupported relational operator {operator!r}")


def resolved_scalar_value(node: dict[str, Any]) -> float | None:
    resolved = resolved_constant(node)
    return float(resolved[0]) if resolved else None


def switch_leaf_values(node: dict[str, Any]) -> list[float]:
    """Return bounded scalar values that a traced Switch tree can emit."""
    node = unwrap(node)
    kind = str(node.get("kind") or "").lower()
    if kind == "constant":
        value = resolved_scalar_value(node)
        return [value] if value is not None else []
    if kind != "switch":
        return []
    terms = children(node)
    if len(terms) != 3:
        return []
    values = switch_leaf_values(terms[0]) + switch_leaf_values(terms[2])
    return sorted(set(values))[:32]


def combine_recipe_options(
    groups: list[tuple[list[Recipe], str]],
    *,
    limit: int = 32,
) -> list[Recipe]:
    results: list[Recipe] = []

    def search(index: int, current: Recipe) -> None:
        if len(results) >= limit:
            return
        if index >= len(groups):
            results.append(current)
            return
        options, where = groups[index]
        for option in options:
            merged = Recipe(
                inputs=dict(current.inputs),
                params=dict(current.params),
                hold_s=current.hold_s,
                strategy=current.strategy,
                issues=list(current.issues),
            )
            merge_recipe(merged, option, where)
            if not merged.issues:
                search(index + 1, merged)

    search(0, Recipe())
    return results


def boolean_node_recipe(node: dict[str, Any], desired: bool) -> Recipe:
    """Drive a traced Boolean controller to the requested state."""
    options = boolean_node_recipe_options(node, desired)
    return options[0] if options else Recipe(issues=["Boolean switch controller has no conflict-free recipe"])


def boolean_node_recipe_options(node: dict[str, Any], desired: bool) -> list[Recipe]:
    """Return bounded alternative recipes for a Boolean controller."""
    node = unwrap(node)
    kind = str(node.get("kind") or "").lower()
    if kind == "root_inport":
        name = direct_root(node)
        return [Recipe(inputs={name: int(desired)}, strategy="switch_root_control")] if name else []
    if kind == "constant":
        expression = str(node.get("value") or "").strip()
        if IDENTIFIER_RE.match(expression):
            return [Recipe(params={expression: int(desired)}, strategy="switch_parameter_control")]
        value = resolved_scalar_value(node)
        return [Recipe(strategy="fixed_switch_control")] if value is not None and bool(value) == desired else []
    if kind == "relational":
        return [item for item in relational_recipe_options(node, desired) if not item.issues]
    if kind == "switch":
        return switch_value_recipe_options(node, float(int(desired)))
    if kind != "logic":
        return []
    operator = str(node.get("operator") or "").upper()
    terms = children(node)
    if operator == "NOT" and len(terms) == 1:
        return boolean_node_recipe_options(terms[0], not desired)
    if operator not in {"AND", "OR"} or not terms:
        return []
    target_all = desired if operator == "AND" else not desired
    if target_all:
        return combine_recipe_options([
            (boolean_node_recipe_options(term, desired), f"{operator} controller {index}")
            for index, term in enumerate(terms, 1)
        ])
    sensitized = True if operator == "AND" else False
    results: list[Recipe] = []
    for changed_index in range(len(terms)):
        groups = []
        for index, term in enumerate(terms):
            state = desired if index == changed_index else sensitized
            groups.append((boolean_node_recipe_options(term, state), f"{operator} controller {index + 1}"))
        for candidate in combine_recipe_options(groups, limit=32 - len(results)):
            candidate.strategy = "switch_logical_sensitization"
            results.append(candidate)
            if len(results) >= 32:
                return results
    return results


def switch_value_recipe(node: dict[str, Any], desired_value: float) -> Recipe:
    """Select a Switch branch that deterministically emits desired_value."""
    options = switch_value_recipe_options(node, desired_value)
    return options[0] if options else Recipe(issues=[f"Switch tree cannot emit requested value {desired_value:g}"])


def switch_value_recipe_options(node: dict[str, Any], desired_value: float) -> list[Recipe]:
    """Return bounded alternative Switch branch-selection recipes."""
    node = unwrap(node)
    if str(node.get("kind") or "").lower() == "constant":
        value = resolved_scalar_value(node)
        return [Recipe(strategy="fixed_switch_branch")] if value is not None and math.isclose(value, desired_value, rel_tol=0.0, abs_tol=1e-12) else []
    if str(node.get("kind") or "").lower() != "switch":
        return []
    terms = children(node)
    if len(terms) != 3:
        return []
    criteria = str(node.get("criteria") or "u2 ~= 0").replace(" ", "")
    if criteria not in {"u2~=0", "u2>0"}:
        return []
    results: list[Recipe] = []
    for branch_index, control_state in ((0, True), (2, False)):
        groups = [
            (switch_value_recipe_options(terms[branch_index], desired_value), "switch data branch"),
            (boolean_node_recipe_options(terms[1], control_state), "switch control"),
        ]
        for candidate in combine_recipe_options(groups, limit=32 - len(results)):
            candidate.strategy = "switch_branch_selection"
            results.append(candidate)
            if len(results) >= 32:
                return results
    return results


def switch_relational_recipe_options(node: dict[str, Any], desired: bool) -> list[Recipe] | None:
    terms = children(node)
    if len(terms) != 2:
        return None
    left_kind = str(unwrap(terms[0]).get("kind") or "").lower()
    right_kind = str(unwrap(terms[1]).get("kind") or "").lower()
    left_constant, right_constant = resolved_scalar_value(terms[0]), resolved_scalar_value(terms[1])
    if left_kind == "switch" and right_constant is not None:
        switch_node, threshold, switch_on_left = terms[0], right_constant, True
    elif right_kind == "switch" and left_constant is not None:
        switch_node, threshold, switch_on_left = terms[1], left_constant, False
    else:
        return None
    operator = str(node.get("operator") or "").strip()
    results: list[Recipe] = []
    for value in switch_leaf_values(switch_node):
        left, right = (value, threshold) if switch_on_left else (threshold, value)
        if comparison_result(operator, left, right) == desired:
            for recipe in switch_value_recipe_options(switch_node, value):
                recipe.strategy = "switch_output_comparison"
                results.append(recipe)
                if len(results) >= 32:
                    return results
    return results


def switch_relational_recipe(node: dict[str, Any], desired: bool) -> Recipe | None:
    options = switch_relational_recipe_options(node, desired)
    if options is None:
        return None
    return options[0] if options else Recipe(issues=[
        f"Switch output has no branch value satisfying {str(node.get('operator') or '').strip()!r}={desired}"
    ])


def numeric_value_recipe_options(node: dict[str, Any], desired_value: float) -> list[Recipe]:
    """Drive a traced numeric signal to a requested value through supported stateful paths."""
    node = unwrap(node)
    kind = str(node.get("kind") or "").lower()
    root = direct_root(node)
    if root:
        return [Recipe(inputs={root: desired_value}, strategy="numeric_root_input")]
    if kind == "constant":
        value = resolved_scalar_value(node)
        return [Recipe(strategy="fixed_numeric_value")] if value is not None and math.isclose(
            value, desired_value, rel_tol=0.0, abs_tol=1e-12
        ) else []
    if kind == "switch":
        terms = children(node)
        criteria = str(node.get("criteria") or "u2 ~= 0").replace(" ", "")
        if len(terms) != 3 or criteria not in {"u2~=0", "u2>0"}:
            return []
        results: list[Recipe] = []
        for branch_index, control_state in ((0, True), (2, False)):
            groups = [
                (numeric_value_recipe_options(terms[branch_index], desired_value), "switch data branch"),
                (boolean_node_recipe_options(terms[1], control_state), "switch control"),
            ]
            for candidate in combine_recipe_options(groups, limit=32 - len(results)):
                candidate.strategy = "numeric_switch_branch_selection"
                results.append(candidate)
                if len(results) >= 32:
                    return results
        return results
    if kind == "stateful":
        terms = children(node)
        if not terms:
            return []
        results = numeric_value_recipe_options(terms[0], desired_value)
        delay_length = parse_literal(node.get("delayLength")) or 1.0
        for candidate in results:
            # Inherited sample times cannot be converted safely here. One second
            # is a bounded warm-up that comfortably covers the short control
            # delays used by the supported TCSD models.
            candidate.hold_s = max(candidate.hold_s, 1.0 if delay_length > 0 else 0.1)
            candidate.strategy = "stateful_numeric_control_path"
        return results
    controller = affine_root_controller(node)
    if controller and not math.isclose(float(controller["scale"]), 0.0, rel_tol=0.0, abs_tol=1e-15):
        root_value = (desired_value - float(controller["offset"])) / float(controller["scale"])
        return [Recipe(
            inputs={str(controller["root_input"]): root_value},
            strategy="affine_numeric_control_path",
        )]
    return []


def traced_numeric_relational_recipe_options(node: dict[str, Any], desired: bool) -> list[Recipe] | None:
    """Solve comparisons whose numeric operand is behind a Switch or state block."""
    terms = children(node)
    if len(terms) != 2:
        return None
    left_constant, right_constant = resolved_scalar_value(terms[0]), resolved_scalar_value(terms[1])
    left_dynamic = contains_kind(terms[0], {"stateful", "switch"})
    right_dynamic = contains_kind(terms[1], {"stateful", "switch"})
    if left_dynamic and right_constant is not None:
        dynamic, threshold, dynamic_on_left = terms[0], right_constant, True
    elif right_dynamic and left_constant is not None:
        dynamic, threshold, dynamic_on_left = terms[1], left_constant, False
    else:
        return None
    operator = str(node.get("operator") or "").strip()
    results: list[Recipe] = []
    for _, value in boundary_values(threshold):
        left, right = (value, threshold) if dynamic_on_left else (threshold, value)
        if comparison_result(operator, left, right) != desired:
            continue
        for candidate in numeric_value_recipe_options(dynamic, value):
            candidate.strategy = "traced_numeric_relational_control"
            results.append(candidate)
            if len(results) >= 32:
                return results
    return results


def numeric_domain(data_type: str) -> tuple[float | None, float | None, float | None]:
    compact = str(data_type or "").strip().lower().replace(" ", "")
    if compact in {"boolean", "bool"}:
        return 0.0, 1.0, 1.0
    integer = re.fullmatch(r"(u?)int(8|16|32|64)", compact)
    if integer:
        unsigned, bits = bool(integer.group(1)), int(integer.group(2))
        return (0.0, float(2**bits - 1), 1.0) if unsigned else (
            float(-(2 ** (bits - 1))),
            float(2 ** (bits - 1) - 1),
            1.0,
        )
    fixed = re.fullmatch(r"fixdt\((0|1),(\d+),([^,()]+)(?:,([^,()]+))?\)", compact)
    if fixed:
        signed, bits = fixed.group(1) == "1", int(fixed.group(2))
        third, fourth = fixed.group(3), fixed.group(4)
        if fourth is None and re.fullmatch(r"\d+", third):
            step = 2.0 ** (-int(third))
            bias = 0.0
        else:
            step = parse_literal(third)
            bias = parse_literal(fourth or 0)
            if step is None or bias is None or step <= 0:
                return None, None, None
        raw_min = -(2 ** (bits - 1)) if signed else 0
        raw_max = 2 ** (bits - 1) - 1 if signed else 2**bits - 1
        return raw_min * step + bias, raw_max * step + bias, step
    return None, None, None


def boundary_values(threshold: float, data_type: str = "") -> list[tuple[str, float]]:
    minimum, maximum, type_step = numeric_domain(data_type)
    delta = type_step or (1.0 if float(threshold).is_integer() else max(0.001, abs(threshold) * 0.01))
    raw = [
        ("below", threshold - delta),
        ("equal", threshold),
        ("above", threshold + delta),
    ]
    values: list[tuple[str, float]] = []
    for position, value in raw:
        if minimum is not None and value < minimum - 1e-12:
            continue
        if maximum is not None and value > maximum + 1e-12:
            continue
        if not any(math.isclose(value, prior, rel_tol=0.0, abs_tol=1e-12) for _, prior in values):
            values.append((position, value))
    return values


def controller_comparison_values(controller: dict[str, Any], root_value: float) -> tuple[float, float]:
    transformed = float(controller["scale"]) * root_value + float(controller["offset"])
    threshold = float(controller["threshold"])
    return (transformed, threshold) if controller["root_on_left"] else (threshold, transformed)


def relational_recipe(node: dict[str, Any], desired: bool) -> Recipe:
    op = str(node.get("operator") or "").strip()
    terms = children(node)
    if len(terms) != 2:
        return Recipe(issues=["relational condition does not have two traced operands"])

    left_root, right_root = direct_root(terms[0]), direct_root(terms[1])
    left_param, right_param = symbolic_constant(terms[0]), symbolic_constant(terms[1])
    left_literal = parse_literal(unwrap(terms[0]).get("value")) if str(unwrap(terms[0]).get("kind") or "").lower() == "constant" else None
    right_literal = parse_literal(unwrap(terms[1]).get("value")) if str(unwrap(terms[1]).get("kind") or "").lower() == "constant" else None

    mux_recipe = mux_relational_recipe(node, desired)
    if mux_recipe is not None:
        return mux_recipe
    switch_recipe = switch_relational_recipe(node, desired)
    if switch_recipe is not None:
        return switch_recipe

    traced_recipe_options = traced_numeric_relational_recipe_options(node, desired)
    if traced_recipe_options is not None:
        return traced_recipe_options[0] if traced_recipe_options else Recipe(issues=[
            "stateful or switched comparison lacks a safe numeric root-input control path"
        ])

    controller = relational_controller(node)
    if controller:
        root = str(controller["root_input"])
        operator = str(controller["operator"])
        candidates = boundary_values(float(controller["root_boundary"]), str(controller.get("data_type") or ""))
        for _, value in candidates:
            left, right = controller_comparison_values(controller, value)
            if comparison_result(operator, left, right) == desired:
                strategy = "root_input_resolved_boundary" if not controller.get("chain") else "affine_root_input_resolved_boundary"
                return Recipe(inputs={root: value}, strategy=strategy)
        return Recipe(issues=[f"relational operator {operator!r} has no safe boundary value for {desired}"])
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
    return Recipe(issues=["comparison threshold is unresolved or lacks a safe root-input controller mapping"])


def relational_recipe_options(
    node: dict[str, Any],
    desired: bool,
    shared_values: dict[str, list[float]] | None = None,
) -> list[Recipe]:
    """Return bounded alternatives so shared root-input constraints can agree."""
    switch_options = switch_relational_recipe_options(node, desired)
    if switch_options is not None:
        return switch_options or [switch_relational_recipe(node, desired)]
    traced_options = traced_numeric_relational_recipe_options(node, desired)
    if traced_options is not None:
        return traced_options or [relational_recipe(node, desired)]
    controller = relational_controller(node)
    if not controller:
        return [relational_recipe(node, desired)]
    root = str(controller["root_input"])
    operator = str(controller["operator"])
    strategy = "root_input_resolved_boundary" if not controller.get("chain") else "affine_root_input_resolved_boundary"
    values = list((shared_values or {}).get(root, []))
    if not values:
        values = [
            value
            for _, value in boundary_values(
                float(controller["root_boundary"]),
                str(controller.get("data_type") or ""),
            )
        ]
    if operator in {"==", "~="} and float(controller["root_boundary"]) >= 0:
        values.sort(key=lambda value: (value < 0, abs(value - float(controller["root_boundary"])), value))
    options = []
    for value in values:
        left, right = controller_comparison_values(controller, value)
        if comparison_result(operator, left, right) == desired:
            options.append(Recipe(inputs={root: value}, strategy=strategy))
    return options or [relational_recipe(node, desired)]


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
    if atom.kind == "membership":
        return membership_recipe(node, desired)
    return Recipe(issues=[f"unsupported atomic condition kind {atom.kind!r}"])


def atom_recipe_options(
    atom: Atom,
    desired: bool,
    shared_values: dict[str, list[float]] | None = None,
) -> list[Recipe]:
    if atom.kind == "relational":
        return relational_recipe_options(unwrap(atom.source), desired, shared_values)
    return [atom_recipe(atom, desired)]


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


def solve_vector_recipe(atoms: list[Atom], vector: tuple[bool, ...]) -> tuple[Recipe, dict[str, str]]:
    shared_values: dict[str, list[float]] = {}
    for atom in atoms:
        if atom.kind != "relational":
            continue
        controller = relational_controller(unwrap(atom.source))
        if not controller:
            continue
        root = str(controller["root_input"])
        for _, value in boundary_values(
            float(controller["root_boundary"]),
            str(controller.get("data_type") or ""),
        ):
            if value not in shared_values.setdefault(root, []):
                shared_values[root].append(value)
    candidates = [
        (index, atom, atom_recipe_options(atom, vector[index], shared_values))
        for index, atom in enumerate(atoms)
    ]
    candidates.sort(key=lambda item: (len(item[2]), item[0]))

    def search(position: int, current: Recipe, strategies: dict[str, str]) -> tuple[Recipe, dict[str, str]] | None:
        if position >= len(candidates):
            return current, strategies
        _, atom, options = candidates[position]
        for option in options:
            merged = Recipe(
                inputs=dict(current.inputs),
                params=dict(current.params),
                hold_s=current.hold_s,
                strategy=current.strategy,
                issues=list(current.issues),
            )
            merge_recipe(merged, option, atom.id)
            if merged.issues:
                continue
            result = search(position + 1, merged, {**strategies, atom.id: option.strategy})
            if result is not None:
                return result
        return None

    result = search(0, Recipe(), {})
    if result is not None:
        return result
    fallback = Recipe()
    strategies: dict[str, str] = {}
    for index, atom in enumerate(atoms):
        option = atom_recipe(atom, vector[index])
        strategies[atom.id] = option.strategy
        merge_recipe(fallback, option, atom.id)
    return fallback, strategies


def reports(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload.get("operators"), (list, dict)):
        return [payload]
    return [
        item for item in payload.values()
        if isinstance(item, dict) and isinstance(item.get("operators"), (list, dict))
    ]


def operator_records(report: dict[str, Any]) -> list[dict[str, Any]]:
    raw = report.get("operators")
    if isinstance(raw, dict):
        return [raw]
    return [item for item in (raw or []) if isinstance(item, dict)]


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
    operators = operator_records(report)
    for operator in operators:
        for port in operator.get("ports", []):
            trace = port.get("trace") if isinstance(port, dict) else None
            if isinstance(trace, dict):
                referenced_logic_ids(trace, referenced)
    result = [operator for operator in operators if str(operator.get("sid") or operator.get("id") or "") not in referenced]
    return result or operators


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
    if len(atoms) > MAX_ATOMIC_CONDITIONS:
        return [], {
            "operator_id": operator.get("id"),
            "block_path": operator.get("block_path"),
            "condition_count": len(atoms),
            "issues": [
                f"more than {MAX_ATOMIC_CONDITIONS} atomic conditions; bounded planner stopped"
            ],
        }

    pairs = masking_pairs(ast, len(atoms))
    probe_vector_compatible = all(
        isinstance(child, dict) and child.get("kind") == "atom"
        for child in ast.get("children", [])
    ) and len(ast.get("children", [])) == len(atoms)
    selected, chosen, missing = select_minimal_vectors(pairs)
    if len(selected) > 2 * len(atoms) + 2:
        raise ValueError("minimal MC/DC planner exceeded the bounded 2N+2 case limit")

    obligations: list[dict[str, Any]] = []
    op_id = str(operator.get("id") or operator.get("sid") or "LOGIC")
    pair_memberships: dict[tuple[bool, ...], list[dict[str, Any]]] = {}
    for condition_index, pair in sorted(chosen.items()):
        pair_id = f"{op_id}_pair_{atoms[condition_index].id}"
        false_vector, true_vector = sorted(pair, key=lambda vector: vector[condition_index])
        descriptor = {
            "pair_id": pair_id,
            "condition_id": atoms[condition_index].id,
            "condition_label": atoms[condition_index].label,
            "false_vector": vector_label(false_vector),
            "true_vector": vector_label(true_vector),
        }
        for vector in pair:
            pair_memberships.setdefault(vector, []).append(descriptor)
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
                "required_outcome": f"no masking pair available for condition {atom.id}",
                "condition_states": {},
                "match": {"inputs": {}, "params": {}},
                "issues": [f"no_masking_pair: condition {atom.id}"],
            }
        )
    for vector in selected:
        recipe, strategies = solve_vector_recipe(atoms, vector)
        condition_states: dict[str, bool] = {}
        for index, desired in enumerate(vector):
            atom = atoms[index]
            condition_states[atom.id] = desired
        label = vector_label(vector)
        top_level_vector = vector_label(tuple(evaluate(child, vector) for child in ast.get("children", [])))
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
                "pattern_type": f"{str(operator.get('operator') or '').lower()}_sensitization",
                "control_recipe": {
                    "kind": "logical_sensitization",
                    "operator": str(operator.get("operator") or "").upper(),
                    "condition_vector": label,
                    "operator_input_vector": top_level_vector,
                    "probe_vector_compatible": probe_vector_compatible,
                },
                "mcdc_pairs": pair_memberships.get(vector, []),
                "issues": recipe.issues,
            }
        )

    for atom_index, atom in enumerate(atoms):
        node = unwrap(atom.source)
        if atom.kind != "relational" or atom_index not in chosen:
            continue
        controller = relational_controller(node)
        if not controller or controller["operator"] not in {">", ">=", "<", "<=", "=="}:
            continue
        pair = chosen[atom_index]
        for position, value in boundary_values(float(controller["root_boundary"]), str(controller.get("data_type") or "")):
            left, right = controller_comparison_values(controller, value)
            desired = comparison_result(str(controller["operator"]), left, right)
            vector = next((candidate for candidate in pair if candidate[atom_index] == desired), None)
            if vector is None:
                continue
            recipe = Recipe(hold_s=0.1)
            strategies: dict[str, str] = {}
            for index, atom_desired in enumerate(vector):
                candidate_atom = atoms[index]
                if index == atom_index:
                    candidate_recipe = Recipe(
                        inputs={str(controller["root_input"]): value},
                        strategy="simple_comparator_boundary",
                    )
                else:
                    candidate_recipe = atom_recipe(candidate_atom, atom_desired)
                strategies[candidate_atom.id] = candidate_recipe.strategy
                merge_recipe(recipe, candidate_recipe, candidate_atom.id)
            status = "required" if recipe.resolved else "unresolved"
            obligations.append(
                {
                    "id": f"{op_id}_condition_{atom.id}_boundary_{position}",
                    "model": model,
                    "block_path": operator.get("block_path"),
                    "sid": operator.get("sid") or operator.get("id"),
                    "operator": operator.get("operator"),
                    "coverage_class": "Condition",
                    "status": status,
                    "required_outcome": (
                        f"{atom.id} boundary {position}: "
                        f"{controller['root_input']}={value:g}, condition={str(desired).lower()}"
                    ),
                    "condition_states": {atoms[index].id: state for index, state in enumerate(vector)},
                    "match": {"inputs": recipe.inputs, "params": recipe.params},
                    "hold_s": recipe.hold_s,
                    "mapping_strategies": strategies,
                    "pattern_type": "simple_comparator_boundary",
                    "control_recipe": {
                        "kind": "simple_comparator_boundary",
                        "root_input": controller["root_input"],
                        "operator": controller["operator"],
                        "threshold": controller["threshold"],
                        "root_boundary": controller["root_boundary"],
                        "threshold_expression": controller["threshold_expression"],
                        "threshold_source": controller["threshold_source"],
                        "data_type": controller.get("data_type") or "",
                        "control_chain": controller.get("chain") or [],
                        "probe_vector_compatible": probe_vector_compatible,
                        "boundary_position": position,
                        "stimulus_value": value,
                    },
                    "detector_evidence": {
                        "relational_path": node.get("path"),
                        "relational_sid": node.get("sid"),
                        "threshold_resolved": True,
                    },
                    "issues": recipe.issues,
                }
            )

    condition_pairs = []
    for index, pair in sorted(chosen.items()):
        false_vector, true_vector = sorted(pair, key=lambda vector: vector[index])
        condition_pairs.append(
            {
                "pair_id": f"{op_id}_pair_{atoms[index].id}",
                "condition_id": atoms[index].id,
                "condition_label": atoms[index].label,
                "false_true_pair": [vector_label(false_vector), vector_label(true_vector)],
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
        "generation_mode": "minimal_masking_mcdc",
        "mcdc_mode": "Masking",
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
