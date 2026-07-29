import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  hashTcsdBundle,
  TcsdStageCatalog
} from "../../src/services/tcsd-stage-catalog.js";

const execFileAsync = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) continue;
    result[key.slice(2)] = values[index + 1] || "";
    index += 1;
  }
  return result;
}

async function requireFile(value, extension, label) {
  const resolved = path.resolve(String(value || ""));
  if (path.extname(resolved).toLowerCase() !== extension || !(await fs.stat(resolved).catch(() => null))?.isFile()) {
    throw new Error(`${label} must be an existing ${extension} file`);
  }
  return resolved;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Hermes sidecar exited early: ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The real sidecar is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Hermes sidecar health endpoint did not become ready");
}

async function listRelativeFiles(root, current = root) {
  const files = [];
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listRelativeFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
  }
  return files.sort();
}

const args = parseArgs(process.argv.slice(2));
const hermesCommand = args.hermes || process.env.HERMES_COMMAND || "hermes";
const slx = await requireFile(args.slx, ".slx", "--slx");
const mat = await requireFile(args.mat, ".mat", "--mat");
const addon = path.resolve(String(args.addon || ""));
if (!(await fs.stat(addon).catch(() => null))?.isDirectory()) throw new Error("--addon must be an existing directory");
await execFileAsync(hermesCommand, ["--version"], { timeout: 30000 });

const root = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-real-black-box-"));
const workspace = path.join(root, "workspace");
const outputDir = path.join(workspace, "outputs");
const dataDir = path.join(root, "data");
const addonRoot = path.join(root, "project-addons");
const projectAddon = path.join(addonRoot, "01");
console.log(`TCSD_REAL_EVIDENCE_ROOT=${root}`);
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(addonRoot, { recursive: true });
await fs.cp(addon, projectAddon, { recursive: true });
const modelSlxPath = path.join(workspace, path.basename(slx));
const modelMatPath = path.join(workspace, path.basename(mat));
await fs.copyFile(slx, modelSlxPath);
await fs.copyFile(mat, modelMatPath);

const port = Number(args.port || 43101);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(repo, "src", "hermes-server.js")], {
  cwd: repo,
  stdio: "inherit",
  env: {
    ...process.env,
    APP_RUNTIME_ROLE: "hermes-agent",
    APP_DATA_DIR: dataDir,
    UNIT_TEST_CASE_PROJECT_ADDON_ROOT: addonRoot,
    HERMES_COMMAND: hermesCommand,
    HERMES_PORT: String(port),
    HERMES_BASE_URL: baseUrl
  }
});

