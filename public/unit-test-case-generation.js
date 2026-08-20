const state = {
  tasks: [],
  projects: [],
  workers: [],
  selectedTaskId: new URLSearchParams(window.location.search).get("taskId") || "",
  taskProjectFilterId: new URLSearchParams(window.location.search).get("projectId") || "",
  polling: null,
  submitting: false,
  loadingProjects: false,
  loadingWorkers: false,
  projectMutating: false,
  projectLoadError: "",
  workerLoadError: "",
  deletingTaskIds: new Set(),
  redeliveringTaskIds: new Set()
};

const elements = {
  form: document.querySelector("#unit-test-form"),
  slxInput: document.querySelector("#model-slx-input"),
  matInput: document.querySelector("#model-mat-input"),
  initScriptInput: document.querySelector("#model-init-script-input"),
  projectSelect: document.querySelector("#unit-project-select"),
  workerSelect: document.querySelector("#unit-worker-select"),
  addProjectButton: document.querySelector("#unit-add-project-button"),
  deleteProjectButton: document.querySelector("#unit-delete-project-button"),
  startButton: document.querySelector("#unit-start-button"),
  formStatus: document.querySelector("#unit-form-status"),
  projectStatus: document.querySelector("#unit-project-status"),
  workerStatus: document.querySelector("#unit-worker-status"),
  taskProjectFilter: document.querySelector("#unit-task-project-filter"),
  taskList: document.querySelector("#unit-task-list"),
  taskDetail: document.querySelector("#unit-task-detail"),
  detailSubtitle: document.querySelector("#unit-task-detail-subtitle")
};

const STATUS_LABELS = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
  cancelled: "已取消"
};

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(value = 0) {
  const size = Number(value || 0);
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function compactJson(value, maxLength = 1600) {
  if (value === null || value === undefined || value === "") return "未记录";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n…` : text;
}

function formatTokenUsage(usage = null) {
  if (!usage) return "未记录";
  return [
    `input ${Number(usage.inputTokens || 0)}`,
    `output ${Number(usage.outputTokens || 0)}`,
    `total ${Number(usage.totalTokens || 0)}`
  ].join(" · ");
}

function formatPercent(value) {
  const percentage = Number(value ?? NaN);
  if (!Number.isFinite(percentage)) return "";
  return `${percentage % 1 === 0 ? String(percentage) : percentage.toFixed(1)}%`;
}

function renderCoverageChip(coverage) {
  const models = coverage && typeof coverage === "object" ? coverage.models : null;
  if (!models || typeof models !== "object") return "";
  const labels = { condition: "条件", decision: "判定", mcdc: "MC/DC" };
  const blocks = Object.entries(models)
    .map(([model, record]) => {
      const metrics = ["condition", "decision", "mcdc"]
        .map((key) => {
          const metric = record && typeof record === "object" ? record[key] : null;
          const percentage = formatPercent(metric?.percent);
          if (!percentage) return "";
          // Keep the summary chip compact: percentages only; covered/total
          // details stay in the expanded 覆盖率 section.
          return `${labels[key]} ${percentage}`;
        })
        .filter(Boolean);
      // Single-model runs omit the model prefix so the chip fits the panel.
      const prefix = blocks.length && Object.keys(models).length > 1 ? `${model}: ` : "";
      return `${prefix}${metrics.join(" · ")}`;
    })
    .filter(Boolean);
  return blocks.length ? blocks.join(" ｜ ") : "";
}

function renderPipelineStage(stage, pipelineCheckpoints = []) {
  const checkpoint = stage.checkpoint || null;
  const checkpointIndex = pipelineCheckpoints.find((item) => item.stageIndex === stage.index) || null;
  const skill = checkpoint?.skill || {};
  const agent = checkpoint?.agent || {};
  const artifacts = Array.isArray(checkpoint?.artifacts) ? checkpoint.artifacts : [];
  const attempts = Array.isArray(stage.attempts) ? stage.attempts : [];
  const coverage = checkpoint?.coverage || null;
  const coverageChip = renderCoverageChip(coverage);
  const artifactSummary = artifacts.length
    ? artifacts.map((item) => [item.role || item.kind || "artifact", item.fileName].filter(Boolean).join(": ")).join("\n")
    : "无";
  const attemptSummary = attempts.length
    ? attempts.map((item) => {
        const trace = [item.status, item.sessionId, item.model].filter(Boolean).join(" · ");
        return `#${item.attempt}: ${trace}`;
      }).join("\n")
    : "无";
  return `
    <details class="unit-runtime-item unit-stage-trace">
      <summary>
        <strong>${escapeHtml(`${stage.index}. ${stage.name} · ${stage.status}`)}</strong>
        <span>${escapeHtml(stage.summary || stage.skipReason || stage.error?.message || "等待执行")}</span>
        ${coverageChip ? `<span class="unit-stage-coverage">${escapeHtml(coverageChip)}</span>` : ""}
      </summary>
      <div class="unit-stage-trace-body">
        <dl class="unit-meta-list">
          <div><dt>技能</dt><dd>${escapeHtml(skill.name || stage.skillName || "等待执行")}</dd></div>
          <div><dt>版本 / bundle</dt><dd>${escapeHtml([skill.version || stage.skillVersion, skill.bundleVersion || stage.bundleVersion, skill.bundleHash].filter(Boolean).join(" · ") || "未记录")}</dd></div>
          <div><dt>Profile / Model</dt><dd>${escapeHtml([agent.profile, agent.model].filter(Boolean).join(" · ") || "未记录")}</dd></div>
          <div><dt>Session</dt><dd>${escapeHtml(agent.sessionId || "未记录")}</dd></div>
          <div><dt>Token</dt><dd>${escapeHtml(formatTokenUsage(agent.tokenUsage))}</dd></div>
          <div><dt>尝试次数</dt><dd>${escapeHtml(String(stage.attempt || 0))}</dd></div>
          <div><dt>Checkpoint</dt><dd>${escapeHtml(checkpointIndex?.schema || checkpoint?.schema || "未生成")}</dd></div>
          <div><dt>开始 / 结束</dt><dd>${escapeHtml([formatTime(stage.startedAt), formatTime(stage.endedAt)].filter(Boolean).join(" → ") || "未记录")}</dd></div>
        </dl>
        <h4>尝试与会话</h4>
        <pre>${escapeHtml(attemptSummary)}</pre>
        <h4>输入</h4>
        <pre>${escapeHtml(compactJson(checkpoint?.input))}</pre>
        <h4>结果</h4>
        <pre>${escapeHtml(compactJson(checkpoint?.result))}</pre>
        ${coverage ? `<h4>覆盖率</h4><pre>${escapeHtml(compactJson(coverage))}</pre>` : ""}
        <h4>工具日志摘要</h4>
        <pre>${escapeHtml(compactJson(checkpoint?.toolLogs))}</pre>
        <h4>宿主验证</h4>
        <pre>${escapeHtml(compactJson(checkpoint?.validation || stage.error))}</pre>
        <h4>产物</h4>
        <pre>${escapeHtml(artifactSummary)}</pre>
      </div>
    </details>
  `;
}

