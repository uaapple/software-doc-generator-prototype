import { spawn } from "node:child_process";
import path from "node:path";
import { request as httpRequest } from "node:http";

/**
 * MATLAB MCP Client — 调用 MATLAB MCP 服务解析 SLX 文件。
 *
 * 支持两种传输模式：
 * 1. stdio 模式（默认）：通过 JSON-RPC over stdio 与官方 MATLAB MCP Core Server 通信
 * 2. http 模式（兼容旧配置）：通过 HTTP POST 调用
 *
 * 输入：SLX 文件绝对路径、原始文件名、目标文档类型。
 * 输出：JSON ModelFactBundle，失败时返回明确错误码和 message。
 */

const MCP_PROTOCOL_VERSION = "2024-11-05";
const JSON_RPC_VERSION = "2.0";

let nextRequestId = 1;

export class MatlabMcpClient {
  constructor(options = {}) {
    this.transport = String(options.transport || process.env.MATLAB_MCP_TRANSPORT || "stdio").trim().toLowerCase();
    this.baseURL = options.baseURL || process.env.MATLAB_MCP_BASE_URL || "http://127.0.0.1:5100";
    this.timeoutMs = Number(options.timeoutMs || process.env.MATLAB_MCP_TIMEOUT_MS || 120000);
    this.tempDir = options.tempDir || process.env.MATLAB_MCP_TMPDIR || "/tmp";
    this.serverCommand = options.serverCommand || process.env.MATLAB_MCP_SERVER_COMMAND || "";
    this.serverArgs = options.serverArgs || [];
    this.serverEnv = options.serverEnv || {};
    this._child = null;
    this._pendingRequests = new Map();
    this._responseBuffer = "";
    this._initialized = false;
    this._initPromise = null;
  }

  get isAvailable() {
    if (this.transport === "http") {
      return Boolean(this.baseURL);
    }
    return true;
  }

