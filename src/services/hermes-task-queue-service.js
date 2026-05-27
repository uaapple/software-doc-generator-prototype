import { config } from "../config.js";

function now() {
  return new Date().toISOString();
}

function normalizeStatus(status = "") {
  const normalized = String(status || "").trim();
  if (normalized === "done") return "completed";
  return normalized || "queued";
}

function taskTime(task = {}) {
  return Date.parse(task.updatedAt || task.createdAt || "") || 0;
}

function getLatestMessage(task = {}) {
  return (
    task.progress?.message ||
    task.summary ||
    task.errorMessage ||
    task.runtimeEvents?.at?.(-1)?.message ||
    task.timeline?.at?.(-1)?.message ||
    ""
  );
}

function getGenerationTitle(task = {}) {
  if (task.taskKind === "module_skill_bootstrap") return "模块技能冷启动";
  if (task.documentType === "detail_design") return "详细设计生成";
  if (task.documentType === "hil_test_case") return "HIL 用例生成";
  return "软件需求生成";
}

function getDocumentExtractionTitle(task = {}) {
  if (task.targetDocumentType === "hil_test_case") return "HIL 用例文档提取";
  if (task.targetDocumentType === "detail_design") return "详细设计文档提取";
  return "软件需求文档提取";
}

function buildQueueKey(type = "", id = "") {
  return `${type}:${id}`;
}

export class HermesTaskQueueService {
  constructor(options = {}) {
    this.projectService = options.projectService || null;
    this.replayTaskService = options.replayTaskService || null;
    this.unitTestCaseGenerationService = options.unitTestCaseGenerationService || null;
    this.concurrency = Math.max(1, Number(options.concurrency || config.hermes?.taskConcurrency || 1) || 1);
    this.items = [];
    this.activeCount = 0;
  }

  setReplayTaskService(replayTaskService) {
    this.replayTaskService = replayTaskService;
  }

  setUnitTestCaseGenerationService(unitTestCaseGenerationService) {
    this.unitTestCaseGenerationService = unitTestCaseGenerationService;
  }

  enqueue(input = {}) {
    const id = String(input.id || "").trim();
    const type = String(input.type || "").trim();
    const run = input.run;
    if (!id || !type || typeof run !== "function") {
      throw new Error("Hermes queue item requires id, type and run handler");
    }

    const key = buildQueueKey(type, id);
    const existing = this.items.find((item) => item.key === key);
    if (existing) {
      return existing.promise;
    }

    const item = {
      key,
      id,
      type,
      title: input.title || "",
      projectId: input.projectId || "",
      moduleId: input.moduleId || "",
      documentType: input.documentType || "",
      status: "queued",
      enqueuedAt: now(),
      startedAt: "",
      run,
      onStart: typeof input.onStart === "function" ? input.onStart : async () => null,
      onError: typeof input.onError === "function" ? input.onError : async () => null,
      promise: null
    };

    item.promise = new Promise((resolve) => {
      item.resolve = resolve;
    });
    this.items.push(item);
    this.dispatch();
    return item.promise;
  }

  dispatch() {
    while (this.activeCount < this.concurrency) {
      const item = this.items.find((candidate) => candidate.status === "queued");
      if (!item) return;
      this.startItem(item);
    }
  }

