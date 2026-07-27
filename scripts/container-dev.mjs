#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedAction = String(process.argv[2] || "help").trim().toLowerCase();
const requestedEnvPath = String(process.env.SDG_CONTAINER_ENV_FILE || "").trim();
const envPath = requestedEnvPath
  ? path.resolve(rootDir, requestedEnvPath)
  : fs.existsSync(path.join(rootDir, ".env.container"))
    ? path.join(rootDir, ".env.container")
    : path.join(rootDir, ".env.container.example");
const envValues = readEnvFile(envPath);
const composeArgs = [
  "compose",
  "--env-file",
  envPath,
  "--file",
  path.join(rootDir, "compose.yaml"),
  "--file",
  path.join(rootDir, "compose.mac.yaml")
];
const actionsRequiringSecrets = new Set(["up", "build", "config", "restart", "test"]);
const requiredSecrets = [
  "HERMES_AGENT_TOKEN",
  "MATLAB_GATEWAY_TOKEN",
  "MATLAB_GATEWAY_EVALUATE_TOKEN"
];

function readEnvFile(filePath) {
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    values[key] = value;
  }
  return values;
}

function resolveLocalDirectory(key, fallback) {
  const configured = process.env[key] || envValues[key] || fallback;
  const resolved = path.resolve(rootDir, configured);
  const root = path.parse(resolved).root;
  if (resolved === root) {
    throw new Error(`${key} cannot target a filesystem root.`);
  }
  return resolved;
}

function prepareMounts() {
  for (const [key, fallback] of [
    ["SDG_CONTAINER_DATA_DIR", ".local/container/data"],
    ["SDG_PROJECT_ADDONS_DIR", ".local/project-addons"],
    ["SDG_PLATFORM_LOG_DIR", ".local/container/logs/platform"],
    ["SDG_WORKER_LOG_DIR", ".local/container/logs/worker"]
  ]) {
    fs.mkdirSync(resolveLocalDirectory(key, fallback), { recursive: true });
  }
}

function validateRequiredSecrets() {
  if (!actionsRequiringSecrets.has(requestedAction)) return;
  const missing = requiredSecrets.filter(
    (key) => !String(process.env[key] || envValues[key] || "").trim()
  );
  if (missing.length) {
    throw new Error(
      `Container preflight requires non-empty ${missing.join(", ")} in ${path.basename(envPath)}.`
    );
  }
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "Docker CLI is unavailable on PATH. Start Docker Desktop and ensure its standard /usr/local/bin/docker link is available."
    );
  }
  if (result.status !== 0) {
    const details = options.capture ? String(result.stderr || result.stdout || "").trim() : "";
    throw new Error(details || `docker ${args.join(" ")} failed with exit code ${result.status}.`);
  }
  return result;
}

function ensureDocker() {
  runDocker(["version"], { capture: true });
  runDocker(["buildx", "version"], { capture: true });
  runDocker(["compose", "version"], { capture: true });
}

function verifyWritableMounts() {
  const checks = [
    ["worker", ["/var/lib/sdg/data", "/var/lib/sdg/logs", "/var/lib/sdg/hermes-home"]],
    [
      "platform",
      ["/var/lib/sdg/data", "/var/log/sdg", "/var/lib/sdg/skills", "/var/lib/sdg/home"]
    ]
  ];
  for (const [service, directories] of checks) {
    const script = [
      "const fs=require('node:fs');",
      "const path=require('node:path');",
      `for(const directory of ${JSON.stringify(directories)}){`,
      "const sentinel=path.join(directory,`.sdg-write-${process.pid}-${Date.now()}`);",
      "fs.writeFileSync(sentinel,'ok',{flag:'wx'});",
      "fs.unlinkSync(sentinel);",
      "}",
      "console.log('writable mounts verified');"
    ].join("");
    runDocker([...composeArgs, "exec", "--no-TTY", service, "node", "-e", script]);
  }
}

function verifyWorkerGatewayReachability() {
  const script = [
    "(async()=>{",
    "const base=process.env.MATLAB_MCP_BASE_URL;",
    "const token=process.env.MATLAB_MCP_AUTH_TOKEN;",
    "const health=await fetch(new URL('/health',base));",
    "if(!health.ok||!(await health.json()).ok)throw new Error('Gateway health failed');",
    "const version=await fetch(new URL('/version',base),{headers:{Authorization:`Bearer ${token}`}});",
    "if(!version.ok||!(await version.json()).gatewayVersion)throw new Error('Gateway version failed');",
    "console.log('worker-to-gateway reachability verified');",
    "})().catch(()=>{console.error('worker-to-gateway reachability failed');process.exit(1)})"
  ].join("");
  runDocker([...composeArgs, "exec", "--no-TTY", "worker", "node", "-e", script]);
}

async function probe(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body?.ok !== true) throw new Error("response did not report ok=true");
    console.log(`${label}: ${url} ✓`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (requestedAction === "help") {
    console.log("Usage: node scripts/container-dev.mjs <up|down|build|config|status|restart|test>");
    return;
  }
  validateRequiredSecrets();
  prepareMounts();
  ensureDocker();
  if (requestedAction === "up") {
    runDocker([...composeArgs, "up", "--detach", "--build", "--remove-orphans"]);
    verifyWritableMounts();
    return;
  }
  if (requestedAction === "down") {
    runDocker([...composeArgs, "down", "--remove-orphans"]);
    return;
  }
  if (requestedAction === "build") {
    runDocker([...composeArgs, "build", "--pull"]);
    return;
  }
  if (requestedAction === "config") {
    runDocker([...composeArgs, "config", "--quiet"]);
    return;
  }
  if (requestedAction === "status") {
    runDocker([...composeArgs, "ps"]);
    return;
  }
  if (requestedAction === "restart") {
    runDocker([...composeArgs, "restart"]);
    return;
  }
  if (requestedAction === "test") {
    runDocker([...composeArgs, "ps"]);
    verifyWritableMounts();
    verifyWorkerGatewayReachability();
    await probe(
      `http://127.0.0.1:${process.env.SDG_WORKER_PORT || envValues.SDG_WORKER_PORT || "3101"}/api/health`,
      "worker"
    );
    await probe(
      `http://127.0.0.1:${process.env.SDG_PLATFORM_PORT || envValues.SDG_PLATFORM_PORT || "3000"}/api/health`,
      "platform"
    );
    await probe("http://127.0.0.1:5100/health", "MATLAB Gateway");
    return;
  }
  throw new Error(`Unknown container action: ${requestedAction}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
