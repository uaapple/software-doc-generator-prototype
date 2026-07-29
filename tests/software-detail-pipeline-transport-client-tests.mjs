import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HermesAgentClient } from "../src/services/hermes-agent-client.js";

const DOCX_ROLE = "detail-design-docx";
const DOCX_RELATIVE_PATH = "outputs/软件模块详细设计.docx";
const DOCX_BYTES = Buffer.from("PK\u0003\u0004deterministic-software-detail-docx");
const DOCX_SHA256 = createHash("sha256").update(DOCX_BYTES).digest("hex");
const MAX_TRANSFER_BYTES = 50 * 1024 * 1024;

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  return server.address();
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readRequest(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function transferredDocx(overrides = {}) {
  return {
    role: DOCX_ROLE,
    relativePath: DOCX_RELATIVE_PATH,
    fileName: "软件模块详细设计.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    encoding: "base64",
    contentBase64: DOCX_BYTES.toString("base64"),
    size: DOCX_BYTES.length,
    sha256: DOCX_SHA256,
    ...overrides
  };
}

function completedJob(jobId, artifact = transferredDocx()) {
  return {
    schema: "software-detail-minimal-job/v1",
    jobId,
    status: "completed",
    stages: [],
    artifacts: artifact === null ? [] : [artifact]
  };
}

async function assertRejectsCode(action, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.equal(error?.code, expectedCode, error?.stack || error?.message);
    assert.ok(String(error?.message || "").trim(), "error message must not be empty");
    return true;
  });
}

