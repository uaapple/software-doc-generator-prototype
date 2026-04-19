const query = new URLSearchParams(window.location.search);

const state = {
  projectId: query.get("projectId") || "",
  moduleFilterId: query.get("moduleId") || "",
  project: null,
  modules: [],
  records: [],
  tasks: [],
  selectedRecordId: "",
  selectedTaskId: "",
  replayRecordIds: [],
  selectedReplayModuleId: "",
  pendingReplay: null,
  externalTaskDrawerOpen: false,
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
const recordDetailSubtitle = document.querySelector("#record-detail-subtitle");
const recordDetailContent = document.querySelector("#record-detail-content");
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

let pendingReplayTimer = 0;
const REPLAY_DIALOG_HEIGHT_STORAGE_KEY = "feedback-pool:replay-dialog-height";
const replayDialogResizeState = {
  active: false,
  pointerId: null,
  startY: 0,
  startHeight: 0,
  height: 0
};

syncReplayDialogHeight();

await bootstrap();

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
recordDetailDialog.addEventListener("click", (event) => {
  if (event.target === recordDetailDialog) recordDetailDialog.close();
});
replayForm.addEventListener("submit", submitReplayTask);
replayFormCancel.addEventListener("click", () => replayDialog.close());
replayDialog.addEventListener("click", (event) => {
  if (event.target === replayDialog) replayDialog.close();
});
replayDialog.addEventListener("close", cleanupReplayDialogResizeSession);
replayDialog.addEventListener("cancel", cleanupReplayDialogResizeSession);
if (replayDialogResizer) {
  replayDialogResizer.addEventListener("pointerdown", handleReplayDialogResizePointerDown);
  replayDialogResizer.addEventListener("keydown", handleReplayDialogResizeKeyDown);
}
taskDrawerListRoot.addEventListener("click", handleTaskClick);
taskDrawerDetailRoot.addEventListener("click", handleTaskDetailAction);
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

  if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = state.tasks[0]?.id || "";
  }
}

function renderProjectSummary() {
  const projectName = state.project?.name || "未命名工程";
  const currentModule = state.modules.find((item) => item.id === state.moduleFilterId) || null;
  const replayedCount = state.records.filter((record) => record.replayStatus && record.replayStatus !== "not_started").length;
  const pendingCount = state.pendingReplay ? 1 : 0;

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
    { label: "最近任务", value: state.tasks.length + pendingCount }
  ];

  projectMetricsRoot.innerHTML = metrics
    .map((item) => `<span class="metric"><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></span>`)
    .join("");
}

