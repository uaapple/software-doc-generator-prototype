import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "deploy", "native-matlab-gateway-companion.json"),
    "utf8"
  )
);
const localRoot = path.join(rootDir, ".local");
fs.mkdirSync(localRoot, { recursive: true });
const fixtureRoot = fs.mkdtempSync(path.join(localRoot, "windows-gateway-wrapper-"));
const appRoot = path.join(fixtureRoot, "app");
const wrapperPath = path.join(appRoot, "src", "matlab-worker-server.js");

try {
  for (const entry of config.managedFiles) {
    const source = path.join(rootDir, entry.source);
    const target = path.join(appRoot, entry.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  const baseValues = {
    NODE_ENV: "production",
    MATLAB_GATEWAY_TOKEN: "gw-test",
    MATLAB_GATEWAY_EVALUATE_TOKEN: "eval-test",
    MATLAB_WORKER_HOST: "127.0.0.1",
    MATLAB_WORKER_PORT: "5100",
    MATLAB_GATEWAY_CONTAINER_ROOT: "/var/lib/sdg/data",
    SATK_GATEWAY_MAPPING_ID: "worker-data"
  };

  const missingSource = runWrapper(baseValues);
  assertFailure(missingSource, "SDG_CONTAINER_DATA_DIR_REQUIRED");

  const relativeRoot = runWrapper({
    ...baseValues,
    SDG_CONTAINER_DATA_DIR: "relative\\data"
  });
  assertFailure(relativeRoot, "HOST_ROOT_ABSOLUTE_REQUIRED");

  const conflict = runWrapper({
    ...baseValues,
    SDG_CONTAINER_DATA_DIR: "C:\\approved\\data",
    MATLAB_GATEWAY_HOST_ROOT: "D:\\conflicting\\data"
  });
  assertFailure(conflict, "MATLAB_GATEWAY_HOST_ROOT_CONFLICT");

  const equivalentSlashStyles = runWrapper({
    ...baseValues,
    SDG_CONTAINER_DATA_DIR: "C:/approved/data",
    MATLAB_GATEWAY_HOST_ROOT: "C:\\approved\\data"
  });
  assertFailure(equivalentSlashStyles, "HOST_ROOT_DIRECTORY_REQUIRED");

  const containerRootConflict = runWrapper({
    ...baseValues,
    SDG_CONTAINER_DATA_DIR: "C:\\approved\\data",
    MATLAB_GATEWAY_CONTAINER_ROOT: "/var/lib/sdg/other"
  });
  assertFailure(containerRootConflict, "CONTAINER_ROOT_CONFLICT");

  const mappingIdConflict = runWrapper({
    ...baseValues,
    SDG_CONTAINER_DATA_DIR: "C:\\approved\\data",
    SATK_GATEWAY_MAPPING_ID: "other-data"
  });
  assertFailure(mappingIdConflict, "MAPPING_ID_CONFLICT");

  const missingDirectory = runWrapper({
    ...baseValues,
    SDG_CONTAINER_DATA_DIR: `C:\\sdg-missing-${process.pid}\\data`,
    MATLAB_GATEWAY_STATE_DIR: `C:\\sdg-missing-${process.pid}\\state`,
    MATLAB_ROOT: `C:\\sdg-missing-${process.pid}\\matlab`,
    MATLAB_MCP_TMPDIR: `C:\\sdg-missing-${process.pid}\\tmp`,
    MATLAB_MCP_SERVER_COMMAND: `C:\\sdg-missing-${process.pid}\\mcp.exe`,
    SIMULINK_AGENTIC_TOOLKIT_ROOT: `C:\\sdg-missing-${process.pid}\\toolkit`
  });
  assertFailure(missingDirectory, "HOST_ROOT_DIRECTORY_REQUIRED");

  if (process.platform === "win32") {
    const dataRoot = path.join(fixtureRoot, "data");
    const stateRoot = path.join(fixtureRoot, "state");
    const matlabRoot = path.join(fixtureRoot, "MATLAB", "R2025b");
    const tempRoot = path.join(fixtureRoot, "mcp-temp");
    const toolkitRoot = path.join(fixtureRoot, "agentic-toolkits", "simulink");
    const mcpCommand = path.join(fixtureRoot, "matlab-mcp-server.exe");
    for (const directory of [
      dataRoot,
      stateRoot,
      matlabRoot,
      tempRoot,
      path.join(toolkitRoot, "tools")
    ]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(path.join(toolkitRoot, "tools", "tools.json"), "{}\n");
    fs.writeFileSync(mcpCommand, "test executable placeholder\n");

    const success = runWrapper({
      ...baseValues,
      SDG_CONTAINER_DATA_DIR: dataRoot.replaceAll("\\", "/"),
      MATLAB_GATEWAY_HOST_ROOT: dataRoot,
      MATLAB_GATEWAY_STATE_DIR: stateRoot,
      MATLAB_ROOT: matlabRoot,
      MATLAB_MCP_TMPDIR: tempRoot,
      MATLAB_MCP_SERVER_COMMAND: mcpCommand,
      SIMULINK_AGENTIC_TOOLKIT_ROOT: toolkitRoot
    });
    assert.equal(success.status, 0, success.stderr || success.stdout);
    assert.match(
      success.stdout,
      /Native MATLAB Gateway wrapper configuration preflight passed\./
    );
    assert.ok(fs.statSync(path.join(stateRoot, "workspaces")).isDirectory());
    assert.doesNotMatch(success.stderr, /gw-test|eval-test/);
  } else {
    console.log(
      "Windows wrapper success-path filesystem assertions are reserved for the Windows CI gate."
    );
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

function runWrapper(values) {
  const nativeEnvPath = path.join(
    fixtureRoot,
    `software-doc-worker-${Math.random().toString(16).slice(2)}.env`
  );
  fs.writeFileSync(
    nativeEnvPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\r\n")}\r\n`,
    "utf8"
  );
  const childEnv = { ...process.env };
  for (const key of [
    ...Object.keys(values),
    "MATLAB_GATEWAY_HOST_ROOT",
    "MATLAB_GATEWAY_STATE_DIR",
    "MATLAB_GATEWAY_CONTAINER_ROOT",
    "MATLAB_GATEWAY_MAPPING_ID",
    "SDG_CONTAINER_DATA_DIR",
    "SATK_GATEWAY_MAPPING_ID",
    "MATLAB_GATEWAY_TOKEN",
    "MATLAB_GATEWAY_EVALUATE_TOKEN",
    "MATLAB_MCP_AUTH_TOKEN",
    "MATLAB_ROOT",
    "MATLAB_MCP_TMPDIR",
    "MATLAB_MCP_SERVER_COMMAND",
    "SIMULINK_AGENTIC_TOOLKIT_ROOT",
    "SATK_MATLAB_SESSION_MODE",
    "SOFTWARE_DOC_WORKER_ENV_FILE"
  ]) {
    delete childEnv[key];
  }
  childEnv.NODE_ENV = "production";
  childEnv.SOFTWARE_DOC_WORKER_ENV_FILE = nativeEnvPath;
  return spawnSync(
    process.execPath,
    [wrapperPath, "--wrapper-config-preflight-only"],
    {
      cwd: appRoot,
      env: childEnv,
      encoding: "utf8",
      timeout: 15000
    }
  );
}

function assertFailure(result, category) {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(
    result.stderr,
    new RegExp(`Native MATLAB Gateway wrapper startup failed \\[${category}\\]\\.`)
  );
  assert.doesNotMatch(result.stdout, /configuration preflight passed/);
  assert.doesNotMatch(result.stderr, /gw-test|eval-test/);
}

console.log("Native Windows Gateway wrapper configuration contract tests passed.");
