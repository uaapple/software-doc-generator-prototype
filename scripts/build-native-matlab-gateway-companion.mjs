#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { calculateImageRevision } from "./container-image-revisions.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "release-dist", "native-gateway");
const config = JSON.parse(
  fs.readFileSync(path.join(rootDir, "deploy", "native-matlab-gateway-companion.json"), "utf8")
);
const revision = git(["rev-parse", "HEAD"]);
const shortRevision = revision.slice(0, 12);
const trackedChanges = git(["status", "--porcelain", "--untracked-files=no"]);
if (trackedChanges) {
  throw new Error("Native Gateway companion release requires a clean tracked worktree.");
}

const imageRevisions = {
  platform: calculateImageRevision("platform", { cwd: rootDir }),
  worker: calculateImageRevision("worker", { cwd: rootDir })
};
for (const [name, expected] of Object.entries(config.expectedImageRevisions)) {
  if (imageRevisions[name] !== expected) {
    throw new Error(
      `${name} image inputs changed (${imageRevisions[name]}); companion-only release cannot rebuild or replace images.`
    );
  }
}

run(process.execPath, ["scripts/check-container-secrets.mjs"]);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-native-gateway-release-"));
const packageRoot = path.join(temporaryRoot, "package");
const payloadRoot = path.join(packageRoot, "payload");
const assetPrefix = `native-matlab-gateway-companion-v8-${shortRevision}`;
const scanName = `${assetPrefix}.scan.json`;
const manifestName = `${assetPrefix}.manifest.json`;
const assetName = `${assetPrefix}.zip`;

