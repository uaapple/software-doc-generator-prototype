const QUEUE_POLL_ACTIVE_MS = 2500;
const QUEUE_POLL_IDLE_MS = 12000;

let queuePollTimer = 0;
let queueState = {
  tasks: [],
  counts: { queued: 0, running: 0, completed: 0, failed: 0 },
  drawerOpen: false
};

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value = "") {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function translateStatus(status = "") {
  if (status === "running") return "运行中";
  if (status === "queued") return "排队中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "已失败";
  return "待处理";
}

function statusTone(status = "") {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "queued";
}

function taskTypeLabel(type = "") {
  if (type === "document_extraction") return "文档提取";
  if (type === "module_skill_bootstrap") return "技能冷启动";
  if (type === "replay") return "Replay";
  return "文档生成";
}

function ensureStyles() {
  if (document.querySelector('link[data-task-queue-style="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/task-queue-widget.css";
  link.dataset.taskQueueStyle = "true";
  document.head.appendChild(link);
}

function ensureWidget() {
  ensureStyles();
  if (document.querySelector("#global-task-queue-button")) return;

  const button = document.createElement("button");
  button.id = "global-task-queue-button";
  button.className = "task-queue-trigger";
  button.type = "button";
  button.innerHTML = '<span>任务队列</span><strong id="global-task-queue-badge">0</strong>';
  button.addEventListener("click", openQueueDrawer);

  const target =
    document.querySelector(".top-actions") ||
    document.querySelector(".module-secondary-actions") ||
    document.querySelector(".strip-actions") ||
    document.querySelector(".top-nav .nav-links") ||
    document.querySelector(".page-head");
  if (target) {
    target.classList.add("task-queue-host");
    target.appendChild(button);
  }

  const backdrop = document.createElement("div");
  backdrop.id = "global-task-queue-backdrop";
  backdrop.className = "task-queue-backdrop";
  backdrop.hidden = true;
  backdrop.addEventListener("click", closeQueueDrawer);

  const drawer = document.createElement("aside");
  drawer.id = "global-task-queue-drawer";
  drawer.className = "task-queue-drawer";
  drawer.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = `
    <div class="task-queue-head">
      <div>
        <p class="task-queue-eyebrow">Hermes Agent</p>
        <h2>任务队列</h2>
        <p id="global-task-queue-summary">正在加载任务状态。</p>
      </div>
      <button id="global-task-queue-close" type="button" class="task-queue-close">关闭</button>
    </div>
    <div id="global-task-queue-list" class="task-queue-list"></div>
  `;
  drawer.querySelector("#global-task-queue-close")?.addEventListener("click", closeQueueDrawer);
  document.body.append(backdrop, drawer);
}

function openQueueDrawer() {
  queueState.drawerOpen = true;
  document.querySelector("#global-task-queue-backdrop").hidden = false;
  const drawer = document.querySelector("#global-task-queue-drawer");
  drawer.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  renderQueue();
  refreshQueue();
}

function closeQueueDrawer() {
  queueState.drawerOpen = false;
  document.querySelector("#global-task-queue-backdrop").hidden = true;
  const drawer = document.querySelector("#global-task-queue-drawer");
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.hidden = true;
}

async function refreshQueue() {
  try {
    const response = await fetch("/api/task-queue");
    if (!response.ok) return;
    const data = await response.json();
    queueState.tasks = data.tasks || [];
    queueState.counts = data.counts || {};
    renderQueue();
  } finally {
    scheduleQueuePoll();
  }
}

function scheduleQueuePoll() {
  window.clearTimeout(queuePollTimer);
  const activeCount = Number(queueState.counts.running || 0) + Number(queueState.counts.queued || 0);
  queuePollTimer = window.setTimeout(refreshQueue, activeCount ? QUEUE_POLL_ACTIVE_MS : QUEUE_POLL_IDLE_MS);
}

function renderQueue() {
  const running = Number(queueState.counts.running || 0);
  const queued = Number(queueState.counts.queued || 0);
  const badge = document.querySelector("#global-task-queue-badge");
  const button = document.querySelector("#global-task-queue-button");
  if (badge) badge.textContent = String(running + queued);
  button?.classList.toggle("has-active", running + queued > 0);

  const summary = document.querySelector("#global-task-queue-summary");
  if (summary) summary.textContent = `运行中 ${running} / 排队 ${queued}`;

  const listRoot = document.querySelector("#global-task-queue-list");
  if (!listRoot) return;
  const groups = [
    ["running", "运行中"],
    ["queued", "排队中"],
    ["failed", "失败"],
    ["completed", "最近完成"]
  ];
  const html = groups
    .map(([status, title]) => {
      const tasks = queueState.tasks.filter((task) => task.status === status).slice(0, status === "completed" ? 8 : 20);
      if (!tasks.length) return "";
      return `
        <section class="task-queue-group">
          <div class="task-queue-group-head">
            <h3>${escapeHtml(title)}</h3>
            <span>${tasks.length}</span>
          </div>
          ${tasks.map(renderTaskCard).join("")}
        </section>
      `;
    })
    .join("");
  listRoot.innerHTML = html || '<div class="task-queue-empty">当前没有 Hermes 任务。</div>';
}

function renderTaskCard(task = {}) {
  const percent = Number(task.progress?.percent || 0);
  const queueText = task.status === "queued" && task.queuePosition ? `队列位置 ${task.queuePosition}` : translateStatus(task.status);
  return `
    <a class="task-queue-card ${statusTone(task.status)}" href="${escapeHtml(task.detailUrl || "#")}">
      <div class="task-queue-card-top">
        <span>${escapeHtml(taskTypeLabel(task.type))}</span>
        <strong>${escapeHtml(queueText)}</strong>
      </div>
      <h4>${escapeHtml(task.title || "Hermes 任务")}</h4>
      <p>${escapeHtml(task.latestMessage || task.progress?.label || "等待状态更新。")}</p>
      <div class="task-queue-meta">
        <span>${escapeHtml(task.projectName || "工程")}</span>
        <span>${escapeHtml(task.moduleName || "模块")}</span>
        <span>${formatDateTime(task.updatedAt || task.createdAt)}</span>
      </div>
      ${
        task.status === "running" && percent
          ? `<div class="task-queue-progress"><span style="width:${Math.max(2, Math.min(100, percent))}%"></span></div>`
          : ""
      }
    </a>
  `;
}

ensureWidget();
refreshQueue();
