import { createHash } from "node:crypto";

const MODEL_REQUIREMENT_VIEW_VERSION = "1.0";
const DEFAULT_COMPACT_MAX_FACTS = 100;
const DEFAULT_COMPACT_MAX_BYTES = 12000;
const COMPACT_MIN_DERIVED_FACTS = 8;
const COMPACT_MIN_STATE_FACTS = 8;
const CRITICAL_COMPACT_FACT_PATTERN = /派生信号\s+HvCoorn_b(StartUpReq|Wake2NetMan|NetMan2PwrShut|AftRun2NetMan|Init2AftRun|ShutDisCh2ShutErr|VehNetWkupEna)\b|条件:[^\n]*HvCoorn_b(StartUpReq|Wake2NetMan|NetMan2PwrShut|AftRun2NetMan|Init2AftRun)\b|after\s*\(\s*2\s*,\s*tick\s*\)|SOCWU|VCCM_bNetMaintn|智能补电|补电|休眠|唤醒|失败|11\.8|10\.5|70%?|20分钟/i;
const COMPACT_TOPIC_CAPS = {
  系统需求事实: 36,
  派生信号定义: 28,
  状态与模式: 42,
  阈值与标定: 16,
  逻辑与条件: 18,
  输出动作: 36,
  接口与信号: 12,
  模型结构事实: 8,
  时序与周期: 4,
  诊断与保护: 12
};

export class ModelRequirementViewService {
  build({ project = {}, assets = [], extractions = [], anchors = [] } = {}) {
    const sourceAssets = buildSourceAssets(assets);
    const evidenceItems = collectEvidenceItems(extractions, anchors);
    const facts = [];
    const seenIds = new Map();

    for (const evidence of evidenceItems) {
      const fact = buildFact(evidence);
      if (!fact.behavior && !fact.topic) continue;
      const baseId = fact.id;
      const seenCount = seenIds.get(baseId) || 0;
      seenIds.set(baseId, seenCount + 1);
      facts.push({
        ...fact,
        id: seenCount ? `${baseId}-${seenCount + 1}` : baseId
      });
    }

    return {
      version: MODEL_REQUIREMENT_VIEW_VERSION,
      documentType: project.documentType || "software_requirement",
      sourceAssets,
      facts
    };
  }

  validateReferenceIds(modelRequirementView = {}, sourceFactIds = []) {
    const factIds = new Set((modelRequirementView.facts || []).map((fact) => fact.id).filter(Boolean));
    return sourceFactIds.every((sourceFactId) => factIds.has(sourceFactId));
  }

  buildCompactForGeneration(modelRequirementView = {}, options = {}) {
    return buildCompactModelRequirementView(modelRequirementView, options);
  }
}

function buildSourceAssets(assets = []) {
  return (Array.isArray(assets) ? assets : []).map((asset) => ({
    assetId: asset.assetId || asset.id || "",
    fileName: asset.fileName || asset.originalName || asset.storedName || "",
    fileRole: asset.fileRole || asset.role || "",
    absolutePath: asset.absolutePath || ""
  }));
}

function collectEvidenceItems(extractions = [], anchors = []) {
  const bundleEvidence = (Array.isArray(extractions) ? extractions : []).flatMap((extraction) =>
    extraction.modelFactBundle ? modelFactBundleToEvidenceItems(extraction.modelFactBundle, extraction) : []
  );
  if (bundleEvidence.length) {
    const extractionEvidence = (Array.isArray(extractions) ? extractions : [])
      .filter((extraction) => !extraction.modelFactBundle)
      .flatMap((extraction) => extractionToEvidenceItems(extraction));
    return [...extractionEvidence, ...bundleEvidence];
  }

  if (Array.isArray(anchors) && anchors.length) {
    return anchors.map((anchor) => ({
      id: anchor.anchorId || "",
      assetId: anchor.assetId || "",
      fileId: anchor.assetId || "",
      fileName: anchor.fileName || "",
      fileRole: anchor.fileRole || "",
      location: anchor.location || "",
      excerpt: anchor.excerpt || anchor.summary || "",
      summary: anchor.summary || anchor.excerpt || "",
      tags: Array.isArray(anchor.tags) ? anchor.tags : [],
      anchorId: anchor.anchorId || ""
    }));
  }

  return (Array.isArray(extractions) ? extractions : []).flatMap((extraction) => extractionToEvidenceItems(extraction));
}

