const state = {
  groups: [],
  records: [],
  tasks: [],
  selectedGroupId: "",
  selectedRecordId: "",
  selectedTaskId: "",
  selectedRecordIds: new Set(),
  llm: {
    profiles: [],
    defaultProfileId: ""
  }
};

const groupListRoot = document.querySelector("#group-list");
const recordListRoot = document.querySelector("#record-list");
const detailPanelRoot = document.querySelector("#detail-panel");
const taskListRoot = document.querySelector("#task-list");
const refreshGroupsButton = document.querySelector("#refresh-groups");
const createReplayTaskButton = document.querySelector("#create-replay-task");
const recordCategoryFilter = document.querySelector("#record-category-filter");
const replayLlmProfileSelect = document.querySelector("#replay-llm-profile-select");

await bootstrap();

refreshGroupsButton.addEventListener("click", rebuildGroups);
createReplayTaskButton.addEventListener("click", createReplayTaskFromSelection);
recordCategoryFilter.addEventListener("change", renderRecords);
groupListRoot.addEventListener("click", handleGroupAction);
recordListRoot.addEventListener("click", handleRecordAction);
recordListRoot.addEventListener("change", handleRecordSelectionChange);
taskListRoot.addEventListener("click", handleTaskAction);
detailPanelRoot.addEventListener("click", handleDetailAction);
detailPanelRoot.addEventListener("change", handleProposalStatusChange);

async function bootstrap() {
  await Promise.all([refreshGroups(), refreshRecords(), refreshTasks(), refreshLlmProfiles()]);
  renderGroups();
  renderRecords();
  renderTasks();
  renderDetailPanel();
  renderReplayProfileOptions();
}

async function refreshLlmProfiles() {
  const response = await request("/api/llm-profiles");
  state.llm.profiles = response.profiles || [];
  state.llm.defaultProfileId = response.defaultProfileId || "";
}

function renderReplayProfileOptions() {
  replayLlmProfileSelect.innerHTML = "";
  const localOption = document.createElement("option");
  localOption.value = "";
  localOption.textContent = "??????";
  replayLlmProfileSelect.append(localOption);
  for (const profile of state.llm.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} / ${profile.providerLabel}`;
    if (profile.id === state.llm.defaultProfileId) option.selected = true;
    replayLlmProfileSelect.append(option);
  }
}

async function refreshGroups() {
  const response = await request("/api/rejection-groups");
  state.groups = response.groups || [];
}

async function refreshRecords() {
  const response = await request("/api/rejections");
  state.records = response.records || [];
  const categories = [...new Set(state.records.map((item) => item.reasonCategory).filter(Boolean))];
  const currentValue = recordCategoryFilter.value;
  recordCategoryFilter.innerHTML = '<option value="">全部</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    if (category === currentValue) option.selected = true;
    recordCategoryFilter.append(option);
  }
}

async function refreshTasks() {
  const response = await request("/api/replay-tasks");
  state.tasks = response.tasks || [];
}

async function rebuildGroups() {
  await request("/api/rejection-groups/rebuild", { method: "POST" });
  await Promise.all([refreshGroups(), refreshRecords()]);
  renderGroups();
  renderRecords();
}

function renderGroups() {
  groupListRoot.innerHTML = "";
  if (!state.groups.length) {
    groupListRoot.innerHTML = '<p class="empty-state">当前还没有可用分组。</p>';
    return;
  }
  for (const group of state.groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-card ${group.id === state.selectedGroupId ? "is-selected" : ""}`;
    button.dataset.action = "select-group";
    button.dataset.groupId = group.id;
    button.innerHTML = `
      <strong>${escapeHtml(group.title)}</strong>
      <p>${escapeHtml(group.reasonTags.join(", ") || "无标签")}</p>
      <div class="list-card-meta">
        <span>${escapeHtml(group.targetArea)}</span>
        <span>${group.stats.count} 条</span>
      </div>
    `;
    groupListRoot.append(button);
  }
}

