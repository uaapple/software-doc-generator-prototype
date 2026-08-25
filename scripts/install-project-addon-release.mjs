#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const { options, flags } = parseArguments(process.argv.slice(2));
const manifestPath = requireFile(options.manifest, "manifest");
const targetRoot = requireTarget(options.target);
const expectedProjectIds = options.projects ? parseProjectIds(options.projects) : null;
const manifest = readManifest(manifestPath, expectedProjectIds);

if (flags.has("verify-only")) {
  verifyAddonRoot(targetRoot, manifest);
  console.log(`PROJECT_ADDON_VERIFICATION=passed projects=${manifest.projectIds.join(",")}`);
  process.exit(0);
}

const archivePath = requireFile(options.archive, "archive");
const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-addon-install-"));
try {
  validateArchiveEntries(archivePath);
  run("tar", ["-xf", archivePath, "-C", extractionRoot]);
  const embeddedManifestPath = path.join(extractionRoot, "project-addons-manifest.json");
  if (!fs.existsSync(embeddedManifestPath)) throw new Error("Addon archive is missing project-addons-manifest.json.");
  if (!fs.readFileSync(embeddedManifestPath).equals(fs.readFileSync(manifestPath))) {
    throw new Error("Addon archive manifest does not match the separately verified manifest asset.");
  }
  const extractedAddonsRoot = path.join(extractionRoot, "project-addons");
  verifyAddonRoot(extractedAddonsRoot, manifest);
  installProjects(extractedAddonsRoot, targetRoot, manifest, flags.has("replace"));
  writeInstalledManifest(targetRoot, fs.readFileSync(manifestPath));
  verifyAddonRoot(targetRoot, manifest);
  console.log(`PROJECT_ADDON_INSTALL=passed projects=${manifest.projectIds.join(",")}`);
} finally {
  fs.rmSync(extractionRoot, { recursive: true, force: true });
}

function parseArguments(argumentsList) {
  const options = {};
  const flags = new Set();
  for (const argument of argumentsList) {
    if (argument === "--verify-only" || argument === "--replace") flags.add(argument.slice(2));
    else {
      const match = /^--([a-z-]+)=(.+)$/.exec(argument);
      if (!match) throw new Error(`Unsupported argument: ${argument}`);
      options[match[1]] = match[2];
    }
  }
  return { options, flags };
}

function requireFile(candidate, name) {
  if (!candidate) throw new Error(`--${name} is required.`);
  const resolved = path.resolve(candidate);
  const metadata = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!metadata?.isFile() || metadata.isSymbolicLink()) throw new Error(`--${name} must reference a regular file.`);
  return resolved;
}

function requireTarget(candidate) {
  if (!candidate) throw new Error("--target is required.");
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) throw new Error("--target cannot reference a filesystem root.");
  const metadata = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (metadata?.isSymbolicLink() || (metadata && !metadata.isDirectory())) {
    throw new Error("--target must reference a non-symlink directory.");
  }
  return resolved;
}

function parseProjectIds(candidate) {
  const ids = String(candidate || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!ids.length || ids.some((id) => !/^\d{2,}$/.test(id)) || ids.length !== new Set(ids).size) {
    throw new Error("Project IDs must be unique numeric values such as 01,02.");
  }
  return ids.sort();
}

function readManifest(filePath, expectedProjectIds) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (parsed.schema !== "sdg-project-addon-release/v1") throw new Error("Unsupported project addon manifest schema.");
  const projectIds = parseProjectIds((parsed.projectIds || []).join(","));
  if (expectedProjectIds && JSON.stringify(projectIds) !== JSON.stringify(expectedProjectIds)) {
    throw new Error(`Addon manifest projects do not match expected projects: ${expectedProjectIds.join(",")}.`);
  }
  for (const projectId of projectIds) validateProjectManifest(parsed.projects?.[projectId], projectId);
  return { ...parsed, projectIds };
}

