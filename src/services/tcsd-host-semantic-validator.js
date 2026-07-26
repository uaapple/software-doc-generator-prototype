import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolvePythonInvocation, runPythonCommand } from "./python-command.js";
import { TCSD_ERROR_CODES } from "./tcsd-pipeline-contract.js";
import { writeJson } from "./storage.js";

const execFileAsync = promisify(execFile);
const SEMANTIC_STAGES = new Set([2, 6, 7, 8, 9, 10, 11]);
const PUBLIC_SEMANTIC_MESSAGE_LIMIT = 240;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|authorization|bearer|password|secret|token)\b(\s*[:=]\s*|\s+)([^\s,;]+)/giu;
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/giu;
const UNC_PATH_PATTERN = /\\\\[^\\\r\n]+\\[^\r\n,;]*/gu;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:[\\/][^\r\n,;]*/gu;
const POSIX_PATH_PATTERN = /(^|[\s"'(])\/[^\r\n,;]*/gu;

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

function parseJsonObject(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function publicMessage(value) {
  let message = String(value || "")
    .replaceAll("\0", "")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, name, separator) => `${name}${separator}[REDACTED]`)
    .replace(URL_PATTERN, "[url]")
    .replace(UNC_PATH_PATTERN, "[path]")
    .replace(WINDOWS_PATH_PATTERN, "[path]")
    .replace(POSIX_PATH_PATTERN, (_match, prefix) => `${prefix}[path]`);
  message = message.replace(/\s+/gu, " ").trim();
  return message.slice(0, PUBLIC_SEMANTIC_MESSAGE_LIMIT);
}

function processFailureCategory(cause) {
  if (cause?.signal) return "process_signal";
  if (Number.isInteger(cause?.code) || Number.isInteger(cause?.exitCode)) return "process_exit";
  if (typeof cause?.code === "string" && cause.code) return "process_spawn";
  return "invalid_validator_output";
}

export function publicSemanticError(stageIndex, cause) {
  const output = String(cause?.stderr || "");
  const lines = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const parsedLines = lines.map(parseJsonObject);
  const structured = parsedLines.findLast((parsed) =>
    parsed && typeof parsed.message === "string" && parsed.message.trim()
  );
  let message = "host semantic validator returned an unreadable failure";
  if (structured) {
    const extracted = publicMessage(structured.message);
    if (extracted) {
      message = extracted;
    }
  } else if (!output.trim()) {
    message = "host semantic validator failed";
  }
  const numericExitCode = Number.isInteger(cause?.exitCode)
    ? cause.exitCode
    : (Number.isInteger(cause?.code) ? cause.code : null);
  const signal = /^SIG[A-Z0-9]+$/u.test(String(cause?.signal || ""))
    ? String(cause.signal)
    : null;
  const diagnostics = {
    category: processFailureCategory(cause),
    exitCode: numericExitCode,
    signal,
    stderrLineCount: lines.length,
    stderrHasJsonLine: parsedLines.some(Boolean),
    stderrTailIsJson: Boolean(parsedLines.at(-1)),
    structuredErrorFound: Boolean(structured)
  };
  return Object.assign(new Error(`TCSD stage ${stageIndex} semantic validation failed: ${message}`), {
    code: TCSD_ERROR_CODES.validation,
    details: { stageIndex, diagnostics }
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
