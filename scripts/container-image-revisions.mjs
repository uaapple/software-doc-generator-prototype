#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const imageInputs = {
  platform: [
    "docker/platform.Containerfile",
    "docker/platform-entrypoint.mjs",
    "docker/platform-healthcheck.mjs",
    "package.json",
    "package-lock.json",
    "src",
    "public",
    "wiki",
    "templates",
    "skills/active",
    "skills/bundles",
    "skills/examples",
    "skills/domain-knowledge.json",
    "skills/requirement_extraction.md",
    "skills/requirement_validation.md",
    "skills/requirement_writing.md"
  ],
  worker: [
    "containers/worker/Containerfile",
    "containers/worker/configure-hermes.py",
    "containers/worker/dsh-entrypoint.sh",
    "containers/worker/dsh-headless-tcsd.mjs",
    "containers/worker/headless-production-preset.patch.yml",
    "containers/worker/tcsd-gateway-transport",
    "containers/worker/THIRD_PARTY_NOTICES.md",
    "containers/worker/dsh-MIT.txt",
    "package.json",
    "package-lock.json",
    "requirements/container-worker.txt",
    "src",
    "public/skill-kind-matrix.js",
    "scripts/prepare-worker-source.mjs",
    "templates",
    "presets/unit-test-case-generation-production",
    "skills/hermes/tcsd-runtime/scripts",
    "skills/hermes/tcsd-runtime/references",
    "skills/hermes/tcsd-runtime/assets/templates/tcsd_template.xlsx",
    "skills/hermes/tcsd-stage-01-validate-inputs",
    "skills/hermes/tcsd-stage-02-check-environment",
    "skills/hermes/tcsd-stage-03-initialize-workspace",
    "skills/hermes/tcsd-stage-04-extract-interface",
    "skills/hermes/tcsd-stage-05-analyze-coverage",
    "skills/hermes/tcsd-stage-06-validate-state-probes",
    "skills/hermes/tcsd-stage-07-build-initial-cases",
    "skills/hermes/tcsd-stage-08-simulate-backfill",
    "skills/hermes/tcsd-stage-09-collect-coverage",
    "skills/hermes/tcsd-stage-10-repair-coverage",
    "skills/hermes/tcsd-stage-11-final-validation",
    "skills/hermes/tcsd-stage-12-package-cleanup",
    "skills/hermes/software-detail-runtime",
    "skills/hermes/software-detail-stage-01-initialize",
    "skills/hermes/software-detail-stage-02-model-plan",
    "skills/hermes/software-detail-stage-03-evidence-extract",
    "skills/hermes/software-detail-stage-04-output-ledger",
    "skills/hermes/software-detail-stage-05-boundary-projection",
    "skills/hermes/software-detail-stage-06-architecture-draft",
    "skills/hermes/software-detail-stage-07-module-draft",
    "skills/hermes/software-detail-stage-08-content-check",
    "skills/hermes/software-detail-stage-09-docx-finalize"
  ]
};

export function calculateImageRevision(name, { cwd = rootDir, treeish = "HEAD" } = {}) {
  const inputs = imageInputs[name];
  if (!inputs) throw new Error(`Unknown container image: ${name}`);
  const result = spawnSync(
    "git",
    ["ls-tree", "-r", "--full-tree", treeish, "--", ...inputs],
    { cwd, encoding: "utf8" }
  );
  if (result.error?.code === "ENOENT") throw new Error("git is unavailable on PATH.");
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || "").trim() || "git ls-tree failed.");
  }
  const treeListing = String(result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .sort()
    .join("\n");
  if (!treeListing) throw new Error(`No tracked image inputs found for ${name}.`);
  return `sha256:${createHash("sha256").update(`${treeListing}\n`).digest("hex")}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const revisions = Object.fromEntries(
    Object.keys(imageInputs).map((name) => [name, calculateImageRevision(name)])
  );
  process.stdout.write(`${JSON.stringify(revisions, null, 2)}\n`);
}
