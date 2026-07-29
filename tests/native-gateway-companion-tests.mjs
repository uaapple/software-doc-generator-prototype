import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateImageRevision,
  imageInputs
} from "../scripts/container-image-revisions.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const config = JSON.parse(read("deploy/native-matlab-gateway-companion.json"));
const schema = JSON.parse(
  read("deploy/schemas/native-matlab-gateway-companion.schema.json")
);
const releaseSchema = JSON.parse(
  read("deploy/schemas/native-matlab-gateway-companion-release.schema.json")
);
const deployScript = read("scripts/deploy-native-matlab-gateway.ps1");
const ps51Tests = read("tests/native-gateway-companion-ps51.Tests.ps1");
const ps51Workflow = read(".github/workflows/native-gateway-companion-ps51.yml");
const wrapperRegression = read("tests/native-gateway-windows-wrapper-tests.mjs");
const builder = read("scripts/build-native-matlab-gateway-companion.mjs");
const wrapper = read("native-gateway/windows-matlab-worker-server.mjs");
for (const targetFile of [
  "deploy/targets/linux-prod.json",
  "deploy/targets/windows-prod-full.json",
  "deploy/targets/windows-prod-source.json"
]) {
  const target = JSON.parse(read(targetFile));
  assert.ok(target.excludePaths.includes("scripts/build-native-matlab-gateway-companion.mjs"));
  assert.ok(target.excludePaths.includes("scripts/deploy-native-matlab-gateway.ps1"));
}

