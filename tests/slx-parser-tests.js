import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateModelFactBundle, createEmptyModelFactBundle, MODEL_FACT_FIELDS } from "../src/services/model-fact-bundle.js";
import { SlxModelFactAdapter } from "../src/services/slx-model-fact-adapter.js";
import { SlxModelAnalysisService, SlxAnalysisError, appendRawSlxSemanticFactsFromXml } from "../src/services/slx-model-analysis-service.js";
import { MatlabMcpClient, MatlabMcpError } from "../src/services/matlab-mcp-client.js";
import { ExtractionService } from "../src/services/extraction-service.js";
import { ModelRequirementViewService } from "../src/services/model-requirement-view-service.js";
import { buildZipArchive } from "./zip-fixture.js";

// ── ModelFactBundle ──

async function testModelFactBundleEmptyIsValid() {
  const bundle = createEmptyModelFactBundle();
  const result = validateModelFactBundle(bundle);
  assert.equal(result.valid, true, "Empty ModelFactBundle should be valid");
  assert.equal(result.error, null);
}

async function testModelFactBundleMissingField() {
  const bundle = createEmptyModelFactBundle();
  delete bundle.states;
  const result = validateModelFactBundle(bundle);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes("states"), "Error should mention missing field");
}

async function testModelFactBundleArrayFieldNotArray() {
  const bundle = createEmptyModelFactBundle();
  bundle.interfaces = "not-an-array";
  const result = validateModelFactBundle(bundle);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes("interfaces"));
}

async function testModelFactBundleFactMissingLocation() {
  const bundle = createEmptyModelFactBundle();
  bundle.states.push({ name: "Active" });
  const result = validateModelFactBundle(bundle);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes("location"));
}

async function testModelFactBundleFactWithLocationIsValid() {
  const bundle = createEmptyModelFactBundle();
  bundle.states.push({ name: "Active", location: "model/Subsystem/Chart/Active" });
  const result = validateModelFactBundle(bundle);
  assert.equal(result.valid, true);
}

async function testModelFactBundleNull() {
  const result = validateModelFactBundle(null);
  assert.equal(result.valid, false);
}

// ── SlxModelFactAdapter ──

async function testAdapterConvertsBundleToExtraction() {
  const adapter = new SlxModelFactAdapter();
  const file = { id: "file-1", originalName: "test_model.slx" };
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "test_model.slx", modelName: "TestModel" };
  bundle.interfaces.push({ name: "InputSignal", direction: "input", dataType: "double", location: "TestModel/In1" });
  bundle.states.push({ name: "Idle", parent: "ModeChart", location: "TestModel/Subsystem/ModeChart/Idle" });
  bundle.parameters.push({ name: "Threshold", value: 0.5, unit: "V", location: "TestModel/Gain" });
  bundle.derivedSignals.push({ name: "StartUpReq", expression: "KL15 == OFF", inputs: ["KL15"], location: "TestModel/Logic" });

  const extraction = adapter.toExtraction(bundle, file);

  assert.equal(extraction.fileId, "file-1");
  assert.equal(extraction.fileRole, "simulink_slx");
  assert.equal(extraction.fileName, "test_model.slx");
  assert.ok(Array.isArray(extraction.evidence));
  assert.equal(extraction.evidence.length, 4, "Should have evidence for interfaces, states, parameters, derived signals");
}

async function testAdapterEvidenceHasRequiredFields() {
  const adapter = new SlxModelFactAdapter();
  const file = { id: "file-1", originalName: "model.slx" };
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "model.slx", modelName: "M" };
  bundle.interfaces.push({ name: "Out1", direction: "output", location: "M/Out1" });

  const extraction = adapter.toExtraction(bundle, file);
  const evidence = extraction.evidence[0];

  assert.ok(evidence.id, "Evidence must have id");
  assert.equal(evidence.fileId, "file-1");
  assert.equal(evidence.fileRole, "simulink_slx");
  assert.ok(evidence.location, "Evidence must have location");
  assert.ok(evidence.excerpt, "Evidence must have excerpt");
  assert.ok(Array.isArray(evidence.tags), "Evidence must have tags array");
  assert.equal(evidence.tags[0], "interface", "Interface fact should have 'interface' tag");
}

async function testAdapterBlockPathInLocation() {
  const adapter = new SlxModelFactAdapter();
  const file = { id: "f1", originalName: "m.slx" };
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "m.slx", modelName: "M" };
  bundle.states.push({ name: "Running", location: "M/Sub1/Chart/Running" });

  const extraction = adapter.toExtraction(bundle, file);
  assert.equal(extraction.evidence[0].location, "M/Sub1/Chart/Running");
}

async function testAdapterEmptyBundle() {
  const adapter = new SlxModelFactAdapter();
  const file = { id: "f1", originalName: "empty.slx" };
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "empty.slx", modelName: "Empty" };

  const extraction = adapter.toExtraction(bundle, file);
  assert.equal(extraction.evidence.length, 0);
  assert.ok(extraction.summary.includes("Empty"));
}

async function testAdapterNullBundle() {
  const adapter = new SlxModelFactAdapter();
  const file = { id: "f1", originalName: "null.slx" };
  const extraction = adapter.toExtraction(null, file);
  assert.equal(extraction.evidence.length, 0);
  assert.ok(extraction.summary.includes("为空"));
}

async function testAdapterTagMapping() {
  const adapter = new SlxModelFactAdapter();
  const file = { id: "f1", originalName: "m.slx" };
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "m.slx", modelName: "M" };
  bundle.interfaces.push({ name: "In1", location: "M/In1" });
  bundle.subsystems.push({ name: "Sub1", location: "M/Sub1" });
  bundle.states.push({ name: "S1", location: "M/S1" });
  bundle.parameters.push({ name: "P1", value: 1, location: "M/P1" });
  bundle.derivedSignals.push({ name: "D1", expression: "In1 > P1", inputs: ["In1"], location: "M/D1" });
  bundle.logicRules.push({ name: "L1", condition: "x > 0", location: "M/L1" });
  bundle.timing.push({ name: "T1", sampleTime: 0.01, location: "M/T1" });
  bundle.diagnostics.push({ name: "D1", severity: "warn", location: "M/D1" });

  const extraction = adapter.toExtraction(bundle, file);
  const tagMap = {};
  for (const e of extraction.evidence) {
    tagMap[e.tags[0]] = true;
  }

  assert.ok(tagMap.interface, "interfaces → interface");
  assert.ok(tagMap.structure, "subsystems → structure");
  assert.ok(tagMap.state, "states → state");
  assert.ok(tagMap.threshold, "parameters → threshold");
  assert.ok(tagMap.derived_signal, "derivedSignals → derived_signal");
  assert.ok(tagMap.logic, "logicRules → logic");
  assert.ok(tagMap.timing, "timing → timing");
  assert.ok(tagMap.diagnostic, "diagnostics → diagnostic");
}

