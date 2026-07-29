import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { createHermesApp } from "../src/hermes-app.js";
import { SkillDatabaseService } from "../src/services/skill-database-service.js";
import { SoftwareDetailPipelineJobService } from "../src/services/software-detail-pipeline-job-service.js";
import { listSoftwareDetailStages } from "../src/services/software-detail-stage-catalog.js";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const DOCX_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FETCH_FORBIDDEN_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53,
  69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115,
  117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512,
  513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587,
  601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045,
  4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679,
  6697, 10080
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description, probe, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15000);
  const intervalMs = Number(options.intervalMs || 20);
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await probe();
    if (latest) return latest;
    await sleep(intervalMs);
  }
  throw new Error(
    `等待“${description}”超时（${timeoutMs}ms）；最后一次结果：${JSON.stringify(latest)}`
  );
}

async function startServer(app) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = Number(server.address()?.port || 0);
    if (port > 0 && !FETCH_FORBIDDEN_PORTS.has(port)) {
      return {
        server,
        baseURL: `http://127.0.0.1:${port}`
      };
    }
    await new Promise((resolve) => server.close(resolve));
  }
  throw new Error("无法取得可供 Fetch 使用的本地测试端口。");
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function seedPlatformSkills(root) {
  const legacyDir = path.join(root, "skills", "legacy");
  const examplesDir = path.join(legacyDir, "examples");
  await fs.mkdir(examplesDir, { recursive: true });
  for (const name of [
    "requirement_extraction.md",
    "requirement_writing.md",
    "requirement_validation.md"
  ]) {
    await fs.writeFile(path.join(legacyDir, name), `# ${name}\n`, "utf8");
  }
  await fs.writeFile(
    path.join(examplesDir, "good_examples.md"),
    "# 合格示例\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(examplesDir, "bad_examples.md"),
    "# 不合格示例\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(legacyDir, "domain-knowledge.json"),
    `${JSON.stringify({
      version: 1,
      examples: [],
      ruleHints: [{ scope: "wave4-http-flow" }],
      antiPatterns: []
    })}\n`,
    "utf8"
  );
}

