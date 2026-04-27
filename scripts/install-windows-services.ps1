param(
  [string]$AppRoot = "C:\apps\software-doc-generator",
  [string]$WinSWExe = "C:\apps\software-doc-generator\service\winsw-x64.exe",
  [string]$NodeExe = "$env:ProgramFiles\nodejs\node.exe"
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Write-WinSWConfig(
  [string]$ServiceId,
  [string]$DisplayName,
  [string]$Arguments,
  [string]$ExecutablePath,
  [string]$WorkingDirectory,
  [string]$EnvFile,
  [string]$LogDirectory,
  [string]$ConfigPath
) {
  $xml = @"
<service>
  <id>$ServiceId</id>
  <name>$DisplayName</name>
  <description>Software document generator service: $DisplayName</description>
  <executable>$ExecutablePath</executable>
  <arguments>$Arguments</arguments>
  <workingdirectory>$WorkingDirectory</workingdirectory>
  <env name="APP_ENV_FILE" value="$EnvFile" />
  <logpath>$LogDirectory</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec" />
</service>
"@
  Set-Content -LiteralPath $ConfigPath -Value $xml -Encoding utf8
}

function Install-WinSWService([string]$ServiceExe, [string]$ServiceName) {
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Service $ServiceName already exists. Refreshing config only." -ForegroundColor Yellow
    return
  }

  Write-Host "Installing service $ServiceName..." -ForegroundColor Cyan
  & $ServiceExe install
}

$AppRoot = Resolve-FullPath $AppRoot
$WinSWExe = Resolve-FullPath $WinSWExe
$NodeExe = Resolve-FullPath $NodeExe
$serviceDir = Join-Path $AppRoot "service"
$currentDir = Join-Path $AppRoot "current"
$configDir = Join-Path $AppRoot "config"
$logsDir = Join-Path $AppRoot "logs"
$prodDataDir = Join-Path $AppRoot "prod-data"
$prodSkillsDir = Join-Path $AppRoot "prod-skills"
$envFile = Join-Path $configDir ".env.production"

if (-not (Test-Path -LiteralPath $WinSWExe)) {
  throw "WinSW executable was not found: $WinSWExe. Put winsw-x64.exe there first."
}

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "node.exe was not found: $NodeExe. Install Node.js 22+ first."
}

New-Item -ItemType Directory -Path $serviceDir, $configDir, $logsDir, $prodDataDir, $prodSkillsDir -Force | Out-Null

if (-not (Test-Path -LiteralPath $envFile)) {
  @"
HOST=0.0.0.0
PORT=3000
WIKI_HOST=0.0.0.0
WIKI_PORT=3001
APP_DATA_DIR=$prodDataDir
APP_SKILLS_DIR=$prodSkillsDir
"@ | Set-Content -LiteralPath $envFile -Encoding utf8
  Write-Host "Created production env file at $envFile" -ForegroundColor Yellow
}

$mainExe = Join-Path $serviceDir "SoftwareDocGenerator.exe"
$wikiExe = Join-Path $serviceDir "SoftwareDocWiki.exe"
$mainXml = Join-Path $serviceDir "SoftwareDocGenerator.xml"
$wikiXml = Join-Path $serviceDir "SoftwareDocWiki.xml"

Copy-Item -LiteralPath $WinSWExe -Destination $mainExe -Force
Copy-Item -LiteralPath $WinSWExe -Destination $wikiExe -Force

Write-WinSWConfig `
  -ServiceId "SoftwareDocGenerator" `
  -DisplayName "SoftwareDocGenerator" `
  -Arguments "--disable-warning=ExperimentalWarning src/server.js" `
  -ExecutablePath $NodeExe `
  -WorkingDirectory $currentDir `
  -EnvFile $envFile `
  -LogDirectory $logsDir `
  -ConfigPath $mainXml

Write-WinSWConfig `
  -ServiceId "SoftwareDocWiki" `
  -DisplayName "SoftwareDocWiki" `
  -Arguments "--disable-warning=ExperimentalWarning src/wiki-server.js" `
  -ExecutablePath $NodeExe `
  -WorkingDirectory $currentDir `
  -EnvFile $envFile `
  -LogDirectory $logsDir `
  -ConfigPath $wikiXml

Install-WinSWService $mainExe "SoftwareDocGenerator"
Install-WinSWService $wikiExe "SoftwareDocWiki"

Write-Host "Windows service configuration is ready." -ForegroundColor Green
