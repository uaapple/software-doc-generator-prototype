import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = Object.fromEntries(
  await Promise.all(
    ["linux-prod", "windows-prod-full", "windows-prod-source"].map(async (id) => [
      id,
      JSON.parse(await readFile(path.join(root, "deploy", "targets", `${id}.json`), "utf8"))
    ])
  )
);

function included(target, candidate) {
  const selected = target.includePaths.some(
    (entry) => candidate === entry || candidate.startsWith(`${entry}/`)
  );
  const excluded = target.excludePaths.some(
    (entry) => candidate === entry || candidate.startsWith(`${entry}/`)
  );
  return selected && !excluded;
}

assert.equal(included(targets["linux-prod"], "scripts/rollback-linux-release.sh"), true);
assert.equal(included(targets["linux-prod"], "scripts/restore-windows-worker-source.ps1"), false);
assert.equal(included(targets["linux-prod"], "requirements/tcsd-runtime.txt"), false);
assert.equal(included(targets["linux-prod"], "tests/rollback-linux-release-tests.sh"), false);
assert.equal(included(targets["linux-prod"], "data/runtime.json"), false);

for (const id of ["windows-prod-full", "windows-prod-source"]) {
  assert.equal(included(targets[id], "scripts/rollback-linux-release.sh"), false);
  assert.equal(included(targets[id], "scripts/restore-windows-worker-source.ps1"), true);
  assert.equal(included(targets[id], "requirements/tcsd-runtime.txt"), true);
  assert.equal(included(targets[id], "tests/rollback-linux-release-tests.sh"), false);
}

console.log("Release rollback package boundary tests passed.");