function extractionToEvidenceItems(extraction = {}) {
  return (extraction.evidence || []).map((evidence) => ({
    id: evidence.id || "",
    assetId: evidence.fileId || extraction.fileId || "",
    fileId: evidence.fileId || extraction.fileId || "",
    fileName: evidence.fileName || extraction.fileName || "",
    fileRole: evidence.fileRole || extraction.fileRole || "",
    location: evidence.location || "",
    excerpt: evidence.excerpt || "",
    summary: evidence.summary || evidence.excerpt || "",
    tags: Array.isArray(evidence.tags) ? evidence.tags : [],
    anchorId: evidence.id || ""
  }));
}

function modelFactBundleToEvidenceItems(bundle = {}, extraction = {}) {
  const fields = [
    ["interfaces", "interface"],
    ["subsystems", "structure"],
    ["states", "state"],
    ["parameters", "threshold"],
    ["derivedSignals", "derived_signal"],
    ["logicRules", "logic"],
    ["timing", "timing"],
    ["diagnostics", "diagnostic"],
    ["traceRefs", "interface"]
  ];

  return fields.flatMap(([field, tag]) =>
    (Array.isArray(bundle[field]) ? bundle[field] : [])
      .filter((fact) => field !== "traceRefs" || fact?.name !== "satk_tool_summary")
      .map((fact, index) => ({
      id: `${field}-${index + 1}`,
      assetId: extraction.fileId || "",
      fileId: extraction.fileId || "",
      fileName: extraction.fileName || bundle.source?.fileName || "",
      fileRole: "simulink_slx",
      location: fact.location || "",
      excerpt: buildBundleFactExcerpt(field, fact),
      summary: fact.description || fact.text || fact.name || "",
      tags: [tag, `model:${bundle.source?.modelName || ""}`].filter(Boolean),
      anchorId: `${field}-${index + 1}`
      }))
  );
}

function buildBundleFactExcerpt(field = "", fact = {}) {
  const name = fact.name || fact.id || "";
  const desc = fact.description || fact.text || "";
  if (field === "interfaces") {
    return `接口 ${name}${fact.direction ? ` (${fact.direction})` : ""}${fact.dataType ? ` 类型:${fact.dataType}` : ""}${desc ? ` - ${desc}` : ""}`;
  }
  if (field === "subsystems") {
    return `子系统 ${name}${fact.blockType ? ` [${fact.blockType}]` : ""}${desc ? ` - ${desc}` : ""}`;
  }
  if (field === "parameters") {
    return `参数 ${name}${fact.value !== undefined ? ` = ${fact.value}` : ""}${fact.unit ? ` ${fact.unit}` : ""}${desc ? ` - ${desc}` : ""}`;
  }
  if (field === "derivedSignals") {
    const inputs = Array.isArray(fact.inputs) ? fact.inputs.slice(0, 16) : [];
    const thresholds = Array.isArray(fact.thresholds) ? fact.thresholds.slice(0, 12) : [];
    const sourceBlocks = Array.isArray(fact.sourceBlocks) ? fact.sourceBlocks.slice(0, 6) : [];
    return `派生信号 ${name}${fact.expression ? ` = ${clipForPrompt(fact.expression, 420)}` : ""}${inputs.length ? ` 输入:${inputs.join(", ")}` : ""}${thresholds.length ? ` 阈值:${thresholds.join(", ")}` : ""}${sourceBlocks.length ? ` 追溯:${sourceBlocks.join(" <- ")}` : ""}${fact.coverage ? ` 覆盖:${fact.coverage}` : ""}`;
  }
  if (field === "logicRules") {
    return `逻辑规则 ${name}${fact.blockType ? ` [${fact.blockType}]` : ""}${fact.condition ? ` 条件:${fact.condition}` : ""}${fact.action ? ` 动作:${fact.action}` : ""}${desc ? ` - ${desc}` : ""}`;
  }
  if (field === "states") {
    return `状态 ${name}${fact.parent ? ` @${fact.parent}` : ""}${desc ? ` - ${desc}` : ""}`;
  }
  if (field === "traceRefs") {
    return `追溯 ${name}${fact.blockType ? ` [${fact.blockType}]` : ""}${fact.targetBlock ? ` -> ${fact.targetBlock}` : ""}${desc ? ` - ${desc}` : ""}`;
  }
  return desc || name || JSON.stringify(fact);
}

