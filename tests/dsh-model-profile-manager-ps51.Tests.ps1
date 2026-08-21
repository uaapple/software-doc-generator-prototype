param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$toolPath = Join-Path $RepositoryRoot "scripts\manage-dsh-model-profiles.ps1"

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-Tool([string[]]$Arguments, [bool]$ExpectSuccess = $true) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $toolPath @Arguments
  $succeeded = $LASTEXITCODE -eq 0
  if ($succeeded -ne $ExpectSuccess) {
    throw "Tool exit expectation failed. Expected success=$ExpectSuccess, exit=$LASTEXITCODE, args=$($Arguments -join ' ')"
  }
}

Assert-True (Test-Path -LiteralPath $toolPath -PathType Leaf) "Profile manager script was not found."
$testRoot = Join-Path ([IO.Path]::GetTempPath()) (
  "sdg-dsh-profile-tests-{0}" -f [Guid]::NewGuid().ToString("N")
)
$profilesDir = Join-Path $testRoot "profiles"
$fakeBin = Join-Path $testRoot "bin"
$envFile = Join-Path $testRoot ".env.windows-docker-desktop"
$npmLog = Join-Path $testRoot "npm.log"
$failMarker = Join-Path $testRoot "fail-once.marker"

try {
  New-Item -ItemType Directory -Path $testRoot, $profilesDir, $fakeBin -Force | Out-Null
  [IO.File]::WriteAllLines($envFile, @(
    "SDG_WORKER_IMAGE=example.invalid/worker@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "HERMES_AGENT_TOKEN=unchanged-agent-token",
    "HERMES_INFERENCE_PROVIDER=deepseek",
    "HERMES_INFERENCE_MODEL=deepseek-one",
    "DEEPSEEK_API_KEY=key-one",
    "DEEPSEEK_BASE_URL=https://api.deepseek.com",
    "MATLAB_GATEWAY_TOKEN=unchanged-gateway-token",
    "SDG_CONTAINER_DATA_DIR=C:/ProgramData/SoftwareDocGenerator/data"
  ))

  $fakeNpm = @"
@echo off
echo %*>>"%DSH_TEST_NPM_LOG%"
echo %* | findstr /C:"container:prod:windows:test" >nul
if errorlevel 1 exit /b 0
if "%DSH_TEST_FAIL_ONCE%"=="" exit /b 0
if exist "%DSH_TEST_FAIL_MARKER%" exit /b 0
type nul >"%DSH_TEST_FAIL_MARKER%"
exit /b 9
"@
  [IO.File]::WriteAllText((Join-Path $fakeBin "npm.cmd"), $fakeNpm)
  $oldPath = $env:PATH
  $env:PATH = "$fakeBin;$oldPath"
  $env:DSH_TEST_NPM_LOG = $npmLog
  $env:DSH_TEST_FAIL_MARKER = $failMarker

  Invoke-Tool @(
    "-Action", "Capture", "-Id", "1", "-Name", "Existing DeepSeek",
    "-EnvFile", $envFile, "-ProfilesDir", $profilesDir
  )
  Assert-True (Test-Path -LiteralPath (Join-Path $profilesDir "1.env")) "Profile 1 was not captured."

  Invoke-Tool @(
    "-Action", "Add", "-Id", "2", "-Name", "Second DeepSeek",
    "-Provider", "deepseek", "-Model", "deepseek-two",
    "-BaseUrl", "https://api.deepseek.com", "-ApiKey", "key-two",
    "-EnvFile", $envFile, "-ProfilesDir", $profilesDir
  )
  Invoke-Tool @(
    "-Action", "Switch", "-Id", "2", "-ConfirmNoActiveTasks",
    "-EnvFile", $envFile, "-ProfilesDir", $profilesDir
  )
  $switched = [IO.File]::ReadAllText($envFile)
  Assert-True ($switched.Contains("HERMES_INFERENCE_MODEL=deepseek-two")) "Model did not switch to profile 2."
  Assert-True ($switched.Contains("DEEPSEEK_API_KEY=key-two")) "API key did not switch to profile 2."
  Assert-True ($switched.Contains("MATLAB_GATEWAY_TOKEN=unchanged-gateway-token")) "Gateway token was changed."
  Assert-True ($switched.Contains("SDG_CONTAINER_DATA_DIR=C:/ProgramData/SoftwareDocGenerator/data")) "Data path was changed."
  $firstActions = @([IO.File]::ReadAllLines($npmLog))
  Assert-True ($firstActions.Count -eq 4) "Successful switch did not run exactly four production actions."
  Assert-True ($firstActions[0].Contains("container:prod:windows:config")) "config was not first."
  Assert-True ($firstActions[1].Contains("container:prod:windows:preflight")) "preflight was not second."
  Assert-True ($firstActions[2].Contains("container:prod:windows:up")) "up was not third."
  Assert-True ($firstActions[3].Contains("container:prod:windows:test")) "test was not fourth."

  Invoke-Tool @(
    "-Action", "Add", "-Id", "3", "-Name", "Rollback Probe",
    "-Provider", "deepseek", "-Model", "deepseek-three",
    "-BaseUrl", "https://api.deepseek.com", "-ApiKey", "key-three",
    "-EnvFile", $envFile, "-ProfilesDir", $profilesDir
  )
  $beforeFailedSwitch = [IO.File]::ReadAllBytes($envFile)
  $env:DSH_TEST_FAIL_ONCE = "1"
  Invoke-Tool @(
    "-Action", "Switch", "-Id", "3", "-ConfirmNoActiveTasks",
    "-EnvFile", $envFile, "-ProfilesDir", $profilesDir
  ) $false
  $afterFailedSwitch = [IO.File]::ReadAllBytes($envFile)
  Assert-True ([Convert]::ToBase64String($beforeFailedSwitch) -eq [Convert]::ToBase64String($afterFailedSwitch)) (
    "Failed switch did not restore the exact previous env bytes."
  )
  Assert-True (Test-Path -LiteralPath $failMarker) "The simulated failure was not reached."

  Write-Host "DSH model profile manager PS5.1 tests passed." -ForegroundColor Green
} finally {
  $env:PATH = $oldPath
  Remove-Item Env:DSH_TEST_NPM_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:DSH_TEST_FAIL_MARKER -ErrorAction SilentlyContinue
  Remove-Item Env:DSH_TEST_FAIL_ONCE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
