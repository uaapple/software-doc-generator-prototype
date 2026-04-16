const PROFILE_LAYER_ORDER = ["generic", "docType", "domain", "module"]

const KIND_ORDER = [
  "writing_rule",
  "extraction_rule",
  "validation_rule",
  "good_example",
  "bad_example",
  "generation_priority",
  "rule_hint",
  "anti_pattern",
  "source_alias",
  "code_style_prefix",
  "forbidden_expansion",
  "normalization_rule",
  "source_policy_setting",
  "document_blueprint_section",
  "document_blueprint_policy"
]

const KIND_LABELS = {
  writing_rule: "写作规则",
  extraction_rule: "抽取规则",
  validation_rule: "校验规则",
  good_example: "正例",
  bad_example: "反例",
  generation_priority: "生成优先级",
  rule_hint: "规则提示",
  anti_pattern: "反模式",
  source_alias: "信号别名",
  code_style_prefix: "代码前缀",
  forbidden_expansion: "禁止扩写",
  normalization_rule: "归一化规则",
  source_policy_setting: "Source Policy 设置",
  document_blueprint_section: "文档蓝图章节",
  document_blueprint_policy: "文档蓝图策略"
}

const state = {
  payload: null,
  detailProfile: null,
  detailItem: null,
  selectedProfileId: "",
  selectedSkillCode: "",
  selectedKind: "",
  itemQuery: "",
  isEditorOpen: false,
  editorMode: "edit",
  railFilters: {
    query: "",
    layer: "all"
  }
}

const refreshButton = document.querySelector("#refresh-button")
const pageStatusRoot = document.querySelector("#page-status")
const summaryMetricsRoot = document.querySelector("#summary-metrics")
const sourceMetaRoot = document.querySelector("#source-meta")
const profileQueryInput = document.querySelector("#profile-query")
const profileLayerFilter = document.querySelector("#profile-layer-filter")
const profileRailRoot = document.querySelector("#profile-rail")
const itemBrowserChromeRoot = document.querySelector("#item-browser-chrome")
const itemQueryInput = document.querySelector("#item-query")
const itemBrowserRoot = document.querySelector("#item-browser")
const reviewPaneRoot = document.querySelector("#review-pane")
const editorBackdrop = document.querySelector("#editor-backdrop")
const editorDrawer = document.querySelector("#editor-drawer")
const editorDrawerBody = document.querySelector("#editor-drawer-body")

await bootstrap()

refreshButton.addEventListener("click", () => refreshAll(true))
profileQueryInput.addEventListener("input", handleRailFilterChange)
profileLayerFilter.addEventListener("change", handleRailFilterChange)
profileRailRoot.addEventListener("click", handleRailClick)
itemQueryInput.addEventListener("input", handleItemQueryChange)
itemBrowserChromeRoot.addEventListener("click", handleBrowserClick)
itemBrowserRoot.addEventListener("click", handleBrowserClick)
reviewPaneRoot.addEventListener("click", handleReviewClick)
editorBackdrop.addEventListener("click", () => closeEditor())
editorDrawerBody.addEventListener("click", handleDrawerClick)
editorDrawerBody.addEventListener("submit", handleEditorSubmit)
document.addEventListener("keydown", handleGlobalKeydown)

async function bootstrap() {
  await refreshAll(false)
}

async function refreshAll(showHint = false) {
  try {
    if (showHint) setPageStatus("正在刷新 skill registry...")
    state.payload = await request("/api/skill-management")
    syncSelection()
    renderSummary()
    renderWorkspace()
    await loadSelection()
    if (showHint) setPageStatus("skill registry 已刷新。")
  } catch (error) {
    setPageStatus(buildLoadFailureMessage(error), true)
    state.detailProfile = null
    state.detailItem = null
    renderWorkspace()
  }
}

async function handleRailFilterChange() {
  const before = selectionStamp()
  state.railFilters.query = profileQueryInput.value.trim()
  state.railFilters.layer = profileLayerFilter.value || "all"
  syncSelection()
  renderWorkspace()
  if (before !== selectionStamp()) {
    await loadSelection()
  }
}

async function handleItemQueryChange() {
  const before = selectionStamp()
  state.itemQuery = itemQueryInput.value.trim()
  syncSelection()
  renderWorkspace()
  if (before !== selectionStamp() && state.selectedSkillCode) {
    await loadSelection()
  }
}

async function handleRailClick(event) {
  const button = event.target.closest("[data-select-profile]")
  if (!button) return
  const nextProfileId = String(button.dataset.selectProfile || "")
  if (!nextProfileId) return

  const before = selectionStamp()
  state.selectedProfileId = nextProfileId
  state.selectedSkillCode = ""
  state.selectedKind = ""
  state.itemQuery = ""
  itemQueryInput.value = ""
  syncSelection()
  renderWorkspace()
  if (before !== selectionStamp()) {
    await loadSelection()
  }
}

