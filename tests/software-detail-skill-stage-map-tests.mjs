import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL(
  "../docs/software-detail-skill-stage-map.json",
  import.meta.url
);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sorted = (values) => [...values].sort();
const sourceCommit = "ce5d3c2c08788fa8ab9013f18bd985f7355df0b6";
const sourceRoot = "skills/hermes/simulink-module-description-generator";
const showPinnedFile = (path) =>
  execFileSync("git", ["show", `${sourceCommit}:${path}`], {
    cwd: repoRoot
  });

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
const expectedStageIds = expectedStages.map(([stageId]) => stageId);

assert.equal(manifest.schema, "software-detail-skill-stage-map/v1");
assert.equal(manifest.source.commit, sourceCommit);
assert.equal(manifest.source.root, sourceRoot);
assert.equal(
  manifest.source.skillBlobSha1,
  "8e99cda6da9b54153b73476f884b463ebe8b1bc4"
);
assert.equal(
  manifest.source.skillContentSha256,
  "f9b9fb108ad5bee97597f9dc01a59cf37a6f85f0afd619b21b78df291f8d1dae"
);

const skillBuffer = showPinnedFile(manifest.source.skillPath);
const skillSource = skillBuffer.toString("utf8");
assert.equal(sha256(skillBuffer), manifest.source.skillContentSha256);

const extractBetween = (source, start, end) => {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing source delimiter ${start}`);
  const contentAt = startAt + start.length;
  const endAt = source.indexOf(end, contentAt);
  assert.notEqual(endAt, -1, `missing source delimiter ${end}`);
  return source.slice(contentAt, endAt);
};

const extractBullets = (body) => {
  const lines = body.split("\n").filter((line) => line.length > 0);
  for (const line of lines) {
    assert.ok(line.startsWith("- "), `unexpected non-bullet source line: ${line}`);
  }
  return lines.map((line) => line.slice(2));
};

const defaultSourceRules = extractBullets(
  extractBetween(
    skillSource,
    "Default behavior:\n\n",
    "\n\nMinimal prompt example:"
  )
);
const outputHeader = "## Output Rules\n\n";
const outputHeaderAt = skillSource.indexOf(outputHeader);
assert.notEqual(outputHeaderAt, -1);
const outputSourceRules = extractBullets(
  skillSource.slice(outputHeaderAt + outputHeader.length).trimEnd()
);

const workflowBody = extractBetween(
  skillSource,
  "## Workflow\n\n",
  "\n## References"
);
const workflowSourceRules = [];
for (const line of workflowBody.split("\n")) {
  if (line.length === 0) {
    continue;
  }
  const numbered = line.match(/^(\d+)\. (.*)$/);
  if (numbered) {
    assert.equal(Number(numbered[1]), workflowSourceRules.length + 1);
    workflowSourceRules.push(numbered[2]);
    continue;
  }
  const nested = line.match(/^   - (.*)$/);
  assert.ok(nested, `unexpected workflow source line: ${line}`);
  assert.ok(workflowSourceRules.length > 0);
  workflowSourceRules[workflowSourceRules.length - 1] += `\n- ${nested[1]}`;
}

const clauseSets = [
  [
    "SDD-DEF",
    manifest.defaultRules,
    defaultSourceRules,
    manifest.source.defaultRuleTextSha256
  ],
  [
    "SDD-WF",
    manifest.workflowRules,
    workflowSourceRules,
    manifest.source.workflowRuleTextSha256
  ],
  [
    "SDD-OUT",
    manifest.outputRules,
    outputSourceRules,
    manifest.source.outputRuleTextSha256
  ]
];
const allClauses = clauseSets.flatMap(([, clauses]) => clauses);

for (const [prefix, clauses, sourceRules, expectedTextSha256] of clauseSets) {
  assert.deepEqual(
    clauses.map((clause) => clause.text),
    sourceRules,
    `${prefix} clauses must equal the extraction from the pinned Git object`
  );
  assert.deepEqual(
    clauses.map((clause) => clause.ordinal),
    Array.from({ length: sourceRules.length }, (_, index) => index + 1)
  );
  assert.deepEqual(
    clauses.map((clause) => clause.id),
    Array.from(
      { length: sourceRules.length },
      (_, index) => `${prefix}-${String(index + 1).padStart(3, "0")}`
    )
  );
  assert.equal(
    sha256(sourceRules.join("\n")),
    expectedTextSha256,
    `${prefix} source extraction digest changed`
  );
}

assert.equal(defaultSourceRules.length, 24);
assert.equal(workflowSourceRules.length, 21);
assert.equal(outputSourceRules.length, 13);
assert.equal(allClauses.length, 58);
assert.equal(new Set(allClauses.map((clause) => clause.id)).size, 58);

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

const stageIds = new Set(expectedStageIds);
const sharedClauses = allClauses.filter((clause) => clause.scope === "shared");
assert.equal(sharedClauses.length, 10);
assert.deepEqual(
  manifest.sharedRuleSet.ruleIds,
  sharedClauses.map((clause) => clause.id)
);
assert.equal(new Set(manifest.sharedRuleSet.ruleIds).size, 10);
assert.deepEqual(manifest.sharedRuleSet.consumerStageIds, expectedStageIds);
assert.equal(
  new Set(manifest.sharedRuleSet.consumerStageIds).size,
  expectedStageIds.length
);
assert.ok(manifest.sharedRuleSet.futureRuntimeSnapshotPath);
assert.ok(manifest.sharedRuleSet.consumptionContract);

for (const clause of allClauses) {
  assert.ok(clause.text);
  assert.ok(["shared", "stage"].includes(clause.scope));
  assert.ok(Array.isArray(clause.stageIds));
  if (clause.scope === "shared") {
    assert.deepEqual(clause.stageIds, []);
    assert.ok(
      manifest.sharedRuleSet.ruleIds.includes(clause.id),
      `${clause.id} is missing from the shared rule set`
    );
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
    `${stageId} has no mapped stage-specific source clause`
  );
  assert.ok(
    manifest.sharedRuleSet.consumerStageIds.includes(stageId),
    `${stageId} does not consume the shared rule set`
  );
}

const sourceIdentity = skillSource.match(
  /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n\n# ([^\n]+)\n\n([^\n]+)/
);
assert.ok(sourceIdentity, "cannot extract pinned skill identity and summary");
const invocationUseCondition = skillSource.match(
  /## Default Invocation Contract\n\n([^\n]+)\n\nDefault behavior:/
);
const minimalPrompt = skillSource.match(
  /Minimal prompt example:\n\n```text\n([^\n]+)\n```/
);
assert.ok(invocationUseCondition);
assert.ok(minimalPrompt);

const referenceBody = extractBetween(
  skillSource,
  "## References\n\n",
  "\n## Output Rules"
);
const [referencesIntroduction, , ...referenceLines] = referenceBody
  .trimEnd()
  .split("\n");
const sourceReferences = referenceLines.map((line) => {
  const match = line.match(/^- `([^`]+)`: (.*)$/);
  assert.ok(match, `cannot parse source reference: ${line}`);
  return { path: match[1], description: match[2] };
});

