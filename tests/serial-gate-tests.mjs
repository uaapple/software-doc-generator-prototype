import assert from "node:assert/strict";
import { SerialGate } from "../src/services/serial-gate.js";

async function withTiming(run) {
  const startedAt = Date.now();
  await run();
  return Date.now() - startedAt;
}

{
  const gate = new SerialGate({ concurrency: 1 });
  const trace = [];
  let active = 0;
  let maxActive = 0;
  const tasks = [1, 2, 3].map((id) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    trace.push(`start-${id}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    trace.push(`end-${id}`);
    active -= 1;
    return id;
  });
  const results = await Promise.all(tasks.map((task) => gate.run(task)));
  assert.deepEqual(results, [1, 2, 3]);
  assert.equal(maxActive, 1, "concurrency 1 must never overlap");
  assert.deepEqual(trace, [
    "start-1", "end-1",
    "start-2", "end-2",
    "start-3", "end-3"
  ]);
}

{
  const gate = new SerialGate({ concurrency: 2 });
  let active = 0;
  let maxActive = 0;
  const tasks = [1, 2, 3, 4].map((id) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return id * 10;
  });
  const results = await Promise.all(tasks.map((task) => gate.run(task)));
  assert.deepEqual(results, [10, 20, 30, 40]);
  assert.ok(maxActive <= 2, `concurrency 2 must not exceed 2 (got ${maxActive})`);
}

{
  const gate = new SerialGate({ concurrency: 1 });
  const rejected = gate.run(async () => {
    throw new Error("gate failure");
  });
  await assert.rejects(() => rejected, /gate failure/);
  const recovered = await gate.run(async () => "after-failure");
  assert.equal(recovered, "after-failure");
}

console.log("Serial gate tests passed.");
