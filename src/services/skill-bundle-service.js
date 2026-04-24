import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { copyDirectory, pathExists, readJson, writeJson } from "./storage.js";
import { SkillRuleService } from "./skill-rule-service.js";
import { SkillLoader } from "./skill-loader.js";
import { SkillRegistryService } from "./skill-registry-service.js";
import { SkillDatabaseService } from "./skill-database-service.js";

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

function getBundleSnapshotPath(bundleId) {
  return path.join(config.skillBundleSnapshotDir, `${bundleId}.sqlite`);
}

function serializeRuntimePath(value = "") {
  const resolved = path.resolve(value);
  const relativePath = path.relative(config.rootDir, resolved);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.replaceAll("\\", "/");
  }
  return resolved.replaceAll("\\", "/");
}

async function collectHashFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHashFiles(absolutePath, baseDir)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.includes(".tmp-")) continue;
    files.push({
      absolutePath,
      relativePath: path.relative(baseDir, absolutePath).replaceAll("\\", "/")
    });
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function computeSkillDirHash(skillDir) {
  const hash = createHash("sha1");
  const files = await collectHashFiles(skillDir);
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(await fs.readFile(file.absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
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
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
      const activePointer = await readJson(config.activeSkillBundlePointerPath);
      if (activePointer?.bundleId) {
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
        const activeMetadata = await readJson(getBundleMetaPath(activePointer.bundleId), null);
        if (activeMetadata && (!activeMetadata.snapshotHash || !activeMetadata.sqliteSnapshotPath)) {
          await this.persistBundleMetadata(
            {
              ...activeMetadata,
              updatedAt: now()
            },
            { skillDir: config.activeSkillDir }
          );
        }
        this.initialized = true;
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
      await this.persistBundleMetadata(metadata, { skillDir: bundleDir, forceRuleIndex: true });
      await writeJson(config.activeSkillBundlePointerPath, { bundleId });
      this.initialized = true;
    })();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
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

  getBundleSnapshotPath(bundleId) {
    return getBundleSnapshotPath(bundleId);
  }

  async createSqliteSnapshot(bundleId, skillDir) {
    const snapshotPath = getBundleSnapshotPath(bundleId);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.rm(snapshotPath, { force: true }).catch(() => {});

    const snapshotDb = new SkillDatabaseService(snapshotPath);
    try {
      const registries = await this.registryService.importActiveRegistriesFromFiles(skillDir);
      snapshotDb.importRegistries(registries);
      snapshotDb.setMeta("bundle_id", bundleId);
      snapshotDb.setMeta("snapshot_created_at", now());
    } finally {
      snapshotDb.close();
    }

    return snapshotPath;
  }

  async persistBundleMetadata(metadata = {}, options = {}) {
    const bundleId = metadata.id;
    if (!bundleId) {
      throw new Error("Bundle metadata requires id");
    }

    const skillDir = options.skillDir || (await this.getSkillDir(bundleId));
    if (path.resolve(skillDir) === path.resolve(config.activeSkillDir)) {
      await this.registryService.materializeAll(config.activeSkillDir);
    }
    const ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(bundleId, skillDir, {
      force: Boolean(options.forceRuleIndex)
    });
    const snapshotHash = await computeSkillDirHash(skillDir);
    const sqliteSnapshotPath = options.skipSqliteSnapshot
      ? metadata.sqliteSnapshotPath || ""
      : serializeRuntimePath(await this.createSqliteSnapshot(bundleId, skillDir));
    const nextMetadata = {
      ...metadata,
      files: metadata.files || [...MANAGED_SKILL_FILES, DOMAIN_KNOWLEDGE_FILE],
      ruleIndexVersion: ruleIndex.ruleIndexVersion,
      snapshotHash,
      sqliteSnapshotPath,
      updatedAt: metadata.updatedAt || now()
    };
    await writeJson(getBundleMetaPath(bundleId), nextMetadata);
    return nextMetadata;
  }

  async getSkillVersionRef(bundleId = "") {
    await this.ensureInitialized();
    const bundle = bundleId ? await this.getBundle(bundleId) : await this.getActiveBundle();
    if (!bundle) {
      throw new Error("Skill bundle not found");
    }
    const skillDir = await this.getSkillDir(bundle.id);
    const needsRefresh = !bundle.snapshotHash || !bundle.ruleIndexVersion || !bundle.sqliteSnapshotPath;
    const metadata = needsRefresh
      ? await this.persistBundleMetadata(
          {
            ...bundle,
            updatedAt: now()
          },
          { skillDir }
        )
      : bundle;
    return {
      bundleId: metadata.id,
      baseBundleId: metadata.baseBundleId || "",
      version: metadata.version || "",
      status: metadata.status || "",
      snapshotHash: metadata.snapshotHash || "",
      ruleIndexVersion: metadata.ruleIndexVersion || "",
      sqliteSnapshotPath: metadata.sqliteSnapshotPath || ""
    };
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
    const candidate = await this.createDraftBundle({
      baseBundleId,
      changeSummary: proposal?.summary || "Candidate bundle generated from refinement run.",
      sourceType: replayTaskId ? "replay_proposal" : "refinement_run",
      createdFromCaseIds
    });
    const targetDir = this.getBundleSkillDir(candidate.id);

    let ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(candidate.id, targetDir, { force: true });
    if (proposalItems.length) {
      ruleIndex = await this.skillRuleService.applyProposalItems({
        bundleId: candidate.id,
        bundleDir: targetDir,
        proposalItems,
        replayTaskId
      });
    } else {
      await this.applyProposalToBundle(targetDir, proposal);
      ruleIndex = await this.skillRuleService.ensureBundleRuleIndex(candidate.id, targetDir, { force: true });
    }

    const metadata = {
      ...candidate,
      status: "candidate",
      changeSummary: proposal?.summary || "Candidate bundle generated from refinement run.",
      createdFromCaseIds,
      evaluationSummary,
      ruleIndexVersion: ruleIndex.ruleIndexVersion,
      appliedProposalItemIds: [...(candidate.appliedProposalItemIds || []), ...proposalItems.map((item) => item.proposalItemId || item.id)],
      appliedReplayTaskIds: replayTaskId ? [...new Set([...(candidate.appliedReplayTaskIds || []), replayTaskId])] : candidate.appliedReplayTaskIds || [],
      updatedAt: now()
    };

    return this.persistBundleMetadata(metadata, { skillDir: targetDir, forceRuleIndex: true });
  }

  async createDraftBundle({
    baseBundleId = "",
    changeSummary = "Draft skill bundle.",
    sourceType = "manual_draft",
    createdFromCaseIds = [],
    createdFromWorkOrderIds = [],
    createdBy = "system",
    forkedFromBundleId = ""
  } = {}) {
    await this.ensureInitialized();
    const activeBundle = await this.getActiveBundle();
    const baseBundle = baseBundleId ? await this.getBundle(baseBundleId) : activeBundle;
    if (!baseBundle) {
      throw new Error("Base bundle not found");
    }

    const bundleId = randomUUID();
    const targetDir = this.getBundleSkillDir(bundleId);
    const baseDir = forkedFromBundleId
      ? await this.getSkillDir(forkedFromBundleId)
      : await this.getSkillDir(baseBundle.id);
    if (path.resolve(baseDir) === path.resolve(config.activeSkillDir)) {
      await this.registryService.materializeAll(config.activeSkillDir);
    }
    await copyDirectory(baseDir, targetDir);
    await this.ensureDomainKnowledgeFile(targetDir);

    const metadata = {
      id: bundleId,
      version: `${baseBundle.version || "1.0.0"}-candidate-${Date.now()}`,
      baseBundleId: baseBundle.id,
      baseSnapshotHash: baseBundle.snapshotHash || "",
      forkedFromBundleId,
      status: "candidate",
      sourceType,
      files: [...MANAGED_SKILL_FILES, DOMAIN_KNOWLEDGE_FILE],
      changeSummary,
      createdBy,
      createdFromCaseIds,
      createdFromWorkOrderIds,
      evaluationSummary: null,
      appliedProposalItemIds: [],
      appliedReplayTaskIds: [],
      stagedWorkOrderItemIds: [],
      stagedChanges: [],
      createdAt: now(),
      updatedAt: now()
    };

    return this.persistBundleMetadata(metadata, { skillDir: targetDir, forceRuleIndex: true });
  }

  async findOrCreateWorkOrderCandidate({ baseBundleId = "", workOrderId = "", changeSummary = "" } = {}) {
    await this.ensureInitialized();
    const baseBundle = baseBundleId ? await this.getBundle(baseBundleId) : await this.getActiveBundle();
    if (!baseBundle) {
      throw new Error("Base bundle not found");
    }
    const bundles = await this.listBundles();
    const existing = bundles.find(
      (bundle) =>
        bundle.status === "candidate" &&
        bundle.baseBundleId === baseBundle.id &&
        bundle.sourceType === "work_order_staging" &&
        (!workOrderId || (bundle.createdFromWorkOrderIds || []).includes(workOrderId))
    );
    if (existing) {
      return existing;
    }

    return this.createDraftBundle({
      baseBundleId: baseBundle.id,
      changeSummary: changeSummary || `Work order staging candidate based on ${baseBundle.id}.`,
      sourceType: "work_order_staging",
      createdFromWorkOrderIds: workOrderId ? [workOrderId] : []
    });
  }

  async recordStagedWorkOrderItem(bundleId, change = {}) {
    const bundle = await this.getBundle(bundleId);
    if (!bundle) {
      throw new Error("Bundle not found");
    }
    if (bundle.status !== "candidate") {
      throw new Error("Only candidate bundles can receive staged work order items");
    }
    const workOrderId = String(change.workOrderId || "").trim();
    const workOrderItemId = String(change.workOrderItemId || "").trim();
    const next = {
      ...bundle,
      createdFromWorkOrderIds: workOrderId
        ? [...new Set([...(bundle.createdFromWorkOrderIds || []), workOrderId])]
        : bundle.createdFromWorkOrderIds || [],
      stagedWorkOrderItemIds: workOrderItemId
        ? [...new Set([...(bundle.stagedWorkOrderItemIds || []), workOrderItemId])]
        : bundle.stagedWorkOrderItemIds || [],
      stagedChanges: [
        ...(bundle.stagedChanges || []),
        {
          ...change,
          stagedAt: change.stagedAt || now()
        }
      ],
      updatedAt: now()
    };
    return this.persistBundleMetadata(next, {
      skillDir: await this.getSkillDir(bundleId),
      forceRuleIndex: true
    });
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
    return this.releaseBundle(bundleId, { evaluationSummary });
  }

  async releaseBundle(bundleId, options = {}) {
    await this.ensureInitialized();
    const activeBundle = await this.getActiveBundle();
    const candidate = await this.getBundle(bundleId);
    if (!candidate) {
      throw new Error("Bundle not found");
    }
    if (candidate.status !== "candidate") {
      throw new Error("Only candidate bundles can be approved");
    }
    if (activeBundle?.id && candidate.baseBundleId && candidate.baseBundleId !== activeBundle.id && !options.force) {
      const error = new Error("Candidate bundle is not based on the current active bundle");
      error.code = "skill_bundle_base_mismatch";
      error.details = {
        candidateBundleId: candidate.id,
        candidateBaseBundleId: candidate.baseBundleId,
        activeBundleId: activeBundle.id
      };
      throw error;
    }

    await copyDirectory(this.getBundleSkillDir(bundleId), config.activeSkillDir);
    await this.registryService.rebuildDatabaseFromFiles(config.activeSkillDir);

    if (activeBundle) {
      activeBundle.status = "archived";
      activeBundle.archivedAt = now();
      activeBundle.updatedAt = now();
      await writeJson(getBundleMetaPath(activeBundle.id), activeBundle);
    }

    const releasedAt = now();
    const released = await this.persistBundleMetadata(
      {
        ...candidate,
        status: "active",
        evaluationSummary: options.evaluationSummary || candidate.evaluationSummary || null,
        releasedAt,
        releasedBy: options.releasedBy || "system",
        updatedAt: releasedAt
      },
      { skillDir: config.activeSkillDir, forceRuleIndex: true }
    );
    await writeJson(config.activeSkillBundlePointerPath, { bundleId: candidate.id });
    return released;
  }

  async rollbackBundle(bundleId, options = {}) {
    await this.ensureInitialized();
    const target = await this.getBundle(bundleId);
    const activeBundle = await this.getActiveBundle();
    if (!target) {
      throw new Error("Bundle not found");
    }
    if (activeBundle?.id === target.id) {
      return target;
    }
    if (!["archived", "rolled_back", "active"].includes(target.status)) {
      const error = new Error("Only archived bundles can be rolled back to active");
      error.code = "skill_bundle_rollback_status_invalid";
      error.details = { bundleId, status: target.status };
      throw error;
    }

    await copyDirectory(this.getBundleSkillDir(target.id), config.activeSkillDir);
    await this.registryService.rebuildDatabaseFromFiles(config.activeSkillDir);

    if (activeBundle) {
      await writeJson(getBundleMetaPath(activeBundle.id), {
        ...activeBundle,
        status: "rolled_back",
        rolledBackAt: now(),
        updatedAt: now()
      });
    }

    const activated = await this.persistBundleMetadata(
      {
        ...target,
        status: "active",
        rollbackFromBundleId: activeBundle?.id || "",
        rollbackReason: options.reason || "",
        rolledForwardAt: now(),
        updatedAt: now()
      },
      { skillDir: config.activeSkillDir, forceRuleIndex: true }
    );
    await writeJson(config.activeSkillBundlePointerPath, { bundleId: target.id });
    return activated;
  }

  async forkBundle(bundleId, options = {}) {
    await this.ensureInitialized();
    const source = await this.getBundle(bundleId);
    if (!source) {
      throw new Error("Bundle not found");
    }
    const activeBundle = await this.getActiveBundle();
    return this.createDraftBundle({
      baseBundleId: options.baseBundleId || activeBundle?.id || source.baseBundleId || source.id,
      forkedFromBundleId: source.id,
      sourceType: "bundle_fork",
      changeSummary: options.changeSummary || `Forked from ${source.id}.`,
      createdBy: options.createdBy || "system"
    });
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
