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
  // Manifest-driven hashing: when bundle-manifest.json is present (generated
  // at build time by tools/generate-bundle-manifests.mjs), the hash covers
  // exactly the listed files — path, content, and mode. Stray build-context
  // files (.DS_Store, __pycache__) can no longer shift a deployed bundle's
  // hash, which previously made production hash drift undiagnosable.
  const manifestPath = path.join(bundleDir, "bundle-manifest.json");
  let manifest = null;
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (parsed?.schema === "tcsd-bundle-manifest/v1" && Array.isArray(parsed.files)) {
      manifest = parsed;
    }
  } catch {
    manifest = null;
  }
  if (manifest) {
    const hash = createHash("sha256");
    const listed = new Set();
    for (const file of manifest.files) {
      const absolute = path.join(bundleDir, file.path);
      // Missing file -> ENOENT here: an incomplete image must fail loudly.
      const [content, stats] = [await fs.readFile(absolute), await fs.stat(absolute)];
      // Actual on-disk permission, not the manifest record: chmod drift in
      // the image must shift the hash (review P1).
      hash.update(file.path);
      hash.update("\0");
      hash.update(content);
      hash.update("\0");
      hash.update(String(stats.mode & 0o777));
      hash.update("\0");
      listed.add(file.path);
    }
    // Extra files are deployment drift, silently ignoring them hid the
    // bbc72245 hash shift. Only clearly allowed system noise is exempt.
    const exempt = (relativePath) =>
      relativePath === "bundle-manifest.json" ||
      relativePath === ".DS_Store" ||
      relativePath.split("/").some((segment) => segment === "__pycache__" || segment === ".pytest_cache") ||
      // Git-tracked host-side project addon packages (never copied into the
      // worker image; supplied per project via the addon store).
      relativePath.startsWith("assets/support-package/") || relativePath === "assets/support-package";
    const extra = (await listBundleFiles(bundleDir))
      .map((file) => file.relativePath)
      .filter((relativePath) => !listed.has(relativePath) && !exempt(relativePath));
    if (extra.length) {
      throw new Error(`bundle 目录包含清单之外的文件（部署漂移）：${extra.slice(0, 5).join(", ")}`);
    }
    return { sha256: hash.digest("hex"), fileCount: manifest.files.length, manifestDriven: true };
  }
  // Fallback (dev checkouts without manifests): walk the directory but skip
  // the manifest file itself so both modes stay comparable.
  const hash = createHash("sha256");
  const files = (await listBundleFiles(bundleDir)).filter(
    (file) => file.relativePath !== "bundle-manifest.json"
  );
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(await fs.readFile(file.absolutePath));
    hash.update("\0");
  }
  return { sha256: hash.digest("hex"), fileCount: files.length, manifestDriven: false };
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
