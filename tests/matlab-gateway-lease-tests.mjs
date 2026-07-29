import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  MATLAB_GATEWAY_LEASE_SCHEMA,
  validateGatewayLeaseIdentity
} from "../src/services/matlab-gateway-contract.js";
import {
  createMatlabGatewayApp,
  MatlabGatewayService
} from "../src/matlab-gateway-app.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });
const successResult = {
  isError: false,
  content: [{ type: "text", text: "ok" }]
};

async function withGateway(run, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matlab-gateway-lease-"));
  const hostRoot = path.join(root, "host-worker-data");
  await fs.mkdir(hostRoot, { recursive: true });
  const clients = [];
  const service = new MatlabGatewayService({
    rootDir: path.join(root, "state"),
    mappingId: "worker-data",
    containerRoot: "/var/lib/sdg/data",
    hostRoot,
    defaultTimeoutMs: options.defaultTimeoutMs || 2000,
    maxTimeoutMs: options.maxTimeoutMs || 5000,
    createClient: () => {
      const record = {
        index: clients.length,
        calls: [],
        shutdownCount: 0
      };
      const client = options.createClient
        ? options.createClient(record)
        : {
            async callTool(name, args) {
              record.calls.push({ name, args });
              return successResult;
            },
            async shutdown() {
              record.shutdownCount += 1;
            }
          };
      record.client = client;
      clients.push(record);
      return client;
    }
  });
  const app = await createMatlabGatewayApp({
    service,
    authToken: "gateway-test-token",
    evaluateToken: "evaluate-test-token"
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, init = {}) => {
    const response = await fetch(`${baseURL}${route}`, {
      ...init,
      headers: {
        authorization: "Bearer gateway-test-token",
        "x-sdg-evaluate-token": "evaluate-test-token",
        "x-sdg-gateway-caller": "tcsd-runtime",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {})
      }
    });
    const payload = await response.json();
    return { response, payload };
  };
  try {
    await run({ root, hostRoot, clients, service, request, baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await Promise.all(
      [...service.activeLeases.values()]
        .filter((lease) => lease.client)
        .map((lease) => lease.client.shutdown?.().catch(() => {}))
    );
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function createWorkspace(request, workspaceId) {
  const { response } = await request(`/api/workspaces/${workspaceId}`, {
    method: "PUT",
    body: JSON.stringify({ mappingId: "worker-data" })
  });
  assert.equal(response.status, 201);
}

async function createLease(request, workspaceId, leaseId, ownerJobId) {
  return request(`/api/workspaces/${workspaceId}/leases/${leaseId}`, {
    method: "PUT",
    body: JSON.stringify({ ownerJobId })
  });
}

async function putCode(request, workspaceId, assetId, marker = assetId) {
  const { response } = await request(
    `/api/workspaces/${workspaceId}/assets/${assetId}/text`,
    {
      method: "PUT",
      body: JSON.stringify({
        fileName: `${assetId}.m`,
        content: `disp('${marker}');`
      })
    }
  );
  assert.equal(response.status, 201);
}

async function submitEvaluate(
  request,
  { workspaceId, jobId, assetId, leaseId = "", ownerJobId = "", headers = {} }
) {
  return request(`/api/jobs/${jobId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      workspaceId,
      ...(leaseId ? { leaseId, ownerJobId } : {}),
      operation: "evaluate_matlab_code",
      inputAssetId: assetId,
      timeoutMs: 2000
    })
  });
}

async function waitForJob(request, workspaceId, jobId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { payload } = await request(
      `/api/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}`
    );
    if (["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status)) {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Gateway job did not finish: ${jobId}`);
}

async function eventually(predicate, message) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function runProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const [code, signal] = await once(child, "exit");
  return { code, signal, stdout, stderr };
}

test("lease identity contract is explicit and immutable", () => {
  assert.deepEqual(
    validateGatewayLeaseIdentity({
      workspaceId: "workspace-contract",
      leaseId: "lease-contract",
      ownerJobId: "owner-contract"
    }),
    {
      workspaceId: "workspace-contract",
      leaseId: "lease-contract",
      ownerJobId: "owner-contract"
    }
  );
  assert.throws(
    () =>
      validateGatewayLeaseIdentity({
        workspaceId: "workspace-contract",
        leaseId: "../escape",
        ownerJobId: "owner-contract"
      }),
    (error) => error.code === "INVALID_IDENTIFIER"
  );
});

test("one lease reuses one client, serializes jobs, and shuts down only on close", async () => {
  const pendingCalls = [];
  let running = 0;
  let maxRunning = 0;
  await withGateway(
    async ({ clients, request, service }) => {
      const workspaceId = "workspace-serial";
      const leaseId = "lease-serial";
      const ownerJobId = "owner-serial";
      await createWorkspace(request, workspaceId);
      const created = await createLease(request, workspaceId, leaseId, ownerJobId);
      assert.equal(created.response.status, 201);
      assert.equal(created.payload.schema, MATLAB_GATEWAY_LEASE_SCHEMA);
      assert.equal(created.payload.id, leaseId);
      assert.equal(created.payload.leaseId, leaseId);
      assert.equal(created.payload.status, "active");
      assert.equal(clients.length, 1);

      const idempotent = await createLease(request, workspaceId, leaseId, ownerJobId);
      assert.equal(idempotent.response.status, 201);
      assert.equal(idempotent.payload.createdAt, created.payload.createdAt);
      assert.equal(clients.length, 1);

      const health = (await request("/health")).payload;
      const capabilities = (await request("/capabilities")).payload;
      assert.equal(health.activeLeases, 1);
      assert.equal(capabilities.contracts.leases, true);

      await putCode(request, workspaceId, "code-first", "first");
      await putCode(request, workspaceId, "code-second", "second");
      await submitEvaluate(request, {
        workspaceId,
        jobId: "job-first",
        assetId: "code-first",
        leaseId,
        ownerJobId
      });
      await submitEvaluate(request, {
        workspaceId,
        jobId: "job-second",
        assetId: "code-second",
        leaseId,
        ownerJobId
      });
      await eventually(
        () => pendingCalls.length === 1,
        "first leased job did not start"
      );
      assert.equal(maxRunning, 1);

      const activeClose = await request(
        `/api/workspaces/${workspaceId}/leases/${leaseId}`,
        {
          method: "DELETE",
          body: JSON.stringify({ ownerJobId })
        }
      );
      assert.equal(activeClose.response.status, 409);
      assert.equal(activeClose.payload.error.code, "LEASE_ACTIVE");
      const activeCleanup = await request(`/api/workspaces/${workspaceId}`, {
        method: "DELETE"
      });
      assert.equal(activeCleanup.response.status, 409);
      assert.equal(activeCleanup.payload.error.code, "WORKSPACE_LEASE_ACTIVE");

      pendingCalls.shift().resolve(successResult);
      await eventually(
        () => pendingCalls.length === 1,
        "second leased job started before or did not start after the first"
      );
      assert.equal(maxRunning, 1);
      pendingCalls.shift().resolve(successResult);
      const first = await waitForJob(request, workspaceId, "job-first");
      const second = await waitForJob(request, workspaceId, "job-second");
      assert.equal(first.status, "succeeded");
      assert.equal(second.status, "succeeded");
      assert.equal(first.leaseId, leaseId);
      assert.equal(second.ownerJobId, ownerJobId);
      await eventually(
        () => service.activeJobs.size === 0,
        "leased jobs remained active after terminal persistence"
      );
      assert.equal(clients.length, 1);
      assert.equal(clients[0].shutdownCount, 0);

      const closed = await request(
        `/api/workspaces/${workspaceId}/leases/${leaseId}`,
        {
          method: "DELETE",
          body: JSON.stringify({ ownerJobId })
        }
      );
      assert.equal(closed.response.status, 200);
      assert.equal(closed.payload.status, "closed");
      assert.ok(closed.payload.closedAt);
      assert.equal(clients[0].shutdownCount, 1);

      const repeatedClose = await request(
        `/api/workspaces/${workspaceId}/leases/${leaseId}?ownerJobId=${ownerJobId}`,
        { method: "DELETE" }
      );
      assert.equal(repeatedClose.payload.status, "closed");
      assert.equal(clients[0].shutdownCount, 1);
      const readClosed = (
        await request(`/api/workspaces/${workspaceId}/leases/${leaseId}`)
      ).payload;
      assert.equal(readClosed.status, "closed");

      const cleanup = await request(`/api/workspaces/${workspaceId}`, {
        method: "DELETE"
      });
      assert.equal(cleanup.response.status, 200);
      assert.equal(cleanup.payload.removed, true);
      assert.equal((await request("/health")).payload.activeLeases, 0);
    },
    {
      createClient: (record) => ({
        async callTool(name, args) {
          record.calls.push({ name, args });
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          const call = deferred();
          const originalResolve = call.resolve;
          call.resolve = (value) => {
            running -= 1;
            originalResolve(value);
          };
          pendingCalls.push(call);
          return call.promise;
        },
        async shutdown() {
          record.shutdownCount += 1;
        }
      })
    }
  );
});

test("different leases run independently while ordinary jobs retain per-job clients", async () => {
  const pendingCalls = [];
  let leasedRunning = 0;
  let maxLeasedRunning = 0;
  await withGateway(
    async ({ clients, request, service }) => {
      const workspaceId = "workspace-independent";
      await createWorkspace(request, workspaceId);
      await createLease(request, workspaceId, "lease-a", "owner-a");
      await createLease(request, workspaceId, "lease-b", "owner-b");
      assert.equal(clients.length, 2);
      await putCode(request, workspaceId, "code-a", "leased-a");
      await putCode(request, workspaceId, "code-b", "leased-b");
      await submitEvaluate(request, {
        workspaceId,
        jobId: "job-a",
        assetId: "code-a",
        leaseId: "lease-a",
        ownerJobId: "owner-a"
      });
      await submitEvaluate(request, {
        workspaceId,
        jobId: "job-b",
        assetId: "code-b",
        leaseId: "lease-b",
        ownerJobId: "owner-b"
      });
      await eventually(
        () => pendingCalls.length === 2,
        "different leases did not run independently"
      );
      assert.equal(maxLeasedRunning, 2);
      for (const call of pendingCalls.splice(0)) call.resolve(successResult);
      await waitForJob(request, workspaceId, "job-a");
      await waitForJob(request, workspaceId, "job-b");
      await eventually(() => service.activeJobs.size === 0, "leased jobs remained active");
      assert.equal(clients[0].shutdownCount, 0);
      assert.equal(clients[1].shutdownCount, 0);
      await request(`/api/workspaces/${workspaceId}/leases/lease-a`, {
        method: "DELETE",
        body: JSON.stringify({ ownerJobId: "owner-a" })
      });
      await request(`/api/workspaces/${workspaceId}/leases/lease-b`, {
        method: "DELETE",
        body: JSON.stringify({ ownerJobId: "owner-b" })
      });
      assert.equal(clients[0].shutdownCount, 1);
      assert.equal(clients[1].shutdownCount, 1);

      await putCode(request, workspaceId, "code-plain-1", "plain-1");
      await putCode(request, workspaceId, "code-plain-2", "plain-2");
      await submitEvaluate(request, {
        workspaceId,
        jobId: "job-plain-1",
        assetId: "code-plain-1"
      });
      await waitForJob(request, workspaceId, "job-plain-1");
      await submitEvaluate(request, {
        workspaceId,
        jobId: "job-plain-2",
        assetId: "code-plain-2"
      });
      await waitForJob(request, workspaceId, "job-plain-2");
      assert.equal(clients.length, 4);
      assert.equal(clients[2].shutdownCount, 1);
      assert.equal(clients[3].shutdownCount, 1);
    },
    {
      createClient: (record) => ({
        async callTool(name, args) {
          record.calls.push({ name, args });
          if (!String(args.code || "").includes("leased-")) return successResult;
          leasedRunning += 1;
          maxLeasedRunning = Math.max(maxLeasedRunning, leasedRunning);
          const call = deferred();
          const originalResolve = call.resolve;
          call.resolve = (value) => {
            leasedRunning -= 1;
            originalResolve(value);
          };
          pendingCalls.push(call);
          return call.promise;
        },
        async shutdown() {
          record.shutdownCount += 1;
        }
      })
    }
  );
});

test("concurrent lease closes share one shutdown", async () => {
  await withGateway(
    async ({ clients, request }) => {
      const workspaceId = "workspace-concurrent-close";
      const leaseId = "lease-concurrent-close";
      const ownerJobId = "owner-concurrent-close";
      await createWorkspace(request, workspaceId);
      await createLease(request, workspaceId, leaseId, ownerJobId);

      const closeRoute =
        `/api/workspaces/${workspaceId}/leases/${leaseId}`;
      const [first, second] = await Promise.all([
        request(closeRoute, {
          method: "DELETE",
          body: JSON.stringify({ ownerJobId })
        }),
        request(`${closeRoute}?ownerJobId=${ownerJobId}`, {
          method: "DELETE"
        })
      ]);

      assert.equal(first.response.status, 200);
      assert.equal(second.response.status, 200);
      assert.equal(first.payload.status, "closed");
      assert.equal(second.payload.status, "closed");
      assert.equal(first.payload.closedAt, second.payload.closedAt);
      assert.equal(clients.length, 1);
      assert.equal(clients[0].shutdownCount, 1);
    },
    {
      createClient: (record) => ({
        async callTool() {
          return successResult;
        },
        async shutdown() {
          record.shutdownCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      })
    }
  );
});

test("lease owner, workspace, missing, and broken states fail closed", async () => {
  await withGateway(
    async ({ clients, request, service }) => {
      await createWorkspace(request, "workspace-owner");
      await createWorkspace(request, "workspace-other");
      await createLease(request, "workspace-owner", "lease-owner", "owner-good");
      await putCode(request, "workspace-owner", "code-owner", "owner");
      await putCode(request, "workspace-other", "code-other", "other");

      const conflict = await createLease(
        request,
        "workspace-other",
        "lease-owner",
        "owner-good"
      );
      assert.equal(conflict.response.status, 409);
      assert.equal(conflict.payload.error.code, "LEASE_OWNERSHIP_CONFLICT");
      const wrongWorkspace = await request(
        "/api/workspaces/workspace-other/leases/lease-owner"
      );
      assert.equal(wrongWorkspace.response.status, 409);
      assert.equal(wrongWorkspace.payload.error.code, "LEASE_WORKSPACE_MISMATCH");
      const missing = await request(
        "/api/workspaces/workspace-owner/leases/lease-missing"
      );
      assert.equal(missing.response.status, 404);
      assert.equal(missing.payload.error.code, "LEASE_NOT_FOUND");

      const wrongOwner = await submitEvaluate(request, {
        workspaceId: "workspace-owner",
        jobId: "job-wrong-owner",
        assetId: "code-owner",
        leaseId: "lease-owner",
        ownerJobId: "owner-wrong"
      });
      assert.equal(wrongOwner.response.status, 409);
      assert.equal(wrongOwner.payload.error.code, "LEASE_OWNER_MISMATCH");
      const wrongOwnerClose = await request(
        "/api/workspaces/workspace-owner/leases/lease-owner",
        {
          method: "DELETE",
          body: JSON.stringify({ ownerJobId: "owner-wrong" })
        }
      );
      assert.equal(wrongOwnerClose.response.status, 409);
      assert.equal(wrongOwnerClose.payload.error.code, "LEASE_OWNER_MISMATCH");

      service.activeLeases.get("lease-owner").status = "broken";
      const broken = await submitEvaluate(request, {
        workspaceId: "workspace-owner",
        jobId: "job-broken",
        assetId: "code-owner",
        leaseId: "lease-owner",
        ownerJobId: "owner-good"
      });
      assert.equal(broken.response.status, 409);
      assert.equal(broken.payload.error.code, "LEASE_BROKEN");
      assert.equal(clients.length, 1);
      assert.equal(clients[0].shutdownCount, 0);
      const closed = await request(
        "/api/workspaces/workspace-owner/leases/lease-owner",
        {
          method: "DELETE",
          body: JSON.stringify({ ownerJobId: "owner-good" })
        }
      );
      assert.equal(closed.payload.status, "closed");
      assert.equal(clients[0].shutdownCount, 1);

      const restarted = new MatlabGatewayService({
        rootDir: service.rootDir,
        mappingId: "worker-data",
        containerRoot: "/var/lib/sdg/data",
        hostRoot: path.join(service.rootDir, "..", "host-worker-data"),
        createClient: () => {
          throw new Error("restart must not recreate a lease");
        }
      });
      await restarted.initialize();
      await assert.rejects(
        () => restarted.getLease("workspace-owner", "lease-owner"),
        (error) => error.code === "LEASE_NOT_FOUND" && error.statusCode === 404
      );
    }
  );
});

test("lease timeout and cancellation never become success and require explicit close", async () => {
  const calls = [];
  await withGateway(
    async ({ clients, request, service }) => {
      await createWorkspace(request, "workspace-timeout");
      await createLease(request, "workspace-timeout", "lease-timeout", "owner-timeout");
      await putCode(request, "workspace-timeout", "code-timeout", "timeout");
      const submitted = await request("/api/jobs/job-timeout-lease", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-timeout",
          leaseId: "lease-timeout",
          ownerJobId: "owner-timeout",
          operation: "evaluate_matlab_code",
          inputAssetId: "code-timeout",
          timeoutMs: 1000
        })
      });
      assert.equal(submitted.response.status, 202);
      const timedOut = await waitForJob(
        request,
        "workspace-timeout",
        "job-timeout-lease"
      );
      assert.equal(timedOut.status, "timed_out");
      assert.equal(timedOut.error.code, "JOB_TIMEOUT");
      await eventually(() => service.activeJobs.size === 0, "timed-out job remained active");
      const brokenLease = (
        await request("/api/workspaces/workspace-timeout/leases/lease-timeout")
      ).payload;
      assert.equal(brokenLease.status, "broken");
      assert.equal(clients[0].shutdownCount, 0);
      await request("/api/workspaces/workspace-timeout/leases/lease-timeout", {
        method: "DELETE",
        body: JSON.stringify({ ownerJobId: "owner-timeout" })
      });
      assert.equal(clients[0].shutdownCount, 1);

      await createWorkspace(request, "workspace-cancel");
      await createLease(request, "workspace-cancel", "lease-cancel", "owner-cancel");
      await putCode(request, "workspace-cancel", "code-cancel", "cancel");
      await submitEvaluate(request, {
        workspaceId: "workspace-cancel",
        jobId: "job-cancel-lease",
        assetId: "code-cancel",
        leaseId: "lease-cancel",
        ownerJobId: "owner-cancel"
      });
      await eventually(() => calls.length === 2, "leased cancellation job did not start");
      const cancelled = await request("/api/jobs/job-cancel-lease/cancel", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "workspace-cancel" })
      });
      assert.equal(cancelled.payload.status, "cancelled");
      const activeClose = await request(
        "/api/workspaces/workspace-cancel/leases/lease-cancel",
        {
          method: "DELETE",
          body: JSON.stringify({ ownerJobId: "owner-cancel" })
        }
      );
      assert.equal(activeClose.response.status, 409);
      assert.equal(activeClose.payload.error.code, "LEASE_ACTIVE");
      calls[1].resolve(successResult);
      await eventually(() => service.activeJobs.size === 0, "cancelled job remained active");
      const durable = (
        await request("/api/jobs/job-cancel-lease?workspaceId=workspace-cancel")
      ).payload;
      assert.equal(durable.status, "cancelled");
      assert.equal(durable.artifactId, "");
      assert.equal(
        (
          await request("/api/workspaces/workspace-cancel/leases/lease-cancel")
        ).payload.status,
        "broken"
      );
      await request("/api/workspaces/workspace-cancel/leases/lease-cancel", {
        method: "DELETE",
        body: JSON.stringify({ ownerJobId: "owner-cancel" })
      });
      assert.equal(clients[1].shutdownCount, 1);
    },
    {
      createClient: (record) => ({
        async callTool(name, args) {
          record.calls.push({ name, args });
          const call = deferred();
          calls.push(call);
          return call.promise;
        },
        async shutdown() {
          record.shutdownCount += 1;
        }
      })
    }
  );
});

