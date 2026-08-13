import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseZipArchive } from "./zip-archive.js";

export const TCSD_PIPELINE_SCHEMA = "tcsd-agent-stage-pipeline/v2";
export const TCSD_LEGACY_PIPELINE_SCHEMA = "tcsd-deterministic-pipeline/v1";
export const TCSD_STAGE_INPUT_SCHEMA = "tcsd-agent-stage-input/v1";
export const TCSD_STAGE_RESULT_SCHEMA = "tcsd-agent-stage-result/v1";
export const TCSD_CHECKPOINT_SCHEMA = "tcsd-agent-stage-checkpoint/v2";
export const TCSD_EXECUTION_MANIFEST_SCHEMA = "simulink-ut-tcsd-execution-manifest/v1";
export const TCSD_STAGE_BUNDLE_VERSION = "tcsd-stage-skills/v2";
export const TCSD_RUNTIME_BUNDLE_VERSION = "tcsd-runtime/v2";

export const TCSD_STAGE_DEFINITIONS = Object.freeze([
  ["校验输入文件与项目附件", "tcsd-stage-01-validate-inputs"],
  ["检查 MATLAB 与模型工具环境", "tcsd-stage-02-check-environment"],
  ["初始化模型工作区", "tcsd-stage-03-initialize-workspace"],
  ["加载模型并提取输入输出接口", "tcsd-stage-04-extract-interface", "1.2.0"],
  ["分析条件、判定与 MC/DC 覆盖目标", "tcsd-stage-05-analyze-coverage", "1.2.0"],
  ["生成并验证状态及时序刺激", "tcsd-stage-06-validate-state-probes", "1.2.1"],
  ["生成并校验首版测试用例", "tcsd-stage-07-build-initial-cases", "1.2.2"],
  ["运行模型仿真并回填期望值", "tcsd-stage-08-simulate-backfill"],
  ["采集首轮覆盖率", "tcsd-stage-09-collect-coverage"],
  ["根据覆盖率修正测试用例", "tcsd-stage-10-repair-coverage", "1.4.0"],
  ["运行最终仿真与覆盖率检查", "tcsd-stage-11-final-validation"],
  ["整理任务产物并清理运行环境", "tcsd-stage-12-package-cleanup"]
].map(([name, skillName, skillVersion = "1.1.0"], offset) => Object.freeze({
  index: offset + 1,
  name,
  skillName,
  skillVersion,
  bundleVersion: TCSD_STAGE_BUNDLE_VERSION
})));

export const TCSD_STAGE_NAMES = TCSD_STAGE_DEFINITIONS.map((stage) => stage.name);
export const TCSD_RUN_STATES = ["等待执行", "正在执行", "已完成", "部分完成", "已跳过", "失败", "已取消"];
export const TCSD_ERROR_CODES = Object.freeze({
  workerUnavailable: "tcsd_worker_unavailable",
  jobNotFound: "tcsd_job_not_found",
  environment: "tcsd_environment_gate_failed",
  checkpoint: "tcsd_checkpoint_invalid",
  stage: "tcsd_stage_failed",
  stageRuntime: "tcsd_stage_runtime_failed",
  validation: "tcsd_stage_validation_failed",
  telemetry: "tcsd_stage_telemetry_unavailable",
  sessionReuse: "tcsd_stage_session_reused",
  input: "tcsd_input_invalid",
  timeout: "tcsd_stage_timeout",
  stalled: "tcsd_stage_stalled",
  cancelled: "tcsd_job_cancelled",
  pollTimeout: "tcsd_poll_timeout",
  transientNetwork: "tcsd_transient_network",
  illegalTransition: "tcsd_illegal_transition",
  obsolete: "tcsd_pipeline_version_obsolete",
  skillTreeMutated: "tcsd_skill_tree_mutated"
});

export function createStages() {
  return TCSD_STAGE_DEFINITIONS.map((definition) => ({
    ...definition,
    status: "等待执行",
    startedAt: "",
    endedAt: "",
    attempt: 0,
    attempts: [],
    summary: "",
    skipReason: "",
    error: null,
    checkpoint: null
  }));
}

export function isTerminalJobStatus(status = "") {
  return ["已完成", "部分完成", "失败", "已取消"].includes(status);
}

export function canTransition(from = "", to = "") {
  return from === to ||
    (from === "等待执行" && ["正在执行", "已跳过", "失败", "已取消"].includes(to)) ||
    (from === "正在执行" && ["已完成", "部分完成", "已跳过", "失败", "等待执行", "已取消"].includes(to));
}

function contractError(message, details = {}, code = TCSD_ERROR_CODES.checkpoint) {
  return Object.assign(new Error(message), { code, details });
}

function metricObject(value, model, metric) {
  if (!value || typeof value !== "object") throw contractError(`覆盖率缺少 ${model}.${metric}`);
  const percent = Number(value.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || typeof value.passed !== "boolean") {
    throw contractError(`覆盖率字段非法 ${model}.${metric}`);
  }
  const normalized = { percent, passed: value.passed };
  if (Number.isFinite(Number(value.covered))) normalized.covered = Number(value.covered);
  if (Number.isFinite(Number(value.total))) normalized.total = Number(value.total);
  return normalized;
}

