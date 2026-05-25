$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.local\server.pid'
$hermesPidFile = Join-Path $projectRoot '.local\hermes-agent.pid'

function Stop-PidFile {
  param(
    [string]$PidFile,
    [string]$Label
  )

  if (-not (Test-Path $PidFile)) {
    Write-Host "No $Label PID file was found." -ForegroundColor Yellow
    return
  }

  $pidText = (Get-Content -Path $PidFile -Raw).Trim()
  if (-not $pidText) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "$Label PID file was empty and has been removed." -ForegroundColor Yellow
    return
  }

  $process = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
  if (-not $process) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "The recorded $Label process is no longer running." -ForegroundColor Yellow
    return
  }

  Stop-Process -Id $process.Id -Force
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "Stopped $Label process $($process.Id)." -ForegroundColor Green
}

if ((-not (Test-Path $pidFile)) -and (-not (Test-Path $hermesPidFile))) {
  Write-Host "No PID files were found. Nothing to stop." -ForegroundColor Yellow
  exit 0
}

Stop-PidFile -PidFile $pidFile -Label "local service"
Stop-PidFile -PidFile $hermesPidFile -Label "Hermes Agent"
