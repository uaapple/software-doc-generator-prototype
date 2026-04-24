
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { LlmProfileService } from "./llm-profile-service.js";
import { createJsonChatCompletion } from "./openai-compatible-chat.js";
import {
  ALLOWED_KINDS_BY_AREA,
  getAllowedKindsForAreasAndLayer,
  isKindAllowedForLayer
} from "../../public/skill-kind-matrix.js";

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

  async generateSoftwareRequirementFromAgentContext(context = {}, options = {}) {
    const template = context.template || (await this.templateService.getTemplate("software_requirement"));
    const evidence = Array.isArray(context.evidence) ? context.evidence : [];
    const recalledAtoms = Array.isArray(context.recalledAtoms) ? context.recalledAtoms : [];
    const outline = context.outline && typeof context.outline === "object" ? context.outline : { summary: "", sections: [] };
    const profile =
      options.profileSnapshot ||
      (context.llmProfileSnapshot?.id ? await this.profileService.resolveProfile(context.llmProfileSnapshot.id) : null) ||
      (options.llmProfileId ? await this.profileService.resolveProfile(options.llmProfileId) : null);

    if (!profile?.apiKey) {
      return buildAgentFallbackItems(context.project || {}, template, evidence, recalledAtoms, outline);
    }

    const client = new OpenAI({
      apiKey: profile.apiKey,
      baseURL: profile.baseURL
    });

    const response = await createJsonChatCompletion(client, {
      model: profile.model,
      messages: buildAgentModelInput(context.project || {}, template, evidence, recalledAtoms, outline),
      schemaName: getResponseSchemaName("software_requirement"),
      schema: getResponseSchema("software_requirement")
    });
    const payload = response.payload || response;
    const rawItems = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.requirements)
        ? payload.requirements
        : [];
    return dedupeItems(
      rawItems.map((item, index) => normalizeResultItem(item, index, "software_requirement", template)),
      "software_requirement"
    );
  }

  async generateReplayProposal(materialPack, options = {}) {
    const profile = await this.profileService.resolveProfile(options.llmProfileId);
    if (!options.llmProfileId) {
      return buildFallbackReplayProposal(materialPack);
    }
    if (!profile?.apiKey) {
      const error = new Error("Replay model profile is not configured");
      error.debugStage = "replay_profile_invalid";
      throw error;
    }

    const client = new OpenAI({ apiKey: profile.apiKey, baseURL: profile.baseURL });
    try {
      const payload = await createJsonChatCompletion(client, {
        model: profile.model,
        messages: buildReplayModelInput(materialPack),
        schemaName: "skill_replay_proposal_response",
        schema: replayProposalSchema
      });
      return normalizeReplayProposalPayload(payload, materialPack);
    } catch (error) {
      error.debugStage ||= "replay_remote_generation";
      throw error;
    }
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

function buildAgentModelInput(project, template, evidence = [], recalledAtoms = [], outline = {}) {
  const evidenceBrief = evidence.slice(0, 40).map((item) => ({
    id: item.id || "",
    fileRole: item.fileRole,
    fileName: item.fileName,
    location: item.location,
    excerpt: item.excerpt,
    tags: item.tags
  }));
  const atomBrief = recalledAtoms.slice(0, 24).map((item) => ({
    skillCode: item.skillCode || "",
    kind: item.kind || "",
    layer: item.layer || "",
    title: item.title || "",
    content: item.content || "",
    matchedReason: item.matchedReason || ""
  }));

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "你是软件需求生成助手。",
            "当前输入已经经过后端筛选，只能基于提供的提纲、证据和 skill 原子生成中文软件需求条目。",
            "只输出满足 schema 的 JSON，不要输出额外解释。",
            "sourceRefs 只能引用已给出的 evidence 内容，不要编造新的文件名、位置或摘录。",
            "输出必须保持软件需求风格，不要写成详细设计步骤、HIL 操作步骤或泛化总结。"
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
                name: project.name || "",
                description: project.description || "",
                language: project.language || "zh-CN",
                documentType: "software_requirement",
                domain: project.domain || "",
                moduleSkillKey: project.moduleSkillKey || ""
              },
              template,
              outline,
              recalledAtoms: atomBrief,
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

function trimSentence(text = "") {
  const compact = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[，。；：,\s]+/, "")
    .replace(/^(软件应|系统应)/, "")
    .trim();
  return compact ? compact.slice(0, 160) : "根据当前输入执行对应功能。";
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

function buildAgentFallbackItems(project, template, evidence = [], recalledAtoms = [], outline = {}) {
  const sections = Array.isArray(outline.sections) && outline.sections.length
    ? outline.sections
    : recalledAtoms.slice(0, 4).map((item, index) => ({
        id: `section-${index + 1}`,
        topic: item.title || item.skillCode || `主题 ${index + 1}`,
        objective: item.content || "",
        evidenceRefs: []
      }));

  if (!sections.length && evidence.length) {
    sections.push({
      id: "section-1",
      topic: "核心需求",
      objective: evidence[0]?.excerpt || "",
      evidenceRefs: evidence[0]?.id ? [evidence[0].id] : []
    });
  }

  const fallbackItems = sections.slice(0, 6).map((section, index) => {
    const matchedEvidence =
      evidence.find((item) => (section.evidenceRefs || []).includes(item.id)) ||
      evidence[index] ||
      evidence[0] ||
      null;
    const topic = String(section.topic || `软件需求 ${index + 1}`).trim() || `软件需求 ${index + 1}`;
    const evidenceText = matchedEvidence?.excerpt || String(section.objective || "").trim() || "当前输入支持该主题。";
    return normalizeResultItem(
      {
        requirementId: `${template.requirementIdPrefix}-${String(index + 1).padStart(3, "0")}`,
        title: topic,
        requirementText: `软件应${trimSentence(evidenceText)}`,
        type: "functional",
        sourceRefs: matchedEvidence
          ? [
              {
                fileName: matchedEvidence.fileName,
                location: matchedEvidence.location,
                excerpt: matchedEvidence.excerpt
              }
            ]
          : [],
        rationale: recalledAtoms[index]?.matchedReason || "基于当前提纲和证据生成的本地回退草稿。",
        verificationHint: "通过仿真或联调验证输入条件与输出行为。",
        confidence: Number(matchedEvidence?.confidence || 0.45) || 0.45,
        conflictNote: ""
      },
      index,
      "software_requirement",
      template
    );
  });

  return dedupeItems(fallbackItems, "software_requirement");
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
function collapseWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildReplaySystemPrompt() {
  return [
    "你是技能维护工单生成助手，需要根据驳回记录、期望写法、被驳回输出、原始生成时实际提供过的 skill 上下文，以及用户手动勾选的参考资产，输出可直接进入技能管理的结构化修改建议。",
    "返回内容必须全部使用中文，并严格符合给定 JSON schema。",
    "每个 items 条目只能对应一个 atomic skill 修改项。",
    "层级说明：generic 表示跨模块和跨文档通用的基础规则；docType 表示仅对某一类文档类型生效的规则；domain 表示在某个领域内广泛适用但不局限于单一模块的规则；module 表示仅对当前模块生效的规则。",
    "请先分析驳回意见、期望写法和被驳回输出，但不要重新选择层级；必须严格遵守 taskContext.targetLayerConstraint 与 taskContext.targetProfileKeyConstraint，只能在该约束层内判断应该 modify_existing 还是 create_new。",
    "若 taskContext.targetLayerConstraint = module，则说明本次修改只能落在当前模块层；不要把 module 级问题上提到 docType / domain / generic，其余层同理。",
    "优先在原始生成时已提供给模型的 skill 上下文中寻找可以修改的 existing atomic skill；只有在 existing atomic skill 无法覆盖某个独立问题时，才允许输出 conclusionType=create_new。",
    "action 只能填写 add_skill_item、modify_skill_item、split_skill_item、deprecate_skill_item 之一，不要输出自然语言句子。",
    "evidenceRefs 只能填写 rejectionContext.records 中给出的 id，不要填写 requirementCode、标题或自然语言。",
    "modify_existing 时 targetSkillCode 必须来自 layerSkillInventory 里的 skillCode；candidateSkillInventory 只是兼容别名，不要编造 skillCode。",
    "如果 layerSkillInventory 为空，或该约束层内没有任何 skillCode 能精确承接本次修改，就必须输出 create_new + add_skill_item；新建项的 targetLayer 必须等于 taskContext.targetLayerConstraint，targetProfileKey 必须等于 taskContext.targetProfileKeyConstraint，并把 targetSkillCode 设为空字符串。",
    "不要编造新的 kind，targetKind 必须同时满足 taskContext.allowedKindsByLayer 与 taskContext.allowedKindsForReplay 的约束；如果当前层与当前 targetArea 没有交集，不要强行输出非法 kind。",
    "afterContent 必须是可复用的 atomic skill 正文，不要只是把驳回说明换一种语气重写。",
    "skill 修改建议正文应使用可复用、与具体上传文件名无关的表达；不要在 afterContent 中引用具体参考资产文件名（例如 Chrg.c），应改写为“代码证据”“实现证据”“参考资产”等抽象说法。",
    "如果当前案例只适合沉淀为模块规则，请把正文抽象成“某类需求在什么条件下不得补写什么内容”的规则，而不是“请把某条结果改成什么”。",
    "changeSummary 必须用一句话写清楚给 reviewer 看的核心修改意见，例如“把原规则补充为禁止将代码侧回退逻辑混入记忆类需求”。",
    "fallbackReason 只写驳回原因，不要把它当成修改意见；修改意见必须写在 changeSummary。",
    "beforeContent 应表示当前 skill 原文或当前能力边界；afterContent 应表示建议修改后的 atomic skill 正文。",
    "whyCurrent 必须说明当前 skill 为什么没拦住问题；whyChange 必须说明修改后为什么能避免同类问题。",
    "validatorSuggestions 只做只读建议，不进入自动应用链路。",
    "一次 replay 可以输出多个 items，但每个 item 只能对应一个 atomic skill 修改项。",
    "只要存在驳回记录，items 至少输出 1 条可执行提案；不要返回空数组。",
    "参考资产是案例证据和写法参考，不是 skill；如果人工优质范例与代码证据冲突，应优先对齐人工范例界定的边界和粒度。",
    "不要输出整份 markdown 文件，只输出单条 atomic skill 级别的修改。"
  ].join("\n");
}

function buildReplayTaskContext(materialPack = {}) {
  const moduleContext = materialPack.moduleContext || {};
  return {
    projectName: String(moduleContext.projectName || "").trim(),
    moduleName: String(moduleContext.moduleName || "").trim(),
    documentType: String(moduleContext.documentType || "software_requirement").trim() || "software_requirement",
    targetAreas: Array.isArray(materialPack.targetAreas) ? materialPack.targetAreas : [],
    targetLayerConstraint: String(materialPack.targetLayerConstraint || "").trim(),
    targetProfileKeyConstraint: String(materialPack.targetProfileKeyConstraint || "").trim(),
    allowedKindsByArea: materialPack.allowedKindsByArea || {},
    allowedKindsByLayer: materialPack.allowedKindsByLayer || {},
    allowedKindsForReplay: Array.isArray(materialPack.allowedKindsForReplay) ? materialPack.allowedKindsForReplay : [],
    layerSkillCount: Array.isArray(materialPack.layerSkillItems)
      ? materialPack.layerSkillItems.length
      : Array.isArray(materialPack.candidateSkillItems)
        ? materialPack.candidateSkillItems.length
        : 0
  };
}

function buildReplayRejectedOutput(outputSnapshot = {}) {
  if (!outputSnapshot || typeof outputSnapshot !== "object") {
    return {
      title: "",
      requirementText: "",
      verificationHint: "",
      confidence: 0
    };
  }
  return {
    title: String(outputSnapshot.title || "").trim(),
    requirementText: String(outputSnapshot.requirementText || "").trim(),
    verificationHint: String(outputSnapshot.verificationHint || "").trim(),
    confidence: Number(outputSnapshot.confidence ?? 0) || 0
  };
}

function buildReplayRejectionContext(materialPack = {}) {
  const snapshots = Array.isArray(materialPack.rejectionSnapshots) ? materialPack.rejectionSnapshots : [];
  return {
    records: snapshots.map((snapshot) => ({
      id: String(snapshot.id || "").trim(),
      requirementCode: String(snapshot.requirementCode || "").trim(),
      reasonCategory: String(snapshot.reasonCategory || "").trim(),
      reasonText: String(snapshot.reasonText || "").trim(),
      expectedNote: String(snapshot.expectedNote || "").trim(),
      targetLayerConstraint: String(snapshot.targetLayerConstraint || "").trim(),
      rejectedOutput: buildReplayRejectedOutput(snapshot.outputSnapshot || {}),
      sourceRefsSnapshot: Array.isArray(snapshot.sourceRefsSnapshot) ? snapshot.sourceRefsSnapshot : [],
      projectEvidenceSnapshot: Array.isArray(snapshot.projectEvidenceSnapshot) ? snapshot.projectEvidenceSnapshot : []
    }))
  };
}

function buildReplayCandidateSkillInventory(materialPack = {}) {
  const candidates = Array.isArray(materialPack.layerSkillItems)
    ? materialPack.layerSkillItems
    : Array.isArray(materialPack.candidateSkillItems)
      ? materialPack.candidateSkillItems
      : [];
  return candidates.map((item) => ({
    skillCode: String(item.skillCode || item.ruleId || "").trim(),
    title: String(item.title || "").trim(),
    targetLayer: String(item.layer || "").trim(),
    targetProfileKey: normalizeReplaySlug(item.profileKey || ""),
    targetKind: String(item.kind || "").trim(),
    targetFile: String(item.targetFile || "").trim(),
    contentSummary: String(item.contentSummary || item.content || "").trim()
  }));
}

function buildReplayOriginalGenerationSkillContext(materialPack = {}) {
  const snapshot = materialPack.effectiveSkillSnapshot || {};
  const files = snapshot.files || {};
  return {
    requirementExtraction: String(files["requirement_extraction.md"] || "").trim(),
    requirementWriting: String(files["requirement_writing.md"] || "").trim(),
    requirementValidation: String(files["requirement_validation.md"] || "").trim(),
    goodExamples: String(files["examples/good_examples.md"] || "").trim(),
    badExamples: String(files["examples/bad_examples.md"] || "").trim(),
    domainKnowledge: files["domain-knowledge.json"] || {},
    selectedProfiles: Array.isArray(snapshot.selectedProfiles) ? snapshot.selectedProfiles : []
  };
}

function describeReplayReferenceAssetRole(role = "") {
  if (role === "system_pdf") {
    return "系统需求来源，用于确认上游约束、边界、条件、阈值和主题范围。";
  }
  if (role === "reference_requirement_example") {
    return "人工软件需求优质范例，用于确认期望写法、粒度、边界和表达风格。";
  }
  if (role === "generated_c") {
    return "实现/代码证据，用于解释模型为何可能扩写，但不能直接覆盖人工范例定义的需求边界。";
  }
  return "参考证据，用于辅助判断本次驳回涉及的边界、写法和来源。";
}

function summarizeReplayReferenceAsset(asset = {}) {
  return truncate(collapseWhitespace(asset.preview || ""), 180);
}

function explainReplayReferenceAssetRelevance(asset = {}, materialPack = {}) {
  const role = String(asset.role || "").trim();
  const text = collapseWhitespace(
    [
      ...(Array.isArray(materialPack.rejectionSnapshots) ? materialPack.rejectionSnapshots.flatMap((snapshot) => [snapshot.reasonText, snapshot.expectedNote]) : []),
      asset.preview
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (role === "reference_requirement_example") {
    if (/人工范例|优质范例|期望写法|对齐范例/.test(text)) {
      return "该资产与本次驳回直接相关，定义了应重点对齐的人工范例写法、粒度和边界。";
    }
    return "该资产是人工软件需求优质范例，应重点参考其条目粒度、表达边界和写法风格。";
  }
  if (role === "system_pdf") {
    return "该资产用于确认上游系统需求约束、边界条件和阈值，帮助判断当前输出是否越界扩写。";
  }
  if (role === "generated_c") {
    return "该资产可解释模型为何引入实现侧逻辑，但不能直接覆盖人工范例和系统需求定义的需求边界。";
  }
  return "该资产是本次回放的补充证据，可用于辅助判断问题来源和期望写法。";
}

function buildReplayReferenceAssets(materialPack = {}) {
  const assets = Array.isArray(materialPack.referenceAssets) ? materialPack.referenceAssets : [];
  return assets.map((asset) => ({
    fileName: String(asset.originalName || asset.fileName || asset.storedName || "").trim(),
    role: String(asset.role || "").trim(),
    typeDescription: describeReplayReferenceAssetRole(asset.role),
    contentSummary: summarizeReplayReferenceAsset(asset),
    whyRelevant: explainReplayReferenceAssetRelevance(asset, materialPack),
    preview: String(asset.preview || "").trim()
  }));
}

function buildReplayPromptContext(materialPack = {}) {
  const layerSkillInventory = buildReplayCandidateSkillInventory(materialPack);
  return {
    taskContext: buildReplayTaskContext(materialPack),
    rejectionContext: buildReplayRejectionContext(materialPack),
    originalGenerationSkillContext: buildReplayOriginalGenerationSkillContext(materialPack),
    layerSkillInventory,
    candidateSkillInventory: layerSkillInventory,
    referenceAssets: buildReplayReferenceAssets(materialPack)
  };
}

export function buildReplayModelInput(materialPack = {}) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: buildReplaySystemPrompt()
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(buildReplayPromptContext(materialPack), null, 2)
        }
      ]
    }
  ];
}