function buildFact(evidence = {}) {
  const excerpt = normalizeText(evidence.excerpt || evidence.summary || "");
  const tags = Array.isArray(evidence.tags) ? evidence.tags : [];
  const sourceRefs = [
    {
      sourceAnchorId: evidence.anchorId || evidence.id || "",
      assetId: evidence.assetId || evidence.fileId || "",
      fileName: evidence.fileName || "",
      fileRole: evidence.fileRole || "",
      location: evidence.location || "",
      excerpt
    }
  ];

  return {
    id: buildStableFactId(evidence),
    topic: inferTopic(evidence, excerpt, tags),
    condition: inferCondition(excerpt),
    behavior: excerpt,
    signals: inferSignals(excerpt),
    parameters: inferParameters(excerpt),
    stateLogic: inferStateLogic(excerpt, tags),
    sourceRefs
  };
}

function buildStableFactId(evidence = {}) {
  const fingerprint = [
    evidence.assetId || evidence.fileId || "",
    evidence.fileRole || "",
    evidence.fileName || "",
    evidence.location || "",
    evidence.excerpt || evidence.summary || ""
  ].join("|");
  return `fact-${createHash("sha1").update(fingerprint).digest("hex").slice(0, 12)}`;
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferTopic(evidence = {}, excerpt = "", tags = []) {
  const role = evidence.fileRole || "";
  if (tags.includes("interface")) return "接口与信号";
  if (tags.includes("structure")) return "模型结构事实";
  if (tags.includes("logic") && /StateflowTransition|State\s+\S+\s*->|状态[^。；;]*->/i.test(excerpt)) return "状态与模式";
  if (tags.includes("state")) return "状态与模式";
  if (tags.includes("threshold")) return "阈值与标定";
  if (tags.includes("derived_signal")) return "派生信号定义";
  if (tags.includes("logic")) return "逻辑与条件";
  if (tags.includes("timing")) return "时序与周期";
  if (tags.includes("diagnostic")) return "诊断与保护";
  if (role === "system_pdf") return "系统需求事实";
  if (role === "generated_c") return "生成代码事实";
  if (role === "simulink_slx") return "模型结构事实";
  return excerpt.slice(0, 60) || "模型事实";
}

function inferCondition(excerpt = "") {
  const text = normalizeText(excerpt);
  const chineseMatch = text.match(/(?:当|若|如果)(.+?)(?:时|，|,|则)/);
  if (chineseMatch) return chineseMatch[0];
  const codeMatch = text.match(/\bif\s*\(([^)]+)\)/i);
  if (codeMatch) return codeMatch[1].trim();
  const conditionMatch = text.match(/条件[:：]\s*([^。；;]+?)(?:\s+-\s+| — |$)/);
  return conditionMatch ? conditionMatch[1].trim() : "";
}

function inferSignals(excerpt = "") {
  const values = new Set();
  for (const match of normalizeText(excerpt).matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
    values.add(match[0]);
  }
  return Array.from(values).slice(0, 16);
}

function inferParameters(excerpt = "") {
  const parameters = [];
  const text = normalizeText(excerpt);
  for (const match of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(ms|s|Hz|V|A|%|℃|Nm|rpm|km\/h)?/gi)) {
    parameters.push({
      value: match[1],
      unit: match[2] || ""
    });
  }
  return parameters.slice(0, 12);
}

function inferStateLogic(excerpt = "", tags = []) {
  if (tags.includes("state") || /状态|模式|state|mode/i.test(excerpt)) {
    return normalizeText(excerpt);
  }
  return "";
}