async function testCompactModelRequirementViewKeepsDerivedStateAndSystemFacts() {
  const service = new ModelRequirementViewService();
  const sourceRefs = [{ fileName: "m.slx", fileRole: "simulink_slx", location: "M/Block", excerpt: "evidence" }];
  const mrv = {
    version: "1.0",
    documentType: "software_requirement",
    sourceAssets: [{ assetId: "json-1", fileName: "low-voltage-model-requirement-view.json", fileRole: "model_requirement_view_json", absolutePath: "/tmp/full.json" }],
    facts: [
      {
        id: "fact-system",
        topic: "系统需求事实",
        behavior: "系统需求：智能补电在 KL15 OFF 且 SOC 低时触发。",
        sourceRefs: [{ fileName: "system.md", fileRole: "extracted_system_requirement", location: "REQ-1", excerpt: "智能补电触发" }]
      },
      {
        id: "fact-derived",
        topic: "派生信号定义",
        behavior: "派生信号 HvCoorn_bStartUpReq = KL15 == OFF and BMS2_N_SOC > 10",
        signals: ["HvCoorn_bStartUpReq", "KL15", "BMS2_N_SOC"],
        sourceRefs
      },
      {
        id: "fact-state",
        topic: "状态与模式",
        behavior: "逻辑规则 WakeUp -> Initial_Settings [StateflowTransition] 条件:HvCoorn_bStartUpReq&&after(2,tick)",
        sourceRefs
      },
      {
        id: "fact-noise",
        topic: "接口与信号",
        behavior: "接口 UnrelatedInternalForwardingSignal (input)",
        sourceRefs
      }
    ]
  };

  const compact = service.buildCompactForGeneration(mrv, {
    requiredTitleOutline: {
      sections: [{ sectionTitle: "智能补电", items: [{ itemTitle: "智能补电激活判断" }] }]
    },
    maxFacts: 3,
    maxBytes: 12000
  });

  const ids = compact.facts.map((fact) => fact.id);
  assert.ok(ids.includes("fact-system"), "system requirement fact should stay");
  assert.ok(ids.includes("fact-derived"), "derived signal fact should stay");
  assert.ok(ids.includes("fact-state"), "Stateflow transition fact should stay");
  assert.ok(!ids.includes("fact-noise"), "low-score interface noise should be dropped");
  assert.equal(compact.sourceAssets[0].absolutePath, undefined, "compact source assets should omit absolutePath");
  assert.equal(compact.compactForGeneration.originalFactCount, 4);
}

async function testCompactModelRequirementViewKeepsLowVoltageCriticalFacts() {
  const service = new ModelRequirementViewService();
  const sourceRefs = [{ fileName: "HvCoorn.slx", fileRole: "simulink_slx", location: "M/Block", excerpt: "evidence" }];
  const mrv = {
    version: "1.0",
    documentType: "software_requirement",
    sourceAssets: [{ assetId: "slx-1", fileName: "HvCoorn.slx", fileRole: "simulink_slx" }],
    facts: [
      {
        id: "fact-system",
        topic: "系统需求事实",
        behavior: "系统需求：智能补电退出需要处理失败次数、休眠和重新唤醒。",
        sourceRefs: [{ fileName: "system.md", fileRole: "system_pdf", location: "REQ-1", excerpt: "智能补电退出" }]
      },
      {
        id: "fact-noise",
        topic: "接口与信号",
        behavior: "接口 CosmeticDisplaySignal (input)",
        sourceRefs
      },
      {
        id: "fact-dcdc",
        topic: "阈值与标定",
        behavior: "模型原始 XML 中存在 DCDC Buck 状态和 HvCoorn_tiMntnFailNoBuckThd_C 标定。",
        sourceRefs
      },
      {
        id: "fact-sleep",
        topic: "派生信号定义",
        behavior: "派生信号 HvCoorn_bAllwShutNet 和 HvCoorn_bAllwSlep 控制允许网络休眠和控制器休眠。",
        sourceRefs
      },
      {
        id: "fact-b9",
        topic: "状态与模式",
        behavior: "高压状态机进入 B9 后重置智能补电失败计数。",
        sourceRefs
      }
    ]
  };

  const compact = service.buildCompactForGeneration(mrv, {
    requiredTitleOutline: {
      sections: [{ sectionTitle: "智能补电", items: [{ itemTitle: "智能补电退出判断" }] }]
    },
    maxFacts: 4,
    maxBytes: 48000
  });

  const ids = compact.facts.map((fact) => fact.id);
  assert.ok(ids.includes("fact-system"), "system requirement fact should stay");
  assert.ok(ids.includes("fact-dcdc"), "DCDC Buck critical fact should stay");
  assert.ok(ids.includes("fact-sleep"), "sleep permission critical fact should stay");
  assert.ok(ids.includes("fact-b9"), "B9 reset critical fact should stay");
  assert.ok(!ids.includes("fact-noise"), "low-score non-critical noise should be dropped");
  assert.ok(compact.compactForGeneration.criticalFactCount >= 3);
}

