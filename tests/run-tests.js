import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../src/config.js";
import { CExtractor } from "../src/services/c-extractor.js";
import { ValidationService } from "../src/services/validation-service.js";
import { LlmService } from "../src/services/llm-service.js";
import { SkillLoader } from "../src/services/skill-loader.js";
import { TemplateService } from "../src/services/template-service.js";
import { ensureStorage } from "../src/services/storage.js";
import { SkillBundleService } from "../src/services/skill-bundle-service.js";
import { LlmProfileService } from "../src/services/llm-profile-service.js";
import { ProjectService } from "../src/services/project-service.js";
import { RejectionService } from "../src/services/rejection-service.js";
import { ReplayTaskService } from "../src/services/replay-task-service.js";
import { SkillRuleService } from "../src/services/skill-rule-service.js";
import { PipelineService } from "../src/services/pipeline-service.js";
import { ModuleSkillService } from "../src/services/module-skill-service.js";
import { SkillManagementService } from "../src/services/skill-management-service.js";
import { SkillDatabaseService } from "../src/services/skill-database-service.js";

class FakeModuleSkillBootstrapLlmService {
  constructor(result) {
    this.result = result;
  }

  async synthesizeKnowledge() {
    return this.result;
  }
}

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
    skillDatabasePath: path.join(tempDir, "data", "skills.sqlite"),
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
    skillRuleDir: path.join(tempDir, "data", "skill-rules"),
    skillRuleChangeLogPath: path.join(tempDir, "data", "skill-rules", "change-log.json"),
    rejectionStoreDir: path.join(tempDir, "data", "rejections"),
    rejectionGroupStorePath: path.join(tempDir, "data", "rejections", "groups.json"),
    replayTaskStoreDir: path.join(tempDir, "data", "replay-tasks"),
    templateDir: path.join(tempDir, "templates"),
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
    SkillDatabaseService.closeAll();
    Object.assign(config, originalConfig);
    config.openai.apiKey = originalConfig.openai.apiKey;
    config.openai.baseURL = originalConfig.openai.baseURL;
    config.openai.model = originalConfig.openai.model;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function seedFixtureFiles(tempDir) {
  await fs.mkdir(path.join(tempDir, "skills", "examples"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "skills", "active", "profiles", "generic"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "skills", "active", "profiles", "doc-types", "detail_design"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "skills", "active", "profiles", "doc-types", "hil_test_case"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "skills", "active", "profiles", "domains", "embedded_vcu"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "skills", "active", "profiles", "modules", "charging_management"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "templates"), { recursive: true });

  const genericKnowledge = {
    version: 1,
    examples: [],
    ruleHints: [{ domain: "embedded_vcu", sectionHints: ["??", "??", "??"] }],
    antiPatterns: []
  };

  await fs.writeFile(path.join(tempDir, "skills", "requirement_extraction.md"), "# ????\n\n- ?????????????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "requirement_writing.md"), "# ????\n\n- ???????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "requirement_validation.md"), "# ????\n\n- ?????????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "examples", "good_examples.md"), "# ??\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "examples", "bad_examples.md"), "# ??\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "domain-knowledge.json"), JSON.stringify(genericKnowledge, null, 2), "utf8");

  await fs.writeFile(path.join(tempDir, "skills", "active", "requirement_extraction.md"), "# ????\n\n- ?????????????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "requirement_writing.md"), "# ????\n\n- ???????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "requirement_validation.md"), "# ????\n\n- ?????????????\n", "utf8");
  await fs.mkdir(path.join(tempDir, "skills", "active", "examples"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "skills", "active", "examples", "good_examples.md"), "# ??\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "examples", "bad_examples.md"), "# ??\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "generic", "domain-knowledge.json"), JSON.stringify(genericKnowledge, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "domains", "embedded_vcu", "domain-knowledge.json"), JSON.stringify({ version: 1, ruleHints: [{ domain: "embedded_vcu", sectionHints: ["VCU"] }], examples: [], antiPatterns: [] }, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "doc-types", "detail_design", "requirement_writing.md"), "# ??????\n\n- ?????????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "doc-types", "detail_design", "requirement_validation.md"), "# ??????\n\n- ??????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "doc-types", "detail_design", "domain-knowledge.json"), JSON.stringify({ version: 1, examples: [], ruleHints: [{ documentType: "detail_design" }], antiPatterns: [] }, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "doc-types", "hil_test_case", "requirement_writing.md"), "# HIL ??\n\n- ??????????????????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "doc-types", "hil_test_case", "requirement_validation.md"), "# HIL ??\n\n- ?????????????\n", "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "doc-types", "hil_test_case", "domain-knowledge.json"), JSON.stringify({ version: 1, examples: [], ruleHints: [{ documentType: "hil_test_case" }], antiPatterns: [] }, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "profiles", "modules", "charging_management", "domain-knowledge.json"), JSON.stringify({ version: 1, examples: [{ requirementId: "REQ-1", topic: "????SOC", requirementText: "???????SOC??????????", keywords: ["??SOC", "??"], signals: ["ICM_Chg_SOC_LimitPointSet"] }], ruleHints: [], antiPatterns: [] }, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "skills", "active", "skill-manifest.json"), JSON.stringify({ version: 1, resolutionOrder: ["generic", "docType", "domain", "module"], profiles: { generic: { files: { "requirement_extraction.md": ["requirement_extraction.md"], "requirement_writing.md": ["requirement_writing.md"], "requirement_validation.md": ["requirement_validation.md"], "examples/good_examples.md": ["examples/good_examples.md"], "examples/bad_examples.md": ["examples/bad_examples.md"], "domain-knowledge.json": ["profiles/generic/domain-knowledge.json"] } }, docTypes: { software_requirement: { files: {} }, detail_design: { files: { "requirement_writing.md": ["profiles/doc-types/detail_design/requirement_writing.md"], "requirement_validation.md": ["profiles/doc-types/detail_design/requirement_validation.md"], "domain-knowledge.json": ["profiles/doc-types/detail_design/domain-knowledge.json"] } }, hil_test_case: { files: { "requirement_writing.md": ["profiles/doc-types/hil_test_case/requirement_writing.md"], "requirement_validation.md": ["profiles/doc-types/hil_test_case/requirement_validation.md"], "domain-knowledge.json": ["profiles/doc-types/hil_test_case/domain-knowledge.json"] } } }, domains: { embedded_vcu: { files: { "domain-knowledge.json": ["profiles/domains/embedded_vcu/domain-knowledge.json"] } } }, modules: { charging_management: { files: { "domain-knowledge.json": ["profiles/modules/charging_management/domain-knowledge.json"] } } } } }, null, 2), "utf8");

  await fs.writeFile(path.join(tempDir, "templates", "software-requirement-template.json"), JSON.stringify({ name: "default-template", language: "zh-CN", requirementIdPrefix: "SWR", sections: [{ title: "????", type: "functional", maxItems: 4, verificationHint: "??????????????????" }] }, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "templates", "detail-design-template.json"), JSON.stringify({ name: "detail-design-template", language: "zh-CN", requirementIdPrefix: "SDD", sections: [{ title: "????", type: "functional", maxItems: 3, verificationHint: "?????????????" }] }, null, 2), "utf8");
  await fs.writeFile(path.join(tempDir, "templates", "hil-test-case-template.json"), JSON.stringify({ name: "hil-test-case-template", language: "zh-CN", requirementIdPrefix: "HIL", sections: [{ title: "HIL ????", type: "functional", maxItems: 3, verificationHint: "????????????????????" }] }, null, 2), "utf8");
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
    name: "Skill loader composes generic, document type and module profiles",
    run: async () => {
      await withTempConfig(async () => {
        const loader = new SkillLoader();
        const skills = await loader.loadForContext({
          documentType: "hil_test_case",
          domain: "embedded_vcu",
          moduleSkillKey: "charging_management"
        });

        assert.ok(skills["requirement_writing.md"].includes("HIL ??"));
        assert.ok(skills["domain-knowledge.json"].examples.some((item) => item.topic === "????SOC"));
        assert.deepEqual(
          skills.__profiles.map((item) => item.kind),
          ["generic", "docType", "domain", "module"]
        );
      });
    }
  },
  {
    name: "Module skill service uses LLM bootstrap result when available",
    run: async () => {
      await withTempConfig(async () => {
        const knowledge = {
          version: 2,
          generationPriorities: ["优先写核心主题"],
          examples: [
            {
              requirementId: "CheryVCU-3015",
              topic: "充电过程堵转加热模式",
              sectionNumber: "",
              sectionTitle: "充电过程",
              requirementType: "functional",
              preferredTitle: "充电过程 - 堵转加热模式",
              requirementText: "当条件满足时发送堵转加热请求，超时则撤销。",
              signals: ["ECC_StallHeatingReq"],
              references: [],
              canonicalBranches: ["请求成立", "超时撤销"],
              keywords: ["充电管理", "堵转加热"]
            }
          ],
          ruleHints: [
            {
              domain: "embedded_vcu",
              subdomain: "充电管理",
              sectionHints: ["充电过程", "堵转加热模式"],
              writingPattern: "先写核心主线。",
              targetStyle: "贴近人工样例。",
              sourceBasis: ["system.md", "example.md"]
            }
          ],
          antiPatterns: ["不要把多个主题揉成一条。"],
          documentBlueprint: {
            domain: "embedded_vcu",
            subdomain: "充电管理",
            preferredFunctionSection: {
              sectionNumber: "",
              title: "充电管理"
            },
            preferredSubsections: [
              {
                sectionNumber: "",
                title: "充电过程",
                coreRequirementTypes: ["software_requirement"]
              }
            ],
            targetOutputPolicy: {
              coreFirst: true,
              preferSymmetricExpansion: true,
              preferObjectSpecificRequirements: true,
              discourageGenericScatterRequirements: true
            }
          }
        };

        const service = new ModuleSkillService({
          bootstrapLlmService: new FakeModuleSkillBootstrapLlmService({
            knowledge,
            analysis: {},
            profile: { id: "mock", name: "Mock LLM", provider: "doubao", model: "deepseek" }
          })
        });

        const result = await service.bootstrapModuleKnowledge(
          {
            name: "充电管理",
            moduleSkillKey: "充电管理",
            domain: "embedded_vcu",
            assets: []
          },
          "software_requirement",
          { llmProfileId: "mock" }
        );

        assert.equal(result.strategy, "llm");
        assert.equal(result.knowledge.examples[0].topic, "充电过程堵转加热模式");
        assert.equal(result.llmProfile.name, "Mock LLM");
      });
    }
  },
  {
    name: "Module skill service falls back to rule-based bootstrap without LLM result",
    run: async () => {
      await withTempConfig(async () => {
        const systemPath = path.join(config.rootDir, "input-system.md");
        const referencePath = path.join(config.rootDir, "input-reference.md");
        await fs.writeFile(systemPath, "系统应在满足条件时执行充电截止SOC控制。", "utf8");
        await fs.writeFile(referencePath, "优秀范例：先写截止SOC，再写记忆逻辑。", "utf8");

        const service = new ModuleSkillService({
          bootstrapLlmService: new FakeModuleSkillBootstrapLlmService(null)
        });

        const result = await service.bootstrapModuleKnowledge(
          {
            name: "充电管理",
            moduleSkillKey: "充电管理",
            domain: "embedded_vcu",
            assets: [
              {
                id: "sys-1",
                role: "system_pdf",
                originalName: "system.md",
                absolutePath: systemPath
              },
              {
                id: "ref-1",
                role: "reference_requirement_example",
                originalName: "reference.md",
                absolutePath: referencePath
              }
            ]
          },
          "software_requirement",
          { llmProfileId: "" }
        );

        assert.equal(result.strategy, "rule_based");
        assert.ok(Array.isArray(result.knowledge.generationPriorities));
      });
    }
  },
  {
    name: "Template service routes by document type",
    run: async () => {
      await withTempConfig(async () => {
        const service = new TemplateService();
        const requirementTemplate = await service.getTemplate("software_requirement");
        const detailTemplate = await service.getTemplate("detail_design");
        const hilTemplate = await service.getTemplate("hil_test_case");

        assert.equal(requirementTemplate.requirementIdPrefix, "SWR");
        assert.equal(detailTemplate.requirementIdPrefix, "SDD");
        assert.equal(hilTemplate.requirementIdPrefix, "HIL");
      });
    }
  },
  {
    name: "Validation enforces HIL specific fields",
    run: async () => {
      const validator = new ValidationService();
      const conflicts = validator.validate(
        [
          {
            id: "hil-1",
            documentType: "hil_test_case",
            requirementId: "HIL-001",
            title: "????SOC??",
            requirementText: "????SOC?????",
            sourceRefs: []
          }
        ],
        { documentType: "hil_test_case", domainKnowledge: {} }
      );

      assert.ok(conflicts.some((item) => item.code === "missing-preconditions"));
      assert.ok(conflicts.some((item) => item.code === "missing-test-steps"));
      assert.ok(conflicts.some((item) => item.code === "missing-expected-results"));
      assert.ok(conflicts.some((item) => item.code === "missing-pass-criteria"));
    }
  },
  {
    name: "LLM service falls back to HIL items with required fields",
    run: async () => {
      await withTempConfig(async () => {
        const service = new LlmService();
        const items = await service.generateDocumentItems(
          { name: "HIL Project", description: "", language: "zh-CN", documentType: "hil_test_case", domain: "embedded_vcu", moduleSkillKey: "charging_management" },
          [
            {
              evidence: [
                {
                  fileName: "system.pdf",
                  fileRole: "system_pdf",
                  location: "page:1",
                  excerpt: "???SOC????????????????",
                  tags: ["functional"],
                  confidence: 0.9
                }
              ]
            }
          ]
        );

        assert.equal(items[0].documentType, "hil_test_case");
        assert.ok(Array.isArray(items[0].preconditions));
        assert.ok(Array.isArray(items[0].testSteps));
        assert.ok(Array.isArray(items[0].expectedResults));
        assert.equal(typeof items[0].passCriteria, "string");
      });
    }
  },
  {
    name: "Rejected requirement creates feedback pool record",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();

        const project = await projectService.createProject({ name: "Feedback Project" });
        project.requirements = [
          {
            id: "req-1",
            requirementId: "SWR-001",
            title: "Need acceptance criteria",
            requirementText: "Software shall handle faults.",
            type: "functional",
            confidence: 0.66,
            verificationHint: "Add testable criteria",
            conflictNote: "",
            sourceRefs: [
              {
                fileName: "system.pdf",
                location: "page:1",
                excerpt: "System shall report faults."
              }
            ]
          }
        ];
        await projectService.saveProject(project);

        const updated = await projectService.reviewRequirement(project.id, "req-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "missing_info",
          reasonTags: ["acceptance-criteria"],
          reasonText: "Missing measurable acceptance criteria",
          expectedNote: "Describe trigger, behavior and verification.",
          includeInPool: true
        });

        assert.equal(updated.requirements[0].review.status, "rejected");
        assert.ok(updated.requirements[0].review.rejectionId);

        const records = await rejectionService.listRecords();
        assert.equal(records.length, 1);
        assert.equal(records[0].reasonCategory, "missing_info");
        assert.equal(records[0].skillContext.targetArea, "validation");
      });
    }
  },
  {
    name: "Rejected task result creates feedback pool record",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();

        const project = await projectService.createProject({ name: "Task Feedback Project" });
        const module = await projectService.createModule(project.id, {
          name: "制动管理",
          description: "负责制动相关生成结果"
        });
        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-1",
              requirementId: "SWR-201",
              title: "缺少验收条件",
              requirementText: "软件应处理制动请求。",
              type: "functional",
              confidence: 0.61,
              verificationHint: "补充可验证条件",
              conflictNote: "",
              sourceRefs: [
                {
                  fileName: "brake-system.pdf",
                  location: "page:2",
                  excerpt: "系统应在收到制动请求后输出控制信号。"
                }
              ]
            }
          ],
          extractions: [
            {
              fileName: "brake-system.pdf",
              fileRole: "system_pdf",
              summary: "制动系统需求摘要",
              evidence: [
                {
                  fileName: "brake-system.pdf",
                  fileRole: "system_pdf",
                  location: "page:2",
                  excerpt: "系统应在收到制动请求后输出控制信号。",
                  tags: ["brake", "signal"],
                  confidence: 0.88
                }
              ]
            }
          ],
          llmProfile: { id: "mock-profile", name: "Mock Profile" }
        });

        const reviewed = await projectService.reviewTaskResult(
          project.id,
          module.id,
          "software_requirement",
          task.id,
          "result-1",
          {
            status: "rejected",
            reviewer: "tester",
            reasonCategory: "missing_info",
            reasonTags: ["acceptance-criteria"],
            reasonText: "Missing measurable acceptance criteria",
            expectedNote: "Describe trigger, behavior and verification.",
            includeInPool: true,
            comment: "在任务详情页中人工驳回"
          }
        );

        assert.equal(reviewed.review.status, "rejected");
        assert.ok(reviewed.review.rejectionId);

        const records = await rejectionService.listRecords();
        assert.equal(records.length, 1);
        assert.equal(records[0].requirementCode, "SWR-201");
        assert.equal(records[0].reasonCategory, "missing_info");
        assert.equal(records[0].poolStatus, "new");
      });
    }
  },  {
    name: "Project service persists document type and defaults legacy projects",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();

        const detailProject = await projectService.createProject({
          name: "Detail Design Project",
          documentType: "detail_design"
        });
        assert.equal(detailProject.documentType, "detail_design");

        const legacyProjectId = "legacy-project";
        await fs.writeFile(
          path.join(config.projectStoreDir, `${legacyProjectId}.json`),
          JSON.stringify(
            {
              id: legacyProjectId,
              name: "Legacy Requirement Project",
              description: "",
              language: "zh-CN",
              templateName: "default-template",
              status: "draft",
              files: [],
              extractions: [],
              requirements: [],
              traces: [],
              conflicts: [],
              lastGeneration: null,
              auditLog: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            null,
            2
          ),
          "utf8"
        );

        const list = await projectService.listProjects();
        assert.equal(list.find((item) => item.id === detailProject.id)?.documentType, "detail_design");
        assert.equal(list.find((item) => item.id === legacyProjectId)?.documentType, "software_requirement");
      });
    }
  },
  {
    name: "Project service updates and deletes projects with uploads",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({
          name: "Original Project",
          description: "before"
        });

        const uploadDir = path.join(config.uploadDir, project.id);
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, "placeholder.txt"), "content", "utf8");

        const updated = await projectService.updateProject(project.id, {
          name: "Updated Project",
          description: "after"
        });
        assert.equal(updated.name, "Updated Project");
        assert.equal(updated.description, "after");
        assert.equal(updated.auditLog.at(-1)?.action, "project_updated");

        const deleted = await projectService.deleteProject(project.id);
        assert.equal(deleted.deleted, true);
        assert.equal(await projectService.getProject(project.id), null);
        await assert.rejects(fs.access(uploadDir));
      });
    }
  },
  {
    name: "Project service updates and deletes modules with uploads",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Module Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Original Module",
          description: "before"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, "placeholder.txt"), "content", "utf8");

        const updated = await projectService.updateModule(project.id, module.id, {
          name: "Updated Module",
          description: "after",
          domain: "embedded_vcu",
          moduleSkillKey: "updated_module"
        });
        assert.equal(updated.name, "Updated Module");
        assert.equal(updated.description, "after");
        assert.equal(updated.moduleSkillKey, "updated_module");

        const deleted = await projectService.deleteModule(project.id, module.id);
        assert.equal(deleted.deleted, true);

        const refreshedProject = await projectService.getProject(project.id);
        assert.equal(refreshedProject.modules.length, 0);
        await assert.rejects(fs.access(uploadDir));
      });
    }
  },
  {
    name: "Project service deletes completed and running tasks, including accepted snapshots",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Task Workspace" });
        const module = await projectService.createModule(project.id, { name: "Charging" });

        const completedTask = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          summary: "已完成任务",
          resultItems: [
            {
              id: "result-1",
              requirementId: "SWR-001",
              title: "充电状态输出",
              requirementText: "软件应输出充电状态。",
              type: "functional",
              confidence: 0.9,
              sourceRefs: []
            }
          ]
        });

        await projectService.createAcceptedItem(project.id, module.id, "software_requirement", {
          sourceTaskId: completedTask.id,
          sourceResultItemId: "result-1"
        });

        const runningTask = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "running",
          summary: "运行中任务"
        });

        const staleRunningTask = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "running",
          summary: "卡死任务",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          progress: {
            stage: "llm_generating",
            label: "等待模型返回",
            message: "已经长时间没有更新",
            percent: 70,
            updatedAt: "2026-04-01T00:00:00.000Z"
          }
        });

        const deleted = await projectService.deleteGenerationTask(
          project.id,
          module.id,
          "software_requirement",
          completedTask.id
        );
        assert.equal(deleted.deleted, true);
        assert.equal(deleted.removedAcceptedCount, 1);

        const space = await projectService.getDocumentSpace(project.id, module.id, "software_requirement");
        assert.equal(space.generationTasks.some((item) => item.id === completedTask.id), false);
        assert.equal(space.acceptedItems.some((item) => item.sourceTaskId === completedTask.id), false);

        const runningDeleted = await projectService.deleteGenerationTask(
          project.id,
          module.id,
          "software_requirement",
          runningTask.id
        );
        assert.equal(runningDeleted.deleted, true);

        const staleDeleted = await projectService.deleteGenerationTask(
          project.id,
          module.id,
          "software_requirement",
          staleRunningTask.id
        );
        assert.equal(staleDeleted.deleted, true);
      });
    }
  },
  {
    name: "Project and pipeline services support module tasks and accepted result snapshots",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const moduleSkillService = new ModuleSkillService();
        assert.equal(await moduleSkillService.hasModuleProfile("charging_management"), true);
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);

        const project = await projectService.createProject({ name: "Workspace Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          description: "负责充电状态与控制逻辑",
          importedSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "charging.md");
        const modelFilePath = path.join(uploadDir, "charging-model.c");
        const referenceFilePath = path.join(uploadDir, "charging-example.md");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");
        await fs.writeFile(modelFilePath, "void Charging_step(void) { chargeState = 1; }", "utf8");
        await fs.writeFile(referenceFilePath, "软件应在充电使能时输出充电状态信号。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "charging.md",
              filename: "charging.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ],
          generatedCode: [
            {
              originalname: "charging-model.c",
              filename: "charging-model.c",
              path: modelFilePath,
              mimetype: "text/x-c",
              size: 44
            }
          ],
          referenceExample: [
            {
              originalname: "charging-example.md",
              filename: "charging-example.md",
              path: referenceFilePath,
              mimetype: "text/markdown",
              size: 27
            }
          ]
        });

        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {});
        assert.equal(result.task.documentType, "software_requirement");
        assert.equal(result.task.status, "completed");
        assert.ok(result.task.resultItems.length >= 1);

        const accepted = await projectService.createAcceptedItem(project.id, module.id, "software_requirement", {
          sourceTaskId: result.task.id,
          sourceResultItemId: result.task.resultItems[0].id,
          requirementText: "软件应在充电使能时输出充电状态信号，并记录状态变化。"
        });
        assert.equal(accepted.sourceTaskId, result.task.id);
        assert.ok(accepted.acceptedSnapshot.requirementText.length > 0);
        assert.equal(
          accepted.currentContent.requirementText,
          "软件应在充电使能时输出充电状态信号，并记录状态变化。"
        );

        const updated = await projectService.updateAcceptedItem(
          project.id,
          module.id,
          "software_requirement",
          accepted.id,
          {
            requirementText: "软件应在充电使能时输出充电状态信号，并记录最近一次状态变化。"
          }
        );
        assert.equal(
          updated.currentContent.requirementText,
          "软件应在充电使能时输出充电状态信号，并记录最近一次状态变化。"
        );

        const refreshedProject = await projectService.getProject(project.id);
        const refreshedModule = refreshedProject.modules.find((item) => item.id === module.id);
        assert.equal(refreshedModule.assets.length, 3);
        assert.equal(refreshedModule.documentSpaces.software_requirement.generationTasks.length, 1);
        assert.equal(refreshedModule.documentSpaces.software_requirement.generationTasks[0].status, "completed");
        assert.equal(refreshedModule.documentSpaces.software_requirement.acceptedItems.length, 1);
        assert.equal(refreshedModule.documentSpaces.detail_design.generationTasks.length, 0);
      });
    }
  },
  {
    name: "Replay task applies accepted proposal items into candidate bundle",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const ruleService = new SkillRuleService();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Project" });
        project.requirements = [
          {
            id: "req-2",
            requirementId: "SWR-002",
            title: "Need better validation",
            requirementText: "Software shall process request.",
            type: "functional",
            confidence: 0.72,
            verificationHint: "",
            conflictNote: "",
            sourceRefs: []
          }
        ];
        await projectService.saveProject(project);
        await projectService.reviewRequirement(project.id, "req-2", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "too_vague",
          reasonTags: ["validation", "traceability"],
          reasonText: "No trigger or verification details",
          expectedNote: "Explicitly include trigger, behavior and traceability.",
          includeInPool: true
        });

        const records = await rejectionService.listRecords();
        const task = await replayTaskService.createTask({ rejectionIds: [records[0].id] });
        assert.ok(task.proposals[0].items.length >= 1);

        const proposalItem = task.proposals[0].items[0];
        await replayTaskService.reviewProposalItem(task.id, proposalItem.proposalItemId, {
          status: "accepted"
        });

        const applied = await replayTaskService.applyTask(task.id);
        assert.ok(applied.candidateBundle.id);

        const rules = await ruleService.listRules(applied.candidateBundle.id);
        assert.ok(rules.length >= 1);
        assert.ok(rules.some((rule) => rule.sourceType === "replay_proposal" || rule.version > 1));
      });
    }
  },
  {
    name: "Module rejection record keeps module context and detail snapshot",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();

        const project = await projectService.createProject({ name: "Feedback Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          description: "负责充电过程控制"
        });
        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-ctx-1",
              requirementId: "SWR-301",
              title: "充电截止控制",
              requirementText: "当 SOC 达到阈值时，软件应停止充电。",
              type: "functional",
              confidence: 0.73,
              verificationHint: "验证停止和恢复条件",
              conflictNote: "",
              sourceRefs: [
                {
                  fileName: "charging-system.md",
                  location: "page:1",
                  excerpt: "当 SOC 达到截止值时停止充电。"
                }
              ]
            }
          ],
          traces: [
            {
              requirementId: "result-ctx-1",
              requirementCode: "SWR-301",
              fileName: "charging-system.md",
              location: "page:1",
              excerpt: "当 SOC 达到截止值时停止充电。"
            }
          ],
          conflicts: [
            {
              requirementId: "result-ctx-1",
              code: "wording-gap",
              message: "缺少恢复条件"
            }
          ],
          extractions: [
            {
              fileName: "charging-system.md",
              fileRole: "system_pdf",
              summary: "充电系统摘要",
              evidence: [
                {
                  fileName: "charging-system.md",
                  fileRole: "system_pdf",
                  location: "page:1",
                  excerpt: "当 SOC 达到截止值时停止充电。",
                  tags: ["soc", "charging"],
                  confidence: 0.9
                }
              ]
            }
          ],
          llmProfile: { id: "profile-a", name: "Mock LLM" }
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-ctx-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonTags: ["案例对齐"],
          reasonText: "表达方式没有对齐人工样例",
          expectedNote: "按人工样例补充完整行为链路",
          includeInPool: true,
          comment: "任务详情页驳回"
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        assert.equal(records.length, 1);
        assert.equal(records[0].moduleName, "充电管理");
        assert.equal(records[0].documentType, "software_requirement");
        assert.equal(records[0].sourceTaskId, task.id);
        assert.equal(records[0].outputSnapshot.conflicts.length, 1);
        assert.equal(records[0].outputSnapshot.traces.length, 1);
      });
    }
  },
  {
    name: "Replay task carries selected module assets into material pack",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Asset Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          description: "负责充电相关逻辑"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const assetPath = path.join(uploadDir, "charging-helper.c");
        await fs.writeFile(assetPath, "void StallHeatingHelper(void) { /* replay reference */ }", "utf8");
        const attached = await projectService.attachModuleAssets(project.id, module.id, {
          generatedCode: [
            {
              originalname: "charging-helper.c",
              filename: "charging-helper.c",
              path: assetPath,
              mimetype: "text/plain",
              size: 58
            }
          ]
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-1",
              requirementId: "SWR-401",
              title: "堵转加热请求",
              requirementText: "软件应在满足条件时发送堵转加热请求。",
              type: "functional",
              confidence: 0.8,
              verificationHint: "检查触发条件和超时撤销",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: [],
          llmProfile: { id: "profile-b", name: "Replay Mock" }
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonTags: ["实现细节混入"],
          reasonText: "正文混入了实现化表达",
          expectedNote: "请参考模型代码但保持软件需求写法",
          includeInPool: true,
          comment: "任务详情页驳回"
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id,
          referenceAssetIds: [attached.assets[0].id]
        });

        assert.equal(replayTask.materialPack.moduleContext.moduleName, "充电管理");
        assert.equal(replayTask.materialPack.referenceAssets.length, 1);
        assert.equal(replayTask.materialPack.referenceAssets[0].originalName, "charging-helper.c");
        assert.ok(replayTask.materialPack.referenceAssets[0].preview.includes("StallHeatingHelper"));

        const updatedRecord = await rejectionService.getRecord(records[0].id);
        assert.equal(updatedRecord.replayCount, 1);
        assert.equal(updatedRecord.replayStatus, "proposal_ready");
      });
    }
  },  {
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
  },
  {
    name: "Skill management service lists, updates, and deletes skills safely",
    run: async () => {
      await withTempConfig(async () => {
        const service = new SkillManagementService();

        const list = await service.listSkills();
        assert.equal(list.summary.countsByType.generic, 1);
        assert.equal(list.summary.countsByType.docType, 3);
        assert.equal(list.summary.countsByType.domain, 1);
        assert.equal(list.summary.countsByType.module, 1);

        const detail = await service.getSkillDetail("module", "charging_management");
        assert.equal(detail.item.key, "charging_management");
        assert.ok(detail.capabilities.canDelete);

        const updated = await service.updateSkill("module", "charging_management", {
          knowledge: {
            version: 2,
            generationPriorities: ["先覆盖充电主流程"],
            antiPatterns: ["不要遗漏 SOC 限值"],
            ruleHints: [
              {
                domain: "embedded_vcu",
                subdomain: "charging_management",
                sectionHints: ["充电限值"],
                writingPattern: "保持人类样例顺序",
                targetStyle: "规约写法",
                sourceBasis: ["charging-reference.md"]
              }
            ],
            examples: [
              {
                requirementId: "REQ-2",
                topic: "SOC 限制",
                requirementText: "软件应根据 SOC 阈值限制充电功率。",
                keywords: ["SOC"]
              }
            ]
          }
        });

        assert.equal(updated.knowledge.version, 2);
        assert.equal(updated.knowledge.examples.length, 1);
        assert.equal(updated.knowledge.ruleHints[0].subdomain, "charging_management");

        const removal = await service.deleteSkill("module", "charging_management");
        assert.equal(removal.removed, true);

        const afterDelete = await service.listSkills();
        assert.equal(afterDelete.summary.countsByType.module, 0);
        const manifest = JSON.parse(await fs.readFile(path.join(config.activeSkillDir, "skill-manifest.json"), "utf8"));
        assert.equal(manifest.profiles.modules.charging_management, undefined);

        const modulePath = path.join(config.activeSkillDir, "profiles", "modules", "charging_management", "domain-knowledge.json");
        const exists = await fs
          .access(modulePath)
          .then(() => true)
          .catch(() => false);
        assert.equal(exists, false);
      });
    }
  },
  {
    name: "Structured policy skills can be stored as plain readable text without raw JSON input",
    run: async () => {
      await withTempConfig(async () => {
        const service = new SkillManagementService();
        const created = await service.createSkillItem({
          layer: "module",
          profileKey: "charging_management",
          kind: "document_blueprint_policy",
          title: "document blueprint policy preferSymmetricExpansion",
          content: [
            "蓝图策略：preferSymmetricExpansion",
            "策略值：true",
            "策略含义：优先按对象或轴对称展开章节和需求。"
          ].join("\n")
        });

        assert.equal(created.kind, "document_blueprint_policy");
        assert.equal(created.content, "优先按对象或轴对称展开章节和需求。");
        assert.equal(created.structuredPayload.key, "preferSymmetricExpansion");
        assert.equal(created.structuredPayload.value, true);

        const detail = await service.getSkillItem(created.skillCode);
        assert.equal(detail.item.structuredPayload.key, "preferSymmetricExpansion");
        assert.equal(detail.item.structuredPayload.value, true);
        assert.equal(detail.item.content, "优先按对象或轴对称展开章节和需求。");
      });
    }
  },
  {
    name: "Legacy structured text is normalized into concise meaningful prose",
    run: async () => {
      await withTempConfig(async () => {
        const service = new SkillManagementService();
        const created = await service.createSkillItem({
          layer: "module",
          profileKey: "charging_management",
          kind: "source_policy_setting",
          title: "source policy standard",
          content: [
            "策略名称：standard",
            "策略值：ISO 26262",
            "策略说明：当前技能库参考的标准是 ISO 26262。"
          ].join("\n")
        });

        assert.equal(created.content, "当前技能库参考的标准是 ISO 26262。");
        assert.equal(created.structuredPayload.key, "standard");
        assert.equal(created.structuredPayload.value, "ISO 26262");
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
