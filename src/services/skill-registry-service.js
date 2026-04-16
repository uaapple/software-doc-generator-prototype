import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { pathExists, readJson, writeJson } from "./storage.js";

const PROFILE_META = {
  generic: {
    manifestSection: "generic",
    layerCode: "GEN",
    displayName: "Generic / 通用基础层"
  },
  docType: {
    manifestSection: "docTypes",
    layerCode: "DOC"
  },
  domain: {
    manifestSection: "domains",
    layerCode: "DOM"
  },
  module: {
    manifestSection: "modules",
    layerCode: "MOD"
  }
};

const MARKDOWN_KIND_TO_FILE = {
  writing_rule: "requirement_writing.md",
  extraction_rule: "requirement_extraction.md",
  validation_rule: "requirement_validation.md",
  good_example: path.join("examples", "good_examples.md"),
  bad_example: path.join("examples", "bad_examples.md")
};

const FILE_TO_MARKDOWN_KIND = Object.fromEntries(
  Object.entries(MARKDOWN_KIND_TO_FILE).map(([kind, fileName]) => [fileName.replaceAll("\\", "/"), kind])
);

const KNOWLEDGE_ITEM_KINDS = new Set([
  "generation_priority",
  "rule_hint",
  "anti_pattern",
  "source_alias",
  "code_style_prefix",
  "forbidden_expansion",
  "normalization_rule",
  "source_policy_setting",
  "document_blueprint_section",
  "document_blueprint_policy"
]);

const ITEM_KINDS = new Set([
  ...Object.keys(MARKDOWN_KIND_TO_FILE),
  ...KNOWLEDGE_ITEM_KINDS
]);

const EMPTY_KNOWLEDGE = {
  version: 1,
  generationPriorities: [],
  examples: [],
  ruleHints: [],
  antiPatterns: []
};

