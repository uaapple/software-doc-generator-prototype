import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config.js";
import { SoftwareModuleDescriptionGenerationService } from "../src/services/software-module-description-generation-service.js";
import {
  listSoftwareDetailStages,
  SOFTWARE_DETAIL_STAGE_CATALOG_VERSION
} from "../src/services/software-detail-stage-catalog.js";
import { SOFTWARE_DETAIL_JOB_SCHEMA } from "../src/services/software-detail-pipeline-contract.js";

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function restoreSection(target, snapshot) {
  for (const key of Object.keys(target)) {
    if (!(key in snapshot)) {
      delete target[key];
    }
  }
  Object.assign(target, snapshot);
}

async function withTestConfig(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-platform-pipeline-"));
  const snapshots = {
    unitTestCase: structuredClone(config.unitTestCase),
    softwareModuleDescription: structuredClone(config.softwareModuleDescription)
  };
  Object.assign(config.unitTestCase, {
    taskStoreDir: path.join(root, "unused-unit-test-tasks"),
    uploadTempDir: path.join(root, "unused-unit-test-incoming"),
    projectRegistryPath: path.join(root, "projects.json"),
    defaultProjects: "01_楚能",
    defaultWorkerId: "worker-01",
    workerProfiles: [
      {
        id: "worker-01",
        label: "测试 Worker",
        isDefault: true,
        hermesTransport: "api",
        hermesBaseURL: "http://worker.invalid",
        hermesApiMode: "upload",
        hermesAuthToken: ""
      }
    ]
  });
  Object.assign(config.softwareModuleDescription, {
    taskStoreDir: path.join(root, "tasks"),
    uploadTempDir: path.join(root, "incoming"),
    agentWorkspaceRoot: ""
  });
  try {
    await run(root);
  } finally {
    restoreSection(config.unitTestCase, snapshots.unitTestCase);
    restoreSection(config.softwareModuleDescription, snapshots.softwareModuleDescription);
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function uploadFile(root, fileName, content = fileName) {
  const uploadDir = path.join(root, "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `${Date.now()}-${Math.random()}-${fileName}`);
  await fs.writeFile(filePath, content);
  return {
    path: filePath,
    originalname: fileName,
    mimetype: "application/octet-stream",
    size: Buffer.byteLength(content)
  };
}

async function createTask(service, root, suffix = "Demo", includeInit = false) {
  const files = {
    modelSlx: [await uploadFile(root, `${suffix}.slx`, `slx-${suffix}`)],
    modelMat: [await uploadFile(root, `${suffix}.mat`, `mat-${suffix}`)]
  };
  if (includeInit) {
    files.modelInitScript = [
      await uploadFile(root, `${suffix}_init.m`, `% init ${suffix}`)
    ];
  }
  return service.createTask(files, {
    title: `${suffix} 软件详设`,
    projectId: "01",
    workerId: "worker-01"
  });
}

function stageRecords(options = {}) {
  const completedCount = Number(options.completedCount || 0);
  const runningIndex = Number.isInteger(options.runningIndex)
    ? options.runningIndex
    : -1;
  const failedIndex = Number.isInteger(options.failedIndex)
    ? options.failedIndex
    : -1;
  return listSoftwareDetailStages().map((definition, index) => {
    let status = "pending";
    if (index < completedCount) status = "completed";
    if (index === runningIndex) status = "running";
    if (index === failedIndex) status = "failed";
    return {
      id: definition.id,
      order: definition.order,
      status,
      attempt: status === "pending" ? 0 : 1,
      startedAt: status === "pending" ? "" : `2026-07-29T00:00:${String(index).padStart(2, "0")}.000Z`,
      endedAt: ["completed", "failed"].includes(status)
        ? `2026-07-29T00:01:${String(index).padStart(2, "0")}.000Z`
        : "",
      error: status === "failed"
        ? {
            code: "software_detail_stage_fixture_failed",
            message: `阶段 ${index + 1} 测试失败。`,
            details: { stageId: definition.id }
          }
        : null,
      checkpoint: status === "completed"
        ? {
            artifacts: definition.outputs.map((artifact) => ({
              role: artifact.role,
              relativePath: `.software-detail/${definition.id}/${artifact.role}.json`,
              size: index + 1,
              sha256: "a".repeat(64)
            }))
          }
        : null
    };
  });
}

function job(jobId, status, stages, extra = {}) {
  return {
    schema: SOFTWARE_DETAIL_JOB_SCHEMA,
    jobId,
    status,
    stages,
    updatedAt: "2026-07-29T00:02:00.000Z",
    artifacts: [],
    error: null,
    ...extra
  };
}

test("新任务固化九阶段快照，并持久化多轮进度后完成 DOCX", async () => {
  await withTestConfig(async (root) => {
    const calls = [];
    let service;
    let taskId = "";
    let pollCount = 0;
    const client = {
      async startSoftwareDetailPipelineJob(payload) {
        calls.push({ type: "start", payload });
        return job("worker-job-success", "queued", []);
      },
      async getSoftwareDetailPipelineJob(workerJobId, options) {
        pollCount += 1;
        calls.push({ type: "poll", workerJobId, options });
        if (pollCount === 1) {
          return job(workerJobId, "running", stageRecords({
            completedCount: 2,
            runningIndex: 2
          }));
        }
        if (pollCount === 2) {
          return job(workerJobId, "running", stageRecords({
            completedCount: 8,
            runningIndex: 8
          }));
        }
        const relativePath = "outputs/Demo_软件详设.docx";
        await fs.mkdir(path.join(options.localWorkspaceDir, "outputs"), { recursive: true });
        await fs.writeFile(path.join(options.localWorkspaceDir, ...relativePath.split("/")), "docx");
        return job(workerJobId, "completed", stageRecords({ completedCount: 9 }), {
          artifacts: [
            {
              role: "detail-design-docx",
              relativePath,
              size: 4,
              sha256: "b".repeat(64)
            }
          ]
        });
      },
      async cleanupSoftwareDetailPipelineUpload(workerJobId) {
        const stored = await service.readTask(taskId);
        const docxExists = await fs.stat(
          path.join(stored.workspace.directory, "outputs", "Demo_软件详设.docx")
        ).then(() => true, () => false);
        calls.push({
          type: "cleanup",
          workerJobId,
          taskStatus: stored.status,
          docxExists
        });
        return { ok: true };
      },
      async executeStep() {
        assert.fail("新任务不得执行旧的单会话步骤");
      }
    };
    service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client,
      pipelinePollIntervalMs: 0,
      sleep: async () => calls.push({ type: "sleep" })
    });
    const snapshots = [];
    const saveTask = service.saveTask.bind(service);
    service.saveTask = async (task) => {
      snapshots.push(structuredClone(task));
      return saveTask(task);
    };

    const created = await createTask(service, root, "Demo", true);
    taskId = created.id;
    assert.equal(created.pipeline.schema, SOFTWARE_DETAIL_JOB_SCHEMA);
    assert.equal(created.pipeline.version, 1);
    assert.equal(created.pipeline.catalogVersion, SOFTWARE_DETAIL_STAGE_CATALOG_VERSION);
    assert.equal(created.pipeline.workerJobId, "");
    assert.equal(created.pipeline.stages.length, 9);
    assert.deepEqual(
      created.pipeline.stages.map((stage) => stage.id),
      listSoftwareDetailStages().map((stage) => stage.id)
    );
    assert.ok(created.pipeline.stages.every((stage) =>
      stage.skillName === stage.id &&
      stage.title &&
      stage.status === "pending" &&
      stage.attempt === 0 &&
      Array.isArray(stage.artifacts)
    ));

    const completed = await service.runTask(created.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.pipeline.workerJobId, "worker-job-success");
    assert.equal(completed.pipeline.status, "completed");
    assert.equal(completed.pipeline.cleanup.status, "completed");
    assert.equal(completed.pipeline.stages.filter((stage) => stage.status === "completed").length, 9);
    assert.equal(completed.artifacts.length, 1);
    assert.equal(completed.artifacts[0].relativePath, "outputs/Demo_软件详设.docx");
    assert.ok(
      snapshots.some((snapshot) =>
        snapshot.pipeline?.stages?.[2]?.status === "running" &&
        snapshot.pipeline?.stages?.[0]?.artifacts?.[0]?.role
      ),
      "第一轮 Worker 阶段进度必须先持久化"
    );

    const start = calls.find((call) => call.type === "start");
    assert.equal(start.payload.taskId, created.id);
    assert.equal(start.payload.idempotencyKey, created.id);
    assert.equal(start.payload.workerId, "worker-01");
    assert.equal(start.payload.workerSelection.label, "测试 Worker");
    assert.equal(start.payload.inputArtifact.pipelineSchema, SOFTWARE_DETAIL_JOB_SCHEMA);
    assert.equal(start.payload.inputArtifact.unitTestProject.id, "01");
    assert.deepEqual(start.payload.inputArtifact.projectInitScripts, ["inputs/Demo_init.m"]);
    assert.equal(Object.hasOwn(start.payload.inputArtifact, "skillName"), false);
    assert.equal(calls.filter((call) => call.type === "poll").length, 3);
    const cleanup = calls.find((call) => call.type === "cleanup");
    assert.equal(cleanup.taskStatus, "completed");
    assert.equal(cleanup.docxExists, true);
  });
});

test("Worker 阶段失败会保存失败阶段并在终态后清理上传工作区", async () => {
  await withTestConfig(async (root) => {
    const calls = [];
    const failedStages = stageRecords({ completedCount: 3, failedIndex: 3 });
    const client = {
      async startSoftwareDetailPipelineJob() {
        return job("worker-job-failed", "queued", []);
      },
      async getSoftwareDetailPipelineJob(workerJobId) {
        return job(workerJobId, "failed", failedStages, {
          error: {
            code: "software_detail_stage_fixture_failed",
            message: "输出台账阶段失败。",
            details: { stageId: failedStages[3].id }
          }
        });
      },
      async cleanupSoftwareDetailPipelineUpload(workerJobId) {
        calls.push(workerJobId);
        return { ok: true };
      }
    };
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client,
      pipelinePollIntervalMs: 0,
      sleep: async () => {}
    });
    const created = await createTask(service, root, "Failed");
    await assert.rejects(
      () => service.runTask(created.id),
      (error) => error.code === "software_detail_stage_fixture_failed"
    );
    const stored = await service.readTask(created.id);
    assert.equal(stored.status, "failed");
    assert.equal(stored.pipeline.status, "failed");
    assert.equal(stored.pipeline.stages[3].status, "failed");
    assert.equal(stored.pipeline.stages[3].error.code, "software_detail_stage_fixture_failed");
    assert.equal(stored.pipeline.cleanup.status, "completed");
    assert.deepEqual(calls, ["worker-job-failed"]);
  });
});

