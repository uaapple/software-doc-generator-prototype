import { promises as fs } from "node:fs";
import path from "node:path";

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const sourceRoot = path.resolve(argumentsMap.get("--source-root") || process.cwd());
const outputRoot = path.resolve(argumentsMap.get("--output") || "");
const entries = String(argumentsMap.get("--entries") || "src/hermes-server.js")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!argumentsMap.get("--output")) {
  throw new Error("--output is required");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function existingModulePath(specifier, importer) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  throw new Error(`Unable to resolve Worker source import "${specifier}" from ${importer}`);
}

function importedSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) specifiers.add(match[1]);
  }
  return [...specifiers];
}

const pending = entries.map((entry) => path.resolve(sourceRoot, entry));
const selected = new Set();
while (pending.length) {
  const filePath = pending.pop();
  if (selected.has(filePath)) continue;
  if (!isInside(sourceRoot, filePath)) {
    throw new Error(`Worker source dependency escaped the repository: ${filePath}`);
  }
  const source = await fs.readFile(filePath, "utf8");
  selected.add(filePath);
  for (const specifier of importedSpecifiers(source)) {
    const dependency = await existingModulePath(specifier, filePath);
    if (dependency && !selected.has(dependency)) pending.push(dependency);
  }
}

await fs.rm(outputRoot, { recursive: true, force: true });
for (const filePath of [...selected].sort()) {
  const relativePath = path.relative(sourceRoot, filePath);
  const destination = path.join(outputRoot, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(filePath, destination);
}

const manifest = {
  schema: "sdg-container-worker-source/v1",
  entries,
  files: [...selected].map((filePath) => path.relative(sourceRoot, filePath).replaceAll(path.sep, "/")).sort()
};
await fs.writeFile(path.join(outputRoot, "source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, fileCount: manifest.files.length, output: outputRoot }));

