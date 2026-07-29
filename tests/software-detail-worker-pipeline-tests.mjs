import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { listSoftwareDetailStages } from "../src/services/software-detail-stage-catalog.js";
import { SoftwareDetailPipelineJobService } from "../src/services/software-detail-pipeline-job-service.js";

const DOCX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("synthetic-docx")
]);

class FakeLeaseClient {
  constructor() {
    this.created = [];
    this.read = [];
    this.closed = [];
  }

  async createJobLease(input) {
    const lease = {
      workspaceId: input.workspaceId,
      leaseId: input.leaseId,
      ownerJobId: input.ownerJobId,
      matlabSessionId: `matlab-${input.ownerJobId}`,
      status: "active"
    };
    this.created.push(lease);
    return lease;
  }

  async getJobLease(input) {
    this.read.push({ ...input });
    return {
      workspaceId: input.workspaceId,
      leaseId: input.leaseId,
      ownerJobId: input.ownerJobId,
      matlabSessionId: input.matlabSessionId,
      status: "active"
    };
  }

  async closeJobLease(input) {
    this.closed.push({ ...input });
    return {
      ...input,
      status: "closed",
      confirmed: true
    };
  }

  hermesEnvironment(lease) {
    return {
      MATLAB_GATEWAY_TOKEN: "must-not-persist",
      MATLAB_GATEWAY_EVALUATE_TOKEN: "must-not-persist",
      SOFTWARE_DETAIL_MATLAB_LEASE_ID: lease.leaseId
    };
  }
}

class FakeExecutor {
  constructor(options = {}) {
    this.options = options;
    this.calls = [];
  }

  async execute(context) {
    const index = this.calls.length + 1;
    const call = {
      jobId: context.job.jobId,
      stageId: context.definition.id,
      lease: { ...context.lease },
      gatewayEnvironment: { ...context.gatewayEnvironment }
    };
    this.calls.push(call);
    if (this.options.throwAt === context.definition.id) {
      throw Object.assign(new Error("synthetic Hermes failure"), {
        code: "software_detail_hermes_failed"
      });
    }
    for (const artifact of context.outputArtifacts) {
      if (
        artifact.role === "matlab-session-lease" ||
        (this.options.missingAt === context.definition.id &&
          artifact === context.outputArtifacts.at(-1))
      ) {
        continue;
      }
      const absolutePath = path.join(
        context.job.input.workspaceDir,
        ...artifact.relativePath.split("/")
      );
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(
        absolutePath,
        artifact.role === "detail-design-docx"
          ? DOCX_BYTES
          : `${JSON.stringify({
              schema: "software-detail-test-artifact/v1",
              jobId: context.job.jobId,
              stageId: context.definition.id,
              role: artifact.role
            })}\n`
      );
    }
    const artifacts = context.outputArtifacts.map((artifact) => ({
      role: artifact.role,
      relativePath:
        this.options.pathEscapeAt === context.definition.id &&
        artifact === context.outputArtifacts[0]
          ? "../escaped.json"
          : artifact.relativePath
    }));
    await fs.mkdir(path.dirname(context.candidateResultPath), {
      recursive: true
    });
    const candidate = {
      schema: "software-detail-minimal-stage-result/v1",
      jobId: context.job.jobId,
      stageId: context.definition.id,
      attempt: context.stageInput.attempt,
      status: "completed"
    };
    if (this.options.outputArtifactsCandidate === true) {
      candidate.outputArtifacts = artifacts;
    } else if (
      this.options.conflictingArtifactFieldsAt === context.definition.id
    ) {
      candidate.artifacts = artifacts;
      candidate.outputArtifacts = artifacts.map((artifact, artifactIndex) =>
        artifactIndex === 0
          ? { ...artifact, relativePath: `.software-detail/conflict/${artifact.role}.json` }
          : artifact
      );
    } else {
      candidate.artifacts = artifacts;
    }
    await fs.writeFile(
      context.candidateResultPath,
      this.options.nonJsonAt === context.definition.id
        ? "not-json"
        : `${JSON.stringify(candidate)}\n`
    );
    return {
      sessionId: `hermes-${context.job.jobId}-${String(index).padStart(2, "0")}`,
      profile: "test",
      durationMs: 1,
      stdoutBytes: 1,
      stderrBytes: 0
    };
  }
}