function now() {
  return new Date().toISOString();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createManagedError(message, statusCode = 400, code = "skill_registry_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeLayer(layer = "") {
  if (layer === "doc-type") return "docType";
  if (layer === "doctype") return "docType";
  if (layer === "doc_type") return "docType";
  if (!PROFILE_META[layer]) {
    throw createManagedError("Unsupported skill layer", 400, "unsupported_skill_layer", { layer });
  }
  return layer;
}

function sanitizeKey(value = "") {
  return String(value || "").trim().replace(/\\/g, "/");
}

function normalizeProfileKey(value = "") {
  return sanitizeKey(value)
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_");
}

function normalizeKind(kind = "") {
  const normalized = String(kind || "").trim();
  if (!ITEM_KINDS.has(normalized)) {
    throw createManagedError("Unsupported skill item kind", 400, "unsupported_skill_item_kind", { kind });
  }
  return normalized;
}

function normalizeItemStatus(status = "") {
  return ["active", "deprecated", "draft"].includes(status) ? status : "active";
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  return value === undefined || value === null ? [] : [value];
}

function asStringArray(value) {
  return ensureArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function trimObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => trimObject(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }
    return value;
  }
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = trimObject(entry);
    if (normalized !== undefined) {
      next[key] = normalized;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

function parseSkillCode(value = "") {
  const trimmed = String(value || "").trim();
  const match = /^([A-Z]+)-(.+)-(\d{3})$/.exec(trimmed);
  if (!match) return null;
  return {
    raw: trimmed,
    prefix: match[1],
    body: match[2],
    sequence: Number(match[3]) || 0
  };
}

function buildSkillCode(layer, profileKey, kind, sequence) {
  return `${PROFILE_META[layer].layerCode}-${normalizeProfileKey(profileKey)}-${normalizeKind(kind)}-${String(sequence).padStart(3, "0")}`;
}

function assignSkillCodes(items = [], layer, profileKey) {
  const counters = new Map();
  return ensureArray(items).map((item) => {
    const parsed = parseSkillCode(item.skillCode);
    if (parsed?.prefix === PROFILE_META[layer].layerCode) {
      counters.set(item.kind, Math.max(counters.get(item.kind) || 0, parsed.sequence || 0));
      return item;
    }

    const nextSequence = (counters.get(item.kind) || 0) + 1;
    counters.set(item.kind, nextSequence);
    return {
      ...item,
      skillCode: buildSkillCode(layer, profileKey, item.kind, nextSequence)
    };
  });
}

function inferDisplayName(layer, profileKey) {
  if (layer === "generic") return PROFILE_META.generic.displayName;
  if (layer === "docType") {
    return (
      {
        software_requirement: "Software Requirement",
        detail_design: "Detail Design",
        hil_test_case: "HIL Test Case"
      }[profileKey] || profileKey
    );
  }
  return profileKey;
}

function buildDefaultManifest() {
  return {
    version: 1,
    resolutionOrder: ["generic", "docType", "domain", "module"],
    profiles: {
      generic: {
        files: {
          "requirement_extraction.md": ["requirement_extraction.md"],
          "requirement_writing.md": ["requirement_writing.md"],
          "requirement_validation.md": ["requirement_validation.md"],
          "examples/good_examples.md": ["examples/good_examples.md"],
          "examples/bad_examples.md": ["examples/bad_examples.md"],
          "domain-knowledge.json": ["profiles/generic/domain-knowledge.json"]
        }
      },
      docTypes: {},
      domains: {},
      modules: {}
    }
  };
}

function getProfileRelativeDir(layer, profileKey) {
  if (layer === "generic") return path.join("profiles", "generic");
  if (layer === "docType") return path.join("profiles", "doc-types", profileKey);
  if (layer === "domain") return path.join("profiles", "domains", profileKey);
  return path.join("profiles", "modules", profileKey);
}

function getDefaultProfileFiles(layer, profileKey, activeKinds = []) {
  const files = {};
  const relativeDir = getProfileRelativeDir(layer, profileKey).replaceAll("\\", "/");
  for (const kind of activeKinds) {
    const targetFile = MARKDOWN_KIND_TO_FILE[kind];
    if (!targetFile) continue;
    const relativePath = layer === "generic" ? targetFile : `${relativeDir}/${targetFile.replaceAll("\\", "/")}`;
    files[targetFile.replaceAll("\\", "/")] = [relativePath];
  }

  if (layer === "generic" || activeKinds.some((kind) => KNOWLEDGE_ITEM_KINDS.has(kind) || kind === "good_example")) {
    files["domain-knowledge.json"] = [`${relativeDir}/domain-knowledge.json`];
  }

  return files;
}

function getRegistryRelativePath(layer, profileKey) {
  return `${getProfileRelativeDir(layer, profileKey).replaceAll("\\", "/")}/skill-items.json`;
}

function resolveProfileConfig(manifest, layer, profileKey) {
  const normalizedLayer = normalizeLayer(layer);
  const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
  if (normalizedLayer === "generic") {
    return { layer: normalizedLayer, profileKey: normalizedKey, configEntry: manifest?.profiles?.generic || null };
  }
  const bucket = manifest?.profiles?.[PROFILE_META[normalizedLayer].manifestSection] || {};
  return { layer: normalizedLayer, profileKey: normalizedKey, configEntry: bucket[normalizedKey] || null };
}

function setProfileConfig(manifest, layer, profileKey, value) {
  const normalizedLayer = normalizeLayer(layer);
  const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
  manifest.profiles ||= {};
  if (normalizedLayer === "generic") {
    manifest.profiles.generic = value;
    return;
  }
  const section = PROFILE_META[normalizedLayer].manifestSection;
  manifest.profiles[section] ||= {};
  manifest.profiles[section][normalizedKey] = value;
}

function deleteProfileConfig(manifest, layer, profileKey) {
  const normalizedLayer = normalizeLayer(layer);
  const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
  if (normalizedLayer === "generic") {
    return;
  }
  const section = PROFILE_META[normalizedLayer].manifestSection;
  if (manifest?.profiles?.[section]) {
    delete manifest.profiles[section][normalizedKey];
  }
}

function markdownHeadingMatch(line = "") {
  const match = /^###\s+([A-Za-z0-9_\-\u4e00-\u9fa5]+-\d{3})\s*(.*)$/.exec(line.trim());
  if (!match) return null;
  return {
    legacyRuleId: match[1],
    title: String(match[2] || "").trim() || match[1]
  };
}

function inferTitle(sectionKey, fallbackTitle, index) {
  const normalizedSection = String(sectionKey || "").trim();
  const base = normalizedSection && normalizedSection !== "default" ? normalizedSection : fallbackTitle;
  return `${base || "Skill"} ${index}`;
}

function toParagraphs(text = "") {
  return String(text || "")
    .split(/\r?\n\s*\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeItem(item = {}, defaults = {}) {
  const layer = normalizeLayer(item.layer || defaults.layer);
  const profileKey = layer === "generic" ? "generic" : normalizeProfileKey(item.profileKey || defaults.profileKey);
  const kind = normalizeKind(item.kind || defaults.kind);
  const content = typeof item.content === "string" ? item.content.trim() : "";
  const structuredPayload = trimObject(cloneJson(item.structuredPayload));
  const title =
    String(item.title || defaults.title || structuredPayload?.topic || structuredPayload?.canonical || "").trim() ||
    `${kind.replaceAll("_", " ")} item`;
  const normalized = {
    skillCode: String(item.skillCode || defaults.skillCode || "").trim(),
    layer,
    profileKey,
    kind,
    title,
    content,
    structuredPayload,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : Number(defaults.order || 0) || 0,
    status: normalizeItemStatus(item.status || defaults.status),
    sectionKey: String(item.sectionKey || defaults.sectionKey || "default").trim() || "default",
    provenance: {
      ...(cloneJson(defaults.provenance) || {}),
      ...(cloneJson(item.provenance) || {})
    },
    review: {
      reviewer: "",
      note: "",
      updatedAt: "",
      ...(cloneJson(defaults.review) || {}),
      ...(cloneJson(item.review) || {})
    },
    createdAt: item.createdAt || defaults.createdAt || now(),
    updatedAt: item.updatedAt || defaults.updatedAt || now()
  };
  if (!normalized.content && !normalized.structuredPayload) {
    normalized.content = normalized.title;
  }
  return normalized;
}

function createRegistryItem(base = {}, defaults = {}) {
  return sanitizeItem({ ...defaults, ...base }, defaults);
}

function parseMarkdownAsItems({ text = "", layer, profileKey, kind, relativePath }) {
  const items = [];
  const lines = String(text || "").split(/\r?\n/);
  let currentSection = "default";
  let pendingExplicit = null;
  let pendingContent = [];
  let looseItems = [];

  const flushExplicit = () => {
    if (!pendingExplicit) return;
    items.push({
      title: pendingExplicit.title,
      content: pendingContent.join("\n").trim() || pendingExplicit.title,
      kind,
      layer,
      profileKey,
      sectionKey: currentSection,
      provenance: {
        legacySource: relativePath,
        migratedFromRuleId: pendingExplicit.legacyRuleId
      }
    });
    pendingExplicit = null;
    pendingContent = [];
  };

  const flushLooseItems = () => {
    if (!looseItems.length) return;
    looseItems.forEach((content, index) => {
      items.push({
        title: inferTitle(currentSection, kind.replaceAll("_", " "), index + 1),
        content,
        kind,
        layer,
        profileKey,
        sectionKey: currentSection,
        provenance: {
          legacySource: relativePath
        }
      });
    });
    looseItems = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const heading = markdownHeadingMatch(trimmed);
    if (heading) {
      flushExplicit();
      flushLooseItems();
      pendingExplicit = heading;
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      flushExplicit();
      flushLooseItems();
      currentSection = trimmed.replace(/^##\s+/, "").trim() || "default";
      continue;
    }

    if (pendingExplicit) {
      if (/^###\s+/.test(trimmed)) {
        flushExplicit();
        pendingExplicit = markdownHeadingMatch(trimmed);
        continue;
      }
      if (trimmed) pendingContent.push(trimmed);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      looseItems.push(trimmed.replace(/^[-*]\s+/, "").trim());
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      looseItems.push(trimmed.replace(/^\d+\.\s+/, "").trim());
    }
  }

  flushExplicit();
  flushLooseItems();

  if (!items.length) {
    toParagraphs(String(text || "").replace(/^#.*$/gm, "").trim()).forEach((content, index) => {
      items.push({
        title: inferTitle("default", kind.replaceAll("_", " "), index + 1),
        content,
        kind,
        layer,
        profileKey,
        sectionKey: "default",
        provenance: { legacySource: relativePath }
      });
    });
  }

  return items.filter((item) => item.content);
}

function deriveRuleHintTitle(item = {}, index = 0) {
  const scope = item.subdomain || item.domain || item.documentType || item.targetStyle || `hint-${index + 1}`;
  return `${scope} rule hint`;
}

function deriveExampleTitle(item = {}, index = 0) {
  return String(item.topic || item.preferredTitle || item.requirementId || `example-${index + 1}`).trim();
}

function importKnowledgeItems({ layer, profileKey, knowledge = {}, relativePath = "" }) {
  const imported = [];
  const baseProvenance = { legacySource: relativePath };

  asStringArray(knowledge.generationPriorities).forEach((content, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "generation_priority",
      title: `generation priority ${index + 1}`,
      content,
      provenance: baseProvenance
    });
  });

  ensureArray(knowledge.examples).forEach((item, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "good_example",
      title: deriveExampleTitle(item, index),
      content: String(item?.requirementText || item?.content || "").trim(),
      structuredPayload: trimObject(item),
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#examples`
      }
    });
  });

  ensureArray(knowledge.ruleHints).forEach((item, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "rule_hint",
      title: deriveRuleHintTitle(item, index),
      content: "",
      structuredPayload: trimObject(item),
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#ruleHints`
      }
    });
  });

  asStringArray(knowledge.antiPatterns).forEach((content, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "anti_pattern",
      title: `anti pattern ${index + 1}`,
      content,
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#antiPatterns`
      }
    });
  });

  const sourcePolicy = knowledge.sourceOfTruthPolicy || {};
  if (sourcePolicy.standard) {
    imported.push({
      layer,
      profileKey,
      kind: "source_policy_setting",
      title: "source policy standard",
      structuredPayload: { key: "standard", value: sourcePolicy.standard },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.standard`
      }
    });
  }
  if (sourcePolicy.singleSourceOfTruth) {
    imported.push({
      layer,
      profileKey,
      kind: "source_policy_setting",
      title: "single source of truth",
      structuredPayload: { key: "singleSourceOfTruth", value: sourcePolicy.singleSourceOfTruth },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.singleSourceOfTruth`
      }
    });
  }
  if (sourcePolicy.forbidCodeStyleSignals !== undefined) {
    imported.push({
      layer,
      profileKey,
      kind: "source_policy_setting",
      title: "forbid code style signals",
      structuredPayload: { key: "forbidCodeStyleSignals", value: Boolean(sourcePolicy.forbidCodeStyleSignals) },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.forbidCodeStyleSignals`
      }
    });
  }

  asStringArray(sourcePolicy.codeStylePrefixes).forEach((content, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "code_style_prefix",
      title: `code style prefix ${index + 1}`,
      content,
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.codeStylePrefixes`
      }
    });
  });

  ensureArray(sourcePolicy.canonicalSignalAliases).forEach((item, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "source_alias",
      title: `source alias ${item?.canonical || index + 1}`,
      structuredPayload: trimObject(item),
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.canonicalSignalAliases`
      }
    });
  });

  ensureArray(sourcePolicy.normalizationRules).forEach((item, index) => {
    const payload =
      typeof item === "string"
        ? { pattern: item, replacement: "" }
        : trimObject(item);
    imported.push({
      layer,
      profileKey,
      kind: "normalization_rule",
      title: `normalization rule ${index + 1}`,
      structuredPayload: payload,
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.normalizationRules`
      }
    });
  });

  Object.entries(sourcePolicy.forbiddenExpansions || {}).forEach(([topic, entries], index) => {
    imported.push({
      layer,
      profileKey,
      kind: "forbidden_expansion",
      title: `forbidden expansion ${topic || index + 1}`,
      structuredPayload: {
        topic,
        entries: asStringArray(entries)
      },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#sourceOfTruthPolicy.forbiddenExpansions`
      }
    });
  });

  const blueprint = knowledge.documentBlueprint || {};
  if (blueprint.preferredFunctionSection) {
    imported.push({
      layer,
      profileKey,
      kind: "document_blueprint_section",
      title: `preferred function section ${blueprint.preferredFunctionSection.title || ""}`.trim(),
      structuredPayload: {
        role: "preferredFunctionSection",
        ...trimObject(blueprint.preferredFunctionSection)
      },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#documentBlueprint.preferredFunctionSection`
      }
    });
  }

  ensureArray(blueprint.preferredSubsections).forEach((item, index) => {
    imported.push({
      layer,
      profileKey,
      kind: "document_blueprint_section",
      title: `preferred subsection ${item?.title || index + 1}`,
      structuredPayload: {
        role: "preferredSubsection",
        ...trimObject(item)
      },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#documentBlueprint.preferredSubsections`
      }
    });
  });

  Object.entries(blueprint.targetOutputPolicy || {}).forEach(([key, value]) => {
    imported.push({
      layer,
      profileKey,
      kind: "document_blueprint_policy",
      title: `document blueprint policy ${key}`,
      structuredPayload: { key, value },
      provenance: {
        ...baseProvenance,
        legacySource: `${relativePath}#documentBlueprint.targetOutputPolicy`
      }
    });
  });

  return imported;
}

