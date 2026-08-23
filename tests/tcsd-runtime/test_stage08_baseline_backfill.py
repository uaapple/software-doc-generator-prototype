#!/usr/bin/env python3
"""Regression tests for the TCSD Stage-08 baseline backfill failure.

Production case (task dc227aca-64d5-4e70-af0e-08af44385296): the deterministic
baseline Action was shaped as ``<assignments> + [+0.1s]``. Every step parser
(extract / backfill / workbook_steps) drops lines before the first step
marker, so the Action collapsed to a single empty final delay and the backfill
deliberately skipped expValue -> validate_tcsd_workbook --require-exp-values
failed with missing_exp_values (tcsd_stage_runtime_failed, hard=true).

The canonical Action grammar is marker-first: input assignments belong inside
a step, and the trailing marker is a pure observation window carrying no
expectations. These tests pin:
  1. initial_spec emits the canonical shape;
  2. parsers preserve (never silently drop) pre-marker assignments;
  3. the full Stage-08 chain (build -> extract -> simulate -> backfill ->
     validate --require-exp-values -> simulation_backfill_evidence) passes;
  4. a legacy single-step shape now fails loudly (missing_final_delay) instead
     of silently losing data (missing_exp_values with an empty Action).

Run: python3 -m unittest test_stage08_baseline_backfill -v
  or: python3 test_stage08_baseline_backfill.py
"""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RUNTIME_DIR = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime" / "scripts"
TEMPLATE = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime" / "assets" / "templates" / "tcsd_template.xlsx"

MODEL = "EngStrtStop_A09_B02_C02"
INPUTS = [f"EngStrtStop_sig{i:02d}" for i in range(1, 19)]
OUTPUTS = ["EngStrtStop_stOprtgCdnIdn"]

STEP_RE = re.compile(r"^\s*\[\+\s*[0-9.]+\s*(ms|s)\s*\](?:\s*//.*)?$", re.IGNORECASE)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def run_script(script: Path, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=cwd,
        capture_output=True,
        text=True,
    )


def interface_dict() -> dict:
    return {"schema": "tcsd-model-interface/v1", "inputs": INPUTS, "outputs": OUTPUTS}


def sim_result_for_case_json(case_json: Path, value: float = 0.0) -> dict:
    cases = json.loads(case_json.read_text(encoding="utf-8"))
    tests = []
    for test in cases["tests"]:
        steps = []
        for step in test["steps"]:
            steps.append(
                {
                    "index": step["index"],
                    "time_s": step["delay_s"],
                    "outputs": {OUTPUTS[0]: value},
                    "stable": {OUTPUTS[0]: True},
                }
            )
        tests.append({"row": test["row"], "test_id": test["test_id"], "steps": steps})
    return {"schema": "tcsd-simulation-result/v1", "tests": tests}


def build_workbook(spec: dict, workbook: Path):
    workbook.parent.mkdir(parents=True, exist_ok=True)
    spec_path = workbook.with_suffix(".spec.json")
    spec_path.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    interface_path = workbook.with_suffix(".interface.json")
    interface_path.write_text(json.dumps(interface_dict(), ensure_ascii=False), encoding="utf-8")
    proc = run_script(
        RUNTIME_DIR / "build_tcsd_from_json.py",
        "--template",
        str(TEMPLATE),
        "--spec",
        str(spec_path),
        "--output",
        str(workbook),
        "--interface-json",
        str(interface_path),
    )
    if proc.returncode != 0:
        raise AssertionError(f"build_tcsd_from_json failed: {proc.stderr[:500]}")
    return interface_path


