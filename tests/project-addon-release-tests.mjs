import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-addon-release-test-"));
const sourceRoot = path.join(temporaryRoot, "source");
const targetRoot = path.join(temporaryRoot, "target");
const archivePath = path.join(temporaryRoot, "project-addons.zip");
const manifestPath = path.join(temporaryRoot, "project-addons-manifest.json");
const revision = "a".repeat(40);

try {
  writeProjectSource(sourceRoot, "01", "init_Global.m", "% project 01\n");
  writeProjectSource(sourceRoot, "02", "config/project.sldd", "project-02-dictionary\n");
  run([
    "scripts/build-project-addon-release.mjs",
    `--source=${sourceRoot}`,
    "--projects=01,02",
    `--archive=${archivePath}`,
    `--manifest=${manifestPath}`,
    `--source-revision=${revision}`
  ]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema, "sdg-project-addon-release/v1");
  assert.deepEqual(manifest.projectIds, ["01", "02"]);
  assert.equal(manifest.projects["01"].fileCount, 1);
  assert.equal(manifest.projects["02"].fileCount, 1);

  run([
    "scripts/install-project-addon-release.mjs",
    `--archive=${archivePath}`,
    `--manifest=${manifestPath}`,
    `--target=${targetRoot}`,
    "--projects=01,02"
  ]);
  run([
    "scripts/install-project-addon-release.mjs",
    "--verify-only",
    `--manifest=${path.join(targetRoot, ".sdg-project-addons-manifest.json")}`,
    `--target=${targetRoot}`,
    "--projects=01,02"
  ]);
  assert.equal(fs.readFileSync(path.join(targetRoot, "01", "init_Global.m"), "utf8"), "% project 01\n");

  fs.writeFileSync(path.join(targetRoot, "01", "init_Global.m"), "% tampered\n", "utf8");
  const tampered = runResult([
    "scripts/install-project-addon-release.mjs",
    "--verify-only",
    `--manifest=${manifestPath}`,
    `--target=${targetRoot}`,
    "--projects=01,02"
  ]);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /does not match manifest/);

  const emptySource = path.join(temporaryRoot, "empty-source");
  fs.mkdirSync(path.join(emptySource, "01"), { recursive: true });
  const emptyBuild = runResult([
    "scripts/build-project-addon-release.mjs",
    `--source=${emptySource}`,
    "--projects=01",
    `--archive=${path.join(temporaryRoot, "empty.zip")}`,
    `--manifest=${path.join(temporaryRoot, "empty.json")}`,
    `--source-revision=${revision}`
  ]);
  assert.notEqual(emptyBuild.status, 0);
  assert.match(emptyBuild.stderr, /source is empty/);

  const genericSource = path.join(temporaryRoot, "generic-source");
  writeProjectSource(genericSource, "common", "init.m", "% generic addon is forbidden\n");
  const genericBuild = runResult([
    "scripts/build-project-addon-release.mjs",
    `--source=${genericSource}`,
    "--projects=01",
    `--archive=${path.join(temporaryRoot, "generic.zip")}`,
    `--manifest=${path.join(temporaryRoot, "generic.json")}`,
    `--source-revision=${revision}`
  ]);
  assert.notEqual(genericBuild.status, 0);
  assert.match(genericBuild.stderr, /only project-specific numeric directories/);

  console.log("project-specific addon release tests passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function writeProjectSource(root, projectId, relativePath, content) {
  const destination = path.join(root, projectId, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, "utf8");
}

function run(argumentsList) {
  const result = runResult(argumentsList);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function runResult(argumentsList) {
  return spawnSync(process.execPath, argumentsList, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
