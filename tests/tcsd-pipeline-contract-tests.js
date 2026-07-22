import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TcsdPipelineJobService } from "../src/services/tcsd-pipeline-job-service.js";
import { TCSD_STAGE_NAMES, canTransition, createStages, normalizeCoverageReport, parseExecutionManifest, validateStageCheckpoint } from "../src/services/tcsd-pipeline-contract.js";
import { UnitTestCaseGenerationService } from "../src/services/unit-test-case-generation-service.js";
import { config } from "../src/config.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = path.join(repo, "skills/hermes/simulink-ut-tcsd-generator/assets/templates/tcsd_template.xlsx");
const coverage = (percent) => ({ GenericModel: { condition: { percent, passed: percent >= 80 }, decision: { percent, passed: percent >= 80 }, mcdc: { percent, passed: percent >= 80 } } });
const rel = (root, target) => path.relative(root, target).replaceAll(path.sep, "/");

assert.equal(TCSD_STAGE_NAMES.length, 12);
assert.equal(canTransition("正在执行", "等待执行"), true);
assert.equal(canTransition("已完成", "正在执行"), false);
assert.equal(normalizeCoverageReport(coverage(81)).aggregate.mcdc.percent, 81);
assert.throws(() => normalizeCoverageReport({ GenericModel: { condition: 80 } }), /没有有效模型记录/);
assert.equal(parseExecutionManifest({ schema: "simulink-ut-tcsd-execution-manifest/v1", status: "completed", completion: "partial", workbook: "outputs/result.xlsx", simulation: {}, evidence: {}, coverage: { initial: coverage(50), final: coverage(50), repair_required: true, repair_attempted: true, repair_applied: false, repair_passes: 0, repair_reason: "no_candidates", repair_evidence: "outputs/repair.json" } }).completion, "partial");

async function createHarness(mode = "passed") {
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-contract-")); const outputDir = path.join(root, "outputs"); const checkpointDir = path.join(outputDir, ".tcsd-checkpoints"); await mkdir(checkpointDir, { recursive: true });
  const workbook = path.join(outputDir, "GenericModel_Test0001_tcsd.xlsx"); await copyFile(template, workbook);
  const calls = [];
  const executor = async (index, _input, job) => {
    calls.push(index); const evidencePath = path.join(outputDir, `evidence-${index}.json`); await writeFile(evidencePath, JSON.stringify({ schema: `evidence-${index}/v1`, jobId: job.jobId }));
    const raw = { schema: "tcsd-stage-checkpoint/v1", jobId: job.jobId, stageIndex: index, status: "completed", summary: `stage-${index}`, artifacts: [{ path: rel(root, evidencePath), kind: "json", role: "evidence" }] };
    if (index === 3) { const initialized = path.join(outputDir, "initialized.json"); await writeFile(initialized, JSON.stringify({ schema:"tcsd-workspace-initialization/v1",jobId:job.jobId,completed:true })); raw.artifacts.push({ path:rel(root,initialized),kind:"json",role:"initialization" }); raw.evidence={initializationManifest:rel(root,initialized)}; }
    if (index === 8) { const sim = path.join(outputDir, "simulation.json"); await writeFile(sim, "{}"); raw.artifacts = [{ path: rel(root, workbook), kind: "xlsx", role: "workbook" }, { path: rel(root, sim), kind: "json", role: "simulation" }]; raw.evidence = { simulationResult: rel(root, sim), expValueCount: 1, simulationValueCount:1, workbookBackfillCount:1, caseOutputCounts:{TC_001:{Output:1}} }; }
    if (index === 9) raw.coverage = coverage(mode === "passed" ? 90 : 50);
    if (index === 10) { if (mode === "passed") { raw.status = "skipped"; raw.skipReason = "首轮达标"; raw.artifacts = []; } else { const ir = path.join(outputDir, "coverage-ir.json"); await writeFile(ir, "{}"); raw.artifacts.push({ path: rel(root, ir), kind: "json", role: "coverage_ir" }); const applied = mode === "repair"; raw.status = applied ? "completed" : "partial"; raw.repair = { required: true, attempted: true, applied, passes: applied ? 1 : 0, reason: applied ? "applied" : "no_candidates", evidence: rel(root, ir) }; raw.evidence = { coverageIr: rel(root, ir) }; } }
    if (index === 11) { if (mode !== "repair") { raw.status = "skipped"; raw.skipReason = mode === "passed" ? "首轮达标" : "修正未应用"; raw.artifacts = []; } else raw.coverage = coverage(85); }
    if (index === 12) {
      const initial = mode === "passed" ? coverage(90) : coverage(50); const final = mode === "repair" ? coverage(85) : initial; const applied = mode === "repair"; const attempted = mode !== "passed";
      const manifest = path.join(outputDir, "execution.json"), timeline = path.join(outputDir, "timeline.json"), artifacts = path.join(outputDir, "artifacts.json"), cleanup = path.join(outputDir, "cleanup.json");
      await writeFile(manifest, JSON.stringify({ schema: "simulink-ut-tcsd-execution-manifest/v1", status: "completed", completion: mode === "passed" || mode === "repair" ? "complete" : "partial", workbook: rel(root, workbook), simulation: { status: "completed", result: "outputs/simulation.json" }, evidence: {}, coverage: { initial, final, repair_required: attempted, repair_attempted: attempted, repair_applied: applied, repair_passes: applied ? 1 : 0, repair_reason: attempted ? (applied ? "applied" : "no_candidates") : "", repair_evidence: attempted ? "outputs/coverage-ir.json" : "" } }));
      await writeFile(timeline, JSON.stringify({ schema: "tcsd-stage-timeline/v1", jobId: job.jobId, events: [] })); await writeFile(artifacts, JSON.stringify({ schema: "tcsd-artifact-manifest/v1", jobId: job.jobId, artifacts: [{ path: rel(root, workbook), kind: "xlsx", role: "workbook" }] })); await writeFile(cleanup, JSON.stringify({ schema: "tcsd-cleanup-result/v1", jobId: job.jobId, ownerJobId: job.jobId, removedEntries: [] }));
      raw.status = mode === "attempted" ? "partial" : "completed"; raw.artifacts = [manifest, timeline, artifacts, cleanup, workbook].map((item) => ({ path: rel(root, item), kind: item.endsWith(".xlsx") ? "xlsx" : "json", role: "evidence" })); raw.evidence = { executionManifest: rel(root, manifest), timeline: rel(root, timeline), artifactManifest: rel(root, artifacts), cleanup: rel(root, cleanup) };
    }
    await writeFile(path.join(checkpointDir, `stage-${String(index).padStart(2, "0")}.json`), JSON.stringify(raw));
  };
  return { root, outputDir, calls, executor };
}