function configureIsolatedRuntime(root) {
  const dataDir = path.join(root, "platform-data");
  const skillsDir = path.join(root, "skills");
  Object.assign(config, {
    rootDir: root,
    publicDir: path.join(REPOSITORY_ROOT, "public"),
    legacySkillDir: path.join(skillsDir, "legacy"),
    activeSkillDir: path.join(skillsDir, "active"),
    skillBundleDir: path.join(skillsDir, "bundles"),
    generationTaskArtifactDir: path.join(dataDir, "generation-task-artifacts"),
    replayTaskArtifactDir: path.join(dataDir, "replay-task-artifacts"),
    dataDir,
    skillDatabasePath: path.join(dataDir, "skills.sqlite"),
    projectStoreDir: path.join(dataDir, "projects"),
    uploadDir: path.join(dataDir, "uploads"),
    llmProfileStorePath: path.join(dataDir, "llm-profiles.json"),
    skillRefinementDir: path.join(dataDir, "skill-refinement"),
    skillRefinementCaseDir: path.join(dataDir, "skill-refinement", "cases"),
    skillRefinementRunDir: path.join(dataDir, "skill-refinement", "runs"),
    skillRefinementEvaluationDir: path.join(
      dataDir,
      "skill-refinement",
      "evaluations"
    ),
    skillRefinementAuditDir: path.join(dataDir, "skill-refinement", "audit"),
    skillRefinementBundleMetaDir: path.join(
      dataDir,
      "skill-refinement",
      "bundles"
    ),
    skillBundleSnapshotDir: path.join(
      dataDir,
      "skill-refinement",
      "bundle-snapshots"
    ),
    skillRefinementUploadDir: path.join(
      dataDir,
      "skill-refinement",
      "uploads"
    ),
    activeSkillBundlePointerPath: path.join(
      dataDir,
      "skill-refinement",
      "active-bundle.json"
    ),
    skillRuleDir: path.join(dataDir, "skill-rules"),
    skillRuleChangeLogPath: path.join(
      dataDir,
      "skill-rules",
      "change-log.json"
    ),
    rejectionStoreDir: path.join(dataDir, "rejections"),
    rejectionGroupStorePath: path.join(dataDir, "rejections", "groups.json"),
    replayTaskStoreDir: path.join(dataDir, "replay-tasks"),
    skillWorkOrderStoreDir: path.join(dataDir, "skill-work-orders"),
    feedbackTicketStoreDir: path.join(dataDir, "feedback-tickets"),
    feedbackTicketUploadDir: path.join(dataDir, "uploads", "feedback-tickets"),
    skillVersioning: {
      directActiveSkillItemWrites: "allow"
    }
  });
  config.unitTestCase = {
    ...config.unitTestCase,
    taskStoreDir: path.join(dataDir, "unit-test-case-generation", "tasks"),
    uploadTempDir: path.join(
      dataDir,
      "unit-test-case-generation",
      "_incoming"
    ),
    projectRegistryPath: path.join(
      dataDir,
      "unit-test-case-generation",
      "projects.json"
    ),
    projectAdminCode: "114301",
    defaultProjects: "01_合成测试",
    projectAddonRoot: path.join(root, "project-addons"),
    agentWorkspaceRoot: "",
    defaultWorkerId: "wave4-worker",
    workerProfiles: [],
    remotePollWindowMs: 1200,
    reconcileIntervalMs: 50
  };
  config.softwareModuleDescription = {
    ...config.softwareModuleDescription,
    taskStoreDir: path.join(
      dataDir,
      "software-module-description-generation",
      "tasks"
    ),
    uploadTempDir: path.join(
      dataDir,
      "software-module-description-generation",
      "_incoming"
    ),
    agentWorkspaceRoot: "",
    reconcileIntervalMs: 50
  };
  config.hermes = {
    ...config.hermes,
    transport: "api",
    host: "127.0.0.1",
    port: 0,
    baseURL: "http://127.0.0.1:0",
    apiMode: "upload",
    authToken: "",
    uploadTempDir: path.join(root, "worker", "uploads"),
    timeoutMs: 10000
  };
  config.tcsdPipeline = {
    ...config.tcsdPipeline,
    jobStoreDir: path.join(root, "worker", "tcsd-jobs")
  };
  config.softwareDetailPipeline = {
    ...config.softwareDetailPipeline,
    jobStoreDir: path.join(root, "worker", "software-detail-jobs")
  };
}

function registrySnapshot() {
  return {
    schema: "software-detail-hermes-skill-registry/v1",
    profile: "wave4-fake",
    discovery: { allDiscovered: true },
    runtime: {
      bundleHash: "wave4-runtime",
      installedPath: "/fake/software-detail-runtime"
    },
    stages: listSoftwareDetailStages().map((stage) => ({
      stageId: stage.id,
      name: stage.skillName,
      version: "1.0.0",
      bundleHash: `wave4-${stage.id}`,
      installedPath: `/fake/${stage.id}`
    }))
  };
}

class RecordingLeaseClient {
  constructor(eventLog) {
    this.eventLog = eventLog;
    this.created = [];
    this.read = [];
    this.closed = [];
    this.active = new Map();
  }

  async createJobLease(input) {
    const lease = {
      ownerJobId: input.ownerJobId,
      workspaceId: input.workspaceId,
      leaseId: input.leaseId,
      matlabSessionId: `fake-matlab-${input.ownerJobId}`,
      status: "active"
    };
    assert.equal(this.active.has(lease.ownerJobId), false);
    this.active.set(lease.ownerJobId, lease);
    this.created.push(structuredClone(lease));
    this.eventLog.push({
      type: "lease-created",
      jobId: lease.ownerJobId,
      leaseId: lease.leaseId
    });
    return lease;
  }

