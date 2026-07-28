import {
  getSoftwareDetailStage,
  listSoftwareDetailStages
} from "./software-detail-stage-catalog.js";

export const SOFTWARE_DETAIL_JOB_SCHEMA = "software-detail-minimal-job/v1";
export const SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA = "software-detail-minimal-stage-input/v1";
export const SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA = "software-detail-minimal-stage-result/v1";

export const SOFTWARE_DETAIL_JOB_STATUSES = Object.freeze([
  "queued",
  "running",
  "completed",
  "failed"
]);

export const SOFTWARE_DETAIL_STAGE_STATUSES = Object.freeze([
  "pending",
  "running",
  "completed",
  "failed"
]);

const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9-]{1,79}$/;

function contractError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value, field, pattern, maxLength = 500) {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    (pattern && !pattern.test(normalized))
  ) {
    throw contractError("software_detail_invalid_field", `${field} 非法`, { field });
  }
  return normalized;
}

function normalizeAttempt(value) {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 100) {
    throw contractError("software_detail_invalid_attempt", "attempt 非法");
  }
  return attempt;
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
    throw contractError(
      "software_detail_invalid_artifact_path",
      "artifact relativePath 非法"
    );
  }
  return normalized;
}

function normalizeSessionId(value, field) {
  return requiredText(value, field, SESSION_ID_PATTERN, 200);
}

function normalizeOptionalSessionId(value, field) {
  const normalized = String(value || "").trim();
  return normalized ? normalizeSessionId(normalized, field) : "";
}

function normalizeArtifacts(rawArtifacts, specifications, options = {}) {
  if (!Array.isArray(rawArtifacts)) {
    throw contractError(
      "software_detail_invalid_artifacts",
      `${options.label || "artifacts"} 必须是数组`
    );
  }
  const specificationsByRole = new Map(
    specifications.map((specification) => [specification.role, specification])
  );
  const seen = new Set();
  const artifacts = rawArtifacts.map((artifact) => {
    if (!isPlainObject(artifact)) {
      throw contractError(
        "software_detail_invalid_artifact",
        `${options.label || "artifacts"} 包含非法项`
      );
    }
    const role = requiredText(artifact.role, "artifact.role", ROLE_PATTERN, 80);
    if (!specificationsByRole.has(role) || seen.has(role)) {
      throw contractError(
        "software_detail_invalid_artifact_role",
        `artifact role 未声明或重复: ${role}`,
        { role }
      );
    }
    seen.add(role);
    return Object.freeze({
      role,
      relativePath: normalizeRelativePath(artifact.relativePath)
    });
  });

  if (options.requireAll !== false) {
    for (const specification of specifications) {
      if (specification.required && !seen.has(specification.role)) {
        throw contractError(
          "software_detail_required_artifact_missing",
          `缺少 required artifact: ${specification.role}`,
          { role: specification.role }
        );
      }
    }
  }
  return Object.freeze(artifacts);
}

function stageIdentity(value = {}) {
  const jobId = requiredText(value.jobId, "jobId", JOB_ID_PATTERN, 128);
  const stageId = requiredText(value.stageId, "stageId", null, 80);
  const definition = getSoftwareDetailStage(stageId);
  if (!definition) {
    throw contractError(
      "software_detail_unknown_stage",
      `未知 stageId: ${stageId}`,
      { stageId }
    );
  }
  return {
    jobId,
    stageId,
    definition,
    attempt: normalizeAttempt(value.attempt)
  };
}

