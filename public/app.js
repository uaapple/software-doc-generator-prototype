const state = {
  projects: [],
  selectedProjectId: "",
  llm: {
    providers: [],
    profiles: [],
    defaultProfileId: "",
    editingProfileId: "",
    connectivityByProfileId: {}
  },
  rejectContext: null
};

const projectForm = document.querySelector("#project-form");
const uploadForm = document.querySelector("#upload-form");
const llmProfileForm = document.querySelector("#llm-profile-form");
const projectSelect = document.querySelector("#project-select");
const llmProfileSelect = document.querySelector("#llm-profile-select");
const llmProfileHint = document.querySelector("#llm-profile-hint");
const llmProviderSelect = document.querySelector("#llm-provider-select");
const llmModelInput = document.querySelector("#llm-model-input");
const llmApiKeyInput = document.querySelector("#llm-api-key-input");
const llmBaseUrlInput = document.querySelector("#llm-base-url-input");
const llmProfileList = document.querySelector("#llm-profile-list");
const llmConfigurator = document.querySelector("#llm-configurator");
const llmFormTitle = document.querySelector("#llm-form-title");
const llmFormSubtitle = document.querySelector("#llm-form-subtitle");
const llmProfileSubmit = document.querySelector("#llm-profile-submit");
const llmProfileCancel = document.querySelector("#llm-profile-cancel");
const generateButton = document.querySelector("#generate-button");
const requirementsRoot = document.querySelector("#requirements");
const summaryRoot = document.querySelector("#project-summary");
const statusRoot = document.querySelector("#status");
const metaRoot = document.querySelector("#meta");
const requirementTemplate = document.querySelector("#requirement-template");
const projectFilesDialog = document.querySelector("#project-files-dialog");
const projectFilesList = document.querySelector("#project-files-list");
const projectFilesClose = document.querySelector("#project-files-close");
const projectFilesSubtitle = document.querySelector("#project-files-subtitle");
const projectEvidenceDialog = document.querySelector("#project-evidence-dialog");
const projectEvidenceList = document.querySelector("#project-evidence-list");
const projectEvidenceClose = document.querySelector("#project-evidence-close");
const projectEvidenceSubtitle = document.querySelector("#project-evidence-subtitle");
const rejectDialog = document.querySelector("#reject-dialog");
const rejectDialogClose = document.querySelector("#reject-dialog-close");
const rejectDialogSubtitle = document.querySelector("#reject-dialog-subtitle");
const rejectForm = document.querySelector("#reject-form");
const rejectFormCancel = document.querySelector("#reject-form-cancel");

await bootstrap();

projectForm.addEventListener("submit", handleCreateProject);
uploadForm.addEventListener("submit", handleUploadFiles);
llmProviderSelect.addEventListener("change", () => applyProviderPreset(llmProviderSelect.value));
llmProfileSelect.addEventListener("change", handleDefaultProfileChange);
llmProfileForm.addEventListener("submit", handleSaveProfile);
llmProfileCancel.addEventListener("click", resetLlmProfileForm);
projectSelect.addEventListener("change", handleProjectChange);
generateButton.addEventListener("click", handleGenerate);
projectFilesClose.addEventListener("click", () => projectFilesDialog.close());
projectEvidenceClose.addEventListener("click", () => projectEvidenceDialog.close());
rejectDialogClose.addEventListener("click", closeRejectDialog);
rejectFormCancel.addEventListener("click", closeRejectDialog);
rejectForm.addEventListener("submit", handleRejectSubmit);

projectFilesDialog.addEventListener("click", (event) => {
  if (event.target === projectFilesDialog) projectFilesDialog.close();
});
projectEvidenceDialog.addEventListener("click", (event) => {
  if (event.target === projectEvidenceDialog) projectEvidenceDialog.close();
});
rejectDialog.addEventListener("click", (event) => {
  if (event.target === rejectDialog) closeRejectDialog();
});

async function bootstrap() {
  await refreshProjects();
  await refreshLlmMeta();
  renderProjects();
  if (state.selectedProjectId) {
    await refreshProject(state.selectedProjectId);
  } else {
    renderProject(null);
  }
}