function isActiveStatus(status = "") {
  return status === "queued" || status === "running";
}

function setStatus(message = "", tone = "") {
  elements.formStatus.hidden = !message;
  elements.formStatus.textContent = message;
  elements.formStatus.dataset.tone = tone;
}

function setProjectStatus(message = "", tone = "") {
  if (!elements.projectStatus) return;
  elements.projectStatus.hidden = !message;
  elements.projectStatus.textContent = message;
  elements.projectStatus.dataset.tone = tone;
}

function setWorkerStatus(message = "", tone = "") {
  if (!elements.workerStatus) return;
  elements.workerStatus.hidden = !message;
  elements.workerStatus.textContent = message;
  elements.workerStatus.dataset.tone = tone;
}

async function requestJson(url, options = {}) {
  let response = null;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const networkError = new Error("无法连接后端服务，请确认本地服务正在运行后重试。");
    networkError.code = "network_unavailable";
    networkError.cause = error;
    throw networkError;
  }
  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(body?.error || `请求失败：${response.status}`);
    error.code = body?.code || "request_failed";
    error.details = body?.details || null;
    throw error;
  }
  return body;
}

function validateFile(input, extension, label) {
  const files = Array.from(input.files || []);
  if (files.length !== 1) {
    throw new Error(`请选择 1 个${label}。`);
  }
  if (!files[0].name.toLowerCase().endsWith(extension)) {
    throw new Error(`${label}只接受 ${extension} 文件。`);
  }
  return files[0];
}

function validateOptionalFile(input, extension, label) {
  const files = Array.from(input?.files || []);
  if (files.length > 1) {
    throw new Error(`${label}最多上传 1 个文件。`);
  }
  if (files.length === 1 && !files[0].name.toLowerCase().endsWith(extension)) {
    throw new Error(`${label}只接受 ${extension} 文件。`);
  }
  return files[0] || null;
}

function normalizeProject(project = {}) {
  const id = String(project.id || "").trim();
  const name = String(project.name || "").trim();
  const label = String(project.label || (id && name ? `${id}_${name}` : id || name)).trim();
  return { id, name, label };
}

function normalizeWorker(worker = {}) {
  const id = String(worker.id || "").trim();
  const label = String(worker.label || id).trim();
  return { id, label, isDefault: Boolean(worker.isDefault) };
}

function defaultTaskWorker() {
  return state.workers.find((worker) => worker.isDefault) || state.workers[0] || { id: "", label: "" };
}

function normalizeTaskWorker(worker = null) {
  const normalized = normalizeWorker(worker || {});
  return normalized.id ? normalized : defaultTaskWorker();
}

