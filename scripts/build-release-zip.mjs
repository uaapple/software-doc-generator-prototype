import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = "windows-prod-full";
const args = parseArgs(process.argv.slice(2));
const target = loadTarget(args.target || process.env.RELEASE_TARGET || DEFAULT_TARGET);
const releaseBranch = process.env.RELEASE_BRANCH || target.releaseBranch || "release/windows-prod";
const outputDir = path.resolve(args.outputDir || path.join(projectRoot, "release-dist"));
const skipChecks = process.env.SKIP_RELEASE_CHECKS === "1";

function parseArgs(rawArgs = []) {
  const parsed = { target: "", outputDir: "" };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--target") {
      parsed.target = rawArgs[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--target=")) {
      parsed.target = arg.slice("--target=".length);
    } else if (arg === "--output") {
      parsed.outputDir = rawArgs[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--output=")) {
      parsed.outputDir = arg.slice("--output=".length);
    } else if (!arg.startsWith("-") && !parsed.outputDir) {
      parsed.outputDir = arg;
    }
  }
  return parsed;
}

function loadTarget(targetId = DEFAULT_TARGET) {
  const normalizedId = String(targetId || DEFAULT_TARGET).trim();
  const targetPath = path.join(projectRoot, "deploy", "targets", `${normalizedId}.json`);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Unknown release target '${normalizedId}'. Expected ${targetPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  const includePaths = normalizePathList(parsed.includePaths);
  if (!includePaths.length) {
    throw new Error(`Release target '${normalizedId}' must define includePaths.`);
  }
  return {
    ...parsed,
    id: parsed.id || normalizedId,
    includePaths,
    excludePaths: normalizePathList(parsed.excludePaths),
    copyFiles: normalizePathList(parsed.copyFiles),
    packagePrefix: parsed.packagePrefix || `software-doc-generator-${normalizedId}`,
    latestAlias: parsed.latestAlias || "latest.zip",
    runtimeDataPolicy: parsed.runtimeDataPolicy || "Runtime data is external to the release package."
  };
}

function normalizePathList(value = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim().replace(/\\/g, "/")).filter(Boolean)
    : [];
}

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
const packageName = `${target.packagePrefix}-${timestamp}-${shortSha}`;

fs.mkdirSync(outputDir, { recursive: true });
const outputZip = path.join(outputDir, `${packageName}.zip`);
const tmpZip = path.join(outputDir, `.${packageName}.tmp.zip`);
const manifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "software-doc-release-"));

try {
  fs.rmSync(tmpZip, { force: true });
  fs.rmSync(outputZip, { force: true });

  const archivePathspecs = [
    ...target.includePaths,
    ...target.excludePaths.map((item) => `:(exclude)${item}`)
  ];
  git(["archive", "--format=zip", `--output=${tmpZip}`, "HEAD", "--", ...archivePathspecs]);

  const releaseDir = path.join(manifestRoot, "release");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(releaseDir, "manifest.json"),
    `${JSON.stringify(
      {
        packageName,
        releaseTarget: target.id,
        releaseBranch,
        commitSha,
        commitTime,
        buildTime,
        includePaths: target.includePaths,
        excludePaths: target.excludePaths,
        runtimeDataPolicy: target.runtimeDataPolicy
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  appendManifest(tmpZip, manifestRoot);
  fs.renameSync(tmpZip, outputZip);
  fs.copyFileSync(outputZip, path.join(outputDir, target.latestAlias));
  if (target.latestAlias !== "latest.zip") {
    fs.copyFileSync(outputZip, path.join(outputDir, "latest.zip"));
  }
  for (const relativePath of target.copyFiles) {
    copyIfExists(path.join(projectRoot, relativePath), path.join(outputDir, path.basename(relativePath)));
  }

  console.log("Release package created:");
  console.log(outputZip);
  console.log("Release target:");
  console.log(target.id);
  console.log("Latest package alias:");
  console.log(path.join(outputDir, target.latestAlias));
} finally {
  fs.rmSync(manifestRoot, { recursive: true, force: true });
  fs.rmSync(tmpZip, { force: true });
}