async function handleBrowserClick(event) {
  const clearQueryButton = event.target.closest("[data-clear-item-query]")
  if (clearQueryButton) {
    const before = selectionStamp()
    state.itemQuery = ""
    itemQueryInput.value = ""
    syncSelection()
    renderWorkspace()
    if (before !== selectionStamp()) {
      await loadSelection()
    }
    return
  }

  const reloadButton = event.target.closest("[data-reload-profile]")
  if (reloadButton) {
    await loadSelection()
    setPageStatus("当前 profile 已重新加载。")
    return
  }

  const materializeButton = event.target.closest("[data-materialize-registry]")
  if (materializeButton) {
    await materializeRegistry()
    return
  }

  const deleteProfileButton = event.target.closest("[data-delete-profile]")
  if (deleteProfileButton) {
    const profile = getSelectedProfileSummary()
    const detail = state.detailProfile
    if (!profile || detail?.capabilities?.canDelete === false) return
    const confirmed = window.confirm(`确认删除 ${profile.key} profile 吗？这会移除 manifest 注册以及对应目录下的 registry 与物化文件。`)
    if (!confirmed) return

    try {
      await request(`/api/skill-management/${encodeURIComponent(profile.type)}/${encodeURIComponent(profile.key)}`, {
        method: "DELETE"
      })
      state.selectedProfileId = ""
      state.selectedSkillCode = ""
      state.selectedKind = ""
      state.detailProfile = null
      state.detailItem = null
      closeEditor()
      await refreshAll(false)
      setPageStatus(`已删除 ${profile.key} profile。`)
    } catch (error) {
      setPageStatus(`删除失败：${error.message}`, true)
    }
    return
  }

  const openEditorButton = event.target.closest("[data-open-editor]")
  if (openEditorButton) {
    openEditor(openEditorButton.dataset.openEditor)
    return
  }

  const kindButton = event.target.closest("[data-select-kind]")
  if (kindButton) {
    const kind = String(kindButton.dataset.selectKind || "")
    const items = getSelectedProfileItems().filter((item) => item.kind === kind)
    if (!kind || !items.length) return

    const before = selectionStamp()
    state.itemQuery = ""
    itemQueryInput.value = ""
    state.selectedKind = kind
    state.selectedSkillCode = items[0].skillCode
    syncSelection()
    renderWorkspace()
    if (before !== selectionStamp()) {
      await loadSelection()
    }
    return
  }

  const itemButton = event.target.closest("[data-select-item]")
  if (itemButton) {
    const nextSkillCode = String(itemButton.dataset.selectItem || "")
    const selectedItem = getSelectedProfileItems().find((item) => item.skillCode === nextSkillCode)
    if (!nextSkillCode || !selectedItem) return

    const before = selectionStamp()
    state.selectedSkillCode = nextSkillCode
    state.selectedKind = selectedItem.kind
    syncSelection()
    renderWorkspace()
    if (before !== selectionStamp()) {
      await loadSelection()
    }
  }
}

