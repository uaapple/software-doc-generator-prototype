import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const fixtureDir = path.dirname(__filename);

const REQUIRED_TERMS = [
  { key: "manual_title_primary", label: "一级标题：智能补电", pattern: /智能补电/ },
  { key: "manual_title_activation", label: "二级标题：智能补电激活判断", pattern: /智能补电激活判断/ },
  { key: "manual_title_exit", label: "二级标题：智能补电退出判断", pattern: /智能补电退出判断/ },
  { key: "system_kl15_off", label: "系统需求：KL15 OFF", pattern: /KL15.*OFF|KL15为OFF/ },
  { key: "system_hv_disconnected", label: "系统需求：高压未连接", pattern: /高压未连接/ },
  { key: "system_fail_count_lt_3", label: "系统需求：连续补电失败计数 < 3", pattern: /连续补电失败计数.*[<＜]3|补电失败计数.*[<＜]3/ },
  { key: "system_bms_soc_gt_10", label: "系统需求：BMS2_N_SOC > 10%", pattern: /BMS2_N_SOC.*[>＞]10%/ },
  { key: "system_ebs_soc_70", label: "系统需求：EBS_SOC <= 70%", pattern: /EBS_SOC.*[≤<＜]70%/ },
  { key: "system_ebs_state_10", label: "系统需求：EBS_SOC_STATE < 10%", pattern: /EBS_SOC_STATE.*[<＜]10%|EBS_SOC_state=0x2/i },
  { key: "system_ebs_batt_118", label: "系统需求：EBS_U_BATT <= 11.8V", pattern: /EBS_U_BATT.*11\.8V/ },
  { key: "system_20min", label: "系统需求：20 分钟后低电压补电", pattern: /20分钟/ },
  { key: "system_disable_enable", label: "系统需求：VCCM_SOCWU_Ena Disabled/Enabled", pattern: /VCCM_SOCWU_Ena.*Disabled[\s\S]*VCCM_SOCWU_Ena.*Enabled|Disabled[\s\S]*Enabled/ },
  { key: "model_startup_req", label: "模型事实：HvCoorn_bStartUpReq", pattern: /HvCoorn_bStartUpReq/ },
  { key: "model_soc_wake", label: "模型事实：HvCoorn_bSocWkup", pattern: /HvCoorn_bSocWkup/ },
  { key: "model_dcdc", label: "模型事实：DCDC 模式/故障信号", pattern: /HvCoorn_stDCDCModeReq|HvCoorn_bDCDCHvilErr|DCDC/ },
  { key: "model_dcdc_buck", label: "模型事实：DCDC Buck 状态/请求", pattern: /DCDCActSt_buck|DCDCReqSt_buck|VoltMod_stDCBuck_SC|DCBuck/ },
  { key: "model_dcdc_buck_calibration", label: "模型事实：DCDC Buck 超时/失败标定", pattern: /HvCoorn_tiMaxWait4DCBuck_C|HvCoorn_tiMntnFailNoBuckThd_C|HvCoorn_tiRemMntnDcdcNoBuckEx_C/ },
  { key: "model_timer_wake", label: "模型事实：Timer wake 请求", pattern: /HvCoorn_bTimerWkupReq/ },
  { key: "model_sleep_allow", label: "模型事实：允许网络/控制器休眠", pattern: /HvCoorn_bAllwShutNet|HvCoorn_bAllwSlep/ },
  { key: "model_mntn_fail", label: "模型事实：补电失败原因/失败计数", pattern: /HvCoorn_stRemLvBatMntnFailRsn|HvCoorn_ctSmtBatMntnFail/ },
  { key: "skill_lv_rule_001", label: "Skill：低压能量管理生命周期 rule_hint-001", pattern: /MOD-低压能量管理-rule_hint-001/ },
  { key: "skill_lv_rule_002", label: "Skill：低压阈值 rule_hint-002", pattern: /MOD-低压能量管理-rule_hint-002/ },
  { key: "skill_lv_rule_003", label: "Skill：高压/休眠协同 rule_hint-003", pattern: /MOD-低压能量管理-rule_hint-003/ }
];

const EXPECTED_FROM_EXAMPLE_BUT_NOT_IN_CURRENT_SOURCES = [
  "VCU_IntelligentChgSt",
  "EBS_SOC>=90%",
  "2小时",
  "EBS_U_BATT<13V",
  "Buck",
  "B9"
];

