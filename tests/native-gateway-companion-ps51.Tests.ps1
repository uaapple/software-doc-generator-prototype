param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$repositoryScriptPath = Join-Path $RepositoryRoot "scripts\deploy-native-matlab-gateway.ps1"
$packageScriptPath = Join-Path $RepositoryRoot "deploy-native-matlab-gateway.ps1"
$scriptPath = if (Test-Path -LiteralPath $repositoryScriptPath -PathType Leaf) {
  $repositoryScriptPath
} elseif (Test-Path -LiteralPath $packageScriptPath -PathType Leaf) {
  $packageScriptPath
} else {
  throw "PS5.1 test preflight failed: the protected deployment script was not found."
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Get-FunctionImportScriptBlock([string[]]$Names) {
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath,
    [ref]$tokens,
    [ref]$errors
  )
  Assert-True ($errors.Count -eq 0) "PowerShell parser rejected the deployment script."
  $definitions = New-Object System.Collections.Generic.List[string]
  foreach ($name in $Names) {
    $definition = $ast.FindAll({
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq $name
    }, $true) | Select-Object -First 1
    Assert-True ($null -ne $definition) "Missing function under test: $name"
    $definitions.Add($definition.Extent.Text)
  }
  return [ScriptBlock]::Create(($definitions -join "`r`n`r`n"))
}

$requiredFunctions = @(
  "Get-Sha256",
  "Resolve-SafePath",
  "Assert-AtomicReplacementTarget",
  "Invoke-AtomicFileReplace",
  "Get-EnvKeyCount",
  "Set-EnvValuesAtomic",
  "Throw-ConfigurationError",
  "Resolve-AbsoluteWindowsPath",
  "Assert-DirectoryWritable",
  "Assert-DirectoryExists",
  "Assert-RequiredFile",
  "Assert-EquivalentWindowsPath",
  "Resolve-NativeGatewayConfiguration",
  "New-LocalEvaluateToken",
  "Resolve-TokenPlan",
  "Restore-Backup",
  "Test-TcpPort",
  "Get-SafeGatewayStartupCategory",
  "Wait-GatewayHealth"
)
$functionImport = Get-FunctionImportScriptBlock $requiredFunctions
. $functionImport

foreach ($functionName in $requiredFunctions) {
  $command = Get-Command -Name $functionName -CommandType Function -ErrorAction SilentlyContinue
  Assert-True ($null -ne $command) (
    "PS5.1 test import preflight failed: function '$functionName' is not visible in script scope."
  )
}

$envExamplePath = Join-Path $RepositoryRoot ".env.windows-docker-desktop.example"
Assert-True (
  Test-Path -LiteralPath $envExamplePath -PathType Leaf
) "PS5.1 test preflight failed: the protected Windows env example was not found."
$exampleDataLine = Get-Content -LiteralPath $envExamplePath |
  Where-Object { $_ -match "^SDG_CONTAINER_DATA_DIR=" } |
  Select-Object -First 1
Assert-True ([bool]$exampleDataLine) (
  "PS5.1 test preflight failed: SDG_CONTAINER_DATA_DIR is missing from the Windows env example."
)
$exampleDataRoot = ([string]$exampleDataLine).Substring(
  ([string]$exampleDataLine).IndexOf("=") + 1
)
Assert-True ($exampleDataRoot -match "^[A-Za-z]:/") (
  "PS5.1 test preflight failed: the formal Windows env example is not using forward slashes."
)

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "sdg-native-gateway-ps51-tests-{0}" -f ([Guid]::NewGuid().ToString("N"))
)
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

