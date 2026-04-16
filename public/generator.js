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
const generateButton = document.querySelector("#generate-button");
const PENDING_GENERATION_STORAGE_KEY = "pending-module-generations";

let project = null;
let moduleData = null;
let llmMeta = null;
let initialization = null;

await bootstrap();

generateForm.addEventListener("submit", handleGenerate);
llmProfileSelect.addEventListener("change", renderSelectedProfileHint);

async function bootstrap() {
  if (!projectId || !moduleId) {
    setStatus("\u7f3a\u5c11\u5de5\u7a0b\u6216\u529f\u80fd\u6a21\u5757\u4e0a\u4e0b\u6587\uff0c\u8bf7\u4ece\u529f\u80fd\u6a21\u5757\u9875\u8fdb\u5165\u3002");
    disableGenerate();
    return;
  }

  try {
    const [projectResponse, moduleResponse, llmResponse, initResponse] = await Promise.all([
      request(`/api/projects/${projectId}`),
      request(`/api/projects/${projectId}/modules/${moduleId}`),
      request("/api/llm-profiles"),
      request(`/api/projects/${projectId}/modules/${moduleId}/initialization-check?documentType=${encodeURIComponent(pageDocumentType)}`)
    ]);
    project = projectResponse;
    moduleData = moduleResponse;
    llmMeta = llmResponse;
    initialization = initResponse;

    renderBreadcrumb();
    renderContext();
    renderProfiles();
    renderAssets();
    renderReferenceExampleCopy();
  } catch (error) {
    handleError(error);
    disableGenerate();
  }
}

