import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { TcsdHermesStageExecutor } from "../src/services/tcsd-hermes-stage-executor.js";
import { TcsdHermesSkillRegistry } from "../src/services/tcsd-hermes-skill-registry.js";
import { TcsdHostSemanticValidator } from "../src/services/tcsd-host-semantic-validator.js";
import { TcsdPipelineJobService } from "../src/services/tcsd-pipeline-job-service.js";
import {
  resolvePythonInvocation,
  runPythonCommand
} from "../src/services/python-command.js";
import {
  TCSD_CHECKPOINT_SCHEMA,
  TCSD_ERROR_CODES,
  TCSD_LEGACY_PIPELINE_SCHEMA,
  TCSD_PIPELINE_SCHEMA,
  TCSD_STAGE_DEFINITIONS,
  TCSD_STAGE_INPUT_SCHEMA,
  TCSD_STAGE_RESULT_SCHEMA,
  canTransition,
  createStages,
  normalizeCoverageReport,
  parseExecutionManifest
} from "../src/services/tcsd-pipeline-contract.js";
import { TcsdStageCatalog } from "../src/services/tcsd-stage-catalog.js";
import { UnitTestCaseGenerationService } from "../src/services/unit-test-case-generation-service.js";
import { resolveHermesCommand } from "../src/services/hermes-command.js";
import { config } from "../src/config.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(repo, "skills", "hermes");
const template = path.join(skillsRoot, "tcsd-runtime", "assets", "templates", "tcsd_template.xlsx");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const coverage = (percent) => ({
  GenericModel: {
    condition: { covered: percent, total: 100, percent, passed: percent >= 80 },
    decision: { covered: percent, total: 100, percent, passed: percent >= 80 },
    mcdc: { covered: percent, total: 100, percent, passed: percent >= 80 }
  }
});
const rel = (root, target) => path.relative(root, target).replaceAll(path.sep, "/");
const execFileAsync = promisify(execFile);
const pythonInvocation = resolvePythonInvocation();
const execPythonAsync = (args, options = {}) =>
  runPythonCommand(execFileAsync, pythonInvocation, args, options);
const fixtureBuilder = path.join(repo, "tests", "tcsd-runtime", "build_contract_workbook.py");
const repairValidator = path.join(
  repo,
  "skills",
  "hermes",
  "tcsd-runtime",
  "scripts",
  "validate_agent_coverage_repair.py"
);

assert.deepEqual(
  resolveHermesCommand("C:\\Hermes Runtime\\hermes.cmd", ["skills", "list"], { platform: "win32" }),
  {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "\"C:\\Hermes Runtime\\hermes.cmd\" skills list"]
  }
);
{
  const hermesCommand = "C:\\SoftwareDocWorker\\runtime\\hermes-agent\\hermes.cmd";
  const venvPython = "C:\\SoftwareDocWorker\\runtime\\hermes-agent\\venv\\Scripts\\python.exe";
  const legacyPython = "C:\\SoftwareDocWorker\\runtime\\hermes-agent\\python\\python.exe";
  const hermesHome = "C:\\SoftwareDocWorker\\runtime\\hermes-home";
  const args = ["chat", "-q", "中文 prompt with spaces"];

  assert.deepEqual(
    resolveHermesCommand(hermesCommand, args, {
      platform: "win32",
      pathExists: (candidate) => [venvPython, legacyPython, hermesHome].includes(candidate)
    }),
    {
      command: venvPython,
      args: ["-m", "hermes_cli.main", ...args],
      env: { HERMES_HOME: hermesHome }
    }
  );
  assert.deepEqual(
    resolveHermesCommand(hermesCommand, args, {
      platform: "win32",
      pathExists: (candidate) => [legacyPython, hermesHome].includes(candidate)
    }),
    {
      command: legacyPython,
      args: ["-m", "hermes_cli.main", ...args],
      env: { HERMES_HOME: hermesHome }
    }
  );
}

assert.equal(TCSD_STAGE_DEFINITIONS.length, 12);
assert.equal(TCSD_PIPELINE_SCHEMA, "tcsd-agent-stage-pipeline/v2");
assert.equal(TCSD_STAGE_INPUT_SCHEMA, "tcsd-agent-stage-input/v1");
assert.equal(TCSD_STAGE_RESULT_SCHEMA, "tcsd-agent-stage-result/v1");
assert.equal(TCSD_CHECKPOINT_SCHEMA, "tcsd-agent-stage-checkpoint/v2");
assert.equal(canTransition("正在执行", "等待执行"), true);
assert.equal(canTransition("已完成", "正在执行"), false);
assert.equal(normalizeCoverageReport(coverage(81)).aggregate.mcdc.percent, 81);
assert.throws(() => normalizeCoverageReport({ GenericModel: { condition: 80 } }), /没有有效模型记录/);
assert.deepEqual(
  resolvePythonInvocation({ platform: "win32", env: {} }),
  { executable: "py", prefixArgs: ["-3.11"] }
);
assert.deepEqual(
  resolvePythonInvocation({ python: "C:\\Python311\\python.exe", platform: "win32", env: {} }),
  { executable: "C:\\Python311\\python.exe", prefixArgs: [] }
);
assert.deepEqual(
  resolvePythonInvocation({
    platform: "win32",
    env: { TCSD_PIPELINE_PYTHON: "D:\\Runtime\\Python311\\python.exe" }
  }),
  { executable: "D:\\Runtime\\Python311\\python.exe", prefixArgs: [] }
);
assert.deepEqual(
  resolvePythonInvocation({ platform: "darwin", env: {} }),
  { executable: "python3", prefixArgs: [] }
);
assert.deepEqual(
  resolvePythonInvocation({ platform: "linux", env: {} }),
  { executable: "python3", prefixArgs: [] }
);
{
  const calls = [];
  await runPythonCommand(
    async (command, args) => {
      calls.push({ command, args });
      return { stdout: "", stderr: "" };
    },
    resolvePythonInvocation({ platform: "win32", env: {} }),
    ["fixture.py", "--output", "fixture.xlsx"]
  );
  assert.deepEqual(calls, [{
    command: "py",
    args: ["-3.11", "fixture.py", "--output", "fixture.xlsx"]
  }]);
}
assert.equal(parseExecutionManifest({
  schema: "simulink-ut-tcsd-execution-manifest/v1",
  status: "completed",
  completion: "partial",
  workbook: "outputs/result.xlsx",
  simulation: {},
  evidence: {},
  coverage: {
    initial: coverage(50),
    final: coverage(50),
    repair_required: true,
    repair_attempted: true,
    repair_applied: false,
    repair_passes: 0,
    repair_reason: "no_candidates",
    repair_evidence: "outputs/repair.json"
  }
}).completion, "partial");

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-python-validator-"));
  const calls = [];
  const validator = new TcsdHostSemanticValidator({
    platform: "win32",
    env: {},
    commandRunner: async (command, args) => {
      calls.push({ command, args });
      return {
        stdout: JSON.stringify({
          schema: "tcsd-host-semantic-validation/v1",
          stageIndex: 2,
          passed: true,
          details: {}
        }),
        stderr: ""
      };
    }
  });
  await validator.validate({
    raw: { stageIndex: 2, artifacts: [], evidence: {} },
    job: {
      jobId: "python-validator",
      input: { workspaceDir: root, coverageThreshold: 80 },
      stages: []
    },
    runtime: { installedPath: path.join(root, "runtime") },
    requestPath: path.join(root, "request.json")
  });
  assert.equal(calls[0].command, "py");
  assert.deepEqual(calls[0].args.slice(0, 2), [
    "-3.11",
    path.join(root, "runtime", "scripts", "host_validate_tcsd_stage.py")
  ]);
}