async function handleReviewClick(event) {
  const openEditorButton = event.target.closest("[data-open-editor]")
  if (openEditorButton) {
    openEditor(openEditorButton.dataset.openEditor)
    return
  }

  const copyButton = event.target.closest("[data-copy-skill-code]")
  if (copyButton) {
    const skillCode = String(copyButton.dataset.copySkillCode || "")
    if (!skillCode) return
    await copyText(skillCode)
    setPageStatus(`已复制 ${skillCode}`)
    return
  }

  const reloadButton = event.target.closest("[data-reload-item]")
  if (reloadButton) {
    await loadSelection()
    setPageStatus("当前 skill item 已重新加载。")
    return
  }

  const reorderButton = event.target.closest("[data-reorder-item]")
  if (reorderButton) {
    const direction = String(reorderButton.dataset.reorderItem || "")
    const skillCode = state.selectedSkillCode
    if (!skillCode || !direction) return
    try {
      await request(`/api/skill-items/${encodeURIComponent(skillCode)}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction })
      })
      state.selectedSkillCode = skillCode
      await refreshAll(false)
      setPageStatus(`已${direction === "up" ? "上移" : "下移"} ${skillCode}。`)
    } catch (error) {
      setPageStatus(`排序失败：${error.message}`, true)
    }
    return
  }

  const deleteButton = event.target.closest("[data-delete-item]")
  if (deleteButton) {
    const skillCode = String(deleteButton.dataset.deleteItem || "")
    if (!skillCode) return
    const confirmed = window.confirm(`确认删除 ${skillCode} 吗？这会删除该 atomic skill item。`)
    if (!confirmed) return

    try {
      await request(`/api/skill-items/${encodeURIComponent(skillCode)}`, { method: "DELETE" })
      state.selectedSkillCode = ""
      state.detailItem = null
      closeEditor()
      await refreshAll(false)
      setPageStatus(`已删除 ${skillCode}。`)
    } catch (error) {
      setPageStatus(`删除失败：${error.message}`, true)
    }
  }
}

function handleDrawerClick(event) {
  if (event.target.closest("[data-close-editor]")) {
    closeEditor()
  }
}

async function handleEditorSubmit(event) {
  if (event.target.id !== "skill-editor-form") return
  event.preventDefault()

  const form = event.target
  const payload = {
    layer: form.elements.namedItem("layer")?.value || getSelectedProfileSummary()?.type || "module",
    profileKey: form.elements.namedItem("profileKey")?.value?.trim() || getSelectedProfileSummary()?.key || "generic",
    kind: form.elements.namedItem("kind")?.value || state.selectedKind || "writing_rule",
    title: form.elements.namedItem("title")?.value?.trim() || "Skill Item",
    status: form.elements.namedItem("status")?.value || "active",
    content: form.elements.namedItem("content")?.value || ""
  }

  try {
    const structuredPayload = parseJsonField(form.elements.namedItem("structuredPayload")?.value || "")
    if (structuredPayload !== null) {
      payload.structuredPayload = structuredPayload
    }

    setPageStatus(state.editorMode === "create" ? "正在创建 skill item..." : "正在保存 skill item...")

    const saved =
      state.editorMode === "create"
        ? await request("/api/skill-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        : await request(`/api/skill-items/${encodeURIComponent(state.selectedSkillCode)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })

    ensureProfileVisible(saved.layer, saved.profileKey)
    state.selectedProfileId = `${saved.layer}:${saved.profileKey}`
    state.selectedSkillCode = saved.skillCode
    state.selectedKind = saved.kind
    state.itemQuery = ""
    itemQueryInput.value = ""
    closeEditor(false)
    await refreshAll(false)
    setPageStatus(`已保存 ${saved.skillCode}。`)
  } catch (error) {
    setPageStatus(`保存失败：${error.message}`, true)
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && state.isEditorOpen) {
    closeEditor()
  }
}

async function loadSelection() {
  const profile = getSelectedProfileSummary()
  if (!profile) {
    state.detailProfile = null
    state.detailItem = null
    renderWorkspace()
    return
  }

  try {
    state.detailProfile = await request(`/api/skill-management/${encodeURIComponent(profile.type)}/${encodeURIComponent(profile.key)}`)
  } catch (error) {
    state.detailProfile = null
    state.detailItem = null
    setPageStatus(`加载 profile 详情失败：${error.message}`, true)
    renderWorkspace()
    return
  }

  if (!state.selectedSkillCode) {
    state.detailItem = null
    renderWorkspace()
    return
  }

  try {
    state.detailItem = await request(`/api/skill-items/${encodeURIComponent(state.selectedSkillCode)}`)
  } catch (error) {
    state.detailItem = null
    setPageStatus(`加载 skill item 详情失败：${error.message}`, true)
  }

  renderWorkspace()
}

function syncSelection() {
  const previousProfileId = state.selectedProfileId
  const previousSkillCode = state.selectedSkillCode
  const visibleProfiles = getVisibleProfilesFlat()

  if (!visibleProfiles.length) {
    state.selectedProfileId = ""
    state.selectedSkillCode = ""
    state.selectedKind = ""
    state.detailProfile = null
    state.detailItem = null
    return
  }

  if (!visibleProfiles.some((profile) => getProfileId(profile) === state.selectedProfileId)) {
    state.selectedProfileId = getProfileId(visibleProfiles[0])
  }

  const items = getSelectedProfileItems()
  if (!items.length) {
    state.selectedSkillCode = ""
    state.selectedKind = ""
  } else if (state.itemQuery) {
    const matched = items.filter((item) => itemMatchesQuery(item, state.itemQuery))
    if (!matched.length) {
      state.selectedSkillCode = ""
      state.selectedKind = state.selectedKind && items.some((item) => item.kind === state.selectedKind) ? state.selectedKind : getOrderedKinds(items)[0] || ""
    } else {
      if (!matched.some((item) => item.skillCode === state.selectedSkillCode)) {
        state.selectedSkillCode = matched[0].skillCode
      }
      state.selectedKind = matched.find((item) => item.skillCode === state.selectedSkillCode)?.kind || matched[0].kind
    }
  } else {
    if (!items.some((item) => item.skillCode === state.selectedSkillCode)) {
      state.selectedSkillCode = items[0].skillCode
    }
    state.selectedKind = items.find((item) => item.skillCode === state.selectedSkillCode)?.kind || getOrderedKinds(items)[0] || ""
  }

  if (previousProfileId !== state.selectedProfileId) {
    state.detailProfile = null
  }
  if (previousSkillCode !== state.selectedSkillCode) {
    state.detailItem = null
  }
  if (!state.selectedSkillCode) {
    state.detailItem = null
  }
}

function renderWorkspace() {
  renderProfileRail()
  renderItemBrowserChrome()
  renderItemBrowser()
  renderReviewPane()
  renderEditorDrawer()
}

function renderSummary() {
  if (!state.payload) {
    summaryMetricsRoot.innerHTML = ""
    sourceMetaRoot.textContent = ""
    return
  }

  const counts = state.payload.summary?.countsByType || {}
  const cards = [
    { label: "Profiles", value: state.payload.summary?.total || 0 },
    { label: "Skill Items", value: state.payload.summary?.itemTotal || 0 },
    { label: "异常 Profile", value: state.payload.summary?.abnormalCount || 0 },
    { label: "Generic", value: counts.generic || 0 },
    { label: "Doc Type", value: counts.docType || 0 },
    { label: "Domain", value: counts.domain || 0 },
    { label: "Module", value: counts.module || 0 }
  ]

  summaryMetricsRoot.innerHTML = cards
    .map(
      (card) => `
        <div class="skill-summary-metric">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(String(card.value))}</strong>
        </div>
      `
    )
    .join("")

  sourceMetaRoot.textContent = `当前来源：${state.payload.activeSource?.skillDir || "-"} · manifest：${state.payload.activeSource?.manifestPath || "-"}`
}

function renderProfileRail() {
  const sections = getVisibleProfileSections()
  if (!sections.length) {
    profileRailRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>没有匹配的 Profile</h3>
          <p>试着放宽 layer 或搜索条件，重新定位要审阅的 skill profile。</p>
        </div>
      </div>
    `
    return
  }

  profileRailRoot.innerHTML = sections
    .map(
      ({ layer, profiles }) => `
        <section class="rail-layer">
          <div class="rail-layer-head">
            <div>
              <h3>${escapeHtml(layerLabel(layer))}</h3>
              <p>${escapeHtml(layerDescription(layer))}</p>
            </div>
            <span class="rail-layer-count">${profiles.length}</span>
          </div>
          <div class="rail-profile-list">
            ${profiles.map(renderProfileRailCard).join("")}
          </div>
        </section>
      `
    )
    .join("")
}

function renderItemBrowserChrome() {
  const profile = getSelectedProfileSummary()
  const detail = state.detailProfile

  if (!profile) {
    itemQueryInput.disabled = true
    itemBrowserChromeRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>先选一个 Profile</h3>
          <p>左侧 rail 用来定位 profile。选中后，中间区域会按 kind 分桶浏览 atomic skill。</p>
        </div>
      </div>
    `
    return
  }

  itemQueryInput.disabled = false
  const canDelete = detail?.capabilities?.canDelete ?? profile.type !== "generic"
  const deleteDisabledReason = detail?.capabilities?.deleteDisabledReason || (profile.type === "generic" ? "基础通用层暂不支持删除" : "")

  itemBrowserChromeRoot.innerHTML = `
    <div class="browser-hero">
      <div>
        <p class="browser-breadcrumb">${escapeHtml(layerLabel(profile.type))} / ${escapeHtml(profile.key)}</p>
        <h2>${escapeHtml(profile.displayName)}</h2>
        <p>${escapeHtml(profile.abnormal ? "当前 profile 存在 registry 与物化文件不一致的情况，建议先确认 Advanced 中的文件映射。" : "当前 profile 作为 skill 容器存在，真正的审阅对象是下面分桶展示的 atomic skill items。")}</p>
        <div class="browser-metrics">
          <span class="browser-metric-chip">${profile.metrics.itemCount} items</span>
          <span class="browser-metric-chip">${profile.metrics.fileCount} files</span>
          <span class="browser-metric-chip">${Object.keys(profile.metrics.kinds || {}).length} kinds</span>
          ${profile.abnormal ? '<span class="browser-metric-chip">异常映射</span>' : ""}
        </div>
        <div class="browser-path">
          <span class="code-chip">${escapeHtml(detail?.profile?.registryPath || `${profile.key}/skill-items.json`)}</span>
          ${detail?.profile?.documentTypeScope ? `<span class="code-chip">${escapeHtml(detail.profile.documentTypeScope)}</span>` : ""}
        </div>
      </div>
      <div class="browser-actions">
        <button type="button" data-open-editor="create">新增 Skill Item</button>
        <button type="button" class="secondary-button" data-materialize-registry="true">物化 Registry</button>
        <button type="button" class="secondary-button" data-reload-profile="true">重新加载</button>
        <button
          type="button"
          class="danger-button"
          data-delete-profile="${escapeHtml(getProfileId(profile))}"
          ${canDelete ? "" : "disabled"}
          title="${escapeHtml(deleteDisabledReason)}"
        >
          删除 Profile
        </button>
      </div>
    </div>
  `
}

function renderItemBrowser() {
  const profile = getSelectedProfileSummary()
  if (!profile) {
    itemBrowserRoot.innerHTML = ""
    return
  }

  const items = getSelectedProfileItems()
  if (!items.length) {
    itemBrowserRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>这个 Profile 还是空的</h3>
          <p>可以先创建第一条 atomic skill，再在右侧持续审阅和微调。</p>
          <div class="empty-action-row">
            <button type="button" data-open-editor="create">新增第一条 Skill Item</button>
          </div>
        </div>
      </div>
    `
    return
  }

  const orderedKinds = getOrderedKinds(items)
  const kindStrip = orderedKinds
    .map((kind) => renderKindChip(kind, items.filter((item) => item.kind === kind).length))
    .join("")

  if (state.itemQuery) {
    const matched = items.filter((item) => itemMatchesQuery(item, state.itemQuery))
    itemBrowserRoot.innerHTML = `
      <div class="search-result-head">
        <div>
          <h3>搜索结果</h3>
          <p class="review-section-copy">当前 profile 下匹配到 ${matched.length} 条 atomic skill。</p>
        </div>
        <button type="button" class="secondary-button" data-clear-item-query="true">清空搜索</button>
      </div>
      <div class="kind-strip">${kindStrip}</div>
      ${
        matched.length
          ? `<div class="kind-bucket-stack">${matched.map((item) => renderItemCard(item, { searchMode: true })).join("")}</div>`
          : `
            <div class="workspace-empty">
              <div>
                <h3>当前没有匹配项</h3>
                <p>可以换一个关键词，或者先清空搜索回到按 kind 审阅的模式。</p>
              </div>
            </div>
          `
      }
    `
    return
  }

  itemBrowserRoot.innerHTML = `
    <div class="kind-strip">${kindStrip}</div>
    <div class="kind-bucket-stack">
      ${orderedKinds
        .map((kind) => {
          const kindItems = items.filter((item) => item.kind === kind)
          return renderKindBucket(kind, kindItems)
        })
        .join("")}
    </div>
  `
}

function renderReviewPane() {
  const profile = getSelectedProfileSummary()
  const detailProfile = state.detailProfile
  const detailItem = state.detailItem

  if (!profile) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>右侧审阅区待命中</h3>
          <p>先从左侧选中一个 profile，再从中间选一条 atomic skill，右侧会始终保持在当前视口里给你看详情。</p>
        </div>
      </div>
    `
    return
  }

  if (!state.selectedSkillCode && state.itemQuery) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>当前搜索没有命中 item</h3>
          <p>中间区域已经切到搜索结果模式。你可以更换关键词，或者清空搜索回到 kind 审阅流。</p>
        </div>
      </div>
    `
    return
  }

  if (!state.selectedSkillCode && !getSelectedProfileItems().length) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>${escapeHtml(profile.displayName)}</h3>
          <p>当前 profile 还没有 atomic skill。建议先创建第一条，再用右侧作为固定审阅面板。</p>
          <div class="empty-action-row">
            <button type="button" data-open-editor="create">新增 Skill Item</button>
          </div>
        </div>
      </div>
    `
    return
  }

  if (!detailItem?.item) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>正在加载审阅内容</h3>
          <p>当前 item 已定位，右侧正在拉取更完整的内容、provenance 和邻近条目信息。</p>
        </div>
      </div>
    `
    return
  }

  const item = detailItem.item
  const siblings = detailItem.siblings || []
  const currentIndex = siblings.findIndex((entry) => entry.skillCode === item.skillCode)
  const canMoveUp = currentIndex > 0
  const canMoveDown = currentIndex >= 0 && currentIndex < siblings.length - 1

  reviewPaneRoot.innerHTML = `
    <div class="review-shell">
      <div class="review-head">
        <div>
          <p class="review-eyebrow">Atomic Skill Review</p>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.skillCode)} · ${escapeHtml(kindLabel(item.kind))} · ${escapeHtml(layerLabel(item.layer))} / ${escapeHtml(item.profileKey)}</p>
        </div>
        <div class="review-actions">
          <button type="button" data-open-editor="edit">编辑</button>
          <button type="button" class="secondary-button" data-copy-skill-code="${escapeHtml(item.skillCode)}">复制 Skill Code</button>
          <button type="button" class="secondary-button" data-reload-item="true">重新加载</button>
          <button type="button" class="secondary-button" data-reorder-item="up" ${canMoveUp ? "" : "disabled"}>上移</button>
          <button type="button" class="secondary-button" data-reorder-item="down" ${canMoveDown ? "" : "disabled"}>下移</button>
          <button type="button" class="danger-button" data-delete-item="${escapeHtml(item.skillCode)}">删除</button>
        </div>
      </div>

      <div class="review-meta-grid">
        <div class="review-meta-card"><span>Kind</span><strong>${escapeHtml(kindLabel(item.kind))}</strong></div>
        <div class="review-meta-card"><span>Status</span><strong>${escapeHtml(item.status || "active")}</strong></div>
        <div class="review-meta-card"><span>Order</span><strong>${escapeHtml(String(item.order || "-"))}</strong></div>
        <div class="review-meta-card"><span>Doc Type Scope</span><strong>${escapeHtml(item.documentTypeScope || detailProfile?.profile?.documentTypeScope || "-")}</strong></div>
        <div class="review-meta-card"><span>Created</span><strong>${escapeHtml(formatDate(item.createdAt))}</strong></div>
        <div class="review-meta-card"><span>Updated</span><strong>${escapeHtml(formatDate(item.updatedAt))}</strong></div>
      </div>

      <section class="review-section">
        <div class="review-section-head">
          <div>
            <h3>文本内容</h3>
            <p class="review-section-copy">优先阅读正文与意图，再决定是否进入抽屉编辑。</p>
          </div>
        </div>
        ${
          item.content
            ? `<pre class="reading-block">${escapeHtml(item.content)}</pre>`
            : `<div class="workspace-empty"><div><h3>当前没有纯文本内容</h3><p>这条 skill 主要通过 Structured Payload 承载结构化约束。</p></div></div>`
        }
      </section>

      <section class="review-section">
        <div class="review-section-head">
          <div>
            <h3>Structured Payload 摘要</h3>
            <p class="review-section-copy">这里只显示提炼后的关键字段，完整 JSON 放在 Advanced。</p>
          </div>
        </div>
        ${renderStructuredSummary(item.structuredPayload)}
      </section>

      <details class="advanced-panel">
        <summary>
          <span>Advanced</span>
          <span>${escapeHtml(detailProfile?.files?.length ? `${detailProfile.files.length} 个物化文件` : "展开查看 JSON / provenance / 文件映射")}</span>
        </summary>
        <div class="advanced-grid">
          <section class="advanced-card">
            <h3>Raw Item JSON</h3>
            <pre class="json-block">${escapeHtml(stringifyJson(item))}</pre>
          </section>
          <section class="advanced-card">
            <h3>Provenance</h3>
            <pre class="json-block">${escapeHtml(stringifyJson(item.provenance || {}))}</pre>
          </section>
          <section class="advanced-card">
            <h3>Materialized Files</h3>
            <div class="file-summary-list">
              ${(detailProfile?.files || []).length ? detailProfile.files.map(renderFileSummary).join("") : '<div class="workspace-empty"><div><p>当前没有可展示的物化文件。</p></div></div>'}
            </div>
          </section>
        </div>
      </details>
    </div>
  `
}

function renderEditorDrawer() {
  if (!state.isEditorOpen) {
    editorBackdrop.hidden = true
    editorBackdrop.classList.remove("is-open")
    editorDrawer.classList.remove("is-open")
    editorDrawer.setAttribute("aria-hidden", "true")
    editorDrawerBody.innerHTML = ""
    document.body.classList.remove("drawer-open")
    return
  }

  const profile = getSelectedProfileSummary()
  const item = state.editorMode === "edit" ? state.detailItem?.item : null
  const draft = {
    layer: item?.layer || profile?.type || "module",
    profileKey: item?.profileKey || profile?.key || "generic",
    kind: item?.kind || state.selectedKind || "writing_rule",
    title: item?.title || "",
    status: item?.status || "active",
    content: item?.content || "",
    structuredPayload: item?.structuredPayload ? stringifyJson(item.structuredPayload) : ""
  }

  editorBackdrop.hidden = false
  editorBackdrop.classList.add("is-open")
  editorDrawer.classList.add("is-open")
  editorDrawer.setAttribute("aria-hidden", "false")
  document.body.classList.add("drawer-open")

  editorDrawerBody.innerHTML = `
    <div class="editor-drawer-head">
      <div>
        <p class="review-eyebrow">${state.editorMode === "create" ? "Create" : "Edit"} Drawer</p>
        <h2>${escapeHtml(state.editorMode === "create" ? "新增 Skill Item" : `编辑 ${item?.title || "Skill Item"}`)}</h2>
        <p>${escapeHtml(state.editorMode === "create" ? "抽屉只负责修改，不打断主审阅画布。" : `当前正在编辑 ${item?.skillCode || ""}`)}</p>
      </div>
      <button type="button" class="secondary-button" data-close-editor="true">关闭</button>
    </div>

    <form id="skill-editor-form" class="editor-form">
      <div class="editor-form-body">
        <section class="editor-section">
          <h3>基础信息</h3>
          <p class="editor-section-copy">这里决定 item 归属在哪个 profile，以及它在 registry 里的基本身份。</p>
          <div class="form-grid-three">
            <label>
              Layer
              <select name="layer">${PROFILE_LAYER_ORDER.map((layer) => `<option value="${layer}" ${draft.layer === layer ? "selected" : ""}>${layer}</option>`).join("")}</select>
            </label>
            <label>
              Profile Key
              <input name="profileKey" value="${escapeHtml(draft.profileKey)}" />
            </label>
            <label>
              Kind
              <select name="kind">${kindOptions(draft.kind)}</select>
            </label>
          </div>
          <div class="form-grid-two">
            <label>
              Title
              <input name="title" value="${escapeHtml(draft.title)}" placeholder="例如：详细设计章节骨架" />
            </label>
            <label>
              Status
              <select name="status">
                ${["active", "draft", "deprecated"].map((status) => `<option value="${status}" ${draft.status === status ? "selected" : ""}>${status}</option>`).join("")}
              </select>
            </label>
          </div>
        </section>

        <section class="editor-section">
          <h3>内容</h3>
          <p class="editor-section-copy">文本型规则、写法提示或短说明优先放在这里。</p>
          <label>
            Content
            <textarea name="content" rows="8" placeholder="输入这条 skill 的正文内容。">${escapeHtml(draft.content)}</textarea>
          </label>
        </section>

        <section class="editor-section">
          <h3>Structured JSON</h3>
          <p class="editor-section-copy">结构化 payload 会被物化回 knowledge 类文件或作为更精确的原子约束使用。</p>
          <label>
            Structured Payload
            <textarea class="json-editor" name="structuredPayload" rows="12" placeholder='{"key":"value"}'>${escapeHtml(draft.structuredPayload)}</textarea>
          </label>
        </section>

        <section class="editor-section">
          <h3>高级信息</h3>
          <p class="editor-section-copy">这里保持只读，帮助你确认当前编辑对象的上下文与 provenance。</p>
          <div class="form-grid-two">
            <div class="editor-advanced-card">
              <strong>${escapeHtml(item?.skillCode || "新建后自动分配")}</strong>
              <p class="summary">${escapeHtml(item ? `创建于 ${formatDate(item.createdAt)}，最近更新于 ${formatDate(item.updatedAt)}` : "创建后会自动生成 skillCode，并按当前 profile 重新排位。")}</p>
            </div>
            <div class="editor-advanced-card">
              <strong>${escapeHtml(profile?.displayName || "未选中 Profile")}</strong>
              <p class="summary">${escapeHtml(profile ? `${layerLabel(profile.type)} / ${profile.key}` : "请先选中 profile 再创建新 item。")}</p>
            </div>
          </div>
          <div class="editor-advanced-card">
            <strong>Provenance</strong>
            <pre class="json-block">${escapeHtml(stringifyJson(item?.provenance || {}))}</pre>
          </div>
        </section>
      </div>

      <div class="editor-footer">
        <button type="submit">${state.editorMode === "create" ? "创建 Skill Item" : "保存 Skill Item"}</button>
        <button type="button" class="secondary-button" data-close-editor="true">取消</button>
      </div>
    </form>
  `
}

function renderProfileRailCard(profile) {
  const profileId = getProfileId(profile)
  return `
    <button type="button" class="profile-rail-card ${profileId === state.selectedProfileId ? "is-selected" : ""}" data-select-profile="${escapeHtml(profileId)}">
      <div class="profile-rail-card-head">
        <div>
          <span class="profile-rail-card-title">${escapeHtml(profile.displayName)}</span>
          <span class="profile-rail-card-key">${escapeHtml(profile.key)}</span>
        </div>
        <span class="mini-pill ${profile.abnormal ? "warning" : "subtle"}">${profile.abnormal ? "异常" : escapeHtml(profile.label)}</span>
      </div>
      <div class="profile-rail-meta">
        <span>${profile.metrics.itemCount} items</span>
        <span>${profile.metrics.fileCount} files</span>
        <span>${Object.keys(profile.metrics.kinds || {}).length} kinds</span>
      </div>
    </button>
  `
}

function renderKindChip(kind, count) {
  return `
    <button type="button" class="kind-chip ${state.selectedKind === kind && !state.itemQuery ? "is-active" : ""}" data-select-kind="${escapeHtml(kind)}">
      <span>${escapeHtml(kindLabel(kind))}</span>
      <span class="kind-chip-count">${count}</span>
    </button>
  `
}

function renderKindBucket(kind, items) {
  const isActive = state.selectedKind === kind
  return `
    <article class="kind-bucket ${isActive ? "is-active" : ""}">
      <button type="button" class="kind-bucket-head" data-select-kind="${escapeHtml(kind)}">
        <div>
          <h3>${escapeHtml(kindLabel(kind))}</h3>
          <p>${escapeHtml(kindDescription(kind))}</p>
        </div>
        <span class="kind-bucket-count">${items.length}</span>
      </button>
      ${
        isActive
          ? `<div class="kind-bucket-body">${items.map((item) => renderItemCard(item)).join("")}</div>`
          : `<div class="kind-bucket-note">点击进入这个 kind 桶，并将右侧审阅面板对准其中第一条 atomic skill。</div>`
      }
    </article>
  `
}

function renderItemCard(item, options = {}) {
  return `
    <button type="button" class="item-card ${state.selectedSkillCode === item.skillCode ? "is-selected" : ""}" data-select-item="${escapeHtml(item.skillCode)}">
      <div class="item-card-top">
        <div>
          <span class="item-card-code">${escapeHtml(item.skillCode)}</span>
          <span class="item-card-title">${escapeHtml(item.title)}</span>
        </div>
        <span class="mini-pill subtle">${escapeHtml(options.searchMode ? kindLabel(item.kind) : item.status || "active")}</span>
      </div>
      <p class="item-card-preview">${escapeHtml(buildPreview(item))}</p>
      <div class="item-card-meta">
        <span>${escapeHtml(kindLabel(item.kind))}</span>
        <span>order ${escapeHtml(String(item.order || "-"))}</span>
        ${item.status && item.status !== "active" ? `<span>${escapeHtml(item.status)}</span>` : ""}
      </div>
    </button>
  `
}

function renderStructuredSummary(payload) {
  const entries = structuredEntries(payload)
  if (!entries.length) {
    return `
      <div class="workspace-empty">
        <div>
          <h3>没有结构化字段</h3>
          <p>这条 skill 主要依赖正文内容表达约束，完整 item JSON 可以在 Advanced 中查看。</p>
        </div>
      </div>
    `
  }

  return `
    <div class="structured-summary-grid">
      ${entries
        .slice(0, 8)
        .map(
          ([key, value]) => `
            <article class="structured-summary-card">
              <span>${escapeHtml(key)}</span>
              <strong>${escapeHtml(summarizeValue(value, 120))}</strong>
            </article>
          `
        )
        .join("")}
    </div>
    ${entries.length > 8 ? `<p class="summary">还有 ${entries.length - 8} 个字段已折叠，完整 JSON 见 Advanced。</p>` : ""}
  `
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
        <span class="code-chip">${escapeHtml(String(entry.size || 0))} B</span>
        <span class="code-chip">${escapeHtml(entry.absolutePath)}</span>
      </div>
    </article>
  `
}

