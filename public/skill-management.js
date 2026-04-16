const state = {
  payload: null,
  selectedType: "",
  selectedKey: "",
  detail: null
};

const refreshButton = document.querySelector("#refresh-button");
const pageStatusRoot = document.querySelector("#page-status");
const summaryMetricsRoot = document.querySelector("#summary-metrics");
const sourceMetaRoot = document.querySelector("#source-meta");
const skillGroupsRoot = document.querySelector("#skill-groups");
const skillDetailRoot = document.querySelector("#skill-detail");

await bootstrap();

refreshButton.addEventListener("click", () => refreshAll(true));
skillGroupsRoot.addEventListener("click", handleSkillSelection);
skillDetailRoot.addEventListener("click", handleDetailClick);
skillDetailRoot.addEventListener("submit", handleSave);

async function bootstrap() {
  await refreshAll(false);
}

async function refreshAll(showHint) {
  try {
    if (showHint) setPageStatus("正在刷新技能列表...");
    state.payload = await request("/api/skill-management");
    syncSelection();
    renderSummary();
    renderGroups();
    await loadSelectedDetail();
    if (showHint) setPageStatus("技能列表已刷新。");
  } catch (error) {
    setPageStatus(`加载失败：${error.message}`, true);
    skillDetailRoot.innerHTML = `<div class="skill-detail-empty">${escapeHtml(error.message)}</div>`;
  }
}

function syncSelection() {
  const allItems = listAllItems();
  const stillExists = allItems.some((item) => item.type === state.selectedType && item.key === state.selectedKey);
  if (stillExists) return;
  const fallback = allItems[0] || null;
  state.selectedType = fallback?.type || "";
  state.selectedKey = fallback?.key || "";
}

function listAllItems() {
  if (!state.payload?.groups) return [];
  return ["generic", "docType", "domain", "module"].flatMap((type) => state.payload.groups[type] || []);
}

async function loadSelectedDetail() {
  if (!state.selectedType || !state.selectedKey) {
    state.detail = null;
    renderDetail();
    return;
  }

  try {
    state.detail = await request(`/api/skill-management/${encodeURIComponent(state.selectedType)}/${encodeURIComponent(state.selectedKey)}`);
    renderDetail();
  } catch (error) {
    state.detail = null;
    renderDetail(error.message);
    setPageStatus(`加载技能详情失败：${error.message}`, true);
  }
}

function renderSummary() {
  if (!state.payload) {
    summaryMetricsRoot.innerHTML = "";
    sourceMetaRoot.textContent = "";
    return;
  }

  const counts = state.payload.summary?.countsByType || {};
  const cards = [
    { label: "技能总数", value: state.payload.summary?.total || 0 },
    { label: "Generic", value: counts.generic || 0 },
    { label: "Doc Type", value: counts.docType || 0 },
    { label: "Domain", value: counts.domain || 0 },
    { label: "Module", value: counts.module || 0 }
  ];

  summaryMetricsRoot.innerHTML = cards
    .map(
      (card) => `
        <div class="skill-summary-metric">
          <span>${escapeHtml(card.label)}</span>
          <strong>${card.value}</strong>
        </div>
      `
    )
    .join("");

  const source = state.payload.activeSource || {};
  sourceMetaRoot.textContent = `当前来源：${source.skillDir || "-"} · manifest：${source.manifestPath || "-"}`;
}

