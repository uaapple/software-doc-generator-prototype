// Shared TCSD asynchronous-job contract.  Display names deliberately remain Chinese.
export const TCSD_PIPELINE_SCHEMA = "tcsd-deterministic-pipeline/v1";
export const TCSD_STAGE_NAMES = [
  "校验输入文件与项目附件", "检查 MATLAB 与模型工具环境", "初始化模型工作区", "加载模型并提取输入输出接口",
  "分析条件、判定与 MC/DC 覆盖目标", "生成并验证状态及时序刺激", "生成并校验首版测试用例", "运行模型仿真并回填期望值",
  "采集首轮覆盖率", "根据覆盖率修正测试用例", "运行最终仿真与覆盖率检查", "整理任务产物并清理运行环境"
];
export const TCSD_RUN_STATES = ["等待执行", "正在执行", "已完成", "部分完成", "已跳过", "失败"];
export const TCSD_ERROR_CODES = Object.freeze({
  workerUnavailable: "tcsd_worker_unavailable", jobNotFound: "tcsd_job_not_found", environment: "tcsd_environment_gate_failed",
  checkpoint: "tcsd_checkpoint_invalid", stage: "tcsd_stage_failed", input: "tcsd_input_invalid"
});
export function createStages() {
  return TCSD_STAGE_NAMES.map((name, index) => ({ index: index + 1, name, status: "等待执行", startedAt: "", endedAt: "", summary: "", skipReason: "", error: null, checkpoint: null }));
}
export function isTerminalStatus(status = "") { return ["已完成", "部分完成", "已跳过", "失败"].includes(status); }
export function canTransition(from = "", to = "") {
  return from === to || (from === "等待执行" && ["正在执行", "已跳过", "失败"].includes(to)) ||
    (from === "正在执行" && ["已完成", "部分完成", "已跳过", "失败"].includes(to));
}
export function coverageCompletion(coverage = {}, unresolved = false) {
  const values = [coverage.condition, coverage.decision, coverage.mcdc].map(Number);
  return unresolved || values.some((value) => !Number.isFinite(value) || value < 80) ? "partial" : "complete";
}
