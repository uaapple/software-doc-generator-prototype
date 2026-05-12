const query = new URLSearchParams(window.location.search);
const projectId = query.get("projectId") || "";
const moduleId = query.get("moduleId") || "";
const highlightTaskId = query.get("highlightTaskId") || "";

const uploadZone = document.querySelector("#upload-zone");
const slxInput = document.querySelector("#slx-input");
const fileInfo = document.querySelector("#file-info");
const submitBtn = document.querySelector("#submit-btn");
const taskListRoot = document.querySelector("#task-list");
const previewModal = document.querySelector("#preview-modal");
const previewJson = document.querySelector("#preview-json");
const closePreview = document.querySelector("#close-preview");
const breadcrumbRoot = document.querySelector("#generator-breadcrumb");
const backToModule = document.querySelector("#back-to-module");

let project = null;
let moduleData = null;
let pollTimer = 0;
let selectedFile = null;

syncTopNavLinks();

await bootstrap();

uploadZone?.addEventListener("click", () => slxInput?.click());
uploadZone?.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone?.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});
slxInput?.addEventListener("change", () => {
  if (slxInput.files.length) handleFileSelect(slxInput.files[0]);
});
submitBtn?.addEventListener("click", handleSubmit);
closePreview?.addEventListener("click", () => previewModal?.classList.remove("active"));
previewModal?.addEventListener("click", (e) => { if (e.target === previewModal) previewModal.classList.remove("active"); });
taskListRoot?.addEventListener("click", handleTaskActionClick);

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Accept": "application/json" },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  if (!projectId || !moduleId) return;
  try {
    const [p, m] = await Promise.all([
      request(`/api/projects/${projectId}`),
      request(`/api/projects/${projectId}/modules/${moduleId}`)
    ]);
    project = p;
    moduleData = m;
    document.querySelector("#project-name").textContent = p.name || "-";
    document.querySelector("#module-name").textContent = m.name || "-";
    document.querySelector("#context-copy").textContent = `${p.name || "-"} / ${m.name || "-"}`;
    renderBreadcrumb();
    await renderTasks();
    maybeHighlightTask();
  } catch (error) {
    console.error("Bootstrap failed", error);
  }
}

