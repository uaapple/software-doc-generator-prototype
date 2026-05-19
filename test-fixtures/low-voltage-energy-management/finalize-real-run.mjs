import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const fixtureDir = path.dirname(__filename);
const execFileAsync = promisify(execFile);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const runDir = path.resolve(process.env.RUN_DIR || process.argv[2] || "");
  if (!runDir || runDir === path.resolve(".")) {
    throw new Error("Usage: RUN_DIR=/path/to/real-run node finalize-real-run.mjs");
  }

  const generatedPath = process.env.GENERATED_MD
    ? path.resolve(process.env.GENERATED_MD)
    : path.join(runDir, "hermes-generated-software-requirements.md");
  if (!(await exists(generatedPath))) {
    throw new Error(`Generated markdown not found: ${generatedPath}`);
  }

  const compareScript = path.join(fixtureDir, "compare-and-report.mjs");
  const env = {
    ...process.env,
    GENERATED_MD: generatedPath,
    REPORT_DIR: runDir
  };
  const { stdout = "", stderr = "" } = await execFileAsync(process.execPath, [compareScript], {
    cwd: path.resolve(fixtureDir, "../.."),
    env,
    maxBuffer: 4 * 1024 * 1024
  });

  const evaluationPath = path.join(runDir, "comparison-evaluation.json");
  const reportPath = path.join(runDir, "comparison-report.html");
  const evaluation = JSON.parse(await fs.readFile(evaluationPath, "utf8"));
  const reportExists = await exists(reportPath);

  const result = {
    runDir,
    generatedPath,
    evaluationPath,
    reportPath: reportExists ? reportPath : "",
    meetsTarget: Boolean(evaluation.meetsTarget),
    placeholderDetected: Boolean(evaluation.placeholderDetected),
    score: evaluation.score,
    passed: evaluation.passed,
    total: evaluation.total,
    missing: evaluation.groups.flatMap((group) =>
      group.items.filter((item) => !item.passed).map((item) => `${group.group}: ${item.label}`)
    ),
    compareStdout: stdout.trim(),
    compareStderr: stderr.trim()
  };

  await fs.writeFile(path.join(runDir, "finalize-summary.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));

  if (evaluation.placeholderDetected) {
    throw new Error("Generated markdown still contains DRY_RUN_PLACEHOLDER; real Hermes output is required");
  }

  if (evaluation.meetsTarget && !reportExists) {
    throw new Error("Evaluation meets target but comparison-report.html was not generated");
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
