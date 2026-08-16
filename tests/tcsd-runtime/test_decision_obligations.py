#!/usr/bin/env python3
"""Regression tests for single-operator trace normalization and
non-logical decision obligations (build_decision_obligations.py)."""

from __future__ import annotations

import importlib.util
import json
import unittest
import zipfile
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "hermes" / "tcsd-runtime" / "scripts"


def script(name: str):
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), SCRIPTS / name)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ROOT_XML = """<?xml version="1.0" encoding="utf-8"?>
<System>
  <Block BlockType="Inport" Name="SigA" SID="1"><P Name="Port">1</P></Block>
  <Block BlockType="Inport" Name="SigB" SID="2"><P Name="Port">2</P></Block>
  <Block BlockType="SubSystem" Name="Sub" SID="10"><PortCounts in="2" out="1"/></Block>
  <Line><P Name="Src">1#out:1</P><P Name="Dst">10#in:1</P></Line>
  <Line><P Name="Src">2#out:1</P><P Name="Dst">10#in:2</P></Line>
</System>
"""

SUB_XML = """<?xml version="1.0" encoding="utf-8"?>
<System>
  <Block BlockType="Inport" Name="InA" SID="11"><P Name="Port">1</P></Block>
  <Block BlockType="Inport" Name="InB" SID="12"><P Name="Port">2</P></Block>
  <Block BlockType="Switch" Name="Switch1" SID="20"><P Name="Criteria">u2 ~= 0</P></Block>
  <Block BlockType="Constant" Name="C1" SID="21"><P Name="Value">0.001</P></Block>
  <Block BlockType="Abs" Name="Abs1" SID="22"></Block>
  <Block BlockType="RelationalOperator" Name="GreaterOrEqual" SID="23"><P Name="Operator">&gt;=</P></Block>
  <Line><P Name="Src">11#out:1</P><P Name="Dst">20#in:1</P></Line>
  <Line><P Name="Src">12#out:1</P><P Name="Dst">20#in:2</P></Line>
  <Line><P Name="Src">12#out:1</P><P Name="Dst">20#in:3</P></Line>
  <Line><P Name="Src">21#out:1</P><P Name="Dst">22#in:1</P></Line>
  <Line><P Name="Src">11#out:1</P><P Name="Dst">23#in:1</P></Line>
  <Line><P Name="Src">21#out:1</P><P Name="Dst">23#in:2</P></Line>
</System>
"""


def make_fake_slx(tmpdir: Path) -> Path:
    slx = tmpdir / "FakeModel.slx"
    with zipfile.ZipFile(slx, "w") as zf:
        zf.writestr("simulink/systems/system_root.xml", ROOT_XML)
        zf.writestr("simulink/systems/system_10.xml", SUB_XML)
    return slx


class SingleOperatorTraceTests(unittest.TestCase):
    def test_single_operator_dict_trace_builds_ir_without_crashing(self) -> None:
        coverage_ir = script("build_coverage_ir.py")
        trace = {
            "schema": "simulink-ut-logical-mcdc-trace/v2",
            "model": "FakeModel",
            "operators": {"id": "FakeModel:1", "block_path": "FakeModel/AND", "sid": "FakeModel:1", "operator": "AND"},
        }
        result = coverage_ir.build_ir(trace)
        self.assertEqual(result["schema"], coverage_ir.SCHEMA)
        self.assertTrue(any(item["coverage_class"] == "Decision" for item in result["items"]))

    def test_single_probe_dict_is_accepted(self) -> None:
        obligations = script("build_probe_mcdc_obligations.py")
        report = {
            "model": "FakeModel",
            "probes": {"id": "FakeModel:1", "block_path": "FakeModel/AND", "sid": "FakeModel:1", "operator": "AND",
                       "inputs": [{"index": 1}], "port_count": 2},
            "observations": [],
        }
        result = obligations.build_for_model("FakeModel", report, overrides={}, missing_status="unresolved")
        # Must not raise; vector obligations are generated for the AND probe.
        self.assertGreaterEqual(len(result["obligations"]), 2)


class DecisionObligationXmlTests(unittest.TestCase):
    def test_xml_static_obligations(self) -> None:
        tmp = Path(__file__).resolve().parent / "_tmp_decision_obligations"
        tmp.mkdir(exist_ok=True)
        try:
            slx = make_fake_slx(tmp)
            builder = script("build_decision_obligations.py")
            model = builder.SlxModel(slx, "FakeModel", ["SigA", "SigB"])
            items = builder.generate_obligations(model, "FakeModel")
            by_status = {}
            for item in items:
                by_status.setdefault(item["status"], []).append(item)
            # Switch controlled by root input SigB -> required true/false
            switch_items = [i for i in items if i["sid"] == "20"]
            self.assertTrue(any(i["status"] == "required" and i["match"]["inputs"].get("SigB") == 1 for i in switch_items))
            self.assertTrue(any(i["status"] == "required" and i["match"]["inputs"].get("SigB") == 0 for i in switch_items))
            # Abs fed by literal constant 0.001 -> negative side unreachable
            abs_items = [i for i in items if i["sid"] == "22"]
            self.assertTrue(any(i["status"] == "unreachable" and "negative" in i["required_outcome"] for i in abs_items))
            # RelationalOperator with constant right side -> exact boundary values
            rel_items = [i for i in items if i["sid"] == "23"]
            values = {i["required_outcome"]: i["match"]["inputs"] for i in rel_items if i["status"] == "required"}
            # "SigA >= 0.001": true at 0.001, false below (0.001 - 1)
            self.assertEqual(values.get("relational true (SigA >= 0.001)", {}).get("SigA"), 0.001)
            self.assertEqual(values.get("relational false (SigA >= 0.001)", {}).get("SigA"), -0.999)
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)