for (const mode of ["passed", "repair", "attempted"]) {
  const harness = await createHarness(mode); const service = new TcsdPipelineJobService({ jobDir: path.join(harness.root, "jobs"), executor: harness.executor }); const started = await service.start({ taskId: `task-${mode}`, workspaceDir: harness.root, outputDir: harness.outputDir }); const duplicate = await service.start({ taskId: `task-${mode}`, workspaceDir: harness.root, outputDir: harness.outputDir }); assert.equal(duplicate.jobId, started.jobId); await service.running.get(started.jobId); const job = await service.get(started.jobId); assert.deepEqual(harness.calls, [1,2,3,4,5,6,7,8,9,10,11,12]); assert.equal(job.status, mode === "attempted" ? "部分完成" : "已完成"); assert.equal(job.stages[9].status, mode === "passed" ? "已跳过" : mode === "attempted" ? "部分完成" : "已完成"); assert.equal(job.stages[10].status, mode === "repair" ? "已完成" : "已跳过");
}

{
  const harness = await createHarness("passed"); const service = new TcsdPipelineJobService({ jobDir: path.join(harness.root, "jobs"), executor: harness.executor }); const bad = { schema: "tcsd-deterministic-pipeline/v1", jobId: "recover-job", taskId: "recover", idempotencyKey: "recover", status: "正在执行", completion: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stages: createStages(), events: [], checkpoints: [], artifacts: [], coverage: { initial: null, final: null }, repair: {}, resources: { ownerJobId: "recover-job" }, error: null, input: { workspaceDir: harness.root, outputDir: harness.outputDir } }; bad.stages[0].status = "正在执行"; await service.save(bad); await service.recoverAll(); await service.running.get("recover-job"); const recovered = await service.get("recover-job"); assert.equal(recovered.status, "已完成"); assert.equal(recovered.stages[0].attempt, 1);
}

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-bad-checkpoint-")); const evidence = path.join(root, "e.json"); await writeFile(evidence, "{}"); await assert.rejects(() => validateStageCheckpoint({ schema: "tcsd-stage-checkpoint/v1", jobId: "wrong", stageIndex: 9, status: "completed", artifacts: [{ path: "e.json", kind: "json" }], coverage: coverage(90) }, { jobId: "expected", stageIndex: 9, workspaceDir: root }), /不匹配/);
}

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-env-failure-")); const outputDir = path.join(root, "outputs"); await mkdir(outputDir, { recursive: true }); const service = new TcsdPipelineJobService({ jobDir: path.join(root, "jobs"), executor: async (index, _input, job) => { if (index === 2) throw Object.assign(new Error("MATLAB unavailable"), { code: "tcsd_environment_gate_failed" }); const file = path.join(outputDir, `e-${index}.json`); await writeFile(file, "{}"); await mkdir(path.join(outputDir, ".tcsd-checkpoints"), { recursive: true }); await writeFile(path.join(outputDir, ".tcsd-checkpoints", `stage-${String(index).padStart(2,"0")}.json`), JSON.stringify({ schema:"tcsd-stage-checkpoint/v1",jobId:job.jobId,stageIndex:index,status:"completed",artifacts:[{path:rel(root,file),kind:"json"}] })); } }); const started = await service.start({ taskId:"env",workspaceDir:root,outputDir }); await service.running.get(started.jobId); const failed = await service.get(started.jobId); assert.equal(failed.status,"失败"); assert.equal(failed.error.code,"tcsd_environment_gate_failed");
}

