const page = document.body.dataset.page || "";
const statusRoot = document.querySelector("#status");
const rejectDialog = document.querySelector("#reject-dialog");
const rejectDialogClose = document.querySelector("#reject-dialog-close");
const rejectDialogSubtitle = document.querySelector("#reject-dialog-subtitle");
const rejectDialogStatus = document.querySelector("#reject-dialog-status");
const rejectForm = document.querySelector("#reject-form");
const rejectFormSubmit = document.querySelector("#reject-form-submit");
const rejectFormCancel = document.querySelector("#reject-form-cancel");
const acceptedEditDialog = document.querySelector("#accepted-edit-dialog");
const acceptedEditSubtitle = document.querySelector("#accepted-edit-subtitle");
const acceptedEditForm = document.querySelector("#accepted-edit-form");
const acceptedEditCancel = document.querySelector("#accepted-edit-cancel");
const acceptedEditTitleInput = document.querySelector("#accepted-edit-title");
const acceptedEditTextInput = document.querySelector("#accepted-edit-text");
const historyDrawer = document.querySelector("#history-drawer");
const historyDrawerBackdrop = document.querySelector("#history-drawer-backdrop");
const openHistoryDrawerButton = document.querySelector("#open-history-drawer");
const closeHistoryDrawerButton = document.querySelector("#close-history-drawer");
const feedbackHistoryDrawer = document.querySelector("#feedback-history-drawer");
const feedbackHistoryDrawerBackdrop = document.querySelector("#feedback-history-drawer-backdrop");
const closeFeedbackHistoryDrawerButton = document.querySelector("#close-feedback-history-drawer");
const feedbackHistoryTaskListRoot = document.querySelector("#feedback-history-task-list");
const feedbackHistoryTaskDetailRoot = document.querySelector("#feedback-history-task-detail");
const workspacePanel = document.querySelector("#module-workspace-panel");
const workspaceFrame = document.querySelector("#module-workspace-frame");
const TASK_POLL_INTERVAL_MS = 30000;
const PENDING_GENERATION_STORAGE_KEY = "pending-module-generations";
const PENDING_GENERATION_MAX_AGE_MS = 30 * 60 * 1000;
let taskPollTimer = 0;
const state = {
  rejectContext: null,
  rejectSubmitting: false,
  acceptedEditContext: null,
  activeWorkspaceTab: "",
  acceptedDragContext: null,
  suppressAcceptedClickUntil: 0,
  feedbackHistory: {
    tasks: [],
    selectedTaskId: ""
  }
};

rejectDialogClose?.addEventListener("click", closeRejectDialog);
rejectFormCancel?.addEventListener("click", closeRejectDialog);
rejectForm?.addEventListener("submit", handleRejectSubmit);
acceptedEditCancel?.addEventListener("click", closeAcceptedEditDialog);
acceptedEditForm?.addEventListener("submit", handleAcceptedEditSubmit);
openHistoryDrawerButton?.addEventListener("click", openHistoryDrawer);
closeHistoryDrawerButton?.addEventListener("click", closeHistoryDrawer);
historyDrawerBackdrop?.addEventListener("click", closeHistoryDrawer);
closeFeedbackHistoryDrawerButton?.addEventListener("click", closeFeedbackHistoryDrawer);
feedbackHistoryDrawerBackdrop?.addEventListener("click", closeFeedbackHistoryDrawer);
feedbackHistoryTaskListRoot?.addEventListener("click", handleFeedbackHistoryTaskClick);
window.addEventListener("message", handleWorkspaceMessage);
rejectDialog?.addEventListener("click", (event) => {
  if (state.rejectSubmitting) {
    return;
  }
  if (event.target === rejectDialog) {
    closeRejectDialog();
  }
});
rejectDialog?.addEventListener("cancel", (event) => {
  if (state.rejectSubmitting) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  closeRejectDialog();
});
acceptedEditDialog?.addEventListener("click", (event) => {
  if (event.target === acceptedEditDialog) {
    closeAcceptedEditDialog();
  }
});

await boot();

async function boot() {
  try {
    if (page === "project-list") {
      await renderProjectListPage();
      return;
    }
    if (page === "project-create") {
      await renderProjectFormPage();
      return;
    }
    if (page === "project-detail") {
      await renderProjectDetailPage();
      return;
    }
    if (page === "module-create") {
      await renderModuleCreatePage();
      return;
    }
    if (page === "module-detail") {
      await renderModuleDetailPage();
      return;
    }
    if (page === "task-detail") {
      await renderTaskDetailPage();
    }
  } catch (error) {
    handleError(error);
  }
}

async function renderProjectListPage() {
  const response = await request("/api/projects");
  const projectList = document.querySelector("#project-list");
  const projects = response.projects || [];

  if (!projects.length) {
    projectList.innerHTML = '<div class="empty-state">还没有工程，先创建一个工程。</div>';
    return;
  }

  projectList.innerHTML = projects
    .map(
      (project) => `
        <article class="stack-card">
          <strong>${escapeHtml(project.name)}</strong>
          <p>${escapeHtml(project.description || "暂无工程说明")}</p>
          <div class="card-meta">
            <span>${project.modules?.length || 0} 个模块</span>
            <span>更新时间 ${formatDateTime(project.updatedAt)}</span>
          </div>
          <div class="inline-actions">
            <a class="primary-link" href="/projects/${project.id}">进入工程</a>
            <a class="secondary-link" href="/projects/${project.id}/edit">编辑</a>
            <button class="secondary-button" type="button" data-delete-project="${project.id}" data-project-name="${escapeAttribute(project.name)}">删除</button>
          </div>
        </article>
      `
    )
    .join("");

  projectList.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", async () => {
      const projectId = button.dataset.deleteProject || "";
      const projectName = button.dataset.projectName || "该工程";
      const confirmed = window.confirm(`确认删除“${projectName}”吗？工程下的模块和已上传文件也会一并删除。`);
      if (!confirmed) {
        return;
      }

      try {
        await request(`/api/projects/${projectId}`, { method: "DELETE" });
        setStatus(`已删除工程：${projectName}`);
        await renderProjectListPage();
      } catch (error) {
        handleError(error);
      }
    });
  });
}

async function handleCreateProject(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const editingProjectId = event.currentTarget.dataset.projectId || "";
    const isEditing = Boolean(editingProjectId);
    const project = await request(isEditing ? `/api/projects/${editingProjectId}` : "/api/projects", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    window.location.href = `/projects/${project.id}`;
  } catch (error) {
    handleError(error);
  }
}

async function renderProjectFormPage() {
  const form = document.querySelector("#project-form");
  const title = document.querySelector("#project-form-title");
  const subtitle = document.querySelector("#project-form-subtitle");
  const submitButton = document.querySelector("#project-submit-button");
  const cancelLink = document.querySelector("#project-cancel-link");
  const projectId = getPathPart(1);
  const isEditing = Boolean(projectId && getPathPart(2) === "edit");

  if (!isEditing) {
    renderBreadcrumb([{ label: "工程列表", href: "/" }, { label: "创建工程" }]);
    form?.addEventListener("submit", handleCreateProject);
    return;
  }

  const project = await request(`/api/projects/${projectId}`);
  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name, href: `/projects/${project.id}` },
    { label: "编辑工程" }
  ]);
  title.textContent = "编辑工程";
  subtitle.textContent = "更新工程名称和说明，保存后返回工程主页。";
  submitButton.textContent = "保存并返回工程";
  cancelLink.href = `/projects/${project.id}`;
  form.dataset.projectId = project.id;
  form.elements.namedItem("name").value = project.name || "";
  form.elements.namedItem("description").value = project.description || "";
  form.addEventListener("submit", handleCreateProject);
}

async function renderProjectDetailPage() {
  const projectId = getPathPart(1);
  const project = await request(`/api/projects/${projectId}`);
  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name }
  ]);

  document.querySelector("#project-title").textContent = project.name;
  document.querySelector("#project-description").textContent = project.description || "这个工程还没有补充说明。";
  document.querySelector("#edit-project-link").href = `/projects/${project.id}/edit`;
  document.querySelector("#create-module-link").href = `/projects/${project.id}/modules/new`;
  document.querySelector("#delete-project-button")?.addEventListener("click", async () => {
    const confirmed = window.confirm(`确认删除“${project.name}”吗？工程下的模块和已上传文件也会一并删除。`);
    if (!confirmed) {
      return;
    }

    try {
      await request(`/api/projects/${project.id}`, { method: "DELETE" });
      window.location.href = "/";
    } catch (error) {
      handleError(error);
    }
  });

  const moduleList = document.querySelector("#module-list");
  if (!(project.modules || []).length) {
    moduleList.innerHTML = '<div class="empty-state">这个工程还没有功能模块，先创建一个。</div>';
    return;
  }

  moduleList.innerHTML = project.modules
    .map(
      (module) => `
        <article class="stack-card">
          <strong>${escapeHtml(module.name)}</strong>
          <p>${escapeHtml(module.description || "暂无模块说明")}</p>
          <div class="card-meta">
            <span>${module.assets?.length || 0} 个资产</span>
            <span>${countTasks(module)} 条历史任务</span>
          </div>
          <div class="inline-actions">
            <a class="primary-link" href="/projects/${project.id}/modules/${module.id}">进入模块</a>
            <a class="secondary-link" href="/projects/${project.id}/modules/${module.id}/edit">编辑</a>
            <button class="secondary-button" type="button" data-delete-module="${module.id}" data-module-name="${escapeAttribute(module.name)}">删除</button>
          </div>
        </article>
      `
    )
    .join("");

  moduleList.querySelectorAll("[data-delete-module]").forEach((button) => {
    button.addEventListener("click", async () => {
      const moduleId = button.dataset.deleteModule || "";
      const moduleName = button.dataset.moduleName || "该模块";
      const confirmed = window.confirm(`确认删除模块“${moduleName}”吗？模块下的任务记录和已上传文件也会一并删除。`);
      if (!confirmed) {
        return;
      }

      try {
        await request(`/api/projects/${project.id}/modules/${moduleId}`, { method: "DELETE" });
        setStatus(`已删除模块：${moduleName}`);
        await renderProjectDetailPage();
      } catch (error) {
        handleError(error);
      }
    });
  });
}

