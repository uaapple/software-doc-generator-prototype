import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.argv[2] || path.join(projectRoot, "release-dist", "windows-worker-source"));

const appPaths = [
  ".env.defaults",
  "package.json",
  "package-lock.json",
  "src",
  "scripts",
  "tools",
  "templates",
  "skills",
  "public",
  "docs"
];

function shouldCopy(sourcePath) {
  const normalized = sourcePath.replace(/\\/g, "/");
  const name = path.basename(sourcePath).toLowerCase();
  if (
    normalized.includes("/.git/") ||
    normalized.includes("/release-dist/") ||
    normalized.includes("/node_modules/") ||
    normalized.includes("/offline-installers/") ||
    normalized.includes("/data/") ||
    normalized.includes("/tmp/") ||
    normalized.includes("/.local/")
  ) {
    return false;
  }
  if ([".env", ".ds_store"].includes(name)) {
    return false;
  }
  if (name.includes(".tmp-") || name.endsWith(".tmp")) {
    return false;
  }
  return ![".zip", ".msi", ".exe"].includes(path.extname(name));
}

function copyPath(relativePath, destinationRoot) {
  const source = path.join(projectRoot, relativePath);
  if (!fs.existsSync(source)) {
    return;
  }
  fs.cpSync(source, path.join(destinationRoot, relativePath), {
    recursive: true,
    force: true,
    filter: shouldCopy
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout || ""}${result.stderr || ""}`.trim() : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }
  return options.capture ? String(result.stdout || "").trim() : "";
}

function gitValue(args) {
  try {
    return run("git", args, { capture: true });
  } catch {
    return "";
  }
}

function zipDirectory(sourceDir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${path.join(sourceDir, "*").replaceAll("'", "''")}' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`
  ]);
}

function writeText(filePath, lines) {
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

fs.mkdirSync(outputDir, { recursive: true });
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "software-doc-windows-worker-source-"));
const bundleRoot = path.join(tmpRoot, "software-doc-windows-worker-source");
const appRoot = path.join(bundleRoot, "app");

try {
  fs.mkdirSync(appRoot, { recursive: true });

  for (const relativePath of appPaths) {
    copyPath(relativePath, appRoot);
  }

  fs.copyFileSync(
    path.join(projectRoot, "scripts", "update-windows-worker-source.ps1"),
    path.join(bundleRoot, "Update-WindowsWorkerSource.ps1")
  );

  const branch = gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = gitValue(["rev-parse", "HEAD"]);
  const builtAt = new Date().toISOString();

  writeText(path.join(bundleRoot, "manifest.json"), [
    "{",
    `  "packageName": "software-doc-windows-worker-source",`,
    `  "releaseBranch": ${JSON.stringify(branch)},`,
    `  "commitSha": ${JSON.stringify(commit)},`,
    `  "buildTime": ${JSON.stringify(builtAt)},`,
    `  "runtimeDataPolicy": "Preserve C:\\\\SoftwareDocWorker runtime data, node_modules, env file, and local binaries."`,
    "}"
  ]);

  writeText(path.join(bundleRoot, "README.txt"), [
    "Software Doc Windows worker source update package",
    "",
    "Copy this zip to the Windows VM, expand it, then run from an elevated PowerShell:",
    "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Update-WindowsWorkerSource.ps1",
    "",
    "Default install directory:",
    "C:\\SoftwareDocWorker",
    "",
    "This source update preserves:",
    "- C:\\SoftwareDocWorker\\software-doc-worker.env",
    "- C:\\SoftwareDocWorker\\app\\data",
    "- C:\\SoftwareDocWorker\\app\\node_modules when package-lock.json is unchanged",
    "- C:\\SoftwareDocWorker\\app\\tools\\matlab-mcp-core-server.exe",
    "",
    "Use the full software-doc-windows-worker.zip bundle only for first install or prerequisite refresh."
  ]);

  const zipPath = path.join(outputDir, "software-doc-windows-worker-source.zip");
  zipDirectory(bundleRoot, zipPath);
  console.log("Windows worker source update bundle created:");
  console.log(zipPath);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