async function testModelRequirementViewKeepsSignalArrowsAsLogic() {
  const service = new ModelRequirementViewService();
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "m.slx", modelName: "M" };
  bundle.logicRules.push({
    name: "SignalRoute",
    description: "logic signalA -> blk_1.signalA",
    location: "M/SignalRoute"
  });
  bundle.logicRules.push({
    name: "Idle->Run",
    description: "StateflowTransition Idle -> Run id=sf_1:2 source=sf_1:1 target=sf_1:3",
    location: "M/Stateflow/1/Idle->Run"
  });

  const extraction = new SlxModelFactAdapter().toExtraction(bundle, { id: "f1", originalName: "m.slx" });
  const mrv = service.build({
    project: { documentType: "software_requirement" },
    assets: [{ id: "f1", originalName: "m.slx", role: "simulink_slx" }],
    extractions: [extraction]
  });

  const signalRoute = mrv.facts.find((fact) => fact.behavior.includes("signalA -> blk_1.signalA"));
  const transition = mrv.facts.find((fact) => fact.behavior.includes("StateflowTransition Idle -> Run"));
  assert.equal(signalRoute.topic, "逻辑与条件");
  assert.equal(transition.topic, "状态与模式");
}

async function testRawSlxDataflowFactsAreGeneric() {
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "generic.slx", modelName: "GenericModel" };

  const rawXml = `
    <System>
      <Block BlockType="Inport" Name="ReqInc" SID="1"></Block>
      <Block BlockType="Inport" Name="ReqDec" SID="2"></Block>
      <Block BlockType="Inport" Name="IncActive" SID="3"></Block>
      <Block BlockType="Switch" Name="SelectRequest" SID="4">
        <P Name="Criteria">u2 ~= 0</P>
      </Block>
      <Block BlockType="Outport" Name="OutTorque" SID="5"></Block>
      <Line><P Name="Src">1#out:1</P><P Name="Dst">4#in:1</P></Line>
      <Line><P Name="Src">3#out:1</P><P Name="Dst">4#in:2</P></Line>
      <Line><P Name="Src">2#out:1</P><P Name="Dst">4#in:3</P></Line>
      <Line><P Name="Src">4#out:1</P><P Name="Dst">5#in:1</P></Line>
    </System>
  `;

  appendRawSlxSemanticFactsFromXml(bundle, { originalName: "generic.slx" }, rawXml);

  const dataflowFact = bundle.logicRules.find((fact) => fact.blockType === "raw_slx_dataflow");
  assert.ok(dataflowFact, "raw SLX XML should produce generic dataflow facts");
  assert.ok(dataflowFact.name.startsWith("raw_slx_dataflow_"), "fact name should use generic dataflow prefix");
  assert.ok(!dataflowFact.name.includes("torque"), "fact name should not be torque-specific");
  assert.ok(dataflowFact.action.includes("OutTorque"));
  assert.ok(dataflowFact.action.includes("Switch SelectRequest"));
  assert.ok(dataflowFact.action.includes("ReqInc"));
  assert.ok(dataflowFact.action.includes("ReqDec"));
  assert.ok(bundle.traceRefs.some((fact) => fact.name === "raw_slx_xml_dataflow_scan"));
}

async function testRawSlxZipReadingDoesNotRequireUnzip() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slx-zip-reader-"));
  const slxPath = path.join(tempDir, "generic.slx");
  const rawXml = `
    <System>
      <Block BlockType="Inport" Name="InputA" SID="1"></Block>
      <Block BlockType="Switch" Name="SelectA" SID="2">
        <P Name="Criteria">u2 ~= 0</P>
      </Block>
      <Block BlockType="Outport" Name="OutputA" SID="3"></Block>
      <Line><P Name="Src">1#out:1</P><P Name="Dst">2#in:1</P></Line>
      <Line><P Name="Src">1#out:1</P><P Name="Dst">2#in:2</P></Line>
      <Line><P Name="Src">2#out:1</P><P Name="Dst">3#in:1</P></Line>
    </System>
  `;
  await fs.writeFile(
    slxPath,
    buildZipArchive([
      {
        name: "metadata/coreProperties.xml",
        content: "<Metadata>DCDCActSt_buck</Metadata>",
        compressionMethod: 0
      },
      {
        name: "simulink/blockdiagram.xml",
        content: rawXml,
        compressionMethod: 8
      },
      {
        name: "simulink/ignored.xml.bak",
        content: "<System>not an XML entry</System>",
        compressionMethod: 8
      }
    ])
  );

  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "generic.slx", modelName: "GenericModel" };
  const service = new SlxModelAnalysisService({
    analysisBackend: "legacy",
    mcpClient: createFakeMcpClient(bundle)
  });
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    const result = await service.analyze({
      id: "slx-zip",
      originalName: "generic.slx",
      absolutePath: slxPath
    });
    assert.ok(result.logicRules.some((fact) => fact.name === "raw_slx_dcdc_buck_exit_logic"));
    assert.ok(result.logicRules.some((fact) => fact.name.startsWith("raw_slx_dataflow_")));
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// ── SlxModelAnalysisService ──

function createFakeMcpClient(response) {
  return {
    isAvailable: true,
    async analyzeSlx() {
      return response;
    }
  };
}

function createFailingMcpClient(error) {
  return {
    isAvailable: true,
    async analyzeSlx() {
      throw error;
    }
  };
}

function createFakeSatkMcpClient() {
  const calls = [];
  return {
    calls,
    isAvailable: true,
    async analyzeSlx() {
      throw new Error("legacy analyze_slx should not be called");
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });
      if (toolName === "model_overview") {
        return [
          "status: ok",
          "blk_1 Inport WakeUpReq input port dataType=boolean",
          "blk_2 Stateflow Chart ModeChart subsystem",
          "blk_3 Outport PwrMode output port dataType=uint8"
        ].join("\n");
      }
      if (toolName === "model_read" && args.scope === "root") {
        return [
          "status: ok",
          "blk_2 Stateflow Chart ModeChart",
          "blk_4 Switch condition WakeUpReq && Vbat > @Threshold(VbatLowThd)",
          "blk_5 Gain y1 = @Gain(Kp) * u1(blk_1.y1)"
        ].join("\n");
      }
      if (toolName === "model_read") {
        return [
          "status: ok",
          `${args.scope} State Idle -> Active guard [WakeUpReq && Vbat > VbatLowThd] action PwrMode=Active after(2,tick)`
        ].join("\n");
      }
      if (toolName === "model_query_params") {
        return "status: ok\nblk_4 BlockType=Switch Threshold=11.8 V SampleTime=0.01";
      }
      if (toolName === "model_resolve_params") {
        return "status: ok\nVbatLowThd = 11.8\nKp = 2.5";
      }
      throw new Error(`Unexpected tool ${toolName}`);
    }
  };
}

