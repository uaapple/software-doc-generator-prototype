const state = {
  tasks: [],
  selectedTaskId: new URLSearchParams(window.location.search).get("taskId") || "",
  polling: null,
  submitting: false,
  deletingTaskIds: new Set()
};

const elements = {
  form: document.querySelector("#unit-test-form"),
  slxInput: document.querySelector("#model-slx-input"),
  matInput: document.querySelector("#model-mat-input"),
  startButton: document.querySelector("#unit-start-button"),
  formStatus: document.querySelector("#unit-form-status"),
  taskList: document.querySelector("#unit-task-list"),
  taskDetail: document.querySelector("#unit-task-detail"),
  detailSubtitle: document.querySelector("#unit-task-detail-subtitle")
};

const STATUS_LABELS = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败"
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

function isActiveStatus(status = "") {
  return status === "queued" || status === "running";
}

function setStatus(message = "", tone = "") {
  elements.formStatus.hidden = !message;
  elements.formStatus.textContent = message;
  elements.formStatus.dataset.tone = tone;
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

async function submitTask(event) {
  event.preventDefault();
  if (state.submitting) return;
  try {
    validateFile(elements.slxInput, ".slx", "模型文件");
    validateFile(elements.matInput, ".mat", "数据文件");
    state.submitting = true;
    elements.startButton.disabled = true;
    setStatus("正在创建任务并加入 Hermes 队列。", "busy");

    const formData = new FormData(elements.form);
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
    setStatus("任务已发起。", "success");
  } catch (error) {
    setStatus(error.message || "任务创建失败。", "error");
  } finally {
    state.submitting = false;
    elements.startButton.disabled = false;
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

async function loadTasks(options = {}) {
  const body = await requestJson("/api/unit-test-case-generation/tasks");
  state.tasks = Array.isArray(body.tasks) ? body.tasks : [];
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
    elements.taskList.innerHTML = '<div class="empty-state">还没有单元测试用例生成任务。</div>';
    return;
  }
  elements.taskList.innerHTML = state.tasks
    .map((task) => {
      const selected = task.id === state.selectedTaskId ? " selected" : "";
      const progress = task.progress?.percent ?? (task.status === "completed" ? 100 : 0);
      const taskName = task.inputs?.modelSlx?.originalName || "Simulink 模型";
      const deleting = state.deletingTaskIds.has(task.id);
      return `
        <div class="unit-task-card${selected}" data-task-card-id="${escapeHtml(task.id)}">
          <button class="unit-task-card-main" type="button" data-task-id="${escapeHtml(task.id)}">
            <span class="unit-task-card-top">
              <strong>${escapeHtml(taskName)}</strong>
              <span class="unit-status unit-status-${escapeHtml(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status || "未知")}</span>
            </span>
            <span class="unit-task-card-meta">${escapeHtml(formatTime(task.updatedAt || task.createdAt))}</span>
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
  const confirmed = window.confirm(`确认删除 ${taskName}？\n这会清除该任务上传文件、workspace 和生成产物。`);
  if (!confirmed) {
    return;
  }

  state.deletingTaskIds.add(taskId);
  renderTaskList();
  setStatus("正在删除任务并清理产物。", "busy");
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

function renderTaskDetail(task) {
  if (!task) {
    elements.detailSubtitle.textContent = "选择任务后查看运行摘要、错误信息和下载结果。";
    elements.taskDetail.innerHTML = '<div class="empty-state">暂无选中的生成任务。</div>';
    return;
  }
  elements.detailSubtitle.textContent = `${task.inputs?.modelSlx?.originalName || "Simulink 模型"} · ${STATUS_LABELS[task.status] || task.status}`;
  const artifactHtml = (task.artifacts || []).length
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
          ${(task.artifacts || [])
            .map(
              (artifact) => `
                <a class="unit-artifact-link" href="/api/unit-test-case-generation/tasks/${encodeURIComponent(task.id)}/artifacts/${encodeURIComponent(artifact.id)}/download">
                  <span>
                    <strong>${escapeHtml(artifact.fileName)}</strong>
                    <small>${escapeHtml(formatBytes(artifact.size))} · ${escapeHtml(artifact.relativePath)}</small>
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

  elements.taskDetail.innerHTML = `
    <div class="unit-detail-summary">
      <span class="unit-status unit-status-${escapeHtml(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status || "未知")}</span>
      <div>
        <strong>${escapeHtml(task.progress?.label || task.summary || "任务状态")}</strong>
        <p>${escapeHtml(task.progress?.message || task.summary || task.errorMessage || "等待任务状态。")}</p>
      </div>
    </div>
    ${artifactHtml}
    <div class="unit-detail-grid">
      <div class="unit-detail-section">
        <h3>输入文件</h3>
        <dl class="unit-meta-list">
          <div><dt>SLX</dt><dd>${escapeHtml(task.inputs?.modelSlx?.originalName || "")}</dd></div>
          <div><dt>MAT</dt><dd>${escapeHtml(task.inputs?.modelMat?.originalName || "")}</dd></div>
          <div><dt>创建时间</dt><dd>${escapeHtml(formatTime(task.createdAt))}</dd></div>
          <div><dt>更新时间</dt><dd>${escapeHtml(formatTime(task.updatedAt))}</dd></div>
        </dl>
      </div>
      <div class="unit-detail-section">
        <h3>Hermes Step</h3>
        <dl class="unit-meta-list">
          <div><dt>Step</dt><dd>${escapeHtml(task.hermes?.stepType || "simulink_ut_tcsd_generate")}</dd></div>
          <div><dt>Skill</dt><dd>${escapeHtml(task.hermes?.skillName || "simulink-ut-tcsd-generator")}</dd></div>
          <div><dt>输出</dt><dd>${escapeHtml(task.hermes?.expectedOutputPattern || "outputs/*_tcsd.xlsx")}</dd></div>
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

elements.form?.addEventListener("submit", submitTask);
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
