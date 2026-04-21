import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { pathExists, readJson, writeJson } from "./storage.js";
import { SkillDatabaseService } from "./skill-database-service.js";
import {
  ALLOWED_KINDS_BY_AREA,
  isKindAllowedForLayer
} from "../../public/skill-kind-matrix.js";

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

const TEXT_TRUTH_STRUCTURED_KINDS = new Set([
  "source_alias",
  "normalization_rule",
  "source_policy_setting",
  "forbidden_expansion",
  "document_blueprint_section",
  "document_blueprint_policy",
  "rule_hint"
]);

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

async function collectRegistryFileMetadata(skillDir, relativeDir = path.join("profiles")) {
  const baseDir = path.join(skillDir, relativeDir);
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const entryRelativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRegistryFileMetadata(skillDir, entryRelativePath)));
      continue;
    }

    if (!entry.isFile() || entry.name !== "skill-items.json") {
      continue;
    }

    const absolutePath = path.join(skillDir, entryRelativePath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat) continue;
    files.push({
      relativePath: entryRelativePath.replaceAll("\\", "/"),
      size: stat.size,
      mtimeMs: Math.floor(stat.mtimeMs)
    });
  }

  return files;
}

async function buildRegistrySourceSignature(skillDir = config.activeSkillDir) {
  const trackedFiles = [];
  const manifestPath = path.join(skillDir, "skill-manifest.json");
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (manifestStat) {
    trackedFiles.push({
      relativePath: "skill-manifest.json",
      size: manifestStat.size,
      mtimeMs: Math.floor(manifestStat.mtimeMs)
    });
  }

  trackedFiles.push(...(await collectRegistryFileMetadata(skillDir)));
  trackedFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return JSON.stringify(trackedFiles);
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

function assertKindAllowedInLayer(layer = "", kind = "") {
  if (isKindAllowedForLayer(layer, kind)) {
    return;
  }
  throw createManagedError("Skill item kind is not allowed in target layer", 400, "skill_kind_not_allowed_for_layer", {
    layer,
    kind
  });
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

function trimSnapshotValue(value) {
  if (Array.isArray(value)) {
    const next = value
      .map((item) => trimSnapshotValue(item))
      .filter((item) => item !== undefined);
    return next.length ? next : undefined;
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
    const normalized = trimSnapshotValue(entry);
    if (normalized !== undefined) {
      next[key] = normalized;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

function isTextTruthStructuredKind(kind = "") {
  return TEXT_TRUTH_STRUCTURED_KINDS.has(String(kind || "").trim());
}

function formatBooleanText(value) {
  if (value === true) return "是";
  if (value === false) return "否";
  return String(value ?? "").trim();
}

function formatInlineValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

function parseLooseValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(true|false)$/i.test(text)) {
    return text.toLowerCase() === "true";
  }
  if (text === "是") return true;
  if (text === "否") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseStructuredTextSections(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const sections = new Map();
  let currentLabel = "";

  const ensureSection = (label) => {
    if (!sections.has(label)) {
      sections.set(label, { value: "", list: [] });
    }
    return sections.get(label);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      currentLabel = "";
      continue;
    }

    const labeled = /^([^：:]+)[：:]\s*(.*)$/.exec(line);
    if (labeled) {
      currentLabel = labeled[1].trim();
      const section = ensureSection(currentLabel);
      section.value = labeled[2].trim();
      continue;
    }

    if (currentLabel && /^[-*]\s+/.test(line)) {
      ensureSection(currentLabel).list.push(line.replace(/^[-*]\s+/, "").trim());
      continue;
    }

    if (currentLabel) {
      const section = ensureSection(currentLabel);
      section.value = section.value ? `${section.value}\n${line}` : line;
    }
  }

  return sections;
}

function sectionValue(sections, label) {
  return sections.get(label)?.value?.trim() || "";
}

function sectionList(sections, label) {
  return (sections.get(label)?.list || []).map((item) => String(item || "").trim()).filter(Boolean);
}

function describeSourcePolicySettingKey(key = "", value) {
  const normalizedKey = String(key || "").trim();
  if (normalizedKey === "standard") {
    return `当前技能库参考的标准是 ${formatInlineValue(value)}。`;
  }
  if (normalizedKey === "singleSourceOfTruth") {
    return value ? "启用单一事实来源约束，存在冲突时优先回到指定事实来源。" : "未启用单一事实来源约束。";
  }
  if (normalizedKey === "forbidCodeStyleSignals") {
    return value ? "正文不允许直接沿用代码风格信号名，应优先回到规范术语。" : "正文允许保留代码风格信号名。";
  }
  return "用于约束事实来源、术语引用或正文边界。";
}

function describeBlueprintPolicyKey(key = "", value) {
  const normalizedKey = String(key || "").trim();
  if (normalizedKey === "coreFirst") {
    return value ? "优先先铺开核心章节和核心规则，再补充外围内容。" : "不强制核心优先，允许按其它结构组织章节。";
  }
  if (normalizedKey === "preferSymmetricExpansion") {
    return value ? "优先按对象或轴对称展开章节和需求。" : "不要求按对象或轴对称展开。";
  }
  if (normalizedKey === "preferObjectSpecificRequirements") {
    return value ? "优先写面向具体对象的需求，而不是泛化描述。" : "允许使用更泛化的需求组织方式。";
  }
  if (normalizedKey === "discourageGenericScatterRequirements") {
    return value ? "避免把需求打散成泛化、零散的条目。" : "允许更分散的泛化条目组织方式。";
  }
  return "用于约束文档蓝图的章节组织方式和展开偏好。";
}

function describeBlueprintSectionRole(role = "") {
  if (role === "preferredFunctionSection") {
    return "作为优先功能章节";
  }
  if (role === "preferredSubsection") {
    return "作为优先子章节";
  }
  return "作为文档蓝图章节";
}

function joinChineseList(values = []) {
  return asStringArray(values).join("、");
}

function inferStructuredKeyFromTitle(kind, title = "") {
  const normalized = String(title || "").trim();
  if (!normalized) return "";
  if (kind === "document_blueprint_policy") {
    const match = /document blueprint policy\s+(.+)$/i.exec(normalized);
    return match ? match[1].trim() : "";
  }
  if (kind === "source_policy_setting") {
    if (/source policy standard/i.test(normalized)) return "standard";
    if (/single source of truth/i.test(normalized)) return "singleSourceOfTruth";
    if (/forbid code style signals/i.test(normalized)) return "forbidCodeStyleSignals";
    return "";
  }
  if (kind === "document_blueprint_section") {
    if (/^preferred function section\b/i.test(normalized)) return "preferredFunctionSection";
    if (/^preferred subsection\b/i.test(normalized)) return "preferredSubsection";
    return "";
  }
  return "";
}

function hasLegacyStructuredMarkers(kind, content = "") {
  const markersByKind = {
    source_alias: ["标准名称：", "可接受别名：", "使用规则："],
    normalization_rule: ["原始表达：", "统一表达：", "使用规则："],
    source_policy_setting: ["策略名称：", "策略值：", "策略说明："],
    forbidden_expansion: ["适用主题：", "禁止扩写项：", "使用规则："],
    document_blueprint_section: ["蓝图角色：", "章节标题：", "章节编号：", "核心需求类型："],
    document_blueprint_policy: ["蓝图策略：", "策略值：", "策略含义："],
    rule_hint: ["适用领域：", "适用文档类型：", "适用子域：", "章节提示：", "写作模式：", "目标风格：", "来源依据："]
  };
  return (markersByKind[kind] || []).some((marker) => String(content || "").includes(marker));
}

function formatStructuredContent(kind, payload = {}) {
  const trimmed = trimObject(cloneJson(payload)) || {};

  if (kind === "source_alias") {
    const aliases = asStringArray(trimmed.aliases);
    if (trimmed.canonical && aliases.length) {
      return `生成、抽取和审核时，统一将 ${joinChineseList(aliases)} 视为标准名称 ${trimmed.canonical}。`;
    }
    if (trimmed.canonical) {
      return `生成、抽取和审核时，统一使用标准名称 ${trimmed.canonical}。`;
    }
    return "";
  }

  if (kind === "normalization_rule") {
    if (trimmed.pattern && trimmed.replacement) {
      return `出现“${trimmed.pattern}”时，统一写作“${trimmed.replacement}”。`;
    }
    return trimmed.replacement || trimmed.pattern || "";
  }

  if (kind === "source_policy_setting") {
    return describeSourcePolicySettingKey(trimmed.key, trimmed.value);
  }

  if (kind === "forbidden_expansion") {
    const entries = asStringArray(trimmed.entries || trimmed.items);
    if (trimmed.topic && entries.length) {
      return `涉及 ${trimmed.topic} 时，不要额外扩写 ${joinChineseList(entries)}。`;
    }
    return entries.length ? `不要额外扩写 ${joinChineseList(entries)}。` : "";
  }

  if (kind === "document_blueprint_section") {
    const parts = [];
    if (trimmed.title) {
      parts.push(`文档蓝图中，${describeBlueprintSectionRole(trimmed.role)}“${trimmed.title}”。`);
    }
    if (trimmed.sectionNumber && trimmed.sectionNumber !== "-") {
      parts.push(`建议章节编号使用 ${trimmed.sectionNumber}。`);
    }
    const coreRequirementTypes = asStringArray(trimmed.coreRequirementTypes).filter((item) => item && item !== "-" && item !== "无");
    if (coreRequirementTypes.length) {
      parts.push(`该章节主要承载 ${joinChineseList(coreRequirementTypes)} 类需求。`);
    }
    return parts.join("");
  }

  if (kind === "document_blueprint_policy") {
    return describeBlueprintPolicyKey(trimmed.key, trimmed.value);
  }

  if (kind === "rule_hint") {
    const scope = [trimmed.domain, trimmed.documentType, trimmed.subdomain].filter((item) => item && item !== "-");
    const parts = [];
    if (scope.length) {
      parts.push(`在 ${scope.join(" / ")} 范围内，`);
    }
    const sectionHints = asStringArray(trimmed.sectionHints);
    if (sectionHints.length) {
      parts.push(`优先关注 ${joinChineseList(sectionHints)}。`);
    }
    if (trimmed.writingPattern) {
      parts.push(`写作时采用 ${trimmed.writingPattern}。`);
    }
    if (trimmed.targetStyle) {
      parts.push(`目标风格保持 ${trimmed.targetStyle}。`);
    }
    const sourceBasis = asStringArray(trimmed.sourceBasis);
    if (sourceBasis.length) {
      parts.push(`可以优先参考 ${joinChineseList(sourceBasis)}。`);
    }
    return parts.join("");
  }

  return "";
}

function parseStructuredContent(kind, content = "", fallbackPayload = null, titleHint = "") {
  const text = String(content || "").trim();
  if (!text) {
    return trimObject(cloneJson(fallbackPayload)) || null;
  }

  const sections = parseStructuredTextSections(text);

  if (kind === "source_alias") {
    const sectionCanonical = sectionValue(sections, "标准名称");
    const sectionAliases = sectionList(sections, "可接受别名");
    if (sectionCanonical || sectionAliases.length) {
      return trimObject({
        canonical: sectionCanonical || fallbackPayload?.canonical,
        aliases: sectionAliases.length ? sectionAliases : fallbackPayload?.aliases
      }) || null;
    }
    let match = /^.*?统一将\s+(.+?)\s+视为标准名称\s+(.+?)。?$/u.exec(text);
    if (match) {
      return trimObject({
        canonical: match[2].trim(),
        aliases: match[1]
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
      }) || null;
    }
    match = /^.*?统一使用标准名称\s+(.+?)。?$/u.exec(text);
    if (match) {
      return trimObject({
        canonical: match[1].trim(),
        aliases: fallbackPayload?.aliases
      }) || null;
    }
    return trimObject(cloneJson(fallbackPayload)) || null;
  }

  if (kind === "normalization_rule") {
    const sectionPattern = sectionValue(sections, "原始表达");
    const sectionReplacement = sectionValue(sections, "统一表达");
    if (sectionPattern || sectionReplacement) {
      return trimObject({
        pattern: sectionPattern || fallbackPayload?.pattern,
        replacement: sectionReplacement || fallbackPayload?.replacement
      }) || null;
    }
    const match = /^出现[“"](.+?)[”"]时，统一写作[“"](.+?)[”"]。?$/u.exec(text);
    if (match) {
      return trimObject({
        pattern: match[1].trim(),
        replacement: match[2].trim()
      }) || null;
    }
    return trimObject(cloneJson(fallbackPayload)) || null;
  }

  if (kind === "source_policy_setting") {
    const sectionKey = sectionValue(sections, "策略名称");
    const sectionValueText = sectionValue(sections, "策略值");
    if (sectionKey || sectionValueText) {
      return trimObject({
        key: sectionKey || fallbackPayload?.key,
        value: parseLooseValue(sectionValueText || fallbackPayload?.value)
      }) || null;
    }
    const titleKey = inferStructuredKeyFromTitle(kind, titleHint) || fallbackPayload?.key;
    if (titleKey === "standard") {
      const match = /^当前技能库参考的标准是\s+(.+?)。?$/u.exec(text);
      return trimObject({
        key: "standard",
        value: match ? match[1].trim() : fallbackPayload?.value
      }) || null;
    }
    if (titleKey === "singleSourceOfTruth") {
      if (text === describeSourcePolicySettingKey("singleSourceOfTruth", true)) return { key: "singleSourceOfTruth", value: true };
      if (text === describeSourcePolicySettingKey("singleSourceOfTruth", false)) return { key: "singleSourceOfTruth", value: false };
    }
    if (titleKey === "forbidCodeStyleSignals") {
      if (text === describeSourcePolicySettingKey("forbidCodeStyleSignals", true)) return { key: "forbidCodeStyleSignals", value: true };
      if (text === describeSourcePolicySettingKey("forbidCodeStyleSignals", false)) return { key: "forbidCodeStyleSignals", value: false };
    }
    return trimObject(cloneJson(fallbackPayload)) || null;
  }

  if (kind === "forbidden_expansion") {
    const sectionTopic = sectionValue(sections, "适用主题");
    const sectionEntries = sectionList(sections, "禁止扩写项");
    if (sectionTopic || sectionEntries.length) {
      return trimObject({
        topic: sectionTopic || fallbackPayload?.topic,
        entries: sectionEntries.length ? sectionEntries : fallbackPayload?.entries
      }) || null;
    }
    const match = /^涉及\s+(.+?)\s+时，不要额外扩写\s+(.+?)。?$/u.exec(text);
    if (match) {
      return trimObject({
        topic: match[1].trim(),
        entries: match[2]
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
      }) || null;
    }
    return trimObject(cloneJson(fallbackPayload)) || null;
  }

  if (kind === "document_blueprint_section") {
    const sectionRole = sectionValue(sections, "蓝图角色");
    const sectionTitle = sectionValue(sections, "章节标题");
    const sectionNumber = sectionValue(sections, "章节编号");
    const coreRequirementTypes = sectionList(sections, "核心需求类型");
    if (sectionRole || sectionTitle || sectionNumber || coreRequirementTypes.length) {
      return trimObject({
        role: sectionRole || fallbackPayload?.role,
        title: sectionTitle || fallbackPayload?.title,
        sectionNumber: sectionNumber || fallbackPayload?.sectionNumber,
        coreRequirementTypes: coreRequirementTypes.length ? coreRequirementTypes : fallbackPayload?.coreRequirementTypes
      }) || null;
    }
    const carriedTypes = /\b主要承载\s+(.+?)\s+类需求/u.exec(text)?.[1];
    return trimObject({
      role: inferStructuredKeyFromTitle(kind, titleHint) || fallbackPayload?.role,
      title: (/“(.+?)”/u.exec(text)?.[1] || fallbackPayload?.title || "").trim(),
      sectionNumber: (/\b章节编号使用\s+([A-Za-z0-9._-]+)/u.exec(text)?.[1] || fallbackPayload?.sectionNumber || "").trim(),
      coreRequirementTypes: carriedTypes
        ? carriedTypes
            .split(/[、,，]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : fallbackPayload?.coreRequirementTypes
    }) || null;
  }

  if (kind === "document_blueprint_policy") {
    const sectionKey = sectionValue(sections, "蓝图策略");
    const sectionValueText = sectionValue(sections, "策略值");
    if (sectionKey || sectionValueText) {
      return trimObject({
        key: sectionKey || fallbackPayload?.key,
        value: parseLooseValue(sectionValueText || fallbackPayload?.value)
      }) || null;
    }
    const titleKey = inferStructuredKeyFromTitle(kind, titleHint) || fallbackPayload?.key;
    if (titleKey) {
      if (text === describeBlueprintPolicyKey(titleKey, true)) return { key: titleKey, value: true };
      if (text === describeBlueprintPolicyKey(titleKey, false)) return { key: titleKey, value: false };
    }
    return trimObject(cloneJson(fallbackPayload)) || null;
  }

  if (kind === "rule_hint") {
    return trimObject({
      domain: sectionValue(sections, "适用领域") || fallbackPayload?.domain,
      documentType: sectionValue(sections, "适用文档类型") || fallbackPayload?.documentType,
      subdomain: sectionValue(sections, "适用子域") || fallbackPayload?.subdomain,
      sectionHints: sectionList(sections, "章节提示"),
      writingPattern: sectionValue(sections, "写作模式") || fallbackPayload?.writingPattern,
      targetStyle: sectionValue(sections, "目标风格") || fallbackPayload?.targetStyle,
      sourceBasis: sectionList(sections, "来源依据")
    }) || null;
  }

  return trimObject(cloneJson(fallbackPayload)) || null;
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
    const normalizedTargetFile = targetFile.replaceAll("\\", "/");
    const relativePath = layer === "generic" ? normalizedTargetFile : `${relativeDir}/${normalizedTargetFile}`;
    files[normalizedTargetFile] = [relativePath];
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
  let content = typeof item.content === "string" ? item.content.trim() : "";
  let structuredPayload = trimObject(cloneJson(item.structuredPayload));
  if (isTextTruthStructuredKind(kind)) {
    structuredPayload = parseStructuredContent(kind, content, structuredPayload, item.title || defaults.title);
    if ((!content || hasLegacyStructuredMarkers(kind, content)) && structuredPayload) {
      content = formatStructuredContent(kind, structuredPayload);
    }
  }
  const title =
    String(item.title || defaults.title || structuredPayload?.topic || structuredPayload?.canonical || "").trim() ||
    `${kind.replaceAll("_", " ")} item`;
  const normalized = {
    skillCode: String(item.skillCode || defaults.skillCode || "").trim(),
    layer,
    profileKey,
    documentTypeScope: String(item.documentTypeScope || defaults.documentTypeScope || "").trim(),
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
  let fallbackTitle = kind.replaceAll("_", " ");
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
        title: inferTitle(currentSection, fallbackTitle, index + 1),
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

    if (/^#\s+/.test(trimmed)) {
      fallbackTitle = trimmed.replace(/^#\s+/, "").trim() || fallbackTitle;
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
        title: inferTitle("default", fallbackTitle, index + 1),
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

export function renderMarkdownFromItems(kind, items = []) {
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

export function buildKnowledgeFromItems(items = [], registryVersion = 1) {
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
  constructor() {
    this.databaseService = new SkillDatabaseService();
  }

  isDatabaseBacked(skillDir = config.activeSkillDir) {
    return path.resolve(skillDir) === path.resolve(config.activeSkillDir);
  }

  async loadManifestFile(skillDir = config.activeSkillDir) {
    return readJson(path.join(skillDir, "skill-manifest.json"), buildDefaultManifest());
  }

  async saveManifestFile(manifest, skillDir = config.activeSkillDir) {
    await writeJson(path.join(skillDir, "skill-manifest.json"), manifest);
  }

  async ensureProfileRegistryFromFiles(layer, profileKey, skillDir = config.activeSkillDir, manifest = null) {
    const loadedManifest = manifest || (await this.loadManifestFile(skillDir));
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
      await this.saveManifestFile(loadedManifest, skillDir);
      await this.materializeProfileToFiles(normalizedLayer, normalizedKey, imported, skillDir, loadedManifest);
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
      await this.saveManifestFile(loadedManifest, skillDir);
    }

    return normalizedRegistry;
  }

  normalizeRegistrySnapshot(registry = {}) {
    return {
      layer: registry.layer,
      profileKey: registry.profileKey,
      items: ensureArray(registry.items)
        .map((item) => ({
          skillCode: item.skillCode,
          kind: item.kind,
          title: item.title,
          content: item.content || "",
          status: item.status || "active",
          order: Number(item.order || 0) || 0,
          sectionKey: item.sectionKey || "default",
          structuredPayload: trimSnapshotValue(cloneJson(item.structuredPayload || null)) || null
        }))
        .sort((left, right) => left.order - right.order)
    };
  }

  async importActiveRegistriesFromFiles(skillDir = config.activeSkillDir) {
    const manifest = await this.loadManifestFile(skillDir);
    const registries = [];
    const collectProfile = async (layer, profileKey) => {
      const registry = await this.ensureProfileRegistryFromFiles(layer, profileKey, skillDir, manifest);
      registries.push(registry);
    };

    await collectProfile("generic", "generic");
    for (const profileKey of Object.keys(manifest?.profiles?.docTypes || {})) {
      await collectProfile("docType", profileKey);
    }
    for (const profileKey of Object.keys(manifest?.profiles?.domains || {})) {
      await collectProfile("domain", profileKey);
    }
    for (const profileKey of Object.keys(manifest?.profiles?.modules || {})) {
      await collectProfile("module", profileKey);
    }
    return registries;
  }

  validateImportedRegistries(registries = []) {
    const expected = registries
      .map((registry) => this.normalizeRegistrySnapshot(registry))
      .sort((left, right) => `${left.layer}:${left.profileKey}`.localeCompare(`${right.layer}:${right.profileKey}`));
    const actual = this.databaseService
      .listProfiles()
      .map((profile) => this.databaseService.loadProfileRegistry(profile.layer, profile.profileKey))
      .filter(Boolean)
      .map((registry) => this.normalizeRegistrySnapshot(registry))
      .sort((left, right) => `${left.layer}:${left.profileKey}`.localeCompare(`${right.layer}:${right.profileKey}`));

    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw createManagedError(
        "Imported SQLite skill registry does not match legacy skill content",
        500,
        "skill_database_import_mismatch"
      );
    }
  }

  normalizeDatabaseTextTruth() {
    for (const profile of this.databaseService.listProfiles()) {
      const registry = this.databaseService.loadProfileRegistry(profile.layer, profile.profileKey);
      if (!registry) continue;
      const nextRegistry = {
        ...registry,
        items: ensureArray(registry.items)
          .map((item, index) => sanitizeItem(item, { layer: registry.layer, profileKey: registry.profileKey, order: index + 1 }))
          .sort((left, right) => left.order - right.order)
          .map((item, index) => ({ ...item, order: index + 1 }))
      };
      const changed = nextRegistry.items.some((item, index) => {
        const previous = registry.items[index];
        return (
          !previous ||
          previous.content !== item.content ||
          JSON.stringify(previous.structuredPayload || null) !== JSON.stringify(item.structuredPayload || null)
        );
      });
      if (changed) {
        this.databaseService.saveProfileRegistry(nextRegistry);
      }
    }
  }

  async ensureDatabaseImported(skillDir = config.activeSkillDir) {
    if (!this.isDatabaseBacked(skillDir)) {
      return;
    }

    const currentSignature = await buildRegistrySourceSignature(skillDir);
    const storedSignature = this.databaseService.getMeta("active_registry_source_signature", "");
    const sourceDirty = this.databaseService.getMeta("active_registry_source_dirty", "") === "true";
    if (this.databaseService.isImported() && (sourceDirty || storedSignature === currentSignature)) {
      this.normalizeDatabaseTextTruth();
      return;
    }

    const registries = await this.importActiveRegistriesFromFiles(skillDir);
    this.databaseService.importRegistries(registries);
    this.validateImportedRegistries(registries);
    this.databaseService.setMeta("active_registry_source_signature", await buildRegistrySourceSignature(skillDir));
    this.databaseService.setMeta("active_registry_source_dirty", "false");
    this.normalizeDatabaseTextTruth();
  }

  async rebuildDatabaseFromFiles(skillDir = config.activeSkillDir) {
    if (!this.isDatabaseBacked(skillDir)) {
      return;
    }
    const registries = await this.importActiveRegistriesFromFiles(skillDir);
    this.databaseService.importRegistries(registries);
    this.validateImportedRegistries(registries);
  }

  buildManifestFromDatabase() {
    const manifest = buildDefaultManifest();
    for (const profile of this.databaseService.listProfiles()) {
      const registry = this.databaseService.loadProfileRegistry(profile.layer, profile.profileKey);
      if (!registry) continue;
      const activeKinds = ensureArray(registry.items)
        .filter((item) => item.status === "active")
        .map((item) => item.kind);
      setProfileConfig(manifest, profile.layer, profile.profileKey, {
        displayName: registry.displayName || inferDisplayName(profile.layer, profile.profileKey),
        documentTypeScope: registry.documentTypeScope || profileDocumentTypeScope(profile.layer, profile.profileKey),
        status: registry.status || "active",
        registry: getRegistryRelativePath(profile.layer, profile.profileKey),
        files: getDefaultProfileFiles(profile.layer, profile.profileKey, activeKinds)
      });
    }
    return manifest;
  }

  async loadManifest(skillDir = config.activeSkillDir) {
    if (this.isDatabaseBacked(skillDir)) {
      await this.ensureDatabaseImported(skillDir);
      return this.buildManifestFromDatabase();
    }
    return this.loadManifestFile(skillDir);
  }

  async saveManifest(manifest, skillDir = config.activeSkillDir) {
    await this.saveManifestFile(manifest, skillDir);
  }

  async ensureProfileRegistry(layer, profileKey, skillDir = config.activeSkillDir, manifest = null) {
    if (this.isDatabaseBacked(skillDir)) {
      await this.ensureDatabaseImported(skillDir);
      const normalizedLayer = normalizeLayer(layer);
      const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
      const registry = this.databaseService.loadProfileRegistry(normalizedLayer, normalizedKey);
      if (!registry) {
        throw createManagedError("Skill profile not found", 404, "skill_profile_not_found", {
          layer: normalizedLayer,
          profileKey: normalizedKey
        });
      }
      return registry;
    }
    return this.ensureProfileRegistryFromFiles(layer, profileKey, skillDir, manifest);
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
    if (this.isDatabaseBacked(skillDir)) {
      await this.ensureDatabaseImported(skillDir);
      return this.buildManifestFromDatabase();
    }
    const manifest = await this.loadManifestFile(skillDir);
    await this.ensureProfileRegistryFromFiles("generic", "generic", skillDir, manifest);
    for (const [profileKey] of Object.entries(manifest?.profiles?.docTypes || {})) {
      await this.ensureProfileRegistryFromFiles("docType", profileKey, skillDir, manifest);
    }
    for (const [profileKey] of Object.entries(manifest?.profiles?.domains || {})) {
      await this.ensureProfileRegistryFromFiles("domain", profileKey, skillDir, manifest);
    }
    for (const [profileKey] of Object.entries(manifest?.profiles?.modules || {})) {
      await this.ensureProfileRegistryFromFiles("module", profileKey, skillDir, manifest);
    }
    return this.loadManifestFile(skillDir);
  }

  async loadProfileRegistryFromFiles(layer, profileKey, skillDir = config.activeSkillDir) {
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

  async loadProfileRegistry(layer, profileKey, skillDir = config.activeSkillDir) {
    if (this.isDatabaseBacked(skillDir)) {
      await this.ensureDatabaseImported(skillDir);
      const normalizedLayer = normalizeLayer(layer);
      const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
      const registry = this.databaseService.loadProfileRegistry(normalizedLayer, normalizedKey);
      if (!registry) {
        throw createManagedError("Skill profile not found", 404, "skill_profile_not_found", {
          layer: normalizedLayer,
          profileKey: normalizedKey
        });
      }
      return registry;
    }
    return this.loadProfileRegistryFromFiles(layer, profileKey, skillDir);
  }

  async saveProfileRegistryToFiles(layer, profileKey, registry, skillDir = config.activeSkillDir) {
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
    await this.materializeProfileToFiles(layer, profileKey, nextRegistry, skillDir, manifest);
    return nextRegistry;
  }

  async saveProfileRegistry(layer, profileKey, registry, skillDir = config.activeSkillDir) {
    const normalizedLayer = normalizeLayer(layer);
    const normalizedKey = normalizedLayer === "generic" ? "generic" : normalizeProfileKey(profileKey);
    const nextRegistry = {
      version: Math.max(Number(registry.version || 1) || 1, 1),
      layer: normalizedLayer,
      profileKey: normalizedKey,
      displayName: registry.displayName || inferDisplayName(normalizedLayer, normalizedKey),
      documentTypeScope: registry.documentTypeScope || profileDocumentTypeScope(normalizedLayer, normalizedKey),
      status: registry.status || "active",
      items: ensureArray(registry.items)
        .map((item, index) => sanitizeItem(item, { layer: normalizedLayer, profileKey: normalizedKey, order: index + 1 }))
        .sort((left, right) => left.order - right.order)
        .map((item, index) => ({ ...item, order: index + 1 }))
    };

    if (this.isDatabaseBacked(skillDir)) {
      await this.ensureDatabaseImported(skillDir);
      this.databaseService.saveProfileRegistry(nextRegistry);
      this.databaseService.setMeta("active_registry_source_dirty", "true");
      return nextRegistry;
    }

    return this.saveProfileRegistryToFiles(layer, profileKey, nextRegistry, skillDir);
  }

  async materializeProfileToFiles(layer, profileKey, registry, skillDir = config.activeSkillDir, manifestOverride = null) {
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

  async materializeProfile(layer, profileKey, registry, skillDir = config.activeSkillDir, manifestOverride = null) {
    const effectiveRegistry = registry || (await this.loadProfileRegistry(layer, profileKey, skillDir));
    const manifest = manifestOverride || (await this.loadManifest(skillDir));
    return this.materializeProfileToFiles(layer, profileKey, effectiveRegistry, skillDir, manifest);
  }

  async materializeAllToFiles(skillDir = config.activeSkillDir) {
    const manifest = this.isDatabaseBacked(skillDir) ? await this.loadManifest(skillDir) : await this.ensureAllRegistries(skillDir);
    const profiles = [
      { layer: "generic", profileKey: "generic" },
      ...Object.keys(manifest?.profiles?.docTypes || {}).map((profileKey) => ({ layer: "docType", profileKey })),
      ...Object.keys(manifest?.profiles?.domains || {}).map((profileKey) => ({ layer: "domain", profileKey })),
      ...Object.keys(manifest?.profiles?.modules || {}).map((profileKey) => ({ layer: "module", profileKey }))
    ];
    for (const profile of profiles) {
      const registry = await this.loadProfileRegistry(profile.layer, profile.profileKey, skillDir);
      await this.materializeProfileToFiles(profile.layer, profile.profileKey, registry, skillDir, manifest);
    }
    if (this.isDatabaseBacked(skillDir)) {
      this.databaseService.setMeta("active_registry_source_signature", await buildRegistrySourceSignature(skillDir));
      this.databaseService.setMeta("active_registry_source_dirty", "false");
    }
    return this.getRegistryIndex(skillDir);
  }

  async materializeAll(skillDir = config.activeSkillDir) {
    return this.materializeAllToFiles(skillDir);
  }

  async getRegistryIndexFromDatabase(skillDir = config.activeSkillDir, filters = {}) {
    await this.ensureDatabaseImported(skillDir);
    const manifest = this.buildManifestFromDatabase();
    const profiles = [];
    const items = [];
    const addProfile = async (registry) => {
      const layer = registry.layer;
      const profileKey = registry.profileKey;
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

    for (const profile of this.databaseService.listProfiles()) {
      const registry = this.databaseService.loadProfileRegistry(profile.layer, profile.profileKey);
      if (registry) {
        await addProfile(registry);
      }
    }

    return {
      manifest,
      profiles,
      items,
      bySkillCode: Object.fromEntries(items.map((item) => [item.skillCode, item]))
    };
  }

  async getRegistryIndex(skillDir = config.activeSkillDir, filters = {}) {
    if (this.isDatabaseBacked(skillDir)) {
      return this.getRegistryIndexFromDatabase(skillDir, filters);
    }

    const manifest = await this.ensureAllRegistries(skillDir);
    const profiles = [];
    const items = [];
    const addProfile = async (layer, profileKey) => {
      const registry = await this.loadProfileRegistryFromFiles(layer, profileKey, skillDir);
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
    assertKindAllowedInLayer(layer, kind);
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
    const nextKind = normalizeKind(payload.kind || current.kind);
    assertKindAllowedInLayer(nextLayer, nextKind);
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
        kind: nextKind,
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

  async listRelevantItems(
    { documentType = "software_requirement", domain = "", moduleSkillKey = "", targetAreas = [], limit = 20, layerConstraint = "", profileKeyConstraint = "" } = {},
    skillDir = config.activeSkillDir
  ) {
    const index = await this.getRegistryIndex(skillDir, { includeDeprecated: false });
    const normalizedDocumentType = normalizeProfileKey(documentType || "software_requirement");
    const normalizedDomain = normalizeProfileKey(domain || "");
    const normalizedModule = normalizeProfileKey(moduleSkillKey || "");
    const allowedKinds = new Set();

    for (const area of ensureArray(targetAreas)) {
      const allowedForArea = ALLOWED_KINDS_BY_AREA[String(area || "").trim()] || ALLOWED_KINDS_BY_AREA.validation;
      allowedForArea.forEach((kind) => allowedKinds.add(kind));
    }

    const selected = index.items
      .filter((item) => isKindAllowedForLayer(item.layer, item.kind))
      .filter((item) => {
        if (!allowedKinds.size) return true;
        return allowedKinds.has(item.kind);
      })
      .filter((item) => {
        if (layerConstraint && item.layer !== String(layerConstraint || "").trim()) return false;
        if (profileKeyConstraint && String(item.profileKey || "").trim() !== String(profileKeyConstraint || "").trim()) return false;
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
    if (this.isDatabaseBacked(skillDir)) {
      await this.ensureDatabaseImported(skillDir);
      const normalizedKey = normalizeProfileKey(profileKey);
      this.databaseService.removeProfile(normalizedLayer, normalizedKey);
      this.databaseService.setMeta("active_registry_source_dirty", "true");
      await fs.rm(path.join(skillDir, getProfileRelativeDir(normalizedLayer, normalizedKey)), {
        recursive: true,
        force: true
      }).catch(() => {});
      await fs.rm(path.join(skillDir, getRegistryRelativePath(normalizedLayer, normalizedKey)), {
        force: true
      }).catch(() => {});
      await this.materializeAllToFiles(skillDir);
      return {
        removed: true,
        layer: normalizedLayer,
        profileKey: normalizedKey
      };
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
