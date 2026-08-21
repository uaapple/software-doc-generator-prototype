param(
  [ValidateSet("Menu", "List", "Capture", "Add", "Switch", "Show")]
  [string]$Action = "Menu",
  [string]$Id = "",
  [string]$Name = "",
  [ValidateSet("", "deepseek", "zai")]
  [string]$Provider = "",
  [string]$Model = "",
  [string]$BaseUrl = "",
  [string]$ApiKey = "",
  [string]$EnvFile = "",
  [string]$ProfilesDir = "",
  [switch]$ConfirmNoActiveTasks,
  [switch]$Force
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

# These are the only production settings this tool may change.
$DeepSeekKeys = @(
  "HERMES_INFERENCE_PROVIDER",
  "HERMES_INFERENCE_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL"
)
$ZaiKeys = @(
  "HERMES_INFERENCE_PROVIDER",
  "HERMES_INFERENCE_MODEL",
  "GLM_API_KEY",
  "GLM_BASE_URL"
)
$AllModelKeys = @(
  $DeepSeekKeys + $ZaiKeys + @("ZHIPU_API_KEY", "ZHIPU_BASE_URL") |
    Select-Object -Unique
)

function Resolve-AbsolutePath([string]$PathValue, [string]$BasePath) {
  if ([IO.Path]::IsPathRooted($PathValue)) {
    return [IO.Path]::GetFullPath($PathValue)
  }
  return [IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

function Assert-ProfileId([string]$ProfileId) {
  if ($ProfileId -notmatch "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$") {
    throw "Profile Id must contain 1-64 letters, digits, dots, underscores, or hyphens."
  }
}

function Assert-SingleLine([string]$Label, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Label must not be empty."
  }
  if ($Value.Contains("`r") -or $Value.Contains("`n")) {
    throw "$Label must be a single line."
  }
}

function Read-EnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Env file was not found: $Path"
  }
  $lines = @([IO.File]::ReadAllLines($Path))
  $values = @{}
  $counts = @{}
  foreach ($line in $lines) {
    if ($line -match "^\s*#" -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$") { continue }
    $key = $Matches[1].ToUpperInvariant()
    $value = $Matches[2].Trim()
    $counts[$key] = if ($counts.ContainsKey($key)) { [int]$counts[$key] + 1 } else { 1 }
    $values[$key] = $value
  }
  return [pscustomobject]@{ Lines = $lines; Values = $values; Counts = $counts }
}

function Assert-NoDuplicateModelKeys($EnvData) {
  foreach ($key in $AllModelKeys) {
    if ($EnvData.Counts.ContainsKey($key) -and [int]$EnvData.Counts[$key] -gt 1) {
      throw "Env file contains duplicate model key: $key"
    }
  }
}

function Assert-ProfileValues($Values) {
  $providerValue = [string]$Values["HERMES_INFERENCE_PROVIDER"]
  $modelValue = [string]$Values["HERMES_INFERENCE_MODEL"]
  if ($providerValue -eq "deepseek") {
    $keyName = "DEEPSEEK_API_KEY"
    $baseName = "DEEPSEEK_BASE_URL"
  } elseif ($providerValue -eq "zai") {
    $keyName = "GLM_API_KEY"
    $baseName = "GLM_BASE_URL"
  } else {
    throw "Provider must be deepseek or zai."
  }
  Assert-SingleLine "Model" $modelValue
  Assert-SingleLine $keyName ([string]$Values[$keyName])
  Assert-SingleLine $baseName ([string]$Values[$baseName])
  $uri = $null
  if (-not [Uri]::TryCreate([string]$Values[$baseName], [UriKind]::Absolute, [ref]$uri) -or
      $uri.Scheme -ne "https") {
    throw "$baseName must be an absolute HTTPS URL."
  }
  return [pscustomobject]@{
    Provider = $providerValue
    Model = $modelValue
    ApiKeyName = $keyName
    BaseUrlName = $baseName
  }
}

function Assert-ProfileFileShape($ProfileData) {
  $info = Assert-ProfileValues $ProfileData.Values
  $allowedKeys = if ($info.Provider -eq "deepseek") { $DeepSeekKeys } else { $ZaiKeys }
  foreach ($key in $ProfileData.Values.Keys) {
    if ($key -notin $allowedKeys) {
      throw "Profile file contains unsupported key '$key'. Only DSH model keys are allowed."
    }
  }
  foreach ($key in $allowedKeys) {
    if (-not $ProfileData.Counts.ContainsKey($key) -or [int]$ProfileData.Counts[$key] -ne 1) {
      throw "Profile file must contain exactly one '$key' assignment."
    }
  }
  return $info
}

function Normalize-ZaiAliases($EnvData) {
  if ([string]$EnvData.Values["HERMES_INFERENCE_PROVIDER"] -eq "zai" -and
      [string]::IsNullOrWhiteSpace([string]$EnvData.Values["GLM_API_KEY"]) -and
      -not [string]::IsNullOrWhiteSpace([string]$EnvData.Values["ZHIPU_API_KEY"])) {
    $EnvData.Values["GLM_API_KEY"] = [string]$EnvData.Values["ZHIPU_API_KEY"]
    $EnvData.Values["GLM_BASE_URL"] = [string]$EnvData.Values["ZHIPU_BASE_URL"]
  }
  return $EnvData
}

function Get-ProfilePath([string]$ProfileId) {
  Assert-ProfileId $ProfileId
  return Join-Path $script:ResolvedProfilesDir ("{0}.env" -f $ProfileId)
}

function Write-Utf8NoBomAtomic(
  [string]$Path,
  [string]$Content,
  [string]$BackupSuffix = ""
) {
  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $temporaryPath = Join-Path $directory (
    ".{0}.tmp-{1}" -f ([IO.Path]::GetFileName($Path)), [Guid]::NewGuid().ToString("N")
  )
  $encoding = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($temporaryPath, $Content, $encoding)
  try {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      $backupPath = if ($BackupSuffix) { "$Path.$BackupSuffix" } else { $null }
      [IO.File]::Replace($temporaryPath, $Path, $backupPath, $true)
      return $backupPath
    }
    [IO.File]::Move($temporaryPath, $Path)
    return $null
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Write-ProfileFile(
  [string]$ProfileId,
  [string]$ProfileName,
  $Values,
  [bool]$AllowOverwrite
) {
  $profilePath = Get-ProfilePath $ProfileId
  if ((Test-Path -LiteralPath $profilePath) -and -not $AllowOverwrite) {
    throw "Profile '$ProfileId' already exists. Use -Force to replace it."
  }
  Assert-SingleLine "Profile name" $ProfileName
  $info = Assert-ProfileValues $Values
  $lines = @(
    "# DSH model profile $ProfileId",
    "# Name: $ProfileName",
    "HERMES_INFERENCE_PROVIDER=$($info.Provider)",
    "HERMES_INFERENCE_MODEL=$($info.Model)",
    "$($info.ApiKeyName)=$($Values[$info.ApiKeyName])",
    "$($info.BaseUrlName)=$($Values[$info.BaseUrlName])"
  )
  $null = Write-Utf8NoBomAtomic $profilePath (($lines -join "`r`n") + "`r`n")
  Write-Host "Saved profile '$ProfileId' at $profilePath" -ForegroundColor Green
}

function Get-ProfileName([string]$Path) {
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match "^#\s*Name:\s*(.+)$") { return $Matches[1].Trim() }
  }
  return [IO.Path]::GetFileNameWithoutExtension($Path)
}