class DecisionObligationBlocksTests(unittest.TestCase):
    def test_blocks_mode_obligations(self) -> None:
        builder = script("build_decision_obligations.py")
        blocks_data = {
            "model": "Mock",
            "blocks": [
                {"path": "Mock/Switch1", "sid": "10", "type": "Switch",
                 "params": {"Criteria": "u2 ~= 0"},
                 "inputs": [{"port": 3, "src_kind": "input", "src_value": "Ena"}]},
                {"path": "Mock/Abs1", "sid": "11", "type": "Abs", "params": {},
                 "inputs": [{"port": 1, "src_kind": "const", "src_value": "0.001"}]},
                {"path": "Mock/Mm1", "sid": "12", "type": "MinMax", "params": {"Function": "max", "Inputs": "2"},
                 "inputs": [{"port": 1, "src_kind": "input", "src_value": "SigA"},
                            {"port": 2, "src_kind": "input", "src_value": "SigB"}]},
            ],
            "enable_ports": [{"path": "Mock/Sub/Enable", "type": "Enable",
                              "inputs": [{"port": 1, "src_kind": "input", "src_value": "Ena"}]}],
        }
        items = builder.generate_from_blocks(blocks_data, "Mock")
        required = {i["required_outcome"]: i for i in items if i["status"] == "required"}
        self.assertIn("switch true (u2 ~= 0)", required)
        self.assertEqual(required["switch true (u2 ~= 0)"]["match"]["inputs"], {"Ena": 1})
        unreachable = [i for i in items if i["status"] == "unreachable"]
        self.assertTrue(any("negative" in i["required_outcome"] for i in unreachable))
        wins = [i for i in items if "wins" in i["required_outcome"]]
        self.assertEqual(len(wins), 2)
        self.assertNotEqual(wins[0]["match"]["inputs"], wins[1]["match"]["inputs"])
        self.assertTrue(any(i["required_outcome"] == "enable activated" for i in items))

    def test_blocks_mode_parameter_bank_obligations(self) -> None:
        builder = script("build_decision_obligations.py")
        blocks_data = {
            "model": "Mock",
            "blocks": [
                {"path": "Mock/MXGE", "sid": "30", "type": "RelationalOperator",
                 "params": {"Operator": ">="},
                 "inputs": [{"port": 1, "src_kind": "param", "src_value": "Max_C"},
                            {"port": 2, "src_kind": "param", "src_value": "Min_C"}]},
                {"path": "Mock/Sw", "sid": "31", "type": "Switch",
                 "params": {"Criteria": "u2 ~= 0"},
                 "inputs": [{"port": 3, "src_kind": "param", "src_value": "Ovrd_C"}]},
                {"path": "Mock/Mm", "sid": "32", "type": "MinMax",
                 "params": {"Function": "max", "Inputs": "2"},
                 "inputs": [{"port": 1, "src_kind": "input", "src_value": "SigA"},
                            {"port": 2, "src_kind": "param", "src_value": "Lim_C"}]},
            ],
            "enable_ports": [],
        }
        items = builder.generate_from_blocks(blocks_data, "Mock")
        rel = [i for i in items if i["sid"] == "30" and i["status"] == "required"]
        self.assertEqual(len(rel), 2)
        true_item = next(i for i in rel if "true" in i["required_outcome"])
        self.assertEqual(true_item["match"]["params"], {"Max_C": 100, "Min_C": 0})
        sw = [i for i in items if i["sid"] == "31" and i["status"] == "required"]
        self.assertEqual(len(sw), 2)
        self.assertIn({"Ovrd_C": 1}, [i["match"]["params"] for i in sw])
        mm = [i for i in items if i["sid"] == "32" and i["status"] == "required"]
        self.assertEqual(len(mm), 2)
        # mixed input + param winner assignments land in their own maps
        self.assertTrue(any(i["match"]["inputs"].get("SigA") is not None and i["match"]["params"].get("Lim_C") is not None for i in mm))

    def test_ir_merges_decision_obligations(self) -> None:
        coverage_ir = script("build_coverage_ir.py")
        trace = {"model": "Mock", "operators": []}
        decision = {"obligations": [
            {"id": "d1", "model": "Mock", "block_path": "Mock/S", "sid": "1", "coverage_class": "Decision",
             "required_outcome": "switch true", "status": "required",
             "match": {"inputs": {"Ena": 1}, "params": {}}},
        ]}
        result = coverage_ir.build_ir(trace, decision_obligations=decision)
        item = next(value for value in result["items"] if value["id"] == "d1")
        self.assertEqual(item["coverage_class"], "Decision")
        self.assertEqual(item["reachability"]["status"], "required")
        self.assertEqual(item["controller"]["direct_inputs"], {"Ena": 1})


if __name__ == "__main__":
    unittest.main()
