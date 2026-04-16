import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";
import { SkillRegistryService } from "./skill-registry-service.js";

function now() {
  return new Date().toISOString();
}

function getRuleIndexPath(bundleId) {
  return path.join(config.skillRuleDir, `${bundleId}.json`);
}

function normalizeTargetArea(area = "") {
  return area || "validation";
}

function mapKindToTargetFile(kind = "") {
  if (kind === "writing_rule") return "requirement_writing.md";
  if (kind === "extraction_rule") return "requirement_extraction.md";
  if (kind === "validation_rule") return "requirement_validation.md";
  if (kind === "good_example") return "examples/good_examples.md";
  if (kind === "bad_example") return "examples/bad_examples.md";
  return "domain-knowledge.json";
}

function mapTargetAreaToKinds(area = "") {
  if (area === "writing") return ["writing_rule", "good_example", "rule_hint", "generation_priority"];
  if (area === "extraction") return ["extraction_rule", "rule_hint", "generation_priority"];
  if (area === "examples") return ["good_example", "bad_example", "anti_pattern"];
  if (area === "domain_knowledge") {
    return [
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
    ];
  }
  return ["validation_rule", "anti_pattern", "rule_hint"];
}

function flattenKnowledgePatch(patch = {}, targetLayer, targetProfileKey, evidenceRefs = []) {
  const items = [];
  for (const content of patch.generationPriorities || []) {
    items.push({
      action: "add_skill_item",
      targetLayer,
      targetProfileKey,
      kind: "generation_priority",
      title: "generation priority",
      newItemDraft: { content, structuredPayload: null },
      evidenceRefs
    });
  }
  for (const example of patch.examples || []) {
    items.push({
      action: "add_skill_item",
      targetLayer,
      targetProfileKey,
      kind: "good_example",
      title: example.topic || example.requirementId || "example",
      newItemDraft: {
        content: example.requirementText || "",
        structuredPayload: example
      },
      evidenceRefs
    });
  }
  for (const hint of patch.ruleHints || []) {
    items.push({
      action: "add_skill_item",
      targetLayer,
      targetProfileKey,
      kind: "rule_hint",
      title: hint.subdomain || hint.domain || hint.documentType || "rule hint",
      newItemDraft: {
        content: "",
        structuredPayload: hint
      },
      evidenceRefs
    });
  }
  for (const antiPattern of patch.antiPatterns || []) {
    items.push({
      action: "add_skill_item",
      targetLayer,
      targetProfileKey,
      kind: "anti_pattern",
      title: "anti pattern",
      newItemDraft: { content: antiPattern, structuredPayload: null },
      evidenceRefs
    });
  }
  return items;
}

export class SkillRuleService {
  constructor() {
    this.registryService = new SkillRegistryService();
  }

  async getRuleIndex(bundleId) {
    return readJson(getRuleIndexPath(bundleId));
  }

  resolveAreaTargetFile(targetArea = "") {
    const area = normalizeTargetArea(targetArea);
    if (area === "writing") return "requirement_writing.md";
    if (area === "extraction") return "requirement_extraction.md";
    if (area === "examples") return "examples/bad_examples.md";
    if (area === "domain_knowledge") return "domain-knowledge.json";
    return "requirement_validation.md";
  }

  async listRules(bundleId) {
    const index = await this.getRuleIndex(bundleId);
    return index?.rules || [];
  }

  async ensureBundleRuleIndex(bundleId, skillDir, options = {}) {
    const existing = await this.getRuleIndex(bundleId);
    if (existing && !options.force) {
      return existing;
    }
    return this.importBundleRules(bundleId, skillDir, options);
  }