function renderTaskDrawerButtons() {
  const pendingCount = state.pendingReplay ? 1 : 0;
  const taskCount = state.tasks.length + pendingCount;
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
    .map(
      (record) => `
        <article class="feedback-record-row ${state.selectedRecordId === record.id ? "is-selected" : ""}">
          <button type="button" class="feedback-record-button" data-record-open="${record.id}">
            <span class="feedback-record-code">${escapeHtml(record.requirementCode || record.requirementId || "未编号")}</span>
            <span class="feedback-record-title">${escapeHtml(record.outputSnapshot?.title || "未命名条目")}</span>
            <span class="feedback-record-module">${escapeHtml(record.moduleName || "未指定模块")}</span>
            <span class="feedback-record-category">${escapeHtml(getReasonCategoryLabel(record.reasonCategory))}</span>
            <span class="feedback-record-status"><span class="mini-pill ${statusTone(record.replayStatus)}">${escapeHtml(replayStatusLabel(record.replayStatus))}</span></span>
            <span class="feedback-record-reason">${escapeHtml(record.reasonText || "")}</span>
          </button>
          <div class="feedback-record-actions">
            <button type="button" class="ghost-button" data-record-replay="${record.id}">发起 Replay</button>
          </div>
        </article>
      `
    )
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
  const visibleTasks = state.pendingReplay ? [buildPendingReplayTaskCardData(), ...state.tasks] : state.tasks;

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
      const isPending = task.taskStatus === "running";
      const isFailed = task.taskStatus === "failed";
      const proposalCount = (task.proposals || []).flatMap((proposal) => proposal.items || []).length;
      return `
        <button type="button" class="list-card feedback-task-card ${task.id === state.selectedTaskId ? "is-selected" : ""} ${isPending ? "is-pending" : ""}" data-task-open="${task.id}">
          <strong>${escapeHtml(task.summary || task.id)}</strong>
          <p>${escapeHtml(task.moduleName || "未指定模块")}</p>
          <div class="list-card-meta">
            <span>${task.sourceRejectionIds.length} 条记录</span>
            <span>${proposalCount} 条提案</span>
            <span>${escapeHtml(task.llmProfileId || "本地回放")}</span>
          </div>
          <div class="list-card-meta">
            <span class="mini-pill ${escapeHtml(replayTaskStatusTone(task.taskStatus || ""))}">${escapeHtml(replayTaskStatusLabel(task.taskStatus || ""))}</span>
            <span>${escapeHtml(formatDateTime(task.createdAt))}</span>
          </div>
          ${isPending ? `<p class="inline-hint">${escapeHtml(task.pendingStageMessage || "系统正在处理本次回放任务。")}</p>` : ""}
          ${isFailed ? `<p class="inline-hint">${escapeHtml(task.errorMessage || "任务执行失败，请查看详情。")}</p>` : ""}
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
  if (task.taskStatus === "running") {
    return buildPendingTaskDetail(task);
  }
  if (task.taskStatus === "failed") {
    return buildFailedTaskDetail(task);
  }

  const proposalItems = (task.proposals || []).flatMap((proposal) => proposal.items || []);
  const referenceAssets = task.materialPack?.referenceAssets || [];
  const workOrderSummary = task.workOrderSummary || null;

  return `
    <div class="detail-card feedback-task-detail-card">
      <h3>${escapeHtml(task.summary || task.id)}</h3>
      <p><strong>模块：</strong>${escapeHtml(task.moduleName || "未指定模块")}</p>
      <p><strong>记录数：</strong>${task.sourceRejectionIds.length}</p>
      <p><strong>模型：</strong>${escapeHtml(task.llmProfileId || "本地回放")}</p>
      <p><strong>参考资产：</strong>${escapeHtml(referenceAssets.map((asset) => asset.originalName || asset.fileName || asset.id).join("，") || "未选择")}</p>
      ${task.workOrderId ? `<p><strong>技能工单：</strong>${escapeHtml(task.workOrderId)} · ${escapeHtml(workOrderSummary?.status || "pending_review")}</p>` : ""}
      <div class="detail-actions-row">
        <button type="button" data-task-apply="${task.id}">应用已接受提案</button>
        ${task.workOrderId ? `<button type="button" class="ghost-button" data-open-work-order="${task.workOrderId}">查看技能工单</button>` : ""}
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
                      <input data-proposal-layer="${item.proposalItemId}" value="${escapeHtml(item.targetLayer || "")}" />
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
                      <input data-proposal-kind="${item.proposalItemId}" value="${escapeHtml(item.kind || "")}" />
                    </label>
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

function formatProposalActionLabel(action = "") {
  const map = {
    add_skill_item: "新增技能项",
    modify_skill_item: "修改技能项",
    split_skill_item: "拆分技能项",
    deprecate_skill_item: "废弃技能项"
  };
  return map[action] || action || "未指定动作";
}

function buildPendingTaskDetail(task) {
  return `
    <div class="detail-card feedback-task-detail-card feedback-task-detail-card-pending">
      <div class="feedback-pending-orbit" aria-hidden="true"></div>
      <h3>${escapeHtml(task.summary || "Replay / Fallback 正在处理中")}</h3>
      <p><strong>模块：</strong>${escapeHtml(task.moduleName || "未指定模块")}</p>
      <p><strong>记录数：</strong>${task.sourceRejectionIds.length}</p>
      <p><strong>模型：</strong>${escapeHtml(task.llmProfileId || "本地回放")}</p>
      <p><strong>当前阶段：</strong>${escapeHtml(task.pendingStageLabel || "正在处理中")}</p>
      <p class="summary">${escapeHtml(task.pendingStageMessage || "系统已接收请求，正在整理驳回记录、参考资产和候选技能规则。")}</p>
      <div class="feedback-pending-timeline">
        ${buildPendingTimeline(task)}
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
          <pre>${String(task.sourceRejectionIds.length || 0)}</pre>
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
      <div class="empty-state">这次远端任务已经按失败状态保留在历史里，没有生成提案和技能工单。</div>
    </div>
  `;
}

function buildPendingTimeline(task) {
  const phaseIndex = Number(task.pendingPhaseIndex || 0);
  const phases = replayPendingPhases();
  return phases
    .map(
      (phase, index) => `
        <article class="feedback-pending-step ${index <= phaseIndex ? "is-active" : ""}">
          <strong>${escapeHtml(phase.label)}</strong>
          <p>${escapeHtml(phase.copy)}</p>
        </article>
      `
    )
    .join("");
}

function buildRecordDetail(record) {
  const relatedTasks = state.tasks.filter((task) => (task.sourceRejectionIds || []).includes(record.id));
  const proposalHits = relatedTasks.flatMap((task) =>
    (task.proposals || []).flatMap((proposal) =>
      (proposal.items || []).filter((item) => (item.evidenceRefs || []).includes(record.id)).map((item) => ({ task, item }))
    )
  );

  return `
    <article class="detail-card feedback-detail-card">
      <div class="detail-header-row">
        <div>
          <h3>${escapeHtml(record.outputSnapshot?.title || record.requirementCode || "驳回记录")}</h3>
          <p class="summary">${escapeHtml(record.requirementCode || record.requirementId || "未编号")} · ${escapeHtml(record.moduleName || "未指定模块")}</p>
        </div>
        <span class="mini-pill ${statusTone(record.replayStatus)}">${escapeHtml(replayStatusLabel(record.replayStatus))}</span>
      </div>

      <div class="detail-block-grid">
        <div class="detail-block">
          <span class="label">标题</span>
          <pre>${escapeHtml(record.outputSnapshot?.title || "")}</pre>
        </div>
        <div class="detail-block">
          <span class="label">生成摘要</span>
          <pre>${escapeHtml(record.outputSnapshot?.type || "functional")} · 置信度 ${String(record.outputSnapshot?.confidence ?? "--")}\n${escapeHtml(record.outputSnapshot?.verificationHint || "无校验提示")}</pre>
        </div>
      </div>

      <div class="detail-block">
        <span class="label">生成内容</span>
        <pre>${escapeHtml(record.outputSnapshot?.requirementText || "")}</pre>
      </div>

      <div class="detail-block-grid">
        <div class="detail-block">
          <span class="label">冲突项</span>
          <pre>${escapeHtml((record.outputSnapshot?.conflicts || []).map((item) => `${item.code}: ${item.message}`).join("\n") || record.outputSnapshot?.conflictNote || "无")}</pre>
        </div>
        <div class="detail-block">
          <span class="label">追溯信息</span>
          <pre>${escapeHtml((record.outputSnapshot?.traces || []).map((item) => `${item.fileName} @ ${item.location}`).join("\n") || "无")}</pre>
        </div>
      </div>

      <div class="detail-block">
        <span class="label">来源片段</span>
        <pre>${escapeHtml((record.sourceRefsSnapshot || []).map((item) => `${item.fileName} @ ${item.location}: ${item.excerpt}`).join("\n\n") || "无")}</pre>
      </div>

      <div class="detail-block-grid">
        <div class="detail-block">
          <span class="label">人工驳回信息</span>
          <p><strong>分类：</strong>${escapeHtml(getReasonCategoryLabel(record.reasonCategory))}</p>
          <p><strong>标签：</strong>${escapeHtml((record.reasonTags || []).join("，") || "无")}</p>
          <p><strong>严重程度：</strong>${escapeHtml(getSeverityLabel(record.severity))}</p>
          <p><strong>驳回说明：</strong>${escapeHtml(record.reasonText || "")}</p>
          <p><strong>期望修正：</strong>${escapeHtml(record.expectedNote || "无")}</p>
          <p><strong>是否入池：</strong>${record.poolStatus === "archived" ? "否" : "是"}</p>
        </div>
        <div class="detail-block">
          <span class="label">Replay 状态</span>
          <p><strong>当前状态：</strong>${escapeHtml(replayStatusLabel(record.replayStatus))}</p>
          <p><strong>回投次数：</strong>${record.replayCount || 0}</p>
          <p><strong>最近回投：</strong>${escapeHtml(formatDateTime(record.lastReplayAt))}</p>
          <p><strong>关联任务：</strong>${relatedTasks.length}</p>
        </div>
      </div>

      <div class="detail-block">
        <span class="label">关联 Replay 任务</span>
        ${relatedTasks.length
          ? relatedTasks
              .map(
                (task) => `
                  <div class="inline-rule">
                    <strong>${escapeHtml(task.summary || task.id)}</strong>
                    <p>${escapeHtml(task.moduleName || "未指定模块")} · ${formatDateTime(task.createdAt)}</p>
                  </div>
                `
              )
              .join("")
          : '<p class="empty-state">该记录尚未参与 Replay。</p>'}
      </div>

      <div class="detail-block">
        <span class="label">命中的提议项</span>
        ${proposalHits.length
          ? proposalHits
              .map(
                ({ task, item }) => `
                  <div class="inline-rule">
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.action)} · ${escapeHtml(task.summary || task.id)}</p>
                  </div>
                `
              )
              .join("")
          : '<p class="empty-state">当前没有命中的提案。</p>'}
      </div>
    </article>
  `;
}