async function renderModuleCreatePage() {
  const projectId = getPathPart(1);
  const moduleId = getPathPart(3);
  const isEditing = Boolean(moduleId && getPathPart(4) === "edit");
  const [project, existingModule] = await Promise.all([
    request(`/api/projects/${projectId}`),
    isEditing ? request(`/api/projects/${projectId}/modules/${moduleId}`) : Promise.resolve(null)
  ]);
  const form = document.querySelector("#module-form");
  const nameInput = form?.elements?.namedItem("name");
  const descriptionInput = form?.elements?.namedItem("description");
  const moduleSkillKeyInput = form?.elements?.namedItem("moduleSkillKey");
  const domainSelect = document.querySelector("#domain-select");
  const candidateSelect = document.querySelector("#skill-candidate-select");
  const previewHint = document.querySelector("#module-preview-hint");
  const bootstrapRoot = document.querySelector("#bootstrap-requirements");
  const title = document.querySelector("#module-form-title");
  const subtitle = document.querySelector("#module-form-subtitle");
  const submitButton = document.querySelector("#module-submit-button");
  let preview = null;
  let previewTimer = 0;

  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name, href: `/projects/${project.id}` },
    { label: isEditing ? existingModule?.name || "编辑功能模块" : "创建功能模块" }
  ]);
  document.querySelector("#project-back-link").href = isEditing
    ? `/projects/${project.id}/modules/${moduleId}`
    : `/projects/${project.id}`;

  if (isEditing && existingModule) {
    title.textContent = "编辑功能模块";
    subtitle.textContent = "更新模块名称、说明、domain 与 skill 关联配置。";
    submitButton.textContent = "保存并返回模块";
    nameInput.value = existingModule.name || "";
    descriptionInput.value = existingModule.description || "";
    moduleSkillKeyInput.value = existingModule.moduleSkillKey || "";
    form.dataset.moduleId = existingModule.id;
  }

  const refreshPreview = async () => {
    const name = nameInput?.value?.trim() || "";
    const description = descriptionInput?.value?.trim() || "";
    const moduleSkillKey = moduleSkillKeyInput?.value?.trim() || "";

    if (!name) {
      domainSelect.innerHTML = '<option value="embedded_vcu">embedded_vcu</option>';
      candidateSelect.innerHTML = '<option value="">不导入，后续走冷启动</option>';
      bootstrapRoot.textContent = "新模块如果不导入已有 skill，后续生成前需要上传系统需求、模型/代码输入和对应文档类型的人工优秀范例。";
      previewHint.textContent = "输入模块名称后，系统会推荐 domain 并检索可复用的 module skill。";
      return;
    }

    preview = await request(`/api/projects/${project.id}/modules/initialize-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        moduleSkillKey,
        documentType: project.documentType
      })
    });

    if ((!moduleSkillKeyInput.value || !moduleSkillKeyInput.value.trim()) && preview.moduleSkillKey) {
      moduleSkillKeyInput.value = preview.moduleSkillKey;
    }

    domainSelect.innerHTML = (preview.recommendedDomains || [])
      .map((item, index) => `<option value="${escapeHtml(item.domain)}" ${index === 0 ? "selected" : ""}>${escapeHtml(item.domain)}</option>`)
      .join("") || '<option value="embedded_vcu">embedded_vcu</option>';

    if (isEditing && existingModule?.domain) {
      domainSelect.value = existingModule.domain;
    }

    candidateSelect.innerHTML = ['<option value="">不导入，后续走冷启动</option>']
      .concat(
        (preview.skillCandidates || []).map(
          (item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.key)} / ${escapeHtml(item.domain)} / score ${item.score}</option>`
        )
      )
      .join("");

    if (isEditing) {
      candidateSelect.value = existingModule?.skillSource?.type === "module_profile" ? existingModule.skillSource.key || "" : "";
    }

    previewHint.textContent = preview.skillCandidates?.length
      ? "已找到可复用的 module skill 候选；若不导入，系统会要求你在正式生成前补齐冷启动资产。"
      : "当前没有直接命中的 module skill；后续正式生成前会按冷启动规则检查资产。";

    bootstrapRoot.textContent = `冷启动至少需要：${(preview.missingBootstrapAssets || [])
      .map((item) => bootstrapAssetLabel(item.label))
      .join(" / ")}`;
  };

  const queuePreview = () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      refreshPreview().catch(handleError);
    }, 200);
  };

  nameInput?.addEventListener("input", queuePreview);
  descriptionInput?.addEventListener("input", queuePreview);
  moduleSkillKeyInput?.addEventListener("input", queuePreview);
  await refreshPreview();

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (!preview) {
        await refreshPreview();
      }
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (payload.importedSkillKey) {
        payload.skillStatus = "imported";
        payload.skillSource = {
          type: "module_profile",
          key: payload.importedSkillKey
        };
      } else {
        payload.skillStatus = "draft";
        payload.skillSource = null;
      }
      const module = await request(isEditing ? `/api/projects/${project.id}/modules/${existingModule.id}` : `/api/projects/${project.id}/modules`, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      window.location.href = `/projects/${project.id}/modules/${module.id}`;
    } catch (error) {
      handleError(error);
    }
  });
}

function bootstrapAssetLabel(label) {
  if (label === "system_requirement") return "系统需求文件";
  if (label === "implementation_input") return "模型/代码输入";
  if (label === "reference_requirement_example") return "优秀软件需求范例";
  if (label === "reference_detail_design_example") return "优秀详细设计范例";
  if (label === "reference_hil_test_case_example") return "优秀 HIL 用例范例";
  return label;
}

async function deleteModuleAndReturn(projectId, moduleId, moduleName) {
  const confirmed = window.confirm(`确认删除模块“${moduleName}”吗？模块下的任务记录和已上传文件也会一并删除。`);
  if (!confirmed) {
    return;
  }

  try {
    await request(`/api/projects/${projectId}/modules/${moduleId}`, { method: "DELETE" });
    clearPendingGeneration(projectId, moduleId, "software_requirement");
    clearPendingGeneration(projectId, moduleId, "detail_design");
    clearPendingGeneration(projectId, moduleId, "hil_test_case");
    window.location.href = `/projects/${projectId}`;
  } catch (error) {
    handleError(error);
  }
}

function getModuleWorkspaceConfig(projectId, moduleId) {
  return {
    software_requirement: {
      title: "软件需求生成",
      subtitle: "在当前模块页内切换软件需求工作页面，保留原有页面能力和排布。",
      url: `/requirement-generation?projectId=${projectId}&moduleId=${moduleId}`,
      embeddedKind: "generator"
    },
    detail_design: {
      title: "详细设计生成",
      subtitle: "在当前模块页内切换详细设计生成页面，保持原工作流不变。",
      url: `/detail-design-generation?projectId=${projectId}&moduleId=${moduleId}`,
      embeddedKind: "generator"
    },
    hil_test_case: {
      title: "HIL 用例生成",
      subtitle: "在当前模块页内切换 HIL 用例生成页面，延续原页面的布局和操作。",
      url: `/hil-test-case-generation?projectId=${projectId}&moduleId=${moduleId}`,
      embeddedKind: "generator"
    },
    feedback_pool: {
      title: "模块反馈池",
      subtitle: "在当前模块页内切换反馈池页面，快速回看和处理模块反馈。",
      url: `/feedback-pool?projectId=${projectId}&moduleId=${moduleId}`,
      embeddedKind: "feedback_pool"
    }
  };
}

