import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  TCSD_ERROR_CODES,
  TCSD_STAGE_DEFINITIONS
} from "./tcsd-pipeline-contract.js";
import { runHermesCommand } from "./hermes-command.js";
import { hashTcsdBundle } from "./tcsd-stage-catalog.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_SCHEMA = "tcsd-hermes-skill-snapshot/v1";
const MANAGED_SCHEMA = "tcsd-hermes-managed-skill/v1";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function profileArgs(profile, args) {
  return !profile || profile === "default" ? args : ["-p", profile, ...args];
}

function error(message, details = {}) {
  return Object.assign(new Error(message), {
    code: TCSD_ERROR_CODES.workerUnavailable,
    details
  });
}

function isListed(output, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s┃│])${escaped}(?=[\\s┃│]|$)`, "m").test(String(output || ""));
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (cause) {
    if (cause?.code === "ENOENT") return null;
    throw cause;
  }
}

async function replaceManagedDirectory({ source, target, markerPath, expectedHash }) {
  const current = await fs.stat(target).catch(() => null);
  const marker = await readJson(markerPath);
  if (current) {
    if (!current.isDirectory()) throw error(`Hermes TCSD skill target is not a directory: ${target}`);
    const currentHash = (await hashTcsdBundle(target)).sha256;
    if (currentHash === expectedHash) {
      await fs.mkdir(path.dirname(markerPath), { recursive: true });
      await fs.writeFile(markerPath, JSON.stringify({
        schema: MANAGED_SCHEMA,
        bundleHash: expectedHash
      }, null, 2));
      return;
    }
    if (marker?.schema !== MANAGED_SCHEMA || marker.bundleHash !== currentHash) {
      throw error(`Hermes TCSD skill has an unmanaged or locally modified collision: ${target}`);
    }
  }
  const suffix = `${process.pid}-${Date.now()}`;
  const temporary = `${target}.installing-${suffix}`;
  const backup = `${target}.previous-${suffix}`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, temporary, { recursive: true, errorOnExist: true });
  const copiedHash = (await hashTcsdBundle(temporary)).sha256;
  if (copiedHash !== expectedHash) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error(`Hermes TCSD skill copy hash mismatch: ${target}`);
  }
  if (current) await fs.rename(target, backup);
  try {
    await fs.rename(temporary, target);
    await fs.rm(backup, { recursive: true, force: true });
  } catch (cause) {
    await fs.rm(temporary, { recursive: true, force: true });
    if (current && await fs.stat(backup).catch(() => null)) await fs.rename(backup, target);
    throw cause;
  }
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify({
    schema: MANAGED_SCHEMA,
    bundleHash: expectedHash
  }, null, 2));
}

export class TcsdHermesSkillRegistry {
  constructor(options = {}) {
    this.command = options.command || "hermes";
    this.commandArgsPrefix = Array.isArray(options.commandArgsPrefix)
      ? options.commandArgsPrefix.map((value) => String(value))
      : [];
    this.profile = String(options.profile || "default").trim() || "default";
    this.stateDbPath = path.resolve(options.stateDbPath);
    this.catalog = options.catalog;
    this.commandRunner = options.commandRunner || execFileAsync;
    this.skillsDir = path.resolve(
      options.skillsDir ||
      process.env.TCSD_STAGE_HERMES_SKILLS_DIR ||
      path.join(path.dirname(this.stateDbPath), "skills")
    );
  }

  async prepare() {
    if (!this.catalog) throw error("TCSD Hermes skill registry has no source catalog.");
    const categoryDir = path.join(this.skillsDir, "tcsd");
    const markerDir = path.join(this.skillsDir, ".tcsd-managed");
    const stages = [];
    for (const definition of TCSD_STAGE_DEFINITIONS) {
      const skill = await this.catalog.describe(definition.index);
      const installedPath = path.join(categoryDir, skill.name);
      const markerPath = path.join(markerDir, `${skill.name}.json`);
      await replaceManagedDirectory({
        source: skill.directory,
        target: installedPath,
        markerPath,
        expectedHash: skill.bundleHash
      });
      const installed = await hashTcsdBundle(installedPath);
      const installedSkillFile = path.join(installedPath, "SKILL.md");
      const installedSkillFileHash = sha256(await fs.readFile(installedSkillFile));
      if (installed.sha256 !== skill.bundleHash || installedSkillFileHash !== skill.skillFileHash) {
        throw error(`Installed Hermes skill does not match its source: ${skill.name}`);
      }
      stages.push({
        index: definition.index,
        name: skill.name,
        version: skill.version,
        bundleVersion: skill.bundleVersion,
        bundleHash: skill.bundleHash,
        skillFileHash: skill.skillFileHash,
        installedPath
      });
    }
    const runtime = await this.catalog.runtime();
    const installedRuntimePath = path.join(categoryDir, "tcsd-runtime");
    await replaceManagedDirectory({
      source: runtime.directory,
      target: installedRuntimePath,
      markerPath: path.join(markerDir, "tcsd-runtime.json"),
      expectedHash: runtime.bundleHash
    });
    if ((await hashTcsdBundle(installedRuntimePath)).sha256 !== runtime.bundleHash) {
      throw error("Installed Hermes TCSD runtime does not match its source.");
    }
    let commandResult;
    try {
      commandResult = await runHermesCommand(
        this.commandRunner,
        this.command,
        [...this.commandArgsPrefix, ...profileArgs(this.profile, ["skills", "list"])],
        {
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          env: { ...process.env, NO_COLOR: "1" }
        }
      );
    } catch (cause) {
      throw error("Hermes skills discovery command failed.", {
        exitCode: Number.isInteger(cause?.code) ? cause.code : null
      });
    }
    const discoveryOutput = `${commandResult?.stdout || ""}\n${commandResult?.stderr || ""}`;
    const missing = stages.filter((stage) => !isListed(discoveryOutput, stage.name)).map((stage) => stage.name);
    if (missing.length) throw error("Hermes did not discover all TCSD stage skills.", { missing });
    return {
      schema: SNAPSHOT_SCHEMA,
      profile: this.profile,
      skillsDirectory: this.skillsDir,
      discovery: {
        command: "hermes skills list",
        outputSha256: sha256(discoveryOutput),
        outputBytes: Buffer.byteLength(discoveryOutput),
        allDiscovered: true
      },
      runtime: {
        bundleVersion: runtime.bundleVersion,
        bundleHash: runtime.bundleHash,
        installedPath: installedRuntimePath
      },
      stages
    };
  }
}

export { SNAPSHOT_SCHEMA as TCSD_HERMES_SKILL_SNAPSHOT_SCHEMA };
