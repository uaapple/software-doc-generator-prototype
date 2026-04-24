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
const acceptedEditSectionTitleInput = document.querySelector("#accepted-edit-section-title");
const acceptedEditItemTitleInput = document.querySelector("#accepted-edit-item-title");
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
const moduleAssetPreviewDialog = document.querySelector("#module-asset-preview-dialog");
const moduleAssetPreviewTitle = document.querySelector("#module-asset-preview-title");
const moduleAssetPreviewMeta = document.querySelector("#module-asset-preview-meta");
const moduleAssetPreviewContent = document.querySelector("#module-asset-preview-content");
const moduleAssetPreviewClose = document.querySelector("#module-asset-preview-close");
const moduleRecordReviewDialog = document.querySelector("#module-record-review-dialog");
const moduleRecordReviewTitle = document.querySelector("#module-record-review-title");
const moduleRecordReviewMeta = document.querySelector("#module-record-review-meta");
const moduleRecordReviewContent = document.querySelector("#module-record-review-content");
const moduleRecordReviewWorkOrder = document.querySelector("#module-record-review-work-order");
const moduleRecordReviewClose = document.querySelector("#module-record-review-close");
const TASK_POLL_INTERVAL_MS = 30000;
const PENDING_GENERATION_STORAGE_KEY = "pending-module-generations";
const PENDING_GENERATION_MAX_AGE_MS = 30 * 60 * 1000;
const TASK_TIMELINE_COLLAPSED_ITEMS = 3;
const ACCEPTED_ITEM_OVERRIDES_STORAGE_KEY = "accepted-item-overrides";
const TASK_STAGE_PRESENTATION = {
  module_bootstrap: {
    label: "正在提炼模块 Skill",
    message: "当前文档类型缺少 module skill，系统正在通过 Hermes 冷启动提炼模块级写作能力。"
  },
  module_bootstrap_analyze: {
    label: "正在分析模块输入并提炼模块主题",
    message: "本机 Hermes 正在分析资产、锚点和短名单，提炼模块主题与写作焦点。"
  },
  module_bootstrap_generate: {
    label: "正在生成模块 Skill",
    message: "本机 Hermes 正在把冷启动分析整理成兼容现有 skill 库的 module knowledge。"
  },
  module_profile_persist: {
    label: "正在写入模块 Skill",
    message: "后端正在写入当前文档类型的 module skill，并刷新本次任务的 skill bundle。"
  },
  anchor_index_build: {
    label: "正在构建引用锚点",
    message: "本机 Hermes 正在读取资产并建立可复用的引用锚点。"
  },
  effective_skill_resolve: {
    label: "正在解析生效技能并生成 Skill 包",
    message: "后端正在解析全量有效 skill，并为本次任务生成本地 Skill 包。"
  },
  atom_recall: {
    label: "正在生成推荐技能短名单",
    message: "后端正在基于锚点生成推荐 skill shortlist，供 Hermes 优先读取。"
  },
  skill_manifest_read: {
    label: "正在读取 Skill 清单",
    message: "本机 Hermes 正在读取本次任务的 Skill 清单与推荐项。"
  },
  skill_chunk_read: {
    label: "正在补读 Skill 正文",
    message: "本机 Hermes 正在按需补读当前任务的 Skill 正文分片。"
  },
  outline_build: {
    label: "正在生成提纲",
    message: "本机 Hermes 正在结合锚点和 Skill 约束生成软件需求提纲。"
  },
  content_generate: {
    label: "正在生成正式内容",
    message: "本机 Hermes 正在基于锚点、Skill 约束和提纲生成正式软件需求。"
  },
  content_generate_returned: {
    label: "模型已返回，正在解析引用锚点",
    message: "本机 Hermes 已返回结果，后端正在校验 sourceAnchorIds 并准备回填来源引用。"
  },
  reference_resolve: {
    label: "正在回填来源引用",
    message: "后端正在把 sourceAnchorIds 解析回前端可直接展示的来源引用。"
  },
  post_process: {
    label: "模型已返回，正在后处理",
    message: "本机 Hermes 已返回结果，后端正在校验引用、执行规则检查并准备保存结果。"
  }
};
let taskPollTimer = 0;
const state = {
  currentProjectId: "",
  currentModuleId: "",
  rejectContext: null,
  rejectSubmitting: false,
  acceptedEditContext: null,
  activeWorkspaceTab: "",
  acceptedDragContext: null,
  suppressAcceptedClickUntil: 0,
  taskProgressExpandedTaskId: "",
  taskProgressExpanded: false,
  taskAgentRuntimeExpandedTaskId: "",
  taskAgentRuntimeExpanded: false,
  feedbackHistory: {
    tasks: [],
    selectedTaskId: "",
    progressExpandedTaskId: "",
    progressExpanded: false,
    runtimeExpandedTaskId: "",
    runtimeExpanded: false
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
feedbackHistoryTaskDetailRoot?.addEventListener("click", handleFeedbackHistoryDetailClick);
moduleAssetPreviewClose?.addEventListener("click", () => moduleAssetPreviewDialog?.close());
moduleAssetPreviewDialog?.addEventListener("click", (event) => {
  if (event.target === moduleAssetPreviewDialog) {
    moduleAssetPreviewDialog.close();
  }
});
moduleRecordReviewClose?.addEventListener("click", () => moduleRecordReviewDialog?.close());
moduleRecordReviewDialog?.addEventListener("click", (event) => {
  if (event.target === moduleRecordReviewDialog) {
    moduleRecordReviewDialog.close();
  }
});
moduleRecordReviewWorkOrder?.addEventListener("click", () => {
  const workOrderId = moduleRecordReviewWorkOrder.dataset.workOrderId || "";
  if (!workOrderId) return;
  window.location.href = `/skill-management?view=work-orders&workOrderId=${encodeURIComponent(workOrderId)}`;
});
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
  const skillInitModeInputs = [...document.querySelectorAll('input[name="skillInitMode"]')];
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

  const getSelectedSkillInitMode = () =>
    skillInitModeInputs.find((input) => input.checked)?.value === "cold_start" ? "cold_start" : "import_existing";

  const syncModuleSkillKeyFromName = () => {
    if (!moduleSkillKeyInput) return;
    moduleSkillKeyInput.value = nameInput?.value?.trim() || "";
  };

  const setSelectedSkillInitMode = (value) => {
    const normalized = value === "cold_start" ? "cold_start" : "import_existing";
    skillInitModeInputs.forEach((input) => {
      input.checked = input.value === normalized;
    });
  };

  const describeBootstrapRequirements = () => {
    const labels = (preview?.missingBootstrapAssets || []).map((item) => bootstrapAssetLabel(item.label));
    return labels.length ? labels.join(" / ") : "系统需求文件 / 模型/代码输入 / 对应文档类型优秀范例";
  };

  const syncSkillInitModeUi = () => {
    const usesImportedSkill = getSelectedSkillInitMode() === "import_existing";
    const hasCandidates = Boolean(preview?.skillCandidates?.length);

    candidateSelect.disabled = !usesImportedSkill;
    candidateSelect.required = usesImportedSkill;
    if (candidateSelect.options.length) {
      candidateSelect.options[0].textContent = usesImportedSkill ? "请选择一个已有 Module Skill" : "当前模式不会绑定已有 Module Skill";
    }

    if (usesImportedSkill) {
      previewHint.textContent = hasCandidates
        ? "已找到可复用的 module skill 候选；选择后创建的模块会直接绑定已有能力。"
        : "当前没有直接命中的可复用 module skill；如果仍要创建，可切换到冷启动模式。";
      bootstrapRoot.textContent = hasCandidates
        ? "如果当前候选不合适，也可以切换到冷启动模式，后续在软件需求生成前先做技能冷启动。"
        : `当前没有候选 Module Skill。若切换到冷启动模式，首次软件需求生成前至少需要：${describeBootstrapRequirements()}`;
      return;
    }

    previewHint.textContent = "当前模块会以冷启动模式创建；进入软件需求生成时会先被引导完成一次技能冷启动。";
    bootstrapRoot.textContent = `模块会以冷启动模式创建；首次软件需求生成前至少需要：${describeBootstrapRequirements()}`;
  };

  setSelectedSkillInitMode(
    existingModule?.skillInitMode || (existingModule?.skillSource?.type === "module_profile" ? "import_existing" : "cold_start")
  );
  skillInitModeInputs.forEach((input) => {
    input.addEventListener("change", syncSkillInitModeUi);
  });

  const refreshPreview = async () => {
    const name = nameInput?.value?.trim() || "";
    const description = descriptionInput?.value?.trim() || "";
    const moduleSkillKey = moduleSkillKeyInput?.value?.trim() || "";

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

    domainSelect.innerHTML = (preview.recommendedDomains || [])
      .map((item, index) => `<option value="${escapeHtml(item.domain)}" ${index === 0 ? "selected" : ""}>${escapeHtml(item.domain)}</option>`)
      .join("") || '<option value="embedded_vcu">embedded_vcu</option>';

    if (isEditing && existingModule?.domain) {
      domainSelect.value = existingModule.domain;
    }

    candidateSelect.innerHTML = ['<option value="">请选择一个已有 Module Skill</option>']
      .concat(
        (preview.skillCandidates || []).map(
          (item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.key)} / ${escapeHtml(item.domain)} / score ${item.score}</option>`
        )
      )
      .join("");

    if (isEditing) {
      candidateSelect.value = existingModule?.skillSource?.type === "module_profile" ? existingModule.skillSource.key || "" : "";
    }
    if (!name) {
      previewHint.textContent = "未填写模块名称时，先展示库内全部 Module Skill；填写后会自动同步 Module Skill Key，并把更相关的候选排在前面。";
      bootstrapRoot.textContent = "如果不导入已有 skill，后续生成前需要上传系统需求、模型/代码输入和对应文档类型的人工优秀范例。";
    }
    syncSkillInitModeUi();
  };

  const queuePreview = () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      refreshPreview().catch(handleError);
    }, 200);
  };

  nameInput?.addEventListener("input", () => {
    syncModuleSkillKeyFromName();
    queuePreview();
  });
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
      payload.skillInitMode = getSelectedSkillInitMode();
      if (payload.skillInitMode === "import_existing") {
        if (!payload.importedSkillKey) {
          throw new Error("请选择一个候选 Module Skill，或切换到冷启动模式。");
        }
        payload.skillStatus = "imported";
        payload.skillSource = {
          type: "module_profile",
          key: payload.importedSkillKey
        };
      } else {
        payload.importedSkillKey = "";
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
    document_extractor: {
      title: "文档提取",
      subtitle: "在当前模块页内上传图片或粘贴文本，并将提取结果直接写回模块资产。",
      url: `/document-extractor?projectId=${projectId}&moduleId=${moduleId}`,
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
          .card { border-radius: 18px !important; box-shadow: none !important; }
          .panel-grid { gap: 14px !important; }
          .card:not(.workbench-strip) { padding: 20px !important; }
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

function expandWorkspaceFrameForFeedbackDialog() {
  if (!workspaceFrame) {
    return;
  }

  const preferredHeight = Math.max(820, Math.min(1040, (window.innerHeight || 900) - 96));
  workspaceFrame.style.height = `${preferredHeight}px`;
  workspaceFrame.closest(".module-workspace-panel")?.scrollIntoView({
    block: "start",
    behavior: "smooth"
  });
}

function openModuleRecordReviewOverlay({ title = "", subtitleHtml = "", detailHtml = "", workOrderId = "" } = {}) {
  if (!moduleRecordReviewDialog || !moduleRecordReviewTitle || !moduleRecordReviewMeta || !moduleRecordReviewContent) {
    return;
  }

  moduleRecordReviewTitle.textContent = title || "Replay 详情";
  moduleRecordReviewMeta.innerHTML = subtitleHtml || "";
  moduleRecordReviewContent.innerHTML = detailHtml || '<div class="empty-state">当前没有可展示的审阅内容。</div>';
  moduleRecordReviewContent.scrollTop = 0;
  if (moduleRecordReviewWorkOrder) {
    moduleRecordReviewWorkOrder.hidden = !workOrderId;
    moduleRecordReviewWorkOrder.dataset.workOrderId = workOrderId || "";
  }
  moduleRecordReviewDialog.showModal();
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

function getAcceptedItemOverridesStorageKey(projectId, moduleId, documentType) {
  return `${ACCEPTED_ITEM_OVERRIDES_STORAGE_KEY}:${projectId}:${moduleId}:${documentType}`;
}

function readAcceptedItemOverrides(projectId, moduleId, documentType) {
  try {
    const raw = window.localStorage.getItem(getAcceptedItemOverridesStorageKey(projectId, moduleId, documentType));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Failed to read accepted item overrides", error);
    return {};
  }
}

function writeAcceptedItemOverrides(projectId, moduleId, documentType, overrides) {
  try {
    window.localStorage.setItem(getAcceptedItemOverridesStorageKey(projectId, moduleId, documentType), JSON.stringify(overrides || {}));
  } catch (error) {
    console.warn("Failed to write accepted item overrides", error);
  }
}

function updateAcceptedItemOverride(projectId, moduleId, documentType, itemId, value) {
  const overrides = readAcceptedItemOverrides(projectId, moduleId, documentType);
  overrides[itemId] = {
    ...(overrides[itemId] || {}),
    ...value,
    updatedAt: new Date().toISOString()
  };
  writeAcceptedItemOverrides(projectId, moduleId, documentType, overrides);
}

function clearAcceptedItemOverride(projectId, moduleId, documentType, itemId) {
  const overrides = readAcceptedItemOverrides(projectId, moduleId, documentType);
  if (!overrides[itemId]) {
    return;
  }
  delete overrides[itemId];
  writeAcceptedItemOverrides(projectId, moduleId, documentType, overrides);
}

function resolveAcceptedItemContent(item, projectId, moduleId) {
  const overrides = readAcceptedItemOverrides(projectId, moduleId, item.documentType);
  const override = overrides[item.id] || {};
  const currentContent = item.currentContent || {};
  const acceptedSnapshot = item.acceptedSnapshot || {};
  const itemTitle = String(
    override.itemTitle ||
      override.title ||
      currentContent.itemTitle ||
      currentContent.title ||
      acceptedSnapshot.itemTitle ||
      acceptedSnapshot.title ||
      ""
  ).trim();
  const sectionTitle = String(
    override.sectionTitle ||
      currentContent.sectionTitle ||
      acceptedSnapshot.sectionTitle ||
      ""
  ).trim();
  return {
    ...acceptedSnapshot,
    ...currentContent,
    ...override,
    itemTitle,
    title: itemTitle,
    sectionTitle,
    requirementText: String(
      override.requirementText ||
        currentContent.requirementText ||
        acceptedSnapshot.requirementText ||
        ""
    ).trim()
  };
}

function normalizeSectionGroupTitle(value, fallback = "未分组章节") {
  const text = String(value || "").trim();
  return text || fallback;
}

function groupItemsBySectionTitle(items = [], getSectionTitle = (item) => item.sectionTitle) {
  const groups = [];
  const groupMap = new Map();

  for (const item of items) {
    const sectionTitle = normalizeSectionGroupTitle(getSectionTitle(item));
    if (!groupMap.has(sectionTitle)) {
      const group = { sectionTitle, items: [] };
      groupMap.set(sectionTitle, group);
      groups.push(group);
    }
    groupMap.get(sectionTitle).items.push(item);
  }

  return groups;
}

function getAcceptedItemTitle(item, projectId, moduleId) {
  return resolveAcceptedItemContent(item, projectId, moduleId).itemTitle || "未命名条目";
}

function getAcceptedItemSectionTitle(item, projectId, moduleId) {
  return normalizeSectionGroupTitle(resolveAcceptedItemContent(item, projectId, moduleId).sectionTitle);
}

function getResultItemSectionTitle(item) {
  return normalizeSectionGroupTitle(item.sectionTitle || item.currentContent?.sectionTitle || item.acceptedSnapshot?.sectionTitle);
}

function getResultItemTitle(item) {
  return String(item.itemTitle || item.title || item.currentContent?.itemTitle || item.currentContent?.title || item.acceptedSnapshot?.itemTitle || item.acceptedSnapshot?.title || "未命名条目").trim() || "未命名条目";
}

function escapeCssSelectorValue(value = "") {
  const text = String(value || "");
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(text);
  }
  return text.replace(/["\\]/g, "\\$&");
}

async function renderModuleDetailPage() {
  const projectId = getPathPart(1);
  const moduleId = getPathPart(3);
  state.currentProjectId = projectId;
  state.currentModuleId = moduleId;
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
      highlightedTask?.historyKind === "extraction"
        ? highlightedTask.status === "completed"
          ? "提取任务已完成，结果已经出现在历史任务列表中。"
          : "提取任务已启动，已加入模块历史任务，你可以在右侧统一查看。"
        : highlightedTask?.status === "completed"
          ? "生成任务已完成，结果已经出现在历史任务列表中。"
          : "生成任务已启动，系统正在处理中，你可以留在这里等待结果刷新。"
    );
  } else if (highlightedTask?.status === "running") {
    setStatus(highlightedTask.historyKind === "extraction" ? "当前有一个提取任务正在执行，列表会自动刷新。" : "当前有一个生成任务正在执行，列表会自动刷新。");
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

  if (params.get("openHistory") === "1") {
    openHistoryDrawer();
  }

  ensureTaskPolling(module, pendingGeneration);
}

function renderAcceptedList(module, projectId) {
  const acceptedList = document.querySelector("#accepted-list");
  const items = collectAcceptedItems(module).map((item) => ({
    ...item,
    resolvedContent: resolveAcceptedItemContent(item, projectId, module.id)
  }));
  const domainGroups = [
    {
      documentType: "software_requirement",
      title: "软件需求",
      description: "展示已确认的软件需求条目，并按章节标题继续分组。"
    },
    {
      documentType: "detail_design",
      title: "详细设计",
      description: "展示已确认的详细设计结果，并按章节标题继续分组。"
    },
    {
      documentType: "hil_test_case",
      title: "HIL 用例",
      description: "展示已确认的 HIL 用例结果，并按章节标题继续分组。"
    }
  ];

  acceptedList.innerHTML = domainGroups
    .map((group) => {
      const groupItems = items.filter((item) => item.documentType === group.documentType);
      const sectionGroups = groupItems.length
        ? groupItems.reduce((groups, item) => {
            const sectionTitle = normalizeSectionGroupTitle(item.resolvedContent.sectionTitle);
            let groupEntry = groups.find((entry) => entry.sectionTitle === sectionTitle);
            if (!groupEntry) {
              groupEntry = { sectionTitle, items: [] };
              groups.push(groupEntry);
            }
            groupEntry.items.push(item);
            return groups;
          }, [])
        : [];

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
            sectionGroups.length
              ? sectionGroups
                  .map(
                    (sectionGroup) => `
                      <article class="stack-card accepted-section-group" data-accepted-section-title="${escapeAttribute(sectionGroup.sectionTitle)}">
                        <div class="accepted-domain-head accepted-section-head">
                          <div>
                            <h3>${escapeHtml(sectionGroup.sectionTitle)}</h3>
                            <p class="muted">组内结果可按需要继续编辑标题和正文。</p>
                          </div>
                          <span class="accepted-domain-count">${sectionGroup.items.length} 条</span>
                        </div>
                        <div class="stack-list accepted-section-list">
                          ${sectionGroup.items
                            .map((item) => {
                              const content = item.resolvedContent;
                              return `
                                <article
                                  class="stack-card accepted-result-card clickable"
                                  data-open-accepted-source="${item.id}"
                                  data-accepted-item-id="${item.id}"
                                  data-accepted-document-type="${item.documentType}"
                                  data-accepted-section-title="${escapeAttribute(sectionGroup.sectionTitle)}"
                                  draggable="true"
                                >
                                  <div class="accepted-result-topline">
                                    <span class="doc-badge">${escapeHtml(documentLabel(item.documentType))}</span>
                                    <span class="status-badge accepted">已采纳</span>
                                    <span class="accepted-result-code">${escapeHtml(content.requirementId || "未编号")}</span>
                                    <span class="accepted-result-code">${escapeHtml(content.type || "functional")}</span>
                                    <span class="accepted-result-code">来源任务 ${escapeHtml(shortId(item.sourceTaskId))}</span>
                                    <span class="accepted-result-code">拖动排序</span>
                                    <span class="accepted-result-hint">点击查看原生成结果</span>
                                  </div>
                                  <strong>${escapeHtml(content.itemTitle || content.title || "已采纳结果")}</strong>
                                  <div class="card-meta">
                                    <span>更新时间 ${formatDateTime(item.updatedAt)}</span>
                                    <span>置信度 ${escapeHtml(String(content.confidence ?? "--"))}</span>
                                  </div>
                                  <div class="accepted-result-body accepted-content">${formatReadableRequirementHtml(content.requirementText || "")}</div>
                                  <div class="accepted-result-summary">
                                    ${buildAcceptedSummaryChips(module, { ...item, currentContent: content })}
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
                                      data-item-title="${escapeAttribute(content.itemTitle || content.title || "已采纳结果")}"
                                    >删除</button>
                                  </div>
                                </article>
                              `;
                            })
                            .join("")}
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
        clearAcceptedItemOverride(projectId, module.id, documentType, acceptedItemId);
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
        documentType: card.dataset.acceptedDocumentType || "",
        sectionTitle: card.dataset.acceptedSectionTitle || ""
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
      if (state.acceptedDragContext.sectionTitle !== (card.dataset.acceptedSectionTitle || "")) {
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
      if (state.acceptedDragContext.sectionTitle !== (card.dataset.acceptedSectionTitle || "")) {
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
      const sectionTitle = card.dataset.acceptedSectionTitle || "";
      const orderedIds = Array.from(
        acceptedList.querySelectorAll(
          `[data-accepted-document-type="${documentType}"][data-accepted-section-title="${escapeCssSelectorValue(sectionTitle)}"]`
        )
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
        setStatus(`已更新${documentLabel(documentType)}·${sectionTitle} 组内已采纳结果顺序。`);
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
          <span class="doc-badge">文档生成</span>
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
    taskList.innerHTML = '<div class="empty-state">当前还没有历史任务。</div>';
    return;
  }

  cards.push(
    ...tasks.map(
      (task) => `
        <article class="stack-card" data-task-id="${task.id}">
          <div class="inline-actions">
            <span class="doc-badge">${escapeHtml(taskKindLabel(task))}</span>
            <span class="doc-badge">${escapeHtml(taskDocumentLabel(task))}</span>
            <span class="status-badge ${statusTone(task.status)}">${escapeHtml(translateStatus(task.status))}</span>
          </div>
          <strong>${escapeHtml(taskCardTitle(task))}</strong>
          <div class="card-meta">
            ${renderTaskCardMeta(task)}
          </div>
          ${
            task.status === "running" || task.status === "queued"
              ? `<p class="inline-hint">${escapeHtml(
                  task.progress?.message || (task.status === "queued" ? "任务已进入 Hermes 队列，等待开始处理。" : taskRunningHint(task))
                )}${task.progress?.percent ? `（${Math.round(task.progress.percent)}%）` : ""}</p>`
              : ""
          }
          ${task.status === "failed" ? `<p class="inline-hint">${escapeHtml(task.summary || taskFailedHint(task))}</p>` : ""}
          <div class="inline-actions">
            ${
              task.historyKind === "extraction"
                ? `
                  <a
                    class="primary-link"
                    href="/document-extractor?projectId=${projectId}&moduleId=${module.id}&highlightTaskId=${task.id}"
                    data-open-task-detail="true"
                  >前往提取页</a>
                  ${
                    task.outputAssetId
                      ? `
                        <button
                          class="secondary-button"
                          type="button"
                          data-open-task-asset-preview="${task.outputAssetId}"
                          data-task-asset-name="${escapeAttribute(task.outputAssetName || "")}"
                          data-task-asset-role="document_extraction"
                        >打开预览</button>
                      `
                      : ""
                  }
                `
                : `<a class="primary-link" href="/projects/${projectId}/modules/${module.id}/tasks/${task.id}?documentType=${task.documentType}" data-open-task-detail="true">查看详情</a>`
            }
            <button
              class="secondary-button"
              type="button"
              data-delete-task="${task.id}"
              data-task-family="${task.historyKind}"
              data-document-type="${task.documentType}"
              data-task-status="${task.status}"
              data-task-label="${escapeAttribute(taskCardTitle(task))}"
            >删除任务</button>
          </div>
        </article>
      `
    )
  );

  taskList.innerHTML = cards.join("");

  taskList.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.deleteTask || "";
      const taskFamily = button.dataset.taskFamily || "generation";
      const documentType = button.dataset.documentType || "software_requirement";
      const taskStatus = button.dataset.taskStatus || "";
      const taskLabel = button.dataset.taskLabel || "该任务";

      const confirmed = window.confirm(
        taskFamily === "extraction"
          ? `确认删除“${taskLabel}”吗？这只会删除任务记录，已生成的模块资产会保留。`
          : `确认删除“${taskLabel}”吗？该任务下已采纳的结果也会一并移除。`
      );
      if (!confirmed) {
        return;
      }

      try {
        await request(
          taskFamily === "extraction"
            ? `/api/projects/${projectId}/modules/${module.id}/document-extraction-tasks/${taskId}`
            : `/api/projects/${projectId}/modules/${module.id}/spaces/${documentType}/tasks/${taskId}`,
          {
            method: "DELETE"
          }
        );
        if (taskFamily !== "extraction") {
          clearPendingGeneration(projectId, module.id, documentType);
        }
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

  taskList.querySelectorAll("[data-open-task-asset-preview]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await openModuleAssetPreview(projectId, module.id, {
          assetId: button.dataset.openTaskAssetPreview || "",
          assetName: button.dataset.taskAssetName || "",
          assetRole: button.dataset.taskAssetRole || ""
        });
      } catch (error) {
        handleError(error);
      }
    });
  });
}

