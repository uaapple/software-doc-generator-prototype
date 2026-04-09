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
export async function createApp() {
  await ensureStorage();

  const app = express();
  const projectService = new ProjectService();
  const pipelineService = new PipelineService(projectService);
  const benchmarkCaseService = new BenchmarkCaseService();
  const skillRefinementService = new SkillRefinementService();
  const skillBundleService = new SkillBundleService();
  const llmProfileService = new LlmProfileService();
  await skillBundleService.ensureInitialized();
  await llmProfileService.ensureInitialized();

  const upload = multer({
    storage: multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const projectId = req.params.projectId;
          const destination = path.join(config.uploadDir, projectId);
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
  app.get("/skill-refinement", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "skill-refinement.html"));
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

  app.post(
    "/api/projects/:projectId/files",
    upload.fields([
      { name: "systemPdf", maxCount: 1 },
      { name: "modelPdf", maxCount: 4 },
      { name: "generatedCode", maxCount: 12 },
      { name: "slx", maxCount: 2 }
    ]),
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
    res.status(500).json({
      error: error.message || "Internal server error"
    });
  });

  return app;
}

