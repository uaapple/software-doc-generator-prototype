param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [string]$MatlabExecutable = "C:\Program Files\MATLAB\R2025b\bin\matlab.exe",
  [string]$MatlabInstallerPath = "",
  [string]$MatlabInstallerArgs = "",
  [string]$McpServerCommand = "",
  [string]$McpServerPackagePath = "",
  [string]$NodeInstallerPath = "",
  [string]$HermesCommand = "hermes",
  [string]$HermesInstallerPath = "",
  [string]$HermesInstallerArgs = "",
  [string]$MatlabAuthToken = "",
  [string]$HermesAuthToken = "",
  [switch]$SkipTaskRegistration
)

$ErrorActionPreference = "Stop"
$Script:RuntimePathEntries = @()
$Script:NodeHome = ""

function New-Token {
  return (([guid]::NewGuid().ToString("N")) + ([guid]::NewGuid().ToString("N")))
}

function Resolve-BundleRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $candidates = @(
    $scriptDir,
    (Split-Path -Parent $scriptDir)
  )

  foreach ($root in $candidates) {
    if (-not $root) {
      continue
    }
    if (
      (Test-Path -LiteralPath (Join-Path $root "app\package.json")) -or
      (Test-Path -LiteralPath (Join-Path $root "package.json")) -or
      (Test-Path -LiteralPath (Join-Path $root "offline-installers"))
    ) {
      return $root
    }
  }

  return $scriptDir
}

$Script:BundleRoot = Resolve-BundleRoot
$Script:OfflineRoot = Join-Path $Script:BundleRoot "offline-installers"

function Resolve-BundleAppDir {
  $bundleRoots = @(
    $Script:BundleRoot,
    (Split-Path -Parent $Script:BundleRoot)
  )

  foreach ($root in $bundleRoots) {
    if (-not $root) {
      continue
    }

    $bundleAppDir = Join-Path $root "app"
    if (Test-Path -LiteralPath (Join-Path $bundleAppDir "package.json")) {
      return $bundleAppDir
    }

    if (Test-Path -LiteralPath (Join-Path $root "package.json")) {
      return $root
    }
  }

  throw "Cannot find app package. Run this script from the worker bundle or repository."
}

function Add-RuntimePathEntry {
  param([string]$PathEntry)
  if (-not $PathEntry -or -not (Test-Path -LiteralPath $PathEntry)) {
    return
  }
  $resolved = (Resolve-Path -LiteralPath $PathEntry).Path
  if ($Script:RuntimePathEntries -notcontains $resolved) {
    $Script:RuntimePathEntries += $resolved
  }
  $pathItems = @($env:Path -split ";" | Where-Object { $_ })
  if ($pathItems -notcontains $resolved) {
    $env:Path = "$resolved;$env:Path"
  }
}

function Sync-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $combined = @($machinePath, $userPath, $env:Path) -join ";"
  $env:Path = $combined
  foreach ($entry in $Script:RuntimePathEntries) {
    Add-RuntimePathEntry -PathEntry $entry
  }
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

function Test-CommandAvailable {
  param([string]$Command)
  return [bool](Resolve-CommandPath -Command $Command)
}

