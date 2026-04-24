import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { ExtractionService } from "./extraction-service.js";
import { ModuleSkillBootstrapLlmService } from "./module-skill-bootstrap-llm-service.js";
import { readJson, writeJson } from "./storage.js";
import { SkillRegistryService, buildKnowledgeFromItems, normalizeKnowledgeForLayer } from "./skill-registry-service.js";

const DEFAULT_DOMAIN = "embedded_vcu";
const REFERENCE_ROLE_BY_DOCUMENT_TYPE = {
  software_requirement: "reference_requirement_example",
  detail_design: "reference_detail_design_example",
  hil_test_case: "reference_hil_test_case_example"
};
const EXTRACTED_REFERENCE_ROLE_BY_DOCUMENT_TYPE = {
  software_requirement: "extracted_software_requirement",
  detail_design: "extracted_detail_design"
};
const IMPLEMENTATION_ROLES = new Set(["generated_c", "model_pdf", "simulink_slx"]);
const MODULE_KNOWLEDGE_ITEM_KINDS = new Set([
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
]);

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function normalizeDocumentTypeScope(value = "") {
  return String(value || "").trim();
}

function normalizeModuleSkillKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeDomain(value) {
  return String(value || "").trim() || DEFAULT_DOMAIN;
}

function createManagedError(message, statusCode, details = {}, code = "module_skill_blocked") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  error.code = code;
  return error;
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function isModuleKnowledgeItemKind(kind = "") {
  return MODULE_KNOWLEDGE_ITEM_KINDS.has(String(kind || "").trim());
}

function referenceRoleFor(documentType) {
  return REFERENCE_ROLE_BY_DOCUMENT_TYPE[normalizeDocumentType(documentType)] || REFERENCE_ROLE_BY_DOCUMENT_TYPE.software_requirement;
}

export function canonicalizeBootstrapAssetRole(role = "", documentType = "software_requirement") {
  const normalizedRole = String(role || "").trim();
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const referenceRole = referenceRoleFor(normalizedDocumentType);
  const extractedReferenceRole =
    EXTRACTED_REFERENCE_ROLE_BY_DOCUMENT_TYPE[normalizedDocumentType] || EXTRACTED_REFERENCE_ROLE_BY_DOCUMENT_TYPE.software_requirement;

  if (normalizedRole === "extracted_system_requirement") {
    return "system_pdf";
  }
  if (normalizedRole === extractedReferenceRole) {
    return referenceRole;
  }
  return normalizedRole;
}

function scoreCandidate(candidate, input = {}) {
  const key = normalizeModuleSkillKey(candidate.key);
  const requestedKey = normalizeModuleSkillKey(input.moduleSkillKey || input.name);
  const requestedName = String(input.name || "").trim().toLowerCase();
  let score = 0;
  const reasons = [];

  if (requestedKey && key === requestedKey) {
    score += 100;
    reasons.push("exact_module_skill_key");
  } else if (requestedKey && (key.includes(requestedKey) || requestedKey.includes(key))) {
    score += 70;
    reasons.push("similar_module_skill_key");
  }

  if (requestedName) {
    const normalizedName = requestedName.replace(/\s+/g, "_");
    if (key === normalizedName) {
      score += 80;
      reasons.push("name_normalized_match");
    } else if (key.includes(normalizedName) || normalizedName.includes(key)) {
      score += 40;
      reasons.push("name_partial_match");
    }
  }

  if (input.domain && candidate.domain === input.domain) {
    score += 20;
    reasons.push("same_domain");
  }

  return { score, reasons };
}

function inferDomainFromKnowledge(knowledge = {}, fallback = DEFAULT_DOMAIN) {
  const hintDomain = (knowledge.ruleHints || []).find((item) => item?.domain)?.domain;
  const exampleDomain = (knowledge.examples || []).find((item) => item?.domain)?.domain;
  return normalizeDomain(hintDomain || exampleDomain || fallback);
}

