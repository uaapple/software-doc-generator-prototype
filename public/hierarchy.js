const page = document.body.dataset.page || "";
const statusRoot = document.querySelector("#status");
const rejectDialog = document.querySelector("#reject-dialog");
const rejectDialogClose = document.querySelector("#reject-dialog-close");
const rejectDialogSubtitle = document.querySelector("#reject-dialog-subtitle");
const rejectForm = document.querySelector("#reject-form");
const rejectFormCancel = document.querySelector("#reject-form-cancel");
const TASK_POLL_INTERVAL_MS = 20000;
const PENDING_GENERATION_STORAGE_KEY = "pending-module-generations";
const PENDING_GENERATION_MAX_AGE_MS = 30 * 60 * 1000;
let taskPollTimer = 0;
const state = {
  rejectContext: null
};

rejectDialogClose?.addEventListener("click", closeRejectDialog);
rejectFormCancel?.addEventListener("click", closeRejectDialog);
rejectForm?.addEventListener("submit", handleRejectSubmit);
rejectDialog?.addEventListener("click", (event) => {
  if (event.target === rejectDialog) {
    closeRejectDialog();
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
      renderBreadcrumb([{ label: "工程列表", href: "/" }, { label: "创建工程" }]);
      document.querySelector("#project-form")?.addEventListener("submit", handleCreateProject);
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
          </div>
        </article>
      `
    )
    .join("");
}

async function handleCreateProject(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const project = await request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    window.location.href = `/projects/${project.id}`;
  } catch (error) {
    handleError(error);
  }
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
  document.querySelector("#create-module-link").href = `/projects/${project.id}/modules/new`;

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
          </div>
        </article>
      `
    )
    .join("");
}

async function renderModuleCreatePage() {
  const projectId = getPathPart(1);
  const project = await request(`/api/projects/${projectId}`);
  const form = document.querySelector("#module-form");
  const nameInput = form?.elements?.namedItem("name");
  const descriptionInput = form?.elements?.namedItem("description");
  const moduleSkillKeyInput = form?.elements?.namedItem("moduleSkillKey");
  const domainSelect = document.querySelector("#domain-select");
  const candidateSelect = document.querySelector("#skill-candidate-select");
  const previewHint = document.querySelector("#module-preview-hint");
  const bootstrapRoot = document.querySelector("#bootstrap-requirements");
  let preview = null;
  let previewTimer = 0;

  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name, href: `/projects/${project.id}` },
    { label: "创建功能模块" }
  ]);
  document.querySelector("#project-back-link").href = `/projects/${project.id}`;

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

    candidateSelect.innerHTML = ['<option value="">不导入，后续走冷启动</option>']
      .concat(
        (preview.skillCandidates || []).map(
          (item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.key)} / ${escapeHtml(item.domain)} / score ${item.score}</option>`
        )
      )
      .join("");

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
      const module = await request(`/api/projects/${project.id}/modules`, {
        method: "POST",
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
  document.querySelector("#req-generate-link").href = `/requirement-generation?projectId=${project.id}&moduleId=${module.id}`;
  document.querySelector("#detail-generate-link").href =
    `/detail-design-generation?projectId=${project.id}&moduleId=${module.id}`;
  const hilLink = document.querySelector("#hil-generate-link");
  if (hilLink) {
    hilLink.href = `/hil-test-case-generation?projectId=${project.id}&moduleId=${module.id}`;
  }
  const feedbackPoolLink = document.querySelector("#feedback-pool-link");
  if (feedbackPoolLink) {
    feedbackPoolLink.href = `/feedback-pool?projectId=${project.id}&moduleId=${module.id}`;
  }

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

  ensureTaskPolling(module, pendingGeneration);
}

function renderAcceptedList(module, projectId) {
  const acceptedList = document.querySelector("#accepted-list");
  const items = collectAcceptedItems(module);
  if (!items.length) {
    acceptedList.innerHTML = '<div class="empty-state">当前还没有已采纳结果。</div>';
    return;
  }

  acceptedList.innerHTML = items
    .map(
      (item) => `
        <article class="stack-card">
          <div class="inline-actions">
            <span class="doc-badge">${escapeHtml(documentLabel(item.documentType))}</span>
            <span class="status-badge accepted">已采纳</span>
          </div>
          <strong>${escapeHtml(item.currentContent?.title || item.acceptedSnapshot?.title || "已采纳结果")}</strong>
          <div class="card-meta">
            <span>来源任务 ${escapeHtml(shortId(item.sourceTaskId))}</span>
            <span>更新时间 ${formatDateTime(item.updatedAt)}</span>
          </div>
          <div class="accepted-content">${escapeHtml(
            item.currentContent?.requirementText || item.acceptedSnapshot?.requirementText || ""
          )}</div>
        </article>
      `
    )
    .join("");
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
          ${task.status === "running" ? `<p class="inline-hint">任务已启动，正在生成中，完成后会自动刷新列表。</p>` : ""}
          ${task.status === "failed" ? `<p class="inline-hint">${escapeHtml(task.summary || "任务执行失败，请重试。")}</p>` : ""}
          <div class="inline-actions">
            <a class="primary-link" href="/projects/${projectId}/modules/${module.id}/tasks/${task.id}?documentType=${task.documentType}">查看详情</a>
          </div>
        </article>
      `
    )
  );

  taskList.innerHTML = cards.join("");
}