function updateWorkspaceButtons(activeTab = "") {
  document.querySelectorAll("[data-workspace-tab]").forEach((button) => {
    const isActive = button.dataset.workspaceTab === activeTab;
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.querySelector(".accepted-results-panel")?.toggleAttribute("hidden", activeTab !== "accepted_results");
  if (workspacePanel) {
    workspacePanel.hidden = activeTab === "accepted_results";
  }
}

function applyEmbeddedWorkspaceChrome(config) {
  if (!workspaceFrame?.contentWindow?.document || !config?.embeddedKind) {
    return;
  }

  try {
    const doc = workspaceFrame.contentWindow.document;
    const styleId = "module-embedded-workspace-style";
    doc.getElementById(styleId)?.remove();
    const style = doc.createElement("style");
    style.id = styleId;
    style.textContent =
      config.embeddedKind === "feedback_pool"
        ? `
          body { background: #fff !important; }
          .top-nav, .feedback-strip, #task-drawer, #task-drawer-backdrop { display: none !important; }
          .layout.feedback-page { width: auto !important; margin: 0 !important; padding: 0 !important; }
          .panel:first-of-type { margin-top: 0 !important; }
          .panel { padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; }
          .card { border-radius: 18px !important; }
          .feedback-overview-card,
          .compact-overview-card {
            grid-template-columns: minmax(0, 1.24fr) minmax(420px, 620px) !important;
            gap: 24px !important;
          }
          .feedback-list-card,
          .feedback-filter-card {
            padding: 26px !important;
          }
        `
        : `
          body { background: #fff !important; }
          .top-nav, #generator-breadcrumb, .workbench-strip { display: none !important; }
          .layout { width: auto !important; margin: 0 !important; padding: 0 !important; }
          .panel:first-of-type { margin-top: 0 !important; }
          .panel { padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; }
          .card { border-radius: 18px !important; }
        `;
    doc.head.appendChild(style);
  } catch (error) {
    console.warn("Failed to trim embedded workspace chrome", error);
  }
}

function syncWorkspaceFrameHeight() {
  if (!workspaceFrame?.contentWindow?.document) {
    return;
  }

  try {
    const doc = workspaceFrame.contentWindow.document;
    const bodyHeight = Math.max(
      doc.body?.scrollHeight || 0,
      doc.documentElement?.scrollHeight || 0,
      doc.body?.offsetHeight || 0,
      doc.documentElement?.offsetHeight || 0
    );
    workspaceFrame.style.height = `${Math.max(bodyHeight + 4, 420)}px`;
  } catch (error) {
    console.warn("Failed to sync workspace frame height", error);
  }
}

function scheduleWorkspaceFrameHeightSync() {
  [0, 80, 240, 600, 1200, 2400].forEach((delay) => {
    window.setTimeout(() => {
      syncWorkspaceFrameHeight();
    }, delay);
  });
}

function ensureWorkspaceTabPresence() {
  const primaryActions = document.querySelector(".module-primary-actions");
  if (!primaryActions || document.querySelector('[data-workspace-tab="accepted_results"]')) {
    return;
  }

  const acceptedButton = document.createElement("button");
  acceptedButton.id = "accepted-results-link";
  acceptedButton.type = "button";
  acceptedButton.className = "secondary-link button-link module-workspace-tab";
  acceptedButton.dataset.workspaceTab = "accepted_results";
  acceptedButton.textContent = "已采纳结果";

  const button = document.createElement("button");
  button.id = "req-generate-link";
  button.type = "button";
  button.className = "secondary-link button-link module-workspace-tab";
  button.dataset.workspaceTab = "software_requirement";
  button.textContent = "进入软件需求生成";
  primaryActions.prepend(button);
  primaryActions.prepend(acceptedButton);
}

function openWorkspaceTab(tabKey, configMap) {
  const config = configMap?.[tabKey];
  if (!config || !workspacePanel || !workspaceFrame) {
    return;
  }

  closeFeedbackHistoryDrawer();
  state.activeWorkspaceTab = tabKey;
  updateWorkspaceButtons(tabKey);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("workspaceTab", tabKey);
  window.history.replaceState({}, "", nextUrl);
  workspacePanel.hidden = false;
  workspaceFrame.onload = () => {
    applyEmbeddedWorkspaceChrome(config);
    scheduleWorkspaceFrameHeightSync();
  };
  if (workspaceFrame.src !== new URL(config.url, window.location.origin).toString()) {
    workspaceFrame.src = config.url;
  } else {
    syncWorkspaceFrameHeight();
  }
}

function openAcceptedResultsTab() {
  closeFeedbackHistoryDrawer();
  state.activeWorkspaceTab = "accepted_results";
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete("workspaceTab");
  window.history.replaceState({}, "", nextUrl);
  updateWorkspaceButtons("accepted_results");
}

async function persistAcceptedOrder(projectId, moduleId, documentType, orderedIds) {
  await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${documentType}/accepted-items/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds })
  });
}

function clearAcceptedDropMarkers(root) {
  root
    ?.querySelectorAll(".is-drop-target-before, .is-drop-target-after")
    ?.forEach((node) => node.classList.remove("is-drop-target-before", "is-drop-target-after"));
}

async function renderModuleDetailPage() {
  const projectId = getPathPart(1);
  const moduleId = getPathPart(3);
  const [project, module] = await Promise.all([
    request(`/api/projects/${projectId}`),
    request(`/api/projects/${projectId}/modules/${moduleId}`)
  ]);

  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name, href: `/projects/${project.id}` },
    { label: module.name }
  ]);

  document.querySelector("#module-title").textContent = module.name;
  document.querySelector("#module-description").textContent = module.description || "这个功能模块还没有补充说明。";
  const workspaceConfig = getModuleWorkspaceConfig(project.id, module.id);
  ensureWorkspaceTabPresence();
  document.querySelector("#edit-module-link").href = `/projects/${project.id}/modules/${module.id}/edit`;
  document.querySelectorAll("[data-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tabKey = button.dataset.workspaceTab || "";
      if (tabKey === "accepted_results") {
        openAcceptedResultsTab();
        return;
      }
      openWorkspaceTab(tabKey, workspaceConfig);
    });
  });
  document.querySelector("#delete-module-button")?.addEventListener("click", () => {
    deleteModuleAndReturn(project.id, module.id, module.name);
  });

  const pendingGeneration = resolvePendingGeneration(project.id, module);
  renderAcceptedList(module, project.id);
  renderTaskList(module, project.id, pendingGeneration);

  const params = new URLSearchParams(window.location.search);
  const highlightTaskId = params.get("highlightTaskId");
  const highlightedTask = highlightTaskId ? collectTasks(module).find((task) => task.id === highlightTaskId) : null;

  if (params.get("taskStarted") === "1") {
    setStatus(
      highlightedTask?.status === "completed"
        ? "生成任务已完成，结果已经出现在历史任务列表中。"
        : "生成任务已启动，系统正在处理中，你可以留在这里等待结果刷新。"
    );
  } else if (highlightedTask?.status === "running") {
    setStatus("当前有一个生成任务正在执行，列表会自动刷新。");
  } else if (pendingGeneration) {
    setStatus(`已发起${pendingGeneration.documentLabel}生成任务，后台正在执行。`);
  }

  if (highlightTaskId) {
    const target = document.querySelector(`[data-task-id="${highlightTaskId}"]`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.style.boxShadow = "0 0 0 2px rgba(14,106,168,0.28)";
    }
  }

  const initialWorkspaceTab = params.get("workspaceTab");
  if (initialWorkspaceTab && workspaceConfig[initialWorkspaceTab]) {
    openWorkspaceTab(initialWorkspaceTab, workspaceConfig);
  } else {
    openAcceptedResultsTab();
  }

  ensureTaskPolling(module, pendingGeneration);
}

