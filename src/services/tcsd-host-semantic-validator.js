import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolvePythonInvocation, runPythonCommand } from "./python-command.js";
import { TCSD_ERROR_CODES } from "./tcsd-pipeline-contract.js";
import { writeJson } from "./storage.js";

const execFileAsync = promisify(execFile);
const SEMANTIC_STAGES = new Set([2, 6, 7, 8, 9, 10, 11]);

function withinWorkspace(workspaceDir, candidate) {
  const root = path.resolve(workspaceDir);
  const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error("TCSD semantic evidence escaped the task workspace."), {
      code: TCSD_ERROR_CODES.validation
    });
  }
  return absolute;
}

async function findPriorJsonArtifact(job, schema) {
  const workspaceDir = job.input.workspaceDir;
  for (const stage of Array.isArray(job.stages) ? job.stages : []) {
    const artifacts = stage.checkpoint?.artifacts;
    for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
      if (artifact.kind !== "json" || !artifact.path) continue;
      const absolute = withinWorkspace(workspaceDir, artifact.path);
      try {
        const value = JSON.parse(await fs.readFile(absolute, "utf8"));
        if (value?.schema === schema) return artifact.path;
      } catch {
        // Invalid prior evidence is rejected by checkpoint validation; continue to
        // produce a deterministic "missing schema" error here.
      }
    }
  }
  return "";
}

function publicSemanticError(stageIndex, cause) {
  let message = "host semantic validator failed";
  const output = String(cause?.stderr || "").trim();
  if (output) {
    try {
      const parsed = JSON.parse(output.split(/\r?\n/).at(-1));
      message = String(parsed.message || message);
    } catch {
      message = "host semantic validator returned an unreadable failure";
    }
  }
  return Object.assign(new Error(`TCSD stage ${stageIndex} semantic validation failed: ${message}`), {
    code: TCSD_ERROR_CODES.validation,
    details: { stageIndex }
  });
}

export class TcsdHostSemanticValidator {
  constructor(options = {}) {
    this.pythonInvocation = resolvePythonInvocation(options);
    this.commandRunner = options.commandRunner || execFileAsync;
  }

  async validate({ raw, job, runtime, requestPath }) {
    const stageIndex = Number(raw?.stageIndex || 0);
    if (!SEMANTIC_STAGES.has(stageIndex) || ([10, 11].includes(stageIndex) && raw?.status === "skipped")) {
      return {
        schema: "tcsd-host-semantic-validation/v1",
        stageIndex,
        passed: true,
        details: {}
      };
    }
    const runtimeDirectory = path.resolve(runtime?.installedPath || runtime?.directory || "");
    if (!runtimeDirectory) {
      throw Object.assign(new Error("TCSD semantic validator has no immutable runtime directory."), {
        code: TCSD_ERROR_CODES.validation,
        details: { stageIndex }
      });
    }
    const interfacePath = stageIndex >= 7
      ? await findPriorJsonArtifact(job, "tcsd-model-interface/v1")
      : "";
    const request = {
      schema: "tcsd-host-semantic-validation-request/v1",
      jobId: job.jobId,
      stageIndex,
      workspaceDir: job.input.workspaceDir,
      artifacts: Array.isArray(raw.artifacts) ? raw.artifacts : [],
      evidence: raw.evidence || {},
      repair: raw.repair || null,
      coverageThreshold: Number(job.input.coverageThreshold || 80),
      interfacePath,
      templatePath: path.join(runtimeDirectory, "assets", "templates", "tcsd_template.xlsx")
    };
    await writeJson(requestPath, request);
    const script = path.join(runtimeDirectory, "scripts", "host_validate_tcsd_stage.py");
    try {
      const { stdout = "" } = await runPythonCommand(
        this.commandRunner,
        this.pythonInvocation,
        [script, "--request", requestPath],
        {
          cwd: job.input.workspaceDir,
          env: { ...process.env, NO_COLOR: "1" },
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true
        }
      );
      const report = JSON.parse(String(stdout || "").trim());
      if (
        report.schema !== "tcsd-host-semantic-validation/v1" ||
        report.stageIndex !== stageIndex ||
        report.passed !== true
      ) {
        throw new Error("semantic validator returned an invalid report");
      }
      return report;
    } catch (cause) {
      throw publicSemanticError(stageIndex, cause);
    }
  }
}