test("无法识别的轮询响应和客户端异常都会使平台任务失败", async () => {
  await withTestConfig(async (root) => {
    for (const scenario of ["invalid-response", "client-error"]) {
      let cleanupCalls = 0;
      const client = {
        async startSoftwareDetailPipelineJob() {
          return job(`worker-${scenario}`, "queued", []);
        },
        async getSoftwareDetailPipelineJob() {
          if (scenario === "invalid-response") {
            return "not-json";
          }
          throw Object.assign(new Error("轮询连接中断"), {
            code: "software_detail_poll_fixture_failed"
          });
        },
        async cleanupSoftwareDetailPipelineUpload() {
          cleanupCalls += 1;
        }
      };
      const service = new SoftwareModuleDescriptionGenerationService({
        hermesAgentClient: client,
        pipelinePollIntervalMs: 0,
        sleep: async () => {}
      });
      const created = await createTask(service, root, scenario);
      await assert.rejects(() => service.runTask(created.id));
      const stored = await service.readTask(created.id);
      assert.equal(stored.status, "failed");
      assert.equal(
        stored.hermes.errorCode,
        scenario === "invalid-response"
          ? "software_module_description_pipeline_response_invalid"
          : "software_detail_poll_fixture_failed"
      );
      assert.equal(cleanupCalls, 0, "未确认 Worker 终态时不能提前清理其工作区");
    }
  });
});

