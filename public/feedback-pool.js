import { PROFILE_LAYER_ORDER, getAllowedKindsForAreasAndLayer } from "/skill-kind-matrix.js";

const query = new URLSearchParams(window.location.search);
const initialTaskId = query.get("taskId") || "";

const state = {
  projectId: query.get("projectId") || "",
  moduleFilterId: query.get("moduleId") || "",
  project: null,
  modules: [],
  records: [],
  tasks: [],
  selectedRecordId: "",
  selectedTaskId: initialTaskId,
  replayRecordIds: [],
  selectedReplayModuleId: "",
  externalTaskDrawerOpen: Boolean(initialTaskId),
  filters: {
    reasonCategory: "",
    replayStatus: ""
  },
  llm: {
    profiles: [],
    defaultProfileId: ""
  }
};

const heroTitleRoot = document.querySelector("#hero-title");
const projectSummaryRoot = document.querySelector("#project-summary");
const projectMetricsRoot = document.querySelector("#project-metrics");
const moduleFilterSelect = document.querySelector("#module-filter");
const recordCategoryFilter = document.querySelector("#record-category-filter");
const recordReplayFilter = document.querySelector("#record-replay-filter");
const recordListRoot = document.querySelector("#record-list");
const refreshRecordsButton = document.querySelector("#refresh-records");
const openTaskDrawerButton = document.querySelector("#open-task-drawer");
const openTaskDrawerSecondaryButton = document.querySelector("#open-task-drawer-secondary");
const recordDetailDialog = document.querySelector("#record-detail-dialog");
const recordDetailTitle = document.querySelector("#record-detail-title");
const recordDetailSubtitle = document.querySelector("#record-detail-subtitle");
const recordDetailContent = document.querySelector("#record-detail-content");
const recordDetailWorkOrder = document.querySelector("#record-detail-work-order");
const recordDetailClose = document.querySelector("#record-detail-close");
const replayDialog = document.querySelector("#replay-dialog");
const replayDialogSubtitle = document.querySelector("#replay-dialog-subtitle");
const replayDialogResizer = document.querySelector("#replay-dialog-resizer");
const replayForm = document.querySelector("#replay-form");
const replayFormCancel = document.querySelector("#replay-form-cancel");
const replayLlmProfileSelect = document.querySelector("#replay-llm-profile-select");
const replaySelectedRecordsRoot = document.querySelector("#replay-selected-records");
const replayAssetPickerRoot = document.querySelector("#replay-asset-picker");
const taskDrawer = document.querySelector("#task-drawer");
const taskDrawerBackdrop = document.querySelector("#task-drawer-backdrop");
const closeTaskDrawerButton = document.querySelector("#close-task-drawer");
const taskDrawerListRoot = document.querySelector("#task-drawer-list");
const taskDrawerDetailRoot = document.querySelector("#task-drawer-detail");
const feedbackStatusRoot = document.querySelector("#feedback-status");

let replayTaskPollTimer = 0;
const REPLAY_DIALOG_HEIGHT_STORAGE_KEY = "feedback-pool:replay-dialog-height";
const replayDialogResizeState = {
  active: false,
  pointerId: null,
  startY: 0,
  startHeight: 0,
  height: 0
};

syncTopNavLinks();
syncReplayDialogHeight();

await bootstrap();
if (initialTaskId && state.selectedTaskId) {
  openTaskDrawer();
}

refreshRecordsButton.addEventListener("click", refreshAllData);
openTaskDrawerButton.addEventListener("click", openTaskDrawer);
openTaskDrawerSecondaryButton?.addEventListener("click", openTaskDrawer);
document.addEventListener("click", handleGlobalClick);
closeTaskDrawerButton.addEventListener("click", closeTaskDrawer);
if (taskDrawerBackdrop) taskDrawerBackdrop.addEventListener("click", closeTaskDrawer);
moduleFilterSelect.addEventListener("change", handleFilterChange);
recordCategoryFilter.addEventListener("change", handleFilterChange);
recordReplayFilter.addEventListener("change", handleFilterChange);
recordListRoot.addEventListener("click", handleRecordRowClick);
recordDetailClose.addEventListener("click", () => recordDetailDialog.close());
recordDetailWorkOrder?.addEventListener("click", () => openWorkOrder(recordDetailWorkOrder.dataset.workOrderId || ""));
recordDetailDialog.addEventListener("click", (event) => {
  if (event.target === recordDetailDialog) recordDetailDialog.close();
});
recordDetailDialog.addEventListener("close", () => {
  postToHost({ type: "feedback_pool:record_detail_closed" });
});
replayForm.addEventListener("submit", submitReplayTask);
replayFormCancel.addEventListener("click", () => replayDialog.close());
replayDialog.addEventListener("click", (event) => {
  if (event.target === replayDialog) replayDialog.close();
});
replayDialog.addEventListener("close", cleanupReplayDialogResizeSession);
replayDialog.addEventListener("cancel", cleanupReplayDialogResizeSession);
window.addEventListener("beforeunload", stopReplayTaskPolling);
if (replayDialogResizer) {
  replayDialogResizer.addEventListener("pointerdown", handleReplayDialogResizePointerDown);
  replayDialogResizer.addEventListener("keydown", handleReplayDialogResizeKeyDown);
}
taskDrawerListRoot.addEventListener("click", handleTaskClick);
taskDrawerDetailRoot.addEventListener("click", handleTaskDetailAction);
taskDrawerDetailRoot.addEventListener("change", handleTaskDetailChange);
window.addEventListener("message", handleHostMessage);
window.addEventListener("resize", syncReplayDialogHeight);

async function bootstrap() {
  if (!state.projectId) {
    heroTitleRoot.textContent = "反馈池";
    projectSummaryRoot.textContent = "缺少项目上下文，请从项目内入口进入反馈池。";
    projectMetricsRoot.innerHTML = "<div class=\"empty-state\">请先在项目页选择工程，再进入反馈池。</div>";
    recordListRoot.innerHTML = '<div class="empty-state">当前无法加载驳回记录。</div>';
    return;
  }

  await refreshAllData();
}

async function refreshAllData() {
  await Promise.all([refreshContext(), refreshLlmProfiles()]);
  await Promise.all([refreshRecords(), refreshTasks()]);
  renderProjectSummary();
  renderFilters();
  renderRecords();
  renderReplayProfileOptions();
  renderTaskDrawer();
  renderFeedbackStatus();
  renderTaskDrawerButtons();
}

function syncTopNavLinks() {
  if (!state.projectId) {
    return;
  }
  const params = new URLSearchParams({ projectId: state.projectId });
  if (state.moduleFilterId) {
    params.set("moduleId", state.moduleFilterId);
  }
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

async function refreshContext() {
  state.project = await request(`/api/projects/${state.projectId}`);
  state.modules = state.project.modules || [];
}

async function refreshLlmProfiles() {
  const response = await request("/api/llm-profiles");
  state.llm.profiles = response.profiles || [];
  state.llm.defaultProfileId = response.defaultProfileId || "";
}

async function refreshRecords() {
  const params = new URLSearchParams();
  params.set("projectId", state.projectId);
  if (state.moduleFilterId) params.set("moduleId", state.moduleFilterId);
  if (state.filters.reasonCategory) params.set("reasonCategory", state.filters.reasonCategory);
  if (state.filters.replayStatus) params.set("replayStatus", state.filters.replayStatus);

  const response = await request(`/api/rejections?${params.toString()}`);
  state.records = response.records || [];

  if (state.selectedRecordId && !state.records.some((record) => record.id === state.selectedRecordId)) {
    state.selectedRecordId = "";
  }
}

async function refreshTasks() {
  const params = new URLSearchParams();
  params.set("projectId", state.projectId);
  if (state.moduleFilterId) params.set("moduleId", state.moduleFilterId);

  const response = await request(`/api/replay-tasks?${params.toString()}`);
  state.tasks = response.tasks || [];
  syncReplayTaskPolling();

  if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = state.tasks[0]?.id || "";
  }
}

function renderProjectSummary() {
  const projectName = state.project?.name || "未命名工程";
  const currentModule = state.modules.find((item) => item.id === state.moduleFilterId) || null;
  const replayedCount = state.records.filter((record) => record.replayStatus && record.replayStatus !== "not_started").length;
  const activeCount = countActiveReplayTasks();

  heroTitleRoot.textContent = currentModule
    ? `${projectName} / ${currentModule.name} 驳回记录`
    : `${projectName} 驳回记录`;
  projectSummaryRoot.textContent = currentModule
    ? `${currentModule.name} 当前共有 ${state.records.length} 条驳回记录。`
    : `当前项目共有 ${state.records.length} 条驳回记录。`;

  const metrics = [
    { label: "功能模块", value: state.modules.length },
    { label: "驳回记录", value: state.records.length },
    { label: "已 Replay", value: replayedCount },
    { label: activeCount ? "处理中任务" : "最近任务", value: activeCount || state.tasks.length }
  ];

  projectMetricsRoot.innerHTML = metrics
    .map((item) => `<span class="metric"><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></span>`)
    .join("");
}

