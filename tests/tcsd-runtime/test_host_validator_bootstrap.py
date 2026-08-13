import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO = Path(__file__).resolve().parents[2]
HOST_VALIDATOR = (
    REPO
    / "skills"
    / "hermes"
    / "tcsd-runtime"
    / "scripts"
    / "host_validate_tcsd_stage.py"
)
PYTHON_GATE = REPO / "scripts" / "check-tcsd-python.py"


def load_python_gate():
    spec = importlib.util.spec_from_file_location("check_tcsd_python", PYTHON_GATE)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def load_host_validator():
    spec = importlib.util.spec_from_file_location("host_validate_tcsd_stage_test", HOST_VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def write_stub_runtime(directory: Path, *, include_runner: bool = True) -> Path:
    directory.mkdir(parents=True)
    host = directory / HOST_VALIDATOR.name
    host.write_text(HOST_VALIDATOR.read_text(encoding="utf-8"), encoding="utf-8")
    (directory / "openpyxl.py").write_text(
        "def load_workbook(*args, **kwargs):\n    raise AssertionError('self-check must not load a workbook')\n",
        encoding="utf-8",
    )
    if include_runner:
        (directory / "run_tcsd_pipeline_stage.py").write_text(
            "def simulation_backfill_evidence(*args, **kwargs):\n    return {}\n",
            encoding="utf-8",
        )
    (directory / "classify_state_probe_targets.py").write_text(
        "def classify_targets(*args, **kwargs):\n    return {}\n",
        encoding="utf-8",
    )
    (directory / "validate_agent_coverage_repair.py").write_text(
        "\n".join(
            [
                "BRIEF_SCHEMA = 'brief'",
                "IR_SCHEMA = 'ir'",
                "PROPOSAL_SCHEMA = 'proposal'",
                "VALIDATION_SCHEMA = 'validation'",
                "def build_brief(*args, **kwargs): return {}",
                "def validate_proposal(*args, **kwargs): return {}, {}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (directory / "validate_tcsd_workbook.py").write_text(
        "def load_interface_names(*args, **kwargs): return [], []\n"
        "def load_interface_execution_controls(*args, **kwargs): return {}\n"
        "def validate_workbook(*args, **kwargs): return {}\n",
        encoding="utf-8",
    )
    return host


class HostValidatorBootstrapTests(unittest.TestCase):
    def test_workbook_validation_error_names_tests_without_expectations(self):
        validator = load_host_validator()
        with tempfile.TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            workbook = root / "result.xlsx"
            workbook.write_bytes(b"workbook")
            report = {
                "status": "failed",
                "test_count": 2,
                "errors": [
                    {"code": "unknown_exp_output"},
                    {
                        "code": "missing_test_exp_values",
                        "test_cases": [
                            {"row": 3, "test_id": "TC_001", "exp_value_count": 0},
                            {"row": 4, "test_id": "", "exp_value_count": 0},
                        ],
                    }
                ],
            }
            with (
                mock.patch.object(validator, "find_workbook", return_value=workbook),
                mock.patch.object(validator, "resolve_workspace_path", return_value=root / "interface.json"),
                mock.patch.object(validator, "load_interface_names", return_value=({"Input"}, {"Output"})),
                mock.patch.object(validator, "load_interface_execution_controls", return_value={}),
                mock.patch.object(validator, "validate_workbook", return_value=report),
                mock.patch.object(validator, "count_action_steps", return_value=2),
            ):
                with self.assertRaisesRegex(
                    ValueError,
                    r"unknown_exp_output \(missing Test cases: TC_001, row 4\)",
                ):
                    validator.validate_workbook_stage(
                        {
                            "workspaceDir": str(root),
                            "interfacePath": "interface.json",
                            "templatePath": str(root / "missing-template.xlsx"),
                        },
                        require_exp_values=True,
                    )

    def test_isolated_self_check_imports_only_trusted_sibling_modules(self):
        with tempfile.TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            host = write_stub_runtime(root / "trusted")
            untrusted = root / "untrusted"
            untrusted.mkdir()
            (untrusted / "run_tcsd_pipeline_stage.py").write_text(
                "raise AssertionError('cwd or PYTHONPATH module was trusted')\n",
                encoding="utf-8",
            )
            environment = dict(os.environ)
            environment["PYTHONPATH"] = str(untrusted)
            completed = subprocess.run(
                [sys.executable, "-I", "-B", str(host), "--self-check"],
                cwd=untrusted,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            report = json.loads(completed.stdout)
            self.assertEqual(report["schema"], "tcsd-host-semantic-self-check/v1")
            self.assertTrue(report["passed"])
            self.assertEqual(
                report["localModules"],
                [
                    "classify_state_probe_targets",
                    "run_tcsd_pipeline_stage",
                    "validate_agent_coverage_repair",
                    "validate_tcsd_workbook",
                ],
            )

    def test_import_time_missing_module_is_structured_without_paths(self):
        with tempfile.TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            host = write_stub_runtime(root / "trusted", include_runner=False)
            completed = subprocess.run(
                [sys.executable, "-I", "-B", str(host), "--self-check"],
                cwd=root,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 1)
            report = json.loads(completed.stderr.strip())
            self.assertEqual(report["schema"], "tcsd-host-semantic-validation/v1")
            self.assertEqual(
                report["message"],
                "host validator import failed: missing module run_tcsd_pipeline_stage",
            )
            self.assertNotIn(str(root), completed.stderr)

    def test_dependency_gate_rejects_equivalent_unbootstrapped_entry(self):
        gate = load_python_gate()
        with tempfile.TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            (root / "run_tcsd_pipeline_stage.py").write_text("MARKER = True\n", encoding="utf-8")
            broken = root / "host_without_bootstrap.py"
            broken.write_text(
                "from run_tcsd_pipeline_stage import MARKER\n"
                "print('{\"schema\":\"tcsd-host-semantic-self-check/v1\","
                "\"passed\":true,\"localModules\":[]}')\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                RuntimeError,
                r"host validator isolated import self-check failed with exit code 1",
            ):
                gate.run_host_validator_self_check(sys.executable, broken)


if __name__ == "__main__":
    unittest.main()