function renderGroups() {
  if (!state.payload?.groups) {
    skillGroupsRoot.innerHTML = '<div class="empty-state">当前没有可展示的技能。</div>';
    return;
  }

  const labels = {
    generic: "Generic / 通用基础层",
    docType: "Doc Type / 文档类型层",
    domain: "Domain / 领域层",
    module: "Module / 模块层"
  };

  skillGroupsRoot.innerHTML = ["generic", "docType", "domain", "module"]
    .map((type) => {
      const items = state.payload.groups[type] || [];
      return `
        <section class="skill-group">
          <div class="skill-group-head">
            <div>
              <h3>${escapeHtml(labels[type])}</h3>
              <p>${escapeHtml(groupDescription(type))}</p>
            </div>
            <span class="skill-group-count">${items.length}</span>
          </div>
          <div class="skill-list">
            ${
              items.length
                ? items.map((item) => renderSkillItem(item)).join("")
                : '<div class="skill-item"><span class="skill-item-key">暂无条目</span></div>'
            }
          </div>
        </section>
      `;
    })
    .join("");
}

function renderSkillItem(item) {
  return `
    <button
      type="button"
      class="skill-item ${item.type === state.selectedType && item.key === state.selectedKey ? "is-selected" : ""} ${item.abnormal ? "is-abnormal" : ""}"
      data-select-skill="${escapeHtml(item.type)}:${escapeHtml(item.key)}"
    >
      <div class="skill-item-top">
        <div>
          <span class="skill-item-title">${escapeHtml(item.displayName)}</span>
          <span class="skill-item-key">${escapeHtml(item.key)}</span>
        </div>
        <span class="mini-pill ${item.abnormal ? "warning" : "subtle"}">${item.abnormal ? "异常" : item.label}</span>
      </div>
      <div class="skill-item-meta">
        <span>${item.metrics.fileCount} 个文件</span>
        <span>${item.metrics.exampleCount} 条 examples</span>
        <span>${item.metrics.ruleHintCount} 条 ruleHints</span>
      </div>
    </button>
  `;
}

