import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const fixtureDir = path.dirname(__filename);

const DEFAULT_REFERENCE = path.join(fixtureDir, "低压能量管理软件需求范例.md");

const CHECKS = [
  {
    group: "标题框架",
    items: [
      ["一级标题：智能补电", /##\s*智能补电/],
      ["二级标题：智能补电激活判断", /###\s*智能补电激活判断/],
      ["二级标题：智能补电退出判断", /###\s*智能补电退出判断/]
    ]
  },
  {
    group: "激活判断",
    items: [
      ["VCU 唤醒", /VCU被唤醒|VCU.*唤醒/],
      ["OFF 前置场景", /ZCUL_SystemPowerMode\s*=\s*0x0|0x0:\s*OFF|OFF/],
      ["高压未连接", /高压未连接|高压.*未.*连接/],
      ["连续补电失败计数 < 3", /连续补电失败计数\s*[<＜]\s*3|失败计数\s*[<＜]\s*3/],
      ["动力电池 SOC > 10%", /BMS2_N_SOC\s*[>＞]\s*10%|动力电池.*SOC\s*[>＞]\s*10/],
      ["EBS_SOC <= 70%", /EBS_SOC\s*[≤<＜]=?\s*70%|蓄电池电量.*70%/],
      ["EBS_SOC_STATE <= 10%", /EBS_SOC_STATE\s*[≤<＜]=?\s*10%|电量精度.*10%/],
      ["KL15 断开 20 分钟", /KL15.*20分钟|20分钟.*KL15/],
      ["EBS_U_BATT < 11.8V", /EBS_U_BATT\s*[<≤]\s*11\.8V|11\.8V/],
      ["VCU_IntelligentChgSt Active", /VCU_IntelligentChgSt.*Active|智能补电状态.*Active/],
      ["VCCM_SOCWU_Ena Enabled", /VCCM_SOCWU_Ena.*Enabled|SOC唤醒使能.*Enabled/],
      ["未激活时 Inactive/Disabled", /Inactive|Disabled/],
      ["条件1失败后 ON 复位", /条件1|失败计数.*ON|OFF.*ON.*复位/],
      ["SOC 恢复 10.5% 或 ON 复位", /10\.5%|BMS2_N_SOC.*10\.5|OFF.*ON/],
      ["初始值不激活", /初始值.*不(?:得)?激活|均为0.*不(?:得)?激活|为0.*不(?:得)?激活/]
    ]
  },
  {
    group: "退出判断",
    items: [
      ["20 分钟且 EBS_SOC >= 90%", /20分钟.*EBS_SOC\s*[≥>＞]=?\s*90%|20分钟.*90%/],
      ["KL15 OFF -> ON", /KL15.*OFF.*ON|KL15.*0x0.*0x1/],
      ["BMS2_N_SOC <= 10%", /BMS2_N_SOC\s*[≤<＜]=?\s*10%|动力电池.*SOC.*10%/],
      ["激活计时 2 小时", /2小时/],
      ["需要下高压故障", /需要下高压.*故障|下高压.*故障/],
      ["DCDC 15s 未 Buck", /DCDC.*15s|15s.*DCDC|Buck/],
      ["EBS_U_BATT < 13V 持续 15s", /EBS_U_BATT\s*<\s*13V|13V.*15s|15s.*13V/],
      ["条件1退出失败次数清零并休眠", /条件1.*(?:失败次数|失败计数).*清零|(?:失败次数|失败计数).*清零.*休眠/],
      ["条件2退出保持高压连接", /条件2.*保持高压连接|保持高压连接/],
      ["条件3退出失败次数保持且 Disabled", /条件3.*(?:失败次数|失败计数).*保持|(?:失败次数|失败计数).*保持.*Disabled/],
      ["条件4按 SOC 清零或保持", /条件4.*SOC.*70%|SOC＞70%.*清零|SOC≤70%.*保持/],
      ["TimerWakeUp 请求置位", /VCU_TimerWakeUp_Req|计时唤醒请求/],
      ["允许网络/控制器休眠", /VCU_bAllwShutNet|VCU_bAllwSlep|允许网络休眠|允许控制器休眠/],
      ["条件5/6/7 失败次数 +1", /条件5.*6.*7.*(?:失败次数|失败计数)\+1|(?:失败次数|失败计数)\+1/],
      ["重新触发智能补电条件", /EBS_SOC.*70%.*EBS_U_BATT.*11\.8V|启动智能补电/],
      ["ON/激活成功/B9 重置失败次数", /B9|激活成功.*失败次数.*重置|OFF进入ON.*失败次数.*重置/]
    ]
  }
];

function normalizeText(text = "") {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function hasDryRunPlaceholder(text = "") {
  return /DRY_RUN_PLACEHOLDER/i.test(String(text || ""));
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evaluate(generated = "") {
  const placeholderDetected = hasDryRunPlaceholder(generated);
  const groups = CHECKS.map((group) => {
    const items = group.items.map(([label, pattern]) => ({
      label,
      passed: pattern.test(generated)
    }));
    return {
      group: group.group,
      passed: items.filter((item) => item.passed).length,
      total: items.length,
      items
    };
  });
  const passed = groups.reduce((sum, group) => sum + group.passed, 0);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const score = total ? passed / total : 0;
  const titleFrameworkOk = groups[0]?.passed === groups[0]?.total;
  const activationScore = groups.find((group) => group.group === "激活判断");
  const exitScore = groups.find((group) => group.group === "退出判断");
  const meetsTarget =
    !placeholderDetected &&
    titleFrameworkOk &&
    score >= 0.86 &&
    activationScore.passed / activationScore.total >= 0.86 &&
    exitScore.passed / exitScore.total >= 0.82;

  return {
    score,
    passed,
    total,
    meetsTarget,
    placeholderDetected,
    groups
  };
}

function renderMarkdownAsHtml(markdown = "") {
  const lines = normalizeText(markdown).split("\n");
  return lines.map((line) => {
    if (/^###\s+/.test(line)) return `<h3>${escapeHtml(line.replace(/^###\s+/, ""))}</h3>`;
    if (/^##\s+/.test(line)) return `<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`;
    if (/^#\s+/.test(line)) return `<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`;
    if (/^\d+\.\s+/.test(line)) return `<p class="list-line">${escapeHtml(line)}</p>`;
    if (/^-\s+/.test(line)) return `<p class="list-line">${escapeHtml(line)}</p>`;
    if (!line.trim()) return `<div class="gap"></div>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join("\n");
}

function renderReport({ generated, reference, evaluation, generatedPath, referencePath }) {
  const missing = evaluation.groups.flatMap((group) =>
    group.items.filter((item) => !item.passed).map((item) => `${group.group}：${item.label}`)
  );
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>低压能量管理软件需求生成对齐报告</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #193250; background: #f4f7fb; }
    header { padding: 28px 36px 18px; background: #fff; border-bottom: 1px solid #d9e3f0; }
    h1 { margin: 0 0 10px; font-size: 24px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
    .pill { padding: 8px 12px; border: 1px solid #c9d9eb; border-radius: 6px; background: #f8fbff; font-weight: 600; }
    main { padding: 22px 36px 36px; }
    .reason { background: #fff; border: 1px solid #d9e3f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
    .panel { background: #fff; border: 1px solid #d9e3f0; border-radius: 8px; overflow: hidden; }
    .panel h2.panel-title { margin: 0; padding: 14px 16px; font-size: 17px; border-bottom: 1px solid #d9e3f0; background: #f8fbff; }
    .content { padding: 16px 18px 24px; line-height: 1.58; font-size: 14px; }
    .content h1 { font-size: 20px; margin: 0 0 14px; }
    .content h2 { font-size: 17px; margin: 18px 0 10px; }
    .content h3 { font-size: 15px; margin: 16px 0 8px; }
    .content p { margin: 6px 0; }
    .list-line { padding-left: 10px; }
    .gap { height: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border-bottom: 1px solid #e3ebf5; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f8fbff; }
    .ok { color: #147a3d; font-weight: 700; }
    .miss { color: #b4462f; font-weight: 700; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>低压能量管理软件需求生成对齐报告</h1>
    <div>生成稿：<code>${escapeHtml(generatedPath)}</code></div>
    <div>人工范例：<code>${escapeHtml(referencePath)}</code></div>
    <div class="summary">
      <div class="pill">覆盖率：${Math.round(evaluation.score * 100)}% (${evaluation.passed}/${evaluation.total})</div>
      <div class="pill">${evaluation.meetsTarget ? "结论：基本达标" : "结论：仍需优化"}</div>
    </div>
  </header>
  <main>
    <section class="reason">
      <h2>达标判断</h2>
      <p>${evaluation.meetsTarget
        ? "生成结果已经覆盖人工标题框架，并基本覆盖智能补电激活判断、退出判断、关键阈值、状态输出、退出动作、失败计数和复位逻辑，因此可认为达到本轮目标。"
        : evaluation.placeholderDetected
          ? "生成结果仍包含 dry-run 占位符，不是真实 Hermes 生成稿，不能作为达标结果。"
        : "生成结果尚未覆盖足够的关键条件或退出后动作，仍需继续优化解析、MRV 压缩、skill 召回或生成提示。"
      }</p>
      ${missing.length ? `<p>未命中项：${escapeHtml(missing.join("；"))}</p>` : "<p>未发现关键检查项缺失。</p>"}
      <table>
        <thead><tr><th>分组</th><th>命中</th><th>详情</th></tr></thead>
        <tbody>
          ${evaluation.groups.map((group) => `<tr><td>${escapeHtml(group.group)}</td><td>${group.passed}/${group.total}</td><td>${group.items.map((item) => `<span class="${item.passed ? "ok" : "miss"}">${item.passed ? "✓" : "×"}</span> ${escapeHtml(item.label)}`).join("<br>")}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </section>
    <section class="grid">
      <article class="panel">
        <h2 class="panel-title">Hermes 生成软件需求</h2>
        <div class="content">${renderMarkdownAsHtml(generated)}</div>
      </article>
      <article class="panel">
        <h2 class="panel-title">人工软件需求范例</h2>
        <div class="content">${renderMarkdownAsHtml(reference)}</div>
      </article>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const generatedPath = process.env.GENERATED_MD || process.argv[2];
  if (!generatedPath) {
    throw new Error("Usage: GENERATED_MD=/path/to/generated.md node compare-and-report.mjs");
  }
  const referencePath = process.env.REFERENCE_MD || DEFAULT_REFERENCE;
  const outputDir = process.env.REPORT_DIR || path.dirname(path.resolve(generatedPath));

  const generated = normalizeText(await fs.readFile(path.resolve(generatedPath), "utf8"));
  const reference = normalizeText(await fs.readFile(path.resolve(referencePath), "utf8"));
  const evaluation = evaluate(generated);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "comparison-evaluation.json"), JSON.stringify(evaluation, null, 2), "utf8");

  if (evaluation.meetsTarget || process.env.FORCE_HTML_REPORT === "1") {
    const html = renderReport({
      generated,
      reference,
      evaluation,
      generatedPath: path.resolve(generatedPath),
      referencePath: path.resolve(referencePath)
    });
    await fs.writeFile(path.join(outputDir, "comparison-report.html"), html, "utf8");
  }

  console.log(JSON.stringify({
    meetsTarget: evaluation.meetsTarget,
    placeholderDetected: evaluation.placeholderDetected,
    score: evaluation.score,
    passed: evaluation.passed,
    total: evaluation.total,
    outputDir
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
