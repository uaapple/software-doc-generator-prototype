const DEFAULT_TEMPLATE_TASK_ID = "d26e2449-847d-435f-bbd4-c8aab1dc8e88";
const query = new URLSearchParams(window.location.search);

const state = {
  tasks: [],
  llmMeta: null,
  selectedTemplateId: "",
  template: null,
  latestRun: null,
  rerunProfileId: "",
  validationProfileId: "",
  selectedAssetIds: new Set(),
  validationTask: null,
  validationPollTimer: null
};

const pageStatusRoot = document.querySelector("#page-status");
const refreshButton = document.querySelector("#refresh-page");
const templateTaskSelect = document.querySelector("#template-task-select");
const templateSummaryRoot = document.querySelector("#template-summary");
const rerunProfileSelect = document.querySelector("#rerun-llm-profile-select");
const validationProfileSelect = document.querySelector("#validation-llm-profile-select");
const rerunButton = document.querySelector("#rerun-button");
const currentPreviewMetricsRoot = document.querySelector("#current-preview-metrics");
const validationContextRoot = document.querySelector("#validation-context");
const validationAssetsRoot = document.querySelector("#validation-assets");
const startValidationButton = document.querySelector("#start-validation-button");
const validationRunRoot = document.querySelector("#validation-run");
const compareOverviewRoot = document.querySelector("#compare-overview");
const ruleDiagnosticsRoot = document.querySelector("#rule-diagnostics");
const promptPreviewRoot = document.querySelector("#prompt-preview");
const resultOverviewRoot = document.querySelector("#result-overview");
const workOrderReviewRoot = document.querySelector("#work-order-review");
const rawPanelsRoot = document.querySelector("#raw-panels");

refreshButton.addEventListener("click", () => bootstrap(true));
templateTaskSelect.addEventListener("change", handleTemplateChange);
rerunProfileSelect.addEventListener("change", () => {
  state.rerunProfileId = rerunProfileSelect.value || "";
});
validationProfileSelect.addEventListener("change", () => {
  state.validationProfileId = validationProfileSelect.value || "";
});
rerunButton.addEventListener("click", handleRerun);
startValidationButton.addEventListener("click", handleValidationStart);
validationAssetsRoot.addEventListener("change", handleAssetToggle);
workOrderReviewRoot.addEventListener("click", handleWorkOrderAction);

await bootstrap(false);

async function bootstrap(force = false) {
  clearValidationPolling();
  try {
    if (force) {
      setStatus("正在刷新 Replay Lab 数据...");
    }

    const [defaultTemplate, tasksPayload, llmMeta] = await Promise.all([
      request("/api/replay-lab/default-template"),
      request("/api/replay-tasks"),
      request("/api/llm-profiles")
    ]);

    state.tasks = tasksPayload.tasks || [];
    state.llmMeta = llmMeta;

    const requestedTemplateId = query.get("templateTaskId") || state.selectedTemplateId || defaultTemplate.taskId || DEFAULT_TEMPLATE_TASK_ID;
    const resolvedTemplateId = state.tasks.some((item) => item.id === requestedTemplateId)
      ? requestedTemplateId
      : state.tasks[0]?.id || requestedTemplateId;

    renderTemplateOptions();
    renderProfileOptions();
    await loadTemplate(resolvedTemplateId);

    const requestedRunId = query.get("runTaskId");
    if (requestedRunId) {
      await loadRun(requestedRunId);
    }

    setStatus(force ? "Replay Lab 已刷新。" : "Replay Lab 已准备就绪。");
  } catch (error) {
    setStatus(`加载 Replay Lab 失败：${error.message}`, true);
  }
}

async function loadTemplate(taskId) {
  state.selectedTemplateId = taskId;
  templateTaskSelect.value = taskId;
  const payload = await request(`/api/replay-lab/templates/${encodeURIComponent(taskId)}`);
  state.template = payload;
  state.latestRun = null;
  state.validationTask = null;
  state.rerunProfileId = state.rerunProfileId || payload.templateTask?.llmProfileId || state.llmMeta?.defaultProfileId || "";
  state.validationProfileId = state.validationProfileId || state.rerunProfileId || state.llmMeta?.defaultProfileId || "";
  state.selectedAssetIds = new Set((payload.validationContext?.assets || []).map((item) => item.id));
  syncTemplateQuery();
  renderAll();
}

