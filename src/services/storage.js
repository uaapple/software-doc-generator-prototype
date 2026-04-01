import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export async function ensureStorage() {
  await Promise.all([
    fs.mkdir(config.dataDir, { recursive: true }),
    fs.mkdir(config.projectStoreDir, { recursive: true }),
    fs.mkdir(config.uploadDir, { recursive: true })
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
