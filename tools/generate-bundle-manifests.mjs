// Generate tcsd-bundle-manifest.json for every skill/runtime bundle under
// skills/hermes/. Manifest-driven hashing makes production bundle hashes
// reproducible: stray files in a build context (macOS .DS_Store, editor
// droppings, __pycache__) can no longer shift the hash of a deployed bundle
// (the bbc72245 hash-drift blind spot). CI re-runs this and the guardrail
// test asserts manifests match the tree.
//
// Usage: node tools/generate-bundle-manifests.mjs [--check]
//   --check  verify existing manifests instead of rewriting them (CI mode)

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hermesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "hermes");
// Scope: manifest-driven hashing is a TCSD pipeline contract. The
// software-detail bundles use their own independent traversal hash
// (hashSoftwareDetailBundle) — a manifest file there would POLLUTE that hash
// instead of governing it.
const BUNDLE_PREFIX = "tcsd-";
const IGNORED = new Set(["bundle-manifest.json", ".DS_Store"]);
const IGNORED_DIRECTORIES = new Set(["__pycache__", ".DS_Store"]);

async function listFiles(dir, current = dir) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    if (IGNORED.has(entry.name) || IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(dir, absolute)));
    } else if (entry.isFile()) {
      files.push({
        path: path.relative(dir, absolute).replaceAll(path.sep, "/"),
        absolute,
      });
    }
  }
  return files;
}

async function buildManifest(bundleDir) {
  const files = [];
  for (const file of await listFiles(bundleDir)) {
    const [content, stats] = await Promise.all([
      fs.readFile(file.absolute),
      fs.stat(file.absolute),
    ]);
    files.push({
      path: file.path,
      sha256: createHash("sha256").update(content).digest("hex"),
      mode: stats.mode & 0o777,
    });
  }
  return {
    schema: "tcsd-bundle-manifest/v1",
    fileCount: files.length,
    files,
  };
}

async function main() {
  const check = process.argv.includes("--check");
  const bundles = (await fs.readdir(hermesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(BUNDLE_PREFIX))
    .map((entry) => path.join(hermesDir, entry.name));
  let mismatches = 0;
  for (const bundleDir of bundles) {
    const manifestPath = path.join(bundleDir, "bundle-manifest.json");
    const manifest = await buildManifest(bundleDir);
    const serialized = JSON.stringify(manifest, null, 2) + "\n";
    if (check) {
      let existing = null;
      try {
        existing = await fs.readFile(manifestPath, "utf8");
      } catch {
        existing = null;
      }
      if (existing !== serialized) {
        console.error(`manifest out of date: ${path.relative(process.cwd(), manifestPath)}`);
        mismatches += 1;
      }
    } else {
      await fs.writeFile(manifestPath, serialized, "utf8");
      console.log(`manifest written: ${path.relative(process.cwd(), manifestPath)} (${manifest.fileCount} files)`);
    }
  }
  if (check) {
    if (mismatches > 0) {
      console.error(`${mismatches} manifest(s) out of date — run node tools/generate-bundle-manifests.mjs and commit`);
      process.exitCode = 1;
    } else {
      console.log("all bundle manifests up to date");
    }
  }
}

await main();
