const state = {
  bundles: [],
  activeBundle: null,
  cases: [],
  selectedCaseId: "",
  selectedRunId: "",
  selectedCase: null,
  runDetail: null
};

const feedingForm = document.querySelector("#feeding-form");
const feedStatusRoot = document.querySelector("#feed-status");
const activeBundleRoot = document.querySelector("#active-bundle");
const caseListRoot = document.querySelector("#case-list");
const caseDetailRoot = document.querySelector("#case-detail");
const runSummaryRoot = document.querySelector("#run-summary");
const proposalGroupsRoot = document.querySelector("#proposal-groups");
const buildCandidateButton = document.querySelector("#build-candidate-button");
const benchmarkReportRoot = document.querySelector("#benchmark-report");
const decisionActionsRoot = document.querySelector("#decision-actions");
const filterQuery = document.querySelector("#filter-query");
const filterStatus = document.querySelector("#filter-status");
const filterEnabled = document.querySelector("#filter-enabled");
const filterScoreTrend = document.querySelector("#filter-score-trend");

await bootstrap();

feedingForm.addEventListener("submit", handleFeedSubmit);
caseListRoot.addEventListener("click", handleCaseAction);
proposalGroupsRoot.addEventListener("click", handleProposalAction);
buildCandidateButton.addEventListener("click", handleBuildCandidate);
decisionActionsRoot.addEventListener("click", handleDecisionAction);

for (const input of [filterQuery, filterStatus, filterEnabled, filterScoreTrend]) {
  input.addEventListener("input", renderCases);
  input.addEventListener("change", renderCases);
}

async function bootstrap() {
  await refreshWorkbench();
}

async function refreshWorkbench() {
  const [bundlePayload, casePayload] = await Promise.all([
    request("/api/skill-refinement/bundles"),
    request("/api/skill-refinement/cases")
  ]);

  state.activeBundle = bundlePayload.activeBundle || null;
  state.bundles = bundlePayload.bundles || [];
  state.cases = casePayload.cases || [];

  const hasSelectedCase = state.selectedCaseId && state.cases.some((item) => item.id === state.selectedCaseId);
  if (!hasSelectedCase) {
    state.selectedCaseId = state.cases.find((item) => !item.archived)?.id || state.cases[0]?.id || "";
  }

  renderActiveBundle();
  renderCases();

  if (state.selectedCaseId) {
    await loadCase(state.selectedCaseId, state.selectedRunId);
  } else {
    state.selectedCase = null;
    state.runDetail = null;
    renderCaseDetail();
    renderRunSummary();
    renderProposalGroups();
    renderBenchmarkReport();
  }
}

async function loadCase(caseId, preferredRunId = "") {
  state.selectedCaseId = caseId;
  state.selectedCase = await request(`/api/skill-refinement/cases/${caseId}`);
  state.runDetail = null;
  state.selectedRunId = "";
  const caseSummary = state.cases.find((item) => item.id === caseId);
  const runId = preferredRunId || caseSummary?.lastRunId || state.selectedCase.lastRunId || "";
  renderCaseDetail();
  renderRunSummary();
  renderProposalGroups();
  renderBenchmarkReport();
  renderCases();

  if (runId) {
    await loadRun(runId);
  } else {
    state.selectedRunId = "";
  }
}

async function loadRun(runId) {
  state.selectedRunId = runId;
  state.runDetail = await request(`/api/skill-refinement/runs/${runId}`);
  renderRunSummary();
  renderProposalGroups();
  renderBenchmarkReport();
  renderCaseDetail();
}