async function renderTaskDetailPage() {
  const projectId = getPathPart(1);
  const moduleId = getPathPart(3);
  const taskId = getPathPart(5);
  const params = new URLSearchParams(window.location.search);
  const preferredDocumentType = params.get("documentType");
  const [project, module] = await Promise.all([
    request(`/api/projects/${projectId}`),
    request(`/api/projects/${projectId}/modules/${moduleId}`)
  ]);

  const taskInfo = findTaskInModule(module, taskId, preferredDocumentType);
  if (!taskInfo) {
    throw new Error("Task not found");
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

  renderTaskMeta(task);
  renderTaskResults(task, project.id, module.id, documentType);
}

function renderTaskMeta(task) {
  const taskMeta = document.querySelector("#task-meta");
  taskMeta.innerHTML = `
    <article class="meta-item"><span>任务状态</span><strong>${escapeHtml(translateStatus(task.status))}</strong></article>
    <article class="meta-item"><span>生成结果数</span><strong>${(task.resultItems || []).length}</strong></article>
    <article class="meta-item"><span>输入资产数</span><strong>${(task.inputAssetIds || []).length}</strong></article>
    <article class="meta-item"><span>生成模型</span><strong>${escapeHtml(task.llmProfile?.name || "本地回退")}</strong></article>
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
  if (task.status === "running") {
    taskResults.innerHTML = '<div class="empty-state">任务已启动，当前正在生成中，请稍候刷新结果。</div>';
    return;
  }

  if (task.status === "failed") {
    taskResults.innerHTML = '<div class="empty-state">任务执行失败，请返回模块页重新发起，或检查模型与输入资产。</div>';
    return;
  }

  if (!(task.resultItems || []).length) {
    taskResults.innerHTML = '<div class="empty-state">本次任务没有生成结果。</div>';
    return;
  }

  taskResults.innerHTML = task.resultItems
    .map(
      (item) => `
        <article class="stack-card" data-result-item-id="${item.id}">
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
          <label>
            内容
            <textarea data-text-input="${item.id}" rows="7">${escapeHtml(item.requirementText || "")}</textarea>
          </label>
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

  taskResults.addEventListener("click", async (event) => {
    const acceptButton = event.target.closest("[data-accept-item]");
    const rejectButton = event.target.closest("[data-reject-item]");
    if (!acceptButton && !rejectButton) {
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
  });
}

function openRejectDialog(context) {
  if (!rejectDialog || !rejectForm || !context?.root) {
    return;
  }
  state.rejectContext = context;
  rejectForm.reset();
  rejectForm.elements.namedItem("severity").value = "medium";
  rejectDialogSubtitle.textContent = `你正在驳回 ${context.requirementCode}，请填写结构化原因。`;
  rejectDialog.showModal();
}

function closeRejectDialog() {
  state.rejectContext = null;
  rejectForm?.reset();
  rejectDialog?.close();
}

async function handleRejectSubmit(event) {
  event.preventDefault();
  if (!state.rejectContext?.root) {
    return;
  }

  try {
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
    closeRejectDialog();
    setStatus(payload.includeInPool ? "结果已驳回并沉淀到反馈池。" : "结果已驳回，未加入反馈池。");
    window.location.reload();
  } catch (error) {
    handleError(error);
  }
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
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
    throw new Error(data.error || "Request failed");
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
  setStatus(error.message || "操作失败");
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
