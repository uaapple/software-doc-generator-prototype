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
const manualTitleOutlineCard = document.querySelector("#manual-title-outline-card");
const manualTitleOutlineSummary = document.querySelector("#manual-title-outline-summary");
const manualTitleOutlineStatus = document.querySelector("#manual-title-outline-status");
const manualTitleOutlineRoot = document.querySelector("#manual-title-outline-root");
const manualTitleOutlineAddSectionButton = document.querySelector("#manual-title-outline-add-section");
const PENDING_GENERATION_STORAGE_KEY = "pending-module-generations";
const LAST_STARTED_MANUAL_TITLE_OUTLINE_STORAGE_KEY = "last-started-manual-title-outline";

let project = null;
let moduleData = null;
let llmMeta = null;
let initialization = null;
let generationBaseLocked = false;
let generationBaseLockReason = "当前生成入口不可用。";
let manualTitleOutlineState = createDefaultManualTitleOutline();

syncTopNavLinks();

function requiresExplicitBootstrap() {
  return pageDocumentType === "software_requirement" && Boolean(initialization?.requiresExplicitBootstrap);
}

function currentTaskIntent() {
  return requiresExplicitBootstrap() ? "module_skill_bootstrap" : "generation";
}

function isFormalSoftwareRequirementGeneration() {
  return pageDocumentType === "software_requirement" && currentTaskIntent() === "generation";
}

function isDisallowedFormalSoftwareRequirementAssetRole(role = "") {
  if (!isFormalSoftwareRequirementGeneration()) {
    return false;
  }
  return role === "reference_requirement_example" || role === "extracted_software_requirement";
}

function getSelectableAssets() {
  const assets = moduleData?.assets || [];
  return assets.filter((asset) => !isDisallowedFormalSoftwareRequirementAssetRole(asset.role));
}

function syncPrimaryAction() {
  if (!generateButton) {
    return;
  }
  generateButton.textContent = requiresExplicitBootstrap() ? "开始技能冷启动" : "启动生成";
}

await bootstrap();

generateForm.addEventListener("submit", handleGenerate);
llmProfileSelect.addEventListener("change", renderSelectedProfileHint);
manualTitleOutlineAddSectionButton?.addEventListener("click", () => {
  if (!isManualTitleOutlineVisible()) {
    return;
  }
  manualTitleOutlineState.sections.push(createManualTitleOutlineSection());
  renderManualTitleOutlineEditor();
});
manualTitleOutlineRoot?.addEventListener("click", handleManualTitleOutlineClick);
manualTitleOutlineRoot?.addEventListener("input", handleManualTitleOutlineInput);

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
    restoreLastStartedManualTitleOutline();
    renderManualTitleOutlineEditor();
    enforceRunningTaskGuard();
  } catch (error) {
    handleError(error);
    disableGenerate();
  }
}

