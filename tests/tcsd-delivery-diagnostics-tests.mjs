import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { config } from "../src/config.js";
import { createHermesApp } from "../src/hermes-app.js";
import { HermesAgentClient } from "../src/services/hermes-agent-client.js";
import {
  UnitTestCaseGenerationService,
  publicUnitTestWorkerProfile
} from "../src/services/unit-test-case-generation-service.js";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function expectCreateFailure(status, body, expected) {
  let receivedCorrelationId = "";
  const server = http.createServer((req, res) => {
    receivedCorrelationId = String(req.headers["x-sdg-correlation-id"] || "");
    req.resume();
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-SDG-Correlation-ID", receivedCorrelationId);
      res.statusCode = status;
      res.end(JSON.stringify(body));
    });
  });
  const port = await listen(server);
  try {
    const client = new HermesAgentClient({
      transport: "api",
      baseURL: `http://127.0.0.1:${port}`,
      authToken: "must-not-appear",
      timeoutMs: 5000
    });
    await assert.rejects(
      client.startTcsdPipelineJob({ taskId: "delivery-test-task" }),
      (error) => {
        assert.equal(error.code, expected.code);
        assert.equal(error.retryable, expected.retryable);
        assert.equal(error.details.httpStatus, status);
        assert.equal(error.details.category, expected.category);
        assert.equal(error.details.remoteCode, expected.remoteCode);
        assert.equal(error.details.correlationId, receivedCorrelationId);
        assert.ok(!JSON.stringify(error.details).includes("must-not-appear"));
        assert.ok(!JSON.stringify(error.details).includes("private-model.slx"));
        return true;
      }
    );
    assert.match(receivedCorrelationId, /^tcsd-[A-Za-z0-9-]+$/);
  } finally {
    await close(server);
  }
}

await expectCreateFailure(
  422,
  {
    error: "private-model.slx rejected at C:/secret/workspace",
    code: "hermes_invalid_upload_manifest",
    details: { path: "C:/secret/workspace/private-model.slx" }
  },
  {
    code: "hermes_invalid_upload_manifest",
    retryable: false,
    category: "request",
    remoteCode: "hermes_invalid_upload_manifest"
  }
);

for (const responseBody of [
  JSON.stringify({ status: "queued" }),
  "x".repeat(300 * 1024)
]) {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.statusCode = 202;
      res.setHeader("Content-Type", "application/json");
      res.end(responseBody);
    });
  });
  const port = await listen(server);
  try {
    const client = new HermesAgentClient({
      transport: "api",
      baseURL: `http://127.0.0.1:${port}`,
      timeoutMs: 5000
    });
    await assert.rejects(
      client.startTcsdPipelineJob({ taskId: "invalid-response-task" }),
      (error) => {
        assert.equal(error.retryable, false);
        assert.ok([
          "tcsd_worker_invalid_response",
          "tcsd_worker_response_too_large"
        ].includes(error.code));
        assert.ok(!JSON.stringify(error).includes("x".repeat(1000)));
        return true;
      }
    );
  } finally {
    await close(server);
  }
}

await expectCreateFailure(
  503,
  { error: "temporary", code: "worker_capacity_exhausted" },
  {
    code: "tcsd_worker_unavailable",
    retryable: true,
    category: "remote-server",
    remoteCode: "worker_capacity_exhausted"
  }
);

const inherited = publicUnitTestWorkerProfile({
  id: "windows-worker",
  authConfigured: { hermes: true, matlabWorker: true }
});
assert.deepEqual(inherited.authConfigured, { hermes: true, matlabWorker: true });

const root = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-delivery-state-"));
const previousUnitTestConfig = config.unitTestCase;
const previousHermesConfig = config.hermes;
const previousTcsdPipelineConfig = config.tcsdPipeline;
const previousSoftwareDetailPipelineConfig = config.softwareDetailPipeline;
config.unitTestCase = {
  ...previousUnitTestConfig,
  taskStoreDir: path.join(root, "tasks"),
  uploadTempDir: path.join(root, "incoming"),
  projectRegistryPath: path.join(root, "projects.json"),
  defaultWorkerId: "windows-worker",
  workerProfiles: [{
    id: "windows-worker",
    label: "Windows Worker",
    hermesTransport: "api",
    hermesBaseURL: "http://worker.invalid:33101",
    hermesApiMode: "upload",
    hermesAuthToken: "inherited-hermes-secret",
    matlabBaseURL: "http://worker.invalid:5100",
    matlabHttpMode: "gateway",
    matlabAuthToken: "inherited-matlab-secret"
  }]
};
config.hermes = {
  ...previousHermesConfig,
  authToken: "worker-api-secret",
  uploadTempDir: path.join(root, "worker-uploads")
};
config.tcsdPipeline = {
  ...previousTcsdPipelineConfig,
  jobStoreDir: path.join(root, "worker-tcsd-jobs")
};
config.softwareDetailPipeline = {
  ...previousSoftwareDetailPipelineConfig,
  jobStoreDir: path.join(root, "worker-software-detail-jobs")
};

