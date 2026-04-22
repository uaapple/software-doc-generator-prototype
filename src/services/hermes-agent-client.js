import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

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

function clipText(value = "", maxLength = CLI_JSON_MAX_LENGTH) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
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

function sanitizeContentItem(item = {}) {
  return {
    title: clipText(item.title || "", 200),
    requirementText: clipText(item.requirementText || "", 6000),
    type: clipText(item.type || "", 80),
    verificationHint: clipText(item.verificationHint || "", 1000),
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

function buildContentGeneratePrompt(payload = {}) {
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
  const outline = sanitizeOutline(inputArtifact.outline || {});
  const project = {
    name: clipText(inputArtifact.project?.name || "", 200),
    description: clipText(inputArtifact.project?.description || "", 1000),
    language: clipText(inputArtifact.project?.language || "", 80),
    documentType: clipText(inputArtifact.project?.documentType || "software_requirement", 80),
    domain: clipText(inputArtifact.project?.domain || "", 120),
    moduleSkillKey: clipText(inputArtifact.project?.moduleSkillKey || "", 120)
  };
  const template = inputArtifact.template || {};
  return [
    "You are executing the Hermes step `content_generate` for software requirement generation.",
    "Generate structured software requirement items from the provided project context, template, anchors, task skill bundle, recalled skill atoms, and outline.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Template:",
    JSON.stringify(template, null, 2),
    "",
    "Outline:",
    JSON.stringify(outline, null, 2),
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
        items: [
          {
            title: "Requirement title",
            requirementText: "The software shall ...",
            type: "functional",
            verificationHint: "How to verify",
            sourceAnchorIds: ["asset-1::line-10-18::behavior"],
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
    "- Use anchors as the source-of-truth references for generated requirements.",
    "- Every requirement must be traceable to one or more sourceAnchorIds from the provided anchors.",
    "- sourceAnchorIds must only contain anchor ids that exist in the provided anchor list.",
    "- Keep content at software requirement level, not implementation detail level.",
    "- Do not invent sources, anchor ids, or skill codes."
  ].join("\n");
}

function buildCliPrompt(payload = {}) {
  switch (payload.stepType) {
    case "anchor_index_build":
      return buildAnchorIndexPrompt(payload);
    case "material_extract":
      return buildMaterialExtractPrompt(payload);
    case "atom_recall":
      return buildAtomRecallPrompt(payload);
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

function normalizeCliArtifact(stepType, parsed = {}) {
  if (stepType === "anchor_index_build") {
    return { anchors: Array.isArray(parsed.anchors) ? parsed.anchors.map(sanitizeAnchorItem) : [] };
  }
  if (stepType === "material_extract") {
    return { extractions: Array.isArray(parsed.extractions) ? parsed.extractions : [] };
  }
  if (stepType === "atom_recall") {
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
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

  async executeApiStep(payload = {}, runtime = {}) {
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
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

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
        cwd: this.workdir,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1" }
      });
      const { body, sessionId } = parseCliResponse(stdout);
      const tokenUsage = sessionId
        ? await this.usageReader({
            sessionId,
            stateDbPath: this.stateDbPath,
            commandRunner: this.commandRunner,
            workdir: this.workdir
          })
        : null;
      let parsed = null;
      try {
        parsed = JSON.parse(extractJsonText(body));
      } catch (_error) {
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
        artifact: normalizeCliArtifact(payload.stepType, parsed),
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
