import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listSoftwareDetailStages } from "../src/services/software-detail-stage-catalog.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceCommit = "ce5d3c2c08788fa8ab9013f18bd985f7355df0b6";
const sourceRoot = "skills/hermes/simulink-module-description-generator";
const runtimeRoot = path.join(
  repoRoot,
  "skills/hermes/software-detail-runtime"
);
const wave0Map = readJson("docs/software-detail-skill-stage-map.json");
const sourceManifest = readJson(
  "skills/hermes/software-detail-runtime/source-manifest.json"
);
const sharedRules = readJson(
  "skills/hermes/software-detail-runtime/shared/software-detail-shared-rules.json"
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sorted = (values) => [...values].sort();

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function showPinned(relativePath) {
  return execFileSync(
    "git",
    ["show", `${sourceCommit}:${sourceRoot}/${relativePath}`],
    { cwd: repoRoot }
  );
}

function pinnedBlob(relativePath) {
  return execFileSync(
    "git",
    ["rev-parse", `${sourceCommit}:${sourceRoot}/${relativePath}`],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim();
}

function section(markdown, heading, nextHeading) {
  const start = markdown.indexOf(`${heading}\n\n`);
  assert.notEqual(start, -1, `missing ${heading}`);
  const bodyStart = start + heading.length + 2;
  const end = nextHeading
    ? markdown.indexOf(`\n${nextHeading}`, bodyStart)
    : markdown.length;
  assert.notEqual(end, -1, `missing ${nextHeading}`);
  return markdown.slice(bodyStart, end);
}

function parseArtifactRoles(markdown, heading, nextHeading) {
  return [
    ...section(markdown, heading, nextHeading).matchAll(
      /^- `([a-z][a-z0-9-]+)`(?=[:.]| from)/gm
    )
  ].map((match) => match[1]);
}

function parseSkillIdentity(markdown) {
  const match = markdown.match(
    /^---\nname: ([^\n]+)\nmetadata:\n  version: "([^"]+)"\ndescription: ([^\n]+)\n---/
  );
  assert.ok(match, "skill front matter is incomplete");
  return {
    name: match[1],
    version: match[2],
    description: match[3]
  };
}

function parseOpenAiMetadata(yaml) {
  const value = (key) => {
    const match = yaml.match(new RegExp(`^\\s*${key}: "([^"]*)"$`, "m"));
    assert.ok(match, `missing ${key} in openai.yaml`);
    return match[1];
  };
  return {
    displayName: value("display_name"),
    shortDescription: value("short_description"),
    defaultPrompt: value("default_prompt"),
    allowImplicitInvocation:
      /^  allow_implicit_invocation: true$/m.test(yaml)
  };
}

assert.equal(wave0Map.source.commit, sourceCommit);
assert.equal(sourceManifest.authoritativeSource.commit, sourceCommit);
assert.equal(sourceManifest.authoritativeSource.root, sourceRoot);
assert.equal(
  sourceManifest.authoritativeSource.wave0MapPath,
  "docs/software-detail-skill-stage-map.json"
);

const sourceSkillBytes = showPinned("SKILL.md");
assert.equal(
  pinnedBlob("SKILL.md"),
  sourceManifest.contractSource.blobSha1
);
assert.equal(
  sha256(sourceSkillBytes),
  sourceManifest.contractSource.contentSha256
);
assert.equal(
  sourceManifest.contractSource.blobSha1,
  wave0Map.source.skillBlobSha1
);
assert.equal(
  sourceManifest.contractSource.contentSha256,
  wave0Map.source.skillContentSha256
);
assert.equal(sourceManifest.contractSource.copiedIntoRuntime, false);
assert.equal(
  sourceManifest.sharedRuleSet.runtimePath,
  wave0Map.sharedRuleSet.futureRuntimeSnapshotPath
);
assert.equal(
  sourceManifest.sharedRuleSet.wave0FutureRuntimePath,
  wave0Map.sharedRuleSet.futureRuntimeSnapshotPath
);
assert.equal(sourceManifest.sharedRuleSet.requiredConsumerStageCount, 9);

