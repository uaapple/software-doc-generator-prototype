import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { LlmProfileService } from "./llm-profile-service.js";

export class LlmService {
  constructor() {
    this.skillLoader = new SkillLoader();
    this.templateService = new TemplateService();
    this.skillBundleService = new SkillBundleService();
    this.profileService = new LlmProfileService();
  }

  async hasAvailableProfile() {
    const profile = await this.profileService.resolveProfile();
    return Boolean(profile?.apiKey);
  }

  async generateRequirements(project, extractions, options = {}) {
    const template = await this.templateService.getTemplate();
    const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
    const skills = await this.skillLoader.loadAll(skillDir);
    const knowledge = skills["domain-knowledge.json"] || {};
    const evidence = extractions.flatMap((item) => item.evidence || []);
    const profile = await this.profileService.resolveProfile(options.llmProfileId);

    if (!profile?.apiKey) {
      return applyDomainKnowledgePolicies(buildFallbackRequirements(project, evidence, template, skills), knowledge);
    }

    const client = new OpenAI({
      apiKey: profile.apiKey,
      baseURL: profile.baseURL
    });

    const input = buildModelInput(project, evidence, template, skills);
    const response = await client.responses.create({
      model: profile.model,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "software_requirement_response",
          schema: responseSchema
        }
      }
    });

    const payload = JSON.parse(response.output_text);
    const normalized = payload.requirements.map((item, index) => normalizeRequirement(item, index));
    return applyDomainKnowledgePolicies(normalized, knowledge);
  }

  async generateReplayProposal(materialPack, options = {}) {
    const profile = await this.profileService.resolveProfile(options.llmProfileId);
    if (!options.llmProfileId) {
      return buildFallbackReplayProposal(materialPack);
    }
    if (!profile?.apiKey) {
      throw new Error("Selected replay LLM profile is not usable");
    }

    const client = new OpenAI({
      apiKey: profile.apiKey,
      baseURL: profile.baseURL
    });

    const response = await client.responses.create({
      model: profile.model,
      input: buildReplayModelInput(materialPack),
      text: {
        format: {
          type: "json_schema",
          name: "skill_replay_proposal_response",
          schema: replayProposalSchema
        }
      }
    });

    const payload = JSON.parse(response.output_text);
    return normalizeReplayProposalPayload(payload, materialPack);
  }
}

function buildModelInput(project, evidence, template, skills) {
  const evidenceBrief = evidence.slice(0, 80).map((item) => ({
    fileRole: item.fileRole,
    fileName: item.fileName,
    location: item.location,
    excerpt: item.excerpt,
    tags: item.tags
  }));

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "你是软件开发需求生成助手。",
            "目标是根据系统需求和模型资料，输出可审核、可追溯的中文软件需求条目。",
            "系统需求优先级最高；当存在冲突时保留冲突说明，不要捏造事实。",
            "若需要体现层级结构，只保留功能层级和对象层级，不要输出具体章节编号。",
            "在需满足 ISO 26262 的场景下，信号命名应优先使用参考样例或信号字典中的标准工程命名。",
            "严禁基于通用语料进行无依据泛化联想；如果参考样例未要求，不要擅自扩展功能逻辑。",
            "输出必须符合给定 JSON schema。",
            skills["requirement_extraction.md"],
            skills["requirement_writing.md"],
            skills["requirement_validation.md"],
            skills["examples/good_examples.md"],
            skills["examples/bad_examples.md"],
            `领域知识与 few-shot 摘要：\n${JSON.stringify(skills["domain-knowledge.json"] || {}, null, 2)}`
          ].join("\n\n")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(
            {
              project: {
                name: project.name,
                description: project.description,
                language: project.language
              },
              template,
              evidence: evidenceBrief
            },
            null,
            2
          )
        }
      ]
    }
  ];
}

