
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { LlmProfileService } from "./llm-profile-service.js";
import { createJsonChatCompletion } from "./openai-compatible-chat.js";

const SOURCE_REF_SCHEMA = {
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
};

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
    return this.generateDocumentItems(project, extractions, options);
  }

  async generateDocumentItems(project, extractions, options = {}) {
    const documentType = normalizeDocumentType(project.documentType || options.documentType);
    const template = await this.templateService.getTemplate(documentType);
    const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
    const skills = await this.skillLoader.loadForContext(
      {
        documentType,
        domain: project.domain || options.domain || "",
        moduleSkillKey: project.moduleSkillKey || options.moduleSkillKey || ""
      },
      skillDir
    );
    const knowledge = skills["domain-knowledge.json"] || {};
    const evidence = extractions.flatMap((item) => item.evidence || []);
    const profile = await this.profileService.resolveProfile(options.llmProfileId);

    if (!profile?.apiKey) {
      options.onProgress?.({
        phase: "fallback_generation",
        message: "未配置可用模型，切换到本地回退生成。"
      });
      return applyDomainKnowledgePolicies(
        buildFallbackItems(project, evidence, template, skills, documentType),
        knowledge,
        documentType
      );
    }

    const client = new OpenAI({
      apiKey: profile.apiKey,
      baseURL: profile.baseURL
    });

    options.onProgress?.({
      phase: "llm_request_started",
      model: profile.model,
      provider: profile.provider,
      message: `正在调用 ${profile.name || profile.model} 生成结构化结果。`
    });
    const llmStartedAt = Date.now();
    let payload;
    let rawResponseText = "";
    try {
      const response = await createJsonChatCompletion(client, {
        model: profile.model,
        messages: buildModelInput(project, evidence, template, skills, documentType),
        schemaName: getResponseSchemaName(documentType),
        schema: getResponseSchema(documentType),
        includeRawResponse: true
      });
      payload = response.payload;
      rawResponseText = response.rawText || "";
    } catch (error) {
      error.debugStage = "llm_response_parse";
      options.onProgress?.({
        phase: "llm_postprocess_failed",
        stage: "llm_response_parse",
        message: error.message || "模型返回内容解析失败",
        rawResponseText: error.rawResponseText || "",
        rawResponseLength: Number(error.rawResponseLength || 0) || 0,
        errorStack: error.stack || ""
      });
      throw error;
    }
    options.onProgress?.({
      phase: "llm_request_completed",
      model: profile.model,
      provider: profile.provider,
      durationMs: Date.now() - llmStartedAt,
      message: `模型已返回结构化结果，正在整理输出。`
    });
    const rawItems = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.requirements)
        ? payload.requirements
        : [];
    options.onProgress?.({
      phase: "llm_payload_parsed",
      message: `模型原始响应解析完成，识别到 ${rawItems.length} 条候选结果。`,
      rawResponseText,
      rawResponseLength: rawResponseText.length,
      parsedTopLevelKeys: Object.keys(payload || {}),
      rawItemCount: rawItems.length
    });

    try {
      const normalizeStartedAt = Date.now();
      const normalized = rawItems.map((item, index) => normalizeResultItem(item, index, documentType, template));
      const normalizeResultItemsMs = Date.now() - normalizeStartedAt;
      options.onProgress?.({
        phase: "llm_items_normalized",
        message: `已完成 ${normalized.length} 条结果规范化，正在应用技能规则。`,
        normalizeResultItemsMs,
        normalizedItemCount: normalized.length
      });

      const policyStartedAt = Date.now();
      const finalItems = applyDomainKnowledgePolicies(normalized, knowledge, documentType);
      const applyPoliciesMs = Date.now() - policyStartedAt;
      options.onProgress?.({
        phase: "llm_policies_applied",
        message: `技能规则处理完成，得到 ${finalItems.length} 条待校验结果。`,
        applyPoliciesMs,
        totalAfterModelMs: Date.now() - llmStartedAt,
        finalItemCount: finalItems.length
      });
      return finalItems;
    } catch (error) {
      error.debugStage = "llm_result_postprocess";
      options.onProgress?.({
        phase: "llm_postprocess_failed",
        stage: "llm_result_postprocess",
        message: error.message || "模型结果后处理失败",
        rawResponseText,
        rawResponseLength: rawResponseText.length,
        errorStack: error.stack || ""
      });
      throw error;
    }
  }

  async generateReplayProposal(materialPack, options = {}) {
    const profile = await this.profileService.resolveProfile(options.llmProfileId);
    if (!options.llmProfileId) {
      return buildFallbackReplayProposal(materialPack);
    }
    if (!profile?.apiKey) {
      throw new Error("Selected replay LLM profile is not usable");
    }

    const client = new OpenAI({ apiKey: profile.apiKey, baseURL: profile.baseURL });
    const payload = await createJsonChatCompletion(client, {
      model: profile.model,
      messages: buildReplayModelInput(materialPack),
      schemaName: "skill_replay_proposal_response",
      schema: replayProposalSchema
    });
    return normalizeReplayProposalPayload(payload, materialPack);
  }
}

function buildModelInput(project, evidence, template, skills, documentType = "software_requirement") {
  const evidenceBrief = evidence.slice(0, 80).map((item) => ({
    fileRole: item.fileRole,
    fileName: item.fileName,
    location: item.location,
    excerpt: item.excerpt,
    tags: item.tags
  }));

  const guidanceBlocks = [
    getSystemInstruction(documentType),
    getGoalInstruction(documentType),
    skills.__compiledPrompt || "",
    "系统需求优先级最高；当存在冲突时保留冲突说明，不要编造事实。",
    "编号通常由外部需求管理系统生成，不要把编号差异当成质量目标，也不要编造内部引用编号。",
    "输出必须符合给定 JSON schema。",
    skills["requirement_extraction.md"],
    skills["requirement_writing.md"],
    skills["requirement_validation.md"],
    skills["examples/good_examples.md"],
    skills["examples/bad_examples.md"],
    `领域知识与 few-shot 摘要:\n${JSON.stringify(skills["domain-knowledge.json"] || {}, null, 2)}`
  ].filter(Boolean);

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: guidanceBlocks.join("\n\n")
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
                language: project.language,
                documentType,
                domain: project.domain || "",
                moduleSkillKey: project.moduleSkillKey || ""
              },
              selectedProfiles: skills.__profiles || [],
              compiledSkillPack: skills.__compiledSkillPack || null,
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