function createNoisySatkMcpClient() {
  const calls = [];
  return {
    calls,
    isAvailable: true,
    async analyzeSlx() {
      throw new Error("legacy analyze_slx should not be called");
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });
      if (toolName === "model_overview") {
        return [
          "status: ok",
          "message: Output truncated after 2 container(s). Token limit reached.",
          "interface:",
          "Input:",
          "Output:",
          "DataTypeConversion: Convert input signal to specified data type",
          "blk_1 Inport WakeUpReq input port dataType=boolean",
          "blk_3 Outport PwrMode output port dataType=uint8",
          "blk_HvCoorn:4046:255 WaitForReady [State | 3]",
          "blk_HvCoorn:4046:234 Startup [State | 3]"
        ].join("\n");
      }
      if (toolName === "model_read") {
        if (args.scope !== "root") return "status: ok";
        return [
          "status: ok",
          "- id: \"sf_4046:245\" #sf_4046:255->sf_4046:234 Order:2",
          "blk_4 Logic y1 = HvCoorn_bStartUpReq && WakeUpReq"
        ].join("\n");
      }
      if (toolName === "model_query_params") {
        return "status: ok\nblk_1 Name=WakeUpReq BlockType=Inport OutDataTypeStr=boolean";
      }
      throw new Error(`Unexpected tool ${toolName}`);
    }
  };
}

async function testAnalysisServiceSuccess() {
  const fakeBundle = createEmptyModelFactBundle();
  fakeBundle.source = { fileName: "test.slx", modelName: "Test" };
  fakeBundle.interfaces.push({ name: "In1", direction: "input", location: "Test/In1" });

  const service = new SlxModelAnalysisService({
    mcpClient: createFakeMcpClient(fakeBundle)
  });

  const file = { id: "f1", originalName: "test.slx", absolutePath: "/tmp/test.slx" };
  const result = await service.analyze(file);
  assert.equal(result.source.modelName, "Test");
  assert.equal(result.interfaces.length, 1);
}

async function testAnalysisServiceConvertToExtraction() {
  const fakeBundle = createEmptyModelFactBundle();
  fakeBundle.source = { fileName: "test.slx", modelName: "Test" };
  fakeBundle.interfaces.push({ name: "In1", direction: "input", location: "Test/In1" });

  const service = new SlxModelAnalysisService({
    mcpClient: createFakeMcpClient(fakeBundle)
  });

  const file = { id: "f1", originalName: "test.slx", absolutePath: "/tmp/test.slx" };
  const extraction = await service.analyzeAndConvertToExtraction(file);
  assert.equal(extraction.fileRole, "simulink_slx");
  assert.equal(extraction.evidence.length, 1);
  assert.equal(extraction.evidence[0].tags[0], "interface");
}

async function testAnalysisServiceUsesSatkToolsByDefault() {
  const fakeMcpClient = createFakeSatkMcpClient();
  const service = new SlxModelAnalysisService({
    mcpClient: fakeMcpClient,
    simulinkAgenticToolkitVersion: "2026.05.07"
  });

  const file = { id: "f1", originalName: "test.slx", absolutePath: "/tmp/test.slx" };
  const result = await service.analyze(file);

  assert.equal(result.source.generator.kind, "simulink_agentic_toolkit");
  assert.equal(result.source.generator.toolkitVersion, "2026.05.07");
  assert.ok(fakeMcpClient.calls.some((call) => call.toolName === "model_overview"));
  assert.ok(fakeMcpClient.calls.some((call) => call.toolName === "model_read"));
  assert.ok(fakeMcpClient.calls.some((call) => call.toolName === "model_query_params"));
  assert.ok(fakeMcpClient.calls.some((call) => call.toolName === "model_resolve_params"));
  assert.ok(result.interfaces.some((fact) => fact.name === "WakeUpReq"));
  assert.ok(result.states.some((fact) => fact.description.includes("Idle -> Active")));
  assert.ok(result.logicRules.some((fact) => fact.description.includes("WakeUpReq")));
  assert.ok(result.parameters.some((fact) => fact.name === "VbatLowThd" && String(fact.value).includes("11.8")));
  assert.ok(result.derivedSignals.some((fact) => fact.expression.includes("@Gain")));
}

async function testSatkBuilderFiltersNoiseAndResolvesStateflowIds() {
  const fakeMcpClient = createNoisySatkMcpClient();
  const service = new SlxModelAnalysisService({ mcpClient: fakeMcpClient });
  const file = { id: "f1", originalName: "HvCoorn.slx", absolutePath: "/tmp/HvCoorn.slx" };
  const bundle = await service.analyze(file);

  assert.ok(bundle.interfaces.some((fact) => fact.name === "WakeUpReq"));
  assert.ok(bundle.interfaces.some((fact) => fact.name === "PwrMode"));
  assert.ok(bundle.interfaces.some((fact) => fact.name.startsWith("signal_catalog") && fact.description.includes("HvCoorn_bStartUpReq")));
  assert.ok(!bundle.interfaces.some((fact) => /^(message|interface|Input|Output|DataTypeConversion)$/i.test(fact.name)));

  const transition = bundle.states.find((fact) => fact.description.includes("StateflowTransition"));
  assert.ok(transition, "Stateflow transition should be retained as a state fact");
  assert.ok(transition.description.includes("WaitForReady -> Startup"));
  assert.ok(!transition.description.includes("#sf_4046:255->sf_4046:234"));
  assert.match(transition.location, /HvCoorn\/Stateflow\/4046\/WaitForReady->Startup/);

  const extraction = new SlxModelFactAdapter().toExtraction(bundle, file);
  const mrv = new ModelRequirementViewService().build({
    project: { documentType: "software_requirement" },
    assets: [{ ...file, role: "simulink_slx" }],
    extractions: [extraction]
  });
  assert.ok(!mrv.facts.some((fact) => /satk_tool_summary|Output truncated|接口 interface|接口 Input|接口 Output/i.test(fact.behavior)));
}

