import { execFile } from "node:child_process";
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
import { TcsdStageCatalog } from "./tcsd-stage-catalog.js";
import { readJson, writeJson } from "./storage.js";

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function relativeToWorkspace(workspaceDir, absolutePath) {
  const relativePath = path.relative(path.resolve(workspaceDir), path.resolve(absolutePath));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw Object.assign(new Error(`TCSD stage path is outside the workspace: ${absolutePath}`), {
      code: TCSD_ERROR_CODES.input
    });
  }
  return relativePath.replaceAll(path.sep, "/");
}

function parseSessionId(output = "") {
  const matches = String(output || "").replaceAll("\r", "").matchAll(/(?:^|\n)session_id:\s*(.+?)\s*$/gi);
  let sessionId = "";
  for (const match of matches) sessionId = match[1].trim();
  return sessionId;
}

function profileArgs(profile, rawArgs) {
  return !profile || profile === "default" ? rawArgs : ["-p", profile, ...rawArgs];
}

function publicRuntimeError(cause, stageIndex, timeoutMs) {
  if (cause?.killed || cause?.signal === "SIGTERM" || cause?.code === "ETIMEDOUT") {
    return Object.assign(new Error(`TCSD stage ${stageIndex} Hermes session timed out after ${timeoutMs}ms`), {
      code: TCSD_ERROR_CODES.timeout,
      details: { stageIndex, timeoutMs }
    });
  }
  if (cause?.code === "ENOENT") {
    return Object.assign(new Error("Hermes CLI is unavailable on the TCSD worker."), {
      code: TCSD_ERROR_CODES.workerUnavailable,
      details: { stageIndex }
    });
  }
  return Object.assign(new Error(`TCSD stage ${stageIndex} Hermes session failed.`), {
    code: TCSD_ERROR_CODES.stageRuntime,
    details: { stageIndex, exitCode: Number.isInteger(cause?.code) ? cause.code : null }
  });
}

function defaultStateDbPath(profile) {
  if (process.env.TCSD_STAGE_HERMES_STATE_DB_PATH) return process.env.TCSD_STAGE_HERMES_STATE_DB_PATH;
  if (!profile || profile === "default" || profile === config.hermes.profile) return config.hermes.stateDbPath;
  return path.join(config.hermes.homeDir, "profiles", profile, "state.db");
}

export class TcsdHermesStageExecutor {
  constructor(options = {}) {
    this.command = options.command || config.hermes.command || "hermes";
    this.python = options.python || process.env.TCSD_PIPELINE_PYTHON || (process.platform === "win32" ? "python" : "python3");
    this.profile = String(options.profile ?? config.tcsdPipeline.hermesProfile ?? config.hermes.profile ?? "").trim() || "default";
    this.maxTurns = Math.max(1, Number(options.maxTurns ?? config.tcsdPipeline.stageMaxTurns ?? 200) || 200);
    this.timeoutMs = Math.max(
      1000,
      Number(options.timeoutMs ?? config.tcsdPipeline.stageTimeoutMs ?? 60 * 60 * 1000) || 60 * 60 * 1000
    );
    this.stateDbPath = options.stateDbPath || defaultStateDbPath(this.profile);
    this.commandRunner = options.commandRunner || execFileAsync;
    this.catalog = options.catalog || new TcsdStageCatalog();
    this.usageReader = options.usageReader || ((sessionId, runtime) => this.readSessionUsage(sessionId, runtime));
    this.now = options.now || (() => new Date().toISOString());
  }

  async readSessionUsage(sessionId, runtime) {
    const script = path.join(runtime.directory, "scripts", "read_hermes_session.py");
    const { stdout = "" } = await this.commandRunner(
      this.python,
      [script, "--state-db", this.stateDbPath, "--session-id", sessionId],
      {
        cwd: runtime.directory,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" }
      }
    );
    const usage = JSON.parse(String(stdout || "").trim());
    if (!usage.model || !Number.isFinite(Number(usage.totalTokens))) throw new Error("Hermes session telemetry is incomplete");
    return usage;
  }

  collectPriorSessionIds(job) {
    const sessionIds = new Set();
    for (const stage of Array.isArray(job.stages) ? job.stages : []) {
      if (stage.checkpoint?.agent?.sessionId) sessionIds.add(stage.checkpoint.agent.sessionId);
      for (const attempt of Array.isArray(stage.attempts) ? stage.attempts : []) {
        if (attempt?.sessionId) sessionIds.add(attempt.sessionId);
      }
    }
    return sessionIds;
  }

