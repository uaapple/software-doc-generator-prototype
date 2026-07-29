import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  hashSoftwareDetailBundle,
  SoftwareDetailHermesSkillRegistry
} from "../src/services/software-detail-hermes-skill-registry.js";
import { SoftwareDetailHermesStageExecutor } from "../src/services/software-detail-hermes-stage-executor.js";
import { SoftwareDetailMatlabLeaseClient } from "../src/services/software-detail-matlab-lease-client.js";
import { listSoftwareDetailStages } from "../src/services/software-detail-stage-catalog.js";

const requests = [];
const lease = {
  workspaceId: "sdd-job-1",
  leaseId: "sdd-lease-job-1",
  ownerJobId: "job-1",
  matlabSessionId: "sdd-lease-job-1",
  status: "active"
};
const publicLease = {
  schema: "matlab-gateway-lease/v1",
  id: lease.leaseId,
  workspaceId: lease.workspaceId,
  leaseId: lease.leaseId,
  ownerJobId: lease.ownerJobId,
  status: "active",
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z"
};
let leaseClosed = false;
const fetchImpl = async (url, options = {}) => {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({
    path: parsed.pathname,
    method: options.method || "GET",
    headers: options.headers || {},
    body
  });
  if (parsed.pathname === "/api/workspaces/sdd-job-1") {
    return new Response(
      JSON.stringify({ workspaceId: "sdd-job-1", mappingId: "worker-data" }),
      { status: 201 }
    );
  }
  if (
    parsed.pathname ===
    "/api/workspaces/sdd-job-1/leases/sdd-lease-job-1"
  ) {
    if (options.method === "DELETE") {
      leaseClosed = true;
      return new Response(
        JSON.stringify({
          ...publicLease,
          status: "closed",
          closedAt: "2026-07-29T00:01:00.000Z"
        })
      );
    }
    return new Response(
      JSON.stringify(
        leaseClosed
          ? {
              ...publicLease,
              status: "closed",
              closedAt: "2026-07-29T00:01:00.000Z"
            }
          : publicLease
      ),
      { status: options.method === "PUT" ? 201 : 200 }
    );
  }
  if (parsed.pathname === "/api/jobs/evaluate-1") {
    return new Response(JSON.stringify({ accepted: true }), { status: 202 });
  }
  return new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), {
    status: 404
  });
};

const leaseClient = new SoftwareDetailMatlabLeaseClient({
  baseURL: "http://gateway.example.invalid",
  authToken: "gateway-auth-secret",
  evaluateToken: "gateway-evaluate-secret",
  mappingId: "worker-data",
  fetchImpl
});
const createdLease = await leaseClient.createJobLease({
  workspaceId: lease.workspaceId,
  leaseId: lease.leaseId,
  ownerJobId: lease.ownerJobId
});
assert.deepEqual(createdLease, lease);
assert.deepEqual(
  requests.slice(0, 2).map((request) => [request.method, request.path]),
  [
    ["PUT", "/api/workspaces/sdd-job-1"],
    ["PUT", "/api/workspaces/sdd-job-1/leases/sdd-lease-job-1"]
  ]
);
assert.equal(requests[0].headers.Authorization, "Bearer gateway-auth-secret");
await leaseClient.submitLeasedJob(
  "evaluate-1",
  { operation: "evaluate_matlab_code", code: "disp(1)" },
  lease
);
assert.equal(requests[2].body.leaseId, lease.leaseId);
assert.equal(requests[2].body.ownerJobId, lease.ownerJobId);
assert.equal(
  requests[2].headers["x-sdg-evaluate-token"],
  "gateway-evaluate-secret"
);
assert.equal(
  requests[2].headers["x-sdg-gateway-caller"],
  "software-detail-runtime"
);
const closedLease = await leaseClient.closeJobLease(lease);
assert.equal(closedLease.confirmed, true);
assert.deepEqual(
  requests.slice(3).map((request) => [request.method, request.path]),
  [
    ["DELETE", "/api/workspaces/sdd-job-1/leases/sdd-lease-job-1"],
    ["GET", "/api/workspaces/sdd-job-1/leases/sdd-lease-job-1"]
  ]
);
assert.equal(
  leaseClient.hermesEnvironment(lease).MATLAB_GATEWAY_EVALUATE_TOKEN,
  "gateway-evaluate-secret"
);

