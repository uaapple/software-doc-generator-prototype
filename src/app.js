import express from "express";
import multer from "multer";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "./config.js";
import { ensureStorage } from "./services/storage.js";
import { ProjectService } from "./services/project-service.js";
import { PipelineService } from "./services/pipeline-service.js";
import { BenchmarkCaseService } from "./services/benchmark-case-service.js";
import { SkillRefinementService } from "./services/skill-refinement-service.js";
import { SkillBundleService } from "./services/skill-bundle-service.js";
import { LlmProfileService } from "./services/llm-profile-service.js";
import { RejectionService } from "./services/rejection-service.js";
import { ReplayTaskService } from "./services/replay-task-service.js";
import { ModuleSkillService } from "./services/module-skill-service.js";

function toClientProject(project) {
  if (!project) {
    return project;
  }

  const evidenceCount = Array.isArray(project.extractions)
    ? project.extractions.reduce((count, item) => count + ((item.evidence || []).length), 0)
    : 0;

  return {
    ...project,
    metrics: {
      evidenceCount
    }
  };
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function moduleUploadFields() {
  return [
    { name: "systemPdf", maxCount: 2 },
    { name: "modelPdf", maxCount: 8 },
    { name: "generatedCode", maxCount: 16 },
    { name: "slx", maxCount: 4 },
    { name: "referenceExample", maxCount: 6 }
  ];
}
export async function createApp() {
  await ensureStorage();

  const app = express();
  const projectService = new ProjectService();
  const pipelineService = new PipelineService(projectService);
  const benchmarkCaseService = new BenchmarkCaseService();
  const skillRefinementService = new SkillRefinementService();
  const skillBundleService = new SkillBundleService();
  const llmProfileService = new LlmProfileService();
  const rejectionService = new RejectionService();
  const replayTaskService = new ReplayTaskService();
  const moduleSkillService = new ModuleSkillService();
  await skillBundleService.ensureInitialized();
  await llmProfileService.ensureInitialized();

  const upload = multer({
    storage: multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const projectId = req.params.projectId;
          const moduleId = req.params.moduleId;
          const destination = moduleId
            ? path.join(config.uploadDir, projectId, moduleId)
            : path.join(config.uploadDir, projectId);
          await fs.mkdir(destination, { recursive: true });
          cb(null, destination);
        } catch (error) {
          cb(error);
        }
      },
      filename: (_req, file, cb) => {
        const safeName = `${Date.now()}-${file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
        cb(null, safeName);
      }
    })
  });

  const refinementUpload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        try {
          await fs.mkdir(config.skillRefinementUploadDir, { recursive: true });
          cb(null, config.skillRefinementUploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (_req, file, cb) => {
        const safeName = `${Date.now()}-${file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
        cb(null, safeName);
      }
    })
  });

  app.use(express.json({ limit: "2mb" }));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "index.html"));
  });
  app.get("/projects/new", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "project-create.html"));
  });
  app.get("/projects/:projectId", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "project-detail.html"));
  });
  app.get("/projects/:projectId/modules/new", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "module-create.html"));
  });
  app.get("/projects/:projectId/modules/:moduleId", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "module-detail.html"));
  });
  app.get("/projects/:projectId/modules/:moduleId/tasks/:taskId", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "task-detail.html"));
  });
  app.get("/requirement-generation", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "requirement-generation.html"));
  });
  app.get("/detail-design-generation", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "detail-design-generation.html"));
  });
  app.get("/hil-test-case-generation", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "hil-test-case-generation.html"));
  });
  app.get("/skill-refinement", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "skill-refinement.html"));
  });
  app.get("/feedback-pool", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "feedback-pool.html"));
  });
  app.use(express.static(config.publicDir));

  app.get("/api/meta", async (_req, res) => {
    const meta = await pipelineService.getMeta();
    res.json(meta);
  });

  app.get("/api/llm-profiles", async (_req, res, next) => {
    try {
      res.json(await llmProfileService.getMeta());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/llm-profiles", async (req, res, next) => {
    try {
      const profile = await llmProfileService.addProfile(req.body || {});
      res.status(201).json(profile);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/llm-profiles/:profileId", async (req, res, next) => {
    try {
      const profile = await llmProfileService.updateProfile(req.params.profileId, req.body || {});
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/llm-profiles/:profileId", async (req, res, next) => {
    try {
      const result = await llmProfileService.deleteProfile(req.params.profileId);
      res.json(toClientProject(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/llm-profiles/:profileId/test", async (req, res, next) => {
    try {
      const result = await llmProfileService.testProfileConnectivity(req.params.profileId);
      res.json(toClientProject(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/llm-profiles/default", async (req, res, next) => {
    try {
      const meta = await llmProfileService.setDefaultProfile(req.body?.profileId || "");
      res.json(meta);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects", async (_req, res) => {
    const projects = await projectService.listProjects();
    res.json({ projects: projects.map((project) => toClientProject(project)) });
  });

  app.post("/api/projects", async (req, res, next) => {
    try {
      const project = await projectService.createProject(req.body || {});
      res.status(201).json(toClientProject(project));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId", async (req, res, next) => {
    try {
      const project = await projectService.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json(toClientProject(project));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/modules/initialize-preview", async (req, res, next) => {
    try {
      const project = await projectService.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const preview = await moduleSkillService.previewNewModule(project, req.body || {}, {
        documentType: req.body?.documentType || project.documentType,
        projectDomain: req.body?.domain || ""
      });
      res.json(preview);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/modules", async (req, res, next) => {
    try {
      const module = await projectService.createModule(req.params.projectId, req.body || {});
      res.status(201).json(module);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectId/modules/:moduleId", async (req, res, next) => {
    try {
      const module = await projectService.updateModule(req.params.projectId, req.params.moduleId, req.body || {});
      res.json(module);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId", async (req, res, next) => {
    try {
      const module = await projectService.getModule(req.params.projectId, req.params.moduleId);
      res.json(module);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/initialization-check", async (req, res, next) => {
    try {
      const project = await projectService.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const module = await projectService.getModule(req.params.projectId, req.params.moduleId);
      const inspection = await moduleSkillService.inspectModule(project, module, req.query?.documentType || project.documentType);
      res.json(inspection);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/assets", async (req, res, next) => {
    try {
      const assets = await projectService.listAssets(req.params.projectId, req.params.moduleId);
      res.json({ assets });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/projects/:projectId/modules/:moduleId/assets",
    upload.fields(moduleUploadFields()),
    async (req, res, next) => {
      try {
        const result = await projectService.attachModuleAssets(req.params.projectId, req.params.moduleId, req.files || {}, {
          documentType: req.body?.documentType || "software_requirement"
        });
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete("/api/projects/:projectId/modules/:moduleId/assets/:assetId", async (req, res, next) => {
    try {
      const module = await projectService.deleteModuleAsset(
        req.params.projectId,
        req.params.moduleId,
        req.params.assetId
      );
      res.json(module);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/spaces/:documentType", async (req, res, next) => {
    try {
      const space = await projectService.getDocumentSpace(
        req.params.projectId,
        req.params.moduleId,
        req.params.documentType
      );
      res.json(space);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks", async (req, res, next) => {
    try {
      const tasks = await projectService.listGenerationTasks(
        req.params.projectId,
        req.params.moduleId,
        req.params.documentType
      );
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks/:taskId",
    async (req, res, next) => {
      try {
        const task = await projectService.getGenerationTask(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          req.params.taskId
        );
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        res.json(task);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks",
    upload.fields(moduleUploadFields()),
    async (req, res, next) => {
      try {
        const uploaded = await projectService.attachModuleAssets(req.params.projectId, req.params.moduleId, req.files || {}, {
          documentType: req.params.documentType
        });
        const assetIds = parseIdList(req.body?.assetIds);
        const uploadedAssetIds = (uploaded.assets || []).map((asset) => asset.id);
        const result = await pipelineService.generateForModule(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          {
            assetIds: [...assetIds, ...uploadedAssetIds],
            uploadedAssetIds,
            skillBundleId: req.body?.skillBundleId || "",
            llmProfileId: req.body?.llmProfileId || "",
            asyncStart: true
          }
        );
        res.status(202).json({ ...result, taskStarted: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks/:taskId/results/:resultItemId/review",
    async (req, res, next) => {
      try {
        const resultItem = await projectService.reviewTaskResult(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          req.params.taskId,
          req.params.resultItemId,
          req.body || {}
        );
        res.json(resultItem);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/projects/:projectId/modules/:moduleId/spaces/:documentType/accepted-items", async (req, res, next) => {
    try {
      const items = await projectService.listAcceptedItems(
        req.params.projectId,
        req.params.moduleId,
        req.params.documentType
      );
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/modules/:moduleId/spaces/:documentType/accepted-items", async (req, res, next) => {
    try {
      const item = await projectService.createAcceptedItem(
        req.params.projectId,
        req.params.moduleId,
        req.params.documentType,
        req.body || {}
      );
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  });

  app.put(
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/accepted-items/:itemId",
    async (req, res, next) => {
      try {
        const item = await projectService.updateAcceptedItem(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          req.params.itemId,
          req.body || {}
        );
        res.json(item);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/projects/:projectId/files",
    upload.fields(moduleUploadFields()),
    async (req, res, next) => {
      try {
        const project = await projectService.attachFiles(req.params.projectId, req.files || {});
        res.json(toClientProject(project));
      } catch (error) {
        next(error);
      }
    }
  );

  app.post("/api/projects/:projectId/generate", async (req, res, next) => {
    try {
      const result = await pipelineService.generate(req.params.projectId, {
        skillBundleId: req.body?.skillBundleId || "",
        llmProfileId: req.body?.llmProfileId || ""
      });
      res.json(toClientProject(result));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId/files/:fileId", async (req, res, next) => {
    try {
      const project = await projectService.deleteFile(req.params.projectId, req.params.fileId);
      res.json(toClientProject(project));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId/requirements/:requirementId", async (req, res, next) => {
    try {
      const project = await projectService.deleteRequirement(req.params.projectId, req.params.requirementId);
      res.json(toClientProject(project));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/projects/:projectId/requirements/:requirementId/review", async (req, res, next) => {
    try {
      const project = await projectService.reviewRequirement(
        req.params.projectId,
        req.params.requirementId,
        req.body || {}
      );
      res.json(toClientProject(project));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rejections", async (req, res, next) => {
    try {
      const records = await rejectionService.listRecords(req.query || {});
      res.json({ records });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rejections", async (req, res, next) => {
    try {
      const project = await projectService.getProject(req.body?.projectId || "");
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const requirement = (project.requirements || []).find((item) => item.id === req.body?.requirementId);
      if (!requirement) {
        return res.status(404).json({ error: "Requirement not found" });
      }
      const record = await rejectionService.createRecord({
        project,
        requirement,
        review: req.body || {}
      });
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rejections/:rejectionId", async (req, res, next) => {
    try {
      const record = await rejectionService.getRecord(req.params.rejectionId);
      if (!record) {
        return res.status(404).json({ error: "Rejection record not found" });
      }
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rejection-groups/rebuild", async (_req, res, next) => {
    try {
      const groups = await rejectionService.rebuildGroups();
      res.json({ groups });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/rejection-groups", async (_req, res, next) => {
    try {
      const groups = await rejectionService.listGroups();
      res.json({ groups });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/replay-tasks", async (req, res, next) => {
    try {
      const task = await replayTaskService.createTask(req.body || {});
      res.status(201).json(task);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/replay-tasks", async (req, res, next) => {
    try {
      const tasks = await replayTaskService.listTasks();
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/replay-tasks/:taskId", async (req, res, next) => {
    try {
      const task = await replayTaskService.getTask(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "Replay task not found" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/replay-tasks/:taskId/proposals/:proposalItemId/review", async (req, res, next) => {
    try {
      const proposalItem = await replayTaskService.reviewProposalItem(
        req.params.taskId,
        req.params.proposalItemId,
        req.body || {}
      );
      res.json(proposalItem);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/replay-tasks/:taskId/apply", async (req, res, next) => {
    try {
      const result = await replayTaskService.applyTask(req.params.taskId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-refinement/bundles", async (_req, res, next) => {
    try {
      const activeBundle = await skillBundleService.getActiveBundle();
      const bundles = await skillBundleService.listBundles();
      res.json({ activeBundle, bundles });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/skill-refinement/cases",
    refinementUpload.fields([
      { name: "systemPdf", maxCount: 1 },
      { name: "modelPdf", maxCount: 6 },
      { name: "generatedCode", maxCount: 12 },
      { name: "goldenSourceFile", maxCount: 1 },
      { name: "referenceRequirementFile", maxCount: 1 }
    ]),
    async (req, res, next) => {
      try {
        const benchmarkCase = await benchmarkCaseService.createCase(req.body || {}, req.files || {});
        res.status(201).json(benchmarkCase);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/skill-refinement/cases", async (_req, res, next) => {
    try {
      const cases = await benchmarkCaseService.listCases();
      res.json({ cases });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-refinement/cases/:caseId", async (req, res, next) => {
    try {
      const benchmarkCase = await benchmarkCaseService.getCase(req.params.caseId);
      if (!benchmarkCase) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.json(benchmarkCase);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/cases/:caseId/certify", async (req, res, next) => {
    try {
      const benchmarkCase = await benchmarkCaseService.certifyCase(req.params.caseId);
      res.json(benchmarkCase);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/cases/:caseId/archive", async (req, res, next) => {
    try {
      const benchmarkCase = await benchmarkCaseService.archiveCase(req.params.caseId);
      res.json(benchmarkCase);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/cases/:caseId/restore", async (req, res, next) => {
    try {
      const benchmarkCase = await benchmarkCaseService.restoreCase(req.params.caseId);
      res.json(benchmarkCase);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/runs", async (req, res, next) => {
    try {
      const run = await skillRefinementService.createRun(req.body || {});
      res.status(201).json(run);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-refinement/runs/:runId", async (req, res, next) => {
    try {
      const run = await skillRefinementService.getRun(req.params.runId);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      const [triggerCase, baselineBundle, candidateBundle, evaluation] = await Promise.all([
        benchmarkCaseService.getCase(run.triggerCaseId),
        skillBundleService.getBundle(run.baseBundleId),
        run.candidateBundleId ? skillBundleService.getBundle(run.candidateBundleId) : Promise.resolve(null),
        run.evaluationRunId
          ? skillRefinementService.evaluationService.getEvaluation(run.evaluationRunId)
          : Promise.resolve(null)
      ]);
      res.json({
        run,
        triggerCase,
        baselineBundle,
        candidateBundle,
        proposalItems: run.proposalItems || [],
        evaluation,
        decisionHints: run.decisionHints || evaluation?.decisionHints || null
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/runs/:runId/proposals/:proposalId/review", async (req, res, next) => {
    try {
      const proposalItem = await skillRefinementService.reviewProposalItem(
        req.params.runId,
        req.params.proposalId,
        req.body || {}
      );
      res.json(proposalItem);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/runs/:runId/build-candidate", async (req, res, next) => {
    try {
      const result = await skillRefinementService.buildCandidate(req.params.runId);
      res.json(toClientProject(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/runs/:runId/approve", async (req, res, next) => {
    try {
      const result = await skillRefinementService.approveRun(req.params.runId);
      res.json(toClientProject(result));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-refinement/runs/:runId/reject", async (req, res, next) => {
    try {
      const result = await skillRefinementService.rejectRun(req.params.runId);
      res.json(toClientProject(result));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.statusCode || 500).json({
      error: error.message || "Internal server error",
      code: error.code || "internal_error",
      details: error.details || null
    });
  });

  return app;
}
