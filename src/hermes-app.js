import express from "express";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { createWriteStream, promises as fs } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { config } from "./config.js";
import { ExtractionService } from "./services/extraction-service.js";
import { LlmService } from "./services/llm-service.js";
import { TemplateService } from "./services/template-service.js";
import {
  buildOutlineFromRecall,
  recallSkillInventory,
  selectEvidenceForGeneration
} from "./services/software-requirement-agent-shared.js";
import { SlxModelAnalysisService } from "./services/slx-model-analysis-service.js";
import { ModelRequirementViewService } from "./services/model-requirement-view-service.js";
import { HermesAgentClient } from "./services/hermes-agent-client.js";
import { TcsdPipelineJobService } from "./services/tcsd-pipeline-job-service.js";
import { TCSD_ERROR_CODES, isTerminalJobStatus } from "./services/tcsd-pipeline-contract.js";
import { TcsdDshStageExecutor } from "./services/tcsd-dsh-stage-executor.js";
import { TcsdDshSkillRegistry } from "./services/tcsd-dsh-skill-registry.js";
import { TcsdHermesStageExecutor } from "./services/tcsd-hermes-stage-executor.js";
import { TcsdHermesSkillRegistry } from "./services/tcsd-hermes-skill-registry.js";
import { SoftwareDetailPipelineJobService, isTerminalSoftwareDetailJobStatus } from "./services/software-detail-pipeline-job-service.js";
import { SoftwareDetailHermesStageExecutor } from "./services/software-detail-hermes-stage-executor.js";
import {
  assertWorkspaceOutsideManagedSession,
  relocateUploadedWorkspace
} from "./services/hermes-upload-relocation.js";
import { SerialGate } from "./services/serial-gate.js";
import { SoftwareDetailHermesSkillRegistry } from "./services/software-detail-hermes-skill-registry.js";
import { SoftwareDetailMatlabLeaseClient } from "./services/software-detail-matlab-lease-client.js";

const execFileAsync = promisify(execFile);

const MAX_TRANSFERRED_TCSD_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_MULTIPART_FILE_COUNT = 2048;
const MAX_MULTIPART_TOTAL_BYTES = 1024 * 1024 * 1024;

function createHttpError(message, statusCode = 400, code = "hermes_request_invalid") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function now() {
  return new Date().toISOString();
}

function safeTcsdAuditId(value = "") {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(normalized) ? normalized : "";
}

function ensureTcsdCorrelation(req, res) {
  const correlationId =
    safeTcsdAuditId(req.sdgCorrelationId) ||
    safeTcsdAuditId(req.get("x-sdg-correlation-id")) ||
    `tcsd-${randomUUID()}`;
  req.sdgCorrelationId = correlationId;
  res.set("X-SDG-Correlation-ID", correlationId);
  return correlationId;
}

function logTcsdRequest(event, fields = {}) {
  console.info(JSON.stringify({
    type: "tcsd_worker_request",
    event,
    at: now(),
    ...(safeTcsdAuditId(fields.correlationId) ? { correlationId: safeTcsdAuditId(fields.correlationId) } : {}),
    ...(safeTcsdAuditId(fields.taskId) ? { taskId: safeTcsdAuditId(fields.taskId) } : {}),
    ...(safeTcsdAuditId(fields.jobId) ? { jobId: safeTcsdAuditId(fields.jobId) } : {}),
    ...(safeTcsdAuditId(fields.code) ? { code: safeTcsdAuditId(fields.code) } : {}),
    ...(safeTcsdAuditId(fields.prepareFailureReason) ? { prepareFailureReason: safeTcsdAuditId(fields.prepareFailureReason) } : {}),
    ...(Number.isInteger(fields.httpStatus) ? { httpStatus: fields.httpStatus } : {})
  }));
}

function normalizeAllowedPaths(allowedPaths = []) {
  return Array.isArray(allowedPaths)
    ? allowedPaths.map((item) => path.resolve(String(item || ""))).filter(Boolean)
    : [];
}

function isPathAllowed(targetPath = "", allowedPaths = []) {
  const resolvedTarget = path.resolve(String(targetPath || ""));
  return allowedPaths.some((allowedPath) => resolvedTarget === allowedPath || resolvedTarget.startsWith(`${allowedPath}${path.sep}`));
}

function requireHermesAuth(req, res, next) {
  const isTcsdRequest = String(req.path || "").startsWith("/internal/tcsd-pipeline/");
  const correlationId = isTcsdRequest ? ensureTcsdCorrelation(req, res) : "";
  const authToken = String(config.hermes.authToken || "").trim();
  if (!authToken) {
    if (isTcsdRequest) logTcsdRequest("auth_accepted", { correlationId });
    return next();
  }
  const header = String(req.get("authorization") || "");
  if (header === `Bearer ${authToken}`) {
    if (isTcsdRequest) logTcsdRequest("auth_accepted", { correlationId });
    return next();
  }
  if (isTcsdRequest) {
    logTcsdRequest("auth_rejected", {
      correlationId,
      httpStatus: 401,
      code: "hermes_unauthorized"
    });
  }
  return res.status(401).json({
    error: "Invalid Hermes agent token",
    code: "hermes_unauthorized",
    ...(correlationId ? { correlationId } : {})
  });
}

function parseJsonField(value = "", fallback = {}) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    throw createHttpError("Invalid multipart JSON field", 400, "hermes_invalid_upload_manifest");
  }
}

function safeUploadRelativePath(value = "") {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join(path.sep);
  return normalized || "uploaded-file";
}

function getHermesUploadTempDir() {
  return config.hermes.uploadTempDir || path.join(config.rootDir || process.cwd(), "tmp", "hermes-agent-uploads");
}

export function createAggregateLimitedUploadStorage(destination, maxTotalBytes) {
  return {
    _handleFile(req, file, callback) {
      const filename = `upload-${Date.now()}-${randomUUID()}`;
      const targetPath = path.join(destination, filename);
      let fileBytes = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, done) {
          fileBytes += chunk.length;
          req.sdgMultipartBytes = Number(req.sdgMultipartBytes || 0) + chunk.length;
          if (req.sdgMultipartBytes > maxTotalBytes) {
            return done(
              createHttpError(
                "Multipart upload exceeds the aggregate size limit",
                413,
                "hermes_upload_total_too_large"
              )
            );
          }
          return done(null, chunk);
        }
      });
      pipeline(file.stream, limiter, createWriteStream(targetPath, { flags: "wx" }))
        .then(() => callback(null, {
          destination,
          filename,
          path: targetPath,
          size: fileBytes
        }))
        .catch(async (error) => {
          await fs.rm(targetPath, { force: true }).catch(() => {});
          callback(error);
        });
    },
    _removeFile(_req, file, callback) {
      const targetPath = String(file?.path || "");
      if (!targetPath) return callback();
      fs.rm(targetPath, { force: true }).then(() => callback(), callback);
    }
  };
}

function isManagedUploadSession(sessionDir = "", uploadRoot = getHermesUploadTempDir()) {
  const root = path.resolve(uploadRoot);
  const candidate = path.resolve(String(sessionDir || ""));
  return candidate !== root && path.dirname(candidate) === root && path.basename(candidate).startsWith("step-");
}

function comparePathText(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function replaceUploadedPath(value = "", mappings = []) {
  const original = String(value || "");
  const normalized = comparePathText(original);
  for (const mapping of mappings) {
    const sourceRoot = comparePathText(mapping.sourceRoot);
    if (!sourceRoot) {
      continue;
    }
    if (mapping.type === "file") {
      if (normalized === sourceRoot) {
        return mapping.remoteRoot;
      }
      continue;
    }
    if (normalized === sourceRoot) {
      return mapping.remoteRoot;
    }
    if (normalized.startsWith(`${sourceRoot}/`)) {
      const relativePath = normalized.slice(sourceRoot.length + 1);
      return path.join(mapping.remoteRoot, ...relativePath.split("/").filter(Boolean));
    }
  }
  return original;
}

function replaceUploadedPaths(value, mappings = []) {
  if (typeof value === "string") {
    return replaceUploadedPath(value, mappings);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceUploadedPaths(item, mappings));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceUploadedPaths(entry, mappings)])
    );
  }
  return value;
}

async function moveFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.rename(source, destination);
  } catch (_error) {
    await fs.copyFile(source, destination);
    await fs.rm(source, { force: true }).catch(() => {});
  }
}

async function prepareMultipartStepPayload(req) {
  const payload = parseJsonField(req.body?.payload || "{}", {});
  const uploadManifest = parseJsonField(req.body?.uploadManifest || "{}", { roots: [], files: [] });
  const uploadedFiles = new Map((Array.isArray(req.files) ? req.files : []).map((file) => [file.fieldname, file]));
  const totalBytes = (Array.isArray(req.files) ? req.files : [])
    .reduce((total, file) => total + Number(file.size || 0), 0);
  if (totalBytes > Number(config.hermes.maxUploadTotalBytes || MAX_MULTIPART_TOTAL_BYTES)) {
    throw createHttpError("Multipart upload exceeds the aggregate size limit", 413, "hermes_upload_total_too_large");
  }
  const sessionDir = path.join(getHermesUploadTempDir(), `step-${Date.now()}-${randomUUID()}`);
  await fs.mkdir(sessionDir, { recursive: true });

  const rootMappings = (Array.isArray(uploadManifest.roots) ? uploadManifest.roots : []).map((root, index) => {
    const type = root?.type === "file" ? "file" : "directory";
    const remoteRoot =
      type === "file"
        ? path.join(sessionDir, `root-${index}`, path.basename(String(root?.sourceRoot || "")) || "uploaded-file")
        : path.join(sessionDir, `root-${index}`);
    return {
      sourceRoot: String(root?.sourceRoot || ""),
      remoteRoot,
      type
    };
  });

  for (const fileEntry of Array.isArray(uploadManifest.files) ? uploadManifest.files : []) {
    const upload = uploadedFiles.get(String(fileEntry?.fieldName || ""));
    if (!upload) {
      throw createHttpError("Multipart upload is missing a referenced file", 400, "hermes_upload_file_missing");
    }
    const rootIndex = Number(fileEntry?.rootIndex || 0) || 0;
    const mapping = rootMappings[rootIndex];
    if (!mapping) {
      throw createHttpError("Multipart upload has an invalid root index", 400, "hermes_upload_root_invalid");
    }
    const targetPath =
      mapping.type === "file"
        ? mapping.remoteRoot
        : path.join(mapping.remoteRoot, safeUploadRelativePath(fileEntry?.relativePath || upload.originalname || ""));
    await moveFile(upload.path, targetPath);
  }

  return {
    payload: replaceUploadedPaths(payload, rootMappings),
    cleanupDir: sessionDir
  };
}

