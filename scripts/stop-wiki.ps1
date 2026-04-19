$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot ".local\wiki.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "No wiki PID file was found. Nothing to stop." -ForegroundColor Yellow
  exit 0
}

$pidText = (Get-Content -Path $pidFile -Raw).Trim()
if (-not $pidText) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "Wiki PID file was empty and has been removed." -ForegroundColor Yellow
  exit 0
}

$process = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
if (-not $process) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "The recorded wiki process is no longer running." -ForegroundColor Yellow
  exit 0
}

Stop-Process -Id $process.Id -Force
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "Stopped wiki service process $($process.Id)." -ForegroundColor Green
