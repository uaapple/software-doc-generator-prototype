import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [hermesApp, hermesClient, updateScript, deployScript, alignmentScript, profiles] = await Promise.all([
  read("src/hermes-app.js"),
  read("src/services/hermes-agent-client.js"),
  read("scripts/update-windows-worker-source.ps1"),
  read("scripts/Deploy-WindowsWorkerSourceUpdate.ps1"),
  read("scripts/Align-PhysicalWorkerProduction.ps1"),
  read("scripts/hermes-llm-profiles.json")
]);

assert.match(hermesApp, /\/internal\/steps\/execute-upload/);
assert.match(hermesClient, /\/internal\/steps\/execute-upload/);
assert.match(hermesClient, /isMultipartApiMode/);
assert.match(updateScript, /SoftwareDocHermesAgent/);
assert.match(updateScript, /SoftwareDocMatlabWorker/);
assert.match(updateScript, /Align-PhysicalWorkerProduction\.ps1/);
assert.ok(updateScript.indexOf("Align-PhysicalWorkerProduction.ps1") < updateScript.indexOf("Install-WindowsWorkerOfficialDependencies.ps1"));
assert.doesNotMatch(updateScript, /Install-HermesOpenApiServer/);
assert.doesNotMatch(updateScript, /SoftwareDocHermesOpenApiServer.*8642/);
assert.doesNotMatch(deployScript, /\/v1\/models/);
assert.doesNotMatch(deployScript, /\/v1\/capabilities/);

assert.match(alignmentScript, /Unregister-ScheduledTask/);
assert.match(alignmentScript, /run-hermes-openai-api-server\.ps1/);
assert.match(alignmentScript, /hermes-api-server\.env/);
assert.match(alignmentScript, /matlab\["args"\] = \[\]/);
assert.match(alignmentScript, /SATK_SIMULINK_ROOT/);

const profileDocument = JSON.parse(profiles);
const terra = profileDocument.profiles.find((profile) => profile.id === "gpt-5-6-terra");
assert.ok(terra);
assert.equal(terra.provider, "custom");
assert.equal(terra.model, "gpt-5.6-terra");
assert.equal(terra.apiKeyEnv, "OPENAI_API_KEY");
assert.equal(terra.apiMode, "codex_responses");
assert.equal(terra.reasoningEffort, "high");

console.log("Physical Worker production parity tests passed.");