export function normalizeCoverageReport(report = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw contractError("覆盖率报告必须是对象");
  const source = report.models && typeof report.models === "object" ? report.models : report;
  const models = {};
  for (const [model, record] of Object.entries(source)) {
    if (!record || typeof record !== "object" || !record.condition || !record.decision || !record.mcdc) continue;
    models[model] = {
      condition: metricObject(record.condition, model, "condition"),
      decision: metricObject(record.decision, model, "decision"),
      mcdc: metricObject(record.mcdc, model, "mcdc")
    };
  }
  if (!Object.keys(models).length) throw contractError("覆盖率报告没有有效模型记录");
  const aggregate = {};
  for (const metric of ["condition", "decision", "mcdc"]) {
    const entries = Object.values(models).map((record) => record[metric]);
    aggregate[metric] = {
      percent: Math.min(...entries.map((item) => item.percent)),
      passed: entries.every((item) => item.passed)
    };
  }
  return { models, aggregate };
}

export function coverageMeetsThreshold(coverage = {}, threshold = 80) {
  const aggregate = coverage.aggregate || coverage;
  return ["condition", "decision", "mcdc"].every((metric) => {
    const value = Number(aggregate[metric]?.percent ?? aggregate[metric]);
    return Number.isFinite(value) && value >= threshold;
  });
}

export function coverageCompletion(coverage = {}, unresolved = false, threshold = 80) {
  return unresolved || !coverageMeetsThreshold(coverage, threshold) ? "partial" : "complete";
}

function parseOracleManifest(oracle = {}, simulation = {}) {
  const testCaseCount = Number(oracle.testCaseCount);
  const expValueCount = Number(oracle.expValueCount);
  const caseOutputCounts = oracle.caseOutputCounts;
  const caseEntries = caseOutputCounts && typeof caseOutputCounts === "object" && !Array.isArray(caseOutputCounts)
    ? Object.entries(caseOutputCounts)
    : [];
  const countedExpectedValues = caseEntries.reduce((total, [, counts]) => (
    total + (
      counts && typeof counts === "object" && !Array.isArray(counts)
        ? Object.values(counts).reduce((subtotal, count) => subtotal + Number(count || 0), 0)
        : 0
    )
  ), 0);
  if (
    oracle.authority !== "host" ||
    oracle.status !== "complete" ||
    ![8, 11].includes(Number(oracle.sourceStageIndex)) ||
    !Number.isInteger(testCaseCount) ||
    testCaseCount < 1 ||
    !Number.isInteger(expValueCount) ||
    expValueCount < testCaseCount ||
    !Array.isArray(oracle.testsWithoutExpectedValues) ||
    oracle.testsWithoutExpectedValues.length !== 0 ||
    caseEntries.length !== testCaseCount ||
    caseEntries.some(([identity, counts]) => (
      !identity ||
      !counts ||
      typeof counts !== "object" ||
      Array.isArray(counts) ||
      !Object.keys(counts).length ||
      Object.values(counts).some((count) => !Number.isInteger(Number(count)) || Number(count) < 1)
    )) ||
    countedExpectedValues !== expValueCount ||
    !oracle.simulationResult ||
    oracle.simulationResult !== simulation?.result ||
    !/^[a-f0-9]{64}$/.test(String(oracle.workbookSha256 || ""))
  ) {
    throw contractError("最终执行 manifest 缺少完整的逐 Test oracle 证据");
  }
  return {
    authority: "host",
    status: "complete",
    sourceStageIndex: Number(oracle.sourceStageIndex),
    testCaseCount,
    expValueCount,
    testsWithoutExpectedValues: [],
    caseOutputCounts,
    simulationResult: oracle.simulationResult,
    workbookSha256: oracle.workbookSha256
  };
}

export function parseExecutionManifest(manifest = {}) {
  if (
    manifest.schema !== TCSD_EXECUTION_MANIFEST_SCHEMA ||
    manifest.status !== "completed" ||
    !["complete", "partial"].includes(manifest.completion)
  ) {
    throw contractError("最终执行 manifest schema/status/completion 非法");
  }
  const initial = normalizeCoverageReport(manifest.coverage?.initial);
  const final = normalizeCoverageReport(manifest.coverage?.final);
  const oracle = parseOracleManifest(manifest.oracle, manifest.simulation);
  const repair = {
    required: Boolean(manifest.coverage?.repair_required),
    attempted: Boolean(manifest.coverage?.repair_attempted),
    applied: Boolean(manifest.coverage?.repair_applied),
    passes: Number(manifest.coverage?.repair_passes || 0),
    reason: String(manifest.coverage?.repair_reason || ""),
    evidence: String(manifest.coverage?.repair_evidence || "")
  };
  if (
    repair.passes < 0 ||
    repair.passes > 1 ||
    repair.applied !== (repair.passes === 1) ||
    (repair.attempted && !repair.reason)
  ) {
    throw contractError("repair 字段不满足单轮修正规则");
  }
  return {
    completion: manifest.completion,
    initial,
    final,
    repair,
    workbook: manifest.workbook,
    simulation: manifest.simulation,
    oracle,
    evidence: manifest.evidence,
    initialArtifact: manifest.coverage?.initial_artifact,
    finalArtifact: manifest.coverage?.final_artifact
  };
}