function renderDetail(errorMessage = "") {
  if (errorMessage) {
    skillDetailRoot.innerHTML = `<div class="skill-detail-empty">${escapeHtml(errorMessage)}</div>`;
    return;
  }

  if (!state.detail?.item) {
    skillDetailRoot.innerHTML = '<div class="skill-detail-empty">请选择一个技能查看详情。</div>';
    return;
  }

  const { item, knowledge, files, capabilities } = state.detail;
  const markdownFiles = files.filter((entry) => entry.role !== "domain-knowledge.json");

  skillDetailRoot.innerHTML = `
    <div class="detail-banner">
      <div>
        <h3>${escapeHtml(item.displayName)}</h3>
        <p>${escapeHtml(item.type)} · key: ${escapeHtml(item.key)}</p>
        <p>${item.abnormal ? "当前技能存在 manifest 与文件不一致的情况，请先修复或删除异常项。" : "当前技能结构正常，可查看或编辑结构化知识字段。"}</p>
      </div>
      <div class="detail-banner-actions">
        <button type="button" class="secondary-button" data-reload-detail="true">重新加载详情</button>
        <button
          type="button"
          class="danger-button"
          data-delete-skill="${escapeHtml(item.type)}:${escapeHtml(item.key)}"
          ${capabilities.canDelete ? "" : "disabled"}
          title="${escapeHtml(capabilities.deleteDisabledReason || "")}"
        >
          删除技能
        </button>
      </div>
    </div>

    <div class="detail-metadata-grid">
      <div class="detail-meta-card">
        <span>类型</span>
        <strong>${escapeHtml(item.label)}</strong>
      </div>
      <div class="detail-meta-card">
        <span>知识文件</span>
        <strong>${escapeHtml(item.knowledgePath || "无")}</strong>
      </div>
      <div class="detail-meta-card">
        <span>Markdown 文件</span>
        <strong>${item.hasMarkdownFiles ? "有" : "无"}</strong>
      </div>
      <div class="detail-meta-card">
        <span>状态</span>
        <strong>${item.abnormal ? "异常项" : "正常"}</strong>
      </div>
    </div>

    <section class="detail-section">
      <h3>关联文件</h3>
      <p class="detail-section-copy">这里展示 manifest 中注册到该技能的文件清单；Markdown 文件首版仅展示摘要。</p>
      <div class="file-summary-list">
        ${files.map((entry) => renderFileSummary(entry)).join("")}
      </div>
    </section>

    <section class="detail-section">
      <h3>Markdown 摘要</h3>
      <p class="detail-section-copy">首版不直接编辑 Markdown，先以只读摘要帮助快速判断 skill 覆盖内容。</p>
      <div class="file-summary-list">
        ${
          markdownFiles.length
            ? markdownFiles.map((entry) => renderMarkdownPreview(entry)).join("")
            : '<div class="empty-state">当前技能没有额外 Markdown 文件。</div>'
        }
      </div>
    </section>

    <section class="detail-section">
      <h3>结构化知识编辑</h3>
      <p class="detail-section-copy">保存时仅更新 <code>domain-knowledge.json</code>，不会修改 Markdown 文件或其他历史 bundle。</p>
      <form id="knowledge-form" class="stack-form">
        <div class="form-grid-two">
          <label>
            version
            <input type="number" name="version" min="1" value="${escapeHtml(String(knowledge.version || 1))}" />
          </label>
          <label>
            generationPriorities
            <textarea name="generationPriorities" rows="5" placeholder="每行一条">${escapeHtml((knowledge.generationPriorities || []).join("\n"))}</textarea>
          </label>
        </div>

        <section class="editor-card">
          <div class="editor-card-head">
            <h4>Anti Patterns</h4>
          </div>
          <label>
            每行一条
            <textarea name="antiPatterns" rows="5" placeholder="每行一个 anti pattern">${escapeHtml((knowledge.antiPatterns || []).join("\n"))}</textarea>
          </label>
        </section>

        <section class="editor-card">
          <div class="editor-card-head">
            <h4>Rule Hints</h4>
            <button type="button" class="ghost-button" data-add-item="ruleHint">新增 Rule Hint</button>
          </div>
          <div id="rule-hints-root" class="stack-editor-list">${(knowledge.ruleHints || []).map((item, index) => renderRuleHintEditor(item, index)).join("")}</div>
        </section>

        <section class="editor-card">
          <div class="editor-card-head">
            <h4>Examples</h4>
            <button type="button" class="ghost-button" data-add-item="example">新增 Example</button>
          </div>
          <div id="examples-root" class="stack-editor-list">${(knowledge.examples || []).map((item, index) => renderExampleEditor(item, index)).join("")}</div>
        </section>

        <section class="editor-card">
          <div class="editor-card-head">
            <h4>Document Blueprint</h4>
          </div>
          ${renderDocumentBlueprintEditor(knowledge.documentBlueprint || null)}
        </section>

        <section class="editor-card">
          <div class="editor-card-head">
            <h4>Source Of Truth Policy</h4>
          </div>
          ${renderSourceOfTruthPolicyEditor(knowledge.sourceOfTruthPolicy || null)}
        </section>

        <div class="form-actions-row">
          <button type="submit" ${capabilities.canEdit ? "" : "disabled"}>保存结构化知识</button>
          <button type="button" class="secondary-button" data-reset-detail="true">放弃未保存修改</button>
        </div>
        <p class="status status-inline">${capabilities.canEdit ? "支持保存当前技能的结构化字段。" : "当前技能暂不支持结构化编辑。"}</p>
      </form>
    </section>
  `;
}

function renderFileSummary(entry) {
  return `
    <article class="file-summary-item">
      <div class="file-summary-row">
        <strong>${escapeHtml(entry.role)}</strong>
        <span class="mini-pill ${entry.exists ? "success" : "warning"}">${entry.exists ? "存在" : "缺失"}</span>
        <span class="code-chip">${escapeHtml(entry.relativePath)}</span>
      </div>
      <div class="inline-meta-row">
        <span class="code-chip">${entry.size || 0} B</span>
        <span class="code-chip">${escapeHtml(entry.absolutePath)}</span>
      </div>
    </article>
  `;
}

