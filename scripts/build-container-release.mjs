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
const outputDir = path.join(rootDir, "release-dist", "container");
const deploymentToolRevision = run("git", ["rev-parse", "HEAD"], { capture: true });
const shortDeploymentRevision = deploymentToolRevision.slice(0, 12);
const pushToRegistry = process.argv.includes("--push");
if (process.argv.includes("--offline")) {
  throw new Error(
    "Full-image offline archives are not regular Release assets. " +
      "After an exact GHCR pull is proven unavailable, use " +
      "npm run container:archive:on-demand -- --image=<platform|worker> " +
      "--reference=<repository@sha256> --revision=<sha256>."
  );
}
const registryNamespace = String(
  process.env.SDG_CONTAINER_REGISTRY_NAMESPACE || "ghcr.io/uaapple"
).replace(/\/+$/, "");
const imageDefinitions = {
  platform: {
    containerfile: "docker/platform.Containerfile",
    repository: `${registryNamespace}/software-doc-generator-platform`
  },
  worker: {
    containerfile: "containers/worker/Containerfile",
    repository: `${registryNamespace}/software-doc-generator-worker`
  }
};
for (const [name, definition] of Object.entries(imageDefinitions)) {
  definition.imageRevision = calculateImageRevision(name, { cwd: rootDir });
  definition.version = `img-${definition.imageRevision.slice(7, 19)}`;
  definition.tag = `${definition.repository}:${definition.version}`;
}
const buildContextRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-container-release-"));
const buildContextArchive = path.join(buildContextRoot, "source.tar");
const buildContext = path.join(buildContextRoot, "source");

const trackedChanges = run(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { capture: true }
);
if (trackedChanges) {
  throw new Error(
    "Container release builds require a clean tracked worktree so image contents match their image revisions."
  );
}

try {
  run(process.execPath, ["scripts/check-platform-container.mjs"]);
  run(process.execPath, ["tests/container-config-tests.mjs"]);
  run(process.execPath, ["tests/container-production-config-tests.mjs"]);
  run(process.execPath, ["tests/tcsd-remote-transfer-tests.mjs"]);
  run(process.execPath, ["tests/container-worker-static-tests.mjs"]);
  run(process.execPath, ["tests/software-detail-worker-components-tests.mjs"]);
  run(process.execPath, ["tests/software-detail-worker-pipeline-tests.mjs"]);
  run(process.execPath, ["tests/software-detail-worker-api-tests.mjs"]);
  run(process.execPath, ["tests/software-detail-pipeline-transport-client-tests.mjs"]);
  run(process.execPath, ["tests/software-module-description-transport-regression.mjs"]);
  run(process.execPath, ["scripts/check-container-boundaries.mjs"]);
  run(process.execPath, ["scripts/check-container-secrets.mjs"]);

  fs.mkdirSync(buildContext);
  run("git", ["archive", "--format=tar", "--output", buildContextArchive, "HEAD"]);
  run("tar", ["-xf", buildContextArchive, "-C", buildContext]);

  buildImage(imageDefinitions.platform);
  buildImage(imageDefinitions.worker);

  run(process.execPath, ["scripts/container-scan.mjs"], {
    env: {
      ...process.env,
      SDG_PLATFORM_IMAGE: imageDefinitions.platform.tag,
      SDG_WORKER_IMAGE: imageDefinitions.worker.tag
    }
  });
  requireReleaseScans();

  fs.mkdirSync(outputDir, { recursive: true });
  const images = {};
  for (const [name, definition] of Object.entries(imageDefinitions)) {
    const { tag, imageRevision, repository, version } = definition;
    const inspected = JSON.parse(
      run("docker", ["image", "inspect", tag, "--format", "{{json .}}"], { capture: true })
    );
    if (inspected.Os !== "linux" || inspected.Architecture !== "amd64") {
      throw new Error(`${tag} is not linux/amd64.`);
    }
    if (inspected.Config?.Labels?.["org.opencontainers.image.revision"] !== imageRevision) {
      throw new Error(`${tag} does not record its exact image input revision.`);
    }
    images[name] = {
      tag,
      repository,
      version,
      imageRevision,
      imageId: inspected.Id,
      os: inspected.Os,
      architecture: inspected.Architecture
    };
    if (pushToRegistry) {
      run("docker", ["push", tag]);
      const digest = inspectRegistryDigest(tag);
      images[name].registryDigest = digest;
      images[name].registryReference = `${repository}@${digest}`;
    }
  }

  const manifest = {
    schema: "sdg-container-release/v3",
    generatedAt: new Date().toISOString(),
    deploymentToolRevision,
    distribution: {
      primary: "ghcr-exact-digest",
      registryPublished: pushToRegistry,
      offlineImageArchives: "on-demand-only",
      githubReleaseFullImageTarRequired: false
    },
    images,
    scans: await collectScanEvidence()
  };
  const manifestPath = path.join(
    outputDir,
    `container-release-${shortDeploymentRevision}.json`
  );
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(manifestPath);
} finally {
  fs.rmSync(buildContextRoot, { recursive: true, force: true });
}

async function collectScanEvidence() {
  const scanRoot = path.join(outputDir, "scans");
  const summaryFile = "scan-summary.json";
  const summary = JSON.parse(fs.readFileSync(path.join(scanRoot, summaryFile), "utf8"));
  const files = new Set([summaryFile]);
  for (const result of summary.results || []) {
    if (result.outputFile) files.add(result.outputFile);
    if (result.policyFile) files.add(result.policyFile);
  }
  const evidence = {};
  for (const fileName of [...files].sort()) {
    const absolutePath = path.join(scanRoot, fileName);
    if (fs.existsSync(absolutePath)) evidence[fileName] = await sha256File(absolutePath);
  }
  return {
    directory: "scans",
    files: evidence
  };
}

function buildImage({ tag, containerfile, imageRevision, version }) {
  run("docker", [
    "buildx",
    "build",
    "--platform",
    "linux/amd64",
    "--load",
    "--file",
    containerfile,
    "--build-arg",
    `IMAGE_REVISION=${imageRevision}`,
    "--build-arg",
    `IMAGE_VERSION=${version}`,
    "--tag",
    tag,
    buildContext
  ], { cwd: buildContext });
}

function inspectRegistryDigest(tag) {
  const output = run(
    "docker",
    ["buildx", "imagetools", "inspect", tag],
    { capture: true }
  );
  const digest = output.match(/^Digest:\s*(sha256:[a-f0-9]{64})$/mi)?.[1];
  if (!digest) throw new Error(`Unable to resolve immutable registry digest for ${tag}.`);
  return digest;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: options.env || process.env,
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

function requireReleaseScans() {
  const summaryPath = path.join(outputDir, "scans", "scan-summary.json");
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  for (const command of ["syft", "trivy"]) {
    const results = (summary.results || []).filter((item) => item.command === command);
    if (results.length !== 2 || results.some((item) => item.status !== 0)) {
      throw new Error(
        `Container release requires successful ${command} evidence for both images.`
      );
    }
  }
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}
