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
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CoverageIrTests(unittest.TestCase):
    def run_cli(self, *extra_args):
        command = [
            sys.executable,
            "-B",
            str(SCRIPTS / "build_coverage_ir.py"),
            *extra_args,
        ]
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    def test_cli_structured_error_for_missing_traces(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            result = self.run_cli(
                "--logical-traces",
                str(Path(root) / "missing.json"),
                "--output",
                str(Path(root) / "ir.json"),
            )
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stderr)
        self.assertEqual(payload["schema"], "tcsd-deterministic-script-error/v1")
        self.assertEqual(payload["code"], "coverage_ir_traces_missing")

    def test_cli_structured_error_for_invalid_json(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            traces = Path(root) / "traces.json"
            traces.write_text("{ not json", encoding="utf-8")
            result = self.run_cli(
                "--logical-traces",
                str(traces),
                "--output",
                str(Path(root) / "ir.json"),
            )
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stderr)
        self.assertEqual(payload["code"], "coverage_ir_build_failed")
        self.assertIn("JSONDecodeError", payload["message"])

    def test_cli_structured_error_for_empty_operator_reports(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            traces = Path(root) / "traces.json"
            traces.write_text(json.dumps({"model": "M", "data": {"not": "operators"}}), encoding="utf-8")
            result = self.run_cli(
                "--logical-traces",
                str(traces),
                "--output",
                str(Path(root) / "ir.json"),
            )
        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stderr)
        self.assertEqual(payload["code"], "coverage_ir_build_failed")
        self.assertIn("no operator reports", payload["message"])

    def test_no_unique_cause_pair_is_degraded_not_fatal(self) -> None:
        planner = script("build_atomic_mcdc_repair_plan.py")
        coverage_ir = script("build_coverage_ir.py")
        trace = {
            "model": "GenericModel",
            "operators": [{
                "id": "GenericModel:12",
                "sid": "GenericModel:12",
                "block_path": "GenericModel/Contradiction",
                "operator": "AND",
                "ports": [
                    {"trace": {"kind": "root_inport", "signal": "Enable"}},
                    {"trace": {"kind": "logic", "operator": "NOT", "inputs": [{"kind": "root_inport", "signal": "Enable"}]}},
                ],
            }],
        }
        operator = trace["operators"][0]
        obligations, summary = planner.build_for_operator("GenericModel", operator)
        infeasible = [
            item for item in obligations
            if item["status"] == "unsupported" and any("no_unique_cause_pair" in str(issue) for issue in item.get("issues", []))
        ]
        self.assertTrue(infeasible, f"expected infeasible condition exemptions, got {obligations}")
        self.assertIn("no_unique_cause_pair", "; ".join(str(issue) for issue in summary["issues"]))
        result = coverage_ir.build_ir(trace, evidence_obligations={"obligations": obligations})
        unsupported = [
            item for item in result["items"]
            if item["reachability"]["status"] == "unsupported"
        ]
        self.assertTrue(unsupported, "Coverage IR must retain the infeasible obligations as unsupported")
        self.assertTrue(
            any(
                "no_unique_cause_pair" in str(item["reachability"].get("reason") or "")
                or any("no_unique_cause_pair" in str(issue) for issue in item["reachability"].get("issues", []))
                for item in unsupported
            )
        )
        self.assertEqual(result["summary"]["unsupported"], len(unsupported))

    def test_wide_and_uses_one_all_true_baseline_plus_one_toggle_per_input(self) -> None:
        planner = script("build_atomic_mcdc_repair_plan.py")
        operator = {
            "id": "GenericModel:WideAnd",
            "sid": "GenericModel:WideAnd",
            "block_path": "GenericModel/WideAnd",
            "operator": "AND",
            "ports": [
                {"trace": {"kind": "root_inport", "signal": f"Input{index}"}}
                for index in range(1, 9)
            ],
        }

        obligations, _ = planner.build_for_operator("GenericModel", operator)
        sensitization = [
            item for item in obligations
            if item.get("pattern_type") == "and_sensitization" and item.get("status") == "required"
        ]

        self.assertEqual(len(sensitization), 9)
        vectors = {item["control_recipe"]["condition_vector"] for item in sensitization}
        self.assertIn("TTTTTTTT", vectors)
        self.assertEqual(sum(vector.count("F") == 1 for vector in vectors), 8)

    def test_resolved_symbolic_comparator_emits_below_equal_above_recipes(self) -> None:
        planner = script("build_atomic_mcdc_repair_plan.py")
        coverage_ir = script("build_coverage_ir.py")
        trace = {
            "model": "GenericModel",
            "operators": [{
                "id": "GenericModel:CompareAnd",
                "sid": "GenericModel:CompareAnd",
                "block_path": "GenericModel/CompareAnd",
                "operator": "AND",
                "ports": [
                    {"trace": {
                        "kind": "relational",
                        "operator": ">",
                        "path": "GenericModel/VoltageGreaterThanLimit",
                        "inputs": [
                            {"kind": "root_inport", "signal": "InputVoltage"},
                            {"kind": "constant", "value": "Limit_C", "resolvedValue": 320},
                        ],
                    }},
                    {"trace": {"kind": "root_inport", "signal": "Enable"}},
                ],
            }],
        }

        obligations, _ = planner.build_for_operator("GenericModel", trace["operators"][0])
        boundaries = [item for item in obligations if item.get("pattern_type") == "simple_comparator_boundary"]
        self.assertEqual(
            [item["control_recipe"]["boundary_position"] for item in boundaries],
            ["below", "equal", "above"],
        )
        self.assertEqual(
            [item["control_recipe"]["stimulus_value"] for item in boundaries],
            [319, 320, 321],
        )
        self.assertTrue(all(item["control_recipe"]["threshold"] == 320 for item in boundaries))
        self.assertTrue(all(item["control_recipe"]["threshold_expression"] == "Limit_C" for item in boundaries))
        self.assertTrue(all(item["control_recipe"]["threshold_source"] == "resolved_workspace_symbol" for item in boundaries))

        result = coverage_ir.build_ir(trace)
        ir_boundaries = [item for item in result["items"] if item.get("patternType") == "simple_comparator_boundary"]
        self.assertEqual(len(ir_boundaries), 3)
        readiness = result["summary"]["executionReadiness"]
        self.assertGreaterEqual(readiness["executableTargetCount"], 3)

    def test_affine_root_chain_resolves_gain_bias_and_data_conversion_boundary(self) -> None:
        planner = script("build_atomic_mcdc_repair_plan.py")
        operator = {
            "id": "GenericModel:AffineAnd",
            "sid": "GenericModel:AffineAnd",
            "block_path": "GenericModel/AffineAnd",
            "operator": "AND",
            "ports": [
                {"trace": {
                    "kind": "relational",
                    "operator": ">=",
                    "path": "GenericModel/AffineCompare",
                    "inputs": [
                        {"kind": "block", "semantic": "datatypeconversion", "path": "GenericModel/Convert", "params": {"OutDataTypeStr": "double"}, "inputs": [
                            {"kind": "block", "semantic": "bias", "path": "GenericModel/Bias", "params": {"Bias": "Offset_C", "BiasResolved": 10, "BiasResolvedSource": "model_context"}, "inputs": [
                                {"kind": "block", "semantic": "gain", "path": "GenericModel/Gain", "params": {"Gain": "Gain_C", "GainResolved": 2, "GainResolvedSource": "model_context"}, "inputs": [
                                    {"kind": "root_inport", "signal": "InputVoltage", "dataType": "double"},
                                ]},
                            ]},
                        ]},
                        {"kind": "constant", "value": "Limit_C", "resolvedValue": 100, "resolvedSource": "model_context"},
                    ],
                }},
                {"trace": {"kind": "root_inport", "signal": "Enable"}},
            ],
        }

        obligations, _ = planner.build_for_operator("GenericModel", operator)
        boundaries = [item for item in obligations if item.get("pattern_type") == "simple_comparator_boundary"]
        self.assertEqual(
            [item["control_recipe"]["stimulus_value"] for item in boundaries],
            [44, 45, 46],
        )
        self.assertTrue(all(item["control_recipe"]["root_boundary"] == 45 for item in boundaries))
        self.assertTrue(all(item["control_recipe"]["threshold_source"] == "model_context" for item in boundaries))
        self.assertEqual(
            [entry["kind"] for entry in boundaries[0]["control_recipe"]["control_chain"]],
            ["gain", "bias", "data_type_conversion"],
        )
        required = [item for item in boundaries if item["status"] == "required"]
        self.assertEqual(len(required), 3)

    def test_boundary_values_respect_integer_and_fixed_point_domains(self) -> None:
        planner = script("build_atomic_mcdc_repair_plan.py")
        self.assertEqual(planner.boundary_values(0, "uint8"), [("equal", 0), ("above", 1)])
        self.assertEqual(
            planner.boundary_values(1.0, "fixdt(1,16,8)"),
            [("below", 0.99609375), ("equal", 1.0), ("above", 1.00390625)],
        )

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


if __name__ == "__main__":
    unittest.main()
