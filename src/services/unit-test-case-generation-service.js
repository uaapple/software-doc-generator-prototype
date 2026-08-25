import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { HermesAgentClient } from "./hermes-agent-client.js";
import { readJson, writeJson, pathExists } from "./storage.js";
import { TCSD_PIPELINE_SCHEMA } from "./tcsd-pipeline-contract.js";
import { normalizeUploadedFileName } from "./upload-filename.js";
import { openZipArchive } from "./zip-archive.js";

const TASK_FILE_NAME = "task.json";
const PROJECTS_FILE_NAME = "projects.json";
const QUEUE_TYPE = "unit_test_case_generation";
const STEP_TYPE = "tcsd_stage_execute";
const PROJECT_ID_PATTERN = /^\d{2,}$/;

function now() {
  return new Date().toISOString();
}

function finalWorkbookFileName(task = {}) {
  const modelFileName = task.inputs?.modelSlx?.originalName || task.inputs?.modelSlx?.workspaceName || "Model.slx";
  return `${path.basename(modelFileName, path.extname(modelFileName))}_Test0001_tcsd.xlsx`;
}

function createHttpError(message, statusCode = 400, code = "unit_test_case_generation_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function unitTestCaseConfig() {
  return {
    taskStoreDir: config.unitTestCase?.taskStoreDir || path.join(config.dataDir, "unit-test-case-generation", "tasks"),
    uploadTempDir: config.unitTestCase?.uploadTempDir || path.join(config.dataDir, "unit-test-case-generation", "_incoming"),
    projectRegistryPath: config.unitTestCase?.projectRegistryPath || path.join(config.dataDir, "unit-test-case-generation", PROJECTS_FILE_NAME),
    projectAdminCode: String(config.unitTestCase?.projectAdminCode || "114301"),
    defaultProjects: config.unitTestCase?.defaultProjects || "01_楚能,02_TMS",
    pipelineName: config.unitTestCase?.pipelineName || "tcsd-stage-skills",
    expectedOutputPattern: config.unitTestCase?.expectedOutputPattern || "outputs/*_tcsd.xlsx",
    agentWorkspaceRoot: String(config.unitTestCase?.agentWorkspaceRoot || "").trim(),
    defaultWorkerId: String(config.unitTestCase?.defaultWorkerId || "").trim(),
    workerProfiles: Array.isArray(config.unitTestCase?.workerProfiles) ? config.unitTestCase.workerProfiles : []
  };
}

function normalizeProjectName(value = "") {
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 60);
}

function normalizeProjectId(value = "") {
  return String(value || "").trim();
}

function normalizeProjectRecord(project = {}) {
  project ||= {};
  const id = normalizeProjectId(project.id);
  const name = normalizeProjectName(project.name || String(project.label || "").replace(/^\d{2,}_/, ""));
  if (!PROJECT_ID_PATTERN.test(id) || !name) {
    return null;
  }
  return {
    id,
    name,
    label: `${id}_${name}`
  };
}

function parseDefaultProjects(value = "") {
  const projects = String(value || "01_楚能,02_TMS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d{2,})_(.+)$/);
      if (!match) {
        return null;
      }
      return normalizeProjectRecord({ id: match[1], name: match[2] });
    })
    .filter(Boolean);
  return projects.length ? projects : [
    { id: "01", name: "楚能", label: "01_楚能" },
    { id: "02", name: "TMS", label: "02_TMS" }
  ];
}