  buildPrompt({ definition, skill, runtime, manifestPath, resultPath, validationReportPath, attempt }) {
    const repairLines = validationReportPath
      ? [
          `This is validation repair attempt ${attempt}.`,
          `Read the host validation report at: ${validationReportPath}`,
          "Repair only the reported deterministic validation defects, then rerun the same stage in this new session."
        ]
      : ["This is the initial stage attempt. No earlier session context is available."];
    const runtimeCommand = [
      this.python,
      `"${path.join(runtime.directory, "scripts", "run_tcsd_pipeline_stage.py")}"`,
      "--manifest",
      `"${manifestPath}"`,
      "--result",
      `"${resultPath}"`
    ].join(" ");
    return [
      "You are executing the generic Hermes step `tcsd_stage_execute`.",
      `Use $${definition.skillName} and no other TCSD stage skill.`,
      `Execute only stage ${definition.index}: ${definition.name}.`,
      `Read the authoritative input manifest: ${manifestPath}`,
      ...repairLines,
      "Invoke this exact shared deterministic runtime command:",
      runtimeCommand,
      `The required candidate result path is: ${resultPath}`,
      `The required result schema is ${TCSD_STAGE_RESULT_SCHEMA}.`,
      "Do not write a host checkpoint. Do not expose hidden reasoning or secrets.",
      "Your text response is non-authoritative; the host will accept the stage only after independently validating the result file and artifacts."
    ].join("\n");
  }

