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
  deletingTaskIds: new Set()
};

const elements = {
  form: document.querySelector("#module-description-form"),
  slxInput: document.querySelector("#module-description-model-slx-input"),
  matInput: document.querySelector("#module-description-model-mat-input"),
  initScriptInput: document.querySelector("#module-description-model-init-script-input"),
  projectSelect: document.querySelector("#module-description-project-select"),
  workerSelect: document.querySelector("#module-description-worker-select"),
  addProjectButton: document.querySelector("#module-description-add-project-button"),
  deleteProjectButton: document.querySelector("#module-description-delete-project-button"),
  startButton: document.querySelector("#module-description-start-button"),
  formStatus: document.querySelector("#module-description-form-status"),
  projectStatus: document.querySelector("#module-description-project-status"),
  workerStatus: document.querySelector("#module-description-worker-status"),
  taskProjectFilter: document.querySelector("#module-description-task-project-filter"),
  taskList: document.querySelector("#module-description-task-list"),
  taskDetail: document.querySelector("#module-description-task-detail"),
  detailSubtitle: document.querySelector("#module-description-task-detail-subtitle")
};

const STATUS_LABELS = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败"
};

const STAGE_STATUS_LABELS = Object.freeze({
  pending: "等待中",
  queued: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败"
});

const STAGE_TITLE_FALLBACKS = Object.freeze({
  "software-detail-stage-01-initialize": "初始化输入与任务工作区",
  "software-detail-stage-02-model-plan": "建立模型索引与分析计划",
  "software-detail-stage-03-evidence-extract": "提取模型证据",
  "software-detail-stage-04-output-ledger": "整理输出台账与覆盖情况",
  "software-detail-stage-05-boundary-projection": "投影文档边界与行为分组",
  "software-detail-stage-06-architecture-draft": "编写架构与接口内容",
  "software-detail-stage-07-module-draft": "编写模块详细内容",
  "software-detail-stage-08-content-check": "检查并修订内容",
  "software-detail-stage-09-docx-finalize": "生成并整理详细设计文档"
});

const CHINESE_STAGE_ORDINALS = Object.freeze(["一", "二", "三", "四", "五", "六", "七", "八", "九"]);

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

function isActiveStatus(status = "") {
  return status === "queued" || status === "running";
}

function stageErrorMessage(error = null) {
  if (typeof error === "string") {
    return error.trim();
  }
  if (!error || typeof error !== "object") {
    return "";
  }
  return String(error.safeMessage || error.message || error.errorMessage || "").trim();
}

