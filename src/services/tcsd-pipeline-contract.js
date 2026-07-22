import { promises as fs } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

export const TCSD_PIPELINE_SCHEMA = "tcsd-deterministic-pipeline/v1";
export const TCSD_CHECKPOINT_SCHEMA = "tcsd-stage-checkpoint/v1";
export const TCSD_EXECUTION_MANIFEST_SCHEMA = "simulink-ut-tcsd-execution-manifest/v1";
export const TCSD_STAGE_NAMES = [
  "校验输入文件与项目附件", "检查 MATLAB 与模型工具环境", "初始化模型工作区", "加载模型并提取输入输出接口",
  "分析条件、判定与 MC/DC 覆盖目标", "生成并验证状态及时序刺激", "生成并校验首版测试用例", "运行模型仿真并回填期望值",
  "采集首轮覆盖率", "根据覆盖率修正测试用例", "运行最终仿真与覆盖率检查", "整理任务产物并清理运行环境"
];
export const TCSD_RUN_STATES = ["等待执行", "正在执行", "已完成", "部分完成", "已跳过", "失败"];
export const TCSD_ERROR_CODES = Object.freeze({
  workerUnavailable: "tcsd_worker_unavailable", jobNotFound: "tcsd_job_not_found", environment: "tcsd_environment_gate_failed",
  checkpoint: "tcsd_checkpoint_invalid", stage: "tcsd_stage_failed", input: "tcsd_input_invalid", pollTimeout: "tcsd_poll_timeout",
  transientNetwork: "tcsd_transient_network", illegalTransition: "tcsd_illegal_transition"
});
export function createStages() {
  return TCSD_STAGE_NAMES.map((name, index) => ({ index: index + 1, name, status: "等待执行", startedAt: "", endedAt: "", attempt: 0, summary: "", skipReason: "", error: null, checkpoint: null }));
}
export function isTerminalJobStatus(status = "") { return ["已完成", "部分完成", "失败"].includes(status); }
export function canTransition(from = "", to = "") {
  return from === to || (from === "等待执行" && ["正在执行", "已跳过", "失败"].includes(to)) ||
    (from === "正在执行" && ["已完成", "部分完成", "已跳过", "失败", "等待执行"].includes(to));
}
function contractError(message, details = {}) { return Object.assign(new Error(message), { code: TCSD_ERROR_CODES.checkpoint, details }); }
function metricObject(value, model, metric) {
  if (!value || typeof value !== "object") throw contractError(`覆盖率缺少 ${model}.${metric}`);
  const percent = Number(value.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || typeof value.passed !== "boolean") throw contractError(`覆盖率字段非法 ${model}.${metric}`);
  return { percent, passed: value.passed };
}
export function normalizeCoverageReport(report = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw contractError("覆盖率报告必须是对象");
  const source = report.models && typeof report.models === "object" ? report.models : report;
  const models = {};
  for (const [model, record] of Object.entries(source)) {
    if (!record || typeof record !== "object" || !record.condition || !record.decision || !record.mcdc) continue;
    models[model] = { condition: metricObject(record.condition, model, "condition"), decision: metricObject(record.decision, model, "decision"), mcdc: metricObject(record.mcdc, model, "mcdc") };
  }
  if (!Object.keys(models).length) throw contractError("覆盖率报告没有有效模型记录");
  const aggregate = {};
  for (const metric of ["condition", "decision", "mcdc"]) {
    const entries = Object.values(models).map((record) => record[metric]);
    aggregate[metric] = { percent: Math.min(...entries.map((item) => item.percent)), passed: entries.every((item) => item.passed) };
  }
  return { models, aggregate };
}
export function coverageMeetsThreshold(coverage = {}, threshold = 80) {
  const aggregate = coverage.aggregate || coverage;
  return ["condition", "decision", "mcdc"].every((metric) => Number.isFinite(Number(aggregate[metric]?.percent ?? aggregate[metric])) && Number(aggregate[metric]?.percent ?? aggregate[metric]) >= threshold);
}
export function coverageCompletion(coverage = {}, unresolved = false, threshold = 80) { return unresolved || !coverageMeetsThreshold(coverage, threshold) ? "partial" : "complete"; }
export function parseExecutionManifest(manifest = {}) {
  if (manifest.schema !== TCSD_EXECUTION_MANIFEST_SCHEMA || manifest.status !== "completed" || !["complete", "partial"].includes(manifest.completion)) throw contractError("最终执行 manifest schema/status/completion 非法");
  const initial = normalizeCoverageReport(manifest.coverage?.initial);
  const final = normalizeCoverageReport(manifest.coverage?.final);
  const repair = {
    required: Boolean(manifest.coverage?.repair_required), attempted: Boolean(manifest.coverage?.repair_attempted), applied: Boolean(manifest.coverage?.repair_applied),
    passes: Number(manifest.coverage?.repair_passes || 0), reason: String(manifest.coverage?.repair_reason || ""), evidence: String(manifest.coverage?.repair_evidence || "")
  };
  if (repair.passes < 0 || repair.passes > 1 || repair.applied !== (repair.passes === 1) || (repair.attempted && !repair.reason)) throw contractError("repair 字段不满足单轮修正规则");
  return { completion: manifest.completion, initial, final, repair, workbook: manifest.workbook, simulation: manifest.simulation, evidence: manifest.evidence, initialArtifact: manifest.coverage?.initial_artifact, finalArtifact: manifest.coverage?.final_artifact };
}
async function assertArtifact(rootDir, artifact = {}) {
  if (!artifact || typeof artifact !== "object" || !artifact.path || !artifact.kind) throw contractError("checkpoint artifact 缺少 path/kind");
  const absolute = path.isAbsolute(artifact.path) ? path.resolve(artifact.path) : path.resolve(rootDir, artifact.path);
  const root = path.resolve(rootDir);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw contractError("checkpoint artifact 越出任务 workspace");
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw contractError(`checkpoint artifact 不存在或为空: ${artifact.path}`);
  if (artifact.kind === "json") { try { JSON.parse(await fs.readFile(absolute, "utf8")); } catch { throw contractError(`checkpoint JSON 非法: ${artifact.path}`); } }
  if (artifact.kind === "xlsx") { const header = await fs.readFile(absolute).then((buffer) => buffer.subarray(0, 2).toString("binary")); if (header !== "PK") throw contractError(`checkpoint XLSX 格式非法: ${artifact.path}`); }
  return { ...artifact, absolutePath: absolute, size: stat.size };
}
function xlsxText(buffer) {
  const result = []; let eocd = -1; for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 66000); offset -= 1) if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  if (eocd < 0) throw contractError("XLSX zip 目录非法"); let offset = buffer.readUInt32LE(eocd + 16); const count = buffer.readUInt16LE(eocd + 10);
  for (let index = 0; index < count; index += 1) { if (buffer.readUInt32LE(offset) !== 0x02014b50) throw contractError("XLSX zip entry 非法"); const method = buffer.readUInt16LE(offset + 10), size = buffer.readUInt32LE(offset + 20), nameLength = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42), name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"); offset += 46 + nameLength + extra + comment; if (!name.endsWith(".xml")) continue; const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28), start = local + 30 + localName + localExtra, compressed = buffer.subarray(start, start + size); result.push((method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8")); }
  return result.join("\n");
}
async function evidenceJson(rootDir, relativePath, expectedSchema) { const absolute = path.resolve(rootDir, relativePath); const data = JSON.parse(await fs.readFile(absolute, "utf8")); if (expectedSchema && data.schema !== expectedSchema) throw contractError(`证据 schema 非法: ${relativePath}`); return data; }
async function validateBackfillEvidence(raw, context, artifacts) {
  const simulationCount = Number(raw.evidence?.simulationValueCount || 0), workbookCount = Number(raw.evidence?.workbookBackfillCount || 0), expCount = Number(raw.evidence?.expValueCount || 0), items = raw.evidence?.backfillItems;
  if (!raw.evidence?.simulationResult || simulationCount < 1 || workbookCount !== simulationCount || expCount !== workbookCount || !Array.isArray(items) || items.length !== workbookCount || !raw.evidence?.caseOutputCounts) throw contractError(`第 ${context.stageIndex} 阶段缺少逐项仿真/回填交叉证据`);
  const identities = new Set();
  for (const item of items) { const key = `${item?.row}|${item?.testId}|${item?.step}|${item?.output}`; if (!Number.isInteger(item?.row) || item.row < 1 || !item?.testId || !Number.isInteger(item?.step) || item.step < 1 || !item?.output || !Number.isFinite(Number(item?.value)) || identities.has(key)) throw contractError(`第 ${context.stageIndex} 阶段回填明细非法或重复`); identities.add(key); }
  const workbook = artifacts.find((item) => item.kind === "xlsx"); if (!workbook || !xlsxText(await fs.readFile(workbook.absolutePath)).includes("expValue(")) throw contractError(`第 ${context.stageIndex} 阶段 workbook 没有实际 expValue`);
  const simulation = artifacts.find((item) => item.path === raw.evidence.simulationResult); if (!simulation) throw contractError(`第 ${context.stageIndex} 阶段仿真结果未列入产物`);
}
export async function validateStageCheckpoint(raw = {}, context = {}) {
  if (raw.schema !== TCSD_CHECKPOINT_SCHEMA || raw.jobId !== context.jobId || raw.stageIndex !== context.stageIndex || !["completed", "partial", "skipped"].includes(raw.status)) throw contractError("checkpoint schema/jobId/stageIndex/status 不匹配");
  const artifacts = [];
  for (const artifact of Array.isArray(raw.artifacts) ? raw.artifacts : []) artifacts.push(await assertArtifact(context.workspaceDir, artifact));
  if (raw.status !== "skipped" && !artifacts.length) throw contractError("非跳过阶段必须提供已验证产物");
  if (raw.status === "skipped" && !raw.skipReason) throw contractError("跳过阶段必须提供原因");
  if (context.stageIndex === 3) {
    if (!raw.evidence?.initializationManifest) throw contractError("第 3 阶段缺少工作区初始化 manifest");
    const initialized = await evidenceJson(context.workspaceDir, raw.evidence.initializationManifest, "tcsd-workspace-initialization/v1");
    if (initialized.jobId !== context.jobId || initialized.completed !== true) throw contractError("第 3 阶段初始化 manifest 未完成或 jobId 不匹配");
  }
  if (context.stageIndex === 8) {
    await validateBackfillEvidence(raw, context, artifacts);
  }
  if (context.stageIndex === 9) raw.coverage = normalizeCoverageReport(raw.coverage);
  if (context.stageIndex === 10 && raw.status !== "skipped") {
    if (!raw.repair?.attempted || Number(raw.repair?.passes || 0) > 1 || !raw.evidence?.coverageIr) throw contractError("第 10 阶段缺少 Coverage IR 单轮修正证据");
  }
  if (context.stageIndex === 11 && raw.status !== "skipped") { await validateBackfillEvidence(raw, context, artifacts); raw.coverage = normalizeCoverageReport(raw.coverage); }
  if (context.stageIndex === 12) {
    if (!raw.evidence?.executionManifest || !raw.evidence?.timeline || !raw.evidence?.artifactManifest || !raw.evidence?.cleanup) throw contractError("第 12 阶段缺少最终 manifest/时间线/产物/清理证据");
    raw.executionManifest = parseExecutionManifest(await evidenceJson(context.workspaceDir, raw.evidence.executionManifest, TCSD_EXECUTION_MANIFEST_SCHEMA));
    await evidenceJson(context.workspaceDir, raw.evidence.timeline, "tcsd-stage-timeline/v1"); const artifactManifest = await evidenceJson(context.workspaceDir, raw.evidence.artifactManifest, "tcsd-artifact-manifest/v1"); const cleanup = await evidenceJson(context.workspaceDir, raw.evidence.cleanup, "tcsd-cleanup-result/v1");
    if (cleanup.ownerJobId !== context.jobId || cleanup.jobId !== context.jobId || artifactManifest.jobId !== context.jobId) throw contractError("第 12 阶段资源/产物所有权与 jobId 不一致"); raw.artifactManifest = [];
    for (const item of Array.isArray(artifactManifest.artifacts) ? artifactManifest.artifacts : []) raw.artifactManifest.push(await assertArtifact(context.workspaceDir, item));
    for (const reference of [raw.executionManifest.workbook, raw.executionManifest.simulation?.result, raw.executionManifest.initialArtifact, raw.executionManifest.finalArtifact, raw.executionManifest.evidence?.obligations, raw.executionManifest.evidence?.mapping_report].filter(Boolean)) await assertArtifact(context.workspaceDir, { path: reference, kind: reference.endsWith(".xlsx") ? "xlsx" : "json" });
  }
  return { ...raw, artifacts };
}
