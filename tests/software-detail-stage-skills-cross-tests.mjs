import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SOFTWARE_DETAIL_STAGE_DEFINITIONS } from "../src/services/software-detail-stage-catalog.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const hermesRoot = path.join(repoRoot, "skills", "hermes");
const runtimeRoot = path.join(hermesRoot, "software-detail-runtime");
const sourceCommit = "ce5d3c2c08788fa8ab9013f18bd985f7355df0b6";
const sourceRoot = "skills/hermes/simulink-module-description-generator";
const sharedRuntimePath =
  "<runtime-root>/shared/software-detail-shared-rules.json";
const wave0 = readJson("docs/software-detail-skill-stage-map.json");
const sharedRules = readJson(
  "skills/hermes/software-detail-runtime/shared/software-detail-shared-rules.json"
);
const sourceManifest = readJson(
  "skills/hermes/software-detail-runtime/source-manifest.json"
);
const packageJson = readJson("package.json");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sorted = (values) => [...values].sort();

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function showPinnedFile(relativePath) {
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

function section(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing section ${start}`);
  const contentAt = startAt + start.length;
  const endAt = source.indexOf(end, contentAt);
  assert.notEqual(endAt, -1, `missing section terminator ${end}`);
  return source.slice(contentAt, endAt);
}

function bulletRoles(source) {
  return [
    ...source.matchAll(/^- `([a-z][a-z0-9-]+)`(?=[:.]| from|$)/gm)
  ].map((match) => match[1]);
}

function parseDeclaredContract(skill, stageOrder) {
  const jsonContract = skill.match(/## Stage contract\s+```json\n([\s\S]*?)\n```/);
  if (jsonContract) {
    const contract = JSON.parse(jsonContract[1]);
    return { inputs: contract.inputs, outputs: contract.outputs };
  }
  if (stageOrder <= 300) {
    const outputHeading = skill.includes("\n## Outputs\n")
      ? "## Outputs"
      : "## Output";
    return {
      inputs: bulletRoles(section(skill, "## Inputs", "\n## Procedure")),
      outputs: bulletRoles(
        section(skill, outputHeading, "\n## Mapped source clauses")
      )
    };
  }
  return {
    inputs: bulletRoles(section(skill, "### Inputs", "\n### Outputs")),
    outputs: bulletRoles(section(skill, "### Outputs", "\nWrite only"))
  };
}

function parseFrontmatter(skill) {
  const match = skill.match(
    /^---\nname: ([^\n]+)\nmetadata:\n  version: "([^"]+)"\ndescription: ([^\n]+)\n---/
  );
  assert.ok(match, "skill frontmatter is incomplete");
  return {
    name: match[1],
    version: match[2],
    description: match[3]
  };
}

function quotedYamlValue(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}: "([^"]*)"$`, "m"));
  assert.ok(match, `missing metadata field ${key}`);
  return match[1];
}

const catalogStages = SOFTWARE_DETAIL_STAGE_DEFINITIONS;
const stageIds = catalogStages.map((stage) => stage.id);
const mappedStageIds = wave0.stages.map((stage) => stage.stageId);
const materializedStageDirectories = readdirSync(hermesRoot, {
  withFileTypes: true
})
  .filter(
    (entry) =>
      entry.isDirectory() && entry.name.startsWith("software-detail-stage-")
  )
  .map((entry) => entry.name);

assert.equal(wave0.source.commit, sourceCommit);
assert.equal(wave0.source.root, sourceRoot);
assert.equal(catalogStages.length, 9);
assert.deepEqual(stageIds, mappedStageIds);
assert.deepEqual(sorted(materializedStageDirectories), sorted(stageIds));

const allClauses = [
  ...wave0.defaultRules,
  ...wave0.workflowRules,
  ...wave0.outputRules
];
const knownClauseIds = new Set(allClauses.map((clause) => clause.id));
const sharedRuleIds = wave0.sharedRuleSet.ruleIds;
const sharedRuleIdSet = new Set(sharedRuleIds);
const expectedSharedRules = sharedRuleIds.map((id) => {
  const clause = allClauses.find((candidate) => candidate.id === id);
  assert.ok(clause, `missing Wave0 shared clause ${id}`);
  return { id: clause.id, text: clause.text };
});

assert.equal(sharedRules.schema, "software-detail-shared-rules/v1");
assert.equal(sharedRules.version, "1.0.0");
assert.equal(sharedRules.sourceCommit, sourceCommit);
assert.deepEqual(sharedRules.rules, expectedSharedRules);
assert.equal(sharedRules.rules.length, 10);
assert.deepEqual(sharedRules.consumerStageIds, stageIds);
assert.deepEqual(wave0.sharedRuleSet.consumerStageIds, stageIds);

assert.equal(sourceManifest.resources.length, 12);
assert.deepEqual(
  sourceManifest.resources.map((resource) => ({
    path: resource.path,
    type: resource.type,
    blobSha1: resource.blobSha1,
    contentSha256: resource.contentSha256
  })),
  wave0.resources.map((resource) => ({
    path: resource.path,
    type: resource.type,
    blobSha1: resource.blobSha1,
    contentSha256: resource.contentSha256
  }))
);