function buildFallbackItems(project, evidence, template, skills, documentType = "software_requirement") {
  const knowledge = skills["domain-knowledge.json"] || { examples: [] };
  const exampleDrivenItems = buildExampleDrivenItems(knowledge, evidence, template, documentType);
  if (exampleDrivenItems.length > 0) {
    return exampleDrivenItems;
  }

  const grouped = groupEvidence(evidence);
  const items = [];
  let sequence = 1;

  for (const section of template.sections || []) {
    const candidates = grouped.get(section.type) || grouped.get("functional") || [];
    for (const evidenceItem of candidates.slice(0, section.maxItems || 3)) {
      items.push(
        normalizeResultItem(
          buildFallbackDraft(project, section, evidenceItem, sequence, template, documentType),
          sequence - 1,
          documentType,
          template
        )
      );
      sequence += 1;
    }
  }

  if (items.length === 0) {
    items.push(normalizeResultItem(buildEmptyFallbackDraft(project, template, documentType), 0, documentType, template));
  }

  return dedupeItems(items, documentType);
}
function buildFallbackDraft(project, section, evidenceItem, sequence, template, documentType) {
  const base = {
    id: randomUUID(),
    requirementId: `${template.requirementIdPrefix}-${String(sequence).padStart(3, "0")}`,
    title: buildTitle(section.title, evidenceItem, documentType),
    requirementText: buildRequirementText(section, evidenceItem, documentType),
    type: section.type,
    sourceRefs: [
      {
        fileName: evidenceItem.fileName,
        location: evidenceItem.location,
        excerpt: evidenceItem.excerpt
      }
    ],
    rationale: `基于 ${evidenceItem.fileName} 的来源证据自动生成草稿。`,
    verificationHint: buildSectionVerificationHint(section, documentType),
    confidence: evidenceItem.confidence,
    conflictNote: ""
  };

  if (documentType === "detail_design") {
    base.structuredContent = {
      designBreakdown: [
        {
          function: base.title,
          behavior: evidenceItem.excerpt
        }
      ]
    };
  }

  if (documentType === "hil_test_case") {
    base.preconditions = ["完成模块初始化", "测试环境已建立必要输入连接"];
    base.testSteps = [`注入或触发: ${truncate(evidenceItem.excerpt, 80)}`];
    base.expectedResults = [truncate(base.requirementText, 120)];
    base.passCriteria = "预期结果全部满足且无额外故障。";
  }

  return base;
}

function buildEmptyFallbackDraft(project, template, documentType) {
  const base = {
    id: randomUUID(),
    requirementId: `${template.requirementIdPrefix}-001`,
    title: `${project.name} 输出占位条目`,
    requirementText: getEmptyDraftText(documentType),
    type: "functional",
    sourceRefs: [],
    rationale: "输入证据不足",
    verificationHint: getEmptyDraftVerificationHint(documentType),
    confidence: 0.2,
    conflictNote: "缺少可用证据"
  };

  if (documentType === "detail_design") {
    base.structuredContent = { designBreakdown: [] };
  }

  if (documentType === "hil_test_case") {
    base.preconditions = [];
    base.testSteps = [];
    base.expectedResults = [];
    base.passCriteria = "补充证据后重试。";
  }

  return base;
}

function buildExampleDrivenItems(knowledge, evidence, template, documentType = "software_requirement") {
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
    const exampleTokens = new Set(
      tokenize(`${example.topic || ""} ${example.requirementText || ""} ${keywords.join(" ")} ${signals.join(" ")}`)
    );
    const overlapCount = [...exampleTokens].filter((token) => unionTokens.has(token)).length;
    const denominator = Math.max(4, exampleTokens.size);
    const overlap = overlapCount / denominator;
    if (overlap < 0.15) {
      continue;
    }

    const sourceRefs = evidencePool
      .map((item) => ({ item, score: scoreEvidenceAgainstExample(item.tokens, exampleTokens) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ item }) => ({
        fileName: item.fileName,
        location: item.location,
        excerpt: item.excerpt
      }));

    matched.push(
      normalizeResultItem(
        {
          requirementId:
            example.requirementId || `${template.requirementIdPrefix}-${String(matched.length + 1).padStart(3, "0")}`,
          title: buildExampleTitle(example, documentType),
          requirementText: example.requirementText || example.rawText || "",
          type: example.requirementType || inferRequirementTypeFromExample(example),
          sourceRefs,
          rationale: `基于当前 skill bundle 中的历史标准样例进行匹配生成（主题：${example.topic || "未命名"}）。`,
          verificationHint: buildVerificationHint(example, documentType),
          confidence: Number(Math.min(0.98, 0.55 + overlap).toFixed(2)),
          conflictNote: sourceRefs.length ? "" : "已命中样例模板，但缺少足够来源证据。",
          structuredContent: example.structuredContent || null,
          preconditions: example.preconditions || [],
          testSteps: example.testSteps || [],
          expectedResults: example.expectedResults || [],
          passCriteria: example.passCriteria || ""
        },
        matched.length,
        documentType,
        template
      )
    );
  }

  return dedupeItems(matched, documentType);
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

function inferRequirementType(evidenceItem = {}) {
  const tags = evidenceItem.tags || [];
  if (tags.includes("diagnostic")) return "diagnostic";
  if (tags.includes("interface")) return "interface";
  if (tags.includes("timing")) return "timing";
  if (tags.includes("state")) return "state";
  return "functional";
}

function buildTitle(sectionTitle, evidenceItem, documentType) {
  const conciseEvidence = truncate(stripExtension(evidenceItem.fileName || "evidence"), 24);
  if (documentType === "hil_test_case") {
    return `${sectionTitle} - ${conciseEvidence} 测试`;
  }
  return `${sectionTitle} - ${conciseEvidence}`;
}

function buildRequirementText(section, evidenceItem, documentType) {
  const excerpt = truncate(evidenceItem.excerpt || "", 120);
  if (documentType === "detail_design") {
    return `详细设计应说明“${section.title}”在软件内部的实现分解、状态流转或接口处理，依据证据“${excerpt}”。`;
  }
  if (documentType === "hil_test_case") {
    return `HIL 测试应验证“${section.title}”对应行为，测试刺激与判定需覆盖证据“${excerpt}”。`;
  }
  return `软件应满足“${section.title}”要求，并依据“${excerpt}”实现对应行为。`;
}

function buildSectionVerificationHint(section, documentType) {
  if (section?.verificationHint) {
    return section.verificationHint;
  }
  if (documentType === "detail_design") {
    return "通过设计评审、接口检查或状态流验证实现描述与来源一致。";
  }
  if (documentType === "hil_test_case") {
    return "通过执行用例并核对预期结果与判定标准完成验证。";
  }
  return "通过评审或测试验证条目与来源一致。";
}

function getEmptyDraftText(documentType) {
  if (documentType === "detail_design") {
    return "详细设计应根据已上传系统需求和模型资料生成可审核的设计条目；当前输入不足以提炼明确设计。";
  }
  if (documentType === "hil_test_case") {
    return "HIL 测试用例应根据已上传需求和设计资料生成可执行的测试条目；当前输入不足以提炼明确用例。";
  }
  return "软件应根据已上传系统需求和模型资料生成可审核的需求条目；当前输入不足以提炼明确需求。";
}

function getEmptyDraftVerificationHint(documentType) {
  if (documentType === "detail_design") {
    return "补充系统需求、接口说明或模型设计资料后重新生成。";
  }
  if (documentType === "hil_test_case") {
    return "补充需求、设计或测试环境信息后重新生成。";
  }
  return "补充系统需求或模型文档后重新生成。";
}
function buildExampleTitle(example, documentType) {
  if (example.preferredTitle) {
    return example.preferredTitle;
  }
  const prefix = example.sectionTitle ? `${example.sectionTitle} - ` : "";
  const title = example.topic || example.title || example.requirementId || "条目示例";
  if (documentType === "hil_test_case" && !/测试/.test(title)) {
    return `${prefix}${title} 测试`;
  }
  return `${prefix}${title}`;
}

