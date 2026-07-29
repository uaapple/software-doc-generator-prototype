import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertSoftwareDetailHermesSessionUnused,
  createSoftwareDetailPipelineJob,
  finishSoftwareDetailStage,
  SOFTWARE_DETAIL_JOB_SCHEMA,
  SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
  startSoftwareDetailStage,
  validateSoftwareDetailEvidenceArtifacts,
  validateSoftwareDetailModelPlanArtifacts
} from "./software-detail-pipeline-contract.js";
import { listSoftwareDetailStages } from "./software-detail-stage-catalog.js";
import { readJson, writeJson } from "./storage.js";
import { buildSoftwareDetailDocxFileName } from "./software-detail-artifact-name.js";

const CHECKPOINT_SCHEMA = "software-detail-stage-checkpoint/v1";
const PROJECT_SELECTION_SCHEMA = "software-detail-project-selection/v1";
const WORKER_SELECTION_SCHEMA = "software-detail-worker-selection/v1";
const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function serviceError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function safeError(cause, stageId = "") {
  const code =
    typeof cause?.code === "string" && cause.code.startsWith("software_detail_")
      ? cause.code
      : "software_detail_stage_failed";
  const safeDetails = {};
  if (typeof cause?.details?.failureReason === "string") {
    safeDetails.failureReason = cause.details.failureReason;
  }
  if (Array.isArray(cause?.details?.failedGates)) {
    if (cause.details.failedGates.length > 0) {
      safeDetails.failedGates = cause.details.failedGates;
    }
  }
  for (const field of ["field", "documentUnit", "output"]) {
    const value = safeDiagnosticText(cause?.details?.[field], 200);
    if (value) safeDetails[field] = value;
  }
  return {
    code,
    message: stageId
      ? `Software-detail stage failed: ${stageId}.`
      : "Software-detail job failed.",
    details:
      stageId || Object.keys(safeDetails).length > 0
        ? { ...(stageId ? { stageId } : {}), ...safeDetails }
        : null
  };
}

function safeDiagnosticText(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeCandidateFailure(candidate) {
  const failureReason = safeDiagnosticText(candidate?.failureReason);
  const failedGates = (
    Array.isArray(candidate?.failedGates) ? candidate.failedGates : []
  )
    .slice(0, 20)
    .map((gate) => {
      if (typeof gate === "string") return safeDiagnosticText(gate, 160);
      if (!gate || typeof gate !== "object" || Array.isArray(gate)) return "";
      const identity = safeDiagnosticText(
        gate.gate || gate.code || gate.name || gate.id,
        80
      );
      const reason = safeDiagnosticText(
        gate.reason || gate.detail || gate.message,
        160
      );
      return [identity, reason].filter(Boolean).join(": ");
    })
    .filter(Boolean);
  return {
    ...(failureReason ? { failureReason } : {}),
    ...(failedGates.length > 0 ? { failedGates } : {})
  };
}

function isTerminal(status) {
  return TERMINAL_STATUSES.has(String(status || ""));
}

function jobPath(jobDir, jobId) {
  const normalized = String(jobId || "").trim();
  if (!JOB_ID_PATTERN.test(normalized)) {
    throw serviceError(
      "software_detail_invalid_job_id",
      "Software-detail job ID is invalid."
    );
  }
  return path.join(jobDir, `${normalized}.json`);
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw serviceError(
      "software_detail_invalid_artifact_path",
      "Software-detail artifact path is invalid."
    );
  }
  return normalized;
}

function withinWorkspace(workspaceDir, relativePath) {
  const root = path.resolve(workspaceDir);
  const normalized = normalizeRelativePath(relativePath);
  const target = path.resolve(root, ...normalized.split("/"));
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw serviceError(
      "software_detail_artifact_path_escape",
      "Software-detail artifact escaped the task workspace."
    );
  }
  return target;
}

function relativeToWorkspace(workspaceDir, absolutePath) {
  const root = path.resolve(workspaceDir);
  const target = path.resolve(String(absolutePath || ""));
  const relativePath = path.relative(root, target);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw serviceError(
      "software_detail_input_path_escape",
      "Software-detail input escaped the task workspace."
    );
  }
  return normalizeRelativePath(relativePath.replaceAll(path.sep, "/"));
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

async function readJsonStrict(filePath, code, message) {
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (cause) {
    if (cause?.code === "ENOENT") {
      throw serviceError(code, message);
    }
    throw cause;
  }
  try {
    return JSON.parse(source);
  } catch {
    throw serviceError(code, message);
  }
}

function extensionForRole(role) {
  return role === "detail-design-docx" ? ".docx" : ".json";
}

