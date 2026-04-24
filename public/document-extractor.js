const query = new URLSearchParams(window.location.search);
const projectId = query.get("projectId") || "";
const moduleId = query.get("moduleId") || "";

const breadcrumbRoot = document.querySelector("#generator-breadcrumb");
const backToModule = document.querySelector("#back-to-module");
const contextCopy = document.querySelector("#context-copy");
const contextMeta = document.querySelector("#context-meta");
const extractForm = document.querySelector("#extract-form");
const targetDocumentTypeSelect = document.querySelector("#target-document-type");
const llmProfileSelect = document.querySelector("#llm-profile-select");
const llmProfileHint = document.querySelector("#llm-profile-hint");
const sourceTextInput = document.querySelector("#source-text");
const pasteZone = document.querySelector("#paste-zone");
const imageInput = document.querySelector("#image-input");
const imagePreviewList = document.querySelector("#image-preview-list");
const spreadsheetZone = document.querySelector("#spreadsheet-zone");
const spreadsheetCopy = document.querySelector("#spreadsheet-copy");
const spreadsheetInput = document.querySelector("#spreadsheet-input");
const spreadsheetPreviewList = document.querySelector("#spreadsheet-preview-list");
const taskListRoot = document.querySelector("#task-list");
const statusRoot = document.querySelector("#status");
const assetPreviewDialog = document.querySelector("#asset-preview-dialog");
const assetPreviewTitle = document.querySelector("#asset-preview-title");
const assetPreviewMeta = document.querySelector("#asset-preview-meta");
const assetPreviewContent = document.querySelector("#asset-preview-content");
const assetPreviewClose = document.querySelector("#asset-preview-close");
const taskStartedDialog = document.querySelector("#task-started-dialog");
const taskStartedTitle = document.querySelector("#task-started-title");
const taskStartedCopy = document.querySelector("#task-started-copy");
const taskStartedTaskName = document.querySelector("#task-started-task-name");
const taskStartedTaskMeta = document.querySelector("#task-started-task-meta");
const taskStartedClose = document.querySelector("#task-started-close");
const taskStartedStay = document.querySelector("#task-started-stay");
const taskStartedGoHistory = document.querySelector("#task-started-go-history");
const highlightTaskId = query.get("highlightTaskId") || "";

let project = null;
let moduleData = null;
let llmMeta = null;
let pollTimer = 0;
let pendingImages = [];
let pendingSpreadsheets = [];

syncTopNavLinks();
await bootstrap();

extractForm?.addEventListener("submit", handleSubmit);
llmProfileSelect?.addEventListener("change", renderSelectedProfileHint);
targetDocumentTypeSelect?.addEventListener("change", handleTargetDocumentTypeChange);
imageInput?.addEventListener("change", handleImageInputChange);
spreadsheetInput?.addEventListener("change", handleSpreadsheetInputChange);
pasteZone?.addEventListener("paste", handlePaste);
sourceTextInput?.addEventListener("paste", handlePaste);
taskListRoot?.addEventListener("click", handleTaskActionClick);
assetPreviewClose?.addEventListener("click", () => assetPreviewDialog?.close());
assetPreviewDialog?.addEventListener("click", (event) => {
  if (event.target === assetPreviewDialog) {
    assetPreviewDialog.close();
  }
});
taskStartedClose?.addEventListener("click", () => taskStartedDialog?.close());
taskStartedStay?.addEventListener("click", () => taskStartedDialog?.close());
taskStartedGoHistory?.addEventListener("click", handleGoHistoryFromStartedDialog);
taskStartedDialog?.addEventListener("click", (event) => {
  if (event.target === taskStartedDialog) {
    taskStartedDialog.close();
  }
});

