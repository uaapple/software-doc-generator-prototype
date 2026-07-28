import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installRoot = path.dirname(appRoot);
const envFile = path.resolve(
  String(
    process.env.SOFTWARE_DOC_WORKER_ENV_FILE ||
    path.join(installRoot, "software-doc-worker.env")
  )
);

loadEnvFile(envFile);
await import("./matlab-worker-server-runtime.js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Native MATLAB Gateway environment file is missing.");
  }
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || key in process.env) continue;
    process.env[key] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/u, "$2");
  }
}
