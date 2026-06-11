#!/usr/bin/env python3
"""Build Logical Operator MC/DC obligations from probe observations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

SCHEMA = "simulink-ut-logical-mcdc-obligations/v1"


def required_vectors(operator: str, n: int) -> list[str]:
    operator = operator.upper()
    if operator == "OR":
        return ["F" * n] + ["".join("T" if i == k else "F" for i in range(n)) for k in range(n)]
    if operator == "AND":
        return ["T" * n] + ["".join("F" if i == k else "T" for i in range(n)) for k in range(n)]
    return []


def vector_output(operator: str, label: str) -> bool:
    values = [char == "T" for char in label]
    return any(values) if operator.upper() == "OR" else all(values)


def norm_value(value: Any) -> Any:
    if isinstance(value, dict) and "value" in value:
        return norm_value(value["value"])
    if isinstance(value, list):
        if len(value) == 1:
            return norm_value(value[0])
        return [norm_value(v) for v in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if abs(value - round(value)) < 1e-9:
            return int(round(value))
        return float(value)
    return value


def norm_map(values: Any) -> dict[str, Any]:
    if not isinstance(values, dict):
        return {}
    return {str(name): norm_value(value) for name, value in values.items()}


def observation_index(report: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    found: dict[tuple[str, str], dict[str, Any]] = {}
    for obs in report.get("observations", []):
        if not isinstance(obs, dict):
            continue
        vectors = obs.get("vectors", {})
        if not isinstance(vectors, dict):
            continue
        for vector in vectors.values():
            if not isinstance(vector, dict) or not vector.get("ok"):
                continue
            key = (str(vector.get("id")), str(vector.get("label")))
            found.setdefault(key, obs)
    return found


def load_overrides(path: str | None) -> dict[str, dict[str, Any]]:
    if not path:
        return {}
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    items = raw.get("overrides", raw) if isinstance(raw, dict) else raw
    result: dict[str, dict[str, Any]] = {}
    if not isinstance(items, list):
        return result
    for item in items:
        if not isinstance(item, dict):
            continue
        model = str(item.get("model") or "*")
        op_id = str(item.get("operator_id") or item.get("op_id") or item.get("id") or "")
        label = str(item.get("label") or item.get("vector") or "")
        if not op_id or not label:
            continue
        for key in (f"{model}|{op_id}|{label}", f"*|{op_id}|{label}", f"{op_id}|{label}"):
            result[key] = item
    return result


def find_override(overrides: dict[str, dict[str, Any]], model: str, op_id: str, label: str) -> dict[str, Any] | None:
    return (
        overrides.get(f"{model}|{op_id}|{label}")
        or overrides.get(f"*|{op_id}|{label}")
        or overrides.get(f"{op_id}|{label}")
    )


def port_count(probe: dict[str, Any]) -> int:
    names = probe.get("port_names")
    if isinstance(names, list):
        return len(names)
    inputs = probe.get("inputs")
    if isinstance(inputs, list):
        return len(inputs)
    return int(probe.get("port_count") or 0)


def build_for_model(
    model: str,
    report: dict[str, Any],
    *,
    overrides: dict[str, dict[str, Any]],
    missing_status: str,
) -> dict[str, Any]:
    found = observation_index(report)
    obligations: list[dict[str, Any]] = []
    for probe in report.get("probes", []):
        if not isinstance(probe, dict):
            continue
        op_id = str(probe.get("id") or probe.get("sid") or probe.get("block_path") or "")
        operator = str(probe.get("operator") or "").upper()
        n = port_count(probe)
        if operator not in {"AND", "OR"} or not op_id or n <= 0:
            continue
        for label in required_vectors(operator, n):
            obs = found.get((op_id, label))
            item: dict[str, Any] = {
                "id": f"{op_id}_{label}",
                "model": model,
                "block_path": probe.get("block_path"),
                "sid": probe.get("sid") or op_id,
                "operator": operator,
                "coverage_class": "MCDC",
                "required_outcome": f"operator_input_vector={label}; output={str(vector_output(operator, label)).lower()}",
                "operator_inputs": {str(i + 1): label[i] == "T" for i in range(n)},
            }
            if obs:
                item.update(
                    {
                        "status": "required",
                        "match": {
                            "inputs": norm_map(obs.get("inputs", {})),
                            "params": norm_map(obs.get("params", {})),
                        },
                        "planned_test_id": obs.get("test_id"),
                        "probe_evidence": {
                            "test_id": obs.get("test_id"),
                            "row": obs.get("row"),
                            "step_index": obs.get("step_index"),
                            "time_s": obs.get("time_s"),
                        },
                        "evidence_state": "probe_observed_and_workbook_mapped",
                    }
                )
            else:
                override = find_override(overrides, model, op_id, label)
                if override:
                    item.update(
                        {
                            "status": str(override.get("status") or "unreachable"),
                            "reason": str(override.get("reason") or "Probe did not observe this vector; override marked it unreachable."),
                            "evidence_state": "probe_not_observed_with_override",
                        }
                    )
                else:
                    item.update(
                        {
                            "status": missing_status,
                            "issues": [
                                {
                                    "code": "probe_vector_not_observed",
                                    "operator_id": op_id,
                                    "label": label,
                                    "message": "Targeted probe cases did not observe this required MC/DC vector.",
                                }
                            ],
                            "reason": "Vector was not observed by targeted probe runs and has no explicit unreachable override.",
                            "evidence_state": "probe_not_observed_needs_resolution",
                        }
                    )
            obligations.append(item)
    summary = {
        "operator_count": len(report.get("probes", [])),
        "obligation_count": len(obligations),
        "required_count": sum(1 for item in obligations if item["status"] == "required"),
        "unreachable_count": sum(1 for item in obligations if item["status"] == "unreachable"),
        "unresolved_count": sum(1 for item in obligations if item["status"] in {"unresolved", "needs_manual_resolution"}),
        "not_traceable_count": sum(1 for item in obligations if item["status"] == "not_traceable"),
    }
    return {
        "schema": SCHEMA,
        "model": model,
        "summary": summary,
        "obligations": obligations,
        "source": "logic_probe_results.json",
    }


def model_items(data: dict[str, Any], selected: set[str] | None) -> list[tuple[str, dict[str, Any]]]:
    result = []
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        model = str(value.get("model") or key)
        if selected and model not in selected and key not in selected:
            continue
        result.append((model, value))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe-results", required=True)
    parser.add_argument("--output-dir")
    parser.add_argument("--model", action="append", help="Limit to one model; can be repeated")
    parser.add_argument("--output-pattern", default="{model}_coverage_obligations.json")
    parser.add_argument("--unreachable-overrides", help="JSON list with model/operator_id/label/status/reason")
    parser.add_argument(
        "--missing-status",
        default="unresolved",
        choices=["unresolved", "not_traceable", "unreachable"],
        help="Status for unobserved vectors without an explicit override. Default keeps them unresolved.",
    )
    args = parser.parse_args()
    probe_path = Path(args.probe_results)
    data = json.loads(probe_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit("probe results must be a JSON object keyed by model")
    out_dir = Path(args.output_dir) if args.output_dir else probe_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    overrides = load_overrides(args.unreachable_overrides)
    selected = set(args.model or []) or None
    exit_code = 0
    for model, report in model_items(data, selected):
        built = build_for_model(model, report, overrides=overrides, missing_status=args.missing_status)
        out = out_dir / args.output_pattern.format(model=model)
        out.write_text(json.dumps(built, ensure_ascii=False, indent=2), encoding="utf-8")
        print(out, built["summary"])
        if built["summary"].get("unresolved_count", 0):
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
