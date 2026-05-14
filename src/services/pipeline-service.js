import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { ValidationService } from "./validation-service.js";
import { LlmProfileService } from "./llm-profile-service.js";
import { ModuleSkillService, canonicalizeBootstrapAssetRole } from "./module-skill-service.js";
import { HermesAgentClient } from "./hermes-agent-client.js";
import { SpreadsheetExtractionService } from "./spreadsheet-extraction-service.js";
import { ModelRequirementViewService } from "./model-requirement-view-service.js";
import { SlxModelAnalysisService } from "./slx-model-analysis-service.js";
import { recallSkillInventory, tokenize } from "./software-requirement-agent-shared.js";
import {
  buildOutlineItems,
  buildResultItemsFromMarkdownBlocks,
  normalizeMarkdownAgentArtifact,
  prepareSoftwareRequirementMarkdownWorkspace
} from "./software-requirement-markdown-agent-service.js";
import { writeJson } from "./storage.js";
import { config } from "../config.js";

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function normalizeDocumentExtractionType(value) {
  if (value === "system_requirement") return "system_requirement";
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function getDocumentExtractionTypeLabel(documentType) {
  if (documentType === "system_requirement") return "系统需求";
  if (documentType === "detail_design") return "详细设计";
  if (documentType === "hil_test_case") return "HIL测试用例";
  return "软件需求";
}

function buildExtractionTaskSummary(documentType) {
  return `正在提取${getDocumentExtractionTypeLabel(documentType)}`;
}

function escapeMarkdownTableCell(value = "") {
  return String(value || "").replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function normalizeTextBlock(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function buildHilSpreadsheetMarkdown(moduleName = "", spreadsheetExtraction = null) {
  const files = Array.isArray(spreadsheetExtraction?.files) ? spreadsheetExtraction.files : [];
  const cases = files.flatMap((file, fileIndex) =>
    (file.cases || []).map((item, caseIndex) => ({
      ...item,
      sourceFileName: file.originalName || "",
      sourceSheetName: file.sheetName || "",
      ordinal: `${fileIndex + 1}.${caseIndex + 1}`,
      flatIndex: 0
    }))
  );

  cases.forEach((item, index) => {
    item.flatIndex = index + 1;
  });

  const title = `${String(moduleName || "").trim() || "未命名模块"}-HIL测试用例`;
  const overviewRows = cases
    .map(
      (item) =>
        `| ${item.flatIndex} | ${escapeMarkdownTableCell(item.title || `用例 ${item.flatIndex}`)} | ${escapeMarkdownTableCell(item.id || "-")} |`
    )
    .join("\n");

  const detailBlocks = cases
    .map((item) => {
      const meta = [];
      if (item.id) meta.push(`- 来源ID：\`${item.id}\``);
      if (item.sourceFileName) meta.push(`- 来源文件：\`${item.sourceFileName}\``);
      if (item.sourceSheetName) meta.push(`- 来源工作表：\`${item.sourceSheetName}\``);

      return [
        `### ${item.flatIndex}. ${item.title || `用例 ${item.flatIndex}`}`,
        "",
        ...meta,
        ...(meta.length ? [""] : []),
        "#### Precondition",
        "",
        "```text",
        normalizeTextBlock(item.precondition) || "(empty)",
        "```",
        "",
        "#### Step Description",
        "",
        "```text",
        normalizeTextBlock(item.stepDescription) || "(empty)",
        "```",
        "",
        "#### Expected Result",
        "",
        "```text",
        normalizeTextBlock(item.expectedResult) || "(empty)",
        "```"
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# ${title}`,
    "",
    "## 文档信息",
    "",
    "- 文档类型：HIL测试用例",
    "- 来源：Excel 导出提取整理",
    `- 用例数量：${cases.length}`,
    "",
    "## 用例总览",
    "",
    "| 序号 | Title | 来源ID |",
    "| --- | --- | --- |",
    overviewRows,
    "",
    "## 用例详情",
    "",
    detailBlocks
  ]
    .join("\n")
    .trim();
}

function inferExtractionSourceMode(sourceText = "", imageInputs = [], spreadsheetInputs = []) {
  const hasText = Boolean(String(sourceText || "").trim());
  const hasImages = Array.isArray(imageInputs) && imageInputs.length > 0;
  const hasSpreadsheets = Array.isArray(spreadsheetInputs) && spreadsheetInputs.length > 0;
  const populatedKinds = [hasText, hasImages, hasSpreadsheets].filter(Boolean).length;
  if (populatedKinds > 1) return "mixed";
  if (hasSpreadsheets) return "spreadsheet";
  if (hasImages) return "image";
  return "text";
}

function buildTraces(items) {
  return items.flatMap((requirement) =>
    (requirement.sourceRefs || []).map((sourceRef) => ({
      requirementId: requirement.id,
      requirementCode: requirement.requirementId,
      fileName: sourceRef.fileName,
      location: sourceRef.location,
      excerpt: sourceRef.excerpt
    }))
  );
}

function buildRunningSummary(documentType) {
  if (documentType === "detail_design") return "\u6b63\u5728\u751f\u6210\u8be6\u7ec6\u8bbe\u8ba1";
  if (documentType === "hil_test_case") return "\u6b63\u5728\u751f\u6210 HIL \u7528\u4f8b";
  return "\u6b63\u5728\u751f\u6210\u8f6f\u4ef6\u9700\u6c42";
}

function normalizeTaskIntent(value = "") {
  return String(value || "").trim() === "module_skill_bootstrap" ? "module_skill_bootstrap" : "generation";
}

function isModuleSkillBootstrapTask(options = {}) {
  return normalizeTaskIntent(options.taskIntent) === "module_skill_bootstrap";
}

function buildTaskSummaryForIntent(documentType, taskIntent = "generation") {
  if (normalizeTaskIntent(taskIntent) === "module_skill_bootstrap") {
    if (documentType === "detail_design") return "\u6b63\u5728\u51b7\u542f\u52a8\u8be6\u7ec6\u8bbe\u8ba1 Module Skill";
    if (documentType === "hil_test_case") return "\u6b63\u5728\u51b7\u542f\u52a8 HIL Module Skill";
    return "\u6b63\u5728\u51b7\u542f\u52a8\u8f6f\u4ef6\u9700\u6c42 Module Skill";
  }
  return buildRunningSummary(documentType);
}

export function normalizeManualTitleOutline(value = {}) {
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

  const normalizedSections = [];
  for (const section of Array.isArray(candidate.sections) ? candidate.sections : []) {
    const sectionTitle = String(section?.sectionTitle || section?.title || "").trim();
    if (!sectionTitle) {
      continue;
    }

    const normalizedItems = [];
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const itemTitle = String(item?.itemTitle || item?.title || "").trim();
      if (!itemTitle) {
        continue;
      }
      normalizedItems.push({ itemTitle });
    }

    if (normalizedItems.length) {
      normalizedSections.push({
        sectionTitle,
        items: normalizedItems
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

function flattenManualTitleOutline(value = {}) {
  const normalized = normalizeManualTitleOutline(value);
  if (!normalized) {
    return [];
  }

  return normalized.sections.flatMap((section) =>
    section.items.map((item) => ({
      sectionTitle: section.sectionTitle,
      itemTitle: item.itemTitle
    }))
  );
}

function countEvidence(extractions = []) {
  return extractions.reduce((total, item) => total + (Array.isArray(item.evidence) ? item.evidence.length : 0), 0);
}

function buildSkillInventory(skills = {}) {
  const compiledPack = skills.__compiledSkillPack || {};
  const items = Array.isArray(compiledPack.flatItems) ? compiledPack.flatItems : [];
  return {
    selectedProfiles: Array.isArray(compiledPack.selectedProfiles) ? compiledPack.selectedProfiles : skills.__profiles || [],
    items: items.map((item) => ({
      skillCode: item.skillCode || "",
      layer: item.layer || "",
      profileKey: item.profileKey || "",
      kind: item.kind || "",
      title: item.title || "",
      content: item.content || "",
      order: item.order || 0
    }))
  };
}

function summarizeSkillContent(content = "", limit = 220) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function safeSegment(value = "", fallback = "segment") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function buildSkillTagList(item = {}) {
  return tokenize(`${item.title || ""} ${item.content || ""}`).slice(0, 8);
}

function chunkSkillInventory(items = [], chunkSize = 24) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function buildTaskSkillBundle({
  projectId,
  moduleId,
  taskId,
  effectiveSkillInventory,
  recommendedSkillCodes = []
}) {
  const taskRoot = path.join(config.generationTaskArtifactDir, projectId, moduleId, taskId, "skill-bundle");
  const byKindDir = path.join(taskRoot, "skills", "by-kind");
  const byChunkDir = path.join(taskRoot, "skills", "by-chunk");
  await fs.mkdir(byKindDir, { recursive: true });
  await fs.mkdir(byChunkDir, { recursive: true });

  const inventoryItems = Array.isArray(effectiveSkillInventory?.items) ? effectiveSkillInventory.items : [];
  const manifestItems = [];
  const chunkDescriptors = [];

  const itemsByKind = new Map();
  for (const item of inventoryItems) {
    const kind = String(item.kind || "misc").trim() || "misc";
    if (!itemsByKind.has(kind)) {
      itemsByKind.set(kind, []);
    }
    itemsByKind.get(kind).push(item);
  }

  for (const [kind, kindItems] of itemsByKind.entries()) {
    const kindFilePath = path.join(byKindDir, `${safeSegment(kind, "kind")}.json`);
    await writeJson(kindFilePath, {
      kind,
      itemCount: kindItems.length,
      items: kindItems
    });
    chunkDescriptors.push({
      kind,
      title: `${kind} bundle`,
      path: kindFilePath,
      itemCount: kindItems.length
    });
  }

  const chunkGroups = chunkSkillInventory(inventoryItems, 24);
  for (const [chunkIndex, chunkItems] of chunkGroups.entries()) {
    const chunkFilePath = path.join(byChunkDir, `chunk-${String(chunkIndex + 1).padStart(3, "0")}.json`);
    await writeJson(chunkFilePath, {
      chunkId: `chunk-${chunkIndex + 1}`,
      itemCount: chunkItems.length,
      items: chunkItems
    });
    const chunkDescriptor = {
      chunkId: `chunk-${chunkIndex + 1}`,
      title: `Skill chunk ${chunkIndex + 1}`,
      path: chunkFilePath,
      itemCount: chunkItems.length
    };
    chunkDescriptors.push(chunkDescriptor);

    for (const item of chunkItems) {
      manifestItems.push({
        skillCode: item.skillCode || "",
        kind: item.kind || "",
        layer: item.layer || "",
        profileKey: item.profileKey || "",
        title: item.title || "",
        summary: summarizeSkillContent(item.content || ""),
        tags: buildSkillTagList(item),
        chunkPath: chunkFilePath
      });
    }
  }

  const manifestPath = path.join(taskRoot, "skill-manifest.json");
  await writeJson(manifestPath, {
    taskId,
    projectId,
    moduleId,
    createdAt: new Date().toISOString(),
    effectiveSkillCount: manifestItems.length,
    recommendedSkillCodes,
    chunks: chunkDescriptors,
    items: manifestItems
  });

  return {
    skillBundlePath: taskRoot,
    skillManifestPath: manifestPath,
    recommendedSkillCodes,
    effectiveSkillCount: manifestItems.length,
    chunks: chunkDescriptors
  };
}

function isTaskDeletedError(error) {
  return error?.message === "Task not found";
}

const DEBUG_RAW_RESPONSE_LIMIT = 200000;
const DEBUG_STACK_LIMIT = 40000;

function clipDebugText(text = "", maxLength = DEBUG_RAW_RESPONSE_LIMIT) {
  const normalized = typeof text === "string" ? text : "";
  return {
    text: normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized,
    length: normalized.length,
    truncated: normalized.length > maxLength
  };
}

function logGenerationDebug(event, payload = {}) {
  try {
    console.log(
      `[generation-debug] ${JSON.stringify({
        at: new Date().toISOString(),
        event,
        ...payload
      })}`
    );
  } catch (_error) {
    console.log(`[generation-debug] ${event}`);
  }
}

function assertHermesStepResponse(stepType, response = {}) {
  if (!response || response.status !== "succeeded") {
    throw new Error(`Hermes step failed: ${stepType}`);
  }
  return response.artifact || {};
}

function assertValidExtractions(extractions = []) {
  if (!Array.isArray(extractions)) {
    throw new Error("Hermes material_extract must return an extraction array");
  }
  for (const extraction of extractions) {
    if (!Array.isArray(extraction.evidence)) {
      throw new Error("Hermes extraction is missing evidence array");
    }
    for (const evidence of extraction.evidence) {
      if (!evidence?.fileName || !evidence?.location || !evidence?.excerpt || !evidence?.fileRole) {
        throw new Error("Hermes evidence item is missing required fields");
      }
    }
  }
}

function assertValidRecalledAtoms(items = [], inventory = {}) {
  if (!Array.isArray(items)) {
    throw new Error("Hermes atom_recall must return an item array");
  }
  const allowedCodes = new Set((inventory.items || []).map((item) => item.skillCode).filter(Boolean));
  for (const item of items) {
    if (!item?.skillCode || !allowedCodes.has(item.skillCode)) {
      throw new Error("Hermes recalled an atom outside the effective skill inventory");
    }
    if (!item.matchedReason) {
      throw new Error("Hermes recalled atom is missing matchedReason");
    }
  }
}

function assertValidOutline(outline = {}) {
  if (!outline || !Array.isArray(outline.sections) || !outline.sections.length) {
    throw new Error("Hermes outline_build must return at least one outline section");
  }
}

function assertValidModuleBootstrapAnalysis(analysis = {}) {
  if (!analysis || typeof analysis !== "object") {
    throw new Error("Hermes module_bootstrap_analyze must return an analysis object");
  }
  const summary = String(analysis.summary || "").trim();
  const themes = Array.isArray(analysis.themes) ? analysis.themes : [];
  if (!summary && !themes.length) {
    throw new Error("Hermes module_bootstrap_analyze must return a summary or at least one theme");
  }
  for (const theme of themes) {
    if (!String(theme?.title || "").trim()) {
      throw new Error("Hermes module_bootstrap_analyze theme is missing title");
    }
    if (theme.anchorIds && !Array.isArray(theme.anchorIds)) {
      throw new Error("Hermes module_bootstrap_analyze theme anchorIds must be an array");
    }
  }
}

function assertValidModuleBootstrapKnowledge(knowledge = {}) {
  if (!knowledge || typeof knowledge !== "object") {
    throw new Error("Hermes module_bootstrap_generate must return a knowledge object");
  }
  const hasKnowledgePayload =
    Array.isArray(knowledge.generationPriorities) ||
    Array.isArray(knowledge.examples) ||
    Array.isArray(knowledge.ruleHints) ||
    Array.isArray(knowledge.antiPatterns);
  if (!hasKnowledgePayload) {
    throw new Error("Hermes module_bootstrap_generate must return compatible module knowledge fields");
  }
}

function createModuleSkillInitializationError(details = {}) {
  const error = new Error("Module skill initialization required before generation.");
  error.statusCode = 409;
  error.code = "module_skill_initialization_required";
  error.details = details;
  return error;
}

function buildAssetManifest(inputAssets = [], documentType = "software_requirement") {
  return inputAssets.map((asset) => ({
    assetId: asset.id || "",
    fileName: asset.originalName || asset.storedName || asset.relativePath || "",
    fileRole: canonicalizeBootstrapAssetRole(asset.role || asset.fileRole || "", documentType),
    absolutePath: asset.absolutePath || ""
  }));
}

function isDisallowedFormalSoftwareRequirementAsset(asset = {}) {
  return canonicalizeBootstrapAssetRole(asset.role || asset.fileRole || "", "software_requirement") === "reference_requirement_example";
}

function buildAnchorsFromExtractions(extractions = [], assetManifest = []) {
  const assetById = new Map(assetManifest.map((asset) => [asset.assetId, asset]));
  let anchorIndex = 0;

  return extractions.flatMap((extraction) => {
    const matchedAsset = assetById.get(extraction.fileId) || assetManifest.find((asset) => asset.fileName === extraction.fileName) || null;
    return (extraction.evidence || []).map((evidence) => {
      anchorIndex += 1;
      return {
        anchorId: evidence.id || `anchor-${anchorIndex}`,
        assetId: evidence.fileId || matchedAsset?.assetId || "",
        fileName: evidence.fileName || extraction.fileName || matchedAsset?.fileName || "",
        fileRole: evidence.fileRole || extraction.fileRole || matchedAsset?.fileRole || "",
        location: evidence.location || "",
        anchorType: (evidence.tags || []).includes("requirement-like") ? "requirement_clause" : "asset_excerpt",
        excerpt: evidence.excerpt || "",
        summary: String(evidence.excerpt || "").slice(0, 160),
        tags: Array.isArray(evidence.tags) ? evidence.tags : []
      };
    });
  });
}

function buildAnchorBackedExtractions(anchors = [], assetManifest = []) {
  const grouped = new Map();
  for (const asset of assetManifest) {
    grouped.set(asset.assetId, {
      fileId: asset.assetId,
      fileName: asset.fileName,
      fileRole: asset.fileRole,
      summary: "",
      evidence: []
    });
  }

  for (const anchor of anchors) {
    const key = anchor.assetId || `${anchor.fileName}::${anchor.fileRole}`;
    const existing =
      grouped.get(key) ||
      {
        fileId: anchor.assetId || "",
        fileName: anchor.fileName || "",
        fileRole: anchor.fileRole || "",
        summary: "",
        evidence: []
      };

    existing.summary = existing.summary || anchor.summary || "";
    existing.evidence.push({
      id: anchor.anchorId,
      fileId: anchor.assetId || existing.fileId || "",
      fileName: anchor.fileName || existing.fileName || "",
      fileRole: anchor.fileRole || existing.fileRole || "",
      location: anchor.location || "",
      excerpt: anchor.excerpt || "",
      tags: Array.isArray(anchor.tags) ? anchor.tags : []
    });

    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).filter((item) => item.fileName || item.evidence.length);
}

function buildAnchorsFromModelRequirementView(modelRequirementView = {}, assetManifest = []) {
  const assetById = new Map((Array.isArray(assetManifest) ? assetManifest : []).map((asset) => [asset.assetId, asset]));
  for (const sourceAsset of Array.isArray(modelRequirementView.sourceAssets) ? modelRequirementView.sourceAssets : []) {
    if (sourceAsset?.assetId && !assetById.has(sourceAsset.assetId)) {
      assetById.set(sourceAsset.assetId, sourceAsset);
    }
  }

  return (Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts : [])
    .map((fact, index) => {
      const sourceRef = Array.isArray(fact.sourceRefs) ? fact.sourceRefs[0] || {} : {};
      const matchedAsset =
        assetById.get(sourceRef.assetId) ||
        assetManifest.find((asset) => asset.fileName && asset.fileName === sourceRef.fileName) ||
        assetManifest[0] ||
        {};
      const excerpt = String(fact.behavior || fact.topic || sourceRef.excerpt || "").trim();
      const summary = String(fact.topic || excerpt || fact.id || "").trim();
      return {
        anchorId: sourceRef.sourceAnchorId || fact.id || `model-fact-${index + 1}`,
        assetId: sourceRef.assetId || matchedAsset.assetId || "",
        fileName: sourceRef.fileName || matchedAsset.fileName || "",
        fileRole: sourceRef.fileRole || matchedAsset.fileRole || "simulink_slx",
        location: sourceRef.location || fact.topic || `fact ${index + 1}`,
        anchorType: "model_fact",
        excerpt,
        summary,
        tags: ["model_requirement_fact", fact.topic].filter(Boolean)
      };
    })
    .filter((anchor) => anchor.anchorId && anchor.assetId && anchor.excerpt && anchor.summary);
}

function assertValidAnchors(anchors = [], assetManifest = []) {
  if (!Array.isArray(anchors)) {
    throw new Error("Hermes anchor_index_build must return an anchor array");
  }

  const allowedAssetIds = new Set(assetManifest.map((asset) => asset.assetId).filter(Boolean));
  const seenAnchorIds = new Set();
  for (const anchor of anchors) {
    if (
      !anchor?.anchorId ||
      !anchor?.assetId ||
      !anchor?.fileRole ||
      !anchor?.location ||
      !anchor?.anchorType ||
      !anchor?.excerpt ||
      !anchor?.summary
    ) {
      throw new Error("Hermes anchor item is missing required fields");
    }
    if (!allowedAssetIds.has(anchor.assetId)) {
      throw new Error("Hermes generated an anchor outside the allowed asset manifest");
    }
    if (seenAnchorIds.has(anchor.anchorId)) {
      throw new Error("Hermes generated a duplicate anchorId");
    }
    seenAnchorIds.add(anchor.anchorId);
  }
}

function assertValidResultItems(resultItems = [], anchors = [], modelRequirementView = {}) {
  if (!Array.isArray(resultItems) || !resultItems.length) {
    throw new Error("Hermes content_generate must return at least one result item");
  }
  const anchorIds = new Set(anchors.map((anchor) => anchor.anchorId).filter(Boolean));
  const factIds = new Set((modelRequirementView.facts || []).map((fact) => fact.id).filter(Boolean));

  for (const item of resultItems) {
    const sourceFactIds = Array.isArray(item.sourceFactIds) ? item.sourceFactIds : [];
    const sourceAnchorIds = Array.isArray(item.sourceAnchorIds) ? item.sourceAnchorIds : [];
    if (!String(item?.requirementText || "").trim() || (!sourceFactIds.length && !sourceAnchorIds.length)) {
      throw new Error("Hermes generated result item is missing required fields");
    }
    for (const sourceFactId of sourceFactIds) {
      if (!factIds.has(sourceFactId)) {
        throw new Error("Hermes generated a sourceFactId outside the modelRequirementView fact set");
      }
    }
    for (const sourceAnchorId of sourceAnchorIds) {
      if (!anchorIds.has(sourceAnchorId)) {
        throw new Error("Hermes generated a sourceAnchorId outside the anchor index set");
      }
    }
  }
}

function assertValidExtractedDocument(document = {}, targetDocumentType = "software_requirement") {
  const normalizedTarget = normalizeDocumentExtractionType(targetDocumentType);
  if (!document || typeof document !== "object") {
    throw new Error("Hermes document_extract_generate must return an object");
  }
  if (!String(document.markdown || "").trim()) {
    throw new Error("Hermes document_extract_generate must return markdown content");
  }
  const artifactType = normalizeDocumentExtractionType(document.targetDocumentType);
  if (artifactType !== normalizedTarget) {
    throw new Error("Hermes document_extract_generate returned an unexpected targetDocumentType");
  }
}

function resolveSourceAnchors(resultItems = [], anchors = [], modelRequirementView = {}) {
  const anchorById = new Map(anchors.map((anchor) => [anchor.anchorId, anchor]));
  const factById = new Map((modelRequirementView.facts || []).map((fact) => [fact.id, fact]));
  return resultItems.map((item) => {
    const resolvedFactRefs = (item.sourceFactIds || []).flatMap((sourceFactId) => {
      const fact = factById.get(sourceFactId);
      if (!fact) {
        throw new Error(`无法解析 sourceFactId: ${sourceFactId}`);
      }
      return (fact.sourceRefs || []).map((sourceRef) => ({
        fileName: sourceRef.fileName || "",
        fileRole: sourceRef.fileRole || "",
        location: sourceRef.location || "",
        excerpt: sourceRef.excerpt || fact.behavior || "",
        sourceFactId,
        sourceAnchorId: sourceRef.sourceAnchorId || ""
      }));
    });
    const resolvedAnchorRefs = (item.sourceAnchorIds || []).map((sourceAnchorId) => {
      const anchor = anchorById.get(sourceAnchorId);
      if (!anchor) {
        throw new Error(`无法解析 sourceAnchorId: ${sourceAnchorId}`);
      }
      return {
        fileName: anchor.fileName,
        fileRole: anchor.fileRole,
        location: anchor.location,
        excerpt: anchor.excerpt,
        sourceAnchorId
      };
    });
    const resolvedSourceRefs = [...resolvedFactRefs, ...resolvedAnchorRefs];

    if (!resolvedSourceRefs.length) {
      throw new Error("reference_resolve 未生成任何 sourceRefs");
    }

    return {
      ...item,
      sourceRefs: resolvedSourceRefs
    };
  });
}

function formatElapsedSeconds(elapsedMs = 0) {
  const seconds = Math.max(0, Math.round((Number(elapsedMs || 0) || 0) / 1000));
  return `${seconds} 秒`;
}

function buildHermesStepDescriptor(stepType = "") {
  if (stepType === "module_bootstrap_analyze") {
    return {
      stage: "module_bootstrap_analyze",
      runningLabel: "正在分析模块输入并提炼模块主题",
      actionLabel: "分析模块输入并提炼模块主题",
      runningPercent: 60
    };
  }
  if (stepType === "module_bootstrap_generate") {
    return {
      stage: "module_bootstrap_generate",
      runningLabel: "正在生成模块 Skill",
      actionLabel: "生成模块 Skill",
      runningPercent: 64
    };
  }
  if (stepType === "outline_build") {
    return {
      stage: "outline_build",
      runningLabel: "正在调用 Hermes 读取 Skill 清单并生成提纲",
      actionLabel: "读取 Skill 清单并生成提纲",
      runningPercent: 68
    };
  }
  if (stepType === "content_generate") {
    return {
      stage: "content_generate",
      runningLabel: "正在调用 Hermes 补读 Skill 正文并生成正式内容",
      actionLabel: "补读 Skill 正文并生成正式内容",
      runningPercent: 82
    };
  }
  if (stepType === "software_requirement_markdown_generate") {
    return {
      stage: "software_requirement_markdown_generate",
      runningLabel: "正在调用 Hermes Agent 生成软件需求条目",
      actionLabel: "在任务工作目录中生成软件需求 Markdown 条目",
      runningPercent: 72
    };
  }
  if (stepType === "document_extract_generate") {
    return {
      stage: "document_extract_generate",
      runningLabel: "正在提取文档内容",
      actionLabel: "提取文档内容",
      runningPercent: 68
    };
  }
  if (stepType === "slx_parse_generate") {
    return {
      stage: "slx_parse_generate",
      runningLabel: "正在解析 SLX 模型并生成模型需求视图",
      actionLabel: "解析 SLX 模型并生成模型需求视图",
      runningPercent: 60
    };
  }
  return {
    stage: stepType || "agent_runtime",
    runningLabel: "正在调用本机 Hermes",
    actionLabel: stepType || "agent step",
    runningPercent: 60
  };
}

export function validateModelRequirementView(mrv = {}) {
  if (!mrv || typeof mrv !== "object") {
    throw new Error("modelRequirementView 必须是非空对象");
  }
  if (!mrv.version) {
    throw new Error("modelRequirementView.version 必须存在");
  }
  if (!Array.isArray(mrv.facts) || !mrv.facts.length) {
    throw new Error("modelRequirementView.facts 必须是非空数组");
  }
  for (const [index, fact] of mrv.facts.entries()) {
    if (!fact.id) {
      throw new Error(`modelRequirementView.facts[${index}] 必须有 id`);
    }
    if (!fact.behavior) {
      throw new Error(`modelRequirementView.facts[${index}] 必须有 behavior`);
    }
    if (!Array.isArray(fact.sourceRefs) || !fact.sourceRefs.length) {
      throw new Error(`modelRequirementView.facts[${index}].sourceRefs 必须是非空数组`);
    }
    for (const [refIndex, ref] of fact.sourceRefs.entries()) {
      if (!ref.fileName && !ref.fileRole) {
        throw new Error(`modelRequirementView.facts[${index}].sourceRefs[${refIndex}] 至少包含 fileName 或 fileRole`);
      }
      if (!ref.location && !ref.excerpt) {
        throw new Error(`modelRequirementView.facts[${index}].sourceRefs[${refIndex}] 至少包含 location 或 excerpt`);
      }
    }
  }
}

export class PipelineService {
  constructor(projectService, options = {}) {
    this.projectService = projectService;
    this.hermesTaskQueueService = options.hermesTaskQueueService || null;
    this.skillLoader = new SkillLoader();
    this.templateService = new TemplateService();
    this.extractionService = new ExtractionService();
    this.llmService = new LlmService();
    this.validationService = new ValidationService();
    this.skillBundleService = new SkillBundleService();
    this.llmProfileService = new LlmProfileService();
    this.moduleSkillService = new ModuleSkillService();
    this.spreadsheetExtractionService = new SpreadsheetExtractionService();
    this.modelRequirementViewService = new ModelRequirementViewService();
    this.slxModelAnalysisService = options.slxModelAnalysisService || new SlxModelAnalysisService();
    this.hermesAgentClient = new HermesAgentClient();
  }

  async getMeta() {
    const [skills, template, llmMeta, llmConfigured] = await Promise.all([
      this.skillLoader.loadAll(),
      this.templateService.getTemplate(),
      this.llmProfileService.getMeta(),
      this.llmService.hasAvailableProfile()
    ]);

    return {
      template,
      skills: Object.keys(skills),
      llmConfigured,
      llm: llmMeta
    };
  }

  async finalizeSoftwareRequirementGeneration({
    projectId,
    moduleId,
    taskId,
    project,
    module,
    inputAssets,
    options = {},
    selectedProfile,
    updateTaskProgress
  }) {
    const contextProject = {
      name: `${project.name} / ${module.name}`,
      description: module.description || project.description,
      language: project.language,
      documentType: "software_requirement",
      domain: module.domain || "embedded_vcu",
      moduleSkillKey: module.moduleSkillKey || ""
    };
    const hermesExecutionMode =
      this.hermesAgentClient.transport === "cli" ? "hermes_agent_cli" : "hermes_agent_api";
    const hermesEndpoint =
      this.hermesAgentClient.transport === "cli" ? this.hermesAgentClient.command : this.hermesAgentClient.baseURL;
    const llmProfile = selectedProfile
      ? {
          id: selectedProfile.id,
          provider: this.hermesAgentClient.transport === "cli" ? "hermes_cli" : selectedProfile.provider,
          name: this.hermesAgentClient.transport === "cli" ? "Installed Hermes CLI" : selectedProfile.name,
          model: this.hermesAgentClient.transport === "cli" ? "configured-in-hermes" : selectedProfile.model,
          baseURL: this.hermesAgentClient.transport === "cli" ? "" : selectedProfile.baseURL,
          executionMode: hermesExecutionMode,
          agentEndpoint: hermesEndpoint
        }
      : {
          id: "",
          provider: this.hermesAgentClient.transport === "cli" ? "hermes_cli" : "local_fallback",
          name: this.hermesAgentClient.transport === "cli" ? "Installed Hermes CLI" : "Hermes 本地回退",
          model: this.hermesAgentClient.transport === "cli" ? "configured-in-hermes" : "",
          baseURL: "",
          executionMode: hermesExecutionMode,
          agentEndpoint: hermesEndpoint
        };

    const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
    const loadSoftwareRequirementSkills = async () => {
      try {
        return await this.skillLoader.loadFromRegistryContext(
          {
            documentType: "software_requirement",
            domain: module.domain || "embedded_vcu",
            moduleSkillKey: module.moduleSkillKey || ""
          },
          skillDir
        );
      } catch (_error) {
        return this.skillLoader.loadForContext(
          {
            documentType: "software_requirement",
            domain: module.domain || "embedded_vcu",
            moduleSkillKey: module.moduleSkillKey || ""
          },
          skillDir
        );
      }
    };
    let composedSkills = await loadSoftwareRequirementSkills();

    const template = await this.templateService.getTemplate("software_requirement");
    let domainKnowledge = composedSkills["domain-knowledge.json"] || {};
    let effectiveSkillInventory = buildSkillInventory(composedSkills);
    const assetManifest = buildAssetManifest(inputAssets, "software_requirement");
    let taskSkillBundle = await buildTaskSkillBundle({
      projectId,
      moduleId,
      taskId,
      effectiveSkillInventory,
      recommendedSkillCodes: []
    });
    const isBootstrapTask = isModuleSkillBootstrapTask(options);
    const requiredTitleOutline = isBootstrapTask ? null : normalizeManualTitleOutline(options.manualTitleOutline);
    const requiredOutlineItems = requiredTitleOutline ? buildOutlineItems(requiredTitleOutline) : [];
    const requiredLeafOutline = requiredOutlineItems.map((item) => ({
      sectionTitle: item.sectionTitle,
      itemTitle: item.itemTitle
    }));
    const requiredLeafCount = requiredOutlineItems.length;
    if (!isBootstrapTask && (!requiredTitleOutline || !requiredLeafCount)) {
      throw new Error("manualTitleOutline is required for software requirement generation");
    }
    const readiness = await this.moduleSkillService.inspectModule(project, module, "software_requirement", skillDir);

    await updateTaskProgress(
      {
        stage: "task_init",
        label: "正在初始化任务上下文",
        message: `已锁定 ${assetManifest.length} 个输入资产，并生成本次任务的 asset manifest 与 task skill bundle。`,
        percent: 16,
        current: assetManifest.length,
        total: assetManifest.length
      },
      {
        debug: {
          artifacts: {
            assetManifest,
            taskSkillBundle,
            requiredTitleOutline,
            requiredOutlineItems
          }
        },
        timelineEntry: {
          stage: "task_init",
          label: "资产清单已准备",
          message: `asset manifest 与 task skill bundle 已生成，共 ${assetManifest.length} 个输入资产。`,
          level: "info"
        }
      }
    );

    await updateTaskProgress(
      {
        stage: "effective_skill_resolve",
        label: "正在解析生效技能",
        message: `已命中 ${effectiveSkillInventory.selectedProfiles.length || 0} 层 profile，已解析 ${effectiveSkillInventory.items.length} 条有效 skill 并生成本次任务 skill 包。`,
        percent: 22
      },
      {
        debug: {
          artifacts: {
            taskSkillBundle
          }
        },
        timelineEntry: {
          stage: "effective_skill_resolve",
          label: "解析生效技能",
          message: `已完成 software_requirement skill inventory 解析，并生成 task skill bundle，命中 ${effectiveSkillInventory.items.length} 条 atom。`,
          level: "info"
        }
      }
    );

    if (readiness.requiresExplicitBootstrap && !isModuleSkillBootstrapTask(options)) {
      const error = createModuleSkillInitializationError(readiness);
      error.code = "module_skill_bootstrap_required";
      error.message = "This module requires an explicit module skill bootstrap before generation.";
      throw error;
    }

    if (!readiness.hasUsableModuleSkill && readiness.missingBootstrapAssets.length) {
      throw createModuleSkillInitializationError(readiness);
    }

    if (!effectiveSkillInventory.items.length) {
      throw new Error("当前 software_requirement skill inventory 为空，无法继续执行 Hermes 生成链路");
    }

    const runHermesStep = async (stepType, inputArtifact) => {
      const descriptor = buildHermesStepDescriptor(stepType);
      const startedAt = new Date().toISOString();
      await updateTaskProgress(
        {
          stage: descriptor.stage,
          label: descriptor.runningLabel,
          message: `已启动 ${this.hermesAgentClient.transport === "cli" ? "本机 Hermes CLI" : "Hermes API"}，等待返回 ${descriptor.actionLabel} 结果。`,
          percent: descriptor.runningPercent,
          current: inputAssets.length,
          total: inputAssets.length
        },
        {
          timelineEntry: {
            stage: descriptor.stage,
            label: descriptor.runningLabel,
            message: `已开始调用 ${this.hermesAgentClient.transport === "cli" ? "本机 Hermes CLI" : "Hermes API"} 执行 ${descriptor.actionLabel}。`,
            level: "info"
          },
          debug: {
            agent: {
              transport: this.hermesAgentClient.transport,
              currentStep: stepType,
              status: "running",
              startedAt,
              lastEventAt: startedAt,
              elapsedMs: 0
            }
          }
        }
      );

      const response = await this.hermesAgentClient.executeStep(
        {
          taskId,
          stepType,
          skillBundlePath: taskSkillBundle.skillManifestPath,
          recommendedSkillCodes: taskSkillBundle.recommendedSkillCodes,
          allowedPaths: Array.isArray(inputArtifact?.assets)
            ? [
                ...inputArtifact.assets.map((asset) => asset.absolutePath).filter(Boolean),
                taskSkillBundle.skillBundlePath,
                taskSkillBundle.skillManifestPath,
                ...taskSkillBundle.chunks.map((chunk) => chunk.path).filter(Boolean)
              ]
            : inputArtifact?.workspaceDir
              ? [
                  inputArtifact.workspaceDir,
                  taskSkillBundle.skillBundlePath,
                  taskSkillBundle.skillManifestPath,
                  ...taskSkillBundle.chunks.map((chunk) => chunk.path).filter(Boolean)
                ]
            : [
                ...assetManifest.map((asset) => asset.absolutePath).filter(Boolean),
                taskSkillBundle.skillBundlePath,
                taskSkillBundle.skillManifestPath,
                ...taskSkillBundle.chunks.map((chunk) => chunk.path).filter(Boolean)
              ],
          workdir: inputArtifact?.workspaceDir || "",
          inputArtifact: {
            ...inputArtifact,
            skillBundle: taskSkillBundle
          },
          skillInventory: effectiveSkillInventory,
          llmProfileSnapshot: llmProfile
        },
        {
          onEvent: async (event = {}) => {
            const status = String(event.status || "").trim();
            const eventAt = event.at || new Date().toISOString();
            const debugUpdate = {
              agent: {
                transport: event.transport || this.hermesAgentClient.transport,
                currentStep: event.stepType || stepType,
                status: status || "running",
                startedAt: event.startedAt || startedAt,
                lastHeartbeatAt: event.heartbeatAt || "",
                lastEventAt: eventAt,
                sessionId: event.sessionId || "",
                tokenUsage: event.tokenUsage || null,
                stdoutExcerpt: event.stdoutExcerpt || "",
                stderrExcerpt: event.stderrExcerpt || "",
                elapsedMs: Number(event.elapsedMs || 0) || 0
              }
            };
            const debugEvent = {
              stage: descriptor.stage,
              label: event.label || descriptor.runningLabel,
              message: event.message || `${descriptor.actionLabel} 状态已更新。`,
              level: event.level || (status === "failed" ? "error" : "info"),
              type: event.type || "agent_runtime",
              status,
              transport: event.transport || this.hermesAgentClient.transport,
              stepType: event.stepType || stepType,
              sessionId: event.sessionId || "",
              startedAt: event.startedAt || startedAt,
              heartbeatAt: event.heartbeatAt || "",
              elapsedMs: Number(event.elapsedMs || 0) || 0,
              tokenUsage: event.tokenUsage || null,
              stdoutExcerpt: event.stdoutExcerpt || "",
              stderrExcerpt: event.stderrExcerpt || ""
            };

            const runningMessage =
              status === "heartbeat"
                ? `${descriptor.runningLabel}，已运行 ${formatElapsedSeconds(event.elapsedMs || 0)}，最近一次心跳已写入运行日志。`
                : status === "started"
                  ? `已启动 ${this.hermesAgentClient.transport === "cli" ? "本机 Hermes CLI" : "Hermes API"}，等待返回 ${descriptor.actionLabel} 结果。`
                  : null;

            if (status === "failed") {
              await updateTaskProgress(
                {
                  stage: "failed",
                  label: "任务执行失败",
                  message: event.message || `${descriptor.actionLabel} 失败`,
                  percent: 100
                },
                {
                  status: "failed",
                  errorMessage: event.message || `${descriptor.actionLabel} 失败`,
                  summary: event.message || `${descriptor.actionLabel} 失败`,
                  debug: debugUpdate,
                  debugEvent,
                  timelineEntry: {
                    stage: "failed",
                    label: event.label || "任务失败",
                    message: event.message || `${descriptor.actionLabel} 失败`,
                    level: event.level || "error"
                  }
                }
              );
              return;
            }

            if (runningMessage) {
              await updateTaskProgress(
                {
                  stage: descriptor.stage,
                  label: descriptor.runningLabel,
                  message: runningMessage,
                  percent: descriptor.runningPercent,
                  current: inputAssets.length,
                  total: inputAssets.length
                },
                {
                  debug: debugUpdate,
                  debugEvent
                }
              );
              return;
            }

            await updateTaskProgress(
              {},
              {
                debug: debugUpdate,
                debugEvent
              }
            );
          }
        }
      );

      return assertHermesStepResponse(stepType, response);
    };

    if (!isBootstrapTask && readiness.hasUsableModuleSkill && this.hermesAgentClient.transport === "cli" && inputAssets.length) {
      await updateTaskProgress(
        {
          stage: "agent_workspace_prepare",
          label: "正在准备 Hermes Agent 工作目录",
          message: "正在复制输入资产并生成本次任务的 manifest、brief 与 prompt。",
          percent: 30,
          current: inputAssets.length,
          total: inputAssets.length
        },
        {
          timelineEntry: {
            stage: "agent_workspace_prepare",
            label: "准备 Agent 工作目录",
            message: "开始创建软件需求生成专用工作目录。",
            level: "info"
          }
        }
      );

      const markdownWorkspace = await prepareSoftwareRequirementMarkdownWorkspace({
        projectId,
        moduleId,
        taskId,
        project,
        module,
        inputAssets,
        manualTitleOutline: requiredTitleOutline
      });

      await updateTaskProgress(
        {
          stage: "agent_workspace_prepare",
          label: "Hermes Agent 工作目录已准备",
          message: `已准备 ${markdownWorkspace.copiedInputs.length} 个输入文件和 ${markdownWorkspace.outlineItems.length} 个目标条目。`,
          percent: 38,
          current: markdownWorkspace.copiedInputs.length,
          total: markdownWorkspace.copiedInputs.length
        },
        {
          generationMode: "agent_workspace_markdown",
          resultMarkdownArtifact: normalizeMarkdownAgentArtifact({}, markdownWorkspace),
          timelineEntry: {
            stage: "agent_workspace_prepare",
            label: "工作目录已准备",
            message: `已写入 manifest、task brief 和 prompt，等待 Hermes Agent 生成 Markdown 条目。`,
            level: "info"
          }
        }
      );

      const markdownArtifactResponse = await runHermesStep("software_requirement_markdown_generate", {
        workspaceDir: markdownWorkspace.workspaceDir,
        manifestPath: markdownWorkspace.manifestPath,
        taskBriefPath: markdownWorkspace.taskBriefPath,
        promptPath: markdownWorkspace.promptPath,
        outputRelativePath: markdownWorkspace.outputRelativePath,
        prompt: markdownWorkspace.prompt,
        outlineItems: markdownWorkspace.outlineItems
      });
      const markdownArtifact = normalizeMarkdownAgentArtifact(markdownArtifactResponse, markdownWorkspace);
      if (markdownArtifact.itemCount && markdownArtifact.itemCount !== requiredLeafCount) {
        throw new Error(`Hermes Markdown 结果条目数不匹配：期望 ${requiredLeafCount} 条，实际 ${markdownArtifact.itemCount} 条`);
      }

      const resultMarkdown = await fs.readFile(markdownArtifact.absoluteMarkdownPath, "utf8");
      const resultItems = buildResultItemsFromMarkdownBlocks({
        markdown: resultMarkdown,
        outlineItems: markdownWorkspace.outlineItems,
        copiedInputs: markdownWorkspace.copiedInputs,
        template
      });

      if (resultItems.length !== requiredLeafCount) {
        throw new Error(`Markdown 解析结果条目数不匹配：期望 ${requiredLeafCount} 条，实际 ${resultItems.length} 条`);
      }

      await updateTaskProgress(
        {
          stage: "content_postprocess",
          label: "正在解析 Markdown 生成条目",
          message: `Hermes Agent 已返回 Markdown，正在解析 ${resultItems.length} 个 requirement-item block。`,
          percent: 84
        },
        {
          resultMarkdown,
          resultMarkdownArtifact: markdownArtifact,
          debug: {
            postProcess: {
              lastStage: "markdown_agent_returned"
            }
          },
          debugEvent: {
            stage: "markdown_agent_returned",
            label: "Markdown 产物已返回",
            message: `已读取 ${markdownArtifact.markdownPath}，准备进行条目解析和规则校验。`,
            level: "info"
          }
        }
      );

      const conflicts = this.validationService.validate(resultItems, { domainKnowledge, documentType: "software_requirement" });
      const traces = buildTraces(resultItems);

      await updateTaskProgress(
        {
          stage: "rule_validate",
          label: "正在校验生成结果",
          message: `规则校验完成，识别到 ${conflicts.length} 个冲突，准备保存任务结果。`,
          percent: 92
        },
        {
          metrics: {
            extractionFileCount: inputAssets.length,
            extractionEvidenceCount: traces.length,
            generatedItemCount: resultItems.length,
            conflictCount: conflicts.length
          },
          timelineEntry: {
            stage: "rule_validate",
            label: "规则校验",
            message: `已完成 Markdown 条目校验，得到 ${traces.length} 条追溯信息和 ${conflicts.length} 个冲突。`,
            level: "info"
          }
        }
      );

      const updatedTask = await this.projectService.updateGenerationTask(projectId, moduleId, "software_requirement", taskId, {
        status: "completed",
        generationMode: "agent_workspace_markdown",
        resultMarkdown,
        resultMarkdownArtifact: markdownArtifact,
        resultItems,
        extractions: [],
        traces,
        conflicts,
        llmProfile,
        metrics: {
          extractionFileCount: inputAssets.length,
          extractionEvidenceCount: traces.length,
          generatedItemCount: resultItems.length,
          conflictCount: conflicts.length
        },
        progress: {
          stage: "completed",
          label: "任务已完成",
          message: `Hermes Agent 已生成 ${resultItems.length} 条软件需求，可开始审核。`,
          percent: 100
        },
        timelineEntry: {
          stage: "persist_result",
          label: "保存结果",
          message: "任务结果、条目卡片和原始 Markdown 产物信息已写入模块工作区。",
          level: "info"
        },
        summary: `通过 Hermes Agent 工作目录模式生成 ${resultItems.length} 条软件需求`
      });

      return {
        projectId,
        moduleId,
        documentType: "software_requirement",
        task: updatedTask
      };
    }

    const extractionInputAssets = inputAssets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      fileRole: asset.role,
      originalName: asset.originalName,
      absolutePath: asset.absolutePath,
      relativePath: asset.relativePath,
      storedName: asset.storedName,
      mimeType: asset.mimeType,
      size: asset.size
    }));
    const slxExtractionAssets = extractionInputAssets.filter((asset) => asset.role === "simulink_slx" || asset.fileRole === "simulink_slx");
    const slxAssetIds = new Set(slxExtractionAssets.map((asset) => asset.id).filter(Boolean));

    let extractions = [];
    let modelRequirementExtractions = [];
    let anchors = [];
    let remoteModelRequirementViews = [];
    if (this.hermesAgentClient.transport === "cli") {
      extractions = await this.extractionService.extractFiles(
        { files: extractionInputAssets },
        { allowStoredNameFallback: true }
      );
      modelRequirementExtractions = extractions;
      anchors = buildAnchorsFromExtractions(extractions, assetManifest);
    } else {
      const hermesAnchorAssets = assetManifest.filter((asset) => !slxAssetIds.has(asset.assetId));
      let slxAnchors = [];
      let slxExtractions = [];
      if (slxExtractionAssets.length) {
        await updateTaskProgress(
          {
            stage: "slx_parse_generate",
            label: "正在解析 Simulink 模型",
            message: `正在通过 MATLAB MCP 解析 ${slxExtractionAssets.length} 个 SLX 模型资产。`,
            percent: 30,
            current: 0,
            total: slxExtractionAssets.length
          },
          {
            timelineEntry: {
              stage: "slx_parse_generate",
              label: "解析 Simulink 模型",
              message: `开始通过 MATLAB MCP 解析 ${slxExtractionAssets.length} 个 SLX 模型资产。`,
              level: "info"
            }
          }
        );
        const slxParseArtifact = assertHermesStepResponse(
          "slx_parse_generate",
          await this.hermesAgentClient.executeStep({
            taskId,
            stepType: "slx_parse_generate",
            allowedPaths: slxExtractionAssets.map((asset) => asset.absolutePath).filter(Boolean),
            inputArtifact: {
              project: contextProject,
              slxFiles: slxExtractionAssets
            },
            skillInventory: effectiveSkillInventory,
            llmProfileSnapshot: llmProfile
          })
        );
        validateModelRequirementView(slxParseArtifact.modelRequirementView);
        remoteModelRequirementViews = [...remoteModelRequirementViews, slxParseArtifact.modelRequirementView];
        slxAnchors = buildAnchorsFromModelRequirementView(slxParseArtifact.modelRequirementView, assetManifest);
        slxExtractions = buildAnchorBackedExtractions(slxAnchors, assetManifest);
        await updateTaskProgress(
          {
            stage: "slx_parse_generate",
            label: "Simulink 模型解析完成",
            message: `已从 SLX 模型提取 ${slxAnchors.length} 个模型事实锚点。`,
            percent: 36,
            current: slxExtractionAssets.length,
            total: slxExtractionAssets.length
          },
          {
            timelineEntry: {
              stage: "slx_parse_generate",
              label: "Simulink 模型解析完成",
              message: `SLX 模型解析完成，共得到 ${slxAnchors.length} 个模型事实锚点。`,
              level: "info"
            }
          }
        );
      }

      let hermesAnchors = [];
      if (hermesAnchorAssets.length) {
        const anchorArtifact = assertHermesStepResponse(
          "anchor_index_build",
          await this.hermesAgentClient.executeStep({
            taskId,
            stepType: "anchor_index_build",
            allowedPaths: hermesAnchorAssets.map((asset) => asset.absolutePath).filter(Boolean),
            inputArtifact: {
              assets: hermesAnchorAssets
            },
            skillInventory: effectiveSkillInventory,
            llmProfileSnapshot: llmProfile
          })
        );
        hermesAnchors = Array.isArray(anchorArtifact.anchors) ? anchorArtifact.anchors : [];
      }
      anchors = [...hermesAnchors, ...slxAnchors];
      modelRequirementExtractions = [...buildAnchorBackedExtractions(hermesAnchors, assetManifest), ...slxExtractions];
    }
    assertValidAnchors(anchors, assetManifest);
    extractions = buildAnchorBackedExtractions(anchors, assetManifest);
    assertValidExtractions(extractions);
    const modelRequirementView = this.modelRequirementViewService.build({
      project: contextProject,
      assets: assetManifest,
      extractions: modelRequirementExtractions.length ? modelRequirementExtractions : extractions,
      anchors
    });

    const preloadedViews = [
      ...remoteModelRequirementViews,
      ...(Array.isArray(options.preloadedModelRequirementViews) ? options.preloadedModelRequirementViews : [])
    ];
    if (preloadedViews.length) {
      const existingFactIds = new Set((modelRequirementView.facts || []).map((f) => f.id));
      const mergedFacts = [...(modelRequirementView.facts || [])];
      const mergedSourceAssets = [...(modelRequirementView.sourceAssets || [])];
      for (const pView of preloadedViews) {
        for (const fact of (pView.facts || [])) {
          if (!existingFactIds.has(fact.id)) {
            mergedFacts.push(fact);
            existingFactIds.add(fact.id);
          }
        }
        for (const srcAsset of (pView.sourceAssets || [])) {
          if (!mergedSourceAssets.some((sa) => sa.assetId === srcAsset.assetId)) {
            mergedSourceAssets.push(srcAsset);
          }
        }
      }
      modelRequirementView.facts = mergedFacts;
      modelRequirementView.sourceAssets = mergedSourceAssets;
    }

    await updateTaskProgress(
      {
        stage: "anchor_index_build",
        label: "正在构建引用锚点",
        message:
          this.hermesAgentClient.transport === "cli"
            ? `后端本地已基于 ${inputAssets.length} 个输入文件构建 ${anchors.length} 个引用锚点。`
            : `Hermes 已完成 ${inputAssets.length} 个输入文件的锚点构建，共得到 ${anchors.length} 个引用锚点。`,
        percent: 42,
        current: inputAssets.length,
        total: inputAssets.length
      },
      {
        metrics: {
          extractionFileCount: inputAssets.length,
          extractionEvidenceCount: anchors.length
        },
        debug: {
          artifacts: {
            anchors,
            modelRequirementView
          }
        },
        timelineEntry: {
          stage: "anchor_index_build",
          label: "构建引用锚点",
          message: `已完成锚点构建，得到 ${anchors.length} 条结构化 anchor。`,
          level: "info"
        }
      }
    );

    let recalledAtoms = recallSkillInventory(effectiveSkillInventory, anchors);
    assertValidRecalledAtoms(recalledAtoms, effectiveSkillInventory);
    taskSkillBundle = {
      ...taskSkillBundle,
      recommendedSkillCodes: recalledAtoms.map((item) => item.skillCode).filter(Boolean)
    };
    await writeJson(taskSkillBundle.skillManifestPath, {
      ...(JSON.parse(await fs.readFile(taskSkillBundle.skillManifestPath, "utf8"))),
      recommendedSkillCodes: taskSkillBundle.recommendedSkillCodes
    });

    await updateTaskProgress(
      {
        stage: "atom_recall",
        label: "正在生成推荐技能短名单",
        message: `后端已基于 anchor 摘要与有效 skill inventory 生成 ${recalledAtoms.length} 条推荐 skill shortlist。`,
        percent: 56
      },
      {
        debug: {
          artifacts: {
            taskSkillBundle
          }
        },
        timelineEntry: {
          stage: "atom_recall",
          label: "生成推荐技能短名单",
          message: `已生成推荐 skill shortlist，共 ${recalledAtoms.length} 条候选 atom。`,
          level: "info"
        }
      }
    );

    if (!readiness.hasUsableModuleSkill) {
      await updateTaskProgress(
        {
          stage: "module_bootstrap",
          label: "正在提炼模块 Skill",
          message: "当前文档类型缺少 module skill，正在通过 Hermes 冷启动提炼模块级写作能力。",
          percent: 58
        },
        {
          timelineEntry: {
            stage: "module_bootstrap",
            label: "开始模块冷启动",
            message: "将先通过 Hermes 提炼当前文档类型的 module skill，再继续正式软件需求生成。",
            level: "info"
          }
        }
      );

      const moduleBootstrapAnalysis = await runHermesStep("module_bootstrap_analyze", {
        project: contextProject,
        assets: assetManifest,
        anchors,
        recalledAtoms
      });
      assertValidModuleBootstrapAnalysis(moduleBootstrapAnalysis);

      await updateTaskProgress(
        {
          stage: "module_bootstrap_analyze",
          label: "正在分析模块输入并提炼模块主题",
          message: `Hermes 已完成模块冷启动分析，识别 ${moduleBootstrapAnalysis.themes?.length || 0} 个核心主题。`,
          percent: 62
        },
        {
          debug: {
            artifacts: {
              moduleBootstrapAnalysis
            }
          },
          timelineEntry: {
            stage: "module_bootstrap_analyze",
            label: "完成模块冷启动分析",
            message: "Hermes 已输出模块主题、写作焦点和注意事项。",
            level: "info"
          }
        }
      );

      const moduleBootstrapKnowledge = await runHermesStep("module_bootstrap_generate", {
        project: contextProject,
        assets: assetManifest,
        anchors,
        recalledAtoms,
        analysis: moduleBootstrapAnalysis
      });
      assertValidModuleBootstrapKnowledge(moduleBootstrapKnowledge);

      await updateTaskProgress(
        {
          stage: "module_bootstrap_generate",
          label: "正在生成模块 Skill",
          message: "Hermes 已生成兼容现有 skill 库格式的 module knowledge，正在准备写入。",
          percent: 65
        },
        {
          debug: {
            artifacts: {
              moduleBootstrapAnalysis,
              moduleBootstrapKnowledge
            }
          },
          timelineEntry: {
            stage: "module_bootstrap_generate",
            label: "生成模块 Skill",
            message: "Hermes 已输出当前文档类型的 module skill 知识包。",
            level: "info"
          }
        }
      );

      await updateTaskProgress(
        {
          stage: "module_profile_persist",
          label: "正在写入模块 Skill",
          message: "正在把 Hermes 冷启动结果写回 module skill 库，并刷新本次任务 skill 包。",
          percent: 67
        },
        {
          timelineEntry: {
            stage: "module_profile_persist",
            label: "写入模块 Skill",
            message: "正在持久化当前文档类型的 module skill，并刷新正式生成所需的 skill bundle。",
            level: "info"
          }
        }
      );

      await this.moduleSkillService.persistBootstrappedKnowledge(module, "software_requirement", moduleBootstrapKnowledge, skillDir);
      await this.projectService.updateModuleSkillState(projectId, moduleId, {
        skillStatus: "bootstrapped",
        skillSource: {
          type: "bootstrap",
          documentType: "software_requirement",
          strategy: "hermes_agent",
          llmProfileName: llmProfile.name || ""
        },
        seededAt: new Date().toISOString()
      });

      composedSkills = await loadSoftwareRequirementSkills();
      domainKnowledge = composedSkills["domain-knowledge.json"] || {};
      effectiveSkillInventory = buildSkillInventory(composedSkills);
      if (!effectiveSkillInventory.items.length) {
        throw new Error("模块冷启动完成后，software_requirement skill inventory 仍为空，无法继续执行 Hermes 生成链路");
      }

      taskSkillBundle = await buildTaskSkillBundle({
        projectId,
        moduleId,
        taskId,
        effectiveSkillInventory,
        recommendedSkillCodes: []
      });
      recalledAtoms = recallSkillInventory(effectiveSkillInventory, anchors);
      assertValidRecalledAtoms(recalledAtoms, effectiveSkillInventory);
      taskSkillBundle = {
        ...taskSkillBundle,
        recommendedSkillCodes: recalledAtoms.map((item) => item.skillCode).filter(Boolean)
      };
      await writeJson(taskSkillBundle.skillManifestPath, {
        ...(JSON.parse(await fs.readFile(taskSkillBundle.skillManifestPath, "utf8"))),
        recommendedSkillCodes: taskSkillBundle.recommendedSkillCodes
      });

      await updateTaskProgress(
        {},
        {
          debug: {
            artifacts: {
              moduleBootstrapAnalysis,
              moduleBootstrapKnowledge,
              taskSkillBundle
            }
          }
        }
      );
    }

    if (isModuleSkillBootstrapTask(options)) {
      const bootstrapSummary = readiness.hasUsableModuleSkill
        ? "当前模块的 software_requirement module skill 已就绪，无需重复冷启动。"
        : "Hermes 已完成 software_requirement module skill 冷启动，可返回继续生成正式软件需求。";
      const completedBootstrapTask = await this.projectService.updateGenerationTask(projectId, moduleId, "software_requirement", taskId, {
        status: "completed",
        resultItems: [],
        extractions,
        llmProfile,
        metrics: {
          extractionFileCount: inputAssets.length,
          extractionEvidenceCount: anchors.length,
          generatedItemCount: 0,
          conflictCount: 0
        },
        progress: {
          stage: "completed",
          label: "技能冷启动已完成",
          message: bootstrapSummary,
          percent: 100
        },
        timelineEntry: {
          stage: "completed",
          label: "技能冷启动已完成",
          message: bootstrapSummary,
          level: "info"
        },
        summary: "软件需求 Module Skill 冷启动已完成"
      });

      return {
        projectId,
        moduleId,
        documentType: "software_requirement",
        task: completedBootstrapTask
      };
    }

    const generationModelRequirementView = this.modelRequirementViewService.buildCompactForGeneration(modelRequirementView, {
      anchors,
      assets: assetManifest,
      requiredTitleOutline,
      maxFacts: config.hermes?.maxModelRequirementFacts || undefined,
      maxBytes: config.hermes?.maxModelRequirementBytes || undefined
    });

    await updateTaskProgress(
      {},
      {
        debug: {
          artifacts: {
            generationModelRequirementView
          }
        }
      }
    );

    const contentArtifact = await runHermesStep("content_generate", {
      project: contextProject,
      template,
      assets: assetManifest,
      anchors,
      recalledAtoms,
      modelRequirementView: generationModelRequirementView,
      requiredTitleOutline,
      requiredLeafCount
    });
    const resultItems = Array.isArray(contentArtifact.items) ? contentArtifact.items : [];
    if (resultItems.length !== requiredLeafCount) {
      throw new Error(
        `Hermes content_generate must return exactly ${requiredLeafCount} result items, received ${resultItems.length}`
      );
    }
    const titledResultItems = resultItems.map((item, index) => {
      const leaf = requiredLeafOutline[index];
      return {
        ...item,
        id: item.id || randomUUID(),
        sectionTitle: leaf.sectionTitle,
        itemTitle: leaf.itemTitle,
        title: leaf.itemTitle
      };
    });

    await updateTaskProgress(
      {
        stage: "content_postprocess",
        label: "正在校验 Hermes 返回内容",
        message: `Hermes 已返回 ${titledResultItems.length} 条正文，正在校验 sourceFactIds/sourceAnchorIds 与结果结构。`,
        percent: 84
      },
      {
        debug: {
          postProcess: {
            lastStage: "content_generate_returned"
          }
        },
        debugEvent: {
          stage: "content_generate_returned",
          label: "Hermes 已返回结果",
          message: `已收到 ${titledResultItems.length} 条候选软件需求正文，准备进行结果校验。`,
          level: "info"
        }
      }
    );

    assertValidResultItems(titledResultItems, anchors, generationModelRequirementView);

    await updateTaskProgress(
      {
        stage: "content_generate",
        label: "正在调用 Hermes 补读 Skill 正文并生成正式内容",
        message: `Hermes 已返回 ${titledResultItems.length} 条候选软件需求正文，准备解析引用锚点。`,
        percent: 82
      },
      {
        llmProfile,
        debug: {
          postProcess: {
            lastStage: "result_items_validated"
          }
        },
        debugEvent: {
          stage: "result_items_validated",
          label: "结果校验通过",
          message: `候选结果已通过 sourceFactIds/sourceAnchorIds 与结构校验，共 ${titledResultItems.length} 条。`,
          level: "info"
        },
        timelineEntry: {
          stage: "content_generate",
          label: "生成软件需求",
          message: `内容生成完成，得到 ${titledResultItems.length} 条候选结果。`,
          level: "info"
        }
      }
    );

    await updateTaskProgress(
      {
        stage: "reference_resolve",
        label: "正在回填来源引用",
        message: `准备将 ${resultItems.length} 条候选结果中的 sourceFactIds/sourceAnchorIds 解析为 sourceRefs。`,
        percent: 90
      },
      {
        debug: {
          postProcess: {
            lastStage: "reference_resolve_started"
          }
        },
        timelineEntry: {
          stage: "reference_resolve",
          label: "回填来源引用",
          message: "开始将 sourceFactIds/sourceAnchorIds 反解为前端兼容的 sourceRefs。",
          level: "info"
        }
      }
    );

    const resolvedResultItems = resolveSourceAnchors(titledResultItems, anchors, generationModelRequirementView);

    await updateTaskProgress(
      {
        stage: "reference_resolve",
        label: "正在回填来源引用",
        message: `已完成 ${resolvedResultItems.length} 条结果的来源引用回填，准备执行规则校验。`,
        percent: 91
      },
      {
        debug: {
          postProcess: {
            lastStage: "reference_resolve_completed"
          }
        },
        debugEvent: {
          stage: "reference_resolve",
          label: "引用回填完成",
          message: `已将 ${resolvedResultItems.length} 条结果的 sourceFactIds/sourceAnchorIds 解析为 sourceRefs。`,
          level: "info"
        }
      }
    );

    const conflicts = this.validationService.validate(resolvedResultItems, { domainKnowledge, documentType: "software_requirement" });
    const traces = buildTraces(resolvedResultItems);

    await updateTaskProgress(
      {
        stage: "rule_validate",
        label: "正在校验生成结果",
        message: `规则校验完成，识别到 ${conflicts.length} 个冲突，准备保存任务结果。`,
        percent: 92
      },
      {
        metrics: {
          generatedItemCount: resolvedResultItems.length,
          conflictCount: conflicts.length
        },
        timelineEntry: {
          stage: "rule_validate",
          label: "规则校验",
          message: `已完成规则校验，得到 ${traces.length} 条追溯信息和 ${conflicts.length} 个冲突。`,
          level: "info"
        }
      }
    );

    const updatedTask = await this.projectService.updateGenerationTask(projectId, moduleId, "software_requirement", taskId, {
      status: "completed",
      resultItems: resolvedResultItems,
      extractions,
      traces,
      conflicts,
      llmProfile,
      metrics: {
        extractionFileCount: inputAssets.length,
        extractionEvidenceCount: anchors.length,
        generatedItemCount: resolvedResultItems.length,
        conflictCount: conflicts.length
      },
      progress: {
        stage: "completed",
        label: "任务已完成",
        message: `Hermes 已生成 ${resolvedResultItems.length} 条软件需求，可开始审核。`,
        percent: 100
      },
      timelineEntry: {
        stage: "persist_result",
        label: "保存结果",
        message: `任务结果已写入模块工作区，可在历史任务中查看详情。`,
        level: "info"
      },
      summary: llmProfile.model
        ? `通过 Hermes + ${llmProfile.name} 生成 ${resolvedResultItems.length} 条软件需求`
        : `通过 Hermes 本地回退生成 ${resolvedResultItems.length} 条软件需求`
    });

    return {
      projectId,
      moduleId,
      documentType: "software_requirement",
      task: updatedTask
    };
  }

  async generate(projectId, options = {}) {
    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.files.length) {
      throw new Error("No files uploaded");
    }

    const extractions = await this.extractionService.extractFiles(project);
    const requirements = await this.llmService.generateDocumentItems(project, extractions, options);
    const domainKnowledge = await this.skillBundleService.getDomainKnowledge(options.skillBundleId, {
      documentType: project.documentType,
      domain: project.domain || "",
      moduleSkillKey: project.moduleSkillKey || ""
    });
    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const conflicts = this.validationService.validate(requirements, { domainKnowledge, documentType: project.documentType });
    const traces = buildTraces(requirements);

    const saved = await this.projectService.updateGeneratedArtifacts(project.id, {
      extractions,
      requirements,
      traces,
      conflicts,
      llmProfile: selectedProfile
        ? {
            id: selectedProfile.id,
            provider: selectedProfile.provider,
            name: selectedProfile.name,
            model: selectedProfile.model,
            baseURL: selectedProfile.baseURL
          }
        : null
    });

    return saved;
  }

  async finalizeModuleGeneration(projectId, moduleId, normalizedDocumentType, inputAssets, options = {}) {
    const taskId = options.taskId || "";
    const updateTaskProgress = async (progress = {}, extraUpdates = {}) =>
      this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, taskId, {
        progress,
        ...extraUpdates
      });

    try {
      const saveStartedAt = () => Date.now();
      const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
      logGenerationDebug("task_started", {
        projectId,
        moduleId,
        taskId,
        documentType: normalizedDocumentType,
        inputAssetCount: inputAssets.length
      });
      const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
      const llmProfile = selectedProfile
        ? {
            id: selectedProfile.id,
            provider: selectedProfile.provider,
            name: selectedProfile.name,
            model: selectedProfile.model,
            baseURL: selectedProfile.baseURL
          }
        : null;
      const contextProject = {
        name: `${project.name} / ${module.name}`,
        description: module.description || project.description,
        language: project.language,
        documentType: normalizedDocumentType,
        domain: module.domain || "embedded_vcu",
        moduleSkillKey: module.moduleSkillKey || ""
      };

      const initStage = normalizedDocumentType === "software_requirement" ? "task_init" : "module_bootstrap";
      await updateTaskProgress(
        {
          stage: initStage,
          label: normalizedDocumentType === "software_requirement" ? "正在初始化任务上下文" : "正在准备模块上下文",
          message:
            normalizedDocumentType === "software_requirement"
              ? "正在校验输入资产、模块技能和 Hermes 执行上下文。"
              : "正在校验模块资料、加载技能与生成上下文。",
          percent: 10
        },
        {
          timelineEntry: {
            stage: initStage,
            label: normalizedDocumentType === "software_requirement" ? "初始化任务上下文" : "准备模块上下文",
            message:
              normalizedDocumentType === "software_requirement"
                ? "已开始准备 Hermes 软件需求生成任务。"
                : "已开始准备模块技能、文档类型和输入资产。",
            level: "info"
          }
        }
      );

      if (normalizedDocumentType === "software_requirement") {
        return await this.finalizeSoftwareRequirementGeneration({
          projectId,
          moduleId,
          taskId,
          project,
          module,
          inputAssets,
          options,
          selectedProfile,
          updateTaskProgress
        });
      }

      const readiness = await this.moduleSkillService.ensureModuleReady(project, module, normalizedDocumentType, {
        llmProfileId: options.llmProfileId || ""
      });
      if (readiness.bootstrapped) {
        await this.projectService.updateModuleSkillState(projectId, moduleId, {
          skillStatus: "bootstrapped",
          skillSource: {
            type: "bootstrap",
            documentType: normalizedDocumentType,
            strategy: readiness.bootstrapStrategy || "rule_based",
            llmProfileName: readiness.bootstrapLlmProfile?.name || ""
          },
          seededAt: new Date().toISOString()
        });
      }

      const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
      const composedSkills = await this.skillLoader.loadForContext(
        {
          documentType: normalizedDocumentType,
          domain: module.domain || "embedded_vcu",
          moduleSkillKey: module.moduleSkillKey || ""
        },
        skillDir
      );
      const domainKnowledge = composedSkills["domain-knowledge.json"] || {};

      await updateTaskProgress(
        {
          stage: "extracting_inputs",
          label: "正在解析输入资料",
          message: `准备解析 ${inputAssets.length} 个输入资产。`,
          percent: 22,
          current: 0,
          total: inputAssets.length
        },
        {
          timelineEntry: {
            stage: "extracting_inputs",
            label: "解析输入资料",
            message: `开始解析 ${inputAssets.length} 个输入资产。`,
            level: "info"
          }
        }
      );

      const extractions = await this.extractionService.extractFiles(
        { files: inputAssets },
        {
          onProgress: async (event) => {
            if (event.phase === "extracting_file") {
              const slxLabel = event.slxParsing ? "正在解析 Simulink 模型" : "正在解析输入资料";
              await updateTaskProgress({
                stage: "extracting_inputs",
                label: slxLabel,
                message: event.slxParsing
                  ? `正在解析 Simulink 模型 ${event.fileName}`
                  : `正在解析第 ${event.current}/${event.total} 个文件：${event.fileName}`,
                percent: Math.min(48, 22 + Math.round((event.current / Math.max(event.total, 1)) * 22)),
                current: event.current,
                total: event.total
              });
            }
            if (event.phase === "file_extracted") {
              const slxLabel = event.slxParsed ? "Simulink 模型解析完成" : "正在解析输入资料";
              await updateTaskProgress(
                {
                  stage: "extracting_inputs",
                  label: slxLabel,
                  message: event.slxParsed
                    ? `已提取 Simulink 模型 ${event.fileName} 的模型接口/状态/参数事实，共 ${event.evidenceCount || 0} 条证据。`
                    : `已完成 ${event.current}/${event.total} 个文件：${event.fileName}`,
                  percent: Math.min(50, 24 + Math.round((event.current / Math.max(event.total, 1)) * 24)),
                  current: event.current,
                  total: event.total
                },
                {
                  timelineEntry: {
                    stage: "extracting_inputs",
                    label: event.slxParsed ? "Simulink 模型解析完成" : "文件解析完成",
                    message: event.slxParsed
                      ? `Simulink 模型 ${event.fileName} 解析完成，已提取模型接口/状态/参数事实，共 ${event.evidenceCount || 0} 条证据。`
                      : `${event.fileName} 解析完成，提取 ${event.evidenceCount || 0} 条证据。`,
                    level: "info"
                  }
                }
              );
            }
            if (event.phase === "slx_parse_failed") {
              await updateTaskProgress(
                {
                  stage: "extracting_inputs",
                  label: "Simulink 模型解析失败",
                  message: event.error,
                  percent: Math.min(50, 24 + Math.round((event.current / Math.max(event.total, 1)) * 24)),
                  current: event.current,
                  total: event.total
                },
                {
                  timelineEntry: {
                    stage: "extracting_inputs",
                    label: "Simulink 模型解析失败",
                    message: event.error,
                    level: "error"
                  }
                }
              );
            }
          }
        }
      );

      await updateTaskProgress(
        {
          stage: "llm_generating",
          label: "正在请求模型生成",
          message: `已提取 ${countEvidence(extractions)} 条证据，准备请求模型生成。`,
          percent: 58
        },
        {
          metrics: {
            extractionFileCount: inputAssets.length,
            extractionEvidenceCount: countEvidence(extractions)
          },
          timelineEntry: {
            stage: "llm_generating",
            label: "模型生成",
            message: `输入解析完成，准备调用 ${selectedProfile?.name || "本地回退"}。`,
            level: "info"
          }
        }
      );

      let llmDurationMs = 0;
      const resultItems = await this.llmService.generateDocumentItems(contextProject, extractions, {
        ...options,
        onProgress: async (event) => {
          if (event.phase === "fallback_generation") {
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "正在使用本地回退生成",
                message: event.message,
                percent: 68
              },
              {
                timelineEntry: {
                  stage: "llm_generating",
                  label: "本地回退",
                  message: event.message,
                  level: "warning"
                }
              }
            );
          }
          if (event.phase === "llm_request_started") {
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "正在等待模型返回",
                message: event.message,
                percent: 70
              },
              {
                timelineEntry: {
                  stage: "llm_generating",
                  label: "模型请求已发出",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_request_completed") {
            llmDurationMs = Number(event.durationMs || 0) || 0;
            logGenerationDebug("llm_request_completed", {
              projectId,
              moduleId,
              taskId,
              durationMs: llmDurationMs,
              model: selectedProfile?.model || "",
              provider: selectedProfile?.provider || ""
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "模型已返回，正在整理输出",
                message: `${event.message}${llmDurationMs ? `（耗时 ${llmDurationMs} ms）` : ""}`,
                percent: 78
              },
              {
                metrics: { llmDurationMs },
                timelineEntry: {
                  stage: "llm_generating",
                  label: "模型已返回",
                  message: `${selectedProfile?.name || "模型"} 已返回结果${llmDurationMs ? `，耗时 ${llmDurationMs} ms` : ""}。`,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_payload_parsed") {
            const rawCapture = clipDebugText(event.rawResponseText || "", DEBUG_RAW_RESPONSE_LIMIT);
            logGenerationDebug("llm_payload_parsed", {
              projectId,
              moduleId,
              taskId,
              rawItemCount: Number(event.rawItemCount || 0) || 0,
              rawResponseLength: rawCapture.length,
              rawResponseTruncated: rawCapture.truncated
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "模型结果已解析，正在规范化条目",
                message: event.message,
                percent: 80
              },
              {
                debug: {
                  llm: {
                    requestModel: selectedProfile?.model || "",
                    requestProvider: selectedProfile?.provider || "",
                    rawResponseText: rawCapture.text,
                    rawResponseLength: rawCapture.length,
                    rawResponseTruncated: rawCapture.truncated,
                    parsedTopLevelKeys: Array.isArray(event.parsedTopLevelKeys) ? event.parsedTopLevelKeys : [],
                    rawItemCount: Number(event.rawItemCount || 0) || 0
                  },
                  postProcess: {
                    lastStage: "llm_payload_parsed"
                  }
                },
                debugEvent: {
                  stage: "llm_payload_parsed",
                  label: "模型结果已解析",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_items_normalized") {
            logGenerationDebug("llm_items_normalized", {
              projectId,
              moduleId,
              taskId,
              normalizeResultItemsMs: Number(event.normalizeResultItemsMs || 0) || 0,
              normalizedItemCount: Number(event.normalizedItemCount || 0) || 0
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "已完成条目规范化，正在应用技能规则",
                message: event.message,
                percent: 82
              },
              {
                debug: {
                  postProcess: {
                    lastStage: "llm_items_normalized",
                    normalizeResultItemsMs: Number(event.normalizeResultItemsMs || 0) || 0
                  }
                },
                debugEvent: {
                  stage: "llm_items_normalized",
                  label: "条目规范化完成",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_policies_applied") {
            logGenerationDebug("llm_policies_applied", {
              projectId,
              moduleId,
              taskId,
              applyPoliciesMs: Number(event.applyPoliciesMs || 0) || 0,
              totalAfterModelMs: Number(event.totalAfterModelMs || 0) || 0,
              finalItemCount: Number(event.finalItemCount || 0) || 0
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "已完成技能规则处理，准备进入校验",
                message: event.message,
                percent: 84
              },
              {
                metrics: {
                  generatedItemCount: Number(event.finalItemCount || 0) || 0
                },
                debug: {
                  postProcess: {
                    lastStage: "llm_policies_applied",
                    applyPoliciesMs: Number(event.applyPoliciesMs || 0) || 0,
                    totalAfterModelMs: Number(event.totalAfterModelMs || 0) || 0
                  }
                },
                debugEvent: {
                  stage: "llm_policies_applied",
                  label: "技能规则处理完成",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_postprocess_failed") {
            const rawCapture = clipDebugText(event.rawResponseText || "", DEBUG_RAW_RESPONSE_LIMIT);
            const stackCapture = clipDebugText(event.errorStack || "", DEBUG_STACK_LIMIT);
            logGenerationDebug("llm_postprocess_failed", {
              projectId,
              moduleId,
              taskId,
              stage: event.stage || "llm_postprocess_failed",
              message: event.message || "",
              rawResponseLength: rawCapture.length,
              rawResponseTruncated: rawCapture.truncated
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "模型后处理失败",
                message: event.message || "模型结果后处理失败",
                percent: 79
              },
              {
                debug: {
                  llm: {
                    requestModel: selectedProfile?.model || "",
                    requestProvider: selectedProfile?.provider || "",
                    rawResponseText: rawCapture.text,
                    rawResponseLength: rawCapture.length,
                    rawResponseTruncated: rawCapture.truncated
                  },
                  postProcess: {
                    lastStage: event.stage || "llm_postprocess_failed"
                  },
                  lastError: {
                    at: new Date().toISOString(),
                    stage: event.stage || "llm_postprocess_failed",
                    message: event.message || "模型结果后处理失败",
                    stack: stackCapture.text
                  }
                },
                debugEvent: {
                  stage: event.stage || "llm_postprocess_failed",
                  label: "模型后处理失败",
                  message: event.message || "模型结果后处理失败",
                  level: "error"
                }
              }
            );
          }
        }
      });

      const validationStartedAt = saveStartedAt();
      await updateTaskProgress(
        {
          stage: "validating_results",
          label: "正在校验生成结果",
          message: `模型生成完成，正在校验 ${resultItems.length} 条结果。`,
          percent: 86
        },
        {
          metrics: { generatedItemCount: resultItems.length },
          timelineEntry: {
            stage: "validating_results",
            label: "校验结果",
            message: `开始校验 ${resultItems.length} 条生成结果。`,
            level: "info"
          }
        }
      );
      const conflicts = this.validationService.validate(resultItems, { domainKnowledge, documentType: normalizedDocumentType });
      const validationMs = Date.now() - validationStartedAt;
      const traces = buildTraces(resultItems);
      logGenerationDebug("validation_completed", {
        projectId,
        moduleId,
        taskId,
        validationMs,
        resultCount: resultItems.length,
        conflictCount: conflicts.length,
        traceCount: traces.length
      });
      const savingStartedAt = saveStartedAt();
      await updateTaskProgress(
        {
          stage: "saving_results",
          label: "正在保存结果",
          message: `校验完成，发现 ${conflicts.length} 个冲突，正在保存任务结果。`,
          percent: 94
        },
        {
          metrics: { conflictCount: conflicts.length },
          debug: {
            postProcess: {
              lastStage: "validation_completed",
              validationMs
            }
          },
          timelineEntry: {
            stage: "saving_results",
            label: "保存结果",
            message: `已完成校验，准备写入 ${resultItems.length} 条结果和 ${traces.length} 条追溯信息。`,
            level: "info"
          }
        }
      );
      const updatedTask = await this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, taskId, {
        status: "completed",
        resultItems,
        extractions,
        traces,
        conflicts,
        llmProfile,
        metrics: {
          extractionFileCount: inputAssets.length,
          extractionEvidenceCount: countEvidence(extractions),
          llmDurationMs,
          generatedItemCount: resultItems.length,
          conflictCount: conflicts.length
        },
        debug: {
          postProcess: {
            lastStage: "completed",
            validationMs,
            saveMs: Date.now() - savingStartedAt
          }
        },
        progress: {
          stage: "completed",
          label: "任务已完成",
          message: `已生成 ${resultItems.length} 条结果，可开始审核。`,
          percent: 100
        },
        timelineEntry: {
          stage: "completed",
          label: "任务完成",
          message: `任务完成，生成 ${resultItems.length} 条结果，发现 ${conflicts.length} 个冲突。`,
          level: "info"
        },
        summary: selectedProfile
          ? `使用 ${selectedProfile.name} 生成 ${resultItems.length} 条结果`
          : `使用本地回退模式生成 ${resultItems.length} 条结果`
      });
      logGenerationDebug("task_completed", {
        projectId,
        moduleId,
        taskId,
        resultCount: resultItems.length,
        conflictCount: conflicts.length,
        traceCount: traces.length
      });

      return {
        projectId,
        moduleId,
        documentType: normalizedDocumentType,
        task: updatedTask
      };
    } catch (error) {
      if (isTaskDeletedError(error)) {
        return {
          projectId,
          moduleId,
          documentType: normalizedDocumentType,
          task: null,
          deleted: true
        };
      }

      const stackCapture = clipDebugText(error.stack || "", DEBUG_STACK_LIMIT);
      logGenerationDebug("task_failed", {
        projectId,
        moduleId,
        taskId,
        stage: error.stage || error.debugStage || "pipeline",
        message: error.message || "生成失败"
      });
      await this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, taskId, {
        status: "failed",
        errorMessage: error.message || "生成失败",
        debug: {
          postProcess: {
            lastStage: error.stage || error.debugStage || "pipeline"
          },
          lastError: {
            at: new Date().toISOString(),
            stage: error.stage || error.debugStage || "pipeline",
            message: error.message || "生成失败",
            stack: stackCapture.text
          }
        },
        debugEvent: {
          stage: error.stage || error.debugStage || "pipeline",
          label: "任务失败",
          message: error.message || "生成失败",
          level: "error"
        },
        progress: {
          stage: "failed",
          label: "任务执行失败",
          message: error.message || "生成失败",
          percent: 100
        },
        timelineEntry: {
          stage: "failed",
          label: "任务失败",
          message: error.message || "生成失败",
          level: "error"
        },
        summary: error.message || "生成失败"
      });
      throw error;
    }
  }

  async extractDocumentForModule(projectId, moduleId, options = {}) {
    const normalizedTargetDocumentType = normalizeDocumentExtractionType(options.targetDocumentType);
    const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
    const sourceText = String(options.sourceText || "").trim();
    const imageInputs = Array.isArray(options.imageInputs) ? options.imageInputs : [];
    const spreadsheetInputs = Array.isArray(options.spreadsheetInputs) ? options.spreadsheetInputs : [];

    if (spreadsheetInputs.length && normalizedTargetDocumentType !== "hil_test_case") {
      throw new Error("当前仅 HIL 测试用例支持 Excel 表格提取");
    }

    let spreadsheetExtraction = null;
    if (spreadsheetInputs.length) {
      const parsedResults = [];
      for (const input of spreadsheetInputs) {
        const parsed = await this.spreadsheetExtractionService.parseHilSpreadsheet(input.absolutePath);
        parsedResults.push({
          ...input,
          sheetName: parsed.sheetName,
          caseCount: parsed.cases.length,
          cases: parsed.cases,
          normalizedText: parsed.normalizedText
        });
      }
      spreadsheetExtraction = {
        files: parsedResults,
        normalizedText: parsedResults.map((item) => item.normalizedText).filter(Boolean).join("\n\n")
      };
    }

    const normalizedSourceText = [sourceText, spreadsheetExtraction?.normalizedText || ""].filter(Boolean).join("\n\n");

    if (!normalizedSourceText && !imageInputs.length && !spreadsheetInputs.length) {
      throw new Error("No extraction input provided");
    }

    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const sourceMode = inferExtractionSourceMode(sourceText, imageInputs, spreadsheetInputs);
    const inputArtifacts = [...imageInputs, ...spreadsheetInputs];
    const task = await this.projectService.recordDocumentExtractionTask(projectId, moduleId, {
      status: options.asyncStart ? "queued" : "running",
      targetDocumentType: normalizedTargetDocumentType,
      sourceMode,
      sourceText,
      inputArtifacts,
      summary: buildExtractionTaskSummary(normalizedTargetDocumentType),
      progress: {
        stage: "queued",
        label: "提取任务已启动",
        message: "任务已创建，正在排队准备提取输入文档。",
        percent: 3,
        current: 0,
        total: inputArtifacts.length
      },
      timeline: [
        {
          at: new Date().toISOString(),
          stage: "queued",
          label: "提取任务已启动",
          message: `提取任务已创建，等待后台开始处理 ${imageInputs.length} 个图片输入和 ${spreadsheetInputs.length} 个表格输入。`,
          level: "info"
        }
      ]
    });

    const llmProfile = selectedProfile
      ? {
          id: selectedProfile.id,
          provider: selectedProfile.provider,
          name: selectedProfile.name,
          model: selectedProfile.model,
          baseURL: selectedProfile.baseURL
        }
      : null;

    const runExtraction = async () => {
      try {
        await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
          progress: {
            stage: "document_extract_prepare",
            label: "正在准备提取输入",
            message: `已整理 ${imageInputs.length} 个图片输入、${spreadsheetInputs.length} 个表格输入和 ${normalizedSourceText ? 1 : 0} 段文本输入。`,
            percent: 18,
            current: inputArtifacts.length,
            total: inputArtifacts.length
          },
          debug: {
            artifacts: {
              extractionInput: {
                sourceMode,
                sourceText,
                normalizedSourceText,
                imageInputs,
                spreadsheetInputs,
                spreadsheetExtraction
              }
            }
          },
          timelineEntry: {
            stage: "document_extract_prepare",
            label: "准备提取输入",
            message: "已完成提取输入整理，准备调用 Hermes。",
            level: "info"
          }
        });

        const descriptor = buildHermesStepDescriptor("document_extract_generate");
        const startedAt = new Date().toISOString();
        await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
          progress: {
            stage: descriptor.stage,
            label: descriptor.runningLabel,
            message: "正在调用 Hermes 提取文档内容。",
            percent: descriptor.runningPercent
          },
          debug: {
            agent: {
              transport: this.hermesAgentClient.transport,
              currentStep: "document_extract_generate",
              status: "running",
              startedAt,
              lastEventAt: startedAt,
              elapsedMs: 0
            }
          },
          timelineEntry: {
            stage: descriptor.stage,
            label: descriptor.runningLabel,
            message: "已开始调用 Hermes 执行文档提取。",
            level: "info"
          }
        });

        const extractionArtifact = assertHermesStepResponse(
          "document_extract_generate",
          await this.hermesAgentClient.executeStep(
            {
              taskId: task.id,
              stepType: "document_extract_generate",
              allowedPaths: inputArtifacts.map((item) => item.absolutePath).filter(Boolean),
              inputArtifact: {
                project: {
                  name: `${project.name} / ${module.name}`,
                  description: module.description || project.description,
                  language: project.language,
                  documentType: normalizedTargetDocumentType,
                  domain: module.domain || "embedded_vcu",
                  moduleSkillKey: module.moduleSkillKey || ""
                },
                module: {
                  name: module.name,
                  description: module.description || "",
                  domain: module.domain || "embedded_vcu"
                },
                targetDocumentType: normalizedTargetDocumentType,
                sourceText: normalizedSourceText,
                images: imageInputs,
                spreadsheets: spreadsheetInputs,
                spreadsheetExtraction: spreadsheetExtraction
                  ? {
                      fileCount: spreadsheetExtraction.files.length,
                      totalCases: spreadsheetExtraction.files.reduce((total, item) => total + (item.caseCount || 0), 0),
                      sheets: spreadsheetExtraction.files.map((item) => ({
                        originalName: item.originalName,
                        sheetName: item.sheetName,
                        caseCount: item.caseCount
                      }))
                    }
                  : null
              },
              llmProfileSnapshot: llmProfile
            },
            {
              onEvent: async (event = {}) => {
                const eventAt = event.at || new Date().toISOString();
                await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
                  debug: {
                    agent: {
                      transport: event.transport || this.hermesAgentClient.transport,
                      currentStep: event.stepType || "document_extract_generate",
                      status: String(event.status || "").trim() || "running",
                      startedAt: event.startedAt || startedAt,
                      lastHeartbeatAt: event.heartbeatAt || "",
                      lastEventAt: eventAt,
                      sessionId: event.sessionId || "",
                      tokenUsage: event.tokenUsage || null,
                      stdoutExcerpt: event.stdoutExcerpt || "",
                      stderrExcerpt: event.stderrExcerpt || "",
                      elapsedMs: Number(event.elapsedMs || 0) || 0
                    }
                  },
                  debugEvent: {
                    stage: descriptor.stage,
                    label: event.label || descriptor.runningLabel,
                    message: event.message || "Hermes 文档提取状态已更新。",
                    level: event.level || "info",
                    type: event.type || "agent_runtime",
                    status: event.status || "",
                    transport: event.transport || this.hermesAgentClient.transport,
                    stepType: event.stepType || "document_extract_generate",
                    sessionId: event.sessionId || "",
                    startedAt: event.startedAt || startedAt,
                    heartbeatAt: event.heartbeatAt || "",
                    elapsedMs: Number(event.elapsedMs || 0) || 0,
                    tokenUsage: event.tokenUsage || null,
                    stdoutExcerpt: event.stdoutExcerpt || "",
                    stderrExcerpt: event.stderrExcerpt || ""
                  }
                });
              }
            }
          )
        );

        assertValidExtractedDocument(extractionArtifact, normalizedTargetDocumentType);

        await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
          progress: {
            stage: "document_extract_persist",
            label: "正在写回模块资产",
            message: "Hermes 已返回提取结果，正在写回 Markdown 资产。",
            percent: 88
          },
          timelineEntry: {
            stage: "document_extract_persist",
            label: "写回模块资产",
            message: "开始将提取结果写回当前模块资产。",
            level: "info"
          }
        });

        const finalMarkdown =
          normalizedTargetDocumentType === "hil_test_case" && spreadsheetExtraction?.files?.length
            ? buildHilSpreadsheetMarkdown(module.name, spreadsheetExtraction)
            : extractionArtifact.markdown;

        const outputAsset = await this.projectService.createExtractedModuleAsset(projectId, moduleId, {
          sourceTaskId: task.id,
          targetDocumentType: normalizedTargetDocumentType,
          markdown: finalMarkdown,
          summary: extractionArtifact.summary || ""
        });

        const completedTask = await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
          status: "completed",
          outputAssetId: outputAsset.id,
          outputAssetName: outputAsset.originalName,
          summary: extractionArtifact.summary || `已提取${getDocumentExtractionTypeLabel(normalizedTargetDocumentType)}`,
          progress: {
            stage: "completed",
            label: "提取任务已完成",
            message: `已生成模块资产：${outputAsset.originalName}`,
            percent: 100
          },
          timelineEntry: {
            stage: "completed",
            label: "提取任务完成",
            message: `提取完成，结果已写回模块资产：${outputAsset.originalName}`,
            level: "info"
          }
        });

        return {
          projectId,
          moduleId,
          targetDocumentType: normalizedTargetDocumentType,
          task: completedTask,
          outputAsset
        };
      } catch (error) {
        const stackCapture = clipDebugText(error.stack || "", DEBUG_STACK_LIMIT);
        await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
          status: "failed",
          errorMessage: error.message || "文档提取失败",
          debug: {
            lastError: {
              at: new Date().toISOString(),
              stage: error.stage || error.debugStage || "document_extract",
              message: error.message || "文档提取失败",
              stack: stackCapture.text
            }
          },
          progress: {
            stage: "failed",
            label: "提取任务失败",
            message: error.message || "文档提取失败",
            percent: 100
          },
          timelineEntry: {
            stage: "failed",
            label: "提取任务失败",
            message: error.message || "文档提取失败",
            level: "error"
          },
          summary: error.message || "文档提取失败"
        });
        throw error;
      }
    };

    if (options.asyncStart) {
      const runQueuedTask = () => runExtraction().catch((error) => {
        console.error("Document extraction failed", error);
        return null;
      });
      if (this.hermesTaskQueueService) {
        this.hermesTaskQueueService.enqueue({
          id: task.id,
          type: "document_extraction",
          title: buildExtractionTaskSummary(normalizedTargetDocumentType),
          projectId,
          moduleId,
          documentType: normalizedTargetDocumentType,
          onStart: async () => {
            await this.projectService.updateDocumentExtractionTask(projectId, moduleId, task.id, {
              status: "running",
              progress: {
                stage: "queued",
                label: "提取任务开始执行",
                message: "任务已从 Hermes 队列取出，正在准备提取输入文档。",
                percent: 5
              },
              timelineEntry: {
                stage: "queued",
                label: "提取任务开始执行",
                message: "任务已从 Hermes 队列取出，开始后台处理。",
                level: "info"
              }
            });
          },
          run: runQueuedTask
        });
      } else {
        runQueuedTask();
      }
      return {
        projectId,
        moduleId,
        targetDocumentType: normalizedTargetDocumentType,
        task
      };
    }

    return runExtraction();
  }

  async generateForModule(projectId, moduleId, documentType, options = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const manualTitleOutline = normalizeManualTitleOutline(options.manualTitleOutline);
    if (normalizedDocumentType === "software_requirement" && !isModuleSkillBootstrapTask(options) && !manualTitleOutline) {
      const error = new Error("manualTitleOutline is required for software requirement generation");
      error.statusCode = 400;
      error.code = "invalid_manual_title_outline";
      throw error;
    }
    const selectedAssetIds = Array.isArray(options.assetIds) && options.assetIds.length
      ? options.assetIds
      : module.assets.map((asset) => asset.id);
    const selectedAssets = module.assets.filter((asset) => selectedAssetIds.includes(asset.id));
    const jsonMrvAssets = selectedAssets.filter((asset) => asset.role === "model_requirement_view_json");
    const nonJsonAssets = selectedAssets.filter((asset) => asset.role !== "model_requirement_view_json");
    const inputAssets =
      normalizedDocumentType === "software_requirement" && !isModuleSkillBootstrapTask(options)
        ? nonJsonAssets.filter((asset) => !isDisallowedFormalSoftwareRequirementAsset(asset))
        : nonJsonAssets;

    let preloadedModelRequirementViews = [];
    if (jsonMrvAssets.length) {
      const { resolveStoredFilePath } = await import("./storage.js");
      for (const jsonAsset of jsonMrvAssets) {
        const assetPath = resolveStoredFilePath(jsonAsset, { baseDir: config.uploadDir });
        if (assetPath) {
          try {
            const content = await fs.readFile(assetPath, "utf8");
            const mrv = JSON.parse(content);
            validateModelRequirementView(mrv);
            preloadedModelRequirementViews.push(mrv);
          } catch (error) {
            const wrapped = new Error(`模型需求 JSON 资产 ${jsonAsset.originalName} 校验失败: ${error.message}`);
            wrapped.statusCode = 400;
            throw wrapped;
          }
        }
      }
    }

    if (!inputAssets.length && !preloadedModelRequirementViews.length) {
      if (
        normalizedDocumentType === "software_requirement" &&
        !isModuleSkillBootstrapTask(options) &&
        nonJsonAssets.length &&
        nonJsonAssets.every((asset) => isDisallowedFormalSoftwareRequirementAsset(asset))
      ) {
        const error = new Error("正式软件需求生成不会使用人工范例资产，请选择系统需求或代码/模型资产。");
        error.statusCode = 400;
        error.code = "invalid_generation_assets";
        error.details = {
          documentType: normalizedDocumentType,
          excludedAssetIds: nonJsonAssets.map((asset) => asset.id)
        };
        throw error;
      }
      throw new Error("No assets selected");
    }

    const skillVersion = await this.skillBundleService.getSkillVersionRef(options.skillBundleId || "");
    const lockedSkillBundleId = skillVersion.bundleId;
    const skillDir = await this.skillBundleService.getSkillDir(lockedSkillBundleId);
    const composedSkills = await this.skillLoader.loadForContext(
      {
        documentType: normalizedDocumentType,
        domain: module.domain || "embedded_vcu",
        moduleSkillKey: module.moduleSkillKey || ""
      },
      skillDir
    );
    const domainKnowledge = composedSkills["domain-knowledge.json"] || {};

    const llmProfile = selectedProfile
      ? {
          id: selectedProfile.id,
          provider: selectedProfile.provider,
          name: selectedProfile.name,
          model: selectedProfile.model,
          baseURL: selectedProfile.baseURL
        }
      : null;
    const task = await this.projectService.recordGenerationTask(projectId, moduleId, normalizedDocumentType, {
      taskKind: normalizeTaskIntent(options.taskIntent),
      status: options.asyncStart ? "queued" : "running",
      inputAssetIds: inputAssets.map((asset) => asset.id),
      uploadedAssetIds: Array.isArray(options.uploadedAssetIds) ? options.uploadedAssetIds : [],
      manualTitleOutline,
      skillVersion,
      llmProfile,
      summary: buildTaskSummaryForIntent(normalizedDocumentType, options.taskIntent),
      progress: {
        stage: "queued",
        label: isModuleSkillBootstrapTask(options) ? "技能冷启动任务已启动" : "任务已启动",
        message: isModuleSkillBootstrapTask(options)
          ? "任务已创建，正在排队准备提炼当前文档类型的 module skill。"
          : `任务已创建，正在排队准备生成${normalizeDocumentType(documentType) === "hil_test_case" ? " HIL 用例" : ""}。`,
        percent: 3,
        current: 0,
        total: inputAssets.length
      },
      timeline: [
        {
          at: new Date().toISOString(),
          stage: "queued",
          label: isModuleSkillBootstrapTask(options) ? "技能冷启动任务已启动" : "任务已启动",
          message: isModuleSkillBootstrapTask(options)
            ? `技能冷启动任务已创建，等待后台开始处理 ${inputAssets.length} 个输入资产。`
            : `任务已创建，等待后台开始处理 ${inputAssets.length} 个输入资产。`,
          level: "info"
        }
      ]
    });

    const runGeneration = () => this.finalizeModuleGeneration(projectId, moduleId, normalizedDocumentType, inputAssets, {
      ...options,
      skillBundleId: lockedSkillBundleId,
      skillVersion,
      manualTitleOutline,
      taskId: task.id,
      preloadedModelRequirementViews
    });

    if (options.asyncStart) {
      const queueType = isModuleSkillBootstrapTask(options) ? "module_skill_bootstrap" : "generation";
      const runQueuedTask = () => runGeneration().catch((error) => {
        console.error("Module generation failed", error);
        return null;
      });
      if (this.hermesTaskQueueService) {
        this.hermesTaskQueueService.enqueue({
          id: task.id,
          type: queueType,
          title: buildTaskSummaryForIntent(normalizedDocumentType, options.taskIntent),
          projectId,
          moduleId,
          documentType: normalizedDocumentType,
          onStart: async () => {
            await this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, task.id, {
              status: "running",
              progress: {
                stage: "queued",
                label: "任务开始执行",
                message: "任务已从 Hermes 队列取出，正在准备执行。",
                percent: 5
              },
              timelineEntry: {
                stage: "queued",
                label: "任务开始执行",
                message: "任务已从 Hermes 队列取出，开始后台处理。",
                level: "info"
              }
            });
          },
          run: runQueuedTask
        });
      } else {
        runQueuedTask();
      }
      return {
        projectId,
        moduleId,
        documentType: normalizedDocumentType,
        task
      };
    }

    return runGeneration();
  }

  async parseSlxForModule(projectId, moduleId, options = {}) {
    const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
    const slxFile = options.slxFile;
    if (!slxFile || !slxFile.absolutePath) {
      throw new Error("SLX file is required");
    }

    const inputArtifacts = [{
      originalName: slxFile.originalName || "",
      storedName: slxFile.storedName || "",
      mimeType: slxFile.mimeType || "",
      size: slxFile.size || 0,
      absolutePath: slxFile.absolutePath,
      relativePath: slxFile.relativePath || ""
    }];

    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId || "");
    const llmProfile = selectedProfile
      ? {
          id: selectedProfile.id,
          provider: selectedProfile.provider,
          name: selectedProfile.name,
          model: selectedProfile.model,
          baseURL: selectedProfile.baseURL
        }
      : null;

    const task = await this.projectService.recordSlxParserTask(projectId, moduleId, {
      status: options.asyncStart ? "queued" : "running",
      inputArtifacts,
      summary: "正在解析 SLX 模型",
      progress: {
        stage: "slx_parse_prepare",
        label: "正在准备 SLX 解析",
        message: "任务已创建，正在准备解析 SLX 模型。",
        percent: 3,
        current: 0,
        total: 1
      },
      timeline: [
        {
          at: new Date().toISOString(),
          stage: "slx_parse_prepare",
          label: "SLX 解析任务已启动",
          message: `SLX 解析任务已创建，等待后台处理 ${slxFile.originalName || "SLX 文件"}。`,
          level: "info"
        }
      ]
    });

    const updateTaskProgress = async (progress = {}, extraUpdates = {}) =>
      this.projectService.updateSlxParserTask(projectId, moduleId, task.id, {
        progress,
        ...extraUpdates
      });

    const runParse = async () => {
      try {
        await updateTaskProgress(
          {
            stage: "slx_parse_prepare",
            label: "正在准备 SLX 解析",
            message: `已整理输入 SLX 文件 ${slxFile.originalName || ""}，准备调用 MATLAB MCP。`,
            percent: 18,
            current: 1,
            total: 1
          },
          {
            timelineEntry: {
              stage: "slx_parse_prepare",
              label: "准备 SLX 解析",
              message: "已完成输入整理，准备调用 MATLAB MCP 解析 SLX 模型。",
              level: "info"
            }
          }
        );

        const descriptor = buildHermesStepDescriptor("slx_parse_generate");
        const startedAt = new Date().toISOString();

        await updateTaskProgress(
          {
            stage: descriptor.stage,
            label: descriptor.runningLabel,
            message: "正在调用 MATLAB MCP 解析 SLX 模型并生成模型需求视图。",
            percent: descriptor.runningPercent
          },
          {
            debug: {
              agent: {
                transport: "matlab_mcp",
                currentStep: "slx_parse_generate",
                status: "running",
                startedAt,
                lastEventAt: startedAt,
                elapsedMs: 0
              }
            },
            timelineEntry: {
              stage: descriptor.stage,
              label: descriptor.runningLabel,
              message: "已开始调用 MATLAB MCP 执行 SLX 解析。",
              level: "info"
            }
          }
        );

        let extraction;
        try {
          extraction = await this.slxModelAnalysisService.analyzeAndConvertToExtraction(
            {
              ...slxFile,
              id: slxFile.id || "",
              role: "simulink_slx"
            },
            { documentType: "software_requirement" }
          );
        } finally {
          await this.slxModelAnalysisService.mcpClient?.shutdown?.().catch(() => {});
        }
        const modelRequirementView = this.modelRequirementViewService.build({
          project: { documentType: "software_requirement" },
          assets: [{ ...slxFile, role: "simulink_slx" }],
          extractions: [extraction],
          anchors: []
        });
        const summary = extraction.summary || "";

        const completedAt = new Date().toISOString();
        await updateTaskProgress({}, {
          debug: {
            agent: {
              transport: "matlab_mcp",
              currentStep: "slx_parse_generate",
              status: "completed",
              startedAt,
              lastEventAt: completedAt,
              elapsedMs: Date.parse(completedAt) - Date.parse(startedAt)
            }
          },
          debugEvent: {
            stage: descriptor.stage,
            label: "MATLAB MCP 已返回",
            message: "MATLAB MCP 已完成 SLX 模型解析。",
            level: "info",
            type: "agent_runtime",
            status: "completed",
            transport: "matlab_mcp",
            stepType: "slx_parse_generate",
            startedAt,
            elapsedMs: Date.parse(completedAt) - Date.parse(startedAt)
          }
        });

        await updateTaskProgress(
          {
            stage: "slx_parse_validate",
            label: "正在校验模型需求视图",
            message: `MATLAB MCP 已返回解析结果，正在校验 modelRequirementView 结构。`,
            percent: 78
          },
          {
            timelineEntry: {
              stage: "slx_parse_validate",
              label: "校验模型需求视图",
              message: "开始校验 modelRequirementView 结构完整性。",
              level: "info"
            }
          }
        );

        validateModelRequirementView(modelRequirementView);

        await updateTaskProgress(
          {
            stage: "slx_parse_persist",
            label: "正在写回模型需求 JSON 资产",
            message: "校验通过，正在将 modelRequirementView 写回模块资产。",
            percent: 88
          },
          {
            timelineEntry: {
              stage: "slx_parse_persist",
              label: "写回模型需求 JSON 资产",
              message: "开始将 modelRequirementView JSON 写回当前模块资产。",
              level: "info"
            }
          }
        );

        const outputAsset = await this.projectService.createSlxJsonModuleAsset(projectId, moduleId, {
          sourceTaskId: task.id,
          modelRequirementView
        });

        const completedTask = await this.projectService.updateSlxParserTask(projectId, moduleId, task.id, {
          status: "completed",
          outputAssetId: outputAsset.id,
          outputAssetName: outputAsset.originalName,
          summary: summary || `已从 SLX 模型解析得到 ${Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts.length : 0} 条模型事实`,
          progress: {
            stage: "completed",
            label: "SLX 解析任务已完成",
            message: `已生成模型需求 JSON 资产：${outputAsset.originalName}`,
            percent: 100
          },
          timelineEntry: {
            stage: "completed",
            label: "SLX 解析任务完成",
            message: `解析完成，结果已写回模块资产：${outputAsset.originalName}`,
            level: "info"
          }
        });

        return {
          projectId,
          moduleId,
          task: completedTask,
          outputAsset
        };
      } catch (error) {
        const stackCapture = clipDebugText(error.stack || "", DEBUG_STACK_LIMIT);
        await this.projectService.updateSlxParserTask(projectId, moduleId, task.id, {
          status: "failed",
          errorMessage: error.message || "SLX 解析失败",
          debug: {
            lastError: {
              at: new Date().toISOString(),
              stage: error.stage || "slx_parse",
              message: error.message || "SLX 解析失败",
              stack: stackCapture.text
            }
          },
          progress: {
            stage: "failed",
            label: "SLX 解析任务失败",
            message: error.message || "SLX 解析失败",
            percent: 100
          },
          timelineEntry: {
            stage: "failed",
            label: "SLX 解析任务失败",
            message: error.message || "SLX 解析失败",
            level: "error"
          },
          summary: error.message || "SLX 解析失败"
        });
        throw error;
      }
    };

    if (options.asyncStart) {
      const runQueuedTask = () => runParse().catch((error) => {
        console.error("SLX parse failed", error);
        return null;
      });
      if (this.hermesTaskQueueService) {
        this.hermesTaskQueueService.enqueue({
          id: task.id,
          type: "slx_parse",
          title: "SLX 解析",
          projectId,
          moduleId,
          documentType: "software_requirement",
          onStart: async () => {
            await this.projectService.updateSlxParserTask(projectId, moduleId, task.id, {
              status: "running",
              progress: {
                stage: "slx_parse_prepare",
                label: "SLX 解析任务开始执行",
                message: "任务已从 Hermes 队列取出，正在准备解析 SLX 模型。",
                percent: 5
              },
              timelineEntry: {
                stage: "slx_parse_prepare",
                label: "SLX 解析任务开始执行",
                message: "任务已从 Hermes 队列取出，开始后台处理。",
                level: "info"
              }
            });
          },
          run: runQueuedTask
        });
      } else {
        runQueuedTask();
      }
      return {
        projectId,
        moduleId,
        task
      };
    }

    return runParse();
  }
}
