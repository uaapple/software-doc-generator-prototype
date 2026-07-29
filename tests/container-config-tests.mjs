import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

for (const required of [
  ".dockerignore",
  ".env.container.example",
  "compose.yaml",
  "compose.mac.yaml",
  "compose.windows-docker-desktop.yaml",
  "compose.linux-prod.yaml",
  ".env.windows-docker-desktop.example",
  ".env.linux-container-prod.example",
  "scripts/container-dev.mjs",
  "scripts/container-production.mjs",
  "scripts/start-matlab-gateway.mjs",
  "scripts/check-container-secrets.mjs",
  "scripts/container-release-manifest.mjs",
  "scripts/container-scan.mjs"
]) {
  assert.ok(fs.existsSync(path.join(rootDir, required)), `${required} must exist`);
}

const compose = read("compose.yaml");
const composeMac = read("compose.mac.yaml");
const platformContainerfile = read("docker/platform.Containerfile");
const platformEntrypoint = read("docker/platform-entrypoint.mjs");
const workerContainerfile = read("containers/worker/Containerfile");
const matlabWorkerServer = read("src/matlab-worker-server.js");
const containerDevScript = read("scripts/container-dev.mjs");
const gatewayLauncher = read("scripts/start-matlab-gateway.mjs");
const packageConfig = JSON.parse(read("package.json"));
const platformClosureCheckCommand = "node scripts/check-platform-container.mjs";
const containerConfigTestScript = packageConfig.scripts["test:container-config"];
assert.match(compose, /platform:\s*linux\/amd64/);
assert.match(compose, /host\.docker\.internal:5100/);
assert.match(compose, /read_only:\s*true/);
assert.doesNotMatch(compose, /MATLAB_ROOT|SATK_MATLAB_ROOT/);

const platformService = compose.match(
  /^  platform:\n([\s\S]*?)(?=^  [A-Za-z0-9_-]+:\n|^volumes:\n)/m
)?.[0] || "";
const workerService = compose.match(
  /^  worker:\n([\s\S]*?)(?=^  [A-Za-z0-9_-]+:\n|^volumes:\n)/m
)?.[0] || "";
assert.ok(platformService, "compose must define the platform service");
assert.ok(workerService, "compose must define the worker service");
assert.match(
  platformService,
  /<<:\s*\*runtime-defaults/,
  "platform must inherit the read-only runtime defaults"
);
const platformSkillsDirectory = platformService.match(
  /^\s+APP_SKILLS_DIR:\s*(\S+)\s*$/m
)?.[1];
const platformSkillsVolumeTarget = platformService.match(
  /source:\s*platform-skills\s*\n\s*target:\s*(\S+)\s*$/m
)?.[1];
assert.equal(
  platformSkillsDirectory,
  platformSkillsVolumeTarget,
  "platform APP_SKILLS_DIR must match the writable platform-skills volume target"
);
assert.equal(platformSkillsDirectory, "/var/lib/sdg/skills");
assert.match(platformContainerfile, /^USER node$/m, "platform must run as a non-root user");
for (const dependency of [
  "src/services/software-detail-pipeline-contract.js",
  "src/services/software-detail-stage-catalog.js"
]) {
  assert.ok(
    platformContainerfile.includes(dependency),
    `platform image must include ${dependency}`
  );
}
assert.equal(
  containerConfigTestScript.split(platformClosureCheckCommand).length - 1,
  1,
  "container config tests must run the platform dependency-closure check once"
);
assert.ok(
  containerConfigTestScript.indexOf(platformClosureCheckCommand) <
    containerConfigTestScript.indexOf("node tests/container-config-tests.mjs"),
  "platform dependency-closure check must run before container configuration tests"
);
assert.match(
  workerContainerfile,
  /COPY public\/skill-kind-matrix\.js \.\/public\/skill-kind-matrix\.js/,
  "worker source-selection stage must include its explicit public module dependency"
);
assert.match(
  workerContainerfile,
  /COPY --from=source-selection \/selected\/public \.\/public/,
  "worker runtime must include selected public module dependencies"
);
assert.match(
  workerContainerfile,
  /RUN mkdir -p \/var\/lib\/sdg\/tmp &&\s*\\\s*\n\s*apt-get update/,
  "worker must create its configured TMPDIR before package installation"
);
assert.match(
  platformEntrypoint,
  /fsConstants\.R_OK\s*\|\s*fsConstants\.W_OK/,
  "platform entrypoint must require the mounted skills directory to be writable"
);
assert.match(matlabWorkerServer, /MATLAB_WORKER_HOST\s*\|\|\s*"127\.0\.0\.1"/);
assert.match(matlabWorkerServer, /requireAuthToken:\s*process\.env\.NODE_ENV\s*!==\s*"test"/);
assert.match(gatewayLauncher, /\/Applications\/MATLAB_R2026a\.app/);
assert.match(gatewayLauncher, /C:\\\\Program Files\\\\MATLAB\\\\R2025b/);
assert.match(gatewayLauncher, /values\.MATLAB_WORKER_HOST/);
assert.match(gatewayLauncher, /values\.MATLAB_WORKER_PORT/);
assert.match(gatewayLauncher, /MATLAB_ROOT:\s*matlabRoot/);
assert.match(gatewayLauncher, /SATK_MATLAB_ROOT:\s*matlabRoot/);
assert.match(gatewayLauncher, /SATK_MATLAB_SESSION_MODE:\s*"new"/);

