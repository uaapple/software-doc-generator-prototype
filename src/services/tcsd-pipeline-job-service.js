import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./storage.js";
import {
  TCSD_LEGACY_PIPELINE_SCHEMA,
  TCSD_PIPELINE_SCHEMA,
  TCSD_ERROR_CODES,
  createStages,
  canTransition,
  coverageCompletion,
  coverageMeetsThreshold,
  isTerminalJobStatus,
  validateStageCheckpoint
} from "./tcsd-pipeline-contract.js";

const now = () => new Date().toISOString();
const fileFor = (dir, id) => path.join(dir, `${id}.json`);
const checkpointFor = (job, index) => path.join(
  job.input.outputDir,
  ".tcsd-checkpoints",
  `stage-${String(index).padStart(2, "0")}.json`
);
const runnerStateFor = (job) => path.join(
  job.input.outputDir,
  ".tcsd-runtime",
  "runner-state.json"
);

function publicError(error = {}) {
  return {
    code: typeof error.code === "string" ? error.code : TCSD_ERROR_CODES.stage,
    message: String(error.message || "TCSD 阶段执行失败。"),
    details: error.details || null
  };
}

function obsoleteError() {
  return {
    code: TCSD_ERROR_CODES.obsolete,
    message: "未终止的 TCSD v1 作业不能在 v2 Agent 分阶段流水线中恢复。",
    details: { legacySchema: TCSD_LEGACY_PIPELINE_SCHEMA, requiredSchema: TCSD_PIPELINE_SCHEMA }
  };
}

export class TcsdPipelineJobService {
  constructor(options = {}) {
    this.jobDir = options.jobDir;
    this.executor = options.executor;
    this.prepareJob = options.prepareJob || null;
    this.checkpointValidator = options.checkpointValidator || validateStageCheckpoint;
    this.runGate = options.runGate || null;
    this.cancelExecution = options.cancelExecution || null;
    this.running = new Map();
    this.starting = new Map();
    this.cancelled = new Set();
  }

  async get(jobId) {
    return readJson(fileFor(this.jobDir, jobId), null);
  }

  async save(job) {
    await fs.mkdir(this.jobDir, { recursive: true });
    job.updatedAt = now();
    await writeJson(fileFor(this.jobDir, job.jobId), job);
    return job;
  }

  async list() {
    await fs.mkdir(this.jobDir, { recursive: true });
    const names = (await fs.readdir(this.jobDir)).filter((name) => name.endsWith(".json"));
    const items = await Promise.all(names.map((name) => readJson(path.join(this.jobDir, name), null)));
    return items.filter(Boolean);
  }

  async expireStaleJobs(cutoffMs = 0) {
    const expired = [];
    for (const job of await this.list()) {
      const updatedAt = Date.parse(job.updatedAt || job.createdAt || "") || 0;
      if (
        isTerminalJobStatus(job.status) ||
        this.running.has(job.jobId) ||
        updatedAt > Number(cutoffMs || 0)
      ) {
        continue;
      }
      const message = "TCSD 作业租约已过期，Worker 已停止保留上传工作区。";
      const current = job.stages?.find((stage) => ["正在执行", "等待执行"].includes(stage.status));
      if (current) {
        current.status = "失败";
        current.endedAt = now();
        current.summary = message;
        current.error = { code: "tcsd_job_lease_expired", message, details: null };
      }
      job.status = "失败";
      job.error = { code: "tcsd_job_lease_expired", message, details: null };
      await this.save(job);
      expired.push(job.jobId);
    }
    return expired;
  }

  async start(input = {}) {
    const idempotencyKey = String(input.idempotencyKey || input.taskId || "");
    if (!idempotencyKey) {
      throw Object.assign(new Error("TCSD job 缺少幂等键。"), { code: TCSD_ERROR_CODES.input });
    }
    if (this.starting.has(idempotencyKey)) return this.starting.get(idempotencyKey);
    const starting = this.startInternal(input, idempotencyKey).finally(() => this.starting.delete(idempotencyKey));
    this.starting.set(idempotencyKey, starting);
    return starting;
  }

  async markLegacyObsolete(job) {
    if (job.schema !== TCSD_LEGACY_PIPELINE_SCHEMA || isTerminalJobStatus(job.status)) return job;
    const error = obsoleteError();
    const current = job.stages?.find((stage) => stage.status === "正在执行" || stage.status === "等待执行");
    if (current) {
      current.status = "失败";
      current.endedAt = now();
      current.summary = error.message;
      current.error = error;
    }
    job.status = "失败";
    job.error = error;
    await this.save(job);
    return job;
  }

