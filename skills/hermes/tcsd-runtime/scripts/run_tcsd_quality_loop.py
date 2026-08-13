#!/usr/bin/env python3
"""Run the deterministic TCSD MC/DC quality loop.

The default path is workbook-side validation and mapped missing-vector
augmentation. Optional flags add MATLAB/SATK probe and simulation/backfill
steps, keeping expensive operations opt-in and bounded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def run(cmd: list[str], *, cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    if len(cmd) >= 2 and cmd[1] != "-B" and str(cmd[1]).endswith(".py"):
        cmd = [cmd[0], "-B", *cmd[1:]]
    print("+", " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def relative_artifact(path: Path | None, root_dir: Path) -> str | None:
    if path is None:
        return None
    try:
        return path.resolve().relative_to(root_dir.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def write_execution_manifest(
    *,
    path: Path,
    root_dir: Path,
    model: str,
    threshold: float,
    workbook: Path,
    simulation_result: Path | None,
    initial_coverage: dict[str, Any] | None,
    final_coverage: dict[str, Any] | None,
    initial_coverage_artifact: Path | None,
    final_coverage_artifact: Path | None,
    repair_required: bool,
    repair_applied: bool,
    obligations: Path,
    mapping_report: Path,
    coverage_ir: Path | None = None,
    repair_attempted: bool | None = None,
    repair_reason: str | None = None,
    repair_evidence: Path | None = None,
) -> dict[str, Any]:
    attempted = repair_applied if repair_attempted is None else repair_attempted
    evidence_partial = evidence_has_partial_items(coverage_ir=coverage_ir, mapping_report=mapping_report)
    complete = bool(
        workbook.exists()
        and simulation_result
        and simulation_result.exists()
        and initial_coverage
        and final_coverage
        and initial_coverage_artifact
        and initial_coverage_artifact.exists()
        and final_coverage_artifact
        and final_coverage_artifact.exists()
        and obligations.exists()
        and mapping_report.exists()
        and (not repair_required or attempted)
    )
    partial = bool(
        (final_coverage and coverage_below_target_data(final_coverage))
        or evidence_partial
        or (repair_required and attempted and not repair_applied)
    )
    manifest = {
        "schema": "simulink-ut-tcsd-execution-manifest/v1",
        "model": model,
        "status": "completed" if complete else "incomplete",
        "completion": "partial" if partial else "complete",
        "threshold": threshold,
        "workbook": relative_artifact(workbook, root_dir),
        "simulation": {
            "status": "completed" if simulation_result and simulation_result.exists() else "not_completed",
            "result": relative_artifact(simulation_result, root_dir),
        },
        "coverage": {
            "initial": initial_coverage,
            "initial_artifact": relative_artifact(initial_coverage_artifact, root_dir),
            "repair_required": repair_required,
            "repair_attempted": attempted,
            "repair_applied": repair_applied,
            "repair_passes": 1 if repair_applied else 0,
            "repair_reason": repair_reason,
            "repair_evidence": relative_artifact(repair_evidence, root_dir),
            "final": final_coverage,
            "final_artifact": relative_artifact(final_coverage_artifact, root_dir),
        },
        "evidence": {
            "obligations": relative_artifact(obligations, root_dir),
            "mapping_report": relative_artifact(mapping_report, root_dir),
            "coverage_ir": relative_artifact(coverage_ir, root_dir),
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def report_failed(report: dict[str, Any]) -> bool:
    summary = report.get("summary", {})
    # Unresolved/unsupported items are retained as auditable partial-completion
    # evidence.  They are not evidence of unreachability and must not prevent a
    # bounded one-pass deliverable from being produced.
    return bool(summary.get("missing_count"))


def coverage_below_target_data(report: dict[str, Any]) -> bool:
    return any(not bool(item.get("passed")) for item in report.values() if isinstance(item, dict))


def evidence_has_partial_items(*, coverage_ir: Path | None, mapping_report: Path | None) -> bool:
    if coverage_ir and coverage_ir.exists():
        payload = load_json(coverage_ir)
        for item in payload.get("items", []):
            reachability = item.get("reachability") if isinstance(item, dict) else None
            if isinstance(reachability, dict) and reachability.get("status") in {"unresolved", "unsupported"}:
                return True
    if mapping_report and mapping_report.exists():
        summary = load_json(mapping_report).get("summary", {})
        if int(summary.get("unresolved_count") or 0) or int(summary.get("unsupported_count") or 0) or int(summary.get("missing_count") or 0):
            return True
    return False


def load_interface_inputs(path: Path) -> list[str]:
    data = load_json(path)
    if isinstance(data.get("inputs"), list):
        return [str(item) for item in data["inputs"]]
    root = data.get("rootPorts") if isinstance(data.get("rootPorts"), dict) else {}
    inputs = root.get("inputs") if isinstance(root, dict) else []
    if inputs and isinstance(inputs[0], dict):
        return [str(item.get("name")) for item in inputs if item.get("name")]
    return [str(item) for item in inputs or []]


def load_interface_execution_controls(path: Path) -> list[str]:
    data = load_json(path)
    return [
        str(item.get("name"))
        for item in data.get("executionControls", [])
        if isinstance(item, dict) and item.get("name")
    ]


def matlab_string(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def matlab_cell(values: list[str]) -> str:
    return "{" + ", ".join(matlab_string(value) for value in values) + "}"


def write_matlab_entry(path: Path, code: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(code, encoding="utf-8")
    return path


SECRET_ASSIGNMENT_RE = re.compile(
    r"(?i)\b(api[_-]?key|authorization|bearer|password|secret|token)\b(\s*[:=]\s*|\s+)([^\s,;]+)"
)


def safe_diagnostic_text(value: Any, limit: int = 1200) -> str:
    text = str(value or "").replace("\x00", "").replace("\r", "\n")
    text = SECRET_ASSIGNMENT_RE.sub(
        lambda match: f"{match.group(1)}{match.group(2)}[REDACTED]",
        text,
    )
    text = re.sub(r"[A-Za-z]:[\\/][^\s,;]+", "[path]", text)
    text = re.sub(r"(?:^|\s)/(?:[^\s,;]+/)+[^\s,;]*", " [path]", text)
    return " ".join(text.split())[:limit]


def safe_diagnostic_code(value: Any, fallback: str = "SATK_EVALUATION_FAILED") -> str:
    text = str(value or "").strip()
    return text[:120] if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", text) else fallback


def parse_last_json_object(value: Any) -> dict[str, Any]:
    text = str(value or "")
    try:
        payload = json.loads(text or "{}")
        return payload if isinstance(payload, dict) else {}
    except (json.JSONDecodeError, TypeError):
        pass
    decoder = json.JSONDecoder()
    for offset in range(len(text) - 1, -1, -1):
        if text[offset] != "{":
            continue
        try:
            payload, consumed = decoder.raw_decode(text[offset:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and not text[offset + consumed:].strip():
            return payload
    return {}


class SatkEvaluationError(RuntimeError):
    """A redacted SATK/MATLAB failure with bounded public diagnostics."""

    def __init__(self, message: str, details: dict[str, Any]):
        super().__init__(message)
        self.details = details


def satk_failure(stdout: str, stderr: str, returncode: int) -> SatkEvaluationError:
    error_code = "SATK_EVALUATION_FAILED"
    message = "SATK/MATLAB evaluation failed without a structured error."
    gateway_data: dict[str, Any] = {}
    payload = parse_last_json_object(stdout)
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        error_code = safe_diagnostic_code(error.get("code"), error_code)
        message = safe_diagnostic_text(error.get("message")) or message
        if isinstance(error.get("data"), dict):
            gateway_data = error["data"]
    else:
        result = payload.get("result") if isinstance(payload, dict) else None
        content = result.get("content") if isinstance(result, dict) else None
        messages = [
            safe_diagnostic_text(item.get("text"))
            for item in content or []
            if isinstance(item, dict) and item.get("type") == "text" and item.get("text")
        ]
        if messages:
            message = " ".join(item for item in messages if item)[:1200]
    if message.startswith("SATK/MATLAB evaluation failed without"):
        message = safe_diagnostic_text(stderr) or message
    details: dict[str, Any] = {
        "phase": "matlab_probe_evaluation",
        "satkExitCode": int(returncode),
        "gatewayErrorCode": error_code,
    }
    gateway_job_id = safe_diagnostic_code(gateway_data.get("gatewayJobId"), "")
    gateway_status = safe_diagnostic_code(gateway_data.get("gatewayStatus"), "")
    timeout_seconds = gateway_data.get("timeoutSeconds")
    if gateway_job_id:
        details["gatewayJobId"] = gateway_job_id
    if gateway_status:
        details["gatewayStatus"] = gateway_status
    if isinstance(timeout_seconds, (int, float)) and 0 < timeout_seconds <= 86400:
        details["timeoutSeconds"] = float(timeout_seconds)
    return SatkEvaluationError(
        f"SATK/MATLAB probe failed ({error_code}): {message}",
        details,
    )


def run_satk(
    python: str,
    scripts: Path,
    entry: Path,
    root_dir: Path,
    *,
    gateway_timeout_seconds: int | None = None,
) -> None:
    command = [python, "-B", str(scripts / "satk_eval.py"), str(entry)]
    environ = None
    if gateway_timeout_seconds is not None:
        environ = dict(os.environ)
        environ["SATK_GATEWAY_TIMEOUT_SECONDS"] = str(gateway_timeout_seconds)
    completed = subprocess.run(
        command,
        cwd=root_dir,
        env=environ,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode != 0:
        raise satk_failure(completed.stdout, completed.stderr, completed.returncode)


def probe_failure(error_path: Path, fallback: SatkEvaluationError) -> SatkEvaluationError:
    if error_path.is_file():
        try:
            payload = load_json(error_path)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            payload = {}
    else:
        payload = {}
    identifier = safe_diagnostic_code(
        payload.get("identifier"),
        str(fallback.details.get("gatewayErrorCode") or "MATLAB_PROBE_FAILED"),
    )
    message = safe_diagnostic_text(payload.get("message")) or safe_diagnostic_text(fallback)
    if not error_path.is_file():
        error_path.write_text(
            json.dumps({
                "schema": "tcsd-matlab-probe-error/v1",
                "source": "satk-runner",
                "identifier": identifier,
                "message": message,
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    details = dict(fallback.details)
    details.update({
        "phase": "matlab_probe_evaluation",
        "gatewayErrorCode": identifier,
        "diagnosticArtifactFileName": error_path.name,
    })
    return SatkEvaluationError(
        f"SATK/MATLAB probe failed ({identifier}): {message}",
        details,
    )


def require_matlab_artifact(path: Path, *, phase: str) -> None:
    if path.is_file() and path.stat().st_size > 0:
        return
    raise SatkEvaluationError(
        f"MATLAB evaluation completed without the required {phase} artifact.",
        {
            "phase": phase,
            "gatewayErrorCode": "MATLAB_RESULT_ARTIFACT_MISSING",
            "artifactFileName": path.name,
        },
    )


def simulation_failure(error_path: Path) -> SatkEvaluationError | None:
    if not error_path.is_file():
        return None
    try:
        payload = load_json(error_path)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        payload = {}
    identifier = safe_diagnostic_code(payload.get("identifier"), "MATLAB_SIMULATION_FAILED")
    message = safe_diagnostic_text(payload.get("message")) or "MATLAB simulation failed without a readable diagnostic."
    return SatkEvaluationError(
        f"MATLAB simulation failed ({identifier}): {message}",
        {
            "phase": "matlab_case_simulation",
            "gatewayErrorCode": identifier,
            "diagnosticArtifactFileName": error_path.name,
        },
    )


def validate_mapping(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    workbook: Path,
    obligations: Path,
    report: Path,
) -> dict[str, Any]:
    completed = run(
        [
            python,
            str(scripts / "validate_logical_mcdc_mapping.py"),
            "--workbook",
            str(workbook),
            "--obligations",
            str(obligations),
            "--report-json",
            str(report),
        ],
        cwd=root_dir,
        check=False,
    )
    if not report.exists():
        raise RuntimeError(f"MC/DC validator did not write report: exit={completed.returncode}")
    return load_json(report)


def build_obligations_from_traces(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    traces: Path,
    logical_operators: Path | None,
) -> Path:
    mapping = logical_operators or root_dir / "outputs" / f"{model}_logical_operators.json"
    run(
        [
            python,
            str(scripts / "derive_logical_mcdc_mappings.py"),
            "--traces",
            str(traces),
            "--output",
            str(mapping),
        ],
        cwd=root_dir,
    )
    obligations = root_dir / "outputs" / f"{model}_coverage_obligations.json"
    completed = run(
        [
            python,
            str(scripts / "build_logical_mcdc_obligations.py"),
            "--logical-operators",
            str(mapping),
            "--output",
            str(obligations),
        ],
        cwd=root_dir,
        check=False,
    )
    if not obligations.exists():
        raise RuntimeError(f"obligation builder did not write output: exit={completed.returncode}")
    return obligations


def augment_once(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    template: Path,
    model: str,
    spec: Path,
    workbook: Path,
    interface_json: Path,
    obligations: Path,
    report: Path | None,
    iteration: int,
) -> tuple[Path, Path]:
    next_spec = root_dir / f"{model}_spec_mcdc_iter{iteration}.json"
    cmd = [
        python,
        str(scripts / "augment_tcsd_for_mcdc.py"),
        "--spec",
        str(spec),
        "--obligations",
        str(obligations),
        "--output",
        str(next_spec),
    ]
    if report is not None:
        cmd.extend(["--validation-report", str(report)])
    run(cmd, cwd=root_dir)
    next_workbook = root_dir / "outputs" / f"{model}_Test_mcdc_iter{iteration}.xlsx"
    run(
        [
            python,
            str(scripts / "build_tcsd_from_json.py"),
            "--template",
            str(template),
            "--spec",
            str(next_spec),
            "--output",
            str(next_workbook),
            "--interface-json",
            str(interface_json),
        ],
        cwd=root_dir,
    )
    return next_spec, next_workbook


def synthesize_ir_once(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    template: Path,
    model: str,
    spec: Path,
    workbook: Path,
    interface_json: Path,
    coverage_ir: Path,
    iteration: int,
    max_new_tests: int = 50,
) -> tuple[Path, Path, dict[str, Any]]:
    """Run the sole bounded repair synthesizer from the persisted Coverage IR.

    The synthesizer deduplicates by controller inputs, parameters and complete
    temporal stimulus.  A workbook is rebuilt only when at least one unique,
    executable Decision/MC/DC candidate was appended.
    """
    next_spec = root_dir / f"{model}_spec_coverage_ir_iter{iteration}.json"
    synthesis_report = root_dir / "outputs" / f"{model}_coverage_ir_synthesis_iter{iteration}.json"
    run(
        [
            python,
            str(scripts / "synthesize_tcsd_from_coverage_ir.py"),
            "--spec",
            str(spec),
            "--coverage-ir",
            str(coverage_ir),
            "--output",
            str(next_spec),
            "--report-json",
            str(synthesis_report),
            "--max-new-tests",
            str(max_new_tests),
        ],
        cwd=root_dir,
    )
    report = load_json(synthesis_report)
    if int(report.get("added") or 0) <= 0:
        return spec, workbook, report
    next_workbook = root_dir / "outputs" / f"{model}_Test_coverage_ir_iter{iteration}.xlsx"
    run(
        [
            python,
            str(scripts / "build_tcsd_from_json.py"),
            "--template",
            str(template),
            "--spec",
            str(next_spec),
            "--output",
            str(next_workbook),
            "--interface-json",
            str(interface_json),
        ],
        cwd=root_dir,
    )
    return next_spec, next_workbook, report


def build_atomic_repair_plan(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    logical_traces: Path,
) -> Path:
    plan = root_dir / "outputs" / f"{model}_atomic_mcdc_repair_plan.json"
    run(
        [
            python,
            str(scripts / "build_atomic_mcdc_repair_plan.py"),
            "--logical-traces",
            str(logical_traces),
            "--output",
            str(plan),
        ],
        cwd=root_dir,
    )
    return plan


def build_state_probe_plan(
    *, python: str, scripts: Path, root_dir: Path, model: str, logical_traces: Path
) -> Path:
    plan = root_dir / "outputs" / f"{model}_state_probe_plan.json"
    run(
        [
            python,
            str(scripts / "build_state_probe_plan.py"),
            "--traces",
            str(logical_traces),
            "--output",
            str(plan),
            "--max-candidates-per-port",
            "32",
        ],
        cwd=root_dir,
    )
    return plan


def extract_cases(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    workbook: Path,
    interface_json: Path,
    coverage_ir: Path | None = None,
) -> Path:
    inputs = ",".join(load_interface_inputs(interface_json))
    execution_controls = ",".join(load_interface_execution_controls(interface_json))
    case_json = root_dir / "outputs" / f"{model}_cases_mcdc.json"
    command = [
        python,
        str(scripts / "extract_tcsd_cases.py"),
        "--workbook",
        str(workbook),
        "--model",
        model,
        "--inputs",
        inputs,
        "--execution-controls",
        execution_controls,
        "--output",
        str(case_json),
    ]
    if coverage_ir is not None:
        command.extend(["--coverage-ir", str(coverage_ir)])
    run(command, cwd=root_dir)
    return case_json


def run_probe(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    mat_file: str,
    init_scripts: list[str],
    unreachable_overrides: str,
    collect_coverage: bool,
    coverage_threshold: float,
    case_json: Path | None = None,
    output_name: str = "logic_probe_results.json",
    gateway_timeout_seconds: int | None = None,
    build_obligations: bool = True,
    skip_missing_external_resource_test_ids: list[str] | None = None,
) -> tuple[Path, Path | None]:
    probe_results = root_dir / "outputs" / output_name
    probe_error = probe_results.with_suffix(".error.json")
    probe_error.unlink(missing_ok=True)
    coverage_json = root_dir / "outputs" / f"{model}_coverage_summary.json"
    coverage_data = root_dir / "outputs" / f"{model}_coverage.cvd"
    coverage_html = root_dir / "outputs" / f"{model}_coverage.html"
    coverage_args = ""
    if collect_coverage:
        coverage_args = (
            f", 'CoverageJson', {matlab_string(str(coverage_json))}"
            f", 'CoverageDataFile', {matlab_string(str(coverage_data))}"
            f", 'CoverageHtml', {matlab_string(str(coverage_html))}"
            f", 'CoverageThreshold', {coverage_threshold:g}"
        )
    case_arg = f", 'CaseJson', {matlab_string(str(case_json))}" if case_json is not None else ""
    skippable_test_arg = ""
    if skip_missing_external_resource_test_ids:
        skippable_test_arg = (
            ", 'SkipMissingExternalResourceTestIds', "
            + matlab_cell(skip_missing_external_resource_test_ids)
        )
    entry = write_matlab_entry(
        root_dir / "outputs" / f"{model}_probe_mcdc_entry.m",
        "\n".join(
            [
                f"rootDir = {matlab_string(str(root_dir))};",
                f"addpath({matlab_string(str(scripts))});",
                f"diagnosticJson = {matlab_string(str(probe_error))};",
                "if exist(diagnosticJson, 'file'), delete(diagnosticJson); end",
                "try",
                (
                    f"  probe_logical_mcdc_vectors(rootDir, {matlab_cell([model])}, "
                    f"{matlab_string(mat_file)}, 'InitScripts', {matlab_cell(init_scripts)}, "
                    f"'OutputJson', {matlab_string(str(probe_results))}{case_arg}"
                    f"{coverage_args}{skippable_test_arg});"
                ),
                "catch ME",
                (
                    "  p = struct('schema','tcsd-matlab-probe-error/v1',"
                    "'source','matlab','identifier',char(string(ME.identifier)),"
                    "'message',char(string(ME.message)));"
                ),
                "  fid = fopen(diagnosticJson, 'w');",
                "  if fid >= 0, fprintf(fid, '%s', jsonencode(p, PrettyPrint=true)); fclose(fid); end",
                "  rethrow(ME);",
                "end",
            ]
        ),
    )
    try:
        run_satk(
            python,
            scripts,
            entry,
            root_dir,
            gateway_timeout_seconds=gateway_timeout_seconds,
        )
    except SatkEvaluationError as error:
        raise probe_failure(probe_error, error) from None
    require_matlab_artifact(probe_results, phase="matlab_probe_evaluation")
    obligations = root_dir / "outputs" / f"{model}_coverage_obligations.json"
    cmd = [
        python,
        str(scripts / "build_probe_mcdc_obligations.py"),
        "--probe-results",
        str(probe_results),
        "--model",
        model,
        "--output-dir",
        str(root_dir / "outputs"),
    ]
    if unreachable_overrides:
        cmd.extend(["--unreachable-overrides", unreachable_overrides])
    logical_mappings = root_dir / "outputs" / f"{model}_logical_operators.json"
    if logical_mappings.exists():
        cmd.extend(["--logical-mappings", str(logical_mappings)])
    if build_obligations:
        run(cmd, cwd=root_dir, check=False)
    return obligations, coverage_json if collect_coverage else None


def probe_report(payload: dict[str, Any], model: str) -> dict[str, Any]:
    direct = payload.get(model) if isinstance(payload.get(model), dict) else None
    if direct and direct.get("schema") == "simulink-ut-logical-mcdc-probe/v2":
        return direct
    if payload.get("schema") == "simulink-ut-logical-mcdc-probe/v2":
        return payload
    matches = [
        value for value in payload.values()
        if isinstance(value, dict) and value.get("schema") == "simulink-ut-logical-mcdc-probe/v2"
    ]
    if len(matches) != 1:
        raise RuntimeError("MATLAB probe batch did not return exactly one model report")
    return matches[0]


def merge_probe_batches(
    payloads: list[dict[str, Any]], model: str, case_json: Path
) -> dict[str, Any]:
    reports = [probe_report(payload, model) for payload in payloads]
    if not reports:
        raise RuntimeError("MATLAB probe batching produced no reports")
    merged = dict(reports[0])
    merged["case_json"] = str(case_json)
    merged["observations"] = [
        observation
        for report in reports
        for observation in (report.get("observations") or [])
        if isinstance(observation, dict)
    ]
    merged["skipped_tests"] = [
        skipped
        for report in reports
        for skipped in (report.get("skipped_tests") or [])
        if isinstance(skipped, dict)
    ]
    merged["batch_count"] = len(reports)
    return {model: merged}


def build_probe_obligations(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    probe_results: Path,
    unreachable_overrides: str,
) -> Path:
    obligations = root_dir / "outputs" / f"{model}_coverage_obligations.json"
    command = [
        python,
        str(scripts / "build_probe_mcdc_obligations.py"),
        "--probe-results",
        str(probe_results),
        "--model",
        model,
        "--output-dir",
        str(root_dir / "outputs"),
    ]
    if unreachable_overrides:
        command.extend(["--unreachable-overrides", unreachable_overrides])
    logical_mappings = root_dir / "outputs" / f"{model}_logical_operators.json"
    if logical_mappings.exists():
        command.extend(["--logical-mappings", str(logical_mappings)])
    run(command, cwd=root_dir, check=False)
    return obligations


def run_probe_batched(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    mat_file: str,
    init_scripts: list[str],
    unreachable_overrides: str,
    coverage_threshold: float,
    case_json: Path,
    output_name: str,
    batch_size: int,
    gateway_timeout_seconds: int | None = None,
    manifest_name: str | None = None,
) -> tuple[Path, Path]:
    payload = load_json(case_json)
    tests = payload.get("tests") if isinstance(payload.get("tests"), list) else []
    if not tests:
        raise RuntimeError("MATLAB probe batching requires at least one candidate")
    bounded_batch_size = max(1, int(batch_size))
    batches = [tests[index:index + bounded_batch_size] for index in range(0, len(tests), bounded_batch_size)]
    outputs = root_dir / "outputs"
    final_results = outputs / output_name
    manifest = outputs / (manifest_name or f"{model}_probe_batch_manifest.json")
    records: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    for batch_index, batch_tests in enumerate(batches, start=1):
        batch_case = outputs / f"{model}_state_probe_batch_{batch_index:03d}_cases.json"
        batch_result_name = f"{model}_state_probe_batch_{batch_index:03d}_results.json"
        batch_case.write_text(
            json.dumps({**payload, "tests": batch_tests}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        record = {
            "batchIndex": batch_index,
            "candidateStart": (batch_index - 1) * bounded_batch_size + 1,
            "candidateEnd": (batch_index - 1) * bounded_batch_size + len(batch_tests),
            "candidateCount": len(batch_tests),
            "firstTestId": str(batch_tests[0].get("test_id") or ""),
            "lastTestId": str(batch_tests[-1].get("test_id") or ""),
            "caseFileName": batch_case.name,
            "caseSha256": hashlib.sha256(batch_case.read_bytes()).hexdigest(),
            "status": "running",
        }
        try:
            run_probe(
                python=python,
                scripts=scripts,
                root_dir=root_dir,
                model=model,
                mat_file=mat_file,
                init_scripts=init_scripts,
                unreachable_overrides=unreachable_overrides,
                collect_coverage=False,
                coverage_threshold=coverage_threshold,
                case_json=batch_case,
                output_name=batch_result_name,
                gateway_timeout_seconds=gateway_timeout_seconds,
                build_obligations=False,
            )
        except SatkEvaluationError as error:
            record.update({
                "status": "failed",
                "errorCode": str(error.details.get("gatewayErrorCode") or "SATK_EVALUATION_FAILED"),
                "diagnosticArtifactFileName": str(error.details.get("diagnosticArtifactFileName") or ""),
            })
            records.append(record)
            manifest.write_text(json.dumps({
                "schema": "tcsd-probe-batch-manifest/v1",
                "model": model,
                "status": "failed",
                "candidateCount": len(tests),
                "batchSize": bounded_batch_size,
                "batchCount": len(batches),
                "batches": records,
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            error.details.update({
                "batchIndex": batch_index,
                "batchCount": len(batches),
                "batchCandidateCount": len(batch_tests),
                "batchStart": record["candidateStart"],
                "batchEnd": record["candidateEnd"],
            })
            raise
        result_path = outputs / batch_result_name
        result_payload = load_json(result_path)
        results.append(result_payload)
        record.update({
            "status": "completed",
            "resultFileName": result_path.name,
            "resultSha256": hashlib.sha256(result_path.read_bytes()).hexdigest(),
        })
        records.append(record)
    final_results.write_text(
        json.dumps(merge_probe_batches(results, model, case_json), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    manifest.write_text(json.dumps({
        "schema": "tcsd-probe-batch-manifest/v1",
        "model": model,
        "status": "completed",
        "candidateCount": len(tests),
        "batchSize": bounded_batch_size,
        "batchCount": len(batches),
        "batches": records,
        "mergedResultFileName": final_results.name,
        "mergedResultSha256": hashlib.sha256(final_results.read_bytes()).hexdigest(),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    obligations = build_probe_obligations(
        python=python,
        scripts=scripts,
        root_dir=root_dir,
        model=model,
        probe_results=final_results,
        unreachable_overrides=unreachable_overrides,
    )
    return obligations, manifest


def coverage_below_target(path: Path) -> bool:
    report = load_json(path)
    if not report:
        return True
    return coverage_below_target_data(report)


def validate_workbook(*, python: str, scripts: Path, root_dir: Path, workbook: Path, interface_json: Path, require_exp_values: bool = False) -> None:
    cmd = [python, str(scripts / "validate_tcsd_workbook.py"), "--workbook", str(workbook), "--interface-json", str(interface_json)]
    if require_exp_values:
        cmd.append("--require-exp-values")
    run(cmd, cwd=root_dir)


def simulate_and_backfill(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    workbook: Path,
    case_json: Path,
    mat_file: str,
    outputs: str,
    exclude_outputs: str,
    interface_json: Path,
    result_name: str = "",
) -> Path:
    result_json = root_dir / "outputs" / (result_name or f"{model}_sim_results_mcdc.json")
    error_json = result_json.with_suffix(".error.json")
    result_json.unlink(missing_ok=True)
    error_json.unlink(missing_ok=True)
    entry = write_matlab_entry(
        root_dir / "outputs" / f"{model}_simulate_mcdc_entry.m",
        "\n".join(
            [
                f"rootDir = {matlab_string(str(root_dir))};",
                f"addpath({matlab_string(str(scripts))});",
                f"diagnosticJson = {matlab_string(str(error_json))};",
                "try",
                (
                    f"  simulate_tcsd_cases(rootDir, {matlab_string(model)}, {matlab_string(mat_file)}, "
                    f"{matlab_string(str(case_json))}, {matlab_string(str(result_json))});"
                ),
                "catch err",
                "  diagnostic = struct('schema', 'tcsd-matlab-simulation-error/v1', "
                "'identifier', char(string(err.identifier)), 'message', char(string(err.message)));",
                "  fid = fopen(diagnosticJson, 'w');",
                "  if fid >= 0",
                "    fprintf(fid, '%s', jsonencode(diagnostic, PrettyPrint=true));",
                "    fclose(fid);",
                "  end",
                "  rethrow(err);",
                "end",
            ]
        ),
    )
    try:
        run_satk(python, scripts, entry, root_dir)
    except SatkEvaluationError as cause:
        captured = simulation_failure(error_json)
        if captured:
            raise captured from cause
        raise
    captured = simulation_failure(error_json)
    if captured:
        raise captured
    require_matlab_artifact(result_json, phase="matlab_case_simulation")
    cmd = [
        python,
        str(scripts / "backfill_expected_outputs.py"),
        "--workbook",
        str(workbook),
        "--results",
        str(result_json),
        "--outputs",
        outputs,
    ]
    if exclude_outputs:
        cmd.extend(["--exclude-outputs", exclude_outputs])
    run(cmd, cwd=root_dir)
    run(
        [
            python,
            str(scripts / "validate_tcsd_workbook.py"),
            "--workbook",
            str(workbook),
            "--interface-json",
            str(interface_json),
            "--require-exp-values",
        ],
        cwd=root_dir,
    )
    return result_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root-dir", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--workbook", required=True)
    parser.add_argument("--interface-json", required=True)
    parser.add_argument("--obligations")
    parser.add_argument("--logical-traces")
    parser.add_argument("--logical-operators")
    parser.add_argument("--template")
    parser.add_argument("--max-iterations", type=int, default=2)
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--run-probe", action="store_true")
    parser.add_argument("--require-coverage", action="store_true")
    parser.add_argument("--coverage-threshold", type=float, default=80.0)
    parser.add_argument("--simulate-backfill", action="store_true")
    parser.add_argument("--mat-file", default="")
    parser.add_argument("--init-script", action="append", default=[])
    parser.add_argument("--unreachable-overrides", default="")
    parser.add_argument("--outputs", default="")
    parser.add_argument("--exclude-outputs", default="")
    parser.add_argument("--execution-manifest", default="")
    args = parser.parse_args()

    root_dir = Path(args.root_dir).resolve()
    skill_dir = Path(__file__).resolve().parents[1]
    scripts = skill_dir / "scripts"
    template = Path(args.template).resolve() if args.template else skill_dir / "assets" / "templates" / "tcsd_template.xlsx"
    spec = Path(args.spec).resolve()
    workbook = Path(args.workbook).resolve()
    interface_json = Path(args.interface_json).resolve()
    if args.obligations:
        obligations = Path(args.obligations).resolve()
    else:
        if not args.logical_traces:
            raise SystemExit("provide --obligations or --logical-traces")
        obligations = build_obligations_from_traces(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            model=args.model,
            traces=Path(args.logical_traces).resolve(),
            logical_operators=Path(args.logical_operators).resolve() if args.logical_operators else None,
        )
    report = root_dir / "outputs" / f"{args.model}_mcdc_validation_report.json"
    manifest_path = Path(args.execution_manifest).resolve() if args.execution_manifest else root_dir / "outputs" / f"{args.model}_tcsd_execution_manifest.json"

    # The candidate is a strict artifact checkpoint before any MATLAB work.
    validate_workbook(python=args.python, scripts=scripts, root_dir=root_dir, workbook=workbook, interface_json=interface_json)
    coverage_ir: Path | None = None
    if args.logical_traces:
        coverage_ir = root_dir / "outputs" / f"{args.model}_coverage_ir.json"
        run([args.python, str(scripts / "build_coverage_ir.py"), "--logical-traces", str(Path(args.logical_traces).resolve()), "--output", str(coverage_ir)], cwd=root_dir)

    for iteration in range(args.max_iterations + 1):
        data = validate_mapping(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            workbook=workbook,
            obligations=obligations,
            report=report,
        )
        if not report_failed(data):
            break
        if iteration >= args.max_iterations:
            if not args.run_probe:
                print(json.dumps({"status": "failed", "report": str(report), "summary": data.get("summary", {})}, ensure_ascii=False, indent=2))
                return 1
            break
        spec, workbook = augment_once(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            template=template,
            model=args.model,
            spec=spec,
            workbook=workbook,
            interface_json=interface_json,
            obligations=obligations,
            report=report,
            iteration=iteration + 1,
        )

    data = load_json(report)
    coverage_json: Path | None = None
    if report_failed(data) and args.run_probe and args.logical_traces:
        if not args.mat_file:
            raise SystemExit("--run-probe requires --mat-file")
        state_plan = build_state_probe_plan(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            model=args.model,
            logical_traces=Path(args.logical_traces).resolve(),
        )
        state_plan_data = load_json(state_plan)
        if int(state_plan_data.get("summary", {}).get("candidate_count") or 0) > 0:
            obligations, _ = run_probe(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                model=args.model,
                mat_file=args.mat_file,
                init_scripts=args.init_script,
                unreachable_overrides=args.unreachable_overrides,
                collect_coverage=False,
                coverage_threshold=args.coverage_threshold,
                case_json=state_plan,
                output_name=f"{args.model}_state_probe_results.json",
            )
            data = validate_mapping(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                workbook=workbook,
                obligations=obligations,
                report=report,
            )
            if data.get("summary", {}).get("missing_count"):
                spec, workbook = augment_once(
                    python=args.python,
                    scripts=scripts,
                    root_dir=root_dir,
                    template=template,
                    model=args.model,
                    spec=spec,
                    workbook=workbook,
                    interface_json=interface_json,
                    obligations=obligations,
                    report=report,
                    iteration=args.max_iterations + 1,
                )
                data = validate_mapping(
                    python=args.python,
                    scripts=scripts,
                    root_dir=root_dir,
                    workbook=workbook,
                    obligations=obligations,
                    report=report,
                )
    # The first executable workbook is simulated/backfilled before its first
    # coverage run.  This ordering makes the coverage report actual evidence,
    # rather than a pre-backfill planning shortcut.
    simulation_result: Path | None = None
    if args.simulate_backfill:
        if not args.mat_file or not args.outputs:
            raise SystemExit("--simulate-backfill requires --mat-file and --outputs")
        case_json = extract_cases(python=args.python, scripts=scripts, root_dir=root_dir, model=args.model, workbook=workbook, interface_json=interface_json)
        simulation_result = simulate_and_backfill(
            python=args.python, scripts=scripts, root_dir=root_dir, model=args.model, workbook=workbook,
            case_json=case_json, mat_file=args.mat_file, outputs=args.outputs, exclude_outputs=args.exclude_outputs,
            interface_json=interface_json,
        )

    if (report_failed(data) or args.require_coverage) and args.run_probe:
        if not args.mat_file:
            raise SystemExit("--run-probe requires --mat-file")
        extract_cases(python=args.python, scripts=scripts, root_dir=root_dir, model=args.model, workbook=workbook, interface_json=interface_json)
        obligations, coverage_json = run_probe(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            model=args.model,
            mat_file=args.mat_file,
            init_scripts=args.init_script,
            unreachable_overrides=args.unreachable_overrides,
            collect_coverage=args.require_coverage,
            coverage_threshold=args.coverage_threshold,
        )
        data = validate_mapping(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            workbook=workbook,
            obligations=obligations,
            report=report,
        )
        if coverage_ir and args.logical_traces:
            run([args.python, str(scripts / "build_coverage_ir.py"), "--logical-traces", str(Path(args.logical_traces).resolve()), "--obligations", str(obligations), "--output", str(coverage_ir)], cwd=root_dir)

    is_coverage_below_target = False
    initial_coverage: dict[str, Any] | None = None
    initial_coverage_artifact: Path | None = None
    coverage_repair_attempted = False
    coverage_repair_applied = False
    coverage_repair_reason: str | None = None
    coverage_repair_evidence: Path | None = None
    if args.require_coverage:
        if not args.run_probe:
            raise SystemExit("--require-coverage requires --run-probe")
        if coverage_json is None or not coverage_json.exists():
            raise SystemExit("coverage report was not produced")
        is_coverage_below_target = coverage_below_target(coverage_json)
        initial_coverage = load_json(coverage_json)
        initial_coverage_artifact = root_dir / "outputs" / f"{args.model}_initial_coverage_summary.json"
        shutil.copy2(coverage_json, initial_coverage_artifact)

    if is_coverage_below_target:
        coverage_repair_attempted = True
        if args.logical_traces and coverage_ir:
            atomic_plan = build_atomic_repair_plan(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                model=args.model,
                logical_traces=Path(args.logical_traces).resolve(),
            )
            # The report-derived atomic planner feeds the persisted IR first;
            # only the IR synthesizer may append repair cases. This prevents the
            # old obligation augmenter and the IR path from both adding cases.
            run(
                [
                    args.python,
                    str(scripts / "build_coverage_ir.py"),
                    "--logical-traces",
                    str(Path(args.logical_traces).resolve()),
                    "--obligations",
                    str(atomic_plan),
                    "--output",
                    str(coverage_ir),
                ],
                cwd=root_dir,
            )
            repair_iteration = args.max_iterations + 1
            spec, workbook, synthesis = synthesize_ir_once(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                template=template,
                model=args.model,
                spec=spec,
                workbook=workbook,
                interface_json=interface_json,
                coverage_ir=coverage_ir,
                iteration=repair_iteration,
            )
            coverage_repair_evidence = root_dir / "outputs" / f"{args.model}_coverage_ir_synthesis_iter{repair_iteration}.json"
            if int(synthesis.get("added") or 0) > 0:
                coverage_repair_applied = True
                coverage_repair_reason = "coverage_ir_candidates_appended"
                validate_workbook(
                    python=args.python,
                    scripts=scripts,
                    root_dir=root_dir,
                    workbook=workbook,
                    interface_json=interface_json,
                )
            else:
                coverage_repair_reason = "no_unique_executable_coverage_ir_candidates"
        else:
            coverage_repair_reason = "coverage_ir_unavailable"

        if coverage_repair_applied:
            extract_cases(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                model=args.model,
                workbook=workbook,
                interface_json=interface_json,
            )
            obligations, coverage_json = run_probe(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                model=args.model,
                mat_file=args.mat_file,
                init_scripts=args.init_script,
                unreachable_overrides=args.unreachable_overrides,
                collect_coverage=True,
                coverage_threshold=args.coverage_threshold,
            )
            data = validate_mapping(
                python=args.python,
                scripts=scripts,
                root_dir=root_dir,
                workbook=workbook,
                obligations=obligations,
                report=report,
            )
            is_coverage_below_target = coverage_below_target(coverage_json)
            run(
                [
                    args.python,
                    str(scripts / "build_coverage_ir.py"),
                    "--logical-traces",
                    str(Path(args.logical_traces).resolve()),
                    "--obligations",
                    str(obligations),
                    "--output",
                    str(coverage_ir),
                ],
                cwd=root_dir,
            )

    if report_failed(data) and not coverage_repair_attempted:
        print(json.dumps({"status": "failed", "report": str(report), "summary": data.get("summary", {})}, ensure_ascii=False, indent=2))
        return 1

    # If a coverage repair changed the workbook, re-run the required
    # simulation/backfill checkpoint exactly once for the final artifact.
    if args.simulate_backfill and (simulation_result is None or coverage_repair_applied):
        if not args.mat_file or not args.outputs:
            raise SystemExit("--simulate-backfill requires --mat-file and --outputs")
        case_json = extract_cases(python=args.python, scripts=scripts, root_dir=root_dir, model=args.model, workbook=workbook, interface_json=interface_json)
        simulation_result = simulate_and_backfill(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            model=args.model,
            workbook=workbook,
            case_json=case_json,
            mat_file=args.mat_file,
            outputs=args.outputs,
            exclude_outputs=args.exclude_outputs,
            interface_json=interface_json,
        )
        data = validate_mapping(
            python=args.python,
            scripts=scripts,
            root_dir=root_dir,
            workbook=workbook,
            obligations=obligations,
            report=report,
        )
        if report_failed(data) and not coverage_repair_attempted:
            print(json.dumps({"status": "failed_after_backfill", "report": str(report), "summary": data.get("summary", {})}, ensure_ascii=False, indent=2))
            return 1

    final_coverage = load_json(coverage_json) if coverage_json and coverage_json.exists() else None
    manifest = write_execution_manifest(
        path=manifest_path,
        root_dir=root_dir,
        model=args.model,
        threshold=args.coverage_threshold,
        workbook=workbook,
        simulation_result=simulation_result,
        initial_coverage=initial_coverage,
        final_coverage=final_coverage,
        initial_coverage_artifact=initial_coverage_artifact,
        final_coverage_artifact=coverage_json,
        repair_required=bool(initial_coverage and coverage_below_target(initial_coverage_artifact)),
        repair_applied=coverage_repair_applied,
        obligations=obligations,
        mapping_report=report,
        coverage_ir=coverage_ir,
        repair_attempted=coverage_repair_attempted,
        repair_reason=coverage_repair_reason,
        repair_evidence=coverage_repair_evidence,
    )
    if manifest["status"] != "completed":
        print(json.dumps({"status": "incomplete_execution_contract", "manifest": str(manifest_path), "details": manifest}, ensure_ascii=False, indent=2))
        return 1

    print(
        json.dumps(
            {
                "status": "coverage_below_target" if is_coverage_below_target else "passed",
                "workbook": str(workbook),
                "obligations": str(obligations),
                "report": str(report),
                "summary": data.get("summary", {}),
                "coverage": str(coverage_json) if coverage_json else None,
                "coverage_repair_required": is_coverage_below_target,
                "coverage_repair_attempted": coverage_repair_attempted,
                "coverage_repair_applied": coverage_repair_applied,
                "coverage_repair_reason": coverage_repair_reason,
                "initial_coverage": initial_coverage,
                "execution_manifest": str(manifest_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