function outputBindings(definition, job = {}) {
  const detailDesignDocxName = String(job.input?.modelSlxOriginalName || "").trim()
    ? buildSoftwareDetailDocxFileName(job.input.modelSlxOriginalName)
    : "software-detail-design.docx";
  return definition.outputs.map((artifact) => ({
    role: artifact.role,
    relativePath:
      artifact.role === "detail-design-docx"
        ? `outputs/${detailDesignDocxName}`
        : artifact.role === "artifact-manifest"
          ? "outputs/artifact-manifest.json"
          : `.software-detail/artifacts/${definition.id}/${artifact.role}${extensionForRole(
              artifact.role
            )}`
  }));
}

async function validateArtifact(workspaceDir, artifact) {
  const absolutePath = withinWorkspace(workspaceDir, artifact.relativePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    throw serviceError(
      "software_detail_required_artifact_missing",
      `Software-detail output artifact is missing: ${artifact.role}.`,
      { role: artifact.role }
    );
  }
  if (artifact.role === "detail-design-docx") {
    const handle = await fs.open(absolutePath, "r");
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, 4, 0);
      if (
        bytesRead !== 4 ||
        header[0] !== 0x50 ||
        header[1] !== 0x4b ||
        header[2] !== 0x03 ||
        header[3] !== 0x04
      ) {
        throw serviceError(
          "software_detail_invalid_docx",
          "Software-detail DOCX is not a non-empty ZIP package."
        );
      }
    } finally {
      await handle.close();
    }
  } else {
    await readJsonStrict(
      absolutePath,
      "software_detail_invalid_json_artifact",
      `Software-detail JSON artifact is unreadable: ${artifact.role}.`
    );
  }
  return {
    role: artifact.role,
    relativePath: normalizeRelativePath(artifact.relativePath),
    size: stat.size,
    sha256: await sha256File(absolutePath)
  };
}

function artifactManifestError(message, details = {}) {
  return serviceError("software_detail_invalid_artifact_manifest", message, details);
}

function requireManifestText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw artifactManifestError("Software-detail artifact manifest is missing a required field.", { field });
  }
  return normalized;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateFinalArtifactManifest(manifest, context = {}) {
  if (!isPlainObject(manifest)) {
    throw artifactManifestError("Software-detail artifact manifest is invalid.");
  }
  if (manifest.schema !== "software-detail-artifact-manifest/v1") {
    throw artifactManifestError("Software-detail artifact manifest schema is invalid.", { field: "schema" });
  }
  if (manifest.jobId !== context.jobId || manifest.stageId !== context.stageId) {
    throw artifactManifestError("Software-detail artifact manifest identity is invalid.");
  }
  if (
    !Number.isSafeInteger(manifest.attempt) ||
    manifest.attempt <= 0 ||
    manifest.attempt !== context.attempt
  ) {
    throw artifactManifestError("Software-detail artifact manifest attempt is invalid.", { field: "attempt" });
  }
  if (!isPlainObject(manifest.sourceStages)) {
    throw artifactManifestError("Software-detail artifact manifest sourceStages are invalid.", { field: "sourceStages" });
  }
  const contentCheckSource = manifest.sourceStages["content-check"];
  if (
    !isPlainObject(contentCheckSource) ||
    contentCheckSource.stageId !== "software-detail-stage-08-content-check" ||
    context.contentCheckStage?.status !== "completed" ||
    !Number.isSafeInteger(contentCheckSource.sourceAttempt) ||
    contentCheckSource.sourceAttempt <= 0 ||
    contentCheckSource.sourceAttempt !== context.contentCheckStage.attempt
  ) {
    throw artifactManifestError("Software-detail artifact manifest content-check provenance is invalid.", {
      field: "sourceStages.content-check"
    });
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1) {
    throw artifactManifestError("Software-detail artifact manifest artifacts are invalid.", { field: "artifacts" });
  }
  const entry = manifest.artifacts[0];
  if (!isPlainObject(entry) || entry.role !== "detail-design-docx") {
    throw artifactManifestError("Software-detail artifact manifest must declare exactly one final DOCX.", { field: "artifacts" });
  }
  if (Object.hasOwn(entry, "fileName") || Object.hasOwn(entry, "size")) {
    throw artifactManifestError("Software-detail artifact manifest uses legacy artifact field names.", {
      field: "artifacts.detail-design-docx"
    });
  }
  const expected = context.docxArtifact;
  const relativePath = requireManifestText(entry.relativePath, "artifacts.detail-design-docx.relativePath");
  const filename = requireManifestText(entry.filename, "artifacts.detail-design-docx.filename");
  if (entry.mediaType !== DOCX_MEDIA_TYPE) {
    throw artifactManifestError("Software-detail artifact manifest media type is invalid.", {
      field: "artifacts.detail-design-docx.mediaType"
    });
  }
  if (
    !isPlainObject(entry.validation) ||
    Object.keys(entry.validation).length === 0 ||
    entry.validation.boundaryValidation !== "PASS"
  ) {
    throw artifactManifestError("Software-detail artifact manifest validation result is invalid.", {
      field: "artifacts.detail-design-docx.validation"
    });
  }
  if (
    relativePath !== expected.relativePath ||
    filename !== path.posix.basename(expected.relativePath) ||
    !Number.isSafeInteger(entry.sizeBytes) ||
    entry.sizeBytes <= 0 ||
    entry.sizeBytes !== expected.size
  ) {
    throw artifactManifestError("Software-detail artifact manifest does not match the final DOCX.");
  }
  if (Object.hasOwn(entry, "sha256")) {
    const manifestHash = String(entry.sha256 || "").trim();
    if (
      !/^[a-fA-F0-9]{64}$/.test(manifestHash) ||
      manifestHash.toLowerCase() !== expected.sha256.toLowerCase()
    ) {
      throw artifactManifestError("Software-detail artifact manifest hash does not match the final DOCX.", { field: "artifacts.detail-design-docx.sha256" });
    }
  }
}

