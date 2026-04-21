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
      throw createHttpError(`File path is not allowed: ${file.originalName || absolutePath}`, 403, "hermes_path_forbidden");
    }
    return {
      id: file.id || "",
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

      if (stepType === "atom_recall") {
        const items = recallSkillInventory(
          payload.skillInventory || {},
          payload.inputArtifact?.evidence || [],
          { limit: config.hermes.maxRecalledAtoms }
        );
        return res.json(buildStepResponse(stepType, { items }, startedAt, { metrics: { recalledAtomCount: items.length } }));
      }

      if (stepType === "outline_build") {
        const outline = buildOutlineFromRecall(payload.inputArtifact?.recalledAtoms || [], payload.inputArtifact?.evidence || [], {
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
