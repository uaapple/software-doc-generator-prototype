import { randomUUID } from "node:crypto";

/**
 * SlxModelFactAdapter — 将 ModelFactBundle 转换为现有 extraction 格式。
 *
 * 转换规则：
 * - 每条事实 → 一条 evidence，带 location（block path / Stateflow path）
 * - tags 根据事实所在字段映射：interface / state / threshold / timing / logic / diagnostic
 * - fileRole 统一为 "simulink_slx"
 * - confidence 基于 source 字段标记
 */
const FIELD_TAG_MAP = {
  interfaces: "interface",
  subsystems: "structure",
  states: "state",
  parameters: "threshold",
  derivedSignals: "derived_signal",
  logicRules: "logic",
  timing: "timing",
  diagnostics: "diagnostic",
  traceRefs: "interface"
};

const EVIDENCE_FIELDS = [
  "interfaces",
  "subsystems",
  "states",
  "parameters",
  "derivedSignals",
  "logicRules",
  "timing",
  "diagnostics",
  "traceRefs"
];

export class SlxModelFactAdapter {
  toExtraction(bundle, file) {
    if (!bundle || typeof bundle !== "object") {
      return {
        id: randomUUID(),
        fileId: file.id || "",
        fileRole: "simulink_slx",
        fileName: file.originalName || "",
        summary: "ModelFactBundle 为空，无法转换。",
        evidence: []
      };
    }

    const evidence = [];
    const sourceTag = bundle.source?.modelName ? `model:${bundle.source.modelName}` : "";

    for (const field of EVIDENCE_FIELDS) {
      const facts = Array.isArray(bundle[field]) ? bundle[field] : [];
      const fieldTag = FIELD_TAG_MAP[field] || "general";

      for (const fact of facts) {
        if (!fact || typeof fact !== "object") continue;
        if (field === "traceRefs" && fact.name === "satk_tool_summary") continue;

        const tags = [fieldTag];
        if (sourceTag) tags.push(sourceTag);

        const excerpt = buildFactExcerpt(field, fact);
        if (!excerpt) continue;

        evidence.push({
          id: randomUUID(),
          fileId: file.id || "",
          fileRole: "simulink_slx",
          fileName: file.originalName || "",
          location: fact.location || `${field}:${fact.name || fact.id || "unknown"}`,
          excerpt,
          tags,
          confidence: inferConfidence(field, fact)
        });
      }
    }

    const summary = buildExtractionSummary(bundle);

    return {
      id: randomUUID(),
      fileId: file.id || "",
      fileRole: "simulink_slx",
      fileName: file.originalName || "",
      summary,
      modelFactBundle: bundle,
      evidence
    };
  }
}

function buildFactExcerpt(field, fact) {
  const name = fact.name || fact.id || "";
  const desc = fact.description || fact.text || "";

  switch (field) {
    case "interfaces":
      return name
        ? `接口 ${name}${fact.direction ? ` (${fact.direction})` : ""}${fact.dataType ? ` 类型:${fact.dataType}` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "subsystems":
      return name
        ? `子系统 ${name}${fact.blockType ? ` [${fact.blockType}]` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "states":
      return name
        ? `状态 ${name}${fact.parent ? ` @${fact.parent}` : ""}${fact.entryAction ? ` entry:${fact.entryAction}` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "parameters":
      return name
        ? `参数 ${name}${fact.value !== undefined ? ` = ${fact.value}` : ""}${fact.unit ? ` ${fact.unit}` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "derivedSignals": {
      const inputs = Array.isArray(fact.inputs) ? fact.inputs.slice(0, 16) : [];
      const thresholds = Array.isArray(fact.thresholds) ? fact.thresholds.slice(0, 12) : [];
      const sourceBlocks = Array.isArray(fact.sourceBlocks) ? fact.sourceBlocks.slice(0, 6) : [];
      return name
        ? `派生信号 ${name}${fact.expression ? ` = ${clipText(fact.expression, 420)}` : ""}${inputs.length ? ` 输入:${inputs.join(", ")}` : ""}${thresholds.length ? ` 阈值:${thresholds.join(", ")}` : ""}${sourceBlocks.length ? ` 追溯:${sourceBlocks.join(" <- ")}` : ""}${fact.coverage ? ` 覆盖:${fact.coverage}` : ""}`
        : desc || "";
    }

    case "logicRules":
      return name
        ? `逻辑规则 ${name}${fact.blockType ? ` [${fact.blockType}]` : ""}${fact.condition ? ` 条件:${fact.condition}` : ""}${fact.action ? ` 动作:${fact.action}` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "timing":
      return name
        ? `时序 ${name}${fact.sampleTime !== undefined ? ` 采样周期:${fact.sampleTime}` : ""}${fact.period !== undefined ? ` 周期:${fact.period}` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "diagnostics":
      return name
        ? `诊断 ${name}${fact.severity ? ` [${fact.severity}]` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    case "traceRefs":
      return name
        ? `追溯 ${name}${fact.blockType ? ` [${fact.blockType}]` : ""}${fact.targetBlock ? ` → ${fact.targetBlock}` : ""}${desc ? ` — ${desc}` : ""}`
        : desc || "";

    default:
      return desc || name || "";
  }
}

function clipText(value = "", limit = 400) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function buildExtractionSummary(bundle) {
  const parts = [];
  const modelName = bundle.source?.modelName || "未知模型";
  parts.push(`SLX 模型: ${modelName}`);

  for (const field of EVIDENCE_FIELDS) {
    const count = Array.isArray(bundle[field]) ? bundle[field].length : 0;
    if (count > 0) {
      const label = {
        interfaces: "接口",
        subsystems: "子系统",
        states: "状态",
        parameters: "参数",
        derivedSignals: "派生信号",
        logicRules: "逻辑规则",
        timing: "时序",
        diagnostics: "诊断",
        traceRefs: "追溯"
      }[field] || field;
      parts.push(`${label}:${count}`);
    }
  }

  return parts.join("，");
}

function inferConfidence(field, fact) {
  let confidence = 0.70;
  if (field === "parameters" && fact.value !== undefined) confidence += 0.10;
  if (field === "derivedSignals" && fact.expression) confidence += 0.12;
  if (field === "interfaces") confidence += 0.05;
  if (field === "diagnostics") confidence -= 0.05;
  if (fact.location && fact.location.includes("/")) confidence += 0.05;
  return Math.max(0.2, Math.min(0.95, Number(confidence.toFixed(2))));
}
