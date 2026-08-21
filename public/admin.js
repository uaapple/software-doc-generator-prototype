const fmt = new Intl.NumberFormat("zh-CN");
const money = (value) => `¥${Number(value || 0).toFixed(4)}`;
const time = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const adminViews = new Set(["task-audit", "account-create", "password-change", "model-credentials"]);

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

function setSelectOptions(select, items, allLabel, selectedValue) {
  select.innerHTML = [`<option value="all">${allLabel}</option>`, ...items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)].join("");
  select.value = items.some((item) => item.id === selectedValue) ? selectedValue : "all";
}

function taskStatus(task) {
  if (task.status === "completed") return { label: "成功", className: "status-success" };
  if (task.status === "failed") return { label: "失败", className: "status-failed" };
  if (task.status === "cancelled") return { label: "已取消", className: "status-other" };
  const labels = { queued: "等待中", running: "执行中", pending: "待处理" };
  return { label: labels[task.status] || task.status || "未知", className: "status-other" };
}

async function loadAccounts() {
  const { accounts } = await request("/api/admin/accounts");
  document.querySelector("#account-count").textContent = `${accounts.length} 个账户`;
  document.querySelector("#account-list").innerHTML = accounts.map((item) => `<span class="account-chip"><strong>${escapeHtml(item.displayName)}</strong>&nbsp;·&nbsp;${escapeHtml(item.username)}${item.role === "admin" ? "&nbsp;·&nbsp;管理员" : ""}</span>`).join("");
}

function showAdminView() {
  const requested = window.location.hash.slice(1);
  const activeView = adminViews.has(requested) ? requested : "task-audit";
  for (const panel of document.querySelectorAll("[data-admin-panel]")) panel.hidden = panel.dataset.adminPanel !== activeView;
  for (const link of document.querySelectorAll("[data-admin-view]")) {
    if (link.dataset.adminView === activeView) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (!requested) window.history.replaceState(null, "", `#${activeView}`);
}

async function loadStatistics() {
  const typeSelect = document.querySelector("#task-type-filter");
  const projectSelect = document.querySelector("#task-project-filter");
  const accountSelect = document.querySelector("#task-account-filter");
  const selected = {
    taskType: typeSelect.value || "all",
    projectId: projectSelect.value || "all",
    accountId: accountSelect.value || "all",
    startedFrom: document.querySelector("#task-start-date").value,
    startedTo: document.querySelector("#task-end-date").value
  };
  const query = new URLSearchParams({ groupBy: "project", ...selected });
  const data = await request(`/api/admin/statistics?${query}`);

  setSelectOptions(projectSelect, data.dimensions?.projects || [], "全部项目", selected.projectId);
  setSelectOptions(accountSelect, data.dimensions?.accounts || [], "全部发起人", selected.accountId);

  const successRate = data.totals.taskCount ? data.totals.successCount / data.totals.taskCount : 0;
  document.querySelector("#metrics").innerHTML = [
    ["筛选结果", fmt.format(data.totals.taskCount)],
    ["成功率", `${(successRate * 100).toFixed(1)}%`],
    ["Token", fmt.format(data.totals.totalTokens)],
    ["估算费用", money(data.totals.estimatedCostCny)]
  ].map(([label, value]) => `<div class="telemetry"><span>${label}</span><strong>${value}</strong></div>`).join("");

  const maxCount = Math.max(1, ...data.groups.map((item) => item.taskCount));
  document.querySelector("#bars").innerHTML = data.groups.map((item) => `<div class="rail-row"><span class="rail-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><div class="rail-track"><div class="rail-fill" style="width:${item.taskCount / maxCount * 100}%"></div></div><strong class="rail-value">${item.taskCount} · ${(item.successRate * 100).toFixed(0)}%</strong></div>`).join("") || '<p class="panel-copy">当前筛选条件下暂无任务。</p>';

  document.querySelector("#task-result-count").textContent = `共 ${data.totals.taskCount} 条记录`;
  document.querySelector("#pricing-note").textContent = `${data.pricing.note} 无 Token 记录的历史任务显示为“无数据”。`;
  const rows = data.tasks.map((task) => {
    const status = taskStatus(task);
    return `<tr><td class="task-cell">${escapeHtml(task.title)}<small>${task.type === "unit_test" ? "单元测试用例生成" : "软件详设生成"}</small></td><td>${escapeHtml(task.projectName)}</td><td>${escapeHtml(task.accountName)}</td><td>${time(task.startedAt)}</td><td>${time(task.endedAt)}</td><td><span class="status-badge ${status.className}">${status.label}</span></td><td class="numeric">${task.usage ? fmt.format(task.usage.totalTokens) : "无数据"}</td><td class="numeric">${task.usage ? `${money(task.usage.estimatedCostCny)} · ${task.usage.pricingPeriod === "peak" ? "高峰" : "空闲"}` : "无数据"}</td></tr>`;
  }).join("");
  document.querySelector("#task-rows").innerHTML = rows;
  document.querySelector(".table-wrap").hidden = !data.tasks.length;
  document.querySelector("#task-empty").hidden = Boolean(data.tasks.length);
}

document.querySelector("#account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#account-status");
  try {
    await request("/api/admin/accounts", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    event.currentTarget.reset();
    status.textContent = "账户已创建。";
    status.hidden = false;
    await Promise.all([loadAccounts(), loadStatistics()]);
  } catch (error) {
    status.textContent = error.message;
    status.hidden = false;
  }
});

document.querySelector("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#password-status");
  try {
    await request("/api/auth/change-password", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    status.textContent = "密码已修改，请重新登录。";
    status.hidden = false;
    setTimeout(() => { window.location.href = "/login"; }, 800);
  } catch (error) {
    status.textContent = error.message;
    status.hidden = false;
  }
});

for (const id of ["task-type-filter", "task-project-filter", "task-account-filter", "task-start-date", "task-end-date"]) {
  document.querySelector(`#${id}`).addEventListener("change", loadStatistics);
}

document.querySelector("#reset-task-filters").addEventListener("click", () => {
  document.querySelector("#task-type-filter").value = "all";
  document.querySelector("#task-project-filter").value = "all";
  document.querySelector("#task-account-filter").value = "all";
  document.querySelector("#task-start-date").value = "";
  document.querySelector("#task-end-date").value = "";
  loadStatistics();
});

document.querySelector("#admin-logout").addEventListener("click", async () => {
  await request("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
});

document.querySelector("#credential-key-toggle").addEventListener("click", () => {
  const input = document.querySelector("#credential-api-key");
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  document.querySelector("#credential-key-toggle").textContent = visible ? "显示" : "隐藏";
});

document.querySelector("#credential-base-url").addEventListener("input", (event) => {
  const baseURL = event.currentTarget.value.trim().replace(/\/+$/, "");
  document.querySelector("#credential-endpoint-preview").textContent = baseURL ? `POST ${baseURL}/responses` : "POST {Base URL}/responses";
});

document.querySelector("#worker-credential-form").addEventListener("submit", (event) => event.preventDefault());
window.addEventListener("hashchange", showAdminView);
showAdminView();

const auth = await request("/api/auth/status");
document.querySelector("#admin-current-user").textContent = auth.user?.displayName || auth.user?.username || "管理员";
await Promise.all([loadAccounts(), loadStatistics()]);
