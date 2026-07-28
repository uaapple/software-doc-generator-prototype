import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const SOFTWARE_DETAIL_DESIGN_TRACE_SCHEMA =
  "software-detail-design-nine-stage-functional-trace/v1";
export const SOFTWARE_DETAIL_DESIGN_PIPELINE_ID =
  "software-detail-design-nine-stage";

export const SOFTWARE_DETAIL_DESIGN_STAGES = Object.freeze([
  stage(
    1,
    "software-detail-stage-01-initialize",
    ["input-manifest", "workspace-manifest", "matlab-session-lease"],
    "established"
  ),
  stage(
    2,
    "software-detail-stage-02-model-plan",
    ["model-plan", "environment-gate-report"],
    "reused"
  ),
  stage(
    3,
    "software-detail-stage-03-evidence-extract",
    ["model-fact-bundle", "interface-inventory", "data-dictionary"],
    "reused"
  ),
  stage(
    4,
    "software-detail-stage-04-output-ledger",
    ["output-ledger", "requirements-trace-matrix"],
    "reused"
  ),
  stage(
    5,
    "software-detail-stage-05-boundary-projection",
    ["boundary-projection", "module-structure"],
    "reused"
  ),
  stage(
    6,
    "software-detail-stage-06-architecture-draft",
    ["architecture-draft", "interface-draft"],
    "reused"
  ),
  stage(
    7,
    "software-detail-stage-07-module-draft",
    ["module-draft", "behavior-draft", "algorithm-data-draft"],
    "reused"
  ),
  stage(
    8,
    "software-detail-stage-08-content-check",
    ["consistency-report", "completeness-report", "traceability-report"],
    "reused"
  ),
  stage(
    9,
    "software-detail-stage-09-docx-finalize",
    ["detail-design-docx", "artifact-manifest", "matlab-session-cleanup"],
    "cleaned"
  )
]);

function stage(index, stageId, requiredArtifactRoles, matlabSessionAction) {
  return Object.freeze({
    index,
    order: index * 100,
    stageId,
    skillName: stageId,
    matlabSessionAction,
    requiredArtifactRoles: Object.freeze(requiredArtifactRoles)
  });
}

export async function assertSoftwareDetailDesignNineStageTrace(trace) {
  assert.equal(trace?.schema, SOFTWARE_DETAIL_DESIGN_TRACE_SCHEMA);
  assert.equal(trace?.pipelineId, SOFTWARE_DETAIL_DESIGN_PIPELINE_ID);
  assertNonEmptyString(trace?.taskId, "trace.taskId");
  assert.ok(path.isAbsolute(trace?.workspaceDir || ""), "trace.workspaceDir must be absolute");
  assert.equal(
    trace?.stages?.length,
    SOFTWARE_DETAIL_DESIGN_STAGES.length,
    "software detail design trace must contain exactly nine stages"
  );

  const workspaceRealPath = await fs.realpath(trace.workspaceDir);
  const matlabSessionId = trace?.matlabSession?.sessionId;
  assertNonEmptyString(matlabSessionId, "trace.matlabSession.sessionId");
  assert.equal(
    trace?.matlabSession?.ownerTaskId,
    trace.taskId,
    "MATLAB session must be owned by the traced task"
  );
  assert.equal(
    trace?.matlabSession?.ownership,
    "task",
    "MATLAB session ownership must be task-scoped"
  );

  const skillNames = new Set();
  const hermesSessionIds = new Set();
  const artifactPaths = new Set();

  for (const [offset, expected] of SOFTWARE_DETAIL_DESIGN_STAGES.entries()) {
    const actual = trace.stages[offset];
    assert.equal(actual?.index, expected.index, `stage ${expected.index} must be in catalog order`);
    assert.equal(actual?.order, expected.order, `stage ${expected.index} order mismatch`);
    assert.equal(actual?.stageId, expected.stageId, `stage ${expected.index} id mismatch`);
    assert.equal(actual?.skillName, expected.skillName, `stage ${expected.index} skill mismatch`);
    assert.equal(actual?.status, "validated", `stage ${expected.index} must be validated`);
    assert.equal(
      actual?.validation?.passed,
      true,
      `stage ${expected.index} deterministic validation must pass`
    );
    assert.ok(
      Number.isInteger(actual?.attempt) && actual.attempt >= 1,
      `stage ${expected.index} must record a positive attempt`
    );
    assertNonEmptyString(
      actual?.hermesSessionId,
      `stage ${expected.index} hermesSessionId`
    );
    assert.equal(
      actual?.matlabSessionId,
      matlabSessionId,
      `stage ${expected.index} must use the task-owned MATLAB session`
    );
    assert.equal(
      actual?.matlabSessionAction,
      expected.matlabSessionAction,
      `stage ${expected.index} MATLAB session lifecycle action mismatch`
    );

    skillNames.add(actual.skillName);
    assert.equal(
      hermesSessionIds.has(actual.hermesSessionId),
      false,
      `stage ${expected.index} must use a fresh Hermes session`
    );
    hermesSessionIds.add(actual.hermesSessionId);

    const artifacts = Array.isArray(actual?.artifacts) ? actual.artifacts : [];
    const artifactsByRole = new Map(artifacts.map((artifact) => [artifact?.role, artifact]));
    assert.equal(
      artifactsByRole.size,
      artifacts.length,
      `stage ${expected.index} artifact roles must be unique`
    );
    for (const role of expected.requiredArtifactRoles) {
      const artifact = artifactsByRole.get(role);
      assert.ok(artifact, `stage ${expected.index} is missing required artifact ${role}`);
      await assertMaterializedArtifact({
        artifact,
        artifactPaths,
        label: `stage ${expected.index} artifact ${role}`,
        workspaceRealPath
      });
    }
  }

  assert.equal(skillNames.size, 9, "nine stages must use nine unique skills");
  assert.equal(hermesSessionIds.size, 9, "nine stages must use nine different Hermes sessions");
  assert.equal(
    trace.matlabSession.status,
    "cleaned",
    "task-owned MATLAB session must be cleaned by stage 9"
  );

  const finalStage = trace.stages.at(-1);
  const finalStageDocx = finalStage.artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  );
  assert.deepEqual(
    trace.finalDocx,
    finalStageDocx,
    "trace.finalDocx must reference the validated stage-9 DOCX artifact"
  );
  assert.equal(trace.finalDocx.materialized, true, "final DOCX must be materialized");
  assert.match(
    trace.finalDocx.relativePath,
    /\.docx$/i,
    "final materialized artifact must use the DOCX extension"
  );
  const finalDocxPath = resolveWorkspaceArtifactPath(
    workspaceRealPath,
    trace.finalDocx.relativePath,
    "final DOCX"
  );
  const finalDocxBytes = await fs.readFile(finalDocxPath);
  assert.ok(
    finalDocxBytes.length >= 4 &&
      finalDocxBytes[0] === 0x50 &&
      finalDocxBytes[1] === 0x4b,
    "final DOCX must contain a ZIP-based DOCX payload"
  );

  return trace;
}

