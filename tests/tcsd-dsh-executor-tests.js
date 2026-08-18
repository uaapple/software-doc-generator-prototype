import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TcsdDshSkillRegistry } from "../src/services/tcsd-dsh-skill-registry.js";
import { TcsdDshStageExecutor } from "../src/services/tcsd-dsh-stage-executor.js";
import { TcsdStageCatalog } from "../src/services/tcsd-stage-catalog.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = new TcsdStageCatalog({ skillsDir: path.join(repo, "skills", "hermes") });
const registry = new TcsdDshSkillRegistry({ catalog });
const snapshot = await registry.prepare();

assert.equal(snapshot.schema, "tcsd-dsh-skill-snapshot/v1");
assert.equal(snapshot.mode, "dsh");
assert.equal(snapshot.stages.length, 12);
assert.match(snapshot.runtime.bundleHash, /^[a-f0-9]{64}$/);

const executor = new TcsdDshStageExecutor({ catalog, command: "fake-dsh" });
const job = {
  jobId: "job-telemetry-boundary",
  input: {
    workspaceDir: "/worker/data/task/workspace",
    outputDir: "/worker/data/task/workspace/outputs",
    modelSlxPath: "/worker/data/task/workspace/Model.slx",
    modelMatPath: "/worker/data/task/workspace/Model.mat"
  }
};
const environment = executor.sessionEnvironment(job);
assert.equal(environment.MATLAB_MCP_AUTH_TOKEN, undefined);
assert.equal(environment.MATLAB_GATEWAY_TOKEN, undefined);
assert.equal(environment.MATLAB_GATEWAY_EVALUATE_TOKEN, undefined);
assert.equal(environment.TCSD_JOB_ID, job.jobId);
const taskPath = executor.dshTaskPath(job);
const prompt = executor.buildTaskPrompt(job, taskPath);
assert.match(prompt, /slx 文件 \/worker\/data\/task\/workspace\/Model\.slx/);
assert.match(prompt, /dsh_stage_runner\.py run --task/);
assert.match(prompt, /stage 1 至 12/);
assert.match(prompt, /\.tcsd-host 三件套/);
console.log("TCSD DSH executor provenance, prompt, and credential-boundary tests passed");
