import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const switcherPath = path.join(root, "scripts", "Switch-HermesLlmProfile.ps1");
const runnerPath = path.join(root, "scripts", "run-windows-worker-service.ps1");
const fakeKey = "fake-terra-key-must-stay-secret";
const installDir = await mkdtemp(path.join(os.tmpdir(), "hermes-terra-test-"));
const configDir = path.join(installDir, "config");
const hermesHome = path.join(installDir, "runtime", "hermes-home");
await mkdir(configDir, { recursive: true });
await mkdir(hermesHome, { recursive: true });

await writeFile(
  path.join(hermesHome, "config.yaml"),
  [
    "unrelated:",
    "  preserved: true",
    "custom_providers:",
    "- name: existing-provider",
    "  base_url: https://example.invalid/v1",
    "  key_env: EXISTING_KEY",
    "mcp_servers:",
    "  keep_me:",
    "    command: preserved-command",
    ""
  ].join("\n"),
  "utf8"
);

const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const pythonCommand = process.platform === "win32" ? ["where.exe", ["python.exe"]] : ["which", ["python3"]];
const pythonLookup = spawnSync(pythonCommand[0], pythonCommand[1], { encoding: "utf8" });
assert.equal(pythonLookup.status, 0, "Python is required for the Terra switcher test.");
const python = pythonLookup.stdout.trim().split(/\r?\n/)[0];
const result = spawnSync(
  powershell,
  [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", switcherPath,
    "-Action", "set",
    "-ProfileId", "gpt-5-6-terra",
    "-InstallDir", installDir,
    "-ApiKey", fakeKey,
    "-NoRestart",
    "-NoTest"
  ],
  {
    encoding: "utf8",
    env: { ...process.env, HERMES_PYTHON_EXE: python }
  }
);
assert.equal(result.status, 0, `Switcher failed:\n${result.stdout}\n${result.stderr}`);
assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(fakeKey));

const activeText = await readFile(path.join(configDir, "hermes-llm.active.env"), "utf8");
const secretsText = await readFile(path.join(configDir, "hermes-llm-secrets.env"), "utf8");
assert.doesNotMatch(activeText, new RegExp(fakeKey));
assert.doesNotMatch(activeText, /^OPENAI_API_KEY=/m);
assert.match(activeText, /^HERMES_LLM_API_MODE=codex_responses$/m);
assert.match(activeText, /^HERMES_REASONING_EFFORT=high$/m);
assert.match(activeText, /^HERMES_INFERENCE_PROVIDER=custom:gpt-5-6-terra$/m);
assert.match(secretsText, new RegExp(`^OPENAI_API_KEY=${fakeKey}$`, "m"));

const configText = await readFile(path.join(hermesHome, "config.yaml"), "utf8");
assert.doesNotMatch(configText, new RegExp(fakeKey));
assert.match(configText, /^unrelated:\s*\n\s+preserved: true$/m);
assert.match(configText, /^\s+keep_me:\s*\n\s+command: preserved-command$/m);
assert.match(configText, /^- name: existing-provider$/m);
assert.match(configText, /^- name: gpt-5-6-terra\s*\n\s+base_url: https:\/\/154-17-239-28\.sslip\.io:8443\/v1\s*\n\s+key_env: OPENAI_API_KEY\s*\n\s+api_mode: codex_responses$/m);
assert.match(configText, /^model:\s*\n\s+provider: custom:gpt-5-6-terra\s*\n\s+default: gpt-5\.6-terra\s*\n\s+api_mode: codex_responses$/m);
assert.match(configText, /^delegation:\s*\n\s+provider: custom:gpt-5-6-terra\s*\n\s+model: gpt-5\.6-terra\s*\n\s+api_mode: codex_responses$/m);
assert.match(configText, /^agent:\s*\n\s+reasoning_effort: high$/m);

const runnerText = await readFile(runnerPath, "utf8");
assert.match(runnerText, /Assert-TerraConfiguration/);
assert.match(runnerText, /missing API key environment variable/);
assert.match(runnerText, /must start on port 3101/);
assert.match(await readFile(switcherPath, "utf8"), /\$baseUrl\/responses/);
assert.doesNotMatch(runnerText, /8642/);

console.log("Hermes Terra configuration tests passed.");