test("已有 Worker 作业轮询暂时断开时保持运行，后台续查后完成", async () => {
  await withTestConfig(async (root) => {
    let pollCalls = 0;
    let cleanupCalls = 0;
    const client = {
      async startSoftwareDetailPipelineJob(payload) {
        return job(`worker-transient-${payload.taskId}`, "queued", []);
      },
      async getSoftwareDetailPipelineJob(workerJobId, options) {
        pollCalls += 1;
        if (pollCalls === 1) {
          throw Object.assign(new Error("Worker 暂时不可用"), {
            code: "software_detail_worker_unavailable"
          });
        }
        const relativePath = "outputs/Transient.docx";
        await fs.mkdir(path.join(options.localWorkspaceDir, "outputs"), { recursive: true });
        await fs.writeFile(
          path.join(options.localWorkspaceDir, ...relativePath.split("/")),
          "transient-docx"
        );
        return job(workerJobId, "completed", stageRecords({ completedCount: 9 }), {
          artifacts: [{ role: "detail-design-docx", relativePath, size: 14 }]
        });
      },
      async cleanupSoftwareDetailPipelineUpload() {
        cleanupCalls += 1;
        return { ok: true };
      }
    };
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client,
      pipelinePollIntervalMs: 0,
      sleep: async () => {}
    });
    const created = await createTask(service, root, "Transient");
    const pending = await service.runTask(created.id);
    assert.equal(pending.status, "running");
    assert.equal(pending.pipeline.awaitingReconcile, true);
    assert.equal(
      pending.pipeline.diagnostic.code,
      "software_detail_worker_unavailable"
    );
    assert.equal(cleanupCalls, 0);

    await service.reconcileTask(created.id);
    const completed = await service.readTask(created.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.pipeline.awaitingReconcile, false);
    assert.equal(completed.pipeline.diagnostic, null);
    assert.equal(completed.pipeline.cleanup.status, "completed");
    assert.equal(completed.artifacts[0].relativePath, "outputs/Transient.docx");
    assert.equal(cleanupCalls, 1);
  });
});

