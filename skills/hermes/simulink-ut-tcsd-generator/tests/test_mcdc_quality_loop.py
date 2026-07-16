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
    def test_coverage_threshold_triggers_repair_without_being_a_mapping_failure(self) -> None:
        quality_loop = load_script_module("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "coverage.json"
            report.write_text(
                json.dumps({"A02": {"condition": {"passed": True}, "decision": {"passed": True}, "mcdc": {"passed": False}, "passed": False}}),
                encoding="utf-8",
            )
            self.assertTrue(quality_loop.coverage_below_target(report))

            report.write_text(
                json.dumps({"A02": {"condition": {"passed": True}, "decision": {"passed": True}, "mcdc": {"passed": True}, "passed": True}}),
                encoding="utf-8",
            )
            self.assertFalse(quality_loop.coverage_below_target(report))

    def test_trace_adapter_derives_symbolic_parameter_and_nested_logic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            trace = {
                "model": "A02",
                "operators": [
                    {
                        "id": "A02:16",
                        "block_path": "A02/Sub/OR",
                        "operator": "OR",
                        "ports": [
                            {
                                "index": 1,
                                "trace": {
                                    "kind": "logic",
                                    "operator": "AND",
                                    "inputs": [
                                        {"index": 1, "trace": {"kind": "logic", "operator": "NOT", "inputs": [{"index": 1, "trace": {"kind": "root_inport", "signal": "ErrA"}}]}},
                                        {"index": 2, "trace": {"kind": "logic", "operator": "NOT", "inputs": [{"index": 1, "trace": {"kind": "root_inport", "signal": "ErrB"}}]}},
                                    ],
                                },
                            },
                            {"index": 2, "trace": {"kind": "constant", "value": "Bypass_C"}},
                        ],
                    }
                ],
            }
            (work / "trace.json").write_text(json.dumps(trace), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "derive_logical_mcdc_mappings.py"),
                    "--traces",
                    str(work / "trace.json"),
                    "--output",
                    str(work / "mapping.json"),
                ],
                check=True,
            )
            mapping = json.loads((work / "mapping.json").read_text(encoding="utf-8"))
            first, second = mapping["operators"][0]["ports"]
            self.assertEqual(first["true_inputs"], {"ErrA": 0, "ErrB": 0})
            self.assertEqual(first["false_inputs"], {"ErrA": 1, "ErrB": 0})
            self.assertEqual(second["true_params"], {"Bypass_C": 1})
            self.assertEqual(second["false_params"], {"Bypass_C": 0})

    def test_trace_adapter_accepts_single_input_object_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            trace = {
                "model": "A02",
                "operators": [{
                    "id": "A02:7",
                    "operator": "AND",
                    "ports": [{
                        "index": 1,
                        "trace": {
                            "kind": "logic",
                            "operator": "NOT",
                            "inputs": {
                                "index": 1,
                                "trace": {
                                    "kind": "subsystem_inport",
                                    "source": {"kind": "root_inport", "signal": "HvOnFail"},
                                },
                            },
                        },
                    }],
                }],
            }
            (work / "trace.json").write_text(json.dumps(trace), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "derive_logical_mcdc_mappings.py"),
                    "--traces",
                    str(work / "trace.json"),
                    "--output",
                    str(work / "mapping.json"),
                ],
                check=True,
            )
            port = json.loads((work / "mapping.json").read_text(encoding="utf-8"))["operators"][0]["ports"][0]
            self.assertEqual(port["true_inputs"], {"HvOnFail": 0})
            self.assertEqual(port["false_inputs"], {"HvOnFail": 1})

    def test_backfill_keeps_later_stable_steps_after_unstable_step(self) -> None:
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

        self.assertNotIn("OutA = expValue(0);", rebuilt)
        self.assertNotIn("OutA = expValue(0,0.01,0);", rebuilt)
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
