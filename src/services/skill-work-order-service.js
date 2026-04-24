import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { SkillManagementService } from "./skill-management-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { isKindAllowedForLayer } from "../../public/skill-kind-matrix.js";

function now() {
  return new Date().toISOString();
}

function createManagedError(message, statusCode = 400, code = "skill_work_order_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeDocumentType(value = "") {
  return String(value || "software_requirement").trim() || "software_requirement";
}

function getReplayTaskPath(taskId) {
  return path.join(config.replayTaskStoreDir, `${taskId}.json`);
}

function getWorkOrderPath(workOrderId) {
  return path.join(config.skillWorkOrderStoreDir, `${workOrderId}.json`);
}

function buildWorkOrderTitle(task = {}) {
  return `${task.moduleName || "未指定模块"} / ${task.materialPack?.moduleContext?.documentType || "software_requirement"} / fallback 技能修改工单`;
}

function normalizeItemReviewStatus(value = "") {
  if (["pending", "accepted", "edited", "rejected", "applied", "staged"].includes(String(value || "").trim())) {
    return String(value || "").trim();
  }
  return "pending";
}

function computeItemStats(items = [], validatorSuggestions = []) {
  const stats = {
    total: items.length,
    modifyExisting: items.filter((item) => item.conclusionType === "modify_existing").length,
    createNew: items.filter((item) => item.conclusionType === "create_new").length,
    validatorOnly: Array.isArray(validatorSuggestions) ? validatorSuggestions.length : 0,
    accepted: items.filter((item) => item.reviewStatus === "accepted" || item.reviewStatus === "edited").length,
    rejected: items.filter((item) => item.reviewStatus === "rejected").length,
    applied: items.filter((item) => item.reviewStatus === "applied" || item.reviewStatus === "staged").length
  };
  return stats;
}

function computeWorkOrderStatus(items = []) {
  if (!items.length) return "pending_review";
  const allPending = items.every((item) => item.reviewStatus === "pending");
  if (allPending) return "pending_review";
  const appliedItems = items.filter((item) => item.reviewStatus === "applied" || item.reviewStatus === "staged");
  const allResolved = items.every((item) => item.reviewStatus === "rejected" || item.reviewStatus === "applied" || item.reviewStatus === "staged");
  if (allResolved && appliedItems.length === items.length) return "applied";
  if (allResolved && appliedItems.length > 0) return "partially_applied";
  if (allResolved) return "partially_reviewed";
  if (appliedItems.length > 0) return "partially_applied";
  if (items.some((item) => item.reviewStatus === "accepted" || item.reviewStatus === "edited" || item.reviewStatus === "rejected")) {
    return "partially_reviewed";
  }
  return "pending_review";
}

function summarizeSkillSnapshot(materialPack = {}) {
  const snapshot = materialPack.effectiveSkillSnapshot || {};
  return {
    bundleId: materialPack.targetBundleId || "",
    ruleIndexVersion: materialPack.ruleIndexVersion || "",
    hash: snapshot.hash || "",
    selectedProfiles: snapshot.selectedProfiles || [],
    compiledPrompt: snapshot.compiledPrompt || "",
    compiledSkillPack: snapshot.compiledSkillPack || null,
    files: snapshot.files || {},
    candidateSkillItems: materialPack.candidateSkillItems || []
  };
}

function buildSourceTaskSummary(task = {}) {
  return {
    id: task.id,
    summary: task.summary || "",
    moduleId: task.moduleId || "",
    moduleName: task.moduleName || "",
    projectId: task.projectId || "",
    projectName: task.projectName || "",
    documentType: task.materialPack?.moduleContext?.documentType || "",
    llmProfileId: task.llmProfileId || "",
    skillVersion: cloneJson(task.skillVersion || task.materialPack?.skillVersion || null),
    createdAt: task.createdAt || "",
    updatedAt: task.updatedAt || "",
    sourceRejectionIds: task.sourceRejectionIds || []
  };
}