{
  const calls = [];
  const skillFileHash = "a".repeat(64);
  const executor = new TcsdHermesStageExecutor({
    platform: "win32",
    env: {},
    stateDbPath: "state.db",
    commandRunner: async (command, args) => {
      calls.push({ command, args });
      return {
        stdout: JSON.stringify({
          model: "test-model",
          totalTokens: 1,
          skillLoad: {
            source: "hermes-state-db+skill-usage",
            loaded: true,
            skillName: "tcsd-stage-01-input-validation",
            skillFileSha256: skillFileHash
          }
        }),
        stderr: ""
      };
    }
  });
  await executor.readSessionUsage(
    "session-1",
    { directory: "runtime" },
    {
      name: "tcsd-stage-01-input-validation",
      directory: "skill",
      skillFileHash
    },
    {
      usageFile: "usage.json",
      useCountBefore: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z"
    }
  );
  assert.equal(calls[0].command, "py");
  assert.deepEqual(calls[0].args.slice(0, 2), [
    "-3.11",
    path.join("runtime", "scripts", "read_hermes_session.py")
  ]);
  assert.match(executor.buildPrompt({
    definition: { index: 1, skillName: "tcsd-stage-01-input-validation" },
    skill: { name: "tcsd-stage-01-input-validation" },
    runtime: { directory: "runtime" },
    manifestPath: "input.json",
    resultPath: "result.json",
    validationReportPath: "",
    attempt: 1
  }), /py -3\.11 .*run_tcsd_pipeline_stage\.py/);
}

{
  const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("tcsd-stage-"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(skillDirs, TCSD_STAGE_DEFINITIONS.map((stage) => stage.skillName));
  await assert.rejects(() => stat(path.join(skillsRoot, "tcsd-runtime", "SKILL.md")));
  const catalog = new TcsdStageCatalog({ skillsDir: skillsRoot });
  const bundleHashes = new Set();
  for (const definition of TCSD_STAGE_DEFINITIONS) {
    const skillDir = path.join(skillsRoot, definition.skillName);
    const files = await readdir(skillDir);
    assert.deepEqual(files.sort(), ["SKILL.md", "agents"]);
    const source = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const metadata = await readFile(path.join(skillDir, "agents", "openai.yaml"), "utf8");
    assert.match(source, new RegExp(`name: ${definition.skillName}`));
    assert.match(source, new RegExp(`stageIndex.+${definition.index}|stage ${definition.index}`, "i"));
    assert.match(source, /tcsd-runtime\/scripts\/run_tcsd_pipeline_stage\.py/);
    assert.doesNotMatch(source, /full workflow/i);
    assert.match(metadata, new RegExp(`\\$${definition.skillName}`));
    const described = await catalog.describe(definition.index);
    assert.match(described.bundleHash, /^[a-f0-9]{64}$/);
    bundleHashes.add(described.bundleHash);
  }
  assert.equal(bundleHashes.size, 12);
  assert.match((await catalog.runtime()).bundleHash, /^[a-f0-9]{64}$/);
}

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-skill-gates-"));
  const invalidSkillsRoot = path.join(root, "invalid-source");
  const firstSkill = TCSD_STAGE_DEFINITIONS[0];
  await mkdir(invalidSkillsRoot, { recursive: true });
  await cp(
    path.join(skillsRoot, firstSkill.skillName),
    path.join(invalidSkillsRoot, firstSkill.skillName),
    { recursive: true }
  );
  const invalidSkillFile = path.join(invalidSkillsRoot, firstSkill.skillName, "SKILL.md");
  await writeFile(
    invalidSkillFile,
    (await readFile(invalidSkillFile, "utf8")).replace('version: "1.1.0"', 'version: "0.0.0"')
  );
  await assert.rejects(
    () => new TcsdStageCatalog({ skillsDir: invalidSkillsRoot }).describe(1),
    /skill metadata mismatch/
  );

  const catalog = new TcsdStageCatalog({ skillsDir: skillsRoot });
  const registry = new TcsdHermesSkillRegistry({
    command: "fake-hermes",
    stateDbPath: path.join(root, "profile", "state.db"),
    skillsDir: path.join(root, "profile", "skills"),
    catalog,
    commandRunner: async () => ({
      stdout: TCSD_STAGE_DEFINITIONS.slice(0, -1).map((stage) => stage.skillName).join("\n"),
      stderr: ""
    })
  });
  await assert.rejects(() => registry.prepare(), /did not discover all TCSD stage skills/);

  const jsCommandPath = path.join(root, "fake-hermes-cli.js");
  const invocations = [];
  const jsRegistry = new TcsdHermesSkillRegistry({
    command: jsCommandPath,
    stateDbPath: path.join(root, "profile", "state.db"),
    skillsDir: path.join(root, "profile", "skills"),
    catalog,
    commandRunner: async (command, args, options) => {
      invocations.push({ command, args, options });
      return {
        stdout: TCSD_STAGE_DEFINITIONS.map((stage) => stage.skillName).join("\n"),
        stderr: ""
      };
    }
  });
  await jsRegistry.prepare();
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].command, process.execPath);
  assert.deepEqual(invocations[0].args, [jsCommandPath, "skills", "list"]);

  const prefixedInvocations = [];
  const prefixedRegistry = new TcsdHermesSkillRegistry({
    command: process.execPath,
    commandArgsPrefix: [jsCommandPath],
    stateDbPath: path.join(root, "profile", "state.db"),
    skillsDir: path.join(root, "profile", "skills"),
    catalog,
    commandRunner: async (command, args, options) => {
      prefixedInvocations.push({ command, args, options });
      return {
        stdout: TCSD_STAGE_DEFINITIONS.map((stage) => stage.skillName).join("\n"),
        stderr: ""
      };
    }
  });
  await prefixedRegistry.prepare();
  assert.equal(prefixedInvocations.length, 1);
  assert.equal(prefixedInvocations[0].command, process.execPath);
  assert.deepEqual(prefixedInvocations[0].args, [jsCommandPath, "skills", "list"]);
}

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-agent-pipeline-"));
  const outputDir = path.join(root, "outputs");
  await mkdir(outputDir, { recursive: true });
  const modelSlxPath = path.join(root, "GenericModel.slx");
  const modelMatPath = path.join(root, "GenericModel.mat");
  await writeFile(modelSlxPath, "slx");
  await writeFile(modelMatPath, "mat");
  await execPythonAsync([
    fixtureBuilder,
    "--output",
    path.join(outputDir, "GenericModel_Test0001_tcsd.xlsx")
  ]);
  return { root, outputDir, modelSlxPath, modelMatPath };
}

