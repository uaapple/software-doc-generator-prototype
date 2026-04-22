import express from "express";
import path from "node:path";
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
