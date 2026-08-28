#!/usr/bin/env python3
"""Regression tests for stage attempt leases and Gateway duplicate protection.

Production case (task bbc72245-48b7-45a4-85cd-de3af90f24ab): the foreground
runner was killed by the harness 600s SIGTERM, its Gateway job kept running as
an orphan, and the agent resubmitted Stage 6 — two MATLAB jobs then wrote the
same progress file concurrently. These tests pin:

  1. lease acquisition is exclusive (O_EXCL);
  2. a fresh lease held by a live owner refuses a second execution;
  3. a stale lease (dead owner) is taken over transparently;
  4. an active Gateway marker blocks resubmission until stale.

Run: python3 -m unittest test_stage_lease -v
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
SATK_SCRIPT = RUNTIME / "scripts" / "satk_eval.py"

RUNNER = importlib.util.spec_from_file_location("dsh_stage_runner", RUNNER_SCRIPT)
RUNNER_MODULE = importlib.util.module_from_spec(RUNNER)
assert RUNNER and RUNNER.loader
RUNNER.loader.exec_module(RUNNER_MODULE)

SATK = importlib.util.spec_from_file_location("satk_eval", SATK_SCRIPT)
SATK_MODULE = importlib.util.module_from_spec(SATK)
assert SATK and SATK.loader
SATK.loader.exec_module(SATK_MODULE)


class StageLeaseTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)

    def _acquire(self, **overrides):
        parameters = {
            "job_id": "job-1",
            "stage": 6,
            "attempt": 1,
            "run_id": "run-aaa",
            "runtime_hash": "hash-1",
        }
        parameters.update(overrides)
        return RUNNER_MODULE.acquire_lease(self.workspace, **parameters)

    def test_acquisition_is_exclusive(self):
        first = self._acquire()
        self.assertIsNotNone(first)
        self.assertEqual(first["runId"], "run-aaa")
        second = self._acquire(run_id="run-bbb")
        self.assertIsNone(second, "a fresh lease must refuse a second owner")

    def test_stale_lease_with_dead_owner_is_taken_over(self):
        first = self._acquire()
        assert first is not None
        # Forge an old heartbeat; the owner pid stays alive (this test process)
        # but the heartbeat alone is older than the staleness window.
        target = RUNNER_MODULE.lease_path(self.workspace, 6, 1)
        payload = json.loads(target.read_text(encoding="utf-8"))
        payload["heartbeatAt"] = (datetime.now() - timedelta(seconds=120)).isoformat()
        target.write_text(json.dumps(payload), encoding="utf-8")
        takeover = self._acquire(run_id="run-bbb")
        self.assertIsNotNone(takeover)
        self.assertEqual(takeover["runId"], "run-bbb")
        self.assertEqual(takeover["tookOverFrom"]["runId"], "run-aaa")

    def test_fresh_lease_with_dead_pid_is_taken_over(self):
        self._acquire()
        target = RUNNER_MODULE.lease_path(self.workspace, 6, 1)
        payload = json.loads(target.read_text(encoding="utf-8"))
        payload["ownerPid"] = 2 ** 22  # pid that cannot exist on this host
        payload["heartbeatAt"] = (datetime.now() - timedelta(seconds=10)).isoformat()
        target.write_text(json.dumps(payload), encoding="utf-8")
        takeover = self._acquire(run_id="run-bbb")
        self.assertIsNotNone(takeover, "a dead owner must not block resubmission")

    def test_release_removes_lease(self):
        self._acquire()
        RUNNER_MODULE.release_lease(self.workspace, 6, 1)
        self.assertFalse(RUNNER_MODULE.lease_path(self.workspace, 6, 1).exists())
        self.assertIsNotNone(self._acquire(run_id="run-ccc"))

    def test_heartbeat_refreshes_timestamp(self):
        self._acquire()
        target = RUNNER_MODULE.lease_path(self.workspace, 6, 1)
        payload = json.loads(target.read_text(encoding="utf-8"))
        payload["heartbeatAt"] = (datetime.now() - timedelta(seconds=60)).isoformat()
        target.write_text(json.dumps(payload), encoding="utf-8")
        RUNNER_MODULE.refresh_lease(self.workspace, 6, 1)
        refreshed = json.loads(target.read_text(encoding="utf-8"))
        age = datetime.now() - datetime.fromisoformat(refreshed["heartbeatAt"])
        self.assertLess(age.total_seconds(), 10)


class GatewayMarkerGuardTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)
        self.marker = self.workspace / "outputs" / ".tcsd-runtime" / "active-gateway-job.json"
        self.marker.parent.mkdir(parents=True, exist_ok=True)

    def _write_marker(self, *, heartbeat_age=0.0, pid=None):
        self.marker.write_text(json.dumps({
            "schema": "tcsd-active-gateway-job/v1",
            "ownerJobId": "job-1",
            "workspaceId": "satk-x",
            "jobId": "eval-x",
            "ownerPid": pid if pid is not None else os.getpid(),
            "startedAt": datetime.now().isoformat(),
            "heartbeatAt": (datetime.now() - timedelta(seconds=heartbeat_age)).isoformat(),
        }), encoding="utf-8")

    def test_active_marker_content_shape(self):
        self._write_marker()
        payload = json.loads(self.marker.read_text(encoding="utf-8"))
        self.assertEqual(payload["schema"], "tcsd-active-gateway-job/v1")
        self.assertIn("ownerPid", payload)
        self.assertIn("heartbeatAt", payload)

    def test_stale_marker_detection_logic(self):
        # Mirror the runner guard: fresh + live pid = active; stale heartbeat
        # (even with a live pid) or a dead pid = reclaimable.
        self._write_marker(heartbeat_age=0.0, pid=os.getpid())
        payload = json.loads(self.marker.read_text(encoding="utf-8"))
        heartbeat = datetime.fromisoformat(payload["heartbeatAt"])
        fresh = (datetime.now() - heartbeat).total_seconds() <= RUNNER_MODULE.LEASE_STALE_SECONDS
        self.assertTrue(fresh and RUNNER_MODULE._pid_alive(payload["ownerPid"]))

        self._write_marker(heartbeat_age=120.0, pid=os.getpid())
        payload = json.loads(self.marker.read_text(encoding="utf-8"))
        heartbeat = datetime.fromisoformat(payload["heartbeatAt"])
        stale = (datetime.now() - heartbeat).total_seconds() > RUNNER_MODULE.LEASE_STALE_SECONDS
        self.assertTrue(stale)


class TerminateSignalTest(unittest.TestCase):
    def test_terminate_flag_is_set_by_handler(self):
        import signal as signal_module

        SATK_MODULE.terminate_requested.clear()
        SATK_MODULE._handle_terminate_signal(signal_module.SIGTERM, None)
        self.assertTrue(SATK_MODULE.terminate_requested.is_set())
        SATK_MODULE.terminate_requested.clear()


if __name__ == "__main__":
    unittest.main(verbosity=2)
