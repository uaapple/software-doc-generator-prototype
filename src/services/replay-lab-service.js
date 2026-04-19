import { ReplayTaskService } from "./replay-task-service.js";
import { SkillWorkOrderService } from "./skill-work-order-service.js";
import { ProjectService } from "./project-service.js";
import { ModuleSkillService } from "./module-skill-service.js";

export const DEFAULT_REPLAY_LAB_TEMPLATE_TASK_ID = "d26e2449-847d-435f-bbd4-c8aab1dc8e88";

function createManagedError(message, statusCode = 400, code = "replay_lab_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function summarizeTask(task = {}) {
  return {
    id: task.id || "",
    taskStatus: task.taskStatus || "",
    summary: task.summary || "",
    decisionSummary: task.decisionSummary || "",
    projectId: task.projectId || "",
    projectName: task.projectName || "",
    moduleId: task.moduleId || "",
    moduleName: task.moduleName || "",
    llmProfileId: task.llmProfileId || "",
    workOrderId: task.workOrderId || "",
    workOrderSummary: cloneJson(task.workOrderSummary || null),
    referenceAssetIds: cloneJson(task.referenceAssetIds || []),
    sourceRejectionIds: cloneJson(task.sourceRejectionIds || []),
    createdAt: task.createdAt || "",
    updatedAt: task.updatedAt || "",
    materialPackSummary: {
      targetAreas: cloneJson(task.materialPack?.targetAreas || []),
      targetLayerConstraint: task.materialPack?.targetLayerConstraint || "",
      targetProfileKeyConstraint: task.materialPack?.targetProfileKeyConstraint || "",
      ruleIndexVersion: task.materialPack?.ruleIndexVersion || "",
      moduleContext: cloneJson(task.materialPack?.moduleContext || {}),
      layerSkillCount: Array.isArray(task.materialPack?.layerSkillItems)
        ? task.materialPack.layerSkillItems.length
        : Array.isArray(task.materialPack?.candidateSkillItems)
          ? task.materialPack.candidateSkillItems.length
          : 0,
      candidateSkillCount: Array.isArray(task.materialPack?.layerSkillItems)
        ? task.materialPack.layerSkillItems.length
        : Array.isArray(task.materialPack?.candidateSkillItems)
          ? task.materialPack.candidateSkillItems.length
          : 0,
      referenceAssetCount: Array.isArray(task.materialPack?.referenceAssets) ? task.materialPack.referenceAssets.length : 0
    }
  };
}

function buildValidationContext(task = {}, module = null, initialization = null) {
  return {
    projectId: task.projectId || "",
    projectName: task.projectName || "",
    moduleId: task.moduleId || "",
    moduleName: task.moduleName || "",
    documentType: task.materialPack?.moduleContext?.documentType || "software_requirement",
    moduleSkillKey: module?.moduleSkillKey || task.materialPack?.moduleContext?.moduleSkillKey || "",
    domain: module?.domain || task.materialPack?.moduleContext?.domain || "",
    assets: cloneJson(module?.assets || []),
    initialization: cloneJson(initialization || null)
  };
}

export class ReplayLabService {
  constructor() {
    this.replayTaskService = new ReplayTaskService();
    this.skillWorkOrderService = new SkillWorkOrderService();
    this.projectService = new ProjectService();
    this.moduleSkillService = new ModuleSkillService();
  }

