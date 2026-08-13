import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { promisify } from "node:util";
import { runHermesCommand } from "./hermes-command.js";
import { config } from "../config.js";
import { getAllowedKindsForAreasAndLayer } from "../../public/skill-kind-matrix.js";

const execFileAsync = promisify(execFile);
const CLI_JSON_MAX_LENGTH = 120000;
const CLI_EXCERPT_MAX_LENGTH = 600;
const CLI_SKILL_CONTENT_MAX_LENGTH = 1200;
const CLI_PATH_MAX_LENGTH = 260;
const HERMES_USAGE_QUERY_RETRIES = 5;
const HERMES_USAGE_QUERY_RETRY_DELAY_MS = 250;
const MAX_TRANSFERRED_TCSD_OUTPUT_BYTES = 50 * 1024 * 1024;
// 完成态作业的轮询响应包含 job 全量 checkpoint/覆盖数据与 artifact base64
// 附件；256KB 曾把已完成的 DrvMod_A05 轮询截断为 tcsd_worker_response_too_large。
// 上限必须覆盖 50MB artifact 的 base64（×4/3）加 job JSON 开销。
const MAX_TCSD_CONTROL_RESPONSE_BYTES_DEFAULT = 96 * 1024 * 1024;
const MAX_TRANSFERRED_SOFTWARE_DETAIL_OUTPUT_BYTES = 50 * 1024 * 1024;
const SOFTWARE_DETAIL_DOCX_ROLE = "detail-design-docx";
const SOFTWARE_DETAIL_JOB_SCHEMA = "software-detail-minimal-job/v1";
const SOFTWARE_DETAIL_JOB_STATUSES = new Set(["queued", "running", "completed", "failed"]);
const STRICT_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SAFE_REMOTE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function trimTrailingSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function isMultipartApiMode(value = "") {
  return ["multipart", "upload"].includes(String(value || "").trim().toLowerCase());
}

function safeRemoteCode(value = "") {
  const code = String(value || "").trim();
  return SAFE_REMOTE_CODE_PATTERN.test(code) ? code : "";
}

function parseJsonObject(value = "") {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function classifyTcsdHttpFailure(status = 0) {
  if (status === 401) return { category: "authentication", retryable: false };
  if (status === 403) return { category: "authorization", retryable: false };
  if (status === 404) return { category: "protocol", retryable: false };
  if ([400, 409, 413, 422].includes(status)) return { category: "request", retryable: false };
  if (status === 408) return { category: "timeout", retryable: true };
  if (status === 429) return { category: "rate-limit", retryable: true };
  if (status >= 500) return { category: "remote-server", retryable: true };
  return { category: "remote-response", retryable: false };
}

function createTcsdTransportError({ operation, cause = null, response = null, correlationId = "" } = {}) {
  const status = Number(response?.status || 0) || 0;
  const body = parseJsonObject(response?.text);
  const remoteCode = safeRemoteCode(body?.code);
  const prepareFailureReason = safeRemoteCode(body?.prepareFailureReason);
  let category = "client";
  let retryable = false;
  if (response) {
    ({ category, retryable } = classifyTcsdHttpFailure(status));
  } else if (cause?.name === "AbortError" || ["ETIMEDOUT", "tcsd_poll_timeout"].includes(String(cause?.code || ""))) {
    category = "timeout";
    retryable = true;
  } else if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"].includes(String(cause?.code || ""))) {
    category = "network";
    retryable = true;
  } else if (safeRemoteCode(cause?.code) === "tcsd_upload_empty") {
    category = "upload";
  } else if (safeRemoteCode(cause?.code) === "tcsd_worker_response_too_large") {
    category = "response-limit";
  }
  const resolvedCorrelationId = String(response?.correlationId || correlationId || "").trim().slice(0, 120);
  const error = new Error(retryable ? `TCSD Worker ${operation}暂时不可用。` : `TCSD Worker ${operation}被拒绝。`);
  error.code = retryable
    ? "tcsd_worker_unavailable"
    : remoteCode || safeRemoteCode(cause?.code) || "tcsd_worker_request_rejected";
  error.retryable = retryable;
  error.details = {
    operation,
    category,
    retryable,
    ...(status ? { httpStatus: status } : {}),
    ...(remoteCode ? { remoteCode } : {}),
    ...(prepareFailureReason ? { prepareFailureReason } : {}),
    ...(resolvedCorrelationId ? { correlationId: resolvedCorrelationId } : {})
  };
  error.cause = cause || undefined;
  return error;
}

function clipText(value = "", maxLength = CLI_JSON_MAX_LENGTH) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function collectUploadFilesForAllowedPaths(allowedPaths = []) {
  const roots = [];
  const files = [];

  async function walkDirectory(rootPath, currentPath, rootIndex) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walkDirectory(rootPath, entryPath, rootIndex);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      files.push({
        fieldName: `file_${files.length}`,
        rootIndex,
        sourcePath: entryPath,
        relativePath: path.relative(rootPath, entryPath) || entry.name
      });
    }
  }

  for (const rawPath of Array.isArray(allowedPaths) ? allowedPaths : []) {
    const sourceRoot = path.resolve(String(rawPath || ""));
    const stat = await fs.stat(sourceRoot).catch(() => null);
    if (!stat) {
      continue;
    }

    const rootIndex = roots.length;
    if (stat.isDirectory()) {
      roots.push({ sourceRoot, type: "directory" });
      await walkDirectory(sourceRoot, sourceRoot, rootIndex);
      continue;
    }

    if (stat.isFile()) {
      roots.push({ sourceRoot, type: "file" });
      files.push({
        fieldName: `file_${files.length}`,
        rootIndex,
        sourcePath: sourceRoot,
        relativePath: path.basename(sourceRoot)
      });
    }
  }

  return { roots, files };
}

async function emitHermesEvent(onEvent, event = {}) {
  if (typeof onEvent !== "function") {
    return;
  }
  await Promise.resolve(
    onEvent({
      at: new Date().toISOString(),
      ...event
    })
  );
}

function sanitizeEvidenceItem(item = {}) {
  return {
    fileName: String(item.fileName || "").trim(),
    fileRole: String(item.fileRole || item.role || "").trim(),
    location: String(item.location || "").trim(),
    excerpt: clipText(item.excerpt || "", CLI_EXCERPT_MAX_LENGTH)
  };
}

function sanitizeAssetItem(item = {}) {
  return {
    assetId: String(item.assetId || item.id || "").trim(),
    fileName: String(item.fileName || item.originalName || "").trim(),
    fileRole: String(item.fileRole || item.role || "").trim(),
    absolutePath: clipText(item.absolutePath || item.path || "", CLI_PATH_MAX_LENGTH),
    downloadUrl: clipText(item.downloadUrl || "", 1000)
  };
}

function sanitizeAnchorItem(item = {}) {
  return {
    anchorId: String(item.anchorId || item.id || "").trim(),
    assetId: String(item.assetId || "").trim(),
    fileName: String(item.fileName || "").trim(),
    fileRole: String(item.fileRole || item.role || "").trim(),
    location: String(item.location || "").trim(),
    anchorType: String(item.anchorType || "").trim(),
    excerpt: clipText(item.excerpt || "", CLI_EXCERPT_MAX_LENGTH),
    summary: clipText(item.summary || "", 300),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => clipText(tag || "", 80)).slice(0, 12) : []
  };
}

function sanitizeSkillInventory(skillInventory = {}) {
  return {
    selectedProfiles: Array.isArray(skillInventory.selectedProfiles)
      ? skillInventory.selectedProfiles.map((item) => ({
          layer: String(item?.layer || "").trim(),
          key: String(item?.key || item?.profileKey || "").trim(),
          title: String(item?.title || "").trim(),
          version: String(item?.version || "").trim()
        }))
      : [],
    items: Array.isArray(skillInventory.items)
      ? skillInventory.items.map((item) => ({
          skillCode: String(item?.skillCode || "").trim(),
          layer: String(item?.layer || "").trim(),
          profileKey: String(item?.profileKey || "").trim(),
          kind: String(item?.kind || "").trim(),
          title: String(item?.title || "").trim(),
          content: clipText(item?.content || "", CLI_SKILL_CONTENT_MAX_LENGTH),
          order: Number(item?.order || 0) || 0
        }))
      : []
  };
}

function sanitizeSkillBundle(skillBundle = {}, options = {}) {
  const includeChunks = options.includeChunks !== false;
  const sanitized = {
    bundlePath: clipText(skillBundle.bundlePath || "", CLI_PATH_MAX_LENGTH),
    manifestPath: clipText(skillBundle.manifestPath || "", CLI_PATH_MAX_LENGTH),
    recommendedSkillCodes: Array.isArray(skillBundle.recommendedSkillCodes)
      ? skillBundle.recommendedSkillCodes.map((item) => clipText(item || "", 120)).slice(0, 40)
      : []
  };
  if (includeChunks) {
    sanitized.chunks = Array.isArray(skillBundle.chunks)
      ? skillBundle.chunks.map((item) => ({
          kind: String(item?.kind || "").trim(),
          title: String(item?.title || "").trim(),
          path: clipText(item?.path || item?.absolutePath || "", CLI_PATH_MAX_LENGTH)
        }))
      : [];
  }
  return sanitized;
}

function sanitizeOutline(outline = {}) {
  return {
    summary: clipText(outline.summary || "", 3000),
    sections: Array.isArray(outline.sections)
      ? outline.sections.map((section) => ({
          title: clipText(section?.title || "", 200),
          objective: clipText(section?.objective || "", 600),
          anchorIds: Array.isArray(section?.anchorIds)
            ? section.anchorIds.map((item) => clipText(item || "", 200)).slice(0, 20)
            : Array.isArray(section?.evidenceKeys)
              ? section.evidenceKeys.map((item) => clipText(item || "", 200)).slice(0, 20)
            : []
        }))
      : []
  };
}

function sanitizeManualTitleOutline(outline = {}) {
  const candidate =
    typeof outline === "string"
      ? (() => {
          try {
            return JSON.parse(outline);
          } catch (_error) {
            return null;
          }
        })()
      : outline;

  const normalizedSections = [];
  for (const section of Array.isArray(candidate?.sections) ? candidate.sections : []) {
    const sectionTitle = String(section?.sectionTitle || section?.title || "").trim();
    if (!sectionTitle) {
      continue;
    }

    const items = [];
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const itemTitle = String(item?.itemTitle || item?.title || "").trim();
      if (!itemTitle) {
        continue;
      }
      items.push({ itemTitle });
    }

    if (items.length) {
      normalizedSections.push({
        sectionTitle,
        items
      });
    }
  }

  if (!normalizedSections.length) {
    return null;
  }

  return {
    sections: normalizedSections
  };
}

function sanitizeReplayContextArtifact(inputArtifact = {}) {
  const replayContext = inputArtifact.replayContext && typeof inputArtifact.replayContext === "object"
    ? inputArtifact.replayContext
    : {};
  const replayContextDir = replayContext.directory || inputArtifact.replayContextDir || "";
  const manifestFileName = replayContext.manifestFileName || "manifest.json";
  const taskBriefFileName = replayContext.taskBriefFileName || "task-brief.md";
  const manifestPath = replayContext.manifestPath || inputArtifact.manifestPath || (replayContextDir ? path.join(replayContextDir, manifestFileName) : "");
  const taskBriefPath = replayContext.taskBriefPath || inputArtifact.taskBriefPath || (replayContextDir ? path.join(replayContextDir, taskBriefFileName) : "");
  return {
    replayContext: {
      directory: clipText(replayContextDir || "", CLI_PATH_MAX_LENGTH),
      manifestFileName: clipText(manifestFileName || "", 120),
      taskBriefFileName: clipText(taskBriefFileName || "", 120)
    },
    replayContextDir: clipText(replayContextDir || "", CLI_PATH_MAX_LENGTH),
    manifestPath: clipText(manifestPath || "", CLI_PATH_MAX_LENGTH),
    taskBriefPath: clipText(taskBriefPath || "", CLI_PATH_MAX_LENGTH),
    files: inputArtifact.files && typeof inputArtifact.files === "object"
      ? {
          rejectionsPath: clipText(inputArtifact.files.rejectionsPath || "", CLI_PATH_MAX_LENGTH),
          effectiveSkillManifestPath: clipText(inputArtifact.files.effectiveSkillManifestPath || "", CLI_PATH_MAX_LENGTH),
          layerSkillInventoryPath: clipText(inputArtifact.files.layerSkillInventoryPath || "", CLI_PATH_MAX_LENGTH),
          referenceAssetFiles: Array.isArray(inputArtifact.files.referenceAssetFiles)
            ? inputArtifact.files.referenceAssetFiles.map((item) => ({
                fileName: clipText(item?.fileName || "", 160),
                role: clipText(item?.role || "", 80),
                path: clipText(item?.path || "", CLI_PATH_MAX_LENGTH)
              }))
            : []
        }
      : {}
  };
}

function sanitizeProjectContext(project = {}) {
  return {
    name: clipText(project.name || "", 200),
    description: clipText(project.description || "", 1000),
    language: clipText(project.language || "", 80),
    documentType: clipText(project.documentType || "software_requirement", 80),
    domain: clipText(project.domain || "", 120),
    moduleId: clipText(project.moduleId || "", 120),
    moduleName: clipText(project.moduleName || "", 200),
    moduleDescription: clipText(project.moduleDescription || "", 1000),
    moduleSkillKey: clipText(project.moduleSkillKey || "", 120)
  };
}

function sanitizeModuleBootstrapAnalysis(analysis = {}) {
  return {
    summary: clipText(analysis.summary || "", 2000),
    themes: Array.isArray(analysis.themes)
      ? analysis.themes.map((item) => ({
          title: clipText(item?.title || "", 200),
          objective: clipText(item?.objective || "", 600),
          anchorIds: Array.isArray(item?.anchorIds)
            ? item.anchorIds.map((value) => clipText(value || "", 120)).slice(0, 20)
            : []
        }))
      : [],
    ruleFocus: Array.isArray(analysis.ruleFocus)
      ? analysis.ruleFocus.map((item) => clipText(item || "", 200)).slice(0, 12)
      : [],
    cautionNotes: Array.isArray(analysis.cautionNotes)
      ? analysis.cautionNotes.map((item) => clipText(item || "", 300)).slice(0, 12)
      : []
  };
}

function sanitizeContentItem(item = {}) {
  return {
    title: clipText(item.title || "", 200),
    requirementText: clipText(item.requirementText || "", 6000),
    type: clipText(item.type || "", 80),
    verificationHint: clipText(item.verificationHint || "", 1000),
    sourceFactIds: Array.isArray(item.sourceFactIds)
      ? item.sourceFactIds.map((value) => clipText(value || "", 120)).slice(0, 20)
      : [],
    sourceAnchorIds: Array.isArray(item.sourceAnchorIds)
      ? item.sourceAnchorIds.map((value) => clipText(value || "", 120)).slice(0, 20)
      : [],
    conflictNote: clipText(item.conflictNote || "", 1000)
  };
}

function extractJsonText(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return withoutFence.trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }
  return trimmed;
}

function parseCliResponse(stdout = "") {
  const normalized = String(stdout || "").replace(/\r/g, "");
  const match = normalized.match(/(?:^|\n)session_id:\s*(.+?)\s*$/i);
  const sessionId = match ? match[1].trim() : "";
  const body = match ? normalized.slice(0, match.index).trim() : normalized.trim();
  return {
    body,
    sessionId
  };
}