function renderTaskDrawerButtons() {
  const taskCount = state.tasks.length;
  const label = taskCount ? `Fallback 历史任务（${taskCount}）` : "查看 Fallback 历史任务";
  if (openTaskDrawerButton) {
    openTaskDrawerButton.textContent = label;
  }
  if (openTaskDrawerSecondaryButton) {
    openTaskDrawerSecondaryButton.textContent = label;
  }
}

function renderFilters() {
  moduleFilterSelect.innerHTML = '<option value="">全部模块</option>';
  for (const module of state.modules) {
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.name;
    option.selected = module.id === state.moduleFilterId;
    moduleFilterSelect.append(option);
  }

  const categories = [...new Set(state.records.map((record) => record.reasonCategory).filter(Boolean))];
  recordCategoryFilter.innerHTML = '<option value="">全部</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = getReasonCategoryLabel(category);
    option.selected = category === state.filters.reasonCategory;
    recordCategoryFilter.append(option);
  }

  recordReplayFilter.value = state.filters.replayStatus || "";
}

function renderRecords() {
  if (!state.records.length) {
    recordListRoot.innerHTML = '<div class="empty-state">当前筛选条件下没有驳回记录。</div>';
    return;
  }

  recordListRoot.innerHTML = state.records
    .map((record) => {
      const reasonText = String(record.reasonText || "").trim();
      const reasonPreview = getRecordReasonPreview(reasonText);
      const reasonTitle = reasonText || "未提供驳回说明";
      return `
        <article class="feedback-record-row ${state.selectedRecordId === record.id ? "is-selected" : ""}">
          <button type="button" class="feedback-record-button" data-record-open="${record.id}">
            <span class="feedback-record-code">${escapeHtml(record.requirementCode || record.requirementId || "未编号")}</span>
            <span class="feedback-record-title">${escapeHtml(record.outputSnapshot?.title || "未命名条目")}</span>
            <span class="feedback-record-module">${escapeHtml(record.moduleName || "未指定模块")}</span>
            <span class="feedback-record-category">${escapeHtml(getReasonCategoryLabel(record.reasonCategory))}</span>
            <span class="feedback-record-status"><span class="mini-pill ${statusTone(record.replayStatus)}">${escapeHtml(replayStatusLabel(record.replayStatus))}</span></span>
            <span class="feedback-record-reason" title="${escapeHtml(reasonTitle)}">${escapeHtml(reasonPreview || "未提供驳回说明")}</span>
          </button>
          <div class="feedback-record-actions">
            <button type="button" class="ghost-button" data-record-replay="${record.id}">发起 Replay</button>
            <button type="button" class="danger subtle-danger" data-record-delete="${record.id}">删除</button>
          </div>
        </article>
      `
    })
    .join("");
}

