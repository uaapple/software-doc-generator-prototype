import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertWorkspaceOutsideManagedSession,
  isManagedSessionDir,
  relocateUploadedWorkspace
} from "../src/services/hermes-upload-relocation.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-upload-relocation-"));
const uploadTempDir = path.join(root, "_incoming");
const stableBaseDir = path.join(root, "tcsd-pipeline-workspaces");

async function buildSessionPayload(sessionDir) {
  const workspaceDir = path.join(sessionDir, "root-0");
  await fs.mkdir(path.join(workspaceDir, "inputs"), { recursive: true });
  await fs.mkdir(path.join(workspaceDir, "outputs"), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, "A22.slx"), "slx");
  await fs.writeFile(path.join(workspaceDir, "A22.mat"), "mat");
  await fs.writeFile(path.join(workspaceDir, "inputs", "A22_init.m"), "init");
  return {
    stepType: "tcsd_stage_execute",
    allowedPaths: [workspaceDir],
    workdir: workspaceDir,
    inputArtifact: {
      workspaceDir,
      modelSlxPath: path.join(workspaceDir, "A22.slx"),
      modelMatPath: path.join(workspaceDir, "A22.mat"),
      modelInitScriptPath: path.join(workspaceDir, "inputs", "A22_init.m"),
      outputDir: path.join(workspaceDir, "outputs"),
      projectInitScripts: ["inputs/A22_init.m"],
      unitTestProject: { id: "01", label: "01_楚能" }
    }
  };
}

try {
  assert.equal(isManagedSessionDir(path.join(uploadTempDir, "step-x"), uploadTempDir), true);
  assert.equal(isManagedSessionDir("/etc", uploadTempDir), false);

  const sessionDir = path.join(uploadTempDir, "step-relocate");
  const payload = await buildSessionPayload(sessionDir);
  const originalWorkspaceDir = payload.inputArtifact.workspaceDir;
  const relocated = await relocateUploadedWorkspace(payload, sessionDir, { stableBaseDir });

  assert.equal(relocated, payload, "relocation must mutate the payload in place");
  assert.notEqual(relocated.inputArtifact.workspaceDir, originalWorkspaceDir);
  assert.ok(
    relocated.inputArtifact.workspaceDir.startsWith(`${stableBaseDir}${path.sep}`),
    relocated.inputArtifact.workspaceDir
  );
  assert.equal(
    relocated.inputArtifact.modelSlxPath,
    path.join(relocated.inputArtifact.workspaceDir, "A22.slx")
  );
  assert.equal(
    relocated.inputArtifact.modelMatPath,
    path.join(relocated.inputArtifact.workspaceDir, "A22.mat")
  );
  assert.equal(
    relocated.inputArtifact.modelInitScriptPath,
    path.join(relocated.inputArtifact.workspaceDir, "inputs", "A22_init.m")
  );
  assert.equal(
    relocated.inputArtifact.outputDir,
    path.join(relocated.inputArtifact.workspaceDir, "outputs")
  );
  assert.deepEqual(relocated.allowedPaths, [relocated.inputArtifact.workspaceDir]);
  assert.equal(relocated.workdir, relocated.inputArtifact.workspaceDir);
  assert.deepEqual(relocated.inputArtifact.projectInitScripts, ["inputs/A22_init.m"]);
  assert.equal(relocated.inputArtifact.unitTestProject.label, "01_楚能");

  assert.equal(
    await fs.readFile(path.join(relocated.inputArtifact.workspaceDir, "A22.slx"), "utf8"),
    "slx"
  );
  assert.equal(
    await fs.readFile(path.join(relocated.inputArtifact.workspaceDir, "outputs", ".keep")).catch(() => "missing"),
    "missing"
  );
  await assert.rejects(fs.access(path.join(sessionDir, "root-0")));

  const untouched = await buildSessionPayload(path.join(uploadTempDir, "step-untouched"));
  const same = await relocateUploadedWorkspace(untouched, "/elsewhere", { stableBaseDir });
  assert.equal(same, untouched);
  assert.equal(same.inputArtifact.workspaceDir, untouched.inputArtifact.workspaceDir);

  const jobInside = {
    input: {
      workspaceDir: path.join(sessionDir, "root-0"),
      outputDir: path.join(sessionDir, "root-0", "outputs")
    }
  };
  assert.throws(() => assertWorkspaceOutsideManagedSession(jobInside, sessionDir));
  const jobOutside = {
    input: {
      workspaceDir: relocated.inputArtifact.workspaceDir,
      outputDir: relocated.inputArtifact.outputDir
    }
  };
  assertWorkspaceOutsideManagedSession(jobOutside, sessionDir);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Hermes upload workspace relocation tests passed.");
