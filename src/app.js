import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "./config.js";
import { ensureStorage } from "./services/storage.js";
import { ProjectService } from "./services/project-service.js";
import { PipelineService, normalizeManualTitleOutline } from "./services/pipeline-service.js";
import { BenchmarkCaseService } from "./services/benchmark-case-service.js";
import { SkillRefinementService } from "./services/skill-refinement-service.js";
import { SkillBundleService } from "./services/skill-bundle-service.js";
import { LlmProfileService } from "./services/llm-profile-service.js";
import { RejectionService } from "./services/rejection-service.js";
import { ReplayTaskService } from "./services/replay-task-service.js";
import { HermesTaskQueueService } from "./services/hermes-task-queue-service.js";
import { UnitTestCaseGenerationService } from "./services/unit-test-case-generation-service.js";
import { ModuleSkillService } from "./services/module-skill-service.js";
import { SkillManagementService } from "./services/skill-management-service.js";
import { SkillWorkOrderService } from "./services/skill-work-order-service.js";
import { SkillLoader } from "./services/skill-loader.js";
import { ReplayLabService, DEFAULT_REPLAY_LAB_TEMPLATE_TASK_ID } from "./services/replay-lab-service.js";
import { FeedbackTicketService } from "./services/feedback-ticket-service.js";
import { buildStoredUploadName, normalizeUploadedFileName } from "./services/upload-filename.js";
import { HermesAgentClient } from "./services/hermes-agent-client.js";

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

function documentExtractionUploadFields() {
  return [
    { name: "images", maxCount: 12 },
    { name: "spreadsheets", maxCount: 4 }
  ];
}

function createHttpError(message, statusCode = 400, code = "request_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeDebugTimeoutMs(value, fallback = 60000) {
  const timeoutMs = Number(value || fallback);
  return Math.min(Math.max(Number.isFinite(timeoutMs) ? timeoutMs : fallback, 1000), 10 * 60 * 1000);
}

function getBearerHeaders(token = "") {
  const authToken = String(token || "").trim();
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

function getWorkerDebugConfig() {
  return {
    hermes: {
      baseURL: config.hermes.baseURL,
      apiMode: config.hermes.apiMode || "json",
      authConfigured: Boolean(config.hermes.authToken)
    },
    matlabWorker: {
      baseURL: config.matlabMcp.baseURL,
      httpMode: config.matlabMcp.httpMode || "path",
      authConfigured: Boolean(config.matlabMcp.authToken)
    }
  };
}

function getWorkerDebugDir() {
  return path.join(config.dataDir, "windows-worker-debug");
}

function getWorkerDebugArtifactPath() {
  return path.join(getWorkerDebugDir(), "latest-artifact.json");
}

async function fetchWorkerJson(url, options = {}) {
  const timeoutMs = normalizeDebugTimeoutMs(options.timeoutMs, 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
    const raw = await response.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch (_error) {
      body = { raw };
    }
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      error: error?.name === "AbortError" ? `Request timed out after ${timeoutMs}ms` : error?.message || "Request failed"
    };
  } finally {
    clearTimeout(timer);
  }
}

function createDebugHermesClient(timeoutMs) {
  return new HermesAgentClient({
    transport: "api",
    baseURL: config.hermes.baseURL,
    apiMode: config.hermes.apiMode || "json",
    authToken: config.hermes.authToken || "",
    timeoutMs,
    stepTimeoutMs: {
      ...(config.hermes.stepTimeoutMs || {}),
      document_extract_generate: timeoutMs,
      windows_worker_probe: timeoutMs
    }
  });
}

function createRuntimeEventCollector() {
  const events = [];
  return {
    events,
    onEvent(event) {
      events.push({
        ...event,
        capturedAt: new Date().toISOString()
      });
    }
  };
}

