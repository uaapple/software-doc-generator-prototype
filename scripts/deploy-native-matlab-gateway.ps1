param(
  [string]$CompanionRoot = $PSScriptRoot,
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [Parameter(Mandatory = $true)]
  [string]$ContainerEnvFile,
  [switch]$ValidateOnly,
  [switch]$Rollback,
  [string]$BackupDir
)

$ErrorActionPreference = "Stop"
$ServiceName = "SoftwareDocMatlabWorker"
$ExpectedProvider = "deepseek"
$ExpectedModel = "deepseek-v4-pro"
$ExpectedBaseUrl = "https://api.deepseek.com"

function Get-Sha256([string]$PathValue) {
  return (Get-FileHash -LiteralPath $PathValue -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-AtomicReplacementTarget([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    throw "Atomic replacement did not produce the target file."
  }
}

function Resolve-SafePath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Read-EnvFile([string]$PathValue) {
  $values = @{}
  foreach ($rawLine in Get-Content -LiteralPath $PathValue) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { continue }
    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }
  return $values
}

function Get-EnvKeyCount([string]$PathValue, [string]$Key) {
  $count = 0
  foreach ($rawLine in Get-Content -LiteralPath $PathValue) {
    if ([string]$rawLine -match "^\s*$([regex]::Escape($Key))\s*=") {
      $count += 1
    }
  }
  return $count
}

function Invoke-AtomicFileReplace(
  [string]$TemporaryPath,
  [string]$TargetPath
) {
  $targetExisted = Test-Path -LiteralPath $TargetPath -PathType Leaf
  if (-not $targetExisted) {
    # A same-directory File.Move is an atomic create when the destination does not exist.
    [System.IO.File]::Move($TemporaryPath, $TargetPath)
    return
  }

  $suffix = "{0}-{1}" -f $PID, ([Guid]::NewGuid().ToString("N"))
  $backupPath = "$TargetPath.sdg-replace-backup-$suffix"
  $recoveryPath = "$TargetPath.sdg-recovery-backup-$suffix"
  $originalHash = Get-Sha256 $TargetPath
  $safeToRemoveRecoveryFiles = $false
  try {
    # Windows PowerShell 5.1/.NET Framework rejects a null backup path.
    [System.IO.File]::Replace($TemporaryPath, $TargetPath, $backupPath, $true)
    Assert-AtomicReplacementTarget $TargetPath
    $safeToRemoveRecoveryFiles = $true
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction Stop
  } catch {
    $failure = $_
    $safeToRemoveRecoveryFiles = $false
    try {
      if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
        if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
          [System.IO.File]::Replace($backupPath, $TargetPath, $recoveryPath, $true)
        } else {
          [System.IO.File]::Move($backupPath, $TargetPath)
        }
      }
      if (
        -not (Test-Path -LiteralPath $TargetPath -PathType Leaf) -or
        (Get-Sha256 $TargetPath) -ne $originalHash
      ) {
        throw "Original target hash verification failed."
      }
      $safeToRemoveRecoveryFiles = $true
    } catch {
      throw "Atomic replacement failed; recovery evidence was retained beside the target."
    }
    throw $failure
  } finally {
    if ($safeToRemoveRecoveryFiles) {
      Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $recoveryPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function Set-EnvValuesAtomic(
  [string]$PathValue,
  [hashtable]$Updates
) {
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in Get-Content -LiteralPath $PathValue) {
    $lines.Add([string]$line)
  }
  foreach ($key in $Updates.Keys) {
    $replaced = $false
    for ($index = $lines.Count - 1; $index -ge 0; $index -= 1) {
      if ($lines[$index] -match "^\s*$([regex]::Escape($key))\s*=") {
        if ($replaced) {
          $lines.RemoveAt($index)
        } else {
          $lines[$index] = "$key=$($Updates[$key])"
          $replaced = $true
        }
      }
    }
    if (-not $replaced) {
      $lines.Add("$key=$($Updates[$key])")
    }
  }
  $temporary = "$PathValue.sdg-new-$PID-$([Guid]::NewGuid().ToString("N"))"
  try {
    [System.IO.File]::WriteAllLines($temporary, $lines, [System.Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $PathValue -PathType Leaf) {
      $acl = Get-Acl -LiteralPath $PathValue
      Set-Acl -LiteralPath $temporary -AclObject $acl
    }
    Invoke-AtomicFileReplace $temporary $PathValue
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

function New-LocalEvaluateToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  if (-not $rng) { throw "A cryptographic random number generator is unavailable." }
  try {
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  } finally {
    $rng.Dispose()
  }
}

function Assert-WindowsPowerShellCompatibility {
  if ($env:OS -ne "Windows_NT" -or $PSVersionTable.PSVersion.Major -lt 5) {
    throw "Windows PowerShell 5.1 or a compatible newer Windows PowerShell runtime is required."
  }

  $probeRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    "sdg-gateway-ps51-{0}" -f ([Guid]::NewGuid().ToString("N"))
  )
  New-Item -ItemType Directory -Path $probeRoot -Force | Out-Null
  try {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      if (-not $rng) { throw "CSPRNG creation returned no implementation." }
      $rng.GetBytes($bytes)
    } finally {
      if ($rng) { $rng.Dispose() }
    }

    $target = Join-Path $probeRoot "target.env"
    $staged = Join-Path $probeRoot "staged.env"
    $backup = Join-Path $probeRoot "replace.backup"
    [System.IO.File]::WriteAllText($target, "before")
    [System.IO.File]::WriteAllText($staged, "after")
    [System.IO.File]::Replace($staged, $target, $backup, $true)
    if (
      [System.IO.File]::ReadAllText($target) -ne "after" -or
      [System.IO.File]::ReadAllText($backup) -ne "before"
    ) {
      throw "File.Replace capability probe returned unexpected bytes."
    }

    $absentTarget = Join-Path $probeRoot "absent-target.env"
    $absentStaged = Join-Path $probeRoot "absent-staged.env"
    [System.IO.File]::WriteAllText($absentStaged, "created")
    [System.IO.File]::Move($absentStaged, $absentTarget)
    if ([System.IO.File]::ReadAllText($absentTarget) -ne "created") {
      throw "Atomic create capability probe returned unexpected bytes."
    }
  } catch {
    throw "Windows PowerShell/.NET atomic file capability check failed: $($_.Exception.Message)"
  } finally {
    Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Assert-Manifest {
  param(
    [object]$Manifest,
    [string]$Root
  )
  if (
    $Manifest.schema -ne "sdg-native-matlab-gateway-companion/v3" -or
    $Manifest.companionVersion -ne 3 -or
    $Manifest.serviceName -ne $ServiceName -or
    $Manifest.sourceRevision -notmatch "^[a-f0-9]{40}$" -or
    $Manifest.sourceRevision -ne $Manifest.deploymentToolRevision -or
    $Manifest.imageRevisions.rootfsInputsChanged -ne $false
  ) {
    throw "Companion manifest identity or image boundary is invalid."
  }
  foreach ($file in $Manifest.files) {
    $source = Resolve-SafePath (Join-Path $Root (Join-Path "payload" ([string]$file.target)))
    $payloadRoot = Resolve-SafePath (Join-Path $Root "payload")
    if (-not $source.StartsWith("$payloadRoot\", [StringComparison]::OrdinalIgnoreCase)) {
      throw "Companion payload path escaped its root."
    }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Companion payload file is missing: $($file.target)"
    }
    if ((Get-Sha256 $source) -ne [string]$file.sha256) {
      throw "Companion payload hash mismatch: $($file.target)"
    }
    if ((Get-Item -LiteralPath $source).Length -ne [long]$file.sizeBytes) {
      throw "Companion payload size mismatch: $($file.target)"
    }
  }
  foreach ($tool in $Manifest.toolFiles) {
    $toolPath = Resolve-SafePath (Join-Path $Root ([string]$tool.packagePath))
    if (
      -not (Test-Path -LiteralPath $toolPath -PathType Leaf) -or
      (Get-Sha256 $toolPath) -ne [string]$tool.sha256 -or
      (Get-Item -LiteralPath $toolPath).Length -ne [long]$tool.sizeBytes
    ) {
      throw "Companion deployment tool is missing or has the wrong evidence."
    }
  }
  foreach ($validation in $Manifest.validationFiles) {
    $validationPath = Resolve-SafePath (Join-Path $Root ([string]$validation.packagePath))
    if (
      [string]$validation.runtime -ne "powershell.exe-5.1" -or
      $validation.readOnly -ne $true -or
      -not (Test-Path -LiteralPath $validationPath -PathType Leaf) -or
      (Get-Sha256 $validationPath) -ne [string]$validation.sha256 -or
      (Get-Item -LiteralPath $validationPath).Length -ne [long]$validation.sizeBytes
    ) {
      throw "Companion validation script is missing or has the wrong evidence."
    }
  }
  $scanPath = Join-Path $Root ([string]$Manifest.scan.file)
  if (
    -not (Test-Path -LiteralPath $scanPath -PathType Leaf) -or
    (Get-Sha256 $scanPath) -ne [string]$Manifest.scan.sha256
  ) {
    throw "Companion scan evidence is missing or has the wrong hash."
  }
  $scan = Get-Content -LiteralPath $scanPath -Raw | ConvertFrom-Json
  if ($scan.status -ne "passed" -or $Manifest.scan.status -ne "passed") {
    throw "Companion scan evidence did not pass."
  }
}

function Get-ServiceSnapshot {
  $service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
  if (-not $service) { throw "Required service is missing: $ServiceName" }
  return [ordered]@{
    name = $service.Name
    state = $service.State
    startMode = $service.StartMode
    startName = $service.StartName
    pathName = $service.PathName
    serviceType = $service.ServiceType
  }
}

function Stop-GatewayService {
  $service = Get-Service -Name $ServiceName
  if ($service.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force
    $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(45))
  }
}

function Start-GatewayService {
  $service = Get-Service -Name $ServiceName
  if ($service.Status -ne "Running") {
    Start-Service -Name $ServiceName
  }
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMilliseconds = 1000) {
  $client = New-Object System.Net.Sockets.TcpClient
  $asyncResult = $null
  try {
    $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
      return $false
    }
    $client.EndConnect($asyncResult)
    return $client.Connected
  } catch {
    return $false
  } finally {
    if ($asyncResult -and $asyncResult.AsyncWaitHandle) {
      $asyncResult.AsyncWaitHandle.Close()
    }
    $client.Close()
  }
}

function Wait-GatewayHealth(
  [hashtable]$NativeValues,
  [string]$ReadinessLabel,
  [int]$TotalTimeoutSeconds = 120,
  [int]$HealthTimeoutSeconds = 30
) {
  $port = if ($NativeValues["MATLAB_WORKER_PORT"]) { [int]$NativeValues["MATLAB_WORKER_PORT"] } else { 5100 }
  $deadline = (Get-Date).AddSeconds($TotalTimeoutSeconds)
  do {
    $remainingMilliseconds = [Math]::Floor(($deadline - (Get-Date)).TotalMilliseconds)
    if ($remainingMilliseconds -le 0) { break }
    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq "Stopped") {
      $serviceDetails = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
      $exitCode = if ($serviceDetails) { [int]$serviceDetails.ExitCode } else { -1 }
      throw "$ReadinessLabel service exited before port $port became healthy (category=service-exited, win32ExitCode=$exitCode)."
    }
    $tcpTimeout = [Math]::Min(1000, [Math]::Max(1, $remainingMilliseconds))
    if ($service.Status -eq "Running" -and (Test-TcpPort "127.0.0.1" $port $tcpTimeout)) {
      $remaining = [Math]::Max(1, [Math]::Ceiling(($deadline - (Get-Date)).TotalSeconds))
      $requestTimeout = [Math]::Min($HealthTimeoutSeconds, $remaining)
      try {
        $health = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$port/health" `
          -TimeoutSec $requestTimeout
        if ($health.ok) { return }
      } catch {
        # A running service may bind before HTTP is ready. Retry within the total deadline.
      }
    }
    $sleepMilliseconds = [Math]::Min(
      2000,
      [Math]::Max(0, [Math]::Floor(($deadline - (Get-Date)).TotalMilliseconds))
    )
    if ($sleepMilliseconds -gt 0) { Start-Sleep -Milliseconds $sleepMilliseconds }
  } while ((Get-Date) -lt $deadline)
  throw "$ReadinessLabel timed out after $TotalTimeoutSeconds seconds waiting for port $port health."
}

