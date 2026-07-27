#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: rootDir })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const findings = [];
const assignmentPattern = /^\s*(?:export\s+)?([A-Z0-9_]*(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET|PASSWORD|LICENSE_KEY))\s*[:=]\s*(.*)\s*$/i;
const safeValues = new Set(["", '""', "''", "null", "undefined", "<redacted>", "<placeholder>", "changeme"]);

for (const relativePath of tracked) {
  if (
    relativePath.startsWith("test-fixtures/") ||
    relativePath.startsWith("tests/") ||
    relativePath.endsWith(".lock") ||
    relativePath === "package-lock.json"
  ) {
    continue;
  }
  const absolutePath = path.join(rootDir, relativePath);
  let content;
  try {
    const buffer = fs.readFileSync(absolutePath);
    if (buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    continue;
  }
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match = line.match(assignmentPattern);
    if (!match) continue;
    const value = match[2].trim().replace(/[;,]\s*$/, "");
    if (
      safeValues.has(value.toLowerCase()) ||
      value.startsWith("${") ||
      value.startsWith("process.env.") ||
      (value.startsWith("<") && value.endsWith(">"))
    ) continue;
    findings.push({ file: relativePath, line: index + 1, key: match[1] });
  }
}

if (findings.length) {
  for (const finding of findings) {
    console.error(`SECRET-LIKE ASSIGNMENT: ${finding.file}:${finding.line} key=${finding.key}`);
  }
  process.exitCode = 1;
} else {
  console.log("Tracked secret assignment scan passed.");
}
