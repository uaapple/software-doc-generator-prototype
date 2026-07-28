#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "release-dist", "container");
const sourceCommit = run("git", ["rev-parse", "HEAD"], { capture: true });
const shortCommit = sourceCommit.slice(0, 12);
const buildCreated = new Date().toISOString();
const version = process.env.SDG_CONTAINER_RELEASE_VERSION || `git-${shortCommit}`;
const platformTag = `sdg-platform:${version}`;
const workerTag = `sdg-hermes-worker:${version}`;
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
    "Container release builds require a clean tracked worktree so image contents match SOURCE_COMMIT."
  );
}

try {
  run(process.execPath, ["tests/container-config-tests.mjs"]);
  run(process.execPath, ["tests/container-production-config-tests.mjs"]);
  run(process.execPath, ["tests/tcsd-remote-transfer-tests.mjs"]);
  run(process.execPath, ["tests/container-worker-static-tests.mjs"]);
  run(process.execPath, ["scripts/check-container-boundaries.mjs"]);
  run(process.execPath, ["scripts/check-container-secrets.mjs"]);

  fs.mkdirSync(buildContext);
  run("git", ["archive", "--format=tar", "--output", buildContextArchive, "HEAD"]);
  run("tar", ["-xf", buildContextArchive, "-C", buildContext]);

  buildImage({
    tag: platformTag,
    containerfile: "docker/platform.Containerfile"
  });
  buildImage({
    tag: workerTag,
    containerfile: "containers/worker/Containerfile"
  });

  run(process.execPath, ["scripts/container-scan.mjs"], {
    env: {
      ...process.env,
      SDG_PLATFORM_IMAGE: platformTag,
      SDG_WORKER_IMAGE: workerTag
    }
  });
  requireReleaseScans();

  fs.mkdirSync(outputDir, { recursive: true });
  const images = {};
  for (const [name, tag] of [["platform", platformTag], ["worker", workerTag]]) {
    const inspected = JSON.parse(
      run("docker", ["image", "inspect", tag, "--format", "{{json .}}"], { capture: true })
    );
    if (inspected.Os !== "linux" || inspected.Architecture !== "amd64") {
      throw new Error(`${tag} is not linux/amd64.`);
    }
    if (inspected.Config?.Labels?.["org.opencontainers.image.revision"] !== sourceCommit) {
      throw new Error(`${tag} does not record the exact source commit.`);
    }
    const archive = path.join(outputDir, `${name}-${shortCommit}-linux-amd64.tar`);
    run("docker", ["save", "--output", archive, tag]);
    images[name] = {
      tag,
      imageId: inspected.Id,
      archive: path.basename(archive),
      sha256: await sha256File(archive),
      sizeBytes: fs.statSync(archive).size,
      os: inspected.Os,
      architecture: inspected.Architecture
    };
  }

  const manifest = {
    schema: "sdg-container-offline-release/v1",
    generatedAt: new Date().toISOString(),
    sourceCommit,
    version,
    images,
    scans: await collectScanEvidence()
  };
  const manifestPath = path.join(outputDir, `offline-release-${shortCommit}.json`);
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

function buildImage({ tag, containerfile }) {
  run("docker", [
    "buildx",
    "build",
    "--platform",
    "linux/amd64",
    "--load",
    "--file",
    containerfile,
    "--build-arg",
    `BUILD_CREATED=${buildCreated}`,
    "--build-arg",
    `SOURCE_COMMIT=${sourceCommit}`,
    "--build-arg",
    `IMAGE_VERSION=${version}`,
    "--tag",
    tag,
    buildContext
  ], { cwd: buildContext });
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