const projectedSourceResources = wave0Map.resources.map((resource) => ({
  path: resource.path,
  type: resource.type,
  blobSha1: resource.blobSha1,
  contentSha256: resource.contentSha256
}));
assert.deepEqual(sourceManifest.resources, projectedSourceResources);
assert.equal(sourceManifest.resources.length, 12);
assert.equal(
  new Set(sourceManifest.resources.map((resource) => resource.path)).size,
  12
);

for (const resource of sourceManifest.resources) {
  const runtimeBytes = readFileSync(path.join(runtimeRoot, resource.path));
  const sourceBytes = showPinned(resource.path);
  const clarification = sourceManifest.runtimeClarifications.find(
    (entry) => entry.path === resource.path
  );
  if (clarification) {
    const clarificationStart = runtimeBytes.indexOf(
      Buffer.from("\n## Pipeline Evidence-Coverage Execution Clarification\n")
    );
    const clarificationEnd = runtimeBytes.indexOf(
      Buffer.from("\nFor complex outputs,"),
      clarificationStart
    );
    assert.ok(clarificationStart >= 0, "clarification start is missing");
    assert.ok(clarificationEnd > clarificationStart, "clarification end is missing");
    const reconstructedSource = Buffer.concat([
      runtimeBytes.subarray(0, clarificationStart),
      runtimeBytes.subarray(clarificationEnd)
    ]);
    assert.equal(
      reconstructedSource.equals(sourceBytes),
      true,
      `${resource.path} changed content outside the traced clarification`
    );
    assert.equal(clarification.basedOnBlobSha1, resource.blobSha1);
    assert.equal(
      clarification.basedOnContentSha256,
      resource.contentSha256
    );
    assert.equal(sha256(runtimeBytes), clarification.contentSha256);
  } else {
    assert.equal(
      runtimeBytes.equals(sourceBytes),
      true,
      `${resource.path} is not a byte-identical source copy`
    );
  }
  assert.equal(pinnedBlob(resource.path), resource.blobSha1);
  assert.equal(sha256(sourceBytes), resource.contentSha256);
}

const resourceCounts = sourceManifest.resources.reduce((counts, resource) => {
  counts[resource.type] = (counts[resource.type] || 0) + 1;
  return counts;
}, {});
assert.deepEqual(resourceCounts, {
  metadata: 1,
  reference: 5,
  script: 5,
  template: 1
});

const metadataResource = sourceManifest.resources.find(
  (resource) => resource.type === "metadata"
);
assert.ok(metadataResource);
assert.equal(
  sourceManifest.discoveryTransformationEvidence.sourceRuntimePath,
  metadataResource.path
);
assert.equal(
  sourceManifest.discoveryTransformationEvidence.sourceBlobSha1,
  metadataResource.blobSha1
);
assert.equal(
  sourceManifest.discoveryTransformationEvidence.sourceContentSha256,
  metadataResource.contentSha256
);
assert.equal(
  sourceManifest.discoveryTransformationEvidence.wave0JsonPointer,
  "/pipelineEntryTransformation"
);
assert.equal(
  sourceManifest.discoveryTransformationEvidence.requiredStageCount,
  9
);

const allWave0Clauses = [
  ...wave0Map.defaultRules,
  ...wave0Map.workflowRules,
  ...wave0Map.outputRules
];
const expectedSharedRules = wave0Map.sharedRuleSet.ruleIds.map((id) => {
  const clause = allWave0Clauses.find((candidate) => candidate.id === id);
  assert.ok(clause, `Wave0 shared clause missing: ${id}`);
  return { id: clause.id, text: clause.text };
});
assert.equal(sharedRules.schema, "software-detail-shared-rules/v1");
assert.match(sharedRules.version, /^\d+\.\d+\.\d+$/);
assert.equal(sharedRules.sourceCommit, sourceCommit);
assert.deepEqual(sharedRules.rules, expectedSharedRules);
assert.equal(sharedRules.rules.length, 10);
assert.equal(new Set(sharedRules.rules.map((rule) => rule.id)).size, 10);
assert.deepEqual(
  sharedRules.consumerStageIds,
  wave0Map.sharedRuleSet.consumerStageIds
);
assert.equal(new Set(sharedRules.consumerStageIds).size, 9);

const catalogStages = listSoftwareDetailStages().slice(0, 3);
const expectedStageIds = [
  "software-detail-stage-01-initialize",
  "software-detail-stage-02-model-plan",
  "software-detail-stage-03-evidence-extract"
];
assert.deepEqual(
  catalogStages.map((stage) => stage.id),
  expectedStageIds
);