function candidateArtifacts(candidate, definition, expectedBindings) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    candidate.schema !== SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA
  ) {
    throw serviceError(
      "software_detail_invalid_candidate_result",
      "Software-detail candidate result contract is invalid."
    );
  }
  if (candidate.status === "failed") {
    throw serviceError(
      "software_detail_candidate_reported_failure",
      "Software-detail stage candidate reported failed gates.",
      {
        stageId: definition.id,
        ...safeCandidateFailure(candidate)
      }
    );
  }
  if (candidate.status !== "completed") {
    throw serviceError(
      "software_detail_invalid_candidate_result",
      "Software-detail candidate result status is invalid."
    );
  }
  const hasArtifacts = Object.hasOwn(candidate, "artifacts");
  const hasOutputArtifacts = Object.hasOwn(candidate, "outputArtifacts");
  if (
    (hasArtifacts && !Array.isArray(candidate.artifacts)) ||
    (hasOutputArtifacts && !Array.isArray(candidate.outputArtifacts)) ||
    (!hasArtifacts && !hasOutputArtifacts)
  ) {
    throw serviceError(
      "software_detail_invalid_candidate_result",
      "Software-detail candidate artifacts must be an array."
    );
  }
  const normalizeCandidateArtifacts = (rawArtifacts) =>
    rawArtifacts.map((artifact) => ({
      role: String(artifact?.role || "").trim(),
      relativePath: normalizeRelativePath(artifact?.relativePath)
    }));
  const canonicalArtifacts = hasArtifacts
    ? normalizeCandidateArtifacts(candidate.artifacts)
    : null;
  const compatibleOutputArtifacts = hasOutputArtifacts
    ? normalizeCandidateArtifacts(candidate.outputArtifacts)
    : null;
  if (canonicalArtifacts && compatibleOutputArtifacts) {
    const asSemanticBindings = (artifacts) =>
      artifacts
        .map((artifact) => `${artifact.role}\0${artifact.relativePath}`)
        .sort();
    if (
      JSON.stringify(asSemanticBindings(canonicalArtifacts)) !==
      JSON.stringify(asSemanticBindings(compatibleOutputArtifacts))
    ) {
      throw serviceError(
        "software_detail_candidate_artifacts_conflict",
        "Software-detail candidate artifacts and outputArtifacts conflict.",
        { stageId: definition.id }
      );
    }
  }
  const actual = canonicalArtifacts || compatibleOutputArtifacts;
  if (
    actual.length !== expectedBindings.length ||
    expectedBindings.some((expected) => {
      const matched = actual.find((artifact) => artifact.role === expected.role);
      return !matched || matched.relativePath !== expected.relativePath;
    })
  ) {
    throw serviceError(
      "software_detail_candidate_artifacts_mismatch",
      "Software-detail candidate artifact bindings differ from the catalog.",
      { stageId: definition.id }
    );
  }
  return actual;
}

function checkpointArtifact(job, stageId, role) {
  return job.stages
    ?.find((stage) => stage.id === stageId)
    ?.checkpoint?.artifacts?.find((artifact) => artifact.role === role);
}

