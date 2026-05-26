param(
  [string]$PackageDir = "C:\temp",
  [string]$PackagePath = "",
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [switch]$ForceNpmInstall,
  [switch]$SkipTaskRestart,
  [switch]$NoPause,
  [switch]$NoElevate
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Quote-Arg {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Restart-AsAdministrator {
  if ($NoElevate -or (Test-IsAdministrator)) {
    return
  }

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-Arg $PSCommandPath),
    "-PackageDir",
    (Quote-Arg $PackageDir),
    "-InstallDir",
    (Quote-Arg $InstallDir)
  )
  if ($PackagePath) {
    $arguments += @("-PackagePath", (Quote-Arg $PackagePath))
  }
  if ($ForceNpmInstall) {
    $arguments += "-ForceNpmInstall"
  }
  if ($SkipTaskRestart) {
    $arguments += "-SkipTaskRestart"
  }
  if ($NoPause) {
    $arguments += "-NoPause"
  }
  $arguments += "-NoElevate"

  Write-Host "Administrator permission is required. Opening an elevated deployment window..."
  Start-Process -FilePath "powershell.exe" -ArgumentList ($arguments -join " ") -Verb RunAs
  exit 0
}

function Pause-BeforeExit {
  if (-not $NoPause) {
    Write-Host ""
    Read-Host "Press Enter to close"
  }
}

function Resolve-SourcePackage {
  if ($PackagePath) {
    $resolved = Resolve-Path -LiteralPath $PackagePath -ErrorAction Stop
    return $resolved.Path
  }

  if (-not (Test-Path -LiteralPath $PackageDir)) {
    throw "Package directory does not exist: $PackageDir"
  }

  $candidates = Get-ChildItem -LiteralPath $PackageDir -File -Filter "software-doc-windows-worker-source*.zip" |
    Sort-Object LastWriteTime -Descending

  if (-not $candidates -or $candidates.Count -eq 0) {
    throw "No source update package was found in $PackageDir. Expected software-doc-windows-worker-source*.zip"
  }

  return $candidates[0].FullName
}

function Resolve-BundleRoot {
  param([string]$ExtractDir)

  if (Test-Path -LiteralPath (Join-Path $ExtractDir "app\package.json")) {
    return $ExtractDir
  }

  $childRoots = Get-ChildItem -LiteralPath $ExtractDir -Directory
  foreach ($child in $childRoots) {
    if (Test-Path -LiteralPath (Join-Path $child.FullName "app\package.json")) {
      return $child.FullName
    }
  }

  throw "Expanded package is invalid: missing app\package.json"
}

function Expand-SourcePackage {
  param(
    [string]$Package,
    [string]$DestinationPath
  )

  $tar = (Get-Command "tar.exe" -ErrorAction SilentlyContinue).Source
  if ($tar) {
    Write-Host "Expanding package with tar.exe..."
    & $tar -xf $Package -C $DestinationPath
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Write-Warning "tar.exe failed with exit code $LASTEXITCODE; falling back to Expand-Archive."
    if (Test-Path -LiteralPath $DestinationPath) {
      Remove-Item -LiteralPath $DestinationPath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
  }

  Write-Host "Expanding package with Expand-Archive..."
  Expand-Archive -LiteralPath $Package -DestinationPath $DestinationPath -Force
}

function Read-EnvFile {
  param([string]$Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
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
    $values[$key] = $value
  }
  return $values
}

function Test-HttpEndpoint {
  param(
    [string]$Name,
    [string]$Uri,
    [hashtable]$Headers = @{}
  )

  try {
    $response = Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers -TimeoutSec 15
    Write-Host "$Name health OK: $Uri"
    return $response
  } catch {
    throw "$Name health check failed at $Uri : $($_.Exception.Message)"
  }
}

function Verify-WorkerHealth {
  $envPath = Join-Path $InstallDir "software-doc-worker.env"
  $workerEnv = Read-EnvFile -Path $envPath

  $hermesPort = $workerEnv["HERMES_PORT"]
  if (-not $hermesPort) {
    $hermesPort = "3101"
  }

  $matlabPort = $workerEnv["MATLAB_WORKER_PORT"]
  if (-not $matlabPort) {
    $matlabPort = "5100"
  }

  Test-HttpEndpoint -Name "Hermes Agent" -Uri "http://127.0.0.1:$hermesPort/api/health" | Out-Null
  Test-HttpEndpoint -Name "MATLAB Worker" -Uri "http://127.0.0.1:$matlabPort/health" | Out-Null
}

function Write-DeploymentRecord {
  param(
    [string]$Package,
    [string]$BundleRoot
  )

  $deploymentsDir = Join-Path $InstallDir "deployments"
  New-Item -ItemType Directory -Force -Path $deploymentsDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $recordPath = Join-Path $deploymentsDir "source-update-$timestamp.txt"
  $manifestPath = Join-Path $BundleRoot "manifest.json"
  $lines = @(
    "deployedAt=$(Get-Date -Format o)",
    "packagePath=$Package",
    "installDir=$InstallDir"
  )
  if (Test-Path -LiteralPath $manifestPath) {
    $lines += "manifest=$(Get-Content -Raw -LiteralPath $manifestPath)"
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($recordPath, $lines, $utf8NoBom)
  Write-Host "Deployment record: $recordPath"
}

Restart-AsAdministrator

try {
  $package = Resolve-SourcePackage
  $packageItem = Get-Item -LiteralPath $package
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $incomingDir = Join-Path $InstallDir "incoming"
  $extractDir = Join-Path $incomingDir "source-update-$timestamp"

  Write-Host "Software Doc Windows Worker source update"
  Write-Host "Package: $($packageItem.FullName)"
  Write-Host "Package time: $($packageItem.LastWriteTime)"
  Write-Host "Install dir: $InstallDir"
  Write-Host ""

  New-Item -ItemType Directory -Force -Path $incomingDir | Out-Null
  if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

  Expand-SourcePackage -Package $packageItem.FullName -DestinationPath $extractDir
  $bundleRoot = Resolve-BundleRoot -ExtractDir $extractDir
  $updateScript = Join-Path $bundleRoot "Update-WindowsWorkerSource.ps1"
  if (-not (Test-Path -LiteralPath $updateScript)) {
    throw "Expanded package is invalid: missing Update-WindowsWorkerSource.ps1"
  }

  $updateArgs = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $updateScript,
    "-InstallDir",
    $InstallDir
  )
  if ($ForceNpmInstall) {
    $updateArgs += "-ForceNpmInstall"
  }
  if ($SkipTaskRestart) {
    $updateArgs += "-SkipTaskRestart"
  }

  Write-Host "Applying source update..."
  & powershell.exe @updateArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Update-WindowsWorkerSource.ps1 failed with exit code $LASTEXITCODE"
  }

  if (-not $SkipTaskRestart) {
    Write-Host "Verifying worker health..."
    Verify-WorkerHealth
  }

  Write-DeploymentRecord -Package $packageItem.FullName -BundleRoot $bundleRoot
  Write-Host ""
  Write-Host "Windows worker source update completed."
} catch {
  Write-Error $_
  exit 1
} finally {
  Pause-BeforeExit
}
