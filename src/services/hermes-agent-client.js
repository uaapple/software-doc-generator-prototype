import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { getAllowedKindsForAreasAndLayer } from "../../public/skill-kind-matrix.js";

const execFileAsync = promisify(execFile);
const CLI_JSON_MAX_LENGTH = 120000;
const CLI_EXCERPT_MAX_LENGTH = 600;
const CLI_SKILL_CONTENT_MAX_LENGTH = 1200;
const CLI_PATH_MAX_LENGTH = 260;
const HERMES_USAGE_QUERY_RETRIES = 5;
const HERMES_USAGE_QUERY_RETRY_DELAY_MS = 250;

function trimTrailingSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function isMultipartApiMode(value = "") {
  return ["multipart", "upload"].includes(String(value || "").trim().toLowerCase());
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
    absolutePath: clipText(item.absolutePath || item.path || "", CLI_PATH_MAX_LENGTH)
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

export class HermesAgentClient {
  constructor(options = {}) {
    this.transport = String(options.transport || config.hermes.transport || "cli").trim().toLowerCase();
    this.baseURL = trimTrailingSlash(options.baseURL || config.hermes.baseURL);
    this.apiMode = String(options.apiMode || config.hermes.apiMode || "json").trim().toLowerCase();
    this.authToken = String(options.authToken || config.hermes.authToken || "").trim();
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs || config.hermes.timeoutMs) || config.hermes.timeoutMs);
    this.stepTimeoutMs = normalizeStepTimeoutMap(options.stepTimeoutMs || config.hermes.stepTimeoutMs || {});
    this.command = String(options.command || config.hermes.command || "hermes").trim() || "hermes";
    this.maxTurns = Math.max(1, Number(options.maxTurns || config.hermes.maxTurns) || config.hermes.maxTurns || 40);
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

    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    form.set("uploadManifest", JSON.stringify(uploadManifest));
    for (const file of uploadManifest.files) {
      const fileBuffer = await fs.readFile(file.sourcePath);
      form.set(file.fieldName, new Blob([fileBuffer], { type: "application/octet-stream" }), path.basename(file.sourcePath));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/internal/steps/execute-upload`, {
        method: "POST",
        headers: this._authHeaders(),
        body: form,
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

  async executeCliStep(payload = {}, runtime = {}) {
    const prompt = buildCliPrompt(payload);
    const args = ["chat", "-q", prompt, "-Q", "--source", "tool", "--max-turns", String(this.maxTurns), "--yolo"];
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
        label: "已启动本机 Hermes CLI",
        message: `正在调用本机 Hermes 执行 ${payload.stepType || "step"}。`,
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
      const { stdout = "", stderr = "" } = await this.commandRunner(this.command, args, {
        cwd: workdir,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1" }
      });
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
          await emitHermesEvent(runtime.onEvent, {
            type: "agent_runtime",
            transport: "cli",
            stepType: payload.stepType || "",
            status: "completed",
            label: "Hermes CLI 已写入 Markdown 产物",
            message: "Hermes CLI 未返回严格 JSON，但已写入 Markdown 产物，后端将继续解析产物文件。",
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
      const requestError = new Error(error?.stderr || error?.message || "Hermes CLI request failed");
      requestError.code = error?.code || "hermes_request_failed";
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
    if (this.transport === "api") {
      return this.executeApiStep(payload, runtime);
    }
    return this.executeCliStep(payload, runtime);
  }
}