export class SoftwareDetailPipelineJobService {
  constructor(options = {}) {
    this.jobDir = path.resolve(options.jobDir);
    this.executor = options.executor;
    this.leaseClient = options.leaseClient;
    this.prepareJob = options.prepareJob || null;
    this.idFactory = options.idFactory || randomUUID;
    this.now = options.now || (() => new Date().toISOString());
    this.running = new Map();
    this.starting = new Map();
  }

  async get(jobId) {
    return readJson(jobPath(this.jobDir, jobId), null);
  }

  async save(job) {
    await fs.mkdir(this.jobDir, { recursive: true });
    job.updatedAt = this.now();
    await writeJson(jobPath(this.jobDir, job.jobId), job);
    return job;
  }

  async list() {
    await fs.mkdir(this.jobDir, { recursive: true });
    const names = (await fs.readdir(this.jobDir)).filter((name) =>
      name.endsWith(".json")
    );
    const jobs = await Promise.all(
      names.map((name) => readJson(path.join(this.jobDir, name), null))
    );
    return jobs.filter(Boolean);
  }

  async failNonTerminalJobsOnStartup() {
    const failed = [];
    for (const job of await this.list()) {
      if (job.schema !== SOFTWARE_DETAIL_JOB_SCHEMA || isTerminal(job.status)) {
        continue;
      }
      await this.closeLease(job, { required: false });
      const stage = job.stages?.find((item) =>
        ["pending", "running"].includes(item.status)
      );
      if (stage) {
        stage.status = "failed";
        stage.endedAt = this.now();
        stage.error = {
          code: "software_detail_worker_restarted",
          message:
            "Software-detail job was interrupted by a Worker restart.",
          details: { stageId: stage.id }
        };
      }
      job.status = "failed";
      job.error = {
        code: "software_detail_worker_restarted",
        message:
          "Software-detail job cannot resume automatically after a Worker restart.",
        details: null
      };
      await this.save(job);
      failed.push(job.jobId);
    }
    return failed;
  }

  async start(input = {}) {
    const idempotencyKey = String(
      input.idempotencyKey || input.taskId || ""
    ).trim();
    if (!idempotencyKey) {
      throw serviceError(
        "software_detail_idempotency_key_missing",
        "Software-detail job requires an idempotency key."
      );
    }
    if (this.starting.has(idempotencyKey)) {
      return this.starting.get(idempotencyKey);
    }
    const promise = this.startInternal(input, idempotencyKey).finally(() => {
      this.starting.delete(idempotencyKey);
    });
    this.starting.set(idempotencyKey, promise);
    return promise;
  }

  async startInternal(input, idempotencyKey) {
    const prior = (await this.list()).find(
      (job) => job.idempotencyKey === idempotencyKey
    );
    if (prior) return prior;
    if (!this.executor || !this.leaseClient) {
      throw serviceError(
        "software_detail_worker_unavailable",
        "Software-detail Worker services are not configured."
      );
    }
    const workspaceDir = path.resolve(String(input.workspaceDir || ""));
    const outputDir = path.resolve(
      String(input.outputDir || path.join(workspaceDir, "outputs"))
    );
    if (
      !String(input.workspaceDir || "").trim() ||
      (outputDir !== workspaceDir &&
        !outputDir.startsWith(`${workspaceDir}${path.sep}`))
    ) {
      throw serviceError(
        "software_detail_workspace_invalid",
        "Software-detail workspace/output directory is invalid."
      );
    }
    await fs.mkdir(outputDir, { recursive: true });

    const jobId = String(this.idFactory()).trim();
    const base = createSoftwareDetailPipelineJob({ jobId });
    const job = {
      ...base,
      taskId: String(input.taskId || "").trim(),
      idempotencyKey,
      createdAt: this.now(),
      updatedAt: this.now(),
      input: {
        ...input,
        workspaceDir,
        outputDir
      },
      resources: {
        ownerJobId: jobId,
        workspaceId: `sdd-${jobId}`,
        leaseId: `sdd-lease-${jobId}`,
        matlabSessionId: "",
        leaseStatus: "pending"
      },
      stages: base.stages.map((stage) => ({
        ...stage,
        startedAt: "",
        endedAt: "",
        error: null,
        checkpoint: null,
        attempts: []
      })),
      checkpoints: [],
      artifacts: [],
      events: [],
      error: null
    };
    job.inputArtifacts = await this.createJobInputArtifacts(job);
    if (this.prepareJob) job.skillRegistry = await this.prepareJob(job);
    await this.save(job);
    this.run(jobId);
    return job;
  }

