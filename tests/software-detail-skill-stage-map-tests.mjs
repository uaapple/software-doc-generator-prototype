import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestUrl = new URL(
  "../docs/software-detail-skill-stage-map.json",
  import.meta.url
);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const expectedStages = [
  ["software-detail-stage-01-initialize", 100],
  ["software-detail-stage-02-model-plan", 200],
  ["software-detail-stage-03-evidence-extract", 300],
  ["software-detail-stage-04-output-ledger", 400],
  ["software-detail-stage-05-boundary-projection", 500],
  ["software-detail-stage-06-architecture-draft", 600],
  ["software-detail-stage-07-module-draft", 700],
  ["software-detail-stage-08-content-check", 800],
  ["software-detail-stage-09-docx-finalize", 900]
];

assert.equal(manifest.schema, "software-detail-skill-stage-map/v1");
assert.equal(
  manifest.source.commit,
  "ce5d3c2c08788fa8ab9013f18bd985f7355df0b6"
);
assert.equal(
  manifest.source.skillBlobSha1,
  "8e99cda6da9b54153b73476f884b463ebe8b1bc4"
);
assert.equal(
  manifest.source.skillContentSha256,
  "f9b9fb108ad5bee97597f9dc01a59cf37a6f85f0afd619b21b78df291f8d1dae"
);

assert.deepEqual(
  manifest.stages.map((stage) => [stage.stageId, stage.order]),
  expectedStages
);
assert.equal(manifest.stages.length, 9);
assert.equal(new Set(manifest.stages.map((stage) => stage.stageId)).size, 9);
assert.equal(new Set(manifest.stages.map((stage) => stage.skillName)).size, 9);
for (const stage of manifest.stages) {
  assert.equal(stage.skillName, stage.stageId);
  assert.match(stage.skillVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(stage.hermesSession, "new");
  assert.ok(stage.responsibility);
}

const stageIds = new Set(manifest.stages.map((stage) => stage.stageId));
const clauseSets = [
  ["SDD-DEF", manifest.defaultRules, 24, manifest.source.defaultRuleTextSha256],
  ["SDD-WF", manifest.workflowRules, 21, manifest.source.workflowRuleTextSha256],
  ["SDD-OUT", manifest.outputRules, 13, manifest.source.outputRuleTextSha256]
];
const allClauses = clauseSets.flatMap(([, clauses]) => clauses);

for (const [prefix, clauses, expectedCount, expectedTextSha256] of clauseSets) {
  assert.equal(clauses.length, expectedCount);
  assert.deepEqual(
    clauses.map((clause) => clause.ordinal),
    Array.from({ length: expectedCount }, (_, index) => index + 1)
  );
  assert.deepEqual(
    clauses.map((clause) => clause.id),
    Array.from(
      { length: expectedCount },
      (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`
    )
  );
  assert.equal(
    sha256(clauses.map((clause) => clause.text).join("\n")),
    expectedTextSha256,
    `${prefix} text must remain byte-for-byte equivalent to the pinned source extraction`
  );
}

assert.equal(allClauses.length, 58);
assert.equal(new Set(allClauses.map((clause) => clause.id)).size, 58);
for (const clause of allClauses) {
  assert.ok(clause.text);
  assert.ok(["shared", "stage"].includes(clause.scope));
  assert.ok(Array.isArray(clause.stageIds));
  if (clause.scope === "shared") {
    assert.deepEqual(clause.stageIds, []);
  } else {
    assert.ok(clause.stageIds.length > 0, `${clause.id} is unmapped`);
    assert.equal(new Set(clause.stageIds).size, clause.stageIds.length);
    for (const stageId of clause.stageIds) {
      assert.ok(stageIds.has(stageId), `${clause.id} has unknown stage ${stageId}`);
    }
  }
}
for (const stageId of stageIds) {
  assert.ok(
    allClauses.some((clause) => clause.stageIds.includes(stageId)),
    `${stageId} has no mapped source clause`
  );
}

const expectedReferences = new Set([
  "references/a07-granularity-pattern.md",
  "references/model-evidence.md",
  "references/module-boundary.md",
  "references/template-filling.md",
  "references/writing-rules.md"
]);
const expectedScripts = new Set([
  "scripts/collect_module_doc_evidence.m",
  "scripts/docx_list_format.py",
  "scripts/satk_eval.py",
  "scripts/setup_module_doc_support.m",
  "scripts/validate_narrative_boundary.py"
]);
const expectedTemplates = new Set([
  "assets/templates/Template_Software_Detailed_Design.docx"
]);
const pathsByType = (type) =>
  new Set(
    manifest.resources
      .filter((resource) => resource.type === type)
      .map((resource) => resource.path)
  );

assert.deepEqual(pathsByType("reference"), expectedReferences);
assert.deepEqual(pathsByType("script"), expectedScripts);
assert.deepEqual(pathsByType("template"), expectedTemplates);
assert.equal(manifest.resources.length, 11);
assert.equal(new Set(manifest.resources.map((resource) => resource.path)).size, 11);
for (const resource of manifest.resources) {
  assert.match(resource.blobSha1, /^[a-f0-9]{40}$/);
  assert.match(resource.contentSha256, /^[a-f0-9]{64}$/);
  assert.ok(stageIds.has(resource.ownerStageId));
  assert.ok(resource.useStageIds.length > 0);
  assert.ok(resource.useStageIds.includes(resource.ownerStageId));
  for (const stageId of resource.useStageIds) {
    assert.ok(stageIds.has(stageId));
  }
}

assert.deepEqual(
  manifest.sessionPolicy.matlab.reuseStageIds,
  expectedStages.map(([stageId]) => stageId)
);
assert.equal(
  manifest.sessionPolicy.matlab.startAtStageId,
  "software-detail-stage-01-initialize"
);
assert.equal(
  manifest.sessionPolicy.matlab.keepThroughStageId,
  "software-detail-stage-09-docx-finalize"
);
assert.equal(manifest.sessionPolicy.matlab.processesPerJob, 1);
assert.equal(manifest.sessionPolicy.matlab.reuseOneTaskOwnedSession, true);
assert.equal(manifest.sessionPolicy.matlab.concurrentJobsMayShareSession, false);
assert.equal(manifest.sessionPolicy.hermes.newSessionForEveryStage, true);
assert.equal(manifest.sessionPolicy.hermes.crossStageReuseAllowed, false);
assert.equal(manifest.sessionPolicy.hermes.failedAttemptSessionReuseAllowed, false);

console.log(
  "software detail skill-stage map tests passed: 9 stages, 58 clauses, 11 resources"
);
