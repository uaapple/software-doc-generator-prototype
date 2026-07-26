import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const [updater, restore, sourceBuilder, fullTarget, sourceTarget] = await Promise.all([
  read("scripts/update-windows-worker-source.ps1"),
  read("scripts/restore-windows-worker-source.ps1"),
  read("scripts/build-windows-worker-source-update.mjs"),
  read("deploy/targets/windows-prod-full.json"),
  read("deploy/targets/windows-prod-source.json")
]);

assert.match(updater, /\$managedPaths = @\([\s\S]*"requirements"/);
assert.match(updater, /software-doc-worker-source-backup\/v1/);
assert.match(updater, /createdAtUtc/);
assert.match(updater, /managedPaths =/);
assert.match(updater, /existed = \[bool\]\$existed/);
assert.match(updater, /sha256 = \(Get-FileHash -Algorithm SHA256/);
assert.match(updater, /Managed source path contains a reparse point/);
assert.match(updater, /Refusing to reuse an existing source backup directory/);
assert.match(updater, /source-backup-manifest\.json/);
assert.match(updater, /\$service\.Status -ne "Stopped"/);
assert.match(updater, /\$task\.State -eq "Running"/);
assert.match(updater, /restore-windows-worker-source\.ps1/);
assert.match(updater, /-BackupDir \$backupDir -ValidateOnly/);
assert.match(updater, /Source update failed; invoking supported rollback/);
assert.ok(
  updater.indexOf("-BackupDir $backupDir -ValidateOnly") <
    updater.indexOf("foreach ($relativePath in $managedPaths)"),
  "backup validation must occur before managed source replacement"
);

for (const protectedPath of [
  ".env",
  "node_modules",
  "runtime",
  "data",
  "addon",
  "software-doc-worker.env"
]) {
  assert.ok(restore.includes(`"${protectedPath}"`), `missing protected rollback root: ${protectedPath}`);
}
assert.match(restore, /\[Parameter\(Mandatory = \$true\)\][\s\S]*\$InstallDir/);
assert.match(restore, /\[Parameter\(Mandatory = \$true\)\][\s\S]*\$BackupDir/);
assert.match(restore, /\[switch\]\$ValidateOnly/);
assert.match(restore, /source-update-\*/);
assert.match(restore, /must be a direct child/);
assert.match(restore, /Assert-NoReparsePoint/);
assert.match(restore, /Assert-PathWithin/);
assert.match(restore, /do not exactly match the supported source updater paths/);
assert.match(restore, /exactly one active service shape/);
assert.match(restore, /Backup hash inventory mismatch/);
assert.match(restore, /if \(\[bool\]\$entry\.existed\)/);
assert.match(restore, /Remove-Item -LiteralPath \$target -Recurse -Force/);
assert.match(restore, /Copy-Item -LiteralPath \$backup -Destination \$target/);
assert.match(restore, /Start-OriginalUnits/);
assert.doesNotMatch(restore, /\$command\.Contains\(\$installNeedle\) -or[\s\S]{0,100}runtime\/hermes-agent/);
assert.match(restore, /3101\/api\/health/);
assert.match(restore, /5100\/health/);

assert.match(sourceBuilder, /"requirements"/);
assert.match(sourceBuilder, /Restore-WindowsWorkerSource\.ps1/);
for (const rawTarget of [fullTarget, sourceTarget]) {
  const target = JSON.parse(rawTarget);
  assert.ok(target.includePaths.includes("requirements/tcsd-runtime.txt"));
  assert.ok(target.includePaths.includes("scripts"));
  assert.ok(!target.includePaths.includes("data"));
}

console.log("Windows source backup and rollback structure tests passed.");
