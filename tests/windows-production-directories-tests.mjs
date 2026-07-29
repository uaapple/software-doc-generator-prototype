import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareApprovedWindowsDirectories,
  resolveApprovedWindowsDirectory,
  WINDOWS_PRODUCTION_ROOT
} from "../scripts/windows-production-directories.mjs";

assert.equal(process.platform, "win32", "This regression must run on a Windows runner.");

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unique = `codex-ci-${process.pid}-${Date.now()}`;
const testRoot = path.win32.join(WINDOWS_PRODUCTION_ROOT, unique);
const data = path.win32.join(testRoot, "data");
const state = path.win32.join(testRoot, "state");
const marker = path.win32.join(data, "existing-marker.txt");
const outside = path.win32.join("C:\\ProgramData", unique);
const conflictFile = path.win32.join(testRoot, "file-conflict");
const junctionTarget = path.win32.join(testRoot, "junction-target");
const junction = path.win32.join(testRoot, "junction");

function entries(dataValue = data, stateValue = state) {
  return [
    { value: dataValue, category: "SDG_CONTAINER_DATA_DIR" },
    { value: stateValue, category: "MATLAB_GATEWAY_STATE_DIR" }
  ];
}

function rejects(category, action) {
  assert.throws(action, new RegExp(`\\[${category}\\]`));
}

try {
  // Both absent: create empty writable directories from forward-slash input.
  prepareApprovedWindowsDirectories(
    entries(data.replaceAll("\\", "/"), state.replaceAll("\\", "/"))
  );
  assert.ok(fs.statSync(data).isDirectory());
  assert.ok(fs.statSync(state).isDirectory());

  // Existing content survives a partial-existing and repeated initialization.
  fs.writeFileSync(marker, "preserve", "utf8");
  fs.rmSync(state, { recursive: true, force: true });
  prepareApprovedWindowsDirectories(entries());
  prepareApprovedWindowsDirectories(entries());
  assert.equal(fs.readFileSync(marker, "utf8"), "preserve");

  const canonicalData = resolveApprovedWindowsDirectory(data, "DATA");
  assert.equal(
    canonicalData.toLowerCase(),
    resolveApprovedWindowsDirectory(data.replaceAll("\\", "/"), "DATA").toLowerCase()
  );

  rejects("DATA_OUTSIDE_APPROVED_ROOT", () =>
    resolveApprovedWindowsDirectory(outside, "DATA")
  );
  for (const invalid of [
    "",
    "relative\\data",
    "C:relative\\data",
    "\\root-relative",
    "/root-relative",
    "/tmp/data"
  ]) {
    rejects("DATA_ABSOLUTE_REQUIRED", () =>
      resolveApprovedWindowsDirectory(invalid, "DATA")
    );
  }
  rejects("DATA_ROOT_FORBIDDEN", () =>
    resolveApprovedWindowsDirectory("C:\\", "DATA")
  );
  rejects("DATA_ROOT_FORBIDDEN", () =>
    resolveApprovedWindowsDirectory("C:/", "DATA")
  );
  rejects("DATA_UNC_FORBIDDEN", () =>
    resolveApprovedWindowsDirectory("\\\\server\\share\\data", "DATA")
  );

  fs.writeFileSync(conflictFile, "file", "utf8");
  rejects("MATLAB_GATEWAY_STATE_DIR_FILE_CONFLICT", () =>
    prepareApprovedWindowsDirectories(entries(data, conflictFile))
  );

  fs.mkdirSync(junctionTarget);
  fs.symlinkSync(junctionTarget, junction, "junction");
  rejects("MATLAB_GATEWAY_STATE_DIR_REPARSE_FORBIDDEN", () =>
    prepareApprovedWindowsDirectories(entries(data, path.win32.join(junction, "state")))
  );

  const criticalValues = {
    SDG_CONTAINER_DATA_DIR: data,
    MATLAB_GATEWAY_STATE_DIR: state,
    MATLAB_GATEWAY_CONTAINER_ROOT: "/var/lib/sdg/data",
    SATK_GATEWAY_MAPPING_ID: "worker-data"
  };
  const baseEnv = [
    `SDG_WORKER_IMAGE=registry.invalid/worker@sha256:${"1".repeat(64)}`,
    ...Object.entries(criticalValues).map(([key, value]) => `${key}=${value}`),
    `SDG_PROJECT_ADDONS_DIR=${path.win32.join(testRoot, "addons")}`,
    `SDG_WORKER_LOG_DIR=${path.win32.join(testRoot, "logs")}`,
    "SDG_WORKER_BIND_IP=127.0.0.1",
    "MATLAB_WORKER_HOST=127.0.0.1",
    "HERMES_AGENT_TOKEN=test",
    "HERMES_INFERENCE_PROVIDER=deepseek",
    "HERMES_INFERENCE_MODEL=deepseek-v4-pro",
    "DEEPSEEK_API_KEY=test",
    "DEEPSEEK_BASE_URL=https://api.deepseek.com",
    "MATLAB_GATEWAY_TOKEN=test",
    "MATLAB_GATEWAY_EVALUATE_TOKEN=test",
    "UNIT_TEST_CASE_DEFAULT_PROJECTS=01_test"
  ];
  for (const key of Object.keys(criticalValues)) {
    for (const kind of ["duplicate", "duplicate-case", "empty", "comment-only"]) {
      const lines = [...baseEnv];
      const index = lines.findIndex((line) => line.startsWith(`${key}=`));
      if (kind === "duplicate") lines.push(lines[index]);
      else if (kind === "duplicate-case") {
        lines.push(lines[index].replace(key, key.toLowerCase()));
      }
      else if (kind === "empty") lines[index] = `${key}=   `;
      else lines[index] = `# ${lines[index]}`;
      const envFile = path.win32.join(testRoot, `critical-${key}-${kind}.env`);
      fs.writeFileSync(envFile, lines.join("\r\n"), "utf8");
      const result = spawnSync(
        process.execPath,
        ["scripts/container-production.mjs", "windows-worker", "preflight"],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: { ...process.env, SDG_PROD_ENV_FILE: envFile }
        }
      );
      assert.notEqual(result.status, 0, `${key} ${kind} unexpectedly passed`);
      const category = kind === "empty" ? `${key}_EMPTY` : `${key}_MULTIPLICITY`;
      assert.match(result.stderr, new RegExp(`\\[${category}\\]`));
    }
  }

  console.log("Windows production directory boundary tests passed.");
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