function getAllowedKindsByArea() {
  return ALLOWED_KINDS_BY_AREA;
}

function collectAllowedKinds(targetAreas = []) {
  const resolvedAreas = Array.isArray(targetAreas) && targetAreas.length ? targetAreas : ["validation"];
  return new Set(resolvedAreas.flatMap((area) => ALLOWED_KINDS_BY_AREA[area] || ALLOWED_KINDS_BY_AREA.validation));
}

function collectAllowedReplayKinds(targetAreas = [], materialPack = {}) {
  const constrainedLayer = isValidReplayLayer(materialPack.targetLayerConstraint || "")
    ? String(materialPack.targetLayerConstraint || "").trim()
    : "";
  if (constrainedLayer) {
    return new Set(getAllowedKindsForAreasAndLayer(targetAreas, constrainedLayer));
  }
  return collectAllowedKinds(targetAreas);
}

function pickPreferredAllowedKind(preferredKind = "", allowedKinds = new Set()) {
  if (preferredKind && allowedKinds.has(preferredKind)) {
    return preferredKind;
  }
  return [...allowedKinds][0] || "";
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
    item.changeSummary,
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

function buildReplayChangeSummary(item = {}, conclusionType = "") {
  const explicit = String(item.changeSummary || "").trim();
  if (explicit) return explicit;
  const title = String(item.title || item.newRuleDraft?.title || "").trim();
  if (title) return title;
  const whyChange = String(item.whyChange || "").trim();
  if (whyChange) return whyChange;
  const fallbackReason = String(item.fallbackReason || item.rationale || "").trim();
  if (fallbackReason) {
    return conclusionType === "create_new"
      ? `新增技能条目以处理：${fallbackReason}`
      : `修改技能条目以处理：${fallbackReason}`;
  }
  return conclusionType === "create_new" ? "新增技能条目" : "修改已有技能条目";
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
  const constrainedLayer = isValidReplayLayer(materialPack.targetLayerConstraint || "")
    ? String(materialPack.targetLayerConstraint || "").trim()
    : "";
  const constrainedProfileKey = normalizeReplaySlug(
    materialPack.targetProfileKeyConstraint ||
      (constrainedLayer === "module"
        ? moduleProfileKey
        : constrainedLayer === "domain"
          ? domain || "embedded_vcu"
          : constrainedLayer === "docType"
            ? documentType
            : "generic")
  );
  const declaredLayer = isValidReplayLayer(item.targetLayer || "") ? String(item.targetLayer || "").trim() : "";
  const declaredProfileKey = normalizeReplaySlug(item.targetProfileKey || "");
  const declaredKind = String(item.targetKind || item.kind || mapReplayAreaToKind(targetArea)).trim();
  const constrainedAllowedKinds = new Set(getAllowedKindsForAreasAndLayer([targetArea], constrainedLayer || declaredLayer || "docType"));

  if (constrainedLayer) {
    const resolvedKind = pickPreferredAllowedKind(declaredKind, constrainedAllowedKinds);
    return {
      scopeDecision: constrainedLayer,
      scopeReason: "本次 Replay 已由人工明确指定沉淀层级，必须严格保持在该层内。",
      scopeConfidence: 0.99,
      targetLayer: constrainedLayer,
      targetProfileKey: constrainedProfileKey || "generic",
      targetKind: resolvedKind,
      reuseJudgement:
        constrainedLayer === "module"
          ? "module_specific"
          : constrainedLayer === "domain"
            ? "domain_general"
            : constrainedLayer === "generic"
              ? "generic_general"
              : "doc_type_general",
      ruleIntent: "在人工指定层级内寻找可复用的 atomic skill，无法命中时也只能在该层新增。"
    };
  }

  if (declaredLayer) {
    const declaredAllowedKinds = new Set(getAllowedKindsForAreasAndLayer([targetArea], declaredLayer));
    const resolvedKind = pickPreferredAllowedKind(declaredKind, declaredAllowedKinds);
    return {
      scopeDecision: declaredLayer,
      scopeReason: item.targetSkillCode
        ? "当前建议已命中目标 skill，沿用该 skill 的层级与 profile。"
        : "当前建议已显式给出沉淀层级，沿用模型输出的 targetLayer / targetProfileKey。",
      scopeConfidence: item.targetSkillCode ? 0.9 : 0.78,
      targetLayer: declaredLayer,
      targetProfileKey: declaredProfileKey || (declaredLayer === "module" ? moduleProfileKey : documentType) || "generic",
      targetKind: resolvedKind,
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
      targetKind: pickPreferredAllowedKind("bad_example", new Set(getAllowedKindsForAreasAndLayer([targetArea], moduleProfileKey ? "module" : "docType"))),
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
      targetKind: pickPreferredAllowedKind("rule_hint", new Set(getAllowedKindsForAreasAndLayer([targetArea], "domain"))),
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
      targetKind: pickPreferredAllowedKind("extraction_rule", new Set(getAllowedKindsForAreasAndLayer([targetArea], "generic"))),
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
      targetKind: pickPreferredAllowedKind("writing_rule", new Set(getAllowedKindsForAreasAndLayer([targetArea], "docType"))),
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
    targetKind: pickPreferredAllowedKind("validation_rule", new Set(getAllowedKindsForAreasAndLayer([targetArea], "docType"))),
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
  const candidates = Array.isArray(materialPack.layerSkillItems)
    ? materialPack.layerSkillItems
    : Array.isArray(materialPack.candidateSkillItems)
      ? materialPack.candidateSkillItems
      : [];
  const filteredCandidates = candidates.filter((item) => isKindAllowedForLayer(item.layer, item.kind));
  const preferredKind = pickPreferredAllowedKind(
    mapReplayAreaToKind(targetArea),
    new Set(
      Array.isArray(materialPack.allowedKindsForReplay) && materialPack.allowedKindsForReplay.length
        ? materialPack.allowedKindsForReplay
        : getAllowedKindsForAreasAndLayer([targetArea], materialPack.targetLayerConstraint || "")
    )
  );
  return (
    filteredCandidates.find((item) => item.kind === preferredKind) ||
    filteredCandidates.find((item) => (item.targetAreas || []).includes(targetArea)) ||
    filteredCandidates[0] ||
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
        changeSummary: `修改「${target.title || target.skillCode}」，补充本次驳回暴露的边界约束。`,
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
        changeSummary: `新增「${title}」，沉淀本次驳回暴露的边界约束。`,
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
  const refAliasMap = new Map();
  for (const snapshot of snapshots) {
    const recordId = String(snapshot.id || "").trim();
    const requirementCode = String(snapshot.requirementCode || "").trim();
    if (recordId) refAliasMap.set(recordId, recordId);
    if (requirementCode) refAliasMap.set(requirementCode, recordId);
  }
  const targetAreas = materialPack.targetAreas || [];
  const candidateSkillMap = new Map(
    (Array.isArray(materialPack.layerSkillItems)
      ? materialPack.layerSkillItems
      : Array.isArray(materialPack.candidateSkillItems)
        ? materialPack.candidateSkillItems
        : [])
      .map((item) => [String(item.skillCode || item.ruleId || "").trim(), item])
      .filter(([skillCode]) => skillCode)
  );
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
      ? payload.items
          .map((item, index) =>
            normalizeReplayProposalItem(item, index, validIds, refAliasMap, candidateSkillMap, targetAreas, materialPack)
          )
          .filter(Boolean)
      : []
  };
}

function normalizeReplayAction(rawAction = "", rawConclusionType = "") {
  const trimmed = String(rawAction || "").trim();
  const mapped = {
    add_rule: "add_skill_item",
    add_example: "add_skill_item",
    modify_rule: "modify_skill_item",
    split_rule: "split_skill_item",
    deprecate_rule: "deprecate_skill_item",
    add_skill_item: "add_skill_item",
    modify_skill_item: "modify_skill_item",
    split_skill_item: "split_skill_item",
    deprecate_skill_item: "deprecate_skill_item"
  }[trimmed];
  if (mapped) return mapped;
  if (/拆分/.test(trimmed)) return "split_skill_item";
  if (/(废弃|弃用|删除)/.test(trimmed)) return "deprecate_skill_item";
  if (/(新增|新建|创建)/.test(trimmed)) return "add_skill_item";
  if (/(修改|修订|更新|补充)/.test(trimmed)) {
    return rawConclusionType === "create_new" ? "add_skill_item" : "modify_skill_item";
  }
  return rawConclusionType === "create_new" ? "add_skill_item" : "modify_skill_item";
}

function normalizeReplayEvidenceRefs(rawRefs = [], validIds = new Set(), refAliasMap = new Map()) {
  if (!Array.isArray(rawRefs)) return [];
  const normalized = [];
  for (const ref of rawRefs) {
    const trimmed = String(ref || "").trim();
    const mappedRef = validIds.has(trimmed) ? trimmed : refAliasMap.get(trimmed) || "";
    if (mappedRef) normalized.push(mappedRef);
  }
  return [...new Set(normalized)];
}

function synthesizeReplayNewRuleDraft(item = {}, title = "", afterContent = "") {
  const draft = item.newRuleDraft && typeof item.newRuleDraft === "object"
    ? {
        title: String(item.newRuleDraft.title || title || "").trim(),
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
  if (draft?.content) {
    return draft;
  }
  if (!afterContent) {
    return draft;
  }
  return {
    title: title || "回投提议",
    content: afterContent,
    structuredPayload: null,
    rules: []
  };
}

function normalizeReplayProposalItem(item, index, validIds, refAliasMap, candidateSkillMap, targetAreas = [], materialPack = {}) {
  const rawConclusionType = String(item?.conclusionType || "").trim();
  let action = normalizeReplayAction(item?.action || "", rawConclusionType);

  const targetArea = targetAreas[0] || "validation";
  const inferredTarget = inferReplayDefaultTarget(targetArea, materialPack);
  const allowedKinds = collectAllowedReplayKinds(targetAreas, materialPack);
  let kind = String(item.targetKind || item.kind || mapReplayAreaToKind(targetAreas[0] || "validation")).trim();
  let targetLayer = String(item.targetLayer || inferredTarget.targetLayer).trim();
  let targetProfileKey = normalizeReplaySlug(item.targetProfileKey || inferredTarget.targetProfileKey || "generic");
  let targetFile = String(item.targetFile || mapReplayKindToTargetFile(kind)).trim();
  const evidenceRefs = normalizeReplayEvidenceRefs(item.evidenceRefs, validIds, refAliasMap);
  const afterContent = String(item.afterContent || item.after || item.newRuleDraft?.content || "").trim();
  const beforeContent = String(item.beforeContent || item.before || "").trim();
  const title = String(item.title || item.newRuleDraft?.title || `回投提议 ${index + 1}`).trim();
  let newRuleDraft = synthesizeReplayNewRuleDraft(item, title || `回投提议 ${index + 1}`, afterContent);

  let targetSkillCode = String(item.targetSkillCode || item.targetRuleId || "").trim();
  const candidate = candidateSkillMap.get(targetSkillCode) || null;
  if (candidate) {
    targetLayer = String(candidate.layer || targetLayer).trim();
    targetProfileKey = normalizeReplaySlug(candidate.profileKey || targetProfileKey);
    kind = String(candidate.kind || kind).trim();
    targetFile = String(candidate.targetFile || targetFile || mapReplayKindToTargetFile(kind)).trim();
  } else if (action === "modify_skill_item") {
    if (!(afterContent || newRuleDraft?.content)) {
      return null;
    }
    action = "add_skill_item";
    targetSkillCode = "";
    newRuleDraft = synthesizeReplayNewRuleDraft(item, title || `回投提议 ${index + 1}`, afterContent);
  }

  if (action === "add_skill_item") {
    targetSkillCode = "";
  }
  if (action === "add_skill_item" && !(newRuleDraft?.content || afterContent || newRuleDraft?.structuredPayload)) {
    return null;
  }
  if (!isValidReplayLayer(targetLayer)) {
    return null;
  }
  if (targetLayer === "module") {
    targetProfileKey = getReplayModuleProfileKey(materialPack) || targetProfileKey;
  } else if (targetLayer === "docType") {
    targetProfileKey = normalizeReplaySlug(materialPack.moduleContext?.documentType || targetProfileKey || "software_requirement");
  } else if (targetLayer === "domain") {
    targetProfileKey = normalizeReplaySlug(materialPack.moduleContext?.domain || targetProfileKey || "embedded_vcu");
  } else {
    targetProfileKey = "generic";
  }
  if (!isKindAllowedForLayer(targetLayer, kind)) {
    return null;
  }
  if (!allowedKinds.has(kind)) {
    return null;
  }

  const conclusionType = action === "add_skill_item" || rawConclusionType === "create_new" ? "create_new" : "modify_existing";
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
    changeSummary: buildReplayChangeSummary(item, conclusionType),
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
          conclusionType: { type: "string", enum: ["create_new", "modify_existing"] },
          action: { type: "string", enum: ["add_skill_item", "modify_skill_item", "split_skill_item", "deprecate_skill_item"] },
          targetSkillCode: { type: "string" },
          targetLayer: { type: "string", enum: ["generic", "docType", "domain", "module"] },
          targetProfileKey: { type: "string" },
          targetKind: {
            type: "string",
            enum: [
              "writing_rule",
              "good_example",
              "rule_hint",
              "generation_priority",
              "extraction_rule",
              "validation_rule",
              "anti_pattern",
              "bad_example",
              "source_alias",
              "normalization_rule",
              "forbidden_expansion",
              "source_policy_setting",
              "document_blueprint_section",
              "document_blueprint_policy",
              "code_style_prefix"
            ]
          },
          targetInsertionHint: { type: "string" },
          kind: { type: "string" },
          title: { type: "string" },
          changeSummary: { type: "string" },
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
          "changeSummary",
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
      minItems: 1,
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
