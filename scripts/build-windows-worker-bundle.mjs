import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.argv[2] || path.join(projectRoot, "release-dist", "windows-worker"));
const includeNodeModules = process.env.WINDOWS_WORKER_INCLUDE_NODE_MODULES !== "0";
const offlineSourceRoot = path.join(projectRoot, "offline-installers");

const offlineInputs = {
  node: [
    process.env.NODE_INSTALLER_PATH || "",
    process.env.NODE_RUNTIME_ZIP_PATH || ""
  ],
  hermes: [
    process.env.HERMES_INSTALLER_PATH || "",
    process.env.HERMES_INSTALL_SCRIPT_PATH || "",
    process.env.HERMES_PORTABLE_PATH || ""
  ],
  "matlab-mcp": [
    process.env.MATLAB_MCP_SERVER_EXE_PATH || "",
    process.env.MCP_SERVER_EXE_PATH || ""
  ],
  matlab: [
    process.env.MATLAB_INSTALLER_PATH || "",
    process.env.MATLAB_INSTALLER_PACKAGE_PATH || ""
  ]
};

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

function copyExternalPath(sourcePath, destinationDir) {
  if (!sourcePath) {
    return false;
  }
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Offline asset does not exist: ${sourcePath}`);
  }
  const destination = path.join(destinationDir, path.basename(resolved));
  fs.cpSync(resolved, destination, { recursive: true, force: true });
  return true;
}

function copyOfflineSourceFolder(category, destinationDir) {
  const source = path.join(offlineSourceRoot, category);
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.cpSync(source, destinationDir, { recursive: true, force: true });
  return true;
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

function writeReadme(filePath, lines) {
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
}

fs.mkdirSync(outputDir, { recursive: true });
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "software-doc-windows-worker-"));
const bundleRoot = path.join(tmpRoot, "software-doc-windows-worker");
const appRoot = path.join(bundleRoot, "app");
const deployRoot = path.join(bundleRoot, "deploy");
const offlineRoot = path.join(bundleRoot, "offline-installers");

try {
  fs.mkdirSync(appRoot, { recursive: true });
  fs.mkdirSync(deployRoot, { recursive: true });
  fs.mkdirSync(offlineRoot, { recursive: true });

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

  for (const [category, inputs] of Object.entries(offlineInputs)) {
    const destinationDir = path.join(offlineRoot, category);
    fs.mkdirSync(destinationDir, { recursive: true });
    copyOfflineSourceFolder(category, destinationDir);
    for (const input of inputs) {
      copyExternalPath(input, destinationDir);
    }
  }

  const bundledMcpExe = path.join(projectRoot, "tools", "matlab-mcp-core-server.exe");
  if (fs.existsSync(bundledMcpExe)) {
    fs.copyFileSync(bundledMcpExe, path.join(offlineRoot, "matlab-mcp", "matlab-mcp-core-server.exe"));
  }

  writeReadme(path.join(offlineRoot, "README.txt"), [
    "Offline installers used by Deploy-WindowsWorker.ps1.",
    "",
    "Expected folders:",
    "- node: Node.js 22+ x64 MSI or node-v22+ win-x64 portable zip.",
    "- hermes: Hermes CLI installer, install.ps1, or portable hermes.exe/hermes.cmd/hermes.ps1.",
    "- matlab-mcp: matlab-mcp-core-server.exe for Windows.",
    "- matlab: optional MATLAB offline installer or wrapper script. MATLAB R2025b is expected at C:\\Program Files\\MATLAB\\R2025b\\bin\\matlab.exe.",
    "",
    "Populate this folder before building, or set environment variables such as NODE_INSTALLER_PATH, HERMES_INSTALLER_PATH, MATLAB_MCP_SERVER_EXE_PATH, and MATLAB_INSTALLER_PATH."
  ]);

  writeReadme(path.join(offlineRoot, "node", "README.txt"), [
    "Put Node.js 22+ x64 MSI here, or a node-v22+ win-x64 portable zip.",
    "The deploy script installs MSI silently, or expands the portable zip under C:\\SoftwareDocWorker\\runtime\\node."
  ]);

  writeReadme(path.join(offlineRoot, "hermes", "README.txt"), [
    "Hermes CLI is optional for the current Software Doc Hermes Agent; the bundled agent runs as a Node service.",
    "Put a portable hermes.exe/hermes.cmd/hermes.ps1 here only if an external Hermes CLI is required.",
    "Installer scripts are not run automatically. Pass -HermesInstallerPath explicitly if you need to run an installer.",
    "Supported explicit installer/script types: .msi, .exe, .ps1, .cmd, .bat.",
    "Supported portable command files: hermes.exe, hermes.cmd, hermes.ps1.",
    "If the installer needs silent flags, pass -HermesInstallerArgs when running Deploy-WindowsWorker.ps1."
  ]);

  writeReadme(path.join(offlineRoot, "matlab-mcp", "README.txt"), [
    "Put the Windows build of matlab-mcp-core-server.exe here.",
    "Deploy-WindowsWorker.ps1 copies it into the installed app tools directory automatically."
  ]);

  writeReadme(path.join(offlineRoot, "matlab", "README.txt"), [
    "MATLAB itself is normally preinstalled because it needs licensing.",
    "The deploy script checks C:\\Program Files\\MATLAB\\R2025b\\bin\\matlab.exe by default.",
    "If you provide a MATLAB offline installer or wrapper script here, pass any required silent args with -MatlabInstallerArgs."
  ]);

  writeReadme(path.join(bundleRoot, "README.txt"), [
    "Software Doc Windows worker bundle",
    "",
    "Run on the Windows VM from PowerShell:",
    "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Deploy-WindowsWorker.ps1",
    "",
    "Default MATLAB path:",
    "C:\\Program Files\\MATLAB\\R2025b\\bin\\matlab.exe",
    "",
    "The deploy script checks and installs missing local prerequisites from offline-installers:",
    "- Node.js 22+",
    "- optional Hermes CLI portable command",
    "- matlab-mcp-core-server.exe",
    "- optional MATLAB offline installer",
    "",
    "After installation, the script prints the Linux backend environment variables needed to connect to this Windows worker."
  ]);

  const zipPath = path.join(outputDir, "software-doc-windows-worker.zip");
  zipDirectory(bundleRoot, zipPath);
  console.log("Windows worker bundle created:");
  console.log(zipPath);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
