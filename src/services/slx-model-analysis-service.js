import { MatlabMcpClient, MatlabMcpError } from "./matlab-mcp-client.js";
import { validateModelFactBundle } from "./model-fact-bundle.js";
import { SlxModelFactAdapter } from "./slx-model-fact-adapter.js";
import { buildModelFactBundleFromSatk } from "./satk-model-fact-builder.js";
import { config } from "../config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RAW_SLX_DCDC_BUCK_PATTERNS = [
  "DCDCActSt_buck",
  "DCDCReqSt_buck",
  "VoltMod_stDCBuck_SC",
  "HvCoorn_tiMaxWait4DCBuck_C",
  "HvCoorn_tiMntnFailNoBuckThd_C",
  "HvCoorn_tiRemMntnDcdcNoBuckEx_C",
  "HvCoorn_tiRemMntnDCBuckRst_C",
  "HvCoorn_bHVReq2DCBuck",
  "HvCoorn_bDCBuck2Rdy",
  "HvCoorn_bDCBuck2Shtdwn",
  "HvCoorn_bDCBuck2Dft",
  "HvCoorn_bHvCnt2DCBuck",
  "HvCoorn_bDCBuck2EngStrt"
];
const RAW_SLX_DATAFLOW_OPERATOR_TYPES = new Set([
  "Switch",
  "MultiPortSwitch",
  "MinMax",
  "Sum",
  "Product",
  "RelationalOperator",
  "Logic",
  "Saturate",
  "Lookup_n-D",
  "PreLookup",
  "Interpolation_n-D"
]);
const RAW_SLX_DATAFLOW_TERMINAL_TYPES = new Set([
  "Inport",
  "Outport",
  "Constant",
  "From",
  "Goto",
  "DataStoreRead",
  "DataStoreWrite",
  "UnitDelay",
  "Memory"
]);
const MAX_RAW_SLX_DATAFLOW_FACTS = 48;
const MAX_RAW_SLX_DATAFLOW_DEPTH = 10;

/**
 * SlxModelAnalysisService — 解析 SLX 文件，输出 ModelFactBundle。
 * 若 MATLAB MCP 不可用或解析失败，抛出明确错误（不再静默跳过）。
 */
export class SlxModelAnalysisService {
  constructor(options = {}) {
    const mcpOptions = {
      transport: options.transport || config.matlabMcp.transport,
      baseURL: options.baseURL || config.matlabMcp.baseURL,
      timeoutMs: options.timeoutMs || config.matlabMcp.timeoutMs,
      tempDir: options.tempDir || config.matlabMcp.tempDir,
      serverCommand: options.serverCommand || config.matlabMcp.serverCommand,
      serverArgs: options.serverArgs || config.matlabMcp.serverArgs,
      serverEnv: options.serverEnv || {}
    };
    this.mcpClient = options.mcpClient || new MatlabMcpClient(mcpOptions);
    this.adapter = options.adapter || new SlxModelFactAdapter();
    this.analysisBackend = String(options.analysisBackend || config.matlabMcp.analysisBackend || "satk").trim().toLowerCase();
    this.satkConfig = {
      toolkitRoot: options.simulinkAgenticToolkitRoot || config.matlabMcp.simulinkAgenticToolkitRoot,
      toolkitVersion: options.simulinkAgenticToolkitVersion || config.matlabMcp.simulinkAgenticToolkitVersion
    };
  }

  async analyze(file, options = {}) {
    const absolutePath = file.absolutePath || options.absolutePath || "";
    const originalName = file.originalName || "";

    if (!absolutePath) {
      throw new SlxAnalysisError("MISSING_PATH", `SLX 文件 ${originalName || "(unknown)"} 缺少绝对路径，无法调用 MATLAB MCP 解析。`);
    }

    let bundle;
    try {
      const raw = await this.analyzeRawWithSelectedBackend(
        { ...file, absolutePath, originalName },
        { documentType: options.documentType || "software_requirement" }
      );
      await appendRawSlxSemanticFacts(raw, { absolutePath, originalName });

      const validation = validateModelFactBundle(raw);
      if (!validation.valid) {
        throw new SlxAnalysisError("INVALID_BUNDLE", `MATLAB MCP 返回的 ModelFactBundle 校验失败：${validation.error}`);
      }

      bundle = raw;
    } catch (error) {
      if (error instanceof MatlabMcpError || error instanceof SlxAnalysisError) {
        throw error;
      }
      throw new SlxAnalysisError("ANALYSIS_FAILED", `SLX 文件 ${originalName} 解析失败：${error.message}`);
    }

    return bundle;
  }

