import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
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
import { fileURLToPath } from "node:url";
import { TcsdHermesStageExecutor } from "../src/services/tcsd-hermes-stage-executor.js";
import { TcsdPipelineJobService } from "../src/services/tcsd-pipeline-job-service.js";
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
import { config } from "../src/config.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(repo, "skills", "hermes");
const template = path.join(skillsRoot, "tcsd-runtime", "assets", "templates", "tcsd_template.xlsx");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const coverage = (percent) => ({
  GenericModel: {
    condition: { percent, passed: percent >= 80 },
    decision: { percent, passed: percent >= 80 },
    mcdc: { percent, passed: percent >= 80 }
  }
});
const rel = (root, target) => path.relative(root, target).replaceAll(path.sep, "/");

assert.equal(TCSD_STAGE_DEFINITIONS.length, 12);
assert.equal(TCSD_PIPELINE_SCHEMA, "tcsd-agent-stage-pipeline/v2");
assert.equal(TCSD_STAGE_INPUT_SCHEMA, "tcsd-agent-stage-input/v1");
assert.equal(TCSD_STAGE_RESULT_SCHEMA, "tcsd-agent-stage-result/v1");
assert.equal(TCSD_CHECKPOINT_SCHEMA, "tcsd-agent-stage-checkpoint/v2");
assert.equal(canTransition("正在执行", "等待执行"), true);
assert.equal(canTransition("已完成", "正在执行"), false);
assert.equal(normalizeCoverageReport(coverage(81)).aggregate.mcdc.percent, 81);
assert.throws(() => normalizeCoverageReport({ GenericModel: { condition: 80 } }), /没有有效模型记录/);
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

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-agent-pipeline-"));
  const outputDir = path.join(root, "outputs");
  await mkdir(outputDir, { recursive: true });
  const modelSlxPath = path.join(root, "GenericModel.slx");
  const modelMatPath = path.join(root, "GenericModel.mat");
  await writeFile(modelSlxPath, "slx");
  await writeFile(modelMatPath, "mat");
  await copyFile(template, path.join(outputDir, "GenericModel_Test0001_tcsd.xlsx"));
  return { root, outputDir, modelSlxPath, modelMatPath };
}

async function jsonArtifact(workspace, stageIndex, schema, suffix = "") {
  const target = path.join(workspace.outputDir, `stage-${stageIndex}${suffix}.json`);
  await writeFile(target, JSON.stringify({ schema, stageIndex, jobId: workspace.jobId }));
  return { path: rel(workspace.root, target), kind: "json", role: "evidence" };
}