function renderAcceptedList(module, projectId) {
  const acceptedList = document.querySelector("#accepted-list");
  const items = collectAcceptedItems(module);
  const domainGroups = [
    {
      documentType: "software_requirement",
      title: "软件需求",
      description: "展示已确认的软件需求条目。"
    },
    {
      documentType: "detail_design",
      title: "详细设计",
      description: "展示已确认的详细设计结果。"
    },
    {
      documentType: "hil_test_case",
      title: "HIL 用例",
      description: "展示已确认的 HIL 用例结果。"
    }
  ];

  acceptedList.innerHTML = domainGroups
    .map((group) => {
      const groupItems = items.filter((item) => item.documentType === group.documentType);
      return `
        <section class="accepted-domain-group">
          <div class="accepted-domain-head">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="muted">${escapeHtml(group.description)}</p>
            </div>
            <span class="accepted-domain-count">${groupItems.length} 条</span>
          </div>
          ${
            groupItems.length
              ? groupItems
                  .map(
                    (item) => `
                      <article
                        class="stack-card accepted-result-card clickable"
                        data-open-accepted-source="${item.id}"
                        data-accepted-item-id="${item.id}"
                        data-accepted-document-type="${item.documentType}"
                        draggable="true"
                      >
                        <div class="accepted-result-topline">
                          <span class="doc-badge">${escapeHtml(documentLabel(item.documentType))}</span>
                          <span class="status-badge accepted">已采纳</span>
                          <span class="accepted-result-code">${escapeHtml(item.currentContent?.requirementId || item.acceptedSnapshot?.requirementId || "未编号")}</span>
                          <span class="accepted-result-code">${escapeHtml(item.currentContent?.type || item.acceptedSnapshot?.type || "functional")}</span>
                          <span class="accepted-result-code">来源任务 ${escapeHtml(shortId(item.sourceTaskId))}</span>
                          <span class="accepted-result-code">拖动排序</span>
                          <span class="accepted-result-hint">点击查看原生成结果</span>
                        </div>
                        <strong>${escapeHtml(item.currentContent?.title || item.acceptedSnapshot?.title || "已采纳结果")}</strong>
                        <div class="card-meta">
                          <span>更新时间 ${formatDateTime(item.updatedAt)}</span>
                          <span>置信度 ${escapeHtml(String(item.currentContent?.confidence ?? item.acceptedSnapshot?.confidence ?? "--"))}</span>
                        </div>
                        <div class="accepted-result-body accepted-content">${formatReadableRequirementHtml(
                          item.currentContent?.requirementText || item.acceptedSnapshot?.requirementText || ""
                        )}</div>
                        <div class="accepted-result-summary">
                          ${buildAcceptedSummaryChips(module, item)}
                        </div>
                        <div class="inline-actions accepted-result-actions">
                          <button
                            class="secondary-button"
                            type="button"
                            data-edit-accepted-item="${item.id}"
                          >编辑</button>
                          <button
                            class="secondary-button"
                            type="button"
                            data-delete-accepted-item="${item.id}"
                            data-document-type="${item.documentType}"
                            data-item-title="${escapeAttribute(item.currentContent?.title || item.acceptedSnapshot?.title || "已采纳结果")}"
                          >删除</button>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : '<div class="empty-state">当前域还没有已采纳结果。</div>'
          }
        </section>
      `;
    })
    .join("");

  acceptedList.querySelectorAll("[data-edit-accepted-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const acceptedItemId = button.dataset.editAcceptedItem || "";
      const acceptedItem = items.find((item) => item.id === acceptedItemId);
      if (!acceptedItem) {
        return;
      }
      openAcceptedEditDialog(acceptedItem, projectId, module.id);
    });
  });

  acceptedList.querySelectorAll("[data-delete-accepted-item]").forEach((button) => {
    button.addEventListener("click", async () => {
      const acceptedItemId = button.dataset.deleteAcceptedItem || "";
      const documentType = button.dataset.documentType || "software_requirement";
      const itemTitle = button.dataset.itemTitle || "该已采纳结果";
      const confirmed = window.confirm(`确认删除“${itemTitle}”吗？删除后会从已采纳结果区移除。`);
      if (!confirmed) {
        return;
      }

      try {
        await request(`/api/projects/${projectId}/modules/${module.id}/spaces/${documentType}/accepted-items/${acceptedItemId}`, {
          method: "DELETE"
        });
        setStatus(`已删除已采纳结果：${itemTitle}`);
        window.location.reload();
      } catch (error) {
        handleError(error);
      }
    });
  });

  acceptedList.querySelectorAll("[data-open-accepted-source]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (Date.now() < state.suppressAcceptedClickUntil) {
        return;
      }
      if (event.target.closest("button, a, input, textarea, select, label")) {
        return;
      }

      const acceptedItemId = card.dataset.openAcceptedSource || "";
      const acceptedItem = items.find((item) => item.id === acceptedItemId);
      if (!acceptedItem?.sourceTaskId) {
        return;
      }

      window.location.href =
        `/projects/${projectId}/modules/${module.id}/tasks/${acceptedItem.sourceTaskId}` +
        `?documentType=${acceptedItem.documentType}&resultItemId=${acceptedItem.sourceResultItemId}`;
    });
  });

  acceptedList.querySelectorAll(".accepted-domain-group").forEach((groupRoot) => {
    groupRoot.addEventListener("dragover", (event) => {
      if (!event.target.closest("[data-accepted-item-id]")) {
        clearAcceptedDropMarkers(groupRoot);
      }
    });
  });

  acceptedList.querySelectorAll("[data-accepted-item-id]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      state.acceptedDragContext = {
        itemId: card.dataset.acceptedItemId || "",
        documentType: card.dataset.acceptedDocumentType || ""
      };
      state.suppressAcceptedClickUntil = Date.now() + 400;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.acceptedDragContext.itemId);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      clearAcceptedDropMarkers(acceptedList);
      state.acceptedDragContext = null;
      state.suppressAcceptedClickUntil = Date.now() + 250;
    });

    card.addEventListener("dragover", (event) => {
      if (!state.acceptedDragContext || state.acceptedDragContext.documentType !== card.dataset.acceptedDocumentType) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearAcceptedDropMarkers(acceptedList);
      const rect = card.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      card.classList.add(before ? "is-drop-target-before" : "is-drop-target-after");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target-before", "is-drop-target-after");
    });

    card.addEventListener("drop", async (event) => {
      if (!state.acceptedDragContext || state.acceptedDragContext.documentType !== card.dataset.acceptedDocumentType) {
        return;
      }
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const dropBefore = event.clientY < rect.top + rect.height / 2;
      clearAcceptedDropMarkers(acceptedList);

      const draggedId = state.acceptedDragContext.itemId;
      const targetId = card.dataset.acceptedItemId || "";
      if (!draggedId || !targetId || draggedId === targetId) {
        return;
      }

      const documentType = card.dataset.acceptedDocumentType || "";
      const orderedIds = Array.from(
        acceptedList.querySelectorAll(`[data-accepted-document-type="${documentType}"]`)
      ).map((node) => node.dataset.acceptedItemId || "");

      const fromIndex = orderedIds.indexOf(draggedId);
      const toIndex = orderedIds.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) {
        return;
      }

      orderedIds.splice(fromIndex, 1);
      const insertIndex = dropBefore ? toIndex : toIndex + (fromIndex < toIndex ? 0 : 1);
      orderedIds.splice(insertIndex, 0, draggedId);

      const domainCards = Array.from(
        acceptedList.querySelectorAll(`[data-accepted-document-type="${documentType}"]`)
      );
      const draggedCard = domainCards.find((node) => node.dataset.acceptedItemId === draggedId);
      const targetCard = domainCards.find((node) => node.dataset.acceptedItemId === targetId);
      if (!draggedCard || !targetCard) {
        return;
      }

      if (dropBefore) {
        targetCard.parentNode.insertBefore(draggedCard, targetCard);
      } else {
        targetCard.parentNode.insertBefore(draggedCard, targetCard.nextSibling);
      }

      draggedCard.classList.remove("is-dragging");
      state.acceptedDragContext = null;
      state.suppressAcceptedClickUntil = Date.now() + 300;

      try {
        await persistAcceptedOrder(projectId, module.id, documentType, orderedIds);
        setStatus(`已更新${documentLabel(documentType)}已采纳结果顺序。`);
      } catch (error) {
        handleError(error);
        window.location.reload();
      }
    });
  });
}

function renderTaskList(module, projectId, pendingGeneration = null) {
  const taskList = document.querySelector("#task-list");
  const tasks = collectTasks(module);
  const cards = [];

  if (pendingGeneration) {
    cards.push(`
      <article class="stack-card" data-pending-generation="true">
        <div class="inline-actions">
          <span class="doc-badge">${escapeHtml(pendingGeneration.documentLabel)}</span>
          <span class="status-badge pending">生成中</span>
        </div>
        <strong>${escapeHtml(`${pendingGeneration.documentLabel}任务已启动`)}</strong>
        <div class="card-meta">
          <span>发起时间 ${formatDateTime(pendingGeneration.startedAt)}</span>
          <span>状态 后台执行中</span>
        </div>
        <p class="inline-hint">任务已经加入后台执行，结果尚未返回，完成后这里会自动切换成真实任务记录。</p>
      </article>
    `);
  }

  if (!tasks.length && !cards.length) {
    taskList.innerHTML = '<div class="empty-state">当前还没有历史生成任务。</div>';
    return;
  }

  cards.push(
    ...tasks.map(
      (task) => `
        <article class="stack-card" data-task-id="${task.id}">
          <div class="inline-actions">
            <span class="doc-badge">${escapeHtml(documentLabel(task.documentType))}</span>
            <span class="status-badge ${statusTone(task.status)}">${escapeHtml(translateStatus(task.status))}</span>
          </div>
          <strong>${escapeHtml(task.summary || `${documentLabel(task.documentType)}任务`)}</strong>
          <div class="card-meta">
            <span>执行时间 ${formatDateTime(task.createdAt)}</span>
            <span>结果数 ${(task.resultItems || []).length}</span>
            <span>模型 ${escapeHtml(task.llmProfile?.name || "本地回退")}</span>
            <span>输入 ${(task.inputAssetIds || []).length} 个资产</span>
          </div>
          ${
            task.status === "running"
              ? `<p class="inline-hint">${escapeHtml(
                  task.progress?.message || `任务已启动，正在生成中，完成后会自动刷新列表。`
                )}${task.progress?.percent ? `（${Math.round(task.progress.percent)}%）` : ""}</p>`
              : ""
          }
          ${task.status === "failed" ? `<p class="inline-hint">${escapeHtml(task.summary || "任务执行失败，请重试。")}</p>` : ""}
          <div class="inline-actions">
            <a class="primary-link" href="/projects/${projectId}/modules/${module.id}/tasks/${task.id}?documentType=${task.documentType}" data-open-task-detail="true">查看详情</a>
            <button class="secondary-button" type="button" data-delete-task="${task.id}" data-document-type="${task.documentType}" data-task-status="${task.status}" data-task-label="${escapeAttribute(task.summary || `${documentLabel(task.documentType)}任务`)}">删除任务</button>
          </div>
        </article>
      `
    )
  );

  taskList.innerHTML = cards.join("");

  taskList.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.deleteTask || "";
      const documentType = button.dataset.documentType || "software_requirement";
      const taskStatus = button.dataset.taskStatus || "";
      const taskLabel = button.dataset.taskLabel || "该任务";

      const confirmed = window.confirm(`确认删除“${taskLabel}”吗？该任务下已采纳的结果也会一并移除。`);
      if (!confirmed) {
        return;
      }

      try {
        await request(`/api/projects/${projectId}/modules/${module.id}/spaces/${documentType}/tasks/${taskId}`, {
          method: "DELETE"
        });
        clearPendingGeneration(projectId, module.id, documentType);
        setStatus(`已删除任务：${taskLabel}`);
        window.location.reload();
      } catch (error) {
        handleError(error);
      }
    });
  });

  taskList.querySelectorAll("[data-open-task-detail]").forEach((link) => {
    link.addEventListener("click", () => {
      closeHistoryDrawer();
    });
  });
}

async function renderTaskDetailPage() {
  const projectId = getPathPart(1);
  const moduleId = getPathPart(3);
  const taskId = getPathPart(5);
  const params = new URLSearchParams(window.location.search);
  const preferredDocumentType = params.get("documentType");
  const highlightedResultItemId = params.get("resultItemId");
  const [project, module] = await Promise.all([
    request(`/api/projects/${projectId}`),
    request(`/api/projects/${projectId}/modules/${moduleId}`)
  ]);

  const taskInfo = findTaskInModule(module, taskId, preferredDocumentType);
  if (!taskInfo) {
    throw new Error("任务不存在");
  }

  const { documentType, task } = taskInfo;
  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name, href: `/projects/${project.id}` },
    { label: module.name, href: `/projects/${project.id}/modules/${module.id}` },
    { label: "任务详情" }
  ]);

  document.querySelector("#task-title").textContent = task.summary || `${documentLabel(documentType)}任务详情`;
  document.querySelector("#task-subtitle").textContent = `${module.name} · ${documentLabel(documentType)} · ${formatDateTime(task.createdAt)}`;
  document.querySelector("#delete-task-button")?.addEventListener("click", async () => {
    const confirmed = window.confirm(`确认删除“${task.summary || `${documentLabel(documentType)}任务`}”吗？该任务下已采纳的结果也会一并移除。`);
    if (!confirmed) {
      return;
    }

    try {
      await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${documentType}/tasks/${task.id}`, {
        method: "DELETE"
      });
      clearPendingGeneration(projectId, moduleId, documentType);
      window.location.href = `/projects/${projectId}/modules/${moduleId}`;
    } catch (error) {
      handleError(error);
    }
  });

  renderTaskMeta(task);
  renderTaskProgress(task);
  renderTaskAgentRuntime(task);
  renderTaskResults(task, project.id, module.id, documentType);
  if (highlightedResultItemId) {
    window.setTimeout(() => {
      const target = document.querySelector(`[data-result-item-id="${highlightedResultItemId}"]`);
      if (!target) {
        return;
      }
      target.scrollIntoView({ block: "center" });
      target.style.boxShadow = "0 0 0 2px rgba(14,106,168,0.24)";
    }, 0);
  }
  ensureTaskDetailPolling(project.id, module.id, documentType, task.id, task.status);
}

