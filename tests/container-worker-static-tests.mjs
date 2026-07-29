import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const containerfilePath = path.join(root, "containers", "worker", "Containerfile");
const containerfile = await fs.readFile(containerfilePath, "utf8");

assert.doesNotMatch(containerfile, /^\s*COPY\s+\.\s+/m, "Worker image cannot use COPY .");
assert.doesNotMatch(
  containerfile,
  /^\s*COPY\s+skills\/hermes\/tcsd-runtime\/\s+/m,
  "Worker image cannot copy the complete runtime support-package tree"
);
assert.doesNotMatch(
  containerfile,
  /^\s*COPY\s+skills\/hermes\/tcsd-runtime\/assets\/support-package/m,
  "Project support package assets cannot enter the image"
);
assert.match(containerfile, /node:22\.22\.3-bookworm-slim@sha256:[a-f0-9]{64}/);
assert.match(containerfile, /python:3\.11\.9-slim-bookworm@sha256:[a-f0-9]{64}/);
assert.match(containerfile, /HERMES_AGENT_VERSION="0\.18\.2"/);
assert.match(
  containerfile,
  /HERMES_AGENT_WHEEL_SHA256="8f02155cfc84b28bd98551cd18dffec0efa9ec070dd08f90f1a850f1c779492f"/
);
assert.match(containerfile, /USER 10001:10001/);
assert.match(containerfile, /HEALTHCHECK/);
assert.doesNotMatch(containerfile, /^\s*VOLUME\s+/m);
assert.ok(
  containerfile.indexOf("ARG IMAGE_REVISION") > containerfile.indexOf("python -m pip freeze"),
  "image metadata must follow stable Python and Hermes dependency layers"
);
assert.match(containerfile, /COPY containers\/worker\/configure-hermes\.py/);
assert.match(containerfile, /COPY skills\/hermes\/software-detail-runtime\//);
for (let stageNumber = 1; stageNumber <= 9; stageNumber += 1) {
  assert.match(
    containerfile,
    new RegExp(
      `COPY skills/hermes/software-detail-stage-${String(stageNumber).padStart(2, "0")}-`
    )
  );
}
assert.match(
  containerfile,
  /ENTRYPOINT \["\/usr\/bin\/tini", "--", "\/opt\/sdg\/venv\/bin\/python", "\/opt\/sdg\/app\/containers\/worker\/configure-hermes\.py"\]/
);

const output = await fs.mkdtemp(path.join(os.tmpdir(), "worker-source-selection-"));
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, "scripts", "prepare-worker-source.mjs"),
        "--source-root",
        root,
        "--output",
        output,
        "--entries",
        "src/hermes-server.js"
      ],
      { stdio: "inherit" }
    );
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`source selector exited ${code}`))));
  });
  const manifest = JSON.parse(await fs.readFile(path.join(output, "source-manifest.json"), "utf8"));
  assert.ok(manifest.files.includes("src/hermes-server.js"));
  assert.ok(manifest.files.includes("src/hermes-app.js"));
  assert.ok(manifest.files.includes("src/config.js"));
  for (const serviceFile of [
    "src/services/software-detail-hermes-skill-registry.js",
    "src/services/software-detail-hermes-stage-executor.js",
    "src/services/software-detail-matlab-lease-client.js",
    "src/services/software-detail-pipeline-job-service.js",
    "src/services/software-detail-artifact-name.js"
  ]) {
    assert.ok(
      manifest.files.includes(serviceFile),
      `${serviceFile} must be present in the selected Worker source closure`
    );
  }
  assert.ok(!manifest.files.includes("src/server.js"));
  assert.ok(!manifest.files.some((file) => file.startsWith("src/wiki/")));
  assert.ok(!manifest.files.some((file) => file.includes("matlab-worker-server")));
} finally {
  await fs.rm(output, { recursive: true, force: true });
}

console.log("✓ Worker Containerfile security and source-closure checks passed");