function renderSoftwareDetailPipeline(task = {}) {
  const stages = Array.isArray(task.pipeline?.stages)
    ? task.pipeline.stages
        .filter((stage) => stage && typeof stage === "object")
        .slice()
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    : [];
  if (!stages.length) {
    return "";
  }

  const completedCount = stages.filter((stage) => stage.status === "completed").length;
  const runningStage = stages.find((stage) => stage.status === "running");
  const failedStage = stages.find((stage) => stage.status === "failed");
  const activeStage = runningStage || failedStage;
  const activeLabel = activeStage
    ? activeStage.title || STAGE_TITLE_FALLBACKS[activeStage.id] || "当前阶段"
    : completedCount === stages.length
      ? "全部阶段已完成"
      : "等待下一阶段";

  return `
    <section class="module-description-section module-description-pipeline" aria-labelledby="module-description-pipeline-title">
      <div class="module-description-pipeline-head">
        <div>
          <h3 id="module-description-pipeline-title">九阶段生成进度</h3>
          <p>已完成 ${completedCount}/${stages.length} · ${escapeHtml(activeLabel)}</p>
        </div>
        <span>${escapeHtml(STAGE_STATUS_LABELS[task.pipeline?.status] || STATUS_LABELS[task.pipeline?.status] || "状态未知")}</span>
      </div>
      <ol class="module-description-stage-list">
        ${stages
          .map((stage, index) => {
            const status = STAGE_STATUS_LABELS[stage.status] || "状态未知";
            const title = stage.title || STAGE_TITLE_FALLBACKS[stage.id] || `阶段 ${index + 1}`;
            const ordinal = CHINESE_STAGE_ORDINALS[index] || String(index + 1);
            const attempt = Number(stage.attempt || 0);
            const startedAt = formatTime(stage.startedAt);
            const endedAt = formatTime(stage.endedAt);
            const errorMessage = stageErrorMessage(stage.error);
            const timeParts = [
              startedAt ? `开始：${startedAt}` : "",
              endedAt ? `结束：${endedAt}` : ""
            ].filter(Boolean);
            const classNames = [
              "module-description-stage",
              `module-description-stage-${String(stage.status || "pending").replace(/[^a-z-]/g, "")}`,
              stage.status === "running" ? "is-running" : ""
            ]
              .filter(Boolean)
              .join(" ");
            return `
              <li class="${classNames}"${stage.status === "running" ? ' aria-current="step"' : ""}>
                <span class="module-description-stage-index">第${ordinal}阶段</span>
                <div class="module-description-stage-content">
                  <div class="module-description-stage-title">
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(status)}</span>
                  </div>
                  ${
                    attempt > 0 || timeParts.length
                      ? `<p class="module-description-stage-meta">${[
                          attempt > 0 ? `第 ${attempt} 次执行` : "",
                          ...timeParts
                        ]
                          .filter(Boolean)
                          .map(escapeHtml)
                          .join(" · ")}</p>`
                      : ""
                  }
                  ${
                    errorMessage
                      ? `<p class="module-description-stage-error" role="alert">${escapeHtml(errorMessage)}</p>`
                      : ""
                  }
                  ${
                    stage.skillName
                      ? `<details class="module-description-stage-technical"><summary>查看技能名称</summary><code>${escapeHtml(stage.skillName)}</code></details>`
                      : ""
                  }
                </div>
              </li>
            `;
          })
          .join("")}
      </ol>
    </section>
  `;
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

function renderWorkers(defaultWorkerId = "") {
  if (!elements.workerSelect) return;
  if (state.loadingWorkers) {
    elements.workerSelect.innerHTML = '<option value="">正在加载 Worker...</option>';
  } else if (state.workerLoadError) {
    elements.workerSelect.innerHTML = '<option value="">Worker 加载失败</option>';
  } else {
    elements.workerSelect.innerHTML = state.workers
      .map((worker) => `<option value="${escapeHtml(worker.id)}">${escapeHtml(worker.label)}</option>`)
      .join("");
    const selected = state.workers.find((worker) => worker.id === defaultWorkerId) || defaultTaskWorker();
    elements.workerSelect.value = selected.id || "";
  }
  elements.workerSelect.disabled = state.loadingWorkers || !state.workers.length;
}

async function loadWorkers() {
  state.loadingWorkers = true;
  renderWorkers();
  try {
    const body = await requestJson("/api/software-module-description-generation/workers");
    state.workers = Array.isArray(body.workers) ? body.workers.map(normalizeWorker).filter((worker) => worker.id) : [];
    state.workerLoadError = state.workers.length ? "" : "没有可用的 Worker。";
    setWorkerStatus(state.workerLoadError, state.workerLoadError ? "error" : "");
    renderWorkers(body.defaultWorkerId || "");
  } catch (error) {
    state.workers = [];
    state.workerLoadError = error.message || "Worker 列表加载失败。";
    setWorkerStatus(state.workerLoadError, "error");
    renderWorkers();
  } finally {
    state.loadingWorkers = false;
    renderWorkers(elements.workerSelect?.value || "");
    syncProjectControls();
  }
}