for (const token of [
  "HERMES_AGENT_TOKEN",
  "MATLAB_GATEWAY_TOKEN",
  "MATLAB_GATEWAY_EVALUATE_TOKEN"
]) {
  assert.match(
    compose,
    new RegExp(`\\$\\{${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\?`),
    `${token} must be required by Compose interpolation`
  );
}
assert.doesNotMatch(composeMac, /^\s*-\s*\$\{SDG_(?:WORKER|PLATFORM)_PORT/m);
assert.match(composeMac, /127\.0\.0\.1:\$\{SDG_WORKER_PORT:-3101\}:3101/);
assert.match(composeMac, /127\.0\.0\.1:\$\{SDG_PLATFORM_PORT:-3000\}:3000/);

const permissionsInit = compose.match(
  /^  permissions-init:\n([\s\S]*?)(?=^  [A-Za-z0-9_-]+:\n)/m
)?.[0] || "";
for (const mount of [
  "/state/data",
  "/state/logs/platform",
  "/state/logs/worker",
  "/state/hermes-home",
  "/state/platform-skills",
  "/state/platform-home"
]) {
  assert.ok(permissionsInit.includes(mount), `permissions-init must prepare ${mount}`);
}
assert.match(permissionsInit, /chmod 2770/);
assert.doesNotMatch(permissionsInit, /chmod\s+777/);
assert.doesNotMatch(
  permissionsInit,
  /(?<!\$)\$directory/,
  "Compose shell variables must be escaped as $$directory"
);
assert.match(containerDevScript, /verifyWritableMounts/);
assert.match(containerDevScript, /verifyWorkerGatewayReachability/);
assert.match(containerDevScript, /"config", "--quiet"/);
assert.match(workerService, /HERMES_INFERENCE_PROVIDER:/);
assert.match(workerService, /HERMES_INFERENCE_MODEL:/);
assert.match(workerService, /DEEPSEEK_API_KEY:/);
assert.match(workerService, /DEEPSEEK_BASE_URL:/);
assert.match(workerService, /GLM_API_KEY:/);
assert.match(workerService, /GLM_BASE_URL:/);
assert.doesNotMatch(platformService, /DEEPSEEK_API_KEY|DEEPSEEK_BASE_URL|GLM_API_KEY|GLM_BASE_URL/);
assert.doesNotMatch(platformService, /HERMES_INFERENCE_PROVIDER|HERMES_INFERENCE_MODEL/);

const hermesApp = read("src/hermes-app.js");
const hermesClient = read("src/services/hermes-agent-client.js");
assert.match(hermesApp, /\/internal\/tcsd-pipeline\/jobs-upload/);
assert.match(hermesApp, /attachUnitTestCaseOutputFiles/);
assert.match(hermesClient, /materializeTcsdPipelineArtifacts/);
assert.match(hermesClient, /\/internal\/tcsd-pipeline\/jobs-upload/);

const envExample = read(".env.container.example");
assert.doesNotMatch(envExample, /(?:API_KEY|AUTH_TOKEN|PASSWORD|SECRET)[ \t]*=[ \t]*\S+/);
assert.match(envExample, /^HERMES_INFERENCE_PROVIDER=deepseek$/m);
assert.match(envExample, /^HERMES_INFERENCE_MODEL=deepseek-v4-pro$/m);
assert.match(envExample, /^DEEPSEEK_BASE_URL=https:\/\/api\.deepseek\.com$/m);

const boundaryCheck = spawnSync(process.execPath, ["scripts/check-container-boundaries.mjs"], {
  cwd: rootDir,
  encoding: "utf8"
});
assert.equal(boundaryCheck.status, 0, `${boundaryCheck.stdout}\n${boundaryCheck.stderr}`);

const secretCheck = spawnSync(process.execPath, ["scripts/check-container-secrets.mjs"], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env
});
assert.equal(secretCheck.status, 0, `${secretCheck.stdout}\n${secretCheck.stderr}`);

