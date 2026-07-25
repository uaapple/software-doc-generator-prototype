import { promises as fs } from "node:fs";
import path from "node:path";
import { TcsdHermesStageExecutor } from "../src/services/tcsd-hermes-stage-executor.js";
import { TcsdHermesSkillRegistry } from "../src/services/tcsd-hermes-skill-registry.js";

const executor = new TcsdHermesStageExecutor();
const registry = new TcsdHermesSkillRegistry({
  command: executor.command,
  profile: executor.profile,
  stateDbPath: executor.stateDbPath,
  catalog: executor.catalog
});

const snapshot = await registry.prepare();
const outputPath = String(process.env.TCSD_SKILL_INSTALL_SNAPSHOT_PATH || "").trim();
if (outputPath) {
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({
  ok: true,
  schema: snapshot.schema,
  profile: snapshot.profile,
  discoveredSkills: snapshot.stages.length,
  runtimeBundleHash: snapshot.runtime.bundleHash,
  snapshotPath: outputPath ? path.resolve(outputPath) : ""
}));