function syncProjectControls() {
  const hasProjects = state.projects.length > 0;
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
    elements.workerSelect.disabled = state.loadingWorkers || !state.workers.length;
  }
  if (elements.startButton) {
    elements.startButton.disabled = state.submitting || !hasProjects || !state.workers.length;
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
      throw new Error("请选择 Worker。");
    }
    state.submitting = true;
    syncProjectControls();
    setStatus("正在创建任务并加入 Hermes 队列。", "busy");

    const formData = new FormData(elements.form);
    formData.set("projectId", selectedProject.id);
    formData.set("workerId", selectedWorker.id);
    const body = await requestJson("/api/software-module-description-generation/tasks", {
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
  const body = await requestJson(`/api/software-module-description-generation/tasks${query}`);
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
    task = await requestJson(`/api/software-module-description-generation/tasks/${encodeURIComponent(state.selectedTaskId)}`);
  } catch (error) {
    if (error.code === "software_module_description_task_not_found") {
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
      ? '<div class="empty-state">该项目下暂无软件详设生成任务。</div>'
      : '<div class="empty-state">还没有软件详设生成任务。</div>';
    return;
  }
  elements.taskList.innerHTML = state.tasks
    .map((task) => {
      const selected = task.id === state.selectedTaskId ? " selected" : "";
      const progress = task.progress?.percent ?? (task.status === "completed" ? 100 : 0);
      const taskName = task.inputs?.modelSlx?.originalName || "Simulink 模型";
      const projectLabel = normalizeTaskProject(task.unitTestProject).label;
      const deleting = state.deletingTaskIds.has(task.id);
      const running = task.status === "running";
      return `
        <div class="module-description-task-card${selected}" data-task-card-id="${escapeHtml(task.id)}">
          <button class="module-description-task-card-main" type="button" data-task-id="${escapeHtml(task.id)}">
            <span class="module-description-task-card-top">
              <strong>${escapeHtml(taskName)}</strong>
              <span class="module-description-status module-description-status-${escapeHtml(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status || "未知")}</span>
            </span>
            <span class="module-description-task-card-meta">${escapeHtml(formatTime(task.updatedAt || task.createdAt))}</span>
            ${projectLabel ? `<span class="module-description-task-card-project">${escapeHtml(projectLabel)}</span>` : ""}
            <span class="module-description-progress"><span style="width:${Math.max(2, Math.min(100, Number(progress || 0)))}%"></span></span>
          </button>
          <button
            class="module-description-task-delete"
            type="button"
            data-delete-task-id="${escapeHtml(task.id)}"
            aria-label="${running ? "任务运行中，暂不可删除" : `删除任务 ${escapeHtml(taskName)}`}"
            title="${running ? "任务运行中，暂不可删除" : "删除任务"}"
            ${deleting || running ? "disabled" : ""}
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
  const confirmed = window.confirm(`确认删除 ${taskName}？\n这会清除该任务上传文件、任务工作区和生成产物。`);
  if (!confirmed) {
    return;
  }

  state.deletingTaskIds.add(taskId);
  renderTaskList();
  setStatus("正在删除任务并清理产物。", "busy");
  try {
    await requestJson(`/api/software-module-description-generation/tasks/${encodeURIComponent(taskId)}`, {
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

function renderTaskDetail(task) {
  if (!task) {
    elements.detailSubtitle.textContent = "选择任务后查看运行摘要、错误信息和生成结果。";
    elements.taskDetail.innerHTML = '<div class="empty-state">暂无选中的生成任务。</div>';
    return;
  }
  const projectLabel = normalizeTaskProject(task.unitTestProject).label;
  const workerLabel = normalizeTaskWorker(task.workerProfile).label;
  const initScriptLabel = task.inputs?.modelInitScript?.originalName || "使用项目附加初始化内容";
  elements.detailSubtitle.textContent = [
    task.inputs?.modelSlx?.originalName || "Simulink 模型",
    projectLabel,
    workerLabel,
    STATUS_LABELS[task.status] || task.status
  ]
    .filter(Boolean)
    .join(" · ");
  const artifactHtml = (task.artifacts || []).length
    ? `
      <div class="module-description-section module-description-artifact-section">
        <div class="module-description-artifact-head">
          <div>
            <h3>产物下载</h3>
            <p>软件详设 DOCX 已生成，优先下载产物进行复核。</p>
          </div>
          <span>DOCX</span>
        </div>
        <div class="module-description-artifact-list">
          ${(task.artifacts || [])
            .map(
              (artifact) => `
                <a class="module-description-artifact-link" href="/api/software-module-description-generation/tasks/${encodeURIComponent(task.id)}/artifacts/${encodeURIComponent(artifact.id)}/download">
                  <span>
                    <strong>${escapeHtml(artifact.fileName)}</strong>
                    <small>${escapeHtml(formatBytes(artifact.size))} · ${escapeHtml(artifact.relativePath)}</small>
                  </span>
                  <b>下载 DOCX</b>
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
        <div class="module-description-section module-description-error-box">
          <h3>失败原因</h3>
          <p>${escapeHtml(task.errorMessage || "任务失败，但未返回详细错误。")}</p>
        </div>
      `
      : "";
  const warnings = Array.isArray(task.hermes?.warnings) ? task.hermes.warnings : [];
  const warningHtml = warnings.length
    ? `
      <div class="module-description-section">
        <h3>Hermes 提示</h3>
        <ul class="module-description-plain-list">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `
    : "";
  const runtimeHtml = (task.runtimeEvents || []).length
    ? `
      <div class="module-description-section">
        <h3>运行摘要</h3>
        <div class="module-description-runtime-list">
          ${(task.runtimeEvents || [])
            .slice()
            .reverse()
            .slice(0, 8)
            .map(
              (event) => `
                <div class="module-description-runtime-item">
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
  const pipelineHtml = renderSoftwareDetailPipeline(task);

  elements.taskDetail.innerHTML = `
    <div class="module-description-summary">
      <span class="module-description-status module-description-status-${escapeHtml(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status || "未知")}</span>
      <div>
        <strong>${escapeHtml(task.progress?.label || task.summary || "任务状态")}</strong>
        <p>${escapeHtml(task.progress?.message || task.summary || task.errorMessage || "等待任务状态。")}</p>
      </div>
    </div>
    ${artifactHtml}
    ${pipelineHtml}
    <div class="module-description-detail-grid">
      <div class="module-description-section">
        <h3>输入文件</h3>
        <dl class="module-description-meta-list">
          <div><dt>SLX</dt><dd>${escapeHtml(task.inputs?.modelSlx?.originalName || "")}</dd></div>
          <div><dt>MAT</dt><dd>${escapeHtml(task.inputs?.modelMat?.originalName || "")}</dd></div>
          <div><dt>初始化脚本</dt><dd>${escapeHtml(initScriptLabel)}</dd></div>
          <div><dt>项目</dt><dd>${escapeHtml(projectLabel || "未记录")}</dd></div>
          <div><dt>Worker</dt><dd>${escapeHtml(workerLabel || "未记录")}</dd></div>
          <div><dt>创建时间</dt><dd>${escapeHtml(formatTime(task.createdAt))}</dd></div>
          <div><dt>更新时间</dt><dd>${escapeHtml(formatTime(task.updatedAt))}</dd></div>
        </dl>
      </div>
      <div class="module-description-section">
        <h3>Hermes 执行信息</h3>
        <dl class="module-description-meta-list">
          <div><dt>执行类型</dt><dd>${escapeHtml(task.hermes?.stepType || "simulink_module_description_generate")}</dd></div>
          <div><dt>技能</dt><dd>${escapeHtml(task.hermes?.skillName || "simulink-module-description-generator")}</dd></div>
          <div><dt>输出</dt><dd>${escapeHtml(task.hermes?.expectedOutputPattern || "outputs/*.docx")}</dd></div>
        </dl>
      </div>
    </div>
    ${errorHtml}
    ${warningHtml}
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

async function initializePage() {
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

  await loadWorkers();

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
}

if (!globalThis.__SOFTWARE_DETAIL_UI_TEST__) {
  await initializePage();
}

export { renderSoftwareDetailPipeline, STAGE_STATUS_LABELS, STAGE_TITLE_FALLBACKS };
