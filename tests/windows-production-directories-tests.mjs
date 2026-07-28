import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  prepareApprovedWindowsDirectories,
  resolveApprovedWindowsDirectory,
  WINDOWS_PRODUCTION_ROOT
} from "../scripts/windows-production-directories.mjs";

assert.equal(process.platform, "win32", "This regression must run on a Windows runner.");

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

  console.log("Windows production directory boundary tests passed.");
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
