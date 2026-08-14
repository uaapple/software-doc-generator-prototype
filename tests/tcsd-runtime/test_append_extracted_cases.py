#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "skills" / "hermes" / "tcsd-runtime" / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location(
    "append_extracted_cases_to_tcsd", SCRIPTS / "append_extracted_cases_to_tcsd.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class AppendExtractedCasesTests(unittest.TestCase):
    def test_appends_and_remaps_generated_cases(self) -> None:
        spec = {
            "model_name": "Example",
            "test_group": {"id": "TG_001"},
            "tests": [{"id": "TC_001", "initialization": "u=0;", "action": "[+0.1s]"}],
        }
        candidates = {
            "schema": "tcsd-extracted-cases/v1",
            "model": "Example",
            "tests": [{
                "row": 6,
                "test_id": "SLDV_001",
                "name": "generated",
                "init_values": {"u": 2},
                "init_params": {},
                "steps": [{"delay_s": 0.2, "input_updates": {"u": 3}, "param_updates": {}}],
            }],
        }
        updated, remapped, report = MODULE.append_cases(spec, candidates)
        self.assertEqual(report["appendedCount"], 1)
        self.assertEqual(updated["tests"][-1]["id"], "TC_002")
        self.assertIn("u=2;", updated["tests"][-1]["initialization"])
        self.assertIn("[+0.2s]", updated["tests"][-1]["action"])
        self.assertEqual(remapped["tests"][0]["row"], 7)
        self.assertEqual(remapped["tests"][0]["test_id"], "TC_002")

    def test_rejects_step_parameter_changes(self) -> None:
        with self.assertRaisesRegex(ValueError, "parameters"):
            MODULE.action_text({
                "steps": [{"delay_s": 0.1, "input_updates": {}, "param_updates": {"p": 1}}]
            })


if __name__ == "__main__":
    unittest.main()
