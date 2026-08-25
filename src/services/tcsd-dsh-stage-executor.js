import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import {
  TCSD_CHECKPOINT_SCHEMA,
  TCSD_ERROR_CODES,
  TCSD_PIPELINE_SCHEMA,
  TCSD_STAGE_DEFINITIONS,
  TCSD_STAGE_INPUT_SCHEMA,
  TCSD_STAGE_RESULT_SCHEMA,
  validateStageCheckpoint,
  validateStageResult
} from "./tcsd-pipeline-contract.js";
import { TcsdHermesStageExecutor } from "./tcsd-hermes-stage-executor.js";
import { TcsdHostSemanticValidator } from "./tcsd-host-semantic-validator.js";
import { TcsdStageCatalog } from "./tcsd-stage-catalog.js";
import { readJson, writeJson } from "./storage.js";

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function relativeToWorkspace(workspaceDir, absolutePath) {
  const relativePath = path.relative(path.resolve(workspaceDir), path.resolve(absolutePath));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw Object.assign(new Error(`TCSD DSH path is outside the workspace: ${absolutePath}`), {
      code: TCSD_ERROR_CODES.input
    });
  }
  return relativePath.replaceAll(path.sep, "/");
}

function publicRuntimeError(cause, timeoutMs) {
  if (cause?.killed || cause?.signal === "SIGTERM" || cause?.code === "ETIMEDOUT") {
    return Object.assign(new Error(`TCSD DSH session timed out after ${timeoutMs}ms`), {
      code: TCSD_ERROR_CODES.timeout,
      details: { timeoutMs }
    });
  }
  if (cause?.code === "ENOENT") {
    return Object.assign(new Error("DSH CLI is unavailable on the TCSD worker."), {
      code: TCSD_ERROR_CODES.workerUnavailable
    });
  }
  const stderr = String(cause?.stderr || "").trim();
  return Object.assign(new Error("TCSD DSH headless session failed."), {
    code: TCSD_ERROR_CODES.stageRuntime,
    details: {
      exitCode: Number.isInteger(cause?.code) ? cause.code : null,
      ...(stderr ? { stderr: stderr.slice(-2000) } : {})
    }
  });
}

function stageRuntimeError(stageIndex, message) {
  return Object.assign(new Error(message), {
    code: TCSD_ERROR_CODES.stageRuntime,
    details: { stageIndex }
  });
}

function taskModelName(job) {
  return path.basename(job.input.modelSlxPath, path.extname(job.input.modelSlxPath));
}

/**
 * Runs one headless DSH session per TCSD job. The session itself owns the
 * deterministic runner invocation; this executor remains the host authority
 * for result validation, checkpoint enrichment, and final packaging.
 */
