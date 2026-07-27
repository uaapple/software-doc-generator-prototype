import express from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  MatlabGatewayContractError,
  createConfiguredWorkspaceMapping,
  gatewayPath,
  mapContainerWorkspaceCode,
  rejectAbsolutePathFields,
  requireGatewayIdentifier,
  requireRelativeFileName
} from "./services/matlab-gateway-contract.js";
import { MatlabMcpClient, MatlabMcpError } from "./services/matlab-mcp-client.js";
import { validateModelFactBundle } from "./services/model-fact-bundle.js";

const GATEWAY_VERSION = "1.0.0";
const JOB_TERMINAL = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

function now() {
  return new Date().toISOString();
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

function publicJob(job) {
  if (!job) return null;
  return {
    schema: job.schema,
    jobId: job.jobId,
    workspaceId: job.workspaceId,
    operation: job.operation,
    status: job.status,
    inputAssetId: job.inputAssetId,
    artifactId: job.artifactId || "",
    createdAt: job.createdAt,
    startedAt: job.startedAt || "",
    endedAt: job.endedAt || "",
    timeoutMs: job.timeoutMs,
    error: job.error || null
  };
}

function gatewayError(code, message, statusCode = 400, details = null) {
  return new MatlabGatewayContractError(code, message, statusCode, details);
}

export class MatlabGatewayService {
  constructor(options = {}) {
    this.rootDir = path.resolve(
      options.rootDir ||
      process.env.MATLAB_GATEWAY_STATE_DIR ||
      path.join(os.tmpdir(), "software-doc-matlab-gateway")
    );
    this.mapping = createConfiguredWorkspaceMapping({
      id: options.mappingId || process.env.MATLAB_GATEWAY_MAPPING_ID || "worker-data",
      virtualRoot:
        options.containerRoot ||
        process.env.MATLAB_GATEWAY_CONTAINER_ROOT ||
        "/var/lib/sdg/data",
      hostRoot: options.hostRoot || process.env.MATLAB_GATEWAY_HOST_ROOT || ""
    });
    this.maxTimeoutMs = Math.max(
      1000,
      Number(options.maxTimeoutMs || process.env.MATLAB_GATEWAY_MAX_TIMEOUT_MS || 60 * 60 * 1000)
    );
    this.defaultTimeoutMs = Math.min(
      this.maxTimeoutMs,
      Math.max(1000, Number(options.defaultTimeoutMs || process.env.MATLAB_MCP_TIMEOUT_MS || 10 * 60 * 1000))
    );
    this.createClient = options.createClient || (() => createLocalMatlabClient(options));
    this.activeJobs = new Map();
  }

  workspaceDir(workspaceId) {
    return gatewayPath(this.rootDir, "workspaces", requireGatewayIdentifier(workspaceId, "workspaceId"));
  }

  workspaceMetadataPath(workspaceId) {
    return gatewayPath(this.workspaceDir(workspaceId), "workspace.json");
  }

  jobPath(workspaceId, jobId) {
    return gatewayPath(this.workspaceDir(workspaceId), "jobs", `${requireGatewayIdentifier(jobId, "jobId")}.json`);
  }

  assetMetadataPath(workspaceId, assetId) {
    return gatewayPath(this.workspaceDir(workspaceId), "assets", `${requireGatewayIdentifier(assetId, "assetId")}.json`);
  }

  artifactMetadataPath(workspaceId, artifactId) {
    return gatewayPath(
      this.workspaceDir(workspaceId),
      "artifacts",
      `${requireGatewayIdentifier(artifactId, "artifactId")}.json`
    );
  }

  async initialize() {
    await fs.mkdir(gatewayPath(this.rootDir, "workspaces"), { recursive: true });
  }

  async createWorkspace(workspaceId, body = {}) {
    const id = requireGatewayIdentifier(workspaceId, "workspaceId");
    rejectAbsolutePathFields(body);
    const mappingId = requireGatewayIdentifier(body.mappingId || this.mapping.id, "mappingId");
    if (mappingId !== this.mapping.id) {
      throw gatewayError("MAPPING_NOT_FOUND", `Unknown preconfigured mappingId: ${mappingId}`, 404);
    }
    const metadataPath = this.workspaceMetadataPath(id);
    const prior = await readJson(metadataPath);
    if (prior && prior.mappingId !== mappingId) {
      throw gatewayError("WORKSPACE_MAPPING_CONFLICT", "Workspace already exists with another mapping.", 409);
    }
    const metadata = prior || {
      schema: "matlab-gateway-workspace/v1",
      workspaceId: id,
      mappingId,
      createdAt: now()
    };
    await writeJson(metadataPath, metadata);
    return metadata;
  }

  async getWorkspace(workspaceId) {
    const metadata = await readJson(this.workspaceMetadataPath(workspaceId));
    if (!metadata) throw gatewayError("WORKSPACE_NOT_FOUND", "Gateway workspace was not found.", 404);
    return metadata;
  }

  async putTextAsset(workspaceId, assetId, body = {}) {
    const workspace = await this.getWorkspace(workspaceId);
    rejectAbsolutePathFields({ ...body, content: undefined });
    const id = requireGatewayIdentifier(assetId, "assetId");
    const fileName = requireRelativeFileName(body.fileName || `${id}.m`);
    const content = String(body.content || "");
    if (!content) throw gatewayError("ASSET_CONTENT_REQUIRED", "Text asset content is required.");
    const contentPath = gatewayPath(this.workspaceDir(workspace.workspaceId), "asset-data", `${id}.txt`);
    await fs.mkdir(path.dirname(contentPath), { recursive: true });
    await fs.writeFile(contentPath, content, "utf8");
    const metadata = {
      schema: "matlab-gateway-asset/v1",
      workspaceId: workspace.workspaceId,
      assetId: id,
      kind: "matlab-code",
      fileName,
      sizeBytes: Buffer.byteLength(content),
      createdAt: now()
    };
    await writeJson(this.assetMetadataPath(workspace.workspaceId, id), metadata);
    return metadata;
  }

  async putUploadedAsset(workspaceId, assetId, upload) {
    const workspace = await this.getWorkspace(workspaceId);
    const id = requireGatewayIdentifier(assetId, "assetId");
    if (!upload?.path) throw gatewayError("UPLOAD_REQUIRED", "An uploaded asset file is required.");
    const fileName = requireRelativeFileName(upload.originalname || `${id}.slx`);
    if (path.extname(fileName).toLowerCase() !== ".slx") {
      throw gatewayError("INVALID_FILE_TYPE", "Only .slx binary assets are accepted.");
    }
    const contentPath = gatewayPath(this.workspaceDir(workspace.workspaceId), "asset-data", `${id}.slx`);
    await fs.mkdir(path.dirname(contentPath), { recursive: true });
    await fs.rename(upload.path, contentPath).catch(async () => {
      await fs.copyFile(upload.path, contentPath);
      await fs.rm(upload.path, { force: true });
    });
    const stat = await fs.stat(contentPath);
    const metadata = {
      schema: "matlab-gateway-asset/v1",
      workspaceId: workspace.workspaceId,
      assetId: id,
      kind: "simulink-slx",
      fileName,
      sizeBytes: stat.size,
      createdAt: now()
    };
    await writeJson(this.assetMetadataPath(workspace.workspaceId, id), metadata);
    return metadata;
  }

  async getAsset(workspaceId, assetId) {
    await this.getWorkspace(workspaceId);
    const metadata = await readJson(this.assetMetadataPath(workspaceId, assetId));
    if (!metadata) throw gatewayError("ASSET_NOT_FOUND", "Gateway asset was not found.", 404);
    return metadata;
  }

  assetContentPath(workspaceId, asset) {
    const suffix = asset.kind === "simulink-slx" ? ".slx" : ".txt";
    return gatewayPath(this.workspaceDir(workspaceId), "asset-data", `${asset.assetId}${suffix}`);
  }

  async submitJob(jobId, body = {}) {
    rejectAbsolutePathFields(body);
    const id = requireGatewayIdentifier(jobId, "jobId");
    const workspaceId = requireGatewayIdentifier(body.workspaceId, "workspaceId");
    const operation = String(body.operation || "").trim();
    if (!["evaluate_matlab_code", "analyze_slx"].includes(operation)) {
      throw gatewayError("OPERATION_UNSUPPORTED", `Unsupported MATLAB Gateway operation: ${operation}`);
    }
    const inputAssetId = requireGatewayIdentifier(body.inputAssetId, "inputAssetId");
    const asset = await this.getAsset(workspaceId, inputAssetId);
    if (
      (operation === "evaluate_matlab_code" && asset.kind !== "matlab-code") ||
      (operation === "analyze_slx" && asset.kind !== "simulink-slx")
    ) {
      throw gatewayError("ASSET_KIND_MISMATCH", "Input asset kind does not match the requested operation.");
    }
    const prior = await readJson(this.jobPath(workspaceId, id));
    if (prior) return publicJob(prior);
    const timeoutMs = Math.min(
      this.maxTimeoutMs,
      Math.max(1000, Number(body.timeoutMs || this.defaultTimeoutMs) || this.defaultTimeoutMs)
    );
    const job = {
      schema: "matlab-gateway-job/v1",
      jobId: id,
      workspaceId,
      operation,
      inputAssetId,
      artifactId: "",
      status: "queued",
      timeoutMs,
      createdAt: now(),
      startedAt: "",
      endedAt: "",
      error: null
    };
    await writeJson(this.jobPath(workspaceId, id), job);
    this.runJob(job).catch(() => {});
    const active = this.activeJobs.get(id);
    if (active?.started) await active.started;
    return this.getJob(id, workspaceId);
  }

  async getJob(jobId, workspaceId) {
    const job = await readJson(this.jobPath(workspaceId, jobId));
    if (!job) throw gatewayError("JOB_NOT_FOUND", "Gateway job was not found.", 404);
    return publicJob(job);
  }

  async saveJob(job) {
    await writeJson(this.jobPath(job.workspaceId, job.jobId), job);
  }

  async runJob(job) {
    if (this.activeJobs.has(job.jobId)) return this.activeJobs.get(job.jobId).promise;
    const state = {
      cancelled: false,
      timedOut: false,
      client: null,
      timer: null,
      promise: null,
      started: null,
      resolveStarted: null
    };
    state.started = new Promise((resolve) => {
      state.resolveStarted = resolve;
    });
    state.promise = this.runJobInternal(job, state).finally(() => {
      state.resolveStarted?.();
      if (state.timer) clearTimeout(state.timer);
      this.activeJobs.delete(job.jobId);
    });
    this.activeJobs.set(job.jobId, state);
    return state.promise;
  }

  async runJobInternal(job, state) {
    job.status = "running";
    job.startedAt = now();
    await this.saveJob(job);
    state.resolveStarted?.();
    const client = this.createClient();
    state.client = client;
    const timeout = new Promise((_, reject) => {
      state.timer = setTimeout(() => {
        state.timedOut = true;
        client.shutdown?.().catch(() => {});
        reject(gatewayError("JOB_TIMEOUT", `MATLAB job timed out after ${job.timeoutMs}ms.`, 504));
      }, job.timeoutMs);
    });
    try {
      const asset = await this.getAsset(job.workspaceId, job.inputAssetId);
      const contentPath = this.assetContentPath(job.workspaceId, asset);
      let result;
      if (job.operation === "evaluate_matlab_code") {
        const code = await fs.readFile(contentPath, "utf8");
        const mapped = mapContainerWorkspaceCode(code, this.mapping);
        result = await Promise.race([
          client.callTool("evaluate_matlab_code", { code: mapped.code }),
          timeout
        ]);
      } else {
        result = await Promise.race([
          client.analyzeSlx({
            absolutePath: contentPath,
            originalName: asset.fileName,
            documentType: "software_requirement"
          }),
          timeout
        ]);
        const validation = validateModelFactBundle(result);
        if (!validation.valid) {
          throw gatewayError(
            "INVALID_BUNDLE",
            `MATLAB MCP returned an invalid ModelFactBundle: ${validation.error}`,
            502
          );
        }
      }
      if (state.cancelled) return;
      const artifactId = `result-${job.jobId}`;
      const artifact = {
        schema: "matlab-gateway-artifact/v1",
        workspaceId: job.workspaceId,
        artifactId,
        jobId: job.jobId,
        mediaType: "application/json",
        createdAt: now(),
        result
      };
      await writeJson(this.artifactMetadataPath(job.workspaceId, artifactId), artifact);
      job.artifactId = artifactId;
      job.status = "succeeded";
      job.endedAt = now();
      await this.saveJob(job);
    } catch (error) {
      if (state.cancelled) return;
      job.status = state.timedOut ? "timed_out" : "failed";
      job.endedAt = now();
      job.error = {
        code: error?.code || "MATLAB_JOB_FAILED",
        message: String(error?.message || "MATLAB Gateway job failed.")
      };
      await this.saveJob(job);
    } finally {
      if (state.timer) clearTimeout(state.timer);
      await client.shutdown?.().catch(() => {});
    }
  }

  async cancelJob(jobId, workspaceId) {
    const job = await readJson(this.jobPath(workspaceId, jobId));
    if (!job) throw gatewayError("JOB_NOT_FOUND", "Gateway job was not found.", 404);
    if (JOB_TERMINAL.has(job.status)) return publicJob(job);
    const active = this.activeJobs.get(job.jobId);
    if (active) {
      active.cancelled = true;
      await active.client?.shutdown?.().catch(() => {});
    }
    job.status = "cancelled";
    job.endedAt = now();
    job.error = { code: "JOB_CANCELLED", message: "MATLAB Gateway job was cancelled." };
    await this.saveJob(job);
    return publicJob(job);
  }

  async getArtifact(workspaceId, artifactId) {
    const artifact = await readJson(this.artifactMetadataPath(workspaceId, artifactId));
    if (!artifact) throw gatewayError("ARTIFACT_NOT_FOUND", "Gateway artifact was not found.", 404);
    return artifact;
  }

  async cleanupJob(jobId, workspaceId) {
    const job = await readJson(this.jobPath(workspaceId, jobId));
    if (!job) return { ok: true, removed: false };
    if (!JOB_TERMINAL.has(job.status)) {
      throw gatewayError("JOB_ACTIVE", "Active Gateway jobs must be cancelled before cleanup.", 409);
    }
    if (job.artifactId) {
      await fs.rm(this.artifactMetadataPath(workspaceId, job.artifactId), { force: true });
    }
    await fs.rm(this.jobPath(workspaceId, jobId), { force: true });
    return { ok: true, removed: true };
  }

  async cleanupWorkspace(workspaceId) {
    const workspace = await this.getWorkspace(workspaceId);
    const jobsDir = gatewayPath(this.workspaceDir(workspace.workspaceId), "jobs");
    const jobNames = await fs.readdir(jobsDir).catch(() => []);
    for (const name of jobNames.filter((entry) => entry.endsWith(".json"))) {
      const job = await readJson(path.join(jobsDir, name));
      if (job && !JOB_TERMINAL.has(job.status)) {
        throw gatewayError("WORKSPACE_ACTIVE", "Workspace has an active MATLAB job.", 409);
      }
    }
    await fs.rm(this.workspaceDir(workspace.workspaceId), { recursive: true, force: true });
    return { ok: true, removed: true };
  }
}

export async function createMatlabGatewayApp(options = {}) {
  const service = options.service || new MatlabGatewayService(options);
  await service.initialize();
  const authToken = String(options.authToken ?? process.env.MATLAB_MCP_AUTH_TOKEN ?? "").trim();
  const uploadDir = gatewayPath(service.rootDir, "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const upload = multer({
    dest: uploadDir,
    limits: {
      fileSize: Number(options.maxUploadBytes || process.env.MATLAB_WORKER_MAX_UPLOAD_BYTES || 250 * 1024 * 1024)
    }
  });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: options.jsonLimit || "4mb" }));

  function requireAuth(req, res, next) {
    if (!authToken) return next();
    if (String(req.get("authorization") || "") === `Bearer ${authToken}`) return next();
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid MATLAB Gateway token." } });
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "matlab-gateway",
      version: GATEWAY_VERSION,
      activeJobs: service.activeJobs.size,
      timestamp: now()
    });
  });

  app.get("/version", requireAuth, (_req, res) => {
    res.json({
      schema: "matlab-gateway-version/v1",
      service: "matlab-gateway",
      gatewayVersion: GATEWAY_VERSION,
      matlabRelease: process.env.MATLAB_RELEASE || "unknown",
      matlabMcpVersion: process.env.MATLAB_MCP_VERSION || "unknown",
      satkVersion: process.env.SATK_VERSION || "unknown"
    });
  });

  app.get("/capabilities", requireAuth, (_req, res) => {
    res.json({
      schema: "matlab-gateway-capabilities/v1",
      operations: ["evaluate_matlab_code", "analyze_slx"],
      contracts: {
        workspaces: true,
        assets: ["matlab-code", "simulink-slx"],
        jobs: true,
        artifacts: true,
        cancellation: true,
        cleanup: true,
        absolutePathRequests: false,
        preconfiguredMappingIds: [service.mapping.id]
      },
      limits: {
        maxTimeoutMs: service.maxTimeoutMs
      }
    });
  });

  app.put("/api/workspaces/:workspaceId", requireAuth, asyncRoute(async (req, res) => {
    res.status(201).json(await service.createWorkspace(req.params.workspaceId, req.body || {}));
  }));
  app.put("/api/workspaces/:workspaceId/assets/:assetId/text", requireAuth, asyncRoute(async (req, res) => {
    res.status(201).json(await service.putTextAsset(req.params.workspaceId, req.params.assetId, req.body || {}));
  }));
  app.put(
    "/api/workspaces/:workspaceId/assets/:assetId/upload",
    requireAuth,
    upload.single("asset"),
    asyncRoute(async (req, res) => {
      try {
        res.status(201).json(await service.putUploadedAsset(req.params.workspaceId, req.params.assetId, req.file));
      } finally {
        if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
      }
    })
  );
  app.post("/api/jobs/:jobId", requireAuth, asyncRoute(async (req, res) => {
    res.status(202).json(await service.submitJob(req.params.jobId, req.body || {}));
  }));
  app.get("/api/jobs/:jobId", requireAuth, asyncRoute(async (req, res) => {
    res.json(await service.getJob(req.params.jobId, req.query.workspaceId));
  }));
  app.post("/api/jobs/:jobId/cancel", requireAuth, asyncRoute(async (req, res) => {
    rejectAbsolutePathFields(req.body || {});
    res.json(await service.cancelJob(req.params.jobId, req.body?.workspaceId));
  }));
  app.delete("/api/jobs/:jobId", requireAuth, asyncRoute(async (req, res) => {
    res.json(await service.cleanupJob(req.params.jobId, req.query.workspaceId));
  }));
  app.get(
    "/api/workspaces/:workspaceId/artifacts/:artifactId",
    requireAuth,
    asyncRoute(async (req, res) => {
      res.json(await service.getArtifact(req.params.workspaceId, req.params.artifactId));
    })
  );
  app.delete("/api/workspaces/:workspaceId", requireAuth, asyncRoute(async (req, res) => {
    res.json(await service.cleanupWorkspace(req.params.workspaceId));
  }));

  // Compatibility endpoint remains upload-only. filePath is intentionally rejected.
  app.post("/mcp/tools/analyze_slx", requireAuth, upload.single("slx"), asyncRoute(async (req, res) => {
    if (req.body?.filePath) {
      throw gatewayError("ABSOLUTE_PATH_FORBIDDEN", "filePath mode is disabled; upload the SLX asset.", 400);
    }
    const workspaceId = `upload-${randomUUID()}`;
    const assetId = "model";
    const jobId = `analyze-${randomUUID()}`;
    try {
      await service.createWorkspace(workspaceId, { mappingId: service.mapping.id });
      await service.putUploadedAsset(workspaceId, assetId, req.file);
      await service.submitJob(jobId, { workspaceId, operation: "analyze_slx", inputAssetId: assetId });
      const job = await waitForTerminalJob(service, jobId, workspaceId);
      if (job.status !== "succeeded") {
        const error = gatewayError(job.error?.code || "SLX_ANALYSIS_FAILED", job.error?.message || "SLX analysis failed.", 502);
        throw error;
      }
      const artifact = await service.getArtifact(workspaceId, job.artifactId);
      res.json({ result: artifact.result });
    } finally {
      await service.cancelJob(jobId, workspaceId).catch(() => {});
      await service.cleanupWorkspace(workspaceId).catch(() => {});
      if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    }
  }));

  app.use((error, _req, res, _next) => {
    const known = error instanceof MatlabGatewayContractError || error instanceof MatlabMcpError;
    const statusCode = Number(error?.statusCode) || (error instanceof MatlabMcpError ? 502 : known ? 400 : 500);
    res.status(statusCode).json({
      error: {
        code: error?.code || "MATLAB_GATEWAY_FAILED",
        message: String(error?.message || "MATLAB Gateway request failed."),
        details: error?.details || null
      }
    });
  });

  app.locals.matlabGatewayService = service;
  return app;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function waitForTerminalJob(service, jobId, workspaceId) {
  for (;;) {
    const job = await service.getJob(jobId, workspaceId);
    if (JOB_TERMINAL.has(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function createLocalMatlabClient(options = {}) {
  const rootDir = path.resolve(options.projectRoot || process.cwd());
  const matlabRoot = options.matlabRoot || process.env.MATLAB_ROOT || "/Applications/MATLAB_R2026a.app";
  const toolkitRoot =
    options.toolkitRoot ||
    process.env.SIMULINK_AGENTIC_TOOLKIT_ROOT ||
    path.join(os.homedir(), ".matlab", "agentic-toolkits", "simulink");
  return new MatlabMcpClient({
    transport: "stdio",
    timeoutMs: Number(options.mcpTimeoutMs || process.env.MATLAB_MCP_TIMEOUT_MS || 10 * 60 * 1000),
    tempDir: options.mcpTempDir || process.env.MATLAB_MCP_TMPDIR || path.join(os.tmpdir(), "software-doc-matlab-mcp"),
    serverCommand:
      options.serverCommand ||
      process.env.MATLAB_MCP_SERVER_COMMAND ||
      path.join(os.homedir(), ".matlab", "agentic-toolkits", "bin", "matlab-mcp-server"),
    serverArgs: options.serverArgs || [
      "--matlab-session-mode=" + (process.env.SATK_MATLAB_SESSION_MODE || "existing"),
      "--extension-file=" +
        (process.env.SIMULINK_AGENTIC_TOOLKIT_TOOLS_FILE || path.join(toolkitRoot, "tools", "tools.json")),
      ...(process.env.SATK_MATLAB_SESSION_MODE === "new" ? [`--matlab-root=${matlabRoot}`] : [])
    ],
    serverEnv: {
      SOFTWARE_DOC_PROJECT_ROOT: rootDir
    }
  });
}

export { GATEWAY_VERSION as MATLAB_GATEWAY_VERSION };