function defaultTaskProject() {
  return state.projects.find((project) => project.id === "01") || { id: "01", name: "楚能", label: "01_楚能" };
}

function normalizeTaskProject(project = null) {
  const normalized = normalizeProject(project || {});
  return normalized.id ? normalized : defaultTaskProject();
}

function taskMatchesProjectFilter(task = {}) {
  if (!state.taskProjectFilterId) return true;
  return normalizeTaskProject(task.unitTestProject).id === state.taskProjectFilterId;
}

function getSelectedProject() {
  const selectedId = elements.projectSelect?.value || "";
  return state.projects.find((project) => project.id === selectedId) || null;
}

function getSelectedWorker() {
  const selectedId = elements.workerSelect?.value || "";
  return state.workers.find((worker) => worker.id === selectedId) || null;
}

function syncProjectControls() {
  const hasProjects = state.projects.length > 0;
  const hasWorkers = state.workers.length > 0;
  if (elements.projectSelect) {
    elements.projectSelect.disabled = state.loadingProjects || state.projectMutating || !hasProjects;
  }
  if (elements.addProjectButton) {
    elements.addProjectButton.disabled = state.loadingProjects || state.projectMutating;
  }
  if (elements.deleteProjectButton) {
    elements.deleteProjectButton.disabled = state.loadingProjects || state.projectMutating || !hasProjects;
  }
  if (elements.workerSelect) {
    elements.workerSelect.disabled = state.loadingWorkers || !hasWorkers;
  }
  if (elements.startButton) {
    elements.startButton.disabled = state.submitting || !hasProjects || !hasWorkers;
  }
  if (elements.taskProjectFilter) {
    elements.taskProjectFilter.disabled = state.loadingProjects;
  }
}

function renderTaskProjectFilter(preferredProjectId = "") {
  if (!elements.taskProjectFilter) return;
  const currentValue = preferredProjectId || state.taskProjectFilterId || elements.taskProjectFilter.value || "";
  const options = [
    '<option value="">全部项目</option>',
    ...state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`)
  ];
  elements.taskProjectFilter.innerHTML = options.join("");
  const nextValue = state.projects.some((project) => project.id === currentValue) ? currentValue : "";
  elements.taskProjectFilter.value = nextValue;
  state.taskProjectFilterId = nextValue;
}

function renderProjects(preferredProjectId = "") {
  if (!elements.projectSelect) return;
  const currentValue = preferredProjectId || elements.projectSelect.value || "";
  if (state.loadingProjects) {
    elements.projectSelect.innerHTML = '<option value="">正在加载项目...</option>';
  } else if (state.projectLoadError) {
    elements.projectSelect.innerHTML = '<option value="">项目加载失败</option>';
  } else if (!state.projects.length) {
    elements.projectSelect.innerHTML = '<option value="">暂无项目</option>';
  } else {
    elements.projectSelect.innerHTML = state.projects
      .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`)
      .join("");
    const nextValue = state.projects.some((project) => project.id === currentValue)
      ? currentValue
      : state.projects[0]?.id || "";
    elements.projectSelect.value = nextValue;
  }
  renderTaskProjectFilter();
  syncProjectControls();
}

function renderWorkers(preferredWorkerId = "") {
  if (!elements.workerSelect) return;
  const currentValue = preferredWorkerId || elements.workerSelect.value || "";
  if (state.loadingWorkers) {
    elements.workerSelect.innerHTML = '<option value="">Loading workers...</option>';
  } else if (state.workerLoadError) {
    elements.workerSelect.innerHTML = '<option value="">Worker load failed</option>';
  } else if (!state.workers.length) {
    elements.workerSelect.innerHTML = '<option value="">No worker configured</option>';
  } else {
    elements.workerSelect.innerHTML = state.workers
      .map((worker) => `<option value="${escapeHtml(worker.id)}">${escapeHtml(worker.label)}</option>`)
      .join("");
    const nextValue = state.workers.some((worker) => worker.id === currentValue)
      ? currentValue
      : state.workers.find((worker) => worker.isDefault)?.id || state.workers[0]?.id || "";
    elements.workerSelect.value = nextValue;
  }
  syncProjectControls();
}

async function loadWorkers(options = {}) {
  let preferredWorkerId = options.selectWorkerId || "";
  state.loadingWorkers = true;
  state.workerLoadError = "";
  renderWorkers(preferredWorkerId);
  try {
    const body = await requestJson("/api/unit-test-case-generation/workers");
    state.workers = Array.isArray(body.workers) ? body.workers.map(normalizeWorker).filter((worker) => worker.id) : [];
    if (!preferredWorkerId) {
      preferredWorkerId = elements.workerSelect?.value || body.defaultWorkerId || state.workers[0]?.id || "";
    }
    if (!state.workers.length) {
      setWorkerStatus("No available Worker is configured.", "error");
    } else if (!options.preserveStatus) {
      setWorkerStatus("", "");
    }
  } catch (error) {
    state.workers = [];
    state.workerLoadError = error.message || "Worker list failed to load.";
    setWorkerStatus(state.workerLoadError, "error");
    throw error;
  } finally {
    state.loadingWorkers = false;
    renderWorkers(preferredWorkerId);
  }
}

