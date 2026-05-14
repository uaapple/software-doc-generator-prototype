import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { resolveStoredFilePath, writeJson } from "./storage.js";

const execFileAsync = promisify(execFile);

const SERVICE_VERSION = 1;
const WORKSPACE_DIR_NAME = "agent-workspace";
const INPUTS_DIR_NAME = "inputs";
const OUTPUTS_DIR_NAME = "outputs";
const MANIFEST_FILE_NAME = "manifest.json";
const TASK_BRIEF_FILE_NAME = "task-brief.md";
const PROMPT_FILE_NAME = "prompt.md";
const OUTPUT_MARKDOWN_FILE_NAME = "software-requirements.md";
const OUTPUT_MARKDOWN_RELATIVE_PATH = path.posix.join(OUTPUTS_DIR_NAME, OUTPUT_MARKDOWN_FILE_NAME);
const STEP_TYPE = "software_requirement_markdown_generate";

function now() {
  return new Date().toISOString();
}

function normalizeString(value = "") {
  return String(value ?? "").trim();
}

function normalizeNullableString(value = "") {
  const text = normalizeString(value);
  return text || null;
}

function normalizeManualTitleOutline(value = {}) {
  const candidate =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (_error) {
            return null;
          }
        })()
      : value;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const sections = [];
  for (const section of Array.isArray(candidate.sections) ? candidate.sections : []) {
    const sectionTitle = normalizeString(section?.sectionTitle || section?.title);
    if (!sectionTitle) {
      continue;
    }

    const items = [];
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const itemTitle = normalizeString(item?.itemTitle || item?.title);
      if (!itemTitle) {
        continue;
      }
      items.push({
        id: normalizeString(item?.id),
        itemTitle
      });
    }

    if (items.length) {
      sections.push({
        id: normalizeString(section?.id),
        sectionTitle,
        items
      });
    }
  }

  return sections.length ? { sections } : null;
}

export function buildOutlineItems(manualTitleOutline = {}) {
  const normalized = normalizeManualTitleOutline(manualTitleOutline);
  if (!normalized) {
    return [];
  }

  let index = 0;
  return normalized.sections.flatMap((section) =>
    section.items.map((item) => {
      index += 1;
      return {
        id: item.id || `item-${String(index).padStart(3, "0")}`,
        itemTitle: item.itemTitle,
        sectionTitle: section.sectionTitle,
        index
      };
    })
  );
}

function pathFromPosix(workspaceDir, relativePath) {
  return path.join(workspaceDir, ...String(relativePath || "").split("/").filter(Boolean));
}

function toPosixPath(value = "") {
  return String(value || "").replace(/\\/g, "/");
}

