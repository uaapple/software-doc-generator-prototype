#!/usr/bin/env python3
"""Regression tests for the Gateway job marker lifecycle (review blocker 3).

Once the active-gateway-job marker is PUBLISHED it must be retained by
default; only our own observation that the Gateway job reached a terminal
state may delete it. The bbc72245 overlap shape was: cancel requested (or the
poll timed out, or a request died mid-flight) but the marker was deleted
anyway, so the next runner saw a clean workspace while the orphan MATLAB job
kept writing into it.

Run: python3 -m unittest test_gateway_marker_lifecycle -v
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
SATK_SCRIPT = RUNTIME / "scripts" / "satk_eval.py"

SATK = importlib.util.spec_from_file_location("satk_eval", SATK_SCRIPT)
SATK_MODULE = importlib.util.module_from_spec(SATK)
assert SATK and SATK.loader
sys.modules["satk_eval"] = SATK_MODULE
SATK.loader.exec_module(SATK_MODULE)


class MarkerLifecycleTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.workspace = Path(self._tmp.name)
        self.output = self.workspace / "outputs"
        self.output.mkdir()
        self.marker = self.output / ".tcsd-runtime" / "active-gateway-job.json"
        self.code_file = self.workspace / "entry.m"
        self.code_file.write_text("disp(1);", encoding="utf-8")
        self.environ = {
            "SATK_GATEWAY_URL": "http://gateway.test:5100",
            "SATK_GATEWAY_MAPPING_ID": "worker-data",
            "TCSD_JOB_ID": "job-1",
            "TCSD_OUTPUT_DIR": str(self.output),
            "MATLAB_GATEWAY_CONTAINER_ROOT": str(self.workspace),
        }
        SATK_MODULE.terminate_requested.clear()
        self.addCleanup(SATK_MODULE.terminate_requested.clear)

    def _evaluate(self, gateway):
        with mock.patch.object(SATK_MODULE, "gateway_request", side_effect=gateway):
            return SATK_MODULE.evaluate_over_gateway(self.code_file, environ=self.environ)

    def _routes(self, method, suffix, calls, *, poll_statuses, cancel_error=None):
        """Dispatch gateway_request by method/route; poll GETs walk the list."""
        route = f"/api/jobs/{suffix}"
        if method == "PUT":
            return {}
        if method == "POST" and route.endswith("/cancel"):
            calls["cancel"] += 1
            if cancel_error:
                raise OSError(cancel_error)
            return {}
        if method == "POST":
            return {}
        if method == "GET" and f"/api/jobs/{suffix}?" in f"{suffix}?{route}" or method == "GET" and "jobs/" in suffix:
            status = poll_statuses[min(calls["get"], len(poll_statuses)) - 1]
            calls["get"] += 1
            if status == "@raise":
                raise OSError("connection reset mid-poll")
            return {"status": status}
        return {}

    def assertMarker(self, expected, message=None):
        self.assertEqual(self.marker.exists(), expected,
                         message or f"marker should {'exist' if expected else 'be gone'}")

    def test_cancel_unconfirmed_keeps_marker(self):
        # Cancel accepted, but the follow-up GET still reports running: the
        # orphan is NOT confirmed dead, so the marker must survive.
        calls = {"get": 0, "cancel": 0}

        def gateway(method, route, **kwargs):
            calls[f"{method} {route.split('/api/')[1].split('?')[0]}"] = 1
            if method == "PUT":
                return {}
            if method == "POST" and route.endswith("/cancel"):
                calls["cancel"] += 1
                return {}
            if method == "GET":
                status = ["running"][min(calls["get"], 0)]
                calls["get"] += 1
                return {"status": status}
            return {}

        SATK_MODULE.terminate_requested.set()
        result = self._evaluate(gateway)
        self.assertEqual(result["error"]["code"], "MATLAB_GATEWAY_JOB_CANCELLED_LOCAL")
        self.assertTrue(result["error"]["data"]["markerRetained"])
        self.assertMarker(True)

    def test_cancel_confirmed_deletes_marker(self):
        def gateway(method, route, **kwargs):
            if method == "PUT":
                return {}
            if method == "POST" and route.endswith("/cancel"):
                return {}
            if method == "GET":
                return {"status": "cancelled"}
            return {}

        SATK_MODULE.terminate_requested.set()
        result = self._evaluate(gateway)
        self.assertEqual(result["error"]["code"], "MATLAB_GATEWAY_JOB_CANCELLED_LOCAL")
        self.assertFalse(result["error"]["data"]["markerRetained"])
        self.assertMarker(False)

    def test_cancel_request_failure_keeps_marker(self):
        def gateway(method, route, **kwargs):
            if method == "PUT":
                return {}
            if method == "POST" and route.endswith("/cancel"):
                raise OSError("gateway unreachable during cancel")
            if method == "GET":
                return {"status": "running"}
            return {}

        SATK_MODULE.terminate_requested.set()
        result = self._evaluate(gateway)
        self.assertEqual(result["error"]["code"], "MATLAB_GATEWAY_JOB_CANCELLED_LOCAL")
        self.assertMarker(True)

    def test_observed_terminal_state_deletes_marker(self):
        def gateway(method, route, **kwargs):
            if method == "PUT":
                return {}
            if method == "POST":
                return {}
            if method == "GET":
                return {"status": "succeeded", "artifactId": "a1"}
            return {}

        result = self._evaluate(gateway)
        self.assertIn("result", result)
        self.assertMarker(False)

    def test_mid_poll_connection_failure_keeps_marker(self):
        def gateway(method, route, **kwargs):
            if method == "PUT":
                return {}
            if method == "POST":
                return {}
            if method == "GET":
                raise OSError("connection reset mid-poll")
            return {}

        result = self._evaluate(gateway)
        self.assertEqual(result["error"]["code"], "MATLAB_GATEWAY_REQUEST_FAILED")
        self.assertMarker(True, "a dead request with a live remote job must retain the marker")


if __name__ == "__main__":
    unittest.main(verbosity=2)