async function testAnalysisServiceStagesUploadedSlxWithOriginalModelName() {
  const { promises: fs } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "slx-satk-test-"));

  try {
    const uploadedPath = path.join(tmpDir, "1778657572381-HvCoorn.slx");
    await fs.writeFile(uploadedPath, "fake slx payload", "utf8");

    const fakeMcpClient = createFakeSatkMcpClient();
    const service = new SlxModelAnalysisService({ mcpClient: fakeMcpClient });
    await service.analyze({ id: "f1", originalName: "HvCoorn.slx", absolutePath: uploadedPath });

    const models = fakeMcpClient.calls.map((call) => call.args.model).filter(Boolean);
    assert.ok(models.length, "SATK calls should receive a model argument");
    assert.ok(models.every((model) => path.basename(model) === "HvCoorn.slx"));
    assert.ok(models.every((model) => !model.includes("1778657572381-HvCoorn")));
    await assert.rejects(() => fs.access(models[0]), { code: "ENOENT" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function testAnalysisServiceMcpFailure() {
  const service = new SlxModelAnalysisService({
    mcpClient: createFailingMcpClient(new MatlabMcpError("CONNECTION_ERROR", "Cannot connect"))
  });

  const file = { id: "f1", originalName: "test.slx", absolutePath: "/tmp/test.slx" };
  await assert.rejects(
    () => service.analyze(file),
    (err) => err instanceof MatlabMcpError && err.code === "CONNECTION_ERROR"
  );
}

async function testAnalysisServiceMissingPath() {
  const service = new SlxModelAnalysisService({
    mcpClient: createFakeMcpClient({})
  });

  const file = { id: "f1", originalName: "test.slx" };
  await assert.rejects(
    () => service.analyze(file),
    (err) => err instanceof SlxAnalysisError && err.code === "MISSING_PATH"
  );
}

async function testAnalysisServiceInvalidBundle() {
  const service = new SlxModelAnalysisService({
    mcpClient: createFakeMcpClient({ notABundle: true })
  });

  const file = { id: "f1", originalName: "test.slx", absolutePath: "/tmp/test.slx" };
  await assert.rejects(
    () => service.analyze(file),
    (err) => err instanceof SlxAnalysisError && err.code === "INVALID_BUNDLE"
  );
}

// ── ExtractionService SLX integration ──

async function testExtractionServiceCallsSlxParser() {
  const fakeBundle = createEmptyModelFactBundle();
  fakeBundle.source = { fileName: "model.slx", modelName: "M" };
  fakeBundle.interfaces.push({ name: "In1", direction: "input", location: "M/In1" });
  fakeBundle.states.push({ name: "Running", location: "M/Chart/Running" });

  const fakeMcpClient = createFakeMcpClient(fakeBundle);
  const slxService = new SlxModelAnalysisService({ mcpClient: fakeMcpClient });
  const extractionService = new ExtractionService({ slxAnalysisService: slxService });

  const project = {
    files: [
      { id: "f1", role: "simulink_slx", originalName: "model.slx", absolutePath: "/tmp/model.slx" }
    ]
  };

  const extractions = await extractionService.extractFiles(project);
  assert.equal(extractions.length, 1);
  assert.equal(extractions[0].fileRole, "simulink_slx");
  assert.ok(!extractions[0].reservedForFuture, "Should not have reservedForFuture flag");
  assert.equal(extractions[0].evidence.length, 2, "Should have interface + state evidence");
}

async function testExtractionServiceSlxErrorNotSilenced() {
  const fakeMcpClient = createFailingMcpClient(new MatlabMcpError("CONNECTION_ERROR", "Cannot connect to MATLAB MCP"));
  const slxService = new SlxModelAnalysisService({ mcpClient: fakeMcpClient });
  const extractionService = new ExtractionService({ slxAnalysisService: slxService });

  const project = {
    files: [
      { id: "f1", role: "simulink_slx", originalName: "model.slx", absolutePath: "/tmp/model.slx" }
    ]
  };

  await assert.rejects(
    () => extractionService.extractFiles(project),
    (err) => err.message.includes("MATLAB MCP") && err.message.includes("model.slx")
  );
}

async function testExtractionServiceSlxProgress() {
  const fakeBundle = createEmptyModelFactBundle();
  fakeBundle.source = { fileName: "model.slx", modelName: "M" };
  fakeBundle.interfaces.push({ name: "In1", direction: "input", location: "M/In1" });

  const fakeMcpClient = createFakeMcpClient(fakeBundle);
  const slxService = new SlxModelAnalysisService({ mcpClient: fakeMcpClient });
  const extractionService = new ExtractionService({ slxAnalysisService: slxService });

  const progressEvents = [];
  const project = {
    files: [
      { id: "f1", role: "simulink_slx", originalName: "model.slx", absolutePath: "/tmp/model.slx" }
    ]
  };

  await extractionService.extractFiles(project, {
    onProgress: (event) => progressEvents.push(event)
  });

  const extractingEvent = progressEvents.find((e) => e.phase === "extracting_file" && e.slxParsing);
  assert.ok(extractingEvent, "Should emit extracting_file with slxParsing=true");

  const extractedEvent = progressEvents.find((e) => e.phase === "file_extracted" && e.slxParsed);
  assert.ok(extractedEvent, "Should emit file_extracted with slxParsed=true");
  assert.equal(extractedEvent.evidenceCount, 1);
}

async function testExtractionServiceNoSlxNoMcpCall() {
  let mcpCalled = false;
  const fakeMcpClient = {
    isAvailable: true,
    async analyzeSlx() {
      mcpCalled = true;
      return createEmptyModelFactBundle();
    }
  };
  const slxService = new SlxModelAnalysisService({ mcpClient: fakeMcpClient });
  const extractionService = new ExtractionService({ slxAnalysisService: slxService });

  const project = {
    files: [
      { id: "f1", role: "system_pdf", originalName: "req.pdf", absolutePath: "/tmp/req.pdf" }
    ]
  };

  // This will fail because there's no actual PDF file, but we just need to check
  // that MCP was never called. Let's create a simpler test.
  // Actually let's just check that mcpCalled remains false even when extracting
  try {
    await extractionService.extractFiles(project);
  } catch {
    // PDF extraction may fail without real files, that's fine
  }

  assert.equal(mcpCalled, false, "MATLAB MCP should not be called when no SLX files are present");
}

// ── MatlabMcpClient ──

async function testMcpClientAvailability() {
  const client = new MatlabMcpClient({ baseURL: "http://localhost:5100" });
  assert.equal(client.isAvailable, true);
}

async function testMcpClientMissingPathError() {
  const client = new MatlabMcpClient({ baseURL: "http://localhost:5100" });
  await assert.rejects(
    () => client.analyzeSlx({}),
    (err) => err instanceof MatlabMcpError && err.code === "MISSING_PATH"
  );
}

// ── validateModelRequirementView ──

async function testValidateModelRequirementViewValid() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  const mrv = {
    version: "1.0",
    facts: [{
      id: "fact-1",
      behavior: "test behavior",
      sourceRefs: [{ fileName: "test.slx", fileRole: "simulink_slx", location: "block/path", excerpt: "test" }]
    }]
  };
  validateFn(mrv);
}

async function testValidateModelRequirementViewNotObject() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  assert.throws(() => validateFn(null), /必须是非空对象/);
  assert.throws(() => validateFn("string"), /必须是非空对象/);
  assert.throws(() => validateFn(42), /必须是非空对象/);
}

async function testValidateModelRequirementViewMissingVersion() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  const mrv = {
    facts: [{
      id: "fact-1",
      behavior: "test",
      sourceRefs: [{ fileName: "test.slx", fileRole: "simulink_slx", location: "path", excerpt: "e" }]
    }]
  };
  assert.throws(() => validateFn(mrv), /version 必须存在/);
}