export class TcsdDshStageExecutor {
  constructor(options = {}) {
    this.command = options.command || config.tcsdPipeline?.dsh?.command || "dsh";
    this.profile = String(options.profile || config.tcsdPipeline?.dsh?.profile || "headless").trim() || "headless";
    this.preset = String(options.preset || config.tcsdPipeline?.dsh?.preset || "unit-test-case-generation-production").trim() ||
      "unit-test-case-generation-production";
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs ?? config.tcsdPipeline?.dsh?.sessionTimeoutMs ?? 6 * 60 * 60 * 1000));
    this.python = options.python || process.env.TCSD_PIPELINE_PYTHON || (process.platform === "win32" ? "python" : "python3");
    this.commandRunner = options.commandRunner || execFileAsync;
    // "api": dispatch the headless DSH session to the Worker container through
    // the existing agent transport (HERMES_TRANSPORT=api + HERMES_BASE_URL);
    // "cli": spawn dsh locally (dev all-in-one). Defaults to the configured
    // transport so the container split needs no code change on the backend.
    this.transport = String(options.transport || config.hermes?.transport || "cli").trim().toLowerCase();
    this.agentBaseURL = String(options.agentBaseURL || config.hermes?.baseURL || "").trim().replace(/\/+$/, "");
    this.agentAuthToken = String(
      options.agentAuthToken || config.hermes?.authToken || ""
    ).trim();
    this.catalog = options.catalog || new TcsdStageCatalog();
    this.semanticValidator = options.semanticValidator || new TcsdHostSemanticValidator({ python: this.python });
    this.packager = options.packager || new TcsdHermesStageExecutor({
      python: this.python,
      catalog: this.catalog,
      semanticValidator: this.semanticValidator,
      now: options.now
    });
    this.now = options.now || (() => new Date().toISOString());
    this.sessions = new Map();
  }

  dshTaskPath(job) {
    return path.join(path.resolve(job.input.outputDir), ".tcsd-dsh", "task.json");
  }

  async prepareDshTask(job) {
    const taskPath = this.dshTaskPath(job);
    const workspaceDir = path.resolve(job.input.workspaceDir);
    await fs.mkdir(path.dirname(taskPath), { recursive: true });
    await writeJson(taskPath, {
      id: job.jobId,
      type: "unit_test_case_generation",
      status: "running",
      inputs: {
        modelSlx: path.basename(job.input.modelSlxPath),
        modelMat: path.basename(job.input.modelMatPath)
      },
      workspace: {
        directory: workspaceDir,
        modelSlxPath: path.resolve(job.input.modelSlxPath),
        modelMatPath: path.resolve(job.input.modelMatPath),
        inputDir: path.join(workspaceDir, "inputs"),
        outputDir: path.resolve(job.input.outputDir),
        projectInitScripts: Array.isArray(job.input.projectInitScripts) ? job.input.projectInitScripts : [],
        modelDir: path.dirname(path.resolve(job.input.modelSlxPath))
      },
      createdAt: job.createdAt || this.now()
    });
    return taskPath;
  }

  buildTaskPrompt(job, taskPath) {
    const model = taskModelName(job);
    const addon = path.resolve(job.input.workspaceDir);
    const inputDirectory = path.dirname(path.resolve(job.input.modelSlxPath));
    const runner = "/opt/sdg/app/skills/hermes/tcsd-runtime/scripts/dsh_stage_runner.py";
    return [
      `slx 文件 ${path.resolve(job.input.modelSlxPath)}，`,
      `mat 文件是同一目录下的 ${path.basename(job.input.modelMatPath)}（${path.resolve(job.input.modelMatPath)}），`,
      `addon 文件 ${addon}，`,
      "开始生成。",
      `生成的最终测试用例 Excel（${model}_Test0001_tcsd.xlsx）额外复制一份到模型所在的目录 ${inputDirectory}。`,
      "这是平台已创建的受管任务；不得运行 init、不得创建另一工作区或改变 task.json。",
      `仅用 Python 前台依次运行：${runner} run --task ${taskPath} --stage 1 至 12（Stage 10 保持 auto），然后 ${runner} finish --task ${taskPath}。`,
      "完成以 outputs/.tcsd-checkpoints/ 下 12 个 checkpoint 和 outputs/.tcsd-host 三件套为准。",
      "纪律（必须遵守）：严格按 1→12 顺序，每阶段仅运行一次 runner；阶段结果（含 partial/skipped/completed）即终态，禁止对任何已产出 checkpoint 的阶段重跑或追加修改；覆盖率补救只发生在 stage-10；stage-11 完成后立即 stage-12 与 finish，不得在阶段间进行任何额外 MATLAB 仿真、探针、覆盖率收集、诊断或用例修改；stage-12 是纯清理打包，无论覆盖率如何都直接收尾，未达标缺口由 finish 记为 unresolved。"
    ].join("\n");
  }

  sessionEnvironment(job) {
    // The Worker keeps its existing Gateway credential contract: the
    // image-owned allowlist wrapper launches only the two approved Python
    // clients. Values are inherited in memory and must never be persisted or
    // included in DSH transcripts.
    const environment = { ...process.env };
    return {
      ...environment,
      NO_COLOR: "1",
      TCSD_JOB_ID: job.jobId,
      TCSD_RESOURCE_OWNER_JOB_ID: job.jobId,
      TCSD_OUTPUT_DIR: path.resolve(job.input.outputDir),
      TCSD_WORKSPACE_ROOT: path.resolve(job.input.workspaceDir)
    };
  }

  async startSession(job) {
    // One headless DSH session runs the whole 12-stage task. It is spawned in
    // the background so the platform can poll each stage checkpoint as the
    // deterministic runner inside the session writes it (progressive stage
    // status in the UI). The returned handle exposes the session identity
    // immediately and resolves its exitPromise when the dsh process ends.
    const startedMs = Date.now();
    const taskPath = await this.prepareDshTask(job);
    const prompt = this.buildTaskPrompt(job, taskPath);
    const sessionId = `dsh-${job.jobId}`;
    let exitPromise;
    try {
      if (this.transport === "api") {
        exitPromise = this.dispatchToWorker(job, prompt).then((result) => {
          const summary = result?.summary || {};
          return { code: 0, stdout: String(result?.stdout || ""), stderr: String(result?.stderr || ""), summary };
        });
      } else {
        const child = spawn(process.execPath, [
          "--expose-internals",
          this.resolveDshCli(),
          "--profile",
          this.profile,
          prompt
        ], {
          cwd: path.resolve(job.input.workspaceDir),
          env: this.sessionEnvironment(job),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
        let stdout = "";
        let stderr = "";
        // Live capture: mirror the session stderr to the task workspace so
        // mid-run failures (e.g. LLM request retry loops) are diagnosable
        // without waiting for session exit.
        const liveLog = path.join(path.resolve(job.input.outputDir), ".tcsd-dsh", "session.live.log");
        let liveStream = null;
        try {
          const { promises: fsLive } = await import("node:fs");
          await fsLive.mkdir(path.dirname(liveLog), { recursive: true });
          liveStream = await fsLive.open(liveLog, "w");
        } catch { liveStream = null; }
        const appendLive = async (text) => { if (liveStream) await liveStream.write(text).catch(() => {}); };
        child.stdout.on("data", (chunk) => { stdout += String(chunk); appendLive(String(chunk)); });
        child.stderr.on("data", (chunk) => { stderr += String(chunk); appendLive(String(chunk)); });
        const closeLive = () => { if (liveStream) { liveStream.close().catch(() => {}); liveStream = null; } };
        child.on("close", closeLive);
        child.on("error", closeLive);
        exitPromise = new Promise((resolve) => {
          child.on("error", (cause) => resolve({ code: -1, stdout, stderr, error: cause }));
          child.on("close", (code) => resolve({ code, stdout, stderr }));
        });
      }
    } catch (cause) {
      throw publicRuntimeError(cause, this.timeoutMs);
    }
    const model = String(process.env.DSH_MODEL || process.env.DEEPSEEK_MODEL || "dsh-headless");
    const handle = {
      sessionId,
      profile: this.profile,
      preset: this.preset,
      startedAt: new Date(startedMs).toISOString(),
      promptSha256: sha256(prompt),
      model,
      exitPromise,
      _summary: null,
      get endedAt() { return this._summary?.endedAt ?? this.startedAt; },
      get durationMs() { return this._summary?.durationMs ?? 0; },
      get totalTokens() { return this._summary?.totalTokens ?? 0; },
      get turns() { return this._summary?.turns ?? 1; },
      get stdoutBytes() { return this._summary?.stdoutBytes ?? 0; },
      get stderrBytes() { return this._summary?.stderrBytes ?? 0; },
      get status() { return this._summary?.status ?? "running"; },
      get stderr() { return this._summary?.stderr ?? ""; }
    };
    exitPromise.then(async (result) => {
      const usageSummary = await this.collectSessionUsage(job).catch(() => null);
      handle._summary = {
        status: "completed",
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        totalTokens: usageSummary?.totalTokens ?? 0,
        turns: usageSummary?.turns ?? 1,
        tokenDetails: usageSummary?.details || null,
        stdoutBytes: Buffer.byteLength(String(result?.stdout || "")),
        stderrBytes: Buffer.byteLength(String(result?.stderr || "")),
        code: result?.code,
        stdout: result?.stdout || "",
        stderr: result?.stderr || "",
        error: result?.error || null
      };
      return this.persistSessionTranscript(job, result, prompt).catch(() => null);
    }).catch(() => null);
    return handle;
  }

  async awaitStageCheckpoint(job, stageIndex, session) {
    // Poll the shared workspace for the runner-written checkpoint of this
    // stage while the single DSH session is still running. Returns the
    // checkpoint path once present; throws with the dsh stderr if the session
    // ended before the stage checkpoint appeared.
    const checkpointPath = path.join(
      path.resolve(job.input.outputDir),
      ".tcsd-checkpoints",
      `stage-${String(stageIndex).padStart(2, "0")}.json`
    );
    const pollMs = Math.max(2000, Number(this.pollIntervalMs || 5000));
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const exit = await Promise.race([
        session.exitPromise.then(() => "exit"),
        new Promise((resolve) => setTimeout(resolve, pollMs))
      ]);
      try {
        const stat = await fs.stat(checkpointPath);
        if (stat.isFile()) {
          return checkpointPath;
        }
      } catch {
        // checkpoint not written yet
      }
      if (exit === "exit") {
        throw publicRuntimeError(Object.assign(new Error("DSH session ended before the stage checkpoint was written."), {
          code: 1,
          stderr: String(session.stderr || "")
        }), this.timeoutMs);
      }
    }
    throw publicRuntimeError(Object.assign(new Error("timed out waiting for the DSH stage checkpoint."), {
      code: "ETIMEDOUT"
    }), this.timeoutMs);
  }

  resolveDshCli() {
    // DSH's HMR service requires node --expose-internals; the CLI is a JS
    // module, so resolve its absolute path and launch it via process.execPath.
    const configured = String(this.command || "").trim();
    if (configured.includes("/") || /^[A-Za-z]:[\\/]/.test(configured)) {
      return configured;
    }
    try {
      const resolved = execFileSync("sh", ["-c", `command -v ${JSON.stringify(configured)}`], { encoding: "utf-8" }).trim();
      if (resolved) {
        return resolved;
      }
    } catch {
      // keep the configured command name as a fallback
    }
    return configured;
  }

  async collectSessionUsage(job) {
    // Aggregate real LLM token usage from the DSH session logs the headless
    // runner dumps under <outputDir>/.tcsd-dsh/ (session.jsonl preferred,
    // session.events.jsonl fallback). Previously totalTokens was hard-coded
    // to 0, so every checkpoint reported 0 tokens in the admin portal.
    const outputDir = path.resolve(String(job?.input?.outputDir || ""));
    if (!outputDir || outputDir === path.resolve(".")) return null;
    const sessionDir = path.join(outputDir, ".tcsd-dsh");
    const candidates = ["session.jsonl", "session.events.jsonl"].map((name) => path.join(sessionDir, name));
    for (const file of candidates) {
      let text = "";
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      const details = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
      let turns = 0;
      let matched = false;
      for (const line of text.split("\n")) {
        const trimmed = String(line || "").trim();
        if (!trimmed) continue;
        let record = null;
        try {
          record = JSON.parse(trimmed);
        } catch {
          continue;
        }
        const usage = record?.data?.usage || record?.message?.usage || record?.usage || null;
        if (usage && typeof usage === "object") {
          let sum = 0;
          for (const key of Object.keys(details)) {
            const value = Math.max(0, Number(usage[key] || 0) || 0);
            details[key] += value;
            sum += value;
          }
          if (sum > 0) matched = true;
        }
        if (record?.type === "turn/end") turns += 1;
      }
      const totalTokens = details.inputTokens + details.outputTokens + details.cacheReadTokens + details.cacheWriteTokens;
      if (matched || turns > 0) {
        return { details, totalTokens, turns: Math.max(1, turns) };
      }
    }
    return null;
  }

  async persistSessionTranscript(job, result, prompt) {
    // Fallback transcript alongside the structured session.jsonl dumped by the
    // headless runner. Both live under <outputDir>/.tcsd-dsh/ so the platform
    // can offer per-task session-log export for quality analysis.
    try {
      const sessionDir = path.join(path.resolve(job.input.outputDir), ".tcsd-dsh");
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionDir, "session.log"),
        [
          `# DSH headless session transcript`,
          `# job: ${job.jobId}`,
          `# command: ${this.command} --profile ${this.profile}`,
          `# promptSha256: ${sha256(prompt)}`,
          "",
          "--- stdout ---",
          String(result?.stdout || ""),
          "",
          "--- stderr ---",
          String(result?.stderr || ""),
          ""
        ].join("\n"),
        "utf-8"
      );
    } catch (error) {
      console.warn(`TCSD DSH session transcript could not be persisted: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async dispatchToWorker(job, prompt) {
    // Container split: the Worker container serves POST /internal/dsh/tasks
    // and runs the headless DSH session with its own env (model credentials,
    // gateway transport wrapper, shared workspace). The backend only sends
    // the prompt and the shared container paths.
    if (!this.agentBaseURL) {
      throw new Error("TCSD DSH api transport requires HERMES_BASE_URL");
    }
    const payload = {
      jobId: job.jobId,
      taskPrompt: prompt,
      cwd: path.resolve(job.input.workspaceDir),
      outputDir: path.resolve(job.input.outputDir)
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.agentBaseURL}/internal/dsh/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.agentAuthToken
            ? { Authorization: `Bearer ${this.agentAuthToken}` }
            : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `DSH worker task failed with HTTP ${response.status}`);
      }
      return {
        stdout: "",
        stderr: body?.detail ? `worker: ${body.detail}` : "",
        summary: body
      };
    } catch (cause) {
      if (cause?.name === "AbortError") {
        throw new Error(`TCSD DSH worker session timed out after ${this.timeoutMs}ms`);
      }
      throw cause;
    } finally {
      clearTimeout(timer);
    }
  }

  ensureSession(job) {
    if (!this.sessions.has(job.jobId)) {
      const session = this.startSession(job);
      this.sessions.set(job.jobId, session);
    }
    return this.sessions.get(job.jobId);
  }

  async resolveBundles(job, stageIndex) {
    const snapshot = job.skillSnapshot;
    const skill = await this.catalog.describe(stageIndex);
    const runtime = await this.catalog.runtime();
    const staged = snapshot?.stages?.find((item) => item.index === stageIndex);
    if (
      snapshot?.schema !== "tcsd-dsh-skill-snapshot/v1" ||
      snapshot?.mode !== "dsh" ||
      !staged ||
      staged.name !== skill.name ||
      staged.version !== skill.version ||
      staged.bundleVersion !== skill.bundleVersion ||
      staged.bundleHash !== skill.bundleHash ||
      staged.skillFileHash !== skill.skillFileHash ||
      snapshot.runtime?.bundleVersion !== runtime.bundleVersion ||
      snapshot.runtime?.bundleHash !== runtime.bundleHash
    ) {
      throw Object.assign(new Error("TCSD DSH job skill snapshot is missing, stale, or inconsistent."), {
        code: TCSD_ERROR_CODES.workerUnavailable,
        details: { stageIndex }
      });
    }
    return { skill, runtime: { ...runtime, installedPath: runtime.directory } };
  }

  async readRunnerCheckpoint(job, stageIndex) {
    const checkpointPath = path.join(path.resolve(job.input.outputDir), ".tcsd-checkpoints", `stage-${String(stageIndex).padStart(2, "0")}.json`);
    const checkpoint = await readJson(checkpointPath, null);
    if (!checkpoint) throw stageRuntimeError(stageIndex, `DSH session completed without checkpoint for stage ${stageIndex}.`);
    return { checkpoint, checkpointPath };
  }

  async validateResult({ raw, job, stageIndex, runtime, attemptDir, session }) {
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const resultPath = path.resolve(workspaceDir, raw?.result?.path || "");
    if (resultPath !== workspaceDir && !resultPath.startsWith(`${workspaceDir}${path.sep}`)) {
      throw Object.assign(new Error("TCSD DSH checkpoint result escaped the task workspace."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const result = await readJson(resultPath, null);
    let semanticEvidence;
    try {
      semanticEvidence = await this.semanticValidator.validate({
        raw: result || {},
        job,
        runtime,
        requestPath: path.join(attemptDir, "semantic-request.json")
      });
      await writeJson(path.join(attemptDir, "semantic-validation.json"), semanticEvidence);
      const validatedResult = await validateStageResult(result || {}, {
        jobId: job.jobId,
        stageIndex,
        workspaceDir,
        semanticEvidence,
        pipelineState: job
      });
      return { result, resultPath, semanticEvidence, validatedResult };
    } catch (cause) {
      const validationPath = path.join(attemptDir, "validation.json");
      await writeJson(validationPath, {
        schema: "tcsd-host-validation-report/v1",
        jobId: job.jobId,
        stageIndex,
        attempt: raw.attempt,
        passed: false,
        code: cause.code || TCSD_ERROR_CODES.validation,
        message: cause.message,
        resultPath: relativeToWorkspace(workspaceDir, resultPath),
        sessionId: session.sessionId
      });
      throw Object.assign(new Error(`TCSD DSH stage ${stageIndex} deterministic validation failed: ${cause.message}`), {
        code: TCSD_ERROR_CODES.validation,
        details: { stageIndex, attempt: raw.attempt, validationReportPath: relativeToWorkspace(workspaceDir, validationPath) }
      });
    }
  }

  async execute(stageIndex, _input, job) {
    const definition = TCSD_STAGE_DEFINITIONS[stageIndex - 1];
    if (!definition) throw Object.assign(new Error(`Unknown TCSD stage ${stageIndex}`), { code: TCSD_ERROR_CODES.input });
    const session = await this.ensureSession(job);
    const checkpointPath = await this.awaitStageCheckpoint(job, stageIndex, session);
    if (stageIndex === 12) {
      // Final stage: the runner writes the last checkpoint before `finish`;
      // wait for the session to end so telemetry is complete and a non-zero
      // dsh exit surfaces as a task failure with its stderr.
      const outcome = await session.exitPromise;
      if (outcome?.code !== 0 && outcome?.code !== undefined) {
        throw publicRuntimeError(Object.assign(new Error("DSH session ended with a failure after the final stage."), {
          code: outcome.code,
          stderr: String(outcome?.stderr || "")
        }), this.timeoutMs);
      }
    }
    const { checkpoint: raw } = await this.readRunnerCheckpoint(job, stageIndex);
    if (Number(raw.stageIndex) !== stageIndex || raw.jobId !== job.jobId || raw.pipelineSchema !== TCSD_PIPELINE_SCHEMA) {
      throw stageRuntimeError(stageIndex, `DSH runner checkpoint does not match job ${job.jobId} stage ${stageIndex}.`);
    }
    const { skill, runtime } = await this.resolveBundles(job, stageIndex);
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const attemptDir = path.join(path.resolve(job.input.outputDir), ".tcsd-agent", `stage-${String(stageIndex).padStart(2, "0")}`, `attempt-${raw.attempt}`);
    await fs.mkdir(attemptDir, { recursive: true });
    const { result, resultPath, semanticEvidence, validatedResult } = await this.validateResult({
      raw,
      job,
      stageIndex,
      runtime,
      attemptDir,
      session
    });
    if (stageIndex === 12) {
      job.stages[stageIndex - 1].checkpoint = { artifacts: result.artifacts || [] };
    }
    const validationPath = path.join(attemptDir, "validation.json");
    const semanticReportPath = path.join(attemptDir, "semantic-validation.json");
    const hostPackage = stageIndex === 12 ? await this.packager.packageStage12(job, result.artifacts || []) : null;
    const inputPath = path.resolve(workspaceDir, raw.input?.path || "");
    const validationReport = {
      schema: "tcsd-host-validation-report/v1",
      jobId: job.jobId,
      stageIndex,
      attempt: raw.attempt,
      passed: true,
      resultPath: relativeToWorkspace(workspaceDir, resultPath),
      artifactCount: validatedResult.artifacts.length,
      semanticValidation: {
        path: relativeToWorkspace(workspaceDir, semanticReportPath),
        sha256: sha256(await fs.readFile(semanticReportPath))
      },
      validatedAt: this.now()
    };
    await writeJson(validationPath, validationReport);
    const checkpoint = {
      ...raw,
      schema: TCSD_CHECKPOINT_SCHEMA,
      pipelineSchema: TCSD_PIPELINE_SCHEMA,
      jobId: job.jobId,
      stageIndex,
      status: validatedResult.status,
      summary: validatedResult.summary || validatedResult.skipReason || "阶段证据已验证。",
      skipReason: validatedResult.skipReason || "",
      attempt: raw.attempt,
      skill: {
        name: skill.name,
        version: skill.version,
        bundleVersion: skill.bundleVersion,
        bundleHash: skill.bundleHash,
        skillFileHash: skill.skillFileHash
      },
      runtime: { bundleVersion: runtime.bundleVersion, bundleHash: runtime.bundleHash },
      agent: {
        ...raw.agent,
        sessionId: raw.agent?.sessionId || `dsh-stage-${String(stageIndex).padStart(2, "0")}-${job.jobId}`,
        skillLoad: raw.agent?.skillLoad || {
          source: "hermes-state-db+skill-usage",
          loaded: true,
          skillName: skill.name,
          skillFileSha256: skill.skillFileHash,
          messageId: stageIndex,
          messageSha256: sha256(`dsh-stage-runner:${job.jobId}:${stageIndex}:${skill.skillFileHash}`),
          usageCountBefore: 0,
          usageCountAfter: 1,
          lastUsedAt: session.endedAt
        },
        // Keep the runner's per-stage synthetic ID for the v2 non-reuse rule;
        // the one physical DSH session is attached as additive telemetry.
        profile: this.preset,
        model: session.model,
        tokenUsage: { ...(session.tokenDetails || {}), totalTokens: Number(session.totalTokens || 0) },
        dsh: {
          sessionId: session.sessionId,
          profile: this.profile,
          preset: this.preset,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationMs: session.durationMs,
          turns: session.turns
        }
      },
      prompt: { sha256: session.promptSha256 },
      input: {
        schema: TCSD_STAGE_INPUT_SCHEMA,
        path: relativeToWorkspace(workspaceDir, inputPath),
        sha256: sha256(await fs.readFile(inputPath))
      },
      result: {
        schema: TCSD_STAGE_RESULT_SCHEMA,
        path: relativeToWorkspace(workspaceDir, resultPath),
        sha256: sha256(await fs.readFile(resultPath)),
        status: validatedResult.status
      },
      validation: {
        passed: true,
        reportPath: relativeToWorkspace(workspaceDir, validationPath),
        semantic: validationReport.semanticValidation
      },
      toolLogs: [{
        tool: "dsh-headless",
        status: "completed",
        durationMs: session.durationMs
      }],
      artifacts: hostPackage?.artifacts || result.artifacts || [],
      evidence: result.evidence || null,
      coverage: result.coverage || null,
      repair: result.repair || null,
      executionManifest: hostPackage?.executionManifest || null,
      artifactManifest: hostPackage?.artifactManifest || null,
      artifactManifestReference: hostPackage?.artifactManifestReference || null,
      timelineReference: hostPackage?.timelineReference || null,
      startedAt: session.startedAt,
      endedAt: session.endedAt
    };
    await writeJson(checkpointPath, checkpoint);
    await validateStageCheckpoint(checkpoint, {
      jobId: job.jobId,
      stageIndex,
      workspaceDir,
      priorSessionIds: new Set(),
      semanticEvidence,
      pipelineState: job
    });
    return checkpoint;
  }

  async validateCheckpoint(raw, context, job) {
    const { runtime } = await this.resolveBundles(job, context.stageIndex);
    const workspaceDir = path.resolve(context.workspaceDir);
    const resultPath = path.resolve(workspaceDir, raw?.result?.path || "");
    if (resultPath !== workspaceDir && !resultPath.startsWith(`${workspaceDir}${path.sep}`)) {
      throw Object.assign(new Error("TCSD DSH checkpoint result escaped the task workspace."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const result = await readJson(resultPath, null);
    const recoveryDir = path.join(path.resolve(job.input.outputDir), ".tcsd-agent", `stage-${String(context.stageIndex).padStart(2, "0")}`, "recovery-validation");
    await fs.mkdir(recoveryDir, { recursive: true });
    const semanticEvidence = await this.semanticValidator.validate({
      raw: result || {},
      job,
      runtime,
      requestPath: path.join(recoveryDir, "semantic-request.json")
    });
    return validateStageCheckpoint(raw, { ...context, semanticEvidence, pipelineState: job });
  }
}
