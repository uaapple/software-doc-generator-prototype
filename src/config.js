import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const externalEnvKeys = new Set(Object.keys(process.env));
const homeDir = process.env.HOME || process.env.USERPROFILE || "";

loadDotEnv(path.join(rootDir, ".env.defaults"));
loadDotEnv(path.join(rootDir, ".env"), {
  canOverride(key) {
    return !externalEnvKeys.has(key);
  }
});

function resolveRuntimePath(value = "", fallback = "") {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return fallback;
  }
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
}

const dataDir = path.resolve(process.env.APP_DATA_DIR || path.join(rootDir, "data"));
const skillRootDir = path.resolve(process.env.APP_SKILLS_DIR || path.join(rootDir, "skills"));

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

const hermesHomeDir = path.resolve(process.env.HERMES_HOME || path.join(homeDir, ".hermes"));
const hermesProfile = String(process.env.HERMES_PROFILE || "").trim();

function resolveDefaultUnitTestProjectAddonRoot() {
  if (process.platform === "win32") {
    return "C:\\ProgramData\\SoftwareDocGenerator\\project-addons";
  }
  return path.join(rootDir, ".local", "project-addons");
}

function resolveHermesStateDbPath() {
  if (process.env.HERMES_STATE_DB_PATH) {
    return path.resolve(process.env.HERMES_STATE_DB_PATH);
  }
  if (hermesProfile && hermesProfile !== "default") {
    return path.join(hermesHomeDir, "profiles", hermesProfile, "state.db");
  }
  return path.join(hermesHomeDir, "state.db");
}

