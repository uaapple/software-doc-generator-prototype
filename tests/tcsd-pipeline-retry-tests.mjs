import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { TcsdPipelineJobService } = await import(
  new URL("../src/services/tcsd-pipeline-job-service.js", import.meta.url).href
);

// Two-branch retry rule (expert-reviewed): transient Gateway failures may
// retry once with identical hashes — but only after the previous job is
// confirmed gone; deterministic failures never retry without an actual change.

async function makeJob(withMarker = false) {
  const root = await mkdtemp(path.join(tmpdir(), "tcsd-retry-"));
  const outputDir = path.join(root, "outputs");
  await mkdir(outputDir, { recursive: true });
  if (withMarker) {
    const runtimeDir = path.join(outputDir, ".tcsd-runtime");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(
      path.join(runtimeDir, "active-gateway-job.json"),
      JSON.stringify({ schema: "tcsd-active-gateway-job/v1", jobId: "eval-x", ownerPid: 1 })
    );
  }
  const job = { jobId: "job-1", input: { outputDir } };
  const cleanup = () => rm(root, { recursive: true, force: true });
  return { job, cleanup };
}

const service = new TcsdPipelineJobService({});
const checkpointMissing = (message) => ({
  code: "tcsd_stage_checkpoint_missing",
  message: "DSH 会话已结束，但阶段 6 的 checkpoint 未产出。",
  details: { stageIndex: 6, attempt: { error: { code: "tcsd_stage_runtime_failed", message } } },
});

let passed = 0;
async function check(name, condition) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`ok - ${name}`);
}

try {
  // 1. Validation failures keep the existing repair-retry channel.
  {
    const { job, cleanup } = await makeJob();
    const decision = await service.evaluateRetry(job, 6, { code: "tcsd_stage_validation_failed" });
    await check("validation failure retries", decision.retry === true);
    await cleanup();
  }

  // 2. Stalled sessions keep the existing retry channel.
  {
    const { job, cleanup } = await makeJob();
    const decision = await service.evaluateRetry(job, 6, { code: "tcsd_stage_stalled" });
    await check("stalled session retries", decision.retry === true);
    await cleanup();
  }

  // 3. Transient Gateway poll timeout with no active marker -> retry once.
  {
    const { job, cleanup } = await makeJob(false);
    const decision = await service.evaluateRetry(
      job, 6,
      checkpointMissing("Stage 06 状态探针: SATK/MCP failed: Timed out waiting for MATLAB Gateway after 3600s")
    );
    await check("transient gateway timeout retries when no marker", decision.retry === true);
    await check("retry summary explains the transient cause", decision.summary.includes("暂态 Gateway 故障"));
    await cleanup();
  }

  // 4. Transient timeout but the old job marker is still active -> no retry
  //    (would overlap the very job that timed out).
  {
    const { job, cleanup } = await makeJob(true);
    const decision = await service.evaluateRetry(
      job, 6,
      checkpointMissing("Stage 06 状态探针: SATK/MCP failed: Timed out waiting for MATLAB Gateway after 3600s")
    );
    await check("transient failure does not retry over an active job", decision.retry === false);
    await cleanup();
  }

  // 5. Deterministic runtime failure -> no retry.
  {
    const { job, cleanup } = await makeJob(false);
    const decision = await service.evaluateRetry(
      job, 6,
      checkpointMissing("Stage 06 状态探针: SATK/MCP failed: model refused to load: invalid port")
    );
    await check("deterministic failure does not retry", decision.retry === false);
    await cleanup();
  }

  // 6. Plain stage runtime failure (no checkpoint-missing context) -> no retry.
  {
    const { job, cleanup } = await makeJob(false);
    const decision = await service.evaluateRetry(job, 6, { code: "tcsd_stage_runtime_failed" });
    await check("plain runtime failure does not retry", decision.retry === false);
    await cleanup();
  }

  // 7. Direct timeout error code is transient.
  {
    const { job, cleanup } = await makeJob(false);
    const decision = await service.evaluateRetry(job, 11, { code: "tcsd_stage_timeout", message: "probe timed out" });
    await check("timeout error code is transient", decision.retry === true);
    await cleanup();
  }

  console.log(`pipeline retry-policy tests: ${passed} passed`);
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
}
