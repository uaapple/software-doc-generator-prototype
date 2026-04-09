$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.local\server.pid'

if (-not (Test-Path $pidFile)) {
  Write-Host "No PID file was found. Nothing to stop." -ForegroundColor Yellow
  exit 0
}

$pidText = (Get-Content -Path $pidFile -Raw).Trim()
if (-not $pidText) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "PID file was empty and has been removed." -ForegroundColor Yellow
  exit 0
}

$process = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
if (-not $process) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "The recorded process is no longer running." -ForegroundColor Yellow
  exit 0
}

Stop-Process -Id $process.Id -Force
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "Stopped local service process $($process.Id)." -ForegroundColor Green