async function testValidateModelRequirementViewEmptyFacts() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  assert.throws(() => validateFn({ version: "1.0", facts: [] }), /facts 必须是非空数组/);
  assert.throws(() => validateFn({ version: "1.0" }), /facts 必须是非空数组/);
}

async function testValidateModelRequirementViewFactMissingId() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  const mrv = {
    version: "1.0",
    facts: [{
      behavior: "test",
      sourceRefs: [{ fileName: "test.slx", fileRole: "simulink_slx", location: "path", excerpt: "e" }]
    }]
  };
  assert.throws(() => validateFn(mrv), /必须有 id/);
}

async function testValidateModelRequirementViewFactMissingBehavior() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  const mrv = {
    version: "1.0",
    facts: [{
      id: "fact-1",
      sourceRefs: [{ fileName: "test.slx", fileRole: "simulink_slx", location: "path", excerpt: "e" }]
    }]
  };
  assert.throws(() => validateFn(mrv), /必须有 behavior/);
}

async function testValidateModelRequirementViewFactEmptySourceRefs() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  const mrv = {
    version: "1.0",
    facts: [{ id: "fact-1", behavior: "test", sourceRefs: [] }]
  };
  assert.throws(() => validateFn(mrv), /sourceRefs 必须是非空数组/);
}

async function testValidateModelRequirementViewSourceRefMissingRequiredFields() {
  const { validateModelRequirementView: validateFn } = await import("../src/services/pipeline-service.js");
  const mrv = {
    version: "1.0",
    facts: [{
      id: "fact-1",
      behavior: "test",
      sourceRefs: [{}]
    }]
  };
  assert.throws(() => validateFn(mrv), /至少包含 fileName 或 fileRole/);
}

// ── ProjectService slxParserTasks CRUD ──

