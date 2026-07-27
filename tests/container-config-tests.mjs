import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

for (const required of [
  ".dockerignore",
  ".env.container.example",
  "compose.yaml",
  "compose.mac.yaml",
  "scripts/container-dev.mjs",
  "scripts/check-container-secrets.mjs",
  "scripts/container-release-manifest.mjs",
  "scripts/container-scan.mjs"
]) {
  assert.ok(fs.existsSync(path.join(rootDir, required)), `${required} must exist`);
}

const compose = read("compose.yaml");
assert.match(compose, /platform:\s*linux\/amd64/);
assert.match(compose, /host\.docker\.internal:5100/);
assert.match(compose, /read_only:\s*true/);
assert.doesNotMatch(compose, /MATLAB_ROOT|SATK_MATLAB_ROOT/);

const envExample = read(".env.container.example");
assert.doesNotMatch(envExample, /(?:API_KEY|AUTH_TOKEN|PASSWORD|SECRET)[ \t]*=[ \t]*\S+/);

const boundaryCheck = spawnSync(process.execPath, ["scripts/check-container-boundaries.mjs"], {
  cwd: rootDir,
  encoding: "utf8"
});
assert.equal(boundaryCheck.status, 0, `${boundaryCheck.stdout}\n${boundaryCheck.stderr}`);

const secretCheck = spawnSync(process.execPath, ["scripts/check-container-secrets.mjs"], {
  cwd: rootDir,
  encoding: "utf8"
});
assert.equal(secretCheck.status, 0, `${secretCheck.stdout}\n${secretCheck.stderr}`);

console.log("Container configuration tests passed.");