export const config = {
  host: process.env.HOST || "::",
  port: Number(process.env.PORT || 3000),
  rootDir,
  publicDir: path.join(rootDir, "public"),
  legacySkillDir: skillRootDir,
  activeSkillDir: path.join(skillRootDir, "active"),
  skillBundleDir: path.join(skillRootDir, "bundles"),
  generationTaskArtifactDir: path.join(dataDir, "generation-task-artifacts"),
  replayTaskArtifactDir: path.join(dataDir, "replay-task-artifacts"),
  unitTestCase: {
    taskStoreDir: path.join(dataDir, "unit-test-case-generation", "tasks"),
    uploadTempDir: path.join(dataDir, "unit-test-case-generation", "_incoming"),
    projectRegistryPath: path.join(dataDir, "unit-test-case-generation", "projects.json"),
    projectAdminCode: process.env.UNIT_TEST_CASE_PROJECT_ADMIN_CODE || "114301",
    defaultProjects: process.env.UNIT_TEST_CASE_DEFAULT_PROJECTS || "01_楚能,02_TMS",
    projectAddonRoot: resolveRuntimePath(
      process.env.UNIT_TEST_CASE_PROJECT_ADDON_ROOT,
      resolveDefaultUnitTestProjectAddonRoot()
    ),
    skillName: process.env.UNIT_TEST_CASE_SKILL_NAME || "simulink-ut-tcsd-generator",
    expectedOutputPattern: process.env.UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN || "outputs/*_tcsd.xlsx",
    agentWorkspaceRoot: process.env.UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT || ""
  },
  softwareModuleDescription: {
    taskStoreDir: path.join(dataDir, "software-module-description-generation", "tasks"),
    uploadTempDir: path.join(dataDir, "software-module-description-generation", "_incoming"),
    skillName: process.env.SOFTWARE_MODULE_DESCRIPTION_SKILL_NAME || "simulink-module-description-generator",
    expectedOutputPattern: process.env.SOFTWARE_MODULE_DESCRIPTION_EXPECTED_OUTPUT_PATTERN || "outputs/*.docx",
    agentWorkspaceRoot:
      process.env.SOFTWARE_MODULE_DESCRIPTION_AGENT_WORKSPACE_ROOT ||
      process.env.UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT ||
      ""
  },
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
  skillDir: path.join(skillRootDir, "active"),
  skillVersioning: {
    directActiveSkillItemWrites: process.env.SKILL_DIRECT_ACTIVE_WRITES || "allow"
  },
  hermes: {
    transport: process.env.HERMES_TRANSPORT || "cli",
    host: process.env.HERMES_HOST || "127.0.0.1",
    port: Number(process.env.HERMES_PORT || 3101),
    baseURL: process.env.HERMES_BASE_URL || `http://127.0.0.1:${Number(process.env.HERMES_PORT || 3101)}`,
    apiMode: process.env.HERMES_API_MODE || "json",
    authToken: process.env.HERMES_AUTH_TOKEN || "",
    command: process.env.HERMES_COMMAND || "hermes",
    profile: hermesProfile,
    homeDir: hermesHomeDir,
    stateDbPath: resolveHermesStateDbPath(),
    workdir: process.env.HERMES_WORKDIR || rootDir,
    uploadTempDir: process.env.HERMES_UPLOAD_TMPDIR || path.join(os.tmpdir(), "software-doc-hermes-agent"),
    maxUploadBytes: Number(process.env.HERMES_MAX_UPLOAD_BYTES || 250 * 1024 * 1024),
    timeoutMs: Number(process.env.HERMES_TIMEOUT_MS || 120000),
    serverRequestTimeoutMs: Number(process.env.HERMES_SERVER_REQUEST_TIMEOUT_MS || 0),
    stepTimeoutMs: {
      anchor_index_build: Number(process.env.HERMES_TIMEOUT_ANCHOR_INDEX_BUILD_MS || 180000),
      outline_build: Number(process.env.HERMES_TIMEOUT_OUTLINE_BUILD_MS || 180000),
      module_bootstrap_generate: Number(process.env.HERMES_TIMEOUT_MODULE_BOOTSTRAP_GENERATE_MS || 600000),
      content_generate: Number(process.env.HERMES_TIMEOUT_CONTENT_GENERATE_MS || 1200000),
      software_requirement_markdown_generate: Number(process.env.HERMES_TIMEOUT_SOFTWARE_REQUIREMENT_MARKDOWN_GENERATE_MS || 600000),
      document_extract_generate: Number(process.env.HERMES_TIMEOUT_DOCUMENT_EXTRACT_GENERATE_MS || 240000),
      slx_interpret_answer: Number(process.env.HERMES_TIMEOUT_SLX_INTERPRET_ANSWER_MS || 600000),
      simulink_ut_tcsd_generate: Number(process.env.HERMES_TIMEOUT_SIMULINK_UT_TCSD_GENERATE_MS || 7200000),
      simulink_module_description_generate: Number(
        process.env.HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS || 3600000
      ),
      replay_proposal_generate: Number(process.env.HERMES_TIMEOUT_REPLAY_PROPOSAL_GENERATE_MS || 600000)
    },
    heartbeatIntervalMs: Number(process.env.HERMES_HEARTBEAT_INTERVAL_MS || 5000),
    taskConcurrency: Number(process.env.HERMES_TASK_CONCURRENCY || 1),
    maxTurns: Number(process.env.HERMES_MAX_TURNS || 40),
    stepMaxTurns: {
      simulink_ut_tcsd_generate: process.env.HERMES_MAX_TURNS_SIMULINK_UT_TCSD_GENERATE
        ? Number(process.env.HERMES_MAX_TURNS_SIMULINK_UT_TCSD_GENERATE)
        : 10000,
      simulink_module_description_generate: process.env.HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE
        ? Number(process.env.HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE)
        : 10000
    },
    maxRecalledAtoms: Number(process.env.HERMES_MAX_RECALLED_ATOMS || 24),
    maxOutlineSections: Number(process.env.HERMES_MAX_OUTLINE_SECTIONS || 6),
    maxEvidenceForGeneration: Number(process.env.HERMES_MAX_EVIDENCE_FOR_GENERATION || 40),
    maxAnchorsForGeneration: Number(process.env.HERMES_MAX_ANCHORS_FOR_GENERATION || 80),
    maxModelRequirementFacts: Number(process.env.HERMES_MAX_MODEL_REQUIREMENT_FACTS || 100),
    maxModelRequirementBytes: Number(process.env.HERMES_MAX_MODEL_REQUIREMENT_BYTES || 48000)
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.ZHIPU_API_KEY || process.env.ARK_API_KEY || "",
    model: process.env.OPENAI_MODEL || process.env.ZHIPU_MODEL || process.env.ARK_MODEL || "gpt-4.1-mini",
    baseURL: process.env.OPENAI_BASE_URL || process.env.ZHIPU_BASE_URL || process.env.ARK_BASE_URL || undefined
  },
  matlabMcp: {
    analysisBackend: String(process.env.SLX_ANALYSIS_BACKEND || "satk").trim().toLowerCase(),
    simulinkAgenticToolkitRoot:
      process.env.SIMULINK_AGENTIC_TOOLKIT_ROOT || path.join(homeDir, ".matlab", "agentic-toolkits", "simulink"),
    simulinkAgenticToolkitVersion: readOptionalText(
      path.join(process.env.SIMULINK_AGENTIC_TOOLKIT_ROOT || path.join(homeDir, ".matlab", "agentic-toolkits", "simulink"), "VERSION")
    ),
    transport: process.env.MATLAB_MCP_TRANSPORT || "stdio",
    baseURL: process.env.MATLAB_MCP_BASE_URL || "http://127.0.0.1:5100",
    httpMode: process.env.MATLAB_MCP_HTTP_MODE || "path",
    authToken: process.env.MATLAB_MCP_AUTH_TOKEN || "",
    timeoutMs: Number(process.env.MATLAB_MCP_TIMEOUT_MS || 300000),
    tempDir: process.env.MATLAB_MCP_TMPDIR || "/tmp",
    serverCommand:
      process.env.MATLAB_MCP_SERVER_COMMAND ||
      firstExistingPath([
        path.join(homeDir, ".matlab", "agentic-toolkits", "bin", process.platform === "win32" ? "matlab-mcp-core-server.exe" : "matlab-mcp-core-server"),
        path.join(rootDir, "tools", process.platform === "win32" ? "matlab-mcp-core-server.exe" : "matlab-mcp-core-server")
      ]),
    serverArgs: buildMatlabMcpServerArgs()
  }
};

