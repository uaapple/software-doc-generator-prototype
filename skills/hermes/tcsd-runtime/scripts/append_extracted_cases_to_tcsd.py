#!/usr/bin/env python3
"""Append already simulated extracted cases to a compact TCSD specification."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import augment_tcsd_for_mcdc as augment


def action_text(test: dict[str, Any]) -> str:
    lines: list[str] = []
    for step in test.get("steps") or []:
        if not isinstance(step, dict):
            continue
        delay = max(0.0, float(step.get("delay_s") or 0.0))
        lines.append(f"[+{delay:.12g}s] // execute verified generated stimulus")
        if step.get("param_updates"):
            raise ValueError("generated cases may not change parameters after initialization")
        for name, value in (step.get("input_updates") or {}).items():
            lines.append(augment.line_for_key(augment.normalize_key(str(name)), value))
    if not lines:
        lines.append("[+0.01s] // final observation window")
    return "\n".join(lines)


def append_cases(
    spec: dict[str, Any], candidates: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if candidates.get("schema") != "tcsd-extracted-cases/v1":
        raise ValueError("generated candidate schema is invalid")
    tests = spec.setdefault("tests", [])
    next_index = augment.next_test_index(spec)
    remapped: list[dict[str, Any]] = []
    for offset, candidate in enumerate(candidates.get("tests") or []):
        if not isinstance(candidate, dict):
            continue
        test_id = f"TC_{next_index + offset:03d}"
        row = 6 + len(tests)
        tests.append(
            {
                "id": test_id,
                "name": str(candidate.get("name") or "Design Verifier coverage supplement")[:120],
                "requirement_id": "UT_COVERAGE_GAP",
                "description": "Simulink Design Verifier generated coverage supplement; accepted only after MATLAB coverage-delta validation.",
                "initialization": augment.merge_initialization(
                    "", candidate.get("init_values") or {}, candidate.get("init_params") or {}
                ),
                "action": action_text(candidate),
                "work_status": "reviewed",
            }
        )
        remapped_candidate = dict(candidate)
        remapped_candidate.update({"row": row, "test_id": test_id})
        remapped.append(remapped_candidate)
    remapped_payload = {
        "schema": "tcsd-extracted-cases/v1",
        "model": candidates.get("model"),
        "tests": remapped,
    }
    report = {
        "schema": "tcsd-generated-case-append/v1",
        "candidateCount": len(candidates.get("tests") or []),
        "appendedCount": len(remapped),
        "firstTestId": remapped[0]["test_id"] if remapped else "",
        "lastTestId": remapped[-1]["test_id"] if remapped else "",
    }
    return spec, remapped_payload, report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--output-spec", required=True)
    parser.add_argument("--output-candidates", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    candidates = json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    updated, remapped, report = append_cases(spec, candidates)
    for path, payload in (
        (args.output_spec, updated),
        (args.output_candidates, remapped),
        (args.report, report),
    ):
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