const taskId = "delivery-task-1";
const task = {
  id: taskId,
  status: "queued",
  workerPending: true,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  summary: "Authorization: Bearer task-summary-secret private-model-content",
  errorMessage: "TOKEN=task-error-secret private-model-content",
  timeline: [{
    at: "2026-08-05T00:00:00.000Z",
    status: "running",
    message: "API_KEY=timeline-secret private-model-content"
  }],
  workerDelivery: {
    state: "accepted",
    retryable: false,
    workerJobId: "accepted-worker-job",
    acceptedAt: "2026-08-05T00:00:00.000Z"
  },
  inputs: {
    modelSlx: { originalName: "Demo.slx" },
    modelMat: { originalName: "Demo.mat" }
  },
  workspace: {
    directory: path.join(root, "workspace"),
    modelSlxPath: path.join(root, "workspace", "Demo.slx"),
    modelMatPath: path.join(root, "workspace", "Demo.mat"),
    outputDir: path.join(root, "workspace", "outputs")
  },
  workerProfile: publicUnitTestWorkerProfile(config.unitTestCase.workerProfiles[0]),
  pipeline: {
    jobId: "",
    stages: [{
      index: 1,
      name: "初始化",
      status: "failed",
      summary: "Authorization: Bearer stage-summary-secret private-model-content",
      error: {
        code: "safe_stage_code",
        message: "PASSWORD=stage-error-secret private-model-content"
      },
      checkpoint: {
        input: { modelContent: "private-model-content" },
        result: { path: "C:/secret/result.json" },
        toolLogs: [{ token: "must-not-appear" }],
        agent: {
          tokenUsage: {
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
            env: { API_TOKEN: "checkpoint-token-secret" },
            authorization: "Bearer checkpoint-secret"
          }
        },
        validation: { status: "failed", code: "safe_validation_code", summary: "TOKEN=validation-secret private-model-content" },
        artifacts: [{ role: "report", path: "C:/secret/report.json", fileName: "report.json" }]
      }
    }]
  },
  runtimeEvents: [{
    at: "2026-08-05T00:00:00.000Z",
    status: "failed",
    message: "Authorization: Bearer runtime-secret private-model-content",
    tokenUsage: {
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      secret: "runtime-token-secret"
    },
    stdoutExcerpt: "private-model-content",
    stderrExcerpt: "must-not-appear"
  }],
  hermes: {
    warnings: ["API_KEY=warning-secret private-model-content"],
    tokenUsage: {
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      password: "hermes-token-secret"
    }
  }
};

let startCount = 0;
const rejectingClient = {
  async startTcsdPipelineJob() {
    startCount += 1;
    const error = new Error("C:/secret/private-model.slx must not persist");
    error.code = "hermes_invalid_upload_manifest";
    error.retryable = false;
    error.details = {
      operation: "create",
      category: "request",
      retryable: false,
      httpStatus: 422,
      remoteCode: "hermes_invalid_upload_manifest",
      correlationId: "tcsd-safe-correlation"
    };
    throw error;
  }
};