async function handleGenerate(event) {
  event.preventDefault();
  try {
    const selectedAssetIds = [...assetPicker.querySelectorAll('input[name="assetIds"]:checked')].map((input) => input.value);
    const formData = new FormData(generateForm);
    if (selectedAssetIds.length) {
      formData.append("assetIds", selectedAssetIds.join(","));
    }
    formData.set("documentType", pageDocumentType);
    if (llmProfileSelect.value) {
      formData.set("llmProfileId", llmProfileSelect.value);
    }

    createPendingGeneration();
    generateButton.disabled = true;
    setStatus(`\u6b63\u5728\u4e0a\u4f20\u6587\u4ef6\u5e76\u542f\u52a8${documentLabel(pageDocumentType)}\u4efb\u52a1\uff0c\u4f60\u53ef\u4ee5\u8fd4\u56de\u6a21\u5757\u9875\u67e5\u770b\u8fdb\u884c\u4e2d\u7684\u72b6\u6001\u3002`, true);
    const result = await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${pageDocumentType}/tasks`, {
      method: "POST",
      body: formData
    });
    const taskId = result.task?.id || "";
    savePendingGeneration({
      taskId,
      startedAt: Date.now(),
      projectId,
      moduleId,
      moduleName: moduleData?.name || "",
      documentType: pageDocumentType,
      documentLabel: documentLabel(pageDocumentType)
    });
    window.location.href = `/projects/${projectId}/modules/${moduleId}?highlightTaskId=${encodeURIComponent(taskId)}&taskStarted=1`;
  } catch (error) {
    clearPendingGeneration(projectId, moduleId, pageDocumentType);
    generateButton.disabled = false;
    handleError(error);
  }
}

function renderBreadcrumb() {
  breadcrumbRoot.innerHTML = `
    <a class="nav-link" href="/">\u5de5\u7a0b\u5217\u8868</a>
    <span>/</span>
    <a class="nav-link" href="/projects/${project.id}">${escapeHtml(project.name)}</a>
    <span>/</span>
    <a class="nav-link" href="/projects/${project.id}/modules/${moduleData.id}">${escapeHtml(moduleData.name)}</a>
    <span>/</span>
    <span class="nav-link active">${escapeHtml(documentLabel(pageDocumentType))}\u751f\u6210</span>
  `;
  backToModule.href = `/projects/${project.id}/modules/${moduleData.id}`;
}

function renderContext() {
  contextCopy.textContent = `${project.name} / ${moduleData.name}`;
  const missing = initialization?.missingBootstrapAssets || [];
  const statusLabel = initialization?.hasModuleProfile
    ? "module skill ready"
    : missing.length
      ? "bootstrap assets required"
      : "auto bootstrap available";
  contextMeta.innerHTML = `
    <div class="metric"><span>\u5de5\u7a0b</span><strong>${escapeHtml(project.name)}</strong></div>
    <div class="metric"><span>\u529f\u80fd\u6a21\u5757</span><strong>${escapeHtml(moduleData.name)}</strong></div>
    <div class="metric"><span>\u6a21\u5757\u8d44\u4ea7</span><strong>${moduleData.assets?.length || 0}</strong></div>
    <div class="metric"><span>Skill</span><strong>${escapeHtml(statusLabel)}</strong></div>
  `;
  if (missing.length) {
    metaRoot.textContent = `\u5f53\u524d\u6a21\u5757\u8fd8\u6ca1\u6709\u53ef\u76f4\u63a5\u590d\u7528\u7684 module skill\uff1b\u7f3a\u5c11\u51b7\u542f\u52a8\u8d44\u4ea7\uff1a${missing.map((item) => bootstrapLabel(item.label)).join(" / ")}`;
    disableGenerate(`缺少冷启动资产：${missing.map((item) => bootstrapLabel(item.label)).join(" / ")}`);
  } else {
    metaRoot.textContent = "\u751f\u6210\u5b8c\u6210\u540e\u4f1a\u81ea\u52a8\u8fd4\u56de\u529f\u80fd\u6a21\u5757\u4e3b\u9875\uff0c\u5e76\u5728\u5386\u53f2\u4efb\u52a1\u5217\u8868\u4e2d\u663e\u793a\u65b0\u4efb\u52a1\u3002";
    enableGenerate();
  }
}

function renderProfiles() {
  llmProfileSelect.innerHTML = "";
  const profiles = llmMeta?.profiles || [];

  const fallback = document.createElement("option");
  fallback.value = "";
  fallback.textContent = "\u672a\u914d\u7f6e\uff0c\u4f7f\u7528\u672c\u5730\u56de\u9000\u6a21\u5f0f";
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
    ? `\u5f53\u524d\u4f7f\u7528 ${profile.providerLabel} / ${profile.model}`
    : "\u672a\u9009\u62e9\u5916\u90e8\u6a21\u578b\uff0c\u5c06\u4f7f\u7528\u672c\u5730\u56de\u9000\u6a21\u5f0f\u3002";
}

function renderReferenceExampleCopy() {
  const label = document.querySelector("#reference-example-copy");
  if (!label) return;
  label.textContent =
    pageDocumentType === "detail_design"
      ? "\u53c2\u8003\u4f18\u79c0\u8be6\u7ec6\u8bbe\u8ba1\u8303\u4f8b"
      : pageDocumentType === "hil_test_case"
        ? "\u53c2\u8003\u4f18\u79c0 HIL \u7528\u4f8b\u8303\u4f8b"
        : "\u53c2\u8003\u4f18\u79c0\u8f6f\u4ef6\u9700\u6c42\u8303\u4f8b";
}

function renderAssets() {
  const assets = moduleData?.assets || [];
  if (!assets.length) {
    assetPicker.innerHTML = '<p class="empty-state">\u5f53\u524d\u6a21\u5757\u8fd8\u6ca1\u6709\u8d44\u4ea7\uff0c\u672c\u6b21\u53ef\u76f4\u63a5\u901a\u8fc7\u53f3\u4fa7\u8868\u5355\u4e0a\u4f20\u6587\u4ef6\u3002</p>';
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
            <p>\u4e0a\u4f20\u65f6\u95f4\uff1a${formatDateTime(asset.uploadedAt)}</p>
            <p>\u5927\u5c0f\uff1a${formatFileSize(asset.size)}</p>
          </div>
        </label>
      `
    )
    .join("");
}

function disableGenerate(message = "") {
  generateForm.querySelector("button[type='submit']").disabled = true;
  if (message) {
    setStatus(message);
  }
}

