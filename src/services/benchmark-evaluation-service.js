import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { ValidationService } from "./validation-service.js";

function now() {
  return new Date().toISOString();
}

function getEvaluationPath(evaluationId) {
  return path.join(config.skillRefinementEvaluationDir, `${evaluationId}.json`);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function tokenize(text) {
  return unique(
    String(text)
      .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  );
}

function overlapRatio(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const right = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => right.has(token)).length;
  return overlap / Math.max(leftTokens.length, rightTokens.length);
}

function extractSectionNumbers(requirements) {
  return unique(
    requirements.flatMap((item) => {
      const matches = `${item.title || ""} ${item.requirementText || ""}`.match(/\d+(?:\.\d+)*/g) || [];
      return matches.filter((match) => match.includes("."));
    })
  );
}

function average(numbers) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
}

function round(value) {
  return Number(value.toFixed(2));
}

export class BenchmarkEvaluationService {
  constructor() {
    this.extractionService = new ExtractionService();
    this.llmService = new LlmService();
    this.validationService = new ValidationService();
    this.skillBundleService = new SkillBundleService();
  }

  async evaluateBundle({ bundleId, baselineBundleId, cases }) {
    const evaluationId = randomUUID();
    const caseResults = [];

    for (const benchmarkCase of cases) {
      const candidateGenerated = await this.generateForCase(benchmarkCase, bundleId);
      const baselineGenerated = baselineBundleId ? await this.generateForCase(benchmarkCase, baselineBundleId) : null;
      caseResults.push(this.scoreCase(benchmarkCase, candidateGenerated, baselineGenerated));
    }

    const aggregateScores = this.aggregateCaseResults(caseResults);
    const decisionHints = {
      overallScoreAvg: aggregateScores.overallScoreAvg,
      baselineOverallScoreAvg: aggregateScores.baselineOverallScoreAvg,
      overallScoreDelta: round(aggregateScores.overallScoreAvg - aggregateScores.baselineOverallScoreAvg),
      criticalCaseFailCount: aggregateScores.criticalCaseFailCount,
      passesPublishGate:
        aggregateScores.overallScoreAvg >= aggregateScores.baselineOverallScoreAvg &&
        aggregateScores.criticalCaseFailCount === 0 &&
        aggregateScores.lowTraceabilityCaseCount === 0
    };

    const evaluationRun = {
      id: evaluationId,
      bundleId,
      baselineBundleId,
      caseIds: cases.map((item) => item.id),
      caseResults,
      aggregateScores,
      decisionHints,
      createdAt: now()
    };

    await writeJson(getEvaluationPath(evaluationId), evaluationRun);
    return evaluationRun;
  }

  async getEvaluation(evaluationId) {
    return readJson(getEvaluationPath(evaluationId));
  }

  async evaluateCaseAgainstBundle({ benchmarkCase, bundleId, baselineBundleId = "" }) {
    const candidateGenerated = await this.generateForCase(benchmarkCase, bundleId);
    const baselineGenerated = baselineBundleId
      ? await this.generateForCase(benchmarkCase, baselineBundleId)
      : null;

    return {
      generated: candidateGenerated,
      scoreResult: this.scoreCase(benchmarkCase, candidateGenerated, baselineGenerated)
    };
  }

  async generateForCase(benchmarkCase, skillBundleId) {
    const extractions = await this.extractionService.extractFiles({ files: benchmarkCase.inputFiles });
    const requirements = await this.llmService.generateRequirements(
      {
        name: benchmarkCase.name,
        description: benchmarkCase.notes,
        language: "zh-CN"
      },
      extractions,
      { skillBundleId }
    );
    const domainKnowledge = await this.skillBundleService.getDomainKnowledge(skillBundleId);
    const conflicts = this.validationService.validate(requirements, { domainKnowledge });
    return { extractions, requirements, conflicts };
  }

