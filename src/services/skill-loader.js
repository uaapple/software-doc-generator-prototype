import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { SkillRegistryService, buildKnowledgeFromItems, renderMarkdownFromItems } from "./skill-registry-service.js";

const MARKDOWN_FILES = [
  "requirement_extraction.md",
  "requirement_writing.md",
  "requirement_validation.md",
  "examples/good_examples.md",
  "examples/bad_examples.md"
];
const KNOWLEDGE_FILE = "domain-knowledge.json";
const EMPTY_KNOWLEDGE = {
  version: 1,
  generationPriorities: [],
  examples: [],
  ruleHints: [],
  antiPatterns: []
};

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function mergeKnowledge(base = {}, overlay = {}) {
  const merged = {
    ...base,
    ...overlay,
    version: Math.max(Number(base.version || 1), Number(overlay.version || 1) || 1),
    generationPriorities: [...(base.generationPriorities || []), ...(overlay.generationPriorities || [])],
    examples: [...(base.examples || []), ...(overlay.examples || [])],
    ruleHints: [...(base.ruleHints || []), ...(overlay.ruleHints || [])],
    antiPatterns: [...(base.antiPatterns || []), ...(overlay.antiPatterns || [])]
  };

  if (base.sourceOfTruthPolicy || overlay.sourceOfTruthPolicy) {
    const left = base.sourceOfTruthPolicy || {};
    const right = overlay.sourceOfTruthPolicy || {};
    merged.sourceOfTruthPolicy = {
      ...left,
      ...right,
      codeStylePrefixes: unique([...(left.codeStylePrefixes || []), ...(right.codeStylePrefixes || [])]),
      canonicalSignalAliases: [...(left.canonicalSignalAliases || []), ...(right.canonicalSignalAliases || [])],
      normalizationRules: [...(left.normalizationRules || []), ...(right.normalizationRules || [])],
      forbiddenExpansions: {
        ...(left.forbiddenExpansions || {}),
        ...(right.forbiddenExpansions || {})
      }
    };
  }

  if (base.documentBlueprint || overlay.documentBlueprint) {
    merged.documentBlueprint = {
      ...(base.documentBlueprint || {}),
      ...(overlay.documentBlueprint || {}),
      preferredSubsections: [
        ...((base.documentBlueprint || {}).preferredSubsections || []),
        ...((overlay.documentBlueprint || {}).preferredSubsections || [])
      ],
      targetOutputPolicy: {
        ...((base.documentBlueprint || {}).targetOutputPolicy || {}),
        ...((overlay.documentBlueprint || {}).targetOutputPolicy || {})
      }
    };
  }

  return merged;
}

function buildFallbackManifest() {
  return {
    version: 1,
    resolutionOrder: ["generic", "docType", "domain", "module"],
    profiles: {
      generic: {
        files: Object.fromEntries([
          ...MARKDOWN_FILES.map((file) => [file, [file]]),
          [KNOWLEDGE_FILE, [KNOWLEDGE_FILE]]
        ])
      },
      docTypes: {},
      domains: {},
      modules: {}
    }
  };
}