async function buildWindowsWorkerProbeArtifact(inputArtifact = {}, allowedPaths = []) {
  const probeFilePath = path.resolve(String(inputArtifact.probeFilePath || ""));
  if (!probeFilePath) {
    throw createHttpError("probeFilePath is required for windows_worker_probe");
  }
  if (!isPathAllowed(probeFilePath, allowedPaths)) {
    throw createHttpError(`File path is not allowed: ${probeFilePath}`, 403, "hermes_path_forbidden");
  }

  const stat = await fs.stat(probeFilePath).catch(() => null);
  const content = stat?.isFile() ? await fs.readFile(probeFilePath, "utf8").catch(() => "") : "";
  const expectedText = String(inputArtifact.expectedText || "");
  const contentMatches = expectedText ? content === expectedText : Boolean(content);

  return {
    probeId: inputArtifact.probeId || "",
    ok: Boolean(stat?.isFile() && contentMatches),
    service: "hermes-agent",
    checkedAt: now(),
    uploadTempDir: getHermesUploadTempDir(),
    receivedPath: probeFilePath,
    receivedDirectory: path.dirname(probeFilePath),
    retainedUploadedFiles: Boolean(inputArtifact.retainUploadedFiles),
    file: {
      exists: Boolean(stat?.isFile()),
      size: stat?.size || 0,
      modifiedAt: stat?.mtime ? stat.mtime.toISOString() : null,
      contentMatches,
      contentPreview: content.slice(0, 500)
    }
  };
}

function normalizeUnitTestProject(project = {}) {
  const id = String(project?.id || "").trim();
  if (!/^\d{2,}$/.test(id)) {
    throw createHttpError("unitTestProject.id must be a numeric project number such as 01", 400, "hermes_invalid_unit_test_project");
  }
  return {
    id,
    name: String(project.name || "").trim(),
    label: String(project.label || `${id}_${String(project.name || "").trim()}`).trim()
  };
}

async function assertNoSymlinks(rootDir = "", currentDir = rootDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      throw createHttpError(
        `Project addon package cannot contain symbolic links: ${path.relative(rootDir, absolutePath)}`,
        400,
        "hermes_project_addon_symlink_forbidden"
      );
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(rootDir, absolutePath);
    }
  }
}

async function listAddonFileTargets(sourceDir = "", workspaceDir = "") {
  const targets = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(sourceDir, absolutePath);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        targets.push(path.resolve(workspaceDir, relativePath));
      }
    }
  }
  await walk(sourceDir);
  return targets;
}

async function copyUnitTestProjectAddon(inputArtifact = {}) {
  const unitTestProject = normalizeUnitTestProject(inputArtifact.unitTestProject || {});
  const addonRoot = path.resolve(config.unitTestCase?.projectAddonRoot || path.join(config.rootDir, ".local", "project-addons"));
  const sourceDir = path.resolve(addonRoot, unitTestProject.id);
  const realAddonRoot = await fs.realpath(addonRoot).catch(() => {
    throw createHttpError(`Project addon root does not exist: ${addonRoot}`, 400, "hermes_project_addon_root_missing");
  });
  const realSourceDir = await fs.realpath(sourceDir).catch(() => {
    throw createHttpError(`Project addon folder does not exist for ${unitTestProject.label}: ${sourceDir}`, 400, "hermes_project_addon_missing");
  });
  if (!isPathAllowed(realSourceDir, [realAddonRoot])) {
    throw createHttpError("Project addon folder escaped the configured addon root.", 403, "hermes_project_addon_path_forbidden");
  }
  const sourceStat = await fs.stat(realSourceDir);
  if (!sourceStat.isDirectory()) {
    throw createHttpError(`Project addon path is not a folder: ${sourceDir}`, 400, "hermes_project_addon_not_directory");
  }

  await assertNoSymlinks(realSourceDir);
  const workspaceDir = path.resolve(inputArtifact.workspaceDir);
  const protectedInputs = new Set(
    [
      inputArtifact.modelSlxPath,
      inputArtifact.modelMatPath,
      inputArtifact.modelInitScriptPath
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => path.resolve(item))
  );
  const targets = await listAddonFileTargets(realSourceDir, workspaceDir);
  for (const target of targets) {
    if (protectedInputs.has(target)) {
      throw createHttpError(
        `Project addon package would overwrite uploaded input file: ${path.basename(target)}`,
        400,
        "hermes_project_addon_input_conflict"
      );
    }
  }
  await fs.cp(realSourceDir, workspaceDir, { recursive: true, force: true, errorOnExist: false });
  return {
    unitTestProject,
    addonRoot,
    sourceDir: realSourceDir,
    copiedFileCount: targets.length
  };
}

function normalizeMaterialFiles(files = [], allowedPaths = []) {
  return (Array.isArray(files) ? files : []).map((file) => {
    const absolutePath = path.resolve(String(file.absolutePath || ""));
    if (!absolutePath || !isPathAllowed(absolutePath, allowedPaths)) {
      throw createHttpError(
        `File path is not allowed: ${file.originalName || file.fileName || absolutePath}`,
        403,
        "hermes_path_forbidden"
      );
    }
    return {
      id: file.id || file.assetId || "",
      role: file.role || file.fileRole || "",
      fileRole: file.fileRole || file.role || "",
      originalName: file.originalName || file.fileName || path.basename(absolutePath),
      absolutePath,
      relativePath: file.relativePath || "",
      storedName: file.storedName || "",
      mimeType: file.mimeType || "",
      size: Number(file.size || 0) || 0
    };
  });
}

async function normalizeProjectInitScripts(inputArtifact = {}, workspaceDir = "", allowedPaths = []) {
  const rawScripts = Array.isArray(inputArtifact.projectInitScripts) ? inputArtifact.projectInitScripts : [];
  const normalized = [];
  for (const rawScript of rawScripts) {
    const scriptValue = String(rawScript || "").trim();
    if (!scriptValue) {
      continue;
    }
    const absolutePath = path.isAbsolute(scriptValue) ? path.resolve(scriptValue) : path.resolve(workspaceDir, scriptValue);
    if (!isPathAllowed(absolutePath, allowedPaths)) {
      throw createHttpError(`projectInitScripts contains a path outside workspace: ${scriptValue}`, 403, "hermes_path_forbidden");
    }
    if (path.extname(absolutePath).toLowerCase() !== ".m") {
      throw createHttpError("projectInitScripts entries must point to .m files", 400, "hermes_invalid_init_script_path");
    }
    await fs.access(absolutePath);
    const relativePath = path.relative(workspaceDir, absolutePath).replace(/\\/g, "/");
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw createHttpError(`projectInitScripts contains a path outside workspace: ${scriptValue}`, 403, "hermes_path_forbidden");
    }
    if (!normalized.some((item) => item.toLowerCase() === relativePath.toLowerCase())) {
      normalized.push(relativePath);
    }
  }
  return normalized;
}

async function normalizeUnitTestCaseArtifact(inputArtifact = {}, allowedPaths = [], options = {}) {
  const stepLabel = options.stepType || "tcsd_stage_execute";
  const defaultSkillName = options.defaultSkillName || "tcsd-stage-skills";
  const defaultExpectedOutputPattern = options.defaultExpectedOutputPattern || "outputs/*_tcsd.xlsx";
  const workspaceValue = String(inputArtifact.workspaceDir || "").trim();
  if (!workspaceValue) {
    throw createHttpError(`workspaceDir is required for ${stepLabel}`);
  }
  const workspaceDir = path.resolve(workspaceValue);
  const effectiveAllowedPaths = allowedPaths.length ? allowedPaths : [workspaceDir];
  if (!isPathAllowed(workspaceDir, effectiveAllowedPaths)) {
    throw createHttpError(`Workspace path is not allowed: ${workspaceDir}`, 403, "hermes_path_forbidden");
  }

  const modelSlxValue = String(inputArtifact.modelSlxPath || "").trim();
  const modelMatValue = String(inputArtifact.modelMatPath || "").trim();
  if (!modelSlxValue || !modelMatValue) {
    throw createHttpError(`modelSlxPath and modelMatPath are required for ${stepLabel}`);
  }
  const modelSlxPath = path.resolve(modelSlxValue);
  const modelMatPath = path.resolve(modelMatValue);
  const modelInitScriptValue = String(inputArtifact.modelInitScriptPath || "").trim();
  const modelInitScriptPath = modelInitScriptValue ? path.resolve(modelInitScriptValue) : "";
  const outputDir = path.resolve(String(inputArtifact.outputDir || path.join(workspaceDir, "outputs")));
  for (const [label, filePath] of [
    ["modelSlxPath", modelSlxPath],
    ["modelMatPath", modelMatPath],
    ["modelInitScriptPath", modelInitScriptPath],
    ["outputDir", outputDir]
  ]) {
    if (!filePath) {
      continue;
    }
    if (!isPathAllowed(filePath, effectiveAllowedPaths)) {
      throw createHttpError(`${label} is not allowed: ${filePath}`, 403, "hermes_path_forbidden");
    }
  }
  if (path.extname(modelSlxPath).toLowerCase() !== ".slx") {
    throw createHttpError("modelSlxPath must point to a .slx file", 400, "hermes_invalid_slx_path");
  }
  if (path.extname(modelMatPath).toLowerCase() !== ".mat") {
    throw createHttpError("modelMatPath must point to a .mat file", 400, "hermes_invalid_mat_path");
  }
  if (modelInitScriptPath && path.extname(modelInitScriptPath).toLowerCase() !== ".m") {
    throw createHttpError("modelInitScriptPath must point to a .m file", 400, "hermes_invalid_init_script_path");
  }
  await fs.access(modelSlxPath);
  await fs.access(modelMatPath);
  if (modelInitScriptPath) {
    await fs.access(modelInitScriptPath);
  }
  await fs.mkdir(outputDir, { recursive: true });
  let projectInitScripts = await normalizeProjectInitScripts(inputArtifact, workspaceDir, effectiveAllowedPaths);
  if (modelInitScriptPath && projectInitScripts.length === 0) {
    projectInitScripts = [path.relative(workspaceDir, modelInitScriptPath).replace(/\\/g, "/")];
  }

  return {
    workspaceDir,
    modelSlxPath,
    modelMatPath,
    modelInitScriptPath,
    outputDir,
    unitTestProject: inputArtifact.unitTestProject && typeof inputArtifact.unitTestProject === "object"
      ? normalizeUnitTestProject(inputArtifact.unitTestProject)
      : null,
    skillName: String(inputArtifact.skillName || defaultSkillName).trim(),
    expectedOutputPattern: String(inputArtifact.expectedOutputPattern || defaultExpectedOutputPattern).trim(),
    modelSlxFileName: inputArtifact.modelSlxFileName || path.basename(modelSlxPath),
    modelSlxOriginalName: String(
      inputArtifact.modelSlxOriginalName || inputArtifact.modelSlxFileName || path.basename(modelSlxPath)
    ).trim(),
    modelMatFileName: inputArtifact.modelMatFileName || path.basename(modelMatPath),
    modelInitScriptFileName: modelInitScriptPath
      ? inputArtifact.modelInitScriptFileName || path.basename(modelInitScriptPath)
      : "",
    projectInitScripts
  };
}

