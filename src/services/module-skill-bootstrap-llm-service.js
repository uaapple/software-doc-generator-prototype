import OpenAI from "openai";
import { LlmProfileService } from "./llm-profile-service.js";
import { createJsonChatCompletion } from "./openai-compatible-chat.js";
import { normalizeKnowledgeForLayer } from "./skill-registry-service.js";
import { getAllowedKindsForAreasAndLayer } from "../../public/skill-kind-matrix.js";

const TOPIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    sectionTitle: { type: "string" },
    requirementType: { type: "string" },
    priority: { type: "integer" },
    summary: { type: "string" },
    triggerConditions: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    recoveryPaths: { type: "array", items: { type: "string" } },
    signals: { type: "array", items: { type: "string" } },
    references: { type: "array", items: { type: "string" } },
    sourceFiles: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } }
  },
  required: ["title", "sectionTitle", "requirementType", "priority", "summary", "triggerConditions", "actions", "recoveryPaths", "signals", "references", "sourceFiles", "keywords"]
};

const CONFLICT_HINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    systemRequirement: { type: "string" },
    modelEvidence: { type: "string" },
    conflictSummary: { type: "string" },
    preferredHandling: { type: "string" },
    sourceFiles: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } }
  },
  required: ["topic", "systemRequirement", "modelEvidence", "conflictSummary", "preferredHandling", "sourceFiles", "keywords"]
};

const MODULE_SKILL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    moduleSummary: { type: "string" },
    sectionHints: { type: "array", items: { type: "string" } },
    sourceBasis: { type: "array", items: { type: "string" } },
    generationPriorities: { type: "array", items: { type: "string" } },
    stylePrinciples: { type: "array", items: { type: "string" } },
    antiPatterns: { type: "array", items: { type: "string" } },
    supplementTopics: { type: "array", items: { type: "string" } },
    conflictHints: { type: "array", items: CONFLICT_HINT_SCHEMA },
    topics: { type: "array", items: TOPIC_SCHEMA }
  },
  required: ["moduleSummary", "sectionHints", "sourceBasis", "generationPriorities", "stylePrinciples", "antiPatterns", "supplementTopics", "conflictHints", "topics"]
};

const MODULE_KNOWLEDGE_EXAMPLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirementId: { type: "string" },
    topic: { type: "string" },
    sectionNumber: { type: "string" },
    sectionTitle: { type: "string" },
    requirementType: { type: "string" },
    preferredTitle: { type: "string" },
    requirementText: { type: "string" },
    signals: { type: "array", items: { type: "string" } },
    references: { type: "array", items: { type: "string" } },
    canonicalBranches: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } }
  },
  required: ["requirementId", "topic", "sectionNumber", "sectionTitle", "requirementType", "preferredTitle", "requirementText", "signals", "references", "canonicalBranches", "keywords"]
};

