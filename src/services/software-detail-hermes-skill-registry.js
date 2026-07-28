import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { runHermesCommand } from "./hermes-command.js";
import { listSoftwareDetailStages } from "./software-detail-stage-catalog.js";

const execFileAsync = promisify(execFile);
const REGISTRY_SCHEMA = "software-detail-hermes-skill-registry/v1";
const MANAGED_SCHEMA = "software-detail-hermes-managed-bundle/v1";

function registryError(message, details = {}) {
  return Object.assign(new Error(message), {
    code: "software_detail_skill_registry_failed",
    details
  });
}

function profileArgs(profile, args) {
  return !profile || profile === "default" ? args : ["-p", profile, ...args];
}

function isListed(output, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s┃│])${escaped}(?=[\\s┃│]|$)`, "m").test(
    String(output || "")
  );
}

export async function hashSoftwareDetailBundle(directory) {
  const hash = createHash("sha256");
  async function walk(current, prefix = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw registryError("Software-detail skill bundles cannot contain symlinks.");
      }
      const relativePath = path.posix.join(prefix, entry.name);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${relativePath}\0`);
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), relativePath);
      } else if (entry.isFile()) {
        hash.update(await fs.readFile(path.join(current, entry.name)));
      }
    }
  }
  await walk(directory);
  return hash.digest("hex");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (cause) {
    if (cause?.code === "ENOENT") return null;
    throw cause;
  }
}

async function installManagedBundle(source, target, markerPath) {
  const expectedHash = await hashSoftwareDetailBundle(source);
  const current = await fs.stat(target).catch(() => null);
  const marker = await readJson(markerPath);
  if (current) {
    if (!current.isDirectory()) {
      throw registryError("Hermes skill install target is not a directory.");
    }
    const currentHash = await hashSoftwareDetailBundle(target);
    if (currentHash === expectedHash) {
      await fs.mkdir(path.dirname(markerPath), { recursive: true });
      await fs.writeFile(
        markerPath,
        `${JSON.stringify({ schema: MANAGED_SCHEMA, bundleHash: expectedHash }, null, 2)}\n`
      );
      return expectedHash;
    }
    if (marker?.schema !== MANAGED_SCHEMA || marker.bundleHash !== currentHash) {
      throw registryError(
        "Hermes software-detail skill has an unmanaged or locally modified collision."
      );
    }
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const temporary = `${target}.installing-${suffix}`;
  const backup = `${target}.previous-${suffix}`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, temporary, { recursive: true, errorOnExist: true });
  if ((await hashSoftwareDetailBundle(temporary)) !== expectedHash) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw registryError("Hermes software-detail skill copy hash mismatch.");
  }
  if (current) await fs.rename(target, backup);
  try {
    await fs.rename(temporary, target);
    await fs.rm(backup, { recursive: true, force: true });
  } catch (cause) {
    await fs.rm(temporary, { recursive: true, force: true });
    if (current && (await fs.stat(backup).catch(() => null))) {
      await fs.rename(backup, target);
    }
    throw cause;
  }
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(
    markerPath,
    `${JSON.stringify({ schema: MANAGED_SCHEMA, bundleHash: expectedHash }, null, 2)}\n`
  );
  return expectedHash;
}

function readSkillVersion(source) {
  const match = source.match(/^---[\s\S]*?metadata:\s*\n\s+version:\s*"([^"]+)"/m);
  if (!match) {
    throw registryError("Software-detail skill metadata.version is missing.");
  }
  return match[1];
}

export class SoftwareDetailHermesSkillRegistry {
  constructor(options = {}) {
    this.command = options.command || config.hermes.command || "hermes";
    this.commandArgsPrefix = Array.isArray(
      options.commandArgsPrefix ?? config.hermes.commandArgsPrefix
    )
      ? (options.commandArgsPrefix ?? config.hermes.commandArgsPrefix).map(String)
      : [];
    this.profile =
      String(
        options.profile ??
          config.softwareDetailPipeline?.hermesProfile ??
          config.hermes.profile ??
          "default"
      ).trim() || "default";
    this.commandRunner = options.commandRunner || execFileAsync;
    this.sourceRoot = path.resolve(
      options.sourceRoot || path.join(config.rootDir, "skills", "hermes")
    );
    this.skillsDir = path.resolve(
      options.skillsDir ||
        process.env.SOFTWARE_DETAIL_STAGE_HERMES_SKILLS_DIR ||
        path.join(config.hermes.homeDir, "skills")
    );
  }

  async prepare() {
    const categoryDir = path.join(this.skillsDir, "software-detail");
    const markerDir = path.join(
      this.skillsDir,
      ".software-detail-managed"
    );
    const stages = [];
    for (const definition of listSoftwareDetailStages()) {
      const source = path.join(this.sourceRoot, definition.skillName);
      const target = path.join(categoryDir, definition.skillName);
      const skillText = await fs.readFile(path.join(source, "SKILL.md"), "utf8");
      const bundleHash = await installManagedBundle(
        source,
        target,
        path.join(markerDir, `${definition.skillName}.json`)
      );
      stages.push({
        stageId: definition.id,
        name: definition.skillName,
        version: readSkillVersion(skillText),
        bundleHash,
        installedPath: target
      });
    }

    const runtimeSource = path.join(
      this.sourceRoot,
      "software-detail-runtime"
    );
    const runtimeTarget = path.join(
      categoryDir,
      "software-detail-runtime"
    );
    const runtimeHash = await installManagedBundle(
      runtimeSource,
      runtimeTarget,
      path.join(markerDir, "software-detail-runtime.json")
    );

    let commandResult;
    try {
      commandResult = await runHermesCommand(
        this.commandRunner,
        this.command,
        [
          ...this.commandArgsPrefix,
          ...profileArgs(this.profile, ["skills", "list"])
        ],
        {
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          env: { ...process.env, NO_COLOR: "1" }
        }
      );
    } catch (cause) {
      throw registryError("Hermes skills discovery command failed.", {
        exitCode: Number.isInteger(cause?.code) ? cause.code : null
      });
    }
    const discoveryOutput = `${commandResult?.stdout || ""}\n${
      commandResult?.stderr || ""
    }`;
    const missing = stages
      .filter((stage) => !isListed(discoveryOutput, stage.name))
      .map((stage) => stage.name);
    if (missing.length) {
      throw registryError(
        "Hermes did not discover all software-detail stage skills.",
        { missing }
      );
    }

    return Object.freeze({
      schema: REGISTRY_SCHEMA,
      profile: this.profile,
      discovery: {
        command: "hermes skills list",
        allDiscovered: true,
        outputSha256: createHash("sha256")
          .update(discoveryOutput)
          .digest("hex")
      },
      runtime: {
        bundleHash: runtimeHash,
        installedPath: runtimeTarget
      },
      stages
    });
  }
}

export {
  REGISTRY_SCHEMA as SOFTWARE_DETAIL_HERMES_SKILL_REGISTRY_SCHEMA
};
