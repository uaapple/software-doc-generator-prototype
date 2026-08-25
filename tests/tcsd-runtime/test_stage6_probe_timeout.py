#!/usr/bin/env python3
"""Regression tests for adaptive Stage-6/Stage-11 probe gateway timeouts.

Production cases (tasks e8060ca9-8d29-4919-af74-0f5a06a22fa5 / f2f9091d):
Stage 6 probes with dozens of candidates always hit the fixed 600s Gateway
timeout (MCP_TOOL_REPORTED_FAILURE, timeoutSeconds: 600). This adaptive
timeout logic (originally 2026-08-10 e651a0f5 + 2026-08-11 8c078e27) was
silently dropped by the 2026-08-19 whole-tree runtime replacement
(0521f5b0). These tests pin the restored behavior:

  1. stage6_probe_timeout_seconds: base 600s + 5s per candidate, capped 3600s;
  2. stage11_probe_timeout_seconds: base 600s + 30s per case, capped 3600s;
  3. SATK_GATEWAY_TIMEOUT_SECONDS acts as a floor / override;
  4. run_satk injects SATK_GATEWAY_TIMEOUT_SECONDS into the child env;
  5. run_probe forwards gateway_timeout_seconds to run_satk.

Run: python3 -m unittest test_stage6_probe_timeout -v
  or: python3 test_stage6_probe_timeout.py
"""

from __future__ import annotations

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
STAGE_SCRIPT = RUNTIME / "scripts" / "run_tcsd_pipeline_stage.py"
QUALITY_SCRIPT = RUNTIME / "scripts" / "run_tcsd_quality_loop.py"

STAGE = importlib.util.spec_from_file_location("tcsd_pipeline_stage", STAGE_SCRIPT)
STAGE_MODULE = importlib.util.module_from_spec(STAGE)
assert STAGE and STAGE.loader
STAGE.loader.exec_module(STAGE_MODULE)

QUALITY = importlib.util.spec_from_file_location("tcsd_quality_loop", QUALITY_SCRIPT)
QUALITY_MODULE = importlib.util.module_from_spec(QUALITY)
assert QUALITY and QUALITY.loader
QUALITY.loader.exec_module(QUALITY_MODULE)


def clear_timeout_env(cls):
    cls._patch_env = mock.patch.dict(os.environ, {}, clear=False)
    return cls


class Stage6ProbeTimeoutTest(unittest.TestCase):
    def setUp(self):
        for key in ("SATK_GATEWAY_TIMEOUT_SECONDS",):
            os.environ.pop(key, None)

    def tearDown(self):
        for key in ("SATK_GATEWAY_TIMEOUT_SECONDS",):
            os.environ.pop(key, None)

    def test_stage6_default_mapping(self):
        # 无环境变量：600s 基数 + 5s/候选，上限 3600s
        self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(0), 600)
        self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(72), 960)
        self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(76), 980)
        self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(10000), 3600)

    def test_stage11_default_mapping(self):
        # 600s 基数 + 30s/用例，上限 3600s
        self.assertEqual(STAGE_MODULE.stage11_probe_timeout_seconds(0), 600)
        self.assertEqual(STAGE_MODULE.stage11_probe_timeout_seconds(39), 1770)
        self.assertEqual(STAGE_MODULE.stage11_probe_timeout_seconds(200), 3600)

    def test_configured_env_acts_as_floor(self):
        # 环境变量指定下限：低于该值时按环境变量走，高于该值时按自适应走
        with mock.patch.dict(os.environ, {"SATK_GATEWAY_TIMEOUT_SECONDS": "300"}):
            self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(0), 600)
            self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(72), 960)
        with mock.patch.dict(os.environ, {"SATK_GATEWAY_TIMEOUT_SECONDS": "7200"}):
            self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(0), 3600)
        with mock.patch.dict(os.environ, {"SATK_GATEWAY_TIMEOUT_SECONDS": "abc"}):
            self.assertEqual(STAGE_MODULE.stage6_probe_timeout_seconds(0), 600)


class RunSatkTimeoutInjectionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.entry = self.root / "entry.m"
        self.entry.write_text("disp(1);", encoding="utf-8")

    def test_run_satk_injects_gateway_timeout_env(self):
        captured = {}

        def fake_run(cmd, *, cwd, check=True, env=None):
            captured["cmd"] = cmd
            captured["env"] = env
            return mock.Mock(returncode=0)

        with mock.patch.object(QUALITY_MODULE, "run", side_effect=fake_run):
            QUALITY_MODULE.run_satk(
                "python3",
                Path("/scripts"),
                self.entry,
                self.root,
                gateway_timeout_seconds=960,
            )
        self.assertEqual(captured["env"]["SATK_GATEWAY_TIMEOUT_SECONDS"], "960")
        # 未指定时保持原环境（None → 子进程继承）
        with mock.patch.object(QUALITY_MODULE, "run", side_effect=fake_run):
            QUALITY_MODULE.run_satk("python3", Path("/scripts"), self.entry, self.root)
        self.assertIsNone(captured["env"])

    def test_run_probe_forwards_gateway_timeout(self):
        captured = {}

        def fake_run_satk(python, scripts, entry, root_dir, *, gateway_timeout_seconds=None):
            captured["gateway_timeout_seconds"] = gateway_timeout_seconds

        with mock.patch.object(QUALITY_MODULE, "run_satk", side_effect=fake_run_satk):
            QUALITY_MODULE.run_probe(
                python="python3",
                scripts=Path("/scripts"),
                root_dir=self.root,
                model="M",
                mat_file="M.mat",
                init_scripts=[],
                unreachable_overrides="",
                collect_coverage=False,
                coverage_threshold=80.0,
                gateway_timeout_seconds=960,
            )
        self.assertEqual(captured["gateway_timeout_seconds"], 960)


if __name__ == "__main__":
    unittest.main(verbosity=2)