function renderTaskMeta(task) {
  const visibleProgress = deriveVisibleTaskProgress(task);
  const llmLabel =
    task.llmProfile?.executionMode === "hermes_agent_cli"
      ? "Installed Hermes CLI / configured-in-hermes"
      : task.llmProfile?.executionMode === "hermes_agent_api"
        ? `Hermes Agent API / ${task.llmProfile?.name || "已配置"}`
        : task.llmProfile?.name || "本地回退";
  const taskMeta = document.querySelector("#task-meta");
  taskMeta.innerHTML = `
    <article class="meta-item"><span>任务状态</span><strong>${escapeHtml(translateStatus(task.status))}</strong></article>
    <article class="meta-item"><span>当前阶段</span><strong>${escapeHtml(visibleProgress.label || "待处理")}</strong></article>
    <article class="meta-item"><span>完成进度</span><strong>${Math.round(Number(visibleProgress.percent || 0))}%</strong></article>
    <article class="meta-item"><span>生成结果数</span><strong>${(task.resultItems || []).length}</strong></article>
    <article class="meta-item"><span>输入资产数</span><strong>${(task.inputAssetIds || []).length}</strong></article>
    <article class="meta-item"><span>生成模型</span><strong>${escapeHtml(llmLabel)}</strong></article>
    <article class="meta-item"><span>最近更新</span><strong>${escapeHtml(formatDateTime(visibleProgress.updatedAt || task.updatedAt))}</strong></article>
  `;
}

function renderTaskProgress(task) {
  const taskProgress = document.querySelector("#task-progress");
  if (!taskProgress) {
    return;
  }

  const visibleProgress = deriveVisibleTaskProgress(task);
  const percent = Math.round(Number(visibleProgress.percent || 0));
  const timeline = Array.isArray(task.timeline) ? [...task.timeline].reverse() : [];
  const metrics = task.metrics || {};

  taskProgress.innerHTML = `
    <div class="progress-shell">
      <div class="progress-hero">
        <strong>${escapeHtml(visibleProgress.label || translateStatus(task.status))}</strong>
        <p>${escapeHtml(visibleProgress.message || task.summary || "任务已创建，等待执行。")}</p>
        <div class="progress-bar" aria-hidden="true">
          <div class="progress-bar-fill" style="width: ${Math.max(0, Math.min(100, percent))}%"></div>
        </div>
        <div class="progress-meta">
          <span>进度 ${percent}%</span>
          ${
            visibleProgress.total
              ? `<span>文件 ${Number(visibleProgress.current || 0)}/${Number(visibleProgress.total || 0)}</span>`
              : ""
          }
          ${metrics.extractionEvidenceCount ? `<span>证据 ${metrics.extractionEvidenceCount} 条</span>` : ""}
          ${metrics.generatedItemCount ? `<span>结果 ${metrics.generatedItemCount} 条</span>` : ""}
          ${metrics.conflictCount ? `<span>冲突 ${metrics.conflictCount} 个</span>` : ""}
          ${metrics.llmDurationMs ? `<span>模型耗时 ${metrics.llmDurationMs} ms</span>` : ""}
        </div>
      </div>
      <div class="timeline-list">
        ${
          timeline.length
            ? timeline
                .map(
                  (entry) => `
                    <article class="timeline-item ${escapeHtml(entry.level || "info")}">
                      <time>${escapeHtml(formatDateTime(entry.at))}</time>
                      <strong>${escapeHtml(entry.label || entry.stage || "进度更新")}</strong>
                      <div>${escapeHtml(entry.message || "")}</div>
                    </article>
                  `
                )
                .join("")
            : '<div class="empty-state">任务启动后，这里会持续显示阶段进度与关键日志。</div>'
        }
      </div>
    </div>
  `;
}

function formatRelativeDuration(timestamp) {
  const value = String(timestamp || "").trim();
  if (!value) {
    return "--";
  }
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return formatDateTime(value);
  }
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function deriveVisibleTaskProgress(task) {
  const base = task.progress || {};
  const agent = task.debug?.agent || {};
  if (task.status === "running" && agent.status === "completed") {
    return {
      ...base,
      stage: "post_process",
      label: "模型已返回，正在后处理",
      message: "本机 Hermes 已返回结果，后端正在校验引用、执行规则检查并准备保存结果。",
      percent: Math.max(Number(base.percent || 0), 84)
    };
  }
  return base;
}

function buildAgentRuntimeMeta(event) {
  const meta = [];
  if (event.stepType) meta.push(`step: ${event.stepType}`);
  if (event.status) meta.push(`status: ${event.status}`);
  if (event.sessionId) meta.push(`session: ${event.sessionId}`);
  if (event.elapsedMs) meta.push(`耗时 ${Math.round(event.elapsedMs / 1000)} 秒`);
  return meta;
}