function buildEvidenceRefs(item = {}, task = {}) {
  const refs = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
  return refs.map((refId) => {
    const record = (task.materialPack?.rejectionSnapshots || []).find((entry) => entry.id === refId);
    return {
      type: "rejection",
      refId,
      requirementCode: record?.requirementCode || "",
      reasonCategory: record?.reasonCategory || "",
      reasonText: record?.reasonText || "",
      expectedNote: record?.expectedNote || "",
      outputSnapshot: cloneJson(record?.outputSnapshot || null),
      sourceRefsSnapshot: cloneJson(record?.sourceRefsSnapshot || []),
      projectEvidenceSnapshot: cloneJson(record?.projectEvidenceSnapshot || [])
    };
  });
}

function collectRawWorkOrderItems(task = {}, generated = {}) {
  if (Array.isArray(generated.items) && generated.items.length) {
    return generated.items;
  }
  return Array.isArray(task.proposals)
    ? task.proposals.flatMap((proposal) => proposal.items || [])
    : [];
}

function isActionableWorkOrderItem(rawItem = {}) {
  const action = String(rawItem.action || "").trim();
  const conclusionType =
    rawItem.conclusionType === "create_new" || action === "add_skill_item" ? "create_new" : "modify_existing";
  const targetSkillCode = String(rawItem.targetSkillCode || "").trim();
  return conclusionType === "create_new" || Boolean(targetSkillCode);
}

function normalizeValidatorSuggestion(rawSuggestion = {}) {
  return {
    title: String(rawSuggestion.title || "").trim(),
    ruleText: String(rawSuggestion.ruleText || "").trim(),
    why: String(rawSuggestion.why || "").trim()
  };
}

function collectValidatorSuggestions(rawSuggestions = []) {
  return Array.isArray(rawSuggestions)
    ? rawSuggestions
        .map((entry) => normalizeValidatorSuggestion(entry))
        .filter((entry) => entry.title || entry.ruleText || entry.why)
    : [];
}

function hasActionableReviewPayload(items = [], validatorSuggestions = []) {
  return items.some((item) => isActionableWorkOrderItem(item)) || collectValidatorSuggestions(validatorSuggestions).length > 0;
}

function buildChangeSummary(rawItem = {}, conclusionType = "") {
  const explicit = String(rawItem.changeSummary || "").trim();
  if (explicit) return explicit;
  const title = String(rawItem.title || rawItem.newRuleDraft?.title || "").trim();
  if (title) return title;
  const whyChange = String(rawItem.whyChange || "").trim();
  if (whyChange) return whyChange;
  const fallbackReason = String(rawItem.fallbackReason || rawItem.rationale || "").trim();
  if (fallbackReason) {
    return conclusionType === "create_new"
      ? `新增技能条目以处理：${fallbackReason}`
      : `修改技能条目以处理：${fallbackReason}`;
  }
  return conclusionType === "create_new" ? "新增技能条目" : "修改已有技能条目";
}

function hydrateWorkOrderCompatibility(workOrder = null) {
  if (!workOrder) return workOrder;
  workOrder.items = Array.isArray(workOrder.items)
    ? workOrder.items.map((item) => ({
        ...item,
        changeSummary: buildChangeSummary(item, item.conclusionType)
      }))
    : [];
  return workOrder;
}

function normalizeWorkOrderItem(rawItem = {}, task = {}) {
  const action = String(rawItem.action || "").trim();
  const conclusionType =
    rawItem.conclusionType === "create_new" || action === "add_skill_item" ? "create_new" : "modify_existing";
  return {
    itemId: randomUUID(),
    proposalItemId: rawItem.proposalItemId || "",
    title: String(rawItem.title || "").trim(),
    changeSummary: buildChangeSummary(rawItem, conclusionType),
    conclusionType,
    targetSkillCode: String(rawItem.targetSkillCode || "").trim(),
    targetLayer: String(rawItem.targetLayer || "").trim(),
    targetProfileKey: String(rawItem.targetProfileKey || "").trim(),
    targetKind: String(rawItem.targetKind || rawItem.kind || "").trim(),
    scopeDecision: String(rawItem.scopeDecision || "").trim(),
    scopeReason: String(rawItem.scopeReason || "").trim(),
    scopeConfidence: Number(rawItem.scopeConfidence ?? 0) || 0,
    abstractionScore: Number(rawItem.abstractionScore ?? 0) || 0,
    isParaphraseOfRejection: Boolean(rawItem.isParaphraseOfRejection),
    reviewReadiness: String(rawItem.reviewReadiness || "").trim(),
    reuseJudgement: String(rawItem.reuseJudgement || "").trim(),
    ruleIntent: String(rawItem.ruleIntent || "").trim(),
    recommendedSkillText: String(rawItem.recommendedSkillText || "").trim(),
    targetInsertionHint: String(rawItem.targetInsertionHint || "").trim(),
    fallbackReason: String(rawItem.fallbackReason || rawItem.rationale || "").trim(),
    whyCurrent: String(rawItem.whyCurrent || "").trim(),
    whyChange: String(rawItem.whyChange || "").trim(),
    beforeContent: String(rawItem.beforeContent || rawItem.before || "").trim(),
    afterContent: String(rawItem.afterContent || rawItem.after || rawItem.newRuleDraft?.content || "").trim(),
    evidenceRefs: buildEvidenceRefs(rawItem, task),
    sourceEvidenceIds: Array.isArray(rawItem.evidenceRefs) ? rawItem.evidenceRefs : [],
    reviewStatus: "pending",
    reviewComment: "",
    editedPayload: null,
    appliedChange: null,
    appliedAt: "",
    appliedBy: "",
    createdAt: now(),
    updatedAt: now()
  };
}