async function loadProjects(options = {}) {
  let preferredProjectId = options.selectProjectId || "";
  state.loadingProjects = true;
  state.projectLoadError = "";
  renderProjects(preferredProjectId);
  try {
    const body = await requestJson("/api/unit-test-case-generation/projects");
    state.projects = Array.isArray(body.projects) ? body.projects.map(normalizeProject).filter((project) => project.id) : [];
    if (!preferredProjectId) {
      preferredProjectId = elements.projectSelect?.value || state.projects[0]?.id || "";
    }
    if (!state.projects.length) {
      setProjectStatus("暂无可选项目，请先新增项目。", "error");
    } else if (!options.preserveStatus) {
      setProjectStatus("", "");
    }
  } catch (error) {
    state.projects = [];
    state.projectLoadError = error.message || "项目列表加载失败。";
    setProjectStatus(state.projectLoadError, "error");
    throw error;
  } finally {
    state.loadingProjects = false;
    renderProjects(preferredProjectId);
  }
}

async function addProject() {
  if (state.projectMutating) return;
  const rawName = window.prompt("请输入项目名，例如 VCU：");
  if (rawName === null) return;
  const name = rawName.trim();
  if (!name) {
    setProjectStatus("项目名不能为空。", "error");
    return;
  }
  const authCode = window.prompt("请输入授权码：", "114301");
  if (authCode === null) return;

  state.projectMutating = true;
  syncProjectControls();
  setProjectStatus("正在新增项目。", "busy");
  try {
    const body = await requestJson("/api/unit-test-case-generation/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, authCode })
    });
    const project = normalizeProject(body.project || {});
    await loadProjects({ selectProjectId: project.id, preserveStatus: true });
    setProjectStatus(`已新增项目 ${project.label || name}。`, "success");
  } catch (error) {
    setProjectStatus(error.message || "新增项目失败。", "error");
  } finally {
    state.projectMutating = false;
    syncProjectControls();
  }
}