function buildTopicFromExcerpt(excerpt = "", fallback = "Bootstrap Topic") {
  const compact = String(excerpt || "").replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.slice(0, 32);
}

function extractSignalTokens(text = "") {
  const matches = String(text || "").match(/[A-Za-z][A-Za-z0-9_]{2,}/g) || [];
  return unique(matches).slice(0, 8);
}

function buildKeywords(moduleName, text = "", tags = []) {
  return unique([moduleName, ...(tags || []), ...extractSignalTokens(text).slice(0, 4)]).slice(0, 8);
}

function inferRequirementType(documentType, excerpt = "") {
  const normalizedDocumentType = normalizeDocumentType(documentType);
  if (normalizedDocumentType === "hil_test_case") return "hil_test_case";
  if (normalizedDocumentType === "detail_design") return "design_detail";
  const lower = String(excerpt || "").toLowerCase();
  if (lower.includes("memory") || lower.includes("eep") || lower.includes("eew") || lower.includes("eer")) {
    return "memory_logic";
  }
  if (lower.includes("state") || lower.includes("mode")) {
    return "state_logic";
  }
  return "functional";
}

function buildRuleHint(module, documentType, extractions) {
  const sourceBasis = unique(extractions.map((item) => item.fileName)).slice(0, 8);
  const sectionHints = unique([
    module.name,
    ...(extractions
      .flatMap((item) => (item.evidence || []).slice(0, 3).map((evidence) => buildTopicFromExcerpt(evidence.excerpt, "")))
      .filter(Boolean)
      .slice(0, 4))
  ]).slice(0, 6);

  const patterns = {
    software_requirement: "Align to the reference example first, keep control topics separate, and preserve input condition, action, and recovery path.",
    detail_design: "Prefer stable section hierarchy, explicit internal behavior breakdown, and interface or state details grounded in the reference example.",
    hil_test_case: "Prefer preconditions, stimulus, expected results, and pass criteria that map clearly back to the reference example."
  };
  const styles = {
    software_requirement: "Stay close to human-authored software requirement wording rather than implementation-heavy prose.",
    detail_design: "Stay close to human-authored detail design sections and keep structure explicit.",
    hil_test_case: "Stay close to executable HIL test case wording with verifiable expected results."
  };

  return {
    domain: normalizeDomain(module.domain),
    subdomain: normalizeModuleSkillKey(module.moduleSkillKey || module.name),
    sectionHints,
    writingPattern: patterns[normalizeDocumentType(documentType)],
    targetStyle: styles[normalizeDocumentType(documentType)],
    sourceBasis
  };
}

function buildAntiPatterns(documentType) {
  const map = {
    software_requirement: [
      "Do not merge unrelated control topics into one requirement.",
      "Do not promote supplement logic into a core output item before the core topics are covered.",
      "Do not replace sample-aligned wording with implementation-heavy prose."
    ],
    detail_design: [
      "Do not collapse stable subsection structure into a flat list.",
      "Do not omit internal state, interface, or behavior breakdown when the reference design keeps them explicit.",
      "Do not rewrite detail design as high-level software requirements."
    ],
    hil_test_case: [
      "Do not omit preconditions, stimulus, expected results, or pass criteria.",
      "Do not write test steps that cannot be executed or verified.",
      "Do not lose traceability back to the source requirement intent."
    ]
  };
  return map[normalizeDocumentType(documentType)] || map.software_requirement;
}

function buildGenerationPriorities(documentType) {
  const map = {
    software_requirement: [
      "Follow the human reference example structure before adding any supplement logic.",
      "Keep core control topics separate and preserve trigger, action, and recovery path."
    ],
    detail_design: [
      "Follow the human reference design structure before introducing additional subsections.",
      "Prefer explicit internal behavior and interface decomposition over flat summaries."
    ],
    hil_test_case: [
      "Follow the human reference test case structure before expanding coverage.",
      "Keep preconditions, stimulus, expected results, and pass criteria explicit and separate."
    ]
  };
  return map[normalizeDocumentType(documentType)] || map.software_requirement;
}

