import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createMatlabGatewayApp,
  MatlabGatewayService
} from "../src/matlab-gateway-app.js";
import { listSoftwareDetailStages } from "../src/services/software-detail-stage-catalog.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const fixtureRoot = path.join(
  repoRoot,
  "tests",
  "fixtures",
  "software-detail-container"
);
const composeFiles = [
  path.join(fixtureRoot, "compose.isolated.yaml"),
  path.join(fixtureRoot, "compose.synthetic.yaml")
];
const gatewayToken = "software-detail-synthetic-gateway-token";
const evaluateToken = "software-detail-synthetic-evaluate-token";
const workerToken = "software-detail-synthetic-worker-token";
const expectedStages = listSoftwareDetailStages();

function validatePrebuiltImageReference(image, label) {
  const lastSlashIndex = image.lastIndexOf("/");
  const lastColonIndex = image.lastIndexOf(":");
  if (lastColonIndex <= lastSlashIndex) {
    throw new Error(
      `预构建${label}镜像必须使用带明确标签的精确引用：${image}`
    );
  }
  const repository = image.slice(0, lastColonIndex);
  const tag = image.slice(lastColonIndex + 1);
  if (!repository || repository.endsWith("/") || repository.includes("@")) {
    throw new Error(
      `预构建${label}镜像必须使用带明确标签的精确引用：${image}`
    );
  }
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag)) {
    throw new Error(`预构建${label}镜像标签不符合 Docker 标签语法：${image}`);
  }
  if (tag.toLowerCase() === "latest") {
    throw new Error(`预构建${label}镜像禁止使用 latest 标签：${image}`);
  }
  return image;
}

function resolveImageMode(environment) {
  if (environment.SDD_SYNTHETIC_USE_PREBUILT_IMAGES !== "1") {
    return {
      usePrebuiltImages: false,
      platformImage: "",
      workerImage: ""
    };
  }
  const platformImage = String(
    environment.SDD_SYNTHETIC_PLATFORM_IMAGE || ""
  ).trim();
  const workerImage = String(
    environment.SDD_SYNTHETIC_WORKER_IMAGE || ""
  ).trim();
  assert.ok(
    platformImage,
    "SDD_SYNTHETIC_USE_PREBUILT_IMAGES=1 时必须显式提供 SDD_SYNTHETIC_PLATFORM_IMAGE。"
  );
  assert.ok(
    workerImage,
    "SDD_SYNTHETIC_USE_PREBUILT_IMAGES=1 时必须显式提供 SDD_SYNTHETIC_WORKER_IMAGE。"
  );
  validatePrebuiltImageReference(platformImage, "平台");
  validatePrebuiltImageReference(workerImage, "Worker");
  return {
    usePrebuiltImages: true,
    platformImage,
    workerImage
  };
}

function composeUpArguments(imageMode) {
  if (imageMode.usePrebuiltImages) {
    return [
      "up",
      "--no-build",
      "--detach",
      "--wait",
      "--wait-timeout",
      "240",
      "--pull",
      "never"
    ];
  }
  return [
    "up",
    "--build",
    "--detach",
    "--wait",
    "--wait-timeout",
    "240"
  ];
}

function dockerEnvironment(overrides = {}) {
  const environment = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
    "XDG_CONFIG_HOME"
  ]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return {
    ...environment,
    ...overrides
  };
}

async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: options.cwd || repoRoot,
      env: options.env || dockerEnvironment(),
      timeout: options.timeoutMs || 120_000,
      maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    const output = [
      String(error.stdout || "").trim(),
      String(error.stderr || "").trim()
    ].filter(Boolean).join("\n");
    error.message = `${error.message}${output ? `\n${output}` : ""}`;
    throw error;
  }
}

async function verifyPrebuiltImage(image, label, environment) {
  let result;
  try {
    result = await run(
      "docker",
      ["image", "inspect", "--format", "{{.Architecture}}", image],
      {
        env: environment,
        timeoutMs: 30_000
      }
    );
  } catch (cause) {
    throw new Error(
      `预构建${label}镜像不存在或不可读取：${image}\n${cause.message}`,
      { cause }
    );
  }
  assert.equal(
    result.stdout.trim(),
    "amd64",
    `预构建${label}镜像必须是 amd64 架构：${image}`
  );
}

function composeArgs(envFile, projectName, ...commands) {
  return [
    "compose",
    "--env-file",
    envFile,
    "--project-name",
    projectName,
    "-f",
    composeFiles[0],
    "-f",
    composeFiles[1],
    ...commands
  ];
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function listen(server, host = "0.0.0.0") {
  server.listen(0, host);
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    assert.fail(
      `Expected JSON from ${options.method || "GET"} ${url}; status=${response.status}; body=${text.slice(0, 500)}`
    );
  }
  assert.ok(
    response.ok,
    `${options.method || "GET"} ${url} failed with ${response.status}: ${JSON.stringify(payload)}`
  );
  return { response, payload };
}

