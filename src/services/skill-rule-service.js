import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { pathExists, readJson, writeJson } from "./storage.js";

const RULE_FILE_MAP = {
  writing: "requirement_writing.md",
  extraction: "requirement_extraction.md",
  validation: "requirement_validation.md",
  examples_good: path.join("examples", "good_examples.md"),
  examples_bad: path.join("examples", "bad_examples.md")
};

const FILE_META = {
  "requirement_writing.md": { prefix: "RW", title: "Requirement Writing Rules" },
  "requirement_extraction.md": { prefix: "RE", title: "Requirement Extraction Rules" },
  "requirement_validation.md": { prefix: "RV", title: "Requirement Validation Rules" },
  [path.join("examples", "good_examples.md")]: { prefix: "EX-GOOD", title: "Good Examples" },
  [path.join("examples", "bad_examples.md")]: { prefix: "EX-BAD", title: "Bad Examples" },
  "domain-knowledge.json": { prefix: "DK", title: "Domain Knowledge" }
};

const MANAGED_SKILL_FILES = [
  RULE_FILE_MAP.extraction,
  RULE_FILE_MAP.writing,
  RULE_FILE_MAP.validation,
  RULE_FILE_MAP.examples_good,
  RULE_FILE_MAP.examples_bad,
  "domain-knowledge.json"
];

function now() {
  return new Date().toISOString();
}

function normalizeTargetFile(targetFile = "") {
  return targetFile.replaceAll("/", path.sep);
}

function getRuleIndexPath(bundleId) {
  return path.join(config.skillRuleDir, `${bundleId}.json`);
}

function getMetaForFile(targetFile) {
  return FILE_META[normalizeTargetFile(targetFile)] || { prefix: "RULE", title: targetFile };
}

function parseExplicitRuleId(line) {
  const match = /^###\s+([A-Z-]+-\d{3})\s*(.*)$/.exec(line.trim());
  if (!match) return null;
  return {
    ruleId: match[1],
    title: match[2]?.trim() || match[1]
  };
}

