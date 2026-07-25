import fs from "node:fs";
import path from "node:path";

function quoteWindowsCmdArg(value = "") {
  const text = String(value);
  if (!text) return '""';
  const escaped = text
    .replace(/%/g, "%%")
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, "$1$1");
  return /[\s"&|<>^()%!]/.test(text) ? `"${escaped}"` : escaped;
}

export function resolveHermesCommand(command, args = [], options = {}) {
  const executable = String(command || "").trim();
  const commandArgs = Array.isArray(args) ? args : [];
  const platform = options.platform || process.platform;
  const pathApi = platform === "win32" ? path.win32 : path;
  const extension = pathApi.extname(executable).toLowerCase();
  if (extension === ".js") {
    return {
      command: process.execPath,
      args: [executable, ...commandArgs]
    };
  }
  if (platform === "win32" && extension === ".cmd") {
    const commandDir = pathApi.dirname(executable);
    const pathExists = options.pathExists || fs.existsSync;
    const pythonCandidates = [
      pathApi.join(commandDir, "venv", "Scripts", "python.exe"),
      pathApi.join(commandDir, "python", "python.exe")
    ];
    const hermesPython = pythonCandidates.find((candidate) => pathExists(candidate));
    if (pathApi.basename(executable).toLowerCase() === "hermes.cmd" && hermesPython) {
      const hermesHome = pathApi.resolve(commandDir, "..", "hermes-home");
      return {
        command: hermesPython,
        args: ["-m", "hermes_cli.main", ...commandArgs],
        env: pathExists(hermesHome) ? { HERMES_HOME: hermesHome } : {}
      };
    }
  }
  if (platform === "win32" && [".cmd", ".bat"].includes(extension)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", [quoteWindowsCmdArg(executable), ...commandArgs.map(quoteWindowsCmdArg)].join(" ")]
    };
  }
  return {
    command: executable,
    args: commandArgs
  };
}

export function runHermesCommand(commandRunner, command, args, options = {}) {
  const invocation = resolveHermesCommand(command, args, options);
  return commandRunner(invocation.command, invocation.args, {
    ...options,
    env: { ...(options.env || process.env), ...(invocation.env || {}) }
  });
}