function Get-GatewayProtocolAudit(
  [string]$GatewayToken,
  [hashtable]$NativeValues
) {
  $port = if ($NativeValues["MATLAB_WORKER_PORT"]) { [int]$NativeValues["MATLAB_WORKER_PORT"] } else { 5100 }
  $base = "http://127.0.0.1:$port"
  $health = Invoke-RestMethod -Method Get -Uri "$base/health" -TimeoutSec 5
  if (-not $health.ok) { throw "Existing MATLAB Gateway health audit failed." }
  try {
    $version = Invoke-RestMethod -Method Get -Uri "$base/version" -Headers @{
      Authorization = "Bearer $GatewayToken"
    } -TimeoutSec 5
    if ($version.gatewayVersion) { return "workspace-job-v1" }
    throw "Existing MATLAB Gateway returned an invalid version contract."
  } catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    if ($statusCode -eq 404) { return "legacy-analyze-slx" }
    throw
  }
}

function Wait-LegacyGatewayHealth([hashtable]$NativeValues) {
  Wait-GatewayHealth $NativeValues "Restored legacy MATLAB Gateway" 120 30
}

function Protect-BackupDirectory([string]$PathValue) {
  & icacls.exe $PathValue /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to restrict backup directory ACL."
  }
}

function Save-Backup(
  [object]$Manifest,
  [string]$AppRoot,
  [string]$NativeEnv,
  [string]$DockerEnv,
  [object]$ServiceSnapshot,
  [string]$Destination
) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Protect-BackupDirectory $Destination
  $filesRoot = Join-Path $Destination "files"
  New-Item -ItemType Directory -Path $filesRoot -Force | Out-Null
  $entries = @()
  foreach ($file in $Manifest.files) {
    $target = Resolve-SafePath (Join-Path $AppRoot ([string]$file.target))
    $exists = Test-Path -LiteralPath $target -PathType Leaf
    if ($exists) {
      $backupFile = Join-Path $filesRoot ([string]$file.target)
      New-Item -ItemType Directory -Path (Split-Path -Parent $backupFile) -Force | Out-Null
      Copy-Item -LiteralPath $target -Destination $backupFile -Force
    }
    $entries += [ordered]@{
      target = [string]$file.target
      existed = $exists
      sha256 = if ($exists) { Get-Sha256 $target } else { "" }
    }
  }
  $envRoot = Join-Path $Destination "env"
  New-Item -ItemType Directory -Path $envRoot -Force | Out-Null
  Copy-Item -LiteralPath $NativeEnv -Destination (Join-Path $envRoot "native.env") -Force
  Copy-Item -LiteralPath $DockerEnv -Destination (Join-Path $envRoot "container.env") -Force
  $serviceRoot = Join-Path $Destination "service"
  New-Item -ItemType Directory -Path $serviceRoot -Force | Out-Null
  $ServiceSnapshot | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $serviceRoot "service.json") -Encoding utf8
  & sc.exe qc $ServiceName | Set-Content -LiteralPath (Join-Path $serviceRoot "sc-qc.txt") -Encoding utf8
  & reg.exe export "HKLM\SYSTEM\CurrentControlSet\Services\$ServiceName" (Join-Path $serviceRoot "service.reg") /y | Out-Null
  [ordered]@{
    schema = "sdg-native-matlab-gateway-backup/v1"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    service = $ServiceSnapshot
    nativeEnv = $NativeEnv
    containerEnv = $DockerEnv
    files = $entries
  } | ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath (Join-Path $Destination "backup-manifest.json") -Encoding utf8
}

