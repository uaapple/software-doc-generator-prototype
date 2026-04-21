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
  host: process.env.HOST || "::",
  port: Number(process.env.PORT || 3000),
  rootDir,
  publicDir: path.join(rootDir, "public"),
  legacySkillDir: path.join(rootDir, "skills"),
  activeSkillDir: path.join(rootDir, "skills", "active"),
  skillBundleDir: path.join(rootDir, "skills", "bundles"),
  dataDir: path.join(rootDir, "data"),
  skillDatabasePath: path.join(rootDir, "data", "skills.sqlite"),
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
  skillWorkOrderStoreDir: path.join(rootDir, "data", "skill-work-orders"),
  feedbackTicketStoreDir: path.join(rootDir, "data", "feedback-tickets"),
  feedbackTicketUploadDir: path.join(rootDir, "data", "uploads", "feedback-tickets"),
  templateDir: path.join(rootDir, "templates"),
  templatePath: path.join(rootDir, "templates", "software-requirement-template.json"),
  skillDir: path.join(rootDir, "skills", "active"),
  hermes: {
    transport: process.env.HERMES_TRANSPORT || "cli",
    host: process.env.HERMES_HOST || "127.0.0.1",
    port: Number(process.env.HERMES_PORT || 3101),
    baseURL: process.env.HERMES_BASE_URL || `http://127.0.0.1:${Number(process.env.HERMES_PORT || 3101)}`,
    command: process.env.HERMES_COMMAND || "hermes",
    workdir: process.env.HERMES_WORKDIR || rootDir,
    timeoutMs: Number(process.env.HERMES_TIMEOUT_MS || 15000),
    maxTurns: Number(process.env.HERMES_MAX_TURNS || 40),
    maxRecalledAtoms: Number(process.env.HERMES_MAX_RECALLED_ATOMS || 24),
    maxOutlineSections: Number(process.env.HERMES_MAX_OUTLINE_SECTIONS || 6),
    maxEvidenceForGeneration: Number(process.env.HERMES_MAX_EVIDENCE_FOR_GENERATION || 40)
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.ZHIPU_API_KEY || process.env.ARK_API_KEY || "",
    model: process.env.OPENAI_MODEL || process.env.ZHIPU_MODEL || process.env.ARK_MODEL || "gpt-4.1-mini",
    baseURL: process.env.OPENAI_BASE_URL || process.env.ZHIPU_BASE_URL || process.env.ARK_BASE_URL || undefined
  }
};
