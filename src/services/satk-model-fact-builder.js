import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEmptyModelFactBundle } from "./model-fact-bundle.js";

const SATK_TOOLS = ["model_overview", "model_read", "model_query_params", "model_resolve_params"];
const IMPORTANT_SCOPE_PATTERN =
  /\b(Stateflow|Chart|State|Transition|SubSystem|Subsystem|Switch|If|Enabled|Triggered|Variant|Lookup|Saturat|Relay|Logic|Compare|Relational|Controller|Control|Manager|Diagnostic|Fault|Protection|Monitor)\b/i;
const LOGIC_PATTERN =
  /\b(if|switch|case|when|while|condition|guard|enable|disable|trigger|variant|lookup|relay|logic|compare|relational|saturat|fault|diagnostic|protect|recover|degrad|after\s*\(|before\s*\(|>=|<=|==|~=|>|<|&&|\|\|)\b/i;
const TIMING_PATTERN = /\b(sample\s*time|period|rate|delay|timer|tick|after\s*\(|before\s*\(|\d+(?:\.\d+)?\s*(ms|s|sec|Hz))\b/i;
const DIAGNOSTIC_PATTERN = /\b(assert|check|diagnostic|fault|error|fail|protect|degrad|recover|fallback|safe|invalid)\b/i;
const INTERFACE_PATTERN = /\b(inport|outport|input|output|trigger\s*port|enable\s*port|port\b|interface)\b/i;
const STRUCTURE_PATTERN = /\b(subsystem|subsystem reference|model reference|chart|stateflow|atomic subchart)\b/i;
const STATE_PATTERN =
  /\b(state|transition|stateflow|chart|entry:|during:|exit:|StateflowTransition)\b|(?:^|\s)id:\s*"?sf_\d+:\d+"?\s+#\s*(?:DEFAULT|sf_\d+:\d+)\s*->\s*sf_\d+:\d+/i;
const PARAMETER_PATTERN = /\b(parameter|param|threshold|calibration|constant|gain|limit|min|max|table|breakpoint|sample\s*time|@[\w.]+\([^)]+\))\b/i;
const NOISE_PATTERN = /\b(position|location\s*=\s*\[|font|color|foreground|background|screen|zoom|annotation|layout|x:\s*\d+|y:\s*\d+)\b/i;
const VARIABLE_REF_PATTERN = /@[\w.]+\(([^)]+)\)/g;
const TOOL_OUTPUT_NOISE_PATTERN =
  /\b(Output truncated|Token limit reached|Use scope to focus|tools\/call|model_overview|model_read|model_query_params|model_resolve_params|satk_tool_summary)\b/i;
const GENERIC_HEADING_PATTERN =
  /^(interface|input|output|inport|outport|state|subsystem|blocktype|triggerport|enableport|message)\s*:?\s*$/i;
const GENERIC_BLOCK_DOC_PATTERN =
  /^(DataTypeConversion|Terminator|SubSystem|TriggerPort|EnablePort|Inport|Outport|Ground|Constant):\s+[A-Z][a-z]/i;
const GENERIC_NAME_PATTERN =
  /^(interface|input|output|inport|outport|message|port|state|subsystem|blocktype|triggerport|enableport|datatypeconversion|terminator|ground|constant)$/i;
const GENERIC_SIGNAL_TOKEN_SET = new Set([
  "BlockType",
  "SampleTime",
  "OutDataTypeStr",
  "Stateflow",
  "SubSystem",
  "Subsystem",
  "Switch",
  "Constant",
  "Inport",
  "Outport",
  "Input",
  "Output",
  "interface",
  "message",
  "status",
  "Order",
  "StateflowTransition"
]);

const MAX_TEXT_LINE_LENGTH = 520;
const MAX_SCOPE_READS = 28;
const MAX_QUERY_TARGETS = 48;
const MAX_RESOLVE_EXPRESSIONS = 80;

export async function buildModelFactBundleFromSatk({ mcpClient, file = {}, options = {}, config = {} } = {}) {
  if (!mcpClient || typeof mcpClient.callTool !== "function") {
    throw new Error("SATK analysis requires an MCP client with callTool(toolName, args)");
  }

  const absolutePath = file.absolutePath || options.absolutePath || "";
  const originalName = file.originalName || path.basename(absolutePath || "");
  const modelName = inferModelName(originalName || absolutePath);
  const stagedModel = await prepareModelFileForSatk({ absolutePath, originalName, modelName });
  const model = stagedModel.model;
  const calls = [];
  const scopedReadDepth = String(config.scopedReadDepth || options.scopedReadDepth || "1");

  try {
    const overview = await callRequiredSatkTool(mcpClient, calls, "model_overview", {
      model,
      scope: "root",
      detail: "full"
    });

    const rootRead = await callRequiredSatkTool(mcpClient, calls, "model_read", {
      model,
      scope: "root",
      depth: "1"
    });

    const scopeIds = selectImportantScopes([overview, rootRead]);
    const scopedReads = [];
    for (const scope of scopeIds) {
      const result = await callOptionalSatkTool(mcpClient, calls, "model_read", {
        model,
        scope,
        depth: scopedReadDepth
      });
      if (result.ok) scopedReads.push(result.value);
    }

    const allReadTexts = [overview, rootRead, ...scopedReads].map(resultToText).join("\n");
    const queryTargets = selectQueryTargets([overview, rootRead, ...scopedReads]);
    let queryParams = null;
    if (queryTargets.length) {
      const result = await callOptionalSatkTool(mcpClient, calls, "model_query_params", {
        model,
        targets: JSON.stringify(queryTargets),
        params: JSON.stringify([
          "Name",
          "BlockType",
          "OutDataTypeStr",
          "SampleTime",
          "Port",
          "Description",
          "Value",
          "Gain",
          "Threshold",
          "Criteria",
          "Operator",
          "Inputs",
          "Function",
          "Table",
          "BreakpointsForDimension1",
          "BreakpointsForDimension2"
        ]),
        compile: "false"
      });
      if (result.ok) queryParams = result.value;
    }

    const expressions = extractVariableReferences(allReadTexts);
    let resolvedParams = null;
    if (expressions.length) {
      const result = await callOptionalSatkTool(mcpClient, calls, "model_resolve_params", {
        model,
        expressions: JSON.stringify(expressions)
      });
      if (result.ok) resolvedParams = result.value;
    }

    return buildBundle({
      fileName: originalName,
      modelName,
      toolkitVersion: config.toolkitVersion || "",
      overview,
      rootRead,
      scopedReads,
      queryParams,
      resolvedParams,
      calls
    });
  } finally {
    await stagedModel.cleanup();
  }
}

async function prepareModelFileForSatk({ absolutePath, originalName, modelName } = {}) {
  const existingPath = String(absolutePath || "");
  const originalBaseName = path.basename(String(originalName || ""));
  const stagedName = originalBaseName.toLowerCase().endsWith(".slx")
    ? originalBaseName
    : `${modelName || inferModelName(existingPath) || "model"}.slx`;

  if (!existingPath || !(await fileExists(existingPath))) {
    return { model: existingPath || stagedName, cleanup: async () => {} };
  }

  if (path.basename(existingPath) === stagedName) {
    return { model: existingPath, cleanup: async () => {} };
  }

  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "slx-satk-"));
  const stagedPath = path.join(stageDir, stagedName);
  await fs.copyFile(existingPath, stagedPath);

  return {
    model: stagedPath,
    cleanup: async () => {
      await fs.rm(stageDir, { recursive: true, force: true });
    }
  };
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function callRequiredSatkTool(mcpClient, calls, toolName, args) {
  const startedAt = Date.now();
  try {
    const value = await mcpClient.callTool(toolName, args);
    const text = resultToText(value);
    if (isSatkErrorText(text)) {
      throw new Error(compactText(text, 500));
    }
    calls.push({ toolName, args, ok: true, elapsedMs: Date.now() - startedAt, bytes: Buffer.byteLength(text, "utf8") });
    return value;
  } catch (error) {
    calls.push({ toolName, args, ok: false, elapsedMs: Date.now() - startedAt, error: error.message || String(error) });
    throw error;
  }
}

async function callOptionalSatkTool(mcpClient, calls, toolName, args) {
  const startedAt = Date.now();
  try {
    const value = await mcpClient.callTool(toolName, args);
    const text = resultToText(value);
    if (isSatkErrorText(text)) {
      throw new Error(compactText(text, 500));
    }
    calls.push({ toolName, args, ok: true, elapsedMs: Date.now() - startedAt, bytes: Buffer.byteLength(text, "utf8") });
    return { ok: true, value };
  } catch (error) {
    calls.push({ toolName, args, ok: false, elapsedMs: Date.now() - startedAt, error: error.message || String(error) });
    return { ok: false, error };
  }
}

function buildBundle({ fileName, modelName, toolkitVersion, overview, rootRead, scopedReads, queryParams, resolvedParams, calls }) {
  const bundle = createEmptyModelFactBundle();
  bundle.source = {
    fileName,
    modelName,
    modelVersion: "",
    generator: {
      kind: "simulink_agentic_toolkit",
      toolkitVersion,
      tools: SATK_TOOLS
    }
  };

  const resolvedLookup = buildResolvedLookup(resolvedParams);
  const textsBySource = [
    { source: "model_overview", text: resultToText(overview) },
    { source: "model_read:root", text: resultToText(rootRead) },
    ...scopedReads.map((value, index) => ({ source: `model_read:scope_${index + 1}`, text: resultToText(value) })),
    { source: "model_query_params", text: resultToText(queryParams) },
    { source: "model_resolve_params", text: resultToText(resolvedParams) }
  ];
  const context = buildSatkContext({
    modelName,
    texts: textsBySource.map((item) => item.text)
  });

  const seen = new Set();
  for (const { source, text } of textsBySource) {
    for (const line of meaningfulLines(text)) {
      addFactsFromLine(bundle, line, source, resolvedLookup, seen, context);
    }
  }
  addSignalCatalogFacts(bundle, seen, context);

  if (!hasSemanticFacts(bundle)) {
    bundle.diagnostics.push({
      name: "satk_no_semantic_facts",
      severity: "warning",
      description: "SATK completed but no semantic model facts were recognized from the tool output.",
      location: fileName || modelName || "model"
    });
  }

  bundle.traceRefs.push({
    name: "satk_tool_summary",
    blockType: "SATK",
    description: buildToolSummary(calls),
    location: modelName || fileName || "model"
  });

  bundle.stats = {
    toolCallCount: calls.length,
    successfulToolCallCount: calls.filter((call) => call.ok).length,
    factCount: countSemanticFacts(bundle)
  };

  return bundle;
}

function addFactsFromLine(bundle, line, source, resolvedLookup, seen, context = {}) {
  if (!line || NOISE_PATTERN.test(line)) return;
  const normalized = normalizeText(enrichSatkLine(line, context));
  if (!normalized || normalized.length < 4) return;
  if (shouldDiscardSatkLine(normalized)) return;
  const location = inferLocation(normalized, context);
  const name = inferName(normalized, location, context);
  const description = compactText(normalized, MAX_TEXT_LINE_LENGTH);
  const baseFact = { name, description, location, source };
  const keyBase = `${source}|${location}|${description}`;

  if (INTERFACE_PATTERN.test(normalized) && !isGenericInterfaceFact(normalized, name)) {
    addUnique(bundle.interfaces, seen, `interfaces|${keyBase}`, {
      ...baseFact,
      direction: inferDirection(normalized),
      dataType: inferDataType(normalized)
    });
  }

  if (STRUCTURE_PATTERN.test(normalized)) {
    addUnique(bundle.subsystems, seen, `subsystems|${keyBase}`, {
      ...baseFact,
      blockType: inferBlockType(normalized)
    });
  }

  if (STATE_PATTERN.test(normalized)) {
    addUnique(bundle.states, seen, `states|${keyBase}`, {
      ...baseFact,
      parent: inferParent(normalized)
    });
  }

  if (PARAMETER_PATTERN.test(normalized)) {
    for (const parameter of extractParameters(normalized, resolvedLookup)) {
      addUnique(bundle.parameters, seen, `parameters|${parameter.name}|${parameter.value}|${location}`, {
        name: parameter.name,
        value: parameter.value,
        unit: parameter.unit,
        description,
        location,
        source
      });
    }
  }

  if (looksLikeExpression(normalized)) {
    addUnique(bundle.derivedSignals, seen, `derivedSignals|${keyBase}`, {
      ...baseFact,
      expression: extractExpression(normalized),
      inputs: extractSignalNames(normalized).slice(0, 16),
      thresholds: extractThresholds(normalized),
      sourceBlocks: extractBlockIds(normalized).slice(0, 8)
    });
  }

  if (LOGIC_PATTERN.test(normalized)) {
    addUnique(bundle.logicRules, seen, `logicRules|${keyBase}`, {
      ...baseFact,
      blockType: inferBlockType(normalized),
      condition: inferCondition(normalized),
      action: inferAction(normalized)
    });
  }

  if (TIMING_PATTERN.test(normalized)) {
    addUnique(bundle.timing, seen, `timing|${keyBase}`, {
      ...baseFact,
      sampleTime: inferSampleTime(normalized),
      period: inferPeriod(normalized)
    });
  }

  if (DIAGNOSTIC_PATTERN.test(normalized)) {
    addUnique(bundle.diagnostics, seen, `diagnostics|${keyBase}`, {
      ...baseFact,
      severity: inferSeverity(normalized)
    });
  }
}

function meaningfulLines(text = "") {
  return normalizeSatkText(text)
    .split(/\r?\n/)
    .map((line) => normalizeText(line.replace(/^[-*]\s*/, "")))
    .filter((line) => line && !line.startsWith("ans =") && !/^status:\s*ok$/i.test(line))
    .filter((line) => !shouldDiscardSatkLine(line))
    .filter((line) => {
      if (line.length < 4) return false;
      return (
        /blk_\d+/.test(line) ||
        INTERFACE_PATTERN.test(line) ||
        STRUCTURE_PATTERN.test(line) ||
        STATE_PATTERN.test(line) ||
        PARAMETER_PATTERN.test(line) ||
        LOGIC_PATTERN.test(line) ||
        TIMING_PATTERN.test(line) ||
        DIAGNOSTIC_PATTERN.test(line)
      );
    });
}

function buildSatkContext({ modelName = "", texts = [] } = {}) {
  const stateById = new Map();
  const blockById = new Map();
  for (const text of texts) {
    for (const rawLine of normalizeSatkText(text).split(/\r?\n/)) {
      const line = normalizeText(rawLine.replace(/^[-*]\s*/, ""));
      if (!line) continue;

      const state = parseStateEntry(line, modelName);
      if (state) {
        stateById.set(state.id, state);
        continue;
      }

      const block = parseBlockEntry(line, modelName);
      if (block) blockById.set(block.id, block);
    }
  }
  return { modelName, stateById, blockById };
}

function shouldDiscardSatkLine(line = "") {
  const text = normalizeText(line);
  if (!text) return true;
  if (/^status:\s*ok$/i.test(text) || /^ans\s*=$/i.test(text)) return true;
  if (TOOL_OUTPUT_NOISE_PATTERN.test(text)) return true;
  if (GENERIC_HEADING_PATTERN.test(text)) return true;
  if (GENERIC_BLOCK_DOC_PATTERN.test(text) && !/\bblk_\d+\b/.test(text)) return true;
  if (/^message\s*:/i.test(text)) return true;
  return false;
}

function isGenericInterfaceFact(text = "", name = "") {
  const normalized = normalizeText(text);
  if (!INTERFACE_PATTERN.test(normalized)) return false;
  if (!GENERIC_NAME_PATTERN.test(name || "")) return false;
  const meaningfulSignals = extractSignalNames(normalized).filter((signal) => !GENERIC_SIGNAL_TOKEN_SET.has(signal));
  return meaningfulSignals.length === 0 && !/\bblk_\d+\b/.test(normalized);
}

function addSignalCatalogFacts(bundle, seen, context = {}) {
  const signals = collectUsefulSignalNames(bundle, context.modelName || "");
  if (!signals.length) return;
  const chunkSize = 48;
  const chunkCount = Math.ceil(signals.length / chunkSize);
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = signals.slice(index * chunkSize, (index + 1) * chunkSize);
    const name = `signal_catalog_${index + 1}`;
    addUnique(bundle.interfaces, seen, `interfaces|signalCatalog|${index + 1}`, {
      name,
      direction: "signal",
      dataType: "",
      description: `模型信号目录 ${index + 1}/${chunkCount}: ${chunk.join(", ")}`,
      location: `${context.modelName || "model"}/signal_catalog/${index + 1}`,
      source: "satk_signal_catalog",
      signals: chunk
    });
  }
}

function collectUsefulSignalNames(bundle, modelName = "") {
  const values = new Set();
  const fields = ["interfaces", "states", "parameters", "derivedSignals", "logicRules", "timing", "diagnostics"];
  for (const field of fields) {
    for (const fact of Array.isArray(bundle[field]) ? bundle[field] : []) {
      const pieces = [
        fact.name,
        fact.description,
        fact.expression,
        Array.isArray(fact.inputs) ? fact.inputs.join(" ") : "",
        Array.isArray(fact.signals) ? fact.signals.join(" ") : ""
      ];
      for (const piece of pieces) {
        for (const signal of extractSignalNames(piece || "")) {
          if (isUsefulSignalName(signal, modelName)) values.add(signal);
        }
      }
    }
  }
  return [...values].sort((a, b) => {
    const prefix = modelName ? `${modelName}_` : "";
    const aModel = prefix && a.startsWith(prefix) ? 0 : 1;
    const bModel = prefix && b.startsWith(prefix) ? 0 : 1;
    if (aModel !== bModel) return aModel - bModel;
    return a.localeCompare(b);
  });
}

function isUsefulSignalName(name = "", modelName = "") {
  const value = String(name || "").trim();
  if (!value || GENERIC_SIGNAL_TOKEN_SET.has(value)) return false;
  if (/^(blk|sf)_/i.test(value)) return false;
  if (/^(true|false|after|before|entry|during|exit|guard|action|source|target)$/i.test(value)) return false;
  if (modelName && value.startsWith(`${modelName}_`)) return true;
  return /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(value);
}

function enrichSatkLine(line = "", context = {}) {
  const text = normalizeText(line);
  const transition = parseStateflowTransition(text, context);
  if (!transition) return text;
  const guard = inferCondition(text);
  const tail = transition.tail ? ` ${transition.tail}` : "";
  return [
    `StateflowTransition ${transition.fromName} -> ${transition.toName}`,
    `id=${transition.transitionId}`,
    `source=${transition.fromRaw}`,
    `target=${transition.toRaw}`,
    guard ? `guard=[${guard}]` : "",
    tail
  ].filter(Boolean).join(" ");
}

function parseStateEntry(text = "", modelName = "") {
  const stateMatch = text.match(/\bblk_[A-Za-z0-9_]+:(\d+):(\d+)\s+([A-Za-z_][A-Za-z0-9_]*)\s+\[(?:State|Chart)\b/i)
    || text.match(/\bsf_(\d+):(\d+)\s+([A-Za-z_][A-Za-z0-9_]*)\s+\[(?:State|Chart)\b/i);
  if (!stateMatch) return null;
  const [, chartId, stateId, name] = stateMatch;
  return {
    id: `sf_${chartId}:${stateId}`,
    chartId,
    stateId,
    name,
    location: `${modelName || "model"}/Stateflow/${chartId}/${name}`
  };
}

function parseBlockEntry(text = "", modelName = "") {
  const blockMatch = text.match(/\b(blk_\d+)\b\s+(.+)$/);
  if (!blockMatch) return null;
  const [, id, rest] = blockMatch;
  const name = inferBlockEntryName(rest);
  return {
    id,
    name: name || id,
    location: name ? `${modelName || "model"}/${name} [${id}]` : `${modelName || "model"}/${id}`
  };
}

function inferBlockEntryName(rest = "") {
  const text = normalizeText(rest);
  const direct = text.match(/^(?:Inport|Outport|DataStoreRead|DataStoreWrite|TriggerPort|EnablePort)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
  if (direct) return direct[1];
  const chart = text.match(/\b(?:Chart|SubSystem|Subsystem|ModelReference|AtomicSubchart)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
  if (chart) return chart[1];
  const named = text.match(/\bName\s*[:=]\s*([A-Za-z_][A-Za-z0-9_]*)\b/i);
  if (named) return named[1];
  return "";
}

function parseStateflowTransition(text = "", context = {}) {
  const match = text.match(/\bid:\s*"?(sf_(\d+):\d+)"?\s+#\s*(DEFAULT|sf_\d+:\d+)\s*->\s*(sf_\d+:\d+)(.*)$/i);
  if (!match) return null;
  const [, transitionId, chartId, fromRaw, toRaw, rawTail] = match;
  const stateById = context.stateById instanceof Map ? context.stateById : new Map();
  const fromState = fromRaw.toUpperCase() === "DEFAULT" ? null : stateById.get(fromRaw);
  const toState = stateById.get(toRaw);
  const fromName = fromState?.name || (fromRaw.toUpperCase() === "DEFAULT" ? "DEFAULT" : fromRaw);
  const toName = toState?.name || toRaw;
  return {
    transitionId,
    chartId,
    fromRaw,
    toRaw,
    fromName,
    toName,
    tail: compactText(rawTail || "", 220)
  };
}

function selectImportantScopes(values = []) {
  const lines = values.flatMap((value) => meaningfulLines(resultToText(value)));
  const scored = new Map();
  for (const line of lines) {
    const blockIds = extractBlockIds(line);
    if (!blockIds.length) continue;
    const score = IMPORTANT_SCOPE_PATTERN.test(line) ? 3 : LOGIC_PATTERN.test(line) ? 2 : STRUCTURE_PATTERN.test(line) ? 1 : 0;
    if (score <= 0) continue;
    for (const blockId of blockIds) {
      scored.set(blockId, Math.max(scored.get(blockId) || 0, score));
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || Number(a[0].slice(4)) - Number(b[0].slice(4)))
    .map(([blockId]) => blockId)
    .slice(0, MAX_SCOPE_READS);
}

function selectQueryTargets(values = []) {
  const ids = new Set();
  for (const value of values) {
    for (const line of meaningfulLines(resultToText(value))) {
      if (PARAMETER_PATTERN.test(line) || LOGIC_PATTERN.test(line) || INTERFACE_PATTERN.test(line)) {
        for (const id of extractBlockIds(line)) ids.add(id);
      }
    }
  }
  return [...ids].slice(0, MAX_QUERY_TARGETS);
}

function extractVariableReferences(text = "") {
  const values = new Set();
  for (const match of String(text || "").matchAll(VARIABLE_REF_PATTERN)) {
    const expr = String(match[1] || "").trim();
    if (!expr || isNumericValue(expr) || /^[-+]?inf$/i.test(expr)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?$/.test(expr)) continue;
    values.add(expr);
  }
  return [...values].slice(0, MAX_RESOLVE_EXPRESSIONS);
}

function buildResolvedLookup(value) {
  const text = resultToText(value);
  const lookup = new Map();
  for (const line of normalizeSatkText(text).split(/\r?\n/).map(normalizeText).filter(Boolean)) {
    const match = line.match(/\b([A-Za-z_][A-Za-z0-9_.]*)\b\s*[:=]\s*([^,;\]\n]+)/);
    if (match) {
      lookup.set(match[1], compactText(match[2], 120));
    }
  }
  return lookup;
}

function extractParameters(line, resolvedLookup) {
  const values = [];
  for (const match of line.matchAll(VARIABLE_REF_PATTERN)) {
    const name = String(match[1] || "").trim();
    if (!name) continue;
    values.push({ name, value: resolvedLookup.get(name) || name, unit: inferUnit(line) });
  }
  const namedValue = line.match(/\b([A-Za-z_][A-Za-z0-9_.]*(?:Th|Thd|Threshold|Limit|Max|Min|Gain|Kp|Ki|Kd|Cal)?)\b\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i);
  if (namedValue) {
    values.push({ name: namedValue[1], value: namedValue[2], unit: inferUnit(line) });
  }
  const numeric = line.match(/\b(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*(ms|s|sec|Hz|V|A|%|Nm|rpm|km\/h|deg)?\b/i);
  if (!values.length && numeric) {
    values.push({ name: inferName(line), value: numeric[1], unit: numeric[2] || "" });
  }
  return values;
}

function resultToText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === "object" && "text" in item ? item.text : resultToText(item)))
      .join("\n");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.content)) return resultToText(value.content);
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function normalizeSatkText(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/^\s*ans\s*=\s*$/gm, "")
    .replace(/^\s*'/gm, "")
    .replace(/'\s*$/gm, "")
    .replace(/\\n/g, "\n")
    .replace(/\t/g, " ");
}

function normalizeText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function compactText(text = "", limit = 400) {
  const normalized = normalizeText(text);
  if (normalized.length <= limit) return normalized;
  return normalized.slice(0, Math.max(0, limit - 1));
}

function addUnique(target, seen, key, value) {
  if (seen.has(key)) return;
  seen.add(key);
  target.push(value);
}

function isSatkErrorText(text = "") {
  return /status:\s*error\b/i.test(text) || /\berror_code:\s*[A-Z_]+/i.test(text);
}

function inferModelName(value = "") {
  const parsed = path.parse(String(value || ""));
  return parsed.name || "model";
}

function extractBlockIds(text = "") {
  return [...new Set([...String(text || "").matchAll(/\bblk_\d+\b/g)].map((match) => match[0]))];
}

function inferLocation(text = "", context = {}) {
  const transition = parseStateflowTransition(text, context);
  if (transition) {
    return `${context.modelName || "model"}/Stateflow/${transition.chartId}/${transition.fromName}->${transition.toName}`;
  }
  const enrichedTransition = text.match(/\bStateflowTransition\s+(.+?)\s*->\s*(.+?)\s+id=(sf_(\d+):\d+)/i);
  if (enrichedTransition) {
    return `${context.modelName || "model"}/Stateflow/${enrichedTransition[4]}/${enrichedTransition[1]}->${enrichedTransition[2]}`;
  }
  const state = parseStateEntry(text, context.modelName || "");
  if (state) return state.location;
  const blockId = text.match(/\bblk_\d+\b/);
  if (blockId) {
    const block = context.blockById instanceof Map ? context.blockById.get(blockId[0]) : null;
    return block?.location || `${context.modelName || "model"}/${blockId[0]}`;
  }
  const pathMatch = text.match(/\b[A-Za-z_][A-Za-z0-9_]*(?:\/[^\s,;:]+)+/);
  if (pathMatch) return pathMatch[0];
  return compactText(text, 80) || "model";
}

function inferName(text = "", fallback = "", context = {}) {
  const transition = parseStateflowTransition(text, context);
  if (transition) return `${transition.fromName}->${transition.toName}`;
  const enrichedTransition = text.match(/\bStateflowTransition\s+(.+?)\s*->\s*(.+?)\s+id=/i);
  if (enrichedTransition) return `${enrichedTransition[1]}->${enrichedTransition[2]}`;
  const state = parseStateEntry(text, context.modelName || "");
  if (state) return state.name;
  const quoted = text.match(/["']([^"']{1,120})["']/);
  if (quoted) return quoted[1];
  const afterBlockId = text.replace(/^\s*blk_\d+\s*/, "");
  const semanticName = firstSemanticToken(afterBlockId);
  if (semanticName) return semanticName;
  const id = text.match(/\bblk_\d+\b/);
  if (id) return id[0];
  return firstSemanticToken(text) || fallback || "model_fact";
}

function firstSemanticToken(text = "") {
  const skip = new Set([
    "Inport",
    "Outport",
    "input",
    "output",
    "port",
    "dataType",
    "Stateflow",
    "Chart",
    "SubSystem",
    "Subsystem",
    "Switch",
    "Gain",
    "Constant",
    "BlockType",
    "SampleTime",
    "status",
    "ok",
    "message",
    "interface",
    "StateflowTransition",
    "source",
    "target"
  ]);
  for (const match of String(text || "").matchAll(/\b[A-Za-z_][A-Za-z0-9_]{1,80}\b/g)) {
    const token = match[0];
    if (!skip.has(token)) return token;
  }
  return "";
}

function inferDirection(text = "") {
  if (/\b(outport|output)\b/i.test(text)) return "output";
  if (/\b(trigger)\b/i.test(text)) return "trigger";
  if (/\b(enable)\b/i.test(text)) return "enable";
  if (/\b(inport|input)\b/i.test(text)) return "input";
  return "";
}

function inferDataType(text = "") {
  const match = text.match(/\b(?:dataType|OutDataTypeStr|type)\s*[:=]\s*([A-Za-z0-9_.<>]+)\b/i);
  return match ? match[1] : "";
}

function inferBlockType(text = "") {
  const match = text.match(/\b(?:BlockType|type)\s*[:=]\s*([A-Za-z0-9_\- ]{2,60})/i);
  if (match) return compactText(match[1], 60);
  const known = text.match(/\b(Stateflow|Chart|SubSystem|Switch|If|Lookup|Saturate|RelationalOperator|Logic|Outport|Inport|Gain|Constant)\b/i);
  return known ? known[1] : "";
}

function inferParent(text = "") {
  const match = text.match(/\bparent\s*[:=]\s*([^,;]+)/i);
  return match ? compactText(match[1], 120) : "";
}

function looksLikeExpression(text = "") {
  return /\by\d+\s*=/.test(text) || /@[\w.]+\([^)]+\)/.test(text) || /\bexpression\s*[:=]/i.test(text);
}

function extractExpression(text = "") {
  const match = text.match(/\by\d+\s*=\s*(.+)$/);
  if (match) return compactText(match[1], 360);
  const expr = text.match(/\bexpression\s*[:=]\s*(.+)$/i);
  return expr ? compactText(expr[1], 360) : compactText(text, 360);
}

function extractSignalNames(text = "") {
  const ignore = GENERIC_SIGNAL_TOKEN_SET;
  return [...new Set([...String(text || "").matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)].map((match) => match[0]).filter((name) => !ignore.has(name)))];
}

function extractThresholds(text = "") {
  return [...String(text || "").matchAll(/\b-?\d+(?:\.\d+)?\s*(?:ms|s|sec|Hz|V|A|%|Nm|rpm|km\/h|deg)?\b/gi)]
    .map((match) => match[0])
    .slice(0, 12);
}

function inferCondition(text = "") {
  const guard = text.match(/\[([^\]]+)\]/);
  if (guard) return compactText(guard[1], 240);
  const condition = text.match(/\b(?:if|when|while|condition|guard)\b\s*[:=]?\s*(.+?)(?:\bthen\b|\baction\b|$)/i);
  return condition ? compactText(condition[1], 240) : "";
}

function inferAction(text = "") {
  const action = text.match(/\b(?:then|action|output|sets?|assigns?)\b\s*[:=]?\s*(.+)$/i);
  return action ? compactText(action[1], 240) : "";
}

function inferSampleTime(text = "") {
  const match = text.match(/\b(?:SampleTime|sample\s*time)\s*[:=]\s*([^,;]+)/i);
  return match ? compactText(match[1], 80) : "";
}

function inferPeriod(text = "") {
  const match = text.match(/\b(?:period|rate|delay|after)\s*[:=]?\s*([^,;]+)/i);
  return match ? compactText(match[1], 80) : "";
}

function inferSeverity(text = "") {
  if (/\b(critical|fatal|error|fail)\b/i.test(text)) return "critical";
  if (/\b(warn|degrad|fallback)\b/i.test(text)) return "warning";
  return "info";
}

function inferUnit(text = "") {
  const match = text.match(/\b(ms|s|sec|Hz|V|A|%|Nm|rpm|km\/h|deg)\b/i);
  return match ? match[1] : "";
}

function isNumericValue(text = "") {
  return /^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(String(text || "").trim());
}

function hasSemanticFacts(bundle) {
  return countSemanticFacts(bundle) > 0;
}

function countSemanticFacts(bundle) {
  return [
    "interfaces",
    "subsystems",
    "states",
    "parameters",
    "derivedSignals",
    "logicRules",
    "timing",
    "diagnostics"
  ].reduce((total, field) => total + (Array.isArray(bundle[field]) ? bundle[field].length : 0), 0);
}

function buildToolSummary(calls = []) {
  return calls
    .map((call) => `${call.toolName}:${call.ok ? "ok" : "failed"}${call.bytes ? `:${call.bytes}B` : ""}${call.error ? `:${compactText(call.error, 120)}` : ""}`)
    .join("; ");
}
