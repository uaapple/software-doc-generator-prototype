import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

const repoRoot = process.cwd();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

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
  const problems = [];

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, relativePath);
    const buffer = await readFile(absolutePath);

    try {
      utf8Decoder.decode(buffer);
    } catch {
      problems.push(`${relativePath}: invalid UTF-8`);
      continue;
    }

    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      problems.push(`${relativePath}: UTF-8 BOM detected`);
    }
  }

  if (problems.length > 0) {
    console.error("Encoding check failed:");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Encoding check passed for ${files.length} tracked text files.`);
}

await main();