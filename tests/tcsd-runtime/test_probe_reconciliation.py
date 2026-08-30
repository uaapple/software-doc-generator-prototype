#!/usr/bin/env python3
"""Regression tests for reconciliation-style Stage 6 probe validation.

Production case (task bbc72245): 640 target_unavailable observations failed
the whole stage via a one-strike rule, and the real root cause was invisible.
The reconciliation contract replaces it:

  1. every planned step must reach exactly one terminal status (conservation);
  2. observed steps require executed values;
  3. simulation_mismatch / not_executed_with_reason require an
     execution_reason and are surfaced as gaps, not failures;
  4. bare target_unavailable is rejected outright (the capability precheck
     must classify such targets; a runtime gap may never hide behind it);
  5. transient/MPS statuses are tallied, not fatal.

Run: python3 -m unittest test_probe_reconciliation -v
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
VALIDATOR_SCRIPT = RUNTIME / "scripts" / "host_validate_tcsd_stage.py"
STAGE_SCRIPT = RUNTIME / "scripts" / "run_tcsd_pipeline_stage.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


VALIDATOR = _load("host_validate_tcsd_stage", VALIDATOR_SCRIPT)
STAGE = _load("run_tcsd_pipeline_stage", STAGE_SCRIPT)


def make_plan():
    return {
        "schema": "simulink-ut-state-probe-plan/v1", "model": "M",
        "summary": {"target_count": 2, "candidate_count": 2, "unprobeable_target_count": 0},
        "targets": [], "tests": [
            {"test_id": "STATE_PROBE_0001", "steps": [{"index": 1}, {"index": 2}]},
            {"test_id": "STATE_PROBE_0002", "steps": [{"index": 1}, {"index": 2}]},
        ],
    }


def observation(test_id, step, status, *, reason=None, ok=True):
    data = {
        "test_id": test_id, "step_index": step,
        "inputs": {"u1": 0},
        "vectors": {"v1": {"id": "M:10", "ok": ok, "values": [0, 1]}} if status in ("observed", "matched_prediction") else {},
        "prediction_status": status,
    }
    if reason is not None:
        data["execution_reason"] = reason
    return data


class ProbeReconciliationTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)

    def _request(self, plan, probe_results):
        (self.workspace / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
        (self.workspace / "probe-results.json").write_text(json.dumps(probe_results), encoding="utf-8")
        obligations = {"schema": "simulink-ut-logical-mcdc-obligations/v1", "obligations": []}
        (self.workspace / "obligations.json").write_text(json.dumps(obligations), encoding="utf-8")
        return {
            "schema": "tcsd-host-semantic-validation-request/v1",
            "stageIndex": 6,
            "workspaceDir": str(self.workspace),
            "artifacts": [
                {"kind": "json", "path": "plan.json"},
                {"kind": "json", "path": "probe-results.json"},
                {"kind": "json", "path": "obligations.json"},
            ],
            "evidence": {"candidateCount": 2, "probeExecuted": True},
        }

    def _probe_results(self, observations):
        return {"M": {"schema": "simulink-ut-logical-mcdc-probe/v2", "model": "M",
                      "probes": [], "observations": observations}}

    def test_all_observed_passes_and_conserves(self):
        request = self._request(make_plan(), self._probe_results([
            observation("STATE_PROBE_0001", 1, "observed"),
            observation("STATE_PROBE_0001", 2, "observed"),
            observation("STATE_PROBE_0002", 1, "observed"),
            observation("STATE_PROBE_0002", 2, "matched_prediction"),
        ]))
        details = VALIDATOR.validate_probe(request)
        self.assertEqual(details["reconciliation"]["conserved"], True)
        self.assertEqual(details["reconciliation"]["observedCount"], 4)
        self.assertEqual(details["reconciliation"]["plannedStepCount"], 4)

    def test_mismatch_is_a_gap_not_a_failure(self):
        observations = [
            observation("STATE_PROBE_0001", 1, "observed"),
            observation("STATE_PROBE_0001", 2, "observed"),
            observation("STATE_PROBE_0002", 1, "observed"),
            observation("STATE_PROBE_0002", 2, "simulation_mismatch",
                        reason="stimulus_did_not_drive_target"),
        ]
        details = VALIDATOR.validate_probe(self._request(make_plan(), self._probe_results(observations)))
        self.assertEqual(details["reconciliation"]["mismatchCount"], 1)
        self.assertEqual(details["reconciliation"]["conserved"], True)

    def test_not_executed_requires_reason(self):
        observations = [
            observation("STATE_PROBE_0001", 1, "observed"),
            observation("STATE_PROBE_0001", 2, "observed"),
            observation("STATE_PROBE_0002", 1, "observed"),
            observation("STATE_PROBE_0002", 2, "not_executed_with_reason"),
        ]
        with self.assertRaises(ValueError) as ctx:
            VALIDATOR.validate_probe(self._request(make_plan(), self._probe_results(observations)))
        self.assertIn("execution_reason", str(ctx.exception))

    def test_bare_target_unavailable_is_rejected(self):
        observations = [
            observation("STATE_PROBE_0001", 1, "observed"),
            observation("STATE_PROBE_0001", 2, "observed"),
            observation("STATE_PROBE_0002", 1, "observed"),
            observation("STATE_PROBE_0002", 2, "target_unavailable"),
        ]
        with self.assertRaises(ValueError) as ctx:
            VALIDATOR.validate_probe(self._request(make_plan(), self._probe_results(observations)))
        self.assertIn("target_unavailable", str(ctx.exception))

    def test_missing_step_breaks_conservation(self):
        observations = [
            observation("STATE_PROBE_0001", 1, "observed"),
            observation("STATE_PROBE_0001", 2, "observed"),
            observation("STATE_PROBE_0002", 1, "observed"),
            # STATE_PROBE_0002 step 2 vanished entirely
        ]
        with self.assertRaises(ValueError) as ctx:
            VALIDATOR.validate_probe(self._request(make_plan(), self._probe_results(observations)))
        self.assertIn("not conserved", str(ctx.exception))

    def test_mismatch_without_reason_is_rejected(self):
        observations = [
            observation("STATE_PROBE_0001", 1, "observed"),
            observation("STATE_PROBE_0001", 2, "observed"),
            observation("STATE_PROBE_0002", 1, "observed"),
            observation("STATE_PROBE_0002", 2, "simulation_mismatch"),
        ]
        with self.assertRaises(ValueError) as ctx:
            VALIDATOR.validate_probe(self._request(make_plan(), self._probe_results(observations)))
        self.assertIn("execution_reason", str(ctx.exception))

    def test_transient_and_mps_are_tallied(self):
        observations = [
            observation("STATE_PROBE_0001", 1, "transient_failed", reason="sim error"),
            observation("STATE_PROBE_0001", 2, "simulation_error_mps_selector"),
            observation("STATE_PROBE_0002", 1, "not_executed_with_reason", reason="probe_data_missing"),
            observation("STATE_PROBE_0002", 2, "simulation_error_mps_selector"),
        ]
        details = VALIDATOR.validate_probe(self._request(make_plan(), self._probe_results(observations)))
        recon = details["reconciliation"]
        self.assertEqual(recon["transientFailedCount"], 1)
        self.assertEqual(recon["notExecutedCount"], 1)
        self.assertEqual(recon["mpsBlockedCount"], 2)
        self.assertEqual(recon["conserved"], True)

    def test_stage_reconciliation_summary(self):
        # Runtime-side tally mirrors the validator semantics.
        results = self._probe_results([
            observation("T1", 1, "observed"),
            observation("T1", 2, "simulation_mismatch", reason="x"),
            observation("T2", 1, "not_executed_with_reason", reason="probe_data_missing"),
        ])["M"]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "probe-results.json"
            path.write_text(json.dumps({"M": results}), encoding="utf-8")
            recon = STAGE.probe_observation_reconciliation(path)
        self.assertEqual(recon["gapCount"], 2)
        self.assertEqual(recon["observedCount"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