async function jsonArtifact(workspace, stageIndex, schema, suffix = "") {
  const target = path.join(workspace.outputDir, `stage-${stageIndex}${suffix}.json`);
  await writeFile(target, JSON.stringify({ schema, stageIndex, jobId: workspace.jobId }));
  return { path: rel(workspace.root, target), kind: "json", role: "evidence" };
}

async function writeStageResult(workspace, manifest, resultPath, options = {}) {
  const stage = manifest.stageIndex;
  const initialPercent = Number(options.initialCoverage ?? 90);
  const finalPercent = Number(options.finalCoverage ?? 60);
  const result = {
    schema: TCSD_STAGE_RESULT_SCHEMA,
    jobId: manifest.jobId,
    stageIndex: stage,
    status: "completed",
    summary: `stage-${stage}`,
    artifacts: []
  };
  if (options.hardFailureStage === stage) {
    result.status = "failed";
    result.error = {
      code: stage === 2 ? TCSD_ERROR_CODES.environment : TCSD_ERROR_CODES.stageRuntime,
      message: stage === 2
        ? "Stage 02 environment gate failed: SATK/MCP failed: failed to attach to MATLAB session"
        : "hard runtime failure",
      hard: true
    };
    await writeFile(resultPath, JSON.stringify(result));
    return;
  }
  if (stage === 1) result.artifacts.push(await jsonArtifact(workspace, stage, "tcsd-input-manifest/v1"));
  if (stage === 2) {
    const artifact = await jsonArtifact(workspace, stage, "tcsd-environment-gate/v2");
    const absolute = path.join(workspace.root, artifact.path);
    const fakeServer = path.join(workspace.outputDir, "fake-matlab-mcp-server");
    await writeFile(fakeServer, "generic MCP server fixture");
    const fakeServerSource = await readFile(fakeServer);
    const nonce = `nonce-${manifest.jobId}`;
    await writeFile(absolute, JSON.stringify({
      schema: "tcsd-environment-gate/v2",
      jobId: manifest.jobId,
      nonce,
      passed: true,
      matlabRoot: "/opt/matlab",
      runner: "satk_eval.py",
      pythonDependencies: {
        passed: true,
        modules: {
          yaml: { version: "6.0.3" },
          openpyxl: { version: "3.1.5" }
        }
      },
      workspaceIo: { passed: true, created: true, readMatched: true, deleted: true },
      matlab: { passed: true, nonce, version: "R2026a" },
      simulink: { passed: true, licenseAvailable: true, loaded: true, version: "R2026a" },
      satkMcp: {
        passed: true,
        runner: "satk_eval.py",
        server: {
          path: fakeServer,
          discovery: "contract-test-fixture",
          sha256: hash(fakeServerSource),
          sizeBytes: fakeServerSource.length
        },
        sentinelWritten: true,
        nonceMatched: true
      }
    }));
    result.artifacts.push(artifact);
  }
  if (stage === 3) {
    const initialized = path.join(workspace.outputDir, "initialized.json");
    await writeFile(initialized, JSON.stringify({
      schema: "tcsd-workspace-initialization/v1",
      jobId: manifest.jobId,
      completed: true
    }));
    result.artifacts.push({ path: rel(workspace.root, initialized), kind: "json", role: "initialization" });
    result.evidence = { initializationManifest: rel(workspace.root, initialized) };
  }
  if (stage === 4) {
    const interfacePath = path.join(workspace.outputDir, "interface.json");
    const tracesPath = path.join(workspace.outputDir, "traces.json");
    await writeFile(interfacePath, JSON.stringify({
      schema: "tcsd-model-interface/v1",
      inputs: ["Input"],
      outputs: ["Output"]
    }));
    await writeFile(tracesPath, JSON.stringify({ schema: "simulink-ut-logical-mcdc-trace/v2" }));
    result.artifacts.push(
      { path: rel(workspace.root, interfacePath), kind: "json", role: "interface" },
      { path: rel(workspace.root, tracesPath), kind: "json", role: "trace" }
    );
  }
  if (stage === 5) {
    for (const [suffix, schema] of [
      ["mapping", "simulink-ut-logical-mcdc-mapping/v1"],
      ["obligations", "simulink-ut-logical-mcdc-obligations/v1"],
      ["ir", "simulink-ut-tcsd-coverage-ir/v1"]
    ]) {
      result.artifacts.push(await jsonArtifact(workspace, stage, schema, `-${suffix}`));
    }
  }
  if (stage === 6) {
    const planPath = path.join(workspace.outputDir, "state-probe-plan.json");
    const reportPath = path.join(workspace.outputDir, "state-probe-results.json");
    await writeFile(planPath, JSON.stringify({
      schema: "simulink-ut-state-probe-plan/v1",
      summary: { candidate_count: 1 },
      tests: [{ test_id: "STATE_PROBE_0001", steps: [{ index: 1 }] }]
    }));
    result.artifacts.push({ path: rel(workspace.root, planPath), kind: "json", role: "probe-plan" });
    if (!options.unexecutedProbe) {
      await writeFile(reportPath, JSON.stringify({
        schema: "simulink-ut-logical-mcdc-probe/v2",
        observations: [{
          test_id: "STATE_PROBE_0001",
          step_index: 1,
          inputs: { Input: 1 },
          vectors: { decision: { ok: true, values: [true] } },
          prediction_status: "observed"
        }]
      }));
      result.artifacts.push({ path: rel(workspace.root, reportPath), kind: "json", role: "probe-result" });
    }
    result.evidence = { candidateCount: 1, probeExecuted: !options.unexecutedProbe };
  }
  const workbook = path.join(workspace.outputDir, "GenericModel_Test0001_tcsd.xlsx");
  if (stage === 7) {
    if (options.blankWorkbook) await copyFile(template, workbook);
    const planningObligations = path.join(workspace.outputDir, "planning-obligations.json");
    const planningAssessment = path.join(workspace.outputDir, "planning-mapping-assessment.json");
    await writeFile(planningObligations, JSON.stringify({
      schema: "simulink-ut-logical-mcdc-obligations/v1",
      obligations: []
    }));
    const obligationsSha256 = hash(await readFile(planningObligations));
    await writeFile(planningAssessment, JSON.stringify({
      schema: "tcsd-planning-mapping-assessment/v1",
      authority: "planning",
      status: "satisfied",
      blocking: false,
      assessment: "complete",
      sourceObligations: {
        path: rel(workspace.root, planningObligations),
        sha256: obligationsSha256
      },
      supersededBy: {
        stageIndex: 9,
        authority: "measured-simulink-coverage",
        reason: "contract fixture"
      }
    }));
    result.artifacts.push(
      { path: rel(workspace.root, workbook), kind: "xlsx", role: "workbook" },
      { path: rel(workspace.root, planningObligations), kind: "json", role: "planning-obligations" },
      { path: rel(workspace.root, planningAssessment), kind: "json", role: "planning-mapping-assessment" }
    );
    result.evidence = {
      planningMappingAssessment: rel(workspace.root, planningAssessment),
      mappingAuthority: "planning",
      supersededByStage: 9
    };
  }
  if (stage === 8) {
    if (options.wrongExpValue) {
      await execPythonAsync([fixtureBuilder, "--output", workbook, "--expected", "2"]);
    }
    const simulation = path.join(workspace.outputDir, "simulation.json");
    await writeFile(simulation, JSON.stringify(options.emptySimulation ? {} : {
      schema: "tcsd-simulation-result/v1",
      tests: [{
        row: 3,
        test_id: "TC_001",
        steps: [
          { index: 1, outputs: { Output: 1 }, stable: { Output: true } },
          { index: 2, outputs: { Output: 1 }, stable: { Output: true } }
        ]
      }]
    }));
    result.artifacts.push(
      { path: rel(workspace.root, workbook), kind: "xlsx", role: "workbook" },
      { path: rel(workspace.root, simulation), kind: "json", role: "simulation" }
    );
    result.evidence = {
      simulationResult: rel(workspace.root, simulation),
      expValueCount: 1,
      simulationValueCount: 1,
      workbookBackfillCount: 1,
      caseOutputCounts: { "3:TC_001": { Output: 1 } },
      backfillItems: [{ row: 3, testId: "TC_001", step: 1, output: "Output", value: 1 }]
    };
  }
  if (stage === 9) {
    const coveragePath = path.join(workspace.outputDir, "initial-coverage.json");
    await writeFile(coveragePath, JSON.stringify({
      schema: "tcsd-coverage-report/v1",
      models: options.emptyCoverage ? {} : coverage(initialPercent)
    }));
    result.artifacts.push({ path: rel(workspace.root, coveragePath), kind: "json", role: "coverage" });
    result.coverage = {
      schema: "tcsd-coverage-report/v1",
      models: coverage(options.emptyCoverage ? 99 : initialPercent)
    };
  }
  if (stage === 10 && (initialPercent >= 80 || options.skipRepairDespiteLow)) {
    result.status = "skipped";
    result.summary = "首轮覆盖率已达标。";
    result.skipReason = "首轮覆盖率已达标。";
  }
  if (stage === 10 && initialPercent < 80 && !options.skipRepairDespiteLow) {
    const briefPath = path.join(workspace.outputDir, "coverage-repair-brief.json");
    const proposalPath = path.join(workspace.outputDir, "coverage-repair-proposal.json");
    const repairPath = path.join(workspace.outputDir, "coverage-repair.json");
    const validationPath = path.join(workspace.outputDir, "coverage-repair-validation.json");
    const synthesisPath = path.join(workspace.outputDir, "coverage-repair-synthesis.json");
    const interfacePath = path.join(workspace.outputDir, "interface.json");
    const coveragePath = path.join(workspace.outputDir, "initial-coverage.json");
    const tracesPath = path.join(workspace.outputDir, "traces.json");
    const originalCoverageIrPath = path.join(workspace.outputDir, "stage-5-ir.json");
    const noApplicableRepair = Boolean(options.noApplicableRepair);
    await execPythonAsync([
      repairValidator,
      "prepare",
      "--job-id",
      manifest.jobId,
      "--model",
      "GenericModel",
      "--coverage-report",
      coveragePath,
      "--logical-traces",
      tracesPath,
      "--coverage-ir",
      originalCoverageIrPath,
      "--interface",
      interfacePath,
      "--threshold",
      "80",
      "--output",
      briefPath
    ]);
    if (options.tamperedRepairBrief) {
      const tamperedBrief = JSON.parse(await readFile(briefPath, "utf8"));
      tamperedBrief.guardrails.maxCandidateTests = 15;
      await writeFile(briefPath, JSON.stringify(tamperedBrief));
    }
    await writeFile(proposalPath, JSON.stringify({
      schema: "tcsd-agent-coverage-repair-proposal/v1",
      jobId: manifest.jobId,
      model: "GenericModel",
      tests: noApplicableRepair ? [] : [{
        id: "repair-decision-false",
        coverage_class: "Decision",
        block: { path: "GenericModel/Decision", sid: "GenericModel:1" },
        required_outcome: "Decision false branch",
        controller: { direct_inputs: { Input: 1 }, parameters: {} },
        stimulus: {
          initial_inputs: { Input: 0 },
          initial_params: {},
          steps: [{ delay_s: 0.1, input_updates: { Input: 1 }, param_updates: {} }],
          evidence_step: 1
        },
        analysis: {
          upstream_slice: ["GenericModel/Input", "GenericModel/Decision"],
          rationale: "The focused transition toggles the uncovered decision while preserving unrelated gates."
        }
      }],
      unresolved: noApplicableRepair ? [{
        coverage_class: "Decision",
        block: { path: "GenericModel/Decision", sid: "GenericModel:1" },
        reason_code: "probe_target_unobservable",
        evidence: "Focused probe cannot observe the target decision port."
      }] : []
    }));
    await execPythonAsync([
      repairValidator,
      "validate",
      "--brief",
      briefPath,
      "--proposal",
      proposalPath,
      "--interface",
      interfacePath,
      "--output-ir",
      repairPath,
      "--report-json",
      validationPath
    ]);
    const proposalValidation = JSON.parse(await readFile(validationPath, "utf8"));
    result.artifacts.push(
      { path: rel(workspace.root, briefPath), kind: "json", role: "coverage-repair-brief" },
      { path: rel(workspace.root, proposalPath), kind: "json", role: "agent-repair-proposal" },
      { path: rel(workspace.root, validationPath), kind: "json", role: "agent-repair-validation" },
      { path: rel(workspace.root, repairPath), kind: "json", role: "coverage-repair" }
    );
    if (!noApplicableRepair) {
      await writeFile(synthesisPath, JSON.stringify({
        schema: "simulink-ut-tcsd-coverage-ir-synthesis/v1",
        input_test_count: 1,
        output_test_count: 2,
        added: 1,
        skipped: [],
        deduplication_basis: "contract fixture"
      }));
      const candidatePath = path.join(workspace.outputDir, "repair-candidate-validation.json");
      const simulationPath = path.join(workspace.outputDir, "repair-candidate-simulation.json");
      await writeFile(candidatePath, JSON.stringify({
        schema: "tcsd-repair-candidate-validation/v1",
        jobId: manifest.jobId,
        passed: true,
        candidateCount: 1
      }));
      await writeFile(simulationPath, JSON.stringify({
        schema: "tcsd-simulation-result/v1",
        tests: [{
          row: 3,
          test_id: "TC_001",
          steps: [
            { index: 1, outputs: { Output: 1 }, stable: { Output: true } },
            { index: 2, outputs: { Output: 1 }, stable: { Output: true } }
          ]
        }]
      }));
      result.artifacts.push(
        { path: rel(workspace.root, synthesisPath), kind: "json", role: "evidence" },
        { path: rel(workspace.root, candidatePath), kind: "json", role: "candidate-validation" },
        { path: rel(workspace.root, workbook), kind: "xlsx", role: "workbook" },
        { path: rel(workspace.root, simulationPath), kind: "json", role: "simulation" }
      );
      result.evidence = {
        candidateValidation: rel(workspace.root, candidatePath),
        candidateSimulation: rel(workspace.root, simulationPath),
        simulationResult: rel(workspace.root, simulationPath),
        candidateValidationPassed: true,
        expValueCount: 1,
        simulationValueCount: 1,
        workbookBackfillCount: 1,
        caseOutputCounts: { "3:TC_001": { Output: 1 } },
        backfillItems: [{ row: 3, testId: "TC_001", step: 1, output: "Output", value: 1 }]
      };
    } else {
      result.status = "partial";
      result.evidence = {};
    }
    result.repair = {
      attempted: true,
      applied: !noApplicableRepair,
      passes: noApplicableRepair ? 0 : 1,
      reason: noApplicableRepair
        ? "agent_reported_specific_unresolved_deficits"
        : "agent_targeted_candidates_validated_and_appended",
      evidence: noApplicableRepair ? rel(workspace.root, validationPath) : result.evidence.candidateValidation
    };
    result.evidence = {
      ...result.evidence,
      repairBrief: rel(workspace.root, briefPath),
      repairProposal: rel(workspace.root, proposalPath),
      proposalValidation: rel(workspace.root, validationPath),
      coverageIr: rel(workspace.root, repairPath),
      proposalItemCount: proposalValidation.proposalItemCount,
      acceptedCandidateCount: proposalValidation.acceptedCandidateCount,
      unresolvedCount: proposalValidation.unresolvedCount,
      synthesisReport: noApplicableRepair ? "" : rel(workspace.root, synthesisPath),
      synthesisAddedCount: noApplicableRepair ? 0 : 1
    };
  }
  if (stage === 11 && (
    initialPercent >= 80 ||
    options.skipFinalAfterRepair ||
    options.noApplicableRepair
  )) {
    result.status = "skipped";
    result.summary = "未应用修正，无需重复最终验证。";
    result.skipReason = "未应用修正，无需重复最终验证。";
  }
  if (stage === 11 && initialPercent < 80 && !options.skipFinalAfterRepair) {
    const simulation = path.join(workspace.outputDir, "final-simulation.json");
    const coveragePath = path.join(workspace.outputDir, "final-coverage.json");
    await writeFile(simulation, JSON.stringify({
      schema: "tcsd-simulation-result/v1",
      tests: [{
        row: 3,
        test_id: "TC_001",
        steps: [
          { index: 1, outputs: { Output: 1 }, stable: { Output: true } },
          { index: 2, outputs: { Output: 1 }, stable: { Output: true } }
        ]
      }]
    }));
    await writeFile(coveragePath, JSON.stringify({
      schema: "tcsd-coverage-report/v1",
      models: coverage(finalPercent)
    }));
    result.artifacts.push(
      { path: rel(workspace.root, workbook), kind: "xlsx", role: "workbook" },
      { path: rel(workspace.root, simulation), kind: "json", role: "simulation" },
      { path: rel(workspace.root, coveragePath), kind: "json", role: "coverage" }
    );
    result.coverage = { schema: "tcsd-coverage-report/v1", models: coverage(finalPercent) };
    result.evidence = {
      simulationResult: rel(workspace.root, simulation),
      expValueCount: 1,
      simulationValueCount: 1,
      workbookBackfillCount: 1,
      caseOutputCounts: { "3:TC_001": { Output: 1 } },
      backfillItems: [{ row: 3, testId: "TC_001", step: 1, output: "Output", value: 1 }]
    };
  }
  if (stage === 12) {
    const cleanup = path.join(workspace.outputDir, "cleanup.json");
    await writeFile(cleanup, JSON.stringify({
      schema: "tcsd-cleanup-result/v1",
      jobId: manifest.jobId,
      ownerJobId: manifest.jobId,
      removedEntries: []
    }));
    result.artifacts = [{ path: rel(workspace.root, cleanup), kind: "json", role: "cleanup" }];
    result.evidence = { cleanup: rel(workspace.root, cleanup) };
    if (options.agentClaimsCompleted) {
      const fakeExecution = path.join(workspace.outputDir, "agent-execution.json");
      await writeFile(fakeExecution, JSON.stringify({
        schema: "simulink-ut-tcsd-execution-manifest/v1",
        status: "completed",
        completion: "complete"
      }));
      result.artifacts.push({ path: rel(workspace.root, fakeExecution), kind: "json", role: "execution-manifest" });
      result.evidence.executionManifest = rel(workspace.root, fakeExecution);
      result.executionManifest = { status: "completed" };
    }
  }
  await writeFile(resultPath, JSON.stringify(result));
}