try {
  fs.mkdirSync(payloadRoot, { recursive: true });
  const files = [];
  const scanFiles = [];
  for (const entry of config.managedFiles) {
    assertSafeRelativePath(entry.source, "source");
    assertSafeRelativePath(entry.target, "target");
    const content = gitBuffer(["show", `${revision}:${entry.source}`]);
    scanContent(entry.source, content);
    const destination = path.join(payloadRoot, entry.target);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
    const evidence = {
      source: entry.source,
      target: entry.target.replaceAll("\\", "/"),
      sha256: sha256(content),
      sizeBytes: content.length
    };
    files.push(evidence);
    scanFiles.push({ path: entry.source, sha256: evidence.sha256, sizeBytes: content.length });
  }

  const deploySource = gitBuffer([
    "show",
    `${revision}:scripts/deploy-native-matlab-gateway.ps1`
  ]);
  scanContent("scripts/deploy-native-matlab-gateway.ps1", deploySource);
  fs.writeFileSync(
    path.join(packageRoot, "deploy-native-matlab-gateway.ps1"),
    deploySource
  );
  const toolFiles = [{
    source: "scripts/deploy-native-matlab-gateway.ps1",
    packagePath: "deploy-native-matlab-gateway.ps1",
    sha256: sha256(deploySource),
    sizeBytes: deploySource.length
  }];
  scanFiles.push({
    path: toolFiles[0].source,
    sha256: toolFiles[0].sha256,
    sizeBytes: toolFiles[0].sizeBytes
  });

  const validationFiles = [];
  for (const entry of config.validationFiles || []) {
    assertSafeRelativePath(entry.source, "validation source");
    assertSafeRelativePath(entry.packagePath, "validation package path");
    const content = gitBuffer(["show", `${revision}:${entry.source}`]);
    scanContent(entry.source, content);
    const validationDestination = path.join(packageRoot, entry.packagePath);
    fs.mkdirSync(path.dirname(validationDestination), { recursive: true });
    fs.writeFileSync(validationDestination, content);
    const evidence = {
      source: entry.source,
      packagePath: entry.packagePath,
      sha256: sha256(content),
      sizeBytes: content.length,
      runtime: entry.runtime,
      readOnly: entry.readOnly
    };
    validationFiles.push(evidence);
    scanFiles.push({
      path: evidence.source,
      sha256: evidence.sha256,
      sizeBytes: evidence.sizeBytes
    });
  }

  const scan = {
    schema: "sdg-native-matlab-gateway-companion-scan/v8",
    companionVersion: config.companionVersion,
    sourceRevision: revision,
    status: "passed",
    policies: {
      trackedSecretGate: "passed",
      secretAssignmentMatches: 0,
      privateKeyMatches: 0,
      forbiddenRuntimeFiles: 0,
      dependencyChanges: false
    },
    files: scanFiles.sort((left, right) => left.path.localeCompare(right.path))
  };
  const scanBytes = jsonBytes(scan);
  fs.writeFileSync(path.join(packageRoot, scanName), scanBytes);

  const manifest = {
    schema: "sdg-native-matlab-gateway-companion/v8",
    companionVersion: config.companionVersion,
    sourceRevision: revision,
    deploymentToolRevision: revision,
    legacyGatewayRevision: config.legacyGatewayRevision,
    serviceName: config.serviceName,
    installRoot: config.installRoot,
    nativeEnv: config.nativeEnv,
    imageRevisions: {
      ...imageRevisions,
      rootfsInputsChanged: false
    },
    containerImages: {
      action: "reuse",
      buildPerformed: false,
      pushPerformed: false,
      registryReferencesSource: "previous-approved-container-release-manifest"
    },
    runtimeDependencies: {
      productionBuildRequired: false,
      npmInstallRequired: false,
      reusedPackages: ["express", "multer"]
    },
    files,
    toolFiles,
    validationFiles,
    scan: {
      file: scanName,
      sha256: sha256(scanBytes),
      status: "passed"
    }
  };
  const manifestBytes = jsonBytes(manifest);
  fs.writeFileSync(path.join(packageRoot, manifestName), manifestBytes);

  fs.mkdirSync(outputDir, { recursive: true });
  const externalManifest = path.join(outputDir, manifestName);
  const externalScan = path.join(outputDir, scanName);
  fs.copyFileSync(path.join(packageRoot, manifestName), externalManifest);
  fs.copyFileSync(path.join(packageRoot, scanName), externalScan);
  const assetPath = path.join(outputDir, assetName);
  run("zip", ["-X", "-q", "-r", assetPath, "."], { cwd: packageRoot });

  const release = {
    schema: "sdg-native-matlab-gateway-companion-release/v8",
    companionVersion: config.companionVersion,
    sourceRevision: revision,
    deploymentToolRevision: revision,
    asset: {
      file: assetName,
      sha256: sha256(fs.readFileSync(assetPath)),
      sizeBytes: fs.statSync(assetPath).size
    },
    manifest: {
      file: manifestName,
      sha256: sha256(manifestBytes)
    },
    scan: {
      file: scanName,
      sha256: sha256(scanBytes),
      status: "passed"
    },
    contents: {
      managedGatewayFileCount: files.length,
      deploymentToolFileCount: toolFiles.length,
      validationFileCount: validationFiles.length
    },
    imageRevisions: manifest.imageRevisions,
    containerImages: manifest.containerImages
  };
  const releasePath = path.join(
    outputDir,
    `${assetPrefix}.release.json`
  );
  fs.writeFileSync(releasePath, jsonBytes(release));
  process.stdout.write(`${releasePath}\n`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

function scanContent(fileName, content) {
  const normalized = fileName.replaceAll("\\", "/");
  if (
    /(^|\/)(?:data|input|output|runtime|addon|logs?)(?:\/|$)/iu.test(normalized) ||
    /\.(?:env|mat|slx|sldd|xlsx|db|sqlite)$/iu.test(normalized)
  ) {
    throw new Error(`Forbidden runtime/local file in companion: ${fileName}`);
  }
  const text = content.toString("utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(text)) {
    throw new Error(`Private key material detected in companion source: ${fileName}`);
  }
  if (
    /\b(?:api[_-]?key|token|password|secret)\b\s*[:=]\s*["'][A-Za-z0-9+/=_-]{16,}["']/iu.test(
      text
    )
  ) {
    throw new Error(`Populated secret assignment detected in companion source: ${fileName}`);
  }
}

function assertSafeRelativePath(value, label) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`Companion ${label} must be a safe relative path: ${value}`);
  }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(args) {
  return run("git", args, { capture: true });
}

function gitBuffer(args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: null });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || "git failed"));
  }
  return Buffer.from(result.stdout);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error?.code === "ENOENT") throw new Error(`${command} is unavailable on PATH.`);
  if (result.status !== 0) {
    throw new Error(
      options.capture
        ? String(result.stderr || result.stdout || "").trim()
        : `${command} failed with exit code ${result.status}.`
    );
  }
  return options.capture ? String(result.stdout || "").trim() : "";
}