function renderMarkdownTitle(kind) {
  return {
    writing_rule: "Requirement Writing Rules",
    extraction_rule: "Requirement Extraction Rules",
    validation_rule: "Requirement Validation Rules",
    good_example: "Good Examples",
    bad_example: "Bad Examples"
  }[kind] || "Skill Items";
}

function renderMarkdownFromItems(kind, items = []) {
  const activeItems = items
    .filter((item) => item.status === "active" && item.kind === kind)
    .sort((left, right) => left.order - right.order);
  const sections = [`# ${renderMarkdownTitle(kind)}`];
  let currentSection = "";
  for (const item of activeItems) {
    const sectionKey = String(item.sectionKey || "default").trim();
    if (sectionKey && sectionKey !== "default" && sectionKey !== currentSection) {
      currentSection = sectionKey;
      sections.push(`\n## ${sectionKey}`);
    }
    sections.push(`\n### ${item.skillCode} ${item.title}\n${String(item.content || "").trim()}\n`);
  }
  return `${sections.join("\n").trim()}\n`;
}

function buildExamplePayload(item) {
  const structured = trimObject(item.structuredPayload);
  if (structured) {
    return {
      ...structured,
      requirementText: String(structured.requirementText || item.content || "").trim()
    };
  }
  return {
    topic: item.title,
    requirementText: String(item.content || "").trim()
  };
}