function Assert-HermesCommandIsExecutable {
  param([string]$Command)
  $commandName = [IO.Path]::GetFileName(([string]$Command).Trim()).ToLowerInvariant()
  if ($commandName -in @("powershell.exe", "powershell", "pwsh.exe", "pwsh", "cmd.exe", "cmd")) {
    throw "Invalid Hermes CLI command '$Command'. HERMES_COMMAND must point to hermes.exe/hermes.cmd/hermes.ps1, not a shell."
  }
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

function Install-PortableNode {
  param([string]$ZipPath)
  if (-not (Test-Path -LiteralPath $ZipPath)) {
    throw "Node.js portable zip not found: $ZipPath"
  }

  $runtimeRoot = Join-Path $InstallDir "runtime\node"
  if (Test-Path -LiteralPath $runtimeRoot) {
    Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $runtimeRoot -Force

  $nodeExe = Find-FirstFile -Directories @($runtimeRoot) -Patterns @("node.exe")
  if (-not $nodeExe) {
    throw "Node.js portable zip did not contain node.exe: $ZipPath"
  }

  $nodeHome = Split-Path -Parent $nodeExe
  $npmCmd = Join-Path $nodeHome "npm.cmd"
  if (-not (Test-Path -LiteralPath $npmCmd)) {
    throw "Node.js portable zip did not contain npm.cmd next to node.exe: $ZipPath"
  }

  $Script:NodeHome = $nodeHome
  Add-RuntimePathEntry -PathEntry $nodeHome
}

function Ensure-Node {
  $nodePath = Resolve-CommandPath -Command "node.exe"
  $npmPath = Resolve-CommandPath -Command "npm.cmd"
  if ($nodePath -and $npmPath) {
    $Script:NodeHome = Split-Path -Parent $nodePath
    Add-RuntimePathEntry -PathEntry $Script:NodeHome
    return
  }

  $nodeSource = $NodeInstallerPath
  if (-not $nodeSource) {
    $nodeSource = Find-FirstFile -Directories @(
      (Join-Path $Script:OfflineRoot "node"),
      (Join-Path $Script:BundleRoot "node-installer")
    ) -Patterns @("node-*-win-x64.zip", "node-*-x64.msi", "*.msi", "*.zip")
  }
  if (-not $nodeSource) {
    throw "Node.js was not found and no bundled installer was found. Put node-v22+ x64 MSI or win-x64 zip under offline-installers\node, or pass -NodeInstallerPath."
  }

  $extension = [IO.Path]::GetExtension($nodeSource).ToLowerInvariant()
  if ($extension -eq ".zip") {
    Install-PortableNode -ZipPath $nodeSource
  } elseif ($extension -eq ".msi") {
    Start-Installer -Path $nodeSource -Name "Node.js installer"
    Sync-ProcessPath
  } else {
    throw "Unsupported Node.js installer type: $nodeSource"
  }

  $nodePath = Resolve-CommandPath -Command "node.exe"
  $npmPath = Resolve-CommandPath -Command "npm.cmd"
  if (-not $nodePath -or -not $npmPath) {
    throw "Node.js install completed but node.exe/npm.cmd still cannot be found."
  }
  $Script:NodeHome = Split-Path -Parent $nodePath
  Add-RuntimePathEntry -PathEntry $Script:NodeHome
}

function Resolve-MatlabInstaller {
  if ($MatlabInstallerPath) {
    return $MatlabInstallerPath
  }
  return Find-FirstFile -Directories @((Join-Path $Script:OfflineRoot "matlab")) -Patterns @("install.ps1", "setup.exe", "*.cmd", "*.bat", "*.exe")
}

function Ensure-Matlab {
  if (Test-Path -LiteralPath $MatlabExecutable) {
    return
  }

  $installer = Resolve-MatlabInstaller
  if ($installer) {
    Start-Installer -Path $installer -Arguments $MatlabInstallerArgs -Name "MATLAB installer"
  }

  if (-not (Test-Path -LiteralPath $MatlabExecutable)) {
    throw "MATLAB executable not found: $MatlabExecutable. The default target is MATLAB R2025b. Install MATLAB first, or bundle its offline installer under offline-installers\matlab and pass silent install args if required."
  }
}

function Install-PortableHermes {
  $portableCommand = Find-FirstFile -Directories @((Join-Path $Script:OfflineRoot "hermes")) -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
  if (-not $portableCommand) {
    return ""
  }

  $sourceRoot = Join-Path $Script:OfflineRoot "hermes"
  $targetRoot = Join-Path $InstallDir "runtime\hermes"
  if (Test-Path -LiteralPath $targetRoot) {
    Remove-Item -LiteralPath $targetRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
  Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $targetRoot -Recurse -Force

  $targetCommand = Find-FirstFile -Directories @($targetRoot) -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
  if ($targetCommand) {
    Add-RuntimePathEntry -PathEntry (Split-Path -Parent $targetCommand)
  }
  return $targetCommand
}

function Resolve-HermesInstaller {
  if ($HermesInstallerPath) {
    return $HermesInstallerPath
  }
  $offlineInstaller = Join-Path $Script:OfflineRoot "hermes\Install-HermesOffline.ps1"
  if (Test-Path -LiteralPath $offlineInstaller) {
    return $offlineInstaller
  }
  return Find-FirstFile -Directories @(
    (Join-Path $Script:OfflineRoot "hermes"),
    (Join-Path $Script:BundleRoot "hermes-cli-installer")
  ) -Patterns @("install.ps1", "*.msi", "*setup*.exe", "*installer*.exe", "*.cmd", "*.bat")
}

function Get-BundledHermesTag {
  $sourceRoot = Join-Path $Script:OfflineRoot "hermes"
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

function Find-InstalledHermesCommand {
  $candidates = @(
    (Join-Path $InstallDir "runtime\hermes-agent\venv\Scripts"),
    (Join-Path $InstallDir "runtime\hermes-agent"),
    (Join-Path $InstallDir "runtime\hermes"),
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

function Ensure-HermesLlmConfig {
  param([string]$TargetAppDir)
  $configDir = Join-Path $InstallDir "config"
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  $profilesSource = Join-Path $TargetAppDir "scripts\hermes-llm-profiles.json"
  if (Test-Path -LiteralPath $profilesSource) {
    Copy-Item -LiteralPath $profilesSource -Destination (Join-Path $configDir "hermes-llm-profiles.json") -Force
  }
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

function Ensure-Hermes {
  Assert-HermesCommandIsExecutable -Command $HermesCommand
  if (Test-CommandAvailable -Command $HermesCommand) {
    $resolved = Resolve-CommandPath -Command $HermesCommand
    if ($resolved) {
      Assert-HermesCommandIsExecutable -Command $resolved
      Add-RuntimePathEntry -PathEntry (Split-Path -Parent $resolved)
      $script:HermesCommand = $resolved
    }
    return
  }

  $portableHermes = Install-PortableHermes
  if ($portableHermes) {
    Assert-HermesCommandIsExecutable -Command $portableHermes
    $script:HermesCommand = $portableHermes
    return
  }

  $installerPath = Resolve-HermesInstaller
  if ($installerPath) {
    $installerArgs = $HermesInstallerArgs
    if (-not $installerArgs -and ([IO.Path]::GetFileName($installerPath)).Equals("Install-HermesOffline.ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
      $hermesHome = Join-Path $InstallDir "runtime\hermes-home"
      $hermesInstallDir = Join-Path $InstallDir "runtime\hermes-agent"
      $installerArgs = "-SkipWorkerEnvUpdate -HermesHome `"$hermesHome`" -InstallDir `"$hermesInstallDir`""
    } elseif (-not $installerArgs -and ([IO.Path]::GetExtension($installerPath).ToLowerInvariant() -eq ".ps1")) {
      $tag = Get-BundledHermesTag
      $tagArg = if ($tag) { " -Tag `"$tag`"" } else { "" }
      $hermesHome = Join-Path $InstallDir "runtime\hermes-home"
      $hermesInstallDir = Join-Path $InstallDir "runtime\hermes-agent"
      $installerArgs = "-SkipSetup -NonInteractive -HermesHome `"$hermesHome`" -InstallDir `"$hermesInstallDir`"$tagArg"
    }
    Start-Installer -Path $installerPath -Arguments $installerArgs -Name "Hermes CLI installer"
    Sync-ProcessPath

    $installedHermes = Find-InstalledHermesCommand
    if ($installedHermes) {
      Assert-HermesCommandIsExecutable -Command $installedHermes
      Add-RuntimePathEntry -PathEntry (Split-Path -Parent $installedHermes)
      $script:HermesCommand = $installedHermes
      return
    }
  }

  throw "Hermes CLI is required for SLX interpretation, but command '$HermesCommand' was not found. Bundle a portable hermes.exe/hermes.cmd/hermes.ps1 under offline-installers\hermes, pass -HermesInstallerPath, or install Hermes CLI on PATH."
}

function Resolve-McpServerCommand {
  param([string]$TargetAppDir)
  if ($McpServerCommand) {
    $resolvedMcp = Resolve-CommandPath -Command $McpServerCommand
    if ($resolvedMcp) {
      return $resolvedMcp
    }
  }

  $targetToolsDir = Join-Path $TargetAppDir "tools"
  New-Item -ItemType Directory -Force -Path $targetToolsDir | Out-Null
  $targetMcp = Join-Path $targetToolsDir "matlab-mcp-core-server.exe"

  $candidate = Join-Path $TargetAppDir "tools\matlab-mcp-core-server.exe"
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }

  $packagePath = $McpServerPackagePath
  if (-not $packagePath) {
    $packagePath = Find-FirstFile -Directories @((Join-Path $Script:OfflineRoot "matlab-mcp")) -Patterns @("matlab-mcp-core-server.exe", "*.exe")
  }
  if ($packagePath -and (Test-Path -LiteralPath $packagePath)) {
    Copy-Item -LiteralPath $packagePath -Destination $targetMcp -Force
    return $targetMcp
  }

  throw "MATLAB MCP server executable not found. Put matlab-mcp-core-server.exe under offline-installers\matlab-mcp, or pass -McpServerCommand."
}

function Write-EnvFile {
  param([string]$Path)
  $runtimePaths = ($Script:RuntimePathEntries | Where-Object { $_ } | Select-Object -Unique) -join ";"
  $content = @(
    "# Software document generator Windows worker environment",
    "SOFTWARE_DOC_NODE_HOME=$Script:NodeHome",
    "SOFTWARE_DOC_RUNTIME_PATHS=$runtimePaths",
    "HERMES_HOST=0.0.0.0",
    "HERMES_PORT=3101",
    "HERMES_TRANSPORT=cli",
    "HERMES_COMMAND=$HermesCommand",
    "HERMES_WORKDIR=$InstallDir\app",
    "HERMES_UPLOAD_TMPDIR=$InstallDir\tmp\hermes-uploads",
    "HERMES_AUTH_TOKEN=$HermesAuthToken",
    "HERMES_TIMEOUT_MS=600000",
    "HERMES_TIMEOUT_CONTENT_GENERATE_MS=1200000",
    "HERMES_TIMEOUT_REPLAY_PROPOSAL_GENERATE_MS=600000",
    "MATLAB_WORKER_HOST=0.0.0.0",
    "MATLAB_WORKER_PORT=5100",
    "MATLAB_EXECUTABLE=$MatlabExecutable",
    "MATLAB_ROOT=$(Split-Path -Parent (Split-Path -Parent $MatlabExecutable))",
    "SLX_ANALYSIS_BACKEND=legacy",
    "MATLAB_MCP_SERVER_COMMAND=$McpServerCommand",
    "MATLAB_MCP_TIMEOUT_MS=600000",
    "MATLAB_MCP_TMPDIR=$InstallDir\tmp\matlab",
    "MATLAB_MCP_AUTH_TOKEN=$MatlabAuthToken"
  )
  $content | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Register-WorkerTask {
  param(
    [string]$TaskName,
    [string]$Service
  )
  $runner = Join-Path $InstallDir "app\scripts\run-windows-worker-service.ps1"
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$runner`"",
    "-Service", $Service,
    "-InstallDir", "`"$InstallDir`""
  ) -join " "
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $InstallDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Software document generator $Service worker" -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
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

if (-not $MatlabAuthToken) {
  $MatlabAuthToken = New-Token
}
if (-not $HermesAuthToken) {
  $HermesAuthToken = New-Token
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "runtime") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "tmp") | Out-Null

Ensure-Node
Ensure-Matlab
Ensure-Hermes

$sourceAppDir = Resolve-BundleAppDir
$targetAppDir = Join-Path $InstallDir "app"

if (Test-Path -LiteralPath $targetAppDir) {
  Remove-Item -LiteralPath $targetAppDir -Recurse -Force
}
Copy-Item -LiteralPath $sourceAppDir -Destination $targetAppDir -Recurse -Force
Ensure-AppRuntimeDirectories -TargetAppDir $targetAppDir
Ensure-HermesLlmConfig -TargetAppDir $targetAppDir
Write-HermesLlmMenuLauncher
Write-SourceUpdateDeployerLauncher

$McpServerCommand = Resolve-McpServerCommand -TargetAppDir $targetAppDir

Set-Location $targetAppDir
if (-not (Test-Path -LiteralPath (Join-Path $targetAppDir "node_modules"))) {
  $npmCmd = Resolve-CommandPath -Command "npm.cmd"
  if (-not $npmCmd) {
    throw "npm.cmd is required but was not found after Node.js setup."
  }
  & $npmCmd ci --omit=dev
}

$envFile = Join-Path $InstallDir "software-doc-worker.env"
Write-EnvFile -Path $envFile

$officialDependenciesInstaller = Join-Path $targetAppDir "scripts\Install-WindowsWorkerOfficialDependencies.ps1"
if (Test-Path -LiteralPath $officialDependenciesInstaller) {
  & $officialDependenciesInstaller `
    -InstallDir $InstallDir `
    -BundleRoot $Script:BundleRoot `
    -TargetAppDir $targetAppDir `
    -WorkerEnvPath $envFile `
    -FreshInstall
}

if (-not $SkipTaskRegistration) {
  $workerServiceInstaller = Join-Path $targetAppDir "scripts\Install-WindowsWorkerServices.ps1"
  if (Test-Path -LiteralPath $workerServiceInstaller) {
    & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $workerServiceInstaller `
      -InstallDir $InstallDir `
      -Action Install `
      -RemoveLegacyTasks
    if ($LASTEXITCODE -ne 0) {
      throw "Worker service installer failed with exit code $LASTEXITCODE"
    }
  } else {
    Register-WorkerTask -TaskName "SoftwareDocHermesAgent" -Service "hermes"
    Register-WorkerTask -TaskName "SoftwareDocMatlabWorker" -Service "matlab"
  }
  Wait-WorkerPorts -TaskPorts @{
    SoftwareDocHermesAgent = 3101
    SoftwareDocMatlabWorker = 5100
  }
}
Write-Host "Windows worker installed at $InstallDir"
Write-Host "MATLAB executable: $MatlabExecutable"
Write-Host "MATLAB MCP server: $McpServerCommand"
Write-Host "Hermes command: $HermesCommand"
Write-Host ""
Write-Host "Configure the Linux backend with:"
Write-Host "HERMES_TRANSPORT=api"
Write-Host "HERMES_API_MODE=multipart"
Write-Host "HERMES_BASE_URL=http://<windows-vm-host>:3101"
Write-Host "HERMES_AUTH_TOKEN=$HermesAuthToken"
Write-Host "MATLAB_MCP_TRANSPORT=http"
Write-Host "MATLAB_MCP_HTTP_MODE=multipart"
Write-Host "MATLAB_MCP_BASE_URL=http://<windows-vm-host>:5100"
Write-Host "MATLAB_MCP_AUTH_TOKEN=$MatlabAuthToken"
