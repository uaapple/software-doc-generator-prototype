import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { readJson, writeJson } from "./storage.js";

function now() {
  return new Date().toISOString();
}

function getAuditPath(scope) {
  return path.join(config.skillRefinementAuditDir, `${scope}.json`);
}

export class SkillRefinementAuditService {
  async append(scope, entry) {
    const filePath = getAuditPath(scope);
    const existing = (await readJson(filePath, [])) || [];
    existing.push({
      at: now(),
      ...entry
    });
    await fs.mkdir(config.skillRefinementAuditDir, { recursive: true });
    await writeJson(filePath, existing);
  }
}