async function loadRun(taskId) {
  setStatus("正在加载最新重跑结果...");
  const payload = await request(`/api/replay-lab/runs/${encodeURIComponent(taskId)}`);
  state.latestRun = payload;
  syncRunQuery(taskId);
  renderAll();
  setStatus("最新重跑结果已刷新。");
}

function renderAll() {
  renderTemplateOptions();
  renderProfileOptions();
  renderTemplateSummary();
  renderCurrentPreviewMetrics();
  renderValidationContext();
  renderCompareOverview();
  renderRuleDiagnostics();
  renderPromptPreview();
  renderResultOverview();
  renderWorkOrderReview();
  renderRawPanels();
}

function renderTemplateOptions() {
  const knownIds = new Set(state.tasks.map((item) => item.id));
  const options = [...state.tasks];
  if (state.template?.templateTask?.id && !knownIds.has(state.template.templateTask.id)) {
    options.unshift(state.template.templateTask);
  }

  templateTaskSelect.innerHTML = options
    .map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(formatTaskOption(task))}</option>`)
    .join("");

  if (state.selectedTemplateId) {
    templateTaskSelect.value = state.selectedTemplateId;
  }
}

function renderProfileOptions() {
  const profiles = state.llmMeta?.profiles || [];
  const defaultOption = '<option value="">未选择，使用本地回放模式</option>';
  const options = profiles
    .map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(`${profile.name} / ${profile.providerLabel}`)}</option>`)
    .join("");
  rerunProfileSelect.innerHTML = `${defaultOption}${options}`;
  validationProfileSelect.innerHTML = `${defaultOption}${options}`;
  rerunProfileSelect.value = state.rerunProfileId || "";
  validationProfileSelect.value = state.validationProfileId || "";
}

function renderTemplateSummary() {
  const templateTask = state.template?.templateTaskSummary;
  if (!templateTask) {
    templateSummaryRoot.innerHTML = '<div class="empty-state">请选择一个模板任务。</div>';
    return;
  }

  templateSummaryRoot.innerHTML = [
    metaItem("任务 ID", templateTask.id || "-"),
    metaItem("状态", formatReplayTaskStatus(templateTask.taskStatus || "")),
    metaItem("模块 / 文档类型", `${templateTask.moduleName || "-"} / ${templateTask.materialPackSummary?.moduleContext?.documentType || "-"}`),
    metaItem("层级约束", templateTask.materialPackSummary?.targetLayerConstraint || "-"),
    metaItem("结论摘要", templateTask.decisionSummary || templateTask.summary || "-"),
    metaItem("Layer Skill 数", String(templateTask.materialPackSummary?.layerSkillCount || templateTask.materialPackSummary?.candidateSkillCount || 0)),
    metaItem("参考文件数", String(templateTask.materialPackSummary?.referenceAssetCount || 0))
  ].join("");
}

function renderCurrentPreviewMetrics() {
  const preview = state.template?.currentPreview;
  if (!preview) {
    currentPreviewMetricsRoot.innerHTML = "";
    return;
  }

  const cards = [
    { label: "Layer Skill", value: preview.activeSkillSummary?.layerSkillCount || preview.activeSkillSummary?.candidateSkillCount || 0 },
    { label: "参考文件", value: preview.activeSkillSummary?.referenceAssetCount || 0 },
    { label: "命中 Profile", value: (preview.activeSkillSummary?.selectedProfiles || []).length },
    { label: "层级约束", value: preview.activeSkillSummary?.targetLayerConstraint || "-" },
    { label: "Rule Index", value: preview.materialPack?.ruleIndexVersion || "-" }
  ];

  currentPreviewMetricsRoot.innerHTML = cards
    .map(
      (card) => `
        <div class="lab-metric-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(String(card.value))}</strong>
        </div>
      `
    )
    .join("");
}