function resolveWorkspacePath(rootDir, candidate, label = "path") {
  const root = path.resolve(rootDir);
  const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw contractError(`${label} 越出任务 workspace`);
  }
  return absolute;
}

async function hashFile(absolutePath) {
  return createHash("sha256").update(await fs.readFile(absolutePath)).digest("hex");
}

async function assertHashedJsonReference(rootDir, reference = {}, expectedSchema = "") {
  if (!reference.path || !/^[a-f0-9]{64}$/.test(String(reference.sha256 || ""))) {
    throw contractError("哈希 JSON 引用缺少 path/sha256");
  }
  const absolute = resolveWorkspacePath(rootDir, reference.path, "JSON 引用");
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw contractError(`JSON 引用不存在或为空: ${reference.path}`);
  if (await hashFile(absolute) !== reference.sha256) throw contractError(`JSON 引用 hash 不匹配: ${reference.path}`);
  let value;
  try {
    value = JSON.parse(await fs.readFile(absolute, "utf8"));
  } catch {
    throw contractError(`JSON 引用非法: ${reference.path}`);
  }
  if (expectedSchema && value.schema !== expectedSchema) throw contractError(`JSON 引用 schema 非法: ${reference.path}`);
  return { value, absolutePath: absolute, size: stat.size };
}

async function assertArtifact(rootDir, artifact = {}) {
  if (!artifact || typeof artifact !== "object" || !artifact.path || !artifact.kind) {
    throw contractError("stage artifact 缺少 path/kind");
  }
  const absolute = resolveWorkspacePath(rootDir, artifact.path, "stage artifact");
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw contractError(`stage artifact 不存在或为空: ${artifact.path}`);
  if (artifact.kind === "json") {
    try {
      JSON.parse(await fs.readFile(absolute, "utf8"));
    } catch {
      throw contractError(`stage artifact JSON 非法: ${artifact.path}`);
    }
  }
  if (artifact.kind === "xlsx") {
    const header = await fs.readFile(absolute).then((buffer) => buffer.subarray(0, 2).toString("binary"));
    if (header !== "PK") throw contractError(`stage artifact XLSX 格式非法: ${artifact.path}`);
  }
  return { ...artifact, absolutePath: absolute, size: stat.size };
}

function xlsxText(buffer) {
  try {
    return parseZipArchive(buffer, {
      maxArchiveBytes: 256 * 1024 * 1024,
      maxEntryUncompressedBytes: 64 * 1024 * 1024,
      maxTotalUncompressedBytes: 256 * 1024 * 1024
    })
      .readTextEntriesBySuffix(".xml")
      .map((entry) => entry.text)
      .join("\n");
  } catch (_error) {
    throw contractError("XLSX zip 目录或 entry 非法");
  }
}

async function evidenceJson(rootDir, relativePath, expectedSchema) {
  const absolute = resolveWorkspacePath(rootDir, relativePath, "证据");
  const data = JSON.parse(await fs.readFile(absolute, "utf8"));
  if (expectedSchema && data.schema !== expectedSchema) throw contractError(`证据 schema 非法: ${relativePath}`);
  return data;
}

async function validateBackfillEvidence(raw, context, artifacts) {
  const simulationCount = Number(raw.evidence?.simulationValueCount || 0);
  const workbookCount = Number(raw.evidence?.workbookBackfillCount || 0);
  const expCount = Number(raw.evidence?.expValueCount || 0);
  const testCaseCount = Number(raw.evidence?.testCaseCount);
  const testsWithoutExpectedValues = raw.evidence?.testsWithoutExpectedValues;
  const caseOutputCounts = raw.evidence?.caseOutputCounts;
  const caseEntries = caseOutputCounts && typeof caseOutputCounts === "object" && !Array.isArray(caseOutputCounts)
    ? Object.entries(caseOutputCounts)
    : [];
  const caseExpectedValueCount = caseEntries.reduce((total, [, counts]) => (
    total + (
      counts && typeof counts === "object" && !Array.isArray(counts)
        ? Object.values(counts).reduce((subtotal, count) => subtotal + Number(count || 0), 0)
        : 0
    )
  ), 0);
  const items = raw.evidence?.backfillItems;
  if (
    !raw.evidence?.simulationResult ||
    simulationCount < 1 ||
    workbookCount !== simulationCount ||
    expCount !== workbookCount ||
    !Number.isInteger(testCaseCount) ||
    testCaseCount < 1 ||
    !Array.isArray(testsWithoutExpectedValues) ||
    testsWithoutExpectedValues.length !== 0 ||
    caseEntries.length !== testCaseCount ||
    caseEntries.some(([identity, counts]) => (
      !identity ||
      !counts ||
      typeof counts !== "object" ||
      Array.isArray(counts) ||
      !Object.keys(counts).length ||
      Object.values(counts).some((count) => !Number.isInteger(Number(count)) || Number(count) < 1)
    )) ||
    caseExpectedValueCount !== workbookCount ||
    !Array.isArray(items) ||
    items.length !== workbookCount ||
    !caseOutputCounts
  ) {
    throw contractError(`第 ${context.stageIndex} 阶段缺少逐项仿真/回填交叉证据`);
  }
  const identities = new Set();
  const itemCounts = {};
  for (const item of items) {
    const key = `${item?.row}|${item?.testId}|${item?.step}|${item?.output}`;
    if (
      !Number.isInteger(item?.row) ||
      item.row < 1 ||
      !item?.testId ||
      !Number.isInteger(item?.step) ||
      item.step < 1 ||
      !item?.output ||
      !Number.isFinite(Number(item?.value)) ||
      identities.has(key)
    ) {
      throw contractError(`第 ${context.stageIndex} 阶段回填明细非法或重复`);
    }
    identities.add(key);
    const caseKey = `${item.row}:${item.testId}`;
    itemCounts[caseKey] ||= {};
    itemCounts[caseKey][item.output] = Number(itemCounts[caseKey][item.output] || 0) + 1;
  }
  if (JSON.stringify(itemCounts) !== JSON.stringify(caseOutputCounts)) {
    throw contractError(`第 ${context.stageIndex} 阶段逐 Test oracle 计数与回填明细不一致`);
  }
  const workbook = artifacts.find((item) => item.kind === "xlsx");
  if (!workbook || !xlsxText(await fs.readFile(workbook.absolutePath)).includes("expValue(")) {
    throw contractError(`第 ${context.stageIndex} 阶段 workbook 没有实际 expValue`);
  }
  const simulation = artifacts.find((item) => item.path === raw.evidence.simulationResult);
  if (!simulation) throw contractError(`第 ${context.stageIndex} 阶段仿真结果未列入产物`);
}