function inferRequirementTypeFromExample(example) {
  const text = `${example.topic || ""} ${example.requirementText || ""}`;
  if (/接口|信号|变量/i.test(text)) return "interface";
  if (/状态|模式|激活|切换/i.test(text)) return "state";
  if (/周期|时序|超时/i.test(text)) return "timing";
  if (/故障|异常|保护/i.test(text)) return "diagnostic";
  return "functional";
}

function buildVerificationHint(example, documentType) {
  if (documentType === "hil_test_case") {
    return "执行 HIL 用例并核对刺激、预期结果与判定标准。";
  }
  const text = `${example.topic || ""} ${example.requirementText || ""}`;
  if (/优先级|分支/.test(text)) return "通过构造不同条件组合验证分支和优先级结果。";
  if (/激活|标志位/.test(text)) return "通过输入条件切换验证激活标志位和状态变化。";
  if (/阈值|最大|最小|限制/.test(text)) return "通过边界值测试验证阈值和限制逻辑。";
  if (documentType === "detail_design") {
    return "通过设计评审或联调验证内部状态、接口和实现分解。";
  }
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

function dedupeItems(items, documentType) {
  const seen = new Set();
  return items.filter((item) => {
    const key =
      documentType === "hil_test_case"
        ? `${item.title}:${(item.testSteps || []).join("|")}:${(item.expectedResults || []).join("|")}`
        : `${item.title}:${item.requirementText}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function applyDomainKnowledgePolicies(items, knowledge = {}, documentType = "software_requirement") {
  const policy = knowledge.sourceOfTruthPolicy || {};
  const aliasGroups = Array.isArray(policy.canonicalSignalAliases) ? policy.canonicalSignalAliases : [];
  const normalizationRules = Array.isArray(policy.normalizationRules) ? policy.normalizationRules : [];
  const forbiddenExpansions = policy.forbiddenExpansions || {};
  const conflictHints = Array.isArray(knowledge.conflictHints) ? knowledge.conflictHints : [];

  if (!aliasGroups.length && !normalizationRules.length && !Object.keys(forbiddenExpansions).length && !conflictHints.length) {
    return items;
  }

  return items.map((item) => {
    let title = item.title || "";
    let requirementText = item.requirementText || "";
    let passCriteria = item.passCriteria || "";
    const notes = new Set();
    let renamed = false;
    let normalized = false;

    for (const group of aliasGroups) {
      const canonical = group.canonical || "";
      for (const alias of group.aliases || []) {
        if (!alias || !canonical) continue;
        const nextTitle = replaceWholeToken(title, alias, canonical);
        const nextText = replaceWholeToken(requirementText, alias, canonical);
        const nextPass = replaceWholeToken(passCriteria, alias, canonical);
        if (nextTitle !== title || nextText !== requirementText || nextPass !== passCriteria) {
          renamed = true;
          title = nextTitle;
          requirementText = nextText;
          passCriteria = nextPass;
        }
      }
    }

    for (const rule of normalizationRules) {
      if (!rule?.pattern) continue;
      const replacement = rule.replacement || "";
      const nextTitle = title.split(rule.pattern).join(replacement);
      const nextText = requirementText.split(rule.pattern).join(replacement);
      const nextPass = passCriteria.split(rule.pattern).join(replacement);
      if (nextTitle !== title || nextText !== requirementText || nextPass !== passCriteria) {
        normalized = true;
        title = normalizePunctuation(nextTitle);
        requirementText = normalizePunctuation(nextText);
        passCriteria = normalizePunctuation(nextPass);
      }
    }

    if (renamed) notes.add("已按参考样例将部分代码别名归一化为标准工程命名。");
    if (normalized) notes.add("已按参考样例收敛部分无依据扩写表达。");

    const bucket = inferRequirementPolicyBucket(item, documentType);
    const forbiddenTerms = forbiddenExpansions[bucket] || [];
    const remainingForbidden = forbiddenTerms.filter(
      (term) => title.includes(term) || requirementText.includes(term) || passCriteria.includes(term)
    );
    if (remainingForbidden.length) {
      notes.add(`仍存在需人工复核的扩写项：${remainingForbidden.join(" / ")}。`);
    }

    const matchedConflictHints = conflictHints.filter((hint) => {
      const tokens = [hint.topic, ...(hint.keywords || [])].filter(Boolean);
      return tokens.some((token) => title.includes(token) || requirementText.includes(token) || passCriteria.includes(token));
    });
    for (const hint of matchedConflictHints) {
      notes.add(`冲突提示：${hint.conflictSummary} 建议处理：${hint.preferredHandling}`);
    }

    return {
      ...item,
      title,
      requirementText,
      passCriteria,
      conflictNote: [item.conflictNote || "", ...notes].filter(Boolean).join(" "),
      confidence: remainingForbidden.length
        ? Number(Math.max(0.2, Number(item.confidence ?? 0.5) - 0.15).toFixed(2))
        : item.confidence
    };
  });
}

function inferRequirementPolicyBucket(item, documentType) {
  if (documentType === "hil_test_case") return "hil_test_case";
  const text = `${item.title || ""} ${item.requirementText || ""}`;
  if (/激活标志位|inactive|active/.test(text)) return "activation_flag_logic";
  if (/扭矩计算|优先级|输出规则|置零|限幅/.test(text)) return "torque_calculation_logic";
  return "generic";
}

function replaceWholeToken(text, token, replacement) {
  if (!text || !token || token === replacement) return text;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegExp(token)})(?=[^A-Za-z0-9_]|$)`, "g");
  return text.replace(pattern, (_match, prefix) => `${prefix}${replacement}`);
}

function normalizePunctuation(text) {
  return String(text || "").replace(/\s{2,}/g, " ").trim();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function getSystemInstruction(documentType) {
  if (documentType === "detail_design") return "你是汽车软件详细设计生成助手。";
  if (documentType === "hil_test_case") return "你是汽车软件 HIL 测试用例生成助手。";
  return "你是汽车软件需求生成助手。";
}

function getGoalInstruction(documentType) {
  if (documentType === "detail_design") {
    return "目标是根据系统需求、模型资料和代码证据，输出可审核、可追溯的中文详细设计条目，突出实现分解、状态/流程、接口与内部变量。";
  }
  if (documentType === "hil_test_case") {
    return "目标是根据需求、设计和代码证据，输出可执行、可判定、可追溯的 HIL 测试用例，明确前置条件、测试步骤、预期结果和判定标准。";
  }
  return "目标是根据系统需求、模型资料和代码证据，输出可审核、可追溯的中文软件需求条目。";
}

function getResponseSchemaName(documentType) {
  if (documentType === "detail_design") return "detail_design_response";
  if (documentType === "hil_test_case") return "hil_test_case_response";
  return "software_requirement_response";
}

function getResponseSchema(documentType) {
  if (documentType === "detail_design") return detailDesignResponseSchema;
  if (documentType === "hil_test_case") return hilTestCaseResponseSchema;
  return softwareRequirementResponseSchema;
}
function buildReplayModelInput(materialPack = {}) {
  const allowedKindsByArea = materialPack.allowedKindsByArea || {};
  const layerDefinitions = materialPack.layerDefinitions || {};
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "你是技能维护工单生成助手，需要根据驳回记录、人工范例、生成结果和当次生效 skill 快照，输出可直接进入技能管理的结构化修改建议。",
            "返回内容必须全部使用中文，并严格符合给定 JSON schema。",
            "每个 items 条目只能对应一个 atomic skill 修改项。",
            "请先判断建议应该沉淀到 generic / docType / domain / module 哪一层，再填写 targetLayer 和 targetProfileKey。",
            "如果建议依赖具体模块名、需求编号、模块专属信号、枚举值、阈值或流程语义，则优先落到 module；不要错误上提到 docType。",
            "如果已经命中合适的 targetSkillCode，就输出 conclusionType=modify_existing；只有在确实没有命中 skill 时才输出 conclusionType=create_new。",
            "不要编造新的 kind，targetKind 必须来自 material pack 中 allowedKindsByArea 的允许值。",
            "afterContent 必须是可复用的 atomic skill 正文，不要只是把驳回说明换一种语气重写。",
            "如果当前案例只适合沉淀为模块规则，请把正文抽象成“某类需求在什么条件下不得补写什么内容”的规则，而不是“请把某条结果改成什么”。",
            "beforeContent 应表示当前 skill 原文或当前能力边界；afterContent 应表示建议修改后的 atomic skill 正文。",
            "whyCurrent 必须说明当前 skill 为什么没拦住问题；whyChange 必须说明修改后为什么能避免同类问题。",
            "validatorSuggestions 只做只读建议，不进入自动应用链路。",
            "不要输出整份 markdown 文件，只输出单条 atomic skill 级别的修改。"
          ].join("\n")
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
              ...materialPack,
              layerDefinitions,
              allowedKindsByArea
            },
            null,
            2
          )
        }
      ]
    }
  ];
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "你是技能维护工单生成助手，需要根据驳回记录、人工范例、生成结果和当次生效 skill 快照，输出可直接进入技能管理的结构化修改建议。",
            "返回内容必须是中文，并严格符合给定 JSON schema。",
            "每个 items 条目只能对应一个 atomic skill 修改项。",
            "如果已有合适的 targetSkillCode，就输出 conclusionType=modify_existing；只有在确实没有命中 skill 时才输出 conclusionType=create_new。",
            "不要编造新的 kind，targetKind 必须来自 material pack 中 allowedKindsByArea 的允许值。",
            "不要输出泛泛结论，必须说明 fallbackReason、whyCurrent、whyChange。",
            "beforeContent 应表示当前 skill 原文或当前能力边界；afterContent 应表示建议改后的原子技能正文。",
            "validatorSuggestions 只做只读建议，不进入自动应用链路。",
            "不要输出整份 markdown 文件，只输出单条 atomic skill 级别的修改。"
          ].join("\n")
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
              ...materialPack,
              layerDefinitions,
              allowedKindsByArea
            },
            null,
            2
          )
        }
      ]
    }
  ];
}