function buildCompactModelRequirementView(modelRequirementView = {}, options = {}) {
  const facts = Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts : [];
  const requestedMaxFacts = Number(options.maxFacts || DEFAULT_COMPACT_MAX_FACTS) || DEFAULT_COMPACT_MAX_FACTS;
  const maxFacts = Math.max(1, Math.floor(requestedMaxFacts));
  const maxBytes = Math.max(12000, Number(options.maxBytes || DEFAULT_COMPACT_MAX_BYTES) || DEFAULT_COMPACT_MAX_BYTES);
  const seedTerms = appendUniqueTerms(buildSeedTerms(options), extractStateflowGuardTerms(facts));
  const scoredFacts = facts.map((fact, index) => {
    const scoreInfo = scoreFactForGeneration(fact, seedTerms);
    return {
      fact,
      index,
      score: scoreInfo.score,
      mandatory: scoreInfo.mandatory,
      topic: inferCompactTopic(fact)
    };
  });

  scoredFacts.sort((a, b) => {
    if (b.mandatory !== a.mandatory) return Number(b.mandatory) - Number(a.mandatory);
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  const selected = [];
  const selectedIds = new Set();
  const topicCounts = new Map();
  for (const item of scoredFacts) {
    if (selected.length >= maxFacts) break;
    if (!item.mandatory && item.score <= 0) continue;
    const cap = COMPACT_TOPIC_CAPS[item.topic] || 24;
    const currentTopicCount = topicCounts.get(item.topic) || 0;
    if (!isSystemRequirementFact(item.fact) && currentTopicCount >= cap) continue;
    addCompactFact(item, selected, selectedIds, topicCounts);
  }

  if (selected.length < Math.min(maxFacts, 32)) {
    for (const item of scoredFacts) {
      if (selected.length >= Math.min(maxFacts, 32)) break;
      if (!item.mandatory && item.score <= 0) continue;
      addCompactFact(item, selected, selectedIds, topicCounts);
    }
  }

  let compactFacts = selected
    .sort((a, b) => a.index - b.index)
    .map((item) => simplifyFactForGeneration(item.fact));

  let compact = {
    version: modelRequirementView.version || MODEL_REQUIREMENT_VIEW_VERSION,
    documentType: modelRequirementView.documentType || "software_requirement",
    sourceAssets: compactSourceAssets(modelRequirementView.sourceAssets || []),
    compactForGeneration: {
      strategy: "mrv_compact_generation_v1",
      originalFactCount: facts.length,
      factCount: compactFacts.length,
      criticalFactCount: compactFacts.filter((fact) => isCriticalCompactFact(fact)).length,
      seedTermCount: seedTerms.length,
      maxFacts,
      maxBytes
    },
    facts: compactFacts
  };

  while (compact.facts.length > 12 && Buffer.byteLength(JSON.stringify(compact), "utf8") > maxBytes) {
    const removableIndex = findLowestPriorityRemovableFactIndex(compact.facts);
    if (removableIndex < 0) break;
    compact.facts.splice(removableIndex, 1);
    compact.compactForGeneration.factCount = compact.facts.length;
  }

  return compact;
}

function addCompactFact(item, selected, selectedIds, topicCounts) {
  const factId = item.fact?.id || "";
  if (!factId || selectedIds.has(factId)) return;
  selected.push(item);
  selectedIds.add(factId);
  topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
}

function buildSeedTerms(options = {}) {
  const outline = options.requiredTitleOutline || options.manualTitleOutline || {};
  const anchors = Array.isArray(options.anchors) ? options.anchors : [];
  const assets = Array.isArray(options.assets) ? options.assets : [];
  const pieces = [options.seedText || ""];

  for (const section of Array.isArray(outline.sections) ? outline.sections : []) {
    pieces.push(section.sectionTitle || section.title || "");
    for (const item of Array.isArray(section.items) ? section.items : []) {
      pieces.push(item.itemTitle || item.title || "");
    }
  }

  for (const anchor of anchors) {
    const role = String(anchor.fileRole || "").toLowerCase();
    if (/system|requirement|需求/.test(role)) {
      pieces.push(anchor.excerpt || "", anchor.summary || "");
    }
  }

  for (const asset of assets) {
    const role = String(asset.fileRole || asset.role || "").toLowerCase();
    if (/system|requirement|需求/.test(role)) {
      pieces.push(asset.fileName || asset.originalName || "");
    }
  }

  return extractSeedTerms(pieces.join(" "));
}

function extractSeedTerms(text = "") {
  const values = new Set();
  const source = normalizeText(text);
  for (const match of source.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) {
    values.add(match[0]);
  }
  for (const match of source.matchAll(/[\u4e00-\u9fa5A-Za-z0-9_]{2,}/g)) {
    const value = match[0];
    if (/^[0-9]+$/.test(value)) continue;
    if (value.length > 18 && !/[A-Za-z_]/.test(value)) {
      for (let index = 0; index < value.length - 1; index += 2) {
        values.add(value.slice(index, Math.min(value.length, index + 6)));
      }
      continue;
    }
    values.add(value);
  }

  const domainTerms = [
    "KL15",
    "SOC",
    "EBS",
    "BMS",
    "BATT",
    "U_BATT",
    "VCCM_SOCWU_Ena",
    "Enabled",
    "Disabled",
    "唤醒",
    "休眠",
    "补电",
    "失败",
    "电压",
    "时间",
    "计数",
    "高压",
    "低压",
    "ON",
    "OFF"
  ];
  for (const term of domainTerms) {
    if (source.includes(term)) values.add(term);
  }

  const stopWords = new Set(["system", "requirement", "software", "model", "json", "the", "and", "or"]);
  return Array.from(values)
    .map((value) => String(value || "").trim())
    .filter((value) => value.length >= 2 && !stopWords.has(value.toLowerCase()))
    .slice(0, 160);
}

function extractStateflowGuardTerms(facts = []) {
  const values = [];
  const stopWords = new Set(["StateflowTransition", "Logical", "Operator", "true", "false", "after", "tick"]);
  for (const fact of Array.isArray(facts) ? facts : []) {
    const text = compactFactSearchText(fact);
    if (!/StateflowTransition|->|after\s*\(/i.test(text)) continue;
    for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) {
      const value = match[0];
      if (!stopWords.has(value)) values.push(value);
    }
  }
  return values.slice(0, 180);
}

function appendUniqueTerms(primary = [], extra = []) {
  const values = [];
  const seen = new Set();
  for (const term of [...primary, ...extra]) {
    const value = String(term || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function scoreFactForGeneration(fact = {}, seedTerms = []) {
  const topic = inferCompactTopic(fact);
  const text = compactFactSearchText(fact);
  const lower = text.toLowerCase();
  let score = 0;
  let mandatory = false;

  for (const term of seedTerms) {
    const value = String(term || "").trim();
    if (!value) continue;
    if (lower.includes(value.toLowerCase())) {
      score += /[A-Za-z_]/.test(value) ? 6 : 3;
    }
  }

  if (isSystemRequirementFact(fact)) {
    score += 80;
    mandatory = true;
  }
  if (topic === "派生信号定义" || /派生信号|derived signal|boolean/i.test(text)) {
    score += 55;
    mandatory = true;
  }
  if (topic === "状态与模式" || /StateflowTransition|->|after\s*\(|temporalCounter|timer\s*[<>]=/i.test(text)) {
    score += 42;
    mandatory = true;
  }
  if (/Outport|输出|置位|SOCWU|VCCM_bNetMaintn|Ena|Enabled|Disabled|Wake|Sleep|唤醒|休眠/i.test(text)) {
    score += 26;
  }
  if (topic === "阈值与标定") {
    score += /(SOC|BATT|电压|失败|计数|timer|after|20|10|70|11\.8|10\.5|阈值|Threshold)/i.test(text) ? 28 : 4;
  }
  if (topic === "逻辑与条件") {
    score += 16;
  }
  if (topic === "时序与周期" || /sampleTime|周期|after|timer|temporalCounter|20分钟/i.test(text)) {
    score += 16;
  }
  if (topic === "接口与信号") {
    score -= 5;
    if (/SOCWU|VCCM_bNetMaintn|SOC|BMS|EBS|KL15|BATT|Wake|Sleep|唤醒|休眠/i.test(text)) score += 16;
  }
  if (topic === "模型结构事实") {
    score -= 8;
    if (/Stateflow|Chart|Switch|If|RelationalOperator|Logic|Compare/i.test(text)) score += 14;
  }
  if (/Copyright|Unit detailed design/i.test(text)) {
    score -= 100;
  }

  return { score, mandatory };
}

function compactFactSearchText(fact = {}) {
  const sourceRefs = Array.isArray(fact.sourceRefs)
    ? fact.sourceRefs.map((ref) => [ref.fileName, ref.fileRole, ref.location, ref.excerpt].filter(Boolean).join(" ")).join(" ")
    : "";
  return normalizeText([
    fact.topic,
    fact.condition,
    fact.behavior,
    Array.isArray(fact.signals) ? fact.signals.join(" ") : "",
    Array.isArray(fact.parameters) ? fact.parameters.map((p) => `${p.value || ""}${p.unit || ""}`).join(" ") : "",
    fact.stateLogic,
    sourceRefs
  ].filter(Boolean).join(" "));
}

function inferCompactTopic(fact = {}) {
  const topic = String(fact.topic || "").trim();
  if (/StateflowTransition|->/i.test(String(fact.behavior || ""))) return "状态与模式";
  if (topic) return topic;
  return "模型事实";
}

function isSystemRequirementFact(fact = {}) {
  if (/系统需求/.test(String(fact.topic || ""))) return true;
  return (Array.isArray(fact.sourceRefs) ? fact.sourceRefs : []).some((ref) =>
    /system|requirement|需求/.test(String(ref.fileRole || ref.fileName || "").toLowerCase())
  );
}

function simplifyFactForGeneration(fact = {}) {
  const systemFact = isSystemRequirementFact(fact);
  return {
    id: fact.id,
    topic: fact.topic || "",
    condition: clipForPrompt(fact.condition || "", systemFact ? 260 : 180),
    behavior: clipForPrompt(fact.behavior || "", systemFact ? 1800 : 260),
    signals: Array.isArray(fact.signals) ? fact.signals.map(String).filter(Boolean).slice(0, systemFact ? 16 : 8) : [],
    parameters: Array.isArray(fact.parameters) ? fact.parameters.slice(0, systemFact ? 10 : 6) : [],
    stateLogic: clipForPrompt(fact.stateLogic || "", systemFact ? 220 : 140),
    sourceRefs: simplifySourceRefs(fact.sourceRefs || [], {
      excerptLimit: systemFact ? 700 : 100,
      locationLimit: systemFact ? 220 : 160,
      refLimit: 1
    })
  };
}

function simplifySourceRefs(sourceRefs = [], options = {}) {
  const excerptLimit = Math.max(80, Number(options.excerptLimit || 180) || 180);
  const locationLimit = Math.max(80, Number(options.locationLimit || 160) || 160);
  const refLimit = Math.max(1, Number(options.refLimit || 1) || 1);
  return (Array.isArray(sourceRefs) ? sourceRefs : [])
    .slice(0, refLimit)
    .map((ref) => ({
      sourceAnchorId: ref.sourceAnchorId || "",
      assetId: ref.assetId || "",
      fileName: ref.fileName || "",
      fileRole: ref.fileRole || "",
      location: clipForPrompt(ref.location || "", locationLimit),
      excerpt: clipForPrompt(ref.excerpt || "", excerptLimit)
    }))
    .filter((ref) => ref.fileName || ref.fileRole || ref.location || ref.excerpt);
}

function compactSourceAssets(sourceAssets = []) {
  return (Array.isArray(sourceAssets) ? sourceAssets : []).map((asset) => ({
    assetId: asset.assetId || "",
    fileName: asset.fileName || "",
    fileRole: asset.fileRole || ""
  }));
}

function clipForPrompt(value = "", limit = 400) {
  const text = normalizeText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function findLowestPriorityRemovableFactIndex(facts = []) {
  const derivedCount = facts.filter((fact) => fact.topic === "派生信号定义").length;
  const stateCount = facts.filter((fact) => fact.topic === "状态与模式" || /StateflowTransition|->|after\s*\(/i.test(fact.behavior || "")).length;
  const canRemoveDerived = derivedCount > COMPACT_MIN_DERIVED_FACTS;
  const canRemoveState = stateCount > COMPACT_MIN_STATE_FACTS;
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    const fact = facts[index];
    if (isSystemRequirementFact(fact)) continue;
    if (isCriticalCompactFact(fact)) continue;
    if (fact.topic === "派生信号定义") continue;
    if (fact.topic === "状态与模式" || /StateflowTransition|->|after\s*\(/i.test(fact.behavior || "")) continue;
    return index;
  }
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    const fact = facts[index];
    if (isSystemRequirementFact(fact)) continue;
    if (isCriticalCompactFact(fact)) continue;
    if (fact.topic === "派生信号定义" && canRemoveDerived) return index;
    if ((fact.topic === "状态与模式" || /StateflowTransition|->|after\s*\(/i.test(fact.behavior || "")) && canRemoveState) return index;
  }
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    const fact = facts[index];
    if (isSystemRequirementFact(fact)) continue;
    if (fact.topic === "派生信号定义" && !canRemoveDerived) continue;
    if ((fact.topic === "状态与模式" || /StateflowTransition|->|after\s*\(/i.test(fact.behavior || "")) && !canRemoveState) continue;
    return index;
  }
  return -1;
}

function isCriticalCompactFact(fact = {}) {
  return CRITICAL_COMPACT_FACT_PATTERN.test(compactFactSearchText(fact));
}
