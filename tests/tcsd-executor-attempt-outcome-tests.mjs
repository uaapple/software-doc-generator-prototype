import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// tcsd-dsh-stage-executor.js is an ES module; import it dynamically.
const { TcsdDshStageExecutor } = await import(
  new URL("../src/services/tcsd-dsh-stage-executor.js", import.meta.url).href
);

const root = await mkdtemp(path.join(tmpdir(), "tcsd-attempt-outcome-"));
const workspaceDir = path.join(root, "workspace");
const outputDir = path.join(root, "workspace", "outputs");
await mkdir(outputDir, { recursive: true });
const job = {
  jobId: "job-1",
  input: { workspaceDir: workspaceDir, outputDir },
};

try {
  // 1. New protocol: attempt-result.json present — the composite outcome wins.
  const attemptDir = path.join(outputDir, ".tcsd-agent", "stage-06", "attempt-1");
  await mkdir(attemptDir, { recursive: true });
  await writeFile(
    path.join(attemptDir, "attempt-result.json"),
    JSON.stringify({
      schema: "tcsd-attempt-result/v1",
      jobId: "job-1",
      stageIndex: 6,
      attempt: 1,
      runtimeStatus: "completed",
      validationStatus: "failed",
      stageStatus: "failed",
      runtime: { path: "outputs/.tcsd-agent/stage-06/attempt-1/runtime-result.json", sha256: "x" },
      semantic: { path: "outputs/.tcsd-agent/stage-06/attempt-1/semantic-validation.json", sha256: "y" },
      error: { code: "tcsd_stage_validation_failed", message: "Probe observation is missing executed values" },
    })
  );
  const executor = new TcsdDshStageExecutor({ command: "dsh" });
  const outcome = await executor.collectAttemptOutcome(job, 6);
  assert.equal(outcome.runtimeStatus, "completed");
  assert.equal(outcome.validationStatus, "failed");
  assert.equal(outcome.stageStatus, "failed");
  assert.equal(outcome.error.code, "tcsd_stage_validation_failed");
  assert.equal(outcome.attempt, 1);
  assert.ok(outcome.attemptDir.includes("stage-06/attempt-1"));

  // 2. Legacy fallback: only the old result.json (failed runtime envelope).
  await rm(path.join(attemptDir, "attempt-result.json"));
  await writeFile(
    path.join(attemptDir, "result.json"),
    JSON.stringify({
      schema: "tcsd-agent-stage-result/v1",
      jobId: "job-1",
      stageIndex: 6,
      status: "failed",
      summary: "TCSD deterministic stage runtime failed.",
      artifacts: [],
      error: { code: "tcsd_stage_timeout", message: "probe timed out", hard: true },
    })
  );
  const legacy = await executor.collectAttemptOutcome(job, 6);
  assert.equal(legacy.runtimeStatus, "failed");
  assert.equal(legacy.stageStatus, "failed");
  assert.equal(legacy.error.code, "tcsd_stage_timeout");

  // 3. Newest attempt wins when several exist.
  const attempt2 = path.join(outputDir, ".tcsd-agent", "stage-06", "attempt-2");
  await mkdir(attempt2, { recursive: true });
  await writeFile(
    path.join(attempt2, "attempt-result.json"),
    JSON.stringify({
      schema: "tcsd-attempt-result/v1",
      jobId: "job-1",
      stageIndex: 6,
      attempt: 2,
      runtimeStatus: "completed",
      validationStatus: "passed",
      stageStatus: "completed",
      runtime: null,
      semantic: null,
    })
  );
  const newest = await executor.collectAttemptOutcome(job, 6);
  assert.equal(newest.attempt, 2);
  assert.equal(newest.stageStatus, "completed");

  // 4. No attempt directory at all — null, not a throw.
  const missing = await executor.collectAttemptOutcome({ jobId: "job-1", input: { workspaceDir, outputDir } }, 9);
  assert.equal(missing, null);

  console.log("executor attempt-outcome tests: all passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
