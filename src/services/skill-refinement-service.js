import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { BenchmarkCaseService } from "./benchmark-case-service.js";
import { BenchmarkEvaluationService } from "./benchmark-evaluation-service.js";
import { SkillRefinementAuditService } from "./skill-refinement-audit-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { SkillRegistryService } from "./skill-registry-service.js";

function now() {
  return new Date().toISOString();
}

function getRunPath(runId) {
  return path.join(config.skillRefinementRunDir, `${runId}.json`);
}

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_");
}

function kindToTargetFile(kind = "") {
  if (kind === "writing_rule") return "requirement_writing.md";
  if (kind === "extraction_rule") return "requirement_extraction.md";
  if (kind === "validation_rule") return "requirement_validation.md";
  if (kind === "good_example") return "examples/good_examples.md";
  if (kind === "bad_example") return "examples/bad_examples.md";
  return "domain-knowledge.json";
}

function proposalCategoryForKind(kind = "") {
  if (kind === "writing_rule") return "writing";
  if (kind === "extraction_rule") return "extraction";
  if (kind === "validation_rule") return "validation";
  if (kind === "good_example" || kind === "bad_example") return "good_example";
  return "domain_knowledge";
}

function buildEditableContent(kind = "", content = "", structuredPayload = null) {
  if (structuredPayload && ["good_example", "bad_example", "rule_hint"].includes(kind)) {
    return JSON.stringify(structuredPayload, null, 2);
  }
  return String(content || "").trim();
}

function hydrateDraftFromEditedContent(kind = "", editedContent = "", draft = {}) {
  const trimmed = String(editedContent || "").trim();
  if (!trimmed) return draft;
  if (["good_example", "bad_example", "rule_hint"].includes(kind)) {
    try {
      const payload = JSON.parse(trimmed);
      return {
        ...draft,
        content: String(payload.requirementText || draft.content || "").trim(),
        structuredPayload: payload
      };
    } catch (_error) {
      return {
        ...draft,
        content: trimmed
      };
    }
  }
  return {
    ...draft,
    content: trimmed
  };
}

function inferDocTypeWritingPattern(documentType = "software_requirement", sectionHints = []) {
  if (documentType === "detail_design") {
    return `详细设计条目优先围绕功能分解、接口/状态、内部变量与边界保护展开，章节线索参考：${sectionHints.join(" / ") || "功能分解 -> 接口 -> 状态"}`;
  }
  if (documentType === "hil_test_case") {
    return "HIL 用例必须显式写出前置条件、测试步骤、预期结果和判定标准，避免把实现细节直接写成测试动作。";
  }
  return `软件需求优先写清条件、动作、默认/恢复路径与边界限制，章节线索参考：${sectionHints.join(" / ") || "条件 -> 动作 -> 限制"}`;
}

function inferGenericValidationRule(triggerCase) {
  return `当需求来自案例「${triggerCase.name}」这类控制逻辑场景时，校验规则必须显式检查触发条件、执行行为、默认或恢复路径、边界限制和来源追溯是否完整。`;
}

function inferDomainRuleHint(triggerCase, sectionHints = []) {
  return {
    domain: normalizeKey(triggerCase.domain || "embedded_vcu"),
    documentType: triggerCase.documentType || "software_requirement",
    sectionHints,
    writingPattern: "优先拆解进入条件 / 执行动作 / 退出或恢复条件，并保留阈值、滞回、优先级和默认路径。",
    targetStyle: "shared_vcu_knowhow",
    sourceBasis: [triggerCase.id]
  };
}

function firstGoldenExample(triggerCase) {
  const golden = triggerCase.goldenStructured || { requirements: [] };
  const first = (golden.requirements || [])[0] || {};
  return {
    requirementId: first.requirementId || `${normalizeKey(triggerCase.subdomain || triggerCase.domain || "skill")}-EX-001`,
    topic: first.topic || first.title || triggerCase.name,
    sectionNumber: first.sectionNumber || "",
    sectionTitle: first.sectionTitle || triggerCase.subdomain || triggerCase.domain || "",
    requirementType: first.requirementType || "functional",
    preferredTitle: first.preferredTitle || first.title || triggerCase.name,
    requirementText: first.requirementText || "",
    signals: first.signals || [],
    references: first.references || [],
    keywords: first.keywords || []
  };
}

export class SkillRefinementService {
  constructor() {
    this.caseService = new BenchmarkCaseService();
    this.evaluationService = new BenchmarkEvaluationService();
    this.skillBundleService = new SkillBundleService();
    this.auditService = new SkillRefinementAuditService();
    this.registryService = new SkillRegistryService();
  }