async function createPublicTask(platformBaseURL, suffix) {
  const form = new FormData();
  form.append("title", `软件详设容器合成验收 ${suffix}`);
  form.append("unitTestProjectId", "01");
  form.append("workerId", "synthetic-worker");
  form.append(
    "modelSlx",
    new Blob([`synthetic-slx-${suffix}`], {
      type: "application/octet-stream"
    }),
    `${suffix}.slx`
  );
  form.append(
    "modelMat",
    new Blob([`synthetic-mat-${suffix}`], {
      type: "application/octet-stream"
    }),
    `${suffix}.mat`
  );
  const { response, payload } = await requestJson(
    `${platformBaseURL}/api/software-module-description-generation/tasks`,
    {
      method: "POST",
      body: form
    }
  );
  assert.equal(response.status, 202);
  assert.equal(payload.taskStarted, true);
  assert.equal(payload.task?.pipeline?.stages?.length, 9);
  return payload.task;
}

async function waitForPublicTask(platformBaseURL, taskId, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  const observed = [];
  while (Date.now() < deadline) {
    const { payload } = await requestJson(
      `${platformBaseURL}/api/software-module-description-generation/tasks/${encodeURIComponent(taskId)}`
    );
    observed.push({
      taskStatus: payload.status,
      pipelineStatus: payload.pipeline?.status || "",
      stages: (payload.pipeline?.stages || []).map((stage) => stage.status)
    });
    if (payload.status === "completed") return { task: payload, observed };
    if (payload.status === "failed") {
      assert.fail(
        `Public software-detail task failed: ${payload.hermes?.errorCode || ""} ${payload.errorMessage || ""}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(`Timed out waiting for public software-detail task ${taskId}.`);
}

async function readWorkerJob(workerBaseURL, jobId) {
  const { payload } = await requestJson(
    `${workerBaseURL}/internal/software-detail-pipeline/jobs/${encodeURIComponent(jobId)}`,
    {
      headers: {
        authorization: `Bearer ${workerToken}`
      }
    }
  );
  return payload;
}

async function waitForWorkerCleanup(
  workerBaseURL,
  jobId,
  timeoutMs = 30_000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await readWorkerJob(workerBaseURL, jobId);
    if (!job.input?.uploadSessionDir && job.uploadCleanedAt) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`Timed out waiting for Worker upload cleanup: ${jobId}.`);
}

function mapWorkerContainerPathToHost(workerDataDir, containerPath) {
  const containerRoot = "/var/lib/sdg/data";
  const resolved = path.posix.resolve(String(containerPath || ""));
  assert.ok(
    resolved.startsWith(`${containerRoot}/`),
    `Worker path must stay under ${containerRoot}: ${resolved}`
  );
  const relativePath = path.posix.relative(containerRoot, resolved);
  assert.ok(relativePath && !relativePath.startsWith("../"));
  return path.resolve(workerDataDir, ...relativePath.split("/"));
}

function assertImageSkillSnapshotFromSyntheticList(job) {
  assert.equal(
    job.skillRegistry?.schema,
    "software-detail-hermes-skill-registry/v1"
  );
  assert.equal(job.skillRegistry?.discovery?.allDiscovered, true);
  assert.deepEqual(
    job.skillRegistry.stages.map((stage) => stage.stageId),
    expectedStages.map((stage) => stage.id)
  );
  assert.deepEqual(
    job.skillRegistry.stages.map((stage) => stage.name),
    expectedStages.map((stage) => stage.skillName)
  );
  assert.ok(
    job.skillRegistry.stages.every(
      (stage) =>
        /^[a-f0-9]{64}$/.test(stage.bundleHash) &&
        String(stage.installedPath).includes(
          `/software-detail/${stage.name}`
        )
    ),
    "The real nine-skill image snapshot selected by the synthetic skill list must carry installed paths and content hashes."
  );
  assert.match(job.skillRegistry.runtime.bundleHash, /^[a-f0-9]{64}$/);
  assert.match(
    job.skillRegistry.runtime.installedPath,
    /software-detail\/software-detail-runtime$/
  );
}

function assertCompletedWorkerJob(job) {
  assert.equal(job.status, "completed");
  assert.equal(job.stages.length, 9);
  assert.ok(job.stages.every((stage) => stage.status === "completed"));
  assert.deepEqual(
    job.stages.map((stage) => stage.id),
    expectedStages.map((stage) => stage.id)
  );
  const sessions = job.stages.map(
    (stage) => stage.checkpoint?.agent?.sessionId
  );
  assert.equal(new Set(sessions).size, 9);
  assert.ok(
    sessions.every(
      (sessionId, index) =>
        sessionId ===
        `synthetic-${job.jobId}-${expectedStages[index].order}`
    )
  );
  assert.deepEqual(job.hermesSessionIds, sessions);
  assert.equal(job.resources.leaseStatus, "closed");
  assert.equal(job.resources.closeConfirmed, true);
  assert.equal(job.matlabSessionCleaned, true);
  assert.equal(job.input.uploadSessionDir, "");
  assert.ok(job.uploadCleanedAt);
  assertImageSkillSnapshotFromSyntheticList(job);
}

async function downloadAndCheckDocx(platformBaseURL, task, targetPath) {
  const artifact = task.artifacts.find(
    (item) =>
      item.relativePath?.endsWith(".docx") ||
      item.fileName?.endsWith(".docx")
  );
  assert.ok(artifact?.id, "Completed public task must expose a DOCX artifact.");
  const response = await fetch(
    `${platformBaseURL}/api/software-module-description-generation/tasks/${encodeURIComponent(task.id)}/artifacts/${encodeURIComponent(artifact.id)}/download`
  );
  assert.ok(response.ok, `DOCX download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000);
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  await fs.writeFile(targetPath, bytes);
  await run("unzip", ["-t", targetPath], { timeoutMs: 30_000 });
  const documentXml = await run(
    "unzip",
    ["-p", targetPath, "word/document.xml"],
    { timeoutMs: 30_000 }
  );
  assert.match(documentXml.stdout, /软件详设九阶段容器合成验收/);
  assert.match(documentXml.stdout, /不代表真实业务内容验收/);
  return bytes;
}

async function collectComposeLogs(envFile, projectName, env) {
  try {
    const result = await run(
      "docker",
      composeArgs(envFile, projectName, "logs", "--no-color", "--tail", "200"),
      {
        env,
        timeoutMs: 30_000,
        maxBuffer: 16 * 1024 * 1024
      }
    );
    return `${result.stdout || ""}${result.stderr || ""}`.trim();
  } catch (error) {
    return `无法读取合成容器日志：${error.message}`;
  }
}

const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "software-detail-container-synthetic-")
);
const platformDataDir = path.join(root, "platform-data");
const workerDataDir = path.join(root, "worker-data");
const addonDir = path.join(root, "project-addons");
const platformLogDir = path.join(root, "logs", "platform");
const workerLogDir = path.join(root, "logs", "worker");
const gatewayStateDir = path.join(root, "gateway-state");
const emptyEnvFile = path.join(root, "empty.env");
const projectSuffix = `${process.pid}-${Math.random()
  .toString(16)
  .slice(2, 8)}`.toLowerCase();
