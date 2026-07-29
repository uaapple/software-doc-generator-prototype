import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { runHermesCommand } from "./hermes-command.js";
import { hashSoftwareDetailBundle } from "./software-detail-hermes-skill-registry.js";
import {
  SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA,
  SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA
} from "./software-detail-pipeline-contract.js";

const execFileAsync = promisify(execFile);

function executorError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function profileArgs(profile, args) {
  return !profile || profile === "default" ? args : ["-p", profile, ...args];
}

function parseSessionId(output = "") {
  const matches = String(output || "")
    .replaceAll("\r", "")
    .matchAll(/(?:^|\n)session_id:\s*(.+?)\s*$/gi);
  let sessionId = "";
  for (const match of matches) sessionId = match[1].trim();
  return sessionId;
}

function relativeToWorkspace(workspaceDir, targetPath, label) {
  const root = path.resolve(workspaceDir);
  const target = path.resolve(targetPath);
  const relativePath = path.relative(root, target);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw executorError(
      "software_detail_path_escape",
      `${label} escaped the task workspace.`
    );
  }
  return relativePath.replaceAll(path.sep, "/");
}

function installedStage(job, stageId) {
  const snapshot = job.skillRegistry;
  const stage = snapshot?.stages?.find(
    (candidate) => candidate.stageId === stageId
  );
  if (
    snapshot?.schema !== "software-detail-hermes-skill-registry/v1" ||
    snapshot.discovery?.allDiscovered !== true ||
    !stage ||
    !snapshot.runtime?.installedPath
  ) {
    throw executorError(
      "software_detail_skill_registry_unavailable",
      "Software-detail Hermes skill registry is unavailable.",
      { stageId }
    );
  }
  return {
    stage,
    runtime: snapshot.runtime
  };
}

async function assertInstalledSnapshot(stage, runtime, stageId) {
  let stageHash;
  let runtimeHash;
  try {
    [stageHash, runtimeHash] = await Promise.all([
      hashSoftwareDetailBundle(path.resolve(stage.installedPath)),
      hashSoftwareDetailBundle(path.resolve(runtime.installedPath))
    ]);
  } catch {
    throw executorError(
      "software_detail_skill_snapshot_drift",
      "Installed software-detail skill or runtime is missing.",
      { stageId }
    );
  }
  if (
    stageHash !== stage.bundleHash ||
    runtimeHash !== runtime.bundleHash
  ) {
    throw executorError(
      "software_detail_skill_snapshot_drift",
      "Installed software-detail skill or runtime changed after the job snapshot.",
      { stageId }
    );
  }
}

export class SoftwareDetailHermesStageExecutor {
  constructor(options = {}) {
    this.command = options.command || config.hermes.command || "hermes";
    this.commandArgsPrefix = Array.isArray(
      options.commandArgsPrefix ?? config.hermes.commandArgsPrefix
    )
      ? (options.commandArgsPrefix ?? config.hermes.commandArgsPrefix).map(String)
      : [];
    this.profile =
      String(
        options.profile ??
          config.softwareDetailPipeline?.hermesProfile ??
          config.hermes.profile ??
          "default"
      ).trim() || "default";
    this.maxTurns = Math.max(
      1,
      Number(
        options.maxTurns ??
          config.softwareDetailPipeline?.stageMaxTurns ??
          200
      ) || 200
    );
    this.timeoutMs = Math.max(
      1000,
      Number(
        options.timeoutMs ??
          config.softwareDetailPipeline?.stageTimeoutMs ??
          3600000
      ) || 3600000
    );
    this.commandRunner = options.commandRunner || execFileAsync;
  }

  buildPrompt(context) {
    const {
      definition,
      jobId,
      attempt,
      manifestRelativePath,
      candidateRelativePath,
      outputArtifacts,
      runtimeInstalledPath,
      lease
    } = context;
    const outputLines = outputArtifacts.map(
      (artifact) => `- ${artifact.role}: ${artifact.relativePath}`
    );
    const leaseLines = lease
      ? [
          `Gateway workspaceId: ${lease.workspaceId}`,
          `Gateway leaseId: ${lease.leaseId}`,
          `Gateway ownerJobId: ${lease.ownerJobId}`,
          `MATLAB sessionId: ${lease.matlabSessionId}`,
          "Use only the preconfigured Gateway helper/environment. Every Gateway job must carry this leaseId and ownerJobId.",
          "Never write Gateway credentials, environment contents, or authorization headers to any artifact."
        ]
      : [];
    const stageOneGuard =
      definition.order === 100
        ? [
            "The host already created the task-owned Gateway workspace and lease for this stage.",
            "The matlab-session-lease output is host-owned and already materialized. Do not replace or alter it; include its exact role/path in the candidate result."
          ]
        : [];
    const stageNineGuard =
      definition.order === 900
        ? [
            "Perform only the skill's model/path cleanup. Do not DELETE the Gateway lease; the host closes and confirms it after validating your DOCX and manifest."
          ]
        : [];
    const candidateSkeleton = {
      schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
      jobId,
      stageId: definition.id,
      attempt,
      status: "completed",
      artifacts: outputArtifacts.map((artifact) => ({
        role: artifact.role,
        relativePath: artifact.relativePath
      }))
    };
    return [
      `/${definition.skillName}`,
      `Execute only ${definition.id} in this fresh Hermes session.`,
      `Read the unique authoritative stage input manifest: ${manifestRelativePath}`,
      `Write the only candidate result to: ${candidateRelativePath}`,
      `Candidate schema: ${SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA}`,
      "The stage input artifacts and outputArtifacts are path bindings only; they are not the candidate-result JSON contract.",
      "Write candidate-result.json with this complete JSON shape. The output array field must be named artifacts:",
      JSON.stringify(candidateSkeleton, null, 2),
      "Write every declared output to its exact task-relative path:",
      ...outputLines,
      ...leaseLines,
      ...stageOneGuard,
      ...stageNineGuard,
      `Use only the shared software-detail runtime at this installed absolute path: ${runtimeInstalledPath}`,
      "Do not execute another stage, reuse a Hermes session, write a host checkpoint, expose hidden reasoning, or include secrets.",
      "Your stdout is diagnostic only. The host accepts success only from the candidate JSON and independently validated artifact files."
    ].join("\n");
  }

