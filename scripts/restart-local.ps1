param(
  [int]$Port = 3000,
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
  & $startScript -Port $Port -NoBrowser
} else {
  & $startScript -Port $Port
}