async function handleGenerate(event) {
  event.preventDefault();
  try {
    if (hasRunningTask()) {
      disableGenerate(`当前模块已有进行中的${documentLabel(pageDocumentType)}任务，请等待完成后再发起新的生成。`);
      return;
    }
    if (isManualTitleOutlineVisible()) {
      const validation = validateManualTitleOutline();
      if (!validation.valid) {
        renderManualTitleOutlineEditor();
        manualTitleOutlineStatus.textContent = validation.message;
        manualTitleOutlineStatus.classList.add("error");
        refreshGenerateButtonState();
        return;
      }
    }
    const selectableAssetIds = new Set(getSelectableAssets().map((asset) => asset.id));
    const selectedAssetIds = [...assetPicker.querySelectorAll('input[name="assetIds"]:checked')]
      .map((input) => input.value)
      .filter((assetId) => selectableAssetIds.has(assetId));
    const formData = new FormData(generateForm);
    if (selectedAssetIds.length) {
      formData.append("assetIds", selectedAssetIds.join(","));
    }
    formData.set("documentType", pageDocumentType);
    formData.set("taskIntent", currentTaskIntent());
    const manualTitleOutlinePayload = isManualTitleOutlineVisible() ? buildManualTitleOutlinePayload() : null;
    if (isManualTitleOutlineVisible()) {
      formData.set("manualTitleOutline", JSON.stringify(manualTitleOutlinePayload));
    }
    if (llmProfileSelect.value) {
      formData.set("llmProfileId", llmProfileSelect.value);
    }

    createPendingGeneration();
    generateButton.disabled = true;
    setStatus(
      requiresExplicitBootstrap()
        ? "\u6b63\u5728\u4e0a\u4f20\u6587\u4ef6\u5e76\u542f\u52a8\u6280\u80fd\u51b7\u542f\u52a8\u4efb\u52a1\uff0c\u7a0d\u540e\u53ef\u5728\u6a21\u5757\u9875\u67e5\u770b cold start \u8fdb\u5ea6\u3002"
        : `\u6b63\u5728\u4e0a\u4f20\u6587\u4ef6\u5e76\u542f\u52a8${documentLabel(pageDocumentType)}\u4efb\u52a1\uff0c\u4f60\u53ef\u4ee5\u8fd4\u56de\u6a21\u5757\u9875\u67e5\u770b\u8fdb\u884c\u4e2d\u7684\u72b6\u6001\u3002`,
      true
    );
    const result = await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${pageDocumentType}/tasks`, {
      method: "POST",
      body: formData
    });
    if (manualTitleOutlinePayload) {
      persistLastStartedManualTitleOutline(manualTitleOutlinePayload);
    }
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
    const targetUrl = `/projects/${projectId}/modules/${moduleId}?highlightTaskId=${encodeURIComponent(taskId)}&taskStarted=1`;
    if (window.top && window.top !== window) {
      window.top.location.href = targetUrl;
      return;
    }
    window.location.href = targetUrl;
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

function renderContext() {
  contextCopy.textContent = `${project.name} / ${moduleData.name}`;
  const missing = initialization?.missingBootstrapAssets || [];
  const statusLabel = requiresExplicitBootstrap()
    ? "explicit cold-start required"
    : initialization?.hasScopedModuleSkill
    ? "doc type scoped skill ready"
    : initialization?.usesLegacyGlobalFallback
      ? "legacy global fallback"
      : missing.length
        ? "bootstrap assets required"
        : "auto bootstrap via Hermes";
  contextMeta.innerHTML = `
    <div class="metric"><span>\u5de5\u7a0b</span><strong>${escapeHtml(project.name)}</strong></div>
    <div class="metric"><span>\u529f\u80fd\u6a21\u5757</span><strong>${escapeHtml(moduleData.name)}</strong></div>
    <div class="metric"><span>\u6a21\u5757\u8d44\u4ea7</span><strong>${moduleData.assets?.length || 0}</strong></div>
    <div class="metric"><span>Skill</span><strong>${escapeHtml(statusLabel)}</strong></div>
  `;
  syncPrimaryAction();
  if (requiresExplicitBootstrap() && missing.length) {
    metaRoot.textContent = `当前模块被标记为冷启动模式，开始软件需求生成前必须先完成一次技能冷启动；当前还缺少：${missing.map((item) => bootstrapLabel(item.label)).join(" / ")}`;
    disableGenerate(`缺少冷启动资产：${missing.map((item) => bootstrapLabel(item.label)).join(" / ")}`);
  } else if (requiresExplicitBootstrap()) {
    metaRoot.textContent = "当前模块被标记为冷启动模式，需先完成一次软件需求技能冷启动。补齐资产后点击“开始技能冷启动”。";
    enableGenerate();
  } else if (missing.length) {
    metaRoot.textContent = `\u5f53\u524d\u6a21\u5757\u8fd8\u6ca1\u6709\u53ef\u76f4\u63a5\u590d\u7528\u7684 module skill\uff1b\u7f3a\u5c11\u51b7\u542f\u52a8\u8d44\u4ea7\uff1a${missing.map((item) => bootstrapLabel(item.label)).join(" / ")}`;
    disableGenerate(`缺少冷启动资产：${missing.map((item) => bootstrapLabel(item.label)).join(" / ")}`);
  } else if (initialization?.hasScopedModuleSkill) {
    metaRoot.textContent = "当前模块已经具备当前文档类型专属 module skill，本次会直接进入 Hermes 正式生成链路。";
    enableGenerate();
  } else if (initialization?.usesLegacyGlobalFallback) {
    metaRoot.textContent = "当前模块尚无当前文档类型专属 module skill，本次将复用 legacy global fallback 并直接进入正式生成。";
    enableGenerate();
  } else {
    metaRoot.textContent = "当前模块会先通过 Hermes 冷启动提炼当前文档类型的 module skill，写入 skill 库后再继续正式生成。";
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
  const input = document.querySelector('input[name="referenceExample"]');
  const field = input?.closest("label");
  if (isFormalSoftwareRequirementGeneration()) {
    if (input) {
      input.disabled = true;
      input.value = "";
    }
    if (field) {
      field.hidden = true;
    }
    if (label) {
      label.textContent = "\u51b7\u542f\u52a8\u53c2\u8003\u8f6f\u4ef6\u9700\u6c42\u8303\u4f8b";
    }
    return;
  }

  if (input) {
    input.disabled = false;
  }
  if (field) {
    field.hidden = false;
  }
  if (!label) return;
  label.textContent =
    pageDocumentType === "detail_design"
      ? "\u53c2\u8003\u4f18\u79c0\u8be6\u7ec6\u8bbe\u8ba1\u8303\u4f8b"
      : pageDocumentType === "hil_test_case"
        ? "\u53c2\u8003\u4f18\u79c0 HIL \u7528\u4f8b\u8303\u4f8b"
        : "\u53c2\u8003\u4f18\u79c0\u8f6f\u4ef6\u9700\u6c42\u8303\u4f8b";
}

function isManualTitleOutlineVisible() {
  return pageDocumentType === "software_requirement" && !requiresExplicitBootstrap();
}

function createClientId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
      .slice(8, 10)
      .join("")}-${hex.slice(10, 16).join("")}`;
  }

  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createManualTitleOutlineItem(title = "") {
  return {
    id: createClientId(),
    title: String(title || "")
  };
}

function createManualTitleOutlineSection(title = "", itemTitles = [""]) {
  const items = Array.isArray(itemTitles) && itemTitles.length ? itemTitles : [""];
  return {
    id: createClientId(),
    title: String(title || ""),
    items: items.map((itemTitle) => createManualTitleOutlineItem(itemTitle))
  };
}

function createDefaultManualTitleOutline() {
  return {
    sections: [createManualTitleOutlineSection("", [""])]
  };
}

function getLastStartedManualTitleOutlineStorageKey() {
  if (!projectId || !moduleId || !pageDocumentType) {
    return LAST_STARTED_MANUAL_TITLE_OUTLINE_STORAGE_KEY;
  }
  return `${LAST_STARTED_MANUAL_TITLE_OUTLINE_STORAGE_KEY}:${projectId}:${moduleId}:${pageDocumentType}`;
}

function buildManualTitleOutlineStateFromPayload(payload = {}) {
  const sections = Array.isArray(payload.sections)
    ? payload.sections
        .map((section) => {
          const sectionTitle = trimManualTitleOutlineText(section.sectionTitle || section.title || "");
          const itemTitles = (Array.isArray(section.items) ? section.items : [])
            .map((item) => trimManualTitleOutlineText(item.itemTitle || item.title || ""))
            .filter(Boolean);
          if (!sectionTitle || !itemTitles.length) {
            return null;
          }
          return createManualTitleOutlineSection(sectionTitle, itemTitles);
        })
        .filter(Boolean)
    : [];

  return sections.length ? { sections } : createDefaultManualTitleOutline();
}

function restoreLastStartedManualTitleOutline() {
  if (!isManualTitleOutlineVisible()) {
    return;
  }
  try {
    const raw = window.localStorage.getItem(getLastStartedManualTitleOutlineStorageKey());
    if (!raw) {
      return;
    }
    manualTitleOutlineState = buildManualTitleOutlineStateFromPayload(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to restore last started manual title outline", error);
  }
}

function persistLastStartedManualTitleOutline(payload = buildManualTitleOutlinePayload()) {
  if (!isManualTitleOutlineVisible()) {
    return;
  }
  try {
    window.localStorage.setItem(getLastStartedManualTitleOutlineStorageKey(), JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to persist last started manual title outline", error);
  }
}

function trimManualTitleOutlineText(value) {
  return String(value || "").trim();
}

function getManualTitleOutlineValidation() {
  const sections = Array.isArray(manualTitleOutlineState.sections) ? manualTitleOutlineState.sections : [];
  const sectionCount = sections.length;
  const itemCount = sections.reduce(
    (total, section) => total + (Array.isArray(section.items) ? section.items.length : 0),
    0
  );
  if (!sections.length) {
    return {
      valid: false,
      message: "至少需要 1 个一级标题。",
      sectionCount: 0,
      itemCount: 0,
      invalidSectionIndex: -1,
      invalidItemIndex: -1
    };
  }

  for (const [sectionIndex, section] of sections.entries()) {
    const sectionTitle = trimManualTitleOutlineText(section.title);
    if (!sectionTitle) {
      return {
        valid: false,
        message: `第 ${sectionIndex + 1} 个一级标题不能为空。`,
        sectionCount,
        itemCount,
        invalidSectionIndex: sectionIndex,
        invalidItemIndex: -1
      };
    }

    const items = Array.isArray(section.items) ? section.items : [];
    if (!items.length) {
      return {
        valid: false,
        message: `一级标题“${sectionTitle}”下至少需要 1 个二级标题。`,
        sectionCount,
        itemCount,
        invalidSectionIndex: sectionIndex,
        invalidItemIndex: -1
      };
    }

    for (const [itemIndex, item] of items.entries()) {
      const itemTitle = trimManualTitleOutlineText(item.title);
      if (!itemTitle) {
        return {
          valid: false,
          message: `一级标题“${sectionTitle}”下的第 ${itemIndex + 1} 个二级标题不能为空。`,
          sectionCount,
          itemCount,
          invalidSectionIndex: sectionIndex,
          invalidItemIndex: itemIndex
        };
      }
    }
  }

  return {
    valid: true,
    message: `当前框架可用于正式生成，已设置 ${sections.length} 个一级标题和 ${itemCount} 个二级标题。`,
    sectionCount,
    itemCount,
    invalidSectionIndex: -1,
    invalidItemIndex: -1
  };
}

function validateManualTitleOutline() {
  return getManualTitleOutlineValidation();
}

function buildManualTitleOutlinePayload() {
  return {
    version: 1,
    sections: (Array.isArray(manualTitleOutlineState.sections) ? manualTitleOutlineState.sections : []).map((section) => {
      const sectionTitle = trimManualTitleOutlineText(section.title);
      return {
        sectionId: section.id,
        sectionTitle,
        title: sectionTitle,
        items: (Array.isArray(section.items) ? section.items : []).map((item) => {
          const itemTitle = trimManualTitleOutlineText(item.title);
          return {
            itemId: item.id,
            itemTitle,
            title: itemTitle
          };
        })
      };
    })
  };
}

function syncManualTitleOutlineFieldValidity(validation = getManualTitleOutlineValidation()) {
  if (!manualTitleOutlineRoot) {
    return;
  }

  manualTitleOutlineRoot.querySelectorAll("[data-outline-field='section-title']").forEach((input) => {
    const sectionIndex = Number(input.dataset.sectionIndex || 0);
    const section = manualTitleOutlineState.sections?.[sectionIndex];
    const invalid = !trimManualTitleOutlineText(section?.title);
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
  });
  manualTitleOutlineRoot.querySelectorAll("[data-outline-field='item-title']").forEach((input) => {
    const sectionIndex = Number(input.dataset.sectionIndex || 0);
    const itemIndex = Number(input.dataset.itemIndex || 0);
    const item = manualTitleOutlineState.sections?.[sectionIndex]?.items?.[itemIndex];
    const invalid = !trimManualTitleOutlineText(item?.title);
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
  });

  if (validation.valid) {
    manualTitleOutlineStatus?.classList.remove("error");
  } else {
    manualTitleOutlineStatus?.classList.add("error");
  }
}

function renderManualTitleOutlineSummary(validation = getManualTitleOutlineValidation()) {
  if (!manualTitleOutlineSummary) {
    return;
  }

  manualTitleOutlineSummary.innerHTML = `
    <div class="metric">
      <span>一级标题数量</span>
      <strong>${validation.sectionCount}</strong>
    </div>
    <div class="metric">
      <span>最终条目数</span>
      <strong>${validation.itemCount}</strong>
    </div>
  `;
}

function renderManualTitleOutlineStatus(validation = getManualTitleOutlineValidation()) {
  if (!manualTitleOutlineStatus) {
    return;
  }

  manualTitleOutlineStatus.textContent = validation.message;
  manualTitleOutlineStatus.classList.toggle("error", !validation.valid);
}

function renderManualTitleOutlineEditor() {
  if (!manualTitleOutlineCard || !manualTitleOutlineRoot) {
    return;
  }

  const visible = isManualTitleOutlineVisible();
  manualTitleOutlineCard.hidden = !visible;
  if (!visible) {
    return;
  }

  const sections = Array.isArray(manualTitleOutlineState.sections) ? manualTitleOutlineState.sections : [];
  manualTitleOutlineRoot.innerHTML = sections
    .map((section, sectionIndex) => {
      const sectionTitle = trimManualTitleOutlineText(section.title);
      const sectionItems = Array.isArray(section.items) ? section.items : [];
      return `
        <article class="manual-title-outline-section" data-outline-section-index="${sectionIndex}">
          <div class="manual-title-outline-section-head">
            <div class="manual-title-outline-section-title">
              <span class="mini-pill subtle">一级标题 ${sectionIndex + 1}</span>
              <strong>${escapeHtml(sectionTitle || "未命名一级标题")}</strong>
            </div>
            <div class="manual-title-outline-section-actions">
              <button type="button" class="secondary-button" data-outline-action="move-section-up" data-section-index="${sectionIndex}" ${sectionIndex === 0 ? "disabled" : ""}>上移</button>
              <button type="button" class="secondary-button" data-outline-action="move-section-down" data-section-index="${sectionIndex}" ${sectionIndex === sections.length - 1 ? "disabled" : ""}>下移</button>
              <button type="button" class="secondary-button" data-outline-action="remove-section" data-section-index="${sectionIndex}" ${sections.length === 1 ? "disabled" : ""}>删除一级标题</button>
            </div>
          </div>
          <label>
            一级标题
            <input
              data-outline-field="section-title"
              data-section-index="${sectionIndex}"
              value="${escapeHtml(sectionTitle)}"
              placeholder="请输入一级标题"
            />
          </label>
          <div class="manual-title-outline-items">
            ${sectionItems
              .map((item, itemIndex) => {
                const itemTitle = trimManualTitleOutlineText(item.title);
                return `
                  <div class="manual-title-outline-item" data-outline-item-index="${itemIndex}">
                    <label>
                      二级标题
                      <input
                        data-outline-field="item-title"
                        data-section-index="${sectionIndex}"
                        data-item-index="${itemIndex}"
                        value="${escapeHtml(itemTitle)}"
                        placeholder="请输入二级标题"
                      />
                    </label>
                    <div class="manual-title-outline-item-actions">
                      <button type="button" class="secondary-button" data-outline-action="move-item-up" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${itemIndex === 0 ? "disabled" : ""}>上移</button>
                      <button type="button" class="secondary-button" data-outline-action="move-item-down" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${itemIndex === sectionItems.length - 1 ? "disabled" : ""}>下移</button>
                      <button type="button" class="secondary-button" data-outline-action="remove-item" data-section-index="${sectionIndex}" data-item-index="${itemIndex}" ${sectionItems.length === 1 ? "disabled" : ""}>删除二级标题</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
          <div class="outline-actions">
            <button type="button" class="secondary-button" data-outline-action="add-item" data-section-index="${sectionIndex}">新增二级标题</button>
          </div>
        </article>
      `;
    })
    .join("");

  const validation = getManualTitleOutlineValidation();
  renderManualTitleOutlineSummary(validation);
  renderManualTitleOutlineStatus(validation);
  syncManualTitleOutlineFieldValidity(validation);
  refreshGenerateButtonState();
}

function handleManualTitleOutlineClick(event) {
  const trigger = event.target.closest("[data-outline-action]");
  if (!trigger || !isManualTitleOutlineVisible()) {
    return;
  }

  const action = trigger.dataset.outlineAction || "";
  const sectionIndex = Number(trigger.dataset.sectionIndex || -1);
  const itemIndex = Number(trigger.dataset.itemIndex || -1);
  const sections = manualTitleOutlineState.sections || [];
  const section = sections[sectionIndex];
  if (!section) {
    return;
  }

  event.preventDefault();

  if (action === "move-section-up" && sectionIndex > 0) {
    [sections[sectionIndex - 1], sections[sectionIndex]] = [sections[sectionIndex], sections[sectionIndex - 1]];
  } else if (action === "move-section-down" && sectionIndex < sections.length - 1) {
    [sections[sectionIndex + 1], sections[sectionIndex]] = [sections[sectionIndex], sections[sectionIndex + 1]];
  } else if (action === "remove-section" && sections.length > 1) {
    sections.splice(sectionIndex, 1);
  } else if (action === "add-item") {
    section.items.push(createManualTitleOutlineItem(""));
  } else if (action === "move-item-up" && itemIndex > 0 && section.items?.[itemIndex]) {
    [section.items[itemIndex - 1], section.items[itemIndex]] = [section.items[itemIndex], section.items[itemIndex - 1]];
  } else if (action === "move-item-down" && itemIndex < section.items.length - 1 && section.items?.[itemIndex]) {
    [section.items[itemIndex + 1], section.items[itemIndex]] = [section.items[itemIndex], section.items[itemIndex + 1]];
  } else if (action === "remove-item" && section.items.length > 1) {
    section.items.splice(itemIndex, 1);
  } else {
    return;
  }

  renderManualTitleOutlineEditor();
}

function handleManualTitleOutlineInput(event) {
  if (!isManualTitleOutlineVisible()) {
    return;
  }

  const field = event.target.closest("[data-outline-field]");
  if (!field) {
    return;
  }

  const sectionIndex = Number(field.dataset.sectionIndex || -1);
  const section = manualTitleOutlineState.sections?.[sectionIndex];
  if (!section) {
    return;
  }

  const value = trimManualTitleOutlineText(field.value);
  if (field.dataset.outlineField === "section-title") {
    section.title = value;
  } else if (field.dataset.outlineField === "item-title") {
    const itemIndex = Number(field.dataset.itemIndex || -1);
    const item = section.items?.[itemIndex];
    if (!item) {
      return;
    }
    item.title = value;
  }

  const validation = getManualTitleOutlineValidation();
  renderManualTitleOutlineSummary(validation);
  renderManualTitleOutlineStatus(validation);
  syncManualTitleOutlineFieldValidity(validation);
  refreshGenerateButtonState();
}

function renderAssets() {
  const assets = moduleData?.assets || [];
  const selectableAssets = getSelectableAssets();
  const filteredAssetCount = assets.length - selectableAssets.length;

  if (!assets.length) {
    assetPicker.innerHTML = '<p class="empty-state">\u5f53\u524d\u6a21\u5757\u8fd8\u6ca1\u6709\u8d44\u4ea7\uff0c\u672c\u6b21\u53ef\u76f4\u63a5\u901a\u8fc7\u53f3\u4fa7\u8868\u5355\u4e0a\u4f20\u6587\u4ef6\u3002</p>';
    return;
  }

  if (!selectableAssets.length) {
    if (filteredAssetCount > 0 && isFormalSoftwareRequirementGeneration()) {
      assetPicker.innerHTML =
        '<p class="empty-state">\u5f53\u524d\u6a21\u5757\u53ea\u6709\u53c2\u8003\u8f6f\u4ef6\u9700\u6c42\u7c7b\u8d44\u4ea7\uff0c\u4f46\u6b63\u5f0f\u8f6f\u4ef6\u9700\u6c42\u751f\u6210\u4e0d\u4f1a\u4f7f\u7528\u4eba\u5de5\u8303\u4f8b\uff0c\u8bf7\u9009\u62e9\u7cfb\u7edf\u9700\u6c42\u6216\u4ee3\u7801/\u6a21\u578b\u8d44\u4ea7\uff0c\u6216\u5728\u53f3\u4fa7\u8868\u5355\u4e2d\u8865\u5145\u4e0a\u4f20\u3002</p>';
      return;
    }
    assetPicker.innerHTML = '<p class="empty-state">\u5f53\u524d\u6a21\u5757\u8fd8\u6ca1\u6709\u8d44\u4ea7\uff0c\u672c\u6b21\u53ef\u76f4\u63a5\u901a\u8fc7\u53f3\u4fa7\u8868\u5355\u4e0a\u4f20\u6587\u4ef6\u3002</p>';
    return;
  }

  const policyNote =
    filteredAssetCount > 0 && isFormalSoftwareRequirementGeneration()
      ? `<p class="inline-hint">\u5df2\u81ea\u52a8\u5ffd\u7565 ${filteredAssetCount} \u4e2a\u4eba\u5de5\u8303\u4f8b/\u63d0\u53d6\u8f6f\u4ef6\u9700\u6c42\u8d44\u4ea7\uff0c\u6b63\u5f0f\u8f6f\u4ef6\u9700\u6c42\u751f\u6210\u53ea\u4f7f\u7528\u7cfb\u7edf\u9700\u6c42\u4e0e\u5b9e\u73b0\u8f93\u5165\u3002</p>`
      : "";

  assetPicker.innerHTML =
    policyNote +
    selectableAssets
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
  generationBaseLocked = true;
  generationBaseLockReason = message || "当前生成入口不可用。";
  syncPrimaryAction();
  refreshGenerateButtonState();
  if (generationBaseLockReason) {
    setStatus(generationBaseLockReason);
  }
}

function enableGenerate() {
  generationBaseLocked = false;
  generationBaseLockReason = "";
  syncPrimaryAction();
  refreshGenerateButtonState();
}

function refreshGenerateButtonState() {
  if (!generateForm) {
    return;
  }
  const submitButton = generateForm.querySelector("button[type='submit']");
  if (!submitButton) {
    return;
  }
  const outlineDisabled = isManualTitleOutlineVisible() && !getManualTitleOutlineValidation().valid;
  submitButton.disabled = generationBaseLocked || outlineDisabled;
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
  if (error?.code === "module_skill_bootstrap_required") {
    const missingLabels = error?.details?.missingBootstrapAssets?.map((item) => bootstrapLabel(item.label)).join(" / ");
    if (missingLabels) {
      disableGenerate(`开始正式生成前仍缺少这些冷启动资产：${missingLabels}`);
      return;
    }
    setStatus("当前模块需要先完成一次技能冷启动，完成后才能进入正式生成。");
    syncPrimaryAction();
    return;
  }
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

function hasRunningTask() {
  return (moduleData?.documentSpaces?.[pageDocumentType]?.generationTasks || []).some((task) => task.status === "running");
}

function enforceRunningTaskGuard() {
  if (hasRunningTask()) {
    disableGenerate(`当前模块已有进行中的${documentLabel(pageDocumentType)}任务，请先等待任务结束。`);
  } else {
    enableGenerate();
  }
}

function getRoleLabel(role) {
  if (role === "system_pdf") return "\u7cfb\u7edf\u9700\u6c42";
  if (role === "model_pdf") return "\u6a21\u578b\u6587\u6863";
  if (role === "generated_c") return "\u751f\u6210\u4ee3\u7801";
  if (role === "simulink_slx") return "SLX \u6a21\u578b";
  if (role === "extracted_system_requirement") return "\u63d0\u53d6\u7cfb\u7edf\u9700\u6c42";
  if (role === "extracted_software_requirement") return "\u63d0\u53d6\u8f6f\u4ef6\u9700\u6c42";
  if (role === "extracted_detail_design") return "\u63d0\u53d6\u8be6\u7ec6\u8bbe\u8ba1";
  if (role === "extracted_hil_test_case") return "提取 HIL 测试用例";
  if (role === "model_requirement_view_json") return "模型需求 JSON";
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