function validateProjectManifest(project, projectId) {
  if (!project || !Array.isArray(project.files) || !project.files.length) {
    throw new Error(`Addon manifest project is empty: ${projectId}`);
  }
  if (project.fileCount !== project.files.length || !Number.isSafeInteger(project.totalBytes) || project.totalBytes < 1) {
    throw new Error(`Addon manifest project summary is invalid: ${projectId}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(project.treeSha256 || ""))) {
    throw new Error(`Addon manifest tree hash is invalid: ${projectId}`);
  }
  const names = new Set();
  for (const file of project.files) {
    if (!isSafeRelativePath(file.path) || names.has(file.path)) throw new Error(`Unsafe or duplicate addon path: ${projectId}/${file.path}`);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(String(file.sha256 || ""))) {
      throw new Error(`Invalid addon file metadata: ${projectId}/${file.path}`);
    }
    names.add(file.path);
  }
}

function validateArchiveEntries(archivePath) {
  const output = run("tar", ["-tf", archivePath], { capture: true });
  const entries = output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error("Project addon archive is empty.");
  for (const entry of entries) {
    const normalized = entry.replace(/\/$/, "");
    if (!isSafeRelativePath(normalized) || !(normalized === "project-addons" || normalized === "project-addons-manifest.json" || normalized.startsWith("project-addons/"))) {
      throw new Error(`Unsafe or unexpected addon archive entry: ${entry}`);
    }
  }
}

function isSafeRelativePath(candidate) {
  const value = String(candidate || "");
  if (!value || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  return !value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function verifyAddonRoot(addonRoot, manifest) {
  const rootMetadata = fs.lstatSync(addonRoot, { throwIfNoEntry: false });
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error(`Project addon root is missing or invalid: ${addonRoot}`);
  for (const projectId of manifest.projectIds) {
    const projectRoot = path.join(addonRoot, projectId);
    const actualFiles = scanProject(projectRoot, projectId);
    const expectedFiles = manifest.projects[projectId].files;
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error(`Project addon content does not match manifest: ${projectId}`);
    }
    const summary = summarizeProject(actualFiles);
    const expected = manifest.projects[projectId];
    if (summary.fileCount !== expected.fileCount || summary.totalBytes !== expected.totalBytes || summary.treeSha256 !== expected.treeSha256) {
      throw new Error(`Project addon summary does not match manifest: ${projectId}`);
    }
  }
}

function scanProject(projectRoot, projectId) {
  const metadata = fs.lstatSync(projectRoot, { throwIfNoEntry: false });
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) throw new Error(`Project addon directory is missing or invalid: ${projectId}`);
  const files = [];
  walk(projectRoot, "", files);
  if (!files.length) throw new Error(`Project addon directory is empty: ${projectId}`);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function walk(directory, prefix, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    const metadata = fs.lstatSync(absolutePath);
    if (metadata.isSymbolicLink()) throw new Error(`Project addon directory cannot contain symlinks: ${relativePath}`);
    if (metadata.isDirectory()) walk(absolutePath, relativePath, files);
    else if (metadata.isFile()) files.push({ path: relativePath, size: metadata.size, sha256: sha256File(absolutePath) });
    else throw new Error(`Unsupported project addon entry: ${relativePath}`);
  }
}

function summarizeProject(files) {
  const digest = createHash("sha256");
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    digest.update(file.path);
    digest.update("\0");
    digest.update(file.sha256);
    digest.update("\0");
  }
  return { fileCount: files.length, totalBytes, treeSha256: digest.digest("hex") };
}

function installProjects(sourceRoot, destinationRoot, manifest, replace) {
  fs.mkdirSync(destinationRoot, { recursive: true, mode: 0o750 });
  const rootMetadata = fs.lstatSync(destinationRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("Project addon target must be a non-symlink directory.");
  const plans = [];
  for (const projectId of manifest.projectIds) {
    const destination = path.join(destinationRoot, projectId);
    if (fs.existsSync(destination)) {
      try {
        verifySingleProject(destination, manifest.projects[projectId], projectId);
        plans.push({ projectId, action: "reuse", destination });
        continue;
      } catch (error) {
        if (!replace) throw new Error(`${error.message} Use --replace to preserve the old directory and install the release version.`);
      }
    }
    plans.push({ projectId, action: fs.existsSync(destination) ? "replace" : "install", destination });
  }
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  for (const plan of plans) {
    if (plan.action === "reuse") continue;
    const stage = path.join(destinationRoot, `.sdg-addon-${plan.projectId}-stage-${process.pid}`);
    if (fs.existsSync(stage)) throw new Error(`Addon staging path already exists: ${stage}`);
    copyTree(path.join(sourceRoot, plan.projectId), stage);
    verifySingleProject(stage, manifest.projects[plan.projectId], plan.projectId);
    let backup = "";
    if (plan.action === "replace") {
      backup = path.join(destinationRoot, `.sdg-addon-${plan.projectId}-backup-${timestamp}`);
      if (fs.existsSync(backup)) throw new Error(`Addon backup path already exists: ${backup}`);
      fs.renameSync(plan.destination, backup);
    }
    try {
      fs.renameSync(stage, plan.destination);
    } catch (error) {
      if (backup && !fs.existsSync(plan.destination)) fs.renameSync(backup, plan.destination);
      throw error;
    }
  }
}

function verifySingleProject(projectRoot, expected, projectId) {
  const files = scanProject(projectRoot, projectId);
  if (JSON.stringify(files) !== JSON.stringify(expected.files)) throw new Error(`Existing project addon differs from release manifest: ${projectId}.`);
  const summary = summarizeProject(files);
  if (summary.treeSha256 !== expected.treeSha256) throw new Error(`Existing project addon tree hash differs: ${projectId}.`);
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true, mode: 0o750 });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath);
    else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
      fs.chmodSync(destinationPath, 0o640);
    } else throw new Error(`Unsupported addon entry during install: ${sourcePath}`);
  }
}

function writeInstalledManifest(target, content) {
  const destination = path.join(target, ".sdg-project-addons-manifest.json");
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, { mode: 0o640, flag: "wx" });
  if (!fs.existsSync(destination)) {
    fs.renameSync(temporary, destination);
    return;
  }
  if (fs.readFileSync(destination).equals(content)) {
    fs.rmSync(temporary);
    return;
  }
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const backup = `${destination}.backup-${timestamp}`;
  fs.renameSync(destination, backup);
  try {
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (!fs.existsSync(destination)) fs.renameSync(backup, destination);
    throw error;
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  if (result.error?.code === "ENOENT") throw new Error(`${command} is unavailable on PATH.`);
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "").trim());
  return options.capture ? String(result.stdout || "").trim() : "";
}
