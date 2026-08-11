import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  mapContainerWorkspaceCode,
  rejectAbsolutePathFields,
  requireGatewayIdentifier
} from "../src/services/matlab-gateway-contract.js";
import {
  createMatlabGatewayApp,
  deriveLocalMatlabMcpServerArgs,
  MatlabGatewayService
} from "../src/matlab-gateway-app.js";
import { MatlabMcpClient } from "../src/services/matlab-mcp-client.js";
import { createEmptyModelFactBundle } from "../src/services/model-fact-bundle.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

test("local MATLAB Gateway derives nodesktop and preserves explicit overrides", async () => {
  const derived = deriveLocalMatlabMcpServerArgs({
    platform: "darwin",
    environment: {
      MATLAB_ROOT: "/Applications/MATLAB_R2026a.app",
      SIMULINK_AGENTIC_TOOLKIT_TOOLS_FILE: "/tmp/satk-tools.json"
    }
  });
  assert.ok(derived.includes("--matlab-session-mode=new"));
  assert.ok(derived.includes("--matlab-display-mode=nodesktop"));
  assert.ok(derived.includes("--matlab-root=/Applications/MATLAB_R2026a.app"));

  const explicitDisplay = deriveLocalMatlabMcpServerArgs({
    environment: {
      SATK_MATLAB_SESSION_MODE: "new",
      SATK_MATLAB_DISPLAY_MODE: "nodesktop"
    },
    matlabDisplayMode: "desktop"
  });
  assert.ok(explicitDisplay.includes("--matlab-display-mode=desktop"));
  assert.ok(!explicitDisplay.includes("--matlab-display-mode=nodesktop"));

  const explicitArgs = ["--matlab-session-mode=existing", "--matlab-display-mode=desktop"];
  assert.deepEqual(
    deriveLocalMatlabMcpServerArgs({
      environment: { SATK_MATLAB_DISPLAY_MODE: "nodesktop" },
      serverArgs: explicitArgs
    }),
    explicitArgs
  );

  const unchangedOtherPlatformDefault = deriveLocalMatlabMcpServerArgs({
    platform: "linux",
    environment: {
      SIMULINK_AGENTIC_TOOLKIT_TOOLS_FILE: "/tmp/satk-tools.json"
    }
  });
  assert.ok(unchangedOtherPlatformDefault.includes("--matlab-session-mode=existing"));
  assert.ok(!unchangedOtherPlatformDefault.some((item) => item.startsWith("--matlab-display-mode=")));
  assert.ok(!unchangedOtherPlatformDefault.some((item) => item.startsWith("--matlab-root=")));
});