  async importBundleRules(bundleId, skillDir, options = {}) {
    const registryIndex = await this.registryService.getRegistryIndex(skillDir, { includeDeprecated: true });
    const rules = registryIndex.items.map((item) => ({
      id: item.skillCode,
      ruleId: item.skillCode,
      skillCode: item.skillCode,
      bundleId,
      targetFile: mapKindToTargetFile(item.kind),
      targetArea: item.targetAreas?.[0] || "domain_knowledge",
      layer: item.layer,
      profileKey: item.profileKey,
      documentTypeScope: item.documentTypeScope || "",
      kind: item.kind,
      title: item.title,
      content: item.content || item.structuredPayload?.requirementText || JSON.stringify(item.structuredPayload || {}),
      sectionKey: item.sectionKey || "default",
      status: item.status,
      version: item.provenance?.createdFromProposalId ? 2 : 1,
      sourceType: item.provenance?.replayTaskId ? "replay_proposal" : item.provenance?.createdFromProposalId ? "proposal" : "registry",
      sourceRef: {
        migratedFromRuleId: item.provenance?.migratedFromRuleId || "",
        createdFromCaseIds: item.provenance?.createdFromCaseIds || [],
        createdFromProposalId: item.provenance?.createdFromProposalId || "",
        replayTaskId: item.provenance?.replayTaskId || "",
        legacySource: item.provenance?.legacySource || "",
        registryPath: item.registryPath || ""
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));

    const ruleIndex = {
      bundleId,
      ruleIndexVersion: options.ruleIndexVersion || `registry-${Date.now()}`,
      importedAt: now(),
      skillDir,
      rules,
      domainKnowledge: await readJson(path.join(skillDir, "domain-knowledge.json"), {
        version: 1,
        generationPriorities: [],
        examples: [],
        ruleHints: [],
        antiPatterns: []
      })
    };

    await writeJson(getRuleIndexPath(bundleId), ruleIndex);
    return ruleIndex;
  }

  async getRelevantRuleSnapshot(bundleId, targetAreas = [], context = {}) {
    const index = await this.getRuleIndex(bundleId);
    const baseRules = index?.rules || [];
    if (!baseRules.length) return [];

    const kinds = new Set(targetAreas.flatMap((area) => mapTargetAreaToKinds(area)));
    const selected = baseRules
      .filter((rule) => (!kinds.size ? true : kinds.has(rule.kind)))
      .filter((rule) => {
        if (rule.layer === "docType" && context.documentType) return rule.profileKey === context.documentType;
        if (rule.layer === "domain" && context.domain) return rule.profileKey === context.domain;
        if (rule.layer === "module" && context.moduleSkillKey) return rule.profileKey === context.moduleSkillKey;
        return true;
      })
      .sort((left, right) => this.scoreRule(right, targetAreas, context) - this.scoreRule(left, targetAreas, context))
      .slice(0, 20);

    return selected;
  }

  scoreRule(rule, targetAreas = [], context = {}) {
    let score = 0;
    if (rule.layer === "module" && context.moduleSkillKey && rule.profileKey === context.moduleSkillKey) score += 20;
    if (rule.layer === "domain" && context.domain && rule.profileKey === context.domain) score += 16;
    if (rule.layer === "docType" && context.documentType && rule.profileKey === context.documentType) score += 12;
    if (rule.layer === "generic") score += 5;
    if (targetAreas.includes(rule.targetArea)) score += 8;
    return score;
  }

  async applyProposalItems({ bundleId, bundleDir, proposalItems = [], replayTaskId = "" }) {
    await this.registryService.ensureAllRegistries(bundleDir);
    const changeLogEntries = [];

    const normalizedItems = [];
    for (const proposalItem of proposalItems) {
      const payload = proposalItem.editedPayload || proposalItem;
      if (payload.action === "modify_domain_knowledge") {
        normalizedItems.push(
          ...flattenKnowledgePatch(
            payload.domainKnowledgePatch || payload.newRuleDraft?.domainKnowledgePatch || {},
            payload.targetLayer || "generic",
            payload.targetProfileKey || "generic",
            payload.evidenceRefs || proposalItem.evidenceRefs || []
          )
        );
        continue;
      }

      normalizedItems.push({
        ...proposalItem,
        ...payload
      });
    }

    for (const item of normalizedItems) {
      const action = item.action || "add_skill_item";
      const targetSkillCode = item.targetSkillCode || item.targetRuleId || "";
      const targetLayer = item.targetLayer || (targetSkillCode ? (await this.registryService.getItem(targetSkillCode, bundleDir)).layer : "generic");
      const targetProfileKey =
        item.targetProfileKey ||
        (targetSkillCode ? (await this.registryService.getItem(targetSkillCode, bundleDir)).profileKey : "generic");
      const kind = item.kind || item.newItemDraft?.kind || "validation_rule";
      const proposalItemId = item.proposalItemId || item.id || randomUUID();

      if (action === "modify_skill_item" || action === "modify_rule") {
        if (!targetSkillCode) continue;
        await this.registryService.updateItem(
          targetSkillCode,
          {
            title: item.title || item.newItemDraft?.title || undefined,
            content: item.after || item.newItemDraft?.content || undefined,
            structuredPayload: item.newItemDraft?.structuredPayload,
            review: {
              reviewer: "system",
              note: item.rationale || "",
              updatedAt: now()
            },
            provenance: {
              createdFromProposalId: proposalItemId,
              createdFromCaseIds: item.basedOnCaseIds || [],
              replayTaskId
            }
          },
          bundleDir
        );
        changeLogEntries.push({
          id: randomUUID(),
          bundleId,
          skillCode: targetSkillCode,
          action: "modify_skill_item",
          replayTaskId,
          proposalItemId,
          at: now()
        });
        continue;
      }

      if (action === "deprecate_skill_item" || action === "deprecate_rule") {
        if (!targetSkillCode) continue;
        await this.registryService.updateItem(
          targetSkillCode,
          {
            status: "deprecated",
            review: {
              reviewer: "system",
              note: item.rationale || "",
              updatedAt: now()
            }
          },
          bundleDir
        );
        changeLogEntries.push({
          id: randomUUID(),
          bundleId,
          skillCode: targetSkillCode,
          action: "deprecate_skill_item",
          replayTaskId,
          proposalItemId,
          at: now()
        });
        continue;
      }

      if (action === "split_skill_item" || action === "split_rule") {
        if (!targetSkillCode) continue;
        await this.registryService.updateItem(targetSkillCode, { status: "deprecated" }, bundleDir);
        for (const draft of item.newItemDraft?.rules || []) {
          const created = await this.registryService.createItem(
            {
              layer: targetLayer,
              profileKey: targetProfileKey,
              kind,
              title: draft.title,
              content: draft.content,
              provenance: {
                createdFromProposalId: proposalItemId,
                createdFromCaseIds: item.basedOnCaseIds || [],
                replayTaskId
              }
            },
            bundleDir
          );
          changeLogEntries.push({
            id: randomUUID(),
            bundleId,
            skillCode: created.skillCode,
            action: "add_skill_item",
            replayTaskId,
            proposalItemId,
            at: now()
          });
        }
        continue;
      }

      const created = await this.registryService.createItem(
        {
          layer: targetLayer,
          profileKey: targetProfileKey,
          kind,
          title: item.title || item.newItemDraft?.title || "Skill Proposal",
          content: item.after || item.newItemDraft?.content || "",
          structuredPayload: item.newItemDraft?.structuredPayload,
          provenance: {
            createdFromProposalId: proposalItemId,
            createdFromCaseIds: item.basedOnCaseIds || [],
            replayTaskId
          },
          review: {
            reviewer: "system",
            note: item.rationale || "",
            updatedAt: now()
          }
        },
        bundleDir
      );
      changeLogEntries.push({
        id: randomUUID(),
        bundleId,
        skillCode: created.skillCode,
        action: "add_skill_item",
        replayTaskId,
        proposalItemId,
        at: now()
      });
    }

    const nextIndex = await this.importBundleRules(bundleId, bundleDir, { force: true, ruleIndexVersion: `registry-${Date.now()}` });
    const existingLog = await readJson(config.skillRuleChangeLogPath, []);
    await writeJson(config.skillRuleChangeLogPath, [...existingLog, ...changeLogEntries]);
    return nextIndex;
  }
}