function toParagraphs(text) {
  return text
    .split(/\r?\n\s*\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferTitle(sectionKey, fallbackTitle, index) {
  const base = (sectionKey || fallbackTitle || "Rule").trim();
  return `${base} ${index}`;
}

function createRule({ bundleId, targetFile, sectionKey, title, content, ruleId = "", sourceType = "legacy_import", sourceRef = {} }) {
  const createdAt = now();
  return {
    id: randomUUID(),
    ruleId,
    bundleId,
    targetFile: normalizeTargetFile(targetFile),
    sectionKey: sectionKey || "default",
    title: title || ruleId,
    content: (content || "").trim(),
    status: "active",
    version: 1,
    sourceType,
    sourceRef,
    createdAt,
    updatedAt: createdAt
  };
}

function ensureRuleIds(rules) {
  const counters = new Map();
  for (const rule of rules) {
    const targetFile = normalizeTargetFile(rule.targetFile);
    const prefix = getMetaForFile(targetFile).prefix;
    const explicit = rule.ruleId && /^([A-Z-]+)-(\d{3})$/.exec(rule.ruleId);
    if (explicit) {
      const value = Number(explicit[2]);
      counters.set(prefix, Math.max(counters.get(prefix) || 0, value));
      continue;
    }
    const nextValue = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, nextValue);
    rule.ruleId = `${prefix}-${String(nextValue).padStart(3, "0")}`;
  }
  return rules;
}

function parseMarkdownRules(text, bundleId, targetFile) {
  const normalizedTargetFile = normalizeTargetFile(targetFile);
  const lines = text.split(/\r?\n/);
  const rules = [];
  let currentSection = "default";
  let pendingExplicit = null;
  let pendingContent = [];
  let looseItems = [];

  function flushExplicit() {
    if (!pendingExplicit) return;
    rules.push(
      createRule({
        bundleId,
        targetFile: normalizedTargetFile,
        sectionKey: currentSection,
        title: pendingExplicit.title,
        content: pendingContent.join("\n").trim() || pendingExplicit.title,
        ruleId: pendingExplicit.ruleId,
        sourceRef: { importStrategy: "explicit_heading" }
      })
    );
    pendingExplicit = null;
    pendingContent = [];
  }

  function flushLooseItems() {
    if (!looseItems.length) return;
    looseItems.forEach((item, index) => {
      rules.push(
        createRule({
          bundleId,
          targetFile: normalizedTargetFile,
          sectionKey: currentSection,
          title: inferTitle(currentSection, getMetaForFile(normalizedTargetFile).title, index + 1),
          content: item,
          sourceRef: { importStrategy: "bullet_or_paragraph" }
        })
      );
    });
    looseItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const explicit = parseExplicitRuleId(line);
    if (explicit) {
      flushExplicit();
      flushLooseItems();
      pendingExplicit = explicit;
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushExplicit();
      flushLooseItems();
      currentSection = line.replace(/^##\s+/, "").trim() || "default";
      continue;
    }

    if (pendingExplicit) {
      if (/^###\s+/.test(line)) {
        flushExplicit();
        pendingExplicit = parseExplicitRuleId(line);
        continue;
      }
      if (line) {
        pendingContent.push(line);
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      looseItems.push(line.replace(/^[-*]\s+/, "").trim());
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      looseItems.push(line.replace(/^\d+\.\s+/, "").trim());
      continue;
    }
  }

  flushExplicit();
  flushLooseItems();

  if (!rules.length) {
    const paragraphs = toParagraphs(text.replace(/^#.*$/gm, "").trim());
    paragraphs.forEach((paragraph, index) => {
      rules.push(
        createRule({
          bundleId,
          targetFile: normalizedTargetFile,
          sectionKey: "default",
          title: inferTitle(getMetaForFile(normalizedTargetFile).title, "Rule", index + 1),
          content: paragraph,
          sourceRef: { importStrategy: "paragraph_fallback" }
        })
      );
    });
  }

  return ensureRuleIds(rules).filter((rule) => rule.content);
}

function parseDomainKnowledgeRules(bundleId, knowledge = {}) {
  const rules = [];
  const examples = Array.isArray(knowledge.examples) ? knowledge.examples : [];
  const hints = Array.isArray(knowledge.ruleHints) ? knowledge.ruleHints : [];
  const antiPatterns = Array.isArray(knowledge.antiPatterns) ? knowledge.antiPatterns : [];

  examples.forEach((item, index) => {
    rules.push(
      createRule({
        bundleId,
        targetFile: path.join("examples", "good_examples.md"),
        sectionKey: "domain_examples",
        title: item.topic || `Domain Example ${index + 1}`,
        content: item.requirementText || JSON.stringify(item),
        sourceRef: { importStrategy: "domain_knowledge_example", item }
      })
    );
  });

  hints.forEach((item, index) => {
    rules.push(
      createRule({
        bundleId,
        targetFile: "domain-knowledge.json",
        sectionKey: "ruleHints",
        title: `${item.subdomain || item.domain || "Hint"} ${index + 1}`,
        content: JSON.stringify(item, null, 2),
        sourceRef: { importStrategy: "domain_knowledge_hint", item }
      })
    );
  });

  antiPatterns.forEach((item, index) => {
    rules.push(
      createRule({
        bundleId,
        targetFile: path.join("examples", "bad_examples.md"),
        sectionKey: "anti_patterns",
        title: `Anti Pattern ${index + 1}`,
        content: String(item),
        sourceRef: { importStrategy: "domain_knowledge_antipattern", item }
      })
    );
  });

  return ensureRuleIds(rules);
}

function renderMarkdownFile(targetFile, rules = []) {
  const meta = getMetaForFile(targetFile);
  const groups = new Map();
  for (const rule of rules.filter((item) => item.status === "active" && normalizeTargetFile(item.targetFile) === normalizeTargetFile(targetFile))) {
    const key = rule.sectionKey || "default";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }

  const sections = [`# ${meta.title}`];
  for (const [sectionKey, items] of groups.entries()) {
    if (sectionKey && sectionKey !== "default") {
      sections.push(`\n## ${sectionKey}`);
    }
    for (const rule of items) {
      sections.push(`\n### ${rule.ruleId} ${rule.title}\n${rule.content.trim()}\n`);
    }
  }
  return `${sections.join("\n").trim()}\n`;
}

async function appendChangeLog(entries) {
  const existing = await readJson(config.skillRuleChangeLogPath, []);
  await writeJson(config.skillRuleChangeLogPath, [...existing, ...entries]);
}

export class SkillRuleService {
  async getRuleIndex(bundleId) {
    return readJson(getRuleIndexPath(bundleId));
  }

  async listRules(bundleId) {
    const index = await this.getRuleIndex(bundleId);
    return index?.rules || [];
  }

  async getRelevantRuleSnapshot(bundleId, targetAreas = []) {
    const rules = await this.listRules(bundleId);
    if (!targetAreas.length) {
      return rules.slice(0, 20);
    }
    const files = new Set(targetAreas.map((area) => this.resolveAreaTargetFile(area)));
    return rules.filter((rule) => files.has(normalizeTargetFile(rule.targetFile))).slice(0, 20);
  }

  resolveAreaTargetFile(targetArea = "") {
    const area = targetArea || "validation";
    if (area === "writing") return RULE_FILE_MAP.writing;
    if (area === "extraction") return RULE_FILE_MAP.extraction;
    if (area === "examples") return RULE_FILE_MAP.examples_bad;
    if (area === "domain_knowledge") return "domain-knowledge.json";
    return RULE_FILE_MAP.validation;
  }

  async ensureBundleRuleIndex(bundleId, skillDir, options = {}) {
    const existing = await this.getRuleIndex(bundleId);
    if (existing && !options.force) {
      return existing;
    }
    return this.importBundleRules(bundleId, skillDir, options);
  }

  async importBundleRules(bundleId, skillDir, options = {}) {
    const rules = [];
    for (const relativeFile of MANAGED_SKILL_FILES) {
      const absolutePath = path.join(skillDir, relativeFile);
      if (!(await pathExists(absolutePath))) {
        continue;
      }
      if (relativeFile === "domain-knowledge.json") {
        continue;
      }
      const text = await fs.readFile(absolutePath, "utf8");
      rules.push(...parseMarkdownRules(text, bundleId, relativeFile));
    }

    const domainKnowledge = await readJson(path.join(skillDir, "domain-knowledge.json"), {
      version: 1,
      examples: [],
      ruleHints: [],
      antiPatterns: []
    });
    rules.push(...parseDomainKnowledgeRules(bundleId, domainKnowledge));

    const ruleIndex = {
      bundleId,
      ruleIndexVersion: options.ruleIndexVersion || `import-${Date.now()}`,
      importedAt: now(),
      skillDir,
      rules: ensureRuleIds(rules),
      domainKnowledge
    };
    await writeJson(getRuleIndexPath(bundleId), ruleIndex);
    return ruleIndex;
  }

  async applyProposalItems({ bundleId, bundleDir, proposalItems = [], replayTaskId = "" }) {
    const index = await this.ensureBundleRuleIndex(bundleId, bundleDir, { force: true });
    const rules = [...(index.rules || [])].map((rule) => ({ ...rule }));
    const domainKnowledge = { ...(index.domainKnowledge || { version: 1, examples: [], ruleHints: [], antiPatterns: [] }) };
    const changeLogEntries = [];

    const nextRuleId = (targetFile) => {
      const prefix = getMetaForFile(targetFile).prefix;
      const max = rules
        .filter((rule) => rule.ruleId.startsWith(`${prefix}-`))
        .reduce((acc, rule) => Math.max(acc, Number(rule.ruleId.split("-").pop()) || 0), 0);
      return `${prefix}-${String(max + 1).padStart(3, "0")}`;
    };

    for (const item of proposalItems) {
      const payload = item.editedPayload || item;
      const action = payload.action || item.action;
      const targetFile = normalizeTargetFile(payload.targetFile || item.targetFile || this.resolveAreaTargetFile(payload.targetArea));
      const timestamp = now();

      if (action === "modify_rule") {
        const target = rules.find((rule) => rule.ruleId === payload.targetRuleId);
        if (!target) {
          continue;
        }
        target.title = payload.title || target.title;
        target.content = (payload.after || payload.newRuleDraft?.content || target.content).trim();
        target.version += 1;
        target.updatedAt = timestamp;
        target.sourceType = "replay_proposal";
        target.sourceRef = { replayTaskId, proposalItemId: item.proposalItemId || item.id, evidenceRefs: payload.evidenceRefs || item.evidenceRefs || [] };
        changeLogEntries.push({
          id: randomUUID(),
          bundleId,
          ruleId: target.ruleId,
          action,
          replayTaskId,
          proposalItemId: item.proposalItemId || item.id,
          at: timestamp
        });
        continue;
      }

      if (action === "deprecate_rule") {
        const target = rules.find((rule) => rule.ruleId === payload.targetRuleId);
        if (!target) {
          continue;
        }
        target.status = "deprecated";
        target.version += 1;
        target.updatedAt = timestamp;
        changeLogEntries.push({
          id: randomUUID(),
          bundleId,
          ruleId: target.ruleId,
          action,
          replayTaskId,
          proposalItemId: item.proposalItemId || item.id,
          at: timestamp
        });
        continue;
      }

      if (action === "split_rule") {
        const target = rules.find((rule) => rule.ruleId === payload.targetRuleId);
        if (target) {
          target.status = "deprecated";
          target.version += 1;
          target.updatedAt = timestamp;
        }
        const newRules = Array.isArray(payload.newRuleDraft?.rules) ? payload.newRuleDraft.rules : [];
        for (const newRule of newRules) {
          const created = createRule({
            bundleId,
            targetFile,
            sectionKey: payload.sectionKey || target?.sectionKey || "default",
            title: newRule.title,
            content: newRule.content,
            ruleId: nextRuleId(targetFile),
            sourceType: "replay_proposal",
            sourceRef: { replayTaskId, proposalItemId: item.proposalItemId || item.id, evidenceRefs: payload.evidenceRefs || [] }
          });
          rules.push(created);
          changeLogEntries.push({
            id: randomUUID(),
            bundleId,
            ruleId: created.ruleId,
            action: "add_rule",
            replayTaskId,
            proposalItemId: item.proposalItemId || item.id,
            at: timestamp
          });
        }
        continue;
      }

      if (action === "modify_domain_knowledge") {
        const patch = payload.editedPayload || payload.domainKnowledgePatch || payload.newRuleDraft?.domainKnowledgePatch || {};
        domainKnowledge.examples = [...(domainKnowledge.examples || []), ...(patch.examples || [])];
        domainKnowledge.ruleHints = [...(domainKnowledge.ruleHints || []), ...(patch.ruleHints || [])];
        domainKnowledge.antiPatterns = [...(domainKnowledge.antiPatterns || []), ...(patch.antiPatterns || [])];
        changeLogEntries.push({
          id: randomUUID(),
          bundleId,
          ruleId: payload.targetRuleId || "domain-knowledge",
          action,
          replayTaskId,
          proposalItemId: item.proposalItemId || item.id,
          at: timestamp
        });
        continue;
      }

      const created = createRule({
        bundleId,
        targetFile,
        sectionKey: payload.sectionKey || "Feedback Replay",
        title: payload.title || payload.newRuleDraft?.title || "Replay Proposal",
        content: (payload.after || payload.newRuleDraft?.content || "").trim(),
        ruleId: nextRuleId(targetFile),
        sourceType: "replay_proposal",
        sourceRef: { replayTaskId, proposalItemId: item.proposalItemId || item.id, evidenceRefs: payload.evidenceRefs || item.evidenceRefs || [] }
      });
      if (!created.content) {
        continue;
      }
      rules.push(created);
      changeLogEntries.push({
        id: randomUUID(),
        bundleId,
        ruleId: created.ruleId,
        action,
        replayTaskId,
        proposalItemId: item.proposalItemId || item.id,
        at: timestamp
      });
    }

    const nextIndex = {
      bundleId,
      ruleIndexVersion: `rules-${Date.now()}`,
      importedAt: index.importedAt,
      skillDir: bundleDir,
      rules,
      domainKnowledge
    };

    await writeJson(getRuleIndexPath(bundleId), nextIndex);
    await appendChangeLog(changeLogEntries);

    for (const targetFile of [RULE_FILE_MAP.extraction, RULE_FILE_MAP.writing, RULE_FILE_MAP.validation, RULE_FILE_MAP.examples_good, RULE_FILE_MAP.examples_bad]) {
      await fs.writeFile(path.join(bundleDir, targetFile), renderMarkdownFile(targetFile, rules), "utf8");
    }
    await writeJson(path.join(bundleDir, "domain-knowledge.json"), domainKnowledge);

    return nextIndex;
  }
}
