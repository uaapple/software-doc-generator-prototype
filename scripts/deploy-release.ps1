param(
  [string]$PackagePath = "C:\apps\software-doc-generator\incoming\latest.zip",
  [string]$AppRoot = "C:\apps\software-doc-generator",
  [string[]]$ServiceNames = @("SoftwareDocGenerator", "SoftwareDocWiki"),
  [int]$Port = 3000,
  [int]$WikiPort = 3001,
  [switch]$NoServiceRestart
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Get-ServiceOrNull([string]$Name) {
  return Get-Service -Name $Name -ErrorAction SilentlyContinue
}

function Get-EnvValue([string]$EnvFile, [string]$Key, [string]$DefaultValue) {
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    return $DefaultValue
  }

  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separator = $trimmed.IndexOf("=")
    if ($separator -le 0) {
      continue
    }

    $name = $trimmed.Substring(0, $separator).Trim()
    if ($name -ne $Key) {
      continue
    }

    return $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
  }

  return $DefaultValue
}

function Stop-AppServices([string[]]$Names) {
  for ($index = $Names.Count - 1; $index -ge 0; $index -= 1) {
    $name = $Names[$index]
    $service = Get-ServiceOrNull $name
    if (-not $service) {
      Write-Warning "Windows service '$name' was not found."
      continue
    }

    if ($service.Status -ne "Stopped") {
      Write-Host "Stopping service $name..." -ForegroundColor Yellow
      Stop-Service -Name $name -Force
      $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
    }
  }
}

function Start-AppServices([string[]]$Names) {
  foreach ($name in $Names) {
    $service = Get-ServiceOrNull $name
    if (-not $service) {
      Write-Warning "Windows service '$name' was not found."
      continue
    }

    Write-Host "Starting service $name..." -ForegroundColor Cyan
    Start-Service -Name $name
    $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  }
}

function Assert-ServicesPresent([string[]]$Names) {
  $missing = @($Names | Where-Object { -not (Get-ServiceOrNull $_) })
  if ($missing.Count -gt 0) {
    throw "Missing Windows service(s): $($missing -join ', '). Install them first with scripts\install-windows-services.ps1."
  }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "Health check passed: $Url" -ForegroundColor Green
        return
      }
    } catch {
      $lastError = $_
    }
    Start-Sleep -Seconds 2
  }

  throw "Health check failed: $Url. Last error: $lastError"
}

function Get-CurrentTarget([string]$CurrentPath) {
  if (-not (Test-Path -LiteralPath $CurrentPath)) {
    return ""
  }

  $item = Get-Item -LiteralPath $CurrentPath -Force
  if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    $target = $item.Target
    if ($target -is [array]) {
      return $target[0]
    }
    return [string]$target
  }

  return $item.FullName
}

function Set-CurrentJunction([string]$CurrentPath, [string]$TargetPath, [string]$BackupRoot) {
  if (Test-Path -LiteralPath $CurrentPath) {
    $item = Get-Item -LiteralPath $CurrentPath -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      Remove-Item -LiteralPath $CurrentPath -Force
    } else {
      $backupName = "current.backup-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss")
      $backupPath = Join-Path $BackupRoot $backupName
      Write-Warning "Existing current directory is not a junction. Moving it to $backupPath"
      Move-Item -LiteralPath $CurrentPath -Destination $backupPath
    }
  }

  New-Item -ItemType Junction -Path $CurrentPath -Target $TargetPath | Out-Null
}

function Read-ReleasePackageName([string]$ReleaseDir, [string]$FallbackName) {
  $manifestPath = Join-Path $ReleaseDir "release\manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    return $FallbackName
  }

  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.packageName) {
      return [string]$manifest.packageName
    }
  } catch {
    Write-Warning "Unable to read release manifest: $_"
  }

  return $FallbackName
}

function Initialize-ProdSkillsFromRelease([string]$ReleaseDir, [string]$ProdSkillsDir) {
  $activeManifestPath = Join-Path $ProdSkillsDir "active\skill-manifest.json"
  if (Test-Path -LiteralPath $activeManifestPath) {
    Write-Host "Production skill library already exists. Preserving $ProdSkillsDir" -ForegroundColor Green
    return
  }

  $existingSkillFiles = @(Get-ChildItem -LiteralPath $ProdSkillsDir -Recurse -File -Force -ErrorAction SilentlyContinue)
  if ($existingSkillFiles.Count -gt 0) {
    Write-Warning "Production skill directory contains files but no active skill manifest. Leaving it unchanged: $ProdSkillsDir"
    return
  }

  $releaseSkillSeedDir = Join-Path $ReleaseDir "skills"
  if (-not (Test-Path -LiteralPath $releaseSkillSeedDir)) {
    throw "Release package does not contain the initial skill library: $releaseSkillSeedDir"
  }

  Write-Host "Initializing production skill library from release seed..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $ProdSkillsDir -Force | Out-Null
  Copy-Item -Path (Join-Path $releaseSkillSeedDir "*") -Destination $ProdSkillsDir -Recurse -Force
}