function renderRecords() {
  recordListRoot.innerHTML = "";
  const categoryFilter = recordCategoryFilter.value;
  const visibleRecords = state.records.filter((record) => {
    if (categoryFilter && record.reasonCategory !== categoryFilter) return false;
    if (state.selectedGroupId) return record.groupId === state.selectedGroupId;
    return true;
  });

  if (!visibleRecords.length) {
    recordListRoot.innerHTML = '<p class="empty-state">没有符合当前筛选条件的驳回记录。</p>';
    return;
  }

  for (const record of visibleRecords) {
    const selected = state.selectedRecordIds.has(record.id);
    const card = document.createElement("article");
    card.className = `list-card ${record.id === state.selectedRecordId ? "is-selected" : ""}`;
    card.innerHTML = `
      <label class="record-select-row">
        <input type="checkbox" data-record-checkbox="${record.id}" ${selected ? "checked" : ""} />
        <span class="mini-pill subtle">${escapeHtml(record.reasonCategory)}</span>
      </label>
      <button type="button" class="ghost stretch-button" data-action="select-record" data-record-id="${record.id}">
        <strong>${escapeHtml(record.requirementCode || record.requirementId)}</strong>
        <p>${escapeHtml(record.reasonText)}</p>
        <div class="list-card-meta">
          <span>${escapeHtml(record.skillContext?.targetArea || "writing")}</span>
          <span>${escapeHtml(record.replayStatus || "not_started")}</span>
        </div>
      </button>
    `;
    recordListRoot.append(card);
  }
}

function renderTasks() {
  taskListRoot.innerHTML = "";
  if (!state.tasks.length) {
    taskListRoot.innerHTML = '<p class="empty-state">当前还没有回投任务。</p>';
    return;
  }

  for (const task of state.tasks) {
    const card = document.createElement("article");
    card.className = `list-card ${task.id === state.selectedTaskId ? "is-selected" : ""}`;
    const applyResult = task.applyResult?.candidateBundleId
      ? `<span class="mini-pill success">Candidate: ${escapeHtml(task.applyResult.candidateBundleId)}</span>`
      : '<span class="mini-pill subtle">未应用</span>';
    card.innerHTML = `
      <button type="button" class="ghost stretch-button" data-action="select-task" data-task-id="${task.id}">
        <strong>${escapeHtml(task.summary || task.id)}</strong>
        <p>${task.sourceRejectionIds.length} 条记录 / ${task.proposals?.[0]?.items?.length || 0} 条提案</p>
        <div class="list-card-meta">
          <span>${escapeHtml(task.taskStatus)}</span>
          <span>${escapeHtml(task.targetBundleId || "bundle-base")}</span>
          <span>${escapeHtml(task.llmProfileId || "local-fallback")}</span>
        </div>
        <div>${applyResult}</div>
      </button>
    `;
    taskListRoot.append(card);
  }
}

function renderDetailPanel() {
  const record = state.records.find((item) => item.id === state.selectedRecordId) || null;
  const task = state.tasks.find((item) => item.id === state.selectedTaskId) || null;

  if (!record && !task) {
    detailPanelRoot.innerHTML = '<p class="empty-state">选择一条记录或一个回投任务查看详情。</p>';
    return;
  }

  if (task) {
    detailPanelRoot.innerHTML = buildTaskDetail(task);
    return;
  }

  detailPanelRoot.innerHTML = `
    <article class="detail-card">
      <h3>${escapeHtml(record.requirementCode || record.requirementId)}</h3>
      <p><strong>分类：</strong>${escapeHtml(record.reasonCategory)}</p>
      <p><strong>标签：</strong>${escapeHtml((record.reasonTags || []).join(", ") || "无")}</p>
      <p><strong>说明：</strong>${escapeHtml(record.reasonText)}</p>
      <p><strong>期望：</strong>${escapeHtml(record.expectedNote || "无")}</p>
      <p><strong>目标区域：</strong>${escapeHtml(record.skillContext?.targetArea || "writing")}</p>
      <div class="detail-block">
        <span class="label">当前输出快照</span>
        <pre>${escapeHtml(record.outputSnapshot?.requirementText || "")}</pre>
      </div>
      <div class="detail-block">
        <span class="label">相关规则</span>
        ${(record.skillContext?.relevantRules || []).map((rule) => `<div class="inline-rule"><strong>${escapeHtml(rule.ruleId)}</strong><p>${escapeHtml(rule.content)}</p></div>`).join("") || '<p class="empty-state">暂无相关规则快照。</p>'}
      </div>
    </article>
  `;
}

