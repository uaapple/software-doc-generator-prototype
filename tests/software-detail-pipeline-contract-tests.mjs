import assert from "node:assert/strict";
import {
  SOFTWARE_DETAIL_STAGE_CATALOG_VERSION,
  getSoftwareDetailStage,
  listSoftwareDetailStages
} from "../src/services/software-detail-stage-catalog.js";
import {
  SOFTWARE_DETAIL_JOB_STATUSES,
  SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
  SOFTWARE_DETAIL_STAGE_STATUSES,
  createSoftwareDetailPipelineJob,
  finishSoftwareDetailStage,
  getSoftwareDetailResumePoint,
  prepareSoftwareDetailJobForResume,
  startSoftwareDetailStage,
  validateSoftwareDetailStageResult
} from "../src/services/software-detail-pipeline-contract.js";

const expectedStageIds = [
  "software-detail-stage-01-initialize",
  "software-detail-stage-02-model-plan",
  "software-detail-stage-03-evidence-extract",
  "software-detail-stage-04-output-ledger",
  "software-detail-stage-05-boundary-projection",
  "software-detail-stage-06-architecture-draft",
  "software-detail-stage-07-module-draft",
  "software-detail-stage-08-content-check",
  "software-detail-stage-09-docx-finalize"
];

const expectedOrders = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const stages = listSoftwareDetailStages();
const matlabSessionId = "matlab-job-contract-001";

function artifactsFor(specifications, prefix) {
  return specifications
    .filter((specification) => specification.required)
    .map((specification) => ({
      role: specification.role,
      relativePath: `${prefix}/${specification.role}.json`
    }));
}

function start(job, definition, overrides = {}) {
  return startSoftwareDetailStage(job, {
    stageId: definition.id,
    matlabSessionId: overrides.matlabSessionId || matlabSessionId,
    artifacts: overrides.artifacts || artifactsFor(definition.inputs, "inputs")
  });
}

function completedResult(job, definition, overrides = {}) {
  const record = job.stages.find((stage) => stage.id === definition.id);
  return {
    schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
    jobId: job.jobId,
    stageId: definition.id,
    attempt: record.attempt,
    status: "completed",
    matlabSessionId: overrides.matlabSessionId || matlabSessionId,
    matlabSessionClosed: definition.order === 900,
    hermesSessionId:
      overrides.hermesSessionId ||
      (definition.execution === "hermes" ? `hermes-${definition.order}` : ""),
    artifacts:
      overrides.artifacts || artifactsFor(definition.outputs, "artifacts")
  };
}

function complete(job, definition, overrides = {}) {
  const started = start(job, definition, overrides);
  return finishSoftwareDetailStage(
    started.job,
    completedResult(started.job, definition, overrides)
  ).job;
}

assert.equal(SOFTWARE_DETAIL_STAGE_CATALOG_VERSION, "software-detail-minimal/v1");
assert.equal(stages.length, 9);
assert.deepEqual(stages.map((stage) => stage.id), expectedStageIds);
assert.deepEqual(stages.map((stage) => stage.order), expectedOrders);
assert.equal(new Set(stages.map((stage) => stage.skillName)).size, 9);
assert.deepEqual(
  stages.map((stage) => stage.skillName),
  expectedStageIds
);
assert.deepEqual(SOFTWARE_DETAIL_JOB_STATUSES, [
  "queued",
  "running",
  "completed",
  "failed"
]);
assert.deepEqual(SOFTWARE_DETAIL_STAGE_STATUSES, [
  "pending",
  "running",
  "completed",
  "failed"
]);

for (const stage of stages) {
  assert.equal(getSoftwareDetailStage(stage.id), stage);
  assert.ok(stage.skillName);
  assert.ok(stage.responsibility);
  assert.ok(stage.inputs.length > 0);
  assert.ok(stage.outputs.length > 0);
  assert.equal(
    new Set(stage.inputs.map((artifact) => artifact.role)).size,
    stage.inputs.length
  );
  assert.equal(
    new Set(stage.outputs.map((artifact) => artifact.role)).size,
    stage.outputs.length
  );
}

{
  let job = createSoftwareDetailPipelineJob({ jobId: "job-full-flow" });
  assert.equal(job.status, "queued");
  assert.equal(job.matlabSessionId, "");
  assert.equal(job.matlabSessionCleaned, false);

  for (const definition of stages) {
    const started = start(job, definition);
    job = started.job;
    assert.equal(job.status, "running");
    assert.equal(job.matlabSessionId, matlabSessionId);
    assert.equal(started.input.matlabSessionId, matlabSessionId);
    assert.equal(
      job.stages.find((stage) => stage.id === definition.id).status,
      "running"
    );

    const finished = finishSoftwareDetailStage(
      job,
      completedResult(job, definition)
    );
    job = finished.job;
    assert.equal(
      job.stages.find((stage) => stage.id === definition.id).status,
      "completed"
    );
  }

  assert.equal(job.status, "completed");
  assert.equal(job.matlabSessionId, matlabSessionId);
  assert.equal(job.matlabSessionCleaned, true);
  assert.deepEqual(job.hermesSessionIds, [
    "hermes-200",
    "hermes-500",
    "hermes-600",
    "hermes-700",
    "hermes-800"
  ]);
  assert.deepEqual(getSoftwareDetailResumePoint(job), {
    lastCompletedStageId: "software-detail-stage-09-docx-finalize",
    nextStageId: "",
    nextAttempt: 0
  });
}

