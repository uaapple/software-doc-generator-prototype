const query = new URLSearchParams(window.location.search);
const projectId = query.get("projectId") || "";
const moduleId = query.get("moduleId") || "";
const querySessionId = query.get("sessionId") || "";
const queryModelAssetId = query.get("modelAssetId") || "";
const highlightTaskId = query.get("highlightTaskId") || "";
const highlightMessageId = query.get("messageId") || "";

const uploadZone = document.querySelector("#upload-zone");
const slxInput = document.querySelector("#slx-input");
const fileInfo = document.querySelector("#file-info");
const uploadBtn = document.querySelector("#upload-btn");
const modelSelect = document.querySelector("#model-select");
const modelMeta = document.querySelector("#model-meta");
const chatTitle = document.querySelector("#chat-title");
const chatStatus = document.querySelector("#chat-status");
const chatMessages = document.querySelector("#chat-messages");
const chatForm = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question-input");
const sendBtn = document.querySelector("#send-btn");
const breadcrumbRoot = document.querySelector("#generator-breadcrumb");
const backToModule = document.querySelector("#back-to-module");

let project = null;
let moduleData = null;
let models = [];
let sessions = [];
let selectedModelId = queryModelAssetId;
let selectedSessionId = querySessionId;
let selectedFile = null;
let pollTimer = 0;

syncTopNavLinks();
bindEvents();
await bootstrap();

function bindEvents() {
  uploadZone?.addEventListener("click", () => slxInput?.click());
  uploadZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragover");
  });
  uploadZone?.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
  uploadZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragover");
    if (event.dataTransfer.files.length) {
      handleFileSelect(event.dataTransfer.files[0]);
    }
  });
  slxInput?.addEventListener("change", () => {
    if (slxInput.files.length) handleFileSelect(slxInput.files[0]);
  });
  uploadBtn?.addEventListener("click", handleUpload);
  modelSelect?.addEventListener("change", () => {
    selectedModelId = modelSelect.value || "";
    selectedSessionId = getSessionForModel(selectedModelId)?.id || "";
    renderAll();
    replaceUrlState();
  });
  chatForm?.addEventListener("submit", handleQuestionSubmit);
}

