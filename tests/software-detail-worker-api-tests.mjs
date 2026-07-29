import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../src/config.js";
import { createHermesApp } from "../src/hermes-app.js";
import {
  buildFixtureDocx,
  FIXTURE_DOCX_RELATIVE_PATH
} from "./fixtures/software-module-description/fake-hermes-docx-cli.mjs";

const DOCX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("api-docx")
]);
const LEGACY_FIXTURE_CLI_PATH = fileURLToPath(
  new URL(
    "./fixtures/software-module-description/fake-hermes-docx-cli.mjs",
    import.meta.url
  )
);

class FakeSoftwareDetailJobs {
  constructor() {
    this.jobs = new Map();
    this.startedInputs = [];
    this.saved = [];
  }

  async failNonTerminalJobsOnStartup() {
    return [];
  }

  async list() {
    return [...this.jobs.values()];
  }

  async start(input) {
    this.startedInputs.push(input);
    const jobId = `api-job-${this.startedInputs.length}`;
    const docxRelativePath = "outputs/software-detail-design.docx";
    const manifestRelativePath = "outputs/artifact-manifest.json";
    const docxPath = path.join(
      input.workspaceDir,
      ...docxRelativePath.split("/")
    );
    const manifestPath = path.join(
      input.workspaceDir,
      ...manifestRelativePath.split("/")
    );
    await fs.mkdir(path.dirname(docxPath), { recursive: true });
    await fs.writeFile(docxPath, DOCX_BYTES);
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({
        schema: "software-detail-artifact-manifest/v1",
        jobId,
        artifacts: [
          { role: "detail-design-docx", relativePath: docxRelativePath }
        ]
      })}\n`
    );
    const job = {
      schema: "software-detail-minimal-job/v1",
      jobId,
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input,
      artifacts: [
        {
          role: "detail-design-docx",
          relativePath: docxRelativePath
        },
        {
          role: "artifact-manifest",
          relativePath: manifestRelativePath
        }
      ]
    };
    this.jobs.set(jobId, job);
    return job;
  }

  async get(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async save(job) {
    this.saved.push(structuredClone(job));
    this.jobs.set(job.jobId, job);
    return job;
  }
}

function multipartBody(payload, roots, files) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.set(
    "uploadManifest",
    JSON.stringify({
      roots,
      files: files.map((file) => ({
        fieldName: file.fieldName,
        rootIndex: file.rootIndex,
        relativePath: file.relativePath
      }))
    })
  );
  for (const file of files) {
    form.set(
      file.fieldName,
      new Blob([file.bytes], { type: "application/octet-stream" }),
      file.relativePath || "upload.bin"
    );
  }
  return form;
}

const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "software-detail-worker-api-")
);
const previous = {
  uploadTempDir: config.hermes.uploadTempDir,
  authToken: config.hermes.authToken,
  command: config.hermes.command,
  commandArgsPrefix: config.hermes.commandArgsPrefix,
  timeoutMs: config.hermes.timeoutMs,
  addonRoot: config.unitTestCase.projectAddonRoot,
  tcsdJobStoreDir: config.tcsdPipeline.jobStoreDir
};
let server;
try {
  const uploadTempDir = path.join(root, "uploads");
  const addonRoot = path.join(root, "addons");
  const tcsdJobStoreDir = path.join(root, "tcsd-jobs");
  await fs.mkdir(path.join(addonRoot, "01"), { recursive: true });
  await fs.writeFile(
    path.join(addonRoot, "01", "init_Global.m"),
    "disp('addon')"
  );
  config.hermes.uploadTempDir = uploadTempDir;
  config.hermes.authToken = "";
  config.unitTestCase.projectAddonRoot = addonRoot;
  config.tcsdPipeline.jobStoreDir = tcsdJobStoreDir;

  const jobs = new FakeSoftwareDetailJobs();
  const app = await createHermesApp({ softwareDetailJobs: jobs });
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  const baseURL = `http://127.0.0.1:${address.port}`;

  const sourceWorkspace = path.join(root, "source-workspace");
  await fs.mkdir(sourceWorkspace, { recursive: true });
  const slxBytes = Buffer.from("slx-upload");
  const matBytes = Buffer.from("mat-upload");
  const payload = {
    taskId: "software-detail-api-task",
    idempotencyKey: "software-detail-api-task",
    workerSelection: { id: "worker-01", label: "Worker 01" },
    allowedPaths: [sourceWorkspace],
    inputArtifact: {
      workspaceDir: sourceWorkspace,
      modelSlxPath: path.join(sourceWorkspace, "Demo.slx"),
      modelMatPath: path.join(sourceWorkspace, "Demo.mat"),
      outputDir: path.join(sourceWorkspace, "outputs"),
      modelSlxOriginalName: "ActrReft.slx",
      unitTestProject: { id: "01", name: "Demo", label: "01_Demo" }
    }
  };
  const response = await fetch(
    `${baseURL}/internal/software-detail-pipeline/jobs-upload`,
    {
      method: "POST",
      body: multipartBody(
        payload,
        [{ sourceRoot: sourceWorkspace, type: "directory" }],
        [
          {
            fieldName: "file-0",
            rootIndex: 0,
            relativePath: "Demo.slx",
            bytes: slxBytes
          },
          {
            fieldName: "file-1",
            rootIndex: 0,
            relativePath: "Demo.mat",
            bytes: matBytes
          }
        ]
      )
    }
  );
  assert.equal(response.status, 202);
  const started = await response.json();
  assert.equal(started.schema, "software-detail-minimal-job/v1");
  assert.equal(jobs.startedInputs.length, 1);
  const retainedWorkspace = jobs.startedInputs[0].workspaceDir;
  assert.match(path.basename(path.dirname(retainedWorkspace)), /^step-/);
  assert.deepEqual(
    await fs.readFile(jobs.startedInputs[0].modelSlxPath),
    slxBytes
  );
  assert.equal(jobs.startedInputs[0].modelSlxOriginalName, "ActrReft.slx");
  assert.ok(
    await fs.stat(path.join(retainedWorkspace, "init_Global.m"))
  );

