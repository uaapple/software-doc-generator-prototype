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

function Find-FirstFile {
  param(
    [string[]]$Directories,
    [string[]]$Patterns
  )
  foreach ($directory in $Directories) {
    if (-not $directory -or -not (Test-Path -LiteralPath $directory)) {
      continue
    }
    foreach ($pattern in $Patterns) {
      $match = Get-ChildItem -LiteralPath $directory -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName |
        Select-Object -First 1
      if ($match) {
        return $match.FullName
      }
    }
  }
  return ""
}

function Resolve-CommandPath {
  param([string]$Command)
  if (-not $Command) {
    return ""
  }
  if (Test-Path -LiteralPath $Command) {
    return (Resolve-Path -LiteralPath $Command).Path
  }
  $resolved = Get-Command $Command -ErrorAction SilentlyContinue
  if ($resolved) {
    return $resolved.Source
  }
  return ""
}

function Test-HermesCommandIsShell {
  param([string]$Command)
  $commandName = [IO.Path]::GetFileName(([string]$Command).Trim()).ToLowerInvariant()
  return $commandName -in @("powershell.exe", "powershell", "pwsh.exe", "pwsh", "cmd.exe", "cmd")
}

function Assert-HermesCommandIsExecutable {
  param([string]$Command)
  if (Test-HermesCommandIsShell -Command $Command) {
    throw "Invalid Hermes CLI command '$Command'. HERMES_COMMAND must point to hermes.exe/hermes.cmd/hermes.ps1, not a shell."
  }
}