function maybeBuildDocumentBlueprint(module, documentType, referenceExtractions) {
  if (normalizeDocumentType(documentType) === "hil_test_case") return null;
  if (!referenceExtractions.length) return null;

  const subsectionTitles = unique(
    referenceExtractions
      .flatMap((item) => item.evidence || [])
      .map((item) => buildTopicFromExcerpt(item.excerpt, ""))
      .filter(Boolean)
      .slice(0, 4)
  );

  if (!subsectionTitles.length) return null;

  return {
    domain: normalizeDomain(module.domain),
    subdomain: normalizeModuleSkillKey(module.moduleSkillKey || module.name),
    preferredFunctionSection: {
      sectionNumber: "",
      title: module.name
    },
    preferredSubsections: subsectionTitles.map((title) => ({
      sectionNumber: "",
      title,
      coreRequirementTypes: [normalizeDocumentType(documentType)]
    })),
    targetOutputPolicy: {
      coreFirst: true,
      preferSymmetricExpansion: true,
      preferObjectSpecificRequirements: true,
      discourageGenericScatterRequirements: true
    }
  };
}

export class ModuleSkillService {
  constructor(options = {}) {
    this.extractionService = new ExtractionService();
    this.bootstrapLlmService = options.bootstrapLlmService || new ModuleSkillBootstrapLlmService();
    this.registryService = new SkillRegistryService();
  }

  async loadManifest(skillDir = config.activeSkillDir) {
    if (skillDir === config.activeSkillDir) {
      return this.registryService.loadManifest(skillDir);
    }
    return readJson(path.join(skillDir, "skill-manifest.json"), {
      version: 1,
      resolutionOrder: ["generic", "docType", "domain", "module"],
      profiles: { generic: { files: {} }, docTypes: {}, domains: {}, modules: {} }
    });
  }

  async listRegisteredModuleProfiles(skillDir = config.activeSkillDir) {
    if (skillDir === config.activeSkillDir) {
      const index = await this.registryService.getRegistryIndex(skillDir, { includeDeprecated: true });
      const entries = [];
      for (const profile of index.profiles.filter((entry) => entry.layer === "module")) {
        const registry = await this.registryService.loadProfileRegistry("module", profile.profileKey, skillDir);
        const knowledge = buildKnowledgeFromItems(registry.items || [], registry.version);
        entries.push({
          key: profile.profileKey,
          domain: inferDomainFromKnowledge(knowledge, DEFAULT_DOMAIN),
          source: "sqlite_registry",
          knowledgePath: "",
          knowledge
        });
      }
      return entries;
    }

    const manifest = await this.loadManifest(skillDir);
    const modules = manifest?.profiles?.modules || {};
    const entries = [];

    for (const [key, configEntry] of Object.entries(modules)) {
      const knowledgePath = configEntry?.files?.["domain-knowledge.json"]?.[0];
      const absolutePath = knowledgePath ? path.join(skillDir, knowledgePath) : "";
      const knowledge = absolutePath ? await readJson(absolutePath, { version: 1, examples: [], ruleHints: [], antiPatterns: [] }) : null;
      entries.push({
        key,
        domain: inferDomainFromKnowledge(knowledge, DEFAULT_DOMAIN),
        source: "active_manifest",
        knowledgePath,
        knowledge
      });
    }

    return entries;
  }

  async hasModuleProfile(moduleSkillKey, skillDir = config.activeSkillDir) {
    if (skillDir === config.activeSkillDir) {
      const normalizedKey = normalizeModuleSkillKey(moduleSkillKey);
      try {
        await this.registryService.loadProfileRegistry("module", normalizedKey, skillDir);
        return true;
      } catch (_error) {
        return false;
      }
    }
    const manifest = await this.loadManifest(skillDir);
    const normalizedKey = normalizeModuleSkillKey(moduleSkillKey);
    return Boolean(manifest?.profiles?.modules?.[normalizedKey]);
  }

