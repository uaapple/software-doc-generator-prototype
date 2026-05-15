import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.argv[2] || path.join(projectRoot, "release-dist", "windows-worker"));
const includeNodeModules = process.env.WINDOWS_WORKER_INCLUDE_NODE_MODULES !== "0";
const hermesInstallerPath = process.env.HERMES_INSTALLER_PATH || "";

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

if (includeNodeModules && fs.existsSync(path.join(projectRoot, "node_modules"))) {
  appPaths.push("node_modules");
}

function copyPath(relativePath, destinationRoot) {
  const source = path.join(projectRoot, relativePath);
  if (!fs.existsSync(source)) {
    return;
  }
  const destination = path.join(destinationRoot, relativePath);
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    filter(sourcePath) {
      const normalized = sourcePath.replace(/\\/g, "/");
      return !normalized.includes("/release-dist/") && !normalized.includes("/.git/");
    }
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

fs.mkdirSync(outputDir, { recursive: true });
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "software-doc-windows-worker-"));
const bundleRoot = path.join(tmpRoot, "software-doc-windows-worker");
const appRoot = path.join(bundleRoot, "app");
const deployRoot = path.join(bundleRoot, "deploy");

try {
  fs.mkdirSync(appRoot, { recursive: true });
  fs.mkdirSync(deployRoot, { recursive: true });

  for (const relativePath of appPaths) {
    copyPath(relativePath, appRoot);
  }

  const deployScripts = [
    "install-windows-worker.ps1",
    "start-windows-worker.ps1",
    "run-windows-worker-service.ps1",
    "start-matlab-worker.ps1"
  ];
  for (const scriptName of deployScripts) {
    fs.copyFileSync(path.join(projectRoot, "scripts", scriptName), path.join(deployRoot, scriptName));
  }
  fs.copyFileSync(path.join(projectRoot, "scripts", "install-windows-worker.ps1"), path.join(bundleRoot, "Deploy-WindowsWorker.ps1"));

  const installerDir = path.join(bundleRoot, "hermes-cli-installer");
  fs.mkdirSync(installerDir, { recursive: true });
  if (hermesInstallerPath && fs.existsSync(hermesInstallerPath)) {
    fs.copyFileSync(hermesInstallerPath, path.join(installerDir, path.basename(hermesInstallerPath)));
  }
  fs.writeFileSync(
    path.join(installerDir, "README.txt"),
    [
      "Optional Hermes CLI installer drop folder.",
      "If Hermes CLI is not already installed on the Windows VM, put the official installer here",
      "or pass -HermesInstallerPath to Deploy-WindowsWorker.ps1.",
      "The bundled app folder already contains the Software Doc Hermes agent service code."
    ].join("\r\n") + "\r\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(bundleRoot, "README.txt"),
    [
      "Software Doc Windows worker bundle",
      "",
      "Run from an elevated or normal PowerShell prompt on the Windows VM:",
      "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Deploy-WindowsWorker.ps1",
      "",
      "Required external prerequisites:",
      "- Node.js 22+",
      "- MATLAB",
      "- Windows build of matlab-mcp-core-server.exe",
      "- Hermes CLI installed and logged in, unless you only need fallback agent steps",
      "",
      "The install script prints the Linux backend environment variables after it finishes."
    ].join("\r\n") + "\r\n",
    "utf8"
  );

  const zipPath = path.join(outputDir, "software-doc-windows-worker.zip");
  zipDirectory(bundleRoot, zipPath);
  console.log("Windows worker bundle created:");
  console.log(zipPath);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