  async createJobInputArtifacts(job) {
    const workspaceDir = job.input.workspaceDir;
    const inputDir = path.join(workspaceDir, ".software-detail", "job-input");
    await fs.mkdir(inputDir, { recursive: true });
    const requiredFiles = [
      ["source-model", job.input.modelSlxPath],
      ["model-data", job.input.modelMatPath]
    ];
    const artifacts = [];
    for (const [role, filePath] of requiredFiles) {
      const relativePath = relativeToWorkspace(workspaceDir, filePath);
      const stat = await fs.stat(withinWorkspace(workspaceDir, relativePath)).catch(
        () => null
      );
      if (!stat?.isFile()) {
        throw serviceError(
          "software_detail_input_missing",
          `Software-detail input is missing: ${role}.`,
          { role }
        );
      }
      artifacts.push({ role, relativePath });
    }
    if (job.input.modelInitScriptPath) {
      const relativePath = relativeToWorkspace(
        workspaceDir,
        job.input.modelInitScriptPath
      );
      const stat = await fs.stat(withinWorkspace(workspaceDir, relativePath)).catch(
        () => null
      );
      if (!stat?.isFile()) {
        throw serviceError(
          "software_detail_input_missing",
          "Software-detail model initialization script is missing.",
          { role: "model-init-script" }
        );
      }
      artifacts.push({ role: "model-init-script", relativePath });
    }

    const projectPath = path.join(inputDir, "project-selection.json");
    await writeJson(projectPath, {
      schema: PROJECT_SELECTION_SCHEMA,
      jobId: job.jobId,
      project: job.input.unitTestProject || null,
      addon: {
        copiedFileCount: Number(job.input.projectAddonCopy?.copiedFileCount || 0),
        projectInitScripts: Array.isArray(job.input.projectInitScripts)
          ? job.input.projectInitScripts
          : []
      }
    });
    artifacts.push({
      role: "project-selection",
      relativePath: relativeToWorkspace(workspaceDir, projectPath)
    });

    const workerPath = path.join(inputDir, "worker-selection.json");
    await writeJson(workerPath, {
      schema: WORKER_SELECTION_SCHEMA,
      jobId: job.jobId,
      worker: {
        id: String(
          job.input.workerSelection?.id ||
            job.input.workerId ||
            "selected-worker"
        ).trim(),
        label: String(job.input.workerSelection?.label || "").trim()
      }
    });
    artifacts.push({
      role: "worker-selection",
      relativePath: relativeToWorkspace(workspaceDir, workerPath)
    });
    return artifacts;
  }

  stageInputArtifacts(job, definition) {
    return definition.inputs.map((specification) => {
      if (specification.sourceStageId === "job-input") {
        const artifact = job.inputArtifacts.find(
          (candidate) => candidate.role === specification.role
        );
        if (!artifact && specification.required) {
          throw serviceError(
            "software_detail_required_artifact_missing",
            `Software-detail job input is missing: ${specification.role}.`
          );
        }
        return artifact
          ? {
              role: artifact.role,
              relativePath: artifact.relativePath,
              sourceStageId: "job-input",
              sourceAttempt: 0
            }
          : null;
      }
      const source = job.stages.find(
        (stage) => stage.id === specification.sourceStageId
      );
      if (source?.status !== "completed" || !source.checkpoint) {
        throw serviceError(
          "software_detail_upstream_unverified",
          `Software-detail upstream stage is not verified: ${specification.sourceStageId}.`
        );
      }
      if (
        source.checkpoint.stageId !== source.id ||
        !Number.isSafeInteger(source.checkpoint.attempt) ||
        source.checkpoint.attempt < 1 ||
        source.checkpoint.attempt !== source.attempt
      ) {
        throw serviceError(
          "software_detail_upstream_provenance_invalid",
          `Software-detail upstream provenance is invalid: ${specification.sourceStageId}.`
        );
      }
      const artifact = source.checkpoint.artifacts.find(
        (candidate) => candidate.role === specification.role
      );
      if (!artifact && specification.required) {
        throw serviceError(
          "software_detail_required_artifact_missing",
          `Software-detail upstream artifact is missing: ${specification.role}.`
        );
      }
      return artifact
        ? {
            role: artifact.role,
            relativePath: artifact.relativePath,
            sourceStageId: source.id,
            sourceAttempt: source.checkpoint.attempt
          }
        : null;
    }).filter(Boolean);
  }

  attemptPaths(job, definition, attempt) {
    const directory = path.join(
      job.input.workspaceDir,
      ".software-detail",
      "stages",
      definition.id,
      `attempt-${attempt}`
    );
    return {
      directory,
      manifestPath: path.join(directory, "stage-input.json"),
      candidateResultPath: path.join(directory, "candidate-result.json"),
      checkpointPath: path.join(directory, "checkpoint.json"),
      authoritativeCheckpointPath: path.join(
        job.input.workspaceDir,
        ".software-detail",
        "checkpoints",
        `${definition.id}.json`
      )
    };
  }