function normalizeTcsdOutputRelativePath(value = "") {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    return "";
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    return "";
  }
  if (parts.length !== 2 || parts[0] !== "outputs" || !parts[1].toLowerCase().endsWith(".xlsx")) {
    return "";
  }
  return parts.join("/");
}

async function attachUnitTestCaseOutputFiles(artifact = {}, inputArtifact = {}) {
  const workspaceDir = path.resolve(String(inputArtifact.workspaceDir || ""));
  const outputDir = path.resolve(String(inputArtifact.outputDir || path.join(workspaceDir, "outputs")));
  if (!workspaceDir || !isPathAllowed(outputDir, [workspaceDir])) {
    return artifact;
  }

  const candidates = new Map();
  const addCandidate = (relativePath = "", meta = {}) => {
    const normalized = normalizeTcsdOutputRelativePath(relativePath);
    if (normalized) {
      candidates.set(normalized, { ...meta, relativePath: normalized });
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
    if (path.isAbsolute(String(itemPath))) {
      const absolute = path.resolve(String(itemPath));
      if (absolute.startsWith(`${workspaceDir}${path.sep}`)) {
        addCandidate(path.relative(workspaceDir, absolute), item);
      }
    } else {
      addCandidate(itemPath, item);
    }
  }

  const entries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx")) {
      addCandidate(path.join("outputs", entry.name));
    }
  }

  const outputFiles = [];
  for (const candidate of candidates.values()) {
    const absolutePath = path.resolve(workspaceDir, ...candidate.relativePath.split("/"));
    if (!absolutePath.startsWith(`${workspaceDir}${path.sep}`)) {
      continue;
    }
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_TRANSFERRED_TCSD_OUTPUT_BYTES) {
      continue;
    }
    outputFiles.push({
      relativePath: candidate.relativePath,
      fileName: candidate.fileName || path.basename(absolutePath),
      kind: candidate.kind || "tcsd_workbook",
      mimeType: candidate.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      description: candidate.description || "Generated TCSD Excel workbook",
      size: stat.size,
      encoding: "base64",
      contentBase64: (await fs.readFile(absolutePath)).toString("base64")
    });
  }

  return {
    ...artifact,
    outputFiles
  };
}

function normalizeSoftwareDetailOutputRelativePath(value = "") {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    return "";
  }
  const parts = normalized.split("/").filter(Boolean);
  if (
    parts.some((part) => part === "." || part === "..") ||
    parts.length !== 2 ||
    parts[0] !== "outputs" ||
    !parts[1].toLowerCase().endsWith(".docx")
  ) {
    return "";
  }
  return parts.join("/");
}

async function buildSoftwareDetailDocxTransfer(
  artifact = {},
  inputArtifact = {}
) {
  const workspaceDir = path.resolve(String(inputArtifact.workspaceDir || ""));
  const outputDir = path.resolve(
    String(inputArtifact.outputDir || path.join(workspaceDir, "outputs"))
  );
  if (!workspaceDir || !isPathAllowed(outputDir, [workspaceDir])) {
    return null;
  }
  const relativePath = normalizeSoftwareDetailOutputRelativePath(
    artifact.relativePath
  );
  if (!relativePath) {
    return null;
  }
  const absolutePath = path.resolve(
    workspaceDir,
    ...relativePath.split("/")
  );
  if (!absolutePath.startsWith(`${workspaceDir}${path.sep}`)) {
    return null;
  }
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (
    !stat?.isFile() ||
    stat.size <= 0 ||
    stat.size > MAX_TRANSFERRED_TCSD_OUTPUT_BYTES
  ) {
    return null;
  }
  const bytes = await fs.readFile(absolutePath);
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    return null;
  }
  return {
    ...artifact,
    relativePath,
    fileName: artifact.fileName || path.basename(absolutePath),
    kind: artifact.kind || "software_detail_docx",
    mimeType:
      artifact.mimeType ||
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    encoding: "base64",
    contentBase64: bytes.toString("base64")
  };
}

export async function attachSoftwareDetailOutputFiles(
  artifacts = [],
  inputArtifact = {}
) {
  const transferred = [];
  for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
    if (
      !artifact ||
      typeof artifact !== "object" ||
      artifact.role !== "detail-design-docx"
    ) {
      transferred.push(artifact);
      continue;
    }
    const transfer = await buildSoftwareDetailDocxTransfer(
      artifact,
      inputArtifact
    );
    if (transfer) {
      transferred.push(transfer);
    }
  }
  return transferred;
}

async function attachLegacySoftwareDetailOutputFiles(
  artifact = {},
  inputArtifact = {}
) {
  const outputFiles = [];
  for (const outputFile of Array.isArray(artifact.outputFiles)
    ? artifact.outputFiles
    : []) {
    const transfer = await buildSoftwareDetailDocxTransfer(
      outputFile,
      inputArtifact
    );
    if (transfer) {
      outputFiles.push(transfer);
    }
  }
  return {
    ...artifact,
    outputFiles
  };
}

function normalizeDocumentExtractionType(value) {
  if (value === "system_requirement") return "system_requirement";
  if (value === "detail_design") return "detail_design";
  return "software_requirement";
}

function getDocumentExtractionTitle(moduleName = "", targetDocumentType = "software_requirement") {
  const label =
    targetDocumentType === "system_requirement"
      ? "系统需求"
      : targetDocumentType === "detail_design"
        ? "详细设计"
        : "软件需求";
  return `${String(moduleName || "").trim() || "未命名模块"}${label}`;
}

function buildFallbackExtractedMarkdown(inputArtifact = {}) {
  const targetDocumentType = normalizeDocumentExtractionType(inputArtifact.targetDocumentType);
  const moduleName = inputArtifact?.module?.name || "未命名模块";
  const title = getDocumentExtractionTitle(moduleName, targetDocumentType);
  const sourceText = String(inputArtifact.sourceText || "").trim();
  const keySectionLabel = targetDocumentType === "software_requirement" ? "章节结构" : "章节信息";
  const fallbackBody = sourceText || "当前回退模式未提取到可用正文，请补充文本输入后重试。";
  return {
    targetDocumentType,
    title,
    markdown: `# ${title}\n\n## 文档信息\n\n- 文档类型：${targetDocumentType}\n- 来源：模块文档提取工具\n\n## ${keySectionLabel}\n\n- 待模型结合输入完善\n\n## 需求条目\n\n- 原文：\n  ${fallbackBody}\n\n## 提炼摘要\n\n- 主主题：待根据输入完善\n`,
    summary: `已生成${title}提取草稿`,
    keySections: ["文档信息", keySectionLabel, "需求条目", "提炼摘要"]
  };
}

function buildStepResponse(stepType, artifact, startedAt, extra = {}) {
  return {
    status: "succeeded",
    stepType,
    artifact,
    metrics: {
      durationMs: Date.now() - startedAt,
      ...(extra.metrics || {})
    },
    logs: extra.logs || [],
    error: null
  };
}