$PackagePath = Resolve-FullPath $PackagePath
$AppRoot = Resolve-FullPath $AppRoot
$releasesDir = Join-Path $AppRoot "releases"
$incomingDir = Join-Path $AppRoot "incoming"
$configDir = Join-Path $AppRoot "config"
$logsDir = Join-Path $AppRoot "logs"
$deploymentsDir = Join-Path $AppRoot "deployments"
$prodDataDir = Join-Path $AppRoot "prod-data"
$prodSkillsDir = Join-Path $AppRoot "prod-skills"
$envFile = Join-Path $configDir ".env.production"
$currentPath = Join-Path $AppRoot "current"
$packageBase = [System.IO.Path]::GetFileNameWithoutExtension($PackagePath)
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$releaseName = if ($packageBase -eq "latest") { "release-$timestamp" } else { $packageBase }
$releaseDir = Join-Path $releasesDir $releaseName

if (-not (Test-Path -LiteralPath $PackagePath)) {
  throw "Release package was not found: $PackagePath"
}

New-Item -ItemType Directory -Path $releasesDir, $incomingDir, $configDir, $logsDir, $deploymentsDir, $prodDataDir, $prodSkillsDir -Force | Out-Null

if (-not (Test-Path -LiteralPath $envFile)) {
  @"
HOST=0.0.0.0
PORT=$Port
WIKI_HOST=0.0.0.0
WIKI_PORT=$WikiPort
APP_DATA_DIR=$prodDataDir
APP_SKILLS_DIR=$prodSkillsDir
"@ | Set-Content -LiteralPath $envFile -Encoding utf8
  Write-Host "Created production env file at $envFile" -ForegroundColor Yellow
}

$effectivePort = [int](Get-EnvValue $envFile "PORT" "$Port")
$effectiveWikiPort = [int](Get-EnvValue $envFile "WIKI_PORT" "$WikiPort")
$previousRelease = Get-CurrentTarget $currentPath
$switchedCurrent = $false

try {
  if (-not $NoServiceRestart) {
    Assert-ServicesPresent $ServiceNames
    Stop-AppServices $ServiceNames
  }

  if (Test-Path -LiteralPath $releaseDir) {
    throw "Release directory already exists: $releaseDir"
  }

  Write-Host "Expanding $PackagePath to $releaseDir" -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
  Expand-Archive -LiteralPath $PackagePath -DestinationPath $releaseDir -Force

  if (-not (Test-Path -LiteralPath (Join-Path $releaseDir "package.json"))) {
    $packageRoot = Get-ChildItem -LiteralPath $releaseDir -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "package.json") } |
      Select-Object -First 1

    if (-not $packageRoot) {
      throw "The release package does not contain package.json at its root or first child directory."
    }

    foreach ($entry in Get-ChildItem -LiteralPath $packageRoot.FullName -Force) {
      Move-Item -LiteralPath $entry.FullName -Destination $releaseDir
    }
    Remove-Item -LiteralPath $packageRoot.FullName -Recurse -Force
  }

  Copy-Item -LiteralPath $envFile -Destination (Join-Path $releaseDir ".env") -Force
  Initialize-ProdSkillsFromRelease $releaseDir $prodSkillsDir

  $npmCmd = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
  if (-not (Test-Path -LiteralPath $npmCmd)) {
    throw "npm.cmd was not found. Install Node.js 22+ first. Expected path: $npmCmd"
  }

  Write-Host "Installing production dependencies..." -ForegroundColor Cyan
  Push-Location $releaseDir
  try {
    & $npmCmd ci --omit=dev
  } finally {
    Pop-Location
  }

  $manifestPackageName = Read-ReleasePackageName $releaseDir $releaseName
  if ($manifestPackageName -ne $releaseName) {
    $manifestReleaseDir = Join-Path $releasesDir $manifestPackageName
    if (-not (Test-Path -LiteralPath $manifestReleaseDir)) {
      Move-Item -LiteralPath $releaseDir -Destination $manifestReleaseDir
      $releaseDir = $manifestReleaseDir
      $releaseName = $manifestPackageName
    }
  }

  Set-CurrentJunction $currentPath $releaseDir $AppRoot
  $switchedCurrent = $true

  if (-not $NoServiceRestart) {
    Start-AppServices $ServiceNames
    Wait-HttpOk "http://127.0.0.1:$effectivePort/api/health"
    Wait-HttpOk "http://127.0.0.1:$effectiveWikiPort/health"
  }

  $deploymentRecord = [ordered]@{
    deployedAt = (Get-Date).ToString("o")
    packagePath = $PackagePath
    releaseName = $releaseName
    releaseDir = $releaseDir
    previousRelease = $previousRelease
    currentPath = $currentPath
    dataDir = $prodDataDir
    skillsDir = $prodSkillsDir
    skillSeedPolicy = "prod-skills is initialized from release skills only when no production skill files exist."
  }
  $deploymentRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $deploymentsDir "$timestamp-$releaseName.json") -Encoding utf8

  Write-Host "Deployment completed: $releaseName" -ForegroundColor Green
} catch {
  $failure = $_
  Write-Host "Deployment failed: $failure" -ForegroundColor Red

  if ($previousRelease -and (Test-Path -LiteralPath $previousRelease)) {
    Write-Warning "Rolling back current to $previousRelease"
    if (-not $NoServiceRestart) {
      Stop-AppServices $ServiceNames
    }
    Set-CurrentJunction $currentPath $previousRelease $AppRoot
    if (-not $NoServiceRestart) {
      Start-AppServices $ServiceNames
      Wait-HttpOk "http://127.0.0.1:$effectivePort/api/health" 30
      Wait-HttpOk "http://127.0.0.1:$effectiveWikiPort/health" 30
    }
  } elseif ($switchedCurrent) {
    Write-Warning "No previous release was available for rollback."
  }

  throw
}