function Test-ProfileActive($ProfileData, $CurrentData) {
  foreach ($key in $ProfileData.Values.Keys) {
    if ([string]$ProfileData.Values[$key] -ne [string]$CurrentData.Values[$key]) {
      return $false
    }
  }
  return $true
}

function Show-Profiles {
  if (-not (Test-Path -LiteralPath $script:ResolvedProfilesDir -PathType Container)) {
    Write-Host "No profiles directory yet: $script:ResolvedProfilesDir"
    return
  }
  $current = Normalize-ZaiAliases (Read-EnvFile $script:ResolvedEnvFile)
  $rows = foreach ($file in @(
    Get-ChildItem -LiteralPath $script:ResolvedProfilesDir -Filter "*.env" -File |
      Sort-Object Name
  )) {
    $profile = Read-EnvFile $file.FullName
    $info = Assert-ProfileFileShape $profile
    [pscustomobject]@{
      Active = if (Test-ProfileActive $profile $current) { "*" } else { "" }
      Id = $file.BaseName
      Name = Get-ProfileName $file.FullName
      Provider = $info.Provider
      Model = $info.Model
      BaseUrl = [string]$profile.Values[$info.BaseUrlName]
    }
  }
  if (@($rows).Count -eq 0) {
    Write-Host "No saved profiles."
  } else {
    $rows | Format-Table -AutoSize
  }
}

