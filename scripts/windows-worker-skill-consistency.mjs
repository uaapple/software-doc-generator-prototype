import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRecords = {
  simulinkUtTcsdGeneratorSkill: "skills/hermes/simulink-ut-tcsd-generator",
  simulinkModuleDescriptionGeneratorSkill: "skills/hermes/simulink-module-description-generator"
};

function shouldInclude(filePath) {
  const segments = filePath.split(path.sep).map((segment) => segment.toLowerCase());
  const name = segments.at(-1) || "";
  return !segments.includes("__pycache__")
    && !name.endsWith(".pyc")
    && !name.includes(".tmp-")
    && !name.endsWith(".tmp");
}

function listFiles(root, current = root) {
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(root, fullPath));
    } else if (entry.isFile() && shouldInclude(fullPath)) {
      files.push({
        fullPath,
        relativePath: path.relative(root, fullPath).replaceAll("\\", "/")
      });
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
}

export function hashDirectoryTree(root) {
  if (!fs.existsSync(root)) {
    throw new Error(`Skill directory does not exist: ${root}`);
  }
  const hash = crypto.createHash("sha256");
  for (const file of listFiles(root)) {
    const relativePath = Buffer.from(file.relativePath, "utf8");
    const content = fs.readFileSync(file.fullPath);
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(relativePath.length);
    const contentLength = Buffer.alloc(8);
    contentLength.writeBigUInt64BE(BigInt(content.length));
    hash.update(pathLength);
    hash.update(relativePath);
    hash.update(contentLength);
    hash.update(content);
  }
  return hash.digest("hex");
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Official dependency manifest does not exist: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function updateOfficialSkillHashes({ projectRoot, manifestPath }) {
  const manifest = readManifest(manifestPath);
  for (const [dependencyName, relativePath] of Object.entries(skillRecords)) {
    const record = manifest.dependencies?.[dependencyName];
    if (!record?.version) {
      throw new Error(`Official dependency manifest is missing ${dependencyName}.version.`);
    }
    record.installPath = relativePath;
    record.contentSha256 = hashDirectoryTree(path.join(projectRoot, relativePath));
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function assertOfficialSkillConsistency({ projectRoot, manifestPath }) {
  const manifest = readManifest(manifestPath);
  for (const [dependencyName, relativePath] of Object.entries(skillRecords)) {
    const record = manifest.dependencies?.[dependencyName];
    if (!record?.version || !record?.contentSha256) {
      throw new Error(`Official dependency manifest lacks version/contentSha256 for ${dependencyName}; run the official dependency sync first.`);
    }
    if (String(record.installPath || "").replaceAll("\\", "/") !== relativePath) {
      throw new Error(`Official dependency manifest installPath mismatch for ${dependencyName}.`);
    }
    const actual = hashDirectoryTree(path.join(projectRoot, relativePath));
    if (actual !== record.contentSha256) {
      throw new Error(`Skill content does not match the synchronized manifest for ${dependencyName}; run the official dependency sync before building.`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = path.resolve(process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const manifestPath = path.join(projectRoot, "offline-installers", "official-dependencies.json");
  if (process.argv[2] === "--write") {
    updateOfficialSkillHashes({ projectRoot, manifestPath });
    console.log(`Official skill content hashes updated: ${manifestPath}`);
  } else {
    assertOfficialSkillConsistency({ projectRoot, manifestPath });
    console.log("Official skill content matches the dependency manifest.");
  }
}
