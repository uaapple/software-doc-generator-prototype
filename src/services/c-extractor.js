import { readFile } from "node:fs/promises";

const FUNC_REGEX = /(?:static\s+)?(?:inline\s+)?[A-Za-z_][\w\s\*]*\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
const DEFINE_REGEX = /^\s*#define\s+([A-Z_][A-Z0-9_]*)\s+(.+)$/gm;
const ASSIGNMENT_REGEX = /^\s*([A-Za-z_]\w*)\s*=\s*([^;]+);/gm;
const IF_REGEX = /^\s*if\s*\((.+)\)/gm;

export class CExtractor {
  async extract(fileRecord) {
    const content = await readFile(fileRecord.absolutePath, "utf8");
    const blocks = [];

    for (const match of content.matchAll(DEFINE_REGEX)) {
      blocks.push({
        location: "macro",
        text: `宏 ${match[1]} = ${match[2]}`,
        tags: ["threshold", "macro"]
      });
    }

    for (const match of content.matchAll(FUNC_REGEX)) {
      blocks.push({
        location: "function",
        text: `函数 ${match[1]}(${normalizeParameters(match[2])})`,
        tags: inferFunctionTags(match[1])
      });
    }

    for (const match of content.matchAll(IF_REGEX)) {
      blocks.push({
        location: "condition",
        text: `条件分支: ${match[1].trim()}`,
        tags: ["condition"]
      });
    }

    for (const match of content.matchAll(ASSIGNMENT_REGEX)) {
      blocks.push({
        location: "assignment",
        text: `赋值: ${match[1]} = ${match[2].trim()}`,
        tags: inferAssignmentTags(match[1], match[2])
      });
    }

    return {
      summary: content.slice(0, 220),
      blocks: dedupeBlocks(blocks).slice(0, 80)
    };
  }
}

function normalizeParameters(params) {
  return params.replace(/\s+/g, " ").trim();
}

function inferFunctionTags(name) {
  const tags = ["function"];
  if (/init|reset/i.test(name)) tags.push("lifecycle");
  if (/step|periodic|run/i.test(name)) tags.push("timing");
  if (/fault|diag|error/i.test(name)) tags.push("diagnostic");
  if (/mode|state/i.test(name)) tags.push("state");
  return tags;
}

function inferAssignmentTags(left, right) {
  const tags = ["assignment"];
  const combined = `${left} ${right}`;
  if (/mode|state/i.test(combined)) tags.push("state");
  if (/fault|error|diag/i.test(combined)) tags.push("diagnostic");
  if (/\d/.test(combined)) tags.push("threshold");
  return tags;
}

function dedupeBlocks(blocks) {
  const seen = new Set();
  return blocks.filter((block) => {
    const key = `${block.location}:${block.text}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
