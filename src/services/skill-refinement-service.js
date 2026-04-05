import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { BenchmarkCaseService } from "./benchmark-case-service.js";
import { BenchmarkEvaluationService } from "./benchmark-evaluation-service.js";
import { SkillRefinementAuditService } from "./skill-refinement-audit-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";

function now() {
  return new Date().toISOString();
}

function getRunPath(runId) {
  return path.join(config.skillRefinementRunDir, `${runId}.json`);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function ensureEditableContent(item, payload = {}) {
  if (typeof payload.editedContent === "string" && payload.editedContent.trim()) {
    return payload.editedContent.trim();
  }
  if (typeof payload.proposedContent === "string" && payload.proposedContent.trim()) {
    return payload.proposedContent.trim();
  }
  return item.editedContent || item.proposedContent || "";
}

export class SkillRefinementService {
  constructor() {
    this.caseService = new BenchmarkCaseService();
    this.evaluationService = new BenchmarkEvaluationService();
    this.skillBundleService = new SkillBundleService();
    this.auditService = new SkillRefinementAuditService();
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
    const proposal = this.buildProposal(triggerCase);
    const proposalItems = this.buildProposalItems(triggerCase, proposal);
    const run = {
      id: randomUUID(),
      triggerCaseId: triggerCase.id,
      baseBundleId: baselineBundleId,
      candidateBundleId: "",
      status: "proposal_review",
      proposalItems,
      proposalSummary: proposal.summary,
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
    item.editedContent = ensureEditableContent(item, payload);
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

    const acceptedItems = (run.proposalItems || []).filter((item) =>
      item.status === "accepted" || item.status === "edited"
    );
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

    const materializedProposal = this.materializeProposalFromItems(acceptedItems);
    const candidateBundle = await this.skillBundleService.createCandidateBundle({
      baseBundleId: run.baseBundleId,
      proposal: {
        ...materializedProposal,
        summary: run.proposalSummary
      },
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

  buildProposal(triggerCase) {
    const golden = triggerCase.goldenStructured || { requirements: [], sections: [] };
    const sectionHints = unique((golden.sections || []).map((item) => `${item.sectionNumber} ${item.sectionTitle}`.trim()));
    const requirementExamples = (golden.requirements || []).slice(0, 8).map((item) => ({
      requirementId: item.requirementId,
      topic: item.topic,
      sectionNumber: item.sectionNumber,
      requirementType: item.requirementType,
      requirementText: item.requirementText,
      signals: item.signals || [],
      references: item.references || [],
      keywords: item.keywords || []
    }));

    const writingRules = [
      `- 在 ${triggerCase.domain}/${triggerCase.subdomain || "通用子域"} 场景下，优先采用多级章节组织需求，例如：${sectionHints.join(" -> ") || "章节号 -> 子章节号"}。`,
      "- 对前轴/后轴或其他物理对象对称的能力，优先拆分为结构对称的子章节。",
      "- 先写激活标志位判断，再写计算/仲裁逻辑；每条需求尽量只承载一个核心逻辑主题。",
      "- 计算类需求显式写出优先级顺序、条件分支、默认路径和边界限制。"
    ].join("\n");

    const extractionRules = [
      "- 优先抽取激活标志位、阈值、优先级顺序、模式状态、min/max 边界限制。",
      "- 对 C 文件中的条件分支、赋值关系和前后轴对称变量建立同类候选事实。",
      "- 对系统需求中的条件项、否则分支和优先级排序做结构化切分。"
    ].join("\n");

    const validationRules = [
      "- 校验章节层级是否完整，是否按对称对象展开。",
      "- 校验需求是否保留关键信号名、变量名和内部引用编号。",
      "- 校验需求是否缺失来源追溯、默认路径或边界限制。"
    ].join("\n");

    const goodExamples = requirementExamples
      .map(
        (item, index) =>
          `${index + 1}. ${item.requirementText || item.topic}\n原因：来自案例“${triggerCase.name}”，保留了章节、条件/分支、信号与引用信息。`
      )
      .join("\n\n");

    return {
      summary: `Refined from benchmark case ${triggerCase.name} (${triggerCase.id}).`,
      appendWritingRules: writingRules,
      appendExtractionRules: extractionRules,
      appendValidationRules: validationRules,
      appendGoodExamples: goodExamples,
      domainKnowledge: {
        examples: requirementExamples,
        ruleHints: [
          {
            domain: triggerCase.domain,
            subdomain: triggerCase.subdomain,
            sectionHints,
            generatedFromCaseId: triggerCase.id
          }
        ],
        antiPatterns: []
      }
    };
  }

  buildProposalItems(triggerCase, proposal) {
    const basedOnCaseIds = [triggerCase.id];
    const createdAt = now();

    return [
      {
        id: randomUUID(),
        category: "writing",
        targetFile: "requirement_writing.md",
        title: `补充 ${triggerCase.subdomain || triggerCase.domain} 写作规则`,
        proposedContent: proposal.appendWritingRules,
        editedContent: proposal.appendWritingRules,
        reason: "从本次优质范例中抽取出章节组织、句式与边界写法模式。",
        basedOnCaseIds,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: randomUUID(),
        category: "extraction",
        targetFile: "requirement_extraction.md",
        title: `补充 ${triggerCase.subdomain || triggerCase.domain} 抽取规则`,
        proposedContent: proposal.appendExtractionRules,
        editedContent: proposal.appendExtractionRules,
        reason: "从系统需求与模型代码的对齐中提炼更稳定的事实抽取策略。",
        basedOnCaseIds,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: randomUUID(),
        category: "validation",
        targetFile: "requirement_validation.md",
        title: `补充 ${triggerCase.subdomain || triggerCase.domain} 校验规则`,
        proposedContent: proposal.appendValidationRules,
        editedContent: proposal.appendValidationRules,
        reason: "从人工答案的结构特征中提炼出应重点检查的约束。",
        basedOnCaseIds,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: randomUUID(),
        category: "good_example",
        targetFile: "examples/good_examples.md",
        title: `追加 ${triggerCase.name} 的正例样式`,
        proposedContent: proposal.appendGoodExamples,
        editedContent: proposal.appendGoodExamples,
        reason: "将当前人工优质范例中的高质量写法追加到正例库。",
        basedOnCaseIds,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: randomUUID(),
        category: "domain_knowledge",
        targetFile: "domain-knowledge.json",
        title: `更新 ${triggerCase.subdomain || triggerCase.domain} 领域知识`,
        proposedContent: JSON.stringify(proposal.domainKnowledge, null, 2),
        editedContent: JSON.stringify(proposal.domainKnowledge, null, 2),
        reason: "把章节提示、few-shot 样例和领域反模式纳入 bundle 领域知识。",
        basedOnCaseIds,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      }
    ];
  }

  materializeProposalFromItems(items) {
    const proposal = {
      appendWritingRules: "",
      appendExtractionRules: "",
      appendValidationRules: "",
      appendGoodExamples: "",
      domainKnowledge: {
        examples: [],
        ruleHints: [],
        antiPatterns: []
      }
    };

    for (const item of items) {
      const content = (item.editedContent || item.proposedContent || "").trim();
      if (!content) {
        continue;
      }

      if (item.targetFile === "requirement_writing.md") {
        proposal.appendWritingRules = content;
      } else if (item.targetFile === "requirement_extraction.md") {
        proposal.appendExtractionRules = content;
      } else if (item.targetFile === "requirement_validation.md") {
        proposal.appendValidationRules = content;
      } else if (item.targetFile === "examples/good_examples.md") {
        proposal.appendGoodExamples = content;
      } else if (item.targetFile === "domain-knowledge.json") {
        try {
          proposal.domainKnowledge = JSON.parse(content);
        } catch (_error) {
          proposal.domainKnowledge = {
            examples: [],
            ruleHints: [],
            antiPatterns: []
          };
        }
      }
    }

    return proposal;
  }
}
