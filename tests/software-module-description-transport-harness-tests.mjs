import {
  assertHarnessInvariants,
  runSoftwareModuleDescriptionTransportScenario
} from "./software-module-description-transport-harness.mjs";

const result = await runSoftwareModuleDescriptionTransportScenario();
assertHarnessInvariants(result);

console.log(
  result.platformDocxBytes
    ? "Software module description transport harness observed successful DOCX materialization."
    : "Software module description transport harness observed the metadata-only response and cleaned-session gap."
);