  async startInternal(input, idempotencyKey) {
    const prior = (await this.list()).find((job) => job.idempotencyKey === idempotencyKey);
    if (prior) {
      if (prior.schema === TCSD_LEGACY_PIPELINE_SCHEMA && !isTerminalJobStatus(prior.status)) {
        return this.markLegacyObsolete(prior);
      }
      if (prior.schema === TCSD_PIPELINE_SCHEMA && !isTerminalJobStatus(prior.status)) this.run(prior.jobId);
      return prior;
    }
    const jobId = randomUUID();
    const job = {
      schema: TCSD_PIPELINE_SCHEMA,
      jobId,
      taskId: String(input.taskId || ""),
      idempotencyKey,
      status: "等待执行",
      completion: "",
      createdAt: now(),
      updatedAt: now(),
      stages: createStages(),
      events: [],
      checkpoints: [],
      artifacts: [],
      coverage: { initial: null, final: null },
      repair: {
        required: false,
        attempted: false,
        applied: false,
        passes: 0,
        reason: "",
        evidence: ""
      },
      resources: {
        ownerJobId: jobId,
        matlabSessions: [],
        mcpProcesses: [],
        paths: [String(input.workspaceDir || "")]
      },
      error: null,
      input
    };
    if (this.prepareJob) job.skillSnapshot = await this.prepareJob(job);
    await this.save(job);
    this.run(job.jobId);
    return job;
  }

  async event(job, type, data = {}) {
    job.events.push({ sequence: job.events.length + 1, at: now(), type, ...data });
    job.events = job.events.slice(-500);
    await this.save(job);
  }

  async setStage(job, index, status, details = {}) {
    const stage = job.stages[index - 1];
    if (!stage || !canTransition(stage.status, status)) {
      throw Object.assign(new Error(`非法 TCSD 状态转换: ${stage?.status} -> ${status}`), {
        code: TCSD_ERROR_CODES.illegalTransition
      });
    }
    const previous = stage.status;
    stage.status = status;
    if (status === "正在执行") {
      stage.startedAt = now();
      stage.endedAt = "";
      stage.attempt += 1;
      stage.error = null;
    }
    if (["已完成", "部分完成", "已跳过", "失败", "已取消"].includes(status) || (previous === "正在执行" && status === "等待执行")) {
      stage.endedAt = now();
    }
    Object.assign(stage, details);
    job.status = status === "失败" ? "失败" : status === "已取消" ? "已取消" : "正在执行";
    await this.event(job, "stage", {
      stageIndex: index,
      stageName: stage.name,
      skillName: stage.skillName,
      status,
      attempt: stage.attempt,
      summary: stage.summary
    });
  }

  priorSessionIds(job, stageIndex) {
    const sessionIds = new Set();
    for (const stage of job.stages || []) {
      if (stage.index !== stageIndex && stage.checkpoint?.agent?.sessionId) {
        sessionIds.add(stage.checkpoint.agent.sessionId);
      }
      for (const attempt of Array.isArray(stage.attempts) ? stage.attempts : []) {
        if (stage.index !== stageIndex || attempt.status !== "completed") {
          if (attempt.sessionId) sessionIds.add(attempt.sessionId);
        }
      }
    }
    return sessionIds;
  }

  async verifiedCheckpoint(job, index, options = {}) {
    const raw = await readJson(checkpointFor(job, index), null);
    if (!raw) {
      if (options.throwOnInvalid) {
        throw Object.assign(new Error(`第 ${index} 阶段未产生权威 checkpoint。`), {
          code: TCSD_ERROR_CODES.validation,
          details: { stageIndex: index }
        });
      }
      return null;
    }
    try {
      return await this.checkpointValidator(raw, {
        jobId: job.jobId,
        stageIndex: index,
        workspaceDir: job.input.workspaceDir,
        priorSessionIds: this.priorSessionIds(job, index),
        pipelineState: job
      }, job);
    } catch (cause) {
      if (options.throwOnInvalid) {
        throw Object.assign(new Error(`第 ${index} 阶段 checkpoint 验证失败：${cause.message}`), {
          code: TCSD_ERROR_CODES.validation,
          details: { stageIndex: index, causeCode: cause.code || TCSD_ERROR_CODES.checkpoint }
        });
      }
      return null;
    }
  }

