#!/usr/bin/env python3
"""Regression tests for the probe capability precheck integration.

Production case (task bbc72245): 1214 probe candidates were simulated against
targets inside ITKLib reference blocks; the library rejected every probe
insertion, 640/2428 observations came back target_unavailable, and the whole
stage failed. The precheck classifies each operator BEFORE any simulation, and
operators judged unprobeable never produce candidates. Pinned here:

  1. unprobeable operators produce zero candidates, carry the reason, and are
     counted in the plan summary;
  2. observable strategies (to_workspace_probe / noninvasive_signal_log) keep
     generating candidates exactly as before;
  3. a missing capability file preserves the legacy behaviour;
  4. the capability cache only hits on model+fingerprint+strategy match.

Run: python3 -m unittest test_probe_capability_plan -v
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
PLANNER_SCRIPT = RUNTIME / "scripts" / "build_state_probe_plan.py"
STAGE_SCRIPT = RUNTIME / "scripts" / "run_tcsd_pipeline_stage.py"

def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    # dataclasses resolve field types through sys.modules; register first.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


PLANNER_MODULE = _load_module("build_state_probe_plan", PLANNER_SCRIPT)
STAGE_MODULE = _load_module("tcsd_pipeline_stage", STAGE_SCRIPT)


def sample_report() -> dict:
    """Two operators with stateful (UnitDelay) dependencies; both would plan
    candidates without a capability verdict."""
    return {
        "model": "M",
        "operators": [
            {
                "id": "M:10", "operator": "AND",
                "ports": [
                    {"index": 1, "trace": {"kind": "stateful", "source": {"kind": "root_inport", "signal": "u1"}}},
                    {"index": 2, "trace": {"kind": "root_inport", "signal": "u2"}},
                ],
            },
            {
                "id": "M:20", "operator": "OR",
                "ports": [
                    {"index": 1, "trace": {"kind": "stateful", "source": {"kind": "root_inport", "signal": "u3"}}},
                    {"index": 2, "trace": {"kind": "root_inport", "signal": "u4"}},
                ],
            },
        ],
    }


class CapabilityPlanTest(unittest.TestCase):
    def _build(self, capabilities=None):
        report = sample_report()
        return PLANNER_MODULE.build_plan(report, 4, 8, 0.01, capabilities=capabilities)

    def test_unprobeable_operator_never_yields_candidates(self):
        plan = self._build({
            "M:10": {"strategy": "unprobeable", "reason": "linked_library_mutation_denied: ..."},
            "M:20": {"strategy": "to_workspace_probe", "reason": "trial probe accepted"},
        })
        self.assertEqual(plan["summary"]["candidate_count"] > 0, True)
        target_10 = next(t for t in plan["targets"] if t["operator_id"] == "M:10")
        target_20 = next(t for t in plan["targets"] if t["operator_id"] == "M:20")
        self.assertEqual(target_10["status"], "unprobeable")
        self.assertEqual(target_10["probe_strategy"], "unprobeable")
        self.assertIn("linked_library_mutation_denied", target_10["unprobeable_reason"])
        self.assertEqual(target_10["candidate_count"], 0)
        self.assertEqual(target_20["status"], "planned")
        self.assertEqual(target_20["probe_strategy"], "to_workspace_probe")
        self.assertEqual(target_20["candidate_count"] > 0, True)
        self.assertTrue(all(t["target"]["operator_id"] != "M:10" for t in plan["tests"]))
        self.assertEqual(plan["summary"]["unprobeable_target_count"], 1)

    def test_noninvasive_verdict_without_executor_support_is_a_gap(self):
        # Review blocker 3: noninvasive_signal_log is a precheck verdict whose
        # collection path is NOT implemented by the executor. Such targets are
        # registered gaps (no candidates) instead of simulating observations
        # that cannot be collected.
        plan = self._build({
            "M:10": {"strategy": "noninvasive_signal_log", "reason": "signal logging accepted"},
            "M:20": {"strategy": "to_workspace_probe", "reason": "accepted"},
        })
        target_10 = next(t for t in plan["targets"] if t["operator_id"] == "M:10")
        target_20 = next(t for t in plan["targets"] if t["operator_id"] == "M:20")
        self.assertEqual(target_10["status"], "strategy_not_executable")
        self.assertEqual(target_10["candidate_count"], 0)
        self.assertEqual(target_20["status"], "planned")
        self.assertEqual(target_20["candidate_count"] > 0, True)
        self.assertEqual(plan["summary"]["plan_level_gap_count"], 1)
        self.assertTrue(all(t["target"]["operator_id"] != "M:10" for t in plan["tests"]))

    def test_observable_strategies_preserve_candidate_generation(self):
        plan = self._build({
            "M:10": {"strategy": "to_workspace_probe", "reason": "accepted"},
            "M:20": {"strategy": "to_workspace_probe", "reason": "accepted"},
        })
        self.assertEqual(plan["summary"]["candidate_count"] > 0, True)
        self.assertEqual(plan["summary"]["plan_level_gap_count"], 0)
        self.assertTrue(all(t["status"] == "planned" for t in plan["targets"]))

    def test_missing_capability_preserves_legacy_behaviour(self):
        plan_default = self._build()
        plan_none = self._build(None)
        self.assertEqual(plan_default["summary"]["candidate_count"],
                         plan_none["summary"]["candidate_count"])
        self.assertEqual(plan_default["summary"]["unprobeable_target_count"], 0)
        self.assertTrue(all(t["probe_strategy"] == "unspecified" for t in plan_default["targets"]))


class CapabilityCacheTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.out = Path(self._tmp.name)

    def test_cache_roundtrip_and_key_mismatch(self):
        capabilities = {"M:10": {"strategy": "unprobeable", "reason": "r"}}
        STAGE_MODULE.save_probe_capability_cache(self.out, "M", "fp-1", capabilities)
        self.assertEqual(STAGE_MODULE.load_probe_capability_cache(self.out, "M", "fp-1"), capabilities)
        # A different fingerprint (model/library/strategy change) must not hit.
        self.assertIsNone(STAGE_MODULE.load_probe_capability_cache(self.out, "M", "fp-2"))
        self.assertIsNone(STAGE_MODULE.load_probe_capability_cache(self.out, "Other", "fp-1"))
        # A different strategy version must not hit.
        payload = json.loads(STAGE_MODULE.probe_capability_cache_path(self.out).read_text(encoding="utf-8"))
        payload["strategyVersion"] = "v0"
        STAGE_MODULE.probe_capability_cache_path(self.out).write_text(json.dumps(payload), encoding="utf-8")
        self.assertIsNone(STAGE_MODULE.load_probe_capability_cache(self.out, "M", "fp-1"))

    def test_missing_cache_file_returns_none(self):
        self.assertIsNone(STAGE_MODULE.load_probe_capability_cache(self.out, "M", "fp"))


class CapabilityRequestTest(unittest.TestCase):
    def test_request_extracts_operators_from_mapping(self):
        with tempfile.TemporaryDirectory() as tmp:
            mapping = Path(tmp) / "M_logical_operators.json"
            mapping.write_text(json.dumps({
                "model": "M",
                "operators": [
                    {"id": "M:10", "block_path": "M/AND", "operator": "AND"},
                    {"id": "M:20", "block_path": "M/OR", "operator": "OR"},
                ],
            }), encoding="utf-8")
            request_path = Path(tmp) / "request.json"
            count = STAGE_MODULE.build_probe_capability_request(mapping, request_path)
            self.assertEqual(count, 2)
            request = json.loads(request_path.read_text(encoding="utf-8"))
            self.assertEqual(request["schema"], "tcsd-probe-capability-request/v1")
            self.assertEqual([item["id"] for item in request["operators"]], ["M:10", "M:20"])
            self.assertEqual(request["operators"][0]["block_path"], "M/AND")

    def test_cache_miss_uses_explicit_quality_runtime(self):
        """The production Stage 6 path must not depend on a hidden global
        named ``quality``.  Fixture-based tests return before this branch and
        previously missed the resulting NameError."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "outputs"
            out.mkdir()
            model_path = root / "M.slx"
            model_path.write_bytes(b"model")
            mapping = out / "M_logical_operators.json"
            mapping.write_text(json.dumps({
                "model": "M",
                "operators": [{"id": "M:10", "block_path": "M/AND"}],
            }), encoding="utf-8")
            capability_output = out / "M_probe_capability.json"

            class FakeQuality:
                def __init__(self):
                    self.entry_called = False
                    self.run_called = False

                def write_matlab_entry(self, path, code):
                    self.entry_called = True
                    path.write_text(code, encoding="utf-8")
                    return path

                def run_satk(self, python, scripts, entry, **kwargs):
                    self.run_called = True
                    capability_output.write_text(json.dumps({
                        "schema": STAGE_MODULE.PROBE_CAPABILITY_SCHEMA,
                        "strategyVersion": STAGE_MODULE.PROBE_CAPABILITY_STRATEGY_VERSION,
                        "capabilities": {
                            "M:10": {"strategy": "to_workspace_probe", "reason": "accepted"},
                        },
                    }), encoding="utf-8")

            quality = FakeQuality()
            job = {"input": {"modelSlxPath": str(model_path)}}
            capability_path, evidence = STAGE_MODULE.run_probe_capability_precheck(
                job, "M", root, out, mapping, quality
            )

            self.assertEqual(capability_path, capability_output)
            self.assertTrue(quality.entry_called)
            self.assertTrue(quality.run_called)
            self.assertEqual(evidence["cache"], "miss")
            self.assertEqual(evidence["operatorCount"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
