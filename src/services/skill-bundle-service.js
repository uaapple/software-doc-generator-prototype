import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { copyDirectory, pathExists, readJson, writeJson } from "./storage.js";
import { SkillRuleService } from "./skill-rule-service.js";
import { SkillLoader } from "./skill-loader.js";
import { SkillRegistryService } from "./skill-registry-service.js";

const MANAGED_SKILL_FILES = [
  "requirement_extraction.md",
  "requirement_writing.md",
  "requirement_validation.md",
  path.join("examples", "good_examples.md"),
  path.join("examples", "bad_examples.md")
];
const DOMAIN_KNOWLEDGE_FILE = "domain-knowledge.json";

const DEFAULT_DOMAIN_KNOWLEDGE = {
  version: 1,
  examples: [],
  ruleHints: [],
  antiPatterns: []
};

function now() {
  return new Date().toISOString();
}

function isArrayEmpty(value) {
  return !Array.isArray(value) || value.length === 0;
}

function isDomainKnowledgeEffectivelyEmpty(value) {
  if (!value || typeof value !== "object") {
    return true;
  }

  const extraKeys = Object.keys(value).filter(
    (key) => !["version", "examples", "ruleHints", "antiPatterns"].includes(key)
  );

  return (
    extraKeys.length === 0 &&
    isArrayEmpty(value.examples) &&
    isArrayEmpty(value.ruleHints) &&
    isArrayEmpty(value.antiPatterns)
  );
}

function getBundleMetaPath(bundleId) {
  return path.join(config.skillRefinementBundleMetaDir, `${bundleId}.json`);
}

async function hasStructuredProfiles(skillDir) {
  return (
    (await pathExists(path.join(skillDir, "skill-manifest.json"))) ||
    (await pathExists(path.join(skillDir, "profiles")))
  );
}

export class SkillBundleService {
  constructor() {
    this.skillRuleService = new SkillRuleService();
    this.skillLoader = new SkillLoader();
    this.registryService = new SkillRegistryService();
  }