async function materializeRegistry() {
  try {
    setPageStatus("正在物化 skill registry...")
    await request("/api/skill-registry/materialize", { method: "POST" })
    await refreshAll(false)
    setPageStatus("skill registry 已物化，Markdown 与 domain-knowledge.json 已同步。")
  } catch (error) {
    setPageStatus(`物化失败：${error.message}`, true)
  }
}

function openEditor(mode = "edit") {
  if (mode === "edit" && !state.detailItem?.item) return
  if (mode === "create" && !getSelectedProfileSummary()) return
  state.editorMode = mode === "create" ? "create" : "edit"
  state.isEditorOpen = true
  renderEditorDrawer()
}

function closeEditor(render = true) {
  state.isEditorOpen = false
  if (render) {
    renderEditorDrawer()
  }
}

function ensureProfileVisible(layer, profileKey) {
  if (state.railFilters.layer !== "all" && state.railFilters.layer !== layer) {
    state.railFilters.layer = layer
    profileLayerFilter.value = layer
  }

  const normalizedQuery = state.railFilters.query.toLowerCase()
  if (normalizedQuery && !`${profileKey} ${layer}`.toLowerCase().includes(normalizedQuery)) {
    state.railFilters.query = ""
    profileQueryInput.value = ""
  }
}

function getVisibleProfileSections() {
  if (!state.payload?.groups) return []

  return PROFILE_LAYER_ORDER.map((layer) => ({
    layer,
    profiles: (state.payload.groups[layer] || []).filter(profileMatches)
  })).filter((section) => section.profiles.length)
}

