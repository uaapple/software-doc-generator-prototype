import assert from "node:assert/strict";
import {
  assertHarnessInvariants,
  runSoftwareModuleDescriptionTransportScenario
} from "./software-module-description-transport-harness.mjs";

const result = await runSoftwareModuleDescriptionTransportScenario();
assertHarnessInvariants(result);

assert.equal(
  result.cleanupOrderObservations[0].responseEndedWhenCleanupStarted,
  true,
  "Worker must not start managed multipart-session cleanup before executeStepRequest has produced its response"
);

console.log("Software module description Worker cleanup ordering regression passed.");
