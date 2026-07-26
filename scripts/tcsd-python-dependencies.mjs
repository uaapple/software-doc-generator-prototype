import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  pythonArgs,
  resolvePythonInvocation
} from "../src/services/python-command.js";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TCSD_PYTHON_REQUIREMENTS = path.join(projectRoot, "requirements", "tcsd-runtime.txt");
export const TCSD_PYTHON_GATE = path.join(projectRoot, "scripts", "check-tcsd-python.py");
export const TCSD_HOST_VALIDATOR = path.join(
  projectRoot,
  "skills",
  "hermes",
  "tcsd-runtime",
  "scripts",
  "host_validate_tcsd_stage.py"
);

export function buildTcsdPythonDependencyCommand(mode, options = {}) {
  const invocation = resolvePythonInvocation(options);
  if (mode === "install") {
    return {
      executable: invocation.executable,
      args: pythonArgs(invocation, [
        "-m",
        "pip",
        "install",
        "--requirement",
        options.requirementsPath || TCSD_PYTHON_REQUIREMENTS
      ])
    };
  }
  if (mode === "check") {
    return {
      executable: invocation.executable,
      args: pythonArgs(invocation, [
        options.gatePath || TCSD_PYTHON_GATE,
        "--requirements",
        options.requirementsPath || TCSD_PYTHON_REQUIREMENTS,
        "--validator",
        options.validatorPath || TCSD_HOST_VALIDATOR
      ])
    };
  }
  throw new Error(`Unknown TCSD Python dependency command: ${mode}`);
}

export async function runTcsdPythonDependencyCommand(mode, options = {}) {
  const command = buildTcsdPythonDependencyCommand(mode, options);
  const commandRunner = options.commandRunner || execFileAsync;
  return commandRunner(command.executable, command.args, {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
}

async function main() {
  const mode = process.argv[2] || "";
  if (!["install", "check"].includes(mode)) {
    throw new Error("Usage: node scripts/tcsd-python-dependencies.mjs <install|check>");
  }
  const { stdout = "", stderr = "" } = await runTcsdPythonDependencyCommand(mode);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
