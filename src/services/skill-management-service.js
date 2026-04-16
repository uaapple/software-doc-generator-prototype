import path from "node:path";
import { config } from "../config.js";
import { promises as fs } from "node:fs";
import { SkillRegistryService } from "./skill-registry-service.js";
import { pathExists } from "./storage.js";

const EMPTY_KNOWLEDGE = {
  version: 1,
  generationPriorities: [],
  examples: [],
  ruleHints: [],
  antiPatterns: []
};

const PROFILE_LABELS = {
  generic: "通用层",
  docType: "文档类型层",
  domain: "领域层",
  module: "模块层"
};

function createManagedError(message, statusCode = 400, code = "skill_management_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeLayer(type = "") {
  if (type === "doc-type" || type === "doc_type" || type === "doctype") return "docType";
  if (["generic", "docType", "domain", "module"].includes(type)) return type;
  throw createManagedError("Unsupported skill type", 400, "unsupported_skill_type", { type });
}

function groupByLayer(profiles = []) {
  return {
    generic: profiles.filter((item) => item.layer === "generic"),
    docType: profiles.filter((item) => item.layer === "docType"),
    domain: profiles.filter((item) => item.layer === "domain"),
    module: profiles.filter((item) => item.layer === "module")
  };
}

function summarizeKindCounts(items = []) {
  const counts = {};
  for (const item of items) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  return counts;
}

async function describeFiles(entries = [], skillDir = config.activeSkillDir) {
  const described = [];
  for (const entry of entries) {
    const exists = await pathExists(entry.absolutePath);
    const stat = exists ? await fs.stat(entry.absolutePath).catch(() => null) : null;
    described.push({
      role: entry.role,
      relativePath: entry.relativePath,
      absolutePath: entry.absolutePath,
      exists,
      size: stat?.size || 0
    });
  }
  return described.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN"));
}

export class SkillManagementService {
  constructor() {
    this.registryService = new SkillRegistryService();
  }

  async buildProfileSummary(profile, skillDir = config.activeSkillDir) {
    const files = await describeFiles(profile.files || [], skillDir);
    const abnormal = files.some((entry) => !entry.exists);
    const knowledgePath = files.find((entry) => entry.role === "domain-knowledge.json")?.relativePath || "";
    return {
      layer: profile.layer,
      type: profile.layer,
      key: profile.profileKey,
      id: `${profile.layer}:${profile.profileKey}`,
      label: PROFILE_LABELS[profile.layer] || profile.layer,
      displayName: profile.displayName,
      documentTypeScope: profile.documentTypeScope || "",
      deletable: profile.layer !== "generic",
      editable: true,
      abnormal,
      knowledgePath,
      hasMarkdownFiles: files.some((entry) => entry.role !== "domain-knowledge.json"),
      fileSummary: files.map((entry) => ({
        role: entry.role,
        relativePath: entry.relativePath,
        exists: entry.exists,
        size: entry.size
      })),
      metrics: {
        fileCount: files.length,
        itemCount: profile.itemCount || (profile.items || []).length,
        kinds: summarizeKindCounts(profile.items || []),
        goodExampleCount: (profile.items || []).filter((item) => item.kind === "good_example").length,
        badExampleCount: (profile.items || []).filter((item) => item.kind === "bad_example").length
      },
      items: (profile.items || []).map((item) => ({
        skillCode: item.skillCode,
        kind: item.kind,
        title: item.title,
        status: item.status,
        order: item.order,
        preview: item.preview
      }))
    };
  }

  async listSkills(skillDir = config.activeSkillDir) {
    const index = await this.registryService.getRegistryIndex(skillDir);
    const profiles = [];
    for (const profile of index.profiles) {
      profiles.push(await this.buildProfileSummary(profile, skillDir));
    }

    const groups = groupByLayer(profiles);
    return {
      manifest: index.manifest,
      activeSource: {
        skillDir,
        manifestPath: path.join(skillDir, "skill-manifest.json")
      },
      summary: {
        total: profiles.length,
        itemTotal: index.items.length,
        countsByType: Object.fromEntries(Object.entries(groups).map(([layer, items]) => [layer, items.length])),
        abnormalCount: profiles.filter((item) => item.abnormal).length
      },
      groups
    };
  }