  /**
   * Ensure the MCP server is initialized (stdio mode).
   * Spawns the server process and performs the MCP initialize handshake.
   */
  async _ensureInitialized() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._performInitialization();
    try {
      await this._initPromise;
    } catch (error) {
      this._initPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    const command = this.serverCommand;
    const args = this.serverArgs;

    if (!command) {
      throw new MatlabMcpError("NO_COMMAND", "MATLAB MCP server command is not configured. Set MATLAB_MCP_SERVER_COMMAND or pass serverCommand option.");
    }

    const env = {
      ...process.env,
      TMPDIR: this.tempDir,
      TMP: this.tempDir,
      TEMP: this.tempDir,
      ...this.serverEnv,
      NO_COLOR: "1"
    };

    this._child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      windowsHide: true
    });

    this._child.on("error", (err) => {
      const pending = [...this._pendingRequests.values()];
      this._pendingRequests.clear();
      for (const { reject } of pending) {
        reject(new MatlabMcpError("PROCESS_ERROR", `MATLAB MCP server process error: ${err.message}`));
      }
    });

    this._child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        const pending = [...this._pendingRequests.values()];
        this._pendingRequests.clear();
        for (const { reject } of pending) {
          reject(new MatlabMcpError("PROCESS_EXIT", `MATLAB MCP server exited with code ${code}`));
        }
      }
      this._child = null;
      this._initialized = false;
      this._initPromise = null;
    });

    this._child.stdout.on("data", (chunk) => {
      this._responseBuffer += chunk.toString("utf8");
      this._processBuffer();
    });

    // Step 1: Send initialize request
    const initResult = await this._sendRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "hermes-matlab-mcp-client", version: "1.0.0" }
    });

    // Step 2: Send initialized notification
    this._sendNotification("notifications/initialized", {});

    this._initialized = true;
    return initResult;
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++;
      const message = {
        jsonrpc: JSON_RPC_VERSION,
        id,
        method,
        params: params || {}
      };

      const timeout = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new MatlabMcpError("TIMEOUT", `MATLAB MCP request "${method}" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this._pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      const payload = `${JSON.stringify(message)}\n`;
      this._child.stdin.write(payload);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  _sendNotification(method, params) {
    const message = {
      jsonrpc: JSON_RPC_VERSION,
      method,
      params: params || {}
    };
    const payload = `${JSON.stringify(message)}\n`;
    this._child.stdin.write(payload);
  }

  /**
   * Process the response buffer, parsing complete messages.
   */
  _processBuffer() {
    while (true) {
      const lineEnd = this._responseBuffer.indexOf("\n");
      if (lineEnd === -1) break;

      const body = this._responseBuffer.slice(0, lineEnd).trim();
      this._responseBuffer = this._responseBuffer.slice(lineEnd + 1);
      if (!body) continue;

      try {
        const message = JSON.parse(body);
        this._handleMessage(message);
      } catch {
        // Ignore malformed JSON
      }
    }
  }

  /**
   * Handle a parsed JSON-RPC message.
   */
  _handleMessage(message) {
    if (message.id != null && this._pendingRequests.has(message.id)) {
      const { resolve, reject } = this._pendingRequests.get(message.id);
      this._pendingRequests.delete(message.id);
      if (message.error) {
        reject(new MatlabMcpError(
          message.error.code || "RPC_ERROR",
          message.error.message || "Unknown JSON-RPC error"
        ));
      } else {
        resolve(message.result);
      }
    }
    // Notifications and other messages are ignored for now
  }

  /**
   * Call an MCP tool via JSON-RPC.
   */
  async _callTool(toolName, args) {
    await this._ensureInitialized();
    const result = await this._sendRequest("tools/call", {
      name: toolName,
      arguments: args
    });

    return normalizeToolResult(result);
  }

  /**
   * Call an MCP tool by name. Used by the SATK-backed SLX analyzer.
   */
  async callTool(toolName, args = {}) {
    if (!toolName) {
      throw new MatlabMcpError("MISSING_TOOL", "MATLAB MCP tool name is required");
    }
    if (this.transport === "http") {
      return this._callToolHttp(toolName, args);
    }
    return this._callTool(toolName, args);
  }

  /**
   * Analyze an SLX file — main entry point.
   */
  async analyzeSlx({ absolutePath, originalName, documentType = "software_requirement" } = {}) {
    if (!absolutePath) {
      throw new MatlabMcpError("MISSING_PATH", "SLX file absolute path is required");
    }

    if (this.transport === "http") {
      return this._analyzeSlxHttp({ absolutePath, originalName, documentType });
    }

    return this._analyzeSlxStdio({ absolutePath, originalName, documentType });
  }

  /**
   * stdio transport: call analyze_slx tool via JSON-RPC.
   */
  async _analyzeSlxStdio({ absolutePath, documentType }) {
    try {
      const result = await this.callTool("analyze_slx", {
        filePath: absolutePath,
        outputFormat: "model_fact_bundle"
      });

      if (!result || typeof result !== "object") {
        throw new MatlabMcpError("INVALID_BUNDLE", `MATLAB MCP returned non-object result: ${JSON.stringify(result).slice(0, 200)}`);
      }

      return result;
    } catch (error) {
      if (error instanceof MatlabMcpError) throw error;
      throw new MatlabMcpError("ANALYSIS_FAILED", `SLX analysis failed via stdio: ${error.message}`);
    }
  }

  /**
   * http transport: call analyze_slx via HTTP POST (legacy).
   */
  async _analyzeSlxHttp({ absolutePath, originalName, documentType }) {
    const body = JSON.stringify({
      filePath: absolutePath,
      originalName: originalName || "",
      documentType,
      outputFormat: "model_fact_bundle"
    });

    const url = new URL("/mcp/tools/analyze_slx", this.baseURL);

    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          },
          timeout: this.timeoutMs
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch {
              reject(new MatlabMcpError("INVALID_RESPONSE", `MATLAB MCP returned non-JSON: ${raw.slice(0, 200)}`));
              return;
            }

            if (res.statusCode >= 400 || parsed.error) {
              const code = parsed.error?.code || `HTTP_${res.statusCode}`;
              const message = parsed.error?.message || parsed.message || `MATLAB MCP request failed with status ${res.statusCode}`;
              reject(new MatlabMcpError(code, message));
              return;
            }

            resolve(parsed.result || parsed);
          });
        }
      );

      req.on("error", (err) => {
        reject(new MatlabMcpError("CONNECTION_ERROR", `Cannot connect to MATLAB MCP at ${this.baseURL}: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new MatlabMcpError("TIMEOUT", `MATLAB MCP request timed out after ${this.timeoutMs}ms`));
      });

      req.write(body);
      req.end();
    });
  }

  async _callToolHttp(toolName, args = {}) {
    const body = JSON.stringify(args || {});
    const url = new URL(`/mcp/tools/${encodeURIComponent(toolName)}`, this.baseURL);

    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          },
          timeout: this.timeoutMs
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch {
              reject(new MatlabMcpError("INVALID_RESPONSE", `MATLAB MCP returned non-JSON: ${raw.slice(0, 200)}`));
              return;
            }

            if (res.statusCode >= 400 || parsed.error) {
              const code = parsed.error?.code || `HTTP_${res.statusCode}`;
              const message = parsed.error?.message || parsed.message || `MATLAB MCP request failed with status ${res.statusCode}`;
              reject(new MatlabMcpError(code, message));
              return;
            }

            resolve(normalizeToolResult(parsed.result || parsed));
          });
        }
      );

      req.on("error", (err) => {
        reject(new MatlabMcpError("CONNECTION_ERROR", `Cannot connect to MATLAB MCP at ${this.baseURL}: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new MatlabMcpError("TIMEOUT", `MATLAB MCP request timed out after ${this.timeoutMs}ms`));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Gracefully shut down the MCP server process.
   */
  async shutdown() {
    if (this._child && !this._child.killed) {
      try {
        this._sendNotification("notifications/cancelled", {});
      } catch {
        // ignore
      }
      this._child.kill("SIGTERM");
      this._child = null;
    }
    this._initialized = false;
    this._initPromise = null;
  }
}

function extractJsonObjectText(text = "") {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return "";
  }
  return raw.slice(start, end + 1);
}

function normalizeToolResult(result) {
  if (result && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item.type === "text" && item.text) {
        try {
          return JSON.parse(item.text);
        } catch {
          const embeddedJson = extractJsonObjectText(item.text);
          if (embeddedJson) {
            try {
              return JSON.parse(embeddedJson);
            } catch {
              return item.text;
            }
          }
          return item.text;
        }
      }
    }
  }

  return result;
}

export class MatlabMcpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MatlabMcpError";
    this.code = code;
  }
}