class Stage08BaselineBackfillTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.runtime = load_module("tcsd_pipeline_stage", RUNTIME_DIR / "run_tcsd_pipeline_stage.py")
        self.backfill = load_module("tcsd_backfill", RUNTIME_DIR / "backfill_expected_outputs.py")
        self.extract = load_module("tcsd_extract", RUNTIME_DIR / "extract_tcsd_cases.py")
        self.spec = self.runtime.initial_spec(interface_dict(), MODEL)

    def test_initial_spec_action_is_canonical(self):
        action = self.spec["tests"][0]["action"]
        lines = [line for line in action.splitlines() if line.strip()]
        # marker-first: the first line is a step marker, not an assignment
        self.assertRegex(lines[0], STEP_RE)
        # trailing marker is a pure observation window
        self.assertRegex(lines[-1], STEP_RE)
        # the stem step carries all input assignments
        steps = self.backfill.parse_steps(action)
        self.assertEqual(len(steps), 2)
        self.assertEqual(len(steps[0]["lines"]), len(INPUTS))
        self.assertEqual(steps[1]["lines"], [])
        parsed, unknowns = self.extract.parse_steps(action, set(INPUTS), 6, "TC_001")
        self.assertEqual(unknowns, [])
        self.assertEqual(len(parsed), 2)
        self.assertEqual(len(parsed[0]["input_updates"]), len(INPUTS))

    def test_pre_marker_assignments_are_preserved_not_dropped(self):
        legacy = "\n".join([*(f"{name}=0;" for name in INPUTS), "[+0.1s]"])
        steps = self.backfill.parse_steps(legacy)
        self.assertEqual(len(steps), 1)
        self.assertEqual(len(steps[0]["lines"]), len(INPUTS))
        parsed, unknowns = self.extract.parse_steps(legacy, set(INPUTS), 6, "TC_001")
        self.assertEqual(unknowns, [])
        self.assertEqual(len(parsed), 1)
        self.assertEqual(len(parsed[0]["input_updates"]), len(INPUTS))
        # backfill writes the stable simulation output into the step
        rebuilt = self.backfill.build_action(
            legacy,
            {1: {"outputs": {OUTPUTS[0]: 0.0}, "stable": {OUTPUTS[0]: True}}},
            OUTPUTS,
        )
        self.assertIn("expValue(0)", rebuilt)
        self.assertIn("[+0.1s]", rebuilt)

    def test_stage8_e2e_baseline_backfill_passes(self):
        workbook = self.root / "outputs" / f"{MODEL}_Test0001_tcsd.xlsx"
        interface_path = build_workbook(self.spec, workbook)
        case_json = self.root / "outputs" / f"{MODEL}_cases_mcdc.json"
        proc = run_script(
            RUNTIME_DIR / "extract_tcsd_cases.py",
            "--workbook",
            str(workbook),
            "--inputs",
            ",".join(INPUTS),
            "--output",
            str(case_json),
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[:500])
        sim_json = self.root / "outputs" / f"{MODEL}_sim_results_mcdc.json"
        sim_json.write_text(json.dumps(sim_result_for_case_json(case_json), ensure_ascii=False), encoding="utf-8")
        proc = run_script(
            RUNTIME_DIR / "backfill_expected_outputs.py",
            "--workbook",
            str(workbook),
            "--results",
            str(sim_json),
            "--outputs",
            ",".join(OUTPUTS),
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[:500])
        proc = run_script(
            RUNTIME_DIR / "validate_tcsd_workbook.py",
            "--workbook",
            str(workbook),
            "--interface-json",
            str(interface_path),
            "--require-exp-values",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[:500])
        evidence = self.runtime.simulation_backfill_evidence(json.loads(sim_json.read_text()), workbook)
        self.assertGreaterEqual(evidence["workbookBackfillCount"], 1)
        self.assertEqual(evidence["simulationValueCount"], evidence["workbookBackfillCount"])

    def test_legacy_single_step_action_fails_loudly_not_silently(self):
        # A legacy action whose only step is the observation window cannot be
        # healed by backfill (expValue must never land after the final marker).
        # The defensible outcome is a descriptive validation error, not a
        # silently corrupted workbook.
        legacy_spec = {
            "model_name": MODEL,
            "test_group": {"id": "TG_001", "name": MODEL, "description": "legacy"},
            "tests": [
                {
                    "id": "TC_001",
                    "name": "legacy baseline",
                    "description": "legacy shape",
                    "initialization": "\n".join(f"{name}=0;" for name in INPUTS),
                    "action": "\n".join([*(f"{name}=0;" for name in INPUTS), "[+0.1s]"]),
                }
            ],
        }
        workbook = self.root / "outputs" / f"{MODEL}_legacy_tcsd.xlsx"
        interface_path = build_workbook(legacy_spec, workbook)
        case_json = self.root / "outputs" / f"{MODEL}_legacy_cases.json"
        proc = run_script(
            RUNTIME_DIR / "extract_tcsd_cases.py",
            "--workbook",
            str(workbook),
            "--inputs",
            ",".join(INPUTS),
            "--output",
            str(case_json),
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[:500])
        # the preserved pre-marker assignments must reach the simulation cases
        cases = json.loads(case_json.read_text(encoding="utf-8"))
        self.assertEqual(len(cases["tests"][0]["steps"][0]["input_updates"]), len(INPUTS))
        sim_json = self.root / "outputs" / f"{MODEL}_legacy_sim.json"
        sim_json.write_text(json.dumps(sim_result_for_case_json(case_json), ensure_ascii=False), encoding="utf-8")
        proc = run_script(
            RUNTIME_DIR / "backfill_expected_outputs.py",
            "--workbook",
            str(workbook),
            "--results",
            str(sim_json),
            "--outputs",
            ",".join(OUTPUTS),
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[:500])
        proc = run_script(
            RUNTIME_DIR / "validate_tcsd_workbook.py",
            "--workbook",
            str(workbook),
            "--interface-json",
            str(interface_path),
            "--require-exp-values",
        )
        # data is preserved and the expectation exists; only the trailing
        # marker invariant is violated, and that must be reported loudly
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("missing_final_delay", proc.stderr)
        self.assertNotIn("missing_exp_values", proc.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
