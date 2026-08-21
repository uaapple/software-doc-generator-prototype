import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const SCRIPT_PATH = path.join(REPOSITORY_ROOT, "containers", "worker", "apply-llm-settings.mjs");

function runScript(dshHome, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT_PATH],
      {
        env: {
          ...process.env,
          DSH_HOME: dshHome,
          ...env
        }
      },
      (error, stdout, stderr) => resolve({ error, stdout: String(stdout), stderr: String(stderr) })
    );
  });
}

async function readSettings(dshHome) {
  const text = await fs.readFile(path.join(dshHome, "settings.yaml"), "utf8");
  return text.replace(/\s+$/, "");
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "apply-llm-settings-"));

try {
  // 1 — defaults (no DSH_LLM_* overrides): reasoningEffort max, 5 retries,
  // 180s stream idle timeout, file created with the managed section.
  {
    const dshHome = path.join(root, "defaults");
    const result = await runScript(dshHome);
    assert.equal(result.error, null, result.stderr);
    const summary = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.equal(summary.changed, true);
    assert.equal(summary.reasoningEffort, "max");
    assert.equal(summary.maxRetries, 5);
    assert.equal(summary.streamIdleTimeoutMs, 180000);
    const content = await readSettings(dshHome);
    assert.ok(content.includes("llm-deepseek:"), content);
    assert.ok(content.includes("  reasoningEffort: max"), content);
    assert.ok(content.includes("  streamIdleTimeoutMs: 180000"), content);
    assert.ok(content.includes("    mode: normal"), content);
    assert.ok(content.includes("    maxRetries: 5"), content);
  }

  // 2 — explicit environment overrides win.
  {
    const dshHome = path.join(root, "overrides");
    const result = await runScript(dshHome, {
      DSH_LLM_REASONING_EFFORT: "high",
      DSH_LLM_MAX_RETRIES: "3",
      DSH_LLM_STREAM_IDLE_TIMEOUT_MS: "90000"
    });
    assert.equal(result.error, null, result.stderr);
    const summary = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.deepEqual(
      { reasoningEffort: summary.reasoningEffort, maxRetries: summary.maxRetries, streamIdleTimeoutMs: summary.streamIdleTimeoutMs },
      { reasoningEffort: "high", maxRetries: 3, streamIdleTimeoutMs: 90000 }
    );
    const content = await readSettings(dshHome);
    assert.ok(content.includes("  reasoningEffort: high"), content);
    assert.ok(content.includes("  streamIdleTimeoutMs: 90000"), content);
    assert.ok(content.includes("    maxRetries: 3"), content);
  }

  // 3 — existing document: unrelated sections and comments survive; a stale
  // llm-deepseek section is replaced; a missing one is appended.
  {
    const dshHome = path.join(root, "merge");
    await fs.mkdir(dshHome, { recursive: true });
    await fs.writeFile(
      path.join(dshHome, "settings.yaml"),
      [
        "# operator comment must survive",
        "llm-pi-ai:",
        "  baseURL: https://example.invalid",
        "llm-deepseek:",
        "  reasoningEffort: low",
        "  baseURL: https://old.invalid",
        "  retryPolicy:",
        "    maxRetries: 1",
        ""
      ].join("\n"),
      "utf8"
    );
    const result = await runScript(dshHome);
    assert.equal(result.error, null, result.stderr);
    const content = await readSettings(dshHome);
    assert.ok(content.includes("# operator comment must survive"), content);
    assert.ok(content.includes("llm-pi-ai:"), content);
    assert.ok(content.includes("  baseURL: https://example.invalid"), content);
    assert.ok(!content.includes("https://old.invalid"), content);
    assert.ok(content.includes("  reasoningEffort: max"), content);
    assert.ok(content.includes("    maxRetries: 5"), content);
    assert.ok(!content.includes("    maxRetries: 1"), content);
  }

  {
    const dshHome = path.join(root, "append");
    await fs.mkdir(dshHome, { recursive: true });
    await fs.writeFile(
      path.join(dshHome, "settings.yaml"),
      ["llm-pi-ai:", "  baseURL: https://example.invalid", ""].join("\n"),
      "utf8"
    );
    const result = await runScript(dshHome);
    assert.equal(result.error, null, result.stderr);
    const content = await readSettings(dshHome);
    assert.ok(content.includes("llm-pi-ai:"), content);
    assert.ok(content.includes("llm-deepseek:"), content);
    assert.ok(content.includes("  reasoningEffort: max"), content);
    // appended section must come after the unrelated section
    assert.ok(content.indexOf("llm-pi-ai:") < content.indexOf("llm-deepseek:"), content);
  }

  // 4 — idempotent: a second run with the same inputs changes nothing.
  {
    const dshHome = path.join(root, "idempotent");
    const first = await runScript(dshHome);
    assert.equal(first.error, null, first.stderr);
    const second = await runScript(dshHome);
    assert.equal(second.error, null, second.stderr);
    assert.equal(JSON.parse(second.stdout.trim().split("\n").at(-1)).changed, false);
    assert.equal(
      await readSettings(dshHome),
      await readSettings(path.join(root, "idempotent"))
    );
  }

  // 5 — invalid values fail loudly with a non-zero exit.
  {
    const dshHome = path.join(root, "invalid");
    const badEffort = await runScript(dshHome, { DSH_LLM_REASONING_EFFORT: "extreme" });
    assert.ok(badEffort.error, "invalid reasoning effort must fail");
    assert.ok(badEffort.stderr.includes("DSH_LLM_REASONING_EFFORT"), badEffort.stderr);
    const badRetries = await runScript(dshHome, { DSH_LLM_MAX_RETRIES: "-1" });
    assert.ok(badRetries.error, "negative maxRetries must fail");
    assert.ok(badRetries.stderr.includes("DSH_LLM_MAX_RETRIES"), badRetries.stderr);
    const badIdle = await runScript(dshHome, { DSH_LLM_STREAM_IDLE_TIMEOUT_MS: "0" });
    assert.ok(badIdle.error, "zero stream idle timeout must fail");
    assert.ok(badIdle.stderr.includes("DSH_LLM_STREAM_IDLE_TIMEOUT_MS"), badIdle.stderr);
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Worker DSH LLM settings injection tests passed.");
