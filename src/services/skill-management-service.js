import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { pathExists, readJson, writeJson } from "./storage.js";

const MARKDOWN_FILE_KEYS = [
  "requirement_extraction.md",
  "requirement_writing.md",
  "requirement_validation.md",
  "examples/good_examples.md",
  "examples/bad_examples.md"
];

const EMPTY_KNOWLEDGE = {
  version: 1,
  generationPriorities: [],
  examples: [],
  ruleHints: [],
  antiPatterns: []
};

const SKILL_TYPE_META = {
  generic: {
    section: "generic",
    label: "通用层",
    displayName: "Generic / 通用基础层",
    deletable: false
  },
  docType: {
    section: "docTypes",
    label: "文档类型层",
    deletable: true
  },
  domain: {
    section: "domains",
    label: "领域层",
    deletable: true
  },
  module: {
    section: "modules",
    label: "模块层",
    deletable: true
  }
};

function createManagedError(message, statusCode = 400, code = "skill_management_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeSkillType(type) {
  if (!type || !SKILL_TYPE_META[type]) {
    throw createManagedError("Unsupported skill type", 400, "unsupported_skill_type");
  }
  return type;
}

function sanitizeKey(value) {
  return String(value || "").trim();
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = removeUndefinedDeep(entry);
    if (normalized !== undefined) {
      next[key] = normalized;
    }
  }
  return next;
}

function sanitizeKnowledge(input = {}) {
  const knowledge = input && typeof input === "object" ? input : {};
  const version = Math.max(1, Number(knowledge.version || 1) || 1);
  return removeUndefinedDeep({
    version,
    generationPriorities: Array.isArray(knowledge.generationPriorities)
      ? knowledge.generationPriorities.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    ruleHints: Array.isArray(knowledge.ruleHints) ? knowledge.ruleHints.map((item) => removeUndefinedDeep(item || {})) : [],
    antiPatterns: Array.isArray(knowledge.antiPatterns)
      ? knowledge.antiPatterns.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    examples: Array.isArray(knowledge.examples) ? knowledge.examples.map((item) => removeUndefinedDeep(item || {})) : [],
    sourceOfTruthPolicy: knowledge.sourceOfTruthPolicy ? removeUndefinedDeep(knowledge.sourceOfTruthPolicy) : undefined,
    documentBlueprint: knowledge.documentBlueprint ? removeUndefinedDeep(knowledge.documentBlueprint) : undefined
  });
}

function buildFallbackManifest() {
  return {
    version: 1,
    resolutionOrder: ["generic", "docType", "domain", "module"],
    profiles: {
      generic: {
        files: Object.fromEntries([
          ...MARKDOWN_FILE_KEYS.map((file) => [file, [file]]),
          ["domain-knowledge.json", ["profiles/generic/domain-knowledge.json"]]
        ])
      },
      docTypes: {},
      domains: {},
      modules: {}
    }
  };
}

function getProfileEntry(manifest, type, key) {
  const normalizedType = normalizeSkillType(type);
  const meta = SKILL_TYPE_META[normalizedType];
  if (normalizedType === "generic") {
    return { key: "generic", configEntry: manifest?.profiles?.generic || null };
  }
  const normalizedKey = sanitizeKey(key);
  const bucket = manifest?.profiles?.[meta.section] || {};
  return { key: normalizedKey, configEntry: bucket[normalizedKey] || null };
}

function getDisplayName(type, key) {
  if (type === "generic") return SKILL_TYPE_META.generic.displayName;
  if (type === "docType") {
    return (
      {
        software_requirement: "Software Requirement",
        detail_design: "Detail Design",
        hil_test_case: "HIL Test Case"
      }[key] || key
    );
  }
  return key;
}

function buildPreview(content = "", maxLength = 200) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

async function removeEmptyParents(startDir, stopDir) {
  let current = startDir;
  while (current && current.startsWith(stopDir) && current !== stopDir) {
    const entries = await fs.readdir(current).catch(() => null);
    if (!entries || entries.length > 0) {
      break;
    }
    await fs.rmdir(current).catch(() => {});
    current = path.dirname(current);
  }
}

