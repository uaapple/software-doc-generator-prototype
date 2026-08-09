import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import {
  TCSD_CHECKPOINT_SCHEMA,
  TCSD_ERROR_CODES,
  TCSD_PIPELINE_SCHEMA,
  TCSD_STAGE_DEFINITIONS,
  TCSD_STAGE_INPUT_SCHEMA,
  TCSD_STAGE_RESULT_SCHEMA,
  coverageCompletion,
  validateStageCheckpoint,
  validateStageResult
} from "./tcsd-pipeline-contract.js";
import { createHermesSpawnRunner, runHermesCommand } from "./hermes-command.js";
import {
  formatPythonCommand,
  resolvePythonInvocation,
  runPythonCommand
} from "./python-command.js";
import { TcsdHostSemanticValidator } from "./tcsd-host-semantic-validator.js";
import { hashTcsdBundle, TcsdStageCatalog } from "./tcsd-stage-catalog.js";
import { readJson, writeJson } from "./storage.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function activityFingerprint(paths = []) {
  let latestMtimeMs = 0;
  let fileCount = 0;
  let totalBytes = 0;
  async function visit(targetPath) {
    let stat;
    try {
      stat = await fs.lstat(targetPath);
    } catch (cause) {
      if (cause?.code === "ENOENT") return;
      throw cause;
    }
    latestMtimeMs = Math.max(latestMtimeMs, stat.mtimeMs || 0);
    if (stat.isFile()) {
      fileCount += 1;
      totalBytes += stat.size;
      return;
    }
    if (!stat.isDirectory()) return;
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      await visit(path.join(targetPath, entry.name));
    }
  }
  for (const targetPath of [...new Set(paths.filter(Boolean).map((value) => path.resolve(value)))]) {
    await visit(targetPath);
  }
  return `${latestMtimeMs}:${fileCount}:${totalBytes}`;
}

async function listBundleFilesWithHashes(bundleDir) {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const absolutePath = path.join(bundleDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listBundleFilesWithHashes(absolutePath)));
    } else if (entry.isFile()) {
      files.push({
        relativePath: path.relative(bundleDir, absolutePath).split(path.sep).join("/"),
        sha256: sha256(await fs.readFile(absolutePath))
      });
    }
  }
  return files;
}

async function bundleFileDiffs(installedDir, sourceDir, bundleLabel) {
  const [installed, source] = await Promise.all([
    listBundleFilesWithHashes(installedDir),
    listBundleFilesWithHashes(sourceDir)
  ]);
  const sourceByPath = new Map(source.map((item) => [item.relativePath, item.sha256]));
  const installedByPath = new Map(installed.map((item) => [item.relativePath, item.sha256]));
  const diffs = [];
  for (const [relativePath, installedSha] of installedByPath) {
    if (!sourceByPath.has(relativePath)) {
      diffs.push({ bundle: bundleLabel, relativePath, status: "added" });
    } else if (sourceByPath.get(relativePath) !== installedSha) {
      diffs.push({ bundle: bundleLabel, relativePath, status: "modified" });
    }
  }
  for (const relativePath of sourceByPath.keys()) {
    if (!installedByPath.has(relativePath)) {
      diffs.push({ bundle: bundleLabel, relativePath, status: "removed" });
    }
  }
  return diffs;
}

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