async function refreshProjects() {
  const response = await request("/api/projects");
  state.projects = response.projects || [];
  state.selectedProjectId = state.selectedProjectId || state.projects[0]?.id || "";
}

async function refreshProject(projectId) {
  const project = await request(`/api/projects/${projectId}`);
  upsertProject(project);
  renderProjects();
  renderProject(project);
}

async function refreshLlmMeta() {
  const llmMeta = await request("/api/llm-profiles");
  state.llm = {
    ...state.llm,
    ...llmMeta,
    connectivityByProfileId: cleanupConnectivityState(
      state.llm.connectivityByProfileId,
      (llmMeta.profiles || []).map((profile) => profile.id)
    )
  };
  renderMeta();
  renderLlmProviders();
  renderLlmProfiles();
}

async function handleCreateProject(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(projectForm).entries());
    const project = await request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    state.selectedProjectId = project.id;
    upsertProject(project);
    renderProjects();
    renderProject(project);
    projectForm.reset();
    setStatus(`已创建项目：${payload.name}`);
  } catch (error) {
    handleError(error);
  }
}

async function handleUploadFiles(event) {
  event.preventDefault();
  try {
    const projectId = projectSelect.value;
    if (!projectId) {
      setStatus("请先创建或选择项目");
      return;
    }
    await request(`/api/projects/${projectId}/files`, {
      method: "POST",
      body: new FormData(uploadForm)
    });
    uploadForm.reset();
    await refreshProject(projectId);
    setStatus("文件已上传，可以开始生成需求。");
  } catch (error) {
    handleError(error);
  }
}

async function handleDefaultProfileChange() {
  const profileId = llmProfileSelect.value;
  renderSelectedProfileHint();
  if (!profileId) return;

  try {
    const llmMeta = await request("/api/llm-profiles/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId })
    });
    state.llm = {
      ...state.llm,
      ...llmMeta,
      editingProfileId: state.llm.editingProfileId,
      connectivityByProfileId: state.llm.connectivityByProfileId
    };
    renderLlmProfiles();
    setStatus(`已切换默认模型：${getProfileName(profileId)}`);
  } catch (error) {
    handleError(error);
  }
}

async function handleSaveProfile(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(llmProfileForm).entries());
    const editingProfile = getEditingProfile();
    const isEditing = Boolean(editingProfile);
    if (isEditing && !payload.apiKey) {
      delete payload.apiKey;
    }
    const savedProfile = await request(isEditing ? `/api/llm-profiles/${editingProfile.id}` : "/api/llm-profiles", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await refreshLlmMeta();
    resetLlmProfileForm();
    state.llm.connectivityByProfileId[savedProfile.id] = { status: "idle", message: "" };
    llmConfigurator.open = true;
    setStatus(isEditing ? `已更新模型配置：${payload.name}` : `已新增模型配置：${payload.name}`);
  } catch (error) {
    handleError(error);
  }
}

async function handleProjectChange() {
  state.selectedProjectId = projectSelect.value;
  if (!state.selectedProjectId) {
    renderProject(null);
    return;
  }
  try {
    await refreshProject(state.selectedProjectId);
  } catch (error) {
    handleError(error);
  }
}

