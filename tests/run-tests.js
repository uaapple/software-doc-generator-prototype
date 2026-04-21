import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { config } from "../src/config.js";
import { createApp } from "../src/app.js";
import { CExtractor } from "../src/services/c-extractor.js";
import { ValidationService } from "../src/services/validation-service.js";
import { LlmService, buildReplayModelInput } from "../src/services/llm-service.js";
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
import { SkillWorkOrderService } from "../src/services/skill-work-order-service.js";
import { ReplayLabService } from "../src/services/replay-lab-service.js";
import { FeedbackTicketService } from "../src/services/feedback-ticket-service.js";
import { createHermesApp } from "../src/hermes-app.js";
import { HermesAgentClient } from "../src/services/hermes-agent-client.js";

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
    skillWorkOrderStoreDir: path.join(tempDir, "data", "skill-work-orders"),
    feedbackTicketStoreDir: path.join(tempDir, "data", "feedback-tickets"),
    feedbackTicketUploadDir: path.join(tempDir, "data", "uploads", "feedback-tickets"),
    templateDir: path.join(tempDir, "templates"),
    templatePath: path.join(tempDir, "templates", "software-requirement-template.json"),
    skillDir: path.join(tempDir, "skills", "active"),
    hermes: {
      transport: "api",
      host: "127.0.0.1",
      port: 0,
      baseURL: "http://127.0.0.1:0",
      command: "hermes",
      workdir: tempDir,
      timeoutMs: 2000,
      stepTimeoutMs: {
        outline_build: 2000,
        content_generate: 4000
      },
      maxTurns: 8,
      maxRecalledAtoms: 24,
      maxOutlineSections: 6,
      maxEvidenceForGeneration: 40
    }
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
  await fs.writeFile(path.join(tempDir, "skills", "active", "domain-knowledge.json"), JSON.stringify(genericKnowledge, null, 2), "utf8");
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

