import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { RejectionService } from "./rejection-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { SkillRuleService } from "./skill-rule-service.js";
import { LlmService } from "./llm-service.js";

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

function collectRootCauses(records = []) {
  return [...new Set(records.map((item) => item.reasonCategory).filter(Boolean))].map(
    (category) => `Multiple rejections point to ${category} issues.`
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

export class ReplayTaskService {
  constructor() {
    this.rejectionService = new RejectionService();
    this.skillBundleService = new SkillBundleService();
    this.skillRuleService = new SkillRuleService();
    this.llmService = new LlmService();
  }

  async listTasks() {
    const fs = await import("node:fs/promises");
    const names = await fs.readdir(config.replayTaskStoreDir);
    const tasks = await Promise.all(
      names.filter((name) => name.endsWith(".json")).map((name) => readJson(path.join(config.replayTaskStoreDir, name)))
    );
    return tasks.filter(Boolean).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getTask(taskId) {
    return readJson(getTaskPath(taskId));
  }

  async createTask({ rejectionIds = [], groupId = "", targetBundleId = "", targetAreas = [], llmProfileId = "" }) {
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

    const activeBundle = targetBundleId ? await this.skillBundleService.getBundle(targetBundleId) : await this.skillBundleService.getActiveBundle();
    const bundleId = activeBundle?.id || targetBundleId || "bundle-base";
    const skillDir = await this.skillBundleService.getSkillDir(bundleId);
    const ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir);
    const effectiveAreas = targetAreas.length ? targetAreas : [...new Set(records.map((item) => normalizeArea(item.skillContext?.targetArea)))];

    const materialPack = {
      summary: `${records.length} rejection records selected for replay`,
      targetBundleId: bundleId,
      targetAreas: effectiveAreas,
      ruleIndexVersion: ruleIndex.ruleIndexVersion,
      rejectionSnapshots: records.map((record) => ({
        id: record.id,
        reasonCategory: record.reasonCategory,
        reasonText: record.reasonText,
        expectedNote: record.expectedNote,
        targetArea: record.skillContext?.targetArea,
        outputSnapshot: record.outputSnapshot,
        relevantRules: record.skillContext?.relevantRules || []
      }))
    };

    const proposal = await this.buildProposal({ records, bundleId, targetAreas: effectiveAreas, materialPack, llmProfileId });
    const task = {
      id: randomUUID(),
      sourceRejectionIds: selectedIds,
      groupIds: group ? [group.id] : [],
      targetBundleId: bundleId,
      llmProfileId,
      taskStatus: "done",
      materialPack,
      proposalIds: [proposal.id],
      proposals: [proposal],
      summary: proposal.summary,
      applyResult: null,
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getTaskPath(task.id), task);
    for (const record of records) {
      await this.rejectionService.updateRecord(record.id, { replayStatus: "done" });
    }
    await this.rejectionService.rebuildGroups();
    return task;
  }

  async buildProposal({ records, bundleId, targetAreas = [], materialPack = {}, llmProfileId = "" }) {
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, targetAreas);
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
      summary: generated.summary || ("Generated " + grouped.size + " grouped replay proposals from " + records.length + " rejection records."),
      rootCauses: generated.rootCauses?.length ? generated.rootCauses : collectRootCauses(records),
      status: "proposal_review",
      items: []
    };

    const normalizedItems = Array.isArray(generated.items) ? generated.items : [];
    if (normalizedItems.length) {
      for (const item of normalizedItems) {
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: item.action,
          targetRuleId: item.targetRuleId,
          targetFile: item.targetFile,
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
      return proposal;
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
          action: "modify_rule",
          targetRuleId: targetRule.ruleId,
          targetFile,
          newRuleDraft: null,
          before: targetRule.content,
          after: targetRule.content.trim() + "\nAdd constraint: " + patchSentence,
          title: targetRule.title + " (supplement)",
          rationale,
          evidenceRefs,
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      } else {
        const title = (areaRecords[0]?.reasonCategory || "feedback") + " supplemental rule";
        const content = "The system should avoid the following issue: " + patchSentence;
        proposal.items.push({
          proposalItemId: randomUUID(),
          proposalId: proposal.id,
          action: targetArea === "examples" ? "add_example" : "add_rule",
          targetRuleId: "",
          targetFile,
          newRuleDraft: {
            title,
            content
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

    return proposal;
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
    item.updatedAt = now();
    task.updatedAt = now();
    await writeJson(getTaskPath(taskId), task);
    return item;
  }

  async applyTask(taskId) {
    const task = await this.getTask(taskId);
    if (!task) throw createHttpError("Replay task not found", 404);
    const activeBundle = await this.skillBundleService.getBundle(task.targetBundleId) || await this.skillBundleService.getActiveBundle();
    const acceptedItems = (task.proposals || [])
      .flatMap((proposal) => proposal.items || [])
      .filter((item) => item.status === "accepted" || item.status === "edited")
      .map((item) => ({ ...item, ...(item.editedPayload || {}) }));

    if (!acceptedItems.length) {
      throw createHttpError("No accepted proposal items to apply");
    }

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
