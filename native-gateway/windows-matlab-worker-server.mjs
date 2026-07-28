import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installRoot = path.dirname(appRoot);
const envFile = path.resolve(
  String(
    process.env.SOFTWARE_DOC_WORKER_ENV_FILE ||
    path.join(installRoot, "software-doc-worker.env")
  )
);

try {
  loadEnvFile(envFile);
  configureNativeGatewayEnvironment();

  if (process.argv.includes("--wrapper-config-preflight-only")) {
    const { createConfiguredWorkspaceMapping } = await import(
      "./services/matlab-gateway-contract.js"
    );
    createConfiguredWorkspaceMapping({
      id: process.env.MATLAB_GATEWAY_MAPPING_ID,
      virtualRoot: process.env.MATLAB_GATEWAY_CONTAINER_ROOT,
      hostRoot: process.env.MATLAB_GATEWAY_HOST_ROOT
    });
    fs.mkdirSync(
      path.join(process.env.MATLAB_GATEWAY_STATE_DIR, "workspaces"),
      { recursive: true }
    );
    console.log("Native MATLAB Gateway wrapper configuration preflight passed.");
  } else {
    await import("./matlab-worker-server-runtime.js");
  }
} catch (error) {
  const rawCategory = String(error?.code || "");
  const category = /^[A-Z0-9_]{1,80}$/u.test(rawCategory)
    ? rawCategory
    : "WRAPPER_STARTUP_FAILED";
  console.error(`Native MATLAB Gateway wrapper startup failed [${category}].`);
  process.exitCode = 1;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Native MATLAB Gateway environment file is missing.");
  }
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || key in process.env) continue;
    process.env[key] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/u, "$2");
  }
}

function configureNativeGatewayEnvironment() {
  deriveEquivalent(
    "MATLAB_GATEWAY_HOST_ROOT",
    "SDG_CONTAINER_DATA_DIR",
    normalizeWindowsPath
  );
  deriveEquivalent(
    "MATLAB_GATEWAY_MAPPING_ID",
    "SATK_GATEWAY_MAPPING_ID",
    (value) => String(value || "").trim().toLowerCase()
  );
  if (!String(process.env.MATLAB_GATEWAY_CONTAINER_ROOT || "").trim()) {
    throw configurationError(
      "CONTAINER_ROOT_REQUIRED",
      "The container workspace root is not configured."
    );
  }
  if (process.env.MATLAB_GATEWAY_CONTAINER_ROOT !== "/var/lib/sdg/data") {
    throw configurationError(
      "CONTAINER_ROOT_CONFLICT",
      "The container workspace root does not match the approved Worker data bind."
    );
  }
  if (process.env.MATLAB_GATEWAY_MAPPING_ID !== "worker-data") {
    throw configurationError(
      "MAPPING_ID_CONFLICT",
      "The Gateway mapping ID does not match the approved Worker mapping."
    );
  }

  assertWindowsDirectory("MATLAB_GATEWAY_HOST_ROOT", "HOST_ROOT");
  assertWindowsDirectory("MATLAB_GATEWAY_STATE_DIR", "STATE_DIR");
  assertWindowsDirectory("MATLAB_ROOT", "MATLAB_ROOT");
  assertWindowsDirectory("MATLAB_MCP_TMPDIR", "MCP_TMPDIR");
  assertWindowsFile("MATLAB_MCP_SERVER_COMMAND", "MCP_COMMAND");

  const sessionMode = String(
    process.env.SATK_MATLAB_SESSION_MODE || "new"
  ).trim().toLowerCase();
  if (sessionMode !== "new") {
    throw configurationError(
      "SESSION_MODE_CONFLICT",
      "Windows native Gateway requires a new MATLAB session."
    );
  }
  process.env.SATK_MATLAB_SESSION_MODE = "new";

  if (!String(process.env.MATLAB_MCP_SERVER_ARGS_JSON || "").trim()) {
    assertWindowsDirectory(
      "SIMULINK_AGENTIC_TOOLKIT_ROOT",
      "TOOLKIT_ROOT"
    );
    const toolsFile = path.join(
      process.env.SIMULINK_AGENTIC_TOOLKIT_ROOT,
      "tools",
      "tools.json"
    );
    if (!fs.statSync(toolsFile, { throwIfNoEntry: false })?.isFile()) {
      throw configurationError(
        "TOOLKIT_TOOLS_REQUIRED",
        "The configured Simulink Agentic Toolkit tools file is missing."
      );
    }
  }
  process.env.MATLAB_GATEWAY_MCP_PREFLIGHT =
    process.env.MATLAB_GATEWAY_MCP_PREFLIGHT || "1";
}

function deriveEquivalent(targetKey, sourceKey, normalize) {
  const target = String(process.env[targetKey] || "").trim();
  const source = String(process.env[sourceKey] || "").trim();
  if (!source) {
    throw configurationError(
      `${sourceKey}_REQUIRED`,
      `Required native Gateway source setting ${sourceKey} is missing.`
    );
  }
  if (target && normalize(target) !== normalize(source)) {
    throw configurationError(
      `${targetKey}_CONFLICT`,
      `Native Gateway setting ${targetKey} conflicts with ${sourceKey}.`
    );
  }
  process.env[targetKey] = source;
}

function assertWindowsDirectory(key, categoryPrefix) {
  const value = String(process.env[key] || "").trim();
  if (!isFullyQualifiedWindowsPath(value)) {
    throw configurationError(
      `${categoryPrefix}_ABSOLUTE_REQUIRED`,
      `${key} must be an absolute Windows path.`
    );
  }
  const normalized = normalizeWindowsPath(value);
  if (normalized === path.win32.parse(normalized).root.toLowerCase()) {
    throw configurationError(
      `${categoryPrefix}_ROOT_FORBIDDEN`,
      `${key} cannot target a drive root.`
    );
  }
  if (!fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) {
    throw configurationError(
      `${categoryPrefix}_DIRECTORY_REQUIRED`,
      `${key} must identify an existing directory.`
    );
  }
}

function assertWindowsFile(key, categoryPrefix) {
  const value = String(process.env[key] || "").trim();
  if (!isFullyQualifiedWindowsPath(value)) {
    throw configurationError(
      `${categoryPrefix}_ABSOLUTE_REQUIRED`,
      `${key} must be an absolute Windows file path.`
    );
  }
  if (!fs.statSync(value, { throwIfNoEntry: false })?.isFile()) {
    throw configurationError(
      `${categoryPrefix}_FILE_REQUIRED`,
      `${key} must identify an existing file.`
    );
  }
}

function normalizeWindowsPath(value) {
  return path.win32.resolve(String(value || "").trim()).toLowerCase();
}

function isFullyQualifiedWindowsPath(value) {
  return (
    /^[A-Za-z]:\\/u.test(value) ||
    /^\\\\[^\\]+\\[^\\]+(?:\\|$)/u.test(value)
  );
}

function configurationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
