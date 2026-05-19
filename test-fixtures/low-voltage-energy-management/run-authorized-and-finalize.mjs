import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const fixtureDir = path.dirname(__filename);
const rootDir = path.resolve(fixtureDir, "../..");
const execFileAsync = promisify(execFile);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function parseRunDir(stdout = "") {
  const match = String(stdout || "").match(/\[fixture-run\]\s+runDir=(.+)/);
  return match?.[1]?.trim() || "";
}

async function runNode(scriptPath, args = [], options = {}) {
  return execFileAsync(process.execPath, [...args, scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    timeout: options.timeout || 900000,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024
  });
}

async function main() {
  const parsedMrvPath =
    process.env.PARSED_MRV_PATH ||
    "test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json";
  const optimizationMode = process.env.RUN_OPTIMIZATION || "compact-v3";

  const preflightScript = path.join(fixtureDir, "preflight.mjs");
  await runNode(preflightScript);
  const preflight = await readJson(path.join(fixtureDir, "preflight-summary.json"));
  if (!preflight.readyForAuthorizedHermesRun) {
    throw new Error("Preflight failed; inspect preflight-summary.json before running real Hermes generation");
  }
  if (preflight.blockedOnUserHermesAuthorization) {
    throw new Error(
      "Hermes provider gate is still blocked. Set ALLOW_EXTERNAL_HERMES=1 only after explicit user authorization, or switch Hermes to a verified local-only provider."
    );
  }

  const generationScript = path.join(fixtureDir, "run-real-chain.mjs");
  const generation = await runNode(generationScript, ["--disable-warning=ExperimentalWarning"], {
    env: {
      RUN_STAGE: "generate",
      RUN_OPTIMIZATION: optimizationMode,
      PARSED_MRV_PATH: parsedMrvPath
    },
    timeout: 1200000,
    maxBuffer: 32 * 1024 * 1024
  });
  const runDir = parseRunDir(generation.stdout);
  if (!runDir) {
    throw new Error("Could not parse runDir from run-real-chain.mjs output");
  }

  const finalizeScript = path.join(fixtureDir, "finalize-real-run.mjs");
  const finalize = await runNode(finalizeScript, [], {
    env: { RUN_DIR: runDir },
    maxBuffer: 8 * 1024 * 1024
  });
  const finalizeSummaryPath = path.join(runDir, "finalize-summary.json");
  const finalizeSummary = await readJson(finalizeSummaryPath);

  const summary = {
    runDir,
    parsedMrvPath,
    optimizationMode,
    generationStdout: generation.stdout.trim(),
    generationStderr: generation.stderr.trim(),
    finalizeStdout: finalize.stdout.trim(),
    finalizeStderr: finalize.stderr.trim(),
    finalizeSummaryPath,
    meetsTarget: Boolean(finalizeSummary.meetsTarget),
    placeholderDetected: Boolean(finalizeSummary.placeholderDetected),
    reportPath: finalizeSummary.reportPath || ""
  };
  await fs.writeFile(path.join(runDir, "authorized-run-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
