import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { createHermesApp } from "../src/hermes-app.js";
import { HermesAgentClient } from "../src/services/hermes-agent-client.js";
import { SoftwareModuleDescriptionGenerationService } from "../src/services/software-module-description-generation-service.js";
import {
  buildFixtureDocx,
  FIXTURE_DOCX_RELATIVE_PATH
} from "./fixtures/software-module-description/fake-hermes-docx-cli.mjs";

const FIXTURE_CLI_PATH = fileURLToPath(
  new URL("./fixtures/software-module-description/fake-hermes-docx-cli.mjs", import.meta.url)
);

function cloneConfigSection(section = {}) {
  return structuredClone(section);
}

function restoreConfigSection(target, snapshot) {
  for (const key of Object.keys(target)) {
    if (!(key in snapshot)) {
      delete target[key];
    }
  }
  Object.assign(target, snapshot);
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  return server.address();
}

async function close(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

async function createLegacyReadOnlyBaseline(taskStoreDir) {
  const legacyTask = {
    id: "legacy-software-module-description-task",
    type: "software_module_description_generation",
    status: "completed",
    title: "旧版软件详设任务",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
    workspace: {
      directory: "/legacy/workspace",
      inputDir: "/legacy/workspace/inputs",
      outputDir: "/legacy/workspace/outputs"
    },
    artifacts: [
      {
        id: "legacy-docx",
        fileName: "legacy.docx",
        relativePath: "outputs/legacy.docx"
      }
    ]
  };
  const taskPath = path.join(taskStoreDir, legacyTask.id, "task.json");
  const originalBytes = Buffer.from(`${JSON.stringify(legacyTask, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(taskPath), { recursive: true });
  await fs.writeFile(taskPath, originalBytes);

  const service = new SoftwareModuleDescriptionGenerationService();
  const readTask = await service.getTask(legacyTask.id);
  const listedTasks = await service.listTasks();
  const afterBytes = await fs.readFile(taskPath);

  return {
    taskPath,
    originalBytes,
    afterBytes,
    readTask,
    listedTask: listedTasks.find((item) => item.id === legacyTask.id) || null
  };
}

export async function runSoftwareModuleDescriptionTransportScenario() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-transport-regression-"));
  const taskStoreDir = path.join(tempRoot, "platform", "tasks");
  const platformUploadDir = path.join(tempRoot, "platform", "incoming");
  const workerUploadDir = path.join(tempRoot, "worker", "uploads");
  const addonRoot = path.join(tempRoot, "worker", "project-addons");
  const tcsdJobStoreDir = path.join(tempRoot, "worker", "tcsd-jobs");
  const projectRegistryPath = path.join(tempRoot, "platform", "projects.json");
  const sourceDir = path.join(tempRoot, "source");
  const sourceSlxPath = path.join(sourceDir, "Demo.slx");
  const sourceMatPath = path.join(sourceDir, "Demo.mat");
  const server = http.createServer();
  const originalFsRm = fs.rm;
  const originalFsRename = fs.rename;
  const originalFsWriteFile = fs.writeFile;
  let responseEnded = false;
  let platformWorkspaceDir = "";
  let releaseWorkerSessionCleanup = () => {};
  const workerSessionCleanupGate = new Promise((resolve) => {
    releaseWorkerSessionCleanup = resolve;
  });
  const cleanupOrderObservations = [];
  const platformArtifactOperations = [];
  const originalConfig = {
    hermes: cloneConfigSection(config.hermes),
    unitTestCase: cloneConfigSection(config.unitTestCase),
    tcsdPipeline: cloneConfigSection(config.tcsdPipeline),
    softwareModuleDescription: cloneConfigSection(config.softwareModuleDescription)
  };

  let result;
  try {
    await Promise.all([
      fs.mkdir(sourceDir, { recursive: true }),
      fs.mkdir(path.join(addonRoot, "01"), { recursive: true }),
      fs.mkdir(tcsdJobStoreDir, { recursive: true })
    ]);
    await Promise.all([
      fs.writeFile(sourceSlxPath, "deterministic-slx-upload"),
      fs.writeFile(sourceMatPath, "deterministic-mat-upload"),
      fs.writeFile(path.join(addonRoot, "01", "init_Global.m"), "% deterministic addon fixture\n")
    ]);

    Object.assign(config.hermes, {
      transport: "cli",
      authToken: "",
      command: process.execPath,
      commandArgsPrefix: [FIXTURE_CLI_PATH],
      uploadTempDir: workerUploadDir,
      timeoutMs: 10000,
      serverRequestTimeoutMs: 10000,
      heartbeatIntervalMs: 20,
      stepTimeoutMs: {
        ...config.hermes.stepTimeoutMs,
        simulink_module_description_generate: 10000
      }
    });
    Object.assign(config.unitTestCase, {
      taskStoreDir: path.join(tempRoot, "unused-unit-test-tasks"),
      uploadTempDir: path.join(tempRoot, "unused-unit-test-incoming"),
      projectRegistryPath,
      projectAddonRoot: addonRoot,
      defaultProjects: "01_楚能",
      defaultWorkerId: "transport-regression-worker",
      workerProfiles: []
    });
    Object.assign(config.tcsdPipeline, {
      jobStoreDir: tcsdJobStoreDir
    });
    Object.assign(config.softwareModuleDescription, {
      taskStoreDir,
      uploadTempDir: platformUploadDir,
      agentWorkspaceRoot: ""
    });

    // The production route currently starts its finally cleanup before awaiting
    // executeStepRequest. Record that ordering, but hold the actual deletion until
    // the response is observable so the transfer contract can be tested separately.
    fs.rm = async (targetPath, ...args) => {
      const resolvedTarget = path.resolve(String(targetPath || ""));
      if (
        path.dirname(resolvedTarget) === path.resolve(workerUploadDir) &&
        path.basename(resolvedTarget).startsWith("step-")
      ) {
        cleanupOrderObservations.push({
          responseEndedWhenCleanupStarted: responseEnded,
          sessionName: path.basename(resolvedTarget)
        });
        await workerSessionCleanupGate;
      }
      return originalFsRm.call(fs, targetPath, ...args);
    };
    fs.writeFile = async (targetPath, ...args) => {
      const resolvedTarget = path.resolve(String(targetPath || ""));
      if (
        platformWorkspaceDir &&
        resolvedTarget.startsWith(`${path.resolve(platformWorkspaceDir, "outputs")}${path.sep}`)
      ) {
        platformArtifactOperations.push({
          operation: "writeFile",
          targetPath: resolvedTarget
        });
      }
      return originalFsWriteFile.call(fs, targetPath, ...args);
    };
    fs.rename = async (sourcePath, targetPath, ...args) => {
      const resolvedSource = path.resolve(String(sourcePath || ""));
      const resolvedTarget = path.resolve(String(targetPath || ""));
      if (
        platformWorkspaceDir &&
        (
          resolvedSource.startsWith(`${path.resolve(platformWorkspaceDir, "outputs")}${path.sep}`) ||
          resolvedTarget.startsWith(`${path.resolve(platformWorkspaceDir, "outputs")}${path.sep}`)
        )
      ) {
        platformArtifactOperations.push({
          operation: "rename",
          sourcePath: resolvedSource,
          targetPath: resolvedTarget
        });
      }
      return originalFsRename.call(fs, sourcePath, targetPath, ...args);
    };

    const hermesApp = await createHermesApp();
    server.on("request", (req, res) => {
      if (req.url === "/internal/steps/execute-upload") {
        const end = res.end;
        res.end = function instrumentedResponseEnd(...args) {
          responseEnded = true;
          return end.apply(this, args);
        };
      }
      hermesApp(req, res);
    });
    const address = await listen(server);
    const workerBaseURL = `http://127.0.0.1:${address.port}`;
    config.unitTestCase.workerProfiles = [
      {
        id: "transport-regression-worker",
        label: "Transport regression Worker",
        isDefault: true,
        hermesTransport: "api",
        hermesBaseURL: workerBaseURL,
        hermesApiMode: "upload",
        hermesAuthToken: "",
        matlabBaseURL: "http://127.0.0.1:1",
        matlabHttpMode: "path",
        matlabAuthToken: ""
      }
    ];

    const platformClient = new HermesAgentClient({
      transport: "api",
      apiMode: "upload",
      baseURL: workerBaseURL,
      timeoutMs: 10000,
      stepTimeoutMs: {
        simulink_module_description_generate: 10000
      }
    });
    const executeStep = platformClient.executeStep.bind(platformClient);
    let workerResponse = null;
    platformClient.executeStep = async (...args) => {
      try {
        workerResponse = await executeStep(...args);
        return workerResponse;
      } finally {
        releaseWorkerSessionCleanup();
      }
    };

    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: platformClient
    });
    const legacy = await createLegacyReadOnlyBaseline(taskStoreDir);
    const createdTask = await service.createTask(
      {
        modelSlx: [
          {
            path: sourceSlxPath,
            originalname: "Demo.slx",
            mimetype: "application/octet-stream",
            size: 24
          }
        ],
        modelMat: [
          {
            path: sourceMatPath,
            originalname: "Demo.mat",
            mimetype: "application/octet-stream",
            size: 24
          }
        ]
      },
      {
        title: "软件详设 DOCX 跨 Worker 传输回归",
        unitTestProjectId: "01",
        workerId: "transport-regression-worker"
      }
    );
    platformWorkspaceDir = createdTask.workspace.directory;

    let runTaskError = null;
    let completedTask = null;
    try {
      completedTask = await service.runTask(createdTask.id);
    } catch (error) {
      runTaskError = error;
    }

    releaseWorkerSessionCleanup();
    await waitFor(async () => {
      const entries = await fs.readdir(workerUploadDir, { withFileTypes: true }).catch(() => []);
      return !entries.some((entry) => entry.isDirectory() && entry.name.startsWith("step-"));
    });

    const storedTask = await service.getTask(createdTask.id);
    const platformDocxPath = path.join(
      storedTask.workspace.directory,
      ...FIXTURE_DOCX_RELATIVE_PATH.split("/")
    );
    const platformDocxBytes = await readIfExists(platformDocxPath);
    const workerUploadEntries = await fs.readdir(workerUploadDir, { withFileTypes: true });
    const workerStepSessions = workerUploadEntries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("step-"))
      .map((entry) => entry.name)
      .sort();
    const expectedDocxBytes = buildFixtureDocx();
    const responseOutputFiles = Array.isArray(workerResponse?.artifact?.outputFiles)
      ? workerResponse.artifact.outputFiles
      : [];

    result = {
      tempRoot,
      createdTask,
      completedTask,
      storedTask,
      runTaskError,
      workerResponse,
      responseOutputFiles,
      platformDocxPath,
      platformDocxBytes,
      expectedDocxBytes,
      expectedDocxSha256: createHash("sha256").update(expectedDocxBytes).digest("hex"),
      platformArtifactOperations,
      workerStepSessions,
      cleanupOrderObservations,
      responseEnded,
      legacy
    };
    return result;
  } finally {
    releaseWorkerSessionCleanup();
    await close(server);
    fs.rm = originalFsRm;
    fs.rename = originalFsRename;
    fs.writeFile = originalFsWriteFile;
    restoreConfigSection(config.hermes, originalConfig.hermes);
    restoreConfigSection(config.unitTestCase, originalConfig.unitTestCase);
    restoreConfigSection(config.tcsdPipeline, originalConfig.tcsdPipeline);
    restoreConfigSection(config.softwareModuleDescription, originalConfig.softwareModuleDescription);
    if (!result?.keepTempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export function assertHarnessInvariants(result) {
  assert.equal(
    result.workerResponse?.status,
    "succeeded",
    `real Worker handler should return a succeeded response; task=${result.storedTask?.status || "unknown"}, ` +
      `error=${result.runTaskError?.code || "none"}: ${result.runTaskError?.message || ""}`
  );
  assert.equal(result.workerResponse?.stepType, "simulink_module_description_generate");
  assert.equal(result.responseOutputFiles.length, 1, "Worker response should describe the generated DOCX");
  assert.equal(result.responseOutputFiles[0].relativePath, FIXTURE_DOCX_RELATIVE_PATH);
  assert.equal(result.responseEnded, true, "real Worker handler should end its HTTP response");
  assert.equal(result.cleanupOrderObservations.length, 1, "real Worker handler should invoke one managed-session cleanup");
  assert.equal(result.workerStepSessions.length, 0, "Worker multipart step session should be cleaned after response");
  assert.deepEqual(
    result.legacy.afterBytes,
    result.legacy.originalBytes,
    "reading legacy tasks must not rewrite their stored task.json"
  );
  assert.equal(result.legacy.readTask?.unitTestProject?.id, "01");
  assert.equal(result.legacy.listedTask?.unitTestProject?.id, "01");
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.legacy.readTask || {}, "pipeline"),
    false,
    "legacy task should remain readable without a pipeline field"
  );

  if (result.platformDocxBytes) {
    assert.deepEqual(result.platformDocxBytes, result.expectedDocxBytes);
    assert.equal(result.runTaskError, null);
    assert.equal(result.storedTask.status, "completed");
  } else {
    assert.equal(result.runTaskError?.code, "software_module_description_output_missing");
    assert.equal(result.storedTask.status, "failed");
    assert.equal(result.storedTask.hermes?.errorCode, "software_module_description_output_missing");
  }
}
