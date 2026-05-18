import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MatlabMcpClient, MatlabMcpError } from "./matlab-mcp-client.js";
import { validateModelFactBundle, createEmptyModelFactBundle } from "./model-fact-bundle.js";
import { SlxModelFactAdapter } from "./slx-model-fact-adapter.js";
import { config } from "../config.js";

/**
 * SlxModelAnalysisService — 解析 SLX 文件，输出 ModelFactBundle。
 * 若 MATLAB MCP 不可用或解析失败，抛出明确错误（不再静默跳过）。
 */
export class SlxModelAnalysisService {
  constructor(options = {}) {
    const mcpOptions = {
      transport: options.transport || config.matlabMcp.transport,
      baseURL: options.baseURL || config.matlabMcp.baseURL,
      httpMode: options.httpMode || config.matlabMcp.httpMode,
      authToken: options.authToken || config.matlabMcp.authToken,
      timeoutMs: options.timeoutMs || config.matlabMcp.timeoutMs,
      tempDir: options.tempDir || config.matlabMcp.tempDir,
      serverCommand: options.serverCommand || config.matlabMcp.serverCommand,
      serverArgs: options.serverArgs || config.matlabMcp.serverArgs,
      serverEnv: options.serverEnv || {}
    };
    this.mcpClient = options.mcpClient || new MatlabMcpClient(mcpOptions);
    this.adapter = options.adapter || new SlxModelFactAdapter();
    this.analysisBackend = String(options.analysisBackend || config.matlabMcp.analysisBackend || "satk").trim().toLowerCase();
    this.simulinkAgenticToolkitVersion =
      options.simulinkAgenticToolkitVersion || config.matlabMcp.simulinkAgenticToolkitVersion || "";
  }

  async analyze(file, options = {}) {
    const absolutePath = file.absolutePath || options.absolutePath || "";
    const originalName = file.originalName || "";

    if (!absolutePath) {
      throw new SlxAnalysisError("MISSING_PATH", `SLX 文件 ${originalName || "(unknown)"} 缺少绝对路径，无法调用 MATLAB MCP 解析。`);
    }

    let stagedModel = null;
    let bundle;
    try {
      stagedModel = await stageModelWithOriginalName(absolutePath, originalName);
      const raw =
        this.analysisBackend !== "legacy" && typeof this.mcpClient.callTool === "function"
          ? await this.analyzeWithSatkTools({
              absolutePath: stagedModel.modelPath,
              originalName,
              documentType: options.documentType || "software_requirement"
            })
          : await this.mcpClient.analyzeSlx({
              absolutePath,
              originalName,
              documentType: options.documentType || "software_requirement"
            });

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
    } finally {
      if (stagedModel?.cleanupDir) {
        await fs.rm(stagedModel.cleanupDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    return bundle;
  }

  async analyzeWithSatkTools({ absolutePath, originalName }) {
    const modelName = path.basename(originalName || absolutePath || "model.slx", path.extname(originalName || absolutePath || ""));
    const modelArgs = { model: absolutePath };
    const bundle = createEmptyModelFactBundle();
    bundle.source = {
      fileName: originalName || path.basename(absolutePath),
      modelName,
      modelVersion: "",
      generator: {
        kind: "simulink_agentic_toolkit",
        toolkitVersion: this.simulinkAgenticToolkitVersion || ""
      }
    };

    const overview = await this.mcpClient.callTool("model_overview", modelArgs);
    const rootRead = await this.mcpClient.callTool("model_read", { ...modelArgs, scope: "root" });
    const queryParams = await this.mcpClient.callTool("model_query_params", modelArgs).catch(() => "");
    const resolvedParams = await this.mcpClient.callTool("model_resolve_params", modelArgs).catch(() => "");

    const overviewLines = usefulSatkLines(overview);
    const rootLines = usefulSatkLines(rootRead);
    const paramLines = usefulSatkLines(`${queryParams}\n${resolvedParams}`);

    appendSatkOverviewFacts(bundle, modelName, overviewLines);
    appendSatkReadFacts(bundle, modelName, rootLines);
    appendSatkParameterFacts(bundle, modelName, paramLines);

    const chartScopes = overviewLines
      .map((line) => line.match(/^(\S+)\s+Stateflow\s+Chart\b/i)?.[1] || "")
      .filter(Boolean)
      .slice(0, 8);
    for (const scope of chartScopes) {
      const chartRead = await this.mcpClient.callTool("model_read", { ...modelArgs, scope }).catch(() => "");
      appendSatkReadFacts(bundle, modelName, usefulSatkLines(chartRead), scope);
    }

    appendStateflowTransitionsFromRawIds(bundle, modelName, overviewLines, rootLines);
    return bundle;
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

export class SlxAnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SlxAnalysisError";
    this.code = code;
  }
}

async function stageModelWithOriginalName(absolutePath = "", originalName = "") {
  const cleanOriginalName = path.basename(String(originalName || ""));
  if (!cleanOriginalName || path.basename(absolutePath) === cleanOriginalName) {
    return { modelPath: absolutePath, cleanupDir: "" };
  }
  try {
    await fs.access(absolutePath);
  } catch {
    return { modelPath: absolutePath, cleanupDir: "" };
  }
  const cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), "software-doc-slx-model-"));
  const modelPath = path.join(cleanupDir, cleanOriginalName);
  await fs.copyFile(absolutePath, modelPath);
  return { modelPath, cleanupDir };
}

