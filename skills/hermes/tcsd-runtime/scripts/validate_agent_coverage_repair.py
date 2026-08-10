#!/usr/bin/env python3
"""Build a bounded repair brief and validate an Agent-authored coverage repair."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


BRIEF_SCHEMA = "tcsd-coverage-repair-brief/v1"
PROPOSAL_SCHEMA = "tcsd-agent-coverage-repair-proposal/v1"
VALIDATION_SCHEMA = "tcsd-agent-coverage-repair-validation/v1"
IR_SCHEMA = "simulink-ut-tcsd-coverage-ir/v1"
ALLOWED_CLASSES = {"Condition", "Decision", "MCDC"}
ALLOWED_UNRESOLVED_REASONS = {
    "logic_unreachable",
    "missing_parameter_control",
    "state_sequence_not_constructible",
    "probe_target_unobservable",
    "unsupported_model_semantics",
}
IDENTIFIER_RE = re.compile(r"^[A-Za-z_]\w*$")
SAMPLE_PERIOD_TEXT_RE = re.compile(
    r"(?i)(simulation|solver|sample|sampling|unit\s*delay|counter|timer|"
    r"stored\s+state|feedback\s+path|stateful|周期|采样|计数|仿真|状态|反馈)"
)
ACTION_STEP_LIMIT_TEXT_RE = re.compile(
    r"(?i)(exceed(?:s|ing|ed)?|more\s+than|greater\s+than|over|超过|大于|超出)"
    r".{0,80}(?:action\s*)?(?:step|steps|步|guardrail|limit|限制)"
    r"|(?:step|steps|步|guardrail|limit|限制).{0,80}"
    r"(?:exceed(?:s|ing|ed)?|more\s+than|greater\s+than|over|超过|大于|超出)"
)
STATE_TRANSITION_BUDGET_TEXT_RE = re.compile(
    r"(?is)(?:requir(?:e|es|ed|ing)|demand(?:s|ed|ing)?|need(?:s|ed|ing)?)"
    r".{0,120}\b(?:toggle|toggles|transition|transitions|increment|increments|"
    r"update|updates|advance|advances)\b"
    r".{0,320}\b(?:step|steps|entry|entries|budget|guardrail|limit)\b"
    r"|\b(?:step|steps|entry|entries|budget|guardrail|limit)\b"
    r".{0,320}(?:toggle|toggles|transition|transitions|increment|increments|"
    r"update|updates|advance|advances)\b"
)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def interface_names(interface: dict[str, Any]) -> set[str]:
    root = interface.get("rootPorts") if isinstance(interface.get("rootPorts"), dict) else interface
    values = root.get("inputs") if isinstance(root, dict) else []
    if not isinstance(values, list):
        return set()
    return {
        str(item.get("name") if isinstance(item, dict) else item).strip()
        for item in values
        if str(item.get("name") if isinstance(item, dict) else item).strip()
    }


def coverage_records(report: dict[str, Any]) -> dict[str, Any]:
    records = report.get("models", report)
    if not isinstance(records, dict) or not records:
        raise ValueError("coverage report has no model records")
    return records


def trace_elements(value: Any, found: dict[tuple[str, str], dict[str, str]]) -> None:
    if isinstance(value, dict):
        path = str(value.get("path") or value.get("block_path") or "").strip()
        sid = str(value.get("sid") or value.get("id") or "").strip()
        if path or sid:
            found.setdefault((path, sid), {"path": path, "sid": sid})
        for child in value.values():
            trace_elements(child, found)
    elif isinstance(value, list):
        for child in value:
            trace_elements(child, found)


def metric_name(raw: Any) -> str:
    normalized = str(raw or "").strip().lower()
    return {
        "condition": "Condition",
        "decision": "Decision",
        "mcdc": "MCDC",
        "mc/dc": "MCDC",
    }.get(normalized, "")


def normalized_detail(item: dict[str, Any], model: str, coverage_class: str, index: int) -> dict[str, Any]:
    block = item.get("block") if isinstance(item.get("block"), dict) else {}
    path = str(item.get("block_path") or block.get("path") or "").strip()
    sid = str(item.get("sid") or block.get("sid") or "").strip()
    missing = item.get("missing_outcomes")
    if not isinstance(missing, list):
        missing = []
    return {
        "id": str(item.get("id") or f"{model}:{coverage_class}:{index}"),
        "model": model,
        "coverage_class": coverage_class,
        "block": {"path": path, "sid": sid},
        "covered": float(item.get("covered") or 0),
        "total": float(item.get("total") or 0),
        "percent": float(item.get("percent") or 0),
        "missing_outcomes": [str(value) for value in missing if str(value).strip()],
        "description": item.get("description") or "",
        "requires_model_inspection": not bool(path or sid),
    }


def build_brief(
    *,
    job_id: str,
    model: str,
    coverage: dict[str, Any],
    traces: dict[str, Any],
    coverage_ir_path: str,
    coverage_report_path: str,
    trace_path: str,
    interface_path: str,
    threshold: float,
    coverage_ir: dict[str, Any] | None = None,
    initial_synthesis: dict[str, Any] | None = None,
) -> dict[str, Any]:
    records = coverage_records(coverage)
    record = records.get(model)
    if not isinstance(record, dict):
        if len(records) != 1:
            raise ValueError(f"coverage report does not contain model {model}")
        record = next(iter(records.values()))
    deficits: list[dict[str, Any]] = []
    deficit_classes: set[str] = set()
    for key, coverage_class in (("condition", "Condition"), ("decision", "Decision"), ("mcdc", "MCDC")):
        metric = record.get(key)
        if not isinstance(metric, dict):
            raise ValueError(f"coverage metric is missing: {key}")
        percent = float(metric.get("percent") or 0)
        if percent < threshold:
            deficit_classes.add(coverage_class)
            deficits.append(
                {
                    "coverage_class": coverage_class,
                    "covered": float(metric.get("covered") or 0),
                    "total": float(metric.get("total") or 0),
                    "percent": percent,
                    "threshold": threshold,
                }
            )

    raw_items = record.get("items")
    if not isinstance(raw_items, list):
        raw_items = coverage.get("items") if isinstance(coverage.get("items"), list) else []
    targets: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items, 1):
        if not isinstance(item, dict):
            continue
        coverage_class = metric_name(item.get("coverage_class") or item.get("metric"))
        if coverage_class in deficit_classes:
            targets.append(normalized_detail(item, model, coverage_class, index))
    for coverage_class in sorted(deficit_classes):
        if not any(target["coverage_class"] == coverage_class for target in targets):
            targets.append(
                {
                    "id": f"{model}:{coverage_class}:model-inspection-required",
                    "model": model,
                    "coverage_class": coverage_class,
                    "block": {"path": "", "sid": ""},
                    "covered": next(item["covered"] for item in deficits if item["coverage_class"] == coverage_class),
                    "total": next(item["total"] for item in deficits if item["coverage_class"] == coverage_class),
                    "percent": next(item["percent"] for item in deficits if item["coverage_class"] == coverage_class),
                    "missing_outcomes": [],
                    "description": "覆盖率报告未提供块级位置；必须在局部模型检查中定位具体块路径、SID 和缺失分支。",
                    "requires_model_inspection": True,
                }
            )

    elements: dict[tuple[str, str], dict[str, str]] = {}
    trace_elements(traces, elements)
    coverage_ir = coverage_ir if isinstance(coverage_ir, dict) else {}
    initial_synthesis = initial_synthesis if isinstance(initial_synthesis, dict) else {}
    attempted: list[dict[str, Any]] = []
    for item in coverage_ir.get("items", []):
        if not isinstance(item, dict) or (item.get("reachability") or {}).get("status") != "required":
            continue
        controller = item.get("controller") if isinstance(item.get("controller"), dict) else {}
        stimulus = item.get("stimulus") if isinstance(item.get("stimulus"), dict) else {}
        if not (controller.get("direct_inputs") or controller.get("parameters") or stimulus.get("steps")):
            continue
        attempted.append(
            {
                "id": str(item.get("id") or ""),
                "coverage_class": str(item.get("coverage_class") or ""),
                "block": item.get("block") if isinstance(item.get("block"), dict) else {},
                "required_outcome": item.get("required_outcome"),
                "pattern_type": item.get("patternType") or "",
                "controller": controller,
                "stimulus": stimulus,
            }
        )
    attempted = attempted[:256]
    return {
        "schema": BRIEF_SCHEMA,
        "jobId": job_id,
        "model": model,
        "repairRequired": bool(deficits),
        "coverageThreshold": threshold,
        "metricDeficits": deficits,
        "coverageTargets": targets,
        "modelElementIndex": sorted(elements.values(), key=lambda item: (item["path"], item["sid"])),
        "priorPlanning": {
            "stage5ExecutionReadiness": (coverage_ir.get("summary") or {}).get("executionReadiness", {}),
            "stage7InitialGeneration": {
                "plannedCandidateCount": int(initial_synthesis.get("planned_candidate_count") or 0),
                "actualAddedCount": int(initial_synthesis.get("added") or 0),
                "duplicateSkippedCount": int(initial_synthesis.get("duplicate_skipped_count") or 0),
                "controlConflictSkippedCount": int(initial_synthesis.get("control_conflict_skipped_count") or 0),
                "unresolvedThresholdSkippedCount": int(initial_synthesis.get("unresolved_threshold_skipped_count") or 0),
            },
            "attemptedTargets": attempted,
            "doNotRepeatIdenticalControllers": [
                {
                    "id": item["id"],
                    "controller": item["controller"],
                    "stimulus": item["stimulus"],
                }
                for item in attempted
            ],
            "measuredRemainingTargets": targets,
        },
        "evidence": {
            "coverageReport": coverage_report_path,
            "logicalTraces": trace_path,
            "coverageIr": coverage_ir_path,
            "modelInterface": interface_path,
        },
        "guardrails": {
            "maxCandidateTests": 16,
            "stepCountSemantics": "stimulus_action_entries",
            "actionStepCountLimit": None,
            "simulationSamplePeriodsDoNotCountAsSteps": True,
            "longHoldAsSingleActionAllowed": True,
            "parametersOnlyInInitialization": True,
            "analyzeOnlyTargetUpstreamSlice": True,
            "fullRootInputEnumerationForbidden": True,
            "repairPassLimit": 1,
        },
    }


def ensure_mapping(value: Any, label: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def validate_identifiers(values: dict[str, Any], label: str) -> None:
    invalid = [name for name in values if not IDENTIFIER_RE.fullmatch(str(name))]
    if invalid:
        raise ValueError(f"{label} contains invalid identifiers: {invalid}")


def unresolved_confuses_sample_periods_with_action_steps(
    *,
    reason_code: str,
    evidence: str,
    guardrails: dict[str, Any],
) -> bool:
    if reason_code != "state_sequence_not_constructible":
        return False
    if guardrails.get("simulationSamplePeriodsDoNotCountAsSteps") is not True:
        return False
    if guardrails.get("longHoldAsSingleActionAllowed") is not True:
        return False
    action_budget_claim = (
        ACTION_STEP_LIMIT_TEXT_RE.search(evidence)
        or STATE_TRANSITION_BUDGET_TEXT_RE.search(evidence)
    )
    return bool(SAMPLE_PERIOD_TEXT_RE.search(evidence) and action_budget_claim)


def validate_proposal(
    proposal: dict[str, Any],
    brief: dict[str, Any],
    interface: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if proposal.get("schema") != PROPOSAL_SCHEMA:
        raise ValueError("coverage repair proposal schema is invalid")
    if proposal.get("jobId") != brief.get("jobId") or proposal.get("model") != brief.get("model"):
        raise ValueError("coverage repair proposal job/model does not match the repair brief")
    tests = proposal.get("tests")
    unresolved = proposal.get("unresolved")
    if not isinstance(tests, list) or not isinstance(unresolved, list):
        raise ValueError("coverage repair proposal tests/unresolved must be arrays")
    max_tests = int(brief.get("guardrails", {}).get("maxCandidateTests") or 16)
    if len(tests) > max_tests:
        raise ValueError("coverage repair proposal exceeds the bounded candidate limit")
    if brief.get("repairRequired") and not tests and not unresolved:
        raise ValueError("coverage repair proposal must contain candidates or specific unresolved evidence")

    allowed_inputs = interface_names(interface)
    deficit_classes = {str(item.get("coverage_class")) for item in brief.get("metricDeficits", [])}
    detailed_targets = [
        item
        for item in brief.get("coverageTargets", [])
        if isinstance(item, dict) and not item.get("requires_model_inspection")
    ]
    ids: set[str] = set()
    ir_items: list[dict[str, Any]] = []
    for item in tests:
        if not isinstance(item, dict):
            raise ValueError("coverage repair candidate must be an object")
        item_id = str(item.get("id") or "").strip()
        coverage_class = metric_name(item.get("coverage_class"))
        block = ensure_mapping(item.get("block"), f"{item_id}.block")
        path = str(block.get("path") or "").strip()
        sid = str(block.get("sid") or "").strip()
        if not item_id or item_id in ids:
            raise ValueError("coverage repair candidate ids must be non-empty and unique")
        ids.add(item_id)
        if coverage_class not in ALLOWED_CLASSES or coverage_class not in deficit_classes:
            raise ValueError(f"{item_id} does not target a measured below-threshold metric")
        if not path or not sid:
            raise ValueError(f"{item_id} must identify the target block path and SID")
        class_targets = [target for target in detailed_targets if target.get("coverage_class") == coverage_class]
        if class_targets and not any(
            str(target.get("block", {}).get("path") or "") == path
            and str(target.get("block", {}).get("sid") or "") == sid
            for target in class_targets
        ):
            raise ValueError(f"{item_id} target does not match the measured block-level deficit")
        required_outcome = str(item.get("required_outcome") or "").strip()
        if not required_outcome:
            raise ValueError(f"{item_id} must state the missing branch/outcome")
        matched_targets = [
            target
            for target in class_targets
            if str(target.get("block", {}).get("path") or "") == path
            and str(target.get("block", {}).get("sid") or "") == sid
        ]
        measured_outcomes = {
            str(outcome).strip()
            for target in matched_targets
            for outcome in target.get("missing_outcomes", [])
            if str(outcome).strip()
        }
        if measured_outcomes and required_outcome not in measured_outcomes:
            raise ValueError(f"{item_id} required_outcome does not match a measured missing outcome")
        analysis = ensure_mapping(item.get("analysis"), f"{item_id}.analysis")
        if not isinstance(analysis.get("upstream_slice"), list) or not analysis["upstream_slice"]:
            raise ValueError(f"{item_id} must record the inspected upstream dependency slice")
        if not str(analysis.get("rationale") or "").strip():
            raise ValueError(f"{item_id} must explain why the stimulus can cover the deficit")

        controller = ensure_mapping(item.get("controller"), f"{item_id}.controller")
        inputs = ensure_mapping(controller.get("direct_inputs"), f"{item_id}.controller.direct_inputs")
        params = ensure_mapping(controller.get("parameters"), f"{item_id}.controller.parameters")
        stimulus = ensure_mapping(item.get("stimulus"), f"{item_id}.stimulus")
        initial_inputs = ensure_mapping(stimulus.get("initial_inputs"), f"{item_id}.stimulus.initial_inputs")
        initial_params = ensure_mapping(stimulus.get("initial_params"), f"{item_id}.stimulus.initial_params")
        validate_identifiers(params, f"{item_id}.controller.parameters")
        validate_identifiers(initial_params, f"{item_id}.stimulus.initial_params")
        unknown_inputs = (set(inputs) | set(initial_inputs)) - allowed_inputs
        if unknown_inputs:
            raise ValueError(f"{item_id} uses unknown root inputs: {sorted(unknown_inputs)}")
        steps = stimulus.get("steps")
        if not isinstance(steps, list) or not steps:
            raise ValueError(f"{item_id} must contain at least one ordered action step")
        normalized_steps: list[dict[str, Any]] = []
        cumulative_delay = 0.0
        for index, step in enumerate(steps, 1):
            if not isinstance(step, dict):
                raise ValueError(f"{item_id} step {index} must be an object")
            delay = float(step.get("delay_s") or 0)
            updates = ensure_mapping(step.get("input_updates"), f"{item_id}.step[{index}].input_updates")
            param_updates = ensure_mapping(step.get("param_updates"), f"{item_id}.step[{index}].param_updates")
            if delay <= 0:
                raise ValueError(f"{item_id} step {index} must have a positive delay")
            if param_updates:
                raise ValueError(f"{item_id} parameters may only be set in initialization")
            unknown_updates = set(updates) - allowed_inputs
            if unknown_updates:
                raise ValueError(f"{item_id} step {index} uses unknown root inputs: {sorted(unknown_updates)}")
            cumulative_delay += delay
            normalized_steps.append({"delay_s": delay, "input_updates": updates})
        evidence_step = int(stimulus.get("evidence_step") or 0)
        if evidence_step < 1 or evidence_step > len(normalized_steps):
            raise ValueError(f"{item_id} evidence_step is outside the ordered sequence")
        merged_inputs = {**initial_inputs, **inputs}
        merged_params = {**initial_params, **params}
        if not merged_inputs and not merged_params and not any(step["input_updates"] for step in normalized_steps):
            raise ValueError(f"{item_id} has no executable root-input or parameter stimulus")
        ir_items.append(
            {
                "id": item_id,
                "model": brief["model"],
                "coverage_class": coverage_class,
                "block": {"path": path, "sid": sid},
                "required_outcome": required_outcome,
                "controller": {"direct_inputs": merged_inputs, "parameters": merged_params},
                "nested_logic": ensure_mapping(item.get("nested_logic"), f"{item_id}.nested_logic"),
                "sensitization_context": ensure_mapping(
                    item.get("sensitization_context"), f"{item_id}.sensitization_context"
                ),
                "stimulus": {
                    "initial_inputs": initial_inputs,
                    "initial_params": initial_params,
                    "steps": normalized_steps,
                    "evidence_step": evidence_step,
                },
                "reachability": {"status": "required", "reason": None, "issues": []},
                "simulation_evidence": {},
                "analysis": {
                    "upstream_slice": [str(value) for value in analysis["upstream_slice"]],
                    "rationale": str(analysis["rationale"]),
                    "cumulative_wait_s": cumulative_delay,
                },
                "source_obligation_id": item_id,
            }
        )

    normalized_unresolved: list[dict[str, Any]] = []
    guardrails = brief.get("guardrails") if isinstance(brief.get("guardrails"), dict) else {}
    for index, item in enumerate(unresolved, 1):
        if not isinstance(item, dict):
            raise ValueError("unresolved repair entry must be an object")
        coverage_class = metric_name(item.get("coverage_class"))
        block = ensure_mapping(item.get("block"), f"unresolved[{index}].block")
        reason_code = str(item.get("reason_code") or "").strip()
        evidence = str(item.get("evidence") or "").strip()
        if coverage_class not in deficit_classes:
            raise ValueError("unresolved repair entry does not target a below-threshold metric")
        if not str(block.get("path") or "").strip() or not str(block.get("sid") or "").strip():
            raise ValueError("unresolved repair entry must identify block path and SID")
        if reason_code not in ALLOWED_UNRESOLVED_REASONS or not evidence:
            raise ValueError("unresolved repair entry requires a specific allowed reason and evidence")
        if unresolved_confuses_sample_periods_with_action_steps(
            reason_code=reason_code,
            evidence=evidence,
            guardrails=guardrails,
        ):
            raise ValueError(
                "state_sequence_not_constructible incorrectly treats simulation sample periods as "
                "TCSD action steps. There is no per-test action-step count limit; "
                "Encode the finite counter/timer hold as one positive delay_s action, then let the "
                "deterministic host validate it by simulation."
            )
        normalized_unresolved.append(
            {
                "coverage_class": coverage_class,
                "block": {"path": str(block["path"]), "sid": str(block["sid"])},
                "reason_code": reason_code,
                "evidence": evidence,
            }
        )

    ir = {
        "schema": IR_SCHEMA,
        "model": brief["model"],
        "items": ir_items,
        "summary": {
            "required": len(ir_items),
            "covered": 0,
            "unresolved": len(normalized_unresolved),
            "unsupported": 0,
            "unreachable": sum(item["reason_code"] == "logic_unreachable" for item in normalized_unresolved),
        },
    }
    report = {
        "schema": VALIDATION_SCHEMA,
        "jobId": brief["jobId"],
        "model": brief["model"],
        "proposalItemCount": len(tests),
        "acceptedCandidateCount": len(ir_items),
        "unresolvedCount": len(normalized_unresolved),
        "acceptedCandidateIds": [item["id"] for item in ir_items],
        "unresolved": normalized_unresolved,
        "guardrails": brief["guardrails"],
        "passed": True,
    }
    return ir, report


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--job-id", required=True)
    prepare.add_argument("--model", required=True)
    prepare.add_argument("--coverage-report", required=True)
    prepare.add_argument("--logical-traces", required=True)
    prepare.add_argument("--coverage-ir", required=True)
    prepare.add_argument("--interface", required=True)
    prepare.add_argument("--threshold", type=float, default=80)
    prepare.add_argument("--output", required=True)
    validate = subparsers.add_parser("validate")
    validate.add_argument("--brief", required=True)
    validate.add_argument("--proposal", required=True)
    validate.add_argument("--interface", required=True)
    validate.add_argument("--output-ir", required=True)
    validate.add_argument("--report-json", required=True)
    args = parser.parse_args()

    if args.command == "prepare":
        coverage_path = Path(args.coverage_report)
        traces_path = Path(args.logical_traces)
        ir_path = Path(args.coverage_ir)
        interface_path = Path(args.interface)
        synthesis_path = ir_path.with_name(ir_path.name.replace("_coverage_ir.json", "_coverage_ir_synthesis_iter0.json"))
        brief = build_brief(
            job_id=args.job_id,
            model=args.model,
            coverage=read_json(coverage_path),
            traces=read_json(traces_path),
            coverage_ir_path=str(ir_path),
            coverage_report_path=str(coverage_path),
            trace_path=str(traces_path),
            interface_path=str(interface_path),
            threshold=args.threshold,
            coverage_ir=read_json(ir_path),
            initial_synthesis=read_json(synthesis_path) if synthesis_path.is_file() else {},
        )
        write_json(Path(args.output), brief)
        print(json.dumps({"output": args.output, "deficits": len(brief["metricDeficits"])}, ensure_ascii=False))
        return 0

    brief = read_json(Path(args.brief))
    if brief.get("schema") != BRIEF_SCHEMA:
        raise ValueError("coverage repair brief schema is invalid")
    interface = read_json(Path(args.interface))
    proposal: dict[str, Any] = {}
    try:
        proposal = read_json(Path(args.proposal))
        ir, report = validate_proposal(proposal, brief, interface)
    except ValueError as error:
        failure_report = {
            "schema": VALIDATION_SCHEMA,
            "jobId": brief.get("jobId"),
            "model": brief.get("model"),
            "proposalItemCount": len(proposal.get("tests", []))
            if isinstance(proposal, dict) and isinstance(proposal.get("tests"), list)
            else 0,
            "acceptedCandidateCount": 0,
            "unresolvedCount": 0,
            "acceptedCandidateIds": [],
            "unresolved": [],
            "guardrails": brief.get("guardrails", {}),
            "passed": False,
            "error": {
                "code": "proposal_validation_failed",
                "message": str(error),
            },
        }
        write_json(Path(args.report_json), failure_report)
        print(
            json.dumps(
                {
                    "output": args.report_json,
                    "passed": False,
                    "error": str(error),
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return 2
    write_json(Path(args.output_ir), ir)
    write_json(Path(args.report_json), report)
    print(
        json.dumps(
            {
                "output": args.output_ir,
                "accepted": report["acceptedCandidateCount"],
                "unresolved": report["unresolvedCount"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