  async getJobLease(input) {
    const lease = this.active.get(input.ownerJobId);
    assert.ok(lease, `任务 ${input.ownerJobId} 必须复用已创建的 MATLAB 会话`);
    assert.equal(input.workspaceId, lease.workspaceId);
    assert.equal(input.leaseId, lease.leaseId);
    assert.equal(input.matlabSessionId, lease.matlabSessionId);
    this.read.push(structuredClone(input));
    return { ...lease };
  }

  async closeJobLease(input) {
    const lease = this.active.get(input.ownerJobId);
    assert.ok(lease, `任务 ${input.ownerJobId} 必须关闭自己的 MATLAB 会话`);
    this.closed.push(structuredClone(input));
    this.active.delete(input.ownerJobId);
    this.eventLog.push({
      type: "lease-closed",
      jobId: input.ownerJobId,
      leaseId: input.leaseId
    });
    return {
      ...lease,
      status: "closed",
      confirmed: true
    };
  }

  hermesEnvironment(lease) {
    return {
      SOFTWARE_DETAIL_MATLAB_LEASE_ID: lease.leaseId
    };
  }
}

class RecordingStageExecutor {
  constructor(eventLog) {
    this.eventLog = eventLog;
    this.calls = [];
    this.docxByJobId = new Map();
  }

  async execute(context) {
    const sessionId = `fake-hermes-${context.job.jobId}-${context.definition.order}`;
    const call = {
      jobId: context.job.jobId,
      taskId: context.job.taskId,
      stageId: context.definition.id,
      order: context.definition.order,
      skillName: context.definition.skillName,
      sessionId,
      workspaceDir: context.job.input.workspaceDir,
      leaseId: context.lease.leaseId,
      matlabSessionId: context.lease.matlabSessionId
    };
    this.calls.push(call);
    this.eventLog.push({
      type: "stage-started",
      jobId: call.jobId,
      stageId: call.stageId
    });

    await fs.mkdir(path.dirname(context.manifestPath), { recursive: true });
    await fs.writeFile(
      context.manifestPath,
      `${JSON.stringify({
        schema: "software-detail-wave4-stage-input/v1",
        jobId: context.job.jobId,
        stageId: context.definition.id,
        skillName: context.definition.skillName,
        inputs: context.stageInput.artifacts
      })}\n`,
      "utf8"
    );

    // 延迟让公开任务详情能够稳定观察到中间阶段快照。
    await sleep(250);
    for (const artifact of context.outputArtifacts) {
      if (artifact.role === "matlab-session-lease") continue;
      const absolutePath = path.join(
        context.job.input.workspaceDir,
        ...artifact.relativePath.split("/")
      );
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      if (artifact.role === "detail-design-docx") {
        const bytes = Buffer.concat([
          DOCX_HEADER,
          Buffer.from(`wave4-http-${context.job.jobId}`, "utf8")
        ]);
        this.docxByJobId.set(context.job.jobId, bytes);
        await fs.writeFile(absolutePath, bytes);
      } else {
        const semanticPayload =
          artifact.role === "hierarchy-manifest"
            ? {
                schema: "software-detail-hierarchy-manifest/v1",
                documentUnits: [
                  {
                    path: "Model/A01_Function",
                    allowedOutputs: ["A01_Output"]
                  }
                ],
                analysisUnits: []
              }
            : artifact.role === "analysis-queue"
              ? {
                  schema: "software-detail-analysis-queue/v1",
                  items: [
                    {
                      parentDocumentUnit: "Model/A01_Function",
                      analysisUnit: "Model/A01_Function",
                      scope: "document_unit_direct_fallback"
                    }
                  ]
                }
              : artifact.role === "evidence-shards"
                ? {
                    schema: "software-detail-evidence-shards/v1",
                    shards: [
                      {
                        parentDocumentUnitPath: "Model/A01_Function",
                        analysisUnitPath: "Model/A01_Function",
                        scope: "document_unit_direct_fallback",
                        outports: [{ name: "A01_Output" }],
                        limitations: []
                      }
                    ]
                  }
                : {
                    schema: "software-detail-wave4-artifact/v1",
                    jobId: context.job.jobId,
                    stageId: context.definition.id,
                    role: artifact.role
                  };
        await fs.writeFile(
          absolutePath,
          `${JSON.stringify(semanticPayload)}\n`,
          "utf8"
        );
      }
    }

    const candidate = {
      schema: "software-detail-minimal-stage-result/v1",
      jobId: context.job.jobId,
      stageId: context.definition.id,
      attempt: context.stageInput.attempt,
      status: "completed",
      artifacts: context.outputArtifacts.map((artifact) => ({
        role: artifact.role,
        relativePath: artifact.relativePath
      }))
    };
    await fs.writeFile(
      context.candidateResultPath,
      `${JSON.stringify(candidate)}\n`,
      "utf8"
    );
    this.eventLog.push({
      type: "stage-artifacts-written",
      jobId: call.jobId,
      stageId: call.stageId
    });
    return {
      sessionId,
      profile: "wave4-fake",
      durationMs: 250,
      stdoutBytes: 0,
      stderrBytes: 0
    };
  }
}