function enableGenerate() {
  generateForm.querySelector("button[type='submit']").disabled = false;
}

function getPendingGenerations() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PENDING_GENERATION_STORAGE_KEY) || "[]");
  } catch (error) {
    console.warn("Failed to parse pending generations", error);
    return [];
  }
}

function savePendingGeneration(entry) {
  const entries = getPendingGenerations().filter(
    (item) => !(item.projectId === entry.projectId && item.moduleId === entry.moduleId && item.documentType === entry.documentType)
  );
  entries.unshift(entry);
  window.sessionStorage.setItem(PENDING_GENERATION_STORAGE_KEY, JSON.stringify(entries.slice(0, 10)));
}

function clearPendingGeneration(targetProjectId, targetModuleId, targetDocumentType) {
  const entries = getPendingGenerations().filter(
    (item) => !(item.projectId === targetProjectId && item.moduleId === targetModuleId && item.documentType === targetDocumentType)
  );
  window.sessionStorage.setItem(PENDING_GENERATION_STORAGE_KEY, JSON.stringify(entries));
}

function createPendingGeneration() {
  savePendingGeneration({
    taskId: "",
    startedAt: Date.now(),
    projectId,
    moduleId,
    moduleName: moduleData?.name || "",
    documentType: pageDocumentType,
    documentLabel: documentLabel(pageDocumentType)
  });
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
  statusRoot.textContent = message;
  statusRoot.classList.toggle("status-busy", emphasized);
}

function handleError(error) {
  console.error(error);
  if (error?.code === "module_skill_initialization_required" && error?.details?.missingBootstrapAssets?.length) {
    const missingLabels = error.details.missingBootstrapAssets.map((item) => bootstrapLabel(item.label)).join(" / ");
    disableGenerate(`生成前还缺少这些冷启动资产：${missingLabels}`);
    return;
  }
  setStatus(error.message || "\u64cd\u4f5c\u5931\u8d25");
}

function documentLabel(documentType) {
  if (documentType === "detail_design") return "\u8f6f\u4ef6\u8be6\u7ec6\u8bbe\u8ba1";
  if (documentType === "hil_test_case") return "HIL \u6d4b\u8bd5\u7528\u4f8b";
  return "\u8f6f\u4ef6\u9700\u6c42";
}

function countTasks(module, documentType) {
  return module?.documentSpaces?.[documentType]?.generationTasks?.length || 0;
}

function getRoleLabel(role) {
  if (role === "system_pdf") return "\u7cfb\u7edf\u9700\u6c42";
  if (role === "model_pdf") return "\u6a21\u578b\u6587\u6863";
  if (role === "generated_c") return "\u751f\u6210\u4ee3\u7801";
  if (role === "simulink_slx") return "SLX \u6a21\u578b";
  if (role === "reference_requirement_example") return "\u8f6f\u4ef6\u9700\u6c42\u8303\u4f8b";
  if (role === "reference_detail_design_example") return "\u8be6\u7ec6\u8bbe\u8ba1\u8303\u4f8b";
  if (role === "reference_hil_test_case_example") return "HIL \u7528\u4f8b\u8303\u4f8b";
  return role || "\u5176\u4ed6";
}

function bootstrapLabel(label) {
  if (label === "system_requirement") return "\u7cfb\u7edf\u9700\u6c42\u6587\u4ef6";
  if (label === "implementation_input") return "\u6a21\u578b/\u4ee3\u7801\u8f93\u5165";
  if (label === "reference_requirement_example") return "\u4f18\u79c0\u8f6f\u4ef6\u9700\u6c42\u8303\u4f8b";
  if (label === "reference_detail_design_example") return "\u4f18\u79c0\u8be6\u7ec6\u8bbe\u8ba1\u8303\u4f8b";
  if (label === "reference_hil_test_case_example") return "\u4f18\u79c0 HIL \u7528\u4f8b\u8303\u4f8b";
  return label;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "\u672a\u77e5\u65f6\u95f4";
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