  async analyzeRawWithSelectedBackend(file, options = {}) {
    const backend = String(options.analysisBackend || this.analysisBackend || "satk").trim().toLowerCase();
    if (backend === "legacy" || typeof this.mcpClient.callTool !== "function") {
      return this.mcpClient.analyzeSlx({
        absolutePath: file.absolutePath,
        originalName: file.originalName,
        documentType: options.documentType || "software_requirement"
      });
    }

    try {
      return await buildModelFactBundleFromSatk({
        mcpClient: this.mcpClient,
        file,
        options,
        config: this.satkConfig
      });
    } catch (error) {
      if (backend === "satk_with_legacy_fallback" && typeof this.mcpClient.analyzeSlx === "function") {
        return this.mcpClient.analyzeSlx({
          absolutePath: file.absolutePath,
          originalName: file.originalName,
          documentType: options.documentType || "software_requirement"
        });
      }
      throw new SlxAnalysisError("SATK_ANALYSIS_FAILED", `SATK 解析 SLX 文件 ${file.originalName || ""} 失败：${error.message}`);
    }
  }

  /**
   * 分析 SLX 并直接转换为 extraction（供 ExtractionService 使用）。
   * 失败时抛出错误，由调用方决定是否降级。
   */
  async analyzeAndConvertToExtraction(file, options = {}) {
    const bundle = await this.analyze(file, options);
    return this.adapter.toExtraction(bundle, file);
  }
}

async function appendRawSlxSemanticFacts(bundle = {}, file = {}) {
  const absolutePath = file.absolutePath || "";
  if (!absolutePath || !String(absolutePath).toLowerCase().endsWith(".slx")) return;

  const rawXml = await readRawSlxXml(absolutePath);
  if (!rawXml) return;

  appendRawSlxSemanticFactsFromXml(bundle, file, rawXml);
}

export function appendRawSlxSemanticFactsFromXml(bundle = {}, file = {}, rawXml = "") {
  if (!bundle || typeof bundle !== "object") return;
  const text = String(rawXml || "");
  if (!text) return;

  const dcdcBuckPatterns = scanRawSlxXmlPatternsText(text, RAW_SLX_DCDC_BUCK_PATTERNS);
  if (dcdcBuckPatterns.length) {
    appendRawSlxDcdcBuckFacts(bundle, file, dcdcBuckPatterns);
  }

  appendRawSlxDataflowFacts(bundle, file, text);
}

function appendRawSlxDcdcBuckFacts(bundle = {}, file = {}, present = []) {
  const fileName = file.originalName || file.absolutePath?.split(/[\\/]/).pop() || "model.slx";
  const location = `${fileName}/raw-xml/DCDC-Buck`;
  const description =
    "原始 SLX XML 中存在 DCDC Buck 相关状态/标定线索：" +
    present.join("、") +
    "。生成软件需求时应保留 DCDC 反馈未进入 Buck、等待超时、失败计数和高压流程退出相关模型侧依据。";

  bundle.parameters = Array.isArray(bundle.parameters) ? bundle.parameters : [];
  bundle.logicRules = Array.isArray(bundle.logicRules) ? bundle.logicRules : [];
  bundle.traceRefs = Array.isArray(bundle.traceRefs) ? bundle.traceRefs : [];
  bundle.parameters.push({
    name: "raw_slx_dcdc_buck_calibrations",
    value: present.filter((item) => item.endsWith("_C")).join(", ") || present.join(", "),
    unit: "",
    description,
    location,
    source: "raw_slx_xml_pattern_scan"
  });
  bundle.logicRules.push({
    name: "raw_slx_dcdc_buck_exit_logic",
    blockType: "raw_slx_xml",
    condition: "DCDC Buck 状态/请求/超时标定存在",
    action: "保留 DCDC 15s 未 Buck、等待超时、失败计数和下高压退出线索",
    description,
    location,
    source: "raw_slx_xml_pattern_scan"
  });
  bundle.traceRefs.push({
    name: "raw_slx_xml_pattern_scan",
    blockType: "SLXZipXML",
    targetBlock: location,
    description: `原始 SLX XML 模式扫描命中：${present.join(", ")}`,
    location
  });
}