  startItem(item) {
    item.status = "running";
    item.startedAt = now();
    this.activeCount += 1;

    Promise.resolve()
      .then(() => item.onStart({ startedAt: item.startedAt }))
      .then(() => item.run())
      .then((result) => {
        item.status = "completed";
        item.resolve(result);
      })
      .catch(async (error) => {
        item.status = "failed";
        try {
          await item.onError(error);
        } catch (_error) {
          // The task-specific runner already owns persisted failure state.
        }
        item.resolve(null);
      })
      .finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.items = this.items.filter((candidate) => candidate !== item);
        this.dispatch();
      });
  }

  getQueuePosition(type = "", id = "") {
    const key = buildQueueKey(type, id);
    const queued = this.items.filter((item) => item.status === "queued");
    const index = queued.findIndex((item) => item.key === key);
    return index >= 0 ? index + 1 : 0;
  }

  cancelQueued(type = "", id = "") {
    const key = buildQueueKey(type, id);
    const item = this.items.find((candidate) => candidate.key === key && candidate.status === "queued");
    if (!item) {
      return false;
    }
    item.status = "cancelled";
    this.items = this.items.filter((candidate) => candidate !== item);
    item.resolve?.(null);
    return true;
  }

  getRuntimeSnapshot(type = "", id = "") {
    const key = buildQueueKey(type, id);
    return this.items.find((item) => item.key === key) || null;
  }

  async listTaskSummaries() {
    const [projectTasks, replayTasks, unitTestCaseTasks] = await Promise.all([
      this.listProjectTaskSummaries(),
      this.listReplayTaskSummaries(),
      this.listUnitTestCaseTaskSummaries()
    ]);
    const sorted = [...projectTasks, ...replayTasks, ...unitTestCaseTasks].sort((a, b) => {
      const rank = { running: 0, queued: 1, failed: 2, completed: 3 };
      const statusDiff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (statusDiff) return statusDiff;
      if (a.status === "queued" && b.status === "queued") {
        return (a.queuePosition || 9999) - (b.queuePosition || 9999);
      }
      return taskTime(b) - taskTime(a);
    });
    return sorted.filter((task, index) => {
      if (task.status === "running" || task.status === "queued") return true;
      if (task.status === "failed") return index < 80;
      return index < 120;
    });
  }

  async listProjectTaskSummaries() {
    if (!this.projectService) return [];
    const projects = await this.projectService.listProjects();
    const summaries = [];
    for (const project of projects) {
      for (const module of project.modules || []) {
        for (const documentType of ["software_requirement", "detail_design", "hil_test_case"]) {
          for (const task of module.documentSpaces?.[documentType]?.generationTasks || []) {
            summaries.push(this.buildGenerationSummary(project, module, documentType, task));
          }
        }
        for (const task of module.documentExtractionTasks || []) {
          summaries.push(this.buildDocumentExtractionSummary(project, module, task));
        }
        for (const task of module.slxParserTasks || []) {
          summaries.push(this.buildSlxParserSummary(project, module, task));
        }
        for (const session of module.slxInterpreterSessions || []) {
          for (const message of session.messages || []) {
            if (message.role === "assistant" && message.taskId) {
              summaries.push(this.buildSlxInterpreterSummary(project, module, session, message));
            }
          }
        }
      }
    }
    return summaries;
  }

  async listReplayTaskSummaries() {
    if (!this.replayTaskService) return [];
    const tasks = await this.replayTaskService.listTasks();
    return tasks.map((task) => this.buildReplaySummary(task));
  }

  async listUnitTestCaseTaskSummaries() {
    if (!this.unitTestCaseGenerationService) return [];
    const tasks = await this.unitTestCaseGenerationService.listTasks();
    return tasks.map((task) => this.buildUnitTestCaseSummary(task));
  }

  buildGenerationSummary(project = {}, module = {}, documentType = "", task = {}) {
    const type = task.taskKind === "module_skill_bootstrap" ? "module_skill_bootstrap" : "generation";
    const status = normalizeStatus(task.status);
    return {
      id: task.id,
      type,
      status,
      title: getGenerationTitle({ ...task, documentType }),
      projectId: project.id,
      projectName: project.name || "",
      moduleId: module.id,
      moduleName: module.name || "",
      documentType,
      queuePosition: status === "queued" ? this.getQueuePosition(type, task.id) : 0,
      progress: task.progress || null,
      latestMessage: getLatestMessage(task),
      createdAt: task.createdAt || "",
      startedAt: task.debug?.agent?.startedAt || task.startedAt || "",
      updatedAt: task.updatedAt || task.createdAt || "",
      detailUrl: `/projects/${project.id}/modules/${module.id}/spaces/${documentType}/tasks/${task.id}`
    };
  }

  buildDocumentExtractionSummary(project = {}, module = {}, task = {}) {
    const type = "document_extraction";
    const status = normalizeStatus(task.status);
    return {
      id: task.id,
      type,
      status,
      title: getDocumentExtractionTitle(task),
      projectId: project.id,
      projectName: project.name || "",
      moduleId: module.id,
      moduleName: module.name || "",
      documentType: task.targetDocumentType || "",
      queuePosition: status === "queued" ? this.getQueuePosition(type, task.id) : 0,
      progress: task.progress || null,
      latestMessage: getLatestMessage(task),
      createdAt: task.createdAt || "",
      startedAt: task.debug?.agent?.startedAt || task.startedAt || "",
      updatedAt: task.updatedAt || task.createdAt || "",
      detailUrl: `/projects/${project.id}/modules/${module.id}?openHistory=1&highlightTaskId=${task.id}`
    };
  }

  buildSlxParserSummary(project = {}, module = {}, task = {}) {
    const type = "slx_parse";
    const status = normalizeStatus(task.status);
    const moduleName = module.name || "";
    const title = moduleName ? `SLX 解释器 · ${moduleName}` : "SLX 解释器";
    return {
      id: task.id,
      type,
      status,
      title,
      projectId: project.id,
      projectName: project.name || "",
      moduleId: module.id,
      moduleName,
      documentType: "software_requirement",
      queuePosition: status === "queued" ? this.getQueuePosition("slx_parse", task.id) : 0,
      progress: task.progress || null,
      latestMessage: getLatestMessage(task),
      createdAt: task.createdAt || "",
      startedAt: task.debug?.agent?.startedAt || task.startedAt || "",
      updatedAt: task.updatedAt || task.createdAt || "",
      detailUrl: `/slx-interpreter?projectId=${project.id}&moduleId=${module.id}&highlightTaskId=${task.id}`
    };
  }

  buildSlxInterpreterSummary(project = {}, module = {}, session = {}, message = {}) {
    const type = "slx_interpret";
    const status = normalizeStatus(message.status);
    const modelName = session.modelName || "SLX 模型";
    return {
      id: message.taskId,
      type,
      status,
      title: `SLX 解释 · ${modelName}`,
      projectId: project.id,
      projectName: project.name || "",
      moduleId: module.id,
      moduleName: module.name || "",
      documentType: "software_requirement",
      queuePosition: status === "queued" ? this.getQueuePosition(type, message.taskId) : 0,
      progress: message.progress || null,
      latestMessage: getLatestMessage(message),
      createdAt: message.createdAt || "",
      startedAt: message.debug?.agent?.startedAt || "",
      updatedAt: message.updatedAt || message.createdAt || "",
      detailUrl: `/slx-interpreter?projectId=${project.id}&moduleId=${module.id}&sessionId=${session.id}&highlightTaskId=${message.taskId}&messageId=${message.id}`
    };
  }

  buildReplaySummary(task = {}) {
    const type = "replay";
    const status = normalizeStatus(task.taskStatus);
    const projectId = task.projectId || task.materialPack?.moduleContext?.projectId || "";
    const moduleId = task.moduleId || task.materialPack?.moduleContext?.moduleId || "";
    return {
      id: task.id,
      type,
      status,
      title: "Replay / Fallback",
      projectId,
      projectName: task.projectName || task.materialPack?.moduleContext?.projectName || "",
      moduleId,
      moduleName: task.moduleName || task.materialPack?.moduleContext?.moduleName || "",
      documentType: task.materialPack?.moduleContext?.documentType || "software_requirement",
      queuePosition: status === "queued" ? this.getQueuePosition(type, task.id) : 0,
      progress: task.progress || null,
      latestMessage: getLatestMessage(task),
      createdAt: task.createdAt || "",
      startedAt: task.debug?.agent?.startedAt || task.startedAt || "",
      updatedAt: task.updatedAt || task.createdAt || "",
      detailUrl: `/feedback-pool?projectId=${projectId}&moduleId=${moduleId}&taskId=${task.id}`
    };
  }

  buildUnitTestCaseSummary(task = {}) {
    const type = "unit_test_case_generation";
    const status = normalizeStatus(task.status);
    const modelName = task.inputs?.modelSlx?.originalName || "Simulink 模型";
    return {
      id: task.id,
      type,
      status,
      title: `单元测试用例 · ${modelName}`,
      projectId: "",
      projectName: "",
      moduleId: "",
      moduleName: modelName,
      documentType: "unit_test_case",
      queuePosition: status === "queued" ? this.getQueuePosition(type, task.id) : 0,
      progress: task.progress || null,
      latestMessage: getLatestMessage(task),
      createdAt: task.createdAt || "",
      startedAt: task.startedAt || "",
      updatedAt: task.updatedAt || task.createdAt || "",
      detailUrl: `/unit-test-case-generation?taskId=${task.id}`
    };
  }
}