function buildFallbackRequirements(project, evidence, template, skills) {
  const knowledge = skills["domain-knowledge.json"] || { examples: [] };
  const exampleDrivenRequirements = buildExampleDrivenRequirements(knowledge, evidence, template);
  if (exampleDrivenRequirements.length > 0) {
    return exampleDrivenRequirements;
  }

  const grouped = groupEvidence(evidence);
  const requirements = [];
  let sequence = 1;

  for (const section of template.sections) {
    const candidates = grouped.get(section.type) || [];
    for (const evidenceItem of candidates.slice(0, section.maxItems || 3)) {
      requirements.push(
        normalizeRequirement(
          {
            id: randomUUID(),
            requirementId: `${template.requirementIdPrefix}-${String(sequence).padStart(3, "0")}`,
            title: buildTitle(section.title, evidenceItem),
            requirementText: buildRequirementText(section, evidenceItem),
            type: section.type,
            sourceRefs: [
              {
                fileName: evidenceItem.fileName,
                location: evidenceItem.location,
                excerpt: evidenceItem.excerpt
              }
            ],
            rationale: `基于 ${evidenceItem.fileName} 的证据自动生成草稿。`,
            verificationHint: section.verificationHint,
            confidence: evidenceItem.confidence,
            conflictNote: ""
          },
          sequence - 1
        )
      );
      sequence += 1;
    }
  }

  if (requirements.length === 0) {
    requirements.push(
      normalizeRequirement(
        {
          id: randomUUID(),
          requirementId: `${template.requirementIdPrefix}-001`,
          title: `${project.name} 软件需求占位条目`,
          requirementText: "软件应根据已上传的系统需求和模型资料生成可审核的需求条目，当前输入尚不足以提炼出明确需求。",
          type: "functional",
          sourceRefs: [],
          rationale: "输入证据不足",
          verificationHint: "补充系统需求或模型文档后重新生成。",
          confidence: 0.2,
          conflictNote: "缺少可用证据"
        },
        0
      )
    );
  }

  return requirements;
}

function buildExampleDrivenRequirements(knowledge, evidence, template) {
  const evidencePool = evidence.map((item) => ({
    ...item,
    tokens: tokenize(`${item.fileName} ${item.location} ${item.excerpt} ${(item.tags || []).join(" ")}`)
  }));
  const unionTokens = new Set(evidencePool.flatMap((item) => item.tokens));
  const examples = Array.isArray(knowledge.examples) ? knowledge.examples : [];
  const matched = [];

  for (const example of examples) {
    const keywords = example.keywords || [];
    const signals = example.signals || [];
    const exampleTokens = new Set(tokenize(`${example.topic || ""} ${example.requirementText || ""} ${keywords.join(" ")} ${signals.join(" ")}`));
    const overlapCount = [...exampleTokens].filter((token) => unionTokens.has(token)).length;
    const denominator = Math.max(4, exampleTokens.size);
    const overlapRatio = overlapCount / denominator;
    if (overlapRatio < 0.15) {
      continue;
    }

    const sourceRefs = evidencePool
      .map((item) => ({
        item,
        score: scoreEvidenceAgainstExample(item.tokens, exampleTokens)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ item }) => ({
        fileName: item.fileName,
        location: item.location,
        excerpt: item.excerpt
      }));

    matched.push(
      normalizeRequirement(
        {
          requirementId: example.requirementId || `${template.requirementIdPrefix}-${String(matched.length + 1).padStart(3, "0")}`,
          title: buildExampleTitle(example),
          requirementText: example.requirementText || example.rawText || "",
          type: example.requirementType || inferRequirementTypeFromExample(example),
          sourceRefs,
          rationale: `基于当前 skill bundle 中的历史标准案例进行匹配生成（主题：${example.topic || "未命名"}）。`,
          verificationHint: buildVerificationHint(example),
          confidence: Number(Math.min(0.98, 0.55 + overlapRatio).toFixed(2)),
          conflictNote: sourceRefs.length ? "" : "已命中案例模板，但缺少足够来源证据。"
        },
        matched.length
      )
    );
  }

  return dedupeRequirements(matched);
}

function groupEvidence(evidence) {
  const grouped = new Map();

  for (const item of evidence) {
    const type = inferRequirementType(item);
    if (!grouped.has(type)) {
      grouped.set(type, []);
    }
    grouped.get(type).push(item);
  }

  return grouped;
}

function inferRequirementType(evidenceItem) {
  const tags = evidenceItem.tags || [];
  if (tags.includes("diagnostic")) return "diagnostic";
  if (tags.includes("interface")) return "interface";
  if (tags.includes("timing")) return "timing";
  if (tags.includes("state")) return "state";
  return "functional";
}

function buildTitle(sectionTitle, evidenceItem) {
  return `${sectionTitle} - ${evidenceItem.fileName}`;
}

