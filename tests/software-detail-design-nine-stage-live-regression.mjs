import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertSoftwareDetailDesignNineStageTrace
} from "./software-detail-design-nine-stage-contract.mjs";

const traceArgument = process.argv.find((argument) => argument.startsWith("--trace="));
const tracePath = String(
  traceArgument?.slice("--trace=".length) ||
  process.env.SDD_NINE_STAGE_FUNCTIONAL_TRACE_PATH ||
  ""
).trim();

assert.ok(
  tracePath,
  [
    "Expected-red: the real software-detail-design nine-stage pipeline does not yet export a functional trace.",
    "When the pipeline is implemented, export its local task trace and run:",
    "node tests/software-detail-design-nine-stage-live-regression.mjs --trace=/absolute/path/to/trace.json"
  ].join("\n")
);
assert.ok(path.isAbsolute(tracePath), "--trace must be an absolute local file path");

const trace = JSON.parse(await fs.readFile(tracePath, "utf8"));
await assertSoftwareDetailDesignNineStageTrace(trace);

console.log("Software detail design real nine-stage functional regression passed.");
