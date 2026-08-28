#!/usr/bin/env python3
"""防线测试：断言关键生产修复标记在集成分支运行时中始终存在。

背景（2026-08-25 实证）：2026-08-10/11 的探针自适应超时修复
（e651a0f5 / 8c078e27）在 2026-08-19 的"整体替换"
（0521f5b0 align: 运行时与测试严格对齐 DSH 分支）中被静默删除，
导致 e8060ca9 / f2f9091d 任务在 Stage 6 探针 600s 超时失败；
同类风险同样威胁 d92a002（Stage 8 基线回填）与 b7e34b2
（Stage 10 prepare 判定）修复——它们只存在于集成分支线上。

任何"整体替换 / 全面对齐 / 整体同步"类提交如果再次吞掉这些修复，
本测试将立即变红，避免静默丢失。

Run: python3 test_tcsd_guardrails.py
"""

from __future__ import annotations

import unittest
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime" / "scripts"


class TcsdGuardrailsTest(unittest.TestCase):
    # 关键修复标记清单（(文件相对 scripts/ 目录, 标记, 说明)；做成类属性方便测试内覆写）
    GUARDRAILS = [
        (
            "run_tcsd_pipeline_stage.py",
            "STAGE6_PROBE_TIMEOUT_BASE_SECONDS",
            "Stage 6 探针自适应 Gateway 超时（e651a0f5 恢复，防 0521f5b0 类整体替换重演）",
        ),
        (
            "run_tcsd_pipeline_stage.py",
            "stage6_probe_timeout_seconds",
            "Stage 6 探针超时计算函数存在",
        ),
        (
            "run_tcsd_pipeline_stage.py",
            "stage11_probe_timeout_seconds",
            "Stage 11 最终探针按用例规模自适应超时（8c078e27 恢复）",
        ),
        (
            "run_tcsd_pipeline_stage.py",
            "final observation window",
            "Stage 8 基线用例规范 Action 形态（d92a002 修复）",
        ),
        (
            "run_tcsd_quality_loop.py",
            "gateway_timeout_seconds",
            "run_satk/run_probe 透传 Gateway 超时（探针自适应修复的传输层）",
        ),
        (
            "dsh_stage_runner.py",
            "awaiting agent repair proposal",
            "Stage 10 prepare 中间态不被误判为失败（b7e34b2 修复）",
        ),
        (
            "backfill_expected_outputs.py",
            "prelude",
            "回填解析器保留首标记前赋值（Stage 8 防御性修复）",
        ),
        (
            "extract_tcsd_cases.py",
            "pre_updates",
            "用例提取器保留首标记前赋值（Stage 8 防御性修复）",
        ),
        (
            "probe_logical_mcdc_vectors.m",
            "append_probe_progress",
            "探针候选级进度落盘（Stage 6 故障定位）",
        ),
        (
            "probe_logical_mcdc_vectors.m",
            "probe_failure_diagnostic",
            "探针失败现场持久化（MATLAB 报错全文，e8060ca9/232f3c90 教训）",
        ),
        (
            "build_decision_obligations.py",
            "Always prefer the DataPortOrder-derived",
            "MPS selector 优先 DataPortOrder 推导（A23_B04 越界修复，2026-08-26）",
        ),
        (
            "build_coverage_ir.py",
            "selector_domain_rechoice",
            "IR 域内重选满足语义的值/无解标 unresolved（VehCfg_A01 越界修复，2026-08-27）",
        ),
        (
            "build_decision_obligations.py",
            "selector_domain_constraint",
            "决策义务生成器按 MPS selector 域生成时序值（VehCfg_A01 源头修复，2026-08-27）",
        ),
    ]

    def test_key_fix_markers_present(self):
        failures = []
        for filename, marker, note in self.GUARDRAILS:
            path = RUNTIME / filename
            if not path.is_file():
                failures.append(f"{filename} 缺失（整体替换删除了文件？）：{note}")
                continue
            if marker not in path.read_text(encoding="utf-8"):
                failures.append(f"{filename} 中缺失标记 {marker!r}：{note}")
        self.assertEqual(failures, [], "\n".join(failures))


if __name__ == "__main__":
    unittest.main(verbosity=2)
