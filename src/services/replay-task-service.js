import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, resolveStoredFilePath, writeJson } from "./storage.js";
import { ProjectService } from "./project-service.js";
import { RejectionService } from "./rejection-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { SkillRuleService } from "./skill-rule-service.js";
import { LlmService, buildReplayModelInput } from "./llm-service.js";
import { SkillLoader } from "./skill-loader.js";
import { SkillWorkOrderService } from "./skill-work-order-service.js";
import { HermesAgentClient } from "./hermes-agent-client.js";
import { ReplayArtifactService } from "./replay-artifact-service.js";
import {
  ALLOWED_KINDS_BY_AREA,
  ALLOWED_KINDS_BY_LAYER,
  getAllowedKindsForAreasAndLayer,
  isKindAllowedForLayer
} from "../../public/skill-kind-matrix.js";

function now() {
  return new Date().toISOString();
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getTaskPath(taskId) {
  return path.join(config.replayTaskStoreDir, `${taskId}.json`);
}

function normalizeArea(area = "") {
  return area || "validation";
}

function normalizeSkillKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_");
}

function normalizeLayerConstraint(value = "") {
  const normalized = String(value || "").trim();
  return ["generic", "docType", "domain", "module"].includes(normalized) ? normalized : "";
}

function resolveLayerProfileKey(layerConstraint = "", context = {}) {
  if (layerConstraint === "module") {
    return normalizeSkillKey(context.moduleSkillKey || context.moduleName || "");
  }
  if (layerConstraint === "domain") {
    return normalizeSkillKey(context.domain || "embedded_vcu");
  }
  if (layerConstraint === "docType") {
    return normalizeSkillKey(context.documentType || "software_requirement");
  }
  return "generic";
}

function buildAllowedKindsByArea() {
  return ALLOWED_KINDS_BY_AREA;
}

function buildAllowedKindsByLayer() {
  return ALLOWED_KINDS_BY_LAYER;
}

function buildLayerDefinitions() {
  return {
    generic: "跨模块和跨文档通用的基础规则，只有在确实具有全局适用性时才放这里。",
    docType: "只对某种文档类型生效的规则，例如 software_requirement / detail_design / hil_test_case。",
    domain: "在某个领域内广泛适用但不局限于单一模块的规则。",
    module: "只对单个功能模块或单个 moduleSkillKey 生效的规则。"
  };
}

function validateProposalTargets(proposalItems = [], targetAreas = [], options = {}) {
  const targetLayerConstraint = normalizeLayerConstraint(options.targetLayerConstraint || "");
  const targetProfileKeyConstraint = normalizeSkillKey(options.targetProfileKeyConstraint || "");
  const allowedSkillCodes = new Set((options.allowedSkillCodes || []).map((item) => String(item || "").trim()).filter(Boolean));
  for (const item of proposalItems) {
    const layer = String(item.targetLayer || "").trim();
    if (!["generic", "docType", "domain", "module"].includes(layer)) {
      throw createHttpError(`Unsupported proposal targetLayer: ${layer}`);
    }
    if (!isKindAllowedForLayer(layer, item.kind)) {
      throw createHttpError(`Unsupported proposal kind for target layer: ${item.kind}`, 400);
    }
    const allowedKinds = new Set(getAllowedKindsForAreasAndLayer(targetAreas, layer));
    if (!allowedKinds.has(item.kind)) {
      throw createHttpError(`Unsupported proposal kind for current target area and target layer: ${item.kind}`, 400);
    }
    if (!String(item.targetProfileKey || "").trim()) {
      throw createHttpError("Proposal targetProfileKey is required");
    }
    if (targetLayerConstraint && layer !== targetLayerConstraint) {
      throw createHttpError(`Proposal targetLayer must stay within ${targetLayerConstraint}`);
    }
    if (targetProfileKeyConstraint && normalizeSkillKey(item.targetProfileKey || "") !== targetProfileKeyConstraint) {
      throw createHttpError(`Proposal targetProfileKey must stay within ${targetProfileKeyConstraint}`);
    }
    if ((item.action === "modify_skill_item" || item.conclusionType === "modify_existing") && allowedSkillCodes.size) {
      if (!allowedSkillCodes.has(String(item.targetSkillCode || "").trim())) {
        throw createHttpError("modify_existing must target a skill from the constrained layer inventory");
      }
    }
  }
}

function collectRootCauses(records = []) {
  return [...new Set(records.map((item) => item.reasonCategory).filter(Boolean))].map(
    (category) => `多条驳回记录共同指向“${category}”相关问题。`
  );
}

function summarizeReason(records = []) {
  return records
    .map((item) => item.reasonText)
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
}

function chooseTargetRule(rules = [], targetArea = "") {
  if (!rules.length) return null;
  const targetFile = new SkillRuleService().resolveAreaTargetFile(targetArea);
  return rules.find((rule) => rule.targetFile === targetFile) || rules[0];
}

function buildPatchSentence(records = []) {
  const notes = records
    .map((item) => item.expectedNote || item.reasonText)
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
  return notes || "需要补充更明确、可验证且可追溯的约束。";
}