function buildDecisionSummary(generated = {}, items = []) {
  if (String(generated.decisionSummary || "").trim()) {
    return String(generated.decisionSummary || "").trim();
  }
  const modifyExisting = items.filter((item) => item.conclusionType === "modify_existing").length;
  const createNew = items.filter((item) => item.conclusionType === "create_new").length;
  if (modifyExisting || createNew) {
    return `命中已有 atomic skill ${modifyExisting} 条，建议新增 atomic skill ${createNew} 条。`;
  }
  return "当前未识别出可直接落地的 atomic skill 修改项。";
}

function summarizeListItem(workOrder = {}) {
  return {
    id: workOrder.id,
    title: workOrder.title,
    sourceTaskId: workOrder.sourceTaskId,
    moduleId: workOrder.moduleId,
    moduleName: workOrder.moduleName,
    documentType: workOrder.documentType,
    llmProfile: workOrder.llmProfile,
    status: workOrder.status,
    summary: workOrder.summary,
    decisionSummary: workOrder.decisionSummary,
    itemStats: workOrder.itemStats,
    createdAt: workOrder.createdAt,
    updatedAt: workOrder.updatedAt
  };
}

function buildGeneratedPayloadFromReplayTask(task = {}) {
  return {
    items: collectRawWorkOrderItems(task),
    summary: String(task.summary || "").trim(),
    decisionSummary: String(task.decisionSummary || "").trim(),
    validatorSuggestions: cloneJson(task.validatorSuggestions || [])
  };
}

function buildReplayTaskWorkOrderSummary(workOrder = {}) {
  return {
    id: workOrder.id,
    status: workOrder.status,
    itemStats: cloneJson(workOrder.itemStats || null),
    decisionSummary: workOrder.decisionSummary || ""
  };
}

function shouldHydrateReplayTask(task = {}) {
  return Boolean(task?.id && hasActionableReviewPayload(collectRawWorkOrderItems(task), task.validatorSuggestions || []));
}

function mergeAppliedProvenance(base = {}, extra = {}) {
  return {
    ...(cloneJson(base) || {}),
    ...(cloneJson(extra) || {})
  };
}

export class SkillWorkOrderService {
  constructor() {
    this.skillManagementService = new SkillManagementService();
    this.skillBundleService = new SkillBundleService();
  }

