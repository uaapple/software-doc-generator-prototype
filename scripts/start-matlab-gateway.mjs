#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedEnvPath = String(process.env.SDG_CONTAINER_ENV_FILE || "").trim();
const envPath = requestedEnvPath
  ? path.resolve(rootDir, requestedEnvPath)
  : path.join(rootDir, ".env.container");

if (!fs.existsSync(envPath)) {
  throw new Error(`Missing ${path.basename(envPath)}. Copy .env.container.example and populate required tokens.`);
}

const values = readEnvFile(envPath);
for (const key of ["MATLAB_GATEWAY_TOKEN", "MATLAB_GATEWAY_EVALUATE_TOKEN"]) {
  if (!String(values[key] || process.env[key] || "").trim()) {
    throw new Error(`${key} must be non-empty before starting the host MATLAB Gateway.`);
  }
}

const matlabRoot = path.resolve(
  process.env.MATLAB_ROOT ||
  values.MATLAB_ROOT ||
  "/Applications/MATLAB_R2026a.app"
);
if (!fs.existsSync(matlabRoot)) {
  throw new Error(`Configured MATLAB_ROOT does not exist: ${matlabRoot}`);
}

const dataRoot = resolveLocalDirectory(
  process.env.SDG_CONTAINER_DATA_DIR ||
    values.SDG_CONTAINER_DATA_DIR ||
    ".local/container/data",
  "SDG_CONTAINER_DATA_DIR"
);
const stateRoot = resolveLocalDirectory(
  process.env.MATLAB_GATEWAY_STATE_DIR ||
    values.MATLAB_GATEWAY_STATE_DIR ||
    ".local/container/matlab-gateway-state",
  "MATLAB_GATEWAY_STATE_DIR"
);
fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(stateRoot, 0o700);

const childEnv = {
  ...process.env,
  MATLAB_GATEWAY_TOKEN: values.MATLAB_GATEWAY_TOKEN || process.env.MATLAB_GATEWAY_TOKEN,
  MATLAB_GATEWAY_EVALUATE_TOKEN:
    values.MATLAB_GATEWAY_EVALUATE_TOKEN || process.env.MATLAB_GATEWAY_EVALUATE_TOKEN,
  MATLAB_MCP_AUTH_TOKEN: values.MATLAB_GATEWAY_TOKEN || process.env.MATLAB_GATEWAY_TOKEN,
  MATLAB_GATEWAY_MAPPING_ID: values.SATK_GATEWAY_MAPPING_ID || "worker-data",
  MATLAB_GATEWAY_CONTAINER_ROOT:
    values.MATLAB_GATEWAY_CONTAINER_ROOT || "/var/lib/sdg/data",
  MATLAB_GATEWAY_HOST_ROOT: dataRoot,
  MATLAB_GATEWAY_STATE_DIR: stateRoot,
  MATLAB_WORKER_HOST: process.env.MATLAB_WORKER_HOST || "127.0.0.1",
  MATLAB_ROOT: matlabRoot,
  SATK_MATLAB_ROOT: matlabRoot,
  SATK_MATLAB_SESSION_MODE: "new"
};

if (process.argv.includes("--check")) {
  console.log("MATLAB Gateway host preflight passed.");
  process.exit(0);
}

const child = spawn(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "src/matlab-worker-server.js"],
  { cwd: rootDir, env: childEnv, stdio: "inherit" }
);
child.once("error", (error) => {
  console.error(`MATLAB Gateway failed to start: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = Number.isInteger(code) ? code : signal ? 1 : 0;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

function readEnvFile(filePath) {
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    result[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return result;
}

function resolveLocalDirectory(value, label) {
  const resolved = path.resolve(rootDir, value);
  if (resolved === path.parse(resolved).root) {
    throw new Error(`${label} cannot target a filesystem root.`);
  }
  return resolved;
}