async function renderTaskDetailPage() {
  const pathInfo = parseTaskDetailPath();
  const { projectId, moduleId, taskId, pathDocumentType } = pathInfo;
  const params = new URLSearchParams(window.location.search);
  const preferredDocumentType = params.get("documentType") || pathDocumentType;
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
  const shouldCollapseTimeline = isTerminalTaskStatus(task.status) && timeline.length > TASK_TIMELINE_COLLAPSED_ITEMS;
  const isExpanded =
    state.taskProgressExpandedTaskId === task.id ? state.taskProgressExpanded : !shouldCollapseTimeline;
  const visibleTimeline = isExpanded ? timeline : timeline.slice(0, TASK_TIMELINE_COLLAPSED_ITEMS);
  const hiddenTimelineCount = Math.max(0, timeline.length - visibleTimeline.length);

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
      ${
        shouldCollapseTimeline
          ? `<div class="timeline-toggle-row">
              <span class="timeline-toggle-hint">${
                isExpanded ? "已展开全部执行历史。" : `已自动折叠较早历史，隐藏 ${hiddenTimelineCount} 条更新。`
              }</span>
              <button type="button" class="secondary-button timeline-toggle-button" data-toggle-task-progress>
                ${isExpanded ? "只看最近进度" : "展开全部进度"}
              </button>
            </div>`
          : ""
      }
      <div class="timeline-list">
        ${
          visibleTimeline.length
            ? visibleTimeline
                .map((entry) => {
                  const stageDetails = describeTaskStage(entry.stage, entry.label, entry.message);
                  return `
                    <article class="timeline-item ${escapeHtml(entry.level || "info")}">
                      <time>${escapeHtml(formatDateTime(entry.at))}</time>
                      <strong>${escapeHtml(stageDetails.label)}</strong>
                      <div>${escapeHtml(stageDetails.message)}</div>
                    </article>
                  `;
                })
                .join("")
            : '<div class="empty-state">任务启动后，这里会持续显示阶段进度与关键日志。</div>'
        }
      </div>
    </div>
  `;

  const toggleButton = taskProgress.querySelector("[data-toggle-task-progress]");
  toggleButton?.addEventListener("click", () => {
    state.taskProgressExpandedTaskId = task.id;
    state.taskProgressExpanded = !isExpanded;
    renderTaskProgress(task);
  });
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

function formatTokenCount(value) {
  const number = Number(value || 0) || 0;
  if (number <= 0) {
    return "--";
  }
  if (number < 1000) {
    return `${number}`;
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: number >= 100000 ? 0 : 1
  }).format(number);
}

function formatUsdAmount(value) {
  if (value == null || value === "") {
    return "--";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  return `$${number.toFixed(4)}`;
}

function deriveVisibleTaskProgress(task) {
  const base = task.progress || {};
  const agent = task.debug?.agent || {};
  const stagePresentation = TASK_STAGE_PRESENTATION[String(base.stage || "").trim()] || null;
  if (task.status === "running" && agent.status === "completed") {
    return {
      ...base,
      stage: "post_process",
      label: TASK_STAGE_PRESENTATION.post_process.label,
      message: TASK_STAGE_PRESENTATION.post_process.message,
      percent: Math.max(Number(base.percent || 0), 84)
    };
  }
  return {
    ...base,
    label: base.label || stagePresentation?.label || "",
    message: base.message || stagePresentation?.message || ""
  };
}

function isTerminalTaskStatus(status = "") {
  return ["completed", "failed", "cancelled"].includes(String(status || "").trim());
}

function describeTaskStage(stage = "", fallbackLabel = "", fallbackMessage = "") {
  const presentation = TASK_STAGE_PRESENTATION[String(stage || "").trim()] || null;
  return {
    label: fallbackLabel || presentation?.label || stage || "进度更新",
    message: fallbackMessage || presentation?.message || ""
  };
}

function buildAgentRuntimeMeta(event) {
  const meta = [];
  if (event.stepType) meta.push(`step: ${describeTaskStage(event.stepType).label}`);
  if (event.status) meta.push(`status: ${event.status}`);
  if (event.sessionId) meta.push(`session: ${event.sessionId}`);
  if (event.elapsedMs) meta.push(`耗时 ${Math.round(event.elapsedMs / 1000)} 秒`);
  if (event.tokenUsage?.totalTokens) meta.push(`tokens ${formatTokenCount(event.tokenUsage.totalTokens)}`);
  return meta;
}

function renderTaskAgentRuntime(task) {
  const runtimeRoot = document.querySelector("#task-agent-runtime");
  if (!runtimeRoot) {
    return;
  }

  const debug = task.debug || {};
  const agent = debug.agent || {};
  const tokenUsage = agent.tokenUsage || null;
  const taskSkillBundle = debug.artifacts?.taskSkillBundle || null;
  const events = Array.isArray(debug.events)
    ? [...debug.events]
        .filter((event) => event.type === "agent_runtime" || event.transport || event.sessionId || event.stdoutExcerpt || event.stderrExcerpt)
        .reverse()
    : [];
  const isHermesTask = String(task.llmProfile?.executionMode || "").startsWith("hermes_agent");
  const shouldCollapseEvents = isTerminalTaskStatus(task.status) && events.length > TASK_TIMELINE_COLLAPSED_ITEMS;
  const isExpanded =
    state.taskAgentRuntimeExpandedTaskId === task.id ? state.taskAgentRuntimeExpanded : !shouldCollapseEvents;
  const visibleEvents = isExpanded ? events : events.slice(0, TASK_TIMELINE_COLLAPSED_ITEMS);
  const hiddenEventCount = Math.max(0, events.length - visibleEvents.length);

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
          <strong>${escapeHtml(describeTaskStage(agent.currentStep || task.progress?.stage).label || "--")}</strong>
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
        <article class="agent-runtime-card">
          <span>总 Token</span>
          <strong>${escapeHtml(formatTokenCount(tokenUsage?.totalTokens))}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>输入 Token</span>
          <strong>${escapeHtml(formatTokenCount(tokenUsage?.inputTokens))}</strong>
        </article>
        <article class="agent-runtime-card">
          <span>输出 Token</span>
          <strong>${escapeHtml(formatTokenCount(tokenUsage?.outputTokens))}</strong>
        </article>
      </div>
      <div class="agent-runtime-excerpts">
        ${
          tokenUsage
            ? `<article class="agent-runtime-excerpt">
                <strong>Token 使用统计</strong>
                <pre>${escapeHtml(
                  [
                    `model: ${tokenUsage.model || agent.model || "--"}`,
                    `inputTokens: ${tokenUsage.inputTokens || 0}`,
                    `outputTokens: ${tokenUsage.outputTokens || 0}`,
                    `cacheReadTokens: ${tokenUsage.cacheReadTokens || 0}`,
                    `cacheWriteTokens: ${tokenUsage.cacheWriteTokens || 0}`,
                    `reasoningTokens: ${tokenUsage.reasoningTokens || 0}`,
                    `totalTokens: ${tokenUsage.totalTokens || 0}`,
                    `estimatedCostUsd: ${formatUsdAmount(tokenUsage.estimatedCostUsd)}`,
                    `costStatus: ${tokenUsage.costStatus || "--"}`,
                    tokenUsage.contextTokens
                      ? `context: ${tokenUsage.contextTokens}/${tokenUsage.contextLength || "--"} (${tokenUsage.contextPercent ?? "--"}%)`
                      : ""
                  ]
                    .filter(Boolean)
                    .join("\n")
                )}</pre>
              </article>`
            : ""
        }
        ${
          taskSkillBundle
            ? `<article class="agent-runtime-excerpt">
                <strong>Task Skill Bundle</strong>
                <pre>${escapeHtml(
                  [
                    `skillBundlePath: ${taskSkillBundle.skillBundlePath || "--"}`,
                    `skillManifestPath: ${taskSkillBundle.skillManifestPath || "--"}`,
                    `effectiveSkillCount: ${taskSkillBundle.effectiveSkillCount || 0}`,
                    `recommendedSkillCodesCount: ${(taskSkillBundle.recommendedSkillCodes || []).length}`
                  ].join("\n")
                )}</pre>
              </article>`
            : ""
        }
        <article class="agent-runtime-excerpt">
          <strong>最近一次 stdout 摘要</strong>
          <pre>${escapeHtml(agent.stdoutExcerpt || "暂无 stdout 摘要")}</pre>
        </article>
        <article class="agent-runtime-excerpt">
          <strong>最近一次 stderr 摘要</strong>
          <pre>${escapeHtml(agent.stderrExcerpt || "暂无 stderr 摘要")}</pre>
        </article>
      </div>
      ${
        shouldCollapseEvents
          ? `<div class="timeline-toggle-row">
              <span class="timeline-toggle-hint">${
                isExpanded ? "已展开全部 Agent 运行事件。" : `已自动折叠较早日志，隐藏 ${hiddenEventCount} 条事件。`
              }</span>
              <button type="button" class="secondary-button timeline-toggle-button" data-toggle-agent-runtime>
                ${isExpanded ? "只看最近日志" : "展开全部日志"}
              </button>
            </div>`
          : ""
      }
      <div class="agent-runtime-list">
        ${
          visibleEvents.length
            ? visibleEvents
                .slice(0, 20)
                .map((event) => {
                  const meta = buildAgentRuntimeMeta(event);
                  const stageDetails = describeTaskStage(event.stepType, event.label, event.message);
                  return `
                    <article class="agent-runtime-item ${escapeHtml(event.level || "info")}">
                      <time>${escapeHtml(formatDateTime(event.at))}</time>
                      <strong>${escapeHtml(stageDetails.label || "Agent 运行事件")}</strong>
                      <div>${escapeHtml(stageDetails.message || "")}</div>
                      ${
                        meta.length
                          ? `<div class="agent-runtime-item-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
                          : ""
                      }
                      ${
                        event.tokenUsage?.totalTokens
                          ? `<div class="agent-runtime-item-meta"><span>tokens ${escapeHtml(formatTokenCount(event.tokenUsage.totalTokens))}</span></div>`
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

  const toggleButton = runtimeRoot.querySelector("[data-toggle-agent-runtime]");
  toggleButton?.addEventListener("click", () => {
    state.taskAgentRuntimeExpandedTaskId = task.id;
    state.taskAgentRuntimeExpanded = !isExpanded;
    renderTaskAgentRuntime(task);
  });
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

function buildCollapsibleResultSection(title, countLabel, bodyHtml) {
  return `
    <details class="result-section result-section-collapsible">
      <summary>
        <strong>${escapeHtml(title)}</strong>
        <span class="result-section-summary-meta">${escapeHtml(countLabel)}</span>
      </summary>
      <div class="result-section-body">${bodyHtml}</div>
    </details>
  `;
}

function buildResultTraceBlock(task, resultItem) {
  const traces = getResultTraces(task, resultItem);
  return buildCollapsibleResultSection(
    "追溯信息",
    traces.length ? `${traces.length} 条` : "无",
    escapeHtml(traces.map((item) => `${item.fileName} @ ${item.location}`).join("\n") || "无")
  );
}

function buildResultSourceBlock(resultItem) {
  const sourceRefs = resultItem.sourceRefs || [];
  return buildCollapsibleResultSection(
    "来源片段",
    sourceRefs.length ? `${sourceRefs.length} 段` : "无",
    escapeHtml(sourceRefs.map((ref) => `${ref.fileName} @ ${ref.location}: ${ref.excerpt}`).join("\n\n") || "无")
  );
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

  const sectionGroups = groupItemsBySectionTitle(task.resultItems.map((item) => ({
    ...item,
    sectionTitle: getResultItemSectionTitle(item),
    itemTitle: getResultItemTitle(item)
  })));

  taskResults.innerHTML = sectionGroups
    .map(
      (sectionGroup) => `
        <section class="result-section-group">
          <div class="accepted-domain-head accepted-section-head">
            <div>
              <h3>${escapeHtml(sectionGroup.sectionTitle)}</h3>
              <p class="muted">同一章节下的结果可以逐条编辑后再采纳。</p>
            </div>
            <span class="accepted-domain-count">${sectionGroup.items.length} 条</span>
          </div>
          <div class="stack-list result-section-list">
            ${sectionGroup.items
              .map(
                (item) => `
                  <article class="stack-card generated-result-card" data-result-item-id="${item.id}" data-result-section-title="${escapeAttribute(sectionGroup.sectionTitle)}">
                    <div class="inline-actions">
                      <span class="status-badge ${statusTone(item.review?.status || "pending")}">${escapeHtml(
                        translateStatus(item.review?.status || "pending")
                      )}</span>
                    </div>
                    <strong>${escapeHtml(item.itemTitle || item.title || item.requirementId || "未命名结果")}</strong>
                    <div class="card-meta">
                      <span data-requirement-code>${escapeHtml(item.requirementId || "未编号")}</span>
                      <span>${escapeHtml(item.type || "functional")}</span>
                      <span>置信度 ${String(item.confidence ?? "--")}</span>
                    </div>
                    <label>
                      条目标题
                      <input data-title-input="${item.id}" value="${escapeAttribute(item.itemTitle || item.title || "")}" />
                    </label>
                    <div class="generated-result-preview-wrap">
                      <div class="generated-result-preview-head">
                        <span>正文预览</span>
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
              .join("")}
          </div>
        </section>
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
    const sectionTitle = taskResults.querySelector(`[data-result-item-id="${resultItemId}"]`)?.dataset.resultSectionTitle || "";

    try {
      if (acceptButton) {
        await request(`/api/projects/${projectId}/modules/${moduleId}/spaces/${documentType}/accepted-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceTaskId: task.id,
            sourceResultItemId: resultItemId,
            sectionTitle,
            itemTitle: title,
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
  const content = resolveAcceptedItemContent(item, projectId, moduleId);
  state.acceptedEditContext = {
    projectId,
    moduleId,
    documentType: item.documentType,
    itemId: item.id
  };
  acceptedEditSubtitle.textContent = `${documentLabel(item.documentType)} · ${content.sectionTitle || "未分组章节"} · 来源任务 ${shortId(item.sourceTaskId)}`;
  acceptedEditSectionTitleInput.value = content.sectionTitle || "";
  acceptedEditItemTitleInput.value = content.itemTitle || content.title || "";
  acceptedEditTextInput.value = content.requirementText || "";
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
    return;
  }

  if (data.type === "feedback_pool:open_record_review_overlay") {
    openModuleRecordReviewOverlay(data);
    return;
  }

  if (data.type === "feedback_pool:record_detail_opened") {
    expandWorkspaceFrameForFeedbackDialog();
    return;
  }

  if (data.type === "feedback_pool:record_detail_closed") {
    scheduleWorkspaceFrameHeightSync();
    return;
  }

  if (data.type === "document_extractor:tasks_changed") {
    refreshModuleTaskHistory({
      highlightTaskId: data.taskId || "",
      statusMessage: data.status === "running" ? "新的提取任务已加入历史任务列表。" : ""
    });
  }
}

async function refreshModuleTaskHistory({ highlightTaskId = "", statusMessage = "" } = {}) {
  if (!state.currentProjectId || !state.currentModuleId || page !== "module-detail") {
    return;
  }

  try {
    const module = await request(`/api/projects/${state.currentProjectId}/modules/${state.currentModuleId}`);
    const pendingGeneration = resolvePendingGeneration(state.currentProjectId, module);
    renderTaskList(module, state.currentProjectId, pendingGeneration);
    ensureTaskPolling(module, pendingGeneration);

    if (highlightTaskId) {
      const target = document.querySelector(`[data-task-id="${highlightTaskId}"]`);
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.style.boxShadow = "0 0 0 2px rgba(14,106,168,0.28)";
      }
    }

    if (statusMessage) {
      setStatus(statusMessage);
    }
  } catch (error) {
    console.error(error);
  }
}

function handleFeedbackHistoryTaskClick(event) {
  const deleteTrigger = event.target.closest("[data-feedback-history-task-delete]");
  if (deleteTrigger) {
    const taskId = deleteTrigger.dataset.feedbackHistoryTaskDelete || "";
    if (!taskId) return;
    void deleteFeedbackHistoryTask(taskId);
    return;
  }

  const trigger = event.target.closest("[data-feedback-history-task]");
  if (!trigger) return;
  state.feedbackHistory.selectedTaskId = trigger.dataset.feedbackHistoryTask || "";
  renderFeedbackHistoryDrawer();
}

function renderFeedbackHistoryDrawer() {
  if (!feedbackHistoryTaskListRoot || !feedbackHistoryTaskDetailRoot) {
    return;
  }

  const tasks = sortFeedbackHistoryTasks(state.feedbackHistory.tasks || []);
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

function sortFeedbackHistoryTasks(tasks = []) {
  return [...tasks].sort((left, right) => {
    const leftCreatedAt = Date.parse(left?.createdAt || left?.updatedAt || "");
    const rightCreatedAt = Date.parse(right?.createdAt || right?.updatedAt || "");
    return (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) - (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0);
  });
}

function renderFeedbackHistoryTaskCard(task = {}) {
  const proposalCount = (task.proposals || []).flatMap((proposal) => proposal.items || []).length;
  const isSelected = state.feedbackHistory.selectedTaskId === task.id;
  const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
  const isRunning = normalizedStatus === "running";
  const stage = describeReplayTaskStage(task);
  const stageSummary = compactStageSummary(stage, task);
  const displayTitle = getReplayTaskDisplayTitle(task);
  const proposalText =
    normalizedStatus === "queued" || normalizedStatus === "running"
      ? "提案生成中"
      : `${proposalCount} 条提案`;
  return `
    <article class="stack-card feedback-history-task-card ${isSelected ? "is-selected" : ""} ${isRunning ? "is-running" : ""}">
      <div class="feedback-history-card-head">
        <button
          type="button"
          class="feedback-history-card-main"
          data-feedback-history-task="${escapeAttribute(task.id || "")}"
        >
          <strong>${escapeHtml(displayTitle || "Fallback 历史任务")}</strong>
          <p>${escapeHtml(task.moduleName || "未指定模块")} · ${escapeHtml(formatDateTime(task.createdAt))}</p>
        </button>
        <button
          type="button"
          class="feedback-history-card-delete"
          data-feedback-history-task-delete="${escapeAttribute(task.id || "")}"
          aria-label="删除历史任务"
        >
          删除
        </button>
      </div>
      <div class="feedback-history-stage-line">
        <span class="feedback-history-stage-pill ${escapeHtml(stage.tone || normalizedStatus || "pending")}">${escapeHtml(stage.label)}</span>
        <span>${escapeHtml(stageSummary)}</span>
      </div>
      <div class="feedback-history-meta">
        <span class="feedback-history-badge ${escapeHtml(normalizedStatus || "pending")}">${escapeHtml(translateReplayTaskStatus(normalizedStatus))}</span>
        <span>${escapeHtml(`${(task.sourceRejectionIds || []).length} 条记录`)}</span>
        <span>${escapeHtml(proposalText)}</span>
        <span>${escapeHtml(`更新于 ${formatDateTime(task.updatedAt || task.createdAt)}`)}</span>
      </div>
    </article>
  `;
}

function renderFeedbackHistoryTaskDetail(task = {}) {
  const proposalItems = (task.proposals || []).flatMap((proposal) => proposal.items || []);
  const referenceAssets = task.materialPack?.referenceAssets || [];
  const rootCauses = (task.proposals || []).flatMap((proposal) => proposal.rootCauses || []);
  const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
  const stage = describeReplayTaskStage(task);
  const tokenUsageSummary = formatReplayTokenUsageSummary(task);
  const displayTitle = getReplayTaskDisplayTitle(task);
  const displaySummary = getReplayTaskDisplaySummary(task);
  const replayDetailHref = `/replay-lab?runTaskId=${encodeURIComponent(task.id || "")}`;

  return `
    <div class="feedback-history-detail-head">
      <div>
        <p class="eyebrow">Fallback History</p>
        <h3>${escapeHtml(displayTitle || "Fallback 历史任务")}</h3>
        <p class="muted">${escapeHtml(task.moduleName || "未指定模块")} · ${escapeHtml(formatDateTime(task.createdAt))}</p>
        ${displaySummary ? `<p class="feedback-history-detail-copy feedback-history-task-summary">${escapeHtml(displaySummary)}</p>` : ""}
      </div>
      <span class="feedback-history-badge ${escapeHtml(normalizedStatus || "pending")}">${escapeHtml(translateReplayTaskStatus(normalizedStatus))}</span>
    </div>

    <div class="feedback-history-detail-actions">
      <a
        class="secondary-link feedback-history-detail-link"
        href="${escapeAttribute(replayDetailHref)}"
        target="_top"
        rel="noopener noreferrer"
      >
        查看详情页
      </a>
    </div>

    <div class="feedback-history-detail-grid">
      <article class="feedback-history-detail-card">
        <span>任务编号</span>
        <strong>${escapeHtml(task.id || "-")}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>模型</span>
        <strong>${escapeHtml(getReplayTaskEffectiveModelLabel(task))}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>驳回记录</span>
        <strong>${escapeHtml(String((task.sourceRejectionIds || []).length))}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>提案数量</span>
        <strong>${escapeHtml(String(proposalItems.length))}</strong>
      </article>
      <article class="feedback-history-detail-card">
        <span>Token 消耗</span>
        <strong>${escapeHtml(tokenUsageSummary.primary)}</strong>
        <span class="feedback-history-detail-note">${escapeHtml(tokenUsageSummary.secondary)}</span>
      </article>
    </div>

    <section class="feedback-history-detail-section">
      <h4>当前阶段</h4>
      <div class="feedback-history-detail-item feedback-history-stage-summary">
        <strong>${escapeHtml(stage.label)}</strong>
        <p>${escapeHtml(stage.message)}</p>
        <div class="feedback-history-meta">
          <span>${escapeHtml(`最近更新 ${formatDateTime(task.updatedAt || task.createdAt)}`)}</span>
          ${
            stage.elapsed
              ? `<span>${escapeHtml(`已运行 ${stage.elapsed}`)}</span>`
              : ""
          }
          ${
            stage.transport
              ? `<span>${escapeHtml(`传输 ${stage.transport}`)}</span>`
              : ""
          }
          ${
            stage.sessionId
              ? `<span>${escapeHtml(`会话 ${stage.sessionId}`)}</span>`
              : ""
          }
        </div>
      </div>
    </section>

    ${renderFeedbackHistoryProgressSection(task)}
    ${renderFeedbackHistoryRuntimeSection(task)}
    ${renderFeedbackHistoryArtifactSection(task)}

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
          : `<p class="feedback-history-detail-copy">${
              normalizedStatus === "queued" || normalizedStatus === "running"
                ? "当前还没有提案条目，这是正常过程；Hermes 返回结果后会自动显示在这里。"
                : "当前没有可展示的提案条目。"
            }</p>`
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

function handleFeedbackHistoryDetailClick(event) {
  const progressToggle = event.target.closest("[data-toggle-feedback-history-progress]");
  if (progressToggle) {
    const taskId = progressToggle.dataset.toggleFeedbackHistoryProgress || "";
    const isExpanded = state.feedbackHistory.progressExpandedTaskId === taskId ? state.feedbackHistory.progressExpanded : false;
    state.feedbackHistory.progressExpandedTaskId = taskId;
    state.feedbackHistory.progressExpanded = !isExpanded;
    renderFeedbackHistoryDrawer();
    return;
  }

  const runtimeToggle = event.target.closest("[data-toggle-feedback-history-runtime]");
  if (runtimeToggle) {
    const taskId = runtimeToggle.dataset.toggleFeedbackHistoryRuntime || "";
    const isExpanded = state.feedbackHistory.runtimeExpandedTaskId === taskId ? state.feedbackHistory.runtimeExpanded : false;
    state.feedbackHistory.runtimeExpandedTaskId = taskId;
    state.feedbackHistory.runtimeExpanded = !isExpanded;
    renderFeedbackHistoryDrawer();
  }
}

async function deleteFeedbackHistoryTask(taskId = "") {
  if (!taskId) return;
  if (!window.confirm("确认删除这条 Fallback 历史任务？删除后不会再出现在历史列表中。")) {
    return;
  }

  try {
    await request(`/api/replay-tasks/${taskId}`, { method: "DELETE" });
    if (state.currentProjectId && state.currentModuleId) {
      const params = new URLSearchParams({
        projectId: state.currentProjectId,
        moduleId: state.currentModuleId
      });
      const response = await request(`/api/replay-tasks?${params.toString()}`);
      state.feedbackHistory.tasks = response.tasks || [];
    } else {
      state.feedbackHistory.tasks = (state.feedbackHistory.tasks || []).filter((task) => task.id !== taskId);
    }
    if (state.feedbackHistory.selectedTaskId === taskId) {
      state.feedbackHistory.selectedTaskId = state.feedbackHistory.tasks[0]?.id || "";
    }
    renderFeedbackHistoryDrawer();
    setStatus("Fallback 历史任务已删除。");
  } catch (error) {
    console.error(error);
    setStatus(localizeErrorMessage(error.message || "删除历史任务失败"), true);
  }
}

async function handleAcceptedEditSubmit(event) {
  event.preventDefault();
  if (!state.acceptedEditContext) {
    return;
  }

  try {
    const sectionTitle = String(acceptedEditSectionTitleInput?.value || "").trim();
    const itemTitle = String(acceptedEditItemTitleInput?.value || "").trim();
    const requirementText = String(acceptedEditTextInput?.value || "").trim();
    await request(
      `/api/projects/${state.acceptedEditContext.projectId}/modules/${state.acceptedEditContext.moduleId}/spaces/${state.acceptedEditContext.documentType}/accepted-items/${state.acceptedEditContext.itemId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionTitle,
          itemTitle,
          title: itemTitle,
          requirementText
        })
      }
    );
    updateAcceptedItemOverride(
      state.acceptedEditContext.projectId,
      state.acceptedEditContext.moduleId,
      state.acceptedEditContext.documentType,
      state.acceptedEditContext.itemId,
      {
        sectionTitle,
        itemTitle,
        title: itemTitle,
        requirementText
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
    const formData = new FormData(rejectForm);
    setRejectSubmitting(true);
    setRejectDialogStatus("正在提交驳回，请稍候...");
    const nextItemTitle =
      state.rejectContext.root.querySelector(`[data-title-input="${state.rejectContext.resultItemId}"]`)?.value || "";
    const payload = {
      status: "rejected",
      sectionTitle: state.rejectContext.root.dataset.resultSectionTitle || "",
      itemTitle: nextItemTitle,
      title: nextItemTitle,
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
    .replace(/(?<!\d)(\d+\.\s+)/g, "\n$1")
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
    if (/^\d+\.\s+/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }

    flushList();

    parts.push(`<p class="${/^(注：|说明：)/.test(line) ? "accepted-note" : "accepted-paragraph"}">${escapeHtml(line)}</p>`);
  }

  flushList();
  return parts.join("");
}

function collectTasks(module) {
  const generationTasks = ["software_requirement", "detail_design", "hil_test_case"]
    .flatMap((documentType) =>
      (module.documentSpaces?.[documentType]?.generationTasks || []).map((task) => ({
        ...task,
        documentType,
        historyKind: task.taskKind === "module_skill_bootstrap" ? "bootstrap" : "generation"
      }))
    );
  const documentExtractionTasks = (module.documentExtractionTasks || []).map((task) => ({
    ...task,
    documentType: task.targetDocumentType,
    historyKind: "extraction",
    taskKind: "document_extraction"
  }));

  return [...generationTasks, ...documentExtractionTasks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function countTasks(module) {
  return collectTasks(module).length;
}

function taskKindLabel(task = {}) {
  if (task.historyKind === "extraction") return "文档提取";
  if (task.historyKind === "bootstrap") return "技能冷启动";
  return "文档生成";
}

function taskDocumentLabel(task = {}) {
  return documentLabel(task.documentType);
}

function taskCardTitle(task = {}) {
  if (task.summary) {
    return task.summary;
  }
  if (task.historyKind === "extraction") {
    return `${taskDocumentLabel(task)}提取任务`;
  }
  if (task.historyKind === "bootstrap") {
    return `${taskDocumentLabel(task)}技能冷启动任务`;
  }
  return `${taskDocumentLabel(task)}任务`;
}

function taskRunningHint(task = {}) {
  if (task.historyKind === "extraction") {
    return "任务已启动，正在提取中，完成后会自动刷新列表。";
  }
  if (task.historyKind === "bootstrap") {
    return "任务已启动，正在进行技能冷启动，完成后会自动刷新列表。";
  }
  return "任务已启动，正在生成中，完成后会自动刷新列表。";
}

function taskFailedHint(task = {}) {
  if (task.historyKind === "extraction") {
    return "提取任务执行失败，请重新发起或检查输入。";
  }
  return "任务执行失败，请重试。";
}

function renderTaskCardMeta(task = {}) {
  const meta = [`<span>执行时间 ${formatDateTime(task.createdAt)}</span>`];
  if (task.historyKind === "extraction") {
    const inputCount = (task.inputArtifacts || []).length + (task.sourceText ? 1 : 0);
    meta.push(`<span>输入 ${inputCount} 份材料</span>`);
    meta.push(`<span>来源 ${escapeHtml(extractionSourceModeLabel(task.sourceMode))}</span>`);
    meta.push(`<span>产物 ${escapeHtml(task.outputAssetName || "等待生成")}</span>`);
  } else {
    meta.push(`<span>结果数 ${(task.resultItems || []).length}</span>`);
    meta.push(`<span>模型 ${escapeHtml(task.llmProfile?.name || "本地回退")}</span>`);
    meta.push(`<span>输入 ${(task.inputAssetIds || []).length} 个资产</span>`);
  }
  return meta.join("");
}

function extractionSourceModeLabel(sourceMode = "") {
  if (sourceMode === "image") return "仅图片";
  if (sourceMode === "spreadsheet") return "仅表格";
  if (sourceMode === "mixed") return "混合输入";
  return "仅文本";
}

async function openModuleAssetPreview(projectId, moduleId, { assetId, assetName, assetRole } = {}) {
  if (!assetId) {
    return;
  }
  moduleAssetPreviewTitle.textContent = assetName || "任务资产预览";
  moduleAssetPreviewMeta.textContent = `${assetRole === "document_extraction" ? "文档提取产物" : "模块资产"} / 正在加载内容`;
  moduleAssetPreviewContent.textContent = "正在加载预览内容。";
  moduleAssetPreviewDialog?.showModal();

  const payload = await request(`/api/projects/${projectId}/modules/${moduleId}/assets/${assetId}/content`);
  moduleAssetPreviewTitle.textContent = payload.originalName || assetName || "任务资产预览";
  moduleAssetPreviewMeta.textContent = `${getAssetRoleLabel(payload.role)} / ${formatDateTime(payload.uploadedAt)}`;
  moduleAssetPreviewContent.textContent = payload.content || "当前资产没有可展示内容。";
}

function getAssetRoleLabel(role = "") {
  if (role === "extracted_system_requirement") return "提取系统需求";
  if (role === "extracted_software_requirement") return "提取软件需求";
  if (role === "extracted_detail_design") return "提取详细设计";
  if (role === "extracted_hil_test_case") return "提取 HIL 测试用例";
  return role || "模块资产";
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

function parseTaskDetailPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const projectId = parts[1] || "";
  const moduleId = parts[3] || "";
  const spacesIndex = parts.indexOf("spaces");
  if (spacesIndex >= 0) {
    return {
      projectId,
      moduleId,
      pathDocumentType: parts[spacesIndex + 1] || "",
      taskId: parts[spacesIndex + 3] || ""
    };
  }

  return {
    projectId,
    moduleId,
    pathDocumentType: "",
    taskId: parts[5] || ""
  };
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
  if (documentType === "system_requirement") return "系统需求";
  if (documentType === "detail_design") return "详细设计";
  if (documentType === "hil_test_case") return "HIL 用例";
  return "软件需求";
}

function ensureTaskPolling(module, pendingGeneration = null) {
  const hasActiveTask = collectTasks(module).some((task) => task.status === "running" || task.status === "queued");
  if (!hasActiveTask && !pendingGeneration) {
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
    if (historyDrawer?.classList.contains("open")) {
      await refreshModuleTaskHistory();
      return;
    }
    window.location.reload();
  }, TASK_POLL_INTERVAL_MS);
}

function ensureTaskDetailPolling(projectId, moduleId, documentType, taskId, taskStatus) {
  if (taskStatus !== "running" && taskStatus !== "queued") {
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
      renderTaskAgentRuntime(task);
      renderTaskResults(task, projectId, moduleId, documentType);
      if (task.status === "running" || task.status === "queued") {
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

function firstNonEmptyString(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function clipText(value = "", maxLength = 54) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function compactStageSummary(stage = {}, task = {}) {
  const raw = firstNonEmptyString(stage.message, getReplayTaskRuntimeSummary(task), "等待更多运行反馈");
  return clipText(raw, 56);
}

function getReplayTaskRequirementTitle(task = {}) {
  const rejectionSnapshots = Array.isArray(task.materialPack?.rejectionSnapshots) ? task.materialPack.rejectionSnapshots : [];
  const firstSnapshot = rejectionSnapshots[0] || {};
  return firstNonEmptyString(
    firstSnapshot.outputSnapshot?.title,
    firstSnapshot.requirementTitle,
    firstSnapshot.requirementCode
  );
}

function getReplayTaskDisplayTitle(task = {}) {
  return firstNonEmptyString(getReplayTaskRequirementTitle(task), task.summary, "Fallback 历史任务");
}

function getReplayTaskDisplaySummary(task = {}) {
  const summary = String(task.summary || "").trim();
  const title = getReplayTaskRequirementTitle(task);
  if (!summary) return "";
  if (title && summary === title) return "";
  return summary;
}

function formatRuntimeElapsed(value) {
  const elapsedMs = Number(value || 0) || 0;
  if (!elapsedMs) return "";
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分`;
}

function safeBasename(value = "") {
  const parts = String(value || "").trim().split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function normalizeReplayTaskStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (["queued", "pending", "created"].includes(normalized)) return "queued";
  if (["running", "processing", "in_progress"].includes(normalized)) return "running";
  if (["done", "completed", "succeeded", "success"].includes(normalized)) return "done";
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  return normalized;
}

function getReplayTaskRuntimeSource(task = {}) {
  const runtime = task.runtime && typeof task.runtime === "object" ? task.runtime : null;
  const runtimeInfo = task.runtimeInfo && typeof task.runtimeInfo === "object" ? task.runtimeInfo : null;
  const runtimeSummary = task.runtimeSummary && typeof task.runtimeSummary === "object" ? task.runtimeSummary : null;
  const agent = task.debug?.agent && typeof task.debug.agent === "object" ? task.debug.agent : null;
  const progress = task.progress && typeof task.progress === "object" ? task.progress : null;
  return { runtime, runtimeInfo, runtimeSummary, agent, progress };
}

function getReplayTaskRuntimeSummary(task = {}) {
  const { runtime, runtimeInfo, runtimeSummary, agent, progress } = getReplayTaskRuntimeSource(task);
  const status = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
  if (status === "queued") {
    return firstNonEmptyString(
      runtimeSummary?.queueMessage,
      runtimeSummary?.message,
      runtimeInfo?.queueMessage,
      runtimeInfo?.message,
      runtime?.queueMessage,
      runtime?.message,
      progress?.message
    );
  }
  return firstNonEmptyString(
    runtimeSummary?.message,
    runtimeSummary?.summary,
    runtimeInfo?.message,
    runtimeInfo?.summary,
    runtime?.message,
    runtime?.summary,
    progress?.message,
    agent?.stderrExcerpt,
    agent?.stdoutExcerpt
  );
}

function getReplayTaskRuntimeMeta(task = {}) {
  const { runtime, runtimeInfo, runtimeSummary, agent, progress } = getReplayTaskRuntimeSource(task);
  const tokenUsage = runtime?.tokenUsage || runtimeInfo?.tokenUsage || runtimeSummary?.tokenUsage || agent?.tokenUsage || null;
  return [
    ["当前阶段", firstNonEmptyString(runtimeSummary?.stageLabel, runtimeSummary?.stage, runtimeInfo?.stageLabel, runtimeInfo?.stage, runtime?.stageLabel, runtime?.stage, progress?.label, progress?.stage)],
    ["传输", firstNonEmptyString(runtimeSummary?.transport, runtimeInfo?.transport, runtime?.transport, agent?.transport)],
    ["会话", firstNonEmptyString(runtimeSummary?.sessionId, runtimeInfo?.sessionId, runtime?.sessionId, agent?.sessionId)],
    ["开始时间", firstNonEmptyString(runtimeSummary?.startedAt, runtimeInfo?.startedAt, runtime?.startedAt, agent?.startedAt)],
    ["最近心跳", firstNonEmptyString(runtimeSummary?.lastHeartbeatAt, runtimeInfo?.lastHeartbeatAt, runtime?.lastHeartbeatAt, agent?.lastHeartbeatAt)],
    ["最近更新", firstNonEmptyString(runtimeSummary?.updatedAt, runtimeInfo?.updatedAt, runtime?.updatedAt, agent?.lastEventAt, task.updatedAt)],
    ["已运行", formatRuntimeElapsed(runtimeSummary?.elapsedMs ?? runtimeInfo?.elapsedMs ?? runtime?.elapsedMs ?? agent?.elapsedMs)],
    ["总 Token", tokenUsage?.totalTokens ? String(tokenUsage.totalTokens) : ""]
  ]
    .filter(([, value]) => value !== "" && value != null)
    .map(([label, value]) => ({ label, value: String(value) }));
}

function getReplayTaskTokenUsage(task = {}) {
  const { runtime, runtimeInfo, runtimeSummary, agent } = getReplayTaskRuntimeSource(task);
  return runtime?.tokenUsage || runtimeInfo?.tokenUsage || runtimeSummary?.tokenUsage || agent?.tokenUsage || null;
}

function getReplayTaskEffectiveModelLabel(task = {}) {
  const tokenUsage = getReplayTaskTokenUsage(task);
  const actualModel = firstNonEmptyString(tokenUsage?.model, task.runtime?.model, task.runtimeInfo?.model, task.runtimeSummary?.model);
  if (actualModel) {
    return actualModel;
  }

  const transport = firstNonEmptyString(
    task.debug?.agent?.transport,
    task.runtime?.transport,
    task.runtimeInfo?.transport,
    task.runtimeSummary?.transport
  );
  if (transport === "cli") {
    return "Hermes CLI / configured-in-hermes";
  }
  if (transport === "api") {
    return "Hermes API / 未返回实际模型";
  }
  return task.llmProfileId || "本地回放 / Fallback";
}

function formatReplayTokenUsageSummary(task = {}) {
  const tokenUsage = getReplayTaskTokenUsage(task);
  if (!tokenUsage?.totalTokens) {
    return {
      primary: "暂未返回",
      secondary: "等待 Hermes 写入 token 使用统计"
    };
  }

  const details = [
    tokenUsage.inputTokens ? `输入 ${formatTokenCount(tokenUsage.inputTokens)}` : "",
    tokenUsage.outputTokens ? `输出 ${formatTokenCount(tokenUsage.outputTokens)}` : "",
    tokenUsage.reasoningTokens ? `推理 ${formatTokenCount(tokenUsage.reasoningTokens)}` : ""
  ].filter(Boolean);

  return {
    primary: formatTokenCount(tokenUsage.totalTokens),
    secondary: details.join(" · ") || "已返回总 token"
  };
}

function normalizeReplayArtifactFile(item = {}) {
  if (!item || typeof item !== "object") return null;
  const pathValue = firstNonEmptyString(
    item.absolutePath,
    item.path,
    item.filePath,
    item.chunkPath,
    item.manifestPath,
    item.skillManifestPath,
    item.skillBundlePath
  );
  const name = firstNonEmptyString(item.fileName, item.originalName, item.title, safeBasename(pathValue), item.assetId, item.id);
  const role = firstNonEmptyString(item.fileRole, item.role, item.kind, item.type);
  const extra = [];
  if (item.itemCount) extra.push(`${Number(item.itemCount || 0)} items`);
  if (item.assetId) extra.push(`asset ${item.assetId}`);
  if (!name && !pathValue) return null;
  return {
    key: [pathValue, name, role].filter(Boolean).join("|"),
    name,
    role,
    path: pathValue,
    extra: extra.join(" · ")
  };
}

function getReplayTaskArtifactInfo(task = {}) {
  const sources = [
    task.artifact,
    task.artifacts,
    task.outputArtifact,
    task.outputArtifacts,
    task.runtime?.artifact,
    task.runtimeInfo?.artifact,
    task.runtimeSummary?.artifact,
    task.debug?.artifacts
  ].filter((source) => source && typeof source === "object");
  const seen = new Set();
  const files = [];
  let manifestPath = "";

  const pushFile = (candidate) => {
    const normalized = normalizeReplayArtifactFile(candidate);
    if (!normalized || seen.has(normalized.key)) return;
    seen.add(normalized.key);
    files.push(normalized);
  };

  for (const source of sources) {
    manifestPath ||= firstNonEmptyString(
      source.manifestPath,
      source.assetManifestPath,
      source.artifactManifestPath,
      source.fileManifestPath,
      source.outputManifestPath,
      source.skillManifestPath
    );
    [
      source.files,
      source.fileList,
      source.artifactFiles,
      source.outputFiles,
      source.assets,
      source.assetManifest
    ]
      .filter(Array.isArray)
      .forEach((list) => list.forEach(pushFile));
  }

  return { manifestPath, files };
}

function translateReplayStageLabel(stage = "") {
  const normalized = String(stage || "").trim();
  const mapping = {
    queued: {
      label: "已排队",
      message: "Replay 任务已进入后端队列，等待开始处理。",
      tone: "queued"
    },
    artifact_prepare: {
      label: "正在准备上下文",
      message: "后端正在生成 manifest、task brief、effective skill 和参考资产文件。",
      tone: "running"
    },
    replay_proposal_generate: {
      label: "Hermes 生成中",
      message: "Hermes 正在读取 replay 上下文文件并生成 Skill 优化建议。",
      tone: "running"
    },
    post_process: {
      label: "正在整理提案与工单",
      message: "Hermes 已返回结果，后端正在整理 proposal 和 skill work order。",
      tone: "running"
    },
    done: {
      label: "已完成",
      message: "Replay 提案和关联工单已生成完成。",
      tone: "done"
    },
    failed: {
      label: "失败",
      message: "Replay 任务执行失败，请查看运行日志和错误摘要。",
      tone: "failed"
    }
  };
  return mapping[normalized] || {
    label: normalized || "处理中",
    message: "",
    tone: "running"
  };
}

function describeReplayTaskStage(task = {}) {
  const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
  const { agent, progress } = getReplayTaskRuntimeSource(task);
  let stageKey = String(progress?.stage || "").trim();
  if (normalizedStatus === "queued") {
    stageKey = "queued";
  } else if (normalizedStatus === "failed") {
    stageKey = "failed";
  } else if (normalizedStatus === "done") {
    stageKey = "done";
  } else if (normalizedStatus === "running" && agent?.status === "completed") {
    stageKey = "post_process";
  } else if (!stageKey && normalizedStatus === "running") {
    stageKey = "replay_proposal_generate";
  }

  const presentation = translateReplayStageLabel(stageKey);
  const meta = getReplayTaskRuntimeMeta(task);
  const transport = meta.find((item) => item.label === "传输")?.value || "";
  const sessionId = meta.find((item) => item.label === "会话")?.value || "";
  const elapsed = meta.find((item) => item.label === "已运行")?.value || "";
  return {
    stage: stageKey,
    tone: presentation.tone,
    label: progress?.label || presentation.label,
    message: getReplayTaskRuntimeSummary(task) || progress?.message || presentation.message,
    transport,
    sessionId,
    elapsed
  };
}

function renderFeedbackHistoryProgressSection(task = {}) {
  const timeline = Array.isArray(task.timeline) ? [...task.timeline].reverse() : [];
  const stage = describeReplayTaskStage(task);
  const shouldCollapse = timeline.length > TASK_TIMELINE_COLLAPSED_ITEMS;
  const isExpanded =
    state.feedbackHistory.progressExpandedTaskId === task.id ? state.feedbackHistory.progressExpanded : false;
  const visibleTimeline = isExpanded || !shouldCollapse ? timeline : timeline.slice(0, TASK_TIMELINE_COLLAPSED_ITEMS);
  const hiddenCount = Math.max(0, timeline.length - visibleTimeline.length);

  return `
    <section class="feedback-history-detail-section">
      <h4>执行进度</h4>
      <div class="feedback-history-progress-shell progress-shell">
        <div class="progress-hero">
          <strong>${escapeHtml(stage.label)}</strong>
          <p>${escapeHtml(stage.message || "任务已启动，正在持续写入执行进度。")}</p>
          <div class="feedback-history-meta">
            <span>${escapeHtml(`最近更新 ${formatDateTime(task.updatedAt || task.createdAt)}`)}</span>
            ${stage.elapsed ? `<span>${escapeHtml(`已运行 ${stage.elapsed}`)}</span>` : ""}
          </div>
        </div>
        ${
          shouldCollapse
            ? `<div class="timeline-toggle-row">
                <span class="timeline-toggle-hint">${
                  isExpanded ? "已展开全部执行历史。" : `默认只显示最近 ${TASK_TIMELINE_COLLAPSED_ITEMS} 条更新，隐藏 ${hiddenCount} 条。`
                }</span>
                <button
                  type="button"
                  class="secondary-button timeline-toggle-button"
                  data-toggle-feedback-history-progress="${escapeAttribute(task.id || "")}"
                >
                  ${isExpanded ? "只看最近进度" : "展开全部进度"}
                </button>
              </div>`
            : ""
        }
        <div class="timeline-list feedback-history-timeline">
          ${
            visibleTimeline.length
              ? visibleTimeline
                  .map((entry) => {
                    const presentation = translateReplayStageLabel(entry.stage || "");
                    return `
                      <article class="timeline-item ${escapeHtml(entry.level || "info")}">
                        <time>${escapeHtml(formatDateTime(entry.at))}</time>
                        <strong>${escapeHtml(entry.label || presentation.label || "进度更新")}</strong>
                        <div>${escapeHtml(entry.message || presentation.message || "")}</div>
                      </article>
                    `;
                  })
                  .join("")
              : '<div class="empty-state">任务启动后，这里会显示阶段进度与关键更新。</div>'
          }
        </div>
      </div>
    </section>
  `;
}

function renderFeedbackHistoryRuntimeSection(task = {}) {
  const events = Array.isArray(task.runtimeEvents) ? [...task.runtimeEvents].reverse() : [];
  const meta = getReplayTaskRuntimeMeta(task);
  const shouldCollapse = events.length > TASK_TIMELINE_COLLAPSED_ITEMS;
  const isExpanded =
    state.feedbackHistory.runtimeExpandedTaskId === task.id ? state.feedbackHistory.runtimeExpanded : false;
  const visibleEvents = isExpanded || !shouldCollapse ? events : events.slice(0, TASK_TIMELINE_COLLAPSED_ITEMS);
  const hiddenCount = Math.max(0, events.length - visibleEvents.length);

  return `
    <section class="feedback-history-detail-section">
      <h4>Agent 运行日志</h4>
      <div class="feedback-history-runtime-shell">
        ${
          meta.length
            ? `<div class="feedback-history-runtime-meta">
                ${meta
                  .map(
                    (item) => `
                      <article class="feedback-history-detail-card">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.value)}</strong>
                      </article>
                    `
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          shouldCollapse
            ? `<div class="timeline-toggle-row">
                <span class="timeline-toggle-hint">${
                  isExpanded ? "已展开全部运行日志。" : `默认只显示最近 ${TASK_TIMELINE_COLLAPSED_ITEMS} 条日志，隐藏 ${hiddenCount} 条。`
                }</span>
                <button
                  type="button"
                  class="secondary-button timeline-toggle-button"
                  data-toggle-feedback-history-runtime="${escapeAttribute(task.id || "")}"
                >
                  ${isExpanded ? "只看最近日志" : "展开全部日志"}
                </button>
              </div>`
            : ""
        }
        <div class="feedback-history-runtime-shell feedback-history-runtime-list">
          ${
            visibleEvents.length
              ? visibleEvents
                  .map((event) => {
                    const presentation = translateReplayStageLabel(event.stepType || "");
                    const metaItems = [
                      event.status ? `status: ${event.status}` : "",
                      event.sessionId ? `session: ${event.sessionId}` : "",
                      event.elapsedMs ? `耗时 ${Math.round(Number(event.elapsedMs || 0) / 1000)} 秒` : "",
                      event.tokenUsage?.totalTokens ? `tokens ${event.tokenUsage.totalTokens}` : ""
                    ].filter(Boolean);
                    return `
                      <article class="agent-runtime-item ${escapeHtml(event.level || "info")}">
                        <time>${escapeHtml(formatDateTime(event.at))}</time>
                        <strong>${escapeHtml(event.label || presentation.label || "Agent 运行事件")}</strong>
                        <div>${escapeHtml(event.message || presentation.message || "")}</div>
                        ${
                          metaItems.length
                            ? `<div class="agent-runtime-item-meta">${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
                            : ""
                        }
                        ${
                          event.stdoutExcerpt || event.stderrExcerpt
                            ? `<details>
                                <summary>查看输出摘要</summary>
                                ${event.stdoutExcerpt ? `<pre>${escapeHtml(event.stdoutExcerpt)}</pre>` : ""}
                                ${event.stderrExcerpt ? `<pre>${escapeHtml(event.stderrExcerpt)}</pre>` : ""}
                              </details>`
                            : ""
                        }
                      </article>
                    `;
                  })
                  .join("")
              : '<div class="empty-state">当前还没有写入 Agent 运行日志。</div>'
          }
        </div>
      </div>
    </section>
  `;
}

function renderFeedbackHistoryArtifactSection(task = {}) {
  const artifactInfo = getReplayTaskArtifactInfo(task);
  if (!artifactInfo.manifestPath && !artifactInfo.files.length) {
    return "";
  }

  const previewFiles = artifactInfo.files.slice(0, 4);
  const remainingFiles = artifactInfo.files.slice(4);
  return `
    <section class="feedback-history-detail-section">
      <h4>上下文文件 / 产物文件</h4>
      <div class="feedback-history-artifact-shell">
        <div class="feedback-history-detail-item">
          <strong>${escapeHtml(artifactInfo.manifestPath ? "Manifest 已就绪" : "上下文文件已准备")}</strong>
          <p>${escapeHtml(
            [
              artifactInfo.manifestPath ? `manifest：${safeBasename(artifactInfo.manifestPath)}` : "",
              artifactInfo.files.length ? `共 ${artifactInfo.files.length} 个上下文或产物文件` : ""
            ]
              .filter(Boolean)
              .join("，")
          )}</p>
        </div>
        <div class="feedback-history-detail-list">
          ${
            previewFiles
              .map(
                (file) => `
                  <article class="feedback-history-detail-item">
                    <strong>${escapeHtml(file.name || safeBasename(file.path) || "未命名文件")}</strong>
                    <p>${escapeHtml([file.role || "", file.extra || "", file.path || ""].filter(Boolean).join(" · "))}</p>
                  </article>
                `
              )
              .join("")
          }
        </div>
        ${
          remainingFiles.length
            ? `<details class="feedback-history-artifact-details">
                <summary>展开全部上下文文件（${remainingFiles.length} 个）</summary>
                <div class="feedback-history-detail-list">
                  ${remainingFiles
                    .map(
                      (file) => `
                        <article class="feedback-history-detail-item">
                          <strong>${escapeHtml(file.name || safeBasename(file.path) || "未命名文件")}</strong>
                          <p>${escapeHtml([file.role || "", file.extra || "", file.path || ""].filter(Boolean).join(" · "))}</p>
                        </article>
                      `
                    )
                    .join("")}
                </div>
              </details>`
            : ""
        }
      </div>
    </section>
  `;
}

function translateStatus(status) {
  if (status === "accepted") return "已采纳";
  if (status === "rejected") return "已驳回";
  if (status === "queued") return "排队中";
  if (status === "completed") return "已完成";
  if (status === "running") return "生成中";
  if (status === "failed") return "已失败";
  if (status === "proposal_review") return "待提案评审";
  return "待处理";
}

function translateReplayTaskStatus(status) {
  if (status === "queued") return "排队中";
  if (status === "running") return "处理中";
  if (status === "done" || status === "completed") return "已完成";
  if (status === "failed") return "已失败";
  if (status === "cancelled") return "已取消";
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
