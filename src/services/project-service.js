import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { getProjectPath, readJson, resolveStoredFilePath, writeJson } from "./storage.js";
import { RejectionService } from "./rejection-service.js";

function now() {
  return new Date().toISOString();
}

function isStaleRunningTask(task = {}) {
  if (task.status !== "running") return false;
  const reference = task.progress?.updatedAt || task.updatedAt || task.createdAt || "";
  const timestamp = new Date(reference).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp > 30 * 60 * 1000;
}

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function getDocumentTypeLabel(documentType) {
  if (documentType === "detail_design") return "\u8be6\u7ec6\u8bbe\u8ba1";
  if (documentType === "hil_test_case") return "HIL \u7528\u4f8b";
  return "\u8f6f\u4ef6\u9700\u6c42";
}

function getGenerationActionLabel(documentType) {
  if (documentType === "detail_design") return "details_generated";
  if (documentType === "hil_test_case") return "hil_cases_generated";
  return "requirements_generated";
}

function normalizeDomain(value) {
  return String(value || "").trim() || "embedded_vcu";
}

function normalizeModuleSkillKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeReasonTags(reasonTags) {
  if (Array.isArray(reasonTags)) {
    return reasonTags.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof reasonTags === "string") {
    return reasonTags.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTargetArea(value = "") {
  const normalized = String(value || "").trim();
  return ["writing", "extraction", "validation", "examples", "domain_knowledge"].includes(normalized) ? normalized : "";
}

function createEmptyDocumentSpace(documentType) {
  return {
    documentType: normalizeDocumentType(documentType),
    generationTasks: [],
    acceptedItems: []
  };
}

function ensureDocumentSpaces(documentSpaces = {}) {
  return {
    software_requirement:
      documentSpaces.software_requirement || createEmptyDocumentSpace("software_requirement"),
    detail_design: documentSpaces.detail_design || createEmptyDocumentSpace("detail_design"),
    hil_test_case: documentSpaces.hil_test_case || createEmptyDocumentSpace("hil_test_case")
  };
}

function buildFileRecord(projectId, moduleId, file, role) {
  return {
    id: randomUUID(),
    role,
    originalName: file.originalname,
    storedName: file.filename,
    relativePath: moduleId ? path.join(projectId, moduleId, file.filename) : path.join(projectId, file.filename),
    absolutePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: now()
  };
}

function createModuleRecord(projectId, input = {}) {
  const importedSkillKey = normalizeModuleSkillKey(input.importedSkillKey || "");
  return {
    id: randomUUID(),
    projectId,
    name: input.name?.trim() || "未命名功能模块",
    description: input.description?.trim() || "",
    domain: normalizeDomain(input.domain),
    moduleSkillKey: normalizeModuleSkillKey(importedSkillKey || input.moduleSkillKey || input.name),
    skillStatus: input.skillStatus || (importedSkillKey ? "imported" : "draft"),
    skillSource: input.skillSource || (importedSkillKey ? { type: "module_profile", key: importedSkillKey } : null),
    seededAt: input.seededAt || null,
    assets: [],
    documentSpaces: ensureDocumentSpaces(),
    auditLog: [
      {
        at: now(),
        action: "module_created",
        detail: "功能模块已创建"
      }
    ],
    createdAt: now(),
    updatedAt: now()
  };
}

function normalizeTask(task = {}) {
  const progress = normalizeTaskProgress(task.progress);
  const timeline = normalizeTaskTimeline(task.timeline);
  return {
    id: task.id || randomUUID(),
    moduleId: task.moduleId || "",
    documentType: normalizeDocumentType(task.documentType),
    status: task.status || "completed",
    createdAt: task.createdAt || now(),
    updatedAt: task.updatedAt || task.createdAt || now(),
    inputAssetIds: Array.isArray(task.inputAssetIds) ? task.inputAssetIds : [],
    uploadedAssetIds: Array.isArray(task.uploadedAssetIds) ? task.uploadedAssetIds : [],
    resultItems: Array.isArray(task.resultItems) ? task.resultItems : [],
    extractions: Array.isArray(task.extractions) ? task.extractions : [],
    traces: Array.isArray(task.traces) ? task.traces : [],
    conflicts: Array.isArray(task.conflicts) ? task.conflicts : [],
    llmProfile: task.llmProfile || null,
    summary: task.summary || "",
    auditLog: Array.isArray(task.auditLog) ? task.auditLog : [],
    progress,
    timeline,
    metrics: normalizeTaskMetrics(task.metrics),
    debug: normalizeTaskDebug(task.debug),
    errorMessage: String(task.errorMessage || "").trim()
  };
}

function normalizeTaskProgress(progress = {}) {
  return {
    stage: String(progress?.stage || "").trim(),
    label: String(progress?.label || "").trim(),
    message: String(progress?.message || "").trim(),
    percent: Math.max(0, Math.min(100, Number(progress?.percent || 0) || 0)),
    current: Math.max(0, Number(progress?.current || 0) || 0),
    total: Math.max(0, Number(progress?.total || 0) || 0),
    updatedAt: progress?.updatedAt || ""
  };
}

function normalizeTaskTimeline(timeline = []) {
  return Array.isArray(timeline)
    ? timeline
        .map((entry) => ({
          at: entry?.at || now(),
          stage: String(entry?.stage || "").trim(),
          label: String(entry?.label || "").trim(),
          message: String(entry?.message || "").trim(),
          level: String(entry?.level || "info").trim() || "info"
        }))
        .filter((entry) => entry.message)
        .slice(-24)
    : [];
}

function normalizeTaskMetrics(metrics = {}) {
  return {
    extractionFileCount: Math.max(0, Number(metrics?.extractionFileCount || 0) || 0),
    extractionEvidenceCount: Math.max(0, Number(metrics?.extractionEvidenceCount || 0) || 0),
    llmDurationMs: Math.max(0, Number(metrics?.llmDurationMs || 0) || 0),
    generatedItemCount: Math.max(0, Number(metrics?.generatedItemCount || 0) || 0),
    conflictCount: Math.max(0, Number(metrics?.conflictCount || 0) || 0)
  };
}

function normalizeDebugText(value, maxLength = 200000) {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeTaskDebugEvent(event = {}) {
  return {
    at: event?.at || now(),
    stage: String(event?.stage || "").trim(),
    label: String(event?.label || "").trim(),
    message: String(event?.message || "").trim(),
    level: String(event?.level || "info").trim() || "info"
  };
}

function normalizeTaskDebug(debug = {}) {
  const llm = debug?.llm || {};
  const postProcess = debug?.postProcess || {};
  const lastError = debug?.lastError && typeof debug.lastError === "object"
    ? {
        at: debug.lastError.at || "",
        stage: String(debug.lastError.stage || "").trim(),
        message: String(debug.lastError.message || "").trim(),
        stack: normalizeDebugText(debug.lastError.stack || "", 40000)
      }
    : null;

  return {
    updatedAt: debug?.updatedAt || "",
    llm: {
      requestModel: String(llm.requestModel || "").trim(),
      requestProvider: String(llm.requestProvider || "").trim(),
      rawResponseText: normalizeDebugText(llm.rawResponseText || "", 200000),
      rawResponseLength: Math.max(0, Number(llm.rawResponseLength || 0) || 0),
      rawResponseTruncated: Boolean(llm.rawResponseTruncated),
      parsedTopLevelKeys: Array.isArray(llm.parsedTopLevelKeys)
        ? llm.parsedTopLevelKeys.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40)
        : [],
      rawItemCount: Math.max(0, Number(llm.rawItemCount || 0) || 0)
    },
    postProcess: {
      lastStage: String(postProcess.lastStage || "").trim(),
      normalizeResultItemsMs: Math.max(0, Number(postProcess.normalizeResultItemsMs || 0) || 0),
      applyPoliciesMs: Math.max(0, Number(postProcess.applyPoliciesMs || 0) || 0),
      validationMs: Math.max(0, Number(postProcess.validationMs || 0) || 0),
      saveMs: Math.max(0, Number(postProcess.saveMs || 0) || 0),
      totalAfterModelMs: Math.max(0, Number(postProcess.totalAfterModelMs || 0) || 0)
    },
    lastError,
    events: Array.isArray(debug?.events)
      ? debug.events
          .map((event) => normalizeTaskDebugEvent(event))
          .filter((event) => event.message)
          .slice(-40)
      : []
  };
}

function mergeTaskDebug(current = {}, updates = {}) {
  const merged = normalizeTaskDebug({
    ...current,
    ...updates,
    llm: {
      ...(current.llm || {}),
      ...(updates.llm || {})
    },
    postProcess: {
      ...(current.postProcess || {}),
      ...(updates.postProcess || {})
    },
    lastError: updates.lastError
      ? {
          ...(current.lastError || {}),
          ...updates.lastError
        }
      : current.lastError,
    events: Array.isArray(current.events) ? [...current.events] : []
  });
  merged.updatedAt = now();
  return merged;
}

function appendTaskDebugEvent(task, debugEvent) {
  if (!debugEvent?.message) {
    return;
  }

  const entry = normalizeTaskDebugEvent(debugEvent);
  const currentDebug = normalizeTaskDebug(task.debug);
  const lastEntry = currentDebug.events.at(-1);
  if (
    lastEntry &&
    lastEntry.stage === entry.stage &&
    lastEntry.message === entry.message &&
    lastEntry.level === entry.level
  ) {
    currentDebug.events[currentDebug.events.length - 1] = entry;
  } else {
    currentDebug.events.push(entry);
    currentDebug.events = currentDebug.events.slice(-40);
  }
  currentDebug.updatedAt = now();
  task.debug = currentDebug;
}

function appendTimelineEntry(task, timelineEntry) {
  if (!timelineEntry?.message) {
    return;
  }

  const entry = {
    at: timelineEntry.at || now(),
    stage: String(timelineEntry.stage || "").trim(),
    label: String(timelineEntry.label || "").trim(),
    message: String(timelineEntry.message || "").trim(),
    level: String(timelineEntry.level || "info").trim() || "info"
  };
  const lastEntry = task.timeline.at(-1);
  if (
    lastEntry &&
    lastEntry.stage === entry.stage &&
    lastEntry.message === entry.message &&
    lastEntry.level === entry.level
  ) {
    task.timeline[task.timeline.length - 1] = entry;
  } else {
    task.timeline.push(entry);
    task.timeline = task.timeline.slice(-24);
  }
}

function buildTaskSummary(task = {}) {
  const documentTypeLabel = getDocumentTypeLabel(task.documentType);
  if (task.status === "running") {
    return task.progress?.label || task.progress?.message || `正在生成${documentTypeLabel}`;
  }
  if (task.status === "failed") {
    return task.errorMessage || task.summary || `${documentTypeLabel}生成失败`;
  }
  if (task.summary) {
    return task.summary;
  }
  return `${documentTypeLabel}任务`;
}

function normalizeAcceptedItem(item = {}) {
  return {
    id: item.id || randomUUID(),
    sourceTaskId: item.sourceTaskId || "",
    sourceResultItemId: item.sourceResultItemId || "",
    acceptedSnapshot: item.acceptedSnapshot || null,
    currentContent: item.currentContent || null,
    review: item.review || {
      status: "accepted",
      reviewer: "当前用户",
      comment: ""
    },
    acceptedAt: item.acceptedAt || now(),
    updatedAt: item.updatedAt || item.acceptedAt || now()
  };
}

function normalizeModule(module, projectId) {
  if (!module) {
    return createModuleRecord(projectId);
  }

  return {
    id: module.id || randomUUID(),
    projectId: module.projectId || projectId,
    name: module.name?.trim() || "未命名功能模块",
    description: module.description?.trim() || "",
    domain: normalizeDomain(module.domain),
    moduleSkillKey: normalizeModuleSkillKey(module.moduleSkillKey || module.name),
    skillStatus: module.skillStatus || "draft",
    skillSource: module.skillSource || null,
    seededAt: module.seededAt || null,
    assets: Array.isArray(module.assets) ? module.assets : [],
    documentSpaces: Object.fromEntries(
      Object.entries(ensureDocumentSpaces(module.documentSpaces)).map(([key, value]) => [
        key,
        {
          documentType: normalizeDocumentType(value.documentType || key),
          generationTasks: Array.isArray(value.generationTasks) ? value.generationTasks.map(normalizeTask) : [],
          acceptedItems: Array.isArray(value.acceptedItems) ? value.acceptedItems.map(normalizeAcceptedItem) : []
        }
      ])
    ),
    auditLog: Array.isArray(module.auditLog) ? module.auditLog : [],
    createdAt: module.createdAt || now(),
    updatedAt: module.updatedAt || module.createdAt || now()
  };
}

function normalizeProject(project) {
  if (!project) {
    return project;
  }

  const normalized = {
    ...project,
    documentType: normalizeDocumentType(project.documentType),
    language: project.language || "zh-CN",
    templateName: project.templateName || "default-template",
    status: project.status || "draft",
    files: Array.isArray(project.files) ? project.files : [],
    extractions: Array.isArray(project.extractions) ? project.extractions : [],
    requirements: Array.isArray(project.requirements) ? project.requirements : [],
    traces: Array.isArray(project.traces) ? project.traces : [],
    conflicts: Array.isArray(project.conflicts) ? project.conflicts : [],
    lastGeneration: project.lastGeneration || null,
    auditLog: Array.isArray(project.auditLog) ? project.auditLog : [],
    modules: Array.isArray(project.modules) ? project.modules.map((module) => normalizeModule(module, project.id)) : [],
    createdAt: project.createdAt || now(),
    updatedAt: project.updatedAt || project.createdAt || now()
  };

  return normalized;
}

function touchModule(module, action, detail) {
  module.updatedAt = now();
  module.auditLog.push({
    at: module.updatedAt,
    action,
    detail
  });
}

function cloneForAcceptedSnapshot(item) {
  return JSON.parse(JSON.stringify(item));
}

export class ProjectService {
  constructor() {
    this.rejectionService = new RejectionService();
  }

  async listProjects() {
    const names = await fs.readdir(config.projectStoreDir);
    const projects = await Promise.all(
      names.filter((name) => name.endsWith(".json")).map(async (name) => normalizeProject(await readJson(path.join(config.projectStoreDir, name))))
    );

    return projects.filter(Boolean).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async recoverStaleGenerationTasks() {
    const projects = await this.listProjects();
    let recoveredCount = 0;

    for (const project of projects) {
      let changed = false;
      for (const module of project.modules || []) {
        for (const space of Object.values(module.documentSpaces || {})) {
          for (const task of space.generationTasks || []) {
            if (!isStaleRunningTask(task)) {
              continue;
            }
            task.status = "failed";
            task.errorMessage = "任务在服务重启或中断后未恢复，已标记为失败。";
            task.progress = normalizeTaskProgress({
              ...task.progress,
              stage: "failed",
              label: "任务已中断",
              message: task.errorMessage,
              percent: 100,
              updatedAt: now()
            });
            appendTimelineEntry(task, {
              at: now(),
              stage: "failed",
              label: "任务已中断",
              message: task.errorMessage,
              level: "error"
            });
            task.summary = task.errorMessage;
            task.updatedAt = now();
            recoveredCount += 1;
            changed = true;
          }
        }
      }
      if (changed) {
        await this.saveProject(project);
      }
    }

    return { recoveredCount };
  }

  async createProject(input) {
    const project = normalizeProject({
      id: randomUUID(),
      name: input.name?.trim() || "未命名工程",
      description: input.description?.trim() || "",
      documentType: normalizeDocumentType(input.documentType),
      language: input.language || "zh-CN",
      templateName: input.templateName || "default-template",
      status: "draft",
      files: [],
      extractions: [],
      requirements: [],
      traces: [],
      conflicts: [],
      lastGeneration: null,
      modules: [],
      auditLog: [
        {
          at: now(),
          action: "project_created",
          detail: "工程已创建"
        }
      ],
      createdAt: now(),
      updatedAt: now()
    });

    await writeJson(getProjectPath(project.id), project);
    return project;
  }

  async getProject(projectId) {
    return normalizeProject(await readJson(getProjectPath(projectId)));
  }

  async saveProject(project) {
    const normalized = normalizeProject(project);
    normalized.updatedAt = now();
    await writeJson(getProjectPath(normalized.id), normalized);
    return normalized;
  }

  async updateProject(projectId, input = {}) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (typeof input.name === "string" && input.name.trim()) {
      project.name = input.name.trim();
    }
    if (Object.hasOwn(input, "description")) {
      project.description = String(input.description || "").trim();
    }
    if (Object.hasOwn(input, "status") && input.status) {
      project.status = input.status;
    }

    project.auditLog.push({
      at: now(),
      action: "project_updated",
      detail: "工程信息已更新"
    });
    return this.saveProject(project);
  }

  async deleteProject(projectId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await Promise.all([
      fs.rm(getProjectPath(projectId), { force: true }),
      fs.rm(path.join(config.uploadDir, projectId), { recursive: true, force: true })
    ]);

    return { id: projectId, deleted: true };
  }

  async createModule(projectId, input = {}) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const module = createModuleRecord(project.id, input);
    project.modules.push(module);
    project.auditLog.push({
      at: now(),
      action: "module_created",
      detail: `已创建功能模块：${module.name}`
    });
    await this.saveProject(project);
    return module;
  }

  async updateModule(projectId, moduleId, input = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    module.name = input.name?.trim() || module.name;
    module.description = input.description?.trim() || "";
    module.domain = normalizeDomain(input.domain || module.domain);
    module.moduleSkillKey = normalizeModuleSkillKey(input.importedSkillKey || input.moduleSkillKey || module.moduleSkillKey || module.name);
    if (Object.hasOwn(input, "skillStatus")) {
      module.skillStatus = input.skillStatus || module.skillStatus || "draft";
    }
    if (Object.hasOwn(input, "skillSource")) {
      module.skillSource = input.skillSource || null;
    }
    if (Object.hasOwn(input, "seededAt")) {
      module.seededAt = input.seededAt || null;
    }
    touchModule(module, "module_updated", "功能模块信息已更新");
    await this.saveProject(project);
    return module;
  }

  async deleteModule(projectId, moduleId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const moduleIndex = project.modules.findIndex((item) => item.id === moduleId);
    if (moduleIndex === -1) {
      throw new Error("Module not found");
    }

    const [removedModule] = project.modules.splice(moduleIndex, 1);
    project.auditLog.push({
      at: now(),
      action: "module_deleted",
      detail: `已删除功能模块：${removedModule.name}`
    });

    await Promise.all([
      this.saveProject(project),
      fs.rm(path.join(config.uploadDir, projectId, moduleId), { recursive: true, force: true })
    ]);

    return { id: moduleId, deleted: true };
  }

  async updateModuleSkillState(projectId, moduleId, updates = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    if (Object.hasOwn(updates, "moduleSkillKey")) {
      module.moduleSkillKey = normalizeModuleSkillKey(updates.moduleSkillKey || module.moduleSkillKey || module.name);
    }
    if (Object.hasOwn(updates, "domain")) {
      module.domain = normalizeDomain(updates.domain || module.domain);
    }
    if (Object.hasOwn(updates, "skillStatus")) {
      module.skillStatus = updates.skillStatus || module.skillStatus || "draft";
    }
    if (Object.hasOwn(updates, "skillSource")) {
      module.skillSource = updates.skillSource || null;
    }
    if (Object.hasOwn(updates, "seededAt")) {
      module.seededAt = updates.seededAt || null;
    }
    touchModule(module, "module_skill_updated", "功能模块 skill 状态已更新");
    await this.saveProject(project);
    return module;
  }

  async getModule(projectId, moduleId) {
    const { module } = await this.getProjectAndModule(projectId, moduleId);
    return module;
  }

  async listAssets(projectId, moduleId) {
    const module = await this.getModule(projectId, moduleId);
    return module.assets;
  }

  async attachModuleAssets(projectId, moduleId, filesByField, options = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const referenceRole =
      options.documentType === "detail_design"
        ? "reference_detail_design_example"
        : options.documentType === "hil_test_case"
          ? "reference_hil_test_case_example"
          : "reference_requirement_example";
    const roleMap = {
      systemPdf: "system_pdf",
      modelPdf: "model_pdf",
      generatedCode: "generated_c",
      slx: "simulink_slx",
      referenceExample: referenceRole
    };

    const appendedAssets = [];
    for (const [fieldName, files] of Object.entries(filesByField)) {
      for (const file of files) {
        const record = buildFileRecord(projectId, moduleId, file, roleMap[fieldName] || fieldName);
        module.assets.push(record);
        appendedAssets.push(record);
      }
    }

    if (appendedAssets.length) {
      touchModule(module, "assets_uploaded", `已上传 ${appendedAssets.length} 个模块资产`);
      project.auditLog.push({
        at: now(),
        action: "module_assets_uploaded",
        detail: `${module.name} 已上传 ${appendedAssets.length} 个文件`
      });
      await this.saveProject(project);
    }

    return { module, assets: appendedAssets };
  }

  async deleteModuleAsset(projectId, moduleId, assetId) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const assetIndex = module.assets.findIndex((item) => item.id === assetId);
    if (assetIndex === -1) {
      throw new Error("Asset not found");
    }

    const [removedAsset] = module.assets.splice(assetIndex, 1);
    const assetPath = resolveStoredFilePath(removedAsset, { baseDir: config.uploadDir });
    if (assetPath) {
      await fs.rm(assetPath, { force: true });
    }

    touchModule(module, "asset_deleted", `已删除资产：${removedAsset.originalName}`);
    await this.saveProject(project);
    return module;
  }

  async getDocumentSpace(projectId, moduleId, documentType) {
    const module = await this.getModule(projectId, moduleId);
    return module.documentSpaces[normalizeDocumentType(documentType)];
  }

  async listGenerationTasks(projectId, moduleId, documentType) {
    const space = await this.getDocumentSpace(projectId, moduleId, documentType);
    return [...space.generationTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getGenerationTask(projectId, moduleId, documentType, taskId) {
    const space = await this.getDocumentSpace(projectId, moduleId, documentType);
    return space.generationTasks.find((task) => task.id === taskId) || null;
  }

  async getLatestGenerationTask(projectId, moduleId, documentType) {
    const tasks = await this.listGenerationTasks(projectId, moduleId, documentType);
    return tasks[0] || null;
  }

  async deleteGenerationTask(projectId, moduleId, documentType, taskId) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const taskIndex = space.generationTasks.findIndex((item) => item.id === taskId);
    if (taskIndex === -1) {
      throw new Error("Task not found");
    }

    const task = space.generationTasks[taskIndex];
    const [removedTask] = space.generationTasks.splice(taskIndex, 1);

    const acceptedCountBefore = space.acceptedItems.length;
    space.acceptedItems = space.acceptedItems.filter((item) => item.sourceTaskId !== taskId);
    const removedAcceptedCount = acceptedCountBefore - space.acceptedItems.length;

    touchModule(
      module,
      "task_deleted",
      `${getDocumentTypeLabel(normalizedDocumentType)}任务已删除${removedAcceptedCount ? `，并移除 ${removedAcceptedCount} 条已采纳结果` : ""}${removedTask.status === "running" ? "（任务在运行中被手动删除）" : ""}`
    );
    project.auditLog.push({
      at: now(),
      action: "module_task_deleted",
      detail: `${module.name} / ${getDocumentTypeLabel(normalizedDocumentType)} 已删除任务`
    });
    await this.saveProject(project);
    return { id: taskId, deleted: true, removedAcceptedCount };
  }

  async recordGenerationTask(projectId, moduleId, documentType, taskInput = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const task = normalizeTask({
      ...taskInput,
      moduleId,
      documentType: normalizedDocumentType,
      createdAt: now(),
      updatedAt: now()
    });

    space.generationTasks.unshift(task);
    touchModule(module, getGenerationActionLabel(normalizedDocumentType), `${getDocumentTypeLabel(normalizedDocumentType)}任务已生成`);
    project.status = "generated";
    project.auditLog.push({
      at: now(),
      action: "module_task_generated",
      detail: `${module.name} / ${getDocumentTypeLabel(normalizedDocumentType)} 已新增任务`
    });
    await this.saveProject(project);
    return task;
  }

  async updateGenerationTask(projectId, moduleId, documentType, taskId, updates = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const task = space.generationTasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if (updates.status) {
      task.status = updates.status;
    }
    if (Array.isArray(updates.inputAssetIds)) {
      task.inputAssetIds = updates.inputAssetIds;
    }
    if (Array.isArray(updates.uploadedAssetIds)) {
      task.uploadedAssetIds = updates.uploadedAssetIds;
    }
    if (Array.isArray(updates.resultItems)) {
      task.resultItems = updates.resultItems;
    }
    if (Array.isArray(updates.extractions)) {
      task.extractions = updates.extractions;
    }
    if (Array.isArray(updates.traces)) {
      task.traces = updates.traces;
    }
    if (Array.isArray(updates.conflicts)) {
      task.conflicts = updates.conflicts;
    }
    if (Object.hasOwn(updates, "llmProfile")) {
      task.llmProfile = updates.llmProfile || null;
    }
    if (typeof updates.summary === "string") {
      task.summary = updates.summary;
    }
    if (Object.hasOwn(updates, "errorMessage")) {
      task.errorMessage = String(updates.errorMessage || "").trim();
    }
    if (updates.progress && typeof updates.progress === "object") {
      task.progress = {
        ...normalizeTaskProgress(task.progress),
        ...normalizeTaskProgress({
          ...task.progress,
          ...updates.progress,
          updatedAt: now()
        })
      };
    }
    if (updates.metrics && typeof updates.metrics === "object") {
      task.metrics = {
        ...normalizeTaskMetrics(task.metrics),
        ...normalizeTaskMetrics({
          ...task.metrics,
          ...updates.metrics
        })
      };
    }
    if (updates.debug && typeof updates.debug === "object") {
      task.debug = mergeTaskDebug(task.debug, updates.debug);
    }
    if (updates.timelineEntry && typeof updates.timelineEntry === "object") {
      appendTimelineEntry(task, updates.timelineEntry);
    }
    if (updates.debugEvent && typeof updates.debugEvent === "object") {
      appendTaskDebugEvent(task, updates.debugEvent);
    }
    task.summary = buildTaskSummary(task);
    task.updatedAt = now();

    if (task.status === "completed") {
      touchModule(module, getGenerationActionLabel(normalizedDocumentType), `${getDocumentTypeLabel(normalizedDocumentType)}任务已完成`);
    } else if (task.status === "failed") {
      touchModule(module, "task_failed", `${getDocumentTypeLabel(normalizedDocumentType)}任务执行失败`);
    } else {
      touchModule(module, "task_updated", `${getDocumentTypeLabel(normalizedDocumentType)}任务状态已更新`);
    }

    await this.saveProject(project);
    return task;
  }

  async reviewTaskResult(projectId, moduleId, documentType, taskId, resultItemId, review = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const task = module.documentSpaces[normalizedDocumentType].generationTasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    const resultItem = task.resultItems.find((item) => item.id === resultItemId);
    if (!resultItem) {
      throw new Error("Result item not found");
    }

    if (typeof review.requirementText === "string" && review.requirementText.trim()) {
      resultItem.requirementText = review.requirementText.trim();
    }
    if (typeof review.title === "string" && review.title.trim()) {
      resultItem.title = review.title.trim();
    }

    const nextStatus = review.status || resultItem.review?.status || "pending";
    const effectiveTargetArea = normalizeTargetArea(review.targetArea) || normalizeTargetArea(resultItem.review?.targetArea);
    if (
      nextStatus === "rejected" &&
      (!review.reasonCategory || !String(review.reasonText || "").trim() || !effectiveTargetArea)
    ) {
      const error = new Error("Rejected review requires reasonCategory, reasonText, and targetArea");
      error.statusCode = 400;
      throw error;
    }

    resultItem.review = {
      ...(resultItem.review || {}),
      status: nextStatus,
      reviewer: review.reviewer || resultItem.review?.reviewer || "当前用户",
      comment: review.comment?.trim() || "",
      reasonCategory: review.reasonCategory || resultItem.review?.reasonCategory || "",
      reasonTags: normalizeReasonTags(review.reasonTags),
      reasonText: review.reasonText?.trim() || "",
      targetArea: effectiveTargetArea || "",
      severity: review.severity || resultItem.review?.severity || "medium",
      expectedNote: review.expectedNote?.trim() || "",
      targetLayerConstraint: review.targetLayerConstraint || resultItem.review?.targetLayerConstraint || "docType",
      includeInPool: review.includeInPool !== false,
      rejectionId: resultItem.review?.rejectionId || "",
      updatedAt: now()
    };

    if (nextStatus === "rejected") {
      const rejection = await this.rejectionService.createRecord({
          project: {
            ...project,
            extractions: task.extractions || [],
            lastGeneration: {
              at: task.updatedAt || task.createdAt || now(),
              llmProfile: task.llmProfile || null
            }
          },
          module,
          task,
          documentType: normalizedDocumentType,
          conflicts: (task.conflicts || []).filter(
            (item) => item.requirementId === resultItem.id || item.requirementId === resultItem.requirementId
          ),
          traces: (task.traces || []).filter(
            (item) =>
              item.requirementId === resultItem.id ||
              item.requirementId === resultItem.requirementId ||
              item.requirementCode === resultItem.requirementId
          ),
          requirement: {
            id: resultItem.id,
            requirementId: resultItem.requirementId,
            title: resultItem.title,
            requirementText: resultItem.requirementText,
            type: resultItem.type,
            confidence: resultItem.confidence,
            verificationHint: resultItem.verificationHint || "",
            conflictNote: resultItem.conflictNote || "",
            sourceRefs: resultItem.sourceRefs || []
          },
          review: {
            ...review,
            status: nextStatus,
            reasonTags: resultItem.review.reasonTags,
            targetArea: resultItem.review.targetArea,
            targetLayerConstraint: resultItem.review.targetLayerConstraint,
            generationId: task.id,
            resultItemId: resultItem.id,
            documentType: normalizedDocumentType,
            moduleId: module.id,
            moduleName: module.name
          }
        });
      resultItem.review.rejectionId = rejection.id;
    }

    task.updatedAt = now();
    touchModule(module, "task_result_reviewed", `${getDocumentTypeLabel(normalizedDocumentType)}结果已审核`);
    await this.saveProject(project);
    return resultItem;
  }

  async listAcceptedItems(projectId, moduleId, documentType) {
    const space = await this.getDocumentSpace(projectId, moduleId, documentType);
    return [...space.acceptedItems];
  }

  async createAcceptedItem(projectId, moduleId, documentType, input = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const task = space.generationTasks.find((item) => item.id === input.sourceTaskId);
    if (!task) {
      throw new Error("Task not found");
    }

    const resultItem = task.resultItems.find((item) => item.id === input.sourceResultItemId);
    if (!resultItem) {
      throw new Error("Result item not found");
    }

    const acceptedItem = normalizeAcceptedItem({
      sourceTaskId: task.id,
      sourceResultItemId: resultItem.id,
      acceptedSnapshot: cloneForAcceptedSnapshot(resultItem),
      currentContent: {
        ...cloneForAcceptedSnapshot(resultItem),
        requirementText: input.requirementText?.trim() || resultItem.requirementText,
        title: input.title?.trim() || resultItem.title
      },
      review: {
        status: "accepted",
        reviewer: input.reviewer || "当前用户",
        comment: input.comment?.trim() || ""
      }
    });

    resultItem.review = {
      status: "accepted",
      reviewer: acceptedItem.review.reviewer,
      comment: acceptedItem.review.comment,
      updatedAt: now()
    };
    task.updatedAt = now();
    space.acceptedItems.unshift(acceptedItem);

    touchModule(module, "accepted_item_created", `${getDocumentTypeLabel(normalizedDocumentType)}条目已接受`);
    await this.saveProject(project);
    return acceptedItem;
  }

  async updateAcceptedItem(projectId, moduleId, documentType, acceptedItemId, input = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const acceptedItem = space.acceptedItems.find((item) => item.id === acceptedItemId);
    if (!acceptedItem) {
      throw new Error("Accepted item not found");
    }

    acceptedItem.currentContent = {
      ...(acceptedItem.currentContent || {}),
      title: input.title?.trim() || acceptedItem.currentContent?.title || acceptedItem.acceptedSnapshot?.title || "",
      requirementText:
        input.requirementText?.trim() ||
        acceptedItem.currentContent?.requirementText ||
        acceptedItem.acceptedSnapshot?.requirementText ||
        ""
    };
    acceptedItem.review = {
      ...(acceptedItem.review || {}),
      reviewer: input.reviewer || acceptedItem.review?.reviewer || "当前用户",
      comment: input.comment?.trim() || acceptedItem.review?.comment || "",
      updatedAt: now()
    };
    acceptedItem.updatedAt = now();

    touchModule(module, "accepted_item_updated", `${getDocumentTypeLabel(normalizedDocumentType)}接受结果已更新`);
    await this.saveProject(project);
    return acceptedItem;
  }

  async deleteAcceptedItem(projectId, moduleId, documentType, acceptedItemId) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const acceptedIndex = space.acceptedItems.findIndex((item) => item.id === acceptedItemId);
    if (acceptedIndex === -1) {
      throw new Error("Accepted item not found");
    }

    const [acceptedItem] = space.acceptedItems.splice(acceptedIndex, 1);
    const sourceTask = space.generationTasks.find((item) => item.id === acceptedItem.sourceTaskId);
    const sourceResult = sourceTask?.resultItems?.find((item) => item.id === acceptedItem.sourceResultItemId);
    if (sourceResult?.review?.status === "accepted") {
      sourceResult.review = {
        ...(sourceResult.review || {}),
        status: "pending",
        reviewer: sourceResult.review?.reviewer || "当前用户",
        comment: "已从采纳结果区移除",
        updatedAt: now()
      };
      sourceTask.updatedAt = now();
    }

    touchModule(module, "accepted_item_deleted", `${getDocumentTypeLabel(normalizedDocumentType)}接受结果已删除`);
    await this.saveProject(project);
    return { id: acceptedItemId, deleted: true };
  }

  async reorderAcceptedItems(projectId, moduleId, documentType, orderedIds = []) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const currentItems = [...space.acceptedItems];
    const idSet = new Set(currentItems.map((item) => item.id));
    const normalizedOrderedIds = Array.isArray(orderedIds) ? orderedIds.map((item) => String(item || "").trim()).filter(Boolean) : [];

    if (normalizedOrderedIds.length !== currentItems.length || normalizedOrderedIds.some((id) => !idSet.has(id))) {
      const error = new Error("Accepted item order is invalid");
      error.statusCode = 400;
      throw error;
    }

    const itemMap = new Map(currentItems.map((item) => [item.id, item]));
    space.acceptedItems = normalizedOrderedIds.map((id) => itemMap.get(id)).filter(Boolean);

    touchModule(module, "accepted_item_reordered", `${getDocumentTypeLabel(normalizedDocumentType)}接受结果顺序已调整`);
    await this.saveProject(project);
    return [...space.acceptedItems];
  }

  async getProjectAndModule(projectId, moduleId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const module = project.modules.find((item) => item.id === moduleId);
    if (!module) {
      throw new Error("Module not found");
    }

    return { project, module };
  }

  async attachFiles(projectId, filesByField) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const roleMap = {
      systemPdf: "system_pdf",
      modelPdf: "model_pdf",
      generatedCode: "generated_c",
      slx: "simulink_slx"
    };

    for (const [fieldName, files] of Object.entries(filesByField)) {
      for (const file of files) {
        project.files.push(buildFileRecord(projectId, "", file, roleMap[fieldName] || fieldName));
      }
    }

    project.status = "files_uploaded";
    project.auditLog.push({
      at: now(),
      action: "files_uploaded",
      detail: `已上传 ${project.files.length} 个文件`
    });

    return this.saveProject(project);
  }

  async deleteFile(projectId, fileId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const fileIndex = project.files.findIndex((item) => item.id === fileId);
    if (fileIndex === -1) {
      throw new Error("File not found");
    }

    const [removedFile] = project.files.splice(fileIndex, 1);
    const filePath = resolveStoredFilePath(removedFile, { baseDir: config.uploadDir });
    if (filePath) {
      await fs.rm(filePath, { force: true });
    }

    project.extractions = [];
    project.requirements = [];
    project.traces = [];
    project.conflicts = [];
    project.lastGeneration = null;
    project.status = project.files.length ? "files_uploaded" : "draft";
    project.auditLog.push({
      at: now(),
      action: "file_deleted",
      detail: `已删除文件：${removedFile.originalName}`
    });

    return this.saveProject(project);
  }

  async updateGeneratedArtifacts(projectId, result) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    project.extractions = result.extractions;
    project.requirements = result.requirements;
    project.traces = result.traces;
    project.conflicts = result.conflicts;
    project.lastGeneration = result.llmProfile
      ? {
          at: now(),
          llmProfile: result.llmProfile
        }
      : {
          at: now(),
          llmProfile: null
        };
    project.status = "generated";
    const documentTypeLabel = getDocumentTypeLabel(project.documentType);
    project.auditLog.push({
      at: now(),
      action: getGenerationActionLabel(project.documentType),
      detail: result.llmProfile
        ? `使用 ${result.llmProfile.name}（${result.llmProfile.model}）生成 ${result.requirements.length} 条${documentTypeLabel}`
        : `使用本地回退模式生成 ${result.requirements.length} 条${documentTypeLabel}`
    });

    return this.saveProject(project);
  }

  async deleteRequirement(projectId, requirementId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const requirementIndex = project.requirements.findIndex((item) => item.id === requirementId);
    if (requirementIndex === -1) {
      throw new Error("Requirement not found");
    }

    const [removedRequirement] = project.requirements.splice(requirementIndex, 1);
    project.traces = (project.traces || []).filter((item) => item.requirementId !== requirementId);
    project.conflicts = (project.conflicts || []).filter(
      (item) => item.requirementId !== requirementId && item.requirementCode !== removedRequirement.requirementId
    );

    project.auditLog.push({
      at: now(),
      action: "requirement_deleted",
      detail: `${removedRequirement.requirementId} 已删除`
    });

    return this.saveProject(project);
  }

  async reviewRequirement(projectId, requirementId, review) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const requirement = project.requirements.find((item) => item.id === requirementId);
    if (!requirement) {
      throw new Error("Requirement not found");
    }

    if (typeof review.requirementText === "string" && review.requirementText.trim()) {
      requirement.requirementText = review.requirementText.trim();
    }

    const nextStatus = review.status || requirement.review?.status || "pending";
    const effectiveTargetArea = normalizeTargetArea(review.targetArea) || normalizeTargetArea(requirement.review?.targetArea);
    if (
      nextStatus === "rejected" &&
      (!review.reasonCategory || !String(review.reasonText || "").trim() || !effectiveTargetArea)
    ) {
      const error = new Error("Rejected review requires reasonCategory, reasonText, and targetArea");
      error.statusCode = 400;
      throw error;
    }

    requirement.review = {
      status: nextStatus,
      reviewer: review.reviewer || "当前用户",
      comment: review.comment?.trim() || "",
      reasonCategory: review.reasonCategory || requirement.review?.reasonCategory || "",
      reasonTags: normalizeReasonTags(review.reasonTags),
      reasonText: review.reasonText?.trim() || "",
      targetArea: effectiveTargetArea || "",
      severity: review.severity || requirement.review?.severity || "medium",
      expectedNote: review.expectedNote?.trim() || "",
      targetLayerConstraint: review.targetLayerConstraint || requirement.review?.targetLayerConstraint || "docType",
      includeInPool: review.includeInPool !== false,
      rejectionId: requirement.review?.rejectionId || "",
      updatedAt: now()
    };

    if (nextStatus === "rejected") {
      const rejection = await this.rejectionService.createRecord({
        project,
        requirement,
        review: {
          ...review,
          status: nextStatus,
          reasonTags: requirement.review.reasonTags,
          targetArea: requirement.review.targetArea,
          targetLayerConstraint: requirement.review.targetLayerConstraint
        }
      });
      requirement.review.rejectionId = rejection.id;
    }

    project.auditLog.push({
      at: now(),
      action: "requirement_reviewed",
      detail: `${requirement.requirementId} -> ${requirement.review.status}`
    });

    return this.saveProject(project);
  }
}