  async execute(context = {}) {
    const definition = context.definition;
    const job = context.job;
    if (!definition || !job) {
      throw executorError(
        "software_detail_executor_invalid_context",
        "Software-detail stage executor context is incomplete."
      );
    }
    const workspaceDir = path.resolve(job.input.workspaceDir);
    const { stage, runtime } = installedStage(job, definition.id);
    await assertInstalledSnapshot(stage, runtime, definition.id);
    const manifestRelativePath = relativeToWorkspace(
      workspaceDir,
      context.manifestPath,
      "stage input manifest"
    );
    const candidateRelativePath = relativeToWorkspace(
      workspaceDir,
      context.candidateResultPath,
      "candidate result"
    );
    const outputArtifacts = context.outputArtifacts.map((artifact) => ({
      role: artifact.role,
      relativePath: relativeToWorkspace(
        workspaceDir,
        path.join(workspaceDir, ...artifact.relativePath.split("/")),
        `output ${artifact.role}`
      )
    }));
    const manifest = {
      ...context.stageInput,
      schema: SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA,
      skill: {
        name: stage.name,
        version: stage.version,
        bundleHash: stage.bundleHash
      },
      runtime: {
        bundleHash: runtime.bundleHash,
        installedPath: path.resolve(runtime.installedPath)
      },
      outputArtifacts,
      candidateContract: {
        schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
        resultPath: candidateRelativePath,
        status: "completed",
        artifactArrayField: "artifacts"
      },
      gatewayLease: context.lease
        ? {
            workspaceId: context.lease.workspaceId,
            leaseId: context.lease.leaseId,
            ownerJobId: context.lease.ownerJobId,
            matlabSessionId: context.lease.matlabSessionId
          }
        : null,
      candidateResultPath: candidateRelativePath
    };
    await fs.mkdir(path.dirname(context.manifestPath), { recursive: true });
    await fs.writeFile(
      context.manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    await fs.rm(context.candidateResultPath, { force: true });

    const prompt = this.buildPrompt({
      definition,
      jobId: job.jobId,
      attempt: context.stageInput.attempt,
      manifestRelativePath,
      candidateRelativePath,
      outputArtifacts,
      runtimeInstalledPath: path.resolve(runtime.installedPath),
      lease: context.lease
    });
    const rawArgs = [
      "chat",
      "-q",
      prompt,
      "-Q",
      "--source",
      "tool",
      "--max-turns",
      String(this.maxTurns),
      "--yolo"
    ];
    let commandResult;
    const startedAt = Date.now();
    try {
      commandResult = await runHermesCommand(
        this.commandRunner,
        this.command,
        [
          ...this.commandArgsPrefix,
          ...profileArgs(this.profile, rawArgs)
        ],
        {
          cwd: workspaceDir,
          timeout: this.timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
          env: {
            ...process.env,
            ...context.gatewayEnvironment,
            NO_COLOR: "1",
            SOFTWARE_DETAIL_JOB_ID: job.jobId,
            SOFTWARE_DETAIL_STAGE_ID: definition.id,
            SOFTWARE_DETAIL_STAGE_ATTEMPT: String(
              context.stageInput.attempt
            )
          }
        }
      );
    } catch (cause) {
      if (
        cause?.killed ||
        cause?.signal === "SIGTERM" ||
        cause?.code === "ETIMEDOUT"
      ) {
        throw executorError(
          "software_detail_hermes_timeout",
          `Software-detail Hermes stage timed out after ${this.timeoutMs}ms.`,
          { stageId: definition.id }
        );
      }
      if (cause?.code === "ENOENT") {
        throw executorError(
          "software_detail_hermes_unavailable",
          "Hermes CLI is unavailable on the Worker.",
          { stageId: definition.id }
        );
      }
      throw executorError(
        "software_detail_hermes_failed",
        "Hermes CLI failed for the software-detail stage.",
        {
          stageId: definition.id,
          exitCode: Number.isInteger(cause?.code) ? cause.code : null
        }
      );
    }
    const stdout = String(commandResult?.stdout || "");
    const stderr = String(commandResult?.stderr || "");
    const sessionId = parseSessionId(`${stdout}\n${stderr}`);
    if (!sessionId) {
      throw executorError(
        "software_detail_hermes_session_missing",
        "Hermes stage did not report a session_id.",
        { stageId: definition.id }
      );
    }
    return {
      sessionId,
      profile: this.profile,
      manifestPath: context.manifestPath,
      candidateResultPath: context.candidateResultPath,
      durationMs: Date.now() - startedAt,
      stdoutBytes: Buffer.byteLength(stdout),
      stderrBytes: Buffer.byteLength(stderr)
    };
  }
}