function renderReplayProfileOptions() {
  replayLlmProfileSelect.innerHTML = "";
  const fallback = document.createElement("option");
  fallback.value = "";
  fallback.textContent = "未选择，使用本地回放模式";
  replayLlmProfileSelect.append(fallback);

  for (const profile of state.llm.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} / ${profile.providerLabel}`;
    option.selected = profile.id === state.llm.defaultProfileId;
    replayLlmProfileSelect.append(option);
  }
}

function renderTaskDrawer() {
  const visibleTasks = state.tasks;

  if (!visibleTasks.length) {
    taskDrawerListRoot.innerHTML = '<div class="empty-state">当前项目下还没有 Replay 任务。</div>';
    taskDrawerDetailRoot.className = "feedback-task-detail empty-state";
    taskDrawerDetailRoot.textContent = "选择一个任务查看提案详情。";
    if (isEmbeddedFeedbackPool() && state.externalTaskDrawerOpen) {
      syncExternalTaskDrawer("feedback_pool:update_history_drawer");
    }
    return;
  }

  taskDrawerListRoot.innerHTML = visibleTasks
    .map((task) => {
      const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
      const isActive = isReplayTaskActive(normalizedStatus);
      const isFailed = normalizedStatus === "failed";
      const proposalCount = getReplayTaskProposalCount(task);
      const artifactSummary = summarizeReplayTaskArtifacts(task);
      const runtimeSummary = getReplayTaskRuntimeSummary(task);
      return `
        <button type="button" class="list-card feedback-task-card ${task.id === state.selectedTaskId ? "is-selected" : ""} ${isActive ? "is-pending" : ""}" data-task-open="${task.id}">
          <strong>${escapeHtml(task.summary || task.id)}</strong>
          <p>${escapeHtml(task.moduleName || "未指定模块")}</p>
          <div class="list-card-meta">
            <span>${getReplayTaskRecordCount(task)} 条记录</span>
            <span>${proposalCount} 条提案</span>
            <span>${escapeHtml(task.llmProfileId || "本地回放")}</span>
          </div>
          <div class="list-card-meta">
            <span class="mini-pill ${escapeHtml(replayTaskStatusTone(normalizedStatus))}">${escapeHtml(replayTaskStatusLabel(normalizedStatus))}</span>
            <span>${escapeHtml(formatDateTime(task.updatedAt || task.createdAt))}</span>
          </div>
          ${isActive ? `<p class="inline-hint">${escapeHtml(runtimeSummary || "系统正在处理本次回放任务。")}</p>` : ""}
          ${isFailed ? `<p class="inline-hint">${escapeHtml(task.errorMessage || "任务执行失败，请查看详情。")}</p>` : ""}
          ${artifactSummary ? `<p class="inline-hint">${escapeHtml(artifactSummary)}</p>` : ""}
        </button>
      `;
    })
    .join("");

  const selectedTask = visibleTasks.find((task) => task.id === state.selectedTaskId) || visibleTasks[0] || null;
  if (!selectedTask) {
    taskDrawerDetailRoot.className = "feedback-task-detail empty-state";
    taskDrawerDetailRoot.textContent = "选择一个任务查看提案详情。";
    if (isEmbeddedFeedbackPool() && state.externalTaskDrawerOpen) {
      syncExternalTaskDrawer("feedback_pool:update_history_drawer");
    }
    return;
  }

  state.selectedTaskId = selectedTask.id;
  taskDrawerDetailRoot.className = "feedback-task-detail";
  taskDrawerDetailRoot.innerHTML = buildTaskDetail(selectedTask);

  if (isEmbeddedFeedbackPool() && state.externalTaskDrawerOpen) {
    syncExternalTaskDrawer("feedback_pool:update_history_drawer");
  }
}

function buildTaskDetail(task) {
  const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
  if (isReplayTaskActive(normalizedStatus)) {
    return buildActiveTaskDetail(task, normalizedStatus);
  }
  if (normalizedStatus === "failed") {
    return buildFailedTaskDetail(task);
  }

  const proposalItems = (task.proposals || []).flatMap((proposal) => proposal.items || []);
  const referenceAssets = task.materialPack?.referenceAssets || [];
  const workOrderSummary = task.workOrderSummary || null;
  const targetAreas = Array.isArray(task.materialPack?.targetAreas) && task.materialPack.targetAreas.length
    ? task.materialPack.targetAreas
    : ["validation"];

  return `
    <div class="detail-card feedback-task-detail-card">
      <h3>${escapeHtml(task.summary || task.id)}</h3>
      <p><strong>模块：</strong>${escapeHtml(task.moduleName || "未指定模块")}</p>
      <p><strong>记录数：</strong>${getReplayTaskRecordCount(task)}</p>
      <p><strong>模型：</strong>${escapeHtml(task.llmProfileId || "本地回放")}</p>
      <p><strong>参考资产：</strong>${escapeHtml(referenceAssets.map((asset) => asset.originalName || asset.fileName || asset.id).join("，") || "未选择")}</p>
      ${task.workOrderId ? `<p><strong>技能工单：</strong>${escapeHtml(task.workOrderId)} · ${escapeHtml(workOrderSummary?.status || "pending_review")}</p>` : ""}
      ${buildReplayTaskRuntimeBlock(task)}
      ${buildReplayTaskArtifactBlock(task)}
      <div class="detail-actions-row">
        <button type="button" data-task-apply="${task.id}">应用已接受提案</button>
        ${task.workOrderId ? `<button type="button" class="ghost-button" data-open-work-order="${task.workOrderId}">查看技能工单</button>` : ""}
        ${buildReplayTaskDeleteButton(task)}
      </div>
      <div class="proposal-list">
        ${proposalItems.length
          ? proposalItems
              .map(
                (item) => `
                  <article class="proposal-card">
                    <div class="proposal-head">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span class="mini-pill subtle">${escapeHtml(formatProposalActionLabel(item.action))}</span>
                    </div>
                    <p><strong>目标 Skill：</strong>${escapeHtml(item.targetSkillCode || "新增技能项")}</p>
                    <p><strong>目标层级：</strong>${escapeHtml(item.targetLayer || "-")} / ${escapeHtml(item.targetProfileKey || "-")} / ${escapeHtml(item.kind || "-")}</p>
                    <p><strong>证据：</strong>${escapeHtml((item.evidenceRefs || []).join("，") || "无")}</p>
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
                      目标层级
                      <select data-proposal-layer="${item.proposalItemId}">
                        ${proposalLayerOptions(item.targetLayer || "")}
                      </select>
                    </label>
                    <label>
                      目标 Profile
                      <input data-proposal-profile="${item.proposalItemId}" value="${escapeHtml(item.targetProfileKey || "")}" />
                    </label>
                    <label>
                      目标 Skill 编码
                      <input data-proposal-skill="${item.proposalItemId}" value="${escapeHtml(item.targetSkillCode || "")}" />
                    </label>
                    <label>
                      类型
                      <select data-proposal-kind="${item.proposalItemId}">
                        ${proposalKindOptions(targetAreas, item.targetLayer || "", item.kind || "")}
                      </select>
                    </label>
                    <p class="summary" data-proposal-kind-hint="${item.proposalItemId}">${escapeHtml(proposalKindHint(targetAreas, item.targetLayer || ""))}</p>
                    <label>
                      改后内容
                      <textarea data-proposal-after="${item.proposalItemId}" rows="4">${escapeHtml(item.editedPayload?.after || item.after || item.newRuleDraft?.content || "")}</textarea>
                    </label>
                    <div class="inline-actions">
                      <button type="button" data-proposal-save="${task.id}:${item.proposalItemId}">保存提案状态</button>
                    </div>
                  </article>
                `
              )
              .join("")
          : '<div class="empty-state">当前任务还没有生成提案。</div>'}
      </div>
    </div>
  `;
}

function proposalLayerOptions(selected = "") {
  const effectiveSelected = PROFILE_LAYER_ORDER.includes(selected) ? selected : PROFILE_LAYER_ORDER[0];
  return PROFILE_LAYER_ORDER.map((layer) => `<option value="${layer}" ${layer === effectiveSelected ? "selected" : ""}>${layer}</option>`).join("");
}

function proposalKindOptions(targetAreas = [], targetLayer = "", selectedKind = "") {
  const allowedKinds = getAllowedKindsForAreasAndLayer(targetAreas, targetLayer);
  const fallbackKind = allowedKinds[0] || "";
  const effectiveSelected = allowedKinds.includes(selectedKind) ? selectedKind : fallbackKind;
  return allowedKinds.map((kind) => `<option value="${kind}" ${kind === effectiveSelected ? "selected" : ""}>${kind}</option>`).join("");
}

function proposalKindHint(targetAreas = [], targetLayer = "") {
  const allowedKinds = getAllowedKindsForAreasAndLayer(targetAreas, targetLayer);
  return allowedKinds.length ? `当前层允许：${allowedKinds.join(" / ")}` : "当前层没有可选 kind。";
}

function formatProposalActionLabel(action = "") {
  const map = {
    add_skill_item: "新增技能项",
    modify_skill_item: "修改技能项",
    split_skill_item: "拆分技能项",
    deprecate_skill_item: "废弃技能项"
  };
  return map[action] || action || "未指定动作";
}

function buildActiveTaskDetail(task, normalizedStatus = "running") {
  const runtimeSummary = getReplayTaskRuntimeSummary(task);
  return `
    <div class="detail-card feedback-task-detail-card feedback-task-detail-card-pending">
      <div class="feedback-pending-orbit" aria-hidden="true"></div>
      <h3>${escapeHtml(task.summary || (normalizedStatus === "queued" ? "Replay / Fallback 已排队" : "Replay / Fallback 正在处理中"))}</h3>
      <p><strong>模块：</strong>${escapeHtml(task.moduleName || "未指定模块")}</p>
      <p><strong>记录数：</strong>${getReplayTaskRecordCount(task)}</p>
      <p><strong>模型：</strong>${escapeHtml(task.llmProfileId || "本地回放")}</p>
      <p><strong>当前状态：</strong>${escapeHtml(replayTaskStatusLabel(normalizedStatus))}</p>
      <p class="summary">${escapeHtml(runtimeSummary || (normalizedStatus === "queued" ? "任务已进入后端队列，等待开始处理。" : "系统已接收请求，正在整理驳回记录、参考资产和候选技能规则。"))}</p>
      ${buildReplayTaskRuntimeBlock(task)}
      ${buildReplayTaskArtifactBlock(task)}
      <div class="detail-actions-row">
        ${buildReplayTaskDeleteButton(task)}
      </div>
      <div class="empty-state">任务完成后，这里会自动切换成真实的提案详情。</div>
    </div>
  `;
}

function buildFailedTaskDetail(task) {
  const referenceAssets = task.materialPack?.referenceAssets || [];
  return `
    <div class="detail-card feedback-task-detail-card">
      <div class="detail-header-row">
        <div>
          <h3>${escapeHtml(task.summary || task.id)}</h3>
          <p class="summary">${escapeHtml(task.moduleName || "未指定模块")} · ${escapeHtml(formatDateTime(task.createdAt))}</p>
        </div>
        <span class="mini-pill danger">${escapeHtml(replayTaskStatusLabel(task.taskStatus || ""))}</span>
      </div>
      <div class="detail-block-grid">
        <div class="detail-block">
          <span class="label">模型</span>
          <pre>${escapeHtml(task.llmProfileId || "本地回放")}</pre>
        </div>
        <div class="detail-block">
          <span class="label">记录数</span>
          <pre>${String(getReplayTaskRecordCount(task))}</pre>
        </div>
      </div>
      <div class="detail-block">
        <span class="label">失败原因</span>
        <pre>${escapeHtml(task.errorMessage || "任务执行失败")}</pre>
      </div>
      <div class="detail-block">
        <span class="label">参考资产</span>
        <pre>${escapeHtml(referenceAssets.map((asset) => asset.originalName || asset.fileName || asset.id).join("，") || "未选择")}</pre>
      </div>
      ${buildReplayTaskRuntimeBlock(task)}
      ${buildReplayTaskArtifactBlock(task)}
      <div class="detail-actions-row">
        ${buildReplayTaskDeleteButton(task)}
      </div>
      <div class="empty-state">这次远端任务已经按失败状态保留在历史里，没有生成提案和技能工单。</div>
    </div>
  `;
}

function buildReplayTaskDeleteButton(task) {
  return `<button type="button" class="danger" data-task-delete="${task.id}">删除任务</button>`;
}

function getReplayTaskPrimaryProposal(task = {}) {
  return Array.isArray(task.proposals) ? task.proposals[0] || null : null;
}

function getReplayTaskProposalItems(task = {}) {
  return Array.isArray(task.proposals) ? task.proposals.flatMap((proposal) => proposal.items || []) : [];
}

function getTimestamp(value = "") {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRecordReasonPreview(reasonText = "", maxLength = 96) {
  const normalized = String(reasonText || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  const sentencePreview = normalized.match(/^(.{0,84}[。！？!?])/u)?.[1]?.trim();
  if (sentencePreview && sentencePreview.length >= Math.floor(maxLength * 0.45)) {
    return `${sentencePreview} …`;
  }
  return `${normalized.slice(0, maxLength).trim()}…`;
}

function sortByLatest(items = []) {
  return [...items].sort((left, right) =>
    getTimestamp(firstNonEmptyString(right.updatedAt, right.createdAt)) - getTimestamp(firstNonEmptyString(left.updatedAt, left.createdAt))
  );
}

function getRecordDisplayTitle(record = {}) {
  return firstNonEmptyString(record.outputSnapshot?.title, record.requirementCode, record.requirementId, "Replay 详情");
}

function getRecordDisplayCode(record = {}) {
  return firstNonEmptyString(record.requirementCode, record.requirementId, "未编号");
}

function getRecordRelatedTasks(record = {}) {
  return sortByLatest(state.tasks.filter((task) => (task.sourceRejectionIds || []).includes(record.id)));
}

function selectRecordReviewTask(tasks = []) {
  return tasks.find((task) => getReplayTaskProposalItems(task).length > 0) || tasks[0] || null;
}

function getProposalAfterText(item = {}) {
  return firstNonEmptyString(item.editedPayload?.after, item.after, item.afterContent, item.newRuleDraft?.content, item.recommendedSkillText);
}

function buildRecordReviewViewModel(record = {}) {
  const relatedTasks = getRecordRelatedTasks(record);
  const selectedTask = selectRecordReviewTask(relatedTasks);
  const selectedProposal = getReplayTaskPrimaryProposal(selectedTask || {});
  const proposalItems = getReplayTaskProposalItems(selectedTask || {});
  const validatorSuggestions = Array.isArray(selectedTask?.validatorSuggestions) && selectedTask.validatorSuggestions.length
    ? selectedTask.validatorSuggestions
    : Array.isArray(selectedProposal?.validatorSuggestions)
      ? selectedProposal.validatorSuggestions
      : [];
  const conflictSummary = (record.outputSnapshot?.conflicts || []).map((item) => `${item.code}: ${item.message}`).join("\n");

  return {
    title: getRecordDisplayTitle(record),
    code: getRecordDisplayCode(record),
    moduleName: firstNonEmptyString(record.moduleName, "未指定模块"),
    replayStatusLabel: replayStatusLabel(record.replayStatus),
    replayStatusTone: statusTone(record.replayStatus),
    latestReplayAt: firstNonEmptyString(selectedTask?.updatedAt, selectedTask?.createdAt, record.lastReplayAt, record.updatedAt, record.createdAt),
    relatedTasks,
    selectedTask,
    selectedTaskStatus: normalizeReplayTaskStatus(selectedTask?.taskStatus || selectedTask?.status || ""),
    selectedTaskStatusLabel: selectedTask ? replayTaskStatusLabel(selectedTask.taskStatus || selectedTask.status || "") : replayStatusLabel(record.replayStatus),
    decisionSummary: firstNonEmptyString(selectedTask?.decisionSummary, selectedProposal?.decisionSummary),
    replaySummary: firstNonEmptyString(selectedTask?.summary, selectedProposal?.summary),
    validatorSuggestions,
    primaryProposalItem: proposalItems[0] || null,
    secondaryProposalItems: proposalItems.slice(1),
    traces: Array.isArray(record.outputSnapshot?.traces) ? record.outputSnapshot.traces : [],
    verificationHint: firstNonEmptyString(record.outputSnapshot?.verificationHint, "无校验提示"),
    requirementText: firstNonEmptyString(record.outputSnapshot?.requirementText, "无生成内容"),
    requirementType: firstNonEmptyString(record.outputSnapshot?.type, "functional"),
    confidence: record.outputSnapshot?.confidence ?? "--",
    conflictSummary: firstNonEmptyString(conflictSummary, record.outputSnapshot?.conflictNote, "无"),
    reasonCategoryLabel: getReasonCategoryLabel(record.reasonCategory),
    severityLabel: getSeverityLabel(record.severity),
    reasonTags: Array.isArray(record.reasonTags) ? record.reasonTags.filter(Boolean) : [],
    reasonText: firstNonEmptyString(record.reasonText, "无驳回说明"),
    expectedNote: firstNonEmptyString(record.expectedNote, "无"),
    poolStatusLabel: record.poolStatus === "archived" ? "否" : "是",
    replayCount: Number(record.replayCount || 0),
    workOrderId: firstNonEmptyString(selectedTask?.workOrderId, relatedTasks.find((task) => task.workOrderId)?.workOrderId)
  };
}

function buildDialogMetaItem(label, value, { raw = false } = {}) {
  return `
    <span class="record-review-dialog-meta-item">
      <strong>${escapeHtml(label)}</strong>
      ${raw ? value : escapeHtml(value || "-")}
    </span>
  `;
}

function renderRichText(value = "", emptyText = "无") {
  return `<div class="record-review-rich-text">${escapeHtml(value || emptyText)}</div>`;
}

function renderTagPills(values = [], tone = "subtle") {
  if (!values.length) {
    return '<span class="record-review-placeholder">无</span>';
  }
  return `
    <div class="record-review-pill-row">
      ${values.map((value) => `<span class="mini-pill ${tone}">${escapeHtml(value)}</span>`).join("")}
    </div>
  `;
}

function renderReviewMetaItems(items = []) {
  return `
    <div class="record-review-meta-grid">
      ${items
        .filter((item) => item && item.value != null && item.value !== "")
        .map(
          (item) => `
            <article class="record-review-meta-item">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(String(item.value))}</strong>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function buildProposalCard(item = {}, { highlight = false } = {}) {
  const afterText = getProposalAfterText(item);
  const beforeText = firstNonEmptyString(item.before, item.editedPayload?.before);
  const targetScope = [item.targetLayer || "-", item.targetProfileKey || "-", item.targetKind || item.kind || "-"].join(" / ");

  return `
    <article class="record-review-proposal-card ${highlight ? "is-highlight" : ""}">
      <div class="record-review-proposal-head">
        <div>
          <p class="record-review-section-kicker">${highlight ? "主建议" : "附加建议"}</p>
          <h4>${escapeHtml(item.title || "提案修改建议")}</h4>
        </div>
        <span class="mini-pill subtle">${escapeHtml(formatProposalActionLabel(item.action))}</span>
      </div>
      ${renderReviewMetaItems([
        { label: "目标 Skill", value: firstNonEmptyString(item.targetSkillCode, "新增技能项") },
        { label: "目标层级", value: targetScope },
        { label: "变更原因", value: firstNonEmptyString(item.rationale, item.ruleIntent, item.scopeReason, "未提供") }
      ])}
      <div class="record-review-text-panel">
        <span class="record-review-panel-label">建议修改内容</span>
        ${renderRichText(afterText, "当前没有可展示的修改内容。")}
      </div>
      ${beforeText
        ? `
          <div class="record-review-text-panel is-muted">
            <span class="record-review-panel-label">修改前参考</span>
            ${renderRichText(beforeText)}
          </div>
        `
        : ""}
    </article>
  `;
}

function buildValidatorSuggestionsSection(viewModel) {
  if (!viewModel.validatorSuggestions.length) return "";

  return `
    <section class="record-review-section">
      <div class="record-review-section-head">
        <div>
          <p class="record-review-section-kicker">校验补充</p>
          <h3>提案校验建议</h3>
        </div>
        <span class="mini-pill subtle">${viewModel.validatorSuggestions.length} 条</span>
      </div>
      <div class="record-review-suggestion-list">
        ${viewModel.validatorSuggestions
          .map(
            (item) => `
              <article class="record-review-suggestion-card">
                <strong>${escapeHtml(item.title || "校验建议")}</strong>
                ${renderRichText(firstNonEmptyString(item.ruleText, "无规则说明"))}
                ${item.why ? `<p class="record-review-footnote">${escapeHtml(item.why)}</p>` : ""}
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildReplayOutcomeSection(viewModel) {
  if (!viewModel.relatedTasks.length) {
    return `
      <section class="record-review-section">
        <article class="record-review-summary-card is-empty">
          <p class="record-review-section-kicker">Replay 状态</p>
          <h3>这条驳回记录还没有进入 Replay</h3>
          <p class="record-review-empty-copy">当前先展示人工驳回信息和原始生成结果，后续有提案后会自动在这里呈现主建议。</p>
        </article>
      </section>
    `;
  }

  if (!viewModel.primaryProposalItem) {
    const failedCopy = viewModel.selectedTaskStatus === "failed"
      ? firstNonEmptyString(viewModel.selectedTask?.errorMessage, viewModel.replaySummary, "本次 Replay 失败，尚未生成可审阅提案。")
      : firstNonEmptyString(viewModel.replaySummary, viewModel.decisionSummary, "最近一次 Replay 暂未生成可审阅提案。");

    return `
      <section class="record-review-section">
        <article class="record-review-summary-card is-empty">
          <p class="record-review-section-kicker">Replay 状态</p>
          <h3>${escapeHtml(viewModel.selectedTaskStatus === "failed" ? "本次 Replay 未产出提案" : "最近一次 Replay 暂无提案")}</h3>
          <p class="record-review-empty-copy">${escapeHtml(failedCopy)}</p>
        </article>
      </section>
    `;
  }

  const summaryHeading = firstNonEmptyString(viewModel.primaryProposalItem?.title, "建议修改方向");
  const summaryBody = firstNonEmptyString(viewModel.decisionSummary, viewModel.replaySummary);
  const supportingSummary = viewModel.replaySummary && viewModel.replaySummary !== viewModel.decisionSummary
    ? `<p class="record-review-footnote">${escapeHtml(viewModel.replaySummary)}</p>`
    : "";

  return `
    <section class="record-review-section">
      <article class="record-review-summary-card">
        <div class="record-review-section-head">
          <div>
            <p class="record-review-section-kicker">提案修改建议</p>
            <h3>${escapeHtml(summaryHeading)}</h3>
          </div>
          <span class="mini-pill ${escapeHtml(replayTaskStatusTone(viewModel.selectedTaskStatus))}">${escapeHtml(viewModel.selectedTaskStatusLabel)}</span>
        </div>
        ${summaryBody ? renderRichText(summaryBody) : ""}
        ${supportingSummary}
      </article>
      ${buildProposalCard(viewModel.primaryProposalItem, { highlight: true })}
    </section>
  `;
}

function buildManualReviewSidebar(viewModel) {
  return `
    <aside class="record-review-sidebar">
      <article class="record-review-side-card">
        <p class="record-review-section-kicker">人工驳回信息</p>
        <h3>${escapeHtml(viewModel.reasonCategoryLabel)}</h3>
        ${renderReviewMetaItems([
          { label: "严重程度", value: viewModel.severityLabel },
          { label: "是否入池", value: viewModel.poolStatusLabel },
          { label: "回投次数", value: String(viewModel.replayCount) },
          { label: "关联任务", value: String(viewModel.relatedTasks.length) }
        ])}
        <div class="record-review-text-panel">
          <span class="record-review-panel-label">驳回说明</span>
          ${renderRichText(viewModel.reasonText)}
        </div>
        <div class="record-review-text-panel">
          <span class="record-review-panel-label">期望修正</span>
          ${renderRichText(viewModel.expectedNote)}
        </div>
        <div class="record-review-text-panel is-compact">
          <span class="record-review-panel-label">标签</span>
          ${renderTagPills(viewModel.reasonTags)}
        </div>
      </article>
      <article class="record-review-side-card">
        <p class="record-review-section-kicker">当前回放</p>
        <h3>${escapeHtml(viewModel.selectedTask ? "最近一次 Replay" : viewModel.replayStatusLabel)}</h3>
        ${renderReviewMetaItems([
          { label: "Replay 状态", value: viewModel.selectedTaskStatusLabel },
          { label: "最近回投", value: formatDateTime(viewModel.latestReplayAt) },
          { label: "任务 ID", value: firstNonEmptyString(viewModel.selectedTask?.id, "暂无") },
          { label: "技能工单", value: firstNonEmptyString(viewModel.workOrderId, "未创建") }
        ])}
      </article>
    </aside>
  `;
}

function buildSecondaryProposalSection(viewModel) {
  const emptyCopy = viewModel.primaryProposalItem
    ? "当前只有 1 条主建议，其余提案项为空。"
    : "当前没有可展示的附加提案项。";
  return `
    <section class="record-review-section">
      <div class="record-review-section-head">
        <div>
          <p class="record-review-section-kicker">补充建议</p>
          <h3>其余提案项</h3>
        </div>
        <span class="mini-pill subtle">${viewModel.secondaryProposalItems.length} 条</span>
      </div>
      ${viewModel.secondaryProposalItems.length
        ? `
          <div class="record-review-proposal-grid">
            ${viewModel.secondaryProposalItems.map((item) => buildProposalCard(item)).join("")}
          </div>
        `
        : `<div class="record-review-empty-card">${escapeHtml(emptyCopy)}</div>`}
    </section>
  `;
}

function buildTraceSummaryCard(viewModel) {
  return `
    <article class="record-review-support-card">
      <p class="record-review-section-kicker">辅助信息</p>
      <h3>追溯信息</h3>
      ${viewModel.traces.length
        ? `
          <div class="record-review-trace-list">
            ${viewModel.traces
              .slice(0, 6)
              .map(
                (item) => `
                  <div class="record-review-trace-item">
                    <strong>${escapeHtml(item.fileName || "未命名来源")}</strong>
                    <span>${escapeHtml(item.location || "未标注位置")}</span>
                  </div>
                `
              )
              .join("")}
          </div>
          ${viewModel.traces.length > 6 ? `<p class="record-review-footnote">其余 ${viewModel.traces.length - 6} 条追溯信息已省略。</p>` : ""}
        `
        : '<p class="record-review-empty-copy">当前没有可展示的追溯信息。</p>'}
    </article>
  `;
}

function buildReplayHistoryCard(viewModel) {
  return `
    <article class="record-review-support-card">
      <p class="record-review-section-kicker">辅助信息</p>
      <h3>Replay 历史摘要</h3>
      ${viewModel.relatedTasks.length
        ? `
          <div class="record-review-history-list">
            ${viewModel.relatedTasks
              .map((task) => {
                const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
                const isSelected = viewModel.selectedTask?.id === task.id;
                return `
                  <article class="record-review-history-item ${isSelected ? "is-selected" : ""}">
                    <div class="record-review-history-head">
                      <strong>${escapeHtml(task.summary || task.id)}</strong>
                      <span class="mini-pill ${escapeHtml(replayTaskStatusTone(normalizedStatus))}">${escapeHtml(replayTaskStatusLabel(normalizedStatus))}</span>
                    </div>
                    <p>${escapeHtml(formatDateTime(task.updatedAt || task.createdAt))}</p>
                    <p>${getReplayTaskProposalCount(task)} 条提案${isSelected ? " · 当前展示" : ""}</p>
                  </article>
                `;
              })
              .join("")}
          </div>
        `
        : '<p class="record-review-empty-copy">该记录尚未参与 Replay。</p>'}
    </article>
  `;
}

function buildOriginalOutputCard(viewModel) {
  return `
    <article class="record-review-support-card is-wide">
      <p class="record-review-section-kicker">辅助信息</p>
      <h3>原始生成结果</h3>
      ${renderReviewMetaItems([
        { label: "标题", value: viewModel.title },
        { label: "类型", value: viewModel.requirementType },
        { label: "置信度", value: String(viewModel.confidence) },
        { label: "校验提示", value: viewModel.verificationHint }
      ])}
      <div class="record-review-text-panel">
        <span class="record-review-panel-label">生成内容</span>
        ${renderRichText(viewModel.requirementText)}
      </div>
      <div class="record-review-text-panel is-muted">
        <span class="record-review-panel-label">冲突项</span>
        ${renderRichText(viewModel.conflictSummary)}
      </div>
    </article>
  `;
}

function buildRecordDetail(viewModel) {
  return `
    <article class="record-review-layout">
      <section class="record-review-hero">
        <div class="record-review-primary">
          ${buildReplayOutcomeSection(viewModel)}
          ${buildValidatorSuggestionsSection(viewModel)}
        </div>
        ${buildManualReviewSidebar(viewModel)}
      </section>
      ${buildSecondaryProposalSection(viewModel)}
      <section class="record-review-section">
        <div class="record-review-section-head">
          <div>
            <p class="record-review-section-kicker">其他辅助信息</p>
            <h3>追溯与历史</h3>
          </div>
        </div>
        <div class="record-review-support-grid">
          ${buildTraceSummaryCard(viewModel)}
          ${buildReplayHistoryCard(viewModel)}
          ${buildOriginalOutputCard(viewModel)}
        </div>
      </section>
    </article>
  `;
}

function openRecordDetail(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) return;

  const viewModel = buildRecordReviewViewModel(record);
  state.selectedRecordId = recordId;
  const subtitleHtml = [
    buildDialogMetaItem("编号", viewModel.code),
    buildDialogMetaItem("模块", viewModel.moduleName),
    buildDialogMetaItem("Replay 状态", `<span class="mini-pill ${viewModel.replayStatusTone}">${escapeHtml(viewModel.replayStatusLabel)}</span>`, { raw: true }),
    buildDialogMetaItem("最近回投", formatDateTime(viewModel.latestReplayAt))
  ].join("");
  const detailHtml = buildRecordDetail(viewModel);

  if (isEmbeddedFeedbackPool()) {
    postToHost({
      type: "feedback_pool:open_record_review_overlay",
      title: viewModel.title,
      subtitleHtml,
      detailHtml,
      workOrderId: viewModel.workOrderId || ""
    });
    return;
  }

  recordDetailTitle.textContent = viewModel.title;
  recordDetailSubtitle.innerHTML = subtitleHtml;
  recordDetailWorkOrder.hidden = !viewModel.workOrderId;
  recordDetailWorkOrder.dataset.workOrderId = viewModel.workOrderId || "";
  recordDetailContent.innerHTML = detailHtml;
  recordDetailContent.scrollTop = 0;
  postToHost({ type: "feedback_pool:record_detail_opened" });
  recordDetailDialog.showModal();
}

function syncReplayDialogHeight() {
  const storedHeight = readStoredReplayDialogHeight();
  const nextHeight = storedHeight ?? getReplayDialogDefaultHeight();
  applyReplayDialogHeight(nextHeight, { persist: storedHeight !== null });
}

function getReplayDialogHeightBounds() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
  const max = Math.max(520, viewportHeight - 24);
  const preferredMin = window.innerWidth <= 640 ? 460 : 640;
  return {
    min: Math.min(preferredMin, max),
    max
  };
}

function getReplayDialogDefaultHeight() {
  const { min, max } = getReplayDialogHeightBounds();
  const target = Math.round((window.innerHeight || max) * 0.88);
  return Math.min(Math.max(target, min), Math.min(max, 960));
}

function readStoredReplayDialogHeight() {
  try {
    const rawValue = window.localStorage.getItem(REPLAY_DIALOG_HEIGHT_STORAGE_KEY);
    const height = Number.parseFloat(rawValue || "");
    return Number.isFinite(height) ? height : null;
  } catch {
    return null;
  }
}

function writeStoredReplayDialogHeight(height) {
  try {
    window.localStorage.setItem(REPLAY_DIALOG_HEIGHT_STORAGE_KEY, String(height));
  } catch {
    // Ignore storage failures and keep the session interactive.
  }
}

function clampReplayDialogHeight(height) {
  const { min, max } = getReplayDialogHeightBounds();
  const value = Number(height);
  if (!Number.isFinite(value)) return getReplayDialogDefaultHeight();
  return Math.min(Math.max(value, min), max);
}

function getCurrentReplayDialogHeight() {
  const inlineHeight = Number.parseFloat(replayDialog?.style.getPropertyValue("--replay-dialog-height") || "");
  if (Number.isFinite(inlineHeight)) return inlineHeight;

  const measuredHeight = replayDialog?.getBoundingClientRect().height || 0;
  if (Number.isFinite(measuredHeight) && measuredHeight > 0) return measuredHeight;

  return readStoredReplayDialogHeight() ?? getReplayDialogDefaultHeight();
}

function applyReplayDialogHeight(height, { persist = true } = {}) {
  if (!replayDialog) return;

  const nextHeight = Math.round(clampReplayDialogHeight(height));
  replayDialog.style.setProperty("--replay-dialog-height", `${nextHeight}px`);

  if (replayDialogResizer) {
    const { min, max } = getReplayDialogHeightBounds();
    replayDialogResizer.setAttribute("role", "separator");
    replayDialogResizer.setAttribute("aria-orientation", "horizontal");
    replayDialogResizer.setAttribute("aria-valuemin", String(Math.round(min)));
    replayDialogResizer.setAttribute("aria-valuemax", String(Math.round(max)));
    replayDialogResizer.setAttribute("aria-valuenow", String(nextHeight));
  }

  if (persist) {
    writeStoredReplayDialogHeight(nextHeight);
  }
}

function handleReplayDialogResizePointerDown(event) {
  if (!replayDialogResizer || event.button !== 0) return;

  replayDialogResizeState.active = true;
  replayDialogResizeState.pointerId = event.pointerId;
  replayDialogResizeState.startY = event.clientY;
  replayDialogResizeState.startHeight = getCurrentReplayDialogHeight();
  replayDialogResizeState.height = replayDialogResizeState.startHeight;

  replayDialog.classList.add("is-resizing");
  replayDialogResizer.setPointerCapture(event.pointerId);
  replayDialogResizer.addEventListener("pointermove", handleReplayDialogResizePointerMove);
  replayDialogResizer.addEventListener("pointerup", handleReplayDialogResizePointerUp);
  replayDialogResizer.addEventListener("pointercancel", handleReplayDialogResizePointerUp);
  event.preventDefault();
}

function handleReplayDialogResizePointerMove(event) {
  if (!replayDialogResizeState.active) return;

  replayDialogResizeState.height = replayDialogResizeState.startHeight + (event.clientY - replayDialogResizeState.startY);
  applyReplayDialogHeight(replayDialogResizeState.height, { persist: false });
}

function handleReplayDialogResizePointerUp(event) {
  if (!replayDialogResizeState.active) return;

  const fallbackHeight = replayDialogResizeState.startHeight + (event.clientY - replayDialogResizeState.startY);
  const nextHeight = replayDialogResizeState.height || fallbackHeight;
  cleanupReplayDialogResizeSession();
  applyReplayDialogHeight(nextHeight);
}

function cleanupReplayDialogResizeSession() {
  if (!replayDialogResizer || !replayDialogResizeState.active) {
    replayDialog?.classList.remove("is-resizing");
    return;
  }

  if (replayDialogResizer.hasPointerCapture(replayDialogResizeState.pointerId)) {
    replayDialogResizer.releasePointerCapture(replayDialogResizeState.pointerId);
  }

  replayDialogResizer.removeEventListener("pointermove", handleReplayDialogResizePointerMove);
  replayDialogResizer.removeEventListener("pointerup", handleReplayDialogResizePointerUp);
  replayDialogResizer.removeEventListener("pointercancel", handleReplayDialogResizePointerUp);
  replayDialog.classList.remove("is-resizing");

  replayDialogResizeState.active = false;
  replayDialogResizeState.pointerId = null;
  replayDialogResizeState.startY = 0;
  replayDialogResizeState.startHeight = 0;
  replayDialogResizeState.height = 0;
}

function handleReplayDialogResizeKeyDown(event) {
  const step = event.shiftKey ? 80 : 40;

  if (event.key === "ArrowUp") {
    applyReplayDialogHeight(getCurrentReplayDialogHeight() - step);
  } else if (event.key === "ArrowDown") {
    applyReplayDialogHeight(getCurrentReplayDialogHeight() + step);
  } else if (event.key === "PageUp") {
    applyReplayDialogHeight(getCurrentReplayDialogHeight() - step * 2);
  } else if (event.key === "PageDown") {
    applyReplayDialogHeight(getCurrentReplayDialogHeight() + step * 2);
  } else if (event.key === "Home") {
    applyReplayDialogHeight(getReplayDialogHeightBounds().min);
  } else if (event.key === "End") {
    applyReplayDialogHeight(getReplayDialogHeightBounds().max);
  } else {
    return;
  }

  event.preventDefault();
}

async function openReplayDialog(recordIds = []) {
  const selectedRecords = state.records.filter((record) => recordIds.includes(record.id));
  if (!selectedRecords.length) {
    window.alert("当前没有可用于 Replay 的驳回记录。");
    return;
  }

  const moduleIds = [...new Set(selectedRecords.map((record) => String(record.moduleId || "")).filter(Boolean))];
  if (moduleIds.length > 1) {
    window.alert("一次 Replay 仅支持同一功能模块下的驳回记录，请重新选择。");
    return;
  }

  const targetLayerConstraints = [
    ...new Set(
      selectedRecords
        .map((record) => String(record.skillContext?.targetLayerConstraint || record.targetLayerConstraint || "docType").trim())
        .filter(Boolean)
    )
  ];
  if (targetLayerConstraints.length > 1) {
    window.alert("One replay run can only include rejections with the same target layer constraint.");
    return;
  }

  state.replayRecordIds = recordIds;
  state.selectedReplayModuleId = moduleIds[0] || "";
  const module = state.modules.find((item) => item.id === state.selectedReplayModuleId) || null;
  const assets = module?.assets || [];

  replayDialogSubtitle.textContent = `${state.project?.name || "当前项目"} / ${module?.name || "未指定模块"}`;
  replaySelectedRecordsRoot.innerHTML = selectedRecords
    .map(
      (record) => `
        <div class="inline-rule">
          <strong>${escapeHtml(record.requirementCode || record.requirementId || "未编号")}</strong>
          <p>${escapeHtml(record.reasonText || "")}</p>
          <p>Layer: ${escapeHtml(getTargetLayerConstraintLabel(record.skillContext?.targetLayerConstraint || record.targetLayerConstraint || "docType"))}</p>
        </div>
      `
    )
    .join("");

  replayAssetPickerRoot.innerHTML = assets.length
    ? assets
        .map(
          (asset) => `
            <label class="file-item checkbox-item">
              <input type="checkbox" name="referenceAssetIds" value="${asset.id}" />
              <div class="file-item-copy">
                <div class="file-item-title-row">
                  <strong>${escapeHtml(asset.originalName)}</strong>
                  <span class="mini-pill subtle">${escapeHtml(getRoleLabel(asset.role))}</span>
                </div>
                <p>上传时间：${formatDateTime(asset.uploadedAt)}</p>
              </div>
            </label>
          `
        )
        .join("")
    : '<p class="empty-state">当前模块没有可选参考资产。</p>';

  applyReplayDialogHeight(readStoredReplayDialogHeight() ?? getReplayDialogDefaultHeight(), { persist: false });
  replayDialog.showModal();
}

async function submitReplayTask(event) {
  event.preventDefault();
  if (!state.replayRecordIds.length) {
    window.alert("当前没有可用于 Replay 的驳回记录。");
    return;
  }

  const submitButton = replayForm.querySelector('button[type="submit"]');
  const cancelButton = replayFormCancel;
  const referenceAssetIds = [...replayAssetPickerRoot.querySelectorAll('input[name="referenceAssetIds"]:checked')].map((input) => input.value);
  const selectedRecords = state.records.filter((record) => state.replayRecordIds.includes(record.id));
  const targetLayerConstraints = [
    ...new Set(
      selectedRecords
        .map((record) => String(record.skillContext?.targetLayerConstraint || record.targetLayerConstraint || "docType").trim())
        .filter(Boolean)
    )
  ];
  if (targetLayerConstraints.length > 1) {
    window.alert("One replay run can only include rejections with the same target layer constraint.");
    return;
  }
  replayDialog.close();
  if (submitButton) submitButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;

  try {
    const task = await request("/api/replay-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rejectionIds: state.replayRecordIds,
        projectId: state.projectId,
        moduleId: state.selectedReplayModuleId,
        llmProfileId: replayLlmProfileSelect.value || "",
        referenceAssetIds
      })
    });

    state.selectedTaskId = task.id;
    await Promise.all([refreshRecords(), refreshTasks()]);
    renderProjectSummary();
    renderFilters();
    renderRecords();
    renderTaskDrawer();
    const normalizedStatus = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
    if (normalizedStatus === "failed") {
      renderFeedbackStatus(localizeErrorMessage(task.errorMessage || task.summary || "Replay 任务失败"), true);
    } else if (isReplayTaskActive(normalizedStatus)) {
      renderFeedbackStatus(`Replay 任务已${replayTaskStatusLabel(normalizedStatus)}，任务详情将随后台状态自动刷新。`, false);
    } else {
      renderFeedbackStatus(`Replay 任务已生成完成，最新提案已经出现在最近任务里。`, false);
    }
    openTaskDrawer();
  } catch (error) {
    renderProjectSummary();
    renderTaskDrawer();
    renderFeedbackStatus(localizeErrorMessage(error.message || "发起 Replay 失败"), true);
    console.error(error);
  } finally {
    if (submitButton) submitButton.disabled = false;
    if (cancelButton) cancelButton.disabled = false;
  }
}

async function handleFilterChange() {
  state.moduleFilterId = moduleFilterSelect.value || "";
  state.filters.reasonCategory = recordCategoryFilter.value || "";
  state.filters.replayStatus = recordReplayFilter.value || "";
  syncTopNavLinks();
  await Promise.all([refreshRecords(), refreshTasks()]);
  renderProjectSummary();
  renderFilters();
  renderRecords();
  renderTaskDrawer();
}

function handleGlobalClick(event) {
  const trigger = event.target.closest("[data-open-fallback-history]");
  if (!trigger) return;
  event.preventDefault();
  openTaskDrawer();
}

function handleRecordRowClick(event) {
  const replayButton = event.target.closest("[data-record-replay]");
  if (replayButton) {
    openReplayDialog([replayButton.dataset.recordReplay]);
    return;
  }

  const deleteButton = event.target.closest("[data-record-delete]");
  if (deleteButton) {
    deleteRejectionRecord(deleteButton.dataset.recordDelete);
    return;
  }

  const openButton = event.target.closest("[data-record-open]");
  if (!openButton) return;
  openRecordDetail(openButton.dataset.recordOpen);
}

async function deleteRejectionRecord(recordId = "") {
  if (!recordId) return;

  const record = state.records.find((item) => item.id === recordId);
  const title = record?.outputSnapshot?.title || record?.requirementCode || recordId;
  if (!window.confirm(`确认删除这条驳回记录？\n\n${title}\n\n删除后它不会再出现在驳回池中。`)) {
    return;
  }

  try {
    await request(`/api/rejections/${encodeURIComponent(recordId)}`, { method: "DELETE" });
    if (state.selectedRecordId === recordId) {
      state.selectedRecordId = "";
    }
    state.replayRecordIds = state.replayRecordIds.filter((id) => id !== recordId);
    await Promise.all([refreshRecords(), refreshTasks()]);
    renderProjectSummary();
    renderFilters();
    renderRecords();
    renderTaskDrawer();
    renderFeedbackStatus("驳回记录已删除。");
  } catch (error) {
    renderFeedbackStatus(localizeErrorMessage(error.message || "删除驳回记录失败"), true);
    console.error(error);
  }
}

function openWorkOrder(workOrderId = "") {
  if (!workOrderId) return;
  const targetUrl = `/skill-management?view=work-orders&workOrderId=${encodeURIComponent(workOrderId)}`;
  if (window.top && window.top !== window) {
    window.top.location.href = targetUrl;
    return;
  }
  window.location.href = targetUrl;
}

function handleTaskClick(event) {
  const trigger = event.target.closest("[data-task-open]");
  if (!trigger) return;
  state.selectedTaskId = trigger.dataset.taskOpen;
  renderTaskDrawer();
}

async function handleTaskDetailAction(event) {
  const openWorkOrderButton = event.target.closest("[data-open-work-order]");
  if (openWorkOrderButton) {
    openWorkOrder(openWorkOrderButton.dataset.openWorkOrder);
    return;
  }

  const deleteButton = event.target.closest("[data-task-delete]");
  if (deleteButton) {
    const taskId = deleteButton.dataset.taskDelete;
    if (!taskId) return;
    if (!window.confirm("确认删除这条 Fallback 历史任务？删除后不会再出现在历史列表中。")) {
      return;
    }

    await request(`/api/replay-tasks/${taskId}`, { method: "DELETE" });
    if (state.selectedTaskId === taskId) {
      state.selectedTaskId = "";
    }
    await Promise.all([refreshRecords(), refreshTasks()]);
    renderProjectSummary();
    renderFilters();
    renderRecords();
    renderTaskDrawer();
    renderFeedbackStatus("历史任务已删除。");
    return;
  }

  const saveButton = event.target.closest("[data-proposal-save]");
  if (saveButton) {
    const [taskId, proposalItemId] = saveButton.dataset.proposalSave.split(":");
    const statusSelect = taskDrawerDetailRoot.querySelector(`[data-proposal-status="${proposalItemId}"]`);
    const afterInput = taskDrawerDetailRoot.querySelector(`[data-proposal-after="${proposalItemId}"]`);
    const layerInput = taskDrawerDetailRoot.querySelector(`[data-proposal-layer="${proposalItemId}"]`);
    const profileInput = taskDrawerDetailRoot.querySelector(`[data-proposal-profile="${proposalItemId}"]`);
    const skillInput = taskDrawerDetailRoot.querySelector(`[data-proposal-skill="${proposalItemId}"]`);
    const kindInput = taskDrawerDetailRoot.querySelector(`[data-proposal-kind="${proposalItemId}"]`);
    await request(`/api/replay-tasks/${taskId}/proposals/${proposalItemId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: statusSelect.value,
        editedPayload: {
          after: afterInput.value,
          targetLayer: layerInput?.value || "",
          targetProfileKey: profileInput?.value || "",
          targetSkillCode: skillInput?.value || "",
          kind: kindInput?.value || ""
        }
      })
    });
    await refreshTasks();
    renderTaskDrawer();
    return;
  }

  const applyButton = event.target.closest("[data-task-apply]");
  if (applyButton) {
    await request(`/api/replay-tasks/${applyButton.dataset.taskApply}/apply`, { method: "POST" });
    await refreshTasks();
    renderTaskDrawer();
  }
}

