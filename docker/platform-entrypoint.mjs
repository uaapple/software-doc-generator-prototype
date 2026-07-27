import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(scriptDirectory, "..");
const dataDirectory = path.resolve(process.env.APP_DATA_DIR || "/var/lib/sdg/data");
const skillsDirectory = path.resolve(process.env.APP_SKILLS_DIR || "/var/lib/sdg/skills");
const homeDirectory = path.resolve(process.env.HOME || "/var/lib/sdg/home");
const seedSkillsDirectory = path.join(applicationRoot, "seed-skills");

await prepareWritableState();

const children = new Map();
let shuttingDown = false;
let requestedSignal = "";

startService("platform", "src/server.js");
startService("wiki", "src/wiki-server.js");

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function startService(name, entryFile) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", entryFile], {
    cwd: applicationRoot,
    env: process.env,
    stdio: "inherit"
  });

  children.set(name, child);
  child.once("error", (error) => {
    console.error(`[platform-entrypoint] ${name} failed to start: ${error.message}`);
    shutdown("SIGTERM", 1);
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    const status = Number.isInteger(code) ? code : signal ? 1 : 0;
    if (!shuttingDown) {
      console.error(
        `[platform-entrypoint] ${name} exited unexpectedly (${formatExit(code, signal)}); stopping platform container.`
      );
      shutdown("SIGTERM", status || 1);
      return;
    }
    finishWhenStopped();
  });
}

async function prepareWritableState() {
  for (const directory of [dataDirectory, skillsDirectory, homeDirectory]) {
    await mkdir(directory, { recursive: true });
    await access(directory, fsConstants.R_OK | fsConstants.W_OK);
  }

  const existingSkillEntries = await readdir(skillsDirectory);
  if (existingSkillEntries.length === 0) {
    const seedEntries = await readdir(seedSkillsDirectory);
    for (const entry of seedEntries) {
      await cp(path.join(seedSkillsDirectory, entry), path.join(skillsDirectory, entry), {
        recursive: true,
        errorOnExist: true,
        force: false
      });
    }
    console.log(`[platform-entrypoint] initialized skill volume from ${seedSkillsDirectory}`);
  }
}

function shutdown(signal, exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  requestedSignal = signal;
  process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;

  for (const child of children.values()) {
    if (!child.killed) {
      child.kill(signal);
    }
  }

  if (children.size === 0) {
    finishWhenStopped();
    return;
  }

  const forceStopTimer = setTimeout(() => {
    for (const child of children.values()) {
      child.kill("SIGKILL");
    }
  }, 10_000);
  forceStopTimer.unref();
}

function finishWhenStopped() {
  if (children.size !== 0) {
    return;
  }
  if (requestedSignal) {
    console.log(`[platform-entrypoint] shutdown complete after ${requestedSignal}`);
  }
  process.exit();
}

function formatExit(code, signal) {
  if (Number.isInteger(code)) {
    return `exit code ${code}`;
  }
  return signal ? `signal ${signal}` : "unknown status";
}