const safeSecretCheck = spawnSync(
  process.execPath,
  [
    "scripts/check-container-secrets.mjs",
    "--files",
    ".env.container.example,compose.yaml,compose.mac.yaml"
  ],
  { cwd: rootDir, encoding: "utf8" }
);
assert.equal(safeSecretCheck.status, 0, `${safeSecretCheck.stdout}\n${safeSecretCheck.stderr}`);

const emptyPreflight = spawnSync(process.execPath, ["scripts/container-dev.mjs", "config"], {
  cwd: rootDir,
  encoding: "utf8",
  env: { ...process.env, SDG_CONTAINER_ENV_FILE: ".env.container.example" }
});
assert.notEqual(emptyPreflight.status, 0);
assert.match(emptyPreflight.stderr, /HERMES_AGENT_TOKEN/);
assert.match(emptyPreflight.stderr, /MATLAB_GATEWAY_TOKEN/);
assert.match(emptyPreflight.stderr, /DEEPSEEK_API_KEY/);

testProviderPreflightFailsClosed();
testHermesProviderComposeMapping();
testMacWorkerProfileConfiguration();
testWorkerProfileModeCompatibility();
testQuietConfigDoesNotExposeSecrets();

console.log("Container configuration tests passed.");

function testProviderPreflightFailsClosed() {
  assertPreflightFailure(
    [
      "HERMES_INFERENCE_PROVIDER=deepseek",
      "HERMES_INFERENCE_MODEL=deepseek-v4-pro",
      "DEEPSEEK_BASE_URL=https://api.deepseek.com"
    ],
    /DEEPSEEK_API_KEY/
  );
  assertPreflightFailure(
    [
      "HERMES_INFERENCE_PROVIDER=deepseek",
      "DEEPSEEK_API_KEY=deepseek-test-placeholder",
      "DEEPSEEK_BASE_URL=https://api.deepseek.com"
    ],
    /HERMES_INFERENCE_MODEL/
  );
  assertPreflightFailure(
    [
      "HERMES_INFERENCE_PROVIDER=zai",
      "HERMES_INFERENCE_MODEL=glm-compatibility-model",
      "ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4"
    ],
    /GLM_API_KEY or ZAI_API_KEY or Z_AI_API_KEY or ZHIPU_API_KEY/
  );
}