  async ensureInitialized() {
    await this.registryService.materializeAll(config.activeSkillDir).catch(() => {});
    const activePointer = await readJson(config.activeSkillBundlePointerPath);
    const activeWritingFile = path.join(config.activeSkillDir, "requirement_writing.md");
    if (activePointer?.bundleId && (await pathExists(activeWritingFile))) {
      const activeBundleDir = this.getBundleSkillDir(activePointer.bundleId);
      await this.ensureDomainKnowledgeFile(config.activeSkillDir, {
        seedDirs: [config.legacySkillDir, activeBundleDir]
      });
      if (await pathExists(activeBundleDir)) {
        await this.ensureDomainKnowledgeFile(activeBundleDir, {
          seedDirs: [config.activeSkillDir, config.legacySkillDir]
        });
      }
      await this.skillRuleService.ensureBundleRuleIndex(activePointer.bundleId, config.activeSkillDir);
      return;
    }

    const bundleId = "bundle-base";
    const bundleDir = this.getBundleSkillDir(bundleId);
    const useExistingActiveSkills = await hasStructuredProfiles(config.activeSkillDir);
    if (useExistingActiveSkills) {
      await this.ensureDomainKnowledgeFile(config.activeSkillDir, {
        seedDirs: [config.legacySkillDir]
      });
    } else {
      await this.seedFromLegacy(config.activeSkillDir);
    }
    await copyDirectory(config.activeSkillDir, bundleDir);
    await this.ensureDomainKnowledgeFile(config.activeSkillDir, {
      seedDirs: [config.legacySkillDir]
    });
    await this.ensureDomainKnowledgeFile(bundleDir, {
      seedDirs: [config.activeSkillDir, config.legacySkillDir]
    });

    const metadata = {
      id: bundleId,
      version: "1.0.0",
      baseBundleId: "",
      status: "active",
      files: [...MANAGED_SKILL_FILES, DOMAIN_KNOWLEDGE_FILE],
      changeSummary: useExistingActiveSkills
        ? "Seeded from existing active skills directory."
        : "Seeded from legacy skills directory.",
      createdFromCaseIds: [],
      evaluationSummary: null,
      createdAt: now(),
      updatedAt: now()
    };

    const ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, bundleDir);
    metadata.ruleIndexVersion = ruleIndex.ruleIndexVersion;
    metadata.appliedProposalItemIds = [];
    metadata.appliedReplayTaskIds = [];
    await writeJson(getBundleMetaPath(bundleId), metadata);
    await writeJson(config.activeSkillBundlePointerPath, { bundleId });
  }

  async seedFromLegacy(targetDir) {
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(path.join(targetDir, "examples"), { recursive: true });

    for (const relativeFile of MANAGED_SKILL_FILES) {
      const source = path.join(config.legacySkillDir, relativeFile);
      const target = path.join(targetDir, relativeFile);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
    }

    await this.ensureDomainKnowledgeFile(targetDir, {
      seedDirs: [config.legacySkillDir]
    });
  }

  async findSeedDomainKnowledge(seedDirs = []) {
    for (const seedDir of seedDirs) {
      if (!seedDir) {
        continue;
      }

      const filePath = path.join(seedDir, DOMAIN_KNOWLEDGE_FILE);
      const knowledge = await readJson(filePath, null);
      if (knowledge && !isDomainKnowledgeEffectivelyEmpty(knowledge)) {
        return knowledge;
      }
    }

    return null;
  }

  async ensureDomainKnowledgeFile(skillDir, options = {}) {
    const filePath = path.join(skillDir, DOMAIN_KNOWLEDGE_FILE);
    const existingKnowledge = await readJson(filePath, null);
    const seededKnowledge = await this.findSeedDomainKnowledge(options.seedDirs || []);

    if (!existingKnowledge) {
      await writeJson(filePath, seededKnowledge || DEFAULT_DOMAIN_KNOWLEDGE);
      return;
    }

    if (isDomainKnowledgeEffectivelyEmpty(existingKnowledge) && seededKnowledge) {
      await writeJson(filePath, seededKnowledge);
    }
  }

  getBundleSkillDir(bundleId) {
    return path.join(config.skillBundleDir, bundleId);
  }

  async listBundles() {
    await this.ensureInitialized();
    const names = await fs.readdir(config.skillRefinementBundleMetaDir);
    const bundles = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(path.join(config.skillRefinementBundleMetaDir, name)))
    );

    return bundles.filter(Boolean).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getBundle(bundleId) {
    await this.ensureInitialized();
    return readJson(getBundleMetaPath(bundleId));
  }

  async getActiveBundle() {
    await this.ensureInitialized();
    const pointer = await readJson(config.activeSkillBundlePointerPath);
    return pointer?.bundleId ? this.getBundle(pointer.bundleId) : null;
  }

  async getSkillDir(bundleId = "") {
    await this.ensureInitialized();
    if (!bundleId) {
      return config.activeSkillDir;
    }

    const activeBundle = await this.getActiveBundle();
    if (activeBundle?.id === bundleId) {
      return config.activeSkillDir;
    }

    return this.getBundleSkillDir(bundleId);
  }

  async getDomainKnowledge(bundleId = "", context = {}) {
    const skillDir = await this.getSkillDir(bundleId);
    const composed = await this.skillLoader.loadForContext(
      {
        documentType: context.documentType || "software_requirement",
        domain: context.domain || "",
        moduleSkillKey: context.moduleSkillKey || ""
      },
      skillDir
    );
    return composed[DOMAIN_KNOWLEDGE_FILE] || DEFAULT_DOMAIN_KNOWLEDGE;
  }

  async createCandidateBundle({ baseBundleId = "", proposal, proposalItems = [], replayTaskId = "", createdFromCaseIds = [], evaluationSummary = null }) {
    await this.ensureInitialized();
    const baseBundle = baseBundleId ? await this.getBundle(baseBundleId) : await this.getActiveBundle();
    const bundleId = randomUUID();
    const targetDir = this.getBundleSkillDir(bundleId);
    const baseDir = await this.getSkillDir(baseBundle?.id);

    if (path.resolve(baseDir) === path.resolve(config.activeSkillDir)) {
      await this.registryService.materializeAll(config.activeSkillDir);
    }
    await copyDirectory(baseDir, targetDir);
    await this.ensureDomainKnowledgeFile(targetDir);

    let ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, targetDir, { force: true });
    if (proposalItems.length) {
      ruleIndex = await this.skillRuleService.applyProposalItems({
        bundleId,
        bundleDir: targetDir,
        proposalItems,
        replayTaskId
      });
    } else {
      await this.applyProposalToBundle(targetDir, proposal);
      ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, targetDir, { force: true });
    }

    const metadata = {
      id: bundleId,
      version: `${baseBundle?.version || "1.0.0"}-candidate-${Date.now()}`,
      baseBundleId: baseBundle?.id || "",
      status: "candidate",
      files: [...MANAGED_SKILL_FILES, DOMAIN_KNOWLEDGE_FILE],
      changeSummary: proposal?.summary || "Candidate bundle generated from refinement run.",
      createdFromCaseIds,
      evaluationSummary,
      ruleIndexVersion: ruleIndex.ruleIndexVersion,
      appliedProposalItemIds: proposalItems.map((item) => item.proposalItemId || item.id),
      appliedReplayTaskIds: replayTaskId ? [replayTaskId] : [],
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getBundleMetaPath(bundleId), metadata);
    return metadata;
  }

  async applyProposalToBundle(bundleDir, proposal = {}) {
    if (proposal.appendWritingRules) {
      await fs.appendFile(
        path.join(bundleDir, "requirement_writing.md"),
        `\n\n## Refinement Additional Rules\n${proposal.appendWritingRules}\n`,
        "utf8"
      );
    }

    if (proposal.appendExtractionRules) {
      await fs.appendFile(
        path.join(bundleDir, "requirement_extraction.md"),
        `\n\n## Refinement Additional Rules\n${proposal.appendExtractionRules}\n`,
        "utf8"
      );
    }

    if (proposal.appendValidationRules) {
      await fs.appendFile(
        path.join(bundleDir, "requirement_validation.md"),
        `\n\n## Refinement Additional Rules\n${proposal.appendValidationRules}\n`,
        "utf8"
      );
    }

    if (proposal.appendGoodExamples) {
      await fs.appendFile(
        path.join(bundleDir, "examples", "good_examples.md"),
        `\n\n${proposal.appendGoodExamples}\n`,
        "utf8"
      );
    }

    const existingKnowledge = await readJson(
      path.join(bundleDir, DOMAIN_KNOWLEDGE_FILE),
      DEFAULT_DOMAIN_KNOWLEDGE
    );
    const mergedKnowledge = {
      ...existingKnowledge,
      examples: [...(existingKnowledge.examples || []), ...(proposal.domainKnowledge?.examples || [])],
      ruleHints: [...(existingKnowledge.ruleHints || []), ...(proposal.domainKnowledge?.ruleHints || [])],
      antiPatterns: [...(existingKnowledge.antiPatterns || []), ...(proposal.domainKnowledge?.antiPatterns || [])]
    };
    await writeJson(path.join(bundleDir, DOMAIN_KNOWLEDGE_FILE), mergedKnowledge);
  }

  async updateBundleEvaluationSummary(bundleId, evaluationSummary) {
    const metadata = await this.getBundle(bundleId);
    if (!metadata) {
      return null;
    }

    metadata.evaluationSummary = evaluationSummary;
    metadata.updatedAt = now();
    await writeJson(getBundleMetaPath(bundleId), metadata);
    return metadata;
  }

  async approveBundle(bundleId, evaluationSummary = null) {
    await this.ensureInitialized();
    const activeBundle = await this.getActiveBundle();
    const candidate = await this.getBundle(bundleId);
    if (!candidate) {
      throw new Error("Bundle not found");
    }
    if (candidate.status !== "candidate") {
      throw new Error("Only candidate bundles can be approved");
    }

    await copyDirectory(this.getBundleSkillDir(bundleId), config.activeSkillDir);
    await this.registryService.rebuildDatabaseFromFiles(config.activeSkillDir);

    if (activeBundle) {
      activeBundle.status = "archived";
      activeBundle.updatedAt = now();
      await writeJson(getBundleMetaPath(activeBundle.id), activeBundle);
    }

    candidate.status = "active";
    candidate.evaluationSummary = evaluationSummary || candidate.evaluationSummary || null;
    candidate.updatedAt = now();
    await writeJson(getBundleMetaPath(candidate.id), candidate);
    await writeJson(config.activeSkillBundlePointerPath, { bundleId: candidate.id });
    return candidate;
  }

  async rejectBundle(bundleId) {
    const bundle = await this.getBundle(bundleId);
    if (!bundle) {
      throw new Error("Bundle not found");
    }
    bundle.status = "archived";
    bundle.updatedAt = now();
    await writeJson(getBundleMetaPath(bundleId), bundle);
    return bundle;
  }
}