function truncateText(text = "", limit = 160) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, limit - 1))}…`;
}

async function readAllowedJsonFile(filePath = "", allowedPaths = [], baseDir = "") {
  const candidatePath = path.isAbsolute(String(filePath || ""))
    ? String(filePath || "")
    : path.join(baseDir || process.cwd(), String(filePath || ""));
  const absolutePath = path.resolve(candidatePath);
  if (!absolutePath || !isPathAllowed(absolutePath, allowedPaths)) {
    throw createHttpError(`File path is not allowed: ${filePath}`, 403, "hermes_path_forbidden");
  }
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

async function readAllowedTextFile(filePath = "", allowedPaths = [], baseDir = "") {
  const candidatePath = path.isAbsolute(String(filePath || ""))
    ? String(filePath || "")
    : path.join(baseDir || process.cwd(), String(filePath || ""));
  const absolutePath = path.resolve(candidatePath);
  if (!absolutePath || !isPathAllowed(absolutePath, allowedPaths)) {
    throw createHttpError(`File path is not allowed: ${filePath}`, 403, "hermes_path_forbidden");
  }
  return fs.readFile(absolutePath, "utf8");
}

function normalizeReplayLayer(value = "", fallback = "docType") {
  const trimmed = String(value || "").trim();
  return ["generic", "docType", "domain", "module"].includes(trimmed) ? trimmed : fallback;
}

function normalizeReplaySlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_");
}

function mapReplayAreaToKind(targetArea = "") {
  if (targetArea === "writing") return "writing_rule";
  if (targetArea === "extraction") return "extraction_rule";
  if (targetArea === "examples") return "bad_example";
  if (targetArea === "domain_knowledge") return "rule_hint";
  return "validation_rule";
}

function mapReplayKindToTargetFile(kind = "") {
  if (kind === "writing_rule") return "requirement_writing.md";
  if (kind === "extraction_rule") return "requirement_extraction.md";
  if (kind === "validation_rule") return "requirement_validation.md";
  if (kind === "good_example") return "examples/good_examples.md";
  if (kind === "bad_example") return "examples/bad_examples.md";
  return "domain-knowledge.json";
}

function extractReplayBriefSummary(taskBrief = "") {
  return truncateText(
    String(taskBrief || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*#\s]+/, "").trim())
      .find(Boolean) || "",
    220
  );
}

function resolveReplayContextFiles(inputArtifact = {}, allowedPaths = []) {
  const replayContext = inputArtifact.replayContext && typeof inputArtifact.replayContext === "object"
    ? inputArtifact.replayContext
    : {};
  const replayContextDir = replayContext.directory || inputArtifact.replayContextDir || "";
  const resolvedDir = path.resolve(String(replayContextDir || ""));
  if (!resolvedDir) {
    throw createHttpError("replayContext.directory is required for replay_proposal_generate");
  }
  if (!isPathAllowed(resolvedDir, allowedPaths)) {
    throw createHttpError(`File path is not allowed: ${resolvedDir}`, 403, "hermes_path_forbidden");
  }
  return {
    replayContextDir: resolvedDir,
    manifestPath: path.resolve(
      String(
        replayContext.manifestPath ||
          inputArtifact.manifestPath ||
          path.join(resolvedDir, replayContext.manifestFileName || "manifest.json")
      )
    ),
    taskBriefPath: path.resolve(
      String(
        replayContext.taskBriefPath ||
          inputArtifact.taskBriefPath ||
          path.join(resolvedDir, replayContext.taskBriefFileName || "task-brief.md")
      )
    )
  };
}

function resolveReplayRecords(manifest = {}, legacyRejections = {}) {
  if (Array.isArray(manifest.rejectionContext?.records)) {
    return manifest.rejectionContext.records;
  }
  if (Array.isArray(manifest.records)) {
    return manifest.records;
  }
  return Array.isArray(legacyRejections.records) ? legacyRejections.records : [];
}

function resolveReplayInventory(manifest = {}, legacyInventory = {}) {
  if (Array.isArray(manifest.layerSkillInventory)) {
    return manifest.layerSkillInventory;
  }
  if (Array.isArray(manifest.candidateSkillInventory)) {
    return manifest.candidateSkillInventory;
  }
  if (Array.isArray(manifest.layerSkillItems)) {
    return manifest.layerSkillItems;
  }
  return Array.isArray(legacyInventory.items) ? legacyInventory.items : [];
}

function chooseReplayCandidate(inventoryItems = [], targetKind = "", targetLayer = "") {
  const normalizedItems = Array.isArray(inventoryItems) ? inventoryItems : [];
  return (
    normalizedItems.find((item) => String(item?.kind || item?.targetKind || "").trim() === targetKind && String(item?.layer || item?.targetLayer || "").trim() === targetLayer) ||
    normalizedItems.find((item) => String(item?.kind || item?.targetKind || "").trim() === targetKind) ||
    normalizedItems.find((item) => String(item?.layer || item?.targetLayer || "").trim() === targetLayer) ||
    normalizedItems[0] ||
    null
  );
}

function buildReplayFallbackProposal(manifest = {}, taskBrief = "", options = {}) {
  const replayScope = manifest.replayScope || manifest.taskContext || {};
  const records = resolveReplayRecords(manifest, options.legacyRejections || {});
  const inventoryItems = resolveReplayInventory(manifest, options.legacyInventory || {});
  const fallbackArea = Array.isArray(replayScope.targetAreas) && replayScope.targetAreas.length
    ? String(replayScope.targetAreas[0] || "").trim() || "validation"
    : "validation";
  const fallbackReason = extractReplayBriefSummary(taskBrief);
  const grouped = new Map();
  for (const record of records) {
    const targetArea = String(record?.targetArea || fallbackArea).trim() || fallbackArea;
    if (!grouped.has(targetArea)) {
      grouped.set(targetArea, []);
    }
    grouped.get(targetArea).push(record);
  }
  if (!grouped.size) {
    grouped.set(fallbackArea, []);
  }

  const items = [];
  for (const [targetArea, areaRecords] of grouped.entries()) {
    const allowedKindsForReplay = Array.isArray(replayScope.allowedKindsForReplay) ? replayScope.allowedKindsForReplay : [];
    const preferredKind = mapReplayAreaToKind(targetArea);
    const targetKind = allowedKindsForReplay.includes(preferredKind) ? preferredKind : allowedKindsForReplay[0] || preferredKind;
    const targetLayer = normalizeReplayLayer(replayScope.targetLayerConstraint || "", "docType");
    const targetProfileKeyConstraint = normalizeReplaySlug(replayScope.targetProfileKeyConstraint || "");
    const documentType = normalizeReplaySlug(replayScope.documentType || "software_requirement") || "software_requirement";
    const domain = normalizeReplaySlug(replayScope.domain || "embedded_vcu") || "embedded_vcu";
    const moduleProfileKey = normalizeReplaySlug(replayScope.moduleSkillKey || replayScope.moduleName || "");
    const targetProfileKey =
      targetProfileKeyConstraint ||
      (targetLayer === "module"
        ? moduleProfileKey || documentType
        : targetLayer === "domain"
          ? domain
          : targetLayer === "docType"
            ? documentType
            : "generic");
    const candidate = chooseReplayCandidate(inventoryItems, targetKind, targetLayer);
    const evidenceRefs = areaRecords.map((record) => record?.id).filter(Boolean);
    const firstRecord = areaRecords[0] || {};
    const reasonText = truncateText(
      areaRecords
        .flatMap((record) => [record?.expectedNote, record?.reasonText])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("; ") || fallbackReason || "需要补充稳定规则边界。",
      260
    );
    const currentContent = String(candidate?.content || candidate?.contentSummary || "").trim();
    const afterContent = candidate
      ? `${currentContent || candidate?.title || "当前规则"}\n补充约束：${reasonText}`
      : `建议补充以下规则：${reasonText}`;
    const titleBase = String(firstRecord?.reasonCategory || targetArea || "Replay").trim() || "Replay";

    items.push({
      conclusionType: candidate ? "modify_existing" : "create_new",
      action: candidate ? "modify_skill_item" : "add_skill_item",
      targetSkillCode: String(candidate?.skillCode || candidate?.ruleId || "").trim(),
      targetLayer: String(candidate?.layer || candidate?.targetLayer || targetLayer).trim() || targetLayer,
      targetProfileKey:
        normalizeReplaySlug(candidate?.profileKey || candidate?.targetProfileKey || "") || targetProfileKey,
      targetKind: String(candidate?.kind || candidate?.targetKind || targetKind).trim() || targetKind,
      targetInsertionHint: String(candidate?.targetFile || mapReplayKindToTargetFile(targetKind)).trim(),
      title: `${titleBase}补充规则`,
      changeSummary: candidate
        ? `修改「${candidate.title || candidate.skillCode || candidate.ruleId || titleBase}」，补充本次驳回暴露的边界约束。`
        : `新增「${titleBase}补充规则」，沉淀本次驳回暴露的边界约束。`,
      fallbackReason: String(firstRecord?.reasonText || "").trim(),
      whyCurrent: "当前有效技能未能稳定拦截这组驳回案例。",
      whyChange: "补充或修订同层规则后，可减少同类问题再次出现。",
      beforeContent: currentContent,
      afterContent,
      evidenceRefs,
      newRuleDraft: candidate
        ? null
        : {
            title: `${titleBase}补充规则`,
            content: afterContent,
            structuredPayload: null,
            rules: []
          }
    });
  }

  return {
    summary: records.length
      ? `已基于 ${records.length} 条驳回记录生成回放技能修改建议。`
      : "已生成回放技能修改建议。",
    decisionSummary: items.some((item) => item.action === "modify_skill_item")
      ? `优先命中已有同层 atomic skill ${items.filter((item) => item.action === "modify_skill_item").length} 条。`
      : "当前同层 inventory 中没有可直接承接问题的 atomic skill，建议新增规则。",
    rootCauses: [...new Set(records.map((record) => record?.reasonCategory).filter(Boolean))].map(
      (item) => `多条驳回记录共同指向“${item}”相关问题。`
    ),
    validatorSuggestions: [],
    items
  };
}

function inferAnchorType(anchorLike = {}) {
  const tags = Array.isArray(anchorLike.tags) ? anchorLike.tags : [];
  if (tags.includes("diagnostic")) return "diagnostic";
  if (tags.includes("interface")) return "interface";
  if (tags.includes("timing")) return "timing";
  if (tags.includes("state")) return "state";
  if (tags.includes("comment")) return "comment";
  if (tags.includes("code")) return "code";
  return "functional";
}

function sanitizeAnchorItem(item = {}, index = 0) {
  const anchorId = String(item.anchorId || item.id || `anchor-${index + 1}`).trim();
  return {
    anchorId,
    id: anchorId,
    assetId: String(item.assetId || item.fileId || "").trim(),
    fileName: String(item.fileName || item.originalName || "").trim(),
    fileRole: String(item.fileRole || item.role || "").trim(),
    location: String(item.location || "").trim(),
    anchorType: String(item.anchorType || inferAnchorType(item)).trim() || "functional",
    excerpt: String(item.excerpt || "").trim(),
    summary: String(item.summary || item.excerpt || "").trim(),
    tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
    confidence: Number(item.confidence || 0) || 0
  };
}

function buildAnchorsFromExtractions(extractions = [], files = [], options = {}) {
  const limit = Math.max(1, Number(options.limit || 200) || 200);
  const fileById = new Map(
    files
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item])
  );
  const fileByPath = new Map(
    files
      .filter((item) => item?.absolutePath)
      .map((item) => [path.resolve(item.absolutePath), item])
  );
  const anchors = [];

  for (const extraction of Array.isArray(extractions) ? extractions : []) {
    const extractionPath = extraction.absolutePath ? path.resolve(String(extraction.absolutePath)) : "";
    const matchedFile =
      fileById.get(String(extraction.fileId || "")) ||
      fileByPath.get(extractionPath) ||
      files.find((item) => item.originalName === extraction.fileName) ||
      null;

    const fileName =
      String(extraction.fileName || matchedFile?.originalName || matchedFile?.fileName || path.basename(extractionPath || "")).trim();
    const fileRole = String(extraction.fileRole || matchedFile?.fileRole || matchedFile?.role || "").trim();
    const assetId = String(matchedFile?.id || extraction.fileId || fileName || `asset-${anchors.length + 1}`).trim();
    const evidenceList = Array.isArray(extraction.evidence) ? extraction.evidence : [];

    evidenceList.forEach((evidence, evidenceIndex) => {
      if (anchors.length >= limit) {
        return;
      }
      const anchor = sanitizeAnchorItem(
        {
          ...evidence,
          anchorId: evidence.id || `${assetId}:anchor:${evidenceIndex + 1}`,
          assetId,
          fileName,
          fileRole,
          summary: evidence.summary || truncateText(evidence.excerpt || "", 140)
        },
        anchors.length
      );
      anchors.push(anchor);
    });

    if (anchors.length >= limit) {
      break;
    }
  }

  return anchors;
}

function anchorsToEvidence(anchors = []) {
  return (Array.isArray(anchors) ? anchors : []).map((anchor, index) => {
    const normalized = sanitizeAnchorItem(anchor, index);
    return {
      id: normalized.anchorId,
      fileName: normalized.fileName,
      fileRole: normalized.fileRole,
      location: normalized.location,
      excerpt: normalized.excerpt,
      tags: normalized.tags,
      confidence: normalized.confidence
    };
  });
}

function buildAnchorAwareOutline(recalledAtoms = [], anchors = [], options = {}) {
  const evidence = anchorsToEvidence(anchors);
  const outline = buildOutlineFromRecall(recalledAtoms, evidence, options);
  const sections = (Array.isArray(outline.sections) ? outline.sections : []).map((section, index) => ({
    id: String(section.id || `section-${index + 1}`),
    title: String(section.topic || section.title || `主题 ${index + 1}`),
    topic: String(section.topic || section.title || `主题 ${index + 1}`),
    objective: String(section.objective || "").trim(),
    anchorIds: Array.isArray(section.evidenceRefs) ? section.evidenceRefs.filter(Boolean) : []
  }));

  return {
    summary: String(outline.summary || "").trim(),
    sections
  };
}

function buildAnchorAwareItems(project = {}, template = {}, anchors = [], recalledAtoms = [], outline = {}) {
  const sectionPool =
    Array.isArray(outline.sections) && outline.sections.length
      ? outline.sections
      : buildAnchorAwareOutline(recalledAtoms, anchors, {
          maxSections: config.hermes.maxOutlineSections
        }).sections;

  const anchorMap = new Map((Array.isArray(anchors) ? anchors : []).map((anchor, index) => {
    const normalized = sanitizeAnchorItem(anchor, index);
    return [normalized.anchorId, normalized];
  }));
  const fallbackAnchors = Array.from(anchorMap.values());

  const items = sectionPool.slice(0, 8).map((section, index) => {
    const sourceAnchorIds = Array.isArray(section.anchorIds) ? section.anchorIds.filter((id) => anchorMap.has(id)) : [];
    const matchedAnchor =
      anchorMap.get(sourceAnchorIds[0]) ||
      fallbackAnchors[index] ||
      fallbackAnchors[0] ||
      null;
    const title = String(section.title || section.topic || `软件需求 ${index + 1}`).trim() || `软件需求 ${index + 1}`;
    const evidenceText = matchedAnchor?.excerpt || String(section.objective || "").trim() || "当前资产支持该主题。";
    return {
      requirementId: `${template.requirementIdPrefix || "SWR"}-${String(index + 1).padStart(3, "0")}`,
      title,
      requirementText: `软件应${truncateText(evidenceText, 180).replace(/^[，。；：,\s]+/, "").replace(/^(软件应|系统应)/, "") || "根据当前资产执行对应功能。"}。`,
      type: matchedAnchor?.anchorType || "functional",
      sourceAnchorIds: sourceAnchorIds.length
        ? sourceAnchorIds
        : matchedAnchor?.anchorId
          ? [matchedAnchor.anchorId]
          : [],
      verificationHint: "通过评审、仿真或联调验证条目与来源锚点一致。",
      rationale: recalledAtoms[index]?.matchedReason || "基于当前资产锚点、提纲和 skill 约束生成。",
      confidence: Number(matchedAnchor?.confidence || 0.55) || 0.55,
      conflictNote: ""
    };
  });

  if (items.length > 0) {
    return items;
  }

  return [
    {
      requirementId: `${template.requirementIdPrefix || "SWR"}-001`,
      title: `${project.name || "当前模块"} 核心需求`,
      requirementText: "软件应根据当前资产与约束生成可审核的软件需求条目。",
      type: "functional",
      sourceAnchorIds: fallbackAnchors[0]?.anchorId ? [fallbackAnchors[0].anchorId] : [],
      verificationHint: "补充关键资产后重新生成并校验锚点引用。",
      rationale: "未命中可用提纲，返回最小回退结果。",
      confidence: 0.25,
      conflictNote: fallbackAnchors.length ? "" : "缺少可用锚点"
    }
  ];
}

function flattenRequiredTitleOutline(requiredTitleOutline = {}) {
  const sections = Array.isArray(requiredTitleOutline.sections) ? requiredTitleOutline.sections : [];
  return sections.flatMap((section) =>
    (Array.isArray(section.items) ? section.items : []).map((item) => ({
      sectionTitle: String(section.sectionTitle || section.title || "").trim(),
      itemTitle: String(item.itemTitle || item.title || "").trim()
    }))
  );
}

function buildFactAwareItems(project = {}, template = {}, modelRequirementView = {}, requiredTitleOutline = {}, requiredLeafCount = 0) {
  const facts = Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts : [];
  if (!facts.length) {
    return [];
  }

  const leaves = flattenRequiredTitleOutline(requiredTitleOutline);
  const count = Math.max(1, Number(requiredLeafCount || 0) || leaves.length || Math.min(facts.length, 8));
  return Array.from({ length: count }, (_, index) => {
    const fact = facts[index] || facts[0];
    const leaf = leaves[index] || {};
    const title = leaf.itemTitle || fact.topic || `软件需求 ${index + 1}`;
    const behavior = String(fact.behavior || fact.topic || "根据当前模型事实执行对应功能。").trim();
    return {
      requirementId: `${template.requirementIdPrefix || "SWR"}-${String(index + 1).padStart(3, "0")}`,
      title,
      requirementText: `软件应${truncateText(behavior, 180).replace(/^[，。；：,\s]+/, "").replace(/^(软件应|系统应)/, "") || "根据当前模型事实执行对应功能。"}。`,
      type: "functional",
      sourceFactIds: fact.id ? [fact.id] : [],
      sourceAnchorIds: [],
      verificationHint: "通过评审、仿真或联调验证条目与模型事实一致。",
      rationale: "基于 modelRequirementView 模型事实、人工标题大纲和 skill 约束生成。",
      confidence: 0.65,
      conflictNote: ""
    };
  });
}

async function buildSlxParseFallbackArtifact(inputArtifact = {}, allowedPaths = []) {
  const slxFiles = Array.isArray(inputArtifact?.slxFiles) ? inputArtifact.slxFiles : [];
  if (!slxFiles.length) {
    throw createHttpError("slx_parse_generate requires at least one SLX file in inputArtifact.slxFiles", 400, "hermes_slx_parse_no_input");
  }

  const slxAnalysisService = new SlxModelAnalysisService();
  const modelRequirementViewService = new ModelRequirementViewService();
  const allExtractions = [];

  for (const slxFile of slxFiles) {
    const absolutePath = path.resolve(String(slxFile.absolutePath || ""));
    if (!absolutePath || !isPathAllowed(absolutePath, allowedPaths)) {
      throw createHttpError(`File path is not allowed: ${slxFile.originalName || absolutePath}`, 403, "hermes_path_forbidden");
    }
    const extraction = await slxAnalysisService.analyzeAndConvertToExtraction({
      id: slxFile.id || slxFile.assetId || "",
      role: "simulink_slx",
      fileRole: "simulink_slx",
      originalName: slxFile.originalName || path.basename(absolutePath),
      absolutePath
    }, { documentType: "software_requirement" });
    allExtractions.push(extraction);
  }

  const assets = slxFiles.map((file, index) => ({
    assetId: file.id || file.assetId || `slx-${index + 1}`,
    fileName: file.originalName || path.basename(file.absolutePath || ""),
    fileRole: "simulink_slx",
    absolutePath: file.absolutePath || ""
  }));

  const project = inputArtifact?.project || {};
  const modelRequirementView = modelRequirementViewService.build({
    project,
    assets,
    extractions: allExtractions
  });

  return {
    modelRequirementView,
    summary: `已从 ${slxFiles.length} 个 SLX 模型解析得到 ${Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts.length : 0} 条模型事实。`
  };
}

function normalizeSlxInterpretEvidence(item = {}, fallbackFile = "") {
  return {
    fileName: String(item.fileName || item.originalName || fallbackFile || "").trim(),
    fileRole: String(item.fileRole || item.role || "simulink_slx").trim(),
    location: String(item.location || "").trim(),
    excerpt: truncateText(item.excerpt || item.summary || item.behavior || "", 260)
  };
}

async function buildSlxInterpretFallbackArtifact(inputArtifact = {}, allowedPaths = []) {
  const model = inputArtifact?.model || {};
  const absolutePath = path.resolve(String(model.absolutePath || ""));
  if (!absolutePath || !isPathAllowed(absolutePath, allowedPaths)) {
    throw createHttpError(
      `File path is not allowed: ${model.fileName || model.originalName || absolutePath}`,
      403,
      "hermes_path_forbidden"
    );
  }

  const file = {
    id: model.assetId || model.id || "",
    role: "simulink_slx",
    fileRole: "simulink_slx",
    originalName: model.fileName || model.originalName || path.basename(absolutePath),
    absolutePath
  };
  const slxAnalysisService = new SlxModelAnalysisService();
  const extraction = await slxAnalysisService.analyzeAndConvertToExtraction(file, { documentType: "software_requirement" });
  const modelRequirementView = new ModelRequirementViewService().build({
    project: inputArtifact.project || {},
    assets: [{
      assetId: file.id,
      fileName: file.originalName,
      fileRole: "simulink_slx",
      absolutePath
    }],
    extractions: [extraction]
  });

  const facts = Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts.slice(0, 8) : [];
  const evidence = facts
    .flatMap((fact) => Array.isArray(fact.sourceRefs) ? fact.sourceRefs : [])
    .map((item) => normalizeSlxInterpretEvidence(item, file.originalName))
    .filter((item) => item.fileName || item.location || item.excerpt)
    .slice(0, 8);
  const fallbackEvidence = evidence.length
    ? evidence
    : (Array.isArray(extraction.evidence) ? extraction.evidence : [])
        .map((item) => normalizeSlxInterpretEvidence(item, file.originalName))
        .filter((item) => item.fileName || item.location || item.excerpt)
        .slice(0, 8);
  const question = String(inputArtifact.question || "").trim();
  const factLines = facts.length
    ? facts.map((fact, index) => `${index + 1}. ${truncateText(fact.behavior || fact.topic || "", 220)}`).join("\n")
    : "- 当前回退解释未识别到可结构化展示的模型事实。";

  return {
    answerMarkdown: [
      `已读取选定模型 **${file.originalName}**，并基于 Simulink Agentic Toolkit 可获得的模型事实回答：${question || "当前问题"}`,
      "",
      "### 模型事实摘要",
      factLines,
      "",
      "### 结论",
      facts.length
        ? "上面的事实是本次回答的主要依据；请结合 evidence 中的 block path / source ref 复核具体模型位置。"
        : "当前环境未返回足够的结构化事实，建议确认 MATLAB MCP / SATK 是否能读取该模型。"
    ].join("\n"),
    summary: facts.length
      ? `已读取 ${file.originalName} 并提取 ${facts.length} 条模型事实。`
      : `已尝试读取 ${file.originalName}，但未得到足够模型事实。`,
    evidence: fallbackEvidence,
    warnings: facts.length ? [] : ["未识别到可用于结构化回答的模型事实，请检查 MATLAB MCP / SATK 可用性。"]
  };
}

export async function createHermesApp(options = {}) {
  const app = express();
  const extractionService = new ExtractionService();
  const llmService = new LlmService();
  const templateService = new TemplateService();
  const uploadTempDir = getHermesUploadTempDir();
  await fs.mkdir(uploadTempDir, { recursive: true });
  const maxUploadTotalBytes = Number(
    config.hermes.maxUploadTotalBytes || MAX_MULTIPART_TOTAL_BYTES
  );
  const upload = multer({
    storage: createAggregateLimitedUploadStorage(uploadTempDir, maxUploadTotalBytes),
    limits: {
      fileSize: Number(config.hermes.maxUploadBytes || 250 * 1024 * 1024),
      files: Number(config.hermes.maxUploadFileCount || MAX_MULTIPART_FILE_COUNT),
      fields: 2,
      parts: Number(config.hermes.maxUploadFileCount || MAX_MULTIPART_FILE_COUNT) + 2
    }
  });
  const tcsdStageExecutor = config.tcsdPipeline.stageExecutor === "dsh"
    ? new TcsdDshStageExecutor()
    : new TcsdHermesStageExecutor();
  const tcsdSkillRegistry = config.tcsdPipeline.stageExecutor === "dsh"
    ? new TcsdDshSkillRegistry({
        catalog: tcsdStageExecutor.catalog,
        profile: tcsdStageExecutor.preset
      })
    : new TcsdHermesSkillRegistry({
        command: tcsdStageExecutor.command,
        commandArgsPrefix: tcsdStageExecutor.commandArgsPrefix,
        profile: tcsdStageExecutor.profile,
        stateDbPath: tcsdStageExecutor.stateDbPath,
        catalog: tcsdStageExecutor.catalog
      });
  const pipelineRunGate = new SerialGate({
    concurrency: Math.max(1, Number(config.hermes?.taskConcurrency || 1) || 1)
  });
  const tcsdJobs = new TcsdPipelineJobService({
    jobDir: config.tcsdPipeline?.jobStoreDir || path.join(config.dataDir, "tcsd-pipeline-jobs"),
    prepareJob: () => tcsdSkillRegistry.prepare(),
    executor: (stageIndex, input, job, options) => tcsdStageExecutor.execute(stageIndex, input, job, options),
    cancelExecution: (jobId, job) => tcsdStageExecutor.cancel(jobId, job),
    checkpointValidator: (checkpoint, context, job) => tcsdStageExecutor.validateCheckpoint(checkpoint, context, job),
    runGate: pipelineRunGate
  });
  await tcsdJobs.expireStaleJobs(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await tcsdJobs.recoverAll();
  const softwareDetailStageExecutor =
    options.softwareDetailStageExecutor ||
    new SoftwareDetailHermesStageExecutor();
  const softwareDetailSkillRegistry =
    options.softwareDetailSkillRegistry ||
    new SoftwareDetailHermesSkillRegistry({
      command: softwareDetailStageExecutor.command,
      commandArgsPrefix: softwareDetailStageExecutor.commandArgsPrefix,
      profile: softwareDetailStageExecutor.profile
    });
  const softwareDetailLeaseClient =
    options.softwareDetailLeaseClient ||
    new SoftwareDetailMatlabLeaseClient({
      baseURL: config.softwareDetailPipeline?.gatewayBaseURL,
      authToken: config.softwareDetailPipeline?.gatewayAuthToken,
      evaluateToken:
        config.softwareDetailPipeline?.gatewayEvaluateToken,
      mappingId: config.softwareDetailPipeline?.gatewayMappingId,
      timeoutMs: config.softwareDetailPipeline?.gatewayTimeoutMs
    });
  let preparedSoftwareDetailSkills = null;
  const prepareSoftwareDetailSkills = async () => {
    if (!preparedSoftwareDetailSkills) {
      preparedSoftwareDetailSkills = softwareDetailSkillRegistry
        .prepare()
        .catch((cause) => {
          preparedSoftwareDetailSkills = null;
          throw cause;
        });
    }
    return preparedSoftwareDetailSkills;
  };
  const softwareDetailJobs =
    options.softwareDetailJobs ||
    new SoftwareDetailPipelineJobService({
      jobDir:
        config.softwareDetailPipeline?.jobStoreDir ||
        path.join(config.dataDir, "software-detail-pipeline-jobs"),
      prepareJob: prepareSoftwareDetailSkills,
      executor: softwareDetailStageExecutor,
      leaseClient: softwareDetailLeaseClient,
      runGate: pipelineRunGate
    });
  await softwareDetailJobs.failNonTerminalJobsOnStartup();

  app.use(express.json({ limit: "8mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: now(),
      service: "hermes-agent",
      host: config.hermes.host,
      port: config.hermes.port
    });
  });

  const startTcsdPipelineJob = async (payload = {}, options = {}) => {
    const uploadSessionDir = String(options.uploadSessionDir || "");
    const relocated = uploadSessionDir
      ? await relocateUploadedWorkspace(payload, uploadSessionDir, {
          stableBaseDir: path.join(config.dataDir, "tcsd-pipeline-workspaces")
        })
      : payload;
    const allowedPaths = normalizeAllowedPaths(
      relocated.allowedPaths?.length
        ? relocated.allowedPaths
        : [relocated.inputArtifact?.workspaceDir]
    );
    const inputArtifact = await normalizeUnitTestCaseArtifact(relocated.inputArtifact || {}, allowedPaths);
    const addonCopy = await copyUnitTestProjectAddon(inputArtifact);
    return tcsdJobs.start({
      taskId: relocated.taskId,
      idempotencyKey: relocated.idempotencyKey || relocated.taskId,
      ...inputArtifact,
      uploadSessionDir,
      projectAddonCopy: addonCopy
    });
  };

  const startSoftwareDetailPipelineJob = async (
    payload = {},
    startOptions = {}
  ) => {
    const uploadSessionDir = String(startOptions.uploadSessionDir || "");
    const relocated = uploadSessionDir
      ? await relocateUploadedWorkspace(payload, uploadSessionDir, {
          stableBaseDir: path.join(config.dataDir, "tcsd-pipeline-workspaces")
        })
      : payload;
    const allowedPaths = normalizeAllowedPaths(
      relocated.allowedPaths?.length
        ? relocated.allowedPaths
        : [relocated.inputArtifact?.workspaceDir]
    );
    const inputArtifact = await normalizeUnitTestCaseArtifact(
      relocated.inputArtifact || {},
      allowedPaths,
      {
        stepType: "software_detail_pipeline",
        defaultSkillName: "software-detail-stage-skills",
        defaultExpectedOutputPattern: "outputs/*.docx"
      }
    );
    const addonCopy = await copyUnitTestProjectAddon(inputArtifact);
    return softwareDetailJobs.start({
      taskId: relocated.taskId,
      idempotencyKey: relocated.idempotencyKey || relocated.taskId,
      ...inputArtifact,
      uploadSessionDir,
      projectAddonCopy: {
        copiedFileCount: addonCopy.copiedFileCount,
        unitTestProject: addonCopy.unitTestProject
      },
      workerId: String(relocated.workerId || "").trim(),
      workerSelection:
        relocated.workerSelection &&
        typeof relocated.workerSelection === "object" &&
        !Array.isArray(relocated.workerSelection)
          ? {
              id: String(relocated.workerSelection.id || relocated.workerId || "").trim(),
              label: String(relocated.workerSelection.label || "").trim()
            }
          : { id: String(relocated.workerId || "").trim(), label: "" }
    });
  };

  const cleanupTerminalTcsdUpload = async (job) => {
    const sessionDir = String(job?.input?.uploadSessionDir || "");
    if (!sessionDir || !isTerminalJobStatus(job?.status) || !isManagedUploadSession(sessionDir, uploadTempDir)) {
      return false;
    }
    assertWorkspaceOutsideManagedSession(job, sessionDir);
    await fs.rm(sessionDir, { recursive: true, force: true });
    job.input.uploadSessionDir = "";
    job.uploadCleanedAt = now();
    await tcsdJobs.save(job);
    return true;
  };

  const cleanupTerminalSoftwareDetailUpload = async (job) => {
    const sessionDir = String(job?.input?.uploadSessionDir || "");
    if (
      !sessionDir ||
      !isTerminalSoftwareDetailJobStatus(job?.status) ||
      !isManagedUploadSession(sessionDir, uploadTempDir)
    ) {
      return false;
    }
    assertWorkspaceOutsideManagedSession(job, sessionDir);
    await fs.rm(sessionDir, { recursive: true, force: true });
    job.input.uploadSessionDir = "";
    job.uploadCleanedAt = now();
    await softwareDetailJobs.save(job);
    return true;
  };

  const sweepTerminalTcsdUploads = async () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    await tcsdJobs.expireStaleJobs(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const jobs = await tcsdJobs.list();
    const softwareDetailJobList = await softwareDetailJobs.list();
    const referencedSessions = new Set(
      [...jobs, ...softwareDetailJobList]
        .map((job) => String(job?.input?.uploadSessionDir || ""))
        .filter((sessionDir) => isManagedUploadSession(sessionDir, uploadTempDir))
        .map((sessionDir) => path.resolve(sessionDir))
    );
    for (const job of jobs) {
      const updatedAt = Date.parse(job?.updatedAt || job?.createdAt || "") || 0;
      if (isTerminalJobStatus(job?.status) && updatedAt <= cutoff) {
        await cleanupTerminalTcsdUpload(job).catch(() => {});
      }
    }
    for (const job of softwareDetailJobList) {
      const updatedAt = Date.parse(job?.updatedAt || job?.createdAt || "") || 0;
      if (
        isTerminalSoftwareDetailJobStatus(job?.status) &&
        updatedAt <= cutoff
      ) {
        await cleanupTerminalSoftwareDetailUpload(job).catch(() => {});
      }
    }
    for (const entry of await fs.readdir(uploadTempDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !entry.name.startsWith("step-")) continue;
      const sessionDir = path.join(uploadTempDir, entry.name);
      if (referencedSessions.has(path.resolve(sessionDir))) continue;
      const stat = await fs.stat(sessionDir).catch(() => null);
      if (stat && stat.mtimeMs <= cutoff) {
        await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  };
  await sweepTerminalTcsdUploads();
  const uploadSweepTimer = setInterval(() => {
    sweepTerminalTcsdUploads().catch(() => {});
  }, 60 * 60 * 1000);
  uploadSweepTimer.unref();

  app.post("/internal/tcsd-pipeline/jobs", requireHermesAuth, async (req, res, next) => {
    try {
      const correlationId = ensureTcsdCorrelation(req, res);
      const payload = req.body || {};
      logTcsdRequest("request_received", {
        correlationId,
        taskId: payload.taskId
      });
      const job = await startTcsdPipelineJob(payload);
      logTcsdRequest("job_accepted", {
        correlationId,
        taskId: payload.taskId,
        jobId: job.jobId,
        httpStatus: 202
      });
      res.status(202).json({ jobId: job.jobId, status: job.status, schema: job.schema, correlationId });
    } catch (error) { next(error); }
  });

  app.post(
    "/internal/tcsd-pipeline/jobs-upload",
    requireHermesAuth,
    upload.any(),
    async (req, res, next) => {
      let cleanupDir = "";
      let retained = false;
      try {
        const correlationId = ensureTcsdCorrelation(req, res);
        logTcsdRequest("request_received", { correlationId });
        const prepared = await prepareMultipartStepPayload(req);
        cleanupDir = prepared.cleanupDir;
        logTcsdRequest("upload_prepared", {
          correlationId,
          taskId: prepared.payload?.taskId
        });
        const job = await startTcsdPipelineJob(prepared.payload, { uploadSessionDir: cleanupDir });
        retained = path.resolve(job.input?.workspaceDir || "") === path.resolve(
          prepared.payload?.inputArtifact?.workspaceDir || ""
        );
        logTcsdRequest("job_accepted", {
          correlationId,
          taskId: prepared.payload?.taskId,
          jobId: job.jobId,
          httpStatus: 202
        });
        res.status(202).json({ jobId: job.jobId, status: job.status, schema: job.schema, correlationId });
      } catch (error) {
        next(error);
      } finally {
        if (cleanupDir && !retained) {
          await fs.rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
        }
        for (const file of Array.isArray(req.files) ? req.files : []) {
          await fs.rm(file.path, { force: true }).catch(() => {});
        }
      }
    }
  );

  app.get("/internal/tcsd-pipeline/jobs/:jobId", requireHermesAuth, async (req, res, next) => {
    try {
      const job = await tcsdJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: "TCSD 作业不存在。", code: TCSD_ERROR_CODES.jobNotFound });
      const transferred = await attachUnitTestCaseOutputFiles(
        { outputFiles: job.artifacts || [] },
        job.input || {}
      );
      return res.json({ ...job, artifacts: transferred.outputFiles || [] });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/internal/tcsd-pipeline/jobs/:jobId/cancel", requireHermesAuth, async (req, res, next) => {
    try {
      const result = await tcsdJobs.cancel(req.params.jobId);
      return res.json({
        jobId: result.job.jobId,
        status: result.job.status,
        cancelled: result.cancelled,
        alreadyTerminal: result.alreadyTerminal,
        executionStopped: result.executionStopped
      });
    } catch (error) {
      if (error?.code === TCSD_ERROR_CODES.jobNotFound) {
        return res.status(404).json({ error: error.message, code: error.code });
      }
      return next(error);
    }
  });

  app.delete("/internal/tcsd-pipeline/jobs/:jobId/upload-session", requireHermesAuth, async (req, res, next) => {
    try {
      const job = await tcsdJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: "TCSD 作业不存在。", code: TCSD_ERROR_CODES.jobNotFound });
      if (!isTerminalJobStatus(job.status)) {
        return res.status(409).json({ error: "TCSD 作业尚未结束，不能清理上传工作区。", code: "tcsd_job_not_terminal" });
      }
      const cleaned = await cleanupTerminalTcsdUpload(job);
      return res.json({ ok: true, cleaned, jobId: job.jobId });
    } catch (error) {
      return next(error);
    }
  });

  app.post(
    "/internal/software-detail-pipeline/jobs",
    requireHermesAuth,
    async (req, res, next) => {
      try {
        const job = await startSoftwareDetailPipelineJob(req.body || {});
        return res.status(202).json({
          jobId: job.jobId,
          status: job.status,
          schema: job.schema
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.post(
    "/internal/software-detail-pipeline/jobs-upload",
    requireHermesAuth,
    upload.any(),
    async (req, res, next) => {
      let cleanupDir = "";
      let retained = false;
      try {
        const prepared = await prepareMultipartStepPayload(req);
        cleanupDir = prepared.cleanupDir;
        const job = await startSoftwareDetailPipelineJob(prepared.payload, {
          uploadSessionDir: cleanupDir
        });
        retained =
          path.resolve(job.input?.workspaceDir || "") ===
          path.resolve(
            prepared.payload?.inputArtifact?.workspaceDir || ""
          );
        return res.status(202).json({
          jobId: job.jobId,
          status: job.status,
          schema: job.schema
        });
      } catch (error) {
        return next(error);
      } finally {
        if (cleanupDir && !retained) {
          await fs.rm(cleanupDir, { recursive: true, force: true }).catch(
            () => {}
          );
        }
        for (const file of Array.isArray(req.files) ? req.files : []) {
          await fs.rm(file.path, { force: true }).catch(() => {});
        }
      }
    }
  );

  app.get(
    "/internal/software-detail-pipeline/jobs/:jobId",
    requireHermesAuth,
    async (req, res, next) => {
      try {
        const job = await softwareDetailJobs.get(req.params.jobId);
        if (!job) {
          return res.status(404).json({
            error: "Software-detail job does not exist.",
            code: "software_detail_job_not_found"
          });
        }
        const artifacts = await attachSoftwareDetailOutputFiles(
          job.artifacts || [],
          job.input || {}
        );
        return res.json({ ...job, artifacts });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.delete(
    "/internal/software-detail-pipeline/jobs/:jobId/upload-session",
    requireHermesAuth,
    async (req, res, next) => {
      try {
        const job = await softwareDetailJobs.get(req.params.jobId);
        if (!job) {
          return res.status(404).json({
            error: "Software-detail job does not exist.",
            code: "software_detail_job_not_found"
          });
        }
        if (!isTerminalSoftwareDetailJobStatus(job.status)) {
          return res.status(409).json({
            error:
              "Software-detail job is not terminal; its upload session cannot be removed.",
            code: "software_detail_job_not_terminal"
          });
        }
        const cleaned = await cleanupTerminalSoftwareDetailUpload(job);
        return res.json({ ok: true, cleaned, jobId: job.jobId });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.post("/internal/dsh/tasks", requireHermesAuth, async (req, res) => {
    const startedAt = Date.now();
    try {
      const payload = req.body || {};
      const taskPrompt = String(payload.taskPrompt || "").trim();
      const jobId = String(payload.jobId || "").trim();
      const cwd = String(payload.cwd || "").trim();
      const outputDir = String(payload.outputDir || "").trim();
      if (!taskPrompt) {
        return res.status(400).json({
          error: "DSH 任务提示词不能为空。",
          code: "dsh_task_prompt_required"
        });
      }
      const command = String(
        config.tcsdPipeline?.dsh?.command ||
          process.env.TCSD_DSH_COMMAND ||
          "dsh"
      );
      const profile = String(
        config.tcsdPipeline?.dsh?.profile ||
          process.env.TCSD_DSH_PROFILE ||
          "headless"
      );
      const dshCli = command.includes("/") || /^[A-Za-z]:[\\/]/.test(command)
        ? command
        : execFileSync(
            "sh",
            ["-c", `command -v ${JSON.stringify(command)}`],
            { encoding: "utf-8" }
          ).trim() || command;
      const environment = { ...process.env, NO_COLOR: "1" };
      if (jobId) {
        environment.TCSD_JOB_ID = jobId;
        environment.TCSD_RESOURCE_OWNER_JOB_ID = jobId;
      }
      if (outputDir) environment.TCSD_OUTPUT_DIR = outputDir;
      const options = {
        env: environment,
        maxBuffer: 16 * 1024 * 1024,
        timeout: Number(config.tcsdPipeline?.dsh?.sessionTimeoutMs || 0) || 0,
        windowsHide: true
      };
      if (cwd) options.cwd = cwd;
      const result = await execFileAsync(
        process.execPath,
        ["--expose-internals", dshCli, "--profile", profile, taskPrompt],
        options
      );
      return res.json({
        jobId,
        status: "completed",
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        sessionId: `dsh-${jobId || "task"}`,
        stdoutBytes: Buffer.byteLength(String(result?.stdout || "")),
        stderrBytes: Buffer.byteLength(String(result?.stderr || ""))
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return res.status(500).json({
        error: `DSH 任务执行失败：${message}`,
        code: "dsh_task_failed"
      });
    }
  });

  const executeStepRequest = async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const payload = req.body || {};
      const stepType = String(payload.stepType || "").trim();
      if (!stepType) {
        throw createHttpError("stepType is required");
      }

      if (stepType === "windows_worker_probe") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths);
        const artifact = await buildWindowsWorkerProbeArtifact(payload.inputArtifact || {}, allowedPaths);
        return res.json(
          buildStepResponse(stepType, artifact, startedAt, {
            metrics: {
              uploadedFileSize: artifact.file?.size || 0,
              contentMatches: Boolean(artifact.file?.contentMatches)
            }
          })
        );
      }

      if (stepType === "material_extract") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths);
        const files = normalizeMaterialFiles(payload.inputArtifact?.files || [], allowedPaths);
        const extractions = await extractionService.extractFiles({ files }, { allowStoredNameFallback: true });
        return res.json(
          buildStepResponse(stepType, { extractions }, startedAt, {
            metrics: {
              extractionFileCount: files.length,
              extractionEvidenceCount: extractions.reduce(
                (total, item) => total + (Array.isArray(item.evidence) ? item.evidence.length : 0),
                0
              )
            }
          })
        );
      }

      if (stepType === "anchor_index_build") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths);
        const files = normalizeMaterialFiles(payload.inputArtifact?.assets || payload.inputArtifact?.files || [], allowedPaths);
        const extractions = await extractionService.extractFiles({ files }, { allowStoredNameFallback: true });
        const anchors = buildAnchorsFromExtractions(extractions, files, {
          limit: config.hermes.maxEvidenceForGeneration
        });
        return res.json(
          buildStepResponse(stepType, { anchors }, startedAt, {
            metrics: {
              extractionFileCount: files.length,
              anchorCount: anchors.length
            }
          })
        );
      }

      if (stepType === "atom_recall") {
        const evidence =
          Array.isArray(payload.inputArtifact?.anchors) && payload.inputArtifact.anchors.length
            ? anchorsToEvidence(payload.inputArtifact.anchors)
            : payload.inputArtifact?.evidence || [];
        const items = recallSkillInventory(
          payload.skillInventory || {},
          evidence,
          { limit: config.hermes.maxRecalledAtoms }
        );
        return res.json(buildStepResponse(stepType, { items }, startedAt, { metrics: { recalledAtomCount: items.length } }));
      }

      if (stepType === "outline_build") {
        const anchors = Array.isArray(payload.inputArtifact?.anchors) ? payload.inputArtifact.anchors : [];
        const outline = anchors.length
          ? buildAnchorAwareOutline(payload.inputArtifact?.recalledAtoms || [], anchors, {
              maxSections: config.hermes.maxOutlineSections
            })
          : buildOutlineFromRecall(payload.inputArtifact?.recalledAtoms || [], payload.inputArtifact?.evidence || [], {
              maxSections: config.hermes.maxOutlineSections
            });
        return res.json(
          buildStepResponse(stepType, outline, startedAt, {
            metrics: { outlineSectionCount: Array.isArray(outline.sections) ? outline.sections.length : 0 }
          })
        );
      }

      if (stepType === "content_generate") {
        const template =
          payload.inputArtifact?.template ||
          (await templateService.getTemplate(payload.inputArtifact?.project?.documentType || "software_requirement"));
        const anchors = Array.isArray(payload.inputArtifact?.anchors) ? payload.inputArtifact.anchors : [];
        const factItems = buildFactAwareItems(
          payload.inputArtifact?.project || {},
          template,
          payload.inputArtifact?.modelRequirementView || {},
          payload.inputArtifact?.requiredTitleOutline || {},
          payload.inputArtifact?.requiredLeafCount || 0
        );
        if (factItems.length) {
          return res.json(
            buildStepResponse(stepType, { items: factItems }, startedAt, {
              metrics: {
                generatedItemCount: factItems.length,
                factCount: Array.isArray(payload.inputArtifact?.modelRequirementView?.facts)
                  ? payload.inputArtifact.modelRequirementView.facts.length
                  : 0
              }
            })
          );
        }
        if (anchors.length) {
          const items = buildAnchorAwareItems(
            payload.inputArtifact?.project || {},
            template,
            anchors,
            payload.inputArtifact?.recalledAtoms || [],
            payload.inputArtifact?.outline || {}
          );
          return res.json(
            buildStepResponse(stepType, { items }, startedAt, {
              metrics: {
                generatedItemCount: Array.isArray(items) ? items.length : 0,
                anchorCount: anchors.length
              }
            })
          );
        }
        const evidence = selectEvidenceForGeneration(
          {
            evidence: payload.inputArtifact?.evidence || [],
            recalledAtoms: payload.inputArtifact?.recalledAtoms || [],
            outline: payload.inputArtifact?.outline || {}
          },
          { limit: config.hermes.maxEvidenceForGeneration }
        );
        const items = await llmService.generateSoftwareRequirementFromAgentContext(
          {
            project: payload.inputArtifact?.project || {},
            template,
            evidence,
            recalledAtoms: payload.inputArtifact?.recalledAtoms || [],
            outline: payload.inputArtifact?.outline || {},
            llmProfileSnapshot: payload.llmProfileSnapshot || null
          },
          {
            llmProfileId: payload.llmProfileSnapshot?.id || ""
          }
        );
        return res.json(
          buildStepResponse(stepType, { items }, startedAt, {
            metrics: { generatedItemCount: Array.isArray(items) ? items.length : 0 }
          })
        );
      }

      if (stepType === "document_extract_generate") {
        const artifact = buildFallbackExtractedMarkdown(payload.inputArtifact || {});
        return res.json(
          buildStepResponse(stepType, artifact, startedAt, {
            metrics: {
              imageInputCount: Array.isArray(payload.inputArtifact?.images) ? payload.inputArtifact.images.length : 0,
              sourceTextLength: String(payload.inputArtifact?.sourceText || "").length
            }
          })
        );
      }

      if (stepType === "slx_parse_generate") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths);
        const artifact = await buildSlxParseFallbackArtifact(payload.inputArtifact || {}, allowedPaths);
        return res.json(
          buildStepResponse(stepType, artifact, startedAt, {
            metrics: {
              slxFileCount: Array.isArray(payload.inputArtifact?.slxFiles) ? payload.inputArtifact.slxFiles.length : 0,
              factCount: Array.isArray(artifact.modelRequirementView?.facts) ? artifact.modelRequirementView.facts.length : 0
            }
          })
        );
      }

      if (stepType === "slx_interpret_answer") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths);
        const artifact = await buildSlxInterpretFallbackArtifact(payload.inputArtifact || {}, allowedPaths);
        return res.json(
          buildStepResponse(stepType, artifact, startedAt, {
            metrics: {
              evidenceCount: Array.isArray(artifact.evidence) ? artifact.evidence.length : 0,
              warningCount: Array.isArray(artifact.warnings) ? artifact.warnings.length : 0
            }
          })
        );
      }

      if (stepType === "replay_proposal_generate") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths);
        const replayContextFiles = resolveReplayContextFiles(payload.inputArtifact || {}, allowedPaths);
        const manifest = await readAllowedJsonFile(
          replayContextFiles.manifestPath,
          allowedPaths,
          replayContextFiles.replayContextDir
        );
        const taskBrief = await readAllowedTextFile(
          replayContextFiles.taskBriefPath,
          allowedPaths,
          replayContextFiles.replayContextDir
        ).catch(() => "");
        const legacyRejections =
          manifest.files?.rejectionsPath || manifest.paths?.rejections || payload.inputArtifact?.files?.rejectionsPath
            ? await readAllowedJsonFile(
                manifest.files?.rejectionsPath || manifest.paths?.rejections || payload.inputArtifact?.files?.rejectionsPath || "",
                allowedPaths,
                replayContextFiles.replayContextDir
              ).catch(() => ({ records: [] }))
            : { records: [] };
        const legacyInventory =
          manifest.files?.layerSkillInventoryPath || manifest.paths?.layerSkillInventory || payload.inputArtifact?.files?.layerSkillInventoryPath
            ? await readAllowedJsonFile(
                manifest.files?.layerSkillInventoryPath || manifest.paths?.layerSkillInventory || payload.inputArtifact?.files?.layerSkillInventoryPath || "",
                allowedPaths,
                replayContextFiles.replayContextDir
              ).catch(() => ({ items: [] }))
            : { items: [] };
        const artifact = buildReplayFallbackProposal(manifest, taskBrief, {
          legacyRejections,
          legacyInventory
        });
        const records = resolveReplayRecords(manifest, legacyRejections);
        const inventoryItems = resolveReplayInventory(manifest, legacyInventory);
        return res.json(
          buildStepResponse(stepType, artifact, startedAt, {
            metrics: {
              replayRecordCount: Array.isArray(records) ? records.length : 0,
              candidateSkillCount: Array.isArray(inventoryItems) ? inventoryItems.length : 0
            }
          })
        );
      }

      if (stepType === "simulink_module_description_generate") {
        const allowedPaths = normalizeAllowedPaths(payload.allowedPaths?.length ? payload.allowedPaths : [payload.inputArtifact?.workspaceDir]);
        const inputArtifact = await normalizeUnitTestCaseArtifact(payload.inputArtifact || {}, allowedPaths, {
          stepType,
          defaultSkillName: "simulink-module-description-generator",
          defaultExpectedOutputPattern: "outputs/*.docx"
        });
        const addonCopy = await copyUnitTestProjectAddon(inputArtifact);
        const hermesClient = new HermesAgentClient({
          transport: "cli",
          workdir: inputArtifact.workspaceDir
        });
        const result = await hermesClient.executeStep(
          {
            ...payload,
            stepType,
            workdir: inputArtifact.workspaceDir,
            allowedPaths: [inputArtifact.workspaceDir],
            inputArtifact: {
              ...inputArtifact,
              projectAddonCopy: {
                copiedFileCount: addonCopy.copiedFileCount,
                unitTestProject: addonCopy.unitTestProject
              }
            }
          },
          {}
        );
        const artifact = await attachLegacySoftwareDetailOutputFiles(
          result.artifact || {},
          inputArtifact
        );
        return res.json(
          buildStepResponse(stepType, artifact, startedAt, {
            metrics: result.metrics || {},
            logs: result.logs || []
          })
        );
      }

      throw createHttpError(`Unsupported Hermes step: ${stepType}`, 400, "hermes_step_unsupported");
    } catch (error) {
      next(error);
    }
  };

  app.post("/internal/steps/execute", requireHermesAuth, executeStepRequest);

  app.post("/internal/steps/execute-upload", requireHermesAuth, upload.any(), async (req, res, next) => {
    let cleanupDir = "";
    let retainUploadedFiles = false;
    try {
      const prepared = await prepareMultipartStepPayload(req);
      cleanupDir = prepared.cleanupDir;
      req.body = prepared.payload;
      retainUploadedFiles =
        prepared.payload?.stepType === "windows_worker_probe" &&
        prepared.payload?.inputArtifact?.retainUploadedFiles === true;
      return await executeStepRequest(req, res, next);
    } catch (error) {
      return next(error);
    } finally {
      if (cleanupDir && !retainUploadedFiles) {
        await fs.rm(cleanupDir, { recursive: true, force: true }).catch(() => {});
      }
      for (const file of Array.isArray(req.files) ? req.files : []) {
        await fs.rm(file.path, { force: true }).catch(() => {});
      }
    }
  });

  app.use((error, req, res, _next) => {
    const isTcsdRequest = String(req.path || "").startsWith("/internal/tcsd-pipeline/");
    const correlationId = isTcsdRequest ? ensureTcsdCorrelation(req, res) : "";
    const statusCode = Number(error.statusCode || 500);
    const safeCode = safeTcsdAuditId(error.code) || "hermes_step_failed";
    const prepareFailureReason = safeTcsdAuditId(error.details?.prepareFailureReason);
    if (isTcsdRequest) {
      logTcsdRequest("request_rejected", {
        correlationId,
        taskId: req.body?.taskId,
        httpStatus: statusCode,
        code: safeCode,
        prepareFailureReason
      });
      return res.status(statusCode).json({
        error: statusCode >= 500
          ? "TCSD Worker 内部处理失败。"
          : "TCSD Worker 拒绝了任务请求。",
        code: safeCode,
        ...(prepareFailureReason ? { prepareFailureReason } : {}),
        correlationId
      });
    }
    res.status(statusCode).json({
      error: error.message || "Hermes step execution failed",
      code: safeCode,
      details: error.details || null,
      ...(correlationId ? { correlationId } : {})
    });
  });

  return app;
}