  async createRun({ triggerCaseId, baseBundleId = "" }) {
    const triggerCase = await this.caseService.ensureAlignment(triggerCaseId);
    if (!triggerCase) {
      throw new Error("Trigger case not found");
    }

    const activeBundle = await this.skillBundleService.getActiveBundle();
    const baselineBundleId = baseBundleId || activeBundle?.id || "";
    const baselineAssessment = await this.evaluationService.evaluateCaseAgainstBundle({
      benchmarkCase: triggerCase,
      bundleId: baselineBundleId
    });
    const proposalItems = await this.buildProposalItems(triggerCase, baselineBundleId);
    const run = {
      id: randomUUID(),
      triggerCaseId: triggerCase.id,
      baseBundleId: baselineBundleId,
      candidateBundleId: "",
      proposalModelVersion: 2,
      status: "proposal_review",
      proposalItems,
      proposalSummary: `Refined ${proposalItems.length} layered skill proposals from benchmark case ${triggerCase.name}.`,
      initialAssessment: {
        generatedRequirements: baselineAssessment.generated.requirements,
        scoreResult: baselineAssessment.scoreResult
      },
      stageStatus: {
        case_ingested: "completed",
        golden_structured: "completed",
        active_skill_scored: "completed",
        proposal_generated: "completed",
        candidate_benchmark: "idle",
        decision: "waiting_for_proposal_review"
      },
      evaluationRunId: "",
      decisionHints: null,
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getRunPath(run.id), run);
    await this.caseService.updateRunSummary(triggerCase.id, {
      lastRunId: run.id,
      lastEvaluationSummary: {
        overallScore: baselineAssessment.scoreResult.overallScore,
        overallScoreDelta: baselineAssessment.scoreResult.overallScoreDelta,
        dimensionScores: baselineAssessment.scoreResult.dimensionScores
      },
      status: "proposal_review"
    });
    await this.auditService.append("runs", {
      action: "run_created",
      runId: run.id,
      triggerCaseId,
      baseBundleId: baselineBundleId
    });
    return run;
  }

  async getRun(runId) {
    return readJson(getRunPath(runId));
  }

  async reviewProposalItem(runId, proposalItemId, payload = {}) {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error("Run not found");
    }
    if (run.status === "approved" || run.status === "rejected") {
      throw new Error("Run has already reached a final decision");
    }

    const item = (run.proposalItems || []).find((entry) => entry.id === proposalItemId);
    if (!item) {
      throw new Error("Proposal item not found");
    }

    item.status = payload.status || item.status || "pending";
    if (payload.editedPayload && typeof payload.editedPayload === "object") {
      item.editedPayload = {
        ...item,
        ...payload.editedPayload
      };
      item.editedContent = String(payload.editedPayload.editedContent || payload.editedPayload.after || item.editedContent || "");
    } else if (typeof payload.editedContent === "string") {
      item.editedContent = payload.editedContent.trim();
      item.editedPayload = {
        ...item,
        newItemDraft: hydrateDraftFromEditedContent(item.kind, payload.editedContent, item.newItemDraft),
        after: payload.editedContent.trim()
      };
    }
    if (payload.targetLayer || payload.targetProfileKey || payload.targetSkillCode || payload.kind || payload.title) {
      item.editedPayload = {
        ...item,
        ...(item.editedPayload || {}),
        targetLayer: payload.targetLayer || item.targetLayer,
        targetProfileKey: payload.targetProfileKey || item.targetProfileKey,
        targetSkillCode: payload.targetSkillCode || item.targetSkillCode,
        kind: payload.kind || item.kind,
        title: payload.title || item.title
      };
    }
    item.updatedAt = now();