async function bootstrap() {
  if (!projectId || !moduleId) {
    setStatus("缺少工程或模块上下文，请从模块页进入。");
    return;
  }

  try {
    const [projectResponse, moduleResponse, llmResponse] = await Promise.all([
      request(`/api/projects/${projectId}`),
      request(`/api/projects/${projectId}/modules/${moduleId}`),
      request("/api/llm-profiles")
    ]);
    project = projectResponse;
    moduleData = moduleResponse;
    llmMeta = llmResponse;

    renderBreadcrumb();
    renderContext();
    renderProfiles();
    handleTargetDocumentTypeChange();
    await renderTasks();
    maybeHighlightTask();
    ensurePolling();
  } catch (error) {
    handleError(error);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  try {
    const formData = new FormData();
    formData.set("targetDocumentType", targetDocumentTypeSelect.value);
    formData.set("sourceText", sourceTextInput.value || "");
    if (llmProfileSelect.value) {
      formData.set("llmProfileId", llmProfileSelect.value);
    }
    if (targetDocumentTypeSelect.value !== "hil_test_case" && pendingSpreadsheets.length) {
      throw new Error("当前仅 HIL 测试用例支持 Excel 表格提取");
    }
    for (const file of pendingImages) {
      formData.append("images", file);
    }
    for (const file of pendingSpreadsheets) {
      formData.append("spreadsheets", file);
    }
    clearStatus();
    const response = await request(`/api/projects/${projectId}/modules/${moduleId}/document-extraction-tasks`, {
      method: "POST",
      body: formData
    });
    sourceTextInput.value = "";
    pendingImages = [];
    pendingSpreadsheets = [];
    renderImagePreviews();
    renderSpreadsheetPreviews();
    await renderTasks();
    maybeHighlightTask(response.task?.id || "");
    notifyParentTasksChanged(response.task || {});
    openTaskStartedDialog(response.task || {});
    ensurePolling();
  } catch (error) {
    handleError(error);
  }
}

function handleImageInputChange(event) {
  const files = Array.from(event.target.files || []);
  appendImages(files);
  imageInput.value = "";
}

function handleSpreadsheetInputChange(event) {
  const files = Array.from(event.target.files || []);
  appendSpreadsheets(files);
  spreadsheetInput.value = "";
}

function handlePaste(event) {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return;
  }
  const imageFiles = [];
  for (const item of Array.from(clipboardData.items || [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        const extension = blob.type.split("/")[1] || "png";
        imageFiles.push(new File([blob], `pasted-image-${Date.now()}.${extension}`, { type: blob.type }));
      }
    }
  }
  if (imageFiles.length) {
    event.preventDefault();
    appendImages(imageFiles);
    if (event.currentTarget === sourceTextInput) {
      sourceTextInput.focus();
    }
  }
}

function appendImages(files = []) {
  pendingImages = pendingImages.concat(files.filter(Boolean));
  renderImagePreviews();
}

function appendSpreadsheets(files = []) {
  pendingSpreadsheets = pendingSpreadsheets.concat(
    files.filter((file) => file && /\.xlsx$/i.test(file.name || ""))
  );
  renderSpreadsheetPreviews();
}

function renderImagePreviews() {
  if (!imagePreviewList) {
    return;
  }
  if (!pendingImages.length) {
    imagePreviewList.innerHTML = '<p class="empty-state">还没有图片输入，可以上传或直接粘贴截图。</p>';
    return;
  }

  imagePreviewList.innerHTML = pendingImages
    .map(
      (file, index) => `
        <label class="file-item">
          <div class="file-item-copy">
            <div class="file-item-title-row">
              <strong>${escapeHtml(file.name || `图片 ${index + 1}`)}</strong>
              <span class="mini-pill subtle">${escapeHtml(formatFileSize(file.size || 0))}</span>
            </div>
            <p>${escapeHtml(file.type || "image/*")}</p>
          </div>
          <button type="button" class="secondary-button" data-remove-image="${index}">移除</button>
        </label>
      `
    )
    .join("");

  imagePreviewList.querySelectorAll("[data-remove-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeImage);
      pendingImages.splice(index, 1);
      renderImagePreviews();
    });
  });
}

function renderSpreadsheetPreviews() {
  if (!spreadsheetPreviewList) {
    return;
  }
  if (!pendingSpreadsheets.length) {
    spreadsheetPreviewList.innerHTML = '<p class="empty-state">还没有表格输入，切换到 HIL 测试用例后可上传 `.xlsx` 文件。</p>';
    return;
  }

  spreadsheetPreviewList.innerHTML = pendingSpreadsheets
    .map(
      (file, index) => `
        <label class="file-item">
          <div class="file-item-copy">
            <div class="file-item-title-row">
              <strong>${escapeHtml(file.name || `表格 ${index + 1}`)}</strong>
              <span class="mini-pill subtle">${escapeHtml(formatFileSize(file.size || 0))}</span>
            </div>
            <p>${escapeHtml(file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}</p>
          </div>
          <button type="button" class="secondary-button" data-remove-spreadsheet="${index}">移除</button>
        </label>
      `
    )
    .join("");

  spreadsheetPreviewList.querySelectorAll("[data-remove-spreadsheet]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeSpreadsheet);
      pendingSpreadsheets.splice(index, 1);
      renderSpreadsheetPreviews();
    });
  });
}