function buildRequirementText(section, evidenceItem) {
  return `软件应满足 ${section.title} 要求，并依据“${evidenceItem.excerpt.slice(0, 80)}”实现对应行为。`;
}

function buildExampleTitle(example) {
  if (example.preferredTitle) {
    return example.preferredTitle;
  }
  const sectionTitle = example.sectionTitle ? `${example.sectionTitle} - ` : "";
  return `${sectionTitle}${example.topic || example.title || example.requirementId || "需求示例"}`;
}

function inferRequirementTypeFromExample(example) {
  const text = `${example.topic || ""} ${example.requirementText || ""}`;
  if (/接口|信号|变量/i.test(text)) return "interface";
  if (/状态|模式|激活/i.test(text)) return "state";
  if (/周期|时序/i.test(text)) return "timing";
  if (/故障|异常|保护/i.test(text)) return "diagnostic";
  return "functional";
}

function buildVerificationHint(example) {
  const text = `${example.topic || ""} ${example.requirementText || ""}`;
  if (/优先级|分支/.test(text)) return "通过构造不同条件组合验证分支和优先级结果。";
  if (/激活|标志位/.test(text)) return "通过输入条件切换验证激活标志位和状态变化。";
  if (/阈值|最大|最小|限制/.test(text)) return "通过边界值测试验证阈值和限制逻辑。";
  return "通过仿真或联调验证输入条件与输出行为。";
}

function tokenize(text) {
  return Array.from(
    new Set(
      String(text)
        .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  );
}

function scoreEvidenceAgainstExample(evidenceTokens, exampleTokens) {
  let score = 0;
  for (const token of evidenceTokens) {
    if (exampleTokens.has(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }
  return score;
}

function dedupeRequirements(requirements) {
  const seen = new Set();
  return requirements.filter((item) => {
    const key = `${item.requirementId}:${item.requirementText}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function applyDomainKnowledgePolicies(requirements, knowledge = {}) {
  const policy = knowledge.sourceOfTruthPolicy || {};
  const aliasGroups = Array.isArray(policy.canonicalSignalAliases) ? policy.canonicalSignalAliases : [];
  const normalizationRules = Array.isArray(policy.normalizationRules) ? policy.normalizationRules : [];
  const forbiddenExpansions = policy.forbiddenExpansions || {};

  if (!aliasGroups.length && !normalizationRules.length && !Object.keys(forbiddenExpansions).length) {
    return requirements;
  }

  return requirements.map((item) => {
    let title = item.title || "";
    let requirementText = item.requirementText || "";
    const notes = new Set();
    let renamed = false;
    let normalized = false;

    for (const group of aliasGroups) {
      const canonical = group.canonical || "";
      for (const alias of group.aliases || []) {
        if (!alias || !canonical) continue;
        const nextTitle = replaceWholeToken(title, alias, canonical);
        const nextText = replaceWholeToken(requirementText, alias, canonical);
        if (nextTitle !== title || nextText !== requirementText) {
          renamed = true;
          title = nextTitle;
          requirementText = nextText;
        }
      }
    }

    for (const rule of normalizationRules) {
      if (!rule?.pattern) continue;
      const nextTitle = title.split(rule.pattern).join(rule.replacement || "");
      const nextText = requirementText.split(rule.pattern).join(rule.replacement || "");
      if (nextTitle !== title || nextText !== requirementText) {
        normalized = true;
        title = normalizePunctuation(nextTitle);
        requirementText = normalizePunctuation(nextText);
      }
    }

    if (renamed) {
      notes.add("已按参考样例将部分代码别名归一化为标准工程命名。");
    }
    if (normalized) {
      notes.add("已按参考样例收敛部分无依据扩写表达。");
    }

    const bucket = inferRequirementPolicyBucket(item);
    const forbiddenTerms = forbiddenExpansions[bucket] || [];
    const remainingForbidden = forbiddenTerms.filter((term) =>
      title.includes(term) || requirementText.includes(term)
    );
    if (remainingForbidden.length) {
      notes.add(`仍存在需人工复核的扩写项：${remainingForbidden.join(" / ")}。`);
    }

    const mergedConflictNote = [item.conflictNote || "", ...notes].filter(Boolean).join(" ");
    const adjustedConfidence = remainingForbidden.length
      ? Number(Math.max(0.2, (item.confidence ?? 0.5) - 0.15).toFixed(2))
      : item.confidence;

    return {
      ...item,
      title,
      requirementText,
      conflictNote: mergedConflictNote,
      confidence: adjustedConfidence
    };
  });
}

function inferRequirementPolicyBucket(item) {
  const text = `${item.title || ""} ${item.requirementText || ""}`;
  if (/激活标志位|inactive|active/.test(text)) {
    return "activation_flag_logic";
  }
  if (/扭矩计算|优先级|输出规则|置零|限幅/.test(text)) {
    return "torque_calculation_logic";
  }
  return "generic";
}

function replaceWholeToken(text, token, replacement) {
  if (!text || !token || token === replacement) return text;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegExp(token)})(?=[^A-Za-z0-9_]|$)`, "g");
  return text.replace(pattern, (_, prefix) => `${prefix}${replacement}`);
}

function normalizePunctuation(text) {
  return text.replace(/\s{2,}/g, " ").trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReplayModelInput(materialPack = {}) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You generate structured skill-repair proposals from human rejection feedback.",
            "Return only JSON that matches the schema.",
            "Each proposal item must change exactly one target.",
            "Use modify_rule only when a valid targetRuleId is provided in the material pack.",
            "Use add_rule or add_example when the fix should be added as a new rule.",
            "Do not output full markdown files."
          ].join("\n")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(materialPack, null, 2)
        }
      ]
    }
  ];
}

