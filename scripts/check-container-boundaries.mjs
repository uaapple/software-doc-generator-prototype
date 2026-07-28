#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requirePattern(content, pattern, message) {
  if (!pattern.test(content)) failures.push(message);
}

function forbidPattern(content, pattern, message) {
  if (pattern.test(content)) failures.push(message);
}

const dockerignore = read(".dockerignore");
for (const required of [
  ".git",
  ".env",
  "data",
  "input",
  "output",
  "release-dist",
  ".local",
  "test-fixtures",
  "skills/hermes/**/assets/support-package"
]) {
  requirePattern(dockerignore, new RegExp(`^${required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"), `.dockerignore must exclude ${required}`);
}

const envExample = read(".env.container.example");
forbidPattern(
  envExample,
  /(?:API_KEY|AUTH_TOKEN|PASSWORD|SECRET)[ \t]*=[ \t]*[^\s#][^\r\n]*/i,
  ".env.container.example contains a non-empty secret-like value"
);

for (const containerfile of ["docker/platform.Containerfile", "containers/worker/Containerfile"]) {
  const content = read(containerfile);
  forbidPattern(content, /^\s*COPY\s+(?:--[^\s]+\s+)*\.\s+/mi, `${containerfile} must not use COPY .`);
  forbidPattern(content, /\.env(?:\.defaults)?/i, `${containerfile} must not copy environment files`);
  forbidPattern(content, /assets\/support-package/i, `${containerfile} must not copy project support packages`);
  forbidPattern(content, /(?:\/Users\/|[A-Za-z]:\\\\)/, `${containerfile} contains a host absolute path`);
  requirePattern(content, /\bUSER\b/, `${containerfile} must run as a non-root user`);
}

const compose = read("compose.yaml");
requirePattern(compose, /platform:\s*linux\/amd64/g, "all container services must select linux/amd64");
requirePattern(compose, /read_only:\s*true/g, "compose services must use a read-only root filesystem");
requirePattern(compose, /no-new-privileges:true/g, "compose services must enable no-new-privileges");
forbidPattern(compose, /MATLAB_ROOT|SATK_MATLAB_ROOT|SIMULINK_AGENTIC_TOOLKIT_ROOT/, "containers must not configure host MATLAB/SATK roots");

for (const productionComposePath of [
  "compose.windows-docker-desktop.yaml",
  "compose.linux-prod.yaml"
]) {
  const productionCompose = read(productionComposePath);
  requirePattern(
    productionCompose,
    /platform:\s*linux\/amd64/g,
    `${productionComposePath} must select linux/amd64`
  );
  requirePattern(
    productionCompose,
    /read_only:\s*true/g,
    `${productionComposePath} must use a read-only root filesystem`
  );
  requirePattern(
    productionCompose,
    /no-new-privileges:true/g,
    `${productionComposePath} must enable no-new-privileges`
  );
  forbidPattern(
    productionCompose,
    /^\s+build:/m,
    `${productionComposePath} must use prebuilt immutable images`
  );
}

const nativeGatewayConfig = JSON.parse(
  read("deploy/native-matlab-gateway-companion.json") || "{}"
);
if (
  nativeGatewayConfig.schema !== "sdg-native-matlab-gateway-companion-config/v4" ||
  nativeGatewayConfig.companionVersion !== 4 ||
  nativeGatewayConfig.serviceName !== "SoftwareDocMatlabWorker" ||
  !Array.isArray(nativeGatewayConfig.managedFiles) ||
  nativeGatewayConfig.managedFiles.length !== 6 ||
  !Array.isArray(nativeGatewayConfig.validationFiles) ||
  nativeGatewayConfig.validationFiles.length !== 1
) {
  failures.push("native MATLAB Gateway companion config is incomplete");
} else {
  for (const entry of nativeGatewayConfig.managedFiles) {
    for (const [label, candidate] of Object.entries({
      source: String(entry?.source || ""),
      target: String(entry?.target || "")
    })) {
      const normalized = candidate.replaceAll("\\", "/");
      if (
        !normalized ||
        normalized.startsWith("/") ||
        normalized.split("/").includes("..") ||
        /(^|\/)(?:data|input|output|runtime|addon|logs?)(?:\/|$)/i.test(normalized) ||
        /\.(?:env|mat|slx|sldd|xlsx|db|sqlite)$/i.test(normalized)
      ) {
        failures.push(`native Gateway ${label} is not release-safe: ${candidate}`);
      }
    }
  }
  const validation = nativeGatewayConfig.validationFiles[0];
  if (
    validation.source !== "tests/native-gateway-companion-ps51.Tests.ps1" ||
    validation.packagePath !== "test-native-matlab-gateway-companion-ps51.ps1" ||
    validation.runtime !== "powershell.exe-5.1" ||
    validation.readOnly !== true
  ) {
    failures.push("native Gateway companion validation asset boundary is invalid");
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Container boundary checks passed.");
}