async function assertMaterializedArtifact({
  artifact,
  artifactPaths,
  label,
  workspaceRealPath
}) {
  assert.equal(artifact?.materialized, true, `${label} must be materialized`);
  assertNonEmptyString(artifact?.relativePath, `${label}.relativePath`);
  assert.match(artifact?.sha256 || "", /^[a-f0-9]{64}$/, `${label}.sha256 must be lowercase SHA-256`);
  assert.ok(
    Number.isInteger(artifact?.byteLength) && artifact.byteLength > 0,
    `${label}.byteLength must be a positive integer`
  );
  assert.equal(
    artifactPaths.has(artifact.relativePath),
    false,
    `${label} path must be unique across the pipeline`
  );
  artifactPaths.add(artifact.relativePath);

  const artifactPath = resolveWorkspaceArtifactPath(
    workspaceRealPath,
    artifact.relativePath,
    label
  );
  const artifactRealPath = await fs.realpath(artifactPath);
  assertPathInside(workspaceRealPath, artifactRealPath, label);
  const bytes = await fs.readFile(artifactRealPath);
  assert.equal(bytes.length, artifact.byteLength, `${label} byteLength mismatch`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    artifact.sha256,
    `${label} SHA-256 mismatch`
  );
}

function resolveWorkspaceArtifactPath(workspaceRealPath, relativePath, label) {
  assert.equal(path.isAbsolute(relativePath), false, `${label} path must be relative`);
  const normalized = path.posix.normalize(relativePath);
  assert.equal(normalized, relativePath, `${label} path must be normalized POSIX`);
  assert.equal(
    normalized === ".." || normalized.startsWith("../"),
    false,
    `${label} path must not traverse outside the task workspace`
  );
  const absolutePath = path.resolve(workspaceRealPath, ...normalized.split("/"));
  assertPathInside(workspaceRealPath, absolutePath, label);
  return absolutePath;
}

function assertPathInside(rootDir, candidate, label) {
  const relativePath = path.relative(path.resolve(rootDir), path.resolve(candidate));
  assert.ok(
    relativePath &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath),
    `${label} must stay inside the task workspace`
  );
}

function assertNonEmptyString(value, label) {
  assert.ok(typeof value === "string" && value.trim(), `${label} must be a non-empty string`);
}