function getVisibleProfilesFlat() {
  return getVisibleProfileSections().flatMap((section) => section.profiles)
}

function listProfiles() {
  if (!state.payload?.groups) return []
  return PROFILE_LAYER_ORDER.flatMap((layer) => state.payload.groups[layer] || [])
}

function getSelectedProfileSummary() {
  return listProfiles().find((profile) => getProfileId(profile) === state.selectedProfileId) || null
}

function getSelectedProfileItems() {
  const profile = getSelectedProfileSummary()
  return sortItems(profile?.items || [])
}

function getOrderedKinds(items) {
  const kinds = [...new Set(items.map((item) => item.kind).filter(Boolean))]
  return kinds.sort((left, right) => {
    const leftIndex = KIND_ORDER.indexOf(left)
    const rightIndex = KIND_ORDER.indexOf(right)
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
    if (leftIndex >= 0) return -1
    if (rightIndex >= 0) return 1
    return left.localeCompare(right, "zh-CN")
  })
}

function profileMatches(profile) {
  if (state.railFilters.layer !== "all" && profile.type !== state.railFilters.layer) return false
  if (!state.railFilters.query) return true
  const haystack = `${profile.displayName} ${profile.key} ${profile.label} ${profile.documentTypeScope || ""}`.toLowerCase()
  return haystack.includes(state.railFilters.query.toLowerCase())
}