  async recoverJob(job) {
    if (job.schema === TCSD_LEGACY_PIPELINE_SCHEMA) return this.markLegacyObsolete(job);
    if (job.schema !== TCSD_PIPELINE_SCHEMA) {
      job.status = "失败";
      job.error = obsoleteError();
      await this.save(job);
      return job;
    }
    for (const stage of job.stages) {
      if (stage.status !== "正在执行") continue;
      const checkpoint = await this.verifiedCheckpoint(job, stage.index);
      if (checkpoint) {
        stage.status = checkpoint.status === "partial"
          ? "部分完成"
          : checkpoint.status === "skipped"
            ? "已跳过"
            : "已完成";
        stage.endedAt = checkpoint.endedAt || now();
        stage.checkpoint = checkpoint;
        this.recordAttempt(stage, checkpoint, "completed");
        this.applyCheckpoint(job, checkpoint);
        job.checkpoints = [
          ...job.checkpoints.filter((item) => item.stageIndex !== stage.index),
          {
            stageIndex: stage.index,
            path: checkpointFor(job, stage.index),
            verifiedAt: now(),
            schema: checkpoint.schema,
            sessionId: checkpoint.agent.sessionId,
            skillName: checkpoint.skill.name,
            bundleHash: checkpoint.skill.bundleHash
          }
        ];
      } else if (stage.attempt >= 2) {
        stage.status = "失败";
        stage.endedAt = now();
        stage.summary = "服务重启后阶段证据无效且两次独立会话机会已用尽。";
        stage.error = {
          code: TCSD_ERROR_CODES.validation,
          message: stage.summary,
          details: { stageIndex: stage.index, attempt: stage.attempt }
        };
      } else {
        stage.status = "等待执行";
        stage.startedAt = "";
        stage.endedAt = "";
        stage.summary = "服务重启后从未验证阶段使用新会话恢复。";
        stage.checkpoint = null;
      }
    }
    job.status = job.stages.some((stage) => stage.status === "失败") ? "失败" : "等待执行";
    if (job.status === "失败") {
      job.error = job.stages.find((stage) => stage.status === "失败")?.error || publicError();
    }
    await this.save(job);
    return job;
  }

  async recoverAll() {
    const recovered = [];
    for (const job of await this.list()) {
      if (isTerminalJobStatus(job.status)) continue;
      await this.recoverJob(job);
      const current = await this.get(job.jobId);
      if (!isTerminalJobStatus(current.status)) this.run(current.jobId);
      recovered.push(job.jobId);
    }
    return recovered;
  }

  applyCheckpoint(job, checkpoint) {
    if (checkpoint.stageIndex === 9) {
      job.coverage.initial = checkpoint.coverage;
      job.repair.required = !coverageMeetsThreshold(
        checkpoint.coverage,
        Number(job.input.coverageThreshold || 80)
      );
    }
    if (checkpoint.stageIndex === 10 && checkpoint.repair) {
      job.repair = { ...job.repair, ...checkpoint.repair };
    }
    if (checkpoint.stageIndex === 11 && checkpoint.status !== "skipped") {
      job.coverage.final = checkpoint.coverage;
    }
    if (checkpoint.stageIndex === 12) {
      job.artifacts = checkpoint.artifactManifest || checkpoint.artifacts || job.artifacts;
      if (checkpoint.executionManifest?.coverage?.final) {
        job.coverage.final = checkpoint.executionManifest.coverage.final;
      }
      if (checkpoint.executionManifest?.completion) job.completion = checkpoint.executionManifest.completion;
    }
  }

  recordAttempt(stage, checkpointOrError, status) {
    const agent = checkpointOrError?.agent || checkpointOrError?.details || {};
    const record = {
      attempt: stage.attempt,
      status,
      sessionId: agent.sessionId || "",
      profile: agent.profile || "",
      model: agent.model || "",
      tokenUsage: agent.tokenUsage || null,
      validationReportPath: agent.validationReportPath || checkpointOrError?.validation?.reportPath || "",
      endedAt: now()
    };
    stage.attempts = [
      ...(Array.isArray(stage.attempts) ? stage.attempts : []).filter((item) => item.attempt !== record.attempt),
      record
    ];
  }

