#!/usr/bin/env python3
"""Regression tests for manifest-driven bundle hashing and the probe plan
global candidate budget (commit 7: performance & hash governance).

Run: python3 -m unittest test_manifest_and_budget -v
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
RUNNER_SCRIPT = RUNTIME / "scripts" / "dsh_stage_runner.py"
PLANNER_SCRIPT = RUNTIME / "scripts" / "build_state_probe_plan.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


RUNNER = _load("dsh_stage_runner", RUNNER_SCRIPT)
PLANNER = _load("build_state_probe_plan", PLANNER_SCRIPT)


class HashTreeManifestTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.bundle = Path(self._tmp.name)

    def _write_manifest(self, files):
        (self.bundle / "bundle-manifest.json").write_text(json.dumps({
            "schema": "tcsd-bundle-manifest/v1",
            "fileCount": len(files),
            "files": files,
        }, indent=2), encoding="utf-8")

    def test_manifest_mode_ignores_stray_files(self):
        (self.bundle / "SKILL.md").write_text("skill", encoding="utf-8")
        self._write_manifest([{"path": "SKILL.md", "sha256": "ignored", "mode": 420}])
        baseline = RUNNER.hash_tree(self.bundle)
        # Stray file lands next to the manifest: hash unchanged.
        (self.bundle / ".DS_Store").write_bytes(b"junk")
        (self.bundle / "__pycache__").mkdir()
        (self.bundle / "__pycache__" / "x.pyc").write_bytes(b"junk")
        self.assertEqual(RUNNER.hash_tree(self.bundle), baseline)

    def test_manifest_mode_covers_content_and_mode(self):
        (self.bundle / "SKILL.md").write_text("skill", encoding="utf-8")
        self._write_manifest([{"path": "SKILL.md", "sha256": "ignored", "mode": 420}])
        baseline = RUNNER.hash_tree(self.bundle)
        (self.bundle / "SKILL.md").write_text("skill v2", encoding="utf-8")
        self.assertNotEqual(RUNNER.hash_tree(self.bundle), baseline, "content changes must shift the hash")
        (self.bundle / "SKILL.md").write_text("skill", encoding="utf-8")
        self._write_manifest([{"path": "SKILL.md", "sha256": "ignored", "mode": 0o755}])
        self.assertNotEqual(RUNNER.hash_tree(self.bundle), baseline, "mode changes must shift the hash")

    def test_fallback_mode_skips_stray_and_manifest(self):
        (self.bundle / "a.txt").write_text("A", encoding="utf-8")
        baseline = RUNNER.hash_tree(self.bundle)
        (self.bundle / ".DS_Store").write_bytes(b"junk")
        (self.bundle / "bundle-manifest.json").write_text("{}", encoding="utf-8")
        # Both the stray file and the manifest itself are skipped in fallback
        # mode, so the hash is unchanged.
        self.assertEqual(RUNNER.hash_tree(self.bundle), baseline)
        # A real content file does shift the hash.
        (self.bundle / "b.txt").write_text("B", encoding="utf-8")
        self.assertNotEqual(RUNNER.hash_tree(self.bundle), baseline)


class PlanBudgetTest(unittest.TestCase):
    def _report(self):
        return {
            "model": "M",
            "operators": [
                {"id": "M:1", "operator": "AND", "ports": [
                    {"index": 1, "trace": {"kind": "stateful", "source": {"kind": "root_inport", "signal": "u1"}}},
                    {"index": 2, "trace": {"kind": "root_inport", "signal": "u2"}},
                ]},
                {"id": "M:2", "operator": "OR", "ports": [
                    {"index": 1, "trace": {"kind": "stateful", "source": {"kind": "root_inport", "signal": "u3"}}},
                    {"index": 2, "trace": {"kind": "root_inport", "signal": "u4"}},
                ]},
            ],
        }

    def test_budget_limits_total_candidates(self):
        unlimited = PLANNER.build_plan(self._report(), 32, 8, 0.01)
        self.assertGreater(unlimited["summary"]["candidate_count"], 4)
        budgeted = PLANNER.build_plan(self._report(), 32, 8, 0.01, total_budget=4)
        self.assertLessEqual(budgeted["summary"]["candidate_count"], 4)
        self.assertEqual(budgeted["summary"]["total_budget"], 4)
        self.assertEqual(budgeted["summary"]["per_port_quota"], 2)
        # Both qualifying ports keep coverage instead of the first eating all.
        covered = {test["target"]["operator_id"] for test in budgeted["tests"]}
        self.assertEqual(covered, {"M:1", "M:2"})

    def test_budget_respects_per_port_cap(self):
        budgeted = PLANNER.build_plan(self._report(), 1, 8, 0.01, total_budget=100)
        self.assertEqual(budgeted["summary"]["per_port_quota"], 1,
                         "quota never exceeds the per-port cap")

    def test_budget_is_a_hard_cap_when_ports_outnumber_it(self):
        # Review P1: quota = max(1, budget // qualifying) still overshoots when
        # ports outnumber the budget. The plan must truncate: first `budget`
        # ports keep one candidate each, the rest are budget_truncated (kept
        # in targets so reconciliation never loses them).
        report = self._report()
        for extra in range(3, 8):
            report["operators"].append({
                "id": f"M:{extra}", "operator": "AND", "ports": [
                    {"index": 1, "trace": {"kind": "stateful", "source": {"kind": "root_inport", "signal": f"x{extra}"}}},
                    {"index": 2, "trace": {"kind": "root_inport", "signal": f"y{extra}"}},
                ],
            })
        budget = 3
        plan = PLANNER.build_plan(report, 32, 8, 0.01, total_budget=budget)
        self.assertLessEqual(plan["summary"]["candidate_count"], budget)
        self.assertEqual(plan["summary"]["budget_truncated_target_count"], 4)
        truncated = [t for t in plan["targets"] if t["status"] == "budget_truncated"]
        self.assertTrue(truncated, "truncated targets must remain in the plan")
        self.assertTrue(all(t["candidate_count"] == 0 for t in truncated))

    def test_budget_none_keeps_legacy_behaviour(self):
        legacy = PLANNER.build_plan(self._report(), 32, 8, 0.01, total_budget=None)
        self.assertIsNone(legacy["summary"]["total_budget"])
        self.assertIsNone(legacy["summary"]["per_port_quota"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