  async execute(stageIndex, _input, job, options = {}) {
    const definition = TCSD_STAGE_DEFINITIONS[stageIndex - 1];
    if (!definition) throw Object.assign(new Error(`Unknown TCSD stage ${stageIndex}`), { code: TCSD_ERROR_CODES.input });
    const attempt = Number(options.attempt || job.stages?.[stageIndex - 1]?.attempt || 1);
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const outputDir = path.resolve(job.input.outputDir);
    const skill = await this.catalog.describe(stageIndex);
    const runtime = await this.catalog.runtime();
    const attemptDir = path.join(outputDir, ".tcsd-agent", `stage-${String(stageIndex).padStart(2, "0")}`, `attempt-${attempt}`);
    const manifestPath = path.join(attemptDir, "input.json");
    const resultPath = path.join(attemptDir, "result.json");
    const validationPath = path.join(attemptDir, "validation.json");
    await fs.mkdir(attemptDir, { recursive: true });
    await fs.unlink(resultPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    const validationReportPath = options.validationReportPath
      ? path.resolve(workspaceDir, options.validationReportPath)
      : "";
    const manifest = {
      schema: TCSD_STAGE_INPUT_SCHEMA,
      pipelineSchema: TCSD_PIPELINE_SCHEMA,
      jobId: job.jobId,
      taskId: job.taskId,
      stageIndex,
      stageName: definition.name,
      attempt,
      skill: {
        name: skill.name,
        version: skill.version,
        bundleVersion: skill.bundleVersion,
        bundleHash: skill.bundleHash
      },
      runtime: {
        bundleVersion: runtime.bundleVersion,
        bundleHash: runtime.bundleHash
      },
      validationRepair: validationReportPath
        ? { reportPath: relativeToWorkspace(workspaceDir, validationReportPath) }
        : null,
      job: {
        jobId: job.jobId,
        taskId: job.taskId,
        events: Array.isArray(job.events) ? job.events : [],
        resources: job.resources || {},
        input: job.input
      }
    };
    await writeJson(manifestPath, manifest);
    const prompt = this.buildPrompt({
      definition,
      skill,
      runtime,
      manifestPath,
      resultPath,
      validationReportPath,
      attempt
    });
    const rawArgs = ["chat", "-q", prompt, "-Q", "--source", "tool", "--max-turns", String(this.maxTurns), "--yolo"];
    const args = profileArgs(this.profile, rawArgs);
    const startedAt = Date.now();
    let commandResult;
    try {
      commandResult = await this.commandRunner(this.command, args, {
        cwd: workspaceDir,
        env: {
          ...process.env,
          NO_COLOR: "1",
          TCSD_JOB_ID: job.jobId,
          TCSD_RESOURCE_OWNER_JOB_ID: job.jobId,
          SATK_MATLAB_ROOT: process.env.SATK_MATLAB_ROOT || process.env.MATLAB_ROOT || ""
        },
        timeout: this.timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true
      });
    } catch (cause) {
      throw publicRuntimeError(cause, stageIndex, this.timeoutMs);
    }
    const stdout = String(commandResult?.stdout || "");
    const stderr = String(commandResult?.stderr || "");
    const sessionId = parseSessionId(`${stdout}\n${stderr}`);
    if (!sessionId) {
      throw Object.assign(new Error("Hermes stage session did not report a session_id."), {
        code: TCSD_ERROR_CODES.telemetry,
        details: { stageIndex, attempt }
      });
    }
    const priorSessionIds = this.collectPriorSessionIds(job);
    if (priorSessionIds.has(sessionId)) {
      throw Object.assign(new Error("Hermes reused a prior TCSD stage session."), {
        code: TCSD_ERROR_CODES.sessionReuse,
        details: { stageIndex, attempt, sessionId }
      });
    }
    let tokenUsage;
    try {
      tokenUsage = await this.usageReader(sessionId, runtime);
    } catch (cause) {
      throw Object.assign(new Error(`Hermes stage telemetry is unavailable: ${cause.message}`), {
        code: TCSD_ERROR_CODES.telemetry,
        details: { stageIndex, attempt, sessionId }
      });
    }
    let result = null;
    let resultReadError = null;
    try {
      result = await readJson(resultPath, null);
    } catch (cause) {
      resultReadError = cause;
    }
    if (result?.status === "failed") {
      throw Object.assign(new Error(result.error?.message || result.summary || "TCSD deterministic runtime failed."), {
        code: result.error?.code || TCSD_ERROR_CODES.stageRuntime,
        details: { stageIndex, attempt, sessionId, hard: result.error?.hard !== false }
      });
    }
    let validatedResult;
    try {
      if (resultReadError) {
        throw new Error(`stage result is not valid JSON: ${resultReadError.message}`);
      }
      validatedResult = await validateStageResult(result || {}, { jobId: job.jobId, stageIndex, workspaceDir });
    } catch (cause) {
      const report = {
        schema: "tcsd-host-validation-report/v1",
        jobId: job.jobId,
        stageIndex,
        attempt,
        passed: false,
        code: cause.code || TCSD_ERROR_CODES.validation,
        message: cause.message,
        resultPath: relativeToWorkspace(workspaceDir, resultPath),
        sessionId
      };
      await writeJson(validationPath, report);
      throw Object.assign(new Error(`TCSD stage ${stageIndex} deterministic validation failed: ${cause.message}`), {
        code: TCSD_ERROR_CODES.validation,
        details: {
          stageIndex,
          attempt,
          sessionId,
          profile: this.profile,
          model: tokenUsage.model,
          tokenUsage,
          skill: manifest.skill,
          validationReportPath: relativeToWorkspace(workspaceDir, validationPath)
        }
      });
    }
    const validationReport = {
      schema: "tcsd-host-validation-report/v1",
      jobId: job.jobId,
      stageIndex,
      attempt,
      passed: true,
      resultPath: relativeToWorkspace(workspaceDir, resultPath),
      artifactCount: validatedResult.artifacts.length,
      validatedAt: this.now()
    };
    await writeJson(validationPath, validationReport);
    const inputSha256 = sha256(await fs.readFile(manifestPath));
    const resultSha256 = sha256(await fs.readFile(resultPath));
    const checkpoint = {
      schema: TCSD_CHECKPOINT_SCHEMA,
      pipelineSchema: TCSD_PIPELINE_SCHEMA,
      jobId: job.jobId,
      stageIndex,
      status: validatedResult.status,
      summary: validatedResult.summary || validatedResult.skipReason || "阶段证据已验证。",
      skipReason: validatedResult.skipReason || "",
      attempt,
      skill: manifest.skill,
      runtime: manifest.runtime,
      agent: {
        sessionId,
        profile: this.profile,
        model: tokenUsage.model,
        tokenUsage,
        maxTurns: this.maxTurns,
        timeoutMs: this.timeoutMs
      },
      prompt: { sha256: sha256(prompt) },
      input: {
        schema: TCSD_STAGE_INPUT_SCHEMA,
        path: relativeToWorkspace(workspaceDir, manifestPath),
        sha256: inputSha256
      },
      result: {
        schema: TCSD_STAGE_RESULT_SCHEMA,
        path: relativeToWorkspace(workspaceDir, resultPath),
        sha256: resultSha256,
        status: validatedResult.status
      },
      validation: {
        passed: true,
        reportPath: relativeToWorkspace(workspaceDir, validationPath)
      },
      toolLogs: [{
        tool: "hermes-cli",
        status: "completed",
        durationMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr)
      }],
      artifacts: result.artifacts || [],
      evidence: result.evidence || null,
      coverage: result.coverage || null,
      repair: result.repair || null,
      executionManifest: result.executionManifest || null,
      artifactManifest: result.artifactManifest || null,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: this.now()
    };
    const checkpointPath = path.join(outputDir, ".tcsd-checkpoints", `stage-${String(stageIndex).padStart(2, "0")}.json`);
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
    await writeJson(checkpointPath, checkpoint);
    await validateStageCheckpoint(checkpoint, { jobId: job.jobId, stageIndex, workspaceDir, priorSessionIds });
    return checkpoint;
  }
}