const unreadableClient = new SoftwareDetailMatlabLeaseClient({
  baseURL: "http://gateway.example.invalid",
  authToken: "auth",
  evaluateToken: "evaluate",
  fetchImpl: async () => new Response("not-json")
});
await assert.rejects(
  () =>
    unreadableClient.createJobLease({
      workspaceId: "workspace-1",
      leaseId: "lease-1",
      ownerJobId: "job-1"
    }),
  (error) => error.code === "software_detail_gateway_unreadable_response"
);

const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "software-detail-worker-components-")
);
try {
  const workspaceDir = path.join(root, "workspace");
  const attemptDir = path.join(workspaceDir, ".software-detail", "attempt");
  const manifestPath = path.join(attemptDir, "stage-input.json");
  const candidateResultPath = path.join(
    attemptDir,
    "candidate-result.json"
  );
  await fs.mkdir(attemptDir, { recursive: true });
  const installedStagePath = path.join(root, "installed-stage");
  const installedRuntimePath = path.join(root, "installed-runtime");
  await Promise.all([
    fs.mkdir(installedStagePath, { recursive: true }),
    fs.mkdir(installedRuntimePath, { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(path.join(installedStagePath, "SKILL.md"), "stage"),
    fs.writeFile(path.join(installedRuntimePath, "runtime.json"), "{}")
  ]);
  const installedStageHash =
    await hashSoftwareDetailBundle(installedStagePath);
  const installedRuntimeHash =
    await hashSoftwareDetailBundle(installedRuntimePath);
  const commandInvocations = [];
  const executor = new SoftwareDetailHermesStageExecutor({
    command: "hermes",
    profile: "default",
    commandRunner: async (command, args, options) => {
      commandInvocations.push({ command, args, options });
      return {
        stdout: `diagnostic only\nsession_id: session-${commandInvocations.length}\n`,
        stderr: ""
      };
    }
  });
  const definition = listSoftwareDetailStages()[1];
  const outputArtifacts = definition.outputs.map((artifact) => ({
    role: artifact.role,
    relativePath: `.software-detail/artifacts/${definition.id}/${artifact.role}.json`
  }));
  const job = {
    jobId: "job-1",
    input: { workspaceDir },
    skillRegistry: {
      schema: "software-detail-hermes-skill-registry/v1",
      discovery: { allDiscovered: true },
      runtime: {
        bundleHash: installedRuntimeHash,
        installedPath: installedRuntimePath
      },
      stages: listSoftwareDetailStages().map((stage) => ({
        stageId: stage.id,
        name: stage.skillName,
        version: "1.0.0",
        bundleHash:
          stage.id === definition.id
            ? installedStageHash
            : `hash-${stage.id}`,
        installedPath:
          stage.id === definition.id
            ? installedStagePath
            : path.join(root, "installed", stage.id)
      }))
    }
  };
  const result = await executor.execute({
    definition,
    job,
    stageInput: {
      schema: "software-detail-minimal-stage-input/v1",
      jobId: "job-1",
      stageId: definition.id,
      attempt: 1,
      status: "running",
      matlabSessionId: lease.matlabSessionId,
      artifacts: [
        {
          role: "input-manifest",
          relativePath: ".software-detail/upstream/input-manifest.json"
        },
        {
          role: "workspace-manifest",
          relativePath: ".software-detail/upstream/workspace-manifest.json"
        },
        {
          role: "matlab-session-lease",
          relativePath: ".software-detail/upstream/matlab-session-lease.json"
        }
      ]
    },
    manifestPath,
    candidateResultPath,
    outputArtifacts,
    lease,
    gatewayEnvironment: {
      MATLAB_GATEWAY_TOKEN: "gateway-auth-secret",
      MATLAB_GATEWAY_EVALUATE_TOKEN: "gateway-evaluate-secret"
    }
  });
  assert.equal(result.sessionId, "session-1");
  assert.equal(commandInvocations.length, 1);
  const prompt = commandInvocations[0].args[2];
  assert.match(prompt, new RegExp(`^/${definition.skillName}`, "m"));
  assert.match(prompt, /candidate-result\.json/);
  for (const artifact of outputArtifacts) {
    assert.match(prompt, new RegExp(artifact.relativePath.replaceAll(".", "\\.")));
  }
  assert.match(prompt, new RegExp(lease.leaseId));
  assert.doesNotMatch(prompt, /gateway-auth-secret|gateway-evaluate-secret/);
  assert.equal(
    commandInvocations[0].options.env.MATLAB_GATEWAY_TOKEN,
    "gateway-auth-secret"
  );
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.gatewayLease.ownerJobId, lease.ownerJobId);
  assert.deepEqual(manifest.outputArtifacts, outputArtifacts);
  assert.doesNotMatch(
    await fs.readFile(manifestPath, "utf8"),
    /gateway-auth-secret|gateway-evaluate-secret/
  );
  await fs.writeFile(
    path.join(installedStagePath, "SKILL.md"),
    "stage changed after snapshot"
  );
  await assert.rejects(
    () =>
      executor.execute({
        definition,
        job,
        stageInput: {
          ...manifest,
          attempt: 2
        },
        manifestPath: path.join(attemptDir, "stage-input-drift.json"),
        candidateResultPath: path.join(
          attemptDir,
          "candidate-result-drift.json"
        ),
        outputArtifacts,
        lease,
        gatewayEnvironment: {}
      }),
    (error) => error.code === "software_detail_skill_snapshot_drift"
  );

  const registrySkillsDir = path.join(root, "hermes-skills");
  const listedNames = listSoftwareDetailStages()
    .map((stage) => stage.skillName)
    .join("\n");
  const registryCommandInvocations = [];
  const registry = new SoftwareDetailHermesSkillRegistry({
    command: "hermes",
    profile: "default",
    sourceRoot: path.resolve("skills/hermes"),
    skillsDir: registrySkillsDir,
    commandRunner: async (command, args, options) => {
      registryCommandInvocations.push({ command, args, options });
      const output =
        Number(options.env.COLUMNS) >= 512
          ? listedNames
          : listSoftwareDetailStages()
              .map((stage) => `${stage.skillName.slice(0, 24)}…`)
              .join("\n");
      return { stdout: output, stderr: "" };
    }
  });
  const snapshot = await registry.prepare();
  assert.equal(snapshot.schema, "software-detail-hermes-skill-registry/v1");
  assert.equal(snapshot.stages.length, 9);
  assert.equal(snapshot.discovery.allDiscovered, true);
  assert.deepEqual(registryCommandInvocations[0].args, ["skills", "list"]);
  assert.equal(registryCommandInvocations[0].options.env.NO_COLOR, "1");
  assert.equal(registryCommandInvocations[0].options.env.COLUMNS, "512");
  assert.ok(
    await fs.stat(
      path.join(
        registrySkillsDir,
        "software-detail",
        "software-detail-runtime",
        "source-manifest.json"
      )
    )
  );
  for (const stage of snapshot.stages) {
    assert.equal(stage.version, "1.0.0");
    assert.ok(await fs.stat(path.join(stage.installedPath, "SKILL.md")));
  }
  const repeated = await registry.prepare();
  assert.deepEqual(
    repeated.stages.map((stage) => stage.bundleHash),
    snapshot.stages.map((stage) => stage.bundleHash)
  );

  const truncatedRegistry = new SoftwareDetailHermesSkillRegistry({
    command: "hermes",
    profile: "default",
    sourceRoot: path.resolve("skills/hermes"),
    skillsDir: path.join(root, "hermes-skills-truncated"),
    commandRunner: async () => ({
      stdout: listSoftwareDetailStages()
        .map((stage) => `${stage.skillName.slice(0, 24)}…`)
        .join("\n"),
      stderr: ""
    })
  });
  await assert.rejects(
    () => truncatedRegistry.prepare(),
    (error) =>
      error.code === "software_detail_skill_registry_failed" &&
      error.message ===
        "Hermes did not discover all software-detail stage skills." &&
      error.details.missing.length === 9
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

const containerfile = await fs.readFile(
  "containers/worker/Containerfile",
  "utf8"
);
const requirements = await fs.readFile(
  "requirements/container-worker.txt",
  "utf8"
);
for (const stage of listSoftwareDetailStages()) {
  assert.match(
    containerfile,
    new RegExp(`COPY skills/hermes/${stage.skillName}/`)
  );
}
for (const runtimeClass of [
  "agents",
  "assets",
  "references",
  "scripts",
  "shared"
]) {
  assert.match(
    containerfile,
    new RegExp(
      `COPY skills/hermes/software-detail-runtime/${runtimeClass}/`
    )
  );
}
assert.match(containerfile, /software-detail-pipeline-jobs/);
assert.match(containerfile, /import yaml, openpyxl, et_xmlfile, docx, lxml/);
assert.match(requirements, /^python-docx==1\.2\.0$/m);
assert.match(requirements, /^lxml==6\.0\.2$/m);

console.log(
  "Software-detail Worker lease, Hermes executor, registry, and container tests passed."
);
