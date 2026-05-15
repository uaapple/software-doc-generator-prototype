param(
  [string]$HostName = "0.0.0.0",
  [int]$Port = 5100,
  [string]$MatlabExecutable = "C:\Program Files\MATLAB\R2022b_Update_1\bin\matlab.exe",
  [string]$McpServerCommand = "",
  [string]$AuthToken = "",
  [int]$TimeoutMs = 600000,
  [string]$TempDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path -LiteralPath $MatlabExecutable)) {
  throw "MATLAB executable not found: $MatlabExecutable"
}

if (-not $McpServerCommand) {
  $defaultMcp = Join-Path $repoRoot "tools\matlab-mcp-core-server.exe"
  if (Test-Path -LiteralPath $defaultMcp) {
    $McpServerCommand = $defaultMcp
  }
}

if (-not $McpServerCommand -or -not (Test-Path -LiteralPath $McpServerCommand)) {
  throw "MATLAB MCP server executable not found. Pass -McpServerCommand C:\path\to\matlab-mcp-core-server.exe"
}

if (-not $AuthToken) {
  $AuthToken = $env:MATLAB_MCP_AUTH_TOKEN
}

if (-not $AuthToken) {
  throw "MATLAB_MCP_AUTH_TOKEN is required. Pass -AuthToken or set the environment variable before starting the worker."
}

if (-not $TempDir) {
  $TempDir = Join-Path $env:TEMP "software-doc-slx-worker"
}

New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

$env:MATLAB_WORKER_HOST = $HostName
$env:MATLAB_WORKER_PORT = [string]$Port
$env:MATLAB_EXECUTABLE = $MatlabExecutable
$env:MATLAB_MCP_SERVER_COMMAND = $McpServerCommand
$env:MATLAB_MCP_TIMEOUT_MS = [string]$TimeoutMs
$env:MATLAB_MCP_TMPDIR = $TempDir
$env:MATLAB_MCP_AUTH_TOKEN = $AuthToken

Write-Host "Starting MATLAB SLX worker on ${HostName}:${Port}"
Write-Host "MATLAB executable: $MatlabExecutable"
Write-Host "MCP server: $McpServerCommand"
Write-Host "Temp dir: $TempDir"

npm run matlab-worker:start
