param(
  [ValidateSet("hermes", "matlab")]
  [string]$Service,
  [string]$InstallDir = "C:\SoftwareDocWorker"
)

$ErrorActionPreference = "Stop"

function Import-EnvFile {
  param(
    [string]$Path,
    [switch]$Required
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    if ($Required) {
      throw "Environment file not found: $Path"
    }
    return
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
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Read-EnvFile {
  param([string]$Path)
  $values = [ordered]@{}
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
    $values[$key] = $trimmed.Substring($index + 1).Trim().Trim('"').Trim("'")
  }
  return $values
}

function Assert-TerraConfiguration {
  param([string]$Root)
  if ($env:HERMES_LLM_PROFILE -ne "gpt-5-6-terra") {
    return
  }

  $expectedProvider = "custom:gpt-5-6-terra"
  $expectedModel = "gpt-5.6-terra"
  $expectedApiMode = "codex_responses"
  $expectedReasoningEffort = "high"
  $expectedKeyName = "OPENAI_API_KEY"
  if ($env:HERMES_INFERENCE_PROVIDER -ne $expectedProvider -or
      $env:OPENAI_MODEL -ne $expectedModel -or
      $env:HERMES_LLM_API_MODE -ne $expectedApiMode -or
      $env:HERMES_REASONING_EFFORT -ne $expectedReasoningEffort -or
      $env:HERMES_LLM_API_KEY_ENV -ne $expectedKeyName) {
    throw "Selected Terra environment does not match the approved provider, model, and API mode."
  }
  $keyName = [string]$env:HERMES_LLM_API_KEY_ENV
  if (-not $keyName -or -not [Environment]::GetEnvironmentVariable($keyName, "Process")) {
    throw "Selected Terra profile references a missing API key environment variable."
  }

  $configPath = Join-Path $Root "runtime\hermes-home\config.yaml"
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Selected Terra profile requires Hermes config.yaml."
  }
  $pythonExe = @(
    (Join-Path $Root "runtime\hermes-agent\python\python.exe"),
    (Join-Path $Root "runtime\hermes-agent\venv\Scripts\python.exe"),
    (Join-Path $Root "runtime\hermes\python\python.exe"),
    (Join-Path $Root "runtime\hermes\venv\Scripts\python.exe")
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $pythonExe) {
    throw "Hermes Python runtime was not found for Terra configuration validation."
  }
  $validationScript = @'
import sys
from pathlib import Path
import yaml

config = yaml.safe_load(Path(sys.argv[1]).read_text(encoding="utf-8")) or {}
provider = next(
    (entry for entry in config.get("custom_providers", [])
     if isinstance(entry, dict) and entry.get("name") == "gpt-5-6-terra"),
    None,
)
expected_provider = {
    "name": "gpt-5-6-terra",
    "base_url": "https://154-17-239-28.sslip.io:8443/v1",
    "key_env": "OPENAI_API_KEY",
    "api_mode": "codex_responses",
}
expected_model = {
    "provider": "custom:gpt-5-6-terra",
    "default": "gpt-5.6-terra",
    "api_mode": "codex_responses",
}
expected_delegation = {
    "provider": "custom:gpt-5-6-terra",
    "model": "gpt-5.6-terra",
    "api_mode": "codex_responses",
}
expected_agent = {"reasoning_effort": "high"}
if provider != expected_provider or config.get("model") != expected_model or config.get("delegation") != expected_delegation or config.get("agent") != expected_agent:
    raise SystemExit("Terra configuration mismatch")
'@
  $validationPath = Join-Path ([IO.Path]::GetTempPath()) ("validate-hermes-terra-" + [guid]::NewGuid().ToString("N") + ".py")
  [IO.File]::WriteAllText($validationPath, $validationScript, [Text.UTF8Encoding]::new($false))
  try {
    & $pythonExe $validationPath $configPath *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "Selected Terra profile does not match Hermes config.yaml."
    }
  } finally {
    Remove-Item -LiteralPath $validationPath -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-AppRuntimeDirectories {
  param([string]$TargetAppDir)
  $directories = @(
    "data",
    "data\skill-rules",
    "tmp",
    "tmp\hermes-uploads",
    "tmp\matlab"
  )

  foreach ($relativePath in $directories) {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetAppDir $relativePath) | Out-Null
  }
}

$appDir = Join-Path $InstallDir "app"
$envFile = Join-Path $InstallDir "software-doc-worker.env"
$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir ("{0}-{1}.log" -f $Service, (Get-Date -Format "yyyyMMdd"))
Start-Transcript -Path $logPath -Append | Out-Null
Import-EnvFile -Path $envFile -Required
$secretsEnvPath = Join-Path $InstallDir "config\hermes-llm-secrets.env"
$activeEnvPath = Join-Path $InstallDir "config\hermes-llm.active.env"
Import-EnvFile -Path $activeEnvPath
Import-EnvFile -Path $secretsEnvPath

if ($Service -eq "hermes") {
  $activeValues = Read-EnvFile -Path $activeEnvPath
  $referencedKey = [string]$activeValues["HERMES_LLM_API_KEY_ENV"]
  if ($referencedKey -and $activeValues.Contains($referencedKey)) {
    throw "Active Hermes LLM environment must not contain API keys."
  }
  $effectivePort = if ($env:HERMES_PORT) { $env:HERMES_PORT } else { "3101" }
  if ($effectivePort -ne "3101") {
    throw "Hermes worker service must start on port 3101."
  }
  Assert-TerraConfiguration -Root $InstallDir
}

if ($env:SOFTWARE_DOC_RUNTIME_PATHS) {
  foreach ($runtimePath in ($env:SOFTWARE_DOC_RUNTIME_PATHS -split ";")) {
    if ($runtimePath -and (Test-Path -LiteralPath $runtimePath)) {
      $env:Path = "$runtimePath;$env:Path"
    }
  }
}

$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) {
  throw "npm.cmd was not found after loading the worker environment."
}

Ensure-AppRuntimeDirectories -TargetAppDir $appDir
Set-Location $appDir

if ($Service -eq "hermes") {
  & $npmCmd run hermes:start
} else {
  & $npmCmd run matlab-worker:start
}
