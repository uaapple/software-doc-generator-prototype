param(
  [string]$ProjectRoot = "",
  [switch]$CheckOnly,
  [switch]$Force,
  [switch]$SkipHermes,
  [switch]$SkipHermesWheelhouse,
  [switch]$SkipMatlabMcp,
  [switch]$SkipSimulinkToolkit,
  [switch]$SkipTcsdSkill,
  [switch]$SkipModuleDescriptionSkill,
  [string]$HermesRepo = "NousResearch/hermes-agent",
  [string]$MatlabMcpRepo = "matlab/matlab-mcp-core-server",
  [string]$SimulinkToolkitRepo = "matlab/simulink-agentic-toolkit",
  [string]$TcsdSkillRepo = "uaapple/my-codex-skills",
  [string]$TcsdSkillRef = "main",
  [string]$TcsdSkillPath = "simulink-ut-tcsd-generator",
  [string]$ModuleDescriptionSkillRepo = "uaapple/my-codex-skills",
  [string]$ModuleDescriptionSkillRef = "main",
  [string]$ModuleDescriptionSkillPath = "simulink-module-description-generator"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Resolve-ScriptRoot {
  if ($PSScriptRoot) {
    return $PSScriptRoot
  }
  return Split-Path -Parent $PSCommandPath
}

function Resolve-ProjectRoot {
  if ($ProjectRoot) {
    return (Resolve-Path -LiteralPath $ProjectRoot).Path
  }
  return (Resolve-Path -LiteralPath (Join-Path (Resolve-ScriptRoot) "..")).Path
}

function New-GitHubHeaders {
  $headers = @{
    "User-Agent" = "software-doc-generator-dependency-sync"
    "Accept" = "application/vnd.github+json"
  }
  $token = $env:GITHUB_TOKEN
  if ($token) {
    $headers["Authorization"] = "Bearer $token"
  }
  return $headers
}

function Invoke-GitHubJson {
  param([string]$Url)
  $lastError = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return Invoke-RestMethod -Uri $Url -Headers (New-GitHubHeaders) -TimeoutSec 30
    } catch {
      $lastError = $_
      if ($attempt -lt 3) {
        Start-Sleep -Seconds (2 * $attempt)
      }
    }
  }
  throw $lastError
}

function Invoke-GitHubDownload {
  param(
    [string]$Url,
    [string]$Destination
  )
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  $curl = Get-Command "curl.exe" -ErrorAction SilentlyContinue
  if ($curl) {
    $curlArgs = @(
      "-L",
      "--fail",
      "--silent",
      "--show-error",
      "--max-time", "600",
      "-H", "User-Agent: software-doc-generator-dependency-sync",
      "-H", "Accept: application/vnd.github+json"
    )
    if ($env:GITHUB_TOKEN) {
      $curlArgs += @("-H", "Authorization: Bearer $env:GITHUB_TOKEN")
    }
    $curlArgs += @("-o", $Destination, $Url)
    & $curl.Source @curlArgs
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $Destination)) {
      return
    }
    Write-Warning "curl.exe download failed for $Url; falling back to Invoke-WebRequest."
  }
  Invoke-WebRequest -Uri $Url -Headers (New-GitHubHeaders) -OutFile $Destination -TimeoutSec 120
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

function Save-Manifest {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Dependencies
  )
  Write-JsonFile -Path $Path -Value ([ordered]@{
    version = 1
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    dependencies = $Dependencies
  })
}

function Set-DependencyRecord {
  param(
    [System.Collections.IDictionary]$Dependencies,
    [string]$Name,
    [hashtable]$Record
  )
  $entry = [ordered]@{}
  foreach ($key in $Record.Keys) {
    $entry[$key] = $Record[$key]
  }
  $Dependencies[$Name] = $entry
}

function Test-NeedsUpdate {
  param(
    [string]$Name,
    [string]$Current,
    [string]$Latest
  )
  if (-not $Latest) {
    throw "Cannot determine latest version for $Name."
  }
  if ($Force) {
    return $true
  }
  return $Current -ne $Latest
}