function Restore-Backup(
  [string]$Source,
  [string]$AppRoot
) {
  $backupManifestPath = Join-Path $Source "backup-manifest.json"
  if (-not (Test-Path -LiteralPath $backupManifestPath -PathType Leaf)) {
    throw "Backup manifest is missing."
  }
  $backup = Get-Content -LiteralPath $backupManifestPath -Raw | ConvertFrom-Json
  if ($backup.schema -ne "sdg-native-matlab-gateway-backup/v1") {
    throw "Backup manifest schema is invalid."
  }
  foreach ($file in $backup.files) {
    $target = Resolve-SafePath (Join-Path $AppRoot ([string]$file.target))
    if ($file.existed) {
      $sourceFile = Join-Path (Join-Path $Source "files") ([string]$file.target)
      if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw "Backup source is missing: $($file.target)"
      }
      New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
      Copy-Item -LiteralPath $sourceFile -Destination $target -Force
      if ((Get-Sha256 $target) -ne [string]$file.sha256) {
        throw "Restored source hash mismatch: $($file.target)"
      }
    } else {
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }
  }
  Copy-Item -LiteralPath (Join-Path $Source "env\native.env") -Destination ([string]$backup.nativeEnv) -Force
  Copy-Item -LiteralPath (Join-Path $Source "env\container.env") -Destination ([string]$backup.containerEnv) -Force
  return $backup
}

