import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
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
import { ReplayArtifactService } from "../src/services/replay-artifact-service.js";
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
import { HermesTaskQueueService } from "../src/services/hermes-task-queue-service.js";
import { SpreadsheetExtractionService } from "../src/services/spreadsheet-extraction-service.js";
import { ModelRequirementViewService } from "../src/services/model-requirement-view-service.js";

const execFileAsync = promisify(execFile);

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
    generationTaskArtifactDir: path.join(tempDir, "data", "generation-task-artifacts"),
    replayTaskArtifactDir: path.join(tempDir, "data", "replay-task-artifacts"),
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
    skillBundleSnapshotDir: path.join(tempDir, "data", "skill-refinement", "bundle-snapshots"),
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
    skillVersioning: {
      directActiveSkillItemWrites: "allow"
    },
      hermes: {
        transport: "api",
        host: "127.0.0.1",
        port: 0,
        baseURL: "http://127.0.0.1:0",
      command: "hermes",
      workdir: tempDir,
        timeoutMs: 2000,
        stepTimeoutMs: {
          replay_proposal_generate: 4000,
          anchor_index_build: 2000,
          outline_build: 2000,
          content_generate: 4000
        },
      maxTurns: 8,
      maxRecalledAtoms: 24,
      maxOutlineSections: 6,
      maxEvidenceForGeneration: 40,
      maxAnchorsForGeneration: 80
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

function escapeXml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function buildSheetXml(rows = []) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${body}</sheetData>
</worksheet>`;
}

async function createMinimalXlsx(filePath, rowsBySheet = {}) {
  const workbookDir = await fs.mkdtemp(path.join(os.tmpdir(), "xlsx-fixture-"));
  try {
    await fs.mkdir(path.join(workbookDir, "_rels"), { recursive: true });
    await fs.mkdir(path.join(workbookDir, "xl", "_rels"), { recursive: true });
    await fs.mkdir(path.join(workbookDir, "xl", "worksheets"), { recursive: true });

    const sheetEntries = Object.entries(rowsBySheet);
    const workbookSheets = sheetEntries
      .map(([name], index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join("");
    const workbookRels = sheetEntries
      .map(
        ([,], index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      )
      .join("");
    const contentTypes = [
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      ...sheetEntries.map(
        ([,], index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
    ].join("");

    await fs.writeFile(
      path.join(workbookDir, "[Content_Types].xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${contentTypes}
</Types>`,
      "utf8"
    );

    await fs.writeFile(
      path.join(workbookDir, "_rels", ".rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      "utf8"
    );

    await fs.writeFile(
      path.join(workbookDir, "xl", "workbook.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`,
      "utf8"
    );

    await fs.writeFile(
      path.join(workbookDir, "xl", "_rels", "workbook.xml.rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
</Relationships>`,
      "utf8"
    );

    for (const [index, [, rows]] of sheetEntries.entries()) {
      await fs.writeFile(path.join(workbookDir, "xl", "worksheets", `sheet${index + 1}.xml`), buildSheetXml(rows), "utf8");
    }

    if (process.platform === "win32") {
      const escapedSource = workbookDir.replaceAll("'", "''");
      const escapedDestination = filePath.replaceAll("'", "''");
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
          "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
          `Remove-Item -LiteralPath '${escapedDestination}' -Force -ErrorAction SilentlyContinue;`,
          `[System.IO.Compression.ZipFile]::CreateFromDirectory('${escapedSource}', '${escapedDestination}');`
        ].join(" ")
      ]);
    } else {
      await execFileAsync("zip", ["-rq", filePath, "."], { cwd: workbookDir });
    }
  } finally {
    await fs.rm(workbookDir, { recursive: true, force: true });
  }
}

function buildManualTitleOutline(sections = [{ sectionTitle: "智能补电", itemTitles: ["激活判断", "退出判断"] }]) {
  return {
    sections: sections.map((section, sectionIndex) => ({
      sectionTitle: section.sectionTitle || `章节 ${sectionIndex + 1}`,
      items: (section.itemTitles || []).map((itemTitle, itemIndex) => ({
        itemTitle: itemTitle || `条目 ${itemIndex + 1}`
      }))
    }))
  };
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
    name: "Model requirement view builds stable facts from C, PDF and SLX anchors",
    run: async () => {
      const service = new ModelRequirementViewService();
      const anchors = [
        {
          anchorId: "anchor-c",
          assetId: "asset-c",
          fileName: "torque.c",
          fileRole: "generated_c",
          location: "line 12",
          excerpt: "if (torqueRequest > 120) { torqueOut = 120; }",
          summary: "扭矩请求限幅",
          tags: ["threshold", "logic"]
        },
        {
          anchorId: "anchor-pdf",
          assetId: "asset-pdf",
          fileName: "system.pdf",
          fileRole: "system_pdf",
          location: "page:1",
          excerpt: "当扭矩干预激活时，系统应输出目标扭矩。",
          summary: "扭矩干预目标扭矩输出",
          tags: ["requirement-like"]
        },
        {
          anchorId: "anchor-slx",
          assetId: "asset-slx",
          fileName: "torque.slx",
          fileRole: "simulink_slx",
          location: "TorqueModel/In1",
          excerpt: "接口 TorqueReq (input) 类型:double",
          summary: "SLX 输入接口",
          tags: ["interface"]
        }
      ];

      const view = service.build({
        project: { documentType: "software_requirement" },
        assets: [
          { assetId: "asset-c", fileName: "torque.c", fileRole: "generated_c" },
          { assetId: "asset-pdf", fileName: "system.pdf", fileRole: "system_pdf" },
          { assetId: "asset-slx", fileName: "torque.slx", fileRole: "simulink_slx" }
        ],
        anchors
      });
      const viewAgain = service.build({ project: { documentType: "software_requirement" }, anchors });

      assert.equal(view.version, "1.0");
      assert.equal(view.facts.length, 3);
      assert.deepEqual(view.facts.map((fact) => fact.id), viewAgain.facts.map((fact) => fact.id));
      assert.ok(view.facts.some((fact) => fact.sourceRefs[0].fileRole === "generated_c" && fact.parameters.length));
      assert.ok(view.facts.some((fact) => fact.sourceRefs[0].fileRole === "system_pdf" && fact.condition));
      assert.ok(view.facts.some((fact) => fact.sourceRefs[0].fileRole === "simulink_slx" && fact.signals.includes("TorqueReq")));
      assert.equal(service.validateReferenceIds(view, [view.facts[0].id]), true);
      assert.equal(service.validateReferenceIds(view, ["fact-missing"]), false);

      const bundleView = service.build({
        project: { documentType: "software_requirement" },
        extractions: [
          {
            fileId: "asset-slx",
            fileName: "torque.slx",
            fileRole: "simulink_slx",
            modelFactBundle: {
              source: { fileName: "torque.slx", modelName: "TorqueModel" },
              interfaces: [{ name: "TorqueReq", direction: "input", dataType: "double", location: "TorqueModel/In1" }],
              subsystems: [{ name: "TorqueLimiter", location: "TorqueModel/TorqueLimiter" }],
              states: [],
              parameters: [],
              logicRules: [],
              timing: [],
              diagnostics: [],
              traceRefs: []
            }
          }
        ]
      });
      assert.equal(bundleView.facts.length, 2);
      assert.equal(bundleView.facts[0].sourceRefs[0].fileRole, "simulink_slx");
      assert.ok(bundleView.facts[0].signals.includes("TorqueReq"));
      assert.ok(bundleView.facts.some((fact) => fact.topic === "模型结构事实" && fact.behavior.includes("TorqueLimiter")));
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
    name: "Replay artifact service writes expected file-driven Hermes replay artifact structure",
    run: async () => {
      await withTempConfig(async () => {
        const replayArtifactService = new ReplayArtifactService();
        const copiedAssetPath = path.join(config.uploadDir, "replay-source", "charging-helper.c");
        await fs.mkdir(path.dirname(copiedAssetPath), { recursive: true });
        await fs.writeFile(copiedAssetPath, "void StallHeatingHelper(void) { /* copied */ }", "utf8");

        const outputDir = path.join(config.generationTaskArtifactDir, "replay-artifact-1");
        const materialPack = {
          targetBundleId: "bundle-base",
          targetAreas: ["validation", "writing"],
          targetLayerConstraint: "module",
          targetProfileKeyConstraint: "charging_management",
          ruleIndexVersion: "rule-index-v1",
          moduleContext: {
            projectId: "project-1",
            projectName: "VCU",
            moduleId: "module-1",
            moduleName: "充电管理",
            moduleSkillKey: "charging_management",
            domain: "embedded_vcu",
            documentType: "software_requirement"
          },
          rejectionSnapshots: [
            {
              id: "rej-1",
              requirementCode: "SWR-100",
              reasonCategory: "coverage_gap",
              reasonText: "正文混入了人工范例没有的回退逻辑。",
              expectedNote: "只保留记忆和刷新要求。",
              outputSnapshot: {
                title: "充电截止 SOC 记忆",
                requirementText: "软件应记忆 SOC，并在异常时回退默认值。",
                verificationHint: "检查记忆逻辑",
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
                  excerpt: "if (limitInvalid) { fallbackDefault(); }"
                }
              ]
            }
          ],
          effectiveSkillSnapshot: {
            hash: "skill-hash-1",
            selectedProfiles: [
              { key: "generic", kind: "generic" },
              { key: "charging_management", kind: "module" }
            ],
            compiledPrompt: "这是原始生成时的 compiledPrompt",
            compiledSkillPack: {
              context: {
                documentType: "software_requirement",
                domain: "embedded_vcu",
                moduleSkillKey: "charging_management"
              },
              rules: {
                validation: [{ skillCode: "val-1", title: "禁止越界扩写" }]
              }
            },
            files: {
              "requirement_validation.md": "# 校验\n- 禁止越界扩写",
              "examples/good_examples.md": "# 正例\n- 只写记忆行为",
              "domain-knowledge.json": {
                version: 1,
                ruleHints: [{ id: "hint-1", note: "只保留人工范例边界" }]
              }
            }
          },
          layerSkillItems: [
            {
              skillCode: "MOD-充电管理-validation-001",
              layer: "module",
              profileKey: "charging_management",
              kind: "validation_rule",
              title: "不要引入人工范例外的回退逻辑",
              targetFile: "requirement_validation.md",
              content: "如果人工范例没有定义回退逻辑，则禁止在软件需求中补写默认值回退。",
              contentSummary: "禁止补写默认值回退。",
              whyRelevant: "module/charging_management"
            }
          ],
          referenceAssets: [
            {
              id: "asset-1",
              originalName: "charging-helper.c",
              role: "generated_c",
              relativePath: "replay-source/charging-helper.c",
              mimeType: "text/plain",
              preview: "void StallHeatingHelper(void) { /* copied */ }"
            },
            {
              id: "asset-2",
              originalName: "charging-example.md",
              role: "reference_requirement_example",
              mimeType: "text/markdown",
              preview: "人工范例：只保留记忆和刷新要求。"
            }
          ]
        };

        const artifact = await replayArtifactService.buildReplayTaskArtifact({
          outputDir,
          task: {
            id: "replay-task-1",
            projectId: "project-1",
            moduleId: "module-1",
            projectName: "VCU",
            moduleName: "充电管理"
          },
          materialPack
        });

        assert.equal(artifact.outputDir, outputDir);
        assert.equal(artifact.manifestPath, path.join(outputDir, "manifest.json"));
        assert.ok(artifact.writtenFiles.includes("task-brief.md"));
        assert.ok(artifact.writtenFiles.includes("rejections.json"));
        assert.ok(artifact.writtenFiles.includes("effective-skill-manifest.json"));
        assert.ok(artifact.writtenFiles.includes("effective-skill/requirement_validation.md"));
        assert.ok(artifact.writtenFiles.some((item) => item.startsWith("reference-assets/")));

        const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));
        assert.equal(manifest.taskContext.moduleSkillKey, "charging_management");
        assert.equal(manifest.rejectionContext.records[0].id, "rej-1");
        assert.equal(manifest.layerSkillInventory[0].skillCode, "MOD-充电管理-validation-001");
        assert.equal(manifest.effectiveSkillFiles[0].artifactPath.startsWith("effective-skill/"), true);
        assert.equal(manifest.counts.rejections, 1);
        assert.equal(manifest.counts.layerSkillItems, 1);
        assert.equal(manifest.counts.referenceAssets, 2);
        assert.equal(manifest.referenceAssets[0].mode, "copied");
        assert.equal(manifest.referenceAssets[1].mode, "materialized");

        const taskBrief = await fs.readFile(path.join(outputDir, "task-brief.md"), "utf8");
        assert.match(taskBrief, /VCU/);
        assert.match(taskBrief, /充电管理/);
        assert.match(taskBrief, /reference assets/i);

        assert.equal(
          await fs.readFile(path.join(outputDir, "effective-skill", "requirement_validation.md"), "utf8"),
          "# 校验\n- 禁止越界扩写"
        );
        assert.deepEqual(
          JSON.parse(await fs.readFile(path.join(outputDir, "effective-skill", "domain-knowledge.json"), "utf8")),
          {
            version: 1,
            ruleHints: [{ id: "hint-1", note: "只保留人工范例边界" }]
          }
        );

        const referenceFiles = await fs.readdir(path.join(outputDir, "reference-assets"));
        assert.ok(referenceFiles.some((name) => name.endsWith("charging-helper.c")));
        assert.ok(referenceFiles.some((name) => name.endsWith("charging-example.md")));
      });
    }
  },
  {
    name: "Replay artifact service truncates large replay text fields in manifests and summaries",
    run: async () => {
      await withTempConfig(async () => {
        const replayArtifactService = new ReplayArtifactService();
        const oversizedText = "X".repeat(6000);
        const outputDir = path.join(config.generationTaskArtifactDir, "replay-artifact-2");
        const artifact = await replayArtifactService.buildReplayTaskArtifact({
          outputDir,
          task: {
            id: "replay-task-2",
            projectId: "project-2",
            moduleId: "module-2",
            projectName: "VCU",
            moduleName: "扭矩干预"
          },
          materialPack: {
            targetAreas: ["validation"],
            targetLayerConstraint: "module",
            targetProfileKeyConstraint: "torque_intervention",
            moduleContext: {
              projectId: "project-2",
              projectName: "VCU",
              moduleId: "module-2",
              moduleName: "扭矩干预",
              moduleSkillKey: "torque_intervention",
              domain: "embedded_vcu",
              documentType: "software_requirement"
            },
            rejectionSnapshots: [
              {
                id: "rej-oversized",
                requirementCode: "SWR-200",
                reasonCategory: "wording_issue",
                reasonText: oversizedText,
                expectedNote: oversizedText,
                outputSnapshot: {
                  title: "大文本需求",
                  requirementText: oversizedText
                },
                sourceRefsSnapshot: [],
                projectEvidenceSnapshot: []
              }
            ],
            effectiveSkillSnapshot: {
              hash: "skill-hash-oversized",
              selectedProfiles: [{ key: "torque_intervention", kind: "module" }],
              compiledPrompt: oversizedText,
              compiledSkillPack: {
                hugeRule: oversizedText
              },
              files: {
                "requirement_validation.md": "# 校验\n- 保持边界"
              }
            },
            layerSkillItems: [
              {
                skillCode: "MOD-扭矩干预-validation-001",
                layer: "module",
                profileKey: "torque_intervention",
                kind: "validation_rule",
                title: "禁止额外扩写",
                targetFile: "requirement_validation.md",
                content: oversizedText
              }
            ],
            referenceAssets: [
              {
                id: "asset-preview-only",
                originalName: "torque-example.md",
                role: "reference_requirement_example",
                preview: oversizedText
              }
            ]
          }
        });

        assert.equal(artifact.referenceAssets.length, 1);
        const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"));
        const rejections = JSON.parse(await fs.readFile(path.join(outputDir, "rejections.json"), "utf8"));
        const effectiveSkillManifest = JSON.parse(await fs.readFile(path.join(outputDir, "effective-skill-manifest.json"), "utf8"));
        const inventory = JSON.parse(await fs.readFile(path.join(outputDir, "layer-skill-inventory.json"), "utf8"));

        assert.equal(rejections.records[0].reasonText.truncated, true);
        assert.equal(rejections.records[0].expectedNote.truncated, true);
        assert.equal(rejections.records[0].outputSnapshot.requirementText.truncated, true);
        assert.equal(effectiveSkillManifest.compiledPrompt.truncated, true);
        assert.equal(effectiveSkillManifest.compiledSkillPackPreview.hugeRule.truncated, true);
        assert.equal(inventory.items[0].contentPreview.truncated, true);
        assert.equal(manifest.referenceAssets[0].preview.truncated, true);
      });
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
                          changeSummary: "修改现有人工样例边界规则，禁止代码侧保护/回退逻辑混入充电截止SOC记忆需求。",
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
                          changeSummary: "新增充电管理模块级校验规则，约束需求正文不得混入代码侧保护/回退逻辑。",
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
          assert.match(proposal.items[0].changeSummary, /修改现有人工样例边界规则/);
          assert.deepEqual(proposal.items[0].evidenceRefs, ["rej-1"]);

          assert.equal(proposal.items[1].action, "add_skill_item");
          assert.equal(proposal.items[1].conclusionType, "create_new");
          assert.match(proposal.items[1].changeSummary, /新增充电管理模块级校验规则/);
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
    name: "Hermes agent client replay_proposal_generate prompt normalizes replay proposal payload",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                `${JSON.stringify({
                  summary: "已生成 1 条回投提议。",
                  decisionSummary: "建议修改现有模块校验规则。",
                  rootCauses: ["多条驳回记录共同指向“coverage_gap”相关问题。"],
                  validatorSuggestions: [],
                  items: [
                    {
                      conclusionType: "modify_existing",
                      action: "modify_skill_item",
                      targetSkillCode: "MOD-charging_management-validation_rule-001",
                      targetLayer: "module",
                      targetProfileKey: "charging_management",
                      targetKind: "validation_rule",
                      kind: "validation_rule",
                      targetFile: "requirement_validation.md",
                      targetInsertionHint: "追加在模块边界规则之后",
                      title: "充电管理需求正文边界校验",
                      changeSummary: "修改现有模块校验规则，补充人工范例边界约束。",
                      fallbackReason: "当前规则没有拦住代码侧回退逻辑",
                      whyCurrent: "现有规则缺少人工范例边界约束。",
                      whyChange: "补齐边界约束后可减少越界扩写。",
                      beforeContent: "生成需求时保持软件需求风格。",
                      afterContent: "生成需求时应优先对齐人工范例边界，不得混入代码侧推断的回退逻辑。",
                      rationale: "强化模块边界约束。",
                      evidenceRefs: ["CheryVCU-12147"]
                    }
                  ],
                  runtime: {
                    status: "completed",
                    stage: "replay_proposal_generate"
                  },
                  artifacts: {
                    artifactDir: "/tmp/replay-artifacts/task-001"
                  }
                })}\n\nsession_id: 20260423_154500_replay01\n`,
              stderr: ""
            };
          }
        });

        const response = await client.executeStep({
          taskId: "replay-cli-contract",
          stepType: "replay_proposal_generate",
          allowedPaths: ["/tmp/replay-artifacts/task-001"],
          inputArtifact: {
            replayContext: {
              directory: "/tmp/replay-artifacts/task-001",
              manifestFileName: "manifest.json",
              taskBriefFileName: "task-brief.md"
            },
            replayManifest: {
              taskContext: {
                moduleSkillKey: "charging_management",
                moduleName: "充电管理",
                domain: "embedded_vcu",
                documentType: "software_requirement",
                targetAreas: ["validation"],
                targetLayerConstraint: "module",
                targetProfileKeyConstraint: "charging_management",
                allowedKindsForReplay: ["validation_rule"]
              },
              rejectionContext: {
                records: [
                  {
                    id: "rej-1",
                    reasonCategory: "coverage_gap",
                    reasonText: "生成结果混入了人工范例中没有的回退逻辑。",
                    expectedNote: "请仅保留记忆和刷新要求。",
                    targetArea: "validation"
                  }
                ]
              },
              layerSkillInventory: [
                {
                  skillCode: "MOD-charging_management-validation_rule-001",
                  layer: "module",
                  profileKey: "charging_management",
                  kind: "validation_rule",
                  title: "旧规则",
                  contentSummary: "旧规则正文",
                  targetFile: "requirement_validation.md"
                }
              ]
            },
            files: {
              rejectionsPath: "/tmp/replay-artifacts/task-001/rejections.json",
              effectiveSkillManifestPath: "/tmp/replay-artifacts/task-001/effective-skill-manifest.json",
              layerSkillInventoryPath: "/tmp/replay-artifacts/task-001/layer-skill-inventory.json",
              referenceAssetFiles: [
                {
                  fileName: "Chrg.c",
                  role: "generated_c",
                  path: "/tmp/replay-artifacts/task-001/reference-assets/001-generated_c-Chrg.c"
                }
              ]
            }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        assert.equal(response.artifact.items.length, 1);
        assert.equal(response.artifact.items[0].action, "modify_skill_item");
        assert.equal(response.artifact.items[0].targetLayer, "module");
        assert.equal(response.artifact.items[0].targetProfileKey, "charging_management");
        assert.equal(response.artifact.items[0].changeSummary, "修改现有模块校验规则，补充人工范例边界约束。");
        assert.deepEqual(response.artifact.items[0].evidenceRefs, ["rej-1"]);

        const prompt = invocations[0].args[2];
        assert.match(prompt, /replay_proposal_generate/);
        assert.match(prompt, /changeSummary/);
        assert.match(prompt, /manifest\.json/);
        assert.match(prompt, /task-brief\.md/);
        assert.match(prompt, /"replayContext"/);
        assert.match(prompt, /"directory": "\/tmp\/replay-artifacts\/task-001"/);
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
    name: "Software requirement doc type skill does not assume human examples during formal generation",
    run: async () => {
      const loader = new SkillLoader();
      const skills = await loader.loadForContext({
        documentType: "software_requirement",
        domain: "embedded_vcu",
        moduleSkillKey: "低压能量管理"
      });

      const docTypeItems = skills.__compiledSkillPack.flatItems.filter(
        (item) =>
          item.layer === "docType" &&
          item.profileKey === "software_requirement" &&
          ["writing_rule", "generation_priority", "anti_pattern", "validation_rule", "rule_hint"].includes(item.kind)
      );

      const forbiddenPhrases = [
        "人工样例",
        "人工案例",
        "人工软件需求样例",
        "样例锚点",
        "完全同构的人工样例"
      ];

      for (const item of docTypeItems) {
        for (const phrase of forbiddenPhrases) {
          assert.ok(
            !item.title.includes(phrase),
            `${item.skillCode} title should not mention ${phrase}`
          );
          assert.ok(
            !item.content.includes(phrase),
            `${item.skillCode} should not mention ${phrase}`
          );
        }
      }
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
        assert.ok(!result.knowledge.documentBlueprint);
        assert.equal(result.knowledge.sourceOfTruthPolicy.preferredFunctionSection.title, "充电管理");
        assert.equal(result.knowledge.sourceOfTruthPolicy.coreFirst, true);
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
    name: "Module skill service preserves other document scopes when persisting bootstrapped knowledge",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "Thermal Management",
          moduleSkillKey: "thermal_management"
        };
        const detailKnowledge = {
          version: 1,
          generationPriorities: ["先写详细设计流程。"],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              sectionHints: ["详细设计状态机"],
              writingPattern: "偏实现描述。",
              targetStyle: "detail design"
            }
          ],
          antiPatterns: ["不要漏写状态切换。"]
        };
        const requirementKnowledge = {
          version: 1,
          generationPriorities: ["先写软件需求主线。"],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              sectionHints: ["软件需求主题"],
              writingPattern: "先写主功能。",
              targetStyle: "software requirement"
            }
          ],
          antiPatterns: ["不要混入实现细节。"]
        };

        await service.persistBootstrappedKnowledge(module, "detail_design", detailKnowledge);
        await service.persistBootstrappedKnowledge(module, "software_requirement", requirementKnowledge);

        const registry = await service.loadModuleRegistry(module.moduleSkillKey);
        const detailItems = registry.items.filter((item) => item.documentTypeScope === "detail_design");
        const requirementItems = registry.items.filter((item) => item.documentTypeScope === "software_requirement");

        assert.ok(detailItems.length > 0);
        assert.ok(requirementItems.length > 0);
        assert.ok(detailItems.every((item) => item.documentTypeScope === "detail_design"));
        assert.ok(requirementItems.every((item) => item.documentTypeScope === "software_requirement"));

        const loader = new SkillLoader();
        const requirementSkills = await loader.loadForContext({
          documentType: "software_requirement",
          domain: "embedded_vcu",
          moduleSkillKey: module.moduleSkillKey
        });
        const detailSkills = await loader.loadForContext({
          documentType: "detail_design",
          domain: "embedded_vcu",
          moduleSkillKey: module.moduleSkillKey
        });

        assert.ok(requirementSkills["domain-knowledge.json"].ruleHints.some((item) => item.targetStyle === "software requirement"));
        assert.ok(
          !requirementSkills["domain-knowledge.json"].ruleHints.some((item) => item.targetStyle === "detail design")
        );
        assert.ok(detailSkills["domain-knowledge.json"].ruleHints.some((item) => item.targetStyle === "detail design"));
      });
    }
  },
  {
    name: "Module skill persistence materializes cold-start profiles to active skill files",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "Low Voltage Energy Management",
          moduleSkillKey: "low_voltage_energy_management"
        };

        await service.persistBootstrappedKnowledge(module, "software_requirement", {
          version: 1,
          generationPriorities: ["优先保留模块主线。"],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              sectionHints: ["智能补电退出判断"],
              writingPattern: "按主需求粒度组织。",
              targetStyle: "software requirement"
            }
          ],
          antiPatterns: ["不要把同一主需求拆成很多派生条。"]
        });

        const manifestPath = path.join(config.activeSkillDir, "skill-manifest.json");
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        const moduleConfig = manifest.profiles.modules.low_voltage_energy_management;
        assert.ok(moduleConfig);

        const registryPath = path.join(config.activeSkillDir, moduleConfig.registry);
        const knowledgePath = path.join(config.activeSkillDir, moduleConfig.files["domain-knowledge.json"][0]);
        const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
        const knowledge = JSON.parse(await fs.readFile(knowledgePath, "utf8"));

        assert.ok(registry.items.some((item) => item.kind === "generation_priority"));
        assert.equal(knowledge.generationPriorities[0], "优先保留模块主线。");
        assert.equal(knowledge.ruleHints[0].sectionHints[0], "智能补电退出判断");
      });
    }
  },
  {
    name: "Module skill inspection treats legacy global module knowledge as usable fallback",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "Legacy Energy",
          moduleSkillKey: "legacy_energy",
          domain: "embedded_vcu",
          assets: []
        };
        await service.registryService.saveProfileRegistry(
          "module",
          module.moduleSkillKey,
          {
            version: 1,
            layer: "module",
            profileKey: module.moduleSkillKey,
            displayName: module.name,
            documentTypeScope: "",
            status: "active",
            items: []
          }
        );
        await service.registryService.replaceKnowledgeItems("module", module.moduleSkillKey, {
          version: 1,
          generationPriorities: ["通用模块规则"],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              sectionHints: ["通用主题"],
              writingPattern: "legacy global fallback",
              targetStyle: "shared"
            }
          ],
          antiPatterns: []
        });

        const inspection = await service.inspectModule({ domain: "embedded_vcu" }, module, "hil_test_case");

        assert.equal(inspection.hasModuleProfile, true);
        assert.equal(inspection.hasUsableModuleSkill, true);
        assert.equal(inspection.hasScopedModuleSkill, false);
        assert.equal(inspection.usesLegacyGlobalFallback, true);
        assert.deepEqual(inspection.missingBootstrapAssets, []);
        assert.equal(inspection.canGenerateDirectly, true);
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
  },
  {
    name: "Legacy task results without ids are normalized before structured rejection review",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();

        const project = await projectService.createProject({ name: "Legacy Result Id Repair Project" });
        const module = await projectService.createModule(project.id, {
          name: "能量管理",
          description: "用于验证旧任务结果补 id"
        });

        await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              requirementId: "SWR-LEGACY-1",
              title: "智能补电退出判断",
              itemTitle: "智能补电退出判断",
              sectionTitle: "智能补电",
              requirementText: "软件应在满足退出条件时关闭智能补电。",
              type: "functional",
              confidence: 0.66,
              verificationHint: "验证退出触发与恢复条件",
              conflictNote: "",
              sourceRefs: [
                {
                  fileName: "energy-system.md",
                  location: "page:3",
                  excerpt: "满足退出条件时关闭智能补电。"
                }
              ]
            }
          ]
        });

        const reloaded = await projectService.getProject(project.id);
        const reloadedModule = reloaded.modules.find((item) => item.id === module.id);
        const legacyTask = reloadedModule.documentSpaces.software_requirement.generationTasks[0];
        const normalizedResultId = legacyTask.resultItems[0].id;

        assert.ok(normalizedResultId);

        const reviewed = await projectService.reviewTaskResult(
          project.id,
          module.id,
          "software_requirement",
          legacyTask.id,
          normalizedResultId,
          {
            status: "rejected",
            reviewer: "tester",
            reasonCategory: "coverage_gap",
            reasonTags: ["退出分支"],
            reasonText: "退出分支和后处理不完整",
            targetArea: "writing",
            targetLayerConstraint: "module",
            expectedNote: "保留单条主需求并补全退出分支。",
            includeInPool: true,
            comment: "验证旧任务结果可正常结构化驳回"
          }
        );

        assert.equal(reviewed.id, normalizedResultId);
        assert.equal(reviewed.review.status, "rejected");
        assert.ok(reviewed.review.rejectionId);

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        assert.equal(records.length, 1);
        assert.equal(records[0].sourceResultItemId, normalizedResultId);
        assert.equal(records[0].skillContext?.targetLayerConstraint, "module");
      });
    }
  },
  {
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
    name: "Project service persists explicit cold-start module initialization mode",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Cold Start Mode Project" });
        const module = await projectService.createModule(project.id, {
          name: "Thermal Planning",
          moduleSkillKey: "thermal_planning",
          skillInitMode: "cold_start",
          skillStatus: "draft"
        });

        assert.equal(module.skillInitMode, "cold_start");

        const reloaded = await projectService.getModule(project.id, module.id);
        assert.equal(reloaded.skillInitMode, "cold_start");
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
    name: "Module asset upload decodes mojibake original names before persisting metadata",
    run: async () => {
      await withTempConfig(async () => {
        await withTestServer(async ({ baseUrl }) => {
          const projectService = new ProjectService();
          const project = await projectService.createProject({ name: "Upload Workspace" });
          const module = await projectService.createModule(project.id, { name: "高压安全管理" });
          const expectedName = "高压安全管理系统需求.md";
          const mojibakeName = Buffer.from(expectedName, "utf8").toString("latin1");

          const form = new FormData();
          form.append("documentType", "software_requirement");
          form.append("systemPdf", new Blob(["系统需求正文"], { type: "text/markdown" }), mojibakeName);

          const response = await fetch(`${baseUrl}/api/projects/${project.id}/modules/${module.id}/assets`, {
            method: "POST",
            body: form
          });

          assert.equal(response.status, 201);
          const payload = await response.json();
          assert.equal(payload.assets.length, 1);
          assert.equal(payload.assets[0].originalName, expectedName);
          assert.match(payload.assets[0].storedName, /高压安全管理系统需求\.md$/);

          const reloadedModule = await projectService.getModule(project.id, module.id);
          assert.equal(reloadedModule.assets.length, 1);
          assert.equal(reloadedModule.assets[0].originalName, expectedName);
          assert.match(reloadedModule.assets[0].storedName, /高压安全管理系统需求\.md$/);
        });
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
    name: "Hermes agent client uploads allowed files in API multipart mode",
    run: async () => {
      await withTempConfig(async () => {
        const uploadFixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-api-upload-"));
        const filePath = path.join(uploadFixtureDir, "charging-model.c");
        await fs.writeFile(
          filePath,
          [
            "#define CHARGE_LIMIT 80",
            "void ChargingStep(void) {",
            "  if (chargeSoc >= CHARGE_LIMIT) {",
            "    chargeState = 1;",
            "  }",
            "}"
          ].join("\n"),
          "utf8"
        );

        try {
          await withHermesServer(async ({ baseUrl }) => {
            const client = new HermesAgentClient({
              transport: "api",
              apiMode: "multipart",
              baseURL: baseUrl,
              timeoutMs: 5000
            });

            const response = await client.executeStep({
              taskId: "task-api-upload",
              stepType: "anchor_index_build",
              allowedPaths: [filePath],
              inputArtifact: {
                assets: [
                  {
                    assetId: "asset-upload-1",
                    fileName: "charging-model.c",
                    fileRole: "generated_c",
                    absolutePath: filePath
                  }
                ]
              },
              skillInventory: { items: [] },
              llmProfileSnapshot: null
            });

            assert.equal(response.status, "succeeded");
            assert.ok(response.artifact.anchors.some((anchor) => anchor.fileName === "charging-model.c"));
            assert.ok(response.metrics.anchorCount > 0);
          });
        } finally {
          await fs.rm(uploadFixtureDir, { recursive: true, force: true });
        }
      });
    }
  },
  {
    name: "Hermes API server reports uploaded Windows worker probe path",
    run: async () => {
      await withTempConfig(async () => {
        const uploadFixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-worker-probe-"));
        const filePath = path.join(uploadFixtureDir, "windows-worker-upload-probe.txt");
        const probeText = "windows worker probe fixture";
        await fs.writeFile(filePath, probeText, "utf8");

        try {
          await withHermesServer(async ({ baseUrl }) => {
            const client = new HermesAgentClient({
              transport: "api",
              apiMode: "multipart",
              baseURL: baseUrl,
              timeoutMs: 5000
            });

            const response = await client.executeStep({
              taskId: "task-worker-probe",
              stepType: "windows_worker_probe",
              allowedPaths: [filePath],
              inputArtifact: {
                probeId: "probe-test",
                probeFilePath: filePath,
                expectedText: probeText,
                retainUploadedFiles: false
              }
            });

            assert.equal(response.status, "succeeded");
            assert.equal(response.artifact.ok, true);
            assert.equal(response.artifact.file.exists, true);
            assert.equal(response.artifact.file.contentMatches, true);
            assert.notEqual(path.resolve(response.artifact.receivedPath), path.resolve(filePath));
            assert.ok(response.artifact.receivedDirectory.includes("step-"));
          });
        } finally {
          await fs.rm(uploadFixtureDir, { recursive: true, force: true });
        }
      });
    }
  },
  {
    name: "Hermes agent client parses quiet CLI output and session id",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const usageReaderInvocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"items\":[{\"title\":\"CLI item\",\"requirementText\":\"CLI text\",\"sourceAnchorIds\":[\"anchor-1\"]}]}\n\nsession_id: 20260421_144500_abcd12\n",
              stderr: ""
            };
          },
          usageReader: async ({ sessionId }) => {
            usageReaderInvocations.push(sessionId);
            return {
              model: "gpt-5.4",
              inputTokens: 1200,
              outputTokens: 300,
              cacheReadTokens: 50,
              cacheWriteTokens: 0,
              reasoningTokens: 22,
              totalTokens: 1550,
              costStatus: "included"
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
        assert.deepEqual(response.artifact.items[0].sourceAnchorIds, ["anchor-1"]);
        assert.deepEqual(usageReaderInvocations, ["20260421_144500_abcd12"]);
        assert.equal(response.metrics.tokenUsage.totalTokens, 1550);
        assert.equal(response.metrics.tokenUsage.inputTokens, 1200);
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
            anchor_index_build: 120000,
            outline_build: 120000,
            content_generate: 240000
          },
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"items\":[{\"title\":\"CLI item\",\"requirementText\":\"CLI text\",\"sourceAnchorIds\":[\"anchor-1\"]}]}\n\nsession_id: 20260421_144500_abcd12\n",
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
    name: "Default Hermes content_generate timeout is 1200000ms",
    run: async () => {
      const source = await fs.readFile(new URL("../src/config.js", import.meta.url), "utf8");

      assert.match(source, /content_generate:\s*Number\(process\.env\.HERMES_TIMEOUT_CONTENT_GENERATE_MS\s*\|\|\s*1200000\)/);
    }
  },
  {
    name: "Hermes agent client applies step-specific CLI timeout for document_extract_generate",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          timeoutMs: 120000,
          stepTimeoutMs: {
            document_extract_generate: 240000
          },
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"targetDocumentType\":\"software_requirement\",\"title\":\"提取结果\",\"markdown\":\"# 提取结果\\n\",\"summary\":\"完成\",\"keySections\":[\"文档信息\"]}\n\nsession_id: 20260421_144500_abcd12\n",
              stderr: ""
            };
          }
        });

        await client.executeStep({
          taskId: "task-cli-timeout-document-extract",
          stepType: "document_extract_generate",
          allowedPaths: [],
          inputArtifact: {
            project: { name: "CLI Project", documentType: "software_requirement" },
            module: { name: "低压能量管理", domain: "embedded_vcu" },
            targetDocumentType: "software_requirement",
            sourceText: "图片提取输入",
            images: []
          },
          llmProfileSnapshot: null
        });

        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].options.timeout, 240000);
      });
    }
  },
  {
    name: "Hermes agent client applies step-specific CLI timeout for module_bootstrap_generate",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          timeoutMs: 120000,
          stepTimeoutMs: {
            module_bootstrap_generate: 600000
          },
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"version\":1,\"generationPriorities\":[\"优先描述主行为。\"],\"examples\":[],\"ruleHints\":[],\"antiPatterns\":[]}\n\nsession_id: 20260421_144500_abcd12\n",
              stderr: ""
            };
          }
        });

        await client.executeStep({
          taskId: "task-cli-timeout-module-bootstrap-generate",
          stepType: "module_bootstrap_generate",
          allowedPaths: [],
          inputArtifact: {
            project: { name: "CLI Project", documentType: "software_requirement" },
            module: { name: "低压能量管理", domain: "embedded_vcu" },
            assets: [],
            anchors: [],
            analysis: {
              summary: "模块主题分析",
              themes: [{ title: "智能补电", anchorIds: ["anchor-1"] }]
            },
            recalledAtoms: []
          },
          skillBundlePath: "",
          recommendedSkillCodes: [],
          llmProfileSnapshot: null
        });

        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].options.timeout, 600000);
        assert.doesNotMatch(invocations[0].args[2], /"task skill bundle shortlist"/);
        assert.match(invocations[0].args[2], /Do not include raw anchor ids, UUIDs, or runtime artifact labels inside `sourceBasis`/);
      });
    }
  },
  {
    name: "Hermes agent client applies step-specific CLI timeout for replay_proposal_generate",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          timeoutMs: 120000,
          stepTimeoutMs: {
            replay_proposal_generate: 600000
          },
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"items\":[{\"proposalItemId\":\"proposal-1\",\"action\":\"modify_existing\",\"targetSkillCode\":\"MOD-demo-rule_hint-001\",\"targetLayer\":\"module\",\"targetProfileKey\":\"demo_module\",\"targetKind\":\"rule_hint\",\"title\":\"覆盖缺失补充规则\",\"beforeContent\":\"旧内容\",\"afterContent\":\"新内容\",\"reason\":\"补全退出分支\",\"fallbackReason\":\"补全退出分支\",\"evidenceRefs\":[\"record-1\"]}]}\n\nsession_id: 20260421_144500_abcd12\n",
              stderr: ""
            };
          }
        });

        await client.executeStep({
          taskId: "task-cli-timeout-replay-proposal",
          stepType: "replay_proposal_generate",
          allowedPaths: [],
          inputArtifact: {
            replayManifest: {
              taskContext: {
                targetAreas: ["writing"],
                targetLayerConstraint: "module",
                targetProfileKeyConstraint: "demo_module",
                allowedKindsForReplay: ["rule_hint"]
              },
              rejectionContext: {
                records: [{ id: "record-1", reasonCategory: "coverage_gap", reasonText: "缺少退出分支" }]
              },
              layerSkillInventory: [{ skillCode: "MOD-demo-rule_hint-001", layer: "module", kind: "rule_hint" }]
            }
          },
          llmProfileSnapshot: null
        });

        assert.equal(invocations.length, 1);
        assert.equal(invocations[0].options.timeout, 600000);
      });
    }
  },
  {
    name: "Default Hermes replay_proposal_generate timeout is 600000ms",
    run: async () => {
      const source = await fs.readFile(new URL("../src/config.js", import.meta.url), "utf8");

      assert.match(
        source,
        /replay_proposal_generate:\s*Number\(process\.env\.HERMES_TIMEOUT_REPLAY_PROPOSAL_GENERATE_MS\s*\|\|\s*600000\)/
      );
    }
  },
  {
    name: "Hermes agent client builds anchor_index_build prompt and parses anchors",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout: JSON.stringify(
                {
                  anchors: [
                    {
                      anchorId: "asset-1::line-10-18::behavior",
                      assetId: "asset-1",
                      fileName: "charging-model.c",
                      fileRole: "generatedCode",
                      location: "line 10-18",
                      anchorType: "behavior",
                      excerpt: "chargeState = 1;",
                      summary: "充电状态输出被置位",
                      tags: ["charge_state", "output"]
                    }
                  ]
                },
                null,
                2
              ) + "\n\nsession_id: 20260421_144510_anchor01\n",
              stderr: ""
            };
          }
        });

        const response = await client.executeStep({
          taskId: "task-anchor-index",
          stepType: "anchor_index_build",
          allowedPaths: ["/tmp/charging-model.c"],
          inputArtifact: {
            assets: [
              {
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                absolutePath: "/tmp/charging-model.c"
              }
            ]
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        assert.equal(response.status, "succeeded");
        assert.equal(response.sessionId, "20260421_144510_anchor01");
        assert.equal(response.artifact.anchors[0].anchorId, "asset-1::line-10-18::behavior");
        const prompt = invocations[0].args[2];
        assert.match(prompt, /anchor_index_build/);
        assert.match(prompt, /anchorId/);
        assert.match(prompt, /charging-model\.c/);
      });
    }
  },
  {
    name: "Hermes agent client content_generate prompt uses modelRequirementView and sourceFactIds contract",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"items\":[{\"requirementText\":\"CLI text\",\"type\":\"functional\",\"verificationHint\":\"inspect\",\"sourceFactIds\":[\"fact-1\"],\"sourceAnchorIds\":[],\"conflictNote\":\"\"}]}\n\nsession_id: 20260421_144511_anchor02\n",
              stderr: ""
            };
          }
        });

        const response = await client.executeStep({
          taskId: "task-cli-contract",
          stepType: "content_generate",
          allowedPaths: ["/tmp/charging-model.c", "/tmp/skills/manifest.json"],
          inputArtifact: {
            project: { name: "CLI Project", documentType: "software_requirement" },
            assets: [
              {
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                absolutePath: "/tmp/charging-model.c"
              }
            ],
            anchors: [
              {
                anchorId: "anchor-1",
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                location: "line 10-18",
                anchorType: "behavior",
                excerpt: "chargeState = 1;",
                summary: "充电状态输出被置位"
              }
            ],
            recalledAtoms: [],
            modelRequirementView: {
              version: "1.0",
              sourceAssets: [{ assetId: "asset-1", fileName: "charging-model.c", fileRole: "generatedCode" }],
              facts: [
                {
                  id: "fact-1",
                  topic: "充电状态",
                  condition: "chargeEnable == true",
                  behavior: "chargeState = 1;",
                  signals: ["chargeEnable", "chargeState"],
                  parameters: [],
                  stateLogic: "",
                  sourceRefs: [
                    {
                      sourceAnchorId: "anchor-1",
                      fileName: "charging-model.c",
                      fileRole: "generatedCode",
                      location: "line 10-18",
                      excerpt: "chargeState = 1;"
                    }
                  ]
                }
              ]
            },
            requiredTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }]),
            requiredLeafCount: 1,
            template: { requirementIdPrefix: "SWR", sections: [] },
            skillBundle: {
              bundlePath: "/tmp/skills",
              manifestPath: "/tmp/skills/manifest.json",
              recommendedSkillCodes: ["module_rule_1"],
              chunks: [{ kind: "good_example", path: "/tmp/skills/by-kind/good-example.json" }]
            }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        assert.deepEqual(response.artifact.items[0].sourceFactIds, ["fact-1"]);
        const prompt = invocations[0].args[2];
        assert.match(prompt, /modelRequirementView|Model requirement view/);
        assert.match(prompt, /sourceFactIds/);
        assert.match(prompt, /sourceAnchorIds/);
        assert.match(prompt, /requiredTitleOutline/);
        assert.match(prompt, /requiredLeafCount/);
        assert.match(prompt, /manifest\.json/);
        assert.match(prompt, /module_rule_1/);
        assert.doesNotMatch(prompt, /^Outline:/m);
        assert.doesNotMatch(prompt, /Requirement title/);
        assert.doesNotMatch(prompt, /sourceRefs must exactly reuse/i);
      });
    }
  },
  {
    name: "Hermes agent client content_generate prompt treats MRV JSON as C replacement when no C asset is selected",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"items\":[{\"requirementText\":\"MRV JSON text\",\"type\":\"functional\",\"verificationHint\":\"inspect\",\"sourceFactIds\":[\"fact-json-1\"],\"sourceAnchorIds\":[],\"conflictNote\":\"\"}]}\n\nsession_id: 20260511_124716_mrvjson\n",
              stderr: ""
            };
          }
        });

        await client.executeStep({
          taskId: "task-mrv-json-contract",
          stepType: "content_generate",
          allowedPaths: ["/tmp/low-voltage-model-requirement-view.json", "/tmp/skills/manifest.json"],
          inputArtifact: {
            project: { name: "VCU", documentType: "software_requirement" },
            assets: [
              {
                assetId: "asset-json",
                fileName: "低压能量管理-model-requirement-view.json",
                fileRole: "model_requirement_view_json",
                absolutePath: "/tmp/low-voltage-model-requirement-view.json"
              }
            ],
            anchors: [],
            recalledAtoms: [],
            modelRequirementView: {
              version: "1.0",
              documentType: "software_requirement",
              compactForGeneration: { strategy: "mrv_compact_generation_v1", originalFactCount: 4552, factCount: 120 },
              sourceAssets: [{ assetId: "asset-json", fileName: "低压能量管理-model-requirement-view.json", fileRole: "model_requirement_view_json" }],
              facts: [
                {
                  id: "fact-json-1",
                  topic: "派生信号定义",
                  condition: "HvCoorn_bStartUpReq",
                  behavior: "派生信号 HvCoorn_bStartUpReq = KL15 == OFF",
                  signals: ["HvCoorn_bStartUpReq", "KL15"],
                  parameters: [],
                  stateLogic: "",
                  sourceRefs: [
                    {
                      fileName: "HvCoorn.slx",
                      fileRole: "simulink_slx",
                      location: "HvCoorn/Logic",
                      excerpt: "派生信号 HvCoorn_bStartUpReq = KL15 == OFF"
                    }
                  ]
                }
              ]
            },
            requiredTitleOutline: buildManualTitleOutline([{ sectionTitle: "智能补电", itemTitles: ["智能补电激活判断"] }]),
            requiredLeafCount: 1,
            template: { requirementIdPrefix: "SWR", sections: [] },
            skillBundle: {
              bundlePath: "/tmp/skills",
              manifestPath: "/tmp/skills/manifest.json",
              recommendedSkillCodes: [],
              chunks: []
            }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        const prompt = invocations[0].args[2];
        assert.match(prompt, /No generated C source is present/);
        assert.match(prompt, /sourceFactIds should include relevant implementation evidence/);
        assert.match(prompt, /compact generation view/);
        assert.match(prompt, /"hasGeneratedCodeAsset": false/);
        assert.match(prompt, /"hasModelRequirementJsonAsset": true/);
      });
    }
  },
  {
    name: "Hermes agent client keeps skill bundle path even when recommended skill shortlist is empty",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"summary\":\"outline\",\"sections\":[{\"title\":\"Section\",\"objective\":\"Goal\",\"anchorIds\":[\"anchor-1\"]}]}\n\nsession_id: 20260421_144512_outline03\n",
              stderr: ""
            };
          }
        });

        const response = await client.executeStep({
          taskId: "task-cli-empty-shortlist",
          stepType: "outline_build",
          allowedPaths: ["/tmp/charging-model.c", "/tmp/skills/skill-manifest.json"],
          skillBundlePath: "/tmp/skills/skill-manifest.json",
          recommendedSkillCodes: [],
          inputArtifact: {
            assets: [
              {
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                absolutePath: "/tmp/charging-model.c"
              }
            ],
            anchors: [
              {
                anchorId: "anchor-1",
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                location: "line 10-18",
                anchorType: "behavior",
                excerpt: "chargeState = 1;",
                summary: "充电状态输出被置位"
              }
            ],
            recalledAtoms: [],
            template: { requirementIdPrefix: "SWR", sections: [] }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        assert.equal(response.status, "succeeded");
        const prompt = invocations[0].args[2];
        assert.match(prompt, /skill-manifest\.json/);
        assert.match(prompt, /Task skill bundle/);
      });
    }
  },
  {
    name: "Hermes agent client outline_build prompt keeps manifest and shortlist but omits skill chunks and atom正文",
    run: async () => {
      await withTempConfig(async () => {
        const invocations = [];
        const client = new HermesAgentClient({
          transport: "cli",
          commandRunner: async (command, args, options) => {
            invocations.push({ command, args, options });
            return {
              stdout:
                "{\"summary\":\"outline\",\"sections\":[{\"title\":\"Section\",\"objective\":\"Goal\",\"anchorIds\":[\"anchor-1\"]}]}\n\nsession_id: 20260421_175100_outline04\n",
              stderr: ""
            };
          }
        });

        await client.executeStep({
          taskId: "task-cli-outline-manifest-only",
          stepType: "outline_build",
          allowedPaths: ["/tmp/charging-model.c", "/tmp/skills/skill-manifest.json"],
          skillBundlePath: "/tmp/skills/skill-manifest.json",
          recommendedSkillCodes: ["module_rule_1"],
          inputArtifact: {
            assets: [
              {
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                absolutePath: "/tmp/charging-model.c"
              }
            ],
            anchors: [
              {
                anchorId: "anchor-1",
                assetId: "asset-1",
                fileName: "charging-model.c",
                fileRole: "generatedCode",
                location: "line 10-18",
                anchorType: "behavior",
                excerpt: "chargeState = 1;",
                summary: "充电状态输出被置位"
              }
            ],
            recalledAtoms: [
              {
                skillCode: "module_rule_1",
                title: "Module rule",
                matchedReason: "命中关键词：charge / state",
                content: "This should not appear in the outline prompt."
              }
            ],
            skillBundle: {
              bundlePath: "/tmp/skills",
              manifestPath: "/tmp/skills/skill-manifest.json",
              recommendedSkillCodes: ["module_rule_1"],
              chunks: [{ kind: "good_example", path: "/tmp/skills/by-chunk/chunk-001.json" }]
            },
            template: { requirementIdPrefix: "SWR", sections: [] }
          },
          skillInventory: { items: [] },
          llmProfileSnapshot: null
        });

        const prompt = invocations[0].args[2];
        assert.match(prompt, /skill-manifest\.json/);
        assert.match(prompt, /module_rule_1/);
        assert.doesNotMatch(prompt, /chunk-001\.json/);
        assert.doesNotMatch(prompt, /This should not appear in the outline prompt\./);
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
    name: "Task detail frontend recognizes anchor and skill bundle stages",
    run: async () => {
      const hierarchySource = await fs.readFile(new URL("../public/hierarchy.js", import.meta.url), "utf8");
      const taskDetailSource = await fs.readFile(new URL("../public/task-detail.html", import.meta.url), "utf8");

      assert.match(hierarchySource, /正在构建引用锚点/);
      assert.match(hierarchySource, /正在读取 Skill 清单/);
      assert.match(hierarchySource, /正在补读 Skill 正文/);
      assert.match(hierarchySource, /正在回填来源引用/);
      assert.match(hierarchySource, /content_generate_returned/);
      assert.match(hierarchySource, /function ensureTaskDetailPolling[\s\S]*renderTaskAgentRuntime\(task\);/);
      assert.match(taskDetailSource, /Agent 运行日志/);
    }
  },
  {
    name: "Task detail frontend recognizes Hermes module bootstrap stages",
    run: async () => {
      const hierarchySource = await fs.readFile(new URL("../public/hierarchy.js", import.meta.url), "utf8");

      assert.match(hierarchySource, /module_bootstrap/);
      assert.match(hierarchySource, /module_bootstrap_analyze/);
      assert.match(hierarchySource, /module_bootstrap_generate/);
      assert.match(hierarchySource, /module_profile_persist/);
      assert.match(hierarchySource, /正在提炼模块 Skill/);
      assert.match(hierarchySource, /正在分析模块输入并提炼模块主题/);
      assert.match(hierarchySource, /正在生成模块 Skill/);
      assert.match(hierarchySource, /正在写入模块 Skill/);
    }
  },
  {
    name: "Readable requirement preview keeps decimal thresholds intact while preserving explicit ordered lists",
    run: async () => {
      const hierarchySource = await fs.readFile(new URL("../public/hierarchy.js", import.meta.url), "utf8");
      const normalizeStart = hierarchySource.indexOf("function normalizeReadableRequirementText");
      const formatStart = hierarchySource.indexOf("function formatReadableRequirementHtml");
      const collectStart = hierarchySource.indexOf("function collectTasks");

      assert.ok(normalizeStart >= 0);
      assert.ok(formatStart > normalizeStart);
      assert.ok(collectStart > formatStart);

      const functionBlock = hierarchySource.slice(normalizeStart, collectStart);
      const runtime = new Function(
        "escapeHtml",
        `${functionBlock}\nreturn { normalizeReadableRequirementText, formatReadableRequirementHtml };`
      )((value) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;")
      );

      const decimalHtml = runtime.formatReadableRequirementHtml(
        "若车辆由 ON 切换至 OFF 后持续未休眠时间 < 20 分钟，则即使检测到 EBS_U_BATT≤11.8V，软件也不应仅基于该电压条件激活智能补电。"
      );
      assert.ok(decimalHtml.includes("11.8V"));
      assert.doesNotMatch(decimalHtml, /<ol class="accepted-list">/);

      const orderedListHtml = runtime.formatReadableRequirementHtml("1. 条件一\n2. 条件二");
      assert.match(orderedListHtml, /<ol class="accepted-list">/);
      assert.match(orderedListHtml, /<li>条件一<\/li>/);
      assert.match(orderedListHtml, /<li>条件二<\/li>/);
    }
  },
  {
    name: "Generator frontend distinguishes scoped module skill readiness states",
    run: async () => {
      const source = await fs.readFile(new URL("../public/generator.js", import.meta.url), "utf8");

      assert.match(source, /hasScopedModuleSkill/);
      assert.match(source, /usesLegacyGlobalFallback/);
      assert.match(source, /doc type scoped skill ready/);
      assert.match(source, /legacy global fallback/);
    }
  },
  {
    name: "Generator frontend shows explicit bootstrap entry for cold-start modules",
    run: async () => {
      const source = await fs.readFile(new URL("../public/generator.js", import.meta.url), "utf8");

      assert.match(source, /module_skill_bootstrap/);
      assert.match(source, /requiresExplicitBootstrap/);
      assert.match(source, /开始技能冷启动/);
      assert.match(source, /当前模块被标记为冷启动模式/);
    }
  },
  {
    name: "Software requirement generator frontend exposes two-level manual title outline editor",
    run: async () => {
      const html = await fs.readFile(new URL("../public/requirement-generation.html", import.meta.url), "utf8");
      const script = await fs.readFile(new URL("../public/generator.js", import.meta.url), "utf8");
      const moduleDetailHtml = await fs.readFile(new URL("../public/module-detail.html", import.meta.url), "utf8");
      const hierarchySource = await fs.readFile(new URL("../public/hierarchy.js", import.meta.url), "utf8");

      assert.match(html, /manual-title-outline-card/);
      assert.match(html, /人工标题框架/);
      assert.match(html, /新增一级标题/);

      assert.match(script, /manualTitleOutline/);
      assert.match(script, /isManualTitleOutlineVisible/);
      assert.match(script, /manual-title-outline-add-section/);
      assert.match(script, /move-section-up/);
      assert.match(script, /move-item-down/);
      assert.match(script, /LAST_STARTED_MANUAL_TITLE_OUTLINE_STORAGE_KEY/);
      assert.match(script, /restoreLastStartedManualTitleOutline/);
      assert.match(script, /persistLastStartedManualTitleOutline/);
      assert.match(script, /至少需要 1 个一级标题/);
      assert.match(script, /下至少需要 1 个二级标题/);
      assert.match(script, /manualTitleOutlinePayload/);
      assert.match(script, /manualTitleOutline\", JSON\.stringify\(manualTitleOutlinePayload\)/);

      assert.match(hierarchySource, /groupItemsBySectionTitle/);
      assert.match(hierarchySource, /result-section-group/);
      assert.match(hierarchySource, /accepted-section-group/);
      assert.match(hierarchySource, /sectionTitle/);
      assert.match(hierarchySource, /itemTitle/);

      assert.match(moduleDetailHtml, /accepted-edit-section-title/);
      assert.match(moduleDetailHtml, /accepted-edit-item-title/);
    }
  },
  {
    name: "Software requirement generator frontend hides human example inputs during formal generation",
    run: async () => {
      const script = await fs.readFile(new URL("../public/generator.js", import.meta.url), "utf8");

      assert.match(script, /isFormalSoftwareRequirementGeneration/);
      assert.match(script, /reference_requirement_example/);
      assert.match(script, /extracted_software_requirement/);
      assert.match(script, /input\[name="referenceExample"\]/);
      assert.match(script, /field\.hidden = true/);
      assert.match(script, /getSelectableAssets/);
    }
  },
  {
    name: "Software requirement generator frontend submit path only uses defined manual title outline validation helpers",
    run: async () => {
      const script = await fs.readFile(new URL("../public/generator.js", import.meta.url), "utf8");

      const referencesUndefinedValidationHelper = /(^|[^\w.])validateManualTitleOutline\(/m.test(script);
      const definesValidationHelper = /function\s+validateManualTitleOutline\s*\(/.test(script);

      assert.ok(
        !referencesUndefinedValidationHelper || definesValidationHelper,
        "generator submit path references validateManualTitleOutline() but does not define it"
      );
    }
  },
  {
    name: "Task detail structured rejection collects form data before disabling form controls",
    run: async () => {
      const script = await fs.readFile(new URL("../public/hierarchy.js", import.meta.url), "utf8");
      const handlerStart = script.indexOf("async function handleRejectSubmit");
      const handlerEnd = script.indexOf("function setRejectSubmitting", handlerStart);
      const handlerBlock = script.slice(handlerStart, handlerEnd);
      const formDataIndex = handlerBlock.indexOf("const formData = new FormData(rejectForm);");
      const disableIndex = handlerBlock.indexOf("setRejectSubmitting(true);");

      assert.ok(formDataIndex >= 0, "handleRejectSubmit must collect FormData");
      assert.ok(disableIndex >= 0, "handleRejectSubmit must still toggle submitting state");
      assert.ok(
        formDataIndex < disableIndex,
        "handleRejectSubmit should read FormData before disabling form controls"
      );
    }
  },
  {
    name: "Hermes module bootstrap prompt constrains generated kinds to module layer allowances",
    run: async () => {
      const source = await fs.readFile(new URL("../src/services/hermes-agent-client.js", import.meta.url), "utf8");

      assert.match(source, /module layer allowed kinds/i);
      assert.match(source, /document_blueprint_section/);
      assert.match(source, /source_policy_setting/);
      assert.match(source, /Do not output `document_blueprint_section` or `document_blueprint_policy`/);
      assert.doesNotMatch(source, /Required JSON shape:[\s\S]*documentBlueprint/);
    }
  },
  {
    name: "Module knowledge import rewrites disallowed blueprint guidance into module-allowed kinds",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "High Voltage Safety",
          moduleSkillKey: "high_voltage_safety"
        };

        await service.persistBootstrappedKnowledge(module, "software_requirement", {
          version: 1,
          generationPriorities: ["先写主线。"],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              subdomain: "高压安全管理",
              sectionHints: ["绝缘检测"],
              writingPattern: "先写主线，再写故障分支。",
              targetStyle: "software requirement",
              sourceBasis: ["system anchors"]
            }
          ],
          antiPatterns: [],
          documentBlueprint: {
            preferredFunctionSection: {
              title: "高压安全管理"
            },
            preferredSubsections: [
              {
                title: "绝缘检测",
                coreRequirementTypes: ["software_requirement"]
              }
            ],
            targetOutputPolicy: {
              coreFirst: true
            }
          }
        });

        const registry = await service.registryService.loadProfileRegistry("module", module.moduleSkillKey);
        assert.ok(!registry.items.some((item) => item.kind === "document_blueprint_section"));
        assert.ok(!registry.items.some((item) => item.kind === "document_blueprint_policy"));
        assert.ok(registry.items.some((item) => item.kind === "source_policy_setting" && item.structuredPayload?.key === "preferredFunctionSection"));
        assert.ok(registry.items.some((item) => item.kind === "source_policy_setting" && item.structuredPayload?.key === "coreFirst"));
      });
    }
  },
  {
    name: "Legacy module bootstrap LLM prompt forbids blueprint kinds for module layer generation",
    run: async () => {
      const source = await fs.readFile(new URL("../src/services/module-skill-bootstrap-llm-service.js", import.meta.url), "utf8");

      assert.match(source, /module 层允许的 kind 只有/);
      assert.match(source, /不要输出 documentBlueprint/);
      assert.match(source, /ruleHints\.sectionHints、generationPriorities 或 sourceOfTruthPolicy/);
    }
  },
  {
    name: "Module skill preview returns all library candidates and sorts exact matches first",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();

        await service.persistBootstrappedKnowledge(
          { name: "Charging Management", moduleSkillKey: "charging_management", domain: "embedded_vcu" },
          "software_requirement",
          {
            version: 1,
            generationPriorities: ["优先保留充电管理主线。"],
            examples: [],
            ruleHints: [{ domain: "embedded_vcu", sectionHints: ["充电管理"], writingPattern: "先写主流程。", targetStyle: "software requirement" }],
            antiPatterns: ["不要遗漏退出条件。"]
          }
        );
        await service.persistBootstrappedKnowledge(
          { name: "Thermal Management", moduleSkillKey: "thermal_management", domain: "embedded_vcu" },
          "software_requirement",
          {
            version: 1,
            generationPriorities: ["优先保留热管理主线。"],
            examples: [],
            ruleHints: [{ domain: "embedded_vcu", sectionHints: ["热管理"], writingPattern: "先写热控流程。", targetStyle: "software requirement" }],
            antiPatterns: ["不要混入无关控制。"]
          }
        );

        const blankPreview = await service.previewNewModule({ documentType: "software_requirement", domain: "embedded_vcu" }, {}, {});
        assert.ok(blankPreview.skillCandidates.length >= 2);
        assert.ok(blankPreview.skillCandidates.some((item) => item.key === "charging_management"));
        assert.ok(blankPreview.skillCandidates.some((item) => item.key === "thermal_management"));

        const matchedPreview = await service.previewNewModule(
          { documentType: "software_requirement", domain: "embedded_vcu" },
          { name: "Charging Management" },
          {}
        );
        assert.equal(matchedPreview.skillCandidates[0].key, "charging_management");
        assert.equal(matchedPreview.moduleSkillKey, "charging_management");
      });
    }
  },
  {
    name: "Module create flow exposes explicit skill initialization modes",
    run: async () => {
      const html = await fs.readFile(new URL("../public/module-create.html", import.meta.url), "utf8");
      const source = await fs.readFile(new URL("../public/hierarchy.js", import.meta.url), "utf8");

      assert.match(html, /name="skillInitMode"/);
      assert.match(html, /value="import_existing"/);
      assert.match(html, /value="cold_start"/);
      assert.match(source, /payload\.skillInitMode/);
      assert.match(source, /候选 Module Skill/);
      assert.match(source, /模块会以冷启动模式创建/);
      assert.match(source, /syncModuleSkillKeyFromName/);
      assert.match(source, /未填写模块名称时，先展示库内全部 Module Skill/);
    }
  },
  {
    name: "Pipeline service requires manual title outline for software requirement formal generation",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        let hermesInvoked = false;

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async () => {
          hermesInvoked = true;
          throw new Error("Hermes should not run when manual title outline is missing");
        };

        const project = await projectService.createProject({ name: "Manual Outline Required Workspace" });
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

        await assert.rejects(
          () => pipelineService.generateForModule(project.id, module.id, "software_requirement", {}),
          /manualTitleOutline|manual title outline/i
        );
        assert.equal(hermesInvoked, false);
      });
    }
  },
  {
    name: "Pipeline service runs software requirement generation through Hermes workflow",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "slx_parse_generate") {
            assert.equal(payload.inputArtifact.slxFiles.length, 1);
            const slxAsset = payload.inputArtifact.slxFiles[0];
            return {
              status: "succeeded",
              artifact: {
                modelRequirementView: {
                  version: "1.0",
                  documentType: "software_requirement",
                  sourceAssets: [
                    {
                      assetId: slxAsset.id,
                      fileName: slxAsset.originalName,
                      fileRole: "simulink_slx",
                      absolutePath: slxAsset.absolutePath
                    }
                  ],
                  facts: [
                    {
                      id: "slx-fact-1",
                      topic: "SLX 充电使能接口",
                      behavior: "接口 ChargeEnable (input) 类型:boolean",
                      signals: ["ChargeEnable"],
                      sourceRefs: [
                        {
                          sourceAnchorId: "slx-anchor-1",
                          assetId: slxAsset.id,
                          fileName: slxAsset.originalName,
                          fileRole: "simulink_slx",
                          location: "ChargingModel/In1",
                          excerpt: "接口 ChargeEnable (input) 类型:boolean"
                        }
                      ]
                    }
                  ]
                },
                summary: "SLX 模型解析完成"
              }
            };
          }
          if (payload.stepType === "anchor_index_build") {
            assert.ok(payload.inputArtifact.assets.every((asset) => asset.fileRole !== "simulink_slx"));
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在充电使能时输出充电状态信号。",
                    summary: "充电使能时输出充电状态信号。",
                    tags: ["requirement-like", "state"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "atom_recall") {
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    skillCode: "module.charge_enable.state",
                    layer: "module",
                    profileKey: "charging_management",
                    kind: "good_example",
                    title: "充电状态信号输出",
                    content: "当充电使能时，软件应输出充电状态信号。",
                    order: 1,
                    matchedReason: "锚点明确提到充电状态输出。"
                  }
                ]
              }
            };
          }
          if (payload.stepType === "content_generate") {
            const sourceFactId = payload.inputArtifact.modelRequirementView.facts.find((fact) =>
              fact.sourceRefs?.some((sourceRef) => sourceRef.fileName === "charging-system.md")
            )?.id || payload.inputArtifact.modelRequirementView.facts[0]?.id;
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    title: "充电状态信号输出",
                    requirementText: "当充电使能时，软件应输出充电状态信号。",
                    type: "functional",
                    verificationHint: "验证充电使能时的状态输出。",
                    sourceFactIds: [sourceFactId],
                    sourceAnchorIds: [],
                    conflictNote: ""
                  }
                ]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Agent Validation Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "charging-system.md");
        const modelFilePath = path.join(uploadDir, "charging-model.c");
        const slxFilePath = path.join(uploadDir, "charging-model.slx");
        const referenceFilePath = path.join(uploadDir, "charging-reference.md");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");
        await fs.writeFile(modelFilePath, "void Charging_step(void) { chargeState = 1; }", "utf8");
        await fs.writeFile(slxFilePath, "fake slx payload", "utf8");
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
          slx: [
            {
              originalname: "charging-model.slx",
              filename: "charging-model.slx",
              path: slxFilePath,
              mimetype: "application/octet-stream",
              size: 16
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

        const manualTitleOutline = buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }]);
        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
          manualTitleOutline
        });
        assert.equal(result.task.status, "completed");
        assert.ok(result.task.resultItems.length >= 1);
        assert.ok(result.task.extractions.length >= 1);
        assert.ok(result.task.metrics.extractionEvidenceCount >= 1);
        assert.equal(result.task.debug.artifacts.assetManifest.length, 3);
        assert.equal(result.task.debug.artifacts.anchors.length, 2);
        assert.ok(result.task.debug.artifacts.anchors.some((anchor) => anchor.fileRole === "simulink_slx"));
        assert.ok(result.task.debug.artifacts.taskSkillBundle);
        assert.ok(result.task.debug.artifacts.taskSkillBundle.skillBundlePath);
        assert.ok(result.task.debug.artifacts.taskSkillBundle.skillManifestPath);
        assert.ok(Array.isArray(result.task.debug.artifacts.taskSkillBundle.recommendedSkillCodes));
        assert.ok(result.task.debug.artifacts.taskSkillBundle.effectiveSkillCount > 0);

        const skillBundlePath = result.task.debug.artifacts.taskSkillBundle.skillBundlePath;
        const skillManifestPath = result.task.debug.artifacts.taskSkillBundle.skillManifestPath;
        const manifest = JSON.parse(await fs.readFile(skillManifestPath, "utf8"));
        assert.ok(skillBundlePath.includes(result.task.id));
        assert.ok(Array.isArray(manifest.items));
        assert.ok(manifest.items.length > 0);
        assert.ok(manifest.items.every((item) => item.chunkPath));

        const contentPayload = hermesPayloads.find((payload) => payload.stepType === "content_generate");
        assert.equal(contentPayload.skillBundlePath, skillManifestPath);
        assert.ok(
          result.task.debug.artifacts.assetManifest.every((asset) => asset.fileRole !== "reference_requirement_example")
        );
        assert.ok(
          (contentPayload.inputArtifact.assets || []).every((asset) => asset.fileRole !== "reference_requirement_example")
        );
        assert.ok(Array.isArray(contentPayload.recommendedSkillCodes));
        assert.ok(contentPayload.recommendedSkillCodes.length > 0);
        assert.ok(contentPayload.recommendedSkillCodes.length <= config.hermes.maxRecalledAtoms);
        assert.ok(contentPayload.inputArtifact.modelRequirementView.facts.length >= 1);

        const stages = (result.task.timeline || []).map((entry) => entry.stage);
        assert.ok(stages.includes("task_init"));
        assert.ok(stages.includes("effective_skill_resolve"));
        assert.ok(stages.includes("slx_parse_generate"));
        assert.ok(stages.includes("anchor_index_build"));
        assert.ok(stages.includes("atom_recall"));
        assert.ok(!stages.includes("outline_build"));
        assert.ok(stages.includes("content_generate"));
        assert.ok(stages.includes("reference_resolve"));
        assert.ok(stages.includes("rule_validate"));
        assert.ok(stages.includes("persist_result"));

        assert.ok(result.task.resultItems[0].sourceFactIds.length >= 1);
        assert.ok(result.task.resultItems[0].id);
        assert.equal(result.task.resultItems[0].sectionTitle, "功能行为");
        assert.equal(result.task.resultItems[0].itemTitle, "充电状态信号输出");
        assert.equal(result.task.resultItems[0].title, "充电状态信号输出");
        assert.equal((result.task.resultItems[0].sourceRefs || []).length, 1);
        assert.equal(result.task.resultItems[0].sourceRefs[0].fileName, "charging-system.md");
        assert.equal(result.task.progress.stage, "completed");
      });
    }
  },
  {
    name: "Pipeline service rejects software requirement formal generation when only human example assets are selected",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        let hermesInvoked = false;

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async () => {
          hermesInvoked = true;
          throw new Error("Hermes should not run when only human example assets are selected");
        };

        const project = await projectService.createProject({ name: "Reference Example Guard Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const referenceFilePath = path.join(uploadDir, "charging-reference.md");
        await fs.writeFile(referenceFilePath, "软件应在充电使能时输出充电状态信号。", "utf8");

        const attached = await projectService.attachModuleAssets(project.id, module.id, {
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

        await assert.rejects(
          () =>
            pipelineService.generateForModule(project.id, module.id, "software_requirement", {
              assetIds: attached.assets.map((asset) => asset.id),
              manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }])
            }),
          /正式软件需求生成不会使用人工范例资产/
        );
        assert.equal(hermesInvoked, false);
      });
    }
  },
  {
    name: "Pipeline service fails when Hermes content count does not match manual title outline leaves",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在充电使能时输出充电状态信号。",
                    summary: "充电使能时输出充电状态信号。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "atom_recall") {
            return { status: "succeeded", artifact: { items: [] } };
          }
          if (payload.stepType === "content_generate") {
            const sourceFactId = payload.inputArtifact.modelRequirementView.facts[0]?.id;
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    requirementText: "当充电使能时，软件应输出充电状态信号。",
                    type: "functional",
                    verificationHint: "验证充电使能时的状态输出。",
                    sourceFactIds: [sourceFactId],
                    sourceAnchorIds: [],
                    conflictNote: ""
                  }
                ]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Manual Outline Count Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "charging-system.md");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "charging-system.md",
              filename: "charging-system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ]
        });

        await assert.rejects(
          () =>
            pipelineService.generateForModule(project.id, module.id, "software_requirement", {
              manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["标题一", "标题二"] }])
            }),
          /must return exactly 2 result items/i
        );
      });
    }
  },
  {
    name: "Pipeline service bootstraps new module skill through Hermes before software requirement generation",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "module_bootstrap_analyze") {
            return {
              status: "succeeded",
              artifact: {
                summary: "模块冷启动分析",
                themes: [
                  {
                    title: "冷却请求建立",
                    anchorIds: ["anchor-1"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "module_bootstrap_generate") {
            return {
              status: "succeeded",
              artifact: {
                version: 1,
                generationPriorities: ["先写冷却请求主线。"],
                examples: [],
                ruleHints: [
                  {
                    domain: "embedded_vcu",
                    sectionHints: ["冷却请求建立"],
                    writingPattern: "先写建立，再写撤销。",
                    targetStyle: "software requirement"
                  }
                ],
                antiPatterns: ["不要混入执行器实现。"]
              }
            };
          }
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在满足热管理条件时建立冷却请求。",
                    summary: "满足热管理条件时建立冷却请求。",
                    tags: ["requirement-like", "state"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "content_generate") {
            const sourceFactId = payload.inputArtifact.modelRequirementView.facts[0]?.id;
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    requirementText: "当满足热管理条件时，软件应建立冷却请求。",
                    type: "functional",
                    verificationHint: "验证满足条件时冷却请求建立。",
                    sourceFactIds: [sourceFactId],
                    sourceAnchorIds: [],
                    conflictNote: ""
                  }
                ]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Cold Start Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Thermal Bootstrap",
          moduleSkillKey: "thermal_bootstrap"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "thermal-system.md");
        const modelFilePath = path.join(uploadDir, "thermal-model.c");
        const referenceFilePath = path.join(uploadDir, "thermal-reference.md");
        await fs.writeFile(systemFilePath, "系统应在满足热管理条件时建立冷却请求。", "utf8");
        await fs.writeFile(modelFilePath, "void Thermal_step(void) { coolingReq = 1; }", "utf8");
        await fs.writeFile(referenceFilePath, "软件应先写冷却请求建立，再写撤销条件。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "thermal-system.md",
              filename: "thermal-system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ],
          generatedCode: [
            {
              originalname: "thermal-model.c",
              filename: "thermal-model.c",
              path: modelFilePath,
              mimetype: "text/x-c",
              size: 42
            }
          ],
          referenceExample: [
            {
              originalname: "thermal-reference.md",
              filename: "thermal-reference.md",
              path: referenceFilePath,
              mimetype: "text/markdown",
              size: 27
            }
          ]
        });

        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
          manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["冷却请求建立"] }])
        });
        const stepTypes = hermesPayloads.map((payload) => payload.stepType);

        assert.equal(result.task.status, "completed");
        assert.ok(stepTypes.includes("module_bootstrap_analyze"));
        assert.ok(stepTypes.includes("module_bootstrap_generate"));
        assert.ok(!stepTypes.includes("outline_build"));
        assert.ok(stepTypes.indexOf("module_bootstrap_generate") < stepTypes.indexOf("content_generate"));

        const inspection = await pipelineService.moduleSkillService.inspectModule(project, module, "software_requirement");
        assert.equal(inspection.hasScopedModuleSkill, true);
        assert.equal(inspection.hasUsableModuleSkill, true);

        const persistedRegistry = await pipelineService.moduleSkillService.loadModuleRegistry("thermal_bootstrap");
        assert.ok(
          persistedRegistry.items.some(
            (item) => item.kind === "rule_hint" && item.documentTypeScope === "software_requirement"
          )
        );

        const stages = (result.task.timeline || []).map((entry) => entry.stage);
        assert.ok(stages.includes("module_bootstrap"));
        assert.ok(stages.includes("module_bootstrap_analyze"));
        assert.ok(stages.includes("module_bootstrap_generate"));
        assert.ok(stages.includes("module_profile_persist"));
      });
    }
  },
  {
    name: "Pipeline service fails when Hermes cold-start bootstrap step fails",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在满足条件时触发失败路径。",
                    summary: "满足条件时触发失败路径。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "module_bootstrap_analyze") {
            throw new Error("Hermes cold-start analyze failed");
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Cold Start Failure Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Failure Module",
          moduleSkillKey: "failure_module"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "failure-system.md");
        const modelFilePath = path.join(uploadDir, "failure-model.c");
        const referenceFilePath = path.join(uploadDir, "failure-reference.md");
        await fs.writeFile(systemFilePath, "系统应在满足条件时触发失败路径。", "utf8");
        await fs.writeFile(modelFilePath, "void Failure_step(void) { failureFlag = 1; }", "utf8");
        await fs.writeFile(referenceFilePath, "优秀范例：先写失败建立，再写恢复。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "failure-system.md",
              filename: "failure-system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 20
            }
          ],
          generatedCode: [
            {
              originalname: "failure-model.c",
              filename: "failure-model.c",
              path: modelFilePath,
              mimetype: "text/x-c",
              size: 39
            }
          ],
          referenceExample: [
            {
              originalname: "failure-reference.md",
              filename: "failure-reference.md",
              path: referenceFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ]
        });

        await assert.rejects(
          () =>
            pipelineService.generateForModule(project.id, module.id, "software_requirement", {
              manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "失败路径", itemTitles: ["失败路径建立"] }])
            }),
          /Hermes cold-start analyze failed/
        );

        const task = await projectService.getLatestGenerationTask(project.id, module.id, "software_requirement");
        const stages = (task.timeline || []).map((entry) => entry.stage);
        assert.equal(task.status, "failed");
        assert.ok(stages.includes("module_bootstrap"));
      });
    }
  },
  {
    name: "Pipeline service supports standalone module skill bootstrap tasks",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在热管理条件成立时建立冷却请求。",
                    summary: "热管理条件成立时建立冷却请求。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "module_bootstrap_analyze") {
            return {
              status: "succeeded",
              artifact: {
                summary: "模块冷启动分析",
                themes: [
                  {
                    title: "冷却请求建立",
                    anchorIds: ["anchor-1"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "module_bootstrap_generate") {
            return {
              status: "succeeded",
              artifact: {
                version: 1,
                generationPriorities: ["先写冷却请求主线。"],
                examples: [],
                ruleHints: [
                  {
                    domain: "embedded_vcu",
                    writingPattern: "先写建立，再写撤销。",
                    targetStyle: "software requirement"
                  }
                ],
                antiPatterns: ["不要混入执行器实现。"]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Standalone Bootstrap Project" });
        const module = await projectService.createModule(project.id, {
          name: "Bootstrap Module",
          moduleSkillKey: "bootstrap_module",
          skillInitMode: "cold_start"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "bootstrap-system.md");
        const modelFilePath = path.join(uploadDir, "bootstrap-model.c");
        const referenceFilePath = path.join(uploadDir, "bootstrap-reference.md");
        await fs.writeFile(systemFilePath, "系统应在热管理条件成立时建立冷却请求。", "utf8");
        await fs.writeFile(modelFilePath, "void Bootstrap_step(void) { coolingReq = 1; }", "utf8");
        await fs.writeFile(referenceFilePath, "软件应先写冷却请求建立，再写撤销条件。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "bootstrap-system.md",
              filename: "bootstrap-system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ],
          generatedCode: [
            {
              originalname: "bootstrap-model.c",
              filename: "bootstrap-model.c",
              path: modelFilePath,
              mimetype: "text/x-c",
              size: 42
            }
          ],
          referenceExample: [
            {
              originalname: "bootstrap-reference.md",
              filename: "bootstrap-reference.md",
              path: referenceFilePath,
              mimetype: "text/markdown",
              size: 27
            }
          ]
        });

        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
          taskIntent: "module_skill_bootstrap"
        });

        assert.equal(result.task.status, "completed");
        assert.equal(result.task.taskKind, "module_skill_bootstrap");
        assert.equal(result.task.resultItems.length, 0);
        assert.ok(hermesPayloads.some((payload) => payload.stepType === "module_bootstrap_analyze"));
        assert.ok(hermesPayloads.some((payload) => payload.stepType === "module_bootstrap_generate"));
        assert.ok(!hermesPayloads.some((payload) => payload.stepType === "outline_build"));

        const inspection = await pipelineService.moduleSkillService.inspectModule(project, module, "software_requirement");
        assert.equal(inspection.hasScopedModuleSkill, true);
      });
    }
  },
  {
    name: "Standalone module skill bootstrap accepts extracted requirement assets as cold-start inputs",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在低压补电条件满足时建立补电请求。",
                    summary: "低压补电条件满足时建立补电请求。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "module_bootstrap_analyze") {
            return {
              status: "succeeded",
              artifact: {
                summary: "低压能量管理模块冷启动分析",
                themes: [
                  {
                    title: "智能补电建立与退出",
                    anchorIds: ["anchor-1"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "module_bootstrap_generate") {
            return {
              status: "succeeded",
              artifact: {
                version: 1,
                generationPriorities: ["优先描述智能补电建立与退出主线。"],
                examples: [],
                ruleHints: [],
                antiPatterns: []
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Extracted Bootstrap Project" });
        const module = await projectService.createModule(project.id, {
          name: "低压能量管理",
          moduleSkillKey: "low_voltage_energy_management",
          skillInitMode: "cold_start"
        });

        await projectService.createExtractedModuleAsset(project.id, module.id, {
          targetDocumentType: "system_requirement",
          markdown: "# 低压能量管理系统需求\n\n系统应在补电条件满足时建立补电请求。"
        });
        await projectService.createExtractedModuleAsset(project.id, module.id, {
          targetDocumentType: "software_requirement",
          markdown: "# 低压能量管理软件需求\n\n软件应在补电条件满足时建立补电请求。"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const modelFilePath = path.join(uploadDir, "low-voltage-energy-model.c");
        await fs.writeFile(modelFilePath, "void LowVoltageEnergy_step(void) { intelligentCharge = 1; }", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          generatedCode: [
            {
              originalname: "low-voltage-energy-model.c",
              filename: "low-voltage-energy-model.c",
              path: modelFilePath,
              mimetype: "text/x-c",
              size: 60
            }
          ]
        });

        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
          taskIntent: "module_skill_bootstrap"
        });

        assert.equal(result.task.status, "completed");
        assert.equal(result.task.taskKind, "module_skill_bootstrap");
        assert.ok(hermesPayloads.some((payload) => payload.stepType === "module_bootstrap_analyze"));

        const inspection = await pipelineService.moduleSkillService.inspectModule(project, module, "software_requirement");
        assert.equal(inspection.hasScopedModuleSkill, true);
      });
    }
  },
  {
    name: "Initialization check exposes explicit bootstrap guidance for cold-start modules",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Init Check Project" });
        const module = await projectService.createModule(project.id, {
          name: "Cold Start Module",
          moduleSkillKey: "cold_start_module",
          skillInitMode: "cold_start"
        });

        await withTestServer(async ({ baseUrl }) => {
          const response = await fetch(
            `${baseUrl}/api/projects/${project.id}/modules/${module.id}/initialization-check?documentType=software_requirement`
          );
          assert.equal(response.status, 200);
          const inspection = await response.json();

          assert.equal(inspection.requiresExplicitBootstrap, true);
          assert.equal(inspection.recommendedAction, "module_skill_bootstrap");
        });
      });
    }
  },
  {
    name: "Pipeline service fails software requirement generation when Hermes returns invalid sourceAnchorIds",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在充电使能时输出充电状态信号。",
                    summary: "充电使能时输出充电状态信号。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "atom_recall") {
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    skillCode: "module.charge_enable.state",
                    layer: "module",
                    profileKey: "charging_management",
                    kind: "good_example",
                    title: "充电状态信号输出",
                    content: "当充电使能时，软件应输出充电状态信号。",
                    order: 1,
                    matchedReason: "锚点明确提到充电状态输出。"
                  }
                ]
              }
            };
          }
          if (payload.stepType === "content_generate") {
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    requirementText: "当充电使能时，软件应输出充电状态信号。",
                    type: "functional",
                    verificationHint: "验证充电使能时的状态输出。",
                    sourceAnchorIds: ["anchor-missing"],
                    conflictNote: ""
                  }
                ]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Anchor Failure Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "charging-system.md");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "charging-system.md",
              filename: "charging-system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ]
        });

        await assert.rejects(
          () =>
            pipelineService.generateForModule(project.id, module.id, "software_requirement", {
              manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }])
            }),
          /sourceAnchorId outside the anchor index set/
        );

        let task = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          task = await projectService.getLatestGenerationTask(project.id, module.id, "software_requirement");
          if (task?.status === "failed") {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(task.status, "failed");
        assert.equal(task.progress.stage, "failed");
        assert.match(task.errorMessage, /sourceAnchorId outside the anchor index set/);
        assert.ok((task.timeline || []).some((entry) => entry.stage === "anchor_index_build"));
      });
    }
  },
  {
    name: "Pipeline service fails software requirement generation when Hermes returns invalid sourceFactIds",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在充电使能时输出充电状态信号。",
                    summary: "充电使能时输出充电状态信号。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "atom_recall") {
            return { status: "succeeded", artifact: { items: [] } };
          }
          if (payload.stepType === "content_generate") {
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    requirementText: "当充电使能时，软件应输出充电状态信号。",
                    type: "functional",
                    verificationHint: "验证充电使能时的状态输出。",
                    sourceFactIds: ["fact-missing"],
                    sourceAnchorIds: [],
                    conflictNote: ""
                  }
                ]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Fact Failure Workspace" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });

        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "charging-system.md");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");

        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "charging-system.md",
              filename: "charging-system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ]
        });

        await assert.rejects(
          () =>
            pipelineService.generateForModule(project.id, module.id, "software_requirement", {
              manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }])
            }),
          /sourceFactId outside the modelRequirementView fact set/
        );
      });
    }
  },
  {
    name: "Hermes API server supports anchor-based software requirement contract",
    run: async () => {
      await withTempConfig(async () => {
        await withHermesServer(async ({ baseUrl }) => {
          const assetDir = path.join(config.uploadDir, "anchor-contract");
          await fs.mkdir(assetDir, { recursive: true });
          const modelFilePath = path.join(assetDir, "charging-model.c");
          await fs.writeFile(
            modelFilePath,
            "void Charging_step(void) { chargeState = 1; chargeEnable = 1; }",
            "utf8"
          );

          const indexResponse = await fetch(`${baseUrl}/internal/steps/execute`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              stepType: "anchor_index_build",
              allowedPaths: [assetDir],
              inputArtifact: {
                assets: [
                  {
                    id: "asset-generated-code",
                    fileRole: "generated_code",
                    originalName: "charging-model.c",
                    absolutePath: modelFilePath
                  }
                ]
              }
            })
          });
          assert.equal(indexResponse.status, 200);
          const indexPayload = await indexResponse.json();
          assert.equal(indexPayload.status, "succeeded");
          assert.ok(Array.isArray(indexPayload.artifact?.anchors));
          assert.ok(indexPayload.artifact.anchors.length >= 1);
          assert.ok(indexPayload.artifact.anchors[0].anchorId);

          const anchors = indexPayload.artifact.anchors;
          const recallResponse = await fetch(`${baseUrl}/internal/steps/execute`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              stepType: "atom_recall",
              skillInventory: {
                items: [
                  {
                    skillCode: "module.charge_enable.state",
                    kind: "good_example",
                    layer: "module",
                    profileKey: "charging_management",
                    title: "充电状态信号输出",
                    content: "当充电使能生效时，软件应输出充电状态信号。",
                    order: 1
                  }
                ]
              },
              inputArtifact: { anchors }
            })
          });
          assert.equal(recallResponse.status, 200);
          const recallPayload = await recallResponse.json();
          assert.ok(Array.isArray(recallPayload.artifact?.items));
          assert.ok(recallPayload.artifact.items.length >= 1);

          const outlineResponse = await fetch(`${baseUrl}/internal/steps/execute`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              stepType: "outline_build",
              inputArtifact: {
                anchors,
                recalledAtoms: recallPayload.artifact.items
              }
            })
          });
          assert.equal(outlineResponse.status, 200);
          const outlinePayload = await outlineResponse.json();
          assert.ok(Array.isArray(outlinePayload.artifact?.sections));
          assert.ok(outlinePayload.artifact.sections.length >= 1);
          assert.ok(Array.isArray(outlinePayload.artifact.sections[0].anchorIds));

          const contentResponse = await fetch(`${baseUrl}/internal/steps/execute`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              stepType: "content_generate",
              inputArtifact: {
                project: {
                  name: "Charging Module",
                  documentType: "software_requirement"
                },
                template: {
                  requirementIdPrefix: "SWR"
                },
                anchors,
                recalledAtoms: recallPayload.artifact.items,
                outline: outlinePayload.artifact,
                requiredTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }]),
                requiredLeafCount: 1
              }
            })
          });
          assert.equal(contentResponse.status, 200);
          const contentPayload = await contentResponse.json();
          assert.ok(Array.isArray(contentPayload.artifact?.items));
          assert.ok(contentPayload.artifact.items.length >= 1);
          assert.ok(Array.isArray(contentPayload.artifact.items[0].sourceAnchorIds));
          assert.ok(contentPayload.artifact.items[0].sourceAnchorIds.length >= 1);
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
            stepType: "content_generate",
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
          () =>
            pipelineService.generateForModule(project.id, module.id, "software_requirement", {
              manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }])
            }),
          /timed out/
        );

        const task = await projectService.getLatestGenerationTask(project.id, module.id, "software_requirement");
        assert.equal(task.status, "failed");
        assert.equal(task.progress.stage, "failed");
        assert.match(task.errorMessage, /timed out/);
        assert.equal(task.debug.agent.status, "failed");
        assert.equal(task.debug.agent.currentStep, "content_generate");
        assert.match(task.debug.events.at(-1)?.message || "", /timed out/);
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

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          if (payload.stepType === "anchor_index_build") {
            return {
              status: "succeeded",
              artifact: {
                anchors: [
                  {
                    anchorId: "anchor-1",
                    assetId: payload.inputArtifact.assets[0].assetId || payload.inputArtifact.assets[0].id,
                    fileName: payload.inputArtifact.assets[0].fileName,
                    fileRole: payload.inputArtifact.assets[0].fileRole,
                    location: "page:1",
                    anchorType: "requirement_clause",
                    excerpt: "系统应在充电使能时输出充电状态信号。",
                    summary: "充电使能时输出充电状态信号。",
                    tags: ["requirement-like"]
                  }
                ]
              }
            };
          }
          if (payload.stepType === "atom_recall") {
            return { status: "succeeded", artifact: { items: [] } };
          }
          if (payload.stepType === "content_generate") {
            const sourceFactId = payload.inputArtifact.modelRequirementView.facts[0]?.id;
            return {
              status: "succeeded",
              artifact: {
                items: [
                  {
                    requirementText: "当充电使能时，软件应输出充电状态信号。",
                    type: "functional",
                    verificationHint: "验证充电使能时的状态输出。",
                    sourceFactIds: [sourceFactId],
                    sourceAnchorIds: [],
                    conflictNote: ""
                  }
                ]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

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

        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
          manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }])
        });
        assert.equal(result.task.documentType, "software_requirement");
        assert.equal(result.task.status, "completed");
        assert.equal(result.task.resultItems.length, 1);
        assert.equal(result.task.resultItems[0].sectionTitle, "功能行为");
        assert.equal(result.task.resultItems[0].itemTitle, "充电状态信号输出");

        const accepted = await projectService.createAcceptedItem(project.id, module.id, "software_requirement", {
          sourceTaskId: result.task.id,
          sourceResultItemId: result.task.resultItems[0].id,
          requirementText: "软件应在充电使能时输出充电状态信号，并记录状态变化。"
        });
        assert.equal(accepted.sourceTaskId, result.task.id);
        assert.ok(accepted.acceptedSnapshot.requirementText.length > 0);
        assert.equal(accepted.currentContent.sectionTitle, "功能行为");
        assert.equal(accepted.currentContent.itemTitle, "充电状态信号输出");
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
            sectionTitle: "补充章节",
            itemTitle: "补充条目",
            requirementText: "软件应在充电使能时输出充电状态信号，并记录最近一次状态变化。"
          }
        );
        assert.equal(updated.currentContent.sectionTitle, "补充章节");
        assert.equal(updated.currentContent.itemTitle, "补充条目");
        assert.equal(updated.currentContent.title, "补充条目");
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
    name: "Project service persists document extraction tasks and versioned extracted assets",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Extractor Project" });
        const module = await projectService.createModule(project.id, { name: "高压能量管理" });

        const task = await projectService.recordDocumentExtractionTask(project.id, module.id, {
          targetDocumentType: "system_requirement",
          sourceMode: "mixed",
          status: "running",
          progress: {
            stage: "document_extract_prepare",
            label: "正在准备提取任务",
            message: "正在整理图片和文本输入。",
            percent: 10,
            updatedAt: new Date().toISOString()
          }
        });

        assert.equal(task.targetDocumentType, "system_requirement");
        assert.equal(task.sourceMode, "mixed");

        const completedTask = await projectService.updateDocumentExtractionTask(project.id, module.id, task.id, {
          status: "completed",
          summary: "已提取系统需求"
        });
        assert.equal(completedTask.status, "completed");

        const firstAsset = await projectService.createExtractedModuleAsset(project.id, module.id, {
          sourceTaskId: task.id,
          targetDocumentType: "system_requirement",
          markdown: "# 高压能量管理-系统需求\n",
          summary: "首次提取"
        });
        assert.equal(firstAsset.role, "extracted_system_requirement");
        assert.equal(firstAsset.originalName, "高压能量管理-系统需求.md");

        const secondAsset = await projectService.createExtractedModuleAsset(project.id, module.id, {
          sourceTaskId: task.id,
          targetDocumentType: "system_requirement",
          markdown: "# 高压能量管理-系统需求\n\n第二版\n",
          summary: "再次提取"
        });
        assert.equal(secondAsset.role, "extracted_system_requirement");
        assert.match(secondAsset.originalName, /^高压能量管理-系统需求-\d{8}-\d{6}\.md$/);

        const storedTasks = await projectService.listDocumentExtractionTasks(project.id, module.id);
        const reloadedModule = await projectService.getModule(project.id, module.id);
        assert.equal(storedTasks.length, 1);
        assert.equal(storedTasks[0].id, task.id);
        assert.equal(reloadedModule.assets.filter((item) => item.role === "extracted_system_requirement").length, 2);

        await projectService.deleteDocumentExtractionTask(project.id, module.id, task.id);
        const remainingTasks = await projectService.listDocumentExtractionTasks(project.id, module.id);
        const retainedModule = await projectService.getModule(project.id, module.id);
        assert.equal(remainingTasks.length, 0);
        assert.equal(retainedModule.assets.filter((item) => item.role === "extracted_system_requirement").length, 2);
      });
    }
  },
  {
    name: "Project service persists HIL document extraction assets with HIL naming",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Extractor HIL Project" });
        const module = await projectService.createModule(project.id, { name: "ESC干预" });

        const task = await projectService.recordDocumentExtractionTask(project.id, module.id, {
          targetDocumentType: "hil_test_case",
          sourceMode: "image",
          status: "running"
        });

        const asset = await projectService.createExtractedModuleAsset(project.id, module.id, {
          sourceTaskId: task.id,
          targetDocumentType: "hil_test_case",
          markdown: "# ESC干预-HIL测试用例\n\n## 用例信息\n",
          summary: "已提取 HIL 测试用例"
        });

        assert.equal(asset.role, "extracted_hil_test_case");
        assert.equal(asset.originalName, "ESC干预-HIL测试用例.md");

        const content = await projectService.getModuleAssetContent(project.id, module.id, asset.id);
        assert.equal(content.role, "extracted_hil_test_case");
        assert.ok(content.content.includes("## 用例信息"));
      });
    }
  },
  {
    name: "Spreadsheet extraction service parses Basic Report HIL rows from xlsx",
    run: async () => {
      await withTempConfig(async (tempDir) => {
        const spreadsheetPath = path.join(tempDir, "sample-hil.xlsx");
        await createMinimalXlsx(spreadsheetPath, {
          "Basic Report": [
            ["ID", "Title", "precondition", "Step Description", "Expected Result"],
            [
              "CheryVCU-9567",
              "ESC干预前轴激活标志位判断_前电机降扭",
              "1. KL15上电\n2. 进入D挡",
              "1. ESC_TqDecReqAct_F = 0x1\n2. ESC_TqDecReq_F = 3699",
              "1. ESCWhlTq_bFrntAxleTqIntvActv = 0"
            ]
          ]
        });

        const service = new SpreadsheetExtractionService();
        const result = await service.parseHilSpreadsheet(spreadsheetPath);

        assert.equal(result.sheetName, "Basic Report");
        assert.equal(result.cases.length, 1);
        assert.equal(result.cases[0].title, "ESC干预前轴激活标志位判断_前电机降扭");
        assert.ok(result.cases[0].precondition.includes("KL15上电"));
        assert.ok(result.cases[0].stepDescription.includes("ESC_TqDecReqAct_F"));
        assert.ok(result.cases[0].expectedResult.includes("ESCWhlTq_bFrntAxleTqIntvActv"));
        assert.ok(result.normalizedText.includes("Title: ESC干预前轴激活标志位判断_前电机降扭"));
      });
    }
  },
  {
    name: "Pipeline service extracts markdown asset through Hermes document extraction chain",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "document_extract_generate") {
            return {
              status: "succeeded",
              artifact: {
                targetDocumentType: "software_requirement",
                title: "高压安全管理软件需求",
                markdown: "# 高压安全管理软件需求\n\n## 文档信息\n",
                summary: "已提取软件需求",
                keySections: ["文档信息", "章节结构", "需求条目", "提炼摘要"]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Extractor Pipeline Project" });
        const module = await projectService.createModule(project.id, { name: "高压安全管理" });

        const result = await pipelineService.extractDocumentForModule(project.id, module.id, {
          targetDocumentType: "software_requirement",
          sourceText: "CheryVCU-2595 - 绝缘拓展性检测",
          imageInputs: [
            {
              originalName: "clip.png",
              storedName: "clip.png",
              mimeType: "image/png",
              size: 128,
              absolutePath: "/tmp/clip.png"
            }
          ]
        });

        assert.equal(result.task.status, "completed");
        assert.equal(result.task.targetDocumentType, "software_requirement");
        assert.equal(result.outputAsset.role, "extracted_software_requirement");
        assert.equal(result.outputAsset.originalName, "高压安全管理-软件需求.md");
        assert.ok(hermesPayloads.some((payload) => payload.stepType === "document_extract_generate"));
      });
    }
  },
  {
    name: "Pipeline service extracts HIL markdown asset through Hermes document extraction chain",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "document_extract_generate") {
            return {
              status: "succeeded",
              artifact: {
                targetDocumentType: "hil_test_case",
                title: "ESC干预-HIL测试用例",
                markdown: "# ESC干预-HIL测试用例\n\n## 用例信息\n",
                summary: "已提取 HIL 测试用例",
                keySections: ["用例信息", "前置条件", "步骤描述", "预期结果"]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Extractor HIL Pipeline Project" });
        const module = await projectService.createModule(project.id, { name: "ESC干预" });

        const result = await pipelineService.extractDocumentForModule(project.id, module.id, {
          targetDocumentType: "hil_test_case",
          sourceText: "SMiVCU-9567",
          imageInputs: [
            {
              originalName: "hil-case.png",
              storedName: "hil-case.png",
              mimeType: "image/png",
              size: 256,
              absolutePath: "/tmp/hil-case.png"
            }
          ]
        });

        assert.equal(result.task.status, "completed");
        assert.equal(result.task.targetDocumentType, "hil_test_case");
        assert.equal(result.outputAsset.role, "extracted_hil_test_case");
        assert.equal(result.outputAsset.originalName, "ESC干预-HIL测试用例.md");
        assert.ok(
          hermesPayloads.some(
            (payload) => payload.stepType === "document_extract_generate" && payload.inputArtifact?.targetDocumentType === "hil_test_case"
          )
        );
      });
    }
  },
  {
    name: "Pipeline service extracts HIL markdown asset from spreadsheet inputs through Hermes document extraction chain",
    run: async () => {
      await withTempConfig(async (tempDir) => {
        const projectService = new ProjectService();
        const pipelineService = new PipelineService(projectService);
        const hermesPayloads = [];
        const spreadsheetPath = path.join(tempDir, "sample-hil.xlsx");

        await createMinimalXlsx(spreadsheetPath, {
          "Basic Report": [
            ["ID", "Title", "precondition", "Step Description", "Expected Result"],
            [
              "CheryVCU-9567",
              "ESC干预前轴激活标志位判断_前电机降扭",
              "1. KL15上电",
              "1. ESC_TqDecReqAct_F = 0x1",
              "1. ESCWhlTq_bFrntAxleTqIntvActv = 0"
            ]
          ]
        });

        pipelineService.hermesAgentClient.transport = "api";
        pipelineService.hermesAgentClient.executeStep = async (payload) => {
          hermesPayloads.push(payload);
          if (payload.stepType === "document_extract_generate") {
            return {
              status: "succeeded",
              artifact: {
                targetDocumentType: "hil_test_case",
                title: "ESC干预-HIL测试用例",
                markdown: "# ESC干预-HIL测试用例\n\n## 用例信息\n",
                summary: "已根据 Excel 提取 HIL 测试用例",
                keySections: ["用例信息", "前置条件", "步骤描述", "预期结果"]
              }
            };
          }
          throw new Error(`Unexpected step: ${payload.stepType}`);
        };

        const project = await projectService.createProject({ name: "Extractor HIL Spreadsheet Project" });
        const module = await projectService.createModule(project.id, { name: "ESC干预" });

        const result = await pipelineService.extractDocumentForModule(project.id, module.id, {
          targetDocumentType: "hil_test_case",
          spreadsheetInputs: [
            {
              originalName: "workitems.xlsx",
              storedName: "workitems.xlsx",
              mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              size: 1024,
              absolutePath: spreadsheetPath
            }
          ]
        });

        assert.equal(result.task.status, "completed");
        assert.equal(result.task.targetDocumentType, "hil_test_case");
        assert.equal(result.task.sourceMode, "spreadsheet");
        assert.equal(result.outputAsset.role, "extracted_hil_test_case");
        const content = await projectService.getModuleAssetContent(project.id, module.id, result.outputAsset.id);
        assert.ok(content.content.includes("## 用例总览"));
        assert.ok(content.content.includes("| 序号 | Title | 来源ID |"));
        assert.ok(content.content.includes("## 用例详情"));
        assert.ok(content.content.includes("### 1. ESC干预前轴激活标志位判断_前电机降扭"));
        assert.ok(content.content.includes("#### Precondition"));
        assert.ok(content.content.includes("#### Step Description"));
        assert.ok(content.content.includes("#### Expected Result"));
        assert.ok(
          hermesPayloads.some(
            (payload) =>
              payload.stepType === "document_extract_generate" &&
              payload.inputArtifact?.targetDocumentType === "hil_test_case" &&
              String(payload.inputArtifact?.sourceText || "").includes("Title: ESC干预前轴激活标志位判断_前电机降扭")
          )
        );
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
    name: "Replay task passes replay artifact directory shape into proposal generation",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Artifact Shape Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-artifact-shape-1",
              requirementId: "SWR-451",
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

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-artifact-shape-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "validation",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        let capturedPayload = null;
        replayTaskService.hermesAgentClient.executeStep = async (payload) => {
          capturedPayload = payload;
          return {
            status: "succeeded",
            stepType: "replay_proposal_generate",
            artifact: {
              summary: "已生成回投提议。",
              decisionSummary: "",
              validatorSuggestions: [],
              items: []
            }
          };
        };

        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id,
          asyncExecution: true
        });
        await replayTaskService.activeRuns.get(replayTask.id);

        assert.equal(capturedPayload.taskId, replayTask.id);
        assert.equal(capturedPayload.stepType, "replay_proposal_generate");
        assert.deepEqual(capturedPayload.inputArtifact.replayContext, {
          directory: path.join(config.replayTaskArtifactDir, replayTask.id),
          manifestFileName: "manifest.json",
          taskBriefFileName: "task-brief.md",
          manifestPath: path.join(config.replayTaskArtifactDir, replayTask.id, "manifest.json"),
          taskBriefPath: path.join(config.replayTaskArtifactDir, replayTask.id, "task-brief.md")
        });
        assert.equal(
          capturedPayload.inputArtifact.files.layerSkillInventoryPath,
          path.join(config.replayTaskArtifactDir, replayTask.id, "layer-skill-inventory.json")
        );
        assert.equal(capturedPayload.inputArtifact.replayManifest.taskContext.moduleSkillKey, "charging_management");
        assert.equal(capturedPayload.inputArtifact.replayManifest.rejectionContext.records[0].id, records[0].id);
        assert.deepEqual(capturedPayload.allowedPaths, [path.join(config.replayTaskArtifactDir, replayTask.id)]);
      });
    }
  },
  {
    name: "Replay task persists running state before proposal generation completes",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Running Task Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-running-1",
              requirementId: "SWR-452",
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

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-running-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "validation",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        let releaseExecute = null;
        const executeBlocked = new Promise((resolve) => {
          releaseExecute = resolve;
        });
        let enteredExecute = null;
        const executeEntered = new Promise((resolve) => {
          enteredExecute = resolve;
        });

        replayTaskService.hermesAgentClient.executeStep = async () => {
          enteredExecute();
          await executeBlocked;
          return {
            status: "succeeded",
            stepType: "replay_proposal_generate",
            artifact: {
              summary: "已生成回投提议。",
              decisionSummary: "",
              validatorSuggestions: [],
              items: []
            }
          };
        };

        const pendingTaskPromise = replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id,
          asyncExecution: true
        });

        await executeEntered;
        await new Promise((resolve) => setTimeout(resolve, 30));

        const taskFiles = (await fs.readdir(config.replayTaskStoreDir)).filter((name) => name.endsWith(".json"));
        assert.equal(taskFiles.length, 1);
        const stagedTask = JSON.parse(await fs.readFile(path.join(config.replayTaskStoreDir, taskFiles[0]), "utf8"));
        assert.equal(stagedTask.taskStatus, "running");
        assert.match(stagedTask.summary, /Replay 正在生成 Skill 优化建议|Replay 任务已排队/);

        releaseExecute();
        const replayTask = await pendingTaskPromise;
        await replayTaskService.activeRuns.get(replayTask.id);
        const completedTask = await replayTaskService.getTask(replayTask.id);
        assert.equal(completedTask.taskStatus, "done");
      });
    }
  },
  {
    name: "Replay task list reconciles stale running tasks after backend restart",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Stale Task Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const generationTask = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-stale-1",
              requirementId: "SWR-553",
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

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", generationTask.id, "result-replay-stale-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "validation",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const [record] = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const staleAt = new Date(Date.now() - 60000).toISOString();
        const staleTask = {
          id: "replay-stale-task-1",
          projectId: project.id,
          projectName: project.name,
          moduleId: module.id,
          moduleName: module.name,
          sourceRejectionIds: [record.id],
          groupIds: [],
          targetBundleId: "bundle-base",
          llmProfileId: "",
          referenceAssetIds: [],
          taskStatus: "running",
          materialPack: { targetAreas: ["validation"], referenceAssets: [] },
          proposalIds: [],
          proposals: [],
          summary: "Replay 正在生成 Skill 优化建议",
          decisionSummary: "",
          validatorSuggestions: [],
          applyResult: null,
          progress: {
            stage: "replay_proposal_generate",
            label: "正在调用 Hermes 生成 Skill 优化建议",
            message: "本机 Hermes 正在执行 replay_proposal_generate，已运行 90 秒。",
            percent: 72
          },
          timeline: [
            {
              stage: "queued",
              label: "任务已创建",
              message: "Replay 任务已创建，等待 Hermes 处理。",
              level: "info",
              at: staleAt
            }
          ],
          runtimeEvents: [
            {
              at: staleAt,
              type: "agent_runtime",
              transport: "cli",
              stepType: "replay_proposal_generate",
              status: "heartbeat",
              label: "Hermes CLI 仍在运行",
              message: "本机 Hermes 正在执行 replay_proposal_generate，已运行 90 秒。",
              startedAt: staleAt,
              heartbeatAt: staleAt,
              elapsedMs: 90000
            }
          ],
          debug: {
            agent: {
              transport: "cli",
              status: "heartbeat",
              currentStep: "replay_proposal_generate",
              startedAt: staleAt,
              lastEventAt: staleAt,
              lastHeartbeatAt: staleAt,
              elapsedMs: 90000,
              sessionId: "",
              tokenUsage: null,
              stdoutExcerpt: "",
              stderrExcerpt: ""
            },
            artifacts: {}
          },
          errorMessage: "",
          errorStage: "",
          createdAt: staleAt,
          updatedAt: staleAt
        };

        await fs.writeFile(path.join(config.replayTaskStoreDir, `${staleTask.id}.json`), JSON.stringify(staleTask, null, 2), "utf8");
        await rejectionService.updateRecord(record.id, {
          replayStatus: "running",
          replayCount: 1,
          replayTaskIds: [staleTask.id],
          lastReplayAt: staleAt
        });

        const [reconciledTask] = await replayTaskService.listTasks({ projectId: project.id, moduleId: module.id });
        assert.equal(reconciledTask.taskStatus, "failed");
        assert.equal(reconciledTask.errorStage, "service_interrupted");
        assert.match(reconciledTask.errorMessage, /后端服务已重启|任务执行已中断/);
        assert.equal(reconciledTask.debug?.agent?.status, "interrupted");
        assert.equal(reconciledTask.runtimeEvents.at(-1)?.status, "failed");

        const updatedRecord = await rejectionService.getRecord(record.id);
        assert.equal(updatedRecord.replayStatus, "failed");
        assert.equal(updatedRecord.replayCount, 1);
        assert.deepEqual(updatedRecord.replayTaskIds, [staleTask.id]);
      });
    }
  },
  {
    name: "Replay task can be deleted while running without reappearing in history",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Delete Active Task Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const generationTask = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-delete-active-1",
              requirementId: "SWR-554",
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

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", generationTask.id, "result-replay-delete-active-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "validation",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const [record] = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        let releaseExecute = null;
        const executeBlocked = new Promise((resolve) => {
          releaseExecute = resolve;
        });
        let enteredExecute = null;
        const executeEntered = new Promise((resolve) => {
          enteredExecute = resolve;
        });

        replayTaskService.hermesAgentClient.executeStep = async (_payload, runtime = {}) => {
          if (runtime.onEvent) {
            await runtime.onEvent({
              at: new Date().toISOString(),
              type: "agent_runtime",
              transport: "cli",
              stepType: "replay_proposal_generate",
              status: "started",
              label: "Hermes CLI 已启动",
              message: "正在调用本机 Hermes 执行 replay_proposal_generate。"
            });
          }
          enteredExecute();
          await executeBlocked;
          if (runtime.onEvent) {
            await runtime.onEvent({
              at: new Date().toISOString(),
              type: "agent_runtime",
              transport: "cli",
              stepType: "replay_proposal_generate",
              status: "completed",
              label: "Hermes CLI 已完成",
              message: "本机 Hermes 已完成 replay_proposal_generate。"
            });
          }
          return {
            status: "succeeded",
            stepType: "replay_proposal_generate",
            artifact: {
              summary: "已生成回投提议。",
              decisionSummary: "",
              validatorSuggestions: [],
              items: []
            }
          };
        };

        const replayTask = await replayTaskService.createTask({
          rejectionIds: [record.id],
          projectId: project.id,
          moduleId: module.id,
          asyncExecution: true
        });

        await executeEntered;
        const deleted = await replayTaskService.deleteTask(replayTask.id);
        assert.equal(deleted.deleted, true);
        assert.equal(await replayTaskService.getTask(replayTask.id), null);
        assert.deepEqual(await replayTaskService.listTasks({ projectId: project.id, moduleId: module.id }), []);

        const resetRecord = await rejectionService.getRecord(record.id);
        assert.equal(resetRecord.replayStatus, "not_started");
        assert.equal(resetRecord.replayCount, 0);
        assert.deepEqual(resetRecord.replayTaskIds, []);

        releaseExecute();
        await replayTaskService.activeRuns.get(replayTask.id);

        assert.equal(await replayTaskService.getTask(replayTask.id), null);
        assert.deepEqual(await replayTaskService.listTasks({ projectId: project.id, moduleId: module.id }), []);
      });
    }
  },
  {
    name: "Replay task preserves runtime and artifact metadata from replay proposal payloads",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const replayTaskService = new ReplayTaskService();

        const project = await projectService.createProject({ name: "Replay Payload Compatibility Project" });
        const module = await projectService.createModule(project.id, {
          name: "充电管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-replay-payload-1",
              requirementId: "SWR-552",
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

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-replay-payload-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "wording_issue",
          reasonText: "正文混入了人工范例没有的兜底逻辑",
          targetArea: "validation",
          expectedNote: "请严格回到人工范例边界。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        replayTaskService.hermesAgentClient.executeStep = async () => ({
          status: "succeeded",
          stepType: "replay_proposal_generate",
          artifact: {
            summary: "已生成回投提议。",
            decisionSummary: "已保留运行时与产物元数据。",
            validatorSuggestions: [],
            items: [],
            runtime: {
              status: "completed",
              stage: "replay_proposal_generate",
              sessionId: "session-replay-001"
            },
            artifacts: {
              artifactDir: "/tmp/replay-artifacts/task-compat",
              files: ["selection-report.json", "read-manifest.json"]
            }
          }
        });

        const replayTask = await replayTaskService.createTask({
          rejectionIds: [records[0].id],
          projectId: project.id,
          moduleId: module.id,
          asyncExecution: true
        });
        await replayTaskService.activeRuns.get(replayTask.id);
        const completedTask = await replayTaskService.getTask(replayTask.id);

        assert.deepEqual(completedTask.runtime, {
          status: "completed",
          stage: "replay_proposal_generate",
          sessionId: "session-replay-001"
        });
        assert.deepEqual(completedTask.artifacts, {
          artifactDir: "/tmp/replay-artifacts/task-compat",
          files: ["selection-report.json", "read-manifest.json"]
        });

        const persistedTask = await replayTaskService.getTask(replayTask.id);
        assert.deepEqual(persistedTask.runtime, completedTask.runtime);
        assert.deepEqual(persistedTask.artifacts, completedTask.artifacts);
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
        assert.equal(workOrder.items[0].changeSummary, "充电截止SOC记忆类需求边界约束");
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
        assert.equal(workOrder.items[0].changeSummary, "无依据扩写校验（补充修订）");
        assert.equal(workOrder.items[1].conclusionType, "create_new");
        assert.equal(workOrder.items[1].changeSummary, "充电截止SOC记忆类需求边界约束");
        assert.equal(workOrder.itemStats.total, 2);
      });
    }
  },
  {
    name: "Skill work order hydrates change summary for legacy persisted items",
    run: async () => {
      await withTempConfig(async () => {
        const workOrderService = new SkillWorkOrderService();
        const workOrderId = "legacy-change-summary-work-order";
        await fs.writeFile(
          path.join(config.skillWorkOrderStoreDir, `${workOrderId}.json`),
          JSON.stringify(
            {
              id: workOrderId,
              title: "Legacy work order",
              sourceTaskId: "",
              status: "pending_review",
              itemStats: { total: 1 },
              validatorSuggestions: [],
              items: [
                {
                  itemId: "legacy-item-1",
                  title: "旧规则补充修订",
                  conclusionType: "modify_existing",
                  action: "modify_skill_item",
                  targetSkillCode: "DOC-software_requirement-validation_rule-010",
                  targetLayer: "docType",
                  targetProfileKey: "software_requirement",
                  targetKind: "validation_rule",
                  beforeContent: "旧内容",
                  afterContent: "新内容",
                  evidenceRefs: []
                }
              ]
            },
            null,
            2
          ),
          "utf8"
        );

        const workOrder = await workOrderService.getWorkOrder(workOrderId);

        assert.equal(workOrder.items[0].changeSummary, "旧规则补充修订");
      });
    }
  },
  {
    name: "Skill work order review stages changes into candidate bundle",
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
        assert.equal(applied.item.reviewStatus, "staged");
        assert.ok(applied.candidateBundle.id);
        assert.equal(applied.candidateBundle.status, "candidate");
        assert.equal(applied.item.stagedBundleId, applied.candidateBundle.id);
        assert.ok(applied.item.appliedChange.afterSnapshot);

        const targetSkillCode = applied.item.appliedChange.skillCode;
        const candidateSkillDir = await bundleService.getSkillDir(applied.candidateBundle.id);
        const refreshedSkill = await skillManagementService.getSkillItem(targetSkillCode, candidateSkillDir);
        assert.ok(refreshedSkill.item.content.includes("补充约束") || refreshedSkill.item.content.includes("避免"));
        assert.equal(refreshedSkill.item.provenance.sourceTaskId, replayTask.id);
        assert.equal(refreshedSkill.item.provenance.stagedBundleId, applied.candidateBundle.id);

        if (applied.item.conclusionType === "modify_existing") {
          const activeSkill = await skillManagementService.getSkillItem(targetSkillCode);
          assert.notEqual(activeSkill.item.content, refreshedSkill.item.content);
        } else {
          await assert.rejects(() => skillManagementService.getSkillItem(targetSkillCode));
        }

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
    name: "Skill bundle release, rollback, and fork preserve version isolation",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const skillManagementService = new SkillManagementService();
        const activeRef = await bundleService.getSkillVersionRef();
        const draft = await bundleService.createDraftBundle({
          baseBundleId: activeRef.bundleId,
          changeSummary: "Candidate B for version isolation test"
        });
        const staleDraft = await bundleService.createDraftBundle({
          baseBundleId: activeRef.bundleId,
          changeSummary: "Stale candidate based on A"
        });
        const draftSkillDir = await bundleService.getSkillDir(draft.id);
        const candidateItems = await skillManagementService.listSkillItems({}, draftSkillDir);
        const target = candidateItems.items.find((item) => item.kind === "validation_rule") || candidateItems.items[0];
        assert.ok(target?.skillCode);
        const activeBefore = await skillManagementService.getSkillItem(target.skillCode);

        await skillManagementService.updateSkillItem(
          target.skillCode,
          {
            content: "candidate version marker"
          },
          draftSkillDir
        );

        const released = await bundleService.releaseBundle(draft.id, { releasedBy: "tester" });
        assert.equal(released.status, "active");
        assert.equal((await bundleService.getActiveBundle()).id, draft.id);
        assert.ok(released.snapshotHash);
        assert.ok(released.sqliteSnapshotPath);
        const snapshotPath = path.isAbsolute(released.sqliteSnapshotPath)
          ? released.sqliteSnapshotPath
          : path.join(config.rootDir, released.sqliteSnapshotPath);
        assert.ok((await fs.stat(snapshotPath)).size > 0);
        assert.equal(new SkillDatabaseService(config.skillDatabasePath).hasForeignKeyViolations(), false);

        const activeAfterRelease = await skillManagementService.getSkillItem(target.skillCode);
        assert.equal(activeAfterRelease.item.content, "candidate version marker");
        assert.equal((await bundleService.getBundle(activeRef.bundleId)).status, "archived");
        await assert.rejects(
          () => bundleService.releaseBundle(staleDraft.id),
          (error) => error?.code === "skill_bundle_base_mismatch"
        );

        const rolledBack = await bundleService.rollbackBundle(activeRef.bundleId, { reason: "regression" });
        assert.equal(rolledBack.status, "active");
        assert.equal((await bundleService.getActiveBundle()).id, activeRef.bundleId);
        assert.equal((await bundleService.getBundle(draft.id)).status, "rolled_back");
        const activeAfterRollback = await skillManagementService.getSkillItem(target.skillCode);
        assert.equal(activeAfterRollback.item.content, activeBefore.item.content);

        const forked = await bundleService.forkBundle(draft.id, {
          changeSummary: "Candidate C from rolled back B"
        });
        assert.equal(forked.status, "candidate");
        assert.equal(forked.baseBundleId, activeRef.bundleId);
        assert.equal(forked.forkedFromBundleId, draft.id);
        const releasedFork = await bundleService.releaseBundle(forked.id, { releasedBy: "tester" });
        assert.equal(releasedFork.status, "active");
        assert.equal((await bundleService.getActiveBundle()).id, forked.id);
      });
    }
  },
  {
    name: "Direct active skill item writes can be blocked in versioned mode",
    run: async () => {
      await withTempConfig(async () => {
        config.skillVersioning.directActiveSkillItemWrites = "blocked";
        await withTestServer(async ({ baseUrl }) => {
          const blockedResponse = await fetch(`${baseUrl}/api/skill-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              layer: "generic",
              profileKey: "generic",
              kind: "validation_rule",
              title: "Blocked direct write",
              content: "should not write active"
            })
          });
          assert.equal(blockedResponse.status, 409);
          assert.equal((await blockedResponse.json()).code, "direct_active_skill_write_blocked");

          const draftResponse = await fetch(`${baseUrl}/api/skill-bundles/drafts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ changeSummary: "API candidate" })
          });
          assert.equal(draftResponse.status, 201);
          const draft = await draftResponse.json();
          const candidateResponse = await fetch(`${baseUrl}/api/skill-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetBundleId: draft.id,
              layer: "generic",
              profileKey: "generic",
              kind: "validation_rule",
              title: "Candidate write",
              content: "writes only candidate"
            })
          });
          assert.equal(candidateResponse.status, 201);
          const created = await candidateResponse.json();
          assert.ok(created.skillCode);
        });
      });
    }
  },
  {
    name: "Queued generation tasks keep the skill version locked at creation time",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const queuedEntries = [];
        const pipelineService = new PipelineService(projectService, {
          hermesTaskQueueService: {
            enqueue(entry) {
              queuedEntries.push(entry);
              return Promise.resolve(null);
            }
          }
        });
        const activeRef = await bundleService.getSkillVersionRef();
        const project = await projectService.createProject({ name: "Skill Lock Project" });
        const module = await projectService.createModule(project.id, {
          name: "Charging Management",
          moduleSkillKey: "charging_management"
        });
        const uploadDir = path.join(config.uploadDir, project.id, module.id);
        await fs.mkdir(uploadDir, { recursive: true });
        const systemFilePath = path.join(uploadDir, "system.md");
        const codeFilePath = path.join(uploadDir, "code.c");
        await fs.writeFile(systemFilePath, "系统应在充电使能时输出充电状态信号。", "utf8");
        await fs.writeFile(codeFilePath, "void Charging_step(void) { chargeState = 1; }", "utf8");
        await projectService.attachModuleAssets(project.id, module.id, {
          systemPdf: [
            {
              originalname: "system.md",
              filename: "system.md",
              path: systemFilePath,
              mimetype: "text/markdown",
              size: 24
            }
          ],
          generatedCode: [
            {
              originalname: "code.c",
              filename: "code.c",
              path: codeFilePath,
              mimetype: "text/x-c",
              size: 44
            }
          ]
        });

        const result = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
          manualTitleOutline: buildManualTitleOutline([{ sectionTitle: "功能行为", itemTitles: ["充电状态信号输出"] }]),
          asyncStart: true
        });
        assert.equal(result.task.status, "queued");
        assert.equal(result.task.skillVersion.bundleId, activeRef.bundleId);
        assert.equal(queuedEntries.length, 1);

        const draft = await bundleService.createDraftBundle({
          baseBundleId: activeRef.bundleId,
          changeSummary: "Release after queued task"
        });
        await bundleService.releaseBundle(draft.id, { releasedBy: "tester" });
        assert.equal((await bundleService.getActiveBundle()).id, draft.id);

        const storedModule = await projectService.getModule(project.id, module.id);
        const storedTask = storedModule.documentSpaces.software_requirement.generationTasks.find((item) => item.id === result.task.id);
        assert.equal(storedTask.skillVersion.bundleId, activeRef.bundleId);
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
    name: "Skill work order list ignores stale empty work orders from failed replay tasks",
    run: async () => {
      await withTempConfig(async () => {
        const bundleService = new SkillBundleService();
        await bundleService.ensureInitialized();
        const projectService = new ProjectService();
        const rejectionService = new RejectionService();
        const workOrderService = new SkillWorkOrderService();

        const project = await projectService.createProject({ name: "Stale Empty Work Order Project" });
        const module = await projectService.createModule(project.id, {
          name: "低压能量管理",
          importedSkillKey: "charging_management"
        });

        const task = await projectService.recordGenerationTask(project.id, module.id, "software_requirement", {
          status: "completed",
          resultItems: [
            {
              id: "result-stale-work-order-1",
              requirementId: "SWR-801",
              title: "智能补电退出判断",
              requirementText: "软件应判断智能补电退出条件。",
              type: "functional",
              confidence: 0.78,
              verificationHint: "检查退出条件覆盖。",
              conflictNote: "",
              sourceRefs: []
            }
          ],
          traces: [],
          conflicts: [],
          extractions: []
        });

        await projectService.reviewTaskResult(project.id, module.id, "software_requirement", task.id, "result-stale-work-order-1", {
          status: "rejected",
          reviewer: "tester",
          reasonCategory: "coverage_gap",
          reasonText: "退出分支被压缩。",
          targetArea: "writing",
          expectedNote: "保留分支后的差异化处理。",
          includeInPool: true
        });

        const records = await rejectionService.listRecords({ projectId: project.id, moduleId: module.id });
        const createdAt = new Date().toISOString();
        const replayTaskId = "failed-replay-task-empty";
        const workOrderId = "stale-empty-work-order";

        await fs.writeFile(
          path.join(config.replayTaskStoreDir, `${replayTaskId}.json`),
          JSON.stringify(
            {
              id: replayTaskId,
              projectId: project.id,
              projectName: project.name,
              moduleId: module.id,
              moduleName: module.name,
              sourceRejectionIds: [records[0].id],
              taskStatus: "failed",
              summary: "Replay 任务异常中断",
              decisionSummary: "",
              validatorSuggestions: [],
              proposals: [],
              createdAt,
              updatedAt: createdAt
            },
            null,
            2
          ),
          "utf8"
        );

        await fs.writeFile(
          path.join(config.skillWorkOrderStoreDir, `${workOrderId}.json`),
          JSON.stringify(
            {
              id: workOrderId,
              title: "低压能量管理 / software_requirement / fallback 技能修改工单",
              sourceType: "fallback",
              sourceTaskId: replayTaskId,
              projectId: project.id,
              projectName: project.name,
              moduleId: module.id,
              moduleName: module.name,
              documentType: "software_requirement",
              llmProfile: {
                id: "profile-stale-work-order",
                label: "profile-stale-work-order"
              },
              effectiveSkillSnapshot: {
                bundleId: "bundle-base",
                ruleIndexVersion: "",
                hash: "",
                selectedProfiles: [],
                compiledPrompt: "",
                compiledSkillPack: null,
                files: {},
                candidateSkillItems: []
              },
              status: "pending_review",
              summary: "Replay 任务异常中断",
              decisionSummary: "当前未识别出可直接落地的 atomic skill 修改项。",
              itemStats: {
                total: 0,
                modifyExisting: 0,
                createNew: 0,
                validatorOnly: 0,
                accepted: 0,
                rejected: 0,
                applied: 0
              },
              evidenceRefs: [{ type: "rejection", refId: records[0].id }],
              validatorSuggestions: [],
              items: [],
              createdAt,
              updatedAt: createdAt
            },
            null,
            2
          ),
          "utf8"
        );

        const workOrders = await workOrderService.listWorkOrders({});
        assert.equal(workOrders.length, 0);

        const staleWorkOrder = await workOrderService.getWorkOrder(workOrderId);
        assert.equal(staleWorkOrder, null);

        await fs.rm(path.join(config.replayTaskStoreDir, `${replayTaskId}.json`), { force: true });

        const workOrdersAfterTaskRemoval = await workOrderService.listWorkOrders({});
        assert.equal(workOrdersAfterTaskRemoval.length, 0);

        const staleWorkOrderAfterTaskRemoval = await workOrderService.getWorkOrder(workOrderId);
        assert.equal(staleWorkOrderAfterTaskRemoval, null);
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
    name: "Skill registry rebuild preserves database-only module profiles created by cold start",
    run: async () => {
      await withTempConfig(async () => {
        const registryService = new SkillManagementService().registryService;
        const moduleSkillService = new ModuleSkillService();
        const module = {
          name: "Low Voltage Energy Management",
          moduleSkillKey: "low_voltage_energy_management"
        };

        await moduleSkillService.persistBootstrappedKnowledge(module, "software_requirement", {
          version: 1,
          generationPriorities: ["优先保留模块冷启动知识。"],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              sectionHints: ["智能补电激活判断"],
              writingPattern: "先写场景，再写条件。",
              targetStyle: "software requirement"
            }
          ],
          antiPatterns: ["不要遗漏退出条件。"]
        });

        const manifestPath = path.join(config.activeSkillDir, "skill-manifest.json");
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        delete manifest.profiles.modules.low_voltage_energy_management;
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
        await fs.rm(path.join(config.activeSkillDir, "profiles", "modules", "low_voltage_energy_management"), {
          recursive: true,
          force: true
        });

        await registryService.rebuildDatabaseFromFiles(config.activeSkillDir);

        const restored = registryService.databaseService.loadProfileRegistry("module", module.moduleSkillKey);
        assert.ok(restored);
        assert.ok(restored.items.some((item) => item.kind === "generation_priority"));
        assert.ok(restored.items.some((item) => item.kind === "rule_hint"));
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
    name: "Source policy settings render specific readable prose for module bootstrap policies",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "Low Voltage Energy Management",
          moduleSkillKey: "low_voltage_energy_management"
        };

        await service.persistBootstrappedKnowledge(module, "software_requirement", {
          version: 1,
          generationPriorities: [],
          examples: [],
          ruleHints: [],
          antiPatterns: [],
          sourceOfTruthPolicy: {
            preferredFunctionSection: {
              title: "低压能量管理 / 智能补电"
            },
            preferredSubsections: [
              {
                title: "智能补电激活判断",
                coreRequirementTypes: ["software_requirement"]
              },
              {
                title: "智能补电退出判断",
                coreRequirementTypes: ["software_requirement"]
              }
            ],
            coreFirst: true,
            preferSymmetricExpansion: true
          }
        });

        const registry = await service.registryService.loadProfileRegistry("module", module.moduleSkillKey);
        const functionSection = registry.items.find((item) => item.structuredPayload?.key === "preferredFunctionSection");
        const subsections = registry.items.find((item) => item.structuredPayload?.key === "preferredSubsections");
        const coreFirst = registry.items.find((item) => item.structuredPayload?.key === "coreFirst");
        const symmetric = registry.items.find((item) => item.structuredPayload?.key === "preferSymmetricExpansion");

        assert.match(functionSection.content, /优先功能章节/);
        assert.match(functionSection.content, /低压能量管理 \/ 智能补电/);
        assert.match(subsections.content, /优先子章节/);
        assert.match(subsections.content, /智能补电激活判断/);
        assert.equal(coreFirst.content, "优先先铺开核心章节和核心规则，再补充外围内容。");
        assert.equal(symmetric.content, "优先按对象或轴对称展开章节和需求。");
      });
    }
  },
  {
    name: "Rule hint structured arrays survive knowledge import and reload",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "Low Voltage Energy Management",
          moduleSkillKey: "low_voltage_energy_management"
        };

        await service.persistBootstrappedKnowledge(module, "software_requirement", {
          version: 1,
          generationPriorities: [],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              subdomain: "低压能量管理",
              sectionHints: ["智能补电激活判断", "智能补电退出判断"],
              writingPattern: "先写总前提，再写全部条件和任一条件。",
              targetStyle: "贴近人工软件需求文档的判定类条目写法。",
              sourceBasis: ["系统需求锚点 A", "软件需求参考锚点 B"]
            }
          ],
          antiPatterns: []
        });

        const registry = await service.registryService.loadProfileRegistry("module", module.moduleSkillKey);
        const hint = registry.items.find((item) => item.kind === "rule_hint");

        assert.deepEqual(hint.structuredPayload.sectionHints, ["智能补电激活判断", "智能补电退出判断"]);
        assert.deepEqual(hint.structuredPayload.sourceBasis, ["系统需求", "参考软件需求"]);
      });
    }
  },
  {
    name: "Rule hint source basis strips anchor ids and runtime artifact labels during module knowledge import",
    run: async () => {
      await withTempConfig(async () => {
        const service = new ModuleSkillService();
        const module = {
          name: "Low Voltage Energy Management",
          moduleSkillKey: "low_voltage_energy_management"
        };

        await service.persistBootstrappedKnowledge(module, "software_requirement", {
          version: 1,
          generationPriorities: [],
          examples: [],
          ruleHints: [
            {
              domain: "embedded_vcu",
              subdomain: "低压能量管理",
              sectionHints: ["智能补电激活判断"],
              writingPattern: "先写条件，再写动作。",
              targetStyle: "软件需求风格。",
              sourceBasis: [
                "系统需求锚点 11111111-1111-1111-1111-111111111111",
                "参考软件需求锚点 22222222-2222-2222-2222-222222222222",
                "代码语义参考锚点 33333333-3333-3333-3333-333333333333",
                "task skill bundle recalled atoms"
              ]
            }
          ],
          antiPatterns: []
        });

        const registry = await service.registryService.loadProfileRegistry("module", module.moduleSkillKey);
        const hint = registry.items.find((item) => item.kind === "rule_hint");

        assert.deepEqual(hint.structuredPayload.sourceBasis, ["系统需求", "参考软件需求", "相关代码语义", "相关既有技能规则"]);
        assert.doesNotMatch(hint.content, /11111111-1111-1111-1111-111111111111/);
        assert.doesNotMatch(hint.content, /task skill bundle recalled atoms/);
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
        await replayLabService.replayTaskService.activeRuns.get(rerun.task.id);
        const rerunTask = await replayLabService.replayTaskService.getTask(rerun.task.id);
        assert.notEqual(rerun.task.id, replayTask.id);
        assert.equal(rerun.templateTaskId, replayTask.id);
        assert.ok(rerun.currentPreview.ruleDiagnostics.before);
        assert.ok(rerun.currentPreview.ruleDiagnostics.after);
        assert.ok(rerun.currentPreview.ruleDiagnostics.after.counts.ruleIndex.total > 0);
        assert.equal(rerunTask.materialPack.targetLayerConstraint, "docType");
        assert.ok(Array.isArray(rerunTask.materialPack.layerSkillItems));
        assert.ok(["queued", "running", "done"].includes(rerun.task.taskStatus));
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
    name: "Fallback history drawer source includes running progress and agent runtime sections",
    run: async () => {
      const script = await fs.readFile(path.join(config.rootDir, "public", "hierarchy.js"), "utf8");
      const stylesheet = await fs.readFile(path.join(config.rootDir, "public", "hierarchy.css"), "utf8");

      assert.ok(script.includes("执行进度"));
      assert.ok(script.includes("Agent 运行日志"));
      assert.ok(script.includes("data-toggle-feedback-history-progress"));
      assert.ok(script.includes("data-toggle-feedback-history-runtime"));
      assert.ok(script.includes("renderFeedbackHistoryProgressSection"));
      assert.ok(script.includes("renderFeedbackHistoryRuntimeSection"));
      assert.ok(script.includes("Token 消耗"));
      assert.ok(script.includes("getReplayTaskEffectiveModelLabel"));
      assert.ok(script.includes("formatReplayTokenUsageSummary"));
      assert.ok(script.includes("getReplayTaskDisplayTitle"));
      assert.ok(script.includes("getReplayTaskDisplaySummary"));
      assert.ok(script.includes("compactStageSummary"));
      assert.ok(script.includes("sortFeedbackHistoryTasks"));
      assert.ok(script.includes("data-feedback-history-task-delete"));
      assert.ok(script.includes("/replay-lab?runTaskId="));
      assert.ok(script.includes("查看详情页"));
      assert.ok(script.includes("feedback-history-card-main"));
      assert.ok(stylesheet.includes(".feedback-history-progress-shell"));
      assert.ok(stylesheet.includes(".feedback-history-runtime-shell"));
      assert.ok(stylesheet.includes(".feedback-history-stage-summary"));
      assert.ok(stylesheet.includes(".feedback-history-task-card strong"));
      assert.ok(stylesheet.includes(".feedback-history-task-summary"));
      assert.ok(stylesheet.includes(".feedback-history-card-head"));
      assert.ok(stylesheet.includes(".feedback-history-card-delete"));
      assert.ok(stylesheet.includes(".feedback-history-card-main"));
      assert.ok(stylesheet.includes(".feedback-history-detail-actions"));
      assert.ok(stylesheet.includes(".feedback-history-detail-link"));
    }
  },
  {
    name: "Feedback pool task drawer keeps history cards out of primary button styling",
    run: async () => {
      const html = await fs.readFile(path.join(config.rootDir, "public", "feedback-pool.html"), "utf8");
      const script = await fs.readFile(path.join(config.rootDir, "public", "feedback-pool.js"), "utf8");
      const stylesheet = await fs.readFile(path.join(config.rootDir, "public", "app.css"), "utf8");

      assert.ok(html.includes('id="task-drawer"'));
      assert.ok(html.includes('id="close-task-drawer"'));
      assert.ok(script.includes("feedback-task-card"));
      assert.ok(stylesheet.includes(".secondary-button"));
      assert.ok(stylesheet.includes(".feedback-task-card strong"));
      assert.ok(stylesheet.includes(".feedback-task-card .list-card-meta"));
      assert.ok(stylesheet.includes(".feedback-task-card.is-selected"));
      assert.ok(stylesheet.includes(".feedback-task-detail .detail-card"));
    }
  },
  {
    name: "Replay Lab source includes running progress and agent runtime sections for latest run",
    run: async () => {
      const script = await fs.readFile(path.join(config.rootDir, "public", "replay-lab.js"), "utf8");
      const stylesheet = await fs.readFile(path.join(config.rootDir, "public", "replay-lab.css"), "utf8");

      assert.ok(script.includes("执行进度"));
      assert.ok(script.includes("Agent 运行日志"));
      assert.ok(script.includes("data-toggle-replay-lab-progress"));
      assert.ok(script.includes("data-toggle-replay-lab-runtime"));
      assert.ok(script.includes("renderReplayTaskProgressPanel"));
      assert.ok(script.includes("renderReplayTaskRuntimePanel"));
      assert.ok(stylesheet.includes(".lab-running-shell"));
      assert.ok(stylesheet.includes(".lab-running-timeline"));
      assert.ok(stylesheet.includes(".lab-running-runtime"));
    }
  },
  {
    name: "Skill work order detail source prioritizes reviewer change summary",
    run: async () => {
      const script = await fs.readFile(path.join(config.rootDir, "public", "skill-management.js"), "utf8");
      const stylesheet = await fs.readFile(path.join(config.rootDir, "public", "skill-management.css"), "utf8");

      assert.ok(script.includes("修改意见"));
      assert.ok(script.includes("原技能写法"));
      assert.ok(script.includes("建议写法"));
      assert.ok(script.includes("被驳回内容"));
      assert.ok(script.includes("驳回说明"));
      assert.ok(script.includes("预期写法"));
      assert.ok(script.includes("当前无原技能，新建技能条目"));
      assert.ok(script.indexOf("修改意见") < script.indexOf("原技能写法"));
      assert.ok(script.indexOf("原技能写法") < script.indexOf("建议写法"));
      assert.ok(stylesheet.includes(".work-order-change-summary"));
      assert.ok(stylesheet.includes(".work-order-diff-stack"));
      assert.ok(stylesheet.includes(".work-order-evidence-grid"));
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
        "document-extractor.html",
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
      assert.ok(script.includes("window.top === window"));
      assert.match(stylesheet, /\.feedback-widget-root\s*\{[^}]*left:\s*20px;[^}]*bottom:\s*20px;/s);
      assert.match(stylesheet, /\.feedback-widget-dialog\s*\{[^}]*pointer-events:\s*auto/s);
    }
  },
  {
    name: "Document extractor page and module detail expose module-local extraction entry",
    run: async () => {
      const moduleDetailHtml = await fs.readFile(path.join(config.rootDir, "public", "module-detail.html"), "utf8");
      const extractorHtml = await fs.readFile(path.join(config.rootDir, "public", "document-extractor.html"), "utf8");
      const requirementHtml = await fs.readFile(path.join(config.rootDir, "public", "requirement-generation.html"), "utf8");
      const detailHtml = await fs.readFile(path.join(config.rootDir, "public", "detail-design-generation.html"), "utf8");
      const hilHtml = await fs.readFile(path.join(config.rootDir, "public", "hil-test-case-generation.html"), "utf8");
      const hierarchyScript = await fs.readFile(path.join(config.rootDir, "public", "hierarchy.js"), "utf8");
      const extractorScript = await fs.readFile(path.join(config.rootDir, "public", "document-extractor.js"), "utf8");
      const generatorScript = await fs.readFile(path.join(config.rootDir, "public", "generator.js"), "utf8");
      const feedbackPoolScript = await fs.readFile(path.join(config.rootDir, "public", "feedback-pool.js"), "utf8");

      assert.ok(moduleDetailHtml.includes('data-workspace-tab="document_extractor"'));
      assert.ok(moduleDetailHtml.includes('id="module-record-review-dialog"'));
      assert.ok(moduleDetailHtml.includes('id="module-record-review-content"'));
      assert.ok(hierarchyScript.includes('document_extractor'));
      assert.ok(moduleDetailHtml.includes("历史任务"));
      assert.ok(hierarchyScript.includes(".card { border-radius: 18px !important; box-shadow: none !important; }"));
      assert.match(hierarchyScript, /function ensureTaskPolling[\s\S]*historyDrawer\?\.classList\.contains\("open"\)[\s\S]*refreshModuleTaskHistory/);
      assert.ok(extractorHtml.includes('id="extract-form"'));
      assert.ok(extractorHtml.includes('id="paste-zone"'));
      assert.ok(extractorHtml.includes('id="spreadsheet-input"'));
      assert.ok(extractorHtml.includes('id="spreadsheet-preview-list"'));
      assert.ok(extractorHtml.includes('<option value="hil_test_case">HIL 测试用例</option>'));
      assert.ok(extractorHtml.includes('id="asset-preview-dialog"'));
      assert.ok(extractorHtml.includes('id="task-started-dialog"'));
      assert.ok(extractorScript.includes("clipboardData"));
      assert.ok(extractorScript.includes("imagePreviewList"));
      assert.ok(extractorScript.includes("spreadsheetInput"));
      assert.ok(extractorScript.includes("spreadsheetPreviewList"));
      assert.ok(extractorScript.includes("handleSpreadsheetInputChange"));
      assert.ok(extractorScript.includes("openAssetPreview"));
      assert.ok(extractorScript.includes('documentType === "hil_test_case"'));
      assert.ok(extractorScript.includes('role === "extracted_hil_test_case"'));
      assert.ok(extractorScript.includes("openTaskStartedDialog"));
      assert.ok(extractorScript.includes("document_extractor:tasks_changed"));
      assert.ok(extractorScript.includes("syncTopNavLinks"));
      assert.ok(generatorScript.includes("syncTopNavLinks"));
      assert.ok(feedbackPoolScript.includes("syncTopNavLinks"));
      assert.ok(hierarchyScript.includes("document_extractor:tasks_changed"));
      assert.ok(hierarchyScript.includes("refreshModuleTaskHistory"));
      assert.ok(extractorScript.includes("window.top.location.href"));
      assert.ok(generatorScript.includes("window.top.location.href"));
      assert.ok(feedbackPoolScript.includes("window.top.location.href"));
      assert.ok(hierarchyScript.includes("文档提取"));
      assert.ok(hierarchyScript.includes("documentExtractionTasks"));
      assert.ok(hierarchyScript.includes('role === "extracted_hil_test_case"'));
      assert.ok(generatorScript.includes('role === "extracted_hil_test_case"'));
      assert.ok(feedbackPoolScript.includes('role === "extracted_hil_test_case"'));
      assert.ok(requirementHtml.includes('href="/requirement-generation"'));
      assert.ok(detailHtml.includes('href="/detail-design-generation"'));
      assert.ok(hilHtml.includes('href="/hil-test-case-generation"'));
    }
  },
  {
    name: "Document extractor asset content API returns generated markdown for preview",
    run: async () => {
      await withTempConfig(async () => {
        const projectService = new ProjectService();
        const project = await projectService.createProject({ name: "Preview Project" });
        const module = await projectService.createModule(project.id, { name: "高压安全管理" });
        const task = await projectService.recordDocumentExtractionTask(project.id, module.id, {
          targetDocumentType: "software_requirement",
          status: "completed"
        });
        const asset = await projectService.createExtractedModuleAsset(project.id, module.id, {
          sourceTaskId: task.id,
          targetDocumentType: "software_requirement",
          markdown: "# 高压安全管理-软件需求\n\n## 文档信息\n",
          summary: "用于预览"
        });

        await withTestServer(async ({ baseUrl }) => {
          const response = await fetch(
            `${baseUrl}/api/projects/${project.id}/modules/${module.id}/assets/${asset.id}/content`
          );
          assert.equal(response.status, 200);
          const payload = await response.json();

          assert.equal(payload.assetId, asset.id);
          assert.equal(payload.originalName, "高压安全管理-软件需求.md");
          assert.equal(payload.role, "extracted_software_requirement");
          assert.ok(payload.content.includes("## 文档信息"));
        });
      });
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
    name: "Document extractor page route serves the extractor workspace",
    run: async () => {
      await withTestServer(async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/document-extractor`);
        assert.equal(response.status, 200);
        const html = await response.text();

        assert.ok(html.includes("文档提取"));
        assert.ok(html.includes('id="extract-form"'));
        assert.ok(html.includes('id="paste-zone"'));
      });
    }
  },
  {
    name: "Task detail page route supports document space task urls",
    run: async () => {
      await withTestServer(async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/projects/project-1/modules/module-1/spaces/software_requirement/tasks/task-1`);
        assert.equal(response.status, 200);
        const html = await response.text();

        assert.ok(html.includes('data-page="task-detail"'));
        assert.ok(html.includes('id="task-title"'));
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
  },
  {
    name: "Feedback pool history keeps delete on task cards and opens Replay Lab from detail panel",
    run: async () => {
      const script = await fs.readFile(path.join(config.rootDir, "public", "feedback-pool.js"), "utf8");
      const hierarchyScript = await fs.readFile(path.join(config.rootDir, "public", "hierarchy.js"), "utf8");

      assert.ok(script.includes("data-task-delete"));
      assert.ok(script.includes('method: "DELETE"'));
      assert.ok(script.includes("历史任务已删除"));
      assert.ok(script.includes("确认删除这条 Fallback 历史任务"));
      assert.ok(script.includes("data-record-delete"));
      assert.ok(script.includes('/api/rejections/${encodeURIComponent(recordId)}'));
      assert.ok(script.includes("驳回记录已删除"));
      assert.ok(script.includes("确认删除这条驳回记录"));
      assert.ok(script.includes("const initialTaskId = query.get(\"taskId\") || \"\""));
      assert.ok(script.includes("if (initialTaskId && state.selectedTaskId)"));
      assert.ok(script.includes("feedback_pool:open_record_review_overlay"));
      assert.ok(script.includes("subtitleHtml"));
      assert.ok(script.includes("detailHtml"));
      assert.ok(hierarchyScript.includes("openModuleRecordReviewOverlay"));
      assert.ok(hierarchyScript.includes("moduleRecordReviewDialog.showModal"));
      assert.ok(hierarchyScript.includes("data-feedback-history-task-delete"));
      assert.ok(hierarchyScript.includes("deleteFeedbackHistoryTask"));
      assert.ok(hierarchyScript.includes("Fallback 历史任务已删除"));
      assert.ok(hierarchyScript.includes("/replay-lab?runTaskId="));
      assert.ok(hierarchyScript.includes("查看详情页"));
    }
  },
  {
    name: "Hermes task queue runs queued work with single concurrency",
    run: async () => {
      const events = [];
      let releaseFirst = null;
      const firstCanFinish = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      const queue = new HermesTaskQueueService({ concurrency: 1 });

      const first = queue.enqueue({
        id: "task-1",
        type: "generation",
        onStart: async () => events.push("start-1"),
        run: async () => {
          events.push("run-1");
          await firstCanFinish;
          events.push("done-1");
        }
      });
      const second = queue.enqueue({
        id: "task-2",
        type: "generation",
        onStart: async () => events.push("start-2"),
        run: async () => {
          events.push("run-2");
        }
      });
      const third = queue.enqueue({
        id: "task-3",
        type: "generation",
        onStart: async () => events.push("start-3"),
        run: async () => {
          events.push("run-3");
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.deepEqual(events, ["start-1", "run-1"]);
      assert.equal(queue.getQueuePosition("generation", "task-2"), 1);
      assert.equal(queue.getQueuePosition("generation", "task-3"), 2);

      releaseFirst();
      await Promise.all([first, second, third]);
      assert.deepEqual(events, ["start-1", "run-1", "done-1", "start-2", "run-2", "start-3", "run-3"]);
    }
  },
  {
    name: "Hermes task queue summarizes generation, extraction and replay tasks",
    run: async () => {
      const projectService = {
        async listProjects() {
          return [
            {
              id: "project-1",
              name: "工程一",
              modules: [
                {
                  id: "module-1",
                  name: "模块一",
                  documentSpaces: {
                    software_requirement: {
                      generationTasks: [
                        {
                          id: "gen-1",
                          status: "queued",
                          documentType: "software_requirement",
                          progress: { message: "等待生成", percent: 3 },
                          createdAt: "2026-04-24T01:00:00.000Z",
                          updatedAt: "2026-04-24T01:00:00.000Z"
                        }
                      ]
                    },
                    detail_design: { generationTasks: [] },
                    hil_test_case: { generationTasks: [] }
                  },
                  documentExtractionTasks: [
                    {
                      id: "extract-1",
                      status: "running",
                      targetDocumentType: "software_requirement",
                      progress: { message: "正在提取", percent: 40 },
                      createdAt: "2026-04-24T01:01:00.000Z",
                      updatedAt: "2026-04-24T01:02:00.000Z"
                    }
                  ],
                  slxParserTasks: [
                    {
                      id: "slx-1",
                      status: "queued",
                      progress: { message: "等待解析", percent: 0 },
                      createdAt: "2026-04-24T01:05:00.000Z",
                      updatedAt: "2026-04-24T01:05:00.000Z"
                    }
                  ]
                }
              ]
            }
          ];
        }
      };
      const replayTaskService = {
        async listTasks() {
          return [
            {
              id: "replay-1",
              taskStatus: "done",
              projectId: "project-1",
              moduleId: "module-1",
              summary: "Replay 完成",
              createdAt: "2026-04-24T01:03:00.000Z",
              updatedAt: "2026-04-24T01:04:00.000Z"
            }
          ];
        }
      };
      const queue = new HermesTaskQueueService({ projectService, replayTaskService });
      queue.enqueue({
        id: "blocker",
        type: "generation",
        run: async () => new Promise(() => {})
      });
      queue.enqueue({
        id: "gen-1",
        type: "generation",
        run: async () => null
      });

      const summaries = await queue.listTaskSummaries();
      const ids = summaries.map((task) => task.id);
      assert.ok(ids.includes("gen-1"));
      assert.ok(ids.includes("extract-1"));
      assert.ok(ids.includes("replay-1"));
      assert.ok(ids.includes("slx-1"));
      assert.equal(summaries.find((task) => task.id === "gen-1").queuePosition, 1);
      assert.equal(summaries.find((task) => task.id === "extract-1").detailUrl, "/projects/project-1/modules/module-1?openHistory=1&highlightTaskId=extract-1");
      assert.equal(summaries.find((task) => task.id === "replay-1").detailUrl, "/feedback-pool?projectId=project-1&moduleId=module-1&taskId=replay-1");
      const slxSummary = summaries.find((task) => task.id === "slx-1");
      assert.equal(slxSummary.type, "slx_parse");
      assert.equal(slxSummary.documentType, "software_requirement");
      assert.ok(slxSummary.detailUrl.includes("/slx-parser?projectId=project-1&moduleId=module-1&highlightTaskId=slx-1"));
      assert.equal(slxSummary.title.includes("SLX 解析"), true);
      assert.equal(slxSummary.queuePosition, 0);
    }
  },
  {
    name: "Main pages load the global task queue widget",
    run: async () => {
      const pages = [
        "index.html",
        "module-detail.html",
        "task-detail.html",
        "feedback-pool.html",
        "document-extractor.html",
        "requirement-generation.html",
        "slx-parser.html"
      ];
      for (const page of pages) {
        const html = await fs.readFile(path.join(config.rootDir, "public", page), "utf8");
        assert.ok(html.includes('/task-queue-widget.js'), `${page} should load task queue widget`);
      }
      const script = await fs.readFile(path.join(config.rootDir, "public", "task-queue-widget.js"), "utf8");
      assert.ok(script.includes("/api/task-queue"));
      assert.ok(script.includes("任务队列"));
      const slxHtml = await fs.readFile(path.join(config.rootDir, "public", "slx-parser.html"), "utf8");
      assert.ok(slxHtml.includes('/app.css'), "slx-parser.html should load app.css");
      assert.ok(slxHtml.includes('/feedback-widget.css'), "slx-parser.html should load feedback-widget.css");
      assert.ok(slxHtml.includes('/slx-parser.js'), "slx-parser.html should load slx-parser.js");
      assert.ok(slxHtml.includes('/feedback-widget.js'), "slx-parser.html should load feedback-widget.js");
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
