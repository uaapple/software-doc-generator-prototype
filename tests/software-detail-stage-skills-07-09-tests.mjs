import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SOFTWARE_DETAIL_STAGE_DEFINITIONS } from "../src/services/software-detail-stage-catalog.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = path.join(repoRoot, "docs", "software-detail-skill-stage-map.json");
const stageMap = JSON.parse(readFileSync(mapPath, "utf8"));
const sourceCommit = "ce5d3c2c08788fa8ab9013f18bd985f7355df0b6";
const stageIds = [
  "software-detail-stage-07-module-draft",
  "software-detail-stage-08-content-check",
  "software-detail-stage-09-docx-finalize"
];

const sorted = (values) => [...values].sort();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const showPinnedFile = (relativePath) =>
  execFileSync("git", ["show", `${sourceCommit}:${relativePath}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024
  });

function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? walkFiles(root, child) : [child];
  });
}

function parseFrontmatter(text) {
  const match = text.match(
    /^---\nname: ([^\n]+)\nmetadata:\n  version: "([^"]+)"\ndescription: ([^\n]+)\n---\n/
  );
  assert.ok(
    match,
    "SKILL.md must start with name, metadata.version, and description frontmatter"
  );
  return {
    name: match[1],
    metadata: { version: match[2] },
    description: match[3]
  };
}

function parseStageContract(text) {
  const match = text.match(/## Stage contract\s+```json\n([\s\S]*?)\n```/);
  assert.ok(match, "SKILL.md must contain a JSON Stage contract");
  return JSON.parse(match[1]);
}

function ruleIdsForStage(stageId) {
  const stageRules = [
    ...stageMap.defaultRules,
    ...stageMap.workflowRules,
    ...stageMap.outputRules
  ]
    .filter((rule) => rule.stageIds.includes(stageId))
    .map((rule) => rule.id);
  return sorted([...stageMap.sharedRuleSet.ruleIds, ...stageRules]);
}

function resourcesForStage(stageId) {
  return stageMap.resources.filter(
    (resource) =>
      resource.path !== "agents/openai.yaml" &&
      resource.useStageIds.includes(stageId)
  );
}

assert.equal(stageMap.source.commit, sourceCommit);
execFileSync("git", ["cat-file", "-e", `${sourceCommit}^{commit}`], {
  cwd: repoRoot
});
const pinnedSkill = showPinnedFile(stageMap.source.skillPath);
assert.equal(sha256(pinnedSkill), stageMap.source.skillContentSha256);
assert.equal(
  execFileSync(
    "git",
    ["rev-parse", `${sourceCommit}:${stageMap.source.skillPath}`],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim(),
  stageMap.source.skillBlobSha1
);

for (const stageId of stageIds) {
  const mappedStage = stageMap.stages.find((stage) => stage.stageId === stageId);
  const catalogStage = SOFTWARE_DETAIL_STAGE_DEFINITIONS.find(
    (stage) => stage.id === stageId
  );
  const discovery = stageMap.pipelineEntryTransformation.stageDiscoveryMetadata.find(
    (metadata) => metadata.stageId === stageId
  );
  assert.ok(mappedStage, `missing mapped stage ${stageId}`);
  assert.ok(catalogStage, `missing catalog stage ${stageId}`);
  assert.ok(discovery, `missing discovery metadata ${stageId}`);

  const skillDir = path.join(repoRoot, "skills", "hermes", stageId);
  assert.deepEqual(sorted(walkFiles(skillDir)), [
    "SKILL.md",
    path.join("agents", "openai.yaml")
  ]);

  const skillText = readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const metadataText = readFileSync(
    path.join(skillDir, "agents", "openai.yaml"),
    "utf8"
  );
  const frontmatter = parseFrontmatter(skillText);
  assert.deepEqual(Object.keys(frontmatter), ["name", "metadata", "description"]);
  assert.equal(frontmatter.name, stageId);
  assert.equal(frontmatter.metadata.version, mappedStage.skillVersion);
  assert.match(frontmatter.description, /fresh Hermes session/);

  const contract = parseStageContract(skillText);
  assert.deepEqual(contract, {
    stageId,
    version: mappedStage.skillVersion,
    hermesSession: mappedStage.hermesSession,
    responsibility: mappedStage.responsibility,
    inputs: catalogStage.inputs.map((input) => input.role),
    outputs: catalogStage.outputs.map((output) => output.role)
  });
  assert.equal(contract.hermesSession, "new");
  assert.match(skillText, /Do not invoke another stage/);
  assert.match(skillText, /reuse a Hermes session from another stage or failed attempt/);
  assert.match(skillText, /same job/);
  assert.match(skillText, /source stage and source attempt|source-stage\/source-attempt/);
  assert.match(skillText, /role-plus-relative-path contract/);
  assert.doesNotMatch(skillText, /current job attempt/i);
  assert.doesNotMatch(skillText, /declared digests? match/i);
  assert.doesNotMatch(skillText, /byte-verified hierarchy/i);
  assert.doesNotMatch(skillText, /(?:require|fail[^.\n]*)[^.\n]*digest/i);

  const mentionedStageIds = sorted(
    new Set(skillText.match(/software-detail-stage-\d{2}-[a-z0-9-]+/g) || [])
  );
  assert.deepEqual(
    mentionedStageIds,
    [stageId],
    `${stageId} must not claim another stage`
  );

  assert.equal(
    metadataText,
    [
      "interface:",
      `  display_name: "${discovery.displayName}"`,
      `  short_description: "${discovery.shortDescription}"`,
      `  default_prompt: "${discovery.defaultPrompt}"`,
      "policy:",
      "  allow_implicit_invocation: false",
      ""
    ].join("\n"),
    `${stageId} discovery metadata must exactly match the mapped values`
  );

  const sharedPath =
    "<runtime-root>/shared/software-detail-shared-rules.json";
  assert.ok(skillText.includes("As the first operational action"));
  assert.ok(skillText.includes(sharedPath));
  assert.match(skillText, /Fail closed/);
  assert.match(skillText, /missing, unreadable, non-JSON/);
  assert.ok(
    skillText.indexOf(sharedPath) <
      skillText.indexOf("Then read these pinned runtime"),
    `${stageId} must consume shared rules before stage resources`
  );

  const expectedRules = ruleIdsForStage(stageId);
  const actualRules = sorted(
    new Set(skillText.match(/SDD-(?:DEF|WF|OUT)-\d{3}/g) || [])
  );
  assert.deepEqual(
    actualRules,
    expectedRules,
    `${stageId} must cover every assigned clause and no unknown clause`
  );

  const mappedResources = resourcesForStage(stageId);
  const expectedRuntimePaths = sorted([
    sharedPath,
    ...mappedResources.map(
      (resource) => `<runtime-root>/${resource.path}`
    )
  ]);
  const actualRuntimePaths = sorted(
    new Set(
      skillText.match(/<runtime-root>\/[A-Za-z0-9_./-]+/g) || []
    )
  );
  assert.deepEqual(
    actualRuntimePaths,
    expectedRuntimePaths,
    `${stageId} must consume exactly its mapped runtime resources`
  );

  for (const resource of mappedResources) {
    const sourcePath = `${stageMap.source.root}/${resource.path}`;
    const sourceContent = showPinnedFile(sourcePath);
    assert.equal(sha256(sourceContent), resource.contentSha256);
    assert.equal(
      execFileSync("git", ["rev-parse", `${sourceCommit}:${sourcePath}`], {
        cwd: repoRoot,
        encoding: "utf8"
      }).trim(),
      resource.blobSha1
    );
  }
}

const stage7 = readFileSync(
  path.join(
    repoRoot,
    "skills/hermes/software-detail-stage-07-module-draft/SKILL.md"
  ),
  "utf8"
);
assert.match(stage7, /exactly one module section per `document_unit`/);
assert.match(stage7, /`设计依据` heading with a blank body by default/);
assert.match(stage7, /Derive every section from that module's behavior ledger/);
assert.match(stage7, /this reasoning stage must not call MATLAB/);
assert.match(stage7, /`document_unit` list carried by `boundary-projection` or `narrative-plan`/);
assert.match(stage7, /Do not require or fetch a separate hierarchy-manifest input/);
assert.match(stage7, /Do not create a requirements trace matrix/);

const stage8 = readFileSync(
  path.join(
    repoRoot,
    "skills/hermes/software-detail-stage-08-content-check/SKILL.md"
  ),
  "utf8"
);
for (const check of [
  "hierarchy/boundary check",
  "density gate",
  "internal row is unmapped",
  "internal identifier leaks",
  "required boundary output is absent",
  "claim-to-evidence traceability"
]) {
  assert.ok(stage8.includes(check), `stage 8 missing check: ${check}`);
}
assert.match(stage8, /validate_narrative_boundary\.py --manifest/);
assert.match(stage8, /Repair all supported leaks/);
assert.match(stage8, /derive the boundary validator manifest/);
assert.match(stage8, /never fetch or treat a separate hierarchy-manifest as an additional stage input/);
assert.match(stage8, /evidence traceability only; never create or infer a requirements trace matrix/);

const stage9 = readFileSync(
  path.join(
    repoRoot,
    "skills/hermes/software-detail-stage-09-docx-finalize/SKILL.md"
  ),
  "utf8"
);
assert.match(stage9, /Template_Software_Detailed_Design\.docx/);
assert.match(stage9, /docx_list_format\.py <generated\.docx> --out <normalized\.docx>/);
assert.match(stage9, /docx_list_format\.py <final\.docx> --check-only/);
assert.match(stage9, /validate_narrative_boundary\.py --manifest/);
assert.match(stage9, /boundary validator manifest from the hierarchy, allowlist, and identifier data carried by/);
assert.match(stage9, /close only models opened for this job/);
assert.match(stage9, /Never run broad cleanup such as `bdclose all`/);
assert.match(stage9, /never create a requirements trace matrix/);
for (const field of [
  "artifact role",
  "task-relative path",
  "output filename",
  "media type",
  "size",
  "validation results"
]) {
  assert.ok(stage9.includes(field), `stage 9 manifest missing field: ${field}`);
}
assert.match(stage9, /Include content hashes .* only when they are already available/);
assert.match(stage9, /their absence does not invalidate an otherwise valid document/);

console.log(
  "PASS software-detail stage skills 07-09: exact contracts, metadata, mapped rules, pinned resources, and stage-specific gates verified"
);