function Capture-CurrentProfile([string]$ProfileId, [string]$ProfileName) {
  $current = Normalize-ZaiAliases (Read-EnvFile $script:ResolvedEnvFile)
  Assert-NoDuplicateModelKeys $current
  Write-ProfileFile $ProfileId $ProfileName $current.Values ([bool]$Force)
}

function Add-Profile(
  [string]$ProfileId,
  [string]$ProfileName,
  [string]$ProviderValue,
  [string]$ModelValue,
  [string]$BaseUrlValue,
  [string]$ApiKeyValue
) {
  if ([string]::IsNullOrWhiteSpace($ApiKeyValue)) {
    $ApiKeyValue = Read-Host "API Key (saved as plain text in the profile .env file)"
  }
  $values = @{
    HERMES_INFERENCE_PROVIDER = $ProviderValue
    HERMES_INFERENCE_MODEL = $ModelValue
  }
  if ($ProviderValue -eq "deepseek") {
    $values["DEEPSEEK_API_KEY"] = $ApiKeyValue
    $values["DEEPSEEK_BASE_URL"] = $BaseUrlValue
  } elseif ($ProviderValue -eq "zai") {
    $values["GLM_API_KEY"] = $ApiKeyValue
    $values["GLM_BASE_URL"] = $BaseUrlValue
  }
  Write-ProfileFile $ProfileId $ProfileName $values ([bool]$Force)
}

function Set-ProfileInProductionEnv($ProfileData) {
  $current = Read-EnvFile $script:ResolvedEnvFile
  Assert-NoDuplicateModelKeys $current
  $info = Assert-ProfileFileShape $ProfileData
  $profileKeys = if ($info.Provider -eq "deepseek") { $DeepSeekKeys } else { $ZaiKeys }
  $output = New-Object Collections.Generic.List[string]
  $written = @{}
  foreach ($line in $current.Lines) {
    if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=") {
      $key = $Matches[1].ToUpperInvariant()
      if ($key -in $profileKeys) {
        $output.Add("$key=$($ProfileData.Values[$key])")
        $written[$key] = $true
        continue
      }
    }
    $output.Add($line)
  }
  foreach ($key in $profileKeys) {
    if (-not $written.ContainsKey($key)) {
      $output.Add("$key=$($ProfileData.Values[$key])")
    }
  }
  $backupSuffix = "dsh-switch-backup-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmssfff")
  $content = ($output -join "`r`n") + "`r`n"
  return Write-Utf8NoBomAtomic $script:ResolvedEnvFile $content $backupSuffix
}

