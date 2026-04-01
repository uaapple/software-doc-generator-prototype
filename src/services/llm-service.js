import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { SkillLoader } from "./skill-loader.js";
import { TemplateService } from "./template-service.js";

export class LlmService {
  constructor() {
    this.skillLoader = new SkillLoader();
    this.templateService = new TemplateService();
    this.client = config.openai.apiKey
      ? new OpenAI({
          apiKey: config.openai.apiKey,
          baseURL: config.openai.baseURL
        })
      : null;
  }

  async generateRequirements(project, extractions) {
    const template = await this.templateService.getTemplate();
    const skills = await this.skillLoader.loadAll();
    const evidence = extractions.flatMap((item) => item.evidence || []);

    if (!this.client) {
      return buildFallbackRequirements(project, evidence, template);
    }

    const input = buildModelInput(project, evidence, template, skills);
    const response = await this.client.responses.create({
      model: config.openai.model,
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
    return payload.requirements.map((item, index) => normalizeRequirement(item, index));
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
            "目标是根据系统需求和模型侧产物，输出可审核、可追溯、中文的软件开发需求条目。",
            "系统需求优先级最高；当存在冲突时保留冲突说明，不要捏造事实。",
            "输出必须符合给定 JSON schema。",
            skills["requirement_extraction.md"],
            skills["requirement_writing.md"],
            skills["requirement_validation.md"],
            skills["examples/good_examples.md"],
            skills["examples/bad_examples.md"]
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

function buildFallbackRequirements(project, evidence, template) {
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
            rationale: `基于 ${evidenceItem.fileName} 的证据自动生成草稿`,
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
          requirementText: "软件应根据已上传的系统需求和模型侧产物生成可审核的需求条目，当前输入尚不足以提炼出明确需求。",
          type: "functional",
          sourceRefs: [],
          rationale: "输入证据不足",
          verificationHint: "补充系统需求或模型文档后重新生成",
          confidence: 0.2,
          conflictNote: "缺少可用证据"
        },
        0
      )
    );
  }

  return requirements;
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
  return `软件应满足${section.title}要求，并依据“${evidenceItem.excerpt.slice(0, 80)}”实现对应行为。`;
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