test("启动请求在取得 Worker 作业编号前失败时仍立即失败", async () => {
  await withTestConfig(async (root) => {
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: {
        async startSoftwareDetailPipelineJob() {
          throw Object.assign(new Error("Worker 启动连接失败"), {
            code: "software_detail_worker_unavailable"
          });
        }
      }
    });
    const created = await createTask(service, root, "StartUnavailable");
    await assert.rejects(
      () => service.runTask(created.id),
      (error) => error.code === "software_detail_worker_unavailable"
    );
    const failed = await service.readTask(created.id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.pipeline.workerJobId, "");
    assert.equal(failed.hermes.errorCode, "software_detail_worker_unavailable");
  });
});

test("后台续查遇到明确暂时超时时保持运行，非法响应仍失败", async () => {
  await withTestConfig(async (root) => {
    let mode = "timeout";
    const client = {
      async startSoftwareDetailPipelineJob(payload) {
        return job(`worker-reconcile-${payload.taskId}`, "queued", []);
      },
      async getSoftwareDetailPipelineJob() {
        if (mode === "timeout") {
          throw Object.assign(new Error("轮询超时"), {
            code: "software_detail_poll_timeout"
          });
        }
        return "not-json";
      }
    };
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client,
      pipelinePollWindowMs: 0,
      sleep: async () => {}
    });
    const created = await createTask(service, root, "ReconcileTimeout");
    await service.runTask(created.id);

    const pending = await service.reconcileTask(created.id);
    assert.equal(pending.status, "running");
    assert.equal(pending.pipeline.awaitingReconcile, true);
    assert.equal(pending.pipeline.diagnostic.code, "software_detail_poll_timeout");

    mode = "invalid";
    const failed = await service.reconcileTask(created.id);
    assert.equal(failed.status, "failed");
    assert.equal(
      failed.hermes.errorCode,
      "software_module_description_pipeline_response_invalid"
    );
  });
});

