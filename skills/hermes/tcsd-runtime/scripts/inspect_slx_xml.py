#!/usr/bin/env python3
"""Inspect Simulink SLX XML without shell pipelines.

This is a supplement for exact SIDs/block parameters/connectivity after SATK/MCP/MATLAB
has been used as the authoritative model reader.
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from pathlib import Path


DEFAULT_PATTERN = r"MultiPortSwitch|MinMax|Saturate|Switch|RelationalOperator|<Line|<Branch"


def iter_system_xml(slx_path: Path):
    with zipfile.ZipFile(slx_path) as zf:
        names = sorted(
            name for name in zf.namelist()
            if name.startswith("simulink/systems/system_") and name.endswith(".xml")
        )
        for name in names:
            text = zf.read(name).decode("utf-8", errors="replace")
            yield name, text


def main() -> int:
    parser = argparse.ArgumentParser(description="Search Simulink system XML inside an SLX file.")
    parser.add_argument("slx", help="Path to .slx file")
    parser.add_argument("--pattern", default=DEFAULT_PATTERN, help="Regex to search in system XML")
    parser.add_argument("--max-matches", type=int, default=200, help="Maximum matches to print")
    parser.add_argument("--context", type=int, default=0, help="Line context before/after each match")
    args = parser.parse_args()

    slx_path = Path(args.slx)
    if not slx_path.exists():
        print(f"SLX not found: {slx_path}", file=sys.stderr)
        return 2

    pattern = re.compile(args.pattern)
    count = 0
    for xml_name, text in iter_system_xml(slx_path):
        lines = text.splitlines()
        for idx, line in enumerate(lines):
            if not pattern.search(line):
                continue
            start = max(0, idx - args.context)
            end = min(len(lines), idx + args.context + 1)
            for line_no in range(start, end):
                snippet = lines[line_no].strip()
                print(f"{xml_name}:{line_no + 1}: {snippet}")
            count += 1
            if count >= args.max_matches:
                return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