function requireSemanticEvidence(context, stageIndex) {
  const semantic = context.semanticEvidence;
  if (
    semantic?.schema !== "tcsd-host-semantic-validation/v1" ||
    semantic?.stageIndex !== stageIndex ||
    semantic?.passed !== true ||
    !semantic.details ||
    typeof semantic.details !== "object"
  ) {
    throw contractError(`第 ${stageIndex} 阶段缺少宿主语义校验证据`);
  }
  return semantic.details;
}

function coverageMatches(left, right) {
  const leftNormalized = normalizeCoverageReport(left);
  const rightNormalized = normalizeCoverageReport(right);
  for (const model of Object.keys(rightNormalized.models)) {
    if (!leftNormalized.models[model]) return false;
    for (const metric of ["condition", "decision", "mcdc"]) {
      const leftMetric = leftNormalized.models[model][metric];
      const rightMetric = rightNormalized.models[model][metric];
      if (
        Math.abs(leftMetric.percent - rightMetric.percent) > 1e-7 ||
        leftMetric.passed !== rightMetric.passed ||
        (
          Number.isFinite(rightMetric.covered) &&
          Math.abs(Number(leftMetric.covered) - rightMetric.covered) > 1e-7
        ) ||
        (
          Number.isFinite(rightMetric.total) &&
          Math.abs(Number(leftMetric.total) - rightMetric.total) > 1e-7
        )
      ) return false;
    }
  }
  return Object.keys(leftNormalized.models).length === Object.keys(rightNormalized.models).length;
}

async function requireArtifactSchema(artifacts, schemas) {
  const observed = new Set();
  for (const artifact of artifacts.filter((item) => item.kind === "json")) {
    const value = JSON.parse(await fs.readFile(artifact.absolutePath, "utf8"));
    if (value.schema) observed.add(value.schema);
  }
  for (const schema of schemas) {
    if (!observed.has(schema)) throw contractError(`阶段缺少 schema=${schema} 的确定性证据`);
  }
}

