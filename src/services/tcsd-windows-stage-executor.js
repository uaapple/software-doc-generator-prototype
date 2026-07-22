import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { TCSD_ERROR_CODES } from "./tcsd-pipeline-contract.js";

const execFileAsync = promisify(execFile);

export class TcsdWindowsStageExecutor {
  constructor(options = {}) {
    this.python = options.python || process.env.TCSD_PIPELINE_PYTHON || (process.platform === "win32" ? "python" : "python3");
    this.runner = options.runner || path.join(config.rootDir, "skills", "hermes", "simulink-ut-tcsd-generator", "scripts", "run_tcsd_pipeline_stage.py");
    this.commandRunner = options.commandRunner || execFileAsync;
  }

  async execute(stageIndex, _input, job) {
    const runtimeDir = path.join(job.input.outputDir, ".tcsd-runtime");
    await fs.mkdir(runtimeDir, { recursive: true });
    const snapshotPath = path.join(runtimeDir, "job.json");
    await fs.writeFile(snapshotPath, JSON.stringify(job, null, 2), "utf8");
    try {
      await this.commandRunner(this.python, [this.runner, "--job", snapshotPath, "--stage", String(stageIndex)], {
        cwd: job.input.workspaceDir,
        env: { ...process.env, SATK_MATLAB_ROOT: process.env.SATK_MATLAB_ROOT || process.env.MATLAB_ROOT || "", TCSD_JOB_ID: job.jobId, TCSD_RESOURCE_OWNER_JOB_ID: job.jobId },
        timeout: Number(process.env.TCSD_PIPELINE_STAGE_TIMEOUT_MS || 60 * 60 * 1000),
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
      });
    } catch (cause) {
      const error = new Error(String(cause.stderr || cause.stdout || cause.message || `第 ${stageIndex} 阶段 runner 失败。`).trim());
      error.code = stageIndex === 1 ? TCSD_ERROR_CODES.input : stageIndex === 2 ? TCSD_ERROR_CODES.environment : TCSD_ERROR_CODES.stage;
      error.details = { stageIndex, exitCode: cause.code ?? null };
      throw error;
    }
  }
}
