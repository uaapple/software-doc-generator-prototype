import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [syncScript, dependencyInstaller, updateScript, offlineInstaller] = await Promise.all([
  read("scripts/Sync-WindowsWorkerOfficialDependencies.ps1"),
  read("scripts/Install-WindowsWorkerOfficialDependencies.ps1"),
  read("scripts/update-windows-worker-source.ps1"),
  read("offline-installers/hermes/Install-HermesOffline.ps1")
]);

for (const script of [syncScript, dependencyInstaller, updateScript, offlineInstaller]) {
  assert.match(script, /v2026\.7\.7\.2/);
}

assert.match(syncScript, /\[string\]\$HermesVersion = "v2026\.7\.7\.2"/);
assert.match(syncScript, /sys\.version_info\[:2\] == \(3, 11\)/);
assert.match(syncScript, /"pip", "setuptools>=77,<83", "wheel"/);
assert.match(syncScript, /Wheelhouse must not contain setuptools 83|wheelhouse must not contain setuptools 83/i);
assert.match(syncScript, /sourceArchive = \$expectedSelectedArchive/);

assert.match(dependencyInstaller, /-HermesVersion `"\$HermesVersion`"/);
assert.match(dependencyInstaller, /Expected exactly one manifest-selected Hermes source archive/);
assert.match(updateScript, /-HermesVersion `"\$hermesVersion`"/);
assert.match(updateScript, /Expected exactly one manifest-selected Hermes source archive/);

for (const marker of ["runtime/hermes-agent", "runtime/hermes-home", "hermes_cli.main", "run_agent"]) {
  assert.ok(updateScript.includes(marker), `missing residual process marker: ${marker}`);
}
for (const processName of ["python.exe", "pythonw.exe", "hermes.exe", "powershell.exe", "pwsh.exe", "cmd.exe", "bash.exe", "sh.exe"]) {
  assert.ok(updateScript.includes(`"${processName}"`), `missing residual process name: ${processName}`);
}
assert.match(updateScript, /childrenByParent/);
assert.match(updateScript, /Timed out waiting for old worker runtime processes to stop/);
assert.ok(
  updateScript.indexOf("Stop-WorkerRuntimeProcesses -WorkerInstallDir $InstallDir") <
    updateScript.indexOf("Ensure-HermesCommand -Path $envFile"),
  "residual process cleanup must run before Hermes installation"
);
assert.match(updateScript, /SoftwareDocHermesAgent = 3101/);
assert.match(updateScript, /SoftwareDocMatlabWorker = 5100/);
assert.doesNotMatch(updateScript, /8642/);

assert.match(offlineInstaller, /\[string\]\$HermesVersion = "v2026\.7\.7\.2"/);
assert.match(offlineInstaller, /Expected exactly one Hermes \$HermesVersion source archive/);
assert.match(offlineInstaller, /Assert-Python311/);
assert.match(offlineInstaller, /pip install --no-index --find-links \$wheelhouse pip "setuptools>=77,<83" wheel/);
assert.match(offlineInstaller, /Wheelhouse must include setuptools>=77,<83/);
assert.match(offlineInstaller, /Wheelhouse must not contain setuptools 83/);

console.log("Hermes Windows packaging tests passed.");