test("有限轮询窗口释放队列，后台只续查已有 Worker 作业", async () => {
  await withTestConfig(async (root) => {
    let startCalls = 0;
    let pollCalls = 0;
    let cleanupCalls = 0;
    const client = {
      async startSoftwareDetailPipelineJob(payload) {
        startCalls += 1;
        return job(`worker-window-${payload.taskId}`, "queued", []);
      },
      async getSoftwareDetailPipelineJob(workerJobId, options) {
        pollCalls += 1;
        const relativePath = "outputs/Window.docx";
        await fs.mkdir(path.join(options.localWorkspaceDir, "outputs"), { recursive: true });
        await fs.writeFile(
          path.join(options.localWorkspaceDir, ...relativePath.split("/")),
          "window-docx"
        );
        return job(workerJobId, "completed", stageRecords({ completedCount: 9 }), {
          artifacts: [{ role: "detail-design-docx", relativePath, size: 11 }]
        });
      },
      async cleanupSoftwareDetailPipelineUpload() {
        cleanupCalls += 1;
        throw Object.assign(new Error("清理接口测试失败"), {
          code: "software_detail_cleanup_fixture_failed"
        });
      }
    };
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client,
      pipelinePollWindowMs: 0,
      pipelinePollIntervalMs: 0,
      sleep: async () => assert.fail("零窗口不应等待")
    });
    const pending = await createTask(service, root, "Window");
    const queued = await createTask(service, root, "StillQueued");

    const returned = await service.runTask(pending.id);
    assert.equal(returned.status, "running");
    assert.equal(returned.pipeline.awaitingReconcile, true);
    assert.match(returned.pipeline.workerJobId, /^worker-window-/);
    assert.equal(startCalls, 1);
    assert.equal(pollCalls, 0);

    const reconciled = await service.reconcileRemoteTasks();
    assert.equal(reconciled.length, 1, "排队且没有 Worker 作业编号的任务不得绕过队列");
    assert.equal(startCalls, 1, "后台续查不得重新启动 Worker 作业");
    assert.equal(pollCalls, 1);
    assert.equal(cleanupCalls, 1);
    const stored = await service.readTask(pending.id);
    assert.equal(stored.status, "completed");
    assert.equal(stored.pipeline.cleanup.status, "failed");
    assert.equal(
      stored.pipeline.cleanup.error.code,
      "software_detail_cleanup_fixture_failed"
    );
    assert.equal((await service.readTask(queued.id)).status, "queued");

    const missingJob = await service.readTask(queued.id);
    missingJob.status = "running";
    missingJob.updatedAt = "2020-01-01T00:00:00.000Z";
    await service.saveTask(missingJob);
    const preserved = await createTask(service, root, "Preserved");
    const preservedStored = await service.readTask(preserved.id);
    preservedStored.status = "running";
    preservedStored.updatedAt = "2020-01-01T00:00:00.000Z";
    preservedStored.pipeline.workerJobId = "worker-preserved";
    preservedStored.pipeline.status = "running";
    await service.saveTask(preservedStored);
    await service.recoverStaleTasks(1);
    assert.equal((await service.readTask(queued.id)).status, "failed");
    assert.equal((await service.readTask(preserved.id)).status, "running");
  });
});