function assertPreflightFailure(providerLines, expectedError) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-provider-preflight-"));
  const envFile = path.join(temporaryDirectory, "container.env");
  try {
    fs.writeFileSync(
      envFile,
      [
        ...providerLines,
        "HERMES_AGENT_TOKEN=hermes-test-placeholder",
        "MATLAB_GATEWAY_TOKEN=gateway-test-placeholder",
        "MATLAB_GATEWAY_EVALUATE_TOKEN=evaluate-test-placeholder"
      ].join("\n"),
      "utf8"
    );
    const childEnv = withoutHermesProviderEnvironment(process.env);
    childEnv.SDG_CONTAINER_ENV_FILE = envFile;
    const result = spawnSync(process.execPath, ["scripts/container-dev.mjs", "config"], {
      cwd: rootDir,
      encoding: "utf8",
      env: childEnv
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function testQuietConfigDoesNotExposeSecrets() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-container-config-"));
  const fakeDocker = path.join(temporaryDirectory, "docker");
  const dockerCalls = path.join(temporaryDirectory, "docker-calls.txt");
  const envFile = path.join(temporaryDirectory, "container.env");
  const matlabRoot = path.join(temporaryDirectory, "MATLAB_R2026a.app");
  const fakeMcpServer = path.join(temporaryDirectory, "fake-matlab-mcp.mjs");
  const fakeMcpEnvironment = path.join(temporaryDirectory, "fake-mcp-environment.json");
  const launcherTmpRoot = fs.mkdtempSync("/tmp/sdg-launcher-test-");
  const sentinels = [
    "openai-secret-sentinel",
    "zhipu-secret-sentinel",
    "deepseek-secret-sentinel",
    "hermes-secret-sentinel",
    "gateway-secret-sentinel",
    "evaluate-secret-sentinel"
  ];
  try {
    fs.mkdirSync(matlabRoot);
    fs.writeFileSync(
      fakeMcpServer,
      [
        "import fs from 'node:fs';",
        "import readline from 'node:readline';",
        "fs.writeFileSync(process.env.FAKE_MCP_ENV_FILE, JSON.stringify({ TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP }));",
        "readline.createInterface({ input: process.stdin }).on('line', (line) => {",
        "  const message = JSON.parse(line);",
        "  if (message.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } }) + '\\n');",
        "  if (message.method === 'tools/call') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { isError: false, content: [{ type: 'text', text: 'ok' }] } }) + '\\n');",
        "});"
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(
      fakeDocker,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${dockerCalls}"\nexit 0\n`,
      { mode: 0o755 }
    );
    fs.writeFileSync(
      envFile,
      [
        `OPENAI_API_KEY=${sentinels[0]}`,
        `ZHIPU_API_KEY=${sentinels[1]}`,
        "HERMES_INFERENCE_PROVIDER=deepseek",
        "HERMES_INFERENCE_MODEL=deepseek-v4-pro",
        `DEEPSEEK_API_KEY=${sentinels[2]}`,
        "DEEPSEEK_BASE_URL=https://api.deepseek.com",
        `HERMES_AGENT_TOKEN=${sentinels[3]}`,
        `MATLAB_GATEWAY_TOKEN=${sentinels[4]}`,
        `MATLAB_GATEWAY_EVALUATE_TOKEN=${sentinels[5]}`,
        `SDG_CONTAINER_DATA_DIR=${path.join(temporaryDirectory, "data")}`,
        `SDG_PROJECT_ADDONS_DIR=${path.join(temporaryDirectory, "addons")}`,
        `SDG_PLATFORM_LOG_DIR=${path.join(temporaryDirectory, "platform-logs")}`,
        `SDG_WORKER_LOG_DIR=${path.join(temporaryDirectory, "worker-logs")}`,
        `MATLAB_GATEWAY_STATE_DIR=${path.join(temporaryDirectory, "gateway-state")}`
      ].join("\n"),
      "utf8"
    );
    const result = spawnSync(process.execPath, ["scripts/container-dev.mjs", "config"], {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH || ""}`,
        SDG_CONTAINER_ENV_FILE: envFile,
        MATLAB_ROOT: matlabRoot
      }
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    for (const sentinel of sentinels) assert.ok(!combinedOutput.includes(sentinel));
    assert.match(fs.readFileSync(dockerCalls, "utf8"), /compose .* config --quiet/);

    const gatewayCheck = spawnSync(
      process.execPath,
      ["scripts/start-matlab-gateway.mjs", "--check"],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          SDG_CONTAINER_ENV_FILE: envFile,
          MATLAB_ROOT: matlabRoot,
          SATK_MATLAB_ROOT: path.join(temporaryDirectory, "must-not-be-used"),
          TMPDIR: launcherTmpRoot,
          MATLAB_MCP_TMPDIR: "",
          MATLAB_MCP_SERVER_COMMAND: process.execPath,
          MATLAB_MCP_SERVER_ARGS_JSON: JSON.stringify([fakeMcpServer]),
          FAKE_MCP_ENV_FILE: fakeMcpEnvironment
        }
      }
    );
    assert.equal(gatewayCheck.status, 0, `${gatewayCheck.stdout}\n${gatewayCheck.stderr}`);
    const gatewayOutput = `${gatewayCheck.stdout}\n${gatewayCheck.stderr}`;
    for (const sentinel of sentinels) assert.ok(!gatewayOutput.includes(sentinel));
    assert.equal(
      fs.statSync(path.join(temporaryDirectory, "gateway-state")).mode & 0o777,
      0o700
    );
    const mcpEnvironment = JSON.parse(fs.readFileSync(fakeMcpEnvironment, "utf8"));
    const expectedMcpTemp = path.join(launcherTmpRoot, "sdg-mcp");
    assert.equal(mcpEnvironment.TMPDIR, expectedMcpTemp);
    assert.equal(mcpEnvironment.TMP, expectedMcpTemp);
    assert.equal(mcpEnvironment.TEMP, expectedMcpTemp);
    assert.ok(Buffer.byteLength(expectedMcpTemp, "utf8") <= 80);
    assert.ok(!expectedMcpTemp.startsWith(rootDir));
    assert.ok(!expectedMcpTemp.includes("matlab-gateway-state"));
    assert.equal(fs.statSync(expectedMcpTemp).mode & 0o777, 0o700);

    const missingMatlabRoot = spawnSync(
      process.execPath,
      ["scripts/start-matlab-gateway.mjs", "--check"],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          SDG_CONTAINER_ENV_FILE: envFile,
          MATLAB_ROOT: path.join(temporaryDirectory, "missing-matlab")
        }
      }
    );
    assert.notEqual(missingMatlabRoot.status, 0);
    assert.match(missingMatlabRoot.stderr, /Configured MATLAB_ROOT does not exist/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    fs.rmSync(launcherTmpRoot, { recursive: true, force: true });
  }
}

function testHermesProviderComposeMapping() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-provider-config-"));
  try {
    const deepseek = renderComposeConfig(
      temporaryDirectory,
      "deepseek.env",
      [
        "HERMES_INFERENCE_PROVIDER=deepseek",
        "HERMES_INFERENCE_MODEL=deepseek-v4-pro",
        "DEEPSEEK_API_KEY=deepseek-test-placeholder",
        "DEEPSEEK_BASE_URL=https://api.deepseek.com"
      ]
    );
    assert.equal(deepseek.services.worker.environment.HERMES_INFERENCE_PROVIDER, "deepseek");
    assert.equal(deepseek.services.worker.environment.HERMES_INFERENCE_MODEL, "deepseek-v4-pro");
    assert.equal(deepseek.services.worker.environment.DEEPSEEK_API_KEY, "deepseek-test-placeholder");
    assert.equal(
      deepseek.services.worker.environment.DEEPSEEK_BASE_URL,
      "https://api.deepseek.com"
    );
    assert.ok(!Object.hasOwn(deepseek.services.platform.environment, "DEEPSEEK_API_KEY"));
    assert.ok(!Object.hasOwn(deepseek.services.platform.environment, "GLM_API_KEY"));

    const zai = renderComposeConfig(
      temporaryDirectory,
      "zai.env",
      [
        "HERMES_INFERENCE_PROVIDER=zai",
        "HERMES_INFERENCE_MODEL=",
        "ZHIPU_MODEL=glm-compatibility-model",
        "ZHIPU_API_KEY=zai-test-placeholder",
        "ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4"
      ]
    );
    assert.equal(zai.services.worker.environment.HERMES_INFERENCE_PROVIDER, "zai");
    assert.equal(zai.services.worker.environment.HERMES_INFERENCE_MODEL, "glm-compatibility-model");
    assert.equal(zai.services.worker.environment.GLM_API_KEY, "zai-test-placeholder");
    assert.equal(
      zai.services.worker.environment.GLM_BASE_URL,
      "https://open.bigmodel.cn/api/paas/v4"
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function renderComposeConfig(temporaryDirectory, fileName, providerLines) {
  const envFile = path.join(temporaryDirectory, fileName);
  fs.writeFileSync(
    envFile,
    [
      ...providerLines,
      "HERMES_AGENT_TOKEN=hermes-test-placeholder",
      "MATLAB_GATEWAY_TOKEN=gateway-test-placeholder",
      "MATLAB_GATEWAY_EVALUATE_TOKEN=evaluate-test-placeholder"
    ].join("\n"),
    "utf8"
  );
  const childEnv = withoutHermesProviderEnvironment(process.env);
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      envFile,
      "--file",
      path.join(rootDir, "compose.yaml"),
      "--file",
      path.join(rootDir, "compose.mac.yaml"),
      "config",
      "--format",
      "json"
    ],
    { cwd: rootDir, encoding: "utf8", env: childEnv }
  );
  assert.equal(result.status, 0, "docker compose config must render the provider mapping");
  return JSON.parse(result.stdout);
}

function testMacWorkerProfileConfiguration() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-mac-worker-profile-"));
  try {
    const rendered = renderComposeConfig(
      temporaryDirectory,
      "mac-worker-profile.env",
      [
        "HERMES_INFERENCE_PROVIDER=deepseek",
        "HERMES_INFERENCE_MODEL=deepseek-v4-pro",
        "DEEPSEEK_API_KEY=deepseek-test-placeholder",
        "DEEPSEEK_BASE_URL=https://api.deepseek.com"
      ]
    );
    const platformEnvironment = rendered.services.platform.environment;
    const profileDocument = JSON.parse(platformEnvironment.UNIT_TEST_WORKER_PROFILES_JSON);
    assert.deepEqual(profileDocument.workers, [
      {
        id: "mac-container",
        label: "Mac Container Worker",
        hermesTransport: "api",
        hermesBaseURL: "http://worker:3101",
        hermesApiMode: "upload",
        hermesAuthTokenEnv: "HERMES_AUTH_TOKEN",
        matlabBaseURL: "http://host.docker.internal:5100",
        matlabHttpMode: "gateway",
        matlabAuthTokenEnv: "MATLAB_MCP_AUTH_TOKEN"
      }
    ]);
    assert.equal(platformEnvironment.HERMES_AUTH_TOKEN, "hermes-test-placeholder");
    assert.equal(platformEnvironment.MATLAB_MCP_AUTH_TOKEN, "gateway-test-placeholder");
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function testWorkerProfileModeCompatibility() {
  const childScript = [
    'import assert from "node:assert/strict";',
    'import { config } from "./src/config.js";',
    "const [upload, legacy] = config.unitTestCase.workerProfiles;",
    'assert.equal(upload.hermesTransport, "api");',
    'assert.equal(upload.hermesApiMode, "upload");',
    'assert.equal(upload.hermesAuthToken, "profile-test-hermes");',
    'assert.equal(upload.matlabHttpMode, "gateway");',
    'assert.equal(upload.matlabAuthToken, "profile-test-matlab");',
    'assert.equal(legacy.hermesApiMode, "json");',
    'assert.equal(legacy.matlabHttpMode, "path");'
  ].join("\n");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", childScript],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HERMES_AUTH_TOKEN: "profile-test-hermes",
        HERMES_API_MODE: "json",
        MATLAB_MCP_AUTH_TOKEN: "profile-test-matlab",
        MATLAB_MCP_HTTP_MODE: "path",
        UNIT_TEST_DEFAULT_WORKER_ID: "upload",
        UNIT_TEST_WORKER_PROFILES_JSON: JSON.stringify({
          workers: [
            {
              id: "upload",
              hermesTransport: "api",
              hermesBaseURL: "http://worker.invalid",
              hermesApiMode: "upload",
              hermesAuthTokenEnv: "HERMES_AUTH_TOKEN",
              matlabBaseURL: "http://gateway.invalid",
              matlabHttpMode: "gateway",
              matlabAuthTokenEnv: "MATLAB_MCP_AUTH_TOKEN"
            },
            {
              id: "legacy",
              hermesBaseURL: "http://legacy-worker.invalid",
              matlabBaseURL: "http://legacy-matlab.invalid"
            }
          ]
        })
      }
    }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function withoutHermesProviderEnvironment(source) {
  const childEnv = { ...source };
  for (const key of [
    "HERMES_INFERENCE_PROVIDER",
    "HERMES_INFERENCE_MODEL",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "GLM_API_KEY",
    "GLM_BASE_URL",
    "ZAI_API_KEY",
    "Z_AI_API_KEY",
    "ZHIPU_API_KEY",
    "ZHIPU_MODEL",
    "ZHIPU_BASE_URL"
  ]) {
    delete childEnv[key];
  }
  return childEnv;
}