function appendRawSlxDataflowFacts(bundle = {}, file = {}, rawXml = "") {
  const fileName = file.originalName || file.absolutePath?.split(/[\\/]/).pop() || "model.slx";
  const systems = parseRawSlxSystems(rawXml);
  if (!systems.length) return;

  bundle.logicRules = Array.isArray(bundle.logicRules) ? bundle.logicRules : [];
  bundle.traceRefs = Array.isArray(bundle.traceRefs) ? bundle.traceRefs : [];

  let addedCount = 0;
  for (let systemIndex = 0; systemIndex < systems.length; systemIndex += 1) {
    if (addedCount >= MAX_RAW_SLX_DATAFLOW_FACTS) break;
    const graph = buildRawSlxSystemGraph(systems[systemIndex]);
    if (!graph.blocks.size || !graph.edges.length) continue;

    const outports = Array.from(graph.blocks.values()).filter((block) => block.blockType === "Outport");
    for (const outport of outports) {
      if (addedCount >= MAX_RAW_SLX_DATAFLOW_FACTS) break;
      const summary = summarizeRawSlxOutputDataflow(graph, outport);
      if (!summary.operatorSummaries.length) continue;

      const outputName = outport.name || `SID_${outport.sid}`;
      const fact = {
        name: `raw_slx_dataflow_${systemIndex + 1}_${stableFactName(outputName)}`,
        blockType: "raw_slx_dataflow",
        condition: `${outputName} 由上游分支/计算数据流驱动`,
        action: renderRawSlxDataflowAction(summary),
        description:
          `原始 SLX XML 通用数据流解析发现输出 ${outputName} 的上游链路包含 ${summary.operatorTypes.join("、")} 等计算或分支模块。` +
          "该事实用于补足软件需求生成中的条件、赋值和公式级模型依据。",
        location: `${fileName}/raw-xml/dataflow/system-${systemIndex + 1}/${outputName}`,
        source: "raw_slx_xml_dataflow_scan"
      };

      const before = bundle.logicRules.length;
      addNamedFact(bundle.logicRules, fact);
      if (bundle.logicRules.length > before) addedCount += 1;
    }
  }

  if (!addedCount) return;
  addNamedFact(bundle.traceRefs, {
    name: "raw_slx_xml_dataflow_scan",
    blockType: "SLXZipXML",
    targetBlock: `${fileName}/raw-xml/dataflow`,
    description: `原始 SLX XML 通用数据流扫描生成 ${addedCount} 条输出分支/计算事实。`,
    location: `${fileName}/raw-xml/dataflow`
  });
}

function parseRawSlxSystems(rawXml = "") {
  const systems = [];
  for (const match of String(rawXml || "").matchAll(/<System\b[^>]*>[\s\S]*?<\/System>/g)) {
    systems.push(match[0]);
  }
  return systems;
}

function buildRawSlxSystemGraph(systemXml = "") {
  const blocks = parseRawSlxBlocks(systemXml);
  const edges = parseRawSlxEdges(systemXml);
  const incoming = new Map();
  const gotoByTag = new Map();

  for (const edge of edges) {
    if (!incoming.has(edge.dstSid)) incoming.set(edge.dstSid, []);
    incoming.get(edge.dstSid).push(edge);
  }

  for (const block of blocks.values()) {
    if (block.blockType !== "Goto") continue;
    const tag = block.params.GotoTag || block.name || "";
    if (!tag) continue;
    if (!gotoByTag.has(tag)) gotoByTag.set(tag, []);
    gotoByTag.get(tag).push(block.sid);
  }

  return { blocks, edges, incoming, gotoByTag };
}

function parseRawSlxBlocks(systemXml = "") {
  const blocks = new Map();
  const blockPattern = /<Block\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/Block>)/g;
  for (const match of systemXml.matchAll(blockPattern)) {
    const attrs = parseXmlAttributes(match[1] || "");
    const sid = attrs.SID || attrs.Handle || attrs.Name;
    if (!sid) continue;
    const block = {
      sid,
      name: decodeXml(attrs.Name || ""),
      blockType: decodeXml(attrs.BlockType || ""),
      params: parseRawSlxParams(match[2] || "")
    };
    blocks.set(sid, block);
  }
  return blocks;
}

function parseRawSlxParams(body = "") {
  const params = {};
  for (const match of String(body || "").matchAll(/<P\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/P>/g)) {
    params[decodeXml(match[1])] = decodeXml(match[2]);
  }
  return params;
}

