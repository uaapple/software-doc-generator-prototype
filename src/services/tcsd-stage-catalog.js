import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TCSD_RUNTIME_BUNDLE_VERSION,
  TCSD_STAGE_DEFINITIONS
} from "./tcsd-pipeline-contract.js";

const DEFAULT_TCSD_SKILLS_DIR = fileURLToPath(new URL("../../skills/hermes/", import.meta.url));

async function listBundleFiles(rootDir, currentDir = rootDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listBundleFiles(rootDir, absolutePath));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(rootDir, absolutePath).replaceAll(path.sep, "/")
      });
    }
  }
  return files;
}

export async function hashTcsdBundle(bundleDir) {
  const hash = createHash("sha256");
  const files = await listBundleFiles(bundleDir);
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(await fs.readFile(file.absolutePath));
    hash.update("\0");
  }
  return { sha256: hash.digest("hex"), fileCount: files.length };
}

export async function hashTcsdFile(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export class TcsdStageCatalog {
  constructor(options = {}) {
    this.skillsDir = path.resolve(options.skillsDir || DEFAULT_TCSD_SKILLS_DIR);
    this.cache = new Map();
  }

  async describe(stageIndex) {
    const definition = TCSD_STAGE_DEFINITIONS[Number(stageIndex) - 1];
    if (!definition) throw new Error(`Unknown TCSD stage: ${stageIndex}`);
    const cacheKey = `stage:${definition.skillName}`;
    if (!this.cache.has(cacheKey)) {
      const skillDir = path.join(this.skillsDir, definition.skillName);
      const skillBundle = await hashTcsdBundle(skillDir);
      const skillFile = path.join(skillDir, "SKILL.md");
      const skillSource = await fs.readFile(skillFile, "utf8");
      if (
        !skillSource.startsWith("---") ||
        !skillSource.includes(`name: ${definition.skillName}`) ||
        !skillSource.includes(`version: "${definition.skillVersion}"`)
      ) {
        throw new Error(`TCSD stage skill metadata mismatch: ${definition.skillName}`);
      }
      this.cache.set(cacheKey, {
        name: definition.skillName,
        version: definition.skillVersion,
        bundleVersion: definition.bundleVersion,
        bundleHash: skillBundle.sha256,
        fileCount: skillBundle.fileCount,
        skillFileHash: await hashTcsdFile(skillFile),
        directory: skillDir,
        source: skillSource
      });
    }
    return this.cache.get(cacheKey);
  }

  async runtime() {
    if (!this.cache.has("runtime")) {
      const directory = path.join(this.skillsDir, "tcsd-runtime");
      const bundle = await hashTcsdBundle(directory);
      this.cache.set("runtime", {
        bundleVersion: TCSD_RUNTIME_BUNDLE_VERSION,
        bundleHash: bundle.sha256,
        fileCount: bundle.fileCount,
        directory
      });
    }
    return this.cache.get("runtime");
  }
}
