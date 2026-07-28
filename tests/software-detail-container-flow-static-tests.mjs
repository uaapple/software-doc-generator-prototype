import assert from "node:assert/strict";
import { promises as fs } from "node:fs";

const [
  workerServer,
  isolatedCompose,
  syntheticCompose,
  driver,
  packageJson
] = await Promise.all([
  fs.readFile(
    new URL("./software-detail-container-worker-server.mjs", import.meta.url),
    "utf8"
  ),
  fs.readFile(
    new URL(
      "./fixtures/software-detail-container/compose.isolated.yaml",
      import.meta.url
    ),
    "utf8"
  ),
  fs.readFile(
    new URL(
      "./fixtures/software-detail-container/compose.synthetic.yaml",
      import.meta.url
    ),
    "utf8"
  ),
  fs.readFile(
    new URL("./software-detail-container-flow-tests.mjs", import.meta.url),
    "utf8"
  ),
  fs.readFile(new URL("../package.json", import.meta.url), "utf8")
]);

assert.match(workerServer, /createHermesApp/);
assert.match(workerServer, /SoftwareDetailHermesSkillRegistry/);
assert.match(workerServer, /hashSoftwareDetailBundle/);
assert.match(workerServer, /SOFTWARE_DETAIL_STAGE_RESULT_SCHEMA/);
assert.match(workerServer, /Template_Software_Detailed_Design\.docx/);
assert.match(workerServer, /from docx import Document/);
assert.match(workerServer, /synthetic: true/);
assert.doesNotMatch(workerServer, /new SoftwareDetailPipelineJobService/);
assert.doesNotMatch(workerServer, /SoftwareDetailMatlabLeaseClient\s*\{/);

for (const composeSource of [isolatedCompose, syntheticCompose]) {
  assert.doesNotMatch(composeSource, /compose\.(linux-prod|windows)/);
  assert.doesNotMatch(composeSource, /latest/);
  assert.doesNotMatch(composeSource, /release-dist/);
}
assert.equal(
  [...isolatedCompose.matchAll(/SDD_SYNTHETIC_PLATFORM_DATA_DIR:\?set/g)]
    .length,
  2
);
assert.equal(
  [...isolatedCompose.matchAll(/SDD_SYNTHETIC_WORKER_DATA_DIR:\?set/g)].length,
  2
);
assert.doesNotMatch(isolatedCompose, /SDD_SYNTHETIC_DATA_DIR/);
assert.match(
  isolatedCompose,
  /source: \$\{SDD_SYNTHETIC_PLATFORM_DATA_DIR:[^\n]+\}\s+target: \/var\/lib\/sdg\/data/
);
assert.match(
  isolatedCompose,
  /source: \$\{SDD_SYNTHETIC_WORKER_DATA_DIR:[^\n]+\}\s+target: \/var\/lib\/sdg\/data/
);
assert.match(
  isolatedCompose,
  /source: \$\{SDD_SYNTHETIC_PLATFORM_DATA_DIR:[^\n]+\}\s+target: \/state\/data\/platform/
);
assert.match(
  isolatedCompose,
  /source: \$\{SDD_SYNTHETIC_WORKER_DATA_DIR:[^\n]+\}\s+target: \/state\/data\/worker/
);
assert.match(
  isolatedCompose,
  /chmod 0777 \/state\/data\/platform \/state\/data\/worker/
);
assert.match(isolatedCompose, /SDD_SYNTHETIC_ADDON_DIR:\?set/);
assert.match(isolatedCompose, /SDD_SYNTHETIC_PLATFORM_PORT:\?set/);
assert.match(isolatedCompose, /SDD_SYNTHETIC_WORKER_PORT:\?set/);
assert.match(isolatedCompose, /SDD_SYNTHETIC_GATEWAY_PORT:\?set/);
assert.match(isolatedCompose, /worker-hermes:/);
assert.match(isolatedCompose, /platform-skills:/);
assert.match(isolatedCompose, /platform-home:/);
assert.match(isolatedCompose, /read_only:\s+true/);
assert.match(syntheticCompose, /validation:\s+synthetic/);
assert.match(syntheticCompose, /read_only:\s+true/);
assert.match(
  syntheticCompose,
  /software-detail-container-worker-server\.mjs/
);

assert.match(driver, /createMatlabGatewayApp/);
assert.match(driver, /MatlabGatewayService/);
assert.match(driver, /createPublicTask/);
assert.match(driver, /assertImageSkillSnapshotFromSyntheticList/);
assert.match(driver, /SDD_SYNTHETIC_PLATFORM_DATA_DIR/);
assert.match(driver, /SDD_SYNTHETIC_WORKER_DATA_DIR/);
assert.doesNotMatch(driver, /SDD_SYNTHETIC_DATA_DIR/);
assert.match(driver, /hostRoot:\s*workerDataDir/);
assert.match(driver, /mapWorkerContainerPathToHost/);
assert.match(driver, /fs\.stat\(cleanedHostUploadDir\)/);
assert.match(driver, /cleanupError\s*=\s*error/);
assert.match(driver, /new Set\(sessions\)\.size,\s*9/);
assert.match(driver, /clientRecords\.length,\s*2/);
assert.match(driver, /unzip/);
assert.match(driver, /--env-file/);
assert.match(driver, /--project-name/);
assert.match(driver, /down[\s\S]*--volumes[\s\S]*--remove-orphans/);
assert.doesNotMatch(driver, /process\.env\.DEEPSEEK/);
assert.doesNotMatch(driver, /process\.env\.OPENAI/);
assert.doesNotMatch(driver, /compose\.linux-prod/);
assert.doesNotMatch(driver, /compose\.windows/);

const parsedPackage = JSON.parse(packageJson);
assert.equal(
  parsedPackage.scripts["test:software-detail-container-flow"],
  "node --disable-warning=ExperimentalWarning tests/software-detail-container-flow-tests.mjs"
);
assert.equal(
  parsedPackage.scripts["test:software-detail-container-flow:static"],
  "node --disable-warning=ExperimentalWarning tests/software-detail-container-flow-static-tests.mjs"
);

console.log(
  "PASS software-detail synthetic container static checks: application service/registry code boundaries, isolated Platform/Worker data roots, read-only test entry, explicitly synthetic skill-list/session substitutes, safe cleanup, and independent commands verified"
);