function itemMatchesQuery(item, query) {
  const normalized = String(query || "").trim().toLowerCase()
  if (!normalized) return true
  const haystack = `${item.skillCode} ${item.title} ${item.kind} ${item.status || ""} ${item.content || ""} ${JSON.stringify(item.structuredPayload || {})}`.toLowerCase()
  return haystack.includes(normalized)
}

function selectionStamp() {
  return `${state.selectedProfileId}::${state.selectedSkillCode}`
}

function getProfileId(profile) {
  return `${profile.type}:${profile.key}`
}

function sortItems(items = []) {
  return [...items].sort((left, right) => {
    const orderGap = Number(left.order || 0) - Number(right.order || 0)
    if (orderGap !== 0) return orderGap
    return String(left.skillCode || "").localeCompare(String(right.skillCode || ""), "zh-CN")
  })
}

function buildPreview(item) {
  const base = String(item.preview || item.content || JSON.stringify(item.structuredPayload || {}))
    .replace(/\s+/g, " ")
    .trim()
  if (!base) return "暂无内容预览。"
  return base.length > 112 ? `${base.slice(0, 112)}...` : base
}

function structuredEntries(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload.map((value, index) => [String(index), value])
  }
  if (typeof payload === "object") {
    return Object.entries(payload)
  }
  return [["value", payload]]
}