function openRecordDetail(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) return;
  state.selectedRecordId = recordId;
  recordDetailSubtitle.textContent = `${record.requirementCode || record.requirementId || "未编号"} · ${record.moduleName || "未指定模块"}`;
  recordDetailContent.innerHTML = buildRecordDetail(record);
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
  if (state.pendingReplay) {
    window.alert("当前已有一条 Replay / Fallback 任务正在处理中，请等待它完成后再发起新的任务。");
    return;
  }

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
  const module = state.modules.find((item) => item.id === state.selectedReplayModuleId) || null;
  const pendingReplay = createPendingReplayState({
    records: selectedRecords,
    module,
    llmProfileId: replayLlmProfileSelect.value || "",
    referenceAssetIds
  });

  setPendingReplay(pendingReplay);
  renderProjectSummary();
  renderTaskDrawer();
  renderFeedbackStatus();
  openTaskDrawer();
  replayDialog.close();
  if (submitButton) submitButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;

  await waitForNextPaint();

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

    clearPendingReplay();
    state.selectedTaskId = task.id;
    await Promise.all([refreshRecords(), refreshTasks()]);
    renderProjectSummary();
    renderFilters();
    renderRecords();
    renderTaskDrawer();
    if (task.taskStatus === "failed") {
      renderFeedbackStatus(localizeErrorMessage(task.errorMessage || task.summary || "Replay 任务失败"), true);
    } else {
      renderFeedbackStatus(`Replay 任务已生成完成，最新提案已经出现在最近任务里。`, false);
    }
    openTaskDrawer();
  } catch (error) {
    clearPendingReplay();
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

  const openButton = event.target.closest("[data-record-open]");
  if (!openButton) return;
  openRecordDetail(openButton.dataset.recordOpen);
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
    const workOrderId = openWorkOrderButton.dataset.openWorkOrder;
    window.location.href = `/skill-management?view=work-orders&workOrderId=${encodeURIComponent(workOrderId)}`;
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
  if (status === "running") return "处理中";
  if (status === "done") return "已完成";
  if (status === "failed") return "已失败";
  return "待处理";
}