  async loadModuleRegistry(moduleSkillKey, skillDir = config.activeSkillDir) {
    const normalizedKey = normalizeModuleSkillKey(moduleSkillKey);
    try {
      return await this.registryService.loadProfileRegistry("module", normalizedKey, skillDir);
    } catch (_error) {
      return null;
    }
  }

  resolveModuleReadiness(registry = null, documentType = "software_requirement") {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const activeKnowledgeItems = (registry?.items || []).filter(
      (item) => item.status === "active" && isModuleKnowledgeItemKind(item.kind)
    );
    const scopedKnowledgeItems = activeKnowledgeItems.filter(
      (item) => normalizeDocumentTypeScope(item.documentTypeScope) === normalizedDocumentType
    );
    const legacyFallbackItems = activeKnowledgeItems.filter((item) => !normalizeDocumentTypeScope(item.documentTypeScope));
    const hasScopedModuleSkill = scopedKnowledgeItems.length > 0;
    const usesLegacyGlobalFallback = legacyFallbackItems.length > 0;
    const hasUsableModuleSkill = hasScopedModuleSkill || usesLegacyGlobalFallback;

    return {
      hasScopedModuleSkill,
      usesLegacyGlobalFallback,
      hasUsableModuleSkill
    };
  }

  async listSkillCandidates(input = {}, skillDir = config.activeSkillDir) {
    const candidates = await this.listRegisteredModuleProfiles(skillDir);
    return candidates
      .map((candidate) => ({ ...candidate, ...scoreCandidate(candidate, input) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((candidate) => ({
        key: candidate.key,
        domain: candidate.domain,
        source: candidate.source,
        score: candidate.score,
        reasons: candidate.reasons
      }));
  }

  buildRecommendedDomains({ candidates = [], projectDomain = DEFAULT_DOMAIN } = {}) {
    const byDomain = new Map();
    for (const candidate of candidates) {
      const entry = byDomain.get(candidate.domain) || { domain: candidate.domain, score: 0, reasons: [] };
      entry.score = Math.max(entry.score, candidate.score || 0);
      entry.reasons = unique([...entry.reasons, ...(candidate.reasons || [])]);
      byDomain.set(candidate.domain, entry);
    }

    if (!byDomain.size) {
      byDomain.set(projectDomain || DEFAULT_DOMAIN, {
        domain: projectDomain || DEFAULT_DOMAIN,
        score: 10,
        reasons: ["project_default_domain"]
      });
    }

    return [...byDomain.values()].sort((left, right) => right.score - left.score);
  }

  computeMissingBootstrapAssets(assets = [], documentType = "software_requirement") {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const referenceRole = referenceRoleFor(normalizedDocumentType);
    const canonicalRoles = assets.map((item) => canonicalizeBootstrapAssetRole(item.role, normalizedDocumentType));
    const hasSystem = canonicalRoles.some((role) => role === "system_pdf");
    const hasImplementation = canonicalRoles.some((role) => IMPLEMENTATION_ROLES.has(role));
    const hasReference = canonicalRoles.some((role) => role === referenceRole);
    const missing = [];

    if (!hasSystem) missing.push({ code: "system_requirement", label: "system_requirement" });
    if (!hasImplementation) missing.push({ code: "implementation_input", label: "implementation_input" });
    if (!hasReference) missing.push({ code: "reference_example", label: referenceRole });
    return missing;
  }

  async previewNewModule(project = {}, input = {}, options = {}) {
    const documentType = normalizeDocumentType(options.documentType || project.documentType);
    const moduleSkillKey = normalizeModuleSkillKey(input.moduleSkillKey || input.name);
    const candidates = await this.listSkillCandidates({
      name: input.name,
      moduleSkillKey,
      domain: input.domain || ""
    });
    const recommendedDomains = this.buildRecommendedDomains({
      candidates,
      projectDomain: normalizeDomain(input.domain || options.projectDomain || project.domain || DEFAULT_DOMAIN)
    });

    return {
      documentType,
      moduleSkillKey,
      recommendedDomains,
      selectedDomain: recommendedDomains[0]?.domain || DEFAULT_DOMAIN,
      skillCandidates: candidates,
      missingBootstrapAssets: this.computeMissingBootstrapAssets([], documentType),
      canGenerateDirectly: candidates.some((item) => item.key === moduleSkillKey)
    };
  }

  async inspectModule(project = {}, module = {}, documentType = "software_requirement", skillDir = config.activeSkillDir) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const candidates = await this.listSkillCandidates({
      name: module.name,
      moduleSkillKey: module.moduleSkillKey,
      domain: module.domain
    }, skillDir);
    const registry = await this.loadModuleRegistry(module.moduleSkillKey || module.name, skillDir);
    const readiness = this.resolveModuleReadiness(registry, normalizedDocumentType);
    const hasModuleProfile = Boolean(registry);
    const requiresExplicitBootstrap =
      String(module.skillInitMode || "").trim() === "cold_start" &&
      normalizedDocumentType === "software_requirement" &&
      !readiness.hasUsableModuleSkill;
    const missingBootstrapAssets = readiness.hasUsableModuleSkill
      ? []
      : this.computeMissingBootstrapAssets(module.assets || [], normalizedDocumentType);

    return {
      documentType: normalizedDocumentType,
      moduleSkillKey: normalizeModuleSkillKey(module.moduleSkillKey || module.name),
      recommendedDomains: this.buildRecommendedDomains({
        candidates,
        projectDomain: normalizeDomain(module.domain || project.domain || DEFAULT_DOMAIN)
      }),
      selectedDomain: normalizeDomain(module.domain),
      skillCandidates: candidates,
      hasModuleProfile,
      hasUsableModuleSkill: readiness.hasUsableModuleSkill,
      hasScopedModuleSkill: readiness.hasScopedModuleSkill,
      usesLegacyGlobalFallback: readiness.usesLegacyGlobalFallback,
      requiresExplicitBootstrap,
      recommendedAction: requiresExplicitBootstrap ? "module_skill_bootstrap" : "generate_document",
      missingBootstrapAssets,
      canGenerateDirectly: readiness.hasUsableModuleSkill || (!requiresExplicitBootstrap && missingBootstrapAssets.length === 0),
      skillStatus: module.skillStatus || (hasModuleProfile ? "existing" : "draft")
    };
  }

  async persistBootstrappedKnowledge(module, documentType = "software_requirement", knowledge = {}, skillDir = config.activeSkillDir) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const normalizedKey = normalizeModuleSkillKey(module.moduleSkillKey || module.name);
    const existingRegistry = await this.loadModuleRegistry(normalizedKey, skillDir);

    if (!existingRegistry) {
      await this.registryService.saveProfileRegistry(
        "module",
        normalizedKey,
        {
          version: 1,
          layer: "module",
          profileKey: normalizedKey,
          displayName: module.name || normalizedKey,
          documentTypeScope: "",
          status: "active",
          items: []
        },
        skillDir
      );
    }

    const registry = await this.registryService.replaceKnowledgeItems("module", normalizedKey, knowledge, skillDir, {
      documentType: normalizedDocumentType
    });

    if (this.registryService.isDatabaseBacked(skillDir)) {
      await this.registryService.saveProfileRegistryToFiles("module", normalizedKey, registry, skillDir);
    }

    return registry;
  }

  async ensureModuleProfile(moduleSkillKey, knowledge, skillDir = config.activeSkillDir) {
    return this.persistBootstrappedKnowledge(
      { moduleSkillKey, name: moduleSkillKey },
      "software_requirement",
      knowledge,
      skillDir
    );
  }

  buildRuleBasedBootstrapKnowledge(module, documentType = "software_requirement", extractions = []) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const referenceRole = referenceRoleFor(normalizedDocumentType);
    const referenceExtractions = extractions.filter(
      (item) => canonicalizeBootstrapAssetRole(item.fileRole, normalizedDocumentType) === referenceRole
    );
    const referenceEvidence = referenceExtractions.flatMap((item) => item.evidence || []).filter(Boolean);
    const fallbackEvidence = extractions.flatMap((item) => item.evidence || []).filter(Boolean);
    const exampleEvidence = (referenceEvidence.length ? referenceEvidence : fallbackEvidence)
      .filter((item) => item.excerpt)
      .slice(0, 6);

    const examples = exampleEvidence.map((item, index) => ({
      requirementId: `${normalizeModuleSkillKey(module.moduleSkillKey || module.name).toUpperCase()}-BOOT-${String(index + 1).padStart(3, "0")}`,
      topic: buildTopicFromExcerpt(item.excerpt, module.name),
      sectionNumber: "",
      sectionTitle: module.name,
      requirementType: inferRequirementType(normalizedDocumentType, item.excerpt),
      preferredTitle: `${module.name} - ${buildTopicFromExcerpt(item.excerpt, module.name)}`,
      requirementText: String(item.excerpt || "").trim(),
      signals: extractSignalTokens(item.excerpt),
      references: [],
      canonicalBranches: [],
      keywords: buildKeywords(module.name, item.excerpt, item.tags || [])
    }));

    const knowledge = {
      version: 1,
      generationPriorities: buildGenerationPriorities(normalizedDocumentType),
      examples,
      ruleHints: [buildRuleHint(module, normalizedDocumentType, extractions)],
      antiPatterns: buildAntiPatterns(normalizedDocumentType)
    };
    const blueprint = maybeBuildDocumentBlueprint(module, normalizedDocumentType, referenceExtractions);
    if (blueprint) {
      knowledge.sourceOfTruthPolicy = {
        preferredFunctionSection: blueprint.preferredFunctionSection,
        preferredSubsections: blueprint.preferredSubsections,
        ...(blueprint.targetOutputPolicy || {})
      };
    }

    return normalizeKnowledgeForLayer("module", knowledge);
  }