  scoreCase(benchmarkCase, candidateGenerated, baselineGenerated) {
    const golden = benchmarkCase.goldenStructured.requirements || [];
    const generated = candidateGenerated.requirements || [];
    const baseline = baselineGenerated?.requirements || [];
    const candidateValidation = candidateGenerated.conflicts || this.validationService.validate(generated, { documentType: benchmarkCase.documentType });
    const baselineValidation = baselineGenerated?.conflicts || this.validationService.validate(baseline, { documentType: benchmarkCase.documentType });

    const sectionStructureScore = this.scoreSectionStructure(benchmarkCase.goldenStructured, generated);
    const requirementCoverageScore = this.scoreCoverage(golden, generated);
    const logicBranchScore = this.scoreLogic(golden, generated);
    const signalReferenceScore = this.scoreSignalsAndReferences(golden, generated);
    const traceabilityScore = this.scoreTraceability(generated);
    const writingQualityScore = this.scoreWritingQuality(candidateValidation, generated);
    const hallucinationPenalty = this.scoreHallucinationPenalty(golden, generated);
    const missingCriticalItemPenalty = this.scoreMissingCriticalPenalty(golden, generated);

    const overallScore = round(
      sectionStructureScore +
        requirementCoverageScore +
        logicBranchScore +
        signalReferenceScore +
        traceabilityScore +
        writingQualityScore -
        hallucinationPenalty -
        missingCriticalItemPenalty
    );

    const dimensionScores = {
      section_structure_score: sectionStructureScore,
      requirement_coverage_score: requirementCoverageScore,
      logic_branch_score: logicBranchScore,
      signal_reference_score: signalReferenceScore,
      traceability_score: traceabilityScore,
      writing_quality_score: writingQualityScore
    };

    const baselineDimensionScores = baseline.length
      ? {
          section_structure_score: this.scoreSectionStructure(benchmarkCase.goldenStructured, baseline),
          requirement_coverage_score: this.scoreCoverage(golden, baseline),
          logic_branch_score: this.scoreLogic(golden, baseline),
          signal_reference_score: this.scoreSignalsAndReferences(golden, baseline),
          traceability_score: this.scoreTraceability(baseline),
          writing_quality_score: this.scoreWritingQuality(baselineValidation, baseline)
        }
      : {
          section_structure_score: 0,
          requirement_coverage_score: 0,
          logic_branch_score: 0,
          signal_reference_score: 0,
          traceability_score: 0,
          writing_quality_score: 0
        };

    const baselineOverallScore = baseline.length
      ? round(
          baselineDimensionScores.section_structure_score +
            baselineDimensionScores.requirement_coverage_score +
            baselineDimensionScores.logic_branch_score +
            baselineDimensionScores.signal_reference_score +
            baselineDimensionScores.traceability_score +
            baselineDimensionScores.writing_quality_score -
            this.scoreHallucinationPenalty(golden, baseline) -
            this.scoreMissingCriticalPenalty(golden, baseline)
        )
      : 0;

    const improvements = [];
    const regressions = [];
    if (overallScore > baselineOverallScore) {
      improvements.push(`总体得分从 ${baselineOverallScore} 提升到 ${overallScore}`);
    }
    if (overallScore < baselineOverallScore) {
      regressions.push(`总体得分从 ${baselineOverallScore} 下降到 ${overallScore}`);
    }
    if (traceabilityScore < 10) {
      regressions.push("来源追溯得分低于安全阈值");
    }

    return {
      caseId: benchmarkCase.id,
      overallScore,
      baselineOverallScore,
      overallScoreDelta: round(overallScore - baselineOverallScore),
      dimensionScores,
      baselineDimensionScores,
      penalties: {
        hallucination_penalty: hallucinationPenalty,
        missing_critical_item_penalty: missingCriticalItemPenalty
      },
      regressions,
      improvements,
      generatedRequirementCount: generated.length,
      baselineRequirementCount: baseline.length
    };
  }

  scoreSectionStructure(goldenStructured, generated) {
    const goldenSections = unique((goldenStructured.sections || []).map((item) => item.sectionNumber).filter(Boolean));
    if (!goldenSections.length) return 20;
    const generatedSections = extractSectionNumbers(generated);
    const coverage = goldenSections.filter((item) => generatedSections.includes(item)).length / goldenSections.length;
    return round(coverage * 20);
  }

  scoreCoverage(golden, generated) {
    if (!golden.length) return 20;
    const scores = golden.map((gold) => {
      const goldTokens = tokenize(`${gold.topic || ""} ${gold.requirementText || ""}`);
      const best = Math.max(
        0,
        ...generated.map((item) => overlapRatio(goldTokens, tokenize(`${item.title || ""} ${item.requirementText || ""}`)))
      );
      return best;
    });
    return round(average(scores) * 20);
  }