function parseRawSlxEdges(systemXml = "") {
  const edges = [];
  for (const lineMatch of String(systemXml || "").matchAll(/<Line\b[^>]*>([\s\S]*?)<\/Line>/g)) {
    const lineBody = lineMatch[1] || "";
    const srcMatch = lineBody.match(/<P\s+Name="Src"[^>]*>([\s\S]*?)<\/P>/);
    if (!srcMatch) continue;
    const src = parseRawSlxPortRef(decodeXml(srcMatch[1]));
    if (!src) continue;

    for (const dstMatch of lineBody.matchAll(/<P\s+Name="Dst"[^>]*>([\s\S]*?)<\/P>/g)) {
      const dst = parseRawSlxPortRef(decodeXml(dstMatch[1]));
      if (!dst) continue;
      edges.push({
        srcSid: src.sid,
        srcPort: src.port,
        dstSid: dst.sid,
        dstPort: dst.port
      });
    }
  }
  return edges;
}

function parseRawSlxPortRef(value = "") {
  const match = String(value || "").trim().match(/^([^#]+)#(?:out|in):(\d+)/i);
  if (!match) return null;
  return {
    sid: match[1],
    port: Number(match[2]) || 1
  };
}

function parseXmlAttributes(value = "") {
  const attrs = {};
  for (const match of String(value || "").matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function decodeXml(value = "") {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function summarizeRawSlxOutputDataflow(graph = {}, outport = {}) {
  const operatorBlocks = [];
  const dependencies = new Set();
  const incomingEdges = Array.isArray(graph.incoming?.get(outport.sid)) ? graph.incoming.get(outport.sid) : [];

  for (const edge of incomingEdges) {
    for (const name of collectRawSlxDependencyNames(graph, edge.srcSid, new Set(), operatorBlocks, 0)) {
      if (name) dependencies.add(name);
    }
  }

  const uniqueOperators = [];
  const seenOperators = new Set();
  for (const block of operatorBlocks) {
    if (!block?.sid || seenOperators.has(block.sid)) continue;
    seenOperators.add(block.sid);
    uniqueOperators.push(block);
  }

  return {
    outputName: outport.name || `SID_${outport.sid}`,
    dependencies: Array.from(dependencies).slice(0, 24),
    operatorTypes: Array.from(new Set(uniqueOperators.map((block) => block.blockType).filter(Boolean))).slice(0, 10),
    operatorSummaries: uniqueOperators.map((block) => summarizeRawSlxOperator(graph, block)).filter(Boolean).slice(0, 12)
  };
}

function collectRawSlxDependencyNames(graph = {}, sid = "", visited = new Set(), operatorBlocks = [], depth = 0) {
  if (!sid || depth > MAX_RAW_SLX_DATAFLOW_DEPTH) return [];
  const visitKey = `${sid}:${depth}`;
  if (visited.has(visitKey)) return [];
  visited.add(visitKey);

  const block = graph.blocks?.get(sid);
  if (!block) return [`SID_${sid}`];

  const names = [];
  const terminalName = rawSlxTerminalName(block);
  if (terminalName) names.push(terminalName);
  if (RAW_SLX_DATAFLOW_OPERATOR_TYPES.has(block.blockType)) operatorBlocks.push(block);

  if (block.blockType === "From") {
    const tag = block.params.GotoTag || block.name || "";
    for (const gotoSid of graph.gotoByTag?.get(tag) || []) {
      for (const edge of graph.incoming?.get(gotoSid) || []) {
        names.push(...collectRawSlxDependencyNames(graph, edge.srcSid, visited, operatorBlocks, depth + 1));
      }
    }
  }

  if (!RAW_SLX_DATAFLOW_TERMINAL_TYPES.has(block.blockType) || block.blockType === "Outport" || block.blockType === "Goto") {
    for (const edge of graph.incoming?.get(sid) || []) {
      names.push(...collectRawSlxDependencyNames(graph, edge.srcSid, visited, operatorBlocks, depth + 1));
    }
  }

  return Array.from(new Set(names.filter(Boolean)));
}

function rawSlxTerminalName(block = {}) {
  if (!block) return "";
  if (block.blockType === "Constant") return block.params.Value || block.name || "";
  if (block.blockType === "From" || block.blockType === "Goto") return block.params.GotoTag || block.name || "";
  if (["Inport", "DataStoreRead", "DataStoreWrite", "UnitDelay", "Memory"].includes(block.blockType)) {
    return block.name || "";
  }
  return "";
}

function summarizeRawSlxOperator(graph = {}, block = {}) {
  const name = block.name || block.sid || block.blockType || "operator";
  if (block.blockType === "Switch") {
    const trueValue = rawSlxInputNames(graph, block.sid, 1).join(" + ") || "输入1";
    const condition = rawSlxInputNames(graph, block.sid, 2).join(" + ") || "输入2";
    const falseValue = rawSlxInputNames(graph, block.sid, 3).join(" + ") || "输入3";
    const criteria = block.params.Criteria || "u2 ~= 0";
    return `Switch ${name}: 当 ${condition} 满足 ${criteria} 时选择 ${trueValue}，否则选择 ${falseValue}`;
  }
  if (block.blockType === "MultiPortSwitch") {
    const selector = rawSlxInputNames(graph, block.sid, 1).join(" + ") || "选择输入";
    const inputs = rawSlxAllInputNames(graph, block.sid).slice(1).join(", ") || "数据输入";
    return `MultiPortSwitch ${name}: 根据 ${selector} 从 ${inputs} 中选择输出`;
  }
  if (block.blockType === "MinMax") {
    const fn = block.params.Function || "min/max";
    return `MinMax ${name}: 输出 ${fn}(${rawSlxAllInputNames(graph, block.sid).join(", ") || "输入"})`;
  }
  if (block.blockType === "RelationalOperator") {
    const operator = block.params.Operator || "比较";
    return `RelationalOperator ${name}: ${rawSlxAllInputNames(graph, block.sid).join(` ${operator} `) || operator}`;
  }
  if (block.blockType === "Logic") {
    const operator = block.params.Operator || "逻辑";
    return `Logic ${name}: 对 ${rawSlxAllInputNames(graph, block.sid).join(", ") || "输入"} 执行 ${operator}`;
  }
  if (block.blockType === "Sum") {
    return `Sum ${name}: 对 ${rawSlxAllInputNames(graph, block.sid).join(", ") || "输入"} 求和/差`;
  }
  if (block.blockType === "Product") {
    return `Product ${name}: 对 ${rawSlxAllInputNames(graph, block.sid).join(", ") || "输入"} 执行乘除运算`;
  }
  if (block.blockType === "Saturate") {
    return `Saturate ${name}: 将 ${rawSlxAllInputNames(graph, block.sid).join(", ") || "输入"} 限制在 ${block.params.LowerLimit || "下限"} 到 ${block.params.UpperLimit || "上限"}`;
  }
  if (["Lookup_n-D", "PreLookup", "Interpolation_n-D"].includes(block.blockType)) {
    return `${block.blockType} ${name}: 基于 ${rawSlxAllInputNames(graph, block.sid).join(", ") || "输入"} 查表/插值`;
  }
  return `${block.blockType} ${name}: 输入 ${rawSlxAllInputNames(graph, block.sid).join(", ") || "未命名输入"}`;
}

function rawSlxInputNames(graph = {}, sid = "", port = 1) {
  const names = [];
  for (const edge of graph.incoming?.get(sid) || []) {
    if (Number(edge.dstPort || 1) !== Number(port || 1)) continue;
    names.push(...collectRawSlxDependencyNames(graph, edge.srcSid, new Set(), [], 0));
  }
  return Array.from(new Set(names.filter(Boolean))).slice(0, 8);
}

function rawSlxAllInputNames(graph = {}, sid = "") {
  const names = [];
  for (const edge of graph.incoming?.get(sid) || []) {
    names.push(...collectRawSlxDependencyNames(graph, edge.srcSid, new Set(), [], 0));
  }
  return Array.from(new Set(names.filter(Boolean))).slice(0, 16);
}

function renderRawSlxDataflowAction(summary = {}) {
  const clauses = [];
  if (summary.outputName) clauses.push(`${summary.outputName} 的上游数据流包含分支/计算链路`);
  if (summary.dependencies?.length) clauses.push(`依赖信号/常量: ${summary.dependencies.join(", ")}`);
  if (summary.operatorSummaries?.length) clauses.push(`计算逻辑: ${summary.operatorSummaries.join("；")}`);
  return clauses.join("。") + "。";
}

function stableFactName(value = "") {
  return String(value || "output")
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "output";
}

function addNamedFact(target = [], fact = {}) {
  if (!fact.name || target.some((item) => item?.name === fact.name)) return;
  target.push(fact);
}

async function readRawSlxXml(slxPath) {
  try {
    const { stdout } = await execFileAsync("unzip", ["-p", slxPath, "*.xml"], {
      maxBuffer: 80 * 1024 * 1024
    });
    return stdout;
  } catch (_error) {
    return "";
  }
}

function scanRawSlxXmlPatternsText(xmlText = "", patterns = []) {
  const text = String(xmlText || "");
  return patterns.filter((pattern) => text.includes(pattern));
}

export class SlxAnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SlxAnalysisError";
    this.code = code;
  }
}
