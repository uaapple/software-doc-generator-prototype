import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const externalEnvKeys = new Set(Object.keys(process.env));

loadDotEnv(path.join(rootDir, ".env.defaults"));
loadDotEnv(path.join(rootDir, ".env"), {
  canOverride(key) {
    return !externalEnvKeys.has(key);
  }
});

function loadDotEnv(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const canOverride = options.canOverride ? options.canOverride(key) : false;
    if (!(key in process.env) || canOverride) {
      process.env[key] = value;
    }
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  rootDir,
  publicDir: path.join(rootDir, "public"),
  legacySkillDir: path.join(rootDir, "skills"),
  activeSkillDir: path.join(rootDir, "skills", "active"),
  skillBundleDir: path.join(rootDir, "skills", "bundles"),
  dataDir: path.join(rootDir, "data"),
  projectStoreDir: path.join(rootDir, "data", "projects"),
  uploadDir: path.join(rootDir, "data", "uploads"),
  llmProfileStorePath: path.join(rootDir, "data", "llm-profiles.json"),
  skillRefinementDir: path.join(rootDir, "data", "skill-refinement"),
  skillRefinementCaseDir: path.join(rootDir, "data", "skill-refinement", "cases"),
  skillRefinementRunDir: path.join(rootDir, "data", "skill-refinement", "runs"),
  skillRefinementEvaluationDir: path.join(rootDir, "data", "skill-refinement", "evaluations"),
  skillRefinementAuditDir: path.join(rootDir, "data", "skill-refinement", "audit"),
  skillRefinementBundleMetaDir: path.join(rootDir, "data", "skill-refinement", "bundles"),
  skillRefinementUploadDir: path.join(rootDir, "data", "skill-refinement", "uploads"),
  activeSkillBundlePointerPath: path.join(rootDir, "data", "skill-refinement", "active-bundle.json"),
  skillRuleDir: path.join(rootDir, "data", "skill-rules"),
  skillRuleChangeLogPath: path.join(rootDir, "data", "skill-rules", "change-log.json"),
  rejectionStoreDir: path.join(rootDir, "data", "rejections"),
  rejectionGroupStorePath: path.join(rootDir, "data", "rejections", "groups.json"),
  replayTaskStoreDir: path.join(rootDir, "data", "replay-tasks"),
  templateDir: path.join(rootDir, "templates"),
  templatePath: path.join(rootDir, "templates", "software-requirement-template.json"),
  skillDir: path.join(rootDir, "skills", "active"),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.ARK_API_KEY || "",
    model: process.env.OPENAI_MODEL || process.env.ARK_MODEL || "gpt-4.1-mini",
    baseURL: process.env.OPENAI_BASE_URL || process.env.ARK_BASE_URL || undefined
  }
};