function getAllowedKindsByArea() {
  return {
    writing: ["writing_rule", "good_example", "rule_hint", "generation_priority"],
    extraction: ["extraction_rule", "rule_hint", "generation_priority"],
    validation: ["validation_rule", "anti_pattern", "rule_hint"],
    examples: ["good_example", "bad_example", "anti_pattern"],
    domain_knowledge: [
      "source_alias",
      "normalization_rule",
      "forbidden_expansion",
      "source_policy_setting",
      "document_blueprint_section",
      "document_blueprint_policy",
      "code_style_prefix",
      "rule_hint",
      "generation_priority",
      "anti_pattern"
    ]
  };
}

function collectAllowedKinds(targetAreas = []) {
  const mapping = getAllowedKindsByArea();
  const resolvedAreas = Array.isArray(targetAreas) && targetAreas.length ? targetAreas : ["validation"];
  return new Set(resolvedAreas.flatMap((area) => mapping[area] || mapping.validation));
}

function isValidReplayLayer(layer = "") {
  return ["generic", "docType", "domain", "module"].includes(String(layer || "").trim());
}

function normalizeReplaySlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "_");
}

function mapReplayAreaToKind(targetArea = "") {
  if (targetArea === "writing") return "writing_rule";
  if (targetArea === "extraction") return "extraction_rule";
  if (targetArea === "examples") return "bad_example";
  if (targetArea === "domain_knowledge") return "rule_hint";
  return "validation_rule";
}

function mapReplayKindToTargetFile(kind = "") {
  if (kind === "writing_rule") return "requirement_writing.md";
  if (kind === "extraction_rule") return "requirement_extraction.md";
  if (kind === "validation_rule") return "requirement_validation.md";
  if (kind === "good_example") return "examples/good_examples.md";
  if (kind === "bad_example") return "examples/bad_examples.md";
  return "domain-knowledge.json";
}

const CHARGING_SOC_MEMORY_BOUNDARY_SKILL_TEXT =
  "对于充电管理模块中与充电截止SOC相关的记忆类需求，若人工范例仅描述“下电记忆、设置更新生效、下次下电继续记忆”这类行为，则不得补写无效值处理、默认值回退、范围兜底或重新插枪判断等控制/保护逻辑。此类逻辑应保留在截止SOC控制条目中，除非系统需求或人工范例中存在明确独立表述。";

function getReplayModuleProfileKey(materialPack = {}) {
  return normalizeReplaySlug(materialPack.moduleContext?.moduleSkillKey || materialPack.moduleContext?.moduleName || "");
}

function getReplayEvidenceRecords(item = {}, materialPack = {}) {
  const evidenceIds = Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map((entry) => String(entry || "").trim()) : [];
  const snapshots = Array.isArray(materialPack.rejectionSnapshots) ? materialPack.rejectionSnapshots : [];
  return snapshots.filter((entry) => evidenceIds.includes(String(entry.id || "").trim()));
}

function buildReplayContextText(item = {}, materialPack = {}) {
  const evidenceRecords = getReplayEvidenceRecords(item, materialPack);
  return [
    materialPack.moduleContext?.moduleName,
    materialPack.moduleContext?.moduleSkillKey,
    item.title,
    item.fallbackReason,
    item.whyCurrent,
    item.whyChange,
    item.afterContent,
    item.after,
    item.newRuleDraft?.content,
    ...evidenceRecords.flatMap((record) => [
      record.requirementCode,
      record.reasonCategory,
      record.reasonText,
      record.expectedNote,
      record.outputSnapshot?.title,
      record.outputSnapshot?.requirementText
    ])
  ]
    .filter(Boolean)
    .join("\n");
}

