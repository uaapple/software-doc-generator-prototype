import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { SkillRuleService } from "./skill-rule-service.js";

function now() {
  return new Date().toISOString();
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getRejectionPath(id) {
  return path.join(config.rejectionStoreDir, `${id}.json`);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function compactEvidence(project) {
  return (project.extractions || [])
    .flatMap((entry) => entry.evidence || [])
    .slice(0, 8)
    .map((item) => ({
      fileName: item.fileName,
      fileRole: item.fileRole,
      location: item.location,
      excerpt: item.excerpt,
      tags: item.tags || []
    }));
}

function compactConflicts(conflicts = []) {
  return (conflicts || []).slice(0, 12).map((item) => ({
    code: item.code || "",
    message: item.message || item.detail || "",
    severity: item.severity || ""
  }));
}

function compactTraces(traces = []) {
  return (traces || []).slice(0, 20).map((item) => ({
    fileName: item.fileName || "",
    location: item.location || "",
    excerpt: item.excerpt || "",
    requirementCode: item.requirementCode || item.requirementId || ""
  }));
}

function normalizeSkillKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_");
}

function normalizeTargetLayerConstraint(value = "") {
  const normalized = String(value || "").trim();
  return ["generic", "docType", "domain", "module"].includes(normalized) ? normalized : "";
}

function normalizeTargetArea(value = "") {
  const normalized = String(value || "").trim();
  return ["writing", "extraction", "validation", "examples", "domain_knowledge"].includes(normalized) ? normalized : "";
}

function resolveTargetProfileKeyConstraint(targetLayerConstraint, context = {}) {
  if (targetLayerConstraint === "module") {
    return normalizeSkillKey(context.moduleSkillKey || context.moduleName || "");
  }
  if (targetLayerConstraint === "domain") {
    return normalizeSkillKey(context.domain || "embedded_vcu");
  }
  if (targetLayerConstraint === "docType") {
    return normalizeSkillKey(context.documentType || "software_requirement");
  }
  return "generic";
}

function inferTargetArea(reasonCategory, reasonTags = [], reasonText = "") {
  const tags = reasonTags.join(" ");
  const text = `${reasonCategory} ${tags} ${reasonText}`.toLowerCase();
  if (/(trace|追踪|来源|引用|校验|验收|边界|异常|validate|acceptance|criteria)/.test(text)) return "validation";
  if (/(抽取|evidence|信号|变量|extract)/.test(text)) return "extraction";
  if (/(example|示例|样例|写法示例|反例)/.test(text)) return "examples";
  if (/(领域|术语|domain|知识|字典)/.test(text)) return "domain_knowledge";
  return "writing";
}

function toReadableReasonCategory(reasonCategory = "") {
  const labels = {
    coverage_gap: "覆盖缺失",
    traceability_issue: "来源追踪问题",
    wording_issue: "表述问题",
    logic_issue: "逻辑错误",
    validation_gap: "校验缺失",
    other: "其他"
  };
  return labels[reasonCategory] || reasonCategory || "其他";
}

function toReadableTargetArea(targetArea = "") {
  const labels = {
    writing: "写作规则",
    extraction: "抽取规则",
    validation: "校验规则",
    examples: "示例规则",
    domain_knowledge: "领域知识"
  };
  return labels[targetArea] || targetArea || "写作规则";
}

function toReadableTargetLayer(targetLayerConstraint = "") {
  const labels = {
    generic: "Generic",
    docType: "DocType",
    domain: "Domain",
    module: "Module"
  };
  return labels[targetLayerConstraint] || targetLayerConstraint || "DocType";
}

function resolveRecordTargetArea(record = {}) {
  return (
    normalizeTargetArea(record.skillContext?.targetArea || "") ||
    inferTargetArea(record.reasonCategory, normalizeTags(record.reasonTags), record.reasonText)
  );
}

export class RejectionService {
  constructor() {
    this.skillBundleService = new SkillBundleService();
    this.skillRuleService = new SkillRuleService();
  }

  async createRecord({ project, module = null, task = null, requirement, review, documentType = "", conflicts = [], traces = [] }) {
    if (!review.reasonCategory || !String(review.reasonText || "").trim() || !normalizeTargetArea(review.targetArea)) {
      throw createHttpError("Rejected review requires reasonCategory, reasonText, and targetArea");
    }

    const activeBundle = await this.skillBundleService.getActiveBundle();
    const bundleId = activeBundle?.id || "bundle-base";
    const skillDir = await this.skillBundleService.getSkillDir(bundleId);
    const ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir);
    const reasonTags = normalizeTags(review.reasonTags);
    const targetArea = normalizeTargetArea(review.targetArea);
    const normalizedDocumentType = documentType || review.documentType || "software_requirement";
    const targetLayerConstraint = normalizeTargetLayerConstraint(review.targetLayerConstraint) || "docType";
    const targetProfileKeyConstraint = resolveTargetProfileKeyConstraint(targetLayerConstraint, {
      documentType: normalizedDocumentType,
      domain: normalizeSkillKey(module?.domain || project?.domain || review.domain || "embedded_vcu"),
      moduleSkillKey: module?.moduleSkillKey || module?.name || review.moduleName || "",
      moduleName: module?.name || review.moduleName || ""
    });
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(
      bundleId,
      [targetArea],
      {
        documentType: normalizedDocumentType,
        domain: normalizeSkillKey(module?.domain || project?.domain || review.domain || "embedded_vcu"),
        moduleSkillKey: normalizeSkillKey(module?.moduleSkillKey || module?.name || review.moduleName || "")
      },
      {
        layerConstraint: targetLayerConstraint,
        profileKeyConstraint: targetProfileKeyConstraint
      }
    );

    const record = {
      id: randomUUID(),
      projectId: project.id,
      projectName: project.name || "",
      moduleId: module?.id || review.moduleId || "",
      moduleName: module?.name || review.moduleName || "",
      documentType: normalizedDocumentType,
      requirementId: requirement.id,
      requirementCode: requirement.requirementId,
      sourceTaskId: task?.id || review.generationId || "",
      sourceResultItemId: review.resultItemId || requirement.id,
      generationContext: {
        generatedAt: review.generationId || project.lastGeneration?.at || "",
        llmProfile: project.lastGeneration?.llmProfile || null
      },
      reviewStatus: review.status || "rejected",
      reasonCategory: review.reasonCategory,
      reasonTags,
      reasonText: String(review.reasonText || "").trim(),
      severity: review.severity || "medium",
      expectedNote: String(review.expectedNote || "").trim(),
      targetLayerConstraint,
      outputSnapshot: {
        title: requirement.title,
        requirementText: requirement.requirementText,
        type: requirement.type,
        confidence: requirement.confidence,
        verificationHint: requirement.verificationHint || "",
        conflictNote: requirement.conflictNote || "",
        documentType: normalizedDocumentType,
        conflicts: compactConflicts(conflicts),
        traces: compactTraces(traces)
      },
      sourceRefsSnapshot: requirement.sourceRefs || [],
      projectEvidenceSnapshot: compactEvidence(project),
      llmProfileSnapshot: project.lastGeneration?.llmProfile || null,
      skillContext: {
        activeBundleId: bundleId,
        ruleIndexVersion: ruleIndex.ruleIndexVersion,
        targetArea,
        targetLayerConstraint,
        targetProfileKeyConstraint,
        relevantRules: relevantRules.map((rule) => ({
          ruleId: rule.ruleId,
          title: rule.title,
          targetFile: rule.targetFile,
          content: rule.content
        }))
      },
      poolStatus: review.includeInPool === false ? "archived" : "new",
      groupId: "",
      replayStatus: "not_started",
      replayCount: 0,
      replayTaskIds: [],
      lastReplayAt: "",
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getRejectionPath(record.id), record);
    await this.rebuildGroups();
    return record;
  }

  async listRecords(filters = {}) {
    const names = await (await import("node:fs/promises")).readdir(config.rejectionStoreDir);
    let records = await Promise.all(
      names
        .filter((name) => name.endsWith(".json") && name !== path.basename(config.rejectionGroupStorePath))
        .map((name) => readJson(path.join(config.rejectionStoreDir, name)))
    );

    records = records.filter(Boolean);
    if (filters.projectId) records = records.filter((item) => item.projectId === filters.projectId);
    if (filters.moduleId) records = records.filter((item) => item.moduleId === filters.moduleId);
    if (filters.documentType) records = records.filter((item) => item.documentType === filters.documentType);
    if (filters.reasonCategory) records = records.filter((item) => item.reasonCategory === filters.reasonCategory);
    if (filters.poolStatus) records = records.filter((item) => item.poolStatus === filters.poolStatus);
    if (filters.replayStatus) records = records.filter((item) => item.replayStatus === filters.replayStatus);
    if (filters.targetArea) records = records.filter((item) => resolveRecordTargetArea(item) === filters.targetArea);
    if (filters.hasReplay === "true") records = records.filter((item) => Number(item.replayCount || 0) > 0);
    if (filters.hasReplay === "false") records = records.filter((item) => Number(item.replayCount || 0) === 0);
    if (filters.skillBundleId) records = records.filter((item) => item.skillContext?.activeBundleId === filters.skillBundleId);
    if (filters.tag) records = records.filter((item) => (item.reasonTags || []).includes(filters.tag));
    return records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getRecord(id) {
    return readJson(getRejectionPath(id));
  }

  async updateRecord(id, patch = {}) {
    const record = await this.getRecord(id);
    if (!record) {
      throw createHttpError("Rejection record not found", 404);
    }
    const next = {
      ...record,
      ...patch,
      updatedAt: now()
    };
    await writeJson(getRejectionPath(id), next);
    return next;
  }

  async deleteRecord(id) {
    const record = await this.getRecord(id);
    if (!record) {
      throw createHttpError("Rejection record not found", 404);
    }

    await fs.rm(getRejectionPath(id), { force: true });
    await this.rebuildGroups();
    return { deleted: true, id };
  }

  async rebuildGroups() {
    const records = await this.listRecords();
    const groupMap = new Map();

    for (const record of records.filter((item) => item.poolStatus !== "archived")) {
      const reasonTags = [...(record.reasonTags || [])].sort();
      const resolvedTargetArea = resolveRecordTargetArea(record);
      const groupKey = [
        record.projectId || "",
        record.moduleId || "",
        record.reasonCategory,
        reasonTags.join("|"),
        resolvedTargetArea,
        record.skillContext?.targetLayerConstraint || "docType",
        record.skillContext?.activeBundleId || ""
      ].join("::");
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          id: randomUUID(),
          groupKey,
          title: `${toReadableReasonCategory(record.reasonCategory)} / ${toReadableTargetArea(resolvedTargetArea)} / ${toReadableTargetLayer(record.skillContext?.targetLayerConstraint || "docType")}`,
          reasonCategory: record.reasonCategory,
          reasonTags,
          targetArea: resolvedTargetArea,
          targetLayerConstraint: record.skillContext?.targetLayerConstraint || "docType",
          projectId: record.projectId || "",
          projectName: record.projectName || "",
          moduleId: record.moduleId || "",
          moduleName: record.moduleName || "",
          memberIds: [],
          stats: { count: 0, replayedCount: 0 },
          status: "active"
        });
      }
      const group = groupMap.get(groupKey);
      group.memberIds.push(record.id);
      group.stats.count += 1;
      if (record.replayStatus && record.replayStatus !== "not_started") {
        group.stats.replayedCount += 1;
      }
    }

    const groups = [...groupMap.values()].sort((a, b) => b.stats.count - a.stats.count);
    await writeJson(config.rejectionGroupStorePath, groups);

    const idByKey = new Map(groups.map((group) => [group.groupKey, group.id]));
    for (const record of records) {
      const reasonTags = [...(record.reasonTags || [])].sort();
      const resolvedTargetArea = resolveRecordTargetArea(record);
      const key = [
        record.projectId || "",
        record.moduleId || "",
        record.reasonCategory,
        reasonTags.join("|"),
        resolvedTargetArea,
        record.skillContext?.targetLayerConstraint || "docType",
        record.skillContext?.activeBundleId || ""
      ].join("::");
      const groupId = idByKey.get(key) || "";
      if (record.groupId !== groupId) {
        await this.updateRecord(record.id, { groupId });
      }
    }

    return groups;
  }

  async listGroups() {
    return readJson(config.rejectionGroupStorePath, []);
  }

  async getGroup(groupId) {
    const groups = await this.listGroups();
    return groups.find((group) => group.id === groupId) || null;
  }
}
