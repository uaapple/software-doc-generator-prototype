import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * TCSD / software-detail multipart upload 会话目录与作业工作区隔离。
 *
 * 背景：jobs-upload 会把整个 workspace 根上传到受管会话目录
 * （uploadTempDir/step-.../root-N），并递归改写 payload 中的
 * workspaceDir/outputDir 等路径。若作业直接在会话目录内运行，终端清理
 * （cleanupTerminalTcsdUpload）会递归删除整棵产物树。
 *
 * 本模块把被改写到会话目录的 workspace 根整体迁移到稳定的作业工作区
 * （dataDir/tcsd-pipeline-workspaces/ws-<uuid>），并同步改写 payload
 * 中的路径；会话目录随后只剩空壳，清理时不会再触碰任何作业产物。
 */

function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

export function isManagedSessionDir(sessionDir = "", uploadTempDir = "") {
  const session = path.resolve(String(sessionDir || ""));
  const temp = path.resolve(String(uploadTempDir || ""));
  return Boolean(session && temp && isPathInside(temp, session));
}

function rewriteWorkspacePathsInPlace(value, oldRoot, newRoot) {
  if (typeof value === "string") {
    if (!path.isAbsolute(value)) return value;
    const resolved = path.resolve(value);
    if (resolved === oldRoot) return newRoot;
    if (resolved.startsWith(`${oldRoot}${path.sep}`)) {
      return path.join(newRoot, path.relative(oldRoot, resolved));
    }
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = rewriteWorkspacePathsInPlace(value[index], oldRoot, newRoot);
    }
    return value;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      value[key] = rewriteWorkspacePathsInPlace(entry, oldRoot, newRoot);
    }
    return value;
  }
  return value;
}

/**
 * 将 payload 中被改写进 sessionDir/root-N 的 workspace 整体迁移到稳定目录，
 * 并返回路径已改写的 payload。若 workspace 不在会话目录内则原样返回。
 */
export async function relocateUploadedWorkspace(payload = {}, sessionDir = "", options = {}) {
  const inputArtifact = payload?.inputArtifact;
  if (!sessionDir || !inputArtifact) return payload;
  const sessionRoot = path.resolve(String(sessionDir || ""));
  const workspaceValue = String(inputArtifact.workspaceDir || "").trim();
  if (!workspaceValue) return payload;
  const workspaceDir = path.resolve(workspaceValue);
  if (!isPathInside(sessionRoot, workspaceDir)) return payload;

  const relativeToSession = path.relative(sessionRoot, workspaceDir);
  const [rootSegment, ...rest] = relativeToSession.split(path.sep);
  if (!/^root-\d+$/.test(rootSegment) || rest.length > 0) {
    return payload;
  }

  const stableBase = path.resolve(
    String(
      options.stableBaseDir ||
        path.join(sessionRoot, "..", "tcsd-pipeline-workspaces")
    )
  );
  const stableWorkspace = path.join(stableBase, `ws-${randomUUID()}`);
  await fs.mkdir(stableBase, { recursive: true });
  try {
    await fs.rename(workspaceDir, stableWorkspace);
  } catch (cause) {
    if (cause?.code !== "EXDEV") throw cause;
    await fs.cp(workspaceDir, stableWorkspace, { recursive: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
  return rewriteWorkspacePathsInPlace(payload, workspaceDir, stableWorkspace);
}

/**
 * 清理前门禁：作业工作区/产物目录不得位于受管会话目录之内。
 * 若仍重叠（回归或历史作业），拒绝清理并抛出错误，防止删除作业产物。
 */
export function assertWorkspaceOutsideManagedSession(job = {}, sessionDir = "") {
  const sessionRoot = path.resolve(String(sessionDir || ""));
  const input = job?.input || {};
  for (const label of ["workspaceDir", "outputDir"]) {
    const value = String(input[label] || "").trim();
    if (value && isPathInside(sessionRoot, value)) {
      throw new Error(
        `Refusing to clean the upload session because it still owns the job ${label} (${value}).`
      );
    }
  }
}
