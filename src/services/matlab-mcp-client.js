import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
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
    this.httpMode = String(options.httpMode || process.env.MATLAB_MCP_HTTP_MODE || "path").trim().toLowerCase();
    this.authToken = options.authToken || process.env.MATLAB_MCP_AUTH_TOKEN || "";
    this.gatewayMappingId = options.gatewayMappingId || process.env.SATK_GATEWAY_MAPPING_ID || "worker-data";
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

    // Extract text content from MCP tool result
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

  async callTool(toolName, args = {}) {
    if (this.transport === "http" && this.httpMode === "gateway") {
      return this._callToolGateway(toolName, args);
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
      if (this.httpMode === "gateway") {
        return this._analyzeSlxGateway({ absolutePath, originalName, documentType });
      }
      return this._analyzeSlxHttp({ absolutePath, originalName, documentType });
    }

    return this._analyzeSlxStdio({ absolutePath, originalName, documentType });
  }

  /**
   * stdio transport: call analyze_slx tool via JSON-RPC.
   */
  async _analyzeSlxStdio({ absolutePath, documentType }) {
    try {
      const result = await this._callTool("analyze_slx", {
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
    if (this.httpMode === "multipart" || this.httpMode === "upload") {
      return this._analyzeSlxHttpMultipart({ absolutePath, originalName, documentType });
    }

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
            "Content-Length": Buffer.byteLength(body),
            ...this._authHeaders()
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

  async _analyzeSlxHttpMultipart({ absolutePath, originalName, documentType }) {
    const url = new URL("/mcp/tools/analyze_slx", this.baseURL);
    const fileBuffer = await fs.readFile(absolutePath);
    const form = new FormData();
    form.set("documentType", documentType);
    form.set("outputFormat", "model_fact_bundle");
    form.set("slx", new Blob([fileBuffer], { type: "application/octet-stream" }), originalName || path.basename(absolutePath));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: this._authHeaders(),
        body: form,
        signal: controller.signal
      });
      const raw = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new MatlabMcpError("INVALID_RESPONSE", `MATLAB MCP returned non-JSON: ${raw.slice(0, 200)}`);
      }

      if (!res.ok || parsed.error) {
        const code = parsed.error?.code || `HTTP_${res.status}`;
        const message = parsed.error?.message || parsed.message || `MATLAB MCP request failed with status ${res.status}`;
        throw new MatlabMcpError(code, message);
      }

      return parsed.result || parsed;
    } catch (error) {
      if (error instanceof MatlabMcpError) throw error;
      if (error.name === "AbortError") {
        throw new MatlabMcpError("TIMEOUT", `MATLAB MCP request timed out after ${this.timeoutMs}ms`);
      }
      throw new MatlabMcpError("CONNECTION_ERROR", `Cannot connect to MATLAB MCP at ${this.baseURL}: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async _callToolGateway(toolName, args = {}) {
    this._requireGatewayToken();
    const workspaceId = `mcp-${randomUUID()}`;
    const jobId = `tool-${randomUUID()}`;
    const requestArguments = structuredClone(args || {});
    let modelPath = "";
    let modelName = "";
    if (typeof requestArguments.model === "string" && path.isAbsolute(requestArguments.model)) {
      modelPath = requestArguments.model;
      modelName = path.basename(modelPath);
      delete requestArguments.model;
    }
    assertNoAbsolutePathValues(requestArguments);

    await this._gatewayJson(`/api/workspaces/${workspaceId}`, {
      method: "PUT",
      body: { mappingId: this.gatewayMappingId }
    });
    try {
      if (modelPath) {
        await this._gatewayUpload(workspaceId, "model", modelPath, modelName);
      }
      return await this._gatewayRunJob(jobId, {
        workspaceId,
        operation: "call_mcp_tool",
        toolName,
        arguments: requestArguments,
        ...(modelPath ? { modelAssetId: "model" } : {})
      });
    } finally {
      await this._gatewayCleanup(workspaceId);
    }
  }

  async _analyzeSlxGateway({ absolutePath, originalName }) {
    this._requireGatewayToken();
    const workspaceId = `slx-${randomUUID()}`;
    const jobId = `analyze-${randomUUID()}`;
    await this._gatewayJson(`/api/workspaces/${workspaceId}`, {
      method: "PUT",
      body: { mappingId: this.gatewayMappingId }
    });
    try {
      await this._gatewayUpload(
        workspaceId,
        "model",
        absolutePath,
        originalName || path.basename(absolutePath)
      );
      return await this._gatewayRunJob(jobId, {
        workspaceId,
        operation: "analyze_slx",
        inputAssetId: "model"
      });
    } finally {
      await this._gatewayCleanup(workspaceId);
    }
  }

  async _gatewayUpload(workspaceId, assetId, absolutePath, fileName) {
    const fileBuffer = await fs.readFile(absolutePath);
    const form = new FormData();
    form.set("asset", new Blob([fileBuffer], { type: "application/octet-stream" }), fileName);
    return this._gatewayJson(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/upload`,
      { method: "PUT", body: form }
    );
  }

  async _gatewayRunJob(jobId, requestBody) {
    await this._gatewayJson(`/api/jobs/${encodeURIComponent(jobId)}`, {
      method: "POST",
      body: requestBody
    });
    const workspaceId = requestBody.workspaceId;
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const job = await this._gatewayJson(
        `/api/jobs/${encodeURIComponent(jobId)}?workspaceId=${encodeURIComponent(workspaceId)}`
      );
      if (job.status === "succeeded") {
        const artifact = await this._gatewayJson(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/artifacts/${encodeURIComponent(job.artifactId)}`
        );
        return artifact.result;
      }
      if (["failed", "cancelled", "timed_out"].includes(job.status)) {
        throw new MatlabMcpError(
          job.error?.code || "MATLAB_GATEWAY_JOB_FAILED",
          job.error?.message || `MATLAB Gateway job ${job.status}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await this._gatewayJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      body: { workspaceId }
    }).catch(() => {});
    throw new MatlabMcpError("TIMEOUT", `MATLAB Gateway request timed out after ${this.timeoutMs}ms`);
  }

  async _gatewayCleanup(workspaceId) {
    await this._gatewayJson(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "DELETE"
    }).catch(() => {});
  }

  async _gatewayJson(route, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body = options.body instanceof FormData
        ? options.body
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body);
      const response = await fetch(new URL(route, this.baseURL), {
        method: options.method || "GET",
        headers: {
          ...this._authHeaders(),
          ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {})
        },
        body,
        signal: controller.signal
      });
      const raw = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new MatlabMcpError(
          "INVALID_RESPONSE",
          `MATLAB Gateway returned non-JSON with status ${response.status}`
        );
      }
      if (!response.ok || parsed.error) {
        throw new MatlabMcpError(
          parsed.error?.code || `HTTP_${response.status}`,
          parsed.error?.message || `MATLAB Gateway request failed with status ${response.status}`
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof MatlabMcpError) throw error;
      if (error?.name === "AbortError") {
        throw new MatlabMcpError("TIMEOUT", `MATLAB Gateway request timed out after ${this.timeoutMs}ms`);
      }
      throw new MatlabMcpError(
        "CONNECTION_ERROR",
        `Cannot connect to MATLAB Gateway at ${this.baseURL}: ${error.message}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  _requireGatewayToken() {
    if (!String(this.authToken || "").trim()) {
      throw new MatlabMcpError(
        "AUTH_TOKEN_REQUIRED",
        "MATLAB Gateway transport requires a non-empty authentication token."
      );
    }
  }

  _authHeaders() {
    return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
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

function assertNoAbsolutePathValues(value, pointer = "$") {
  if (typeof value === "string") {
    if (path.isAbsolute(value) || /^(?:[A-Za-z]:[\\/]|\\\\|\/\/|~[\\/])/.test(value)) {
      throw new MatlabMcpError(
        "ABSOLUTE_PATH_FORBIDDEN",
        `MATLAB Gateway arguments cannot contain an absolute path (${pointer}).`
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAbsolutePathValues(entry, `${pointer}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoAbsolutePathValues(entry, `${pointer}.${key}`);
    }
  }
}

export class MatlabMcpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MatlabMcpError";
    this.code = code;
  }
}