for (const resource of wave0.resources) {
  const runtimePath = path.join(runtimeRoot, resource.path);
  assert.ok(existsSync(runtimePath), `missing runtime resource ${resource.path}`);
  const runtimeBytes = readFileSync(runtimePath);
  const sourceBytes = showPinnedFile(resource.path);
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
    assert.equal(clarification.basedOnContentSha256, resource.contentSha256);
    assert.equal(sha256(runtimeBytes), clarification.contentSha256);
  } else {
    assert.equal(
      runtimeBytes.equals(sourceBytes),
      true,
      `${resource.path} is not byte-identical to the pinned Git object`
    );
  }
  assert.equal(pinnedBlob(resource.path), resource.blobSha1);
  assert.equal(sha256(sourceBytes), resource.contentSha256);
}

let stageSpecificAssignmentCount = 0;
for (const definition of catalogStages) {
  const stageId = definition.id;
  const stageRoot = path.join(hermesRoot, stageId);
  assert.deepEqual(sorted(readdirSync(stageRoot)), ["SKILL.md", "agents"]);
  assert.deepEqual(readdirSync(path.join(stageRoot, "agents")), ["openai.yaml"]);

  const skill = readFileSync(path.join(stageRoot, "SKILL.md"), "utf8");
  const metadata = readFileSync(
    path.join(stageRoot, "agents", "openai.yaml"),
    "utf8"
  );
  const frontmatter = parseFrontmatter(skill);
  const mappedStage = wave0.stages.find((stage) => stage.stageId === stageId);
  const mappedMetadata =
    wave0.pipelineEntryTransformation.stageDiscoveryMetadata.find(
      (candidate) => candidate.stageId === stageId
    );

  assert.ok(mappedStage);
  assert.ok(mappedMetadata);
  assert.equal(frontmatter.name, stageId);
  assert.equal(definition.skillName, stageId);
  assert.equal(frontmatter.version, "1.0.0");
  assert.equal(mappedStage.skillVersion, "1.0.0");
  assert.equal(definition.hermesSessionRequired, true);
  assert.equal(mappedStage.hermesSession, "new");
  assert.match(
    skill,
    /fresh Hermes session|new Hermes session|"hermesSession": "new"/
  );
  for (const field of [
    "schema",
    "jobId",
    "stageId",
    "attempt",
    "status",
    "artifacts",
    "outputArtifacts",
    "gatewayLease",
    "runtime.installedPath",
    "candidateResultPath"
  ]) {
    assert.ok(skill.includes(field), `${stageId} omits host field ${field}`);
  }
  assert.match(skill, /software-detail-minimal-stage-result\/v1/);
  assert.match(skill, /mapping every `outputArtifacts` entry one-for-one/);
  assert.match(skill, /exact copy of `gatewayLease`/);
  assert.match(skill, /`runtime\.installedPath` is the absolute path/);
  assert.match(skill, /Require it to be absolute and readable/);
  assert.doesNotMatch(skill, /\.\.\/software-detail-runtime/);

  assert.equal(
    quotedYamlValue(metadata, "display_name"),
    mappedMetadata.displayName
  );
  assert.equal(
    quotedYamlValue(metadata, "short_description"),
    mappedMetadata.shortDescription
  );
  assert.equal(
    quotedYamlValue(metadata, "default_prompt"),
    mappedMetadata.defaultPrompt
  );
  assert.match(
    metadata,
    /(?:^|\n)policy:\n  allow_implicit_invocation: false(?:\n|$)/
  );
  assert.doesNotMatch(metadata, /allow_implicit_invocation: true/);

  const declaredContract = parseDeclaredContract(skill, definition.order);
  assert.deepEqual(
    declaredContract.inputs,
    definition.inputs.map((artifact) => artifact.role),
    `${stageId} input roles differ from the catalog`
  );
  assert.deepEqual(
    declaredContract.outputs,
    definition.outputs.map((artifact) => artifact.role),
    `${stageId} output roles differ from the catalog`
  );

  const sharedPaths = new Set(
    skill.match(
      /<runtime-root>\/shared\/[A-Za-z0-9._/-]+/g
    ) || []
  );
  assert.deepEqual([...sharedPaths], [sharedRuntimePath]);

  const expectedSpecificIds = sorted(
    allClauses
      .filter((clause) => clause.stageIds.includes(stageId))
      .map((clause) => clause.id)
  );
  const actualIds = new Set(
    skill.match(/SDD-(?:DEF|WF|OUT)-\d{3}/g) || []
  );
  for (const actualId of actualIds) {
    assert.ok(knownClauseIds.has(actualId), `${stageId} has unknown ${actualId}`);
  }
  const actualSpecificIds = sorted(
    [...actualIds].filter((id) => !sharedRuleIdSet.has(id))
  );
  assert.deepEqual(
    actualSpecificIds,
    expectedSpecificIds,
    `${stageId} stage-specific clause assignments differ from Wave0`
  );
  stageSpecificAssignmentCount += expectedSpecificIds.length;

  const expectedResources = sorted(
    wave0.resources
      .filter(
        (resource) =>
          resource.path !== "agents/openai.yaml" &&
          resource.useStageIds.includes(stageId)
      )
      .map((resource) => resource.path)
  );
  const actualResources = sorted(
    new Set(
      [
        ...skill.matchAll(
          /<runtime-root>\/((?:references|scripts|assets)\/[A-Za-z0-9._/-]+)/g
        )
      ].map((match) => match[1])
    )
  );
  assert.deepEqual(
    actualResources,
    expectedResources,
    `${stageId} runtime resource references differ from Wave0`
  );
  for (const resourcePath of actualResources) {
    assert.ok(
      existsSync(path.join(runtimeRoot, resourcePath)),
      `${stageId} references missing runtime resource ${resourcePath}`
    );
  }
}

