import { randomUUID } from "node:crypto";
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
      timeoutMs: options.timeoutMs || config.matlabMcp.timeoutMs,
      tempDir: options.tempDir || config.matlabMcp.tempDir,
      serverCommand: options.serverCommand || config.matlabMcp.serverCommand,
      serverArgs: options.serverArgs || config.matlabMcp.serverArgs,
      serverEnv: options.serverEnv || {}
    };
    this.mcpClient = options.mcpClient || new MatlabMcpClient(mcpOptions);
    this.adapter = options.adapter || new SlxModelFactAdapter();
  }

  async analyze(file, options = {}) {
    const absolutePath = file.absolutePath || options.absolutePath || "";
    const originalName = file.originalName || "";

    if (!absolutePath) {
      throw new SlxAnalysisError("MISSING_PATH", `SLX 文件 ${originalName || "(unknown)"} 缺少绝对路径，无法调用 MATLAB MCP 解析。`);
    }

    let bundle;
    try {
      const raw = await this.mcpClient.analyzeSlx({
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
    }

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
