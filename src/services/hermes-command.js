import fs from "node:fs";
import { spawn } from "node:child_process";
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

/**
 * 生成式命令 runner：与 execFileAsync 契约一致（resolve {stdout, stderr}，
 * 非零退出 reject {code, signal, stdout, stderr}，超时 kill 后按
 * killed/SIGTERM reject），同时暴露子进程句柄与增量输出，供阶段执行器
 * 在 hermes chat 完成后挂起（futex/线程 join 竞态）时做看门狗收尾。
 */
export function createHermesSpawnRunner() {
  return (command, args = [], options = {}) => {
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      detached: useProcessGroup,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    const maxBuffer = Number(options.maxBuffer || 16 * 1024 * 1024);
    const stderrTailLimit = 64 * 1024;
    const terminate = (signal = "SIGTERM") => {
      if (child.exitCode !== null || child.signalCode) return false;
      try {
        if (process.platform === "win32" && Number.isInteger(child.pid)) {
          const force = signal === "SIGKILL" ? ["/F"] : [];
          spawn("taskkill", ["/PID", String(child.pid), "/T", ...force], {
            windowsHide: true,
            stdio: "ignore"
          });
        } else if (useProcessGroup && Number.isInteger(child.pid)) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
        return true;
      } catch {
        try {
          return child.kill(signal);
        } catch {
          return false;
        }
      }
    };
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBuffer) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr) < stderrTailLimit) stderr += chunk;
    });
    const promise = new Promise((resolve, reject) => {
      let timer = null;
      if (options.timeout) {
        timer = setTimeout(() => {
          terminate("SIGTERM");
          reject(
            Object.assign(
              new Error(`Hermes stage session timed out after ${options.timeout}ms.`),
              { killed: true, signal: "SIGTERM" }
            )
          );
        }, options.timeout);
      }
      child.on("error", (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code, signal) => {
        if (timer) clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            Object.assign(
              new Error(
                `Hermes stage session exited with code ${code}${signal ? ` (${signal})` : ""}.`
              ),
              { code, signal, stdout, stderr }
            )
          );
        }
      });
    });
    promise.child = child;
    promise.terminate = terminate;
    promise.stdoutSoFar = () => stdout;
    promise.stderrSoFar = () => stderr;
    return promise;
  };
}