function renderMarkdownPreview(entry) {
  return `
    <article class="file-summary-item">
      <div class="file-summary-row">
        <strong>${escapeHtml(entry.role)}</strong>
        <span class="code-chip">${escapeHtml(entry.relativePath)}</span>
      </div>
      <div class="preview-block">${escapeHtml(entry.preview || "当前文件没有可展示的摘要。")}</div>
    </article>
  `;
}

function renderRuleHintEditor(item = {}, index = 0) {
  return `
    <article class="editor-card" data-collection-item="ruleHint">
      <div class="editor-card-head">
        <h4>Rule Hint ${index + 1}</h4>
        <button type="button" class="ghost-button" data-remove-item="ruleHint">删除</button>
      </div>
      <div class="form-grid-three">
        <label>domain<input name="ruleHint.domain" value="${escapeHtml(item.domain || "")}" /></label>
        <label>subdomain<input name="ruleHint.subdomain" value="${escapeHtml(item.subdomain || "")}" /></label>
        <label>targetStyle<input name="ruleHint.targetStyle" value="${escapeHtml(item.targetStyle || "")}" /></label>
      </div>
      <label>sectionHints<textarea name="ruleHint.sectionHints" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item.sectionHints))}</textarea></label>
      <label>writingPattern<textarea name="ruleHint.writingPattern" rows="3">${escapeHtml(item.writingPattern || "")}</textarea></label>
      <label>sourceBasis<textarea name="ruleHint.sourceBasis" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item.sourceBasis))}</textarea></label>
    </article>
  `;
}

function renderExampleEditor(item = {}, index = 0) {
  return `
    <article class="editor-card" data-collection-item="example">
      <div class="editor-card-head">
        <h4>Example ${index + 1}</h4>
        <button type="button" class="ghost-button" data-remove-item="example">删除</button>
      </div>
      <div class="form-grid-three">
        <label>requirementId<input name="example.requirementId" value="${escapeHtml(item.requirementId || "")}" /></label>
        <label>topic<input name="example.topic" value="${escapeHtml(item.topic || "")}" /></label>
        <label>requirementType<input name="example.requirementType" value="${escapeHtml(item.requirementType || "")}" /></label>
      </div>
      <div class="form-grid-two">
        <label>sectionNumber<input name="example.sectionNumber" value="${escapeHtml(item.sectionNumber || "")}" /></label>
        <label>sectionTitle<input name="example.sectionTitle" value="${escapeHtml(item.sectionTitle || "")}" /></label>
      </div>
      <label>preferredTitle<input name="example.preferredTitle" value="${escapeHtml(item.preferredTitle || "")}" /></label>
      <label>requirementText<textarea name="example.requirementText" rows="4">${escapeHtml(item.requirementText || "")}</textarea></label>
      <div class="form-grid-three">
        <label>signals<textarea name="example.signals" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item.signals))}</textarea></label>
        <label>references<textarea name="example.references" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item.references))}</textarea></label>
        <label>keywords<textarea name="example.keywords" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item.keywords))}</textarea></label>
      </div>
      <label>canonicalBranches<textarea name="example.canonicalBranches" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item.canonicalBranches))}</textarea></label>
    </article>
  `;
}

