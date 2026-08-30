import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { validateStageResult } = await import(
  new URL("../src/services/tcsd-pipeline-contract.js", import.meta.url).href
);

// Review blocker 1, fourth round — end-to-end contract check for the
// "every target unprobeable" shape: runtime emits `partial` with zero
// candidates and four plan-level gaps; the contract must ACCEPT it (the
// zero-candidate semantic branch previously omitted gapCount entirely, so
// the contract read it as 0 and rejected the verdict).

async function makeContext() {
  const root = await mkdtemp(path.join(tmpdir(), "tcsd-contract-stage6-"));
  const workspaceDir = path.join(root, "workspace");
  const outputs = path.join(workspaceDir, "outputs");
  await mkdir(outputs, { recursive: true });
  const plan = {
    schema: "simulink-ut-state-probe-plan/v1",
    model: "M",
    summary: {
      target_count: 4, candidate_count: 0, unplanned_count: 4,
      unprobeable_target_count: 4, nonexecutable_target_count: 4,
      budget_truncated_target_count: 0, plan_level_gap_count: 4,
    },
    targets: Array.from({ length: 4 }, (_, index) => ({
      operator_id: `M:${index + 1}`, port_index: 1,
      status: "unprobeable", probe_strategy: "unprobeable",
      unprobeable_reason: "linked_library_mutation_denied: linked library write denied",
      candidate_count: 0,
    })),
    tests: [],
  };
  await writeFile(path.join(outputs, "M_state_probe_plan.json"), JSON.stringify(plan), "utf8");
  const raw = {
    schema: "tcsd-agent-stage-result/v1",
    jobId: "job-1",
    stageIndex: 6,
    status: "partial",
    summary: "状态及时序刺激已生成；4 项缺口（其中计划级缺口 4 项，其余为观测缺口）已登记（partial），以第 9 阶段实测覆盖为准。",
    artifacts: [{ path: "outputs/M_state_probe_plan.json", kind: "json", role: "evidence" }],
    evidence: {
      candidateCount: 0,
      probeExecuted: false,
      unprobeableTargetCount: 4,
      budgetTruncatedTargetCount: 0,
      planLevelGapCount: 4,
      reconciliation: null,
    },
  };
  const semanticEvidence = {
    schema: "tcsd-host-semantic-validation/v1",
    stageIndex: 6,
    passed: true,
    details: {
      candidateCount: 0,
      probeExecuted: false,
      observationCount: 0,
      reconciliation: {
        plannedStepCount: 0, observedCount: 0, mismatchCount: 0,
        transientFailedCount: 0, notExecutedCount: 0, mpsBlockedCount: 0,
        unprobeableTargetCount: 4, budgetTruncatedTargetCount: 0,
        planLevelGapCount: 4, gapCount: 4, conserved: true,
      },
    },
  };
  const context = {
    jobId: "job-1",
    stageIndex: 6,
    workspaceDir,
    semanticEvidence,
  };
  const cleanup = () => rm(root, { recursive: true, force: true });
  return { raw, context, cleanup };
}

let passed = 0;
try {
  // 1. The all-unprobeable `partial` verdict is contract-legal.
  {
    const { raw, context, cleanup } = await makeContext();
    await validateStageResult(raw, context);
    passed += 1;
    console.log("ok - all-unprobeable partial verdict accepted");
    await cleanup();
  }

  // 2. Regression: a semantic report MISSING gapCount (the old bug) reads as
  //    zero gaps and must be rejected for a partial verdict.
  {
    const { raw, context, cleanup } = await makeContext();
    delete context.semanticEvidence.details.reconciliation.gapCount;
    await assert.rejects(
      () => validateStageResult(raw, context),
      (error) => error.message.includes("无缺口时第 6 阶段不得记为 partial")
    );
    passed += 1;
    console.log("ok - missing gapCount (legacy bug shape) rejected");
    await cleanup();
  }

  // 3. Zero plan gaps must NOT be labelled partial.
  {
    const { raw, context, cleanup } = await makeContext();
    raw.evidence.planLevelGapCount = 0;
    raw.evidence.unprobeableTargetCount = 0;
    context.semanticEvidence.details.reconciliation.planLevelGapCount = 0;
    context.semanticEvidence.details.reconciliation.gapCount = 0;
    await assert.rejects(
      () => validateStageResult(raw, context),
      (error) => error.message.includes("无缺口时第 6 阶段不得记为 partial")
    );
    passed += 1;
    console.log("ok - zero-gap partial verdict rejected");
    await cleanup();
  }

  // 4. Plan targets disagreeing with their own summary is drift -> reject.
  {
    const { raw, context, cleanup } = await makeContext();
    // Summary says 4 unprobeable but the targets were tampered down to 2.
    const planPath = path.join(context.workspaceDir, "outputs", "M_state_probe_plan.json");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    plan.targets = plan.targets.slice(0, 2);
    await writeFile(planPath, JSON.stringify(plan), "utf8");
    await assert.rejects(
      () => validateStageResult(raw, context),
      (error) => error.message.includes("计划目标与摘要的缺口计数不一致")
    );
    passed += 1;
    console.log("ok - plan target/summary drift rejected");
    await cleanup();
  }

  console.log(`contract stage-6 gap tests: ${passed} passed`);
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
}