async function testProjectServiceSlxParserTaskCRUD() {
  const { ProjectService } = await import("../src/services/project-service.js");
  const { config: testConfig } = await import("../src/config.js");
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");

  const tmpDir = path.join(testConfig.projectStoreDir, "test-slx-crud-" + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  const service = new ProjectService();
  const project = await service.createProject({ name: "SLX CRUD Test" });
  const mod = await service.createModule(project.id, { name: "Test Module" });

  const task = await service.recordSlxParserTask(project.id, mod.id, {
    status: "running",
    inputArtifacts: [{ originalName: "test.slx", absolutePath: "/tmp/test.slx" }],
    summary: "正在解析 SLX"
  });
  assert.ok(task.id, "Task should have id");
  assert.equal(task.status, "running");
  assert.equal(task.inputArtifacts.length, 1);

  const listed = await service.listSlxParserTasks(project.id, mod.id);
  assert.equal(listed.length, 1);

  const got = await service.getSlxParserTask(project.id, mod.id, task.id);
  assert.equal(got.id, task.id);

  const updated = await service.updateSlxParserTask(project.id, mod.id, task.id, {
    status: "completed",
    outputAssetId: "asset-1",
    outputAssetName: "test-model-requirement-view.json",
    summary: "解析完成"
  });
  assert.equal(updated.status, "completed");
  assert.equal(updated.outputAssetId, "asset-1");

  const deleted = await service.deleteSlxParserTask(project.id, mod.id, task.id);
  assert.equal(deleted.deleted, true);

  const afterDelete = await service.listSlxParserTasks(project.id, mod.id);
  assert.equal(afterDelete.length, 0);

  await service.deleteProject(project.id);
}

async function testProjectServiceCreateSlxJsonAsset() {
  const { ProjectService } = await import("../src/services/project-service.js");

  const service = new ProjectService();
  const project = await service.createProject({ name: "SLX JSON Asset Test" });
  const mod = await service.createModule(project.id, { name: "Asset Module" });

  const mrv = {
    version: "1.0",
    documentType: "software_requirement",
    sourceAssets: [],
    facts: [{
      id: "fact-1",
      topic: "test",
      behavior: "test behavior",
      sourceRefs: [{ fileName: "test.slx", fileRole: "simulink_slx", location: "block/path", excerpt: "test" }]
    }]
  };

  const asset = await service.createSlxJsonModuleAsset(project.id, mod.id, {
    modelRequirementView: mrv
  });

  assert.ok(asset.id, "Asset should have id");
  assert.equal(asset.role, "model_requirement_view_json");
  assert.ok(asset.originalName.endsWith(".json"));
  assert.equal(asset.mimeType, "application/json");

  const content = await service.getModuleAssetContent(project.id, mod.id, asset.id);
  assert.equal(content.role, "model_requirement_view_json");
  const parsed = JSON.parse(content.content);
  assert.equal(parsed.version, "1.0");
  assert.equal(parsed.facts.length, 1);

  const modAfter = await service.getModule(project.id, mod.id);
  const jsonAssets = modAfter.assets.filter((a) => a.role === "model_requirement_view_json");
  assert.equal(jsonAssets.length, 1);

  await service.deleteProject(project.id);
}

async function testProjectServiceSlxInterpreterModelsAndQuestionTask() {
  const { ProjectService } = await import("../src/services/project-service.js");
  const { config: testConfig } = await import("../src/config.js");
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");

  const service = new ProjectService();
  const project = await service.createProject({ name: "SLX Interpreter Model Test" });
  const mod = await service.createModule(project.id, { name: "Interpreter Module" });
  const uploadDir = path.join(testConfig.uploadDir, project.id, mod.id);
  await fs.mkdir(uploadDir, { recursive: true });
  const slxPath = path.join(uploadDir, "charging-model.slx");
  const cPath = path.join(uploadDir, "charging.c");
  await fs.writeFile(slxPath, "fake slx payload", "utf8");
  await fs.writeFile(cPath, "void step(void) {}", "utf8");

  await service.attachModuleAssets(project.id, mod.id, {
    slx: [{
      originalname: "charging-model.slx",
      filename: "charging-model.slx",
      path: slxPath,
      mimetype: "application/octet-stream",
      size: 16
    }],
    generatedCode: [{
      originalname: "charging.c",
      filename: "charging.c",
      path: cPath,
      mimetype: "text/x-c",
      size: 17
    }]
  });

  const models = await service.listSlxInterpreterModels(project.id, mod.id);
  assert.equal(models.length, 1, "Only SLX assets should be selectable");
  assert.equal(models[0].role, "simulink_slx");
  assert.equal(models[0].originalName, "charging-model.slx");

  const created = await service.recordSlxInterpreterQuestion(project.id, mod.id, {
    modelAssetId: models[0].id,
    question: "这个模型的输入输出是什么？"
  });
  assert.ok(created.session.id);
  assert.equal(created.session.modelAssetId, models[0].id);
  assert.equal(created.session.messages.length, 2);
  assert.equal(created.userMessage.role, "user");
  assert.equal(created.assistantMessage.role, "assistant");
  assert.equal(created.assistantMessage.status, "queued");
  assert.ok(created.assistantMessage.taskId);

  const task = await service.getSlxInterpreterTask(project.id, mod.id, created.assistantMessage.taskId);
  assert.equal(task.message.id, created.assistantMessage.id);
  assert.equal(task.model.originalName, "charging-model.slx");

  const moduleAfter = await service.getModule(project.id, mod.id);
  assert.equal((moduleAfter.slxParserTasks || []).length, 0, "Interpreter upload/question should not create parser tasks");
  assert.equal(
    (moduleAfter.assets || []).filter((asset) => asset.role === "model_requirement_view_json").length,
    0,
    "Interpreter flow should not auto-create MRV JSON assets"
  );

  await service.deleteProject(project.id);
}

async function testPipelineServiceInterpretSlxUsesHermesAndPersistsAnswer() {
  const { ProjectService } = await import("../src/services/project-service.js");
  const { PipelineService } = await import("../src/services/pipeline-service.js");
  const { config: testConfig } = await import("../src/config.js");
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");

  const service = new ProjectService();
  const project = await service.createProject({ name: "SLX Interpreter Pipeline Test" });
  const mod = await service.createModule(project.id, { name: "Pipeline Module" });
  const uploadDir = path.join(testConfig.uploadDir, project.id, mod.id);
  await fs.mkdir(uploadDir, { recursive: true });
  const slxPath = path.join(uploadDir, "charging-model.slx");
  await fs.writeFile(slxPath, "fake slx payload", "utf8");

  const upload = await service.attachModuleAssets(project.id, mod.id, {
    slx: [{
      originalname: "charging-model.slx",
      filename: "charging-model.slx",
      path: slxPath,
      mimetype: "application/octet-stream",
      size: 16
    }]
  });
  const modelAsset = upload.assets[0];
  const captured = { payload: null };
  const pipeline = new PipelineService(service, { hermesTaskQueueService: null });
  pipeline.hermesAgentClient = {
    transport: "cli",
    async executeStep(payload, runtime = {}) {
      captured.payload = payload;
      await runtime.onEvent?.({
        status: "started",
        stepType: "slx_interpret_answer",
        transport: "cli",
        message: "Hermes 已启动",
        elapsedMs: 10
      });
      return {
        status: "succeeded",
        stepType: "slx_interpret_answer",
        artifact: {
          answerMarkdown: "模型包含输入 ChargeEnable 和输出 ChargeState。",
          summary: "已回答模型接口问题。",
          evidence: [{
            fileName: "charging-model.slx",
            fileRole: "simulink_slx",
            location: "ChargingModel/In1",
            excerpt: "ChargeEnable input"
          }],
          warnings: ["示例 warning"]
        },
        metrics: {
          durationMs: 42,
          tokenUsage: { totalTokens: 123 }
        },
        sessionId: "hermes-session-1"
      };
    }
  };

  const result = await pipeline.interpretSlxForModule(project.id, mod.id, {
    modelAssetId: modelAsset.id,
    question: "这个模型的输入输出是什么？",
    asyncStart: false
  });

  assert.equal(captured.payload.stepType, "slx_interpret_answer");
  assert.deepEqual(captured.payload.allowedPaths, [slxPath]);
  assert.equal(captured.payload.inputArtifact.model.assetId, modelAsset.id);
  assert.equal(captured.payload.inputArtifact.question, "这个模型的输入输出是什么？");
  assert.equal(result.message.status, "completed");
  assert.equal(result.message.content, "模型包含输入 ChargeEnable 和输出 ChargeState。");

  const persisted = await service.getSlxInterpreterTask(project.id, mod.id, result.message.taskId);
  assert.equal(persisted.message.status, "completed");
  assert.equal(persisted.message.evidence[0].location, "ChargingModel/In1");
  assert.equal(persisted.message.warnings[0], "示例 warning");
  assert.equal(persisted.message.debug.agent.currentStep, "slx_interpret_answer");
  assert.equal(persisted.message.debug.agent.tokenUsage.totalTokens, 123);

  await service.deleteProject(project.id);
}

async function testPipelineServiceInterpretSlxPersistsFailure() {
  const { ProjectService } = await import("../src/services/project-service.js");
  const { PipelineService } = await import("../src/services/pipeline-service.js");
  const { config: testConfig } = await import("../src/config.js");
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");

  const service = new ProjectService();
  const project = await service.createProject({ name: "SLX Interpreter Failure Test" });
  const mod = await service.createModule(project.id, { name: "Failure Module" });
  const uploadDir = path.join(testConfig.uploadDir, project.id, mod.id);
  await fs.mkdir(uploadDir, { recursive: true });
  const slxPath = path.join(uploadDir, "fault-model.slx");
  await fs.writeFile(slxPath, "fake slx payload", "utf8");
  const upload = await service.attachModuleAssets(project.id, mod.id, {
    slx: [{
      originalname: "fault-model.slx",
      filename: "fault-model.slx",
      path: slxPath,
      mimetype: "application/octet-stream",
      size: 16
    }]
  });

  const pipeline = new PipelineService(service, { hermesTaskQueueService: null });
  pipeline.hermesAgentClient = {
    transport: "api",
    async executeStep() {
      throw new Error("MATLAB MCP unavailable");
    }
  };

  await assert.rejects(
    () => pipeline.interpretSlxForModule(project.id, mod.id, {
      modelAssetId: upload.assets[0].id,
      question: "模型能读到吗？",
      asyncStart: false
    }),
    /MATLAB MCP unavailable/
  );

  const sessions = await service.listSlxInterpreterSessions(project.id, mod.id);
  const assistantMessage = sessions[0].messages.find((message) => message.role === "assistant");
  assert.equal(assistantMessage.status, "failed");
  assert.ok(assistantMessage.errorMessage.includes("MATLAB MCP unavailable"));
  assert.equal(assistantMessage.progress.stage, "failed");

  await service.deleteProject(project.id);
}

async function testPipelineServiceParseSlxShutsDownMcpClient() {
  const { ProjectService } = await import("../src/services/project-service.js");
  const { PipelineService } = await import("../src/services/pipeline-service.js");
  const { config: testConfig } = await import("../src/config.js");
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");

  const service = new ProjectService();
  const project = await service.createProject({ name: "SLX Pipeline Shutdown Test" });
  const mod = await service.createModule(project.id, { name: "Shutdown Module" });
  const uploadDir = path.join(testConfig.uploadDir, project.id, mod.id);
  await fs.mkdir(uploadDir, { recursive: true });
  const slxPath = path.join(uploadDir, "fake-model.slx");
  await fs.writeFile(slxPath, "fake slx payload", "utf8");

  let shutdownCalled = false;
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "fake-model.slx", modelName: "FakeModel" };
  bundle.interfaces.push({ name: "ChargeEnable", direction: "input", location: "FakeModel/In1" });

  const pipeline = new PipelineService(service, {
    slxModelAnalysisService: {
      mcpClient: {
        async shutdown() {
          shutdownCalled = true;
        }
      },
      async analyzeAndConvertToExtraction(file) {
        return new SlxModelFactAdapter().toExtraction(bundle, file);
      }
    }
  });

  const result = await pipeline.parseSlxForModule(project.id, mod.id, {
    slxFile: {
      id: "slx-1",
      originalName: "fake-model.slx",
      storedName: "fake-model.slx",
      absolutePath: slxPath,
      relativePath: path.join(project.id, mod.id, "fake-model.slx"),
      mimeType: "application/octet-stream",
      size: 16
    }
  });

  assert.equal(result.task.status, "completed");
  assert.ok(result.outputAsset.originalName.endsWith(".json"));
  assert.equal(shutdownCalled, true);

  await service.deleteProject(project.id);
}

