import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const MARKDOWN_FILES = [
  "requirement_extraction.md",
  "requirement_writing.md",
  "requirement_validation.md",
  path.join("examples", "good_examples.md"),
  path.join("examples", "bad_examples.md")
];
const KNOWLEDGE_FILE = "domain-knowledge.json";
const EMPTY_KNOWLEDGE = {
  version: 1,
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

export class SkillLoader {
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

  async loadForContext(context = {}, skillDir = config.skillDir) {
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
