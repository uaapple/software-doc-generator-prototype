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
  const extension = path.extname(executable).toLowerCase();
  if (extension === ".js") {
    return {
      command: process.execPath,
      args: [executable, ...commandArgs]
    };
  }
  if (platform === "win32" && extension === ".cmd") {
    const embeddedPython = path.join(path.dirname(executable), "python", "python.exe");
    if (path.basename(executable).toLowerCase() === "hermes.cmd" && fs.existsSync(embeddedPython)) {
      const hermesHome = path.resolve(path.dirname(executable), "..", "hermes-home");
      return {
        command: embeddedPython,
        args: ["-m", "hermes_cli.main", ...commandArgs],
        env: fs.existsSync(hermesHome) ? { HERMES_HOME: hermesHome } : {}
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
  const invocation = resolveHermesCommand(command, args);
  return commandRunner(invocation.command, invocation.args, {
    ...options,
    env: { ...(options.env || process.env), ...(invocation.env || {}) }
  });
}