function handleTaskDetailChange(event) {
  const layerSelect = event.target.closest("[data-proposal-layer]");
  if (!layerSelect) return;

  const proposalItemId = layerSelect.dataset.proposalLayer;
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId);
  if (!proposalItemId || !selectedTask) return;

  const targetAreas =
    Array.isArray(selectedTask.materialPack?.targetAreas) && selectedTask.materialPack.targetAreas.length
      ? selectedTask.materialPack.targetAreas
      : ["validation"];
  const kindSelect = taskDrawerDetailRoot.querySelector(`[data-proposal-kind="${proposalItemId}"]`);
  const hint = taskDrawerDetailRoot.querySelector(`[data-proposal-kind-hint="${proposalItemId}"]`);
  if (!(kindSelect instanceof HTMLSelectElement)) return;

  const allowedKinds = getAllowedKindsForAreasAndLayer(targetAreas, layerSelect.value || "");
  const currentKind = kindSelect.value || "";
  kindSelect.innerHTML = proposalKindOptions(targetAreas, layerSelect.value || "", currentKind);
  if (!allowedKinds.includes(currentKind)) {
    kindSelect.value = allowedKinds[0] || "";
  }
  if (hint) {
    hint.textContent = proposalKindHint(targetAreas, layerSelect.value || "");
  }
}