function buildKnowledgeFromItems(items = [], registryVersion = 1) {
  const activeItems = items.filter((item) => item.status === "active").sort((left, right) => left.order - right.order);
  const knowledge = {
    ...EMPTY_KNOWLEDGE,
    version: Math.max(Number(registryVersion || 1) || 1, 1),
    generationPriorities: [],
    examples: [],
    ruleHints: [],
    antiPatterns: []
  };

  const sourceOfTruthPolicy = {};
  const blueprint = {
    preferredSubsections: [],
    targetOutputPolicy: {}
  };

  for (const item of activeItems) {
    if (item.kind === "generation_priority") {
      if (item.content) knowledge.generationPriorities.push(item.content);
      continue;
    }
    if (item.kind === "good_example") {
      const payload = buildExamplePayload(item);
      if (payload.requirementText || payload.topic || payload.requirementId) {
        knowledge.examples.push(payload);
      }
      continue;
    }
    if (item.kind === "rule_hint" && item.structuredPayload) {
      knowledge.ruleHints.push(cloneJson(item.structuredPayload));
      continue;
    }
    if (item.kind === "anti_pattern") {
      if (item.content) knowledge.antiPatterns.push(item.content);
      continue;
    }
    if (item.kind === "source_alias" && item.structuredPayload) {
      sourceOfTruthPolicy.canonicalSignalAliases ||= [];
      sourceOfTruthPolicy.canonicalSignalAliases.push(cloneJson(item.structuredPayload));
      continue;
    }
    if (item.kind === "code_style_prefix") {
      sourceOfTruthPolicy.codeStylePrefixes ||= [];
      if (item.content) sourceOfTruthPolicy.codeStylePrefixes.push(item.content);
      continue;
    }
    if (item.kind === "forbidden_expansion" && item.structuredPayload) {
      sourceOfTruthPolicy.forbiddenExpansions ||= {};
      sourceOfTruthPolicy.forbiddenExpansions[item.structuredPayload.topic || item.title] = asStringArray(
        item.structuredPayload.entries || item.structuredPayload.items
      );
      continue;
    }
    if (item.kind === "normalization_rule" && item.structuredPayload) {
      sourceOfTruthPolicy.normalizationRules ||= [];
      sourceOfTruthPolicy.normalizationRules.push(cloneJson(item.structuredPayload));
      continue;
    }
    if (item.kind === "source_policy_setting" && item.structuredPayload?.key) {
      sourceOfTruthPolicy[item.structuredPayload.key] = item.structuredPayload.value;
      continue;
    }
    if (item.kind === "document_blueprint_section" && item.structuredPayload) {
      if (item.structuredPayload.role === "preferredFunctionSection") {
        blueprint.preferredFunctionSection = trimObject({
          title: item.structuredPayload.title,
          sectionNumber: item.structuredPayload.sectionNumber
        });
      } else {
        blueprint.preferredSubsections.push(
          trimObject({
            sectionNumber: item.structuredPayload.sectionNumber,
            title: item.structuredPayload.title,
            coreRequirementTypes: asStringArray(item.structuredPayload.coreRequirementTypes)
          })
        );
      }
      continue;
    }
    if (item.kind === "document_blueprint_policy" && item.structuredPayload?.key) {
      blueprint.targetOutputPolicy[item.structuredPayload.key] = item.structuredPayload.value;
    }
  }

  const normalizedPolicy = trimObject(sourceOfTruthPolicy);
  if (normalizedPolicy) {
    knowledge.sourceOfTruthPolicy = normalizedPolicy;
  }

  const normalizedBlueprint = trimObject({
    preferredFunctionSection: blueprint.preferredFunctionSection,
    preferredSubsections: blueprint.preferredSubsections.filter(Boolean),
    targetOutputPolicy: blueprint.targetOutputPolicy
  });
  if (normalizedBlueprint) {
    knowledge.documentBlueprint = normalizedBlueprint;
  }

  return knowledge;
}

function itemPreview(item = {}) {
  const base = String(item.content || item.structuredPayload?.requirementText || JSON.stringify(item.structuredPayload || {})).replace(/\s+/g, " ").trim();
  return base.length > 180 ? `${base.slice(0, 179)}…` : base;
}

function profileDocumentTypeScope(layer, profileKey) {
  return layer === "docType" ? profileKey : "";
}

function deriveTargetAreasFromItem(item = {}) {
  if (item.kind === "writing_rule") return ["writing"];
  if (item.kind === "extraction_rule") return ["extraction"];
  if (item.kind === "validation_rule") return ["validation"];
  if (item.kind === "good_example" || item.kind === "bad_example") return ["examples"];
  return ["domain_knowledge"];
}

export class SkillRegistryService {
  async loadManifest(skillDir = config.activeSkillDir) {
    return readJson(path.join(skillDir, "skill-manifest.json"), buildDefaultManifest());
  }

  async saveManifest(manifest, skillDir = config.activeSkillDir) {
    await writeJson(path.join(skillDir, "skill-manifest.json"), manifest);
  }

  async ensureProfileRegistry(layer, profileKey, skillDir = config.activeSkillDir, manifest = null) {
    const loadedManifest = manifest || (await this.loadManifest(skillDir));
    const resolved = resolveProfileConfig(loadedManifest, layer, profileKey);
    const normalizedLayer = resolved.layer;
    const normalizedKey = resolved.profileKey;
    const relativePath = resolved.configEntry?.registry || getRegistryRelativePath(normalizedLayer, normalizedKey);
    const registryPath = path.join(skillDir, relativePath);

    if (!(await pathExists(registryPath))) {
      const imported = await this.importProfileRegistry(normalizedLayer, normalizedKey, resolved.configEntry || { files: {} }, skillDir);
      await fs.mkdir(path.dirname(registryPath), { recursive: true });
      await writeJson(registryPath, imported);
      const activeKinds = imported.items.filter((item) => item.status === "active").map((item) => item.kind);
      const nextConfig = {
        ...(resolved.configEntry || {}),
        displayName: resolved.configEntry?.displayName || inferDisplayName(normalizedLayer, normalizedKey),
        documentTypeScope:
          resolved.configEntry?.documentTypeScope || profileDocumentTypeScope(normalizedLayer, normalizedKey),
        status: resolved.configEntry?.status || "active",
        registry: relativePath.replaceAll("\\", "/"),
        files: {
          ...(resolved.configEntry?.files || {}),
          ...getDefaultProfileFiles(normalizedLayer, normalizedKey, activeKinds)
        }
      };
      setProfileConfig(loadedManifest, normalizedLayer, normalizedKey, nextConfig);
      await this.saveManifest(loadedManifest, skillDir);
      await this.materializeProfile(normalizedLayer, normalizedKey, imported, skillDir, loadedManifest);
      return imported;
    }

    const existing = await readJson(registryPath, null);
    if (!existing || typeof existing !== "object") {
      throw createManagedError("Skill registry is unreadable", 500, "broken_skill_registry", {
        layer: normalizedLayer,
        profileKey: normalizedKey,
        relativePath
      });
    }

    let changed = false;
    const normalizedItems = assignSkillCodes(
      ensureArray(existing.items).map((item, index) => {
        const sanitized = sanitizeItem(item, {
          layer: normalizedLayer,
          profileKey: normalizedKey,
          order: index + 1
        });
        if (!sanitized.skillCode) {
          changed = true;
        }
        return sanitized;
      }),
      normalizedLayer,
      normalizedKey
    );

    const normalizedRegistry = {
      version: Math.max(Number(existing.version || 1) || 1, 1),
      layer: normalizedLayer,
      profileKey: normalizedKey,
      displayName: existing.displayName || inferDisplayName(normalizedLayer, normalizedKey),
      documentTypeScope:
        existing.documentTypeScope || profileDocumentTypeScope(normalizedLayer, normalizedKey),
      status: existing.status || "active",
      items: normalizedItems
        .sort((left, right) => left.order - right.order)
        .map((item, index) => ({ ...item, order: index + 1 }))
    };

    if (changed) {
      await writeJson(registryPath, normalizedRegistry);
    }

    const activeKinds = normalizedRegistry.items.filter((item) => item.status === "active").map((item) => item.kind);
    const nextConfig = {
      ...(resolved.configEntry || {}),
      displayName: normalizedRegistry.displayName,
      documentTypeScope: normalizedRegistry.documentTypeScope,
      status: normalizedRegistry.status,
      registry: relativePath.replaceAll("\\", "/"),
      files: {
        ...(resolved.configEntry?.files || {}),
        ...getDefaultProfileFiles(normalizedLayer, normalizedKey, activeKinds)
      }
    };
    setProfileConfig(loadedManifest, normalizedLayer, normalizedKey, nextConfig);
    if (changed || JSON.stringify(nextConfig) !== JSON.stringify(resolved.configEntry || {})) {
      await this.saveManifest(loadedManifest, skillDir);
    }

    return normalizedRegistry;
  }