  async createLease(job, leaseArtifact) {
    const lease = await this.leaseClient.createJobLease(job.resources);
    job.resources = {
      ownerJobId: lease.ownerJobId,
      workspaceId: lease.workspaceId,
      leaseId: lease.leaseId,
      matlabSessionId: lease.matlabSessionId,
      leaseStatus: "active"
    };
    job.matlabSessionId = lease.matlabSessionId;
    const absolutePath = withinWorkspace(
      job.input.workspaceDir,
      leaseArtifact.relativePath
    );
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await writeJson(absolutePath, {
      schema: "software-detail-matlab-session-lease/v1",
      jobId: job.jobId,
      ownerJobId: lease.ownerJobId,
      workspaceId: lease.workspaceId,
      leaseId: lease.leaseId,
      matlabSessionId: lease.matlabSessionId,
      lifecycle: "task-owned",
      status: "active"
    });
    await this.save(job);
    return lease;
  }

  async closeLease(job, options = {}) {
    if (
      !job?.resources?.matlabSessionId ||
      job.resources.leaseStatus === "closed"
    ) {
      return null;
    }
    try {
      const closed = await this.leaseClient.closeJobLease(job.resources);
      job.resources.leaseStatus = "closed";
      job.resources.closedAt = this.now();
      job.resources.closeConfirmed = closed.confirmed === true;
      job.matlabSessionCleaned = closed.confirmed === true;
      await this.save(job);
      return closed;
    } catch (cause) {
      job.resources.cleanupError = {
        code: String(
          cause?.code || "software_detail_gateway_close_failed"
        )
      };
      await this.save(job);
      if (options.required) throw cause;
      return null;
    }
  }

  async validateCandidate(job, definition, attempt, paths, expectedBindings) {
    const candidate = await readJsonStrict(
      paths.candidateResultPath,
      "software_detail_candidate_result_missing",
      "Software-detail candidate result is missing or non-JSON."
    );
    if (
      candidate.jobId !== job.jobId ||
      candidate.stageId !== definition.id ||
      Number(candidate.attempt) !== attempt
    ) {
      throw serviceError(
        "software_detail_candidate_identity_mismatch",
        "Software-detail candidate result identity does not match the stage."
      );
    }
    const artifacts = candidateArtifacts(
      candidate,
      definition,
      expectedBindings
    );
    const validated = [];
    for (const artifact of artifacts) {
      validated.push(
        await validateArtifact(job.input.workspaceDir, artifact)
      );
    }
    if (definition.order === 900) {
      const docxArtifact = validated.find((artifact) => artifact.role === "detail-design-docx");
      const manifestArtifact = artifacts.find((artifact) => artifact.role === "artifact-manifest");
      validateFinalArtifactManifest(
        await readJsonStrict(
          withinWorkspace(job.input.workspaceDir, manifestArtifact.relativePath),
          "software_detail_invalid_artifact_manifest",
          "Software-detail artifact manifest is unreadable."
        ),
        {
          jobId: job.jobId,
          stageId: definition.id,
          attempt,
          contentCheckStage: job.stages.find(
            (stage) => stage.id === "software-detail-stage-08-content-check"
          ),
          docxArtifact
        }
      );
    }
    if (definition.order === 200) {
      const hierarchyArtifact = artifacts.find(
        (artifact) => artifact.role === "hierarchy-manifest"
      );
      const queueArtifact = artifacts.find(
        (artifact) => artifact.role === "analysis-queue"
      );
      validateSoftwareDetailModelPlanArtifacts(
        await readJsonStrict(
          withinWorkspace(job.input.workspaceDir, hierarchyArtifact.relativePath),
          "software_detail_invalid_model_plan_artifacts",
          "Software-detail hierarchy manifest is unreadable."
        ),
        await readJsonStrict(
          withinWorkspace(job.input.workspaceDir, queueArtifact.relativePath),
          "software_detail_invalid_model_plan_artifacts",
          "Software-detail analysis queue is unreadable."
        )
      );
    }
    if (definition.order === 300) {
      const hierarchyArtifact = checkpointArtifact(
        job,
        "software-detail-stage-02-model-plan",
        "hierarchy-manifest"
      );
      const queueArtifact = checkpointArtifact(
        job,
        "software-detail-stage-02-model-plan",
        "analysis-queue"
      );
      const evidenceArtifact = artifacts.find(
        (artifact) => artifact.role === "evidence-shards"
      );
      if (!hierarchyArtifact || !queueArtifact || !evidenceArtifact) {
        throw serviceError(
          "software_detail_invalid_evidence_artifacts",
          "Software-detail evidence validation inputs are missing."
        );
      }
      validateSoftwareDetailEvidenceArtifacts(
        await readJsonStrict(
          withinWorkspace(job.input.workspaceDir, hierarchyArtifact.relativePath),
          "software_detail_invalid_model_plan_artifacts",
          "Software-detail hierarchy manifest is unreadable."
        ),
        await readJsonStrict(
          withinWorkspace(job.input.workspaceDir, queueArtifact.relativePath),
          "software_detail_invalid_model_plan_artifacts",
          "Software-detail analysis queue is unreadable."
        ),
        await readJsonStrict(
          withinWorkspace(job.input.workspaceDir, evidenceArtifact.relativePath),
          "software_detail_invalid_evidence_artifacts",
          "Software-detail evidence shards are unreadable."
        )
      );
    }
    return { candidate, artifacts: validated };
  }