  async captureAttemptState(job, index) {
    if (index !== 10 || !String(job.input?.outputDir || "").trim()) return null;
    const targetPath = runnerStateFor(job);
    try {
      const [bytes, stat] = await Promise.all([
        fs.readFile(targetPath),
        fs.stat(targetPath)
      ]);
      return { targetPath, existed: true, bytes, mode: stat.mode };
    } catch (cause) {
      if (cause?.code === "ENOENT") {
        return { targetPath, existed: false, bytes: null, mode: null };
      }
      throw cause;
    }
  }

  async restoreAttemptState(snapshot) {
    if (!snapshot) return;
    if (!snapshot.existed) {
      await fs.rm(snapshot.targetPath, { force: true });
      return;
    }
    const tempPath = `${snapshot.targetPath}.restore-${process.pid}-${Date.now()}-${randomUUID()}`;
    await fs.mkdir(path.dirname(snapshot.targetPath), { recursive: true });
    await fs.writeFile(tempPath, snapshot.bytes, { mode: snapshot.mode });
    await fs.rename(tempPath, snapshot.targetPath);
  }

  async executeStage(job, index) {
    const stage = job.stages[index - 1];
    let validationReportPath = stage.attempts?.at(-1)?.validationReportPath || "";
    while (stage.attempt < 2) {
      const nextAttempt = stage.attempt + 1;
      const attemptState = await this.captureAttemptState(job, index);
      await this.setStage(job, index, "正在执行", {
        summary: nextAttempt === 1
          ? "单个 DSH 会话正在执行整条流水线，等待本阶段 checkpoint。"
          : "宿主校验未通过，等待同一 DSH 会话再次产出本阶段 checkpoint。"
      });
      try {
        if (this.cancelled.has(job.jobId)) throw this.cancelledError(job.jobId);
        await this.executor(index, job.input, job, {
          attempt: stage.attempt,
          validationReportPath
        });
        if (this.cancelled.has(job.jobId)) throw this.cancelledError(job.jobId);
        const checkpoint = await this.verifiedCheckpoint(job, index, { throwOnInvalid: true });
        this.recordAttempt(stage, checkpoint, "completed");
        return checkpoint;
      } catch (error) {
        if (this.cancelled.has(job.jobId) || error?.code === TCSD_ERROR_CODES.cancelled) {
          throw this.cancelledError(job.jobId);
        }
        const normalized = publicError(error);
        this.recordAttempt(stage, error, error.code === TCSD_ERROR_CODES.validation ? "validation_failed" : "failed");
        try {
          await this.restoreAttemptState(attemptState);
        } catch (restoreError) {
          throw Object.assign(new Error(`第 ${index} 阶段失败尝试的运行状态无法恢复：${restoreError.message}`), {
            code: TCSD_ERROR_CODES.stage,
            details: { stageIndex: index, attempt: stage.attempt, stateRestoreFailed: true }
          });
        }
        const retryable = [TCSD_ERROR_CODES.validation, TCSD_ERROR_CODES.stalled].includes(error.code);
        if (retryable && stage.attempt < 2) {
          if (error.code === TCSD_ERROR_CODES.validation) {
            validationReportPath = error.details?.validationReportPath || validationReportPath;
          }
          await this.setStage(job, index, "等待执行", {
            summary: error.code === TCSD_ERROR_CODES.stalled
              ? "Hermes 会话长时间无结果且无可观察进展，将使用新 session 自动重试一次。"
              : "宿主确定性校验失败，将使用新 session 自动修复一次。",
            error: normalized
          });
          continue;
        }
        throw error;
      }
    }
    throw Object.assign(new Error(`第 ${index} 阶段两次独立会话均未通过确定性校验。`), {
      code: TCSD_ERROR_CODES.validation,
      details: { stageIndex: index, attempts: stage.attempt }
    });
  }

  async run(jobId) {
    if (this.running.has(jobId)) return this.running.get(jobId);
    const execute = () => this.runUnserialized(jobId);
    const promise = this.runGate ? this.runGate.run(execute) : execute();
    this.running.set(jobId, promise);
    promise
      .catch(() => {})
      .finally(() => {
        if (this.running.get(jobId) === promise) this.running.delete(jobId);
        this.cancelled.delete(jobId);
      });
    return promise;
  }