async function withGateway(run, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-gateway-contract-"));
  const hostRoot = path.join(root, "host-worker-data");
  await fs.mkdir(hostRoot, { recursive: true });
  const calls = [];
  const service = new MatlabGatewayService({
    rootDir: path.join(root, "state"),
    mappingId: "worker-data",
    containerRoot: "/var/lib/sdg/data",
    hostRoot,
    defaultTimeoutMs: options.defaultTimeoutMs || 2000,
    maxTimeoutMs: options.maxTimeoutMs || 5000,
    ...(options.mcpTimeoutHeadroomMs != null
      ? { mcpTimeoutHeadroomMs: options.mcpTimeoutHeadroomMs }
      : {}),
    createClient: () => ({
      async callTool(name, args, callOptions) {
        calls.push({ name, args, options: callOptions || {} });
        if (options.callTool) return options.callTool(name, args);
        return { isError: false, content: [{ type: "text", text: "ok" }] };
      },
      async analyzeSlx(args, callOptions) {
        calls.push({ name: "analyze_slx", args, options: callOptions || {} });
        if (options.analyzeSlx) return options.analyzeSlx(args);
        throw new Error("analyzeSlx was not expected");
      },
      async shutdown() {}
    })
  });
  const app = await createMatlabGatewayApp({
    service,
    authToken: "test-token",
    evaluateToken: "test-evaluate-token"
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, init = {}) => {
    const response = await fetch(`${baseURL}${route}`, {
      ...init,
      headers: {
        authorization: "Bearer test-token",
        "x-sdg-evaluate-token": "test-evaluate-token",
        "x-sdg-gateway-caller": "tcsd-runtime",
        ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
        ...(init.headers || {})
      }
    });
    const payload = await response.json();
    return { response, payload };
  };
  try {
    await run({ root, hostRoot, calls, service, request, baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function waitForJob(request, jobId, workspaceId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { payload } = await request(
      `/api/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}`
    );
    if (["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status)) return payload;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("job did not reach terminal state");
}

async function writeFakeMcpServer(root) {
  const scriptPath = path.join(root, "fake-matlab-mcp.mjs");
  await fs.writeFile(
    scriptPath,
    [
      "import fs from 'node:fs';",
      "import readline from 'node:readline';",
      "const mode = process.argv[2] || 'success';",
      "if (process.env.FAKE_ARGS_FILE) fs.writeFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify(process.argv.slice(2)));",
      "if (mode === 'exit') {",
      "  process.stderr.write(`API_KEY=${process.env.FAKE_SECRET}\\n/Users/private-user/project/model.slx\\nfailed to attach to MATLAB session\\n`);",
      "  process.exit(1);",
      "}",
      "const lines = readline.createInterface({ input: process.stdin });",
      "lines.on('line', (line) => {",
      "  const message = JSON.parse(line);",
      "  if (message.method === 'initialize') {",
      "    if (mode === 'init-error') {",
      "      process.stderr.write('initialization transport unavailable\\n');",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: 'INIT_FAILED', message: 'initialize failed' } }) + '\\n');",
      "    } else {",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } }) + '\\n');",
      "    }",
      "  } else if (message.method === 'tools/call') {",
      "    const result = mode === 'tool-error'",
      "      ? { isError: true, content: [{ type: 'text', text: 'failed to attach to MATLAB session' }] }",
      "      : { isError: false, content: [{ type: 'text', text: 'ok' }] };",
      "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n');",
      "  }",
      "});"
    ].join("\n"),
    "utf8"
  );
  return scriptPath;
}

test("contract rejects arbitrary identifiers and absolute request paths", () => {
  assert.throws(() => requireGatewayIdentifier("../escape", "workspaceId"), /workspaceId/);
  assert.throws(
    () => rejectAbsolutePathFields({ filePath: "C:\\private\\model.slx" }),
    (error) => error.code === "ABSOLUTE_PATH_FORBIDDEN"
  );
  assert.throws(
    () => rejectAbsolutePathFields({ filePath: "/Users/example/model.slx" }),
    (error) => error.code === "ABSOLUTE_PATH_FORBIDDEN"
  );
});

test("MATLAB code mapping accepts only the configured virtual root", () => {
  const mapped = mapContainerWorkspaceCode(
    "rootDir='/var/lib/sdg/data/jobs/job-1'; fid=fopen(rootDir,'r');",
    {
      id: "worker-data",
      virtualRoot: "/var/lib/sdg/data",
      hostRoot: "/private/tmp/sdg-data"
    }
  );
  assert.match(mapped.code, /\/private\/tmp\/sdg-data\/jobs\/job-1/);
  assert.throws(
    () =>
      mapContainerWorkspaceCode("load('/Users/example/private.mat');", {
        id: "worker-data",
        virtualRoot: "/var/lib/sdg/data",
        hostRoot: "/private/tmp/sdg-data"
      }),
    (error) => error.code === "UNMAPPED_ABSOLUTE_PATH"
  );
  assert.throws(
    () =>
      mapContainerWorkspaceCode("x=a'; system('/bin/sh');", {
        id: "worker-data",
        virtualRoot: "/var/lib/sdg/data",
        hostRoot: "/private/tmp/sdg-data"
      }),
    (error) =>
      error.code === "MATLAB_PRIMITIVE_FORBIDDEN" ||
      error.code === "UNMAPPED_ABSOLUTE_PATH"
  );
});

