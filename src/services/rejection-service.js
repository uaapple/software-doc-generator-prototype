import { randomUUID } from "node:crypto";
import path from "node:path";
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

function inferTargetArea(reasonCategory, reasonTags = [], reasonText = "") {
  const tags = reasonTags.join(" ");
  const text = `${reasonCategory} ${tags} ${reasonText}`.toLowerCase();
  if (/(trace|追踪|来源|引用|校验|验收|边界|异常|validate|acceptance|criteria)/.test(text)) return "validation";
  if (/(抽取|evidence|信号|变量|extract)/.test(text)) return "extraction";
  if (/(example|示例|样例|写法示例|反例)/.test(text)) return "examples";
  if (/(领域|术语|domain|知识|字典)/.test(text)) return "domain_knowledge";
  return "writing";
}

export class RejectionService {
  constructor() {
    this.skillBundleService = new SkillBundleService();
    this.skillRuleService = new SkillRuleService();
  }

  async createRecord({ project, requirement, review }) {
    if (!review.reasonCategory || !String(review.reasonText || "").trim()) {
      throw createHttpError("Rejected review requires reasonCategory and reasonText");
    }

    const activeBundle = await this.skillBundleService.getActiveBundle();
    const bundleId = activeBundle?.id || "bundle-base";
    const skillDir = await this.skillBundleService.getSkillDir(bundleId);
    const ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir);
    const reasonTags = normalizeTags(review.reasonTags);
    const targetArea = inferTargetArea(review.reasonCategory, reasonTags, review.reasonText || review.comment || "");
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, [targetArea]);

    const record = {
      id: randomUUID(),
      projectId: project.id,
      requirementId: requirement.id,
      requirementCode: requirement.requirementId,
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
      outputSnapshot: {
        title: requirement.title,
        requirementText: requirement.requirementText,
        type: requirement.type,
        confidence: requirement.confidence,
        verificationHint: requirement.verificationHint || "",
        conflictNote: requirement.conflictNote || ""
      },
      sourceRefsSnapshot: requirement.sourceRefs || [],
      projectEvidenceSnapshot: compactEvidence(project),
      llmProfileSnapshot: project.lastGeneration?.llmProfile || null,
      skillContext: {
        activeBundleId: bundleId,
        ruleIndexVersion: ruleIndex.ruleIndexVersion,
        targetArea,
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
    if (filters.reasonCategory) records = records.filter((item) => item.reasonCategory === filters.reasonCategory);
    if (filters.poolStatus) records = records.filter((item) => item.poolStatus === filters.poolStatus);
    if (filters.replayStatus) records = records.filter((item) => item.replayStatus === filters.replayStatus);
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

  async rebuildGroups() {
    const records = await this.listRecords();
    const groupMap = new Map();

    for (const record of records.filter((item) => item.poolStatus !== "archived")) {
      const reasonTags = [...(record.reasonTags || [])].sort();
      const groupKey = [
        record.reasonCategory,
        reasonTags.join("|"),
        record.skillContext?.targetArea || inferTargetArea(record.reasonCategory, reasonTags, record.reasonText),
        record.skillContext?.activeBundleId || ""
      ].join("::");
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          id: randomUUID(),
          groupKey,
          title: `${record.reasonCategory} / ${(record.skillContext?.targetArea || "writing").replaceAll("_", " ")}`,
          reasonCategory: record.reasonCategory,
          reasonTags,
          targetArea: record.skillContext?.targetArea || inferTargetArea(record.reasonCategory, reasonTags, record.reasonText),
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
      const key = [
        record.reasonCategory,
        reasonTags.join("|"),
        record.skillContext?.targetArea || inferTargetArea(record.reasonCategory, reasonTags, record.reasonText),
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
