#!/usr/bin/env python3
"""Regression tests for generic deterministic Coverage IR synthesis."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime" / "scripts"


def script(name: str):
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), SCRIPTS / name)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CoverageIrTests(unittest.TestCase):
    def test_ir_captures_parameter_nested_logic_and_state_stimulus(self) -> None:
        coverage_ir = script("build_coverage_ir.py")
        trace = {
            "model": "GenericModel",
            "operators": [{
                "id": "GenericModel:10", "sid": "GenericModel:10", "block_path": "GenericModel/Gate", "operator": "AND",
                "ports": [
                    {"trace": {"kind": "root_inport", "signal": "Enable"}},
                    {"trace": {"kind": "constant", "value": "Bypass_C"}},
                ],
            }],
        }
        result = coverage_ir.build_ir(trace)
        self.assertEqual(result["schema"], coverage_ir.SCHEMA)
        self.assertTrue(any(item["coverage_class"] == "Decision" for item in result["items"]))
        mcdc = next(item for item in result["items"] if item["coverage_class"] == "MCDC" and item["reachability"]["status"] == "required")
        self.assertIn("Enable", mcdc["controller"]["direct_inputs"])
        self.assertIn("Bypass_C", mcdc["controller"]["parameters"])
        self.assertIn("nested_logic", mcdc)
        self.assertIn("stimulus", mcdc)

    def test_probe_obligation_retains_temporal_evidence_in_ir(self) -> None:
        coverage_ir = script("build_coverage_ir.py")
        trace = {"model": "GenericModel", "operators": []}
        evidence = {"obligations": [{"id": "stateful", "model": "GenericModel", "coverage_class": "MCDC", "status": "required", "match": {"inputs": {"Enable": 0}, "params": {}}, "stimulus": {"initial_inputs": {"Enable": 0}, "steps": [{"delay_s": 0.2, "input_updates": {"Enable": 1}}], "evidence_step": 1}, "probe_evidence": {"step_index": 1}}]}
        result = coverage_ir.build_ir(trace, evidence_obligations=evidence)
        item = next(value for value in result["items"] if value["id"] == "stateful")
        self.assertEqual(item["stimulus"]["steps"][0]["input_updates"], {"Enable": 1})
        self.assertEqual(item["simulation_evidence"]["step_index"], 1)

    def test_synthesis_preserves_functional_cases_and_deduplicates_candidates(self) -> None:
        synthesis = script("synthesize_tcsd_from_coverage_ir.py")
        spec = {"tests": [{"id": "TC_001", "name": "Functional", "initialization": "Enable=0;", "action": "[+0.1s]"}]}
        ir = {"items": [
            {"id": "first", "coverage_class": "MCDC", "required_outcome": "first", "block": {"path": "M/G"}, "controller": {"direct_inputs": {"Enable": 1}, "parameters": {}}, "stimulus": {"steps": []}, "reachability": {"status": "required"}},
            {"id": "duplicate", "coverage_class": "Decision", "required_outcome": "same", "block": {"path": "M/G"}, "controller": {"direct_inputs": {"Enable": 1}, "parameters": {}}, "stimulus": {"steps": []}, "reachability": {"status": "required"}},
            {"id": "unsupported", "coverage_class": "MCDC", "controller": {"direct_inputs": {}, "parameters": {}}, "stimulus": {"steps": []}, "reachability": {"status": "unsupported"}},
        ]}
        result, skipped = synthesis.synthesize(spec, ir)
        self.assertEqual(result["tests"][0]["name"], "Functional")
        self.assertEqual(len(result["tests"]), 2)
        self.assertEqual({item["reason"] for item in skipped}, {"duplicate_candidate", "unsupported"})

    def test_synthesis_does_not_append_candidate_already_covered_by_functional_case(self) -> None:
        synthesis = script("synthesize_tcsd_from_coverage_ir.py")
        spec = {"tests": [{"id": "TC_001", "name": "Functional", "initialization": "Enable=1;", "action": "[+0.1s]"}]}
        ir = {"items": [{"id": "covered", "coverage_class": "Decision", "controller": {"direct_inputs": {"Enable": 1}, "parameters": {}}, "stimulus": {"steps": []}, "reachability": {"status": "required"}}]}
        result, skipped = synthesis.synthesize(spec, ir)
        self.assertEqual(len(result["tests"]), 1)
        self.assertEqual(skipped, [{"id": "covered", "reason": "duplicate_existing_test"}])

    def test_synthesis_uses_stimulus_initial_state_not_post_flip_direct_inputs(self) -> None:
        """B09 r_keyon_rise regression: direct_inputs carries the post-transition
        value (KeyOn=1) while stimulus.initial_inputs holds the pre-edge value
        (KeyOn=0). The Initialization must keep the pre-edge value so the 0->1
        flip in the Action actually produces an edge; baking direct_inputs into
        the init would leave KeyOn high from t=0 and kill edge/latch logic."""
        synthesis = script("synthesize_tcsd_from_coverage_ir.py")
        spec = {"tests": [{"id": "TC_001", "name": "Base",
                           "initialization": "idi_bKeyOn=0;\nicbms_pctHVBatSOCDisp=0;",
                           "action": "[+0.1s]"}]}
        ir = {"items": [
            {"id": "r_keyon_rise", "coverage_class": "MCDC",
             "required_outcome": "edge", "block": {"path": "M/Edge"},
             "controller": {"direct_inputs": {"idi_bKeyOn": 1, "icbms_pctHVBatSOCDisp": 0},
                            "parameters": {}},
             "stimulus": {"initial_inputs": {"idi_bKeyOn": 0, "icbms_pctHVBatSOCDisp": 0},
                          "initial_params": {},
                          "steps": [{"delay_s": 0.1, "input_updates": {}},
                                    {"delay_s": 0.1, "input_updates": {"idi_bKeyOn": 1}}]},
             "reachability": {"status": "required"}},
        ]}
        result, skipped = synthesis.synthesize(spec, ir)
        self.assertEqual(len(result["tests"]), 2)
        appended = next(test for test in result["tests"] if test["id"] != "TC_001")
        self.assertIn("idi_bKeyOn=0;", appended["initialization"])
        self.assertNotIn("idi_bKeyOn=1;", appended["initialization"])
        self.assertIn("idi_bKeyOn=1;", appended["action"])
        self.assertEqual(skipped, [])

    def test_quality_loop_dispatches_repair_through_coverage_ir_synthesizer(self) -> None:
        loop = script("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "outputs").mkdir()
            spec_path = root / "spec.json"
            spec_path.write_text(json.dumps({"tests": [{"id": "TC_001", "name": "Functional"}]}), encoding="utf-8")
            ir_path = root / "outputs" / "ir.json"
            ir_path.write_text(json.dumps({"items": []}), encoding="utf-8")
            workbook = root / "outputs" / "initial.xlsx"
            workbook.write_text("checkpoint", encoding="utf-8")
            commands = []

            def fake_run(command, *, cwd, check=True):
                commands.append(command)
                report_path = Path(command[command.index("--report-json") + 1])
                output_path = Path(command[command.index("--output") + 1])
                output_path.write_text(spec_path.read_text(encoding="utf-8"), encoding="utf-8")
                report_path.write_text(json.dumps({"added": 0, "skipped": [{"id": "x", "reason": "unresolved"}]}), encoding="utf-8")

            with mock.patch.object(loop, "run", side_effect=fake_run):
                result_spec, result_workbook, report = loop.synthesize_ir_once(
                    python=sys.executable, scripts=SCRIPTS, root_dir=root, template=root / "template.xlsx",
                    model="GenericModel", spec=spec_path, workbook=workbook, interface_json=root / "interface.json",
                    coverage_ir=ir_path, iteration=1,
                )
            self.assertIn("synthesize_tcsd_from_coverage_ir.py", commands[0][1])
            self.assertEqual(result_spec, spec_path)
            self.assertEqual(result_workbook, workbook)
            self.assertEqual(report["added"], 0)

    def test_unresolved_is_partial_evidence_not_mapping_failure(self) -> None:
        loop = script("run_tcsd_quality_loop.py")
        self.assertFalse(loop.report_failed({"summary": {"missing_count": 0, "unresolved_count": 2}}))
        self.assertTrue(loop.report_failed({"summary": {"missing_count": 1, "unresolved_count": 0}}))

    def test_manifest_marks_residual_coverage_as_partial(self) -> None:
        loop = script("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            outputs = root / "outputs"
            outputs.mkdir()
            files = {name: outputs / name for name in ("case.xlsx", "sim.json", "initial.json", "final.json", "obligations.json", "mapping.json", "ir.json")}
            for path in files.values():
                path.write_text("{}", encoding="utf-8")
            initial = {"GenericModel": {"condition": {"passed": False}}}
            final = {"GenericModel": {"condition": {"passed": False}}}
            manifest = loop.write_execution_manifest(path=outputs / "manifest.json", root_dir=root, model="GenericModel", threshold=80, workbook=files["case.xlsx"], simulation_result=files["sim.json"], initial_coverage=initial, final_coverage=final, initial_coverage_artifact=files["initial.json"], final_coverage_artifact=files["final.json"], repair_required=True, repair_applied=True, obligations=files["obligations.json"], mapping_report=files["mapping.json"], coverage_ir=files["ir.json"])
            self.assertEqual(manifest["status"], "completed")
            self.assertEqual(manifest["completion"], "partial")
            self.assertEqual(manifest["coverage"]["repair_passes"], 1)

    def test_manifest_completes_partial_when_repair_attempt_has_no_candidate(self) -> None:
        loop = script("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            outputs = root / "outputs"
            outputs.mkdir()
            files = {name: outputs / name for name in ("case.xlsx", "sim.json", "initial.json", "final.json", "obligations.json", "mapping.json", "ir.json", "synthesis.json")}
            for path in files.values():
                path.write_text("{}", encoding="utf-8")
            coverage = {"GenericModel": {"passed": False}}
            manifest = loop.write_execution_manifest(path=outputs / "manifest.json", root_dir=root, model="GenericModel", threshold=80, workbook=files["case.xlsx"], simulation_result=files["sim.json"], initial_coverage=coverage, final_coverage=coverage, initial_coverage_artifact=files["initial.json"], final_coverage_artifact=files["final.json"], repair_required=True, repair_applied=False, repair_attempted=True, repair_reason="no_unique_executable_coverage_ir_candidates", repair_evidence=files["synthesis.json"], obligations=files["obligations.json"], mapping_report=files["mapping.json"], coverage_ir=files["ir.json"])
            self.assertEqual(manifest["status"], "completed")
            self.assertEqual(manifest["completion"], "partial")
            self.assertTrue(manifest["coverage"]["repair_attempted"])
            self.assertFalse(manifest["coverage"]["repair_applied"])
            self.assertEqual(manifest["coverage"]["repair_passes"], 0)

    def test_manifest_is_partial_for_unresolved_ir_even_when_coverage_passes(self) -> None:
        loop = script("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            outputs = root / "outputs"
            outputs.mkdir()
            files = {name: outputs / name for name in ("case.xlsx", "sim.json", "initial.json", "final.json", "obligations.json", "mapping.json", "ir.json")}
            for path in files.values():
                path.write_text("{}", encoding="utf-8")
            files["mapping.json"].write_text(json.dumps({"summary": {"unresolved_count": 1}}), encoding="utf-8")
            files["ir.json"].write_text(json.dumps({"items": [{"reachability": {"status": "unsupported"}}]}), encoding="utf-8")
            coverage = {"GenericModel": {"passed": True}}
            manifest = loop.write_execution_manifest(path=outputs / "manifest.json", root_dir=root, model="GenericModel", threshold=80, workbook=files["case.xlsx"], simulation_result=files["sim.json"], initial_coverage=coverage, final_coverage=coverage, initial_coverage_artifact=files["initial.json"], final_coverage_artifact=files["final.json"], repair_required=False, repair_applied=False, obligations=files["obligations.json"], mapping_report=files["mapping.json"], coverage_ir=files["ir.json"])
            self.assertEqual(manifest["status"], "completed")
            self.assertEqual(manifest["completion"], "partial")

    def test_cli_reports_correct_added_count(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            spec_path, ir_path = root / "spec.json", root / "ir.json"
            spec_path.write_text(json.dumps({"tests": [{"id": "TC_001", "name": "Functional", "initialization": "Enable=0;", "action": "[+0.1s]"}]}), encoding="utf-8")
            ir_path.write_text(json.dumps({"items": [{"id": "new", "coverage_class": "MCDC", "controller": {"direct_inputs": {"Enable": 1}, "parameters": {}}, "stimulus": {"steps": []}, "reachability": {"status": "required"}}]}), encoding="utf-8")
            subprocess.run([sys.executable, str(SCRIPTS / "synthesize_tcsd_from_coverage_ir.py"), "--spec", str(spec_path), "--coverage-ir", str(ir_path), "--output", str(root / "out.json"), "--report-json", str(root / "report.json")], check=True, capture_output=True, text=True)
            report = json.loads((root / "report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["added"], 1)
            self.assertEqual(report["input_test_count"], 1)
            self.assertEqual(report["output_test_count"], 2)



class MpsSelectorDomainClampTests(unittest.TestCase):
    """VehCfg_A01 回归：root_input_boundary 对 'x <= 2' 的 false 侧生成纯数学
    值 3，但 ibsw_stREEVBatDrvRngCfg 是 MPS selector 输入（合法 {0,1,2}，来自
    decision_obligations 的 952_selector_* 义务），3 会令 Multiport Switch4
    越界导致 Stage 8 仿真失败。build_coverage_ir 应以决策义务值域 clamp 并在
    value_domain_notes 中透明记录。"""

    TRACE = {
        "model": "VehCfg_A01",
        "operators": [{
            "id": "VehCfg_A01:594", "sid": "VehCfg_A01:594",
            "block_path": "VehCfg_A01/A01_VehicleParameterConfg/AND",
            "operator": "AND",
            "ports": [
                {"index": 1, "trace": {"kind": "relational", "operator": "<=", "inputs": [
                    {"index": 1, "trace": {"kind": "root_inport", "signal": "ibsw_stREEVBatDrvRngCfg"}},
                    {"index": 2, "trace": {"kind": "constant", "value": 2}},
                ]}},
                {"index": 2, "trace": {"kind": "root_inport", "signal": "ibsw_bACCCfg"}},
            ],
        }],
    }

    SELECTOR_OBLIGATIONS = {
        "schema": "simulink-ut-decision-obligations/v1",
        "model": "VehCfg_A01",
        "obligations": [
            {"id": "952_selector_0", "model": "VehCfg_A01", "coverage_class": "Decision",
             "required_outcome": "selector=0", "status": "required",
             "match": {"inputs": {"ibsw_stREEVBatDrvRngCfg": 0}, "params": {"VehCfg_bREEVBatDrvRngCfgOvrd_C": 0}}},
            {"id": "952_selector_1", "model": "VehCfg_A01", "coverage_class": "Decision",
             "required_outcome": "selector=1", "status": "required",
             "match": {"inputs": {"ibsw_stREEVBatDrvRngCfg": 1}, "params": {}}},
            {"id": "952_selector_2", "model": "VehCfg_A01", "coverage_class": "Decision",
             "required_outcome": "selector=2", "status": "required",
             "match": {"inputs": {"ibsw_stREEVBatDrvRngCfg": 2}, "params": {}}},
        ],
    }

    def _inputs(self, item):
        return (item.get("controller") or {}).get("direct_inputs") or {}

    def test_boundary_value_3_is_clamped_into_selector_domain(self):
        coverage_ir = script("build_coverage_ir.py")
        result = coverage_ir.build_ir(self.TRACE, decision_obligations=self.SELECTOR_OBLIGATIONS)
        values_3 = [
            item["id"] for item in result["items"]
            if self._inputs(item).get("ibsw_stREEVBatDrvRngCfg") == 3
        ]
        self.assertEqual(values_3, [])
        clamped = [
            item for item in result["items"]
            if any((note or {}).get("reason") == "selector_domain_clamp" for note in (item.get("value_domain_notes") or []))
        ]
        self.assertTrue(clamped, "应有域修正记录")
        note = clamped[0]["value_domain_notes"][0]
        self.assertEqual(note["was"], 3)
        self.assertEqual(note["now"], 2)
        self.assertEqual(self._inputs(clamped[0]).get("ibsw_stREEVBatDrvRngCfg"), 2)

    def test_no_decision_obligations_keeps_structural_behavior(self):
        # 无决策义务（存量运行路径）时保持原行为：3 保留，不受影响
        coverage_ir = script("build_coverage_ir.py")
        result = coverage_ir.build_ir(self.TRACE)
        any_3 = any(self._inputs(item).get("ibsw_stREEVBatDrvRngCfg") == 3 for item in result["items"])
        self.assertTrue(any_3)


if __name__ == "__main__":
    unittest.main()

