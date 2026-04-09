import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const textExtensions = new Set([
  ".md",
  ".txt",
  ".json",
  ".yml",
  ".yaml",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".html",
  ".svg",
  ".csv",
  ".env",
  ".ps1",
  ".cmd",
  ".bat"
]);

const includedDotFiles = new Set([".editorconfig", ".gitattributes"]);
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  ".local",
  "data",
  "output"
]);

async function collectFiles(currentDir, result = []) {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      await collectFiles(path.join(currentDir, entry.name), result);
      continue;
    }

    const relativePath = path.relative(repoRoot, path.join(currentDir, entry.name));
    const extension = path.extname(entry.name).toLowerCase();

    if (textExtensions.has(extension) || includedDotFiles.has(entry.name)) {
      result.push(relativePath);
    }
  }

  return result;
}

async function main() {
  const files = await collectFiles(repoRoot);
  const updatedFiles = [];

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, relativePath);
    const buffer = await readFile(absolutePath);

    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      await writeFile(absolutePath, buffer.subarray(3));
      updatedFiles.push(relativePath);
    }
  }

  if (updatedFiles.length === 0) {
    console.log("No UTF-8 BOM markers found.");
    return;
  }

  console.log(`Removed UTF-8 BOM from ${updatedFiles.length} files:`);
  for (const relativePath of updatedFiles) {
    console.log(`- ${relativePath}`);
  }
}

await main();