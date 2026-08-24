#!/usr/bin/env python3
"""Regression tests for dsh_stage_runner Stage-10 prepare/apply orchestration.

Production case (task c595d0af-3191-482c-867b-2ea2b47914a6): `run --stage 10`
(auto mode) exited 1 on the FIRST call even though prepare succeeded, because
prepare intentionally does not write result.json (it stops at the "awaiting
agent repair proposal" intermediate state) while cmd_run treated a missing
result.json as failure (`run: stage 10 runner failed (exit 0)`). The task
pipeline actually finished, but the stage was recorded as failed.

These tests pin:
  1. stage 10 auto without a proposal -> prepare completes, exit code 0;
  2. stage 10 auto with a proposal -> apply completes, result.json + checkpoint
     written, exit code 0.

Run: python3 -m unittest test_stage10_runner_prepare -v
  or: python3 test_stage10_runner_prepare.py
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
RUNNER_PATH = RUNTIME / "scripts" / "dsh_stage_runner.py"

SPEC = importlib.util.spec_from_file_location("dsh_stage_runner", RUNNER_PATH)
RUNNER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(RUNNER)

TASK_ID = "job-stage10-prepare"
MODEL = "EngStrtStop_A23_B04"
RESULT_SCHEMA = "tcsd-agent-stage-result/v1"


def make_task(root: Path) -> Path:
    workspace = root / "workspace"
    (workspace / "outputs").mkdir(parents=True, exist_ok=True)
    task = {
        "id": TASK_ID,
        "type": "unit_test_case_generation",
        "status": "running",
        "workspace": {
            "directory": str(workspace),
            "modelSlxPath": str(workspace / f"{MODEL}.slx"),
            "modelMatPath": str(workspace / f"{MODEL}.mat"),
            "outputDir": str(workspace / "outputs"),
            "projectInitScripts": [],
            "modelDir": str(root),
        },
    }
    task_path = root / "task.json"
    task_path.write_text(json.dumps(task), encoding="utf-8")
    return task_path


def fake_subprocess_run(command, cwd=None, env=None, **kwargs):
    """Simulate run_tcsd_pipeline_stage.py sub-processes launched by run_runner."""
    items = [str(part) for part in command]
    args = {}
    for i in range(len(items) - 1):
        if items[i].startswith("--"):
            args[items[i][2:]] = items[i + 1]
    if args.get("stage10-mode") == "prepare":
        brief = Path(args["repair-brief"])
        brief.parent.mkdir(parents=True, exist_ok=True)
        brief.write_text(
            json.dumps(
                {
                    "schema": "tcsd-coverage-repair-brief/v1",
                    "jobId": TASK_ID,
                    "model": MODEL,
                    "repairRequired": True,
                    "coverageThreshold": 80.0,
                    "metricDeficits": [],
                    "coverageTargets": [],
                    "modelElementIndex": {},
                    "evidence": {},
                    "guardrails": {},
                    "observedVectors": {},
                }
            ),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(args=command, returncode=0)
    if args.get("stage10-mode") == "apply":
        result = Path(args["result"])
        result.parent.mkdir(parents=True, exist_ok=True)
        result.write_text(
            json.dumps(
                {
                    "schema": RESULT_SCHEMA,
                    "jobId": TASK_ID,
                    "stageIndex": 10,
                    "status": "completed",
                    "summary": "修复已应用。",
                    "artifacts": [],
                    "repair": {"required": True, "attempted": True, "applied": True, "passes": 1},
                }
            ),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(args=command, returncode=0)
    return subprocess.CompletedProcess(args=command, returncode=0)


def fake_semantic_validate(task, stage, result, runtime_dir, request_path, report_path):
    report = {"schema": "tcsd-host-semantic-validation/v1", "stageIndex": stage, "passed": True, "details": {}}
    report_path.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
    return {
        **report,
        "_reportPath": report_path,
        "_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
    }


class Stage10RunnerPrepareTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.task = make_task(self.root)

    def _attempt_dir(self):
        return self.root / "workspace" / "outputs" / ".tcsd-agent" / "stage-10" / "attempt-1"

    def _run_cmd(self, proposal: bool):
        attempt_dir = self._attempt_dir()
        attempt_dir.mkdir(parents=True, exist_ok=True)
        if proposal:
            (attempt_dir / "repair-proposal.json").write_text(
                json.dumps({"schema": "tcsd-coverage-repair-proposal/v1", "jobId": TASK_ID, "model": MODEL, "tests": [], "unresolved": []}),
                encoding="utf-8",
            )
        with mock.patch.object(RUNNER.subprocess, "run", side_effect=fake_subprocess_run), mock.patch.object(
            RUNNER, "semantic_validate", side_effect=fake_semantic_validate
        ):
            import io
            from contextlib import redirect_stderr

            stderr = io.StringIO()
            with redirect_stderr(stderr):
                code = RUNNER.cmd_run(mock.Mock(task=str(self.task), stage=10, attempt=1, stage10_mode="auto"))
        return code, stderr.getvalue()

    def test_stage10_auto_without_proposal_is_prepare_intermediate_state(self):
        code, stderr = self._run_cmd(proposal=False)
        # prepare 成功且 brief 已生成：中间态，不是失败
        self.assertEqual(code, 0)
        self.assertIn("awaiting agent repair proposal", stderr)
        self.assertNotIn("runner failed", stderr)

    def test_stage10_auto_with_proposal_apply_completes(self):
        code, stderr = self._run_cmd(proposal=True)
        self.assertEqual(code, 0)
        result = json.loads((self._attempt_dir() / "result.json").read_text(encoding="utf-8"))
        self.assertEqual(result["status"], "completed")
        checkpoint = self.root / "workspace" / "outputs" / ".tcsd-checkpoints" / "stage-10.json"
        self.assertTrue(checkpoint.is_file())
        data = json.loads(checkpoint.read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["stageIndex"], 10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
