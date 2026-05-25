param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [int]$ApiPort = 8642,
  [string]$TaskName = "SoftwareDocHermesOpenApiServer"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script from an Administrator PowerShell window."
  }
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $lines = @()
  if (Test-Path -LiteralPath $Path) {
    $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
  }
  $updated = $false
  $nextLines = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))=") {
      $updated = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $updated) {
    $nextLines += "$Key=$Value"
  }
  $nextLines | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Restart-ApiServerTask {
  param([string]$Name)
  $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if (-not $task) {
    throw "Scheduled task not found: $Name. Run Enable-HermesOpenApiServer.ps1 first."
  }
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $Name
}

function Wait-NoAuthApiServer {
  param([int]$Port)
  $healthUri = "http://127.0.0.1:$Port/health"
  $modelsUri = "http://127.0.0.1:$Port/v1/models"
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-RestMethod -Uri $healthUri -TimeoutSec 3 | Out-Null
      Invoke-RestMethod -Uri $modelsUri -TimeoutSec 3 | Out-Null
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  throw "Hermes API Server did not accept unauthenticated /v1/models on port $Port."
}

Assert-Administrator

$apiEnvPath = Join-Path $InstallDir "config\hermes-api-server.env"
Set-EnvValue -Path $apiEnvPath -Key "API_SERVER_KEY" -Value ""
Restart-ApiServerTask -Name $TaskName
Wait-NoAuthApiServer -Port $ApiPort

Write-Host "Hermes OpenAI-compatible API Server key authentication is disabled."
Write-Host "Updated env file: $apiEnvPath"
Write-Host "Verified without Authorization header: http://127.0.0.1:$ApiPort/v1/models"
