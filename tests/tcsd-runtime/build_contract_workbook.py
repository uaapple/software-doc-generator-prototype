#!/usr/bin/env python3
"""Build generic dev-only XLSX fixtures for host semantic contract tests."""

from __future__ import annotations

import argparse
from pathlib import Path

from openpyxl import Workbook


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected", type=float, default=1.0)
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "TCSD"
    for column, value in enumerate(
        ("TestID", "Name", "Type", "Description", "Requirement", "Initialization", "Action"),
        1,
    ):
        sheet.cell(1, column).value = value
    sheet["A3"] = "TC_001"
    sheet["B3"] = "Generic executable case"
    sheet["C3"] = "Test"
    sheet["F3"] = "Input=0;\np Gain=1;"
    sheet["G3"] = (
        "[+0.1s]\n"
        "Input=1;\n"
        f"Output = expValue({args.expected:g});\n"
        "[+0.1s]"
    )
    workbook.save(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
