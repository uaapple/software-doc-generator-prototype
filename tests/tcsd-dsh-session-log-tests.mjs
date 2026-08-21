import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../src/config.js";
import { createApp } from "../src/app.js";
import { createHermesApp } from "../src/hermes-app.js";
import { HermesAgentClient } from "../src/services/hermes-agent-client.js";
import { publicUnitTestWorkerProfile } from "../src/services/unit-test-case-generation-service.js";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) return resolve();
    server.close(() => resolve());
  });
}

async function httpRequest(baseURL, method, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(`${baseURL}${pathname}`);
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request(target, {
      method,
      headers: options.headers || {}
    }, (result) => {
      const chunks = [];
      result.on("data", (chunk) => chunks.push(chunk));
      result.on("end", () => resolve({
        status: result.statusCode,
        headers: result.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

const TRIM_MARKER = '"type":"assistant/chunk"';

// ---------------------------------------------------------------------------
// Part A — Worker endpoint GET /internal/tcsd-pipeline/jobs/:jobId/dsh-session-log
// ---------------------------------------------------------------------------
const workerRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-dsh-log-worker-"));
const workerJobDir = path.join(workerRoot, "jobs");
const previousConfigs = {
  dataDir: config.dataDir,
  hermes: config.hermes,
  tcsdPipeline: config.tcsdPipeline,
  softwareDetailPipeline: config.softwareDetailPipeline
};
let workerServer = null;
try {
  config.dataDir = path.join(workerRoot, "data");
  config.hermes = {
    ...config.hermes,
    authToken: "worker-api-secret",
    uploadTempDir: path.join(workerRoot, "uploads")
  };
  config.tcsdPipeline = {
    ...config.tcsdPipeline,
    jobStoreDir: workerJobDir
  };
  config.softwareDetailPipeline = {
    ...config.softwareDetailPipeline,
    jobStoreDir: path.join(workerRoot, "software-detail-jobs")
  };

  const workerApp = await createHermesApp();
  workerServer = http.createServer(workerApp);
  await listen(workerServer);
  const workerBaseURL = `http://127.0.0.1:${workerServer.address().port}`;
  const authHeaders = { Authorization: "Bearer worker-api-secret" };

  // job-1: only session.events.jsonl (live stream shape) -> trimmed + served.
  const jobId1 = "worker-job-events";
  const ws1Output = path.join(workerRoot, "ws-1", "outputs");
  await writeJsonFile(path.join(workerJobDir, `${jobId1}.json`), {
    jobId: jobId1,
    status: "已完成",
    input: {
      workspaceDir: path.join(workerRoot, "ws-1"),
      outputDir: ws1Output,
      modelSlxOriginalName: "A02.slx"
    }
  });
  await fs.mkdir(path.join(ws1Output, ".tcsd-dsh"), { recursive: true });
  await fs.writeFile(
    path.join(ws1Output, ".tcsd-dsh", "session.events.jsonl"),
    [
      JSON.stringify({ seq: 1, type: "message/assistant", data: { content: [{ type: "text", text: "hello" }] } }),
      JSON.stringify({ seq: 2, type: "assistant/chunk", data: { delta: "noise" } }),
      JSON.stringify({ seq: 3, type: "tool/call", data: { name: "read" } })
    ].join("\n") + "\n",
    "utf8"
  );
  {
    const response = await httpRequest(workerBaseURL, "GET", `/internal/tcsd-pipeline/jobs/${jobId1}/dsh-session-log`, {
      headers: authHeaders
    });
    assert.equal(response.status, 200);
    assert.match(String(response.headers["content-type"] || ""), /^application\/octet-stream/);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="A02_dsh_session_log.jsonl"');
    assert.match(response.headers["x-sdg-correlation-id"] || "", /^tcsd-/);
    assert.ok(response.body.includes('"type":"message/assistant"'));
    assert.ok(response.body.includes('"type":"tool/call"'));
    assert.ok(!response.body.includes(TRIM_MARKER), "assistant/chunk deltas must be trimmed");
  }

  // job-2: both session.jsonl (exit dump) and session.events.jsonl -> the
  // complete session.jsonl wins.
  const jobId2 = "worker-job-both";
  const ws2Output = path.join(workerRoot, "ws-2", "outputs");
  await writeJsonFile(path.join(workerJobDir, `${jobId2}.json`), {
    jobId: jobId2,
    status: "已完成",
    input: {
      workspaceDir: path.join(workerRoot, "ws-2"),
      outputDir: ws2Output,
      modelSlxOriginalName: "B04.slx"
    }
  });
  await fs.mkdir(path.join(ws2Output, ".tcsd-dsh"), { recursive: true });
  await fs.writeFile(
    path.join(ws2Output, ".tcsd-dsh", "session.jsonl"),
    '{"seq":1,"type":"message/assistant","data":{"content":[{"type":"text","text":"from-session-jsonl"}]}}\n',
    "utf8"
  );
  await fs.writeFile(
    path.join(ws2Output, ".tcsd-dsh", "session.events.jsonl"),
    '{"seq":1,"type":"message/assistant","data":{"content":[{"type":"text","text":"from-events"}]}}\n',
    "utf8"
  );
  {
    const response = await httpRequest(workerBaseURL, "GET", `/internal/tcsd-pipeline/jobs/${jobId2}/dsh-session-log`, {
      headers: authHeaders
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="B04_dsh_session_log.jsonl"');
    assert.ok(response.body.includes("from-session-jsonl"));
    assert.ok(!response.body.includes("from-events"));
  }

  // job-3: only the plain session.log fallback -> served via res.download
  // with dotfiles allowed.
  const jobId3 = "worker-job-log";
  const ws3Output = path.join(workerRoot, "ws-3", "outputs");
  await writeJsonFile(path.join(workerJobDir, `${jobId3}.json`), {
    jobId: jobId3,
    status: "已完成",
    input: {
      workspaceDir: path.join(workerRoot, "ws-3"),
      outputDir: ws3Output,
      modelSlxOriginalName: "C05.slx"
    }
  });
  await fs.mkdir(path.join(ws3Output, ".tcsd-dsh"), { recursive: true });
  await fs.writeFile(path.join(ws3Output, ".tcsd-dsh", "session.log"), "plain log text\n", "utf8");
  {
    const response = await httpRequest(workerBaseURL, "GET", `/internal/tcsd-pipeline/jobs/${jobId3}/dsh-session-log`, {
      headers: authHeaders
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="C05_dsh_session_log.jsonl"');
    assert.ok(response.body.includes("plain log text"));
  }

  // job-4: job exists but no log file ever written -> 404 dsh_session_log_not_found.
  const jobId4 = "worker-job-empty";
  await writeJsonFile(path.join(workerJobDir, `${jobId4}.json`), {
    jobId: jobId4,
    status: "已完成",
    input: {
      workspaceDir: path.join(workerRoot, "ws-4"),
      outputDir: path.join(workerRoot, "ws-4", "outputs"),
      modelSlxOriginalName: "D06.slx"
    }
  });
  {
    const response = await httpRequest(workerBaseURL, "GET", `/internal/tcsd-pipeline/jobs/${jobId4}/dsh-session-log`, {
      headers: authHeaders
    });
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "dsh_session_log_not_found");
  }

  // missing job -> 404 tcsd_job_not_found.
  {
    const response = await httpRequest(workerBaseURL, "GET", "/internal/tcsd-pipeline/jobs/does-not-exist/dsh-session-log", {
      headers: authHeaders
    });
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "tcsd_job_not_found");
  }

  // auth is enforced for the internal endpoint.
  {
    const response = await httpRequest(workerBaseURL, "GET", `/internal/tcsd-pipeline/jobs/${jobId1}/dsh-session-log`, {
      headers: {}
    });
    assert.equal(response.status, 401);
    assert.equal(JSON.parse(response.body).code, "hermes_unauthorized");
  }
  console.log("Worker DSH session-log endpoint tests passed.");
} finally {
  await closeServer(workerServer);
}

// ---------------------------------------------------------------------------
// Part B — HermesAgentClient.fetchTcsdDshSessionLog transport
// ---------------------------------------------------------------------------
{
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || "",
        correlationId: req.headers["x-sdg-correlation-id"] || ""
      });
      if (req.url.includes("missing-log")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          error: "该任务没有 DSH 会话日志",
          code: "dsh_session_log_not_found"
        }));
        return;
      }
      if (req.url.includes("big-log")) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", 'attachment; filename="Big_dsh_session_log.jsonl"');
        res.end("x".repeat(200 * 1024));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", 'attachment; filename="E07_dsh_session_log.jsonl"');
      res.end('{"seq":1,"type":"message/assistant","data":{}}\n');
    });
  });
  await listen(server);
  const port = server.address().port;
  const client = new HermesAgentClient({
    transport: "api",
    baseURL: `http://127.0.0.1:${port}`,
    authToken: "remote-worker-token",
    timeoutMs: 5000
  });
  try {
    const fetched = await client.fetchTcsdDshSessionLog("worker-job-events");
    assert.equal(fetched.ok, true);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.fileName, "E07_dsh_session_log.jsonl");
    assert.ok(fetched.text.includes("message/assistant"));
    assert.equal(received[0].method, "GET");
    assert.equal(received[0].url, "/internal/tcsd-pipeline/jobs/worker-job-events/dsh-session-log");
    assert.equal(received[0].authorization, "Bearer remote-worker-token");
    assert.match(received[0].correlationId, /^tcsd-/);

    await assert.rejects(
      client.fetchTcsdDshSessionLog("missing-log"),
      (error) => {
        assert.equal(error.code, "dsh_session_log_not_found");
        assert.equal(error.retryable, false);
        assert.equal(error.details.operation, "dsh-session-log");
        assert.equal(error.details.httpStatus, 404);
        assert.equal(error.details.remoteCode, "dsh_session_log_not_found");
        return true;
      }
    );

    const tooLargeClient = new HermesAgentClient({
      transport: "api",
      baseURL: `http://127.0.0.1:${port}`,
      authToken: "remote-worker-token",
      timeoutMs: 5000,
      maxControlResponseBytes: 64 * 1024
    });
    await assert.rejects(
      tooLargeClient.fetchTcsdDshSessionLog("big-log"),
      (error) => {
        assert.equal(error.code, "tcsd_worker_response_too_large");
        assert.ok(!JSON.stringify(error).includes("message/assistant"));
        return true;
      }
    );
  } finally {
    await closeServer(server);
  }

  const unreachableClient = new HermesAgentClient({
    transport: "api",
    baseURL: "http://127.0.0.1:1",
    authToken: "remote-worker-token",
    timeoutMs: 3000
  });
  await assert.rejects(
    unreachableClient.fetchTcsdDshSessionLog("worker-job-events"),
    (error) => {
      assert.equal(error.code, "tcsd_worker_unavailable");
      assert.equal(error.retryable, true);
      assert.equal(error.details.operation, "dsh-session-log");
      return true;
    }
  );
  console.log("HermesAgentClient DSH session-log transport tests passed.");
}

