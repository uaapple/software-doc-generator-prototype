param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [string]$MatlabExecutable = "C:\Program Files\MATLAB\R2022b_Update_1\bin\matlab.exe",
  [string]$McpServerCommand = "",
  [string]$HermesCommand = "hermes",
  [string]$HermesInstallerPath = "",
  [string]$MatlabAuthToken = "",
  [string]$HermesAuthToken = "",
  [switch]$SkipTaskRegistration
)

$ErrorActionPreference = "Stop"

function New-Token {
  return (([guid]::NewGuid().ToString("N")) + ([guid]::NewGuid().ToString("N")))
}

function Resolve-BundleAppDir {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $bundleRoots = @(
    $scriptDir,
    (Split-Path -Parent $scriptDir)
  )

  foreach ($root in $bundleRoots) {
    if (-not $root) {
      continue
    }

    $bundleAppDir = Join-Path $root "app"
    if (Test-Path -LiteralPath (Join-Path $bundleAppDir "package.json")) {
      return $bundleAppDir
    }
  }

  $repoRoot = Split-Path -Parent $scriptDir
  if (Test-Path -LiteralPath (Join-Path $repoRoot "package.json")) {
    return $repoRoot
  }
  throw "Cannot find app package. Run this script from the worker bundle or repository."
}

function Write-EnvFile {
  param([string]$Path)
  $content = @(
    "# Software document generator Windows worker environment",
    "HERMES_HOST=0.0.0.0",
    "HERMES_PORT=3101",
    "HERMES_TRANSPORT=cli",
    "HERMES_COMMAND=$HermesCommand",
    "HERMES_WORKDIR=$InstallDir\app",
    "HERMES_UPLOAD_TMPDIR=$InstallDir\tmp\hermes-uploads",
    "HERMES_AUTH_TOKEN=$HermesAuthToken",
    "HERMES_TIMEOUT_MS=600000",
    "HERMES_TIMEOUT_CONTENT_GENERATE_MS=1200000",
    "HERMES_TIMEOUT_REPLAY_PROPOSAL_GENERATE_MS=600000",
    "MATLAB_WORKER_HOST=0.0.0.0",
    "MATLAB_WORKER_PORT=5100",
    "MATLAB_EXECUTABLE=$MatlabExecutable",
    "MATLAB_MCP_SERVER_COMMAND=$McpServerCommand",
    "MATLAB_MCP_TIMEOUT_MS=600000",
    "MATLAB_MCP_TMPDIR=$InstallDir\tmp\matlab",
    "MATLAB_MCP_AUTH_TOKEN=$MatlabAuthToken"
  )
  $content | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Register-WorkerTask {
  param(
    [string]$TaskName,
    [string]$Service
  )
  $runner = Join-Path $InstallDir "app\scripts\run-windows-worker-service.ps1"
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$runner`"",
    "-Service", $Service,
    "-InstallDir", "`"$InstallDir`""
  ) -join " "
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $InstallDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Software document generator $Service worker" -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
}

if (-not $MatlabAuthToken) {
  $MatlabAuthToken = New-Token
}
if (-not $HermesAuthToken) {
  $HermesAuthToken = New-Token
}

if ($HermesInstallerPath) {
  if (-not (Test-Path -LiteralPath $HermesInstallerPath)) {
    throw "Hermes installer not found: $HermesInstallerPath"
  }
  Start-Process -FilePath $HermesInstallerPath -Wait
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "Node.js is required but node.exe was not found in PATH."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm.cmd is required but was not found in PATH."
}
if (-not (Test-Path -LiteralPath $MatlabExecutable)) {
  throw "MATLAB executable not found: $MatlabExecutable"
}

$sourceAppDir = Resolve-BundleAppDir
$targetAppDir = Join-Path $InstallDir "app"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "tmp") | Out-Null

if (Test-Path -LiteralPath $targetAppDir) {
  Remove-Item -LiteralPath $targetAppDir -Recurse -Force
}
Copy-Item -LiteralPath $sourceAppDir -Destination $targetAppDir -Recurse -Force

if (-not $McpServerCommand) {
  $candidate = Join-Path $targetAppDir "tools\matlab-mcp-core-server.exe"
  if (Test-Path -LiteralPath $candidate) {
    $McpServerCommand = $candidate
  }
}
if (-not $McpServerCommand -or -not (Test-Path -LiteralPath $McpServerCommand)) {
  throw "MATLAB MCP server executable not found. Pass -McpServerCommand C:\path\to\matlab-mcp-core-server.exe"
}

Set-Location $targetAppDir
if (-not (Test-Path -LiteralPath (Join-Path $targetAppDir "node_modules"))) {
  npm.cmd ci --omit=dev
}

$envFile = Join-Path $InstallDir "software-doc-worker.env"
Write-EnvFile -Path $envFile

if (-not (Get-Command $HermesCommand -ErrorAction SilentlyContinue)) {
  Write-Warning "Hermes command '$HermesCommand' was not found in PATH. Install/login Hermes CLI before running generation tasks."
}

if (-not $SkipTaskRegistration) {
  Register-WorkerTask -TaskName "SoftwareDocHermesAgent" -Service "hermes"
  Register-WorkerTask -TaskName "SoftwareDocMatlabWorker" -Service "matlab"
}

Write-Host "Windows worker installed at $InstallDir"
Write-Host ""
Write-Host "Configure the Linux backend with:"
Write-Host "HERMES_TRANSPORT=api"
Write-Host "HERMES_API_MODE=multipart"
Write-Host "HERMES_BASE_URL=http://<windows-vm-host>:3101"
Write-Host "HERMES_AUTH_TOKEN=$HermesAuthToken"
Write-Host "MATLAB_MCP_TRANSPORT=http"
Write-Host "MATLAB_MCP_HTTP_MODE=multipart"
Write-Host "MATLAB_MCP_BASE_URL=http://<windows-vm-host>:5100"
Write-Host "MATLAB_MCP_AUTH_TOKEN=$MatlabAuthToken"
