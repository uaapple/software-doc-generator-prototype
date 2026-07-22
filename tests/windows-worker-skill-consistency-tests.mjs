import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertOfficialSkillConsistency,
  hashDirectoryTree,
  updateOfficialSkillHashes
} from "../scripts/windows-worker-skill-consistency.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "worker-skill-consistency-"));
const manifestPath = path.join(root, "offline-installers", "official-dependencies.json");
const tcsd = path.join(root, "skills", "hermes", "simulink-ut-tcsd-generator");
const detail = path.join(root, "skills", "hermes", "simulink-module-description-generator");
await mkdir(path.dirname(manifestPath), { recursive: true });
await mkdir(tcsd, { recursive: true });
await mkdir(detail, { recursive: true });
await writeFile(path.join(tcsd, "SKILL.md"), "tcsd\n", "utf8");
await writeFile(path.join(detail, "SKILL.md"), "detail\n", "utf8");
await writeFile(manifestPath, JSON.stringify({
  version: 1,
  dependencies: {
    simulinkUtTcsdGeneratorSkill: { version: "abc" },
    simulinkModuleDescriptionGeneratorSkill: { version: "abc" }
  }
}), "utf8");

updateOfficialSkillHashes({ projectRoot: root, manifestPath });
assert.doesNotThrow(() => assertOfficialSkillConsistency({ projectRoot: root, manifestPath }));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.dependencies.simulinkUtTcsdGeneratorSkill.contentSha256, hashDirectoryTree(tcsd));
assert.equal(manifest.dependencies.simulinkModuleDescriptionGeneratorSkill.contentSha256, hashDirectoryTree(detail));

const stableHash = hashDirectoryTree(tcsd);
await mkdir(path.join(tcsd, "scripts", "__pycache__"), { recursive: true });
await writeFile(path.join(tcsd, "scripts", "__pycache__", "helper.cpython-311.pyc"), "cache", "utf8");
assert.equal(hashDirectoryTree(tcsd), stableHash);

await writeFile(path.join(tcsd, "SKILL.md"), "changed\n", "utf8");
assert.throws(
  () => assertOfficialSkillConsistency({ projectRoot: root, manifestPath }),
  /does not match the synchronized manifest/
);

console.log("Windows Worker skill consistency tests passed.");
