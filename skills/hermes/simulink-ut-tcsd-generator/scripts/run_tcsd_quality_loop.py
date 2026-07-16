#!/usr/bin/env python3
"""Run the deterministic TCSD MC/DC quality loop.

The default path is workbook-side validation and mapped missing-vector
augmentation. Optional flags add MATLAB/SATK probe and simulation/backfill
steps, keeping expensive operations opt-in and bounded.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def run(cmd: list[str], *, cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def report_failed(report: dict[str, Any]) -> bool:
    summary = report.get("summary", {})
    return bool(summary.get("missing_count") or summary.get("unresolved_count"))


def load_interface_inputs(path: Path) -> list[str]:
    data = load_json(path)
    if isinstance(data.get("inputs"), list):
        return [str(item) for item in data["inputs"]]
    root = data.get("rootPorts") if isinstance(data.get("rootPorts"), dict) else {}
    inputs = root.get("inputs") if isinstance(root, dict) else []
    if inputs and isinstance(inputs[0], dict):
        return [str(item.get("name")) for item in inputs if item.get("name")]
    return [str(item) for item in inputs or []]


def matlab_string(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def matlab_cell(values: list[str]) -> str:
    return "{" + ", ".join(matlab_string(value) for value in values) + "}"


def write_matlab_entry(path: Path, code: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(code, encoding="utf-8")
    return path


def run_satk(python: str, scripts: Path, entry: Path, root_dir: Path) -> None:
    run([python, str(scripts / "satk_eval.py"), str(entry)], cwd=root_dir)


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
    report: Path,
    iteration: int,
) -> tuple[Path, Path]:
    next_spec = root_dir / f"{model}_spec_mcdc_iter{iteration}.json"
    run(
        [
            python,
            str(scripts / "augment_tcsd_for_mcdc.py"),
            "--spec",
            str(spec),
            "--obligations",
            str(obligations),
            "--validation-report",
            str(report),
            "--output",
            str(next_spec),
        ],
        cwd=root_dir,
    )
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


def extract_cases(
    *,
    python: str,
    scripts: Path,
    root_dir: Path,
    model: str,
    workbook: Path,
    interface_json: Path,
) -> Path:
    inputs = ",".join(load_interface_inputs(interface_json))
    case_json = root_dir / "outputs" / f"{model}_cases_mcdc.json"
    run(
        [
            python,
            str(scripts / "extract_tcsd_cases.py"),
            "--workbook",
            str(workbook),
            "--inputs",
            inputs,
            "--output",
            str(case_json),
        ],
        cwd=root_dir,
    )
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
) -> tuple[Path, Path | None]:
    probe_results = root_dir / "outputs" / "logic_probe_results.json"
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
    entry = write_matlab_entry(
        root_dir / "outputs" / f"{model}_probe_mcdc_entry.m",
        "\n".join(
            [
                f"rootDir = {matlab_string(str(root_dir))};",
                f"addpath({matlab_string(str(scripts))});",
                (
                    f"probe_logical_mcdc_vectors(rootDir, {matlab_cell([model])}, "
                    f"{matlab_string(mat_file)}, 'InitScripts', {matlab_cell(init_scripts)}, "
                    f"'OutputJson', {matlab_string(str(probe_results))}{coverage_args});"
                ),
            ]
        ),
    )
    run_satk(python, scripts, entry, root_dir)
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
    run(cmd, cwd=root_dir, check=False)
    return obligations, coverage_json if collect_coverage else None


def coverage_below_target(path: Path) -> bool:
    report = load_json(path)
    if not report:
        return True
    return any(not bool(item.get("passed")) for item in report.values() if isinstance(item, dict))


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
) -> None:
    result_json = root_dir / "outputs" / f"{model}_sim_results_mcdc.json"
    entry = write_matlab_entry(
        root_dir / "outputs" / f"{model}_simulate_mcdc_entry.m",
        "\n".join(
            [
                f"rootDir = {matlab_string(str(root_dir))};",
                f"addpath({matlab_string(str(scripts))});",
                (
                    f"simulate_tcsd_cases(rootDir, {matlab_string(model)}, {matlab_string(mat_file)}, "
                    f"{matlab_string(str(case_json))}, {matlab_string(str(result_json))});"
                ),
            ]
        ),
    )
    run_satk(python, scripts, entry, root_dir)
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

    is_coverage_below_target = False
    if args.require_coverage:
        if not args.run_probe:
            raise SystemExit("--require-coverage requires --run-probe")
        if coverage_json is None or not coverage_json.exists():
            raise SystemExit("coverage report was not produced")
        is_coverage_below_target = coverage_below_target(coverage_json)

    if report_failed(data):
        print(json.dumps({"status": "failed", "report": str(report), "summary": data.get("summary", {})}, ensure_ascii=False, indent=2))
        return 1

    if args.simulate_backfill:
        if not args.mat_file or not args.outputs:
            raise SystemExit("--simulate-backfill requires --mat-file and --outputs")
        case_json = extract_cases(python=args.python, scripts=scripts, root_dir=root_dir, model=args.model, workbook=workbook, interface_json=interface_json)
        simulate_and_backfill(
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
        if report_failed(data):
            print(json.dumps({"status": "failed_after_backfill", "report": str(report), "summary": data.get("summary", {})}, ensure_ascii=False, indent=2))
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
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
