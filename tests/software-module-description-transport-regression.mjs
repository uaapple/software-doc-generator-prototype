import assert from "node:assert/strict";
import {
  assertHarnessInvariants,
  runSoftwareModuleDescriptionTransportScenario
} from "./software-module-description-transport-harness.mjs";

const expectCurrentGap = process.argv.includes("--expect-current-gap");
const result = await runSoftwareModuleDescriptionTransportScenario();

if (expectCurrentGap) {
  assert.equal(
    result.runTaskError?.code,
    "software_detail_artifact_payload_missing",
    "the hardened Platform client must fail closed on the metadata-only Worker response"
  );
  assert.equal(
    result.platformDocxBytes,
    null,
    "current-gap evidence expects Platform materialization to be missing"
  );
  assert.deepEqual(
    result.platformArtifactOperations,
    [],
    "current-gap evidence expects no Platform artifact write"
  );
  assert.equal(
    result.cleanupOrderObservations[0].responseEndedWhenCleanupStarted,
    false,
    "current-gap evidence expects cleanup to start before executeStepRequest response"
  );
  assert.deepEqual(
    result.legacy.afterBytes,
    result.legacy.originalBytes,
    "legacy task reads must remain byte-for-byte read-only"
  );
  assert.equal(result.legacy.readTask?.unitTestProject?.id, "01");
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.legacy.readTask || {}, "pipeline"),
    false
  );
  console.log([
    "Observed current software-module-description transport gap:",
    "- Worker cleanup invocation: started before executeStepRequest response",
    "- Worker response still lacks transferred DOCX bytes",
    "- hardened Platform client: rejected metadata-only artifact",
    "- Worker multipart session: cleaned",
    "- Platform task: failed closed with software_detail_artifact_payload_missing",
    "- legacy task reads: byte-for-byte read-only"
  ].join("\n"));
} else {
  assertHarnessInvariants(result);
  const transferredArtifact = result.responseOutputFiles[0];
  assert.equal(
    transferredArtifact.encoding,
    "base64",
    "Worker response must declare the DOCX transfer encoding"
  );
  assert.ok(
    transferredArtifact.contentBase64,
    "Worker response must carry the generated DOCX bytes"
  );
  assert.equal(
    transferredArtifact.sha256,
    result.expectedDocxSha256,
    "Worker response must carry a verifiable SHA-256 digest"
  );
  assert.deepEqual(
    Buffer.from(transferredArtifact.contentBase64, "base64"),
    result.expectedDocxBytes,
    "Worker response bytes must match the generated DOCX"
  );
  assert.ok(
    result.platformDocxBytes,
    "Platform must materialize the DOCX before the Worker cleans its multipart session"
  );
  assert.deepEqual(
    result.platformDocxBytes,
    result.expectedDocxBytes,
    "Platform DOCX bytes must match the Worker-generated artifact"
  );
  const finalDocxPath = result.platformDocxPath;
  const temporaryWrites = result.platformArtifactOperations.filter(
    (operation) => operation.operation === "writeFile" && operation.targetPath !== finalDocxPath
  );
  const finalRenames = result.platformArtifactOperations.filter(
    (operation) => operation.operation === "rename" && operation.targetPath === finalDocxPath
  );
  assert.equal(
    result.platformArtifactOperations.some(
      (operation) => operation.operation === "writeFile" && operation.targetPath === finalDocxPath
    ),
    false,
    "Platform must not write transferred DOCX bytes directly to the final artifact path"
  );
  assert.ok(temporaryWrites.length > 0, "Platform must first write the DOCX to a temporary sibling path");
  assert.ok(
    finalRenames.some((operation) =>
      temporaryWrites.some((write) => write.targetPath === operation.sourcePath)
    ),
    "Platform must atomically rename the fully written temporary DOCX to its final path"
  );
  assert.equal(result.runTaskError, null);
  assert.equal(result.completedTask?.status, "completed");
  assert.equal(result.storedTask.status, "completed");
  assert.equal(result.storedTask.artifacts?.[0]?.relativePath, "outputs/软件模块详细设计.docx");
  console.log("Software module description remote DOCX transfer regression passed.");
}
