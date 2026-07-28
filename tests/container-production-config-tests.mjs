import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateTrivyPolicy,
  summarizeTrivyReport
} from "../scripts/container-scan-policy.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const digest = "1".repeat(64);

for (const required of [
  "compose.windows-docker-desktop.yaml",
  "compose.linux-prod.yaml",
  ".env.windows-docker-desktop.example",
  ".env.linux-container-prod.example",
  "scripts/container-production.mjs",
  "scripts/build-container-release.mjs"
]) {
  assert.ok(fs.existsSync(path.join(rootDir, required)), `${required} must exist`);
}

const windowsCompose = read("compose.windows-docker-desktop.yaml");
const linuxCompose = read("compose.linux-prod.yaml");
const releaseBuilder = read("scripts/build-container-release.mjs");
assert.match(windowsCompose, /APP_ENV:\s*production/);
assert.match(windowsCompose, /APP_RUNTIME_ROLE:\s*hermes-agent/);
assert.match(windowsCompose, /host\.docker\.internal:5100/);
assert.match(windowsCompose, /SDG_PROJECT_ADDONS_DIR/);
assert.match(windowsCompose, /read_only:\s*true/);
assert.match(windowsCompose, /no-new-privileges:true/);
assert.match(windowsCompose, /pull_policy:\s*never/);
assert.doesNotMatch(windowsCompose, /^\s+build:/m);
assert.doesNotMatch(windowsCompose, /^\s+platform:\n/m);

assert.match(linuxCompose, /APP_ENV:\s*production/);
assert.match(linuxCompose, /APP_RUNTIME_ROLE:\s*platform/);
assert.match(linuxCompose, /HERMES_API_MODE:\s*upload/);
assert.match(linuxCompose, /UNIT_TEST_WORKER_PROFILES_JSON/);
assert.match(linuxCompose, /read_only:\s*true/);
assert.match(linuxCompose, /no-new-privileges:true/);
assert.match(linuxCompose, /pull_policy:\s*never/);
assert.doesNotMatch(linuxCompose, /^\s+build:/m);
assert.doesNotMatch(
  linuxCompose,
  /DEEPSEEK_API_KEY|GLM_API_KEY|ZHIPU_API_KEY/,
  "Linux platform must not receive Worker inference credentials"
);
assert.match(releaseBuilder, /"archive", "--format=tar"/);
assert.match(releaseBuilder, /requireReleaseScans/);
assert.match(releaseBuilder, /\["syft", "trivy"\]/);
const scanScript = read("scripts/container-scan.mjs");
assert.match(scanScript, /container-license-policy\.json/);
assert.match(scanScript, /vuln,license,secret/);
assert.match(scanScript, /"--exit-code",\s*"0"/);
assert.match(scanScript, /SCAN_OUTPUT_MAX_BYTES/);
assert.match(scanScript, /maxBuffer:\s*SCAN_OUTPUT_MAX_BYTES/);
const licensePolicy = JSON.parse(read("deploy/container-license-policy.json"));
assert.equal(licensePolicy.denyUnknown, false);
assert.deepEqual(licensePolicy.blockingVulnerabilitySeverities, []);
assert.ok(licensePolicy.deniedIdentifiers.includes("AGPL-3.0-only"));
const policyFindings = evaluateTrivyPolicy({
  Results: [{
    Vulnerabilities: [
      { VulnerabilityID: "CVE-HIGH", Severity: "HIGH" },
      { VulnerabilityID: "CVE-LOW", Severity: "LOW" }
    ],
    Secrets: [{ RuleID: "secret-rule" }],
    Licenses: [
      { Name: "LGPL-2.0-or-later", Severity: "UNKNOWN" },
      { Name: "AGPL-3.0-only", Severity: "HIGH" },
      { Name: "MIT", Severity: "LOW" }
    ]
  }]
}, licensePolicy);
assert.deepEqual(
  policyFindings.map((finding) => [finding.kind, finding.id || finding.ruleId || finding.identifier]),
  [
    ["secret", "secret-rule"],
    ["license", "AGPL-3.0-only"]
  ]
);
assert.deepEqual(
  summarizeTrivyReport({
    Results: [{
      Vulnerabilities: [
        { VulnerabilityID: "CVE-HIGH", Severity: "HIGH" },
        { VulnerabilityID: "CVE-CRITICAL", Severity: "CRITICAL" }
      ],
      Secrets: [{ RuleID: "secret-rule" }],
      Licenses: [{ Name: "MIT", Severity: "LOW" }]
    }]
  }),
  {
    highVulnerabilities: 1,
    criticalVulnerabilities: 1,
    secrets: 1,
    licenses: 1
  }
);

for (const envFile of [
  ".env.windows-docker-desktop.example",
  ".env.linux-container-prod.example"
]) {
  assert.doesNotMatch(
    read(envFile),
    /(?:API_KEY|AUTH_TOKEN|PASSWORD|SECRET)[ \t]*=[ \t]*\S+/i,
    `${envFile} cannot contain populated secrets`
  );
}

testConfiguration("windows-worker", windowsEnvironment());
testConfiguration("linux-platform", linuxEnvironment());
testWindowsAddonIdDirectories();
testMutableImageFailsClosed();
console.log("Production container configuration tests passed.");

