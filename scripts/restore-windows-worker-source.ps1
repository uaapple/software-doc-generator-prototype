param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
$ManifestSchema = "software-doc-worker-source-backup/v1"
$KnownUnits = @("SoftwareDocHermesAgent", "SoftwareDocMatlabWorker")
$ExpectedPorts = @(3101, 5100)
$AllowedManagedPaths = @(
  ".env.defaults", "package.json", "package-lock.json", "src", "scripts",
  "tools", "templates", "skills", "public", "docs", "requirements"
)

function Get-FullPath {
  param([string]$Path)
  return [IO.Path]::GetFullPath($Path).TrimEnd("\").TrimEnd("/")
}

function Get-SafeRelativePath {
  param(
    [string]$Path,
    [string]$Root
  )
  $fullPath = Get-FullPath -Path $Path
  $fullRoot = Get-FullPath -Path $Root
  if (-not $fullPath.StartsWith($fullRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Cannot make path relative because it escapes '$fullRoot': $fullPath"
  }
  return $fullPath.Substring($fullRoot.Length + 1).Replace("\", "/")
}

function Assert-PathWithin {
  param(
    [string]$Path,
    [string]$Parent,
    [string]$Description
  )
  $fullPath = Get-FullPath -Path $Path
  $fullParent = Get-FullPath -Path $Parent
  if (-not $fullPath.StartsWith($fullParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Description escapes the allowed root '$fullParent': $fullPath"
  }
  return $fullPath
}

function Assert-NoReparsePoint {
  param(
    [string]$Path,
    [string]$StopAt
  )
  $current = Get-FullPath -Path $Path
  $stop = Get-FullPath -Path $StopAt
  while ($current.StartsWith($stop, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Reparse points are not allowed in rollback paths: $current"
      }
    }
    if ($current.Equals($stop, [StringComparison]::OrdinalIgnoreCase)) {
      break
    }
    $parent = Split-Path -Parent $current
    if (-not $parent -or $parent -eq $current) {
      break
    }
    $current = $parent
  }
}

function Assert-ManagedRelativePath {
  param([string]$RelativePath)
  $normalized = ([string]$RelativePath).Replace("\", "/").Trim("/")
  if (
    -not $normalized -or
    [IO.Path]::IsPathRooted($normalized) -or
    $normalized -match "(^|/)\.\.(/|$)" -or
    $normalized -match "(^|/)\.(/|$)"
  ) {
    throw "Unsafe managed path in backup manifest: '$RelativePath'"
  }
  $forbiddenRoots = @(
    ".env", "node_modules", "runtime", "data", "addon", "tmp",
    "software-doc-worker.env", "config", "logs", "input", "output"
  )
  $root = $normalized.Split("/")[0].ToLowerInvariant()
  if ($root -in $forbiddenRoots) {
    throw "Backup manifest attempts to manage protected path '$RelativePath'."
  }
  return $normalized
}

function Get-BackupInventory {
  param(
    [string]$Path,
    [string]$BackupRoot
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }
  $item = Get-Item -LiteralPath $Path -Force
  $files = if ($item.PSIsContainer) {
    @(Get-ChildItem -LiteralPath $Path -File -Recurse -Force | Sort-Object FullName)
  } else {
    @($item)
  }
  return @($files | ForEach-Object {
    [PSCustomObject]@{
      path = Get-SafeRelativePath -Path $_.FullName -Root $BackupRoot
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    }
  })
}

function Read-AndValidateManifest {
  param(
    [string]$ResolvedInstallDir,
    [string]$ResolvedBackupDir
  )
  $backupsRoot = Join-Path $ResolvedInstallDir "backups"
  $validatedBackupDir = Assert-PathWithin -Path $ResolvedBackupDir -Parent $backupsRoot -Description "BackupDir"
  if ((Get-FullPath -Path (Split-Path -Parent $validatedBackupDir)) -ne (Get-FullPath -Path $backupsRoot)) {
    throw "BackupDir must be a direct child of '$backupsRoot'."
  }
  if ((Split-Path -Leaf $validatedBackupDir) -notlike "source-update-*") {
    throw "BackupDir must be an InstallDir\\backups\\source-update-* directory: $validatedBackupDir"
  }
  Assert-NoReparsePoint -Path $validatedBackupDir -StopAt $ResolvedInstallDir

  $manifestPath = Join-Path $validatedBackupDir "source-backup-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Backup manifest was not found: $manifestPath"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]$manifest.schema -ne $ManifestSchema) {
    throw "Unsupported backup manifest schema '$($manifest.schema)'; expected '$ManifestSchema'."
  }
  if ((Get-FullPath -Path ([string]$manifest.installDir)) -ne $ResolvedInstallDir) {
    throw "Backup manifest InstallDir does not match requested InstallDir."
  }
  $targetAppDir = Get-FullPath -Path (Join-Path $ResolvedInstallDir "app")
  if ((Get-FullPath -Path ([string]$manifest.targetAppDir)) -ne $targetAppDir) {
    throw "Backup manifest TargetAppDir does not match '$targetAppDir'."
  }
  if (-not $manifest.createdAtUtc -or -not $manifest.paths) {
    throw "Backup manifest is missing createdAtUtc or paths."
  }
  try {
    [DateTimeOffset]::Parse([string]$manifest.createdAtUtc) | Out-Null
  } catch {
    throw "Backup manifest createdAtUtc is invalid."
  }

  $declaredManaged = @($manifest.managedPaths | ForEach-Object {
    Assert-ManagedRelativePath -RelativePath ([string]$_)
  })
  if (
    $declaredManaged.Count -ne $AllowedManagedPaths.Count -or
    @($AllowedManagedPaths | Where-Object { $_ -notin $declaredManaged }).Count -ne 0
  ) {
    throw "Backup manifest managedPaths do not exactly match the supported source updater paths."
  }
  $entries = @($manifest.paths)
  if ($declaredManaged.Count -ne $entries.Count) {
    throw "Backup manifest managedPaths and paths counts differ."
  }
  $seen = @{}
  foreach ($entry in $entries) {
    $relativePath = Assert-ManagedRelativePath -RelativePath ([string]$entry.path)
    if ($seen.ContainsKey($relativePath)) {
      throw "Backup manifest contains duplicate managed path '$relativePath'."
    }
    $seen[$relativePath] = $true
    if ($relativePath -notin $declaredManaged) {
      throw "Backup manifest path '$relativePath' is not declared in managedPaths."
    }
    $backupPath = Assert-PathWithin -Path (Join-Path $validatedBackupDir $relativePath) -Parent $validatedBackupDir -Description "Backup entry"
    $targetPath = Assert-PathWithin -Path (Join-Path $targetAppDir $relativePath) -Parent $targetAppDir -Description "Restore target"
    Assert-NoReparsePoint -Path $backupPath -StopAt $validatedBackupDir
    Assert-NoReparsePoint -Path $targetPath -StopAt $targetAppDir

    $existed = [bool]$entry.existed
    if ($existed) {
      if (-not (Test-Path -LiteralPath $backupPath)) {
        throw "Backup data is missing for pre-update path '$relativePath'."
      }
      $actual = @(Get-BackupInventory -Path $backupPath -BackupRoot $validatedBackupDir)
      $expected = @($entry.files)
      if ($actual.Count -ne $expected.Count) {
        throw "Backup file count mismatch for '$relativePath'."
      }
      for ($index = 0; $index -lt $expected.Count; $index += 1) {
        if (
          [string]$actual[$index].path -ne [string]$expected[$index].path -or
          [string]$actual[$index].sha256 -ne ([string]$expected[$index].sha256).ToLowerInvariant()
        ) {
          throw "Backup hash inventory mismatch for '$relativePath' at '$($actual[$index].path)'."
        }
      }
    } elseif ((@($entry.files)).Count -ne 0 -or (Test-Path -LiteralPath $backupPath)) {
      throw "Pre-update-missing path '$relativePath' unexpectedly has backup data."
    }
  }
  if (-not $manifest.serviceShape) {
    throw "Backup manifest is missing serviceShape."
  }
  $serviceUnits = @($manifest.serviceShape.windowsServices)
  $taskUnits = @($manifest.serviceShape.scheduledTasks)
  foreach ($unit in $serviceUnits + $taskUnits) {
    if ([string]$unit -notin $KnownUnits) {
      throw "Backup manifest contains unsupported service/task '$unit'."
    }
  }
  foreach ($knownUnit in $KnownUnits) {
    $activeShapes = @($serviceUnits | Where-Object { $_ -eq $knownUnit }).Count +
      @($taskUnits | Where-Object { $_ -eq $knownUnit }).Count
    if ($activeShapes -ne 1) {
      throw "Backup manifest must record exactly one active service shape for '$knownUnit'; found $activeShapes."
    }
  }
  return [PSCustomObject]@{
    Manifest = $manifest
    BackupDir = $validatedBackupDir
    TargetAppDir = $targetAppDir
  }
}

function Stop-KnownRuntime {
  param([string]$ResolvedInstallDir)
  foreach ($name in $KnownUnits) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne "Stopped") {
      Stop-Service -Name $name -Force
      $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
    }
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($task -and $task.State -eq "Running") {
      Stop-ScheduledTask -TaskName $name
    }
  }

  $installNeedle = $ResolvedInstallDir.ToLowerInvariant().Replace("\", "/")
  $processes = @(Get-CimInstance Win32_Process)
  $matched = @($processes | Where-Object {
    $name = ([string]$_.Name).ToLowerInvariant()
    $command = ([string]$_.CommandLine).ToLowerInvariant().Replace("\", "/")
    $isWorkerNode = $name -eq "node.exe" -and (
      $command.Contains($installNeedle) -or
      $command.Contains("src/hermes-server.js") -or
      $command.Contains("src/matlab-worker-server.js")
    )
    $isWorkerMatlab = $name -eq "matlab.exe" -and (
      $command.Contains("matlab_mcp.initializemcp") -or
      $command.Contains("mw_mcp_session_dir")
    )
    $isHermesResidual =
      $name -in @("python.exe", "pythonw.exe", "hermes.exe", "powershell.exe", "pwsh.exe", "cmd.exe", "bash.exe", "sh.exe") -and
      (
        $command.Contains("src/hermes-server.js") -or
        $command.Contains("runtime/hermes-agent") -or
        $command.Contains("runtime/hermes-home") -or
        $command.Contains("hermes_cli.main") -or
        $command.Contains("run_agent")
      )
    $isWorkerNode -or $isWorkerMatlab -or $isHermesResidual
  })
  foreach ($process in $matched | Sort-Object ProcessId -Descending) {
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
  }
}

function Restore-ManagedPaths {
  param([PSCustomObject]$Validated)
  foreach ($entry in @($Validated.Manifest.paths)) {
    $relativePath = ([string]$entry.path).Replace("/", "\")
    $target = Join-Path $Validated.TargetAppDir $relativePath
    $backup = Join-Path $Validated.BackupDir $relativePath
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
    if ([bool]$entry.existed) {
      Copy-Item -LiteralPath $backup -Destination $target -Recurse -Force
    }
  }
}

function Start-OriginalUnits {
  param([PSCustomObject]$Manifest)
  foreach ($name in @($Manifest.serviceShape.windowsServices)) {
    $service = Get-Service -Name ([string]$name) -ErrorAction SilentlyContinue
    if (-not $service) {
      throw "Pre-update Windows service '$name' no longer exists."
    }
    Start-Service -Name ([string]$name)
  }
  foreach ($name in @($Manifest.serviceShape.scheduledTasks)) {
    $task = Get-ScheduledTask -TaskName ([string]$name) -ErrorAction SilentlyContinue
    if (-not $task) {
      throw "Pre-update scheduled task '$name' no longer exists."
    }
    Start-ScheduledTask -TaskName ([string]$name)
  }
}

function Wait-Health {
  $deadline = (Get-Date).AddSeconds(60)
  do {
    $missing = @($ExpectedPorts | Where-Object {
      -not (Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue)
    })
    if (-not $missing.Count) {
      Invoke-RestMethod -Uri "http://127.0.0.1:3101/api/health" -TimeoutSec 10 | Out-Null
      Invoke-RestMethod -Uri "http://127.0.0.1:5100/health" -TimeoutSec 10 | Out-Null
      return
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  throw "Restored workers did not become healthy on ports 3101 and 5100 within 60 seconds."
}

$resolvedInstallDir = Get-FullPath -Path $InstallDir
if (-not (Test-Path -LiteralPath $resolvedInstallDir -PathType Container)) {
  throw "InstallDir does not exist: $resolvedInstallDir"
}
$resolvedBackupDir = Get-FullPath -Path $BackupDir
$validated = Read-AndValidateManifest -ResolvedInstallDir $resolvedInstallDir -ResolvedBackupDir $resolvedBackupDir
Write-Host "Backup validation passed: $($validated.BackupDir)"
if ($ValidateOnly) {
  exit 0
}

Stop-KnownRuntime -ResolvedInstallDir $resolvedInstallDir
Restore-ManagedPaths -Validated $validated
Start-OriginalUnits -Manifest $validated.Manifest
Wait-Health
Write-Host "Windows worker source rollback completed and ports 3101/5100 are healthy."
