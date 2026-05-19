import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownershipPath = path.join(projectRoot, "deploy", "ownership.yml");
const args = parseArgs(process.argv.slice(2));
const ownership = parseOwnershipFile(ownershipPath);
const changedFiles = args.files.length ? args.files : listChangedFiles(args.range);
const report = buildReport(changedFiles, ownership);

if (args.jsonOut) {
  fs.mkdirSync(path.dirname(path.resolve(args.jsonOut)), { recursive: true });
  fs.writeFileSync(path.resolve(args.jsonOut), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(renderMarkdown(report));
if (!args.jsonOut) {
  console.log("\n```json");
  console.log(JSON.stringify(report, null, 2));
  console.log("```");
}

if (report.groups.ambiguous.length && !args.allowAmbiguous) {
  process.exitCode = 2;
}

function parseArgs(rawArgs = []) {
  const parsed = {
    range: "",
    jsonOut: "",
    allowAmbiguous: false,
    files: []
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--json-out") {
      parsed.jsonOut = rawArgs[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--json-out=")) {
      parsed.jsonOut = arg.slice("--json-out=".length);
    } else if (arg === "--allow-ambiguous") {
      parsed.allowAmbiguous = true;
    } else if (arg === "--file") {
      parsed.files.push(rawArgs[index + 1] || "");
      index += 1;
    } else if (arg.startsWith("--file=")) {
      parsed.files.push(arg.slice("--file=".length));
    } else if (!arg.startsWith("-") && !parsed.range) {
      parsed.range = arg;
    } else if (!arg.startsWith("-")) {
      parsed.files.push(arg);
    }
  }
  parsed.files = parsed.files.map(normalizePath).filter(Boolean);
  return parsed;
}

function parseOwnershipFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const result = {};
  let currentCategory = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const categoryMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1];
      result[currentCategory] = result[currentCategory] || [];
      continue;
    }
    const itemMatch = line.match(/^\s*-\s+(.+?)\s*$/);
    if (itemMatch && currentCategory) {
      result[currentCategory].push(normalizePath(itemMatch[1].replace(/^["']|["']$/g, "")));
    }
  }
  return result;
}

function listChangedFiles(range = "") {
  const gitArgs = range
    ? ["diff", "--name-only", "--diff-filter=ACMRTDU", range]
    : ["diff", "--name-only", "--diff-filter=ACMRTDU", "HEAD"];
  const result = spawnSync("git", gitArgs, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`git ${gitArgs.join(" ")} failed\n${result.stderr || result.stdout || ""}`.trim());
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function buildReport(files = [], ownershipRules = {}) {
  const groups = {
    linux: [],
    windows: [],
    shared: [],
    "runtime-data": [],
    "local-only": [],
    ambiguous: []
  };

  const entries = files.map((filePath) => {
    const matches = Object.fromEntries(
      Object.entries(ownershipRules).map(([category, patterns]) => [
        category,
        patterns.filter((pattern) => matchesPattern(filePath, pattern))
      ])
    );
    const category = chooseCategory(filePath, matches);
    groups[category] = groups[category] || [];
    groups[category].push(filePath);
    return {
      path: filePath,
      category,
      matchedPatterns: Object.fromEntries(Object.entries(matches).filter(([, patterns]) => patterns.length))
    };
  });

  return {
    range: args.range || "HEAD working tree",
    generatedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(groups).map(([category, values]) => [category, values.length])),
    groups,
    entries
  };
}

function chooseCategory(_filePath, matches = {}) {
  if (matches["runtime-data"]?.length) return "runtime-data";
  if (matches["local-only"]?.length) return "local-only";
  if (matches.ambiguous?.length) return "ambiguous";

  const targetMatches = ["linux", "windows"].filter((category) => matches[category]?.length);
  const shared = Boolean(matches.shared?.length);
  if (targetMatches.length > 1) return "ambiguous";
  if (shared) return "shared";
  if (targetMatches.length === 1) return targetMatches[0];
  return "ambiguous";
}

function matchesPattern(filePath = "", pattern = "") {
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern) return false;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix);
  }
  if (!normalizedPattern.includes("*")) {
    return normalizedPath === normalizedPattern;
  }
  const escaped = normalizedPattern
    .split("**")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(normalizedPath);
}

function normalizePath(value = "") {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function renderMarkdown(currentReport) {
  const lines = [
    "# Change Classification Report",
    "",
    `- Range: ${currentReport.range}`,
    `- Generated: ${currentReport.generatedAt}`,
    "",
    "| Category | Count |",
    "| --- | ---: |",
    ...Object.entries(currentReport.counts).map(([category, count]) => `| ${category} | ${count} |`),
    ""
  ];

  for (const [category, files] of Object.entries(currentReport.groups)) {
    if (!files.length) continue;
    lines.push(`## ${category}`, "");
    for (const filePath of files) {
      lines.push(`- \`${filePath}\``);
    }
    lines.push("");
  }

  if (currentReport.groups.ambiguous.length) {
    lines.push("> Ambiguous files require manual routing before release-branch split.");
  }
  return lines.join("\n");
}
