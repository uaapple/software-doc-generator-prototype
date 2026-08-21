import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson } from "./storage.js";

const PRICES_CNY_PER_MILLION = {
  idle: { cacheHitInput: 0.05, cacheMissInput: 1.5, output: 4.5 },
  peak: { cacheHitInput: 0.10, cacheMissInput: 3.0, output: 9.0 }
};

function pricingPeriod(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "idle";
  const beijingHour = (date.getUTCHours() + 8) % 24;
  return (beijingHour >= 9 && beijingHour < 12) || (beijingHour >= 14 && beijingHour < 18) ? "peak" : "idle";
}

function beijingDate(value = "") {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + (8 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function usageFrom(task = {}) {
  let values = (task.pipeline?.stages || []).map((stage) => stage?.checkpoint?.agent?.tokenUsage).filter(Boolean);
  if (!values.length) {
    const latestBySession = new Map();
    for (const event of task.runtimeEvents || []) if (event?.tokenUsage) latestBySession.set(event.sessionId || `event-${latestBySession.size}`, event.tokenUsage);
    values = [...latestBySession.values()];
  }
  if (!values.length && task.hermes?.tokenUsage) values = [task.hermes.tokenUsage];
  if (!values.length) return null;
  const result = values.reduce((sum, item) => {
    for (const key of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"]) sum[key] += Math.max(0, Number(item?.[key] || 0) || 0);
    return sum;
  }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 });
  result.totalTokens = result.inputTokens + result.outputTokens + result.cacheReadTokens + result.cacheWriteTokens;
  result.pricingPeriod = pricingPeriod(task.startedAt || task.createdAt);
  const prices = PRICES_CNY_PER_MILLION[result.pricingPeriod];
  result.estimatedCostCny = ((result.cacheReadTokens * prices.cacheHitInput) + ((result.inputTokens + result.cacheWriteTokens) * prices.cacheMissInput) + (result.outputTokens * prices.output)) / 1_000_000;
  return result;
}

async function loadTasks(dir = "", type = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const task = await readJson(path.join(dir, entry.name, "task.json"), null);
    if (task?.id) tasks.push({ ...task, statisticsType: type });
  }
  return tasks;
}

export class TaskStatisticsService {
  constructor(config = {}) {
    this.unitDir = config.unitDir;
    this.detailDir = config.detailDir;
  }

  async getStatistics({ taskType = "all", groupBy = "project", projectId = "all", accountId = "all", startedFrom = "", startedTo = "" } = {}, accounts = []) {
    const raw = [
      ...(await loadTasks(this.unitDir, "unit_test")),
      ...(await loadTasks(this.detailDir, "software_detail"))
    ];
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const allTasks = raw.map((task) => {
      const project = task.unitTestProject || {};
      const account = accountMap.get(task.createdBy?.id) || task.createdBy || null;
      const usage = usageFrom(task);
      return {
        id: task.id,
        type: task.statisticsType,
        title: task.title || task.inputs?.modelSlx?.originalName || "任务",
        projectId: project.id || "unassigned",
        projectName: project.label || project.name || "未归属项目",
        accountId: account?.id || "legacy",
        accountName: account?.displayName || account?.username || "历史任务（未归属）",
        startedAt: task.startedAt || task.createdAt || "",
        endedAt: task.completedAt || task.failedAt || (["completed", "failed", "cancelled"].includes(task.status) ? task.updatedAt : ""),
        status: task.status || "",
        success: task.status === "completed",
        usage
      };
    }).sort((a, b) => Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0));
    const projects = [...new Map(allTasks.map((task) => [task.projectId, { id: task.projectId, name: task.projectName }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    const accountDimensions = [...new Map(allTasks.map((task) => [task.accountId, { id: task.accountId, name: task.accountName }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    const tasks = allTasks.filter((task) =>
      (taskType === "all" || task.type === taskType)
      && (projectId === "all" || task.projectId === projectId)
      && (accountId === "all" || task.accountId === accountId)
      && (!startedFrom || beijingDate(task.startedAt) >= startedFrom)
      && (!startedTo || beijingDate(task.startedAt) <= startedTo)
    );
    const groups = new Map();
    for (const task of tasks) {
      const key = groupBy === "account" ? task.accountId : task.projectId;
      const name = groupBy === "account" ? task.accountName : task.projectName;
      const group = groups.get(key) || { id: key, name, taskCount: 0, successCount: 0, totalTokens: 0, estimatedCostCny: 0, usageTaskCount: 0 };
      group.taskCount += 1;
      group.successCount += task.success ? 1 : 0;
      if (task.usage) { group.totalTokens += task.usage.totalTokens; group.estimatedCostCny += task.usage.estimatedCostCny; group.usageTaskCount += 1; }
      groups.set(key, group);
    }
    const summaries = [...groups.values()].map((item) => ({ ...item, successRate: item.taskCount ? item.successCount / item.taskCount : 0 }));
    return {
      filters: { taskType, groupBy, projectId, accountId, startedFrom, startedTo },
      dimensions: { projects, accounts: accountDimensions },
      totals: { taskCount: tasks.length, successCount: tasks.filter((task) => task.success).length, totalTokens: tasks.reduce((sum, task) => sum + (task.usage?.totalTokens || 0), 0), estimatedCostCny: tasks.reduce((sum, task) => sum + (task.usage?.estimatedCostCny || 0), 0), usageTaskCount: tasks.filter((task) => task.usage).length },
      groups: summaries,
      tasks,
      pricing: {
        model: "deepseek-v4-flash",
        currency: "CNY",
        periods: PRICES_CNY_PER_MILLION,
        peakHoursBeijing: ["09:00-12:00", "14:00-18:00"],
        note: "按任务开始时刻所属时段估算；高峰为北京时间 09:00-12:00、14:00-18:00，其余为空闲时段。"
      }
    };
  }
}
