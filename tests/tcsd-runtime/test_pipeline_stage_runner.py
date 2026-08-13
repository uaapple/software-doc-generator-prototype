import importlib.util
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from openpyxl import Workbook

RUNTIME = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime"
SCRIPT = RUNTIME / "scripts" / "run_tcsd_pipeline_stage.py"
QUALITY_LOOP = RUNTIME / "scripts" / "run_tcsd_quality_loop.py"
SESSION_READER = RUNTIME / "scripts" / "read_hermes_session.py"
SESSION_RESOLVER = RUNTIME / "scripts" / "resolve_hermes_session.py"
SATK_SCRIPT = RUNTIME / "scripts" / "satk_eval.py"
REPAIR_SCRIPT = RUNTIME / "scripts" / "validate_agent_coverage_repair.py"
HOST_VALIDATOR_SCRIPT = RUNTIME / "scripts" / "host_validate_tcsd_stage.py"
SPEC = importlib.util.spec_from_file_location("run_tcsd_pipeline_stage", SCRIPT)
RUNNER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(RUNNER)
QUALITY_SPEC = importlib.util.spec_from_file_location("run_tcsd_quality_loop", QUALITY_LOOP)
QUALITY = importlib.util.module_from_spec(QUALITY_SPEC)
assert QUALITY_SPEC.loader
QUALITY_SPEC.loader.exec_module(QUALITY)
SATK_SPEC = importlib.util.spec_from_file_location("satk_eval", SATK_SCRIPT)
SATK = importlib.util.module_from_spec(SATK_SPEC)
assert SATK_SPEC.loader
SATK_SPEC.loader.exec_module(SATK)
REPAIR_SPEC = importlib.util.spec_from_file_location("validate_agent_coverage_repair", REPAIR_SCRIPT)
REPAIR = importlib.util.module_from_spec(REPAIR_SPEC)
assert REPAIR_SPEC.loader
REPAIR_SPEC.loader.exec_module(REPAIR)
HOST_VALIDATOR_SPEC = importlib.util.spec_from_file_location("host_validate_tcsd_stage", HOST_VALIDATOR_SCRIPT)
HOST_VALIDATOR = importlib.util.module_from_spec(HOST_VALIDATOR_SPEC)
assert HOST_VALIDATOR_SPEC.loader
HOST_VALIDATOR_SPEC.loader.exec_module(HOST_VALIDATOR)