function Start-Installer {
  param(
    [string]$Path,
    [string]$Arguments = "",
    [string]$Name = "installer"
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Name not found: $Path"
  }

  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  Write-Host "Running ${Name}: $Path"
  $logDir = Join-Path $InstallDir "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $safeName = ($Name -replace "[^A-Za-z0-9_-]", "-").Trim("-").ToLowerInvariant()
  if (-not $safeName) {
    $safeName = "installer"
  }
  $stdoutLog = Join-Path $logDir ("{0}-{1}.out.log" -f $safeName, (Get-Date -Format "yyyyMMdd-HHmmss"))
  $stderrLog = Join-Path $logDir ("{0}-{1}.err.log" -f $safeName, (Get-Date -Format "yyyyMMdd-HHmmss"))

  if ($extension -eq ".msi") {
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $Path, "/qn", "/norestart") -Wait -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  } elseif ($extension -eq ".ps1") {
    $commandLine = "-NoProfile -ExecutionPolicy Bypass -File `"$Path`" $Arguments"
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $commandLine -Wait -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  } elseif ($extension -eq ".cmd" -or $extension -eq ".bat") {
    $commandLine = "/c `"$Path`" $Arguments"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList $commandLine -Wait -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  } else {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  }

  if ($process.ExitCode -notin @(0, 3010)) {
    throw "$Name failed with exit code $($process.ExitCode): $Path. Logs: $stdoutLog ; $stderrLog"
  }
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

function Stop-WorkerServices {
  param([string[]]$ServiceNames)
  foreach ($serviceName in $ServiceNames) {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $service) {
      continue
    }
    if ($service.Status -ne "Stopped") {
      Write-Host "Stopping Windows service $serviceName..."
      Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
      try {
        $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
      } catch {
        Write-Warning "Timed out waiting for service ${serviceName} to stop: $($_.Exception.Message)"
      }
    }
  }
}
function Get-NormalizedCommandText {
  param([string]$Value)
  return ([string]$Value).ToLowerInvariant().Replace("\", "/")
}

function Get-WorkerRuntimeProcessIds {
  param([string]$WorkerInstallDir)

  $resolvedInstallDir = (Resolve-Path -LiteralPath $WorkerInstallDir -ErrorAction SilentlyContinue).Path
  if (-not $resolvedInstallDir) {
    $resolvedInstallDir = $WorkerInstallDir
  }
  $installNeedle = Get-NormalizedCommandText -Value $resolvedInstallDir
  $processes = @(Get-CimInstance Win32_Process)
  $matched = New-Object 'System.Collections.Generic.HashSet[int]'
  $childrenByParent = @{}

  foreach ($process in $processes) {
    $parentId = [int]($process.ParentProcessId)
    if (-not $childrenByParent.ContainsKey($parentId)) {
      $childrenByParent[$parentId] = New-Object 'System.Collections.Generic.List[int]'
    }
    $childrenByParent[$parentId].Add([int]$process.ProcessId)
  }

  foreach ($process in $processes) {
    $name = ([string]$process.Name).ToLowerInvariant()
    $command = Get-NormalizedCommandText -Value $process.CommandLine
    $isWorkerNode =
      $name -eq "node.exe" -and (
        ($installNeedle -and $command.Contains($installNeedle)) -or
        $command.Contains("src/hermes-server.js") -or
        $command.Contains("src/matlab-worker-server.js") -or
        $command.Contains("hermes:start") -or
        $command.Contains("matlab-worker:start")
      )
    $isWorkerMatlab =
      $name -eq "matlab.exe" -and (
        $command.Contains("matlab_mcp.initializemcp") -or
        $command.Contains("mw_mcp_session_dir")
      )

    if ($isWorkerNode -or $isWorkerMatlab) {
      [void]$matched.Add([int]$process.ProcessId)
    }
  }

  $queue = New-Object 'System.Collections.Generic.Queue[int]'
  foreach ($processId in @($matched)) {
    $queue.Enqueue($processId)
  }
  while ($queue.Count -gt 0) {
    $processId = $queue.Dequeue()
    if (-not $childrenByParent.ContainsKey($processId)) {
      continue
    }
    foreach ($childId in $childrenByParent[$processId]) {
      if ($matched.Add([int]$childId)) {
        $queue.Enqueue([int]$childId)
      }
    }
  }

  return @($matched)
}

function Stop-WorkerRuntimeProcesses {
  param(
    [string]$WorkerInstallDir,
    [int]$TimeoutSeconds = 20
  )

  $processIds = @(Get-WorkerRuntimeProcessIds -WorkerInstallDir $WorkerInstallDir)
  if (-not $processIds.Count) {
    Write-Host "No existing Software Doc worker node/MATLAB processes were found."
    return
  }

  Write-Host "Stopping existing Software Doc worker runtime processes: $($processIds -join ', ')"
  foreach ($processId in $processIds | Sort-Object -Descending) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      Write-Warning "Could not stop process ${processId}: $($_.Exception.Message)"
    }
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $remaining = @(Get-WorkerRuntimeProcessIds -WorkerInstallDir $WorkerInstallDir)
    if (-not $remaining.Count) {
      Write-Host "Existing worker runtime processes stopped."
      return
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for old worker runtime processes to stop: $($remaining -join ', ')"
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

function Install-WorkerServices {
  param(
    [string]$ServiceInstallerPath,
    [string]$WorkerInstallDir
  )
  if (-not (Test-Path -LiteralPath $ServiceInstallerPath)) {
    throw "Worker service installer not found: $ServiceInstallerPath"
  }
  & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $ServiceInstallerPath `
    -InstallDir $WorkerInstallDir `
    -Action Install `
    -RemoveLegacyTasks
  if ($LASTEXITCODE -ne 0) {
    throw "Worker service installer failed with exit code $LASTEXITCODE"
  }
}
function Wait-WorkerPorts {
  param(
    [hashtable]$TaskPorts,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $missing = @()
    foreach ($entry in $TaskPorts.GetEnumerator()) {
      $port = [int]$entry.Value
      $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
      if (-not $listener) {
        $missing += "$($entry.Key):$port"
      }
    }
    if (-not $missing.Count) {
      Write-Host "Worker ports are listening: $($TaskPorts.Values -join ', ')"
      return
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  foreach ($taskName in $TaskPorts.Keys) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
      Write-Warning "$taskName state=$($task.State) lastResult=$($info.LastTaskResult) lastRun=$($info.LastRunTime)"
    } else {
      Write-Warning "$taskName is not registered."
    }
  }
  throw "Worker services did not start listening on expected ports within $TimeoutSeconds seconds: $($missing -join ', ')"
}

function Ensure-WorkerTasks {
  param(
    [hashtable]$TaskServices,
    [string]$RunnerPath,
    [string]$WorkerInstallDir
  )

  if (-not (Test-Path -LiteralPath $RunnerPath)) {
    throw "Worker runner not found: $RunnerPath"
  }

  foreach ($entry in $TaskServices.GetEnumerator()) {
    $taskName = [string]$entry.Key
    $service = [string]$entry.Value
    Write-Host "Registering scheduled task $taskName..."
    $arguments = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", "`"$RunnerPath`"",
      "-Service", $service,
      "-InstallDir", "`"$WorkerInstallDir`""
    ) -join " "
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $WorkerInstallDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal `
      -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
      -LogonType Interactive `
      -RunLevel Highest
    Register-ScheduledTask `
      -TaskName $taskName `
      -Action $action `
      -Trigger $trigger `
      -Principal $principal `
      -Description "Software document generator $service worker" `
      -Force | Out-Null
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

function Write-SourceUpdateDeployerLauncher {
  $launcherPath = Join-Path $InstallDir "Deploy-WindowsWorkerSourceUpdate.cmd"
  $lines = @(
    "@echo off",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""%~dp0app\scripts\Deploy-WindowsWorkerSourceUpdate.ps1""",
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

function Get-EnvFileMap {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
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
    $map[$key] = $value
  }

  return $map
}

function Add-MissingEnvValue {
  param(
    [string]$Path,
    [hashtable]$Map,
    [string]$Key,
    [string]$Value
  )

  if ($Map.ContainsKey($Key) -or -not $Value) {
    return
  }

  Add-Content -LiteralPath $Path -Encoding UTF8 -Value "$Key=$Value"
  $Map[$Key] = $Value
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $lines = @()
  if (Test-Path -LiteralPath $Path) {
    $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
  }

  $found = $false
  $updated = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) {
    $updated += "$Key=$Value"
  }

  [System.IO.File]::WriteAllLines($Path, [string[]]$updated, [System.Text.UTF8Encoding]::new($false))
}

function Install-PortableHermes {
  param(
    [string]$BundleRoot,
    [string]$WorkerInstallDir
  )

  $sourceRoot = Join-Path $BundleRoot "offline-installers\hermes"
  $portableCommand = Find-FirstFile -Directories @($sourceRoot) -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
  if (-not $portableCommand) {
    return ""
  }

  $targetRoot = Join-Path $WorkerInstallDir "runtime\hermes"
  if (Test-Path -LiteralPath $targetRoot) {
    Remove-Item -LiteralPath $targetRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
  Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $targetRoot -Recurse -Force

  $targetCommand = Find-FirstFile -Directories @($targetRoot) -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
  if ($targetCommand) {
    Assert-HermesCommandIsExecutable -Command $targetCommand
  }
  return $targetCommand
}

function Get-BundledHermesTag {
  param([string]$BundleRoot)
  $sourceRoot = Join-Path $BundleRoot "offline-installers\hermes"
  if (-not (Test-Path -LiteralPath $sourceRoot)) {
    return ""
  }
  $archive = Get-ChildItem -LiteralPath $sourceRoot -Filter "hermes-agent-v*.zip" -File -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if (-not $archive) {
    return ""
  }
  if ($archive.Name -match "hermes-agent-(v[0-9][0-9A-Za-z\.\-]*)-github-source\.zip") {
    return $Matches[1]
  }
  return ""
}

function Resolve-HermesInstaller {
  param([string]$BundleRoot)
  return Find-FirstFile -Directories @((Join-Path $BundleRoot "offline-installers\hermes")) -Patterns @("install.ps1", "*.msi", "*setup*.exe", "*installer*.exe", "*.cmd", "*.bat")
}

function Find-InstalledHermesCommand {
  param([string]$WorkerInstallDir)
  $candidates = @(
    (Join-Path $WorkerInstallDir "runtime\hermes-agent\venv\Scripts"),
    (Join-Path $WorkerInstallDir "runtime\hermes-agent"),
    (Join-Path $WorkerInstallDir "runtime\hermes"),
    (Join-Path $env:LOCALAPPDATA "hermes"),
    (Join-Path $env:USERPROFILE ".local"),
    $env:APPDATA
  )
  $fromPath = Resolve-CommandPath -Command "hermes"
  if ($fromPath) {
    return $fromPath
  }
  return Find-FirstFile -Directories $candidates -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
}

function Install-HermesFromInstaller {
  param(
    [string]$BundleRoot,
    [string]$WorkerInstallDir,
    [string]$WorkerEnvPath
  )

  $offlineInstaller = Join-Path $BundleRoot "offline-installers\hermes\Install-HermesOffline.ps1"
  if (Test-Path -LiteralPath $offlineInstaller) {
    $hermesHome = Join-Path $WorkerInstallDir "runtime\hermes-home"
    $hermesInstallDir = Join-Path $WorkerInstallDir "runtime\hermes-agent"
    Start-Installer `
      -Path $offlineInstaller `
      -Arguments "-HermesHome `"$hermesHome`" -InstallDir `"$hermesInstallDir`" -WorkerEnvPath `"$WorkerEnvPath`"" `
      -Name "Hermes CLI offline installer"
    $installed = Find-InstalledHermesCommand -WorkerInstallDir $WorkerInstallDir
    if ($installed) {
      Assert-HermesCommandIsExecutable -Command $installed
    }
    return $installed
  }

  $installer = Resolve-HermesInstaller -BundleRoot $BundleRoot
  if (-not $installer) {
    return ""
  }

  $extension = [IO.Path]::GetExtension($installer).ToLowerInvariant()
  $arguments = ""
  if ($extension -eq ".ps1") {
    $tag = Get-BundledHermesTag -BundleRoot $BundleRoot
    $tagArg = if ($tag) { " -Tag `"$tag`"" } else { "" }
    $hermesHome = Join-Path $WorkerInstallDir "runtime\hermes-home"
    $hermesInstallDir = Join-Path $WorkerInstallDir "runtime\hermes-agent"
    $arguments = "-SkipSetup -NonInteractive -HermesHome `"$hermesHome`" -InstallDir `"$hermesInstallDir`"$tagArg"
  }

  Start-Installer -Path $installer -Arguments $arguments -Name "Hermes CLI installer"
  $installed = Find-InstalledHermesCommand -WorkerInstallDir $WorkerInstallDir
  if ($installed) {
    Assert-HermesCommandIsExecutable -Command $installed
  }
  return $installed
}

function Ensure-HermesCommand {
  param(
    [string]$Path,
    [string]$BundleRoot,
    [string]$WorkerInstallDir
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment file was not found: $Path. Run the full Windows worker deployment first."
  }

  $envMap = Get-EnvFileMap -Path $Path
  $currentCommand = [string]$envMap["HERMES_COMMAND"]
  if ($currentCommand -and -not (Test-HermesCommandIsShell -Command $currentCommand)) {
    $resolvedCurrent = Resolve-CommandPath -Command $currentCommand
    if ($resolvedCurrent) {
      Assert-HermesCommandIsExecutable -Command $resolvedCurrent
      Set-EnvValue -Path $Path -Key "HERMES_COMMAND" -Value $resolvedCurrent
      Write-Host "Hermes CLI command is available: $resolvedCurrent"
      return
    }
  }

  $portableHermes = Install-PortableHermes -BundleRoot $BundleRoot -WorkerInstallDir $WorkerInstallDir
  if ($portableHermes) {
    Set-EnvValue -Path $Path -Key "HERMES_COMMAND" -Value $portableHermes
    Write-Host "Installed bundled Hermes CLI: $portableHermes"
    return
  }

  $pathHermes = Resolve-CommandPath -Command "hermes"
  if ($pathHermes) {
    Assert-HermesCommandIsExecutable -Command $pathHermes
    Set-EnvValue -Path $Path -Key "HERMES_COMMAND" -Value $pathHermes
    Write-Host "Hermes CLI command is available on PATH: $pathHermes"
    return
  }

  $installedHermes = Install-HermesFromInstaller -BundleRoot $BundleRoot -WorkerInstallDir $WorkerInstallDir -WorkerEnvPath $Path
  if ($installedHermes) {
    Set-EnvValue -Path $Path -Key "HERMES_COMMAND" -Value $installedHermes
    Write-Host "Installed Hermes CLI from bundled GitHub installer: $installedHermes"
    return
  }

  $detail = if ($currentCommand) { " Current HERMES_COMMAND='$currentCommand'." } else { "" }
  throw "Hermes CLI is required for SLX interpretation, but no hermes.exe/hermes.cmd/hermes.ps1 or GitHub install.ps1 was found in this source update package or PATH.$detail Bundle Hermes under offline-installers\hermes and redeploy."
}

function Ensure-WorkerEnvDefaults {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $envMap = Get-EnvFileMap -Path $Path
  Add-MissingEnvValue -Path $Path -Map $envMap -Key "SLX_ANALYSIS_BACKEND" -Value "legacy"

  $matlabExecutable = [string]$envMap["MATLAB_EXECUTABLE"]
  if ($matlabExecutable) {
    $matlabRoot = Split-Path -Parent (Split-Path -Parent $matlabExecutable)
    Add-MissingEnvValue -Path $Path -Map $envMap -Key "MATLAB_ROOT" -Value $matlabRoot
  }
}

$bundleRoot = Resolve-BundleRoot
$sourceAppDir = Join-Path $bundleRoot "app"
$targetAppDir = Join-Path $InstallDir "app"
$envFile = Join-Path $InstallDir "software-doc-worker.env"
$taskNames = @("SoftwareDocHermesAgent", "SoftwareDocMatlabWorker")
$taskServices = @{
  SoftwareDocHermesAgent = "hermes"
  SoftwareDocMatlabWorker = "matlab"
}
$taskPorts = @{
  SoftwareDocHermesAgent = 3101
  SoftwareDocMatlabWorker = 5100
}
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
} else {
  Ensure-WorkerEnvDefaults -Path $envFile
  Ensure-HermesCommand -Path $envFile -BundleRoot $bundleRoot -WorkerInstallDir $InstallDir
}

$oldLockHash = Get-FileHashValue -Path (Join-Path $targetAppDir "package-lock.json")
$newLockHash = Get-FileHashValue -Path (Join-Path $sourceAppDir "package-lock.json")
$backupDir = Join-Path $InstallDir ("backups\source-update-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

Stop-WorkerServices -ServiceNames $taskNames
Stop-WorkerTasks -TaskNames $taskNames
Stop-WorkerRuntimeProcesses -WorkerInstallDir $InstallDir
Backup-ManagedSource -TargetAppDir $targetAppDir -BackupDir $backupDir -ManagedPaths $managedPaths

foreach ($relativePath in $managedPaths) {
  Copy-ManagedPath -SourceAppDir $sourceAppDir -TargetAppDir $targetAppDir -RelativePath $relativePath
}
Ensure-AppRuntimeDirectories -TargetAppDir $targetAppDir
Sync-HermesLlmProfiles -TargetAppDir $targetAppDir
Write-HermesLlmMenuLauncher
Write-SourceUpdateDeployerLauncher

$officialDependenciesInstaller = Join-Path $targetAppDir "scripts\Install-WindowsWorkerOfficialDependencies.ps1"
if ((Test-Path -LiteralPath $officialDependenciesInstaller) -and (Test-Path -LiteralPath $envFile)) {
  & $officialDependenciesInstaller `
    -InstallDir $InstallDir `
    -BundleRoot $bundleRoot `
    -TargetAppDir $targetAppDir `
    -WorkerEnvPath $envFile
}

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
  $workerServiceInstaller = Join-Path $targetAppDir "scripts\Install-WindowsWorkerServices.ps1"
  if (Test-Path -LiteralPath $workerServiceInstaller) {
    Install-WorkerServices `
      -ServiceInstallerPath $workerServiceInstaller `
      -WorkerInstallDir $InstallDir
  } else {
    Ensure-WorkerTasks `
      -TaskServices $taskServices `
      -RunnerPath (Join-Path $targetAppDir "scripts\run-windows-worker-service.ps1") `
      -WorkerInstallDir $InstallDir
    Start-WorkerTasks -TaskNames $taskNames
  }
  Wait-WorkerPorts -TaskPorts $taskPorts
}
Write-Host "Windows worker source update applied."
Write-Host "Install dir: $InstallDir"
Write-Host "Backup dir: $backupDir"
Write-Host "Hermes health: http://127.0.0.1:3101/api/health"
Write-Host "MATLAB worker health: http://127.0.0.1:5100/health"
Write-Host "Hermes LLM switcher: $targetAppDir\scripts\Switch-HermesLlmProfile.ps1"
Write-Host "Hermes LLM menu launcher: $InstallDir\Switch-HermesLlm.cmd"
Write-Host "Source update deployer: $InstallDir\Deploy-WindowsWorkerSourceUpdate.cmd"