export async function validateStageResult(raw = {}, context = {}) {
  if (
    raw.schema !== TCSD_STAGE_RESULT_SCHEMA ||
    raw.jobId !== context.jobId ||
    raw.stageIndex !== context.stageIndex ||
    !["completed", "partial", "skipped"].includes(raw.status)
  ) {
    throw contractError("stage result schema/jobId/stageIndex/status 不匹配", {}, TCSD_ERROR_CODES.validation);
  }
  const artifacts = [];
  for (const artifact of Array.isArray(raw.artifacts) ? raw.artifacts : []) {
    artifacts.push(await assertArtifact(context.workspaceDir, artifact));
  }
  if (raw.status !== "skipped" && !artifacts.length) throw contractError("非跳过阶段必须提供已验证产物");
  if (raw.status === "skipped" && !raw.skipReason) throw contractError("跳过阶段必须提供原因");

  if (context.stageIndex === 1) {
    await requireArtifactSchema(artifacts, ["tcsd-input-manifest/v1"]);
  }
  if (context.stageIndex === 2) {
    await requireArtifactSchema(artifacts, ["tcsd-environment-gate/v2"]);
    const gates = await Promise.all(
      artifacts.filter((item) => item.kind === "json").map((item) => fs.readFile(item.absolutePath, "utf8").then(JSON.parse))
    );
    const gate = gates.find((item) => item.schema === "tcsd-environment-gate/v2");
    if (
      gate?.schema !== "tcsd-environment-gate/v2" ||
      gate?.passed !== true ||
      !gate?.matlabRoot ||
      !gate?.runner
    ) throw contractError("第 2 阶段环境门禁证据不完整");
    requireSemanticEvidence(context, 2);
  }
  if (context.stageIndex === 3) {
    if (!raw.evidence?.initializationManifest) throw contractError("第 3 阶段缺少工作区初始化 manifest");
    const initialized = await evidenceJson(
      context.workspaceDir,
      raw.evidence.initializationManifest,
      "tcsd-workspace-initialization/v1"
    );
    if (initialized.jobId !== context.jobId || initialized.completed !== true) {
      throw contractError("第 3 阶段初始化 manifest 未完成或 jobId 不匹配");
    }
  }
  if (context.stageIndex === 4) {
    await requireArtifactSchema(artifacts, ["tcsd-model-interface/v1"]);
    const candidates = await Promise.all(
      artifacts.filter((item) => item.kind === "json").map((item) => fs.readFile(item.absolutePath, "utf8").then(JSON.parse))
    );
    const modelInterface = candidates.find((item) => item.schema === "tcsd-model-interface/v1");
    if (!modelInterface || !Array.isArray(modelInterface.inputs) || !Array.isArray(modelInterface.outputs)) {
      throw contractError("第 4 阶段模型接口证据非法");
    }
  }
  if (context.stageIndex === 5) {
    await requireArtifactSchema(artifacts, [
      "simulink-ut-logical-mcdc-mapping/v1",
      "simulink-ut-logical-mcdc-obligations/v1",
      "simulink-ut-tcsd-coverage-ir/v1"
    ]);
  }
  if (context.stageIndex === 6) {
    await requireArtifactSchema(artifacts, ["simulink-ut-state-probe-plan/v1"]);
    const semantic = requireSemanticEvidence(context, 6);
    if (
      Number(raw.evidence?.candidateCount || 0) !== semantic.candidateCount ||
      raw.evidence?.probeExecuted !== semantic.probeExecuted ||
      (semantic.candidateCount > 0 && Number(semantic.observationCount || 0) < semantic.candidateCount)
    ) {
      throw contractError("第 6 阶段 Probe 计划、执行状态与实际观察证据不一致");
    }
  }
  if (context.stageIndex === 7) {
    const workbook = artifacts.find((item) => item.kind === "xlsx");
    const semantic = requireSemanticEvidence(context, 7);
    const assessmentArtifact = artifacts.find((item) => item.role === "planning-mapping-assessment");
    const assessment = assessmentArtifact
      ? JSON.parse(await fs.readFile(assessmentArtifact.absolutePath, "utf8"))
      : null;
    if (
      !workbook ||
      !xlsxText(await fs.readFile(workbook.absolutePath)).includes("TCSD") ||
      Number(semantic.testCount || 0) < 1 ||
      Number(semantic.actionStepCount || 0) < Number(semantic.testCount || 0) ||
      assessment?.schema !== "tcsd-planning-mapping-assessment/v1" ||
      assessment?.authority !== "planning" ||
      !["satisfied", "advisory"].includes(assessment?.status) ||
      assessment?.blocking !== false ||
      assessment?.supersededBy?.stageIndex !== 9 ||
      assessment?.supersededBy?.authority !== "measured-simulink-coverage" ||
      raw.evidence?.planningMappingAssessment !== assessmentArtifact?.path ||
      raw.evidence?.mappingAuthority !== "planning" ||
      raw.evidence?.supersededByStage !== 9
    ) {
      throw contractError("第 7 阶段缺少有效 TCSD workbook 或规划期映射诊断");
    }
  }
  if (context.stageIndex === 8) {
    const semantic = requireSemanticEvidence(context, 8);
    await validateBackfillEvidence(raw, context, artifacts);
    if (
      Number(raw.evidence?.expValueCount || 0) !== Number(semantic.expValueCount || 0) ||
      Number(raw.evidence?.simulationValueCount || 0) !== Number(semantic.simulationValueCount || 0) ||
      Number(raw.evidence?.workbookBackfillCount || 0) !== Number(semantic.workbookBackfillCount || 0) ||
      Number(raw.evidence?.testCaseCount || 0) !== Number(semantic.testCaseCount || 0) ||
      JSON.stringify(raw.evidence?.testsWithoutExpectedValues) !== JSON.stringify(semantic.testsWithoutExpectedValues) ||
      JSON.stringify(raw.evidence?.caseOutputCounts) !== JSON.stringify(semantic.caseOutputCounts)
    ) {
      throw contractError("第 8 阶段 Agent 计数与宿主逐项仿真/工作簿结果不一致");
    }
  }
  if (context.stageIndex === 9) {
    const semantic = requireSemanticEvidence(context, 9);
    if (!raw.coverage || !coverageMatches(raw.coverage, semantic.coverage)) {
      throw contractError("第 9 阶段 Agent coverage 与宿主解析的覆盖率报告不一致");
    }
    raw.coverage = normalizeCoverageReport(semantic.coverage);
    raw.evidence = {
      ...(raw.evidence || {}),
      coverageReport: semantic.coverageReportPath,
      coverageReportSha256: semantic.coverageReportSha256
    };
  }
  if (context.stageIndex === 10 && raw.status !== "skipped") {
    const semantic = requireSemanticEvidence(context, 10);
    if (
      !raw.repair?.attempted ||
      Number(raw.repair?.passes || 0) > 1 ||
      raw.repair?.applied !== (Number(raw.repair?.passes || 0) === 1) ||
      !raw.evidence?.repairBrief ||
      !raw.evidence?.repairProposal ||
      !raw.evidence?.proposalValidation ||
      !raw.evidence?.coverageIr ||
      Number(raw.evidence?.proposalItemCount || 0) !== Number(semantic.proposalItemCount || 0) ||
      Number(raw.evidence?.acceptedCandidateCount || 0) !== Number(semantic.acceptedCandidateCount || 0) ||
      Number(raw.evidence?.unresolvedCount || 0) !== Number(semantic.unresolvedCount || 0) ||
      Number(raw.evidence?.synthesisAddedCount || 0) !== Number(semantic.synthesisAddedCount || 0) ||
      (raw.repair.applied && semantic.candidateValidationPassed !== true)
    ) {
      throw contractError("第 10 阶段缺少 Agent 局部分析、Coverage IR 或宿主候选验证证据");
    }
  }
  if (context.stageIndex === 10) {
    const initialCoverage = context.pipelineState?.coverage?.initial;
    const threshold = Number(context.pipelineState?.input?.coverageThreshold || 80);
    if (!initialCoverage) throw contractError("第 10 阶段缺少已验证的首轮覆盖率");
    const repairRequired = !coverageMeetsThreshold(initialCoverage, threshold);
    if (repairRequired && raw.status === "skipped") {
      throw contractError("首轮覆盖率不足 80%，第 10 阶段不得跳过修正");
    }
    if (!repairRequired && raw.status !== "skipped") {
      throw contractError("首轮覆盖率已达到 80%，第 10 阶段必须直接跳过");
    }
  }
  if (context.stageIndex === 11) {
    const repairApplied = context.pipelineState?.repair?.applied === true;
    if (repairApplied && raw.status === "skipped") {
      throw contractError("第 10 阶段已应用修正，第 11 阶段不得跳过最终仿真与覆盖率");
    }
    if (!repairApplied && raw.status !== "skipped") {
      throw contractError("第 10 阶段未应用修正，第 11 阶段应明确跳过");
    }
  }
  if (context.stageIndex === 11 && raw.status !== "skipped") {
    const semantic = requireSemanticEvidence(context, 11);
    await validateBackfillEvidence(raw, context, artifacts);
    if (
      !raw.coverage ||
      !coverageMatches(raw.coverage, semantic.coverage) ||
      Number(raw.evidence?.testCaseCount || 0) !== Number(semantic.testCaseCount || 0) ||
      JSON.stringify(raw.evidence?.testsWithoutExpectedValues) !== JSON.stringify(semantic.testsWithoutExpectedValues) ||
      JSON.stringify(raw.evidence?.caseOutputCounts) !== JSON.stringify(semantic.caseOutputCounts)
    ) {
      throw contractError("第 11 阶段最终覆盖率与宿主解析报告不一致");
    }
    raw.coverage = normalizeCoverageReport(semantic.coverage);
    raw.evidence = {
      ...(raw.evidence || {}),
      coverageReport: semantic.coverageReportPath,
      coverageReportSha256: semantic.coverageReportSha256
    };
  }
  if (context.stageIndex === 12) {
    if (
      !raw.evidence?.cleanup ||
      raw.evidence?.executionManifest ||
      raw.executionManifest
    ) {
      throw contractError("第 12 阶段只能提交清理证据，最终 manifest 必须由宿主生成");
    }
    const cleanup = await evidenceJson(context.workspaceDir, raw.evidence.cleanup, "tcsd-cleanup-result/v1");
    if (cleanup.ownerJobId !== context.jobId || cleanup.jobId !== context.jobId) {
      throw contractError("第 12 阶段资源清理所有权与 jobId 不一致");
    }
  }
  return { ...raw, artifacts };
}

