import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "tcsd-stage02-canary-"));
const outputDir = path.join(root, "outputs");
await fs.mkdir(outputDir, { recursive: true });
const modelSlxPath = path.join(root, "GenericEnvironmentCanary.slx");
const modelMatPath = path.join(root, "GenericEnvironmentCanary.mat");
await fs.writeFile(modelSlxPath, "canary");
await fs.writeFile(modelMatPath, "canary");
const jobId = `stage02-canary-${Date.now()}`;
const resultPath = path.join(outputDir, "stage-02-result.json");
const manifestPath = path.join(root, "stage-02-input.json");
await fs.writeFile(manifestPath, JSON.stringify({
  schema: "tcsd-agent-stage-input/v1",
  jobId,
  stageIndex: 2,
  attempt: 1,
  job: {
    jobId,
    events: [],
    resources: { ownerJobId: jobId },
    input: {
      workspaceDir: root,
      outputDir,
      modelSlxPath,
      modelMatPath
    }
  }
}, null, 2));
const runner = path.join(
  repo,
  "skills",
  "hermes",
  "tcsd-runtime",
  "scripts",
  "run_tcsd_pipeline_stage.py"
);
await execFileAsync(process.env.TCSD_PIPELINE_PYTHON || "python3", [
  runner,
  "--manifest",
  manifestPath,
  "--result",
  resultPath
], {
  cwd: root,
  env: {
    ...process.env,
    MATLAB_ROOT: process.env.MATLAB_ROOT || "/Applications/MATLAB_R2026a.app",
    SATK_MATLAB_ROOT: process.env.SATK_MATLAB_ROOT || "/Applications/MATLAB_R2026a.app"
  },
  timeout: 10 * 60 * 1000,
  maxBuffer: 8 * 1024 * 1024
});
const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
if (result.status !== "completed") throw new Error(`Stage 2 failed: ${JSON.stringify(result.error)}`);
const environmentPath = path.resolve(root, result.artifacts[0].path);
const environment = JSON.parse(await fs.readFile(environmentPath, "utf8"));
if (
  environment.schema !== "tcsd-environment-gate/v2" ||
  environment.passed !== true ||
  environment.matlab?.nonce !== environment.nonce ||
  environment.satkMcp?.sentinelWritten !== true
) throw new Error("Stage 2 environment evidence is incomplete");
console.log(JSON.stringify({
  ok: true,
  schema: environment.schema,
  pythonModules: Object.keys(environment.pythonDependencies.modules).sort(),
  matlabVersion: environment.matlab.version,
  simulinkVersion: environment.simulink.version,
  satkSentinelWritten: environment.satkMcp.sentinelWritten,
  workspaceIo: environment.workspaceIo
}));
