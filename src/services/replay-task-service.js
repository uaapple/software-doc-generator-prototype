import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { ProjectService } from "./project-service.js";
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

function buildReplayStatus(taskCount = 0, hasProposal = false) {
  if (!taskCount) return "not_started";
  return hasProposal ? "proposal_ready" : "replayed";
}

export class ReplayTaskService {
  constructor() {
    this.projectService = new ProjectService();
    this.rejectionService = new RejectionService();
    this.skillBundleService = new SkillBundleService();
    this.skillRuleService = new SkillRuleService();
    this.llmService = new LlmService();
  }

  async listTasks(filters = {}) {
    const names = await fs.readdir(config.replayTaskStoreDir);
    const tasks = await Promise.all(
      names.filter((name) => name.endsWith(".json")).map((name) => readJson(path.join(config.replayTaskStoreDir, name)))
    );

    let visible = tasks.filter(Boolean);
    if (filters.projectId) visible = visible.filter((item) => item.projectId === filters.projectId);
    if (filters.moduleId) visible = visible.filter((item) => item.moduleId === filters.moduleId);
    return visible.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getTask(taskId) {
    return readJson(getTaskPath(taskId));
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
      if (asset.absolutePath && isPreviewableAsset(asset)) {
        try {
          preview = truncate(await fs.readFile(asset.absolutePath, "utf8"));
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

  async createTask({
    rejectionIds = [],
    groupId = "",
    targetBundleId = "",
    targetAreas = [],
    llmProfileId = "",
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
    const ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir);
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
    const referenceAssets = await this.buildReferenceAssets(inferredProjectId, inferredModuleId, normalizedReferenceAssetIds);

    const materialPack = {
      summary: `${records.length} rejection records selected for replay`,
      targetBundleId: bundleId,
      targetAreas: effectiveAreas,
      ruleIndexVersion: ruleIndex.ruleIndexVersion,
      moduleContext: {
        projectId: inferredProjectId,
        projectName: project?.name || records[0]?.projectName || "",
        moduleId: inferredModuleId,
        moduleName: module?.name || records[0]?.moduleName || "",
        documentType: records[0]?.documentType || "software_requirement"
      },
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
        targetArea: record.skillContext?.targetArea,
        outputSnapshot: record.outputSnapshot,
        sourceRefsSnapshot: record.sourceRefsSnapshot || [],
        projectEvidenceSnapshot: record.projectEvidenceSnapshot || [],
        relevantRules: record.skillContext?.relevantRules || []
      }))
    };

    const proposal = await this.buildProposal({ records, bundleId, targetAreas: effectiveAreas, materialPack, llmProfileId });
    const task = {
      id: randomUUID(),
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
      applyResult: null,
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getTaskPath(task.id), task);
    const proposalReady = (proposal.items || []).length > 0;
    for (const record of records) {
      const replayTaskIds = [...new Set([...(record.replayTaskIds || []), task.id])];
      await this.rejectionService.updateRecord(record.id, {
        replayStatus: buildReplayStatus(replayTaskIds.length, proposalReady),
        replayCount: replayTaskIds.length,
        replayTaskIds,
        lastReplayAt: task.createdAt
      });
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
      summary: generated.summary || `Generated ${grouped.size} grouped replay proposals from ${records.length} rejection records.`,
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
          after: `${targetRule.content.trim()}\nAdd constraint: ${patchSentence}`,
          title: `${targetRule.title} (supplement)`,
          rationale,
          evidenceRefs,
          status: "pending",
          editedPayload: null,
          createdAt: now(),
          updatedAt: now()
        });
      } else {
        const title = `${areaRecords[0]?.reasonCategory || "feedback"} supplemental rule`;
        const content = `The system should avoid the following issue: ${patchSentence}`;
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
    const activeBundle = (await this.skillBundleService.getBundle(task.targetBundleId)) || (await this.skillBundleService.getActiveBundle());
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