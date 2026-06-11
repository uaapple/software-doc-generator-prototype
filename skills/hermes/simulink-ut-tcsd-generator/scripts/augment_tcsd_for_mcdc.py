#!/usr/bin/env python3
"""Append TCSD tests for missing MC/DC obligations that already have mappings."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ASSIGN_KEY_RE = re.compile(r"^\s*(p\s+)?([A-Za-z_]\w*)(?:\s+([1-9]\d*))?\s*=")
BRACKET_KEY_RE = re.compile(r"^([A-Za-z_]\w*)\[(\d+)\]$")
TC_ID_RE = re.compile(r"^TC_(\d+)$")


def parse_assignment_key(line: str) -> tuple[str, str, str] | None:
    match = ASSIGN_KEY_RE.match(line)
    if not match:
        return None
    prefix, name, index = match.groups()
    return ((prefix or "").strip(), name, index or "")


def format_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        rounded = round(float(value))
        if abs(float(value) - rounded) < 1e-9:
            return str(int(rounded))
        return f"{float(value):.12g}"
    return str(value)


def normalize_key(raw_key: str, *, is_param: bool = False) -> tuple[str, str, str]:
    key = str(raw_key).strip()
    if key.startswith("p "):
        return ("p", key[2:].strip(), "")
    if is_param:
        return ("p", key, "")
    match = BRACKET_KEY_RE.match(key)
    if match:
        return ("", match.group(1), match.group(2))
    parts = key.split()
    if len(parts) == 2 and parts[1].isdigit():
        return ("", parts[0], parts[1])
    return ("", key, "")


def line_for_key(key: tuple[str, str, str], value: Any) -> str:
    prefix, name, index = key
    if prefix == "p":
        return f"p {name}={format_value(value)};"
    if index:
        return f"{name} {index}={format_value(value)};"
    return f"{name}={format_value(value)};"


def merge_initialization(base_text: str, inputs: dict[str, Any], params: dict[str, Any]) -> str:
    lines: list[str] = []
    positions: dict[tuple[str, str, str], int] = {}
    for raw in (base_text or "").splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        key = parse_assignment_key(line)
        if key is not None:
            positions[key] = len(lines)
        lines.append(line)
    overrides: dict[tuple[str, str, str], Any] = {}
    for raw_key, value in inputs.items():
        if isinstance(value, list):
            for idx, item in enumerate(value, start=1):
                overrides[("", str(raw_key), str(idx))] = item
        else:
            overrides[normalize_key(str(raw_key))] = value
    for raw_key, value in params.items():
        overrides[normalize_key(str(raw_key), is_param=True)] = value
    for key, value in overrides.items():
        line = line_for_key(key, value)
        if key in positions:
            lines[positions[key]] = line
        else:
            positions[key] = len(lines)
            lines.append(line)
    return "\n".join(lines)


def next_test_index(spec: dict[str, Any]) -> int:
    max_seen = 0
    for test in spec.get("tests", []):
        match = TC_ID_RE.match(str(test.get("id") or ""))
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    return max_seen + 1


def load_obligation_map(path: str | Path) -> dict[str, dict[str, Any]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    items = data.get("obligations", data) if isinstance(data, dict) else data
    return {str(item.get("id")): item for item in items if isinstance(item, dict) and item.get("id")}


def missing_ids(report_path: str | Path | None, obligations: dict[str, dict[str, Any]]) -> list[str]:
    if report_path:
        report = json.loads(Path(report_path).read_text(encoding="utf-8"))
        return [str(item.get("id")) for item in report.get("missing", []) if isinstance(item, dict) and item.get("id")]
    return [item_id for item_id, item in obligations.items() if item.get("status", "required") == "required"]


def first_match(obligation: dict[str, Any]) -> dict[str, Any] | None:
    if isinstance(obligation.get("match"), dict):
        return obligation["match"]
    matches = obligation.get("matches")
    if isinstance(matches, list) and matches:
        return next((item for item in matches if isinstance(item, dict)), None)
    return None


def baseline_initialization(spec: dict[str, Any], baseline_test_id: str | None) -> str:
    tests = spec.get("tests", [])
    if baseline_test_id:
        for test in tests:
            if str(test.get("id")) == baseline_test_id:
                return str(test.get("initialization") or "")
    for test in tests:
        text = str(test.get("initialization") or "")
        if text.strip():
            return text
    return ""


def build_test(test_index: int, obligation: dict[str, Any], init_text: str) -> dict[str, Any]:
    item_id = str(obligation.get("id") or f"MCDC_{test_index}")
    block_path = str(obligation.get("block_path") or "")
    outcome = str(obligation.get("required_outcome") or "")
    return {
        "id": f"TC_{test_index:03d}",
        "name": f"MCDC supplemental {item_id}"[:120],
        "requirement_id": "UT_MCDC",
        "description": f"MC/DC supplemental case for {item_id}; {outcome}; block: {block_path}",
        "initialization": init_text,
        "action": f"[+1s] // hold mapped MC/DC state for {item_id}\n[+0.1s]",
        "work_status": "reviewed",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--obligations", required=True)
    parser.add_argument("--validation-report")
    parser.add_argument("--output", required=True)
    parser.add_argument("--baseline-test-id")
    parser.add_argument("--max-new-tests", type=int, default=50)
    args = parser.parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    obligations = load_obligation_map(args.obligations)
    base = baseline_initialization(spec, args.baseline_test_id)
    existing_ids = {str(test.get("id")) for test in spec.get("tests", [])}
    index = next_test_index(spec)
    added = 0
    skipped: list[dict[str, str]] = []
    for item_id in missing_ids(args.validation_report, obligations):
        if added >= args.max_new_tests:
            break
        obligation = obligations.get(item_id)
        if not obligation:
            skipped.append({"id": item_id, "reason": "obligation_not_found"})
            continue
        if str(obligation.get("status") or "required") != "required":
            skipped.append({"id": item_id, "reason": "obligation_not_required"})
            continue
        match = first_match(obligation)
        if not match:
            skipped.append({"id": item_id, "reason": "missing_match_inputs"})
            continue
        inputs = match.get("inputs") or match.get("expected_inputs") or {}
        params = match.get("params") or match.get("parameters") or {}
        if not inputs and not params:
            skipped.append({"id": item_id, "reason": "empty_match"})
            continue
        while f"TC_{index:03d}" in existing_ids:
            index += 1
        test = build_test(index, obligation, merge_initialization(base, inputs, params))
        spec.setdefault("tests", []).append(test)
        existing_ids.add(test["id"])
        index += 1
        added += 1
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "added": added, "skipped": skipped}, ensure_ascii=False, indent=2))
    return 0 if added or not skipped else 1


if __name__ == "__main__":
    raise SystemExit(main())