  async executeStage(job, definition) {
    const inputArtifacts = this.stageInputArtifacts(job, definition);
    for (const artifact of inputArtifacts) {
      const absolutePath = withinWorkspace(
        job.input.workspaceDir,
        artifact.relativePath
      );
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat?.isFile()) {
        throw serviceError(
          "software_detail_upstream_artifact_missing",
          `Software-detail stage input file is missing: ${artifact.role}.`
        );
      }
      if (path.extname(absolutePath).toLowerCase() === ".json") {
        await readJsonStrict(
          absolutePath,
          "software_detail_upstream_artifact_invalid",
          `Software-detail stage input is non-JSON: ${artifact.role}.`
        );
      }
    }

    const started = startSoftwareDetailStage(job, {
      stageId: definition.id,
      matlabSessionId:
        definition.order === 100 ? "" : job.resources.matlabSessionId,
      artifacts: inputArtifacts
    });
    Object.assign(job, structuredClone(started.job));
    const stage = job.stages.find((item) => item.id === definition.id);
    stage.startedAt = this.now();
    stage.endedAt = "";
    stage.error = null;
    const attempt = stage.attempt;
    const paths = this.attemptPaths(job, definition, attempt);
    const expectedBindings = outputBindings(definition, job);
    await fs.mkdir(paths.directory, { recursive: true });

    let lease = job.resources.leaseStatus === "active" ? job.resources : null;
    if (definition.order === 100) {
      const leaseArtifact = expectedBindings.find(
        (artifact) => artifact.role === "matlab-session-lease"
      );
      lease = await this.createLease(job, leaseArtifact);
    } else {
      lease = await this.leaseClient.getJobLease(job.resources);
      if (lease.matlabSessionId !== job.matlabSessionId) {
        throw serviceError(
          "software_detail_matlab_session_mismatch",
          "MATLAB lease no longer identifies the job session."
        );
      }
    }

    const execution = await this.executor.execute({
      definition,
      job,
      stageInput: stage.input,
      manifestPath: paths.manifestPath,
      candidateResultPath: paths.candidateResultPath,
      outputArtifacts: expectedBindings,
      lease,
      gatewayEnvironment: this.leaseClient.hermesEnvironment(lease)
    });
    const sessionId = assertSoftwareDetailHermesSessionUnused(
      execution.sessionId,
      job.hermesSessionIds
    );
    if (definition.order === 100) {
      const leaseArtifact = expectedBindings.find(
        (artifact) => artifact.role === "matlab-session-lease"
      );
      await this.createLeaseArtifact(job, leaseArtifact);
    }
    let artifacts;
    try {
      ({ artifacts } = await this.validateCandidate(
        job,
        definition,
        attempt,
        paths,
        expectedBindings
      ));
    } catch (cause) {
      cause.details = {
        ...(cause.details || {}),
        stageId: definition.id,
        sessionId
      };
      throw cause;
    }
    if (definition.order === 900) {
      await this.closeLease(job, { required: true });
    }

