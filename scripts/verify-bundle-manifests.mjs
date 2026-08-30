// Verify every TCSD bundle manifest is complete AND loadable in the current
// filesystem. Runs INSIDE the worker image (Containerfile RUN) so a manifest
// entry whose file was not copied fails the image build instead of failing
// the first pipeline job with ENOENT (review finding P0-1).
//
// Usage: node scripts/verify-bundle-manifests.mjs [skillsDir]

import { createHash } from "node:crypto";
import { statSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  process.argv[2] || "skills/hermes"
);

let failures = 0;
let bundles = 0;
for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("tcsd-")) continue;
  const bundleDir = path.join(skillsDir, entry.name);
  const manifestPath = path.join(bundleDir, "bundle-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    console.error(`FAIL ${entry.name}: bundle-manifest.json missing or unreadable`);
    failures += 1;
    continue;
  }
  if (manifest?.schema !== "tcsd-bundle-manifest/v1" || !Array.isArray(manifest.files)) {
    console.error(`FAIL ${entry.name}: manifest schema invalid`);
    failures += 1;
    continue;
  }
  bundles += 1;
  const hash = createHash("sha256");
  for (const file of manifest.files) {
    const absolute = path.join(bundleDir, file.path);
    try {
      const content = readFileSync(absolute);
      const actualMode = statSync(absolute).mode & 0o777;
      hash.update(file.path);
      hash.update("\0");
      hash.update(content);
      hash.update("\0");
      hash.update(String(file.mode ?? ""));
      hash.update("\0");
      if (file.mode !== undefined && actualMode !== file.mode) {
        console.error(`FAIL ${entry.name}/${file.path}: mode drift (manifest ${file.mode}, actual ${actualMode})`);
        failures += 1;
      }
    } catch (error) {
      console.error(`FAIL ${entry.name}/${file.path}: listed in manifest but not delivered (${error.code || error.message})`);
      failures += 1;
    }
  }
  // Extra files present in the image but NOT listed: deployment drift that a
  // manifest-only hash would silently ignore. Only clearly allowed system
  // noise is exempt.
  const allowed = new Set(["bundle-manifest.json", ".DS_Store"]);
  const listed = new Set(manifest.files.map((file) => file.path));
  const walk = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (allowed.has(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") continue;
        walk(path.join(current, entry.name), relative);
      } else if (!listed.has(relative)) {
        console.error(`FAIL ${entry.name}/${relative}: present in image but missing from manifest`);
        failures += 1;
      }
    }
  };
  walk(bundleDir);
  console.log(`ok ${entry.name}: ${manifest.files.length} files verified`);
}

if (failures > 0) {
  console.error(`${failures} manifest verification failure(s)`);
  process.exitCode = 1;
} else {
  console.log(`all ${bundles} tcsd bundle manifests verified`);
}