export function validateSoftwareDetailStageInput(input = {}, options = {}) {
  if (!isPlainObject(input) || input.schema !== SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA) {
    throw contractError(
      "software_detail_invalid_stage_input",
      "stage input schema 非法"
    );
  }
  const identity = stageIdentity(input);
  if (input.status !== "running") {
    throw contractError(
      "software_detail_invalid_stage_status",
      "stage input status 必须是 running"
    );
  }
  const isInitializeStage = identity.definition.order === 100;
  const matlabSessionId = isInitializeStage
    ? normalizeOptionalSessionId(input.matlabSessionId, "matlabSessionId")
    : normalizeSessionId(input.matlabSessionId, "matlabSessionId");
  if (isInitializeStage && matlabSessionId) {
    throw contractError(
      "software_detail_matlab_session_already_initialized",
      "阶段 1 启动时不得预置 MATLAB session"
    );
  }
  if (
    !isInitializeStage &&
    (!options.expectedMatlabSessionId ||
      matlabSessionId !== options.expectedMatlabSessionId)
  ) {
    throw contractError(
      "software_detail_matlab_session_mismatch",
      "stage input 未复用 job 的 MATLAB session"
    );
  }
  return Object.freeze({
    schema: SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA,
    jobId: identity.jobId,
    stageId: identity.stageId,
    attempt: identity.attempt,
    status: "running",
    matlabSessionId,
    artifacts: normalizeArtifacts(input.artifacts, identity.definition.inputs, {
      label: "input artifacts"
    })
  });
}