function looksLikeChargingSocMemoryBoundaryCase(item = {}, materialPack = {}) {
  const moduleText = `${materialPack.moduleContext?.moduleName || ""} ${materialPack.moduleContext?.moduleSkillKey || ""}`;
  const contextText = buildReplayContextText(item, materialPack);
  const moduleMatched = /(充电管理|charging_management)/i.test(moduleText);
  const memoryMatched = /CheryVCU-12147|充电截止SOC|下电记忆|记忆类需求/.test(contextText);
  const boundaryMatched = /无效值|默认值回退|范围兜底|重新插枪|50%-100%|112无效值/.test(contextText);
  return moduleMatched && memoryMatched && boundaryMatched;
}

function inferReplayScopeDecision(targetArea = "", item = {}, materialPack = {}) {
  const documentType = normalizeReplaySlug(materialPack.moduleContext?.documentType || "software_requirement");
  const domain = normalizeReplaySlug(materialPack.moduleContext?.domain || "embedded_vcu");
  const moduleProfileKey = getReplayModuleProfileKey(materialPack);

  if (looksLikeChargingSocMemoryBoundaryCase(item, materialPack)) {
    return {
      scopeDecision: "module",
      scopeReason: "命中“充电管理 / 充电截止SOC / 记忆类需求边界”特征，属于模块特定规则，不应上提到文档类型层。",
      scopeConfidence: 0.98,
      targetLayer: "module",
      targetProfileKey: moduleProfileKey || documentType,
      targetKind: "validation_rule",
      reuseJudgement: "module_specific",
      recommendedSkillText: CHARGING_SOC_MEMORY_BOUNDARY_SKILL_TEXT,
      ruleIntent: "约束充电管理模块中充电截止SOC记忆类需求的表达边界，避免混入控制/保护逻辑。"
    };
  }

  if (targetArea === "examples") {
    return {
      scopeDecision: moduleProfileKey ? "module" : "docType",
      scopeReason: moduleProfileKey ? "当前建议依赖模块内样例表达，优先沉淀到模块层。" : "当前建议主要针对文档样例表达，沉淀到文档类型层。",
      scopeConfidence: moduleProfileKey ? 0.74 : 0.68,
      targetLayer: moduleProfileKey ? "module" : "docType",
      targetProfileKey: moduleProfileKey || documentType,
      targetKind: "bad_example",
      reuseJudgement: moduleProfileKey ? "module_specific" : "doc_type_general",
      recommendedSkillText: "",
      ruleIntent: "补充反例或样例约束。"
    };
  }

  if (targetArea === "domain_knowledge") {
    return {
      scopeDecision: "domain",
      scopeReason: "当前建议更接近领域知识或跨模块约束，优先沉淀到领域层。",
      scopeConfidence: 0.72,
      targetLayer: "domain",
      targetProfileKey: domain || "embedded_vcu",
      targetKind: "rule_hint",
      reuseJudgement: "domain_general",
      recommendedSkillText: "",
      ruleIntent: "补充跨模块领域规则。"
    };
  }

  if (targetArea === "extraction") {
    return {
      scopeDecision: "generic",
      scopeReason: "当前建议更像通用抽取策略，适合沉淀到 generic 层。",
      scopeConfidence: 0.7,
      targetLayer: "generic",
      targetProfileKey: "generic",
      targetKind: "extraction_rule",
      reuseJudgement: "generic_general",
      recommendedSkillText: "",
      ruleIntent: "补充通用抽取规则。"
    };
  }

  if (targetArea === "writing") {
    return {
      scopeDecision: "docType",
      scopeReason: "当前建议主要约束该类文档的写作方式，优先沉淀到文档类型层。",
      scopeConfidence: 0.68,
      targetLayer: "docType",
      targetProfileKey: documentType,
      targetKind: "writing_rule",
      reuseJudgement: "doc_type_general",
      recommendedSkillText: "",
      ruleIntent: "补充文档类型写作规则。"
    };
  }

  return {
    scopeDecision: "docType",
    scopeReason: "当前未识别出明确模块或领域特征，暂按文档类型层处理。",
    scopeConfidence: 0.52,
    targetLayer: "docType",
    targetProfileKey: documentType,
    targetKind: "validation_rule",
    reuseJudgement: "doc_type_general",
    recommendedSkillText: "",
    ruleIntent: "补充文档类型校验规则。"
  };
}

function assessReplayAbstraction(item = {}, materialPack = {}) {
  const evidenceRecords = getReplayEvidenceRecords(item, materialPack);
  const content = String(item.afterContent || item.after || item.newRuleDraft?.content || "").trim();
  const combined = `${item.title || ""}\n${content}\n${item.fallbackReason || ""}`;
  const requirementCodeLeak = evidenceRecords.some((record) => record.requirementCode && combined.includes(record.requirementCode));
  const obviousParaphraseLead = /^建议补充以下约束[:：]?/.test(content) || /^请/.test(content);
  const isParaphraseOfRejection = requirementCodeLeak || obviousParaphraseLead;
  const abstractionScore = item.recommendedSkillText
    ? 0.96
    : isParaphraseOfRejection
      ? 0.38
      : content.length >= 40
        ? 0.78
        : 0.6;
  return {
    isParaphraseOfRejection,
    abstractionScore,
    reviewReadiness: abstractionScore >= 0.75 ? "ready_to_apply" : "needs_human_refine"
  };
}

function applyReplayQualityGuards(item = {}, targetArea = "", materialPack = {}) {
  const scope = inferReplayScopeDecision(targetArea, item, materialPack);
  const nextItem = { ...item };

  nextItem.scopeDecision = scope.scopeDecision;
  nextItem.scopeReason = scope.scopeReason;
  nextItem.scopeConfidence = scope.scopeConfidence;
  nextItem.reuseJudgement = scope.reuseJudgement;
  nextItem.ruleIntent = scope.ruleIntent;
  nextItem.recommendedSkillText = scope.recommendedSkillText || "";

  if (!nextItem.targetSkillCode) {
    nextItem.targetLayer = scope.targetLayer || nextItem.targetLayer;
    nextItem.targetProfileKey = scope.targetProfileKey || nextItem.targetProfileKey;
    nextItem.targetKind = scope.targetKind || nextItem.targetKind;
    nextItem.kind = scope.targetKind || nextItem.kind;
    nextItem.targetFile = mapReplayKindToTargetFile(nextItem.targetKind || nextItem.kind || mapReplayAreaToKind(targetArea));
  }

  if (scope.recommendedSkillText) {
    nextItem.title = "充电截止SOC记忆类需求边界约束";
    nextItem.afterContent = scope.recommendedSkillText;
    nextItem.after = scope.recommendedSkillText;
    nextItem.beforeContent = nextItem.beforeContent || "";
    nextItem.before = nextItem.before || nextItem.beforeContent || "";
    nextItem.whyCurrent =
      nextItem.whyCurrent || "当前规则未能限制记忆类需求与截止SOC控制/保护逻辑之间的边界，导致模型把模块内其他控制逻辑混入记忆条目。";
    nextItem.whyChange =
      nextItem.whyChange || "补充模块级边界约束后，可将记忆类需求与控制/保护类需求拆开，保持与人工范例一致的条目粒度。";
    nextItem.targetInsertionHint =
      nextItem.targetInsertionHint || "插入到充电管理模块 validation_rule 中与人工范例对齐、边界控制相关的规则附近。";
    nextItem.newRuleDraft = {
      title: nextItem.title,
      content: scope.recommendedSkillText,
      structuredPayload: null,
      rules: []
    };
  }

  const abstraction = assessReplayAbstraction(nextItem, materialPack);
  nextItem.isParaphraseOfRejection = abstraction.isParaphraseOfRejection;
  nextItem.abstractionScore = abstraction.abstractionScore;
  nextItem.reviewReadiness = abstraction.reviewReadiness;
  return nextItem;
}

