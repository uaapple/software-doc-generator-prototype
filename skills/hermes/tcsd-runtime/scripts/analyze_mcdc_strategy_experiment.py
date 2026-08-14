#!/usr/bin/env python3
"""Compare the legacy candidate view with pair-complete MC/DC planning.

This command is intentionally independent of the twelve-stage executor.  It
uses the production atomic planner directly, so a strategy proven here can be
wired into Stage 5/7 without maintaining a second implementation.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


def planner_module() -> Any:
    path = Path(__file__).with_name("build_atomic_mcdc_repair_plan.py")
    spec = importlib.util.spec_from_file_location("tcsd_atomic_experiment_planner", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load(path: str | Path) -> dict[str, Any]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return value


def vector_from_outcome(value: Any) -> str:
    text = str(value or "")
    for prefix in ("atomic_condition_vector=", "operator_input_vector="):
        if prefix in text:
            return text.split(prefix, 1)[1].split(";", 1)[0].strip()
    return ""


def legacy_vectors(ir: dict[str, Any]) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for item in ir.get("items", []):
        if not isinstance(item, dict) or item.get("coverage_class") != "MCDC":
            continue
        reachability = item.get("reachability") if isinstance(item.get("reachability"), dict) else {}
        if reachability.get("status") != "required":
            continue
        block = item.get("block") if isinstance(item.get("block"), dict) else {}
        path = str(block.get("path") or "")
        vector = vector_from_outcome(item.get("required_outcome"))
        if path and vector:
            result.setdefault(path, set()).add(vector)
    return result


def run_experiment(
    traces: dict[str, Any],
    legacy_ir: dict[str, Any] | None = None,
    *,
    all_operators: bool = False,
    operator_ids: set[str] | None = None,
) -> dict[str, Any]:
    planner = planner_module()
    matched = planner.reports(traces)
    if len(matched) != 1:
        raise ValueError("logical trace input must contain exactly one model report")
    report = matched[0]
    model = str(report.get("model") or traces.get("model") or "")
    old_vectors = legacy_vectors(legacy_ir or {})
    decisions: list[dict[str, Any]] = []
    totals = {
        "decisionCount": 0,
        "conditionCount": 0,
        "designedPairCount": 0,
        "executablePairCount": 0,
        "legacyCompletePairCount": 0,
        "newlyDesignedExecutablePairCount": 0,
    }
    selected_operators = planner.operator_records(report) if all_operators or operator_ids else planner.top_operators(report)
    if operator_ids:
        selected_operators = [
            operator for operator in selected_operators
            if str(operator.get("id") or operator.get("sid") or "") in operator_ids
        ]
    for operator in selected_operators:
        obligations, summary = planner.build_for_operator(model, operator)
        by_vector = {
            vector_from_outcome(item.get("required_outcome")): item
            for item in obligations
            if item.get("coverage_class") == "MCDC" and vector_from_outcome(item.get("required_outcome"))
        }
        path = str(summary.get("block_path") or operator.get("block_path") or "")
        pairs: list[dict[str, Any]] = []
        for pair in summary.get("pairs", []):
            false_vector, true_vector = pair.get("false_true_pair") or ["", ""]
            false_item, true_item = by_vector.get(false_vector), by_vector.get(true_vector)
            executable = bool(
                false_item
                and true_item
                and false_item.get("status") == "required"
                and true_item.get("status") == "required"
            )
            legacy_complete = false_vector in old_vectors.get(path, set()) and true_vector in old_vectors.get(path, set())
            pairs.append({
                **pair,
                "executable": executable,
                "legacyComplete": legacy_complete,
                "newlyDesigned": executable and not legacy_complete,
                "falseController": (false_item or {}).get("match") or {},
                "trueController": (true_item or {}).get("match") or {},
                "falseExpectedOperatorVector": ((false_item or {}).get("control_recipe") or {}).get("operator_input_vector") or "",
                "trueExpectedOperatorVector": ((true_item or {}).get("control_recipe") or {}).get("operator_input_vector") or "",
                "issues": sorted({
                    str(issue)
                    for item in (false_item, true_item)
                    if item
                    for issue in item.get("issues", [])
                }),
            })
        decision = {
            "operatorId": summary.get("operator_id"),
            "blockPath": path,
            "operator": operator.get("operator"),
            "conditionCount": summary.get("condition_count", 0),
            "selectedVectorCount": summary.get("emitted_vector_count", 0),
            "pairCount": len(pairs),
            "executablePairCount": sum(item["executable"] for item in pairs),
            "legacyCompletePairCount": sum(item["legacyComplete"] for item in pairs),
            "newlyDesignedExecutablePairCount": sum(item["newlyDesigned"] for item in pairs),
            "pairs": pairs,
            "issues": summary.get("issues") or [],
        }
        decisions.append(decision)
        totals["decisionCount"] += 1
        totals["conditionCount"] += int(decision["conditionCount"] or 0)
        totals["designedPairCount"] += decision["pairCount"]
        totals["executablePairCount"] += decision["executablePairCount"]
        totals["legacyCompletePairCount"] += decision["legacyCompletePairCount"]
        totals["newlyDesignedExecutablePairCount"] += decision["newlyDesignedExecutablePairCount"]
    return {
        "schema": "simulink-ut-mcdc-strategy-experiment/v1",
        "model": model,
        "summary": totals,
        "decisions": decisions,
    }


def verification_cases(
    experiment: dict[str, Any],
    baseline_cases: dict[str, Any],
    *,
    max_pairs: int,
) -> dict[str, Any]:
    baseline = (baseline_cases.get("tests") or [{}])[0]
    baseline_inputs = dict(baseline.get("init_values") or {})
    tests: list[dict[str, Any]] = []
    seen: dict[str, str] = {}
    selected = 0
    for decision in experiment.get("decisions", []):
        for pair in decision.get("pairs", []):
            if not pair.get("newlyDesigned") or selected >= max_pairs:
                continue
            selected += 1
            for state in ("false", "true"):
                controller = pair.get(f"{state}Controller") or {}
                inputs = {**baseline_inputs, **(controller.get("inputs") or {})}
                params = dict(controller.get("params") or {})
                expected = pair.get(f"{state}ExpectedOperatorVector") or ""
                signature = json.dumps({"inputs": inputs, "params": params, "expected": expected}, sort_keys=True)
                if signature in seen:
                    continue
                test_id = f"PAIR_{selected:02d}_{state.upper()}"
                seen[signature] = test_id
                tests.append({
                    "row": len(tests) + 1,
                    "test_id": test_id,
                    "name": f"{pair.get('condition_id')} {state} pair member",
                    "init_values": inputs,
                    "init_params": params,
                    "steps": [{
                        "marker": "[+0.1s]",
                        "delay_s": 0.1,
                        "input_updates": {},
                        "param_updates": {},
                        "index": 1,
                    }],
                    "target": {
                        "operator_id": decision.get("operatorId"),
                        "expected_vector": [value == "T" for value in expected],
                        "pair_id": pair.get("pair_id"),
                        "condition_id": pair.get("condition_id"),
                        "member": state,
                    },
                })
    return {
        "schema": "tcsd-extracted-cases/v1",
        "model": experiment.get("model"),
        "tests": tests,
        "experiment": {
            "selectedPairCount": selected,
            "testCount": len(tests),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logical-traces", required=True)
    parser.add_argument("--legacy-coverage-ir")
    parser.add_argument("--output", required=True)
    parser.add_argument("--baseline-cases")
    parser.add_argument("--verification-cases")
    parser.add_argument("--max-verification-pairs", type=int, default=3)
    parser.add_argument("--all-operators", action="store_true")
    parser.add_argument("--operator-id", action="append", default=[])
    args = parser.parse_args()
    result = run_experiment(
        load(args.logical_traces),
        load(args.legacy_coverage_ir) if args.legacy_coverage_ir else None,
        all_operators=args.all_operators,
        operator_ids=set(args.operator_id),
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.verification_cases:
        if not args.baseline_cases:
            raise ValueError("--baseline-cases is required with --verification-cases")
        cases = verification_cases(
            result,
            load(args.baseline_cases),
            max_pairs=max(1, args.max_verification_pairs),
        )
        cases_path = Path(args.verification_cases)
        cases_path.parent.mkdir(parents=True, exist_ok=True)
        cases_path.write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **result["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
