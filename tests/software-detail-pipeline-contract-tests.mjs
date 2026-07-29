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
  validateSoftwareDetailEvidenceArtifacts,
  validateSoftwareDetailModelPlanArtifacts,
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
    matlabSessionId:
      "matlabSessionId" in overrides
        ? overrides.matlabSessionId
        : definition.order === 100
          ? ""
          : matlabSessionId,
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
    matlabSessionId:
      "matlabSessionId" in overrides
        ? overrides.matlabSessionId
        : matlabSessionId,
    matlabSessionClosed: definition.order === 900,
    hermesSessionId: overrides.hermesSessionId || `hermes-${definition.order}`,
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
assert.deepEqual(
  stages.map((stage) => stage.runtimeKind),
  [
    "host",
    "reasoning",
    "matlab",
    "host",
    "reasoning",
    "reasoning",
    "reasoning",
    "reasoning",
    "docx-render"
  ]
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
  assert.equal(stage.hermesSessionRequired, true);
  assert.equal("execution" in stage, false);
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

assert.deepEqual(
  stages.map((stage) => stage.outputs.map((artifact) => artifact.role)),
  [
    ["input-manifest", "workspace-manifest", "matlab-session-lease"],
    ["model-index", "hierarchy-manifest", "analysis-queue"],
    ["evidence-shards"],
    ["output-ledger", "coverage-report"],
    ["boundary-projection", "behavior-groups", "narrative-plan"],
    ["architecture-draft"],
    ["module-draft"],
    ["checked-content", "content-check-report"],
    ["detail-design-docx", "artifact-manifest"]
  ]
);

const removedArtifactRoles = new Set([
  "job-input-manifest",
  "job-workspace",
  "docx",
  "manifest"
]);
for (const stage of stages) {
  assert.equal(
    [...stage.inputs, ...stage.outputs].some((artifact) =>
      removedArtifactRoles.has(artifact.role)
    ),
    false
  );
}
for (const stage of stages.slice(1)) {
  assert.equal(
    stage.inputs.some(
      (artifact) =>
        artifact.role === "matlab-session-lease" &&
        artifact.sourceStageId === "software-detail-stage-01-initialize"
    ),
    true
  );
}

{
  let job = createSoftwareDetailPipelineJob({ jobId: "job-full-flow" });
  assert.equal(job.status, "queued");
  assert.equal(job.matlabSessionId, "");
  assert.equal(job.matlabSessionCleaned, false);

  for (const [index, definition] of stages.entries()) {
    const started = start(job, definition);
    job = started.job;
    assert.equal(job.status, "running");
    assert.equal(
      started.input.matlabSessionId,
      index === 0 ? "" : matlabSessionId
    );
    assert.equal(
      job.matlabSessionId,
      index === 0 ? "" : matlabSessionId
    );
    assert.equal(
      job.stages.find((stage) => stage.id === definition.id).status,
      "running"
    );

    const finished = finishSoftwareDetailStage(
      job,
      completedResult(job, definition)
    );
    job = finished.job;
    assert.equal(finished.result.matlabSessionId, matlabSessionId);
    assert.equal(
      finished.result.matlabSessionClosed,
      definition.order === 900
    );
    assert.equal(finished.result.hermesSessionId, `hermes-${definition.order}`);
    assert.equal(job.matlabSessionId, matlabSessionId);
    const completedStage = job.stages.find(
      (stage) => stage.id === definition.id
    );
    assert.equal(completedStage.status, "completed");
    assert.equal(
      completedStage.result.hermesSessionId,
      `hermes-${definition.order}`
    );
  }

  assert.equal(job.status, "completed");
  assert.equal(job.matlabSessionId, matlabSessionId);
  assert.equal(job.matlabSessionCleaned, true);
  assert.deepEqual(job.hermesSessionIds, [
    "hermes-100",
    "hermes-200",
    "hermes-300",
    "hermes-400",
    "hermes-500",
    "hermes-600",
    "hermes-700",
    "hermes-800",
    "hermes-900"
  ]);
  assert.equal(new Set(job.hermesSessionIds).size, 9);
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
  assert.equal(started.input.matlabSessionId, "");
  const failed = finishSoftwareDetailStage(started.job, {
    schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
    jobId: started.job.jobId,
    stageId: stages[0].id,
    attempt: started.input.attempt,
    status: "failed",
    matlabSessionId: "",
    matlabSessionClosed: false,
    hermesSessionId: "hermes-stage-1-failed-attempt",
    artifacts: []
  }).job;
  assert.equal(failed.status, "failed");
  assert.equal(failed.matlabSessionId, "");
  assert.equal(failed.stages[0].status, "failed");
  assert.equal(
    failed.stages[0].result.hermesSessionId,
    "hermes-stage-1-failed-attempt"
  );
  assert.deepEqual(failed.hermesSessionIds, [
    "hermes-stage-1-failed-attempt"
  ]);
  assert.deepEqual(getSoftwareDetailResumePoint(failed), {
    lastCompletedStageId: "",
    nextStageId: "software-detail-stage-01-initialize",
    nextAttempt: 2
  });
  const prepared = prepareSoftwareDetailJobForResume(failed);
  const restarted = start(prepared.job, stages[0]);
  assert.equal(restarted.input.attempt, 2);
  assert.equal(restarted.input.matlabSessionId, "");
  assert.throws(
    () =>
      finishSoftwareDetailStage(
        restarted.job,
        completedResult(restarted.job, stages[0], {
          hermesSessionId: "hermes-stage-1-failed-attempt"
        })
      ),
    (error) => error.code === "software_detail_hermes_session_reused"
  );
  const recovered = finishSoftwareDetailStage(
    restarted.job,
    completedResult(restarted.job, stages[0], {
      hermesSessionId: "hermes-stage-1-retry"
    })
  ).job;
  assert.equal(recovered.matlabSessionId, matlabSessionId);
  assert.deepEqual(recovered.hermesSessionIds, [
    "hermes-stage-1-failed-attempt",
    "hermes-stage-1-retry"
  ]);
}

{
  for (const definition of stages) {
    for (const status of ["completed", "failed"]) {
      assert.throws(
        () =>
          validateSoftwareDetailStageResult(
            {
              schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
              jobId: `job-missing-hermes-${definition.order}-${status}`,
              stageId: definition.id,
              attempt: 1,
              status,
              matlabSessionId:
                definition.order === 100 && status === "failed"
                  ? ""
                  : matlabSessionId,
              matlabSessionClosed:
                status === "completed" && definition.order === 900,
              hermesSessionId: "",
              artifacts:
                status === "completed"
                  ? artifactsFor(definition.outputs, "artifacts")
                  : []
            },
            {
              expectedMatlabSessionId:
                definition.order === 100 ? undefined : matlabSessionId,
              usedHermesSessionIds: []
            }
          ),
        /hermesSessionId/
      );
    }
  }
}

{
  const job = createSoftwareDetailPipelineJob({
    jobId: "job-stage-1-must-create-matlab"
  });
  const started = start(job, stages[0]);
  assert.throws(
    () =>
      finishSoftwareDetailStage(
        started.job,
        completedResult(started.job, stages[0], {
          matlabSessionId: ""
        })
      ),
    /matlabSessionId/
  );
}

{
  for (const definition of stages.slice(1)) {
    assert.throws(
      () =>
        validateSoftwareDetailStageResult(
          {
            schema: SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA,
            jobId: `job-missing-matlab-${definition.order}`,
            stageId: definition.id,
            attempt: 1,
            status: "completed",
            matlabSessionId: "",
            matlabSessionClosed: definition.order === 900,
            hermesSessionId: `hermes-missing-matlab-${definition.order}`,
            artifacts: artifactsFor(definition.outputs, "artifacts")
          },
          {
            expectedMatlabSessionId: matlabSessionId,
            usedHermesSessionIds: []
          }
        ),
      /matlabSessionId/
    );
  }
}

{
  let job = createSoftwareDetailPipelineJob({
    jobId: "job-resume-requires-matlab"
  });
  job = complete(job, stages[0]);
  job = complete(job, stages[1]);
  const missingMatlabSession = {
    ...job,
    status: "failed",
    matlabSessionId: ""
  };
  assert.throws(
    () => prepareSoftwareDetailJobForResume(missingMatlabSession),
    (error) => error.code === "software_detail_matlab_session_unavailable"
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
          hermesSessionId: "hermes-final-cleanup",
          artifacts: artifactsFor(finalDefinition.outputs, "artifacts")
        },
        { expectedMatlabSessionId: matlabSessionId, usedHermesSessionIds: [] }
      ),
    (error) => error.code === "software_detail_matlab_session_cleanup_invalid"
  );
}