export function assertSoftwareDetailHermesSessionUnused(
  hermesSessionId,
  usedHermesSessionIds = []
) {
  const normalized = normalizeSessionId(hermesSessionId, "hermesSessionId");
  const used = new Set(
    (Array.isArray(usedHermesSessionIds) ? usedHermesSessionIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  if (used.has(normalized)) {
    throw contractError(
      "software_detail_hermes_session_reused",
      "Hermes sessionId 不得跨 stage 或 attempt 复用",
      { hermesSessionId: normalized }
    );
  }
  return normalized;
}

export function validateSoftwareDetailStageResult(result = {}, options = {}) {
  if (!isPlainObject(result) || result.schema !== SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA) {
    throw contractError(
      "software_detail_invalid_stage_result",
      "stage result schema 非法"
    );
  }
  const identity = stageIdentity(result);
  if (!["completed", "failed"].includes(result.status)) {
    throw contractError(
      "software_detail_invalid_stage_status",
      "stage result status 必须是 completed 或 failed"
    );
  }
  const isInitializeStage = identity.definition.order === 100;
  const matlabSessionId =
    isInitializeStage && result.status === "failed"
      ? normalizeOptionalSessionId(result.matlabSessionId, "matlabSessionId")
      : normalizeSessionId(result.matlabSessionId, "matlabSessionId");
  if (isInitializeStage && result.status === "failed" && matlabSessionId) {
    throw contractError(
      "software_detail_matlab_session_cleanup_required",
      "阶段 1 失败结果只能表示尚未创建 MATLAB session"
    );
  }
  if (
    !isInitializeStage &&
    (!options.expectedMatlabSessionId ||
      matlabSessionId !== options.expectedMatlabSessionId)
  ) {
    throw contractError(
      "software_detail_matlab_session_mismatch",
      "stage result 未复用 job 的 MATLAB session"
    );
  }

  if (!identity.definition.hermesSessionRequired) {
    throw contractError(
      "software_detail_invalid_stage_definition",
      "stage 必须要求独立 Hermes session"
    );
  }
  const hermesSessionId = assertSoftwareDetailHermesSessionUnused(
    result.hermesSessionId,
    options.usedHermesSessionIds
  );

  const isFinalStage = identity.definition.order === 900;
  if (
    result.status === "completed" &&
    result.matlabSessionClosed !== isFinalStage
  ) {
    throw contractError(
      "software_detail_matlab_session_cleanup_invalid",
      isFinalStage
        ? "阶段 9 完成前必须清理 MATLAB session"
        : "只有阶段 9 可以清理 MATLAB session"
    );
  }

  return Object.freeze({
    schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
    jobId: identity.jobId,
    stageId: identity.stageId,
    attempt: identity.attempt,
    status: result.status,
    matlabSessionId,
    matlabSessionClosed: result.status === "completed" && isFinalStage,
    hermesSessionId,
    artifacts: normalizeArtifacts(result.artifacts || [], identity.definition.outputs, {
      label: "result artifacts",
      requireAll: result.status === "completed"
    })
  });
}

export function createSoftwareDetailPipelineJob(input = {}) {
  const jobId = requiredText(input.jobId, "jobId", JOB_ID_PATTERN, 128);
  return {
    schema: SOFTWARE_DETAIL_JOB_SCHEMA,
    jobId,
    status: "queued",
    matlabSessionId: "",
    matlabSessionCleaned: false,
    hermesSessionIds: [],
    stages: listSoftwareDetailStages().map((definition) => ({
      id: definition.id,
      order: definition.order,
      status: "pending",
      attempt: 0,
      input: null,
      result: null
    }))
  };
}

function assertJobShape(job = {}) {
  if (
    !isPlainObject(job) ||
    job.schema !== SOFTWARE_DETAIL_JOB_SCHEMA ||
    !SOFTWARE_DETAIL_JOB_STATUSES.includes(job.status)
  ) {
    throw contractError("software_detail_invalid_job", "job schema 或 status 非法");
  }
  requiredText(job.jobId, "jobId", JOB_ID_PATTERN, 128);
  const definitions = listSoftwareDetailStages();
  if (!Array.isArray(job.stages) || job.stages.length !== definitions.length) {
    throw contractError("software_detail_invalid_job", "job stages 非法");
  }
  for (let index = 0; index < definitions.length; index += 1) {
    const stage = job.stages[index];
    const definition = definitions[index];
    if (
      !isPlainObject(stage) ||
      stage.id !== definition.id ||
      stage.order !== definition.order ||
      !SOFTWARE_DETAIL_STAGE_STATUSES.includes(stage.status) ||
      !Number.isInteger(stage.attempt) ||
      stage.attempt < 0
    ) {
      throw contractError(
        "software_detail_invalid_job",
        `job stage 非法: ${definition.id}`
      );
    }
  }
  if (!Array.isArray(job.hermesSessionIds)) {
    throw contractError("software_detail_invalid_job", "hermesSessionIds 必须是数组");
  }
  const normalizedSessions = job.hermesSessionIds.map((sessionId) =>
    normalizeSessionId(sessionId, "hermesSessionIds")
  );
  if (new Set(normalizedSessions).size !== normalizedSessions.length) {
    throw contractError(
      "software_detail_hermes_session_reused",
      "job 中存在重复 Hermes sessionId"
    );
  }
}

function nextIncompleteStageIndex(job) {
  let firstIncomplete = -1;
  for (let index = 0; index < job.stages.length; index += 1) {
    const stage = job.stages[index];
    if (stage.status !== "completed" && firstIncomplete === -1) {
      firstIncomplete = index;
      continue;
    }
    if (firstIncomplete !== -1 && stage.status === "completed") {
      throw contractError(
        "software_detail_non_contiguous_progress",
        "completed stages 必须连续"
      );
    }
  }
  return firstIncomplete;
}

export function startSoftwareDetailStage(job = {}, request = {}) {
  assertJobShape(job);
  if (!["queued", "running"].includes(job.status)) {
    throw contractError(
      "software_detail_job_not_runnable",
      "只有 queued/running job 可以启动 stage"
    );
  }
  const nextIndex = nextIncompleteStageIndex(job);
  if (nextIndex < 0) {
    throw contractError("software_detail_job_complete", "所有 stage 已完成");
  }
  const next = structuredClone(job);
  const stage = next.stages[nextIndex];
  if (request.stageId !== stage.id || stage.status !== "pending") {
    throw contractError(
      "software_detail_stage_out_of_order",
      `下一阶段必须是 ${stage.id}`
    );
  }

  const isInitializeStage = nextIndex === 0;
  const requestedMatlabSessionId = isInitializeStage
    ? normalizeOptionalSessionId(request.matlabSessionId, "matlabSessionId")
    : normalizeSessionId(request.matlabSessionId, "matlabSessionId");
  if (
    (isInitializeStage &&
      (next.matlabSessionId || next.matlabSessionCleaned || requestedMatlabSessionId)) ||
    (!isInitializeStage &&
      (!next.matlabSessionId ||
        next.matlabSessionCleaned ||
        requestedMatlabSessionId !== next.matlabSessionId))
  ) {
    throw contractError(
      "software_detail_matlab_session_mismatch",
      "stage 必须复用 task-owned MATLAB session"
    );
  }

  const input = validateSoftwareDetailStageInput(
    {
      schema: SOFTWARE_DETAIL_STAGE_INPUT_SCHEMA,
      jobId: next.jobId,
      stageId: stage.id,
      attempt: stage.attempt + 1,
      status: "running",
      matlabSessionId: requestedMatlabSessionId,
      artifacts: request.artifacts
    },
    {
      expectedMatlabSessionId: isInitializeStage
        ? undefined
        : next.matlabSessionId
    }
  );
  stage.status = "running";
  stage.attempt = input.attempt;
  stage.input = input;
  stage.result = null;
  next.status = "running";
  return Object.freeze({ job: next, input });
}

export function finishSoftwareDetailStage(job = {}, rawResult = {}) {
  assertJobShape(job);
  if (job.status !== "running") {
    throw contractError(
      "software_detail_job_not_running",
      "只有 running job 可以结束 stage"
    );
  }
  const stageIndex = job.stages.findIndex((stage) => stage.id === rawResult.stageId);
  if (stageIndex < 0 || job.stages[stageIndex].status !== "running") {
    throw contractError(
      "software_detail_stage_not_running",
      "只能结束当前 running stage"
    );
  }
  const currentStage = job.stages[stageIndex];
  if (
    rawResult.jobId !== job.jobId ||
    Number(rawResult.attempt) !== currentStage.attempt
  ) {
    throw contractError(
      "software_detail_stage_result_mismatch",
      "stage result 与当前 job/attempt 不一致"
    );
  }
  const result = validateSoftwareDetailStageResult(rawResult, {
    expectedMatlabSessionId: stageIndex === 0 ? undefined : job.matlabSessionId,
    usedHermesSessionIds: job.hermesSessionIds
  });
  const next = structuredClone(job);
  const stage = next.stages[stageIndex];
  stage.status = result.status;
  stage.result = result;
  next.hermesSessionIds.push(result.hermesSessionId);
  if (stageIndex === 0 && result.status === "completed") {
    next.matlabSessionId = result.matlabSessionId;
  }
  if (result.status === "failed") {
    next.status = "failed";
    return Object.freeze({ job: next, result });
  }
  if (stageIndex === next.stages.length - 1) {
    next.matlabSessionCleaned = true;
    next.status = "completed";
  } else {
    next.status = "running";
  }
  return Object.freeze({ job: next, result });
}

export function getSoftwareDetailResumePoint(job = {}) {
  assertJobShape(job);
  const nextIndex = nextIncompleteStageIndex(job);
  if (nextIndex < 0) {
    return Object.freeze({
      lastCompletedStageId: job.stages.at(-1).id,
      nextStageId: "",
      nextAttempt: 0
    });
  }
  return Object.freeze({
    lastCompletedStageId: nextIndex > 0 ? job.stages[nextIndex - 1].id : "",
    nextStageId: job.stages[nextIndex].id,
    nextAttempt: job.stages[nextIndex].attempt + 1
  });
}

export function prepareSoftwareDetailJobForResume(job = {}) {
  const resumePoint = getSoftwareDetailResumePoint(job);
  if (!resumePoint.nextStageId) {
    return Object.freeze({ job: structuredClone(job), resumePoint });
  }
  const resumeIndex = job.stages.findIndex(
    (stage) => stage.id === resumePoint.nextStageId
  );
  if (
    resumeIndex > 0 &&
    (!job.matlabSessionId || job.matlabSessionCleaned)
  ) {
    throw contractError(
      "software_detail_matlab_session_unavailable",
      "恢复前 task-owned MATLAB session 必须仍可复用"
    );
  }
  const next = structuredClone(job);
  for (let index = resumeIndex; index < next.stages.length; index += 1) {
    const stage = next.stages[index];
    stage.status = "pending";
    stage.input = null;
    stage.result = null;
  }
  next.status = "running";
  return Object.freeze({ job: next, resumePoint });
}