function renderValidationContext() {
  const validation = state.template?.validationContext;
  if (!validation) {
    validationContextRoot.innerHTML = '<div class="empty-state">当前模板没有可验证的模块上下文。</div>';
    validationAssetsRoot.innerHTML = "";
    validationRunRoot.innerHTML = "";
    startValidationButton.disabled = true;
    return;
  }

  startValidationButton.disabled = !(validation.projectId && validation.moduleId && (validation.assets || []).length);
  validationContextRoot.innerHTML = [
    metaItem("工程", validation.projectName || "-"),
    metaItem("模块", validation.moduleName || "-"),
    metaItem("文档类型", validation.documentType || "software_requirement"),
    metaItem("初始化状态", validation.initialization?.hasModuleProfile ? "module skill ready" : "需检查初始化")
  ].join("");

  validationAssetsRoot.innerHTML = (validation.assets || []).length
    ? validation.assets
        .map(
          (asset) => `
            <label class="lab-checkbox-item">
              <input type="checkbox" value="${escapeHtml(asset.id)}" ${state.selectedAssetIds.has(asset.id) ? "checked" : ""} />
              <div>
                <strong>${escapeHtml(asset.originalName || asset.id)}</strong>
                <p>${escapeHtml(getAssetRoleLabel(asset.role || ""))}</p>
              </div>
            </label>
          `
        )
        .join("")
    : '<div class="empty-state">当前模块没有可用于验证的资产。</div>';

  renderValidationRun();
}

function renderValidationRun() {
  const task = state.validationTask;
  if (!task) {
    validationRunRoot.innerHTML = '<div class="empty-state">还没有发起验证生成。</div>';
    return;
  }

  const resultPreview = Array.isArray(task.resultItems) && task.resultItems.length
    ? task.resultItems
        .slice(0, 2)
        .map(
          (item) => `
            <article class="mini-preview-card">
              <strong>${escapeHtml(item.title || item.requirementId || item.id)}</strong>
              <p>${escapeHtml(item.requirementText || "")}</p>
            </article>
          `
        )
        .join("")
    : "";

  validationRunRoot.innerHTML = `
    ${metaItem("任务 ID", task.id || "-")}
    ${metaItem("状态", formatGenerationTaskStatus(task.status || ""))}
    ${metaItem("摘要", task.summary || "-")}
    ${task.id && state.template?.validationContext?.projectId && state.template?.validationContext?.moduleId ? `
      <a class="text-link" href="/projects/${encodeURIComponent(state.template.validationContext.projectId)}/modules/${encodeURIComponent(state.template.validationContext.moduleId)}?highlightTaskId=${encodeURIComponent(task.id)}" target="_blank" rel="noreferrer">打开模块页查看任务</a>
    ` : ""}
    ${resultPreview ? `<div class="mini-preview-stack">${resultPreview}</div>` : ""}
  `;
}

function renderCompareOverview() {
  const original = state.template?.templateTaskSummary;
  const latest = state.latestRun?.taskSummary;

  compareOverviewRoot.innerHTML = `
    ${renderRunSummaryCard("原始任务", original, state.template?.templateWorkOrder)}
    ${renderRunSummaryCard("最新重跑", latest, state.latestRun?.workOrder)}
  `;
}

function renderRuleDiagnostics() {
  const diagnostics = state.template?.currentPreview?.ruleDiagnostics;
  if (!diagnostics) {
    ruleDiagnosticsRoot.innerHTML = '<div class="empty-state">没有规则诊断信息。</div>';
    return;
  }

  const before = diagnostics.before || {};
  const after = diagnostics.after || {};
  ruleDiagnosticsRoot.innerHTML = `
    ${renderDiagnosticCard("刷新前", before)}
    ${renderDiagnosticCard("当前使用", after)}
  `;
}