function renderTaskAgentRuntime(task) {
  const runtimeRoot = document.querySelector("#task-agent-runtime");
  if (!runtimeRoot) {
    return;
  }

  const debug = task.debug || {};
  const agent = debug.agent || {};
  const events = Array.isArray(debug.events)
    ? [...debug.events]
        .filter((event) => event.type === "agent_runtime" || event.transport || event.sessionId || event.stdoutExcerpt || event.stderrExcerpt)
        .reverse()
    : [];
  const isHermesTask = String(task.llmProfile?.executionMode || "").startsWith("hermes_agent");

  if (!isHermesTask && !events.length) {
    runtimeRoot.innerHTML = '<div class="empty-state">当前任务没有可展示的 Agent 运行日志。</div>';
    return;
  }

  runtimeRoot.innerHTML = `
    <div class="agent-runtime-shell">
      <div class="agent-runtime-summary">
        <article class="agent-runtime-card">
          <span>Agent 传输</span>
          <strong>${escapeHtml(agent.transport || task.llmProfile?.executionMode || "--")}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>当前 Step</span>
          <strong>${escapeHtml(agent.currentStep || task.progress?.stage || "--")}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>Hermes 会话</span>
          <strong>${escapeHtml(agent.sessionId || "--")}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>启动时间</span>
          <strong>${escapeHtml(agent.startedAt ? formatDateTime(agent.startedAt) : "--")}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>最近心跳</span>
          <strong>${escapeHtml(agent.lastHeartbeatAt ? `${formatDateTime(agent.lastHeartbeatAt)} / ${formatRelativeDuration(agent.lastHeartbeatAt)}` : "--")}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>当前状态</span>
          <strong>${escapeHtml(agent.status || task.status || "--")}</strong>
        </article>
      </div>
      <div class="agent-runtime-excerpts">
        <article class="agent-runtime-excerpt">
          <strong>最近一次 stdout 摘要</strong>
          <pre>${escapeHtml(agent.stdoutExcerpt || "暂无 stdout 摘要")}</pre>
        </article>
        <article class="agent-runtime-excerpt">
          <strong>最近一次 stderr 摘要</strong>
          <pre>${escapeHtml(agent.stderrExcerpt || "暂无 stderr 摘要")}</pre>
        </article>
      </div>
      <div class="agent-runtime-list">
        ${
          events.length
            ? events
                .slice(0, 20)
                .map((event) => {
                  const meta = buildAgentRuntimeMeta(event);
                  return `
                    <article class="agent-runtime-item ${escapeHtml(event.level || "info")}">
                      <time>${escapeHtml(formatDateTime(event.at))}</time>
                      <strong>${escapeHtml(event.label || event.stepType || "Agent 运行事件")}</strong>
                      <div>${escapeHtml(event.message || "")}</div>
                      ${
                        meta.length
                          ? `<div class="agent-runtime-item-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
                          : ""
                      }
                      ${
                        event.stdoutExcerpt || event.stderrExcerpt
                          ? `<details>
                              <summary>查看输出摘要</summary>
                              ${
                                event.stdoutExcerpt
                                  ? `<pre>${escapeHtml(event.stdoutExcerpt)}</pre>`
                                  : ""
                              }
                              ${
                                event.stderrExcerpt
                                  ? `<pre>${escapeHtml(event.stderrExcerpt)}</pre>`
                                  : ""
                              }
                            </details>`
                          : ""
                      }
                    </article>
                  `;
                })
                .join("")
            : '<div class="empty-state">Agent 已接管此任务，但当前还没有写入运行事件。</div>'
        }
      </div>
    </div>
  `;
}

function getResultConflicts(task, resultItem) {
  return (task.conflicts || []).filter((item) => item.requirementId === resultItem.id || item.requirementId === resultItem.requirementId);
}

function getResultTraces(task, resultItem) {
  return (task.traces || []).filter(
    (item) => item.requirementId === resultItem.id || item.requirementId === resultItem.requirementId || item.requirementCode === resultItem.requirementId
  );
}

function buildResultConflictBlock(task, resultItem) {
  const conflicts = getResultConflicts(task, resultItem);
  return `
    <div class="result-section">
      <strong>冲突项</strong>
      <div class="result-section-body">${escapeHtml(
        conflicts.map((item) => `${item.code || "conflict"}: ${item.message || item.detail || ""}`).join("\n") || "无"
      )}</div>
    </div>
  `;
}

function buildResultTraceBlock(task, resultItem) {
  const traces = getResultTraces(task, resultItem);
  return `
    <div class="result-section">
      <strong>追溯信息</strong>
      <div class="result-section-body">${escapeHtml(
        traces.map((item) => `${item.fileName} @ ${item.location}`).join("\n") || "无"
      )}</div>
    </div>
  `;
}

function buildResultSourceBlock(resultItem) {
  return `
    <div class="result-section">
      <strong>来源片段</strong>
      <div class="result-section-body">${escapeHtml(
        (resultItem.sourceRefs || []).map((ref) => `${ref.fileName} @ ${ref.location}: ${ref.excerpt}`).join("\n\n") || "无"
      )}</div>
    </div>
  `;
}

function renderTaskResults(task, projectId, moduleId, documentType) {
  const taskResults = document.querySelector("#task-results");
  const visibleProgress = deriveVisibleTaskProgress(task);
  if (task.status === "running") {
    taskResults.innerHTML = `<div class="empty-state">${escapeHtml(
      visibleProgress.message || "任务正在生成中，页面会自动刷新最新进度。"
    )}</div>`;
    return;
  }

  if (task.status === "failed") {
    taskResults.innerHTML = `<div class="empty-state">${escapeHtml(
      task.errorMessage || task.progress?.message || "任务执行失败，请返回模块页重新发起，或检查模型与输入资产。"
    )}</div>`;
    return;
  }

  if (!(task.resultItems || []).length) {
    taskResults.innerHTML = '<div class="empty-state">本次任务没有生成结果。</div>';
    return;
  }

  taskResults.innerHTML = task.resultItems
    .map(
      (item) => `
        <article class="stack-card generated-result-card" data-result-item-id="${item.id}">
          <div class="inline-actions">
            <span class="status-badge ${statusTone(item.review?.status || "pending")}">${escapeHtml(
              translateStatus(item.review?.status || "pending")
            )}</span>
          </div>
          <strong>${escapeHtml(item.title || item.requirementId || "未命名结果")}</strong>
          <div class="card-meta">
            <span data-requirement-code>${escapeHtml(item.requirementId || "未编号")}</span>
            <span>${escapeHtml(item.type || "functional")}</span>
            <span>置信度 ${String(item.confidence ?? "--")}</span>
          </div>
          <label>
            标题
            <input data-title-input="${item.id}" value="${escapeAttribute(item.title || "")}" />
          </label>
          <div class="generated-result-preview-wrap">
            <div class="generated-result-preview-head">
              <span>内容预览</span>
              <button class="secondary-button" type="button" data-toggle-result-editor="${item.id}">编辑正文</button>
            </div>
            <div class="accepted-result-body accepted-content generated-result-preview" data-result-preview="${item.id}">
              ${formatReadableRequirementHtml(item.requirementText || "")}
            </div>
          </div>
          <div class="generated-result-editor" data-result-editor="${item.id}" hidden>
            <label>
              正文编辑
              <textarea data-text-input="${item.id}" rows="8">${escapeHtml(item.requirementText || "")}</textarea>
            </label>
          </div>
          <div class="inline-actions">
            <button data-accept-item="${item.id}">采纳</button>
            <button class="secondary-button" data-reject-item="${item.id}">驳回</button>
          </div>
          ${buildResultConflictBlock(task, item)}
          ${buildResultTraceBlock(task, item)}
          ${buildResultSourceBlock(item)}
        </article>
      `
    )
    .join("");

  taskResults.onclick = async (event) => {
    const acceptButton = event.target.closest("[data-accept-item]");
    const rejectButton = event.target.closest("[data-reject-item]");
    const toggleEditorButton = event.target.closest("[data-toggle-result-editor]");
    if (toggleEditorButton) {
      const resultItemId = toggleEditorButton.dataset.toggleResultEditor || "";
      const editor = taskResults.querySelector(`[data-result-editor="${resultItemId}"]`);
      if (!editor) {
        return;
      }
      const nextHidden = !editor.hidden;
      editor.hidden = nextHidden;
      toggleEditorButton.textContent = nextHidden ? "编辑正文" : "收起编辑";
      return;
    }

    if (!acceptButton && !rejectButton) {
      const textInput = event.target.closest("[data-text-input]");
      if (!textInput) {
        return;
      }
      const resultItemId = textInput.dataset.textInput || "";
      const preview = taskResults.querySelector(`[data-result-preview="${resultItemId}"]`);
      if (preview) {
        preview.innerHTML = formatReadableRequirementHtml(textInput.value || "");
      }
      return;
    }

    const resultItemId = acceptButton?.dataset.acceptItem || rejectButton?.dataset.rejectItem;
    const title = taskResults.querySelector(`[data-title-input="${resultItemId}"]`)?.value || "";
    const requirementText = taskResults.querySelector(`[data-text-input="${resultItemId}"]`)?.value || "";

    try {
      if (acceptButton) {
        await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${documentType}/accepted-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceTaskId: task.id,
            sourceResultItemId: resultItemId,
            title,
            requirementText
          })
        });
        setStatus("结果已采纳，返回模块页即可看到已采纳内容。");
      } else {
        const root = taskResults.querySelector(`[data-result-item-id="${resultItemId}"]`);
        const requirementCode = root?.querySelector("[data-requirement-code]")?.textContent || "当前结果";
        openRejectDialog({
          projectId,
          moduleId,
          documentType,
          taskId: task.id,
          resultItemId,
          requirementCode,
          root
        });
        return;
      }
      window.location.reload();
    } catch (error) {
      handleError(error);
    }
  };

  taskResults.oninput = (event) => {
    const textInput = event.target.closest("[data-text-input]");
    if (!textInput) {
      return;
    }
    const resultItemId = textInput.dataset.textInput || "";
    const preview = taskResults.querySelector(`[data-result-preview="${resultItemId}"]`);
    if (preview) {
      preview.innerHTML = formatReadableRequirementHtml(textInput.value || "");
    }
  };
}

function openRejectDialog(context) {
  if (!rejectDialog || !rejectForm || !context?.root) {
    return;
  }
  state.rejectContext = context;
  state.rejectSubmitting = false;
  rejectForm.reset();
  rejectForm.elements.namedItem("severity").value = "medium";
  rejectDialogSubtitle.textContent = `你正在驳回 ${context.requirementCode}，请填写结构化原因。`;
  setRejectDialogStatus("");
  setRejectSubmitting(false);
  rejectDialog.showModal();
}

function openAcceptedEditDialog(item, projectId, moduleId) {
  state.acceptedEditContext = {
    projectId,
    moduleId,
    documentType: item.documentType,
    itemId: item.id
  };
  acceptedEditSubtitle.textContent = `${documentLabel(item.documentType)} · 来源任务 ${shortId(item.sourceTaskId)}`;
  acceptedEditTitleInput.value = item.currentContent?.title || item.acceptedSnapshot?.title || "";
  acceptedEditTextInput.value = item.currentContent?.requirementText || item.acceptedSnapshot?.requirementText || "";
  acceptedEditDialog?.showModal();
}

function closeAcceptedEditDialog() {
  state.acceptedEditContext = null;
  acceptedEditForm?.reset();
  acceptedEditDialog?.close();
}

function openHistoryDrawer() {
  historyDrawer?.classList.add("open");
  historyDrawer?.setAttribute("aria-hidden", "false");
  if (historyDrawerBackdrop) {
    historyDrawerBackdrop.hidden = false;
  }
}

function closeHistoryDrawer() {
  historyDrawer?.classList.remove("open");
  historyDrawer?.setAttribute("aria-hidden", "true");
  if (historyDrawerBackdrop) {
    historyDrawerBackdrop.hidden = true;
  }
}

function openFeedbackHistoryDrawer() {
  feedbackHistoryDrawer?.classList.add("open");
  feedbackHistoryDrawer?.setAttribute("aria-hidden", "false");
  if (feedbackHistoryDrawerBackdrop) {
    feedbackHistoryDrawerBackdrop.hidden = false;
  }
}

function closeFeedbackHistoryDrawer() {
  feedbackHistoryDrawer?.classList.remove("open");
  feedbackHistoryDrawer?.setAttribute("aria-hidden", "true");
  if (feedbackHistoryDrawerBackdrop) {
    feedbackHistoryDrawerBackdrop.hidden = true;
  }

  if (workspaceFrame?.contentWindow) {
    workspaceFrame.contentWindow.postMessage({ type: "feedback_pool:parent_history_drawer_closed" }, window.location.origin);
  }
}

function handleWorkspaceMessage(event) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const data = event.data || {};
  if (data.type === "feedback_pool:open_history_drawer") {
    state.feedbackHistory.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    state.feedbackHistory.selectedTaskId = data.selectedTaskId || state.feedbackHistory.tasks[0]?.id || "";
    renderFeedbackHistoryDrawer();
    openFeedbackHistoryDrawer();
    return;
  }

  if (data.type === "feedback_pool:update_history_drawer") {
    state.feedbackHistory.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (
      state.feedbackHistory.selectedTaskId &&
      !state.feedbackHistory.tasks.some((task) => task.id === state.feedbackHistory.selectedTaskId)
    ) {
      state.feedbackHistory.selectedTaskId = data.selectedTaskId || state.feedbackHistory.tasks[0]?.id || "";
    } else if (!state.feedbackHistory.selectedTaskId) {
      state.feedbackHistory.selectedTaskId = data.selectedTaskId || state.feedbackHistory.tasks[0]?.id || "";
    }
    renderFeedbackHistoryDrawer();
    return;
  }

  if (data.type === "feedback_pool:close_history_drawer") {
    closeFeedbackHistoryDrawer();
  }
}

function handleFeedbackHistoryTaskClick(event) {
  const trigger = event.target.closest("[data-feedback-history-task]");
  if (!trigger) return;
  state.feedbackHistory.selectedTaskId = trigger.dataset.feedbackHistoryTask || "";
  renderFeedbackHistoryDrawer();
}

function renderFeedbackHistoryDrawer() {
  if (!feedbackHistoryTaskListRoot || !feedbackHistoryTaskDetailRoot) {
    return;
  }

  const tasks = state.feedbackHistory.tasks || [];
  if (!tasks.length) {
    feedbackHistoryTaskListRoot.innerHTML = '<div class="empty-state">当前模块还没有 Fallback 历史任务。</div>';
    feedbackHistoryTaskDetailRoot.className = "feedback-history-task-detail empty-state";
    feedbackHistoryTaskDetailRoot.textContent = "等待反馈池发来任务数据。";
    return;
  }

  feedbackHistoryTaskListRoot.innerHTML = tasks.map((task) => renderFeedbackHistoryTaskCard(task)).join("");
  const selectedTask =
    tasks.find((task) => task.id === state.feedbackHistory.selectedTaskId) ||
    tasks[0] ||
    null;

  state.feedbackHistory.selectedTaskId = selectedTask?.id || "";
  feedbackHistoryTaskDetailRoot.className = "feedback-history-task-detail";
  feedbackHistoryTaskDetailRoot.innerHTML = selectedTask
    ? renderFeedbackHistoryTaskDetail(selectedTask)
    : "选择一条历史任务查看详情。";
}

function renderFeedbackHistoryTaskCard(task = {}) {
  const proposalCount = (task.proposals || []).flatMap((proposal) => proposal.items || []).length;
  const isSelected = state.feedbackHistory.selectedTaskId === task.id;
  const isRunning = task.taskStatus === "running";
  return `
    <button
      type="button"
      class="stack-card feedback-history-task-card ${isSelected ? "is-selected" : ""} ${isRunning ? "is-running" : ""}"
      data-feedback-history-task="${escapeAttribute(task.id || "")}"
    >
      <strong>${escapeHtml(task.summary || "Fallback 历史任务")}</strong>
      <p>${escapeHtml(task.moduleName || "未指定模块")} · ${escapeHtml(formatDateTime(task.createdAt))}</p>
      <div class="feedback-history-meta">
        <span class="feedback-history-badge ${escapeHtml(task.taskStatus || "pending")}">${escapeHtml(translateReplayTaskStatus(task.taskStatus))}</span>
        <span>${escapeHtml(`${(task.sourceRejectionIds || []).length} 条记录`)}</span>
        <span>${escapeHtml(`${proposalCount} 条提案`)}</span>
      </div>
    </button>
  `;
}

function renderFeedbackHistoryTaskDetail(task = {}) {
  const proposalItems = (task.proposals || []).flatMap((proposal) => proposal.items || []);
  const referenceAssets = task.materialPack?.referenceAssets || [];
  const rootCauses = (task.proposals || []).flatMap((proposal) => proposal.rootCauses || []);
  const pendingStageMessage = task.pendingStageMessage || "系统正在处理这条 Replay / Fallback 任务。";

  return `
    <div class="feedback-history-detail-head">
      <div>
        <p class="eyebrow">Fallback History</p>
        <h3>${escapeHtml(task.summary || "Fallback 历史任务")}</h3>
        <p class="muted">${escapeHtml(task.moduleName || "未指定模块")} · ${escapeHtml(formatDateTime(task.createdAt))}</p>
      </div>
      <span class="feedback-history-badge ${escapeHtml(task.taskStatus || "pending")}">${escapeHtml(translateReplayTaskStatus(task.taskStatus))}</span>
    </div>

    <div class="feedback-history-detail-grid">
      <article class="feedback-history-detail-card">
        <span>任务编号</span>
        <strong>${escapeHtml(task.id || "-")}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>模型</span>
        <strong>${escapeHtml(task.llmProfileId || "本地回放 / Fallback")}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>驳回记录</span>
        <strong>${escapeHtml(String((task.sourceRejectionIds || []).length))}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>提案数量</span>
        <strong>${escapeHtml(String(proposalItems.length))}</strong>
      </article>
    </div>

    ${
      task.taskStatus === "running"
        ? `
          <section class="feedback-history-detail-section">
            <h4>当前阶段</h4>
            <div class="feedback-history-detail-item">
              <strong>${escapeHtml(task.pendingStageLabel || "处理中")}</strong>
              <p>${escapeHtml(pendingStageMessage)}</p>
            </div>
          </section>
        `
        : ""
    }

    ${
      rootCauses.length
        ? `
          <section class="feedback-history-detail-section">
            <h4>根因摘要</h4>
            <div class="feedback-history-detail-list">
              ${rootCauses
                .map(
                  (cause) => `
                    <article class="feedback-history-detail-item">
                      <strong>${escapeHtml(cause.title || "根因")}</strong>
                      <p>${escapeHtml(cause.detail || cause.summary || "")}</p>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>
        `
        : ""
    }

    <section class="feedback-history-detail-section">
      <h4>提案条目</h4>
      ${
        proposalItems.length
          ? `
              <div class="feedback-history-detail-list">
                ${proposalItems
                  .map(
                    (item) => `
                      <article class="feedback-history-detail-item">
                        <strong>${escapeHtml(item.title || "未命名提案")}</strong>
                        <p>${escapeHtml(item.rationale || item.after || item.newRuleDraft?.content || "暂无说明")}</p>
                        <p class="muted">${escapeHtml(item.action || "proposal")} · ${escapeHtml(item.kind || "-")} · ${escapeHtml(item.targetSkillCode || item.targetProfileKey || "新增规则")}</p>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
          : '<p class="feedback-history-detail-copy">当前还没有提案条目，可能仍在生成中。</p>'
      }
    </section>

    <section class="feedback-history-detail-section">
      <h4>参考资产</h4>
      ${
        referenceAssets.length
          ? `
              <div class="feedback-history-detail-list">
                ${referenceAssets
                  .map(
                    (asset) => `
                      <article class="feedback-history-detail-item">
                        <strong>${escapeHtml(asset.originalName || asset.fileName || asset.id || "未命名资产")}</strong>
                        <p>${escapeHtml(asset.role || "未标注角色")}</p>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
          : '<p class="feedback-history-detail-copy">这次任务没有额外勾选参考资产。</p>'
      }
    </section>
  `;
}

async function handleAcceptedEditSubmit(event) {
  event.preventDefault();
  if (!state.acceptedEditContext) {
    return;
  }

  try {
    await request(
      `/api/projects/${state.acceptedEditContext.projectId}/modules/${state.acceptedEditContext.moduleId}/spaces/${state.acceptedEditContext.documentType}/accepted-items/${state.acceptedEditContext.itemId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: acceptedEditTitleInput.value.trim(),
          requirementText: acceptedEditTextInput.value.trim()
        })
      }
    );
    closeAcceptedEditDialog();
    setStatus("已更新已采纳结果。");
    window.location.reload();
  } catch (error) {
    handleError(error);
  }
}

function closeRejectDialog(force = false) {
  if (state.rejectSubmitting && !force) {
    return;
  }
  state.rejectContext = null;
  setRejectDialogStatus("");
  setRejectSubmitting(false);
  rejectForm?.reset();
  rejectDialog?.close();
}

async function handleRejectSubmit(event) {
  event.preventDefault();
  if (!state.rejectContext?.root || state.rejectSubmitting) {
    return;
  }

  try {
    setRejectSubmitting(true);
    setRejectDialogStatus("正在提交驳回，请稍候...");
    const formData = new FormData(rejectForm);
    const payload = {
      status: "rejected",
      title: state.rejectContext.root.querySelector(`[data-title-input="${state.rejectContext.resultItemId}"]`)?.value || "",
      requirementText:
        state.rejectContext.root.querySelector(`[data-text-input="${state.rejectContext.resultItemId}"]`)?.value || "",
      reviewer: "当前用户",
      reasonCategory: String(formData.get("reasonCategory") || "").trim(),
      reasonTags: String(formData.get("reasonTags") || ""),
      severity: String(formData.get("severity") || "medium"),
      reasonText: String(formData.get("reasonText") || "").trim(),
      expectedNote: String(formData.get("expectedNote") || "").trim(),
      targetArea: String(formData.get("targetArea") || "validation").trim(),
      targetLayerConstraint: String(formData.get("targetLayerConstraint") || "docType").trim(),
      includeInPool: formData.get("includeInPool") === "on",
      comment: "在任务详情页中人工驳回"
    };

    await request(
      `/api/projects/${state.rejectContext.projectId}/modules/${state.rejectContext.moduleId}/spaces/${state.rejectContext.documentType}/tasks/${state.rejectContext.taskId}/results/${state.rejectContext.resultItemId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    setRejectDialogStatus("驳回已提交，正在刷新页面...");
    closeRejectDialog(true);
    setStatus(payload.includeInPool ? "结果已驳回并沉淀到反馈池。" : "结果已驳回，未加入反馈池。");
    window.location.reload();
  } catch (error) {
    setRejectSubmitting(false);
    setRejectDialogStatus(localizeErrorMessage(error.message || "驳回提交失败"), true);
    handleError(error);
  }
}

function setRejectSubmitting(isSubmitting) {
  state.rejectSubmitting = isSubmitting;
  if (rejectFormSubmit) {
    rejectFormSubmit.textContent = isSubmitting ? "提交中..." : "确认驳回";
  }
  rejectForm
    ?.querySelectorAll("input, textarea, select, button")
    .forEach((element) => {
      element.disabled = isSubmitting;
    });
}

function setRejectDialogStatus(message = "", isError = false) {
  if (!rejectDialogStatus) {
    return;
  }
  rejectDialogStatus.textContent = message;
  rejectDialogStatus.classList.toggle("error", isError);
}

function renderBreadcrumb(items) {
  const root = document.querySelector("#breadcrumb");
  if (!root) {
    return;
  }
  root.innerHTML = items
    .map((item, index) =>
      item.href
        ? `<a href="${item.href}">${escapeHtml(item.label)}</a>${index < items.length - 1 ? "<span>/</span>" : ""}`
        : `<span>${escapeHtml(item.label)}</span>${index < items.length - 1 ? "<span>/</span>" : ""}`
    )
    .join("");
}

function collectAcceptedItems(module) {
  return ["software_requirement", "detail_design", "hil_test_case"]
    .flatMap((documentType) =>
      (module.documentSpaces?.[documentType]?.acceptedItems || []).map((item) => ({
        ...item,
        documentType
      }))
    );
}

function findAcceptedSourceTask(module, item) {
  return module.documentSpaces?.[item.documentType]?.generationTasks?.find((task) => task.id === item.sourceTaskId) || null;
}

function buildAcceptedSummaryChips(module, item) {
  const sourceTask = findAcceptedSourceTask(module, item);
  const sourceResultId = item.sourceResultItemId || item.acceptedSnapshot?.id || "";
  const requirementCode = item.currentContent?.requirementId || item.acceptedSnapshot?.requirementId || "";
  const traces = (sourceTask?.traces || []).filter(
    (entry) => entry.requirementId === sourceResultId || entry.requirementId === requirementCode || entry.requirementCode === requirementCode
  );
  const conflicts = (sourceTask?.conflicts || []).filter(
    (entry) => entry.requirementId === sourceResultId || entry.requirementId === requirementCode || entry.requirementCode === requirementCode
  );
  const sourceRefs = item.currentContent?.sourceRefs || item.acceptedSnapshot?.sourceRefs || [];
  const chips = [];

  chips.push(conflicts.length ? `冲突 ${conflicts.length} 项` : "冲突 已清");

  if (traces.length) {
    chips.push(`追溯 ${traces[0].fileName || "已关联"}${traces[0].location ? ` @ ${traces[0].location}` : ""}`);
  } else if (sourceRefs.length) {
    chips.push(`追溯 ${sourceRefs[0].fileName || "已关联"}${sourceRefs[0].location ? ` @ ${sourceRefs[0].location}` : ""}`);
  } else {
    chips.push("追溯 暂无");
  }

  if (sourceRefs.length) {
    chips.push(`来源 ${sourceRefs.length} 段`);
  }

  return chips.map((label) => `<span>${escapeHtml(label)}</span>`).join("");
}

function normalizeReadableRequirementText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/([。；])(?=(?:当|若|如果|否则|注：|说明：))/g, "$1\n")
    .replace(/(?<!\d)(\d+\.\s*)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatReadableRequirementHtml(value) {
  const text = normalizeReadableRequirementText(value);
  if (!text) {
    return '<p class="accepted-paragraph muted">暂无内容</p>';
  }

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const parts = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) {
      return;
    }
    parts.push(
      `<ol class="accepted-list">${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
    );
    listItems = [];
  };

  for (const line of lines) {
    if (/^\d+\.\s*/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s*/, ""));
      continue;
    }

    flushList();

    parts.push(`<p class="${/^(注：|说明：)/.test(line) ? "accepted-note" : "accepted-paragraph"}">${escapeHtml(line)}</p>`);
  }

  flushList();
  return parts.join("");
}

function collectTasks(module) {
  return ["software_requirement", "detail_design", "hil_test_case"]
    .flatMap((documentType) =>
      (module.documentSpaces?.[documentType]?.generationTasks || []).map((task) => ({
        ...task,
        documentType
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function countTasks(module) {
  return collectTasks(module).length;
}

function findTaskInModule(module, taskId, preferredDocumentType = "") {
  const documentTypes = preferredDocumentType
    ? [preferredDocumentType, ...["software_requirement", "detail_design", "hil_test_case"].filter((item) => item !== preferredDocumentType)]
    : ["software_requirement", "detail_design", "hil_test_case"];

  for (const documentType of documentTypes) {
    const task = (module.documentSpaces?.[documentType]?.generationTasks || []).find((item) => item.id === taskId);
    if (task) {
      return { documentType, task };
    }
  }

  return null;
}

function getPathPart(index) {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[index] || "";
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(localizeErrorMessage(data.error || "请求失败"));
  }
  return data;
}

function documentLabel(documentType) {
  if (documentType === "detail_design") return "详细设计";
  if (documentType === "hil_test_case") return "HIL 用例";
  return "软件需求";
}

function ensureTaskPolling(module, pendingGeneration = null) {
  const hasRunningTask = collectTasks(module).some((task) => task.status === "running");
  if (!hasRunningTask && !pendingGeneration) {
    if (taskPollTimer) {
      window.clearTimeout(taskPollTimer);
      taskPollTimer = 0;
    }
    return;
  }

  if (taskPollTimer) {
    return;
  }

  taskPollTimer = window.setTimeout(() => {
    window.location.reload();
  }, TASK_POLL_INTERVAL_MS);
}

function ensureTaskDetailPolling(projectId, moduleId, documentType, taskId, taskStatus) {
  if (taskStatus !== "running") {
    if (taskPollTimer) {
      window.clearTimeout(taskPollTimer);
      taskPollTimer = 0;
    }
    return;
  }

  if (taskPollTimer) {
    return;
  }

  taskPollTimer = window.setTimeout(async () => {
    taskPollTimer = 0;
    try {
      const task = await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${documentType}/tasks/${taskId}`);
      renderTaskMeta(task);
      renderTaskProgress(task);
      renderTaskResults(task, projectId, moduleId, documentType);
      if (task.status === "running") {
        ensureTaskDetailPolling(projectId, moduleId, documentType, taskId, task.status);
      } else {
        setStatus(task.status === "completed" ? "任务已完成，结果已更新。" : task.errorMessage || "任务执行已结束。");
      }
    } catch (error) {
      handleError(error);
    }
  }, TASK_POLL_INTERVAL_MS);
}

function getPendingGenerations() {
  try {
    return JSON.parse(window.sessionStorage.getItem(PENDING_GENERATION_STORAGE_KEY) || "[]");
  } catch (error) {
    console.warn("Failed to parse pending generations", error);
    return [];
  }
}

function savePendingGenerations(entries) {
  window.sessionStorage.setItem(PENDING_GENERATION_STORAGE_KEY, JSON.stringify(entries));
}

function clearPendingGeneration(targetProjectId, targetModuleId, targetDocumentType) {
  savePendingGenerations(
    getPendingGenerations().filter(
      (item) => !(item.projectId === targetProjectId && item.moduleId === targetModuleId && item.documentType === targetDocumentType)
    )
  );
}

function resolvePendingGeneration(projectId, module) {
  const now = Date.now();
  const entries = getPendingGenerations();
  const validEntries = entries.filter((item) => now - Number(item.startedAt || 0) < PENDING_GENERATION_MAX_AGE_MS);
  if (validEntries.length !== entries.length) {
    savePendingGenerations(validEntries);
  }

  const matchingEntry = validEntries.find((item) => item.projectId === projectId && item.moduleId === module.id);
  if (!matchingEntry) {
    return null;
  }

  const realTasks = collectTasks(module).filter((task) => task.documentType === matchingEntry.documentType);
  if (realTasks.length) {
    clearPendingGeneration(projectId, module.id, matchingEntry.documentType);
    return null;
  }

  return matchingEntry;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "未知时间";
}

function translateStatus(status) {
  if (status === "accepted") return "已采纳";
  if (status === "rejected") return "已驳回";
  if (status === "completed") return "已完成";
  if (status === "running") return "生成中";
  if (status === "failed") return "已失败";
  if (status === "proposal_review") return "待提案评审";
  return "待处理";
}

function translateReplayTaskStatus(status) {
  if (status === "running") return "处理中";
  if (status === "done" || status === "completed") return "已完成";
  if (status === "failed") return "已失败";
  return "待处理";
}

function statusTone(status) {
  if (status === "accepted" || status === "completed") return "accepted";
  if (status === "failed" || status === "rejected") return "rejected";
  return "pending";
}

function shortId(value = "") {
  return String(value).slice(0, 8);
}

function setStatus(message) {
  if (statusRoot) {
    statusRoot.textContent = message;
  }
}

function handleError(error) {
  console.error(error);
  setStatus(localizeErrorMessage(error.message || "操作失败"));
}

function localizeErrorMessage(message = "") {
  const normalized = String(message || "").trim();
  if (!normalized) return "操作失败";
  if (normalized === "Task not found") return "任务不存在";
  if (normalized === "Request failed") return "请求失败";
  if (normalized === "Running task cannot be deleted") return "运行中的任务不能删除";
  return normalized;
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
  return escapeHtml(value).replaceAll("\n", "&#10;");
}
