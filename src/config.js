import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const externalEnvKeys = new Set(Object.keys(process.env));

loadDotEnv(path.join(rootDir, ".env.defaults"));
loadExternalDotEnv();
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

function loadExternalDotEnv() {
  const externalEnvPath = process.env.APP_ENV_FILE || process.env.SOFTWARE_DOC_ENV_FILE || "";
  if (!externalEnvPath) {
    return;
  }

  loadDotEnv(resolveRuntimePath(externalEnvPath, ""), {
    canOverride(key) {
      return !externalEnvKeys.has(key);
    }
  });
}

function resolveRuntimePath(value, fallback) {
  const text = String(value || "").trim();
  if (!text) {
    return fallback;
  }

  return path.isAbsolute(text) ? text : path.resolve(rootDir, text);
}

const dataDir = resolveRuntimePath(process.env.APP_DATA_DIR, path.join(rootDir, "data"));
const runtimeSkillDir = resolveRuntimePath(process.env.APP_SKILLS_DIR, path.join(rootDir, "skills"));
const repositorySkillSeedDir = path.join(rootDir, "skills");

export const config = {
  host: process.env.HOST || "::",
  port: Number(process.env.PORT || 3000),
  rootDir,
  publicDir: path.join(rootDir, "public"),
  legacySkillDir: repositorySkillSeedDir,
  activeSkillDir: path.join(runtimeSkillDir, "active"),
  skillBundleDir: path.join(runtimeSkillDir, "bundles"),
  generationTaskArtifactDir: path.join(dataDir, "generation-task-artifacts"),
  replayTaskArtifactDir: path.join(dataDir, "replay-task-artifacts"),
  dataDir,
  skillDatabasePath: path.join(dataDir, "skills.sqlite"),
  projectStoreDir: path.join(dataDir, "projects"),
  uploadDir: path.join(dataDir, "uploads"),
  llmProfileStorePath: path.join(dataDir, "llm-profiles.json"),
  skillRefinementDir: path.join(dataDir, "skill-refinement"),
  skillRefinementCaseDir: path.join(dataDir, "skill-refinement", "cases"),
  skillRefinementRunDir: path.join(dataDir, "skill-refinement", "runs"),
  skillRefinementEvaluationDir: path.join(dataDir, "skill-refinement", "evaluations"),
  skillRefinementAuditDir: path.join(dataDir, "skill-refinement", "audit"),
  skillRefinementBundleMetaDir: path.join(dataDir, "skill-refinement", "bundles"),
  skillBundleSnapshotDir: path.join(dataDir, "skill-refinement", "bundle-snapshots"),
  skillRefinementUploadDir: path.join(dataDir, "skill-refinement", "uploads"),
  activeSkillBundlePointerPath: path.join(dataDir, "skill-refinement", "active-bundle.json"),
  skillRuleDir: path.join(dataDir, "skill-rules"),
  skillRuleChangeLogPath: path.join(dataDir, "skill-rules", "change-log.json"),
  rejectionStoreDir: path.join(dataDir, "rejections"),
  rejectionGroupStorePath: path.join(dataDir, "rejections", "groups.json"),
  replayTaskStoreDir: path.join(dataDir, "replay-tasks"),
  skillWorkOrderStoreDir: path.join(dataDir, "skill-work-orders"),
  feedbackTicketStoreDir: path.join(dataDir, "feedback-tickets"),
  feedbackTicketUploadDir: path.join(dataDir, "uploads", "feedback-tickets"),
  templateDir: path.join(rootDir, "templates"),
  templatePath: path.join(rootDir, "templates", "software-requirement-template.json"),
  skillDir: path.join(runtimeSkillDir, "active"),
  skillVersioning: {
    directActiveSkillItemWrites: process.env.SKILL_DIRECT_ACTIVE_WRITES || "allow"
  },
  hermes: {
    transport: process.env.HERMES_TRANSPORT || "cli",
    host: process.env.HERMES_HOST || "127.0.0.1",
    port: Number(process.env.HERMES_PORT || 3101),
    baseURL: process.env.HERMES_BASE_URL || `http://127.0.0.1:${Number(process.env.HERMES_PORT || 3101)}`,
    command: process.env.HERMES_COMMAND || "hermes",
    stateDbPath: process.env.HERMES_STATE_DB_PATH || path.join(process.env.HOME || "", ".hermes", "state.db"),
    workdir: process.env.HERMES_WORKDIR || rootDir,
    timeoutMs: Number(process.env.HERMES_TIMEOUT_MS || 120000),
    stepTimeoutMs: {
      anchor_index_build: Number(process.env.HERMES_TIMEOUT_ANCHOR_INDEX_BUILD_MS || 180000),
      outline_build: Number(process.env.HERMES_TIMEOUT_OUTLINE_BUILD_MS || 180000),
      module_bootstrap_generate: Number(process.env.HERMES_TIMEOUT_MODULE_BOOTSTRAP_GENERATE_MS || 600000),
      content_generate: Number(process.env.HERMES_TIMEOUT_CONTENT_GENERATE_MS || 600000),
      document_extract_generate: Number(process.env.HERMES_TIMEOUT_DOCUMENT_EXTRACT_GENERATE_MS || 240000),
      replay_proposal_generate: Number(process.env.HERMES_TIMEOUT_REPLAY_PROPOSAL_GENERATE_MS || 600000)
    },
    heartbeatIntervalMs: Number(process.env.HERMES_HEARTBEAT_INTERVAL_MS || 5000),
    taskConcurrency: Number(process.env.HERMES_TASK_CONCURRENCY || 1),
    maxTurns: Number(process.env.HERMES_MAX_TURNS || 40),
    maxRecalledAtoms: Number(process.env.HERMES_MAX_RECALLED_ATOMS || 24),
    maxOutlineSections: Number(process.env.HERMES_MAX_OUTLINE_SECTIONS || 6),
    maxEvidenceForGeneration: Number(process.env.HERMES_MAX_EVIDENCE_FOR_GENERATION || 40),
    maxAnchorsForGeneration: Number(process.env.HERMES_MAX_ANCHORS_FOR_GENERATION || 80)
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.ZHIPU_API_KEY || process.env.ARK_API_KEY || "",
    model: process.env.OPENAI_MODEL || process.env.ZHIPU_MODEL || process.env.ARK_MODEL || "gpt-4.1-mini",
    baseURL: process.env.OPENAI_BASE_URL || process.env.ZHIPU_BASE_URL || process.env.ARK_BASE_URL || undefined
  }
};