assert.deepEqual(manifest.pipelineEntryTransformation.sourceContent, {
  name: sourceIdentity[1],
  description: sourceIdentity[2],
  title: sourceIdentity[3],
  summary: sourceIdentity[4],
  defaultInvocationUseCondition: invocationUseCondition[1],
  minimalPrompt: minimalPrompt[1],
  referencesIntroduction,
  references: sourceReferences
});
assert.equal(
  manifest.pipelineEntryTransformation.pipelineEntry.triggerDescriptionSource,
  "sourceContent.description"
);
assert.equal(
  manifest.pipelineEntryTransformation.pipelineEntry.usageConditionSource,
  "sourceContent.defaultInvocationUseCondition"
);
assert.ok(
  manifest.pipelineEntryTransformation.pipelineEntry.minimalPromptTransformation
);
assert.ok(
  manifest.pipelineEntryTransformation.pipelineEntry.referenceTransformation
);

const metadataPath = `${sourceRoot}/agents/openai.yaml`;
const sourceMetadata = showPinnedFile(metadataPath);
const metadataText = sourceMetadata.toString("utf8");
const yamlQuotedValue = (key) => {
  const match = metadataText.match(new RegExp(`^\\s*${key}: "([^"]*)"$`, "m"));
  assert.ok(match, `missing ${key} in pinned discovery metadata`);
  return match[1];
};
const sourceDiscoveryMetadata = {
  path: "agents/openai.yaml",
  displayName: yamlQuotedValue("display_name"),
  shortDescription: yamlQuotedValue("short_description"),
  defaultPrompt: yamlQuotedValue("default_prompt"),
  allowImplicitInvocation:
    /^  allow_implicit_invocation: true$/m.test(metadataText)
};
assert.deepEqual(
  manifest.pipelineEntryTransformation.sourceDiscoveryMetadata,
  sourceDiscoveryMetadata
);

