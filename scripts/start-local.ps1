param(
  [int]$Port = 3000,
  [int]$HermesPort = 3101,
  [switch]$NoHermesAgent,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$npmCmd = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
$nodeCmd = Join-Path $env:ProgramFiles "nodejs\node.exe"
$nodeModulesPath = Join-Path $projectRoot "node_modules"
$runtimeDir = Join-Path $projectRoot ".local"
$pidFile = Join-Path $runtimeDir "server.pid"
$hermesPidFile = Join-Path $runtimeDir "hermes-agent.pid"
$url = "http://localhost:$Port"
$probeUrls = @("http://127.0.0.1:$Port", "http://localhost:$Port")
$platformHermesTransport = if ($env:HERMES_TRANSPORT) { $env:HERMES_TRANSPORT } else { "api" }
if ($NoHermesAgent -and (-not $env:HERMES_TRANSPORT)) {
  $platformHermesTransport = "cli"
}
$hermesBaseUrl = if ($env:HERMES_BASE_URL) { $env:HERMES_BASE_URL } else { "http://127.0.0.1:$HermesPort" }
$serverArguments = @("--disable-warning=ExperimentalWarning", "src/server.js")
$hermesArguments = @("--disable-warning=ExperimentalWarning", "src/hermes-server.js")

function Start-ProcessWithEnv {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [hashtable]$Environment
  )

  $oldValues = @{}
  foreach ($key in $Environment.Keys) {
    $oldValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
  }

  try {
    return Start-Process `
      -FilePath $FilePath `
      -ArgumentList $ArgumentList `
      -WorkingDirectory $WorkingDirectory `
      -PassThru
  } finally {
    foreach ($key in $Environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $oldValues[$key], "Process")
    }
  }
}

function Wait-ForHttpReady {
  param(
    [string[]]$Urls,
    [System.Diagnostics.Process]$Process,
    [string]$ServiceName
  )

  for ($index = 0; $index -lt 30; $index += 1) {
    Start-Sleep -Seconds 1

    if ($Process -and $Process.HasExited) {
      throw "$ServiceName startup failed. Process exited with code: $($Process.ExitCode)"
    }

    foreach ($probeUrl in $Urls) {
      try {
        $response = Invoke-WebRequest -UseBasicParsing $probeUrl -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
          return $true
        }
      } catch {
      }
    }
  }

  return $false
}

if (-not (Test-Path $npmCmd)) {
  throw "npm was not found. Please install Node.js 22+ first. Expected path: $npmCmd"
}

if (-not (Test-Path $nodeCmd)) {
  throw "node.exe was not found. Please install Node.js 22+ first. Expected path: $nodeCmd"
}

if (-not (Test-Path $nodeModulesPath)) {
  Write-Host "Dependencies are missing. Running npm install..." -ForegroundColor Yellow
  & $npmCmd install
}

$existingConnection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingConnection) {
  $process = Get-Process -Id $existingConnection.OwningProcess -ErrorAction SilentlyContinue
  if ($process) {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Set-Content -Path $pidFile -Value $process.Id -Encoding ascii
    Write-Host "Port $Port is already in use by $($process.ProcessName)($($process.Id)). Opening the page directly." -ForegroundColor Yellow
    if (-not $NoBrowser) {
      Start-Process $url | Out-Null
    }
    return
  }
}

if ((-not $NoHermesAgent) -and ($platformHermesTransport -eq "api")) {
  $existingHermesConnection = Get-NetTCPConnection -LocalPort $HermesPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingHermesConnection) {
    $hermesProcess = Get-Process -Id $existingHermesConnection.OwningProcess -ErrorAction SilentlyContinue
    if ($hermesProcess) {
      Write-Host "Hermes Agent port $HermesPort is already in use by $($hermesProcess.ProcessName)($($hermesProcess.Id)). Reusing it." -ForegroundColor Yellow
    }

    $hermesReady = Wait-ForHttpReady -Urls @("$hermesBaseUrl/api/health") -Process $null -ServiceName "Hermes Agent"
    if (-not $hermesReady) {
      throw "Hermes Agent did not respond at $hermesBaseUrl/api/health."
    }
  } else {
    Write-Host "Starting local Hermes Agent backend at $hermesBaseUrl" -ForegroundColor Cyan
    $hermesProcess = Start-ProcessWithEnv `
      -FilePath $nodeCmd `
      -ArgumentList $hermesArguments `
      -WorkingDirectory $projectRoot `
      -Environment @{
        APP_RUNTIME_ROLE = "hermes-agent"
        HERMES_TRANSPORT = "cli"
        HERMES_HOST = "127.0.0.1"
        HERMES_PORT = "$HermesPort"
        HERMES_BASE_URL = "$hermesBaseUrl"
        HERMES_TASK_CONCURRENCY = "1"
        HERMES_SERVER_REQUEST_TIMEOUT_MS = "0"
        TCSD_STAGE_HERMES_TIMEOUT_MS = "7200000"
        TCSD_STAGE_HERMES_MAX_TURNS = "200"
        HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS = "3600000"
        HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE = "10000"
        UNIT_TEST_CASE_PROJECT_ADMIN_CODE = "114301"
        UNIT_TEST_CASE_DEFAULT_PROJECTS = "01_楚能,02_TMS"
        UNIT_TEST_CASE_PROJECT_ADDON_ROOT = (Join-Path $projectRoot ".local/project-addons")
        UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN = "outputs/*_tcsd.xlsx"
      }

    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Set-Content -Path $hermesPidFile -Value $hermesProcess.Id -Encoding ascii

    $hermesReady = Wait-ForHttpReady -Urls @("$hermesBaseUrl/api/health") -Process $hermesProcess -ServiceName "Hermes Agent"
    if (-not $hermesReady) {
      Remove-Item -LiteralPath $hermesPidFile -Force -ErrorAction SilentlyContinue
      throw "Hermes Agent started but did not become ready in time."
    }

    Write-Host "Hermes Agent is ready at $hermesBaseUrl" -ForegroundColor Green
  }
}

Write-Host "Starting local service from $projectRoot" -ForegroundColor Cyan
$serverProcess = Start-ProcessWithEnv `
  -FilePath $nodeCmd `
  -ArgumentList $serverArguments `
  -WorkingDirectory $projectRoot `
  -Environment @{
    APP_RUNTIME_ROLE = "platform"
    HOST = "127.0.0.1"
    PORT = "$Port"
    HERMES_TRANSPORT = "$platformHermesTransport"
    HERMES_BASE_URL = "$hermesBaseUrl"
    HERMES_TASK_CONCURRENCY = "1"
    HERMES_SERVER_REQUEST_TIMEOUT_MS = "0"
    HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS = "3600000"
    HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE = "10000"
    UNIT_TEST_CASE_PROJECT_ADMIN_CODE = "114301"
    UNIT_TEST_CASE_DEFAULT_PROJECTS = "01_楚能,02_TMS"
    UNIT_TEST_CASE_PROJECT_ADDON_ROOT = (Join-Path $projectRoot ".local/project-addons")
    UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN = "outputs/*_tcsd.xlsx"
  }

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Content -Path $pidFile -Value $serverProcess.Id -Encoding ascii

$ready = Wait-ForHttpReady -Urls ($probeUrls | ForEach-Object { "$_/api/health" }) -Process $serverProcess -ServiceName "Backend"

if (-not $ready) {
  throw "Service started but did not become ready in time. Check console output or port usage."
}

Write-Host "Service is ready at $url" -ForegroundColor Green
if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}