function normalizeReferenceAssetIds(referenceAssetIds) {
  if (Array.isArray(referenceAssetIds)) {
    return referenceAssetIds.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof referenceAssetIds === "string") {
    return referenceAssetIds
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isPreviewableAsset(asset = {}) {
  const extension = path.extname(asset.originalName || asset.storedName || "").toLowerCase();
  return [".md", ".txt", ".json", ".c", ".h", ".hpp", ".cpp", ".m", ".xml", ".yaml", ".yml"].includes(extension);
}

function truncate(value, limit = 4000) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function buildReplayStatus(taskCount = 0, taskStatus = "", hasProposal = false) {
  if (!taskCount) return "not_started";
  if (taskStatus === "queued" || taskStatus === "running") return "running";
  if (taskStatus === "failed") return "failed";
  return hasProposal ? "proposal_ready" : "replayed";
}

function extractReplayErrorMessage(error) {
  const candidates = [
    error?.cause?.message,
    error?.response?.data?.error?.message,
    error?.message
  ];
  return candidates.map((item) => String(item || "").trim()).find(Boolean) || "Replay 提案生成失败";
}

function createTimelineEntry(stage = "", label = "", message = "", level = "info") {
  return {
    stage,
    label,
    message,
    level,
    at: now()
  };
}

function createReplayProgress(stage = "queued", label = "等待处理", message = "Replay 任务已创建，等待 Hermes 处理。", percent = 4) {
  return {
    stage,
    label,
    message,
    percent
  };
}

function buildReplayStepDescriptor() {
  return {
    stage: "replay_proposal_generate",
    runningLabel: "正在调用 Hermes 生成 Skill 优化建议",
    actionLabel: "生成 Skill 优化建议",
    runningPercent: 72
  };
}

function isReplayTaskActiveStatus(status = "") {
  return status === "queued" || status === "running";
}

function hasReplayTaskProposal(task = {}) {
  return Array.isArray(task.proposals) && task.proposals.some((proposal) => Array.isArray(proposal?.items) && proposal.items.length > 0);
}

function resolveReplayTaskActivityAt(task = {}) {
  return (
    task?.debug?.agent?.lastHeartbeatAt ||
    task?.debug?.agent?.lastEventAt ||
    task?.runtimeEvents?.at?.(-1)?.at ||
    task?.updatedAt ||
    task?.createdAt ||
    ""
  );
}

export class ReplayTaskService {
  constructor(options = {}) {
    this.projectService = new ProjectService();
    this.rejectionService = new RejectionService();
    this.skillBundleService = new SkillBundleService();
    this.skillRuleService = new SkillRuleService();
    this.llmService = new LlmService();
    this.skillLoader = new SkillLoader();
    this.skillWorkOrderService = new SkillWorkOrderService();
    this.hermesAgentClient = new HermesAgentClient();
    this.replayTaskArtifactService = new ReplayArtifactService();
    this.hermesTaskQueueService = options.hermesTaskQueueService || null;
    this.activeRuns = new Map();
    this.deletedTaskIds = new Set();
    this.staleTaskGraceMs = Math.max(
      Number(config.hermes?.heartbeatIntervalMs || 0) * 3,
      15000
    );
  }

  async readTask(taskId) {
    return readJson(getTaskPath(taskId));
  }

  async listStoredTasks() {
    const names = await fs.readdir(config.replayTaskStoreDir);
    return Promise.all(
      names.filter((name) => name.endsWith(".json")).map((name) => readJson(path.join(config.replayTaskStoreDir, name)))
    );
  }

  shouldReconcileInterruptedTask(task = {}) {
    if (!task?.id || this.deletedTaskIds.has(task.id)) return false;
    if (!isReplayTaskActiveStatus(String(task.taskStatus || "").trim())) return false;
    if (this.activeRuns.has(task.id)) return false;

    const activityAt = resolveReplayTaskActivityAt(task);
    const activityMs = Date.parse(activityAt);
    if (Number.isFinite(activityMs)) {
      return Date.now() - activityMs >= this.staleTaskGraceMs;
    }

    const updatedMs = Date.parse(task.updatedAt || task.createdAt || "");
    return !Number.isFinite(updatedMs) || Date.now() - updatedMs >= this.staleTaskGraceMs;
  }

  async listReplayRecordsByIds(recordIds = []) {
    const ids = [...new Set((recordIds || []).map((item) => String(item || "").trim()).filter(Boolean))];
    const records = await Promise.all(ids.map((id) => this.rejectionService.getRecord(id)));
    return records.filter(Boolean);
  }

  async markTaskInterrupted(task = {}) {
    if (!task?.id || !this.shouldReconcileInterruptedTask(task)) {
      return task || null;
    }

    const interruptedAt = now();
    const errorMessage = "后端服务已重启或任务执行已中断，请重新发起 Replay。";
    const nextTask = {
      ...task,
      taskStatus: "failed",
      summary: "Replay 任务异常中断",
      errorMessage,
      errorStage: "service_interrupted",
      progress: createReplayProgress("failed", "Replay 任务异常中断", errorMessage, 100),
      timeline: [
        ...(task.timeline || []),
        createTimelineEntry("failed", "Replay 任务异常中断", errorMessage, "error")
      ],
      runtimeEvents: [
        ...(task.runtimeEvents || []),
        {
          at: interruptedAt,
          type: "agent_runtime",
          transport: task?.debug?.agent?.transport || this.hermesAgentClient.transport,
          stepType: task?.debug?.agent?.currentStep || task?.progress?.stage || "replay_proposal_generate",
          status: "failed",
          label: "任务执行已中断",
          message: errorMessage
        }
      ].slice(-120),
      debug: {
        ...(task.debug || {}),
        agent: {
          ...(task.debug?.agent || {}),
          status: "interrupted",
          lastEventAt: interruptedAt
        }
      },
      updatedAt: interruptedAt
    };

    await this.writeTask(nextTask);
    const records = await this.listReplayRecordsByIds(nextTask.sourceRejectionIds || []);
    await this.updateReplayRecords(records, nextTask.id, nextTask.taskStatus, nextTask.createdAt, hasReplayTaskProposal(nextTask));
    return nextTask;
  }

  async reconcileTaskState(task = {}) {
    if (!task) return null;
    return this.markTaskInterrupted(task);
  }

  async listTasks(filters = {}) {
    const tasks = await this.listStoredTasks();
    const reconciledTasks = await Promise.all(tasks.filter(Boolean).map((task) => this.reconcileTaskState(task)));

    let visible = reconciledTasks.filter(Boolean);
    if (filters.projectId) visible = visible.filter((item) => item.projectId === filters.projectId);
    if (filters.moduleId) visible = visible.filter((item) => item.moduleId === filters.moduleId);
    return visible.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getTask(taskId) {
    const task = await this.readTask(taskId);
    return this.reconcileTaskState(task);
  }

  async writeTask(task = {}) {
    await writeJson(getTaskPath(task.id), task);
    return task;
  }

  async mutateTaskIfPresent(taskId, mutate) {
    if (this.deletedTaskIds.has(taskId)) {
      return null;
    }
    try {
      return await this.mutateTask(taskId, mutate);
    } catch (error) {
      if (this.deletedTaskIds.has(taskId) || error?.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async mutateTask(taskId, mutate) {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("Replay task not found", 404);
    }
    const nextTask = (await mutate(task)) || task;
    nextTask.updatedAt = now();
    await this.writeTask(nextTask);
    return nextTask;
  }

  extractPromptPreview(materialPack = {}) {
    const messages = buildReplayModelInput(materialPack);
    return {
      systemPrompt: messages?.[0]?.content?.[0]?.text || "",
      userPrompt: messages?.[1]?.content?.[0]?.text || ""
    };
  }

  summarizeRuleIndex(ruleIndex = {}, registryIndex = {}, relevantRules = [], relevantRegistryItems = [], context = {}) {
    const rules = Array.isArray(ruleIndex?.rules) ? ruleIndex.rules : [];
    const registryItems = Array.isArray(registryIndex?.items) ? registryIndex.items : [];
    const documentType = String(context.documentType || "").trim();
    const domain = String(context.domain || "").trim();
    const moduleSkillKey = String(context.moduleSkillKey || "").trim();
    const ruleCounts = {
      total: rules.length,
      docType: rules.filter((item) => item.layer === "docType" && item.profileKey === documentType).length,
      domain: rules.filter((item) => item.layer === "domain" && item.profileKey === domain).length,
      module: rules.filter((item) => item.layer === "module" && item.profileKey === moduleSkillKey).length
    };
    const registryCounts = {
      total: registryItems.length,
      docType: registryItems.filter((item) => item.layer === "docType" && item.profileKey === documentType).length,
      domain: registryItems.filter((item) => item.layer === "domain" && item.profileKey === domain).length,
      module: registryItems.filter((item) => item.layer === "module" && item.profileKey === moduleSkillKey).length
    };
    const issues = [];
    if (registryCounts.total && ruleCounts.total !== registryCounts.total) {
      issues.push(`rule index 总量 ${ruleCounts.total} 与 active registry 总量 ${registryCounts.total} 不一致`);
    }
    if (registryCounts.docType && !ruleCounts.docType) {
      issues.push(`rule index 缺少当前 docType=${documentType} 的条目`);
    }
    if (registryCounts.domain && !ruleCounts.domain) {
      issues.push(`rule index 缺少当前 domain=${domain} 的条目`);
    }
    if (registryCounts.module && !ruleCounts.module) {
      issues.push(`rule index 缺少当前 module=${moduleSkillKey} 的条目`);
    }
    if (relevantRegistryItems.length && !relevantRules.length) {
      issues.push(`当前上下文在 active registry 中可找到 ${relevantRegistryItems.length} 条候选 skill，但 rule index 返回 0 条`);
    }
    return {
      ruleIndexVersion: ruleIndex?.ruleIndexVersion || "",
      counts: {
        ruleIndex: ruleCounts,
        registry: registryCounts,
        relevantRuleCount: relevantRules.length,
        relevantRegistryCount: relevantRegistryItems.length
      },
      relevantSkillCodes: {
        ruleIndex: relevantRules.map((item) => item.skillCode || item.ruleId).filter(Boolean),
        registry: relevantRegistryItems.map((item) => item.skillCode).filter(Boolean)
      },
      hasMismatch: issues.length > 0,
      issues
    };
  }

  async buildRuleDiagnostics(bundleId, skillDir, targetAreas = [], context = {}, ruleIndex = null) {
    const effectiveRuleIndex = ruleIndex || (await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir));
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, targetAreas, context);
    const registryIndex = await this.skillRuleService.registryService.getRegistryIndex(skillDir, { includeDeprecated: true });
    const relevantRegistryItems = await this.skillRuleService.registryService.listRelevantItems(
      {
        documentType: context.documentType || "software_requirement",
        domain: context.domain || "",
        moduleSkillKey: context.moduleSkillKey || "",
        targetAreas,
        layerConstraint: context.layerConstraint || "",
        profileKeyConstraint: context.profileKeyConstraint || "",
        limit: 200
      },
      skillDir
    );

    return this.summarizeRuleIndex(effectiveRuleIndex, registryIndex, relevantRules, relevantRegistryItems, context);
  }

  async resolveTaskContext({
    rejectionIds = [],
    groupId = "",
    targetBundleId = "",
    targetAreas = [],
    projectId = "",
    moduleId = "",
    referenceAssetIds = []
  }) {
    const group = groupId ? await this.rejectionService.getGroup(groupId) : null;
    const selectedIds = rejectionIds.length ? rejectionIds : group?.memberIds || [];
    if (!selectedIds.length) {
      throw createHttpError("Replay task requires rejectionIds or groupId");
    }

    const records = [];
    for (const rejectionId of selectedIds) {
      const record = await this.rejectionService.getRecord(rejectionId);
      if (record) records.push(record);
    }
    if (!records.length) {
      throw createHttpError("No rejection records found");
    }

    const inferredProjectId = projectId || records[0]?.projectId || group?.projectId || "";
    const inferredModuleId = moduleId || records[0]?.moduleId || group?.moduleId || "";
    if (records.some((record) => (record.projectId || inferredProjectId) !== inferredProjectId)) {
      throw createHttpError("Replay task only supports records from the same project");
    }
    if (records.some((record) => String(record.moduleId || "") !== String(inferredModuleId || ""))) {
      throw createHttpError("Replay task only supports records from the same module");
    }

    const activeBundle = targetBundleId
      ? await this.skillBundleService.getBundle(targetBundleId)
      : await this.skillBundleService.getActiveBundle();
    const bundleId = activeBundle?.id || targetBundleId || "bundle-base";
    const skillDir = await this.skillBundleService.getSkillDir(bundleId);
    const effectiveAreas = targetAreas.length ? targetAreas : [...new Set(records.map((item) => normalizeArea(item.skillContext?.targetArea)))];
    const normalizedReferenceAssetIds = normalizeReferenceAssetIds(referenceAssetIds);

    let project = null;
    let module = null;
    if (inferredProjectId) {
      project = await this.projectService.getProject(inferredProjectId);
    }
    if (inferredProjectId && inferredModuleId) {
      module = await this.projectService.getModule(inferredProjectId, inferredModuleId);
    }

    const moduleSkillKey = normalizeSkillKey(module?.moduleSkillKey || module?.name || records[0]?.moduleName || "");
    const domainKey = normalizeSkillKey(module?.domain || project?.domain || records[0]?.domain || "embedded_vcu");
    const documentType = records[0]?.documentType || "software_requirement";
    const layerConstraints = [...new Set(records.map((item) => normalizeLayerConstraint(item.skillContext?.targetLayerConstraint || item.targetLayerConstraint || "docType")).filter(Boolean))];
    if (layerConstraints.length > 1) {
      throw createHttpError("Replay task only supports rejection records with the same targetLayerConstraint");
    }
    const targetLayerConstraint = layerConstraints[0] || "docType";
    const targetProfileKeyConstraint = resolveLayerProfileKey(targetLayerConstraint, {
      documentType,
      domain: domainKey,
      moduleSkillKey,
      moduleName: module?.name || records[0]?.moduleName || ""
    });

    return {
      group,
      selectedIds,
      records,
      inferredProjectId,
      inferredModuleId,
      bundleId,
      skillDir,
      effectiveAreas,
      normalizedReferenceAssetIds,
      project,
      module,
      moduleSkillKey,
      domainKey,
      documentType,
      targetLayerConstraint,
      targetProfileKeyConstraint
    };
  }

  async buildTaskPreview(context = {}, options = {}) {
    const {
      bundleId,
      skillDir,
      effectiveAreas,
      normalizedReferenceAssetIds,
      inferredProjectId,
      inferredModuleId,
      project,
      module,
      moduleSkillKey,
      domainKey,
      documentType,
      targetLayerConstraint,
      targetProfileKeyConstraint,
      records
    } = context;
    const forceRuleIndexRefresh = Boolean(options.forceRuleIndexRefresh);
    const ruleContext = {
      documentType,
      domain: domainKey,
      moduleSkillKey,
      layerConstraint: targetLayerConstraint,
      profileKeyConstraint: targetProfileKeyConstraint
    };

    let ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir);
    const diagnosticsBefore = await this.buildRuleDiagnostics(bundleId, skillDir, effectiveAreas, ruleContext, ruleIndex);
    if (forceRuleIndexRefresh) {
      ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir, { force: true });
    }
    const diagnosticsAfter = await this.buildRuleDiagnostics(bundleId, skillDir, effectiveAreas, ruleContext, ruleIndex);

    const referenceAssets = await this.buildReferenceAssets(inferredProjectId, inferredModuleId, normalizedReferenceAssetIds);
    const layerSkillItems = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, effectiveAreas, ruleContext, {
      layerConstraint: targetLayerConstraint,
      profileKeyConstraint: targetProfileKeyConstraint
    });
    const effectiveSkills = await this.skillLoader.loadForContext(
      {
        documentType,
        domain: domainKey,
        moduleSkillKey
      },
      skillDir
    );

    const effectiveSkillSnapshot = {
      hash: createHash("sha1")
        .update(
          JSON.stringify({
            bundleId,
            ruleIndexVersion: ruleIndex.ruleIndexVersion,
            profiles: effectiveSkills.__profiles || [],
            layerSkillCodes: layerSkillItems.map((item) => item.skillCode || item.ruleId),
            writing: effectiveSkills["requirement_writing.md"] || "",
            extraction: effectiveSkills["requirement_extraction.md"] || "",
            validation: effectiveSkills["requirement_validation.md"] || "",
            knowledge: effectiveSkills["domain-knowledge.json"] || {}
          })
        )
        .digest("hex"),
      selectedProfiles: effectiveSkills.__profiles || [],
      compiledPrompt: truncate(effectiveSkills.__compiledPrompt || "", 6000),
      compiledSkillPack: effectiveSkills.__compiledSkillPack || null,
      files: {
        "requirement_extraction.md": effectiveSkills["requirement_extraction.md"] || "",
        "requirement_writing.md": effectiveSkills["requirement_writing.md"] || "",
        "requirement_validation.md": effectiveSkills["requirement_validation.md"] || "",
        "examples/good_examples.md": effectiveSkills["examples/good_examples.md"] || "",
        "examples/bad_examples.md": effectiveSkills["examples/bad_examples.md"] || "",
        "domain-knowledge.json": effectiveSkills["domain-knowledge.json"] || {}
      }
    };

    const materialPack = {
      summary: `${records.length} rejection records selected for replay`,
      targetBundleId: bundleId,
      targetAreas: effectiveAreas,
      targetLayerConstraint,
      targetProfileKeyConstraint,
      allowedKindsByArea: buildAllowedKindsByArea(),
      allowedKindsByLayer: buildAllowedKindsByLayer(),
      allowedKindsForReplay: getAllowedKindsForAreasAndLayer(effectiveAreas, targetLayerConstraint),
      layerDefinitions: buildLayerDefinitions(),
      ruleIndexVersion: ruleIndex.ruleIndexVersion,
      moduleContext: {
        projectId: inferredProjectId,
        projectName: project?.name || records[0]?.projectName || "",
        moduleId: inferredModuleId,
        moduleName: module?.name || records[0]?.moduleName || "",
        moduleSkillKey,
        domain: domainKey,
        documentType
      },
      effectiveSkillSnapshot,
      layerSkillItems: layerSkillItems.map((item) => ({
        skillCode: item.skillCode || item.ruleId,
        layer: item.layer,
        profileKey: item.profileKey,
        kind: item.kind,
        title: item.title,
        content: item.content,
        contentSummary: truncate(item.content || "", 220),
        targetAreas: [item.targetArea],
        targetFile: item.targetFile,
        whyRelevant: `${item.layer}/${item.profileKey}`
      })),
      candidateSkillItems: layerSkillItems.map((item) => ({
        skillCode: item.skillCode || item.ruleId,
        layer: item.layer,
        profileKey: item.profileKey,
        kind: item.kind,
        title: item.title,
        content: item.content,
        contentSummary: truncate(item.content || "", 220),
        targetAreas: [item.targetArea],
        targetFile: item.targetFile,
        whyRelevant: `${item.layer}/${item.profileKey}`
      })),
      referenceAssets,
      rejectionSnapshots: records.map((record) => ({
        id: record.id,
        projectId: record.projectId,
        moduleId: record.moduleId,
        documentType: record.documentType,
        requirementCode: record.requirementCode,
        reasonCategory: record.reasonCategory,
        reasonText: record.reasonText,
        expectedNote: record.expectedNote,
        targetLayerConstraint: record.skillContext?.targetLayerConstraint || record.targetLayerConstraint || targetLayerConstraint,
        targetArea: record.skillContext?.targetArea,
        outputSnapshot: record.outputSnapshot,
        sourceRefsSnapshot: record.sourceRefsSnapshot || [],
        projectEvidenceSnapshot: record.projectEvidenceSnapshot || [],
        relevantRules: record.skillContext?.relevantRules || []
      }))
    };

    return {
      ruleIndex,
      materialPack,
      promptPreview: this.extractPromptPreview(materialPack),
      ruleDiagnostics: {
        forceRuleIndexRefresh,
        refreshed: forceRuleIndexRefresh,
        before: diagnosticsBefore,
        after: diagnosticsAfter
      },
      activeSkillSummary: {
        bundleId,
        skillDir,
        targetLayerConstraint,
        targetProfileKeyConstraint,
        selectedProfiles: effectiveSkillSnapshot.selectedProfiles || [],
        layerSkillCount: materialPack.layerSkillItems.length,
        candidateSkillCount: materialPack.layerSkillItems.length,
        referenceAssetCount: materialPack.referenceAssets.length
      }
    };
  }

  async buildReferenceAssets(projectId, moduleId, referenceAssetIds = []) {
    if (!projectId || !moduleId || !referenceAssetIds.length) {
      return [];
    }

    const module = await this.projectService.getModule(projectId, moduleId);
    const selected = (module.assets || []).filter((asset) => referenceAssetIds.includes(asset.id));
    const assets = [];
    for (const asset of selected) {
      let preview = "";
      const assetPath = resolveStoredFilePath(asset, { baseDir: config.uploadDir });
      if (assetPath && isPreviewableAsset(asset)) {
        try {
          preview = truncate(await fs.readFile(assetPath, "utf8"));
        } catch (_error) {
          preview = "";
        }
      }

      assets.push({
        id: asset.id,
        originalName: asset.originalName,
        role: asset.role,
        mimeType: asset.mimeType,
        uploadedAt: asset.uploadedAt,
        preview
      });
    }
    return assets;
  }

  createQueuedTask({
    taskId,
    inferredProjectId,
    inferredModuleId,
    project,
    module,
    selectedIds,
    group,
    bundleId,
    llmProfileId,
    normalizedReferenceAssetIds,
    materialPack,
    summary = "Replay 任务已创建"
  }) {
    const createdAt = now();
    return {
      id: taskId,
      projectId: inferredProjectId,
      projectName: project?.name || "",
      moduleId: inferredModuleId,
      moduleName: module?.name || "",
      sourceRejectionIds: selectedIds,
      groupIds: group ? [group.id] : [],
      targetBundleId: bundleId,
      llmProfileId,
      referenceAssetIds: normalizedReferenceAssetIds,
      taskStatus: "queued",
      materialPack,
      proposalIds: [],
      proposals: [],
      summary,
      decisionSummary: "",
      validatorSuggestions: [],
      applyResult: null,
      progress: createReplayProgress(),
      timeline: [createTimelineEntry("queued", "任务已创建", "Replay 任务已创建，等待 Hermes 处理。")],
      runtimeEvents: [],
      debug: {
        agent: {
          transport: this.hermesAgentClient.transport,
          status: "queued",
          currentStep: "",
          startedAt: "",
          lastEventAt: "",
          lastHeartbeatAt: "",
          elapsedMs: 0,
          sessionId: "",
          tokenUsage: null,
          stdoutExcerpt: "",
          stderrExcerpt: ""
        },
        artifacts: {}
      },
      errorMessage: "",
      errorStage: "",
      createdAt,
      updatedAt: createdAt
    };
  }

  async updateReplayRecords(records = [], taskId = "", taskStatus = "", createdAt = "", hasProposal = false) {
    for (const record of records) {
      const replayTaskIds = [...new Set([...(record.replayTaskIds || []), taskId])];
      await this.rejectionService.updateRecord(record.id, {
        replayStatus: buildReplayStatus(replayTaskIds.length, taskStatus, hasProposal),
        replayCount: replayTaskIds.length,
        replayTaskIds,
        lastReplayAt: createdAt || now()
      });
    }
    await this.rejectionService.rebuildGroups();
  }

  async refreshReplayRecordsAfterDeletion(task = {}) {
    const recordIds = [...new Set((task.sourceRejectionIds || []).map((item) => String(item || "").trim()).filter(Boolean))];
    for (const recordId of recordIds) {
      const record = await this.rejectionService.getRecord(recordId);
      if (!record) continue;

      const remainingTaskIds = [...new Set((record.replayTaskIds || []).filter((item) => item && item !== task.id && !this.deletedTaskIds.has(item)))];
      const remainingTasks = (
        await Promise.all(remainingTaskIds.map((taskId) => this.readTask(taskId)))
      ).filter(Boolean);

      remainingTasks.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      const latestTask = remainingTasks[0] || null;

      await this.rejectionService.updateRecord(recordId, {
        replayStatus: latestTask
          ? buildReplayStatus(remainingTasks.length, latestTask.taskStatus, hasReplayTaskProposal(latestTask))
          : "not_started",
        replayCount: remainingTasks.length,
        replayTaskIds: remainingTasks.map((item) => item.id),
        lastReplayAt: latestTask ? (latestTask.updatedAt || latestTask.createdAt || "") : ""
      });
    }
    await this.rejectionService.rebuildGroups();
  }

  async deleteTask(taskId) {
    const task = await this.readTask(taskId);
    if (!task) {
      throw createHttpError("Replay task not found", 404);
    }

    this.deletedTaskIds.add(taskId);
    this.activeRuns.delete(taskId);

    const artifactDir = task?.debug?.artifacts?.replayContextDir || path.join(config.replayTaskArtifactDir, taskId);
    await Promise.all([
      fs.rm(getTaskPath(taskId), { force: true }),
      fs.rm(artifactDir, { recursive: true, force: true })
    ]);
    await this.refreshReplayRecordsAfterDeletion(task);

    return {
      deleted: true,
      id: taskId
    };
  }

  async startHermesReplayTask(taskId, context = {}) {
    const {
      records = [],
      bundleId = "",
      targetAreas = [],
      materialPack = {},
      llmProfileId = ""
    } = context;
    const descriptor = buildReplayStepDescriptor();

    try {
      const artifact = await this.replayTaskArtifactService.buildReplayTaskArtifact({
        outputDir: path.join(config.replayTaskArtifactDir, taskId),
        task: {
          id: taskId,
          projectId: materialPack.moduleContext?.projectId || "",
          projectName: materialPack.moduleContext?.projectName || "",
          moduleId: materialPack.moduleContext?.moduleId || "",
          moduleName: materialPack.moduleContext?.moduleName || ""
        },
        materialPack
      });

      if (this.deletedTaskIds.has(taskId)) {
        return null;
      }

      await this.mutateTaskIfPresent(taskId, (task) => {
        task.taskStatus = "running";
        task.summary = "Replay 正在生成 Skill 优化建议";
        task.progress = createReplayProgress(
          descriptor.stage,
          descriptor.runningLabel,
          "Replay 上下文文件已准备，正在调用 Hermes 生成提案。",
          20
        );
        task.timeline = [...(task.timeline || []), createTimelineEntry("artifact_prepare", "上下文文件已准备", "已生成 replay artifact 目录与 manifest。")];
        task.debug = task.debug || {};
        task.debug.artifacts = {
          ...(task.debug.artifacts || {}),
          replayContextDir: artifact.outputDir,
          manifestPath: artifact.manifestPath,
          taskBriefPath: artifact.taskBriefPath,
          rejectionsPath: artifact.rejectionsPath,
          effectiveSkillManifestPath: artifact.effectiveSkillManifestPath,
          layerSkillInventoryPath: artifact.layerSkillInventoryPath,
          referenceAssetFiles: artifact.referenceAssets || [],
          writtenFiles: artifact.writtenFiles || []
        };
        return task;
      });

      const response = await this.hermesAgentClient.executeStep(
        {
          taskId,
          stepType: "replay_proposal_generate",
          allowedPaths: [artifact.outputDir],
          inputArtifact: {
            replayContext: {
              directory: artifact.outputDir,
              manifestFileName: path.basename(artifact.manifestPath || "manifest.json"),
              taskBriefFileName: path.basename(artifact.taskBriefPath || "task-brief.md"),
              manifestPath: artifact.manifestPath,
              taskBriefPath: artifact.taskBriefPath
            },
            replayManifest: artifact.manifest || null,
            files: {
              rejectionsPath: artifact.rejectionsPath,
              effectiveSkillManifestPath: artifact.effectiveSkillManifestPath,
              layerSkillInventoryPath: artifact.layerSkillInventoryPath,
              referenceAssetFiles: artifact.referenceAssets || []
            }
          },
          llmProfileSnapshot: {
            id: llmProfileId || "",
            executionMode: this.hermesAgentClient.transport === "cli" ? "hermes_agent_cli" : "hermes_agent_api",
            provider: this.hermesAgentClient.transport === "cli" ? "hermes_cli" : "hermes_api",
            agentEndpoint: this.hermesAgentClient.transport === "cli" ? this.hermesAgentClient.command : this.hermesAgentClient.baseURL
          }
        },
        {
          onEvent: async (event = {}) => {
            if (this.deletedTaskIds.has(taskId)) {
              return null;
            }
            await this.mutateTaskIfPresent(taskId, (task) => {
              const status = String(event.status || "").trim() || "running";
              task.runtimeEvents = [...(task.runtimeEvents || []), { at: event.at || now(), ...event }].slice(-120);
              task.debug = task.debug || {};
              task.debug.agent = {
                ...(task.debug.agent || {}),
                transport: event.transport || this.hermesAgentClient.transport,
                status,
                currentStep: event.stepType || descriptor.stage,
                startedAt: event.startedAt || task.debug?.agent?.startedAt || "",
                lastEventAt: event.at || now(),
                lastHeartbeatAt: event.heartbeatAt || task.debug?.agent?.lastHeartbeatAt || "",
                elapsedMs: Number(event.elapsedMs || 0) || 0,
                sessionId: event.sessionId || task.debug?.agent?.sessionId || "",
                tokenUsage: event.tokenUsage || task.debug?.agent?.tokenUsage || null,
                stdoutExcerpt: event.stdoutExcerpt || task.debug?.agent?.stdoutExcerpt || "",
                stderrExcerpt: event.stderrExcerpt || task.debug?.agent?.stderrExcerpt || ""
              };
              if (status === "started" || status === "heartbeat") {
                task.progress = createReplayProgress(
                  descriptor.stage,
                  descriptor.runningLabel,
                  event.message || "Hermes 正在生成 Replay 提案。",
                  descriptor.runningPercent
                );
              }
              if (status === "failed") {
                task.errorMessage = event.message || "Replay 提案生成失败";
                task.errorStage = descriptor.stage;
              }
              return task;
            });
          }
        }
      );

      if (this.deletedTaskIds.has(taskId)) {
        return null;
      }

      const { proposal, replayAnalysis } = await this.buildProposalFromGenerated({
        records,
        bundleId,
        targetAreas,
        materialPack,
        generated: response?.artifact || {}
      });

      if (this.deletedTaskIds.has(taskId)) {
        return null;
      }

      const finalized = await this.mutateTaskIfPresent(taskId, (task) => {
        task.taskStatus = "done";
        task.summary = proposal.summary;
        task.proposalIds = [proposal.id];
        task.proposals = [proposal];
        task.decisionSummary = proposal.decisionSummary || replayAnalysis?.decisionSummary || "";
        task.validatorSuggestions = proposal.validatorSuggestions || replayAnalysis?.validatorSuggestions || [];
        if (replayAnalysis?.runtime || response?.artifact?.runtime) {
          task.runtime = replayAnalysis?.runtime || response?.artifact?.runtime || null;
        }
        if (replayAnalysis?.artifacts || response?.artifact?.artifacts) {
          task.artifacts = replayAnalysis?.artifacts || response?.artifact?.artifacts || null;
        }
        task.progress = createReplayProgress("done", "Replay 提案已生成", "Hermes 已完成 Skill 优化建议生成。", 100);
        task.timeline = [...(task.timeline || []), createTimelineEntry("done", "Replay 提案已生成", "Hermes 已返回可审核的 Replay 提案。")];
        return task;
      });
      if (!finalized || this.deletedTaskIds.has(taskId)) {
        return null;
      }

      const workOrder = await this.skillWorkOrderService.createFromReplayTask(finalized, replayAnalysis || proposal || {});
      const completedTask = await this.mutateTaskIfPresent(taskId, (task) => {
        task.workOrderId = workOrder.id;
        task.workOrderSummary = {
          id: workOrder.id,
          status: workOrder.status,
          itemStats: workOrder.itemStats,
          decisionSummary: workOrder.decisionSummary
        };
        return task;
      });
      if (!completedTask || this.deletedTaskIds.has(taskId)) {
        return null;
      }

      const proposalReady = (proposal.items || []).length > 0;
      await this.updateReplayRecords(records, taskId, completedTask.taskStatus, completedTask.createdAt, proposalReady);
      return completedTask;
    } catch (error) {
      if (this.deletedTaskIds.has(taskId)) {
        return null;
      }
      const failedTask = await this.mutateTaskIfPresent(taskId, (task) => {
        task.taskStatus = "failed";
        task.summary = "Replay 提案生成失败";
        task.errorMessage = extractReplayErrorMessage(error);
        task.errorStage = error?.debugStage || error?.code || "replay_proposal_generation";
        task.progress = createReplayProgress("failed", "Replay 任务失败", task.errorMessage, 100);
        task.timeline = [...(task.timeline || []), createTimelineEntry("failed", "Replay 任务失败", task.errorMessage, "error")];
        return task;
      });
      if (failedTask) {
        await this.updateReplayRecords(records, taskId, failedTask.taskStatus, failedTask.createdAt, false);
      }
      return failedTask;
    } finally {
      this.activeRuns.delete(taskId);
    }
  }

  async createTask({
    rejectionIds = [],
    groupId = "",
    targetBundleId = "",
    targetAreas = [],
    llmProfileId = "",
    projectId = "",
    moduleId = "",
    referenceAssetIds = [],
    forceRuleIndexRefresh = false,
    asyncExecution = false
  }) {
    const context = await this.resolveTaskContext({
      rejectionIds,
      groupId,
      targetBundleId,
      targetAreas,
      projectId,
      moduleId,
      referenceAssetIds
    });
    const {
      group,
      selectedIds,
      records,
      inferredProjectId,
      inferredModuleId,
      bundleId,
      effectiveAreas,
      normalizedReferenceAssetIds,
      project,
      module,
      materialPack
    } = {
      ...context,
      ...(await this.buildTaskPreview(context, { forceRuleIndexRefresh }))
    };

    const taskId = randomUUID();
    if (asyncExecution) {
      const queuedTask = this.createQueuedTask({
        taskId,
        inferredProjectId,
        inferredModuleId,
        project,
        module,
        selectedIds,
        group,
        bundleId,
        llmProfileId,
        normalizedReferenceAssetIds,
        materialPack,
        summary: "Replay 任务已排队"
      });
      await this.writeTask(queuedTask);
      await this.updateReplayRecords(records, taskId, queuedTask.taskStatus, queuedTask.createdAt, false);
      const startReplay = () => this.startHermesReplayTask(taskId, {
        records,
        bundleId,
        targetAreas: effectiveAreas,
        materialPack,
        llmProfileId
      }).catch(() => null);
      const runPromise = this.hermesTaskQueueService
        ? this.hermesTaskQueueService.enqueue({
            id: taskId,
            type: "replay",
            title: "Replay / Fallback",
            projectId: inferredProjectId,
            moduleId: inferredModuleId,
            documentType: materialPack.moduleContext?.documentType || "software_requirement",
            run: startReplay
          })
        : startReplay();
      this.activeRuns.set(taskId, runPromise);
      return queuedTask;
    }

    let proposal = null;
    let replayAnalysis = null;
    const createdAt = now();
    try {
      ({ proposal, replayAnalysis } = await this.buildProposal({
        records,
        bundleId,
        targetAreas: effectiveAreas,
        materialPack,
        llmProfileId
      }));
    } catch (error) {
      const failedTask = {
        id: taskId,
        projectId: inferredProjectId,
        projectName: project?.name || records[0]?.projectName || "",
        moduleId: inferredModuleId,
        moduleName: module?.name || records[0]?.moduleName || "",
        sourceRejectionIds: selectedIds,
        groupIds: group ? [group.id] : [],
        targetBundleId: bundleId,
        llmProfileId,
        referenceAssetIds: normalizedReferenceAssetIds,
        taskStatus: "failed",
        materialPack,
        proposalIds: [],
        proposals: [],
        summary: llmProfileId ? "Replay 提案生成失败" : "Fallback 提案生成失败",
        decisionSummary: "",
        validatorSuggestions: [],
        applyResult: null,
        errorMessage: extractReplayErrorMessage(error),
        errorStage: error?.debugStage || "replay_proposal_generation",
        createdAt,
        updatedAt: createdAt
      };

      await writeJson(getTaskPath(failedTask.id), failedTask);
      await this.updateReplayRecords(records, failedTask.id, failedTask.taskStatus, failedTask.createdAt, false);
      return failedTask;
    }

    const task = {
      id: taskId,
      projectId: inferredProjectId,
      projectName: project?.name || records[0]?.projectName || "",
      moduleId: inferredModuleId,
      moduleName: module?.name || records[0]?.moduleName || "",
      sourceRejectionIds: selectedIds,
      groupIds: group ? [group.id] : [],
      targetBundleId: bundleId,
      llmProfileId,
      referenceAssetIds: normalizedReferenceAssetIds,
      taskStatus: "done",
      materialPack,
      proposalIds: [proposal.id],
      proposals: [proposal],
      summary: proposal.summary,
      decisionSummary: proposal.decisionSummary || replayAnalysis?.decisionSummary || "",
      validatorSuggestions: proposal.validatorSuggestions || replayAnalysis?.validatorSuggestions || [],
      runtime: replayAnalysis?.runtime || proposal.runtime || null,
      artifacts: replayAnalysis?.artifacts || proposal.artifacts || null,
      applyResult: null,
      createdAt,
      updatedAt: createdAt
    };

    await writeJson(getTaskPath(task.id), task);
    const workOrder = await this.skillWorkOrderService.createFromReplayTask(task, replayAnalysis || proposal || {});
    task.workOrderId = workOrder.id;
    task.workOrderSummary = {
      id: workOrder.id,
      status: workOrder.status,
      itemStats: workOrder.itemStats,
      decisionSummary: workOrder.decisionSummary
    };
    task.updatedAt = now();
    await writeJson(getTaskPath(task.id), task);
    const proposalReady = (proposal.items || []).length > 0;
    await this.updateReplayRecords(records, task.id, task.taskStatus, task.createdAt, proposalReady);
    return task;
  }

  async buildProposal({ records, bundleId, targetAreas = [], materialPack = {}, llmProfileId = "" }) {
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, targetAreas, {
      documentType: materialPack.moduleContext?.documentType || "software_requirement",
      domain: materialPack.moduleContext?.domain || "",
      moduleSkillKey: materialPack.moduleContext?.moduleSkillKey || "",
      layerConstraint: materialPack.targetLayerConstraint || "",
      profileKeyConstraint: materialPack.targetProfileKeyConstraint || ""
    }, {
      layerConstraint: materialPack.targetLayerConstraint || "",
      profileKeyConstraint: materialPack.targetProfileKeyConstraint || ""
    });
    const grouped = new Map();
    for (const record of records) {
      const area = normalizeArea(record.skillContext?.targetArea);
      if (!grouped.has(area)) grouped.set(area, []);
      grouped.get(area).push(record);
    }

    const generated = await this.llmService.generateReplayProposal(materialPack, { llmProfileId });
    const proposal = {
      id: randomUUID(),
      replayTaskId: "",
      summary: generated.summary || `已基于 ${records.length} 条驳回记录生成 ${grouped.size} 组回投提议。`,
      rootCauses: generated.rootCauses?.length ? generated.rootCauses : collectRootCauses(records),
      decisionSummary: generated.decisionSummary || "",
      validatorSuggestions: Array.isArray(generated.validatorSuggestions) ? generated.validatorSuggestions : [],
      status: "proposal_review",
      items: []
    };

    const normalizedItems = Array.isArray(generated.items) ? generated.items : [];
    if (normalizedItems.length) {
      validateProposalTargets(normalizedItems, targetAreas, {
        targetLayerConstraint: materialPack.targetLayerConstraint || "",
        targetProfileKeyConstraint: materialPack.targetProfileKeyConstraint || "",
        allowedSkillCodes: (materialPack.layerSkillItems || materialPack.candidateSkillItems || []).map((item) => item.skillCode || item.ruleId)
      });
      for (const item of normalizedItems) {
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: item.action,
          targetSkillCode: item.targetSkillCode,
          targetLayer: item.targetLayer,
          targetProfileKey: item.targetProfileKey,
          kind: item.kind,
          targetKind: item.targetKind || item.kind,
          targetFile: item.targetFile,
          scopeDecision: item.scopeDecision || "",
          scopeReason: item.scopeReason || "",
          scopeConfidence: Number(item.scopeConfidence ?? 0) || 0,
          abstractionScore: Number(item.abstractionScore ?? 0) || 0,
          isParaphraseOfRejection: Boolean(item.isParaphraseOfRejection),
          reviewReadiness: item.reviewReadiness || "",
          reuseJudgement: item.reuseJudgement || "",
          ruleIntent: item.ruleIntent || "",
          recommendedSkillText: item.recommendedSkillText || "",
          targetInsertionHint: item.targetInsertionHint || "",
          newRuleDraft: item.newRuleDraft || null,
          before: item.before || "",
          after: item.after || "",
          title: item.title,
          rationale: item.rationale,
          evidenceRefs: item.evidenceRefs || [],
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      }
      return { proposal, replayAnalysis: generated };
    }

    for (const [targetArea, areaRecords] of grouped.entries()) {
      const targetFile = this.skillRuleService.resolveAreaTargetFile(targetArea);
      const targetRule =
        chooseTargetRule(relevantRules.filter((rule) => rule.targetFile === targetFile), targetArea) ||
        chooseTargetRule(relevantRules, targetArea);
      const rationale = summarizeReason(areaRecords);
      const evidenceRefs = areaRecords.map((item) => item.id);
      const patchSentence = buildPatchSentence(areaRecords);

      if (targetRule && targetArea !== "examples") {
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: "modify_skill_item",
          targetSkillCode: targetRule.skillCode || targetRule.ruleId,
          targetLayer: targetRule.layer,
          targetProfileKey: targetRule.profileKey,
          kind: targetRule.kind,
          targetFile,
          newRuleDraft: null,
          before: targetRule.content,
          after: `${targetRule.content.trim()}\n补充约束：${patchSentence}`,
          title: `${targetRule.title}（补充修订）`,
          rationale,
          evidenceRefs,
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      } else {
        const title = `${areaRecords[0]?.reasonCategory || "反馈"}补充规则`;
        const content = `建议补充以下约束：${patchSentence}`;
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: "add_skill_item",
          targetSkillCode: "",
          targetLayer: materialPack.targetLayerConstraint || (targetArea === "examples" ? "module" : "docType"),
          targetProfileKey: materialPack.targetProfileKeyConstraint || materialPack.moduleContext?.documentType || "software_requirement",
          kind:
            targetArea === "examples"
              ? "bad_example"
              : targetArea === "writing"
                ? "writing_rule"
                : targetArea === "extraction"
                  ? "extraction_rule"
                  : "validation_rule",
          targetFile,
          newRuleDraft: {
            title,
            content,
            structuredPayload: null,
            rules: []
          },
          before: "",
          after: content,
          title,
          rationale,
          evidenceRefs,
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      }
    }

    return { proposal, replayAnalysis: generated };
  }

  async buildProposalFromGenerated({ records, bundleId, targetAreas = [], materialPack = {}, generated = {} }) {
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, targetAreas, {
      documentType: materialPack.moduleContext?.documentType || "software_requirement",
      domain: materialPack.moduleContext?.domain || "",
      moduleSkillKey: materialPack.moduleContext?.moduleSkillKey || "",
      layerConstraint: materialPack.targetLayerConstraint || "",
      profileKeyConstraint: materialPack.targetProfileKeyConstraint || ""
    }, {
      layerConstraint: materialPack.targetLayerConstraint || "",
      profileKeyConstraint: materialPack.targetProfileKeyConstraint || ""
    });
    const grouped = new Map();
    for (const record of records) {
      const area = normalizeArea(record.skillContext?.targetArea);
      if (!grouped.has(area)) grouped.set(area, []);
      grouped.get(area).push(record);
    }

    const proposal = {
      id: randomUUID(),
      replayTaskId: "",
      summary: generated.summary || `已基于 ${records.length} 条驳回记录生成 ${grouped.size} 组回投提议。`,
      rootCauses: generated.rootCauses?.length ? generated.rootCauses : collectRootCauses(records),
      decisionSummary: generated.decisionSummary || "",
      validatorSuggestions: Array.isArray(generated.validatorSuggestions) ? generated.validatorSuggestions : [],
      status: "proposal_review",
      items: []
    };

    const normalizedItems = Array.isArray(generated.items) ? generated.items : [];
    if (normalizedItems.length) {
      validateProposalTargets(normalizedItems, targetAreas, {
        targetLayerConstraint: materialPack.targetLayerConstraint || "",
        targetProfileKeyConstraint: materialPack.targetProfileKeyConstraint || "",
        allowedSkillCodes: (materialPack.layerSkillItems || materialPack.candidateSkillItems || []).map((item) => item.skillCode || item.ruleId)
      });
      for (const item of normalizedItems) {
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: item.action,
          targetSkillCode: item.targetSkillCode,
          targetLayer: item.targetLayer,
          targetProfileKey: item.targetProfileKey,
          kind: item.kind,
          targetKind: item.targetKind || item.kind,
          targetFile: item.targetFile,
          scopeDecision: item.scopeDecision || "",
          scopeReason: item.scopeReason || "",
          scopeConfidence: Number(item.scopeConfidence ?? 0) || 0,
          abstractionScore: Number(item.abstractionScore ?? 0) || 0,
          isParaphraseOfRejection: Boolean(item.isParaphraseOfRejection),
          reviewReadiness: item.reviewReadiness || "",
          reuseJudgement: item.reuseJudgement || "",
          ruleIntent: item.ruleIntent || "",
          recommendedSkillText: item.recommendedSkillText || "",
          targetInsertionHint: item.targetInsertionHint || "",
          newRuleDraft: item.newRuleDraft || null,
          before: item.before || "",
          after: item.after || "",
          title: item.title,
          rationale: item.rationale,
          evidenceRefs: item.evidenceRefs || [],
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      }
      return { proposal, replayAnalysis: generated };
    }

    for (const [targetArea, areaRecords] of grouped.entries()) {
      const targetFile = this.skillRuleService.resolveAreaTargetFile(targetArea);
      const targetRule =
        chooseTargetRule(relevantRules.filter((rule) => rule.targetFile === targetFile), targetArea) ||
        chooseTargetRule(relevantRules, targetArea);
      const rationale = summarizeReason(areaRecords);
      const evidenceRefs = areaRecords.map((item) => item.id);
      const patchSentence = buildPatchSentence(areaRecords);

      if (targetRule && targetArea !== "examples") {
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: "modify_skill_item",
          targetSkillCode: targetRule.skillCode || targetRule.ruleId,
          targetLayer: targetRule.layer,
          targetProfileKey: targetRule.profileKey,
          kind: targetRule.kind,
          targetFile,
          newRuleDraft: null,
          before: targetRule.content,
          after: `${targetRule.content.trim()}\n补充约束：${patchSentence}`,
          title: `${targetRule.title}（补充修订）`,
          rationale,
          evidenceRefs,
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      } else {
        const title = `${areaRecords[0]?.reasonCategory || "反馈"}补充规则`;
        const content = `建议补充以下约束：${patchSentence}`;
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: "add_skill_item",
          targetSkillCode: "",
          targetLayer: materialPack.targetLayerConstraint || (targetArea === "examples" ? "module" : "docType"),
          targetProfileKey: materialPack.targetProfileKeyConstraint || materialPack.moduleContext?.documentType || "software_requirement",
          kind:
            targetArea === "examples"
              ? "bad_example"
              : targetArea === "writing"
                ? "writing_rule"
                : targetArea === "extraction"
                  ? "extraction_rule"
                  : "validation_rule",
          targetFile,
          newRuleDraft: {
            title,
            content,
            structuredPayload: null,
            rules: []
          },
          before: "",
          after: content,
          title,
          rationale,
          evidenceRefs,
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      }
    }

    return { proposal, replayAnalysis: generated };
  }

  async reviewProposalItem(taskId, proposalItemId, payload = {}) {
    const task = await this.getTask(taskId);
    if (!task) throw createHttpError("Replay task not found", 404);
    const item = (task.proposals || []).flatMap((proposal) => proposal.items || []).find((entry) => entry.proposalItemId === proposalItemId);
    if (!item) throw createHttpError("Proposal item not found", 404);

    item.status = payload.status || item.status;
    if (payload.editedPayload) {
      item.editedPayload = payload.editedPayload;
    } else if (typeof payload.after === "string" || typeof payload.title === "string") {
      item.editedPayload = {
        ...item,
        ...payload
      };
    }
    const validationCandidate = { ...item, ...(item.editedPayload || {}) };
    validateProposalTargets([validationCandidate], task.materialPack?.targetAreas || [], {
      targetLayerConstraint: task.materialPack?.targetLayerConstraint || "",
      targetProfileKeyConstraint: task.materialPack?.targetProfileKeyConstraint || "",
      allowedSkillCodes: (task.materialPack?.layerSkillItems || task.materialPack?.candidateSkillItems || []).map(
        (entry) => entry.skillCode || entry.ruleId
      )
    });
    item.updatedAt = now();
    task.updatedAt = now();
    await writeJson(getTaskPath(taskId), task);
    return item;
  }

  async applyTask(taskId) {
    const task = await this.getTask(taskId);
    if (!task) throw createHttpError("Replay task not found", 404);
    const activeBundle = (await this.skillBundleService.getBundle(task.targetBundleId)) || (await this.skillBundleService.getActiveBundle());
    const acceptedItems = (task.proposals || [])
      .flatMap((proposal) => proposal.items || [])
      .filter((item) => item.status === "accepted" || item.status === "edited")
      .map((item) => ({ ...item, ...(item.editedPayload || {}) }));

    if (!acceptedItems.length) {
      throw createHttpError("No accepted proposal items to apply");
    }
    validateProposalTargets(acceptedItems, task.materialPack?.targetAreas || [], {
      targetLayerConstraint: task.materialPack?.targetLayerConstraint || "",
      targetProfileKeyConstraint: task.materialPack?.targetProfileKeyConstraint || "",
      allowedSkillCodes: (task.materialPack?.layerSkillItems || task.materialPack?.candidateSkillItems || []).map(
        (item) => item.skillCode || item.ruleId
      )
    });

    const candidateBundle = await this.skillBundleService.createCandidateBundle({
      baseBundleId: activeBundle?.id || task.targetBundleId,
      proposalItems: acceptedItems,
      replayTaskId: task.id,
      createdFromCaseIds: []
    });

    task.applyResult = {
      candidateBundleId: candidateBundle.id,
      appliedProposalItemIds: acceptedItems.map((item) => item.proposalItemId),
      appliedAt: now()
    };
    task.updatedAt = now();
    await writeJson(getTaskPath(taskId), task);
    return {
      task,
      candidateBundle
    };
  }
}