function createUploadForm(modelName, marker) {
  const form = new FormData();
  form.set(
    "modelSlx",
    new Blob([`slx-${marker}`], { type: "application/octet-stream" }),
    `${modelName}.slx`
  );
  form.set(
    "modelMat",
    new Blob([`mat-${marker}`], { type: "application/octet-stream" }),
    `${modelName}.mat`
  );
  form.set(
    "modelInitScript",
    new Blob([`% init ${marker}`], { type: "text/plain" }),
    `${modelName}_init.m`
  );
  form.set("projectId", "01");
  form.set("workerId", "wave4-worker");
  form.set("title", `${modelName} 软件详设`);
  return form;
}

async function fetchTask(baseURL, taskId) {
  const response = await fetch(
    `${baseURL}/api/software-module-description-generation/tasks/${encodeURIComponent(taskId)}`
  );
  assert.equal(response.status, 200);
  return response.json();
}

function assertInitialPipeline(task) {
  const catalog = listSoftwareDetailStages();
  assert.equal(task.status, "queued");
  assert.equal(task.pipeline.stages.length, 9);
  assert.deepEqual(
    task.pipeline.stages.map((stage) => stage.id),
    catalog.map((stage) => stage.id)
  );
  assert.deepEqual(
    task.pipeline.stages.map((stage) => stage.skillName),
    catalog.map((stage) => stage.skillName)
  );
  assert.ok(
    task.pipeline.stages.every(
      (stage) => stage.status === "pending" && stage.attempt === 0
    )
  );
}

function assertJobExecution(job, executor, leaseClient, eventLog) {
  const catalog = listSoftwareDetailStages();
  const calls = executor.calls.filter((call) => call.jobId === job.jobId);
  assert.equal(calls.length, 9);
  assert.deepEqual(
    calls.map((call) => call.stageId),
    catalog.map((stage) => stage.id)
  );
  assert.deepEqual(
    calls.map((call) => call.skillName),
    catalog.map((stage) => stage.skillName)
  );
  assert.equal(new Set(calls.map((call) => call.sessionId)).size, 9);
  assert.equal(new Set(calls.map((call) => call.leaseId)).size, 1);
  assert.equal(new Set(calls.map((call) => call.matlabSessionId)).size, 1);
  assert.equal(
    leaseClient.created.filter((lease) => lease.ownerJobId === job.jobId).length,
    1
  );
  assert.equal(
    leaseClient.closed.filter((lease) => lease.ownerJobId === job.jobId).length,
    1
  );
  assert.equal(
    leaseClient.read.filter((lease) => lease.ownerJobId === job.jobId).length,
    8
  );
  const finalWrittenIndex = eventLog.findIndex(
    (event) =>
      event.type === "stage-artifacts-written" &&
      event.jobId === job.jobId &&
      event.stageId === catalog.at(-1).id
  );
  const finalValidatedIndex = eventLog.findIndex(
    (event) =>
      event.type === "stage-artifacts-validated" &&
      event.jobId === job.jobId &&
      event.stageId === catalog.at(-1).id
  );
  const closeIndex = eventLog.findIndex(
    (event) => event.type === "lease-closed" && event.jobId === job.jobId
  );
  assert.ok(
    finalWrittenIndex >= 0 &&
      finalValidatedIndex > finalWrittenIndex &&
      closeIndex > finalValidatedIndex
  );
}

