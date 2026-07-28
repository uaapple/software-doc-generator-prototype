import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assertSoftwareDetailDesignNineStageTrace,
  SOFTWARE_DETAIL_DESIGN_PIPELINE_ID,
  SOFTWARE_DETAIL_DESIGN_STAGES,
  SOFTWARE_DETAIL_DESIGN_TRACE_SCHEMA
} from "./software-detail-design-nine-stage-contract.mjs";
import { buildZipArchive } from "./zip-fixture.js";

const execFileAsync = promisify(execFile);
const liveRegressionPath = fileURLToPath(
  new URL("./software-detail-design-nine-stage-live-regression.mjs", import.meta.url)
);
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sdd-nine-stage-smoke-"));

try {
  const trace = await createSyntheticTrace(tempRoot);
  await assertSoftwareDetailDesignNineStageTrace(trace);
  const tracePath = path.join(tempRoot, "synthetic-nine-stage-trace.json");
  await fs.writeFile(tracePath, JSON.stringify(trace, null, 2));
  const liveEntryResult = await execFileAsync(process.execPath, [
    liveRegressionPath,
    `--trace=${tracePath}`
  ]);
  assert.match(
    liveEntryResult.stdout,
    /Software detail design real nine-stage functional regression passed/
  );

  const reusedHermesSession = structuredClone(trace);
  reusedHermesSession.stages[1].hermesSessionId =
    reusedHermesSession.stages[0].hermesSessionId;
  await assert.rejects(
    () => assertSoftwareDetailDesignNineStageTrace(reusedHermesSession),
    /fresh Hermes session/
  );

  const changedMatlabSession = structuredClone(trace);
  changedMatlabSession.stages[5].matlabSessionId = "matlab-session-not-owned-by-task";
  await assert.rejects(
    () => assertSoftwareDetailDesignNineStageTrace(changedMatlabSession),
    /task-owned MATLAB session/
  );

  const missingArtifact = structuredClone(trace);
  missingArtifact.stages[7].artifacts = missingArtifact.stages[7].artifacts.filter(
    (artifact) => artifact.role !== "traceability-report"
  );
  await assert.rejects(
    () => assertSoftwareDetailDesignNineStageTrace(missingArtifact),
    /missing required artifact traceability-report/
  );

  const unmaterializedDocx = structuredClone(trace);
  unmaterializedDocx.stages[8].artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  ).materialized = false;
  unmaterializedDocx.finalDocx = unmaterializedDocx.stages[8].artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  );
  await assert.rejects(
    () => assertSoftwareDetailDesignNineStageTrace(unmaterializedDocx),
    /detail-design-docx must be materialized/
  );

  const outOfOrder = structuredClone(trace);
  [outOfOrder.stages[3], outOfOrder.stages[4]] = [
    outOfOrder.stages[4],
    outOfOrder.stages[3]
  ];
  await assert.rejects(
    () => assertSoftwareDetailDesignNineStageTrace(outOfOrder),
    /stage 4 must be in catalog order/
  );

  assert.equal(trace.stages.length, 9);
  assert.deepEqual(
    trace.stages.map((stage) => stage.stageId),
    [
      "software-detail-stage-01-initialize",
      "software-detail-stage-02-model-plan",
      "software-detail-stage-03-evidence-extract",
      "software-detail-stage-04-output-ledger",
      "software-detail-stage-05-boundary-projection",
      "software-detail-stage-06-architecture-draft",
      "software-detail-stage-07-module-draft",
      "software-detail-stage-08-content-check",
      "software-detail-stage-09-docx-finalize"
    ]
  );
  assert.deepEqual(
    trace.stages.map((stage) => stage.order),
    [100, 200, 300, 400, 500, 600, 700, 800, 900]
  );
  assert.deepEqual(
    trace.stages.map((stage) => stage.skillName),
    trace.stages.map((stage) => stage.stageId)
  );
  assert.deepEqual(
    trace.stages.map((stage) => stage.matlabSessionAction),
    ["established", "reused", "reused", "reused", "reused", "reused", "reused", "reused", "cleaned"]
  );
  assert.equal(new Set(trace.stages.map((stage) => stage.skillName)).size, 9);
  assert.equal(new Set(trace.stages.map((stage) => stage.hermesSessionId)).size, 9);
  assert.equal(new Set(trace.stages.map((stage) => stage.matlabSessionId)).size, 1);
  console.log("Software detail design nine-stage synthetic functional smoke tests passed.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

async function createSyntheticTrace(workspaceDir) {
  const taskId = "synthetic-software-detail-design-task";
  const matlabSessionId = `${taskId}:matlab`;
  const stages = [];

  for (const definition of SOFTWARE_DETAIL_DESIGN_STAGES) {
    const artifacts = [];
    for (const role of definition.requiredArtifactRoles) {
      const relativePath = role === "detail-design-docx"
        ? "outputs/software-detail-design.docx"
        : `artifacts/stage-${String(definition.index).padStart(2, "0")}/${role}.json`;
      const bytes = role === "detail-design-docx"
        ? buildSyntheticDocx()
        : Buffer.from(JSON.stringify({
            schema: `synthetic-${role}/v1`,
            taskId,
            stageIndex: definition.index,
            role
          }));
      const absolutePath = path.join(workspaceDir, ...relativePath.split("/"));
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, bytes);
      artifacts.push({
        role,
        relativePath,
        materialized: true,
        byteLength: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex")
      });
    }
    stages.push({
      index: definition.index,
      order: definition.order,
      stageId: definition.stageId,
      skillName: definition.skillName,
      status: "validated",
      attempt: 1,
      validation: { passed: true },
      hermesSessionId: `${taskId}:hermes:${String(definition.index).padStart(2, "0")}`,
      matlabSessionId,
      matlabSessionAction: definition.matlabSessionAction,
      artifacts
    });
  }

  const finalDocx = stages.at(-1).artifacts.find(
    (artifact) => artifact.role === "detail-design-docx"
  );
  return {
    schema: SOFTWARE_DETAIL_DESIGN_TRACE_SCHEMA,
    pipelineId: SOFTWARE_DETAIL_DESIGN_PIPELINE_ID,
    taskId,
    workspaceDir,
    matlabSession: {
      sessionId: matlabSessionId,
      ownerTaskId: taskId,
      ownership: "task",
      status: "cleaned"
    },
    stages,
    finalDocx
  };
}

function buildSyntheticDocx() {
  return buildZipArchive([
    {
      name: "[Content_Types].xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/word/document.xml" ',
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        "</Types>"
      ].join("")
    },
    {
      name: "word/document.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        "<w:body><w:p><w:r><w:t>synthetic nine-stage smoke</w:t></w:r></w:p></w:body>",
        "</w:document>"
      ].join("")
    }
  ]);
}