async function deleteProject() {
  if (state.projectMutating) return;
  const project = getSelectedProject();
  if (!project) {
    setProjectStatus("请先选择要删除的项目。", "error");
    return;
  }
  const authCode = window.prompt(`请输入授权码以删除 ${project.label}：`, "114301");
  if (authCode === null) return;

  state.projectMutating = true;
  syncProjectControls();
  setProjectStatus("正在删除项目登记。", "busy");
  try {
    await requestJson(`/api/unit-test-case-generation/projects/${encodeURIComponent(project.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authCode })
    });
    await loadProjects({ preserveStatus: true });
    setProjectStatus(`已删除项目 ${project.label}。`, "success");
  } catch (error) {
    setProjectStatus(error.message || "删除项目失败。", "error");
  } finally {
    state.projectMutating = false;
    syncProjectControls();
  }
}

async function submitTask(event) {
  event.preventDefault();
  if (state.submitting) return;
  try {
    validateFile(elements.slxInput, ".slx", "模型文件");
    validateFile(elements.matInput, ".mat", "数据文件");
    validateOptionalFile(elements.initScriptInput, ".m", "初始化脚本");
    const selectedProject = getSelectedProject();
    if (!selectedProject) {
      throw new Error("请选择项目。");
    }
    const selectedWorker = getSelectedWorker();
    if (!selectedWorker) {
      throw new Error("Please select a Worker.");
    }
    state.submitting = true;
    syncProjectControls();
    setStatus("正在创建任务并加入 Hermes 队列。", "busy");

    const formData = new FormData(elements.form);
    formData.set("unitTestProjectId", selectedProject.id);
    formData.set("workerId", selectedWorker.id);
    const body = await requestJson("/api/unit-test-case-generation/tasks", {
      method: "POST",
      body: formData
    });
    const task = body.task || body;
    state.selectedTaskId = task.id || "";
    updateUrlTaskId(state.selectedTaskId);
    await loadTasks({ preserveSelection: true });
    await loadSelectedTask();
    startPolling();
    elements.form.reset();
    renderProjects(selectedProject.id);
    renderWorkers(selectedWorker.id);
    setStatus("任务已发起。", "success");
  } catch (error) {
    setStatus(error.message || "任务创建失败。", "error");
  } finally {
    state.submitting = false;
    syncProjectControls();
  }
}

function updateUrlTaskId(taskId = "") {
  const url = new URL(window.location.href);
  if (taskId) {
    url.searchParams.set("taskId", taskId);
  } else {
    url.searchParams.delete("taskId");
  }
  window.history.replaceState({}, "", url);
}

function updateUrlProjectFilter(projectId = "") {
  const url = new URL(window.location.href);
  if (projectId) {
    url.searchParams.set("projectId", projectId);
  } else {
    url.searchParams.delete("projectId");
  }
  window.history.replaceState({}, "", url);
}

async function loadTasks(options = {}) {
  const query = state.taskProjectFilterId
    ? `?projectId=${encodeURIComponent(state.taskProjectFilterId)}`
    : "";
  const body = await requestJson(`/api/unit-test-case-generation/tasks${query}`);
  state.tasks = (Array.isArray(body.tasks) ? body.tasks : []).filter(taskMatchesProjectFilter);
  if (!options.preserveSelection && !state.selectedTaskId && state.tasks.length) {
    state.selectedTaskId = state.tasks[0].id;
    updateUrlTaskId(state.selectedTaskId);
  }
  if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = state.tasks[0]?.id || "";
    updateUrlTaskId(state.selectedTaskId);
  }
  renderTaskList();
}

async function loadSelectedTask() {
  if (!state.selectedTaskId) {
    renderTaskDetail(null);
    return null;
  }
  let task = null;
  try {
    task = await requestJson(`/api/unit-test-case-generation/tasks/${encodeURIComponent(state.selectedTaskId)}`);
  } catch (error) {
    if (error.code === "unit_test_case_task_not_found") {
      state.selectedTaskId = state.tasks[0]?.id || "";
      updateUrlTaskId(state.selectedTaskId);
      renderTaskList();
      renderTaskDetail(null);
      return null;
    }
    throw error;
  }
  if (!taskMatchesProjectFilter(task)) {
    state.selectedTaskId = state.tasks[0]?.id || "";
    updateUrlTaskId(state.selectedTaskId);
    renderTaskList();
    if (!state.selectedTaskId) {
      renderTaskDetail(null);
      return null;
    }
    return loadSelectedTask();
  }
  const index = state.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    state.tasks[index] = task;
  } else {
    state.tasks.unshift(task);
  }
  renderTaskList();
  renderTaskDetail(task);
  return task;
}

function renderTaskList() {
  if (!state.tasks.length) {
    elements.taskList.innerHTML = state.taskProjectFilterId
      ? '<div class="empty-state">该项目下暂无单元测试用例生成任务。</div>'
      : '<div class="empty-state">还没有单元测试用例生成任务。</div>';
    return;
  }
  elements.taskList.innerHTML = state.tasks
    .map((task) => {
      const selected = task.id === state.selectedTaskId ? " selected" : "";
      const progress = task.progress?.percent ?? (task.status === "completed" ? 100 : 0);
      const taskName = task.inputs?.modelSlx?.originalName || "Simulink 模型";
      const projectLabel = normalizeTaskProject(task.unitTestProject).label;
      const workerLabel = normalizeTaskWorker(task.workerProfile).label;
      const deleting = state.deletingTaskIds.has(task.id);
      return `
        <div class="unit-task-card${selected}" data-task-card-id="${escapeHtml(task.id)}">
          <button class="unit-task-card-main" type="button" data-task-id="${escapeHtml(task.id)}">
            <span class="unit-task-card-top">
              <strong>${escapeHtml(taskName)}</strong>
              <span class="unit-status unit-status-${escapeHtml(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status || "未知")}</span>
            </span>
            <span class="unit-task-card-meta">${escapeHtml(formatTime(task.updatedAt || task.createdAt))}</span>
            ${projectLabel ? `<span class="unit-task-card-project">${escapeHtml(projectLabel)}</span>` : ""}
            ${workerLabel ? `<span class="unit-task-card-worker">${escapeHtml(workerLabel)}</span>` : ""}
            <span class="unit-progress"><span style="width:${Math.max(2, Math.min(100, Number(progress || 0)))}%"></span></span>
          </button>
          <button
            class="unit-task-delete"
            type="button"
            data-delete-task-id="${escapeHtml(task.id)}"
            aria-label="删除任务 ${escapeHtml(taskName)}"
            title="删除任务"
            ${deleting ? "disabled" : ""}
          >×</button>
        </div>
      `;
    })
    .join("");
}

async function deleteTask(taskId = "") {
  if (!taskId || state.deletingTaskIds.has(taskId)) {
    return;
  }
  const task = state.tasks.find((item) => item.id === taskId);
  const taskName = task?.inputs?.modelSlx?.originalName || "这条生成任务";
  const active = task && isActiveStatus(task.status);
  const confirmed = window.confirm(
    active
      ? `确认终止并删除 ${taskName}？\n系统会先停止 Worker 中的实际作业，确认释放执行队列后，再清除任务文件和产物。`
      : `确认删除 ${taskName}？\n这会清除该任务上传文件、workspace 和生成产物。`
  );
  if (!confirmed) {
    return;
  }

  state.deletingTaskIds.add(taskId);
  renderTaskList();
  setStatus(active ? "正在终止 Worker 作业，确认停止后删除任务。" : "正在删除任务并清理产物。", "busy");
  try {
    await requestJson(`/api/unit-test-case-generation/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE"
    });
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    if (state.selectedTaskId === taskId) {
      state.selectedTaskId = state.tasks[0]?.id || "";
      updateUrlTaskId(state.selectedTaskId);
    }
    await loadTasks({ preserveSelection: true });
    if (state.selectedTaskId) {
      await loadSelectedTask();
    } else {
      renderTaskDetail(null);
    }
    const hasActive = state.tasks.some((item) => isActiveStatus(item.status));
    if (!hasActive) {
      stopPolling();
    }
    setStatus("任务已删除，相关文件已清理。", "success");
  } catch (error) {
    setStatus(error.message || "任务删除失败。", "error");
  } finally {
    state.deletingTaskIds.delete(taskId);
    renderTaskList();
  }
}

