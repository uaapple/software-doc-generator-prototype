#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const explicitFilesArgument = process.argv.indexOf("--files");
const tracked = explicitFilesArgument >= 0
  ? String(process.argv[explicitFilesArgument + 1] || "").split(",").map((value) => value.trim()).filter(Boolean)
  : execFileSync("git", ["ls-files", "-z"], { cwd: rootDir })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
const findings = [];
const assignmentPattern = /^\s*(?:export\s+)?([A-Z0-9_]*(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET|PASSWORD|LICENSE_KEY))\s*[:=]\s*(.*)\s*$/i;
const jsonSecretKeyPattern = /^(?:api[_-]?key|auth[_-]?token|access[_-]?token|secret|password|license[_-]?key)$/i;
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
  const absolutePath = path.resolve(rootDir, relativePath);
  let content;
  try {
    const buffer = fs.readFileSync(absolutePath);
    if (buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    continue;
  }
  if (relativePath.toLowerCase().endsWith(".json")) {
    try {
      scanJson(JSON.parse(content), relativePath);
    } catch {
      // Invalid JSON is still inspected by the line-oriented assignment scan.
    }
  }
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match = line.match(assignmentPattern);
    if (!match) continue;
    const value = match[2].trim().replace(/[;,]\s*$/, "");
    if (
      isSafeValue(value)
    ) continue;
    findings.push({ kind: "assignment", file: relativePath, line: index + 1, key: match[1] });
  }
}

if (findings.length) {
  for (const finding of findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    console.error(`SECRET-LIKE ${finding.kind.toUpperCase()}: ${location} key=${finding.key}`);
  }
  process.exitCode = 1;
} else {
  console.log("Tracked secret assignment scan passed.");
}

function isSafeValue(value) {
  const normalized = String(value ?? "").trim();
  return (
    safeValues.has(normalized.toLowerCase()) ||
    normalized.startsWith("${") ||
    normalized.startsWith("process.env.") ||
    isRuntimeSecretReference(normalized) ||
    (normalized.startsWith("<") && normalized.endsWith(">"))
  );
}

function isRuntimeSecretReference(value) {
  return /^(?:(?:values|process\.env)\.[A-Z0-9_]+)(?:\s*\|\|\s*(?:(?:values|process\.env)\.[A-Z0-9_]+))*$/i.test(
    value
  );
}

function scanJson(value, relativePath, pointer = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanJson(entry, relativePath, `${pointer}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const childPointer = `${pointer}.${key}`;
    if (jsonSecretKeyPattern.test(key) && !isSafeValue(entry)) {
      findings.push({ kind: "json", file: relativePath, key: childPointer });
    }
    scanJson(entry, relativePath, childPointer);
  }
}
