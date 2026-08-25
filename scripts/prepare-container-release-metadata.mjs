#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
const sourcePath = requirePath(options.source, "source");
const outputPath = requirePath(options.output, "output");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const deploymentToolRevision = run("git", ["rev-parse", "HEAD"]);
const containerBuildRevision = requireGitSha(
  options["container-build-revision"],
  "container-build-revision"
);

const images = {};
for (const name of ["platform", "worker"]) {
  const input = source.images?.[name];
  if (!input) throw new Error(`Source manifest is missing ${name}.`);
  requireDigest(input.imageRevision, `${name}.imageRevision`);
  requireExactReference(input.registryReference, `${name}.registryReference`);
  const rollbackRegistryReference = requireExactReference(
    options[`${name}-rollback`],
    `${name}-rollback`
  );
  if (input.os !== "linux" || input.architecture !== "amd64") {
    throw new Error(`${name} must be linux/amd64.`);
  }
  images[name] = {
    tag: input.tag,
    repository: input.repository,
    version: input.version,
    imageRevision: input.imageRevision,
    sourceLocalImageId: input.imageId,
    registryDigest: input.registryDigest,
    registryReference: input.registryReference,
    os: input.os,
    architecture: input.architecture,
    rollbackRegistryReference
  };
}

const projectAddons = requireProjectAddons(source.projectAddons);
prepareProjectAddonAssets(projectAddons, options, outputPath);

const manifest = {
  schema: "sdg-container-release/v4",
  generatedAt: new Date().toISOString(),
  deploymentToolRevision,
  containerBuildRevision,
  distribution: {
    primary: "ghcr-exact-digest",
    offlineImageArchives: "on-demand-only",
    githubReleaseFullImageTarRequired: false
  },
  images,
  projectAddons,
  scans: source.scans
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(outputPath);

function parseOptions(argumentsList) {
  const parsed = {};
  for (const argument of argumentsList) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function requireProjectAddons(candidate) {
  if (candidate?.schema !== "sdg-project-addon-release/v1") {
    throw new Error("Source manifest is missing the project-specific addon release.");
  }
  if (!Array.isArray(candidate.projectIds) || !candidate.projectIds.length) {
    throw new Error("Project addon release must list project IDs.");
  }
  for (const projectId of candidate.projectIds) {
    if (!/^\d{2,}$/.test(String(projectId)) || !candidate.projects?.[projectId]?.fileCount) {
      throw new Error(`Project addon release metadata is invalid: ${projectId}.`);
    }
  }
  for (const key of ["archiveSha256", "manifestSha256"]) {
    if (!/^[a-f0-9]{64}$/.test(String(candidate[key] || ""))) {
      throw new Error(`Project addon release ${key} is invalid.`);
    }
  }
  if (
    !isAssetFileName(candidate.archiveFile, ".zip") ||
    !isAssetFileName(candidate.manifestFile, ".json")
  ) {
    throw new Error("Project addon release asset names are invalid.");
  }
  return candidate;
}

function prepareProjectAddonAssets(candidate, parsedOptions, manifestOutputPath) {
  const inputs = [
    ["project-addon-archive", candidate.archiveFile, candidate.archiveSha256],
    ["project-addon-manifest", candidate.manifestFile, candidate.manifestSha256]
  ];
  const destinationDirectory = path.dirname(manifestOutputPath);
  fs.mkdirSync(destinationDirectory, { recursive: true });
  for (const [optionName, assetFile, expectedSha256] of inputs) {
    const sourceAsset = requireRegularFile(parsedOptions[optionName], optionName);
    const actualSha256 = sha256File(sourceAsset);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`--${optionName} SHA-256 does not match source release metadata.`);
    }
    const destinationAsset = path.join(destinationDirectory, assetFile);
    if (path.resolve(sourceAsset) === path.resolve(destinationAsset)) continue;
    if (fs.existsSync(destinationAsset)) {
      if (sha256File(destinationAsset) !== expectedSha256) {
        throw new Error(`Refusing to overwrite a different project addon asset: ${destinationAsset}`);
      }
      continue;
    }
    fs.copyFileSync(sourceAsset, destinationAsset, fs.constants.COPYFILE_EXCL);
  }
}

function isAssetFileName(candidate, extension) {
  const value = String(candidate || "");
  return value === path.basename(value) && value.endsWith(extension);
}

function requireRegularFile(value, name) {
  if (!value) throw new Error(`--${name} is required.`);
  const resolved = path.resolve(value);
  const metadata = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`--${name} must reference a regular file.`);
  }
  return resolved;
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function requirePath(value, name) {
  if (!value) throw new Error(`--${name} is required.`);
  return path.resolve(value);
}

function requireDigest(value, name) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new Error(`${name} must be an exact sha256 digest.`);
  }
  return value;
}

function requireGitSha(value, name) {
  if (!/^[a-f0-9]{40}$/.test(String(value || ""))) {
    throw new Error(`--${name} must be an exact 40-character Git SHA.`);
  }
  return value;
}

function requireExactReference(value, name) {
  const candidate = String(value || "");
  if (!/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$/.test(candidate)) {
    throw new Error(`${name} must be an exact GHCR repository@sha256 reference.`);
  }
  return candidate;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || "").trim());
  }
  return String(result.stdout || "").trim();
}