async function handleGenerate() {
  try {
    if (!projectSelect.value) {
      setStatus("请先选择项目");
      return;
    }
    setStatus("正在生成需求草案，请稍候...");
    const project = await request(`/api/projects/${projectSelect.value}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llmProfileId: llmProfileSelect.value || "" })
    });
    upsertProject(project);
    renderProject(project);
    setStatus(`已生成 ${project.requirements.length} 条需求。`);
  } catch (error) {
    handleError(error);
  }
}

async function handleRejectSubmit(event) {
  event.preventDefault();
  if (!state.rejectContext) return;

  try {
    const formData = new FormData(rejectForm);
    const payload = {
      status: "rejected",
      requirementText: state.rejectContext.root.querySelector('[data-field="requirementText"]').value,
      reviewer: "当前用户",
      reasonCategory: String(formData.get("reasonCategory") || "").trim(),
      reasonTags: String(formData.get("reasonTags") || ""),
      severity: String(formData.get("severity") || "medium"),
      reasonText: String(formData.get("reasonText") || "").trim(),
      expectedNote: String(formData.get("expectedNote") || "").trim(),
      includeInPool: formData.get("includeInPool") === "on"
    };

    const project = await request(
      `/api/projects/${state.rejectContext.projectId}/requirements/${state.rejectContext.requirementId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    upsertProject(project);
    renderProject(project);
    closeRejectDialog();
    setStatus("需求已驳回并沉淀到反馈池。");
  } catch (error) {
    handleError(error);
  }
}

function renderMeta() {
  metaRoot.textContent = state.llm.profiles.length
    ? "已接入可用 LLM 模型，生成时会按当前选择调用。"
    : "当前未配置外部 LLM，系统会使用本地回退模式生成草案。";
}

function renderLlmProviders() {
  llmProviderSelect.innerHTML = "";
  for (const provider of state.llm.providers || []) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    llmProviderSelect.append(option);
  }
  applyProviderPreset(llmProviderSelect.value || state.llm.providers[0]?.id || "openai");
}

function renderLlmProfiles() {
  llmProfileSelect.innerHTML = "";
  if (!(state.llm.profiles || []).length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未配置，使用本地回退模式";
    option.selected = true;
    llmProfileSelect.append(option);
    renderSelectedProfileHint();
    renderLlmProfileList();
    renderLlmFormState();
    return;
  }

  for (const profile of state.llm.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} / ${profile.providerLabel}`;
    option.selected = profile.id === state.llm.defaultProfileId;
    llmProfileSelect.append(option);
  }
  renderSelectedProfileHint();
  renderLlmProfileList();
  renderLlmFormState();
}

function renderSelectedProfileHint() {
  const profile = state.llm.profiles.find((item) => item.id === llmProfileSelect.value);
  llmProfileHint.textContent = profile
    ? `当前使用 ${profile.providerLabel} / ${profile.model} / ${profile.apiKeyMasked || "本地 Key"}`
    : "未选择外部模型，将使用本地回退模式。";
}

function renderLlmProfileList() {
  llmProfileList.innerHTML = "";
  if (!(state.llm.profiles || []).length) {
    llmProfileList.innerHTML = '<p class="empty-state">当前还没有可用的模型配置。</p>';
    return;
  }

  for (const profile of state.llm.profiles) {
    const connectivity = getConnectivityState(profile.id);
    const card = document.createElement("article");
    card.className = "llm-profile-item";
    if (profile.id === state.llm.defaultProfileId) card.classList.add("is-default");
    if (profile.id === state.llm.editingProfileId) card.classList.add("is-editing");

    const badges = [
      profile.id === state.llm.defaultProfileId ? '<span class="mini-pill">默认</span>' : "",
      profile.seeded ? '<span class="mini-pill subtle">内置</span>' : "",
      buildConnectivityBadge(connectivity)
    ].filter(Boolean).join("");

    card.innerHTML = `
      <div class="llm-profile-copy">
        <div class="llm-profile-title-row">
          <strong>${escapeHtml(profile.name)}</strong>
          <div class="llm-profile-badges">${badges}</div>
        </div>
        <p>${escapeHtml(profile.providerLabel)} / ${escapeHtml(profile.model)}</p>
        <p>${escapeHtml(profile.baseURL)}</p>
        <p>Key: ${escapeHtml(profile.apiKeyMasked || "本地 Key")}</p>
        ${connectivity.message ? `<p class="connectivity-note ${getConnectivityToneClass(connectivity.status)}">${escapeHtml(connectivity.message)}</p>` : ""}
      </div>
      <div class="llm-profile-actions"></div>
    `;

    const actions = card.querySelector(".llm-profile-actions");
    actions.append(
      createActionButton("设为默认", () => setDefaultProfile(profile.id), profile.id === state.llm.defaultProfileId),
      createActionButton(connectivity.status === "testing" ? "测试中..." : "测试连通", () => testProfile(profile.id), connectivity.status === "testing"),
      createActionButton("编辑", () => startEditProfile(profile.id), connectivity.status === "testing"),
      createActionButton("删除", () => deleteProfile(profile.id), connectivity.status === "testing", "danger")
    );
    llmProfileList.append(card);
  }
}

function renderLlmFormState() {
  const editingProfile = getEditingProfile();
  const isEditing = Boolean(editingProfile);
  llmFormTitle.textContent = isEditing ? "编辑模型" : "新增模型";
  llmFormSubtitle.textContent = isEditing
    ? "修改后会覆盖该配置；API Key 留空时会保留原值。"
    : "保存后即可参与生成，也可以继续编辑、删除或测试连通性。";
  llmProfileSubmit.textContent = isEditing ? "保存修改" : "保存模型";
  llmProfileCancel.hidden = !isEditing;
  const selectedProvider = state.llm.providers.find((item) => item.id === llmProviderSelect.value);
  llmApiKeyInput.required = !isEditing && providerRequiresApiKey(selectedProvider);
}

function applyProviderPreset(providerId) {
  const provider = state.llm.providers.find((item) => item.id === providerId);
  if (!provider) return;
  llmProviderSelect.value = provider.id;
  llmModelInput.placeholder = `例如：${provider.modelPlaceholder}`;
  llmBaseUrlInput.value = provider.defaultBaseURL || "";
  llmBaseUrlInput.placeholder = provider.defaultBaseURL || "服务地址";
  renderLlmFormState();
}

function renderProjects() {
  projectSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = state.projects.length ? "请选择项目" : "暂无项目";
  projectSelect.append(empty);
  for (const project of state.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} (${project.status})`;
    option.selected = project.id === state.selectedProjectId;
    projectSelect.append(option);
  }
}