function buildProjectRegistry(projects = []) {
  const normalized = [];
  const seen = new Set();
  for (const project of projects) {
    const record = normalizeProjectRecord(project);
    if (!record || seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    normalized.push(record);
  }
  normalized.sort((a, b) => a.id.localeCompare(b.id, "zh-CN", { numeric: true }));
  const maxNumber = normalized.reduce((max, project) => Math.max(max, Number(project.id) || 0), 0);
  return {
    version: 1,
    nextProjectNumber: Math.max(1, maxNumber + 1),
    projects: normalized
  };
}

function publicProject(project = {}) {
  const normalized = normalizeProjectRecord(project);
  return normalized ? { ...normalized } : null;
}

function defaultLegacyProject() {
  return (
    parseDefaultProjects(unitTestCaseConfig().defaultProjects).find((project) => project.id === "01") ||
    { id: "01", name: "楚能", label: "01_楚能" }
  );
}

function normalizeTaskProjectSnapshot(project = null) {
  return publicProject(project) || defaultLegacyProject();
}

export function publicUnitTestWorkerProfile(profile = {}) {
  const id = String(profile?.id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    label: String(profile.label || id).trim() || id,
    isDefault: Boolean(profile.isDefault),
    hermesBaseURL: String(profile.hermesBaseURL || "").trim(),
    hermesApiMode: String(profile.hermesApiMode || "json").trim() || "json",
    matlabBaseURL: String(profile.matlabBaseURL || "").trim(),
    matlabHttpMode: String(profile.matlabHttpMode || "path").trim() || "path",
    authConfigured: {
      hermes: Boolean(profile.hermesAuthToken || profile.authConfigured?.hermes),
      matlabWorker: Boolean(profile.matlabAuthToken || profile.authConfigured?.matlabWorker)
    }
  };
}

export function listUnitTestWorkerProfiles() {
  const cfg = unitTestCaseConfig();
  const profiles = cfg.workerProfiles.map(publicUnitTestWorkerProfile).filter(Boolean);
  if (!profiles.length) {
    return [];
  }
  return profiles.map((profile) => ({
    ...profile,
    isDefault: profile.id === cfg.defaultWorkerId || profile.isDefault
  }));
}

export function resolveUnitTestWorkerProfile(workerId = "") {
  const cfg = unitTestCaseConfig();
  const requestedId = String(workerId || cfg.defaultWorkerId || "").trim();
  const profiles = cfg.workerProfiles.filter((profile) => profile?.id);
  const profile = profiles.find((item) => item.id === requestedId) || (!requestedId ? profiles[0] : null);
  if (!profile) {
    throw createHttpError("Unit test Worker is not configured.", 400, "unit_test_case_worker_not_found", { workerId: requestedId });
  }
  return profile;
}

function assertProjectAdminCode(authCode = "") {
  const expected = unitTestCaseConfig().projectAdminCode;
  if (String(authCode || "") !== expected) {
    throw createHttpError("项目授权码不正确。", 403, "unit_test_case_project_auth_failed");
  }
}

function normalizeExtension(fileName = "") {
  return path.extname(String(fileName || "").trim()).toLowerCase();
}

function sanitizeStoredFileName(originalName = "", fallbackName = "upload.bin") {
  const normalized = normalizeUploadedFileName(originalName) || fallbackName;
  const baseName = path.basename(normalized).replace(/[^\w.\-()\u4e00-\u9fa5]+/g, "_");
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}`;
}

function toMatlabModelBase(originalName = "", fallbackBase = "model") {
  const normalized = normalizeUploadedFileName(originalName) || `${fallbackBase}.slx`;
  const parsed = path.parse(path.basename(normalized));
  let base = String(parsed.name || fallbackBase)
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) {
    base = fallbackBase;
  }
  if (!/^[A-Za-z]/.test(base)) {
    base = `model_${base}`;
  }
  if (base === "ITKLib") {
    base = "model_ITKLib";
  }
  return base;
}

function displayModelBaseName(originalName = "") {
  // 展示用模型名：保留原始字符与大小写，仅去除扩展名（如 example.slx → example）。
  const normalized = normalizeUploadedFileName(originalName);
  if (!normalized) return "";
  return String(path.parse(path.basename(String(normalized))).name || "").trim();
}

function normalizeTaskFiles(files = {}) {
  return {
    modelSlx: Array.isArray(files.modelSlx) ? files.modelSlx : [],
    modelMat: Array.isArray(files.modelMat) ? files.modelMat : [],
    modelInitScript: Array.isArray(files.modelInitScript) ? files.modelInitScript : []
  };
}

function normalizeStoredRelativePath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function isWorkbookOutput(relativePath = "") {
  const normalized = normalizeStoredRelativePath(relativePath);
  if (!normalized || normalized.includes("..")) {
    return false;
  }
  const parts = normalized.split("/").filter(Boolean);
  return parts.length === 2 && parts[0] === "outputs" && parts[1].toLowerCase().endsWith(".xlsx");
}

function decodeXmlEntities(value = "") {
  return String(value || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function readXmlAttributes(fragment = "") {
  const attributes = {};
  for (const match of String(fragment || "").matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXmlEntities(match[2]);
  }
  return attributes;
}

function parseSharedStrings(xml = "") {
  return [...String(xml || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXmlEntities(text[1] || ""))
      .join("")
  );
}

function columnRefToIndex(cellRef = "") {
  const letters = String(cellRef || "").match(/[A-Za-z]+/)?.[0] || "";
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(0, index - 1);
}

function parseWorksheetRows(xml = "", sharedStrings = []) {
  const rows = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttributes = readXmlAttributes(rowMatch[1]);
    const rowNumber = Number(rowAttributes.r) || rows.length + 1;
    const values = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = readXmlAttributes(cellMatch[1]);
      const columnIndex = columnRefToIndex(attributes.r || "");
      let value = "";
      if (attributes.t === "inlineStr") {
        value = [...cellMatch[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((text) => decodeXmlEntities(text[1] || ""))
          .join("");
      } else {
        const rawValue = cellMatch[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "";
        const sharedIndex = Number(rawValue);
        value = attributes.t === "s" && Number.isInteger(sharedIndex)
          ? sharedStrings[sharedIndex] || ""
          : decodeXmlEntities(rawValue);
      }
      values[columnIndex] = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    }
    rows.push({ row: rowNumber, values });
  }
  return rows;
}

function resolveTcsdWorksheetPath(archive) {
  const workbookXml = archive.readText("xl/workbook.xml", { required: true });
  const relationshipsXml = archive.readText("xl/_rels/workbook.xml.rels", { required: true });
  const tcsdSheet = [...workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)]
    .map((match) => readXmlAttributes(match[1]))
    .find((sheet) => sheet.name === "TCSD");
  if (!tcsdSheet) {
    return "";
  }
  const relationshipId = tcsdSheet["r:id"] || tcsdSheet.id || "";
  const relationship = [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/>/g)]
    .map((match) => readXmlAttributes(match[1]))
    .find((item) => item.Id === relationshipId);
  if (!relationship?.Target) {
    return "";
  }
  const target = relationship.Target.replaceAll("\\", "/").replace(/^\/+/, "");
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function countTcsdExpValues(text = "") {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => /^\s*[A-Za-z_]\w*\s*=\s*expValue\s*\(/.test(line))
    .length;
}

async function summarizeWorkbookExpectedValues(absolutePath = "") {
  const archive = await openZipArchive(absolutePath, {
    maxArchiveBytes: 256 * 1024 * 1024,
    maxEntryUncompressedBytes: 64 * 1024 * 1024,
    maxTotalUncompressedBytes: 256 * 1024 * 1024
  });
  const worksheetPath = resolveTcsdWorksheetPath(archive);
  if (!worksheetPath) {
    return { expValueCount: 0, testCaseCount: 0, missingExpectedValueTestCases: [] };
  }
  const sharedStringsXml = archive.readText("xl/sharedStrings.xml");
  const rows = parseWorksheetRows(
    archive.readText(worksheetPath, { required: true }),
    sharedStringsXml ? parseSharedStrings(sharedStringsXml) : []
  );
  const header = rows.find((item) => item.row === 1)?.values || [];
  const headerIndex = (name, fallback) => {
    const index = header.findIndex((value) => String(value || "").trim() === name);
    return index >= 0 ? index : fallback;
  };
  const testIdColumn = headerIndex("TestID", 0);
  const typeColumn = headerIndex("Type", 2);
  const initializationColumn = headerIndex("Initialization", 5);
  const actionColumn = headerIndex("Action", 6);
  let expValueCount = 0;
  const testCases = [];
  for (const item of rows) {
    const rowType = String(item.values[typeColumn] || "").trim();
    if (rowType !== "Test" && rowType !== "TestGroup") {
      continue;
    }
    const initializationExpValueCount = countTcsdExpValues(item.values[initializationColumn]);
    const actionExpValueCount = countTcsdExpValues(item.values[actionColumn]);
    expValueCount += initializationExpValueCount + actionExpValueCount;
    if (rowType === "Test") {
      testCases.push({
        row: item.row,
        testId: String(item.values[testIdColumn] || "").trim(),
        expectedValueCount: actionExpValueCount
      });
    }
  }
  return {
    expValueCount,
    testCaseCount: testCases.length,
    missingExpectedValueTestCases: testCases.filter((item) => item.expectedValueCount < 1)
  };
}

function toPlatformPath(filePath = "") {
  return path.resolve(String(filePath || ""));
}

function usesWindowsPath(value = "") {
  return /^[a-zA-Z]:[\\/]/.test(value) || String(value || "").includes("\\");
}

function joinAgentPath(root = "", relativePath = "") {
  if (!root) {
    return "";
  }
  const normalizedRelative = normalizeStoredRelativePath(relativePath);
  if (usesWindowsPath(root)) {
    return path.win32.join(root, ...normalizedRelative.split("/").filter(Boolean));
  }
  return path.join(root, ...normalizedRelative.split("/").filter(Boolean));
}

function buildAgentPath(localPath = "", options = {}) {
  const agentRoot = String(options.agentWorkspaceRoot || "").trim();
  if (!agentRoot) {
    return localPath;
  }
  const relative = path.relative(options.localTaskStoreDir, localPath);
  return joinAgentPath(agentRoot, relative);
}

function buildProgress(status = "queued", message = "") {
  const normalizedStatus = status === "partial" ? "completed" : status;
  const progressByStatus = {
    queued: { stage: "queued", percent: 4, label: "等待执行", message: message || "任务已进入 Hermes 队列。" },
    running: { stage: "running", percent: 45, label: "Hermes 生成中", message: message || "Hermes Agent 正在生成 TCSD Excel。" },
    completed: { stage: "completed", percent: 100, label: "已完成", message: message || "TCSD Excel 已生成，可下载结果。" },
    failed: { stage: "failed", percent: 100, label: "已失败", message: message || "生成任务失败，请查看错误原因。" }
  };
  return {
    ...(progressByStatus[normalizedStatus] || progressByStatus.queued),
    updatedAt: now()
  };
}

function normalizeSuccessfulTaskStatus(status = "") {
  return status === "partial" ? "completed" : status;
}

function normalizeSuccessfulPipelineStatus(status = "") {
  return status === "部分完成" ? "已完成" : status;
}

function isQueuedWorkerPipelineStatus(status = "") {
  return ["等待执行", "queued", "pending"].includes(String(status || "").trim());
}

function clipTaskMessage(value = "", maxLength = 1800) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function safeDeliveryText(value = "", maxLength = 120) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text) ? text.slice(0, maxLength) : "";
}

function normalizeWorkerDeliveryFailure(error = {}) {
  const details = error?.details && typeof error.details === "object" && !Array.isArray(error.details)
    ? error.details
    : {};
  const retryable = error?.retryable === true || details.retryable === true;
  const httpStatus = Number(details.httpStatus || 0);
  return {
    state: retryable ? "retrying" : "blocked",
    operation: safeDeliveryText(details.operation) || "create",
    category: safeDeliveryText(details.category) || (retryable ? "network" : "request"),
    retryable,
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}),
    ...(safeDeliveryText(details.remoteCode || error?.code) ? { remoteCode: safeDeliveryText(details.remoteCode || error?.code) } : {}),
    ...(safeDeliveryText(details.prepareFailureReason) ? { prepareFailureReason: safeDeliveryText(details.prepareFailureReason) } : {}),
    ...(safeDeliveryText(details.correlationId) ? { correlationId: safeDeliveryText(details.correlationId) } : {})
  };
}

function taskFilePath(taskDir = "") {
  return path.join(taskDir, TASK_FILE_NAME);
}

function publicDiagnosticText(value = "", maxLength = 500) {
  return String(value || "")
    .replace(/[A-Za-z]:[\\/][^\s,;]+/g, "[path]")
    .replace(/(?:^|\s)\/(?:[^\s,;]+\/)+[^\s,;]*/g, " [path]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

function publicTokenUsage(value = null) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens"]) {
    const amount = Number(value[key]);
    if (Number.isSafeInteger(amount) && amount >= 0) result[key] = amount;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function publicExecutionMessage(status = "", code = "") {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedCode = safeDeliveryText(code, 160);
  if (["failed", "error", "blocked"].includes(normalizedStatus)) {
    return normalizedCode ? `执行失败（${normalizedCode}）。` : "执行失败。";
  }
  if (["running", "processing", "in_progress"].includes(normalizedStatus)) return "正在执行。";
  if (["queued", "pending", "retrying"].includes(normalizedStatus)) return "等待执行。";
  if (["completed", "succeeded", "success"].includes(normalizedStatus)) return "执行完成。";
  if (["cancelled", "canceled"].includes(normalizedStatus)) return "执行已取消。";
  return "";
}

function publicStageErrorDetails(details = null) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const result = {};
  for (const key of ["phase", "gatewayErrorCode", "gatewayJobId", "gatewayStatus"]) {
    const value = safeDeliveryText(details[key], 160);
    if (value) result[key] = value;
  }
  for (const key of ["satkExitCode", "timeoutSeconds", "candidateCount", "caseCount"]) {
    const value = Number(details[key]);
    if (Number.isFinite(value) && value >= 0 && value <= 1000000) result[key] = value;
  }
  for (const key of ["probePlanSha256", "probeEntrySha256"]) {
    const value = String(details[key] || "").trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(value)) result[key] = value;
  }
  if (typeof details.probeEntryExists === "boolean") {
    result.probeEntryExists = details.probeEntryExists;
  }
  return Object.keys(result).length ? result : null;
}

function publicInputFile(input = null) {
  if (!input || typeof input !== "object") return null;
  return {
    originalName: String(input.originalName || "").slice(0, 260),
    workspaceName: String(input.workspaceName || "").slice(0, 260),
    workspaceRelativePath: normalizeStoredRelativePath(input.workspaceRelativePath || ""),
    size: Number(input.size || 0) || 0,
    mimeType: String(input.mimeType || "").slice(0, 120)
  };
}

function publicWorkerDelivery(delivery = null) {
  if (!delivery || typeof delivery !== "object") return null;
  const state = ["accepted", "queued", "retrying", "blocked"].includes(delivery.state)
    ? delivery.state
    : "";
  const failureState = ["retrying", "blocked"].includes(state) || !state;
  const normalized = failureState
    ? normalizeWorkerDeliveryFailure({
      code: delivery.remoteCode,
      retryable: delivery.retryable,
      details: delivery
    })
    : {
      state,
      retryable: delivery.retryable === true,
      ...(safeDeliveryText(delivery.operation) ? { operation: safeDeliveryText(delivery.operation) } : {}),
      ...(safeDeliveryText(delivery.category) ? { category: safeDeliveryText(delivery.category) } : {}),
      ...(safeDeliveryText(delivery.remoteCode) ? { remoteCode: safeDeliveryText(delivery.remoteCode) } : {}),
      ...(safeDeliveryText(delivery.prepareFailureReason) ? { prepareFailureReason: safeDeliveryText(delivery.prepareFailureReason) } : {}),
      ...(safeDeliveryText(delivery.correlationId) ? { correlationId: safeDeliveryText(delivery.correlationId) } : {})
    };
  return {
    ...normalized,
    state: state || normalized.state,
    attemptCount: Number(delivery.attemptCount || 0) || 0,
    firstFailureAt: String(delivery.firstFailureAt || ""),
    lastFailureAt: String(delivery.lastFailureAt || ""),
    nextAttemptAt: String(delivery.nextAttemptAt || ""),
    acceptedAt: String(delivery.acceptedAt || ""),
    lastSuccessAt: String(delivery.lastSuccessAt || "")
  };
}

function publicTaskErrorMessage(task = {}) {
  const code = safeDeliveryText(task.hermes?.errorCode || task.workerDelivery?.remoteCode, 160);
  if (!task.errorMessage) return "";
  if (code === "matlab_unavailable") return "MATLAB unavailable";
  return publicExecutionMessage("failed", code);
}

function publicPipelineStage(stage = {}) {
  const checkpoint = stage.checkpoint && typeof stage.checkpoint === "object"
    ? stage.checkpoint
    : null;
  const errorDetails = publicStageErrorDetails(stage.error?.details);
  return {
    index: Number(stage.index || 0) || 0,
    name: String(stage.name || "").slice(0, 160),
    status: String(normalizeSuccessfulPipelineStatus(stage.status || "")).slice(0, 60),
    summary: publicExecutionMessage(stage.status, stage.error?.code),
    skillName: String(stage.skillName || "").slice(0, 160),
    skillVersion: String(stage.skillVersion || "").slice(0, 80),
    bundleVersion: String(stage.bundleVersion || "").slice(0, 80),
    attempt: Number(stage.attempt || 0) || 0,
    startedAt: String(stage.startedAt || "").slice(0, 40),
    endedAt: String(stage.endedAt || "").slice(0, 40),
    error: stage.error ? {
      code: safeDeliveryText(stage.error.code),
      message: errorDetails
        ? publicDiagnosticText(stage.error.message) || publicExecutionMessage("failed", stage.error.code)
        : publicExecutionMessage("failed", stage.error.code),
      details: errorDetails
    } : null,
    attempts: (Array.isArray(stage.attempts) ? stage.attempts : []).slice(-20).map((attempt) => ({
      attempt: Number(attempt?.attempt || 0) || 0,
      status: String(attempt?.status || "").slice(0, 60),
      sessionId: safeDeliveryText(attempt?.sessionId, 200),
      model: String(attempt?.model || "").slice(0, 120)
    })),
    checkpoint: checkpoint ? {
      schema: String(checkpoint.schema || "").slice(0, 120),
      skill: checkpoint.skill ? {
        name: String(checkpoint.skill.name || "").slice(0, 160),
        version: String(checkpoint.skill.version || "").slice(0, 80),
        bundleVersion: String(checkpoint.skill.bundleVersion || "").slice(0, 80),
        bundleHash: safeDeliveryText(checkpoint.skill.bundleHash, 128)
      } : null,
      agent: checkpoint.agent ? {
        profile: String(checkpoint.agent.profile || "").slice(0, 120),
        model: String(checkpoint.agent.model || "").slice(0, 120),
        sessionId: safeDeliveryText(checkpoint.agent.sessionId, 200),
        tokenUsage: publicTokenUsage(checkpoint.agent.tokenUsage)
      } : null,
      artifacts: (Array.isArray(checkpoint.artifacts) ? checkpoint.artifacts : []).slice(0, 80).map((artifact) => ({
        role: String(artifact?.role || "").slice(0, 120),
        kind: String(artifact?.kind || "").slice(0, 80),
        fileName: String(artifact?.fileName || "").slice(0, 260)
      })),
      validation: checkpoint.validation ? {
        status: String(checkpoint.validation.status || "").slice(0, 60),
        code: safeDeliveryText(checkpoint.validation.code),
        summary: publicExecutionMessage(checkpoint.validation.status, checkpoint.validation.code)
      } : null,
      // Fields rendered by the progressive stage trace (stage-9/11 coverage
      // chip, stage input/result, tool log summary).
      coverage: checkpoint.coverage && typeof checkpoint.coverage === "object" ? checkpoint.coverage : null,
      input: checkpoint.input && typeof checkpoint.input === "object" ? checkpoint.input : null,
      result: checkpoint.result && typeof checkpoint.result === "object" ? checkpoint.result : null,
      toolLogs: Array.isArray(checkpoint.toolLogs) ? checkpoint.toolLogs : null
    } : null
  };
}

function publicTask(task = {}) {
  const workerProfile = publicUnitTestWorkerProfile(task.workerProfile) || publicUnitTestWorkerProfile(resolveUnitTestWorkerProfile(""));
  const taskStatus = normalizeSuccessfulTaskStatus(task.status || "queued");
  return {
    id: String(task.id || ""),
    type: String(task.type || QUEUE_TYPE),
    status: String(taskStatus),
    title: String(task.title || "").slice(0, 200),
    createdAt: String(task.createdAt || ""),
    updatedAt: String(task.updatedAt || ""),
    startedAt: String(task.startedAt || ""),
    completedAt: String(task.completedAt || ""),
    failedAt: String(task.failedAt || ""),
    summary: publicExecutionMessage(taskStatus, task.workerDelivery?.remoteCode),
    errorMessage: publicTaskErrorMessage(task),
    progress: task.progress ? {
      stage: String(normalizeSuccessfulTaskStatus(task.progress.stage || "")).slice(0, 60),
      percent: Number(task.progress.percent || 0) || 0,
      label: String(task.progress.label || "").slice(0, 120),
      message: publicExecutionMessage(normalizeSuccessfulTaskStatus(task.progress.stage || taskStatus), task.workerDelivery?.remoteCode),
      updatedAt: String(task.progress.updatedAt || "")
    } : null,
    unitTestProject: normalizeTaskProjectSnapshot(task.unitTestProject),
    workerProfile,
    workerPending: task.workerPending === true,
    workerDelivery: publicWorkerDelivery(task.workerDelivery),
    inputs: {
      modelSlx: publicInputFile(task.inputs?.modelSlx),
      modelMat: publicInputFile(task.inputs?.modelMat),
      ...(task.inputs?.modelInitScript ? { modelInitScript: publicInputFile(task.inputs.modelInitScript) } : {})
    },
    hermes: {
      stepType: String(task.hermes?.stepType || STEP_TYPE).slice(0, 120),
      pipelineName: String(task.hermes?.pipelineName || "").slice(0, 160),
      expectedOutputPattern: String(task.hermes?.expectedOutputPattern || "").slice(0, 200),
      errorCode: safeDeliveryText(task.hermes?.errorCode, 160),
      tokenUsage: publicTokenUsage(task.hermes?.tokenUsage),
      sessionId: safeDeliveryText(task.hermes?.sessionId, 200),
      warnings: (Array.isArray(task.hermes?.warnings) ? task.hermes.warnings : []).slice(0, 20).map(() => "Agent 返回了受限诊断信息。")
    },
    runtimeEvents: (Array.isArray(task.runtimeEvents) ? task.runtimeEvents : []).slice(-80).map((event) => ({
      at: String(event?.at || ""),
      type: String(event?.type || "").slice(0, 80),
      status: String(normalizeSuccessfulTaskStatus(event?.status || "")).slice(0, 60),
      level: String(event?.level || "").slice(0, 40),
      label: String(event?.label || "").slice(0, 160),
      message: publicExecutionMessage(event?.status, event?.code),
      transport: String(event?.transport || "").slice(0, 60),
      elapsedMs: Number(event?.elapsedMs || 0) || 0,
      sessionId: safeDeliveryText(event?.sessionId, 200),
      tokenUsage: publicTokenUsage(event?.tokenUsage)
    })),
    artifacts: (Array.isArray(task.artifacts) ? task.artifacts : []).slice(0, 80).map((artifact) => ({
      id: String(artifact?.id || "").slice(0, 160),
      fileName: String(artifact?.fileName || "").slice(0, 260),
      relativePath: normalizeStoredRelativePath(artifact?.relativePath || ""),
      size: Number(artifact?.size || 0) || 0,
      mimeType: String(artifact?.mimeType || "").slice(0, 120),
      description: String(artifact?.description || "") === "最终 TCSD 单元测试用例 Excel"
        ? "最终 TCSD 单元测试用例 Excel"
        : "",
      expectedValueCount: Number(artifact?.expectedValueCount || 0) || 0
    })),
    timeline: (Array.isArray(task.timeline) ? task.timeline : []).slice(-100).map((entry) => ({
      at: String(entry?.at || ""),
      status: String(normalizeSuccessfulTaskStatus(entry?.status || "")).slice(0, 60),
      message: publicExecutionMessage(entry?.status)
    })),
    pipeline: task.pipeline ? {
      jobId: safeDeliveryText(task.pipeline.jobId, 200),
      schema: String(task.pipeline.schema || "").slice(0, 160),
      status: String(normalizeSuccessfulPipelineStatus(task.pipeline.status || "")).slice(0, 60),
      completion: String(task.pipeline.completion === "partial" ? "complete" : task.pipeline.completion || "").slice(0, 60),
      stages: (Array.isArray(task.pipeline.stages) ? task.pipeline.stages : []).map(publicPipelineStage),
      checkpoints: (Array.isArray(task.pipeline.checkpoints) ? task.pipeline.checkpoints : []).slice(0, 20).map((checkpoint) => ({
        stageIndex: Number(checkpoint?.stageIndex || 0) || 0,
        schema: String(checkpoint?.schema || "").slice(0, 120)
      })),
      updatedAt: String(task.pipeline.updatedAt || "")
    } : null
  };
}

async function copyUploadedFile(file = {}, targetPath = "") {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(file.path, targetPath);
}

async function cleanupTempFiles(files = {}) {
  const allFiles = [...(files.modelSlx || []), ...(files.modelMat || []), ...(files.modelInitScript || [])];
  await Promise.all(
    allFiles
      .map((file) => file?.path)
      .filter(Boolean)
      .map((filePath) => fs.rm(filePath, { force: true }).catch(() => null))
  );
}

export class UnitTestCaseGenerationService {
  constructor(options = {}) {
    this.hermesAgentClient = options.hermesAgentClient || null;
    this.hermesAgentClientFactory = typeof options.hermesAgentClientFactory === "function"
      ? options.hermesAgentClientFactory
      : null;
    this.deletedTaskIds = new Set();
    this.deletingTaskIds = new Set();
    this.deliveryRuns = new Map();
    this.remotePollWindowMs = Number(options.remotePollWindowMs ?? config.unitTestCase?.remotePollWindowMs ?? 5 * 60 * 1000);
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get storeDir() {
    return unitTestCaseConfig().taskStoreDir;
  }

  get uploadTempDir() {
    return unitTestCaseConfig().uploadTempDir;
  }

  getTaskDir(taskId = "") {
    const id = String(taskId || "").trim();
    const storeDir = path.resolve(this.storeDir);
    const taskDir = path.resolve(storeDir, id);
    if (!id || taskDir === storeDir || !taskDir.startsWith(`${storeDir}${path.sep}`)) {
      throw createHttpError("任务 ID 非法。", 400, "unit_test_case_invalid_task_id");
    }
    return taskDir;
  }

  async ensureDirs() {
    const cfg = unitTestCaseConfig();
    await Promise.all([
      fs.mkdir(cfg.taskStoreDir, { recursive: true }),
      fs.mkdir(cfg.uploadTempDir, { recursive: true }),
      fs.mkdir(path.dirname(cfg.projectRegistryPath), { recursive: true })
    ]);
  }

  async readProjectRegistry() {
    await this.ensureDirs();
    const cfg = unitTestCaseConfig();
    const fallback = buildProjectRegistry(parseDefaultProjects(cfg.defaultProjects));
    const stored = await readJson(cfg.projectRegistryPath, null);
    if (!stored || !Array.isArray(stored.projects)) {
      await writeJson(cfg.projectRegistryPath, fallback);
      return fallback;
    }
    const normalized = buildProjectRegistry(stored.projects);
    normalized.nextProjectNumber = Math.max(
      Number(stored.nextProjectNumber || 0) || 0,
      normalized.nextProjectNumber
    );
    if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
      await writeJson(cfg.projectRegistryPath, normalized);
    }
    return normalized;
  }

  async saveProjectRegistry(registry = {}) {
    await this.ensureDirs();
    const normalized = buildProjectRegistry(registry.projects || []);
    normalized.nextProjectNumber = Math.max(
      Number(registry.nextProjectNumber || 0) || 0,
      normalized.nextProjectNumber
    );
    await writeJson(unitTestCaseConfig().projectRegistryPath, normalized);
    return normalized;
  }

  async listProjects() {
    const registry = await this.readProjectRegistry();
    return registry.projects.map(publicProject).filter(Boolean);
  }

  async getUnitTestProject(projectId = "") {
    const id = normalizeProjectId(projectId);
    if (!PROJECT_ID_PATTERN.test(id)) {
      throw createHttpError("请选择有效的项目编号。", 400, "unit_test_case_invalid_project_id");
    }
    const projects = await this.listProjects();
    const project = projects.find((item) => item.id === id);
    if (!project) {
      throw createHttpError("单元测试项目不存在。", 400, "unit_test_case_project_not_found", { projectId: id });
    }
    return project;
  }

  async createProject(input = {}) {
    assertProjectAdminCode(input.authCode);
    const name = normalizeProjectName(input.name);
    if (!name) {
      throw createHttpError("项目名不能为空。", 400, "unit_test_case_project_name_required");
    }
    const registry = await this.readProjectRegistry();
    const usedIds = new Set(registry.projects.map((project) => project.id));
    let candidateNumber = Math.max(1, Number(registry.nextProjectNumber || 1) || 1);
    let id = String(candidateNumber).padStart(2, "0");
    while (usedIds.has(id)) {
      candidateNumber += 1;
      id = String(candidateNumber).padStart(2, "0");
    }
    const project = { id, name, label: `${id}_${name}` };
    const saved = await this.saveProjectRegistry({
      nextProjectNumber: candidateNumber + 1,
      projects: [...registry.projects, project]
    });
    return publicProject(saved.projects.find((item) => item.id === id));
  }

  async deleteProject(projectId = "", input = {}) {
    assertProjectAdminCode(input.authCode);
    const id = normalizeProjectId(projectId);
    if (!PROJECT_ID_PATTERN.test(id)) {
      throw createHttpError("项目编号非法。", 400, "unit_test_case_invalid_project_id");
    }
    const registry = await this.readProjectRegistry();
    const nextProjects = registry.projects.filter((project) => project.id !== id);
    if (nextProjects.length === registry.projects.length) {
      throw createHttpError("单元测试项目不存在。", 404, "unit_test_case_project_not_found", { projectId: id });
    }
    await this.saveProjectRegistry({
      nextProjectNumber: registry.nextProjectNumber,
      projects: nextProjects
    });
    return { deleted: true, projectId: id };
  }

  async listTasks(options = {}) {
    await this.ensureDirs();
    const filterProjectId = normalizeProjectId(options.projectId || "");
    if (filterProjectId && !PROJECT_ID_PATTERN.test(filterProjectId)) {
      throw createHttpError("项目编号非法。", 400, "unit_test_case_invalid_project_id");
    }
    const entries = await fs.readdir(this.storeDir, { withFileTypes: true }).catch(() => []);
    const tasks = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) {
        continue;
      }
      const task = await readJson(taskFilePath(path.join(this.storeDir, entry.name)), null);
      if (task?.id) {
        const publicRecord = publicTask(task);
        if (!filterProjectId || publicRecord.unitTestProject?.id === filterProjectId) {
          tasks.push(publicRecord);
        }
      }
    }
    return tasks.sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""));
  }

  async getTask(taskId = "") {
    const task = await readJson(taskFilePath(this.getTaskDir(taskId)), null);
    return task ? publicTask(task) : null;
  }

  async readTask(taskId = "") {
    return readJson(taskFilePath(this.getTaskDir(taskId)), null);
  }

  async saveTask(task = {}) {
    if (this.deletedTaskIds.has(task.id)) {
      return publicTask(task);
    }
    const taskDir = this.getTaskDir(task.id);
    await fs.mkdir(taskDir, { recursive: true });
    await writeJson(taskFilePath(taskDir), task);
    return publicTask(task);
  }

  async deleteTask(taskId = "") {
    const normalizedTaskId = String(taskId || "").trim();
    let task = await this.readTask(normalizedTaskId);
    if (!task) throw createHttpError("任务不存在。", 404, "unit_test_case_task_not_found");
    this.deletingTaskIds.add(task.id);
    try {
      let workerJobId = String(task.pipeline?.jobId || task.workerDelivery?.workerJobId || "").trim();
      const deliveryRun = this.deliveryRuns.get(task.id);
      if (["queued", "running"].includes(task.status) && !workerJobId && deliveryRun) {
        await deliveryRun.catch(() => {});
        task = await this.readTask(normalizedTaskId) || task;
        workerJobId = String(task.pipeline?.jobId || task.workerDelivery?.workerJobId || "").trim();
      }
      if (["queued", "running"].includes(task.status) && workerJobId) {
        const workerProfile = resolveUnitTestWorkerProfile(task.workerProfile?.id || task.workerId || "");
        const client = this.getHermesAgentClientForWorker(workerProfile);
        if (typeof client?.cancelTcsdPipelineJob !== "function") {
          throw createHttpError("当前 Worker 不支持安全取消，任务未删除。", 409, "tcsd_worker_cancel_unsupported");
        }
        const cancellation = await client.cancelTcsdPipelineJob(workerJobId);
        if (cancellation?.executionStopped !== true) {
          throw createHttpError("Worker 尚未确认任务停止，平台记录未删除。", 409, "tcsd_worker_cancel_unconfirmed");
        }
      }
      this.deletedTaskIds.add(task.id);
      const taskDir = this.getTaskDir(task.id);
      await fs.rm(taskDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      return {
        deleted: true,
        taskId: task.id,
        status: task.status || "",
        removedArtifacts: Array.isArray(task.artifacts) ? task.artifacts.length : 0,
        removedWorkspace: true,
        workerJobId: workerJobId || null,
        workerCancelled: Boolean(workerJobId && ["queued", "running"].includes(task.status))
      };
    } finally {
      this.deletingTaskIds.delete(task.id);
    }
  }

  validateUploadFiles(files = {}) {
    const normalized = normalizeTaskFiles(files);
    if (normalized.modelSlx.length !== 1 || normalized.modelMat.length !== 1 || normalized.modelInitScript.length > 1) {
      throw createHttpError("需要同时上传 1 个 .slx 模型文件和 1 个 .mat 数据文件。", 400, "unit_test_case_invalid_upload_count", {
        modelSlxCount: normalized.modelSlx.length,
        modelMatCount: normalized.modelMat.length,
        modelInitScriptCount: normalized.modelInitScript.length
      });
    }

    const [modelSlx] = normalized.modelSlx;
    const [modelMat] = normalized.modelMat;
    const [modelInitScript] = normalized.modelInitScript;
    if (normalizeExtension(modelSlx.originalname) !== ".slx") {
      throw createHttpError("模型文件只接受 .slx。", 400, "unit_test_case_invalid_slx_extension");
    }
    if (normalizeExtension(modelMat.originalname) !== ".mat") {
      throw createHttpError("数据文件只接受 .mat。", 400, "unit_test_case_invalid_mat_extension");
    }
    if (modelInitScript && normalizeExtension(modelInitScript.originalname) !== ".m") {
      throw createHttpError("初始化脚本只接受 .m。", 400, "unit_test_case_invalid_init_script_extension");
    }

    return { modelSlx, modelMat, modelInitScript: modelInitScript || null };
  }

  async createTask(files = {}, metadata = {}) {
    await this.ensureDirs();
    const normalized = normalizeTaskFiles(files);
    try {
      const { modelSlx, modelMat, modelInitScript } = this.validateUploadFiles(normalized);
      const unitTestProject = await this.getUnitTestProject(metadata.unitTestProjectId || metadata.projectId || "");
      const workerProfile = resolveUnitTestWorkerProfile(metadata.workerId || metadata.unitTestWorkerId || "");
      const taskId = randomUUID();
      const taskDir = this.getTaskDir(taskId);
      const inputDir = path.join(taskDir, "inputs");
      const workspaceDir = path.join(taskDir, "workspace");
      const workspaceInputDir = path.join(workspaceDir, "inputs");
      const outputDir = path.join(workspaceDir, "outputs");
      await Promise.all([
        fs.mkdir(inputDir, { recursive: true }),
        fs.mkdir(workspaceInputDir, { recursive: true }),
        fs.mkdir(outputDir, { recursive: true })
      ]);

      const slxName = sanitizeStoredFileName(modelSlx.originalname, "model.slx");
      const matName = sanitizeStoredFileName(modelMat.originalname, "model.mat");
      const workspaceModelBase = toMatlabModelBase(modelSlx.originalname, "model");
      const workspaceSlxName = `${workspaceModelBase}.slx`;
      const workspaceMatName = `${workspaceModelBase}.mat`;
      const initScriptName = modelInitScript ? sanitizeStoredFileName(modelInitScript.originalname, "model_init.m") : "";
      const workspaceInitScriptName = modelInitScript
        ? `${toMatlabModelBase(modelInitScript.originalname, `${workspaceModelBase}_init`)}.m`
        : "";
      const archivedSlxPath = path.join(inputDir, slxName);
      const archivedMatPath = path.join(inputDir, matName);
      const archivedInitScriptPath = modelInitScript ? path.join(inputDir, initScriptName) : "";
      const workspaceSlxPath = path.join(workspaceDir, workspaceSlxName);
      const workspaceMatPath = path.join(workspaceDir, workspaceMatName);
      const workspaceInitScriptPath = modelInitScript ? path.join(workspaceInputDir, workspaceInitScriptName) : "";
      await copyUploadedFile(modelSlx, archivedSlxPath);
      await copyUploadedFile(modelMat, archivedMatPath);
      if (modelInitScript) {
        await copyUploadedFile(modelInitScript, archivedInitScriptPath);
      }
      await fs.copyFile(archivedSlxPath, workspaceSlxPath);
      await fs.copyFile(archivedMatPath, workspaceMatPath);
      if (modelInitScript) {
        await fs.copyFile(archivedInitScriptPath, workspaceInitScriptPath);
      }

      const cfg = unitTestCaseConfig();
      const agentWorkspaceDir = buildAgentPath(workspaceDir, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentSlxPath = buildAgentPath(workspaceSlxPath, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentMatPath = buildAgentPath(workspaceMatPath, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentOutputDir = buildAgentPath(outputDir, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentInitScriptPath = modelInitScript ? buildAgentPath(workspaceInitScriptPath, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      }) : "";
      const initScriptInput = modelInitScript
        ? {
            originalName: normalizeUploadedFileName(modelInitScript.originalname),
            storedName: initScriptName,
            workspaceName: workspaceInitScriptName,
            size: Number(modelInitScript.size || 0) || 0,
            mimeType: modelInitScript.mimetype || "",
            archiveRelativePath: normalizeStoredRelativePath(path.relative(taskDir, archivedInitScriptPath)),
            workspaceRelativePath: normalizeStoredRelativePath(path.relative(workspaceDir, workspaceInitScriptPath))
          }
        : null;

      const createdAt = now();
      const modelBaseName = displayModelBaseName(modelSlx.originalname);
      const task = {
        id: taskId,
        type: QUEUE_TYPE,
        status: "queued",
        title: metadata.title || (modelBaseName ? `${modelBaseName} 单元测试用例` : "单元测试用例生成"),
        createdAt,
        updatedAt: createdAt,
        startedAt: "",
        completedAt: "",
        failedAt: "",
        summary: "",
        errorMessage: "",
        progress: buildProgress("queued"),
        createdBy: metadata.createdBy ? { id: metadata.createdBy.id, username: metadata.createdBy.username, displayName: metadata.createdBy.displayName } : null,
        unitTestProject,
        workerProfile: publicUnitTestWorkerProfile(workerProfile),
        inputs: {
          modelSlx: {
            originalName: normalizeUploadedFileName(modelSlx.originalname),
            storedName: slxName,
            workspaceName: workspaceSlxName,
            size: Number(modelSlx.size || 0) || 0,
            mimeType: modelSlx.mimetype || "",
            archiveRelativePath: normalizeStoredRelativePath(path.relative(taskDir, archivedSlxPath)),
            workspaceRelativePath: normalizeStoredRelativePath(path.relative(workspaceDir, workspaceSlxPath))
          },
          modelMat: {
            originalName: normalizeUploadedFileName(modelMat.originalname),
            storedName: matName,
            workspaceName: workspaceMatName,
            size: Number(modelMat.size || 0) || 0,
            mimeType: modelMat.mimetype || "",
            archiveRelativePath: normalizeStoredRelativePath(path.relative(taskDir, archivedMatPath)),
            workspaceRelativePath: normalizeStoredRelativePath(path.relative(workspaceDir, workspaceMatPath))
          }
        },
        workspace: {
          directory: workspaceDir,
          inputDir: workspaceInputDir,
          outputDir,
          modelSlxPath: workspaceSlxPath,
          modelMatPath: workspaceMatPath,
          modelInitScriptPath: workspaceInitScriptPath,
          agentDirectory: agentWorkspaceDir,
          agentModelSlxPath: agentSlxPath,
          agentModelMatPath: agentMatPath,
          agentModelInitScriptPath: agentInitScriptPath,
          agentOutputDir
        },
        hermes: {
          stepType: STEP_TYPE,
          queueType: QUEUE_TYPE,
          pipelineName: cfg.pipelineName,
          expectedOutputPattern: cfg.expectedOutputPattern,
          summary: "",
          metrics: null,
          sessionId: "",
          logs: []
        },
        runtimeEvents: [],
        artifacts: [],
        timeline: [
          {
            at: createdAt,
            status: "queued",
            message: `任务已创建并等待 Hermes Agent 执行，项目：${unitTestProject.label}。`
          }
        ]
      };
      if (initScriptInput) {
        task.inputs.modelInitScript = initScriptInput;
      }
      await this.saveTask(task);
      return publicTask(task);
    } finally {
      await cleanupTempFiles(normalized);
    }
  }

  async markRunning(taskId = "") {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "unit_test_case_task_not_found");
    }
    const timestamp = now();
    task.status = "running";
    task.startedAt ||= timestamp;
    task.updatedAt = timestamp;
    task.progress = buildProgress("running");
    task.timeline = [
      ...(task.timeline || []),
      { at: timestamp, status: "running", message: "Hermes Agent 已开始处理。" }
    ].slice(-100);
    return this.saveTask(task);
  }

  async appendRuntimeEvent(taskId = "", event = {}) {
    const task = await this.readTask(taskId);
    if (!task) {
      return null;
    }
    const normalizedEvent = {
      at: event.at || now(),
      type: String(event.type || "agent_runtime"),
      status: String(event.status || ""),
      level: event.level || "",
      label: event.label || "",
      message: event.message || "",
      transport: event.transport || "",
      stepType: event.stepType || STEP_TYPE,
      elapsedMs: Number(event.elapsedMs || 0) || 0,
      sessionId: event.sessionId || "",
      tokenUsage: event.tokenUsage || null,
      stdoutExcerpt: event.stdoutExcerpt || "",
      stderrExcerpt: event.stderrExcerpt || ""
    };
    task.runtimeEvents = [...(task.runtimeEvents || []), normalizedEvent].slice(-80);
    task.updatedAt = normalizedEvent.at;
    if (normalizedEvent.status === "heartbeat") {
      task.progress = buildProgress("running", normalizedEvent.message || "Hermes Agent 仍在执行。");
    }
    if (normalizedEvent.status === "failed") {
      task.progress = buildProgress("failed", normalizedEvent.message || "Hermes Agent 执行失败。");
    }
    if (normalizedEvent.tokenUsage) {
      task.hermes = {
        ...(task.hermes || {}),
        tokenUsage: normalizedEvent.tokenUsage,
        sessionId: normalizedEvent.sessionId || task.hermes?.sessionId || ""
      };
    }
    await this.saveTask(task);
    return normalizedEvent;
  }

  getHermesAgentClientForWorker(workerProfile = {}) {
    if (this.hermesAgentClient) {
      return this.hermesAgentClient;
    }
    if (this.hermesAgentClientFactory) {
      return this.hermesAgentClientFactory(workerProfile);
    }
    return new HermesAgentClient({
      transport: workerProfile.hermesTransport || "api",
      baseURL: workerProfile.hermesBaseURL,
      apiMode: workerProfile.hermesApiMode || config.hermes.apiMode || "json",
      authToken: workerProfile.hermesAuthToken || "",
      timeoutMs: config.hermes.timeoutMs,
      stepTimeoutMs: config.hermes.stepTimeoutMs,
      maxTurns: config.hermes.maxTurns,
      stepMaxTurns: config.hermes.stepMaxTurns,
      heartbeatIntervalMs: config.hermes.heartbeatIntervalMs
    });
  }

  buildHermesPayload(task = {}) {
    const cfg = unitTestCaseConfig();
    const workspaceDir = task.workspace?.agentDirectory || task.workspace?.directory || "";
    const modelSlxPath = task.workspace?.agentModelSlxPath || task.workspace?.modelSlxPath || "";
    const modelMatPath = task.workspace?.agentModelMatPath || task.workspace?.modelMatPath || "";
    const modelInitScriptPath = task.workspace?.agentModelInitScriptPath || task.workspace?.modelInitScriptPath || "";
    const outputDir = task.workspace?.agentOutputDir || task.workspace?.outputDir || "";
    const modelInitScriptRelativePath = task.inputs?.modelInitScript?.workspaceRelativePath || "";
    const inputArtifact = {
      workspaceDir,
      modelSlxPath,
      modelMatPath,
      outputDir,
      unitTestProject: normalizeTaskProjectSnapshot(task.unitTestProject),
      pipelineSchema: TCSD_PIPELINE_SCHEMA,
      expectedOutputPattern: cfg.expectedOutputPattern,
      localPlatformWorkspaceDir: task.workspace?.directory || "",
      modelSlxFileName: task.inputs?.modelSlx?.originalName || path.basename(modelSlxPath),
      modelMatFileName: task.inputs?.modelMat?.originalName || path.basename(modelMatPath)
    };
    if (modelInitScriptPath && modelInitScriptRelativePath) {
      inputArtifact.modelInitScriptPath = modelInitScriptPath;
      inputArtifact.modelInitScriptFileName = task.inputs?.modelInitScript?.workspaceName || path.basename(modelInitScriptPath);
      inputArtifact.projectInitScripts = [modelInitScriptRelativePath];
    }
    return {
      stepType: STEP_TYPE,
      type: QUEUE_TYPE,
      allowedPaths: [workspaceDir],
      workdir: workspaceDir,
      inputArtifact
    };
  }

  async syncPipelineJob(taskId, job) {
    const task = await this.readTask(taskId);
    if (!task) return null;
    const workerQueued = isQueuedWorkerPipelineStatus(job.status);
    const workerCancelled = job.status === "已取消";
    task.pipeline = {
      jobId: job.jobId,
      schema: job.schema,
      status: normalizeSuccessfulPipelineStatus(job.status),
      completion: job.completion === "partial" ? "complete" : job.completion || "",
      stages: Array.isArray(job.stages) ? job.stages : [],
      checkpoints: Array.isArray(job.checkpoints) ? job.checkpoints : [],
      coverage: job.coverage || null,
      repair: job.repair || { attempted: false, applied: false },
      error: job.error || null,
      updatedAt: job.updatedAt || now()
    };
    task.status = workerCancelled
      ? "cancelled"
      : job.status === "失败"
      ? "failed"
      : ["已完成", "部分完成"].includes(job.status)
          ? "completed"
          : workerQueued
            ? "queued"
            : "running";
    task.workerPending = false;
    task.workerDelivery = {
      ...(task.workerDelivery || {}),
      state: workerCancelled ? "cancelled" : workerQueued ? "queued" : "accepted",
      retryable: false,
      workerJobId: String(job.jobId || "").trim(),
      ...(safeDeliveryText(job.deliveryCorrelationId) ? { correlationId: safeDeliveryText(job.deliveryCorrelationId) } : {}),
      acceptedAt: task.workerDelivery?.acceptedAt || now(),
      lastSuccessAt: now()
    };
    task.progress = buildProgress(
      task.status,
      workerCancelled
        ? "Worker 作业已取消。"
        : workerQueued
        ? "Windows Worker 已接收任务，正在等待前序任务结束。"
        : job.stages?.find((stage) => stage.status === "正在执行")?.name ||
          job.error?.message ||
          "正在同步 TCSD 十二阶段进度。"
    );
    task.updatedAt = now();
    await this.saveTask(task);
    return task;
  }

  async cleanupRemotePipelineUpload(client, jobId = "") {
    if (!jobId || typeof client?.cleanupTcsdPipelineUpload !== "function") return;
    await client.cleanupTcsdPipelineUpload(jobId).catch(() => {});
  }

  async runRemotePipeline(taskId, task, workerProfile = null) {
    const resolvedWorkerProfile = workerProfile || resolveUnitTestWorkerProfile(task.workerProfile?.id || task.workerId || "");
    const hermesAgentClient = this.getHermesAgentClientForWorker(resolvedWorkerProfile);
    const existingJobId = task.pipeline?.jobId || "";
    const started = existingJobId
      ? { jobId: existingJobId, status: task.pipeline?.status || "正在执行", schema: task.pipeline?.schema || "" }
      : await hermesAgentClient.startTcsdPipelineJob({
          ...this.buildHermesPayload(task),
          taskId,
          idempotencyKey: taskId
        });
    let job = { ...started, stages: [] };
    await this.syncPipelineJob(taskId, job);
    if (this.deletingTaskIds.has(taskId)) {
      await hermesAgentClient.cancelTcsdPipelineJob(started.jobId);
      return { status: "cancelled", jobId: started.jobId };
    }
    const deadline = Date.now() + this.remotePollWindowMs;
    let delayMs = 1000;
    // 新建 job 的 202 响应本身就是一次成功状态；恢复已有 job 时则必须等到
    // 本轮首次 GET 成功后，才能声明 Worker 状态同步正常。
    let lastPollSucceeded = !existingJobId;
    while (Date.now() < deadline) {
      if (this.deletingTaskIds.has(taskId)) {
        await hermesAgentClient.cancelTcsdPipelineJob(started.jobId);
        return { status: "cancelled", jobId: started.jobId };
      }
      try {
        job = await hermesAgentClient.getTcsdPipelineJob(started.jobId, {
          localWorkspaceDir: task.workspace?.directory || ""
        });
        lastPollSucceeded = true;
        await this.syncPipelineJob(taskId, job);
        if (["已完成", "部分完成", "失败", "已取消"].includes(job.status)) break;
        delayMs = 1000;
      } catch (error) {
        // A temporary network break is not a MATLAB failure; retain the last confirmed job state.
        if (error.code === "tcsd_job_not_found" || error?.retryable === false) throw error;
        lastPollSucceeded = false;
        delayMs = Math.min(15000, Math.round(delayMs * 1.8));
      }
      await this.sleep(delayMs);
    }
    if (!job || !["已完成", "部分完成", "失败", "已取消"].includes(job.status)) {
      const pending = await this.readTask(taskId);
      const workerQueued = isQueuedWorkerPipelineStatus(job?.status);
      pending.status = workerQueued ? "queued" : "running";
      pending.workerPending = !lastPollSucceeded;
      pending.progress = buildProgress(
        pending.status,
        workerQueued
          ? "Windows Worker 已接收任务，正在等待前序任务结束。"
          : lastPollSucceeded
            ? "Windows 作业仍在执行，平台将在后台继续同步。"
            : "Windows Worker 状态同步暂时中断，平台将在后台继续重试。"
      );
      pending.updatedAt = now();
      await this.saveTask(pending);
      return { status: "pending", jobId: started.jobId };
    }
    if (job.status === "失败") {
      await this.cleanupRemotePipelineUpload(hermesAgentClient, job.jobId);
      throw createHttpError(job.error?.message || "TCSD 阶段执行失败。", 502, job.error?.code || "tcsd_stage_failed");
    }
    if (job.status === "已取消") return { status: "cancelled", jobId: job.jobId };
    return { status: "succeeded", artifact: { status: "completed", summary: "TCSD 已完成。", outputFiles: job.artifacts || [], warnings: [] }, metrics: { pipelineJobId: job.jobId }, pipelineJob: job };
  }

  async runTask(taskId = "") {
    const normalizedTaskId = String(taskId || "").trim();
    const pending = this.deliveryRuns.get(normalizedTaskId);
    if (pending) return pending;
    const execution = this.runTaskUnlocked(normalizedTaskId).finally(() => {
      if (this.deliveryRuns.get(normalizedTaskId) === execution) this.deliveryRuns.delete(normalizedTaskId);
    });
    this.deliveryRuns.set(normalizedTaskId, execution);
    return execution;
  }

  async runTaskUnlocked(taskId = "") {
    let task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "unit_test_case_task_not_found");
    }
    try {
      const workerProfile = resolveUnitTestWorkerProfile(task.workerProfile?.id || task.workerId || "");
      task.workerProfile = publicUnitTestWorkerProfile(workerProfile);
      await this.saveTask(task);
      const result = await this.runRemotePipeline(taskId, task, workerProfile);
      if (result?.status === "cancelled") return this.getTask(taskId);
      if (result?.status === "pending") return this.getTask(taskId);
      const artifact = result?.artifact || {};
      if (result?.status && result.status !== "succeeded") {
        throw createHttpError(result?.error?.message || "Hermes Agent 执行失败。", 502, "unit_test_case_hermes_failed");
      }
      if (artifact.status === "failed") {
        throw createHttpError(artifact.errorMessage || artifact.summary || "Hermes Agent 返回失败状态。", 502, "unit_test_case_hermes_failed");
      }
      const completed = await this.completeTask(taskId, artifact, result);
      await this.cleanupRemotePipelineUpload(
        this.getHermesAgentClientForWorker(workerProfile),
        result.pipelineJob?.jobId || ""
      );
      return completed;
    } catch (error) {
      const hasExplicitRetryable =
        typeof error?.retryable === "boolean" ||
        typeof error?.details?.retryable === "boolean";
      const legacyRetryable =
        !hasExplicitRetryable &&
        ["tcsd_worker_unavailable", "tcsd_poll_timeout"].includes(error.code);
      const isDeliveryFailure =
        legacyRetryable ||
        ["create", "poll"].includes(String(error?.details?.operation || ""));
      if (!isDeliveryFailure) {
        await this.failTask(taskId, error);
        throw error;
      }
      const deliveryFailure = normalizeWorkerDeliveryFailure({ ...error, retryable: error?.retryable === true || legacyRetryable });
      const failed = await this.readTask(taskId);
      const timestamp = now();
      failed.workerDelivery = {
        ...(failed.workerDelivery || {}),
        ...deliveryFailure,
        attemptCount: Number(failed.workerDelivery?.attemptCount || 0) + 1,
        firstFailureAt: failed.workerDelivery?.firstFailureAt || timestamp,
        lastFailureAt: timestamp
      };
      failed.updatedAt = timestamp;
      if (deliveryFailure.retryable) {
        const retryDelayMs = Math.min(
          15 * 60 * 1000,
          30 * 1000 * 2 ** Math.min(5, Math.max(0, failed.workerDelivery.attemptCount - 1))
        );
        failed.workerDelivery.nextAttemptAt = new Date(Date.now() + retryDelayMs).toISOString();
        failed.status = failed.pipeline?.jobId ? "running" : "queued";
        failed.workerPending = true;
        failed.progress = buildProgress(failed.status, failed.pipeline?.jobId
          ? "Windows Worker 连接暂时中断，平台将在后台继续同步。"
          : "Windows Worker 暂时不可达，平台将在后台重新投递。");
        await this.saveTask(failed);
        return this.getTask(taskId);
      }
      failed.status = "failed";
      failed.workerPending = false;
      failed.failedAt = timestamp;
      failed.errorMessage = "Windows Worker 已拒绝任务投递，请查看安全诊断并在修复后重新投递。";
      failed.progress = buildProgress("failed", failed.errorMessage);
      failed.hermes = { ...(failed.hermes || {}), errorCode: error?.code || "tcsd_worker_request_rejected", errorDetails: deliveryFailure };
      failed.timeline = [...(failed.timeline || []), { at: timestamp, status: "failed", message: failed.errorMessage }];
      await this.saveTask(failed);
      return this.getTask(taskId);
    }
  }

  async redeliverTask(taskId = "") {
    const normalizedTaskId = String(taskId || "").trim();
    const task = await this.readTask(normalizedTaskId);
    if (!task) throw createHttpError("任务不存在。", 404, "unit_test_case_task_not_found");
    if (task.pipeline?.jobId) {
      throw createHttpError("Worker 作业已经创建，不能重复投递。", 409, "unit_test_case_worker_job_already_created");
    }
    if (!task.workerPending && task.workerDelivery?.state !== "blocked") {
      throw createHttpError("当前任务不处于可重新投递状态。", 409, "unit_test_case_redelivery_not_allowed");
    }
    if (this.deliveryRuns.has(normalizedTaskId)) {
      throw createHttpError("该任务正在投递，请勿重复操作。", 409, "unit_test_case_redelivery_in_progress");
    }
    task.status = "queued";
    task.workerPending = true;
    task.failedAt = "";
    task.errorMessage = "";
    task.workerDelivery = { ...(task.workerDelivery || {}), state: "queued", retryable: true, manuallyRequestedAt: now() };
    task.workerDelivery.nextAttemptAt = "";
    task.progress = buildProgress("queued", "正在重新投递到原 Windows Worker。");
    task.updatedAt = now();
    await this.saveTask(task);
    this.runTask(normalizedTaskId).catch(() => {});
    return this.getTask(normalizedTaskId);
  }

  async resolveHermesOutputCandidates(task = {}, artifact = {}) {
    const workspaceDir = task.workspace?.directory || "";
    const outputDir = task.workspace?.outputDir || path.join(workspaceDir, "outputs");
    const candidates = new Map();
    const addCandidate = (relativePath = "", meta = {}) => {
      const normalized = normalizeStoredRelativePath(relativePath);
      if (isWorkbookOutput(normalized)) {
        candidates.set(normalized, { relativePath: normalized, ...meta });
      }
    };

    for (const item of Array.isArray(artifact.outputFiles) ? artifact.outputFiles : []) {
      if (typeof item === "string") {
        addCandidate(item);
        continue;
      }
      if (!item || typeof item !== "object") {
        continue;
      }
      const itemPath = item.relativePath || item.path || item.filePath || item.absolutePath || "";
      if (!itemPath) {
        continue;
      }
      if (path.isAbsolute(String(itemPath))) {
        const absolute = path.resolve(String(itemPath));
        if (absolute.startsWith(`${workspaceDir}${path.sep}`) || absolute === workspaceDir) {
          addCandidate(path.relative(workspaceDir, absolute), item);
        }
      } else {
        addCandidate(itemPath, item);
      }
    }

    const outputEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
    for (const entry of outputEntries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx")) {
        addCandidate(path.join("outputs", entry.name));
      }
    }

    const finalValidationStage = (task.pipeline?.stages || []).find((stage) => Number(stage?.index) === 11);
    const validatedWorkbookRelativePath = (finalValidationStage?.checkpoint?.artifacts || [])
      .find((item) => item?.kind === "xlsx" && item?.path)?.path;
    const packagingStage = (task.pipeline?.stages || []).find((stage) => Number(stage?.index) === 12);
    const packagedWorkbookRelativePath = (packagingStage?.checkpoint?.artifacts || [])
      .find((item) => item?.kind === "xlsx" && item?.role === "final-workbook" && item?.path)?.path;
    const finalWorkbookRelativePath = packagedWorkbookRelativePath || validatedWorkbookRelativePath;
    const normalizedFinalWorkbookPath = normalizeStoredRelativePath(finalWorkbookRelativePath || "");
    const selectedCandidates =
      normalizedFinalWorkbookPath && candidates.has(normalizedFinalWorkbookPath)
        ? [candidates.get(normalizedFinalWorkbookPath)]
        : [...candidates.values()];

    const artifacts = [];
    for (const candidate of selectedCandidates) {
      const absolutePath = path.resolve(workspaceDir, ...candidate.relativePath.split("/"));
      if (!absolutePath.startsWith(`${workspaceDir}${path.sep}`) || !(await pathExists(absolutePath))) {
        continue;
      }
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        continue;
      }
      // The runner writes the final workbook right before job completion;
      // a poll can observe the file mid-write (ZIP parse fails). Retry with
      // backoff so a transient unreadable state does not fail the task.
      let expectedValueSummary = null;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          expectedValueSummary = await summarizeWorkbookExpectedValues(absolutePath);
          break;
        } catch (error) {
          const message = String(error?.message || "");
          if (attempt >= 5 || !/ZIP|central directory|end of central/i.test(message)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
      artifacts.push({
        id: randomUUID(),
        kind: candidate.kind || "tcsd_workbook",
        fileName: candidate.fileName || path.basename(absolutePath),
        relativePath: candidate.relativePath,
        size: stat.size,
        mimeType: candidate.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        description: candidate.description || (
          candidate.relativePath === normalizedFinalWorkbookPath
            ? "最终 TCSD 单元测试用例 Excel"
            : "生成的 TCSD 单元测试用例 Excel"
        ),
        expectedValueCount: expectedValueSummary.expValueCount,
        testCaseCount: expectedValueSummary.testCaseCount,
        missingExpectedValueTestCases: expectedValueSummary.missingExpectedValueTestCases,
        createdAt: now()
      });
    }
    return artifacts.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
  }

  async completeTask(taskId = "", hermesArtifact = {}, hermesResult = {}) {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "unit_test_case_task_not_found");
    }
    const artifacts = await this.resolveHermesOutputCandidates(task, hermesArtifact);
    if (!artifacts.length) {
      throw createHttpError("Hermes 已返回，但未在 workspace/outputs 下找到 .xlsx 结果。", 502, "unit_test_case_output_missing", {
        expectedOutputPattern: task.hermes?.expectedOutputPattern || unitTestCaseConfig().expectedOutputPattern
      });
    }
    // Host contract: require_exp_values means the workbook carries at least
    // one expValue overall (validate_tcsd_workbook.py), NOT one per Test row —
    // the deterministic baseline case (TC_001) legitimately has no assertion.
    // Align the platform completion check with that rule.
    const invalidArtifacts = artifacts.filter((artifact) =>
      Number(artifact.testCaseCount || 0) < 1 ||
      Number(artifact.expectedValueCount || 0) < 1
    );
    if (invalidArtifacts.length) {
      const missingTestCases = invalidArtifacts.flatMap((artifact) =>
        artifact.missingExpectedValueTestCases.map((testCase) => ({
          relativePath: artifact.relativePath,
          ...testCase
        }))
      );
      const missingLabels = missingTestCases
        .map((item) => item.testId || `row ${item.row}`)
        .join(", ");
      throw createHttpError(
        missingTestCases.length
          ? `Hermes 已生成 TCSD workbook，但以下 Test 用例未检测到 expValue(...) 期望值：${missingLabels}。`
          : "Hermes 已生成 TCSD workbook，但未检测到可执行的普通 Test 用例及其 expValue(...) 期望值。",
        502,
        "unit_test_case_expected_values_missing",
        {
          artifacts: artifacts.map((artifact) => ({
            relativePath: artifact.relativePath,
            expectedValueCount: artifact.expectedValueCount || 0,
            testCaseCount: artifact.testCaseCount || 0,
            missingExpectedValueTestCases: artifact.missingExpectedValueTestCases
          })),
          missingTestCases
        }
      );
    }
    const timestamp = now();
    task.status = "completed";
    task.completedAt = timestamp;
    task.updatedAt = timestamp;
    task.summary = hermesArtifact.summary || `已生成 ${artifacts.length} 个 TCSD Excel 文件。`;
    task.progress = buildProgress("completed", task.summary);
    task.hermes = {
      ...(task.hermes || {}),
      summary: hermesArtifact.summary || "",
      warnings: Array.isArray(hermesArtifact.warnings) ? hermesArtifact.warnings : [],
      metrics: hermesResult.metrics || null,
      sessionId: hermesResult.sessionId || task.hermes?.sessionId || "",
      logs: Array.isArray(hermesResult.logs) ? hermesResult.logs : []
    };
    task.artifacts = artifacts;
    task.timeline = [
      ...(task.timeline || []),
      { at: timestamp, status: "completed", message: task.summary }
    ];
    return this.saveTask(task);
  }

  async failTask(taskId = "", error = {}) {
    const task = await this.readTask(taskId);
    if (!task) {
      return null;
    }
    const timestamp = now();
    const message = clipTaskMessage(error?.message || "单元测试用例生成失败。");
    task.status = "failed";
    task.failedAt = timestamp;
    task.updatedAt = timestamp;
    task.errorMessage = message;
    task.progress = buildProgress("failed", message);
    task.hermes = {
      ...(task.hermes || {}),
      errorCode: error?.code || "unit_test_case_generation_failed",
      errorDetails: error?.details || null
    };
    task.timeline = [
      ...(task.timeline || []),
      { at: timestamp, status: "failed", message }
    ];
    return this.saveTask(task);
  }

  async recoverStaleTasks(maxAgeMs = 30 * 60 * 1000) {
    const tasks = await this.listTasks();
    const cutoff = Date.now() - maxAgeMs;
    for (const task of tasks) {
      const updatedAt = Date.parse(task.updatedAt || task.createdAt || "") || 0;
      if (["queued", "running"].includes(task.status) && updatedAt < cutoff) {
        if (task.pipeline?.jobId) await this.reconcileTask(task.id);
        else if (task.status === "running") await this.failTask(task.id, createHttpError("服务重启后任务缺少可恢复的 Windows jobId。", 500, "unit_test_case_task_recovered_failed"));
      }
    }
  }

  async reconcileTask(taskId = "") {
    const normalizedTaskId = String(taskId || "").trim();
    const pending = this.deliveryRuns.get(normalizedTaskId);
    if (pending) return pending;
    const execution = this.reconcileTaskUnlocked(normalizedTaskId).finally(() => {
      if (this.deliveryRuns.get(normalizedTaskId) === execution) this.deliveryRuns.delete(normalizedTaskId);
    });
    this.deliveryRuns.set(normalizedTaskId, execution);
    return execution;
  }

  async reconcileTaskUnlocked(taskId = "") {
    const task = await this.readTask(taskId); if (!task?.pipeline?.jobId || !["queued", "running"].includes(task.status)) return task;
    try {
      const workerProfile = resolveUnitTestWorkerProfile(task.workerProfile?.id || task.workerId || "");
      const hermesAgentClient = this.getHermesAgentClientForWorker(workerProfile);
      const job = await hermesAgentClient.getTcsdPipelineJob(task.pipeline.jobId, {
        localWorkspaceDir: task.workspace?.directory || ""
      }); await this.syncPipelineJob(taskId, job);
      if (job.status === "失败") {
        const failed = await this.failTask(taskId, createHttpError(job.error?.message || "Windows 阶段执行失败。", 502, job.error?.code || "tcsd_stage_failed"));
        await this.cleanupRemotePipelineUpload(hermesAgentClient, job.jobId);
        return failed;
      }
      if (job.status === "已取消") {
        return this.getTask(taskId);
      }
      if (["已完成", "部分完成"].includes(job.status)) {
        const completed = await this.completeTask(taskId, { status: "completed", summary: "TCSD 已完成。", outputFiles: job.artifacts || [] }, { metrics: { pipelineJobId: job.jobId } });
        await this.cleanupRemotePipelineUpload(hermesAgentClient, job.jobId);
        return completed;
      }
      return this.getTask(taskId);
    } catch (error) {
      if (error.code === "tcsd_job_not_found") return this.failTask(taskId, createHttpError("Windows Worker 中不存在该 jobId。", 404, "tcsd_job_not_found"));
      const deliveryFailure = normalizeWorkerDeliveryFailure(error);
      if (!deliveryFailure.retryable) {
        const rejected = await this.readTask(taskId);
        rejected.workerPending = false;
        rejected.workerDelivery = {
          ...(rejected.workerDelivery || {}),
          ...deliveryFailure,
          attemptCount: Number(rejected.workerDelivery?.attemptCount || 0) + 1,
          firstFailureAt: rejected.workerDelivery?.firstFailureAt || now(),
          lastFailureAt: now()
        };
        await this.saveTask(rejected);
        return this.failTask(taskId, createHttpError("Windows Worker 拒绝了作业查询。", deliveryFailure.httpStatus || 502, error.code || "tcsd_worker_poll_rejected", deliveryFailure));
      }
      const pending = await this.readTask(taskId);
      pending.status = "running";
      pending.workerPending = true;
      pending.workerDelivery = {
        ...(pending.workerDelivery || {}),
        ...deliveryFailure,
        attemptCount: Number(pending.workerDelivery?.attemptCount || 0) + 1,
        firstFailureAt: pending.workerDelivery?.firstFailureAt || now(),
        lastFailureAt: now()
      };
      pending.updatedAt = now();
      pending.progress = buildProgress("running", "Windows Worker 连接暂时中断，等待后台重试。");
      await this.saveTask(pending);
      return pending;
    }
  }

  async reconcileRemoteTasks() {
    const results = [];
    for (const task of await this.listTasks()) {
      if (!["queued", "running"].includes(task.status)) continue;
      const nextAttemptAt = Date.parse(task.workerDelivery?.nextAttemptAt || "") || 0;
      if (!task.pipeline?.jobId && nextAttemptAt > Date.now()) continue;
      results.push(task.pipeline?.jobId ? await this.reconcileTask(task.id) : await this.runTask(task.id));
    }
    return results;
  }

  async getArtifact(taskId = "", artifactId = "") {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "unit_test_case_task_not_found");
    }
    const artifact = (task.artifacts || []).find((item) => item.id === artifactId || item.fileName === artifactId);
    if (!artifact) {
      throw createHttpError("结果文件不存在。", 404, "unit_test_case_artifact_not_found");
    }
    if (!isWorkbookOutput(artifact.relativePath)) {
      throw createHttpError("结果文件路径不在允许的 outputs/*.xlsx 范围内。", 403, "unit_test_case_artifact_forbidden");
    }
    const workspaceDir = path.resolve(task.workspace?.directory || "");
    const absolutePath = path.resolve(workspaceDir, ...artifact.relativePath.split("/"));
    if (!absolutePath.startsWith(`${workspaceDir}${path.sep}`) || !(await pathExists(absolutePath))) {
      throw createHttpError("结果文件不存在或路径非法。", 404, "unit_test_case_artifact_not_found");
    }
    return {
      ...artifact,
      fileName: artifact.relativePath === (task.pipeline?.stages || [])
        .find((stage) => Number(stage?.index) === 11)
        ?.checkpoint?.artifacts?.find((item) => item?.kind === "xlsx" && item?.path)
        ?.path
        ? finalWorkbookFileName(task)
        : artifact.fileName,
      absolutePath
    };
  }
}
