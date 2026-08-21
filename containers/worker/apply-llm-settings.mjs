#!/usr/bin/env node
/**
 * Apply the production DSH LLM provider defaults for the `deepseek-official`
 * route into `$DSH_HOME/settings.yaml` (the settings-file document DSH loads
 * at boot and hot-reloads; a top-level `llm-deepseek:` section there overrides
 * the adapter entries of the base composition — the same document the web
 * Models page writes).
 *
 * Optional environment variables (defaults are the production tuning):
 *   DSH_LLM_REASONING_EFFORT        off|low|high|max   (default: max)
 *   DSH_LLM_MAX_RETRIES             non-negative int   (default: 5)
 *   DSH_LLM_STREAM_IDLE_TIMEOUT_MS  positive int       (default: 180000)
 *
 * The worker has no web Models page, so settings.yaml on this host is either
 * empty (initialized by dsh-settings-file), written by the operator, or
 * written by this script. The script manages exactly the three keys above
 * inside the `llm-deepseek:` section: the section is replaced wholesale, all
 * other top-level sections and comments are preserved byte-for-byte. No YAML
 * library is required (zero-dependency, testable outside the image).
 *
 * Exit codes: 0 = applied (or no-op), 2 = invalid environment value,
 * 1 = filesystem failure.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const REASONING_EFFORTS = new Set(["off", "low", "high", "max"]);
const DEFAULT_REASONING_EFFORT = "max";
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 180000;

function fail(message, exitCode = 2) {
  process.stderr.write(`apply-llm-settings: ${message}\n`);
  process.exit(exitCode);
}

function parsePositiveInt(value, name) {
  if (!/^\d+$/.test(String(value).trim())) {
    fail(`${name} must be a positive integer, got "${value}"`);
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${name} must be a positive integer, got "${value}"`);
  }
  return parsed;
}

function parseNonNegativeInt(value, name) {
  if (!/^\d+$/.test(String(value).trim())) {
    fail(`${name} must be a non-negative integer, got "${value}"`);
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isSafeInteger(parsed)) {
    fail(`${name} must be a non-negative integer, got "${value}"`);
  }
  return parsed;
}

function resolveValues(environment = process.env) {
  const reasoningEffort = String(environment.DSH_LLM_REASONING_EFFORT || "").trim() || DEFAULT_REASONING_EFFORT;
  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    fail(`DSH_LLM_REASONING_EFFORT must be one of ${[...REASONING_EFFORTS].join("|")}, got "${reasoningEffort}"`);
  }
  const maxRetries = parseNonNegativeInt(
    environment.DSH_LLM_MAX_RETRIES ?? String(DEFAULT_MAX_RETRIES),
    "DSH_LLM_MAX_RETRIES"
  );
  const streamIdleTimeoutMs = parsePositiveInt(
    environment.DSH_LLM_STREAM_IDLE_TIMEOUT_MS ?? String(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    "DSH_LLM_STREAM_IDLE_TIMEOUT_MS"
  );
  return { reasoningEffort, maxRetries, streamIdleTimeoutMs };
}

/** Render the managed `llm-deepseek:` section (fixed shape, no library). */
function renderSection(values) {
  return [
    "llm-deepseek:",
    `  reasoningEffort: ${values.reasoningEffort}`,
    `  streamIdleTimeoutMs: ${values.streamIdleTimeoutMs}`,
    "  retryPolicy:",
    "    mode: normal",
    `    maxRetries: ${values.maxRetries}`
  ].join("\n");
}

/**
 * Replace the top-level `llm-deepseek:` section of an existing document with
 * the managed one. Non-top-level occurrences (e.g. inside another section's
 * nested map) are left untouched.
 */
function replaceTopLevelSection(text, sectionText) {
  const lines = String(text || "").split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || line.startsWith("#") || /^\s/.test(line)) continue;
    if (/^llm-deepseek\s*:(\s*|$)/.test(line)) {
      start = index;
      break;
    }
    // keep scanning: the managed section may sit after other top-level keys
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      end = index;
      break;
    }
  }
  return [...lines.slice(0, start), sectionText, ...lines.slice(end)].join("\n");
}

async function apply(settingsPath, values, environment = process.env) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  let existing = "";
  try {
    existing = await fs.readFile(settingsPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const sectionText = renderSection(values);
  const replaced = replaceTopLevelSection(existing, sectionText);
  const next = replaced === null
    ? `${existing.trimEnd() ? `${existing.replace(/\s+$/, "")}\n\n` : ""}${sectionText}\n`
    : `${replaced.replace(/\s+$/, "")}\n`;
  if (next === existing) {
    return { changed: false, file: settingsPath, values };
  }
  const tempPath = `${settingsPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, next, "utf8");
  try {
    await fs.rename(tempPath, settingsPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await fs.chmod(settingsPath, 0o644).catch(() => {});
  return { changed: true, file: settingsPath, values };
}

async function main() {
  const dshHome = String(process.env.DSH_HOME || "").trim() || "/var/lib/sdg/hermes-home/dsh";
  const settingsPath = path.join(dshHome, "settings.yaml");
  const values = resolveValues(process.env);
  try {
    const result = await apply(settingsPath, values, process.env);
    process.stdout.write(`${JSON.stringify({ ...result, values: undefined, reasoningEffort: values.reasoningEffort, maxRetries: values.maxRetries, streamIdleTimeoutMs: values.streamIdleTimeoutMs })}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
}

await main();
