import assert from "node:assert/strict";
import test from "node:test";

import { displayTaskTitle, usageFrom } from "../src/services/task-statistics-service.js";

test("usageFrom：明细字段优先聚合", () => {
  const usage = usageFrom({
    pipeline: {
      stages: [
        { index: 1, checkpoint: { agent: { tokenUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1, reasoningTokens: 2 } } } },
        { index: 2, checkpoint: { agent: { tokenUsage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 7, cacheWriteTokens: 2, reasoningTokens: 0 } } } }
      ]
    }
  });
  assert.ok(usage);
  assert.equal(usage.inputTokens, 30);
  assert.equal(usage.outputTokens, 15);
  assert.equal(usage.cacheReadTokens, 10);
  assert.equal(usage.cacheWriteTokens, 3);
  assert.equal(usage.totalTokens, 58);
  assert.ok(usage.estimatedCostCny > 0);
});

test("usageFrom：平台聚合口径（只有 totalTokens）也能计入", () => {
  const usage = usageFrom({
    pipeline: {
      stages: [
        { index: 1, checkpoint: { agent: { tokenUsage: { totalTokens: 5000 } } } },
        { index: 2, checkpoint: { agent: { tokenUsage: { totalTokens: 3000 } } } }
      ]
    }
  });
  assert.ok(usage);
  assert.equal(usage.totalTokens, 8000);
});

test("usageFrom：全是 0 或无数据返回 null（不再显示为 0）", () => {
  assert.equal(usageFrom({ pipeline: { stages: [{ checkpoint: { agent: { tokenUsage: { totalTokens: 0 } } } }] } }), null);
  assert.equal(usageFrom({ pipeline: { stages: [] } }), null);
  assert.equal(usageFrom({}), null);
});

test("标题：自定义标题保持不变；默认标题被替换为 模型名+类型", () => {
  assert.equal(displayTaskTitle({ title: "自定义任务标题", statisticsType: "unit_test", inputs: { modelSlx: { originalName: "example.slx" } } }), "自定义任务标题");
  assert.equal(
    displayTaskTitle({ title: "单元测试用例生成", statisticsType: "unit_test", inputs: { modelSlx: { originalName: "EngStrtStop_A09_B02_C02.slx" } } }),
    "EngStrtStop_A09_B02_C02 单元测试用例"
  );
  assert.equal(displayTaskTitle({ title: "", statisticsType: "unit_test", inputs: { modelSlx: { originalName: "example.slx" } } }), "example 单元测试用例");
  assert.equal(displayTaskTitle({ title: "软件详设生成", statisticsType: "software_detail", inputs: { modelSlx: { originalName: "example.slx" } } }), "example 软件详设");
  assert.equal(displayTaskTitle({ title: "", statisticsType: "unit_test", inputs: {} }), "任务");
});