function validateTraceEnvelope(raw, context) {
  const definition = TCSD_STAGE_DEFINITIONS[context.stageIndex - 1];
  if (
    !definition ||
    raw.skill?.name !== definition.skillName ||
    raw.skill?.version !== definition.skillVersion ||
    raw.skill?.bundleVersion !== definition.bundleVersion ||
    !/^[a-f0-9]{64}$/.test(String(raw.skill?.bundleHash || "")) ||
    !/^[a-f0-9]{64}$/.test(String(raw.skill?.skillFileHash || "")) ||
    raw.runtime?.bundleVersion !== TCSD_RUNTIME_BUNDLE_VERSION ||
    !/^[a-f0-9]{64}$/.test(String(raw.runtime?.bundleHash || ""))
  ) {
    throw contractError("checkpoint 技能或 runtime bundle 追溯字段非法");
  }
  if (
    !raw.agent?.sessionId ||
    !raw.agent?.profile ||
    !raw.agent?.model ||
    !raw.agent?.tokenUsage ||
    !Number.isFinite(Number(raw.agent.tokenUsage.totalTokens)) ||
    Number(raw.agent.tokenUsage.totalTokens) < 0 ||
    raw.agent?.skillLoad?.source !== "hermes-state-db+skill-usage" ||
    raw.agent?.skillLoad?.loaded !== true ||
    raw.agent?.skillLoad?.skillName !== raw.skill?.name ||
    raw.agent?.skillLoad?.skillFileSha256 !== raw.skill?.skillFileHash ||
    !Number.isInteger(raw.agent?.skillLoad?.messageId) ||
    !/^[a-f0-9]{64}$/.test(String(raw.agent?.skillLoad?.messageSha256 || "")) ||
    !Number.isInteger(raw.agent?.skillLoad?.usageCountBefore) ||
    !Number.isInteger(raw.agent?.skillLoad?.usageCountAfter) ||
    raw.agent.skillLoad.usageCountBefore < 0 ||
    raw.agent.skillLoad.usageCountAfter <= raw.agent.skillLoad.usageCountBefore ||
    !Number.isFinite(Date.parse(String(raw.agent?.skillLoad?.lastUsedAt || "")))
  ) {
    throw contractError("checkpoint 缺少 session/profile/model/token usage 或运行态技能加载证据");
  }
  if (context.priorSessionIds?.has(raw.agent.sessionId)) {
    throw contractError("checkpoint 复用了既有 Hermes session", {}, TCSD_ERROR_CODES.sessionReuse);
  }
  if (!Number.isInteger(raw.attempt) || raw.attempt < 1 || raw.attempt > 2) {
    throw contractError("checkpoint attempt 非法");
  }
  if (!/^[a-f0-9]{64}$/.test(String(raw.prompt?.sha256 || ""))) throw contractError("checkpoint prompt hash 非法");
  if (raw.validation?.passed !== true || !raw.validation?.reportPath) {
    throw contractError("checkpoint 缺少通过的宿主验证报告");
  }
  if (!Array.isArray(raw.toolLogs) || !raw.toolLogs.length || raw.toolLogs.some((item) => (
    !item ||
    typeof item !== "object" ||
    !item.tool ||
    !item.status ||
    !Number.isFinite(Number(item.durationMs)) ||
    Object.hasOwn(item, "stdout") ||
    Object.hasOwn(item, "stderr")
  ))) {
    throw contractError("checkpoint 工具日志摘要非法");
  }
  const logText = JSON.stringify(raw.toolLogs);
  if (/hiddenReasoning|chainOfThought|apiKey|authorization|password|secret/i.test(logText)) {
    throw contractError("checkpoint 工具日志包含禁止记录的敏感或隐藏推理字段");
  }
}