function Install-ManagedFiles(
  [object]$Manifest,
  [string]$Root,
  [string]$AppRoot
) {
  foreach ($file in $Manifest.files) {
    $source = Join-Path $Root (Join-Path "payload" ([string]$file.target))
    $target = Resolve-SafePath (Join-Path $AppRoot ([string]$file.target))
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    $temporary = "$target.sdg-new-$PID"
    try {
      Copy-Item -LiteralPath $source -Destination $temporary -Force
      if ((Get-Sha256 $temporary) -ne [string]$file.sha256) {
        throw "Staged managed file hash mismatch: $($file.target)"
      }
      Move-Item -LiteralPath $temporary -Destination $target -Force
    } finally {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
}

function Assert-DeepSeekConfiguration([hashtable]$ContainerValues) {
  if (
    ([string]$ContainerValues["HERMES_INFERENCE_PROVIDER"]).ToLowerInvariant() -ne $ExpectedProvider -or
    [string]$ContainerValues["HERMES_INFERENCE_MODEL"] -ne $ExpectedModel -or
    ([string]$ContainerValues["DEEPSEEK_BASE_URL"]).TrimEnd("/") -ne $ExpectedBaseUrl -or
    -not [string]$ContainerValues["DEEPSEEK_API_KEY"]
  ) {
    throw "Container inference configuration is not the approved DeepSeek provider/model/base with a non-empty injected key."
  }
}

function Resolve-TokenPlan(
  [hashtable]$NativeValues,
  [hashtable]$ContainerValues,
  [bool]$Generate
) {
  $gatewayToken = [string]$NativeValues["MATLAB_GATEWAY_TOKEN"]
  $containerGatewayToken = [string]$ContainerValues["MATLAB_GATEWAY_TOKEN"]
  if (-not $gatewayToken) { throw "Native MATLAB_GATEWAY_TOKEN must contain the existing approved value." }
  if ($containerGatewayToken -and $containerGatewayToken -ne $gatewayToken) {
    throw "Native and container MATLAB_GATEWAY_TOKEN values do not match."
  }
  $nativeEvaluate = [string]$NativeValues["MATLAB_GATEWAY_EVALUATE_TOKEN"]
  $containerEvaluate = [string]$ContainerValues["MATLAB_GATEWAY_EVALUATE_TOKEN"]
  if ($nativeEvaluate -and $containerEvaluate -and $nativeEvaluate -ne $containerEvaluate) {
    throw "Native and container MATLAB_GATEWAY_EVALUATE_TOKEN values do not match."
  }
  $evaluateToken = if ($nativeEvaluate) { $nativeEvaluate } else { $containerEvaluate }
  if (-not $evaluateToken -and $Generate) { $evaluateToken = New-LocalEvaluateToken }
  return [ordered]@{
    gatewayToken = $gatewayToken
    evaluateToken = $evaluateToken
    requiresEvaluateTokenGeneration = -not [bool]$evaluateToken
  }
}

function Assert-TokenKeyMultiplicity(
  [string]$NativePath,
  [string]$ContainerPath
) {
  foreach ($entry in @(
    @{ path = $NativePath; label = "native env" },
    @{ path = $ContainerPath; label = "container env" }
  )) {
    $count = Get-EnvKeyCount ([string]$entry.path) "MATLAB_GATEWAY_EVALUATE_TOKEN"
    if ($count -gt 1) {
      throw "$($entry.label) contains duplicate MATLAB_GATEWAY_EVALUATE_TOKEN keys."
    }
  }
}

function Invoke-GatewayReadiness(
  [string]$GatewayToken,
  [string]$EvaluateToken,
  [hashtable]$NativeValues
) {
  $port = if ($NativeValues["MATLAB_WORKER_PORT"]) { [int]$NativeValues["MATLAB_WORKER_PORT"] } else { 5100 }
  $base = "http://127.0.0.1:$port"
  $headers = @{ Authorization = "Bearer $GatewayToken" }
  $health = Invoke-RestMethod -Method Get -Uri "$base/health" -TimeoutSec 5
  if (-not $health.ok) { throw "Native Gateway health failed." }
  $version = Invoke-RestMethod -Method Get -Uri "$base/version" -Headers $headers -TimeoutSec 5
  if (-not $version.gatewayVersion) { throw "Native Gateway version contract failed." }
  $capabilities = Invoke-RestMethod -Method Get -Uri "$base/capabilities" -Headers $headers -TimeoutSec 5
  if ($capabilities.operations -notcontains "evaluate_matlab_code") {
    throw "Native Gateway evaluate capability is missing."
  }
  $suffix = "{0}-{1}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), ([Guid]::NewGuid().ToString("N"))
  $workspaceId = "deploy-ready-$suffix"
  $jobId = "deploy-ready-$suffix"
  $workspaceUrl = "$base/api/workspaces/$workspaceId"
  $jsonHeaders = @{ Authorization = "Bearer $GatewayToken"; "Content-Type" = "application/json" }
  try {
    Invoke-RestMethod -Method Put -Uri $workspaceUrl -Headers $jsonHeaders -Body '{"mappingId":"worker-data"}' -TimeoutSec 10 | Out-Null
    Invoke-RestMethod -Method Put -Uri "$workspaceUrl/assets/probe/text" -Headers $jsonHeaders -Body '{"fileName":"deployment_readiness.m","content":"value = 1 + 1; disp(value);"}' -TimeoutSec 10 | Out-Null
    $evaluateHeaders = @{
      Authorization = "Bearer $GatewayToken"
      "Content-Type" = "application/json"
      "x-sdg-evaluate-token" = $EvaluateToken
      "x-sdg-gateway-caller" = "tcsd-runtime"
    }
    $body = @{
      workspaceId = $workspaceId
      operation = "evaluate_matlab_code"
      inputAssetId = "probe"
      timeoutMs = 120000
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$base/api/jobs/$jobId" -Headers $evaluateHeaders -Body $body -TimeoutSec 10 | Out-Null
    $deadline = (Get-Date).AddSeconds(150)
    do {
      Start-Sleep -Seconds 1
      $job = Invoke-RestMethod -Method Get -Uri "$base/api/jobs/$jobId`?workspaceId=$workspaceId" -Headers $headers -TimeoutSec 5
      if ($job.status -in @("failed", "cancelled", "timed_out")) {
        throw "Native Gateway evaluate readiness ended in state $($job.status)."
      }
    } while ($job.status -ne "succeeded" -and (Get-Date) -lt $deadline)
    if ($job.status -ne "succeeded") { throw "Native Gateway evaluate readiness timed out." }
  } finally {
    try {
      Invoke-RestMethod -Method Delete -Uri $workspaceUrl -Headers $headers -TimeoutSec 5 | Out-Null
    } catch {
      Write-Warning "Readiness workspace cleanup did not complete."
    }
  }
}

$CompanionRoot = Resolve-SafePath $CompanionRoot
$InstallDir = Resolve-SafePath $InstallDir
$ContainerEnvFile = Resolve-SafePath $ContainerEnvFile
$AppRoot = Join-Path $InstallDir "app"
$NativeEnvFile = Join-Path $InstallDir "software-doc-worker.env"
$manifestPath = Get-ChildItem -LiteralPath $CompanionRoot -Filter "*.manifest.json" -File |
  Select-Object -ExpandProperty FullName -First 1
if (-not $manifestPath) { throw "Companion manifest was not found." }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (-not (Test-Path -LiteralPath $AppRoot -PathType Container)) { throw "Worker app directory is missing." }
if (-not (Test-Path -LiteralPath $NativeEnvFile -PathType Leaf)) { throw "Native Worker env file is missing." }
if (-not (Test-Path -LiteralPath $ContainerEnvFile -PathType Leaf)) { throw "Untracked container env file is missing." }
Assert-Manifest $manifest $CompanionRoot
Assert-WindowsPowerShellCompatibility
$serviceSnapshot = Get-ServiceSnapshot
$nativeValues = Read-EnvFile $NativeEnvFile
$containerValues = Read-EnvFile $ContainerEnvFile
Assert-TokenKeyMultiplicity $NativeEnvFile $ContainerEnvFile

if ($Rollback) {
  if (-not $BackupDir) { throw "-Rollback requires -BackupDir." }
  $BackupDir = Resolve-SafePath $BackupDir
  if ($ValidateOnly) {
    $null = Get-Content -LiteralPath (Join-Path $BackupDir "backup-manifest.json") -Raw | ConvertFrom-Json
    Write-Host "Native MATLAB Gateway rollback validation passed." -ForegroundColor Green
    exit 0
  }
  Stop-GatewayService
  $backup = Restore-Backup $BackupDir $AppRoot
  if ($backup.service.state -eq "Running") {
    Start-GatewayService
    Wait-LegacyGatewayHealth (Read-EnvFile ([string]$backup.nativeEnv))
  }
  Write-Host "Native MATLAB Gateway rollback completed." -ForegroundColor Green
  exit 0
}

Assert-DeepSeekConfiguration $containerValues
$tokenPlan = Resolve-TokenPlan $nativeValues $containerValues (-not $ValidateOnly)
$protocolAudit = Get-GatewayProtocolAudit $tokenPlan.gatewayToken $nativeValues

if ($ValidateOnly) {
  Write-Host "Native MATLAB Gateway companion validation passed." -ForegroundColor Green
  Write-Host "Existing Gateway protocol audit: $protocolAudit." -ForegroundColor Yellow
  if ($tokenPlan.requiresEvaluateTokenGeneration) {
    Write-Host "A new local evaluate token will be generated during deployment." -ForegroundColor Yellow
  }
  exit 0
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $BackupDir) {
  $BackupDir = Join-Path $InstallDir "backups\native-gateway-$timestamp"
}
$BackupDir = Resolve-SafePath $BackupDir
Save-Backup $manifest $AppRoot $NativeEnvFile $ContainerEnvFile $serviceSnapshot $BackupDir

try {
  Stop-GatewayService
  Install-ManagedFiles $manifest $CompanionRoot $AppRoot
  Set-EnvValuesAtomic $NativeEnvFile @{
    MATLAB_GATEWAY_TOKEN = $tokenPlan.gatewayToken
    MATLAB_GATEWAY_EVALUATE_TOKEN = $tokenPlan.evaluateToken
  }
  Set-EnvValuesAtomic $ContainerEnvFile @{
    MATLAB_GATEWAY_TOKEN = $tokenPlan.gatewayToken
    MATLAB_GATEWAY_EVALUATE_TOKEN = $tokenPlan.evaluateToken
    HERMES_INFERENCE_PROVIDER = $ExpectedProvider
    HERMES_INFERENCE_MODEL = $ExpectedModel
    DEEPSEEK_BASE_URL = $ExpectedBaseUrl
  }
  Start-GatewayService
  Wait-GatewayHealth (Read-EnvFile $NativeEnvFile) "Native MATLAB Gateway" 120 30
  Invoke-GatewayReadiness $tokenPlan.gatewayToken $tokenPlan.evaluateToken (Read-EnvFile $NativeEnvFile)
  if ($serviceSnapshot.state -ne "Running") {
    Stop-GatewayService
  }
  [ordered]@{
    schema = "sdg-native-matlab-gateway-deployment/v1"
    deployedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceRevision = $manifest.sourceRevision
    deploymentToolRevision = $manifest.deploymentToolRevision
    serviceName = $ServiceName
    backupDir = $BackupDir
    readiness = "evaluate_matlab_code"
  } | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $BackupDir "deployment-result.json") -Encoding utf8
  Write-Host "Native MATLAB Gateway companion deployment and evaluate readiness passed." -ForegroundColor Green
} catch {
  $failure = $_
  Write-Warning "Native Gateway deployment failed; restoring the previous 5100 service."
  Stop-GatewayService
  $backup = Restore-Backup $BackupDir $AppRoot
  if ($backup.service.state -eq "Running") {
    Start-GatewayService
    Wait-LegacyGatewayHealth (Read-EnvFile ([string]$backup.nativeEnv))
  }
  throw $failure
}
