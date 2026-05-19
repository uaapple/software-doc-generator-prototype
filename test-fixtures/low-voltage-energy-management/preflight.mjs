import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const fixtureDir = path.dirname(__filename);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
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

async function scanFixtureProfileRedaction(rootDir) {
  const result = { files: 0, unredacted: 0 };

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(filePath);
      } else if (entry.isFile() && entry.name === "llm-profiles.json" && filePath.includes(`${path.sep}data${path.sep}`)) {
        result.files += 1;
        const data = await readJson(filePath);
        for (const profile of data.profiles || []) {
          if (profile.apiKey && profile.apiKey !== "[REDACTED_IN_FIXTURE]") {
            result.unredacted += 1;
          }
        }
      }
    }
  }

  await walk(rootDir);
  return result;
}

function pass(label, evidence = "") {
  return { label, status: "pass", evidence };
}

function fail(label, evidence = "") {
  return { label, status: "fail", evidence };
}

async function main() {
  const parsedMrvPath = path.join(fixtureDir, "artifacts/run-20260513-171544/parsed-model-requirement-view.json");
  const dryRunDir = path.join(fixtureDir, "artifacts/run-20260514-115430");
  const auditPath = path.join(dryRunDir, "content-input-audit.json");
  const dryRunFinalizePath = path.join(dryRunDir, "finalize-summary.json");
  const selftestEvalPath = path.join(fixtureDir, "artifacts/report-script-selftest/manual-outline-pass/comparison-evaluation.json");
  const selftestReportPath = path.join(fixtureDir, "artifacts/report-script-selftest/manual-outline-pass/comparison-report.html");
  const selftestFinalizePath = path.join(fixtureDir, "artifacts/report-script-selftest/manual-outline-pass/finalize-summary.json");
  const artifactsDir = path.join(fixtureDir, "artifacts");
  const hermesHome = path.join(process.env.HOME || "/Users/guanzhengyang", ".hermes");
  const hermesConfigPath = path.join(hermesHome, "config.yaml");
  const hermesAuthPath = path.join(hermesHome, "auth.json");
  const checks = [];
  let hermesProviderGate = {
    provider: "",
    activeProvider: "",
    baseURL: "",
    authMode: "",
    isExternalProvider: true,
    allowExternalHermes: process.env.ALLOW_EXTERNAL_HERMES === "1"
  };

  for (const [label, fileName] of [
    ["系统需求文件", "低压能量管理-系统需求.md"],
    ["软件需求范例", "低压能量管理软件需求范例.md"],
    ["人工标题框架", "人工标题框架.md"],
    ["模型文件", "HvCoorn.slx"],
    ["真实链路 runner", "run-real-chain.mjs"],
    ["授权后一键 runner", "run-authorized-and-finalize.mjs"],
    ["对比报告脚本", "compare-and-report.mjs"],
    ["真实 run 收尾脚本", "finalize-real-run.mjs"],
    ["授权前导出摘要", "hermes-export-summary.md"],
    ["完成审计", "completion-audit.md"]
  ]) {
    const filePath = path.join(fixtureDir, fileName);
    checks.push((await exists(filePath)) ? pass(label, filePath) : fail(label, filePath));
  }

  if (await exists(parsedMrvPath)) {
    const mrv = await readJson(parsedMrvPath);
    const count = Array.isArray(mrv.facts) ? mrv.facts.length : 0;
    checks.push(count >= 300 ? pass("SLX 解析产物", `${count} facts`) : fail("SLX 解析产物", `${count} facts`));
  } else {
    checks.push(fail("SLX 解析产物", parsedMrvPath));
  }

  if (await exists(auditPath)) {
    const audit = await readJson(auditPath);
    checks.push(
      audit.presentCount === audit.totalCount && audit.totalCount >= 23
        ? pass("compact-v3 输入审核", `${audit.presentCount}/${audit.totalCount}`)
        : fail("compact-v3 输入审核", `${audit.presentCount}/${audit.totalCount}`)
    );
  } else {
    checks.push(fail("compact-v3 输入审核", auditPath));
  }

  if (await exists(selftestEvalPath)) {
    const evaluation = await readJson(selftestEvalPath);
    checks.push(
      evaluation.meetsTarget && evaluation.passed === evaluation.total
        ? pass("对比脚本自测", `${evaluation.passed}/${evaluation.total}`)
        : fail("对比脚本自测", `${evaluation.passed}/${evaluation.total}`)
    );
  } else {
    checks.push(fail("对比脚本自测", selftestEvalPath));
  }

  checks.push((await exists(selftestReportPath)) ? pass("HTML 报告自测产物", selftestReportPath) : fail("HTML 报告自测产物", selftestReportPath));
  checks.push((await exists(selftestFinalizePath)) ? pass("收尾脚本自测产物", selftestFinalizePath) : fail("收尾脚本自测产物", selftestFinalizePath));

  if (await exists(dryRunFinalizePath)) {
    const dryRunFinalize = await readJson(dryRunFinalizePath);
    checks.push(
      dryRunFinalize.placeholderDetected === true && dryRunFinalize.meetsTarget === false
        ? pass("dry-run 占位稿拒绝核对", "placeholderDetected=true, meetsTarget=false")
        : fail(
            "dry-run 占位稿拒绝核对",
            `placeholderDetected=${dryRunFinalize.placeholderDetected}, meetsTarget=${dryRunFinalize.meetsTarget}`
          )
    );
  } else {
    checks.push(fail("dry-run 占位稿拒绝核对", dryRunFinalizePath));
  }

  const profileRedaction = await scanFixtureProfileRedaction(artifactsDir);
  checks.push(
    profileRedaction.unredacted === 0
      ? pass("fixture profile 脱敏核对", `${profileRedaction.files} files, ${profileRedaction.unredacted} unredacted keys`)
      : fail("fixture profile 脱敏核对", `${profileRedaction.files} files, ${profileRedaction.unredacted} unredacted keys`)
  );

  if (await exists(hermesConfigPath)) {
    const configText = await fs.readFile(hermesConfigPath, "utf8");
    const provider = parseYamlScalar(configText, "provider");
    const baseURL = parseYamlScalar(configText, "base_url");
    let activeProvider = "";
    let authMode = "";
    const authText = await readTextIfExists(hermesAuthPath);
    if (authText) {
      try {
        const auth = JSON.parse(authText);
        activeProvider = String(auth.active_provider || "").trim();
        authMode = String(auth.providers?.[activeProvider || provider]?.auth_mode || "").trim();
      } catch (_error) {
        authMode = "(auth json parse failed)";
      }
    }
    hermesProviderGate = {
      provider,
      activeProvider,
      baseURL,
      authMode,
      isExternalProvider: isExternalHermesProvider({ provider: activeProvider || provider, baseURL }),
      allowExternalHermes: process.env.ALLOW_EXTERNAL_HERMES === "1"
    };
    checks.push(
      pass(
        "Hermes 配置风险核对",
        `provider=${activeProvider || provider || "(unknown)"}, base_url=${baseURL || "(unknown)"}, auth_mode=${authMode || "(unknown)"}, external=${hermesProviderGate.isExternalProvider}`
      )
    );
  } else {
    checks.push(fail("Hermes 配置风险核对", hermesConfigPath));
  }

  const failed = checks.filter((item) => item.status !== "pass");
  const blockedOnHermesProviderAuthorization = hermesProviderGate.isExternalProvider && !hermesProviderGate.allowExternalHermes;
  const generateCommand =
    "env ALLOW_EXTERNAL_HERMES=1 RUN_STAGE=generate RUN_OPTIMIZATION=compact-v3 PARSED_MRV_PATH=test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json node --disable-warning=ExperimentalWarning test-fixtures/low-voltage-energy-management/run-real-chain.mjs";
  const authorizedRunnerCommand =
    "env ALLOW_EXTERNAL_HERMES=1 RUN_OPTIMIZATION=compact-v3 PARSED_MRV_PATH=test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json node test-fixtures/low-voltage-energy-management/run-authorized-and-finalize.mjs";
  const result = {
    readyForAuthorizedHermesRun: failed.length === 0,
    blockedOnUserHermesAuthorization: blockedOnHermesProviderAuthorization,
    hermesProviderGate,
    checks,
    nextCommand: authorizedRunnerCommand,
    generateCommand,
    authorizedRunnerCommand
  };

  await fs.writeFile(path.join(fixtureDir, "preflight-summary.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