function openTaskDrawer() {
  if (isEmbeddedFeedbackPool()) {
    state.externalTaskDrawerOpen = true;
    syncExternalTaskDrawer("feedback_pool:open_history_drawer");
    return;
  }
  taskDrawer.classList.add("is-open");
  taskDrawer.setAttribute("aria-hidden", "false");
  if (taskDrawerBackdrop) taskDrawerBackdrop.hidden = false;
}

function closeTaskDrawer() {
  if (isEmbeddedFeedbackPool()) {
    state.externalTaskDrawerOpen = false;
    postToHost({ type: "feedback_pool:close_history_drawer" });
    return;
  }
  taskDrawer.classList.remove("is-open");
  taskDrawer.setAttribute("aria-hidden", "true");
  if (taskDrawerBackdrop) taskDrawerBackdrop.hidden = true;
}

function replayStatusLabel(status = "") {
  if (status === "running") return "处理中";
  if (status === "proposal_ready") return "已产出提案";
  if (status === "replayed") return "已回投";
  if (status === "failed") return "回投失败";
  return "未回投";
}

function statusTone(status = "") {
  if (status === "running") return "warning";
  if (["proposal_ready", "accepted", "completed", "replayed"].includes(status)) return "success";
  if (["failed", "rejected"].includes(status)) return "danger";
  return "subtle";
}

