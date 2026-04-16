import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { ExtractionService } from "./extraction-service.js";
import { GoldenStructurerService } from "./golden-structurer-service.js";
import { CaseAlignmentService } from "./case-alignment-service.js";
import { SkillRefinementAuditService } from "./skill-refinement-audit-service.js";
import { readJson, writeJson } from "./storage.js";

function now() {
  return new Date().toISOString();
}

function getCasePath(caseId) {
  return path.join(config.skillRefinementCaseDir, `${caseId}.json`);
}

function buildFileRecord(file, role) {
  return {
    id: randomUUID(),
    role,
    originalName: file.originalname,
    storedName: file.filename,
    relativePath: file.filename,
    absolutePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: now()
  };
}

export class BenchmarkCaseService {
  constructor() {
    this.extractionService = new ExtractionService();
    this.goldenStructurer = new GoldenStructurerService();
    this.caseAlignmentService = new CaseAlignmentService();
    this.auditService = new SkillRefinementAuditService();
  }

  async createCase(input, filesByField) {
    const caseId = randomUUID();
    const roleMap = {
      systemPdf: "system_pdf",
      modelPdf: "model_pdf",
      generatedCode: "generated_c",
      goldenSourceFile: "golden_source",
      referenceRequirementFile: "golden_source"
    };

    const inputFiles = [];
    let goldenSourceFile = null;
    for (const [fieldName, files] of Object.entries(filesByField)) {
      for (const file of files) {
        const record = buildFileRecord(file, roleMap[fieldName] || fieldName);
        if (record.role === "golden_source") {
          goldenSourceFile = record;
        } else {
          inputFiles.push(record);
        }
      }
    }

    if (!goldenSourceFile) {
      throw new Error("Missing golden source file");
    }

    const goldenStructured = await this.goldenStructurer.structure(goldenSourceFile, {
      baseDir: config.skillRefinementUploadDir,
      allowStoredNameFallback: true
    });
    const benchmarkCase = {
      id: caseId,
      name: input.name?.trim() || goldenStructured.title || `Benchmark Case ${caseId.slice(0, 8)}`,
      domain: input.domain?.trim() || "embedded_vcu",
      subdomain: input.subdomain?.trim() || "",
      status: "golden_structured",
      certified: false,
      archived: false,
      inputFiles,
      goldenSourceFile,
      goldenStructured,
      alignedExamples: [],
      lastEvaluationSummary: null,
      lastRunId: "",
      notes: input.notes?.trim() || "",
      createdBy: input.createdBy?.trim() || "system",
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getCasePath(caseId), benchmarkCase);
    await this.auditService.append("cases", {
      action: "case_created",
      caseId,
      name: benchmarkCase.name
    });
    return benchmarkCase;
  }

  async listCases() {
    const names = await fs.readdir(config.skillRefinementCaseDir);
    const cases = await Promise.all(
      names.filter((name) => name.endsWith(".json")).map((name) => readJson(path.join(config.skillRefinementCaseDir, name)))
    );
    return cases.filter(Boolean).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async listCertifiedCases() {
    const cases = await this.listCases();
    return cases.filter((item) => item.certified && !item.archived);
  }

  async getCase(caseId) {
    return readJson(getCasePath(caseId));
  }

  async saveCase(benchmarkCase) {
    benchmarkCase.updatedAt = now();
    await writeJson(getCasePath(benchmarkCase.id), benchmarkCase);
    return benchmarkCase;
  }

  async certifyCase(caseId) {
    const benchmarkCase = await this.getCase(caseId);
    if (!benchmarkCase) {
      throw new Error("Case not found");
    }

    benchmarkCase.certified = true;
    benchmarkCase.status = "certified";
    const saved = await this.saveCase(benchmarkCase);
    await this.auditService.append("cases", {
      action: "case_certified",
      caseId,
      name: saved.name
    });
    return saved;
  }

  async archiveCase(caseId) {
    const benchmarkCase = await this.getCase(caseId);
    if (!benchmarkCase) {
      throw new Error("Case not found");
    }
    benchmarkCase.archived = true;
    benchmarkCase.status = "archived";
    const saved = await this.saveCase(benchmarkCase);
    await this.auditService.append("cases", {
      action: "case_archived",
      caseId,
      name: saved.name
    });
    return saved;
  }

  async restoreCase(caseId) {
    const benchmarkCase = await this.getCase(caseId);
    if (!benchmarkCase) {
      throw new Error("Case not found");
    }
    benchmarkCase.archived = false;
    benchmarkCase.status = benchmarkCase.certified ? "certified" : "golden_structured";
    const saved = await this.saveCase(benchmarkCase);
    await this.auditService.append("cases", {
      action: "case_restored",
      caseId,
      name: saved.name
    });
    return saved;
  }

  async updateRunSummary(caseId, summary) {
    const benchmarkCase = await this.getCase(caseId);
    if (!benchmarkCase) {
      throw new Error("Case not found");
    }
    benchmarkCase.lastRunId = summary.lastRunId || benchmarkCase.lastRunId || "";
    benchmarkCase.lastEvaluationSummary = summary.lastEvaluationSummary || benchmarkCase.lastEvaluationSummary || null;
    benchmarkCase.status = summary.status || benchmarkCase.status;
    return this.saveCase(benchmarkCase);
  }

  async ensureAlignment(caseId) {
    const benchmarkCase = await this.getCase(caseId);
    if (!benchmarkCase) {
      throw new Error("Case not found");
    }
    if (benchmarkCase.alignedExamples?.length) {
      return benchmarkCase;
    }

    const extractions = await this.extractionService.extractFiles(
      { files: benchmarkCase.inputFiles },
      {
        fileBaseDir: config.skillRefinementUploadDir,
        allowStoredNameFallback: true
      }
    );
    benchmarkCase.alignedExamples = this.caseAlignmentService.align(benchmarkCase.goldenStructured, extractions);
    benchmarkCase.status = "example_aligned";
    const saved = await this.saveCase(benchmarkCase);
    await this.auditService.append("cases", {
      action: "case_aligned",
      caseId,
      alignedCount: saved.alignedExamples.length
    });
    return saved;
  }
}
