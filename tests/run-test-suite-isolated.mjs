import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_RUNTIME_ISOLATION_MARKER = "sdg-isolated-test-runtime/v1";
const TEST_RUNTIME_ISOLATION_ENV = "SDG_TEST_RUNTIME_ISOLATION";
const TEST_RUNTIME_ROOT_ENV = "SDG_TEST_RUNTIME_ROOT";
const SAFE_PARENT_ENV_KEYS = new Set([
  "CI",
  "COLORTERM",
  "COMSPEC",
  "HOME",
  "LANG",
  "LANGUAGE",
  "LOGNAME",
  "NO_COLOR",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "SHELL",
  "SYSTEMROOT",
  "TCSD_PIPELINE_PYTHON",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "TZ",
  "USER",
  "USERPROFILE",
  "WINDIR"
]);
const fixturePaths = [
  "data/skill-rules/bundle-base.json",
  "data/skills.sqlite"
];
const sqliteSidecarPaths = [
  "data/skills.sqlite-wal",
  "data/skills.sqlite-shm",
  "data/skills.sqlite-journal"
];
const allProtectedPaths = [...fixturePaths, ...sqliteSidecarPaths];
const selectedSuite = String(
  process.argv.find((argument) => argument.startsWith("--only=")) || ""
).slice("--only=".length);
const suites = [
  {
    id: "core",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/run-tests.js"]
  },
  {
    id: "slx",
    command: process.execPath,
    args: ["tests/slx-parser-tests.js"]
  },
  {
    id: "hermes-upload-relocation",
    command: process.execPath,
    args: ["tests/hermes-upload-relocation-tests.mjs"]
  },
  {
    id: "serial-gate",
    command: process.execPath,
    args: ["tests/serial-gate-tests.mjs"]
  },
  {
    id: "tcsd-job-cancellation",
    command: process.execPath,
    args: ["tests/tcsd-job-cancellation-tests.mjs"]
  },
  {
    id: "matlab-gateway-lease",
    command: process.execPath,
    args: ["tests/matlab-gateway-lease-tests.mjs"]
  },
  {
    id: "software-detail-platform",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-platform-pipeline-tests.mjs"]
  },
  {
    id: "software-detail-ui",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-pipeline-ui-tests.mjs"]
  },
  {
    id: "software-detail-worker-components",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-worker-components-tests.mjs"]
  },
  {
    id: "software-detail-worker-pipeline",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-worker-pipeline-tests.mjs"]
  },
  {
    id: "software-detail-worker-api",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-worker-api-tests.mjs"]
  },
  {
    id: "software-detail-transport-client",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-pipeline-transport-client-tests.mjs"]
  },
  {
    id: "software-detail-transport-regression",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-module-description-transport-regression.mjs"]
  },
  {
    id: "software-detail-full-http",
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "tests/software-detail-full-http-flow-tests.mjs"]
  },
  {
    id: "release-package",
    command: process.execPath,
    args: ["tests/release-rollback-package-tests.mjs"]
  },
  {
    id: "image-archive",
    command: "python3",
    args: ["tests/verify-image-archive-tests.py"]
  },
  {
    id: "tcsd-runtime-python",
    command: "python3",
    args: [
      "-m",
      "unittest",
      "tests.tcsd-runtime.test_coverage_ir",
      "tests.tcsd-runtime.test_pipeline_stage_runner",
      "tests.tcsd-runtime.test_mcdc_quality_loop",
      "tests.tcsd-runtime.test_decision_obligations"
    ]
  },
  {
    id: "rollback",
    command: "sh",
    args: ["tests/rollback-linux-release-tests.sh"]
  }
];

if (selectedSuite && !suites.some((suite) => suite.id === selectedSuite)) {
  throw new Error(
    `Unknown isolated test suite ${selectedSuite}. Expected one of ${suites.map((suite) => suite.id).join(", ")}.`
  );
}

const fixtureSnapshot = await captureProtectedFiles({ requireFixtures: true });
const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sdg-isolated-test-runtime-"));
let suiteFailure = null;
let fixtureFailure = null;