  async listReplayTasks() {
    const names = await fs.readdir(config.replayTaskStoreDir).catch(() => []);
    return Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(path.join(config.replayTaskStoreDir, name)))
    );
  }

  async listWorkOrders(filters = {}) {
    const names = await fs.readdir(config.skillWorkOrderStoreDir).catch(() => []);
    const persistedWorkOrders = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const workOrder = await readJson(path.join(config.skillWorkOrderStoreDir, name));
          return this.repairWorkOrderIfNeeded(workOrder);
        })
    );

    const workOrdersById = new Map();
    for (const workOrder of persistedWorkOrders.filter(Boolean)) {
      workOrdersById.set(workOrder.id, workOrder);
    }

    const replayTasks = await this.listReplayTasks();
    for (const task of replayTasks.filter(shouldHydrateReplayTask)) {
      const workOrder = await this.ensureWorkOrderForReplayTask(task, workOrdersById);
      if (workOrder) {
        workOrdersById.set(workOrder.id, workOrder);
      }
    }

    let visible = [...workOrdersById.values()].filter(Boolean);
    if (filters.status) visible = visible.filter((item) => item.status === filters.status);
    if (filters.moduleId) visible = visible.filter((item) => item.moduleId === filters.moduleId);
    if (filters.documentType) visible = visible.filter((item) => item.documentType === filters.documentType);
    if (filters.sourceTaskId) visible = visible.filter((item) => item.sourceTaskId === filters.sourceTaskId);
    return visible
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .map((item) => summarizeListItem(item));
  }

  async getWorkOrder(workOrderId) {
    const workOrder = await readJson(getWorkOrderPath(workOrderId));
    if (workOrder) {
      return this.repairWorkOrderIfNeeded(workOrder);
    }

    const replayTasks = await this.listReplayTasks();
    const matchedTask = replayTasks.find((task) => String(task?.workOrderId || "").trim() === String(workOrderId || "").trim());
    if (!matchedTask) {
      return null;
    }

    return this.ensureWorkOrderForReplayTask(matchedTask);
  }

  async repairWorkOrderIfNeeded(workOrder = null) {
    if (!workOrder) {
      return hydrateWorkOrderCompatibility(workOrder);
    }

    if (hasActionableReviewPayload(workOrder.items || [], workOrder.validatorSuggestions || []) || !workOrder.sourceTaskId) {
      return hydrateWorkOrderCompatibility(workOrder);
    }

    const task = await readJson(getReplayTaskPath(workOrder.sourceTaskId));
    if (!task) {
      return null;
    }

    if (!shouldHydrateReplayTask(task)) {
      return null;
    }

    const items = collectRawWorkOrderItems(task)
      .map((entry) => normalizeWorkOrderItem(entry, task))
      .filter((entry) => entry.conclusionType === "create_new" || entry.targetSkillCode);
    const validatorSuggestions = collectValidatorSuggestions(task.validatorSuggestions || []);
    if (!items.length && !validatorSuggestions.length) {
      return null;
    }

    workOrder.items = items;
    workOrder.validatorSuggestions = validatorSuggestions;
    workOrder.itemStats = computeItemStats(workOrder.items || [], workOrder.validatorSuggestions || []);
    workOrder.decisionSummary = buildDecisionSummary(
      {
        decisionSummary: task.decisionSummary || workOrder.decisionSummary || "",
        summary: task.summary || workOrder.summary || ""
      },
      workOrder.items || []
    );
    workOrder.status = computeWorkOrderStatus(workOrder.items || []);
    workOrder.updatedAt = now();
    await writeJson(getWorkOrderPath(workOrder.id), workOrder);
    return hydrateWorkOrderCompatibility(workOrder);
  }

  async ensureWorkOrderForReplayTask(task = {}, existingWorkOrdersById = new Map()) {
    if (!shouldHydrateReplayTask(task)) {
      return null;
    }

    let nextWorkOrderId = String(task.workOrderId || "").trim();
    let workOrder = null;

    if (nextWorkOrderId) {
      workOrder = await readJson(getWorkOrderPath(nextWorkOrderId));
    }

    if (!workOrder) {
      workOrder = [...existingWorkOrdersById.values()].find((entry) => entry?.sourceTaskId === task.id) || null;
      if (workOrder) {
        nextWorkOrderId = workOrder.id;
      }
    }

    if (workOrder) {
      workOrder = await this.repairWorkOrderIfNeeded(workOrder);
    } else {
      workOrder = await this.createFromReplayTask(task, buildGeneratedPayloadFromReplayTask(task), {
        workOrderId: nextWorkOrderId || undefined
      });
      nextWorkOrderId = workOrder.id;
    }

    const nextSummary = buildReplayTaskWorkOrderSummary(workOrder);
    const previousSummaryJson = JSON.stringify(task.workOrderSummary || null);
    const nextSummaryJson = JSON.stringify(nextSummary);
    if (task.workOrderId !== nextWorkOrderId || previousSummaryJson !== nextSummaryJson) {
      task.workOrderId = nextWorkOrderId;
      task.workOrderSummary = nextSummary;
      task.updatedAt = now();
      await writeJson(getReplayTaskPath(task.id), task);
    }

    return workOrder;
  }

  async createFromReplayTask(task = {}, generated = {}, options = {}) {
    if (!task?.id) {
      throw createManagedError("Creating a skill work order requires a replay task", 400, "missing_replay_task");
    }

    const items = collectRawWorkOrderItems(task, generated)
      .map((entry) => normalizeWorkOrderItem(entry, task))
      .filter((entry) => entry.conclusionType === "create_new" || entry.targetSkillCode);
    const validatorSuggestions = collectValidatorSuggestions(generated.validatorSuggestions);
    const status = computeWorkOrderStatus(items);
    const workOrder = {
      id: String(options.workOrderId || "").trim() || randomUUID(),
      title: buildWorkOrderTitle(task),
      sourceType: "fallback",
      sourceTaskId: task.id,
      sourceTaskSummary: buildSourceTaskSummary(task),
      projectId: task.projectId || "",
      projectName: task.projectName || "",
      moduleId: task.moduleId || "",
      moduleName: task.moduleName || "",
      documentType: normalizeDocumentType(task.materialPack?.moduleContext?.documentType),
      llmProfile: {
        id: task.llmProfileId || "",
        label: task.llmProfileId || "local-fallback"
      },
      skillVersion: cloneJson(task.skillVersion || task.materialPack?.skillVersion || null),
      effectiveSkillSnapshot: summarizeSkillSnapshot(task.materialPack),
      status,
      summary: String(generated.summary || task.summary || "").trim(),
      decisionSummary: buildDecisionSummary(generated, items),
      itemStats: computeItemStats(items, validatorSuggestions),
      evidenceRefs: (task.sourceRejectionIds || []).map((refId) => ({ type: "rejection", refId })),
      validatorSuggestions,
      items,
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getWorkOrderPath(workOrder.id), workOrder);
    return hydrateWorkOrderCompatibility(workOrder);
  }

  async reviewItem(workOrderId, itemId, payload = {}) {
    const workOrder = await this.getWorkOrder(workOrderId);
    if (!workOrder) {
      throw createManagedError("Skill work order not found", 404, "skill_work_order_not_found", { workOrderId });
    }
    const item = (workOrder.items || []).find((entry) => entry.itemId === itemId);
    if (!item) {
      throw createManagedError("Skill work order item not found", 404, "skill_work_order_item_not_found", { itemId });
    }
    if (item.reviewStatus === "applied" || item.reviewStatus === "staged") {
      throw createManagedError("Applied item cannot be reviewed again", 400, "skill_work_order_item_applied");
    }

    const nextStatus = normalizeItemReviewStatus(payload.reviewStatus || payload.status || item.reviewStatus);
    if (!["pending", "accepted", "edited", "rejected"].includes(nextStatus)) {
      throw createManagedError("Unsupported review status", 400, "unsupported_work_order_review_status", { status: nextStatus });
    }

    item.reviewStatus = nextStatus;
    item.reviewComment = String(payload.reviewComment || payload.comment || "").trim();
    if (payload.editedPayload && typeof payload.editedPayload === "object") {
      item.editedPayload = {
        title: String(payload.editedPayload.title || item.title || "").trim(),
        afterContent: String(payload.editedPayload.afterContent || payload.editedPayload.after || item.afterContent || "").trim(),
        targetSkillCode: String(payload.editedPayload.targetSkillCode || item.targetSkillCode || "").trim(),
        targetLayer: String(payload.editedPayload.targetLayer || item.targetLayer || "").trim(),
        targetProfileKey: String(payload.editedPayload.targetProfileKey || item.targetProfileKey || "").trim(),
        targetKind: String(payload.editedPayload.targetKind || payload.editedPayload.kind || item.targetKind || "").trim(),
        recommendedSkillText: String(payload.editedPayload.recommendedSkillText || item.recommendedSkillText || "").trim()
      };
      if (item.reviewStatus === "accepted") {
        item.reviewStatus = "edited";
      }
    }
    const targetLayer = String(item.editedPayload?.targetLayer || item.targetLayer || "").trim();
    const targetKind = String(item.editedPayload?.targetKind || item.targetKind || "").trim();
    if (targetLayer && targetKind && !isKindAllowedForLayer(targetLayer, targetKind)) {
      throw createManagedError("Target kind is not allowed in target layer", 400, "skill_kind_not_allowed_for_layer", {
        itemId,
        targetLayer,
        targetKind
      });
    }
    item.updatedAt = now();

    workOrder.itemStats = computeItemStats(workOrder.items || [], workOrder.validatorSuggestions || []);
    workOrder.status = computeWorkOrderStatus(workOrder.items || []);
    workOrder.updatedAt = now();
    await writeJson(getWorkOrderPath(workOrderId), workOrder);
    return item;
  }

  resolveBaseBundleId(workOrder = {}) {
    return String(
      workOrder.skillVersion?.bundleId ||
        workOrder.effectiveSkillSnapshot?.bundleId ||
        workOrder.sourceTaskSummary?.skillVersion?.bundleId ||
        ""
    ).trim();
  }

  async resolveStagingBundle(workOrder = {}, payload = {}) {
    const baseBundleId = this.resolveBaseBundleId(workOrder);
    const requestedBundleId = String(payload.targetBundleId || payload.candidateBundleId || "").trim();
    const bundle = requestedBundleId
      ? await this.skillBundleService.getBundle(requestedBundleId)
      : await this.skillBundleService.findOrCreateWorkOrderCandidate({
          baseBundleId,
          workOrderId: workOrder.id,
          changeSummary: `Staged changes from work order ${workOrder.id}.`
        });
    if (!bundle) {
      throw createManagedError("Skill bundle not found", 404, "skill_bundle_not_found", { bundleId: requestedBundleId });
    }
    if (bundle.status !== "candidate") {
      throw createManagedError("Work order items can only be staged into candidate bundles", 400, "skill_bundle_not_candidate", {
        bundleId: bundle.id,
        status: bundle.status
      });
    }
    if (baseBundleId && bundle.baseBundleId !== baseBundleId) {
      throw createManagedError("Work order base bundle does not match candidate base bundle", 409, "skill_bundle_base_mismatch", {
        workOrderId: workOrder.id,
        workOrderBaseBundleId: baseBundleId,
        candidateBundleId: bundle.id,
        candidateBaseBundleId: bundle.baseBundleId
      });
    }
    return bundle;
  }

  async stageItem(workOrderId, itemId, payload = {}) {
    const workOrder = await this.getWorkOrder(workOrderId);
    if (!workOrder) {
      throw createManagedError("Skill work order not found", 404, "skill_work_order_not_found", { workOrderId });
    }
    const item = (workOrder.items || []).find((entry) => entry.itemId === itemId);
    if (!item) {
      throw createManagedError("Skill work order item not found", 404, "skill_work_order_item_not_found", { itemId });
    }
    if (!["accepted", "edited"].includes(item.reviewStatus)) {
      throw createManagedError("Only accepted items can be applied", 400, "skill_work_order_item_not_accepted", {
        itemId,
        reviewStatus: item.reviewStatus
      });
    }

    const editedPayload = item.editedPayload || {};
    const targetSkillCode = String(editedPayload.targetSkillCode || item.targetSkillCode || "").trim();
    const targetLayer = String(editedPayload.targetLayer || item.targetLayer || "").trim();
    const targetProfileKey = String(editedPayload.targetProfileKey || item.targetProfileKey || "").trim();
    const targetKind = String(editedPayload.targetKind || item.targetKind || "").trim();
    const title = String(editedPayload.title || item.title || "").trim();
    const afterContent = String(editedPayload.afterContent || editedPayload.recommendedSkillText || item.afterContent || item.recommendedSkillText || "").trim();
    const stagedBy = String(payload.stagedBy || payload.appliedBy || "system").trim() || "system";

    if (!afterContent) {
      throw createManagedError("Applying a skill work order item requires non-empty after content", 400, "empty_after_content", {
        itemId
      });
    }
    if (!isKindAllowedForLayer(targetLayer, targetKind)) {
      throw createManagedError("Target kind is not allowed in target layer", 400, "skill_kind_not_allowed_for_layer", {
        itemId,
        targetLayer,
        targetKind
      });
    }

    const provenance = {
      sourceType: "fallback_work_order",
      sourceTaskId: workOrder.sourceTaskId,
      workOrderId,
      workOrderItemId: itemId,
      rejectionIds: (workOrder.evidenceRefs || []).map((entry) => entry.refId).filter(Boolean)
    };

    const candidateBundle = await this.resolveStagingBundle(workOrder, payload);
    const candidateSkillDir = await this.skillBundleService.getSkillDir(candidateBundle.id);
    provenance.stagedBundleId = candidateBundle.id;

    let beforeSnapshot = null;
    let afterSnapshot = null;
    let appliedSkillCode = targetSkillCode;

    if (item.conclusionType === "modify_existing") {
      if (!targetSkillCode) {
        throw createManagedError("Modify-existing item requires targetSkillCode", 400, "missing_target_skill_code", { itemId });
      }

      const detail = await this.skillManagementService.getSkillItem(targetSkillCode, candidateSkillDir);
      const current = detail.item;
      beforeSnapshot = cloneJson(current);
      if (current.layer !== targetLayer || current.profileKey !== targetProfileKey || current.kind !== targetKind) {
        throw createManagedError("Target skill no longer matches expected layer/profile/kind", 409, "skill_target_mismatch", {
          expected: { targetLayer, targetProfileKey, targetKind },
          actual: { layer: current.layer, profileKey: current.profileKey, kind: current.kind }
        });
      }

      afterSnapshot = await this.skillManagementService.updateSkillItem(targetSkillCode, {
        title: editedPayload.title ? title : current.title,
        content: afterContent,
        provenance: mergeAppliedProvenance(current.provenance, provenance),
        review: {
          reviewer: stagedBy,
          note: `Staged from work order ${workOrderId}`,
          updatedAt: now()
        }
      }, candidateSkillDir);
    } else {
      afterSnapshot = await this.skillManagementService.createSkillItem({
        layer: targetLayer,
        profileKey: targetProfileKey,
        kind: targetKind,
        title: title || "Fallback skill work order item",
        content: afterContent,
        provenance,
        review: {
          reviewer: stagedBy,
          note: `Created from work order ${workOrderId}`,
          updatedAt: now()
        }
      }, candidateSkillDir);
      appliedSkillCode = afterSnapshot.skillCode;
    }

    const stagedAt = now();
    item.reviewStatus = "staged";
    item.stagedAt = stagedAt;
    item.stagedBy = stagedBy;
    item.stagedBundleId = candidateBundle.id;
    item.appliedAt = stagedAt;
    item.appliedBy = stagedBy;
    item.appliedChange = {
      mode: item.conclusionType === "modify_existing" ? "update" : "create",
      skillCode: appliedSkillCode,
      beforeSnapshot,
      afterSnapshot: cloneJson(afterSnapshot),
      stagedBundleId: candidateBundle.id
    };
    item.updatedAt = now();
    workOrder.itemStats = computeItemStats(workOrder.items || [], workOrder.validatorSuggestions || []);
    workOrder.status = computeWorkOrderStatus(workOrder.items || []);
    workOrder.updatedAt = now();
    await writeJson(getWorkOrderPath(workOrderId), workOrder);
    const refreshedCandidateBundle = await this.skillBundleService.recordStagedWorkOrderItem(candidateBundle.id, {
      workOrderId,
      workOrderItemId: itemId,
      sourceTaskId: workOrder.sourceTaskId,
      mode: item.appliedChange.mode,
      skillCode: appliedSkillCode,
      title,
      stagedBy,
      stagedAt
    });
    return {
      workOrder,
      item,
      candidateBundle: refreshedCandidateBundle
    };
  }

  async applyItem(workOrderId, itemId, payload = {}) {
    return this.stageItem(workOrderId, itemId, payload);
  }

  async closeWorkOrder(workOrderId, payload = {}) {
    const workOrder = await this.getWorkOrder(workOrderId);
    if (!workOrder) {
      throw createManagedError("Skill work order not found", 404, "skill_work_order_not_found", { workOrderId });
    }
    const hasPending = (workOrder.items || []).some((item) => ["pending", "accepted", "edited"].includes(item.reviewStatus));
    if (hasPending) {
      throw createManagedError("All work order items must be resolved before closing", 400, "skill_work_order_has_pending_items");
    }
    workOrder.status = "closed";
    workOrder.closedAt = now();
    workOrder.closedBy = String(payload.closedBy || "system").trim() || "system";
    workOrder.updatedAt = now();
    await writeJson(getWorkOrderPath(workOrderId), workOrder);
    return workOrder;
  }
}
