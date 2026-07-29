import importlib.util
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "skills"
    / "hermes"
    / "tcsd-runtime"
    / "scripts"
    / "validate_tcsd_workbook.py"
)
SPEC = importlib.util.spec_from_file_location("validate_tcsd_workbook", SCRIPT)
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


class ValidateTcsdWorkbookTests(unittest.TestCase):
    def test_require_exp_values_reports_each_test_without_an_expectation(self):
        with tempfile.TemporaryDirectory() as directory:
            workbook_path = Path(directory) / "mixed-oracles.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "TCSD"
            sheet.append(
                [
                    "TestID",
                    "Name",
                    "Type",
                    "Requirement ID",
                    "Test Case Description",
                    "Initialization",
                    "Action",
                ]
            )
            sheet.append(["TG_001", "Group", "TestGroup", "", "", "", ""])
            sheet.append(
                [
                    "TC_001",
                    "With oracle",
                    "Test",
                    "REQ-1",
                    "",
                    "InputA = 0;",
                    "[+0.1s]\nOutput = expValue(1);\n[+0.1s]",
                ]
            )
            sheet.append(
                [
                    "TC_002",
                    "Without oracle",
                    "Test",
                    "REQ-2",
                    "",
                    "InputA = 1;",
                    "[+0.1s]\nInputA = 0;\n[+0.1s]",
                ]
            )
            sheet.append(
                [
                    "TC_003",
                    "Initialization oracle only",
                    "Test",
                    "REQ-3",
                    "",
                    "Output = expValue(9);",
                    "[+0.1s]\nInputA = 1;\n[+0.1s]",
                ]
            )
            workbook.save(workbook_path)

            report = VALIDATOR.validate_workbook(
                workbook_path,
                {"InputA"},
                {"Output"},
                require_exp_values=True,
            )

            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["exp_value_count"], 2)
            self.assertEqual(
                report["test_exp_value_counts"],
                [
                    {"row": 3, "test_id": "TC_001", "exp_value_count": 1},
                    {"row": 4, "test_id": "TC_002", "exp_value_count": 0},
                    {"row": 5, "test_id": "TC_003", "exp_value_count": 0},
                ],
            )
            self.assertEqual(
                report["missing_exp_value_test_cases"],
                [
                    {"row": 4, "test_id": "TC_002", "exp_value_count": 0},
                    {"row": 5, "test_id": "TC_003", "exp_value_count": 0},
                ],
            )
            missing_error = next(
                error
                for error in report["errors"]
                if error["code"] == "missing_test_exp_values"
            )
            self.assertEqual(missing_error["test_cases"], report["missing_exp_value_test_cases"])
            self.assertNotIn("missing_exp_values", {error["code"] for error in report["errors"]})


if __name__ == "__main__":
    unittest.main()