async function testMultipartLifecycleAndAtomicMaterialization() {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "software-detail-client-multipart-")
  );
  const slxPath = path.join(workspace, "Demo.slx");
  const matPath = path.join(workspace, "Demo.mat");
  await fs.writeFile(slxPath, "slx-upload-sentinel");
  await fs.writeFile(matPath, "mat-upload-sentinel");

  const requests = [];
  let docxExistedWhenCleanupRequested = false;
  const server = http.createServer(async (req, res) => {
    const body = await readRequest(req);
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization || "",
      contentType: req.headers["content-type"] || "",
      body
    });
    if (
      req.method === "POST" &&
      req.url === "/internal/software-detail-pipeline/jobs-upload"
    ) {
      sendJson(res, 202, {
        schema: "software-detail-minimal-job/v1",
        jobId: "software-detail-job-multipart",
        status: "queued"
      });
      return;
    }
    if (
      req.method === "GET" &&
      req.url === "/internal/software-detail-pipeline/jobs/software-detail-job-multipart"
    ) {
      sendJson(
        res,
        200,
        completedJob("software-detail-job-multipart")
      );
      return;
    }
    if (
      req.method === "DELETE" &&
      req.url ===
        "/internal/software-detail-pipeline/jobs/software-detail-job-multipart/upload-session"
    ) {
      docxExistedWhenCleanupRequested = Boolean(
        await fs.stat(path.join(workspace, ...DOCX_RELATIVE_PATH.split("/"))).catch(
          () => null
        )
      );
      sendJson(res, 200, {
        ok: true,
        cleaned: true,
        jobId: "software-detail-job-multipart"
      });
      return;
    }
    sendJson(res, 404, {
      error: "not found",
      code: "software_detail_job_not_found"
    });
  });

  const originalWriteFile = fs.writeFile;
  const originalRename = fs.rename;
  const artifactOperations = [];
  const finalDocxPath = path.join(workspace, ...DOCX_RELATIVE_PATH.split("/"));
  fs.writeFile = async (targetPath, ...args) => {
    const resolved = path.resolve(String(targetPath || ""));
    if (resolved.startsWith(`${path.resolve(workspace, "outputs")}${path.sep}`)) {
      artifactOperations.push({ operation: "writeFile", targetPath: resolved });
    }
    return originalWriteFile.call(fs, targetPath, ...args);
  };
  fs.rename = async (sourcePath, targetPath, ...args) => {
    const resolvedTarget = path.resolve(String(targetPath || ""));
    if (resolvedTarget.startsWith(`${path.resolve(workspace, "outputs")}${path.sep}`)) {
      artifactOperations.push({
        operation: "rename",
        sourcePath: path.resolve(String(sourcePath || "")),
        targetPath: resolvedTarget
      });
    }
    return originalRename.call(fs, sourcePath, targetPath, ...args);
  };

  try {
    const address = await listen(server);
    const client = new HermesAgentClient({
      transport: "api",
      apiMode: "upload",
      baseURL: `http://127.0.0.1:${address.port}`,
      authToken: "software-detail-test-token",
      timeoutMs: 5000
    });

    const started = await client.startSoftwareDetailPipelineJob({
      taskId: "software-detail-task-multipart",
      idempotencyKey: "software-detail-task-multipart",
      allowedPaths: [workspace],
      inputArtifact: {
        workspaceDir: workspace,
        modelSlxPath: slxPath,
        modelMatPath: matPath,
        outputDir: path.join(workspace, "outputs")
      }
    });
    assert.equal(started.jobId, "software-detail-job-multipart");
    assert.equal(requests[0].method, "POST");
    assert.equal(
      requests[0].url,
      "/internal/software-detail-pipeline/jobs-upload"
    );
    assert.equal(
      requests[0].authorization,
      "Bearer software-detail-test-token"
    );
    assert.match(requests[0].contentType, /^multipart\/form-data;\s*boundary=/);
    assert.ok(requests[0].body.includes(Buffer.from("slx-upload-sentinel")));
    assert.ok(requests[0].body.includes(Buffer.from("mat-upload-sentinel")));
    assert.ok(
      requests[0].body.includes(
        Buffer.from('"idempotencyKey":"software-detail-task-multipart"')
      )
    );

    const completed = await client.getSoftwareDetailPipelineJob(
      "software-detail-job-multipart",
      { localWorkspaceDir: workspace }
    );
    assert.equal(completed.status, "completed");
    assert.equal(completed.artifacts.length, 1);
    assert.equal(completed.artifacts[0].role, DOCX_ROLE);
    assert.equal(completed.artifacts[0].relativePath, DOCX_RELATIVE_PATH);
    assert.equal(completed.artifacts[0].contentBase64, undefined);
    assert.equal(completed.artifacts[0].size, DOCX_BYTES.length);
    assert.equal(completed.artifacts[0].sha256, DOCX_SHA256);
    assert.deepEqual(await fs.readFile(finalDocxPath), DOCX_BYTES);

    const directFinalWrites = artifactOperations.filter(
      (operation) =>
        operation.operation === "writeFile" &&
        operation.targetPath === finalDocxPath
    );
    const temporaryWrites = artifactOperations.filter(
      (operation) =>
        operation.operation === "writeFile" &&
        operation.targetPath !== finalDocxPath
    );
    const finalRenames = artifactOperations.filter(
      (operation) =>
        operation.operation === "rename" &&
        operation.targetPath === finalDocxPath
    );
    assert.deepEqual(directFinalWrites, []);
    assert.equal(temporaryWrites.length, 1);
    assert.equal(finalRenames.length, 1);
    assert.equal(finalRenames[0].sourcePath, temporaryWrites[0].targetPath);

    const cleanup = await client.cleanupSoftwareDetailPipelineUpload(
      "software-detail-job-multipart"
    );
    assert.equal(cleanup.cleaned, true);
    assert.equal(docxExistedWhenCleanupRequested, true);
    assert.deepEqual(
      requests.slice(1).map(({ method, url }) => ({ method, url })),
      [
        {
          method: "GET",
          url: "/internal/software-detail-pipeline/jobs/software-detail-job-multipart"
        },
        {
          method: "DELETE",
          url:
            "/internal/software-detail-pipeline/jobs/software-detail-job-multipart/upload-session"
        }
      ]
    );
  } finally {
    fs.writeFile = originalWriteFile;
    fs.rename = originalRename;
    await close(server);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function testJsonStartAndRunningPoll() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readRequest(req);
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization || "",
      contentType: req.headers["content-type"] || "",
      body
    });
    if (req.method === "POST") {
      sendJson(res, 202, {
        schema: "software-detail-minimal-job/v1",
        jobId: "software-detail-job-json",
        status: "queued"
      });
      return;
    }
    sendJson(res, 200, {
      schema: "software-detail-minimal-job/v1",
      jobId: "software-detail-job-json",
      status: "running",
      stages: [],
      artifacts: []
    });
  });

  try {
    const address = await listen(server);
    const client = new HermesAgentClient({
      transport: "api",
      apiMode: "json",
      baseURL: `http://127.0.0.1:${address.port}`,
      authToken: "software-detail-json-token",
      timeoutMs: 5000
    });
    const started = await client.startSoftwareDetailPipelineJob({
      taskId: "software-detail-task-json",
      idempotencyKey: "software-detail-task-json"
    });
    assert.equal(started.jobId, "software-detail-job-json");
    assert.equal(
      requests[0].url,
      "/internal/software-detail-pipeline/jobs"
    );
    assert.equal(requests[0].contentType, "application/json");
    assert.equal(requests[0].authorization, "Bearer software-detail-json-token");
    assert.deepEqual(JSON.parse(requests[0].body.toString("utf8")), {
      taskId: "software-detail-task-json",
      idempotencyKey: "software-detail-task-json"
    });

    const running = await client.getSoftwareDetailPipelineJob(
      "software-detail-job-json"
    );
    assert.equal(running.status, "running");
    assert.deepEqual(running.artifacts, []);
    assert.equal(
      requests[1].url,
      "/internal/software-detail-pipeline/jobs/software-detail-job-json"
    );
  } finally {
    await close(server);
  }
}