function sanitizePathSegment(value = "", fallback = "item") {
  const normalized = normalizeString(value)
    .replace(/[\\/]/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function inferAssetRole(asset = {}) {
  return normalizeString(asset.role || asset.fileRole || asset.kind || "asset") || "asset";
}

function inferAssetOriginalName(asset = {}, index = 0, sourcePath = "") {
  return (
    normalizeString(asset.originalName || asset.fileName || asset.storedName || asset.filename) ||
    (sourcePath ? path.basename(sourcePath) : "") ||
    `asset-${index + 1}.txt`
  );
}

function inferWorkspaceFileName(asset = {}, index = 0, sourcePath = "", usedNames = new Set()) {
  const originalName = inferAssetOriginalName(asset, index, sourcePath);
  const shouldPreserveOriginalName = /\.slx$/i.test(originalName) || /simulink_slx/i.test(inferAssetRole(asset));
  if (shouldPreserveOriginalName) {
    const parsedOriginal = path.parse(originalName);
    const originalBaseName = sanitizePathSegment(parsedOriginal.name || `model-${index + 1}`, `model-${index + 1}`);
    const originalExtension = sanitizePathSegment(parsedOriginal.ext || ".slx", ".slx") || ".slx";
    let candidate = `${originalBaseName}${originalExtension}`;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${originalBaseName}-${suffix}${originalExtension}`;
      suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
  }

  const parsed = path.parse(originalName);
  const role = sanitizePathSegment(inferAssetRole(asset), "asset");
  const baseName = sanitizePathSegment(parsed.name || `asset-${index + 1}`, `asset-${index + 1}`);
  const extension = sanitizePathSegment(parsed.ext || "", "");
  const preferredName = `${String(index + 1).padStart(3, "0")}-${role}-${baseName}${extension}`;
  let candidate = preferredName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${String(index + 1).padStart(3, "0")}-${role}-${baseName}-${suffix}${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function pathExists(filePath = "") {
  if (!filePath) {
    return false;
  }
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (_error) {
    return false;
  }
}

function candidateAssetSourcePaths(asset = {}, uploadBaseDir = config.uploadDir) {
  const candidates = [
    normalizeString(asset.absolutePath),
    normalizeString(asset.path),
    resolveStoredFilePath(asset, {
      baseDir: uploadBaseDir,
      allowStoredNameFallback: true
    })
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

async function resolveExistingAssetSourcePath(asset = {}, uploadBaseDir = config.uploadDir) {
  const candidates = candidateAssetSourcePaths(asset, uploadBaseDir);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return "";
}

function buildMaterializedAssetText(asset = {}) {
  const content = normalizeString(asset.content || asset.text || asset.preview);
  if (content) {
    return content;
  }
  return "";
}

function getProjectId(project = {}, explicitProjectId = "") {
  return normalizeString(explicitProjectId || project.id || project.projectId);
}

function getModuleId(module = {}, explicitModuleId = "") {
  return normalizeString(explicitModuleId || module.id || module.moduleId);
}

function buildWorkspaceDir({ project = {}, module = {}, projectId = "", moduleId = "", taskId = "", workspaceDir = "" } = {}) {
  if (workspaceDir) {
    return path.resolve(workspaceDir);
  }

  const resolvedProjectId = getProjectId(project, projectId);
  const resolvedModuleId = getModuleId(module, moduleId);
  const resolvedTaskId = normalizeString(taskId);
  if (!resolvedProjectId || !resolvedModuleId || !resolvedTaskId) {
    throw Object.assign(new Error("projectId, moduleId, and taskId are required to build the agent workspace path"), {
      code: "invalid_workspace_identity"
    });
  }

  return path.join(config.generationTaskArtifactDir, resolvedProjectId, resolvedModuleId, resolvedTaskId, WORKSPACE_DIR_NAME);
}

function isSystemRequirementRole(role = "") {
  return /system_(pdf|requirement)|extracted_system_requirement/i.test(normalizeString(role));
}

function isImplementationRole(role = "") {
  return /generated_c|simulink_slx|model_pdf|model_requirement_view_json/i.test(normalizeString(role));
}

function isReferenceRole(role = "") {
  return /reference_.*example|example/i.test(normalizeString(role));
}

function classifySourcePriority(role = "") {
  if (isSystemRequirementRole(role)) return "system_requirement";
  if (isImplementationRole(role)) return "implementation";
  if (isReferenceRole(role)) return "style_reference";
  return "supporting";
}

function buildManifest({
  project = {},
  module = {},
  projectId = "",
  moduleId = "",
  taskId = "",
  outlineItems = [],
  inputFiles = [],
  extraContext = {}
} = {}) {
  const resolvedProjectId = getProjectId(project, projectId);
  const resolvedModuleId = getModuleId(module, moduleId);
  const slxFiles = inputFiles
    .filter((file) => /\.slx$/i.test(file.originalName || file.workspaceFileName || "") || /simulink_slx/i.test(file.role || ""))
    .map((file) => ({
      assetId: file.assetId,
      originalName: file.originalName,
      workspacePath: file.workspacePath
    }));

  return {
    version: SERVICE_VERSION,
    kind: STEP_TYPE,
    generatedAt: now(),
    task: {
      id: normalizeString(taskId),
      projectId: resolvedProjectId,
      moduleId: resolvedModuleId,
      documentType: "software_requirement"
    },
    project: {
      id: resolvedProjectId,
      name: normalizeString(project.name),
      description: normalizeString(project.description),
      domain: normalizeString(project.domain || module.domain || "embedded_vcu"),
      documentType: "software_requirement"
    },
    module: {
      id: resolvedModuleId,
      name: normalizeString(module.name),
      domain: normalizeString(module.domain || project.domain || "embedded_vcu"),
      moduleSkillKey: normalizeString(module.moduleSkillKey)
    },
    outlineItems,
    inputs: inputFiles,
    slxFiles,
    sourcePriority: [
      {
        rank: 1,
        name: "system_requirement",
        roles: ["system_pdf", "extracted_system_requirement", "system_requirement"],
        rule: "Use system requirements as the highest-priority scope and behavior source."
      },
      {
        rank: 2,
        name: "implementation",
        roles: ["simulink_slx", "generated_c", "model_pdf", "model_requirement_view_json"],
        rule: "Use implementation assets to clarify behavior and evidence without overriding explicit system requirements."
      },
      {
        rank: 3,
        name: "style_reference",
        roles: ["reference_requirement_example"],
        rule: "Use examples for style only; do not copy unsupported behavior."
      }
    ],
    paths: {
      inputsDir: INPUTS_DIR_NAME,
      outputsDir: OUTPUTS_DIR_NAME,
      outputMarkdown: OUTPUT_MARKDOWN_RELATIVE_PATH,
      manifest: MANIFEST_FILE_NAME,
      taskBrief: TASK_BRIEF_FILE_NAME,
      prompt: PROMPT_FILE_NAME
    },
    extraContext
  };
}

function renderInputTable(inputFiles = []) {
  if (!inputFiles.length) {
    return "- No input assets were selected.";
  }
  return inputFiles
    .map((file) => `- ${file.workspacePath} | original=${file.originalName || "n/a"} | role=${file.role || "asset"} | priority=${file.sourcePriority}`)
    .join("\n");
}

function renderOutlineList(outlineItems = []) {
  if (!outlineItems.length) {
    return "- No outline items were supplied.";
  }
  return outlineItems
    .map((item) => `- ${item.index}. [${item.id}] ${item.sectionTitle} / ${item.itemTitle}`)
    .join("\n");
}

function renderTaskBrief(manifest = {}) {
  const slxFiles = Array.isArray(manifest.slxFiles) && manifest.slxFiles.length
    ? manifest.slxFiles.map((file) => `${file.originalName} (${file.workspacePath})`).join(", ")
    : "n/a";
  return [
    "# Software Requirement Markdown Agent Task",
    "",
    `- Task ID: ${manifest.task?.id || "n/a"}`,
    `- Project: ${manifest.project?.name || manifest.project?.id || "n/a"}`,
    `- Module: ${manifest.module?.name || manifest.module?.id || "n/a"}`,
    "- Document type: software_requirement",
    `- Output file: ${OUTPUT_MARKDOWN_RELATIVE_PATH}`,
    `- Outline items: ${Array.isArray(manifest.outlineItems) ? manifest.outlineItems.length : 0}`,
    `- Input assets: ${Array.isArray(manifest.inputs) ? manifest.inputs.length : 0}`,
    `- SLX files: ${slxFiles}`,
    "",
    "## Outline",
    "",
    renderOutlineList(manifest.outlineItems),
    "",
    "## Inputs",
    "",
    renderInputTable(manifest.inputs)
  ].join("\n");
}

export function buildPrompt(manifest = {}) {
  return [
    "# Hermes Software Requirement Markdown Task",
    "",
    "You are running inside the prepared task workspace. Treat this directory as your working directory.",
    `Read \`${MANIFEST_FILE_NAME}\` and \`${TASK_BRIEF_FILE_NAME}\` first, then read only files referenced by the manifest.`,
    `Write the final markdown document to \`${OUTPUT_MARKDOWN_RELATIVE_PATH}\`. Create the \`${OUTPUTS_DIR_NAME}\` directory if needed.`,
    "",
    "## Source Priority",
    "",
    "1. System requirement sources are authoritative for scope, behavior, triggers, thresholds, state names, and acceptance intent.",
    "2. SLX, model PDFs, generated C, and modelRequirementView JSON are implementation evidence. Use them to clarify details, not to override explicit system requirements.",
    "3. Reference examples and skill/style material are style guidance only. Do not copy behavior from examples unless the selected system or implementation inputs support it.",
    "4. If sources conflict, keep the system requirement interpretation and record the conflict in the `requirement-item` comment metadata.",
    "",
    "## SLX And Matlab MCP",
    "",
    "Use exact SLX file names from the manifest. Do not invent alternate model file names.",
    "If any SLX file is present, prefer Matlab MCP or the available Simulink analysis tools to inspect the model before drafting behavior from it.",
    "When Matlab MCP is used for an item, set `matlabMcp: used` in that item's comment. If no SLX is relevant, use `matlabMcp: not_applicable`. If the tool is unavailable, use `matlabMcp: unavailable` and rely only on readable manifest-listed evidence.",
    "",
    "SLX files from manifest:",
    JSON.stringify(manifest.slxFiles || [], null, 2),
    "",
    "## Required Outline",
    "",
    "Generate one requirement item for every outline leaf, in the exact order below.",
    JSON.stringify(manifest.outlineItems || [], null, 2),
    "",
    "## Requirement-Item Comment Contract",
    "",
    "Every generated leaf item must be wrapped in this backend-readable HTML comment contract:",
    "",
    "```markdown",
    "<!-- requirement-item:start id=\"item-001\" -->",
    "",
    "Requirement text...",
    "",
    "<!-- requirement-item:end -->",
    "```",
    "",
    "Rules for the comment contract:",
    "- Preserve each `outlineItems[].id` exactly in the start marker.",
    "- Use exactly one `requirement-item:start` marker and one `requirement-item:end` marker per outline item.",
    "- The block order must match `manifest.outlineItems`; do not sort or group items differently.",
    "- Do not include extra requirement-item blocks, duplicate ids, or ids not present in the manifest.",
    "- The backend owns section and item titles. Do not rely on generated headings as the title source.",
    "- The body between start and end must be non-empty and should include source, SLX, Matlab MCP, and conflict notes as normal Markdown text when relevant.",
    "- Keep the comments in the final markdown. The backend will parse them.",
    "- Do not use raw UUIDs or internal runtime labels as human-facing requirement text.",
    "",
    "## Output Rules",
    "",
    "- The final file must be markdown, not JSON.",
    "- Keep headings and item order aligned to the required outline.",
    "- Preserve units, enum values, thresholds, timing, signal names, and state names from the selected inputs.",
    "- Keep the wording at software requirement level; avoid low-level implementation narration unless it is needed as evidence.",
    "- Do not create extra outline items, and do not omit any required outline item.",
    "",
    "After writing the markdown file, return strict JSON only, with no markdown fences:",
    JSON.stringify(
      {
        markdownPath: OUTPUT_MARKDOWN_RELATIVE_PATH,
        itemCount: Array.isArray(manifest.outlineItems) ? manifest.outlineItems.length : 0,
        summary: "Generated software requirement markdown."
      },
      null,
      2
    )
  ].join("\n");
}

async function copyInputAssets({
  workspaceDir,
  inputAssets = [],
  uploadBaseDir = config.uploadDir,
  allowMaterializedAssetFallback = false
} = {}) {
  const inputsDir = path.join(workspaceDir, INPUTS_DIR_NAME);
  await fs.mkdir(inputsDir, { recursive: true });

  const usedNames = new Set();
  const copied = [];
  for (const [index, asset] of (Array.isArray(inputAssets) ? inputAssets : []).entries()) {
    const role = inferAssetRole(asset);
    const sourcePath = await resolveExistingAssetSourcePath(asset, uploadBaseDir);
    const workspaceFileName = inferWorkspaceFileName(asset, index, sourcePath, usedNames);
    const workspaceRelativePath = path.posix.join(INPUTS_DIR_NAME, workspaceFileName);
    const targetPath = pathFromPosix(workspaceDir, workspaceRelativePath);
    const originalName = inferAssetOriginalName(asset, index, sourcePath);
    let mode = "copied";

    if (sourcePath) {
      await fs.copyFile(sourcePath, targetPath);
    } else if (allowMaterializedAssetFallback && buildMaterializedAssetText(asset)) {
      await fs.writeFile(targetPath, buildMaterializedAssetText(asset), "utf8");
      mode = "materialized";
    } else {
      const error = new Error(`Input asset source file not found: ${originalName}`);
      error.code = "input_asset_missing";
      error.assetId = asset?.id || asset?.assetId || "";
      throw error;
    }

    copied.push({
      assetId: normalizeString(asset.id || asset.assetId),
      originalName,
      fileName: originalName,
      workspaceFileName,
      workspacePath: workspaceRelativePath,
      absolutePath: targetPath,
      sourcePath,
      role,
      sourcePriority: classifySourcePriority(role),
      isSystemRequirement: classifySourcePriority(role) === "system_requirement",
      isSlx: role === "simulink_slx" || /\.slx$/i.test(originalName),
      mimeType: normalizeString(asset.mimeType || asset.mimetype),
      size: Number(asset.size || 0) || null,
      mode
    });
  }

  return copied;
}

function parseCliSession(stdout = "") {
  const normalized = String(stdout || "").replace(/\r/g, "");
  const match = normalized.match(/(?:^|\n)session_id:\s*(.+?)\s*$/i);
  return {
    body: match ? normalized.slice(0, match.index).trim() : normalized.trim(),
    sessionId: match ? match[1].trim() : ""
  };
}

function parseCommentMetadata(text = "") {
  const metadata = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_.-]*):\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }
    metadata[match[1]] = match[2];
  }
  return metadata;
}