test("Gateway requires separate non-empty API and evaluate tokens", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-gateway-auth-"));
  const hostRoot = path.join(root, "host");
  await fs.mkdir(hostRoot, { recursive: true });
  const service = new MatlabGatewayService({
    rootDir: path.join(root, "state"),
    hostRoot,
    createClient: () => ({ async shutdown() {} })
  });
  try {
    await assert.rejects(
      () =>
        createMatlabGatewayApp({
          service,
          authToken: "",
          evaluateToken: "",
          requireAuthToken: true,
          requireEvaluateToken: true
        }),
      (error) => error.code === "AUTH_TOKEN_REQUIRED"
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("stdio client preserves a bounded redacted stderr diagnostic tail", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-mcp-stderr-"));
  const fakeServer = await writeFakeMcpServer(root);
  const tempDir = path.join(root, "temp");
  const logFolder = path.join(root, "logs");
  const secret = "secret-diagnostic-sentinel";
  const client = new MatlabMcpClient({
    transport: "stdio",
    serverCommand: process.execPath,
    serverArgs: [fakeServer, "exit"],
    serverEnv: { FAKE_SECRET: secret },
    tempDir,
    logFolder,
    timeoutMs: 2000
  });
  try {
    await assert.rejects(
      () => client.callTool("evaluate_matlab_code", { code: "disp(1);" }),
      (error) => {
        assert.equal(error.code, "PROCESS_EXIT");
        assert.equal(error.details.category, "process_exit");
        assert.match(error.details.stderrSummary, /failed to attach to MATLAB session/);
        assert.doesNotMatch(error.details.stderrSummary, new RegExp(secret));
        assert.doesNotMatch(error.details.stderrSummary, /private-user|model\.slx/);
        assert.ok(Buffer.byteLength(error.details.stderrSummary) <= 8192);
        return true;
      }
    );
    assert.equal((await fs.stat(tempDir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(logFolder)).mode & 0o777, 0o700);
  } finally {
    await client.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("stdio initialization failures include a safe diagnostic category", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-mcp-init-"));
  const fakeServer = await writeFakeMcpServer(root);
  const client = new MatlabMcpClient({
    transport: "stdio",
    serverCommand: process.execPath,
    serverArgs: [fakeServer, "init-error"],
    tempDir: path.join(root, "temp"),
    timeoutMs: 2000
  });
  try {
    await assert.rejects(
      () => client.callTool("evaluate_matlab_code", { code: "disp(1);" }),
      (error) => {
        assert.equal(error.code, "INIT_FAILED");
        assert.equal(error.details.phase, "initialize");
        assert.match(error.details.stderrSummary, /initialization transport unavailable/);
        return true;
      }
    );
  } finally {
    await client.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Gateway MCP preflight performs initialize and evaluate before serving", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-mcp-preflight-"));
  const fakeServer = await writeFakeMcpServer(root);
  const argsFile = path.join(root, "args.json");
  const previousArgsFile = process.env.FAKE_ARGS_FILE;
  process.env.FAKE_ARGS_FILE = argsFile;
  const service = new MatlabGatewayService({
    rootDir: path.join(root, "state"),
    hostRoot: path.join(root, "host"),
    platform: "darwin",
    serverCommand: process.execPath,
    serverArgs: [fakeServer, "success"],
    mcpTempDir: path.join(root, "temp"),
    mcpLogFolder: path.join(root, "safe-logs"),
    mcpTimeoutMs: 2000
  });
  try {
    await fs.mkdir(path.join(root, "host"), { recursive: true });
    await service.initialize();
    assert.deepEqual(await service.preflight(), {
      ok: true,
      category: "mcp_initialize_and_evaluate"
    });
    const args = JSON.parse(await fs.readFile(argsFile, "utf8"));
    assert.ok(args.includes(`--log-folder=${path.join(root, "safe-logs")}`));

    const windowsArgsFile = path.join(root, "windows-args.json");
    process.env.FAKE_ARGS_FILE = windowsArgsFile;
    const windowsService = new MatlabGatewayService({
      rootDir: path.join(root, "windows-state"),
      hostRoot: path.join(root, "host"),
      platform: "win32",
      serverCommand: process.execPath,
      serverArgs: [fakeServer, "success"],
      mcpTempDir: path.join(root, "windows-temp"),
      mcpTimeoutMs: 2000
    });
    await windowsService.initialize();
    await windowsService.preflight();
    const windowsArgs = JSON.parse(await fs.readFile(windowsArgsFile, "utf8"));
    assert.ok(!windowsArgs.some((argument) => String(argument).startsWith("--log-folder")));

    const failingService = new MatlabGatewayService({
      rootDir: path.join(root, "failing-state"),
      hostRoot: path.join(root, "host"),
      platform: "darwin",
      serverCommand: process.execPath,
      serverArgs: [fakeServer, "tool-error"],
      mcpTempDir: path.join(root, "failing-temp"),
      mcpLogFolder: path.join(root, "failing-logs"),
      mcpTimeoutMs: 2000
    });
    await failingService.initialize();
    await assert.rejects(
      () => failingService.preflight(),
      (error) =>
        error.code === "MCP_TOOL_REPORTED_FAILURE" &&
        error.details?.category === "tool_reported_failure"
    );
  } finally {
    if (previousArgsFile === undefined) delete process.env.FAKE_ARGS_FILE;
    else process.env.FAKE_ARGS_FILE = previousArgsFile;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Gateway MCP preflight times out with a bounded actionable failure", async () => {
  let shutdownCalled = false;
  const service = new MatlabGatewayService({
    rootDir: path.join(os.tmpdir(), "matlab-mcp-bounded-preflight-state"),
    hostRoot: path.join(os.tmpdir(), "matlab-mcp-bounded-preflight-host"),
    preflightTimeoutMs: 50,
    createClient: () => ({
      async callTool() {
        return new Promise(() => {});
      },
      async shutdown() {
        shutdownCalled = true;
      }
    })
  });
  const startedAt = Date.now();
  await assert.rejects(
    () => service.preflight(),
    (error) =>
      error.code === "MCP_PREFLIGHT_TIMEOUT" &&
      error.details?.category === "mcp_preflight_timeout"
  );
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(shutdownCalled, true);
});

test("Gateway preflight-only startup fails with a redacted actionable diagnostic", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-mcp-startup-failure-"));
  const fakeServer = await writeFakeMcpServer(root);
  const hostRoot = path.join(root, "host");
  const secret = "startup-secret-sentinel";
  await fs.mkdir(hostRoot, { recursive: true });
  try {
    const result = spawnSync(
      process.execPath,
      ["src/matlab-worker-server.js", "--preflight-only"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          MATLAB_GATEWAY_TOKEN: "gateway-test-placeholder",
          MATLAB_GATEWAY_EVALUATE_TOKEN: "evaluate-test-placeholder",
          MATLAB_GATEWAY_STATE_DIR: path.join(root, "state"),
          MATLAB_GATEWAY_HOST_ROOT: hostRoot,
          MATLAB_MCP_TMPDIR: path.join(root, "temp"),
          MATLAB_MCP_LOG_FOLDER: path.join(root, "logs"),
          MATLAB_MCP_SERVER_COMMAND: process.execPath,
          MATLAB_MCP_SERVER_ARGS_JSON: JSON.stringify([fakeServer, "exit"]),
          MATLAB_GATEWAY_MCP_PREFLIGHT: "0",
          FAKE_SECRET: secret
        }
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /\[process_exit\]/);
    assert.match(result.stderr, /failed to attach to MATLAB session/);
    assert.doesNotMatch(result.stderr, new RegExp(secret));
    assert.doesNotMatch(result.stderr, /private-user|model\.slx/);
    assert.doesNotMatch(result.stderr, /at file:|matlab-worker-server\.js:\d+/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Gateway treats resolved MCP failure text as a failed job", async () => {
  await withGateway(
    async ({ request }) => {
      const workspaceId = "workspace-tool-failure";
      await request(`/api/workspaces/${workspaceId}`, {
        method: "PUT",
        body: JSON.stringify({ mappingId: "worker-data" })
      });
      await request(`/api/workspaces/${workspaceId}/assets/code/text`, {
        method: "PUT",
        body: JSON.stringify({
          fileName: "failure.m",
          content: "disp('/var/lib/sdg/data/failure');"
        })
      });
      await request("/api/jobs/job-tool-failure", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          operation: "evaluate_matlab_code",
          inputAssetId: "code"
        })
      });
      const job = await waitForJob(request, "job-tool-failure", workspaceId);
      assert.equal(job.status, "failed");
      assert.equal(job.error.code, "MCP_TOOL_REPORTED_FAILURE");
      assert.equal(job.error.details.category, "tool_reported_failure");
      assert.match(job.error.details.stderrSummary, /failed to attach to MATLAB session/);
      assert.equal(job.artifactId, "");
    },
    {
      callTool: () => "failed to attach to MATLAB session"
    }
  );
});

test("Gateway rejects MATLAB Chinese error stacks after initialization output", async () => {
  await withGateway(
    async ({ request }) => {
      const workspaceId = "workspace-matlab-chinese-failure";
      await request(`/api/workspaces/${workspaceId}`, {
        method: "PUT",
        body: JSON.stringify({ mappingId: "worker-data" })
      });
      await request(`/api/workspaces/${workspaceId}/assets/code/text`, {
        method: "PUT",
        body: JSON.stringify({
          fileName: "failure.m",
          content: "disp('/var/lib/sdg/data/failure');"
        })
      });
      await request("/api/jobs/job-matlab-chinese-failure", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          operation: "evaluate_matlab_code",
          inputAssetId: "code"
        })
      });
      const job = await waitForJob(request, "job-matlab-chinese-failure", workspaceId);
      assert.equal(job.status, "failed");
      assert.equal(job.error.code, "MCP_TOOL_REPORTED_FAILURE");
      assert.equal(job.error.details.category, "tool_reported_failure");
      assert.match(job.error.details.stderrSummary, /错误使用/);
    },
    {
      callTool: () => [
        "TCSD_PROJECT_INIT_SCRIPTS_EXECUTED=init_Global.m",
        "错误使用 compiled_input_metadata (第 707 行)",
        "变量 'MissingCalibration_C' 不存在。"
      ].join("\n")
    }
  );
});

