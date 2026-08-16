#!/usr/bin/env python3
"""Build deterministic Decision obligations for non-logical blocks from SLX XML.

The logical MC/DC pipeline only derives obligations from AND/OR operators.
This extractor widens the static obligation set to the decision blocks that
Simulink Coverage measures: Switch, RelationalOperator, MinMax, MultiPortSwitch,
Saturate, Abs, and (when present) enable/trigger ports of conditionally
executed subsystems. It deliberately stays conservative:

- a controller (root-input assignment) is emitted only when the target input
  traces to a root Inport or a literal Constant through plain Lines (subsystem
  boundary crossings are followed up to MAX_DEPTH levels);
- anything else becomes `unresolved` with a concrete reason instead of a guessed
  assignment, so workbook validation can never be broken by this script;
- a structurally unreachable outcome (literal constant already fixes the input)
  is recorded as `unreachable` with evidence.

Output schema: `simulink-ut-decision-obligations/v1`.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

SCHEMA = "simulink-ut-decision-obligations/v1"
MAX_DEPTH = 4
DEFAULT_TARGET_BLOCK_TYPES = {
    "Switch",
    "RelationalOperator",
    "MinMax",
    "MultiPortSwitch",
    "Saturate",
    "Abs",
}


class SlxModel:
    def __init__(self, slx_path: Path, model_name: str, root_inputs: list[str]):
        self.model_name = model_name
        self.root_inputs = set(root_inputs)
        self.systems: dict[str, str] = {}          # system xml name -> text
        self.block_system: dict[str, str] = {}     # block SID -> system xml name
        self.blocks: dict[str, dict[str, Any]] = {}  # SID -> block record
        self.lines: dict[tuple[str, str], str] = {}  # (dst sid, in port) -> src sid
        self.sid_to_path: dict[str, str] = {}      # SID -> hierarchical path
        self._load(slx_path)

    def _load(self, slx_path: Path) -> None:
        with zipfile.ZipFile(slx_path) as zf:
            names = sorted(
                name for name in zf.namelist()
                if name.startswith("simulink/systems/system_") and name.endswith(".xml")
            )
            for name in names:
                self.systems[name] = zf.read(name).decode("utf-8", errors="replace")

        # Index blocks per system and resolve the parent SID from the file name
        # (system_<parentSid>.xml is the inside of block <parentSid>).
        parents: dict[str, str] = {}  # system xml name -> parent block SID
        for xml_name, text in self.systems.items():
            match = re.search(r"system_(\d+)\.xml$", xml_name)
            if match:
                parents[xml_name] = match.group(1)
            self._index_blocks(xml_name, text)

        # Build hierarchical block paths from the root system.
        root_name = "simulink/systems/system_root.xml"
        self.sid_to_path = {}
        if root_name in self.systems:
            self._build_paths(root_name, self.model_name, parents)
        # Fallback: any block without a path gets a flat model/name path.
        for sid, block in self.blocks.items():
            if not self.sid_to_path.get(sid):
                self.sid_to_path[sid] = f"{self.model_name}/{block['name']}"

        # Index Lines: (dst sid, dst port) -> src sid (the source block). One
        # line may fan out through <Branch> elements; every branch carries Dst.
        for xml_name, text in self.systems.items():
            for line in re.finditer(r"<Line\b.*?</Line>|<Line\b[^>]*/>", text, re.S):
                body = line.group(0)
                src_m = re.search(r'<P Name="Src">([^#<]+)#(?:out|in):(\d+)</P>', body)
                if not src_m:
                    continue
                src_sid = src_m.group(1)
                dsts = re.findall(r'<P Name="Dst">([^#<]+)#(?:out|in):(\d+)</P>', body)
                if not dsts:
                    # Dst may live on a Branch
                    dsts = re.findall(r'<Branch\b[^>]*>\s*<P Name="Dst">([^#<]+)#(?:out|in):(\d+)</P>', body, re.S)
                for dst_sid, dst_port in dsts:
                    self.lines[(dst_sid, dst_port)] = src_sid

    def _index_blocks(self, xml_name: str, text: str) -> None:
        for match in re.finditer(
            r'<Block BlockType="([^"]+)" Name="([^"]*)" SID="(\d+)"[^>]*>(.*?)</Block>', text, re.S
        ):
            block_type, name, sid, body = match.groups()
            params = {name: html.unescape(value) for name, value in re.findall(r'<P Name="([^"]+)">([^<]*)</P>', body)}
            port_counts = re.search(r'<PortCounts\b([^>]*)/>', body)
            ports = {}
            if port_counts:
                for key, value in re.findall(r'(\w+)="(\d+)"', port_counts.group(1)):
                    ports[key] = int(value)
            self.blocks[sid] = {
                "sid": sid,
                "type": block_type,
                "name": name,
                "system": xml_name,
                "params": params,
                "ports": ports,
            }
            self.block_system[sid] = xml_name

    def _build_paths(self, xml_name: str, prefix: str, parents: dict[str, str]) -> None:
        for sid, block in self.blocks.items():
            if block["system"] != xml_name:
                continue
            path = f"{prefix}/{block['name']}" if prefix else block["name"]
            self.sid_to_path[sid] = path
            if block["type"] == "SubSystem":
                inner = f"simulink/systems/system_{sid}.xml"
                if inner in self.systems:
                    self._build_paths(inner, path, parents)

    def trace_input(self, sid: str, port: str, depth: int = 0,
                    visited: set[tuple[str, str]] | None = None) -> tuple[str, Any] | None:
        """Trace an input port back to a root Inport or literal Constant.

        Returns ("input", name) or ("const", value) or None when the trace is
        not statically resolvable (crossed an unsupported block, or depth cap).
        Crosses subsystem boundaries and unique From/Goto tag pairs; the SLX
        XML often omits the Inport Port parameter, so boundary crossings are
        only followed when that mapping is actually present.
        """
        if visited is None:
            visited = set()
        if depth > MAX_DEPTH or (sid, port) in visited:
            return None
        visited.add((sid, port))
        src_sid = self.lines.get((sid, port))
        if src_sid is None:
            return None
        block = self.blocks.get(src_sid)
        if block is None:
            return None
        if block["type"] == "Inport":
            name = block["name"]
            if name in self.root_inputs:
                return ("input", name)
            # Subsystem entry: map the internal Inport to the parent block's
            # input port; without the stored Port parameter the mapping is
            # ambiguous, so stay conservative and do not guess.
            port_no = block["params"].get("Port", "")
            if not port_no:
                return None
            parent_sid = self._parent_of_system(block["system"])
            if parent_sid is None:
                return None
            return self.trace_input(parent_sid, port_no, depth + 1, visited)
        if block["type"] == "Constant":
            value = block["params"].get("Value")
            if value is None or value == "":
                return None
            return ("const", value)
        if block["type"] == "Outport":
            # Inside a subsystem: map to the parent block's input port.
            parent_sid = self._parent_of_system(block["system"])
            if parent_sid is None:
                return None
            port_no = block["params"].get("Port", "1")
            return self.trace_input(parent_sid, port_no, depth + 1, visited)
        if block["type"] == "From":
            tag = block["params"].get("GotoTag", "")
            same_system = [
                gid for gid, gblock in self.blocks.items()
                if gblock["type"] == "Goto" and gblock["params"].get("GotoTag", "") == tag
                and gblock["system"] == block["system"]
            ]
            candidates = same_system or [
                gid for gid, gblock in self.blocks.items()
                if gblock["type"] == "Goto" and gblock["params"].get("GotoTag", "") == tag
            ]
            if len(candidates) != 1:
                return None  # ambiguous or missing Goto target
            return self.trace_input(candidates[0], "1", depth + 1, visited)
        return None

    def _parent_of_system(self, xml_name: str) -> str | None:
        match = re.search(r"system_(\d+)\.xml$", xml_name)
        return match.group(1) if match else None

    def path_of(self, sid: str) -> str:
        return self.sid_to_path.get(sid) or f"{self.model_name}/{self.blocks.get(sid, {}).get('name', sid)}"


def obligation(*, sid: str, model: str, path: str, outcome: str, status: str,
               match: dict[str, Any] | None = None, params: dict[str, Any] | None = None,
               reason: str = "") -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": f"{sid}_{re.sub(r'[^A-Za-z0-9]+', '_', outcome)[:48]}",
        "model": model,
        "block_path": path,
        "sid": sid,
        "coverage_class": "Decision",
        "required_outcome": outcome,
        "status": status,
        "match": {"inputs": {}, "params": {}},
        "reason": reason,
    }
    if match:
        item["match"] = {"inputs": match, "params": {}}
    if params:
        item["match"] = {"inputs": item["match"]["inputs"], "params": params}
    return item


def _control(inputs: dict[int, tuple[str, Any]], port: int) -> tuple[str, Any] | None:
    kind, value = inputs.get(port, (None, None))
    if kind in {"input", "const", "param"} and value not in (None, ""):
        return (kind, value)
    return None


def generate_from_blocks(blocks_data: dict[str, Any], model: str) -> list[dict[str, Any]]:
    """Generate Decision obligations from `simulink-ut-decision-blocks/v1`
    evidence collected by collect_decision_blocks.m (MATLAB authority)."""
    items: list[dict[str, Any]] = []
    raw_blocks = blocks_data.get("blocks") or []
    if isinstance(raw_blocks, dict):
        raw_blocks = [raw_blocks]
    for rec in raw_blocks:
        btype = rec.get("type")
        if btype not in DEFAULT_TARGET_BLOCK_TYPES:
            continue
        path = str(rec.get("path") or "")
        sid = str(rec.get("sid") or rec.get("path") or "")
        params = rec.get("params") or {}
        raw_inputs = rec.get("inputs") or []
        if isinstance(raw_inputs, dict):
            raw_inputs = [raw_inputs]
        inputs: dict[int, tuple[str, Any]] = {}
        for entry in raw_inputs:
            try:
                port = int(entry.get("port"))
            except (TypeError, ValueError):
                continue
            inputs[port] = (entry.get("src_kind"), entry.get("src_value"))

        if btype == "Switch":
            criteria = params.get("Criteria", "u2 >= Threshold")
            threshold = str(params.get("Threshold", ""))
            control = _control(inputs, 3)
            if control is None:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch true ({criteria})", status="unresolved",
                                        reason="missing_static_controller: 判据输入 in:3 未解析到根输入/常量"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch false ({criteria})", status="unresolved",
                                        reason="missing_static_controller: 判据输入 in:3 未解析到根输入/常量"))
                continue
            kind, value = control
            if kind == "param":
                if "~= 0" in criteria or "== 0" in criteria:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="required",
                                            params={value: 1}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="required",
                                            params={value: 0}))
                else:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="unresolved",
                                            reason=f"unsupported_criteria: {criteria}"))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="unresolved",
                                            reason=f"unsupported_criteria: {criteria}"))
            elif kind == "input":
                if "~= 0" in criteria or "== 0" in criteria:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="required",
                                            match={value: 1}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="required",
                                            match={value: 0}))
                elif _numeric(threshold):
                    tv = float(threshold)
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="required",
                                            match={value: tv + 1}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="required",
                                            match={value: tv - 1}))
                else:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="unresolved",
                                            reason=f"unsupported_criteria: {criteria}"))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="unresolved",
                                            reason=f"unsupported_criteria: {criteria}"))
            else:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch true ({criteria})", status="unreachable",
                                        reason=f"literal_constant_control: 判据固定为常量 {value}"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch false ({criteria})", status="unreachable",
                                        reason=f"literal_constant_control: 判据固定为常量 {value}"))

        elif btype == "RelationalOperator":
            operator = str(params.get("Operator", "") or "")
            left = _control(inputs, 1)
            right = _control(inputs, 2)
            if left is None:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational true ({operator or '?'})", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 未解析"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational false ({operator or '?'})", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 未解析"))
                continue
            # Calibration banks such as `MX >= MN` are controlled by two
            # workspace parameters: drive the parameters themselves.
            if left[0] == "param" and right is not None and right[0] == "param":
                pairs = {
                    ">=": (100, 0), ">": (100, 0),
                    "<=": (0, 100), "<": (0, 100),
                    "==": (5, 5), "~=": (5, 6),
                }
                if operator in pairs:
                    true_a, true_b = pairs[operator]
                    false_a, false_b = (true_b, true_a)
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"relational true ({left[1]} {operator} {right[1]})",
                                            status="required",
                                            params={left[1]: true_a, right[1]: true_b}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"relational false ({left[1]} {operator} {right[1]})",
                                            status="required",
                                            params={left[1]: false_a, right[1]: false_b}))
                    continue
            if left[0] == "input" and right is not None and right[0] == "const":
                c = _float_or_none(right[1])
                pairs = {
                    "==": (c, c + 1), "~=": (c + 1, c),
                    ">": (c + 1, c), ">=": (c, c - 1),
                    "<": (c - 1, c), "<=": (c, c + 1),
                }
                if c is not None and operator in pairs:
                    true_val, false_val = pairs[operator]
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"relational true ({left[1]} {operator} {right[1]})",
                                            status="required", match={left[1]: true_val}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"relational false ({left[1]} {operator} {right[1]})",
                                            status="required", match={left[1]: false_val}))
                    continue
            if left[0] == "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational true ({operator or 'sign'})", status="required",
                                        match={left[1]: 1}))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational false ({operator or 'sign'})", status="required",
                                        match={left[1]: 0}))
            else:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational true ({operator or '?'})", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 不是根输入/参数组合"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational false ({operator or '?'})", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 不是根输入/参数组合"))

        elif btype == "MinMax":
            function = params.get("Function", "") or "min"
            count = int(_float_or_none(str(params.get("Inputs", ""))) or 2)
            traces = []
            for port in range(1, count + 1):
                c = _control(inputs, port)
                traces.append((port, c))
            if any(c is None for _, c in traces):
                for port, _ in traces:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"input {port} wins ({function})", status="unresolved",
                                            reason="missing_static_controller: 输入端口未解析到根输入/参数"))
                continue
            if function == "min":
                ordered = sorted(range(1, count + 1), key=lambda p: -p)
            else:
                ordered = sorted(range(1, count + 1))
            for rank, port in enumerate(ordered):
                match: dict[str, Any] = {}
                param_match: dict[str, Any] = {}
                for other_port, (kind, other_name) in traces:
                    value = 3 if other_port == port else (2 if rank == 0 else 1)
                    if kind == "param":
                        param_match[other_name] = value
                    else:
                        match[other_name] = value
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"input {port} wins ({function})", status="required",
                                        match=match or None, params=param_match or None))

        elif btype == "MultiPortSwitch":
            count = int(_float_or_none(str(params.get("Inputs", ""))) or 2) - 1
            selector = _control(inputs, 1)
            if selector is None or selector[0] != "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="selector valid", status="unresolved",
                                        reason="missing_static_controller: selector in:1 未解析到根输入"))
                continue
            name = selector[1]
            data_port_order = params.get("DataPortOrder", "One-based")
            values = range(count) if "Zero" in str(data_port_order) else range(1, count + 1)
            for value in values:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"selector={value}", status="required",
                                        match={name: value}))

        elif btype == "Saturate":
            u = _float_or_none(str(params.get("UpperLimit", "")))
            l = _float_or_none(str(params.get("LowerLimit", "")))
            source = _control(inputs, 1)
            if u is None or l is None:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="saturate below/inside/above", status="unresolved",
                                        reason="missing_limits: UpperLimit/LowerLimit 不是字面数值"))
                continue
            if source is None or source[0] != "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="saturate below/inside/above", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 未解析到根输入"))
                continue
            name = source[1]
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome="saturate below lower limit", status="required",
                                    match={name: l - 1}))
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome="saturate inside limits", status="required",
                                    match={name: (u + l) / 2.0}))
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome="saturate above upper limit", status="required",
                                    match={name: u + 1}))

        elif btype == "Abs":
            source = _control(inputs, 1)
            if source is None:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="abs positive/negative", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 未解析到根输入"))
                continue
            kind, value = source
            if kind == "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="abs positive", status="required", match={value: 1}))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="abs negative", status="required", match={value: -1}))
            else:
                negative = (float(value) < 0) if _numeric(value) else False
                if negative:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome="abs positive", status="unreachable",
                                            reason=f"literal_constant_input: 输入固定为常量 {value} < 0"))
                else:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome="abs negative", status="unreachable",
                                            reason=f"literal_constant_input: 输入固定为常量 {value} >= 0"))

    raw_gates = blocks_data.get("enable_ports") or []
    if isinstance(raw_gates, dict):
        raw_gates = [raw_gates]
    for gate in raw_gates:
        path = str(gate.get("path") or "")
        sid = str(gate.get("path") or "")
        raw_gate_inputs = gate.get("inputs") or []
        if isinstance(raw_gate_inputs, dict):
            raw_gate_inputs = [raw_gate_inputs]
        for entry in raw_gate_inputs:
            if entry.get("src_kind") == "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"{gate.get('type', 'gate').lower()} activated", status="required",
                                        match={entry.get("src_value"): 1}))
    return items


def _numeric(text: str) -> bool:
    try:
        float(str(text).replace(",", "."))
        return True
    except (TypeError, ValueError):
        return False


def _float_or_none(text: str) -> float | None:
    try:
        return float(str(text).replace(",", "."))
    except (TypeError, ValueError):
        return None


def generate_obligations(slx: SlxModel, model: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for sid, block in slx.blocks.items():
        btype = block["type"]
        if btype not in DEFAULT_TARGET_BLOCK_TYPES:
            continue
        path = slx.path_of(sid)
        params = block["params"]

        if btype == "Switch":
            criteria = params.get("Criteria", "u2 >= Threshold")
            threshold = params.get("Threshold", "")
            control = slx.trace_input(sid, "3")
            if control is None:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch true ({criteria})", status="unresolved",
                                        reason="missing_static_controller: 判据输入 in:3 上游不是根 Inport/字面常量"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch false ({criteria})", status="unresolved",
                                        reason="missing_static_controller: 判据输入 in:3 上游不是根 Inport/字面常量"))
                continue
            kind, value = control
            if kind == "input":
                if "~= 0" in criteria or "== 0" in criteria:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="required",
                                            match={value: 1}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="required",
                                            match={value: 0}))
                elif threshold != "" and threshold.replace(".", "", 1).isdigit():
                    t = float(threshold)
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="required",
                                            match={value: t + 1}))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="required",
                                            match={value: t - 1}))
                else:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch true ({criteria})", status="unresolved",
                                            reason=f"unsupported_criteria: {criteria}"))
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"switch false ({criteria})", status="unresolved",
                                            reason=f"unsupported_criteria: {criteria}"))
            else:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch true ({criteria})", status="unreachable",
                                        reason=f"literal_constant_control: 判据固定为常量 {value}"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"switch false ({criteria})", status="unreachable",
                                        reason=f"literal_constant_control: 判据固定为常量 {value}"))

        elif btype == "RelationalOperator":
            operator = params.get("Operator", "")
            if not operator:
                name = block["name"].lower()
                mapping = {
                    "greaterorequal": ">=", "greaterthanorequal": ">=", "ge": ">=",
                    "greater": ">", "greaterthan": ">", "gt": ">",
                    "lessorequal": "<=", "lessthanorequal": "<=", "le": "<=",
                    "less": "<", "lessthan": "<", "lt": "<",
                    "equal": "==", "eq": "==", "notequal": "~=", "ne": "~=",
                }
                for key, op in mapping.items():
                    if key in name:
                        operator = op
                        break
            if not operator:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="relational true", status="unresolved",
                                        reason="missing_operator_semantics: XML 未保存 Operator 且块名无法推断"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="relational false", status="unresolved",
                                        reason="missing_operator_semantics: XML 未保存 Operator 且块名无法推断"))
                continue
            left = slx.trace_input(sid, "1")
            right = slx.trace_input(sid, "2")
            if left is None or left[0] != "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational true ({operator})", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 不是根 Inport"))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"relational false ({operator})", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 不是根 Inport"))
                continue
            name = left[1]
            if right is not None and right[0] == "const":
                try:
                    c = float(right[1])
                except ValueError:
                    c = None
                if c is not None:
                    pairs = {
                        "==": (c, c + 1),
                        "~=": (c + 1, c),
                        ">": (c + 1, c),
                        ">=": (c, c - 1),
                        "<": (c - 1, c),
                        "<=": (c, c + 1),
                    }
                    if operator in pairs:
                        true_val, false_val = pairs[operator]
                        items.append(obligation(sid=sid, model=model, path=path,
                                                outcome=f"relational true ({name} {operator} {right[1]})",
                                                status="required", match={name: true_val}))
                        items.append(obligation(sid=sid, model=model, path=path,
                                                outcome=f"relational false ({name} {operator} {right[1]})",
                                                status="required", match={name: false_val}))
                        continue
            # No literal constant on the right: use sign-style values around 0.
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome=f"relational true ({operator})", status="required",
                                    match={name: 1}))
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome=f"relational false ({operator})", status="required",
                                    match={name: 0}))

        elif btype == "MinMax":
            function = params.get("Function", "")
            if not function:
                # Simulink MinMax defaults to min when the Function parameter is absent.
                function = "min"
            count = block["ports"].get("in", 2)
            traces = [(port, slx.trace_input(sid, str(port))) for port in range(1, count + 1)]
            if any(t is None or t[0] != "input" for _, t in traces):
                for port, _ in traces:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome=f"input {port} wins ({function})", status="unresolved",
                                            reason="missing_static_controller: 输入端口未直接连接根 Inport"))
                continue
            # Distinct relative values: winner gets the extreme, others lower
            # (max) or higher (min), strictly ordered so no ties occur.
            if function == "min":
                ordered = sorted(range(1, count + 1), key=lambda p: -p)
            else:
                ordered = sorted(range(1, count + 1))
            for rank, port in enumerate(ordered):
                match: dict[str, Any] = {}
                for other_port, (_, other_name) in enumerate(traces, start=1):
                    value = 3 if other_port == port else (2 if rank == 0 else 1)
                    match[other_name] = value
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"input {port} wins ({function})", status="required",
                                        match=match))

        elif btype == "MultiPortSwitch":
            count = block["ports"].get("in", 2) - 1
            selector = slx.trace_input(sid, "1")
            if selector is None or selector[0] != "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="selector valid", status="unresolved",
                                        reason="missing_static_controller: selector in:1 不是根 Inport"))
                continue
            name = selector[1]
            data_port_order = params.get("DataPortOrder", "One-based")
            values = range(count) if "Zero" in data_port_order else range(1, count + 1)
            for value in values:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome=f"selector={value}", status="required",
                                        match={name: value}))

        elif btype == "Saturate":
            upper = params.get("UpperLimit", "")
            lower = params.get("LowerLimit", "")
            try:
                u, l = float(upper), float(lower)
            except ValueError:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="saturate below/inside/above", status="unresolved",
                                        reason="missing_limits: UpperLimit/LowerLimit 不是字面数值"))
                continue
            source = slx.trace_input(sid, "1")
            if source is None or source[0] != "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="saturate below/inside/above", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 不是根 Inport"))
                continue
            name = source[1]
            mid = (u + l) / 2.0
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome="saturate below lower limit", status="required",
                                    match={name: l - 1}))
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome="saturate inside limits", status="required",
                                    match={name: mid}))
            items.append(obligation(sid=sid, model=model, path=path,
                                    outcome="saturate above upper limit", status="required",
                                    match={name: u + 1}))

        elif btype == "Abs":
            source = slx.trace_input(sid, "1")
            if source is None:
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="abs positive/negative", status="unresolved",
                                        reason="missing_static_controller: 输入 in:1 无法静态追踪"))
                continue
            kind, value = source
            if kind == "input":
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="abs positive", status="required", match={value: 1}))
                items.append(obligation(sid=sid, model=model, path=path,
                                        outcome="abs negative", status="required", match={value: -1}))
            else:
                try:
                    negative = float(value) < 0
                except ValueError:
                    negative = False
                if negative:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome="abs positive", status="unreachable",
                                            reason=f"literal_constant_input: 输入固定为常量 {value} < 0"))
                else:
                    items.append(obligation(sid=sid, model=model, path=path,
                                            outcome="abs negative", status="unreachable",
                                            reason=f"literal_constant_input: 输入固定为常量 {value} >= 0"))

    # Enable/trigger ports of conditionally executed subsystems: activating the
    # gate is itself a decision obligation that unlocks every contained block.
    for sid, block in slx.blocks.items():
        if block["type"] not in {"Enable", "Trigger"}:
            continue
        source = slx.trace_input(sid, "1")
        if source is None or source[0] != "input":
            continue
        items.append(obligation(sid=sid, model=model, path=slx.path_of(sid),
                                outcome=f"{block['type'].lower()} activated", status="required",
                                match={source[1]: 1}))
    return items


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slx", default="", help="Path to the .slx model file")
    parser.add_argument("--interface", default="", help="tcsd-model-interface/v1 JSON with root input names")
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-depth", type=int, default=MAX_DEPTH)
    parser.add_argument("--blocks", default="", help="simulink-ut-decision-blocks/v1 JSON from collect_decision_blocks.m (MATLAB authority)")
    args = parser.parse_args()

    if args.blocks:
        if not args.slx and not args.interface:
            parser.error("--blocks 模式必须提供 --slx（或 --interface）以确定模型名")
        blocks_data = json.loads(Path(args.blocks).read_text(encoding="utf-8"))
        model = str(blocks_data.get("model") or Path(args.slx).stem) if args.slx else str(blocks_data.get("model") or "")
        items = generate_from_blocks(blocks_data, model)
        from collections import Counter
        report = {
            "schema": SCHEMA,
            "model": model,
            "summary": {
                "block_count": len(blocks_data.get("blocks", [])),
                "obligation_count": len(items),
                **{k: v for k, v in Counter(item["status"] for item in items).items()},
            },
            "obligations": items,
        }
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"output": str(output), **report["summary"]}, ensure_ascii=False))
        return 0

    interface = json.loads(Path(args.interface).read_text(encoding="utf-8"))
    model = str(interface.get("model") or Path(args.slx).stem)
    inputs = interface.get("inputs", [])
    if isinstance(inputs, dict):
        inputs = list(inputs.keys())
    inputs = [str(item.get("name") if isinstance(item, dict) else item) for item in inputs]

    slx = SlxModel(Path(args.slx), model, inputs)
    items = generate_obligations(slx, model)

    from collections import Counter
    report = {
        "schema": SCHEMA,
        "model": model,
        "summary": {
            "block_count": len(slx.blocks),
            "obligation_count": len(items),
            **{k: v for k, v in Counter(item["status"] for item in items).items()},
        },
        "obligations": items,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), **report["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