async function persistWorkerDebugArtifact(entry) {
  await fs.mkdir(getWorkerDebugDir(), { recursive: true });
  const record = {
    ...entry,
    savedAt: new Date().toISOString()
  };
  await fs.writeFile(getWorkerDebugArtifactPath(), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function createApp() {
  await ensureStorage();

  const app = express();
  const projectService = new ProjectService();
  const unitTestCaseGenerationService = new UnitTestCaseGenerationService();
  const hermesTaskQueueService = new HermesTaskQueueService({ projectService, unitTestCaseGenerationService });
  const pipelineService = new PipelineService(projectService, { hermesTaskQueueService });
  const benchmarkCaseService = new BenchmarkCaseService();
  const skillRefinementService = new SkillRefinementService();
  const skillBundleService = new SkillBundleService();
  const llmProfileService = new LlmProfileService();
  const rejectionService = new RejectionService();
  const replayTaskService = new ReplayTaskService({ hermesTaskQueueService });
  hermesTaskQueueService.setReplayTaskService(replayTaskService);
  const moduleSkillService = new ModuleSkillService();
  const skillManagementService = new SkillManagementService();
  const skillWorkOrderService = new SkillWorkOrderService();
  const skillLoader = new SkillLoader();
  const replayLabService = new ReplayLabService();
  const feedbackTicketService = new FeedbackTicketService();
  await skillBundleService.ensureInitialized();
  await llmProfileService.ensureInitialized();
  await projectService.recoverStaleGenerationTasks();
  await unitTestCaseGenerationService.recoverStaleTasks();

  function requestField(req, ...keys) {
    for (const key of keys) {
      const value = req.body?.[key] ?? req.query?.[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  async function resolveSkillReadTarget(req) {
    const requestedBundleId = requestField(req, "bundleId", "targetBundleId");
    const bundle = requestedBundleId
      ? await skillBundleService.getBundle(requestedBundleId)
      : await skillBundleService.getDefaultCandidateBundle();
    if (!bundle) {
      throw createHttpError("Skill bundle not found", 404, "skill_bundle_not_found", { bundleId: requestedBundleId });
    }
    return {
      bundle,
      skillDir: await skillBundleService.getSkillDir(bundle.id)
    };
  }

  async function resolveSkillItemWriteTarget(req) {
    const requestedBundleId = requestField(req, "targetBundleId", "bundleId");
    const directMode = String(config.skillVersioning?.directActiveSkillItemWrites || "allow").trim();
    if (!requestedBundleId && (directMode === "block" || directMode === "blocked")) {
      throw createHttpError(
        "Direct active skill edits are disabled; provide a candidate targetBundleId.",
        409,
        "direct_active_skill_write_blocked"
      );
    }
    const bundle = requestedBundleId
      ? await skillBundleService.getBundle(requestedBundleId)
      : await skillBundleService.getDefaultCandidateBundle();
    if (!bundle) {
      throw createHttpError("Skill bundle not found", 404, "skill_bundle_not_found", { bundleId: requestedBundleId });
    }
    if (bundle.status !== "candidate") {
      throw createHttpError(
        "Skill item writes must target a candidate bundle.",
        409,
        "direct_active_skill_write_blocked",
        { targetBundleId: bundle.id, status: bundle.status }
      );
    }
    return {
      bundle,
      skillDir: await skillBundleService.getSkillDir(bundle.id),
      sourceType: requestField(req, "changeSourceType", "sourceType") || "api_skill_edit",
      sourceId: requestField(req, "changeSourceId", "sourceId"),
      createdBy: requestField(req, "createdBy", "updatedBy", "deletedBy", "reorderedBy") || "api"
    };
  }

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
        const safeName = buildStoredUploadName(file.originalname);
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
        const safeName = buildStoredUploadName(file.originalname);
        cb(null, safeName);
      }
    })
  });

  const feedbackUpload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        try {
          await fs.mkdir(config.feedbackTicketUploadDir, { recursive: true });
          cb(null, config.feedbackTicketUploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (_req, file, cb) => {
        const safeName = buildStoredUploadName(file.originalname);
        cb(null, safeName);
      }
    }),
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 6
    }
  });

  const unitTestUpload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        try {
          await fs.mkdir(unitTestCaseGenerationService.uploadTempDir, { recursive: true });
          cb(null, unitTestCaseGenerationService.uploadTempDir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (_req, file, cb) => {
        const safeName = buildStoredUploadName(file.originalname);
        cb(null, safeName);
      }
    }),
    limits: {
      files: 2
    }
  });

  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get("/api/task-queue", async (_req, res, next) => {
    try {
      const tasks = await hermesTaskQueueService.listTaskSummaries();
      const counts = tasks.reduce(
        (acc, task) => {
          const status = task.status || "queued";
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        { queued: 0, running: 0, completed: 0, failed: 0 }
      );
      res.json({ tasks, counts });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/unit-test-case-generation/tasks", async (_req, res, next) => {
    try {
      const tasks = await unitTestCaseGenerationService.listTasks();
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/unit-test-case-generation/projects", async (_req, res, next) => {
    try {
      const projects = await unitTestCaseGenerationService.listProjects();
      res.json({ projects });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/unit-test-case-generation/projects", async (req, res, next) => {
    try {
      const project = await unitTestCaseGenerationService.createProject(req.body || {});
      res.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/unit-test-case-generation/projects/:projectId", async (req, res, next) => {
    try {
      const result = await unitTestCaseGenerationService.deleteProject(req.params.projectId, req.body || {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/unit-test-case-generation/tasks/:taskId", async (req, res, next) => {
    try {
      const task = await unitTestCaseGenerationService.getTask(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "单元测试用例生成任务不存在", code: "unit_test_case_task_not_found" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/unit-test-case-generation/tasks/:taskId/artifacts/:artifactId/download", async (req, res, next) => {
    try {
      const artifact = await unitTestCaseGenerationService.getArtifact(req.params.taskId, req.params.artifactId);
      res.download(artifact.absolutePath, artifact.fileName);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/unit-test-case-generation/tasks/:taskId", async (req, res, next) => {
    try {
      const queueCancelled = hermesTaskQueueService.cancelQueued("unit_test_case_generation", req.params.taskId);
      const result = await unitTestCaseGenerationService.deleteTask(req.params.taskId);
      res.json({ ...result, queueCancelled });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/unit-test-case-generation/tasks",
    unitTestUpload.fields([
      { name: "modelSlx", maxCount: 1 },
      { name: "modelMat", maxCount: 1 }
    ]),
    async (req, res, next) => {
      try {
        const task = await unitTestCaseGenerationService.createTask(req.files || {}, req.body || {});
        hermesTaskQueueService.enqueue({
          id: task.id,
          type: "unit_test_case_generation",
          title: "单元测试用例生成",
          run: () => unitTestCaseGenerationService.runTask(task.id),
          onError: (error) => unitTestCaseGenerationService.failTask(task.id, error)
        });
        const queuedTask = await unitTestCaseGenerationService.getTask(task.id);
        res.status(202).json({ task: queuedTask, taskStarted: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post("/api/feedback-tickets", feedbackUpload.array("images", 6), async (req, res, next) => {
    try {
      const ticket = await feedbackTicketService.createTicket(req.body || {}, req.files || []);
      res.status(201).json(ticket);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/feedback-tickets", async (_req, res, next) => {
    try {
      res.json(await feedbackTicketService.listTicketsForClient());
    } catch (error) {
      next(error);
    }
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "index.html"));
  });
  app.get("/projects/new", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "project-create.html"));
  });
  app.get("/projects/:projectId/edit", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "project-create.html"));
  });
  app.get("/projects/:projectId", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "project-detail.html"));
  });
  app.get("/projects/:projectId/modules/new", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "module-create.html"));
  });
  app.get("/projects/:projectId/modules/:moduleId/edit", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "module-create.html"));
  });
  app.get("/projects/:projectId/modules/:moduleId", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "module-detail.html"));
  });
  app.get("/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks/:taskId", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "task-detail.html"));
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
  app.get("/document-extractor", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "document-extractor.html"));
  });
  app.get("/slx-parser", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "slx-parser.html"));
  });
  app.get("/windows-worker-debug", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "windows-worker-debug.html"));
  });
  app.get("/slx-interpreter", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "slx-parser.html"));
  });
  app.get("/hil-test-case-generation", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "hil-test-case-generation.html"));
  });
  app.get("/unit-test-case-generation", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "unit-test-case-generation.html"));
  });
  app.get("/skill-refinement", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "skill-refinement.html"));
  });
  app.get("/skill-management", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "skill-management.html"));
  });
  app.get("/feedback-pool", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "feedback-pool.html"));
  });
  app.get("/feedback-tickets", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "feedback-tickets.html"));
  });
  app.get("/replay-lab", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "replay-lab.html"));
  });
  app.use("/feedback-ticket-assets", express.static(config.feedbackTicketUploadDir));
  app.use(express.static(config.publicDir));

  app.get("/api/meta", async (_req, res) => {
    const meta = await pipelineService.getMeta();
    res.json(meta);
  });

  app.get("/api/windows-worker-debug/config", (_req, res) => {
    res.json(getWorkerDebugConfig());
  });

  app.post("/api/windows-worker-debug/health", async (req, res) => {
    const timeoutMs = normalizeDebugTimeoutMs(req.body?.timeoutMs, 10000);
    const hermesBaseURL = String(config.hermes.baseURL || "").replace(/\/+$/, "");
    const matlabBaseURL = String(config.matlabMcp.baseURL || "").replace(/\/+$/, "");
    const [hermes, matlabWorker] = await Promise.all([
      fetchWorkerJson(`${hermesBaseURL}/api/health`, {
        timeoutMs,
        headers: getBearerHeaders(config.hermes.authToken)
      }),
      fetchWorkerJson(`${matlabBaseURL}/health`, {
        timeoutMs,
        headers: getBearerHeaders(config.matlabMcp.authToken)
      })
    ]);
    res.json({
      ok: Boolean(hermes.ok && matlabWorker.ok),
      checkedAt: new Date().toISOString(),
      config: getWorkerDebugConfig(),
      checks: {
        hermes,
        matlabWorker
      }
    });
  });

  app.post("/api/windows-worker-debug/upload-probe", async (req, res, next) => {
    const timeoutMs = normalizeDebugTimeoutMs(req.body?.timeoutMs, 60000);
    const probeId = `worker-probe-${Date.now()}-${randomUUID()}`;
    const probeDir = path.join(getWorkerDebugDir(), "local-probes", probeId);
    const fileName = "windows-worker-upload-probe.txt";
    const probePath = path.join(probeDir, fileName);
    const retainUploadedFiles = req.body?.retainUploadedFiles !== false;
    const probeText = [
      "software-doc-generator windows worker upload probe",
      `probeId=${probeId}`,
      `createdAt=${new Date().toISOString()}`,
      `localPath=${probePath}`
    ].join("\n");

    try {
      await fs.mkdir(probeDir, { recursive: true });
      await fs.writeFile(probePath, probeText, "utf8");
      const runtime = createRuntimeEventCollector();
      const response = await createDebugHermesClient(timeoutMs).executeStep(
        {
          taskId: probeId,
          stepType: "windows_worker_probe",
          allowedPaths: [probePath],
          inputArtifact: {
            probeId,
            probeFilePath: probePath,
            retainUploadedFiles,
            expectedText: probeText,
            requestedAt: new Date().toISOString()
          }
        },
        { onEvent: runtime.onEvent }
      );
      const savedArtifact = await persistWorkerDebugArtifact({
        type: "upload-probe",
        probeId,
        artifact: response.artifact || response,
        response,
        runtimeEvents: runtime.events
      });
      res.json({
        ok: true,
        probeId,
        retainedOnWindows: retainUploadedFiles,
        artifact: response.artifact || response,
        response,
        runtimeEvents: runtime.events,
        savedArtifact
      });
    } catch (error) {
      next(error);
    } finally {
      await fs.rm(probeDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  app.post("/api/windows-worker-debug/hermes-probe", async (req, res, next) => {
    const timeoutMs = normalizeDebugTimeoutMs(req.body?.timeoutMs, 60000);
    const probeId = `hermes-probe-${Date.now()}-${randomUUID()}`;
    const sourceText = String(req.body?.sourceText || "").trim() ||
      `Windows worker Hermes probe ${probeId} at ${new Date().toISOString()}`;

    try {
      const runtime = createRuntimeEventCollector();
      const response = await createDebugHermesClient(timeoutMs).executeStep(
        {
          taskId: probeId,
          stepType: "document_extract_generate",
          inputArtifact: {
            targetDocumentType: "software_requirement",
            module: { name: "Windows Worker Probe" },
            sourceText
          }
        },
        { onEvent: runtime.onEvent }
      );
      const savedArtifact = await persistWorkerDebugArtifact({
        type: "hermes-probe",
        probeId,
        artifact: response.artifact || response,
        response,
        runtimeEvents: runtime.events
      });
      res.json({
        ok: true,
        probeId,
        artifact: response.artifact || response,
        response,
        runtimeEvents: runtime.events,
        savedArtifact
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/windows-worker-debug/latest-artifact", async (_req, res, next) => {
    try {
      const artifactPath = getWorkerDebugArtifactPath();
      const raw = await fs.readFile(artifactPath, "utf8").catch(() => "");
      res.json({
        ok: Boolean(raw),
        artifactPath,
        record: raw ? JSON.parse(raw) : null
      });
    } catch (error) {
      next(error);
    }
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

  app.put("/api/projects/:projectId", async (req, res, next) => {
    try {
      const project = await projectService.updateProject(req.params.projectId, req.body || {});
      res.json(toClientProject(project));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId", async (req, res, next) => {
    try {
      const result = await projectService.deleteProject(req.params.projectId);
      res.json(result);
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

  app.delete("/api/projects/:projectId/modules/:moduleId", async (req, res, next) => {
    try {
      const result = await projectService.deleteModule(req.params.projectId, req.params.moduleId);
      res.json(result);
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

  app.get("/api/projects/:projectId/modules/:moduleId/assets/:assetId/content", async (req, res, next) => {
    try {
      const payload = await projectService.getModuleAssetContent(
        req.params.projectId,
        req.params.moduleId,
        req.params.assetId
      );
      res.json(payload);
    } catch (error) {
      if (error.message === "Asset not found") {
        return res.status(404).json({ error: "资产不存在" });
      }
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/assets/:assetId/download", async (req, res, next) => {
    try {
      const payload = await projectService.getModuleAssetDownload(
        req.params.projectId,
        req.params.moduleId,
        req.params.assetId
      );
      res.setHeader("Content-Type", payload.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(payload.size || 0));
      res.download(payload.path, payload.fileName);
    } catch (error) {
      if (error.message === "Asset not found") {
        return res.status(404).json({ error: "资产不存在" });
      }
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
      if (error.message === "Asset not found") {
        return res.status(404).json({ error: "资产不存在" });
      }
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/slx-interpreter/models", async (req, res, next) => {
    try {
      const models = await projectService.listSlxInterpreterModels(req.params.projectId, req.params.moduleId);
      res.json({ models });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/slx-interpreter/sessions", async (req, res, next) => {
    try {
      const sessions = await projectService.listSlxInterpreterSessions(req.params.projectId, req.params.moduleId);
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/slx-interpreter/tasks/:taskId", async (req, res, next) => {
    try {
      const task = await projectService.getSlxInterpreterTask(req.params.projectId, req.params.moduleId, req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "SLX 解释任务不存在" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/modules/:moduleId/slx-interpreter/messages", async (req, res, next) => {
    try {
      const result = await pipelineService.interpretSlxForModule(req.params.projectId, req.params.moduleId, {
        modelAssetId: req.body?.modelAssetId || "",
        question: req.body?.question || "",
        sessionId: req.body?.sessionId || "",
        asyncStart: true
      });
      res.status(202).json({ ...result, taskStarted: true });
    } catch (error) {
      if (error.message === "SLX model asset not found") {
        return res.status(404).json({ error: "SLX 模型资产不存在" });
      }
      if (error.message === "SLX interpreter session does not match selected model") {
        return res.status(409).json({ error: "会话与当前模型不匹配" });
      }
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/document-extraction-tasks", async (req, res, next) => {
    try {
      const tasks = await projectService.listDocumentExtractionTasks(req.params.projectId, req.params.moduleId);
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/document-extraction-tasks/:taskId", async (req, res, next) => {
    try {
      const task = await projectService.getDocumentExtractionTask(req.params.projectId, req.params.moduleId, req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "提取任务不存在" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId/modules/:moduleId/document-extraction-tasks/:taskId", async (req, res, next) => {
    try {
      const result = await projectService.deleteDocumentExtractionTask(
        req.params.projectId,
        req.params.moduleId,
        req.params.taskId
      );
      res.json(result);
    } catch (error) {
      if (error.message === "Document extraction task not found") {
        return res.status(404).json({ error: "提取任务不存在" });
      }
      next(error);
    }
  });

  app.post(
    "/api/projects/:projectId/modules/:moduleId/document-extraction-tasks",
    upload.fields(documentExtractionUploadFields()),
    async (req, res, next) => {
      try {
        const imageInputs = Array.isArray(req.files?.images)
          ? req.files.images.map((file) => ({
              originalName: normalizeUploadedFileName(file.originalname),
              storedName: file.filename,
              mimeType: file.mimetype,
              size: file.size,
              absolutePath: file.path,
              relativePath: path.join(req.params.projectId, req.params.moduleId, file.filename)
            }))
          : [];
        const spreadsheetInputs = Array.isArray(req.files?.spreadsheets)
          ? req.files.spreadsheets.map((file) => ({
              originalName: normalizeUploadedFileName(file.originalname),
              storedName: file.filename,
              mimeType: file.mimetype,
              size: file.size,
              absolutePath: file.path,
              relativePath: path.join(req.params.projectId, req.params.moduleId, file.filename)
            }))
          : [];
        const result = await pipelineService.extractDocumentForModule(req.params.projectId, req.params.moduleId, {
          targetDocumentType: req.body?.targetDocumentType || "software_requirement",
          sourceText: req.body?.sourceText || "",
          imageInputs,
          spreadsheetInputs,
          llmProfileId: req.body?.llmProfileId || "",
          asyncStart: true
        });
        res.status(202).json({ ...result, taskStarted: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/projects/:projectId/modules/:moduleId/slx-parser-tasks", async (req, res, next) => {
    try {
      const tasks = await projectService.listSlxParserTasks(req.params.projectId, req.params.moduleId);
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId/modules/:moduleId/slx-parser-tasks/:taskId", async (req, res, next) => {
    try {
      const task = await projectService.getSlxParserTask(req.params.projectId, req.params.moduleId, req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "SLX 解析任务不存在" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectId/modules/:moduleId/slx-parser-tasks/:taskId", async (req, res, next) => {
    try {
      const result = await projectService.deleteSlxParserTask(
        req.params.projectId,
        req.params.moduleId,
        req.params.taskId
      );
      res.json(result);
    } catch (error) {
      if (error.message === "SLX parser task not found") {
        return res.status(404).json({ error: "SLX 解析任务不存在" });
      }
      next(error);
    }
  });

  app.post(
    "/api/projects/:projectId/modules/:moduleId/slx-parser-tasks",
    upload.single("slx"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          const error = new Error("SLX file is required");
          error.statusCode = 400;
          throw error;
        }
        const originalName = normalizeUploadedFileName(req.file.originalname);
        if (!originalName.toLowerCase().endsWith(".slx")) {
          const error = new Error("Only .slx files are accepted");
          error.statusCode = 400;
          throw error;
        }
        const slxFile = {
          originalName,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          absolutePath: req.file.path,
          relativePath: path.join(req.params.projectId, req.params.moduleId, req.file.filename)
        };
        const result = await pipelineService.parseSlxForModule(req.params.projectId, req.params.moduleId, {
          slxFile,
          llmProfileId: req.body?.llmProfileId || "",
          asyncStart: true
        });
        res.status(202).json({ ...result, taskStarted: true });
      } catch (error) {
        next(error);
      }
    }
  );

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
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks/latest",
    async (req, res, next) => {
      try {
        const task = await projectService.getLatestGenerationTask(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType
        );
        if (!task) {
          return res.status(404).json({ error: "任务不存在" });
        }
        res.json(task);
      } catch (error) {
        next(error);
      }
    }
  );

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
          return res.status(404).json({ error: "任务不存在" });
        }
        res.json(task);
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/tasks/:taskId",
    async (req, res, next) => {
      try {
        const result = await projectService.deleteGenerationTask(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          req.params.taskId
        );
        res.json(result);
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
        const taskIntent = String(req.body?.taskIntent || "").trim() || "generation";
        let manualTitleOutline = null;
        if (req.params.documentType === "software_requirement" && taskIntent !== "module_skill_bootstrap") {
          manualTitleOutline = normalizeManualTitleOutline(req.body?.manualTitleOutline || "");
          if (!manualTitleOutline) {
            const error = new Error("manualTitleOutline is required and must be valid for software_requirement generation");
            error.statusCode = 400;
            error.code = "invalid_manual_title_outline";
            error.details = {
              documentType: req.params.documentType,
              taskIntent
            };
            throw error;
          }
        }
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
            taskIntent,
            manualTitleOutline,
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
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/accepted-items/reorder",
    async (req, res, next) => {
      try {
        const items = await projectService.reorderAcceptedItems(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          req.body?.orderedIds || []
        );
        res.json({ items });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    "/api/projects/:projectId/modules/:moduleId/spaces/:documentType/accepted-items/:itemId",
    async (req, res, next) => {
      try {
        const result = await projectService.deleteAcceptedItem(
          req.params.projectId,
          req.params.moduleId,
          req.params.documentType,
          req.params.itemId
        );
        res.json(result);
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

  app.delete("/api/rejections/:rejectionId", async (req, res, next) => {
    try {
      const result = await rejectionService.deleteRecord(req.params.rejectionId);
      res.json(result);
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
      const task = await replayTaskService.createTask({
        ...(req.body || {}),
        asyncExecution: true
      });
      res.status(201).json(task);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/replay-tasks", async (req, res, next) => {
    try {
      const tasks = await replayTaskService.listTasks(req.query || {});
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

  app.delete("/api/replay-tasks/:taskId", async (req, res, next) => {
    try {
      res.json(await replayTaskService.deleteTask(req.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/replay-lab/default-template", (_req, res) => {
    res.json({ taskId: DEFAULT_REPLAY_LAB_TEMPLATE_TASK_ID });
  });

  app.get("/api/replay-lab/templates/:taskId", async (req, res, next) => {
    try {
      res.json(await replayLabService.getTemplate(req.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/replay-lab/templates/:taskId/rerun", async (req, res, next) => {
    try {
      res.status(201).json(await replayLabService.rerunTemplate(req.params.taskId, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/replay-lab/runs/:taskId", async (req, res, next) => {
    try {
      res.json(await replayLabService.getRun(req.params.taskId));
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

  app.get("/api/skill-work-orders", async (req, res, next) => {
    try {
      const workOrders = await skillWorkOrderService.listWorkOrders(req.query || {});
      res.json({ workOrders });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-work-orders/:workOrderId", async (req, res, next) => {
    try {
      const workOrder = await skillWorkOrderService.getWorkOrder(req.params.workOrderId);
      if (!workOrder) {
        return res.status(404).json({ error: "Skill work order not found" });
      }
      res.json(workOrder);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-work-orders/:workOrderId/items/:itemId/review", async (req, res, next) => {
    try {
      const item = await skillWorkOrderService.reviewItem(req.params.workOrderId, req.params.itemId, req.body || {});
      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-work-orders/:workOrderId/items/:itemId/stage", async (req, res, next) => {
    try {
      const result = await skillWorkOrderService.stageItem(req.params.workOrderId, req.params.itemId, req.body || {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-work-orders/:workOrderId/items/:itemId/apply", async (req, res, next) => {
    try {
      const result = await skillWorkOrderService.applyItem(req.params.workOrderId, req.params.itemId, req.body || {});
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-work-orders/:workOrderId/close", async (req, res, next) => {
    try {
      const workOrder = await skillWorkOrderService.closeWorkOrder(req.params.workOrderId, req.body || {});
      res.json(workOrder);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-management", async (req, res, next) => {
    try {
      const target = await resolveSkillReadTarget(req);
      const payload = await skillManagementService.listSkills(target.skillDir);
      res.json({
        ...payload,
        skillBundle: target.bundle
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-management/:type/:key", async (req, res, next) => {
    try {
      const target = await resolveSkillReadTarget(req);
      const payload = await skillManagementService.getSkillDetail(req.params.type, req.params.key, target.skillDir);
      res.json({
        ...payload,
        skillBundle: target.bundle
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/skill-management/:type/:key", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      res.json(await skillManagementService.updateSkill(req.params.type, req.params.key, req.body || {}, target.skillDir));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/skill-management/:type/:key", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      res.json(await skillManagementService.deleteSkill(req.params.type, req.params.key, target.skillDir));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-items", async (req, res, next) => {
    try {
      const target = await resolveSkillReadTarget(req);
      const payload = await skillManagementService.listSkillItems(
        {
          layer: req.query.layer || "",
          profileKey: req.query.profileKey || "",
          kind: req.query.kind || "",
          query: req.query.query || "",
          documentTypeScope: req.query.documentTypeScope || "",
          includeDeprecated: req.query.includeDeprecated === "true"
        },
        target.skillDir
      );
      res.json({
        ...payload,
        skillBundle: target.bundle
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-items/:skillCode", async (req, res, next) => {
    try {
      const target = await resolveSkillReadTarget(req);
      const payload = await skillManagementService.getSkillItem(req.params.skillCode, target.skillDir);
      res.json({
        ...payload,
        skillBundle: target.bundle
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-items", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      const saved = await skillManagementService.createSkillItem(req.body || {}, target.skillDir);
      await skillBundleService.recordCandidateChange(target.bundle.id, {
        sourceType: target.sourceType,
        sourceId: target.sourceId,
        createdBy: target.createdBy,
        operation: "create",
        skillCode: saved.skillCode,
        afterSnapshot: saved
      });
      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/skill-items/:skillCode", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      const before = (await skillManagementService.getSkillItem(req.params.skillCode, target.skillDir)).item;
      const saved = await skillManagementService.updateSkillItem(req.params.skillCode, req.body || {}, target.skillDir);
      await skillBundleService.recordCandidateChange(target.bundle.id, {
        sourceType: target.sourceType,
        sourceId: target.sourceId,
        createdBy: target.createdBy,
        operation: "update",
        skillCode: saved.skillCode,
        beforeSnapshot: before,
        afterSnapshot: saved
      });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/skill-items/:skillCode", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      const before = (await skillManagementService.getSkillItem(req.params.skillCode, target.skillDir)).item;
      const removed = await skillManagementService.deleteSkillItem(req.params.skillCode, target.skillDir);
      await skillBundleService.recordCandidateChange(target.bundle.id, {
        sourceType: target.sourceType,
        sourceId: target.sourceId,
        createdBy: target.createdBy,
        operation: "delete",
        skillCode: before.skillCode,
        beforeSnapshot: before,
        afterSnapshot: null
      });
      res.json(removed);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-items/:skillCode/reorder", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      const beforeDetail = await skillManagementService.getSkillItem(req.params.skillCode, target.skillDir);
      const beforeOrder = {
        skillCode: beforeDetail.item.skillCode,
        layer: beforeDetail.item.layer,
        profileKey: beforeDetail.item.profileKey,
        kind: beforeDetail.item.kind,
        order: beforeDetail.item.order,
        siblingOrder: (beforeDetail.siblings || []).map((item) => item.skillCode)
      };
      const saved = await skillManagementService.reorderSkillItem(req.params.skillCode, req.body || {}, target.skillDir);
      const afterDetail = await skillManagementService.getSkillItem(req.params.skillCode, target.skillDir);
      const afterOrder = {
        skillCode: afterDetail.item.skillCode,
        layer: afterDetail.item.layer,
        profileKey: afterDetail.item.profileKey,
        kind: afterDetail.item.kind,
        order: afterDetail.item.order,
        siblingOrder: (afterDetail.siblings || []).map((item) => item.skillCode)
      };
      await skillBundleService.recordCandidateChange(target.bundle.id, {
        sourceType: target.sourceType,
        sourceId: target.sourceId,
        createdBy: target.createdBy,
        operation: "reorder",
        skillCode: saved.skillCode,
        beforeSnapshot: beforeOrder,
        afterSnapshot: afterOrder,
        changedFields: ["order"]
      });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-registry/materialize", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      res.json(await skillManagementService.exportCompatibilityFiles(target.skillDir));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-export/compatibility", async (req, res, next) => {
    try {
      const target = await resolveSkillItemWriteTarget(req);
      res.json(await skillManagementService.exportCompatibilityFiles(target.skillDir));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/compiled-skills/preview", async (req, res, next) => {
    try {
      const pack = await skillLoader.loadForContext({
        documentType: req.query.documentType || "software_requirement",
        domain: req.query.domain || "",
        moduleSkillKey: req.query.moduleSkillKey || ""
      });
      res.json({
        profiles: pack.__profiles || [],
        compiledPrompt: pack.__compiledPrompt || "",
        compiledSkillPack: pack.__compiledSkillPack || null
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/skill-bundles", async (_req, res, next) => {
    try {
      const activeBundle = await skillBundleService.getActiveBundle();
      const defaultCandidateBundle = await skillBundleService.getDefaultCandidateBundle();
      const bundles = await skillBundleService.listBundles();
      res.json({ activeBundle, defaultCandidateBundle, bundles });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-bundles/drafts", async (req, res, next) => {
    try {
      const bundle = await skillBundleService.createDraftBundle({
        baseBundleId: req.body?.baseBundleId || "",
        changeSummary: req.body?.changeSummary || "Manual draft skill bundle.",
        createdBy: req.body?.createdBy || "web-ui",
        sourceType: req.body?.sourceType || "manual_draft"
      });
      res.status(201).json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-bundles/:bundleId/release", async (req, res, next) => {
    try {
      res.json(
        await skillBundleService.releaseBundle(req.params.bundleId, {
          evaluationSummary: req.body?.evaluationSummary || null,
          releasedBy: req.body?.releasedBy || "web-ui",
          force: Boolean(req.body?.force)
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-bundles/:bundleId/rollback", async (req, res, next) => {
    try {
      res.json(await skillBundleService.rollbackBundle(req.params.bundleId, {
        reason: req.body?.reason || ""
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/skill-bundles/:bundleId/fork", async (req, res, next) => {
    try {
      const bundle = await skillBundleService.forkBundle(req.params.bundleId, {
        baseBundleId: req.body?.baseBundleId || "",
        changeSummary: req.body?.changeSummary || "",
        createdBy: req.body?.createdBy || "web-ui"
      });
      res.status(201).json(bundle);
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
    const isUploadError = error instanceof multer.MulterError;
    const statusCode = error.statusCode || (isUploadError ? 400 : 500);
    if (statusCode >= 500) {
      console.error(error);
    }
    res.status(statusCode).json({
      error: error.message || "Internal server error",
      code: error.code || (isUploadError ? "upload_error" : "internal_error"),
      details: error.details || null
    });
  });

  return app;
}
