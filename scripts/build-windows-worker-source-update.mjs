import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertOfficialSkillConsistency } from "./windows-worker-skill-consistency.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.argv[2] || path.join(projectRoot, "release-dist", "windows-worker-source"));
const offlineSourceRoot = path.join(projectRoot, "offline-installers");
const hermesOfflineInputs = [
  process.env.HERMES_INSTALLER_PATH || "",
  process.env.HERMES_INSTALL_SCRIPT_PATH || "",
  process.env.HERMES_PORTABLE_PATH || ""
];

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
  "docs",
  "requirements"
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

function copyExternalPath(sourcePath, destinationDir) {
  if (!sourcePath) {
    return false;
  }
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Hermes offline asset does not exist: ${sourcePath}`);
  }
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.cpSync(resolved, path.join(destinationDir, path.basename(resolved)), { recursive: true, force: true });
  return true;
}

function copyHermesOfflineAssets(bundleRoot) {
  const destinationDir = path.join(bundleRoot, "offline-installers", "hermes");
  let copied = false;
  const sourceDir = path.join(offlineSourceRoot, "hermes");
  if (fs.existsSync(sourceDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.cpSync(sourceDir, destinationDir, { recursive: true, force: true });
    copied = true;
  }
  for (const input of hermesOfflineInputs) {
    copied = copyExternalPath(input, destinationDir) || copied;
  }
  if (copied) {
    writeText(path.join(destinationDir, "README.txt"), [
      "Hermes CLI assets bundled with this source update.",
      "Update-WindowsWorkerSource.ps1 installs a portable hermes.exe/hermes.cmd/hermes.ps1 from this folder into C:\\SoftwareDocWorker\\runtime\\hermes when HERMES_COMMAND is missing or invalid."
    ]);
  }
  return copied;
}

function copyOfflineFolder(category, bundleRoot) {
  const sourceDir = path.join(offlineSourceRoot, category);
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  const destinationDir = path.join(bundleRoot, "offline-installers", category);
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.cpSync(sourceDir, destinationDir, { recursive: true, force: true });
  return true;
}

function copyOfficialOfflineAssets(bundleRoot) {
  let copied = copyHermesOfflineAssets(bundleRoot);
  for (const category of ["matlab-mcp", "simulink-agentic-toolkit"]) {
    copied = copyOfflineFolder(category, bundleRoot) || copied;
  }
  const manifest = path.join(offlineSourceRoot, "official-dependencies.json");
  if (fs.existsSync(manifest)) {
    const destinationDir = path.join(bundleRoot, "offline-installers");
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.copyFileSync(manifest, path.join(destinationDir, "official-dependencies.json"));
    copied = true;
  }
  return copied;
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

function find7z() {
  for (const exe of ["7z.exe", "7z"]) {
    const result = spawnSync("where.exe", [exe], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0].trim();
    }
  }
  return null;
}

function zipDirectory(sourceDir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  const sevenZip = find7z();
  if (sevenZip) {
    try {
      run(sevenZip, ["a", "-tzip", "-mx=7", zipPath, path.join(sourceDir, "*")]);
      return;
    } catch (error) {
      console.warn(`7z zip failed; falling back to tar.exe: ${error.message}`);
    }
  }
  try {
    run("tar.exe", ["-a", "-cf", zipPath, "-C", sourceDir, "."]);
    return;
  } catch (error) {
    console.warn(`tar.exe zip failed; falling back to Compress-Archive: ${error.message}`);
  }
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    [
      "$ErrorActionPreference='Stop'",
      `Compress-Archive -Path '${path.join(sourceDir, "*").replaceAll("'", "''")}' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`
    ].join("; ")
  ]);
}

function writeText(filePath, lines) {
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

assertOfficialSkillConsistency({
  projectRoot,
  manifestPath: path.join(offlineSourceRoot, "official-dependencies.json")
});
fs.mkdirSync(outputDir, { recursive: true });
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "software-doc-windows-worker-source-"));
const bundleRoot = path.join(tmpRoot, "software-doc-windows-worker-source");
const appRoot = path.join(bundleRoot, "app");