test("HTTP gateway client uses ID-only analyze and allowlisted tool jobs without stdio fallback", async () => {
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "demo.slx", modelName: "Demo" };
  await withGateway(
    async ({ root, calls, baseURL }) => {
      const modelPath = path.join(root, "demo.slx");
      await fs.writeFile(modelPath, "fake-slx");
      const client = new MatlabMcpClient({
        transport: "http",
        httpMode: "gateway",
        baseURL,
        authToken: "test-token",
        serverCommand: "/must-not-start"
      });
      const analyzed = await client.analyzeSlx({
        absolutePath: modelPath,
        originalName: "demo.slx"
      });
      assert.equal(analyzed.source.modelName, "Demo");
      const overview = await client.callTool("model_overview", {
        model: modelPath,
        scope: "root",
        detail: "full"
      });
      assert.equal(overview.tool, "model_overview");
      const toolCall = calls.find((entry) => entry.name === "model_overview");
      assert.ok(toolCall, "Gateway must execute the allowlisted MCP tool");
      assert.notEqual(toolCall.args.model, modelPath);
      assert.match(toolCall.args.model, /asset-data/);
      assert.equal(client._child, null, "Gateway mode must not spawn the stdio server");
    },
    {
      analyzeSlx: () => bundle,
      callTool: (name) => ({ tool: name, ok: true })
    }
  );
});