async function writeStageResult(workspace, manifest, resultPath, options = {}) {
  const stage = manifest.stageIndex;
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
      message: "hard runtime failure",
      hard: true
    };
    await writeFile(resultPath, JSON.stringify(result));
    return;
  }
  if (stage === 1) result.artifacts.push(await jsonArtifact(workspace, stage, "tcsd-input-manifest/v1"));
  if (stage === 2) {
    const artifact = await jsonArtifact(workspace, stage, "tcsd-environment-gate/v1");
    const absolute = path.join(workspace.root, artifact.path);
    await writeFile(absolute, JSON.stringify({
      schema: "tcsd-environment-gate/v1",
      passed: true,
      matlabRoot: "/opt/matlab",
      runner: "satk_eval.py"
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
    result.artifacts.push(await jsonArtifact(workspace, stage, "simulink-ut-state-probe-plan/v1"));
    result.evidence = { candidateCount: 0, probeExecuted: false };
  }
  const workbook = path.join(workspace.outputDir, "GenericModel_Test0001_tcsd.xlsx");
  if (stage === 7) {
    result.artifacts.push({ path: rel(workspace.root, workbook), kind: "xlsx", role: "workbook" });
  }
  if (stage === 8) {
    const simulation = path.join(workspace.outputDir, "simulation.json");
    await writeFile(simulation, "{}");
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
    result.artifacts.push(await jsonArtifact(workspace, stage, "tcsd-coverage-report/v1"));
    result.coverage = coverage(90);
  }
  if (stage === 10 || stage === 11) {
    result.status = "skipped";
    result.summary = "首轮覆盖率已达标。";
    result.skipReason = "首轮覆盖率已达标。";
  }
  if (stage === 12) {
    const simulation = path.join(workspace.outputDir, "simulation.json");
    const initialCoverage = path.join(workspace.outputDir, "initial-coverage.json");
    const execution = path.join(workspace.outputDir, "execution.json");
    const timeline = path.join(workspace.outputDir, "timeline.json");
    const artifacts = path.join(workspace.outputDir, "artifacts.json");
    const cleanup = path.join(workspace.outputDir, "cleanup.json");
    await writeFile(initialCoverage, JSON.stringify(coverage(90)));
    await writeFile(execution, JSON.stringify({
      schema: "simulink-ut-tcsd-execution-manifest/v1",
      status: "completed",
      completion: "complete",
      workbook: rel(workspace.root, workbook),
      simulation: { status: "completed", result: rel(workspace.root, simulation) },
      evidence: {},
      coverage: {
        initial: coverage(90),
        final: coverage(90),
        initial_artifact: rel(workspace.root, initialCoverage),
        final_artifact: rel(workspace.root, initialCoverage),
        repair_required: false,
        repair_attempted: false,
        repair_applied: false,
        repair_passes: 0,
        repair_reason: "",
        repair_evidence: ""
      }
    }));
    await writeFile(timeline, JSON.stringify({
      schema: "tcsd-stage-timeline/v1",
      jobId: manifest.jobId,
      events: []
    }));
    await writeFile(artifacts, JSON.stringify({
      schema: "tcsd-artifact-manifest/v1",
      jobId: manifest.jobId,
      artifacts: [{ path: rel(workspace.root, workbook), kind: "xlsx", role: "workbook" }]
    }));
    await writeFile(cleanup, JSON.stringify({
      schema: "tcsd-cleanup-result/v1",
      jobId: manifest.jobId,
      ownerJobId: manifest.jobId,
      removedEntries: []
    }));
    result.artifacts = [execution, timeline, artifacts, cleanup, workbook].map((item) => ({
      path: rel(workspace.root, item),
      kind: item.endsWith(".xlsx") ? "xlsx" : "json",
      role: "evidence"
    }));
    result.evidence = {
      executionManifest: rel(workspace.root, execution),
      timeline: rel(workspace.root, timeline),
      artifactManifest: rel(workspace.root, artifacts),
      cleanup: rel(workspace.root, cleanup)
    };
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
    return { stdout: `non-authoritative agent text claims success\nsession_id: ${sessionId}\n`, stderr: "" };
  };
  return { invocations, commandRunner, attemptByStage };
}

async function runAgentPipeline(options = {}) {
  const workspace = await createWorkspace();
  const fake = createFakeHermes(workspace, options);
  const executor = new TcsdHermesStageExecutor({
    command: "fake-hermes",
    profile: "worker-profile",
    commandRunner: fake.commandRunner,
    usageReader: async (sessionId) => ({
      model: "fake-model-v1",
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 120,
      sessionId
    }),
    catalog: new TcsdStageCatalog({ skillsDir: skillsRoot }),
    maxTurns: 200,
    timeoutMs: 3600000
  });
  const service = new TcsdPipelineJobService({
    jobDir: path.join(workspace.root, "jobs"),
    executor: (stageIndex, input, job, execution) => executor.execute(stageIndex, input, job, execution)
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
    assert.match(invocation.prompt, new RegExp(`\\$${definition.skillName}`));
    assert.match(invocation.prompt, /tcsd_stage_execute/);
    assert.equal(invocation.manifest.skill.name, definition.skillName);
    assert.match(invocation.manifest.skill.bundleHash, /^[a-f0-9]{64}$/);
  }
  for (const stage of job.stages) {
    assert.equal(stage.checkpoint.schema, TCSD_CHECKPOINT_SCHEMA);
    assert.equal(stage.checkpoint.agent.profile, "worker-profile");
    assert.equal(stage.checkpoint.agent.model, "fake-model-v1");
    assert.equal(stage.checkpoint.agent.tokenUsage.totalTokens, 120);
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

{
  const { fake, job } = await runAgentPipeline({ hardFailureStage: 2 });
  assert.equal(job.status, "失败");
  assert.equal(job.error.code, TCSD_ERROR_CODES.environment);
  assert.equal(job.stages[1].attempt, 1);
  assert.equal(fake.attemptByStage.get(2), 1);
}

{
  const workspace = await createWorkspace();
  let calls = 0;
  const executor = new TcsdHermesStageExecutor({
    commandRunner: async () => {
      calls += 1;
      throw Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" });
    },
    catalog: new TcsdStageCatalog({ skillsDir: skillsRoot })
  });
  const service = new TcsdPipelineJobService({
    jobDir: path.join(workspace.root, "jobs"),
    executor: (stageIndex, input, job, execution) => executor.execute(stageIndex, input, job, execution)
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
    }
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
