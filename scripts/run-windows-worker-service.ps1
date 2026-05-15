param(
  [ValidateSet("hermes", "matlab")]
  [string]$Service,
  [string]$InstallDir = "C:\SoftwareDocWorker"
)

$ErrorActionPreference = "Stop"

function Import-EnvFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment file not found: $Path"
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

$appDir = Join-Path $InstallDir "app"
$envFile = Join-Path $InstallDir "software-doc-worker.env"
Import-EnvFile -Path $envFile
Set-Location $appDir

if ($Service -eq "hermes") {
  npm.cmd run hermes:start
} else {
  npm.cmd run matlab-worker:start
}