function buildMatlabMcpServerArgs() {
  if (process.env.MATLAB_MCP_SERVER_ARGS_JSON) {
    try {
      const parsed = JSON.parse(process.env.MATLAB_MCP_SERVER_ARGS_JSON);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall back to the derived args below
    }
  }

  const analysisBackend = String(process.env.SLX_ANALYSIS_BACKEND || "satk").trim().toLowerCase();
  if (analysisBackend === "legacy") {
    return [
      "--matlab-root=" + (process.env.MATLAB_ROOT || deriveMatlabRoot(process.env.MATLAB_EXECUTABLE || "")),
      "--matlab-display-mode=nodesktop",
      "--extension-file=" + path.join(rootDir, "tools", "matlab-mcp-extension.json"),
      "--initial-working-folder=" + path.join(rootDir, "tools", "matlab-functions")
    ];
  }

  const toolkitRoot = process.env.SIMULINK_AGENTIC_TOOLKIT_ROOT || path.join(homeDir, ".matlab", "agentic-toolkits", "simulink");
  return [
    "--matlab-session-mode=existing",
    "--extension-file=" + (process.env.SIMULINK_AGENTIC_TOOLKIT_TOOLS_FILE || path.join(toolkitRoot, "tools", "tools.json"))
  ];
}

function deriveMatlabRoot(matlabExecutable = "") {
  const executable = String(matlabExecutable || "").trim();
  if (!executable) {
    return process.platform === "win32" ? "C:\\Program Files\\MATLAB\\R2025b" : "/Applications/MATLAB_R2026a.app";
  }
  const binDir = path.dirname(executable);
  return path.basename(binDir).toLowerCase() === "bin" ? path.dirname(binDir) : binDir;
}

function firstExistingPath(paths = []) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || paths[paths.length - 1] || "";
}

function readOptionalText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}
