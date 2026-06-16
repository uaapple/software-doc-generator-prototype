#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def load_script_module(script_name: str):
    spec = importlib.util.spec_from_file_location(script_name.removesuffix(".py"), SCRIPTS / script_name)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class McdcQualityLoopTests(unittest.TestCase):
    def test_backfill_uses_point_window_for_unstable_step(self) -> None:
        backfill = load_script_module("backfill_expected_outputs.py")
        action = "\n".join(
            [
                "[+0.02s] // start timer branch",
                "InputA = 1;",
                "[+6.3s] // timer expired",
                "[+0.1s]",
            ]
        )
        step_results = {
            1: {"outputs": {"OutA": 0}, "stable": {"OutA": False}},
            2: {"outputs": {"OutA": 1}, "stable": {"OutA": True}},
            3: {"outputs": {"OutA": 1}, "stable": {"OutA": True}},
        }

        rebuilt = backfill.build_action(action, step_results, ["OutA"])

        self.assertIn("[+0.02s] // start timer branch\nInputA = 1;\nOutA = expValue(0,0.01,0);", rebuilt)
        self.assertIn("[+6.3s] // timer expired\nOutA = expValue(1);", rebuilt)

    def test_probe_obligations_distinguish_required_and_unreachable(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            probe = {
                "ModelA": {
                    "model": "ModelA",
                    "probes": [
                        {
                            "id": "ModelA:1",
                            "block_path": "ModelA/AND",
                            "sid": "ModelA:1",
                            "operator": "AND",
                            "port_names": ["u1", "u2"],
                        }
                    ],
                    "observations": [
                        {"test_id": "TC_001", "row": 6, "step_index": 1, "time_s": 1.0, "inputs": {"a": 1, "b": 1}, "params": {}, "vectors": {"x": {"id": "ModelA:1", "label": "TT", "ok": True}}},
                        {"test_id": "TC_002", "row": 7, "step_index": 1, "time_s": 1.0, "inputs": {"a": 0, "b": 1}, "params": {}, "vectors": {"x": {"id": "ModelA:1", "label": "FT", "ok": True}}},
                    ],
                }
            }
            overrides = [{"model": "ModelA", "operator_id": "ModelA:1", "label": "TF", "status": "unreachable", "reason": "structural coupling"}]
            (work / "probe.json").write_text(json.dumps(probe), encoding="utf-8")
            (work / "overrides.json").write_text(json.dumps(overrides), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "build_probe_mcdc_obligations.py"),
                    "--probe-results",
                    str(work / "probe.json"),
                    "--output-dir",
                    str(work),
                    "--unreachable-overrides",
                    str(work / "overrides.json"),
                ],
                check=True,
            )
            report = json.loads((work / "ModelA_coverage_obligations.json").read_text(encoding="utf-8"))
            self.assertEqual(report["summary"]["required_count"], 2)
            self.assertEqual(report["summary"]["unreachable_count"], 1)
            self.assertEqual(report["summary"]["unresolved_count"], 0)

    def test_augment_adds_mapped_missing_case_with_final_delay(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            spec = {
                "model_name": "ModelA",
                "test_group": {"id": "TG_001", "name": "Group"},
                "tests": [
                    {
                        "id": "TC_001",
                        "name": "Baseline",
                        "requirement_id": "REQ",
                        "description": "baseline",
                        "initialization": "a=1;\nb=1;\np Gain=2;",
                        "action": "[+1s]\n[+0.1s]",
                        "work_status": "reviewed",
                    }
                ],
            }
            obligations = {
                "obligations": [
                    {
                        "id": "ModelA:1_TF",
                        "status": "required",
                        "block_path": "ModelA/AND",
                        "required_outcome": "operator_input_vector=TF; output=false",
                        "match": {"inputs": {"a": 1, "b": 0}, "params": {"Gain": 3}},
                    }
                ]
            }
            validation = {"missing": [{"id": "ModelA:1_TF"}]}
            (work / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
            (work / "obligations.json").write_text(json.dumps(obligations), encoding="utf-8")
            (work / "validation.json").write_text(json.dumps(validation), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "augment_tcsd_for_mcdc.py"),
                    "--spec",
                    str(work / "spec.json"),
                    "--obligations",
                    str(work / "obligations.json"),
                    "--validation-report",
                    str(work / "validation.json"),
                    "--output",
                    str(work / "augmented.json"),
                ],
                check=True,
            )
            augmented = json.loads((work / "augmented.json").read_text(encoding="utf-8"))
            self.assertEqual(len(augmented["tests"]), 2)
            new_test = augmented["tests"][-1]
            self.assertIn("b=0;", new_test["initialization"])
            self.assertIn("p Gain=3;", new_test["initialization"])
            self.assertTrue(new_test["action"].strip().endswith("[+0.1s]"))

    def test_logical_mcdc_validator_counts_parameter_overrides(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            logical_ops = {
                "model": "ModelA",
                "operators": [
                    {
                        "id": "ModelA:AND1",
                        "block_path": "ModelA/AND1",
                        "operator": "AND",
                        "ports": [
                            {
                                "index": 1,
                                "source": "RootA",
                                "true_inputs": {"RootA": 1},
                                "false_inputs": {"RootA": 0},
                            },
                            {
                                "index": 2,
                                "source": "Constant Value RefuEndGearPShd_C",
                                "true_params": {"RefuEndGearPShd_C": 1},
                                "false_params": {"RefuEndGearPShd_C": 0},
                            },
                        ],
                    }
                ],
            }
            (work / "logical_ops.json").write_text(json.dumps(logical_ops), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "build_logical_mcdc_obligations.py"),
                    "--logical-operators",
                    str(work / "logical_ops.json"),
                    "--output",
                    str(work / "obligations.json"),
                ],
                check=True,
            )
            obligations = json.loads((work / "obligations.json").read_text(encoding="utf-8"))
            self.assertEqual(obligations["summary"]["required_count"], 3)
            self.assertIn(
                {"RefuEndGearPShd_C": 1},
                [item["match"]["params"] for item in obligations["obligations"]],
            )

            from openpyxl import Workbook

            workbook = Workbook()
            ws = workbook.active
            ws.title = "TCSD"
            ws.append(["TestID", "Name", "Type", "Requirement ID", "Test Case Description", "Initialization", "Action"])
            ws.append(
                [
                    "TC_001",
                    "Parameter MC/DC",
                    "Test",
                    "UT_MCDC",
                    "Covers AND vectors that require calibration override",
                    "RootA=1;\np RefuEndGearPShd_C=1;",
                    "[+0.1s]\nRootA=0;\n[+0.1s]\nRootA=1;\np RefuEndGearPShd_C=0;\n[+0.1s]",
                ]
            )
            workbook.save(work / "cases.xlsx")

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "validate_logical_mcdc_mapping.py"),
                    "--workbook",
                    str(work / "cases.xlsx"),
                    "--obligations",
                    str(work / "obligations.json"),
                    "--report-json",
                    str(work / "validation.json"),
                ],
                check=True,
            )
            validation = json.loads((work / "validation.json").read_text(encoding="utf-8"))
            self.assertEqual(validation["status"], "passed")
            self.assertEqual(validation["summary"]["missing_count"], 0)


if __name__ == "__main__":
    unittest.main()
