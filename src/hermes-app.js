import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "./config.js";
import { ExtractionService } from "./services/extraction-service.js";
import { LlmService } from "./services/llm-service.js";
import { TemplateService } from "./services/template-service.js";
import {
  buildOutlineFromRecall,
  recallSkillInventory,
  selectEvidenceForGeneration
} from "./services/software-requirement-agent-shared.js";

function createHttpError(message, statusCode = 400, code = "hermes_request_invalid") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function now() {
  return new Date().toISOString();
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

export async function createHermesApp() {
  const app = express();
  const extractionService = new ExtractionService();
  const llmService = new LlmService();
  const templateService = new TemplateService();

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

  app.post("/internal/steps/execute", async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const payload = req.body || {};
      const stepType = String(payload.stepType || "").trim();
      if (!stepType) {
        throw createHttpError("stepType is required");
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

      throw createHttpError(`Unsupported Hermes step: ${stepType}`, 400, "hermes_step_unsupported");
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      error: error.message || "Hermes step execution failed",
      code: error.code || "hermes_step_failed",
      details: error.details || null
    });
  });

  return app;
}
