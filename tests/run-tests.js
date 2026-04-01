import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CExtractor } from "../src/services/c-extractor.js";
import { ValidationService } from "../src/services/validation-service.js";
import { LlmService } from "../src/services/llm-service.js";

const tests = [
  {
    name: "C extractor finds functions, conditions, and assignments",
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "req-proto-"));
      const filePath = path.join(tempDir, "model.c");
      await fs.writeFile(
        filePath,
        `
        #define TEMP_LIMIT 95
        static void Controller_step(void) {
          if (temperature > TEMP_LIMIT) {
            faultFlag = 1;
          }
        }
        `,
        "utf8"
      );

      const extractor = new CExtractor();
      const result = await extractor.extract({ absolutePath: filePath });
      assert.ok(result.blocks.some((item) => item.text.includes("TEMP_LIMIT")));
      assert.ok(result.blocks.some((item) => item.text.includes("Controller_step")));
      assert.ok(result.blocks.some((item) => item.text.includes("temperature > TEMP_LIMIT")));
    }
  },
  {
    name: "Validation flags missing source and vague language",
    run: async () => {
      const validator = new ValidationService();
      const conflicts = validator.validate([
        {
          id: "1",
          requirementId: "SWR-001",
          requirementText: "软件应适当处理故障。",
          sourceRefs: []
        }
      ]);

      assert.ok(conflicts.some((item) => item.code === "missing-source"));
      assert.ok(conflicts.some((item) => item.code === "vague-language"));
    }
  },
  {
    name: "LLM service falls back without API key",
    run: async () => {
      const service = new LlmService();
      const requirements = await service.generateRequirements(
        { name: "测试项目", description: "", language: "zh-CN" },
        [
          {
            evidence: [
              {
                fileName: "system.pdf",
                fileRole: "system_pdf",
                location: "page:1",
                excerpt: "系统应在故障发生时输出报警信号。",
                tags: ["diagnostic", "requirement-like"],
                confidence: 0.9
              }
            ]
          }
        ]
      );

      assert.ok(requirements.length >= 1);
      assert.ok(requirements[0].requirementText.includes("软件应"));
    }
  }
];

let failed = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} tests passed.`);
}