export async function validateStageCheckpoint(raw = {}, context = {}) {
  if (
    raw.schema !== TCSD_CHECKPOINT_SCHEMA ||
    raw.pipelineSchema !== TCSD_PIPELINE_SCHEMA ||
    raw.jobId !== context.jobId ||
    raw.stageIndex !== context.stageIndex
  ) {
    throw contractError("checkpoint schema/jobId/stageIndex 不匹配");
  }
  validateTraceEnvelope(raw, context);
  const inputReference = await assertHashedJsonReference(
    context.workspaceDir,
    raw.input,
    TCSD_STAGE_INPUT_SCHEMA
  );
  if (
    inputReference.value.jobId !== context.jobId ||
    inputReference.value.stageIndex !== context.stageIndex ||
    inputReference.value.attempt !== raw.attempt
  ) {
    throw contractError("checkpoint 输入 manifest 与阶段/尝试不匹配");
  }
  const resultReference = await assertHashedJsonReference(
    context.workspaceDir,
    raw.result,
    TCSD_STAGE_RESULT_SCHEMA
  );
  const result = await validateStageResult(resultReference.value, context);
  if (
    raw.status !== result.status ||
    raw.summary !== result.summary ||
    raw.result.status !== result.status
  ) {
    throw contractError("checkpoint 与 stage result 状态或摘要不一致");
  }
  const validationReport = await evidenceJson(
    context.workspaceDir,
    raw.validation.reportPath,
    "tcsd-host-validation-report/v1"
  );
  if (
    validationReport.jobId !== context.jobId ||
    validationReport.stageIndex !== context.stageIndex ||
    validationReport.attempt !== raw.attempt ||
    validationReport.passed !== true
  ) {
    throw contractError("checkpoint 宿主验证报告与阶段/尝试不匹配");
  }
  const semanticReference = await assertHashedJsonReference(
    context.workspaceDir,
    raw.validation.semantic,
    "tcsd-host-semantic-validation/v1"
  );
  if (
    semanticReference.value.stageIndex !== context.stageIndex ||
    semanticReference.value.passed !== true ||
    context.semanticEvidence?.stageIndex !== semanticReference.value.stageIndex ||
    JSON.stringify(context.semanticEvidence?.details || {}) !== JSON.stringify(semanticReference.value.details || {})
  ) {
    throw contractError("checkpoint 宿主语义验证证据与恢复期复验不一致");
  }
  if (context.stageIndex === 12) {
    if (
      raw.executionManifest?.authority !== "host" ||
      raw.executionManifest?.status !== "completed" ||
      raw.executionManifest?.jobId !== context.jobId ||
      !Array.isArray(raw.artifactManifest)
    ) {
      throw contractError("第 12 阶段缺少宿主生成的最终 manifest");
    }
    const executionReference = await assertHashedJsonReference(
      context.workspaceDir,
      raw.executionManifest,
      TCSD_EXECUTION_MANIFEST_SCHEMA
    );
    const artifactManifestReference = await assertHashedJsonReference(
      context.workspaceDir,
      raw.artifactManifestReference,
      "tcsd-artifact-manifest/v1"
    );
    const timelineReference = await assertHashedJsonReference(
      context.workspaceDir,
      raw.timelineReference,
      "tcsd-stage-timeline/v1"
    );
    const planningMapping = raw.executionManifest?.evidence?.planningMappingAssessment;
    const planningMappingReference = await assertHashedJsonReference(
      context.workspaceDir,
      planningMapping,
      "tcsd-planning-mapping-assessment/v1"
    );
    if (
      executionReference.value.authority !== "host" ||
      executionReference.value.jobId !== context.jobId ||
      artifactManifestReference.value.authority !== "host" ||
      artifactManifestReference.value.jobId !== context.jobId ||
      timelineReference.value.authority !== "host" ||
      timelineReference.value.jobId !== context.jobId ||
      planningMapping?.authority !== "planning" ||
      planningMapping?.blocking !== false ||
      planningMapping?.supersededBy?.stageIndex !== 9 ||
      planningMapping?.supersededBy?.authority !== "measured-simulink-coverage" ||
      planningMapping?.supersededBy?.coverageArtifact !== executionReference.value.coverage?.initial_artifact ||
      planningMappingReference.value.authority !== "planning" ||
      planningMappingReference.value.blocking !== false ||
      planningMappingReference.value.status !== planningMapping.status
    ) {
      throw contractError("第 12 阶段宿主 manifest 权限或 jobId 不匹配");
    }
    const parsedManifest = parseExecutionManifest(executionReference.value);
    const threshold = Number(context.pipelineState?.input?.coverageThreshold || 80);
    const finalValidationCheckpoint = context.pipelineState?.stages?.[10]?.checkpoint;
    const expectedOracleCheckpoint = finalValidationCheckpoint?.status !== "skipped" && finalValidationCheckpoint?.evidence
      ? finalValidationCheckpoint
      : context.pipelineState?.stages?.[7]?.checkpoint;
    const expectedOracle = expectedOracleCheckpoint?.evidence;
    const expectedOracleStageIndex = expectedOracleCheckpoint === finalValidationCheckpoint ? 11 : 8;
    const workbookAbsolutePath = resolveWorkspacePath(
      context.workspaceDir,
      executionReference.value.workbook,
      "final workbook"
    );
    const workbookSha256 = createHash("sha256").update(await fs.readFile(workbookAbsolutePath)).digest("hex");
    const expectedCompletion = coverageCompletion(
      parsedManifest.final,
      !coverageMeetsThreshold(parsedManifest.final, threshold),
      threshold
    );
    if (
      parsedManifest.completion !== expectedCompletion ||
      !coverageMatches(parsedManifest.initial, context.pipelineState?.coverage?.initial) ||
      !coverageMatches(
        parsedManifest.final,
        context.pipelineState?.coverage?.final || context.pipelineState?.coverage?.initial
      ) ||
      parsedManifest.repair.required !== Boolean(context.pipelineState?.repair?.required) ||
      parsedManifest.repair.attempted !== Boolean(context.pipelineState?.repair?.attempted) ||
      parsedManifest.repair.applied !== Boolean(context.pipelineState?.repair?.applied) ||
      parsedManifest.repair.passes !== Number(context.pipelineState?.repair?.passes || 0) ||
      parsedManifest.oracle.sourceStageIndex !== expectedOracleStageIndex ||
      parsedManifest.oracle.testCaseCount !== Number(expectedOracle?.testCaseCount) ||
      parsedManifest.oracle.expValueCount !== Number(expectedOracle?.workbookBackfillCount) ||
      parsedManifest.oracle.simulationResult !== expectedOracle?.simulationResult ||
      parsedManifest.oracle.workbookSha256 !== workbookSha256 ||
      JSON.stringify(parsedManifest.oracle.testsWithoutExpectedValues) !== JSON.stringify(expectedOracle?.testsWithoutExpectedValues) ||
      JSON.stringify(parsedManifest.oracle.caseOutputCounts) !== JSON.stringify(expectedOracle?.caseOutputCounts)
    ) {
      throw contractError("第 12 阶段宿主 manifest 与已验证覆盖率/修正/oracle 状态不一致");
    }
  }
  return {
    ...raw,
    ...result,
    schema: TCSD_CHECKPOINT_SCHEMA,
    artifacts: raw.artifacts,
    executionManifest: raw.executionManifest,
    artifactManifest: raw.artifactManifest,
    artifactManifestReference: raw.artifactManifestReference,
    timelineReference: raw.timelineReference,
    input: { ...raw.input, absolutePath: inputReference.absolutePath },
    result: { ...raw.result, absolutePath: resultReference.absolutePath }
  };
}