function renderProject(project) {
  if (!project) {
    summaryRoot.innerHTML = "<p>创建项目后可查看处理进度与结果概览。</p>";
    requirementsRoot.innerHTML = "<p>生成结果会显示在这里，便于逐条审核。</p>";
    return;
  }

  summaryRoot.innerHTML = "";
  const metrics = [
    ["输入文件", project.files.length, () => openProjectFilesDialog(project)],
    ["抽取证据", project.metrics?.evidenceCount ?? 0, () => openProjectEvidenceDialog(project)],
    ["需求条目", project.requirements.length, null],
    ["冲突项", project.conflicts.length, null]
  ];

  for (const [label, value, action] of metrics) {
    const node = document.createElement(action ? "button" : "div");
    node.className = action ? "metric metric-button" : "metric";
    if (action) {
      node.type = "button";
      node.innerHTML = `<span>${label}</span><strong>${value}</strong><p class="metric-hint">点击查看详情</p>`;
      node.addEventListener("click", action);
    } else {
      node.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    }
    summaryRoot.append(node);
  }

  if (project.lastGeneration?.llmProfile) {
    const profile = project.lastGeneration.llmProfile;
    const node = document.createElement("div");
    node.className = "metric";
    node.innerHTML = `<span>最近生成模型</span><strong>${escapeHtml(profile.providerLabel || profile.provider || "LLM")}</strong><p>${escapeHtml(profile.model)}</p>`;
    summaryRoot.append(node);
  }

  requirementsRoot.innerHTML = "";
  if (!project.requirements.length) {
    requirementsRoot.innerHTML = "<p>上传文件并点击“启动生成”后，这里会出现需求草案。</p>";
    return;
  }

  for (const requirement of project.requirements) {
    const fragment = requirementTemplate.content.cloneNode(true);
    const root = fragment.querySelector(".requirement");
    root.dataset.id = requirement.id;
    fragment.querySelector('[data-field="requirementId"]').textContent = requirement.requirementId;
    fragment.querySelector('[data-field="title"]').textContent = requirement.title;
    fragment.querySelector('[data-field="reviewStatus"]').textContent = translateStatus(requirement.review?.status);
    fragment.querySelector('[data-field="feedbackState"]').textContent = getFeedbackStateLabel(requirement.review);
    fragment.querySelector('[data-field="requirementText"]').value = requirement.requirementText || "";
    fragment.querySelector('[data-field="type"]').textContent = requirement.type || "--";
    fragment.querySelector('[data-field="confidence"]').textContent = String(requirement.confidence ?? "--");
    fragment.querySelector('[data-field="verificationHint"]').textContent = requirement.verificationHint || "无";
    fragment.querySelector('[data-field="conflictNote"]').textContent = requirement.conflictNote || "无";

    const sources = fragment.querySelector('[data-field="sources"]');
    for (const source of requirement.sourceRefs || []) {
      const li = document.createElement("li");
      li.textContent = `${source.fileName} @ ${source.location}: ${source.excerpt}`;
      sources.append(li);
    }

    fragment.querySelector('[data-action="accept"]').addEventListener("click", () =>
      reviewRequirement(project.id, requirement.id, "accepted", root)
    );
    fragment.querySelector('[data-action="revise"]').addEventListener("click", () =>
      reviewRequirement(project.id, requirement.id, "revised", root)
    );
    fragment.querySelector('[data-action="reject"]').addEventListener("click", () =>
      openRejectDialog(project.id, requirement.id, requirement.requirementId, root)
    );
    fragment.querySelector('[data-action="delete"]').addEventListener("click", () =>
      deleteRequirement(project.id, requirement.id, requirement.requirementId)
    );

    requirementsRoot.append(fragment);
  }
}

