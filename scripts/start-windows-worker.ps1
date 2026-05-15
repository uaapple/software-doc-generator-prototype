param(
  [ValidateSet("all", "hermes", "matlab")]
  [string]$Service = "all",
  [string]$InstallDir = "C:\SoftwareDocWorker"
)

$ErrorActionPreference = "Stop"

$runner = Join-Path $InstallDir "app\scripts\run-windows-worker-service.ps1"
if (-not (Test-Path -LiteralPath $runner)) {
  throw "Worker runner not found: $runner"
}

function Start-WorkerProcess {
  param([string]$Name)
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$runner`"",
    "-Service", $Name,
    "-InstallDir", "`"$InstallDir`""
  ) -join " "
  Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $InstallDir
}

if ($Service -eq "all" -or $Service -eq "hermes") {
  Start-WorkerProcess -Name "hermes"
}
if ($Service -eq "all" -or $Service -eq "matlab") {
  Start-WorkerProcess -Name "matlab"
}
