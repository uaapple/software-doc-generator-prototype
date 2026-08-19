import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

/**
 * TCSD headless direct-driver runner.
 *
 * Drop-in replacement for the stock `@deepseek-ai/dsh-headless` plugin entry
 * (installed at lib/index.js inside the package). It keeps the stock contract
 * exactly: `name`/`inject`/`Config`/`apply`/`internals` exports, synchronous
 * apply, background async run, final text on stdout, exit code by turn-end
 * reason, `ctx.appExit` required. On top of the stock behavior it mounts the
 * session's agent preset and persists the structured session events JSONL
 * (same shape as the DSH desktop export) to $TCSD_DSH_SESSION_LOG or
 * $TCSD_OUTPUT_DIR/.tcsd-dsh/session.jsonl, which the platform serves for
 * per-task session-log export.
 *
 * The composition patch cannot swap a row's implementation (same id with a
 * different `name` is rejected by patch semantics), so this file replaces the
 * stock runner at the file level in the worker image. The row keeps its id
 * `headless-runner` and name `@deepseek-ai/dsh-headless`, so the loader's
 * app-entry resolution is untouched.
 */

/** Stable Cordis plugin name — must match the row this file is mounted under. */
export const name = "headless-runner";
/** Core services required before the one-shot turn can start. */
export const inject = ["agentDefaultModel", "agents", "sessions"];
export const Config = z.object({ task: z.string().required() });

/** The process streams the runner writes to; tests substitute captures. */
export const internals = {
  stdout: process.stdout,
  stderr: process.stderr
};

/** Aggregate the last assistant text and turn outcome in one owned interval. */
function summarize(events, firstSeq) {
  let text = "";
  let reason;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "message/assistant") {
      for (const block of event.data.content || []) if (block.type === "text") text += block.text;
    }
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, reason };
}

/** Report an unexpected direct-driver failure and request a failing exit. */
function fail(io, error) {
  io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
  io.exit(1);
}

function dumpSessionLog(events, firstSeq) {
  // Persist the structured session events (same JSONL shape as the DSH
  // desktop export) so the platform can offer per-task session-log export
  // for quality analysis. Path: $TCSD_DSH_SESSION_LOG, else
  // $TCSD_OUTPUT_DIR/.tcsd-dsh/session.jsonl. No-op when neither is set.
  const explicit = process.env.TCSD_DSH_SESSION_LOG;
  const outputDir = process.env.TCSD_OUTPUT_DIR || "";
  const logPath = explicit || (outputDir ? path.join(outputDir, ".tcsd-dsh", "session.jsonl") : "");
  if (!logPath) return;
  const lines = [];
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    // Raw streaming deltas dominate the size (438k chunk events ≈ 69MB for
    // one task); the final content is fully carried by assistant/message.
    // Skip them so the persisted log stays comparable to the DSH desktop
    // export (a few MB of semantic events).
    if (event.type === "assistant/chunk") continue;
    lines.push(JSON.stringify(event));
  }
  if (!lines.length) return;
  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    writeFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");
  } catch (error) {
    process.stderr.write(`dsh: failed to persist session log: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/**
 * Live event streamer: poll the session events array and append every new
 * semantic event to $TCSD_OUTPUT_DIR/.tcsd-dsh/session.events.jsonl so the
 * platform can observe the agent's real-time activity (tool calls, model
 * turns, steps) without waiting for session exit. assistant/chunk raw deltas
 * are skipped. Returns a disposer.
 */
function startLiveEventStream(events, firstSeq, outputDir) {
  if (!outputDir) return () => {};
  const logPath = path.join(outputDir, ".tcsd-dsh", "session.events.jsonl");
  let lastSeq = firstSeq;
  let timer = null;
  let stream = null;
  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    const fd = openSync(logPath, "a");
    stream = { fd, write(text) { writeSync(fd, text); } };
  } catch (error) {
    process.stderr.write(`dsh: failed to open live event stream: ${error instanceof Error ? error.message : String(error)}\n`);
    return () => {};
  }
  const flush = () => {
    try {
      const snapshot = Array.isArray(events) ? events : [];
      for (let index = 0; index < snapshot.length; index += 1) {
        const event = snapshot[index];
        if (!event || event.seq < lastSeq) continue;
        lastSeq = event.seq + 1;
        if (event.type === "assistant/chunk") continue;
        stream.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      process.stderr.write(`dsh: live event stream failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };
  flush();
  timer = setInterval(flush, 2000);
  timer.unref?.();
  return () => {
    if (timer) clearInterval(timer);
    try { closeSync(stream.fd); } catch {}
  };
}

/**
 * Run one task through a freshly created Agent and request process exit.
 * Mirrors the stock runner: loader await happens inside this background run,
 * never in apply, so the tree reaches ready immediately.
 */
async function run(ctx, task, io) {
  const step = (msg) => io.stderr.write(`[tcsd-runner] ${msg}\n`);
  step("apply start");
  await ctx.get("loader")?.await();
  step("loader done");
  const agents = ctx.get("agents");
  const defaultModel = ctx.get("agentDefaultModel");
  const sessions = ctx.get("sessions");
  const presets = ctx.get("agentPresets");
  if (agents === void 0 || defaultModel === void 0 || sessions === void 0 || presets === void 0) {
    throw new Error("TCSD headless DSH profile is missing its agent preset services");
  }
  const selection = defaultModel.currentSelection();
  step("selection: " + JSON.stringify(selection ? { provider: selection.provider, model: selection.model } : null));
  const { agent } = await agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: async (agentCtx) => {
      installModelSelection(agentCtx, { current: selection, assembled: void 0 });
      await presets.mount(agentCtx);
    }
  });
  step("agent created, waiting idle");
  await agent.whenIdle();
  const firstSeq = agent.session.seq;
  agent.followup(createUserMessage({
    content: [{ type: "text", text: task }],
    source: { kind: "user" }
  }));
  step("task followup sent, waiting idle");
  const disposeLive = startLiveEventStream(agent.session.events, firstSeq, process.env.TCSD_OUTPUT_DIR || "");
  try {
    await agent.whenIdle();
  } finally {
    disposeLive();
  }
  step("idle done, flushing session");
  await sessions.flush(agent.session);
  const outcome = summarize(agent.session.events, firstSeq);
  step("session flushed, outcome reason: " + (outcome.reason?.kind || "none"));
  dumpSessionLog(agent.session.events, firstSeq);
  io.stdout.write(`${outcome.text}\n`);
  if (outcome.reason?.kind === "error") io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`);
  io.exit(outcome.reason?.kind === "completed" ? 0 : 1);
}

/**
 * Mount the one-shot direct driver (synchronous, like the stock runner):
 * the tree becomes ready immediately and the async work continues in the
 * background until it requests process exit.
 */
export function apply(ctx, config) {
  const exit = ctx.get("appExit");
  if (exit === void 0) throw new Error("headless-runner: the launcher must provide ctx.appExit before the tree mounts");
  const io = {
    stdout: internals.stdout,
    stderr: internals.stderr,
    exit
  };
  run(ctx, config.task, io).catch((error) => {
    fail(io, error);
  });
}