class PipelineStageRunnerTests(unittest.TestCase):
    def test_stage7_initial_generation_budget_is_one_hundred(self):
        self.assertEqual(RUNNER.STAGE7_MAX_INITIAL_TESTS, 100)

    def test_stage7_skips_only_candidate_cases_with_missing_external_resources(self):
        probe = {
            "GenericModel": {
                "skipped_tests": [{
                    "row": 7,
                    "test_id": "TC_002",
                    "reason": "missing_external_resource",
                    "resource": "Calibration_C",
                    "expected_source": "task_mat_or_project_initialization",
                    "matlab_identifier": "MATLAB:UndefinedFunction",
                }],
            },
        }
        skips = RUNNER.initial_recipe_missing_resource_skips(
            probe,
            "GenericModel",
            {"TC_002"},
        )
        self.assertEqual(skips[0]["resource"], "Calibration_C")
        self.assertEqual(skips[0]["expectedSource"], "task_mat_or_project_initialization")
        spec = {
            "tests": [
                {"id": "TC_001", "name": "baseline"},
                {"id": "TC_002", "name": "candidate"},
                {"id": "TC_003", "name": "unaffected candidate"},
            ],
        }
        pruned = RUNNER.remove_initial_recipe_tests(spec, {"TC_002"})
        self.assertEqual([item["id"] for item in pruned["tests"]], ["TC_001", "TC_003"])
        synthesis = RUNNER.record_initial_recipe_resource_skips(
            {
                "input_test_count": 1,
                "output_test_count": 3,
                "added": 2,
                "skipped": [],
                "skipped_by_reason": {},
            },
            skips,
            2,
        )
        self.assertEqual(synthesis["added"], 1)
        self.assertEqual(synthesis["missing_external_resource_skipped_count"], 1)
        self.assertEqual(synthesis["missing_external_resources"], ["Calibration_C"])

        with self.assertRaisesRegex(RuntimeError, "non-candidate"):
            RUNNER.initial_recipe_missing_resource_skips(
                probe,
                "GenericModel",
                {"TC_003"},
            )

    def test_initial_recipe_probe_requires_every_planned_vector_to_be_observed(self):
        cases = {
            "schema": "tcsd-extracted-cases/v1",
            "model": "GenericModel",
            "tests": [
                {"test_id": "TC_001", "target": {}},
                {
                    "test_id": "TC_002",
                    "target": {
                        "coverage_item_id": "GenericModel:Gate_atomic_TF",
                        "operator_id": "GenericModel:Gate",
                        "expected_vector": [True, False],
                    },
                },
            ],
        }
        probe = {
            "GenericModel": {
                "schema": "simulink-ut-logical-mcdc-probe/v2",
                "observations": [
                    {"test_id": "TC_001", "prediction_status": "not_predicted"},
                    {"test_id": "TC_002", "prediction_status": "matched_prediction"},
                ],
            },
        }
        self.assertEqual(
            RUNNER.initial_recipe_probe_evidence(cases, probe, "GenericModel"),
            {
                "plannedCandidateCount": 1,
                "verifiedCandidateCount": 1,
                "observationCount": 2,
                "failedCandidateCount": 0,
            },
        )
        probe["GenericModel"]["observations"][1]["prediction_status"] = "simulation_mismatch"
        self.assertEqual(
            RUNNER.initial_recipe_probe_evidence(cases, probe, "GenericModel"),
            {
                "plannedCandidateCount": 1,
                "verifiedCandidateCount": 0,
                "observationCount": 2,
                "failedCandidateCount": 1,
            },
        )
        failures = RUNNER.initial_recipe_validation_failures(
            cases,
            probe,
            "GenericModel",
            {"TC_002"},
        )
        self.assertEqual(failures[0]["testId"], "TC_002")
        self.assertEqual(failures[0]["handoffStage"], 10)
        self.assertEqual(failures[0]["reason"], "simulation_mismatch")
        with self.assertRaisesRegex(RuntimeError, "non-candidate"):
            RUNNER.initial_recipe_validation_failures(cases, probe, "GenericModel", set())

    def test_case_extraction_attaches_coverage_vector_targets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workbook = root / "cases.xlsx"
            output = root / "cases.json"
            coverage_ir = root / "coverage-ir.json"
            wb = Workbook()
            ws = wb.active
            ws.title = "TCSD"
            for column, value in enumerate(
                ["TestID", "Name", "Type", "Requirement ID", "Test Case Description", "Initialization", "Action"],
                start=1,
            ):
                ws.cell(1, column).value = value
            ws.cell(2, 1).value = "TC_002"
            ws.cell(2, 2).value = "Boundary"
            ws.cell(2, 3).value = "Test"
            ws.cell(2, 5).value = "MC/DC supplemental case for GenericModel:Gate_atomic_TF; target"
            ws.cell(2, 6).value = "Input=1;"
            ws.cell(2, 7).value = "[+0.1s]"
            wb.save(workbook)
            coverage_ir.write_text(json.dumps({
                "items": [{
                    "id": "GenericModel:Gate_atomic_TF",
                    "block": {"sid": "GenericModel:Gate"},
                    "controlRecipe": {"condition_vector": "TF", "probe_vector_compatible": True},
                }],
            }), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(RUNTIME / "scripts" / "extract_tcsd_cases.py"),
                    "--workbook",
                    str(workbook),
                    "--model",
                    "GenericModel",
                    "--inputs",
                    "Input",
                    "--coverage-ir",
                    str(coverage_ir),
                    "--output",
                    str(output),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            extracted = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(extracted["schema"], "tcsd-extracted-cases/v1")
            self.assertEqual(extracted["model"], "GenericModel")
            self.assertEqual(extracted["tests"][0]["target"], {
                "coverage_item_id": "GenericModel:Gate_atomic_TF",
                "operator_id": "GenericModel:Gate",
                "expected_vector": [True, False],
            })

    def test_host_rebuilds_initial_recipe_probe_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            synthesis_path = root / "synthesis.json"
            cases_path = root / "cases.json"
            probe_path = root / "probe.json"
            synthesis_path.write_text(json.dumps({
                "schema": "simulink-ut-tcsd-coverage-ir-synthesis/v1",
                "added": 1,
            }), encoding="utf-8")
            cases_path.write_text(json.dumps({
                "schema": "tcsd-extracted-cases/v1",
                "model": "GenericModel",
                "tests": [{
                    "test_id": "TC_002",
                    "target": {
                        "coverage_item_id": "GenericModel:Gate_atomic_TF",
                        "operator_id": "GenericModel:Gate",
                        "expected_vector": [True, False],
                    },
                }],
            }), encoding="utf-8")
            probe_path.write_text(json.dumps({
                "schema": "simulink-ut-logical-mcdc-probe/v2",
                "model": "GenericModel",
                "observations": [{
                    "test_id": "TC_002",
                    "prediction_status": "matched_prediction",
                }],
            }), encoding="utf-8")
            expected = {
                "plannedCandidateCount": 1,
                "verifiedCandidateCount": 1,
                "observationCount": 1,
                "failedCandidateCount": 0,
                "unverifiedCandidateCount": 0,
            }
            request = {
                "workspaceDir": str(root),
                "artifacts": [
                    {"path": synthesis_path.name, "kind": "json"},
                    {"path": cases_path.name, "kind": "json"},
                    {"path": probe_path.name, "kind": "json"},
                ],
                "evidence": {"initialRecipeProbe": expected},
            }
            self.assertEqual(
                HOST_VALIDATOR.validate_initial_recipe_probe(request),
                {"initialRecipeProbe": expected},
            )
            request["evidence"]["initialRecipeProbe"]["verifiedCandidateCount"] = 0
            with self.assertRaisesRegex(ValueError, "does not match"):
                HOST_VALIDATOR.validate_initial_recipe_probe(request)

    def test_host_validates_initial_recipe_missing_resource_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            synthesis_path = root / "synthesis.json"
            cases_path = root / "cases.json"
            probe_path = root / "probe.json"
            gaps_path = root / "gaps.json"
            synthesis_path.write_text(json.dumps({
                "schema": "simulink-ut-tcsd-coverage-ir-synthesis/v1",
                "added": 1,
                "missing_external_resource_skipped_count": 1,
                "skipped": [{
                    "id": "TC_002",
                    "reason": "missing_external_resource",
                    "resource": "Calibration_C",
                    "expected_source": "task_mat_or_project_initialization",
                }],
            }), encoding="utf-8")
            cases_path.write_text(json.dumps({
                "schema": "tcsd-extracted-cases/v1",
                "model": "GenericModel",
                "tests": [{
                    "test_id": "TC_003",
                    "target": {
                        "operator_id": "GenericModel:Gate",
                        "expected_vector": [True, False],
                    },
                }],
            }), encoding="utf-8")
            probe_path.write_text(json.dumps({
                "GenericModel": {
                    "schema": "simulink-ut-logical-mcdc-probe/v2",
                    "model": "GenericModel",
                    "observations": [{
                        "test_id": "TC_003",
                        "prediction_status": "matched_prediction",
                    }],
                    "skipped_tests": [{
                        "test_id": "TC_002",
                        "reason": "missing_external_resource",
                        "resource": "Calibration_C",
                        "expected_source": "task_mat_or_project_initialization",
                    }],
                },
            }), encoding="utf-8")
            gaps_path.write_text(json.dumps({
                "schema": "tcsd-initial-recipe-resource-gaps/v1",
                "skippedCandidateCount": 1,
                "items": [{
                    "testId": "TC_002",
                    "reason": "missing_external_resource",
                    "resource": "Calibration_C",
                    "expectedSource": "task_mat_or_project_initialization",
                }],
            }), encoding="utf-8")
            request = {
                "workspaceDir": str(root),
                "artifacts": [
                    {"path": path.name, "kind": "json"}
                    for path in (synthesis_path, cases_path, probe_path, gaps_path)
                ],
                "evidence": {
                    "initialRecipeProbe": {
                        "plannedCandidateCount": 1,
                        "verifiedCandidateCount": 1,
                        "observationCount": 1,
                        "failedCandidateCount": 0,
                        "unverifiedCandidateCount": 0,
                    },
                },
            }
            details = HOST_VALIDATOR.validate_initial_recipe_probe(request)
            self.assertEqual(details["initialRecipeResourceGaps"], {
                "skippedCandidateCount": 1,
                "resources": ["Calibration_C"],
            })
            tampered = json.loads(gaps_path.read_text(encoding="utf-8"))
            tampered["items"][0]["resource"] = "Other_C"
            gaps_path.write_text(json.dumps(tampered), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "internally inconsistent"):
                HOST_VALIDATOR.validate_initial_recipe_probe(request)

    def test_host_validates_initial_recipe_simulation_mismatch_handoff(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            synthesis_path = root / "synthesis.json"
            cases_path = root / "cases.json"
            probe_path = root / "probe.json"
            gaps_path = root / "validation-gaps.json"
            failure = {
                "testId": "TC_002",
                "reason": "simulation_mismatch",
                "coverageItemId": "GenericModel:Gate_atomic_TF",
                "operatorId": "GenericModel:Gate",
                "expectedVector": [True, False],
                "observedVectors": ["TT"],
                "handoffStage": 10,
            }
            synthesis_path.write_text(json.dumps({
                "schema": "simulink-ut-tcsd-coverage-ir-synthesis/v1",
                "added": 0,
                "simulation_mismatch_skipped_count": 1,
                "skipped": [{
                    "id": failure["testId"],
                    "reason": failure["reason"],
                    "coverage_item_id": failure["coverageItemId"],
                    "operator_id": failure["operatorId"],
                    "expected_vector": failure["expectedVector"],
                    "observed_vectors": failure["observedVectors"],
                    "handoff_stage": failure["handoffStage"],
                }],
            }), encoding="utf-8")
            cases_path.write_text(json.dumps({
                "schema": "tcsd-extracted-cases/v1",
                "model": "GenericModel",
                "tests": [{
                    "test_id": "TC_002",
                    "target": {
                        "coverage_item_id": failure["coverageItemId"],
                        "operator_id": failure["operatorId"],
                        "expected_vector": failure["expectedVector"],
                    },
                }],
            }), encoding="utf-8")
            probe_path.write_text(json.dumps({
                "schema": "simulink-ut-logical-mcdc-probe/v2",
                "model": "GenericModel",
                "observations": [{
                    "test_id": "TC_002",
                    "prediction_status": "simulation_mismatch",
                    "vectors": {
                        "GenericModel_Gate": {
                            "id": "GenericModel:Gate",
                            "label": "TT",
                        },
                    },
                }],
            }), encoding="utf-8")
            gaps_path.write_text(json.dumps({
                "schema": "tcsd-initial-recipe-validation-gaps/v1",
                "skippedCandidateCount": 1,
                "handoffStage": 10,
                "items": [failure],
            }), encoding="utf-8")
            expected_probe = {
                "plannedCandidateCount": 1,
                "verifiedCandidateCount": 0,
                "observationCount": 1,
                "failedCandidateCount": 1,
                "unverifiedCandidateCount": 0,
            }
            request = {
                "workspaceDir": str(root),
                "artifacts": [
                    {"path": path.name, "kind": "json"}
                    for path in (synthesis_path, cases_path, probe_path, gaps_path)
                ],
                "evidence": {"initialRecipeProbe": expected_probe},
            }
            details = HOST_VALIDATOR.validate_initial_recipe_probe(request)
            self.assertEqual(details["initialRecipeProbe"], expected_probe)
            self.assertEqual(details["initialRecipeValidationGaps"], {
                "skippedCandidateCount": 1,
                "handoffStage": 10,
                "coverageItemIds": [failure["coverageItemId"]],
            })
            tampered = json.loads(gaps_path.read_text(encoding="utf-8"))
            tampered["items"][0]["observedVectors"] = ["FF"]
            gaps_path.write_text(json.dumps(tampered), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "internally inconsistent"):
                HOST_VALIDATOR.validate_initial_recipe_probe(request)

    def test_stage10_host_rebuild_uses_the_same_prior_planning_inputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "outputs"
            output.mkdir()
            coverage_path = output / "GenericModel_initial_coverage_summary.json"
            traces_path = output / "GenericModel_logical_traces.json"
            coverage_ir_path = output / "GenericModel_coverage_ir.json"
            synthesis_path = output / "GenericModel_coverage_ir_synthesis_iter0.json"
            interface_path = output / "GenericModel_interface.json"
            coverage = {
                "models": {
                    "GenericModel": {
                        "condition": {"covered": 1, "total": 2, "percent": 50},
                        "decision": {"covered": 1, "total": 2, "percent": 50},
                        "mcdc": {"covered": 1, "total": 2, "percent": 50},
                        "items": [{
                            "id": "remaining",
                            "coverage_class": "Condition",
                            "block_path": "GenericModel/Compare",
                            "missing_outcomes": ["equal boundary"],
                        }],
                    },
                },
            }
            traces = {"model": "GenericModel", "operators": []}
            coverage_ir = {
                "summary": {"executionReadiness": {"totalTargetCount": 3, "executableTargetCount": 1}},
                "items": [{
                    "id": "compare-equal",
                    "coverage_class": "Condition",
                    "block": {"path": "GenericModel/Compare", "sid": "GenericModel:1"},
                    "required_outcome": "equal boundary",
                    "patternType": "simple_comparator_boundary",
                    "controller": {"direct_inputs": {"InputVoltage": 320}, "parameters": {}},
                    "stimulus": {"steps": []},
                    "reachability": {"status": "required"},
                }],
            }
            synthesis = {
                "planned_candidate_count": 3,
                "added": 1,
                "duplicate_skipped_count": 2,
                "control_conflict_skipped_count": 0,
                "unresolved_threshold_skipped_count": 0,
            }
            interface = {"schema": "tcsd-model-interface/v1", "inputs": ["InputVoltage"], "outputs": ["Output"]}
            for path, value in (
                (coverage_path, coverage),
                (traces_path, traces),
                (coverage_ir_path, coverage_ir),
                (synthesis_path, synthesis),
                (interface_path, interface),
            ):
                path.write_text(json.dumps(value), encoding="utf-8")
            brief = REPAIR.build_brief(
                job_id="job-generic",
                model="GenericModel",
                coverage=coverage,
                traces=traces,
                coverage_ir_path=str(coverage_ir_path),
                coverage_report_path=str(coverage_path),
                trace_path=str(traces_path),
                interface_path=str(interface_path),
                threshold=80.0,
                coverage_ir=coverage_ir,
                initial_synthesis=synthesis,
            )
            request = {
                "jobId": "job-generic",
                "workspaceDir": str(root),
                "coverageThreshold": 80.0,
            }

            self.maxDiff = None
            self.assertEqual(HOST_VALIDATOR.rebuild_repair_brief(request, brief), brief)
            HOST_VALIDATOR.validate_repair_brief(request, brief)

            tampered = json.loads(json.dumps(brief))
            tampered["priorPlanning"]["stage7InitialGeneration"]["actualAddedCount"] = 2
            with self.assertRaisesRegex(ValueError, "does not match host-rebuilt"):
                HOST_VALIDATOR.validate_repair_brief(request, tampered)

    def test_stage10_brief_carries_prior_planning_and_avoids_identical_retries(self):
        brief = REPAIR.build_brief(
            job_id="job-generic",
            model="GenericModel",
            coverage={
                "models": {
                    "GenericModel": {
                        "condition": {"covered": 1, "total": 2, "percent": 50},
                        "decision": {"covered": 1, "total": 2, "percent": 50},
                        "mcdc": {"covered": 1, "total": 2, "percent": 50},
                        "items": [{
                            "id": "remaining",
                            "coverage_class": "Condition",
                            "block_path": "GenericModel/Compare",
                            "missing_outcomes": ["equal boundary"],
                        }],
                    },
                },
            },
            traces={"model": "GenericModel", "operators": []},
            coverage_ir_path="coverage-ir.json",
            coverage_report_path="coverage.json",
            trace_path="traces.json",
            interface_path="interface.json",
            threshold=80,
            coverage_ir={
                "summary": {"executionReadiness": {"totalTargetCount": 3, "executableTargetCount": 3}},
                "items": [{
                    "id": "compare-equal",
                    "coverage_class": "Condition",
                    "block": {"path": "GenericModel/Compare", "sid": "GenericModel:1"},
                    "required_outcome": "equal boundary",
                    "patternType": "simple_comparator_boundary",
                    "controller": {"direct_inputs": {"InputVoltage": 320}, "parameters": {}},
                    "stimulus": {"steps": []},
                    "reachability": {"status": "required"},
                }],
            },
            initial_synthesis={
                "planned_candidate_count": 3,
                "added": 3,
                "duplicate_skipped_count": 0,
                "control_conflict_skipped_count": 0,
                "unresolved_threshold_skipped_count": 0,
            },
        )

        prior = brief["priorPlanning"]
        self.assertEqual(prior["stage5ExecutionReadiness"]["executableTargetCount"], 3)
        self.assertEqual(prior["stage7InitialGeneration"]["actualAddedCount"], 3)
        self.assertEqual(prior["attemptedTargets"][0]["pattern_type"], "simple_comparator_boundary")
        self.assertEqual(
            prior["doNotRepeatIdenticalControllers"][0]["controller"]["direct_inputs"],
            {"InputVoltage": 320},
        )
        self.assertEqual(prior["measuredRemainingTargets"][0]["id"], "remaining")

    def test_session_resolver_uses_exact_prompt_hash_without_exposing_prompt(self):
        with tempfile.TemporaryDirectory() as temp:
            database = Path(temp) / "state.db"
            prompt = "/tcsd-stage-10-repair-coverage unique manifest path"
            with sqlite3.connect(database) as connection:
                connection.execute(
                    "create table messages (id integer primary key, session_id text, role text, content text)"
                )
                connection.execute(
                    "insert into messages values (1, ?, 'user', ?)",
                    ("session-stage10", prompt),
                )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SESSION_RESOLVER),
                    "--state-db",
                    str(database),
                    "--expected-skill-name",
                    "tcsd-stage-10-repair-coverage",
                    "--expected-prompt-sha256",
                    hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(json.loads(completed.stdout), {"sessionId": "session-stage10"})
            self.assertNotIn(prompt, completed.stdout)

    def test_agent_proposal_validation_failure_is_recoverable(self):
        error = RUNNER.RecoverableStageValidationError(
            "invalid proposal",
            Path("/tmp/proposal-validation.json"),
        )
        self.assertEqual(
            RUNNER.hard_error_code(10, error),
            "tcsd_stage_validation_failed",
        )

    def test_stage10_validator_crash_cannot_reuse_stale_attempt_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "outputs"
            output.mkdir()
            model = root / "GenericModel.slx"
            mat = root / "GenericModel.mat"
            model.write_bytes(b"slx")
            mat.write_bytes(b"mat")
            job = {
                "jobId": "job-generic",
                "_stageAttempt": 1,
                "_stageResultPath": str(output / "stage-10-result.json"),
                "resources": {"ownerJobId": "job-generic"},
                "input": {
                    "workspaceDir": str(root),
                    "outputDir": str(output),
                    "modelSlxPath": str(model),
                    "modelMatPath": str(mat),
                    "coverageThreshold": 80,
                },
            }
            RUNNER.write_json(
                RUNNER.state_path(job),
                {
                    "schema": "tcsd-stage-runner-state/v1",
                    "jobId": "job-generic",
                    "workbook": str(output / "GenericModel_Test0001_tcsd.xlsx"),
                    "spec": str(output / "GenericModel_tcsd_spec.json"),
                },
            )
            RUNNER.write_json(
                output / "GenericModel_initial_coverage_summary.json",
                {
                    "schema": "tcsd-coverage-report/v1",
                    "models": {
                        "GenericModel": {
                            metric: {"percent": 50}
                            for metric in ("condition", "decision", "mcdc")
                        },
                    },
                },
            )
            brief = output / "GenericModel_coverage_repair_brief.json"
            proposal = output / "GenericModel_agent_coverage_repair_proposal.json"
            brief.write_text("{}", encoding="utf-8")
            proposal.write_text("{}", encoding="utf-8")
            stale_ir = output / "GenericModel_agent_repair_coverage_ir.json"
            stale_report = output / "GenericModel_agent_repair_validation_attempt1.json"
            stale_ir.write_text('{"stale":true}', encoding="utf-8")
            RUNNER.write_json(
                stale_report,
                {
                    "schema": REPAIR.VALIDATION_SCHEMA,
                    "jobId": "job-generic",
                    "model": "GenericModel",
                    "passed": False,
                    "error": {
                        "code": "proposal_validation_failed",
                        "message": "stale deterministic failure",
                    },
                },
            )
            validator_crash = subprocess.CalledProcessError(
                1,
                ["python3", "validate_agent_coverage_repair.py"],
                stderr="validator crashed",
            )
            with mock.patch.object(RUNNER, "run", side_effect=validator_crash):
                with self.assertRaises(subprocess.CalledProcessError) as raised:
                    RUNNER.stage_run(
                        10,
                        job,
                        stage10_mode="validate",
                        repair_brief=str(brief),
                        repair_proposal=str(proposal),
                    )
            self.assertIs(raised.exception, validator_crash)
            self.assertEqual(
                RUNNER.hard_error_code(10, raised.exception),
                "tcsd_stage_runtime_failed",
            )
            self.assertFalse(stale_ir.exists())
            self.assertFalse(stale_report.exists())

    def test_agent_proposal_cli_writes_structured_failure_for_schema_and_json_errors(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            brief = root / "brief.json"
            interface = root / "interface.json"
            brief.write_text(
                json.dumps({
                    "schema": REPAIR.BRIEF_SCHEMA,
                    "jobId": "job-generic",
                    "model": "GenericModel",
                    "guardrails": {},
                }),
                encoding="utf-8",
            )
            interface.write_text(
                json.dumps({
                    "schema": "tcsd-model-interface/v1",
                    "inputs": ["Enable"],
                    "outputs": ["Output"],
                }),
                encoding="utf-8",
            )
            for label, proposal_text in (
                ("schema", json.dumps({"schema": "wrong/v1", "tests": [], "unresolved": []})),
                ("json", "{"),
            ):
                with self.subTest(label=label):
                    proposal = root / f"proposal-{label}.json"
                    report = root / f"report-{label}.json"
                    output_ir = root / f"ir-{label}.json"
                    proposal.write_text(proposal_text, encoding="utf-8")
                    completed = subprocess.run(
                        [
                            sys.executable,
                            "-B",
                            str(REPAIR_SCRIPT),
                            "validate",
                            "--brief",
                            str(brief),
                            "--proposal",
                            str(proposal),
                            "--interface",
                            str(interface),
                            "--output-ir",
                            str(output_ir),
                            "--report-json",
                            str(report),
                        ],
                        check=False,
                        capture_output=True,
                        text=True,
                    )
                    self.assertEqual(completed.returncode, 2)
                    failure = json.loads(report.read_text(encoding="utf-8"))
                    self.assertEqual(failure["schema"], REPAIR.VALIDATION_SCHEMA)
                    self.assertEqual(failure["jobId"], "job-generic")
                    self.assertEqual(failure["model"], "GenericModel")
                    self.assertFalse(failure["passed"])
                    self.assertEqual(
                        failure["error"]["code"],
                        "proposal_validation_failed",
                    )
                    self.assertFalse(output_ir.exists())

    def test_runtime_python_subprocesses_disable_bytecode_writes(self):
        command = [sys.executable, "sibling.py", "--check"]
        self.assertEqual(
            RUNNER.immutable_python_command(command),
            [sys.executable, "-B", "sibling.py", "--check"],
        )
        with mock.patch.object(QUALITY.subprocess, "run") as run_mock:
            QUALITY.run(command, cwd=RUNTIME)
        self.assertEqual(
            run_mock.call_args.args[0],
            [sys.executable, "-B", "sibling.py", "--check"],
        )

    def test_stage10_agent_repair_preserves_focused_temporal_stimulus(self):
        brief = {
            "schema": REPAIR.BRIEF_SCHEMA,
            "jobId": "job-generic",
            "model": "GenericModel",
            "repairRequired": True,
            "metricDeficits": [{"coverage_class": "Decision"}],
            "coverageTargets": [{
                "coverage_class": "Decision",
                "block": {"path": "GenericModel/Decision", "sid": "GenericModel:7"},
                "missing_outcomes": ["false branch after timeout"],
                "requires_model_inspection": False,
            }],
            "guardrails": {
                "maxCandidateTests": 16,
                "parametersOnlyInInitialization": True,
                "analyzeOnlyTargetUpstreamSlice": True,
                "fullRootInputEnumerationForbidden": True,
                "repairPassLimit": 1,
            },
        }
        proposal = {
            "schema": REPAIR.PROPOSAL_SCHEMA,
            "jobId": "job-generic",
            "model": "GenericModel",
            "tests": [{
                "id": "decision-timeout-false",
                "coverage_class": "Decision",
                "block": {"path": "GenericModel/Decision", "sid": "GenericModel:7"},
                "required_outcome": "false branch after timeout",
                "controller": {
                    "direct_inputs": {"Enable": 1},
                    "parameters": {"WaitThreshold": 3},
                },
                "stimulus": {
                    "initial_inputs": {"Enable": 0},
                    "initial_params": {"Bypass": 0},
                    "steps": [
                        {"delay_s": 0.1, "input_updates": {"Enable": 1}, "param_updates": {}},
                        {"delay_s": 0.3, "input_updates": {}, "param_updates": {}},
                    ],
                    "evidence_step": 2,
                },
                "analysis": {
                    "upstream_slice": ["GenericModel/Delay", "GenericModel/Decision"],
                    "rationale": "Enable is asserted, held across the threshold, and unrelated gates stay sensitized.",
                },
            }],
            "unresolved": [],
        }
        ir, report = REPAIR.validate_proposal(
            proposal,
            brief,
            {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
        )
        self.assertEqual(report["acceptedCandidateCount"], 1)
        self.assertEqual(ir["items"][0]["stimulus"]["evidence_step"], 2)
        self.assertEqual(ir["items"][0]["analysis"]["cumulative_wait_s"], 0.4)
        self.assertEqual(ir["items"][0]["controller"]["parameters"], {"Bypass": 0, "WaitThreshold": 3})

        proposal["tests"][0]["stimulus"]["steps"] = [
            {"delay_s": 0.01, "input_updates": {"Enable": index % 2}, "param_updates": {}}
            for index in range(12)
        ]
        proposal["tests"][0]["stimulus"]["evidence_step"] = 12
        unlimited_ir, _ = REPAIR.validate_proposal(
            proposal,
            brief,
            {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
        )
        self.assertEqual(len(unlimited_ir["items"][0]["stimulus"]["steps"]), 12)

        proposal["tests"][0]["required_outcome"] = "unmeasured true branch"
        with self.assertRaisesRegex(ValueError, "measured missing outcome"):
            REPAIR.validate_proposal(
                proposal,
                brief,
                {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
            )
        proposal["tests"][0]["required_outcome"] = "false branch after timeout"
        proposal["tests"][0]["stimulus"]["steps"][1]["param_updates"] = {"Bypass": 1}
        with self.assertRaisesRegex(ValueError, "only be set in initialization"):
            REPAIR.validate_proposal(
                proposal,
                brief,
                {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
            )

    def test_stage10_unresolved_requires_specific_reason_and_evidence(self):
        brief = {
            "schema": REPAIR.BRIEF_SCHEMA,
            "jobId": "job-generic",
            "model": "GenericModel",
            "repairRequired": True,
            "metricDeficits": [{"coverage_class": "Decision"}],
            "coverageTargets": [],
            "guardrails": {
                "maxCandidateTests": 16,
                "stepCountSemantics": "stimulus_action_entries",
                "simulationSamplePeriodsDoNotCountAsSteps": True,
                "longHoldAsSingleActionAllowed": True,
            },
        }
        proposal = {
            "schema": REPAIR.PROPOSAL_SCHEMA,
            "jobId": "job-generic",
            "model": "GenericModel",
            "tests": [],
            "unresolved": [{
                "coverage_class": "Decision",
                "block": {"path": "GenericModel/Decision", "sid": "GenericModel:7"},
                "reason_code": "state_sequence_not_constructible",
                "evidence": "The reset prerequisite is controlled by an unmodifiable literal.",
            }],
        }
        ir, report = REPAIR.validate_proposal(
            proposal,
            brief,
            {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
        )
        self.assertEqual(ir["summary"]["unresolved"], 1)
        self.assertEqual(report["unresolved"][0]["reason_code"], "state_sequence_not_constructible")
        proposal["unresolved"][0]["reason_code"] = "no_candidate"
        with self.assertRaisesRegex(ValueError, "specific allowed reason"):
            REPAIR.validate_proposal(
                proposal,
                brief,
                {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
            )

    def test_stage10_rejects_sample_period_count_as_action_step_limit(self):
        brief = {
            "schema": REPAIR.BRIEF_SCHEMA,
            "jobId": "job-counter",
            "model": "GenericCounter",
            "repairRequired": True,
            "metricDeficits": [{"coverage_class": "Decision"}],
            "coverageTargets": [{
                "coverage_class": "Decision",
                "block": {"path": "GenericCounter/MinMax", "sid": "GenericCounter:15"},
                "missing_outcomes": ["input 2"],
                "requires_model_inspection": False,
            }],
            "guardrails": {
                "maxCandidateTests": 16,
                "stepCountSemantics": "stimulus_action_entries",
                "simulationSamplePeriodsDoNotCountAsSteps": True,
                "longHoldAsSingleActionAllowed": True,
            },
        }
        proposal = {
            "schema": REPAIR.PROPOSAL_SCHEMA,
            "jobId": "job-counter",
            "model": "GenericCounter",
            "tests": [],
            "unresolved": [{
                "coverage_class": "Decision",
                "block": {"path": "GenericCounter/MinMax", "sid": "GenericCounter:15"},
                "reason_code": "state_sequence_not_constructible",
                "evidence": (
                    "The counter needs 65535 simulation sample steps, far exceeding "
                    "the 8-step per-test guardrail."
                ),
            }],
        }
        with self.assertRaisesRegex(ValueError, "sample periods as TCSD action steps"):
            REPAIR.validate_proposal(
                proposal,
                brief,
                {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
            )

        proposal["unresolved"][0]["evidence"] = (
            "A Unit Delay counter needs 65534 separate input transitions. "
            "Each transition maps to one TCSD stimulus.steps entry, while the "
            "allocated per-test entry budget is 8."
        )
        with self.assertRaisesRegex(ValueError, "sample periods as TCSD action steps"):
            REPAIR.validate_proposal(
                proposal,
                brief,
                {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
            )

    def test_stage10_accepts_long_hold_as_one_action_step(self):
        brief = {
            "schema": REPAIR.BRIEF_SCHEMA,
            "jobId": "job-counter",
            "model": "GenericCounter",
            "repairRequired": True,
            "metricDeficits": [{"coverage_class": "Decision"}],
            "coverageTargets": [{
                "coverage_class": "Decision",
                "block": {"path": "GenericCounter/MinMax", "sid": "GenericCounter:15"},
                "missing_outcomes": ["input 2"],
                "requires_model_inspection": False,
            }],
            "guardrails": {
                "maxCandidateTests": 16,
                "stepCountSemantics": "stimulus_action_entries",
                "simulationSamplePeriodsDoNotCountAsSteps": True,
                "longHoldAsSingleActionAllowed": True,
            },
        }
        proposal = {
            "schema": REPAIR.PROPOSAL_SCHEMA,
            "jobId": "job-counter",
            "model": "GenericCounter",
            "tests": [{
                "id": "counter-input2",
                "coverage_class": "Decision",
                "block": {"path": "GenericCounter/MinMax", "sid": "GenericCounter:15"},
                "required_outcome": "input 2",
                "controller": {"direct_inputs": {"Enable": 1}, "parameters": {}},
                "stimulus": {
                    "initial_inputs": {"Enable": 1},
                    "initial_params": {},
                    "steps": [{"delay_s": 655.36, "input_updates": {}, "param_updates": {}}],
                    "evidence_step": 1,
                },
                "analysis": {
                    "upstream_slice": [
                        "GenericCounter/MinMax",
                        "GenericCounter/Sum",
                        "GenericCounter/Unit Delay",
                    ],
                    "rationale": (
                        "A 0.01 second sample time needs 65536 sample periods, "
                        "represented by one finite hold action."
                    ),
                },
            }],
            "unresolved": [],
        }
        ir, report = REPAIR.validate_proposal(
            proposal,
            brief,
            {"schema": "tcsd-model-interface/v1", "inputs": ["Enable"], "outputs": ["Output"]},
        )
        self.assertEqual(report["acceptedCandidateCount"], 1)
        self.assertEqual(len(ir["items"][0]["stimulus"]["steps"]), 1)
        self.assertEqual(ir["items"][0]["analysis"]["cumulative_wait_s"], 655.36)

    def test_satk_server_discovery_priority_is_cross_platform_and_deterministic(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / "home"
            toolkit_bin = home / ".matlab" / "agentic-toolkits" / "bin"
            repository = root / "repository"
            script_file = repository / "skills" / "hermes" / "tcsd-runtime" / "scripts" / "satk_eval.py"
            toolkit_bin.mkdir(parents=True)
            (repository / "tools").mkdir(parents=True)
            official = toolkit_bin / "matlab-mcp-server"
            legacy = toolkit_bin / "matlab-mcp-core-server"
            tools_legacy = repository / "tools" / "matlab-mcp-core-server"
            explicit = root / "explicit-mcp"
            for candidate in (official, legacy, tools_legacy, explicit):
                candidate.write_bytes(candidate.name.encode("utf-8"))

            selected, source = SATK.resolve_server(
                environ={"SATK_MCP_SERVER": str(explicit)},
                home=home,
                cwd=root,
                script_file=script_file,
                platform_name="Darwin",
            )
            self.assertEqual((selected, source), (explicit.resolve(), "environment"))

            selected, source = SATK.resolve_server(
                environ={},
                home=home,
                cwd=root,
                script_file=script_file,
                platform_name="Darwin",
            )
            self.assertEqual((selected, source), (official.resolve(), "official-toolkit"))
            official.unlink()
            selected, source = SATK.resolve_server(
                environ={},
                home=home,
                cwd=root,
                script_file=script_file,
                platform_name="Darwin",
            )
            self.assertEqual((selected, source), (legacy.resolve(), "legacy-toolkit"))
            legacy.unlink()
            selected, source = SATK.resolve_server(
                environ={},
                home=home,
                cwd=root,
                script_file=script_file,
                platform_name="Darwin",
            )
            self.assertEqual((selected, source), (tools_legacy.resolve(), "repository-tools-legacy"))
            self.assertEqual(
                SATK.server_binary_names("Windows"),
                ("matlab-mcp-server.exe", "matlab-mcp-core-server.exe"),
            )

    def test_satk_runner_treats_tool_result_is_error_as_failure(self):
        self.assertTrue(SATK.mcp_response_failed({"error": {"code": -1}}))
        self.assertTrue(SATK.mcp_response_failed({"result": {"isError": True, "content": []}}))
        self.assertFalse(SATK.mcp_response_failed({"result": {"isError": False, "content": []}}))

    def test_stage02_extracts_public_mcp_error_from_satk_failure(self):
        response = json.dumps({
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "isError": True,
                "content": [{
                    "type": "text",
                    "text": "failed to attach to MATLAB session",
                }],
            },
        })
        failure = subprocess.CalledProcessError(
            1,
            ["python3", "satk_eval.py", "canary.m"],
            output=response,
            stderr="",
        )
        with mock.patch.object(RUNNER.subprocess, "run", side_effect=failure):
            with self.assertRaisesRegex(
                RuntimeError,
                r"Stage 02 environment gate failed: SATK/MCP failed: failed to attach to MATLAB session",
            ):
                RUNNER.run_satk(
                    ["python3", "satk_eval.py", "canary.m"],
                    Path("/tmp"),
                    stage=2,
                    context="environment gate failed",
                )

    def test_quality_satk_runner_preserves_gateway_failure_details(self):
        response = json.dumps({
            "jsonrpc": "2.0",
            "id": 2,
            "error": {
                "code": "MATLAB_EXECUTION_FAILED",
                "message": "probe failed token=must-not-appear at C:/secret/model.slx",
                "data": {
                    "gatewayJobId": "eval-safe-job",
                    "gatewayStatus": "failed",
                    "timeoutSeconds": 2400,
                },
            },
        })
        completed = subprocess.CompletedProcess(
            ["python3", "satk_eval.py", "probe.m"],
            1,
            stdout=response,
            stderr="",
        )
        with mock.patch.object(QUALITY.subprocess, "run", return_value=completed):
            with self.assertRaises(QUALITY.SatkEvaluationError) as raised:
                QUALITY.run_satk(
                    "python3",
                    Path("/skills/tcsd-runtime/scripts"),
                    Path("/workspace/outputs/probe.m"),
                    Path("/workspace"),
                )
        self.assertNotIn("must-not-appear", str(raised.exception))
        self.assertNotIn("C:/secret", str(raised.exception))
        self.assertIn("token=[REDACTED]", str(raised.exception))
        self.assertIn("[path]", str(raised.exception))
        self.assertEqual(
            raised.exception.details,
            {
                "phase": "matlab_probe_evaluation",
                "satkExitCode": 1,
                "gatewayErrorCode": "MATLAB_EXECUTION_FAILED",
                "gatewayJobId": "eval-safe-job",
                "gatewayStatus": "failed",
                "timeoutSeconds": 2400.0,
            },
        )

    def test_quality_satk_runner_injects_stage_probe_timeout(self):
        completed = subprocess.CompletedProcess(
            ["python3", "satk_eval.py", "probe.m"],
            0,
            stdout="",
            stderr="",
        )
        with mock.patch.object(QUALITY.subprocess, "run", return_value=completed) as run_mock:
            QUALITY.run_satk(
                "python3",
                Path("/skills/tcsd-runtime/scripts"),
                Path("/workspace/outputs/probe.m"),
                Path("/workspace"),
                gateway_timeout_seconds=2710,
            )
        self.assertEqual(
            run_mock.call_args.kwargs["env"]["SATK_GATEWAY_TIMEOUT_SECONDS"],
            "2710",
        )

    def test_stage6_probe_timeout_scales_with_candidates_and_is_bounded(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(RUNNER.stage6_probe_timeout_seconds(0), 600)
            self.assertEqual(RUNNER.stage6_probe_timeout_seconds(422), 2710)
            self.assertEqual(RUNNER.stage6_probe_timeout_seconds(1000), 3600)
        with mock.patch.dict(
            os.environ,
            {"SATK_GATEWAY_TIMEOUT_SECONDS": "3000"},
            clear=True,
        ):
            self.assertEqual(RUNNER.stage6_probe_timeout_seconds(100), 3000)

    def test_stage11_probe_timeout_scales_with_final_cases_and_is_bounded(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(RUNNER.stage11_probe_timeout_seconds(0), 600)
            self.assertEqual(RUNNER.stage11_probe_timeout_seconds(38), 1740)
            self.assertEqual(RUNNER.stage11_probe_timeout_seconds(100), 3600)
        with mock.patch.dict(
            os.environ,
            {"SATK_GATEWAY_TIMEOUT_SECONDS": "2400"},
            clear=True,
        ):
            self.assertEqual(RUNNER.stage11_probe_timeout_seconds(38), 2400)

    def test_stage11_passes_case_scaled_timeout_to_final_coverage_probe(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            output = root / "outputs"
            output.mkdir()
            model = root / "GenericModel.slx"
            mat = root / "GenericModel.mat"
            workbook = output / "GenericModel_Test0001_tcsd.xlsx"
            spec = output / "GenericModel_tcsd_spec.json"
            model.write_bytes(b"slx")
            mat.write_bytes(b"mat")
            Workbook().save(workbook)
            RUNNER.write_json(spec, {"tests": []})
            RUNNER.write_json(output / "GenericModel_interface.json", {"outputs": []})
            RUNNER.write_json(
                output / ".tcsd-runtime" / "runner-state.json",
                {
                    "repairApplied": True,
                    "workbook": str(workbook),
                    "spec": str(spec),
                },
            )
            result_path = output / ".tcsd-results" / "stage-11.json"
            job = {
                "jobId": "job-stage11-timeout",
                "_stageResultPath": str(result_path),
                "input": {
                    "workspaceDir": str(root),
                    "outputDir": str(output),
                    "modelSlxPath": str(model),
                    "modelMatPath": str(mat),
                    "projectInitScripts": [],
                    "coverageThreshold": 80,
                },
            }
            quality = mock.Mock()

            def extract_cases(**_kwargs):
                cases = output / "GenericModel_cases.json"
                RUNNER.write_json(cases, {"tests": [{"test_id": index} for index in range(38)]})
                return cases

            def simulate_and_backfill(**_kwargs):
                simulation = output / "GenericModel_final_simulation_results.json"
                RUNNER.write_json(simulation, {"tests": []})
                return simulation

            def run_probe(**_kwargs):
                obligations = output / "GenericModel_coverage_obligations.json"
                coverage = output / "GenericModel_coverage_summary.json"
                RUNNER.write_json(obligations, {"obligations": []})
                RUNNER.write_json(coverage, {})
                return obligations, coverage

            quality.extract_cases.side_effect = extract_cases
            quality.simulate_and_backfill.side_effect = simulate_and_backfill
            quality.run_probe.side_effect = run_probe
            with (
                mock.patch.object(RUNNER, "load_module", return_value=quality),
                mock.patch.object(
                    RUNNER,
                    "simulation_backfill_evidence",
                    return_value={"workbookBackfillCount": 1266},
                ),
                mock.patch.dict(os.environ, {}, clear=True),
            ):
                RUNNER.stage_run(11, job)
            self.assertEqual(
                quality.run_probe.call_args.kwargs["gateway_timeout_seconds"],
                1740,
            )
            result = RUNNER.read_json(result_path)
            self.assertEqual(result["evidence"]["caseCount"], 38)
            self.assertEqual(result["evidence"]["probeTimeoutSeconds"], 1740)

    def test_stage_runtime_error_details_are_strictly_allowlisted(self):
        error = RuntimeError("failed")
        error.details = {
            "phase": "matlab_probe_evaluation",
            "gatewayErrorCode": "MATLAB_EXECUTION_FAILED",
            "gatewayJobId": "eval-safe-job",
            "gatewayStatus": "failed",
            "satkExitCode": 1,
            "timeoutSeconds": 2400,
            "candidateCount": 3,
            "caseCount": 38,
            "batchIndex": 2,
            "batchCount": 6,
            "batchCandidateCount": 64,
            "batchStart": 65,
            "batchEnd": 128,
            "diagnosticArtifactFileName": "GenericModel_state_probe_batch_002_results.error.json",
            "probeEntryExists": True,
            "probePlanSha256": "a" * 64,
            "probeEntrySha256": "b" * 64,
            "token": "must-not-appear",
            "path": "C:/secret/model.slx",
        }
        details = RUNNER.public_error_details(error)
        self.assertEqual(details["gatewayJobId"], "eval-safe-job")
        self.assertEqual(details["candidateCount"], 3)
        self.assertEqual(details["caseCount"], 38)
        self.assertEqual(details["batchIndex"], 2)
        self.assertEqual(details["batchEnd"], 128)
        self.assertEqual(
            details["diagnosticArtifactFileName"],
            "GenericModel_state_probe_batch_002_results.error.json",
        )
        self.assertEqual(details["probePlanSha256"], "a" * 64)
        self.assertNotIn("token", details)
        self.assertNotIn("path", details)

    def test_stage02_matlab_root_falls_back_to_satk_root(self):
        with mock.patch.dict(
            os.environ,
            {"SATK_MATLAB_ROOT": "/Applications/MATLAB_R2026a.app"},
            clear=True,
        ):
            self.assertEqual(
                RUNNER.matlab_root_path({"matlabRoot": "/ignored/input/root"}),
                Path("/Applications/MATLAB_R2026a.app"),
            )

    def test_public_stage_error_redacts_credentials(self):
        self.assertEqual(
            RUNNER.public_error_text("failed password=visible token: also-visible"),
            "failed password=[REDACTED] token: [REDACTED]",
        )

    def test_planning_mapping_gaps_are_advisory_and_superseded_by_measured_coverage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            obligations = root / "outputs" / "GenericModel_planning_obligations_snapshot.json"
            obligations.parent.mkdir()
            obligations.write_text('{"obligations":[]}', encoding="utf-8")
            assessment = RUNNER.planning_mapping_assessment(
                {
                    "status": "failed",
                    "summary": {"missing_count": 3, "unresolved_count": 1},
                    "missing": [{"id": "generic-obligation"}],
                },
                obligations,
                root,
            )
            self.assertEqual(assessment["schema"], "tcsd-planning-mapping-assessment/v1")
            self.assertEqual(assessment["status"], "advisory")
            self.assertEqual(assessment["assessment"], "gaps-observed")
            self.assertFalse(assessment["blocking"])
            self.assertNotEqual(assessment["status"], "failed")
            self.assertEqual(assessment["supersededBy"]["stageIndex"], 9)
            self.assertEqual(assessment["supersededBy"]["authority"], "measured-simulink-coverage")
            self.assertEqual(assessment["sourceObligations"]["sha256"], hashlib.sha256(obligations.read_bytes()).hexdigest())

    def test_hermes_session_reader_reports_actual_model_and_token_usage(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            database = Path(temp) / "state.db"
            skill_file = temp_path / "SKILL.md"
            usage_file = temp_path / ".usage.json"
            skill_source = b"---\r\nname: tcsd-stage-01-validate-inputs\r\n---\r\n\r\n# Stage 1\r\n"
            skill_file.write_bytes(skill_source)
            usage_file.write_text(
                json.dumps(
                    {
                        "tcsd-stage-01-validate-inputs": {
                            "use_count": 3,
                            "last_used_at": "2026-07-24T11:34:05+00:00",
                        }
                    }
                ),
                encoding="utf-8",
            )
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    """
                    create table sessions (
                      id text primary key,
                      model text,
                      input_tokens integer,
                      output_tokens integer,
                      cache_read_tokens integer,
                      cache_write_tokens integer,
                      reasoning_tokens integer
                    )
                    """
                )
                connection.execute(
                    "insert into sessions values (?, ?, ?, ?, ?, ?, ?)",
                    ("session-actual", "provider/model-v2", 100, 20, 5, 2, 7),
                )
                connection.execute(
                    """
                    create table messages (
                      id integer primary key autoincrement,
                      session_id text,
                      role text,
                      content text,
                      timestamp real
                    )
                    """
                )
                connection.execute(
                    "insert into messages(session_id, role, content, timestamp) values (?, ?, ?, ?)",
                    (
                        "session-actual",
                        "user",
                        "/tcsd-stage-01-validate-inputs execute stage one",
                        1.0,
                    ),
                )
                connection.commit()
            finally:
                connection.close()
            result = subprocess.run(
                [
                    sys.executable,
                    str(SESSION_READER),
                    "--state-db",
                    str(database),
                    "--session-id",
                    "session-actual",
                    "--expected-skill-name",
                    "tcsd-stage-01-validate-inputs",
                    "--expected-skill-file",
                    str(skill_file),
                    "--expected-skill-sha256",
                    hashlib.sha256(skill_source).hexdigest(),
                    "--skill-usage-file",
                    str(usage_file),
                    "--expected-use-count-before",
                    "2",
                    "--invocation-started-at",
                    "2026-07-24T11:34:00Z",
                    "--invocation-ended-at",
                    "2026-07-24T11:34:10Z",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            usage = json.loads(result.stdout)
            self.assertEqual(usage["model"], "provider/model-v2")
            self.assertEqual(usage["totalTokens"], 127)
            self.assertEqual(usage["reasoningTokens"], 7)
            self.assertTrue(usage["skillLoad"]["loaded"])
            self.assertEqual(usage["skillLoad"]["source"], "hermes-state-db+skill-usage")
            self.assertEqual(usage["skillLoad"]["usageCountBefore"], 2)
            self.assertEqual(usage["skillLoad"]["usageCountAfter"], 3)

    def test_first_three_stages_write_candidate_results_but_not_host_checkpoints(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "outputs"
            model = root / "GenericModel.slx"
            mat = root / "GenericModel.mat"
            model.write_bytes(b"slx")
            mat.write_bytes(b"mat")
            job = {
                "jobId": "job-generic",
                "events": [],
                "resources": {"ownerJobId": "job-generic"},
                "input": {
                    "workspaceDir": str(root),
                    "outputDir": str(output),
                    "modelSlxPath": str(model),
                    "modelMatPath": str(mat),
                    "projectAddonCopy": {"copiedFileCount": 0},
                },
            }
            fake_matlab_root = root / "fake-matlab"
            (fake_matlab_root / "bin").mkdir(parents=True)
            fake_matlab_executable = "matlab.exe" if os.name == "nt" else "matlab"
            (fake_matlab_root / "bin" / fake_matlab_executable).write_text(
                "fixture",
                encoding="utf-8",
            )
            fake_mcp_server = root / "fake-matlab-mcp-server"
            fake_mcp_server.write_bytes(b"offline MCP fixture")
            job["input"]["matlabRoot"] = str(fake_matlab_root)
            environment_fixture = root / "environment-fixture.json"
            nonce = "offline-fixture-nonce"
            environment_fixture.write_text(json.dumps({
                "schema": "tcsd-environment-gate/v2",
                "jobId": "job-generic",
                "nonce": nonce,
                "matlabRoot": str(fake_matlab_root),
                "python": sys.executable,
                "runner": str(SATK_SCRIPT),
                "pythonDependencies": {
                    "passed": True,
                    "modules": {
                        "yaml": {"version": "6.0.3"},
                        "openpyxl": {"version": "3.1.5"},
                    },
                },
                "workspaceIo": {"passed": True, "created": True, "readMatched": True, "deleted": True},
                "matlab": {"passed": True, "nonce": nonce, "version": "R2026a"},
                "simulink": {
                    "passed": True,
                    "licenseAvailable": True,
                    "loaded": True,
                    "version": "R2026a",
                },
                "satkMcp": {
                    "passed": True,
                    "runner": str(SATK_SCRIPT),
                    "server": {
                        "path": str(fake_mcp_server),
                        "discovery": "offline-test-fixture",
                        "sha256": hashlib.sha256(fake_mcp_server.read_bytes()).hexdigest(),
                        "sizeBytes": fake_mcp_server.stat().st_size,
                    },
                    "sentinelWritten": True,
                    "nonceMatched": True,
                },
                "passed": True,
            }), encoding="utf-8")
            old = os.environ.get("TCSD_PIPELINE_ENV_CANARY_FIXTURE")
            old_setup = os.environ.get("TCSD_PIPELINE_SETUP_FIXTURE")
            os.environ["TCSD_PIPELINE_ENV_CANARY_FIXTURE"] = str(environment_fixture)
            os.environ["TCSD_PIPELINE_SETUP_FIXTURE"] = "1"
            try:
                for stage in (1, 2, 3):
                    result_path = output / ".tcsd-results" / f"stage-{stage:02d}.json"
                    job["_stageResultPath"] = str(result_path)
                    RUNNER.stage_run(stage, job)
                    result = json.loads(result_path.read_text(encoding="utf-8"))
                    self.assertEqual(result["schema"], "tcsd-agent-stage-result/v1")
                    self.assertEqual(result["jobId"], "job-generic")
                    self.assertEqual(result["stageIndex"], stage)
                    self.assertTrue(result["artifacts"])
                    self.assertFalse((output / ".tcsd-checkpoints").exists())
                resources = json.loads((output / ".tcsd-runtime" / "owned-resources.json").read_text(encoding="utf-8"))
                self.assertEqual(resources["jobId"], "job-generic")
                initialized = json.loads((output / ".tcsd-evidence" / "workspace-initialization.json").read_text(encoding="utf-8"))
                self.assertEqual(initialized["schema"], "tcsd-workspace-initialization/v1")
                self.assertTrue(initialized["completed"])
            finally:
                if old is None:
                    os.environ.pop("TCSD_PIPELINE_ENV_CANARY_FIXTURE", None)
                else:
                    os.environ["TCSD_PIPELINE_ENV_CANARY_FIXTURE"] = old
                if old_setup is None:
                    os.environ.pop("TCSD_PIPELINE_SETUP_FIXTURE", None)
                else:
                    os.environ["TCSD_PIPELINE_SETUP_FIXTURE"] = old_setup

    def test_single_input_output_interface_is_not_split_into_characters(self):
        interface = RUNNER.validate_interface({"schema": "tcsd-model-interface/v1", "inputs": ["OnlyInput"], "outputs": ["OnlyOutput"]})
        spec = RUNNER.initial_spec({"inputs": "OnlyInput", "outputs": "OnlyOutput"}, "GenericModel")
        self.assertEqual(interface["inputs"], ["OnlyInput"])
        self.assertEqual(spec["tests"][0]["initialization"], "OnlyInput=0;")
        self.assertEqual(
            spec["tests"][0]["action"],
            "[+0.01s]\nOnlyInput=0;\n[+0.1s]",
        )
        self.assertEqual(len(RUNNER.workbook_steps(spec["tests"][0]["action"])), 2)
        self.assertNotIn("output_reference", spec["tests"][0])
        with self.assertRaises(RuntimeError):
            RUNNER.validate_interface({"schema": "tcsd-model-interface/v1", "inputs": "OnlyInput", "outputs": ["OnlyOutput"]})

    def test_execution_controls_are_separate_from_business_inputs(self):
        interface = RUNNER.validate_interface({
            "schema": "tcsd-model-interface/v1",
            "inputs": ["BusinessInput"],
            "outputs": ["Output"],
            "executionControls": [{
                "name": "Enable",
                "type": "enable",
                "defaultPolicy": "enabled",
            }],
        })
        spec = RUNNER.initial_spec(interface, "GenericModel")
        self.assertEqual(interface["inputs"], ["BusinessInput"])
        self.assertEqual(interface["executionControls"][0]["name"], "Enable")
        self.assertNotIn("Enable=", spec["tests"][0]["initialization"])
        self.assertEqual(spec["test_group"]["initialization_1"], "Enable=1;")

    def test_stage_four_initializes_its_new_session_before_tracing(self):
        code = RUNNER.stage4_matlab_code(root=Path("C:/job"), scripts_dir=Path("C:/skill/scripts"), interface=Path("C:/job/outputs/interface.json"), model="GenericModel", mat_name="GenericModel.mat", init_scripts=["project_init.m"])
        setup = code.index("setup_ut_support(rootDir,initScripts)")
        trace = code.index("trace_logical_mcdc")
        self.assertIn("initScripts={'project_init.m'}", code)
        self.assertIn("'WorkspaceInitialized',true", code)
        self.assertIn("'BlockType','EnablePort'", code)
        self.assertIn("p.executionControls=controls", code)
        self.assertLess(setup, trace)

    def test_simulation_backfill_requires_matching_real_result_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            workbook = Path(temp) / "result.xlsx"
            wb = Workbook(); ws = wb.active; ws.title = "TCSD"; ws["A3"] = "TC_001"; ws["C3"] = "Test"; ws["G3"] = "[+0.1s]\nOnlyOutput = expValue(1);\n[+0.1s]"; wb.save(workbook)
            simulation = {"tests": [{"row": 3, "test_id": "TC_001", "steps": [{"index": 1, "outputs": {"OnlyOutput": 1}, "stable": {"OnlyOutput": True}}, {"index": 2, "outputs": {"OnlyOutput": 1}, "stable": {"OnlyOutput": True}}]}]}
            evidence = RUNNER.simulation_backfill_evidence(simulation, workbook)
            self.assertEqual(evidence["simulationValueCount"], 1)
            self.assertEqual(evidence["workbookBackfillCount"], 1)
            self.assertEqual(evidence["testCaseCount"], 1)
            self.assertEqual(evidence["testsWithoutExpectedValues"], [])
            self.assertEqual(evidence["caseOutputCounts"], {"3:TC_001": {"OnlyOutput": 1}})
            self.assertEqual(evidence["backfillItems"], [{"row": 3, "testId": "TC_001", "step": 1, "output": "OnlyOutput", "value": 1.0}])
            with self.assertRaises(RuntimeError):
                RUNNER.simulation_backfill_evidence({"tests": []}, workbook)

    def test_simulation_backfill_requires_explicit_stability_and_an_oracle_per_test(self):
        with tempfile.TemporaryDirectory() as temp:
            workbook = Path(temp) / "result.xlsx"
            wb = Workbook()
            ws = wb.active
            ws.title = "TCSD"
            ws["A3"] = "TC_001"
            ws["C3"] = "Test"
            ws["G3"] = "[+0.1s]\n[+0.1s]"
            wb.save(workbook)
            simulation = {
                "tests": [{
                    "row": 3,
                    "test_id": "TC_001",
                    "steps": [
                        {"index": 1, "outputs": {"OnlyOutput": 1}, "stable": {}},
                        {"index": 2, "outputs": {"OnlyOutput": 1}, "stable": {"OnlyOutput": True}},
                    ],
                }]
            }

            with self.assertRaisesRegex(RuntimeError, r"no verified expValue for Test cases: TC_001"):
                RUNNER.simulation_backfill_evidence(simulation, workbook)

    def test_simulation_backfill_rejects_missing_extra_and_wrong_values(self):
        with tempfile.TemporaryDirectory() as temp:
            workbook = Path(temp) / "result.xlsx"; wb = Workbook(); ws = wb.active; ws.title = "TCSD"; ws["A4"] = "TC_002"; ws["C4"] = "Test"
            simulation = {"tests": [{"row": 4, "test_id": "TC_002", "steps": [{"index": 1, "outputs": {"Result": 2.5}, "stable": {"Result": True}}]}]}
            for action in ("[+0.1s]", "[+0.1s]\nResult = expValue(2.5);\nExtra = expValue(1);", "[+0.1s]\nResult = expValue(2.4);"):
                ws["G4"] = action; wb.save(workbook)
                with self.assertRaises(RuntimeError): RUNNER.simulation_backfill_evidence(simulation, workbook)

    def test_stage_five_to_six_cli_persists_unresolved_then_runs_probe(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); output = root / "outputs"; output.mkdir()
            model = root / "GenericModel.slx"; mat = root / "GenericModel.mat"; model.write_bytes(b"slx"); mat.write_bytes(b"mat")
            trace = {
                "schema": "simulink-ut-logical-mcdc-trace/v2", "model": "GenericModel", "operator_count": 1,
                "operators": [{"id": "GenericModel:1", "sid": "GenericModel:1", "block_path": "GenericModel/Decision", "operator": "AND", "ports": [
                    {"index": 1, "trace": {"kind": "relational", "operator": ">", "inputs": [{"trace": {"kind": "stateful", "block_type": "UnitDelay", "inputs": [{"trace": {"kind": "root_inport", "signal": "Enable"}}]}}, {"trace": {"kind": "constant", "value": "0"}}]}},
                    {"index": 2, "trace": {"kind": "root_inport", "signal": "Request"}},
                ]}],
            }
            (output / "GenericModel_logical_traces.json").write_text(json.dumps(trace), encoding="utf-8")
            probe = {"GenericModel": {"schema": "simulink-ut-logical-mcdc-probe/v2", "model": "GenericModel", "probes": [{"id": "GenericModel:1", "sid": "GenericModel:1", "block_path": "GenericModel/Decision", "operator": "AND", "port_names": ["u1", "u2"]}], "observations": []}}
            for index, label in enumerate(("TT", "FT", "TF"), 1):
                probe["GenericModel"]["observations"].append({"test_id": f"STATE_PROBE_{index:04d}", "row": index, "step_index": 2, "time_s": 0.1, "inputs": {"Enable": int(label[0] == "T"), "Request": int(label[1] == "T")}, "params": {}, "vectors": {"decision": {"id": "GenericModel:1", "label": label, "ok": True}}, "stimulus": {"initial_inputs": {"Enable": 0, "Request": 1}, "initial_params": {}, "steps": [{"index": 1, "delay_s": 0.01, "input_updates": {"Enable": 1}, "param_updates": {}}, {"index": 2, "delay_s": 0.1, "input_updates": {}, "param_updates": {}}], "evidence_step": 2}, "prediction_status": "observed"})
            probe_fixture = root / "probe-results.json"; probe_fixture.write_text(json.dumps(probe), encoding="utf-8")
            job = {"jobId": "job-cli", "resources": {"ownerJobId": "job-cli"}, "input": {"workspaceDir": str(root), "outputDir": str(output), "modelSlxPath": str(model), "modelMatPath": str(mat), "coverageThreshold": 80}}
            def run_stage(stage, env=None):
                manifest_path = root / f"stage-{stage:02d}-input.json"
                result_path = output / ".tcsd-results" / f"stage-{stage:02d}.json"
                manifest_path.write_text(
                    json.dumps(
                        {
                            "schema": "tcsd-agent-stage-input/v1",
                            "jobId": "job-cli",
                            "stageIndex": stage,
                            "attempt": 1,
                            "job": job,
                        }
                    ),
                    encoding="utf-8",
                )
                subprocess.run(
                    [sys.executable, str(SCRIPT), "--manifest", str(manifest_path), "--result", str(result_path)],
                    check=True,
                    cwd=root,
                    env=env,
                )
                return json.loads(result_path.read_text(encoding="utf-8"))

            run_stage(5)
            before = json.loads((output / "GenericModel_coverage_obligations.json").read_text(encoding="utf-8"))
            self.assertGreater(before["summary"]["unresolved_count"], 0)
            env = dict(os.environ); env["TCSD_PIPELINE_PROBE_RESULTS_FIXTURE"] = str(probe_fixture)
            result = run_stage(6, env=env)
            after = json.loads((output / "GenericModel_coverage_obligations.json").read_text(encoding="utf-8"))
            self.assertEqual(result["schema"], "tcsd-agent-stage-result/v1")
            self.assertTrue(result["evidence"]["probeExecuted"])
            self.assertFalse((output / ".tcsd-checkpoints").exists())
            self.assertEqual(after["summary"]["unresolved_count"], 0)

    def test_coverage_threshold_uses_all_three_metrics_for_every_model(self):
        report = {"M1": {"condition": {"percent": 90}, "decision": {"percent": 90}, "mcdc": {"percent": 79}}}
        self.assertFalse(RUNNER.coverage_meets(report, 80))
        report["M1"]["mcdc"]["percent"] = 80
        self.assertTrue(RUNNER.coverage_meets(report, 80))


if __name__ == "__main__":
    unittest.main()
