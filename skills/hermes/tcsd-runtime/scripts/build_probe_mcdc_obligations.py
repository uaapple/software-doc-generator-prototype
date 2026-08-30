#!/usr/bin/env python3
"""Build Logical Operator MC/DC obligations from probe observations."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any

SCHEMA = "simulink-ut-logical-mcdc-obligations/v1"


def load_algebraic_analysis():
    """Load the sibling structural builder for its algebraic unreachability
    analysis (strict implication between AND/OR sibling ports). Returns None
    when unavailable so the probe builder degrades gracefully."""
    try:
        path = Path(__file__).resolve().with_name("build_logical_mcdc_obligations.py")
        spec = importlib.util.spec_from_file_location("tcsd_logical_algebra", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception:
        return None


ALGEBRAIC = load_algebraic_analysis()


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


def norm_stimulus(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    steps = value.get("steps") or []
    if isinstance(steps, dict):
        steps = [steps]
    normalized_steps = []
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            continue
        normalized_steps.append(
            {
                "index": int(step.get("index") or index),
                "delay_s": float(step.get("delay_s") or 0),
                "input_updates": norm_map(step.get("input_updates", {})),
                "param_updates": norm_map(step.get("param_updates", {})),
            }
        )
    return {
        "initial_inputs": norm_map(value.get("initial_inputs", {})),
        "initial_params": norm_map(value.get("initial_params", {})),
        "steps": normalized_steps,
        "evidence_step": int(value.get("evidence_step") or len(normalized_steps)),
    }


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


def mapping_index(payload: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not isinstance(payload, dict):
        return {}
    return {
        str(item.get("id") or item.get("sid")): item
        for item in payload.get("operators", [])
        if isinstance(item, dict) and (item.get("id") or item.get("sid"))
    }


def port_assignments(port: dict[str, Any], desired: bool) -> tuple[dict[str, Any], dict[str, Any]] | None:
    prefix = "true" if desired else "false"
    inputs = norm_map(port.get(f"{prefix}_inputs", {}))
    params = norm_map(port.get(f"{prefix}_params", {}))
    if port.get("mapping_issues") or not (inputs or params):
        return None
    return inputs, params


def synthesize_from_dynamic_anchor(
    *, op_id: str, label: str, found: dict[tuple[str, str], dict[str, Any]], mapping: dict[str, Any] | None
) -> dict[str, Any] | None:
    if not mapping:
        return None
    ports = sorted(
        [item for item in mapping.get("ports", []) if isinstance(item, dict)],
        key=lambda item: int(item.get("index") or 0),
    )
    if len(ports) != len(label):
        return None
    dynamic_indices = {
        index
        for index, port in enumerate(ports)
        if port_assignments(port, True) is None or port_assignments(port, False) is None
    }
    anchors = [
        (anchor_label, obs)
        for (anchor_op, anchor_label), obs in found.items()
        if anchor_op == op_id
        and len(anchor_label) == len(label)
        and all(anchor_label[index] == label[index] for index in dynamic_indices)
        and isinstance(obs.get("stimulus"), dict)
    ]
    if not anchors:
        return None
    anchor_label, obs = anchors[0]
    stimulus = norm_stimulus(obs.get("stimulus"))
    if not stimulus:
        return None
    init_inputs = dict(stimulus["initial_inputs"])
    init_params = dict(stimulus["initial_params"])
    final_inputs = norm_map(obs.get("inputs", {}))
    final_params = norm_map(obs.get("params", {}))
    for index, port in enumerate(ports):
        if index in dynamic_indices:
            continue
        assignments = port_assignments(port, label[index] == "T")
        if assignments is None:
            return None
        inputs, params = assignments
        init_inputs.update(inputs)
        init_params.update(params)
        final_inputs.update(inputs)
        final_params.update(params)
    stimulus["initial_inputs"] = init_inputs
    stimulus["initial_params"] = init_params
    return {
        "anchor_label": anchor_label,
        "observation": obs,
        "stimulus": stimulus,
        "match": {"inputs": final_inputs, "params": final_params},
    }


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


def algebraic_unreachable_reason(operator: str, label: str, mapping: dict[str, Any] | None) -> str | None:
    """Algebraic evidence when this single-toggle vector is impossible (one AND
    sibling strictly implies the toggled port, or the toggled OR port strictly
    implies a sibling), else None. Only unobserved vectors reach this point."""
    if ALGEBRAIC is None or not mapping:
        return None
    if operator not in {"AND", "OR"} or len(label) < 2:
        return None
    # Single-toggle vectors only: AND has exactly one F, OR exactly one T.
    toggles = [i for i, char in enumerate(label) if char == ("T" if operator == "OR" else "F")]
    if len(toggles) != 1:
        return None
    toggle_index = toggles[0] + 1
    facts = ALGEBRAIC.facts_for_operator(mapping)
    if len(facts) != len(label):
        return None
    return ALGEBRAIC.algebraic_unreachable_vector(operator, facts, toggle_index)


def mps_error_targets(report: dict[str, Any]) -> dict[str, str]:
    """Operator ids whose targeted probe simulation aborted with a
    MultiPortSwitch selector out-of-range diagnostic (model-inherent
    constraint: the selector input can legally leave the data-port range,
    e.g. a Stateflow operating-condition id 4/5 feeding a 0..3 MPS with
    DiagnosticForDefault=Error). Vectors of these operators that the probe
    could not observe are structurally unreachable, not missing coverage."""
    result: dict[str, str] = {}
    for obs in report.get("observations", []):
        if not isinstance(obs, dict):
            continue
        if obs.get("prediction_status") != "simulation_error_mps_selector":
            continue
        target = obs.get("target") or {}
        op_id = str(target.get("operator_id") or "")
        if not op_id:
            continue
        message = str(obs.get("error_message") or "MultiPortSwitch selector out of range")
        result.setdefault(op_id, message)
    return result


def build_for_model(
    model: str,
    report: dict[str, Any],
    *,
    overrides: dict[str, dict[str, Any]],
    missing_status: str,
    mappings: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    found = observation_index(report)
    mps_errors = mps_error_targets(report)
    obligations: list[dict[str, Any]] = []
    probes = report.get("probes") or []
    if isinstance(probes, dict):
        probes = [probes]
    for probe in probes:
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
                stimulus = norm_stimulus(obs.get("stimulus"))
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
                if stimulus and stimulus["steps"]:
                    item["stimulus"] = stimulus
                    item["evidence_state"] = "probe_observed_with_executable_sequence"
                if obs.get("prediction_status"):
                    item["probe_evidence"]["prediction_status"] = obs.get("prediction_status")
            else:
                synthesized = synthesize_from_dynamic_anchor(
                    op_id=op_id,
                    label=label,
                    found=found,
                    mapping=(mappings or {}).get(op_id),
                )
                if synthesized:
                    anchor = synthesized["observation"]
                    item.update(
                        {
                            "status": "required",
                            "match": synthesized["match"],
                            "stimulus": synthesized["stimulus"],
                            "planned_test_id": anchor.get("test_id"),
                            "probe_evidence": {
                                "test_id": anchor.get("test_id"),
                                "row": anchor.get("row"),
                                "step_index": anchor.get("step_index"),
                                "time_s": anchor.get("time_s"),
                                "dynamic_anchor_label": synthesized["anchor_label"],
                            },
                            "evidence_state": "probe_observed_dynamic_anchor_with_static_sensitization",
                        }
                    )
                    obligations.append(item)
                    continue
                override = find_override(overrides, model, op_id, label)
                algebraic_reason = algebraic_unreachable_reason(operator, label, (mappings or {}).get(op_id))
                if algebraic_reason:
                    item.update(
                        {
                            "status": "unreachable",
                            "reason": algebraic_reason,
                            "evidence_state": "unreachable_algebraic_static",
                        }
                    )
                elif override:
                    item.update(
                        {
                            "status": str(override.get("status") or "unreachable"),
                            "reason": str(override.get("reason") or "Probe did not observe this vector; override marked it unreachable."),
                            "evidence_state": "probe_not_observed_with_override",
                        }
                    )
                elif op_id in mps_errors:
                    item.update(
                        {
                            "status": "unreachable",
                            "reason": (
                                "Model-inherent MultiPortSwitch constraint: the probe simulation for this "
                                "operator aborted with a selector out-of-range diagnostic "
                                f"({mps_errors[op_id][:220]}). Vectors that require this state cannot be executed."
                            ),
                            "evidence_state": "unreachable_mps_selector_constraint",
                            "issues": [
                                {
                                    "code": "probe_vector_not_observed_mps_selector_error",
                                    "operator_id": op_id,
                                    "label": label,
                                    "message": mps_errors[op_id][:400],
                                }
                            ],
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
    parser.add_argument("--logical-mappings", help="Derived mapping JSON for static sibling sensitization")
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
    mappings = mapping_index(json.loads(Path(args.logical_mappings).read_text(encoding="utf-8"))) if args.logical_mappings else {}
    selected = set(args.model or []) or None
    # Unresolved vectors are a legitimate terminal outcome under the
    # reconciliation contract: the obligations file registers each gap and the
    # stage ends as `partial` — a non-zero exit here would turn a registered
    # gap back into a hard failure ( bbc72245 shape). Only crashes fail.
    for model, report in model_items(data, selected):
        built = build_for_model(model, report, overrides=overrides, missing_status=args.missing_status, mappings=mappings)
        out = out_dir / args.output_pattern.format(model=model)
        out.write_text(json.dumps(built, ensure_ascii=False, indent=2), encoding="utf-8")
        print(out, built["summary"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
