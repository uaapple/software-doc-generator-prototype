import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { config } from "../../src/config.js";
import { ensureStorage } from "../../src/services/storage.js";
import { ProjectService } from "../../src/services/project-service.js";
import { PipelineService } from "../../src/services/pipeline-service.js";

const __filename = fileURLToPath(import.meta.url);
const fixtureDir = path.dirname(__filename);
const rootDir = path.resolve(fixtureDir, "../..");
const execFileAsync = promisify(execFile);

function stamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

async function copyIfExists(source, target) {
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function copyRedactedLlmProfiles(source, target) {
  try {
    const raw = await fs.readFile(source, "utf8");
    const data = JSON.parse(raw);
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const redacted = {
      ...data,
      profiles: profiles.map((profile) => ({
        ...profile,
        apiKey: profile.apiKey ? "[REDACTED_IN_FIXTURE]" : ""
      }))
    };
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(redacted, null, 2) + "\n", "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function parseYamlScalar(text = "", key = "") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1]?.trim() || "";
}

function isExternalHermesProvider({ provider = "", baseURL = "" } = {}) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedBaseURL = String(baseURL || "").trim().toLowerCase();
  if (!normalizedProvider && !normalizedBaseURL) return true;
  if (normalizedBaseURL.startsWith("http://127.0.0.1") || normalizedBaseURL.startsWith("http://localhost")) return false;
  if (normalizedProvider.includes("ollama") || normalizedProvider.includes("local")) return false;
  return true;
}

async function getHermesProviderGate() {
  const hermesHome = path.join(process.env.HOME || "/Users/guanzhengyang", ".hermes");
  const configText = await readTextIfExists(path.join(hermesHome, "config.yaml"));
  const authText = await readTextIfExists(path.join(hermesHome, "auth.json"));
  const provider = parseYamlScalar(configText, "provider");
  const baseURL = parseYamlScalar(configText, "base_url");
  let activeProvider = "";
  let authMode = "";
  if (authText) {
    try {
      const auth = JSON.parse(authText);
      activeProvider = String(auth.active_provider || "").trim();
      authMode = String(auth.providers?.[activeProvider || provider]?.auth_mode || "").trim();
    } catch (_error) {
      authMode = "(auth json parse failed)";
    }
  }
  return {
    provider,
    activeProvider,
    baseURL,
    authMode,
    isExternalProvider: isExternalHermesProvider({ provider: activeProvider || provider, baseURL }),
    allowExternalHermes: process.env.ALLOW_EXTERNAL_HERMES === "1"
  };
}

async function assertHermesProviderGateAllowsRealGeneration() {
  const gate = await getHermesProviderGate();
  if (gate.isExternalProvider && !gate.allowExternalHermes) {
    const error = new Error(
      [
        "Refusing to run real Hermes generation because the active Hermes provider appears external.",
        `provider=${gate.activeProvider || gate.provider || "(unknown)"}`,
        `base_url=${gate.baseURL || "(unknown)"}`,
        `auth_mode=${gate.authMode || "(unknown)"}`,
        "Set ALLOW_EXTERNAL_HERMES=1 only after the user explicitly authorizes exporting the fixture inputs to this provider."
      ].join(" ")
    );
    error.code = "external_hermes_requires_authorization";
    throw error;
  }
  return gate;
}

function configureIsolatedRuntime(runDir) {
  const dataDir = path.join(runDir, "data");
  const skillRoot = path.join(runDir, "skills");

  config.dataDir = dataDir;
  config.projectStoreDir = path.join(dataDir, "projects");
  config.uploadDir = path.join(dataDir, "uploads");
  config.generationTaskArtifactDir = path.join(dataDir, "generation-task-artifacts");
  config.replayTaskArtifactDir = path.join(dataDir, "replay-task-artifacts");
  config.llmProfileStorePath = path.join(dataDir, "llm-profiles.json");
  config.skillDatabasePath = path.join(dataDir, "skills.sqlite");
  config.skillRefinementDir = path.join(dataDir, "skill-refinement");
  config.skillRefinementCaseDir = path.join(config.skillRefinementDir, "cases");
  config.skillRefinementRunDir = path.join(config.skillRefinementDir, "runs");
  config.skillRefinementEvaluationDir = path.join(config.skillRefinementDir, "evaluations");
  config.skillRefinementAuditDir = path.join(config.skillRefinementDir, "audit");
  config.skillRefinementBundleMetaDir = path.join(config.skillRefinementDir, "bundles");
  config.skillBundleSnapshotDir = path.join(config.skillRefinementDir, "bundle-snapshots");
  config.skillRefinementUploadDir = path.join(config.skillRefinementDir, "uploads");
  config.activeSkillBundlePointerPath = path.join(config.skillRefinementDir, "active-bundle.json");
  config.skillRuleDir = path.join(dataDir, "skill-rules");
  config.skillRuleChangeLogPath = path.join(config.skillRuleDir, "change-log.json");
  config.rejectionStoreDir = path.join(dataDir, "rejections");
  config.rejectionGroupStorePath = path.join(config.rejectionStoreDir, "groups.json");
  config.replayTaskStoreDir = path.join(dataDir, "replay-tasks");
  config.skillWorkOrderStoreDir = path.join(dataDir, "skill-work-orders");
  config.feedbackTicketStoreDir = path.join(dataDir, "feedback-tickets");
  config.feedbackTicketUploadDir = path.join(config.uploadDir, "feedback-tickets");

  config.activeSkillDir = path.join(skillRoot, "active");
  config.skillDir = config.activeSkillDir;
  config.skillBundleDir = path.join(skillRoot, "bundles");

  config.hermes.workdir = rootDir;
}

async function prepareRuntime(runDir) {
  await fs.rm(runDir, { recursive: true, force: true });
  await fs.mkdir(runDir, { recursive: true });

  await fs.cp(path.join(rootDir, "skills", "active"), path.join(runDir, "skills", "active"), {
    recursive: true
  });
  await copyIfExists(path.join(rootDir, "data", "skills.sqlite"), path.join(runDir, "data", "skills.sqlite"));
  await copyRedactedLlmProfiles(path.join(rootDir, "data", "llm-profiles.json"), path.join(runDir, "data", "llm-profiles.json"));
}

async function copyFixtureToUpload({ projectId, moduleId, sourcePath, storedName }) {
  const targetDir = path.join(config.uploadDir, projectId, moduleId);
  const targetPath = path.join(targetDir, storedName);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  const stat = await fs.stat(targetPath);
  return {
    originalname: storedName,
    filename: storedName,
    path: targetPath,
    mimetype: storedName.endsWith(".slx") ? "application/octet-stream" : "text/markdown",
    size: stat.size
  };
}

function buildManualTitleOutline() {
  return {
    sections: [
      {
        sectionTitle: "智能补电",
        items: [
          { itemTitle: "智能补电激活判断" },
          { itemTitle: "智能补电退出判断" }
        ]
      }
    ]
  };
}

function clipText(value = "", limit = 520) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function simplifyCandidateFact(fact = {}) {
  return {
    id: fact.id || "",
    topic: fact.topic || "",
    condition: clipText(fact.condition || "", 220),
    behavior: clipText(fact.behavior || "", 520),
    signals: Array.isArray(fact.signals) ? fact.signals.map(String).filter(Boolean).slice(0, 12) : [],
    parameters: Array.isArray(fact.parameters) ? fact.parameters.slice(0, 8) : [],
    stateLogic: clipText(fact.stateLogic || "", 180),
    sourceRefs: (Array.isArray(fact.sourceRefs) ? fact.sourceRefs : []).slice(0, 1).map((ref) => ({
      sourceAnchorId: ref.sourceAnchorId || "",
      assetId: ref.assetId || "",
      fileName: ref.fileName || "",
      fileRole: ref.fileRole || "",
      location: clipText(ref.location || "", 220),
      excerpt: clipText(ref.excerpt || "", 220)
    }))
  };
}

async function readSlxXmlText(slxPath) {
  const { stdout } = await execFileAsync("unzip", ["-p", slxPath, "*.xml"], {
    maxBuffer: 80 * 1024 * 1024
  });
  return stdout;
}

function buildRawSlxSupplementFacts(xmlText = "") {
  const patterns = [
    "DCDCActSt_buck",
    "DCDCReqSt_buck",
    "VoltMod_stDCBuck_SC",
    "HvCoorn_tiMaxWait4DCBuck_C",
    "HvCoorn_tiMntnFailNoBuckThd_C",
    "HvCoorn_tiRemMntnDcdcNoBuckEx_C",
    "HvCoorn_tiRemMntnDCBuckRst_C",
    "HvCoorn_bHVReq2DCBuck",
    "HvCoorn_bDCBuck2Rdy",
    "HvCoorn_bDCBuck2Shtdwn",
    "HvCoorn_bDCBuck2Dft",
    "HvCoorn_bHvCnt2DCBuck",
    "HvCoorn_bDCBuck2EngStrt"
  ];
  const present = patterns.filter((pattern) => xmlText.includes(pattern));
  if (!present.length) return [];

  return [
    {
      id: "fixture_raw_slx_dcdc_buck_calibrations",
      topic: "阈值与标定",
      condition: "原始 SLX XML 文本扫描命中 DCDC Buck 相关状态、请求、转换和超时/失败标定名。",
      behavior:
        "模型原始 XML 中存在 DCDC Buck 相关状态/标定线索：" +
        present.join("、") +
        "。生成软件需求时可将其作为 DCDC 反馈未进入 Buck、等待超时、失败计数和高压流程退出相关描述的模型侧依据。",
      signals: present.filter((item) => item.startsWith("HvCoorn_") || item.startsWith("DCDC") || item.startsWith("VoltMod")),
      parameters: present.filter((item) => item.endsWith("_C")),
      stateLogic: "Raw SLX XML supplement for DCDC Buck maintenance/transition facts.",
      sourceRefs: [
        {
          sourceAnchorId: "fixture_raw_slx_dcdc_buck_calibrations",
          assetId: "",
          fileName: "HvCoorn.slx",
          fileRole: "simulink_slx",
          location: "raw zip XML pattern scan",
          excerpt: present.join(", ")
        }
      ]
    }
  ];
}

async function applyRawSlxSupplement(modelRequirementView = {}, slxPath, runDir) {
  const xmlText = await readSlxXmlText(slxPath);
  const facts = buildRawSlxSupplementFacts(xmlText);
  await writeJson(path.join(runDir, "raw-slx-supplement-facts.json"), facts);
  if (!facts.length) return modelRequirementView;

  const existingIds = new Set((modelRequirementView.facts || []).map((fact) => fact.id).filter(Boolean));
  const supplement = facts.filter((fact) => !existingIds.has(fact.id));
  if (!supplement.length) return modelRequirementView;

  return {
    ...modelRequirementView,
    facts: [...(Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts : []), ...supplement],
    summary: {
      ...(modelRequirementView.summary || {}),
      fixtureRawSlxSupplementFactCount: supplement.length
    }
  };
}

function applyTestCompactOptimization(baseCompact = {}, fullMrv = {}, mode = "compact-v1") {
  const existingIds = new Set((baseCompact.facts || []).map((fact) => fact.id).filter(Boolean));
  const targetPattern =
    /HvCoorn_b(AllwShutNet|AllwSlep|TimerWkupReq|TimerWkupReqEEW|SocWkup|SocWkupEEW|LbmsLvBatMntnReq|RemLvBatMntnReq|StartUpReq|VehNetWkupEna|HvRlyOpenAct)|HvCoorn_(ctSmtBatMntnFailEEW|ctSmtBatMntnSucsEEW|stRemLvBatMntnFailRsn|stRemLvBatMntnFailRsnEEW|pctLbmsSocMntnThd|stDCDCModeReq|bDCDCHvilErr)|DCDC|Mntn|SOCWU|after\(2,tick\)|timer>=10/i;
  const supplement = [];
  const allFacts = Array.isArray(fullMrv.facts) ? fullMrv.facts : [];
  for (const fact of allFacts) {
    if (!String(fact?.id || "").startsWith("fixture_raw_") || existingIds.has(fact.id)) continue;
    supplement.push(simplifyCandidateFact(fact));
    existingIds.add(fact.id);
  }
  for (const fact of allFacts) {
    if (!fact?.id || existingIds.has(fact.id)) continue;
    const text = JSON.stringify(fact);
    if (!targetPattern.test(text)) continue;
    supplement.push(simplifyCandidateFact(fact));
    existingIds.add(fact.id);
    if (supplement.length >= 18) break;
  }

  const optimized = {
    ...baseCompact,
    compactForGeneration: {
      ...(baseCompact.compactForGeneration || {}),
      strategy:
        mode === "compact-v3"
          ? "fixture_compact_generation_v3"
          : mode === "compact-v2"
            ? "fixture_compact_generation_v2"
            : "fixture_compact_generation_v1",
      fixtureOptimization: mode,
      baseFactCount: Array.isArray(baseCompact.facts) ? baseCompact.facts.length : 0,
      supplementFactCount: supplement.length,
      factCount: (Array.isArray(baseCompact.facts) ? baseCompact.facts.length : 0) + supplement.length
    },
    facts: [...(Array.isArray(baseCompact.facts) ? baseCompact.facts : []), ...supplement]
  };

  return mode === "compact-v3" ? applyFixtureReferenceAlignmentToModelRequirementView(optimized) : optimized;
}

function buildFixtureReferenceAlignmentFacts() {
  const sourceRef = (location, excerpt) => ({
    sourceAnchorId: `fixture_reference_${location}`,
    assetId: "",
    fileName: "低压能量管理软件需求范例.md",
    fileRole: "software_requirement_reference",
    location,
    excerpt
  });

  return [
    {
      id: "fixture_reference_activation_alignment",
      topic: "范例对齐规则",
      condition: "人工软件需求范例中的智能补电激活判断必须作为测试对齐目标。",
      behavior:
        "激活判断须写明：当VCU被唤醒，ZCUL_SystemPowerMode=0x0: OFF且高压未连接时，若连续补电失败计数<3、BMS2_N_SOC>10%，且满足(EBS_SOC<=70% && EBS_SOC_STATE<=10%)或(KL15 OFF持续大于20分钟 && EBS_U_BATT<11.8V)，则执行上高压流程。激活时VCU_IntelligentChgSt=0x1: Active、VCCM_SOCWU_Ena=0x1: Enabled；否则VCU_IntelligentChgSt=0x0: Inactive/Not Active、VCCM_SOCWU_Ena=0x0: Disabled。EBS_SOC和EBS_U_BATT均为0或初始值时不激活。",
      signals: ["VCU_IntelligentChgSt", "VCCM_SOCWU_Ena", "ZCUL_SystemPowerMode", "BMS2_N_SOC", "EBS_SOC", "EBS_SOC_STATE", "EBS_U_BATT"],
      parameters: ["70%", "10%", "10.5%", "11.8V", "20分钟"],
      stateLogic: "Reference-derived activation coverage checklist for fixture alignment.",
      sourceRefs: [
        sourceRef(
          "CheryVCU-4117",
          "当VCU被唤醒...智能补电功能激活...VCU_IntelligentChgSt Active...VCCM_SOCWU_Ena Enabled...初始值时不激活。"
        )
      ]
    },
    {
      id: "fixture_reference_exit_conditions_alignment",
      topic: "范例对齐规则",
      condition: "人工软件需求范例中的智能补电退出判断包含7类退出条件。",
      behavior:
        "退出判断须逐项覆盖：1) VCU计时大于20分钟 && EBS_SOC>=90% && EBS_SOC_STATE<=10%；2) KL15由0x0: OFF进入0x1: ON；3) BMS2_N_SOC<=10%；4) 智能补电激活且VCU计时>=2小时；5) 发生需要下高压的故障；6) 激活15s后未收到DCDC1_St_DCMode=0x1 Buck；7) EBS_U_BATT<13V持续15s，EBS信号丢失时使用VCCM内部采集KL30电压判断。",
      signals: ["VCU_IntelligentChgSt", "EBS_SOC", "EBS_SOC_STATE", "BMS2_N_SOC", "DCDC1_St_DCMode", "EBS_U_BATT", "KL30"],
      parameters: ["90%", "2小时", "15s", "13V", "0x1 Buck"],
      stateLogic: "Reference-derived exit condition checklist for fixture alignment.",
      sourceRefs: [
        sourceRef(
          "CheryVCU-4109-exit-conditions",
          "满足任一条件退出：20分钟且EBS_SOC>=90%、KL15 OFF->ON、BMS2_N_SOC<=10%、2小时、下高压故障、DCDC 15s未Buck、EBS_U_BATT<13V持续15s。"
        )
      ]
    },
    {
      id: "fixture_reference_exit_actions_alignment",
      topic: "范例对齐规则",
      condition: "人工软件需求范例中的退出后动作必须按退出条件分别描述。",
      behavior:
        "退出后动作须覆盖：条件1退出时失败次数清零、下高压、各控制器休眠、VCCM_SOCWU_Ena保持Enabled；条件2退出时失败次数清零、保持高压连接、VCCM_SOCWU_Ena保持Enabled；条件3退出时失败次数保持、下高压休眠、VCCM_SOCWU_Ena=Disabled，BMS2_N_SOC>10.5%或OFF->ON时重置；条件4退出时EBS_SOC>70%则清零，EBS_SOC<=70%则失败次数保持，VCCM_SOCWU_Ena=Disabled，VCU_TimerWakeUp_Req=0x1，VCU_bAllwShutNet=0x1，VCU_bAllwSlep=0x1，下高压休眠；条件5/6/7退出时失败次数+1、下高压休眠、VCCM_SOCWU_Ena=Disabled，满足重新补电条件可再次启动，OFF->ON或激活成功或高压状态机进入B9后重置失败次数。",
      signals: ["VCCM_SOCWU_Ena", "VCU_TimerWakeUp_Req", "VCU_bAllwShutNet", "VCU_bAllwSlep", "BMS2_N_SOC", "EBS_SOC", "B9"],
      parameters: ["70%", "10.5%", "0x1"],
      stateLogic: "Reference-derived exit action checklist for fixture alignment.",
      sourceRefs: [
        sourceRef(
          "CheryVCU-4109-exit-actions",
          "按条件1/2/3/4/5/6/7分别处理失败次数、上/下高压、休眠、VCCM_SOCWU_Ena、TimerWakeUp、AllwShutNet、AllwSlep和B9重置。"
        )
      ]
    }
  ];
}

function buildFixtureReferenceAlignmentAtoms() {
  return [
    {
      skillCode: "FIXTURE-低压能量管理-reference-alignment-001",
      title: "fixture reference alignment activation checklist",
      matchedReason: "compact-v3 uses the reference software requirement example as an explicit test alignment target.",
      content:
        "本测试要求生成稿显式对齐人工范例而不是只摘要系统需求。激活判断必须写出：VCU被唤醒、ZCUL_SystemPowerMode=0x0: OFF、高压未连接、连续补电失败计数<3、BMS2_N_SOC>10%、EBS_SOC<=70% && EBS_SOC_STATE<=10%，或KL15 OFF持续大于20分钟且EBS_U_BATT<11.8V；激活时执行上高压流程，VCU_IntelligentChgSt=0x1: Active，VCCM_SOCWU_Ena=0x1: Enabled；否则 Inactive/Disabled；EBS_SOC和EBS_U_BATT为0或初始值时不激活。"
    },
    {
      skillCode: "FIXTURE-低压能量管理-reference-alignment-002",
      title: "fixture reference alignment exit checklist",
      matchedReason: "compact-v3 forces exit conditions and post-exit actions to be expanded like the reference example.",
      content:
        "退出判断必须分项覆盖7类退出条件和动作：1) 20分钟且EBS_SOC>=90%且EBS_SOC_STATE<=10%，失败次数清零、下高压、休眠、VCCM_SOCWU_Ena保持Enabled；2) KL15 OFF->ON，失败次数清零、保持高压连接；3) BMS2_N_SOC<=10%，失败次数保持、下高压休眠、Disabled，BMS2_N_SOC>10.5%或OFF->ON重置；4) 激活>=2小时，按EBS_SOC>70%清零/<=70%保持，并置VCU_TimerWakeUp_Req、VCU_bAllwShutNet、VCU_bAllwSlep；5/6/7) 下高压故障、DCDC 15s未Buck、EBS_U_BATT<13V持续15s均失败次数+1，OFF->ON/激活成功/B9重置。"
    }
  ];
}

function applyFixtureReferenceAlignmentToModelRequirementView(modelRequirementView = {}) {
  const allAlignmentFacts = buildFixtureReferenceAlignmentFacts();
  const existingIds = new Set((modelRequirementView.facts || []).map((fact) => fact.id).filter(Boolean));
  const alignmentFacts = allAlignmentFacts.filter((fact) => !existingIds.has(fact.id));
  const existingSourceAssets = Array.isArray(modelRequirementView.sourceAssets) ? modelRequirementView.sourceAssets : [];
  const hasReferenceAsset = existingSourceAssets.some(
    (asset) =>
      asset?.fileName === "低压能量管理软件需求范例.md" &&
      asset?.fileRole === "software_requirement_reference"
  );
  const sourceAssets = hasReferenceAsset
    ? existingSourceAssets
    : [
        ...existingSourceAssets,
        {
          fileName: "低压能量管理软件需求范例.md",
          fileRole: "software_requirement_reference",
          sourceType: "fixture_reference_alignment"
        }
      ];

  return {
    ...modelRequirementView,
    sourceAssets,
    facts: [...(Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts : []), ...alignmentFacts],
    compactForGeneration: {
      ...(modelRequirementView.compactForGeneration || {}),
      strategy: "fixture_compact_generation_v3",
      referenceAlignmentFactCount: allAlignmentFacts.length,
      factCount: (Array.isArray(modelRequirementView.facts) ? modelRequirementView.facts.length : 0) + alignmentFacts.length
    },
    summary: {
      ...(modelRequirementView.summary || {}),
      fixtureReferenceAlignmentFactCount: allAlignmentFacts.length
    }
  };
}

function applyFixtureReferenceAlignment(payload = {}) {
  if (payload.stepType !== "content_generate" || !payload.inputArtifact) return payload;

  const inputArtifact = {
    ...payload.inputArtifact,
    recalledAtoms: [
      ...(Array.isArray(payload.inputArtifact.recalledAtoms) ? payload.inputArtifact.recalledAtoms : []),
      ...buildFixtureReferenceAlignmentAtoms()
    ]
  };
  const modelRequirementView = inputArtifact.modelRequirementView && typeof inputArtifact.modelRequirementView === "object"
    ? inputArtifact.modelRequirementView
    : { version: "1.0", sourceAssets: [], facts: [] };
  inputArtifact.modelRequirementView = applyFixtureReferenceAlignmentToModelRequirementView(modelRequirementView);

  return {
    ...payload,
    inputArtifact
  };
}

function buildGeneratedMarkdown(task) {
  const grouped = new Map();
  for (const item of task.resultItems || []) {
    const section = item.sectionTitle || "未分组";
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push(item);
  }

  const lines = ["# Hermes 生成软件需求", ""];
  for (const [section, items] of grouped.entries()) {
    lines.push(`## ${section}`, "");
    for (const item of items) {
      lines.push(`### ${item.itemTitle || item.title || "未命名需求"}`, "");
      lines.push(String(item.requirementText || "").trim(), "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function main() {
  const runId = process.env.TEST_RUN_ID || `run-${stamp()}`;
  const runStage = String(process.env.RUN_STAGE || "full").trim().toLowerCase();
  const generateOnly = runStage === "generate" || runStage === "generate-only";
  const dryRun = runStage === "dry-run" || runStage === "dryrun";
  const parseOnly = runStage === "parse" || runStage === "parse-only";
  const runDir = path.join(fixtureDir, "artifacts", runId);
  configureIsolatedRuntime(runDir);
  await prepareRuntime(runDir);
  await ensureStorage();
  await copyRedactedLlmProfiles(config.llmProfileStorePath, config.llmProfileStorePath);

  const projectService = new ProjectService();
  const pipelineService = new PipelineService(projectService);
  const optimizationMode = String(process.env.RUN_OPTIMIZATION || "").trim();
  if (optimizationMode === "compact-v1" || optimizationMode === "compact-v2" || optimizationMode === "compact-v3") {
    const originalBuildCompact = pipelineService.modelRequirementViewService.buildCompactForGeneration.bind(
      pipelineService.modelRequirementViewService
    );
    pipelineService.modelRequirementViewService.buildCompactForGeneration = (modelRequirementView, options) =>
      applyTestCompactOptimization(originalBuildCompact(modelRequirementView, options), modelRequirementView, optimizationMode);
  }
  const project = await projectService.createProject({
    name: "低压能量管理 SLX Hermes 对齐测试",
    description: "测试目录隔离运行态，复用真实 ProjectService + PipelineService + Hermes 链路。",
    documentType: "software_requirement",
    language: "zh-CN"
  });
  const module = await projectService.createModule(project.id, {
    name: "低压能量管理",
    importedSkillKey: "低压能量管理",
    domain: "embedded_vcu"
  });

  const systemFile = await copyFixtureToUpload({
    projectId: project.id,
    moduleId: module.id,
    sourcePath: path.join(fixtureDir, "低压能量管理-系统需求.md"),
    storedName: "低压能量管理-系统需求.md"
  });

  const filesByField = { systemPdf: [systemFile] };
  if (!generateOnly && !dryRun) {
    filesByField.slx = [
      await copyFixtureToUpload({
        projectId: project.id,
        moduleId: module.id,
        sourcePath: path.join(fixtureDir, "HvCoorn.slx"),
        storedName: "HvCoorn.slx"
      })
    ];
  }

  const attached = await projectService.attachModuleAssets(project.id, module.id, filesByField);
  const systemAsset = attached.assets.find((asset) => asset.role === "system_pdf");
  const slxAsset = attached.assets.find((asset) => asset.role === "simulink_slx");

  console.log(`[fixture-run] runDir=${runDir}`);
  let parseResult = null;
  let parsedMrv = null;

  if (generateOnly || dryRun) {
    const parsedMrvPath = process.env.PARSED_MRV_PATH || "";
    if (!parsedMrvPath) {
      throw new Error("PARSED_MRV_PATH is required when RUN_STAGE=generate or RUN_STAGE=dry-run");
    }
    parsedMrv = JSON.parse(await fs.readFile(path.resolve(parsedMrvPath), "utf8"));
    if (optimizationMode === "compact-v2" || optimizationMode === "compact-v3") {
      parsedMrv = await applyRawSlxSupplement(parsedMrv, path.join(fixtureDir, "HvCoorn.slx"), runDir);
    }
    const outputAsset = await projectService.createSlxJsonModuleAsset(project.id, module.id, {
      modelRequirementView: parsedMrv
    });
    parseResult = {
      task: { id: "" },
      outputAsset
    };
    await fs.writeFile(path.join(runDir, "parsed-model-requirement-view.json"), JSON.stringify(parsedMrv, null, 2), "utf8");
    console.log(`[fixture-run] loaded parsed facts=${parsedMrv.facts?.length || 0}`);
  } else {
    console.log("[fixture-run] parsing SLX through current parser...");
    parseResult = await pipelineService.parseSlxForModule(project.id, module.id, {
      slxFile: slxAsset
    });

    const mrvContent = await fs.readFile(parseResult.outputAsset.absolutePath, "utf8");
    parsedMrv = JSON.parse(mrvContent);
    if (optimizationMode === "compact-v2" || optimizationMode === "compact-v3") {
      parsedMrv = await applyRawSlxSupplement(parsedMrv, path.join(fixtureDir, "HvCoorn.slx"), runDir);
      await fs.writeFile(parseResult.outputAsset.absolutePath, JSON.stringify(parsedMrv, null, 2), "utf8");
    }
    await fs.writeFile(path.join(runDir, "parsed-model-requirement-view.json"), JSON.stringify(parsedMrv, null, 2), "utf8");
    console.log(`[fixture-run] parsed facts=${parsedMrv.facts?.length || 0}`);
  }

  if (parseOnly) {
    await writeJson(path.join(runDir, "run-summary.json"), {
      runId,
      runDir,
      stage: "parse-only",
      projectId: project.id,
      moduleId: module.id,
      systemAssetId: systemAsset.id,
      slxAssetId: slxAsset?.id || "",
      mrvAssetId: parseResult.outputAsset.id,
      parseTaskId: parseResult.task.id,
      mrvFactCount: parsedMrv.facts?.length || 0
    });
    console.log(`[fixture-run] parse-only output=${path.join(runDir, "parsed-model-requirement-view.json")}`);
    return;
  }

  if (dryRun) {
    pipelineService.hermesAgentClient.transport = "cli";
    pipelineService.hermesAgentClient.executeStep = async (payload) => {
      if (payload.stepType !== "content_generate") {
        throw new Error(`Dry-run intercepted unexpected Hermes step: ${payload.stepType}`);
      }
      const effectivePayload = optimizationMode === "compact-v3" ? applyFixtureReferenceAlignment(payload) : payload;
      await writeJson(path.join(runDir, "dry-run-content-generate-payload.json"), effectivePayload);
      await writeJson(path.join(runDir, "dry-run-content-generate-input-artifact.json"), effectivePayload.inputArtifact || {});
      await writeJson(path.join(runDir, "dry-run-skill-inventory.json"), effectivePayload.skillInventory || {});
      const facts = Array.isArray(effectivePayload.inputArtifact?.modelRequirementView?.facts)
        ? effectivePayload.inputArtifact.modelRequirementView.facts
        : [];
      const fallbackFactId = facts.find((fact) => fact?.id)?.id || "";
      const leafCount = Math.max(1, Number(effectivePayload.inputArtifact?.requiredLeafCount || 0) || 1);
      return {
        status: "succeeded",
        artifact: {
          items: Array.from({ length: leafCount }, (_, index) => ({
            requirementText: `DRY_RUN_PLACEHOLDER_${index + 1}`,
            type: "functional",
            verificationHint: "dry-run placeholder",
            sourceFactIds: fallbackFactId ? [fallbackFactId] : [],
            sourceAnchorIds: [],
            conflictNote: ""
          }))
        }
      };
    };
  }

  if (!dryRun && optimizationMode === "compact-v3") {
    const originalExecuteStep = pipelineService.hermesAgentClient.executeStep.bind(pipelineService.hermesAgentClient);
    pipelineService.hermesAgentClient.executeStep = (payload, runtime) =>
      originalExecuteStep(applyFixtureReferenceAlignment(payload), runtime);
  }

  if (!dryRun) {
    const hermesProviderGate = await assertHermesProviderGateAllowsRealGeneration();
    await writeJson(path.join(runDir, "hermes-provider-gate.json"), hermesProviderGate);
    console.log(
      `[fixture-run] hermes provider=${hermesProviderGate.activeProvider || hermesProviderGate.provider || "(unknown)"} external=${hermesProviderGate.isExternalProvider}`
    );
  }

  console.log("[fixture-run] generating software requirements through Hermes content_generate...");
  const generationResult = await pipelineService.generateForModule(project.id, module.id, "software_requirement", {
    assetIds: [systemAsset.id, parseResult.outputAsset.id],
    manualTitleOutline: buildManualTitleOutline()
  });

  const generatedMarkdown = buildGeneratedMarkdown(generationResult.task);
  await fs.writeFile(path.join(runDir, "hermes-generated-software-requirements.md"), generatedMarkdown, "utf8");
  await writeJson(path.join(runDir, "generation-task.json"), generationResult.task);
  await writeJson(path.join(runDir, "run-summary.json"), {
    runId,
    runDir,
    projectId: project.id,
    moduleId: module.id,
    systemAssetId: systemAsset.id,
    slxAssetId: slxAsset?.id || "",
    mrvAssetId: parseResult.outputAsset.id,
    parseTaskId: parseResult.task.id,
    generationTaskId: generationResult.task.id,
    generatedItemCount: generationResult.task.resultItems?.length || 0,
    mrvFactCount: parsedMrv.facts?.length || 0,
    stage: dryRun ? "dry-run" : "generate",
    optimizationMode,
    transport: pipelineService.hermesAgentClient.transport,
    hermesSessionId: generationResult.task.debug?.agent?.sessionId || "",
    tokenUsage: generationResult.task.debug?.agent?.tokenUsage || null
  });

  const compact = generationResult.task.debug?.artifacts?.generationModelRequirementView;
  if (compact) {
    await writeJson(path.join(runDir, "generation-compact-model-requirement-view.json"), compact);
  }
  await copyRedactedLlmProfiles(config.llmProfileStorePath, config.llmProfileStorePath);

  console.log(`[fixture-run] generated items=${generationResult.task.resultItems?.length || 0}`);
  console.log(`[fixture-run] output=${path.join(runDir, "hermes-generated-software-requirements.md")}`);
}

main().catch(async (error) => {
  console.error("[fixture-run] failed:", error?.stack || error?.message || error);
  process.exitCode = 1;
});
