param(
  [ValidateSet("hermes", "matlab")]
  [string]$Service,
  [string]$InstallDir = "C:\SoftwareDocWorker"
)

$ErrorActionPreference = "Stop"

function Import-EnvFile {
  param(
    [string]$Path,
    [switch]$Required
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    if ($Required) {
      throw "Environment file not found: $Path"
    }
    return
  }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $index = $trimmed.IndexOf("=")
    if ($index -le 0) {
      continue
    }
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Ensure-AppRuntimeDirectories {
  param([string]$TargetAppDir)
  $directories = @(
    "data",
    "data\skill-rules",
    "tmp",
    "tmp\hermes-uploads",
    "tmp\matlab"
  )

  foreach ($relativePath in $directories) {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetAppDir $relativePath) | Out-Null
  }
}

$appDir = Join-Path $InstallDir "app"
$envFile = Join-Path $InstallDir "software-doc-worker.env"
$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir ("{0}-{1}.log" -f $Service, (Get-Date -Format "yyyyMMdd"))
Start-Transcript -Path $logPath -Append | Out-Null
Import-EnvFile -Path $envFile -Required
Import-EnvFile -Path (Join-Path $InstallDir "config\hermes-llm-secrets.env")
Import-EnvFile -Path (Join-Path $InstallDir "config\hermes-llm.active.env")

if ($env:SOFTWARE_DOC_RUNTIME_PATHS) {
  foreach ($runtimePath in ($env:SOFTWARE_DOC_RUNTIME_PATHS -split ";")) {
    if ($runtimePath -and (Test-Path -LiteralPath $runtimePath)) {
      $env:Path = "$runtimePath;$env:Path"
    }
  }
}

$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) {
  throw "npm.cmd was not found after loading the worker environment."
}

Ensure-AppRuntimeDirectories -TargetAppDir $appDir
Set-Location $appDir

if ($Service -eq "hermes") {
  & $npmCmd run hermes:start
} else {
  & $npmCmd run matlab-worker:start
}