try {
  await waitForHealth(baseUrl, child);
  const taskId = `real-black-box-${Date.now()}`;
  const start = await fetch(`${baseUrl}/internal/tcsd-pipeline/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId,
      idempotencyKey: taskId,
      request: args.request || "请按十二阶段技能组合生成并验证 TCSD 测试用例。",
      allowedPaths: [workspace],
      inputArtifact: {
        workspaceDir: workspace,
        outputDir,
        modelSlxPath,
        modelMatPath,
        coverageThreshold: 80,
        unitTestProject: { id: "01", name: "black-box", label: "01_black-box" }
      }
    })
  });
  if (!start.ok) throw new Error(`Job start failed: ${start.status} ${await start.text()}`);
  const started = await start.json();
  let job;
  for (let attempt = 0; attempt < 1440; attempt += 1) {
    const response = await fetch(`${baseUrl}/internal/tcsd-pipeline/jobs/${started.jobId}`);
    if (!response.ok) throw new Error(`Job poll failed: ${response.status} ${await response.text()}`);
    job = await response.json();
    if (["已完成", "部分完成", "失败"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!job || !["已完成", "部分完成"].includes(job.status)) {
    throw new Error(`Real TCSD black-box job did not complete: ${JSON.stringify(job?.error || job?.status)}`);
  }
  if (job.skillSnapshot?.discovery?.allDiscovered !== true || job.skillSnapshot?.stages?.length !== 12) {
    throw new Error("Real job lacks the twelve-skill discovery snapshot");
  }
  const sourceRuntime = await new TcsdStageCatalog().runtime();
  const installedRuntime = await hashTcsdBundle(job.skillSnapshot.runtime.installedPath);
  if (
    job.skillSnapshot.runtime.bundleHash !== sourceRuntime.bundleHash ||
    installedRuntime.sha256 !== sourceRuntime.bundleHash
  ) {
    throw new Error("Real job source/installed runtime hashes do not match");
  }
  const installedRuntimeFiles = await listRelativeFiles(job.skillSnapshot.runtime.installedPath);
  if (installedRuntimeFiles.some((file) => (
    file.startsWith("tests/") ||
    /(^|\/)test_[^/]+\.(py|m|js|mjs)$/i.test(file)
  ))) {
    throw new Error("Installed production runtime contains dev-only test fixtures");
  }
  const checkpoints = job.stages.map((stage) => stage.checkpoint);
  const sessions = checkpoints.map((checkpoint) => checkpoint?.agent?.sessionId);
  if (sessions.some((session) => !session) || new Set(sessions).size !== 12) {
    throw new Error("Real job did not use twelve distinct Hermes sessions");
  }
  for (const checkpoint of checkpoints) {
    if (
      checkpoint.agent.skillLoad?.source !== "hermes-state-db+skill-usage" ||
      checkpoint.agent.skillLoad?.loaded !== true ||
      /fake/i.test(checkpoint.agent.model || "")
    ) {
      throw new Error("Real job lacks non-self-reported skill load/model evidence");
    }
  }
  const executionManifest = checkpoints[11]?.executionManifest;
  const planningMapping = executionManifest?.evidence?.planningMappingAssessment;
  const oracle = executionManifest?.oracle;
  const caseOutputCounts = oracle?.caseOutputCounts && typeof oracle.caseOutputCounts === "object"
    ? Object.values(oracle.caseOutputCounts)
    : [];
  const oracleValueCount = caseOutputCounts.reduce((total, counts) => (
    total + Object.values(counts || {}).reduce((subtotal, count) => subtotal + Number(count || 0), 0)
  ), 0);
  const finalWorkbook = path.resolve(workspace, String(executionManifest?.workbook || ""));
  if (
    executionManifest?.authority !== "host" ||
    executionManifest?.evidence?.checkpointCount !== 12 ||
    planningMapping?.authority !== "planning" ||
    planningMapping?.blocking !== false ||
    planningMapping?.supersededBy?.stageIndex !== 9 ||
    planningMapping?.supersededBy?.authority !== "measured-simulink-coverage" ||
    oracle?.authority !== "host" ||
    oracle?.status !== "complete" ||
    ![8, 11].includes(Number(oracle?.sourceStageIndex)) ||
    !Number.isInteger(Number(oracle?.testCaseCount)) ||
    Number(oracle.testCaseCount) < 1 ||
    !Number.isInteger(Number(oracle?.expValueCount)) ||
    Number(oracle.expValueCount) < Number(oracle.testCaseCount) ||
    !Array.isArray(oracle?.testsWithoutExpectedValues) ||
    oracle.testsWithoutExpectedValues.length !== 0 ||
    caseOutputCounts.length !== Number(oracle.testCaseCount) ||
    oracleValueCount !== Number(oracle.expValueCount) ||
    oracle?.simulationResult !== executionManifest?.simulation?.result ||
    oracle?.workbookSha256 !== sha256(await fs.readFile(finalWorkbook))
  ) {
    throw new Error("Host execution manifest lacks twelve-checkpoint/planning/oracle completeness evidence");
  }
  const planningAssessmentPath = path.resolve(workspace, planningMapping.path);
  const planningAssessment = JSON.parse(await fs.readFile(planningAssessmentPath, "utf8"));
  if (
    planningAssessment.schema !== "tcsd-planning-mapping-assessment/v1" ||
    !["satisfied", "advisory"].includes(planningAssessment.status) ||
    planningAssessment.blocking !== false
  ) {
    throw new Error("Planning mapping assessment is invalid or still blocking");
  }
  const outputFiles = await fs.readdir(outputDir);
  if (outputFiles.some((file) => file.endsWith("_mcdc_validation_report.json"))) {
    throw new Error("Legacy unexplained failed MC/DC mapping report remains in real outputs");
  }
  const stage7ExpValues = Number(checkpoints[6]?.validation?.semantic
    ? JSON.parse(await fs.readFile(path.resolve(workspace, checkpoints[6].validation.semantic.path), "utf8")).details?.expValueCount
    : -1);
  const stage8ExpValues = Number(checkpoints[7]?.validation?.semantic
    ? JSON.parse(await fs.readFile(path.resolve(workspace, checkpoints[7].validation.semantic.path), "utf8")).details?.expValueCount
    : -1);
  if (stage7ExpValues !== 0 || stage8ExpValues < 1) {
    throw new Error("Stage 7/8 workbook separation evidence is invalid");
  }
  console.log(JSON.stringify({
    ok: true,
    jobId: job.jobId,
    status: job.status,
    completion: job.completion,
    sessionCount: new Set(sessions).size,
    models: [...new Set(checkpoints.map((checkpoint) => checkpoint.agent.model))],
    runtimeBundleHash: sourceRuntime.bundleHash,
    runtimeFileCount: installedRuntime.fileCount,
    checkpointCount: executionManifest.evidence.checkpointCount,
    oracle: {
      sourceStageIndex: oracle.sourceStageIndex,
      testCaseCount: oracle.testCaseCount,
      expValueCount: oracle.expValueCount,
      testsWithoutExpectedValues: oracle.testsWithoutExpectedValues,
      workbookSha256: oracle.workbookSha256
    },
    stage7ExpValues,
    stage8ExpValues,
    planningMappingStatus: planningAssessment.status,
    planningMappingSupersededBy: planningMapping.supersededBy,
    coverage: executionManifest.coverage
  }, null, 2));
} finally {
  child.kill("SIGTERM");
}