async function redeliverTask(taskId = "") {
  if (!taskId || state.redeliveringTaskIds.has(taskId)) return;
  state.redeliveringTaskIds.add(taskId);
  setStatus("正在重新投递到原 Windows Worker。", "busy");
  try {
    await requestJson(`/api/unit-test-case-generation/tasks/${encodeURIComponent(taskId)}/redeliver`, {
      method: "POST"
    });
    await loadTasks({ preserveSelection: true });
    await loadSelectedTask();
    startPolling();
    setStatus("重新投递已启动。", "success");
  } catch (error) {
    setStatus(error.message || "重新投递失败。", "error");
  } finally {
    state.redeliveringTaskIds.delete(taskId);
  }
}

function renderTaskDetail(task) {
  if (!task) {
    elements.detailSubtitle.textContent = "选择任务后查看运行摘要、错误信息和下载结果。";
    elements.taskDetail.innerHTML = '<div class="empty-state">暂无选中的生成任务。</div>';
    return;
  }
  const projectLabel = normalizeTaskProject(task.unitTestProject).label;
  const workerLabel = normalizeTaskWorker(task.workerProfile).label;
  const initScriptLabel = task.inputs?.modelInitScript?.originalName || "使用项目 addon 初始化";
  const finalValidationStage = (task.pipeline?.stages || []).find((stage) => Number(stage?.index) === 11);
  const validatedWorkbookPath = (finalValidationStage?.checkpoint?.artifacts || [])
    .find((artifact) => artifact?.kind === "xlsx" && artifact?.path)?.path;
  const modelFileName = task.inputs?.modelSlx?.originalName || "Model.slx";
  const finalWorkbookFileName = `${modelFileName.replace(/\.[^.]+$/, "")}_Test0001_tcsd.xlsx`;
  const standardizedWorkbookPath = `outputs/${finalWorkbookFileName}`;
  const finalWorkbookPath = (task.artifacts || []).some(
    (artifact) => artifact.relativePath === standardizedWorkbookPath && Number(artifact.expectedValueCount || 0) > 0
  )
    ? standardizedWorkbookPath
    : validatedWorkbookPath;
  const displayedArtifacts = finalWorkbookPath
    ? (task.artifacts || []).filter((artifact) => artifact.relativePath === finalWorkbookPath)
    : (task.artifacts || []);
  elements.detailSubtitle.textContent = [
    task.inputs?.modelSlx?.originalName || "Simulink 模型",
    projectLabel,
    workerLabel,
    STATUS_LABELS[task.status] || task.status
  ]
    .filter(Boolean)
    .join(" · ");
  const artifactHtml = displayedArtifacts.length
    ? `
      <div class="unit-detail-section unit-artifact-section">
        <div class="unit-artifact-head">
          <div>
            <h3>产物下载</h3>
            <p>TCSD Excel 已生成，优先下载产物进行复核。</p>
          </div>
          <span>XLSX</span>
        </div>
        <div class="unit-artifact-list">
          ${displayedArtifacts
            .map(
              (artifact) => `
                <a class="unit-artifact-link" href="/api/unit-test-case-generation/tasks/${encodeURIComponent(task.id)}/artifacts/${encodeURIComponent(artifact.id)}/download">
                  <span>
                    <strong>${escapeHtml(finalWorkbookPath ? finalWorkbookFileName : artifact.fileName)}</strong>
                    <small>${escapeHtml(formatBytes(artifact.size))} · ${escapeHtml(finalWorkbookPath ? `outputs/${finalWorkbookFileName}` : artifact.relativePath)}</small>
                  </span>
                  <b>下载 Excel</b>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
    `
    : "";
  const errorHtml =
    task.status === "failed"
      ? `
        <div class="unit-detail-section unit-error-box">
          <h3>失败原因</h3>
          <p>${escapeHtml(task.errorMessage || "任务失败，但未返回详细错误。")}</p>
        </div>
      `
      : "";
  const dshLogHtml = `
    <div class="unit-detail-section">
      <div class="unit-artifact-head">
        <div>
          <h3>DSH 会话日志</h3>
          <p>导出该生成任务的 DSH session log，用于生成质量分析。</p>
        </div>
        <span>JSONL</span>
      </div>
      <div class="unit-artifact-list">
        <button class="unit-artifact-link unit-dsh-log-export" type="button" data-dsh-log-task-id="${escapeHtml(task.id)}">
          <span>
            <strong>session.jsonl</strong>
            <small>结构化会话事件（模型推理 / 工具调用 / 阶段产物）</small>
          </span>
          <b>导出日志</b>
        </button>
      </div>
    </div>
  `;
  const warnings = Array.isArray(task.hermes?.warnings) ? task.hermes.warnings : [];
  const warningHtml = warnings.length
    ? `
      <div class="unit-detail-section">
        <h3>Hermes 提示</h3>
        <ul class="unit-plain-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `
    : "";
  const runtimeHtml = (task.runtimeEvents || []).length
    ? `
      <div class="unit-detail-section">
        <h3>运行摘要</h3>
        <div class="unit-runtime-list">
          ${(task.runtimeEvents || [])
            .slice()
            .reverse()
            .slice(0, 8)
            .map(
              (event) => `
                <div class="unit-runtime-item">
                  <strong>${escapeHtml(event.label || STATUS_LABELS[event.status] || event.status || "Hermes")}</strong>
                  <p>${escapeHtml(event.message || "")}</p>
                  <small>${escapeHtml(formatTime(event.at))}${event.transport ? ` · ${escapeHtml(event.transport)}` : ""}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `
    : "";
  const pipelineStages = Array.isArray(task.pipeline?.stages) ? task.pipeline.stages : [];
  const pipelineCheckpoints = Array.isArray(task.pipeline?.checkpoints) ? task.pipeline.checkpoints : [];
  const pipelineHtml = pipelineStages.length
    ? `<div class="unit-detail-section"><h3>十二阶段运行态</h3><p>整条流水线由单个 DSH 会话执行；阶段状态随运行时落盘的 checkpoint 逐段推进，展开可查看验证与产物追溯。</p><div class="unit-runtime-list">${pipelineStages.map((stage) => renderPipelineStage(stage, pipelineCheckpoints)).join("")}</div></div>`
    : "";
  const delivery = task.workerDelivery || null;
  const canRedeliver =
    !task.pipeline?.jobId &&
    (task.workerPending === true || delivery?.state === "blocked") &&
    ["queued", "failed"].includes(task.status);
  const deliveryHtml = delivery
    ? `
      <div class="unit-detail-section">
        <h3>Worker 投递诊断</h3>
        <dl class="unit-meta-list">
          <div><dt>状态</dt><dd>${escapeHtml(delivery.state || "未记录")}</dd></div>
          <div><dt>类别</dt><dd>${escapeHtml(delivery.category || "未记录")}</dd></div>
          <div><dt>HTTP</dt><dd>${escapeHtml(delivery.httpStatus ? String(delivery.httpStatus) : "未记录")}</dd></div>
          <div><dt>远端错误码</dt><dd>${escapeHtml(delivery.remoteCode || "未记录")}</dd></div>
          <div><dt>准备失败原因</dt><dd>${escapeHtml(delivery.prepareFailureReason || "未记录")}</dd></div>
          <div><dt>关联ID</dt><dd>${escapeHtml(delivery.correlationId || "未记录")}</dd></div>
          <div><dt>最近失败</dt><dd>${escapeHtml(formatTime(delivery.lastFailureAt) || "未记录")}</dd></div>
        </dl>
        ${canRedeliver ? `<button class="btn btn-secondary" type="button" data-redeliver-task-id="${escapeHtml(task.id)}" ${state.redeliveringTaskIds.has(task.id) ? "disabled" : ""}>重新投递</button>` : ""}
      </div>
    `
    : "";

  elements.taskDetail.innerHTML = `
    <div class="unit-detail-summary">
      <span class="unit-status unit-status-${escapeHtml(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status || "未知")}</span>
      <div>
        <strong>${escapeHtml(task.progress?.label || task.summary || "任务状态")}</strong>
        <p>${escapeHtml(task.progress?.message || task.summary || task.errorMessage || "等待任务状态。")}</p>
      </div>
    </div>
    ${artifactHtml}
    ${dshLogHtml}
    <div class="unit-detail-grid">
      <div class="unit-detail-section">
        <h3>输入文件</h3>
        <dl class="unit-meta-list">
          <div><dt>SLX</dt><dd>${escapeHtml(task.inputs?.modelSlx?.originalName || "")}</dd></div>
          <div><dt>MAT</dt><dd>${escapeHtml(task.inputs?.modelMat?.originalName || "")}</dd></div>
          <div><dt>初始化脚本</dt><dd>${escapeHtml(initScriptLabel)}</dd></div>
          <div><dt>项目</dt><dd>${escapeHtml(projectLabel || "未记录")}</dd></div>
          <div><dt>Worker</dt><dd>${escapeHtml(workerLabel || "Not recorded")}</dd></div>
          <div><dt>创建时间</dt><dd>${escapeHtml(formatTime(task.createdAt))}</dd></div>
          <div><dt>更新时间</dt><dd>${escapeHtml(formatTime(task.updatedAt))}</dd></div>
        </dl>
      </div>
      <div class="unit-detail-section">
        <h3>Hermes Step</h3>
        <dl class="unit-meta-list">
          <div><dt>Step</dt><dd>${escapeHtml(task.hermes?.stepType || "tcsd_stage_execute")}</dd></div>
          <div><dt>Pipeline</dt><dd>${escapeHtml(task.hermes?.pipelineName || "tcsd-stage-skills")}</dd></div>
          <div><dt>输出</dt><dd>${escapeHtml(task.hermes?.expectedOutputPattern || "outputs/*_tcsd.xlsx")}</dd></div>
        </dl>
      </div>
    </div>
    ${errorHtml}
    ${deliveryHtml}
    ${warningHtml}
    ${pipelineHtml}
    ${runtimeHtml}
  `;
}

function startPolling() {
  stopPolling();
  state.polling = window.setInterval(async () => {
    try {
      await loadTasks({ preserveSelection: true });
      const selected = await loadSelectedTask();
      const hasActive = state.tasks.some((task) => isActiveStatus(task.status));
      if (!hasActive && !isActiveStatus(selected?.status)) {
        stopPolling();
      }
    } catch (_error) {
      // Keep the last visible state; the next manual refresh or submit will recover.
    }
  }, 4000);
}

function stopPolling() {
  if (state.polling) {
    window.clearInterval(state.polling);
    state.polling = null;
  }
}

elements.form?.addEventListener("submit", submitTask);
elements.addProjectButton?.addEventListener("click", addProject);
elements.deleteProjectButton?.addEventListener("click", deleteProject);
elements.taskProjectFilter?.addEventListener("change", async () => {
  state.taskProjectFilterId = elements.taskProjectFilter.value || "";
  updateUrlProjectFilter(state.taskProjectFilterId);
  try {
    await loadTasks();
    await loadSelectedTask();
  } catch (error) {
    elements.taskList.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "任务列表加载失败。")}</div>`;
    renderTaskDetail(null);
  }
});
elements.taskList?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-task-id]");
  if (deleteButton) {
    event.preventDefault();
    event.stopPropagation();
    void deleteTask(deleteButton.dataset.deleteTaskId || "");
    return;
  }
  const button = event.target.closest("[data-task-id]");
  if (!button) return;
  state.selectedTaskId = button.dataset.taskId || "";
  updateUrlTaskId(state.selectedTaskId);
  void loadSelectedTask();
});
elements.taskDetail?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-redeliver-task-id]");
  if (!button) return;
  void redeliverTask(button.dataset.redeliverTaskId || "");
});