function Get-LatestRelease {
  param([string]$Repo)
  try {
    return Invoke-GitHubJson -Url "https://api.github.com/repos/$Repo/releases/latest"
  } catch {
    Write-Warning "Could not read latest release for $Repo; falling back to tags. $($_.Exception.Message)"
    $tags = @(Invoke-GitHubJson -Url "https://api.github.com/repos/$Repo/tags")
    if (-not $tags.Count) {
      throw "No releases or tags were found for $Repo."
    }
    return [pscustomobject]@{
      tag_name = [string]$tags[0].name
      assets = @()
    }
  }
}

function Get-BranchCommit {
  param(
    [string]$Repo,
    [string]$Ref
  )
  return Invoke-GitHubJson -Url "https://api.github.com/repos/$Repo/commits/$Ref"
}

function Find-ReleaseAsset {
  param(
    [object]$Release,
    [string[]]$Patterns,
    [string[]]$RejectPatterns = @()
  )
  $assets = @(Get-ObjectProperty -Object $Release -Name "assets")
  foreach ($pattern in $Patterns) {
    foreach ($asset in $assets) {
      $name = [string](Get-ObjectProperty -Object $asset -Name "name")
      if (-not $name) {
        continue
      }
      $rejected = $false
      foreach ($reject in $RejectPatterns) {
        if ($name -match $reject) {
          $rejected = $true
          break
        }
      }
      if (-not $rejected -and $name -match $pattern) {
        return $asset
      }
    }
  }
  return $null
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

function Invoke-Python {
  param([string[]]$Arguments)
  $python = Resolve-CommandPath -Command "python.exe"
  if ($python) {
    & $python @Arguments
    return $LASTEXITCODE
  }
  $py = Resolve-CommandPath -Command "py.exe"
  if ($py) {
    & $py -3.11 @Arguments
    return $LASTEXITCODE
  }
  throw "Python 3.11 is required to refresh the Hermes offline wheelhouse. Install Python or pass -SkipHermesWheelhouse."
}

function Invoke-Git {
  param(
    [string[]]$Arguments,
    [string]$WorkingDirectory = ""
  )
  $git = Resolve-CommandPath -Command "git.exe"
  if (-not $git) {
    $git = Resolve-CommandPath -Command "git"
  }
  if (-not $git) {
    throw "git is required to sync external skill repositories."
  }
  $previous = (Get-Location).Path
  $oldGitTerminalPrompt = $env:GIT_TERMINAL_PROMPT
  $oldGcmInteractive = $env:GCM_INTERACTIVE
  try {
    $env:GIT_TERMINAL_PROMPT = "0"
    $env:GCM_INTERACTIVE = "Never"
    if ($WorkingDirectory) {
      Set-Location -LiteralPath $WorkingDirectory
    }
    & $git @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
  } finally {
    Set-Location -LiteralPath $previous
    $env:GIT_TERMINAL_PROMPT = $oldGitTerminalPrompt
    $env:GCM_INTERACTIVE = $oldGcmInteractive
  }
}

function Invoke-GitOutput {
  param([string[]]$Arguments)
  $git = Resolve-CommandPath -Command "git.exe"
  if (-not $git) {
    $git = Resolve-CommandPath -Command "git"
  }
  if (-not $git) {
    throw "git is required to sync external skill repositories."
  }
  $oldGitTerminalPrompt = $env:GIT_TERMINAL_PROMPT
  $oldGcmInteractive = $env:GCM_INTERACTIVE
  try {
    $env:GIT_TERMINAL_PROMPT = "0"
    $env:GCM_INTERACTIVE = "Never"
    $output = & $git @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
  } finally {
    $env:GIT_TERMINAL_PROMPT = $oldGitTerminalPrompt
    $env:GCM_INTERACTIVE = $oldGcmInteractive
  }
  return [string]($output -join "`n")
}

function Get-GitRemoteRefSha {
  param(
    [string]$Repo,
    [string]$Ref
  )
  $repoUrl = "https://github.com/$Repo.git"
  $output = Invoke-GitOutput -Arguments @("ls-remote", $repoUrl, "refs/heads/$Ref")
  if (-not $output.Trim()) {
    $output = Invoke-GitOutput -Arguments @("ls-remote", $repoUrl, $Ref)
  }
  $firstLine = ($output -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
  if ($firstLine -match "^([0-9a-f]{40})\s+") {
    return $Matches[1]
  }
  throw "Could not resolve $Repo ref $Ref."
}

function Get-ArchiveTagFromFolder {
  param(
    [string]$Folder,
    [string]$Pattern
  )
  if (-not (Test-Path -LiteralPath $Folder)) {
    return ""
  }
  $archive = Get-ChildItem -LiteralPath $Folder -Filter $Pattern -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $archive) {
    return ""
  }
  if ($archive.Name -match "hermes-agent-(v[0-9][0-9A-Za-z\.]*)-github-source\.zip") {
    return $Matches[1]
  }
  if ($archive.Name -match "(v?[0-9]+(?:\.[0-9A-Za-z]+)*)") {
    return $Matches[0]
  }
  return ""
}

function Expand-ArchiveSingleRoot {
  param(
    [string]$ArchivePath,
    [string]$Destination
  )
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("sdg-dependency-" + [guid]::NewGuid().ToString("N"))
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
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Copy-Item -Path (Join-Path $root.FullName "*") -Destination $Destination -Recurse -Force
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Copy-DirectoryContents {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $Destination -Recurse -Force
}

function ConvertTo-GitHubApiPath {
  param([string]$Path)
  return (($Path -split "[/\\]+" | Where-Object { $_ }) | ForEach-Object { [Uri]::EscapeDataString($_) }) -join "/"
}

function Download-GitHubDirectory {
  param(
    [string]$Repo,
    [string]$Ref,
    [string]$RemotePath,
    [string]$Destination
  )
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $apiPath = ConvertTo-GitHubApiPath -Path $RemotePath
  $url = "https://api.github.com/repos/$Repo/contents/$apiPath`?ref=$Ref"
  $rawItems = Invoke-GitHubJson -Url $url
  $items = @()
  foreach ($rawItem in $rawItems) {
    $items += $rawItem
  }
  foreach ($item in $items) {
    $name = [string](Get-ObjectProperty -Object $item -Name "name")
    $type = [string](Get-ObjectProperty -Object $item -Name "type")
    if (-not $name -or $name -in @(".git", ".github")) {
      continue
    }
    $target = Join-Path $Destination $name
    if ($type -eq "dir") {
      Download-GitHubDirectory -Repo $Repo -Ref $Ref -RemotePath (Get-ObjectProperty -Object $item -Name "path") -Destination $target
    } elseif ($type -eq "file") {
      $downloadUrl = [string](Get-ObjectProperty -Object $item -Name "download_url")
      if ($downloadUrl) {
        Invoke-GitHubDownload -Url $downloadUrl -Destination $target
      } else {
        $fileUrl = [string](Get-ObjectProperty -Object $item -Name "url")
        if (-not $fileUrl) {
          throw "GitHub contents item does not expose API url: $RemotePath/$name"
        }
        $file = Invoke-GitHubJson -Url $fileUrl
        $content = ([string](Get-ObjectProperty -Object $file -Name "content")).Replace("`n", "").Replace("`r", "")
        if (-not $content) {
          throw "GitHub contents API returned no file content: $RemotePath/$name"
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        [IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($content))
      }
    }
  }
}

function Sync-HermesAgent {
  param(
    [string]$Root,
    [System.Collections.IDictionary]$Dependencies,
    [object]$Manifest
  )
  if ($SkipHermes) {
    return
  }
  $release = Get-LatestRelease -Repo $HermesRepo
  $latest = [string](Get-ObjectProperty -Object $release -Name "tag_name")
  $sourceDir = Join-Path $Root "offline-installers\hermes\source"
  $current = Get-DependencyVersion -Manifest $Manifest -Name "hermesAgent"
  if (-not $current) {
    $current = Get-ArchiveTagFromFolder -Folder $sourceDir -Pattern "hermes-agent-v*.zip"
  }

  Write-Host "Hermes Agent: local='$current' latest='$latest'"
  if (-not (Test-NeedsUpdate -Name "Hermes Agent" -Current $current -Latest $latest)) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "hermesAgent" -Record @{
      repo = $HermesRepo
      version = $latest
      source = "github-release"
      status = "current"
    }
    return
  }
  if ($CheckOnly) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "hermesAgent" -Record @{
      repo = $HermesRepo
      version = $current
      latest = $latest
      status = "update-available"
    }
    return
  }

  New-Item -ItemType Directory -Force -Path $sourceDir | Out-Null
  $archivePath = Join-Path $sourceDir ("hermes-agent-{0}-github-source.zip" -f $latest)
  $archiveUrl = "https://github.com/$HermesRepo/archive/refs/tags/$latest.zip"
  Invoke-GitHubDownload -Url $archiveUrl -Destination $archivePath

  $installerPath = Join-Path $Root "offline-installers\hermes\install.ps1"
  Invoke-GitHubDownload -Url "https://raw.githubusercontent.com/$HermesRepo/main/scripts/install.ps1" -Destination $installerPath

  if (-not $SkipHermesWheelhouse) {
    $wheelhouse = Join-Path $Root "offline-installers\hermes\wheelhouse"
    $tmpWheelhouse = Join-Path ([IO.Path]::GetTempPath()) ("sdg-hermes-wheelhouse-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tmpWheelhouse | Out-Null
    try {
      $pipTarget = "$archivePath[mcp,pty,cli]"
      $exitCode = Invoke-Python -Arguments @("-m", "pip", "download", "--dest", $tmpWheelhouse, "--only-binary=:all:", $pipTarget)
      if ($exitCode -ne 0) {
        throw "pip download failed while refreshing Hermes wheelhouse."
      }
      if (Test-Path -LiteralPath $wheelhouse) {
        Remove-Item -LiteralPath $wheelhouse -Recurse -Force
      }
      Copy-DirectoryContents -Source $tmpWheelhouse -Destination $wheelhouse
    } finally {
      Remove-Item -LiteralPath $tmpWheelhouse -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  Get-ChildItem -LiteralPath $sourceDir -Filter "hermes-agent-v*.zip" -File |
    Where-Object { $_.FullName -ne $archivePath } |
    Remove-Item -Force

  Set-DependencyRecord -Dependencies $Dependencies -Name "hermesAgent" -Record @{
    repo = $HermesRepo
    version = $latest
    source = "github-release"
    sourceArchive = "offline-installers/hermes/source/" + (Split-Path -Leaf $archivePath)
    refreshedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Sync-MatlabMcp {
  param(
    [string]$Root,
    [System.Collections.IDictionary]$Dependencies,
    [object]$Manifest
  )
  if ($SkipMatlabMcp) {
    return
  }
  $release = Get-LatestRelease -Repo $MatlabMcpRepo
  $latest = [string](Get-ObjectProperty -Object $release -Name "tag_name")
  $current = Get-DependencyVersion -Manifest $Manifest -Name "matlabMcp"
  Write-Host "MATLAB MCP Core Server: local='$current' latest='$latest'"
  if (-not (Test-NeedsUpdate -Name "MATLAB MCP Core Server" -Current $current -Latest $latest)) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "matlabMcp" -Record @{
      repo = $MatlabMcpRepo
      version = $latest
      source = "github-release"
      status = "current"
    }
    return
  }
  if ($CheckOnly) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "matlabMcp" -Record @{
      repo = $MatlabMcpRepo
      version = $current
      latest = $latest
      status = "update-available"
    }
    return
  }

  $asset = Find-ReleaseAsset -Release $release -Patterns @(
    "matlab-mcp-core-server.*(win|windows|win64|x64|amd64).*\.(zip|exe)$",
    ".*(win|windows|win64|x64|amd64).*\.(zip|exe)$",
    ".*\.exe$"
  ) -RejectPatterns @("darwin", "linux", "arm64")
  if (-not $asset) {
    throw "No Windows MATLAB MCP release asset was found on $MatlabMcpRepo release $latest."
  }

  $assetName = [string](Get-ObjectProperty -Object $asset -Name "name")
  $assetUrl = [string](Get-ObjectProperty -Object $asset -Name "browser_download_url")
  $downloadPath = Join-Path ([IO.Path]::GetTempPath()) $assetName
  $extractDir = ""
  Invoke-GitHubDownload -Url $assetUrl -Destination $downloadPath
  try {
    $exe = ""
    if ([IO.Path]::GetExtension($downloadPath).ToLowerInvariant() -eq ".zip") {
      $extractDir = Join-Path ([IO.Path]::GetTempPath()) ("sdg-matlab-mcp-" + [guid]::NewGuid().ToString("N"))
      New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
      Expand-Archive -LiteralPath $downloadPath -DestinationPath $extractDir -Force
      $match = Get-ChildItem -LiteralPath $extractDir -Filter "matlab-mcp-core-server*.exe" -File -Recurse | Select-Object -First 1
      if ($match) {
        $exe = $match.FullName
      }
    } else {
      $exe = $downloadPath
    }
    if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
      throw "The MATLAB MCP asset did not contain matlab-mcp-core-server.exe: $assetName"
    }

    $toolsTarget = Join-Path $Root "tools\matlab-mcp-core-server.exe"
    $offlineTarget = Join-Path $Root "offline-installers\matlab-mcp\matlab-mcp-core-server.exe"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $toolsTarget), (Split-Path -Parent $offlineTarget) | Out-Null
    Copy-Item -LiteralPath $exe -Destination $toolsTarget -Force
    Copy-Item -LiteralPath $exe -Destination $offlineTarget -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $toolsTarget).Hash

    Set-DependencyRecord -Dependencies $Dependencies -Name "matlabMcp" -Record @{
      repo = $MatlabMcpRepo
      version = $latest
      source = "github-release-asset"
      asset = $assetName
      sha256 = $hash
      refreshedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  } finally {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
    if ($extractDir) {
      Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Sync-SimulinkToolkit {
  param(
    [string]$Root,
    [System.Collections.IDictionary]$Dependencies,
    [object]$Manifest
  )
  if ($SkipSimulinkToolkit) {
    return
  }
  $release = Get-LatestRelease -Repo $SimulinkToolkitRepo
  $latest = [string](Get-ObjectProperty -Object $release -Name "tag_name")
  $current = Get-DependencyVersion -Manifest $Manifest -Name "simulinkAgenticToolkit"
  Write-Host "Simulink Agentic Toolkit: local='$current' latest='$latest'"
  if (-not (Test-NeedsUpdate -Name "Simulink Agentic Toolkit" -Current $current -Latest $latest)) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "simulinkAgenticToolkit" -Record @{
      repo = $SimulinkToolkitRepo
      version = $latest
      source = "github-release"
      status = "current"
    }
    return
  }
  if ($CheckOnly) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "simulinkAgenticToolkit" -Record @{
      repo = $SimulinkToolkitRepo
      version = $current
      latest = $latest
      status = "update-available"
    }
    return
  }

  $offlineDir = Join-Path $Root "offline-installers\simulink-agentic-toolkit"
  New-Item -ItemType Directory -Force -Path $offlineDir | Out-Null
  $archivePath = Join-Path $offlineDir ("simulink-agentic-toolkit-{0}-github-source.zip" -f $latest)
  Invoke-GitHubDownload -Url "https://github.com/$SimulinkToolkitRepo/archive/refs/tags/$latest.zip" -Destination $archivePath

  $toolTarget = Join-Path $Root "tools\simulink-agentic-toolkit"
  Expand-ArchiveSingleRoot -ArchivePath $archivePath -Destination $toolTarget
  $versionPath = Join-Path $toolTarget "VERSION"
  if (-not (Test-Path -LiteralPath $versionPath)) {
    [IO.File]::WriteAllText($versionPath, "$latest`r`n", [Text.UTF8Encoding]::new($false))
  }

  Get-ChildItem -LiteralPath $offlineDir -Filter "simulink-agentic-toolkit-*.zip" -File |
    Where-Object { $_.FullName -ne $archivePath } |
    Remove-Item -Force

  Set-DependencyRecord -Dependencies $Dependencies -Name "simulinkAgenticToolkit" -Record @{
    repo = $SimulinkToolkitRepo
    version = $latest
    source = "github-release-source"
    sourceArchive = "offline-installers/simulink-agentic-toolkit/" + (Split-Path -Leaf $archivePath)
    toolRoot = "tools/simulink-agentic-toolkit"
    refreshedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Sync-HermesSkillDirectory {
  param(
    [string]$Root,
    [System.Collections.IDictionary]$Dependencies,
    [object]$Manifest,
    [string]$DependencyName,
    [string]$DisplayName,
    [string]$Repo,
    [string]$Ref,
    [string]$SkillPath,
    [string]$InstallPath,
    [switch]$Skip
  )
  if ($Skip) {
    return
  }
  $latest = Get-GitRemoteRefSha -Repo $Repo -Ref $Ref
  $current = Get-DependencyVersion -Manifest $Manifest -Name $DependencyName
  Write-Host "$DisplayName skill: local='$current' latest='$latest'"
  if (-not (Test-NeedsUpdate -Name "$DisplayName skill" -Current $current -Latest $latest)) {
    Set-DependencyRecord -Dependencies $Dependencies -Name $DependencyName -Record @{
      repo = $Repo
      ref = $Ref
      path = $SkillPath
      version = $latest
      source = "github-tree"
      status = "current"
    }
    return
  }
  if ($CheckOnly) {
    Set-DependencyRecord -Dependencies $Dependencies -Name $DependencyName -Record @{
      repo = $Repo
      ref = $Ref
      path = $SkillPath
      version = $current
      latest = $latest
      status = "update-available"
    }
    return
  }

  $cloneDir = Join-Path ([IO.Path]::GetTempPath()) ("sdg-hermes-skill-" + [guid]::NewGuid().ToString("N"))
  try {
    Invoke-Git -Arguments @(
      "clone",
      "--depth", "1",
      "--branch", $Ref,
      "https://github.com/$Repo.git",
      $cloneDir
    )
    $skillSource = Join-Path $cloneDir $SkillPath
    if (-not (Test-Path -LiteralPath (Join-Path $skillSource "SKILL.md"))) {
      throw "Cloned repository did not contain $SkillPath/SKILL.md."
    }
    $skillTarget = Join-Path $Root $InstallPath
    Copy-DirectoryContents -Source $skillSource -Destination $skillTarget
  } finally {
    Remove-Item -LiteralPath $cloneDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  Set-DependencyRecord -Dependencies $Dependencies -Name $DependencyName -Record @{
    repo = $Repo
    ref = $Ref
    path = $SkillPath
    version = $latest
    source = "git-clone"
    installPath = $InstallPath.Replace("\", "/")
    refreshedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Sync-TcsdSkill {
  param(
    [string]$Root,
    [System.Collections.IDictionary]$Dependencies,
    [object]$Manifest
  )
  if ($SkipTcsdSkill) {
    return
  }
  $latest = Get-GitRemoteRefSha -Repo $TcsdSkillRepo -Ref $TcsdSkillRef
  $current = Get-DependencyVersion -Manifest $Manifest -Name "simulinkUtTcsdGeneratorSkill"
  Write-Host "simulink-ut-tcsd-generator skill: local='$current' latest='$latest'"
  if (-not (Test-NeedsUpdate -Name "simulink-ut-tcsd-generator skill" -Current $current -Latest $latest)) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "simulinkUtTcsdGeneratorSkill" -Record @{
      repo = $TcsdSkillRepo
      ref = $TcsdSkillRef
      path = $TcsdSkillPath
      version = $latest
      source = "github-tree"
      status = "current"
    }
    return
  }
  if ($CheckOnly) {
    Set-DependencyRecord -Dependencies $Dependencies -Name "simulinkUtTcsdGeneratorSkill" -Record @{
      repo = $TcsdSkillRepo
      ref = $TcsdSkillRef
      path = $TcsdSkillPath
      version = $current
      latest = $latest
      status = "update-available"
    }
    return
  }

  $cloneDir = Join-Path ([IO.Path]::GetTempPath()) ("sdg-tcsd-skill-" + [guid]::NewGuid().ToString("N"))
  try {
    Invoke-Git -Arguments @(
      "clone",
      "--depth", "1",
      "--branch", $TcsdSkillRef,
      "https://github.com/$TcsdSkillRepo.git",
      $cloneDir
    )
    $skillSource = Join-Path $cloneDir $TcsdSkillPath
    if (-not (Test-Path -LiteralPath (Join-Path $skillSource "SKILL.md"))) {
      throw "Cloned repository did not contain $TcsdSkillPath/SKILL.md."
    }
    $skillTarget = Join-Path $Root "skills\hermes\simulink-ut-tcsd-generator"
    Copy-DirectoryContents -Source $skillSource -Destination $skillTarget
  } finally {
    Remove-Item -LiteralPath $cloneDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  Set-DependencyRecord -Dependencies $Dependencies -Name "simulinkUtTcsdGeneratorSkill" -Record @{
    repo = $TcsdSkillRepo
    ref = $TcsdSkillRef
    path = $TcsdSkillPath
    version = $latest
    source = "git-clone"
    installPath = "skills/hermes/simulink-ut-tcsd-generator"
    refreshedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Sync-ModuleDescriptionSkill {
  param(
    [string]$Root,
    [System.Collections.IDictionary]$Dependencies,
    [object]$Manifest
  )
  Sync-HermesSkillDirectory `
    -Root $Root `
    -Dependencies $Dependencies `
    -Manifest $Manifest `
    -DependencyName "simulinkModuleDescriptionGeneratorSkill" `
    -DisplayName "simulink-module-description-generator" `
    -Repo $ModuleDescriptionSkillRepo `
    -Ref $ModuleDescriptionSkillRef `
    -SkillPath $ModuleDescriptionSkillPath `
    -InstallPath "skills\hermes\simulink-module-description-generator" `
    -Skip:$SkipModuleDescriptionSkill
}

$root = Resolve-ProjectRoot
$manifestPath = Join-Path $root "offline-installers\official-dependencies.json"
$existingManifest = Read-JsonFile -Path $manifestPath
$dependencies = ConvertTo-DependencyMap -Manifest $existingManifest

Sync-HermesAgent -Root $root -Dependencies $dependencies -Manifest $existingManifest
Sync-MatlabMcp -Root $root -Dependencies $dependencies -Manifest $existingManifest
Sync-SimulinkToolkit -Root $root -Dependencies $dependencies -Manifest $existingManifest
Sync-TcsdSkill -Root $root -Dependencies $dependencies -Manifest $existingManifest
Sync-ModuleDescriptionSkill -Root $root -Dependencies $dependencies -Manifest $existingManifest

if ($CheckOnly) {
  $reportPath = Join-Path $root "release-dist\official-dependencies-check.json"
  Save-Manifest -Path $reportPath -Dependencies $dependencies
  Write-Host "Official dependency check report written: $reportPath"
  Write-Host "Check-only mode did not download or replace package assets."
} else {
  Save-Manifest -Path $manifestPath -Dependencies $dependencies
  Write-Host "Official dependency manifest updated: $manifestPath"
  Write-Host "Windows worker package assets are ready for the next bundle build."
}