function renderCompiledPrompt(pack = {}) {
  const lines = [
    "你正在使用一份针对当前任务动态编译出的技能包。",
    `任务类型：${pack.context?.documentType || "software_requirement"}`,
    `命中 profile：${(pack.selectedProfiles || []).map((item) => `${item.kind}:${item.key}`).join(" -> ") || "generic"}`
  ];

  const appendBlock = (title, values = []) => {
    if (!values.length) return;
    lines.push(`\n${title}`);
    values.forEach((value, index) => {
      lines.push(`${index + 1}. ${value}`);
    });
  };

  appendBlock("写作规则", (pack.rules?.writing || []).map((item) => item.content || item.title));
  appendBlock("抽取规则", (pack.rules?.extraction || []).map((item) => item.content || item.title));
  appendBlock("校验规则", (pack.rules?.validation || []).map((item) => item.content || item.title));
  appendBlock("正向示例", (pack.examples?.good || []).map((item) => item.content || item.title));
  appendBlock("反向示例", (pack.examples?.bad || []).map((item) => item.content || item.title));

  const knowledgeSummary = [];
  if ((pack.knowledge?.generationPriorities || []).length) {
    knowledgeSummary.push(`生成优先级 ${pack.knowledge.generationPriorities.length} 条`);
  }
  if ((pack.knowledge?.antiPatterns || []).length) {
    knowledgeSummary.push(`反模式 ${pack.knowledge.antiPatterns.length} 条`);
  }
  if ((pack.knowledge?.ruleHints || []).length) {
    knowledgeSummary.push(`规则提示 ${pack.knowledge.ruleHints.length} 条`);
  }
  if (pack.knowledge?.sourceOfTruthPolicy) {
    knowledgeSummary.push("包含 source-of-truth 约束");
  }
  if (pack.knowledge?.documentBlueprint) {
    knowledgeSummary.push("包含文档蓝图约束");
  }
  if (knowledgeSummary.length) {
    lines.push(`\n结构化知识：${knowledgeSummary.join("，")}`);
  }

  return lines.join("\n").trim();
}

export class SkillLoader {
  constructor() {
    this.registryService = new SkillRegistryService();
  }

  async loadSkill(fileName, skillDir = config.skillDir) {
    return fs.readFile(path.join(skillDir, fileName), "utf8");
  }

  async loadDomainKnowledgeFile(fileName = KNOWLEDGE_FILE, skillDir = config.skillDir) {
    try {
      const content = await fs.readFile(path.join(skillDir, fileName), "utf8");
      return JSON.parse(content);
    } catch (_error) {
      return { ...EMPTY_KNOWLEDGE };
    }
  }

  async loadManifest(skillDir = config.skillDir) {
    if (path.resolve(skillDir) === path.resolve(config.activeSkillDir)) {
      return this.registryService.loadManifest(skillDir);
    }

    try {
      const content = await fs.readFile(path.join(skillDir, "skill-manifest.json"), "utf8");
      return JSON.parse(content);
    } catch (_error) {
      return buildFallbackManifest();
    }
  }

  resolveProfiles(manifest, context = {}) {
    const documentType = normalizeDocumentType(context.documentType);
    const domain = normalizeKey(context.domain);
    const moduleSkillKey = normalizeKey(context.moduleSkillKey);
    const selected = [];

    if (manifest?.profiles?.generic) {
      selected.push({ key: "generic", kind: "generic", config: manifest.profiles.generic });
    }
    if (manifest?.profiles?.docTypes?.[documentType]) {
      selected.push({ key: documentType, kind: "docType", config: manifest.profiles.docTypes[documentType] });
    }
    if (domain && manifest?.profiles?.domains?.[domain]) {
      selected.push({ key: domain, kind: "domain", config: manifest.profiles.domains[domain] });
    }
    if (moduleSkillKey && manifest?.profiles?.modules?.[moduleSkillKey]) {
      selected.push({ key: moduleSkillKey, kind: "module", config: manifest.profiles.modules[moduleSkillKey] });
    }

    return selected;
  }

  buildCompiledPack(context = {}, selectedProfiles = [], items = []) {
    const activeItems = items
      .filter((item) => item.status === "active")
      .sort((left, right) => left.order - right.order);
    const knowledge = buildKnowledgeFromItems(activeItems, Math.max(...activeItems.map((item) => Number(item.version || 1) || 1), 1));

    return {
      context: {
        documentType: normalizeDocumentType(context.documentType),
        domain: normalizeKey(context.domain),
        moduleSkillKey: normalizeKey(context.moduleSkillKey)
      },
      selectedProfiles: selectedProfiles.map((profile) => ({ key: profile.key, kind: profile.kind })),
      rules: {
        extraction: activeItems.filter((item) => item.kind === "extraction_rule"),
        writing: activeItems.filter((item) => item.kind === "writing_rule"),
        validation: activeItems.filter((item) => item.kind === "validation_rule")
      },
      examples: {
        good: activeItems.filter((item) => item.kind === "good_example"),
        bad: activeItems.filter((item) => item.kind === "bad_example")
      },
      knowledge: {
        generationPriorities: knowledge.generationPriorities || [],
        antiPatterns: knowledge.antiPatterns || [],
        ruleHints: knowledge.ruleHints || [],
        sourceOfTruthPolicy: knowledge.sourceOfTruthPolicy || null,
        documentBlueprint: knowledge.documentBlueprint || null
      },
      flatItems: activeItems
    };
  }