function replayTaskStatusLabel(status = "") {
  if (status === "queued") return "排队中";
  if (status === "running") return "处理中";
  if (status === "done") return "已完成";
  if (status === "failed") return "已失败";
  if (status === "cancelled") return "已取消";
  return "待处理";
}

function replayTaskStatusTone(status = "") {
  if (status === "queued") return "subtle";
  if (status === "running") return "warning";
  if (status === "done") return "success";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "subtle";
  return "subtle";
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

function isReplayTaskActive(status = "") {
  return ["queued", "running"].includes(normalizeReplayTaskStatus(status));
}

function getActiveReplayTasks() {
  return state.tasks.filter((task) => isReplayTaskActive(task.taskStatus || task.status || ""));
}

function countActiveReplayTasks() {
  return getActiveReplayTasks().length;
}

function getReplayTaskRecordCount(task = {}) {
  return Array.isArray(task.sourceRejectionIds) ? task.sourceRejectionIds.length : 0;
}

function getReplayTaskProposalCount(task = {}) {
  return Array.isArray(task.proposals) ? task.proposals.flatMap((proposal) => proposal.items || []).length : 0;
}

function firstNonEmptyString(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
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
  const normalized = String(value || "").trim().split(/[\\/]/).filter(Boolean);
  return normalized[normalized.length - 1] || "";
}

function getReplayTaskRuntimeSource(task = {}) {
  const runtime = task.runtime && typeof task.runtime === "object" ? task.runtime : null;
  const runtimeInfo = task.runtimeInfo && typeof task.runtimeInfo === "object" ? task.runtimeInfo : null;
  const runtimeSummary = task.runtimeSummary && typeof task.runtimeSummary === "object" ? task.runtimeSummary : null;
  const agent = task.debug?.agent && typeof task.debug.agent === "object" ? task.debug.agent : null;
  const progress = task.progress && typeof task.progress === "object" ? task.progress : null;
  return {
    runtime,
    runtimeInfo,
    runtimeSummary,
    agent,
    progress
  };
}

function getReplayTaskRuntimeSummary(task = {}) {
  const { runtime, runtimeInfo, runtimeSummary, agent, progress } = getReplayTaskRuntimeSource(task);
  const queuedSummary = firstNonEmptyString(
    runtimeSummary?.queueMessage,
    runtimeSummary?.message,
    runtimeInfo?.queueMessage,
    runtimeInfo?.message,
    runtime?.queueMessage,
    runtime?.message,
    progress?.message
  );
  const runningSummary = firstNonEmptyString(
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
  const status = normalizeReplayTaskStatus(task.taskStatus || task.status || "");
  return status === "queued" ? queuedSummary : runningSummary;
}

function getReplayTaskRuntimeMeta(task = {}) {
  const { runtime, runtimeInfo, runtimeSummary, agent, progress } = getReplayTaskRuntimeSource(task);
  const tokenUsage = runtime?.tokenUsage || runtimeInfo?.tokenUsage || runtimeSummary?.tokenUsage || agent?.tokenUsage || null;
  const entries = [
    ["当前阶段", firstNonEmptyString(runtimeSummary?.stageLabel, runtimeSummary?.stage, runtimeInfo?.stageLabel, runtimeInfo?.stage, runtime?.stageLabel, runtime?.stage, progress?.label, progress?.stage)],
    ["队列位置", runtimeSummary?.queuePosition ?? runtimeInfo?.queuePosition ?? runtime?.queuePosition ?? runtimeSummary?.position ?? runtimeInfo?.position ?? runtime?.position ?? ""],
    ["Worker", firstNonEmptyString(runtimeSummary?.workerId, runtimeInfo?.workerId, runtime?.workerId)],
    ["传输", firstNonEmptyString(runtimeSummary?.transport, runtimeInfo?.transport, runtime?.transport, agent?.transport)],
    ["会话", firstNonEmptyString(runtimeSummary?.sessionId, runtimeInfo?.sessionId, runtime?.sessionId, agent?.sessionId)],
    ["开始时间", firstNonEmptyString(runtimeSummary?.startedAt, runtimeInfo?.startedAt, runtime?.startedAt, agent?.startedAt)],
    ["最近心跳", firstNonEmptyString(runtimeSummary?.lastHeartbeatAt, runtimeInfo?.lastHeartbeatAt, runtime?.lastHeartbeatAt, agent?.lastHeartbeatAt)],
    ["最近更新", firstNonEmptyString(runtimeSummary?.updatedAt, runtimeInfo?.updatedAt, runtime?.updatedAt, agent?.lastEventAt, task.updatedAt)],
    ["已运行", formatRuntimeElapsed(runtimeSummary?.elapsedMs ?? runtimeInfo?.elapsedMs ?? runtime?.elapsedMs ?? agent?.elapsedMs)],
    ["总 Token", tokenUsage?.totalTokens ? String(tokenUsage.totalTokens) : ""]
  ];

  return entries.filter(([, value]) => value !== "" && value != null).map(([label, value]) => ({ label, value: String(value) }));
}

function buildReplayTaskRuntimeBlock(task = {}) {
  const meta = getReplayTaskRuntimeMeta(task);
  const summary = getReplayTaskRuntimeSummary(task);
  if (!meta.length && !summary) return "";

  return `
    <div class="detail-block">
      <span class="label">运行信息</span>
      <pre>${escapeHtml([
        summary ? `摘要：${summary}` : "",
        ...meta.map((item) => `${item.label}：${item.value}`)
      ].filter(Boolean).join("\n"))}</pre>
    </div>
  `;
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
  const taskSkillBundle = task.debug?.artifacts?.taskSkillBundle || null;
  const files = [];
  const seen = new Set();
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

  manifestPath ||= firstNonEmptyString(taskSkillBundle?.skillManifestPath, taskSkillBundle?.skillBundlePath);
  (taskSkillBundle?.chunks || []).forEach(pushFile);

  return {
    manifestPath,
    files
  };
}

function summarizeReplayTaskArtifacts(task = {}) {
  const artifactInfo = getReplayTaskArtifactInfo(task);
  const summary = [];
  if (artifactInfo.files.length) {
    summary.push(`产物 ${artifactInfo.files.length} 个`);
  }
  if (artifactInfo.manifestPath) {
    summary.push(`manifest ${safeBasename(artifactInfo.manifestPath) || artifactInfo.manifestPath}`);
  }
  return summary.join(" · ");
}

function buildReplayTaskArtifactBlock(task = {}) {
  const artifactInfo = getReplayTaskArtifactInfo(task);
  if (!artifactInfo.manifestPath && !artifactInfo.files.length) return "";

  return `
    <div class="detail-block">
      <span class="label">产物文件</span>
      <pre>${escapeHtml([
        artifactInfo.manifestPath ? `Manifest：${artifactInfo.manifestPath}` : "",
        ...artifactInfo.files.map((file) =>
          [file.name || safeBasename(file.path), file.role ? `(${file.role})` : "", file.path ? `-> ${file.path}` : "", file.extra ? `· ${file.extra}` : ""]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        )
      ].filter(Boolean).join("\n"))}</pre>
    </div>
  `;
}

function syncReplayTaskPolling() {
  if (!state.projectId) {
    stopReplayTaskPolling();
    return;
  }
  if (countActiveReplayTasks()) {
    if (!replayTaskPollTimer) {
      replayTaskPollTimer = window.setTimeout(pollReplayTaskUpdates, 2500);
    }
    return;
  }
  stopReplayTaskPolling();
}

function stopReplayTaskPolling() {
  if (replayTaskPollTimer) {
    window.clearTimeout(replayTaskPollTimer);
    replayTaskPollTimer = 0;
  }
}

async function pollReplayTaskUpdates() {
  replayTaskPollTimer = 0;
  try {
    await Promise.all([refreshRecords(), refreshTasks()]);
    renderProjectSummary();
    renderFilters();
    renderRecords();
    renderTaskDrawer();
    renderFeedbackStatus();
    renderTaskDrawerButtons();
  } catch (error) {
    console.error("Replay task polling failed", error);
    renderFeedbackStatus(localizeErrorMessage(error.message || "刷新 Replay 任务失败"), true);
  } finally {
    syncReplayTaskPolling();
  }
}

function getTargetLayerConstraintLabel(layer = "") {
  const map = {
    generic: "Generic",
    docType: "DocType",
    domain: "Domain",
    module: "Module"
  };
  return map[layer] || layer || "DocType";
}

function getReasonCategoryLabel(category = "") {
  const map = {
    coverage_gap: "覆盖缺口",
    missing_coverage: "覆盖缺失",
    traceability_issue: "来源追踪问题",
    wording_issue: "表述问题",
    logic_error: "逻辑错误",
    validation_gap: "校验缺失",
    other: "其他"
  };
  return map[category] || category || "其他";
}

function getSeverityLabel(severity = "") {
  if (severity === "high") return "高";
  if (severity === "low") return "低";
  return "中";
}

function getRoleLabel(role) {
  if (role === "system_pdf") return "系统需求";
  if (role === "model_pdf") return "模型文档";
  if (role === "generated_c") return "生成代码";
  if (role === "simulink_slx") return "SLX 模型";
  if (role === "extracted_system_requirement") return "提取系统需求";
  if (role === "extracted_software_requirement") return "提取软件需求";
  if (role === "extracted_detail_design") return "提取详细设计";
  if (role === "extracted_hil_test_case") return "提取 HIL 测试用例";
  if (role === "model_requirement_view_json") return "模型需求 JSON";
  if (role === "reference_requirement_example") return "软件需求样例";
  if (role === "reference_detail_design_example") return "详细设计样例";
  if (role === "reference_hil_test_case_example") return "HIL 用例样例";
  return role || "其他";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("zh-CN") : "未知时间";
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(localizeErrorMessage(data.error || "请求失败"));
  return data;
}

function renderFeedbackStatus(message = "", isError = false) {
  if (!feedbackStatusRoot) return;

  const activeTasks = getActiveReplayTasks();
  const defaultText = activeTasks.length
    ? activeTasks.length === 1
      ? `${activeTasks[0].summary || "Replay 任务处理中"}：${getReplayTaskRuntimeSummary(activeTasks[0]) || "后台状态会自动刷新。"}`
      : `当前有 ${activeTasks.length} 条 Replay 任务正在处理中，任务列表会自动刷新。`
    : "";
  const text = message || defaultText;
  feedbackStatusRoot.hidden = !text;
  feedbackStatusRoot.textContent = text;
  feedbackStatusRoot.classList.toggle("status-busy", activeTasks.length > 0 && !isError);
  feedbackStatusRoot.classList.toggle("danger", Boolean(isError));
}

function localizeErrorMessage(message = "") {
  const normalized = String(message || "").trim();
  if (!normalized) return "操作失败";
  if (normalized === "Request failed") return "请求失败";
  if (normalized === "Replay task not found") return "Replay 任务不存在";
  if (normalized === "Proposal item not found") return "提案条目不存在";
  return normalized;
}

function isEmbeddedFeedbackPool() {
  return window.parent !== window;
}

function buildExternalTaskDrawerPayload() {
  return {
    tasks: state.tasks,
    selectedTaskId: state.selectedTaskId || state.tasks[0]?.id || ""
  };
}

function syncExternalTaskDrawer(type = "feedback_pool:update_history_drawer") {
  postToHost({
    type,
    ...buildExternalTaskDrawerPayload()
  });
}

function postToHost(payload) {
  if (!isEmbeddedFeedbackPool()) return;
  window.parent.postMessage(payload, window.location.origin);
}

function handleHostMessage(event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type === "feedback_pool:parent_history_drawer_closed") {
    state.externalTaskDrawerOpen = false;
  }
}