  async getSkillDetail(type, key, skillDir = config.activeSkillDir) {
    const layer = normalizeLayer(type);
    const registry = await this.registryService.loadProfileRegistry(layer, key, skillDir);
    const index = await this.registryService.getRegistryIndex(skillDir, { includeDeprecated: true });
    const profile = index.profiles.find((item) => item.layer === layer && item.profileKey === (layer === "generic" ? "generic" : key));
    if (!profile) {
      throw createManagedError("Skill profile not found", 404, "skill_profile_not_found", { type, key });
    }

    const item = await this.buildProfileSummary(profile, skillDir);
    const files = await describeFiles(profile.files || [], skillDir);
    const knowledgePath = files.find((entry) => entry.role === "domain-knowledge.json")?.absolutePath;
    const knowledge = knowledgePath
      ? JSON.parse(await fs.readFile(knowledgePath, "utf8").catch(() => JSON.stringify(EMPTY_KNOWLEDGE)))
      : { ...EMPTY_KNOWLEDGE };

    return {
      item,
      profile: {
        layer: registry.layer,
        profileKey: registry.profileKey,
        displayName: registry.displayName,
        documentTypeScope: registry.documentTypeScope || "",
        status: registry.status || "active",
        registryPath: profile.registryPath
      },
      files,
      knowledge,
      skillItems: (registry.items || []).sort((left, right) => left.order - right.order),
      capabilities: {
        canEdit: true,
        canDelete: layer !== "generic",
        deleteDisabledReason: layer === "generic" ? "基础通用层暂不支持删除" : ""
      }
    };
  }

  async updateSkill(type, key, payload = {}, skillDir = config.activeSkillDir) {
    const layer = normalizeLayer(type);
    if (!payload.knowledge || typeof payload.knowledge !== "object") {
      throw createManagedError("Profile update requires payload.knowledge", 400, "missing_knowledge_payload");
    }
    await this.registryService.replaceKnowledgeItems(layer, key, payload.knowledge, skillDir);
    return this.getSkillDetail(layer, key, skillDir);
  }

  async deleteSkill(type, key, skillDir = config.activeSkillDir) {
    const layer = normalizeLayer(type);
    if (layer === "generic") {
      throw createManagedError("Generic skill cannot be deleted", 400, "generic_delete_blocked");
    }
    return this.registryService.removeProfile(layer, key, skillDir);
  }

  async listSkillItems(filters = {}, skillDir = config.activeSkillDir) {
    const index = await this.registryService.getRegistryIndex(skillDir, {
      includeDeprecated: Boolean(filters.includeDeprecated),
      kind: filters.kind || "",
      query: filters.query || ""
    });
    const items = index.items.filter((item) => {
      if (filters.layer && normalizeLayer(filters.layer) !== item.layer) return false;
      if (filters.profileKey && String(filters.profileKey).trim() !== item.profileKey) return false;
      if (filters.documentTypeScope && String(filters.documentTypeScope).trim() !== item.documentTypeScope) return false;
      return true;
    });

    return {
      summary: {
        total: items.length,
        countsByLayer: {
          generic: items.filter((item) => item.layer === "generic").length,
          docType: items.filter((item) => item.layer === "docType").length,
          domain: items.filter((item) => item.layer === "domain").length,
          module: items.filter((item) => item.layer === "module").length
        }
      },
      items
    };
  }

  async getSkillItem(skillCode, skillDir = config.activeSkillDir) {
    const item = await this.registryService.getItem(skillCode, skillDir);
    const detail = await this.getSkillDetail(item.layer, item.profileKey, skillDir);
    return {
      item,
      profile: detail.profile,
      siblings: detail.skillItems.map((entry) => ({
        skillCode: entry.skillCode,
        kind: entry.kind,
        title: entry.title,
        status: entry.status,
        order: entry.order
      })),
      capabilities: {
        canEdit: true,
        canDelete: true,
        canReorder: true
      }
    };
  }

  async createSkillItem(payload = {}, skillDir = config.activeSkillDir) {
    if (!payload.layer || !payload.kind || !payload.profileKey) {
      throw createManagedError("Creating a skill item requires layer, profileKey, and kind", 400, "missing_skill_item_fields");
    }
    return this.registryService.createItem(payload, skillDir);
  }

  async updateSkillItem(skillCode, payload = {}, skillDir = config.activeSkillDir) {
    return this.registryService.updateItem(skillCode, payload, skillDir);
  }

  async deleteSkillItem(skillCode, skillDir = config.activeSkillDir) {
    return this.registryService.deleteItem(skillCode, skillDir);
  }

  async reorderSkillItem(skillCode, payload = {}, skillDir = config.activeSkillDir) {
    return this.registryService.reorderItem(skillCode, payload, skillDir);
  }

  async materializeRegistry(skillDir = config.activeSkillDir) {
    return this.registryService.materializeAll(skillDir);
  }
}
