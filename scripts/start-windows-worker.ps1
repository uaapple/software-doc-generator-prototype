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

$serviceNames = @{
  hermes = "SoftwareDocHermesAgent"
  matlab = "SoftwareDocMatlabWorker"
}

function Start-WorkerWindowsService {
  param([string]$Name)
  $windowsServiceName = $serviceNames[$Name]
  $windowsService = Get-Service -Name $windowsServiceName -ErrorAction SilentlyContinue
  if (-not $windowsService) {
    return $false
  }
  if ($windowsService.Status -ne "Running") {
    Start-Service -Name $windowsServiceName
    $windowsService.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  }
  Write-Host "Windows service $windowsServiceName is running."
  return $true
}

function Start-WorkerProcess {
  param([string]$Name)
  if (Start-WorkerWindowsService -Name $Name) {
    return
  }
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
