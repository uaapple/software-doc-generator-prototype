import path from "node:path";
import { readFile } from "node:fs/promises";
import { PdfExtractor } from "./pdf-extractor.js";
import { resolveStoredFilePath } from "./storage.js";

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

function extractSignals(text) {
  return unique(String(text).match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g) || []);
}

function extractReferences(text) {
  return unique(String(text).match(/SMiVCU-\d+/g) || []);
}

function normalizeRequirement(item, index, sections = []) {
  const text = item.requirementText || item.rawText || item.text || "";
  const topic = item.topic || item.title || item.requirementId || `Requirement ${index + 1}`;
  const sectionNumber = item.sectionNumber || item.section || inferSectionNumber(item, sections) || "";
  const sectionTitle = item.sectionTitle || inferSectionTitle(sectionNumber, sections) || "";
  const signals = unique([...(item.signals || []), ...extractSignals(text)]);
  const references = unique([
    ...(item.references || []),
    ...extractReferences(text).filter((ref) => ref !== item.requirementId)
  ]);
  const conditions = item.conditions || item.triggerConditionsAnyOf || [];
  const priorityOrder = item.priorityOrder || [];
  const keywords = unique([
    ...tokenize(topic),
    ...signals,
    ...conditions.flatMap((condition) => tokenize(condition)),
    ...priorityOrder.flatMap((entry) => tokenize(entry))
  ]);

  return {
    requirementId: item.requirementId || item.id || `GOLD-${String(index + 1).padStart(3, "0")}`,
    topic,
    title: item.title || topic,
    requirementType: item.requirementType || item.type || inferType(topic, text),
    sectionNumber,
    sectionTitle,
    requirementText: text,
    rawText: item.rawText || text,
    signals,
    references,
    conditions,
    priorityOrder,
    keywords
  };
}

function inferSectionNumber(item, sections) {
  if (typeof item.section === "string" && /\d/.test(item.section)) {
    const match = item.section.match(/\d+(?:\.\d+)*/);
    return match?.[0] || "";
  }
  if (sections.length === 1) {
    return sections[0].sectionNumber || "";
  }
  return "";
}

function inferSectionTitle(sectionNumber, sections) {
  return sections.find((item) => item.sectionNumber === sectionNumber)?.sectionTitle || "";
}

function inferType(topic, text) {
  const combined = `${topic} ${text}`;
  if (/激活|标志位|状态/i.test(combined)) return "activation_flag_logic";
  if (/计算|仲裁|优先级/i.test(combined)) return "torque_calculation_logic";
  if (/接口|信号|变量/i.test(combined)) return "interface";
  if (/故障|保护|异常/i.test(combined)) return "diagnostic";
  return "functional";
}

function normalizeSections(input = {}) {
  const sections = [];
  if (input.section?.sectionNumber || input.section?.sectionTitle) {
    sections.push({
      sectionNumber: input.section.sectionNumber || "",
      sectionTitle: input.section.sectionTitle || ""
    });
    for (const subsection of input.section.subsections || []) {
      sections.push({
        sectionNumber: subsection.sectionNumber || "",
        sectionTitle: subsection.sectionTitle || ""
      });
    }
  }
  return sections;
}

function normalizeFromJson(parsed) {
  const sections = normalizeSections(parsed);
  const requirements = (parsed.requirements || parsed.designRequirements || []).map((item, index) =>
    normalizeRequirement(item, index, sections)
  );

  return {
    title: parsed.title || "Golden Structured Document",
    sections,
    requirements,
    summary: parsed.derivedSummary?.mainTheme || parsed.summary || "",
    sourceFormat: "json"
  };
}

function parseSectionsFromMarkdown(lines) {
  const sections = [];
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (!headingMatch) continue;
    const sectionMatch = headingMatch[1].match(/(\d+(?:\.\d+)*)\s+(.+)/);
    if (!sectionMatch) continue;
    sections.push({
      sectionNumber: sectionMatch[1],
      sectionTitle: sectionMatch[2].trim()
    });
  }
  return sections;
}

function parseRequirementsFromMarkdown(lines, sections) {
  const requirements = [];
  let currentId = "";
  let currentTopic = "";
  let currentSectionNumber = "";
  let currentSectionTitle = "";
  let buffer = [];

  const flush = () => {
    if (!currentId) return;
    const rawText = buffer.join("\n").trim();
    requirements.push(
      normalizeRequirement(
        {
          requirementId: currentId,
          topic: currentTopic,
          title: currentTopic,
          sectionNumber: currentSectionNumber,
          sectionTitle: currentSectionTitle,
          requirementText: rawText
        },
        requirements.length,
        sections
      )
    );
    currentId = "";
    currentTopic = "";
    buffer = [];
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^#{1,4}\s+(\d+(?:\.\d+)*)\s+(.+)$/);
    if (sectionMatch) {
      currentSectionNumber = sectionMatch[1];
      currentSectionTitle = sectionMatch[2].trim();
      continue;
    }

    const requirementHeading = line.match(/^#{1,6}\s+(SMiVCU-\d+)(?:\s*[:：-]\s*(.+))?$/);
    if (requirementHeading) {
      flush();
      currentId = requirementHeading[1];
      currentTopic = requirementHeading[2]?.trim() || requirementHeading[1];
      continue;
    }

    const requirementInline = line.match(/(?:released,\s*)?(SMiVCU-\d+)\s*[-：:]\s*(.+)$/);
    if (requirementInline) {
      flush();
      currentId = requirementInline[1];
      currentTopic = requirementInline[2].trim();
      buffer = [requirementInline[2].trim()];
      continue;
    }

    if (currentId) {
      buffer.push(line);
    }
  }

  flush();
  return requirements;
}

function normalizeFromMarkdown(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections = parseSectionsFromMarkdown(lines);
  const requirements = parseRequirementsFromMarkdown(lines, sections);

  return {
    title: sections[0]?.sectionTitle || "Golden Structured Document",
    sections,
    requirements,
    summary: sections.length ? `解析得到 ${sections.length} 个章节与 ${requirements.length} 条需求。` : "",
    sourceFormat: "markdown"
  };
}

export class GoldenStructurerService {
  constructor() {
    this.pdfExtractor = new PdfExtractor();
  }

  async structure(fileRecord, options = {}) {
    const sourcePath = resolveStoredFilePath(fileRecord, options);
    const ext = path.extname(fileRecord.originalName || sourcePath).toLowerCase();
    if (ext === ".json") {
      const content = await readFile(sourcePath, "utf8");
      return normalizeFromJson(JSON.parse(content));
    }

    if (ext === ".md" || ext === ".txt") {
      const content = await readFile(sourcePath, "utf8");
      return normalizeFromMarkdown(content);
    }

    if (ext === ".pdf") {
      const result = await this.pdfExtractor.extract(fileRecord, options);
      return normalizeFromMarkdown(result.blocks.map((item) => item.text).join("\n"));
    }

    const content = await readFile(sourcePath, "utf8");
    return normalizeFromMarkdown(content);
  }
}