function inferReplayScopeDecisionV2(targetArea = "", item = {}, materialPack = {}) {
  const documentType = normalizeReplaySlug(materialPack.moduleContext?.documentType || "software_requirement");
  const domain = normalizeReplaySlug(materialPack.moduleContext?.domain || "embedded_vcu");
  const moduleProfileKey = getReplayModuleProfileKey(materialPack);
  const declaredLayer = isValidReplayLayer(item.targetLayer || "") ? String(item.targetLayer || "").trim() : "";
  const declaredProfileKey = normalizeReplaySlug(item.targetProfileKey || "");
  const declaredKind = String(item.targetKind || item.kind || mapReplayAreaToKind(targetArea)).trim();

  if (declaredLayer) {
    return {
      scopeDecision: declaredLayer,
      scopeReason: item.targetSkillCode
        ? "当前建议已命中目标 skill，沿用该 skill 的层级与 profile。"
        : "当前建议已显式给出沉淀层级，沿用模型输出的 targetLayer / targetProfileKey。",
      scopeConfidence: item.targetSkillCode ? 0.9 : 0.78,
      targetLayer: declaredLayer,
      targetProfileKey: declaredProfileKey || (declaredLayer === "module" ? moduleProfileKey : documentType) || "generic",
      targetKind: declaredKind,
      reuseJudgement: declaredLayer === "module"
        ? "module_specific"
        : declaredLayer === "domain"
          ? "domain_general"
          : declaredLayer === "generic"
            ? "generic_general"
            : "doc_type_general",
      ruleIntent: "根据模型输出的层级信息沉淀对应规则。"
    };
  }

  if (targetArea === "examples") {
    return {
      scopeDecision: moduleProfileKey ? "module" : "docType",
      scopeReason: moduleProfileKey ? "当前建议依赖模块内样例表达，优先沉淀到模块层。" : "当前建议主要针对文档样例表达，沉淀到文档类型层。",
      scopeConfidence: moduleProfileKey ? 0.74 : 0.68,
      targetLayer: moduleProfileKey ? "module" : "docType",
      targetProfileKey: moduleProfileKey || documentType,
      targetKind: "bad_example",
      reuseJudgement: moduleProfileKey ? "module_specific" : "doc_type_general",
      ruleIntent: "补充反例或样例约束。"
    };
  }

  if (targetArea === "domain_knowledge") {
    return {
      scopeDecision: "domain",
      scopeReason: "当前建议更接近领域知识或跨模块约束，优先沉淀到领域层。",
      scopeConfidence: 0.72,
      targetLayer: "domain",
      targetProfileKey: domain || "embedded_vcu",
      targetKind: "rule_hint",
      reuseJudgement: "domain_general",
      ruleIntent: "补充跨模块领域规则。"
    };
  }

  if (targetArea === "extraction") {
    return {
      scopeDecision: "generic",
      scopeReason: "当前建议更像通用抽取策略，适合沉淀到 generic 层。",
      scopeConfidence: 0.7,
      targetLayer: "generic",
      targetProfileKey: "generic",
      targetKind: "extraction_rule",
      reuseJudgement: "generic_general",
      ruleIntent: "补充通用抽取规则。"
    };
  }

  if (targetArea === "writing") {
    return {
      scopeDecision: "docType",
      scopeReason: "当前建议主要约束该类文档的写作方式，优先沉淀到文档类型层。",
      scopeConfidence: 0.68,
      targetLayer: "docType",
      targetProfileKey: documentType,
      targetKind: "writing_rule",
      reuseJudgement: "doc_type_general",
      ruleIntent: "补充文档类型写作规则。"
    };
  }

  return {
    scopeDecision: "docType",
    scopeReason: "当前未识别出明确模块或领域特征，暂按文档类型层处理。",
    scopeConfidence: 0.52,
    targetLayer: "docType",
    targetProfileKey: documentType,
    targetKind: "validation_rule",
    reuseJudgement: "doc_type_general",
    ruleIntent: "补充文档类型校验规则。"
  };
}

function assessReplayAbstractionV2(item = {}, materialPack = {}) {
  const evidenceRecords = getReplayEvidenceRecords(item, materialPack);
  const content = String(item.afterContent || item.after || item.newRuleDraft?.content || "").trim();
  const combined = `${item.title || ""}\n${content}\n${item.fallbackReason || ""}`;
  const requirementCodeLeak = evidenceRecords.some((record) => record.requirementCode && combined.includes(record.requirementCode));
  const obviousParaphraseLead = /^建议补充以下约束[:：]?/.test(content) || /^请/.test(content);
  const isParaphraseOfRejection = requirementCodeLeak || obviousParaphraseLead;
  const abstractionScore = isParaphraseOfRejection ? 0.38 : content.length >= 40 ? 0.78 : 0.6;
  return {
    isParaphraseOfRejection,
    abstractionScore,
    reviewReadiness: abstractionScore >= 0.75 ? "ready_to_apply" : "needs_human_refine"
  };
}

function applyReplayQualityGuardsV2(item = {}, targetArea = "", materialPack = {}) {
  const scope = inferReplayScopeDecisionV2(targetArea, item, materialPack);
  const nextItem = { ...item };

  nextItem.scopeDecision = scope.scopeDecision;
  nextItem.scopeReason = scope.scopeReason;
  nextItem.scopeConfidence = scope.scopeConfidence;
  nextItem.reuseJudgement = scope.reuseJudgement;
  nextItem.ruleIntent = scope.ruleIntent;

  if (!nextItem.targetSkillCode) {
    nextItem.targetLayer = scope.targetLayer || nextItem.targetLayer;
    nextItem.targetProfileKey = scope.targetProfileKey || nextItem.targetProfileKey;
    nextItem.targetKind = scope.targetKind || nextItem.targetKind;
    nextItem.kind = scope.targetKind || nextItem.kind;
    nextItem.targetFile = mapReplayKindToTargetFile(nextItem.targetKind || nextItem.kind || mapReplayAreaToKind(targetArea));
  }

  const abstraction = assessReplayAbstractionV2(nextItem, materialPack);
  nextItem.isParaphraseOfRejection = abstraction.isParaphraseOfRejection;
  nextItem.abstractionScore = abstraction.abstractionScore;
  nextItem.reviewReadiness = abstraction.reviewReadiness;
  return nextItem;
}

function inferReplayDefaultTarget(targetArea = "", materialPack = {}) {
  const scope = inferReplayScopeDecisionV2(targetArea, {}, materialPack);
  return {
    targetLayer: scope.targetLayer,
    targetProfileKey: scope.targetProfileKey,
    kind: scope.targetKind
  };
}