async function createWorkspace(root, name) {
  const workspaceDir = path.join(root, name);
  const outputDir = path.join(workspaceDir, "outputs");
  const modelSlxPath = path.join(workspaceDir, `${name}.slx`);
  const modelMatPath = path.join(workspaceDir, `${name}.mat`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(modelSlxPath, "slx");
  await fs.writeFile(modelMatPath, "mat");
  return { workspaceDir, outputDir, modelSlxPath, modelMatPath };
}

function registrySnapshot() {
  return {
    schema: "software-detail-hermes-skill-registry/v1",
    profile: "test",
    discovery: { allDiscovered: true },
    runtime: { bundleHash: "runtime", installedPath: "/installed/runtime" },
    stages: listSoftwareDetailStages().map((stage) => ({
      stageId: stage.id,
      name: stage.skillName,
      version: "1.0.0",
      bundleHash: `hash-${stage.id}`,
      installedPath: `/installed/${stage.id}`
    }))
  };
}

function createService(root, options = {}) {
  let sequence = 0;
  const executor = options.executor || new FakeExecutor(options);
  const leaseClient = options.leaseClient || new FakeLeaseClient();
  const service = new SoftwareDetailPipelineJobService({
    jobDir: path.join(root, "jobs"),
    executor,
    leaseClient,
    prepareJob: async () => registrySnapshot(),
    idFactory: () => `${options.idPrefix || "job"}-${++sequence}`
  });
  return { service, executor, leaseClient };
}

async function runJob(service, workspace, taskId) {
  const started = await service.start({
    taskId,
    idempotencyKey: taskId,
    ...workspace,
    unitTestProject: { id: "01", name: "Test", label: "01_Test" },
    projectAddonCopy: { copiedFileCount: 1 },
    workerSelection: { id: "worker-a", label: "Worker A" }
  });
  return service.run(started.jobId);
}

const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "software-detail-worker-pipeline-")
);
try {
  {
    const { service, executor, leaseClient } = createService(
      path.join(root, "happy")
    );
    const job = await runJob(
      service,
      await createWorkspace(root, "happy-workspace"),
      "happy-task"
    );
    assert.equal(job.status, "completed");
    assert.equal(executor.calls.length, 9);
    assert.equal(new Set(job.hermesSessionIds).size, 9);
    assert.equal(job.hermesSessionIds.length, 9);
    assert.equal(leaseClient.created.length, 1);
    assert.equal(leaseClient.closed.length, 1);
    assert.equal(job.resources.leaseStatus, "closed");
    assert.equal(job.matlabSessionCleaned, true);
    assert.ok(
      job.stages.every(
        (stage) =>
          stage.status === "completed" &&
          stage.checkpoint?.schema === "software-detail-stage-checkpoint/v1"
      )
    );
    assert.ok(
      job.stages.every(
        (stage) =>
          stage.checkpoint.matlab.leaseId ===
          job.stages[0].checkpoint.matlab.leaseId
      )
    );
    assert.deepEqual(
      job.artifacts.map((artifact) => artifact.role),
      ["detail-design-docx", "artifact-manifest"]
    );
    const persisted = await fs.readFile(
      path.join(root, "happy", "jobs", `${job.jobId}.json`),
      "utf8"
    );
    assert.doesNotMatch(persisted, /must-not-persist/);
  }

  for (const scenario of [
    {
      key: "stage-failure",
      options: { throwAt: "software-detail-stage-04-output-ledger" },
      expectedCalls: 4,
      expectedCode: "software_detail_hermes_failed"
    },
    {
      key: "non-json",
      options: { nonJsonAt: "software-detail-stage-03-evidence-extract" },
      expectedCalls: 3,
      expectedCode: "software_detail_candidate_result_missing"
    },
    {
      key: "missing-artifact",
      options: { missingAt: "software-detail-stage-05-boundary-projection" },
      expectedCalls: 5,
      expectedCode: "software_detail_required_artifact_missing"
    },
    {
      key: "path-escape",
      options: { pathEscapeAt: "software-detail-stage-02-model-plan" },
      expectedCalls: 2,
      expectedCode: "software_detail_invalid_artifact_path"
    },
    {
      key: "stage-one-failure",
      options: { throwAt: "software-detail-stage-01-initialize" },
      expectedCalls: 1,
      expectedCode: "software_detail_hermes_failed"
    }
  ]) {
    const scenarioRoot = path.join(root, scenario.key);
    const { service, executor, leaseClient } = createService(
      scenarioRoot,
      scenario.options
    );
    const job = await runJob(
      service,
      await createWorkspace(root, `${scenario.key}-workspace`),
      `${scenario.key}-task`
    );
    assert.equal(job.status, "failed", scenario.key);
    assert.equal(job.error.code, scenario.expectedCode, scenario.key);
    assert.equal(executor.calls.length, scenario.expectedCalls, scenario.key);
    assert.equal(leaseClient.closed.length, 1, scenario.key);
    assert.equal(
      job.stages.slice(scenario.expectedCalls).every((stage) => stage.status === "pending"),
      true,
      `${scenario.key} advanced beyond the failed stage`
    );
  }

  {
    const { service, executor } = createService(
      path.join(root, "compatible-output-artifacts"),
      { outputArtifactsCandidate: true }
    );
    const job = await runJob(
      service,
      await createWorkspace(root, "compatible-output-artifacts-workspace"),
      "compatible-output-artifacts-task"
    );
    assert.equal(job.status, "completed");
    assert.equal(executor.calls.length, 9);
  }

  {
    const { service, executor } = createService(
      path.join(root, "conflicting-artifact-fields"),
      {
        conflictingArtifactFieldsAt:
          "software-detail-stage-02-model-plan"
      }
    );
    const job = await runJob(
      service,
      await createWorkspace(root, "conflicting-artifact-fields-workspace"),
      "conflicting-artifact-fields-task"
    );
    assert.equal(job.status, "failed");
    assert.equal(
      job.error.code,
      "software_detail_candidate_artifacts_conflict"
    );
    assert.equal(executor.calls.length, 2);
  }

  {
    const isolationRoot = path.join(root, "isolation");
    const { service, executor, leaseClient } = createService(isolationRoot, {
      idPrefix: "isolated"
    });
    const [first, second] = await Promise.all([
      runJob(
        service,
        await createWorkspace(root, "isolated-one"),
        "isolation-task-one"
      ),
      runJob(
        service,
        await createWorkspace(root, "isolated-two"),
        "isolation-task-two"
      )
    ]);
    assert.equal(first.status, "completed");
    assert.equal(second.status, "completed");
    assert.notEqual(first.resources.workspaceId, second.resources.workspaceId);
    assert.notEqual(first.resources.leaseId, second.resources.leaseId);
    assert.notEqual(first.matlabSessionId, second.matlabSessionId);
    assert.equal(leaseClient.created.length, 2);
    assert.equal(leaseClient.closed.length, 2);
    assert.equal(executor.calls.length, 18);
  }

  {
    const restartRoot = path.join(root, "restart");
    const { service, leaseClient } = createService(restartRoot);
    const workspace = await createWorkspace(root, "restart-workspace");
    const job = {
      schema: "software-detail-minimal-job/v1",
      jobId: "restart-job",
      status: "running",
      matlabSessionId: "matlab-restart-job",
      matlabSessionCleaned: false,
      hermesSessionIds: [],
      input: workspace,
      resources: {
        ownerJobId: "restart-job",
        workspaceId: "sdd-restart-job",
        leaseId: "sdd-lease-restart-job",
        matlabSessionId: "matlab-restart-job",
        leaseStatus: "active"
      },
      stages: listSoftwareDetailStages().map((definition, index) => ({
        id: definition.id,
        order: definition.order,
        status: index === 0 ? "running" : "pending",
        attempt: index === 0 ? 1 : 0,
        input: null,
        result: null
      }))
    };
    await service.save(job);
    assert.deepEqual(await service.failNonTerminalJobsOnStartup(), [
      "restart-job"
    ]);
    const failed = await service.get("restart-job");
    assert.equal(failed.status, "failed");
    assert.equal(failed.error.code, "software_detail_worker_restarted");
    assert.equal(leaseClient.closed.length, 1);
    await assert.rejects(
      () => service.get("../escaped-job"),
      (error) => error.code === "software_detail_invalid_job_id"
    );
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log(
  "Software-detail Worker job pipeline tests passed: nine stages, failure gates, cleanup, restart, and isolation."
);
