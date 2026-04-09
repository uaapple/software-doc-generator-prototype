import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../src/config.js";
import { CExtractor } from "../src/services/c-extractor.js";
import { ValidationService } from "../src/services/validation-service.js";
import { LlmService } from "../src/services/llm-service.js";
import { ensureStorage } from "../src/services/storage.js";
import { SkillBundleService } from "../src/services/skill-bundle-service.js";
import { LlmProfileService } from "../src/services/llm-profile-service.js";

async function withTempConfig(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-refinement-"));
  const originalConfig = {
    ...config,
    openai: { ...config.openai }
  };

  Object.assign(config, {
    rootDir: tempDir,
    publicDir: path.join(tempDir, "public"),
    legacySkillDir: path.join(tempDir, "skills"),
    activeSkillDir: path.join(tempDir, "skills", "active"),
    skillBundleDir: path.join(tempDir, "skills", "bundles"),
    dataDir: path.join(tempDir, "data"),
    projectStoreDir: path.join(tempDir, "data", "projects"),
    uploadDir: path.join(tempDir, "data", "uploads"),
    llmProfileStorePath: path.join(tempDir, "data", "llm-profiles.json"),
    skillRefinementDir: path.join(tempDir, "data", "skill-refinement"),
    skillRefinementCaseDir: path.join(tempDir, "data", "skill-refinement", "cases"),
    skillRefinementRunDir: path.join(tempDir, "data", "skill-refinement", "runs"),
    skillRefinementEvaluationDir: path.join(tempDir, "data", "skill-refinement", "evaluations"),
    skillRefinementAuditDir: path.join(tempDir, "data", "skill-refinement", "audit"),
    skillRefinementBundleMetaDir: path.join(tempDir, "data", "skill-refinement", "bundles"),
    skillRefinementUploadDir: path.join(tempDir, "data", "skill-refinement", "uploads"),
    activeSkillBundlePointerPath: path.join(tempDir, "data", "skill-refinement", "active-bundle.json"),
    templatePath: path.join(tempDir, "templates", "software-requirement-template.json"),
    skillDir: path.join(tempDir, "skills", "active")
  });
  config.openai.apiKey = "";
  config.openai.baseURL = undefined;
  config.openai.model = "gpt-4.1-mini";

  try {
    await seedFixtureFiles(tempDir);
    await ensureStorage();
    return await run(tempDir);
  } finally {
    Object.assign(config, originalConfig);
    config.openai.apiKey = originalConfig.openai.apiKey;
    config.openai.baseURL = originalConfig.openai.baseURL;
    config.openai.model = originalConfig.openai.model;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function seedFixtureFiles(tempDir) {
  await fs.mkdir(path.join(tempDir, "skills", "examples"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "templates"), { recursive: true });

  await fs.writeFile(
    path.join(tempDir, "skills", "requirement_extraction.md"),
    "# 事实抽取 Skill\n\n- 提取条件、信号、阈值、优先级和边界。\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(tempDir, "skills", "requirement_writing.md"),
    "# 需求写作 Skill\n\n- 输出中文软件需求。\n- 优先使用“软件应”句式。\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(tempDir, "skills", "requirement_validation.md"),
    "# 校验 Skill\n\n- 检查来源、模糊措辞和冲突项。\n",
    "utf8"
  );
  await fs.writeFile(path.join(tempDir, "skills", "examples", "good_examples.md"), "# 正例\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "examples", "bad_examples.md"), "# 反例\n", "utf8");
  await fs.writeFile(
    path.join(tempDir, "skills", "domain-knowledge.json"),
    JSON.stringify(
      {
        version: 2,
        documentBlueprint: {
          domain: "embedded_vcu",
          subdomain: "torque_intervention"
        },
        examples: [
          {
            requirementId: "SMiVCU-10160",
            topic: "ESC 前轴扭矩干预激活",
            requirementType: "activation_flag_logic",
            requirementText: "软件应根据 ESC 前轴降扭请求激活前轴扭矩干预标志位。",
            signals: ["ESC_TqDecReqAct_F"],
            keywords: ["前轴", "激活", "扭矩干预"]
          }
        ],
        ruleHints: [
          {
            domain: "embedded_vcu",
            subdomain: "torque_intervention",
            sectionHints: ["扭矩干预功能", "ESC 前轴扭矩干预", "ESC 后轴扭矩干预"]
          }
        ],
        antiPatterns: ["不要将前轴和后轴需求合并成一条泛化描述。"]
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(
    config.templatePath,
    JSON.stringify(
      {
        name: "default-template",
        language: "zh-CN",
        requirementIdPrefix: "SWR",
        sections: [
          {
            title: "功能需求",
            type: "functional",
            maxItems: 4,
            verificationHint: "通过功能测试验证输入触发与输出响应。"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
}

const tests = [
  {
    name: "C extractor finds macros, functions, conditions, and assignments",
    run: async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "req-proto-"));
      try {
        const filePath = path.join(tempDir, "model.c");
        await fs.writeFile(
          filePath,
          [
            "#define TEMP_LIMIT 95",
            "static void Controller_step(void) {",
            "  if (temperature > TEMP_LIMIT) {",
            "    faultFlag = 1;",
            "  }",
            "}"
          ].join("\n"),
          "utf8"
        );

        const extractor = new CExtractor();
        const result = await extractor.extract({ absolutePath: filePath });
        assert.ok(result.blocks.some((item) => item.text.includes("TEMP_LIMIT")));
        assert.ok(result.blocks.some((item) => item.text.includes("Controller_step")));
        assert.ok(result.blocks.some((item) => item.text.includes("temperature > TEMP_LIMIT")));
        assert.ok(result.blocks.some((item) => item.text.includes("faultFlag")));
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: "Validation flags missing source and policy violations",
    run: async () => {
      const validator = new ValidationService();
      const conflicts = validator.validate(
        [
          {
            id: "1",
            requirementId: "SWR-001",
            title: "ESC 前轴扭矩干预 - 扭矩计算",
            requirementText:
              "当 AEB/CDP/ABS/EBD 任一功能激活时，ESCWhlTq_tqTarFrntAxle 输出为 0；当前轴 CCO/ISA 扭矩请求有效时继续参与计算；输入使用 icesc_tqReqFrntAxleDec。",
            sourceRefs: []
          }
        ],
        {
          domainKnowledge: {
            sourceOfTruthPolicy: {
              codeStylePrefixes: ["icesc_"],
              canonicalSignalAliases: [
                {
                  canonical: "ESC_TqDecReq_F",
                  aliases: ["icesc_tqReqFrntAxleDec"]
                }
              ],
              forbiddenExpansions: {
                torque_calculation_logic: ["ABS", "EBD", "CCO", "ISA"]
              }
            }
          }
        }
      );

      assert.ok(conflicts.some((item) => item.code === "missing-source"));
      assert.ok(conflicts.some((item) => item.code === "code-style-signal"));
      assert.ok(conflicts.some((item) => item.code === "non-canonical-signal"));
      assert.ok(conflicts.some((item) => item.code === "unsupported-expansion"));
    }
  },
  {
    name: "LLM profile service saves provider-specific model configs",
    run: async () => {
      await withTempConfig(async () => {
        const service = new LlmProfileService();
        await service.ensureInitialized();
        const profile = await service.addProfile({
          provider: "doubao",
          name: "豆包测试",
          model: "doubao-seed-1-6",
          apiKey: "test-key",
          baseURL: "https://ark.cn-beijing.volces.com/api/v3"
        });

        assert.equal(profile.provider, "doubao");
        assert.equal(profile.name, "豆包测试");

        const meta = await service.getMeta();
        assert.ok(meta.profiles.some((item) => item.name === "豆包测试"));
        assert.ok(meta.providers.some((item) => item.id === "openai"));
        assert.ok(meta.providers.some((item) => item.id === "doubao"));
      });
    }
  },
  {
    name: "LLM profile service updates and deletes saved configs",
    run: async () => {
      await withTempConfig(async () => {
        const service = new LlmProfileService();
        const profile = await service.addProfile({
          provider: "openai",
          name: "OpenAI 测试",
          model: "gpt-4.1-mini",
          apiKey: "old-key-12345",
          baseURL: "https://api.openai.com/v1"
        });

        const updated = await service.updateProfile(profile.id, {
          provider: "doubao",
          name: "豆包已更新",
          model: "doubao-seed-2-0-pro-260215",
          apiKey: "",
          baseURL: "https://ark.cn-beijing.volces.com/api/v3"
        });

        assert.equal(updated.provider, "doubao");
        assert.equal(updated.name, "豆包已更新");
        assert.equal(updated.apiKeyMasked, "old***2345");

        const removal = await service.deleteProfile(profile.id);
        assert.equal(removal.removedProfileId, profile.id);
        assert.ok(!removal.meta.profiles.some((item) => item.id === profile.id));
      });
    }
  },
  {
    name: "LLM service falls back to local requirement generation without API key",
    run: async () => {
      await withTempConfig(async () => {
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
        assert.ok(requirements[0].requirementId.startsWith("SMiVCU-") || requirements[0].requirementId.startsWith("SWR-"));
        assert.ok(Array.isArray(requirements[0].sourceRefs));
      });
    }
  },
  {
    name: "Skill bundle initialization preserves and restores domain knowledge",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();

        const legacyPath = path.join(config.legacySkillDir, "domain-knowledge.json");
        const activePath = path.join(config.activeSkillDir, "domain-knowledge.json");
        const bundlePath = path.join(config.skillBundleDir, "bundle-base", "domain-knowledge.json");
        const legacyKnowledge = JSON.parse(await fs.readFile(legacyPath, "utf8"));

        assert.deepEqual(JSON.parse(await fs.readFile(activePath, "utf8")), legacyKnowledge);
        assert.deepEqual(JSON.parse(await fs.readFile(bundlePath, "utf8")), legacyKnowledge);

        const emptyKnowledge = {
          version: 1,
          examples: [],
          ruleHints: [],
          antiPatterns: []
        };
        await fs.writeFile(activePath, JSON.stringify(emptyKnowledge, null, 2), "utf8");
        await fs.writeFile(bundlePath, JSON.stringify(emptyKnowledge, null, 2), "utf8");

        await bundleService.ensureInitialized();

        assert.deepEqual(JSON.parse(await fs.readFile(activePath, "utf8")), legacyKnowledge);
        assert.deepEqual(JSON.parse(await fs.readFile(bundlePath, "utf8")), legacyKnowledge);
      });
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