function renderPromptPreview() {
  const preview = state.template?.currentPreview;
  if (!preview) {
    promptPreviewRoot.innerHTML = '<div class="empty-state">没有最新重建输入可展示。</div>';
    return;
  }

  const selectedProfiles = (preview.activeSkillSummary?.selectedProfiles || []).map((item) => `${item.kind}:${item.key}`).join(" -> ") || "-";
  promptPreviewRoot.innerHTML = `
    <article class="prompt-card">
      <strong>重建输入摘要</strong>
      <div class="lab-meta-list">
        ${metaItem("命中 Profile", selectedProfiles)}
        ${metaItem("Layer Skill 数", String(preview.activeSkillSummary?.layerSkillCount || preview.activeSkillSummary?.candidateSkillCount || 0))}
        ${metaItem("参考文件数", String(preview.activeSkillSummary?.referenceAssetCount || 0))}
      </div>
      <details>
        <summary>查看 System Prompt</summary>
        <pre>${escapeHtml(preview.promptPreview?.systemPrompt || "")}</pre>
      </details>
      <details open>
        <summary>查看 User Prompt</summary>
        <pre>${escapeHtml(preview.promptPreview?.userPrompt || "")}</pre>
      </details>
    </article>
  `;
}

function renderResultOverview() {
  const originalTask = state.template?.templateTask;
  const latestTask = state.latestRun?.task;

  resultOverviewRoot.innerHTML = `
    ${renderProposalCard("原始 Replay 结果", originalTask)}
    ${renderProposalCard("最新 Replay 结果", latestTask)}
  `;
}