function normalizeText(value = "") {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function flattenArtifact(inputArtifact = {}) {
  return normalizeText(JSON.stringify(inputArtifact, null, 2));
}

function summarizeFacts(facts = []) {
  const byTopic = {};
  for (const fact of facts) {
    const topic = fact.topic || "(empty)";
    byTopic[topic] = (byTopic[topic] || 0) + 1;
  }
  return byTopic;
}

function evaluateArtifact(inputArtifact = {}) {
  const text = flattenArtifact(inputArtifact);
  const facts = Array.isArray(inputArtifact.modelRequirementView?.facts)
    ? inputArtifact.modelRequirementView.facts
    : [];
  const checks = REQUIRED_TERMS.map((item) => ({
    key: item.key,
    label: item.label,
    present: item.pattern.test(text)
  }));
  return {
    factCount: facts.length,
    compactStrategy: inputArtifact.modelRequirementView?.compactForGeneration?.strategy || "",
    compactMeta: inputArtifact.modelRequirementView?.compactForGeneration || {},
    byteLength: Buffer.byteLength(JSON.stringify(inputArtifact.modelRequirementView || {}), "utf8"),
    anchorCount: Array.isArray(inputArtifact.anchors) ? inputArtifact.anchors.length : 0,
    recalledSkillCodes: Array.isArray(inputArtifact.recalledAtoms)
      ? inputArtifact.recalledAtoms.map((item) => item.skillCode).filter(Boolean)
      : [],
    topicCounts: summarizeFacts(facts),
    checks,
    presentCount: checks.filter((item) => item.present).length,
    totalCount: checks.length,
    missingExpectedFromExample: EXPECTED_FROM_EXAMPLE_BUT_NOT_IN_CURRENT_SOURCES.filter((term) => !text.includes(term))
  };
}

function renderMarkdown(evaluation, sourcePath) {
  const lines = [];
  lines.push("# content_generate 输入包质量审核");
  lines.push("");
  lines.push(`- 输入包：\`${sourcePath}\``);
  lines.push(`- compact 策略：\`${evaluation.compactStrategy || "(empty)"}\``);
  lines.push(`- compact facts：${evaluation.factCount}`);
  lines.push(`- compact bytes：${evaluation.byteLength}`);
  lines.push(`- anchors：${evaluation.anchorCount}`);
  lines.push(`- 检查通过：${evaluation.presentCount}/${evaluation.totalCount}`);
  lines.push("");
  lines.push("## Fact Topic 分布");
  lines.push("");
  for (const [topic, count] of Object.entries(evaluation.topicCounts)) {
    lines.push(`- ${topic}: ${count}`);
  }
  lines.push("");
  lines.push("## 关键输入检查");
  lines.push("");
  for (const item of evaluation.checks) {
    lines.push(`- ${item.present ? "[x]" : "[ ]"} ${item.label}`);
  }
  lines.push("");
  lines.push("## 召回 Skill");
  lines.push("");
  for (const code of evaluation.recalledSkillCodes) {
    lines.push(`- ${code}`);
  }
  lines.push("");
  lines.push("## 范例中存在但当前输入未显式出现的内容");
  lines.push("");
  for (const term of evaluation.missingExpectedFromExample) {
    lines.push(`- ${term}`);
  }
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  if (evaluation.presentCount === evaluation.totalCount) {
    lines.push("输入包已覆盖当前审核清单中的系统需求、模型事实和 skill 召回项。");
  } else {
    lines.push("输入包仍有缺口；后续应先在测试目录验证补充 compact MRV、skill 或 prompt 的候选方案。");
  }
  if (evaluation.missingExpectedFromExample.length) {
    lines.push("人工范例中部分内容不在当前系统需求/MRV/skill 输入中显式出现，若生成缺失这些内容，不应把它们伪造成模型解析事实。");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const inputPath = process.env.INPUT_ARTIFACT || process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: INPUT_ARTIFACT=/path/to/dry-run-content-generate-input-artifact.json node audit-content-input.mjs");
  }

  const outputDir = process.env.OUTPUT_DIR || path.dirname(path.resolve(inputPath));
  const artifact = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
  const evaluation = evaluateArtifact(artifact);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "content-input-audit.json"), JSON.stringify(evaluation, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "content-input-audit.md"), renderMarkdown(evaluation, path.resolve(inputPath)), "utf8");
  await fs.writeFile(path.join(fixtureDir, "artifacts", "latest-content-input-audit.md"), renderMarkdown(evaluation, path.resolve(inputPath)), "utf8");

  console.log(JSON.stringify({
    inputPath: path.resolve(inputPath),
    outputDir,
    presentCount: evaluation.presentCount,
    totalCount: evaluation.totalCount,
    factCount: evaluation.factCount,
    compactStrategy: evaluation.compactStrategy
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