function Invoke-ProductionAction([string]$ActionName) {
  $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command "npm" -ErrorAction SilentlyContinue }
  if (-not $npm) { throw "npm was not found on PATH." }
  $npmPath = [string]$npm.Path
  Push-Location $script:RepositoryRoot
  try {
    & $npmPath "run" "container:prod:windows:$ActionName"
    if ($LASTEXITCODE -ne 0) {
      throw "Production action '$ActionName' failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Restore-EnvBackup([string]$BackupPath) {
  if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
    throw "Switch backup was not found: $BackupPath"
  }
  $temporaryPath = "$script:ResolvedEnvFile.rollback-$([Guid]::NewGuid().ToString('N'))"
  [IO.File]::WriteAllBytes($temporaryPath, [IO.File]::ReadAllBytes($BackupPath))
  try {
    $failedSwitchEvidence = "$script:ResolvedEnvFile.failed-switch-{0}" -f (
      Get-Date -Format "yyyyMMdd-HHmmssfff"
    )
    [IO.File]::Replace(
      $temporaryPath,
      $script:ResolvedEnvFile,
      $failedSwitchEvidence,
      $true
    )
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Apply-WorkerAndTest([string]$BackupPath) {
  $oldEnvSetting = $env:SDG_PROD_ENV_FILE
  try {
    $env:SDG_PROD_ENV_FILE = $script:ResolvedEnvFile
    Invoke-ProductionAction "config"
    Invoke-ProductionAction "preflight"
    Invoke-ProductionAction "up"
    Invoke-ProductionAction "test"
  } catch {
    $applyError = $_.Exception.Message
    Write-Warning "New profile failed to apply. Restoring the previous env and Worker."
    try {
      Restore-EnvBackup $BackupPath
      Invoke-ProductionAction "config"
      Invoke-ProductionAction "preflight"
      Invoke-ProductionAction "up"
      Invoke-ProductionAction "test"
    } catch {
      throw "Profile apply failed ($applyError), and automatic rollback also failed: $($_.Exception.Message)"
    }
    throw "Profile apply failed; the previous env and Worker were restored: $applyError"
  } finally {
    $env:SDG_PROD_ENV_FILE = $oldEnvSetting
  }
}

function Switch-Profile([string]$ProfileId) {
  if (-not $ConfirmNoActiveTasks) {
    throw "Switch requires -ConfirmNoActiveTasks because the Worker container will be recreated."
  }
  $profilePath = Get-ProfilePath $ProfileId
  $profile = Read-EnvFile $profilePath
  Assert-NoDuplicateModelKeys $profile
  $info = Assert-ProfileFileShape $profile
  $backupPath = Set-ProfileInProductionEnv $profile
  Write-Host "Updated only the DSH model keys in $script:ResolvedEnvFile" -ForegroundColor Cyan
  Apply-WorkerAndTest $backupPath
  Write-Host "Profile '$ProfileId' is active: $($info.Provider) / $($info.Model)" -ForegroundColor Green
  Write-Host "Worker recreation and existing production tests passed." -ForegroundColor Green
  Write-Host "Run one approved TCSD test task to verify the real upstream model call." -ForegroundColor Yellow
  Write-Host "Previous env backup: $backupPath"
}

function Show-CurrentConfiguration {
  $current = Normalize-ZaiAliases (Read-EnvFile $script:ResolvedEnvFile)
  $info = Assert-ProfileValues $current.Values
  Write-Host "Env file: $script:ResolvedEnvFile"
  Write-Host "Provider: $($info.Provider)"
  Write-Host "Model:    $($info.Model)"
  Write-Host "Base URL: $($current.Values[$info.BaseUrlName])"
  Write-Host "API Key:  configured (value not displayed)"
}

function Show-Menu {
  while ($true) {
    Write-Host ""
    Write-Host "DSH model profile manager" -ForegroundColor Cyan
    Show-Profiles
    Write-Host "[1] Capture current config  [2] Add config  [3] Switch and apply  [4] Exit"
    $choice = Read-Host "Select"
    if ($choice -eq "1") {
      $captureId = Read-Host "Profile Id (for example 1)"
      $captureName = Read-Host "Profile name"
      Capture-CurrentProfile $captureId $captureName
    } elseif ($choice -eq "2") {
      $newId = Read-Host "Profile Id (for example 2)"
      $newName = Read-Host "Profile name"
      $newProvider = (Read-Host "Provider (deepseek or zai)").Trim().ToLowerInvariant()
      $newModel = Read-Host "Model"
      $defaultBaseUrl = if ($newProvider -eq "deepseek") {
        "https://api.deepseek.com"
      } else {
        "https://open.bigmodel.cn/api/paas/v4"
      }
      $newBaseUrl = Read-Host "Base URL [$defaultBaseUrl]"
      if ([string]::IsNullOrWhiteSpace($newBaseUrl)) { $newBaseUrl = $defaultBaseUrl }
      Add-Profile $newId $newName $newProvider $newModel $newBaseUrl ""
    } elseif ($choice -eq "3") {
      $switchId = Read-Host "Profile Id"
      $idleAnswer = Read-Host "Type IDLE after confirming no queued/retrying/running TCSD task"
      if ($idleAnswer -ne "IDLE") {
        Write-Warning "Switch cancelled."
        continue
      }
      $script:ConfirmNoActiveTasks = $true
      Switch-Profile $switchId
    } elseif ($choice -eq "4") {
      return
    } else {
      Write-Warning "Unknown selection."
    }
  }
}

$script:RepositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$defaultEnvFile = Join-Path $script:RepositoryRoot ".env.windows-docker-desktop"
$selectedEnvFile = if ($EnvFile) { $EnvFile } else { $defaultEnvFile }
$script:ResolvedEnvFile = Resolve-AbsolutePath $selectedEnvFile (Get-Location).Path
$defaultProfilesDir = Join-Path (Split-Path -Parent $script:ResolvedEnvFile) ".dsh-model-profiles"
$selectedProfilesDir = if ($ProfilesDir) { $ProfilesDir } else { $defaultProfilesDir }
$script:ResolvedProfilesDir = Resolve-AbsolutePath $selectedProfilesDir (Get-Location).Path

if ($Action -eq "Menu") {
  Show-Menu
} elseif ($Action -eq "List") {
  Show-Profiles
} elseif ($Action -eq "Capture") {
  Capture-CurrentProfile $Id $Name
} elseif ($Action -eq "Add") {
  Add-Profile $Id $Name $Provider $Model $BaseUrl $ApiKey
} elseif ($Action -eq "Switch") {
  Switch-Profile $Id
} elseif ($Action -eq "Show") {
  Show-CurrentConfiguration
}
