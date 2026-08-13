#!/usr/bin/env python3
"""Classify state/timing targets from actual MATLAB probe observations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def model_report(payload: dict[str, Any], model: str) -> dict[str, Any]:
    value = payload.get(model, payload)
    return value if isinstance(value, dict) else {}


def target_key(target: dict[str, Any]) -> str:
    return f"{target.get('operator_id', '')}#{int(target.get('port_index') or 0)}"


def merge_passes(
    primary_plan: dict[str, Any],
    primary_results: dict[str, Any],
    additional_plan: dict[str, Any],
    additional_results: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    model = str(primary_plan.get("model") or "")
    merged_plan = json.loads(json.dumps(primary_plan))
    merged_plan["tests"] = [
        *(primary_plan.get("tests") or []),
        *(additional_plan.get("tests") or []),
    ]
    merged_plan["backup_tests"] = []
    merged_plan["summary"] = {
        **(primary_plan.get("summary") or {}),
        "primary_executed_candidate_count": len(primary_plan.get("tests") or []),
        "second_pass_executed_candidate_count": len(additional_plan.get("tests") or []),
        "total_executed_candidate_count": len(merged_plan["tests"]),
    }
    first = model_report(primary_results, model)
    second = model_report(additional_results, model)
    merged_report = {
        **first,
        "observations": [*(first.get("observations") or []), *(second.get("observations") or [])],
        "skipped_tests": [*(first.get("skipped_tests") or []), *(second.get("skipped_tests") or [])],
    }
    return merged_plan, {model: merged_report}


def classify_targets(plan: dict[str, Any], results: dict[str, Any]) -> dict[str, Any]:
    model = str(plan.get("model") or "")
    report = model_report(results, model)
    tests = {
        str(test.get("test_id") or ""): test
        for test in [*(plan.get("tests") or []), *(plan.get("backup_tests") or [])]
        if isinstance(test, dict) and test.get("test_id")
    }
    observations_by_test: dict[str, list[dict[str, Any]]] = {}
    for observation in report.get("observations") or []:
        if isinstance(observation, dict):
            observations_by_test.setdefault(str(observation.get("test_id") or ""), []).append(observation)
    skipped = {
        str(item.get("test_id") or ""): item
        for item in report.get("skipped_tests") or []
        if isinstance(item, dict) and item.get("test_id")
    }
    records: list[dict[str, Any]] = []
    for target in plan.get("targets") or []:
        if not isinstance(target, dict):
            continue
        key = target_key(target)
        target_tests = [test for test in tests.values() if target_key(test.get("target") or {}) == key]
        executed = [test for test in target_tests if str(test.get("test_id") or "") in observations_by_test or str(test.get("test_id") or "") in skipped]
        valid_observations = 0
        missing_observations = 0
        plan_conflicts = 0
        expected_direction_conflicts = 0
        simulation_mismatches = 0
        strict_successes = 0
        causal_transitions = 0
        no_transitions = 0
        observed_transitions: set[str] = set()
        resource_gaps: set[str] = set()
        for test in executed:
            test_id = str(test.get("test_id") or "")
            skip = skipped.get(test_id)
            if skip and skip.get("reason") == "missing_external_resource":
                resource_gaps.add(str(skip.get("resource") or "unknown"))
                continue
            values_by_step: dict[int, bool] = {}
            for observation in observations_by_test.get(test_id, []):
                if observation.get("prediction_status") == "simulation_mismatch":
                    plan_conflicts += 1
                    simulation_mismatches += 1
                vectors = observation.get("vectors") if isinstance(observation.get("vectors"), dict) else {}
                vector = next((
                    value for value in vectors.values()
                    if isinstance(value, dict) and str(value.get("id") or "") == str(target.get("operator_id") or "")
                ), None)
                port_index = int(target.get("port_index") or 0)
                raw_values = vector.get("values") if isinstance(vector, dict) else None
                if not isinstance(vector, dict) or vector.get("ok") is not True or not isinstance(raw_values, list) or not 1 <= port_index <= len(raw_values):
                    missing_observations += 1
                    continue
                valid_observations += 1
                values_by_step[int(observation.get("step_index") or 0)] = bool(raw_values[port_index - 1])
            evidence_step = int(test.get("evidence_step") or 0)
            if 1 not in values_by_step or evidence_step not in values_by_step:
                missing_observations += 1
                continue
            start_value = values_by_step[1]
            end_value = values_by_step[evidence_step]
            observed_transition = f"{int(start_value)}->{int(end_value)}"
            observed_transitions.add(observed_transition)
            if start_value == end_value:
                no_transitions += 1
                continue
            causal_transitions += 1
            expected_transition = str((test.get("target") or {}).get("expected_target_transition") or "")
            if expected_transition:
                if observed_transition == expected_transition:
                    strict_successes += 1
                else:
                    plan_conflicts += 1
                    expected_direction_conflicts += 1
        if target.get("status") != "planned" or not target_tests:
            status = "unplanned"
        elif resource_gaps:
            status = "resource_missing"
        elif strict_successes:
            status = "strict_success"
        elif plan_conflicts:
            status = "plan_conflict"
        elif causal_transitions:
            status = "direction_unverified"
        elif no_transitions:
            status = "no_transition"
        elif executed:
            status = "observation_missing"
        else:
            status = "not_executed"
        records.append({
            "targetKey": key,
            "operatorId": str(target.get("operator_id") or ""),
            "portIndex": int(target.get("port_index") or 0),
            "status": status,
            "observedTargetTransitions": sorted(observed_transitions),
            "strictSuccessCount": strict_successes,
            "causalTransitionCount": causal_transitions,
            "noTransitionCount": no_transitions,
            "validObservationCount": valid_observations,
            "missingObservationCount": missing_observations,
            "planConflictCount": plan_conflicts,
            "expectedDirectionConflictCount": expected_direction_conflicts,
            "simulationMismatchCount": simulation_mismatches,
            "resourceGaps": sorted(resource_gaps),
            "executedCandidateCount": len(executed),
            "needsSecondPass": status in {"plan_conflict", "no_transition", "observation_missing"},
            "causalOnlyReason": str(target.get("causal_only_reason") or ""),
        })
    counts: dict[str, int] = {}
    causal_reason_counts: dict[str, int] = {}
    for record in records:
        counts[record["status"]] = counts.get(record["status"], 0) + 1
        reason = str(record.get("causalOnlyReason") or "")
        if reason:
            causal_reason_counts[reason] = causal_reason_counts.get(reason, 0) + 1
    expected_direction_conflict_targets = sum(
        1 for record in records if int(record.get("expectedDirectionConflictCount") or 0) > 0
    )
    simulation_mismatch_targets = sum(
        1 for record in records if int(record.get("simulationMismatchCount") or 0) > 0
    )
    return {
        "schema": "tcsd-state-probe-target-classification/v1",
        "model": model,
        "targetCount": len(records),
        "statusCounts": counts,
        "causalOnlyReasonCounts": causal_reason_counts,
        "expectedDirectionConflictTargetCount": expected_direction_conflict_targets,
        "simulationMismatchTargetCount": simulation_mismatch_targets,
        "targets": records,
    }


def second_pass_plan(plan: dict[str, Any], classification: dict[str, Any]) -> dict[str, Any]:
    unresolved = {
        str(item.get("targetKey") or ""): item
        for item in classification.get("targets") or []
        if isinstance(item, dict) and item.get("needsSecondPass") is True
    }
    selected: list[dict[str, Any]] = []
    selection_records: list[dict[str, Any]] = []
    seen: set[str] = set()
    backups_by_target: dict[str, list[dict[str, Any]]] = {}
    for test in plan.get("backup_tests") or []:
        if not isinstance(test, dict):
            continue
        key = target_key(test.get("target") or {})
        if key in unresolved:
            backups_by_target.setdefault(key, []).append(test)
    for key, record in unresolved.items():
        if key in seen:
            continue
        backups = backups_by_target.get(key, [])
        if not backups:
            continue
        observed = record.get("observedTargetTransitions") if isinstance(record.get("observedTargetTransitions"), list) else []
        desired_target_transition = ""
        if observed and all(value == "0->0" for value in observed):
            desired_target_transition = "0->1"
        elif observed and all(value == "1->1" for value in observed):
            desired_target_transition = "1->0"

        def candidate_rank(test: dict[str, Any]) -> tuple[int, int, float]:
            target = test.get("target") if isinstance(test.get("target"), dict) else {}
            expected = str(target.get("expected_target_transition") or "")
            matches_missing_direction = 1 if desired_target_transition and expected == desired_target_transition else 0
            is_strict = 1 if expected else 0
            return matches_missing_direction, is_strict, float(target.get("hold_s") or 0)

        eligible_backups = [
            test for test in backups
            if desired_target_transition
            and str((test.get("target") or {}).get("expected_target_transition") or "")
            == desired_target_transition
        ]
        if not eligible_backups:
            continue
        test = max(eligible_backups, key=candidate_rank)
        seen.add(key)
        candidate = json.loads(json.dumps(test))
        candidate["row"] = len(selected) + 1
        candidate["test_id"] = f"STATE_PROBE_SECONDARY_{len(selected) + 1:04d}"
        selection_reason = "missing_target_direction"
        selected.append(candidate)
        selection_records.append({
            "testId": candidate["test_id"],
            "targetKey": key,
            "reason": selection_reason,
            "expectedTargetTransition": str(
                (candidate.get("target") or {}).get("expected_target_transition") or ""
            ),
        })
    return {
        **{key: value for key, value in plan.items() if key not in {"tests", "backup_tests", "summary"}},
        "tests": selected,
        "backup_tests": [],
        "selection_records": selection_records,
        "summary": {
            **(plan.get("summary") or {}),
            "candidate_count": len(selected),
            "primary_candidate_count": 0,
            "backup_candidate_count": 0,
            "second_pass_target_count": len(unresolved),
            "second_pass_candidate_count": len(selected),
            "second_pass_unplanned_count": len(unresolved) - len(selected),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--results", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--second-pass-output", default="")
    parser.add_argument("--additional-plan", default="")
    parser.add_argument("--additional-results", default="")
    args = parser.parse_args()
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    results = json.loads(Path(args.results).read_text(encoding="utf-8"))
    if bool(args.additional_plan) != bool(args.additional_results):
        raise SystemExit("additional plan and results must be provided together")
    if args.additional_plan:
        plan, results = merge_passes(
            plan,
            results,
            json.loads(Path(args.additional_plan).read_text(encoding="utf-8")),
            json.loads(Path(args.additional_results).read_text(encoding="utf-8")),
        )
    classification = classify_targets(plan, results)
    Path(args.output).write_text(json.dumps(classification, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.second_pass_output:
        Path(args.second_pass_output).write_text(
            json.dumps(second_pass_plan(plan, classification), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    print(json.dumps({"output": args.output, **classification["statusCounts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