function createFakeHermes(workspace, options = {}) {
  const invocations = [];
  const attemptByStage = new Map();
  const commandRunner = async (_command, args) => {
    const prompt = args[args.indexOf("-q") + 1];
    const manifestPath = prompt.match(/input manifest: (.+)/)?.[1]?.trim();
    const resultPath = prompt.match(/candidate result path is: (.+)/)?.[1]?.trim();
    assert.ok(manifestPath);
    assert.ok(resultPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const attempt = (attemptByStage.get(manifest.stageIndex) || 0) + 1;
    attemptByStage.set(manifest.stageIndex, attempt);
    const sessionId = options.reuseSession && manifest.stageIndex > 1
      ? "session-01-1"
      : `session-${String(manifest.stageIndex).padStart(2, "0")}-${attempt}`;
    invocations.push({ args, prompt, manifest, sessionId });
    workspace.jobId = manifest.jobId;
    const omit =
      options.failValidationAlwaysStage === manifest.stageIndex ||
      (options.failValidationOnceStage === manifest.stageIndex && attempt === 1);
    if (!omit) {
      await writeStageResult(workspace, manifest, resultPath, options);
      if (options.malformedResultOnceStage === manifest.stageIndex && attempt === 1) {
        await writeFile(resultPath, "{");
      }
      if (options.partialArtifactOnceStage === manifest.stageIndex && attempt === 1) {
        const result = JSON.parse(await readFile(resultPath, "utf8"));
        await writeFile(path.join(workspace.root, result.artifacts[0].path), "");
      }
    }
    if (options.rejectAfterResultStage === manifest.stageIndex) {
      throw Object.assign(new Error("generic Hermes process failure"), {
        code: 1,
        stdout: "",
        stderr: "generic process failure"
      });
    }
    return { stdout: `non-authoritative agent text claims success\nsession_id: ${sessionId}\n`, stderr: "" };
  };
  return { invocations, commandRunner, attemptByStage };
}

async function runAgentPipeline(options = {}) {
  const workspace = await createWorkspace();
  const fake = createFakeHermes(workspace, options);
  const catalog = new TcsdStageCatalog({ skillsDir: skillsRoot });
  const registry = new TcsdHermesSkillRegistry({
    command: "fake-hermes",
    profile: "worker-profile",
    stateDbPath: path.join(workspace.root, "hermes-profile", "state.db"),
    skillsDir: path.join(workspace.root, "hermes-profile", "skills"),
    catalog,
    commandRunner: async () => ({
      stdout: TCSD_STAGE_DEFINITIONS.map((stage) => `${stage.skillName} stage skill`).join("\n"),
      stderr: ""
    })
  });
  const executor = new TcsdHermesStageExecutor({
    command: "fake-hermes",
    profile: "worker-profile",
    commandRunner: fake.commandRunner,
    usageReader: async (sessionId, _runtime, skill) => {
      const stageIndex = TCSD_STAGE_DEFINITIONS.find((stage) => stage.skillName === skill.name)?.index;
      const omitSkillLoad = Number(options.missingSkillLoadStage) === stageIndex;
      const mismatchSkillLoad = Number(options.mismatchedSkillLoadStage) === stageIndex;
      return {
        model: "fake-model-v1",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 120,
        skillLoad: omitSkillLoad ? null : {
          source: "hermes-state-db+skill-usage",
          loaded: true,
          skillName: skill.name,
          skillFileSha256: mismatchSkillLoad ? "0".repeat(64) : skill.skillFileHash,
          messageId: Number(sessionId.match(/\d+/)?.[0] || 1),
          messageSha256: hash(`slash-skill-message:${sessionId}:${skill.skillFileHash}`),
          usageCountBefore: 0,
          usageCountAfter: 1,
          lastUsedAt: new Date().toISOString()
        },
        sessionId
      };
    },
    catalog,
    maxTurns: 200,
    timeoutMs: 3600000
  });
  const service = new TcsdPipelineJobService({
    jobDir: path.join(workspace.root, "jobs"),
    prepareJob: () => registry.prepare(),
    executor: (stageIndex, input, job, execution) => executor.execute(stageIndex, input, job, execution),
    checkpointValidator: (checkpoint, context, job) => executor.validateCheckpoint(checkpoint, context, job)
  });
  const input = {
    taskId: `task-${hash(JSON.stringify(options)).slice(0, 8)}`,
    workspaceDir: workspace.root,
    outputDir: workspace.outputDir,
    modelSlxPath: workspace.modelSlxPath,
    modelMatPath: workspace.modelMatPath,
    coverageThreshold: 80
  };
  const started = await service.start(input);
  const duplicate = await service.start(input);
  assert.equal(duplicate.jobId, started.jobId);
  await service.running.get(started.jobId);
  return { workspace, fake, service, job: await service.get(started.jobId) };
}

{
  const { fake, job } = await runAgentPipeline({ failValidationOnceStage: 5 });
  assert.equal(job.status, "已完成", JSON.stringify({ error: job.error, stages: job.stages.map((stage) => ({ index: stage.index, status: stage.status, attempt: stage.attempt, error: stage.error })) }, null, 2));
  assert.equal(fake.invocations.length, 13);
  assert.equal(job.stages[4].attempt, 2);
  assert.equal(job.stages[4].attempts[0].status, "validation_failed");
  assert.equal(job.stages[4].attempts[1].status, "completed");
  const sessions = fake.invocations.map((item) => item.sessionId);
  assert.equal(new Set(sessions).size, 13);
  for (const invocation of fake.invocations) {
    const definition = TCSD_STAGE_DEFINITIONS[invocation.manifest.stageIndex - 1];
    assert.equal(invocation.prompt.startsWith(`/${definition.skillName} `), true);
    assert.match(invocation.prompt, /tcsd_stage_execute/);
    assert.equal(invocation.manifest.skill.name, definition.skillName);
    assert.match(invocation.manifest.skill.bundleHash, /^[a-f0-9]{64}$/);
    assert.match(invocation.manifest.skill.skillFileHash, /^[a-f0-9]{64}$/);
  }
  const stage10Invocation = fake.invocations.find((item) => item.manifest.stageIndex === 10);
  assert.match(stage10Invocation.prompt, /Run this exact prepare command first:/);
  assert.match(stage10Invocation.prompt, /--stage10-mode prepare/);
  assert.match(stage10Invocation.prompt, /repair-proposal\.json/);
  assert.match(stage10Invocation.prompt, /--stage10-mode apply/);
  assert.match(stage10Invocation.prompt, /Inspect only the uncovered target block and its local upstream model slice/);
  for (const stage of job.stages) {
    assert.equal(stage.checkpoint.schema, TCSD_CHECKPOINT_SCHEMA);
    assert.equal(stage.checkpoint.agent.profile, "worker-profile");
    assert.equal(stage.checkpoint.agent.model, "fake-model-v1");
    assert.equal(stage.checkpoint.agent.tokenUsage.totalTokens, 120);
    assert.equal(stage.checkpoint.agent.skillLoad.source, "hermes-state-db+skill-usage");
    assert.equal(stage.checkpoint.agent.skillLoad.skillName, stage.skillName);
    assert.equal(stage.checkpoint.validation.passed, true);
    assert.match(stage.checkpoint.prompt.sha256, /^[a-f0-9]{64}$/);
  }
}

{
  const { fake, job } = await runAgentPipeline({ malformedResultOnceStage: 4 });
  assert.equal(job.status, "已完成");
  assert.equal(job.stages[3].attempt, 2);
  assert.equal(fake.attemptByStage.get(4), 2);
}

{
  const { fake, job } = await runAgentPipeline({ partialArtifactOnceStage: 5 });
  assert.equal(job.status, "已完成");
  assert.equal(job.stages[4].attempt, 2);
  assert.equal(fake.attemptByStage.get(5), 2);
}

{
  const { fake, job } = await runAgentPipeline({ failValidationAlwaysStage: 5 });
  assert.equal(job.status, "失败");
  assert.equal(job.error.code, TCSD_ERROR_CODES.validation);
  assert.equal(job.stages[4].attempt, 2);
  assert.equal(fake.attemptByStage.get(5), 2);
  assert.equal(fake.invocations.length, 6);
}

for (const [options, stageIndex, label] of [
  [{ unexecutedProbe: true }, 6, "候选存在但 Probe 未执行"],
  [{ blankWorkbook: true }, 7, "未填充原始模板"],
  [{ emptySimulation: true }, 8, "空 simulation 与伪造计数"],
  [{ wrongExpValue: true }, 8, "错误 expValue"],
  [{ emptyCoverage: true }, 9, "空 coverage 与伪造覆盖率"],
  [{ initialCoverage: 50, skipRepairDespiteLow: true }, 10, "覆盖不足却跳过修正"],
  [{ initialCoverage: 50, tamperedRepairBrief: true }, 10, "Agent 篡改宿主覆盖缺口简报"],
  [{ initialCoverage: 50, skipFinalAfterRepair: true }, 11, "已修正却跳过最终覆盖率"],
  [{ agentClaimsCompleted: true }, 12, "Agent 自报 completed"]
]) {
  const { fake, job } = await runAgentPipeline(options);
  assert.equal(job.status, "失败", label);
  assert.equal(job.error.code, TCSD_ERROR_CODES.validation, label);
  assert.equal(job.stages[stageIndex - 1].attempt, 2, label);
  assert.equal(fake.attemptByStage.get(stageIndex), 2, label);
}

{
  const { fake, job } = await runAgentPipeline({ initialCoverage: 50, finalCoverage: 60 });
  assert.equal(job.status, "部分完成");
  assert.equal(job.completion, "partial");
  assert.equal(job.repair.required, true);
  assert.equal(job.repair.attempted, true);
  assert.equal(job.repair.applied, true);
  assert.equal(job.repair.passes, 1);
  assert.equal(job.coverage.final.aggregate.mcdc.percent, 60);
  assert.equal(fake.invocations.length, 12);
  assert.equal(job.stages[9].status, "已完成");
  assert.equal(job.stages[10].status, "已完成");
  assert.equal(job.stages[11].checkpoint.executionManifest.authority, "host");
  assert.equal(job.stages[11].checkpoint.executionManifest.completion, "partial");
  assert.equal(
    job.stages[11].checkpoint.executionManifest.workbook,
    "outputs/GenericModel_Test0001_tcsd.xlsx"
  );
  assert.equal(job.stages[11].checkpoint.executionManifest.evidence.checkpointCount, 12);
  assert.equal(
    job.stages[11].checkpoint.executionManifest.evidence.planningMappingAssessment.authority,
    "planning"
  );
  assert.equal(
    job.stages[11].checkpoint.executionManifest.evidence.planningMappingAssessment.blocking,
    false
  );
  assert.equal(
    job.stages[11].checkpoint.executionManifest.evidence.planningMappingAssessment.supersededBy.stageIndex,
    9
  );
  assert.equal(
    job.stages[11].checkpoint.executionManifest.evidence.planningMappingAssessment.supersededBy.coverageArtifact,
    job.stages[8].checkpoint.evidence.coverageReport
  );
}

{
  const { fake, job } = await runAgentPipeline({
    initialCoverage: 50,
    noApplicableRepair: true
  });
  assert.equal(job.status, "部分完成");
  assert.equal(job.completion, "partial");
  assert.equal(job.repair.required, true);
  assert.equal(job.repair.attempted, true);
  assert.equal(job.repair.applied, false);
  assert.equal(job.repair.passes, 0);
  assert.equal(job.stages[10].status, "已跳过");
  assert.equal(job.coverage.final.aggregate.mcdc.percent, 50);
  assert.deepEqual(
    job.coverage.final,
    job.stages[11].checkpoint.executionManifest.coverage.final
  );
  assert.equal(fake.invocations.length, 12);
}

{
  const { fake, job } = await runAgentPipeline({ hardFailureStage: 2 });
  assert.equal(job.status, "失败");
  assert.equal(job.error.code, TCSD_ERROR_CODES.environment);
  assert.match(job.error.message, /Stage 02 environment gate failed/);
  assert.match(job.error.message, /failed to attach to MATLAB session/);
  assert.match(job.stages[1].summary, /failed to attach to MATLAB session/);
  assert.equal(job.stages[1].attempt, 1);
  assert.equal(fake.attemptByStage.get(2), 1);
}

{
  const { job } = await runAgentPipeline({ hardFailureStage: 2, rejectAfterResultStage: 2 });
  assert.equal(job.status, "失败");
  assert.equal(job.error.code, TCSD_ERROR_CODES.environment);
  assert.match(job.error.message, /failed to attach to MATLAB session/);
  assert.doesNotMatch(job.error.message, /generic Hermes process failure/);
}

{
  const workspace = await createWorkspace();
  let calls = 0;
  const catalog = new TcsdStageCatalog({ skillsDir: skillsRoot });
  const registry = new TcsdHermesSkillRegistry({
    command: "fake-hermes",
    profile: "default",
    stateDbPath: path.join(workspace.root, "hermes-profile", "state.db"),
    skillsDir: path.join(workspace.root, "hermes-profile", "skills"),
    catalog,
    commandRunner: async () => ({
      stdout: TCSD_STAGE_DEFINITIONS.map((stage) => stage.skillName).join("\n"),
      stderr: ""
    })
  });
  const executor = new TcsdHermesStageExecutor({
    commandRunner: async () => {
      calls += 1;
      throw Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" });
    },
    catalog
  });
  const service = new TcsdPipelineJobService({
    jobDir: path.join(workspace.root, "jobs"),
    prepareJob: () => registry.prepare(),
    executor: (stageIndex, input, job, execution) => executor.execute(stageIndex, input, job, execution),
    checkpointValidator: (checkpoint, context, job) => executor.validateCheckpoint(checkpoint, context, job)
  });
  const started = await service.start({
    taskId: "timeout",
    workspaceDir: workspace.root,
    outputDir: workspace.outputDir,
    modelSlxPath: workspace.modelSlxPath,
    modelMatPath: workspace.modelMatPath
  });
  await service.running.get(started.jobId);
  const failed = await service.get(started.jobId);
  assert.equal(failed.error.code, TCSD_ERROR_CODES.timeout);
  assert.equal(failed.stages[0].attempt, 1);
  assert.equal(calls, 1);
}

{
  const { job } = await runAgentPipeline({ reuseSession: true });
  assert.equal(job.status, "失败");
  assert.equal(job.error.code, TCSD_ERROR_CODES.sessionReuse);
  assert.equal(job.stages[1].attempt, 1);
}

for (const options of [
  { missingSkillLoadStage: 3 },
  { mismatchedSkillLoadStage: 3 }
]) {
  const { fake, job } = await runAgentPipeline(options);
  assert.equal(job.status, "失败");
  assert.equal(job.error.code, TCSD_ERROR_CODES.checkpoint);
  assert.equal(job.stages[2].attempt, 1);
  assert.equal(fake.attemptByStage.get(3), 1);
}

{
  const { workspace, service, job } = await runAgentPipeline();
  job.status = "正在执行";
  job.completion = "";
  job.coverage.initial = null;
  job.stages[8].status = "正在执行";
  job.checkpoints = job.checkpoints.filter((item) => item.stageIndex !== 9);
  await service.save(job);
  let unexpectedExecutions = 0;
  const recoveredService = new TcsdPipelineJobService({
    jobDir: path.join(workspace.root, "jobs"),
    executor: async () => {
      unexpectedExecutions += 1;
      throw new Error("valid checkpoints must be resumed without rerunning");
    },
    checkpointValidator: service.checkpointValidator
  });
  await recoveredService.recoverAll();
  await recoveredService.running.get(job.jobId);
  const recovered = await recoveredService.get(job.jobId);
  assert.equal(recovered.status, "已完成");
  assert.equal(recovered.stages[8].status, "已完成");
  assert.equal(recovered.coverage.initial.aggregate.mcdc.percent, 90);
  assert.equal(recovered.checkpoints.some((item) => item.stageIndex === 9), true);
  assert.equal(unexpectedExecutions, 0);
}

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-v1-compat-"));
  const service = new TcsdPipelineJobService({ jobDir: root, executor: async () => {} });
  const terminal = {
    schema: TCSD_LEGACY_PIPELINE_SCHEMA,
    jobId: "legacy-terminal",
    idempotencyKey: "legacy-terminal",
    status: "已完成",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stages: []
  };
  const active = {
    schema: TCSD_LEGACY_PIPELINE_SCHEMA,
    jobId: "legacy-active",
    idempotencyKey: "legacy-active",
    status: "正在执行",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stages: createStages()
  };
  active.stages[0].status = "正在执行";
  await writeFile(path.join(root, "legacy-terminal.json"), JSON.stringify(terminal));
  await writeFile(path.join(root, "legacy-active.json"), JSON.stringify(active));
  const terminalBefore = await readFile(path.join(root, "legacy-terminal.json"), "utf8");
  await service.recoverAll();
  assert.equal(await readFile(path.join(root, "legacy-terminal.json"), "utf8"), terminalBefore);
  const obsolete = await service.get("legacy-active");
  assert.equal(obsolete.status, "失败");
  assert.equal(obsolete.error.code, TCSD_ERROR_CODES.obsolete);
}

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-linux-reconcile-"));
  const previous = {
    taskStoreDir: config.unitTestCase.taskStoreDir,
    projectRegistryPath: config.unitTestCase.projectRegistryPath,
    uploadTempDir: config.unitTestCase.uploadTempDir
  };
  Object.assign(config.unitTestCase, {
    taskStoreDir: path.join(root, "tasks"),
    projectRegistryPath: path.join(root, "projects.json"),
    uploadTempDir: path.join(root, "incoming")
  });
  try {
    let calls = 0;
    const client = {
      async startTcsdPipelineJob() {
        return { jobId: "job-1", status: "正在执行", schema: TCSD_PIPELINE_SCHEMA };
      },
      async getTcsdPipelineJob() {
        calls += 1;
        if (calls === 1 || calls === 3) {
          throw Object.assign(new Error("temporary"), { code: TCSD_ERROR_CODES.workerUnavailable });
        }
        return { jobId: "job-1", schema: TCSD_PIPELINE_SCHEMA, status: "正在执行", stages: [] };
      }
    };
    const service = new UnitTestCaseGenerationService({
      hermesAgentClient: client,
      remotePollWindowMs: 5,
      sleep: async () => {}
    });
    const task = {
      id: "platform-task",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspace: { directory: root, outputDir: path.join(root, "outputs") },
      pipeline: { jobId: "job-1", status: "正在执行" },
      unitTestProject: { id: "01", name: "P", label: "01_P" },
      inputs: {},
      hermes: {},
      artifacts: [],
      timeline: []
    };
    await service.saveTask(task);
    const result = await service.runRemotePipeline(task.id, task);
    assert.equal(result.status, "pending");
    assert.equal((await service.readTask(task.id)).workerPending, true);
    client.getTcsdPipelineJob = async () => {
      throw Object.assign(new Error("missing"), { code: TCSD_ERROR_CODES.jobNotFound });
    };
    await service.reconcileTask(task.id);
    assert.equal((await service.readTask(task.id)).status, "failed");
  } finally {
    Object.assign(config.unitTestCase, previous);
  }
}

const frontend = await readFile(path.join(repo, "public", "unit-test-case-generation.js"), "utf8");
assert.match(frontend, /十二阶段运行态/);
assert.match(frontend, /独立 Hermes Agent 会话/);
assert.match(frontend, /版本 \/ bundle/);
assert.match(frontend, /Profile \/ Model/);
assert.match(frontend, /工具日志摘要/);
assert.doesNotMatch(frontend, /simulink_ut_tcsd_generate|simulink-ut-tcsd-generator/);

const productionSources = await Promise.all([
  "src/hermes-app.js",
  "src/services/hermes-agent-client.js",
  "src/services/unit-test-case-generation-service.js"
].map((item) => readFile(path.join(repo, item), "utf8")));
assert.doesNotMatch(productionSources.join("\n"), /simulink_ut_tcsd_generate|simulink-ut-tcsd-generator/);
assert.doesNotMatch(productionSources.join("\n"), /A02|业务信号/);

console.log("TCSD Agent stage pipeline contract/orchestration/recovery tests passed");