function buildCliFailureMessage(error = {}, fallbackMessage = "Hermes CLI request failed") {
  const stderr = clipText(error?.stderr || "", 4000);
  const stdout = clipText(error?.stdout || "", 4000);
  if (stderr) {
    return stderr;
  }
  if (stdout) {
    return stdout;
  }

  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) {
    return fallbackMessage;
  }
  const withoutCommand = rawMessage.replace(/^Command failed:[^\n]*(?:\n|$)/, "").trim();
  return clipText(withoutCommand || fallbackMessage, 4000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTokenUsage(usage = {}) {
  const contextTokens = Math.max(0, Number(usage.contextTokens || 0) || 0);
  const contextLength = Math.max(0, Number(usage.contextLength || 0) || 0);
  const inputTokens = Math.max(0, Number(usage.inputTokens || 0) || 0);
  const outputTokens = Math.max(0, Number(usage.outputTokens || 0) || 0);
  const cacheReadTokens = Math.max(0, Number(usage.cacheReadTokens || 0) || 0);
  const cacheWriteTokens = Math.max(0, Number(usage.cacheWriteTokens || 0) || 0);
  const reasoningTokens = Math.max(0, Number(usage.reasoningTokens || 0) || 0);
  const totalTokens =
    Math.max(0, Number(usage.totalTokens || 0) || 0) ||
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  return {
    model: String(usage.model || "").trim(),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens,
    estimatedCostUsd: Number.isFinite(Number(usage.estimatedCostUsd))
      ? Number(usage.estimatedCostUsd)
      : null,
    actualCostUsd: Number.isFinite(Number(usage.actualCostUsd))
      ? Number(usage.actualCostUsd)
      : null,
    costStatus: String(usage.costStatus || "").trim(),
    contextTokens,
    contextLength,
    contextPercent: contextLength
      ? Math.max(0, Math.min(100, Math.round((contextTokens / contextLength) * 100)))
      : null
  };
}

function buildUsageSummary(usage = {}) {
  if (!usage || !usage.totalTokens) {
    return "";
  }
  return [
    `input ${usage.inputTokens || 0}`,
    `output ${usage.outputTokens || 0}`,
    `total ${usage.totalTokens || 0}`
  ].join(", ");
}

function normalizeOpenAiRunUsage(usage = {}) {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const inputTokens = usage.inputTokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.output_tokens ?? 0;
  const totalTokens = usage.totalTokens ?? usage.total_tokens ?? 0;
  const normalized = normalizeTokenUsage({
    model: usage.model || "",
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: usage.cacheReadTokens ?? usage.cache_read_tokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? usage.cache_write_tokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? usage.reasoning_tokens ?? 0
  });
  return normalized.totalTokens ? normalized : null;
}

function parseSqliteUsageRow(stdout = "") {
  const line = String(stdout || "")
    .trim()
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    return null;
  }
  const [
    id,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    estimatedCostUsd,
    actualCostUsd,
    costStatus,
    model
  ] = line.split("|");
  if (!id) {
    return null;
  }
  return normalizeTokenUsage({
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens:
      (Number(inputTokens || 0) || 0) +
      (Number(outputTokens || 0) || 0) +
      (Number(cacheReadTokens || 0) || 0) +
      (Number(cacheWriteTokens || 0) || 0),
    estimatedCostUsd,
    actualCostUsd,
    costStatus
  });
}