const skillNames = new Set();
const materializedMetadataPaths = [];
for (const definition of catalogStages) {
  const stageRoot = `skills/hermes/${definition.id}`;
  assert.deepEqual(sorted(readdirSync(path.join(repoRoot, stageRoot))), [
    "SKILL.md",
    "agents"
  ]);
  assert.deepEqual(
    readdirSync(path.join(repoRoot, stageRoot, "agents")),
    ["openai.yaml"]
  );

  const skill = readText(`${stageRoot}/SKILL.md`);
  const identity = parseSkillIdentity(skill);
  assert.equal(identity.name, definition.id);
  assert.equal(definition.skillName, definition.id);
  assert.match(identity.version, /^\d+\.\d+\.\d+$/);
  assert.ok(identity.description.includes(`requests ${definition.id}`));
  assert.ok(skill.includes(`Execute only \`${definition.id}\`.`));
  assert.ok(skill.includes("fresh Hermes session"));
  assert.ok(
    skill.includes(
      "<runtime-root>/shared/software-detail-shared-rules.json"
    ),
    `${definition.id} does not consume the shared rule set`
  );
  assert.ok(sharedRules.consumerStageIds.includes(definition.id));
  skillNames.add(identity.name);

  assert.deepEqual(
    parseArtifactRoles(skill, "## Inputs", "## Procedure"),
    definition.inputs.map((artifact) => artifact.role)
  );
  const outputHeading = definition.outputs.length === 1
    ? "## Output"
    : "## Outputs";
  assert.deepEqual(
    parseArtifactRoles(skill, outputHeading, "## Mapped source clauses"),
    definition.outputs.map((artifact) => artifact.role)
  );

  const mappedClauses = allWave0Clauses
    .filter((clause) => clause.stageIds.includes(definition.id))
    .map((clause) => clause.id);
  const declaredClauses = [
    ...section(skill, "## Mapped source clauses").matchAll(
      /^- `(SDD-(?:DEF|WF|OUT)-\d{3})`$/gm
    )
  ].map((match) => match[1]);
  assert.deepEqual(declaredClauses, mappedClauses);

  const allSkillClauseIds = [
    ...skill.matchAll(/SDD-(?:DEF|WF|OUT)-\d{3}/g)
  ].map((match) => match[0]);
  assert.deepEqual(new Set(allSkillClauseIds), new Set(mappedClauses));
  for (const clauseId of mappedClauses) {
    assert.ok(
      allSkillClauseIds.filter((id) => id === clauseId).length >= 2,
      `${definition.id} only lists ${clauseId} without mapping it to a procedure`
    );
  }

  const expectedRuntimeResources = wave0Map.resources
    .filter(
      (resource) =>
        resource.type !== "metadata" &&
        resource.useStageIds.includes(definition.id)
    )
    .map((resource) => resource.path);
  const declaredRuntimeResources = [
    ...skill.matchAll(
      /`<runtime-root>\/((?:references|scripts|assets)\/[^`]+)`/g
    )
  ].map((match) => match[1]);
  assert.deepEqual(
    sorted(new Set(declaredRuntimeResources)),
    sorted(expectedRuntimeResources)
  );

  const actualMetadata = parseOpenAiMetadata(
    readText(`${stageRoot}/agents/openai.yaml`)
  );
  const expectedMetadata =
    wave0Map.pipelineEntryTransformation.stageDiscoveryMetadata.find(
      (metadata) => metadata.stageId === definition.id
    );
  assert.ok(expectedMetadata);
  assert.deepEqual(actualMetadata, {
    displayName: expectedMetadata.displayName,
    shortDescription: expectedMetadata.shortDescription,
    defaultPrompt: expectedMetadata.defaultPrompt,
    allowImplicitInvocation: false
  });
  assert.ok(actualMetadata.defaultPrompt.includes(`$${definition.skillName}`));
  materializedMetadataPaths.push(`${stageRoot}/agents/openai.yaml`);
}

assert.equal(skillNames.size, 3);
assert.deepEqual(
  sourceManifest.discoveryTransformationEvidence.materializedStageMetadataPaths,
  materializedMetadataPaths
);

const originalDiscoveryMetadata = parseOpenAiMetadata(
  readText("skills/hermes/software-detail-runtime/agents/openai.yaml")
);
const {
  path: _sourceDiscoveryPath,
  ...expectedOriginalDiscoveryMetadata
} = wave0Map.pipelineEntryTransformation.sourceDiscoveryMetadata;
assert.deepEqual(
  originalDiscoveryMetadata,
  expectedOriginalDiscoveryMetadata
);

const stage1Skill = readText(
  "skills/hermes/software-detail-stage-01-initialize/SKILL.md"
);
assert.ok(stage1Skill.includes("create one task-owned MATLAB process/session"));
assert.ok(stage1Skill.includes("load_system"));
assert.ok(stage1Skill.includes("Leave the MATLAB session open"));
assert.ok(stage1Skill.includes("Worker or native MATLAB Gateway"));
assert.ok(stage1Skill.includes("matlab-session-lease"));
assert.ok(stage1Skill.includes("remains alive after the MCP server exits"));
assert.ok(stage1Skill.includes("reconnect by the lease"));

for (const stageId of expectedStageIds.slice(1)) {
  const skill = readText(`skills/hermes/${stageId}/SKILL.md`);
  assert.ok(skill.includes("reusing the exact"));
  assert.ok(skill.includes("matlab-session-lease"));
  assert.ok(skill.includes("Leave the task-owned MATLAB session open"));
  assert.ok(skill.includes("explicitly bound to `matlab-session-lease`"));
  assert.ok(skill.includes("must not start a new MATLAB session"));
  assert.ok(skill.includes("Worker-provided Gateway call path"));
  assert.equal(skill.includes("SATK_MATLAB_SESSION_MODE=new"), false);
  assert.equal(/\bdefault\b[^\n]{0,80}\bnew\b/i.test(skill), false);
}

const stage2Skill = readText(
  "skills/hermes/software-detail-stage-02-model-plan/SKILL.md"
);
for (const required of [
  "scope=document_unit_direct",
  "scope=direct_outport",
  "exact non-empty `directOutport` name and may omit `analysisUnit`",
  "do not rename `directOutport` to another field",
  "every selected `document_unit` has at least one queue item",
  "A document unit with zero queue items is an invalid plan"
]) {
  assert.ok(stage2Skill.includes(required), `stage 2 misses: ${required}`);
}

const stage3Skill = readText(
  "skills/hermes/software-detail-stage-03-evidence-extract/SKILL.md"
);
for (const required of [
  "template must predeclare `scope`",
  "Do not add a field to only one MATLAB structure",
  "A failed fallback read is a failed required queue item",
  "whose `outports` contains that exact `directOutport`",
  "One shard must not stand in for multiple direct-Outport queue items",
  "every direct Outport has direct evidence in its corresponding `direct_outport` shard",
  "every selected document unit has at least one shard",
  "Any required fallback execution error fails the stage",
  "top-level `shards` array",
  "canonical `outports` as an array of",
  "task-relative `shardPath`",
  "must not reduce an entry to only `shardPath`",
  "Mirror the queue item's `scopePath` exactly",
  "an ID never replaces parent/scope/output checks",
  "set `directOutport` to the exact short-name output",
  "read that JSON file back from disk",
  "Do not write the successful candidate until this reread validation passes"
]) {
  assert.ok(stage3Skill.includes(required), `stage 3 misses: ${required}`);
}

assert.deepEqual(
  sourceManifest.runtimeClarifications.map((entry) => entry.path),
  ["references/model-evidence.md"]
);
const evidenceReference = readText(
  "skills/hermes/software-detail-runtime/references/model-evidence.md"
);
for (const required of [
  "## Pipeline Evidence-Coverage Execution Clarification",
  "A zero-item parent is never implicitly covered by its port list.",
  "A structure-append error is a failed required",
  "Stages that aggregate, project, or draft must fail on missing evidence."
]) {
  assert.ok(
    evidenceReference.includes(required),
    `model-evidence clarification misses: ${required}`
  );
}

console.log(
  "software detail stage skills 01-03 tests passed: 3 skills, 19 stage-clause assignments, 10 shared rules, 11 byte-identical source resources, 1 traced clarification"
);
