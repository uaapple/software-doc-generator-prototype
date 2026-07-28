import fs from "node:fs";
import path from "node:path";

export const WINDOWS_PRODUCTION_ROOT = "C:\\ProgramData\\SoftwareDocGenerator";

function fail(category, message) {
  throw new Error(`[${category}] ${message}`);
}

function identity(candidate) {
  return path.win32.normalize(candidate).replace(/[\\/]+$/, "").toLowerCase();
}

export function resolveApprovedWindowsDirectory(value, category = "DIRECTORY") {
  const candidate = String(value || "").trim();
  if (/^\\\\/.test(candidate)) {
    fail(`${category}_UNC_FORBIDDEN`, "UNC paths are not supported.");
  }
  if (!candidate || !/^[A-Za-z]:[\\/]/.test(candidate)) {
    fail(`${category}_ABSOLUTE_REQUIRED`, "An absolute Windows drive path is required.");
  }
  const resolved = path.win32.resolve(candidate);
  const root = path.win32.parse(resolved).root;
  if (identity(resolved) === identity(root)) {
    fail(`${category}_ROOT_FORBIDDEN`, "A drive root is not an approved target.");
  }
  const approved = path.win32.resolve(WINDOWS_PRODUCTION_ROOT);
  const prefix = `${identity(approved)}\\`;
  if (!identity(resolved).startsWith(prefix)) {
    fail(
      `${category}_OUTSIDE_APPROVED_ROOT`,
      "The directory must be inside the approved SoftwareDocGenerator root."
    );
  }
  return resolved;
}

function assertExistingComponentSafe(candidate, category) {
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink()) {
    fail(`${category}_REPARSE_FORBIDDEN`, "A reparse point is not an approved directory.");
  }
  if (!stat.isDirectory()) {
    fail(`${category}_FILE_CONFLICT`, "An existing file conflicts with the directory.");
  }
  const requested = identity(path.win32.resolve(candidate));
  const actual = identity(fs.realpathSync.native(candidate));
  if (requested !== actual) {
    fail(`${category}_REPARSE_FORBIDDEN`, "A reparse point is not an approved directory.");
  }
}

function assertPathComponentsSafe(target, category) {
  const approved = path.win32.resolve(WINDOWS_PRODUCTION_ROOT);
  const relative = path.win32.relative(approved, target);
  let cursor = approved;
  if (fs.existsSync(cursor)) assertExistingComponentSafe(cursor, category);
  for (const component of relative.split(/[\\/]+/).filter(Boolean)) {
    cursor = path.win32.join(cursor, component);
    if (fs.existsSync(cursor)) assertExistingComponentSafe(cursor, category);
  }
}

function verifyWritable(target, category) {
  const sentinel = path.win32.join(
    target,
    `.sdg-write-probe-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(sentinel, "sdg-write-probe", { flag: "wx", mode: 0o600 });
    if (fs.readFileSync(sentinel, "utf8") !== "sdg-write-probe") {
      fail(`${category}_WRITE_VERIFY_FAILED`, "Directory write verification failed.");
    }
  } catch (error) {
    if (/^\[[A-Z0-9_]+\]/.test(String(error?.message || ""))) throw error;
    fail(`${category}_NOT_WRITABLE`, "Directory is not writable by the deployment identity.");
  } finally {
    try {
      fs.unlinkSync(sentinel);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        fail(`${category}_PROBE_CLEANUP_FAILED`, "Directory write probe cleanup failed.");
      }
    }
  }
}

export function prepareApprovedWindowsDirectories(entries) {
  const resolved = entries.map(({ value, category }) => ({
    category,
    path: resolveApprovedWindowsDirectory(value, category)
  }));
  const programData = "C:\\ProgramData";
  if (!fs.existsSync(programData)) {
    fail("PROGRAM_DATA_REQUIRED", "The Windows ProgramData directory is missing.");
  }
  assertExistingComponentSafe(programData, "PROGRAM_DATA");

  const approvedRoot = path.win32.resolve(WINDOWS_PRODUCTION_ROOT);
  if (!fs.existsSync(approvedRoot)) {
    fs.mkdirSync(approvedRoot);
  }
  assertExistingComponentSafe(approvedRoot, "APPROVED_ROOT");

  for (const entry of resolved) {
    assertPathComponentsSafe(entry.path, entry.category);
    if (!fs.existsSync(entry.path)) fs.mkdirSync(entry.path, { recursive: true });
    assertPathComponentsSafe(entry.path, entry.category);
    verifyWritable(entry.path, entry.category);
  }
  return resolved.map((entry) => entry.path);
}
