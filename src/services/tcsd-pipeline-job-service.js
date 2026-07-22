import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson, pathExists } from "./storage.js";
import { TCSD_PIPELINE_SCHEMA, TCSD_ERROR_CODES, createStages, canTransition, coverageCompletion } from "./tcsd-pipeline-contract.js";

const now = () => new Date().toISOString();
const fileFor = (dir, id) => path.join(dir, `${id}.json`);

export class TcsdPipelineJobService {
  constructor(options = {}) { this.jobDir = options.jobDir; this.executor = options.executor; this.running = new Map(); }
  async get(jobId) { return readJson(fileFor(this.jobDir, jobId), null); }
  async save(job) { await fs.mkdir(this.jobDir, { recursive: true }); job.updatedAt = now(); await writeJson(fileFor(this.jobDir, job.jobId), job); return job; }
  async start(input = {}) {
    const idempotencyKey = String(input.idempotencyKey || input.taskId || "");
    await fs.mkdir(this.jobDir, { recursive: true });
    for (const name of await fs.readdir(this.jobDir)) { const prior = await readJson(path.join(this.jobDir, name), null); if (prior?.idempotencyKey && prior.idempotencyKey === idempotencyKey) return prior; }
    const job = { schema: TCSD_PIPELINE_SCHEMA, jobId: randomUUID(), taskId: String(input.taskId || ""), idempotencyKey, status: "等待执行", completion: "", createdAt: now(), updatedAt: now(), stages: createStages(), events: [], checkpoints: [], artifacts: [], coverage: null, repair: { attempted: false, applied: false }, error: null, input };
    await this.save(job); this.run(job.jobId); return job;
  }
  async event(job, type, data = {}) { job.events.push({ at: now(), type, ...data }); job.events = job.events.slice(-240); await this.save(job); }
  async setStage(job, index, status, details = {}) { const stage = job.stages[index - 1]; if (!stage || !canTransition(stage.status, status)) throw Object.assign(new Error("非法 TCSD 阶段状态转换"), { code: "tcsd_illegal_transition" }); stage.status = status; if (status === "正在执行") stage.startedAt ||= now(); if (["已完成", "部分完成", "已跳过", "失败"].includes(status)) stage.endedAt = now(); Object.assign(stage, details); job.status = status === "失败" ? "失败" : "正在执行"; await this.event(job, "stage", { stageIndex: index, status, summary: stage.summary }); }
  async run(jobId) {
    if (this.running.has(jobId)) return this.running.get(jobId);
    const promise = (async () => { const job = await this.get(jobId); if (!job || ["已完成", "部分完成", "失败"].includes(job.status)) return; try {
      for (let index = 1; index <= 12; index += 1) {
        const stage = job.stages[index - 1]; if (["已完成", "已跳过", "部分完成"].includes(stage.status)) continue;
        await this.setStage(job, index, "正在执行");
        const result = await this.executor(index, job.input, job);
        if (result?.skip) { await this.setStage(job, index, "已跳过", { summary: result.summary || "按规则跳过。", skipReason: result.skipReason || result.summary || "" }); continue; }
        if (!result?.checkpoint || !(await pathExists(result.checkpoint))) throw Object.assign(new Error("阶段检查点不存在或未通过校验"), { code: TCSD_ERROR_CODES.checkpoint });
        const checkpoint = { stageIndex: index, path: result.checkpoint, kind: result.kind || "json", verifiedAt: now(), summary: result.summary || "" }; job.checkpoints.push(checkpoint);
        if (result.artifacts) job.artifacts = result.artifacts; if (result.coverage) job.coverage = result.coverage; if (result.repair) job.repair = result.repair;
        await this.setStage(job, index, result.partial ? "部分完成" : "已完成", { summary: result.summary || "检查点已验证。", checkpoint });
      }
      job.completion = coverageCompletion(job.coverage || {}, job.stages.some((stage) => stage.status === "部分完成")); job.status = job.completion === "partial" ? "部分完成" : "已完成"; await this.event(job, "completed", { completion: job.completion });
    } catch (error) { const current = job.stages.find((stage) => stage.status === "正在执行"); if (current) await this.setStage(job, current.index, "失败", { summary: error.message, error: { code: error.code || TCSD_ERROR_CODES.stage, message: error.message } }); job.status = "失败"; job.error = { code: error.code || TCSD_ERROR_CODES.stage, message: error.message }; await this.save(job); } finally { this.running.delete(jobId); } })();
    this.running.set(jobId, promise); return promise;
  }
}