function renderWorkOrderReview() {
  const workOrder = state.latestRun?.workOrder;
  if (!workOrder) {
    workOrderReviewRoot.innerHTML = '<div class="empty-state">先点击左侧按钮重跑，最新工单会出现在这里。</div>';
    return;
  }

  workOrderReviewRoot.innerHTML = `
    <section class="work-order-block">
      <div class="detail-header-row">
        <div>
          <h3>${escapeHtml(workOrder.title || workOrder.id)}</h3>
          <p class="summary">${escapeHtml(workOrder.decisionSummary || workOrder.summary || "")}</p>
        </div>
        <span class="mini-pill ${statusTone(workOrder.status)}">${escapeHtml(formatWorkOrderStatus(workOrder.status))}</span>
      </div>
      <div class="lab-meta-list">
        ${metaItem("来源任务", workOrder.sourceTaskId || "-")}
        ${metaItem("模块 / 文档类型", `${workOrder.moduleName || "-"} / ${workOrder.documentType || "-"}`)}
        ${metaItem("修改项统计", `${workOrder.itemStats?.total || 0} total / ${workOrder.itemStats?.applied || 0} applied`)}
      </div>
      <div class="work-order-item-stack">
        ${(workOrder.items || []).map(renderWorkOrderItem).join("")}
      </div>
      ${(workOrder.validatorSuggestions || []).length ? `
        <div class="validator-suggestion-stack">
          ${(workOrder.validatorSuggestions || []).map(renderValidatorSuggestion).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderRawPanels() {
  const originalTask = state.template?.templateTask;
  const originalWorkOrder = state.template?.templateWorkOrder;
  const currentPreview = state.template?.currentPreview;
  const latestRun = state.latestRun;

  const panels = [
    createJsonPanel("历史 Task JSON", originalTask),
    createJsonPanel("历史 Work Order JSON", originalWorkOrder),
    createJsonPanel("历史 Material Pack", originalTask?.materialPack || null),
    createTextPanel("历史 Prompt（基于存档 material pack 格式化）", state.template?.templatePromptPreview?.userPrompt || ""),
    createJsonPanel("最新重建 Material Pack", currentPreview?.materialPack || null),
    createTextPanel("最新重建 Prompt", currentPreview?.promptPreview?.userPrompt || ""),
    createJsonPanel("最新 Run Task JSON", latestRun?.task || null),
    createJsonPanel("最新 Run Work Order JSON", latestRun?.workOrder || null)
  ];

  rawPanelsRoot.innerHTML = panels.join("");
}

async function handleTemplateChange() {
  const taskId = templateTaskSelect.value || "";
  if (!taskId) return;
  setStatus("正在切换模板任务...");
  await loadTemplate(taskId);
  setStatus("模板任务已切换。");
}

async function handleRerun() {
  if (!state.selectedTemplateId) return;
  try {
    rerunButton.disabled = true;
    setStatus("正在基于当前规则重跑 replay...");
    const result = await request(`/api/replay-lab/templates/${encodeURIComponent(state.selectedTemplateId)}/rerun`, {
      method: "POST",
      body: JSON.stringify({
        llmProfileId: state.rerunProfileId || ""
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });
    state.template.currentPreview = result.currentPreview;
    await loadRun(result.latestRunTaskId);
    await refreshTaskList();
    setStatus("Replay 重跑完成，已加载最新结果。");
  } catch (error) {
    setStatus(`重跑 replay 失败：${error.message}`, true);
  } finally {
    rerunButton.disabled = false;
  }
}

async function handleValidationStart() {
  const validation = state.template?.validationContext;
  if (!validation?.projectId || !validation?.moduleId) return;
  const selectedAssetIds = [...state.selectedAssetIds];
  if (!selectedAssetIds.length) {
    setStatus("请至少选择一个用于验证生成的资产。", true);
    return;
  }

  try {
    startValidationButton.disabled = true;
    setStatus("正在发起软件需求生成验证...");
    const formData = new FormData();
    formData.set("assetIds", selectedAssetIds.join(","));
    formData.set("documentType", validation.documentType || "software_requirement");
    if (state.validationProfileId) {
      formData.set("llmProfileId", state.validationProfileId);
    }

    const result = await request(
      `/api/projects/${encodeURIComponent(validation.projectId)}/modules/${encodeURIComponent(validation.moduleId)}/spaces/${encodeURIComponent(validation.documentType || "software_requirement")}/tasks`,
      {
        method: "POST",
        body: formData
      }
    );

    state.validationTask = result.task || null;
    renderValidationRun();
    setStatus("验证任务已启动。");
    scheduleValidationPoll();
  } catch (error) {
    setStatus(`发起验证生成失败：${error.message}`, true);
  } finally {
    startValidationButton.disabled = false;
  }
}

function handleAssetToggle(event) {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  if (input.checked) {
    state.selectedAssetIds.add(input.value);
  } else {
    state.selectedAssetIds.delete(input.value);
  }
}

async function handleWorkOrderAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !state.latestRun?.workOrder?.id) return;

  const itemId = button.dataset.itemId;
  const action = button.dataset.action;
  const card = button.closest("[data-item-card]");
  const editedContent = card?.querySelector("textarea[name='afterContent']")?.value || "";

  try {
    if (action === "accept") {
      setStatus("正在接受修改项...");
      await request(`/api/skill-work-orders/${encodeURIComponent(state.latestRun.workOrder.id)}/items/${encodeURIComponent(itemId)}/review`, {
        method: "POST",
        body: JSON.stringify({
          reviewStatus: "accepted",
          reviewComment: "Accepted in Replay Lab"
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      await loadRun(state.latestRun.task.id);
      setStatus("修改项已标记为接受。");
      return;
    }

    if (action === "reject") {
      setStatus("正在拒绝修改项...");
      await request(`/api/skill-work-orders/${encodeURIComponent(state.latestRun.workOrder.id)}/items/${encodeURIComponent(itemId)}/review`, {
        method: "POST",
        body: JSON.stringify({
          reviewStatus: "rejected",
          reviewComment: "Rejected in Replay Lab"
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      await loadRun(state.latestRun.task.id);
      setStatus("修改项已拒绝。");
      return;
    }

    if (action === "edit-apply") {
      setStatus("正在以编辑后的内容应用修改项...");
      await request(`/api/skill-work-orders/${encodeURIComponent(state.latestRun.workOrder.id)}/items/${encodeURIComponent(itemId)}/review`, {
        method: "POST",
        body: JSON.stringify({
          reviewStatus: "edited",
          reviewComment: "Edited in Replay Lab",
          editedPayload: {
            afterContent: editedContent
          }
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      await request(`/api/skill-work-orders/${encodeURIComponent(state.latestRun.workOrder.id)}/items/${encodeURIComponent(itemId)}/apply`, {
        method: "POST",
        body: JSON.stringify({
          appliedBy: "replay-lab"
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      await loadRun(state.latestRun.task.id);
      setStatus("编辑后的修改项已应用到 active skill。");
      return;
    }

    if (action === "apply") {
      setStatus("正在应用修改项...");
      await request(`/api/skill-work-orders/${encodeURIComponent(state.latestRun.workOrder.id)}/items/${encodeURIComponent(itemId)}/apply`, {
        method: "POST",
        body: JSON.stringify({
          appliedBy: "replay-lab"
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      await loadRun(state.latestRun.task.id);
      setStatus("修改项已应用到 active skill。");
    }
  } catch (error) {
    setStatus(`工单操作失败：${error.message}`, true);
  }
}

function scheduleValidationPoll() {
  clearValidationPolling();
  const validation = state.template?.validationContext;
  const task = state.validationTask;
  if (!validation?.projectId || !validation?.moduleId || !task?.id) return;
  if (task.status !== "running") return;

  state.validationPollTimer = window.setTimeout(async () => {
    try {
      const nextTask = await request(
        `/api/projects/${encodeURIComponent(validation.projectId)}/modules/${encodeURIComponent(validation.moduleId)}/spaces/${encodeURIComponent(validation.documentType || "software_requirement")}/tasks/${encodeURIComponent(task.id)}`
      );
      state.validationTask = nextTask;
      renderValidationRun();
      if (nextTask.status === "running") {
        scheduleValidationPoll();
      } else {
        setStatus(`验证任务已${nextTask.status === "completed" ? "完成" : "结束"}。`);
      }
    } catch (error) {
      setStatus(`轮询验证任务失败：${error.message}`, true);
    }
  }, 2000);
}

function clearValidationPolling() {
  if (state.validationPollTimer) {
    window.clearTimeout(state.validationPollTimer);
    state.validationPollTimer = null;
  }
}

async function refreshTaskList() {
  const payload = await request("/api/replay-tasks");
  state.tasks = payload.tasks || [];
  renderTemplateOptions();
}

function renderRunSummaryCard(label, taskSummary, workOrder) {
  if (!taskSummary) {
    return `
      <article class="compare-card">
        <span class="compare-kicker">${escapeHtml(label)}</span>
        <h3>暂无数据</h3>
        <p>还没有可展示的任务结果。</p>
      </article>
    `;
  }

  return `
    <article class="compare-card">
      <span class="compare-kicker">${escapeHtml(label)}</span>
      <h3>${escapeHtml(taskSummary.moduleName || taskSummary.id || "-")}</h3>
      <div class="lab-meta-list">
        ${metaItem("任务状态", formatReplayTaskStatus(taskSummary.taskStatus || ""))}
        ${metaItem("任务 ID", taskSummary.id || "-")}
        ${metaItem("结论", taskSummary.decisionSummary || taskSummary.summary || "-")}
        ${metaItem("Layer Skill", String(taskSummary.materialPackSummary?.layerSkillCount || taskSummary.materialPackSummary?.candidateSkillCount || 0))}
        ${metaItem("参考文件", String(taskSummary.materialPackSummary?.referenceAssetCount || 0))}
        ${metaItem("工单状态", workOrder ? formatWorkOrderStatus(workOrder.status || "") : taskSummary.workOrderSummary?.status || "-")}
      </div>
    </article>
  `;
}

function renderDiagnosticCard(label, diagnostics = {}) {
  return `
    <article class="diagnostic-card ${diagnostics.hasMismatch ? "is-warning" : ""}">
      <div class="detail-header-row">
        <strong>${escapeHtml(label)}</strong>
        <span class="mini-pill ${diagnostics.hasMismatch ? "warning" : "success"}">${escapeHtml(diagnostics.hasMismatch ? "发现失配" : "一致")}</span>
      </div>
      <div class="lab-meta-list">
        ${metaItem("Rule Index 版本", diagnostics.ruleIndexVersion || "-")}
        ${metaItem("Index / Registry 总量", `${diagnostics.counts?.ruleIndex?.total || 0} / ${diagnostics.counts?.registry?.total || 0}`)}
        ${metaItem("约束层规则 / Registry 相关", `${diagnostics.counts?.relevantRuleCount || 0} / ${diagnostics.counts?.relevantRegistryCount || 0}`)}
      </div>
      ${Array.isArray(diagnostics.issues) && diagnostics.issues.length ? `
        <ul class="lab-issue-list">
          ${diagnostics.issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      ` : `<p class="summary">当前 rule index 与 active registry 在本次上下文中保持一致。</p>`}
    </article>
  `;
}

function renderProposalCard(label, task = {}) {
  const proposal = task?.proposals?.[0] || null;
  const itemCount = Array.isArray(proposal?.items) ? proposal.items.length : 0;
  const validatorCount = Array.isArray(task?.validatorSuggestions) ? task.validatorSuggestions.length : Array.isArray(proposal?.validatorSuggestions) ? proposal.validatorSuggestions.length : 0;

  return `
    <article class="compare-card">
      <span class="compare-kicker">${escapeHtml(label)}</span>
      <h3>${escapeHtml(task?.summary || "暂无结果摘要")}</h3>
      <div class="lab-meta-list">
        ${metaItem("Decision Summary", task?.decisionSummary || proposal?.decisionSummary || "-")}
        ${metaItem("Proposal Items", String(itemCount))}
        ${metaItem("Validator Suggestions", String(validatorCount))}
        ${metaItem("工单", task?.workOrderId || "-")}
      </div>
    </article>
  `;
}

function renderWorkOrderItem(item = {}) {
  const content = item.editedPayload?.afterContent || item.afterContent || item.recommendedSkillText || "";
  const actions = [];
  if (item.reviewStatus === "pending") {
    actions.push(`<button type="button" data-action="accept" data-item-id="${escapeHtml(item.itemId)}">接受</button>`);
    actions.push(`<button type="button" class="secondary-button" data-action="edit-apply" data-item-id="${escapeHtml(item.itemId)}">编辑后应用</button>`);
    actions.push(`<button type="button" class="ghost-button" data-action="reject" data-item-id="${escapeHtml(item.itemId)}">拒绝</button>`);
  }
  if (item.reviewStatus === "accepted" || item.reviewStatus === "edited") {
    actions.push(`<button type="button" data-action="apply" data-item-id="${escapeHtml(item.itemId)}">应用到 Active Skill</button>`);
    actions.push(`<button type="button" class="secondary-button" data-action="edit-apply" data-item-id="${escapeHtml(item.itemId)}">编辑后应用</button>`);
    actions.push(`<button type="button" class="ghost-button" data-action="reject" data-item-id="${escapeHtml(item.itemId)}">拒绝</button>`);
  }

  return `
    <article class="work-order-item-card" data-item-card="${escapeHtml(item.itemId)}">
      <div class="detail-header-row">
        <div>
          <strong>${escapeHtml(item.title || item.itemId)}</strong>
          <p class="summary">${escapeHtml(item.fallbackReason || item.whyChange || "")}</p>
        </div>
        <span class="mini-pill ${statusTone(item.reviewStatus)}">${escapeHtml(formatWorkOrderItemStatus(item.reviewStatus || ""))}</span>
      </div>
      <div class="lab-meta-list">
        ${metaItem("结论类型", item.conclusionType === "create_new" ? "新增 atomic skill" : "修改 existing skill")}
        ${metaItem("Skill / Layer / Kind", `${item.targetSkillCode || "新增"} / ${item.targetLayer || "-"} / ${item.targetKind || "-"}`)}
        ${metaItem("层级原因", item.scopeReason || item.whyCurrent || "-")}
        ${metaItem("规则目的", item.ruleIntent || item.whyChange || "-")}
      </div>
      <label>
        修改后内容
        <textarea name="afterContent" rows="6">${escapeHtml(content)}</textarea>
      </label>
      <details>
        <summary>查看修改前内容与证据</summary>
        <pre>${escapeHtml(item.beforeContent || "无")}</pre>
        <pre>${escapeHtml(JSON.stringify(item.evidenceRefs || [], null, 2))}</pre>
      </details>
      <div class="inline-action-row">
        ${actions.join("") || `<span class="summary">已于 ${escapeHtml(formatDateTime(item.appliedAt || item.updatedAt))} 完成处理。</span>`}
      </div>
    </article>
  `;
}

function renderValidatorSuggestion(item = {}) {
  return `
    <article class="mini-preview-card">
      <strong>${escapeHtml(item.title || "校验建议")}</strong>
      <p>${escapeHtml(item.ruleText || "")}</p>
      <p class="summary">${escapeHtml(item.why || "")}</p>
    </article>
  `;
}

function createJsonPanel(title, value) {
  return `
    <details class="raw-panel">
      <summary>${escapeHtml(title)}</summary>
      <pre>${escapeHtml(value ? JSON.stringify(value, null, 2) : "无")}</pre>
    </details>
  `;
}

function createTextPanel(title, value) {
  return `
    <details class="raw-panel">
      <summary>${escapeHtml(title)}</summary>
      <pre>${escapeHtml(value || "无")}</pre>
    </details>
  `;
}

function metaItem(label, value) {
  return `
    <article class="lab-meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `;
}

function formatTaskOption(task = {}) {
  return `${task.moduleName || "未指定模块"} · ${task.id} · ${formatDateTime(task.updatedAt || task.createdAt)}`;
}

function formatReplayTaskStatus(status = "") {
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  return status || "未知";
}

function formatWorkOrderStatus(status = "") {
  if (status === "pending_review") return "待审阅";
  if (status === "partially_reviewed") return "部分已审阅";
  if (status === "partially_applied") return "部分已应用";
  if (status === "applied") return "已应用";
  if (status === "closed") return "已关闭";
  return status || "未知";
}

function formatWorkOrderItemStatus(status = "") {
  if (status === "pending") return "待处理";
  if (status === "accepted") return "已接受";
  if (status === "edited") return "已编辑";
  if (status === "rejected") return "已拒绝";
  if (status === "applied") return "已应用";
  return status || "未知";
}

function formatGenerationTaskStatus(status = "") {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return status || "未知";
}

function statusTone(status = "") {
  if (["done", "applied", "accepted", "completed"].includes(status)) return "success";
  if (["failed", "rejected"].includes(status)) return "danger";
  if (["edited", "partially_reviewed", "partially_applied"].includes(status)) return "warning";
  return "subtle";
}

function getAssetRoleLabel(role = "") {
  if (role === "system_pdf") return "系统需求";
  if (role === "reference_requirement_example") return "需求范例";
  if (role === "generated_c") return "生成 C";
  if (role === "model_pdf") return "模型 PDF";
  return role || "资产";
}

function syncTemplateQuery() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("templateTaskId", state.selectedTemplateId || DEFAULT_TEMPLATE_TASK_ID);
  if (!state.latestRun?.task?.id) {
    nextUrl.searchParams.delete("runTaskId");
  }
  window.history.replaceState({}, "", nextUrl);
}

function syncRunQuery(taskId) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("templateTaskId", state.selectedTemplateId || DEFAULT_TEMPLATE_TASK_ID);
  nextUrl.searchParams.set("runTaskId", taskId);
  window.history.replaceState({}, "", nextUrl);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function request(url, options = {}) {
  return fetch(url, options).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Request failed");
      error.code = data.code || "request_failed";
      error.details = data.details || null;
      throw error;
    }
    return data;
  });
}

function setStatus(message, isError = false) {
  pageStatusRoot.textContent = message || "";
  pageStatusRoot.classList.toggle("status-error", Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