{
  const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-linux-reconcile-")); const previous = { taskStoreDir: config.unitTestCase.taskStoreDir, projectRegistryPath: config.unitTestCase.projectRegistryPath, uploadTempDir: config.unitTestCase.uploadTempDir }; Object.assign(config.unitTestCase, { taskStoreDir: path.join(root, "tasks"), projectRegistryPath: path.join(root, "projects.json"), uploadTempDir: path.join(root, "incoming") });
  try {
    let calls = 0; const client = { transport: "api", async startTcsdPipelineJob(){ return { jobId: "job-1", status: "正在执行", schema: "tcsd-deterministic-pipeline/v1" }; }, async getTcsdPipelineJob(){ calls += 1; if (calls === 1 || calls === 3) throw Object.assign(new Error("temporary"), { code: "tcsd_worker_unavailable" }); return { jobId: "job-1", schema: "tcsd-deterministic-pipeline/v1", status: "正在执行", stages: [] }; } }; const service = new UnitTestCaseGenerationService({ hermesAgentClient: client, remotePollWindowMs: 5, sleep: async () => {} }); const task = { id: "platform-task", status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), workspace: { directory: root, outputDir: path.join(root,"outputs") }, pipeline: { jobId: "job-1", status: "正在执行" }, unitTestProject: { id:"01",name:"P",label:"01_P" }, inputs:{}, hermes:{}, artifacts:[], timeline:[] }; await service.saveTask(task); const result = await service.runRemotePipeline(task.id, task); assert.equal(result.status, "pending"); const pending = await service.readTask(task.id); assert.equal(pending.status, "running"); assert.equal(pending.workerPending, true);
    client.getTcsdPipelineJob = async () => { throw Object.assign(new Error("missing"), { code: "tcsd_job_not_found" }); }; await service.reconcileTask(task.id); assert.equal((await service.readTask(task.id)).status, "failed");
    const unavailable = new UnitTestCaseGenerationService({ hermesAgentClient: { transport:"api", async startTcsdPipelineJob(){ throw Object.assign(new Error("offline"),{code:"tcsd_worker_unavailable"}); } }, remotePollWindowMs:1, sleep:async()=>{} }); const queued = { ...task, id:"queued-task", status:"queued", pipeline:null, updatedAt:new Date().toISOString() }; await unavailable.saveTask(queued); await unavailable.runTask(queued.id); assert.equal((await unavailable.readTask(queued.id)).status,"queued"); assert.equal((await unavailable.readTask(queued.id)).workerPending,true);
  } finally { Object.assign(config.unitTestCase, previous); }
}

const frontend = await import("node:fs/promises").then(({ readFile }) => readFile(path.join(repo, "public/unit-test-case-generation.js"), "utf8"));
assert.match(frontend, /partial:\s*"部分完成"/); assert.match(frontend, /task\.status === "failed"/); assert.match(frontend, /十二阶段运行态/); assert.match(frontend, /artifacts\/\$\{encodeURIComponent\(artifact\.id\)\}\/download/);
console.log("TCSD pipeline contract/orchestration/recovery tests passed");
