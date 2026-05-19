param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [switch]$ForceNpmInstall,
  [switch]$SkipTaskRestart
)

$ErrorActionPreference = "Stop"

function Resolve-BundleRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $candidates = @($scriptDir, (Split-Path -Parent $scriptDir))
  foreach ($root in $candidates) {
    if (-not $root) {
      continue
    }
    if (Test-Path -LiteralPath (Join-Path $root "app\package.json")) {
      return $root
    }
  }
  throw "Cannot find source update app folder. Run this script from the extracted source update package."
}

function Get-FileHashValue {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Stop-WorkerTasks {
  param([string[]]$TaskNames)
  foreach ($taskName in $TaskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
      Write-Warning "Scheduled task not found: $taskName"
      continue
    }
    if ($task.State -eq "Running") {
      Write-Host "Stopping $taskName..."
      Stop-ScheduledTask -TaskName $taskName
      $deadline = (Get-Date).AddSeconds(30)
      do {
        Start-Sleep -Milliseconds 500
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      } while ($task -and $task.State -eq "Running" -and (Get-Date) -lt $deadline)
    }
  }
}

function Start-WorkerTasks {
  param([string[]]$TaskNames)
  foreach ($taskName in $TaskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) {
      Write-Warning "Scheduled task not found: $taskName"
      continue
    }
    Write-Host "Starting $taskName..."
    Start-ScheduledTask -TaskName $taskName
  }
}

function Copy-ManagedPath {
  param(
    [string]$SourceAppDir,
    [string]$TargetAppDir,
    [string]$RelativePath
  )
  $source = Join-Path $SourceAppDir $RelativePath
  if (-not (Test-Path -LiteralPath $source)) {
    return
  }

  $target = Join-Path $TargetAppDir $RelativePath
  if ($RelativePath -eq "tools") {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force
    return
  }

  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}

function Ensure-AppRuntimeDirectories {
  param([string]$TargetAppDir)
  $directories = @(
    "data",
    "data\skill-rules",
    "data\projects",
    "data\uploads",
    "data\uploads\feedback-tickets",
    "data\generation-task-artifacts",
    "data\replay-task-artifacts",
    "data\rejections",
    "data\replay-tasks",
    "data\skill-work-orders",
    "data\feedback-tickets",
    "data\skill-refinement",
    "data\skill-refinement\cases",
    "data\skill-refinement\runs",
    "data\skill-refinement\evaluations",
    "data\skill-refinement\audit",
    "data\skill-refinement\bundles",
    "data\skill-refinement\bundle-snapshots",
    "data\skill-refinement\uploads",
    "tmp",
    "tmp\hermes-uploads",
    "tmp\matlab"
  )

  foreach ($relativePath in $directories) {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetAppDir $relativePath) | Out-Null
  }
}

function Sync-HermesLlmProfiles {
  param([string]$TargetAppDir)
  $source = Join-Path $TargetAppDir "scripts\hermes-llm-profiles.json"
  if (-not (Test-Path -LiteralPath $source)) {
    return
  }
  $configDir = Join-Path $InstallDir "config"
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  Copy-Item -LiteralPath $source -Destination (Join-Path $configDir "hermes-llm-profiles.json") -Force
}

function Write-HermesLlmMenuLauncher {
  $launcherPath = Join-Path $InstallDir "Switch-HermesLlm.cmd"
  $lines = @(
    "@echo off",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""%~dp0app\scripts\Switch-HermesLlmProfile.ps1""",
    "pause"
  )
  $lines | Set-Content -LiteralPath $launcherPath -Encoding ascii
}

function Backup-ManagedSource {
  param(
    [string]$TargetAppDir,
    [string]$BackupDir,
    [string[]]$ManagedPaths
  )
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  foreach ($relativePath in $ManagedPaths) {
    $source = Join-Path $TargetAppDir $relativePath
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $BackupDir $relativePath) -Recurse -Force
    }
  }
}

$bundleRoot = Resolve-BundleRoot
$sourceAppDir = Join-Path $bundleRoot "app"
$targetAppDir = Join-Path $InstallDir "app"
$envFile = Join-Path $InstallDir "software-doc-worker.env"
$taskNames = @("SoftwareDocHermesAgent", "SoftwareDocMatlabWorker")
$managedPaths = @(
  ".env.defaults",
  "package.json",
  "package-lock.json",
  "src",
  "scripts",
  "tools",
  "templates",
  "skills",
  "public",
  "docs"
)

if (-not (Test-Path -LiteralPath (Join-Path $sourceAppDir "package.json"))) {
  throw "Source update package is invalid: missing app\package.json"
}
if (-not (Test-Path -LiteralPath (Join-Path $targetAppDir "package.json"))) {
  throw "Installed worker app was not found at $targetAppDir. Run the full Windows worker bundle first."
}
if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Warning "Environment file was not found and will not be created by this source update: $envFile"
}

$oldLockHash = Get-FileHashValue -Path (Join-Path $targetAppDir "package-lock.json")
$newLockHash = Get-FileHashValue -Path (Join-Path $sourceAppDir "package-lock.json")
$backupDir = Join-Path $InstallDir ("backups\source-update-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

Stop-WorkerTasks -TaskNames $taskNames
Backup-ManagedSource -TargetAppDir $targetAppDir -BackupDir $backupDir -ManagedPaths $managedPaths

foreach ($relativePath in $managedPaths) {
  Copy-ManagedPath -SourceAppDir $sourceAppDir -TargetAppDir $targetAppDir -RelativePath $relativePath
}
Ensure-AppRuntimeDirectories -TargetAppDir $targetAppDir
Sync-HermesLlmProfiles -TargetAppDir $targetAppDir
Write-HermesLlmMenuLauncher

$nodeModulesPath = Join-Path $targetAppDir "node_modules"
$shouldInstall = $ForceNpmInstall -or (-not (Test-Path -LiteralPath $nodeModulesPath)) -or ($oldLockHash -ne $newLockHash)
if ($shouldInstall) {
  $npmCmd = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Source
  if (-not $npmCmd) {
    throw "npm.cmd was not found. Re-run the full worker deployment or add Node.js to PATH."
  }
  Push-Location $targetAppDir
  try {
    & $npmCmd ci --omit=dev
  } finally {
    Pop-Location
  }
} else {
  Write-Host "package-lock.json is unchanged; keeping existing node_modules."
}

if (-not $SkipTaskRestart) {
  Start-WorkerTasks -TaskNames $taskNames
}

Write-Host "Windows worker source update applied."
Write-Host "Install dir: $InstallDir"
Write-Host "Backup dir: $backupDir"
Write-Host "Hermes health: http://127.0.0.1:3101/api/health"
Write-Host "MATLAB worker health: http://127.0.0.1:5100/health"
Write-Host "Hermes LLM switcher: $targetAppDir\scripts\Switch-HermesLlmProfile.ps1"
Write-Host "Hermes LLM menu launcher: $InstallDir\Switch-HermesLlm.cmd"
