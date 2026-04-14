const page = document.body.dataset.page || "";
const statusRoot = document.querySelector("#status");

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
  renderBreadcrumb([
    { label: "工程列表", href: "/" },
    { label: project.name, href: `/projects/${project.id}` },
    { label: "创建功能模块" }
  ]);
  document.querySelector("#project-back-link").href = `/projects/${project.id}`;
  document.querySelector("#module-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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

  renderAcceptedList(module, project.id);
  renderTaskList(module, project.id);

  const highlightTaskId = new URLSearchParams(window.location.search).get("highlightTaskId");
  if (highlightTaskId) {
    const target = document.querySelector(`[data-task-id="${highlightTaskId}"]`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.style.boxShadow = "0 0 0 2px rgba(14,106,168,0.28)";
    }
  }
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

function renderTaskList(module, projectId) {
  const taskList = document.querySelector("#task-list");
  const tasks = collectTasks(module);
  if (!tasks.length) {
    taskList.innerHTML = '<div class="empty-state">当前还没有历史生成任务。</div>';
    return;
  }

  taskList.innerHTML = tasks
    .map(
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
          <div class="inline-actions">
            <a class="primary-link" href="/projects/${projectId}/modules/${module.id}/tasks/${task.id}?documentType=${task.documentType}">查看详情</a>
          </div>
        </article>
      `
    )
    .join("");
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
  renderTaskSideInfo(task);
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

function renderTaskSideInfo(task) {
  const taskSideInfo = document.querySelector("#task-side-info");
  const conflictBlock = (task.conflicts || []).length
    ? `
      <article class="stack-card">
        <strong>冲突项</strong>
        <div class="conflict-list">${escapeHtml(
          task.conflicts.map((item) => `${item.code || "conflict"}: ${item.message || item.detail || ""}`).join("\n")
        )}</div>
      </article>
    `
    : `
      <article class="stack-card">
        <strong>冲突项</strong>
        <p>本次任务没有记录冲突项。</p>
      </article>
    `;

  const traceBlock = (task.traces || []).length
    ? `
      <article class="stack-card">
        <strong>追溯信息</strong>
        <div class="trace-list">${escapeHtml(
          task.traces.map((item) => `${item.fileName} @ ${item.location}`).join("\n")
        )}</div>
      </article>
    `
    : `
      <article class="stack-card">
        <strong>追溯信息</strong>
        <p>本次任务没有可展示的追溯条目。</p>
      </article>
    `;

  taskSideInfo.innerHTML = conflictBlock + traceBlock;
}

function renderTaskResults(task, projectId, moduleId, documentType) {
  const taskResults = document.querySelector("#task-results");
  if (!(task.resultItems || []).length) {
    taskResults.innerHTML = '<div class="empty-state">本次任务没有生成结果。</div>';
    return;
  }

  taskResults.innerHTML = task.resultItems
    .map(
      (item) => `
        <article class="stack-card">
          <div class="inline-actions">
            <span class="status-badge ${statusTone(item.review?.status || "pending")}">${escapeHtml(
              translateStatus(item.review?.status || "pending")
            )}</span>
          </div>
          <strong>${escapeHtml(item.title || item.requirementId || "未命名结果")}</strong>
          <div class="card-meta">
            <span>${escapeHtml(item.requirementId || "未编号")}</span>
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
          <div class="trace-list">${escapeHtml(
            (item.sourceRefs || []).map((ref) => `${ref.fileName} @ ${ref.location}\n${ref.excerpt}`).join("\n\n") || "无来源"
          )}</div>
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
        await request(
          `/api/projects/${projectId}/modules/${moduleId}/spaces/${documentType}/tasks/${task.id}/results/${resultItemId}/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "rejected",
              comment: "在任务详情页中人工驳回"
            })
          }
        );
        setStatus("结果已标记为驳回。");
      }
      window.location.reload();
    } catch (error) {
      handleError(error);
    }
  });
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
  return ["software_requirement", "detail_design"]
    .flatMap((documentType) =>
      (module.documentSpaces?.[documentType]?.acceptedItems || []).map((item) => ({
        ...item,
        documentType
      }))
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function collectTasks(module) {
  return ["software_requirement", "detail_design"]
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
    ? [preferredDocumentType, ...["software_requirement", "detail_design"].filter((item) => item !== preferredDocumentType)]
    : ["software_requirement", "detail_design"];

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
  return documentType === "detail_design" ? "详细设计" : "软件需求";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "未知时间";
}

function translateStatus(status) {
  if (status === "accepted") return "已采纳";
  if (status === "rejected") return "已驳回";
  if (status === "completed") return "已完成";
  if (status === "proposal_review") return "待提案评审";
  return "待处理";
}

function statusTone(status) {
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
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