test("执行与后台续查通过任务级互斥避免重复轮询", async () => {
  await withTestConfig(async (root) => {
    let releasePoll;
    let announcePoll;
    const pollStarted = new Promise((resolve) => {
      announcePoll = resolve;
    });
    const pollGate = new Promise((resolve) => {
      releasePoll = resolve;
    });
    let pollCalls = 0;
    const client = {
      async getSoftwareDetailPipelineJob(workerJobId) {
        pollCalls += 1;
        announcePoll();
        await pollGate;
        return job(workerJobId, "running", stageRecords({
          completedCount: 1,
          runningIndex: 1
        }));
      }
    };
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client
    });
    const created = await createTask(service, root, "Locked");
    const stored = await service.readTask(created.id);
    stored.status = "running";
    stored.pipeline.status = "running";
    stored.pipeline.workerJobId = "worker-locked";
    await service.saveTask(stored);

    const first = service.reconcileTask(created.id);
    await pollStarted;
    const second = await service.reconcileTask(created.id);
    assert.equal(second.status, "running");
    assert.equal(pollCalls, 1);
    releasePoll();
    await first;
    assert.equal(pollCalls, 1);
  });
});

test("旧任务读取不改字节，执行仍使用旧 executeStep 路径", async () => {
  await withTestConfig(async (root) => {
    const workspace = path.join(root, "legacy-workspace");
    await fs.mkdir(path.join(workspace, "outputs"), { recursive: true });
    await fs.writeFile(path.join(workspace, "Legacy.slx"), "slx");
    await fs.writeFile(path.join(workspace, "Legacy.mat"), "mat");
    const legacyTask = {
      id: "legacy-task",
      type: "software_module_description_generation",
      status: "queued",
      title: "旧任务",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      startedAt: "",
      completedAt: "",
      failedAt: "",
      summary: "",
      errorMessage: "",
      progress: { stage: "queued", percent: 4, label: "等待执行", message: "", updatedAt: "" },
      workerProfile: { id: "worker-01" },
      inputs: {
        modelSlx: { originalName: "Legacy.slx", workspaceName: "Legacy.slx" },
        modelMat: { originalName: "Legacy.mat", workspaceName: "Legacy.mat" }
      },
      workspace: {
        directory: workspace,
        inputDir: path.join(workspace, "inputs"),
        outputDir: path.join(workspace, "outputs"),
        modelSlxPath: path.join(workspace, "Legacy.slx"),
        modelMatPath: path.join(workspace, "Legacy.mat")
      },
      hermes: {
        stepType: "simulink_module_description_generate",
        expectedOutputPattern: "outputs/*.docx"
      },
      runtimeEvents: [],
      artifacts: [],
      timeline: []
    };
    const taskPath = path.join(config.softwareModuleDescription.taskStoreDir, legacyTask.id, "task.json");
    const originalBytes = Buffer.from(`${JSON.stringify(legacyTask, null, 2)}\n`);
    await fs.mkdir(path.dirname(taskPath), { recursive: true });
    await fs.writeFile(taskPath, originalBytes);

    let executeCalls = 0;
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: {
        async startSoftwareDetailPipelineJob() {
          assert.fail("旧任务不得进入九阶段路径");
        },
        async executeStep(payload) {
          executeCalls += 1;
          await fs.writeFile(
            path.join(payload.inputArtifact.outputDir, "Legacy.docx"),
            "legacy-docx"
          );
          return {
            status: "succeeded",
            artifact: {
              status: "completed",
              summary: "旧任务已完成。",
              outputFiles: [{ relativePath: "outputs/Legacy.docx" }]
            }
          };
        }
      }
    });
    const read = await service.getTask(legacyTask.id);
    const listed = await service.listTasks();
    assert.equal(Object.hasOwn(read, "pipeline"), false);
    assert.equal(Object.hasOwn(listed[0], "pipeline"), false);
    assert.deepEqual(await fs.readFile(taskPath), originalBytes);

    const completed = await service.runTask(legacyTask.id);
    assert.equal(executeCalls, 1);
    assert.equal(completed.status, "completed");
    assert.equal(completed.artifacts[0].relativePath, "outputs/Legacy.docx");
  });
});

