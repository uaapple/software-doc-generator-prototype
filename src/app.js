import express from "express";
import multer from "multer";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "./config.js";
import { ensureStorage } from "./services/storage.js";
import { ProjectService } from "./services/project-service.js";
import { PipelineService } from "./services/pipeline-service.js";

export async function createApp() {
  await ensureStorage();

  const app = express();
  const projectService = new ProjectService();
  const pipelineService = new PipelineService(projectService);

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

  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(config.publicDir));

  app.get("/api/meta", async (_req, res) => {
    const meta = await pipelineService.getMeta();
    res.json(meta);
  });

  app.get("/api/projects", async (_req, res) => {
    const projects = await projectService.listProjects();
    res.json({ projects });
  });

  app.post("/api/projects", async (req, res, next) => {
    try {
      const project = await projectService.createProject(req.body || {});
      res.status(201).json(project);
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

      res.json(project);
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
        res.json(project);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post("/api/projects/:projectId/generate", async (req, res, next) => {
    try {
      const result = await pipelineService.generate(req.params.projectId, req.body || {});
      res.json(result);
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
      res.json(project);
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