function testConfiguration(target, envContent) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-prod-config-"));
  try {
    const envFile = path.join(temporaryDirectory, "production.env");
    const fakeDocker = path.join(temporaryDirectory, "docker");
    const callsFile = path.join(temporaryDirectory, "docker-calls.txt");
    fs.writeFileSync(envFile, envContent, "utf8");
    fs.writeFileSync(
      fakeDocker,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${callsFile}"\nexit 0\n`,
      { mode: 0o755 }
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/container-production.mjs", target, "config"],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH || ""}`,
          SDG_PROD_ENV_FILE: envFile
        }
      }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(fs.readFileSync(callsFile, "utf8"), /compose .* config --quiet/);
    for (const secret of ["hermes-secret", "gateway-secret", "deepseek-secret"]) {
      assert.ok(!`${result.stdout}\n${result.stderr}`.includes(secret));
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function testWindowsAddonIdDirectories() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-prod-addons-"));
  try {
    const addonRoot = path.join(temporaryDirectory, "project-addons");
    const envFile = path.join(temporaryDirectory, "production.env");
    const fakeDocker = path.join(temporaryDirectory, "docker");
    fs.mkdirSync(path.join(addonRoot, "01"), { recursive: true });
    fs.mkdirSync(path.join(addonRoot, "02"), { recursive: true });
    fs.writeFileSync(
      envFile,
      windowsEnvironment()
        .replace("SDG_PROJECT_ADDONS_DIR=/tmp/sdg-addons", `SDG_PROJECT_ADDONS_DIR=${addonRoot}`)
        .replace("UNIT_TEST_CASE_DEFAULT_PROJECTS=01_楚能", "UNIT_TEST_CASE_DEFAULT_PROJECTS=01_楚能,02_TMS"),
      "utf8"
    );
    fs.writeFileSync(
      fakeDocker,
      [
        "#!/bin/sh",
        "case \"$*\" in",
        "  \"info --format {{.OSType}}/{{.Architecture}}\") printf '%s\\n' 'linux/amd64' ;;",
        "  \"compose version\") printf '%s\\n' 'Docker Compose version test' ;;",
        "  \"image inspect \"*) printf '%s\\n' '{\"Os\":\"linux\",\"Architecture\":\"amd64\"}' ;;",
        "esac",
        "exit 0",
        ""
      ].join("\n"),
      { mode: 0o755 }
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/container-production.mjs", "windows-worker", "preflight"],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH || ""}`,
          SDG_PROD_ENV_FILE: envFile
        }
      }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /windows-worker production preflight passed/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function testMutableImageFailsClosed() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sdg-prod-mutable-"));
  try {
    const envFile = path.join(temporaryDirectory, "production.env");
    fs.writeFileSync(
      envFile,
      windowsEnvironment().replace(
        `SDG_WORKER_IMAGE=registry.internal/sdg-worker@sha256:${digest}`,
        "SDG_WORKER_IMAGE=sdg-worker:latest"
      ),
      "utf8"
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/container-production.mjs", "windows-worker", "config"],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: { ...process.env, SDG_PROD_ENV_FILE: envFile }
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /immutable repository @sha256 digest or image sha256 ID/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function windowsEnvironment() {
  return [
    `SDG_WORKER_IMAGE=registry.internal/sdg-worker@sha256:${digest}`,
    "SDG_CONTAINER_DATA_DIR=/tmp/sdg-data",
    "SDG_PROJECT_ADDONS_DIR=/tmp/sdg-addons",
    "SDG_WORKER_LOG_DIR=/tmp/sdg-worker-logs",
    "SDG_WORKER_BIND_IP=10.0.0.11",
    "MATLAB_WORKER_HOST=10.0.0.11",
    "HERMES_AGENT_TOKEN=hermes-secret",
    "HERMES_INFERENCE_PROVIDER=deepseek",
    "HERMES_INFERENCE_MODEL=deepseek-v4-pro",
    "DEEPSEEK_API_KEY=deepseek-secret",
    "DEEPSEEK_BASE_URL=https://api.deepseek.com",
    "MATLAB_GATEWAY_TOKEN=gateway-secret",
    "MATLAB_GATEWAY_EVALUATE_TOKEN=evaluate-secret",
    "UNIT_TEST_CASE_DEFAULT_PROJECTS=01_楚能"
  ].join("\n");
}

function linuxEnvironment() {
  return [
    `SDG_PLATFORM_IMAGE=registry.internal/sdg-platform@sha256:${digest}`,
    "SDG_CONTAINER_DATA_DIR=/tmp/sdg-data",
    "SDG_PLATFORM_LOG_DIR=/tmp/sdg-platform-logs",
    "SDG_PLATFORM_BIND_IP=10.0.0.10",
    "HERMES_AGENT_TOKEN=hermes-secret",
    "MATLAB_GATEWAY_TOKEN=gateway-secret",
    "HERMES_BASE_URL=http://10.0.0.11:3101",
    "MATLAB_MCP_BASE_URL=http://10.0.0.11:5100",
    "UNIT_TEST_DEFAULT_WORKER_ID=vm",
    'UNIT_TEST_WORKER_PROFILES_JSON={"workers":[{"id":"vm","label":"VM","hermesBaseURL":"http://10.0.0.11:3101","matlabBaseURL":"http://10.0.0.11:5100"},{"id":"physical","label":"Physical","hermesBaseURL":"http://10.0.0.12:3101","matlabBaseURL":"http://10.0.0.12:5100"}]}'
  ].join("\n");
}
