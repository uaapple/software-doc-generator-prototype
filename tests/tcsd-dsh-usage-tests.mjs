import assert from "node:assert/strict";
import test from "node:test";

import { TcsdDshStageExecutor } from "../src/services/tcsd-dsh-stage-executor.js";

test("collectSessionUsage：聚合 session.jsonl 中 assistant/message 的 usage", async () => {
  const executor = new TcsdDshStageExecutor({ timeoutMs: 60000 });
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-usage-"));
  try {
    const sessionDir = path.join(root, ".tcsd-dsh");
    await fs.mkdir(sessionDir, { recursive: true });
    const records = [
      { type: "turn/start", time: 1, data: { turn: 1 } },
      { type: "assistant/message", time: 2, data: { turn: 1, step: 1, message: { role: "assistant" }, usage: { inputTokens: 92, outputTokens: 82, cacheReadTokens: 38144, cacheWriteTokens: 0, reasoningTokens: 0 } } },
      { type: "assistant/message", time: 3, data: { turn: 1, step: 2, message: { role: "assistant" }, usage: { inputTokens: 11, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 0, reasoningTokens: 1 } } },
      { type: "turn/end", time: 4, data: { turn: 1, reason: { kind: "completed" } } }
    ].map((record) => JSON.stringify(record)).join("\n") + "\n";
    await fs.writeFile(path.join(sessionDir, "session.jsonl"), records, "utf8");

    const summary = await executor.collectSessionUsage({ input: { outputDir: root } });
    assert.ok(summary, "应解析出 usage 汇总");
    assert.equal(summary.totalTokens, 92 + 82 + 38144 + 11 + 20 + 30);
    assert.equal(summary.details.inputTokens, 103);
    assert.equal(summary.details.outputTokens, 102);
    assert.equal(summary.details.cacheReadTokens, 38174);
    assert.equal(summary.details.reasoningTokens, 1);
    assert.equal(summary.turns, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("collectSessionUsage：events 文件作为回退；无 usage 返回 null", async () => {
  const executor = new TcsdDshStageExecutor({ timeoutMs: 60000 });
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-usage-"));
  try {
    const sessionDir = path.join(root, ".tcsd-dsh");
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, "session.events.jsonl"),
      JSON.stringify({ type: "assistant/message", data: { message: { role: "assistant", content: [] }, usage: { inputTokens: 7, outputTokens: 3, cacheReadTokens: 0 } } }) + "\n",
      "utf8"
    );
    const summary = await executor.collectSessionUsage({ input: { outputDir: root } });
    assert.equal(summary.totalTokens, 10);

    const empty = await executor.collectSessionUsage({ input: { outputDir: "/nonexistent-dir-for-usage-test" } });
    assert.equal(empty, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