try {
  await prepareIsolatedRuntime(runtimeRoot);
  const isolatedEnvironment = buildIsolatedEnvironment(runtimeRoot);
  assertEnvironmentIsolation(runtimeRoot, isolatedEnvironment);
  const selectedSuites = selectedSuite
    ? suites.filter((suite) => suite.id === selectedSuite)
    : suites;

  printFixtureHashes("before", fixtureSnapshot);
  for (const suite of selectedSuites) {
    const result = spawnSync(suite.command, suite.args, {
      cwd: rootDir,
      env: isolatedEnvironment,
      stdio: "inherit"
    });
    if (result.error) {
      suiteFailure = new Error(
        `Unable to start isolated ${suite.id} test suite: ${result.error.message}`
      );
      break;
    }
    if (result.status !== 0) {
      suiteFailure = new Error(
        `Isolated ${suite.id} test suite failed with exit code ${result.status ?? "unknown"}.`
      );
      break;
    }
  }
} finally {
  try {
    const verification = await verifyAndRestoreProtectedFiles(fixtureSnapshot);
    printFixtureHashes("after", verification.after);
    if (verification.changed.length) {
      fixtureFailure = new Error(
        `Tests modified protected runtime fixtures; original bytes were restored: ${verification.changed.join(", ")}`
      );
    }
  } catch (error) {
    fixtureFailure = error;
  }
  await fs.rm(runtimeRoot, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100
  });
}

if (fixtureFailure) {
  console.error(fixtureFailure.message);
  process.exitCode = 1;
}
if (suiteFailure) {
  console.error(suiteFailure.message);
  process.exitCode = 1;
}
if (!fixtureFailure && !suiteFailure) {
  console.log("Isolated test runtime removed; protected fixture bytes are unchanged.");
}

async function prepareIsolatedRuntime(targetRoot) {
  await Promise.all([
    fs.mkdir(path.join(targetRoot, "data"), { recursive: true }),
    fs.mkdir(path.join(targetRoot, "hermes-home"), { recursive: true }),
    fs.mkdir(path.join(targetRoot, "project-addons"), { recursive: true }),
    fs.mkdir(path.join(targetRoot, "skills"), { recursive: true })
  ]);
  await copyTrackedSkills(targetRoot);
}