async function defaultUsageReader({ sessionId, stateDbPath, commandRunner, workdir }) {
  if (!sessionId || !stateDbPath) {
    return null;
  }
  const escapedSessionId = String(sessionId).replace(/'/g, "''");
  const sql =
    "select id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, estimated_cost_usd, actual_cost_usd, cost_status, model " +
    `from sessions where id = '${escapedSessionId}';`;
  for (let attempt = 0; attempt < HERMES_USAGE_QUERY_RETRIES; attempt += 1) {
    try {
      const { stdout = "" } = await commandRunner("sqlite3", ["-separator", "|", path.resolve(stateDbPath), sql], {
        cwd: workdir,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        env: process.env
      });
      const parsed = parseSqliteUsageRow(stdout);
      if (parsed) {
        return parsed;
      }
    } catch (_error) {
      return null;
    }
    if (attempt < HERMES_USAGE_QUERY_RETRIES - 1) {
      await delay(HERMES_USAGE_QUERY_RETRY_DELAY_MS);
    }
  }
  return null;
}

function buildMaterialExtractPrompt(payload = {}) {
  const files = Array.isArray(payload.inputArtifact?.files) ? payload.inputArtifact.files : [];
  return [
    "You are executing the Hermes step `material_extract` for software requirement generation.",
    "Use your local tools to read ONLY the files listed below from the local filesystem.",
    "Do not read any other files. Do not infer excerpts without reading the files.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Allowed files:",
    JSON.stringify(
      files.map((file) => ({
        originalName: file.originalName,
        fileRole: file.fileRole || file.role,
        absolutePath: file.absolutePath
      })),
      null,
      2
    ),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        extractions: [
          {
            fileName: "file.ext",
            fileRole: "generatedCode",
            evidence: [
              {
                fileName: "file.ext",
                fileRole: "generatedCode",
                location: "line 10-18",
                excerpt: "verbatim excerpt from the file"
              }
            ]
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Each file must appear exactly once in `extractions`.",
    "- If a file has no relevant evidence, include it with an empty evidence array.",
    "- `excerpt` must be verbatim from the file.",
    "- `location` should be a concrete locator like line numbers or page markers.",
    "- Focus on content relevant to software requirements and control logic."
  ].join("\n");
}

function buildAnchorIndexPrompt(payload = {}) {
  const assets = Array.isArray(payload.inputArtifact?.assets) ? payload.inputArtifact.assets.map(sanitizeAssetItem) : [];
  return [
    "You are executing the Hermes step `anchor_index_build` for software requirement generation.",
    "Use your local tools to read ONLY the allowed asset files below.",
    "Build stable anchor records that can be referenced later by anchorId.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Allowed asset files:",
    JSON.stringify(assets, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        anchors: [
          {
            anchorId: "asset-1::line-10-18::behavior",
            assetId: "asset-1",
            fileName: "module.c",
            fileRole: "generatedCode",
            location: "line 10-18",
            anchorType: "behavior",
            excerpt: "verbatim excerpt from the asset",
            summary: "Short summary of the anchor",
            tags: ["activation", "front_axle"]
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Only read the files listed in `Allowed asset files`.",
    "- Every anchor must have a unique anchorId.",
    "- `excerpt` must be verbatim from the asset.",
    "- `summary` should be short, concrete, and reuse the asset meaning without inventing behavior.",
    "- `location` should be a concrete locator like line numbers or page markers.",
    "- Focus on behavior, signals, conditions, outputs, boundaries, and timing relevant to software requirements."
  ].join("\n");
}

function buildAtomRecallPrompt(payload = {}) {
  const anchors = Array.isArray(payload.inputArtifact?.anchors)
    ? payload.inputArtifact.anchors.map(sanitizeAnchorItem)
    : Array.isArray(payload.inputArtifact?.evidence)
      ? payload.inputArtifact.evidence.map((item, index) => ({
          anchorId: String(item.anchorId || `legacy-evidence-${index + 1}`),
          assetId: String(item.assetId || ""),
          fileName: String(item.fileName || "").trim(),
          fileRole: String(item.fileRole || item.role || "").trim(),
          location: String(item.location || "").trim(),
          anchorType: "legacy_evidence",
          excerpt: clipText(item.excerpt || "", CLI_EXCERPT_MAX_LENGTH),
          summary: clipText(item.summary || item.excerpt || "", 300),
          tags: []
        }))
      : [];
  const inventory = sanitizeSkillInventory(payload.skillInventory || {});
  return [
    "You are executing the Hermes step `atom_recall` for software requirement generation.",
    "Select the most relevant skill atoms from the effective skill inventory for the given anchors.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Anchors:",
    JSON.stringify(anchors, null, 2),
    "",
    "Effective skill inventory:",
    JSON.stringify(inventory, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        items: [
          {
            skillCode: "module_rule_1",
            layer: "module",
            profileKey: "charging_management",
            kind: "writing_rule",
            title: "Rule title",
            content: "Rule content",
            order: 10,
            matchedReason: "Why this atom is relevant"
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Only return atoms from the provided inventory.",
    `- Return at most ${Math.max(1, Number(config.hermes.maxRecalledAtoms || 24))} atoms.`,
    "- Prefer module/domain-specific atoms when they clearly match the evidence.",
    "- `matchedReason` must be short and concrete."
  ].join("\n");
}

function buildOutlinePrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const assets = Array.isArray(inputArtifact.assets) ? inputArtifact.assets.map(sanitizeAssetItem) : [];
  const anchors = Array.isArray(inputArtifact.anchors)
    ? inputArtifact.anchors.map(sanitizeAnchorItem)
    : Array.isArray(inputArtifact.evidence)
      ? inputArtifact.evidence.map((item, index) => ({
          anchorId: String(item.anchorId || `legacy-evidence-${index + 1}`),
          assetId: String(item.assetId || ""),
          fileName: String(item.fileName || "").trim(),
          fileRole: String(item.fileRole || item.role || "").trim(),
          location: String(item.location || "").trim(),
          anchorType: "legacy_evidence",
          excerpt: clipText(item.excerpt || "", CLI_EXCERPT_MAX_LENGTH),
          summary: clipText(item.summary || item.excerpt || "", 300),
          tags: []
        }))
      : [];
  const skillBundle = sanitizeSkillBundle(
    inputArtifact.skillBundle || {
      bundlePath: payload.skillBundlePath,
      manifestPath: payload.skillBundlePath,
      recommendedSkillCodes: payload.recommendedSkillCodes
    },
    { includeChunks: false }
  );
  const recalledAtoms = Array.isArray(payload.inputArtifact?.recalledAtoms)
    ? payload.inputArtifact.recalledAtoms.map((item) => ({
        skillCode: item.skillCode,
        title: item.title,
        matchedReason: clipText(item.matchedReason || "", 300)
      }))
    : [];
  return [
    "You are executing the Hermes step `outline_build` for software requirement generation.",
    "Create a concise requirement-writing outline from the asset anchors, task skill bundle, and recalled skill atoms.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Assets:",
    JSON.stringify(assets, null, 2),
    "",
    "Anchors:",
    JSON.stringify(anchors, null, 2),
    "",
    "Task skill bundle:",
    JSON.stringify(skillBundle, null, 2),
    "",
    "Recalled skill atoms:",
    JSON.stringify(recalledAtoms, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        summary: "One paragraph summary",
        sections: [
          {
            title: "Functional behavior",
            objective: "What this section should cover",
            anchorIds: ["asset-1::line-10-18::behavior"]
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    `- Return at most ${Math.max(1, Number(config.hermes.maxOutlineSections || 6))} sections.`,
    "- Read the task skill bundle manifest and use recommended skill codes as the primary structure hints for this step.",
    "- Do not read skill正文 chunk files in this step unless the manifest alone cannot disambiguate the section structure.",
    "- Keep the outline within software requirements scope.",
    "- Do not include detail design or HIL-specific fields.",
    "- Only reference anchors that exist in the provided anchor list."
  ].join("\n");
}

function buildModuleBootstrapAnalyzePrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const project = sanitizeProjectContext(inputArtifact.project || {});
  const assets = Array.isArray(inputArtifact.assets) ? inputArtifact.assets.map(sanitizeAssetItem) : [];
  const anchors = Array.isArray(inputArtifact.anchors) ? inputArtifact.anchors.map(sanitizeAnchorItem) : [];
  const skillBundle = sanitizeSkillBundle(
    inputArtifact.skillBundle || {
      bundlePath: payload.skillBundlePath,
      manifestPath: payload.skillBundlePath,
      recommendedSkillCodes: payload.recommendedSkillCodes
    },
    { includeChunks: false }
  );
  const recalledAtoms = Array.isArray(inputArtifact.recalledAtoms)
    ? inputArtifact.recalledAtoms.map((item) => ({
        skillCode: item.skillCode,
        title: item.title,
        matchedReason: clipText(item.matchedReason || "", 300)
      }))
    : [];
  return [
    "You are executing the Hermes step `module_bootstrap_analyze` for software requirement cold start.",
    "Analyze the provided assets, anchors, task skill bundle, and recalled skill shortlist to derive reusable module-level writing guidance.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Assets:",
    JSON.stringify(assets, null, 2),
    "",
    "Anchors:",
    JSON.stringify(anchors, null, 2),
    "",
    "Task skill bundle:",
    JSON.stringify(skillBundle, null, 2),
    "",
    "Recalled skill atoms:",
    JSON.stringify(recalledAtoms, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        summary: "One paragraph module analysis",
        themes: [
          {
            title: "Cooling request establishment",
            objective: "Describe the core module topic and writing focus",
            anchorIds: ["anchor-1"]
          }
        ],
        ruleFocus: ["Prefer lifecycle wording for this module"],
        cautionNotes: ["Do not drift into implementation detail"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Focus on reusable module-level guidance for software requirement writing.",
    "- Reuse only the provided anchors and recalled atoms; do not invent source anchor ids.",
    "- Identify the core behavioral topics, preferred writing pattern, and key pitfalls for this module.",
    "- Keep the analysis concise and directly useful for generating module skill knowledge."
  ].join("\n");
}

function buildModuleBootstrapGeneratePrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const project = sanitizeProjectContext(inputArtifact.project || {});
  const assets = Array.isArray(inputArtifact.assets) ? inputArtifact.assets.map(sanitizeAssetItem) : [];
  const anchors = Array.isArray(inputArtifact.anchors) ? inputArtifact.anchors.map(sanitizeAnchorItem) : [];
  const skillBundle = sanitizeSkillBundle(
    inputArtifact.skillBundle || {
      bundlePath: payload.skillBundlePath,
      manifestPath: payload.skillBundlePath,
      recommendedSkillCodes: payload.recommendedSkillCodes
    }
  );
  const recalledAtoms = Array.isArray(inputArtifact.recalledAtoms)
    ? inputArtifact.recalledAtoms.map((item) => ({
        skillCode: item.skillCode,
        title: item.title,
        matchedReason: clipText(item.matchedReason || "", 300),
        content: clipText(item.content || "", 900)
      }))
    : [];
  const analysis = sanitizeModuleBootstrapAnalysis(inputArtifact.analysis || {});
  const allowedKinds = getAllowedKindsForAreasAndLayer(["domain_knowledge"], "module");
  return [
    "You are executing the Hermes step `module_bootstrap_generate` for software requirement cold start.",
    "Generate reusable module-level skill knowledge for this module.",
    "The output must be compatible with the existing module `domain-knowledge.json` schema.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Analysis:",
    JSON.stringify(analysis, null, 2),
    "",
    "Assets:",
    JSON.stringify(assets, null, 2),
    "",
    "Anchors:",
    JSON.stringify(anchors, null, 2),
    "",
    "Task skill bundle:",
    JSON.stringify(skillBundle, null, 2),
    "",
    "Recalled skill atoms:",
    JSON.stringify(recalledAtoms, null, 2),
    "",
    "Module layer allowed kinds:",
    JSON.stringify(allowedKinds, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        version: 1,
        generationPriorities: ["Prioritize the core behavioral lifecycle first."],
        examples: [],
        ruleHints: [
        {
          domain: "embedded_vcu",
          subdomain: "thermal_management",
          sectionHints: ["Cooling request establishment"],
          writingPattern: "First write establishment, then withdrawal conditions.",
          targetStyle: "Concise software requirement style",
          sourceBasis: ["系统需求", "参考软件需求", "相关既有技能规则"]
        }
      ],
        antiPatterns: ["Do not mix implementation details into requirement text"],
        sourceOfTruthPolicy: {
          preferredFunctionSection: {
            sectionNumber: "",
            title: "Thermal management"
          },
          preferredSubsections: [
            {
              sectionNumber: "",
              title: "Cooling request lifecycle",
              coreRequirementTypes: ["software_requirement"]
            }
          ],
          coreFirst: true,
          preferSymmetricExpansion: true,
          preferObjectSpecificRequirements: true,
          discourageGenericScatterRequirements: true
        }
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Produce reusable module-level guidance, not final software requirement result items.",
    "- Keep the output within software requirement scope.",
    "- Base the guidance on the provided analysis, anchors, and recalled atoms.",
    "- You must only generate kinds that are valid for the module layer allowed kinds listed above.",
    "- Do not output `document_blueprint_section` or `document_blueprint_policy`.",
    "- If you need to express section placement or output-organization intent, encode it inside `ruleHints.sectionHints`, `generationPriorities`, or `sourceOfTruthPolicy` instead so it can be stored as module-layer `source_policy_setting` items.",
    "- `ruleHints.sourceBasis` must use stable human-readable basis labels such as `系统需求`、`参考软件需求`、`相关代码语义`、`相关既有技能规则`.",
    "- Do not include raw anchor ids, UUIDs, or runtime artifact labels inside `sourceBasis`, such as `task skill bundle recalled atoms`, `task skill bundle shortlist`, or `...锚点 <uuid>`.",
    "- If a specific anchor contributes an important condition or edge case, write that condition directly into `writingPattern`, `generationPriorities`, or `antiPatterns` instead of citing the anchor id.",
    "- `examples` may be empty if no trustworthy example can be derived from the provided sources.",
    "- Do not invent source files, anchor ids, or unsupported sections."
  ].join("\n");
}

function buildContentGeneratePrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const project = sanitizeProjectContext(inputArtifact.project || {});
  const assets = Array.isArray(inputArtifact.assets) ? inputArtifact.assets.map(sanitizeAssetItem) : [];
  const anchors = Array.isArray(inputArtifact.anchors)
    ? inputArtifact.anchors.map(sanitizeAnchorItem)
    : Array.isArray(inputArtifact.evidence)
      ? inputArtifact.evidence.map((item, index) => ({
          anchorId: String(item.anchorId || `legacy-evidence-${index + 1}`),
          assetId: String(item.assetId || ""),
          fileName: String(item.fileName || "").trim(),
          fileRole: String(item.fileRole || item.role || "").trim(),
          location: String(item.location || "").trim(),
          anchorType: "legacy_evidence",
          excerpt: clipText(item.excerpt || "", CLI_EXCERPT_MAX_LENGTH),
          summary: clipText(item.summary || item.excerpt || "", 300),
          tags: []
        }))
      : [];
  const skillBundle = sanitizeSkillBundle(inputArtifact.skillBundle || {
    bundlePath: payload.skillBundlePath,
    manifestPath: payload.skillBundlePath,
    recommendedSkillCodes: payload.recommendedSkillCodes
  });
  const recalledAtoms = Array.isArray(inputArtifact.recalledAtoms)
    ? inputArtifact.recalledAtoms.map((item) => ({
        skillCode: item.skillCode,
        title: item.title,
        matchedReason: clipText(item.matchedReason || "", 300),
        content: clipText(item.content || "", 900)
      }))
    : [];
  const modelRequirementView = inputArtifact.modelRequirementView && typeof inputArtifact.modelRequirementView === "object"
    ? inputArtifact.modelRequirementView
    : { version: "1.0", sourceAssets: [], facts: [] };
  const modelRequirementSourceAssets = Array.isArray(modelRequirementView.sourceAssets)
    ? modelRequirementView.sourceAssets
    : [];
  const allSourceAssets = [...assets, ...modelRequirementSourceAssets];
  const hasGeneratedCodeAsset = allSourceAssets.some((asset) =>
    /generated_c|generatedcode|\.c$/i.test(`${asset.fileRole || asset.role || ""} ${asset.fileName || asset.originalName || ""}`.trim())
  );
  const hasModelRequirementJsonAsset = allSourceAssets.some((asset) =>
    /model_requirement_view_json|simulink_slx|\.slx$|model-requirement-view/i.test(`${asset.fileRole || asset.role || ""} ${asset.fileName || asset.originalName || ""}`.trim())
  );
  const requiredTitleOutline = sanitizeManualTitleOutline(inputArtifact.requiredTitleOutline || inputArtifact.manualTitleOutline || {});
  const requiredLeafCount = Math.max(0, Number(inputArtifact.requiredLeafCount || 0) || 0);
  const template = inputArtifact.template || {};
  const sourcePolicyRules = [
    "- Use modelRequirementView.facts as the primary source-of-truth references for generated requirements.",
    hasModelRequirementJsonAsset && !hasGeneratedCodeAsset
      ? "- No generated C source is present in this task. Do not assume, cite, or request a `.c` file; treat the Simulink/modelRequirementView JSON facts as the implementation evidence replacing generated C."
      : "",
    hasModelRequirementJsonAsset && !hasGeneratedCodeAsset
      ? "- For JSON-only replacement runs, sourceFactIds should include relevant implementation evidence from Simulink/modelRequirementView JSON facts when available; do not rely only on system requirement facts unless no relevant model fact exists."
      : "",
    modelRequirementView.compactForGeneration
      ? "- The supplied modelRequirementView is a compact generation view. It intentionally omits irrelevant audit facts; use only the fact ids that are present in this compact view."
      : ""
  ].filter(Boolean);
  return [
    "You are executing the Hermes step `content_generate` for software requirement generation.",
    "Generate structured software requirement body text from the provided project context, template, modelRequirementView, task skill bundle, and recalled skill hints.",
    "Do not generate section titles or item titles. The backend will inject them after generation.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Template:",
    JSON.stringify(template, null, 2),
    "",
    "Required title outline:",
    JSON.stringify(requiredTitleOutline, null, 2),
    "",
    "Required leaf count:",
    JSON.stringify({ requiredLeafCount }, null, 2),
    "",
    "Assets:",
    JSON.stringify(assets, null, 2),
    "",
    "Input source policy:",
    JSON.stringify({ hasGeneratedCodeAsset, hasModelRequirementJsonAsset }, null, 2),
    "",
    "Anchors:",
    JSON.stringify(anchors, null, 2),
    "",
    "Model requirement view:",
    JSON.stringify(modelRequirementView, null, 2),
    "",
    "Task skill bundle:",
    JSON.stringify(skillBundle, null, 2),
    "",
    "Recalled skill atoms:",
    JSON.stringify(recalledAtoms, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        items: [
          {
            requirementText: "The software shall ...",
            type: "functional",
            verificationHint: "How to verify",
            sourceFactIds: ["fact-123456789abc"],
            sourceAnchorIds: [],
            conflictNote: ""
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- First read the task skill bundle manifest, then read only the skill chunks you need to write each requirement.",
    ...sourcePolicyRules,
    "- Treat recalled `good_example`, `rule_hint`, and module-specific skill atoms as writing and coverage guidance; do not cite them as source evidence unless they also appear as modelRequirementView facts or anchors.",
    "- Treat `requiredTitleOutline` as the authoritative ordering and cardinality constraint for the output items.",
    "- Return exactly `requiredLeafCount` items in the same order as the leaf list implied by `requiredTitleOutline`.",
    "- Do not invent titles, headings, or grouping text.",
    "- Preserve explicit source requirement cases and thresholds, especially activation, exit, reset, re-enable, counter clearing, hysteresis, Enabled/Disabled outputs, and sleep/wake coordination.",
    "- Preserve units and enum values exactly: do not add `%` to counters, timers, failure counts, or enum thresholds; keep explicit values such as `0x2`, `20分钟`, `11.8V`, and `10.5%` when they appear in sources.",
    "- Prefer sourceFactIds and only use ids that exist in modelRequirementView.facts.",
    "- sourceAnchorIds is accepted only as a compatibility fallback when no fact id can represent the source.",
    "- If you return sourceAnchorIds, they must only contain anchor ids that exist in the provided anchor list.",
    "- Keep content at software requirement level, not implementation detail level.",
    "- Do not invent sources, fact ids, anchor ids, or skill codes."
  ].join("\n");
}

function buildDocumentExtractPrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const project = sanitizeProjectContext(inputArtifact.project || {});
  const targetDocumentType = String(inputArtifact.targetDocumentType || "software_requirement").trim();
  const sourceText = clipText(inputArtifact.sourceText || "", 16000);
  const images = Array.isArray(inputArtifact.images) ? inputArtifact.images.map(sanitizeAssetItem) : [];
  const spreadsheets = Array.isArray(inputArtifact.spreadsheets) ? inputArtifact.spreadsheets.map(sanitizeAssetItem) : [];
  const spreadsheetExtraction = inputArtifact.spreadsheetExtraction && typeof inputArtifact.spreadsheetExtraction === "object"
    ? inputArtifact.spreadsheetExtraction
    : null;
  return [
    "You are executing the Hermes step `document_extract_generate` for module-local document extraction.",
    "Extract the uploaded images, spreadsheets, and/or pasted text into a structured markdown document.",
    "Respect the original wording and layout as much as possible. Do not omit content. Do not invent missing requirements.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Target document type:",
    JSON.stringify({ targetDocumentType }, null, 2),
    "",
    "Source text:",
    JSON.stringify({ sourceText }, null, 2),
    "",
    "Allowed image files:",
    JSON.stringify(images, null, 2),
    "",
    "Allowed spreadsheet files:",
    JSON.stringify(spreadsheets, null, 2),
    "",
    "Spreadsheet extraction summary:",
    JSON.stringify(spreadsheetExtraction, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        targetDocumentType,
        title: "模块名-文档类型",
        markdown: "# 模块名文档\n\n## 文档信息\n",
        summary: "提取完成摘要",
        keySections: ["文档信息", "章节信息", "需求条目", "提炼摘要"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Use the uploaded images, spreadsheets, and/or pasted text as the only source of truth.",
    "- If spreadsheet extraction summary is present, treat the normalized spreadsheet rows as source truth and reorganize them without inventing extra steps.",
    "- Preserve chapter numbers, requirement ids, signal names, status values, and section structure when present.",
    "- For `system_requirement`, format as: 文档信息 / 章节信息 / 需求条目 / 提炼摘要.",
    "- For `software_requirement`, format as: 文档信息 / 章节结构 / 需求条目 / 提炼摘要.",
    "- For `detail_design`, preserve explicit structure, keep simple numbering, and remove internal raw ids when the source uses them only as implementation labels.",
    "- For `hil_test_case`, preserve test case titles and ids, keep Precondition / Step Description / Expected Result structure, and write a reviewable structured markdown test case document.",
    "- File naming style inside markdown should align with module name + document type, but the JSON should only return the document content.",
    "- Do not add content that is not supported by the input."
  ].join("\n");
}

function buildSlxParsePrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const project = sanitizeProjectContext(inputArtifact.project || {});
  const slxFiles = Array.isArray(inputArtifact.slxFiles) ? inputArtifact.slxFiles.map(sanitizeAssetItem) : [];
  return [
    "You are executing the Hermes step `slx_parse_generate` for SLX model parsing.",
    "Analyze the uploaded Simulink .slx model files and produce a modelRequirementView JSON with structured facts.",
    "Each fact must capture an observable behavior, interface, state transition, parameter threshold, logic rule, timing constraint, or diagnostic from the model.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Allowed SLX files:",
    JSON.stringify(slxFiles, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        modelRequirementView: {
          version: "1.0",
          documentType: "software_requirement",
          sourceAssets: [{ assetId: "id", fileName: "name.slx", fileRole: "simulink_slx" }],
          facts: [{
            id: "fact-<hash>",
            topic: "inferred topic",
            condition: "triggering condition",
            behavior: "observable behavior excerpt",
            signals: ["signal names"],
            parameters: [{ value: "val", unit: "unit" }],
            stateLogic: "state-related logic",
            sourceRefs: [{
              sourceAnchorId: "",
              assetId: "id",
              fileName: "name.slx",
              fileRole: "simulink_slx",
              location: "block path",
              excerpt: "relevant excerpt"
            }]
          }]
        },
        summary: "解析完成摘要"
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Only use the SLX model as source of truth. Do not invent facts.",
    "- Each fact must have a unique id, behavior, and at least one sourceRef.",
    "- sourceRefs must include fileName, fileRole, location, and excerpt.",
    "- Group related signals/parameters into the same fact when they describe a single behavior.",
    "- Preserve block paths, signal names, state names, and parameter values exactly."
  ].join("\n");
}

function sanitizeSlxInterpreterHistory(history = []) {
  return Array.isArray(history)
    ? history.map((message) => ({
        role: String(message?.role || "").trim() === "user" ? "user" : "assistant",
        content: clipText(message?.content || "", 2400),
        status: String(message?.status || "").trim(),
        createdAt: String(message?.createdAt || "").trim()
      })).filter((message) => message.content)
    : [];
}

function buildSlxInterpretPrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const project = sanitizeProjectContext(inputArtifact.project || {});
  const model = sanitizeAssetItem(inputArtifact.model || {});
  const question = clipText(inputArtifact.question || "", 8000);
  const history = sanitizeSlxInterpreterHistory(inputArtifact.history || []);
  return [
    "You are executing the Hermes step `slx_interpret_answer` for an interactive SLX model interpreter.",
    "Answer the user's question about exactly one selected Simulink .slx model.",
    "You must inspect the selected model with the available Simulink Agentic Toolkit / MATLAB MCP capabilities before answering.",
    "Prefer these tools when available: model_overview, model_read, model_query_params, model_resolve_params.",
    "If the selected model includes `downloadUrl`, download that file onto the API-server host before calling MATLAB/SATK; Linux absolute paths are not readable from Windows.",
    "Do not answer from cached modelRequirementView JSON unless the tool path is unavailable; the selected .slx model is the source of truth.",
    "Return strict JSON only. No markdown fences. No explanation outside JSON.",
    "",
    "Project and module context:",
    JSON.stringify(project, null, 2),
    "",
    "Selected SLX model:",
    JSON.stringify(model, null, 2),
    "",
    "Conversation history:",
    JSON.stringify(history, null, 2),
    "",
    "User question:",
    question,
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        answerMarkdown: "A concise but useful Markdown answer in Chinese unless the user asked otherwise.",
        summary: "One-sentence task summary.",
        evidence: [{
          fileName: "model.slx",
          fileRole: "simulink_slx",
          location: "model/block/path or SATK scope",
          excerpt: "Short evidence from the model or tool result"
        }],
        warnings: ["Optional limitations, unavailable tools, or assumptions"]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Use only the selected SLX model and the explicit conversation context.",
    "- When `downloadUrl` is present, fetch that exact URL and analyze the downloaded local copy on the tool host.",
    "- If MATLAB MCP / SATK is unavailable, say so in warnings and answer only what can be supported by available evidence.",
    "- Preserve block paths, signal names, state names, parameter names, and threshold values exactly.",
    "- Keep the answer focused on the user's question; do not dump the full model structure.",
    "- evidence must cite the model file and the most relevant scope/block/path or tool excerpt."
  ].join("\n");
}

function buildSoftwareRequirementMarkdownPrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const prompt = String(inputArtifact.prompt || "").trim();
  if (prompt) {
    return prompt;
  }

  return [
    "You are executing the Hermes step `software_requirement_markdown_generate`.",
    "Read `prompt.md` from the provided workspace directory, follow it exactly, write the requested Markdown artifact, and return strict JSON only.",
    "",
    "Workspace artifact:",
    JSON.stringify(
      {
        workspaceDir: inputArtifact.workspaceDir || "",
        manifestPath: inputArtifact.manifestPath || "",
        taskBriefPath: inputArtifact.taskBriefPath || "",
        promptPath: inputArtifact.promptPath || "",
        outputRelativePath: inputArtifact.outputRelativePath || "outputs/software-requirements.md"
      },
      null,
      2
    )
  ].join("\n");
}

function sanitizeSimulinkModuleDescriptionArtifact(inputArtifact = {}) {
  const project = inputArtifact.unitTestProject && typeof inputArtifact.unitTestProject === "object"
    ? inputArtifact.unitTestProject
    : null;
  return {
    workspaceDir: clipText(inputArtifact.workspaceDir || "", CLI_PATH_MAX_LENGTH),
    modelSlxPath: clipText(inputArtifact.modelSlxPath || "", CLI_PATH_MAX_LENGTH),
    modelMatPath: clipText(inputArtifact.modelMatPath || "", CLI_PATH_MAX_LENGTH),
    modelInitScriptPath: clipText(inputArtifact.modelInitScriptPath || "", CLI_PATH_MAX_LENGTH),
    outputDir: clipText(inputArtifact.outputDir || "", CLI_PATH_MAX_LENGTH),
    unitTestProject: project
      ? {
          id: clipText(project.id || "", 40),
          name: clipText(project.name || "", 120),
          label: clipText(project.label || "", 180)
        }
      : null,
    skillName: clipText(inputArtifact.skillName || "simulink-module-description-generator", 160),
    expectedOutputPattern: clipText(inputArtifact.expectedOutputPattern || "outputs/*.docx", 200),
    modelSlxFileName: clipText(inputArtifact.modelSlxFileName || path.basename(inputArtifact.modelSlxPath || "model.slx"), 200),
    modelMatFileName: clipText(inputArtifact.modelMatFileName || path.basename(inputArtifact.modelMatPath || "model.mat"), 200),
    modelInitScriptFileName: clipText(inputArtifact.modelInitScriptFileName || path.basename(inputArtifact.modelInitScriptPath || ""), 200),
    projectInitScripts: Array.isArray(inputArtifact.projectInitScripts)
      ? inputArtifact.projectInitScripts.map((item) => clipText(item || "", 240)).filter(Boolean)
      : []
  };
}

function buildSimulinkModuleDescriptionPrompt(payload = {}) {
  const inputArtifact = sanitizeSimulinkModuleDescriptionArtifact(payload.inputArtifact || {});
  return [
    "You are executing the Hermes step `simulink_module_description_generate`.",
    "Use the Codex skill `simulink-module-description-generator` for the full workflow.",
    "The task is to generate a Chinese software module function description DOCX, shown in the platform UI as software detailed design generation, from one `.slx` model and its matching `.mat` data file.",
    "",
    "Workspace artifact:",
    JSON.stringify(inputArtifact, null, 2),
    "",
    "Execution contract:",
    "- Treat `workspaceDir` as the sandbox root. Do not read or write outside it.",
    "- The model input is `modelSlxPath`; the matching data file is `modelMatPath`.",
    "- `unitTestProject.id` is the internal project number, such as `01`; display labels such as `01_楚能` must never be used as paths.",
    "- The Hermes Agent service has already copied the selected project's addon package into `workspaceDir` before this CLI run. Load support files, project tool folders, dictionaries, `.sldd`, and init files from the workspace, not from the external addon root.",
    "- If `projectInitScripts` is non-empty, it contains the uploaded model-specific initialization `.m` script relative to `workspaceDir`; treat it as the explicit initialization entrypoint. You may set `MODULE_DOC_PROJECT_INIT_SCRIPTS` to that semicolon-separated list before calling the skill setup.",
    "- If `projectInitScripts` is empty, no model-specific init script was uploaded; rely on the copied project addon/workspace and the skill setup to discover common initialization scripts.",
    "- Before loading Simulink files, change MATLAB current folder to `workspaceDir`.",
    "- Prefer the canonical workspace filenames `modelSlxFileName`, `modelMatFileName`, and when present `modelInitScriptFileName` for MATLAB `load`, `load_system`, and init bootstrap steps.",
    "- Use the skill named by `skillName`. The default is `simulink-module-description-generator`.",
    "- Use the skill's bundled setup flow and support scripts, including `scripts/setup_module_doc_support.m` when available.",
    "- Generate DOCX only. Do not register Markdown, JSON, screenshots, logs, or intermediate files as final outputs.",
    "- Write generated DOCX files only under `outputDir`.",
    "- Use the skill's bundled template `assets/templates/Template_Software_Detailed_Design.docx` when the skill provides it.",
    "- Preferred final filename pattern is `outputs/<ModelName>_软件模块功能描述.docx`; any `outputs/*.docx` is acceptable.",
    "- This independent flow does not receive a requirements PDF. Do not invent a requirements-PDF dependency and do not fill design-basis body text from a missing PDF.",
    "- Do not call or reuse legacy software detail design code paths, including `/detail-design-generation`, `detail_design`, `generator.js`, or old document-generation services.",
    "- Before returning `status: \"completed\"`, verify at least one DOCX file exists under `outputDir` and include it in `outputFiles` using a relative path matching `outputs/*.docx`.",
    "- If MATLAB, SATK, Simulink, or required skill assets are unavailable, return `status: \"failed\"` with a clear `errorMessage` and warnings.",
    "",
    "Return strict JSON only. No markdown fences. No prose outside JSON.",
    "Required JSON shape:",
    JSON.stringify(
      {
        status: "completed",
        summary: "中文摘要，说明已生成软件模块功能描述 DOCX。",
        outputFiles: [
          {
            relativePath: "outputs/model_软件模块功能描述.docx",
            kind: "software_module_description_docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            description: "Generated software module description DOCX"
          }
        ],
        warnings: []
      },
      null,
      2
    )
  ].join("\n");
}

const REPLAY_PROPOSAL_ALLOWED_LAYERS = new Set(["generic", "docType", "domain", "module"]);
const REPLAY_PROPOSAL_ALLOWED_ACTIONS = new Set([
  "add_skill_item",
  "modify_skill_item",
  "split_skill_item",
  "deprecate_skill_item"
]);
const REPLAY_PROPOSAL_ALLOWED_KINDS = new Set([
  "writing_rule",
  "good_example",
  "rule_hint",
  "generation_priority",
  "extraction_rule",
  "validation_rule",
  "anti_pattern",
  "bad_example",
  "source_alias",
  "normalization_rule",
  "forbidden_expansion",
  "source_policy_setting",
  "document_blueprint_section",
  "document_blueprint_policy",
  "code_style_prefix"
]);

function normalizeReplayLayer(value = "", fallback = "") {
  const trimmed = String(value || "").trim();
  return REPLAY_PROPOSAL_ALLOWED_LAYERS.has(trimmed) ? trimmed : fallback;
}

function normalizeReplayAction(value = "", fallback = "modify_skill_item") {
  const trimmed = String(value || "").trim();
  const mapped = {
    add_rule: "add_skill_item",
    add_example: "add_skill_item",
    modify_rule: "modify_skill_item",
    split_rule: "split_skill_item",
    deprecate_rule: "deprecate_skill_item"
  }[trimmed];
  const normalized = mapped || trimmed || fallback;
  return REPLAY_PROPOSAL_ALLOWED_ACTIONS.has(normalized) ? normalized : fallback;
}

function normalizeReplayKind(value = "", fallback = "validation_rule") {
  const trimmed = String(value || "").trim();
  return REPLAY_PROPOSAL_ALLOWED_KINDS.has(trimmed) ? trimmed : fallback;
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

function getReplayProposalHint(payload = {}) {
  const replayContext = payload.inputArtifact?.replayContext;
  const manifest =
    replayContext?.manifest && typeof replayContext.manifest === "object"
      ? replayContext.manifest
      : payload.inputArtifact?.replayManifest && typeof payload.inputArtifact.replayManifest === "object"
        ? payload.inputArtifact.replayManifest
        : {};
  const taskContext =
    manifest.taskContext && typeof manifest.taskContext === "object"
      ? manifest.taskContext
      : replayContext?.taskContext && typeof replayContext.taskContext === "object"
        ? replayContext.taskContext
        : {};
  const records = Array.isArray(manifest.rejectionContext?.records)
    ? manifest.rejectionContext.records
    : [];
  const candidates = Array.isArray(manifest.layerSkillInventory)
    ? manifest.layerSkillInventory
    : Array.isArray(manifest.candidateSkillInventory)
      ? manifest.candidateSkillInventory
      : [];
  const targetArea = Array.isArray(taskContext.targetAreas) && taskContext.targetAreas.length
    ? String(taskContext.targetAreas[0] || "").trim() || "validation"
    : "validation";
  const targetLayer = normalizeReplayLayer(taskContext.targetLayerConstraint || "", "docType");
  const preferredKind = mapReplayAreaToKind(targetArea);
  const allowedKinds = Array.isArray(taskContext.allowedKindsForReplay)
    ? taskContext.allowedKindsForReplay.map((item) => normalizeReplayKind(item || "", "")).filter(Boolean)
    : [];
  const targetKind = allowedKinds.includes(preferredKind) ? preferredKind : allowedKinds[0] || preferredKind;
  const moduleProfileKey = normalizeReplaySlug(taskContext.moduleSkillKey || taskContext.moduleName || "");
  const documentType = normalizeReplaySlug(taskContext.documentType || "software_requirement") || "software_requirement";
  const domain = normalizeReplaySlug(taskContext.domain || "embedded_vcu") || "embedded_vcu";
  let targetProfileKey = normalizeReplaySlug(taskContext.targetProfileKeyConstraint || "");
  if (!targetProfileKey) {
    if (targetLayer === "module") targetProfileKey = moduleProfileKey || documentType;
    else if (targetLayer === "domain") targetProfileKey = domain;
    else if (targetLayer === "docType") targetProfileKey = documentType;
    else targetProfileKey = "generic";
  }
  const candidateSkillMap = new Map(
    candidates
      .map((item) => [String(item?.skillCode || item?.ruleId || "").trim(), item])
      .filter(([skillCode]) => skillCode)
  );
  const validEvidenceRefs = new Set(
    records
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean)
  );
  const fallbackReason = records
    .flatMap((item) => [item?.expectedNote, item?.reasonText])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
  return {
    targetLayer,
    targetProfileKey,
    targetKind,
    candidateSkillMap,
    validEvidenceRefs,
    fallbackReason,
    evidenceRefs: [...validEvidenceRefs],
    reasonCategory: String(records[0]?.reasonCategory || "").trim()
  };
}

function buildReplayNewRuleDraft(item = {}, title = "", afterContent = "") {
  if (item.newRuleDraft && typeof item.newRuleDraft === "object") {
    return {
      title: String(item.newRuleDraft.title || title || "").trim(),
      content: String(item.newRuleDraft.content || afterContent || "").trim(),
      structuredPayload:
        item.newRuleDraft.structuredPayload && typeof item.newRuleDraft.structuredPayload === "object"
          ? item.newRuleDraft.structuredPayload
          : null,
      rules: Array.isArray(item.newRuleDraft.rules)
        ? item.newRuleDraft.rules
            .map((rule) => ({
              title: String(rule?.title || "").trim(),
              content: String(rule?.content || "").trim(),
              structuredPayload:
                rule?.structuredPayload && typeof rule.structuredPayload === "object" ? rule.structuredPayload : null
            }))
            .filter((rule) => rule.title && rule.content)
        : []
    };
  }
  if (!afterContent) {
    return null;
  }
  return {
    title: title || "回投提议",
    content: afterContent,
    structuredPayload: null,
    rules: []
  };
}

function normalizeReplayEvidenceRefs(rawRefs = [], validEvidenceRefs = new Set(), fallbackEvidenceRefs = []) {
  if (!Array.isArray(rawRefs)) {
    return Array.isArray(fallbackEvidenceRefs) ? [...new Set(fallbackEvidenceRefs.filter(Boolean))] : [];
  }
  const refs = rawRefs.map((item) => String(item || "").trim()).filter(Boolean);
  if (!validEvidenceRefs.size) {
    return [...new Set(refs)];
  }
  const filtered = [...new Set(refs.filter((item) => validEvidenceRefs.has(item)))];
  if (filtered.length) {
    return filtered;
  }
  return Array.isArray(fallbackEvidenceRefs) ? [...new Set(fallbackEvidenceRefs.filter(Boolean))] : [];
}

function inferReplayReuseJudgement(targetLayer = "") {
  if (targetLayer === "module") return "module_specific";
  if (targetLayer === "domain") return "domain_general";
  if (targetLayer === "generic") return "generic_general";
  return "doc_type_general";
}

function inferReplayRuleIntent(targetKind = "") {
  if (targetKind === "writing_rule") return "补充文档类型写作规则。";
  if (targetKind === "extraction_rule") return "补充通用抽取规则。";
  if (targetKind === "bad_example") return "补充反例或样例约束。";
  if (targetKind === "rule_hint") return "补充跨模块领域规则。";
  return "补充文档类型校验规则。";
}

function buildReplayChangeSummary(item = {}, conclusionType = "") {
  const explicit = String(item.changeSummary || "").trim();
  if (explicit) return explicit;
  const title = String(item.title || item.newRuleDraft?.title || "").trim();
  if (title) return title;
  const whyChange = String(item.whyChange || "").trim();
  if (whyChange) return whyChange;
  const fallbackReason = String(item.fallbackReason || item.rationale || "").trim();
  if (fallbackReason) {
    return conclusionType === "create_new"
      ? `新增技能条目以处理：${fallbackReason}`
      : `修改技能条目以处理：${fallbackReason}`;
  }
  return conclusionType === "create_new" ? "新增技能条目" : "修改已有技能条目";
}

function normalizeReplayProposalItem(item = {}, index = 0, hint = {}) {
  let action = normalizeReplayAction(item.action || "", "modify_skill_item");
  const candidateSkillCode = String(item.targetSkillCode || item.targetRuleId || "").trim();
  const candidate = hint.candidateSkillMap?.get(candidateSkillCode) || null;
  const targetLayer = normalizeReplayLayer(
    item.targetLayer || item.layer || candidate?.targetLayer || candidate?.layer || "",
    hint.targetLayer || "docType"
  );
  let targetProfileKey = normalizeReplaySlug(
    item.targetProfileKey || item.profileKey || candidate?.targetProfileKey || candidate?.profileKey || hint.targetProfileKey || ""
  );
  if (!targetProfileKey) {
    targetProfileKey = targetLayer === "generic" ? "generic" : hint.targetProfileKey || "software_requirement";
  }
  const targetKind = normalizeReplayKind(
    item.targetKind || item.kind || candidate?.targetKind || candidate?.kind || "",
    hint.targetKind || "validation_rule"
  );
  const title = String(item.title || item.newRuleDraft?.title || `回投提议 ${index + 1}`).trim();
  const fallbackReason = String(item.fallbackReason || item.rationale || hint.fallbackReason || "").trim();
  const beforeContent = String(item.beforeContent || item.before || candidate?.content || candidate?.contentSummary || "").trim();
  const afterContent = String(item.afterContent || item.after || item.newRuleDraft?.content || "").trim();
  const evidenceRefs = normalizeReplayEvidenceRefs(
    item.evidenceRefs,
    hint.validEvidenceRefs || new Set(),
    hint.evidenceRefs || []
  );
  if (action === "modify_skill_item" && !candidateSkillCode) {
    action = "add_skill_item";
  }
  const conclusionType = action === "add_skill_item" ? "create_new" : "modify_existing";
  const newRuleDraft = buildReplayNewRuleDraft(item, title, afterContent);
  const abstractionScore = /^建议补充以下约束[:：]?/.test(afterContent) || /^请/.test(afterContent)
    ? 0.38
    : afterContent.length >= 40
      ? 0.78
      : 0.6;
  return {
    conclusionType,
    action,
    targetSkillCode: conclusionType === "create_new" ? "" : candidateSkillCode,
    targetLayer,
    targetProfileKey,
    targetKind,
    kind: targetKind,
    targetFile: String(item.targetFile || candidate?.targetFile || mapReplayKindToTargetFile(targetKind)).trim(),
    title,
    changeSummary: buildReplayChangeSummary(item, conclusionType),
    fallbackReason,
    whyCurrent: String(item.whyCurrent || "").trim() || "当前 skill 约束未覆盖这类回投问题。",
    whyChange: String(item.whyChange || "").trim() || "补充更明确的 atomic skill 约束后，可减少同类问题再次出现。",
    targetInsertionHint: String(item.targetInsertionHint || "").trim(),
    beforeContent,
    afterContent,
    before: beforeContent,
    after: afterContent || String(newRuleDraft?.content || "").trim(),
    rationale: String(item.rationale || fallbackReason || "").trim(),
    evidenceRefs,
    newRuleDraft,
    scopeDecision: String(item.scopeDecision || targetLayer).trim(),
    scopeReason:
      String(item.scopeReason || "").trim() ||
      (conclusionType === "create_new"
        ? "当前提议未命中现有 atomic skill，将在目标层新增规则。"
        : "当前提议命中现有 atomic skill，沿用该目标进行修订。"),
    scopeConfidence: Number(item.scopeConfidence ?? (conclusionType === "create_new" ? 0.6 : 0.86)) || 0,
    abstractionScore,
    isParaphraseOfRejection: Boolean(item.isParaphraseOfRejection) || abstractionScore < 0.5,
    reviewReadiness: String(item.reviewReadiness || "").trim() || (abstractionScore >= 0.75 ? "ready_to_apply" : "needs_human_refine"),
    reuseJudgement: String(item.reuseJudgement || "").trim() || inferReplayReuseJudgement(targetLayer),
    ruleIntent: String(item.ruleIntent || "").trim() || inferReplayRuleIntent(targetKind),
    recommendedSkillText: String(item.recommendedSkillText || "").trim()
  };
}

function buildFallbackReplayProposalItem(hint = {}) {
  const title = `${hint.reasonCategory || "Replay"}补充规则`;
  const afterContent = hint.fallbackReason
    ? `建议补充以下约束：${hint.fallbackReason}`
    : "建议补充更明确、可验证、可复用的 atomic skill 约束。";
  const candidate = [...(hint.candidateSkillMap?.values() || [])][0] || null;
  if (candidate?.skillCode || candidate?.ruleId) {
    const baseText = String(candidate.content || candidate.contentSummary || "").trim();
    return normalizeReplayProposalItem(
      {
        conclusionType: "modify_existing",
        action: "modify_skill_item",
        targetSkillCode: candidate.skillCode || candidate.ruleId || "",
        targetLayer: candidate.targetLayer || candidate.layer || hint.targetLayer,
        targetProfileKey: candidate.targetProfileKey || candidate.profileKey || hint.targetProfileKey,
        targetKind: candidate.targetKind || candidate.kind || hint.targetKind,
        title: `${candidate.title || title}（补充修订）`,
        changeSummary: `修改「${candidate.title || candidate.skillCode || candidate.ruleId || title}」，补充本次驳回暴露的边界约束。`,
        fallbackReason: hint.fallbackReason,
        whyCurrent: "当前命中的 atomic skill 尚未把这类问题沉淀成明确边界。",
        whyChange: "补充对应约束后，可降低同类回投再次发生的概率。",
        beforeContent: baseText,
        afterContent: baseText ? `${baseText}\n补充约束：${hint.fallbackReason || afterContent}` : afterContent,
        evidenceRefs: hint.evidenceRefs
      },
      0,
      hint
    );
  }
  return normalizeReplayProposalItem(
    {
      conclusionType: "create_new",
      action: "add_skill_item",
      targetLayer: hint.targetLayer,
      targetProfileKey: hint.targetProfileKey,
      targetKind: hint.targetKind,
      title,
      changeSummary: `新增「${title}」，沉淀本次驳回暴露的边界约束。`,
      fallbackReason: hint.fallbackReason,
      whyCurrent: "当前 skill 快照中没有足以承接该问题的 atomic skill。",
      whyChange: "新增对应 atomic skill 后，可把该问题沉淀为可复用规则。",
      beforeContent: "",
      afterContent,
      evidenceRefs: hint.evidenceRefs
    },
    0,
    hint
  );
}

function normalizeReplayProposalArtifact(parsed = {}, payload = {}) {
  const hint = getReplayProposalHint(payload);
  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item, index) => normalizeReplayProposalItem(item, index, hint)).filter(Boolean)
    : [];
  const normalizedItems = items.length ? items : [buildFallbackReplayProposalItem(hint)];
  return {
    summary: String(parsed.summary || `已生成 ${normalizedItems.length} 条回投提议。`).trim(),
    decisionSummary:
      String(parsed.decisionSummary || "").trim() ||
      `命中已有 atomic skill ${normalizedItems.filter((item) => item.action === "modify_skill_item").length} 条，建议新增 atomic skill ${normalizedItems.filter((item) => item.action === "add_skill_item").length} 条。`,
    rootCauses: Array.isArray(parsed.rootCauses)
      ? parsed.rootCauses.map((item) => String(item || "").trim()).filter(Boolean)
      : hint.reasonCategory
        ? [`多条驳回记录共同指向“${hint.reasonCategory}”相关问题。`]
        : [],
    validatorSuggestions: Array.isArray(parsed.validatorSuggestions)
      ? parsed.validatorSuggestions
          .map((item) => ({
            title: String(item?.title || "").trim(),
            ruleText: String(item?.ruleText || "").trim(),
            why: String(item?.why || "").trim()
          }))
          .filter((item) => item.title || item.ruleText || item.why)
      : [],
    items: normalizedItems
  };
}

function buildReplayProposalPrompt(payload = {}) {
  const inputArtifact = sanitizeReplayContextArtifact(payload.inputArtifact || {});
  return [
    "You are executing the Hermes step `replay_proposal_generate` for replay-based skill optimization.",
    "Use your local tools to read `manifest.json` first from the provided replay context directory.",
    "Then read `task-brief.md`, and read any specific files referenced by `manifest.json` under `effective-skill/` and `reference-assets/` when they are relevant to the replay task.",
    "Produce structured replay proposal JSON compatible with the existing replay proposal schema.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Replay context artifact:",
    JSON.stringify(inputArtifact, null, 2),
    "",
    "File contract:",
    "- `manifest.json` contains the structured replay context, including taskContext, rejectionContext.records, and candidate skill inventories.",
    "- `task-brief.md` is the operator-friendly replay brief and should only be used as a supporting summary source.",
    "",
    "Output requirements:",
    "- Stay strictly within the targetLayerConstraint and targetProfileKeyConstraint described by `manifest.json`.",
    "- Use evidenceRefs only from the rejection ids described by `rejectionContext.records` in `manifest.json`.",
    "- Prefer modifying an existing same-layer atomic skill when it can carry the issue clearly.",
    "- If no existing same-layer atomic skill can carry the issue, create a new one in the constrained layer/profile.",
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        summary: "One paragraph summary",
        decisionSummary: "Short decision summary",
        rootCauses: ["Root cause 1"],
        validatorSuggestions: [
          {
            title: "Optional validator suggestion",
            ruleText: "Read-only rule suggestion",
            why: "Why this helps"
          }
        ],
        items: [
          {
            conclusionType: "modify_existing",
            action: "modify_skill_item",
            targetSkillCode: "DOC-software_requirement-writing_rule-001",
            targetLayer: "docType",
            targetProfileKey: "software_requirement",
            targetKind: "validation_rule",
            kind: "validation_rule",
            targetFile: "requirement_validation.md",
            title: "Replay proposal title",
            changeSummary: "One sentence reviewer-facing change summary",
            fallbackReason: "Why this proposal is needed",
            whyCurrent: "Why current skill missed the issue",
            whyChange: "Why the change prevents recurrence",
            targetInsertionHint: "Where to insert",
            beforeContent: "Current content",
            afterContent: "Proposed skill text",
            before: "Current content",
            after: "Proposed skill text",
            rationale: "Reasoning",
            evidenceRefs: ["rej-1"],
            newRuleDraft: null
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- `modify_existing` items must use `targetSkillCode` from `layerSkillInventory` or `candidateSkillInventory` in `manifest.json`.",
    "- If no existing skill fits, output `create_new` with `action = add_skill_item` and an empty `targetSkillCode`.",
    "- `targetKind` must stay within `taskContext.allowedKindsForReplay` when that list is present.",
    "- `changeSummary` must be one concise reviewer-facing sentence that says what to add or modify.",
    "- `fallbackReason` must only describe the rejection reason; do not use it as the change summary.",
    "- `afterContent` must be reusable atomic skill text, not a one-off edit instruction for a single rejected requirement.",
    "- Produce at least one executable replay proposal item whenever replay rejection records exist."
  ].join("\n");
}

function buildCliPrompt(payload = {}) {
  switch (payload.stepType) {
    case "replay_proposal_generate":
      return buildReplayProposalPrompt(payload);
    case "document_extract_generate":
      return buildDocumentExtractPrompt(payload);
    case "slx_interpret_answer":
      return buildSlxInterpretPrompt(payload);
    case "slx_parse_generate":
      return buildSlxParsePrompt(payload);
    case "software_requirement_markdown_generate":
      return buildSoftwareRequirementMarkdownPrompt(payload);
    case "simulink_module_description_generate":
      return buildSimulinkModuleDescriptionPrompt(payload);
    case "anchor_index_build":
      return buildAnchorIndexPrompt(payload);
    case "material_extract":
      return buildMaterialExtractPrompt(payload);
    case "atom_recall":
      return buildAtomRecallPrompt(payload);
    case "module_bootstrap_analyze":
      return buildModuleBootstrapAnalyzePrompt(payload);
    case "module_bootstrap_generate":
      return buildModuleBootstrapGeneratePrompt(payload);
    case "outline_build":
      return buildOutlinePrompt(payload);
    case "content_generate":
      return buildContentGeneratePrompt(payload);
    default:
      throw Object.assign(new Error(`Unsupported Hermes CLI step: ${payload.stepType || ""}`), {
        code: "hermes_step_unsupported"
      });
  }
}

function normalizeStepTimeoutMap(stepTimeoutMs = {}) {
  return Object.fromEntries(
    Object.entries(stepTimeoutMs || {})
      .map(([stepType, timeoutMs]) => [
        String(stepType || "").trim(),
        Math.max(1000, Number(timeoutMs || 0) || 0)
      ])
      .filter(([stepType, timeoutMs]) => stepType && timeoutMs > 0)
  );
}

function normalizeStepMaxTurnsMap(stepMaxTurns = {}) {
  return Object.fromEntries(
    Object.entries(stepMaxTurns || {})
      .map(([stepType, maxTurns]) => [
        String(stepType || "").trim(),
        Number(maxTurns || 0) || 0
      ])
      .filter(([stepType]) => stepType)
  );
}

function normalizeCliArtifact(stepType, parsed = {}, payload = {}) {
  if (stepType === "replay_proposal_generate") {
    return normalizeReplayProposalArtifact(parsed, payload);
  }
  if (stepType === "anchor_index_build") {
    return { anchors: Array.isArray(parsed.anchors) ? parsed.anchors.map(sanitizeAnchorItem) : [] };
  }
  if (stepType === "material_extract") {
    return { extractions: Array.isArray(parsed.extractions) ? parsed.extractions : [] };
  }
  if (stepType === "atom_recall") {
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  }
  if (stepType === "module_bootstrap_analyze") {
    return sanitizeModuleBootstrapAnalysis(parsed);
  }
  if (stepType === "module_bootstrap_generate") {
  return parsed && typeof parsed === "object" ? parsed : {};
}

  if (stepType === "document_extract_generate") {
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  if (stepType === "slx_parse_generate") {
    const artifact = parsed && typeof parsed === "object" ? parsed : {};
    const mrv = artifact.modelRequirementView && typeof artifact.modelRequirementView === "object"
      ? artifact.modelRequirementView
      : {};
    return {
      modelRequirementView: mrv,
      summary: String(artifact.summary || "").trim()
    };
  }
  if (stepType === "slx_interpret_answer") {
    const artifact = parsed && typeof parsed === "object" ? parsed : {};
    return {
      answerMarkdown: String(artifact.answerMarkdown || artifact.answer || artifact.content || "").trim(),
      summary: String(artifact.summary || "").trim(),
      evidence: Array.isArray(artifact.evidence)
        ? artifact.evidence.map(sanitizeEvidenceItem).filter((item) => item.fileName || item.location || item.excerpt)
        : [],
      warnings: Array.isArray(artifact.warnings)
        ? artifact.warnings.map((item) => clipText(item || "", 300)).filter(Boolean).slice(0, 20)
        : []
    };
  }
  if (stepType === "software_requirement_markdown_generate") {
    const artifact = parsed && typeof parsed === "object" ? parsed : {};
    return {
      markdownPath: String(artifact.markdownPath || "outputs/software-requirements.md").trim(),
      itemCount: Math.max(0, Number(artifact.itemCount || 0) || 0),
      summary: String(artifact.summary || "").trim()
    };
  }
  if (stepType === "simulink_module_description_generate") {
    const artifact = parsed && typeof parsed === "object" ? parsed : {};
    const outputFiles = Array.isArray(artifact.outputFiles)
      ? artifact.outputFiles
          .map((item) => {
            if (typeof item === "string") {
              const relativePath = item.trim();
              if (!relativePath.toLowerCase().endsWith(".docx")) {
                return null;
              }
              return {
                relativePath,
                kind: "software_module_description_docx",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                description: "Generated software module description DOCX"
              };
            }
            if (!item || typeof item !== "object") {
              return null;
            }
            const relativePath = String(item.relativePath || item.path || item.filePath || "").trim();
            const absolutePath = String(item.absolutePath || "").trim();
            const fileName = String(item.fileName || "").trim();
            const candidatePath = relativePath || absolutePath || fileName;
            if (!candidatePath.toLowerCase().endsWith(".docx")) {
              return null;
            }
            return {
              relativePath,
              absolutePath,
              fileName,
              kind: String(item.kind || "software_module_description_docx").trim(),
              mimeType: String(
                item.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              ).trim(),
              description: String(item.description || "").trim(),
              ...(
                Object.prototype.hasOwnProperty.call(item, "contentBase64") ||
                Object.prototype.hasOwnProperty.call(item, "base64")
                  ? {
                      contentBase64: String(
                        item.contentBase64 ?? item.base64 ?? ""
                      ).trim()
                    }
                  : {}
              ),
              encoding: String(item.encoding || "").trim(),
              size: Number(item.size || 0) || 0,
              sha256: String(item.sha256 || "").trim().toLowerCase()
            };
          })
          .filter((item) => item && (item.relativePath || item.absolutePath))
      : [];
    return {
      status: String(artifact.status || "completed").trim(),
      summary: String(artifact.summary || "").trim(),
      outputFiles,
      warnings: Array.isArray(artifact.warnings)
        ? artifact.warnings.map((item) => clipText(item || "", 300)).filter(Boolean).slice(0, 20)
        : [],
      errorMessage: String(artifact.errorMessage || artifact.error || "").trim()
    };
  }
  if (stepType === "outline_build") {
    return {
      summary: String(parsed.summary || "").trim(),
      sections: Array.isArray(parsed.sections) ? parsed.sections : []
    };
  }
  if (stepType === "content_generate") {
    return { items: Array.isArray(parsed.items) ? parsed.items.map(sanitizeContentItem) : [] };
  }
  return parsed;
}

async function buildMarkdownArtifactFromWorkspace(payload = {}, workdir = "") {
  if (payload.stepType === "simulink_module_description_generate") {
    const inputArtifact = payload.inputArtifact || {};
    const outputDir = inputArtifact.outputDir || path.join(workdir || inputArtifact.workspaceDir || process.cwd(), "outputs");
    const absoluteOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.join(workdir || inputArtifact.workspaceDir || process.cwd(), ...String(outputDir).split("/").filter(Boolean));
    const entries = await fs.readdir(absoluteOutputDir, { withFileTypes: true }).catch(() => []);
    const outputFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".docx"))
      .map((entry) => {
        const absolutePath = path.join(absoluteOutputDir, entry.name);
        const relativePath = path
          .relative(workdir || inputArtifact.workspaceDir || process.cwd(), absolutePath)
          .replace(/\\/g, "/");
        return {
          relativePath,
          kind: "software_module_description_docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          description: "Generated software module description DOCX"
        };
      });
    if (!outputFiles.length) {
      return null;
    }
    return {
      status: "completed",
      summary: "Hermes wrote software module description DOCX artifacts but did not return strict JSON.",
      outputFiles,
      warnings: ["Hermes CLI 未返回严格 JSON，后端从 outputs 目录回收了 DOCX 产物。"]
    };
  }
  if (payload.stepType !== "software_requirement_markdown_generate") {
    return null;
  }
  const inputArtifact = payload.inputArtifact || {};
  const markdownPath = String(
    inputArtifact.outputRelativePath ||
      inputArtifact.markdownPath ||
      inputArtifact.outputPath ||
      "outputs/software-requirements.md"
  ).trim();
  const absoluteMarkdownPath = path.isAbsolute(markdownPath)
    ? markdownPath
    : path.join(workdir || inputArtifact.workspaceDir || process.cwd(), ...markdownPath.split("/").filter(Boolean));
  try {
    const stat = await fs.stat(absoluteMarkdownPath);
    if (!stat.isFile()) {
      return null;
    }
  } catch (_error) {
    return null;
  }

  let itemCount = 0;
  try {
    const markdown = await fs.readFile(absoluteMarkdownPath, "utf8");
    itemCount = (markdown.match(/<!--\s*requirement-item:start\b/gi) || []).length;
  } catch (_error) {
    itemCount = 0;
  }

  return {
    markdownPath,
    itemCount,
    summary: "Hermes wrote the Markdown artifact but did not return strict JSON."
  };
}

async function defaultCommandRunner(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: options.env
  });
}

async function postJsonWithTimeout(url, payload, timeoutMs, headers = {}, options = {}) {
  const body = JSON.stringify(payload);
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers
        }
      },
      (response) => {
        response.setEncoding("utf8");
        let text = "";
        let responseBytes = 0;
        let rejected = false;
        response.on("data", (chunk) => {
          responseBytes += Buffer.byteLength(chunk);
          if (options.maxResponseBytes && responseBytes > options.maxResponseBytes) {
            rejected = true;
            response.destroy();
            reject(Object.assign(new Error("Hermes response exceeded the allowed size."), {
              code: "tcsd_worker_response_too_large"
            }));
            return;
          }
          text += chunk;
        });
        response.on("end", () => {
          if (rejected) return;
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            text,
            correlationId: String(response.headers["x-sdg-correlation-id"] || "")
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`Hermes request timed out after ${timeoutMs}ms`);
      error.name = "AbortError";
      request.destroy(error);
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function escapeMultipartHeaderValue(value = "") {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

async function postMultipartWithTimeout(url, fields = {}, files = [], headers = {}, timeoutMs, options = {}) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const boundary = `----software-doc-hermes-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const chunks = [];

  for (const [name, value] of Object.entries(fields || {})) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${escapeMultipartHeaderValue(name)}"\r\n` +
      "Content-Type: application/json; charset=utf-8\r\n\r\n" +
      `${String(value ?? "")}\r\n`,
      "utf8"
    ));
  }

  for (const file of files || []) {
    const fileBuffer = await fs.readFile(file.sourcePath);
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${escapeMultipartHeaderValue(file.fieldName)}"; filename="${escapeMultipartHeaderValue(path.basename(file.sourcePath))}"\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n",
      "utf8"
    ));
    chunks.push(fileBuffer);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  const body = Buffer.concat(chunks);

  return new Promise((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length
        }
      },
      (response) => {
        response.setEncoding("utf8");
        let text = "";
        let responseBytes = 0;
        let rejected = false;
        response.on("data", (chunk) => {
          responseBytes += Buffer.byteLength(chunk);
          if (options.maxResponseBytes && responseBytes > options.maxResponseBytes) {
            rejected = true;
            response.destroy();
            reject(Object.assign(new Error("Hermes response exceeded the allowed size."), {
              code: "tcsd_worker_response_too_large"
            }));
            return;
          }
          text += chunk;
        });
        response.on("end", () => {
          if (rejected) return;
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            text,
            correlationId: String(response.headers["x-sdg-correlation-id"] || ""),
            async json() {
              return text ? JSON.parse(text) : {};
            }
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`Hermes request timed out after ${timeoutMs}ms`);
      error.name = "AbortError";
      request.destroy(error);
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function requestTextWithTimeout(
  url,
  {
    method = "GET",
    headers = {},
    timeoutMs = 30000,
    timeoutMessage = "Hermes request timed out",
    timeoutCode = "hermes_timeout"
  } = {}
) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method,
        timeout: timeoutMs,
        headers
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            text
          });
        });
      }
    );
    request.on("timeout", () => {
      request.destroy(
        Object.assign(new Error(timeoutMessage), {
          code: timeoutCode
        })
      );
    });
    request.on("error", reject);
    request.end();
  });
}

function isConnectionError(error) {
  return ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"].includes(String(error?.code || ""));
}

const TRANSFERRED_OUTPUT_EXTENSIONS = {
  simulink_module_description_generate: ".docx"
};

function normalizeTransferredOutputPath(value = "", expectedExtension = ".xlsx") {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    return "";
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    return "";
  }
  if (parts.length !== 2 || parts[0] !== "outputs" || !parts[1].toLowerCase().endsWith(expectedExtension)) {
    return "";
  }
  return parts.join("/");
}