test("evaluate caller allows software-detail-runtime and rejects other callers", async () => {
  await withGateway(async ({ clients, request }) => {
    await createWorkspace(request, "workspace-caller");
    await putCode(request, "workspace-caller", "code-caller", "caller");
    const allowed = await submitEvaluate(request, {
      workspaceId: "workspace-caller",
      jobId: "job-software-detail-caller",
      assetId: "code-caller",
      headers: {
        "x-sdg-gateway-caller": "software-detail-runtime"
      }
    });
    assert.equal(allowed.response.status, 202);
    assert.equal(
      (await waitForJob(request, "workspace-caller", "job-software-detail-caller")).status,
      "succeeded"
    );
    const denied = await submitEvaluate(request, {
      workspaceId: "workspace-caller",
      jobId: "job-unknown-caller",
      assetId: "code-caller",
      headers: {
        "x-sdg-gateway-caller": "unknown-runtime"
      }
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.payload.error.code, "EVALUATE_NOT_AUTHORIZED");
    assert.equal(clients.length, 1);
  });
});

test("lease helper validates arguments and completes an authenticated leased job", async () => {
  await withGateway(async ({ root, request, baseURL }) => {
    const helper = path.resolve(
      "skills/hermes/software-detail-runtime/scripts/matlab_gateway_lease.py"
    );
    const python = process.env.PYTHON || "python3";
    const help = await runProcess(python, [helper, "--help"]);
    assert.equal(help.code, 0, help.stderr);
    assert.match(help.stdout, /--workspace-id/);
    const invalid = await runProcess(python, [helper, "--workspace-id", "only"]);
    assert.equal(invalid.code, 2);

    await createWorkspace(request, "workspace-helper");
    await createLease(request, "workspace-helper", "lease-helper", "owner-helper");
    const codeFile = path.join(root, "helper-code.m");
    await fs.writeFile(codeFile, "disp('/var/lib/sdg/data/helper');\n", "utf8");
    const result = await runProcess(
      python,
      [
        helper,
        "--workspace-id",
        "workspace-helper",
        "--lease-id",
        "lease-helper",
        "--owner-job-id",
        "owner-helper",
        "--code-file",
        codeFile,
        "--timeout-seconds",
        "3",
        "--poll-interval-seconds",
        "0.01"
      ],
      {
        env: {
          ...process.env,
          SATK_GATEWAY_URL: baseURL,
          MATLAB_MCP_AUTH_TOKEN: "gateway-test-token",
          MATLAB_GATEWAY_EVALUATE_TOKEN: "evaluate-test-token"
        }
      }
    );
    assert.equal(result.code, 0, result.stderr);
    const artifact = JSON.parse(result.stdout);
    assert.equal(artifact.schema, "matlab-gateway-artifact/v1");
    assert.equal(artifact.result.isError, false);
    for (const secret of [
      "gateway-test-token",
      "evaluate-test-token"
    ]) {
      assert.equal(result.stdout.includes(secret), false);
      assert.equal(result.stderr.includes(secret), false);
    }
  });
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