function summarizeValue(value, maxLength = 90) {
  const normalized =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join(", ")
        : value && typeof value === "object"
          ? JSON.stringify(value)
          : String(value ?? "")

  const compact = normalized.replace(/\s+/g, " ").trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact || "-"
}

function kindOptions(selected = "") {
  return KIND_ORDER.map((kind) => `<option value="${kind}" ${selected === kind ? "selected" : ""}>${kind}</option>`).join("")
}

function layerLabel(layer = "") {
  if (layer === "docType") return "Doc Type / 文档类型层"
  if (layer === "domain") return "Domain / 领域层"
  if (layer === "module") return "Module / 模块层"
  return "Generic / 通用基础层"
}

function layerDescription(layer = "") {
  if (layer === "docType") return "强调文档体裁和输出结构。"
  if (layer === "domain") return "沉淀领域共享规则和对象。"
  if (layer === "module") return "保留模块专属骨架、few-shot 和反例。"
  return "跨模块、跨文档都成立的通用基础层。"
}

function kindLabel(kind = "") {
  return KIND_LABELS[kind] ? `${kind} / ${KIND_LABELS[kind]}` : kind
}

function kindDescription(kind = "") {
  if (kind === "writing_rule") return "主导正文写法与结构，通常是最需要高频审阅的桶。"
  if (kind === "extraction_rule") return "决定从源材料里优先抽哪些信息。"
  if (kind === "validation_rule") return "约束生成结果是否合格、缺什么。"
  if (kind === "good_example") return "提供高质量 few-shot，帮助模型贴近人工表达。"
  if (kind === "bad_example") return "明确不能复现的坏写法或错误倾向。"
  if (kind === "generation_priority") return "决定主题和章节生成时的优先顺序。"
  if (kind === "rule_hint") return "更轻量的高层提示，用于补语气和组织方式。"
  if (kind === "anti_pattern") return "列出必须避免的反模式和误写。"
  return "结构化知识型 item，适合配合 Advanced 一起看。"
}

function stringifyJson(value) {
  return JSON.stringify(value ?? {}, null, 2)
}

function parseJsonField(value = "") {
  const trimmed = String(value || "").trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch (_error) {
    throw new Error("Structured Payload 不是合法 JSON")
  }
}

function formatDate(value = "") {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN")
}

function setPageStatus(message, isError = false) {
  pageStatusRoot.textContent = message || ""
  pageStatusRoot.classList.toggle("is-error", Boolean(isError))
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const tempInput = document.createElement("textarea")
  tempInput.value = text
  document.body.append(tempInput)
  tempInput.select()
  document.execCommand("copy")
  tempInput.remove()
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Request failed")
  }
  return payload
}

function buildLoadFailureMessage(error) {
  const message = error?.message || "Request failed"
  if (message === "Failed to fetch") {
    return "加载失败：无法连接到技能管理接口。请确认当前页面是通过 http://127.0.0.1:3000/skill-management 打开的，并且本地服务仍在运行。"
  }
  return `加载失败：${message}`
}