const MODULE_KNOWLEDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer" },
    generationPriorities: { type: "array", items: { type: "string" } },
    examples: { type: "array", items: MODULE_KNOWLEDGE_EXAMPLE_SCHEMA },
    ruleHints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: "string" },
          subdomain: { type: "string" },
          sectionHints: { type: "array", items: { type: "string" } },
          writingPattern: { type: "string" },
          targetStyle: { type: "string" },
          sourceBasis: { type: "array", items: { type: "string" } }
        },
        required: ["domain", "subdomain", "sectionHints", "writingPattern", "targetStyle", "sourceBasis"]
      }
    },
    antiPatterns: { type: "array", items: { type: "string" } },
    sourceOfTruthPolicy: {
      type: "object",
      additionalProperties: true,
      properties: {
        systemRequirementsDefineCoreTopics: { type: "boolean" },
        modelCodeProvidesDetailOnly: { type: "boolean" },
        preferHumanExampleWritingStyle: { type: "boolean" },
        conflictsMustBeSurfaced: { type: "boolean" },
        conflictHandlingRule: { type: "string" },
        codeDetailDemotionRule: { type: "string" },
        preferredEvidenceOrder: { type: "array", items: { type: "string" } },
        preferredFunctionSection: { type: "object" },
        preferredSubsections: { type: "array", items: { type: "object" } },
        coreFirst: { type: "boolean" },
        preferSymmetricExpansion: { type: "boolean" },
        preferObjectSpecificRequirements: { type: "boolean" },
        discourageGenericScatterRequirements: { type: "boolean" }
      },
      required: [
        "systemRequirementsDefineCoreTopics",
        "modelCodeProvidesDetailOnly",
        "preferHumanExampleWritingStyle",
        "conflictsMustBeSurfaced",
        "conflictHandlingRule",
        "codeDetailDemotionRule",
        "preferredEvidenceOrder"
      ]
    },
    conflictHints: { type: "array", items: CONFLICT_HINT_SCHEMA }
  },
  required: ["version", "generationPriorities", "examples", "ruleHints", "antiPatterns", "sourceOfTruthPolicy", "conflictHints"]
};

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function normalizeModuleSkillKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function uniqueObjects(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function createEvidenceBrief(extractions = []) {
  return extractions
    .flatMap((item) => (item.evidence || []).map((evidence) => ({
      fileRole: item.fileRole,
      fileName: item.fileName,
      location: evidence.location,
      excerpt: evidence.excerpt,
      tags: evidence.tags || [],
      confidence: evidence.confidence
    })))
    .filter((item) => item.excerpt)
    .slice(0, 60);
}

export class ModuleSkillBootstrapLlmService {
  constructor(options = {}) {
    this.profileService = options.profileService || new LlmProfileService();
  }

  async synthesizeKnowledge({ module, documentType, extractions, llmProfileId = "" }) {
    const profile = await this.profileService.resolveProfile(llmProfileId);
    if (!profile?.apiKey) {
      return null;
    }

    const client = new OpenAI({
      apiKey: profile.apiKey,
      baseURL: profile.baseURL
    });

    const normalizedDocumentType = normalizeDocumentType(documentType);
    const moduleSkillKey = normalizeModuleSkillKey(module.moduleSkillKey || module.name);
    const evidence = createEvidenceBrief(extractions);

    const analysis = await this.extractAnalysis(client, profile.model, {
      module,
      documentType: normalizedDocumentType,
      moduleSkillKey,
      evidence
    });

    const knowledge = await this.buildKnowledge(client, profile.model, {
      module,
      documentType: normalizedDocumentType,
      moduleSkillKey,
      evidence,
      analysis
    });

    return {
      knowledge,
      analysis,
      profile: {
        id: profile.id,
        provider: profile.provider,
        name: profile.name,
        model: profile.model
      }
    };
  }

  async extractAnalysis(client, model, payload) {
    const parsed = await createJsonChatCompletion(client, {
      model,
      messages: buildAnalysisPrompt(payload),
      schemaName: "module_skill_bootstrap_analysis",
      schema: MODULE_SKILL_ANALYSIS_SCHEMA
    });
    return {
      ...parsed,
      sectionHints: unique(parsed.sectionHints),
      sourceBasis: unique(parsed.sourceBasis),
      generationPriorities: unique(parsed.generationPriorities),
      stylePrinciples: unique(parsed.stylePrinciples),
      antiPatterns: unique(parsed.antiPatterns),
      supplementTopics: unique(parsed.supplementTopics),
      conflictHints: uniqueObjects(parsed.conflictHints),
      topics: Array.isArray(parsed.topics) ? parsed.topics : []
    };
  }

  async buildKnowledge(client, model, payload) {
    const parsed = await createJsonChatCompletion(client, {
      model,
      messages: buildKnowledgePrompt(payload),
      schemaName: "module_skill_bootstrap_knowledge",
      schema: MODULE_KNOWLEDGE_SCHEMA
    });
    return normalizeKnowledgeForLayer("module", {
      ...parsed,
      version: Number(parsed.version || 1) || 1,
      generationPriorities: unique(parsed.generationPriorities),
      antiPatterns: unique(parsed.antiPatterns),
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      ruleHints: Array.isArray(parsed.ruleHints) ? parsed.ruleHints : [],
      sourceOfTruthPolicy: parsed.sourceOfTruthPolicy || {
        systemRequirementsDefineCoreTopics: true,
        modelCodeProvidesDetailOnly: true,
        preferHumanExampleWritingStyle: true,
        conflictsMustBeSurfaced: true,
        conflictHandlingRule: "当模型/代码证据与系统需求主线不一致时，应保留系统需求定义的核心主题，并将差异写入 conflictNote 或冲突项，禁止静默改写主线。",
        codeDetailDemotionRule: "模型/代码中的状态、接口、诊断、配置和实现步骤默认作为核心主题的细化条件，不应脱离系统需求单独升级为一级条目。",
        preferredEvidenceOrder: ["system_requirement", "reference_requirement_example", "model_pdf", "generated_c"]
      },
      conflictHints: uniqueObjects(parsed.conflictHints)
    });
  }
}

function buildAnalysisPrompt({ module, documentType, moduleSkillKey, evidence }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "你正在为一个新模块做冷启动初始化。",
            "目标不是生成软件需求，而是从系统需求、模型/代码资料和人工优秀范例中提炼出可复用的模块级知识。",
            "请先做结构化抽取，识别这个模块最应该优先写的核心主题、每个主题的输入条件、动作、恢复路径、关键变量和写作顺序。",
            "系统需求负责定义核心主题主线；模型/代码证据只能用于把系统需求展开得更具体、更细致，不能脱离系统需求任意新开一级主题。",
            "如果输入里包含人工优秀范例，你必须优先从人工优秀范例中提炼“核心条目清单”，并尽量保持其主题数量、顺序、章节归属和前后引用关系。",
            "每个 topic 必须是原子化的单一主题，不要把多个核心主题重新合并成一个更大的总纲条目。",
            "不要把整段原文机械复制成一个 topic，也不要只产出泛化标题，例如“整体功率管理”或“综合保护逻辑”。",
            "如果模型/代码证据与系统需求描述存在冲突，不要擅自替换系统需求主线；请把冲突写入 conflictHints，说明冲突点、来源和推荐处理方式。",
            "如果代码中还有额外补充逻辑，请把它们列为 supplementTopics，并明确它们默认低于核心主题优先级，不要抢占核心主题。",
            "如果人工优秀范例没有把诊断、配置、错误处理单列为核心需求，就不要把这些内容提升成核心主题；它们更适合作为支撑逻辑附着到核心主题上。",
            "可参考成熟 module skill 的做法：优先固化主线主题、对象边界、命名归一和禁止扩写项，而不是罗列代码实现细节。",
            "sectionHints 应优先保留人工优秀范例中的稳定章节号和章节标题；不要用截断原文、代码变量名或函数名充当章节提示。",
            "输出必须符合 JSON schema。"
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
              module: {
                name: module.name,
                description: module.description || "",
                domain: module.domain || "embedded_vcu",
                moduleSkillKey
              },
              documentType,
              evidence
            },
            null,
            2
          )
        }
      ]
    }
  ];
}