function openProjectFilesDialog(project) {
  projectFilesSubtitle.textContent = `当前项目共上传 ${project.files.length} 个文件。删除文件后，需要重新生成需求结果。`;
  renderProjectFilesDialog(project);
  projectFilesDialog.showModal();
}

function renderProjectFilesDialog(project) {
  projectFilesList.innerHTML = "";
  if (!project.files.length) {
    projectFilesList.innerHTML = '<p class="empty-state">当前项目还没有上传文件。</p>';
    return;
  }
  const files = [...project.files].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  for (const file of files) {
    const item = document.createElement("article");
    item.className = "file-item";
    item.innerHTML = `
      <div class="file-item-copy">
        <div class="file-item-title-row">
          <strong>${escapeHtml(file.originalName)}</strong>
          <span class="mini-pill subtle">${escapeHtml(getFileRoleLabel(file.role))}</span>
        </div>
        <p>上传时间：${formatDateTime(file.uploadedAt)}</p>
        <p>大小：${formatFileSize(file.size)}</p>
        <p>存储名：${escapeHtml(file.storedName)}</p>
      </div>
      <div class="file-item-actions"></div>
    `;
    item.querySelector(".file-item-actions").append(
      createActionButton("删除", () => deleteProjectFile(project.id, file.id), false, "danger")
    );
    projectFilesList.append(item);
  }
}

function openProjectEvidenceDialog(project) {
  const evidenceItems = collectProjectEvidence(project);
  projectEvidenceSubtitle.textContent = `当前项目共抽取 ${evidenceItems.length} 条证据。`;
  renderProjectEvidenceDialog(project);
  projectEvidenceDialog.showModal();
}

function renderProjectEvidenceDialog(project) {
  projectEvidenceList.innerHTML = "";
  const evidenceItems = collectProjectEvidence(project);
  if (!evidenceItems.length) {
    projectEvidenceList.innerHTML = '<p class="empty-state">当前项目还没有可查看的证据明细。</p>';
    return;
  }
  for (const evidence of evidenceItems) {
    const item = document.createElement("article");
    item.className = "file-item evidence-item";
    const tags = Array.isArray(evidence.tags) && evidence.tags.length
      ? evidence.tags.map((tag) => `<span class="mini-pill subtle">${escapeHtml(tag)}</span>`).join("")
      : '<span class="mini-pill subtle">未分类</span>';
    item.innerHTML = `
      <div class="file-item-copy evidence-copy">
        <div class="file-item-title-row">
          <strong>${escapeHtml(evidence.fileName || "未命名证据来源")}</strong>
          <span class="mini-pill subtle">${escapeHtml(getFileRoleLabel(evidence.fileRole || "other"))}</span>
        </div>
        <div class="evidence-meta">
          <span>位置：${escapeHtml(evidence.location || "未标注")}</span>
          <span>置信度：${typeof evidence.confidence === "number" ? evidence.confidence.toFixed(2) : "--"}</span>
        </div>
        <div class="evidence-tags">${tags}</div>
        <p class="evidence-excerpt">${escapeHtml(evidence.excerpt || evidence.summary || "无证据摘要")}</p>
      </div>
    `;
    projectEvidenceList.append(item);
  }
}