  async importProfileRegistry(layer, profileKey, configEntry = {}, skillDir = config.activeSkillDir) {
    const normalizedLayer = normalizeLayer(layer);
    const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
    const files = configEntry.files || getDefaultProfileFiles(normalizedLayer, normalizedKey, []);
    const importedItems = [];

    for (const [role, relativeFiles] of Object.entries(files || {})) {
      for (const relativeFile of ensureArray(relativeFiles)) {
        if (!relativeFile) continue;
        const normalizedFile = String(relativeFile).replaceAll("\\", "/");
        const absolutePath = path.join(skillDir, normalizedFile);
        if (!(await pathExists(absolutePath))) continue;

        if (role === "domain-knowledge.json") {
          const knowledge = await readJson(absolutePath, EMPTY_KNOWLEDGE);
          importedItems.push(
            ...importKnowledgeItems({
              layer: normalizedLayer,
              profileKey: normalizedKey,
              knowledge,
              relativePath: normalizedFile
            })
          );
          continue;
        }

        const kind = FILE_TO_MARKDOWN_KIND[String(role).replaceAll("\\", "/")] || FILE_TO_MARKDOWN_KIND[normalizedFile];
        if (!kind) continue;
        const text = await fs.readFile(absolutePath, "utf8");
        importedItems.push(
          ...parseMarkdownAsItems({
            text,
            layer: normalizedLayer,
            profileKey: normalizedKey,
            kind,
            relativePath: normalizedFile
          })
        );
      }
    }

    const importedAt = now();
    const items = importedItems.map((item, index) =>
      createRegistryItem(item, {
        layer: normalizedLayer,
        profileKey: normalizedKey,
        order: index + 1,
        provenance: {
          ...item.provenance,
          migrationBatchId: importedAt
        }
      })
    );

    const withCodes = assignSkillCodes(items, normalizedLayer, normalizedKey);

    return {
      version: 1,
      layer: normalizedLayer,
      profileKey: normalizedKey,
      displayName: configEntry.displayName || inferDisplayName(normalizedLayer, normalizedKey),
      documentTypeScope: configEntry.documentTypeScope || profileDocumentTypeScope(normalizedLayer, normalizedKey),
      status: configEntry.status || "active",
      items: withCodes
    };
  }

  computeNextSequence(items = [], kind = "") {
    const normalizedKind = normalizeKind(kind);
    return (
      ensureArray(items).reduce((max, item) => {
        if ((item.kind || "") !== normalizedKind) return max;
        const parsed = parseSkillCode(item.skillCode);
        return Math.max(max, parsed?.sequence || 0);
      }, 0) + 1
    );
  }

  async ensureAllRegistries(skillDir = config.activeSkillDir) {
    const manifest = await this.loadManifest(skillDir);
    await this.ensureProfileRegistry("generic", "generic", skillDir, manifest);
    for (const [profileKey] of Object.entries(manifest?.profiles?.docTypes || {})) {
      await this.ensureProfileRegistry("docType", profileKey, skillDir, manifest);
    }
    for (const [profileKey] of Object.entries(manifest?.profiles?.domains || {})) {
      await this.ensureProfileRegistry("domain", profileKey, skillDir, manifest);
    }
    for (const [profileKey] of Object.entries(manifest?.profiles?.modules || {})) {
      await this.ensureProfileRegistry("module", profileKey, skillDir, manifest);
    }
    return this.loadManifest(skillDir);
  }

  async loadProfileRegistry(layer, profileKey, skillDir = config.activeSkillDir) {
    const manifest = await this.ensureAllRegistries(skillDir);
    const resolved = resolveProfileConfig(manifest, layer, profileKey);
    if (!resolved.configEntry) {
      throw createManagedError("Skill profile not found", 404, "skill_profile_not_found", { layer, profileKey });
    }
    const relativePath = resolved.configEntry.registry || getRegistryRelativePath(resolved.layer, resolved.profileKey);
    const registry = await readJson(path.join(skillDir, relativePath), null);
    if (!registry) {
      throw createManagedError("Skill registry not found", 404, "skill_registry_not_found", {
        layer: resolved.layer,
        profileKey: resolved.profileKey
      });
    }
    return registry;
  }

  async saveProfileRegistry(layer, profileKey, registry, skillDir = config.activeSkillDir) {
    const manifest = await this.ensureAllRegistries(skillDir);
    const resolved = resolveProfileConfig(manifest, layer, profileKey);
    const relativePath =
      resolved.configEntry?.registry || getRegistryRelativePath(normalizeLayer(layer), resolved.profileKey || profileKey);
    const nextRegistry = {
      version: Math.max(Number(registry.version || 1) || 1, 1),
      layer: normalizeLayer(layer),
      profileKey: resolved.profileKey || normalizeProfileKey(profileKey),
      displayName: registry.displayName || inferDisplayName(normalizeLayer(layer), resolved.profileKey || profileKey),
      documentTypeScope:
        registry.documentTypeScope || profileDocumentTypeScope(normalizeLayer(layer), resolved.profileKey || profileKey),
      status: registry.status || "active",
      items: ensureArray(registry.items)
        .map((item, index) => sanitizeItem(item, { layer, profileKey, order: index + 1 }))
        .sort((left, right) => left.order - right.order)
        .map((item, index) => ({ ...item, order: index + 1 }))
    };
    await fs.mkdir(path.dirname(path.join(skillDir, relativePath)), { recursive: true });
    await writeJson(path.join(skillDir, relativePath), nextRegistry);
    await this.materializeProfile(layer, profileKey, nextRegistry, skillDir, manifest);
    return nextRegistry;
  }