function buildTaskDetail(task) {
  const proposalItems = (task.proposals || []).flatMap((proposal) => proposal.items || []);
  return `
    <article class="detail-card">
      <h3>${escapeHtml(task.summary || task.id)}</h3>
      <p><strong>目标 Bundle：</strong>${escapeHtml(task.targetBundleId || "bundle-base")}</p>
      <p><strong>来源记录：</strong>${task.sourceRejectionIds.length} 条</p>
      <div class="detail-actions-row">
        <button type="button" data-action="apply-task" data-task-id="${task.id}">应用已接受提案</button>
      </div>
      <div class="proposal-list">
        ${proposalItems.map((item) => `
          <article class="proposal-card">
            <div class="proposal-head">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="mini-pill subtle">${escapeHtml(item.action)}</span>
            </div>
            <p><strong>目标规则：</strong>${escapeHtml(item.targetRuleId || "新增")}</p>
            <p><strong>理由：</strong>${escapeHtml(item.rationale || "")}</p>
            <p><strong>证据：</strong>${escapeHtml((item.evidenceRefs || []).join(", "))}</p>
            <label>
              状态
              <select data-proposal-status="${item.proposalItemId}">
                <option value="pending" ${item.status === "pending" ? "selected" : ""}>待审核</option>
                <option value="accepted" ${item.status === "accepted" ? "selected" : ""}>接受</option>
                <option value="edited" ${item.status === "edited" ? "selected" : ""}>编辑后接受</option>
                <option value="rejected" ${item.status === "rejected" ? "selected" : ""}>拒绝</option>
              </select>
            </label>
            <label>
              改前
              <textarea rows="4" disabled>${escapeHtml(item.before || "")}</textarea>
            </label>
            <label>
              改后
              <textarea data-proposal-after="${item.proposalItemId}" rows="5">${escapeHtml(item.editedPayload?.after || item.after || item.newRuleDraft?.content || "")}</textarea>
            </label>
            <div class="inline-actions">
              <button type="button" data-action="save-proposal" data-task-id="${task.id}" data-proposal-item-id="${item.proposalItemId}">保存提案状态</button>
            </div>
          </article>
        `).join("")}
      </div>
    </article>
  `;
}

async function createReplayTaskFromSelection() {
  const rejectionIds = [...state.selectedRecordIds];
  const groupId = !rejectionIds.length ? state.selectedGroupId : "";
  if (!rejectionIds.length && !groupId) {
    window.alert("请先选择至少一条记录或一个分组。");
    return;
  }
  const task = await request("/api/replay-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejectionIds, groupId, llmProfileId: replayLlmProfileSelect.value || "" })
  });
  state.selectedTaskId = task.id;
  await Promise.all([refreshTasks(), refreshRecords(), refreshGroups()]);
  renderGroups();
  renderRecords();
  renderTasks();
  renderDetailPanel();
}

async function handleGroupAction(event) {
  const button = event.target.closest("[data-action='select-group']");
  if (!button) return;
  state.selectedGroupId = state.selectedGroupId === button.dataset.groupId ? "" : button.dataset.groupId;
  renderGroups();
  renderRecords();
}

async function handleRecordAction(event) {
  const button = event.target.closest("[data-action='select-record']");
  if (!button) return;
  state.selectedRecordId = button.dataset.recordId;
  state.selectedTaskId = "";
  renderRecords();
  renderDetailPanel();
}

function handleRecordSelectionChange(event) {
  const checkbox = event.target.closest("input[data-record-checkbox]");
  if (!checkbox) return;
  const recordId = checkbox.dataset.recordCheckbox;
  if (checkbox.checked) state.selectedRecordIds.add(recordId);
  else state.selectedRecordIds.delete(recordId);
}

function handleTaskAction(event) {
  const button = event.target.closest("[data-action='select-task']");
  if (!button) return;
  state.selectedTaskId = button.dataset.taskId;
  state.selectedRecordId = "";
  renderTasks();
  renderDetailPanel();
}

async function handleDetailAction(event) {
  const saveButton = event.target.closest("[data-action='save-proposal']");
  if (saveButton) {
    const taskId = saveButton.dataset.taskId;
    const proposalItemId = saveButton.dataset.proposalItemId;
    const statusSelect = detailPanelRoot.querySelector(`[data-proposal-status='${proposalItemId}']`);
    const afterInput = detailPanelRoot.querySelector(`[data-proposal-after='${proposalItemId}']`);
    await request(`/api/replay-tasks/${taskId}/proposals/${proposalItemId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: statusSelect.value,
        editedPayload: {
          after: afterInput.value,
          action: undefined
        }
      })
    });
    await refreshTasks();
    state.selectedTaskId = taskId;
    renderTasks();
    renderDetailPanel();
    return;
  }

  const applyButton = event.target.closest("[data-action='apply-task']");
  if (applyButton) {
    const taskId = applyButton.dataset.taskId;
    await request(`/api/replay-tasks/${taskId}/apply`, { method: "POST" });
    await refreshTasks();
    state.selectedTaskId = taskId;
    renderTasks();
    renderDetailPanel();
  }
}

function handleProposalStatusChange() {}

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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
