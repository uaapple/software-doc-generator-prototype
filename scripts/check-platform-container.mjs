import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const containerfilePath = path.join(rootDirectory, "docker", "platform.Containerfile");
const entrypointPath = path.join(rootDirectory, "docker", "platform-entrypoint.mjs");
const healthcheckPath = path.join(rootDirectory, "docker", "platform-healthcheck.mjs");

const [containerfile, entrypoint, healthcheck] = await Promise.all([
  readFile(containerfilePath, "utf8"),
  readFile(entrypointPath, "utf8"),
  readFile(healthcheckPath, "utf8")
]);
const containerInstructions = containerfile
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

assert.match(
  containerfile,
  /^ARG NODE_BASE_IMAGE=node:22\.22\.3-bookworm-slim@sha256:[a-f0-9]{64}$/m,
  "platform image must default to the frozen Node 22.22.3 OCI digest"
);
assert.match(
  containerfile,
  /^ARG RUNTIME_PLATFORM=linux\/amd64$/m,
  "platform image must default to the production linux/amd64 target"
);
assert.match(
  containerfile,
  /^FROM --platform=\$\{RUNTIME_PLATFORM\} \$\{NODE_BASE_IMAGE\} AS production-dependencies$/m,
  "dependency stage must accept an immutable base image reference"
);
assert.match(containerfile, /npm ci --omit=dev --ignore-scripts/, "production dependencies must use npm ci");
assert.match(containerfile, /^USER node$/m, "runtime must use the non-root node user");
assert.match(containerfile, /^HEALTHCHECK /m, "runtime must define a health check");
assert.match(containerfile, /^STOPSIGNAL SIGTERM$/m, "runtime must define graceful stop semantics");
assert.doesNotMatch(containerfile, /^\s*COPY\s+(?:--\S+\s+)*\.\s+\./m, "unbounded COPY . . is forbidden");
assert.doesNotMatch(
  containerfile,
  /^\s*COPY[^\n]*\bsrc\s+\.\/src\s*$/m,
  "the platform source dependency closure must be enumerated"
);

const forbiddenContent = [
  ".env",
  "tests",
  "tools",
  "release-dist",
  "skills/hermes",
  "src/hermes-server.js",
  "src/hermes-app.js",
  "src/services/python-command.js",
  "src/services/tcsd-hermes-skill-registry.js",
  "src/services/tcsd-hermes-stage-executor.js",
  "src/services/tcsd-host-semantic-validator.js",
  "src/services/tcsd-stage-catalog.js"
];
for (const forbidden of forbiddenContent) {
  assert(!containerInstructions.includes(forbidden), `platform image must not include ${forbidden}`);
}

assert.match(entrypoint, /startService\("platform", "src\/server\.js"\)/);
assert.match(entrypoint, /startService\("wiki", "src\/wiki-server\.js"\)/);
assert.match(entrypoint, /child\.kill\(signal\)/, "entrypoint must forward shutdown signals");
assert.match(entrypoint, /seedSkillsDirectory/, "entrypoint must initialize the external skill volume");

assert.match(healthcheck, /\/api\/health/, "health check must cover the platform API");
assert.match(healthcheck, /\/health/, "health check must cover the Wiki");
assert.match(healthcheck, /body\?\.ok !== true/, "health check must validate response content");

const copiedSources = parseCopySources(containerInstructions);
const runtimeDependencies = await collectLocalDependencies(["src/server.js", "src/wiki-server.js"]);
for (const dependency of runtimeDependencies) {
  assert(
    copiedSources.some((source) => dependency === source || dependency.startsWith(`${source}/`)),
    `platform runtime dependency is not copied: ${dependency}`
  );
}

console.log("Platform container static checks passed.");

function parseCopySources(source) {
  const logicalLines = source.replaceAll(/\\\r?\n/g, " ").split(/\r?\n/);
  const copied = [];
  for (const line of logicalLines) {
    if (!line.trimStart().startsWith("COPY ")) {
      continue;
    }
    const tokens = line.trim().split(/\s+/).slice(1).filter((token) => !token.startsWith("--"));
    copied.push(...tokens.slice(0, -1));
  }
  return copied;
}

async function collectLocalDependencies(initialFiles) {
  const pending = [...initialFiles];
  const discovered = new Set();
  while (pending.length > 0) {
    const relativeFile = pending.shift();
    if (discovered.has(relativeFile)) {
      continue;
    }
    discovered.add(relativeFile);

    const source = await readFile(path.join(rootDirectory, relativeFile), "utf8");
    const importPattern =
      /(?:import|export)[\s\S]*?from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      let resolved = path.normalize(path.join(path.dirname(relativeFile), specifier));
      if (!path.extname(resolved)) {
        resolved += ".js";
      }
      if (await isFile(path.join(rootDirectory, resolved))) {
        pending.push(resolved);
      }
    }
  }
  return [...discovered].sort();
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
