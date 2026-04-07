const state = {
  projects: [],
  selectedProjectId: "",
  meta: null,
  llm: {
    providers: [],
    profiles: [],
    defaultProfileId: ""
  }
};

const projectForm = document.querySelector("#project-form");
const uploadForm = document.querySelector("#upload-form");
const llmProfileForm = document.querySelector("#llm-profile-form");
const projectSelect = document.querySelector("#project-select");
const llmProfileSelect = document.querySelector("#llm-profile-select");
const llmProfileHint = document.querySelector("#llm-profile-hint");
const llmProviderSelect = document.querySelector("#llm-provider-select");
const llmModelInput = document.querySelector("#llm-model-input");
const llmBaseUrlInput = document.querySelector("#llm-base-url-input");
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
  setStatus("文件已上传，可以开始生成需求。");
  await refreshProject(projectId);
});

llmProviderSelect.addEventListener("change", () => {
  applyProviderPreset(llmProviderSelect.value);
});

llmProfileSelect.addEventListener("change", async () => {
  const profileId = llmProfileSelect.value;
  renderSelectedProfileHint();
  if (profileId) {
    const llmMeta = await request("/api/llm-profiles/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId })
    });
    state.llm = llmMeta;
    renderLlmProfiles();
  }
});

llmProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(llmProfileForm);
  const payload = Object.fromEntries(formData.entries());
  await request("/api/llm-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  llmProfileForm.reset();
  await refreshLlmMeta();
  applyProviderPreset(state.llm.providers[0]?.id || "openai");
  setStatus(`已新增模型配置：${payload.name}`);
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

  setStatus("正在生成需求草案，请稍候...");
  const project = await request(`/api/projects/${projectSelect.value}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      llmProfileId: llmProfileSelect.value || ""
    })
  });
  upsertProject(project);
  renderProject(project);
  setStatus(`已生成 ${project.requirements.length} 条需求。`);
});

async function bootstrap() {
  const [meta, projectsResponse] = await Promise.all([request("/api/meta"), request("/api/projects")]);
  state.meta = meta;
  state.projects = projectsResponse.projects;
  state.selectedProjectId = state.projects[0]?.id || "";
  await refreshLlmMeta();

  renderProjects();

  if (state.selectedProjectId) {
    await refreshProject(state.selectedProjectId);
  } else {
    renderProject(null);
  }
}

function renderMeta() {
  metaRoot.textContent = state.llm.profiles.length
    ? "已接入可用 LLM 模型，生成时将按当前选择的模型调用。"
    : "当前未配置外部 LLM，系统会使用本地回退模式生成草案。";
}

async function refreshLlmMeta() {
  state.llm = await request("/api/llm-profiles");
  renderMeta();
  renderLlmProviders();
  renderLlmProfiles();
}

function renderLlmProviders() {
  llmProviderSelect.innerHTML = "";
  for (const provider of state.llm.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    llmProviderSelect.append(option);
  }
  applyProviderPreset(llmProviderSelect.value || state.llm.providers[0]?.id || "openai");
}

function renderLlmProfiles() {
  llmProfileSelect.innerHTML = "";

  if (!state.llm.profiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未配置，使用本地回退模式";
    option.selected = true;
    llmProfileSelect.append(option);
    renderSelectedProfileHint();
    return;
  }

  for (const profile of state.llm.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} · ${profile.providerLabel}`;
    if (profile.id === state.llm.defaultProfileId) {
      option.selected = true;
    }
    llmProfileSelect.append(option);
  }
  renderSelectedProfileHint();
}

function renderSelectedProfileHint() {
  const profile = state.llm.profiles.find((item) => item.id === llmProfileSelect.value);
  llmProfileHint.textContent = profile
    ? `当前使用 ${profile.providerLabel} / ${profile.model} / ${profile.apiKeyMasked}`
    : "未选择外部模型，将使用本地规则回退模式。";
}

function applyProviderPreset(providerId) {
  const provider = state.llm.providers.find((item) => item.id === providerId);
  if (!provider) {
    llmModelInput.placeholder = "例如：gpt-4.1-mini";
    llmBaseUrlInput.value = "";
    llmBaseUrlInput.placeholder = "服务地址";
    return;
  }
  llmProviderSelect.value = provider.id;
  llmModelInput.placeholder = `例如：${provider.modelPlaceholder}`;
  llmBaseUrlInput.value = provider.defaultBaseURL || "";
  llmBaseUrlInput.placeholder = provider.defaultBaseURL || "服务地址";
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
    summaryRoot.innerHTML = "<p>创建项目后可查看处理进度与结果概览。</p>";
    requirementsRoot.innerHTML = "<p>生成结果会显示在这里，便于逐条审核。</p>";
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

  if (project.lastGeneration?.llmProfile) {
    const node = document.createElement("div");
    node.className = "metric";
    node.innerHTML = `<span>最近生成模型</span><strong>${project.lastGeneration.llmProfile.provider === "doubao" ? "豆包" : project.lastGeneration.llmProfile.provider}</strong><p>${project.lastGeneration.llmProfile.model}</p>`;
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
