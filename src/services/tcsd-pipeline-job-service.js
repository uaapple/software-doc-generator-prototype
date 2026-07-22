import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./storage.js";
import { TCSD_PIPELINE_SCHEMA, TCSD_ERROR_CODES, createStages, canTransition, coverageCompletion, coverageMeetsThreshold, isTerminalJobStatus, validateStageCheckpoint } from "./tcsd-pipeline-contract.js";

const now = () => new Date().toISOString();
const fileFor = (dir, id) => path.join(dir, `${id}.json`);
const checkpointFor = (job, index) => path.join(job.input.outputDir, ".tcsd-checkpoints", `stage-${String(index).padStart(2, "0")}.json`);
function publicError(error = {}) { return { code: typeof error.code === "string" ? error.code : TCSD_ERROR_CODES.stage, message: String(error.message || "TCSD 阶段执行失败。"), details: error.details || null }; }

export class TcsdPipelineJobService {
  constructor(options = {}) { this.jobDir = options.jobDir; this.executor = options.executor; this.running = new Map(); this.starting = new Map(); }
  async get(jobId) { return readJson(fileFor(this.jobDir, jobId), null); }
  async save(job) { await fs.mkdir(this.jobDir, { recursive: true }); job.updatedAt = now(); await writeJson(fileFor(this.jobDir, job.jobId), job); return job; }
  async list() { await fs.mkdir(this.jobDir, { recursive: true }); return Promise.all((await fs.readdir(this.jobDir)).filter((name) => name.endsWith(".json")).map((name) => readJson(path.join(this.jobDir, name), null))).then((items) => items.filter(Boolean)); }
  async start(input = {}) {
    const idempotencyKey = String(input.idempotencyKey || input.taskId || "");
    if (!idempotencyKey) throw Object.assign(new Error("TCSD job 缺少幂等键。"), { code: TCSD_ERROR_CODES.input });
    if (this.starting.has(idempotencyKey)) return this.starting.get(idempotencyKey);
    const starting = this.startInternal(input, idempotencyKey).finally(() => this.starting.delete(idempotencyKey)); this.starting.set(idempotencyKey, starting); return starting;
  }
  async startInternal(input, idempotencyKey) {
    const prior = (await this.list()).find((job) => job.idempotencyKey === idempotencyKey);
    if (prior) { if (!isTerminalJobStatus(prior.status)) this.run(prior.jobId); return prior; }
    const jobId = randomUUID();
    const job = { schema: TCSD_PIPELINE_SCHEMA, jobId, taskId: String(input.taskId || ""), idempotencyKey, status: "等待执行", completion: "", createdAt: now(), updatedAt: now(), stages: createStages(), events: [], checkpoints: [], artifacts: [], coverage: { initial: null, final: null }, repair: { required: false, attempted: false, applied: false, passes: 0, reason: "", evidence: "" }, resources: { ownerJobId: jobId, matlabSessions: [], mcpProcesses: [], paths: [String(input.workspaceDir || "")] }, error: null, input };
    await this.save(job); this.run(job.jobId); return job;
  }
  async event(job, type, data = {}) { job.events.push({ sequence: job.events.length + 1, at: now(), type, ...data }); job.events = job.events.slice(-500); await this.save(job); }
  async setStage(job, index, status, details = {}) {
    const stage = job.stages[index - 1];
    if (!stage || !canTransition(stage.status, status)) throw Object.assign(new Error(`非法 TCSD 状态转换: ${stage?.status} -> ${status}`), { code: TCSD_ERROR_CODES.illegalTransition });
    stage.status = status; if (status === "正在执行") { stage.startedAt = now(); stage.endedAt = ""; stage.attempt += 1; stage.error = null; } if (["已完成", "部分完成", "已跳过", "失败"].includes(status)) stage.endedAt = now();
    Object.assign(stage, details); job.status = status === "失败" ? "失败" : "正在执行"; await this.event(job, "stage", { stageIndex: index, stageName: stage.name, status, attempt: stage.attempt, summary: stage.summary });
  }
  async verifiedCheckpoint(job, index) {
    const raw = await readJson(checkpointFor(job, index), null); if (!raw) return null;
    try { return await validateStageCheckpoint(raw, { jobId: job.jobId, stageIndex: index, workspaceDir: job.input.workspaceDir }); } catch { return null; }
  }
  async recoverJob(job) {
    for (const stage of job.stages) {
      if (stage.status !== "正在执行") continue;
      const checkpoint = await this.verifiedCheckpoint(job, stage.index);
      if (checkpoint) { stage.status = checkpoint.status === "partial" ? "部分完成" : checkpoint.status === "skipped" ? "已跳过" : "已完成"; stage.endedAt = checkpoint.endedAt || now(); stage.checkpoint = checkpoint; }
      else { stage.status = "等待执行"; stage.startedAt = ""; stage.endedAt = ""; stage.summary = "服务重启后从未验证阶段重试。"; stage.checkpoint = null; }
    }
    job.status = job.stages.some((stage) => stage.status === "失败") ? "失败" : "等待执行"; await this.save(job); return job;
  }
  async recoverAll() { const recovered = []; for (const job of await this.list()) if (!isTerminalJobStatus(job.status)) { await this.recoverJob(job); this.run(job.jobId); recovered.push(job.jobId); } return recovered; }
  applyCheckpoint(job, checkpoint) {
    if (checkpoint.stageIndex === 9) { job.coverage.initial = checkpoint.coverage; job.repair.required = !coverageMeetsThreshold(checkpoint.coverage, Number(job.input.coverageThreshold || 80)); }
    if (checkpoint.stageIndex === 10) job.repair = { ...job.repair, ...(checkpoint.repair || {}) };
    if (checkpoint.stageIndex === 11 && checkpoint.status !== "skipped") job.coverage.final = checkpoint.coverage;
    if (checkpoint.stageIndex === 12) { job.artifacts = checkpoint.artifactManifest || checkpoint.artifacts || job.artifacts; if (checkpoint.executionManifest?.completion) job.completion = checkpoint.executionManifest.completion; }
  }
  async run(jobId) {
    if (this.running.has(jobId)) return this.running.get(jobId);
    const promise = (async () => {
      let job = await this.get(jobId); if (!job || isTerminalJobStatus(job.status)) return job;
      job = await this.recoverJob(job);
      try {
        for (let index = 1; index <= 12; index += 1) {
          const stage = job.stages[index - 1];
          if (["已完成", "已跳过", "部分完成"].includes(stage.status) && await this.verifiedCheckpoint(job, index)) continue;
          if (stage.status !== "等待执行") { stage.status = "等待执行"; await this.save(job); }
          await this.setStage(job, index, "正在执行");
          await this.executor(index, job.input, job);
          const checkpoint = await this.verifiedCheckpoint(job, index);
          if (!checkpoint) throw Object.assign(new Error(`第 ${index} 阶段未产生合法权威 checkpoint。`), { code: TCSD_ERROR_CODES.checkpoint });
          this.applyCheckpoint(job, checkpoint);
          const status = checkpoint.status === "skipped" ? "已跳过" : checkpoint.status === "partial" ? "部分完成" : "已完成";
          const summary = checkpoint.summary || checkpoint.skipReason || "阶段证据已验证。";
          job.checkpoints = [...job.checkpoints.filter((item) => item.stageIndex !== index), { stageIndex: index, path: checkpointFor(job, index), verifiedAt: now(), schema: checkpoint.schema }];
          await this.setStage(job, index, status, { summary, skipReason: checkpoint.skipReason || "", checkpoint });
        }
        const finalCoverage = job.coverage.final || job.coverage.initial;
        job.completion ||= coverageCompletion(finalCoverage || {}, job.stages.some((stage) => stage.status === "部分完成"), Number(job.input.coverageThreshold || 80));
        job.status = job.completion === "partial" ? "部分完成" : "已完成"; await this.event(job, "completed", { completion: job.completion }); return job;
      } catch (error) {
        const current = job.stages.find((stage) => stage.status === "正在执行"); const normalized = publicError(error);
        if (current) await this.setStage(job, current.index, "失败", { summary: normalized.message, error: normalized }); job.status = "失败"; job.error = normalized; await this.save(job); return job;
      } finally { this.running.delete(jobId); }
    })();
    this.running.set(jobId, promise); return promise;
  }
}