{
  const job = createSoftwareDetailPipelineJob({ jobId: "job-missing-input" });
  assert.throws(
    () => start(job, stages[0], { artifacts: [] }),
    (error) =>
      error.code === "software_detail_required_artifact_missing" &&
      error.details.role === "source-model"
  );
}

{
  const job = createSoftwareDetailPipelineJob({ jobId: "job-missing-output" });
  const started = start(job, stages[0]);
  assert.throws(
    () =>
      finishSoftwareDetailStage(
        started.job,
        completedResult(started.job, stages[0], { artifacts: [] })
      ),
    (error) => error.code === "software_detail_required_artifact_missing"
  );
}

{
  const job = createSoftwareDetailPipelineJob({ jobId: "job-order" });
  assert.throws(
    () => start(job, stages[1]),
    (error) => error.code === "software_detail_stage_out_of_order"
  );
  assert.throws(
    () =>
      finishSoftwareDetailStage(
        job,
        completedResult(
          {
            ...job,
            stages: job.stages.map((stage, index) =>
              index === 0 ? { ...stage, attempt: 1 } : stage
            )
          },
          stages[0]
        )
      ),
    (error) => error.code === "software_detail_job_not_running"
  );
}

{
  let job = createSoftwareDetailPipelineJob({ jobId: "job-matlab-reuse" });
  job = complete(job, stages[0]);
  assert.throws(
    () => start(job, stages[1], { matlabSessionId: "different-matlab-session" }),
    (error) => error.code === "software_detail_matlab_session_mismatch"
  );
}

{
  let job = createSoftwareDetailPipelineJob({ jobId: "job-hermes-reuse" });
  for (const definition of stages.slice(0, 5)) {
    job = complete(job, definition);
  }
  const stageSix = stages[5];
  const started = start(job, stageSix);
  assert.throws(
    () =>
      finishSoftwareDetailStage(
        started.job,
        completedResult(started.job, stageSix, {
          hermesSessionId: "hermes-500"
        })
      ),
    (error) => error.code === "software_detail_hermes_session_reused"
  );
}

{
  let job = createSoftwareDetailPipelineJob({ jobId: "job-resume" });
  for (const definition of stages.slice(0, 3)) {
    job = complete(job, definition);
  }
  const interrupted = start(job, stages[3]).job;
  assert.deepEqual(getSoftwareDetailResumePoint(interrupted), {
    lastCompletedStageId: "software-detail-stage-03-evidence-extract",
    nextStageId: "software-detail-stage-04-output-ledger",
    nextAttempt: 2
  });

  const prepared = prepareSoftwareDetailJobForResume(interrupted);
  assert.equal(prepared.job.status, "running");
  assert.equal(prepared.job.stages[3].status, "pending");
  assert.equal(prepared.job.stages[3].attempt, 1);
  assert.equal(prepared.job.stages[3].input, null);
  const restarted = start(prepared.job, stages[3]);
  assert.equal(restarted.input.attempt, 2);
  assert.equal(restarted.input.matlabSessionId, matlabSessionId);
}

{
  const job = createSoftwareDetailPipelineJob({ jobId: "job-failed-resume" });
  const started = start(job, stages[0]);
  const failed = finishSoftwareDetailStage(started.job, {
    schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
    jobId: started.job.jobId,
    stageId: stages[0].id,
    attempt: started.input.attempt,
    status: "failed",
    matlabSessionId,
    matlabSessionClosed: false,
    hermesSessionId: "",
    artifacts: []
  }).job;
  assert.equal(failed.status, "failed");
  assert.equal(failed.stages[0].status, "failed");
  assert.deepEqual(getSoftwareDetailResumePoint(failed), {
    lastCompletedStageId: "",
    nextStageId: "software-detail-stage-01-initialize",
    nextAttempt: 2
  });
  const prepared = prepareSoftwareDetailJobForResume(failed);
  const restarted = start(prepared.job, stages[0]);
  assert.equal(restarted.input.attempt, 2);
  assert.equal(restarted.input.matlabSessionId, matlabSessionId);
}

{
  const definition = stages[4];
  assert.throws(
    () =>
      validateSoftwareDetailStageResult(
        {
          schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
          jobId: "job-session-validation",
          stageId: definition.id,
          attempt: 1,
          status: "completed",
          matlabSessionId,
          matlabSessionClosed: false,
          hermesSessionId: "",
          artifacts: artifactsFor(definition.outputs, "artifacts")
        },
        { expectedMatlabSessionId: matlabSessionId, usedHermesSessionIds: [] }
      ),
    /hermesSessionId/
  );
}

{
  const finalDefinition = stages.at(-1);
  assert.throws(
    () =>
      validateSoftwareDetailStageResult(
        {
          schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
          jobId: "job-final-cleanup",
          stageId: finalDefinition.id,
          attempt: 1,
          status: "completed",
          matlabSessionId,
          matlabSessionClosed: false,
          hermesSessionId: "",
          artifacts: artifactsFor(finalDefinition.outputs, "artifacts")
        },
        { expectedMatlabSessionId: matlabSessionId, usedHermesSessionIds: [] }
      ),
    (error) => error.code === "software_detail_matlab_session_cleanup_invalid"
  );
}

console.log("software detail minimal nine-stage contract tests passed");