function collectProjectEvidence(project) {
  return (project.extractions || []).flatMap((entry) =>
    (entry.evidence || []).map((evidence) => ({
      ...evidence,
      fileName: evidence.fileName || entry.fileName,
      fileRole: evidence.fileRole || entry.fileRole,
      summary: evidence.summary || entry.summary
    }))
  );
}

function openRejectDialog(projectId, requirementId, requirementCode, root) {
  state.rejectContext = { projectId, requirementId, requirementCode, root };
  rejectForm.reset();
  rejectForm.elements.namedItem("severity").value = "medium";
  rejectDialogSubtitle.textContent = `你正在驳回 ${requirementCode}，请填写结构化原因。`;
  rejectDialog.showModal();
}

function closeRejectDialog() {
  state.rejectContext = null;
  rejectForm.reset();
  rejectDialog.close();
}

async function reviewRequirement(projectId, requirementId, status, root) {
  try {
    const requirementText = root.querySelector('[data-field="requirementText"]').value;
    const project = await request(`/api/projects/${projectId}/requirements/${requirementId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, requirementText, reviewer: "当前用户" })
    });
    upsertProject(project);
    renderProject(project);
    setStatus(`需求已更新为：${translateStatus(status)}`);
  } catch (error) {
    handleError(error);
  }
}

async function deleteProjectFile(projectId, fileId) {
  const project = state.projects.find((item) => item.id === projectId);
  const file = project?.files.find((item) => item.id === fileId);
  if (!project || !file) return;
  if (!window.confirm(`确认删除文件“${file.originalName}”吗？删除后需要重新生成需求结果。`)) return;

  const updatedProject = await request(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE" });
  upsertProject(updatedProject);
  renderProjects();
  renderProject(updatedProject);
  renderProjectFilesDialog(updatedProject);
  setStatus(`已删除文件：${file.originalName}`);
  if (!updatedProject.files.length) projectFilesDialog.close();
}

async function deleteRequirement(projectId, requirementId, requirementCode) {
  if (!window.confirm(`确认删除需求“${requirementCode}”吗？此操作会直接从后端移除该条生成结果。`)) return;
  const project = await request(`/api/projects/${projectId}/requirements/${requirementId}`, { method: "DELETE" });
  upsertProject(project);
  renderProject(project);
  setStatus(`已删除需求：${requirementCode}`);
}

async function setDefaultProfile(profileId) {
  const llmMeta = await request("/api/llm-profiles/default", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId })
  });
  state.llm = {
    ...state.llm,
    ...llmMeta,
    editingProfileId: state.llm.editingProfileId,
    connectivityByProfileId: state.llm.connectivityByProfileId
  };
  renderLlmProfiles();
  setStatus(`已设置默认模型：${getProfileName(profileId)}`);
}

function startEditProfile(profileId) {
  const profile = state.llm.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  state.llm.editingProfileId = profileId;
  llmProviderSelect.value = profile.provider;
  llmProfileForm.elements.namedItem("name").value = profile.name;
  llmModelInput.value = profile.model;
  llmApiKeyInput.value = "";
  llmBaseUrlInput.value = profile.baseURL;
  renderLlmFormState();
  renderLlmProfileList();
  llmConfigurator.open = true;
  setStatus(`正在编辑模型：${profile.name}`);
}

function resetLlmProfileForm() {
  state.llm.editingProfileId = "";
  llmProfileForm.reset();
  applyProviderPreset(state.llm.providers[0]?.id || "openai");
  renderLlmFormState();
  renderLlmProfileList();
}

async function deleteProfile(profileId) {
  const profile = state.llm.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  if (!window.confirm(`确认删除模型“${profile.name}”吗？`)) return;

  const result = await request(`/api/llm-profiles/${profileId}`, { method: "DELETE" });
  delete state.llm.connectivityByProfileId[profileId];
  state.llm = {
    ...state.llm,
    ...result.meta,
    editingProfileId: state.llm.editingProfileId === profileId ? "" : state.llm.editingProfileId,
    connectivityByProfileId: state.llm.connectivityByProfileId
  };
  if (state.llm.editingProfileId === "") resetLlmProfileForm();
  renderMeta();
  renderLlmProviders();
  renderLlmProfiles();
  setStatus(`已删除模型配置：${profile.name}`);
}

async function testProfile(profileId) {
  const profile = state.llm.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  state.llm.connectivityByProfileId[profileId] = { status: "testing", message: "正在测试连通性，请稍候..." };
  renderLlmProfileList();
  setStatus(`正在测试模型连通性：${profile.name}`);

  try {
    const result = await request(`/api/llm-profiles/${profileId}/test`, { method: "POST" });
    state.llm.connectivityByProfileId[profileId] = { status: "success", message: `连通正常，耗时 ${result.durationMs} ms。` };
    renderLlmProfileList();
    setStatus(`连通性测试通过：${profile.name}`);
  } catch (error) {
    state.llm.connectivityByProfileId[profileId] = { status: "error", message: error.message || "连通性测试失败。" };
    renderLlmProfileList();
    handleError(error);
  }
}

function getEditingProfile() {
  return state.llm.profiles.find((item) => item.id === state.llm.editingProfileId) || null;
}

function getProfileName(profileId) {
  return state.llm.profiles.find((item) => item.id === profileId)?.name || "未命名模型";
}

function getConnectivityState(profileId) {
  return state.llm.connectivityByProfileId[profileId] || { status: "idle", message: "" };
}

function cleanupConnectivityState(existingState, profileIds) {
  const nextState = {};
  for (const profileId of profileIds) {
    nextState[profileId] = existingState?.[profileId] || { status: "idle", message: "" };
  }
  return nextState;
}

function providerRequiresApiKey(provider) {
  return provider?.requiresApiKey !== false;
}

function buildConnectivityBadge(connectivity) {
  if (connectivity.status === "success") return '<span class="mini-pill success">已连通</span>';
  if (connectivity.status === "error") return '<span class="mini-pill danger">连通失败</span>';
  if (connectivity.status === "testing") return '<span class="mini-pill warning">测试中</span>';
  return "";
}

function getConnectivityToneClass(status) {
  return { success: "is-success", error: "is-error", testing: "is-testing" }[status] || "";
}

function createActionButton(label, handler, disabled = false, variant = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = variant;
  button.disabled = disabled;
  button.addEventListener("click", async () => {
    try {
      await handler();
    } catch (error) {
      handleError(error);
    }
  });
  return button;
}

function translateStatus(status) {
  return {
    pending: "待审核",
    accepted: "已接受",
    revised: "已修改",
    rejected: "已驳回"
  }[status] || "待审核";
}

function getFeedbackStateLabel(review = {}) {
  if (!review?.rejectionId) return "未入池";
  return review.includeInPool === false ? "已驳回未入池" : "已入反馈池";
}

function getFileRoleLabel(role) {
  return {
    system_pdf: "系统需求",
    model_pdf: "模型文档",
    generated_c: "生成代码",
    simulink_slx: "SLX 模型"
  }[role] || role;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "未知时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(size) {
  const num = Number(size || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function upsertProject(project) {
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) state.projects[index] = project;
  else state.projects.unshift(project);
}

function setStatus(message) {
  statusRoot.textContent = message;
}

function handleError(error) {
  console.error(error);
  setStatus(error.message || "操作失败，请稍后重试。");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  }
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Request failed with status ${response.status}`);
  return text;
}