async function renderTasks() {
  const response = await request(`/api/projects/${projectId}/modules/${moduleId}/document-extraction-tasks`);
  const tasks = response.tasks || [];
  if (!tasks.length) {
    taskListRoot.innerHTML = '<div class="empty-state">当前模块还没有文档提取任务。</div>';
    return;
  }

  taskListRoot.innerHTML = tasks
    .map(
      (task) => `
        <article class="stack-card" data-task-id="${escapeAttribute(task.id || "")}">
          <strong>${escapeHtml(task.outputAssetName || extractionTypeLabel(task.targetDocumentType))}</strong>
          <p>${escapeHtml(task.summary || task.progress?.message || "暂无摘要")}</p>
          <div class="card-meta">
            <span>${escapeHtml(extractionTypeLabel(task.targetDocumentType))}</span>
            <span>${escapeHtml(task.status || "unknown")}</span>
            <span>${escapeHtml(formatDateTime(task.updatedAt || task.createdAt))}</span>
          </div>
          ${
            task.outputAssetId
              ? `
                <div class="card-meta">
                  <button
                    type="button"
                    class="secondary-button"
                    data-preview-asset-id="${escapeAttribute(task.outputAssetId)}"
                    data-preview-asset-name="${escapeAttribute(task.outputAssetName || "")}"
                    data-preview-document-type="${escapeAttribute(task.targetDocumentType || "")}"
                  >
                    打开预览
                  </button>
                </div>
              `
              : ""
          }
        </article>
      `
    )
    .join("");

  maybeHighlightTask();
  notifyParentTasksChanged(tasks[0] || {});
}

async function handleTaskActionClick(event) {
  const previewButton = event.target.closest("[data-preview-asset-id]");
  if (!previewButton) {
    return;
  }

  const assetId = previewButton.dataset.previewAssetId || "";
  if (!assetId) {
    return;
  }

  try {
    await openAssetPreview({
      assetId,
      assetName: previewButton.dataset.previewAssetName || "",
      documentType: previewButton.dataset.previewDocumentType || ""
    });
  } catch (error) {
    handleError(error);
  }
}

function ensurePolling() {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    try {
      const response = await request(`/api/projects/${projectId}/modules/${moduleId}/document-extraction-tasks`);
      const tasks = response.tasks || [];
      if (!tasks.some((task) => task.status === "running" || task.status === "queued")) {
        window.clearInterval(pollTimer);
      }
      await renderTasks();
      notifyParentTasksChanged(tasks[0] || {});
    } catch (error) {
      console.error(error);
    }
  }, 5000);
}

function renderBreadcrumb() {
  breadcrumbRoot.innerHTML = `
    <a class="nav-link" href="/">工程列表</a>
    <span>/</span>
    <a class="nav-link" href="/projects/${project.id}">${escapeHtml(project.name)}</a>
    <span>/</span>
    <a class="nav-link" href="/projects/${project.id}/modules/${moduleData.id}">${escapeHtml(moduleData.name)}</a>
    <span>/</span>
    <span class="nav-link active">文档提取</span>
  `;
  backToModule.href = `/projects/${project.id}/modules/${moduleData.id}`;
}

function renderContext() {
  contextCopy.textContent = `${project.name} / ${moduleData.name}`;
  contextMeta.innerHTML = `
    <div class="metric"><span>工程</span><strong>${escapeHtml(project.name)}</strong></div>
    <div class="metric"><span>功能模块</span><strong>${escapeHtml(moduleData.name)}</strong></div>
    <div class="metric"><span>当前资产</span><strong>${moduleData.assets?.length || 0}</strong></div>
  `;
  renderImagePreviews();
  renderSpreadsheetPreviews();
}

function handleTargetDocumentTypeChange() {
  const isHil = targetDocumentTypeSelect?.value === "hil_test_case";
  if (spreadsheetInput) {
    spreadsheetInput.disabled = !isHil;
  }
  if (spreadsheetZone) {
    spreadsheetZone.style.opacity = isHil ? "1" : "0.72";
  }
  if (spreadsheetCopy) {
    spreadsheetCopy.textContent = isHil
      ? "支持上传 Excel 导出的 HIL 用例，目前首版仅保证 `.xlsx` 跑通，并优先读取 `Basic Report` 工作表。"
      : "当前仅 HIL 测试用例支持 Excel 导入。切换到 “HIL 测试用例” 后可上传 `.xlsx` 文件。";
  }
}

function syncTopNavLinks() {
  if (!projectId || !moduleId) {
    return;
  }
  const params = new URLSearchParams({ projectId, moduleId });
  const routeMap = {
    "/document-extractor": `/document-extractor?${params.toString()}`,
    "/requirement-generation": `/requirement-generation?${params.toString()}`,
    "/detail-design-generation": `/detail-design-generation?${params.toString()}`,
    "/hil-test-case-generation": `/hil-test-case-generation?${params.toString()}`,
    "/feedback-pool": `/feedback-pool?${params.toString()}`
  };

  for (const [route, targetUrl] of Object.entries(routeMap)) {
    document.querySelectorAll(`.top-nav .nav-link[href="${route}"]`).forEach((link) => {
      link.href = targetUrl;
    });
  }
}