function softwareDetailTransferError(message = "", code = "", details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function parseSoftwareDetailResponse(
  response = {},
  {
    failureMessage = "Software detail Worker 请求失败。",
    failureCode = "software_detail_request_failed"
  } = {}
) {
  let body = null;
  try {
    body = JSON.parse(String(response.text || ""));
  } catch (_error) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了无法解析的 JSON。",
      "software_detail_invalid_response"
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了非法 JSON 对象。",
      "software_detail_invalid_response"
    );
  }
  if (!response.ok) {
    const workerCode = String(body.code || "").trim();
    throw softwareDetailTransferError(
      body.error || failureMessage,
      workerCode.startsWith("software_detail_") ? workerCode : failureCode,
      body.details || (workerCode ? { workerCode } : null)
    );
  }
  return body;
}

function wrapSoftwareDetailNetworkError(cause, operation = "请求") {
  if (String(cause?.code || "").startsWith("software_detail_")) {
    return cause;
  }
  if (cause?.name === "AbortError") {
    return softwareDetailTransferError(
      `Software detail Worker ${operation}超时。`,
      "software_detail_request_timeout"
    );
  }
  const error = softwareDetailTransferError(
    `Software detail Worker 不可用：${cause?.message || "连接失败"}`,
    "software_detail_worker_unavailable"
  );
  error.cause = cause;
  return error;
}