function stripWrappingTitle(markdown = "", outlineItem = {}) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  const firstLine = lines[0] || "";
  const headingMatch = firstLine.match(/^#{1,6}\s+(.+?)\s*$/);
  if (headingMatch && headingMatch[1].trim() === outlineItem.itemTitle) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function parseRequirementItemBlocks(markdown = "") {
  const blocks = [];
  const markerPattern = /<!--\s*requirement-item:(start|end)(?:\s+id=(?:"([^"]+)"|'([^']+)'))?\s*-->/gi;
  let current = null;
  let match = markerPattern.exec(markdown);

  while (match) {
    const markerType = match[1];
    const markerId = normalizeString(match[2] || match[3] || "");

    if (markerType === "start") {
      if (current) {
        throw new Error(`Markdown requirement-item ${current.id} 尚未结束，又开始了 ${markerId || "未知条目"}`);
      }
      if (!markerId) {
        throw new Error("Markdown requirement-item:start 缺少 id");
      }
      current = {
        id: markerId,
        bodyStart: markerPattern.lastIndex
      };
      match = markerPattern.exec(markdown);
      continue;
    }

    if (!current) {
      throw new Error("Markdown requirement-item:end 没有对应的 start");
    }
    const body = String(markdown || "").slice(current.bodyStart, match.index).trim();
    if (!body) {
      throw new Error(`Markdown requirement-item ${current.id} 正文为空`);
    }
    blocks.push({
      id: current.id,
      body
    });
    current = null;
    match = markerPattern.exec(markdown);
  }

  if (current) {
    throw new Error(`Markdown requirement-item ${current.id} 缺少 end 标记`);
  }

  return blocks;
}

export function parseRequirementMarkdownBlocks(markdown = "", outlineItems = []) {
  const expectedItems = Array.isArray(outlineItems)
    ? outlineItems.map((item) => ({
        ...item,
        id: normalizeString(item?.id),
        sectionTitle: normalizeString(item?.sectionTitle),
        itemTitle: normalizeString(item?.itemTitle || item?.title)
      }))
    : [];
  if (!expectedItems.length) {
    throw new Error("manualTitleOutline 二级标题为空，无法解析 Markdown 结果");
  }

  const expectedIds = new Set();
  for (const [index, item] of expectedItems.entries()) {
    if (!item.id) {
      throw new Error(`outlineItems[${index}] 缺少 id`);
    }
    if (!item.sectionTitle || !item.itemTitle) {
      throw new Error(`outlineItems[${index}] 缺少一级标题或二级标题`);
    }
    if (expectedIds.has(item.id)) {
      throw new Error(`outlineItems id 重复: ${item.id}`);
    }
    expectedIds.add(item.id);
  }

  const blocks = parseRequirementItemBlocks(markdown);
  if (blocks.length !== expectedItems.length) {
    throw new Error(`Markdown 结果条目数不匹配：期望 ${expectedItems.length} 条，实际 ${blocks.length} 条`);
  }

  const seenIds = new Set();
  return expectedItems.map((outlineItem, index) => {
    const block = blocks[index];
    if (!block) {
      throw new Error(`Markdown 缺少第 ${index + 1} 条结果: ${outlineItem.id}`);
    }
    if (!expectedIds.has(block.id)) {
      throw new Error(`Markdown requirement-item id 不在本次标题列表中: ${block.id}`);
    }
    if (seenIds.has(block.id)) {
      throw new Error(`Markdown requirement-item id 重复: ${block.id}`);
    }
    if (block.id !== outlineItem.id) {
      throw new Error(`Markdown 条目顺序不匹配：期望 ${outlineItem.id}，实际 ${block.id}`);
    }
    seenIds.add(block.id);

    const requirementText = stripWrappingTitle(block.body, outlineItem);
    if (!requirementText) {
      throw new Error(`Markdown requirement-item ${block.id} 正文为空`);
    }

    return {
      id: block.id,
      sectionTitle: outlineItem.sectionTitle,
      itemTitle: outlineItem.itemTitle,
      title: outlineItem.itemTitle,
      requirementText,
      markdown: requirementText,
      sourceMarkdownItemId: block.id
    };
  });
}

function normalizeWorkspaceDescriptor(workspace = {}) {
  const rawWorkspaceDir = normalizeString(workspace.workspaceDir || workspace.outputDir);
  if (!rawWorkspaceDir) {
    throw Object.assign(new Error("workspaceDir is required"), {
      code: "invalid_workspace"
    });
  }
  const workspaceDir = path.resolve(rawWorkspaceDir);
  if (workspaceDir === path.parse(workspaceDir).root) {
    throw Object.assign(new Error("workspaceDir is required"), {
      code: "invalid_workspace"
    });
  }

  return {
    ...workspace,
    workspaceDir,
    manifestPath: workspace.manifestPath || path.join(workspaceDir, MANIFEST_FILE_NAME),
    taskBriefPath: workspace.taskBriefPath || path.join(workspaceDir, TASK_BRIEF_FILE_NAME),
    promptPath: workspace.promptPath || path.join(workspaceDir, PROMPT_FILE_NAME),
    outputPath: workspace.outputPath || pathFromPosix(workspaceDir, OUTPUT_MARKDOWN_RELATIVE_PATH),
    outputRelativePath: workspace.outputRelativePath || OUTPUT_MARKDOWN_RELATIVE_PATH,
    outlineItems: Array.isArray(workspace.outlineItems) ? workspace.outlineItems : [],
    inputFiles: Array.isArray(workspace.inputFiles) ? workspace.inputFiles : []
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

export class SoftwareRequirementMarkdownAgentService {
  constructor(options = {}) {
    this.command = normalizeString(options.command || config.hermes.command || "hermes") || "hermes";
    this.maxTurns = Math.max(1, Number(options.maxTurns || config.hermes.maxTurns || 40) || 40);
    this.timeoutMs = Math.max(
      1000,
      Number(
        options.timeoutMs ||
          config.hermes.stepTimeoutMs?.software_requirement_markdown_generate ||
          config.hermes.stepTimeoutMs?.content_generate ||
          config.hermes.timeoutMs ||
          120000
      ) || 120000
    );
    this.commandRunner = typeof options.commandRunner === "function" ? options.commandRunner : defaultCommandRunner;
  }

  async prepareWorkspace(options = {}) {
    const workspaceDir = buildWorkspaceDir(options);
    const outlineItems = buildOutlineItems(options.manualTitleOutline);
    if (!outlineItems.length) {
      throw Object.assign(new Error("manualTitleOutline must contain at least one leaf item"), {
        code: "invalid_manual_title_outline"
      });
    }

    if (options.resetWorkspace !== false) {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
    await fs.mkdir(pathFromPosix(workspaceDir, OUTPUTS_DIR_NAME), { recursive: true });

    const inputFiles = await copyInputAssets({
      workspaceDir,
      inputAssets: options.inputAssets,
      uploadBaseDir: options.uploadBaseDir || config.uploadDir,
      allowMaterializedAssetFallback: Boolean(options.allowMaterializedAssetFallback)
    });

    const manifest = buildManifest({
      project: options.project,
      module: options.module,
      projectId: options.projectId,
      moduleId: options.moduleId,
      taskId: options.taskId,
      outlineItems,
      inputFiles,
      extraContext: options.extraContext || {}
    });
    const taskBrief = renderTaskBrief(manifest);
    const prompt = buildPrompt(manifest);

    const manifestPath = path.join(workspaceDir, MANIFEST_FILE_NAME);
    const taskBriefPath = path.join(workspaceDir, TASK_BRIEF_FILE_NAME);
    const promptPath = path.join(workspaceDir, PROMPT_FILE_NAME);
    const outputPath = pathFromPosix(workspaceDir, OUTPUT_MARKDOWN_RELATIVE_PATH);

    await writeJson(manifestPath, manifest);
    await fs.writeFile(taskBriefPath, `${taskBrief}\n`, "utf8");
    await fs.writeFile(promptPath, `${prompt}\n`, "utf8");

    return normalizeWorkspaceDescriptor({
      workspaceDir,
      manifestPath,
      taskBriefPath,
      promptPath,
      outputPath,
      outputRelativePath: OUTPUT_MARKDOWN_RELATIVE_PATH,
      manifest,
      outlineItems,
      inputFiles,
      writtenFiles: [
        MANIFEST_FILE_NAME,
        TASK_BRIEF_FILE_NAME,
        PROMPT_FILE_NAME,
        ...inputFiles.map((file) => file.workspacePath)
      ].map(toPosixPath)
    });
  }

  async execute(options = {}) {
    const workspace = normalizeWorkspaceDescriptor(
      options.workspace || options.preparedWorkspace || (await this.prepareWorkspace(options))
    );
    const prompt = await fs.readFile(workspace.promptPath, "utf8");
    const startedAt = now();
    const rawResult = await this.invokeHermes({ ...options, workspace, prompt });
    const markdown = await this.readOutputMarkdown(workspace, rawResult);
    return this.normalize({
      workspace,
      rawResult,
      markdown,
      startedAt,
      completedAt: now()
    });
  }

  async invokeHermes({ workspace, prompt, hermesAgentClient = null, commandRunner = null, runtime = {}, ...options } = {}) {
    const clientResult = await this.tryInvokeHermesClient({ hermesAgentClient, workspace, prompt, runtime });
    if (clientResult) {
      return clientResult;
    }

    const runner =
      commandRunner ||
      (typeof hermesAgentClient?.commandRunner === "function" ? hermesAgentClient.commandRunner : null) ||
      this.commandRunner;
    const command = normalizeString(options.command || hermesAgentClient?.command || this.command);
    const maxTurns = Math.max(1, Number(options.maxTurns || hermesAgentClient?.maxTurns || this.maxTurns) || this.maxTurns);
    const timeoutMs = Math.max(
      1000,
      Number(
        options.timeoutMs ||
          (typeof hermesAgentClient?.getTimeoutMsForStep === "function"
            ? hermesAgentClient.getTimeoutMsForStep(STEP_TYPE)
            : 0) ||
          hermesAgentClient?.timeoutMs ||
          this.timeoutMs
      ) || this.timeoutMs
    );
    const args = ["chat", "-q", prompt, "-Q", "--source", "tool", "--max-turns", String(maxTurns), "--yolo"];
    return runner(command, args, {
      cwd: workspace.workspaceDir,
      timeout: timeoutMs,
      maxBuffer: Number(options.maxBuffer || 16 * 1024 * 1024),
      env: { ...process.env, ...(options.env || {}), NO_COLOR: "1" }
    });
  }

  async tryInvokeHermesClient({ hermesAgentClient, workspace, prompt, runtime = {} } = {}) {
    if (!hermesAgentClient) {
      return null;
    }

    const request = {
      stepType: STEP_TYPE,
      cwd: workspace.workspaceDir,
      workspaceDir: workspace.workspaceDir,
      prompt,
      promptPath: workspace.promptPath,
      manifestPath: workspace.manifestPath,
      taskBriefPath: workspace.taskBriefPath,
      outputPath: workspace.outputPath,
      outputRelativePath: workspace.outputRelativePath,
      manifest: workspace.manifest || null
    };

    if (typeof hermesAgentClient.executeMarkdownWorkspace === "function") {
      return hermesAgentClient.executeMarkdownWorkspace(request, runtime);
    }
    if (typeof hermesAgentClient.executeWorkspace === "function") {
      return hermesAgentClient.executeWorkspace(request, runtime);
    }
    if (typeof hermesAgentClient.execute === "function") {
      return hermesAgentClient.execute(request, runtime);
    }
    return null;
  }

  async readOutputMarkdown(workspace, rawResult = {}) {
    try {
      return await fs.readFile(workspace.outputPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const fallbackMarkdown =
      normalizeString(rawResult.markdown) ||
      normalizeString(rawResult.artifact?.markdown) ||
      normalizeString(rawResult.outputMarkdown);
    if (fallbackMarkdown) {
      return fallbackMarkdown;
    }

    const missing = new Error(`Hermes did not write ${workspace.outputRelativePath}`);
    missing.code = "agent_output_missing";
    missing.outputPath = workspace.outputPath;
    throw missing;
  }

  normalize({ workspace, rawResult = {}, markdown = "", startedAt = "", completedAt = "" } = {}) {
    const parsedStdout = parseCliSession(rawResult.stdout || "");
    const items = parseRequirementMarkdownBlocks(markdown, workspace.outlineItems);
    const foundIds = new Set(items.map((item) => item.sourceMarkdownItemId).filter(Boolean));
    const expectedIds = new Set((workspace.outlineItems || []).map((item) => item.id).filter(Boolean));

    return {
      status: rawResult.status || "succeeded",
      stepType: STEP_TYPE,
      workspaceDir: workspace.workspaceDir,
      manifestPath: workspace.manifestPath,
      taskBriefPath: workspace.taskBriefPath,
      promptPath: workspace.promptPath,
      outputPath: workspace.outputPath,
      outputRelativePath: workspace.outputRelativePath,
      startedAt: normalizeNullableString(startedAt),
      completedAt: normalizeNullableString(completedAt),
      artifact: {
        markdown,
        itemCount: items.length,
        parsedCommentCount: items.length,
        items,
        missingItemIds: [...expectedIds].filter((id) => !foundIds.has(id)),
        extraItemIds: [...foundIds].filter((id) => !expectedIds.has(id)),
        manifest: workspace.manifest || null,
        inputFiles: workspace.inputFiles || []
      },
      runtime: {
        cwd: workspace.workspaceDir,
        sessionId: rawResult.sessionId || parsedStdout.sessionId || "",
        stdoutExcerpt: parsedStdout.body.slice(0, 4000),
        stderrExcerpt: normalizeString(rawResult.stderr).slice(0, 4000)
      },
      metrics: rawResult.metrics || {},
      logs: Array.isArray(rawResult.logs) ? rawResult.logs : []
    };
  }
}

export async function prepareWorkspace(options = {}) {
  return new SoftwareRequirementMarkdownAgentService(options.serviceOptions || {}).prepareWorkspace(options);
}

export async function prepareSoftwareRequirementMarkdownWorkspace(options = {}) {
  const workspace = await prepareWorkspace(options);
  const inputFiles = (workspace.inputFiles || []).map(decorateArtifactInputFile);
  let prompt = "";
  try {
    prompt = await fs.readFile(workspace.promptPath, "utf8");
  } catch (_error) {
    prompt = "";
  }
  return {
    ...workspace,
    inputFiles,
    outputsDir: pathFromPosix(workspace.workspaceDir, OUTPUTS_DIR_NAME),
    outputMarkdownPath: workspace.outputPath,
    copiedInputs: inputFiles,
    prompt
  };
}

function decorateArtifactInputFile(file = {}) {
  const fileName = file.fileName || file.originalName || file.workspaceFileName || file.workspacePath || "";
  const roleAndName = `${file.role || ""} ${fileName}`.toLowerCase();
  return {
    ...file,
    fileName,
    isSlx: file.isSlx === true || /simulink_slx|\.slx\b/.test(roleAndName),
    isSystemRequirement:
      file.isSystemRequirement === true ||
      file.sourcePriority === "system_requirement" ||
      /system_(pdf|requirement)|extracted_system_requirement|系统需求/.test(roleAndName)
  };
}

export function normalizeMarkdownAgentArtifact(artifact = {}, workspace = {}) {
  const workspaceDir = normalizeString(workspace.workspaceDir);
  const markdownPath = toPosixPath(
    artifact.markdownPath ||
      artifact.outputRelativePath ||
      artifact.outputPath ||
      workspace.outputRelativePath ||
      OUTPUT_MARKDOWN_RELATIVE_PATH
  );
  return {
    workspaceDir,
    manifestPath: workspace.manifestPath || "",
    taskBriefPath: workspace.taskBriefPath || "",
    promptPath: workspace.promptPath || "",
    markdownPath,
    absoluteMarkdownPath: artifact.absoluteMarkdownPath || pathFromPosix(workspaceDir, markdownPath),
    itemCount: Math.max(0, Number(artifact.itemCount || 0) || 0),
    summary: normalizeString(artifact.summary),
    inputFiles: Array.isArray(workspace.inputFiles) ? workspace.inputFiles.map(decorateArtifactInputFile) : [],
    outputRelativePath: markdownPath
  };
}

export function buildGenericSourceRefs(inputFiles = []) {
  const files = Array.isArray(inputFiles) ? inputFiles.map(decorateArtifactInputFile) : [];
  const sourceFiles = files.filter((file) => file.sourcePriority !== "style_reference");
  const effectiveFiles = sourceFiles.length ? sourceFiles : files;
  return effectiveFiles.map((file) => ({
    fileName: file.originalName || file.workspaceFileName || file.workspacePath || "",
    fileRole: file.role || "",
    location: file.workspacePath || "agent workspace input",
    excerpt:
      file.role === "simulink_slx"
        ? "Hermes Agent 在任务工作目录中解析该 SLX 模型，并据此生成软件需求。"
        : "Hermes Agent 在任务工作目录中读取该输入，并据此生成软件需求。"
  }));
}

export function buildResultItemsFromMarkdownBlocks({
  markdown = "",
  outlineItems = [],
  copiedInputs = [],
  inputFiles = [],
  template = {}
} = {}) {
  const parsedItems = parseRequirementMarkdownBlocks(markdown, outlineItems);
  const sourceRefs = buildGenericSourceRefs(copiedInputs.length ? copiedInputs : inputFiles);
  const prefix = normalizeString(template.requirementIdPrefix || "SWR") || "SWR";
  return parsedItems.map((item, index) => ({
    id: randomUUID(),
    requirementId: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    sectionTitle: item.sectionTitle,
    itemTitle: item.itemTitle,
    title: item.title,
    requirementText: item.requirementText,
    type: "functional",
    verificationHint: "基于该条软件需求对应的输入条件、边界和模型输出设计测试用例进行验证。",
    sourceRefs,
    sourceMarkdownItemId: item.sourceMarkdownItemId,
    confidence: 0.86
  }));
}
