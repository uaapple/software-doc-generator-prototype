import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSoftwareDetailStage } from "../src/services/software-detail-stage-catalog.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(
    new URL("../docs/software-detail-skill-stage-map.json", import.meta.url),
    "utf8"
  )
);
const sourceCommit = "ce5d3c2c08788fa8ab9013f18bd985f7355df0b6";
const sourceRoot = "skills/hermes/simulink-module-description-generator";
const sharedRulePath =
  "<runtime-root>/shared/software-detail-shared-rules.json";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sorted = (values) => [...values].sort();
const showPinnedFile = (path) =>
  execFileSync("git", ["show", `${sourceCommit}:${path}`], {
    cwd: repoRoot
  });

const sharedRuleIds = [
  "SDD-DEF-001",
  "SDD-DEF-002",
  "SDD-DEF-003",
  "SDD-DEF-010",
  "SDD-DEF-011",
  "SDD-DEF-018",
  "SDD-DEF-020",
  "SDD-OUT-001",
  "SDD-OUT-002",
  "SDD-OUT-013"
];

const expectations = [
  {
    stageId: "software-detail-stage-04-output-ledger",
    order: 400,
    inputs: ["matlab-session-lease", "analysis-queue", "evidence-shards"],
    outputs: ["output-ledger", "coverage-report"],
    clauses: [
      "SDD-DEF-007",
      "SDD-DEF-012",
      "SDD-DEF-013",
      "SDD-WF-008",
      "SDD-WF-009",
      "SDD-OUT-010"
    ],
    resources: [
      "references/model-evidence.md",
      "references/module-boundary.md"
    ],
    requiredPhrases: [
      "Aggregate shard fragments by parent `document_unit`",
      "enumerate its direct Outports and work backward",
      "`visibility=internal_evidence`",
      "`coverage-report` separately"
    ]
  },
  {
    stageId: "software-detail-stage-05-boundary-projection",
    order: 500,
    inputs: [
      "matlab-session-lease",
      "evidence-shards",
      "output-ledger",
      "coverage-report"
    ],
    outputs: ["boundary-projection", "behavior-groups", "narrative-plan"],
    clauses: ["SDD-DEF-012", "SDD-WF-010", "SDD-WF-011"],
    resources: ["references/module-boundary.md"],
    requiredPhrases: [
      "Apply the allowlist independently for each `document_unit`",
      "Project conditions onto current-unit direct inputs",
      "Never use an internal identifier as a group title",
      "`covered_ledger_items`"
    ]
  },
  {
    stageId: "software-detail-stage-06-architecture-draft",
    order: 600,
    inputs: [
      "matlab-session-lease",
      "output-ledger",
      "boundary-projection",
      "narrative-plan"
    ],
    outputs: ["architecture-draft"],
    clauses: ["SDD-WF-012", "SDD-WF-013"],
    resources: ["references/template-filling.md"],
    requiredPhrases: [
      "Draft model-level `功能描述`",
      "Draft `模型总体结构` and architecture/interface content",
      "Do not create `3.x` module sections",
      "Do not produce a module draft"
    ]
  }
];

const allClauses = [
  ...manifest.defaultRules,
  ...manifest.workflowRules,
  ...manifest.outputRules
];
const stageIds = expectations.map((expectation) => expectation.stageId);

assert.equal(manifest.source.commit, sourceCommit);
assert.equal(manifest.source.root, sourceRoot);
assert.deepEqual(manifest.sharedRuleSet.ruleIds, sharedRuleIds);
assert.equal(
  sha256(showPinnedFile(manifest.source.skillPath)),
  manifest.source.skillContentSha256
);

const mappedResources = new Map(
  manifest.resources.map((resource) => [resource.path, resource])
);
const referencedResources = new Set(
  expectations.flatMap((expectation) => expectation.resources)
);
for (const path of referencedResources) {
  const resource = mappedResources.get(path);
  assert.ok(resource, `missing mapped resource ${path}`);
  const source = showPinnedFile(`${sourceRoot}/${path}`);
  assert.equal(sha256(source), resource.contentSha256, `${path} source drifted`);
}

function section(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing section ${start}`);
  const contentAt = startAt + start.length;
  const endAt = source.indexOf(end, contentAt);
  assert.notEqual(endAt, -1, `missing section terminator ${end}`);
  return source.slice(contentAt, endAt);
}

function artifactRoles(source, heading, end) {
  return [...section(source, heading, end).matchAll(/^- `([^`]+)`$/gm)].map(
    (match) => match[1]
  );
}

function quotedYamlValue(source, key) {
  const match = source.match(new RegExp(`^  ${key}: "([^"]*)"$`, "m"));
  assert.ok(match, `missing ${key}`);
  return match[1];
}

