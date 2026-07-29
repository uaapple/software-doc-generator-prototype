#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareApprovedWindowsDirectories } from "./windows-production-directories.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = String(process.argv[2] || "").trim().toLowerCase();
const action = String(process.argv[3] || "").trim().toLowerCase();
const targetConfig = {
  "windows-worker": {
    composeFile: "compose.windows-docker-desktop.yaml",
    envFallback: ".env.windows-docker-desktop",
    service: "worker",
    imageKeys: ["SDG_WORKER_IMAGE"],
    required: [
      "HERMES_AGENT_TOKEN",
      "HERMES_INFERENCE_PROVIDER",
      "HERMES_INFERENCE_MODEL",
      "MATLAB_GATEWAY_TOKEN",
      "MATLAB_GATEWAY_EVALUATE_TOKEN",
      "MATLAB_WORKER_HOST",
      "SDG_CONTAINER_DATA_DIR",
      "MATLAB_GATEWAY_STATE_DIR",
      "SDG_PROJECT_ADDONS_DIR",
      "SDG_WORKER_LOG_DIR",
      "SDG_WORKER_BIND_IP"
    ]
  },
  "linux-platform": {
    composeFile: "compose.linux-prod.yaml",
    envFallback: ".env.linux-container-prod",
    service: "platform",
    imageKeys: ["SDG_PLATFORM_IMAGE"],
    required: [
      "HERMES_AGENT_TOKEN",
      "MATLAB_GATEWAY_TOKEN",
      "HERMES_BASE_URL",
      "MATLAB_MCP_BASE_URL",
      "UNIT_TEST_DEFAULT_WORKER_ID",
      "UNIT_TEST_WORKER_PROFILES_JSON",
      "SDG_CONTAINER_DATA_DIR",
      "SDG_PLATFORM_SKILLS_DIR",
      "SDG_PLATFORM_LOG_DIR",
      "SDG_PLATFORM_HOME_DIR",
      "SDG_PLATFORM_BIND_IP",
      "SDG_WIKI_BIND_IP"
    ]
  }
}[target];

if (!targetConfig || !["config", "preflight", "up", "test", "status", "down"].includes(action)) {
  console.error(
    "Usage: node scripts/container-production.mjs " +
    "<windows-worker|linux-platform> <config|preflight|up|test|status|down>"
  );
  process.exit(2);
}

const requestedEnvFile = String(process.env.SDG_PROD_ENV_FILE || "").trim();
const envFile = requestedEnvFile
  ? path.resolve(rootDir, requestedEnvFile)
  : path.join(rootDir, targetConfig.envFallback);
if (!fs.existsSync(envFile)) {
  throw new Error(
    `Missing production env file: ${envFile}. Copy the matching tracked example and populate it locally.`
  );
}

const { values: envValues, counts: envKeyCounts } = readEnvFile(envFile);
const composeArgs = [
  "compose",
  "--env-file",
  envFile,
  "--file",
  path.join(rootDir, targetConfig.composeFile)
];