  const completedResponse = await fetch(
    `${baseURL}/internal/software-detail-pipeline/jobs/${started.jobId}`
  );
  assert.equal(completedResponse.status, 200);
  const completed = await completedResponse.json();
  const docx = completed.artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  );
  assert.equal(docx.encoding, "base64");
  assert.equal(docx.contentBase64, DOCX_BYTES.toString("base64"));
  assert.equal(docx.size, DOCX_BYTES.length);
  assert.equal(
    docx.sha256,
    createHash("sha256").update(DOCX_BYTES).digest("hex")
  );
  assert.equal(
    completed.artifacts.find(
      (artifact) => artifact.role === "artifact-manifest"
    ).contentBase64,
    undefined
  );

  const cleanupResponse = await fetch(
    `${baseURL}/internal/software-detail-pipeline/jobs/${started.jobId}/upload-session`,
    { method: "DELETE" }
  );
  assert.equal(cleanupResponse.status, 200);
  assert.equal((await cleanupResponse.json()).cleaned, true);
  assert.equal(
    await fs.stat(retainedWorkspace).catch(() => null),
    null
  );
  assert.equal(
    jobs.jobs.get(started.jobId).input.uploadSessionDir,
    ""
  );

  const probeSource = path.join(root, "probe.txt");
  const probeBytes = Buffer.from("await-regression");
  await fs.writeFile(probeSource, probeBytes);
  const probeResponse = await fetch(
    `${baseURL}/internal/steps/execute-upload`,
    {
      method: "POST",
      body: multipartBody(
        {
          stepType: "windows_worker_probe",
          allowedPaths: [probeSource],
          inputArtifact: {
            probeFilePath: probeSource,
            expectedText: probeBytes.toString("utf8")
          }
        },
        [{ sourceRoot: probeSource, type: "file" }],
        [
          {
            fieldName: "file-0",
            rootIndex: 0,
            relativePath: "probe.txt",
            bytes: probeBytes
          }
        ]
      )
    }
  );
  assert.equal(probeResponse.status, 200);
  const probe = await probeResponse.json();
  assert.equal(probe.artifact.ok, true);
  assert.equal(probe.artifact.file.contentMatches, true);

  const legacyWorkspace = path.join(root, "legacy-workspace");
  const legacySlxPath = path.join(legacyWorkspace, "Demo.slx");
  const legacyMatPath = path.join(legacyWorkspace, "Demo.mat");
  await fs.mkdir(legacyWorkspace, { recursive: true });
  await fs.writeFile(legacySlxPath, "legacy-slx");
  await fs.writeFile(legacyMatPath, "legacy-mat");
  config.hermes.command = process.execPath;
  config.hermes.commandArgsPrefix = [LEGACY_FIXTURE_CLI_PATH];
  config.hermes.timeoutMs = 10000;
  const legacyResponse = await fetch(`${baseURL}/internal/steps/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stepType: "simulink_module_description_generate",
      allowedPaths: [legacyWorkspace],
      inputArtifact: {
        workspaceDir: legacyWorkspace,
        modelSlxPath: legacySlxPath,
        modelMatPath: legacyMatPath,
        outputDir: path.join(legacyWorkspace, "outputs"),
        unitTestProject: { id: "01", name: "Demo", label: "01_Demo" }
      }
    })
  });
  assert.equal(legacyResponse.status, 200);
  const legacy = await legacyResponse.json();
  const legacyDocx = legacy.artifact.outputFiles[0];
  const expectedLegacyBytes = buildFixtureDocx();
  assert.equal(legacyDocx.relativePath, FIXTURE_DOCX_RELATIVE_PATH);
  assert.equal(legacyDocx.encoding, "base64");
  assert.equal(
    legacyDocx.contentBase64,
    expectedLegacyBytes.toString("base64")
  );
  assert.equal(legacyDocx.size, expectedLegacyBytes.length);
  assert.equal(
    legacyDocx.sha256,
    createHash("sha256").update(expectedLegacyBytes).digest("hex")
  );
} finally {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  config.hermes.uploadTempDir = previous.uploadTempDir;
  config.hermes.authToken = previous.authToken;
  config.hermes.command = previous.command;
  config.hermes.commandArgsPrefix = previous.commandArgsPrefix;
  config.hermes.timeoutMs = previous.timeoutMs;
  config.unitTestCase.projectAddonRoot = previous.addonRoot;
  config.tcsdPipeline.jobStoreDir = previous.tcsdJobStoreDir;
  await fs.rm(root, { recursive: true, force: true });
}

console.log(
  "Software-detail Worker API multipart retention, DOCX transfer, cleanup, and generic upload await tests passed."
);