function buildFallbackReplayProposal(materialPack = {}) {
  const grouped = new Map();
  for (const snapshot of materialPack.rejectionSnapshots || []) {
    const area = snapshot.targetArea || materialPack.targetAreas?.[0] || "validation";
    if (!grouped.has(area)) grouped.set(area, []);
    grouped.get(area).push(snapshot);
  }

  const items = [];
  for (const [targetArea, areaRecords] of grouped.entries()) {
    const targetFile = resolveReplayTargetFile(targetArea);
    const relevantRules = areaRecords.flatMap((item) => item.relevantRules || []);
    const targetRule = relevantRules[0] || null;
    const patchSentence = areaRecords
      .map((item) => item.expectedNote || item.reasonText)
      .filter(Boolean)
      .slice(0, 3)
      .join("; ") || "Add clearer, testable and traceable constraints.";

    if (targetRule && targetArea !== "examples") {
      items.push({
        action: "modify_rule",
        targetRuleId: targetRule.ruleId,
        targetFile,
        title: targetRule.title + " (supplement)",
        before: targetRule.content,
        after: targetRule.content.trim() + "\nAdd constraint: " + patchSentence,
        rationale: areaRecords.map((item) => item.reasonText).filter(Boolean).slice(0, 3).join("; "),
        evidenceRefs: areaRecords.map((item) => item.id),
        newRuleDraft: null
      });
    } else {
      const title = (areaRecords[0]?.reasonCategory || "feedback") + " supplemental rule";
      const content = "The system should avoid the following issue: " + patchSentence;
      items.push({
        action: targetArea === "examples" ? "add_example" : "add_rule",
        targetRuleId: "",
        targetFile,
        title,
        before: "",
        after: content,
        rationale: areaRecords.map((item) => item.reasonText).filter(Boolean).slice(0, 3).join("; "),
        evidenceRefs: areaRecords.map((item) => item.id),
        newRuleDraft: {
          title,
          content
        }
      });
    }
  }

  return normalizeReplayProposalPayload(
    {
      summary: "Generated " + items.length + " fallback replay proposals.",
      rootCauses: Array.from(
        new Set((materialPack.rejectionSnapshots || []).map((item) => item.reasonCategory).filter(Boolean))
      ).map((item) => "Multiple rejections point to " + item + " issues."),
      items
    },
    materialPack
  );
}

function normalizeReplayProposalPayload(payload = {}, materialPack = {}) {
  const snapshots = materialPack.rejectionSnapshots || [];
  const validIds = new Set(snapshots.map((item) => item.id));
  const targetAreas = materialPack.targetAreas || [];
  return {
    summary: String(payload.summary || ("Generated replay proposal from " + snapshots.length + " rejection records.")).trim(),
    rootCauses: Array.isArray(payload.rootCauses)
      ? payload.rootCauses.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    items: Array.isArray(payload.items)
      ? payload.items
          .map((item, index) => normalizeReplayProposalItem(item, index, validIds, targetAreas))
          .filter(Boolean)
      : []
  };
}