function renderDocumentBlueprintEditor(item) {
  return `
    <div class="stack-form">
      <div class="form-grid-two">
        <label>
          domain
          <input name="documentBlueprint.domain" value="${escapeHtml(item?.domain || "")}" placeholder="留空表示不启用" />
        </label>
        <label>
          subdomain
          <input name="documentBlueprint.subdomain" value="${escapeHtml(item?.subdomain || "")}" />
        </label>
      </div>
      <div class="form-grid-two">
        <label>
          preferredFunctionSection.title
          <input name="documentBlueprint.preferredFunctionSection.title" value="${escapeHtml(item?.preferredFunctionSection?.title || "")}" />
        </label>
        <label>
          preferredFunctionSection.sectionNumber
          <input name="documentBlueprint.preferredFunctionSection.sectionNumber" value="${escapeHtml(item?.preferredFunctionSection?.sectionNumber || "")}" />
        </label>
      </div>
      <label>
        preferredSubsections
        <textarea name="documentBlueprint.preferredSubsections" rows="5" placeholder="每行一个 subsection，格式：title|sectionNumber|type1,type2">${escapeHtml(blueprintSubsectionsToLines(item?.preferredSubsections || []))}</textarea>
      </label>
      <label>
        targetOutputPolicy
        <textarea name="documentBlueprint.targetOutputPolicy" rows="4" placeholder="每行一个开关，格式：key=true">${escapeHtml(keyValueObjectToLines(item?.targetOutputPolicy || {}))}</textarea>
      </label>
    </div>
  `;
}

function renderSourceOfTruthPolicyEditor(item) {
  return `
    <div class="stack-form">
      <div class="form-grid-three">
        <label>standard<input name="sourceOfTruthPolicy.standard" value="${escapeHtml(item?.standard || "")}" placeholder="留空表示不启用" /></label>
        <label>singleSourceOfTruth<input name="sourceOfTruthPolicy.singleSourceOfTruth" value="${escapeHtml(item?.singleSourceOfTruth || "")}" /></label>
        <label>forbidCodeStyleSignals
          <select name="sourceOfTruthPolicy.forbidCodeStyleSignals">
            <option value="">未设置</option>
            <option value="true" ${item?.forbidCodeStyleSignals === true ? "selected" : ""}>true</option>
            <option value="false" ${item?.forbidCodeStyleSignals === false ? "selected" : ""}>false</option>
          </select>
        </label>
      </div>
      <div class="form-grid-two">
        <label>codeStylePrefixes<textarea name="sourceOfTruthPolicy.codeStylePrefixes" rows="3" placeholder="每行一条">${escapeHtml(arrayToLines(item?.codeStylePrefixes || []))}</textarea></label>
        <label>normalizationRules<textarea name="sourceOfTruthPolicy.normalizationRules" rows="4" placeholder="每行一条，格式：pattern=>replacement">${escapeHtml(normalizationRulesToLines(item?.normalizationRules || []))}</textarea></label>
      </div>
      <div class="form-grid-two">
        <label>canonicalSignalAliases<textarea name="sourceOfTruthPolicy.canonicalSignalAliases" rows="4" placeholder="每行一条，格式：canonical=>alias1,alias2">${escapeHtml(signalAliasesToLines(item?.canonicalSignalAliases || []))}</textarea></label>
        <label>forbiddenExpansions<textarea name="sourceOfTruthPolicy.forbiddenExpansions" rows="4" placeholder="每行一条，格式：topic=>item1,item2">${escapeHtml(forbiddenExpansionsToLines(item?.forbiddenExpansions || {}))}</textarea></label>
      </div>
    </div>
  `;
}

function handleSkillSelection(event) {
  const button = event.target.closest("[data-select-skill]");
  if (!button) return;
  const [type, key] = String(button.dataset.selectSkill || "").split(":");
  if (!type || !key) return;
  state.selectedType = type;
  state.selectedKey = key;
  renderGroups();
  loadSelectedDetail();
}

