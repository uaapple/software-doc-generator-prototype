function normalizePrefixArgs(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function resolvePythonInvocation(options = {}) {
  if (options.pythonInvocation?.executable) {
    return {
      executable: String(options.pythonInvocation.executable),
      prefixArgs: normalizePrefixArgs(options.pythonInvocation.prefixArgs)
    };
  }

  const environment = options.env || process.env;
  const configured = String(options.python || environment.TCSD_PIPELINE_PYTHON || "").trim();
  if (configured) {
    return {
      executable: configured,
      prefixArgs: []
    };
  }

  if ((options.platform || process.platform) === "win32") {
    return {
      executable: "py",
      prefixArgs: ["-3.11"]
    };
  }

  return {
    executable: "python3",
    prefixArgs: []
  };
}

export function pythonArgs(invocation, args = []) {
  return [
    ...normalizePrefixArgs(invocation?.prefixArgs),
    ...(Array.isArray(args) ? args : [])
  ];
}

export function runPythonCommand(commandRunner, invocation, args, options = {}) {
  return commandRunner(invocation.executable, pythonArgs(invocation, args), options);
}

export function formatPythonCommand(invocation, args = []) {
  const quote = (value) => {
    const token = String(value);
    return /[\s"]/u.test(token) ? `"${token.replaceAll('"', '\\"')}"` : token;
  };
  return [invocation.executable, ...pythonArgs(invocation, args)].map(quote).join(" ");
}
