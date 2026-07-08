import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { HermesAgentClient } from "./hermes-agent-client.js";
import { readJson, writeJson, pathExists } from "./storage.js";
import { normalizeUploadedFileName } from "./upload-filename.js";

const TASK_FILE_NAME = "task.json";
const PROJECTS_FILE_NAME = "projects.json";
const QUEUE_TYPE = "software_module_description_generation";
const STEP_TYPE = "simulink_module_description_generate";
const PROJECT_ID_PATTERN = /^\d{2,}$/;
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function now() {
  return new Date().toISOString();
}

function createHttpError(message, statusCode = 400, code = "software_module_description_generation_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function softwareModuleDescriptionConfig() {
  return {
    taskStoreDir: config.softwareModuleDescription?.taskStoreDir || path.join(config.dataDir, "software-module-description-generation", "tasks"),
    uploadTempDir: config.softwareModuleDescription?.uploadTempDir || path.join(config.dataDir, "software-module-description-generation", "_incoming"),
    projectRegistryPath: config.unitTestCase?.projectRegistryPath || path.join(config.dataDir, "software-module-description-generation", PROJECTS_FILE_NAME),
    projectAdminCode: String(config.unitTestCase?.projectAdminCode || "114301"),
    defaultProjects: config.unitTestCase?.defaultProjects || "01_楚能,02_TMS",
    skillName: config.softwareModuleDescription?.skillName || "simulink-module-description-generator",
    expectedOutputPattern: config.softwareModuleDescription?.expectedOutputPattern || "outputs/*.docx",
    agentWorkspaceRoot: String(
      config.softwareModuleDescription?.agentWorkspaceRoot || config.unitTestCase?.agentWorkspaceRoot || ""
    ).trim()
  };
}

function normalizeProjectName(value = "") {
  return String(value || "")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 60);
}

function normalizeProjectId(value = "") {
  return String(value || "").trim();
}

function normalizeProjectRecord(project = {}) {
  project ||= {};
  const id = normalizeProjectId(project.id);
  const name = normalizeProjectName(project.name || String(project.label || "").replace(/^\d{2,}_/, ""));
  if (!PROJECT_ID_PATTERN.test(id) || !name) {
    return null;
  }
  return {
    id,
    name,
    label: `${id}_${name}`
  };
}

function parseDefaultProjects(value = "") {
  const projects = String(value || "01_楚能,02_TMS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d{2,})_(.+)$/);
      if (!match) {
        return null;
      }
      return normalizeProjectRecord({ id: match[1], name: match[2] });
    })
    .filter(Boolean);
  return projects.length ? projects : [
    { id: "01", name: "楚能", label: "01_楚能" },
    { id: "02", name: "TMS", label: "02_TMS" }
  ];
}