async function handleDetailClick(event) {
  const addButton = event.target.closest("[data-add-item]");
  if (addButton) {
    const collection = addButton.dataset.addItem;
    appendCollectionItem(collection);
    return;
  }

  const removeButton = event.target.closest("[data-remove-item]");
  if (removeButton) {
    const type = removeButton.dataset.removeItem;
    removeButton.closest(`[data-collection-item="${type}"]`)?.remove();
    renumberCollection(type);
    return;
  }

  if (event.target.closest("[data-reset-detail]")) {
    renderDetail();
    return;
  }

  if (event.target.closest("[data-reload-detail]")) {
    await loadSelectedDetail();
    setPageStatus("技能详情已重新加载。");
    return;
  }

  const deleteButton = event.target.closest("[data-delete-skill]");
  if (deleteButton && !deleteButton.disabled) {
    const { item } = state.detail || {};
    if (!item) return;
    const confirmed = window.confirm(`确认删除 ${item.displayName} 吗？此操作会移除 manifest 注册并删除该技能自己的 profile 文件。`);
    if (!confirmed) return;
    const nextSelection = findNextSelection(item.type, item.key);

    try {
      setPageStatus(`正在删除 ${item.displayName}...`);
      await request(`/api/skill-management/${encodeURIComponent(item.type)}/${encodeURIComponent(item.key)}`, {
        method: "DELETE"
      });
      state.selectedType = nextSelection?.type || "";
      state.selectedKey = nextSelection?.key || "";
      await refreshAll(false);
      setPageStatus(`已删除 ${item.displayName}。`);
    } catch (error) {
      setPageStatus(`删除失败：${error.message}`, true);
    }
  }
}