async function readSkillUsageRecord(usageFile, skillName) {
  let source;
  try {
    source = await fs.readFile(usageFile, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") return { useCount: 0, lastUsedAt: "" };
    throw cause;
  }
  const payload = JSON.parse(source);
  const record = payload?.[skillName];
  const useCount = Number(record?.use_count || 0);
  if (!Number.isInteger(useCount) || useCount < 0) {
    throw new Error(`Hermes skill usage count is invalid for ${skillName}`);
  }
  return {
    useCount,
    lastUsedAt: String(record?.last_used_at || "").trim()
  };
}

function publicRuntimeError(cause, stageIndex, timeoutMs) {
  if (cause?.code === TCSD_ERROR_CODES.stalled) return cause;
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

function stageRuntimeResultError(result, stageIndex, attempt, sessionId = "") {
  if (result?.status !== "failed") return null;
  const resultDetails = result.error?.details && typeof result.error.details === "object"
    ? result.error.details
    : {};
  return Object.assign(
    new Error(result.error?.message || result.summary || `TCSD stage ${stageIndex} deterministic runtime failed.`),
    {
      code: result.error?.code || TCSD_ERROR_CODES.stageRuntime,
      details: {
        ...resultDetails,
        stageIndex,
        attempt,
        sessionId,
        hard: result.error?.hard !== false
      }
    }
  );
}

function defaultStateDbPath(profile) {
  if (process.env.TCSD_STAGE_HERMES_STATE_DB_PATH) return process.env.TCSD_STAGE_HERMES_STATE_DB_PATH;
  const hermesHomeDir = config.hermes?.homeDir ||
    process.env.HERMES_HOME ||
    path.join(process.env.HOME || process.env.USERPROFILE || config.rootDir, ".hermes");
  if (!profile || profile === "default" || profile === config.hermes?.profile) {
    return config.hermes?.stateDbPath || path.join(hermesHomeDir, "state.db");
  }
  return path.join(hermesHomeDir, "profiles", profile, "state.db");
}

export class TcsdHermesStageExecutor {
  constructor(options = {}) {
    this.command = options.command || config.hermes.command || "hermes";
    this.commandArgsPrefix = Array.isArray(options.commandArgsPrefix ?? config.hermes.commandArgsPrefix)
      ? (options.commandArgsPrefix ?? config.hermes.commandArgsPrefix).map((value) => String(value))
      : [];
    this.pythonInvocation = resolvePythonInvocation(options);
    this.profile = String(options.profile ?? config.tcsdPipeline.hermesProfile ?? config.hermes.profile ?? "").trim() || "default";
    this.maxTurns = Math.max(1, Number(options.maxTurns ?? config.tcsdPipeline.stageMaxTurns ?? 200) || 200);
    this.timeoutMs = Math.max(
      1000,
      Number(options.timeoutMs ?? config.tcsdPipeline.stageTimeoutMs ?? 60 * 60 * 1000) || 60 * 60 * 1000
    );
    this.stateDbPath = options.stateDbPath || defaultStateDbPath(this.profile);
    this.commandRunner = options.commandRunner || createHermesSpawnRunner();
    this.watchdogStallMs = Math.max(
      0,
      Number(
        options.watchdogStallMs ??
        process.env.TCSD_STAGE_HERMES_WATCHDOG_STALL_MS ??
        300000
      )
    );
    this.watchdogGraceMs = Math.max(0, Number(options.watchdogGraceMs ?? 15000));
    this.watchdogPollMs = Math.max(100, Number(options.watchdogPollMs ?? 10000));
    this.noResultStallMs = Math.max(
      0,
      Number(
        options.noResultStallMs ??
        process.env.TCSD_STAGE_HERMES_NO_RESULT_STALL_MS ??
        1800000
      )
    );
    this.noResultPollMs = Math.max(
      this.watchdogPollMs,
      Number(options.noResultPollMs ?? 30000)
    );
    this.catalog = options.catalog || new TcsdStageCatalog();
    this.semanticValidator = options.semanticValidator || new TcsdHostSemanticValidator({
      pythonInvocation: this.pythonInvocation
    });
    this.usageReader = options.usageReader ||
      ((sessionId, runtime, skill, invocation) => this.readSessionUsage(sessionId, runtime, skill, invocation));
    this.now = options.now || (() => new Date().toISOString());
  }

  async readSessionUsage(sessionId, runtime, skill, invocation) {
    const script = path.join(runtime.directory, "scripts", "read_hermes_session.py");
    const { stdout = "" } = await runPythonCommand(
      this.commandRunner,
      this.pythonInvocation,
      [
        "-B",
        script,
        "--state-db",
        this.stateDbPath,
        "--session-id",
        sessionId,
        "--expected-skill-name",
        skill.name,
        "--expected-skill-file",
        path.join(skill.directory, "SKILL.md"),
        "--expected-skill-sha256",
        skill.skillFileHash,
        "--skill-usage-file",
        invocation.usageFile,
        "--expected-use-count-before",
        String(invocation.useCountBefore),
        "--invocation-started-at",
        invocation.startedAt,
        "--invocation-ended-at",
        invocation.endedAt
      ],
      {
        cwd: runtime.directory,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" }
      }
    );
    const usage = JSON.parse(String(stdout || "").trim());
    if (
      !usage.model ||
      !Number.isFinite(Number(usage.totalTokens)) ||
      usage.skillLoad?.source !== "hermes-state-db+skill-usage" ||
      usage.skillLoad?.loaded !== true ||
      usage.skillLoad?.skillName !== skill.name ||
      usage.skillLoad?.skillFileSha256 !== skill.skillFileHash
    ) throw new Error("Hermes session telemetry or slash-skill loading evidence is incomplete");
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

  async resolveInstalledBundles(job, stageIndex) {
    const snapshot = job.skillSnapshot;
    const installedSkill = snapshot?.stages?.find((item) => item.index === stageIndex);
    const sourceSkill = await this.catalog.describe(stageIndex);
    const sourceRuntime = await this.catalog.runtime();
    if (
      snapshot?.schema !== "tcsd-hermes-skill-snapshot/v1" ||
      snapshot.profile !== this.profile ||
      snapshot.discovery?.allDiscovered !== true ||
      !installedSkill ||
      installedSkill.name !== sourceSkill.name ||
      installedSkill.version !== sourceSkill.version ||
      installedSkill.bundleVersion !== sourceSkill.bundleVersion ||
      installedSkill.bundleHash !== sourceSkill.bundleHash ||
      installedSkill.skillFileHash !== sourceSkill.skillFileHash ||
      snapshot.runtime?.bundleVersion !== sourceRuntime.bundleVersion ||
      snapshot.runtime?.bundleHash !== sourceRuntime.bundleHash
    ) {
      throw Object.assign(new Error("TCSD job skill snapshot is missing, stale, or inconsistent."), {
        code: TCSD_ERROR_CODES.workerUnavailable,
        details: { stageIndex }
      });
    }
    const skillDirectory = path.resolve(installedSkill.installedPath);
    const runtimeDirectory = path.resolve(snapshot.runtime.installedPath);
    const installedSkillHash = (await hashTcsdBundle(skillDirectory)).sha256;
    const installedRuntimeHash = (await hashTcsdBundle(runtimeDirectory)).sha256;
    const installedSkillFileHash = sha256(await fs.readFile(path.join(skillDirectory, "SKILL.md")));
    if (
      installedSkillHash !== sourceSkill.bundleHash ||
      installedRuntimeHash !== sourceRuntime.bundleHash ||
      installedSkillFileHash !== sourceSkill.skillFileHash
    ) {
      throw Object.assign(new Error("Installed TCSD skill or runtime changed after the job snapshot."), {
        code: TCSD_ERROR_CODES.skillTreeMutated,
        details: { stageIndex, skillName: sourceSkill.name }
      });
    }
    return {
      skill: {
        ...sourceSkill,
        directory: skillDirectory,
        sourceDirectory: sourceSkill.directory
      },
      runtime: {
        ...sourceRuntime,
        directory: runtimeDirectory,
        installedPath: runtimeDirectory,
        sourceDirectory: sourceRuntime.directory
      }
    };
  }

  async assertInstalledBundlesImmutable(job, stageIndex, { sessionId, attempt } = {}) {
    const snapshot = job.skillSnapshot;
    const diffs = [];
    const installedStages = Array.isArray(snapshot?.stages) ? snapshot.stages : [];
    for (let index = 1; index <= 12; index += 1) {
      const installed = installedStages.find((item) => item.index === index);
      if (!installed?.installedPath) continue;
      const source = await this.catalog.describe(index);
      diffs.push(
        ...(await bundleFileDiffs(
          path.resolve(installed.installedPath),
          path.resolve(source.directory),
          `stage-${String(index).padStart(2, "0")}`
        ))
      );
    }
    if (snapshot?.runtime?.installedPath) {
      const source = await this.catalog.runtime();
      diffs.push(
        ...(await bundleFileDiffs(
          path.resolve(snapshot.runtime.installedPath),
          path.resolve(source.directory),
          "tcsd-runtime"
        ))
      );
    }
    if (!diffs.length) return;
    throw Object.assign(
      new Error(
        `TCSD skill tree was mutated by the stage agent session (${diffs.length} file(s)).`
      ),
      {
        code: TCSD_ERROR_CODES.skillTreeMutated,
        details: {
          stageIndex,
          attempt,
          sessionId,
          mutatedFileCount: diffs.length,
          mutatedFiles: diffs.slice(0, 20)
        }
      }
    );
  }

  /**
   * 运行 Hermes 阶段会话；当结果文件已为 completed 且一段时间无新写入、
   * 而 CLI 进程仍挂起（hermes chat 退出路径 futex/线程 join 竞态）时，
   * 终止进程并按已完成的增量输出收尾，避免阶段无限停留在“正在执行”。
   * 尚无结果且输出、阶段文件和 Hermes 状态库长时间均无变化时，终止
   * 停滞会话并返回可识别错误，由作业服务使用全新 session 自动重试一次。
   */
  async runStageHermes({ command, args, options, resultPath, activityPaths = [], job }) {
    const promise = runHermesCommand(this.commandRunner, command, args, options);
    const child = promise.child || null;
    if ((!this.watchdogStallMs && !this.noResultStallMs) || !child) return promise;
    let lastSeenMtime = 0;
    let lastOutputSize = 0;
    let lastActivityFingerprint = "";
    let lastActivityAt = Date.now();
    let nextActivityScanAt = 0;
    for (;;) {
      const settled = await Promise.race([
        promise.then(
          (value) => ({ kind: "ok", value }),
          (error) => ({ kind: "error", error })
        ),
        sleep(this.watchdogPollMs).then(() => ({ kind: "poll" }))
      ]);
      if (settled.kind === "ok") return settled.value;
      if (settled.kind === "error") throw settled.error;
      const partialStdout =
        typeof promise.stdoutSoFar === "function" ? promise.stdoutSoFar() : "";
      const partialStderr =
        typeof promise.stderrSoFar === "function" ? promise.stderrSoFar() : "";
      const outputSize = Buffer.byteLength(partialStdout) + Buffer.byteLength(partialStderr);
      if (outputSize !== lastOutputSize) {
        lastOutputSize = outputSize;
        lastActivityAt = Date.now();
      }
      if (this.noResultStallMs && Date.now() >= nextActivityScanAt) {
        const fingerprint = await activityFingerprint(activityPaths);
        if (lastActivityFingerprint && fingerprint !== lastActivityFingerprint) {
          lastActivityAt = Date.now();
        }
        lastActivityFingerprint = fingerprint;
        nextActivityScanAt = Date.now() + this.noResultPollMs;
      }
      let completed = false;
      try {
        const stat = await fs.stat(resultPath);
        if (stat.mtimeMs > lastSeenMtime) lastSeenMtime = stat.mtimeMs;
        if (this.watchdogStallMs && lastSeenMtime > 0 && Date.now() - lastSeenMtime >= this.watchdogStallMs) {
          const parsed = JSON.parse(await fs.readFile(resultPath, "utf8"));
          completed =
            parsed?.schema === TCSD_STAGE_RESULT_SCHEMA &&
            parsed?.status === "completed";
        }
      } catch {
        completed = false;
      }
      const stalled =
        !completed &&
        this.noResultStallMs > 0 &&
        Date.now() - lastActivityAt >= this.noResultStallMs;
      if (!completed && !stalled) continue;
      try {
        child.kill("SIGTERM");
      } catch {
        // 进程可能已退出
      }
      const exited = await Promise.race([
        promise.then(() => true).catch(() => true),
        sleep(this.watchdogGraceMs).then(() => false)
      ]);
      if (!exited) {
        try {
          child.kill("SIGKILL");
        } catch {
          // 进程可能已退出
        }
      }
      if (Array.isArray(job.events)) {
        const workspaceDirValue = String(job.input?.workspaceDir || "").trim();
        job.events.push({
          at: this.now(),
          type: stalled
            ? "hermes_stage_watchdog_stalled_session"
            : "hermes_stage_watchdog_killed_session",
          stageIndex: options.stageIndex,
          attempt: options.attempt,
          ...(stalled
            ? {
                inactivityMs: Date.now() - lastActivityAt,
                stallThresholdMs: this.noResultStallMs
              }
            : {}),
          ...(workspaceDirValue
            ? { resultPath: relativeToWorkspace(path.resolve(workspaceDirValue), resultPath) }
            : {})
        });
      }
      if (stalled) {
        throw Object.assign(
          new Error(
            `TCSD stage ${options.stageIndex} Hermes session made no observable progress for ${this.noResultStallMs}ms.`
          ),
          {
            code: TCSD_ERROR_CODES.stalled,
            details: {
              stageIndex: options.stageIndex,
              attempt: options.attempt,
              inactivityMs: Date.now() - lastActivityAt,
              stallThresholdMs: this.noResultStallMs
            }
          }
        );
      }
      return { stdout: partialStdout, stderr: partialStderr };
    }
  }

  buildPrompt({ definition, skill, runtime, manifestPath, resultPath, validationReportPath, attempt }) {
    const repairLines = validationReportPath
      ? [
          `This is validation repair attempt ${attempt}.`,
          `Read the host validation report at: ${validationReportPath}`,
          "Repair only the reported deterministic validation defects, then rerun the same stage in this new session."
        ]
      : ["This is the initial stage attempt. No earlier session context is available."];
    const runtimeCommand = formatPythonCommand(this.pythonInvocation, [
      "-B",
      path.join(runtime.directory, "scripts", "run_tcsd_pipeline_stage.py"),
      "--manifest",
      manifestPath,
      "--result",
      resultPath
    ]);
    if (definition.index === 10) {
      const repairBriefPath = path.join(path.dirname(resultPath), "repair-brief.json");
      const repairProposalPath = path.join(path.dirname(resultPath), "repair-proposal.json");
      const prepareCommand = [
        runtimeCommand,
        "--stage10-mode",
        "prepare",
        "--repair-brief",
        `"${repairBriefPath}"`
      ].join(" ");
      const applyCommand = [
        runtimeCommand,
        "--stage10-mode",
        "apply",
        "--repair-brief",
        `"${repairBriefPath}"`,
        "--repair-proposal",
        `"${repairProposalPath}"`
      ].join(" ");
      return [
        `/${definition.skillName} You are executing the generic Hermes step tcsd_stage_execute.`,
        `Load and execute only the slash-invoked ${definition.skillName} skill.`,
        `Execute only stage ${definition.index}: ${definition.name}.`,
        `Read the authoritative input manifest: ${manifestPath}`,
        ...repairLines,
        "Run this exact prepare command first:",
        prepareCommand,
        `Read the resulting authoritative coverage repair brief at: ${repairBriefPath}`,
        "Inspect only the uncovered target block and its local upstream model slice.",
        "The maxStepsPerTest limit counts JSON stimulus.steps action entries only; it does not count Simulink solver steps, sample hits, counter increments, or Unit Delay updates.",
        "A finite hold spanning many sample periods is one action step: compute the justified duration and encode it as one positive delay_s instead of declaring the sequence unconstructible.",
        `Write the required Agent repair proposal to: ${repairProposalPath}`,
        "Then run this exact deterministic apply command:",
        applyCommand,
        `The required candidate result path is: ${resultPath}`,
        `The required result schema is ${TCSD_STAGE_RESULT_SCHEMA}.`,
        "Do not edit the existing workbook or write a host checkpoint. Do not expose hidden reasoning or secrets.",
        `The installed skills directory (${skill.directory}) and runtime directory (${runtime.directory}) are immutable: never create, modify, rename, or delete any file under them; the host verifies this after your session. Write all generated files only into the task workspace.`,
        "Your text response is non-authoritative; the host accepts only independently validated proposal, simulation, workbook, and result artifacts."
      ].join("\n");
    }
    return [
      `/${definition.skillName} You are executing the generic Hermes step tcsd_stage_execute.`,
      `Load and execute only the slash-invoked ${definition.skillName} skill.`,
      `Execute only stage ${definition.index}: ${definition.name}.`,
      `Read the authoritative input manifest: ${manifestPath}`,
      ...repairLines,
      "Invoke this exact shared deterministic runtime command:",
      runtimeCommand,
      `The required candidate result path is: ${resultPath}`,
      `The required result schema is ${TCSD_STAGE_RESULT_SCHEMA}.`,
      "Do not write a host checkpoint. Do not expose hidden reasoning or secrets.",
      `The installed skills directory (${skill.directory}) and runtime directory (${runtime.directory}) are immutable: never create, modify, rename, or delete any file under them; the host verifies this after your session. Write all generated files only into the task workspace.`,
      "Your text response is non-authoritative; the host will accept the stage only after independently validating the result file and artifacts."
    ].join("\n");
  }

  async packageStage12(job, agentArtifacts) {
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const outputDir = path.resolve(job.input.outputDir);
    const hostDir = path.join(outputDir, ".tcsd-host");
    await fs.mkdir(hostDir, { recursive: true });
    const checkpointArtifacts = (job.stages || []).flatMap((stage) => (
      Array.isArray(stage.checkpoint?.artifacts) ? stage.checkpoint.artifacts : []
    ));
    const artifacts = [...checkpointArtifacts, ...(agentArtifacts || [])]
      .filter((artifact) => artifact?.path && artifact?.kind)
      .filter((artifact, index, values) => values.findIndex((item) => item.path === artifact.path) === index);
    const finalValidationCheckpoint = job.stages?.[10]?.checkpoint;
    const initialBackfillCheckpoint = job.stages?.[7]?.checkpoint;
    const oracleCheckpoint = finalValidationCheckpoint?.status !== "skipped" && finalValidationCheckpoint?.evidence
      ? finalValidationCheckpoint
      : initialBackfillCheckpoint;
    const oracleEvidence = oracleCheckpoint?.evidence;
    const oracleStageIndex = oracleCheckpoint === finalValidationCheckpoint ? 11 : 8;
    const caseOutputCounts = oracleEvidence?.caseOutputCounts;
    const testCaseCount = Number(oracleEvidence?.testCaseCount);
    const expValueCount = Number(oracleEvidence?.workbookBackfillCount);
    const testsWithoutExpectedValues = oracleEvidence?.testsWithoutExpectedValues;
    const caseOutputEntries = caseOutputCounts && typeof caseOutputCounts === "object" && !Array.isArray(caseOutputCounts)
      ? Object.entries(caseOutputCounts)
      : [];
    const countedExpectedValues = caseOutputEntries.length
      ? caseOutputEntries.reduce((total, [, counts]) => (
          total + (
            counts && typeof counts === "object" && !Array.isArray(counts)
              ? Object.values(counts).reduce((subtotal, count) => subtotal + Number(count || 0), 0)
              : 0
          )
        ), 0)
      : 0;
    if (
      !oracleCheckpoint ||
      oracleCheckpoint.validation?.passed !== true ||
      !Number.isInteger(testCaseCount) ||
      testCaseCount < 1 ||
      !Number.isInteger(expValueCount) ||
      expValueCount < testCaseCount ||
      !Array.isArray(testsWithoutExpectedValues) ||
      testsWithoutExpectedValues.length !== 0 ||
      caseOutputEntries.length !== testCaseCount ||
      caseOutputEntries.some(([identity, counts]) => (
        !identity ||
        !counts ||
        typeof counts !== "object" ||
        Array.isArray(counts) ||
        !Object.keys(counts).length ||
        Object.values(counts).some((count) => !Number.isInteger(Number(count)) || Number(count) < 1)
      )) ||
      countedExpectedValues !== expValueCount ||
      Number(oracleEvidence?.simulationValueCount) !== expValueCount ||
      Number(oracleEvidence?.expValueCount) !== expValueCount ||
      !oracleEvidence?.simulationResult
    ) {
      throw Object.assign(new Error("Host cannot package TCSD completion without complete per-Test oracle evidence."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const latestWorkbook = (oracleCheckpoint.artifacts || [])
      .find((artifact) => artifact.kind === "xlsx")?.path || "";
    if (!latestWorkbook) {
      throw Object.assign(new Error("Host cannot package TCSD completion without a verified final workbook."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const modelName = path.basename(job.input.modelSlxPath, path.extname(job.input.modelSlxPath));
    const finalWorkbookPath = relativeToWorkspace(
      workspaceDir,
      path.join(outputDir, `${modelName}_Test0001_tcsd.xlsx`)
    );
    const latestWorkbookAbsolutePath = path.resolve(workspaceDir, latestWorkbook);
    const finalWorkbookAbsolutePath = path.resolve(workspaceDir, finalWorkbookPath);
    if (latestWorkbookAbsolutePath !== finalWorkbookAbsolutePath) {
      await fs.copyFile(latestWorkbookAbsolutePath, finalWorkbookAbsolutePath);
    }
    const latestSimulation = oracleEvidence.simulationResult;
    const initialCoverageArtifact = job.stages?.[8]?.checkpoint?.evidence?.coverageReport || "";
    const finalCoverageArtifact = job.stages?.[10]?.checkpoint?.evidence?.coverageReport || initialCoverageArtifact;
    const planningMappingArtifact = artifacts.find((artifact) => artifact.role === "planning-mapping-assessment");
    const initialCoverage = job.coverage.initial;
    const finalCoverage = job.coverage.final || initialCoverage;
    if (!initialCoverage || !finalCoverage || !planningMappingArtifact) {
      throw Object.assign(new Error("Host cannot package TCSD completion without verified coverage and planning diagnostics."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const planningMappingPath = path.resolve(workspaceDir, planningMappingArtifact.path);
    const planningMapping = JSON.parse(await fs.readFile(planningMappingPath, "utf8"));
    if (
      planningMapping.schema !== "tcsd-planning-mapping-assessment/v1" ||
      planningMapping.authority !== "planning" ||
      planningMapping.blocking !== false ||
      !["satisfied", "advisory"].includes(planningMapping.status)
    ) {
      throw Object.assign(new Error("Host cannot package an invalid planning mapping assessment."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const threshold = Number(job.input.coverageThreshold || 80);
    const unresolved = [];
    for (const [model, record] of Object.entries(finalCoverage.models || {})) {
      for (const metric of ["condition", "decision", "mcdc"]) {
        if (Number(record?.[metric]?.percent) < threshold) {
          unresolved.push({
            model,
            metric,
            percent: Number(record[metric].percent),
            threshold
          });
        }
      }
    }
    const completion = coverageCompletion(finalCoverage, unresolved.length > 0, threshold);
    const executionManifest = {
      schema: "simulink-ut-tcsd-execution-manifest/v1",
      authority: "host",
      jobId: job.jobId,
      status: "completed",
      completion,
      generatedAt: this.now(),
      workbook: finalWorkbookPath,
      simulation: {
        status: "completed",
        result: latestSimulation
      },
      oracle: {
        authority: "host",
        status: "complete",
        sourceStageIndex: oracleStageIndex,
        testCaseCount,
        expValueCount,
        testsWithoutExpectedValues: [],
        caseOutputCounts,
        simulationResult: latestSimulation,
        workbookSha256: sha256(await fs.readFile(finalWorkbookAbsolutePath))
      },
      evidence: {
        checkpointCount: (job.checkpoints || []).length + 1,
        unresolved,
        planningMappingAssessment: {
          path: planningMappingArtifact.path,
          sha256: sha256(await fs.readFile(planningMappingPath)),
          authority: "planning",
          status: planningMapping.status,
          blocking: false,
          supersededBy: {
            stageIndex: 9,
            authority: "measured-simulink-coverage",
            coverageArtifact: initialCoverageArtifact
          }
        }
      },
      coverage: {
        initial: initialCoverage,
        final: finalCoverage,
        initial_artifact: initialCoverageArtifact,
        final_artifact: finalCoverageArtifact,
        repair_required: Boolean(job.repair?.required),
        repair_attempted: Boolean(job.repair?.attempted),
        repair_applied: Boolean(job.repair?.applied),
        repair_passes: Number(job.repair?.passes || 0),
        repair_reason: String(job.repair?.reason || ""),
        repair_evidence: String(job.repair?.evidence || "")
      }
    };
    const timeline = {
      schema: "tcsd-stage-timeline/v1",
      authority: "host",
      jobId: job.jobId,
      events: Array.isArray(job.events) ? job.events : []
    };
    const executionPath = path.join(hostDir, "execution-manifest.json");
    const timelinePath = path.join(hostDir, "timeline.json");
    await writeJson(executionPath, executionManifest);
    await writeJson(timelinePath, timeline);
    const hostArtifacts = [
      ...artifacts.filter((artifact) => artifact.path !== finalWorkbookPath),
      { path: finalWorkbookPath, kind: "xlsx", role: "final-workbook" },
      { path: relativeToWorkspace(workspaceDir, executionPath), kind: "json", role: "execution-manifest" },
      { path: relativeToWorkspace(workspaceDir, timelinePath), kind: "json", role: "timeline" }
    ];
    const artifactManifestPath = path.join(hostDir, "artifact-manifest.json");
    hostArtifacts.push({
      path: relativeToWorkspace(workspaceDir, artifactManifestPath),
      kind: "json",
      role: "artifact-manifest"
    });
    const artifactManifest = {
      schema: "tcsd-artifact-manifest/v1",
      authority: "host",
      jobId: job.jobId,
      artifacts: hostArtifacts
    };
    await writeJson(artifactManifestPath, artifactManifest);
    return {
      artifacts: hostArtifacts,
      executionManifest: {
        ...executionManifest,
        path: relativeToWorkspace(workspaceDir, executionPath),
        sha256: sha256(await fs.readFile(executionPath))
      },
      artifactManifest: hostArtifacts,
      artifactManifestReference: {
        path: relativeToWorkspace(workspaceDir, artifactManifestPath),
        sha256: sha256(await fs.readFile(artifactManifestPath))
      },
      timelineReference: {
        path: relativeToWorkspace(workspaceDir, timelinePath),
        sha256: sha256(await fs.readFile(timelinePath))
      }
    };
  }

  async execute(stageIndex, _input, job, options = {}) {
    const definition = TCSD_STAGE_DEFINITIONS[stageIndex - 1];
    if (!definition) throw Object.assign(new Error(`Unknown TCSD stage ${stageIndex}`), { code: TCSD_ERROR_CODES.input });
    const attempt = Number(options.attempt || job.stages?.[stageIndex - 1]?.attempt || 1);
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const outputDir = path.resolve(job.input.outputDir);
    const { skill, runtime } = await this.resolveInstalledBundles(job, stageIndex);
    const attemptDir = path.join(outputDir, ".tcsd-agent", `stage-${String(stageIndex).padStart(2, "0")}`, `attempt-${attempt}`);
    const manifestPath = path.join(attemptDir, "input.json");
    const resultPath = path.join(attemptDir, "result.json");
    const validationPath = path.join(attemptDir, "validation.json");
    const semanticRequestPath = path.join(attemptDir, "semantic-request.json");
    const semanticReportPath = path.join(attemptDir, "semantic-validation.json");
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
        bundleHash: skill.bundleHash,
        skillFileHash: skill.skillFileHash
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
    const args = [...this.commandArgsPrefix, ...profileArgs(this.profile, rawArgs)];
    const skillUsageFile = path.join(path.dirname(path.dirname(skill.directory)), ".usage.json");
    const usageBefore = await readSkillUsageRecord(skillUsageFile, skill.name);
    const startedAt = Date.now();
    let commandResult;
    try {
      commandResult = await this.runStageHermes({
        command: this.command,
        args,
        options: {
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
          windowsHide: true,
          stageIndex,
          attempt
        },
        resultPath,
        activityPaths: [
          outputDir,
          this.stateDbPath,
          `${this.stateDbPath}-wal`,
          `${this.stateDbPath}-shm`
        ],
        job
      });
    } catch (cause) {
      const failedResult = await readJson(resultPath, null).catch(() => null);
      const runtimeError = stageRuntimeResultError(failedResult, stageIndex, attempt);
      if (runtimeError) throw runtimeError;
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
    await this.assertInstalledBundlesImmutable(job, stageIndex, { sessionId, attempt });
    const priorSessionIds = this.collectPriorSessionIds(job);
    if (priorSessionIds.has(sessionId)) {
      throw Object.assign(new Error("Hermes reused a prior TCSD stage session."), {
        code: TCSD_ERROR_CODES.sessionReuse,
        details: { stageIndex, attempt, sessionId }
      });
    }
    let tokenUsage;
    try {
      tokenUsage = await this.usageReader(sessionId, runtime, skill, {
        usageFile: skillUsageFile,
        useCountBefore: usageBefore.useCount,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString()
      });
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
    const runtimeError = stageRuntimeResultError(result, stageIndex, attempt, sessionId);
    if (runtimeError) {
      runtimeError.details = {
        ...(runtimeError.details || {}),
        profile: this.profile,
        model: tokenUsage.model,
        tokenUsage
      };
      throw runtimeError;
    }
    let validatedResult;
    let semanticEvidence;
    try {
      if (resultReadError) {
        throw new Error(`stage result is not valid JSON: ${resultReadError.message}`);
      }
      semanticEvidence = await this.semanticValidator.validate({
        raw: result || {},
        job,
        runtime,
        requestPath: semanticRequestPath
      });
      await writeJson(semanticReportPath, semanticEvidence);
      validatedResult = await validateStageResult(result || {}, {
        jobId: job.jobId,
        stageIndex,
        workspaceDir,
        semanticEvidence,
        pipelineState: job
      });
    } catch (cause) {
      const semanticDiagnostics = cause?.details?.diagnostics || null;
      const report = {
        schema: "tcsd-host-validation-report/v1",
        jobId: job.jobId,
        stageIndex,
        attempt,
        passed: false,
        code: cause.code || TCSD_ERROR_CODES.validation,
        message: cause.message,
        semanticDiagnostics,
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
          semanticDiagnostics,
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
      semanticValidation: {
        path: relativeToWorkspace(workspaceDir, semanticReportPath),
        sha256: sha256(await fs.readFile(semanticReportPath))
      },
      validatedAt: this.now()
    };
    await writeJson(validationPath, validationReport);
    const inputSha256 = sha256(await fs.readFile(manifestPath));
    const resultSha256 = sha256(await fs.readFile(resultPath));
    const hostPackage = stageIndex === 12
      ? await this.packageStage12(job, result.artifacts || [])
      : null;
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
        skillLoad: tokenUsage.skillLoad,
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
        reportPath: relativeToWorkspace(workspaceDir, validationPath),
        semantic: validationReport.semanticValidation
      },
      toolLogs: [{
        tool: "hermes-cli",
        status: "completed",
        durationMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(stdout),
        stderrBytes: Buffer.byteLength(stderr)
      }],
      artifacts: hostPackage?.artifacts || result.artifacts || [],
      evidence: result.evidence || null,
      coverage: result.coverage || null,
      repair: result.repair || null,
      executionManifest: hostPackage?.executionManifest || null,
      artifactManifest: hostPackage?.artifactManifest || null,
      artifactManifestReference: hostPackage?.artifactManifestReference || null,
      timelineReference: hostPackage?.timelineReference || null,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: this.now()
    };
    const checkpointPath = path.join(outputDir, ".tcsd-checkpoints", `stage-${String(stageIndex).padStart(2, "0")}.json`);
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
    await writeJson(checkpointPath, checkpoint);
    await validateStageCheckpoint(checkpoint, {
      jobId: job.jobId,
      stageIndex,
      workspaceDir,
      priorSessionIds,
      semanticEvidence,
      pipelineState: job
    });
    return checkpoint;
  }

  async validateCheckpoint(raw, context, job) {
    const { runtime } = await this.resolveInstalledBundles(job, context.stageIndex);
    const workspaceDir = path.resolve(context.workspaceDir);
    const resultPath = path.resolve(workspaceDir, raw?.result?.path || "");
    if (resultPath !== workspaceDir && !resultPath.startsWith(`${workspaceDir}${path.sep}`)) {
      throw Object.assign(new Error("TCSD checkpoint result escaped the task workspace."), {
        code: TCSD_ERROR_CODES.validation
      });
    }
    const result = await readJson(resultPath, null);
    const recoveryDir = path.join(
      path.resolve(job.input.outputDir),
      ".tcsd-agent",
      `stage-${String(context.stageIndex).padStart(2, "0")}`,
      "recovery-validation"
    );
    await fs.mkdir(recoveryDir, { recursive: true });
    const semanticEvidence = await this.semanticValidator.validate({
      raw: result || {},
      job,
      runtime,
      requestPath: path.join(recoveryDir, "semantic-request.json")
    });
    return validateStageCheckpoint(raw, {
      ...context,
      semanticEvidence,
      pipelineState: job
    });
  }
}
