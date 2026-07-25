import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

/*
 * Exit code contract for future Codex threads:
 * 0: No semantic DB change was found. If Git still shows data/skills.sqlite as modified,
 *    treat it as likely SQLite binary/WAL/checkpoint noise and ask before restoring it.
 * 1: Semantic DB changes were found. Review the listed added/removed/changed profiles or
 *    skill_items before committing data/skills.sqlite.
 * 2: The check could not run reliably, for example sqlite3 is missing, HEAD DB is missing,
 *    or integrity_check failed. Do not make a DB commit decision from this result.
 */

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbPath = path.join(repoRoot, "data", "skills.sqlite");
const baseGitRef = "HEAD:data/skills.sqlite";

const helpText = `Skills DB diff check

Usage:
  npm run check:skills-db-diff
  node scripts/check-skills-db-diff.mjs

What it checks:
  Compares the current data/skills.sqlite with HEAD:data/skills.sqlite at the logical table level.
  It reports table count changes, profile changes, and skill_items added/removed/changed.

Exit codes:
  0  No semantic DB change was found. If Git still shows data/skills.sqlite as modified,
     it is likely binary/WAL/checkpoint noise; normally restore only after user approval.
  1  Semantic DB changes were found. Review the listed changes before committing the DB snapshot.
  2  The check could not run reliably. Do not decide whether to commit the DB from this result.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(helpText.trimEnd());
  process.exit(0);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  });
}

function hashFile(filePath) {
  return createHash("sha1").update(readFileSync(filePath)).digest("hex");
}

function sqliteJson(filePath, sql) {
  const output = run("sqlite3", ["-json", filePath, sql]);
  return output.trim() ? JSON.parse(output) : [];
}

function scalar(filePath, sql) {
  return run("sqlite3", [filePath, sql]).trim();
}

function getCurrentGitStatus() {
  try {
    run("git", ["diff", "--quiet", "--", "data/skills.sqlite"]);
    return "clean";
  } catch {
    return "modified";
  }
}

function materializeBaseDb() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "skills-db-diff-"));
  const basePath = path.join(tempDir, "head-skills.sqlite");
  try {
    const contents = execFileSync("git", ["show", baseGitRef], {
      cwd: repoRoot,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"]
    });
    writeFileSync(basePath, contents);
    return { tempDir, basePath };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(`无法读取 ${baseGitRef}。请确认数据库文件已经被 Git 跟踪。`);
  }
}

function normalizeValue(value) {
  return value == null ? "" : String(value);
}

function toMap(rows, keyField) {
  return new Map(rows.map((row) => [row[keyField], row]));
}

function diffRows(currentRows, baseRows, keyField, fields) {
  const currentMap = toMap(currentRows, keyField);
  const baseMap = toMap(baseRows, keyField);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, row] of currentMap) {
    if (!baseMap.has(key)) {
      added.push(row);
      continue;
    }
    const baseRow = baseMap.get(key);
    const changedFields = fields.filter((field) => normalizeValue(row[field]) !== normalizeValue(baseRow[field]));
    if (changedFields.length) {
      changed.push({ key, fields: changedFields, row, baseRow });
    }
  }

  for (const [key, row] of baseMap) {
    if (!currentMap.has(key)) {
      removed.push(row);
    }
  }

  return { added, removed, changed };
}

function printRows(label, rows, formatter, limit = 20) {
  if (!rows.length) return;
  console.log(`\n${label} (${rows.length})`);
  for (const row of rows.slice(0, limit)) {
    console.log(`- ${formatter(row)}`);
  }
  if (rows.length > limit) {
    console.log(`- ... 还有 ${rows.length - limit} 条未显示`);
  }
}

if (!existsSync(dbPath)) {
  console.error(`未找到数据库：${dbPath}`);
  process.exit(2);
}

try {
  run("sqlite3", ["-version"]);
} catch {
  console.error("未找到 sqlite3 命令，无法审阅 skills.sqlite。");
  process.exit(2);
}

let tempDir;
let basePath;
try {
  const materialized = materializeBaseDb();
  tempDir = materialized.tempDir;
  basePath = materialized.basePath;
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

try {
  const integrity = scalar(dbPath, "PRAGMA integrity_check;");
  if (integrity !== "ok") {
    console.error(`当前数据库 integrity_check 失败：${integrity}`);
    process.exit(2);
  }

  const binaryStatus = getCurrentGitStatus();
  const currentHash = hashFile(dbPath);
  const baseHash = hashFile(basePath);
  const tablesSql = "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
  const currentTables = sqliteJson(dbPath, tablesSql).map((row) => row.name);
  const baseTables = sqliteJson(basePath, tablesSql).map((row) => row.name);
  const tableSet = [...new Set([...currentTables, ...baseTables])].sort();

  const tableCountRows = tableSet.map((table) => {
    const currentHasTable = currentTables.includes(table);
    const baseHasTable = baseTables.includes(table);
    const currentCount = currentHasTable ? Number(scalar(dbPath, `SELECT count(*) FROM "${table}";`)) : null;
    const baseCount = baseHasTable ? Number(scalar(basePath, `SELECT count(*) FROM "${table}";`)) : null;
    return { table, currentCount, baseCount };
  });
  const countChanges = tableCountRows.filter((row) => row.currentCount !== row.baseCount);

  const profileSql = `
    SELECT
      layer || '/' || profile_key AS profile_id,
      version,
      layer,
      profile_key,
      display_name,
      document_type_scope,
      status
    FROM profiles
    ORDER BY layer, profile_key;
  `;
  const skillItemSql = `
    SELECT
      s.skill_code,
      p.layer,
      p.profile_key,
      s.kind,
      s.title,
      s.content,
      s.status,
      s.order_index,
      s.section_key,
      s.provenance_json,
      s.review_json,
      s.structured_payload_json,
      s.document_type_scope
    FROM skill_items s
    JOIN profiles p ON p.id = s.profile_id
    ORDER BY s.skill_code;
  `;

  const profileDiff = diffRows(
    sqliteJson(dbPath, profileSql),
    sqliteJson(basePath, profileSql),
    "profile_id",
    ["version", "display_name", "document_type_scope", "status"]
  );
  const itemDiff = diffRows(
    sqliteJson(dbPath, skillItemSql),
    sqliteJson(basePath, skillItemSql),
    "skill_code",
    [
      "layer",
      "profile_key",
      "kind",
      "title",
      "content",
      "status",
      "order_index",
      "section_key",
      "provenance_json",
      "review_json",
      "structured_payload_json",
      "document_type_scope"
    ]
  );

  const logicalChangeCount =
    countChanges.length +
    profileDiff.added.length +
    profileDiff.removed.length +
    profileDiff.changed.length +
    itemDiff.added.length +
    itemDiff.removed.length +
    itemDiff.changed.length;

  console.log("Skills DB diff check");
  console.log("退出码约定：0=无语义变化；1=有语义变化需审阅；2=脚本/数据库检查失败。");
  console.log(`- Git 状态：${binaryStatus === "modified" ? "data/skills.sqlite 有二进制改动" : "data/skills.sqlite 未显示改动"}`);
  console.log(`- 当前 SHA1：${currentHash}`);
  console.log(`- HEAD SHA1：${baseHash}`);

  if (countChanges.length) {
    console.log("\n表行数变化");
    for (const row of countChanges) {
      console.log(`- ${row.table}: HEAD=${row.baseCount ?? "missing"} 当前=${row.currentCount ?? "missing"}`);
    }
  }

  printRows(
    "新增 profiles",
    profileDiff.added,
    (row) => `${row.profile_id} (${row.display_name || "-"})`
  );
  printRows(
    "删除 profiles",
    profileDiff.removed,
    (row) => `${row.profile_id} (${row.display_name || "-"})`
  );
  printRows(
    "修改 profiles",
    profileDiff.changed,
    (entry) => `${entry.key}: ${entry.fields.join(", ")}`
  );

  printRows(
    "新增 skill_items",
    itemDiff.added,
    (row) => `${row.skill_code} | ${row.layer}/${row.profile_key} | ${row.kind} | ${row.title || "-"}`
  );
  printRows(
    "删除 skill_items",
    itemDiff.removed,
    (row) => `${row.skill_code} | ${row.layer}/${row.profile_key} | ${row.kind} | ${row.title || "-"}`
  );
  printRows(
    "修改 skill_items",
    itemDiff.changed,
    (entry) => `${entry.key}: ${entry.fields.join(", ")}`
  );

  if (!logicalChangeCount && binaryStatus === "modified") {
    console.log("\n结论：只检测到 sqlite 二进制文件变化，未发现表行数、profile 或 skill_items 语义变化。");
    console.log("建议：如无其他原因，可恢复 data/skills.sqlite，避免提交 WAL/checkpoint 引起的噪音。");
    process.exitCode = 0;
  } else if (!logicalChangeCount) {
    console.log("\n结论：未发现数据库变化。");
    process.exitCode = 0;
  } else {
    console.log("\n结论：检测到技能数据库语义变化。提交前请审阅上面的新增、删除或修改项。");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("\n检查失败：无法可靠判断 data/skills.sqlite 是否只有二进制噪音。");
  console.error(error.message);
  process.exitCode = 2;
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
