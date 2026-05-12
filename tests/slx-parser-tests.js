import assert from "node:assert/strict";
import { validateModelFactBundle, createEmptyModelFactBundle, MODEL_FACT_FIELDS } from "../src/services/model-fact-bundle.js";
import { SlxModelFactAdapter } from "../src/services/slx-model-fact-adapter.js";
import { SlxModelAnalysisService, SlxAnalysisError } from "../src/services/slx-model-analysis-service.js";
import { MatlabMcpClient, MatlabMcpError } from "../src/services/matlab-mcp-client.js";
import { ExtractionService } from "../src/services/extraction-service.js";
import { ModelRequirementViewService } from "../src/services/model-requirement-view-service.js";

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
  testAnalysisServiceSuccess,
  testAnalysisServiceConvertToExtraction,
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
