import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SerialGate } from "../src/services/serial-gate.js";
import { TcsdPipelineJobService } from "../src/services/tcsd-pipeline-job-service.js";

const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-job-cancel-"));
const started = new Map();
const releases = new Map();
const service = new TcsdPipelineJobService({
  jobDir: path.join(root, "jobs"),
  prepareJob: async () => ({}),
  executor: async (_stageIndex, _input, job) => {
    started.get(job.taskId)?.();
    await new Promise((resolve) => releases.set(job.taskId, resolve));
  },
  cancelExecution: async (_jobId, job) => {
    releases.get(job.taskId)?.();
    return { requested: true, stopped: true };
  },
  runGate: new SerialGate({ concurrency: 1 })
});

const firstStarted = new Promise((resolve) => started.set("first", resolve));
const secondStarted = new Promise((resolve) => started.set("second", resolve));
const input = (taskId) => ({
  taskId,
  workspaceDir: root,
  outputDir: path.join(root, taskId)
});
const first = await service.start(input("first"));
const second = await service.start(input("second"));

await firstStarted;
assert.equal((await service.get(second.jobId)).status, "等待执行");
const firstCancellation = await service.cancel(first.jobId);
assert.equal(firstCancellation.executionStopped, true);
await secondStarted;
assert.equal((await service.get(first.jobId)).status, "已取消");
assert.equal((await service.get(second.jobId)).status, "正在执行");

const secondCancellation = await service.cancel(second.jobId);
assert.equal(secondCancellation.executionStopped, true);
await Promise.all([service.running.get(first.jobId), service.running.get(second.jobId)]);
assert.equal((await service.get(second.jobId)).status, "已取消");

console.log("TCSD job cancellation tests passed.");