function chooseReplayCandidate(targetArea = "", materialPack = {}) {
  const candidates = Array.isArray(materialPack.candidateSkillItems) ? materialPack.candidateSkillItems : [];
  const preferredKind = mapReplayAreaToKind(targetArea);
  return (
    candidates.find((item) => item.kind === preferredKind) ||
    candidates.find((item) => (item.targetAreas || []).includes(targetArea)) ||
    candidates[0] ||
    null
  );
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
    const target = chooseReplayCandidate(targetArea, materialPack);
    const patchSentence =
      areaRecords.map((item) => item.expectedNote || item.reasonText).filter(Boolean).slice(0, 3).join("; ") ||
      "补充更明确、可验证、可追溯的约束。";

    if (target?.skillCode) {
      items.push({
        conclusionType: "modify_existing",
        action: "modify_skill_item",
        targetSkillCode: target.skillCode,
        targetLayer: target.layer,
        targetProfileKey: target.profileKey,
        targetKind: target.kind,
        kind: target.kind,
        targetFile: target.targetFile || mapReplayKindToTargetFile(target.kind),
        title: `${target.title}（补充修订）`,
        fallbackReason: areaRecords.map((item) => item.reasonText).filter(Boolean).slice(0, 3).join("; "),
        whyCurrent: "当前命中的 atomic skill 没有把这类驳回问题约束成明确、可执行的写法边界。",
        whyChange: "补上更具体的边界规则后，可以避免同类 fallback 再次出现。",
        beforeContent: target.content || target.contentSummary || "",
        afterContent: `${String(target.content || target.contentSummary || "").trim()}\n补充约束：${patchSentence}`,
        before: target.content || target.contentSummary || "",
        after: `${String(target.content || target.contentSummary || "").trim()}\n补充约束：${patchSentence}`,
        rationale: areaRecords.map((item) => item.reasonText).filter(Boolean).slice(0, 3).join("; "),
        evidenceRefs: areaRecords.map((item) => item.id),
        newRuleDraft: null
      });
    } else {
      const title = `${areaRecords[0]?.reasonCategory || "反馈"}补充规则`;
      const content = `建议补充以下约束：${patchSentence}`;
      const inferred = inferReplayDefaultTarget(targetArea, materialPack);
      items.push({
        conclusionType: "create_new",
        action: "add_skill_item",
        targetSkillCode: "",
        targetLayer: inferred.targetLayer,
        targetProfileKey: inferred.targetProfileKey,
        targetKind: inferred.kind,
        kind: inferred.kind,
        targetFile: mapReplayKindToTargetFile(inferred.kind),
        title,
        fallbackReason: areaRecords.map((item) => item.reasonText).filter(Boolean).slice(0, 3).join("; "),
        whyCurrent: "当前 skill 快照中没有找到足以覆盖该问题的现成 atomic skill。",
        whyChange: "新增对应 atomic skill 后，可把这类问题沉淀到明确的模块/文档规则中。",
        beforeContent: "",
        afterContent: content,
        before: "",
        after: content,
        rationale: areaRecords.map((item) => item.reasonText).filter(Boolean).slice(0, 3).join("; "),
        evidenceRefs: areaRecords.map((item) => item.id),
        newRuleDraft: { title, content, structuredPayload: null, rules: [] }
      });
    }
  }

  return normalizeReplayProposalPayload(
    {
      summary: `已生成 ${items.length} 条回投提议。`,
      decisionSummary: `命中已有 atomic skill ${items.filter((item) => item.conclusionType === "modify_existing").length} 条，建议新增 atomic skill ${items.filter((item) => item.conclusionType === "create_new").length} 条。`,
      rootCauses: Array.from(
        new Set((materialPack.rejectionSnapshots || []).map((item) => item.reasonCategory).filter(Boolean))
      ).map((item) => `多条驳回记录共同指向“${item}”相关问题。`),
      items,
      validatorSuggestions: []
    },
    materialPack
  );
}

function normalizeReplayProposalPayload(payload = {}, materialPack = {}) {
  const snapshots = materialPack.rejectionSnapshots || [];
  const validIds = new Set(snapshots.map((item) => item.id));
  const targetAreas = materialPack.targetAreas || [];
  return {
    summary: String(payload.summary || `已基于 ${snapshots.length} 条驳回记录生成回投提议。`).trim(),
    decisionSummary: String(payload.decisionSummary || "").trim(),
    rootCauses: Array.isArray(payload.rootCauses)
      ? payload.rootCauses.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    validatorSuggestions: Array.isArray(payload.validatorSuggestions)
      ? payload.validatorSuggestions
          .map((item) => ({
            title: String(item?.title || "").trim(),
            ruleText: String(item?.ruleText || "").trim(),
            why: String(item?.why || "").trim()
          }))
          .filter((item) => item.title || item.ruleText || item.why)
      : [],
    items: Array.isArray(payload.items)
      ? payload.items.map((item, index) => normalizeReplayProposalItem(item, index, validIds, targetAreas, materialPack)).filter(Boolean)
      : []
  };
}

