const state = {
  projects: [],
  selectedProjectId: "",
  meta: null
};

const projectForm = document.querySelector("#project-form");
const uploadForm = document.querySelector("#upload-form");
const projectSelect = document.querySelector("#project-select");
const generateButton = document.querySelector("#generate-button");
const requirementsRoot = document.querySelector("#requirements");
const summaryRoot = document.querySelector("#project-summary");
const statusRoot = document.querySelector("#status");
const metaRoot = document.querySelector("#meta");
const requirementTemplate = document.querySelector("#requirement-template");

await bootstrap();

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const payload = Object.fromEntries(formData.entries());
  const project = await request("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  state.projects.unshift(project);
  state.selectedProjectId = project.id;
  renderProjects();
  renderProject(project);
  projectForm.reset();
  setStatus(`已创建项目：${project.name}`);
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const projectId = projectSelect.value;
  if (!projectId) {
    setStatus("请先创建或选择项目");
    return;
  }

  const formData = new FormData(uploadForm);
  await request(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: formData
  });
  setStatus("文件已上传，可以开始生成需求");
  await refreshProject(projectId);
});

projectSelect.addEventListener("change", async () => {
  state.selectedProjectId = projectSelect.value;
  if (state.selectedProjectId) {
    await refreshProject(state.selectedProjectId);
  }
});

generateButton.addEventListener("click", async () => {
  if (!projectSelect.value) {
    setStatus("请先选择项目");
    return;
  }

  setStatus("正在生成需求草稿，请稍候...");
  const project = await request(`/api/projects/${projectSelect.value}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  upsertProject(project);
  renderProject(project);
  setStatus(`已生成 ${project.requirements.length} 条需求`);
});

async function bootstrap() {
  const [meta, projectsResponse] = await Promise.all([request("/api/meta"), request("/api/projects")]);
  state.meta = meta;
  state.projects = projectsResponse.projects;
  state.selectedProjectId = state.projects[0]?.id || "";

  metaRoot.textContent = meta.llmConfigured
    ? "LLM API 已配置，将优先调用外部模型生成结构化需求。"
    : "未配置 LLM API，当前使用本地规则回退模式生成可审核草稿。";

  renderProjects();

  if (state.selectedProjectId) {
    await refreshProject(state.selectedProjectId);
  } else {
    renderProject(null);
  }
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
    if (project.id === state.selectedProjectId) {
      option.selected = true;
    }
    projectSelect.append(option);
  }
}

function renderProject(project) {
  if (!project) {
    summaryRoot.innerHTML = "<p>创建项目后可查看处理进度与结果。</p>";
    requirementsRoot.innerHTML = "<p>生成结果会显示在这里。</p>";
    return;
  }

  summaryRoot.innerHTML = "";
  const metrics = [
    ["输入文件", project.files.length],
    ["抽取证据", project.extractions.reduce((count, item) => count + item.evidence.length, 0)],
    ["需求条目", project.requirements.length],
    ["冲突项", project.conflicts.length]
  ];

  for (const [label, value] of metrics) {
    const node = document.createElement("div");
    node.className = "metric";
    node.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    summaryRoot.append(node);
  }

  requirementsRoot.innerHTML = "";
  if (!project.requirements.length) {
    requirementsRoot.innerHTML = "<p>上传文件并点击“启动生成”后，这里会出现需求草稿。</p>";
    return;
  }

  for (const requirement of project.requirements) {
    const fragment = requirementTemplate.content.cloneNode(true);
    const root = fragment.querySelector(".requirement");
    root.dataset.id = requirement.id;
    fragment.querySelector('[data-field="requirementId"]').textContent = requirement.requirementId;
    fragment.querySelector('[data-field="title"]').textContent = requirement.title;
    fragment.querySelector('[data-field="reviewStatus"]').textContent = translateStatus(requirement.review?.status);
    fragment.querySelector('[data-field="requirementText"]').value = requirement.requirementText;
    fragment.querySelector('[data-field="type"]').textContent = requirement.type;
    fragment.querySelector('[data-field="confidence"]').textContent = String(requirement.confidence);
    fragment.querySelector('[data-field="verificationHint"]').textContent = requirement.verificationHint || "无";
    fragment.querySelector('[data-field="conflictNote"]').textContent = requirement.conflictNote || "无";

    const sources = fragment.querySelector('[data-field="sources"]');
    for (const source of requirement.sourceRefs) {
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
      reviewRequirement(project.id, requirement.id, "rejected", root)
    );

    requirementsRoot.append(fragment);
  }
}

async function reviewRequirement(projectId, requirementId, status, root) {
  const requirementText = root.querySelector('[data-field="requirementText"]').value;
  const project = await request(`/api/projects/${projectId}/requirements/${requirementId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, requirementText, reviewer: "当前用户" })
  });
  upsertProject(project);
  renderProject(project);
  setStatus(`需求已更新为：${translateStatus(status)}`);
}

function translateStatus(status) {
  return (
    {
      pending: "待审核",
      accepted: "已接受",
      revised: "已修改",
      rejected: "已驳回"
    }[status] || "待审核"
  );
}

async function refreshProject(projectId) {
  const project = await request(`/api/projects/${projectId}`);
  upsertProject(project);
  renderProjects();
  renderProject(project);
}

function upsertProject(project) {
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    state.projects[index] = project;
  } else {
    state.projects.unshift(project);
  }
}

function setStatus(message) {
  statusRoot.textContent = message;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}
