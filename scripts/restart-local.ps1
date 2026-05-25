param(
  [int]$Port = 3000,
  [int]$HermesPort = 3101,
  [switch]$NoHermesAgent,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$stopScript = Join-Path $PSScriptRoot "stop-local.ps1"
$startScript = Join-Path $PSScriptRoot "start-local.ps1"

if (-not (Test-Path $stopScript)) {
  throw "stop-local.ps1 was not found. Expected path: $stopScript"
}

if (-not (Test-Path $startScript)) {
  throw "start-local.ps1 was not found. Expected path: $startScript"
}

Write-Host "Stopping local service..." -ForegroundColor Yellow
& $stopScript

Start-Sleep -Milliseconds 500

Write-Host "Restarting local service..." -ForegroundColor Cyan
if ($NoBrowser) {
  if ($NoHermesAgent) {
    & $startScript -Port $Port -HermesPort $HermesPort -NoHermesAgent -NoBrowser
  } else {
    & $startScript -Port $Port -HermesPort $HermesPort -NoBrowser
  }
} else {
  if ($NoHermesAgent) {
    & $startScript -Port $Port -HermesPort $HermesPort -NoHermesAgent
  } else {
    & $startScript -Port $Port -HermesPort $HermesPort
  }
}
