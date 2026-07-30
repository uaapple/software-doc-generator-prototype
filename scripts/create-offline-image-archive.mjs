#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
const image = requireChoice(options.image, "image", ["platform", "worker"]);
const reference = requireExactReference(options.reference);
const revision = requireDigest(options.revision, "revision");
const output = path.resolve(
  options.output ||
    path.join(
      process.cwd(),
      `${image}-${revision.slice(7, 19)}-linux-amd64.tar`
    )
);

if (fs.existsSync(output)) {
  throw new Error(`Refusing to overwrite existing archive: ${output}`);
}
fs.mkdirSync(path.dirname(output), { recursive: true });

run("docker", ["pull", "--platform", "linux/amd64", reference]);
const inspected = JSON.parse(
  run("docker", ["image", "inspect", reference, "--format", "{{json .}}"], {
    capture: true
  })
);
if (inspected.Os !== "linux" || inspected.Architecture !== "amd64") {
  throw new Error(`${reference} is not linux/amd64.`);
}
if (inspected.Config?.Labels?.["org.opencontainers.image.revision"] !== revision) {
  throw new Error(`${reference} does not record expected OCI revision ${revision}.`);
}

run("docker", ["save", "--output", output, reference]);
const archiveSha256 = await sha256File(output);
const verification = JSON.parse(
  run(
    "python3",
    [
      "scripts/verify_image_archive.py",
      output,
      "--expect-archive-sha256",
      archiveSha256,
      "--expect-images",
      "1",
      "--expect-os",
      "linux",
      "--expect-architecture",
      "amd64",
      "--expect-revision",
      revision
    ],
    { capture: true }
  )
);
if (verification.status !== "passed" || verification.imageCount !== 1) {
  throw new Error("Archive verifier did not return one passed image.");
}

const evidence = {
  schema: "sdg-on-demand-image-archive/v1",
  generatedAt: new Date().toISOString(),
  distributionPolicy: "on-demand-only-after-exact-ghcr-pull-failure",
  image,
  registryReference: reference,
  registryIndexDigest: reference.slice(reference.lastIndexOf("@") + 1),
  imageRevision: revision,
  os: "linux",
  architecture: "amd64",
  archive: path.basename(output),
  archiveSha256,
  archiveSizeBytes: fs.statSync(output).size,
  sourceLocalImageId: inspected.Id,
  archiveConfigImageId: verification.images[0].configImageId,
  layerDigests: verification.images[0].layerDigests,
  ociTopLevelDigests: verification.ociTopLevelDigests,
  releaseAsset: false
};
const evidencePath = `${output}.manifest.json`;
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(evidencePath);

function parseOptions(argumentsList) {
  const parsed = {};
  for (const argument of argumentsList) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    parsed[match[1]] = match[2];
  }
  return parsed;
}

function requireChoice(value, name, choices) {
  if (!choices.includes(value)) {
    throw new Error(`--${name} must be one of: ${choices.join(", ")}.`);
  }
  return value;
}

function requireDigest(value, name) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new Error(`--${name} must be an exact sha256 digest.`);
  }
  return value;
}

function requireExactReference(value) {
  const candidate = String(value || "");
  if (
    !/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+@sha256:[a-f0-9]{64}$/.test(candidate)
  ) {
    throw new Error("--reference must be an exact private GHCR repository@sha256 reference.");
  }
  return candidate;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error?.code === "ENOENT") throw new Error(`${command} is unavailable on PATH.`);
  if (result.status !== 0) {
    const detail = options.capture
      ? String(result.stderr || result.stdout || "").trim()
      : "";
    throw new Error(detail || `${command} failed with exit code ${result.status}.`);
  }
  return options.capture ? String(result.stdout || "").trim() : "";
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}
