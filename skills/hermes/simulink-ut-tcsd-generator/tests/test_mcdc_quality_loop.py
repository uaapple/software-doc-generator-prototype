#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


class McdcQualityLoopTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