  async loadFromRegistryContext(context = {}, skillDir = config.skillDir) {
    const manifest = await this.registryService.loadManifest(skillDir);
    const selectedProfiles = this.resolveProfiles(manifest, context);
    const registries = [];
    for (const profile of selectedProfiles) {
      registries.push(await this.registryService.loadProfileRegistry(profile.kind, profile.key, skillDir));
    }

    const flatItems = registries.flatMap((registry) =>
      ensureArray(registry.items).map((item) => ({
        ...item,
        layer: registry.layer,
        profileKey: registry.profileKey
      }))
    );
    const compiledPack = this.buildCompiledPack(context, selectedProfiles, flatItems);
    const result = Object.fromEntries(MARKDOWN_FILES.map((file) => [file, ""]));
    result["requirement_extraction.md"] = renderMarkdownFromItems("extraction_rule", compiledPack.flatItems);
    result["requirement_writing.md"] = renderMarkdownFromItems("writing_rule", compiledPack.flatItems);
    result["requirement_validation.md"] = renderMarkdownFromItems("validation_rule", compiledPack.flatItems);
    result["examples/good_examples.md"] = renderMarkdownFromItems("good_example", compiledPack.flatItems);
    result["examples/bad_examples.md"] = renderMarkdownFromItems("bad_example", compiledPack.flatItems);

    const knowledge = buildKnowledgeFromItems(compiledPack.flatItems, 1);
    return {
      ...result,
      [KNOWLEDGE_FILE]: knowledge,
      __profiles: compiledPack.selectedProfiles,
      __compiledSkillPack: compiledPack,
      __compiledPrompt: renderCompiledPrompt(compiledPack)
    };
  }

  async loadForContext(context = {}, skillDir = config.skillDir) {
    if (path.resolve(skillDir) === path.resolve(config.activeSkillDir)) {
      return this.loadFromRegistryContext(context, skillDir);
    }

    const manifest = await this.loadManifest(skillDir);
    const selectedProfiles = this.resolveProfiles(manifest, context);
    const result = Object.fromEntries(MARKDOWN_FILES.map((file) => [file, ""]));
    let knowledge = { ...EMPTY_KNOWLEDGE };

    for (const profile of selectedProfiles) {
      const files = profile.config?.files || {};
      for (const markdownFile of MARKDOWN_FILES) {
        const contents = [];
        for (const relativeFile of ensureArray(files[markdownFile])) {
          try {
            contents.push(await this.loadSkill(relativeFile, skillDir));
          } catch (_error) {
            // ignore missing overlay files
          }
        }
        if (contents.length) {
          result[markdownFile] = [result[markdownFile], ...contents].filter(Boolean).join("\n\n").trim();
        }
      }

      for (const knowledgeFile of ensureArray(files[KNOWLEDGE_FILE])) {
        knowledge = mergeKnowledge(knowledge, await this.loadDomainKnowledgeFile(knowledgeFile, skillDir));
      }
    }

    return {
      ...result,
      [KNOWLEDGE_FILE]: knowledge,
      __profiles: selectedProfiles.map((profile) => ({ key: profile.key, kind: profile.kind }))
    };
  }

  async loadAll(skillDir = config.skillDir) {
    return this.loadForContext({ documentType: "software_requirement" }, skillDir);
  }
}