  async materializeProfile(layer, profileKey, registry, skillDir = config.activeSkillDir, manifestOverride = null) {
    const manifest = manifestOverride || (await this.ensureAllRegistries(skillDir));
    const normalizedLayer = normalizeLayer(layer);
    const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
    const activeKinds = ensureArray(registry.items)
      .filter((item) => item.status === "active")
      .map((item) => item.kind);

    const configEntry = {
      ...(resolveProfileConfig(manifest, normalizedLayer, normalizedKey).configEntry || {}),
      displayName: registry.displayName || inferDisplayName(normalizedLayer, normalizedKey),
      documentTypeScope: registry.documentTypeScope || profileDocumentTypeScope(normalizedLayer, normalizedKey),
      status: registry.status || "active",
      registry: getRegistryRelativePath(normalizedLayer, normalizedKey),
      files: getDefaultProfileFiles(normalizedLayer, normalizedKey, activeKinds)
    };
    setProfileConfig(manifest, normalizedLayer, normalizedKey, configEntry);
    await this.saveManifest(manifest, skillDir);

    const markdownEntries = Object.entries(MARKDOWN_KIND_TO_FILE);
    for (const [kind, targetFile] of markdownEntries) {
      const relativePath = configEntry.files?.[targetFile.replaceAll("\\", "/")]?.[0];
      if (!relativePath) continue;
      const absolutePath = path.join(skillDir, relativePath);
      const filtered = registry.items.filter((item) => item.kind === kind && item.status === "active");
      if (filtered.length) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, renderMarkdownFromItems(kind, registry.items), "utf8");
      } else {
        await fs.rm(absolutePath, { force: true }).catch(() => {});
      }
    }

    const knowledgePath = configEntry.files?.["domain-knowledge.json"]?.[0];
    if (knowledgePath) {
      const absolutePath = path.join(skillDir, knowledgePath);
      const knowledge = buildKnowledgeFromItems(registry.items, registry.version);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await writeJson(absolutePath, knowledge);
    }
  }

  async materializeAll(skillDir = config.activeSkillDir) {
    const manifest = await this.ensureAllRegistries(skillDir);
    const profiles = [
      { layer: "generic", profileKey: "generic" },
      ...Object.keys(manifest?.profiles?.docTypes || {}).map((profileKey) => ({ layer: "docType", profileKey })),
      ...Object.keys(manifest?.profiles?.domains || {}).map((profileKey) => ({ layer: "domain", profileKey })),
      ...Object.keys(manifest?.profiles?.modules || {}).map((profileKey) => ({ layer: "module", profileKey }))
    ];
    for (const profile of profiles) {
      const registry = await this.loadProfileRegistry(profile.layer, profile.profileKey, skillDir);
      await this.materializeProfile(profile.layer, profile.profileKey, registry, skillDir, manifest);
    }
    return this.getRegistryIndex(skillDir);
  }

  async getRegistryIndex(skillDir = config.activeSkillDir, filters = {}) {
    const manifest = await this.ensureAllRegistries(skillDir);
    const profiles = [];
    const items = [];
    const addProfile = async (layer, profileKey) => {
      const registry = await this.loadProfileRegistry(layer, profileKey, skillDir);
      const configEntry = resolveProfileConfig(manifest, layer, profileKey).configEntry || {};
      const fileSummary = Object.entries(configEntry.files || {}).flatMap(([role, relativeFiles]) =>
        ensureArray(relativeFiles).map((relativePath) => ({
          role,
          relativePath,
          absolutePath: path.join(skillDir, relativePath)
        }))
      );

      const filteredItems = ensureArray(registry.items)
        .filter((item) => (filters.includeDeprecated ? true : item.status !== "deprecated"))
        .filter((item) => (filters.kind ? item.kind === filters.kind : true))
        .filter((item) => (filters.query ? JSON.stringify(item).toLowerCase().includes(String(filters.query).toLowerCase()) : true))
        .sort((left, right) => left.order - right.order);

      profiles.push({
        layer,
        profileKey,
        displayName: registry.displayName || inferDisplayName(layer, profileKey),
        documentTypeScope: registry.documentTypeScope || profileDocumentTypeScope(layer, profileKey),
        status: registry.status || "active",
        registryPath: configEntry.registry || getRegistryRelativePath(layer, profileKey),
        files: fileSummary,
        itemCount: filteredItems.length,
        items: filteredItems.map((item) => ({
          skillCode: item.skillCode,
          layer: item.layer,
          profileKey: item.profileKey,
          kind: item.kind,
          title: item.title,
          status: item.status,
          order: item.order,
          preview: itemPreview(item),
          targetAreas: deriveTargetAreasFromItem(item),
          provenance: cloneJson(item.provenance || {}),
          review: cloneJson(item.review || {})
        }))
      });

      items.push(
        ...filteredItems.map((item) => ({
          ...cloneJson(item),
          displayName: registry.displayName || inferDisplayName(layer, profileKey),
          documentTypeScope: registry.documentTypeScope || profileDocumentTypeScope(layer, profileKey),
          registryPath: configEntry.registry || getRegistryRelativePath(layer, profileKey),
          targetAreas: deriveTargetAreasFromItem(item),
          preview: itemPreview(item)
        }))
      );
    };

    await addProfile("generic", "generic");
    for (const profileKey of Object.keys(manifest?.profiles?.docTypes || {})) {
      await addProfile("docType", profileKey);
    }
    for (const profileKey of Object.keys(manifest?.profiles?.domains || {})) {
      await addProfile("domain", profileKey);
    }
    for (const profileKey of Object.keys(manifest?.profiles?.modules || {})) {
      await addProfile("module", profileKey);
    }

    return {
      manifest,
      profiles,
      items,
      bySkillCode: Object.fromEntries(items.map((item) => [item.skillCode, item]))
    };
  }

  async getItem(skillCode, skillDir = config.activeSkillDir) {
    const index = await this.getRegistryIndex(skillDir, { includeDeprecated: true });
    const item = index.bySkillCode[String(skillCode || "").trim()];
    if (!item) {
      throw createManagedError("Skill item not found", 404, "skill_item_not_found", { skillCode });
    }
    return item;
  }

  async createItem(payload = {}, skillDir = config.activeSkillDir) {
    const layer = normalizeLayer(payload.layer);
    const profileKey = layer === "generic" ? "generic" : normalizeProfileKey(payload.profileKey);
    const registry = await this.loadProfileRegistry(layer, profileKey, skillDir);
    const kind = normalizeKind(payload.kind);
    const item = sanitizeItem(
      {
        ...payload,
        layer,
        profileKey,
        kind,
        order: payload.order || registry.items.length + 1
      },
      {
        layer,
        profileKey,
        kind,
        status: payload.status || "active",
        createdAt: now(),
        updatedAt: now()
      }
    );
    item.skillCode = buildSkillCode(layer, profileKey, kind, this.computeNextSequence(registry.items, kind));
    registry.items.push(item);
    registry.items = registry.items
      .sort((left, right) => left.order - right.order)
      .map((entry, index) => ({ ...entry, order: index + 1 }));
    await this.saveProfileRegistry(layer, profileKey, registry, skillDir);
    return this.getItem(item.skillCode, skillDir);
  }

  async updateItem(skillCode, payload = {}, skillDir = config.activeSkillDir) {
    const current = await this.getItem(skillCode, skillDir);
    const nextLayer = normalizeLayer(payload.layer || current.layer);
    const nextProfileKey = nextLayer === "generic" ? "generic" : normalizeProfileKey(payload.profileKey || current.profileKey);
    const currentRegistry = await this.loadProfileRegistry(current.layer, current.profileKey, skillDir);
    const targetRegistry =
      nextLayer === current.layer && nextProfileKey === current.profileKey
        ? currentRegistry
        : await this.loadProfileRegistry(nextLayer, nextProfileKey, skillDir);

    const existingIndex = currentRegistry.items.findIndex((item) => item.skillCode === current.skillCode);
    if (existingIndex < 0) {
      throw createManagedError("Skill item not found in source registry", 404, "skill_item_missing_in_registry", { skillCode });
    }

    const updated = sanitizeItem(
      {
        ...current,
        ...payload,
        skillCode: current.skillCode,
        layer: nextLayer,
        profileKey: nextProfileKey,
        kind: payload.kind || current.kind,
        updatedAt: now()
      },
      current
    );

    currentRegistry.items.splice(existingIndex, 1);
    if (nextLayer === current.layer && nextProfileKey === current.profileKey) {
      targetRegistry.items.splice(existingIndex, 0, updated);
      targetRegistry.items = targetRegistry.items
        .sort((left, right) => left.order - right.order)
        .map((item, index) => ({ ...item, order: index + 1 }));
      await this.saveProfileRegistry(nextLayer, nextProfileKey, targetRegistry, skillDir);
      return this.getItem(updated.skillCode, skillDir);
    }

    currentRegistry.items = currentRegistry.items
      .sort((left, right) => left.order - right.order)
      .map((item, index) => ({ ...item, order: index + 1 }));
    targetRegistry.items.push({
      ...updated,
      order: targetRegistry.items.length + 1
    });
    targetRegistry.items = targetRegistry.items
      .sort((left, right) => left.order - right.order)
      .map((item, index) => ({ ...item, order: index + 1 }));

    await this.saveProfileRegistry(current.layer, current.profileKey, currentRegistry, skillDir);
    await this.saveProfileRegistry(nextLayer, nextProfileKey, targetRegistry, skillDir);
    return this.getItem(updated.skillCode, skillDir);
  }

  async deleteItem(skillCode, skillDir = config.activeSkillDir) {
    const current = await this.getItem(skillCode, skillDir);
    const registry = await this.loadProfileRegistry(current.layer, current.profileKey, skillDir);
    const index = registry.items.findIndex((item) => item.skillCode === current.skillCode);
    if (index < 0) {
      throw createManagedError("Skill item not found in registry", 404, "skill_item_missing_in_registry", { skillCode });
    }
    registry.items.splice(index, 1);
    registry.items = registry.items
      .sort((left, right) => left.order - right.order)
      .map((item, nextIndex) => ({ ...item, order: nextIndex + 1 }));
    await this.saveProfileRegistry(current.layer, current.profileKey, registry, skillDir);
    return {
      removed: true,
      skillCode: current.skillCode
    };
  }

  async reorderItem(skillCode, payload = {}, skillDir = config.activeSkillDir) {
    const current = await this.getItem(skillCode, skillDir);
    const registry = await this.loadProfileRegistry(current.layer, current.profileKey, skillDir);
    const index = registry.items.findIndex((item) => item.skillCode === current.skillCode);
    if (index < 0) {
      throw createManagedError("Skill item not found in registry", 404, "skill_item_missing_in_registry", { skillCode });
    }

    const items = [...registry.items].sort((left, right) => left.order - right.order);
    const [target] = items.splice(index, 1);
    const requestedOrder = Number(payload.order);
    const nextIndex = Number.isFinite(requestedOrder)
      ? Math.max(0, Math.min(items.length, requestedOrder - 1))
      : Math.max(0, Math.min(items.length, index + (payload.direction === "down" ? 1 : -1)));
    items.splice(nextIndex, 0, target);
    registry.items = items.map((item, itemIndex) => ({ ...item, order: itemIndex + 1, updatedAt: item.skillCode === skillCode ? now() : item.updatedAt }));
    await this.saveProfileRegistry(current.layer, current.profileKey, registry, skillDir);
    return this.getItem(skillCode, skillDir);
  }

  async replaceKnowledgeItems(layer, profileKey, knowledge = {}, skillDir = config.activeSkillDir) {
    const registry = await this.loadProfileRegistry(layer, profileKey, skillDir);
    const retained = registry.items.filter(
      (item) =>
        ![
          "generation_priority",
          "good_example",
          "rule_hint",
          "anti_pattern",
          "source_alias",
          "code_style_prefix",
          "forbidden_expansion",
          "normalization_rule",
          "source_policy_setting",
          "document_blueprint_section",
          "document_blueprint_policy"
        ].includes(item.kind)
    );
    const imported = importKnowledgeItems({
      layer: normalizeLayer(layer),
      profileKey: layer === "generic" ? "generic" : normalizeProfileKey(profileKey),
      knowledge,
      relativePath: `${getProfileRelativeDir(normalizeLayer(layer), normalizeProfileKey(profileKey)).replaceAll("\\", "/")}/domain-knowledge.json`
    }).map((item, index) =>
      sanitizeItem(item, {
        layer,
        profileKey,
        order: retained.length + index + 1,
        createdAt: now(),
        updatedAt: now()
      })
    );

    const nextItems = assignSkillCodes(
      [...retained, ...imported],
      normalizeLayer(layer),
      normalizeLayer(layer) === "generic" ? "generic" : normalizeProfileKey(profileKey)
    ).map((item, index) => ({ ...item, order: index + 1 }));
    registry.version = Math.max(Number(knowledge.version || registry.version || 1) || 1, 1);
    registry.items = nextItems;
    await this.saveProfileRegistry(layer, profileKey, registry, skillDir);
    return registry;
  }

  async listRelevantItems({ documentType = "software_requirement", domain = "", moduleSkillKey = "", targetAreas = [], limit = 20 } = {}, skillDir = config.activeSkillDir) {
    const index = await this.getRegistryIndex(skillDir, { includeDeprecated: false });
    const normalizedDocumentType = normalizeProfileKey(documentType || "software_requirement");
    const normalizedDomain = normalizeProfileKey(domain || "");
    const normalizedModule = normalizeProfileKey(moduleSkillKey || "");
    const allowedKinds = new Set();

    for (const area of ensureArray(targetAreas)) {
      if (area === "writing") {
        ["writing_rule", "good_example", "rule_hint", "generation_priority"].forEach((kind) => allowedKinds.add(kind));
      } else if (area === "extraction") {
        ["extraction_rule", "rule_hint", "generation_priority"].forEach((kind) => allowedKinds.add(kind));
      } else if (area === "examples") {
        ["good_example", "bad_example", "anti_pattern"].forEach((kind) => allowedKinds.add(kind));
      } else if (area === "domain_knowledge") {
        [
          "generation_priority",
          "rule_hint",
          "anti_pattern",
          "source_alias",
          "code_style_prefix",
          "forbidden_expansion",
          "normalization_rule",
          "source_policy_setting",
          "document_blueprint_section",
          "document_blueprint_policy"
        ].forEach((kind) => allowedKinds.add(kind));
      } else {
        ["validation_rule", "anti_pattern", "rule_hint"].forEach((kind) => allowedKinds.add(kind));
      }
    }

    const selected = index.items
      .filter((item) => {
        if (!allowedKinds.size) return true;
        return allowedKinds.has(item.kind);
      })
      .filter((item) => {
        if (item.layer === "docType") return item.profileKey === normalizedDocumentType;
        if (item.layer === "domain") return !normalizedDomain || item.profileKey === normalizedDomain;
        if (item.layer === "module") return !normalizedModule || item.profileKey === normalizedModule;
        return true;
      })
      .sort((left, right) => {
        const scoreLeft = this.scoreRelevantItem(left, { documentType: normalizedDocumentType, domain: normalizedDomain, moduleSkillKey: normalizedModule, targetAreas });
        const scoreRight = this.scoreRelevantItem(right, { documentType: normalizedDocumentType, domain: normalizedDomain, moduleSkillKey: normalizedModule, targetAreas });
        return scoreRight - scoreLeft || left.order - right.order;
      })
      .slice(0, limit)
      .map((item) => ({
        skillCode: item.skillCode,
        layer: item.layer,
        profileKey: item.profileKey,
        kind: item.kind,
        title: item.title,
        content: item.content,
        contentSummary: item.preview,
        whyRelevant: this.describeRelevance(item, {
          documentType: normalizedDocumentType,
          domain: normalizedDomain,
          moduleSkillKey: normalizedModule,
          targetAreas
        })
      }));

    return selected;
  }

  scoreRelevantItem(item, context = {}) {
    let score = 0;
    if (item.layer === "generic") score += 5;
    if (item.layer === "docType" && item.profileKey === context.documentType) score += 12;
    if (item.layer === "domain" && item.profileKey === context.domain) score += 16;
    if (item.layer === "module" && item.profileKey === context.moduleSkillKey) score += 20;
    if (context.targetAreas?.includes("examples") && ["good_example", "bad_example"].includes(item.kind)) score += 8;
    if (context.targetAreas?.includes("writing") && item.kind === "writing_rule") score += 8;
    if (context.targetAreas?.includes("validation") && item.kind === "validation_rule") score += 8;
    if (context.targetAreas?.includes("extraction") && item.kind === "extraction_rule") score += 8;
    if (context.targetAreas?.includes("domain_knowledge") && KNOWLEDGE_ITEM_KINDS.has(item.kind)) score += 6;
    return score;
  }

  describeRelevance(item, context = {}) {
    const parts = [];
    if (item.layer === "docType" && item.profileKey === context.documentType) parts.push("matched current docType");
    if (item.layer === "domain" && item.profileKey === context.domain) parts.push("matched current domain");
    if (item.layer === "module" && item.profileKey === context.moduleSkillKey) parts.push("matched current module");
    if (!parts.length && item.layer === "generic") parts.push("generic baseline rule");
    if (!parts.length) parts.push("same target area");
    return parts.join("; ");
  }

  async findBestTarget({ layer, profileKey, kind, query = "" } = {}, skillDir = config.activeSkillDir) {
    const registry = await this.loadProfileRegistry(layer, profileKey, skillDir);
    const normalizedKind = normalizeKind(kind);
    const haystackTokens = String(query || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter(Boolean);
    const candidates = registry.items
      .filter((item) => item.status === "active" && item.kind === normalizedKind)
      .map((item) => ({
        item,
        score: haystackTokens.reduce((sum, token) => {
          const haystack = `${item.title} ${item.content} ${JSON.stringify(item.structuredPayload || {})}`.toLowerCase();
          return sum + (haystack.includes(token) ? 1 : 0);
        }, 0)
      }))
      .sort((left, right) => right.score - left.score || left.item.order - right.item.order);
    return candidates[0]?.item || null;
  }

  async removeProfile(layer, profileKey, skillDir = config.activeSkillDir) {
    const normalizedLayer = normalizeLayer(layer);
    if (normalizedLayer === "generic") {
      throw createManagedError("Generic profile cannot be removed", 400, "generic_profile_remove_blocked");
    }
    const manifest = await this.ensureAllRegistries(skillDir);
    const resolved = resolveProfileConfig(manifest, normalizedLayer, profileKey);
    if (!resolved.configEntry) {
      throw createManagedError("Skill profile not found", 404, "skill_profile_not_found", { layer, profileKey });
    }
    const registryPath = path.join(skillDir, resolved.configEntry.registry || getRegistryRelativePath(normalizedLayer, resolved.profileKey));
    const relativeDir = getProfileRelativeDir(normalizedLayer, resolved.profileKey);
    await fs.rm(path.join(skillDir, relativeDir), { recursive: true, force: true }).catch(() => {});
    await fs.rm(registryPath, { force: true }).catch(() => {});
    deleteProfileConfig(manifest, normalizedLayer, resolved.profileKey);
    await this.saveManifest(manifest, skillDir);
    return {
      removed: true,
      layer: normalizedLayer,
      profileKey: resolved.profileKey
    };
  }
}