function decodeSoftwareDetailArtifact(item = {}) {
  if (!Object.prototype.hasOwnProperty.call(item, "contentBase64")) {
    throw softwareDetailTransferError(
      "Software detail Worker 仅返回了 DOCX 元数据，缺少传输内容。",
      "software_detail_artifact_payload_missing"
    );
  }
  if (typeof item.contentBase64 !== "string") {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX base64 类型非法。",
      "software_detail_artifact_base64_invalid"
    );
  }
  if (item.contentBase64.length === 0) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了空 DOCX。",
      "software_detail_artifact_empty"
    );
  }
  if (String(item.encoding || "") !== "base64") {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX encoding 必须为 base64。",
      "software_detail_artifact_encoding_invalid"
    );
  }

  const declaredSize = item.size;
  if (
    typeof declaredSize !== "number" ||
    !Number.isSafeInteger(declaredSize) ||
    declaredSize <= 0
  ) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX size 非法。",
      "software_detail_artifact_size_invalid"
    );
  }
  if (declaredSize > MAX_TRANSFERRED_SOFTWARE_DETAIL_OUTPUT_BYTES) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX 超过传输上限。",
      "software_detail_artifact_too_large"
    );
  }

  const encoded = item.contentBase64;
  if (
    encoded.length > Math.ceil(MAX_TRANSFERRED_SOFTWARE_DETAIL_OUTPUT_BYTES * 4 / 3) + 8
  ) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX 超过传输上限。",
      "software_detail_artifact_too_large"
    );
  }
  if (encoded.length % 4 !== 0 || !STRICT_BASE64_PATTERN.test(encoded)) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了损坏的 DOCX base64。",
      "software_detail_artifact_base64_invalid"
    );
  }

  const content = Buffer.from(encoded, "base64");
  if (content.toString("base64") !== encoded) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了非规范 DOCX base64。",
      "software_detail_artifact_base64_invalid"
    );
  }
  if (!content.length) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了空 DOCX。",
      "software_detail_artifact_empty"
    );
  }
  if (content.length > MAX_TRANSFERRED_SOFTWARE_DETAIL_OUTPUT_BYTES) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX 超过传输上限。",
      "software_detail_artifact_too_large"
    );
  }
  if (content.length !== declaredSize) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX size 与实际内容不一致。",
      "software_detail_artifact_size_mismatch",
      { declaredSize, actualSize: content.length }
    );
  }

  if (typeof item.sha256 !== "string" || !item.sha256.trim()) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX 缺少 SHA-256。",
      "software_detail_artifact_hash_missing"
    );
  }
  const declaredSha256 = item.sha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(declaredSha256)) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX SHA-256 非法。",
      "software_detail_artifact_hash_invalid"
    );
  }
  const actualSha256 = createHash("sha256").update(content).digest("hex");
  if (actualSha256 !== declaredSha256) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX SHA-256 校验失败。",
      "software_detail_artifact_hash_mismatch",
      { declaredSha256, actualSha256 }
    );
  }

  return {
    content,
    size: declaredSize,
    sha256: declaredSha256
  };
}