const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "software-detail-full-http-flow-")
);
const originalConfig = { ...config };
let workerServer;
let platformServer;
let platformApp;

try {
  configureIsolatedRuntime(root);
  await fs.mkdir(path.dirname(config.skillDatabasePath), { recursive: true });
  await seedPlatformSkills(root);
  await fs.mkdir(path.join(config.unitTestCase.projectAddonRoot, "01"), {
    recursive: true
  });
  await fs.writeFile(
    path.join(config.unitTestCase.projectAddonRoot, "01", "init_Global.m"),
    "% synthetic addon\n",
    "utf8"
  );

  const eventLog = [];
  const executor = new RecordingStageExecutor(eventLog);
  const leaseClient = new RecordingLeaseClient(eventLog);
  let jobSequence = 0;
  const jobs = new SoftwareDetailPipelineJobService({
    jobDir: config.softwareDetailPipeline.jobStoreDir,
    executor,
    leaseClient,
    prepareJob: async () => registrySnapshot(),
    idFactory: () => `wave4-worker-job-${++jobSequence}`
  });
  const originalValidateCandidate = jobs.validateCandidate.bind(jobs);
  jobs.validateCandidate = async (...args) => {
    const validated = await originalValidateCandidate(...args);
    eventLog.push({
      type: "stage-artifacts-validated",
      jobId: args[0].jobId,
      stageId: args[1].id
    });
    return validated;
  };
  const uploadSessions = new Map();
  const originalStart = jobs.start.bind(jobs);
  jobs.start = async (input) => {
    const job = await originalStart(input);
    uploadSessions.set(job.jobId, job.input.uploadSessionDir);
    return job;
  };

  const workerApp = await createHermesApp({ softwareDetailJobs: jobs });
  ({ server: workerServer, baseURL: config.hermes.baseURL } =
    await startServer(workerApp));
  const workerBaseURL = config.hermes.baseURL;
  config.unitTestCase.workerProfiles = [
    {
      id: "wave4-worker",
      label: "Wave4 合成 Worker",
      hermesTransport: "api",
      hermesBaseURL: workerBaseURL,
      hermesApiMode: "upload",
      hermesAuthToken: "",
      matlabBaseURL: "http://127.0.0.1:1",
      matlabHttpMode: "path",
      matlabAuthToken: "",
      isDefault: true
    }
  ];

  platformApp = await createApp();
  const platformRuntime = await startServer(platformApp);
  platformServer = platformRuntime.server;
  const platformBaseURL = platformRuntime.baseURL;

  const firstResponse = await fetch(
    `${platformBaseURL}/api/software-module-description-generation/tasks`,
    {
      method: "POST",
      body: createUploadForm("Wave4First", "first")
    }
  );
  assert.equal(firstResponse.status, 202);
  const firstCreated = await firstResponse.json();
  assert.equal(firstCreated.taskStarted, true);
  assertInitialPipeline(firstCreated.task);

  let latestFirstTask = firstCreated.task;
  const firstIntermediate = await waitFor(
    "公开任务详情出现九阶段中间状态",
    async () => {
      const task = await fetchTask(platformBaseURL, firstCreated.task.id);
      latestFirstTask = task;
      if (task.status === "failed") {
        throw new Error(
          `第一个公开任务在观察中间阶段前失败：${JSON.stringify(task)}`
        );
      }
      return task.status === "running" &&
        task.pipeline.stages.some((stage) =>
          ["running", "completed"].includes(stage.status)
        )
        ? task
        : null;
    },
    { timeoutMs: 4000 }
  ).catch((error) => {
    error.message += `；最新任务：${JSON.stringify(latestFirstTask)}`;
    throw error;
  });
  assert.ok(
    firstIntermediate.pipeline.stages.some((stage) =>
      ["running", "completed"].includes(stage.status)
    )
  );

  const secondResponse = await fetch(
    `${platformBaseURL}/api/software-module-description-generation/tasks`,
    {
      method: "POST",
      body: createUploadForm("Wave4Second", "second")
    }
  );
  assert.equal(secondResponse.status, 202);
  const secondCreated = await secondResponse.json();
  assertInitialPipeline(secondCreated.task);

  const firstWorkerJob = await waitFor(
    "第一个 Worker 九阶段作业完成",
    async () => {
      const all = await jobs.list();
      const job = all.find((candidate) => candidate.taskId === firstCreated.task.id);
      return job?.status === "completed" ? job : null;
    },
    { timeoutMs: 6000 }
  );
  const firstUploadSession = uploadSessions.get(firstWorkerJob.jobId);
  assert.ok(firstUploadSession);
  assert.equal((await fs.stat(firstUploadSession)).isDirectory(), true);

  const firstWorkerResponse = await fetch(
    `${workerBaseURL}/internal/software-detail-pipeline/jobs/${firstWorkerJob.jobId}`
  );
  assert.equal(firstWorkerResponse.status, 200);
  const firstWorkerEnvelope = await firstWorkerResponse.json();
  const firstWorkerDocx = firstWorkerEnvelope.artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  );
  const firstExpectedDocx = executor.docxByJobId.get(firstWorkerJob.jobId);
  assert.equal(firstWorkerDocx.encoding, "base64");
  assert.equal(firstWorkerDocx.contentBase64, firstExpectedDocx.toString("base64"));
  assert.equal(firstWorkerDocx.size, firstExpectedDocx.length);
  assert.equal(firstWorkerDocx.sha256, sha256(firstExpectedDocx));
  assert.equal(firstWorkerDocx.relativePath, "outputs/Wave4First-software-detail-design.docx");

  const secondWorkerJob = await waitFor(
    "第二个 Worker 九阶段作业完成",
    async () => {
      const all = await jobs.list();
      const job = all.find(
        (candidate) => candidate.taskId === secondCreated.task.id
      );
      return job?.status === "completed" ? job : null;
    },
    { timeoutMs: 7000 }
  );
  const secondUploadSession = uploadSessions.get(secondWorkerJob.jobId);
  assert.ok(secondUploadSession);
  assert.equal((await fs.stat(secondUploadSession)).isDirectory(), true);

  const secondWorkerResponse = await fetch(
    `${workerBaseURL}/internal/software-detail-pipeline/jobs/${secondWorkerJob.jobId}`
  );
  assert.equal(secondWorkerResponse.status, 200);
  const secondWorkerEnvelope = await secondWorkerResponse.json();
  const secondWorkerDocx = secondWorkerEnvelope.artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  );
  const secondExpectedDocx = executor.docxByJobId.get(secondWorkerJob.jobId);
  assert.equal(secondWorkerDocx.encoding, "base64");
  assert.equal(
    secondWorkerDocx.contentBase64,
    secondExpectedDocx.toString("base64")
  );
  assert.equal(secondWorkerDocx.size, secondExpectedDocx.length);
  assert.equal(secondWorkerDocx.sha256, sha256(secondExpectedDocx));
  assert.equal(secondWorkerDocx.relativePath, "outputs/Wave4Second-software-detail-design.docx");

  const firstCompleted = await waitFor(
    "平台后台对账完成第一个公开任务",
    async () => {
      const task = await fetchTask(platformBaseURL, firstCreated.task.id);
      return task.status === "completed" &&
        task.pipeline.cleanup.status === "completed"
        ? task
        : null;
    },
    { timeoutMs: 9000 }
  );
  const secondCompleted = await waitFor(
    "平台后台对账完成第二个公开任务",
    async () => {
      const task = await fetchTask(platformBaseURL, secondCreated.task.id);
      return task.status === "completed" &&
        task.pipeline.cleanup.status === "completed"
        ? task
        : null;
    },
    { timeoutMs: 9000 }
  );

  for (const [completed, expectedFileName] of [
    [firstCompleted, "Wave4First-software-detail-design.docx"],
    [secondCompleted, "Wave4Second-software-detail-design.docx"]
  ]) {
    assert.equal(completed.pipeline.status, "completed");
    assert.equal(completed.pipeline.cleanup.status, "completed");
    assert.equal(completed.pipeline.stages.length, 9);
    assert.ok(
      completed.pipeline.stages.every((stage) => stage.status === "completed")
    );
    assert.deepEqual(
      completed.pipeline.stages.map((stage) => stage.skillName),
      listSoftwareDetailStages().map((stage) => stage.skillName)
    );
    assert.equal(completed.artifacts.length, 1);
    assert.equal(
      completed.artifacts[0].kind,
      "software_module_description_docx"
    );
    assert.equal(completed.artifacts[0].relativePath, `outputs/${expectedFileName}`);
    assert.equal(completed.artifacts[0].fileName, expectedFileName);
  }

  const completedPairs = [
    [firstCompleted, firstExpectedDocx],
    [secondCompleted, secondExpectedDocx]
  ];
  for (const [completed, expectedDocx] of completedPairs) {
    const artifact = completed.artifacts[0];
    assert.equal(artifact.size, expectedDocx.length);
    const downloadResponse = await fetch(
      `${platformBaseURL}/api/software-module-description-generation/tasks/${completed.id}/artifacts/${artifact.id}/download`
    );
    assert.equal(downloadResponse.status, 200);
    assert.match(
      downloadResponse.headers.get("content-disposition") || "",
      new RegExp(artifact.fileName.replace(/[.]/g, "\\."))
    );
    assert.deepEqual(
      Buffer.from(await downloadResponse.arrayBuffer()),
      expectedDocx
    );
    const outputDir = path.join(
      config.softwareModuleDescription.taskStoreDir,
      completed.id,
      "workspace",
      "outputs"
    );
    const outputNames = await fs.readdir(outputDir);
    assert.deepEqual(outputNames, [artifact.fileName]);
  }

  assertJobExecution(firstWorkerJob, executor, leaseClient, eventLog);
  assertJobExecution(secondWorkerJob, executor, leaseClient, eventLog);
  assert.equal(new Set(executor.calls.map((call) => call.sessionId)).size, 18);
  assert.notEqual(firstWorkerJob.jobId, secondWorkerJob.jobId);
  assert.notEqual(
    firstWorkerJob.input.workspaceDir,
    secondWorkerJob.input.workspaceDir
  );
  assert.notEqual(
    firstWorkerJob.resources.workspaceId,
    secondWorkerJob.resources.workspaceId
  );
  assert.notEqual(
    firstWorkerJob.resources.leaseId,
    secondWorkerJob.resources.leaseId
  );
  assert.notEqual(
    firstWorkerJob.resources.matlabSessionId,
    secondWorkerJob.resources.matlabSessionId
  );
  assert.notDeepEqual(firstExpectedDocx, secondExpectedDocx);

  await assert.rejects(() => fs.stat(firstUploadSession), {
    code: "ENOENT"
  });
  await assert.rejects(() => fs.stat(secondUploadSession), {
    code: "ENOENT"
  });
  const persistedWorkerJobs = await jobs.list();
  assert.ok(
    persistedWorkerJobs.every(
      (job) => job.input.uploadSessionDir === "" && job.uploadCleanedAt
    )
  );

  console.log(
    "Software-detail full HTTP flow passed with synthetic Hermes/MATLAB: public upload, nine stages, DOCX transfer/download, reconciliation, cleanup, and two-job isolation."
  );
} finally {
  clearInterval(platformApp?.locals?.tcsdReconcileTimer);
  clearInterval(platformApp?.locals?.softwareDetailReconcileTimer);
  await closeServer(platformServer);
  await closeServer(workerServer);
  SkillDatabaseService.closeAll();
  Object.assign(config, originalConfig);
  await fs.rm(root, { recursive: true, force: true });
}
