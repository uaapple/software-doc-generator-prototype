import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-secret-scan-"));
const unsafePath = path.join(temporaryDirectory, "unsafe.json");
const safePath = path.join(temporaryDirectory, "safe.json");
const runtimeReferencePath = path.join(temporaryDirectory, "runtime-reference.js");
const literalAssignmentPath = path.join(temporaryDirectory, "literal-assignment.js");
const sentinel = "must-never-appear-in-scanner-output";

try {
  fs.writeFileSync(
    unsafePath,
    JSON.stringify({ profiles: [{ apiKey: sentinel }, { password: "<placeholder>" }] }),
    "utf8"
  );
  fs.writeFileSync(
    safePath,
    JSON.stringify({ profiles: [{ apiKey: "" }, { authToken: "${TOKEN}" }] }),
    "utf8"
  );
  fs.writeFileSync(
    runtimeReferencePath,
    "const childEnv = {\n  MATLAB_MCP_AUTH_TOKEN: values.MATLAB_GATEWAY_TOKEN || process.env.MATLAB_GATEWAY_TOKEN,\n};\n",
    "utf8"
  );
  fs.writeFileSync(
    literalAssignmentPath,
    `const childEnv = {\n  MATLAB_MCP_AUTH_TOKEN: "${sentinel}",\n};\n`,
    "utf8"
  );

  const unsafe = runScanner(unsafePath);
  assert.notEqual(unsafe.status, 0, "scanner must fail closed for a populated JSON apiKey");
  assert.match(unsafe.stderr, /\$\.profiles\[0\]\.apiKey/);
  assert.doesNotMatch(`${unsafe.stdout}\n${unsafe.stderr}`, new RegExp(sentinel));

  const safe = runScanner(safePath);
  assert.equal(safe.status, 0, `${safe.stdout}\n${safe.stderr}`);

  const runtimeReference = runScanner(runtimeReferencePath);
  assert.equal(runtimeReference.status, 0, `${runtimeReference.stdout}\n${runtimeReference.stderr}`);

  const literalAssignment = runScanner(literalAssignmentPath);
  assert.notEqual(literalAssignment.status, 0, "scanner must reject a literal token assignment");
  assert.doesNotMatch(
    `${literalAssignment.stdout}\n${literalAssignment.stderr}`,
    new RegExp(sentinel)
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Container JSON secret scan tests passed.");

function runScanner(filePath) {
  return spawnSync(
    process.execPath,
    ["scripts/check-container-secrets.mjs", "--files", filePath],
    { cwd: rootDir, encoding: "utf8" }
  );
}