const projectName = `sdg-sdd-syn-${projectSuffix}`;
const imageMode = resolveImageMode({
  SDD_SYNTHETIC_USE_PREBUILT_IMAGES:
    process.env.SDD_SYNTHETIC_USE_PREBUILT_IMAGES,
  SDD_SYNTHETIC_PLATFORM_IMAGE:
    process.env.SDD_SYNTHETIC_PLATFORM_IMAGE,
  SDD_SYNTHETIC_WORKER_IMAGE:
    process.env.SDD_SYNTHETIC_WORKER_IMAGE
});
const clientRecords = [];
let gatewayServer;
let gatewayService;
let composeStarted = false;
let composeEnvironment;
let testError;
let cleanupError;

try {
  await Promise.all([
    fs.mkdir(platformDataDir, { recursive: true }),
    fs.mkdir(workerDataDir, { recursive: true }),
    fs.mkdir(path.join(addonDir, "01"), { recursive: true }),
    fs.mkdir(platformLogDir, { recursive: true }),
    fs.mkdir(workerLogDir, { recursive: true }),
    fs.mkdir(gatewayStateDir, { recursive: true })
  ]);
  await Promise.all([
    fs.chmod(platformDataDir, 0o777),
    fs.chmod(workerDataDir, 0o777),
    fs.chmod(platformLogDir, 0o777),
    fs.chmod(workerLogDir, 0o777),
    fs.writeFile(
      path.join(addonDir, "01", "init_Global.m"),
      "% software-detail container synthetic addon\n",
      "utf8"
    ),
    fs.writeFile(emptyEnvFile, "", "utf8")
  ]);
  assert.notEqual(
    path.resolve(platformDataDir),
    path.resolve(workerDataDir),
    "平台与 Worker 必须使用不同的宿主运行数据根目录。"
  );

  gatewayService = new MatlabGatewayService({
    rootDir: gatewayStateDir,
    mappingId: "worker-data",
    containerRoot: "/var/lib/sdg/data",
    hostRoot: workerDataDir,
    defaultTimeoutMs: 10_000,
    maxTimeoutMs: 30_000,
    createClient: () => {
      const record = {
        calls: [],
        shutdownCount: 0
      };
      const client = {
        async callTool(name, args) {
          record.calls.push({ name, args });
          return {
            isError: false,
            content: [{ type: "text", text: "synthetic MATLAB result" }]
          };
        },
        async shutdown() {
          record.shutdownCount += 1;
        }
      };
      record.client = client;
      clientRecords.push(record);
      return client;
    }
  });
  const gatewayApp = await createMatlabGatewayApp({
    service: gatewayService,
    authToken: gatewayToken,
    evaluateToken,
    requireAuthToken: true,
    requireEvaluateToken: true,
    runMcpPreflight: false
  });
  gatewayServer = gatewayApp.listen(0, "0.0.0.0");
  await once(gatewayServer, "listening");
  const gatewayPort = gatewayServer.address().port;
  const [platformPort, workerPort] = await Promise.all([
    freePort(),
    freePort()
  ]);

  composeEnvironment = dockerEnvironment({
    SDD_SYNTHETIC_PROJECT_NAME: projectName,
    SDD_SYNTHETIC_PLATFORM_DATA_DIR: platformDataDir,
    SDD_SYNTHETIC_WORKER_DATA_DIR: workerDataDir,
    SDD_SYNTHETIC_ADDON_DIR: addonDir,
    SDD_SYNTHETIC_PLATFORM_LOG_DIR: platformLogDir,
    SDD_SYNTHETIC_WORKER_LOG_DIR: workerLogDir,
    SDD_SYNTHETIC_GATEWAY_PORT: String(gatewayPort),
    SDD_SYNTHETIC_PLATFORM_PORT: String(platformPort),
    SDD_SYNTHETIC_WORKER_PORT: String(workerPort),
    SDD_SYNTHETIC_WORKER_SERVER_FILE: path.join(
      repoRoot,
      "tests",
      "software-detail-container-worker-server.mjs"
    ),
    SDD_SYNTHETIC_PLATFORM_IMAGE:
      imageMode.platformImage ||
      `sdg-software-detail-platform:${projectSuffix}`,
    SDD_SYNTHETIC_WORKER_IMAGE:
      imageMode.workerImage ||
      `sdg-software-detail-worker:${projectSuffix}`
  });

  await run("docker", ["version", "--format", "{{.Server.Version}}"], {
    env: composeEnvironment,
    timeoutMs: 30_000
  }).catch((cause) => {
    throw Object.assign(
      new Error(
        `本地 Docker 服务不可用，无法执行软件详设双容器合成验收：${cause.message}`
      ),
      { code: "software_detail_container_docker_unavailable" }
    );
  });
  if (imageMode.usePrebuiltImages) {
    await Promise.all([
      verifyPrebuiltImage(
        imageMode.platformImage,
        "平台",
        composeEnvironment
      ),
      verifyPrebuiltImage(
        imageMode.workerImage,
        "Worker",
        composeEnvironment
      )
    ]);
    console.log(
      `INFO 使用预构建镜像：平台=${imageMode.platformImage}；Worker=${imageMode.workerImage}；本次不会构建或拉取镜像`
    );
  }
  await run(
    "docker",
    composeArgs(emptyEnvFile, projectName, "config", "--quiet"),
    {
      env: composeEnvironment,
      timeoutMs: 30_000
    }
  );
  await run(
    "docker",
    composeArgs(
      emptyEnvFile,
      projectName,
      ...composeUpArguments(imageMode)
    ),
    {
      env: composeEnvironment,
      timeoutMs: 30 * 60_000
    }
  );
  composeStarted = true;

  const platformBaseURL = `http://127.0.0.1:${platformPort}`;
  const workerBaseURL = `http://127.0.0.1:${workerPort}`;
  const [taskA, taskB] = await Promise.all([
    createPublicTask(platformBaseURL, "SyntheticA"),
    createPublicTask(platformBaseURL, "SyntheticB")
  ]);
  assert.notEqual(taskA.id, taskB.id);

  const [resultA, resultB] = await Promise.all([
    waitForPublicTask(platformBaseURL, taskA.id),
    waitForPublicTask(platformBaseURL, taskB.id)
  ]);
  for (const result of [resultA, resultB]) {
    assert.equal(result.task.pipeline.status, "completed");
    assert.equal(result.task.pipeline.stages.length, 9);
    assert.ok(
      result.task.pipeline.stages.every(
        (stage) => stage.status === "completed" && stage.attempt === 1
      )
    );
    assert.deepEqual(
      result.task.pipeline.stages.map((stage) => stage.skillName),
      expectedStages.map((stage) => stage.skillName)
    );
  }
  assert.notEqual(
    resultA.task.pipeline.workerJobId,
    resultB.task.pipeline.workerJobId
  );

  const [workerJobA, workerJobB] = await Promise.all([
    waitForWorkerCleanup(workerBaseURL, resultA.task.pipeline.workerJobId),
    waitForWorkerCleanup(workerBaseURL, resultB.task.pipeline.workerJobId)
  ]);
  assertCompletedWorkerJob(workerJobA);
  assertCompletedWorkerJob(workerJobB);
  assert.notEqual(workerJobA.input.workspaceDir, workerJobB.input.workspaceDir);
  assert.notEqual(workerJobA.resources.leaseId, workerJobB.resources.leaseId);
  for (const workerJob of [workerJobA, workerJobB]) {
    const cleanedHostUploadDir = mapWorkerContainerPathToHost(
      workerDataDir,
      workerJob.input.workspaceDir
    );
    const cleanedStat = await fs.stat(cleanedHostUploadDir).catch(() => null);
    assert.equal(
      cleanedStat,
      null,
      `Worker upload session must be removed from disk: ${cleanedHostUploadDir}`
    );
  }
  assert.equal(
    new Set([
      ...workerJobA.hermesSessionIds,
      ...workerJobB.hermesSessionIds
    ]).size,
    18
  );

  const [docxA, docxB] = await Promise.all([
    downloadAndCheckDocx(
      platformBaseURL,
      resultA.task,
      path.join(root, "SyntheticA.docx")
    ),
    downloadAndCheckDocx(
      platformBaseURL,
      resultB.task,
      path.join(root, "SyntheticB.docx")
    )
  ]);
  assert.notDeepEqual(docxA, docxB);

  assert.equal(clientRecords.length, 2, "每个任务必须只建立一个 MATLAB 客户端租约。");
  assert.ok(
    clientRecords.every(
      (record) => record.calls.length === 0 && record.shutdownCount === 1
    ),
    "合成阶段不调用 MATLAB 工具，但每个真实租约必须被关闭一次。"
  );
  const leases = [...gatewayService.activeLeases.values()];
  assert.equal(leases.length, 2);
  assert.ok(leases.every((lease) => lease.status === "closed"));
  assert.equal(new Set(leases.map((lease) => lease.ownerJobId)).size, 2);

  console.log(
    "PASS software-detail synthetic container flow: two Platform/Worker containers, public upload, a synthetic skill list mapped to the real nine-skill image snapshot/hash, nine synthetic session IDs per task, one Gateway lease per task, python-docx output, cleanup, and task isolation verified"
  );
  console.log(
    "NOTE synthetic only: Hermes generation, Hermes skill-list discovery, Hermes session IDs, and MATLAB tool calls were replaced; only the real nine-skill image snapshot/hash is checked, while real Hermes discovery, real Hermes sessions, and real business-input acceptance remain pending"
  );
} catch (error) {
  testError = error;
  if (composeEnvironment) {
    const logs = await collectComposeLogs(
      emptyEnvFile,
      projectName,
      composeEnvironment
    );
    if (logs) {
      error.message = `${error.message}\n--- synthetic container logs ---\n${logs}`;
    }
  }
  throw error;
} finally {
  if (composeEnvironment) {
    try {
      await run(
        "docker",
        composeArgs(
          emptyEnvFile,
          projectName,
          "down",
          "--volumes",
          "--remove-orphans",
          "--timeout",
          "10"
        ),
        {
          env: composeEnvironment,
          timeoutMs: 120_000
        }
      );
    } catch (error) {
      cleanupError = error;
    }
  } else if (composeStarted) {
    cleanupError = new Error("合成容器已启动但缺少清理环境。");
  }
  try {
    await close(gatewayServer);
  } catch (error) {
    cleanupError ||= error;
  }
  if (gatewayService) {
    await Promise.all(
      [...gatewayService.activeLeases.values()]
        .filter((lease) => lease.client && lease.status !== "closed")
        .map((lease) => lease.client.shutdown?.().catch(() => {}))
    );
  }
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch (error) {
    cleanupError ||= error;
  }
  if (!testError && cleanupError) {
    throw cleanupError;
  }
}
