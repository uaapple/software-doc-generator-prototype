#!/usr/bin/env python3
"""Regression tests for the three-layer attempt result protocol.

Production case (task bbc72245-48b7-45a4-85cd-de3af90f24ab): Stage 6 runtime
completed (1214 probe candidates executed) but the semantic validation failed.
The old orchestrator printed one stderr line and exited without any terminal
artifact, so the platform only saw "TCSD DSH headless session failed." with a
hard-coded exitCode 1. The protocol now persists:

  1. runtime-result.json — owned by the deterministic runtime, never rewritten
     by the orchestrator (semantic failure keeps runtimeStatus=completed);
  2. semantic-validation.json — written on failure too (not only on success);
  3. attempt-result.json — composite outcome with runtimeStatus /
     validationStatus / stageStatus, atomic on every terminal path.

Run: python3 -m unittest test_attempt_result_protocol -v
"""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
RUNNER_SCRIPT = RUNTIME / "scripts" / "dsh_stage_runner.py"

RUNNER = importlib.util.spec_from_file_location("dsh_stage_runner", RUNNER_SCRIPT)
RUNNER_MODULE = importlib.util.module_from_spec(RUNNER)
assert RUNNER and RUNNER.loader
RUNNER.loader.exec_module(RUNNER_MODULE)


class WriteJsonAtomicTest(unittest.TestCase):
    def test_write_json_is_atomic_and_readable(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "nested" / "out.json"
            RUNNER_MODULE.write_json(target, {"schema": "x", "value": 1})
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), {"schema": "x", "value": 1})
            leftovers = [p.name for p in target.parent.iterdir() if p.name.startswith(".out.json")]
            self.assertEqual(leftovers, [], "temporary file must be removed after rename")

    def test_write_json_overwrite_keeps_valid_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "out.json"
            for value in ({"n": 1}, {"n": 2}):
                RUNNER_MODULE.write_json(target, value)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), {"n": 2})


class WriteAttemptResultTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)
        self.attempt_dir = self.workspace / "outputs" / ".tcsd-agent" / "stage-06" / "attempt-1"
        self.attempt_dir.mkdir(parents=True)

    def test_semantic_failure_keeps_runtime_completed(self):
        # The production failure shape: runtime output says completed, the
        # semantic verdict failed. The composite attempt result must record
        # "runtime completed, validation failed" — never rewrite the runtime
        # output into a failed envelope.
        runtime_path = self.attempt_dir / "runtime-result.json"
        RUNNER_MODULE.write_json(runtime_path, {
            "schema": "tcsd-agent-stage-result/v1", "jobId": "job-1", "stageIndex": 6,
            "status": "completed", "summary": "探针已完成", "artifacts": [],
        })
        semantic_path = self.attempt_dir / "semantic-validation.json"
        RUNNER_MODULE.write_json(semantic_path, {
            "schema": "tcsd-host-semantic-validation/v1", "stageIndex": 6,
            "passed": False, "details": {}, "message": "Probe observation is missing executed values",
        })
        attempt_path = RUNNER_MODULE.write_attempt_result(
            self.attempt_dir, self.workspace, job_id="job-1", stage=6, attempt=1,
            runtime_status="completed", validation_status="failed", stage_status="failed",
            runtime_path=runtime_path, semantic_path=semantic_path,
            error={"code": "tcsd_stage_validation_failed", "message": "Probe observation is missing executed values"},
        )
        payload = json.loads(attempt_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["schema"], "tcsd-attempt-result/v1")
        self.assertEqual(payload["runtimeStatus"], "completed")
        self.assertEqual(payload["validationStatus"], "failed")
        self.assertEqual(payload["stageStatus"], "failed")
        self.assertEqual(payload["error"]["code"], "tcsd_stage_validation_failed")
        # runtime output is untouched
        self.assertEqual(json.loads(runtime_path.read_text(encoding="utf-8"))["status"], "completed")
        # referenced paths resolve inside the workspace
        self.assertTrue((self.workspace / payload["runtime"]["path"]).is_file())
        self.assertTrue((self.workspace / payload["semantic"]["path"]).is_file())

    def test_runtime_failure_records_not_applicable_validation(self):
        runtime_path = self.attempt_dir / "runtime-result.json"
        RUNNER_MODULE.write_json(runtime_path, {
            "schema": "tcsd-agent-stage-result/v1", "jobId": "job-1", "stageIndex": 3,
            "status": "failed", "summary": "TCSD deterministic stage runtime failed.",
            "artifacts": [],
            "error": {"code": "tcsd_stage_runtime_failed", "message": "boom", "hard": True},
        })
        attempt_path = RUNNER_MODULE.write_attempt_result(
            self.attempt_dir, self.workspace, job_id="job-1", stage=3, attempt=1,
            runtime_status="failed", validation_status="not_applicable", stage_status="failed",
            runtime_path=runtime_path, semantic_path=None,
            error={"code": "tcsd_stage_runtime_failed", "message": "stage 3 runtime failed (exit 1)"},
        )
        payload = json.loads(attempt_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["runtimeStatus"], "failed")
        self.assertEqual(payload["validationStatus"], "not_applicable")
        self.assertEqual(payload["stageStatus"], "failed")
        self.assertIsNone(payload["semantic"])

    def test_success_records_all_layers(self):
        runtime_path = self.attempt_dir / "runtime-result.json"
        RUNNER_MODULE.write_json(runtime_path, {
            "schema": "tcsd-agent-stage-result/v1", "jobId": "job-1", "stageIndex": 6,
            "status": "completed", "summary": "ok", "artifacts": [],
        })
        semantic_path = self.attempt_dir / "semantic-validation.json"
        RUNNER_MODULE.write_json(semantic_path, {
            "schema": "tcsd-host-semantic-validation/v1", "stageIndex": 6,
            "passed": True, "details": {"candidateCount": 2},
        })
        attempt_path = RUNNER_MODULE.write_attempt_result(
            self.attempt_dir, self.workspace, job_id="job-1", stage=6, attempt=1,
            runtime_status="completed", validation_status="passed", stage_status="completed",
            runtime_path=runtime_path, semantic_path=semantic_path,
        )
        payload = json.loads(attempt_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["runtimeStatus"], "completed")
        self.assertEqual(payload["validationStatus"], "passed")
        self.assertEqual(payload["stageStatus"], "completed")

    def test_missing_runtime_file_yields_null_reference(self):
        attempt_path = RUNNER_MODULE.write_attempt_result(
            self.attempt_dir, self.workspace, job_id="job-1", stage=6, attempt=1,
            runtime_status="failed", validation_status="not_applicable", stage_status="failed",
            runtime_path=None, semantic_path=None,
            error={"code": "tcsd_stage_runtime_failed", "message": "no output"},
        )
        payload = json.loads(attempt_path.read_text(encoding="utf-8"))
        self.assertIsNone(payload["runtime"])
        self.assertIsNone(payload["semantic"])


class SemanticValidateFailurePersistenceTest(unittest.TestCase):
    def test_validator_failure_report_is_parsed_and_persisted(self):
        # The host validator writes a JSON failure report on stderr; the
        # orchestrator must persist it as semantic-validation.json instead of
        # raising a bare RuntimeError that loses the verdict.
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            report_path = workspace / "semantic-validation.json"
            from unittest import mock

            stderr_report = json.dumps({
                "schema": "tcsd-host-semantic-validation/v1", "stageIndex": 0,
                "passed": False,
                "message": "Probe observation is missing executed values or contradicts its planned target",
            })
            fake_proc = mock.Mock(returncode=1, stdout="", stderr=stderr_report + "\n")
            task = {"id": "job-1", "workspace": {"directory": str(workspace)}}
            result = {"artifacts": []}
            with mock.patch.object(RUNNER_MODULE.subprocess, "run", return_value=fake_proc), \
                 mock.patch.dict(os.environ, {}):
                report = RUNNER_MODULE.semantic_validate(
                    task, 6, result, workspace, workspace / "semantic-request.json", report_path
                )
            self.assertFalse(report["passed"])
            self.assertIn("Probe observation", report["message"])
            persisted = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["stageIndex"], 6)
            self.assertFalse(persisted["passed"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
