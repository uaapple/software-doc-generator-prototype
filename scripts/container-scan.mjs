#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTrivyPolicy } from "./container-scan-policy.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "release-dist", "container", "scans");
const images = [
  process.env.SDG_PLATFORM_IMAGE || "sdg-platform:mac-dev",
  process.env.SDG_WORKER_IMAGE || "sdg-hermes-worker:mac-dev"
];
const results = [];
const licensePolicy = JSON.parse(
  fs.readFileSync(path.join(rootDir, "deploy", "container-license-policy.json"), "utf8")
);

fs.mkdirSync(outputDir, { recursive: true });

function available(command) {
  return spawnSync(command, ["--version"], { encoding: "utf8", stdio: "ignore" }).status === 0;
}

function run(command, args, outputFile) {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: "utf8" });
  fs.writeFileSync(path.join(outputDir, outputFile), `${result.stdout || ""}${result.stderr || ""}`, "utf8");
  results.push({ command, args, outputFile, status: result.status });
}

function runTrivy(image) {
  const outputFile = `${image.replace(/[^A-Za-z0-9_.-]/g, "_")}.trivy.json`;
  const result = spawnSync(
    "trivy",
    [
      "image",
      "--format",
      "json",
      "--scanners",
      "vuln,license,secret",
      image
    ],
    { cwd: rootDir, encoding: "utf8" }
  );
  fs.writeFileSync(path.join(outputDir, outputFile), result.stdout || "", "utf8");
  if (result.stderr) {
    fs.writeFileSync(path.join(outputDir, `${outputFile}.stderr.log`), result.stderr, "utf8");
  }
  let policyFindings = [];
  try {
    policyFindings = evaluateTrivyPolicy(JSON.parse(result.stdout || "{}"), licensePolicy);
  } catch (error) {
    policyFindings = [{ kind: "invalid-report", detail: error.message }];
  }
  const policyFile = `${outputFile}.policy.json`;
  fs.writeFileSync(
    path.join(outputDir, policyFile),
    `${JSON.stringify({
      schema: "sdg-container-scan-policy-result/v1",
      image,
      passed: result.status === 0 && policyFindings.length === 0,
      findings: policyFindings
    }, null, 2)}\n`,
    "utf8"
  );
  results.push({
    command: "trivy",
    args: ["image", "--format", "json", "--scanners", "vuln,license,secret", image],
    outputFile,
    policyFile,
    status: result.status === 0 && policyFindings.length === 0 ? 0 : 1,
    policyFindingCount: policyFindings.length
  });
}

if (available("syft")) {
  for (const image of images) run("syft", [image, "-o", "spdx-json"], `${image.replace(/[^A-Za-z0-9_.-]/g, "_")}.sbom.spdx.json`);
} else {
  results.push({ command: "syft", status: "not-installed" });
}

if (available("trivy")) {
  for (const image of images) runTrivy(image);
} else {
  results.push({ command: "trivy", status: "not-installed" });
}

if (available("grype")) {
  for (const image of images) run("grype", [image, "-o", "json"], `${image.replace(/[^A-Za-z0-9_.-]/g, "_")}.grype.json`);
} else {
  results.push({ command: "grype", status: "not-installed" });
}

fs.writeFileSync(path.join(outputDir, "scan-summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
const failures = results.filter((result) => typeof result.status === "number" && result.status !== 0);
const missing = results.filter((result) => result.status === "not-installed");
console.log(`scan results: ${results.length - missing.length} executed, ${missing.length} tools unavailable, ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