function renderProfiles() {
  llmProfileSelect.innerHTML = "";

  const fallback = document.createElement("option");
  fallback.value = "";
  fallback.textContent = "未配置，使用 Hermes 当前默认配置";
  fallback.selected = true;
  llmProfileSelect.append(fallback);

  for (const profile of llmMeta?.profiles || []) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} / ${profile.providerLabel}`;
    option.selected = profile.id === llmMeta.defaultProfileId;
    llmProfileSelect.append(option);
  }

  renderSelectedProfileHint();
}

function renderSelectedProfileHint() {
  const profile = (llmMeta?.profiles || []).find((item) => item.id === llmProfileSelect.value);
  llmProfileHint.textContent = profile
    ? `当前使用 ${profile.providerLabel} / ${profile.model}`
    : "未显式选择模型，将使用 Hermes 当前默认配置。";
}

async function openAssetPreview({ assetId, assetName, documentType }) {
  assetPreviewTitle.textContent = assetName || "提取结果预览";
  assetPreviewMeta.textContent = `${moduleData?.name || "当前模块"} / ${extractionTypeLabel(documentType)} / 正在加载内容`;
  assetPreviewContent.textContent = "正在加载预览内容。";
  assetPreviewDialog?.showModal();

  const payload = await request(`/api/projects/${projectId}/modules/${moduleId}/assets/${assetId}/content`);
  assetPreviewTitle.textContent = payload.originalName || assetName || "提取结果预览";
  assetPreviewMeta.textContent = `${moduleData?.name || "当前模块"} / ${getRoleLabel(payload.role)} / ${formatDateTime(payload.uploadedAt)}`;
  assetPreviewContent.textContent = payload.content || "当前资产没有可展示内容。";
}

function openTaskStartedDialog(task = {}) {
  taskStartedTitle.textContent = "提取任务已启动";
  taskStartedCopy.textContent = "任务已经进入后台处理，你可以留在当前页查看进度，也可以回到模块历史任务统一核对。";
  taskStartedTaskName.textContent = task.summary || `${extractionTypeLabel(task.targetDocumentType)}提取任务`;
  taskStartedTaskMeta.textContent = `${extractionTypeLabel(task.targetDocumentType)} / ${formatDateTime(task.createdAt)} / 后台处理中`;
  taskStartedGoHistory.dataset.taskId = task.id || "";
  taskStartedDialog?.showModal();
}

function handleGoHistoryFromStartedDialog() {
  const taskId = taskStartedGoHistory?.dataset.taskId || "";
  const targetUrl = `/projects/${projectId}/modules/${moduleId}?openHistory=1${taskId ? `&taskStarted=1&highlightTaskId=${encodeURIComponent(taskId)}` : ""}`;
  if (window.top && window.top !== window) {
    window.top.location.href = targetUrl;
    return;
  }
  window.location.href = targetUrl;
}

function maybeHighlightTask(taskId = highlightTaskId) {
  if (!taskId) {
    return;
  }
  const target = taskListRoot?.querySelector(`[data-task-id="${taskId}"]`);
  if (!target) {
    return;
  }
  target.scrollIntoView({ block: "center" });
  target.style.boxShadow = "0 0 0 2px rgba(14,106,168,0.24)";
}

function notifyParentTasksChanged(task = {}) {
  if (!window.parent || window.parent === window) {
    return;
  }
  window.parent.postMessage(
    {
      type: "document_extractor:tasks_changed",
      taskId: task.id || "",
      status: task.status || "",
      targetDocumentType: task.targetDocumentType || ""
    },
    window.location.origin
  );
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.code = data.code || "request_failed";
    error.details = data.details || null;
    throw error;
  }
  return data;
}

function setStatus(message, emphasized = false) {
  statusRoot.hidden = !message;
  statusRoot.textContent = message;
  statusRoot.classList.toggle("status-busy", emphasized);
}

function clearStatus() {
  setStatus("", false);
}

function handleError(error) {
  console.error(error);
  setStatus(error.message || "操作失败");
}

function extractionTypeLabel(documentType) {
  if (documentType === "system_requirement") return "系统需求";
  if (documentType === "detail_design") return "详细设计";
  if (documentType === "hil_test_case") return "HIL 测试用例";
  return "软件需求";
}

function getRoleLabel(role) {
  if (role === "extracted_system_requirement") return "提取系统需求";
  if (role === "extracted_detail_design") return "提取详细设计";
  if (role === "extracted_hil_test_case") return "提取 HIL 测试用例";
  if (role === "extracted_software_requirement") return "提取软件需求";
  return role || "模块资产";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "未知时间";
}

function formatFileSize(size = 0) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