async function handleFeedSubmit(event) {
  event.preventDefault();
  const formData = new FormData(feedingForm);

  try {
    setFeedStatus("1/3 正在创建范例并写入范例库...");
    const benchmarkCase = await request("/api/skill-refinement/cases", {
      method: "POST",
      body: formData
    });

    setFeedStatus("2/3 正在将该范例认证为 benchmark 案例...");
    await request(`/api/skill-refinement/cases/${benchmarkCase.id}/certify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    setFeedStatus("3/3 正在基于当前 active skill 打分并生成改进建议...");
    const run = await request("/api/skill-refinement/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerCaseId: benchmarkCase.id })
    });

    feedingForm.reset();
    state.selectedCaseId = benchmarkCase.id;
    state.selectedRunId = run.id;
    await refreshWorkbench();
    setFeedStatus("上传完成。当前 active skill 的评分与改进建议已生成，可以开始逐条审核。");
  } catch (error) {
    setFeedStatus(`上传失败：${error.message}`);
  }
}

async function handleCaseAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, caseId, runId } = button.dataset;
  try {
    if (action === "view") {
      await loadCase(caseId, runId || "");
      return;
    }

    if (action === "archive") {
      await request(`/api/skill-refinement/cases/${caseId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      await refreshWorkbench();
      return;
    }

    if (action === "restore") {
      await request(`/api/skill-refinement/cases/${caseId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      await refreshWorkbench();
    }
  } catch (error) {
    setFeedStatus(`案例操作失败：${error.message}`);
  }
}

async function handleProposalAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !state.runDetail) return;

  const { action, proposalId } = button.dataset;
  const editor = proposalGroupsRoot.querySelector(`textarea[data-proposal-editor="${proposalId}"]`);
  const targetLayerInput = proposalGroupsRoot.querySelector(`[data-proposal-target-layer="${proposalId}"]`);
  const targetProfileInput = proposalGroupsRoot.querySelector(`[data-proposal-target-profile="${proposalId}"]`);
  const targetSkillInput = proposalGroupsRoot.querySelector(`[data-proposal-target-skill="${proposalId}"]`);
  const targetKindInput = proposalGroupsRoot.querySelector(`[data-proposal-kind="${proposalId}"]`);
  const titleInput = proposalGroupsRoot.querySelector(`[data-proposal-title="${proposalId}"]`);
  const editedContent = editor?.value || "";
  let status = "pending";

  if (action === "accept") status = "accepted";
  if (action === "reject") status = "rejected";
  if (action === "edit") status = "edited";

  try {
    await request(`/api/skill-refinement/runs/${state.runDetail.run.id}/proposals/${proposalId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        editedContent,
        targetLayer: targetLayerInput?.value || "",
        targetProfileKey: targetProfileInput?.value || "",
        targetSkillCode: targetSkillInput?.value || "",
        kind: targetKindInput?.value || "",
        title: titleInput?.value || ""
      })
    });
    await loadRun(state.runDetail.run.id);
  } catch (error) {
    setFeedStatus(`改进建议审核失败：${error.message}`);
  }
}

