param(
  [int]$Port = 3001,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$npmCmd = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
$nodeCmd = Join-Path $env:ProgramFiles "nodejs\node.exe"
$nodeModulesPath = Join-Path $projectRoot "node_modules"
$runtimeDir = Join-Path $projectRoot ".local"
$pidFile = Join-Path $runtimeDir "wiki.pid"
$url = "http://localhost:$Port"
$probeUrls = @("http://127.0.0.1:$Port", "http://localhost:$Port")
$serverArguments = @("src/wiki-server.js")

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

Write-Host "Starting wiki service from $projectRoot" -ForegroundColor Cyan
$serverProcess = Start-Process `
  -FilePath $nodeCmd `
  -ArgumentList $serverArguments `
  -WorkingDirectory $projectRoot `
  -PassThru

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Content -Path $pidFile -Value $serverProcess.Id -Encoding ascii

$ready = $false
for ($index = 0; $index -lt 30; $index += 1) {
  Start-Sleep -Seconds 1

  if ($serverProcess.HasExited) {
    throw "Wiki startup failed. node exited with code: $($serverProcess.ExitCode)"
  }

  try {
    foreach ($probeUrl in $probeUrls) {
      $response = Invoke-WebRequest -UseBasicParsing "$probeUrl/health" -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        $ready = $true
        break
      }
    }
  } catch {
  }

  if ($ready) {
    break
  }
}

if (-not $ready) {
  throw "Wiki service started but did not become ready in time. Check console output or port usage."
}

Write-Host "Wiki service is ready at $url" -ForegroundColor Green
if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}