assert.equal(wave0.sessionPolicy.hermes.newSessionForEveryStage, true);
assert.equal(wave0.sessionPolicy.hermes.crossStageReuseAllowed, false);
assert.equal(wave0.sessionPolicy.hermes.failedAttemptSessionReuseAllowed, false);
assert.equal(wave0.sessionPolicy.matlab.processesPerJob, 1);
assert.equal(wave0.sessionPolicy.matlab.reuseOneTaskOwnedSession, true);
assert.equal(
  wave0.sessionPolicy.matlab.startAtStageId,
  "software-detail-stage-01-initialize"
);
assert.equal(
  wave0.sessionPolicy.matlab.keepThroughStageId,
  "software-detail-stage-09-docx-finalize"
);
assert.deepEqual(wave0.sessionPolicy.matlab.reuseStageIds, stageIds);

const stage1 = catalogStages[0];
assert.equal(
  stage1.inputs.some((artifact) => artifact.role === "matlab-session-lease"),
  false
);
assert.ok(
  stage1.outputs.some((artifact) => artifact.role === "matlab-session-lease")
);
for (const definition of catalogStages.slice(1)) {
  assert.equal(
    definition.inputs.filter(
      (artifact) => artifact.role === "matlab-session-lease"
    ).length,
    1,
    `${definition.id} must reuse exactly one MATLAB lease`
  );
}

const stage1Skill = readText(
  "skills/hermes/software-detail-stage-01-initialize/SKILL.md"
);
assert.match(stage1Skill, /create one task-owned MATLAB process\/session/);
assert.match(stage1Skill, /Leave the MATLAB session open/);
for (const stageId of stageIds.slice(1, 3)) {
  const skill = readText(`skills/hermes/${stageId}/SKILL.md`);
  assert.match(skill, /must not start a new MATLAB session/);
  assert.match(skill, /reusing the exact/);
  assert.doesNotMatch(skill, /SATK_MATLAB_SESSION_MODE=new/);
}

for (const stageId of stageIds.slice(3, 6)) {
  const skill = readText(`skills/hermes/${stageId}/SKILL.md`);
  assert.match(skill, /Reuse the task-owned MATLAB\s+session identified by the lease/);
  assert.match(
    skill,
    /(?:do not initialize, replace, or close|without initializing, replacing, or closing) it/
  );
}
for (const stageId of stageIds.slice(6, 8)) {
  const skill = readText(`skills/hermes/${stageId}/SKILL.md`);
  assert.match(skill, /this reasoning stage must not call MATLAB/);
}

const stage9Definition = catalogStages.at(-1);
const stage9Skill = readText(
  "skills/hermes/software-detail-stage-09-docx-finalize/SKILL.md"
);
assert.deepEqual(
  stage9Definition.outputs.map((artifact) => artifact.role),
  ["detail-design-docx", "artifact-manifest"]
);
assert.match(stage9Skill, /Template_Software_Detailed_Design\.docx/);
assert.match(
  stage9Skill,
  /docx_list_format\.py <generated\.docx> --out <normalized\.docx>/
);
assert.match(
  stage9Skill,
  /docx_list_format\.py <final\.docx> --check-only/
);
assert.match(stage9Skill, /close only models opened for this job/);
assert.match(stage9Skill, /Never run broad cleanup such as `bdclose all`/);

const aggregateCommand = [
  "node --disable-warning=ExperimentalWarning tests/software-detail-stage-skills-01-03-tests.mjs",
  "node --disable-warning=ExperimentalWarning tests/software-detail-stage-skills-04-06-tests.mjs",
  "node --disable-warning=ExperimentalWarning tests/software-detail-stage-skills-07-09-tests.mjs",
  "node --disable-warning=ExperimentalWarning tests/software-detail-stage-skills-cross-tests.mjs"
].join(" && ");
assert.equal(
  packageJson.scripts["test:software-detail-stage-skills"],
  aggregateCommand
);

console.log(
  `PASS software-detail cross-stage skills: 9 stages, ${stageSpecificAssignmentCount} stage-clause assignments, 10 shared rules, 12 pinned resources`
);
