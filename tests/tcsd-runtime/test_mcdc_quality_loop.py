#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
SCRIPTS = ROOT / "scripts"


def load_script_module(script_name: str):
    spec = importlib.util.spec_from_file_location(script_name.removesuffix(".py"), SCRIPTS / script_name)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class McdcQualityLoopTests(unittest.TestCase):
    def test_simulation_rejects_a_successful_gateway_call_without_result_artifact(self) -> None:
        quality = load_script_module("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "outputs").mkdir()
            with mock.patch.object(quality, "run_satk", return_value=None):
                with self.assertRaises(quality.SatkEvaluationError) as raised:
                    quality.simulate_and_backfill(
                        python=sys.executable,
                        scripts=SCRIPTS,
                        root_dir=root,
                        model="GenericModel",
                        workbook=root / "outputs" / "cases.xlsx",
                        case_json=root / "outputs" / "cases.json",
                        mat_file="values.mat",
                        outputs="Result",
                        exclude_outputs="",
                        interface_json=root / "outputs" / "interface.json",
                    )
            self.assertEqual(
                raised.exception.details["gatewayErrorCode"],
                "MATLAB_RESULT_ARTIFACT_MISSING",
            )
            self.assertEqual(raised.exception.details["phase"], "matlab_case_simulation")

    def test_simulation_surfaces_captured_matlab_identifier(self) -> None:
        quality = load_script_module("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            outputs = root / "outputs"
            outputs.mkdir()

            def failed_satk(*_args, **_kwargs):
                (outputs / "GenericModel_sim_results_mcdc.error.json").write_text(
                    json.dumps({
                        "schema": "tcsd-matlab-simulation-error/v1",
                        "identifier": "Simulink:Engine:ModelError",
                        "message": "The model simulation failed.",
                    }),
                    encoding="utf-8",
                )
                raise quality.SatkEvaluationError("gateway failure", {"phase": "matlab_probe_evaluation"})

            with mock.patch.object(quality, "run_satk", side_effect=failed_satk):
                with self.assertRaises(quality.SatkEvaluationError) as raised:
                    quality.simulate_and_backfill(
                        python=sys.executable,
                        scripts=SCRIPTS,
                        root_dir=root,
                        model="GenericModel",
                        workbook=outputs / "cases.xlsx",
                        case_json=outputs / "cases.json",
                        mat_file="values.mat",
                        outputs="Result",
                        exclude_outputs="",
                        interface_json=outputs / "interface.json",
                    )
            self.assertEqual(raised.exception.details["gatewayErrorCode"], "Simulink:Engine:ModelError")
            self.assertIn("model simulation failed", str(raised.exception).lower())

    def test_state_probe_planner_builds_bounded_timing_sequences_without_model_names(self) -> None:
        planner = load_script_module("build_state_probe_plan.py")
        trace = {
            "model": "GenericTimer",
            "operators": [
                {
                    "id": "GenericTimer:1",
                    "operator": "AND",
                    "ports": [
                        {
                            "index": 1,
                            "trace": {
                                "kind": "relational",
                                "operator": ">",
                                "inputs": [
                                    {
                                        "trace": {
                                            "kind": "stateful",
                                            "initialCondition": "0",
                                            "inputs": [{"trace": {"kind": "root_inport", "signal": "TimerEnable"}}],
                                        }
                                    },
                                    {"trace": {"kind": "constant", "value": "Wait_C", "resolvedValue": 0.25}},
                                ],
                            },
                        },
                        {"index": 2, "trace": {"kind": "root_inport", "signal": "Request"}},
                    ],
                }
            ],
        }

        plan = planner.build_plan(trace, max_candidates=6, sample_time=0.01)

        self.assertEqual(plan["summary"]["target_count"], 1)
        self.assertEqual(plan["summary"]["candidate_count"], 6)
        self.assertTrue(plan["targets"][0]["bounded"])
        for test in plan["tests"]:
            self.assertEqual(test["init_values"]["Request"], 1)
            self.assertEqual(test["evidence_step"], 2)
            self.assertEqual(test["target"]["pattern_type"], "generic-state-timing")
            self.assertIn(test["target"]["transition"], {"0->1", "1->0"})
        self.assertTrue(any(step["delay_s"] > 0.25 for test in plan["tests"] for step in test["steps"]))

    def test_state_probe_planner_keeps_edge_and_generic_test_fields_identical(self) -> None:
        planner = load_script_module("build_state_probe_plan.py")
        trace = {
            "model": "MixedStateModel",
            "operators": [{
                "id": "MixedStateModel:1",
                "operator": "AND",
                "ports": [
                    {
                        "index": 1,
                        "trace": {
                            "kind": "subsystem",
                            "name": "EdgeRising",
                            "source": {"kind": "root_inport", "signal": "EdgeInput"},
                        },
                    },
                    {
                        "index": 2,
                        "trace": {
                            "kind": "relational",
                            "operator": ">",
                            "inputs": [
                                {
                                    "trace": {
                                        "kind": "stateful",
                                        "inputs": [{"trace": {"kind": "root_inport", "signal": "TimerEnable"}}],
                                    }
                                },
                                {"trace": {"kind": "constant", "value": "Wait_C", "resolvedValue": 0.25}},
                            ],
                        },
                    },
                ],
            }],
        }

        plan = planner.build_plan(trace, max_candidates=4, sample_time=0.01)

        pattern_types = {test["target"]["pattern_type"] for test in plan["tests"]}
        self.assertEqual(pattern_types, {"rising-edge", "generic-state-timing"})
        self.assertEqual(len({frozenset(test) for test in plan["tests"]}), 1)
        self.assertEqual(len({frozenset(test["target"]) for test in plan["tests"]}), 1)
        self.assertEqual(
            len({frozenset(step) for test in plan["tests"] for step in test["steps"]}),
            1,
        )
        self.assertTrue(all(test["evidence_step"] == 2 for test in plan["tests"]))

    def test_state_probe_planner_rejects_inconsistent_test_fields_before_matlab(self) -> None:
        planner = load_script_module("build_state_probe_plan.py")
        valid = {
            "row": 1,
            "test_id": "STATE_PROBE_0001",
            "init_values": {},
            "init_params": {},
            "steps": [{"index": 1, "delay_s": 0.01, "input_updates": {}, "param_updates": {}}],
            "evidence_step": 1,
            "target": {
                "operator_id": "Model:1",
                "port_index": 1,
                "pattern_type": "generic-state-timing",
                "control_input": "Enable",
                "transition": "0->1",
                "hold_s": 0.01,
            },
        }
        invalid = dict(valid)
        invalid.pop("evidence_step")

        with self.assertRaisesRegex(ValueError, "fields differ from the required schema"):
            planner.validate_test_schema([valid, invalid])

    def test_state_probe_planner_reports_unsupported_semantics_without_guessing(self) -> None:
        planner = load_script_module("build_state_probe_plan.py")
        trace = {
            "model": "GenericUnsupported",
            "operators": [{
                "id": "GenericUnsupported:1",
                "operator": "AND",
                "ports": [{"index": 1, "trace": {"kind": "lookup_table", "inputs": []}}],
            }],
        }

        plan = planner.build_plan(trace, max_candidates=32, sample_time=0.01)

        self.assertEqual(plan["summary"]["candidate_count"], 0)
        self.assertEqual(plan["targets"][0]["status"], "unsupported_semantics")
        self.assertIn("lookup_table", plan["targets"][0]["unsupported_semantics"])

    def test_state_probe_planner_builds_dedicated_rising_and_falling_edge_sequences(self) -> None:
        planner = load_script_module("build_state_probe_plan.py")
        for block_name, expected_pattern, start, end in (
            ("EdgeRising", "rising-edge", 0, 1),
            ("EdgeFalling", "falling-edge", 1, 0),
        ):
            with self.subTest(block_name=block_name):
                trace = {
                    "model": "GenericEdge",
                    "operators": [{
                        "id": f"GenericEdge:{block_name}",
                        "operator": "AND",
                        "ports": [
                            {
                                "index": 1,
                                "trace": {
                                    "kind": "subsystem",
                                    "name": block_name,
                                    "source": {"kind": "root_inport", "signal": "EdgeInput"},
                                },
                            },
                            {"index": 2, "trace": {"kind": "root_inport", "signal": "Enable"}},
                        ],
                    }],
                }

                plan = planner.build_plan(trace, max_candidates=8, sample_time=0.01)

                self.assertEqual(plan["summary"]["candidate_count"], 1)
                self.assertEqual(plan["targets"][0]["pattern_type"], expected_pattern)
                candidate = plan["tests"][0]
                self.assertEqual(candidate["init_values"], {"Enable": 1, "EdgeInput": start})
                self.assertEqual(len(candidate["steps"]), 4)
                self.assertEqual(candidate["steps"][1]["input_updates"], {"EdgeInput": end})
                self.assertEqual(candidate["steps"][3]["input_updates"], {"EdgeInput": start})
                self.assertEqual(candidate["evidence_step"], 2)
                self.assertEqual(candidate["target"]["pattern_type"], expected_pattern)

    def test_probe_obligation_preserves_full_state_stimulus(self) -> None:
        builder = load_script_module("build_probe_mcdc_obligations.py")
        report = {
            "probes": [{"id": "Generic:1", "operator": "AND", "port_names": ["u1"]}],
            "observations": [{
                "test_id": "STATE_PROBE_0001",
                "row": 1,
                "step_index": 2,
                "time_s": 0.3,
                "inputs": {"Enable": 1},
                "params": {"Wait_C": 0.25},
                "vectors": {"probe": {"id": "Generic:1", "label": "T", "ok": True}},
                "stimulus": {
                    "initial_inputs": {"Enable": 0},
                    "initial_params": {"Wait_C": 0.25},
                    "steps": [
                        {"index": 1, "delay_s": 0.01, "input_updates": {"Enable": 1}, "param_updates": {}},
                        {"index": 2, "delay_s": 0.29, "input_updates": {}, "param_updates": {}},
                    ],
                    "evidence_step": 2,
                },
                "prediction_status": "observed",
            }],
        }

        payload = builder.build_for_model("Generic", report, overrides={}, missing_status="unresolved")

        obligation = payload["obligations"][0]
        self.assertEqual(obligation["status"], "required")
        self.assertEqual(obligation["stimulus"]["initial_inputs"], {"Enable": 0})
        self.assertEqual(len(obligation["stimulus"]["steps"]), 2)
        self.assertEqual(obligation["evidence_state"], "probe_observed_with_executable_sequence")

    def test_dynamic_anchor_sensitizes_resolved_sibling_ports(self) -> None:
        builder = load_script_module("build_probe_mcdc_obligations.py")
        stimulus = {
            "initial_inputs": {"TimerEnable": 0, "Request": 1, "FaultFree": 1},
            "initial_params": {},
            "steps": [
                {"index": 1, "delay_s": 0.01, "input_updates": {"TimerEnable": 1}, "param_updates": {}},
                {"index": 2, "delay_s": 0.3, "input_updates": {}, "param_updates": {}},
            ],
            "evidence_step": 2,
        }
        report = {
            "probes": [{"id": "Generic:1", "operator": "AND", "port_names": ["u1", "u2", "u3"]}],
            "observations": [
                {"test_id": "P1", "step_index": 1, "inputs": {"TimerEnable": 1, "Request": 1, "FaultFree": 1}, "params": {}, "stimulus": stimulus, "vectors": {"v": {"id": "Generic:1", "label": "FTT", "ok": True}}},
                {"test_id": "P1", "step_index": 2, "inputs": {"TimerEnable": 1, "Request": 1, "FaultFree": 1}, "params": {}, "stimulus": stimulus, "vectors": {"v": {"id": "Generic:1", "label": "TTT", "ok": True}}},
            ],
        }
        mappings = {
            "Generic:1": {
                "id": "Generic:1",
                "ports": [
                    {"index": 1, "mapping_issues": ["dynamic stateful path"]},
                    {"index": 2, "true_inputs": {"Request": 1}, "false_inputs": {"Request": 0}},
                    {"index": 3, "true_inputs": {"FaultFree": 1}, "false_inputs": {"FaultFree": 0}},
                ],
            }
        }

        payload = builder.build_for_model("Generic", report, overrides={}, missing_status="unresolved", mappings=mappings)

        self.assertEqual(payload["summary"]["required_count"], 4)
        self.assertEqual(payload["summary"]["unresolved_count"], 0)
        by_id = {item["id"]: item for item in payload["obligations"]}
        self.assertEqual(by_id["Generic:1_TFT"]["stimulus"]["initial_inputs"]["Request"], 0)
        self.assertEqual(by_id["Generic:1_TTF"]["stimulus"]["initial_inputs"]["FaultFree"], 0)
        self.assertEqual(by_id["Generic:1_TFT"]["evidence_state"], "probe_observed_dynamic_anchor_with_static_sensitization")

    def test_augment_and_validator_preserve_ordered_state_stimulus(self) -> None:
        augment = load_script_module("augment_tcsd_for_mcdc.py")
        validator = load_script_module("validate_logical_mcdc_mapping.py")
        obligation = {
            "id": "Generic:1_T",
            "status": "required",
            "block_path": "Generic/Decision",
            "required_outcome": "operator_input_vector=T; output=true",
            "match": {"inputs": {"Enable": 1}, "params": {"Wait_C": 0.25}},
            "stimulus": {
                "initial_inputs": {"Enable": 0},
                "initial_params": {"Wait_C": 0.25},
                "steps": [
                    {"delay_s": 0.01, "input_updates": {"Enable": 1}, "param_updates": {}},
                    {"delay_s": 0.29, "input_updates": {}, "param_updates": {}},
                ],
                "evidence_step": 2,
            },
        }
        initialization = augment.merge_initialization("Other=0;", {"Enable": 0}, {"Wait_C": 0.25})
        test = augment.build_test(2, obligation, initialization)

        self.assertIn("p Wait_C=0.25;", test["initialization"])
        self.assertIn("[+0.01s]", test["action"])
        self.assertLess(test["action"].index("Enable=1;"), test["action"].index("[+0.29s]"))
        self.assertNotIn("p Wait_C", test["action"])
        snapshots = [
            {"test_id": "TC_002", "phase": "initialization", "inputs": {"Enable": 0}, "params": {"Wait_C": 0.25}, "delay_s": 0.0},
            {"test_id": "TC_002", "phase": "action_step", "inputs": {"Enable": 1}, "params": {"Wait_C": 0.25}, "delay_s": 0.01},
            {"test_id": "TC_002", "phase": "action_step", "inputs": {"Enable": 1}, "params": {"Wait_C": 0.25}, "delay_s": 0.29},
        ]
        matched, missing = validator.find_stimulus_match(obligation["stimulus"], snapshots, tolerance=1e-9)
        self.assertIsNotNone(matched)
        self.assertEqual(missing, [])
        snapshots[2]["delay_s"] = 0.1
        matched, missing = validator.find_stimulus_match(obligation["stimulus"], snapshots, tolerance=1e-9)
        self.assertIsNone(matched)
        self.assertTrue(any(item["kind"] == "delay" for item in missing))

    def test_execution_manifest_requires_coverage_repair_when_initial_is_below_target(self) -> None:
        quality_loop = load_script_module("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            outputs = root / "outputs"
            outputs.mkdir()
            workbook = outputs / "GenericModel_Test0002_tcsd.xlsx"
            simulation = outputs / "GenericModel_sim_results_mcdc.json"
            initial_artifact = outputs / "GenericModel_initial_coverage_summary.json"
            final_artifact = outputs / "GenericModel_coverage_summary.json"
            obligations = outputs / "GenericModel_coverage_obligations.json"
            mapping = outputs / "GenericModel_mcdc_validation_report.json"
            for item in (workbook, simulation, initial_artifact, final_artifact, obligations, mapping):
                item.write_text("{}", encoding="utf-8")
            initial = {
                "GenericModel": {
                    "condition": {"percent": 100, "passed": True},
                    "decision": {"percent": 75, "passed": False},
                    "mcdc": {"percent": 33.3, "passed": False},
                }
            }
            final = {
                "GenericModel": {
                    "condition": {"percent": 100, "passed": True},
                    "decision": {"percent": 100, "passed": True},
                    "mcdc": {"percent": 83.3, "passed": True},
                }
            }
            incomplete = quality_loop.write_execution_manifest(
                path=outputs / "incomplete.json",
                root_dir=root,
                model="GenericModel",
                threshold=80,
                workbook=workbook,
                simulation_result=simulation,
                initial_coverage=initial,
                final_coverage=final,
                initial_coverage_artifact=initial_artifact,
                final_coverage_artifact=final_artifact,
                repair_required=True,
                repair_applied=False,
                obligations=obligations,
                mapping_report=mapping,
            )
            self.assertEqual(incomplete["status"], "incomplete")

            completed = quality_loop.write_execution_manifest(
                path=outputs / "completed.json",
                root_dir=root,
                model="GenericModel",
                threshold=80,
                workbook=workbook,
                simulation_result=simulation,
                initial_coverage=initial,
                final_coverage=final,
                initial_coverage_artifact=initial_artifact,
                final_coverage_artifact=final_artifact,
                repair_required=True,
                repair_applied=True,
                obligations=obligations,
                mapping_report=mapping,
            )
            self.assertEqual(completed["status"], "completed")
            self.assertEqual(completed["coverage"]["repair_passes"], 1)
            self.assertEqual(completed["workbook"], "outputs/GenericModel_Test0002_tcsd.xlsx")

    def test_atomic_plan_augmentation_preserves_existing_tests(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            spec = {
                "model_name": "GenericModel",
                "test_group": {"id": "GENERIC_TG_001", "name": "GenericModel"},
                "tests": [
                    {
                        "id": "TC_001",
                        "name": "Original functional case",
                        "requirement_id": "REQ",
                        "description": "preserve me",
                        "initialization": "StartRequest=0;\nFaultActive=0;",
                        "action": "[+0.2s]\n[+0.1s]",
                        "work_status": "reviewed",
                    }
                ],
            }
            plan = {
                "generation_mode": "minimal_unique_cause",
                "summary": {"decisions": [{"condition_count": 2, "max_allowed_vectors": 6}]},
                "obligations": [
                    {
                        "id": "GenericModel:11_atomic_TT",
                        "status": "required",
                        "block_path": "GenericModel/FinalDecision",
                        "required_outcome": "atomic_condition_vector=TT; output=true",
                        "match": {
                            "inputs": {"StartRequest": 1},
                            "params": {"Bypass_C": 1},
                        },
                        "hold_s": 0.25,
                    }
                ],
            }
            (work / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
            (work / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "augment_tcsd_for_mcdc.py"),
                    "--spec",
                    str(work / "spec.json"),
                    "--obligations",
                    str(work / "plan.json"),
                    "--output",
                    str(work / "augmented.json"),
                ],
                check=True,
            )
            augmented = json.loads((work / "augmented.json").read_text(encoding="utf-8"))
            self.assertEqual(augmented["tests"][0]["name"], "Original functional case")
            self.assertEqual(len(augmented["tests"]), 2)
            self.assertIn("p Bypass_C=1;", augmented["tests"][1]["initialization"])
            self.assertIn("[+0.25s]", augmented["tests"][1]["action"])

    def test_coverage_threshold_triggers_repair_without_being_a_mapping_failure(self) -> None:
        quality_loop = load_script_module("run_tcsd_quality_loop.py")
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "coverage.json"
            report.write_text(
                json.dumps({"GenericModel": {"condition": {"passed": True}, "decision": {"passed": True}, "mcdc": {"passed": False}, "passed": False}}),
                encoding="utf-8",
            )
            self.assertTrue(quality_loop.coverage_below_target(report))

            report.write_text(
                json.dumps({"GenericModel": {"condition": {"passed": True}, "decision": {"passed": True}, "mcdc": {"passed": True}, "passed": True}}),
                encoding="utf-8",
            )
            self.assertFalse(quality_loop.coverage_below_target(report))

    def test_trace_adapter_derives_symbolic_parameter_and_nested_logic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            trace = {
                "model": "GenericModel",
                "operators": [
                    {
                        "id": "GenericModel:16",
                        "block_path": "GenericModel/Sub/OR",
                        "operator": "OR",
                        "ports": [
                            {
                                "index": 1,
                                "trace": {
                                    "kind": "logic",
                                    "operator": "AND",
                                    "inputs": [
                                        {"index": 1, "trace": {"kind": "logic", "operator": "NOT", "inputs": [{"index": 1, "trace": {"kind": "root_inport", "signal": "ErrA"}}]}},
                                        {"index": 2, "trace": {"kind": "logic", "operator": "NOT", "inputs": [{"index": 1, "trace": {"kind": "root_inport", "signal": "ErrB"}}]}},
                                    ],
                                },
                            },
                            {"index": 2, "trace": {"kind": "constant", "value": "Bypass_C"}},
                        ],
                    }
                ],
            }
            (work / "trace.json").write_text(json.dumps(trace), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "derive_logical_mcdc_mappings.py"),
                    "--traces",
                    str(work / "trace.json"),
                    "--output",
                    str(work / "mapping.json"),
                ],
                check=True,
            )
            mapping = json.loads((work / "mapping.json").read_text(encoding="utf-8"))
            first, second = mapping["operators"][0]["ports"]
            self.assertEqual(first["true_inputs"], {"ErrA": 0, "ErrB": 0})
            self.assertEqual(first["false_inputs"], {"ErrA": 1, "ErrB": 0})
            self.assertEqual(second["true_params"], {"Bypass_C": 1})
            self.assertEqual(second["false_params"], {"Bypass_C": 0})

    def test_trace_adapter_accepts_single_input_object_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            trace = {
                "model": "GenericModel",
                "operators": [{
                    "id": "GenericModel:7",
                    "operator": "AND",
                    "ports": [{
                        "index": 1,
                        "trace": {
                            "kind": "logic",
                            "operator": "NOT",
                            "inputs": {
                                "index": 1,
                                "trace": {
                                    "kind": "subsystem_inport",
                                    "source": {"kind": "root_inport", "signal": "HvOnFail"},
                                },
                            },
                        },
                    }],
                }],
            }
            (work / "trace.json").write_text(json.dumps(trace), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "derive_logical_mcdc_mappings.py"),
                    "--traces",
                    str(work / "trace.json"),
                    "--output",
                    str(work / "mapping.json"),
                ],
                check=True,
            )
            port = json.loads((work / "mapping.json").read_text(encoding="utf-8"))["operators"][0]["ports"][0]
            self.assertEqual(port["true_inputs"], {"HvOnFail": 0})
            self.assertEqual(port["false_inputs"], {"HvOnFail": 1})

    def test_backfill_keeps_later_stable_steps_after_unstable_step(self) -> None:
        backfill = load_script_module("backfill_expected_outputs.py")
        action = "\n".join(
            [
                "[+0.02s] // start timer branch",
                "InputA = 1;",
                "[+6.3s] // timer expired",
                "[+0.1s]",
            ]
        )
        step_results = {
            1: {"outputs": {"OutA": 0}, "stable": {"OutA": False}},
            2: {"outputs": {"OutA": 1}, "stable": {"OutA": True}},
            3: {"outputs": {"OutA": 1}, "stable": {"OutA": True}},
        }

        rebuilt = backfill.build_action(action, step_results, ["OutA"])

        self.assertNotIn("OutA = expValue(0);", rebuilt)
        self.assertNotIn("OutA = expValue(0,0.01,0);", rebuilt)
        self.assertIn("[+6.3s] // timer expired\nOutA = expValue(1);", rebuilt)

    def test_backfill_requires_explicit_stability_and_skips_final_empty_delay(self) -> None:
        backfill = load_script_module("backfill_expected_outputs.py")
        action = "\n".join(
            [
                "[+6.3s] // timer is changing throughout this interval",
                "TimerEnable = 1;",
                "[+0.01s] // settled state",
                "OutA = expValue(999);",
                "[+0.1s]",
                "OutA = expValue(999);",
            ]
        )
        step_results = {
            # A missing stability verdict must not recreate the old timer oracle.
            1: {"outputs": {"OutA": 0.01}, "stable": {}},
            2: {"outputs": {"OutA": 1}, "stable": {"OutA": True}},
            3: {"outputs": {"OutA": 1}, "stable": {"OutA": True}},
        }

        rebuilt = backfill.build_action(action, step_results, ["OutA"])

        self.assertNotIn("OutA = expValue(0.01);", rebuilt)
        self.assertIn("[+0.01s] // settled state\nOutA = expValue(1);", rebuilt)
        self.assertTrue(rebuilt.endswith("[+0.1s]"))

    def test_simulation_requires_both_following_interval_endpoints_for_stability(self) -> None:
        timer_times = [0.01, 0.02]
        timer_values = [0.01, 0.02]
        duplicate_singleton_times = [0.02, 0.02]

        # MQTester compares the expectation at 0.02, so the timer change at
        # the right endpoint must make the complete 0.01 -> 0.02 interval
        # unstable. Duplicate samples at one instant remain insufficient.
        self.assertGreater(max(timer_values) - min(timer_values), 0)
        self.assertEqual(timer_times, [0.01, 0.02])
        self.assertEqual(len(set(duplicate_singleton_times)), 1)

        source = (SCRIPTS / "simulate_tcsd_cases.m").read_text(encoding="utf-8")

        self.assertIn(
            "following_interval_mask(vals.Time, intervalStart, intervalEnd, dt)",
            source,
        )
        self.assertIn("time <= (upperBound + timeTolerance)", source)
        self.assertIn("has_complete_interval_samples(", source)
        self.assertIn("hasDistinctTimes && hasStart && hasEnd", source)
        self.assertIn("stable.(signalName) = false;", source)

    def test_probe_obligations_distinguish_required_and_unreachable(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            probe = {
                "ModelA": {
                    "model": "ModelA",
                    "probes": [
                        {
                            "id": "ModelA:1",
                            "block_path": "ModelA/AND",
                            "sid": "ModelA:1",
                            "operator": "AND",
                            "port_names": ["u1", "u2"],
                        }
                    ],
                    "observations": [
                        {"test_id": "TC_001", "row": 6, "step_index": 1, "time_s": 1.0, "inputs": {"a": 1, "b": 1}, "params": {}, "vectors": {"x": {"id": "ModelA:1", "label": "TT", "ok": True}}},
                        {"test_id": "TC_002", "row": 7, "step_index": 1, "time_s": 1.0, "inputs": {"a": 0, "b": 1}, "params": {}, "vectors": {"x": {"id": "ModelA:1", "label": "FT", "ok": True}}},
                    ],
                }
            }
            overrides = [{"model": "ModelA", "operator_id": "ModelA:1", "label": "TF", "status": "unreachable", "reason": "structural coupling"}]
            (work / "probe.json").write_text(json.dumps(probe), encoding="utf-8")
            (work / "overrides.json").write_text(json.dumps(overrides), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "build_probe_mcdc_obligations.py"),
                    "--probe-results",
                    str(work / "probe.json"),
                    "--output-dir",
                    str(work),
                    "--unreachable-overrides",
                    str(work / "overrides.json"),
                ],
                check=True,
            )
            report = json.loads((work / "ModelA_coverage_obligations.json").read_text(encoding="utf-8"))
            self.assertEqual(report["summary"]["required_count"], 2)
            self.assertEqual(report["summary"]["unreachable_count"], 1)
            self.assertEqual(report["summary"]["unresolved_count"], 0)

    def test_augment_adds_mapped_missing_case_with_final_delay(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            spec = {
                "model_name": "ModelA",
                "test_group": {"id": "TG_001", "name": "Group"},
                "tests": [
                    {
                        "id": "TC_001",
                        "name": "Baseline",
                        "requirement_id": "REQ",
                        "description": "baseline",
                        "initialization": "a=1;\nb=1;\np Gain=2;",
                        "action": "[+1s]\n[+0.1s]",
                        "work_status": "reviewed",
                    }
                ],
            }
            obligations = {
                "obligations": [
                    {
                        "id": "ModelA:1_TF",
                        "status": "required",
                        "block_path": "ModelA/AND",
                        "required_outcome": "operator_input_vector=TF; output=false",
                        "match": {"inputs": {"a": 1, "b": 0}, "params": {"Gain": 3}},
                    }
                ]
            }
            validation = {"missing": [{"id": "ModelA:1_TF"}]}
            (work / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
            (work / "obligations.json").write_text(json.dumps(obligations), encoding="utf-8")
            (work / "validation.json").write_text(json.dumps(validation), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "augment_tcsd_for_mcdc.py"),
                    "--spec",
                    str(work / "spec.json"),
                    "--obligations",
                    str(work / "obligations.json"),
                    "--validation-report",
                    str(work / "validation.json"),
                    "--output",
                    str(work / "augmented.json"),
                ],
                check=True,
            )
            augmented = json.loads((work / "augmented.json").read_text(encoding="utf-8"))
            self.assertEqual(len(augmented["tests"]), 2)
            new_test = augmented["tests"][-1]
            self.assertIn("b=0;", new_test["initialization"])
            self.assertIn("p Gain=3;", new_test["initialization"])
            self.assertTrue(new_test["action"].strip().endswith("[+0.1s]"))

    def test_logical_mcdc_validator_counts_parameter_overrides(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            logical_ops = {
                "model": "ModelA",
                "operators": [
                    {
                        "id": "ModelA:AND1",
                        "block_path": "ModelA/AND1",
                        "operator": "AND",
                        "ports": [
                            {
                                "index": 1,
                                "source": "RootA",
                                "true_inputs": {"RootA": 1},
                                "false_inputs": {"RootA": 0},
                            },
                            {
                                "index": 2,
                                "source": "Constant Value RefuEndGearPShd_C",
                                "true_params": {"RefuEndGearPShd_C": 1},
                                "false_params": {"RefuEndGearPShd_C": 0},
                            },
                        ],
                    }
                ],
            }
            (work / "logical_ops.json").write_text(json.dumps(logical_ops), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "build_logical_mcdc_obligations.py"),
                    "--logical-operators",
                    str(work / "logical_ops.json"),
                    "--output",
                    str(work / "obligations.json"),
                ],
                check=True,
            )
            obligations = json.loads((work / "obligations.json").read_text(encoding="utf-8"))
            self.assertEqual(obligations["summary"]["required_count"], 3)
            self.assertIn(
                {"RefuEndGearPShd_C": 1},
                [item["match"]["params"] for item in obligations["obligations"]],
            )

            from openpyxl import Workbook

            workbook = Workbook()
            ws = workbook.active
            ws.title = "TCSD"
            ws.append(["TestID", "Name", "Type", "Requirement ID", "Test Case Description", "Initialization", "Action"])
            ws.append(
                [
                    "TC_001",
                    "Parameter MC/DC",
                    "Test",
                    "UT_MCDC",
                    "Covers AND vectors that require calibration override",
                    "RootA=1;\np RefuEndGearPShd_C=1;",
                    "[+0.1s]\nRootA=0;\n[+0.1s]\nRootA=1;\np RefuEndGearPShd_C=0;\n[+0.1s]",
                ]
            )
            workbook.save(work / "cases.xlsx")

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "validate_logical_mcdc_mapping.py"),
                    "--workbook",
                    str(work / "cases.xlsx"),
                    "--obligations",
                    str(work / "obligations.json"),
                    "--report-json",
                    str(work / "validation.json"),
                ],
                check=True,
            )
            validation = json.loads((work / "validation.json").read_text(encoding="utf-8"))
            self.assertEqual(validation["status"], "passed")
            self.assertEqual(validation["summary"]["missing_count"], 0)


if __name__ == "__main__":
    unittest.main()