const stageDiscoveryMetadata =
  manifest.pipelineEntryTransformation.stageDiscoveryMetadata;
assert.deepEqual(
  stageDiscoveryMetadata.map((metadata) => metadata.stageId),
  expectedStageIds
);
assert.equal(
  new Set(stageDiscoveryMetadata.map((metadata) => metadata.displayName)).size,
  expectedStageIds.length
);
for (const metadata of stageDiscoveryMetadata) {
  assert.equal(metadata.skillName, metadata.stageId);
  assert.ok(metadata.displayName.startsWith(sourceDiscoveryMetadata.displayName));
  assert.ok(metadata.shortDescription);
  assert.ok(metadata.defaultPrompt.includes(`$${metadata.skillName}`));
}

const treeOutput = execFileSync(
  "git",
  ["ls-tree", "-r", sourceCommit, "--", sourceRoot],
  { cwd: repoRoot, encoding: "utf8" }
).trim();
const treeEntries = treeOutput.split("\n").map((line) => {
  const match = line.match(/^100644 blob ([a-f0-9]{40})\t(.+)$/);
  assert.ok(match, `unexpected pinned tree entry: ${line}`);
  return { blobSha1: match[1], path: match[2] };
});
const treeByPath = new Map(
  treeEntries.map((entry) => [entry.path, entry.blobSha1])
);
assert.equal(treeEntries.length, 13);
assert.equal(manifest.source.treeFileCount, 13);
assert.equal(manifest.source.resourceFileCount, 12);
assert.equal(manifest.source.skillIsContractSource, true);
assert.equal(
  treeByPath.get(manifest.source.skillPath),
  manifest.source.skillBlobSha1
);

const mappedTreePaths = [
  manifest.source.skillPath,
  ...manifest.resources.map((resource) => `${sourceRoot}/${resource.path}`)
];
assert.deepEqual(sorted(mappedTreePaths), sorted(treeByPath.keys()));
assert.equal(new Set(mappedTreePaths).size, 13);

const pathsByType = (type) =>
  manifest.resources
    .filter((resource) => resource.type === type)
    .map((resource) => resource.path);
assert.equal(pathsByType("reference").length, 5);
assert.equal(pathsByType("script").length, 5);
assert.equal(pathsByType("template").length, 1);
assert.deepEqual(pathsByType("metadata"), ["agents/openai.yaml"]);
assert.deepEqual(
  sorted(pathsByType("reference")),
  sorted(sourceReferences.map((reference) => reference.path))
);
assert.equal(manifest.resources.length, 12);
assert.equal(new Set(manifest.resources.map((resource) => resource.path)).size, 12);

for (const resource of manifest.resources) {
  const fullPath = `${sourceRoot}/${resource.path}`;
  assert.equal(treeByPath.get(fullPath), resource.blobSha1);
  assert.equal(sha256(showPinnedFile(fullPath)), resource.contentSha256);
  assert.match(resource.blobSha1, /^[a-f0-9]{40}$/);
  assert.match(resource.contentSha256, /^[a-f0-9]{64}$/);
  assert.ok(resource.useStageIds.length > 0);
  for (const stageId of resource.useStageIds) {
    assert.ok(stageIds.has(stageId));
  }
  if (resource.type === "metadata") {
    assert.equal(resource.ownerComponent, "pipeline-entry-transformation");
    assert.deepEqual(resource.useStageIds, expectedStageIds);
    assert.equal(
      resource.transformationTarget,
      "pipelineEntryTransformation.stageDiscoveryMetadata"
    );
  } else {
    assert.ok(stageIds.has(resource.ownerStageId));
    assert.ok(resource.useStageIds.includes(resource.ownerStageId));
  }
}

assert.deepEqual(
  manifest.sessionPolicy.matlab.reuseStageIds,
  expectedStageIds
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
  "software detail skill-stage map tests passed: 13 tree files, 9 stages, 58 clauses, 12 resources, 10 shared rules"
);