// ---------------------------------------------------------------------------
// Part C — Platform export endpoint (local-first, worker-forward fallback)
// ---------------------------------------------------------------------------
const platformRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-dsh-log-platform-"));
const platformDataDir = path.join(platformRoot, "platform-data");
const skillsDir = path.join(platformRoot, "skills");
const platformWorkerProfile = {
  id: "prod-worker",
  label: "Prod Worker",
  hermesTransport: "api",
  hermesBaseURL: "",
  hermesApiMode: "json",
  hermesAuthToken: "prod-worker-token",
  matlabBaseURL: "http://127.0.0.1:1",
  matlabHttpMode: "path",
  matlabAuthToken: "",
  isDefault: true
};
const previousPlatformConfigs = {
  rootDir: config.rootDir,
  publicDir: config.publicDir,
  legacySkillDir: config.legacySkillDir,
  activeSkillDir: config.activeSkillDir,
  skillBundleDir: config.skillBundleDir,
  dataDir: config.dataDir,
  skillDatabasePath: config.skillDatabasePath,
  projectStoreDir: config.projectStoreDir,
  uploadDir: config.uploadDir,
  llmProfileStorePath: config.llmProfileStorePath,
  skillRefinementDir: config.skillRefinementDir,
  skillRefinementCaseDir: config.skillRefinementCaseDir,
  skillRefinementRunDir: config.skillRefinementRunDir,
  skillRefinementEvaluationDir: config.skillRefinementEvaluationDir,
  skillRefinementAuditDir: config.skillRefinementAuditDir,
  skillRefinementBundleMetaDir: config.skillRefinementBundleMetaDir,
  skillBundleSnapshotDir: config.skillBundleSnapshotDir,
  skillRefinementUploadDir: config.skillRefinementUploadDir,
  activeSkillBundlePointerPath: config.activeSkillBundlePointerPath,
  skillRuleDir: config.skillRuleDir,
  skillRuleChangeLogPath: config.skillRuleChangeLogPath,
  rejectionStoreDir: config.rejectionStoreDir,
  rejectionGroupStorePath: config.rejectionGroupStorePath,
  replayTaskStoreDir: config.replayTaskStoreDir,
  skillWorkOrderStoreDir: config.skillWorkOrderStoreDir,
  feedbackTicketStoreDir: config.feedbackTicketStoreDir,
  feedbackTicketUploadDir: config.feedbackTicketUploadDir,
  unitTestCase: config.unitTestCase,
  tcsdPipeline: config.tcsdPipeline,
  hermes: config.hermes
};
let platformServer = null;
let fakeWorker = null;
try {
  Object.assign(config, {
    rootDir: platformRoot,
    publicDir: path.join(REPOSITORY_ROOT, "public"),
    legacySkillDir: path.join(skillsDir, "legacy"),
    activeSkillDir: path.join(skillsDir, "active"),
    skillBundleDir: path.join(skillsDir, "bundles"),
    generationTaskArtifactDir: path.join(platformDataDir, "generation-task-artifacts"),
    replayTaskArtifactDir: path.join(platformDataDir, "replay-task-artifacts"),
    dataDir: platformDataDir,
    skillDatabasePath: path.join(platformDataDir, "skills.sqlite"),
    projectStoreDir: path.join(platformDataDir, "projects"),
    uploadDir: path.join(platformDataDir, "uploads"),
    llmProfileStorePath: path.join(platformDataDir, "llm-profiles.json"),
    skillRefinementDir: path.join(platformDataDir, "skill-refinement"),
    skillRefinementCaseDir: path.join(platformDataDir, "skill-refinement", "cases"),
    skillRefinementRunDir: path.join(platformDataDir, "skill-refinement", "runs"),
    skillRefinementEvaluationDir: path.join(platformDataDir, "skill-refinement", "evaluations"),
    skillRefinementAuditDir: path.join(platformDataDir, "skill-refinement", "audit"),
    skillRefinementBundleMetaDir: path.join(platformDataDir, "skill-refinement", "bundles"),
    skillBundleSnapshotDir: path.join(platformDataDir, "skill-refinement", "bundle-snapshots"),
    skillRefinementUploadDir: path.join(platformDataDir, "skill-refinement", "uploads"),
    activeSkillBundlePointerPath: path.join(platformDataDir, "skill-refinement", "active-bundle.json"),
    skillRuleDir: path.join(platformDataDir, "skill-rules"),
    skillRuleChangeLogPath: path.join(platformDataDir, "skill-rules", "change-log.json"),
    rejectionStoreDir: path.join(platformDataDir, "rejections"),
    rejectionGroupStorePath: path.join(platformDataDir, "rejections", "groups.json"),
    replayTaskStoreDir: path.join(platformDataDir, "replay-tasks"),
    skillWorkOrderStoreDir: path.join(platformDataDir, "skill-work-orders"),
    feedbackTicketStoreDir: path.join(platformDataDir, "feedback-tickets"),
    feedbackTicketUploadDir: path.join(platformDataDir, "uploads", "feedback-tickets")
  });
  config.unitTestCase = {
    ...config.unitTestCase,
    taskStoreDir: path.join(platformDataDir, "unit-test-case-generation", "tasks"),
    uploadTempDir: path.join(platformDataDir, "unit-test-case-generation", "_incoming"),
    projectRegistryPath: path.join(platformDataDir, "unit-test-case-generation", "projects.json"),
    projectAdminCode: "114301",
    defaultProjects: "01_合成测试",
    projectAddonRoot: path.join(platformRoot, "project-addons"),
    agentWorkspaceRoot: "",
    defaultWorkerId: "prod-worker",
    workerProfiles: [platformWorkerProfile]
  };
  config.tcsdPipeline = {
    ...config.tcsdPipeline,
    jobStoreDir: path.join(platformDataDir, "tcsd-pipeline-jobs")
  };
  config.hermes = {
    ...config.hermes,
    authToken: "platform-hermes-token",
    uploadTempDir: path.join(platformDataDir, "hermes-uploads")
  };

  // Seed the minimal legacy skill files the bundle initializer expects.
  await fs.mkdir(path.join(config.legacySkillDir, "examples"), { recursive: true });
  for (const name of [
    "requirement_extraction.md",
    "requirement_writing.md",
    "requirement_validation.md"
  ]) {
    await fs.writeFile(path.join(config.legacySkillDir, name), `# ${name}\n`, "utf8");
  }
  await fs.writeFile(path.join(config.legacySkillDir, "examples", "good_examples.md"), "# 合格示例\n", "utf8");
  await fs.writeFile(path.join(config.legacySkillDir, "examples", "bad_examples.md"), "# 不合格示例\n", "utf8");
  await fs.writeFile(
    path.join(config.legacySkillDir, "domain-knowledge.json"),
    `${JSON.stringify({ version: 1, examples: [], ruleHints: [{ scope: "tcsd-dsh-session-log" }], antiPatterns: [] })}\n`,
    "utf8"
  );

  // Fake production worker: serves the session log only when told to.
  const workerRequests = [];
  const remoteLogText = [
    JSON.stringify({ seq: 1, type: "message/assistant", data: { content: [{ type: "text", text: "remote-log-content" }] } }),
    JSON.stringify({ seq: 2, type: "assistant/chunk", data: { delta: "noise" } })
  ].join("\n") + "\n";
  fakeWorker = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      workerRequests.push({ url: req.url, authorization: req.headers.authorization || "" });
      res.setHeader("X-SDG-Correlation-ID", String(req.headers["x-sdg-correlation-id"] || ""));
      if (req.url.includes("remote-job-1")) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", 'attachment; filename="A02_dsh_session_log.jsonl"');
        res.end(remoteLogText);
        return;
      }
      if (req.url.includes("remote-job-missing-log")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          error: "该任务没有 DSH 会话日志（可能由 Hermes 执行，或会话日志未落盘）",
          code: "dsh_session_log_not_found"
        }));
        return;
      }
      if (req.url.includes("remote-job-gone")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "TCSD 作业不存在。", code: "tcsd_job_not_found" }));
        return;
      }
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "unexpected", code: "unexpected" }));
    });
  });
  await listen(fakeWorker);
  const fakeWorkerBaseURL = `http://127.0.0.1:${fakeWorker.address().port}`;
  platformWorkerProfile.hermesBaseURL = fakeWorkerBaseURL;

  const platformApp = await createApp();
  platformServer = http.createServer(platformApp);
  await listen(platformServer);
  const platformBaseURL = `http://127.0.0.1:${platformServer.address().port}`;

  const taskStoreDir = config.unitTestCase.taskStoreDir;
  const writeTask = async (taskId, overrides = {}) => {
    const task = {
      id: taskId,
      type: "unit_test_case_generation",
      status: "failed",
      title: "session-log-test",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
      workerProfile: publicUnitTestWorkerProfile(platformWorkerProfile),
      inputs: { modelSlx: { originalName: "A02.slx" } },
      workspace: { outputDir: path.join(taskStoreDir, taskId, "workspace", "outputs") },
      pipeline: { jobId: "remote-job-1", status: "失败" },
      ...overrides
    };
    await writeJsonFile(path.join(taskStoreDir, taskId, "task.json"), task);
  };

  // C1 — local log present: served locally, worker never contacted.
  await writeTask("local-log-task", {
    pipeline: { jobId: "local-only-job", status: "失败" },
    inputs: { modelSlx: { originalName: "B04.slx" } }
  });
  const localSessionDir = path.join(taskStoreDir, "local-log-task", "workspace", "outputs", ".tcsd-dsh");
  await fs.mkdir(localSessionDir, { recursive: true });
  await fs.writeFile(
    path.join(localSessionDir, "session.events.jsonl"),
    '{"seq":1,"type":"message/assistant","data":{"content":[{"type":"text","text":"local-log-content"}]}}\n',
    "utf8"
  );
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/local-log-task/dsh-session-log");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="B04_dsh_session_log.jsonl"');
    assert.ok(response.body.includes("local-log-content"));
    assert.ok(workerRequests.every((request) => !request.url.includes("local-only-job")), "worker must not be contacted when a local log exists");
  }

  // C2 — production topology: no local log, forward from the worker.
  await writeTask("remote-log-task");
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/remote-log-task/dsh-session-log");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="A02_dsh_session_log.jsonl"');
    assert.ok(response.body.includes("remote-log-content"));
    assert.ok(!response.body.includes(TRIM_MARKER), "assistant/chunk deltas must be trimmed");
    const forwarded = workerRequests.find((request) => request.url.includes("remote-job-1"));
    assert.ok(forwarded, "platform must fetch the log from the worker");
    assert.equal(forwarded.authorization, "Bearer prod-worker-token");
    assert.equal(forwarded.url, "/internal/tcsd-pipeline/jobs/remote-job-1/dsh-session-log");
  }

  // C3 — worker says the job has no log -> mapped 404 dsh_session_log_not_found.
  await writeTask("remote-missing-log-task", {
    pipeline: { jobId: "remote-job-missing-log", status: "失败" }
  });
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/remote-missing-log-task/dsh-session-log");
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "dsh_session_log_not_found");
  }

  // C4 — worker says the job is gone -> 404 dsh_session_log_unavailable.
  await writeTask("remote-gone-task", {
    pipeline: { jobId: "remote-job-gone", status: "失败" }
  });
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/remote-gone-task/dsh-session-log");
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "dsh_session_log_unavailable");
  }

  // C5 — worker unreachable -> 502 dsh_session_log_worker_unavailable.
  platformWorkerProfile.hermesBaseURL = "http://127.0.0.1:1";
  await writeTask("remote-unreachable-task");
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/remote-unreachable-task/dsh-session-log");
    assert.equal(response.status, 502);
    assert.equal(JSON.parse(response.body).code, "dsh_session_log_worker_unavailable");
  }
  platformWorkerProfile.hermesBaseURL = fakeWorkerBaseURL;

  // C6 — no jobId and no local log but a workspace dir -> historical not-found.
  await writeTask("legacy-no-job-task", {
    pipeline: { jobId: "", status: "" }
  });
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/legacy-no-job-task/dsh-session-log");
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "dsh_session_log_not_found");
  }

  // C7 — no jobId and no workspace dir -> historical unavailable.
  await writeTask("legacy-no-workspace-task", {
    pipeline: { jobId: "", status: "" },
    workspace: {}
  });
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/legacy-no-workspace-task/dsh-session-log");
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "dsh_session_log_unavailable");
  }

  // C8 — unknown task -> 404 unit_test_case_task_not_found.
  {
    const response = await httpRequest(platformBaseURL, "GET", "/api/unit-test-case-generation/tasks/unknown-task/dsh-session-log");
    assert.equal(response.status, 404);
    assert.equal(JSON.parse(response.body).code, "unit_test_case_task_not_found");
  }
  console.log("Platform DSH session-log export tests passed.");
} finally {
  await closeServer(platformServer);
  await closeServer(fakeWorker);
  Object.assign(config, previousPlatformConfigs);
  config.unitTestCase = previousPlatformConfigs.unitTestCase;
  config.tcsdPipeline = previousPlatformConfigs.tcsdPipeline;
  config.hermes = previousPlatformConfigs.hermes;
  await fs.rm(platformRoot, { recursive: true, force: true });
}

await fs.rm(workerRoot, { recursive: true, force: true });
Object.assign(config, previousConfigs);
console.log("TCSD DSH session-log export (worker endpoint + client + platform fallback) tests passed.");