  async bootstrapModuleKnowledge(module, documentType = "software_requirement", options = {}) {
    const extractions = await this.extractionService.extractFiles({ files: module.assets || [] });
    const llmResult = await this.bootstrapLlmService.synthesizeKnowledge({
      module,
      documentType,
      extractions,
      llmProfileId: options.llmProfileId || ""
    }).catch((error) => {
      console.warn("Module skill bootstrap LLM synthesis failed, falling back to rule-based bootstrap.", error);
      return null;
    });

    if (llmResult?.knowledge) {
      return {
        knowledge: normalizeKnowledgeForLayer("module", llmResult.knowledge),
        strategy: "llm",
        extractions,
        llmProfile: llmResult.profile || null
      };
    }

    return {
      knowledge: this.buildRuleBasedBootstrapKnowledge(module, documentType, extractions),
      strategy: "rule_based",
      extractions,
      llmProfile: null
    };
  }

  async ensureModuleReady(project, module, documentType = "software_requirement", options = {}) {
    const inspection = await this.inspectModule(project, module, documentType);
    if (inspection.hasUsableModuleSkill) {
      return { inspection, bootstrapped: false };
    }
    if (inspection.missingBootstrapAssets.length) {
      throw createManagedError("Module skill initialization required before generation.", 409, inspection, "module_skill_initialization_required");
    }

    const bootstrapResult = await this.bootstrapModuleKnowledge(module, documentType, options);
    await this.persistBootstrappedKnowledge(module, documentType, bootstrapResult.knowledge);
    return {
      inspection: {
        ...inspection,
        hasModuleProfile: true,
        hasUsableModuleSkill: true,
        hasScopedModuleSkill: true,
        missingBootstrapAssets: [],
        canGenerateDirectly: true,
        skillStatus: "bootstrapped"
      },
      bootstrapped: true,
      knowledge: bootstrapResult.knowledge,
      bootstrapStrategy: bootstrapResult.strategy,
      bootstrapLlmProfile: bootstrapResult.llmProfile
    };
  }
}
