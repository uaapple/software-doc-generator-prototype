param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [string]$BundleRoot = "",
  [string]$TargetAppDir = "",
  [string]$WorkerEnvPath = "",
  [switch]$FreshInstall
)

$ErrorActionPreference = "Stop"

function Resolve-ScriptRoot {
  if ($PSScriptRoot) {
    return $PSScriptRoot
  }
  return Split-Path -Parent $PSCommandPath
}

function Resolve-DefaultBundleRoot {
  $scriptRoot = Resolve-ScriptRoot
  $candidates = @(
    (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..\..") -ErrorAction SilentlyContinue).Path,
    (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..") -ErrorAction SilentlyContinue).Path,
    $scriptRoot
  )
  foreach ($candidate in $candidates) {
    if (-not $candidate) {
      continue
    }
    if (Test-Path -LiteralPath (Join-Path $candidate "offline-installers")) {
      return $candidate
    }
  }
  return (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")).Path
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $text = [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
  if (-not $text.Trim()) {
    return $null
  }
  return $text | ConvertFrom-Json
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $json = $Value | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($Path, "$json`r`n", [Text.UTF8Encoding]::new($false))
}

function Get-ObjectProperty {
  param(
    [object]$Object,
    [string]$Name
  )
  if (-not $Object) {
    return $null
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($property) {
    return $property.Value
  }
  return $null
}

function Get-DependencyRecord {
  param(
    [object]$Manifest,
    [string]$Name
  )
  $deps = Get-ObjectProperty -Object $Manifest -Name "dependencies"
  return Get-ObjectProperty -Object $deps -Name $Name
}

function Get-DependencyVersion {
  param(
    [object]$Manifest,
    [string]$Name
  )
  $record = Get-DependencyRecord -Manifest $Manifest -Name $Name
  return [string](Get-ObjectProperty -Object $record -Name "version")
}

function ConvertTo-DependencyMap {
  param([object]$Manifest)
  $map = [ordered]@{}
  $deps = Get-ObjectProperty -Object $Manifest -Name "dependencies"
  if ($deps) {
    foreach ($property in $deps.PSObject.Properties) {
      $entry = [ordered]@{}
      foreach ($entryProperty in $property.Value.PSObject.Properties) {
        $entry[$entryProperty.Name] = $entryProperty.Value
      }
      $map[$property.Name] = $entry
    }
  }
  return $map
}

function Set-RuntimeRecord {
  param(
    [System.Collections.IDictionary]$Map,
    [string]$Name,
    [object]$BundleRecord,
    [hashtable]$Extra = @{}
  )
  if (-not $BundleRecord) {
    return
  }
  $entry = [ordered]@{}
  foreach ($property in $BundleRecord.PSObject.Properties) {
    $entry[$property.Name] = $property.Value
  }
  foreach ($key in $Extra.Keys) {
    $entry[$key] = $Extra[$key]
  }
  $entry["installedAt"] = (Get-Date).ToUniversalTime().ToString("o")
  $Map[$Name] = $entry
}

function Save-RuntimeManifest {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Map
  )
  Write-JsonFile -Path $Path -Value ([ordered]@{
    version = 1
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    dependencies = $Map
  })
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

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return
  }
  $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
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
  [IO.File]::WriteAllLines($Path, [string[]]$updated, [Text.UTF8Encoding]::new($false))
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
  $logDir = Join-Path $InstallDir "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $safeName = ($Name -replace "[^A-Za-z0-9_-]", "-").Trim("-").ToLowerInvariant()
  if (-not $safeName) {
    $safeName = "installer"
  }
  $stdoutLog = Join-Path $logDir ("{0}-{1}.out.log" -f $safeName, (Get-Date -Format "yyyyMMdd-HHmmss"))
  $stderrLog = Join-Path $logDir ("{0}-{1}.err.log" -f $safeName, (Get-Date -Format "yyyyMMdd-HHmmss"))
  Write-Host "Running ${Name}: $Path"
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

function Install-HermesFromBundle {
  param(
    [string]$WorkerInstallDir,
    [string]$EnvPath
  )
  $offlineInstaller = Join-Path $BundleRoot "offline-installers\hermes\Install-HermesOffline.ps1"
  if (Test-Path -LiteralPath $offlineInstaller) {
    $hermesHome = Join-Path $WorkerInstallDir "runtime\hermes-home"
    $hermesInstallDir = Join-Path $WorkerInstallDir "runtime\hermes-agent"
    Start-Installer `
      -Path $offlineInstaller `
      -Arguments "-HermesHome `"$hermesHome`" -InstallDir `"$hermesInstallDir`" -WorkerEnvPath `"$EnvPath`"" `
      -Name "Hermes CLI offline installer"
    return Join-Path $hermesInstallDir "hermes.cmd"
  }

  $portableCommand = Find-FirstFile -Directories @((Join-Path $BundleRoot "offline-installers\hermes")) -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
  if ($portableCommand) {
    $targetRoot = Join-Path $WorkerInstallDir "runtime\hermes"
    if (Test-Path -LiteralPath $targetRoot) {
      Remove-Item -LiteralPath $targetRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
    Copy-Item -Path (Join-Path (Split-Path -Parent $portableCommand) "*") -Destination $targetRoot -Recurse -Force
    return Find-FirstFile -Directories @($targetRoot) -Patterns @("hermes.exe", "hermes.cmd", "hermes.ps1")
  }

  return ""
}

function Resolve-ToolkitRoot {
  param([string]$Root)
  if (-not (Test-Path -LiteralPath $Root)) {
    return ""
  }
  if ((Test-Path -LiteralPath (Join-Path $Root "tools\tools.json")) -or (Test-Path -LiteralPath (Join-Path $Root "VERSION"))) {
    return (Resolve-Path -LiteralPath $Root).Path
  }
  $candidate = Get-ChildItem -LiteralPath $Root -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
      (Test-Path -LiteralPath (Join-Path $_.FullName "tools\tools.json")) -or
      (Test-Path -LiteralPath (Join-Path $_.FullName "VERSION"))
    } |
    Select-Object -First 1
  if ($candidate) {
    return $candidate.FullName
  }
  return (Resolve-Path -LiteralPath $Root).Path
}

function Expand-ArchiveSingleRoot {
  param(
    [string]$ArchivePath,
    [string]$Destination
  )
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("sdg-toolkit-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $tmp -Force
    $root = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
    if (-not $root) {
      throw "Archive did not contain a root directory: $ArchivePath"
    }
    if (Test-Path -LiteralPath $Destination) {
      Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item -Path (Join-Path $root.FullName "*") -Destination $Destination -Recurse -Force
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-HermesAgent {
  param(
    [object]$BundleManifest,
    [object]$RuntimeManifest,
    [System.Collections.IDictionary]$RuntimeMap
  )
  $bundleRecord = Get-DependencyRecord -Manifest $BundleManifest -Name "hermesAgent"
  $bundleVersion = Get-DependencyVersion -Manifest $BundleManifest -Name "hermesAgent"
  if (-not $bundleVersion) {
    return
  }
  $runtimeVersion = Get-DependencyVersion -Manifest $RuntimeManifest -Name "hermesAgent"
  $envMap = Get-EnvFileMap -Path $WorkerEnvPath
  $currentCommand = [string]$envMap["HERMES_COMMAND"]
  $resolvedCurrent = Resolve-CommandPath -Command $currentCommand
  if ($FreshInstall -and $resolvedCurrent -and -not $runtimeVersion) {
    Write-Host "Recording bundled Hermes Agent version $bundleVersion for fresh install."
    Set-RuntimeRecord -Map $RuntimeMap -Name "hermesAgent" -BundleRecord $bundleRecord -Extra @{ command = $resolvedCurrent }
    Set-EnvValue -Path $WorkerEnvPath -Key "HERMES_HOME" -Value (Join-Path $InstallDir "runtime\hermes-home")
    return
  }
  if ($runtimeVersion -eq $bundleVersion -and $resolvedCurrent) {
    Write-Host "Hermes Agent is current: $bundleVersion"
    Set-EnvValue -Path $WorkerEnvPath -Key "HERMES_HOME" -Value (Join-Path $InstallDir "runtime\hermes-home")
    return
  }
  Write-Host "Updating Hermes Agent from '$runtimeVersion' to '$bundleVersion'."
  $installed = Install-HermesFromBundle -WorkerInstallDir $InstallDir -EnvPath $WorkerEnvPath
  if (-not $installed -or -not (Test-Path -LiteralPath $installed)) {
    throw "Bundled Hermes Agent installer did not produce a Hermes command."
  }
  Assert-HermesCommandIsExecutable -Command $installed
  Set-EnvValue -Path $WorkerEnvPath -Key "HERMES_COMMAND" -Value $installed
  Set-EnvValue -Path $WorkerEnvPath -Key "HERMES_HOME" -Value (Join-Path $InstallDir "runtime\hermes-home")
  Set-RuntimeRecord -Map $RuntimeMap -Name "hermesAgent" -BundleRecord $bundleRecord -Extra @{ command = $installed }
}

function Ensure-MatlabMcp {
  param(
    [object]$BundleManifest,
    [object]$RuntimeManifest,
    [System.Collections.IDictionary]$RuntimeMap
  )
  $bundleRecord = Get-DependencyRecord -Manifest $BundleManifest -Name "matlabMcp"
  $bundleVersion = Get-DependencyVersion -Manifest $BundleManifest -Name "matlabMcp"
  $runtimeVersion = Get-DependencyVersion -Manifest $RuntimeManifest -Name "matlabMcp"
  $source = Find-FirstFile -Directories @(
    (Join-Path $TargetAppDir "tools"),
    (Join-Path $BundleRoot "offline-installers\matlab-mcp")
  ) -Patterns @("matlab-mcp-core-server.exe", "matlab-mcp-core-server*.exe")
  if (-not $source) {
    return
  }
  $target = Join-Path $TargetAppDir "tools\matlab-mcp-core-server.exe"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  $resolvedSource = (Resolve-Path -LiteralPath $source).Path
  $resolvedTarget = ""
  if (Test-Path -LiteralPath $target) {
    $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
  }
  if ($resolvedSource -ne $resolvedTarget) {
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
  Set-EnvValue -Path $WorkerEnvPath -Key "MATLAB_MCP_SERVER_COMMAND" -Value $target
  if ($bundleVersion -and $runtimeVersion -ne $bundleVersion) {
    Write-Host "MATLAB MCP Core Server set to bundled version $bundleVersion."
    Set-RuntimeRecord -Map $RuntimeMap -Name "matlabMcp" -BundleRecord $bundleRecord -Extra @{
      command = $target
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
    }
  }
}

function Ensure-SimulinkToolkit {
  param(
    [object]$BundleManifest,
    [object]$RuntimeManifest,
    [System.Collections.IDictionary]$RuntimeMap
  )
  $bundleRecord = Get-DependencyRecord -Manifest $BundleManifest -Name "simulinkAgenticToolkit"
  $bundleVersion = Get-DependencyVersion -Manifest $BundleManifest -Name "simulinkAgenticToolkit"
  $runtimeVersion = Get-DependencyVersion -Manifest $RuntimeManifest -Name "simulinkAgenticToolkit"
  $sourceDir = Join-Path $TargetAppDir "tools\simulink-agentic-toolkit"
  $archive = Find-FirstFile -Directories @((Join-Path $BundleRoot "offline-installers\simulink-agentic-toolkit")) -Patterns @("simulink-agentic-toolkit-*.zip", "*.zip")
  if (-not (Test-Path -LiteralPath $sourceDir) -and -not $archive) {
    return
  }
  $runtimeRoot = Join-Path $InstallDir "runtime\simulink-agentic-toolkit"
  if ($bundleVersion -and $runtimeVersion -eq $bundleVersion -and (Test-Path -LiteralPath $runtimeRoot)) {
    $root = Resolve-ToolkitRoot -Root $runtimeRoot
    Set-EnvValue -Path $WorkerEnvPath -Key "SIMULINK_AGENTIC_TOOLKIT_ROOT" -Value $root
    Write-Host "Simulink Agentic Toolkit is current: $bundleVersion"
    return
  }
  if (Test-Path -LiteralPath $sourceDir) {
    if (Test-Path -LiteralPath $runtimeRoot) {
      Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    Copy-Item -Path (Join-Path $sourceDir "*") -Destination $runtimeRoot -Recurse -Force
  } elseif ($archive) {
    Expand-ArchiveSingleRoot -ArchivePath $archive -Destination $runtimeRoot
  }
  $root = Resolve-ToolkitRoot -Root $runtimeRoot
  if ($root) {
    Set-EnvValue -Path $WorkerEnvPath -Key "SIMULINK_AGENTIC_TOOLKIT_ROOT" -Value $root
    Set-RuntimeRecord -Map $RuntimeMap -Name "simulinkAgenticToolkit" -BundleRecord $bundleRecord -Extra @{ root = $root }
    Write-Host "Simulink Agentic Toolkit installed: $root"
  }
}

function Ensure-TcsdSkill {
  param(
    [object]$BundleManifest,
    [object]$RuntimeManifest,
    [System.Collections.IDictionary]$RuntimeMap
  )
  $bundleRecord = Get-DependencyRecord -Manifest $BundleManifest -Name "simulinkUtTcsdGeneratorSkill"
  $bundleVersion = Get-DependencyVersion -Manifest $BundleManifest -Name "simulinkUtTcsdGeneratorSkill"
  $runtimeVersion = Get-DependencyVersion -Manifest $RuntimeManifest -Name "simulinkUtTcsdGeneratorSkill"
  $skillSource = Join-Path $TargetAppDir "skills\hermes\simulink-ut-tcsd-generator"
  if (-not (Test-Path -LiteralPath (Join-Path $skillSource "SKILL.md"))) {
    return
  }
  $skillTarget = Join-Path $InstallDir "runtime\hermes-home\skills\simulink-ut-tcsd-generator"
  if ($bundleVersion -and $runtimeVersion -eq $bundleVersion -and (Test-Path -LiteralPath (Join-Path $skillTarget "SKILL.md"))) {
    Write-Host "Hermes skill simulink-ut-tcsd-generator is current: $bundleVersion"
    return
  }
  if (Test-Path -LiteralPath $skillTarget) {
    Remove-Item -LiteralPath $skillTarget -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $skillTarget | Out-Null
  Copy-Item -Path (Join-Path $skillSource "*") -Destination $skillTarget -Recurse -Force
  Set-RuntimeRecord -Map $RuntimeMap -Name "simulinkUtTcsdGeneratorSkill" -BundleRecord $bundleRecord -Extra @{ installPath = $skillTarget }
  Write-Host "Hermes skill installed: $skillTarget"
}

function Ensure-ModuleDescriptionSkill {
  param(
    [object]$BundleManifest,
    [object]$RuntimeManifest,
    [System.Collections.IDictionary]$RuntimeMap
  )
  $bundleRecord = Get-DependencyRecord -Manifest $BundleManifest -Name "simulinkModuleDescriptionGeneratorSkill"
  $bundleVersion = Get-DependencyVersion -Manifest $BundleManifest -Name "simulinkModuleDescriptionGeneratorSkill"
  $runtimeVersion = Get-DependencyVersion -Manifest $RuntimeManifest -Name "simulinkModuleDescriptionGeneratorSkill"
  $skillSource = Join-Path $TargetAppDir "skills\hermes\simulink-module-description-generator"
  if (-not (Test-Path -LiteralPath (Join-Path $skillSource "SKILL.md"))) {
    return
  }
  $skillTarget = Join-Path $InstallDir "runtime\hermes-home\skills\simulink-module-description-generator"
  if ($bundleVersion -and $runtimeVersion -eq $bundleVersion -and (Test-Path -LiteralPath (Join-Path $skillTarget "SKILL.md"))) {
    Write-Host "Hermes skill simulink-module-description-generator is current: $bundleVersion"
    return
  }
  if (Test-Path -LiteralPath $skillTarget) {
    Remove-Item -LiteralPath $skillTarget -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $skillTarget | Out-Null
  Copy-Item -Path (Join-Path $skillSource "*") -Destination $skillTarget -Recurse -Force
  Set-RuntimeRecord -Map $RuntimeMap -Name "simulinkModuleDescriptionGeneratorSkill" -BundleRecord $bundleRecord -Extra @{ installPath = $skillTarget }
  Write-Host "Hermes skill installed: $skillTarget"
}

if (-not $BundleRoot) {
  $BundleRoot = Resolve-DefaultBundleRoot
}
if (-not $TargetAppDir) {
  $TargetAppDir = Join-Path $InstallDir "app"
}
if (-not $WorkerEnvPath) {
  $WorkerEnvPath = Join-Path $InstallDir "software-doc-worker.env"
}

$bundleManifestPath = Join-Path $BundleRoot "offline-installers\official-dependencies.json"
$bundleManifest = Read-JsonFile -Path $bundleManifestPath
if (-not $bundleManifest) {
  Write-Host "No bundled official dependency manifest found; skipping official dependency install."
  return
}

$runtimeManifestPath = Join-Path $InstallDir "runtime\dependency-versions.json"
$runtimeManifest = Read-JsonFile -Path $runtimeManifestPath
$runtimeMap = ConvertTo-DependencyMap -Manifest $runtimeManifest

Ensure-HermesAgent -BundleManifest $bundleManifest -RuntimeManifest $runtimeManifest -RuntimeMap $runtimeMap
Ensure-MatlabMcp -BundleManifest $bundleManifest -RuntimeManifest $runtimeManifest -RuntimeMap $runtimeMap
Ensure-SimulinkToolkit -BundleManifest $bundleManifest -RuntimeManifest $runtimeManifest -RuntimeMap $runtimeMap
Ensure-TcsdSkill -BundleManifest $bundleManifest -RuntimeManifest $runtimeManifest -RuntimeMap $runtimeMap
Ensure-ModuleDescriptionSkill -BundleManifest $bundleManifest -RuntimeManifest $runtimeManifest -RuntimeMap $runtimeMap

Save-RuntimeManifest -Path $runtimeManifestPath -Map $runtimeMap
Write-Host "Official dependency runtime manifest updated: $runtimeManifestPath"
