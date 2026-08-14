#!/usr/bin/env python3
"""判定第十阶段候选套件是否新增了 MC/DC 独立影响对。"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


SCHEMA = "tcsd-mcdc-coverage-delta/v1"
MODE_VALUES = {"Masking", "UniqueCause"}
CONDITION_RE = re.compile(r"(?:\bC|\bcondition\s*|\bport\s*|端口|input\s*)(\d+)", re.I)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def model_record(payload: dict[str, Any], model: str) -> dict[str, Any]:
    records = payload.get("models", payload)
    if not isinstance(records, dict):
        raise ValueError("coverage report has no model records")
    record = records.get(model)
    if isinstance(record, dict):
        return record
    values = [value for value in records.values() if isinstance(value, dict)]
    if len(values) != 1:
        raise ValueError(f"coverage report does not contain model {model}")
    return values[0]


def normalized_mode(record: dict[str, Any]) -> str:
    value = str(record.get("mcdc_mode") or record.get("mcdcMode") or "").strip()
    if value not in MODE_VALUES:
        raise ValueError("coverage report does not declare a supported mcdc_mode")
    return value


def verified_context(record: dict[str, Any], label: str) -> tuple[str, str, list[str]]:
    checksum = str(record.get("model_checksum") or record.get("modelChecksum") or "").strip()
    support_library = str(record.get("support_library_path") or record.get("supportLibraryPath") or "").strip()
    if not checksum:
        raise ValueError(f"{label} coverage report does not declare model_checksum")
    if not support_library or not support_library.lower().endswith("itklib.slx"):
        raise ValueError(f"{label} coverage report does not declare the loaded ITKLib path")
    init_scripts = record.get("initialization_scripts")
    if not isinstance(init_scripts, list):
        raise ValueError(f"{label} coverage report does not declare initialization_scripts")
    return checksum, support_library, [str(value) for value in init_scripts]


def decoded_description(item: dict[str, Any]) -> dict[str, Any]:
    value = item.get("description")
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            decoded = json.loads(value)
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def condition_number(text: Any) -> int | None:
    match = CONDITION_RE.search(str(text or ""))
    return int(match.group(1)) if match else None


def conditions(item: dict[str, Any]) -> list[dict[str, Any]]:
    raw = decoded_description(item).get("condition")
    if isinstance(raw, dict):
        return [raw]
    return [value for value in raw or [] if isinstance(value, dict)]


def items_by_block(record: dict[str, Any], coverage_class: str) -> dict[tuple[str, str], dict[str, Any]]:
    found: dict[tuple[str, str], dict[str, Any]] = {}
    source = record.get("mcdc_items") if coverage_class == "MCDC" else None
    if not isinstance(source, list):
        source = record.get("items", [])
    for item in source:
        if not isinstance(item, dict) or item.get("coverage_class") != coverage_class:
            continue
        key = (str(item.get("block_path") or ""), str(item.get("sid") or ""))
        found[key] = item
    return found


def find_block(
    values: dict[tuple[str, str], dict[str, Any]], path: str, sid: str
) -> dict[str, Any] | None:
    exact = values.get((path, sid))
    if exact:
        return exact
    matches = [item for (item_path, item_sid), item in values.items() if (path and item_path == path) or (sid and item_sid == sid)]
    return matches[0] if len(matches) == 1 else None


def find_condition(item: dict[str, Any] | None, target_number: int | None) -> dict[str, Any] | None:
    values = conditions(item or {})
    if target_number is not None:
        matches = [value for value in values if condition_number(value.get("text")) == target_number]
        if len(matches) == 1:
            return matches[0]
    return values[0] if len(values) == 1 else None


def count_value(item: dict[str, Any] | None, *names: str) -> float:
    if not isinstance(item, dict):
        return 0
    for name in names:
        value = item.get(name)
        if isinstance(value, (int, float)):
            return float(value)
    return 0


def metric_covered(record: dict[str, Any], name: str) -> float:
    metric = record.get(name)
    if not isinstance(metric, dict):
        return 0
    return count_value(metric, "covered")


def classify_failure(
    *,
    mode: str,
    target_number: int | None,
    condition_item: dict[str, Any] | None,
    decision_item: dict[str, Any] | None,
    mcdc_condition: dict[str, Any] | None,
) -> tuple[str, dict[str, Any]]:
    condition_values = conditions(condition_item or {})
    observed_condition = find_condition(condition_item, target_number)
    true_count = count_value(observed_condition, "trueCnts", "trueCount")
    false_count = count_value(observed_condition, "falseCnts", "falseCount")
    evidence = {
        "conditionTrueCount": true_count,
        "conditionFalseCount": false_count,
        "requiredTrueVector": str((mcdc_condition or {}).get("trueRslt") or (mcdc_condition or {}).get("trueResult") or ""),
        "requiredFalseVector": str((mcdc_condition or {}).get("falseRslt") or (mcdc_condition or {}).get("falseResult") or ""),
    }
    if condition_values and (true_count <= 0 or false_count <= 0):
        return "target_condition_not_toggled", evidence

    decision_description = decoded_description(decision_item or {})
    outcomes = decision_description.get("decision", decision_description)
    outcome_values: list[dict[str, Any]] = []
    if isinstance(outcomes, dict):
        outcomes = [outcomes]
    for decision in outcomes or []:
        if not isinstance(decision, dict):
            continue
        raw = decision.get("outcome", [])
        if isinstance(raw, dict):
            raw = [raw]
        outcome_values.extend(value for value in raw if isinstance(value, dict))
    counts = [count_value(value, "executionCount") for value in outcome_values]
    evidence["decisionOutcomeCounts"] = counts
    if counts and any(value <= 0 for value in counts):
        return "decision_not_toggled", evidence

    true_vector = evidence["requiredTrueVector"]
    false_vector = evidence["requiredFalseVector"]
    if not true_vector or not false_vector or "(" in true_vector or "(" in false_vector:
        return "complementary_vector_missing", evidence
    if mode == "UniqueCause":
        return "other_conditions_not_held", evidence
    return "effect_masked", evidence


def judge(*, baseline: dict[str, Any], candidate: dict[str, Any], repair_ir: dict[str, Any], model: str) -> dict[str, Any]:
    before = model_record(baseline, model)
    after = model_record(candidate, model)
    before_mode = normalized_mode(before)
    after_mode = normalized_mode(after)
    if before_mode != after_mode:
        raise ValueError(f"mcdc_mode mismatch: baseline={before_mode}, candidate={after_mode}")
    before_checksum, before_library, before_init = verified_context(before, "baseline")
    after_checksum, after_library, after_init = verified_context(after, "candidate")
    if before_checksum != after_checksum:
        raise ValueError("model_checksum mismatch between baseline and candidate coverage")
    if before_library != after_library:
        raise ValueError("ITKLib path mismatch between baseline and candidate coverage")
    if before_init != after_init:
        raise ValueError("initialization script mismatch between baseline and candidate coverage")

    before_mcdc = items_by_block(before, "MCDC")
    after_mcdc = items_by_block(after, "MCDC")
    after_condition = items_by_block(after, "Condition")
    after_decision = items_by_block(after, "Decision")
    results: list[dict[str, Any]] = []
    for item in repair_ir.get("items", []):
        if not isinstance(item, dict) or item.get("coverage_class") != "MCDC":
            continue
        block = item.get("block") if isinstance(item.get("block"), dict) else {}
        path = str(block.get("path") or "")
        sid = str(block.get("sid") or "")
        number = condition_number(item.get("required_outcome"))
        before_block = find_block(before_mcdc, path, sid)
        after_block = find_block(after_mcdc, path, sid)
        before_condition = find_condition(before_block, number)
        after_mcdc_condition = find_condition(after_block, number)
        was_achieved = bool((before_condition or {}).get("achieved"))
        is_achieved = bool((after_mcdc_condition or {}).get("achieved"))
        gained = is_achieved and not was_achieved
        result: dict[str, Any] = {
            "candidateId": str(item.get("id") or ""),
            "sourceObligationId": str(item.get("source_obligation_id") or ""),
            "block": {"path": path, "sid": sid},
            "conditionNumber": number,
            "beforeAchieved": was_achieved,
            "afterAchieved": is_achieved,
            "newIndependentEffectPair": gained,
        }
        if gained:
            result["reasonCode"] = "independent_effect_pair_added"
        elif is_achieved:
            result["reasonCode"] = "already_covered_before_candidate_suite"
        else:
            reason, evidence = classify_failure(
                mode=before_mode,
                target_number=number,
                condition_item=find_block(after_condition, path, sid),
                decision_item=find_block(after_decision, path, sid),
                mcdc_condition=after_mcdc_condition,
            )
            result["reasonCode"] = reason
            result["evidence"] = evidence
        results.append(result)

    gained = [result for result in results if result["newIndependentEffectPair"]]
    before_global_mcdc = metric_covered(before, "mcdc")
    after_global_mcdc = metric_covered(after, "mcdc")
    global_mcdc_delta = after_global_mcdc - before_global_mcdc
    # A suite with MC/DC targets must add at least one new independent-effect
    # pair at its declared target or add MC/DC coverage elsewhere in the same
    # measured model. The latter preserves useful incidental contributions
    # while still rejecting a suite with no measured MC/DC gain.
    target_gain_passed = bool(gained) and all(
        result["newIndependentEffectPair"]
        or result["reasonCode"] == "already_covered_before_candidate_suite"
        for result in results
    )
    global_gain_passed = global_mcdc_delta > 0
    passed = (not results) or target_gain_passed or global_gain_passed
    accepted_ids = [result["candidateId"] for result in gained]
    if global_gain_passed and not accepted_ids:
        accepted_ids = [result["candidateId"] for result in results]
    acceptance_reason = "not_applicable"
    if target_gain_passed:
        acceptance_reason = "declared_target_independent_effect_pair_added"
    elif global_gain_passed:
        acceptance_reason = "suite_added_global_mcdc_coverage"
    elif results:
        acceptance_reason = "no_measured_mcdc_gain"
    return {
        "schema": SCHEMA,
        "model": model,
        "mcdcMode": before_mode,
        "modelChecksum": before_checksum,
        "supportLibraryPath": before_library,
        "initializationScripts": before_init,
        "comparison": "candidate_full_suite_minus_baseline_suite",
        "applicable": bool(results),
        "targetCount": len(results),
        "newIndependentEffectPairCount": len(gained),
        "globalMcdcCoveredBefore": before_global_mcdc,
        "globalMcdcCoveredAfter": after_global_mcdc,
        "globalMcdcCoveredDelta": global_mcdc_delta,
        "passed": passed,
        "acceptanceReason": acceptance_reason,
        "acceptedCandidateIds": accepted_ids,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--repair-ir", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    try:
        report = judge(
            baseline=read_json(Path(args.baseline).resolve()),
            candidate=read_json(Path(args.candidate).resolve()),
            repair_ir=read_json(Path(args.repair_ir).resolve()),
            model=args.model,
        )
    except Exception as error:
        report = {"schema": SCHEMA, "model": args.model, "passed": False, "error": {"code": "mcdc_delta_judgement_failed", "message": str(error)}}
        write_json(output, report)
        print(str(error), file=__import__("sys").stderr)
        return 1
    write_json(output, report)
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
