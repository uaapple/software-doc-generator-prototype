#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const options = parseOptions(process.argv.slice(2));
const sourceRoot = requireDirectory(options.source, "source");
const archivePath = requireOutputPath(options.archive, "archive");
const manifestPath = requireOutputPath(options.manifest, "manifest");
const sourceRevision = requireGitSha(options["source-revision"]);
const projectIds = parseProjectIds(options.projects);
validateSourceLayout(sourceRoot);

for (const outputPath of [archivePath, manifestPath]) {
  if (fs.existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite existing addon release asset: ${outputPath}`);
  }
}

const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-project-addons-"));
try {
  const stagingAddonsRoot = path.join(stagingRoot, "project-addons");
  fs.mkdirSync(stagingAddonsRoot, { recursive: true });
  const projects = {};
  for (const projectId of projectIds) {
    const sourceProjectRoot = path.join(sourceRoot, projectId);
    const files = scanProject(sourceProjectRoot, projectId);
    const stagingProjectRoot = path.join(stagingAddonsRoot, projectId);
    for (const file of files) {
      const sourcePath = path.join(sourceProjectRoot, ...file.path.split("/"));
      const destinationPath = path.join(stagingProjectRoot, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
      fs.chmodSync(destinationPath, 0o640);
    }
    projects[projectId] = summarizeProject(files);
  }

  const manifest = {
    schema: "sdg-project-addon-release/v1",
    generatedAt: new Date().toISOString(),
    sourceGitRevision: sourceRevision,
    projectIds,
    projects
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, manifestText, { encoding: "utf8", mode: 0o644, flag: "wx" });
  fs.writeFileSync(path.join(stagingRoot, "project-addons-manifest.json"), manifestText, {
    encoding: "utf8",
    mode: 0o644,
    flag: "wx"
  });
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  run("zip", ["-q", "-X", "-r", archivePath, "project-addons", "project-addons-manifest.json"], {
    cwd: stagingRoot
  });
  console.log(`PROJECT_ADDON_ARCHIVE=${archivePath}`);
  console.log(`PROJECT_ADDON_MANIFEST=${manifestPath}`);
  console.log(`PROJECT_ADDON_PROJECTS=${projectIds.join(",")}`);
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}

function parseOptions(argumentsList) {
  const parsed = {};
  for (const argument of argumentsList) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function requireDirectory(candidate, name) {
  if (!candidate) throw new Error(`--${name} is required.`);
  const resolved = path.resolve(candidate);
  const metadata = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`--${name} must reference an existing non-symlink directory.`);
  }
  return resolved;
}

function requireOutputPath(candidate, name) {
  if (!candidate) throw new Error(`--${name} is required.`);
  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) throw new Error(`--${name} cannot target a filesystem root.`);
  return resolved;
}

function requireGitSha(candidate) {
  if (!/^[a-f0-9]{40}$/.test(String(candidate || ""))) {
    throw new Error("--source-revision must be an exact 40-character Git SHA.");
  }
  return candidate;
}

function parseProjectIds(candidate) {
  const ids = String(candidate || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!ids.length || ids.some((id) => !/^\d{2,}$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("--projects must contain unique numeric project IDs such as 01,02.");
  }
  return ids.sort();
}

function validateSourceLayout(sourceRoot) {
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const entryPath = path.join(sourceRoot, entry.name);
    const metadata = fs.lstatSync(entryPath);
    if (!/^\d{2,}$/.test(entry.name) || !metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(
        `Addon source root may contain only project-specific numeric directories such as 01,02: ${entry.name}`
      );
    }
  }
}

function scanProject(projectRoot, projectId) {
  const metadata = fs.lstatSync(projectRoot, { throwIfNoEntry: false });
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Project addon source is missing or invalid: ${projectId}`);
  }
  const files = [];
  walk(projectRoot, "", files);
  if (!files.length) throw new Error(`Project addon source is empty: ${projectId}`);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function walk(directory, prefix, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    const metadata = fs.lstatSync(absolutePath);
    if (metadata.isSymbolicLink()) throw new Error(`Project addon packages cannot contain symlinks: ${relativePath}`);
    if (metadata.isDirectory()) walk(absolutePath, relativePath, files);
    else if (metadata.isFile()) {
      files.push({ path: relativePath, size: metadata.size, sha256: sha256File(absolutePath) });
    } else throw new Error(`Unsupported project addon entry: ${relativePath}`);
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
  return { fileCount: files.length, totalBytes, treeSha256: digest.digest("hex"), files };
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error?.code === "ENOENT") throw new Error(`${command} is unavailable on PATH.`);
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "").trim());
}
