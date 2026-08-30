import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { TcsdDshStageExecutor } = await import(
  new URL("../src/services/tcsd-dsh-stage-executor.js", import.meta.url).href
);

// The bbc72245 orphan shape: the DSH session exits while a background runner
// may still be finishing the stage. awaitStageCheckpoint must keep waiting
// while the runner lease heartbeat is fresh and only fail once the runner is
// provably gone, attaching the structured attempt outcome to the error.

async function makeWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "tcsd-await-"));
  const workspaceDir = path.join(root, "workspace");
  const outputDir = path.join(workspaceDir, "outputs");
  await mkdir(path.join(outputDir, ".tcsd-checkpoints"), { recursive: true });
  const job = { jobId: "job-1", input: { workspaceDir, outputDir } };
  const attemptDir = path.join(outputDir, ".tcsd-agent", "stage-06", "attempt-1");
  await mkdir(attemptDir, { recursive: true });
  return { root, workspaceDir, outputDir, job, attemptDir };
}

function makeExecutor(outputDir, pollMs = 200) {
  const executor = new TcsdDshStageExecutor({ command: "dsh", timeoutMs: 30000 });
  executor.pollIntervalMs = pollMs;
  return executor;
}

function session(exited = true, code = 0) {
  if (!exited) {
    return { stderr: "", exitPromise: new Promise(() => {}) };
  }
  return { stderr: "", exitPromise: Promise.resolve({ code }) };
}

const results = { passed: 0 };

try {
  // 1. Session exited, runner gone (no lease), nothing written ->
  //    checkpointMissing with a real exit code (0, not a fabricated 1).
  {
    const { root, job, attemptDir } = await makeWorkspace();
    const executor = makeExecutor();
    await assert.rejects(
      () => executor.awaitStageCheckpoint(job, 6, session(true, 0)),
      (error) => {
        assert.equal(error.code, "tcsd_stage_checkpoint_missing");
        assert.equal(error.details.exitCode, 0, "the real session exit code must surface");
        assert.ok(!error.details.attempt, "no attempt files means no attempt outcome");
        return true;
      }
    );
    results.passed += 1;
    await rm(root, { recursive: true, force: true });
  }

  // 2. Session exited, failed attempt result present -> error carries the
  //    structured runner/validation verdict.
  {
    const { root, job, attemptDir } = await makeWorkspace();
    await writeFile(
      path.join(attemptDir, "attempt-result.json"),
      JSON.stringify({
        schema: "tcsd-attempt-result/v1", jobId: "job-1", stageIndex: 6, attempt: 1,
        runtimeStatus: "completed", validationStatus: "failed", stageStatus: "failed",
        runtime: null, semantic: null,
        error: { code: "tcsd_stage_validation_failed", message: "Probe observation is missing executed values" },
      })
    );
    const executor = makeExecutor();
    await assert.rejects(
      () => executor.awaitStageCheckpoint(job, 6, session(true, 0)),
      (error) => {
        assert.equal(error.code, "tcsd_stage_checkpoint_missing");
        assert.equal(error.details.attempt.runtimeStatus, "completed");
        assert.equal(error.details.attempt.error.message, "Probe observation is missing executed values");
        assert.ok(error.message.includes("运行状态=completed"));
        return true;
      }
    );
    results.passed += 1;
    await rm(root, { recursive: true, force: true });
  }

  // 3. Session exited but the background runner lease is fresh and the
  //    checkpoint lands afterwards -> still succeeds (orphan harvest).
  {
    const { root, outputDir, job, attemptDir } = await makeWorkspace();
    const leasesDir = path.join(outputDir, ".tcsd-runtime", "leases");
    await mkdir(leasesDir, { recursive: true });
    await writeFile(
      path.join(leasesDir, "stage-06-attempt-1.json"),
      JSON.stringify({
        schema: "tcsd-stage-lease/v1", jobId: "job-1", stageIndex: 6, attempt: 1,
        runId: "run-aaa", ownerPid: 1,
        heartbeatAt: new Date().toISOString(),
      })
    );
    const executor = makeExecutor();
    // The "orphan runner" finishes 600ms in, after one fresh-lease poll.
    setTimeout(() => {
      writeFile(
        path.join(outputDir, ".tcsd-checkpoints", "stage-06.json"),
        JSON.stringify({ schema: "tcsd-agent-stage-checkpoint/v2" })
      ).catch(() => {});
    }, 600);
    const checkpointPath = await executor.awaitStageCheckpoint(job, 6, session(true, 0));
    assert.ok(checkpointPath.includes("stage-06.json"), "a fresh lease keeps the wait alive until the checkpoint lands");
    results.passed += 1;
    await rm(root, { recursive: true, force: true });
  }

  // 4. Session exited, stale lease (heartbeat long past), nothing written ->
  //    fails after the grace poll; stale lease info is attached.
  {
    const { root, job } = await makeWorkspace();
    const leasesDir = path.join(path.dirname(path.dirname(job.input.outputDir)), "lease-tmp");
    const outputDir = job.input.outputDir;
    const targetLeases = path.join(outputDir, ".tcsd-runtime", "leases");
    await mkdir(targetLeases, { recursive: true });
    await writeFile(
      path.join(targetLeases, "stage-06-attempt-1.json"),
      JSON.stringify({
        schema: "tcsd-stage-lease/v1", jobId: "job-1", stageIndex: 6, attempt: 1,
        runId: "run-dead", ownerPid: 1,
        heartbeatAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
    );
    void leasesDir;
    const executor = makeExecutor();
    await assert.rejects(
      () => executor.awaitStageCheckpoint(job, 6, session(true, 0)),
      (error) => {
        assert.equal(error.code, "tcsd_stage_checkpoint_missing");
        assert.equal(error.details.runnerLease.runId, "run-dead");
        assert.ok(error.message.includes("已陈旧"), "stale lease must be called out");
        return true;
      }
    );
    results.passed += 1;
    await rm(root, { recursive: true, force: true });
  }

  // 5. Live Gateway marker present when the runner is gone -> the error details
  //    expose it for operations (the host itself never cancels remotely).
  {
    const { root, outputDir, job } = await makeWorkspace();
    const runtimeDir = path.join(outputDir, ".tcsd-runtime");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(
      path.join(runtimeDir, "active-gateway-job.json"),
      JSON.stringify({
        schema: "tcsd-active-gateway-job/v1", ownerJobId: "job-1",
        workspaceId: "ws-x", jobId: "eval-x", ownerPid: 123,
        startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
      })
    );
    const executor = makeExecutor();
    await assert.rejects(
      () => executor.awaitStageCheckpoint(job, 6, session(true, 0)),
      (error) => {
        assert.equal(error.details.gatewayJob.jobId, "eval-x");
        return true;
      }
    );
    results.passed += 1;
    await rm(root, { recursive: true, force: true });
  }

  console.log(`executor await/orphan-reconciliation tests: ${results.passed} passed`);
} finally {
  // nothing persistent
}