try {
  fs.mkdirSync(appRoot, { recursive: true });

  for (const relativePath of appPaths) {
    copyPath(relativePath, appRoot);
  }
  const bundledOfficialAssets = copyOfficialOfflineAssets(bundleRoot);

  fs.copyFileSync(
    path.join(projectRoot, "scripts", "update-windows-worker-source.ps1"),
    path.join(bundleRoot, "Update-WindowsWorkerSource.ps1")
  );
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "restore-windows-worker-source.ps1"),
    path.join(bundleRoot, "Restore-WindowsWorkerSource.ps1")
  );
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "Deploy-WindowsWorkerSourceUpdate.ps1"),
    path.join(bundleRoot, "Deploy-WindowsWorkerSourceUpdate.ps1")
  );
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "Deploy-WindowsWorkerSourceUpdate.cmd"),
    path.join(bundleRoot, "Deploy-WindowsWorkerSourceUpdate.cmd")
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
    "One-click deployment on the Windows VM:",
    "1. Copy this zip to C:\\temp.",
    "2. Double-click Deploy-WindowsWorkerSourceUpdate.cmd from the same folder, or run the launcher already installed at C:\\SoftwareDocWorker\\Deploy-WindowsWorkerSourceUpdate.cmd.",
    "",
    "The deployer automatically finds the newest software-doc-windows-worker-source*.zip in C:\\temp, expands it, applies the update to C:\\SoftwareDocWorker, restarts worker tasks, and checks health.",
    "Before source replacement it writes and validates a SHA-256 backup manifest. If update fails it automatically invokes the supported restore entrypoint.",
    "",
    "Before building a production source update, run:",
    "npm run windows-worker:sync-official-deps",
    "This refreshes Hermes Agent, MATLAB MCP, Simulink Agentic Toolkit, and the simulink-ut-tcsd-generator skill from their configured upstream GitHub sources.",
    "",
    "Manual fallback:",
    "Copy this zip to the Windows VM, expand it, then run from an elevated PowerShell:",
    "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Update-WindowsWorkerSource.ps1",
    "",
    "Validate or restore a recorded source backup:",
    "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\SoftwareDocWorker\\app\\scripts\\restore-windows-worker-source.ps1 -InstallDir C:\\SoftwareDocWorker -BackupDir C:\\SoftwareDocWorker\\backups\\source-update-YYYYMMDD-HHMMSS -ValidateOnly",
    "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\SoftwareDocWorker\\app\\scripts\\restore-windows-worker-source.ps1 -InstallDir C:\\SoftwareDocWorker -BackupDir C:\\SoftwareDocWorker\\backups\\source-update-YYYYMMDD-HHMMSS",
    "",
    "Default install directory:",
    "C:\\SoftwareDocWorker",
    "",
    "This source update preserves:",
    "- C:\\SoftwareDocWorker\\software-doc-worker.env",
    "- C:\\SoftwareDocWorker\\app\\data",
    "- C:\\SoftwareDocWorker\\app\\node_modules when package-lock.json is unchanged",
    "- C:\\SoftwareDocWorker\\app\\tools\\matlab-mcp-core-server.exe",
    "- C:\\SoftwareDocWorker\\config\\hermes-llm-secrets.env",
    "- C:\\SoftwareDocWorker\\config\\hermes-llm.active.env",
    "",
    bundledOfficialAssets
      ? "This package includes official runtime dependency assets under offline-installers; the deployer will install/update Hermes, MATLAB MCP, SATK, and Hermes skills when a newer bundled version is present."
      : "This package does not include official runtime dependency assets. Run npm run windows-worker:sync-official-deps before building when Hermes, MATLAB MCP, SATK, or Hermes skills must be refreshed.",
    "",
    "Hermes LLM profile switcher:",
    "Double-click after update:",
    "C:\\SoftwareDocWorker\\Switch-HermesLlm.cmd",
    "C:\\SoftwareDocWorker\\Deploy-WindowsWorkerSourceUpdate.cmd",
    "",
    "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\SoftwareDocWorker\\app\\scripts\\Switch-HermesLlmProfile.ps1",
    "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\SoftwareDocWorker\\app\\scripts\\Switch-HermesLlmProfile.ps1 -Action list",
    "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\SoftwareDocWorker\\app\\scripts\\Switch-HermesLlmProfile.ps1 -Action set -ProfileId deepseek-v4-pro",
    "Run the switcher without arguments for the Up/Down interactive menu.",
    "",
    "Use the full software-doc-windows-worker.zip bundle only for first install or prerequisite refresh."
  ]);

  const zipPath = path.join(outputDir, "software-doc-windows-worker-source.zip");
  zipDirectory(bundleRoot, zipPath);
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "Deploy-WindowsWorkerSourceUpdate.ps1"),
    path.join(outputDir, "Deploy-WindowsWorkerSourceUpdate.ps1")
  );
  fs.copyFileSync(
    path.join(projectRoot, "scripts", "Deploy-WindowsWorkerSourceUpdate.cmd"),
    path.join(outputDir, "Deploy-WindowsWorkerSourceUpdate.cmd")
  );
  console.log("Windows worker source update bundle created:");
  console.log(zipPath);
  console.log("One-click deployer created:");
  console.log(path.join(outputDir, "Deploy-WindowsWorkerSourceUpdate.cmd"));
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