try {
  # PS5.1 CSPRNG path: URL-safe 32-byte tokens are 43 characters and not reused.
  $tokenA = New-LocalEvaluateToken
  $tokenB = New-LocalEvaluateToken
  Assert-True ($tokenA.Length -eq 43) "Evaluate token length is not 43."
  Assert-True ($tokenA -match "^[A-Za-z0-9_-]{43}$") "Evaluate token is not URL-safe."
  Assert-True ($tokenA -ne $tokenB) "CSPRNG returned a repeated test token."

  # Equal pre-existing evaluate tokens are a supported resumable production baseline.
  $existingPlan = Resolve-TokenPlan @{
    MATLAB_GATEWAY_TOKEN = "gw-test"
    MATLAB_GATEWAY_EVALUATE_TOKEN = "eval-test"
  } @{
    MATLAB_GATEWAY_TOKEN = "gw-test"
    MATLAB_GATEWAY_EVALUATE_TOKEN = "eval-test"
  } $true
  Assert-True (-not $existingPlan.requiresEvaluateTokenGeneration) (
    "Equal existing evaluate tokens unexpectedly requested regeneration."
  )
  Assert-True ($existingPlan.evaluateToken -eq "eval-test") (
    "Equal existing evaluate token was not preserved."
  )

  # Existing target uses File.Replace with a real backup and leaves one managed key.
  $existing = Join-Path $testRoot "existing.env"
  [System.IO.File]::WriteAllText(
    $existing,
    "KEEP=unchanged`r`nMATLAB_GATEWAY_EVALUATE_TOKEN=old`r`nMATLAB_GATEWAY_EVALUATE_TOKEN=duplicate`r`n"
  )
  Set-EnvValuesAtomic $existing @{ MATLAB_GATEWAY_EVALUATE_TOKEN = "replacement" }
  Assert-True ((Get-EnvKeyCount $existing "MATLAB_GATEWAY_EVALUATE_TOKEN") -eq 1) (
    "Atomic env update did not deduplicate the managed key."
  )
  Assert-True ((Get-Content -LiteralPath $existing -Raw) -match "KEEP=unchanged") (
    "Atomic env update removed an unrelated field."
  )

  # A missing target follows the distinct same-directory atomic-create path.
  $absentTarget = Join-Path $testRoot "absent.env"
  $absentTemporary = Join-Path $testRoot "absent.tmp"
  [System.IO.File]::WriteAllText($absentTemporary, "created")
  Invoke-AtomicFileReplace $absentTemporary $absentTarget
  Assert-True ([System.IO.File]::ReadAllText($absentTarget) -eq "created") (
    "Atomic absent-target create failed."
  )

  # An injected post-replace failure must restore the original bytes exactly.
  $restoreTarget = Join-Path $testRoot "restore.env"
  $restoreTemporary = Join-Path $testRoot "restore.tmp"
  $originalBytes = [System.Text.Encoding]::UTF8.GetBytes("original-byte-baseline`r`n")
  [System.IO.File]::WriteAllBytes($restoreTarget, $originalBytes)
  [System.IO.File]::WriteAllText($restoreTemporary, "replacement")
  function Assert-AtomicReplacementTarget([string]$PathValue) {
    throw "injected validation failure"
  }
  $didFail = $false
  try {
    Invoke-AtomicFileReplace $restoreTemporary $restoreTarget
  } catch {
    $didFail = $true
  }
  Assert-True $didFail "Injected atomic replacement failure did not fail."
  $restoredBytes = [System.IO.File]::ReadAllBytes($restoreTarget)
  Assert-True (
    [Convert]::ToBase64String($restoredBytes) -eq [Convert]::ToBase64String($originalBytes)
  ) "Atomic replacement failure did not restore the original bytes."

  # Container env is the single source for the native Gateway workspace mapping.
  $dataRoot = Join-Path $testRoot "data"
  $stateRoot = Join-Path $testRoot "state"
  $matlabRoot = Join-Path $testRoot "MATLAB\R2025b"
  $mcpTemp = Join-Path $testRoot "mcp-temp"
  $toolkitRoot = Join-Path $testRoot "agentic-toolkits\simulink"
  $mcpCommand = Join-Path $testRoot "matlab-mcp-server.exe"
  foreach ($directory in @(
    $dataRoot,
    $stateRoot,
    $matlabRoot,
    $mcpTemp,
    (Join-Path $toolkitRoot "tools")
  )) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  [System.IO.File]::WriteAllText((Join-Path $toolkitRoot "tools\tools.json"), "{}")
  [System.IO.File]::WriteAllText($mcpCommand, "test executable placeholder")

  $nativeConfiguration = @{
    MATLAB_ROOT = $matlabRoot
    MATLAB_MCP_SERVER_COMMAND = $mcpCommand
    MATLAB_MCP_TMPDIR = $mcpTemp
    SIMULINK_AGENTIC_TOOLKIT_ROOT = $toolkitRoot
  }
  $dataRootForwardSlash = $dataRoot.Replace("\", "/")
  $containerConfiguration = @{
    SDG_CONTAINER_DATA_DIR = $dataRootForwardSlash
    MATLAB_GATEWAY_STATE_DIR = $stateRoot
    MATLAB_GATEWAY_CONTAINER_ROOT = "/var/lib/sdg/data"
    SATK_GATEWAY_MAPPING_ID = "worker-data"
    MATLAB_ROOT = $matlabRoot
  }
  $gatewayPlan = Resolve-NativeGatewayConfiguration $nativeConfiguration $containerConfiguration
  Assert-True ($gatewayPlan.hostRoot -eq $dataRoot) "Host root was not derived from container data."
  Assert-True (
    $gatewayPlan.nativeUpdates.MATLAB_GATEWAY_HOST_ROOT -eq $dataRoot
  ) "Native host root update is missing."
  Assert-True (
    $gatewayPlan.nativeUpdates.MATLAB_GATEWAY_MAPPING_ID -eq "worker-data"
  ) "Native mapping ID update is missing."
  Assert-True (
    $gatewayPlan.nativeUpdates.SATK_MATLAB_SESSION_MODE -eq "new"
  ) "Windows MATLAB session mode did not default to new."

  # The formal env example's C:/ path reaches the full configuration resolver.
  $originalDirectoryWritable = ${function:Assert-DirectoryWritable}
  function Assert-DirectoryWritable(
    [string]$PathValue,
    [string]$Label,
    [string]$CategoryPrefix
  ) {
    if ($CategoryPrefix -eq "HOST_ROOT") { return }
    & $originalDirectoryWritable $PathValue $Label $CategoryPrefix
  }
  try {
    $formalContainerConfiguration = $containerConfiguration.Clone()
    $formalContainerConfiguration["SDG_CONTAINER_DATA_DIR"] = $exampleDataRoot
    $formalPlan = Resolve-NativeGatewayConfiguration (
      $nativeConfiguration
    ) $formalContainerConfiguration
    Assert-True (
      $formalPlan.hostRoot -eq [System.IO.Path]::GetFullPath($exampleDataRoot)
    ) "Formal forward-slash env path was not canonicalized by the configuration resolver."
  } finally {
    Set-Item -Path Function:Assert-DirectoryWritable -Value $originalDirectoryWritable
  }

  # Forward- and backslash spellings of the same absolute path are equivalent.
  $canonicalExampleRoot = [System.IO.Path]::GetFullPath($exampleDataRoot)
  Assert-EquivalentWindowsPath (
    $exampleDataRoot
  ) $canonicalExampleRoot "Gateway host root" "HOST_ROOT"
  $uncPath = Resolve-AbsoluteWindowsPath (
    "\\server\share\data"
  ) "UNC test path" "PATH"
  Assert-True ($uncPath -match "^\\\\server\\share\\data") (
    "A fully qualified UNC child path was not preserved."
  )

  foreach ($rejectedPath in @(
    @{ value = ""; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "relative\data"; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "C:relative\data"; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "\root-relative"; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "/root-relative"; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "/tmp/sdg-data"; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "//server/share/data"; category = "PATH_ABSOLUTE_REQUIRED" },
    @{ value = "C:\"; category = "PATH_ROOT_FORBIDDEN" },
    @{ value = "C:/"; category = "PATH_ROOT_FORBIDDEN" },
    @{ value = "\\server\share\"; category = "PATH_ROOT_FORBIDDEN" }
  )) {
    $rejected = $false
    try {
      Resolve-AbsoluteWindowsPath (
        [string]$rejectedPath.value
      ) "test path" "PATH" | Out-Null
    } catch {
      $rejected = $_.Exception.Message -match (
        "\[{0}\]" -f [regex]::Escape([string]$rejectedPath.category)
      )
    }
    Assert-True $rejected "Unsafe or non-absolute Windows path was not rejected."
  }

  $relativeRejected = $false
  try {
    Resolve-NativeGatewayConfiguration $nativeConfiguration (@{
      SDG_CONTAINER_DATA_DIR = "relative\data"
      MATLAB_GATEWAY_STATE_DIR = $stateRoot
      MATLAB_GATEWAY_CONTAINER_ROOT = "/var/lib/sdg/data"
      SATK_GATEWAY_MAPPING_ID = "worker-data"
      MATLAB_ROOT = $matlabRoot
    }) | Out-Null
  } catch {
    $relativeRejected = $_.Exception.Message -match "\[HOST_ROOT_ABSOLUTE_REQUIRED\]"
  }
  Assert-True $relativeRejected "Relative host root was not rejected."

  $missingDirectoryRejected = $false
  try {
    Resolve-NativeGatewayConfiguration $nativeConfiguration (@{
      SDG_CONTAINER_DATA_DIR = (Join-Path $testRoot "missing-data")
      MATLAB_GATEWAY_STATE_DIR = $stateRoot
      MATLAB_GATEWAY_CONTAINER_ROOT = "/var/lib/sdg/data"
      SATK_GATEWAY_MAPPING_ID = "worker-data"
      MATLAB_ROOT = $matlabRoot
    }) | Out-Null
  } catch {
    $missingDirectoryRejected = $_.Exception.Message -match "\[HOST_ROOT_DIRECTORY_REQUIRED\]"
  }
  Assert-True $missingDirectoryRejected "Missing host root directory was not rejected."

  $mappingConflictRejected = $false
  try {
    Resolve-NativeGatewayConfiguration (@{
      MATLAB_GATEWAY_HOST_ROOT = $stateRoot
      MATLAB_ROOT = $matlabRoot
      MATLAB_MCP_SERVER_COMMAND = $mcpCommand
      MATLAB_MCP_TMPDIR = $mcpTemp
      SIMULINK_AGENTIC_TOOLKIT_ROOT = $toolkitRoot
    }) $containerConfiguration | Out-Null
  } catch {
    $mappingConflictRejected = $_.Exception.Message -match "\[HOST_ROOT_CONFLICT\]"
  }
  Assert-True $mappingConflictRejected "Conflicting native host root was not rejected."

  $mappingIdConflictRejected = $false
  try {
    Resolve-NativeGatewayConfiguration (@{
      MATLAB_ROOT = $matlabRoot
      MATLAB_MCP_SERVER_COMMAND = $mcpCommand
      MATLAB_MCP_TMPDIR = $mcpTemp
      SIMULINK_AGENTIC_TOOLKIT_ROOT = $toolkitRoot
      SATK_GATEWAY_MAPPING_ID = "other-data"
    }) $containerConfiguration | Out-Null
  } catch {
    $mappingIdConflictRejected = $_.Exception.Message -match "\[MAPPING_ID_CONFLICT\]"
  }
  Assert-True $mappingIdConflictRejected "Conflicting native mapping ID was not rejected."

  # A deployment failure restores managed files and both env files byte-for-byte.
  $rollbackRoot = Join-Path $testRoot "rollback"
  $rollbackAppRoot = Join-Path $rollbackRoot "app"
  $rollbackBackupRoot = Join-Path $rollbackRoot "backup"
  $rollbackTarget = Join-Path $rollbackAppRoot "src\managed.js"
  $rollbackBackupFile = Join-Path $rollbackBackupRoot "files\src\managed.js"
  $rollbackNativeEnv = Join-Path $rollbackRoot "software-doc-worker.env"
  $rollbackContainerEnv = Join-Path $rollbackRoot "container-prod.env"
  foreach ($directory in @(
    (Split-Path -Parent $rollbackTarget),
    (Split-Path -Parent $rollbackBackupFile),
    (Join-Path $rollbackBackupRoot "env")
  )) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $managedOriginal = [System.Text.Encoding]::UTF8.GetBytes("managed-original`r`n")
  $nativeOriginal = [System.Text.Encoding]::UTF8.GetBytes("NATIVE=original`r`n")
  $containerOriginal = [System.Text.Encoding]::UTF8.GetBytes("CONTAINER=original`r`n")
  [System.IO.File]::WriteAllBytes($rollbackBackupFile, $managedOriginal)
  [System.IO.File]::WriteAllBytes(
    (Join-Path $rollbackBackupRoot "env\native.env"),
    $nativeOriginal
  )
  [System.IO.File]::WriteAllBytes(
    (Join-Path $rollbackBackupRoot "env\container.env"),
    $containerOriginal
  )
  [System.IO.File]::WriteAllText($rollbackTarget, "managed-replacement")
  [System.IO.File]::WriteAllText($rollbackNativeEnv, "NATIVE=replacement")
  [System.IO.File]::WriteAllText($rollbackContainerEnv, "CONTAINER=replacement")
  [ordered]@{
    schema = "sdg-native-matlab-gateway-backup/v1"
    service = @{ state = "Running" }
    nativeEnv = $rollbackNativeEnv
    containerEnv = $rollbackContainerEnv
    files = @(
      [ordered]@{
        target = "src/managed.js"
        existed = $true
        sha256 = (Get-Sha256 $rollbackBackupFile)
      }
    )
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (
    Join-Path $rollbackBackupRoot "backup-manifest.json"
  ) -Encoding utf8
  $null = Restore-Backup $rollbackBackupRoot $rollbackAppRoot
  foreach ($comparison in @(
    @{ actual = $rollbackTarget; expected = $managedOriginal },
    @{ actual = $rollbackNativeEnv; expected = $nativeOriginal },
    @{ actual = $rollbackContainerEnv; expected = $containerOriginal }
  )) {
    Assert-True (
      [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($comparison.actual)) -eq
      [Convert]::ToBase64String($comparison.expected)
    ) "Rollback did not restore original bytes."
  }

  # Readiness: Running alone is insufficient; a delayed port then healthy HTTP succeeds.
  $script:portChecks = 0
  function Get-Service { return [pscustomobject]@{ Status = "Running" } }
  function Test-TcpPort {
    $script:portChecks += 1
    return $script:portChecks -ge 2
  }
  function Invoke-RestMethod { return [pscustomobject]@{ ok = $true } }
  function Start-Sleep {}
  Wait-GatewayHealth @{} "delayed-port" 5 2
  Assert-True ($script:portChecks -eq 2) "Readiness did not wait for the delayed port."

  # A service that exits before binding fails immediately.
  $InstallDir = $testRoot
  $logsRoot = Join-Path $InstallDir "logs"
  New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $logsRoot "SoftwareDocMatlabWorker-service-host-test.log"),
    "Native MATLAB Gateway wrapper startup failed [HOST_ROOT_REQUIRED]."
  )
  function Get-Service { return [pscustomobject]@{ Status = "Stopped" } }
  function Get-CimInstance { return [pscustomobject]@{ ExitCode = 1067 } }
  $earlyExit = $false
  try {
    Wait-GatewayHealth @{} "early-exit" 5 2 ([DateTime]::UtcNow)
  } catch {
    $earlyExit =
      $_.Exception.Message -match "exited before" -and
      $_.Exception.Message -match "applicationCategory=HOST_ROOT_REQUIRED"
  }
  Assert-True $earlyExit "Readiness did not classify an early service exit."

  # A running service with no port exhausts the explicit total deadline.
  function Get-Service { return [pscustomobject]@{ Status = "Running" } }
  function Test-TcpPort { return $false }
  $timedOut = $false
  try {
    Wait-GatewayHealth @{} "timeout" 0 1
  } catch {
    $timedOut = $_.Exception.Message -match "timed out"
  }
  Assert-True $timedOut "Readiness did not report bounded timeout exhaustion."
} finally {
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Native Gateway Windows PowerShell 5.1 tests passed."