test("Gateway rejects non-allowlisted generic MCP tools", async () => {
  await withGateway(async ({ request }) => {
    await request("/api/workspaces/tool-denied", {
      method: "PUT",
      body: JSON.stringify({ mappingId: "worker-data" })
    });
    const { response, payload } = await request("/api/jobs/tool-denied", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "tool-denied",
        operation: "call_mcp_tool",
        toolName: "evaluate_matlab_code",
        arguments: {},
        modelAssetId: "model"
      })
    });
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "MCP_TOOL_FORBIDDEN");
  });
});

test("Gateway exposes metadata and runs ID-only evaluate/artifact/cleanup flow", async () => {
  await withGateway(async ({ hostRoot, calls, request }) => {
    const health = await fetch((await request("/health")).response.url).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.schema, "matlab-gateway-health/v1");
    assert.equal(health.version, "1.0.0");
    assert.equal((await request("/version")).payload.gatewayVersion, "1.0.0");
    const capabilities = (await request("/capabilities")).payload;
    assert.equal(capabilities.contracts.absolutePathRequests, false);
    assert.deepEqual(capabilities.contracts.preconfiguredMappingIds, ["worker-data"]);

    const workspaceId = "workspace-1";
    assert.equal(
      (
        await request(`/api/workspaces/${workspaceId}`, {
          method: "PUT",
          body: JSON.stringify({ mappingId: "worker-data" })
        })
      ).response.status,
      201
    );
    await request(`/api/workspaces/${workspaceId}/assets/code-1/text`, {
      method: "PUT",
      body: JSON.stringify({
        fileName: "stage03.m",
        content: "fid=fopen('/var/lib/sdg/data/jobs/workspace-1/result.json','w'); fclose(fid);"
      })
    });
    await request("/api/jobs/job-1", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        operation: "evaluate_matlab_code",
        inputAssetId: "code-1",
        timeoutMs: 1000
      })
    });
    const job = await waitForJob(request, "job-1", workspaceId);
    assert.equal(job.status, "succeeded");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "evaluate_matlab_code");
    assert.match(calls[0].args.code, new RegExp(hostRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(calls[0].args.code, /\/var\/lib\/sdg\/data/);
    const artifact = (
      await request(`/api/workspaces/${workspaceId}/artifacts/${job.artifactId}`)
    ).payload;
    assert.equal(artifact.jobId, "job-1");
    assert.equal(artifact.result.isError, false);
    assert.equal(
      (
        await request(`/api/jobs/job-1?workspaceId=${workspaceId}`, {
          method: "DELETE"
        })
      ).payload.removed,
      true
    );
    assert.equal(
      (
        await request(`/api/workspaces/${workspaceId}`, {
          method: "DELETE"
        })
      ).payload.removed,
      true
    );
  });
});