async function handleSave(event) {
  if (event.target.id !== "knowledge-form") return;
  event.preventDefault();
  if (!state.detail?.item) return;

  const form = event.target;
  const payload = {
    knowledge: buildKnowledgePayload(form)
  };

  try {
    setPageStatus(`正在保存 ${state.detail.item.displayName}...`);
    state.detail = await request(
      `/api/skill-management/${encodeURIComponent(state.detail.item.type)}/${encodeURIComponent(state.detail.item.key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    renderDetail();
    state.payload = await request("/api/skill-management");
    renderSummary();
    renderGroups();
    setPageStatus(`已保存 ${state.detail.item.displayName}。`);
  } catch (error) {
    setPageStatus(`保存失败：${error.message}`, true);
  }
}

function buildKnowledgePayload(form) {
  const knowledge = {
    version: Number(form.elements.namedItem("version")?.value || 1) || 1,
    generationPriorities: linesToArray(form.elements.namedItem("generationPriorities")?.value),
    antiPatterns: linesToArray(form.elements.namedItem("antiPatterns")?.value),
    ruleHints: collectRuleHints(form),
    examples: collectExamples(form)
  };

  const documentBlueprint = collectDocumentBlueprint(form);
  if (documentBlueprint) {
    knowledge.documentBlueprint = documentBlueprint;
  }

  const sourceOfTruthPolicy = collectSourceOfTruthPolicy(form);
  if (sourceOfTruthPolicy) {
    knowledge.sourceOfTruthPolicy = sourceOfTruthPolicy;
  }

  return knowledge;
}

function collectRuleHints(form) {
  return Array.from(form.querySelectorAll('[data-collection-item="ruleHint"]'))
    .map((card) => ({
      domain: valueOf(card, 'input[name="ruleHint.domain"]'),
      subdomain: valueOf(card, 'input[name="ruleHint.subdomain"]'),
      sectionHints: linesToArray(valueOf(card, 'textarea[name="ruleHint.sectionHints"]')),
      writingPattern: valueOf(card, 'textarea[name="ruleHint.writingPattern"]'),
      targetStyle: valueOf(card, 'input[name="ruleHint.targetStyle"]'),
      sourceBasis: linesToArray(valueOf(card, 'textarea[name="ruleHint.sourceBasis"]'))
    }))
    .filter((item) => hasMeaningfulValues(item));
}

function collectExamples(form) {
  return Array.from(form.querySelectorAll('[data-collection-item="example"]'))
    .map((card) => ({
      requirementId: valueOf(card, 'input[name="example.requirementId"]'),
      topic: valueOf(card, 'input[name="example.topic"]'),
      sectionNumber: valueOf(card, 'input[name="example.sectionNumber"]'),
      sectionTitle: valueOf(card, 'input[name="example.sectionTitle"]'),
      requirementType: valueOf(card, 'input[name="example.requirementType"]'),
      preferredTitle: valueOf(card, 'input[name="example.preferredTitle"]'),
      requirementText: valueOf(card, 'textarea[name="example.requirementText"]'),
      signals: linesToArray(valueOf(card, 'textarea[name="example.signals"]')),
      references: linesToArray(valueOf(card, 'textarea[name="example.references"]')),
      canonicalBranches: linesToArray(valueOf(card, 'textarea[name="example.canonicalBranches"]')),
      keywords: linesToArray(valueOf(card, 'textarea[name="example.keywords"]'))
    }))
    .filter((item) => hasMeaningfulValues(item));
}

function collectDocumentBlueprint(form) {
  const domain = form.elements.namedItem("documentBlueprint.domain")?.value?.trim() || "";
  const subdomain = form.elements.namedItem("documentBlueprint.subdomain")?.value?.trim() || "";
  const title = form.elements.namedItem("documentBlueprint.preferredFunctionSection.title")?.value?.trim() || "";
  const sectionNumber = form.elements.namedItem("documentBlueprint.preferredFunctionSection.sectionNumber")?.value?.trim() || "";
  const preferredSubsections = parseBlueprintSubsections(form.elements.namedItem("documentBlueprint.preferredSubsections")?.value);
  const targetOutputPolicy = parseKeyValueObject(form.elements.namedItem("documentBlueprint.targetOutputPolicy")?.value);

  const result = {
    domain,
    subdomain,
    preferredFunctionSection: title || sectionNumber ? { title, sectionNumber } : undefined,
    preferredSubsections,
    targetOutputPolicy
  };

  return hasMeaningfulValues(result) ? result : null;
}

function collectSourceOfTruthPolicy(form) {
  const forbidCodeStyleSignalsRaw = form.elements.namedItem("sourceOfTruthPolicy.forbidCodeStyleSignals")?.value || "";
  const result = {
    standard: form.elements.namedItem("sourceOfTruthPolicy.standard")?.value?.trim() || "",
    singleSourceOfTruth: form.elements.namedItem("sourceOfTruthPolicy.singleSourceOfTruth")?.value?.trim() || "",
    forbidCodeStyleSignals:
      forbidCodeStyleSignalsRaw === "true" ? true : forbidCodeStyleSignalsRaw === "false" ? false : undefined,
    codeStylePrefixes: linesToArray(form.elements.namedItem("sourceOfTruthPolicy.codeStylePrefixes")?.value),
    normalizationRules: parseNormalizationRules(form.elements.namedItem("sourceOfTruthPolicy.normalizationRules")?.value),
    canonicalSignalAliases: parseSignalAliases(form.elements.namedItem("sourceOfTruthPolicy.canonicalSignalAliases")?.value),
    forbiddenExpansions: parseForbiddenExpansions(form.elements.namedItem("sourceOfTruthPolicy.forbiddenExpansions")?.value)
  };
  return hasMeaningfulValues(result) ? result : null;
}

function appendCollectionItem(collection) {
  if (collection === "ruleHint") {
    const root = document.querySelector("#rule-hints-root");
    const index = root.querySelectorAll('[data-collection-item="ruleHint"]').length;
    root.insertAdjacentHTML("beforeend", renderRuleHintEditor({}, index));
    renumberCollection("ruleHint");
    return;
  }

  if (collection === "example") {
    const root = document.querySelector("#examples-root");
    const index = root.querySelectorAll('[data-collection-item="example"]').length;
    root.insertAdjacentHTML("beforeend", renderExampleEditor({}, index));
    renumberCollection("example");
  }
}

function renumberCollection(collection) {
  document.querySelectorAll(`[data-collection-item="${collection}"] h4`).forEach((title, index) => {
    title.textContent = `${collection === "ruleHint" ? "Rule Hint" : "Example"} ${index + 1}`;
  });
}

function groupDescription(type) {
  return (
    {
      generic: "全局共享规则与示例，首版只读为主。",
      docType: "按文档类型叠加的写作与校验规则。",
      domain: "按业务领域共享的知识与写法约束。",
      module: "按功能模块沉淀的专属 skill，可重点编辑删除。"
    }[type] || ""
  );
}

function findNextSelection(type, key) {
  const sameGroup = (state.payload?.groups?.[type] || []).filter((item) => item.key !== key);
  return sameGroup[0] || listAllItems().find((item) => !(item.type === type && item.key === key)) || null;
}

function setPageStatus(message, isError = false) {
  pageStatusRoot.textContent = message || "";
  pageStatusRoot.className = isError ? "status status-busy" : "status";
}

function hasMeaningfulValues(value) {
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulValues(item));
  if (value && typeof value === "object") return Object.values(value).some((item) => hasMeaningfulValues(item));
  return Boolean(String(value ?? "").trim());
}

function valueOf(root, selector) {
  return root.querySelector(selector)?.value?.trim() || "";
}

function linesToArray(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(values = []) {
  return Array.isArray(values) ? values.filter(Boolean).join("\n") : "";
}

function blueprintSubsectionsToLines(items = []) {
  return (items || [])
    .map((item) => [item.title || "", item.sectionNumber || "", (item.coreRequirementTypes || []).join(",")].join("|"))
    .join("\n");
}

function parseBlueprintSubsections(value = "") {
  return linesToArray(value)
    .map((line) => {
      const [title = "", sectionNumber = "", coreRequirementTypes = ""] = line.split("|");
      return {
        title: title.trim(),
        sectionNumber: sectionNumber.trim(),
        coreRequirementTypes: coreRequirementTypes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      };
    })
    .filter((item) => item.title || item.sectionNumber || item.coreRequirementTypes.length);
}

function keyValueObjectToLines(value = {}) {
  return Object.entries(value || {})
    .map(([key, item]) => `${key}=${String(item)}`)
    .join("\n");
}

function parseKeyValueObject(value = "") {
  const entries = linesToArray(value)
    .map((line) => {
      const [key, raw] = line.split("=");
      if (!key || raw === undefined) return null;
      const normalized = raw.trim().toLowerCase();
      const parsed = normalized === "true" ? true : normalized === "false" ? false : raw.trim();
      return [key.trim(), parsed];
    })
    .filter(Boolean);
  return Object.fromEntries(entries);
}

function normalizationRulesToLines(items = []) {
  return (items || []).map((item) => `${item.pattern || ""}=>${item.replacement || ""}`).join("\n");
}

function parseNormalizationRules(value = "") {
  return linesToArray(value)
    .map((line) => {
      const [pattern, replacement] = line.split("=>");
      if (!pattern || replacement === undefined) return null;
      return { pattern: pattern.trim(), replacement: replacement.trim() };
    })
    .filter(Boolean);
}

function signalAliasesToLines(items = []) {
  return (items || [])
    .map((item) => `${item.canonical || ""}=>${(item.aliases || []).join(",")}`)
    .join("\n");
}

function parseSignalAliases(value = "") {
  return linesToArray(value)
    .map((line) => {
      const [canonical, aliases] = line.split("=>");
      if (!canonical || aliases === undefined) return null;
      return {
        canonical: canonical.trim(),
        aliases: aliases
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      };
    })
    .filter(Boolean);
}

function forbiddenExpansionsToLines(value = {}) {
  return Object.entries(value || {})
    .map(([key, items]) => `${key}=>${Array.isArray(items) ? items.join(",") : ""}`)
    .join("\n");
}

function parseForbiddenExpansions(value = "") {
  const entries = linesToArray(value)
    .map((line) => {
      const [topic, rawItems] = line.split("=>");
      if (!topic || rawItems === undefined) return null;
      return [
        topic.trim(),
        rawItems
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      ];
    })
    .filter(Boolean);
  return Object.fromEntries(entries);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