function normalizeReplayProposalItem(item, index, validIds, targetAreas = []) {
  const action = String(item?.action || "").trim();
  if (!["add_rule", "modify_rule", "split_rule", "deprecate_rule", "add_example", "modify_domain_knowledge"].includes(action)) {
    return null;
  }

  const targetFile = String(item.targetFile || resolveReplayTargetFile(targetAreas[0] || "validation")).trim();
  const evidenceRefs = Array.isArray(item.evidenceRefs)
    ? item.evidenceRefs.map((ref) => String(ref || "").trim()).filter((ref) => validIds.has(ref))
    : [];
  const newRuleDraft = item.newRuleDraft && typeof item.newRuleDraft === "object"
    ? {
        title: String(item.newRuleDraft.title || item.title || ("Replay Proposal " + (index + 1))).trim(),
        content: String(item.newRuleDraft.content || item.after || "").trim(),
        rules: Array.isArray(item.newRuleDraft.rules)
          ? item.newRuleDraft.rules
              .map((rule) => ({
                title: String(rule.title || "").trim(),
                content: String(rule.content || "").trim()
              }))
              .filter((rule) => rule.title && rule.content)
          : []
      }
    : null;

  if (action === "modify_rule" && !String(item.targetRuleId || "").trim()) {
    return null;
  }
  if ((action === "add_rule" || action === "add_example") && !(newRuleDraft?.content || String(item.after || "").trim())) {
    return null;
  }

  return {
    action,
    targetRuleId: String(item.targetRuleId || "").trim(),
    targetFile,
    title: String(item.title || newRuleDraft?.title || ("Replay Proposal " + (index + 1))).trim(),
    before: String(item.before || "").trim(),
    after: String(item.after || newRuleDraft?.content || "").trim(),
    rationale: String(item.rationale || "").trim(),
    evidenceRefs,
    newRuleDraft
  };
}

function resolveReplayTargetFile(targetArea = "") {
  if (targetArea === "writing") return "requirement_writing.md";
  if (targetArea === "extraction") return "requirement_extraction.md";
  if (targetArea === "examples") return "examples/bad_examples.md";
  if (targetArea === "domain_knowledge") return "domain-knowledge.json";
  return "requirement_validation.md";
}

function normalizeRequirement(item, index) {
  return {
    id: item.id || randomUUID(),
    requirementId: item.requirementId || `SWR-${String(index + 1).padStart(3, "0")}`,
    title: item.title || `需求 ${index + 1}`,
    requirementText: item.requirementText || "",
    type: item.type || "functional",
    sourceRefs: item.sourceRefs || [],
    rationale: item.rationale || "",
    verificationHint: item.verificationHint || "",
    confidence: item.confidence ?? 0.5,
    conflictNote: item.conflictNote || "",
    review: {
      status: "pending",
      reviewer: "",
      comment: "",
      updatedAt: ""
    }
  };
}

const replayProposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    rootCauses: {
      type: "array",
      items: { type: "string" }
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string" },
          targetRuleId: { type: "string" },
          targetFile: { type: "string" },
          title: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          rationale: { type: "string" },
          evidenceRefs: {
            type: "array",
            items: { type: "string" }
          },
          newRuleDraft: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  rules: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" }
                      },
                      required: ["title", "content"]
                    }
                  }
                },
                required: ["title", "content", "rules"]
              }
            ]
          }
        },
        required: ["action", "targetRuleId", "targetFile", "title", "before", "after", "rationale", "evidenceRefs", "newRuleDraft"]
      }
    }
  },
  required: ["summary", "rootCauses", "items"]
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          requirementId: { type: "string" },
          title: { type: "string" },
          requirementText: { type: "string" },
          type: { type: "string" },
          sourceRefs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                fileName: { type: "string" },
                location: { type: "string" },
                excerpt: { type: "string" }
              },
              required: ["fileName", "location", "excerpt"]
            }
          },
          rationale: { type: "string" },
          verificationHint: { type: "string" },
          confidence: { type: "number" },
          conflictNote: { type: "string" }
        },
        required: [
          "requirementId",
          "title",
          "requirementText",
          "type",
          "sourceRefs",
          "rationale",
          "verificationHint",
          "confidence",
          "conflictNote"
        ]
      }
    }
  },
  required: ["requirements"]
};
