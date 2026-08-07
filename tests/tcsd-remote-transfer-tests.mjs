import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HermesAgentClient } from "../src/services/hermes-agent-client.js";

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-remote-transfer-"));
const slxPath = path.join(workspace, "A02.slx");
const matPath = path.join(workspace, "A02.mat");
const outputBytes = Buffer.from("remote-xlsx-bytes");
await fs.writeFile(slxPath, "slx-upload-sentinel");
await fs.writeFile(matPath, "mat-upload-sentinel");

const requests = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization || "",
      contentType: req.headers["content-type"] || "",
      body
    });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      res.statusCode = 202;
      res.end(JSON.stringify({ jobId: "remote-job", status: "正在执行" }));
      return;
    }
    if (req.method === "DELETE") {
      res.end(JSON.stringify({ ok: true, cleaned: true, jobId: "remote-job" }));
      return;
    }
    res.end(JSON.stringify({
      jobId: "remote-job",
      status: "已完成",
      artifacts: [{
        relativePath: "outputs/A02_Test0001_tcsd.xlsx",
        fileName: "A02_Test0001_tcsd.xlsx",
        encoding: "base64",
        contentBase64: outputBytes.toString("base64")
      }]
    }));
  });
});

await new Promise((resolve, reject) => {
  server.listen(0, "127.0.0.1", resolve);
  server.once("error", reject);
});
const address = server.address();
const client = new HermesAgentClient({
  transport: "api",
  apiMode: "upload",
  baseURL: `http://127.0.0.1:${address.port}`,
  authToken: "remote-worker-token",
  timeoutMs: 5000
});

try {
  const started = await client.startTcsdPipelineJob({
    taskId: "remote-task",
    idempotencyKey: "remote-task",
    allowedPaths: [workspace],
    inputArtifact: {
      workspaceDir: workspace,
      modelSlxPath: slxPath,
      modelMatPath: matPath,
      outputDir: path.join(workspace, "outputs")
    }
  });
  assert.equal(started.jobId, "remote-job");
  assert.equal(requests[0].url, "/internal/tcsd-pipeline/jobs-upload");
  assert.equal(requests[0].authorization, "Bearer remote-worker-token");
  assert.match(requests[0].contentType, /^multipart\/form-data;\s*boundary=/);
  assert.ok(requests[0].body.includes(Buffer.from("slx-upload-sentinel")));
  assert.ok(requests[0].body.includes(Buffer.from("mat-upload-sentinel")));

  const completed = await client.getTcsdPipelineJob("remote-job", {
    localWorkspaceDir: workspace
  });
  assert.equal(completed.status, "已完成");
  assert.equal(completed.artifacts[0].contentBase64, undefined);
  assert.equal(completed.artifacts[0].relativePath, "outputs/A02_Test0001_tcsd.xlsx");
  assert.deepEqual(
    await fs.readFile(path.join(workspace, "outputs", "A02_Test0001_tcsd.xlsx")),
    outputBytes
  );
  assert.equal(requests[1].authorization, "Bearer remote-worker-token");
  const cleanup = await client.cleanupTcsdPipelineUpload("remote-job");
  assert.equal(cleanup.cleaned, true);
  assert.equal(requests[2].method, "DELETE");
  assert.equal(requests[2].url, "/internal/tcsd-pipeline/jobs/remote-job/upload-session");
  assert.equal(requests[2].authorization, "Bearer remote-worker-token");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(workspace, { recursive: true, force: true });
}

console.log("TCSD remote multipart staging and artifact transfer tests passed.");

// 回归：完成态大作业的轮询响应可超过旧的 256KB 上限（生产 DrvMod_A05 实测
// 399KB 被截断为 tcsd_worker_response_too_large），默认上限须能承载。
{
  const bigOutput = Buffer.alloc(1024 * 1024, "x");
  const bigWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-remote-large-response-"));
  const bigServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({
        jobId: "large-job",
        status: "已完成",
        artifacts: [{
          relativePath: "outputs/Large_Test0001_tcsd.xlsx",
          fileName: "Large_Test0001_tcsd.xlsx",
          kind: "tcsd_workbook",
          encoding: "base64",
          contentBase64: bigOutput.toString("base64")
        }]
      }));
    });
  });
  await new Promise((resolve, reject) => {
    bigServer.listen(0, "127.0.0.1", resolve);
    bigServer.once("error", reject);
  });
  const bigAddress = bigServer.address();
  const bigClient = new HermesAgentClient({
    transport: "api",
    baseURL: `http://127.0.0.1:${bigAddress.port}`,
    authToken: "remote-worker-token",
    timeoutMs: 10000
  });
  try {
    const completed = await bigClient.getTcsdPipelineJob("large-job", {
      localWorkspaceDir: bigWorkspace
    });
    assert.equal(completed.status, "已完成");
    assert.equal(completed.artifacts[0].relativePath, "outputs/Large_Test0001_tcsd.xlsx");
    assert.deepEqual(
      await fs.readFile(path.join(bigWorkspace, "outputs", "Large_Test0001_tcsd.xlsx")),
      bigOutput
    );
  } finally {
    await new Promise((resolve) => bigServer.close(resolve));
    await fs.rm(bigWorkspace, { recursive: true, force: true });
  }
  console.log("TCSD large completed-job poll response regression passed.");
}