function normalizeReplayProposalItem(item, index, validIds, targetAreas = [], materialPack = {}) {
  const rawConclusionType = String(item?.conclusionType || "").trim();
  const rawAction = String(item?.action || "").trim();
  const action = {
    add_rule: "add_skill_item",
    add_example: "add_skill_item",
    modify_rule: "modify_skill_item",
    split_rule: "split_skill_item",
    deprecate_rule: "deprecate_skill_item"
  }[rawAction] || rawAction || (rawConclusionType === "create_new" ? "add_skill_item" : "modify_skill_item");
  if (!["add_skill_item", "modify_skill_item", "split_skill_item", "deprecate_skill_item"].includes(action)) {
    return null;
  }

  const targetArea = targetAreas[0] || "validation";
  const inferredTarget = inferReplayDefaultTarget(targetArea, materialPack);
  const allowedKinds = collectAllowedKinds(targetAreas);
  const kind = String(item.targetKind || item.kind || mapReplayAreaToKind(targetAreas[0] || "validation")).trim();
  const targetLayer = String(item.targetLayer || inferredTarget.targetLayer).trim();
  const targetProfileKey = normalizeReplaySlug(item.targetProfileKey || inferredTarget.targetProfileKey || "generic");
  const targetFile = String(item.targetFile || mapReplayKindToTargetFile(kind)).trim();
  const evidenceRefs = Array.isArray(item.evidenceRefs)
    ? item.evidenceRefs.map((ref) => String(ref || "").trim()).filter((ref) => validIds.has(ref))
    : [];
  const afterContent = String(item.afterContent || item.after || item.newRuleDraft?.content || "").trim();
  const beforeContent = String(item.beforeContent || item.before || "").trim();
  const title = String(item.title || item.newRuleDraft?.title || `回投提议 ${index + 1}`).trim();
  const newRuleDraft = item.newRuleDraft && typeof item.newRuleDraft === "object"
    ? {
        title: String(item.newRuleDraft.title || title || `回投提议 ${index + 1}`).trim(),
        content: String(item.newRuleDraft.content || afterContent || "").trim(),
        structuredPayload:
          item.newRuleDraft.structuredPayload && typeof item.newRuleDraft.structuredPayload === "object"
            ? item.newRuleDraft.structuredPayload
            : null,
        rules: Array.isArray(item.newRuleDraft.rules)
          ? item.newRuleDraft.rules
              .map((rule) => ({
                title: String(rule.title || "").trim(),
                content: String(rule.content || "").trim(),
                structuredPayload:
                  rule.structuredPayload && typeof rule.structuredPayload === "object" ? rule.structuredPayload : null
              }))
              .filter((rule) => rule.title && rule.content)
          : []
      }
    : null;

  const targetSkillCode = String(item.targetSkillCode || item.targetRuleId || "").trim();
  const candidate = Array.isArray(materialPack.candidateSkillItems)
    ? materialPack.candidateSkillItems.find((entry) => entry.skillCode === targetSkillCode)
    : null;
  if (action === "modify_skill_item" && !targetSkillCode) {
    return null;
  }
  if (action === "add_skill_item" && !(newRuleDraft?.content || afterContent || newRuleDraft?.structuredPayload)) {
    return null;
  }
  if (!isValidReplayLayer(targetLayer)) {
    return null;
  }
  if (!allowedKinds.has(kind)) {
    return null;
  }
  if (candidate && (candidate.layer !== targetLayer || normalizeReplaySlug(candidate.profileKey) !== targetProfileKey || candidate.kind !== kind)) {
    return null;
  }

  const conclusionType =
    rawConclusionType === "create_new" || action === "add_skill_item" ? "create_new" : "modify_existing";
  const normalizedItem = {
    conclusionType,
    action,
    targetSkillCode,
    targetLayer,
    targetProfileKey,
    targetKind: kind,
    kind,
    targetFile,
    title,
    fallbackReason: String(item.fallbackReason || item.rationale || "").trim(),
    whyCurrent: String(item.whyCurrent || "").trim(),
    whyChange: String(item.whyChange || "").trim(),
    targetInsertionHint: String(item.targetInsertionHint || "").trim(),
    beforeContent,
    afterContent,
    before: beforeContent,
    after: afterContent || String(newRuleDraft?.content || "").trim(),
    rationale: String(item.rationale || "").trim(),
    evidenceRefs,
    newRuleDraft
  };
  return applyReplayQualityGuardsV2(normalizedItem, targetArea, materialPack);
}

function normalizeResultItem(item, index, documentType = "software_requirement", template = { requirementIdPrefix: "SWR" }) {
  const normalized = {
    id: item.id || randomUUID(),
    requirementId: item.requirementId || `${template.requirementIdPrefix || "SWR"}-${String(index + 1).padStart(3, "0")}`,
    title: item.title || `条目 ${index + 1}`,
    requirementText: item.requirementText || "",
    type: item.type || "functional",
    sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
    rationale: item.rationale || "",
    verificationHint: item.verificationHint || "",
    confidence: Number(item.confidence ?? 0.5),
    conflictNote: item.conflictNote || "",
    documentType,
    review: { status: "pending", reviewer: "", comment: "", updatedAt: "" }
  };

  if (documentType === "detail_design") {
    normalized.structuredContent = item.structuredContent || null;
  }
  if (documentType === "hil_test_case") {
    normalized.preconditions = asStringArray(item.preconditions);
    normalized.testSteps = asStringArray(item.testSteps || item.steps);
    normalized.expectedResults = asStringArray(item.expectedResults);
    normalized.passCriteria = String(item.passCriteria || "").trim();
  }

  return normalized;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function stripExtension(fileName) {
  return String(fileName || "").replace(/\.[^.]+$/, "");
}

function truncate(text, limit = 120) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}
const replayProposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    decisionSummary: { type: "string" },
    rootCauses: { type: "array", items: { type: "string" } },
    validatorSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          ruleText: { type: "string" },
          why: { type: "string" }
        },
        required: ["title", "ruleText", "why"]
      }
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          conclusionType: { type: "string" },
          action: { type: "string" },
          targetSkillCode: { type: "string" },
          targetLayer: { type: "string" },
          targetProfileKey: { type: "string" },
          targetKind: { type: "string" },
          targetInsertionHint: { type: "string" },
          kind: { type: "string" },
          title: { type: "string" },
          fallbackReason: { type: "string" },
          whyCurrent: { type: "string" },
          whyChange: { type: "string" },
          beforeContent: { type: "string" },
          afterContent: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
          rationale: { type: "string" },
          evidenceRefs: { type: "array", items: { type: "string" } },
          newRuleDraft: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  structuredPayload: {
                    anyOf: [{ type: "null" }, { type: "object" }]
                  },
                  rules: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                        structuredPayload: {
                          anyOf: [{ type: "null" }, { type: "object" }]
                        }
                      },
                      required: ["title", "content"]
                    }
                  }
                },
                required: ["title", "content", "rules", "structuredPayload"]
              }
            ]
          }
        },
        required: [
          "conclusionType",
          "targetSkillCode",
          "targetLayer",
          "targetProfileKey",
          "targetKind",
          "targetInsertionHint",
          "title",
          "fallbackReason",
          "whyCurrent",
          "whyChange",
          "beforeContent",
          "afterContent",
          "evidenceRefs",
          "newRuleDraft"
        ]
      }
    }
  },
  required: ["summary", "decisionSummary", "rootCauses", "validatorSuggestions", "items"]
};

const softwareRequirementResponseSchema = {
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
          sourceRefs: SOURCE_REF_SCHEMA,
          rationale: { type: "string" },
          verificationHint: { type: "string" },
          confidence: { type: "number" },
          conflictNote: { type: "string" }
        },
        required: ["requirementId", "title", "requirementText", "type", "sourceRefs", "rationale", "verificationHint", "confidence", "conflictNote"]
      }
    }
  },
  required: ["requirements"]
};

const detailDesignResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirementId: { type: "string" },
          title: { type: "string" },
          requirementText: { type: "string" },
          type: { type: "string" },
          sourceRefs: SOURCE_REF_SCHEMA,
          rationale: { type: "string" },
          verificationHint: { type: "string" },
          confidence: { type: "number" },
          conflictNote: { type: "string" },
          structuredContent: { type: ["string", "object", "array", "null"] }
        },
        required: ["requirementId", "title", "requirementText", "type", "sourceRefs", "rationale", "verificationHint", "confidence", "conflictNote"]
      }
    }
  },
  required: ["items"]
};

const hilTestCaseResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirementId: { type: "string" },
          title: { type: "string" },
          requirementText: { type: "string" },
          type: { type: "string" },
          sourceRefs: SOURCE_REF_SCHEMA,
          rationale: { type: "string" },
          verificationHint: { type: "string" },
          confidence: { type: "number" },
          conflictNote: { type: "string" },
          preconditions: { type: "array", items: { type: "string" } },
          testSteps: { type: "array", items: { type: "string" } },
          expectedResults: { type: "array", items: { type: "string" } },
          passCriteria: { type: "string" }
        },
        required: ["requirementId", "title", "requirementText", "type", "sourceRefs", "rationale", "verificationHint", "confidence", "conflictNote", "preconditions", "testSteps", "expectedResults", "passCriteria"]
      }
    }
  },
  required: ["items"]
};
