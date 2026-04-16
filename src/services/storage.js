import { randomUUID } from "node:crypto";
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
    fs.mkdir(config.skillRuleDir, { recursive: true }),
    fs.mkdir(path.dirname(config.skillRuleChangeLogPath), { recursive: true }),
    fs.mkdir(config.rejectionStoreDir, { recursive: true }),
    fs.mkdir(path.dirname(config.rejectionGroupStorePath), { recursive: true }),
    fs.mkdir(config.replayTaskStoreDir, { recursive: true }),
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
    const normalizedContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    return JSON.parse(normalizedContent);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

export async function writeJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
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