function readEnvFile(filePath) {
  const values = {};
  const counts = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const normalizedKey = key.toUpperCase();
    counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
    values[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return { values, counts };
}

function value(key) {
  return String(process.env[key] || envValues[key] || "").trim();
}

function validateConfiguration() {
  validateCriticalWindowsEnvFile();
  const missing = targetConfig.required.filter((key) => !value(key));
  if (target === "windows-worker") {
    const provider = value("HERMES_INFERENCE_PROVIDER").toLowerCase();
    if (provider === "deepseek") {
      if (!value("DEEPSEEK_API_KEY")) missing.push("DEEPSEEK_API_KEY");
      if (!value("DEEPSEEK_BASE_URL")) missing.push("DEEPSEEK_BASE_URL");
    } else if (provider === "zai") {
      if (!value("GLM_API_KEY") && !value("ZHIPU_API_KEY")) {
        missing.push("GLM_API_KEY or ZHIPU_API_KEY");
      }
      if (!value("GLM_BASE_URL") && !value("ZHIPU_BASE_URL")) {
        missing.push("GLM_BASE_URL or ZHIPU_BASE_URL");
      }
    } else if (provider) {
      throw new Error(`Unsupported HERMES_INFERENCE_PROVIDER for production: ${provider}`);
    }
  }
  if (missing.length) {
    throw new Error(`Production configuration requires non-empty ${[...new Set(missing)].join(", ")}.`);
  }
  for (const key of targetConfig.imageKeys) assertImmutableImage(key, value(key));
  validateBindAddress(
    target === "windows-worker" ? "SDG_WORKER_BIND_IP" : "SDG_PLATFORM_BIND_IP"
  );
  if (target === "windows-worker") {
    validateBindAddress("MATLAB_WORKER_HOST");
  } else {
    validateBindAddress("SDG_WIKI_BIND_IP");
    validateRemoteUrl("HERMES_BASE_URL", value("HERMES_BASE_URL"));
    validateRemoteUrl("MATLAB_MCP_BASE_URL", value("MATLAB_MCP_BASE_URL"));
    validateWorkerProfiles();
  }
}

function validateCriticalWindowsEnvFile() {
  if (target !== "windows-worker") return;
  for (const key of [
    "SDG_CONTAINER_DATA_DIR",
    "MATLAB_GATEWAY_STATE_DIR",
    "MATLAB_GATEWAY_CONTAINER_ROOT",
    "SATK_GATEWAY_MAPPING_ID"
  ]) {
    if (envKeyCounts[key] !== 1) {
      throw new Error(
        `[${key}_MULTIPLICITY] A security-critical production setting must be assigned exactly once.`
      );
    }
    if (!String(envValues[key] || "").trim()) {
      throw new Error(
        `[${key}_EMPTY] A security-critical production setting must be non-empty.`
      );
    }
  }
}

function assertImmutableImage(key, reference) {
  const match = reference.match(/(?:@sha256:|^sha256:)([a-f0-9]{64})$/i);
  if (!match || /^0+$/.test(match[1])) {
    throw new Error(
      `${key} must use a non-placeholder immutable repository @sha256 digest or image sha256 ID.`
    );
  }
}

function validateWorkerProfiles() {
  let parsed;
  try {
    parsed = JSON.parse(value("UNIT_TEST_WORKER_PROFILES_JSON"));
  } catch {
    throw new Error("UNIT_TEST_WORKER_PROFILES_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed?.workers) || parsed.workers.length < 1) {
    throw new Error("UNIT_TEST_WORKER_PROFILES_JSON must define at least one worker.");
  }
  const ids = new Set();
  for (const worker of parsed.workers) {
    for (const key of ["id", "label", "hermesBaseURL", "matlabBaseURL"]) {
      if (!String(worker?.[key] || "").trim()) {
        throw new Error(`Every production worker profile must define ${key}.`);
      }
    }
    if (ids.has(worker.id)) throw new Error(`Duplicate production worker id: ${worker.id}`);
    ids.add(worker.id);
    for (const key of ["hermesBaseURL", "matlabBaseURL"]) {
      validateRemoteUrl(key, worker[key]);
    }
  }
  if (!ids.has(value("UNIT_TEST_DEFAULT_WORKER_ID"))) {
    throw new Error("UNIT_TEST_DEFAULT_WORKER_ID must match one configured worker.");
  }
}

function validateRemoteUrl(label, candidate) {
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  if (/WINDOWS_|LINUX_|example\.invalid/i.test(url.hostname)) {
    throw new Error(`${label} still contains a placeholder hostname.`);
  }
}

function validateBindAddress(key) {
  const address = value(key);
  if (/WINDOWS_|LINUX_|example\.invalid/i.test(address)) {
    throw new Error(`${key} still contains a placeholder address.`);
  }
  if (address === "0.0.0.0" || address === "::") {
    if (value("SDG_ALLOW_WILDCARD_BIND") !== "1") {
      throw new Error(`${key} cannot use a wildcard address without SDG_ALLOW_WILDCARD_BIND=1.`);
    }
    return;
  }
  if (!isIP(address)) {
    throw new Error(`${key} must be an explicit IPv4 or IPv6 address.`);
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
    throw new Error("Docker CLI is unavailable on PATH.");
  }
  if (result.status !== 0) {
    const detail = options.capture
      ? String(result.stderr || result.stdout || "").trim()
      : "";
    throw new Error(detail || `docker ${args.join(" ")} failed with exit code ${result.status}.`);
  }
  return String(result.stdout || "").trim();
}

function validateCompose() {
  runDocker([...composeArgs, "config", "--quiet"], { capture: true });
}

function validateDockerRuntime() {
  const server = runDocker(
    ["info", "--format", "{{.OSType}}/{{.Architecture}}"],
    { capture: true }
  ).toLowerCase();
  if (!["linux/amd64", "linux/x86_64"].includes(server)) {
    throw new Error(`Production requires a linux/amd64 Docker server; found ${server || "unknown"}.`);
  }
  runDocker(["compose", "version"], { capture: true });
  for (const key of targetConfig.imageKeys) {
    const inspected = JSON.parse(
      runDocker(["image", "inspect", value(key), "--format", "{{json .}}"], { capture: true })
    );
    if (inspected.Os !== "linux" || !["amd64", "x86_64"].includes(inspected.Architecture)) {
      throw new Error(`${key} is not a linux/amd64 image.`);
    }
  }
}

function resolveDirectory(key) {
  const configured = value(key);
  const resolved = path.resolve(configured);
  if (resolved === path.parse(resolved).root) {
    throw new Error(`${key} cannot target a filesystem root.`);
  }
  return resolved;
}

function prepareDirectories() {
  const keys = target === "windows-worker"
    ? [
        "SDG_CONTAINER_DATA_DIR",
        "MATLAB_GATEWAY_STATE_DIR",
        "SDG_PROJECT_ADDONS_DIR",
        "SDG_WORKER_LOG_DIR"
      ]
    : [];
  if (target === "windows-worker" && process.platform === "win32") {
    prepareApprovedWindowsDirectories(
      keys.map((key) => ({ value: value(key), category: key }))
    );
  } else {
    for (const key of keys) fs.mkdirSync(resolveDirectory(key), { recursive: true });
  }
  if (target === "windows-worker") {
    const addonRoot = resolveDirectory("SDG_PROJECT_ADDONS_DIR");
    const projects = value("UNIT_TEST_CASE_DEFAULT_PROJECTS")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const projectAddonIds = projects.map((project) => {
      const match = project.match(/^(\d{2,})(?:_|$)/);
      if (!match) {
        throw new Error(
          `UNIT_TEST_CASE_DEFAULT_PROJECTS entry must begin with a numeric project ID: ${project}.`
        );
      }
      return match[1];
    });
    const missing = projectAddonIds.filter(
      (projectId) => !fs.existsSync(path.join(addonRoot, projectId))
    );
    if (missing.length) {
      throw new Error(`Project addon directories are missing: ${missing.join(", ")}.`);
    }
  }
}

function validateLinuxPersistentDirectories() {
  if (target !== "linux-platform") return;
  const image = value("SDG_PLATFORM_IMAGE");
  const containerUid = Number.parseInt(
    runDocker(
      [
        "run", "--rm", "--pull", "never", "--network", "none", "--read-only",
        "--entrypoint", "/usr/bin/id", image, "-u", "node"
      ],
      { capture: true }
    ),
    10
  );
  const containerGid = Number.parseInt(
    runDocker(
      [
        "run", "--rm", "--pull", "never", "--network", "none", "--read-only",
        "--entrypoint", "/usr/bin/id", image, "-g", "node"
      ],
      { capture: true }
    ),
    10
  );
  if (!Number.isInteger(containerUid) || !Number.isInteger(containerGid)) {
    throw new Error("Unable to resolve the Platform container node UID/GID.");
  }
  for (const key of [
    "SDG_CONTAINER_DATA_DIR",
    "SDG_PLATFORM_SKILLS_DIR",
    "SDG_PLATFORM_LOG_DIR",
    "SDG_PLATFORM_HOME_DIR"
  ]) {
    const directory = resolveDirectory(key);
    const metadata = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${key} must reference an existing non-symlink production directory.`);
    }
    const mode = metadata.mode & 0o777;
    const writable =
      (metadata.uid === containerUid && Boolean(mode & 0o200)) ||
      (metadata.gid === containerGid && Boolean(mode & 0o020)) ||
      Boolean(mode & 0o002);
    if (!writable) {
      throw new Error(
        `${key} is not writable by the Platform container identity without changing production permissions.`
      );
    }
    runDocker(
      [
        "run", "--rm", "--pull", "never", "--network", "none", "--read-only",
        "--mount", `type=bind,source=${directory},target=/probe,readonly`,
        "--entrypoint", "/usr/bin/test", image, "-d", "/probe"
      ],
      { capture: true }
    );
  }
}

async function waitForHealthyService() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const containerId = runDocker(
      [...composeArgs, "ps", "--quiet", targetConfig.service],
      { capture: true }
    );
    if (containerId) {
      const state = JSON.parse(
        runDocker(
          ["inspect", containerId, "--format", "{{json .State}}"],
          { capture: true }
        )
      );
      if (state?.Status === "running" && state?.Health?.Status === "healthy") return;
      if (state?.Status === "exited" || state?.Health?.Status === "unhealthy") {
        throw new Error(`${targetConfig.service} entered ${state?.Health?.Status || state?.Status}.`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${targetConfig.service} did not become healthy within 120 seconds.`);
}

function verifyWorkerGateway() {
  const script = [
    "(async()=>{",
    "const hermesToken=process.env.HERMES_AUTH_TOKEN;",
    "const protectedProbe=await fetch('http://127.0.0.1:3101/internal/tcsd-pipeline/jobs/__deployment_readiness__',{headers:{Authorization:`Bearer ${hermesToken}`}});",
    "if(protectedProbe.status!==404)throw new Error('hermes-auth');",
    "const base=process.env.MATLAB_MCP_BASE_URL;",
    "const token=process.env.MATLAB_MCP_AUTH_TOKEN;",
    "const evaluateToken=process.env.MATLAB_GATEWAY_EVALUATE_TOKEN;",
    "const health=await fetch(new URL('/health',base));",
    "if(!health.ok||!(await health.json()).ok)throw new Error('health');",
    "const version=await fetch(new URL('/version',base),{headers:{Authorization:`Bearer ${token}`}});",
    "if(!version.ok||!(await version.json()).gatewayVersion)throw new Error('version');",
    "const capabilities=await fetch(new URL('/capabilities',base),{headers:{Authorization:`Bearer ${token}`}});",
    "if(!capabilities.ok||!(await capabilities.json()).operations?.includes('evaluate_matlab_code'))throw new Error('capabilities');",
    "const suffix=`${Date.now()}-${Math.random().toString(16).slice(2)}`;",
    "const workspaceId=`deploy-ready-${suffix}`;",
    "const assetId='probe';",
    "const jobId=`deploy-ready-${suffix}`;",
    "const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};",
    "try{",
    "let response=await fetch(new URL(`/api/workspaces/${workspaceId}`,base),{method:'PUT',headers,body:JSON.stringify({mappingId:process.env.SATK_GATEWAY_MAPPING_ID})});",
    "if(!response.ok)throw new Error('workspace');",
    "response=await fetch(new URL(`/api/workspaces/${workspaceId}/assets/${assetId}/text`,base),{method:'PUT',headers,body:JSON.stringify({fileName:'deployment_readiness.m',content:'value = 1 + 1; disp(value);'})});",
    "if(!response.ok)throw new Error('asset');",
    "response=await fetch(new URL(`/api/jobs/${jobId}`,base),{method:'POST',headers:{...headers,'x-sdg-evaluate-token':evaluateToken,'x-sdg-gateway-caller':'tcsd-runtime'},body:JSON.stringify({workspaceId,operation:'evaluate_matlab_code',inputAssetId:assetId,timeoutMs:120000})});",
    "if(!response.ok)throw new Error('evaluate-auth');",
    "let status='queued';",
    "for(let attempt=0;attempt<60&&!['succeeded','failed','cancelled','timed_out'].includes(status);attempt++){",
    "await new Promise(resolve=>setTimeout(resolve,1000));",
    "response=await fetch(new URL(`/api/jobs/${jobId}?workspaceId=${workspaceId}`,base),{headers});",
    "if(!response.ok)throw new Error('evaluate-poll');",
    "status=(await response.json()).status;",
    "}",
    "if(status!=='succeeded')throw new Error(`evaluate-${status}`);",
    "}finally{await fetch(new URL(`/api/workspaces/${workspaceId}`,base),{method:'DELETE',headers}).catch(()=>{});}",
    "console.log('Worker authentication and MATLAB evaluate readiness verified.');",
    "})().catch((error)=>{console.error(`production readiness failed: ${error.message}`);process.exit(1)})"
  ].join("");
  runDocker([
    ...composeArgs,
    "exec",
    "--no-TTY",
    "worker",
    "node",
    "-e",
    script
  ]);
}

function verifyPlatformRoutes() {
  const script = [
    "(async()=>{",
    "const wiki=await fetch('http://127.0.0.1:3001/health');",
    "if(!wiki.ok||!(await wiki.json()).ok)throw new Error('wiki');",
    "const profiles=JSON.parse(process.env.UNIT_TEST_WORKER_PROFILES_JSON).workers;",
    "const gatewayToken=process.env.MATLAB_MCP_AUTH_TOKEN;",
    "const hermesToken=process.env.HERMES_AUTH_TOKEN;",
    "for(const profile of profiles){",
    "const hermes=await fetch(new URL('/api/health',profile.hermesBaseURL));",
    "if(!hermes.ok||!(await hermes.json()).ok)throw new Error(`hermes:${profile.id}`);",
    "const protectedProbe=await fetch(new URL('/internal/tcsd-pipeline/jobs/__deployment_readiness__',profile.hermesBaseURL),{headers:{Authorization:`Bearer ${hermesToken}`}});",
    "if(protectedProbe.status!==404)throw new Error(`hermes-auth:${profile.id}`);",
    "const matlab=await fetch(new URL('/health',profile.matlabBaseURL));",
    "if(!matlab.ok||!(await matlab.json()).ok)throw new Error(`matlab:${profile.id}`);",
    "const version=await fetch(new URL('/version',profile.matlabBaseURL),{headers:{Authorization:`Bearer ${gatewayToken}`}});",
    "if(!version.ok||!(await version.json()).gatewayVersion)throw new Error(`matlab-version:${profile.id}`);",
    "}",
    "console.log('Platform routes to all Windows workers verified.');",
    "})().catch((error)=>{console.error(`production route verification failed: ${error.message}`);process.exit(1)})"
  ].join("");
  runDocker([
    ...composeArgs,
    "exec",
    "--no-TTY",
    "platform",
    "node",
    "-e",
    script
  ]);
}

async function main() {
  validateConfiguration();
  validateCompose();
  if (action === "config") {
    console.log(`${target} production configuration passed.`);
    return;
  }
  if (action === "status") {
    runDocker([...composeArgs, "ps"]);
    return;
  }
  if (action === "down") {
    runDocker([...composeArgs, "down", "--remove-orphans"]);
    return;
  }
  validateDockerRuntime();
  prepareDirectories();
  validateLinuxPersistentDirectories();
  if (action === "preflight") {
    console.log(`${target} production preflight passed.`);
    return;
  }
  if (action === "up") {
    runDocker([
      ...composeArgs,
      "up",
      "--detach",
      "--no-build",
      "--no-deps",
      targetConfig.service
    ]);
  }
  await waitForHealthyService();
  if (target === "windows-worker") verifyWorkerGateway();
  else verifyPlatformRoutes();
  console.log(`${target} production runtime verification passed.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
