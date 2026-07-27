import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { once } from "node:events";
import {
  mapContainerWorkspaceCode,
  rejectAbsolutePathFields,
  requireGatewayIdentifier
} from "../src/services/matlab-gateway-contract.js";
import { createMatlabGatewayApp, MatlabGatewayService } from "../src/matlab-gateway-app.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

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
    createClient: () => ({
      async callTool(name, args) {
        calls.push({ name, args });
        if (options.callTool) return options.callTool(name, args);
        return { isError: false, content: [{ type: "text", text: "ok" }] };
      },
      async analyzeSlx() {
        throw new Error("analyzeSlx was not expected");
      },
      async shutdown() {}
    })
  });
  const app = await createMatlabGatewayApp({ service, authToken: "test-token" });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, init = {}) => {
    const response = await fetch(`${baseURL}${route}`, {
      ...init,
      headers: {
        authorization: "Bearer test-token",
        ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
        ...(init.headers || {})
      }
    });
    const payload = await response.json();
    return { response, payload };
  };
  try {
    await run({ root, hostRoot, calls, service, request });
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
});

test("Gateway exposes metadata and runs ID-only evaluate/artifact/cleanup flow", async () => {
  await withGateway(async ({ hostRoot, calls, request }) => {
    const health = await fetch((await request("/health")).response.url).then((response) => response.json());
    assert.equal(health.ok, true);
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
