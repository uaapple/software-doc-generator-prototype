import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, resolveStoredFilePath, writeJson } from "./storage.js";
import { ProjectService } from "./project-service.js";
import { RejectionService } from "./rejection-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { SkillRuleService } from "./skill-rule-service.js";
import { LlmService } from "./llm-service.js";
import { SkillLoader } from "./skill-loader.js";
import { SkillWorkOrderService } from "./skill-work-order-service.js";

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

function buildAllowedKindsByArea() {
  return {
    writing: ["writing_rule", "good_example", "rule_hint", "generation_priority"],
    extraction: ["extraction_rule", "rule_hint", "generation_priority"],
    validation: ["validation_rule", "anti_pattern", "rule_hint"],
    examples: ["good_example", "bad_example", "anti_pattern"],
    domain_knowledge: [
      "source_alias",
      "normalization_rule",
      "forbidden_expansion",
      "source_policy_setting",
      "document_blueprint_section",
      "document_blueprint_policy",
      "code_style_prefix",
      "rule_hint",
      "generation_priority",
      "anti_pattern"
    ]
  };
}

function buildLayerDefinitions() {
  return {
    generic: "跨模块和跨文档通用的基础规则，只有在确实具有全局适用性时才放这里。",
    docType: "只对某种文档类型生效的规则，例如 software_requirement / detail_design / hil_test_case。",
    domain: "在某个领域内广泛适用但不局限于单一模块的规则。",
    module: "只对单个功能模块或单个 moduleSkillKey 生效的规则。"
  };
}

function validateProposalTargets(proposalItems = [], targetAreas = []) {
  const allowedKindsByArea = buildAllowedKindsByArea();
  const allowedKinds = new Set((targetAreas.length ? targetAreas : ["validation"]).flatMap((area) => allowedKindsByArea[area] || allowedKindsByArea.validation));
  for (const item of proposalItems) {
    const layer = String(item.targetLayer || "").trim();
    if (!["generic", "docType", "domain", "module"].includes(layer)) {
      throw createHttpError(`Unsupported proposal targetLayer: ${layer}`);
    }
    if (!allowedKinds.has(item.kind)) {
      throw createHttpError(`Unsupported proposal kind for current target area: ${item.kind}`);
    }
    if (!String(item.targetProfileKey || "").trim()) {
      throw createHttpError("Proposal targetProfileKey is required");
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
    this.skillLoader = new SkillLoader();
    this.skillWorkOrderService = new SkillWorkOrderService();
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
    const moduleSkillKey = normalizeSkillKey(module?.moduleSkillKey || module?.name || records[0]?.moduleName || "");
    const domainKey = normalizeSkillKey(module?.domain || project?.domain || records[0]?.domain || "embedded_vcu");
    const documentType = records[0]?.documentType || "software_requirement";
    const candidateSkillItems = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, effectiveAreas, {
      documentType,
      domain: domainKey,
      moduleSkillKey
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
            candidateSkillCodes: candidateSkillItems.map((item) => item.skillCode || item.ruleId),
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
      allowedKindsByArea: buildAllowedKindsByArea(),
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
      candidateSkillItems: candidateSkillItems.map((item) => ({
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
        targetArea: record.skillContext?.targetArea,
        outputSnapshot: record.outputSnapshot,
        sourceRefsSnapshot: record.sourceRefsSnapshot || [],
        projectEvidenceSnapshot: record.projectEvidenceSnapshot || [],
        relevantRules: record.skillContext?.relevantRules || []
      }))
    };

    const { proposal, replayAnalysis } = await this.buildProposal({
      records,
      bundleId,
      targetAreas: effectiveAreas,
      materialPack,
      llmProfileId
    });
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
      decisionSummary: proposal.decisionSummary || replayAnalysis?.decisionSummary || "",
      validatorSuggestions: proposal.validatorSuggestions || replayAnalysis?.validatorSuggestions || [],
      applyResult: null,
      createdAt: now(),
      updatedAt: now()
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
    const relevantRules = await this.skillRuleService.getRelevantRuleSnapshot(bundleId, targetAreas, {
      documentType: materialPack.moduleContext?.documentType || "software_requirement",
      domain: materialPack.moduleContext?.domain || "",
      moduleSkillKey: materialPack.moduleContext?.moduleSkillKey || ""
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
      validateProposalTargets(normalizedItems, targetAreas);
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
          targetLayer: targetArea === "examples" ? "module" : "docType",
          targetProfileKey:
            targetArea === "examples"
              ? materialPack.moduleContext?.moduleSkillKey || normalizeSkillKey(materialPack.moduleContext?.moduleName || "")
              : materialPack.moduleContext?.documentType || "software_requirement",
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
    validateProposalTargets(acceptedItems, task.materialPack?.targetAreas || []);

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