const legacy = spawnSync(
  "git",
  ["show", `${config.legacyGatewayRevision}:src/matlab-worker-server.js`],
  { cwd: rootDir, encoding: "utf8" }
);
assert.equal(legacy.status, 0, legacy.stderr);
const legacySource = legacy.stdout;
assert.match(legacySource, /\/mcp\/tools\/analyze_slx/);
for (const requiredRoute of ["/version", "/capabilities", "/api/workspaces", "/api/jobs"]) {
  assert.ok(
    !legacySource.includes(requiredRoute),
    `legacy Gateway unexpectedly satisfies required route ${requiredRoute}`
  );
}
assert.match(legacySource, /if\s*\(!authToken\)\s*\{\s*return next\(\)/);
assert.ok(!legacySource.includes("MATLAB_GATEWAY_EVALUATE_TOKEN"));

assert.equal(config.serviceName, "SoftwareDocMatlabWorker");
assert.equal(config.companionVersion, 7);
assert.equal(config.managedFiles.length, 6);
assert.equal(config.validationFiles.length, 2);
assert.deepEqual(config.validationFiles[0], {
  source: "tests/native-gateway-companion-ps51.Tests.ps1",
  packagePath: "test-native-matlab-gateway-companion-ps51.ps1",
  runtime: "powershell.exe-5.1",
  readOnly: true
});
assert.deepEqual(config.validationFiles[1], {
  source: ".env.windows-docker-desktop.example",
  packagePath: ".env.windows-docker-desktop.example",
  runtime: "env-example",
  readOnly: true
});
assert.equal(calculateImageRevision("platform"), config.expectedImageRevisions.platform);
assert.equal(calculateImageRevision("worker"), config.expectedImageRevisions.worker);
for (const inputs of Object.values(imageInputs)) {
  assert.ok(!inputs.some((entry) => entry.startsWith("native-gateway/")));
  assert.ok(!inputs.some((entry) => entry === "scripts/deploy-native-matlab-gateway.ps1"));
  assert.ok(!inputs.some((entry) => entry === "scripts/build-native-matlab-gateway-companion.mjs"));
}

assert.equal(schema.properties.schema.const, "sdg-native-matlab-gateway-companion/v7");
assert.equal(schema.properties.companionVersion.const, 7);
assert.equal(schema.properties.serviceName.const, "SoftwareDocMatlabWorker");
for (const field of [
  "sourceRevision",
  "deploymentToolRevision",
  "imageRevisions",
  "containerImages",
  "runtimeDependencies",
  "files",
  "toolFiles",
  "validationFiles",
  "scan"
]) {
  assert.ok(schema.required.includes(field));
}
assert.equal(
  releaseSchema.properties.schema.const,
  "sdg-native-matlab-gateway-companion-release/v7"
);
assert.equal(releaseSchema.properties.companionVersion.const, 7);
assert.ok(releaseSchema.required.includes("contents"));
assert.equal(releaseSchema.properties.contents.properties.managedGatewayFileCount.const, 6);
assert.equal(releaseSchema.properties.contents.properties.deploymentToolFileCount.const, 1);
assert.equal(releaseSchema.properties.contents.properties.validationFileCount.const, 2);

assert.match(wrapper, /software-doc-worker\.env/);
assert.match(wrapper, /await import\("\.\/matlab-worker-server-runtime\.js"\)/);
assert.doesNotMatch(wrapper, /MATLAB_GATEWAY_TOKEN\s*=/);
assert.doesNotMatch(wrapper, /MATLAB_GATEWAY_EVALUATE_TOKEN\s*=/);

assert.match(deployScript, /\$ServiceName = "SoftwareDocMatlabWorker"/);
assert.match(deployScript, /\[switch\]\$ValidateOnly/);
assert.match(deployScript, /\[switch\]\$ProvisionDirectories/);
assert.match(deployScript, /\[switch\]\$Rollback/);
assert.match(deployScript, /Invoke-ProvisionDirectories/);
assert.match(deployScript, /Assert-EnvKeysSingleNonEmpty/);
assert.match(deployScript, /Approved directory initialization passed\./);
assert.doesNotMatch(deployScript, /AppendAllText/);
assert.match(deployScript, /Save-Backup/);
assert.match(deployScript, /Restore-Backup/);
assert.match(deployScript, /Stop-GatewayService/);
assert.match(deployScript, /Start-GatewayService/);
assert.match(deployScript, /RandomNumberGenerator/);
assert.match(deployScript, /RandomNumberGenerator\]::Create\(\)/);
assert.match(deployScript, /\.GetBytes\(\$bytes\)/);
assert.match(deployScript, /\.Dispose\(\)/);
assert.doesNotMatch(deployScript, /RandomNumberGenerator\]::Fill/);
assert.match(
  deployScript,
  /File\]::Replace\(\$TemporaryPath,\s*\$TargetPath,\s*\$backupPath,\s*\$true\)/
);
assert.doesNotMatch(deployScript, /File\]::Replace\([^)]*,\s*\$null\s*,/);
assert.match(deployScript, /File\]::Move\(\$TemporaryPath,\s*\$TargetPath\)/);
assert.match(deployScript, /Assert-WindowsPowerShellCompatibility/);
assert.match(deployScript, /File\.Replace capability probe/);
assert.match(deployScript, /Wait-GatewayHealth/);
assert.match(deployScript, /TotalTimeoutSeconds = 120/);
assert.match(deployScript, /HealthTimeoutSeconds = 30/);
assert.match(deployScript, /\$service\.Status -eq "Stopped"/);
assert.match(deployScript, /Test-TcpPort/);
assert.match(deployScript, /duplicate MATLAB_GATEWAY_EVALUATE_TOKEN keys/);
assert.match(deployScript, /\$Manifest\.validationFiles/);
assert.match(deployScript, /powershell\.exe-5\.1/);
assert.match(deployScript, /MATLAB_GATEWAY_EVALUATE_TOKEN/);
assert.match(deployScript, /MATLAB_GATEWAY_TOKEN/);
assert.match(deployScript, /Invoke-GatewayReadiness/);
assert.match(deployScript, /Get-GatewayProtocolAudit/);
assert.match(deployScript, /legacy-analyze-slx/);
assert.match(deployScript, /Resolve-NativeGatewayConfiguration/);
assert.match(deployScript, /\^\[A-Za-z\]:\[\\\\\/\]/);
assert.match(deployScript, /\["SDG_CONTAINER_DATA_DIR"\]/);
assert.match(deployScript, /\["MATLAB_GATEWAY_STATE_DIR"\]/);
assert.match(deployScript, /\/var\/lib\/sdg\/data/);
assert.match(deployScript, /worker-data/);
assert.match(deployScript, /SATK_MATLAB_SESSION_MODE/);
assert.match(deployScript, /Get-SafeGatewayStartupCategory/);
assert.match(deployScript, /applicationCategory=/);
assert.match(deployScript, /evaluate_matlab_code/);
assert.match(deployScript, /\/version/);
assert.match(deployScript, /\/capabilities/);
assert.match(deployScript, /HERMES_INFERENCE_PROVIDER/);
assert.match(deployScript, /deepseek-v4-pro/);
assert.match(deployScript, /https:\/\/api\.deepseek\.com/);
assert.doesNotMatch(deployScript, /Write-(?:Host|Output|Verbose).*(?:gatewayToken|evaluateToken)/i);
assert.doesNotMatch(deployScript, /MATLAB_GATEWAY_EVALUATE_TOKEN\s*=\s*MATLAB_GATEWAY_TOKEN/i);
assert.doesNotMatch(deployScript, /0\.0\.0\.0.*(?:disable|bypass|auth)/i);
const criticalCheckIndex = deployScript.indexOf("Assert-EnvKeysSingleNonEmpty $ContainerEnvFile");
assert.ok(criticalCheckIndex > 0);
assert.ok(criticalCheckIndex < deployScript.indexOf("$containerValues = Read-EnvFile"));
assert.ok(criticalCheckIndex < deployScript.indexOf("$serviceSnapshot = Get-ServiceSnapshot"));