function buildKnowledgePrompt({ module, documentType, moduleSkillKey, evidence, analysis }) {
  const allowedKinds = getAllowedKindsForAreasAndLayer(["domain_knowledge"], "module");
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "你现在要把上一步的结构化分析整理成 module skill 的 domain-knowledge.json。",
            "请生成高质量、可复用的模块知识，而不是把原始材料整段贴进去。",
            `module 层允许的 kind 只有：${allowedKinds.join(" / ") || "无"}`,
            "要求：",
            "0. 必须显式体现“系统需求定主线、模型/代码补细节、人工样例定表达”的原则。",
            "1. examples 必须优先覆盖人工优秀范例中的核心条目清单，而不是只保留一个总纲样例。",
            "2. 如果人工优秀范例存在稳定 requirementId、主题顺序、章节归属或条目间引用关系，examples 应尽量保留这些锚点。",
            "3. generationPriorities 要体现核心主题顺序，并明确说明哪些补充逻辑不应抢占主线。",
            "4. sourceOfTruthPolicy 必须明确：系统需求决定一级主题，模型/代码只能补充条件、时序、阈值、状态转移、清除逻辑等细节；如果代码证据与系统需求不一致，必须保留冲突说明。",
            "5. conflictHints 必须列出关键冲突项，至少包含：系统需求表述、模型/代码证据、冲突摘要、推荐处理方式和关键词，供后续生成写入 conflictNote。",
            "6. ruleHints 里要给出写作模式、目标风格、sectionHints 和 sourceBasis，目标风格应明确偏向“软件需求条目”，而不是“详细设计说明”或“实现步骤描述”。",
            "6.1 sourceBasis 只能写稳定的人类可读依据类别，例如“系统需求”“参考软件需求”“相关代码语义”“相关既有技能规则”；不要写锚点 id、UUID、task skill bundle shortlist、recalled atoms 等运行时痕迹。",
            "6.2 如果某个锚点带来了关键条件、例外或边界，请把该条件直接写进 writingPattern、generationPriorities 或 antiPatterns，而不是把锚点 id 抄进 sourceBasis。",
            "7. antiPatterns 要明确指出本模块常见误写方式，特别是：总纲合并、代码细节抢主线、诊断逻辑过早提升、整段原文贴入 examples。",
            "8. 不要输出 documentBlueprint，也不要生成 document_blueprint_section / document_blueprint_policy 这类 module 层非法 kind。",
            "9. 如果你需要表达章节稳定落位、子章节组织或输出策略，请改写到 ruleHints.sectionHints、generationPriorities 或 sourceOfTruthPolicy 中。",
            "10. subdomain 使用模块中文名称；不要自动翻译成英文 key。",
            "11. requirementText 应是压缩后的规范需求表达，不要照抄整段原文，也不要写成“步骤如下”“a) b) c)”这种说明文。",
            "输出必须符合 JSON schema。"
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
              module: {
                name: module.name,
                description: module.description || "",
                domain: module.domain || "embedded_vcu",
                moduleSkillKey
              },
              documentType,
              extractedAnalysis: analysis,
              evidence
            },
            null,
            2
          )
        }
      ]
    }
  ];
}
