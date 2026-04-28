import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseBranch = process.env.RELEASE_BRANCH || "release/windows-prod";
const outputDir = path.resolve(process.argv[2] || path.join(projectRoot, "release-dist"));
const skipChecks = process.env.SKIP_RELEASE_CHECKS === "1";

const archivePaths = [
  ".env.defaults",
  "README.md",
  "package.json",
  "package-lock.json",
  "src",
  "public",
  "wiki",
  "skills",
  "scripts",
  "templates",
  "docs"
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    stdio: options.capture ? "pipe" : "inherit",
    shell: false,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout || ""}${result.stderr || ""}`.trim() : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }

  return options.capture ? String(result.stdout || "").trim() : "";
}

function git(args, options = {}) {
  return run("git", args, options);
}

function npm(args) {
  run(process.platform === "win32" ? "npm.cmd" : "npm", args);
}

function assertCleanWorktree() {
  const status = git(["status", "--porcelain=v1"], { capture: true });
  if (status) {
    throw new Error(`Refusing to build a production release from a dirty worktree.\n${status}`);
  }
}

function appendManifest(zipPath, manifestRoot) {
  if (process.platform === "win32") {
    const manifestPath = path.join(manifestRoot, "release", "manifest.json").replaceAll("'", "''");
    const destinationPath = zipPath.replaceAll("'", "''");
    run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
        `$zip = [System.IO.Compression.ZipFile]::Open('${destinationPath}', 'Update');`,
        "try {",
        `  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${manifestPath}', 'release/manifest.json') | Out-Null;`,
        "} finally {",
        "  $zip.Dispose();",
        "}"
      ].join(" ")
    ]);
    return;
  }

  run("zip", ["-q", "-r", zipPath, "release/manifest.json"], { cwd: manifestRoot });
}

function copyIfExists(source, destination) {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, destination);
  }
}

const currentBranch = git(["branch", "--show-current"], { capture: true });
if (currentBranch !== releaseBranch) {
  throw new Error(`Refusing to build a production release from '${currentBranch}'. Switch to '${releaseBranch}' first.`);
}

assertCleanWorktree();

if (!skipChecks) {
  npm(["test"]);
  npm(["run", "check:wiki"]);
  npm(["run", "check:encoding"]);
}

const shortSha = git(["rev-parse", "--short=12", "HEAD"], { capture: true });
const commitSha = git(["rev-parse", "HEAD"], { capture: true });
const commitTime = git(["log", "-1", "--format=%cI"], { capture: true });
const buildTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const timestamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .replace(/\.\d{3}Z$/, "")
  .replace(/^(\d{8})(\d{6})$/, "$1-$2");
const packageName = `software-doc-generator-${timestamp}-${shortSha}`;

fs.mkdirSync(outputDir, { recursive: true });
const outputZip = path.join(outputDir, `${packageName}.zip`);
const tmpZip = path.join(outputDir, `.${packageName}.tmp.zip`);
const manifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "software-doc-release-"));

try {
  fs.rmSync(tmpZip, { force: true });
  fs.rmSync(outputZip, { force: true });

  git(["archive", "--format=zip", `--output=${tmpZip}`, "HEAD", "--", ...archivePaths]);

  const releaseDir = path.join(manifestRoot, "release");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(releaseDir, "manifest.json"),
    `${JSON.stringify(
      {
        packageName,
        releaseBranch,
        commitSha,
        commitTime,
        buildTime,
        runtimeDataPolicy: "APP_DATA_DIR and APP_SKILLS_DIR are external to the release package."
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  appendManifest(tmpZip, manifestRoot);
  fs.renameSync(tmpZip, outputZip);
  fs.copyFileSync(outputZip, path.join(outputDir, "latest.zip"));
  copyIfExists(path.join(projectRoot, "scripts", "deploy-release.ps1"), path.join(outputDir, "deploy-release.ps1"));
  copyIfExists(
    path.join(projectRoot, "scripts", "install-windows-services.ps1"),
    path.join(outputDir, "install-windows-services.ps1")
  );

  console.log("Release package created:");
  console.log(outputZip);
  console.log("Latest package alias:");
  console.log(path.join(outputDir, "latest.zip"));
} finally {
  fs.rmSync(manifestRoot, { recursive: true, force: true });
  fs.rmSync(tmpZip, { force: true });
}