async function testNonCompletedJobsNeverMaterializeDocx() {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "software-detail-client-non-completed-")
  );
  const statuses = ["queued", "running", "failed"];
  const server = http.createServer(async (req, res) => {
    await readRequest(req);
    const jobId = decodeURIComponent(
      String(req.url || "").split("/").filter(Boolean).at(-1) || ""
    );
    const status = statuses.find((candidate) => jobId === `job-${candidate}`);
    sendJson(res, 200, {
      schema: "software-detail-minimal-job/v1",
      jobId,
      status,
      stages: [],
      artifacts: [transferredDocx()]
    });
  });

  try {
    const address = await listen(server);
    const client = new HermesAgentClient({
      transport: "api",
      apiMode: "json",
      baseURL: `http://127.0.0.1:${address.port}`,
      timeoutMs: 5000
    });
    for (const status of statuses) {
      const localWorkspace = path.join(workspace, status);
      await fs.mkdir(localWorkspace, { recursive: true });
      const job = await client.getSoftwareDetailPipelineJob(`job-${status}`, {
        localWorkspaceDir: localWorkspace
      });
      assert.equal(job.status, status);
      assert.equal(job.artifacts.length, 1);
      assert.equal(job.artifacts[0].contentBase64, undefined);
      const finalPath = path.join(
        localWorkspace,
        ...DOCX_RELATIVE_PATH.split("/")
      );
      assert.equal(await fs.stat(finalPath).catch(() => null), null);
      assert.equal(
        await fs.stat(path.dirname(finalPath)).catch(() => null),
        null,
        `${status} must not create the final output directory`
      );
    }
  } finally {
    await close(server);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function testFailClosedArtifactValidation() {
  const fixtures = new Map([
    [
      "metadata-only",
      {
        artifact: transferredDocx({ contentBase64: undefined }),
        code: "software_detail_artifact_payload_missing"
      }
    ],
    [
      "wrong-encoding",
      {
        artifact: transferredDocx({ encoding: "hex" }),
        code: "software_detail_artifact_encoding_invalid"
      }
    ],
    [
      "bad-path",
      {
        artifact: transferredDocx({ relativePath: "../escape.docx" }),
        code: "software_detail_artifact_path_forbidden"
      }
    ],
    [
      "empty",
      {
        artifact: transferredDocx({ contentBase64: "" }),
        code: "software_detail_artifact_empty"
      }
    ],
    [
      "bad-base64",
      {
        artifact: transferredDocx({ contentBase64: "%%%=" }),
        code: "software_detail_artifact_base64_invalid"
      }
    ],
    [
      "size-mismatch",
      {
        artifact: transferredDocx({ size: DOCX_BYTES.length + 1 }),
        code: "software_detail_artifact_size_mismatch"
      }
    ],
    [
      "hash-mismatch",
      {
        artifact: transferredDocx({ sha256: "0".repeat(64) }),
        code: "software_detail_artifact_hash_mismatch"
      }
    ],
    [
      "hash-missing",
      {
        artifact: transferredDocx({ sha256: "" }),
        code: "software_detail_artifact_hash_missing"
      }
    ],
    [
      "too-large",
      {
        artifact: transferredDocx({ size: MAX_TRANSFER_BYTES + 1 }),
        code: "software_detail_artifact_too_large"
      }
    ],
    [
      "missing-docx",
      {
        artifact: null,
        code: "software_detail_artifact_missing"
      }
    ],
    [
      "artifacts-not-array",
      {
        artifacts: transferredDocx(),
        code: "software_detail_artifact_metadata_invalid"
      }
    ],
    [
      "duplicate-docx",
      {
        artifacts: [
          transferredDocx(),
          transferredDocx({ fileName: "重复软件模块详细设计.docx" })
        ],
        code: "software_detail_artifact_duplicate"
      }
    ],
    [
      "invalid-after-docx",
      {
        artifacts: [transferredDocx(), null],
        code: "software_detail_artifact_metadata_invalid"
      }
    ]
  ]);

  const server = http.createServer(async (req, res) => {
    await readRequest(req);
    const jobId = decodeURIComponent(
      String(req.url || "").split("/").filter(Boolean).at(-1) || ""
    );
    if (jobId === "invalid-json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{not-json");
      return;
    }
    if (jobId === "not-found") {
      sendJson(res, 404, {
        error: "job missing",
        code: "software_detail_job_not_found"
      });
      return;
    }
    const fixture = fixtures.get(jobId);
    const job = completedJob(jobId, fixture?.artifact ?? null);
    if (fixture?.artifacts) {
      job.artifacts = fixture.artifacts;
    }
    sendJson(res, 200, job);
  });

  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "software-detail-client-invalid-")
  );
  try {
    const address = await listen(server);
    const client = new HermesAgentClient({
      transport: "api",
      apiMode: "json",
      baseURL: `http://127.0.0.1:${address.port}`,
      timeoutMs: 5000
    });
    for (const [jobId, fixture] of fixtures) {
      const localWorkspace = path.join(workspace, jobId);
      await fs.mkdir(localWorkspace, { recursive: true });
      await assertRejectsCode(
        () =>
          client.getSoftwareDetailPipelineJob(jobId, {
            localWorkspaceDir: localWorkspace
          }),
        fixture.code
      );
      assert.equal(
        await fs
          .stat(path.join(localWorkspace, ...DOCX_RELATIVE_PATH.split("/")))
          .catch(() => null),
        null,
        `${jobId} must not leave a final DOCX`
      );
    }
    await assertRejectsCode(
      () =>
        client.getSoftwareDetailPipelineJob("invalid-json", {
          localWorkspaceDir: workspace
        }),
      "software_detail_invalid_response"
    );
    await assertRejectsCode(
      () =>
        client.getSoftwareDetailPipelineJob("not-found", {
          localWorkspaceDir: workspace
        }),
      "software_detail_job_not_found"
    );
    await assertRejectsCode(
      () => client.getSoftwareDetailPipelineJob(""),
      "software_detail_job_id_required"
    );
    await assertRejectsCode(
      () => client.cleanupSoftwareDetailPipelineUpload(""),
      "software_detail_job_id_required"
    );

    const outputEntries = await fs
      .readdir(path.join(workspace, "outputs"))
      .catch(() => []);
    assert.deepEqual(outputEntries, []);
  } finally {
    await close(server);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function testLegacyStepUsesStrictAtomicDocxTransfer() {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "software-detail-client-legacy-")
  );
  const slxPath = path.join(workspace, "Legacy.slx");
  const matPath = path.join(workspace, "Legacy.mat");
  await fs.writeFile(slxPath, "legacy-slx");
  await fs.writeFile(matPath, "legacy-mat");
  const requests = [];
  const server = http.createServer(async (req, res) => {
    requests.push({ method: req.method, url: req.url });
    await readRequest(req);
    sendJson(res, 200, {
      status: "succeeded",
      artifact: {
        status: "completed",
        summary: "legacy transfer completed",
        outputFiles: [
          {
            ...transferredDocx(),
            kind: "software_module_description_docx"
          }
        ]
      }
    });
  });

  try {
    const address = await listen(server);
    const client = new HermesAgentClient({
      transport: "api",
      apiMode: "upload",
      baseURL: `http://127.0.0.1:${address.port}`,
      timeoutMs: 5000,
      stepTimeoutMs: {
        simulink_module_description_generate: 5000
      }
    });
    const result = await client.executeStep({
      stepType: "simulink_module_description_generate",
      allowedPaths: [workspace],
      inputArtifact: {
        workspaceDir: workspace,
        modelSlxPath: slxPath,
        modelMatPath: matPath,
        outputDir: path.join(workspace, "outputs")
      }
    });
    assert.equal(result.status, "succeeded");
    assert.equal(result.artifact.outputFiles[0].sha256, DOCX_SHA256);
    assert.deepEqual(
      await fs.readFile(path.join(workspace, ...DOCX_RELATIVE_PATH.split("/"))),
      DOCX_BYTES
    );
    assert.deepEqual(requests, [
      {
        method: "POST",
        url: "/internal/steps/execute-upload"
      }
    ]);
  } finally {
    await close(server);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function testMultipartStartRejectsEmptyWorkspace() {
  const client = new HermesAgentClient({
    transport: "api",
    apiMode: "upload",
    baseURL: "http://127.0.0.1:1",
    timeoutMs: 1000
  });
  await assertRejectsCode(
    () =>
      client.startSoftwareDetailPipelineJob({
        taskId: "empty-workspace",
        allowedPaths: []
      }),
    "software_detail_upload_empty"
  );
}

await testMultipartLifecycleAndAtomicMaterialization();
await testJsonStartAndRunningPoll();
await testNonCompletedJobsNeverMaterializeDocx();
await testFailClosedArtifactValidation();
await testLegacyStepUsesStrictAtomicDocxTransfer();
await testMultipartStartRejectsEmptyWorkspace();

console.log(
  "Software detail pipeline transport client tests passed."
);