// ── Run all tests ──

const tests = [
  testModelFactBundleEmptyIsValid,
  testModelFactBundleMissingField,
  testModelFactBundleArrayFieldNotArray,
  testModelFactBundleFactMissingLocation,
  testModelFactBundleFactWithLocationIsValid,
  testModelFactBundleNull,
  testAdapterConvertsBundleToExtraction,
  testAdapterEvidenceHasRequiredFields,
  testAdapterBlockPathInLocation,
  testAdapterEmptyBundle,
  testAdapterNullBundle,
  testAdapterTagMapping,
  testCompactModelRequirementViewKeepsDerivedStateAndSystemFacts,
  testCompactModelRequirementViewKeepsLowVoltageCriticalFacts,
  testModelRequirementViewKeepsSignalArrowsAsLogic,
  testRawSlxDataflowFactsAreGeneric,
  testRawSlxZipReadingDoesNotRequireUnzip,
  testAnalysisServiceSuccess,
  testAnalysisServiceConvertToExtraction,
  testAnalysisServiceUsesSatkToolsByDefault,
  testSatkBuilderFiltersNoiseAndResolvesStateflowIds,
  testAnalysisServiceStagesUploadedSlxWithOriginalModelName,
  testAnalysisServiceMcpFailure,
  testAnalysisServiceMissingPath,
  testAnalysisServiceInvalidBundle,
  testExtractionServiceCallsSlxParser,
  testExtractionServiceSlxErrorNotSilenced,
  testExtractionServiceSlxProgress,
  testExtractionServiceNoSlxNoMcpCall,
  testMcpClientAvailability,
  testMcpClientMissingPathError,
  testValidateModelRequirementViewValid,
  testValidateModelRequirementViewNotObject,
  testValidateModelRequirementViewMissingVersion,
  testValidateModelRequirementViewEmptyFacts,
  testValidateModelRequirementViewFactMissingId,
  testValidateModelRequirementViewFactMissingBehavior,
  testValidateModelRequirementViewFactEmptySourceRefs,
  testValidateModelRequirementViewSourceRefMissingRequiredFields,
  testProjectServiceSlxParserTaskCRUD,
  testProjectServiceCreateSlxJsonAsset,
  testProjectServiceSlxInterpreterModelsAndQuestionTask,
  testPipelineServiceInterpretSlxUsesHermesAndPersistsAnswer,
  testPipelineServiceInterpretSlxPersistsFailure,
  testPipelineServiceParseSlxShutsDownMcpClient
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test();
    passed += 1;
    console.log(`  PASS: ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL: ${test.name}`);
    console.error(`    ${error.message}`);
  }
}

console.log(`\nSLX parser tests: ${passed} passed, ${failed} failed, ${tests.length} total`);

if (failed > 0) {
  process.exit(1);
}
