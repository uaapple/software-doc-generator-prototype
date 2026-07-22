import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TcsdPipelineJobService } from "../src/services/tcsd-pipeline-job-service.js";
import { TCSD_STAGE_NAMES, canTransition, coverageCompletion } from "../src/services/tcsd-pipeline-contract.js";

assert.equal(TCSD_STAGE_NAMES.length, 12);
assert.equal(canTransition("已完成", "正在执行"), false);
assert.equal(coverageCompletion({ condition: 80, decision: 80, mcdc: 80 }), "complete");
assert.equal(coverageCompletion({ condition: 79, decision: 80, mcdc: 80 }), "partial");

const root = await mkdtemp(path.join(os.tmpdir(), "tcsd-contract-"));
const service = new TcsdPipelineJobService({
  jobDir: path.join(root, "jobs"),
  executor: async (index) => {
    const checkpoint = path.join(root, `checkpoint-${index}.json`);
    await writeFile(checkpoint, "{}");
    if (index === 10 || index === 11) return { checkpoint, skip: true, skipReason: "首轮覆盖率达标" };
    return { checkpoint, coverage: { condition: 80, decision: 80, mcdc: 80 } };
  }
});
const started = await service.start({ taskId: "same-task" });
const duplicate = await service.start({ taskId: "same-task" });
assert.equal(started.jobId, duplicate.jobId);
await service.running.get(started.jobId);
const completed = await service.get(started.jobId);
assert.equal(completed.status, "已完成");
assert.equal(completed.stages[9].status, "已跳过");
assert.equal(completed.checkpoints.length, 10);
console.log("TCSD pipeline contract tests passed");