for (const expectation of expectations) {
  const { stageId } = expectation;
  const skillDirectoryUrl = new URL(`../skills/hermes/${stageId}/`, import.meta.url);
  const skillSource = readFileSync(new URL("SKILL.md", skillDirectoryUrl), "utf8");
  const metadataSource = readFileSync(
    new URL("agents/openai.yaml", skillDirectoryUrl),
    "utf8"
  );

  assert.deepEqual(sorted(readdirSync(skillDirectoryUrl)), ["SKILL.md", "agents"]);
  assert.deepEqual(readdirSync(new URL("agents/", skillDirectoryUrl)), [
    "openai.yaml"
  ]);
  assert.match(
    skillSource,
    new RegExp(
      `^---\\nname: ${stageId}\\nmetadata:\\n  version: "1\\.0\\.0"\\n` +
        "description: [^\\n]+\\n---"
    )
  );
  assert.doesNotMatch(skillSource, /TODO|\[TODO/);
  assert.doesNotMatch(skillSource, /same job and attempt/i);
  assert.match(skillSource, /belong to the same job/);
  assert.match(skillSource, /originating\s+stage and attempt for traceability/);
  assert.match(skillSource, /Execute only Stage [456]\./);
  assert.match(skillSource, /Use a new Hermes session for this stage attempt/);
  assert.match(skillSource, /never reuse a[\s\S]*failed attempt/);

  const catalogStage = getSoftwareDetailStage(stageId);
  assert.ok(catalogStage);
  assert.equal(catalogStage.order, expectation.order);
  assert.equal(catalogStage.skillName, stageId);
  assert.equal(catalogStage.hermesSessionRequired, true);
  assert.deepEqual(
    catalogStage.inputs.map((artifact) => artifact.role),
    expectation.inputs
  );
  assert.deepEqual(
    catalogStage.outputs.map((artifact) => artifact.role),
    expectation.outputs
  );
  assert.deepEqual(
    artifactRoles(skillSource, "### Inputs", "\n### Outputs"),
    expectation.inputs
  );
  assert.deepEqual(
    artifactRoles(skillSource, "### Outputs", "\nWrite only"),
    expectation.outputs
  );

  const sharedReadAt = skillSource.indexOf(sharedRulePath);
  assert.ok(sharedReadAt > 0, `${stageId} does not read shared rules`);
  assert.ok(
    sharedReadAt < skillSource.indexOf("## Contract"),
    `${stageId} must read shared rules before stage artifacts`
  );

  const actualClauseIds = sorted(
    new Set(skillSource.match(/\bSDD-(?:DEF|WF|OUT)-\d{3}\b/g) || [])
  );
  assert.deepEqual(
    actualClauseIds,
    sorted([...sharedRuleIds, ...expectation.clauses]),
    `${stageId} clause coverage differs from Wave0`
  );
  const mappedStageClauseIds = sorted(
    allClauses
      .filter((clause) => clause.stageIds.includes(stageId))
      .map((clause) => clause.id)
  );
  assert.deepEqual(mappedStageClauseIds, sorted(expectation.clauses));
  for (const clauseId of expectation.clauses) {
    assert.match(
      skillSource,
      new RegExp(`^- \\\`${clauseId}\\\`: .{20,}$`, "m"),
      `${stageId} lists ${clauseId} without an explicit responsibility`
    );
  }

  const actualRuntimeResources = sorted(
    [
      ...skillSource.matchAll(
        /<runtime-root>\/((?:references|scripts)\/[A-Za-z0-9._/-]+)/g
      )
    ].map((match) => match[1])
  );
  assert.deepEqual(actualRuntimeResources, sorted(expectation.resources));
  const mappedStageResources = sorted(
    manifest.resources
      .filter(
        (resource) =>
          ["reference", "script"].includes(resource.type) &&
          resource.useStageIds.includes(stageId)
      )
      .map((resource) => resource.path)
  );
  assert.deepEqual(mappedStageResources, sorted(expectation.resources));

  for (const phrase of expectation.requiredPhrases) {
    assert.ok(skillSource.includes(phrase), `${stageId} misses: ${phrase}`);
  }

  const stageMetadata =
    manifest.pipelineEntryTransformation.stageDiscoveryMetadata.find(
      (metadata) => metadata.stageId === stageId
    );
  assert.ok(stageMetadata);
  assert.equal(stageMetadata.skillName, stageId);
  assert.equal(
    quotedYamlValue(metadataSource, "display_name"),
    stageMetadata.displayName
  );
  assert.equal(
    quotedYamlValue(metadataSource, "short_description"),
    stageMetadata.shortDescription
  );
  assert.equal(
    quotedYamlValue(metadataSource, "default_prompt"),
    stageMetadata.defaultPrompt
  );
  assert.equal(
    (metadataSource.match(/^  (?:display_name|short_description|default_prompt):/gm) ||
      []).length,
    3
  );
  assert.match(
    metadataSource,
    /\npolicy:\n  allow_implicit_invocation: false\n$/
  );
  assert.doesNotMatch(metadataSource, /allow_implicit_invocation: true/);
}

assert.deepEqual(
  manifest.stages
    .filter((stage) => stageIds.includes(stage.stageId))
    .map((stage) => [stage.stageId, stage.skillVersion, stage.hermesSession]),
  expectations.map((expectation) => [expectation.stageId, "1.0.0", "new"])
);

console.log("software detail stage skills 04-06 tests passed");
