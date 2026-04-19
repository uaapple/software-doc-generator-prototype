param(
  [int]$Port = 3001,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$stopScript = Join-Path $PSScriptRoot "stop-wiki.ps1"
$startScript = Join-Path $PSScriptRoot "start-wiki.ps1"

if (-not (Test-Path $stopScript)) {
  throw "stop-wiki.ps1 was not found. Expected path: $stopScript"
}

if (-not (Test-Path $startScript)) {
  throw "start-wiki.ps1 was not found. Expected path: $startScript"
}

Write-Host "Stopping wiki service..." -ForegroundColor Yellow
& $stopScript

Start-Sleep -Milliseconds 500

Write-Host "Restarting wiki service..." -ForegroundColor Cyan
if ($NoBrowser) {
  & $startScript -Port $Port -NoBrowser
} else {
  & $startScript -Port $Port
}
