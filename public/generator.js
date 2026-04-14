const pageDocumentType = document.body.dataset.documentType || "software_requirement";
const query = new URLSearchParams(window.location.search);
const projectId = query.get("projectId") || "";
const moduleId = query.get("moduleId") || "";

const llmProfileSelect = document.querySelector("#llm-profile-select");
const llmProfileHint = document.querySelector("#llm-profile-hint");
const metaRoot = document.querySelector("#meta");
const statusRoot = document.querySelector("#status");
const contextCopy = document.querySelector("#context-copy");
const contextMeta = document.querySelector("#context-meta");
const assetPicker = document.querySelector("#asset-picker");
const breadcrumbRoot = document.querySelector("#generator-breadcrumb");
const backToModule = document.querySelector("#back-to-module");
const generateForm = document.querySelector("#generate-form");

let project = null;
let moduleData = null;
let llmMeta = null;

await bootstrap();

generateForm.addEventListener("submit", handleGenerate);
llmProfileSelect.addEventListener("change", renderSelectedProfileHint);

async function bootstrap() {
  if (!projectId || !moduleId) {
    setStatus("缺少工程或功能模块上下文，请从功能模块页进入。");
    disableGenerate();
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
    renderAssets();
  } catch (error) {
    handleError(error);
    disableGenerate();
  }
}

async function handleGenerate(event) {
  event.preventDefault();
  try {
    const selectedAssetIds = [...assetPicker.querySelectorAll('input[name="assetIds"]:checked')].map(
      (input) => input.value
    );
    const formData = new FormData(generateForm);
    if (selectedAssetIds.length) {
      formData.append("assetIds", selectedAssetIds.join(","));
    }
    if (llmProfileSelect.value) {
      formData.set("llmProfileId", llmProfileSelect.value);
    }

    setStatus(`正在生成${documentLabel(pageDocumentType)}，请稍候...`);
    const result = await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${pageDocumentType}/tasks`, {
      method: "POST",
      body: formData
    });
    const taskId = result.task?.id || "";
    window.location.href = `/projects/${projectId}/modules/${moduleId}?highlightTaskId=${encodeURIComponent(taskId)}`;
  } catch (error) {
    handleError(error);
  }
}

function renderBreadcrumb() {
  breadcrumbRoot.innerHTML = `
    <a class="nav-link" href="/">工程列表</a>
    <span>/</span>
    <a class="nav-link" href="/projects/${project.id}">${escapeHtml(project.name)}</a>
    <span>/</span>
    <a class="nav-link" href="/projects/${project.id}/modules/${moduleData.id}">${escapeHtml(moduleData.name)}</a>
    <span>/</span>
    <span class="nav-link active">${escapeHtml(documentLabel(pageDocumentType))}生成</span>
  `;
  backToModule.href = `/projects/${project.id}/modules/${moduleData.id}`;
}

function renderContext() {
  contextCopy.textContent = `${project.name} / ${moduleData.name}`;
  contextMeta.innerHTML = `
    <div class="metric"><span>工程</span><strong>${escapeHtml(project.name)}</strong></div>
    <div class="metric"><span>功能模块</span><strong>${escapeHtml(moduleData.name)}</strong></div>
    <div class="metric"><span>模块资产</span><strong>${moduleData.assets?.length || 0}</strong></div>
    <div class="metric"><span>历史任务</span><strong>${countTasks(moduleData, pageDocumentType)}</strong></div>
  `;
  metaRoot.textContent = "生成完成后会自动返回功能模块主页，并在历史任务列表中显示新任务。";
}

function renderProfiles() {
  llmProfileSelect.innerHTML = "";
  const profiles = llmMeta?.profiles || [];

  const fallback = document.createElement("option");
  fallback.value = "";
  fallback.textContent = "未配置，使用本地回退模式";
  fallback.selected = true;
  llmProfileSelect.append(fallback);

  for (const profile of profiles) {
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
    : "未选择外部模型，将使用本地回退模式。";
}

function renderAssets() {
  const assets = moduleData?.assets || [];
  if (!assets.length) {
    assetPicker.innerHTML = '<p class="empty-state">当前模块还没有资产，本次可直接通过右侧表单上传文件。</p>';
    return;
  }

  assetPicker.innerHTML = assets
    .map(
      (asset) => `
        <label class="file-item checkbox-item">
          <input type="checkbox" name="assetIds" value="${asset.id}" checked />
          <div class="file-item-copy">
            <div class="file-item-title-row">
              <strong>${escapeHtml(asset.originalName)}</strong>
              <span class="mini-pill subtle">${escapeHtml(getRoleLabel(asset.role))}</span>
            </div>
            <p>上传时间：${formatDateTime(asset.uploadedAt)}</p>
            <p>大小：${formatFileSize(asset.size)}</p>
          </div>
        </label>
      `
    )
    .join("");
}

function disableGenerate() {
  generateForm.querySelector("button[type='submit']").disabled = true;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setStatus(message) {
  statusRoot.textContent = message;
}

function handleError(error) {
  console.error(error);
  setStatus(error.message || "操作失败");
}

function documentLabel(documentType) {
  return documentType === "detail_design" ? "软件详细设计" : "软件需求";
}

function countTasks(module, documentType) {
  return module?.documentSpaces?.[documentType]?.generationTasks?.length || 0;
}

function getRoleLabel(role) {
  if (role === "system_pdf") return "系统需求";
  if (role === "model_pdf") return "模型文档";
  if (role === "generated_c") return "生成代码";
  if (role === "simulink_slx") return "SLX 模型";
  return role || "其他";
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