async function handleBuildCandidate() {
  if (!state.runDetail) return;

  try {
    setFeedStatus("正在应用已接受意见并重跑 benchmark...");
    await request(`/api/skill-refinement/runs/${state.runDetail.run.id}/build-candidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    await refreshWorkbench();
    setFeedStatus("Benchmark 报告已生成，可以据此决定是否升级 active skill。");
  } catch (error) {
    setFeedStatus(`构建 candidate 失败：${error.message}`);
  }
}

async function handleDecisionAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !state.runDetail) return;

  const { action } = button.dataset;

  try {
    setFeedStatus(action === "approve" ? "正在升级 active skill..." : "正在驳回本次 skill 更新...");
    await request(`/api/skill-refinement/runs/${state.runDetail.run.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    await refreshWorkbench();
    setFeedStatus(action === "approve" ? "已升级为新的 active skill。" : "已驳回本次 skill 更新。");
  } catch (error) {
    setFeedStatus(`决策操作失败：${error.message}`);
  }
}

function renderActiveBundle() {
  if (!state.activeBundle) {
    activeBundleRoot.innerHTML = '<div class="empty-state">尚未发现 active skill bundle。</div>';
    return;
  }

  const summary = state.activeBundle.evaluationSummary || {};
  activeBundleRoot.innerHTML = `
    <div class="metric-grid">
      <div class="metric">
        <span>当前 Bundle</span>
        <strong>${escapeHtml(state.activeBundle.id)}</strong>
      </div>
      <div class="metric">
        <span>版本</span>
        <strong>${escapeHtml(state.activeBundle.version || "未命名")}</strong>
      </div>
      <div class="metric">
        <span>状态</span>
        <strong>${escapeHtml(state.activeBundle.status || "active")}</strong>
      </div>
      <div class="metric">
        <span>最近评估</span>
        <strong>${formatNumber(summary.overallScoreAvg)}</strong>
      </div>
    </div>
    <div class="definition-grid">
      <div>
        <span>最近基线分</span>
        <p>${formatNumber(summary.baselineOverallScoreAvg)}</p>
      </div>
      <div>
        <span>发布门槛</span>
        <p>${summary.decisionHints?.passesPublishGate ? "通过" : "暂无 / 未通过"}</p>
      </div>
      <div>
        <span>变更摘要</span>
        <p>${escapeHtml(state.activeBundle.changeSummary || "无")}</p>
      </div>
    </div>
  `;
}

function renderCases() {
  const filteredCases = state.cases.filter((item) => {
    const query = filterQuery.value.trim().toLowerCase();
    const statusValue = filterStatus.value;
    const enabledValue = filterEnabled.value;
    const scoreTrendValue = filterScoreTrend.value;
    const haystack = `${item.name} ${item.domain} ${item.subdomain}`.toLowerCase();

    if (query && !haystack.includes(query)) return false;
    if (statusValue !== "all" && item.status !== statusValue) return false;
    if (enabledValue === "enabled" && item.archived) return false;
    if (enabledValue === "archived" && !item.archived) return false;

    const delta = Number(item.lastEvaluationSummary?.overallScoreDelta || 0);
    if (scoreTrendValue === "improved" && !(delta > 0)) return false;
    if (scoreTrendValue === "regressed" && !(delta < 0)) return false;
    if (scoreTrendValue === "flat" && delta !== 0) return false;

    return true;
  });

  if (!filteredCases.length) {
    caseListRoot.innerHTML = '<div class="empty-state">当前筛选条件下没有范例。</div>';
    return;
  }

  caseListRoot.innerHTML = filteredCases
    .map((item) => {
      const isActive = item.id === state.selectedCaseId;
      const delta = Number(item.lastEvaluationSummary?.overallScoreDelta || 0);
      return `
        <article class="case-card${isActive ? " active" : ""}">
          <div class="case-header">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p class="case-meta">${escapeHtml(item.domain || "未指定领域")} / ${escapeHtml(item.subdomain || "未指定子域")}</p>
            </div>
            <div class="pill-row">
              <span class="pill ${item.archived ? "danger" : "success"}">${item.archived ? "已归档" : "启用中"}</span>
              <span class="pill ${resolveStatusClass(item.status)}">${escapeHtml(translateCaseStatus(item.status))}</span>
            </div>
          </div>

          <div class="definition-grid">
            <div>
              <span>最近得分</span>
              <p>${formatNumber(item.lastEvaluationSummary?.overallScore)}</p>
            </div>
            <div>
              <span>分数变化</span>
              <p>${formatDelta(delta)}</p>
            </div>
            <div>
              <span>最近 Run</span>
              <p>${escapeHtml(item.lastRunId || "暂无")}</p>
            </div>
            <div>
              <span>创建时间</span>
              <p>${formatDate(item.createdAt)}</p>
            </div>
          </div>

          <div class="case-actions">
            <button data-action="view" data-case-id="${item.id}" data-run-id="${item.lastRunId || ""}" type="button">查看详情</button>
            ${
              item.archived
                ? `<button class="secondary" data-action="restore" data-case-id="${item.id}" type="button">恢复启用</button>`
                : `<button class="danger" data-action="archive" data-case-id="${item.id}" type="button">归档停用</button>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCaseDetail() {
  if (!state.selectedCase) {
    caseDetailRoot.innerHTML = '<div class="empty-state">选择一个范例后，可查看人工答案结构、自动评分和最近 run 信息。</div>';
    return;
  }

  const requirements = state.selectedCase.goldenStructured?.requirements || [];
  const assessment = state.runDetail?.run?.initialAssessment?.scoreResult;
  const generatedRequirements = state.runDetail?.run?.initialAssessment?.generatedRequirements || [];

  caseDetailRoot.innerHTML = `
    <div class="definition-grid">
      <div>
        <span>名称</span>
        <p>${escapeHtml(state.selectedCase.name)}</p>
      </div>
      <div>
        <span>领域</span>
        <p>${escapeHtml(state.selectedCase.domain)}</p>
      </div>
      <div>
        <span>子域</span>
        <p>${escapeHtml(state.selectedCase.subdomain || "未指定")}</p>
      </div>
      <div>
        <span>人工答案条数</span>
        <p>${requirements.length}</p>
      </div>
    </div>

    <div class="requirement-card">
      <div class="requirement-header">
        <div>
          <h3>当前 Active Skill 首轮得分</h3>
          <p class="mini-meta">这里展示的是上传范例后，当前 active skill 在首轮生成中的基础评分结果。</p>
        </div>
      </div>
      ${
        assessment
          ? `
            <div class="scoreline"><strong>${formatNumber(assessment.overallScore)}</strong> / 100</div>
            <div class="definition-grid">
              <div><span>结构</span><p>${formatNumber(assessment.dimensionScores.section_structure_score)}</p></div>
              <div><span>覆盖</span><p>${formatNumber(assessment.dimensionScores.requirement_coverage_score)}</p></div>
              <div><span>逻辑</span><p>${formatNumber(assessment.dimensionScores.logic_branch_score)}</p></div>
              <div><span>追溯</span><p>${formatNumber(assessment.dimensionScores.traceability_score)}</p></div>
            </div>
          `
          : '<p class="muted">暂无自动评分记录。</p>'
      }
    </div>

    <div class="requirement-card">
      <h3>人工答案结构化条目</h3>
      <div class="golden-list">
        ${
          requirements.length
            ? requirements
                .map(
                  (item) => `
                    <article class="requirement-card">
                      <div class="requirement-header">
                        <div>
                          <strong>${escapeHtml(item.requirementId || "未编号")}</strong>
                          <p class="mini-meta">${escapeHtml(item.sectionNumber || "未分章")} / ${escapeHtml(item.topic || item.title || "未命名")}</p>
                        </div>
                        <span class="pill">${escapeHtml(item.requirementType || "functional")}</span>
                      </div>
                      <p>${escapeHtml(item.requirementText || "")}</p>
                    </article>
                  `
                )
                .join("")
            : '<div class="empty-state">暂无结构化人工答案。</div>'
        }
      </div>
    </div>

    <div class="requirement-card">
      <h3>当前 Active Skill 生成结果</h3>
      <div class="generated-list">
        ${
          generatedRequirements.length
            ? generatedRequirements
                .map(
                  (item) => `
                    <article class="requirement-card">
                      <div class="requirement-header">
                        <div>
                          <strong>${escapeHtml(item.requirementId || "未编号")}</strong>
                          <p class="mini-meta">${escapeHtml(item.title || "未命名需求")}</p>
                        </div>
                        <span class="pill">${escapeHtml(item.type || "functional")}</span>
                      </div>
                      <p>${escapeHtml(item.requirementText || "")}</p>
                    </article>
                  `
                )
                .join("")
            : '<div class="empty-state">当前 run 还没有生成 active skill 的首轮结果。</div>'
        }
      </div>
    </div>
  `;
}

function renderRunSummary() {
  if (!state.runDetail) {
    runSummaryRoot.innerHTML = '<div class="empty-state">上传范例并生成 run 后，这里会显示阶段状态和初始评分摘要。</div>';
    buildCandidateButton.disabled = true;
    buildCandidateButton.textContent = "应用已接受意见并重跑 Benchmark";
    return;
  }

  const { run, baselineBundle, candidateBundle } = state.runDetail;
  const acceptedCount = (run.proposalItems || []).filter((item) => item.status === "accepted" || item.status === "edited").length;
  const canBuildCandidate = acceptedCount > 0 && run.status !== "approved" && run.status !== "rejected";
  buildCandidateButton.disabled = !canBuildCandidate;
  buildCandidateButton.textContent = state.runDetail.evaluation
    ? "重新应用已接受意见并重跑 Benchmark"
    : "应用已接受意见并重跑 Benchmark";

  runSummaryRoot.innerHTML = `
    <div class="definition-grid">
      <div>
        <span>当前 Run</span>
        <p>${escapeHtml(run.id)}</p>
      </div>
      <div>
        <span>基线 Bundle</span>
        <p>${escapeHtml(baselineBundle?.version || run.baseBundleId || "未指定")}</p>
      </div>
      <div>
        <span>Candidate Bundle</span>
        <p>${escapeHtml(candidateBundle?.version || "尚未构建")}</p>
      </div>
      <div>
        <span>待应用改进</span>
        <p>${acceptedCount} 条</p>
      </div>
    </div>
    <div class="stage-pills">
      ${Object.entries(run.stageStatus || {})
        .map(
          ([key, value]) =>
            `<span class="stage-pill ${escapeHtml(value)}">${escapeHtml(translateStageKey(key))}：${escapeHtml(
              translateStageValue(value)
            )}</span>`
        )
        .join("")}
    </div>
  `;
}

function renderProposalGroups() {
  if (!state.runDetail) {
    proposalGroupsRoot.innerHTML = '<div class="empty-state">当前没有可审核的改进建议。</div>';
    return;
  }

  const items = state.runDetail.proposalItems || [];
  const run = state.runDetail.run;
  const reviewLocked = run?.status === "approved" || run?.status === "rejected";
  if (!items.length) {
    proposalGroupsRoot.innerHTML = '<div class="empty-state">这次 run 没有生成改进意见。</div>';
    return;
  }

  const groups = [
    ["writing", "写作规则"],
    ["extraction", "抽取规则"],
    ["validation", "校验规则"],
    ["good_example", "Examples"],
    ["domain_knowledge", "领域知识"]
  ];

  proposalGroupsRoot.innerHTML = groups
    .map(([category, title]) => {
      const groupItems = items.filter((item) => item.category === category);
      if (!groupItems.length) return "";

      return `
        <section>
          <h3>${title}</h3>
          <div class="proposal-groups">
            ${groupItems
              .map(
                (item) => `
                  <article class="proposal-card">
                    <div class="proposal-header">
                      <div>
                        <strong>${escapeHtml(item.title)}</strong>
                        <p class="mini-meta">
                          ${escapeHtml(item.action)} · ${escapeHtml(item.kind || "-")} · ${escapeHtml(item.targetFile || "-")}
                        </p>
                      </div>
                      <span class="pill ${resolveStatusClass(item.status)}">${escapeHtml(translateProposalStatus(item.status))}</span>
                    </div>
                    <p class="mini-meta">${escapeHtml(item.reason || "无原因说明")}</p>
                    <div class="definition-grid">
                      <div><span>Layer</span><p><input data-proposal-target-layer="${item.id}" value="${escapeHtml(item.targetLayer || "")}" ${reviewLocked ? "disabled" : ""} /></p></div>
                      <div><span>Profile</span><p><input data-proposal-target-profile="${item.id}" value="${escapeHtml(item.targetProfileKey || "")}" ${reviewLocked ? "disabled" : ""} /></p></div>
                      <div><span>Skill Code</span><p><input data-proposal-target-skill="${item.id}" value="${escapeHtml(item.targetSkillCode || "")}" ${reviewLocked ? "disabled" : ""} /></p></div>
                      <div><span>Kind</span><p><input data-proposal-kind="${item.id}" value="${escapeHtml(item.kind || "")}" ${reviewLocked ? "disabled" : ""} /></p></div>
                    </div>
                    <label>
                      标题
                      <input data-proposal-title="${item.id}" value="${escapeHtml(item.title || "")}" ${reviewLocked ? "disabled" : ""} />
                    </label>
                    <p class="mini-meta">Scope rationale：${escapeHtml(item.scopeRationale || "未提供")} · 置信度 ${escapeHtml(String(item.scopeConfidence ?? "-"))}</p>
                    <textarea data-proposal-editor="${item.id}" ${reviewLocked ? "disabled" : ""}>${escapeHtml(
                      item.editedContent || item.proposedContent || ""
                    )}</textarea>
                    <div class="proposal-actions">
                      <button data-action="accept" data-proposal-id="${item.id}" type="button" ${reviewLocked ? "disabled" : ""}>接受</button>
                      <button class="secondary" data-action="edit" data-proposal-id="${item.id}" type="button" ${reviewLocked ? "disabled" : ""}>编辑后接受</button>
                      <button class="danger" data-action="reject" data-proposal-id="${item.id}" type="button" ${reviewLocked ? "disabled" : ""}>拒绝</button>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderBenchmarkReport() {
  const evaluation = state.runDetail?.evaluation;
  const run = state.runDetail?.run;

  if (!evaluation || !run) {
    benchmarkReportRoot.innerHTML = `
      <div class="empty-state">
        还没有 benchmark 报告。请先逐条审核改进意见，再点击“应用已接受意见并重跑 Benchmark”。
      </div>
    `;
    decisionActionsRoot.innerHTML = "";
    return;
  }

  benchmarkReportRoot.innerHTML = `
    <div class="benchmark-summary">
      <div class="metric">
        <span>Candidate 总分</span>
        <strong>${formatNumber(evaluation.aggregateScores.overallScoreAvg)}</strong>
      </div>
      <div class="metric">
        <span>Active 总分</span>
        <strong>${formatNumber(evaluation.aggregateScores.baselineOverallScoreAvg)}</strong>
      </div>
      <div class="metric">
        <span>发布门槛</span>
        <strong>${evaluation.decisionHints?.passesPublishGate ? "通过" : "未通过"}</strong>
      </div>
      <div class="metric">
        <span>失败案例数</span>
        <strong>${formatNumber(evaluation.aggregateScores.criticalCaseFailCount)}</strong>
      </div>
    </div>

    <div class="requirement-card">
      <h3>分维度趋势</h3>
      <div class="definition-grid">
        ${[
          ["section_structure_score", "结构"],
          ["requirement_coverage_score", "覆盖"],
          ["logic_branch_score", "逻辑"],
          ["signal_reference_score", "信号/引用"],
          ["traceability_score", "追溯"],
          ["writing_quality_score", "写作质量"]
        ]
          .map(([key, label]) => {
            const candidateScore = evaluation.aggregateScores.dimensionAverages?.[key];
            const baselineScore = evaluation.aggregateScores.baselineDimensionAverages?.[key];
            const delta = evaluation.aggregateScores.dimensionDeltas?.[key];
            return `
              <div>
                <span>${label}</span>
                <p>
                  Candidate ${formatNumber(candidateScore)} / Active ${formatNumber(baselineScore)}
                  <strong class="delta ${delta >= 0 ? "up" : "down"}">${formatDelta(delta)}</strong>
                </p>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>

    <div class="requirement-card">
      <h3>Top Improvements</h3>
      ${
        evaluation.aggregateScores.topImprovements?.length
          ? `<ul class="list tight">${evaluation.aggregateScores.topImprovements
              .map((item) => `<li>${escapeHtml(resolveCaseLabel(item.caseId))}：${formatDelta(item.delta)}</li>`)
              .join("")}</ul>`
          : '<p class="muted">暂无明显提升项。</p>'
      }
    </div>

    <div class="requirement-card">
      <h3>Top Regressions</h3>
      ${
        evaluation.aggregateScores.topRegressions?.length
          ? `<ul class="list tight">${evaluation.aggregateScores.topRegressions
              .map((item) => `<li>${escapeHtml(resolveCaseLabel(item.caseId))}：${formatDelta(item.delta)}</li>`)
              .join("")}</ul>`
          : '<p class="muted">暂无明显回归项。</p>'
      }
    </div>

    <div class="benchmark-cases">
      ${evaluation.caseResults
        .map(
          (item) => `
            <article class="benchmark-case">
              <div class="benchmark-header">
                <div>
                  <strong>${escapeHtml(resolveCaseLabel(item.caseId))}</strong>
                  <p class="mini-meta">Candidate ${formatNumber(item.overallScore)} / Active ${formatNumber(
                    item.baselineOverallScore
                  )}</p>
                </div>
                <span class="pill ${item.overallScoreDelta >= 0 ? "success" : "danger"}">${formatDelta(
                  item.overallScoreDelta
                )}</span>
              </div>
              <div class="definition-grid">
                <div><span>结构</span><p>${formatNumber(item.dimensionScores.section_structure_score)}</p></div>
                <div><span>覆盖</span><p>${formatNumber(item.dimensionScores.requirement_coverage_score)}</p></div>
                <div><span>逻辑</span><p>${formatNumber(item.dimensionScores.logic_branch_score)}</p></div>
                <div><span>信号/引用</span><p>${formatNumber(item.dimensionScores.signal_reference_score)}</p></div>
                <div><span>追溯</span><p>${formatNumber(item.dimensionScores.traceability_score)}</p></div>
                <div><span>写作质量</span><p>${formatNumber(item.dimensionScores.writing_quality_score)}</p></div>
                <div><span>幻觉惩罚</span><p>${formatNumber(item.penalties.hallucination_penalty)}</p></div>
                <div><span>关键项缺失惩罚</span><p>${formatNumber(item.penalties.missing_critical_item_penalty)}</p></div>
              </div>
              ${
                item.improvements?.length
                  ? `<h4>改善</h4><ul class="list tight">${item.improvements
                      .map((entry) => `<li>${escapeHtml(entry)}</li>`)
                      .join("")}</ul>`
                  : ""
              }
              ${
                item.regressions?.length
                  ? `<h4>回归</h4><ul class="list tight">${item.regressions
                      .map((entry) => `<li>${escapeHtml(entry)}</li>`)
                      .join("")}</ul>`
                  : ""
              }
            </article>
          `
        )
        .join("")}
    </div>
  `;

  if (run.status === "approved" || run.status === "rejected") {
    decisionActionsRoot.innerHTML = `
      <span class="pill ${run.status === "approved" ? "success" : "danger"}">${escapeHtml(
        run.status === "approved" ? "本次更新已升级为 Active Skill" : "本次更新已驳回"
      )}</span>
    `;
    return;
  }

  decisionActionsRoot.innerHTML = `
    <button data-action="approve" type="button">升级为 Active Skill</button>
    <button class="danger" data-action="reject" type="button">驳回这次更新</button>
  `;
}

function setFeedStatus(message) {
  feedStatusRoot.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "暂无";
  }
  return Number(value).toFixed(2);
}

function formatDelta(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${number.toFixed(2)}`;
  if (number < 0) return number.toFixed(2);
  return "0.00";
}

function resolveCaseLabel(caseId) {
  const item = state.cases.find((entry) => entry.id === caseId);
  return item?.name ? `${item.name} (${caseId})` : caseId;
}

function formatDate(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function resolveStatusClass(status) {
  if (status === "approved" || status === "accepted" || status === "edited" || status === "certified") return "success";
  if (status === "rejected" || status === "archived") return "danger";
  if (status === "awaiting_decision" || status === "proposal_review") return "warn";
  return "";
}

function translateCaseStatus(status) {
  return (
    {
      golden_structured: "已结构化",
      certified: "已认证",
      proposal_review: "待审核改进意见",
      awaiting_decision: "待决策",
      approved: "已通过",
      archived: "已归档"
    }[status] || status || "未知状态"
  );
}

function translateProposalStatus(status) {
  return (
    {
      pending: "待审核",
      accepted: "已接受",
      edited: "编辑后接受",
      rejected: "已拒绝"
    }[status] || status || "待审核"
  );
}

function translateStageKey(key) {
  return (
    {
      case_ingested: "案例入库",
      golden_structured: "Golden 结构化",
      active_skill_scored: "Active Skill 打分",
      proposal_generated: "改进意见生成",
      candidate_benchmark: "Candidate Benchmark",
      decision: "人工决策"
    }[key] || key
  );
}

function translateStageValue(value) {
  return (
    {
      completed: "已完成",
      idle: "待触发",
      waiting_for_proposal_review: "待审核改进意见",
      waiting_for_manual_decision: "待人工决策",
      approved: "已通过",
      rejected: "已驳回"
    }[value] || value
  );
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}
