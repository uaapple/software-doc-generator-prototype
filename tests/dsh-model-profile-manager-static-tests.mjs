import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts", "manage-dsh-model-profiles.ps1");
const source = fs.readFileSync(scriptPath, "utf8");

for (const action of ["Menu", "List", "Capture", "Add", "Switch", "Show"]) {
  assert.match(source, new RegExp(`\\b${action}\\b`), `missing action ${action}`);
}

for (const key of [
  "HERMES_INFERENCE_PROVIDER",
  "HERMES_INFERENCE_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "GLM_API_KEY",
  "GLM_BASE_URL"
]) {
  assert.match(source, new RegExp(key), `missing managed key ${key}`);
}

const applySequence = ["config", "preflight", "up", "test"].map((action) =>
  source.indexOf(`Invoke-ProductionAction "${action}"`)
);
assert.ok(applySequence.every((index) => index >= 0), "missing production apply action");
assert.deepEqual(
  applySequence,
  [...applySequence].sort((left, right) => left - right),
  "production apply actions must remain config -> preflight -> up -> test"
);

assert.match(source, /ConfirmNoActiveTasks/, "switch must require an idle-task confirmation");
assert.match(source, /Assert-ProfileFileShape/, "profile fragments must reject unrelated env keys");
assert.match(source, /Restore-EnvBackup/, "failed apply must restore the previous env file");
assert.match(source, /\.dsh-model-profiles/, "profiles must stay outside the tracked env example");
assert.doesNotMatch(source, /ConvertFrom-SecureString|SecureString|DPAPI/i, "profiles are intentionally plain text");
assert.doesNotMatch(source, /docker\s+build|down\s+-v|Remove-Item.+ResolvedEnvFile/i, "tool must not build or delete production state");

console.log("DSH model profile manager static checks passed.");