async function withTestServer(run) {
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run({ baseUrl });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function withHermesServer(run) {
  const app = await createHermesApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await run({ baseUrl });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function seedWikiFixture(rootDir, overrides = {}) {
  const wikiDir = path.join(rootDir, "wiki");
  const contentDir = path.join(wikiDir, "content");
  const assetsDir = path.join(wikiDir, "assets");
  await fs.mkdir(contentDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });

  const navigation = {
    site: {
      title: "软件文档平台 Wiki",
      summary: "帮助第一次接触系统的使用者快速理解能力、流程和常见问题。",
      homePageSlug: "home",
      featuredPageSlugs: ["quick-start", "requirement-generation", "skill-management-fallback"]
    },
    groups: [
      {
        title: "开始使用",
        pages: [
          {
            slug: "home",
            title: "首页",
            summary: "认识这套系统的能力与推荐阅读路径。",
            audience: "系统使用者",
            status: "stable",
            lastReviewed: "2026-04-17",
            relatedPages: ["quick-start", "implementation-principles"]
          },
          {
            slug: "quick-start",
            title: "快速开始",
            summary: "先理解工程、模块、资产和生成任务，再开始第一次操作。",
            audience: "系统使用者",
            status: "stable",
            lastReviewed: "2026-04-17",
            relatedPages: ["requirement-generation", "faq"]
          }
        ]
      },
      {
        title: "核心流程",
        pages: [
          {
            slug: "requirement-generation",
            title: "软件需求生成",
            summary: "说明如何准备模块资产并发起软件需求生成。",
            audience: "系统使用者",
            status: "stable",
            lastReviewed: "2026-04-17",
            relatedPages: ["quick-start", "implementation-principles"]
          }
        ]
      },
      {
        title: "高级能力",
        pages: [
          {
            slug: "skill-management-fallback",
            title: "技能管理与 Fallback",
            summary: "解释技能管理、工单与 fallback 修复的作用和处理路径。",
            audience: "系统使用者",
            status: "stable",
            lastReviewed: "2026-04-17",
            relatedPages: ["implementation-principles", "faq"]
          }
        ]
      },
      {
        title: "了解系统",
        pages: [
          {
            slug: "implementation-principles",
            title: "实现原理",
            summary: "浅讲输入、抽取、编排、校验和审核回写的关系。",
            audience: "系统使用者",
            status: "stable",
            lastReviewed: "2026-04-17",
            relatedPages: ["requirement-generation", "skill-management-fallback"]
          },
          {
            slug: "faq",
            title: "FAQ 与当前限制",
            summary: "统一收口端口、输入约束、失败排查和当前边界。",
            audience: "系统使用者",
            status: "stable",
            lastReviewed: "2026-04-17",
            relatedPages: ["quick-start", "requirement-generation"]
          }
        ]
      }
    ]
  };

  if (overrides.navigation) {
    Object.assign(navigation, overrides.navigation);
  }

  const pages = {
    "home.md": [
      "# 软件文档平台 Wiki",
      "",
      "## 你可以在这里获得什么",
      "",
      "- 快速理解系统能做什么",
      "- 找到第一次上手的推荐路径",
      "- 在遇到问题时知道去哪里看",
      "",
      "## 推荐阅读路径",
      "",
      "先看 [快速开始](/pages/quick-start)，再进入 [软件需求生成](/pages/requirement-generation)。"
    ].join("\n"),
    "quick-start.md": [
      "# 快速开始",
      "",
      "## 适用场景",
      "",
      "适合第一次使用系统、还不清楚工程和模块关系的同学。",
      "",
      "## 操作步骤",
      "",
      "1. 创建工程。",
      "2. 在工程中创建功能模块。",
      "3. 为模块上传系统需求、模型资料和代码。",
      "4. 选择要发起的生成类型。"
    ].join("\n"),
    "requirement-generation.md": [
      "# 软件需求生成",
      "",
      "## 这页讲什么",
      "",
      "介绍如何为当前模块准备资产并发起软件需求生成。",
      "",
      "## 背后原理",
      "",
      "系统会先抽取输入证据，再由后端编排层组织输出，并补充追溯与校验结果。"
    ].join("\n"),
    "skill-management-fallback.md": [
      "# 技能管理与 Fallback",
      "",
      "## 为什么会看到 fallback",
      "",
      "当现有技能无法稳定覆盖某类写法时，系统会把问题沉淀为可审阅的工单。",
      "",
      "## layer × kind",
      "",
      "系统现在会同时校验 layer 和 kind 的组合是否合法。",
      "",
      "## 处理后看哪里",
      "",
      "可以回到生成结果、工单详情和相关技能条目继续确认变化。"
    ].join("\n"),
    "implementation-principles.md": [
      "# 实现原理",
      "",
      "## 总体链路",
      "",
      "文件接入、信息抽取、LLM 编排、规则校验和人工审核共同组成主要处理流程。"
    ].join("\n"),
    "faq.md": [
      "# FAQ 与当前限制",
      "",
      "## 端口说明",
      "",
      "- 业务系统通过 `3000` 访问。",
      "- 独立 wiki 通过 `3001` 访问。",
      "",
      "## 当前限制",
      "",
      "- 第一版不提供全文搜索。",
      "- 第一版不提供站内编辑。"
    ].join("\n")
  };

  if (overrides.pages) {
    Object.assign(pages, overrides.pages);
  }

  await fs.writeFile(path.join(wikiDir, "navigation.json"), JSON.stringify(navigation, null, 2), "utf8");
  for (const [fileName, content] of Object.entries(pages)) {
    await fs.writeFile(path.join(contentDir, fileName), content, "utf8");
  }
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
    name: "Replay prompt only includes original generation skill context and explained reference assets",
    run: async () => {
      const materialPack = {
        targetAreas: ["validation"],
        allowedKindsByArea: {
          validation: ["validation_rule", "anti_pattern", "rule_hint"]
        },
        allowedKindsByLayer: {
          module: ["validation_rule", "anti_pattern", "rule_hint"]
        },
        allowedKindsForReplay: ["validation_rule", "anti_pattern", "rule_hint"],
        moduleContext: {
          projectName: "VCU",
          moduleName: "充电管理",
          documentType: "software_requirement"
        },
        rejectionSnapshots: [
          {
            id: "rej-1",
            reasonCategory: "coverage_gap",
            reasonText: "生成结果混入了人工范例中没有的回退逻辑。",
            expectedNote: "请仅保留记忆和刷新要求。",
            outputSnapshot: {
              title: "充电过程 - 充电截止SOC记忆",
              requirementText: "VCU 应记忆 SOC，并在无效值时回退默认值。",
              verificationHint: "检查记忆与回退行为。",
              confidence: 0.82
            },
            sourceRefsSnapshot: [
              {
                fileName: "system.md",
                location: "page:1",
                excerpt: "系统需求只提到下电记忆。"
              }
            ],
            projectEvidenceSnapshot: [
              {
                fileName: "Chrg.c",
                fileRole: "generated_c",
                location: "function",
                excerpt: "函数 if(rtb_Delay_k)",
                tags: ["function"]
              }
            ]
          }
        ],
        effectiveSkillSnapshot: {
          compiledPrompt: "这是原始生成时的 compiledPrompt",
          selectedProfiles: [
            { key: "generic", kind: "generic" },
            { key: "software_requirement", kind: "docType" },
            { key: "embedded_vcu", kind: "domain" },
            { key: "charging_management", kind: "module" }
          ],
          compiledSkillPack: {
            context: {
              documentType: "software_requirement",
              domain: "embedded_vcu",
              moduleSkillKey: "charging_management"
            },
            selectedProfiles: [
              { key: "generic", kind: "generic" },
              { key: "software_requirement", kind: "docType" }
            ],
            rules: {
              extraction: [{ skillCode: "ext-1", kind: "extraction_rule", title: "抽取规则", content: "先抽取事实。" }],
              writing: [{ skillCode: "wr-1", kind: "writing_rule", title: "写作规则", content: "保持软件需求风格。" }],
              validation: [{ skillCode: "val-1", kind: "validation_rule", title: "校验规则", content: "避免越界扩写。" }]
            },
            examples: {
              good: [{ skillCode: "good-1", kind: "good_example", title: "好例子", content: "只写记忆行为。" }],
              bad: []
            },
            knowledge: {
              generationPriorities: [],
              antiPatterns: [],
              ruleHints: []
            },
            flatItems: []
          },
          files: {
            "requirement_extraction.md": "# 抽取\n- 抽取事实",
            "requirement_writing.md": "# 写作\n- 保持需求风格",
            "requirement_validation.md": "# 校验\n- 禁止越界扩写",
            "examples/good_examples.md": "# 正例\n- 只写记忆行为",
            "examples/bad_examples.md": "# 反例\n- 混入回退逻辑",
            "domain-knowledge.json": {
              version: 1,
              ruleHints: [{ domain: "embedded_vcu", sectionHints: ["VCU"] }]
            }
          }
        },
        referenceAssets: [
          {
            originalName: "system-requirements-example-charging-management.md",
            role: "system_pdf",
            preview: "系统需求：设置范围 50%-100%，HCU 需要下电记忆。"
          },
          {
            originalName: "software-design-requirements-example-charging-management.md",
            role: "reference_requirement_example",
            preview: "优质范例：CheryVCU-12147 仅保留记忆和刷新。"
          },
          {
            originalName: "Chrg.c",
            role: "generated_c",
            preview: "if (limitInvalid) { fallbackDefault(); }"
          }
        ],
        candidateSkillItems: [
          {
            skillCode: "should-not-appear",
            layer: "docType",
            profileKey: "software_requirement",
            kind: "validation_rule",
            title: "应以精简 inventory 形式出现在 replay prompt 中",
            targetFile: "requirement_validation.md",
            contentSummary: "精简后的候选 skill 摘要"
          }
        ]
      };

      const messages = buildReplayModelInput(materialPack);
      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, "system");
      assert.equal(messages[1].role, "user");

      const systemText = messages[0].content[0].text;
      assert.match(systemText, /generic/);
      assert.match(systemText, /docType/);
      assert.match(systemText, /domain/);
      assert.match(systemText, /module/);
      assert.match(systemText, /先分析驳回意见、期望写法和被驳回输出/);
      assert.match(systemText, /优先在原始生成时已提供给模型的 skill/);
      assert.match(systemText, /一次 replay 可以输出多个 items/i);

      const payload = JSON.parse(messages[1].content[0].text);
      assert.deepEqual(Object.keys(payload), [
        "taskContext",
        "rejectionContext",
        "originalGenerationSkillContext",
        "layerSkillInventory",
        "candidateSkillInventory",
        "referenceAssets"
      ]);

      assert.equal(payload.taskContext.projectName, "VCU");
      assert.equal(payload.taskContext.moduleName, "充电管理");
      assert.equal(payload.taskContext.documentType, "software_requirement");
      assert.deepEqual(payload.taskContext.targetAreas, ["validation"]);
      assert.equal(payload.taskContext.layerSkillCount, 1);
      assert.deepEqual(payload.taskContext.allowedKindsByLayer, {
        module: ["validation_rule", "anti_pattern", "rule_hint"]
      });
      assert.deepEqual(payload.taskContext.allowedKindsForReplay, ["validation_rule", "anti_pattern", "rule_hint"]);

      assert.equal(payload.rejectionContext.records.length, 1);
      assert.equal(payload.rejectionContext.records[0].id, "rej-1");
      assert.equal(payload.rejectionContext.records[0].reasonCategory, "coverage_gap");
      assert.equal(payload.rejectionContext.records[0].expectedNote, "请仅保留记忆和刷新要求。");
      assert.equal(payload.rejectionContext.records[0].rejectedOutput.title, "充电过程 - 充电截止SOC记忆");

      assert.deepEqual(Object.keys(payload.originalGenerationSkillContext), [
        "requirementExtraction",
        "requirementWriting",
        "requirementValidation",
        "goodExamples",
        "badExamples",
        "domainKnowledge",
        "selectedProfiles"
      ]);
      assert.equal(payload.originalGenerationSkillContext.requirementExtraction, "# 抽取\n- 抽取事实");
      assert.equal(payload.originalGenerationSkillContext.requirementWriting, "# 写作\n- 保持需求风格");
      assert.equal(payload.originalGenerationSkillContext.requirementValidation, "# 校验\n- 禁止越界扩写");
      assert.equal(payload.originalGenerationSkillContext.goodExamples, "# 正例\n- 只写记忆行为");
      assert.equal(payload.originalGenerationSkillContext.badExamples, "# 反例\n- 混入回退逻辑");
      assert.deepEqual(payload.originalGenerationSkillContext.domainKnowledge, {
        version: 1,
        ruleHints: [{ domain: "embedded_vcu", sectionHints: ["VCU"] }]
      });

      assert.equal(payload.candidateSkillInventory.length, 1);
      assert.equal(payload.candidateSkillInventory[0].skillCode, "should-not-appear");
      assert.equal(payload.candidateSkillInventory[0].targetLayer, "docType");
      assert.equal(payload.candidateSkillInventory[0].targetProfileKey, "software_requirement");
      assert.equal(payload.candidateSkillInventory[0].targetKind, "validation_rule");

      assert.equal(payload.referenceAssets.length, 3);
      assert.equal(payload.referenceAssets[0].fileName, "system-requirements-example-charging-management.md");
      assert.match(payload.referenceAssets[0].typeDescription, /系统需求来源/);
      assert.match(payload.referenceAssets[1].typeDescription, /人工软件需求优质范例/);
      assert.match(payload.referenceAssets[1].whyRelevant, /直接相关|重点参考/);
      assert.match(payload.referenceAssets[2].typeDescription, /实现\/代码证据/);

      const payloadText = messages[1].content[0].text;
      assert.ok(!payloadText.includes("candidateSkillItems"));
      assert.ok(payloadText.includes("candidateSkillInventory"));
      assert.ok(payloadText.includes("should-not-appear"));
      assert.ok(!payloadText.includes("compiledPrompt"));
      assert.ok(!payloadText.includes("compiledSkillPack"));
    }
  },
  {
    name: "Replay proposal normalization keeps actionable items from descriptive remote payload",
    run: async () => {
      await withTempConfig(async () => {
        const service = new LlmService();
        const originalFetch = globalThis.fetch;
        const originalResolveProfile = service.profileService.resolveProfile.bind(service.profileService);
        service.profileService.resolveProfile = async () => ({
          id: "remote-profile",
          provider: "zhipu",
          name: "Remote Replay Model",
          model: "glm-test",
          apiKey: "fake-key",
          baseURL: "https://example.invalid/v1"
        });

        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              id: "chatcmpl-replay-test",
              object: "chat.completion",
              created: 0,
              model: "glm-test",
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      summary: "需要补齐可落地的技能修改提案。",
                      decisionSummary: "远端已经识别出一条修改现有规则和一条新增规则建议。",
                      rootCauses: ["人工范例边界约束不足"],
                      validatorSuggestions: [],
                      items: [
                        {
                          conclusionType: "modify_existing",
                          action: "修改充电截止SOC记忆的写作规则，强化人工范例边界约束",
                          targetSkillCode: "DOC-software_requirement-writing_rule-002",
                          targetLayer: "docType",
                          targetProfileKey: "software_requirement",
                          targetKind: "validation_rule",
                          targetInsertionHint: "在人工样例对齐优先规则后添加补充说明",
                          title: "充电截止SOC记忆需求边界校验",
                          fallbackReason: "需强化现有规则对人工范例边界的严格遵循",
                          whyCurrent: "当前规则未明确禁止代码侧推断逻辑混入需求正文。",
                          whyChange: "补充边界校验后可避免再度越界扩写。",
                          beforeContent: "当输入同时包含人工软件需求样例、系统需求和代码证据时，优先对齐人工样例已经稳定下来的主题边界、主题顺序和句式。",
                          afterContent: "当输入同时包含人工软件需求样例、系统需求和代码证据时，优先对齐人工样例已经稳定下来的主题边界、主题顺序和句式。对于充电截止SOC记忆等需求条目，不得将代码侧推断的保护/回退逻辑混入需求正文。",
                          before: "旧规则",
                          after: "新规则",
                          rationale: "强化边界约束。",
                          evidenceRefs: ["CheryVCU-12147"],
                          newRuleDraft: null
                        },
                        {
                          conclusionType: "create_new",
                          action: "新增充电管理领域特定规则，明确禁止代码细节混入需求正文",
                          targetSkillCode: "MOD-充电管理-validation_rule-001",
                          targetLayer: "module",
                          targetProfileKey: "充电管理",
                          targetKind: "validation_rule",
                          targetInsertionHint: "作为充电管理模块的专属验证规则",
                          title: "充电管理需求正文边界校验",
                          fallbackReason: "需要针对充电管理领域新增特定规则，防止代码细节混入需求正文",
                          whyCurrent: "现有通用规则未能充分约束充电管理领域中代码细节混入需求正文的问题。",
                          whyChange: "新增模块级规则后可直接沉淀为模块工单。",
                          beforeContent: "无对应现有规则",
                          afterContent: "在充电管理领域，需求正文应严格遵循人工范例的边界和风格，不得将代码侧推断的保护/回退逻辑混入需求正文。",
                          before: "",
                          after: "新增规则正文",
                          rationale: "需要新增模块规则。",
                          evidenceRefs: ["CheryVCU-12147"],
                          newRuleDraft: null
                        }
                      ]
                    })
                  }
                }
              ]
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );

        try {
          const proposal = await service.generateReplayProposal(
            {
              targetAreas: ["validation"],
              allowedKindsByArea: {
                validation: ["validation_rule", "anti_pattern", "rule_hint"]
              },
              moduleContext: {
                projectName: "VCU",
                moduleName: "充电管理",
                moduleSkillKey: "charging_management",
                domain: "embedded_vcu",
                documentType: "software_requirement"
              },
              rejectionSnapshots: [
                {
                  id: "rej-1",
                  requirementCode: "CheryVCU-12147",
                  reasonCategory: "coverage_gap",
                  reasonText: "生成结果混入了人工范例中没有的回退逻辑。",
                  expectedNote: "请仅保留记忆和刷新要求。",
                  outputSnapshot: {
                    title: "充电过程 - 充电截止SOC记忆",
                    requirementText: "VCU 应记忆 SOC，并在无效值时回退默认值。",
                    verificationHint: "检查记忆与回退行为。",
                    confidence: 0.82
                  },
                  sourceRefsSnapshot: [],
                  projectEvidenceSnapshot: []
                }
              ],
              effectiveSkillSnapshot: {
                selectedProfiles: [
                  { key: "generic", kind: "generic" },
                  { key: "software_requirement", kind: "docType" }
                ],
                files: {
                  "requirement_extraction.md": "# 抽取\n- 抽取事实",
                  "requirement_writing.md": "# 写作\n- 保持需求风格",
                  "requirement_validation.md": "# 校验\n- 禁止越界扩写",
                  "examples/good_examples.md": "# 正例\n- 只写记忆行为",
                  "examples/bad_examples.md": "# 反例\n- 混入回退逻辑",
                  "domain-knowledge.json": {
                    version: 1,
                    ruleHints: [{ domain: "embedded_vcu", sectionHints: ["VCU"] }]
                  }
                }
              },
              candidateSkillItems: [
                {
                  skillCode: "DOC-software_requirement-writing_rule-002",
                  layer: "docType",
                  profileKey: "software_requirement",
                  kind: "validation_rule",
                  title: "人工样例对齐优先",
                  contentSummary: "优先对齐人工样例边界。",
                  targetFile: "requirement_validation.md"
                }
              ],
              referenceAssets: []
            },
            { llmProfileId: "remote-profile" }
          );

          assert.equal(proposal.items.length, 2);
          assert.equal(proposal.items[0].action, "modify_skill_item");
          assert.equal(proposal.items[0].targetSkillCode, "DOC-software_requirement-writing_rule-002");
          assert.deepEqual(proposal.items[0].evidenceRefs, ["rej-1"]);

          assert.equal(proposal.items[1].action, "add_skill_item");
          assert.equal(proposal.items[1].conclusionType, "create_new");
          assert.equal(proposal.items[1].targetSkillCode, "");
          assert.equal(proposal.items[1].targetLayer, "module");
          assert.equal(proposal.items[1].targetProfileKey, "charging_management");
          assert.deepEqual(proposal.items[1].evidenceRefs, ["rej-1"]);
          assert.equal(proposal.items[1].newRuleDraft.title, "充电管理需求正文边界校验");
          assert.match(proposal.items[1].newRuleDraft.content, /不得将代码侧推断的保护\/回退逻辑混入需求正文/);
        } finally {
          globalThis.fetch = originalFetch;
          service.profileService.resolveProfile = originalResolveProfile;
        }
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
    name: "Torque intervention detail design profile loads dedicated detail design guidance",
    run: async () => {
      const loader = new SkillLoader();
      const skills = await loader.loadForContext({
        documentType: "detail_design",
        domain: "embedded_vcu",
        moduleSkillKey: "扭矩干预"
      });

      assert.match(skills["requirement_writing.md"], /详细设计输出应描述“软件内部实现分解”/);
      assert.ok(skills["domain-knowledge.json"].documentBlueprint);
      assert.ok(
        skills["domain-knowledge.json"].examples.some((item) => item.topic === "计算前轴仅RBS激活标志位")
      );
      assert.ok(
        skills["domain-knowledge.json"].examples.some((item) => item.topic === "计算后轴仅RBS激活标志位")
      );
    }
  },
  {
    name: "Torque intervention software requirement profile stays free of detail design-only examples",
    run: async () => {
      const loader = new SkillLoader();
      const skills = await loader.loadForContext({
        documentType: "software_requirement",
        domain: "embedded_vcu",
        moduleSkillKey: "扭矩干预"
      });

      const scopedModuleItems = skills.__compiledSkillPack.flatItems.filter(
        (item) => item.layer === "module" && item.profileKey === "扭矩干预"
      );
      assert.ok(
        !scopedModuleItems.some((item) => item.skillCode === "MOD-扭矩干预-good_example-007")
      );
      assert.ok(
        !scopedModuleItems.some((item) => item.skillCode === "MOD-扭矩干预-good_example-010")
      );
      assert.ok(
        !scopedModuleItems.some((item) => item.skillCode === "MOD-扭矩干预-rule_hint-002")
      );
    }
  },
  {
    name: "Hv/lv system management detail design profile loads dedicated detail design guidance",
    run: async () => {
      const loader = new SkillLoader();
      const skills = await loader.loadForContext({
        documentType: "detail_design",
        domain: "embedded_vcu",
        moduleSkillKey: "高低系统管理"
      });

      assert.match(skills["requirement_extraction.md"], /锁存条件、复位条件、默认保持路径、状态范围触发条件/);
      assert.match(skills["requirement_validation.md"], /激活条件，但漏写锁存、清除、复位、默认路径或状态范围限制/);
      assert.ok(
        skills["domain-knowledge.json"].generationPriorities.some((item) =>
          item.includes("请求标志位")
        )
      );
      assert.ok(
        skills["domain-knowledge.json"].examples.some((item) => item.topic === "KeyOn高压请求标志位")
      );
      assert.ok(
        skills["domain-knowledge.json"].examples.some((item) => item.topic === "本地KL15上高压建立流程")
      );
    }
  },
  {
    name: "Hv/lv system management software requirement profile stays free of detail design-only items",
    run: async () => {
      const loader = new SkillLoader();
      const skills = await loader.loadForContext({
        documentType: "software_requirement",
        domain: "embedded_vcu",
        moduleSkillKey: "高低系统管理"
      });

      const scopedModuleItems = skills.__compiledSkillPack.flatItems.filter(
        (item) => item.layer === "module" && item.profileKey === "高低系统管理"
      );
      assert.ok(
        !scopedModuleItems.some((item) => item.skillCode === "MOD-高低系统管理-good_example-003")
      );
      assert.ok(
        !scopedModuleItems.some((item) => item.skillCode === "MOD-高低系统管理-good_example-004")
      );
      assert.ok(
        !scopedModuleItems.some((item) => item.skillCode === "MOD-高低系统管理-rule_hint-002")
      );
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
        const restartedBundleService = new SkillBundleService();
        await restartedBundleService.ensureInitialized();
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
          targetArea: "validation",
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
            targetArea: "validation",
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
    name: "Hermes agent client reports invalid JSON responses clearly",
    run: async () => {
      await withTempConfig(async () => {
        const server = http.createServer((_req, res) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{invalid-json");
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        const client = new HermesAgentClient({
          baseURL: `http://127.0.0.1:${address.port}`,
          timeoutMs: 500
        });

        try {
          await assert.rejects(
            () =>
              client.executeStep({
                taskId: "task-invalid",
                stepType: "material_extract",
                allowedPaths: [],
                inputArtifact: {},
                skillInventory: null,
                llmProfileSnapshot: null
              }),
            (error) => {
              assert.equal(error.code, "hermes_invalid_response");
              assert.match(error.message, /Hermes/i);
              return true;
            }
          );
        } finally {
          await new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          });
        }
      });
    }
  },
  {
    name: "Hermes agent client parses quiet CLI output and session id",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout: "{\"items\":[{\"title\":\"CLI item\",\"requirementText\":\"CLI text\",\"sourceRefs\":[]}]}\n\nsession_id: 20260421_144500_abcd12\n",
              stderr: ""
            };
          }
        });

        const response = await client.executeStep({
          taskId: "task-cli",
          stepType: "content_generate",
          allowedPaths: [],
          inputArtifact: {
            project: { name: "CLI Project", documentType: "software_requirement" },
            evidence: [],
            recalledAtoms: [],
            outline: { sections: [{ title: "Section", objective: "Goal" }] },
            template: { requirementIdPrefix: "SWR", sections: [] }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].command, "hermes");
        assert.ok(invocations[0].args.includes("chat"));
        assert.ok(invocations[0].args.includes("-Q"));
        assert.equal(response.status, "succeeded");
        assert.equal(response.sessionId, "20260421_144500_abcd12");
        assert.equal(response.artifact.items[0].title, "CLI item");
      });
    }
  },
  {
    name: "Hermes agent client applies step-specific CLI timeout for content_generate",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          timeoutMs: 120000,
          stepTimeoutMs: {
            outline_build: 120000,
            content_generate: 240000
          },
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout: "{\"items\":[{\"title\":\"CLI item\",\"requirementText\":\"CLI text\",\"sourceRefs\":[]}]}\n\nsession_id: 20260421_144500_abcd12\n",
              stderr: ""
            };
          }
        });

        await client.executeStep({
          taskId: "task-cli-timeout",
          stepType: "content_generate",
          allowedPaths: [],
          inputArtifact: {
            project: { name: "CLI Project", documentType: "software_requirement" },
            evidence: [],
            recalledAtoms: [],
            outline: { sections: [{ title: "Section", objective: "Goal" }] },
            template: { requirementIdPrefix: "SWR", sections: [] }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].options.timeout, 240000);
      });
    }
  },
  {
    name: "Hermes agent client emits CLI runtime events with heartbeat and output excerpts",
    run: async () => {
      await withTempConfig(async () => {
        const events = [];
        const client = new HermesAgentClient({
          transport: "cli",
          timeoutMs: 500,
          heartbeatIntervalMs: 10,
          commandRunner: async () => {
            await new Promise((resolve) => setTimeout(resolve, 35));
            return {
              stdout:
                "{\"summary\":\"CLI outline\",\"sections\":[{\"title\":\"Functional behavior\",\"objective\":\"Describe charging state\",\"evidenceKeys\":[]}]}\n\nsession_id: 20260421_144530_heartbeat\n",
              stderr: "tool summary stderr"
            };
          }
        });

        const response = await client.executeStep(
          {
            taskId: "task-cli-events",
            stepType: "outline_build",
            allowedPaths: [],
            inputArtifact: {
              recalledAtoms: [{ skillCode: "charging_rule", title: "Charging rule", content: "Write at behavior level." }],
              evidence: [{ fileName: "Chrg.c", fileRole: "generatedCode", location: "line 1", excerpt: "chargeState = 1;" }]
            },
            skillInventory: { items: [] },
            llmProfileSnapshot: null
          },
          {
            onEvent(event) {
              events.push(event);
            }
          }
        );

        assert.equal(response.sessionId, "20260421_144530_heartbeat");
        assert.ok(events.some((event) => event.status === "started"));
        assert.ok(events.some((event) => event.status === "heartbeat"));
        const completed = events.find((event) => event.status === "completed");
        assert.ok(completed);
        assert.equal(completed.sessionId, "20260421_144530_heartbeat");
        assert.match(completed.stdoutExcerpt || "", /CLI outline/);
        assert.match(completed.stderrExcerpt || "", /tool summary stderr/);
      });
    }
  },
  {
    name: "Project service serializes concurrent generation task updates to preserve terminal status",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Task Update Serialization Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });
        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "running",
          summary: "正在调用本机 Hermes 生成正式内容",
          progress: {
            stage: "content_generate",
            label: "正在调用本机 Hermes 生成正式内容",
            message: "等待模型返回",
            percent: 82
          }
        });

        const originalSaveProject = projectService.saveProject.bind(projectService);
        let saveInvocationCount = 0;
        projectService.saveProject = async (inputProject) => {
          saveInvocationCount += 1;
          if (saveInvocationCount === 1) {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          return originalSaveProject(inputProject);
        };

        const staleRunningUpdate = projectService.updateGenerationTask(project.id, module.id, "software_requirement", task.id, {
          progress: {
            stage: "content_generate",
            label: "正在调用本机 Hermes 生成正式内容",
            message: "旧心跳仍在写回",
            percent: 82
          },
          debugEvent: {
            stage: "content_generate",
            label: "Hermes CLI 仍在运行",
            message: "模拟旧 heartbeat 写回。",
            level: "info"
          }
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const failedUpdate = projectService.updateGenerationTask(project.id, module.id, "software_requirement", task.id, {
          status: "failed",
          errorMessage: "Hermes generated a sourceRef outside the extracted evidence set",
          summary: "Hermes generated a sourceRef outside the extracted evidence set",
          progress: {
            stage: "failed",
            label: "任务执行失败",
            message: "Hermes generated a sourceRef outside the extracted evidence set",
            percent: 100
          },
          timelineEntry: {
            stage: "failed",
            label: "任务失败",
            message: "Hermes generated a sourceRef outside the extracted evidence set",
            level: "error"
          }
        });

        await Promise.all([staleRunningUpdate, failedUpdate]);

        const persisted = await projectService.getGenerationTask(project.id, module.id, "software_requirement", task.id);
        assert.equal(persisted.status, "failed");
        assert.equal(persisted.errorMessage, "Hermes generated a sourceRef outside the extracted evidence set");
        assert.equal(persisted.progress.stage, "failed");
        assert.equal(persisted.progress.percent, 100);
        assert.equal(persisted.summary, "Hermes generated a sourceRef outside the extracted evidence set");
      });
    }
  },
  {
    name: "Hermes agent client reports invalid CLI JSON responses clearly",
    run: async () => {
      await withTempConfig(async () => {
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async () => ({
            stdout: "not-json\n\nsession_id: 20260421_144501_badbad\n",
            stderr: ""
          })
        });

        await assert.rejects(
          () =>
            client.executeStep({
              taskId: "task-cli-invalid",
              stepType: "outline_build",
              allowedPaths: [],
              inputArtifact: { recalledAtoms: [], evidence: [] },
              skillInventory: { items: [] },
              llmProfileSnapshot: null
            }),
          (error) => {
            assert.equal(error.code, "hermes_invalid_response");
            assert.match(error.message, /JSON/i);
            return true;
          }
        );
      });
    }
  },
  {
    name: "App startup marks stale running generation tasks as failed",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Recovery Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });
        const staleTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
        await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          id: "stale-task",
          status: "running",
          summary: "正在生成软件需求",
          progress: {
            stage: "content_generate",
            label: "正在生成",
            message: "长时间未完成",
            percent: 68,
            updatedAt: staleTime
          },
          timeline: [
            {
              at: staleTime,
              stage: "content_generate",
              label: "正在生成",
              message: "长时间未完成",
              level: "info"
            }
          ],
          createdAt: staleTime,
          updatedAt: staleTime
        });

        await createApp();

        const refreshedTask = await projectService.getGenerationTask(
          project.id,
          module.id,
          "software_requirement",
          "stale-task"
        );
        assert.equal(refreshedTask.status, "failed");
        assert.match(refreshedTask.errorMessage, /恢复|重启|中断/);
        assert.equal(refreshedTask.progress.stage, "failed");
      });
    }
  },
  {
    name: "Generation task API exposes latest task shortcut",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Latest Task Project" });
        const module = await projectService.createModule(project.id, {
          name: "Latest Task Module",
          moduleSkillKey: "charging_management"
        });

        await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          id: "older-task",
          status: "failed",
          summary: "older",
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z"
        });
        await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          id: "latest-task",
          status: "running",
          summary: "latest",
          createdAt: "2026-04-21T00:00:00.000Z",
          updatedAt: "2026-04-21T00:00:00.000Z"
        });

        await withTestServer(async ({ baseUrl }) => {
          const response = await fetch(
            `${baseUrl}/api/projects/${project.id}/modules/${module.id}/spaces/software_requirement/tasks/latest`
          );
          assert.equal(response.status, 200);
          const task = await response.json();
          assert.equal(task.id, "latest-task");
          assert.equal(task.summary, "latest");
        });
      });
    }
  },
  {
    name: "Pipeline service runs software requirement generation through Hermes workflow",
    run: async () => {
      await withTempConfig(async () => {
        await withHermesServer(async ({ baseUrl }) => {
          config.hermes.baseURL = baseUrl;
          const projectService = new ProjectService();
          const pipelineService = new PipelineService(projectService);

          const project = await projectService.createProject({ name: "Agent Validation Workspace" });
          const module = await projectService.createModule(project.id, {
            name: "Charging Management",
            moduleSkillKey: "charging_management"
          });

          const uploadDir = path.join(config.uploadDir, project.id, module.id);
          await fs.mkdir(uploadDir, { recursive: true });
          const systemFilePath = path.join(uploadDir, "charging-system.md");
          const modelFilePath = path.join(uploadDir, "charging-model.c");
          const referenceFilePath = path.join(uploadDir, "charging-reference.md");
          await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");
          await fs.writeFile(modelFilePath, "void Charging_step(void) { chargeState = 1; }", "utf8");
          await fs.writeFile(referenceFilePath, "软件应在充电使能时输出充电状态信号。", "utf8");

          await projectService.attachModuleAssets(project.id, module.id, {
            systemPdf: [
              {
                originalname: "charging-system.md",
                filename: "charging-system.md",
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
                originalname: "charging-reference.md",
                filename: "charging-reference.md",
                path: referenceFilePath,
                mimetype: "text/markdown",
                size: 27
              }
            ]
          });

          const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {});
          assert.equal(result.task.status, "completed");
          assert.ok(result.task.resultItems.length >= 1);
          assert.ok(result.task.extractions.length >= 1);
          assert.ok(result.task.metrics.extractionEvidenceCount >= 1);

          const stages = (result.task.timeline || []).map((entry) => entry.stage);
          assert.ok(stages.includes("task_init"));
          assert.ok(stages.includes("effective_skill_resolve"));
          assert.ok(stages.includes("material_extract"));
          assert.ok(stages.includes("atom_recall"));
          assert.ok(stages.includes("outline_build"));
          assert.ok(stages.includes("content_generate"));
          assert.ok(stages.includes("rule_validate"));
          assert.ok(stages.includes("persist_result"));

          assert.ok((result.task.resultItems[0].sourceRefs || []).length >= 1);
          assert.equal(result.task.progress.stage, "completed");
        });
      });
    }
  },
  {
    name: "Pipeline service marks task failed immediately when Hermes CLI step times out",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);

        pipelineService.hermesAgentClient.transport = "cli";
        pipelineService.hermesAgentClient.executeStep = async (_payload, runtime = {}) => {
          await runtime.onEvent?.({
            type: "agent_runtime",
            transport: "cli",
            stepType: "outline_build",
            status: "failed",
            level: "error",
            label: "Hermes CLI 请求超时",
            message: "Hermes CLI request timed out after 15000ms",
            startedAt: "2026-04-21T07:26:05.043Z",
            elapsedMs: 15000
          });
          const error = new Error("Hermes CLI request timed out after 15000ms");
          error.code = "hermes_timeout";
          throw error;
        };

        const project = await projectService.createProject({ name: "CLI Failure Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "charging-system.md");
        const modelFilePath = path.join(uploadDir, "charging-model.c");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");
        await fs.writeFile(modelFilePath, "void Charging_step(void) { chargeState = 1; }", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "charging-system.md",
              filename: "charging-system.md",
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
          ]
        });

        await assert.rejects(
          () => pipelineService.generateForModule(project.id, module.id, "software_requirement", {}),
          /timed out/
        );

        const task = await projectService.getLatestGenerationTask(project.id, module.id, "software_requirement");
        assert.equal(task.status, "failed");
        assert.equal(task.progress.stage, "failed");
        assert.match(task.errorMessage, /timed out/);
        assert.equal(task.debug.agent.status, "failed");
        assert.equal(task.debug.agent.currentStep, "outline_build");
        assert.match(task.debug.events.at(-1)?.message || "", /timed out/);
      });
    }
  },
  {
    name: "Project and pipeline services support module tasks and accepted result snapshots",
    run: async () => {
      await withTempConfig(async () => {
        await withHermesServer(async ({ baseUrl }) => {
          config.hermes.baseURL = baseUrl;
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
          targetArea: "validation",
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
          targetArea: "writing",
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
          targetArea: "writing",
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
  },
  {
    name: "Replay task automatically creates a skill work order",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const workOrderService = new SkillWorkOrderService();

        const project = await projectService.createProject({ name: "Work Order Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          description: "负责回投工单测试",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-work-order-1",
              requirementId: "SWR-501",
              title: "充电截止 SOC 记忆",
              requirementText: "软件应记忆充电截止 SOC。",
              type: "functional",
              confidence: 0.74,
              verificationHint: "检查记忆与刷新行为",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: [],
          llmProfile: { id: "profile-work-order", name: "Replay Mock" }
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-work-order-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonTags: ["实现细节混入"],
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "writing",
          expectedNote: "请回到人工范例边界，只保留记忆和刷新要求。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        assert.ok(replayTask.workOrderId);
        assert.ok(replayTask.workOrderSummary);
        assert.ok(replayTask.materialPack.effectiveSkillSnapshot.hash);
        assert.ok(replayTask.materialPack.effectiveSkillSnapshot.files["requirement_validation.md"] !== undefined);

        const workOrder = await workOrderService.getWorkOrder(replayTask.workOrderId);
        assert.equal(workOrder.sourceTaskId, replayTask.id);
        assert.equal(workOrder.moduleName, "充电管理");
        assert.equal(workOrder.status, "pending_review");
        assert.ok(workOrder.items.length >= 1);
        assert.ok(Array.isArray(workOrder.validatorSuggestions));
      });
    }
  },
  {
    name: "Replay task persists failed record when selected replay LLM request fails",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay LLM Fallback Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-llm-fallback-1",
              requirementId: "SWR-551",
              title: "充电截止 SOC 记忆",
              requirementText: "软件应记忆充电截止 SOC。",
              type: "functional",
              confidence: 0.74,
              verificationHint: "检查记忆与刷新行为",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-llm-fallback-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "writing",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
          throw new Error("simulated network down");
        };

        const originalResolveProfile = replayTaskService.llmService.profileService.resolveProfile.bind(replayTaskService.llmService.profileService);
        replayTaskService.llmService.profileService.resolveProfile = async () => ({
          id: "remote-profile",
          provider: "zhipu",
          name: "Remote Replay Model",
          model: "glm-test",
          apiKey: "fake-key",
          baseURL: "https://example.invalid/v1"
        });

        try {
          const replayTask = await replayTaskService.createTask({
            rejectionIds: [records[0].id],
            projectId: project.id,
            moduleId: module.id,
            llmProfileId: "remote-profile"
          });

          assert.equal(replayTask.llmProfileId, "remote-profile");
          assert.equal(replayTask.taskStatus, "failed");
          assert.equal(replayTask.summary, "Replay 提案生成失败");
          assert.equal(replayTask.errorMessage, "simulated network down");
          assert.deepEqual(replayTask.proposals, []);
          assert.equal(replayTask.workOrderId, undefined);

          const persistedTask = await replayTaskService.getTask(replayTask.id);
          assert.equal(persistedTask.taskStatus, "failed");
          assert.equal(persistedTask.errorMessage, "simulated network down");

          const persistedRecord = await rejectionService.getRecord(records[0].id);
          assert.equal(persistedRecord.replayStatus, "failed");
          assert.equal(persistedRecord.replayCount, 1);
          assert.deepEqual(persistedRecord.replayTaskIds, [replayTask.id]);
        } finally {
          globalThis.fetch = originalFetch;
          replayTaskService.llmService.profileService.resolveProfile = originalResolveProfile;
        }
      });
    }
  },
  {
    name: "Skill work order falls back to replay proposal items when generated items are empty",
    run: async () => {
      await withTempConfig(async () => {
        const workOrderService = new SkillWorkOrderService();
        const task = {
          id: "replay-task-fallback-items",
          projectId: "project-1",
          projectName: "Replay Project",
          moduleId: "module-1",
          moduleName: "充电管理",
          llmProfileId: "profile-1",
          sourceRejectionIds: ["rej-1"],
          materialPack: {
            moduleContext: {
              documentType: "software_requirement"
            },
            rejectionSnapshots: [
              {
                id: "rej-1",
                requirementCode: "CheryVCU-12147",
                reasonCategory: "coverage_gap",
                reasonText: "生成结果引入了人工范例中没有的回退逻辑",
                expectedNote: "请仅保留记忆与更新要求"
              }
            ]
          },
          proposals: [
            {
              id: "proposal-1",
              items: [
                {
                  proposalItemId: "proposal-item-1",
                  action: "add_skill_item",
                  targetSkillCode: "",
                  targetLayer: "docType",
                  targetProfileKey: "software_requirement",
                  kind: "validation_rule",
                  title: "coverage_gap补充规则",
                  rationale: "需要增加边界约束",
                  before: "",
                  after: "不要把代码推断的兜底逻辑写入记忆类需求。",
                  evidenceRefs: ["rej-1"]
                }
              ]
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const workOrder = await workOrderService.createFromReplayTask(task, {
          summary: "仅生成校验建议",
          decisionSummary: "",
          items: [],
          validatorSuggestions: [
            {
              title: "需求边界校验",
              ruleText: "补充需求边界校验",
              why: "避免过度推断"
            }
          ]
        });

        assert.equal(workOrder.items.length, 1);
        assert.equal(workOrder.items[0].conclusionType, "create_new");
        assert.equal(workOrder.items[0].targetLayer, "docType");
        assert.equal(workOrder.items[0].targetProfileKey, "software_requirement");
        assert.equal(workOrder.items[0].targetKind, "validation_rule");
        assert.equal(workOrder.itemStats.total, 1);
        assert.equal(workOrder.itemStats.validatorOnly, 1);
      });
    }
  },
  {
    name: "Skill work order preserves prompt-generated scope and abstraction metadata",
    run: async () => {
      await withTempConfig(async () => {
        const workOrderService = new SkillWorkOrderService();
        const task = {
          id: "replay-task-scope-metadata",
          projectId: "project-1",
          projectName: "Replay Project",
          moduleId: "module-1",
          moduleName: "充电管理",
          llmProfileId: "profile-1",
          sourceRejectionIds: ["rej-1"],
          materialPack: {
            moduleContext: {
              documentType: "software_requirement",
              moduleName: "充电管理",
              moduleSkillKey: "charging_management"
            },
            rejectionSnapshots: [
              {
                id: "rej-1",
                requirementCode: "CheryVCU-12147",
                reasonCategory: "coverage_gap",
                reasonText: "生成结果混入了不属于记忆条目的控制逻辑",
                expectedNote: "请沉淀为模块级边界约束"
              }
            ]
          }
        };

        const workOrder = await workOrderService.createFromReplayTask(task, {
          summary: "模型已生成模块级技能建议",
          decisionSummary: "建议沉淀为充电管理模块级 validation_rule。",
          items: [
            {
              conclusionType: "create_new",
              action: "add_skill_item",
              targetLayer: "module",
              targetProfileKey: "charging_management",
              targetKind: "validation_rule",
              kind: "validation_rule",
              title: "充电截止SOC记忆类需求边界约束",
              whyCurrent: "当前规则缺少对记忆类需求边界的限制。",
              whyChange: "补充模块级边界约束后，可避免把控制/保护逻辑混入记忆条目。",
              afterContent:
                "对于充电管理模块中与充电截止SOC相关的记忆类需求，若人工范例仅描述“下电记忆、设置更新生效、下次下电继续记忆”这类行为，则不得补写无效值处理、默认值回退、范围兜底或重新插枪判断等控制/保护逻辑。此类逻辑应保留在截止SOC控制条目中，除非系统需求或人工范例中存在明确独立表述。",
              evidenceRefs: ["rej-1"],
              scopeDecision: "module",
              scopeReason: "当前建议依赖具体模块语义，应沉淀到模块层。",
              scopeConfidence: 0.88,
              abstractionScore: 0.91,
              isParaphraseOfRejection: false,
              reviewReadiness: "ready_to_apply",
              reuseJudgement: "module_specific",
              ruleIntent: "约束充电管理模块内记忆类需求的表达边界。"
            }
          ],
          validatorSuggestions: []
        });

        assert.equal(workOrder.items.length, 1);
        assert.equal(workOrder.items[0].targetLayer, "module");
        assert.equal(workOrder.items[0].targetProfileKey, "charging_management");
        assert.equal(workOrder.items[0].scopeDecision, "module");
        assert.equal(workOrder.items[0].reviewReadiness, "ready_to_apply");
        assert.equal(workOrder.items[0].isParaphraseOfRejection, false);
        assert.match(workOrder.items[0].afterContent, /充电截止SOC相关的记忆类需求/);
      });
    }
  },
  {
    name: "Skill work order accepts multiple replay proposal items",
    run: async () => {
      await withTempConfig(async () => {
        const workOrderService = new SkillWorkOrderService();
        const task = {
          id: "replay-task-multi-items",
          projectId: "project-1",
          projectName: "Replay Project",
          moduleId: "module-1",
          moduleName: "充电管理",
          llmProfileId: "profile-1",
          sourceRejectionIds: ["rej-1"],
          materialPack: {
            moduleContext: {
              documentType: "software_requirement"
            },
            rejectionSnapshots: [
              {
                id: "rej-1",
                requirementCode: "CheryVCU-12147",
                reasonCategory: "coverage_gap",
                reasonText: "生成结果同时混入边界漂移和写法偏移。",
                expectedNote: "请拆成独立 skill 修改项处理。"
              }
            ]
          }
        };

        const workOrder = await workOrderService.createFromReplayTask(task, {
          summary: "模型返回多个技能修改项",
          decisionSummary: "建议分别修改 existing skill 和新增模块边界规则。",
          items: [
            {
              conclusionType: "modify_existing",
              action: "modify_skill_item",
              targetSkillCode: "DOC-software_requirement-validation_rule-010",
              targetLayer: "docType",
              targetProfileKey: "software_requirement",
              targetKind: "validation_rule",
              kind: "validation_rule",
              title: "无依据扩写校验（补充修订）",
              whyCurrent: "当前校验规则没有明确约束记忆类需求边界。",
              whyChange: "补充边界限制后，可以避免把控制逻辑混入记忆条目。",
              beforeContent: "若当前证据只支持核心主题，应避免越界扩写。",
              afterContent: "若当前证据只支持核心主题，应避免越界扩写，尤其不要把控制/保护逻辑混入记忆类需求。",
              evidenceRefs: ["rej-1"]
            },
            {
              conclusionType: "create_new",
              action: "add_skill_item",
              targetLayer: "module",
              targetProfileKey: "charging_management",
              targetKind: "validation_rule",
              kind: "validation_rule",
              title: "充电截止SOC记忆类需求边界约束",
              whyCurrent: "当前模块缺少充电截止SOC记忆类需求的专属边界规则。",
              whyChange: "新增模块级边界规则后，可以稳定约束记忆条目的表达范围。",
              afterContent: "对于充电管理模块中与充电截止SOC相关的记忆类需求，不得补写控制或保护逻辑。",
              evidenceRefs: ["rej-1"]
            }
          ],
          validatorSuggestions: []
        });

        assert.equal(workOrder.items.length, 2);
        assert.equal(workOrder.items[0].conclusionType, "modify_existing");
        assert.equal(workOrder.items[1].conclusionType, "create_new");
        assert.equal(workOrder.itemStats.total, 2);
      });
    }
  },
  {
    name: "Skill work order review and apply updates active atomic skill",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const workOrderService = new SkillWorkOrderService();
        const skillManagementService = new SkillManagementService();

        const project = await projectService.createProject({ name: "Apply Work Order Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          description: "负责工单应用测试",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-apply-1",
              requirementId: "SWR-601",
              title: "充电截止控制",
              requirementText: "软件应控制充电截止逻辑。",
              type: "functional",
              confidence: 0.7,
              verificationHint: "检查截止条件",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: [],
          llmProfile: { id: "profile-apply", name: "Replay Mock" }
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-apply-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "validation_gap",
          reasonTags: ["边界条件"],
          reasonText: "缺少对人工范例边界的约束",
          targetArea: "validation",
          expectedNote: "请增加边界约束，避免额外发挥。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });
        const workOrder = await workOrderService.getWorkOrder(replayTask.workOrderId);
        const item = workOrder.items[0];
        assert.ok(item);

        await workOrderService.reviewItem(workOrder.id, item.itemId, {
          reviewStatus: "accepted",
          reviewComment: "确认应用到 active skill"
        });

        const applied = await workOrderService.applyItem(workOrder.id, item.itemId, {
          appliedBy: "tester"
        });
        assert.equal(applied.item.reviewStatus, "applied");
        assert.ok(applied.item.appliedChange.afterSnapshot);

        const targetSkillCode = applied.item.appliedChange.skillCode;
        const refreshedSkill = await skillManagementService.getSkillItem(targetSkillCode);
        assert.ok(refreshedSkill.item.content.includes("补充约束") || refreshedSkill.item.content.includes("避免"));
        assert.equal(refreshedSkill.item.provenance.sourceTaskId, replayTask.id);

        const refreshedWorkOrder = await workOrderService.getWorkOrder(workOrder.id);
        assert.equal(refreshedWorkOrder.status, "applied");
      });
    }
  },
  {
    name: "Skill work order list rebuilds missing work order files from replay tasks",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const workOrderService = new SkillWorkOrderService();

        const project = await projectService.createProject({ name: "Recovered Work Order Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-rebuild-work-order-1",
              requirementId: "SWR-601",
              title: "充电截止 SOC 记忆",
              requirementText: "软件应记忆充电截止 SOC。",
              type: "functional",
              confidence: 0.81,
              verificationHint: "检查记忆与刷新行为",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-rebuild-work-order-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "writing",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        await fs.rm(path.join(config.skillWorkOrderStoreDir, `${replayTask.workOrderId}.json`), { force: true });

        const workOrders = await workOrderService.listWorkOrders({});

        assert.equal(workOrders.length, 1);
        assert.equal(workOrders[0].id, replayTask.workOrderId);

        const rebuilt = await workOrderService.getWorkOrder(replayTask.workOrderId);
        assert.equal(rebuilt.sourceTaskId, replayTask.id);

        const restoredFile = await fs
          .access(path.join(config.skillWorkOrderStoreDir, `${replayTask.workOrderId}.json`))
          .then(() => true)
          .catch(() => false);
        assert.equal(restoredFile, true);
      });
    }
  },
  {
    name: "Skill work order list synthesizes missing work orders for legacy replay tasks without workOrderId",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const workOrderService = new SkillWorkOrderService();

        const project = await projectService.createProject({ name: "Legacy Replay Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-legacy-work-order-1",
              requirementId: "SWR-701",
              title: "充电截止 SOC 记忆",
              requirementText: "软件应记忆充电截止 SOC。",
              type: "functional",
              confidence: 0.79,
              verificationHint: "检查记忆与刷新行为",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-legacy-work-order-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "writing",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        await fs.rm(path.join(config.skillWorkOrderStoreDir, `${replayTask.workOrderId}.json`), { force: true });
        replayTask.workOrderId = "";
        replayTask.workOrderSummary = null;
        await fs.writeFile(path.join(config.replayTaskStoreDir, `${replayTask.id}.json`), JSON.stringify(replayTask, null, 2), "utf8");

        const workOrders = await workOrderService.listWorkOrders({});

        assert.equal(workOrders.length, 1);
        assert.ok(workOrders[0].id);

        const repairedTask = JSON.parse(await fs.readFile(path.join(config.replayTaskStoreDir, `${replayTask.id}.json`), "utf8"));
        assert.equal(repairedTask.id, replayTask.id);
        assert.ok(repairedTask.workOrderId);
        assert.ok(repairedTask.workOrderSummary);

        const rebuilt = await workOrderService.getWorkOrder(repairedTask.workOrderId);
        assert.equal(rebuilt.sourceTaskId, replayTask.id);
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

        const restartedBundleService = new SkillBundleService();
        await restartedBundleService.ensureInitialized();

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
    name: "Skill management service refreshes SQLite after external registry edits",
    run: async () => {
      await withTempConfig(async () => {
        const service = new SkillManagementService();

        const initial = await service.getSkillDetail("module", "charging_management");
        assert.equal(initial.skillItems.length, 1);

        const registryPath = path.join(
          config.activeSkillDir,
          "profiles",
          "modules",
          "charging_management",
          "skill-items.json"
        );
        const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
        registry.items.push({
          kind: "validation_rule",
          title: "充电管理边界校验",
          content: "当充电限值条件不满足时，软件应保持原状态并给出明确边界。",
          status: "active",
          order: registry.items.length + 1
        });

        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");

        const refreshed = await service.getSkillDetail("module", "charging_management");
        assert.equal(refreshed.skillItems.length, 2);
        assert.ok(refreshed.skillItems.some((item) => item.kind === "validation_rule"));
      });
    }
  },
  {
    name: "Skill registry rebuild recovers from orphaned SQLite rows",
    run: async () => {
      await withTempConfig(async () => {
        const databaseService = new SkillDatabaseService();
        const registryService = new SkillManagementService().registryService;

        const initialRegistries = await registryService.importActiveRegistriesFromFiles(config.activeSkillDir);
        databaseService.importRegistries(initialRegistries);

        databaseService.db.exec("PRAGMA foreign_keys = OFF");
        const orphanProfile = databaseService.db
          .prepare(
            `
              INSERT INTO profiles(version, layer, profile_key, display_name, document_type_scope, status, created_at, updated_at)
              VALUES(1, 'module', 'orphan_module', 'Orphan Module', '', 'active', ?, ?)
              RETURNING id
            `
          )
          .get(new Date().toISOString(), new Date().toISOString());
        databaseService.db
          .prepare(
            `
              INSERT INTO skill_items(
                profile_id, skill_code, kind, title, content, status, order_index, section_key,
                provenance_json, review_json, structured_payload_json, created_at, updated_at
              )
              VALUES(?, 'MOD-orphan_module-validation_rule-001', 'validation_rule', 'orphan', 'orphan', 'active', 1, 'default', '{}', '{}', NULL, ?, ?)
            `
          )
          .run(orphanProfile.id, new Date().toISOString(), new Date().toISOString());
        databaseService.db.prepare("DELETE FROM profiles WHERE id = ?").run(orphanProfile.id);
        databaseService.db.exec("PRAGMA foreign_keys = ON");

        await assert.doesNotReject(async () => {
          await registryService.rebuildDatabaseFromFiles(config.activeSkillDir);
        });

        const fkViolations = databaseService.db.prepare("PRAGMA foreign_key_check").all();
        assert.equal(fkViolations.length, 0);
        assert.equal(databaseService.getItem("MOD-orphan_module-validation_rule-001"), null);
      });
    }
  },
  {
    name: "Feedback ticket service stores issue detail and uploaded image metadata",
    run: async () => {
      await withTempConfig(async () => {
        const service = new FeedbackTicketService();

        const created = await service.createTicket(
          {
            title: "结果页按钮状态不清晰",
            detail: "在任务详情页里，接受和驳回按钮的状态切换不够直观，建议增强反馈。",
            pagePath: "/projects/demo/modules/demo/tasks/task-1",
            pageTitle: "任务详情"
          },
          [
            {
              originalname: "issue-shot.png",
              filename: "1710000000000-issue-shot.png",
              mimetype: "image/png",
              size: 2048,
              path: path.join(config.feedbackTicketUploadDir, "1710000000000-issue-shot.png")
            }
          ]
        );

        assert.equal(created.title, "结果页按钮状态不清晰");
        assert.equal(created.pagePath, "/projects/demo/modules/demo/tasks/task-1");
        assert.equal(created.attachments.length, 1);
        assert.equal(created.attachments[0].mimeType, "image/png");
        assert.equal(created.attachments[0].relativePath, "feedback-tickets/1710000000000-issue-shot.png");

        const listed = await service.listTickets();
        assert.equal(listed.length, 1);
        assert.equal(listed[0].id, created.id);
      });
    }
  },
  {
    name: "Feedback ticket API exposes read-only ticket list and attachment preview urls",
    run: async () => {
      await withTempConfig(async () => {
        const service = new FeedbackTicketService();

        const firstFileName = "1710000000000-issue-shot.png";
        const secondFileName = "1710000000001-issue-shot.png";

        await fs.writeFile(path.join(config.feedbackTicketUploadDir, firstFileName), "first-image", "utf8");
        const first = await service.createTicket(
          {
            title: "任务详情页需要更清晰的状态提示",
            detail: "驳回和接受后的反馈提示不够明显。",
            pagePath: "/projects/demo/modules/demo/tasks/task-1",
            pageTitle: "任务详情"
          },
          [
            {
              originalname: "issue-shot.png",
              filename: firstFileName,
              mimetype: "image/png",
              size: 2048,
              path: path.join(config.feedbackTicketUploadDir, firstFileName)
            }
          ]
        );

        await new Promise((resolve) => setTimeout(resolve, 12));

        await fs.writeFile(path.join(config.feedbackTicketUploadDir, secondFileName), "second-image", "utf8");
        const second = await service.createTicket(
          {
            title: "模块页操作区层级有点乱",
            detail: "希望把入口信息再收束一点，避免操作按钮太散。",
            pagePath: "/projects/demo/modules/demo",
            pageTitle: "模块详情"
          },
          [
            {
              originalname: "module-shot.png",
              filename: secondFileName,
              mimetype: "image/png",
              size: 1024,
              path: path.join(config.feedbackTicketUploadDir, secondFileName)
            }
          ]
        );

        await withTestServer(async ({ baseUrl }) => {
          const response = await fetch(`${baseUrl}/api/feedback-tickets`);
          assert.equal(response.status, 200);
          const tickets = await response.json();

          assert.equal(tickets.length, 2);
          assert.equal(tickets[0].id, second.id);
          assert.equal(tickets[1].id, first.id);
          assert.equal(tickets[0].attachments[0].url, `/feedback-ticket-assets/${secondFileName}`);

          const assetResponse = await fetch(`${baseUrl}${tickets[0].attachments[0].url}`);
          assert.equal(assetResponse.status, 200);
          assert.equal(await assetResponse.text(), "second-image");

          await fs.writeFile(path.join(config.uploadDir, "outside.txt"), "outside", "utf8");
          const hiddenResponse = await fetch(`${baseUrl}/feedback-ticket-assets/outside.txt`);
          assert.equal(hiddenResponse.status, 404);
        });
      });
    }
  },
  {
    name: "Structured policy skills can be stored as plain readable text without raw JSON input",
    run: async () => {
      await withTempConfig(async () => {
        const service = new SkillManagementService();
        const created = await service.createSkillItem({
          layer: "docType",
          profileKey: "software_requirement",
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
  },
  {
    name: "Skill management service rejects invalid layer and kind combinations on create and update",
    run: async () => {
      await withTempConfig(async () => {
        const service = new SkillManagementService();

        await assert.rejects(
          () =>
            service.createSkillItem({
              layer: "generic",
              profileKey: "generic",
              kind: "good_example",
              title: "非法 generic 正例",
              content: "这条组合不应该被允许。"
            }),
          (error) => error?.code === "skill_kind_not_allowed_for_layer"
        );

        const created = await service.createSkillItem({
          layer: "module",
          profileKey: "charging_management",
          kind: "validation_rule",
          title: "合法模块校验规则",
          content: "先创建一条合法规则。"
        });

        await assert.rejects(
          () =>
            service.updateSkillItem(created.skillCode, {
              layer: "module",
              kind: "document_blueprint_policy"
            }),
          (error) => error?.code === "skill_kind_not_allowed_for_layer"
        );
      });
    }
  },
  {
    name: "Replay proposal review rejects kinds outside current layer matrix",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Matrix Guard Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-matrix-guard-1",
              requirementId: "SWR-801",
              title: "充电管理前置条件",
              requirementText: "软件应满足充电前置条件。",
              type: "functional",
              confidence: 0.84,
              verificationHint: "检查模块级前置条件",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-matrix-guard-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "coverage_gap",
          reasonText: "缺少模块级前置条件。",
          targetArea: "validation",
          targetLayerConstraint: "module",
          expectedNote: "请补充模块层校验约束。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        const proposalItem = replayTask.proposals[0].items[0];
        await assert.rejects(
          () =>
            replayTaskService.reviewProposalItem(replayTask.id, proposalItem.proposalItemId, {
              status: "edited",
              editedPayload: {
                targetLayer: "module",
                targetProfileKey: "charging_management",
                kind: "document_blueprint_policy",
                after: "非法 layer-kind 组合"
              }
            }),
          /Unsupported proposal kind for target layer|Unsupported proposal kind for current target area and target layer/
        );
      });
    }
  },
  {
    name: "Skill work order review and apply reject invalid layer and kind combinations",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const workOrderService = new SkillWorkOrderService();

        const project = await projectService.createProject({ name: "Work Order Matrix Guard Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-work-order-matrix-1",
              requirementId: "SWR-901",
              title: "充电管理正文边界",
              requirementText: "软件应遵循充电管理模块边界。",
              type: "functional",
              confidence: 0.82,
              verificationHint: "检查模块边界",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-work-order-matrix-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "coverage_gap",
          reasonText: "模块边界缺少约束。",
          targetArea: "validation",
          targetLayerConstraint: "module",
          expectedNote: "请新增模块级校验规则。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });
        const workOrder = await workOrderService.getWorkOrder(replayTask.workOrderId);
        const item = workOrder.items[0];

        await assert.rejects(
          () =>
            workOrderService.reviewItem(workOrder.id, item.itemId, {
              reviewStatus: "accepted",
              editedPayload: {
                targetLayer: "module",
                targetProfileKey: "charging_management",
                targetKind: "document_blueprint_policy",
                afterContent: "非法工单编辑"
              }
            }),
          (error) => error?.code === "skill_kind_not_allowed_for_layer"
        );

        await workOrderService.reviewItem(workOrder.id, item.itemId, {
          reviewStatus: "accepted",
          reviewComment: "先接受原始合法项"
        });

        await workOrderService.reviewItem(workOrder.id, item.itemId, {
          reviewStatus: "edited",
          editedPayload: {
            targetLayer: item.targetLayer,
            targetProfileKey: item.targetProfileKey,
            targetKind: item.targetKind,
            afterContent: item.afterContent || item.recommendedSkillText || "合法内容"
          }
        });

        const stored = await workOrderService.getWorkOrder(workOrder.id);
        const storedItem = stored.items.find((entry) => entry.itemId === item.itemId);
        storedItem.editedPayload.targetKind = "document_blueprint_policy";
        await fs.writeFile(path.join(config.skillWorkOrderStoreDir, `${workOrder.id}.json`), JSON.stringify(stored, null, 2), "utf8");

        await assert.rejects(
          () =>
            workOrderService.applyItem(workOrder.id, item.itemId, {
              appliedBy: "tester"
            }),
          (error) => error?.code === "skill_kind_not_allowed_for_layer"
        );
      });
    }
  },
  {
    name: "Wiki site loads navigation metadata and markdown pages for user-facing docs",
    run: async () => {
      await withTempConfig(async (tempDir) => {
        await seedWikiFixture(tempDir);
        const { loadWikiSite } = await import("../src/wiki/site-service.js");

        const site = await loadWikiSite();

        assert.equal(site.site.title, "软件文档平台 Wiki");
        assert.equal(site.site.homePage.slug, "home");
        assert.deepEqual(
          site.site.featuredPages.map((page) => page.slug),
          ["quick-start", "requirement-generation", "skill-management-fallback"]
        );
        assert.equal(site.pagesBySlug.get("faq").relatedPages[0].slug, "quick-start");
        assert.ok(site.pagesBySlug.get("quick-start").html.includes("<ol>"));
      });
    }
  },
  {
    name: "Wiki service has dedicated start stop restart scripts for shell and Windows",
    run: async () => {
      const rootFiles = [
        "start-wiki.cmd",
        "stop-wiki.cmd",
        "restart-wiki.cmd",
        "启动Wiki.command",
        "终止Wiki.command",
        "重启Wiki.command",
        "restart-wiki.sh"
      ];

      for (const fileName of rootFiles) {
        const filePath = path.join(config.rootDir, fileName);
        const content = await fs.readFile(filePath, "utf8");
        assert.ok(content.length > 0, `${fileName} should not be empty`);
      }

      const commandStartWindows = await fs.readFile(path.join(config.rootDir, "start-wiki.cmd"), "utf8");
      const commandStopWindows = await fs.readFile(path.join(config.rootDir, "stop-wiki.cmd"), "utf8");
      const commandRestartWindows = await fs.readFile(path.join(config.rootDir, "restart-wiki.cmd"), "utf8");
      const commandStart = await fs.readFile(path.join(config.rootDir, "启动Wiki.command"), "utf8");
      const commandStop = await fs.readFile(path.join(config.rootDir, "终止Wiki.command"), "utf8");
      const commandRestart = await fs.readFile(path.join(config.rootDir, "重启Wiki.command"), "utf8");
      const restartWrapper = await fs.readFile(path.join(config.rootDir, "restart-wiki.sh"), "utf8");
      const startScriptWindows = await fs.readFile(path.join(config.rootDir, "scripts", "start-wiki.ps1"), "utf8");
      const stopScriptWindows = await fs.readFile(path.join(config.rootDir, "scripts", "stop-wiki.ps1"), "utf8");
      const restartScriptWindows = await fs.readFile(path.join(config.rootDir, "scripts", "restart-wiki.ps1"), "utf8");
      const restartScript = await fs.readFile(path.join(config.rootDir, "scripts", "restart-wiki.sh"), "utf8");

      assert.ok(commandStartWindows.includes("scripts\\start-wiki.ps1"));
      assert.ok(commandStopWindows.includes("scripts\\stop-wiki.ps1"));
      assert.ok(commandRestartWindows.includes("scripts\\restart-wiki.ps1"));
      assert.ok(commandStart.includes("scripts/start-wiki.sh"));
      assert.ok(commandStop.includes("scripts/stop-wiki.sh"));
      assert.ok(commandRestart.includes("scripts/restart-wiki.sh"));
      assert.ok(commandStart.includes("wait_for_key_and_close"));
      assert.ok(commandStop.includes("wait_for_key_and_close"));
      assert.ok(commandRestart.includes("wait_for_key_and_close"));
      assert.ok(restartWrapper.includes("scripts/restart-wiki.sh"));
      assert.ok(startScriptWindows.includes("src/wiki-server.js"));
      assert.ok(startScriptWindows.includes("/health"));
      assert.ok(startScriptWindows.includes("wiki.pid"));
      assert.ok(stopScriptWindows.includes("wiki.pid"));
      assert.ok(restartScriptWindows.includes("stop-wiki.ps1"));
      assert.ok(restartScriptWindows.includes("start-wiki.ps1"));
      assert.ok(restartScript.includes("stop-wiki.sh"));
      assert.ok(restartScript.includes("start-wiki.sh"));
    }
  },
  {
    name: "Wiki site validation reports missing pages and broken related references",
    run: async () => {
      await withTempConfig(async (tempDir) => {
        await seedWikiFixture(tempDir, {
          navigation: {
            groups: [
              {
                title: "开始使用",
                pages: [
                  {
                    slug: "home",
                    title: "首页",
                    summary: "broken",
                    audience: "系统使用者",
                    status: "stable",
                    lastReviewed: "2026-04-17",
                    relatedPages: ["missing-page"]
                  }
                ]
              }
            ]
          },
          pages: {
            "home.md": "# 首页\n\n请查看 [不存在的页面](/pages/missing-page)。\n"
          }
        });

        const { validateWikiSite } = await import("../src/wiki/site-service.js");

        const result = await validateWikiSite();
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((item) => item.includes("missing-page")));
        assert.ok(result.errors.some((item) => item.includes("/pages/missing-page")));
      });
    }
  },
  {
    name: "Replay Lab loads template with current preview and validation context",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const replayLabService = new ReplayLabService();

        const project = await projectService.createProject({ name: "Replay Lab Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          importedSkillKey: "charging_management"
        });

        await projectService.attachModuleAssets(
          project.id,
          module.id,
          {
            referenceExample: [
              {
                originalname: "charging-example.md",
                mimetype: "text/markdown",
                size: 42,
                filename: "charging-example.md"
              }
            ]
          },
          { documentType: "software_requirement" }
        );

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-lab-1",
              requirementId: "SWR-801",
              title: "Charging request handling",
              requirementText: "Software shall process charging requests.",
              type: "functional",
              confidence: 0.81,
              verificationHint: "Check the request path.",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-lab-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "coverage_gap",
          reasonTags: ["missing_preconditions"],
          reasonText: "Missing code-derived preconditions.",
          targetArea: "validation",
          expectedNote: "Extract stable software-level preconditions.",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id,
          referenceAssetIds: module.assets.map((asset) => asset.id)
        });

        const payload = await replayLabService.getTemplate(replayTask.id);
        assert.equal(payload.templateTask.id, replayTask.id);
        assert.equal(payload.templateTaskSummary.id, replayTask.id);
        assert.ok(payload.templateWorkOrder);
        assert.ok(payload.templatePromptPreview.userPrompt.includes("taskContext"));
        assert.ok(payload.currentPreview.materialPack);
        assert.ok(payload.currentPreview.promptPreview.userPrompt.includes("layerSkillInventory"));
        assert.ok(payload.currentPreview.ruleDiagnostics.after.counts.registry.total > 0);
        assert.equal(payload.validationContext.projectId, project.id);
        assert.equal(payload.validationContext.moduleId, module.id);
        assert.ok(Array.isArray(payload.validationContext.assets));
      });
    }
  },
  {
    name: "Replay Lab rerun refreshes stale rule index and creates a new replay task",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const replayLabService = new ReplayLabService();

        const project = await projectService.createProject({ name: "Replay Lab Rerun Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-lab-rerun-1",
              requirementId: "SWR-901",
              title: "Charging request handling",
              requirementText: "Software shall process charging requests.",
              type: "functional",
              confidence: 0.81,
              verificationHint: "Check control logic.",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-lab-rerun-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "coverage_gap",
          reasonTags: ["missing_preconditions"],
          reasonText: "Missing code-side preconditions.",
          targetArea: "validation",
          expectedNote: "Add stable software preconditions.",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        await fs.writeFile(
          path.join(config.skillRuleDir, "bundle-base.json"),
          JSON.stringify(
            {
              bundleId: "bundle-base",
              ruleIndexVersion: "stale-index",
              importedAt: new Date().toISOString(),
              skillDir: config.activeSkillDir,
              rules: []
            },
            null,
            2
          ),
          "utf8"
        );

        const rerun = await replayLabService.rerunTemplate(replayTask.id);
        assert.notEqual(rerun.task.id, replayTask.id);
        assert.equal(rerun.templateTaskId, replayTask.id);
        assert.ok(rerun.currentPreview.ruleDiagnostics.before);
        assert.ok(rerun.currentPreview.ruleDiagnostics.after);
        assert.ok(rerun.currentPreview.ruleDiagnostics.after.counts.ruleIndex.total > 0);
        assert.equal(rerun.task.materialPack.targetLayerConstraint, "docType");
        assert.ok(Array.isArray(rerun.task.materialPack.layerSkillItems));
        assert.ok(rerun.workOrder);
      });
    }
  },
  {
    name: "Replay Lab run detail returns prompt preview and validation context",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();
        const replayLabService = new ReplayLabService();

        const project = await projectService.createProject({ name: "Replay Lab Run Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-lab-run-1",
              requirementId: "SWR-1001",
              title: "Charging request handling",
              requirementText: "Software shall process charging requests.",
              type: "functional",
              confidence: 0.82,
              verificationHint: "Check functional output.",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-lab-run-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "validation_gap",
          reasonText: "Missing boundary constraints.",
          targetArea: "validation",
          expectedNote: "Add boundary constraints.",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        const payload = await replayLabService.getRun(replayTask.id);
        assert.equal(payload.task.id, replayTask.id);
        assert.ok(payload.workOrder);
        assert.ok(payload.promptPreview.systemPrompt.includes("JSON schema"));
        assert.equal(payload.validationContext.projectId, project.id);
        assert.equal(payload.validationContext.moduleId, module.id);
      });
    }
  },
  {
    name: "Structured rejection stores hard target layer constraint and replay keeps same-layer inventory",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Layer Constraint Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-layer-constraint-1",
              requirementId: "SWR-1101",
              title: "Charging precondition coverage",
              requirementText: "Software shall handle charging-related requests.",
              type: "functional",
              confidence: 0.8,
              verificationHint: "Check that preconditions are expressed.",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-layer-constraint-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "coverage_gap",
          reasonText: "Missing module-specific preconditions.",
          targetArea: "domain_knowledge",
          expectedNote: "Add a stable module-layer rule for these preconditions.",
          targetLayerConstraint: "module",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        assert.equal(records.length, 1);
        assert.equal(records[0].skillContext?.targetLayerConstraint, "module");
        assert.equal(records[0].skillContext?.targetProfileKeyConstraint, "charging_management");

        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id
        });

        assert.equal(replayTask.materialPack.targetLayerConstraint, "module");
        assert.equal(replayTask.materialPack.targetProfileKeyConstraint, "charging_management");
        assert.ok(Array.isArray(replayTask.materialPack.layerSkillItems));
        assert.ok(replayTask.materialPack.layerSkillItems.every((item) => item.layer === "module"));

        const replayMessages = buildReplayModelInput(replayTask.materialPack);
        const userPrompt = replayMessages?.[1]?.content?.[0]?.text || "";
        assert.ok(userPrompt.includes('"targetLayerConstraint": "module"'));
        assert.ok(userPrompt.includes('"layerSkillInventory"'));
      });
    }
  },
  {
    name: "Skill rule snapshot does not truncate same-layer inventory at 20 items",
    run: async () => {
      await withTempConfig(async () => {
        const ruleService = new SkillRuleService();

        const syntheticRules = Array.from({ length: 24 }, (_item, index) => ({
          ruleId: `rule-module-${index + 1}`,
          skillCode: `rule-module-${index + 1}`,
          layer: "module",
          profileKey: "charging_management",
          kind: "validation_rule",
          targetArea: "validation",
          title: `Module Rule ${index + 1}`,
          content: `Rule content ${index + 1}`,
          targetFile: "requirement_validation.md",
          sourcePath: "",
          provenance: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        await fs.writeFile(
          path.join(config.skillRuleDir, "bundle-base.json"),
          JSON.stringify(
            {
              bundleId: "bundle-base",
              ruleIndexVersion: "synthetic-layer-inventory",
              importedAt: new Date().toISOString(),
              skillDir: config.activeSkillDir,
              rules: syntheticRules,
              domainKnowledge: { version: 1, examples: [], ruleHints: [], antiPatterns: [] }
            },
            null,
            2
          ),
          "utf8"
        );

        const snapshot = await ruleService.getRelevantRuleSnapshot(
          "bundle-base",
          ["validation"],
          {
            documentType: "software_requirement",
            domain: "embedded_vcu",
            moduleSkillKey: "charging_management"
          },
          {
            layerConstraint: "module",
            profileKeyConstraint: "charging_management"
          }
        );

        assert.equal(snapshot.length, 24);
        assert.ok(snapshot.every((item) => item.layer === "module"));
      });
    }
  },
  {
    name: "Skill rule index stores repository-relative skillDir without cross-platform path churn",
    run: async () => {
      await withTempConfig(async () => {
        const ruleService = new SkillRuleService();

        const imported = await ruleService.importBundleRules("bundle-base", config.activeSkillDir);
        assert.equal(imported.skillDir, "skills/active");

        const ensured = await ruleService.ensureBundleRuleIndex("bundle-base", config.activeSkillDir);
        assert.equal(ensured.importedAt, imported.importedAt);
        assert.equal(ensured.skillDir, "skills/active");
      });
    }
  },
  {
    name: "Wiki app renders home page, content page, breadcrumbs, and related links",
    run: async () => {
      await withTempConfig(async (tempDir) => {
        await seedWikiFixture(tempDir);
        const { renderWikiPage } = await import("../src/wiki/app.js");
        const { loadWikiSite } = await import("../src/wiki/site-service.js");
        const site = await loadWikiSite();

        const homeHtml = renderWikiPage(site, site.site.homePage);
        assert.ok(homeHtml.includes("软件文档平台 Wiki"));
        assert.ok(homeHtml.includes("推荐阅读路径"));
        assert.ok(homeHtml.includes("/pages/quick-start"));

        const detailHtml = renderWikiPage(site, site.pagesBySlug.get("skill-management-fallback"));
        assert.ok(detailHtml.includes("技能管理与 Fallback"));
        assert.ok(detailHtml.includes("layer × kind"));
        assert.ok(detailHtml.includes("了解系统"));
        assert.ok(detailHtml.includes("相关页面"));
        assert.ok(detailHtml.includes("breadcrumb"));
      });
    }
  },
  {
    name: "Repository wiki includes a dedicated skill overview page",
    run: async () => {
      const { loadWikiSite } = await import("../src/wiki/site-service.js");
      const site = await loadWikiSite();

      const overview = site.pagesBySlug.get("skill-overview");
      assert.ok(overview);
      assert.equal(overview.groupTitle, "高级能力");
      assert.ok(overview.markdown.includes("什么是 skill"));
      assert.ok(overview.markdown.includes("skill 和 LLM"));
      assert.ok(overview.markdown.includes("skill 类目"));
      assert.ok(overview.relatedPages.some((page) => page.slug === "implementation-principles"));
      assert.ok(overview.relatedPages.some((page) => page.slug === "skill-management-fallback"));
    }
  },
  {
    name: "Primary app pages include the global feedback widget assets",
    run: async () => {
      const htmlPages = [
        "index.html",
        "project-create.html",
        "project-detail.html",
        "module-create.html",
        "module-detail.html",
        "task-detail.html",
        "requirement-generation.html",
        "detail-design-generation.html",
        "hil-test-case-generation.html",
        "feedback-tickets.html",
        "feedback-pool.html",
        "skill-management.html",
        "skill-refinement.html",
        "replay-lab.html"
      ];

      for (const fileName of htmlPages) {
        const html = await fs.readFile(path.join(config.rootDir, "public", fileName), "utf8");
        assert.ok(html.includes('/feedback-widget.css'), `${fileName} should include feedback-widget.css`);
        assert.ok(html.includes('/feedback-widget.js'), `${fileName} should include feedback-widget.js`);
      }
    }
  },
  {
    name: "Feedback widget exposes create and view ticket actions",
    run: async () => {
      const script = await fs.readFile(path.join(config.rootDir, "public", "feedback-widget.js"), "utf8");
      const stylesheet = await fs.readFile(path.join(config.rootDir, "public", "feedback-widget.css"), "utf8");

      assert.ok(script.includes("新建反馈工单"));
      assert.ok(script.includes("查看已有工单"));
      assert.ok(script.includes('window.location.href = "/feedback-tickets"'));
      assert.ok(script.includes("去查看工单"));
      assert.ok(script.includes("?ticket="));
      assert.match(stylesheet, /\.feedback-widget-dialog\s*\{[^}]*pointer-events:\s*auto/s);
    }
  },
  {
    name: "Feedback ticket page route serves the new console shell",
    run: async () => {
      await withTestServer(async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/feedback-tickets`);
        assert.equal(response.status, 200);
        const html = await response.text();

        assert.ok(html.includes("反馈工单台"));
        assert.ok(html.includes('id="ticket-search"'));
        assert.ok(html.includes('id="ticket-list"'));
        assert.ok(html.includes('id="ticket-detail"'));
      });
    }
  },
  {
    name: "Feedback pool replay dialog exposes larger viewport and manual height controls",
    run: async () => {
      const html = await fs.readFile(path.join(config.rootDir, "public", "feedback-pool.html"), "utf8");
      const script = await fs.readFile(path.join(config.rootDir, "public", "feedback-pool.js"), "utf8");
      const stylesheet = await fs.readFile(path.join(config.rootDir, "public", "app.css"), "utf8");

      assert.ok(html.includes('id="replay-dialog-resizer"'));
      assert.ok(script.includes("handleReplayDialogResizePointerDown"));
      assert.ok(script.includes("applyReplayDialogHeight"));
      assert.ok(script.includes("function syncReplayDialogHeight"));
      assert.ok(stylesheet.includes(".replay-dialog[open]"));
      assert.ok(stylesheet.includes("resize: vertical"));
      assert.ok(stylesheet.includes(".dialog-resize-handle"));
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
