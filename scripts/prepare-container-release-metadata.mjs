#!/usr/bin/env node

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

const manifest = {
  schema: "sdg-container-release/v3",
  generatedAt: new Date().toISOString(),
  deploymentToolRevision,
  containerBuildRevision,
  distribution: {
    primary: "ghcr-exact-digest",
    offlineImageArchives: "on-demand-only",
    githubReleaseFullImageTarRequired: false
  },
  images,
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