function validateSoftwareDetailDocxArtifact(item = {}, workspaceDir = "") {
  const workspaceValue = String(workspaceDir || "").trim();
  if (!workspaceValue) {
    throw softwareDetailTransferError(
      "Platform 缺少软件详设 DOCX 的本地 workspace。",
      "software_detail_artifact_workspace_missing"
    );
  }
  const localWorkspace = path.resolve(workspaceValue);
  const relativePath = normalizeTransferredOutputPath(
    item.relativePath || item.path || item.filePath,
    ".docx"
  );
  if (!relativePath) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了非法 DOCX 路径。",
      "software_detail_artifact_path_forbidden"
    );
  }
  const absolutePath = path.resolve(localWorkspace, ...relativePath.split("/"));
  if (!absolutePath.startsWith(`${localWorkspace}${path.sep}`)) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了越界 DOCX 路径。",
      "software_detail_artifact_path_forbidden"
    );
  }

  const decoded = decodeSoftwareDetailArtifact(item);
  const {
    contentBase64: _contentBase64,
    base64: _base64,
    ...metadata
  } = item;
  return {
    localWorkspace,
    absolutePath,
    content: decoded.content,
    metadata: {
      ...metadata,
      relativePath,
      encoding: "base64",
      size: decoded.size,
      sha256: decoded.sha256
    }
  };
}

async function validateSoftwareDetailDocxDestination(prepared = {}) {
  await fs.mkdir(path.dirname(prepared.absolutePath), { recursive: true });
  const [realWorkspace, realParent] = await Promise.all([
    fs.realpath(prepared.localWorkspace),
    fs.realpath(path.dirname(prepared.absolutePath))
  ]);
  if (
    realParent !== realWorkspace &&
    !realParent.startsWith(`${realWorkspace}${path.sep}`)
  ) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 DOCX 路径逃逸本地 workspace。",
      "software_detail_artifact_path_forbidden"
    );
  }
  return prepared;
}

