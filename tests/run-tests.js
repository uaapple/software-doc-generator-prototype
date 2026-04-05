import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../src/config.js";
import { CExtractor } from "../src/services/c-extractor.js";
import { ValidationService } from "../src/services/validation-service.js";
import { LlmService } from "../src/services/llm-service.js";
import { ensureStorage } from "../src/services/storage.js";
import { BenchmarkCaseService } from "../src/services/benchmark-case-service.js";
import { SkillRefinementService } from "../src/services/skill-refinement-service.js";
import { SkillBundleService } from "../src/services/skill-bundle-service.js";

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
    "# 事实抽取 Skill\n\n- 抽取条件、信号、阈值、优先级和边界限制。",
    "utf8"
  );
  await fs.writeFile(
    path.join(tempDir, "skills", "requirement_writing.md"),
    "# 需求写作规范 Skill\n\n- 输出中文软件需求。\n- 优先使用“软件应”句式。",
    "utf8"
  );
  await fs.writeFile(
    path.join(tempDir, "skills", "requirement_validation.md"),
    "# 校验 Skill\n\n- 检查追溯和模糊措辞。",
    "utf8"
  );
  await fs.writeFile(path.join(tempDir, "skills", "examples", "good_examples.md"), "# 正例\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "examples", "bad_examples.md"), "# 反例\n", "utf8");
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
            verificationHint: "通过功能测试验证输入触发与输出响应"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
}