function buildProjectRegistry(projects = []) {
  const normalized = [];
  const seen = new Set();
  for (const project of projects) {
    const record = normalizeProjectRecord(project);
    if (!record || seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    normalized.push(record);
  }
  normalized.sort((a, b) => a.id.localeCompare(b.id, "zh-CN", { numeric: true }));
  const maxNumber = normalized.reduce((max, project) => Math.max(max, Number(project.id) || 0), 0);
  return {
    version: 1,
    nextProjectNumber: Math.max(1, maxNumber + 1),
    projects: normalized
  };
}

function publicProject(project = {}) {
  const normalized = normalizeProjectRecord(project);
  return normalized ? { ...normalized } : null;
}

function defaultLegacyProject() {
  return (
    parseDefaultProjects(softwareModuleDescriptionConfig().defaultProjects).find((project) => project.id === "01") ||
    { id: "01", name: "楚能", label: "01_楚能" }
  );
}

function normalizeTaskProjectSnapshot(project = null) {
  return publicProject(project) || defaultLegacyProject();
}

function assertProjectAdminCode(authCode = "") {
  const expected = softwareModuleDescriptionConfig().projectAdminCode;
  if (String(authCode || "") !== expected) {
    throw createHttpError("项目授权码不正确。", 403, "software_module_description_project_auth_failed");
  }
}

function normalizeExtension(fileName = "") {
  return path.extname(String(fileName || "").trim()).toLowerCase();
}

function sanitizeStoredFileName(originalName = "", fallbackName = "upload.bin") {
  const normalized = normalizeUploadedFileName(originalName) || fallbackName;
  const baseName = path.basename(normalized).replace(/[^\w.\-()\u4e00-\u9fa5]+/g, "_");
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${baseName}`;
}

function toMatlabModelBase(originalName = "", fallbackBase = "model") {
  const normalized = normalizeUploadedFileName(originalName) || `${fallbackBase}.slx`;
  const parsed = path.parse(path.basename(normalized));
  let base = String(parsed.name || fallbackBase)
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) {
    base = fallbackBase;
  }
  if (!/^[A-Za-z]/.test(base)) {
    base = `model_${base}`;
  }
  if (base === "ITKLib") {
    base = "model_ITKLib";
  }
  return base;
}

function normalizeTaskFiles(files = {}) {
  return {
    modelSlx: Array.isArray(files.modelSlx) ? files.modelSlx : [],
    modelMat: Array.isArray(files.modelMat) ? files.modelMat : [],
    modelInitScript: Array.isArray(files.modelInitScript) ? files.modelInitScript : []
  };
}

function normalizeStoredRelativePath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function isDocxOutput(relativePath = "") {
  const normalized = normalizeStoredRelativePath(relativePath);
  if (!normalized || normalized.includes("..")) {
    return false;
  }
  const parts = normalized.split("/").filter(Boolean);
  return parts.length === 2 && parts[0] === "outputs" && parts[1].toLowerCase().endsWith(".docx");
}

function toPlatformPath(filePath = "") {
  return path.resolve(String(filePath || ""));
}

function usesWindowsPath(value = "") {
  return /^[a-zA-Z]:[\\/]/.test(value) || String(value || "").includes("\\");
}

function joinAgentPath(root = "", relativePath = "") {
  if (!root) {
    return "";
  }
  const normalizedRelative = normalizeStoredRelativePath(relativePath);
  if (usesWindowsPath(root)) {
    return path.win32.join(root, ...normalizedRelative.split("/").filter(Boolean));
  }
  return path.join(root, ...normalizedRelative.split("/").filter(Boolean));
}

function buildAgentPath(localPath = "", options = {}) {
  const agentRoot = String(options.agentWorkspaceRoot || "").trim();
  if (!agentRoot) {
    return localPath;
  }
  const relative = path.relative(options.localTaskStoreDir, localPath);
  return joinAgentPath(agentRoot, relative);
}

function buildProgress(status = "queued", message = "") {
  const progressByStatus = {
    queued: { stage: "queued", percent: 4, label: "等待执行", message: message || "任务已进入 Hermes 队列。" },
    running: { stage: "running", percent: 45, label: "Hermes 生成中", message: message || "Hermes Agent 正在生成软件详设 DOCX。" },
    completed: { stage: "completed", percent: 100, label: "已完成", message: message || "软件详设 DOCX 已生成，可下载结果。" },
    failed: { stage: "failed", percent: 100, label: "已失败", message: message || "生成任务失败，请查看错误原因。" }
  };
  return {
    ...(progressByStatus[status] || progressByStatus.queued),
    updatedAt: now()
  };
}

function clipTaskMessage(value = "", maxLength = 1800) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function taskFilePath(taskDir = "") {
  return path.join(taskDir, TASK_FILE_NAME);
}

function publicTask(task = {}) {
  const clone = structuredClone(task);
  clone.unitTestProject = normalizeTaskProjectSnapshot(clone.unitTestProject);
  if (clone.workspace) {
    clone.workspace = {
      directory: clone.workspace.directory,
      inputDir: clone.workspace.inputDir,
      outputDir: clone.workspace.outputDir,
      agentDirectory: clone.workspace.agentDirectory || "",
      agentOutputDir: clone.workspace.agentOutputDir || ""
    };
  }
  return clone;
}

async function copyUploadedFile(file = {}, targetPath = "") {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(file.path, targetPath);
}

async function cleanupTempFiles(files = {}) {
  const allFiles = [...(files.modelSlx || []), ...(files.modelMat || []), ...(files.modelInitScript || [])];
  await Promise.all(
    allFiles
      .map((file) => file?.path)
      .filter(Boolean)
      .map((filePath) => fs.rm(filePath, { force: true }).catch(() => null))
  );
}

export class SoftwareModuleDescriptionGenerationService {
  constructor(options = {}) {
    this.hermesAgentClient = options.hermesAgentClient || new HermesAgentClient();
    this.deletedTaskIds = new Set();
  }

  get storeDir() {
    return softwareModuleDescriptionConfig().taskStoreDir;
  }

  get uploadTempDir() {
    return softwareModuleDescriptionConfig().uploadTempDir;
  }

  getTaskDir(taskId = "") {
    const id = String(taskId || "").trim();
    const storeDir = path.resolve(this.storeDir);
    const taskDir = path.resolve(storeDir, id);
    if (!id || taskDir === storeDir || !taskDir.startsWith(`${storeDir}${path.sep}`)) {
      throw createHttpError("任务 ID 非法。", 400, "software_module_description_invalid_task_id");
    }
    return taskDir;
  }

  async ensureDirs() {
    const cfg = softwareModuleDescriptionConfig();
    await Promise.all([
      fs.mkdir(cfg.taskStoreDir, { recursive: true }),
      fs.mkdir(cfg.uploadTempDir, { recursive: true }),
      fs.mkdir(path.dirname(cfg.projectRegistryPath), { recursive: true })
    ]);
  }

  async readProjectRegistry() {
    await this.ensureDirs();
    const cfg = softwareModuleDescriptionConfig();
    const fallback = buildProjectRegistry(parseDefaultProjects(cfg.defaultProjects));
    const stored = await readJson(cfg.projectRegistryPath, null);
    if (!stored || !Array.isArray(stored.projects)) {
      await writeJson(cfg.projectRegistryPath, fallback);
      return fallback;
    }
    const normalized = buildProjectRegistry(stored.projects);
    normalized.nextProjectNumber = Math.max(
      Number(stored.nextProjectNumber || 0) || 0,
      normalized.nextProjectNumber
    );
    if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
      await writeJson(cfg.projectRegistryPath, normalized);
    }
    return normalized;
  }

  async saveProjectRegistry(registry = {}) {
    await this.ensureDirs();
    const normalized = buildProjectRegistry(registry.projects || []);
    normalized.nextProjectNumber = Math.max(
      Number(registry.nextProjectNumber || 0) || 0,
      normalized.nextProjectNumber
    );
    await writeJson(softwareModuleDescriptionConfig().projectRegistryPath, normalized);
    return normalized;
  }

  async listProjects() {
    const registry = await this.readProjectRegistry();
    return registry.projects.map(publicProject).filter(Boolean);
  }

  async getUnitTestProject(projectId = "") {
    const id = normalizeProjectId(projectId);
    if (!PROJECT_ID_PATTERN.test(id)) {
      throw createHttpError("请选择有效的项目编号。", 400, "software_module_description_invalid_project_id");
    }
    const projects = await this.listProjects();
    const project = projects.find((item) => item.id === id);
    if (!project) {
      throw createHttpError("项目不存在。", 400, "software_module_description_project_not_found", { projectId: id });
    }
    return project;
  }

  async createProject(input = {}) {
    assertProjectAdminCode(input.authCode);
    const name = normalizeProjectName(input.name);
    if (!name) {
      throw createHttpError("项目名不能为空。", 400, "software_module_description_project_name_required");
    }
    const registry = await this.readProjectRegistry();
    const usedIds = new Set(registry.projects.map((project) => project.id));
    let candidateNumber = Math.max(1, Number(registry.nextProjectNumber || 1) || 1);
    let id = String(candidateNumber).padStart(2, "0");
    while (usedIds.has(id)) {
      candidateNumber += 1;
      id = String(candidateNumber).padStart(2, "0");
    }
    const project = { id, name, label: `${id}_${name}` };
    const saved = await this.saveProjectRegistry({
      nextProjectNumber: candidateNumber + 1,
      projects: [...registry.projects, project]
    });
    return publicProject(saved.projects.find((item) => item.id === id));
  }

  async deleteProject(projectId = "", input = {}) {
    assertProjectAdminCode(input.authCode);
    const id = normalizeProjectId(projectId);
    if (!PROJECT_ID_PATTERN.test(id)) {
      throw createHttpError("项目编号非法。", 400, "software_module_description_invalid_project_id");
    }
    const registry = await this.readProjectRegistry();
    const nextProjects = registry.projects.filter((project) => project.id !== id);
    if (nextProjects.length === registry.projects.length) {
      throw createHttpError("项目不存在。", 404, "software_module_description_project_not_found", { projectId: id });
    }
    await this.saveProjectRegistry({
      nextProjectNumber: registry.nextProjectNumber,
      projects: nextProjects
    });
    return { deleted: true, projectId: id };
  }

  async listTasks(options = {}) {
    await this.ensureDirs();
    const filterProjectId = normalizeProjectId(options.projectId || "");
    if (filterProjectId && !PROJECT_ID_PATTERN.test(filterProjectId)) {
      throw createHttpError("项目编号非法。", 400, "software_module_description_invalid_project_id");
    }
    const entries = await fs.readdir(this.storeDir, { withFileTypes: true }).catch(() => []);
    const tasks = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) {
        continue;
      }
      const task = await readJson(taskFilePath(path.join(this.storeDir, entry.name)), null);
      if (task?.id) {
        const publicRecord = publicTask(task);
        if (!filterProjectId || publicRecord.unitTestProject?.id === filterProjectId) {
          tasks.push(publicRecord);
        }
      }
    }
    return tasks.sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""));
  }

  async getTask(taskId = "") {
    const task = await readJson(taskFilePath(this.getTaskDir(taskId)), null);
    return task ? publicTask(task) : null;
  }

  async readTask(taskId = "") {
    return readJson(taskFilePath(this.getTaskDir(taskId)), null);
  }

  async saveTask(task = {}) {
    if (this.deletedTaskIds.has(task.id)) {
      return publicTask(task);
    }
    const taskDir = this.getTaskDir(task.id);
    await fs.mkdir(taskDir, { recursive: true });
    await writeJson(taskFilePath(taskDir), task);
    return publicTask(task);
  }

  async deleteTask(taskId = "") {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "software_module_description_task_not_found");
    }
    this.deletedTaskIds.add(task.id);
    const taskDir = this.getTaskDir(task.id);
    await fs.rm(taskDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    return {
      deleted: true,
      taskId: task.id,
      status: task.status || "",
      removedArtifacts: Array.isArray(task.artifacts) ? task.artifacts.length : 0,
      removedWorkspace: true
    };
  }

  validateUploadFiles(files = {}) {
    const normalized = normalizeTaskFiles(files);
    if (normalized.modelSlx.length !== 1 || normalized.modelMat.length !== 1 || normalized.modelInitScript.length > 1) {
      throw createHttpError("需要同时上传 1 个 .slx 模型文件和 1 个 .mat 数据文件。", 400, "software_module_description_invalid_upload_count", {
        modelSlxCount: normalized.modelSlx.length,
        modelMatCount: normalized.modelMat.length,
        modelInitScriptCount: normalized.modelInitScript.length
      });
    }

    const [modelSlx] = normalized.modelSlx;
    const [modelMat] = normalized.modelMat;
    const [modelInitScript] = normalized.modelInitScript;
    if (normalizeExtension(modelSlx.originalname) !== ".slx") {
      throw createHttpError("模型文件只接受 .slx。", 400, "software_module_description_invalid_slx_extension");
    }
    if (normalizeExtension(modelMat.originalname) !== ".mat") {
      throw createHttpError("数据文件只接受 .mat。", 400, "software_module_description_invalid_mat_extension");
    }
    if (modelInitScript && normalizeExtension(modelInitScript.originalname) !== ".m") {
      throw createHttpError("初始化脚本只接受 .m。", 400, "software_module_description_invalid_init_script_extension");
    }

    return { modelSlx, modelMat, modelInitScript: modelInitScript || null };
  }

  async createTask(files = {}, metadata = {}) {
    await this.ensureDirs();
    const normalized = normalizeTaskFiles(files);
    try {
      const { modelSlx, modelMat, modelInitScript } = this.validateUploadFiles(normalized);
      const unitTestProject = await this.getUnitTestProject(metadata.unitTestProjectId || metadata.projectId || "");
      const taskId = randomUUID();
      const taskDir = this.getTaskDir(taskId);
      const inputDir = path.join(taskDir, "inputs");
      const workspaceDir = path.join(taskDir, "workspace");
      const workspaceInputDir = path.join(workspaceDir, "inputs");
      const outputDir = path.join(workspaceDir, "outputs");
      await Promise.all([
        fs.mkdir(inputDir, { recursive: true }),
        fs.mkdir(workspaceInputDir, { recursive: true }),
        fs.mkdir(outputDir, { recursive: true })
      ]);

      const slxName = sanitizeStoredFileName(modelSlx.originalname, "model.slx");
      const matName = sanitizeStoredFileName(modelMat.originalname, "model.mat");
      const workspaceModelBase = toMatlabModelBase(modelSlx.originalname, "model");
      const workspaceSlxName = `${workspaceModelBase}.slx`;
      const workspaceMatName = `${workspaceModelBase}.mat`;
      const initScriptName = modelInitScript ? sanitizeStoredFileName(modelInitScript.originalname, "model_init.m") : "";
      const workspaceInitScriptName = modelInitScript
        ? `${toMatlabModelBase(modelInitScript.originalname, `${workspaceModelBase}_init`)}.m`
        : "";
      const archivedSlxPath = path.join(inputDir, slxName);
      const archivedMatPath = path.join(inputDir, matName);
      const archivedInitScriptPath = modelInitScript ? path.join(inputDir, initScriptName) : "";
      const workspaceSlxPath = path.join(workspaceDir, workspaceSlxName);
      const workspaceMatPath = path.join(workspaceDir, workspaceMatName);
      const workspaceInitScriptPath = modelInitScript ? path.join(workspaceInputDir, workspaceInitScriptName) : "";
      await copyUploadedFile(modelSlx, archivedSlxPath);
      await copyUploadedFile(modelMat, archivedMatPath);
      if (modelInitScript) {
        await copyUploadedFile(modelInitScript, archivedInitScriptPath);
      }
      await fs.copyFile(archivedSlxPath, workspaceSlxPath);
      await fs.copyFile(archivedMatPath, workspaceMatPath);
      if (modelInitScript) {
        await fs.copyFile(archivedInitScriptPath, workspaceInitScriptPath);
      }

      const cfg = softwareModuleDescriptionConfig();
      const agentWorkspaceDir = buildAgentPath(workspaceDir, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentSlxPath = buildAgentPath(workspaceSlxPath, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentMatPath = buildAgentPath(workspaceMatPath, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentOutputDir = buildAgentPath(outputDir, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      });
      const agentInitScriptPath = modelInitScript ? buildAgentPath(workspaceInitScriptPath, {
        agentWorkspaceRoot: cfg.agentWorkspaceRoot,
        localTaskStoreDir: cfg.taskStoreDir
      }) : "";
      const initScriptInput = modelInitScript
        ? {
            originalName: normalizeUploadedFileName(modelInitScript.originalname),
            storedName: initScriptName,
            workspaceName: workspaceInitScriptName,
            size: Number(modelInitScript.size || 0) || 0,
            mimeType: modelInitScript.mimetype || "",
            archiveRelativePath: normalizeStoredRelativePath(path.relative(taskDir, archivedInitScriptPath)),
            workspaceRelativePath: normalizeStoredRelativePath(path.relative(workspaceDir, workspaceInitScriptPath))
          }
        : null;

      const createdAt = now();
      const task = {
        id: taskId,
        type: QUEUE_TYPE,
        status: "queued",
        title: metadata.title || "软件详设生成",
        createdAt,
        updatedAt: createdAt,
        startedAt: "",
        completedAt: "",
        failedAt: "",
        summary: "",
        errorMessage: "",
        progress: buildProgress("queued"),
        unitTestProject,
        inputs: {
          modelSlx: {
            originalName: normalizeUploadedFileName(modelSlx.originalname),
            storedName: slxName,
            workspaceName: workspaceSlxName,
            size: Number(modelSlx.size || 0) || 0,
            mimeType: modelSlx.mimetype || "",
            archiveRelativePath: normalizeStoredRelativePath(path.relative(taskDir, archivedSlxPath)),
            workspaceRelativePath: normalizeStoredRelativePath(path.relative(workspaceDir, workspaceSlxPath))
          },
          modelMat: {
            originalName: normalizeUploadedFileName(modelMat.originalname),
            storedName: matName,
            workspaceName: workspaceMatName,
            size: Number(modelMat.size || 0) || 0,
            mimeType: modelMat.mimetype || "",
            archiveRelativePath: normalizeStoredRelativePath(path.relative(taskDir, archivedMatPath)),
            workspaceRelativePath: normalizeStoredRelativePath(path.relative(workspaceDir, workspaceMatPath))
          }
        },
        workspace: {
          directory: workspaceDir,
          inputDir: workspaceInputDir,
          outputDir,
          modelSlxPath: workspaceSlxPath,
          modelMatPath: workspaceMatPath,
          modelInitScriptPath: workspaceInitScriptPath,
          agentDirectory: agentWorkspaceDir,
          agentModelSlxPath: agentSlxPath,
          agentModelMatPath: agentMatPath,
          agentModelInitScriptPath: agentInitScriptPath,
          agentOutputDir
        },
        hermes: {
          stepType: STEP_TYPE,
          queueType: QUEUE_TYPE,
          skillName: cfg.skillName,
          expectedOutputPattern: cfg.expectedOutputPattern,
          summary: "",
          metrics: null,
          sessionId: "",
          logs: []
        },
        runtimeEvents: [],
        artifacts: [],
        timeline: [
          {
            at: createdAt,
            status: "queued",
            message: `任务已创建并等待 Hermes Agent 执行，项目：${unitTestProject.label}。`
          }
        ]
      };
      if (initScriptInput) {
        task.inputs.modelInitScript = initScriptInput;
      }
      await this.saveTask(task);
      return publicTask(task);
    } finally {
      await cleanupTempFiles(normalized);
    }
  }

  async markRunning(taskId = "") {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "software_module_description_task_not_found");
    }
    const timestamp = now();
    task.status = "running";
    task.startedAt ||= timestamp;
    task.updatedAt = timestamp;
    task.progress = buildProgress("running");
    task.timeline = [
      ...(task.timeline || []),
      { at: timestamp, status: "running", message: "Hermes Agent 已开始处理。" }
    ];
    return this.saveTask(task);
  }

  async appendRuntimeEvent(taskId = "", event = {}) {
    const task = await this.readTask(taskId);
    if (!task) {
      return null;
    }
    const normalizedEvent = {
      at: event.at || now(),
      type: String(event.type || "agent_runtime"),
      status: String(event.status || ""),
      level: event.level || "",
      label: event.label || "",
      message: event.message || "",
      transport: event.transport || "",
      stepType: event.stepType || STEP_TYPE,
      elapsedMs: Number(event.elapsedMs || 0) || 0,
      sessionId: event.sessionId || "",
      tokenUsage: event.tokenUsage || null,
      stdoutExcerpt: event.stdoutExcerpt || "",
      stderrExcerpt: event.stderrExcerpt || ""
    };
    task.runtimeEvents = [...(task.runtimeEvents || []), normalizedEvent].slice(-80);
    task.updatedAt = normalizedEvent.at;
    if (normalizedEvent.status === "heartbeat") {
      task.progress = buildProgress("running", normalizedEvent.message || "Hermes Agent 仍在执行。");
    }
    if (normalizedEvent.status === "failed") {
      task.progress = buildProgress("failed", normalizedEvent.message || "Hermes Agent 执行失败。");
    }
    if (normalizedEvent.tokenUsage) {
      task.hermes = {
        ...(task.hermes || {}),
        tokenUsage: normalizedEvent.tokenUsage,
        sessionId: normalizedEvent.sessionId || task.hermes?.sessionId || ""
      };
    }
    await this.saveTask(task);
    return normalizedEvent;
  }

  buildHermesPayload(task = {}) {
    const cfg = softwareModuleDescriptionConfig();
    const workspaceDir = task.workspace?.agentDirectory || task.workspace?.directory || "";
    const modelSlxPath = task.workspace?.agentModelSlxPath || task.workspace?.modelSlxPath || "";
    const modelMatPath = task.workspace?.agentModelMatPath || task.workspace?.modelMatPath || "";
    const modelInitScriptPath = task.workspace?.agentModelInitScriptPath || task.workspace?.modelInitScriptPath || "";
    const outputDir = task.workspace?.agentOutputDir || task.workspace?.outputDir || "";
    const modelInitScriptRelativePath = task.inputs?.modelInitScript?.workspaceRelativePath || "";
    const inputArtifact = {
      workspaceDir,
      modelSlxPath,
      modelMatPath,
      outputDir,
      unitTestProject: normalizeTaskProjectSnapshot(task.unitTestProject),
      skillName: cfg.skillName,
      expectedOutputPattern: cfg.expectedOutputPattern,
      localPlatformWorkspaceDir: task.workspace?.directory || "",
      modelSlxFileName: task.inputs?.modelSlx?.workspaceName || task.inputs?.modelSlx?.originalName || path.basename(modelSlxPath),
      modelMatFileName: task.inputs?.modelMat?.workspaceName || task.inputs?.modelMat?.originalName || path.basename(modelMatPath)
    };
    if (modelInitScriptPath && modelInitScriptRelativePath) {
      inputArtifact.modelInitScriptPath = modelInitScriptPath;
      inputArtifact.modelInitScriptFileName = task.inputs?.modelInitScript?.workspaceName || path.basename(modelInitScriptPath);
      inputArtifact.projectInitScripts = [modelInitScriptRelativePath];
    }
    return {
      stepType: STEP_TYPE,
      type: QUEUE_TYPE,
      allowedPaths: [workspaceDir],
      workdir: workspaceDir,
      inputArtifact
    };
  }

  async runTask(taskId = "") {
    let task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "software_module_description_task_not_found");
    }
    await this.markRunning(taskId);
    task = await this.readTask(taskId);

    try {
      const result = await this.hermesAgentClient.executeStep(this.buildHermesPayload(task), {
        onEvent: (event) => this.appendRuntimeEvent(taskId, event)
      });
      const artifact = result?.artifact || {};
      if (result?.status && result.status !== "succeeded") {
        throw createHttpError(result?.error?.message || "Hermes Agent 执行失败。", 502, "software_module_description_hermes_failed");
      }
      if (artifact.status === "failed") {
        throw createHttpError(artifact.errorMessage || artifact.summary || "Hermes Agent 返回失败状态。", 502, "software_module_description_hermes_failed");
      }
      return await this.completeTask(taskId, artifact, result);
    } catch (error) {
      await this.failTask(taskId, error);
      throw error;
    }
  }

  async resolveHermesOutputCandidates(task = {}, artifact = {}) {
    const workspaceDir = task.workspace?.directory || "";
    const outputDir = task.workspace?.outputDir || path.join(workspaceDir, "outputs");
    const candidates = new Map();
    const addCandidate = (relativePath = "", meta = {}) => {
      const normalized = normalizeStoredRelativePath(relativePath);
      if (isDocxOutput(normalized)) {
        candidates.set(normalized, { relativePath: normalized, ...meta });
      }
    };

    for (const item of Array.isArray(artifact.outputFiles) ? artifact.outputFiles : []) {
      if (typeof item === "string") {
        addCandidate(item);
        continue;
      }
      if (!item || typeof item !== "object") {
        continue;
      }
      const itemPath = item.relativePath || item.path || item.filePath || item.absolutePath || "";
      if (!itemPath) {
        continue;
      }
      if (path.isAbsolute(String(itemPath))) {
        const absolute = path.resolve(String(itemPath));
        if (absolute.startsWith(`${workspaceDir}${path.sep}`) || absolute === workspaceDir) {
          addCandidate(path.relative(workspaceDir, absolute), item);
        }
      } else {
        addCandidate(itemPath, item);
      }
    }

    const outputEntries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
    for (const entry of outputEntries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".docx")) {
        addCandidate(path.join("outputs", entry.name));
      }
    }

    const artifacts = [];
    for (const candidate of candidates.values()) {
      const absolutePath = path.resolve(workspaceDir, ...candidate.relativePath.split("/"));
      if (!absolutePath.startsWith(`${workspaceDir}${path.sep}`) || !(await pathExists(absolutePath))) {
        continue;
      }
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        continue;
      }
      artifacts.push({
        id: randomUUID(),
        kind: candidate.kind || "software_module_description_docx",
        fileName: candidate.fileName || path.basename(absolutePath),
        relativePath: candidate.relativePath,
        size: stat.size,
        mimeType: candidate.mimeType || DOCX_MIME_TYPE,
        description: candidate.description || "生成的软件详设 DOCX",
        createdAt: now()
      });
    }
    return artifacts.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
  }

  async completeTask(taskId = "", hermesArtifact = {}, hermesResult = {}) {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "software_module_description_task_not_found");
    }
    const artifacts = await this.resolveHermesOutputCandidates(task, hermesArtifact);
    if (!artifacts.length) {
      throw createHttpError("Hermes 已返回，但未在 workspace/outputs 下找到 .docx 结果。", 502, "software_module_description_output_missing", {
        expectedOutputPattern: task.hermes?.expectedOutputPattern || softwareModuleDescriptionConfig().expectedOutputPattern
      });
    }
    const timestamp = now();
    task.status = "completed";
    task.completedAt = timestamp;
    task.updatedAt = timestamp;
    task.summary = hermesArtifact.summary || `已生成 ${artifacts.length} 个软件详设 DOCX 文件。`;
    task.progress = buildProgress("completed", task.summary);
    task.hermes = {
      ...(task.hermes || {}),
      summary: hermesArtifact.summary || "",
      warnings: Array.isArray(hermesArtifact.warnings) ? hermesArtifact.warnings : [],
      metrics: hermesResult.metrics || null,
      sessionId: hermesResult.sessionId || task.hermes?.sessionId || "",
      logs: Array.isArray(hermesResult.logs) ? hermesResult.logs : []
    };
    task.artifacts = artifacts;
    task.timeline = [
      ...(task.timeline || []),
      { at: timestamp, status: "completed", message: task.summary }
    ];
    return this.saveTask(task);
  }

  async failTask(taskId = "", error = {}) {
    const task = await this.readTask(taskId);
    if (!task) {
      return null;
    }
    const timestamp = now();
    const message = clipTaskMessage(error?.message || "软件详设生成失败。");
    task.status = "failed";
    task.failedAt = timestamp;
    task.updatedAt = timestamp;
    task.errorMessage = message;
    task.progress = buildProgress("failed", message);
    task.hermes = {
      ...(task.hermes || {}),
      errorCode: error?.code || "software_module_description_generation_failed",
      errorDetails: error?.details || null
    };
    task.timeline = [
      ...(task.timeline || []),
      { at: timestamp, status: "failed", message }
    ];
    return this.saveTask(task);
  }

  async recoverStaleTasks(maxAgeMs = 30 * 60 * 1000) {
    const tasks = await this.listTasks();
    const cutoff = Date.now() - maxAgeMs;
    for (const task of tasks) {
      const updatedAt = Date.parse(task.updatedAt || task.createdAt || "") || 0;
      if (task.status === "running" && updatedAt < cutoff) {
        await this.failTask(task.id, createHttpError("服务重启后任务未恢复，已标记为失败。", 500, "software_module_description_task_recovered_failed"));
      }
    }
  }

  async getArtifact(taskId = "", artifactId = "") {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("任务不存在。", 404, "software_module_description_task_not_found");
    }
    const artifact = (task.artifacts || []).find((item) => item.id === artifactId || item.fileName === artifactId);
    if (!artifact) {
      throw createHttpError("结果文件不存在。", 404, "software_module_description_artifact_not_found");
    }
    if (!isDocxOutput(artifact.relativePath)) {
      throw createHttpError("结果文件路径不在允许的 outputs/*.docx 范围内。", 403, "software_module_description_artifact_forbidden");
    }
    const workspaceDir = path.resolve(task.workspace?.directory || "");
    const absolutePath = path.resolve(workspaceDir, ...artifact.relativePath.split("/"));
    if (!absolutePath.startsWith(`${workspaceDir}${path.sep}`) || !(await pathExists(absolutePath))) {
      throw createHttpError("结果文件不存在或路径非法。", 404, "software_module_description_artifact_not_found");
    }
    return {
      ...artifact,
      absolutePath
    };
  }
}