    const rawResult = {
      schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
      jobId: job.jobId,
      stageId: definition.id,
      attempt,
      status: "completed",
      matlabSessionId: lease.matlabSessionId,
      matlabSessionClosed: definition.order === 900,
      hermesSessionId: sessionId,
      artifacts: artifacts.map(({ role, relativePath }) => ({
        role,
        relativePath
      }))
    };
    const finished = finishSoftwareDetailStage(job, rawResult);
    Object.assign(job, structuredClone(finished.job));
    const finishedStage = job.stages.find(
      (item) => item.id === definition.id
    );
    finishedStage.startedAt = stage.startedAt;
    finishedStage.endedAt = this.now();
    finishedStage.attempts = [
      ...(stage.attempts || []),
      {
        attempt,
        status: "completed",
        sessionId,
        startedAt: stage.startedAt,
        endedAt: finishedStage.endedAt
      }
    ];
    const checkpoint = {
      schema: CHECKPOINT_SCHEMA,
      pipelineSchema: SOFTWARE_DETAIL_JOB_SCHEMA,
      jobId: job.jobId,
      stageId: definition.id,
      attempt,
      status: "completed",
      input: {
        path: relativeToWorkspace(
          job.input.workspaceDir,
          paths.manifestPath
        ),
        artifacts: inputArtifacts
      },
      candidate: {
        path: relativeToWorkspace(
          job.input.workspaceDir,
          paths.candidateResultPath
        ),
        sha256: await sha256File(paths.candidateResultPath)
      },
      agent: {
        sessionId,
        profile: execution.profile || "",
        durationMs: Number(execution.durationMs || 0),
        stdoutBytes: Number(execution.stdoutBytes || 0),
        stderrBytes: Number(execution.stderrBytes || 0)
      },
      matlab: {
        ownerJobId: lease.ownerJobId,
        workspaceId: lease.workspaceId,
        leaseId: lease.leaseId,
        matlabSessionId: lease.matlabSessionId,
        closed: definition.order === 900
      },
      artifacts,
      startedAt: stage.startedAt,
      endedAt: finishedStage.endedAt
    };
    await fs.mkdir(path.dirname(paths.checkpointPath), { recursive: true });
    await writeJson(paths.checkpointPath, checkpoint);
    await fs.mkdir(path.dirname(paths.authoritativeCheckpointPath), {
      recursive: true
    });
    await writeJson(paths.authoritativeCheckpointPath, checkpoint);
    finishedStage.checkpoint = checkpoint;
    job.checkpoints = [
      ...job.checkpoints.filter((item) => item.stageId !== definition.id),
      {
        stageId: definition.id,
        path: relativeToWorkspace(
          job.input.workspaceDir,
          paths.authoritativeCheckpointPath
        ),
        verifiedAt: this.now()
      }
    ];
    if (definition.order === 900) {
      job.artifacts = artifacts;
    }
    await this.save(job);
    return checkpoint;
  }

  async createLeaseArtifact(job, leaseArtifact) {
    const absolutePath = withinWorkspace(
      job.input.workspaceDir,
      leaseArtifact.relativePath
    );
    await writeJson(absolutePath, {
      schema: "software-detail-matlab-session-lease/v1",
      jobId: job.jobId,
      ownerJobId: job.resources.ownerJobId,
      workspaceId: job.resources.workspaceId,
      leaseId: job.resources.leaseId,
      matlabSessionId: job.resources.matlabSessionId,
      lifecycle: "task-owned",
      status: job.resources.leaseStatus
    });
  }

  async run(jobId) {
    if (this.running.has(jobId)) return this.running.get(jobId);
    const promise = (async () => {
      const job = await this.get(jobId);
      if (!job || isTerminal(job.status)) return job;
      try {
        for (const definition of listSoftwareDetailStages()) {
          const stage = job.stages.find((item) => item.id === definition.id);
          if (stage.status === "completed") continue;
          if (stage.status !== "pending") {
            throw serviceError(
              "software_detail_restart_resume_unsupported",
              "Software-detail automatic stage resume is not supported.",
              { stageId: definition.id }
            );
          }
          await this.executeStage(job, definition);
        }
        job.status = "completed";
        job.completedAt = this.now();
        await this.save(job);
        return job;
      } catch (cause) {
        const stage = job.stages.find((item) => item.status === "running");
        const error = safeError(cause, stage?.id || "");
        if (stage) {
          stage.status = "failed";
          stage.endedAt = this.now();
          stage.error = error;
          stage.attempts = [
            ...(stage.attempts || []),
            {
              attempt: stage.attempt,
              status: "failed",
              sessionId: String(cause?.details?.sessionId || ""),
              endedAt: stage.endedAt,
              error
            }
          ];
        }
        job.status = "failed";
        job.error = error;
        await this.closeLease(job, { required: false });
        await this.save(job);
        return job;
      } finally {
        this.running.delete(jobId);
      }
    })();
    this.running.set(jobId, promise);
    return promise;
  }
}

export {
  CHECKPOINT_SCHEMA as SOFTWARE_DETAIL_STAGE_CHECKPOINT_SCHEMA,
  isTerminal as isTerminalSoftwareDetailJobStatus
};