async function writeUploadedFile(baseDir, name, content) {
  await fs.mkdir(baseDir, { recursive: true });
  const filePath = path.join(baseDir, name);
  await fs.writeFile(filePath, content, "utf8");
  const stat = await fs.stat(filePath);
  return {
    originalname: name,
    filename: name,
    path: filePath,
    mimetype: name.endsWith(".c") ? "text/x-c" : "text/plain",
    size: stat.size
  };
}

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
    name: "Validation flags non-canonical signals and unsupported expansions for ISO-aligned policy",
    run: async () => {
      const validator = new ValidationService();
      const conflicts = validator.validate(
        [
          {
            id: "1",
            requirementId: "SWR-001",
            title: "ESC前轴扭矩干预 - 扭矩计算",
            requirementText:
              "当AEB/CDP/ABS/EBD任一功能激活时，ESCWhlTq_tqTarFrntAxle输出为0；当前轴CCO/ISA扭矩请求有效时继续参与计算；输入使用icesc_tqReqFrntAxleDec。",
            sourceRefs: [{ fileName: "golden.md", location: "page:1", excerpt: "example" }]
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

      assert.ok(conflicts.some((item) => item.code === "code-style-signal"));
      assert.ok(conflicts.some((item) => item.code === "non-canonical-signal"));
      assert.ok(conflicts.some((item) => item.code === "unsupported-expansion"));
    }
  },
  {
    name: "LLM service falls back without API key",
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
        assert.ok(requirements[0].requirementText.includes("软件应"));
      });
    }
  },
  {
    name: "Skill refinement supports proposal review, candidate build, archive restore, and approval flow",
    run: async () => {
      await withTempConfig(async (tempDir) => {
        const uploadsDir = path.join(tempDir, "fixtures");
        const caseService = new BenchmarkCaseService();
        const refinementService = new SkillRefinementService();
        const bundleService = new SkillBundleService();

        const systemFile = await writeUploadedFile(
          uploadsDir,
          "system.md",
          `
          # 5.30 扭矩干预功能
          SMiVCU-9978 - 当前轴升扭请求激活时，VCU应对前轴目标扭矩进行计算，优先级顺序为前轴升扭请求 > 前轴降扭请求。
          SMiVCU-4487 - 当AEB激活时，VCU应输出0扭矩并快速响应。
          `,
        );
        const codeFile = await writeUploadedFile(
          uploadsDir,
          "ESCWhlTq.c",
          `
          #define ESCWhlTq_tqESCIntvMin_C -3900
          #define ESCWhlTq_tqESCIntvMax_C 3900
          static void fc_ESCWhlTq(void) {
            if (ESC_TqDecReqAct_F && ESCWhlTq_bTqDecIntvEna_C) {
              ESCWhlTq_tqTarFrntAxle = ESC_TqDecReq_F;
            }
            if (ESC_AEB_Active) {
              ESCWhlTq_tqTarFrntAxle = 0;
            }
          }
          `,
        );
        const goldenFile = await writeUploadedFile(
          uploadsDir,
          "golden.json",
          JSON.stringify(
            {
              title: "软件设计需求示例：ESC前轴扭矩干预",
              section: {
                sectionNumber: "3.31",
                sectionTitle: "扭矩干预功能",
                subsectsions: [],
                subsections: [
                  {
                    sectionNumber: "3.31.1",
                    sectionTitle: "ESC前轴扭矩干预"
                  }
                ]
              },
              requirements: [
                {
                  requirementId: "SMiVCU-10160",
                  topic: "ESC干预前轴激活标志位判断",
                  sectionNumber: "3.31.1",
                  requirementType: "activation_flag_logic",
                  requirementText:
                    "当 ESC_TqDecReqAct_F 激活时，软件应将 ESC 干预前轴激活标志位置为 active。",
                  signals: ["ESC_TqDecReqAct_F", "ESCWhlTq_bTqDecIntvEna_C"],
                  references: [],
                  conditions: ["ESC_TqDecReqAct_F 激活"]
                },
                {
                  requirementId: "SMiVCU-10597",
                  topic: "ESC干预前轴扭矩计算",
                  sectionNumber: "3.31.1",
                  requirementType: "torque_calculation_logic",
                  requirementText:
                    "当 ESC_AEB_Active 激活时，软件应将 ESCWhlTq_tqTarFrntAxle 输出为 0，并保留前轴目标扭矩计算逻辑。",
                  signals: ["ESC_AEB_Active", "ESCWhlTq_tqTarFrntAxle"],
                  references: ["SMiVCU-10160"],
                  conditions: ["ESC_AEB_Active 激活"],
                  priorityOrder: ["前轴升扭请求", "前轴降扭请求"]
                }
              ]
            },
            null,
            2
          ),
        );

        const benchmarkCase = await caseService.createCase(
          {
            name: "Torque Intervention Case",
            domain: "embedded_vcu",
            subdomain: "torque_intervention",
            createdBy: "test"
          },
          {
            systemPdf: [systemFile],
            generatedCode: [codeFile],
            goldenSourceFile: [goldenFile]
          }
        );

        assert.equal(benchmarkCase.goldenStructured.requirements.length, 2);
        await caseService.certifyCase(benchmarkCase.id);

        const run = await refinementService.createRun({ triggerCaseId: benchmarkCase.id });
        assert.equal(run.status, "proposal_review");
        assert.ok((run.proposalItems || []).length > 0);
        assert.ok(run.initialAssessment.scoreResult.overallScore >= 0);

        const firstReviewed = await refinementService.reviewProposalItem(run.id, run.proposalItems[0].id, {
          status: "accepted"
        });
        assert.equal(firstReviewed.status, "accepted");
        const secondReviewed = await refinementService.reviewProposalItem(run.id, run.proposalItems[1].id, {
          status: "edited",
          editedContent: "- 编辑后的抽取规则"
        });
        assert.equal(secondReviewed.status, "edited");
        assert.equal(secondReviewed.editedContent, "- 编辑后的抽取规则");

        const candidateResult = await refinementService.buildCandidate(run.id);
        assert.ok(candidateResult.run.candidateBundleId);
        assert.ok(candidateResult.run.evaluationRunId);
        assert.equal(candidateResult.run.status, "awaiting_decision");

        const evaluation = await refinementService.evaluationService.getEvaluation(candidateResult.run.evaluationRunId);
        assert.ok(evaluation.aggregateScores.overallScoreAvg >= 0);

        const activeBefore = await bundleService.getActiveBundle();
        assert.ok(activeBefore);

        const archived = await caseService.archiveCase(benchmarkCase.id);
        assert.equal(archived.archived, true);
        const restored = await caseService.restoreCase(benchmarkCase.id);
        assert.equal(restored.archived, false);

        const approval = await refinementService.approveRun(candidateResult.run.id);
        assert.equal(approval.run.status, "approved");

        const activeAfter = await bundleService.getActiveBundle();
        assert.equal(activeAfter.id, candidateResult.run.candidateBundleId);
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
