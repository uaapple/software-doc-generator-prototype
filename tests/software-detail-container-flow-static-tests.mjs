import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import vm from "node:vm";

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
assert.match(
  driver,
  /SDD_SYNTHETIC_USE_PREBUILT_IMAGES\s*!==\s*"1"[\s\S]*usePrebuiltImages:\s*false/
);
assert.match(
  driver,
  /usePrebuiltImages:\s*true[\s\S]*platformImage,[\s\S]*workerImage/
);
assert.match(
  driver,
  /"up",\s*"--build",\s*"--detach",\s*"--wait"/,
  "默认容器合成验收必须构建当前源码镜像。"
);
assert.match(
  driver,
  /"up",\s*"--no-build",\s*"--detach",\s*"--wait",[\s\S]*"--pull",\s*"never"/,
  "显式预构建镜像模式必须禁止构建和拉取。"
);
assert.match(
  driver,
  /\["image",\s*"inspect",\s*"--format",\s*"\{\{\.Architecture\}\}",\s*image\]/
);
assert.match(driver, /result\.stdout\.trim\(\),\s*"amd64"/);
for (const requiredEnvironmentName of [
  "SDD_SYNTHETIC_USE_PREBUILT_IMAGES",
  "SDD_SYNTHETIC_PLATFORM_IMAGE",
  "SDD_SYNTHETIC_WORKER_IMAGE"
]) {
  assert.match(
    driver,
    new RegExp(
      `process\\.env\\.${requiredEnvironmentName}`
    )
  );
}
assert.deepEqual(
  [
    ...new Set(
      [...driver.matchAll(/process\.env\.(SDD_SYNTHETIC_[A-Z0-9_]+)/g)]
        .map((match) => match[1])
    )
  ].sort(),
  [
    "SDD_SYNTHETIC_PLATFORM_IMAGE",
    "SDD_SYNTHETIC_USE_PREBUILT_IMAGES",
    "SDD_SYNTHETIC_WORKER_IMAGE"
  ],
  "驱动只能从进程环境读取三个明确的预构建镜像测试参数。"
);
assert.match(
  driver,
  /SDD_SYNTHETIC_USE_PREBUILT_IMAGES=1 时必须显式提供 SDD_SYNTHETIC_PLATFORM_IMAGE/
);
assert.match(
  driver,
  /SDD_SYNTHETIC_USE_PREBUILT_IMAGES=1 时必须显式提供 SDD_SYNTHETIC_WORKER_IMAGE/
);
const imageReferenceValidatorStart = driver.indexOf(
  "function validatePrebuiltImageReference"
);
const imageReferenceValidatorEnd = driver.indexOf(
  "\n}\n\nfunction resolveImageMode",
  imageReferenceValidatorStart
);
assert.ok(imageReferenceValidatorStart >= 0);
assert.ok(imageReferenceValidatorEnd > imageReferenceValidatorStart);
const validatePrebuiltImageReference = vm.runInNewContext(
  `(${driver.slice(
    imageReferenceValidatorStart,
    imageReferenceValidatorEnd + 2
  )})`
);
for (const invalidReference of [
  "sdg-platform",
  "registry.example:5000/sdg-platform",
  "sdg-platform:latest",
  "sdg-platform:LATEST"
]) {
  assert.throws(
    () => validatePrebuiltImageReference(invalidReference, "测试"),
    /明确标签|latest/
  );
}
for (const preciseReference of [
  "sdg-platform:sdd-wave5-bb01d50",
  "sdg-hermes-worker:sdd-wave5-bb01d50",
  "registry.example:5000/team/sdg-platform:release_2026.07-1"
]) {
  assert.equal(
    validatePrebuiltImageReference(preciseReference, "测试"),
    preciseReference
  );
}
assert.doesNotMatch(driver, /dotenv|\.env\.container|SDG_CONTAINER_ENV_FILE/);
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