  async getTemplate(taskId = DEFAULT_REPLAY_LAB_TEMPLATE_TASK_ID) {
    const templateTask = await this.replayTaskService.getTask(taskId);
    if (!templateTask) {
      throw createManagedError("Replay Lab template task not found", 404, "replay_lab_template_not_found", { taskId });
    }

    const templateWorkOrder = templateTask.workOrderId
      ? await this.skillWorkOrderService.getWorkOrder(templateTask.workOrderId)
      : null;
    const templatePromptPreview = this.replayTaskService.extractPromptPreview(templateTask.materialPack || {});
    const currentContext = await this.replayTaskService.resolveTaskContext({
      rejectionIds: templateTask.sourceRejectionIds || [],
      targetBundleId: templateTask.targetBundleId || "",
      projectId: templateTask.projectId || "",
      moduleId: templateTask.moduleId || "",
      referenceAssetIds: templateTask.referenceAssetIds || []
    });
    const currentPreview = await this.replayTaskService.buildTaskPreview(currentContext, {
      forceRuleIndexRefresh: true
    });

    let module = null;
    let initialization = null;
    if (templateTask.projectId && templateTask.moduleId) {
      module = await this.projectService.getModule(templateTask.projectId, templateTask.moduleId);
      const project = await this.projectService.getProject(templateTask.projectId);
      if (project && module) {
        initialization = await this.moduleSkillService.inspectModule(
          project,
          module,
          templateTask.materialPack?.moduleContext?.documentType || "software_requirement"
        );
      }
    }

    return {
      defaultTemplateTaskId: DEFAULT_REPLAY_LAB_TEMPLATE_TASK_ID,
      templateTask: cloneJson(templateTask),
      templateTaskSummary: summarizeTask(templateTask),
      templateWorkOrder: cloneJson(templateWorkOrder),
      templatePromptPreview,
      currentPreview: {
        materialPack: cloneJson(currentPreview.materialPack),
        promptPreview: cloneJson(currentPreview.promptPreview),
        ruleDiagnostics: cloneJson(currentPreview.ruleDiagnostics),
        activeSkillSummary: cloneJson(currentPreview.activeSkillSummary)
      },
      validationContext: buildValidationContext(templateTask, module, initialization)
    };
  }

  async rerunTemplate(taskId, payload = {}) {
    const templateTask = await this.replayTaskService.getTask(taskId);
    if (!templateTask) {
      throw createManagedError("Replay Lab template task not found", 404, "replay_lab_template_not_found", { taskId });
    }

    const llmProfileId =
      typeof payload.llmProfileId === "string" && payload.llmProfileId.trim()
        ? payload.llmProfileId.trim()
        : templateTask.llmProfileId || "";

    const currentContext = await this.replayTaskService.resolveTaskContext({
      rejectionIds: templateTask.sourceRejectionIds || [],
      targetBundleId: templateTask.targetBundleId || "",
      projectId: templateTask.projectId || "",
      moduleId: templateTask.moduleId || "",
      referenceAssetIds: templateTask.referenceAssetIds || []
    });
    const currentPreview = await this.replayTaskService.buildTaskPreview(currentContext, {
      forceRuleIndexRefresh: true
    });
    const rerunTask = await this.replayTaskService.createTask({
      rejectionIds: templateTask.sourceRejectionIds || [],
      targetBundleId: templateTask.targetBundleId || "",
      projectId: templateTask.projectId || "",
      moduleId: templateTask.moduleId || "",
      referenceAssetIds: templateTask.referenceAssetIds || [],
      llmProfileId,
      forceRuleIndexRefresh: true
    });
    const rerunWorkOrder = rerunTask.workOrderId
      ? await this.skillWorkOrderService.getWorkOrder(rerunTask.workOrderId)
      : null;

    return {
      templateTaskId: taskId,
      latestRunTaskId: rerunTask.id,
      currentPreview: {
        materialPack: cloneJson(currentPreview.materialPack),
        promptPreview: cloneJson(currentPreview.promptPreview),
        ruleDiagnostics: cloneJson(currentPreview.ruleDiagnostics),
        activeSkillSummary: cloneJson(currentPreview.activeSkillSummary)
      },
      task: cloneJson(rerunTask),
      taskSummary: summarizeTask(rerunTask),
      workOrder: cloneJson(rerunWorkOrder)
    };
  }

  async getRun(taskId) {
    const task = await this.replayTaskService.getTask(taskId);
    if (!task) {
      throw createManagedError("Replay Lab run task not found", 404, "replay_lab_run_not_found", { taskId });
    }
    const workOrder = task.workOrderId
      ? await this.skillWorkOrderService.getWorkOrder(task.workOrderId)
      : null;

    let module = null;
    let initialization = null;
    if (task.projectId && task.moduleId) {
      module = await this.projectService.getModule(task.projectId, task.moduleId);
      const project = await this.projectService.getProject(task.projectId);
      if (project && module) {
        initialization = await this.moduleSkillService.inspectModule(
          project,
          module,
          task.materialPack?.moduleContext?.documentType || "software_requirement"
        );
      }
    }

    return {
      task: cloneJson(task),
      taskSummary: summarizeTask(task),
      workOrder: cloneJson(workOrder),
      promptPreview: this.replayTaskService.extractPromptPreview(task.materialPack || {}),
      validationContext: buildValidationContext(task, module, initialization)
    };
  }
}