function handleFileSelect(file) {
  if (!file.name.toLowerCase().endsWith(".slx")) {
    fileInfo.textContent = "仅支持 .slx 文件";
    fileInfo.classList.add("slx-file-info-error");
    selectedFile = null;
    submitBtn.disabled = true;
    return;
  }
  fileInfo.classList.remove("slx-file-info-error");
  selectedFile = file;
  fileInfo.textContent = `已选择: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  submitBtn.disabled = false;
}

async function handleSubmit() {
  if (!selectedFile || !projectId || !moduleId) return;
  submitBtn.disabled = true;
  try {
    const formData = new FormData();
    formData.set("slx", selectedFile);
    await request(`/api/projects/${projectId}/modules/${moduleId}/slx-parser-tasks`, {
      method: "POST",
      body: formData
    });
    selectedFile = null;
    fileInfo.textContent = "";
    slxInput.value = "";
    submitBtn.disabled = true;
    await renderTasks();
    ensurePolling();
    notifyParent();
  } catch (error) {
    alert(error.message || "启动解析失败");
    submitBtn.disabled = false;
  }
}

async function renderTasks() {
  if (!projectId || !moduleId) return;
  try {
    const data = await request(`/api/projects/${projectId}/modules/${moduleId}/slx-parser-tasks`);
    const tasks = data.tasks || [];
    if (!tasks.length) {
      taskListRoot.innerHTML = '<li class="empty-state">暂无解析任务</li>';
      return;
    }
    taskListRoot.innerHTML = tasks.map((task) => {
      const statusClass = `status-${task.status}`;
      const statusLabel = { completed: "已完成", running: "运行中", queued: "排队中", failed: "失败" }[task.status] || task.status;
      const inputName = (task.inputArtifacts || [])[0]?.originalName || "-";
      const createdAt = task.createdAt ? new Date(task.createdAt).toLocaleString("zh-CN") : "-";
      const percent = task.progress?.percent || 0;
      const isRunning = task.status === "running" || task.status === "queued";
      let actions = "";
      if (task.status === "completed" && task.outputAssetId) {
        actions += `<button class="btn btn-sm btn-primary" data-action="preview" data-asset-id="${task.outputAssetId}">预览 JSON</button> `;
      }
      if (!isRunning) {
        actions += `<button class="btn btn-sm btn-danger" data-action="delete" data-task-id="${task.id}">删除</button>`;
      }
      return `<li class="task-item">
        <div><strong>${inputName}</strong> <span class="status ${statusClass}">${statusLabel}</span></div>
        <div class="task-meta">${task.summary || ""} &middot; ${createdAt}</div>
        ${isRunning ? `<div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>` : ""}
        <div style="margin-top:8px;">${actions}</div>
      </li>`;
    }).join("");
  } catch (error) {
    console.error("Render tasks failed", error);
  }
}

function ensurePolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await renderTasks();
    const items = taskListRoot.querySelectorAll(".task-item");
    const anyActive = Array.from(items).some((el) => el.querySelector(".status-running, .status-queued"));
    if (!anyActive) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }, 5000);
}

async function handleTaskActionClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "preview" && btn.dataset.assetId) {
    await openAssetPreview(btn.dataset.assetId);
  }
  if (action === "delete" && btn.dataset.taskId) {
    if (!confirm("确定删除此解析任务？")) return;
    try {
      await request(`/api/projects/${projectId}/modules/${moduleId}/slx-parser-tasks/${btn.dataset.taskId}`, { method: "DELETE" });
      await renderTasks();
      notifyParent();
    } catch (error) {
      alert(error.message || "删除失败");
    }
  }
}

async function openAssetPreview(assetId) {
  try {
    const data = await request(`/api/projects/${projectId}/modules/${moduleId}/assets/${assetId}/content`);
    const parsed = JSON.parse(data.content || "{}");
    previewJson.textContent = JSON.stringify(parsed, null, 2);
    previewModal.classList.add("active");
  } catch (error) {
    alert(error.message || "预览失败");
  }
}

function notifyParent() {
  try {
    window.parent?.postMessage({ type: "slx_parser:tasks_changed", projectId, moduleId }, "*");
  } catch (_error) { /* ignore */ }
}

function syncTopNavLinks() {
  if (!projectId || !moduleId) return;
  const params = new URLSearchParams({ projectId, moduleId });
  const routeMap = {
    "/document-extractor": `/document-extractor?${params.toString()}`,
    "/requirement-generation": `/requirement-generation?${params.toString()}`,
    "/detail-design-generation": `/detail-design-generation?${params.toString()}`,
    "/slx-parser": `/slx-parser?${params.toString()}`,
    "/feedback-pool": `/feedback-pool?${params.toString()}`
  };
  for (const [route, targetUrl] of Object.entries(routeMap)) {
    document.querySelectorAll(`.top-nav .nav-link[href="${route}"]`).forEach((link) => {
      link.href = targetUrl;
    });
  }
  if (backToModule) {
    backToModule.href = `/projects/${projectId}/modules/${moduleId}`;
  }
}

function renderBreadcrumb() {
  if (!breadcrumbRoot) return;
  const moduleName = moduleData?.name || moduleId;
  const projectName = project?.name || projectId;
  breadcrumbRoot.innerHTML = `
    <a href="/">工程列表</a>
    <span class="breadcrumb-sep">/</span>
    <a href="/projects/${projectId}">${projectName}</a>
    <span class="breadcrumb-sep">/</span>
    <a href="/projects/${projectId}/modules/${moduleId}">${moduleName}</a>
    <span class="breadcrumb-sep">/</span>
    <strong>SLX 解析</strong>
  `;
}

function maybeHighlightTask() {
  if (!highlightTaskId) return;
  const target = taskListRoot?.querySelector(`[data-task-id="${highlightTaskId}"]`);
  if (!target) return;
  target.scrollIntoView({ block: "center" });
  target.style.boxShadow = "0 0 0 2px rgba(14,106,168,0.24)";
}