async function copyTrackedSkills(targetRoot) {
  const result = spawnSync("git", ["ls-files", "-z", "--", "skills"], {
    cwd: rootDir,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    throw new Error(`Unable to enumerate tracked test skills: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Unable to enumerate tracked test skills: ${String(result.stderr || "").trim()}`
    );
  }

  const trackedSkills = result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const relativePath of trackedSkills) {
    const sourcePath = path.join(rootDir, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
  }
}

function buildIsolatedEnvironment(targetRoot, sourceEnvironment = process.env) {
  const environment = {
    ...filterParentEnvironment(sourceEnvironment),
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_RUNTIME_ROLE: "platform",
    [TEST_RUNTIME_ISOLATION_ENV]: TEST_RUNTIME_ISOLATION_MARKER,
    [TEST_RUNTIME_ROOT_ENV]: targetRoot,
    APP_DATA_DIR: path.join(targetRoot, "data"),
    APP_SKILLS_DIR: path.join(targetRoot, "skills"),
    HERMES_HOME: path.join(targetRoot, "hermes-home"),
    HERMES_UPLOAD_TMPDIR: path.join(targetRoot, "data", "uploads"),
    HERMES_TRANSPORT: "api",
    HERMES_BASE_URL: "http://127.0.0.1:0",
    HERMES_AUTH_TOKEN: "",
    HERMES_AGENT_TOKEN: "",
    HERMES_PROFILE: "default",
    HERMES_INFERENCE_PROVIDER: "isolated-test",
    HERMES_INFERENCE_MODEL: "isolated-test-model",
    UNIT_TEST_CASE_PROJECT_ADDON_ROOT: path.join(targetRoot, "project-addons"),
    UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT: "",
    SOFTWARE_MODULE_DESCRIPTION_AGENT_WORKSPACE_ROOT: "",
    UNIT_TEST_DEFAULT_WORKER_ID: "isolated-test",
    UNIT_TEST_WORKER_PROFILES_JSON: JSON.stringify({
      workers: [
        {
          id: "isolated-test",
          label: "Isolated Test Worker",
          hermesBaseURL: "http://127.0.0.1:0",
          matlabBaseURL: "http://127.0.0.1:0"
        }
      ]
    }),
    MATLAB_MCP_TRANSPORT: "http",
    MATLAB_MCP_BASE_URL: "http://127.0.0.1:0",
    MATLAB_MCP_AUTH_TOKEN: "",
    MATLAB_GATEWAY_TOKEN: "",
    MATLAB_GATEWAY_EVALUATE_TOKEN: "",
    SATK_GATEWAY_URL: "http://127.0.0.1:0",
    OPENAI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    GLM_API_KEY: "",
    ZHIPU_API_KEY: ""
  };
  return environment;
}

function filterParentEnvironment(sourceEnvironment) {
  const filtered = {};
  for (const [key, value] of Object.entries(sourceEnvironment || {})) {
    if (value === undefined || isSensitiveEnvironmentKey(key)) continue;
    const normalizedKey = key.toUpperCase();
    if (SAFE_PARENT_ENV_KEYS.has(normalizedKey) || normalizedKey.startsWith("LC_")) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function isSensitiveEnvironmentKey(key) {
  const normalizedKey = String(key || "").toUpperCase();
  return (
    /(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)/.test(normalizedKey) ||
    /(^|[_-])PAT($|[_-])/.test(normalizedKey)
  );
}

function assertEnvironmentIsolation(targetRoot, environment) {
  const probe = buildIsolatedEnvironment(targetRoot, {
    PATH: environment.PATH || "",
    LANG: environment.LANG || "",
    TCSD_PIPELINE_PYTHON: environment.TCSD_PIPELINE_PYTHON || "",
    EXAMPLE_SECRET_TOKEN: "must-not-reach-test-child"
  });
  if (Object.hasOwn(probe, "EXAMPLE_SECRET_TOKEN")) {
    throw new Error("Sensitive environment filtering allowed EXAMPLE_SECRET_TOKEN into a test child.");
  }

  const nonEmptySensitiveKeys = Object.entries(environment)
    .filter(([key, value]) => isSensitiveEnvironmentKey(key) && value !== "")
    .map(([key]) => key);
  if (nonEmptySensitiveKeys.length) {
    throw new Error(
      `Isolated test child has non-empty sensitive environment keys: ${nonEmptySensitiveKeys.join(", ")}`
    );
  }
  if (
    environment[TEST_RUNTIME_ISOLATION_ENV] !== TEST_RUNTIME_ISOLATION_MARKER ||
    path.resolve(environment[TEST_RUNTIME_ROOT_ENV] || "") !== path.resolve(targetRoot)
  ) {
    throw new Error("Isolated test child marker or runtime root is invalid.");
  }
}

async function captureProtectedFiles(options = {}) {
  const snapshot = new Map();
  for (const relativePath of allProtectedPaths) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      const [bytes, stat] = await Promise.all([
        fs.readFile(absolutePath),
        fs.stat(absolutePath)
      ]);
      snapshot.set(relativePath, {
        exists: true,
        bytes,
        mode: stat.mode,
        sha256: hash(bytes)
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (options.requireFixtures && fixturePaths.includes(relativePath)) {
        throw new Error(`Required protected runtime fixture is missing: ${relativePath}`);
      }
      snapshot.set(relativePath, {
        exists: false,
        bytes: null,
        mode: null,
        sha256: ""
      });
    }
  }
  return snapshot;
}

async function verifyAndRestoreProtectedFiles(before) {
  const after = await captureProtectedFiles();
  const changed = [];

  for (const relativePath of allProtectedPaths) {
    const original = before.get(relativePath);
    const current = after.get(relativePath);
    const unchanged =
      original.exists === current.exists &&
      (!original.exists || original.bytes.equals(current.bytes));
    if (unchanged) continue;

    changed.push(relativePath);
    const absolutePath = path.join(rootDir, relativePath);
    if (!original.exists) {
      await fs.rm(absolutePath, { force: true });
      continue;
    }

    const restorePath = `${absolutePath}.test-restore-${process.pid}`;
    await fs.writeFile(restorePath, original.bytes, { mode: original.mode });
    await fs.rename(restorePath, absolutePath);
    await fs.chmod(absolutePath, original.mode);
  }

  return { after, changed };
}

function printFixtureHashes(label, snapshot) {
  for (const relativePath of fixturePaths) {
    const entry = snapshot.get(relativePath);
    console.log(`Protected fixture ${label}: ${entry.sha256}  ${relativePath}`);
  }
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