{
  const hierarchyManifest = {
    schema: "software-detail-hierarchy-manifest/v1",
    documentUnits: [
      {
        path: "Model/A01_Function",
        allowedOutputs: ["A01_Output"]
      },
      {
        path: "Model/A02_Function",
        allowedOutputs: ["A02_Output"]
      }
    ]
  };
  const analysisQueue = {
    schema: "software-detail-analysis-queue/v1",
    items: [
      {
        parentDocumentUnit: "Model/A01_Function",
        analysisUnit: "Model/A01_Function/B01_Calculation"
      },
      {
        parentDocumentUnit: "Model/A02_Function",
        analysisUnit: "Model/A02_Function",
        scope: "document_unit_direct_fallback"
      }
    ]
  };
  assert.equal(
    validateSoftwareDetailModelPlanArtifacts(
      hierarchyManifest,
      analysisQueue
    ).queueItems.length,
    2
  );
  assert.throws(
    () =>
      validateSoftwareDetailModelPlanArtifacts(hierarchyManifest, {
        ...analysisQueue,
        items: analysisQueue.items.slice(0, 1)
      }),
    (error) =>
      error.code === "software_detail_model_plan_missing_queue_item" &&
      error.details.documentUnit === "Model/A02_Function"
  );

  const evidenceShards = {
    schema: "software-detail-evidence-shards/v1",
    shards: [
      {
        parentDocumentUnitPath: "Model/A01_Function",
        analysisUnitPath: "Model/A01_Function/B01_Calculation",
        outports: [{ name: "A01_Output" }],
        limitations: []
      },
      {
        parentDocumentUnitPath: "Model/A02_Function",
        analysisUnitPath: "Model/A02_Function",
        scope: "document_unit_direct_fallback",
        outports: { name: "A02_Output" },
        limitations: []
      }
    ]
  };
  assert.equal(
    validateSoftwareDetailEvidenceArtifacts(
      hierarchyManifest,
      analysisQueue,
      evidenceShards
    ).documentUnits.length,
    2
  );
  assert.throws(
    () =>
      validateSoftwareDetailEvidenceArtifacts(
        hierarchyManifest,
        analysisQueue,
        {
          ...evidenceShards,
          shards: evidenceShards.shards.map((shard) => ({
            ...shard,
            outports:
              shard.parentDocumentUnitPath === "Model/A02_Function"
                ? []
                : shard.outports,
            limitations:
              shard.parentDocumentUnitPath === "Model/A02_Function"
                ? [
                    {
                      affectedBoundaryOutput: "A02_Output",
                      reason: "targeted model read was unavailable"
                    }
                  ]
                : []
          }))
        }
      ),
    (error) =>
      error.code ===
        "software_detail_evidence_direct_output_missing" &&
      error.details.output === "A02_Output"
  );

  assert.throws(
    () =>
      validateSoftwareDetailModelPlanArtifacts(hierarchyManifest, {
        ...analysisQueue,
        items: [...analysisQueue.items, { ...analysisQueue.items[1] }]
      }),
    (error) =>
      error.code === "software_detail_model_plan_duplicate_queue_item"
  );

  const directOutputHierarchy = {
    schema: "software-detail-hierarchy-manifest/v1",
    documentUnits: [
      {
        path: "Model/A03_Function",
        allowedOutputs: ["A03_Output1", "A03_Output2"]
      }
    ]
  };
  const directOutputQueue = {
    schema: "software-detail-analysis-queue/v1",
    items: [
      ...Array.from({ length: 12 }, (_, index) => ({
        parentDocumentUnit: "Model/A03_Function",
        analysisUnit: `Model/A03_Function/B${String(index + 1).padStart(2, "0")}`,
        scope: "analysis_unit"
      })),
      {
        parentDocumentUnit: "Model/A03_Function",
        scope: "direct_outport",
        directOutport: "A03_Output1"
      },
      {
        parentDocumentUnit: "Model/A03_Function",
        scope: "direct_outport",
        directOutport: "A03_Output2"
      }
    ]
  };
  const analysisShards = Array.from({ length: 12 }, (_, index) => ({
    parentDocumentUnitPath: "Model/A03_Function",
    analysisUnitPath: `Model/A03_Function/B${String(index + 1).padStart(2, "0")}`,
    scope: "analysis_unit",
    outports: []
  }));
  const directOutportShards = [
    {
      parentDocumentUnitPath: "Model/A03_Function",
      scope: "direct_outport",
      outports: { name: "A03_Output1" }
    },
    {
      parentDocumentUnitPath: "Model/A03_Function",
      scope: "direct_outport",
      outports: [{ name: "A03_Output2" }]
    }
  ];
  const normalizedDirectPlan = validateSoftwareDetailModelPlanArtifacts(
    directOutputHierarchy,
    directOutputQueue
  );
  assert.equal(normalizedDirectPlan.queueItems.length, 14);
  assert.equal(normalizedDirectPlan.queueItems[12].analysisUnit, "");
  assert.equal(
    normalizedDirectPlan.queueItems[12].directOutport,
    "A03_Output1"
  );
  assert.equal(
    validateSoftwareDetailEvidenceArtifacts(
      directOutputHierarchy,
      directOutputQueue,
      {
        schema: "software-detail-evidence-shards/v1",
        shards: [...analysisShards, ...directOutportShards]
      }
    ).queueItems.length,
    14
  );
  assert.throws(
    () =>
      validateSoftwareDetailEvidenceArtifacts(
        directOutputHierarchy,
        directOutputQueue,
        {
          schema: "software-detail-evidence-shards/v1",
          shards: [
            ...analysisShards,
            ...directOutportShards.map((shard) => ({
              ...shard,
              scope: "analysis_unit"
            }))
          ]
        }
      ),
    (error) =>
      error.code === "software_detail_evidence_queue_item_missing" &&
      error.details.output === "A03_Output1"
  );
  assert.throws(
    () =>
      validateSoftwareDetailEvidenceArtifacts(
        directOutputHierarchy,
        directOutputQueue,
        {
          schema: "software-detail-evidence-shards/v1",
          shards: [...analysisShards, directOutportShards[0]]
        }
      ),
    (error) =>
      error.code === "software_detail_evidence_direct_output_missing" &&
      error.details.output === "A03_Output2"
  );
  assert.throws(
    () =>
      validateSoftwareDetailEvidenceArtifacts(
        directOutputHierarchy,
        directOutputQueue,
        {
          schema: "software-detail-evidence-shards/v1",
          shards: [
            ...analysisShards,
            {
              parentDocumentUnitPath: "Model/A03_Function",
              scope: "direct_outport",
              outports: [
                { name: "A03_Output1" },
                { name: "A03_Output2" }
              ]
            }
          ]
        }
      ),
    (error) =>
      error.code === "software_detail_evidence_queue_item_missing"
  );
}

console.log("software detail minimal nine-stage contract tests passed");
