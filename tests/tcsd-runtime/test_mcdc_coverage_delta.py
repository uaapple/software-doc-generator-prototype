#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime" / "scripts" / "judge_mcdc_coverage_delta.py"
SPEC = importlib.util.spec_from_file_location("judge_mcdc_coverage_delta", SCRIPT)
assert SPEC and SPEC.loader
JUDGE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = JUDGE
SPEC.loader.exec_module(JUDGE)


def description(*, achieved: bool, true: str = "TT", false: str = "FT") -> str:
    import json
    return json.dumps({"text": "C1 && C2", "condition": [{"text": "C1 (In1)", "achieved": achieved, "trueRslt": true, "falseRslt": false}]})


def report(*, achieved: bool, mode: str = "Masking", checksum: str = "same", library: str = "/workspace/ITKLib.slx"):
    import json
    return {"models": {"M": {
        "mcdc_mode": mode,
        "model_checksum": checksum,
        "support_library_path": library,
        "initialization_scripts": [],
        "mcdc_items": [
            {"coverage_class": "MCDC", "block_path": "M/Logic", "sid": "7", "description": description(achieved=achieved)},
        ],
        "items": [
            {"coverage_class": "Condition", "block_path": "M/Logic", "sid": "7", "description": json.dumps({"condition": [{"text": "port1", "trueCnts": 2, "falseCnts": 1}]})},
            {"coverage_class": "Decision", "block_path": "M/Logic", "sid": "7", "description": json.dumps({"decision": [{"outcome": [{"executionCount": 1}, {"executionCount": 1}]}]})},
        ],
    }}}


def repair_ir():
    return {"items": [{
        "id": "candidate-c1",
        "source_obligation_id": "missing-c1",
        "coverage_class": "MCDC",
        "block": {"path": "M/Logic", "sid": "7"},
        "required_outcome": "C1 independent effect",
    }]}


class McdcCoverageDeltaTests(unittest.TestCase):
    def test_accepts_only_new_suite_level_independent_effect_pair(self):
        result = JUDGE.judge(baseline=report(achieved=False), candidate=report(achieved=True), repair_ir=repair_ir(), model="M")
        self.assertTrue(result["passed"])
        self.assertEqual(result["newIndependentEffectPairCount"], 1)
        self.assertEqual(result["results"][0]["reasonCode"], "independent_effect_pair_added")

    def test_rejects_observed_toggle_without_independent_effect_pair(self):
        result = JUDGE.judge(baseline=report(achieved=False), candidate=report(achieved=False), repair_ir=repair_ir(), model="M")
        self.assertFalse(result["passed"])
        self.assertEqual(result["results"][0]["reasonCode"], "effect_masked")

    def test_rejects_suite_when_target_was_already_covered_and_no_pair_is_added(self):
        result = JUDGE.judge(baseline=report(achieved=True), candidate=report(achieved=True), repair_ir=repair_ir(), model="M")
        self.assertFalse(result["passed"])
        self.assertEqual(result["newIndependentEffectPairCount"], 0)
        self.assertEqual(result["results"][0]["reasonCode"], "already_covered_before_candidate_suite")

    def test_non_mcdc_repair_is_not_blocked_by_mcdc_judge(self):
        proposal = repair_ir()
        proposal["items"][0]["coverage_class"] = "Condition"
        result = JUDGE.judge(baseline=report(achieved=False), candidate=report(achieved=False), repair_ir=proposal, model="M")
        self.assertTrue(result["passed"])
        self.assertFalse(result["applicable"])

    def test_rejects_mcdc_mode_mismatch(self):
        with self.assertRaisesRegex(ValueError, "mcdc_mode mismatch"):
            JUDGE.judge(baseline=report(achieved=False), candidate=report(achieved=True, mode="UniqueCause"), repair_ir=repair_ir(), model="M")

    def test_rejects_model_or_library_context_mismatch(self):
        with self.assertRaisesRegex(ValueError, "model_checksum mismatch"):
            JUDGE.judge(baseline=report(achieved=False), candidate=report(achieved=True, checksum="other"), repair_ir=repair_ir(), model="M")
        with self.assertRaisesRegex(ValueError, "ITKLib path mismatch"):
            JUDGE.judge(baseline=report(achieved=False), candidate=report(achieved=True, library="/other/ITKLib.slx"), repair_ir=repair_ir(), model="M")


if __name__ == "__main__":
    unittest.main()
