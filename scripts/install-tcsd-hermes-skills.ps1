param(
    [string]$SnapshotPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjectRoot
try {
    if ($SnapshotPath) {
        $env:TCSD_SKILL_INSTALL_SNAPSHOT_PATH = [System.IO.Path]::GetFullPath($SnapshotPath)
    }
    node "scripts/install-tcsd-hermes-skills.mjs"
    if ($LASTEXITCODE -ne 0) {
        throw "TCSD Hermes skill installation/discovery failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