test("Gateway rejects legacy filePath mode before MATLAB execution", async () => {
  await withGateway(async ({ calls, request }) => {
    const form = new FormData();
    form.set("filePath", "/Users/example/model.slx");
    const { response, payload } = await request("/mcp/tools/analyze_slx", {
      method: "POST",
      body: form
    });
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "ABSOLUTE_PATH_FORBIDDEN");
    assert.equal(calls.length, 0);
  });
});

test("Gateway cancellation produces a durable cancelled terminal state", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await withGateway(
    async ({ request }) => {
      await request("/api/workspaces/workspace-cancel", {
        method: "PUT",
        body: JSON.stringify({ mappingId: "worker-data" })
      });
      await request("/api/workspaces/workspace-cancel/assets/code-cancel/text", {
        method: "PUT",
        body: JSON.stringify({
          fileName: "cancel.m",
          content: "disp('/var/lib/sdg/data/cancel');"
        })
      });
      await request("/api/jobs/job-cancel", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-cancel",
          operation: "evaluate_matlab_code",
          inputAssetId: "code-cancel"
        })
      });
      const cancelled = (
        await request("/api/jobs/job-cancel/cancel", {
          method: "POST",
          body: JSON.stringify({ workspaceId: "workspace-cancel" })
        })
      ).payload;
      assert.equal(cancelled.status, "cancelled");
      release({ isError: false });
      const durable = (
        await request("/api/jobs/job-cancel?workspaceId=workspace-cancel")
      ).payload;
      assert.equal(durable.status, "cancelled");
    },
    {
      callTool: () => pending
    }
  );
});

