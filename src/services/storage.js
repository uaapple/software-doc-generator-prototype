import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export async function ensureStorage() {
  await Promise.all([
    fs.mkdir(config.dataDir, { recursive: true }),
    fs.mkdir(config.projectStoreDir, { recursive: true }),
    fs.mkdir(config.uploadDir, { recursive: true }),
    fs.mkdir(path.dirname(config.llmProfileStorePath), { recursive: true }),
    fs.mkdir(config.skillRefinementDir, { recursive: true }),
    fs.mkdir(config.skillRefinementCaseDir, { recursive: true }),
    fs.mkdir(config.skillRefinementRunDir, { recursive: true }),
    fs.mkdir(config.skillRefinementEvaluationDir, { recursive: true }),
    fs.mkdir(config.skillRefinementAuditDir, { recursive: true }),
    fs.mkdir(config.skillRefinementBundleMetaDir, { recursive: true }),
    fs.mkdir(config.skillRefinementUploadDir, { recursive: true }),
    fs.mkdir(config.activeSkillDir, { recursive: true }),
    fs.mkdir(config.skillBundleDir, { recursive: true })
  ]);
}

export function getProjectPath(projectId) {
  return path.join(config.projectStoreDir, `${projectId}.json`);
}

export async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function copyDirectory(sourceDir, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}