assert.match(builder, /gitBuffer\(\["show"/);
assert.match(builder, /check-container-secrets\.mjs/);
assert.match(builder, /rootfsInputsChanged:\s*false/);
assert.match(builder, /registryReferencesSource:\s*"previous-approved-container-release-manifest"/);
assert.match(builder, /dependencyChanges:\s*false/);
assert.match(builder, /zip/);
assert.doesNotMatch(builder, /docker/);
assert.doesNotMatch(builder, /buildImage|buildx|docker push/);
assert.match(builder, /native-matlab-gateway-companion-v7-/);
assert.match(builder, /companionVersion:\s*config\.companionVersion/);
assert.match(builder, /validationFiles/);
assert.match(builder, /validationFileCount:\s*validationFiles\.length/);

for (const requiredCase of [
  "PS5.1 CSPRNG path",
  "Equal pre-existing evaluate tokens",
  "missing target",
  "restore the original bytes exactly",
  "deployment failure restores managed files",
  "Container env is the single source",
  "formal env example's C:/ path",
  "ProvisionDirectories creates only",
  "Critical container env keys reject",
  "Invalid provisioning env fails before",
  "Partial-existing and repeated initialization",
  "Forward- and backslash spellings",
  "delayed port",
  "early service exit",
  "timeout exhaustion"
]) {
  assert.ok(ps51Tests.includes(requiredCase), `missing PS5.1 regression: ${requiredCase}`);
}
assert.match(ps51Tests, /Get-EnvKeyCount.*MATLAB_GATEWAY_EVALUATE_TOKEN/s);
assert.match(ps51Tests, /ToBase64String\(\$restoredBytes\).*ToBase64String\(\$originalBytes\)/s);
assert.match(ps51Tests, /return \[ScriptBlock\]::Create/);
assert.match(ps51Tests, /^\.\s+\$functionImport$/m);
assert.match(ps51Tests, /Get-Command -Name \$functionName -CommandType Function/);
assert.match(ps51Tests, /not visible in script scope/);
assert.doesNotMatch(ps51Tests, /Invoke-Expression \$definition\.Extent\.Text/);

assert.match(ps51Workflow, /runs-on:\s*windows-2022/);
assert.match(ps51Workflow, /powershell\.exe -NoProfile -Command/);
assert.match(ps51Workflow, /StartsWith\("5\.1\."\)/);
assert.match(ps51Workflow, /test-native-matlab-gateway-companion-ps51|native-gateway-companion-ps51\.Tests/);
assert.match(ps51Workflow, /native-gateway-windows-wrapper-tests\.mjs/);
assert.match(ps51Workflow, /native-gateway-companion-tests\.mjs/);
assert.match(ps51Workflow, /windows-production-directories-tests\.mjs/);
assert.match(wrapperRegression, /SDG_CONTAINER_DATA_DIR_REQUIRED/);
assert.match(wrapperRegression, /HOST_ROOT_ABSOLUTE_REQUIRED/);
assert.match(wrapperRegression, /MATLAB_GATEWAY_HOST_ROOT_CONFLICT/);
assert.match(wrapperRegression, /C:\/approved\/data/);
assert.match(wrapperRegression, /replaceAll\("\\\\", "\/"\)/);
assert.match(wrapperRegression, /HOST_ROOT_DIRECTORY_REQUIRED/);
assert.match(wrapperRegression, /configuration preflight passed/);
assert.match(wrapperRegression, /SOFTWARE_DOC_WORKER_ENV_FILE/);
assert.match(wrapperRegression, /config\.managedFiles/);

const productionDeploy = read("scripts/container-production.mjs");
const productionDirectories = read("scripts/windows-production-directories.mjs");
assert.match(productionDeploy, /evaluate_matlab_code/);
assert.match(productionDeploy, /MATLAB_GATEWAY_STATE_DIR/);
assert.match(productionDeploy, /_MULTIPLICITY/);
assert.match(productionDeploy, /_EMPTY/);
assert.match(productionDeploy, /prepareApprovedWindowsDirectories/);
assert.match(productionDirectories, /C:\\\\ProgramData\\\\SoftwareDocGenerator/);
assert.match(productionDirectories, /REPARSE_FORBIDDEN/);
assert.match(productionDeploy, /x-sdg-evaluate-token/);
assert.match(productionDeploy, /status!=='succeeded'/);

console.log("Native MATLAB Gateway companion contract tests passed.");
