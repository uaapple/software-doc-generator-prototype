import path from "node:path";

export function resolveHermesCommand(command, args = []) {
  const executable = String(command || "").trim();
  const commandArgs = Array.isArray(args) ? args : [];
  if (path.extname(executable).toLowerCase() === ".js") {
    return {
      command: process.execPath,
      args: [executable, ...commandArgs]
    };
  }
  return {
    command: executable,
    args: commandArgs
  };
}

export function runHermesCommand(commandRunner, command, args, options = {}) {
  const invocation = resolveHermesCommand(command, args);
  return commandRunner(invocation.command, invocation.args, options);
}
