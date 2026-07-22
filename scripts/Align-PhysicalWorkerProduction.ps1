param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [string]$TaskName = "SoftwareDocHermesOpenApiServer",
  [int]$ApiPort = 8642,
  [int]$InternalApiPort = 8643
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Stop-ObsoleteOpenApiRuntime {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }

  foreach ($port in @($ApiPort, $InternalApiPort)) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($listener in @($listeners)) {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }

  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$ApiPort *> $null
  netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$ApiPort *> $null
  Get-NetFirewallRule -DisplayName "SoftwareDoc Hermes OpenAI API Server $ApiPort" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
}

function Remove-ObsoleteOpenApiFiles {
  foreach ($path in @(
    (Join-Path $InstallDir "scripts\run-hermes-openai-api-server.ps1"),
    (Join-Path $InstallDir "config\hermes-api-server.env"),
    (Join-Path $InstallDir "app\tools\matlab-satk-startup")
  )) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
}

function Resolve-HermesPython {
  $candidates = @(
    (Join-Path $InstallDir "runtime\hermes-agent\python\python.exe"),
    (Join-Path $InstallDir "runtime\hermes-agent\venv\Scripts\python.exe"),
    (Join-Path $InstallDir "runtime\hermes\python\python.exe"),
    (Join-Path $InstallDir "runtime\hermes\venv\Scripts\python.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  throw "Hermes Python runtime was not found under $InstallDir\runtime."
}

function Align-HermesCliConfig {
  $configPath = Join-Path $InstallDir "runtime\hermes-home\config.yaml"
  if (-not (Test-Path -LiteralPath $configPath)) {
    return
  }

  $pythonExe = Resolve-HermesPython
  $script = @'
import sys
from pathlib import Path
import yaml

config_path = Path(sys.argv[1])
data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
servers = data.get("mcp_servers") or {}
matlab = servers.get("matlab_satk")
if isinstance(matlab, dict):
    matlab["args"] = []
    env = matlab.get("env")
    if isinstance(env, dict):
        env.pop("SATK_SIMULINK_ROOT", None)
config_path.write_text(
    yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
    encoding="utf-8",
)
'@
  $temporaryScript = Join-Path ([IO.Path]::GetTempPath()) ("align-hermes-cli-" + [guid]::NewGuid().ToString("N") + ".py")
  [IO.File]::WriteAllText($temporaryScript, $script, [Text.UTF8Encoding]::new($false))
  try {
    & $pythonExe $temporaryScript $configPath
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to align Hermes CLI configuration."
    }
  } finally {
    Remove-Item -LiteralPath $temporaryScript -Force -ErrorAction SilentlyContinue
  }
}

Stop-ObsoleteOpenApiRuntime
Remove-ObsoleteOpenApiFiles
Align-HermesCliConfig
Write-Host "Physical Worker production topology aligned to the canonical 3101/5100 workflow."