function replayTaskStatusTone(status = "") {
  if (status === "running") return "warning";
  if (status === "done") return "success";
  if (status === "failed") return "danger";
  return "subtle";
}

function getReasonCategoryLabel(category = "") {
  const map = {
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

function createPendingReplayState({ records = [], module = null, llmProfileId = "", referenceAssetIds = [] } = {}) {
  const createdAt = new Date().toISOString();
  return {
    id: `pending-replay-${Date.now()}`,
    projectId: state.projectId,
    moduleId: module?.id || state.selectedReplayModuleId || "",
    moduleName: module?.name || records[0]?.moduleName || "未指定模块",
    sourceRejectionIds: records.map((record) => record.id),
    referenceAssetIds,
    llmProfileId,
    proposals: [],
    taskStatus: "running",
    summary: llmProfileId ? "Replay 提案生成中" : "Fallback 提案生成中",
    createdAt,
    updatedAt: createdAt,
    pendingPhaseIndex: 0,
    pendingStageLabel: replayPendingPhases()[0].label,
    pendingStageMessage: replayPendingPhases()[0].copy
  };
}

function setPendingReplay(pendingReplay) {
  state.pendingReplay = pendingReplay;
  state.selectedTaskId = pendingReplay.id;
  startPendingReplayTimer();
}

function clearPendingReplay() {
  state.pendingReplay = null;
  stopPendingReplayTimer();
}

function startPendingReplayTimer() {
  stopPendingReplayTimer();
  updatePendingReplayPhase();
  pendingReplayTimer = window.setInterval(() => {
    updatePendingReplayPhase();
    renderTaskDrawer();
    renderFeedbackStatus();
  }, 1200);
}

function stopPendingReplayTimer() {
  if (pendingReplayTimer) {
    window.clearInterval(pendingReplayTimer);
    pendingReplayTimer = 0;
  }
}

function updatePendingReplayPhase() {
  if (!state.pendingReplay) return;
  const phases = replayPendingPhases();
  const elapsedMs = Date.now() - new Date(state.pendingReplay.createdAt).getTime();
  let nextIndex = 0;
  if (elapsedMs >= 24000) {
    nextIndex = 3;
  } else if (elapsedMs >= 12000) {
    nextIndex = 2;
  } else if (elapsedMs >= 4000) {
    nextIndex = 1;
  }
  const phase = phases[nextIndex] || phases[0];
  state.pendingReplay = {
    ...state.pendingReplay,
    pendingPhaseIndex: nextIndex,
    pendingStageLabel: phase.label,
    pendingStageMessage: phase.copy,
    updatedAt: new Date().toISOString()
  };
}

function replayPendingPhases() {
  return [
    {
      label: "已发起任务",
      copy: "系统已经接收本次 Replay / Fallback 请求，正在准备回放材料。"
    },
    {
      label: "整理上下文",
      copy: "正在汇总驳回记录、参考资产和候选技能规则，准备生成提案。"
    },
    {
      label: "生成提案",
      copy: "正在产出可审阅的 Replay / Fallback 提案，这一步通常会稍微久一点。"
    },
    {
      label: "写回结果",
      copy: "正在整理提案、生成技能工单并刷新最近任务列表。"
    }
  ];
}

function buildPendingReplayTaskCardData() {
  return state.pendingReplay;
}

function renderFeedbackStatus(message = "", isError = false) {
  if (!feedbackStatusRoot) return;

  const pending = state.pendingReplay;
  const text = message || (pending ? `${pending.summary}：${pending.pendingStageMessage}` : "");
  feedbackStatusRoot.hidden = !text;
  feedbackStatusRoot.textContent = text;
  feedbackStatusRoot.classList.toggle("status-busy", Boolean(pending) && !isError);
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

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function isEmbeddedFeedbackPool() {
  return window.parent !== window;
}

function buildExternalTaskDrawerPayload() {
  return {
    tasks: state.pendingReplay ? [buildPendingReplayTaskCardData(), ...state.tasks] : state.tasks,
    selectedTaskId: state.selectedTaskId || state.pendingReplay?.id || state.tasks[0]?.id || ""
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
