#!/usr/bin/env python3
"""Regression tests for the four-branch Gateway reconciliation state machine.

Expert review constraint (bbc72245 follow-up): reconciliation must never cancel
a healthy active Gateway job, and must never resubmit blind when the real job
state is unknown. Branches pinned here:

  1. marker absent                -> proceed
  2. query fails / state unknown  -> refuse  (never resubmit blind)
  3. job terminal (succeeded etc) -> collect (release marker), proceed
  4. job active + fresh heartbeat + live owner -> refuse (no cancel)
  5. job active + dead owner      -> takeover: cancel orphan, release, proceed
  6. job active + stale heartbeat (live pid)   -> takeover

Run: python3 -m unittest test_gateway_reconcile -v
"""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
RUNNER_SCRIPT = RUNTIME / "scripts" / "dsh_stage_runner.py"

RUNNER = importlib.util.spec_from_file_location("dsh_stage_runner", RUNNER_SCRIPT)
RUNNER_MODULE = importlib.util.module_from_spec(RUNNER)
assert RUNNER and RUNNER.loader
RUNNER.loader.exec_module(RUNNER_MODULE)


class GatewayReconcileTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)
        self.marker = self.workspace / "outputs" / ".tcsd-runtime" / "active-gateway-job.json"
        self.marker.parent.mkdir(parents=True, exist_ok=True)
        self.cancelled = []

    def write_marker(self, *, heartbeat_age=0.0, pid=None, job_id="eval-x", workspace_id="ws-x"):
        self.marker.write_text(json.dumps({
            "schema": "tcsd-active-gateway-job/v1",
            "ownerJobId": "job-1",
            "workspaceId": workspace_id,
            "jobId": job_id,
            "ownerPid": pid if pid is not None else os.getpid(),
            "startedAt": datetime.now().isoformat(),
            "heartbeatAt": (datetime.now() - timedelta(seconds=heartbeat_age)).isoformat(),
        }), encoding="utf-8")

    def _reconcile(self, status="running", query_error=None):
        calls = {"query": 0, "cancel": 0}

        def query(job_id, workspace_id):
            calls["query"] += 1
            if query_error:
                return {"status": None, "error": query_error}
            return {"status": status, "error": None}

        def cancel(job_id, workspace_id):
            calls["cancel"] += 1
            self.cancelled.append(job_id)
            return {"cancelled": True, "error": None}

        result = RUNNER_MODULE.reconcile_gateway_job(self.workspace, query=query, cancel=cancel)
        result["_calls"] = calls
        return result

    def test_marker_absent_proceeds_without_query(self):
        result = self._reconcile()
        self.assertEqual(result["action"], "proceed")
        self.assertEqual(result["_calls"], {"query": 0, "cancel": 0})

    def test_query_failure_refuses_blind_resubmission(self):
        self.write_marker()
        result = self._reconcile(query_error="connection refused")
        self.assertEqual(result["action"], "refuse")
        self.assertEqual(result["gatewayStatus"], "unknown")
        self.assertEqual(self.cancelled, [], "unknown state must not trigger cancel")

    def test_terminal_job_releases_marker_and_proceeds(self):
        self.write_marker()
        result = self._reconcile(status="succeeded")
        self.assertEqual(result["action"], "proceed")
        self.assertEqual(result["gatewayStatus"], "succeeded")
        self.assertFalse(self.marker.exists(), "terminal job marker must be released")
        self.assertEqual(self.cancelled, [])

    def test_healthy_active_job_is_never_cancelled(self):
        self.write_marker(heartbeat_age=0.0, pid=os.getpid())
        result = self._reconcile(status="running")
        self.assertEqual(result["action"], "refuse")
        self.assertEqual(self.cancelled, [], "a healthy job must never be cancelled")
        self.assertTrue(self.marker.exists())

    def test_dead_owner_takes_over_and_cancels_orphan(self):
        self.write_marker(heartbeat_age=0.0, pid=2 ** 22)
        result = self._reconcile(status="running")
        self.assertEqual(result["action"], "proceed")
        self.assertEqual(self.cancelled, ["eval-x"], "orphan job must be cancelled on takeover")
        self.assertFalse(self.marker.exists())

    def test_stale_heartbeat_takes_over_even_with_live_pid(self):
        self.write_marker(heartbeat_age=120.0, pid=os.getpid())
        result = self._reconcile(status="running")
        self.assertEqual(result["action"], "proceed")
        self.assertEqual(self.cancelled, ["eval-x"])
        self.assertFalse(self.marker.exists())

    def test_unusable_fresh_marker_refuses(self):
        # Legacy marker without jobId/workspaceId: heartbeat fresh + live owner
        # means we cannot judge — refuse rather than reclaim.
        self.marker.write_text(json.dumps({
            "schema": "tcsd-active-gateway-job/v1",
            "note": "legacy",
            "ownerPid": os.getpid(),
            "heartbeatAt": datetime.now().isoformat(),
        }))
        result = self._reconcile(status="running")
        self.assertEqual(result["action"], "refuse")

    def test_unusable_stale_marker_is_reclaimed(self):
        self.marker.write_text(json.dumps({"schema": "tcsd-active-gateway-job/v1", "note": "legacy"}))
        # Force stale by backdating the (absent) heartbeat — the marker has no
        # heartbeat at all, so it parses as unfresh and reclaimable.
        result = self._reconcile(status="running")
        self.assertEqual(result["action"], "proceed")
        self.assertFalse(self.marker.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