async function writeSoftwareDetailDocx(prepared = {}) {
  const temporaryPath =
    `${prepared.absolutePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, prepared.content, { flag: "wx" });
    await fs.rename(temporaryPath, prepared.absolutePath);
  } catch (cause) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    const error = softwareDetailTransferError(
      "Platform 写入软件详设 DOCX 失败。",
      "software_detail_artifact_write_failed"
    );
    error.cause = cause;
    throw error;
  }
  return prepared.metadata;
}

async function materializeSoftwareDetailDocx(item = {}, workspaceDir = "") {
  const prepared = await validateSoftwareDetailDocxDestination(
    validateSoftwareDetailDocxArtifact(item, workspaceDir)
  );
  return writeSoftwareDetailDocx(prepared);
}

async function materializeTransferredOutputFiles(artifact = {}, payload = {}) {
  const expectedExtension = TRANSFERRED_OUTPUT_EXTENSIONS[payload.stepType];
  if (!expectedExtension) {
    return;
  }

  for (const item of Array.isArray(artifact.outputFiles) ? artifact.outputFiles : []) {
    if (!item || typeof item !== "object") {
      throw softwareDetailTransferError(
        "Software detail Worker 返回的 DOCX 传输项非法。",
        "software_detail_artifact_metadata_invalid"
      );
    }
    await materializeSoftwareDetailDocx(
      item,
      payload.inputArtifact?.localPlatformWorkspaceDir ||
        payload.inputArtifact?.workspaceDir ||
        ""
    );
  }
}

async function materializeSoftwareDetailPipelineArtifacts(job = {}, workspaceDir = "") {
  if (!job || typeof job !== "object" || Array.isArray(job)) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了非法 job。",
      "software_detail_invalid_response"
    );
  }
  if (job.schema !== SOFTWARE_DETAIL_JOB_SCHEMA) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了不支持的 job schema。",
      "software_detail_schema_unsupported",
      { schema: String(job.schema || "") }
    );
  }
  if (!SOFTWARE_DETAIL_JOB_STATUSES.has(String(job.status || ""))) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了未知 job status。",
      "software_detail_invalid_response"
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(job, "artifacts") &&
    !Array.isArray(job.artifacts)
  ) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回的 artifacts 必须为数组。",
      "software_detail_artifact_metadata_invalid"
    );
  }
  const rawArtifacts = Array.isArray(job.artifacts) ? job.artifacts : [];
  for (const item of rawArtifacts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw softwareDetailTransferError(
        "Software detail Worker 返回了非法 artifact 元数据。",
        "software_detail_artifact_metadata_invalid"
      );
    }
  }

  const docxItems = rawArtifacts.filter(
    (item) => String(item.role || "") === SOFTWARE_DETAIL_DOCX_ROLE
  );
  if (docxItems.length > 1) {
    throw softwareDetailTransferError(
      "Software detail Worker 返回了重复的最终 DOCX。",
      "software_detail_artifact_duplicate"
    );
  }
  if (job.status === "completed" && docxItems.length !== 1) {
    throw softwareDetailTransferError(
      "Software detail Worker 已完成，但未返回最终 DOCX。",
      "software_detail_artifact_missing"
    );
  }

  const artifactPlans = rawArtifacts.map((item) => {
    const {
      contentBase64: _contentBase64,
      base64: _base64,
      ...metadata
    } = item;
    if (String(item.role || "") !== SOFTWARE_DETAIL_DOCX_ROLE) {
      return { kind: "metadata", metadata };
    }
    return { kind: "docx", item };
  });

  const docxPlan = artifactPlans.find((plan) => plan.kind === "docx") || null;
  if (docxPlan) {
    docxPlan.prepared = validateSoftwareDetailDocxArtifact(
      docxPlan.item,
      workspaceDir
    );
  }
  if (job.status === "completed" && docxPlan) {
    docxPlan.metadata = await writeSoftwareDetailDocx(
      await validateSoftwareDetailDocxDestination(docxPlan.prepared)
    );
  } else if (docxPlan) {
    docxPlan.metadata = docxPlan.prepared.metadata;
  }

  return {
    ...job,
    artifacts: artifactPlans.map((plan) => plan.metadata)
  };
}

async function materializeTcsdPipelineArtifacts(job = {}, workspaceDir = "") {
  const localWorkspace = path.resolve(String(workspaceDir || ""));
  if (!localWorkspace) return job;
  const artifacts = [];
  for (const item of Array.isArray(job?.artifacts) ? job.artifacts : []) {
    if (!item || typeof item !== "object") {
      artifacts.push(item);
      continue;
    }
    const { contentBase64, encoding, ...metadata } = item;
    const relativePath = normalizeTransferredOutputPath(
      item.relativePath || item.path || item.filePath,
      ".xlsx"
    );
    if (!relativePath || encoding !== "base64" || !contentBase64) {
      artifacts.push(metadata);
      continue;
    }
    if (String(contentBase64).length > Math.ceil(MAX_TRANSFERRED_TCSD_OUTPUT_BYTES * 4 / 3) + 8) {
      throw Object.assign(new Error("TCSD Worker 返回的 workbook 超过传输上限。"), {
        code: "tcsd_artifact_too_large"
      });
    }
    const content = Buffer.from(String(contentBase64), "base64");
    if (content.length > MAX_TRANSFERRED_TCSD_OUTPUT_BYTES) {
      throw Object.assign(new Error("TCSD Worker 返回的 workbook 超过传输上限。"), {
        code: "tcsd_artifact_too_large"
      });
    }
    const absolutePath = path.resolve(localWorkspace, ...relativePath.split("/"));
    if (!absolutePath.startsWith(`${localWorkspace}${path.sep}`)) {
      throw Object.assign(new Error("TCSD Worker 返回了非法 workbook 路径。"), {
        code: "tcsd_artifact_path_forbidden"
      });
    }
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, content);
    await fs.rename(temporaryPath, absolutePath);
    artifacts.push({ ...metadata, relativePath });
  }
  return { ...job, artifacts };
}

function buildProfiledCliArgs(profile = "", args = []) {
  const profileName = String(profile || "").trim();
  if (!profileName || profileName === "default") {
    return args;
  }
  return ["-p", profileName, ...args];
}

function normalizeCommandArgsPrefix(value = []) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

export class HermesAgentClient {
  constructor(options = {}) {
    this.transport = String(options.transport || config.hermes.transport || "cli").trim().toLowerCase();
    this.baseURL = trimTrailingSlash(options.baseURL || config.hermes.baseURL);
    this.slxInterpreterTransport = String(
      options.slxInterpreterTransport || config.hermes.slxInterpreterTransport || ""
    ).trim().toLowerCase();
    const openAiApiOptions = options.openAiApi || {};
    this.openAiApi = {
      baseURL: trimTrailingSlash(openAiApiOptions.baseURL || config.hermes.openAiApi?.baseURL || ""),
      apiKey: String(openAiApiOptions.apiKey ?? config.hermes.openAiApi?.apiKey ?? "").trim(),
      model: String(openAiApiOptions.model || config.hermes.openAiApi?.model || "").trim(),
      pollIntervalMs: Math.max(
        250,
        Number(openAiApiOptions.pollIntervalMs ?? config.hermes.openAiApi?.pollIntervalMs ?? 5000) || 5000
      ),
      requestTimeoutMs: Math.max(
        1000,
        Number(openAiApiOptions.requestTimeoutMs ?? config.hermes.openAiApi?.requestTimeoutMs ?? 30000) || 30000
      ),
      autoApprove: openAiApiOptions.autoApprove ?? config.hermes.openAiApi?.autoApprove ?? true,
      approvalChoice: String(openAiApiOptions.approvalChoice || config.hermes.openAiApi?.approvalChoice || "session").trim() || "session"
    };
    this.apiMode = String(options.apiMode || config.hermes.apiMode || "json").trim().toLowerCase();
    this.authToken = String(options.authToken || config.hermes.authToken || "").trim();
    this.maxControlResponseBytes = Math.max(
      64 * 1024,
      Number(
        options.maxControlResponseBytes ||
        process.env.HERMES_TCSD_MAX_CONTROL_RESPONSE_BYTES ||
        MAX_TCSD_CONTROL_RESPONSE_BYTES_DEFAULT
      ) || MAX_TCSD_CONTROL_RESPONSE_BYTES_DEFAULT
    );
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs || config.hermes.timeoutMs) || config.hermes.timeoutMs);
    this.stepTimeoutMs = normalizeStepTimeoutMap(options.stepTimeoutMs || config.hermes.stepTimeoutMs || {});
    this.command = String(options.command || config.hermes.command || "hermes").trim() || "hermes";
    this.commandArgsPrefix = normalizeCommandArgsPrefix(options.commandArgsPrefix || config.hermes.commandArgsPrefix || []);
    this.profile = String(options.profile || config.hermes.profile || "").trim();
    this.maxTurns = Math.max(1, Number(options.maxTurns || config.hermes.maxTurns) || config.hermes.maxTurns || 40);
    this.stepMaxTurns = normalizeStepMaxTurnsMap(options.stepMaxTurns || config.hermes.stepMaxTurns || {});
    this.heartbeatIntervalMs = Math.max(
      10,
      Number(options.heartbeatIntervalMs || config.hermes.heartbeatIntervalMs) || config.hermes.heartbeatIntervalMs || 5000
    );
    this.workdir = String(options.workdir || config.hermes.workdir || config.rootDir || process.cwd());
    this.stateDbPath = String(options.stateDbPath || config.hermes.stateDbPath || "").trim();
    this.commandRunner = typeof options.commandRunner === "function" ? options.commandRunner : defaultCommandRunner;
    this.usageReader = typeof options.usageReader === "function" ? options.usageReader : defaultUsageReader;
  }

  getTimeoutMsForStep(stepType = "") {
    return this.stepTimeoutMs[String(stepType || "").trim()] || this.timeoutMs;
  }

  getTransportForStep(stepType = "") {
    if (String(stepType || "").trim() === "slx_interpret_answer" && this.slxInterpreterTransport) {
      return this.slxInterpreterTransport;
    }
    return this.transport;
  }

  getMaxTurnsForStep(stepType = "") {
    const normalizedStepType = String(stepType || "").trim();
    if (Object.prototype.hasOwnProperty.call(this.stepMaxTurns, normalizedStepType)) {
      return this.stepMaxTurns[normalizedStepType];
    }
    return this.maxTurns;
  }

  buildOpenAiApiUrl(pathname = "") {
    const baseURL = this.openAiApi.baseURL;
    const normalizedPath = String(pathname || "").startsWith("/") ? String(pathname || "") : `/${pathname}`;
    if (baseURL.toLowerCase().endsWith("/v1") && normalizedPath.startsWith("/v1/")) {
      return `${baseURL}${normalizedPath.slice(3)}`;
    }
    return `${baseURL}${normalizedPath}`;
  }

  async fetchOpenAiApiJson(pathname, options = {}) {
    if (!this.openAiApi.baseURL) {
      const error = new Error("Hermes OpenAI-compatible API base URL is not configured");
      error.code = "hermes_openai_api_not_configured";
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.openAiApi.requestTimeoutMs);
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (this.openAiApi.apiKey) {
      headers.Authorization = `Bearer ${this.openAiApi.apiKey}`;
    }

    try {
      const response = await fetch(this.buildOpenAiApiUrl(pathname), {
        method: options.method || "GET",
        headers,
        body: Object.hasOwn(options, "body") ? JSON.stringify(options.body || {}) : undefined,
        signal: controller.signal
      });
      const raw = await response.text();
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch (_error) {
        const error = new Error("Hermes OpenAI-compatible API returned an invalid JSON response");
        error.code = "hermes_invalid_response";
        error.status = response.status;
        error.rawOutput = raw;
        throw error;
      }
      if (!response.ok) {
        const message = parsed?.error?.message || parsed?.error || parsed?.message || `Hermes OpenAI-compatible API failed with status ${response.status}`;
        const error = new Error(message);
        error.code = parsed?.error?.code || parsed?.code || "hermes_openai_api_request_failed";
        error.status = response.status;
        error.details = parsed;
        throw error;
      }
      return parsed;
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error(`Hermes OpenAI-compatible API request timed out after ${this.openAiApi.requestTimeoutMs}ms`);
        timeoutError.code = "hermes_timeout";
        throw timeoutError;
      }
      if (error instanceof TypeError) {
        const connectionError = new Error(`Hermes OpenAI-compatible API is unavailable at ${this.openAiApi.baseURL}`);
        connectionError.code = "hermes_unavailable";
        throw connectionError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  buildOpenAiRunRequest(payload = {}) {
    const input = buildCliPrompt(payload);
    const request = {
      input,
      instructions: [
        "You are running inside the Hermes built-in OpenAI-compatible API Server.",
        "Tools execute on the API-server host.",
        "For SLX interpreter tasks, use the server-side terminal/file tools and matlab_satk MCP tools.",
        "Do not call the project-specific /internal/steps/execute interface.",
        "Return strict JSON only, matching the requested schema."
      ].join("\n"),
      session_id: payload.taskId || undefined
    };
    if (this.openAiApi.model) {
      request.model = this.openAiApi.model;
    }
    return request;
  }

  async executeOpenAiRunStep(payload = {}, runtime = {}) {
    if (payload.stepType !== "slx_interpret_answer") {
      const error = new Error(`Hermes OpenAI-compatible API transport only supports slx_interpret_answer, not ${payload.stepType || "(empty)"}`);
      error.code = "hermes_openai_api_step_unsupported";
      throw error;
    }

    const timeoutMs = this.getTimeoutMsForStep(payload.stepType);
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let runId = "";

    await emitHermesEvent(runtime.onEvent, {
      type: "agent_runtime",
      transport: "openai-api",
      stepType: payload.stepType || "",
      status: "started",
      label: "Hermes OpenAI API run started",
      message: "Submitting SLX interpreter task to Hermes /v1/runs.",
      startedAt: new Date(startedAt).toISOString(),
      elapsedMs: 0
    });

    try {
      const startResponse = await this.fetchOpenAiApiJson("/v1/runs", {
        method: "POST",
        body: this.buildOpenAiRunRequest(payload)
      });
      runId = String(startResponse.run_id || startResponse.id || "").trim();
      if (!runId) {
        const error = new Error("Hermes OpenAI-compatible API did not return a run_id");
        error.code = "hermes_openai_api_missing_run_id";
        throw error;
      }

      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "openai-api",
        stepType: payload.stepType || "",
        status: "running",
        label: "Hermes OpenAI API run accepted",
        message: `Hermes run ${runId} has started.`,
        sessionId: runId,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt
      });

      let lastStatus = "";
      let lastEvent = "";
      while (Date.now() < deadline) {
        const runStatus = await this.fetchOpenAiApiJson(`/v1/runs/${encodeURIComponent(runId)}`);
        const status = String(runStatus.status || "").trim();
        const eventName = String(runStatus.last_event || "").trim();
        const elapsedMs = Date.now() - startedAt;

        if (status !== lastStatus || eventName !== lastEvent) {
          lastStatus = status;
          lastEvent = eventName;
          await emitHermesEvent(runtime.onEvent, {
            type: "agent_runtime",
            transport: "openai-api",
            stepType: payload.stepType || "",
            status: status || "running",
            label: "Hermes OpenAI API run status",
            message: eventName ? `Hermes run ${runId}: ${status || "running"} (${eventName}).` : `Hermes run ${runId}: ${status || "running"}.`,
            sessionId: runId,
            startedAt: new Date(startedAt).toISOString(),
            heartbeatAt: new Date().toISOString(),
            elapsedMs
          });
        }

        if (status === "waiting_for_approval") {
          if (!this.openAiApi.autoApprove) {
            await delay(Math.min(this.openAiApi.pollIntervalMs, Math.max(250, deadline - Date.now())));
            continue;
          }
          await this.fetchOpenAiApiJson(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
            method: "POST",
            body: {
              choice: this.openAiApi.approvalChoice,
              resolve_all: true
            }
          });
          await emitHermesEvent(runtime.onEvent, {
            type: "agent_runtime",
            transport: "openai-api",
            stepType: payload.stepType || "",
            status: "running",
            label: "Hermes OpenAI API approval sent",
            message: `Approved pending tools for Hermes run ${runId}.`,
            sessionId: runId,
            startedAt: new Date(startedAt).toISOString(),
            elapsedMs
          });
        }

        if (status === "completed") {
          const output = String(runStatus.output || "").trim();
          let parsed = null;
          try {
            parsed = JSON.parse(extractJsonText(output));
          } catch (_error) {
            const invalidError = new Error("Hermes OpenAI-compatible API returned an invalid JSON response");
            invalidError.code = "hermes_invalid_response";
            invalidError.rawOutput = output;
            invalidError.sessionId = runId;
            throw invalidError;
          }
          const tokenUsage = normalizeOpenAiRunUsage(runStatus.usage || {});
          await emitHermesEvent(runtime.onEvent, {
            type: "agent_runtime",
            transport: "openai-api",
            stepType: payload.stepType || "",
            status: "completed",
            label: "Hermes OpenAI API run completed",
            message: tokenUsage
              ? `Hermes run ${runId} completed, ${buildUsageSummary(tokenUsage)}.`
              : `Hermes run ${runId} completed.`,
            sessionId: runId,
            startedAt: new Date(startedAt).toISOString(),
            heartbeatAt: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            tokenUsage,
            stdoutExcerpt: clipText(output, 2000)
          });
          return {
            status: "succeeded",
            stepType: payload.stepType,
            artifact: normalizeCliArtifact(payload.stepType, parsed, payload),
            metrics: {
              durationMs: Date.now() - startedAt,
              ...(tokenUsage ? { tokenUsage } : {})
            },
            logs: [],
            error: null,
            sessionId: runId
          };
        }

        if (["failed", "cancelled"].includes(status)) {
          const error = new Error(runStatus.error || `Hermes OpenAI-compatible API run ${status}`);
          error.code = status === "cancelled" ? "hermes_cancelled" : "hermes_request_failed";
          error.sessionId = runId;
          throw error;
        }

        await delay(Math.min(this.openAiApi.pollIntervalMs, Math.max(250, deadline - Date.now())));
      }

      const timeoutError = new Error(`Hermes OpenAI-compatible API run timed out after ${timeoutMs}ms`);
      timeoutError.code = "hermes_timeout";
      timeoutError.sessionId = runId;
      try {
        await this.fetchOpenAiApiJson(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
          method: "POST",
          body: {}
        });
      } catch (_stopError) {
        // The timeout error is more useful to callers than a best-effort stop failure.
      }
      throw timeoutError;
    } catch (error) {
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "openai-api",
        stepType: payload.stepType || "",
        status: "failed",
        level: "error",
        label: "Hermes OpenAI API run failed",
        message: error?.message || "Hermes OpenAI-compatible API run failed.",
        sessionId: runId,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        stdoutExcerpt: clipText(error?.rawOutput || "", 2000)
      });
      throw error;
    }
  }

  _authHeaders() {
    return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
  }

  async _parseApiResponse(response, payload = {}) {
    let body = null;
    try {
      body = await response.json();
    } catch (_error) {
      const error = new Error("Hermes returned an invalid JSON response");
      error.code = "hermes_invalid_response";
      throw error;
    }

    if (!response.ok) {
      const error = new Error(body?.error || "Hermes step execution failed");
      error.code = body?.code || "hermes_request_failed";
      error.details = body?.details || null;
      throw error;
    }

    if (body?.artifact && typeof body.artifact === "object") {
      body.artifact = normalizeCliArtifact(payload.stepType, body.artifact, payload);
    }

    return body;
  }

  async executeApiStep(payload = {}, runtime = {}) {
    if (isMultipartApiMode(this.apiMode)) {
      return this.executeApiUploadStep(payload, runtime);
    }

    const timeoutMs = this.getTimeoutMsForStep(payload.stepType);
    await emitHermesEvent(runtime.onEvent, {
      type: "agent_runtime",
      transport: "api",
      stepType: payload.stepType || "",
      status: "started",
      label: "已开始调用 Hermes API",
      message: `正在请求 Hermes API 执行 ${payload.stepType || "step"}。`,
      elapsedMs: 0
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/internal/steps/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this._authHeaders()
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const body = await this._parseApiResponse(response, payload);

      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "api",
        stepType: payload.stepType || "",
        status: "completed",
        label: "Hermes API 已返回",
        message: `Hermes API 已完成 ${payload.stepType || "step"}。`
      });
      return body;
    } catch (error) {
      if (error?.code === "hermes_invalid_response") {
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 返回非法 JSON",
          message: "Hermes API 返回了无法解析的 JSON 响应。"
        });
        throw error;
      }
      if (error?.name === "AbortError") {
        const timeoutError = new Error(`Hermes request timed out after ${timeoutMs}ms`);
        timeoutError.code = "hermes_timeout";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 请求超时",
          message: timeoutError.message
        });
        throw timeoutError;
      }
      if (error instanceof TypeError) {
        const connectionError = new Error(`Hermes is unavailable at ${this.baseURL}`);
        connectionError.code = "hermes_unavailable";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 不可用",
          message: connectionError.message
        });
        throw connectionError;
      }
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "api",
        stepType: payload.stepType || "",
        status: "failed",
        level: "error",
        label: "Hermes API 请求失败",
        message: error?.message || "Hermes API 请求失败"
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeApiUploadStep(payload = {}, runtime = {}) {
    const timeoutMs = this.getTimeoutMsForStep(payload.stepType);
    const uploadManifest = await collectUploadFilesForAllowedPaths(payload.allowedPaths || []);
    await emitHermesEvent(runtime.onEvent, {
      type: "agent_runtime",
      transport: "api",
      stepType: payload.stepType || "",
      status: "started",
      label: "已开始调用 Hermes API",
      message: uploadManifest.files.length
        ? `正在上传 ${uploadManifest.files.length} 个本地文件并请求 Hermes API 执行 ${payload.stepType || "step"}。`
        : `正在请求 Hermes API 执行 ${payload.stepType || "step"}。`,
      elapsedMs: 0
    });

    try {
      const response = await postMultipartWithTimeout(
        `${this.baseURL}/internal/steps/execute-upload`,
        {
          payload: JSON.stringify(payload),
          uploadManifest: JSON.stringify(uploadManifest)
        },
        uploadManifest.files,
        this._authHeaders(),
        timeoutMs
      );
      const body = await this._parseApiResponse(response, payload);
      await materializeTransferredOutputFiles(body.artifact, payload);

      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "api",
        stepType: payload.stepType || "",
        status: "completed",
        label: "Hermes API 已返回",
        message: `Hermes API 已完成 ${payload.stepType || "step"}。`
      });
      return body;
    } catch (error) {
      if (error?.code === "hermes_invalid_response") {
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 返回非法 JSON",
          message: "Hermes API 返回了无法解析的 JSON 响应。"
        });
        throw error;
      }
      if (error?.name === "AbortError") {
        const timeoutError = new Error(`Hermes request timed out after ${timeoutMs}ms`);
        timeoutError.code = "hermes_timeout";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 请求超时",
          message: timeoutError.message
        });
        throw timeoutError;
      }
      if (error instanceof TypeError || isConnectionError(error)) {
        const connectionError = new Error(`Hermes is unavailable at ${this.baseURL}`);
        connectionError.code = "hermes_unavailable";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 不可用",
          message: connectionError.message
        });
        throw connectionError;
      }
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "api",
        stepType: payload.stepType || "",
        status: "failed",
        level: "error",
        label: "Hermes API 请求失败",
        message: error?.message || "Hermes API 请求失败"
      });
      throw error;
    }
  }

  async executeCliStep(payload = {}, runtime = {}) {
    const prompt = buildCliPrompt(payload);
    const maxTurns = this.getMaxTurnsForStep(payload.stepType);
    const rawArgs = [
      "chat",
      "-q",
      prompt,
      "-Q",
      "--source",
      "tool"
    ];
    if (maxTurns > 0) {
      rawArgs.push("--max-turns", String(maxTurns));
    }
    rawArgs.push("--yolo");
    const args = [...this.commandArgsPrefix, ...buildProfiledCliArgs(this.profile, rawArgs)];
    const startedAt = Date.now();
    const timeoutMs = this.getTimeoutMsForStep(payload.stepType);
    const workdir = String(payload.workdir || payload.inputArtifact?.workspaceDir || this.workdir || process.cwd());
    let heartbeatTimer = null;

    try {
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "cli",
        stepType: payload.stepType || "",
        status: "started",
        command: this.command,
        profile: this.profile || "default",
        label: "已启动本机 Hermes CLI",
        message: this.profile
          ? `正在调用本机 Hermes profile ${this.profile} 执行 ${payload.stepType || "step"}。`
          : `正在调用本机 Hermes 执行 ${payload.stepType || "step"}。`,
        startedAt: new Date(startedAt).toISOString()
      });
      heartbeatTimer = setInterval(() => {
        void emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "heartbeat",
          label: "Hermes CLI 仍在运行",
          message: `本机 Hermes 正在执行 ${payload.stepType || "step"}，已运行 ${Math.round((Date.now() - startedAt) / 1000)} 秒。`,
          startedAt: new Date(startedAt).toISOString(),
          heartbeatAt: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt
        });
      }, this.heartbeatIntervalMs);
      const { stdout = "", stderr = "" } = await runHermesCommand(
        this.commandRunner,
        this.command,
        args,
        {
          cwd: workdir,
          timeout: timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, NO_COLOR: "1" }
        }
      );
      const stdoutResponse = parseCliResponse(stdout);
      const stderrResponse = parseCliResponse(stderr);
      const body = stdoutResponse.body;
      const sessionId = stdoutResponse.sessionId || stderrResponse.sessionId;
      const tokenUsage = sessionId
        ? await this.usageReader({
            sessionId,
            stateDbPath: this.stateDbPath,
            commandRunner: this.commandRunner,
            workdir
          })
        : null;
      let parsed = null;
      try {
        parsed = JSON.parse(extractJsonText(body));
      } catch (_error) {
        const fallbackArtifact = await buildMarkdownArtifactFromWorkspace(payload, workdir);
        if (fallbackArtifact) {
          const fallbackLabel = payload.stepType === "simulink_module_description_generate"
            ? "Hermes CLI 已写入软件详设 DOCX 产物"
            : "Hermes CLI 已写入 Markdown 产物";
          const fallbackMessage = payload.stepType === "simulink_module_description_generate"
            ? "Hermes CLI 未返回严格 JSON，但已写入软件详设 DOCX 产物，后端将继续登记结果文件。"
            : "Hermes CLI 未返回严格 JSON，但已写入 Markdown 产物，后端将继续解析产物文件。";
          await emitHermesEvent(runtime.onEvent, {
            type: "agent_runtime",
            transport: "cli",
            stepType: payload.stepType || "",
            status: "completed",
            label: fallbackLabel,
            message: fallbackMessage,
            sessionId,
            startedAt: new Date(startedAt).toISOString(),
            heartbeatAt: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            tokenUsage,
            stdoutExcerpt: clipText(body, 2000),
            stderrExcerpt: clipText(stderr, 2000)
          });
          return {
            status: "succeeded",
            stepType: payload.stepType,
            artifact: normalizeCliArtifact(payload.stepType, fallbackArtifact, payload),
            metrics: tokenUsage ? { tokenUsage } : {},
            logs: stderr ? [clipText(stderr, 4000)] : [],
            error: null,
            sessionId
          };
        }

        const invalidError = new Error("Hermes returned an invalid JSON response");
        invalidError.code = "hermes_invalid_response";
        invalidError.rawOutput = body;
        invalidError.sessionId = sessionId;
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes CLI 返回非法 JSON",
          message: "Hermes CLI 返回了无法解析的 JSON 响应。",
          sessionId,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt,
          stdoutExcerpt: clipText(body, 2000),
          stderrExcerpt: clipText(stderr, 2000)
        });
        throw invalidError;
      }

      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "cli",
        stepType: payload.stepType || "",
        status: "completed",
        label: "Hermes CLI 已返回",
        message: tokenUsage
          ? `本机 Hermes 已完成 ${payload.stepType || "step"}，${buildUsageSummary(tokenUsage)}。`
          : `本机 Hermes 已完成 ${payload.stepType || "step"}。`,
        sessionId,
        startedAt: new Date(startedAt).toISOString(),
        heartbeatAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        tokenUsage,
        stdoutExcerpt: clipText(body, 2000),
        stderrExcerpt: clipText(stderr, 2000)
      });
      return {
        status: "succeeded",
        stepType: payload.stepType,
        artifact: normalizeCliArtifact(payload.stepType, parsed, payload),
        metrics: tokenUsage ? { tokenUsage } : {},
        logs: stderr ? [clipText(stderr, 4000)] : [],
        error: null,
        sessionId
      };
    } catch (error) {
      if (error?.code === "hermes_invalid_response") {
        throw error;
      }
      if (error?.code === "ENOENT") {
        const unavailableError = new Error(`Hermes CLI is unavailable: ${this.command}`);
        unavailableError.code = "hermes_unavailable";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes CLI 不可用",
          message: unavailableError.message,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt
        });
        throw unavailableError;
      }
      if (error?.killed || error?.signal === "SIGTERM") {
        const timeoutError = new Error(`Hermes CLI request timed out after ${timeoutMs}ms`);
        timeoutError.code = "hermes_timeout";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes CLI 请求超时",
          message: timeoutError.message,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt
        });
        throw timeoutError;
      }
      const requestError = new Error(buildCliFailureMessage(error));
      requestError.code = typeof error?.code === "string" ? error.code : "hermes_request_failed";
      if (Number.isInteger(error?.code)) {
        requestError.exitCode = error.code;
      }
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "cli",
        stepType: payload.stepType || "",
        status: "failed",
        level: "error",
        label: "Hermes CLI 请求失败",
        message: requestError.message,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        stdoutExcerpt: clipText(error?.stdout || "", 2000),
        stderrExcerpt: clipText(error?.stderr || "", 2000)
      });
      throw requestError;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  async executeStep(payload = {}, runtime = {}) {
    const transport = this.getTransportForStep(payload.stepType);
    if (["openai-api", "openai", "api-server"].includes(transport)) {
      return this.executeOpenAiRunStep(payload, runtime);
    }
    if (transport === "api") {
      return this.executeApiStep(payload, runtime);
    }
    if (transport !== "cli") {
      const error = new Error(`Unsupported Hermes transport: ${transport || "(empty)"}`);
      error.code = "hermes_transport_unsupported";
      throw error;
    }
    return this.executeCliStep(payload, runtime);
  }

  async startSoftwareDetailPipelineJob(payload = {}) {
    let response;
    try {
      if (isMultipartApiMode(this.apiMode)) {
        const uploadManifest = await collectUploadFilesForAllowedPaths(
          payload.allowedPaths || []
        );
        if (!uploadManifest.files.length) {
          throw softwareDetailTransferError(
            "Software detail job upload 没有可读取的 workspace 文件。",
            "software_detail_upload_empty"
          );
        }
        response = await postMultipartWithTimeout(
          `${this.baseURL}/internal/software-detail-pipeline/jobs-upload`,
          {
            payload: JSON.stringify(payload),
            uploadManifest: JSON.stringify(uploadManifest)
          },
          uploadManifest.files,
          this._authHeaders(),
          this.timeoutMs
        );
      } else {
        response = await postJsonWithTimeout(
          `${this.baseURL}/internal/software-detail-pipeline/jobs`,
          payload,
          this.timeoutMs,
          this._authHeaders()
        );
      }
    } catch (cause) {
      throw wrapSoftwareDetailNetworkError(cause, "启动作业");
    }

    const body = parseSoftwareDetailResponse(response, {
      failureMessage: "Software detail Worker 启动作业失败。",
      failureCode: "software_detail_job_start_failed"
    });
    if (response.status !== 202) {
      throw softwareDetailTransferError(
        "Software detail Worker 启动作业未返回 HTTP 202。",
        "software_detail_start_status_invalid",
        { status: response.status }
      );
    }
    if (!String(body.jobId || "").trim()) {
      throw softwareDetailTransferError(
        "Software detail Worker 启动作业响应缺少 jobId。",
        "software_detail_invalid_response"
      );
    }
    if (body.schema !== SOFTWARE_DETAIL_JOB_SCHEMA) {
      throw softwareDetailTransferError(
        "Software detail Worker 启动作业返回了不支持的 schema。",
        "software_detail_schema_unsupported",
        { schema: String(body.schema || "") }
      );
    }
    if (!SOFTWARE_DETAIL_JOB_STATUSES.has(String(body.status || ""))) {
      throw softwareDetailTransferError(
        "Software detail Worker 启动作业返回了未知 status。",
        "software_detail_invalid_response"
      );
    }
    return body;
  }

  async getSoftwareDetailPipelineJob(jobId = "", options = {}) {
    const normalizedJobId = String(jobId || "").trim();
    if (!normalizedJobId) {
      throw softwareDetailTransferError(
        "Software detail jobId 不能为空。",
        "software_detail_job_id_required"
      );
    }
    let response;
    try {
      response = await requestTextWithTimeout(
        `${this.baseURL}/internal/software-detail-pipeline/jobs/${encodeURIComponent(normalizedJobId)}`,
        {
          method: "GET",
          timeoutMs: this.timeoutMs,
          headers: this._authHeaders(),
          timeoutMessage: "Software detail Worker 轮询超时。",
          timeoutCode: "software_detail_poll_timeout"
        }
      );
    } catch (cause) {
      throw wrapSoftwareDetailNetworkError(cause, "轮询作业");
    }

    const body = parseSoftwareDetailResponse(response, {
      failureMessage: "Software detail Worker 作业查询失败。",
      failureCode: "software_detail_job_query_failed"
    });
    if (String(body.jobId || "").trim() !== normalizedJobId) {
      throw softwareDetailTransferError(
        "Software detail Worker 返回的 jobId 与请求不一致。",
        "software_detail_job_mismatch",
        {
          requestedJobId: normalizedJobId,
          returnedJobId: String(body.jobId || "").trim()
        }
      );
    }
    return materializeSoftwareDetailPipelineArtifacts(
      body,
      options.localWorkspaceDir || ""
    );
  }

  async cleanupSoftwareDetailPipelineUpload(jobId = "") {
    const normalizedJobId = String(jobId || "").trim();
    if (!normalizedJobId) {
      throw softwareDetailTransferError(
        "Software detail jobId 不能为空。",
        "software_detail_job_id_required"
      );
    }
    let response;
    try {
      response = await requestTextWithTimeout(
        `${this.baseURL}/internal/software-detail-pipeline/jobs/${encodeURIComponent(normalizedJobId)}/upload-session`,
        {
          method: "DELETE",
          timeoutMs: this.timeoutMs,
          headers: this._authHeaders(),
          timeoutMessage: "Software detail Worker 清理上传工作区超时。",
          timeoutCode: "software_detail_upload_cleanup_timeout"
        }
      );
    } catch (cause) {
      throw wrapSoftwareDetailNetworkError(cause, "清理上传工作区");
    }
    return parseSoftwareDetailResponse(response, {
      failureMessage: "Software detail Worker 清理上传工作区失败。",
      failureCode: "software_detail_upload_cleanup_failed"
    });
  }

  async startTcsdPipelineJob(payload = {}) {
    let response;
    const correlationId = `tcsd-${randomUUID()}`;
    const headers = { ...this._authHeaders(), "X-SDG-Correlation-ID": correlationId };
    try {
      if (isMultipartApiMode(this.apiMode)) {
        const uploadManifest = await collectUploadFilesForAllowedPaths(payload.allowedPaths || []);
        if (!uploadManifest.files.length) {
          throw Object.assign(new Error("TCSD job upload has no readable workspace files."), {
            code: "tcsd_upload_empty"
          });
        }
        response = await postMultipartWithTimeout(
          `${this.baseURL}/internal/tcsd-pipeline/jobs-upload`,
          {
            payload: JSON.stringify(payload),
            uploadManifest: JSON.stringify(uploadManifest)
          },
          uploadManifest.files,
          headers,
          this.timeoutMs,
          { maxResponseBytes: this.maxControlResponseBytes }
        );
      } else {
        response = await postJsonWithTimeout(
          `${this.baseURL}/internal/tcsd-pipeline/jobs`,
          payload,
          this.timeoutMs,
          headers,
          { maxResponseBytes: this.maxControlResponseBytes }
        );
      }
    } catch (cause) {
      throw createTcsdTransportError({ operation: "create", cause, correlationId });
    }
    if (!response.ok) {
      throw createTcsdTransportError({ operation: "create", response, correlationId });
    }
    const body = parseJsonObject(response.text);
    if (!body || !safeRemoteCode(body.jobId)) {
      throw createTcsdTransportError({
        operation: "create",
        cause: { code: "tcsd_worker_invalid_response" },
        correlationId: response.correlationId || correlationId
      });
    }
    return {
      ...body,
      ...(response.correlationId ? { deliveryCorrelationId: response.correlationId } : {})
    };
  }

  async getTcsdPipelineJob(jobId = "", options = {}) {
    const target = new URL(`${this.baseURL}/internal/tcsd-pipeline/jobs/${encodeURIComponent(jobId)}`);
    const transport = target.protocol === "https:" ? https : http;
    let response;
    const correlationId = `tcsd-${randomUUID()}`;
    try { response = await new Promise((resolve, reject) => {
      const request = transport.request(target, {
        method: "GET",
        timeout: this.timeoutMs,
        headers: { ...this._authHeaders(), "X-SDG-Correlation-ID": correlationId }
      }, (result) => {
        let text = "";
        let responseBytes = 0;
        let rejected = false;
        result.setEncoding("utf8");
        result.on("data", (chunk) => {
          responseBytes += Buffer.byteLength(chunk);
          if (responseBytes > this.maxControlResponseBytes) {
            rejected = true;
            result.destroy();
            reject(Object.assign(new Error("TCSD Worker response exceeded the allowed size."), {
              code: "tcsd_worker_response_too_large"
            }));
            return;
          }
          text += chunk;
        });
        result.on("end", () => {
          if (rejected) return;
          resolve({ ok: result.statusCode >= 200 && result.statusCode < 300, status: result.statusCode, text, correlationId: String(result.headers["x-sdg-correlation-id"] || "") });
        });
      }); request.on("timeout", () => request.destroy(Object.assign(new Error("TCSD Worker 轮询超时。"), { code: "tcsd_poll_timeout" }))); request.on("error", reject); request.end();
    }); } catch (cause) {
      throw createTcsdTransportError({ operation: "poll", cause, correlationId });
    }
    const body = parseJsonObject(response.text);
    if (!response.ok) throw createTcsdTransportError({ operation: "poll", response, correlationId });
    if (!body || safeRemoteCode(body.jobId) !== safeRemoteCode(jobId)) {
      throw createTcsdTransportError({
        operation: "poll",
        cause: { code: "tcsd_worker_invalid_response" },
        correlationId: response.correlationId || correlationId
      });
    }
    return materializeTcsdPipelineArtifacts(body, options.localWorkspaceDir || "");
  }

  async cancelTcsdPipelineJob(jobId = "") {
    const target = new URL(`${this.baseURL}/internal/tcsd-pipeline/jobs/${encodeURIComponent(jobId)}/cancel`);
    const transport = target.protocol === "https:" ? https : http;
    let response;
    try {
      response = await new Promise((resolve, reject) => {
        const request = transport.request(target, {
          method: "POST",
          timeout: this.timeoutMs,
          headers: { ...this._authHeaders(), "Content-Type": "application/json" }
        }, (result) => {
          let text = "";
          result.setEncoding("utf8");
          result.on("data", (chunk) => { text += chunk; });
          result.on("end", () => resolve({
            ok: result.statusCode >= 200 && result.statusCode < 300,
            status: result.statusCode,
            text
          }));
        });
        request.on("timeout", () => request.destroy(new Error("TCSD Worker 取消作业超时。")));
        request.on("error", reject);
        request.end("{}");
      });
    } catch (cause) {
      throw createTcsdTransportError({ operation: "cancel", cause });
    }
    const body = parseJsonObject(response.text);
    if (!response.ok) throw createTcsdTransportError({ operation: "cancel", response });
    if (!body || safeRemoteCode(body.jobId) !== safeRemoteCode(jobId) || body.executionStopped !== true) {
      throw Object.assign(new Error("TCSD Worker 未确认作业已停止。"), {
        code: "tcsd_worker_cancel_unconfirmed",
        statusCode: 502,
        retryable: true
      });
    }
    return body;
  }

  async cleanupTcsdPipelineUpload(jobId = "") {
    const target = new URL(
      `${this.baseURL}/internal/tcsd-pipeline/jobs/${encodeURIComponent(jobId)}/upload-session`
    );
    const transport = target.protocol === "https:" ? https : http;
    const response = await new Promise((resolve, reject) => {
      const request = transport.request(target, {
        method: "DELETE",
        timeout: this.timeoutMs,
        headers: this._authHeaders()
      }, (result) => {
        let text = "";
        result.setEncoding("utf8");
        result.on("data", (chunk) => { text += chunk; });
        result.on("end", () => resolve({
          ok: result.statusCode >= 200 && result.statusCode < 300,
          status: result.statusCode,
          text
        }));
      });
      request.on("timeout", () => request.destroy(new Error("TCSD Worker 清理上传工作区超时。")));
      request.on("error", reject);
      request.end();
    });
    let body = null;
    try { body = JSON.parse(response.text); } catch (_error) { body = null; }
    if (!response.ok) {
      const error = new Error(body?.error || "TCSD Worker 清理上传工作区失败。");
      error.code = body?.code || "tcsd_upload_cleanup_failed";
      throw error;
    }
    return body;
  }
}