    run.updatedAt = now();
    await writeJson(getRunPath(run.id), run);
    await this.auditService.append("runs", {
      action: "proposal_reviewed",
      runId,
      proposalItemId,
      status: item.status
    });
    return item;
  }

  async buildCandidate(runId) {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error("Run not found");
    }
    if (run.status === "approved" || run.status === "rejected") {
      throw new Error("Run has already reached a final decision");
    }

    const acceptedItems = (run.proposalItems || [])
      .filter((item) => item.status === "accepted" || item.status === "edited")
      .map((item) => ({
        ...item,
        ...(item.editedPayload || {}),
        newItemDraft: hydrateDraftFromEditedContent(item.kind, item.editedContent || item.after || "", item.newItemDraft || {})
      }));
    if (!acceptedItems.length) {
      throw new Error("No accepted proposal items");
    }

    if (run.candidateBundleId) {
      const previousBundle = await this.skillBundleService.getBundle(run.candidateBundleId);
      if (previousBundle?.status === "candidate") {
        await this.skillBundleService.rejectBundle(previousBundle.id);
      }
    }

    const triggerCase = await this.caseService.getCase(run.triggerCaseId);
    if (!triggerCase) {
      throw new Error("Trigger case not found");
    }

    const candidateBundle = await this.skillBundleService.createCandidateBundle({
      baseBundleId: run.baseBundleId,
      proposal: {
        summary: run.proposalSummary
      },
      proposalItems: acceptedItems,
      createdFromCaseIds: [run.triggerCaseId]
    });

    const benchmarkCases = await this.caseService.listCertifiedCases();
    const effectiveCases = benchmarkCases.length ? benchmarkCases : [triggerCase];
    const evaluation = await this.evaluationService.evaluateBundle({
      bundleId: candidateBundle.id,
      baselineBundleId: run.baseBundleId,
      cases: effectiveCases
    });

    await this.skillBundleService.updateBundleEvaluationSummary(candidateBundle.id, {
      overallScoreAvg: evaluation.aggregateScores.overallScoreAvg,
      baselineOverallScoreAvg: evaluation.aggregateScores.baselineOverallScoreAvg,
      decisionHints: evaluation.decisionHints
    });

    run.candidateBundleId = candidateBundle.id;
    run.evaluationRunId = evaluation.id;
    run.decisionHints = evaluation.decisionHints;
    run.status = "awaiting_decision";
    run.stageStatus = {
      ...run.stageStatus,
      candidate_benchmark: "completed",
      decision: "waiting_for_manual_decision"
    };
    run.updatedAt = now();

    await writeJson(getRunPath(run.id), run);
    for (const result of evaluation.caseResults) {
      await this.caseService.updateRunSummary(result.caseId, {
        lastRunId: run.id,
        lastEvaluationSummary: {
          overallScore: result.overallScore,
          overallScoreDelta: result.overallScoreDelta,
          dimensionScores: result.dimensionScores
        },
        status: "awaiting_decision"
      });
    }

    await this.auditService.append("runs", {
      action: "candidate_built",
      runId,
      candidateBundleId: candidateBundle.id,
      evaluationRunId: evaluation.id
    });

    return {
      run,
      candidateBundle,
      evaluation
    };
  }

  async approveRun(runId) {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error("Run not found");
    }
    if (!run.candidateBundleId || !run.evaluationRunId) {
      throw new Error("Candidate bundle has not been built");
    }

    const evaluation = await this.evaluationService.getEvaluation(run.evaluationRunId);
    const approvedBundle = await this.skillBundleService.approveBundle(run.candidateBundleId, {
      overallScoreAvg: evaluation?.aggregateScores?.overallScoreAvg || 0,
      baselineOverallScoreAvg: evaluation?.aggregateScores?.baselineOverallScoreAvg || 0,
      decisionHints: evaluation?.decisionHints || null
    });

    run.status = "approved";
    run.stageStatus = {
      ...run.stageStatus,
      decision: "approved"
    };
    run.updatedAt = now();
    await writeJson(getRunPath(run.id), run);
    if (evaluation?.caseIds?.length) {
      for (const caseId of evaluation.caseIds) {
        await this.caseService.updateRunSummary(caseId, {
          lastRunId: run.id,
          status: "approved"
        });
      }
    } else {
      await this.caseService.updateRunSummary(run.triggerCaseId, {
        lastRunId: run.id,
        status: "approved"
      });
    }
    await this.auditService.append("runs", {
      action: "candidate_approved",
      runId,
      candidateBundleId: run.candidateBundleId
    });
    return {
      run,
      bundle: approvedBundle,
      evaluation
    };
  }

  async rejectRun(runId) {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    let rejectedBundle = null;
    if (run.candidateBundleId) {
      rejectedBundle = await this.skillBundleService.rejectBundle(run.candidateBundleId);
    }
    run.status = "rejected";
    run.stageStatus = {
      ...run.stageStatus,
      decision: "rejected"
    };
    run.updatedAt = now();
    await writeJson(getRunPath(run.id), run);
    if (run.evaluationRunId) {
      const evaluation = await this.evaluationService.getEvaluation(run.evaluationRunId);
      if (evaluation?.caseIds?.length) {
        for (const caseId of evaluation.caseIds) {
          await this.caseService.updateRunSummary(caseId, {
            lastRunId: run.id,
            status: "rejected"
          });
        }
      }
    } else {
      await this.caseService.updateRunSummary(run.triggerCaseId, {
        lastRunId: run.id,
        status: "rejected"
      });
    }
    await this.auditService.append("runs", {
      action: "candidate_rejected",
      runId,
      candidateBundleId: run.candidateBundleId || ""
    });
    return {
      run,
      bundle: rejectedBundle
    };
  }

  async buildProposalItems(triggerCase, baseBundleId = "") {
    const bundle = baseBundleId ? await this.skillBundleService.getBundle(baseBundleId) : await this.skillBundleService.getActiveBundle();
    const skillDir = await this.skillBundleService.getSkillDir(bundle?.id || baseBundleId);
    const golden = triggerCase.goldenStructured || { requirements: [], sections: [] };
    const sectionHints = unique((golden.sections || []).map((item) => `${item.sectionNumber} ${item.sectionTitle}`.trim()).filter(Boolean));
    const documentType = triggerCase.documentType || "software_requirement";
    const domainKey = normalizeKey(triggerCase.domain || "embedded_vcu");
    const moduleKey = normalizeKey(triggerCase.subdomain || triggerCase.domain || "module");
    const goodExample = firstGoldenExample(triggerCase);
    const basedOnCaseIds = [triggerCase.id];
    const createdAt = now();

    const drafts = [
      {
        layer: "generic",
        profileKey: "generic",
        kind: "validation_rule",
        title: `校验 ${triggerCase.name} 同类控制逻辑的完整性`,
        content: inferGenericValidationRule(triggerCase),
        structuredPayload: null,
        category: "validation",
        reason: "把当前案例暴露出来的完整性检查点回收到 generic 层，避免后续同类需求漏写条件、默认路径或边界限制。",
        scopeRationale: "这是跨文档、跨模块都成立的校验口径，不依赖当前功能专有对象。",
        scopeConfidence: 0.64
      },
      {
        layer: "docType",
        profileKey: documentType,
        kind: "writing_rule",
        title: `${documentType} 写作骨架补充`,
        content: inferDocTypeWritingPattern(documentType, sectionHints),
        structuredPayload: null,
        category: "writing",
        reason: "把当前案例中的体裁性写法沉淀到 docType 层，而不是继续挤到 module 层。",
        scopeRationale: "该规则主要约束产物体裁的组织方式，跨模块可复用。",
        scopeConfidence: 0.78
      },
      {
        layer: "domain",
        profileKey: domainKey,
        kind: "rule_hint",
        title: `${domainKey} 共享控制写法提示`,
        content: "",
        structuredPayload: inferDomainRuleHint(triggerCase, sectionHints),
        category: "domain_knowledge",
        reason: "把当前案例里可泛化到 VCU 域的控制逻辑写法，沉淀到 domain 层。",
        scopeRationale: "去掉模块名后仍然成立，更像 VCU 共享 know-how 而不是模块专属骨架。",
        scopeConfidence: 0.72
      },
      {
        layer: "module",
        profileKey: moduleKey,
        kind: "good_example",
        title: `${moduleKey} few-shot 正例补充`,
        content: goodExample.requirementText || "",
        structuredPayload: goodExample,
        category: "good_example",
        reason: "把当前案例中的模块专属 few-shot 留在 module 层，供后续同模块生成直接参考。",
        scopeRationale: "包含明显的模块对象、主题和章节信息，应保留在 module 层。",
        scopeConfidence: 0.9
      }
    ];

    const proposalItems = [];
    for (const draft of drafts) {
      const target = await this.registryService.findBestTarget(
        {
          layer: draft.layer,
          profileKey: draft.profileKey,
          kind: draft.kind,
          query: `${draft.title}\n${draft.content}\n${JSON.stringify(draft.structuredPayload || {})}`
        },
        skillDir
      );
      const editableContent = buildEditableContent(draft.kind, draft.content, draft.structuredPayload);
      proposalItems.push({
        id: randomUUID(),
        category: draft.category || proposalCategoryForKind(draft.kind),
        action: target ? "modify_skill_item" : "add_skill_item",
        targetSkillCode: target?.skillCode || "",
        targetLayer: draft.layer,
        targetProfileKey: draft.profileKey,
        kind: draft.kind,
        targetFile: kindToTargetFile(draft.kind),
        title: draft.title,
        before: target ? buildEditableContent(target.kind, target.content, target.structuredPayload) : "",
        after: editableContent,
        proposedContent: editableContent,
        editedContent: editableContent,
        newItemDraft: {
          title: draft.title,
          content: draft.content,
          structuredPayload: draft.structuredPayload,
          rules: []
        },
        scopeRationale: draft.scopeRationale,
        scopeConfidence: draft.scopeConfidence,
        reason: draft.reason,
        basedOnCaseIds,
        status: "pending",
        editedPayload: null,
        createdAt,
        updatedAt: createdAt
      });
    }

    return proposalItems;
  }
}