export class SkillManagementService {
  async loadManifest(skillDir = config.activeSkillDir) {
    return readJson(path.join(skillDir, "skill-manifest.json"), buildFallbackManifest());
  }

  async readKnowledge(relativePath = "", skillDir = config.activeSkillDir) {
    if (!relativePath) {
      return { ...EMPTY_KNOWLEDGE };
    }
    return readJson(path.join(skillDir, relativePath), { ...EMPTY_KNOWLEDGE });
  }

  async describeFiles(files = {}, skillDir = config.activeSkillDir) {
    const described = [];

    for (const [role, relativeFiles] of Object.entries(files || {})) {
      for (const relativePath of Array.isArray(relativeFiles) ? relativeFiles : [relativeFiles]) {
        if (!relativePath) continue;
        const absolutePath = path.join(skillDir, relativePath);
        const exists = await pathExists(absolutePath);
        let size = 0;
        let preview = "";

        if (exists) {
          const stat = await fs.stat(absolutePath).catch(() => null);
          size = stat?.size || 0;
          if (MARKDOWN_FILE_KEYS.includes(role)) {
            const content = await fs.readFile(absolutePath, "utf8").catch(() => "");
            preview = buildPreview(content);
          }
        }

        described.push({
          role,
          relativePath,
          absolutePath,
          exists,
          size,
          preview
        });
      }
    }

    return described;
  }

  async buildSkillItem(type, key, configEntry, skillDir = config.activeSkillDir) {
    const files = await this.describeFiles(configEntry?.files || {}, skillDir);
    const knowledgeFile = files.find((item) => item.role === "domain-knowledge.json") || null;
    const knowledge = knowledgeFile ? await this.readKnowledge(knowledgeFile.relativePath, skillDir) : { ...EMPTY_KNOWLEDGE };
    const abnormal = files.some((item) => !item.exists);
    const ruleHint = (knowledge.ruleHints || []).find((item) => item && typeof item === "object") || {};

    return {
      type,
      key,
      id: `${type}:${key}`,
      label: SKILL_TYPE_META[type].label,
      displayName: getDisplayName(type, key),
      deletable: SKILL_TYPE_META[type].deletable,
      editable: Boolean(knowledgeFile),
      abnormal,
      knowledgePath: knowledgeFile?.relativePath || "",
      hasMarkdownFiles: files.some((item) => item.role !== "domain-knowledge.json"),
      fileSummary: files.map((item) => ({
        role: item.role,
        relativePath: item.relativePath,
        exists: item.exists,
        size: item.size
      })),
      domain: trimString(ruleHint.domain || "") || "",
      subdomain: trimString(ruleHint.subdomain || "") || "",
      metrics: {
        fileCount: files.length,
        exampleCount: Array.isArray(knowledge.examples) ? knowledge.examples.length : 0,
        ruleHintCount: Array.isArray(knowledge.ruleHints) ? knowledge.ruleHints.length : 0,
        antiPatternCount: Array.isArray(knowledge.antiPatterns) ? knowledge.antiPatterns.length : 0
      }
    };
  }

  async listSkills(skillDir = config.activeSkillDir) {
    const manifest = await this.loadManifest(skillDir);
    const groups = {
      generic: [],
      docType: [],
      domain: [],
      module: []
    };

    groups.generic.push(await this.buildSkillItem("generic", "generic", manifest?.profiles?.generic || { files: {} }, skillDir));

    for (const [key, entry] of Object.entries(manifest?.profiles?.docTypes || {})) {
      groups.docType.push(await this.buildSkillItem("docType", key, entry, skillDir));
    }
    for (const [key, entry] of Object.entries(manifest?.profiles?.domains || {})) {
      groups.domain.push(await this.buildSkillItem("domain", key, entry, skillDir));
    }
    for (const [key, entry] of Object.entries(manifest?.profiles?.modules || {})) {
      groups.module.push(await this.buildSkillItem("module", key, entry, skillDir));
    }

    for (const list of Object.values(groups)) {
      list.sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
    }

    return {
      manifest,
      activeSource: {
        skillDir,
        manifestPath: path.join(skillDir, "skill-manifest.json")
      },
      summary: {
        total: Object.values(groups).reduce((sum, items) => sum + items.length, 0),
        countsByType: Object.fromEntries(Object.entries(groups).map(([type, items]) => [type, items.length])),
        abnormalCount: Object.values(groups)
          .flat()
          .filter((item) => item.abnormal).length
      },
      groups
    };
  }

