#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "release-dist", "container");
const allowMissingImages = process.argv.includes("--allow-missing-images");

function exec(command, args) {
  return execFileSync(command, args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function treeHash(relativeRoot, include = () => true) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(absoluteRoot, absolute).replaceAll(path.sep, "/");
        if (include(relative)) files.push(absolute);
      }
    }
  };
  walk(absoluteRoot);
  const digest = createHash("sha256");
  for (const absolute of files.sort()) {
    const relative = path.relative(absoluteRoot, absolute).replaceAll(path.sep, "/");
    digest.update(relative);
    digest.update("\0");
    digest.update(fs.readFileSync(absolute));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function isPackagedTcsdRuntimeFile(relativePath) {
  return (
    relativePath.startsWith("scripts/") ||
    relativePath.startsWith("references/") ||
    relativePath === "assets/templates/tcsd_template.xlsx"
  );
}

function isPackagedTcsdStageFile(relativePath) {
  return /^tcsd-stage-(?:0[1-9]|1[0-2])-[^/]+\//.test(relativePath);
}

function imageMetadata(reference) {
  try {
    const raw = exec("docker", ["image", "inspect", reference, "--format", "{{json .}}"]);
    const inspected = JSON.parse(raw);
    return {
      reference,
      id: inspected.Id || "",
      repoDigests: inspected.RepoDigests || [],
      architecture: inspected.Architecture || "",
      os: inspected.Os || ""
    };
  } catch (error) {
    if (!allowMissingImages) throw error;
    return { reference, unavailable: true, reason: "image not present or Docker unavailable" };
  }
}

const envExample = fs.readFileSync(path.join(rootDir, ".env.container.example"), "utf8");
const env = Object.fromEntries(
  envExample.split(/\r?\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  })
);

const manifest = {
  schema: "sdg-oci-release-manifest/v1",
  generatedAt: new Date().toISOString(),
  source: {
    gitSha: exec("git", ["rev-parse", "HEAD"]),
    gitDescribe: exec("git", ["describe", "--always", "--dirty"]),
    packageLockSha256: fileHash(path.join(rootDir, "package-lock.json"))
  },
  target: { os: "linux", architecture: "amd64" },
  runtime: {
    node: "22.22.3",
    python: "3.11.9",
    hermesAgent: "0.18.2",
    pythonPackages: {
      PyYAML: "6.0.3",
      openpyxl: "3.1.5",
      et_xmlfile: "2.0.0"
    }
  },
  baseImages: {
    node: env.SDG_NODE_IMAGE || "",
    python: env.SDG_PYTHON_IMAGE || ""
  },
  skills: {
    tcsdRuntimeSha256: treeHash("skills/hermes/tcsd-runtime", isPackagedTcsdRuntimeFile),
    tcsdStagesSha256: treeHash("skills/hermes", isPackagedTcsdStageFile)
  },
  images: {
    platform: imageMetadata(process.env.SDG_PLATFORM_IMAGE || env.SDG_PLATFORM_IMAGE || "sdg-platform:mac-dev"),
    worker: imageMetadata(process.env.SDG_WORKER_IMAGE || env.SDG_WORKER_IMAGE || "sdg-hermes-worker:mac-dev")
  },
  verification: {
    sbom: "not-recorded",
    licenses: "not-recorded",
    vulnerabilities: "not-recorded"
  }
};

fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "oci-release-manifest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(outputPath);