async function request(url, options = {}) {
  const headers = options.body instanceof FormData
    ? { Accept: "application/json", ...(options.headers || {}) }
    : { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(url, {
    ...options,
    headers
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  if (!projectId || !moduleId) {
    renderUnavailable("缺少工程或模块上下文。");
    return;
  }
  try {
    const [p, m] = await Promise.all([
      request(`/api/projects/${projectId}`),
      request(`/api/projects/${projectId}/modules/${moduleId}`)
    ]);
    project = p;
    moduleData = m;
    document.querySelector("#context-copy").textContent = `${p.name || "-"} / ${m.name || "-"}`;
    document.querySelector("#module-copy").textContent = `${p.name || "-"} / ${m.name || "-"}`;
    renderBreadcrumb();
    await refreshInterpreterState();
    renderAll();
    maybeHighlightMessage();
    ensurePolling();
  } catch (error) {
    console.error("Bootstrap failed", error);
    renderUnavailable(error.message || "加载失败");
  }
}

async function refreshInterpreterState() {
  const [modelPayload, sessionPayload] = await Promise.all([
    request(`/api/projects/${projectId}/modules/${moduleId}/slx-interpreter/models`),
    request(`/api/projects/${projectId}/modules/${moduleId}/slx-interpreter/sessions`)
  ]);
  models = modelPayload.models || [];
  sessions = sessionPayload.sessions || [];
  if (!selectedModelId || !models.some((model) => model.id === selectedModelId)) {
    selectedModelId = models[0]?.id || "";
  }
  if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
    selectedSessionId = getSessionForModel(selectedModelId)?.id || "";
  }
}

function renderAll() {
  renderModels();
  renderChat();
  syncFormState();
}

function renderUnavailable(message) {
  chatMessages.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  if (sendBtn) sendBtn.disabled = true;
  if (uploadBtn) uploadBtn.disabled = true;
}

function renderModels() {
  if (!modelSelect) return;
  if (!models.length) {
    modelSelect.innerHTML = '<option value="">暂无 SLX 模型</option>';
    modelSelect.disabled = true;
    modelMeta.className = "slx-model-meta empty-state";
    modelMeta.textContent = "当前模块还没有 SLX 模型资产。";
    return;
  }

  modelSelect.disabled = false;
  modelSelect.innerHTML = models.map((model) => `
    <option value="${escapeAttribute(model.id)}" ${model.id === selectedModelId ? "selected" : ""}>
      ${escapeHtml(model.originalName || "model.slx")}
    </option>
  `).join("");

  const model = getSelectedModel();
  modelMeta.className = "slx-model-meta";
  modelMeta.innerHTML = model
    ? `
      <span>${escapeHtml(model.originalName || "model.slx")}</span>
      <span>${formatFileSize(model.size)}</span>
      <span>${formatDateTime(model.uploadedAt)}</span>
    `
    : "请选择模型。";
}

function renderChat() {
  const model = getSelectedModel();
  const session = getSelectedSession();
  chatTitle.textContent = model ? model.originalName || "model.slx" : "选择模型后开始提问";

  const activeMessage = getActiveMessage(session);
  chatStatus.textContent = !model
    ? "未选择模型"
    : activeMessage
      ? activeMessage.status === "queued"
        ? "排队中"
        : "Hermes 正在输入"
      : "就绪";
  chatStatus.classList.toggle("is-running", Boolean(activeMessage));

  if (!model) {
    chatMessages.innerHTML = '<div class="empty-state">上传或选择一个 SLX 模型后即可开始问答。</div>';
    return;
  }
  if (!session || !(session.messages || []).length) {
    chatMessages.innerHTML = '<div class="empty-state">当前模型还没有对话。</div>';
    return;
  }

  chatMessages.innerHTML = session.messages.map(renderMessage).join("");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderMessage(message = {}) {
  const roleLabel = message.role === "user" ? "你" : "Hermes";
  const isActive = message.role === "assistant" && ["queued", "running"].includes(message.status);
  const evidence = Array.isArray(message.evidence) ? message.evidence : [];
  const warnings = Array.isArray(message.warnings) ? message.warnings : [];
  return `
    <article
      class="slx-message slx-message-${escapeAttribute(message.role || "assistant")}${isActive ? " is-active" : ""}"
      data-message-id="${escapeAttribute(message.id || "")}"
      data-task-id="${escapeAttribute(message.taskId || "")}"
    >
      <div class="slx-message-meta">
        <strong>${escapeHtml(roleLabel)}</strong>
        <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
        ${message.status && message.role === "assistant" ? `<span>${escapeHtml(translateStatus(message.status))}</span>` : ""}
      </div>
      <div class="slx-message-body">
        ${
          isActive
            ? renderTypingState(message)
            : message.content
              ? renderMarkdownLite(message.content)
              : `<p class="inline-hint">${escapeHtml(message.errorMessage || message.summary || "暂无内容。")}</p>`
        }
      </div>
      ${warnings.length ? `<div class="slx-message-warnings">${warnings.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${evidence.length ? renderEvidence(evidence) : ""}
    </article>
  `;
}

function renderTypingState(message = {}) {
  const progress = message.progress || {};
  return `
    <div class="slx-typing-row">
      <span class="slx-typing-dot"></span>
      <span class="slx-typing-dot"></span>
      <span class="slx-typing-dot"></span>
      <span>${escapeHtml(progress.message || "Hermes 正在读取模型并组织回答。")}</span>
    </div>
  `;
}

function renderEvidence(evidence = []) {
  return `
    <details class="slx-message-evidence">
      <summary>模型证据 ${evidence.length}</summary>
      <div>
        ${evidence.map((item) => `
          <p>
            <strong>${escapeHtml(item.location || item.fileName || "模型片段")}</strong>
            <span>${escapeHtml(item.excerpt || item.fileName || "")}</span>
          </p>
        `).join("")}
      </div>
    </details>
  `;
}

function handleFileSelect(file) {
  if (!file.name.toLowerCase().endsWith(".slx")) {
    fileInfo.textContent = "仅支持 .slx 文件";
    fileInfo.classList.add("slx-file-info-error");
    selectedFile = null;
    uploadBtn.disabled = true;
    return;
  }
  fileInfo.classList.remove("slx-file-info-error");
  selectedFile = file;
  fileInfo.textContent = `已选择：${file.name}（${formatFileSize(file.size)}）`;
  uploadBtn.disabled = false;
}

async function handleUpload() {
  if (!selectedFile || !projectId || !moduleId) return;
  uploadBtn.disabled = true;
  try {
    const formData = new FormData();
    formData.set("slx", selectedFile);
    formData.set("documentType", "software_requirement");
    const result = await request(`/api/projects/${projectId}/modules/${moduleId}/assets`, {
      method: "POST",
      body: formData
    });
    const uploadedModel = (result.assets || []).find((asset) => asset.role === "simulink_slx" || String(asset.originalName || "").toLowerCase().endsWith(".slx"));
    selectedModelId = uploadedModel?.id || selectedModelId;
    selectedSessionId = "";
    selectedFile = null;
    slxInput.value = "";
    fileInfo.textContent = "";
    await refreshInterpreterState();
    renderAll();
    notifyParent({ type: "module_assets:changed", assetName: uploadedModel?.originalName || "" });
  } catch (error) {
    alert(error.message || "上传失败");
  } finally {
    uploadBtn.disabled = !selectedFile;
  }
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || !selectedModelId) return;
  sendBtn.disabled = true;
  questionInput.disabled = true;
  try {
    const session = getSelectedSession();
    const result = await request(`/api/projects/${projectId}/modules/${moduleId}/slx-interpreter/messages`, {
      method: "POST",
      body: JSON.stringify({
        modelAssetId: selectedModelId,
        sessionId: session?.id || "",
        question
      })
    });
    questionInput.value = "";
    upsertSession(result.session);
    selectedSessionId = result.session?.id || selectedSessionId;
    renderAll();
    ensurePolling();
    notifyParent({ type: "slx_interpreter:tasks_changed", taskId: result.task?.taskId || "", status: "running" });
  } catch (error) {
    alert(error.message || "提交问题失败");
  } finally {
    questionInput.disabled = false;
    syncFormState();
  }
}

function ensurePolling() {
  if (pollTimer || !projectId || !moduleId) return;
  pollTimer = setInterval(async () => {
    try {
      await refreshInterpreterState();
      renderAll();
      maybeHighlightMessage();
      if (!hasActiveMessages()) {
        clearInterval(pollTimer);
        pollTimer = 0;
      }
    } catch (error) {
      console.error("Polling failed", error);
    }
  }, 2500);
}

function hasActiveMessages() {
  return sessions.some((session) => (session.messages || []).some((message) =>
    message.role === "assistant" && ["queued", "running"].includes(message.status)
  ));
}

function getActiveMessage(session = null) {
  return (session?.messages || []).find((message) =>
    message.role === "assistant" && ["queued", "running"].includes(message.status)
  );
}

function getSelectedModel() {
  return models.find((model) => model.id === selectedModelId) || null;
}

function getSessionForModel(modelAssetId) {
  return sessions.find((session) => session.modelAssetId === modelAssetId) || null;
}

function getSelectedSession() {
  if (selectedSessionId) {
    const session = sessions.find((item) => item.id === selectedSessionId);
    if (session) return session;
  }
  return getSessionForModel(selectedModelId);
}

function upsertSession(session) {
  if (!session?.id) return;
  const index = sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }
}

function syncFormState() {
  const model = getSelectedModel();
  const busy = Boolean(getActiveMessage(getSelectedSession()));
  if (sendBtn) sendBtn.disabled = !model || busy || !questionInput.value.trim();
  if (questionInput) questionInput.disabled = !model || busy;
}

questionInput?.addEventListener("input", syncFormState);

function renderBreadcrumb() {
  if (!breadcrumbRoot) return;
  const moduleName = moduleData?.name || moduleId;
  const projectName = project?.name || projectId;
  breadcrumbRoot.innerHTML = `
    <a href="/">工程列表</a>
    <span class="breadcrumb-sep">/</span>
    <a href="/projects/${projectId}">${escapeHtml(projectName)}</a>
    <span class="breadcrumb-sep">/</span>
    <a href="/projects/${projectId}/modules/${moduleId}">${escapeHtml(moduleName)}</a>
    <span class="breadcrumb-sep">/</span>
    <strong>SLX 解释器</strong>
  `;
}

function syncTopNavLinks() {
  if (!projectId || !moduleId) return;
  const params = new URLSearchParams({ projectId, moduleId });
  const routeMap = {
    "/document-extractor": `/document-extractor?${params.toString()}`,
    "/requirement-generation": `/requirement-generation?${params.toString()}`,
    "/detail-design-generation": `/detail-design-generation?${params.toString()}`,
    "/slx-interpreter": `/slx-interpreter?${params.toString()}`,
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

function replaceUrlState() {
  if (!projectId || !moduleId) return;
  const params = new URLSearchParams({ projectId, moduleId });
  if (selectedModelId) params.set("modelAssetId", selectedModelId);
  if (selectedSessionId) params.set("sessionId", selectedSessionId);
  window.history.replaceState(null, "", `/slx-interpreter?${params.toString()}`);
}

function maybeHighlightMessage() {
  const selector = highlightMessageId
    ? `[data-message-id="${CSS.escape(highlightMessageId)}"]`
    : highlightTaskId
      ? `[data-task-id="${CSS.escape(highlightTaskId)}"]`
      : "";
  if (!selector) return;
  const target = chatMessages?.querySelector(selector);
  if (!target) return;
  target.scrollIntoView({ block: "center" });
  target.classList.add("is-highlighted");
}

function notifyParent(payload = {}) {
  try {
    window.parent?.postMessage({ projectId, moduleId, ...payload }, window.location.origin);
  } catch (_error) { /* ignore */ }
}

function renderMarkdownLite(markdown = "") {
  const escaped = escapeHtml(markdown);
  const blocks = escaped.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    if (block.startsWith("- ") || block.includes("\n- ")) {
      const items = block.split(/\n/).map((line) => line.replace(/^- /, "").trim()).filter(Boolean);
      return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
    }
    return `<p>${block.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function translateStatus(status = "") {
  return { completed: "已完成", running: "运行中", queued: "排队中", failed: "失败" }[status] || status;
}

function formatFileSize(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