test("Gateway timeout produces a durable timed_out terminal state", async () => {
  await withGateway(
    async ({ request }) => {
      await request("/api/workspaces/workspace-timeout", {
        method: "PUT",
        body: JSON.stringify({ mappingId: "worker-data" })
      });
      await request("/api/workspaces/workspace-timeout/assets/code-timeout/text", {
        method: "PUT",
        body: JSON.stringify({
          fileName: "timeout.m",
          content: "disp('/var/lib/sdg/data/timeout');"
        })
      });
      await request("/api/jobs/job-timeout", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-timeout",
          operation: "evaluate_matlab_code",
          inputAssetId: "code-timeout",
          timeoutMs: 1000
        })
      });
      const job = await waitForJob(request, "job-timeout", "workspace-timeout");
      assert.equal(job.status, "timed_out");
      assert.equal(job.error.code, "JOB_TIMEOUT");
    },
    {
      callTool: () => new Promise(() => {})
    }
  );
});

test("evaluate jobs align the MATLAB MCP request timeout with job.timeoutMs plus headroom", async () => {
  await withGateway(
    async ({ calls, request }) => {
      await request("/api/workspaces/workspace-mcp-timeout", {
        method: "PUT",
        body: JSON.stringify({ mappingId: "worker-data" })
      });
      await request("/api/workspaces/workspace-mcp-timeout/assets/code-mcp-timeout/text", {
        method: "PUT",
        body: JSON.stringify({
          fileName: "probe.m",
          content: "disp(1);"
        })
      });
      await request("/api/jobs/job-mcp-timeout", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-mcp-timeout",
          operation: "evaluate_matlab_code",
          inputAssetId: "code-mcp-timeout",
          timeoutMs: 3000
        })
      });
      const job = await waitForJob(request, "job-mcp-timeout", "workspace-mcp-timeout");
      assert.equal(job.status, "succeeded");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, "evaluate_matlab_code");
      assert.equal(calls[0].options.timeoutMs, 3000 + 90000);
    },
    {
      mcpTimeoutHeadroomMs: 90000,
      callTool: () => ({ isError: false, content: [{ type: "text", text: "ok" }] })
    }
  );
});

test("analyze_slx jobs align the MATLAB MCP request timeout with job.timeoutMs plus headroom", async () => {
  const bundle = createEmptyModelFactBundle();
  bundle.source = { fileName: "demo.slx", modelName: "Demo" };
  await withGateway(
    async ({ calls, request }) => {
      await request("/api/workspaces/workspace-slx-timeout", {
        method: "PUT",
        body: JSON.stringify({ mappingId: "worker-data" })
      });
      const form = new FormData();
      form.append("asset", new Blob(["fake-slx"]), "demo.slx");
      await request("/api/workspaces/workspace-slx-timeout/assets/model-slx-timeout/upload", {
        method: "PUT",
        body: form
      });
      await request("/api/jobs/job-slx-timeout", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-slx-timeout",
          operation: "analyze_slx",
          inputAssetId: "model-slx-timeout",
          timeoutMs: 3000
        })
      });
      const job = await waitForJob(request, "job-slx-timeout", "workspace-slx-timeout");
      assert.equal(job.status, "succeeded");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, "analyze_slx");
      assert.equal(calls[0].options.timeoutMs, 3000 + 60000);
    },
    {
      analyzeSlx: () => bundle
    }
  );
});

let failures = 0;
for (const entry of tests) {
  try {
    await entry.run();
    console.log(`✓ ${entry.name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${entry.name}`);
    console.error(error);
  }
}
if (failures) process.exitCode = 1;