  async runUnserialized(jobId) {
    let job = await this.get(jobId);
    if (!job || isTerminalJobStatus(job.status)) return job;
    job = await this.recoverJob(job);
    if (isTerminalJobStatus(job.status)) return job;
    try {
      for (let index = 1; index <= 12; index += 1) {
        if (this.cancelled.has(jobId)) return this.get(jobId);
        const stage = job.stages[index - 1];
        if (["已完成", "已跳过", "部分完成"].includes(stage.status) && await this.verifiedCheckpoint(job, index)) {
          continue;
        }
        if (stage.status !== "等待执行") {
          stage.status = "等待执行";
          await this.save(job);
        }
        const checkpoint = await this.executeStage(job, index);
        this.applyCheckpoint(job, checkpoint);
        const status = checkpoint.status === "skipped"
          ? "已跳过"
          : checkpoint.status === "partial"
            ? "部分完成"
            : "已完成";
        const summary = checkpoint.summary || checkpoint.skipReason || "阶段证据已验证。";
        job.checkpoints = [
          ...job.checkpoints.filter((item) => item.stageIndex !== index),
          {
            stageIndex: index,
            path: checkpointFor(job, index),
            verifiedAt: now(),
            schema: checkpoint.schema,
            sessionId: checkpoint.agent.sessionId,
            skillName: checkpoint.skill.name,
            bundleHash: checkpoint.skill.bundleHash
          }
        ];
        await this.setStage(job, index, status, {
          summary,
          skipReason: checkpoint.skipReason || "",
          checkpoint
        });
      }
      const finalCoverage = job.coverage.final || job.coverage.initial;
      job.completion ||= coverageCompletion(
        finalCoverage || {},
        job.stages.some((stage) => stage.status === "部分完成"),
        Number(job.input.coverageThreshold || 80)
      );
      job.status = job.completion === "partial" ? "部分完成" : "已完成";
      await this.event(job, "completed", { completion: job.completion });
      return job;
    } catch (error) {
      if (this.cancelled.has(jobId) || error?.code === TCSD_ERROR_CODES.cancelled) {
        return this.get(jobId);
      }
      const current = job.stages.find((stage) => stage.status === "正在执行" || stage.status === "等待执行");
      const normalized = publicError(error);
      if (current) {
        if (current.status === "等待执行") current.status = "正在执行";
        await this.setStage(job, current.index, "失败", { summary: normalized.message, error: normalized });
      }
      job.status = "失败";
      job.error = normalized;
      await this.save(job);
      return job;
    }
  }

  cancelledError(jobId = "") {
    return Object.assign(new Error("TCSD 作业已由用户取消。"), {
      code: TCSD_ERROR_CODES.cancelled,
      details: { jobId }
    });
  }

  async cancel(jobId = "") {
    const normalizedJobId = String(jobId || "").trim();
    const job = await this.get(normalizedJobId);
    if (!job) {
      throw Object.assign(new Error("TCSD 作业不存在。"), { code: TCSD_ERROR_CODES.jobNotFound });
    }
    if (isTerminalJobStatus(job.status)) {
      let executionStopped = true;
      if (job.status === "已取消" && this.running.has(normalizedJobId) && typeof this.cancelExecution === "function") {
        const stopResult = await this.cancelExecution(normalizedJobId, job);
        executionStopped = stopResult?.stopped !== false;
      }
      return { job, cancelled: job.status === "已取消", alreadyTerminal: true, executionStopped };
    }
    this.cancelled.add(normalizedJobId);
    const current = job.stages?.find((stage) => ["正在执行", "等待执行"].includes(stage.status));
    if (current) {
      current.status = "已取消";
      current.endedAt = now();
      current.summary = "任务已由用户取消。";
      current.error = publicError(this.cancelledError(normalizedJobId));
    }
    job.status = "已取消";
    job.cancelledAt = now();
    job.error = publicError(this.cancelledError(normalizedJobId));
    await this.event(job, "cancelled", { stageIndex: current?.index || null });
    const stopResult = typeof this.cancelExecution === "function"
      ? await this.cancelExecution(normalizedJobId, job)
      : { requested: false, stopped: !this.running.has(normalizedJobId) };
    return {
      job: await this.get(normalizedJobId),
      cancelled: true,
      alreadyTerminal: false,
      executionStopped: stopResult?.stopped !== false
    };
  }
}
