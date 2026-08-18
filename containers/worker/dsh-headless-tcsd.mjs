import { randomUUID } from "node:crypto";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { z } from "zod";

export const name = "@deepseek-ai/dsh-headless-tcsd";
export const inject = ["agents", "agentDefaultModel", "sessions", "headlessStartup", "appExit"];
export const Config = z.object({ task: z.string() });

function summarize(events, firstSeq) {
  let text = "";
  let reason;
  for (const event of events) {
    if (event.sequence <= firstSeq) continue;
    if (event.type === "message/assistant") {
      for (const block of event.data.content || []) if (block.type === "text") text += block.text;
    }
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, reason };
}

export async function apply(ctx, config) {
  const io = { stdout: process.stdout, stderr: process.stderr, exit: ctx.get("appExit") };
  try {
    await ctx.get("loader")?.await();
    const agents = ctx.get("agents");
    const defaultModel = ctx.get("agentDefaultModel");
    const sessions = ctx.get("sessions");
    const presets = ctx.get("agentPresets");
    if (!agents || !defaultModel || !sessions || !presets) throw new Error("TCSD headless DSH profile is missing its agent preset services");
    const selection = defaultModel.currentSelection();
    const { agent } = await agents.create({
      sessionId: SessionId(`session-${randomUUID()}`),
      meta: { cwd: process.cwd() },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: async (agentCtx) => {
        await presets.mount(agentCtx);
      }
    });
    await agent.whenIdle();
    const firstSeq = agent.session.seq;
    agent.followup(createUserMessage({
      content: [{ type: "text", text: config.task }],
      source: { kind: "user" }
    }));
    await agent.whenIdle();
    await sessions.flush(agent.session);
    const outcome = summarize(agent.session.events, firstSeq);
    io.stdout.write(`${outcome.text}\n`);
    if (outcome.reason?.kind === "error") io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`);
    io.exit(outcome.reason?.kind === "completed" ? 0 : 1);
  } catch (error) {
    io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
    io.exit(1);
  }
}