try {
  await loadWorkers();
} catch (_error) {
  syncProjectControls();
}

elements.taskDetail?.addEventListener("click", (event) => {
  const exportButton = event.target.closest("[data-dsh-log-task-id]");
  if (!exportButton) return;
  event.preventDefault();
  void exportDshSessionLog(exportButton.dataset.dshLogTaskId || "");
});

async function exportDshSessionLog(taskId = "") {
  if (!taskId || state.exportingDshLogIds?.has(taskId)) {
    return;
  }
  if (!state.exportingDshLogIds) {
    state.exportingDshLogIds = new Set();
  }
  state.exportingDshLogIds.add(taskId);
  setStatus("正在导出 DSH 会话日志…", "busy");
  try {
    const response = await fetch(`/api/unit-test-case-generation/tasks/${encodeURIComponent(taskId)}/dsh-session-log`);
    if (!response.ok) {
      let message = `导出失败（HTTP ${response.status}）`;
      try {
        const body = await response.json();
        message = body.error || message;
      } catch {
        // non-JSON error body; keep the generic message
      }
      setStatus(message, "error");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `task-${taskId}_dsh_session_log.jsonl`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("DSH 会话日志已导出。", "success");
  } catch (error) {
    setStatus(error.message || "导出 DSH 会话日志失败。", "error");
  } finally {
    state.exportingDshLogIds.delete(taskId);
  }
}

try {
  await loadProjects();
} catch (_error) {
  syncProjectControls();
}

try {
  await loadTasks();
  await loadSelectedTask();
  if (state.tasks.some((task) => isActiveStatus(task.status))) {
    startPolling();
  }
} catch (error) {
  elements.taskList.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "任务列表加载失败。")}</div>`;
  renderTaskDetail(null);
}