try {
  const capturedLogs = [];
  const previousConsoleInfo = console.info;
  console.info = (...args) => capturedLogs.push(args.join(" "));
  const app = await createHermesApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const correlationId = "tcsd-safe-worker-log";
    const response = await fetch(`http://127.0.0.1:${port}/internal/tcsd-pipeline/jobs`, {
      method: "POST",
      headers: {
        Authorization: "Bearer worker-api-secret",
        "Content-Type": "application/json",
        "X-SDG-Correlation-ID": correlationId
      },
      body: JSON.stringify({
        taskId: "safe-worker-task",
        allowedPaths: ["C:/secret/private-model"],
        inputArtifact: {
          workspaceDir: "C:/secret/private-model",
          modelSlxPath: "C:/secret/private-model/Demo.slx",
          modelMatPath: "C:/secret/private-model/Demo.mat"
        }
      })
    });
    const responseBody = await response.json();
    assert.equal(response.status, 500);
    assert.equal(responseBody.error, "TCSD Worker 内部处理失败。");
    assert.equal(responseBody.correlationId, correlationId);
    assert.ok(!JSON.stringify(responseBody).includes("C:/secret"));
    assert.ok(!JSON.stringify(responseBody).includes("worker-api-secret"));
    assert.ok(capturedLogs.some((line) => line.includes("request_rejected")));
    assert.ok(!capturedLogs.join("\n").includes("C:/secret"));
    assert.ok(!capturedLogs.join("\n").includes("worker-api-secret"));
  } finally {
    console.info = previousConsoleInfo;
    await close(server);
  }

  const service = new UnitTestCaseGenerationService({ hermesAgentClient: rejectingClient });
  await service.saveTask(task);
  const initialPublic = await service.getTask(taskId);
  assert.ok(!JSON.stringify(initialPublic).includes(root));
  assert.ok(!JSON.stringify(initialPublic).includes("private-model-content"));
  assert.ok(!JSON.stringify(initialPublic).includes("must-not-appear"));
  assert.ok(!JSON.stringify(initialPublic).includes("secret"));
  assert.equal(initialPublic.workerDelivery.state, "accepted");
  assert.equal(initialPublic.workerDelivery.category, undefined);
  assert.deepEqual(initialPublic.pipeline.stages[0].checkpoint.agent.tokenUsage, {
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18
  });
  assert.deepEqual(initialPublic.hermes.tokenUsage, {
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30
  });
  assert.deepEqual(initialPublic.runtimeEvents[0].tokenUsage, {
    inputTokens: 3,
    outputTokens: 2,
    totalTokens: 5
  });
  assert.equal(initialPublic.pipeline.stages[0].checkpoint.artifacts[0].fileName, "report.json");
  assert.equal(initialPublic.pipeline.stages[0].checkpoint.artifacts[0].path, undefined);
  const failed = await service.runTask(taskId);
  assert.equal(failed.status, "failed");
  assert.equal(failed.workerPending, false);
  assert.deepEqual(
    {
      state: failed.workerDelivery.state,
      category: failed.workerDelivery.category,
      retryable: failed.workerDelivery.retryable,
      httpStatus: failed.workerDelivery.httpStatus,
      remoteCode: failed.workerDelivery.remoteCode,
      correlationId: failed.workerDelivery.correlationId,
      attemptCount: failed.workerDelivery.attemptCount
    },
    {
      state: "blocked",
      category: "request",
      retryable: false,
      httpStatus: 422,
      remoteCode: "hermes_invalid_upload_manifest",
      correlationId: "tcsd-safe-correlation",
      attemptCount: 1
    }
  );
  const internalAfterFailure = await service.readTask(taskId);
  assert.ok(!String(internalAfterFailure.errorMessage || "").includes("C:/secret/private-model.slx"));
  assert.ok(!JSON.stringify(internalAfterFailure.workerDelivery).includes("C:/secret"));
  assert.ok(!JSON.stringify(await service.getTask(taskId)).includes("inherited-hermes-secret"));

  let releaseRedelivery;
  const redeliveryGate = new Promise((resolve) => {
    releaseRedelivery = resolve;
  });
  service.hermesAgentClient = {
    async startTcsdPipelineJob() {
      startCount += 1;
      await redeliveryGate;
      const error = new Error("temporary network break");
      error.code = "tcsd_worker_unavailable";
      error.retryable = true;
      error.details = {
        operation: "create",
        category: "network",
        retryable: true,
        correlationId: "tcsd-redelivery-correlation"
      };
      throw error;
    }
  };
  const redelivered = await service.redeliverTask(taskId);
  assert.equal(redelivered.status, "queued");
  for (let attempt = 0; attempt < 100 && startCount < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(startCount, 2);
  await assert.rejects(
    service.redeliverTask(taskId),
    (error) => error.code === "unit_test_case_redelivery_in_progress"
  );
  releaseRedelivery();
  await new Promise((resolve) => setTimeout(resolve, 20));
} finally {
  config.unitTestCase = previousUnitTestConfig;
  config.hermes = previousHermesConfig;
  config.tcsdPipeline = previousTcsdPipelineConfig;
  config.softwareDetailPipeline = previousSoftwareDetailPipelineConfig;
  await fs.rm(root, { recursive: true, force: true });
}

const workerSource = await fs.readFile(new URL("../src/hermes-app.js", import.meta.url), "utf8");
assert.match(workerSource, /X-SDG-Correlation-ID/);
assert.match(workerSource, /request_received/);
assert.match(workerSource, /auth_rejected/);
assert.match(workerSource, /request_rejected/);
assert.ok(!workerSource.includes("console.info(req.body)"));

console.log("TCSD delivery diagnostics and redelivery tests passed.");