function usefulSatkLines(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !/^status\s*:/i.test(line) &&
      !/^message\s*:/i.test(line) &&
      !/Output truncated/i.test(line) &&
      !/^(interface|input|output)\s*:?\s*$/i.test(line) &&
      !/^DataTypeConversion\b/i.test(line)
    );
}

function appendSatkOverviewFacts(bundle, modelName, lines) {
  for (const line of lines) {
    const portMatch = line.match(/^(\S+)\s+(Inport|Outport)\s+([^\s]+)\b([\s\S]*)$/i);
    if (portMatch) {
      const [, sid, type, name, rest] = portMatch;
      bundle.interfaces.push({
        name,
        direction: type.toLowerCase() === "inport" ? "input" : "output",
        dataType: rest.match(/(?:dataType|OutDataTypeStr)=([^\s]+)/i)?.[1] || "",
        description: line,
        location: `${modelName}/${name || sid}`
      });
      continue;
    }

    const chartMatch = line.match(/^(\S+)\s+Stateflow\s+Chart\s+([^\s]+)/i);
    if (chartMatch) {
      bundle.subsystems.push({
        name: chartMatch[2],
        blockType: "Stateflow Chart",
        description: line,
        location: `${modelName}/${chartMatch[2]}`
      });
      continue;
    }

    const stateMatch = line.match(/^(\S+):(\d+):(\d+)\s+([^\[]+)\s+\[State\b/i);
    if (stateMatch) {
      const [, , chartId, stateId, stateName] = stateMatch;
      bundle.states.push({
        name: stateName.trim(),
        description: `StateflowState ${stateName.trim()}`,
        location: `${modelName}/Stateflow/${chartId}/${stateName.trim()}`,
        stateId
      });
    }
  }
}

function appendSatkReadFacts(bundle, modelName, lines, scope = "root") {
  for (const line of lines) {
    const transitionMatch = line.match(/State\s+(.+?)\s*->\s*(.+?)\s+guard\s+\[(.*?)\]\s+action\s+(.+)/i);
    if (transitionMatch) {
      const [, fromState, toState, guard, action] = transitionMatch;
      bundle.states.push({
        name: `${fromState.trim()}->${toState.trim()}`,
        description: `StateflowTransition ${fromState.trim()} -> ${toState.trim()} guard [${guard}] action ${action}`,
        location: `${modelName}/Stateflow/${scope}/${fromState.trim()}->${toState.trim()}`
      });
      continue;
    }

    const switchMatch = line.match(/^(\S+)\s+Switch\s+condition\s+(.+)/i);
    if (switchMatch) {
      bundle.logicRules.push({
        name: `${switchMatch[1]}_switch_condition`,
        blockType: "Switch",
        condition: switchMatch[2],
        action: line,
        description: line,
        location: `${modelName}/${switchMatch[1]}`
      });
      continue;
    }

    const derivedMatch = line.match(/^(\S+)\s+Gain\s+(.+)/i);
    if (derivedMatch) {
      bundle.derivedSignals.push({
        name: `${derivedMatch[1]}_gain`,
        expression: derivedMatch[2],
        description: line,
        location: `${modelName}/${derivedMatch[1]}`
      });
      continue;
    }

    const logicMatch = line.match(/^(\S+)\s+Logic\s+(.+)/i);
    if (logicMatch) {
      const expression = logicMatch[2];
      bundle.logicRules.push({
        name: `${logicMatch[1]}_logic`,
        blockType: "Logic",
        action: expression,
        description: line,
        location: `${modelName}/${logicMatch[1]}`
      });
      for (const signal of Array.from(expression.matchAll(/\b[A-Za-z]\w*_[A-Za-z]\w*\b/g)).map((match) => match[0])) {
        bundle.interfaces.push({
          name: `signal_catalog_${signal}`,
          direction: "internal",
          description: `Signal catalog entry detected from SATK logic expression: ${signal}`,
          location: `${modelName}/signals/${signal}`
        });
      }
    }
  }
}

function appendSatkParameterFacts(bundle, modelName, lines) {
  for (const line of lines) {
    const resolved = line.match(/^([A-Za-z]\w*)\s*=\s*(.+)$/);
    if (resolved) {
      bundle.parameters.push({
        name: resolved[1],
        value: resolved[2].trim(),
        description: line,
        location: `${modelName}/parameters/${resolved[1]}`
      });
      continue;
    }
    for (const threshold of line.matchAll(/\b([A-Za-z]\w*Thd)\s*=\s*([^\s]+)/g)) {
      bundle.parameters.push({
        name: threshold[1],
        value: threshold[2],
        description: line,
        location: `${modelName}/parameters/${threshold[1]}`
      });
    }
  }
}

function appendStateflowTransitionsFromRawIds(bundle, modelName, overviewLines, rootLines) {
  const stateByRawId = new Map();
  for (const line of overviewLines) {
    const stateMatch = line.match(/^(\S+):(\d+):(\d+)\s+([^\[]+)\s+\[State\b/i);
    if (stateMatch) {
      const [, , chartId, stateId, stateName] = stateMatch;
      stateByRawId.set(`sf_${chartId}:${stateId}`, { chartId, stateName: stateName.trim() });
    }
  }
  for (const line of rootLines) {
    const transitionMatch = line.match(/#(sf_\d+:\d+)->(sf_\d+:\d+)/);
    if (!transitionMatch) continue;
    const from = stateByRawId.get(transitionMatch[1]);
    const to = stateByRawId.get(transitionMatch[2]);
    if (!from || !to) continue;
    bundle.states.push({
      name: `${from.stateName}->${to.stateName}`,
      description: `StateflowTransition ${from.stateName} -> ${to.stateName}`,
      location: `${modelName}/Stateflow/${from.chartId}/${from.stateName}->${to.stateName}`
    });
  }
}

export function appendRawSlxSemanticFactsFromXml(bundle, file = {}, rawXml = "") {
  const text = String(rawXml || "");
  const modelName = bundle?.source?.modelName || path.basename(file.originalName || "model", path.extname(file.originalName || ""));
  const blocks = new Map();
  for (const match of text.matchAll(/<Block\b([^>]*)>([\s\S]*?)<\/Block>|<Block\b([^>]*)\/>/g)) {
    const attrs = match[1] || match[3] || "";
    const body = match[2] || "";
    const sid = attrs.match(/\bSID="([^"]+)"/)?.[1] || "";
    if (!sid) continue;
    blocks.set(sid, {
      sid,
      blockType: attrs.match(/\bBlockType="([^"]+)"/)?.[1] || "",
      name: attrs.match(/\bName="([^"]+)"/)?.[1] || "",
      criteria: body.match(/<P\s+Name="Criteria">([\s\S]*?)<\/P>/i)?.[1]?.trim() || ""
    });
  }

  const lineSummaries = [];
  for (const match of text.matchAll(/<Line\b[^>]*>([\s\S]*?)<\/Line>/g)) {
    const body = match[1] || "";
    const srcSid = body.match(/<P\s+Name="Src">([^#<]+)/i)?.[1] || "";
    const dstSid = body.match(/<P\s+Name="Dst">([^#<]+)/i)?.[1] || "";
    const src = blocks.get(srcSid);
    const dst = blocks.get(dstSid);
    if (src && dst) {
      lineSummaries.push(`${src.name || src.sid} -> ${dst.blockType ? `${dst.blockType} ` : ""}${dst.name || dst.sid}`);
    }
  }

  if (!lineSummaries.length) {
    return bundle;
  }

  const switchBlocks = Array.from(blocks.values()).filter((block) => /switch/i.test(block.blockType));
  const switchSummary = switchBlocks
    .map((block) => `${block.blockType} ${block.name}${block.criteria ? ` (${block.criteria})` : ""}`)
    .join("; ");
  bundle.logicRules.push({
    name: `raw_slx_dataflow_${bundle.logicRules.length + 1}`,
    blockType: "raw_slx_dataflow",
    condition: switchBlocks.map((block) => block.criteria).filter(Boolean).join("; "),
    action: [switchSummary, ...lineSummaries].filter(Boolean).join("; "),
    description: `Raw SLX XML dataflow scan for ${file.originalName || modelName}`,
    location: `${modelName}/raw-slx/dataflow`
  });
  bundle.traceRefs.push({
    name: "raw_slx_xml_dataflow_scan",
    description: `Scanned ${lineSummaries.length} raw SLX line connections.`,
    location: `${modelName}/raw-slx`
  });
  return bundle;
}