test("运行中的任务删除返回 409 且工作区保持存在", async () => {
  await withTestConfig(async (root) => {
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: {}
    });
    const created = await createTask(service, root, "Running");
    const stored = await service.readTask(created.id);
    stored.status = "running";
    stored.pipeline.status = "running";
    await service.saveTask(stored);
    await assert.rejects(
      () => service.deleteTask(created.id),
      (error) =>
        error.statusCode === 409 &&
        error.code === "software_module_description_task_running"
    );
    assert.ok(await fs.stat(stored.workspace.directory));
  });
});

test("两个九阶段任务的 Worker 作业编号、阶段与 DOCX 不会串线", async () => {
  await withTestConfig(async (root) => {
    const taskByJob = new Map();
    const client = {
      async startSoftwareDetailPipelineJob(payload) {
        const jobId = `worker-${payload.taskId}`;
        taskByJob.set(jobId, payload.taskId);
        return job(jobId, "queued", []);
      },
      async getSoftwareDetailPipelineJob(workerJobId, options) {
        const taskId = taskByJob.get(workerJobId);
        assert.ok(taskId);
        const fileName = `${taskId}.docx`;
        const relativePath = `outputs/${fileName}`;
        await fs.mkdir(path.join(options.localWorkspaceDir, "outputs"), { recursive: true });
        await fs.writeFile(
          path.join(options.localWorkspaceDir, "outputs", fileName),
          workerJobId
        );
        return job(workerJobId, "completed", stageRecords({ completedCount: 9 }), {
          artifacts: [{ role: "detail-design-docx", relativePath, size: workerJobId.length }]
        });
      },
      async cleanupSoftwareDetailPipelineUpload() {
        return { ok: true };
      }
    };
    const service = new SoftwareModuleDescriptionGenerationService({
      hermesAgentClient: client,
      pipelinePollIntervalMs: 0,
      sleep: async () => {}
    });
    const [first, second] = await Promise.all([
      createTask(service, root, "ParallelA"),
      createTask(service, root, "ParallelB")
    ]);
    await Promise.all([service.runTask(first.id), service.runTask(second.id)]);
    const [storedFirst, storedSecond] = await Promise.all([
      service.readTask(first.id),
      service.readTask(second.id)
    ]);
    assert.equal(storedFirst.pipeline.workerJobId, `worker-${first.id}`);
    assert.equal(storedSecond.pipeline.workerJobId, `worker-${second.id}`);
    assert.notEqual(storedFirst.pipeline.workerJobId, storedSecond.pipeline.workerJobId);
    assert.equal(storedFirst.artifacts[0].fileName, `${first.id}.docx`);
    assert.equal(storedSecond.artifacts[0].fileName, `${second.id}.docx`);
    assert.equal(
      await fs.readFile(path.join(storedFirst.workspace.outputDir, `${first.id}.docx`), "utf8"),
      storedFirst.pipeline.workerJobId
    );
    assert.equal(
      await fs.readFile(path.join(storedSecond.workspace.outputDir, `${second.id}.docx`), "utf8"),
      storedSecond.pipeline.workerJobId
    );
  });
});

let failures = 0;
for (const entry of tests) {
  try {
    await entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error?.stack || error);
  }
}

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`软件详设平台九阶段测试通过：${tests.length} 项。`);
}