  scoreLogic(golden, generated) {
    if (!golden.length) return 20;
    const scores = golden.map((gold) => {
      const logicTokens = tokenize(`${(gold.conditions || []).join(" ")} ${(gold.priorityOrder || []).join(" ")}`);
      if (!logicTokens.length) return 1;
      const best = Math.max(
        0,
        ...generated.map((item) => overlapRatio(logicTokens, tokenize(`${item.title || ""} ${item.requirementText || ""}`)))
      );
      return best;
    });
    return round(average(scores) * 20);
  }

  scoreSignalsAndReferences(golden, generated) {
    if (!golden.length) return 15;
    const scores = golden.map((gold) => {
      const targetTokens = [...(gold.signals || []), ...(gold.references || [])];
      if (!targetTokens.length) return 1;
      const best = Math.max(
        0,
        ...generated.map((item) => overlapRatio(targetTokens, tokenize(`${item.title || ""} ${item.requirementText || ""}`)))
      );
      return best;
    });
    return round(average(scores) * 15);
  }

  scoreTraceability(generated) {
    if (!generated.length) return 0;
    const withTraceability = generated.filter((item) => Array.isArray(item.sourceRefs) && item.sourceRefs.length > 0).length;
    return round((withTraceability / generated.length) * 15);
  }

  scoreWritingQuality(conflicts, generated) {
    if (!generated.length) return 0;
    const vagueCount = conflicts.filter((item) => item.code === "vague-language").length;
    const missingTextCount = conflicts.filter((item) => item.code === "missing-text").length;
    const namingRiskCount = conflicts.filter((item) =>
      ["code-style-signal", "non-canonical-signal", "unsupported-expansion"].includes(item.code)
    ).length;
    const penalty = vagueCount * 2 + missingTextCount * 3 + namingRiskCount * 2;
    return round(Math.max(0, 10 - penalty));
  }

  scoreHallucinationPenalty(golden, generated) {
    if (!generated.length) return 0;
    const excessiveCount = Math.max(0, generated.length - golden.length * 2);
    return round(Math.min(15, excessiveCount * 2));
  }

  scoreMissingCriticalPenalty(golden, generated) {
    if (!golden.length) return 0;
    const missing = golden.filter((gold) => {
      const goldTokens = tokenize(`${gold.topic || ""} ${gold.requirementText || ""}`);
      const best = Math.max(
        0,
        ...generated.map((item) => overlapRatio(goldTokens, tokenize(`${item.title || ""} ${item.requirementText || ""}`)))
      );
      return best < 0.2;
    }).length;
    return round(Math.min(20, missing * 4));
  }

  aggregateCaseResults(caseResults) {
    const metricKeys = [
      "section_structure_score",
      "requirement_coverage_score",
      "logic_branch_score",
      "signal_reference_score",
      "traceability_score",
      "writing_quality_score"
    ];
    const dimensionAverages = Object.fromEntries(
      metricKeys.map((key) => [key, round(average(caseResults.map((item) => item.dimensionScores?.[key] || 0)))])
    );
    const baselineDimensionAverages = Object.fromEntries(
      metricKeys.map((key) => [key, round(average(caseResults.map((item) => item.baselineDimensionScores?.[key] || 0)))])
    );
    const dimensionDeltas = Object.fromEntries(
      metricKeys.map((key) => [key, round((dimensionAverages[key] || 0) - (baselineDimensionAverages[key] || 0))])
    );

    return {
      overallScoreAvg: round(average(caseResults.map((item) => item.overallScore))),
      baselineOverallScoreAvg: round(average(caseResults.map((item) => item.baselineOverallScore))),
      criticalCaseFailCount: caseResults.filter((item) => item.overallScore < 60).length,
      lowTraceabilityCaseCount: caseResults.filter((item) => item.dimensionScores.traceability_score < 8).length,
      dimensionAverages,
      baselineDimensionAverages,
      dimensionDeltas,
      topImprovements: caseResults
        .filter((item) => item.overallScoreDelta > 0)
        .sort((a, b) => b.overallScoreDelta - a.overallScoreDelta)
        .slice(0, 3)
        .map((item) => ({ caseId: item.caseId, delta: item.overallScoreDelta })),
      topRegressions: caseResults
        .filter((item) => item.overallScoreDelta < 0)
        .sort((a, b) => a.overallScoreDelta - b.overallScoreDelta)
        .slice(0, 3)
        .map((item) => ({ caseId: item.caseId, delta: item.overallScoreDelta }))
    };
  }
}