  async getSkillDetail(type, key, skillDir = config.activeSkillDir) {
    const manifest = await this.loadManifest(skillDir);
    const { configEntry, key: resolvedKey } = getProfileEntry(manifest, type, key);

    if (!configEntry) {
      throw createManagedError("Skill not found", 404, "skill_not_found", { type, key });
    }

    const item = await this.buildSkillItem(type, resolvedKey, configEntry, skillDir);
    const files = await this.describeFiles(configEntry.files || {}, skillDir);
    const markdownFiles = files.filter((entry) => entry.role !== "domain-knowledge.json");
    const knowledgeFile = files.find((entry) => entry.role === "domain-knowledge.json") || null;
    const knowledge = knowledgeFile ? await this.readKnowledge(knowledgeFile.relativePath, skillDir) : { ...EMPTY_KNOWLEDGE };

    return {
      item,
      files,
      markdownFiles,
      knowledge,
      capabilities: {
        canEdit: item.editable,
        canDelete: item.deletable,
        deleteDisabledReason: item.deletable ? "" : "基础通用层暂不支持删除"
      }
    };
  }

  async updateSkill(type, key, payload = {}, skillDir = config.activeSkillDir) {
    const manifest = await this.loadManifest(skillDir);
    const { configEntry, key: resolvedKey } = getProfileEntry(manifest, type, key);

    if (!configEntry) {
      throw createManagedError("Skill not found", 404, "skill_not_found", { type, key });
    }

    const files = await this.describeFiles(configEntry.files || {}, skillDir);
    const knowledgeFile = files.find((entry) => entry.role === "domain-knowledge.json") || null;
    if (!knowledgeFile) {
      throw createManagedError("This skill does not support structured editing yet", 400, "skill_edit_unsupported");
    }

    const currentKnowledge = await this.readKnowledge(knowledgeFile.relativePath, skillDir);
    const nextKnowledge = {
      ...currentKnowledge,
      ...sanitizeKnowledge(payload.knowledge || {})
    };
    if (!payload.knowledge?.sourceOfTruthPolicy) {
      delete nextKnowledge.sourceOfTruthPolicy;
    }
    if (!payload.knowledge?.documentBlueprint) {
      delete nextKnowledge.documentBlueprint;
    }

    await writeJson(path.join(skillDir, knowledgeFile.relativePath), nextKnowledge);
    return this.getSkillDetail(type, resolvedKey, skillDir);
  }

  async deleteSkill(type, key, skillDir = config.activeSkillDir) {
    const normalizedType = normalizeSkillType(type);
    if (normalizedType === "generic") {
      throw createManagedError("Generic skill cannot be deleted", 400, "generic_delete_blocked");
    }

    const manifest = await this.loadManifest(skillDir);
    const { configEntry, key: resolvedKey } = getProfileEntry(manifest, normalizedType, key);

    if (!configEntry) {
      throw createManagedError("Skill not found", 404, "skill_not_found", { type, key });
    }

    const files = await this.describeFiles(configEntry.files || {}, skillDir);
    const absolutePaths = unique(files.map((item) => item.absolutePath));
    for (const targetPath of absolutePaths) {
      await fs.rm(targetPath, { recursive: true, force: true }).catch(() => {});
      await removeEmptyParents(path.dirname(targetPath), skillDir);
    }

    const section = SKILL_TYPE_META[normalizedType].section;
    delete manifest.profiles[section][resolvedKey];
    await writeJson(path.join(skillDir, "skill-manifest.json"), manifest);

    return {
      removed: true,
      type: normalizedType,
      key: resolvedKey
    };
  }
}
