import { PROFILE_LAYER_ORDER, KIND_ORDER, getAllowedKindsByLayer, isKindAllowedForLayer } from "/skill-kind-matrix.js"

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

const TEXT_TRUTH_KINDS = new Set([
  "source_alias",
  "normalization_rule",
  "source_policy_setting",
  "forbidden_expansion",
  "document_blueprint_section",
  "document_blueprint_policy",
  "rule_hint"
])

const pageQuery = new URLSearchParams(window.location.search)

const state = {
  payload: null,
  bundlePayload: null,
  detailProfile: null,
  detailItem: null,
  view: ["work-orders", "skill-versions"].includes(pageQuery.get("view")) ? pageQuery.get("view") : "registry",
  selectedProfileId: "",
  selectedSkillCode: "",
  selectedKind: "",
  isItemSelectionCollapsed: false,
  itemQuery: "",
  workOrders: [],
  workOrderDetail: null,
  selectedWorkOrderId: pageQuery.get("workOrderId") || "",
  selectedBundleId: pageQuery.get("bundleId") || "",
  isEditorOpen: false,
  editorMode: "edit",
  railFilters: {
    query: "",
    layer: "all"
  },
  workOrderFilters: {
    status: "",
    documentType: ""
  }
}

const refreshButton = document.querySelector("#refresh-button")
const pageStatusRoot = document.querySelector("#page-status")
const registryViewTab = document.querySelector("#registry-view-tab")
const workOrderViewTab = document.querySelector("#work-order-view-tab")
const skillVersionViewTab = document.querySelector("#skill-version-view-tab")
const registryViewRoot = document.querySelector("#registry-view")
const workOrderViewRoot = document.querySelector("#work-order-view")
const skillVersionViewRoot = document.querySelector("#skill-version-view")
const summaryMetricsRoot = document.querySelector("#summary-metrics")
const sourceMetaRoot = document.querySelector("#source-meta")
const skillWorkspaceRoot = document.querySelector(".skill-workspace")
const profileQueryInput = document.querySelector("#profile-query")
const profileLayerFilter = document.querySelector("#profile-layer-filter")
const profileRailRoot = document.querySelector("#profile-rail")
const itemBrowserChromeRoot = document.querySelector("#item-browser-chrome")
const itemQueryInput = document.querySelector("#item-query")
const itemBrowserRoot = document.querySelector("#item-browser")
const reviewPaneShell = document.querySelector(".review-pane-shell")
const reviewPaneRoot = document.querySelector("#review-pane")
const workspaceReviewResizer = document.querySelector("#workspace-review-resizer")
const editorBackdrop = document.querySelector("#editor-backdrop")
const editorDrawer = document.querySelector("#editor-drawer")
const editorDrawerBody = document.querySelector("#editor-drawer-body")
const workOrderSummaryRoot = document.querySelector("#work-order-summary")
const workOrderStatusFilter = document.querySelector("#work-order-status-filter")
const workOrderDocumentFilter = document.querySelector("#work-order-document-filter")
const workOrderListRoot = document.querySelector("#work-order-list")
const workOrderDetailRoot = document.querySelector("#work-order-detail")
const skillVersionSummaryRoot = document.querySelector("#skill-version-summary")
const skillVersionListRoot = document.querySelector("#skill-version-list")
const skillVersionDetailRoot = document.querySelector("#skill-version-detail")
const REVIEW_LAYOUT_BREAKPOINT = window.matchMedia("(max-width: 1180px)")
const REVIEW_WIDTH_STORAGE_KEY = "skill-management:review-width"

const reviewResizeState = {
  active: false,
  pointerId: null,
  width: null
}

initializeWorkspaceResizer()
await bootstrap()

refreshButton.addEventListener("click", () => refreshAll(true))
registryViewTab?.addEventListener("click", () => setView("registry"))
workOrderViewTab?.addEventListener("click", () => setView("work-orders"))
skillVersionViewTab?.addEventListener("click", () => setView("skill-versions"))
profileQueryInput.addEventListener("input", handleRailFilterChange)
profileLayerFilter.addEventListener("change", handleRailFilterChange)
profileRailRoot.addEventListener("click", handleRailClick)
itemQueryInput.addEventListener("input", handleItemQueryChange)
itemBrowserChromeRoot.addEventListener("click", handleBrowserClick)
itemBrowserRoot.addEventListener("click", handleBrowserClick)
reviewPaneRoot.addEventListener("click", handleReviewClick)
workOrderStatusFilter?.addEventListener("change", handleWorkOrderFilterChange)
workOrderDocumentFilter?.addEventListener("input", handleWorkOrderFilterChange)
workOrderListRoot?.addEventListener("click", handleWorkOrderListClick)
workOrderDetailRoot?.addEventListener("click", handleWorkOrderDetailClick)
workOrderDetailRoot?.addEventListener("submit", handleWorkOrderDetailSubmit)
skillVersionListRoot?.addEventListener("click", handleSkillVersionListClick)
skillVersionDetailRoot?.addEventListener("click", handleSkillVersionDetailClick)
editorBackdrop.addEventListener("click", () => closeEditor())
editorDrawerBody.addEventListener("click", handleDrawerClick)
editorDrawerBody.addEventListener("change", handleDrawerChange)
editorDrawerBody.addEventListener("submit", handleEditorSubmit)
document.addEventListener("keydown", handleGlobalKeydown)

function initializeWorkspaceResizer() {
  if (!skillWorkspaceRoot || !workspaceReviewResizer || !reviewPaneShell) return

  syncWorkspaceResizer()
  workspaceReviewResizer.addEventListener("pointerdown", handleWorkspaceResizerPointerDown)
  workspaceReviewResizer.addEventListener("dblclick", resetWorkspaceReviewWidth)
  workspaceReviewResizer.addEventListener("keydown", handleWorkspaceResizerKeydown)
  window.addEventListener("resize", handleWorkspaceResize)

  if (typeof REVIEW_LAYOUT_BREAKPOINT.addEventListener === "function") {
    REVIEW_LAYOUT_BREAKPOINT.addEventListener("change", syncWorkspaceResizer)
  } else if (typeof REVIEW_LAYOUT_BREAKPOINT.addListener === "function") {
    REVIEW_LAYOUT_BREAKPOINT.addListener(syncWorkspaceResizer)
  }
}

function handleWorkspaceResize() {
  if (reviewResizeState.active) return
  syncWorkspaceResizer()
}

function syncWorkspaceResizer() {
  if (!skillWorkspaceRoot || !workspaceReviewResizer || !reviewPaneShell) return

  if (isCompactReviewLayout()) {
    skillWorkspaceRoot.style.removeProperty("--review-width")
    workspaceReviewResizer.tabIndex = -1
    workspaceReviewResizer.setAttribute("aria-hidden", "true")
    workspaceReviewResizer.removeAttribute("aria-valuenow")
    return
  }

  workspaceReviewResizer.tabIndex = 0
  workspaceReviewResizer.removeAttribute("aria-hidden")

  const storedWidth = readStoredReviewWidth()
  const width = clampReviewWidth(storedWidth ?? getCurrentReviewWidth())
  applyWorkspaceReviewWidth(width, { persist: false })
}

function isCompactReviewLayout() {
  return REVIEW_LAYOUT_BREAKPOINT.matches
}

function getReviewWidthBounds() {
  if (!skillWorkspaceRoot) {
    return { min: 320, max: 760 }
  }

  const workspaceWidth = skillWorkspaceRoot.getBoundingClientRect().width || window.innerWidth
  const railWidth = document.querySelector(".profile-rail-pane")?.getBoundingClientRect().width || 300
  const splitterWidth = workspaceReviewResizer?.getBoundingClientRect().width || 14
  const minReview = 320
  const hardMax = 760
  const browserMin = workspaceWidth <= 1440 ? 360 : 420
  const availableMax = Math.max(minReview, workspaceWidth - railWidth - splitterWidth - browserMin)
  return {
    min: minReview,
    max: Math.max(minReview, Math.min(hardMax, availableMax))
  }
}

function clampReviewWidth(width) {
  const { min, max } = getReviewWidthBounds()
  const value = Number(width)
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function getCurrentReviewWidth() {
  return reviewPaneShell?.getBoundingClientRect().width || 360
}

function calculateReviewWidth(clientX) {
  const rect = skillWorkspaceRoot?.getBoundingClientRect()
  if (!rect) return getCurrentReviewWidth()
  return rect.right - clientX
}

function applyWorkspaceReviewWidth(width, { persist = true } = {}) {
  if (!skillWorkspaceRoot || !workspaceReviewResizer || isCompactReviewLayout()) return

  const nextWidth = Math.round(clampReviewWidth(width))
  skillWorkspaceRoot.style.setProperty("--review-width", `${nextWidth}px`)
  workspaceReviewResizer.setAttribute("role", "separator")
  workspaceReviewResizer.setAttribute("aria-valuemin", String(getReviewWidthBounds().min))
  workspaceReviewResizer.setAttribute("aria-valuemax", String(getReviewWidthBounds().max))
  workspaceReviewResizer.setAttribute("aria-valuenow", String(nextWidth))

  if (persist) {
    writeStoredReviewWidth(nextWidth)
  }
}

function handleWorkspaceResizerPointerDown(event) {
  if (isCompactReviewLayout() || event.button !== 0) return

  reviewResizeState.active = true
  reviewResizeState.pointerId = event.pointerId
  reviewResizeState.width = clampReviewWidth(calculateReviewWidth(event.clientX))
  skillWorkspaceRoot.classList.add("is-review-resizing")
  workspaceReviewResizer.setPointerCapture(event.pointerId)
  applyWorkspaceReviewWidth(reviewResizeState.width, { persist: false })
  workspaceReviewResizer.addEventListener("pointermove", handleWorkspaceResizerPointerMove)
  workspaceReviewResizer.addEventListener("pointerup", handleWorkspaceResizerPointerUp)
  workspaceReviewResizer.addEventListener("pointercancel", handleWorkspaceResizerPointerUp)
  event.preventDefault()
}

function handleWorkspaceResizerPointerMove(event) {
  if (!reviewResizeState.active) return
  reviewResizeState.width = clampReviewWidth(calculateReviewWidth(event.clientX))
  applyWorkspaceReviewWidth(reviewResizeState.width, { persist: false })
}

function handleWorkspaceResizerPointerUp(event) {
  if (!reviewResizeState.active) return

  if (workspaceReviewResizer.hasPointerCapture(reviewResizeState.pointerId)) {
    workspaceReviewResizer.releasePointerCapture(reviewResizeState.pointerId)
  }

  workspaceReviewResizer.removeEventListener("pointermove", handleWorkspaceResizerPointerMove)
  workspaceReviewResizer.removeEventListener("pointerup", handleWorkspaceResizerPointerUp)
  workspaceReviewResizer.removeEventListener("pointercancel", handleWorkspaceResizerPointerUp)
  skillWorkspaceRoot.classList.remove("is-review-resizing")

  const width = clampReviewWidth(reviewResizeState.width ?? calculateReviewWidth(event.clientX))
  applyWorkspaceReviewWidth(width)

  reviewResizeState.active = false
  reviewResizeState.pointerId = null
  reviewResizeState.width = null
}

function handleWorkspaceResizerKeydown(event) {
  if (isCompactReviewLayout()) return

  const currentWidth = clampReviewWidth(getCurrentReviewWidth())
  const step = event.shiftKey ? 48 : 24

  if (event.key === "ArrowLeft") {
    applyWorkspaceReviewWidth(currentWidth + step)
    event.preventDefault()
    return
  }

  if (event.key === "ArrowRight") {
    applyWorkspaceReviewWidth(currentWidth - step)
    event.preventDefault()
    return
  }

  if (event.key === "Home") {
    applyWorkspaceReviewWidth(getReviewWidthBounds().min)
    event.preventDefault()
    return
  }

  if (event.key === "End") {
    applyWorkspaceReviewWidth(getReviewWidthBounds().max)
    event.preventDefault()
    return
  }

  if (event.key === "Enter" || event.key === " ") {
    resetWorkspaceReviewWidth()
    event.preventDefault()
  }
}

function resetWorkspaceReviewWidth() {
  clearStoredReviewWidth()
  skillWorkspaceRoot?.style.removeProperty("--review-width")
  syncWorkspaceResizer()
}

function readStoredReviewWidth() {
  try {
    const raw = window.localStorage.getItem(REVIEW_WIDTH_STORAGE_KEY)
    if (!raw) return null
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function writeStoredReviewWidth(width) {
  try {
    window.localStorage.setItem(REVIEW_WIDTH_STORAGE_KEY, String(Math.round(width)))
  } catch {}
}

function clearStoredReviewWidth() {
  try {
    window.localStorage.removeItem(REVIEW_WIDTH_STORAGE_KEY)
  } catch {}
}

async function bootstrap() {
  syncView()
  await refreshAll(false)
}

async function refreshAll(showHint = false) {
  try {
    if (showHint) {
      setPageStatus(formatRefreshStatus("loading"))
    }
    state.payload = await request("/api/skill-management")
    state.bundlePayload = await request("/api/skill-bundles")
    state.workOrders = await request(buildWorkOrderListUrl()).then((payload) => payload.workOrders || [])
    syncSelection()
    syncWorkOrderSelection()
    syncBundleSelection()
    renderSummary()
    renderWorkspace()
    renderWorkOrderWorkspace()
    renderSkillVersionWorkspace()
    if (state.view === "registry") {
      await loadSelection()
    } else if (state.view === "work-orders") {
      await loadWorkOrderSelection()
    }
    if (showHint) {
      setPageStatus(formatRefreshStatus("done"))
    }
  } catch (error) {
    setPageStatus(buildLoadFailureMessage(error), true)
    state.detailProfile = null
    state.detailItem = null
    state.workOrderDetail = null
    renderWorkspace()
    renderWorkOrderWorkspace()
    renderSkillVersionWorkspace()
  }
}

function formatRefreshStatus(phase = "loading") {
  const loading = phase === "loading"
  if (state.view === "work-orders") return loading ? "正在刷新技能工单..." : "技能工单已刷新。"
  if (state.view === "skill-versions") return loading ? "正在刷新技能版本..." : "技能版本已刷新。"
  return loading ? "正在刷新 skill registry..." : "skill registry 已刷新。"
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
  state.isItemSelectionCollapsed = false
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
    const isOpenKind = !state.itemQuery && (kindButton.classList.contains("is-active") || Boolean(kindButton.closest(".kind-bucket.is-active")))
    if (isOpenKind) {
      state.selectedKind = ""
      state.selectedSkillCode = ""
      state.isItemSelectionCollapsed = true
      state.detailItem = null
      renderWorkspace()
      return
    }

    state.itemQuery = ""
    itemQueryInput.value = ""
    state.selectedKind = kind
    state.selectedSkillCode = items[0].skillCode
    state.isItemSelectionCollapsed = false
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
    state.selectedKind = selectedItem.kind
    const isOpenItem = state.selectedSkillCode === nextSkillCode || itemButton.classList.contains("is-selected")
    if (isOpenItem) {
      state.selectedSkillCode = ""
      state.isItemSelectionCollapsed = true
      state.detailItem = null
      renderWorkspace()
      return
    }

    state.selectedSkillCode = nextSkillCode
    state.isItemSelectionCollapsed = false
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
    setPageStatus("当前技能条目已重新加载。")
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
    const confirmed = window.confirm(`确认删除 ${skillCode} 吗？这会删除该技能条目。`)
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

function handleDrawerChange(event) {
  if (!(event.target instanceof HTMLSelectElement)) return
  if (event.target.name !== "layer") return

  syncEditorKindSelection(event.target.form)
}

function syncEditorKindSelection(form) {
  if (!form) return
  const layerSelect = form.elements.namedItem("layer")
  const kindSelect = form.elements.namedItem("kind")
  const kindHint = form.querySelector("[data-kind-hint]")
  if (!(layerSelect instanceof HTMLSelectElement) || !(kindSelect instanceof HTMLSelectElement)) return

  const nextLayer = layerSelect.value || "module"
  const currentKind = kindSelect.value || ""
  const nextKinds = getAllowedKindsByLayer(nextLayer)
  const fallbackKind = nextKinds[0] || ""

  kindSelect.innerHTML = kindOptions(nextLayer, currentKind)
  if (!isKindAllowedForLayer(nextLayer, currentKind)) {
    kindSelect.value = fallbackKind
  }

  if (kindHint) {
    kindHint.textContent = nextKinds.length
      ? `当前 ${nextLayer} 层允许：${nextKinds.join(" / ")}`
      : "当前层没有可用 kind。"
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
    title: form.elements.namedItem("title")?.value?.trim() || "技能条目",
    status: form.elements.namedItem("status")?.value || "active",
    content: form.elements.namedItem("content")?.value || ""
  }

  try {
    const structuredPayload = parseJsonField(form.elements.namedItem("structuredPayload")?.value || "")
    if (structuredPayload !== null && !isTextTruthKind(payload.kind)) {
      payload.structuredPayload = structuredPayload
    }

    setPageStatus(state.editorMode === "create" ? "正在创建技能条目..." : "正在保存技能条目...")

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

async function handleWorkOrderFilterChange() {
  state.workOrderFilters.status = workOrderStatusFilter?.value || ""
  state.workOrderFilters.documentType = workOrderDocumentFilter?.value?.trim() || ""
  syncWorkOrderSelection()
  renderWorkOrderWorkspace()
  if (state.view === "work-orders") {
    await loadWorkOrderSelection()
  }
}

async function handleWorkOrderListClick(event) {
  const button = event.target.closest("[data-work-order-open]")
  if (!button) return
  state.selectedWorkOrderId = String(button.dataset.workOrderOpen || "")
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set("view", "work-orders")
  nextUrl.searchParams.set("workOrderId", state.selectedWorkOrderId)
  window.history.replaceState({}, "", nextUrl)
  renderWorkOrderWorkspace()
  await loadWorkOrderSelection()
}

async function handleWorkOrderDetailClick(event) {
  const closeButton = event.target.closest("[data-work-order-close]")
  if (closeButton) {
    try {
      await request(`/api/skill-work-orders/${encodeURIComponent(closeButton.dataset.workOrderClose)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closedBy: "web-ui" })
      })
      await refreshAll(false)
      setPageStatus("技能工单已关闭。")
    } catch (error) {
      setPageStatus(`关闭工单失败：${error.message}`, true)
    }
    return
  }

  const jumpSkillButton = event.target.closest("[data-work-order-jump-skill]")
  if (jumpSkillButton) {
    await jumpToSkill(jumpSkillButton.dataset.workOrderJumpSkill)
    return
  }

  const acceptButton = event.target.closest("[data-work-order-accept]")
  if (acceptButton) {
    await submitWorkOrderItemAction(acceptButton.dataset.workOrderAccept, "accepted", false, event.target)
    return
  }

  const editApplyButton = event.target.closest("[data-work-order-edit-apply]")
  if (editApplyButton) {
    await submitWorkOrderItemAction(editApplyButton.dataset.workOrderEditApply, "edited", true, event.target)
    return
  }

  const rejectButton = event.target.closest("[data-work-order-reject]")
  if (rejectButton) {
    try {
      await request(`/api/skill-work-orders/${encodeURIComponent(state.selectedWorkOrderId)}/items/${encodeURIComponent(rejectButton.dataset.workOrderReject)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: "rejected",
          reviewComment: "web-ui rejected"
        })
      })
      await refreshAll(false)
      setPageStatus("修改项已拒绝。")
    } catch (error) {
      setPageStatus(`拒绝修改项失败：${error.message}`, true)
    }
  }
}

async function handleWorkOrderDetailSubmit(event) {
  event.preventDefault()
}

async function handleSkillVersionListClick(event) {
  const button = event.target.closest("[data-select-bundle]")
  if (!button) return
  state.selectedBundleId = button.dataset.selectBundle || ""
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set("view", "skill-versions")
  if (state.selectedBundleId) {
    nextUrl.searchParams.set("bundleId", state.selectedBundleId)
  }
  window.history.replaceState({}, "", nextUrl)
  renderSkillVersionWorkspace()
}

async function handleSkillVersionDetailClick(event) {
  const releaseButton = event.target.closest("[data-bundle-release]")
  if (releaseButton) {
    await submitBundleAction(releaseButton.dataset.bundleRelease, "release")
    return
  }
  const rollbackButton = event.target.closest("[data-bundle-rollback]")
  if (rollbackButton) {
    await submitBundleAction(rollbackButton.dataset.bundleRollback, "rollback")
    return
  }
  const forkButton = event.target.closest("[data-bundle-fork]")
  if (forkButton) {
    await submitBundleAction(forkButton.dataset.bundleFork, "fork")
  }
}

async function submitBundleAction(bundleId, action) {
  if (!bundleId || !action) return
  const endpointByAction = {
    release: `/api/skill-bundles/${encodeURIComponent(bundleId)}/release`,
    rollback: `/api/skill-bundles/${encodeURIComponent(bundleId)}/rollback`,
    fork: `/api/skill-bundles/${encodeURIComponent(bundleId)}/fork`
  }
  try {
    const result = await request(endpointByAction[action], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releasedBy: "web-ui", createdBy: "web-ui", reason: "web-ui rollback" })
    })
    if (result?.id) {
      state.selectedBundleId = result.id
    }
    await refreshAll(false)
    setPageStatus(action === "release" ? "候选技能版本已发布。" : action === "rollback" ? "已回滚到选定技能版本。" : "已 fork 出新的候选技能版本。")
  } catch (error) {
    setPageStatus(`技能版本操作失败：${error.message}`, true)
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
    setPageStatus(`加载技能条目详情失败：${error.message}`, true)
  }

  renderWorkspace()
}

async function loadWorkOrderSelection() {
  if (!state.selectedWorkOrderId) {
    state.workOrderDetail = null
    renderWorkOrderWorkspace()
    return
  }

  try {
    state.workOrderDetail = await request(`/api/skill-work-orders/${encodeURIComponent(state.selectedWorkOrderId)}`)
  } catch (error) {
    state.workOrderDetail = null
    setPageStatus(`加载技能工单失败：${error.message}`, true)
  }

  renderWorkOrderWorkspace()
}

function syncSelection() {
  const previousProfileId = state.selectedProfileId
  const previousSkillCode = state.selectedSkillCode
  const visibleProfiles = getVisibleProfilesFlat()

  if (!visibleProfiles.length) {
    state.selectedProfileId = ""
    state.selectedSkillCode = ""
    state.selectedKind = ""
    state.isItemSelectionCollapsed = false
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
    state.isItemSelectionCollapsed = false
  } else if (state.itemQuery) {
    const matched = items.filter((item) => itemMatchesQuery(item, state.itemQuery))
    if (!matched.length) {
      state.selectedSkillCode = ""
      state.selectedKind = state.selectedKind && items.some((item) => item.kind === state.selectedKind) ? state.selectedKind : getOrderedKinds(items)[0] || ""
    } else {
      if (state.isItemSelectionCollapsed) {
        state.selectedSkillCode = ""
        state.selectedKind = state.selectedKind && matched.some((item) => item.kind === state.selectedKind) ? state.selectedKind : matched[0].kind
      } else if (!matched.some((item) => item.skillCode === state.selectedSkillCode)) {
        state.selectedSkillCode = matched[0].skillCode
      }
      state.selectedKind = matched.find((item) => item.skillCode === state.selectedSkillCode)?.kind || matched[0].kind
    }
  } else {
    if (state.isItemSelectionCollapsed) {
      state.selectedSkillCode = ""
      state.selectedKind = state.selectedKind && items.some((item) => item.kind === state.selectedKind) ? state.selectedKind : ""
    } else if (!items.some((item) => item.skillCode === state.selectedSkillCode)) {
      state.selectedSkillCode = items[0].skillCode
      state.selectedKind = items[0].kind
    } else {
      state.selectedKind = items.find((item) => item.skillCode === state.selectedSkillCode)?.kind || getOrderedKinds(items)[0] || ""
    }
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

function syncView() {
  const isRegistry = state.view === "registry"
  const isWorkOrders = state.view === "work-orders"
  const isSkillVersions = state.view === "skill-versions"
  registryViewRoot.hidden = !isRegistry
  workOrderViewRoot.hidden = !isWorkOrders
  skillVersionViewRoot.hidden = !isSkillVersions
  registryViewTab?.classList.toggle("is-active", isRegistry)
  workOrderViewTab?.classList.toggle("is-active", isWorkOrders)
  skillVersionViewTab?.classList.toggle("is-active", isSkillVersions)
  registryViewTab?.setAttribute("aria-selected", isRegistry ? "true" : "false")
  workOrderViewTab?.setAttribute("aria-selected", isWorkOrders ? "true" : "false")
  skillVersionViewTab?.setAttribute("aria-selected", isSkillVersions ? "true" : "false")
}

function setView(nextView) {
  state.view = ["work-orders", "skill-versions"].includes(nextView) ? nextView : "registry"
  const nextUrl = new URL(window.location.href)
  if (state.view === "work-orders") {
    nextUrl.searchParams.set("view", "work-orders")
    if (state.selectedWorkOrderId) {
      nextUrl.searchParams.set("workOrderId", state.selectedWorkOrderId)
    }
    nextUrl.searchParams.delete("bundleId")
  } else if (state.view === "skill-versions") {
    nextUrl.searchParams.set("view", "skill-versions")
    if (state.selectedBundleId) {
      nextUrl.searchParams.set("bundleId", state.selectedBundleId)
    }
    nextUrl.searchParams.delete("workOrderId")
  } else {
    nextUrl.searchParams.delete("view")
    nextUrl.searchParams.delete("workOrderId")
    nextUrl.searchParams.delete("bundleId")
  }
  window.history.replaceState({}, "", nextUrl)
  syncView()
  renderWorkspace()
  renderWorkOrderWorkspace()
  renderSkillVersionWorkspace()
  if (state.view === "registry") {
    loadSelection()
  } else if (state.view === "work-orders") {
    loadWorkOrderSelection()
  }
}

function syncWorkOrderSelection() {
  const visible = getVisibleWorkOrders()
  if (!visible.length) {
    state.selectedWorkOrderId = ""
    state.workOrderDetail = null
    return
  }
  if (!visible.some((item) => item.id === state.selectedWorkOrderId)) {
    state.selectedWorkOrderId = visible[0].id
    state.workOrderDetail = null
  }
}

function getSkillBundles() {
  return state.bundlePayload?.bundles || []
}

function getActiveBundle() {
  return state.bundlePayload?.activeBundle || null
}

function syncBundleSelection() {
  const bundles = getSkillBundles()
  if (!bundles.length) {
    state.selectedBundleId = ""
    return
  }
  if (!bundles.some((bundle) => bundle.id === state.selectedBundleId)) {
    state.selectedBundleId = getActiveBundle()?.id || bundles[0].id
  }
}

function renderWorkspace() {
  syncView()
  if (state.view !== "registry") {
    renderEditorDrawer()
    return
  }
  renderProfileRail()
  renderItemBrowserChrome()
  renderItemBrowser()
  renderReviewPane()
  renderEditorDrawer()
}

function renderWorkOrderWorkspace() {
  if (state.view !== "work-orders") {
    return
  }
  renderWorkOrderSummary()
  renderWorkOrderList()
  renderWorkOrderDetail()
}

function renderSkillVersionWorkspace() {
  if (state.view !== "skill-versions") {
    return
  }
  renderSkillVersionSummary()
  renderSkillVersionList()
  renderSkillVersionDetail()
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
    { label: "技能条目", value: state.payload.summary?.itemTotal || 0 },
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

function renderMetric(label, value) {
  return `
    <div class="skill-summary-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `
}

function renderWorkOrderSummary() {
  if (!workOrderSummaryRoot) return
  const visible = getVisibleWorkOrders()
  const totalItems = visible.reduce((sum, item) => sum + Number(item.itemStats?.total || 0), 0)
  const appliedItems = visible.reduce((sum, item) => sum + Number(item.itemStats?.applied || 0), 0)
  const cards = [
    { label: "工单数", value: visible.length },
    { label: "待处理工单", value: visible.filter((item) => item.status === "pending_review").length },
    { label: "修改项总数", value: totalItems },
    { label: "已加入候选项", value: appliedItems }
  ]
  workOrderSummaryRoot.innerHTML = cards
    .map(
      (card) => `
        <div class="skill-summary-metric">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(String(card.value))}</strong>
        </div>
      `
    )
    .join("")
}

function renderWorkOrderList() {
  if (!workOrderListRoot) return
  const visible = getVisibleWorkOrders()
  if (!visible.length) {
    workOrderListRoot.innerHTML = '<div class="empty-state">当前筛选条件下没有技能工单。</div>'
    return
  }
  workOrderListRoot.innerHTML = visible
    .map(
      (item) => `
        <button type="button" class="work-order-list-card ${item.id === state.selectedWorkOrderId ? "is-selected" : ""}" data-work-order-open="${item.id}">
          <strong>${escapeHtml(item.title || item.id)}</strong>
          <p>${escapeHtml(item.moduleName || "未指定模块")} · ${escapeHtml(item.documentType || "-")}</p>
          <div class="inline-meta-row">
            <span class="mini-pill ${statusTone(item.status)}">${escapeHtml(formatWorkOrderStatus(item.status))}</span>
            <span class="work-order-code">${escapeHtml(item.sourceTaskId || "-")}</span>
          </div>
          <p>${escapeHtml(item.decisionSummary || item.summary || "暂无结论摘要")}</p>
          <div class="inline-meta-row">
            <span>${escapeHtml(String(item.itemStats?.total || 0))} 条修改项</span>
            <span>${escapeHtml(formatDate(item.updatedAt))}</span>
          </div>
        </button>
      `
    )
    .join("")
}

function renderWorkOrderDetail() {
  if (!workOrderDetailRoot) return
  const workOrder = state.workOrderDetail
  if (!workOrder) {
    workOrderDetailRoot.className = "work-order-detail empty-state"
    workOrderDetailRoot.textContent = "选择一张工单查看详情。"
    return
  }

  const allEvidence = (workOrder.items || []).flatMap((item) => item.evidenceRefs || [])

  workOrderDetailRoot.className = "work-order-detail"
  workOrderDetailRoot.innerHTML = `
    <section class="work-order-section">
      <div class="detail-header-row">
        <div>
          <h3>${escapeHtml(workOrder.title || workOrder.id)}</h3>
          <p class="summary">${escapeHtml(workOrder.decisionSummary || workOrder.summary || "")}</p>
        </div>
        <div class="work-order-inline-actions">
          <span class="mini-pill ${statusTone(workOrder.status)}">${escapeHtml(formatWorkOrderStatus(workOrder.status))}</span>
          ${workOrder.status !== "closed" ? `<button type="button" class="secondary-button" data-work-order-close="${workOrder.id}">关闭工单</button>` : ""}
        </div>
      </div>
    </section>

    <section class="work-order-section">
      <div class="work-order-section-head">
        <div>
          <h4>修改意见</h4>
          <p class="summary">按条审阅 replay 建议：先看修改意见，再对照原技能写法与建议写法。</p>
        </div>
        <span class="mini-pill subtle">${escapeHtml(String(workOrder.itemStats?.total || (workOrder.items || []).length || 0))} 条</span>
      </div>
      <div class="work-order-items">
        ${(workOrder.items || []).map(renderWorkOrderItemCard).join("")}
      </div>
    </section>

    <details class="work-order-disclosure">
      <summary>任务背景与来源</summary>
      <div class="work-order-meta-grid">
        ${renderWorkOrderMetaItem("来源 fallback 任务", workOrder.sourceTaskId || "-")}
        ${renderWorkOrderMetaItem("模块 / 文档类型", `${workOrder.moduleName || "-"} / ${workOrder.documentType || "-"}`)}
        ${renderWorkOrderMetaItem("模型", workOrder.llmProfile?.label || workOrder.llmProfile?.id || "本地回放")}
        ${renderWorkOrderMetaItem("skill snapshot", workOrder.effectiveSkillSnapshot?.hash || "-")}
        ${renderWorkOrderMetaItem("工单摘要", workOrder.summary || "-")}
        ${renderWorkOrderMetaItem("命中 profile", (workOrder.effectiveSkillSnapshot?.selectedProfiles || []).map((item) => `${item.kind}:${item.key}`).join(" -> ") || "-")}
      </div>
    </details>

    <details class="work-order-disclosure">
      <summary>驳回记录概览</summary>
      <div class="work-order-evidence-list">
        ${allEvidence.slice(0, 6).map(renderWorkOrderEvidenceItem).join("") || '<div class="empty-state">当前没有附带证据片段。</div>'}
      </div>
    </details>

    ${(workOrder.validatorSuggestions || []).length ? `
      <section class="work-order-section">
        <h4>校验建议</h4>
        <div class="work-order-items">
          ${(workOrder.validatorSuggestions || []).map((item) => `
            <article class="work-order-item-card">
              <strong>${escapeHtml(item.title || "校验建议")}</strong>
              <p>${escapeHtml(item.ruleText || "")}</p>
              <p class="summary">${escapeHtml(item.why || "")}</p>
            </article>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `
}

function renderWorkOrderMetaItem(label, value) {
  return `
    <article class="work-order-meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `
}

function renderWorkOrderEvidenceItem(item = {}) {
  const rejectedTitle = item.outputSnapshot?.title || item.requirementCode || item.refId || "被驳回内容"
  const rejectedText = item.outputSnapshot?.requirementText || "无被驳回正文快照"
  return `
    <article class="work-order-evidence-item">
      <div class="inline-meta-row">
        <strong>${escapeHtml(item.requirementCode || item.refId || "证据")}</strong>
        <span class="mini-pill subtle">${escapeHtml(item.reasonCategory || "rejection")}</span>
      </div>
      <div class="work-order-evidence-grid">
        ${renderWorkOrderEvidenceBlock("被驳回内容", `${rejectedTitle}\n${rejectedText}`)}
        ${renderWorkOrderEvidenceBlock("驳回说明", item.reasonText || "未填写")}
        ${renderWorkOrderEvidenceBlock("预期写法", item.expectedNote || "未填写")}
      </div>
    </article>
  `
}

function renderWorkOrderEvidenceBlock(label, value) {
  return `
    <div class="work-order-evidence-block">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || "-")}</p>
    </div>
  `
}

function renderWorkOrderItemCard(item = {}) {
  const edited = item.editedPayload || {}
  const draftContent = edited.afterContent || edited.recommendedSkillText || item.afterContent || item.recommendedSkillText || ""
  const changeSummary = item.changeSummary || item.title || item.whyChange || item.fallbackReason || ""
  const beforeContent = item.beforeContent || (item.conclusionType === "create_new" ? "当前无原技能，新建技能条目。" : "无")
  const stagedBundleText = item.stagedBundleId ? `候选版本：${item.stagedBundleId}` : ""
  return `
    <article class="work-order-item-card">
      <div class="detail-header-row">
        <div>
          <div class="inline-meta-row">
            <span class="mini-pill ${item.conclusionType === "create_new" ? "success" : "subtle"}">${escapeHtml(formatWorkOrderActionLabel(item))}</span>
            <span class="work-order-code">${escapeHtml(item.targetSkillCode || "新增技能条目")}</span>
          </div>
          <strong>${escapeHtml(item.title || item.itemId)}</strong>
        </div>
        <span class="mini-pill ${statusTone(item.reviewStatus)}">${escapeHtml(formatWorkOrderItemStatus(item.reviewStatus))}</span>
      </div>
      <div class="work-order-change-summary">
        <span>修改意见</span>
        <p>${escapeHtml(changeSummary || "暂无修改意见")}</p>
      </div>
      <div class="work-order-diff-stack">
        <div class="work-order-diff-block before">
          <span>原技能写法</span>
          <pre>${escapeHtml(beforeContent)}</pre>
        </div>
        <label class="work-order-diff-block after">
          <span>建议写法</span>
          <textarea rows="7" name="afterContent">${escapeHtml(draftContent)}</textarea>
        </label>
      </div>
      <div class="work-order-evidence-list compact">
        ${(item.evidenceRefs || []).map(renderWorkOrderEvidenceItem).join("") || '<div class="empty-state">当前修改项没有关联驳回记录。</div>'}
      </div>
      <details class="work-order-item-details">
        <summary>审阅辅助信息</summary>
        <div class="work-order-meta-grid">
          ${renderWorkOrderMetaItem("层级 / profile / kind", `${item.targetLayer || "-"} / ${item.targetProfileKey || "-"} / ${item.targetKind || "-"}`)}
          ${renderWorkOrderMetaItem("当前问题", item.whyCurrent || "-")}
          ${renderWorkOrderMetaItem("修改收益", item.whyChange || "-")}
          ${renderWorkOrderMetaItem("插入提示", item.targetInsertionHint || "-")}
          ${renderWorkOrderMetaItem("层级判断", formatScopeDecision(item.scopeDecision || ""))}
          ${renderWorkOrderMetaItem("层级原因", item.scopeReason || "-")}
          ${renderWorkOrderMetaItem("抽象度", item.abstractionScore ? `${item.abstractionScore.toFixed(2)} / 1.00` : "-")}
          ${renderWorkOrderMetaItem("复用判断", formatReuseJudgement(item.reuseJudgement || ""))}
          ${renderWorkOrderMetaItem("是否像驳回改写", item.isParaphraseOfRejection ? "是" : "否")}
          ${renderWorkOrderMetaItem("可应用性", formatReviewReadiness(item.reviewReadiness || ""))}
          ${item.ruleIntent ? renderWorkOrderMetaItem("规则目的", item.ruleIntent) : ""}
        </div>
      </details>
      <div class="work-order-inline-actions">
        ${item.targetSkillCode ? `<button type="button" class="secondary-button" data-work-order-jump-skill="${escapeHtml(item.targetSkillCode)}">查看命中技能</button>` : ""}
        ${!["applied", "staged"].includes(item.reviewStatus) ? `
          <button type="button" data-work-order-accept="${item.itemId}">加入候选版本</button>
          <button type="button" class="secondary-button" data-work-order-edit-apply="${item.itemId}">编辑后加入</button>
          <button type="button" class="ghost-button" data-work-order-reject="${item.itemId}">拒绝</button>
        ` : `
          <span class="summary">已于 ${escapeHtml(formatDate(item.stagedAt || item.appliedAt))} 由 ${escapeHtml(item.stagedBy || item.appliedBy || "system")} 加入候选版本。${escapeHtml(stagedBundleText)}</span>
        `}
      </div>
    </article>
  `
}

function renderSkillVersionSummary() {
  if (!skillVersionSummaryRoot) return
  const bundles = getSkillBundles()
  const active = getActiveBundle()
  const countByStatus = (status) => bundles.filter((bundle) => bundle.status === status).length
  skillVersionSummaryRoot.innerHTML = `
    ${renderMetric("Active", active?.version || active?.id || "-")}
    ${renderMetric("Candidate", countByStatus("candidate"))}
    ${renderMetric("Archived", countByStatus("archived"))}
    ${renderMetric("Rolled Back", countByStatus("rolled_back"))}
  `
}

function renderSkillVersionList() {
  if (!skillVersionListRoot) return
  const bundles = getSkillBundles()
  if (!bundles.length) {
    skillVersionListRoot.innerHTML = '<div class="empty-state">暂无技能版本。</div>'
    return
  }
  skillVersionListRoot.innerHTML = bundles
    .map((bundle) => `
      <button type="button" class="skill-version-list-card ${bundle.id === state.selectedBundleId ? "is-selected" : ""}" data-select-bundle="${escapeHtml(bundle.id)}">
        <div class="inline-meta-row">
          <span class="mini-pill ${statusTone(bundle.status)}">${escapeHtml(formatBundleStatus(bundle.status))}</span>
          <span>${escapeHtml(formatDate(bundle.updatedAt || bundle.createdAt))}</span>
        </div>
        <strong>${escapeHtml(bundle.version || bundle.id)}</strong>
        <span class="work-order-code">${escapeHtml(bundle.id)}</span>
        <p>${escapeHtml(bundle.changeSummary || "无变更摘要")}</p>
      </button>
    `)
    .join("")
}

function renderSkillVersionDetail() {
  if (!skillVersionDetailRoot) return
  const bundle = getSkillBundles().find((item) => item.id === state.selectedBundleId)
  if (!bundle) {
    skillVersionDetailRoot.className = "skill-version-detail empty-state"
    skillVersionDetailRoot.textContent = "选择一个技能版本查看详情。"
    return
  }

  const isCandidate = bundle.status === "candidate"
  const canRollback = ["archived", "rolled_back"].includes(bundle.status)
  const stagedChanges = bundle.stagedChanges || []
  skillVersionDetailRoot.className = "skill-version-detail"
  skillVersionDetailRoot.innerHTML = `
    <section class="skill-version-section">
      <div class="detail-header-row">
        <div>
          <div class="inline-meta-row">
            <span class="mini-pill ${statusTone(bundle.status)}">${escapeHtml(formatBundleStatus(bundle.status))}</span>
            <span class="work-order-code">${escapeHtml(bundle.id)}</span>
          </div>
          <h3>${escapeHtml(bundle.version || bundle.id)}</h3>
          <p class="summary">${escapeHtml(bundle.changeSummary || "暂无变更摘要")}</p>
        </div>
        <div class="work-order-inline-actions">
          ${isCandidate ? `<button type="button" data-bundle-release="${escapeHtml(bundle.id)}">发布</button>` : ""}
          ${canRollback ? `<button type="button" class="secondary-button" data-bundle-rollback="${escapeHtml(bundle.id)}">回滚到此版本</button>` : ""}
          <button type="button" class="secondary-button" data-bundle-fork="${escapeHtml(bundle.id)}">Fork 候选</button>
        </div>
      </div>
    </section>
    <section class="skill-version-section">
      <div class="work-order-meta-grid">
        ${renderWorkOrderMetaItem("Base Bundle", bundle.baseBundleId || "-")}
        ${renderWorkOrderMetaItem("Forked From", bundle.forkedFromBundleId || "-")}
        ${renderWorkOrderMetaItem("Snapshot Hash", bundle.snapshotHash || "-")}
        ${renderWorkOrderMetaItem("Rule Index", bundle.ruleIndexVersion || "-")}
        ${renderWorkOrderMetaItem("SQLite Snapshot", bundle.sqliteSnapshotPath || "-")}
        ${renderWorkOrderMetaItem("来源", bundle.sourceType || "-")}
      </div>
    </section>
    <section class="skill-version-section">
      <div class="work-order-section-head">
        <div>
          <h4>候选变更</h4>
          <p class="summary">从工单或 replay 提案加入此版本的变更会集中显示在这里。</p>
        </div>
        <span class="mini-pill subtle">${escapeHtml(String(stagedChanges.length || 0))} 条</span>
      </div>
      <div class="skill-version-change-list">
        ${stagedChanges.length ? stagedChanges.map(renderBundleChangeItem).join("") : '<div class="empty-state">当前版本没有记录工单变更。</div>'}
      </div>
    </section>
  `
}

function renderBundleChangeItem(change = {}) {
  return `
    <article class="skill-version-change-item">
      <div class="inline-meta-row">
        <strong>${escapeHtml(change.title || change.skillCode || "技能变更")}</strong>
        <span class="mini-pill subtle">${escapeHtml(change.mode || "stage")}</span>
      </div>
      <p>${escapeHtml(change.skillCode || "-")}</p>
      <p class="summary">${escapeHtml([change.workOrderId, change.workOrderItemId].filter(Boolean).join(" / ") || "无来源工单")}</p>
    </article>
  `
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
          <p>左侧 rail 用来定位 profile。选中后，中间区域会按 kind 分桶浏览技能条目。</p>
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
        <p>${escapeHtml(profile.abnormal ? "当前 profile 的数据库真源与已导出的兼容文件可能不一致，建议先确认右侧“兼容字段 / 调试信息”里的导出映射。" : "当前 profile 作为 skill 容器存在，真正的审阅对象是下面分桶展示的技能条目。")}</p>
        <div class="browser-metrics">
          <span class="browser-metric-chip">${profile.metrics.itemCount} items</span>
          <span class="browser-metric-chip">${profile.metrics.fileCount} files</span>
          <span class="browser-metric-chip">${Object.keys(profile.metrics.kinds || {}).length} kinds</span>
          ${profile.abnormal ? '<span class="browser-metric-chip">异常映射</span>' : ""}
        </div>
        <div class="browser-path">
          <span class="code-chip">${escapeHtml(detail?.profile?.registryPath || `${profile.key}/skill-items.json`)}</span>
          ${state.payload?.activeSource?.sourceType === "sqlite" ? `<span class="code-chip">SQLite 真源</span>` : ""}
          ${detail?.profile?.documentTypeScope ? `<span class="code-chip">${escapeHtml(detail.profile.documentTypeScope)}</span>` : ""}
        </div>
      </div>
      <div class="browser-actions">
        <button type="button" data-open-editor="create">新增技能条目</button>
        <button type="button" class="secondary-button" data-materialize-registry="true">导出兼容文件</button>
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
          <p>可以先创建第一条技能条目，再在右侧持续审阅和微调。</p>
          <div class="empty-action-row">
            <button type="button" data-open-editor="create">新增第一条技能条目</button>
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
          <p class="review-section-copy">当前 profile 下匹配到 ${matched.length} 条技能条目。</p>
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
          <p>先从左侧选中一个 profile，再从中间选一条技能条目，右侧会始终保持在当前视口里给你看详情。</p>
        </div>
      </div>
    `
    return
  }

  if (!state.selectedSkillCode && state.itemQuery) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>条目已收起</h3>
          <p>再次点击中间列表里的技能条目即可展开详情，也可以清空搜索回到 kind 审阅流。</p>
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
          <p>当前 profile 还没有技能条目。建议先创建第一条，再用右侧作为固定审阅面板。</p>
          <div class="empty-action-row">
            <button type="button" data-open-editor="create">新增技能条目</button>
          </div>
        </div>
      </div>
    `
    return
  }

  if (!state.selectedKind) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>条目组已收起</h3>
          <p>点击中间区域的 kind 桶可以展开对应技能条目。</p>
        </div>
      </div>
    `
    return
  }

  if (!state.selectedSkillCode) {
    reviewPaneRoot.innerHTML = `
      <div class="workspace-empty">
        <div>
          <h3>条目已收起</h3>
          <p>再次点击中间列表里的技能条目即可展开详情。</p>
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
          <p class="review-eyebrow">技能条目审核</p>
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
            <p class="review-section-kicker">核心内容</p>
            <h3>原子技能正文</h3>
          </div>
        </div>
        ${renderPrimaryContent(item)}
      </section>

      ${renderCompatibilityPanel(item, detailProfile)}
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
  if (!isKindAllowedForLayer(draft.layer, draft.kind)) {
    draft.kind = getAllowedKindsByLayer(draft.layer)[0] || "writing_rule"
  }
  const hideStructuredEditor = isTextTruthKind(draft.kind)

  editorBackdrop.hidden = false
  editorBackdrop.classList.add("is-open")
  editorDrawer.classList.add("is-open")
  editorDrawer.setAttribute("aria-hidden", "false")
  document.body.classList.add("drawer-open")

  editorDrawerBody.innerHTML = `
    <div class="editor-drawer-head">
      <div>
        <p class="review-eyebrow">${state.editorMode === "create" ? "Create" : "Edit"} Drawer</p>
        <h2>${escapeHtml(state.editorMode === "create" ? "新增技能条目" : `编辑 ${item?.title || "技能条目"}`)}</h2>
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
              <select name="kind">${kindOptions(draft.layer, draft.kind)}</select>
            </label>
          </div>
          <p class="summary" data-kind-hint>当前 ${escapeHtml(draft.layer)} 层允许：${escapeHtml(getAllowedKindsByLayer(draft.layer).join(" / ") || "无")}</p>
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
          <p class="editor-section-copy">默认把一条技能当成一条正文来维护。大多数技能你只需要改这里，不需要碰下面的兼容字段。</p>
          ${
            item && !String(item.content || "").trim() && hasStructuredPayload(item)
              ? `
                <div class="editor-advanced-card">
                  <strong>当前正文预览</strong>
                  <p class="summary">这条技能目前主要靠兼容字段生成可读正文。如果你希望以后完全按“一条正文”来维护，可以把下面正文补齐。</p>
                  <pre class="json-block editor-readable-preview">${escapeHtml(buildReadableRuleText(item))}</pre>
                </div>
              `
              : ""
          }
          <label>
            技能正文
            <textarea name="content" rows="10" placeholder="输入这条技能真正要表达的正文内容。">${escapeHtml(draft.content)}</textarea>
          </label>
        </section>

        ${
          hideStructuredEditor
            ? `
              <section class="editor-section">
                <h3>正文真源</h3>
                <p class="editor-section-copy">这类技能已经改成“正文即真源”。你现在只需要维护上面的正文，底层结构会在保存时由后端自动解析和校验。</p>
              </section>
            `
            : `
              <details class="advanced-panel editor-collapsible-panel">
                <summary>
                  <span class="advanced-summary-title">
                    <strong>兼容字段</strong>
                    <small>只在少数还未切成正文真源的结构化技能里需要。</small>
                  </span>
                  <span class="advanced-summary-meta">${escapeHtml(hasStructuredPayload(item) ? "当前有兼容字段" : "如无需要可不填写")}</span>
                </summary>
                <div class="advanced-grid">
                  <div class="advanced-explainer">
                    这里保留对少数旧链路字段的兼容。只有在这条技能还没有切到“正文真源”时，才需要补这个 JSON。
                  </div>
                  <section class="advanced-card">
                    <h3>Structured Payload JSON</h3>
                    <label>
                      <textarea class="json-editor" name="structuredPayload" rows="12" placeholder='{"key":"value"}'>${escapeHtml(draft.structuredPayload)}</textarea>
                    </label>
                  </section>
                </div>
              </details>
            `
        }

        <details class="advanced-panel editor-collapsible-panel">
          <summary>
            <span class="advanced-summary-title">
              <strong>上下文 / 调试信息</strong>
              <small>帮助确认当前编辑对象来自哪里，不影响正文编辑。</small>
            </span>
            <span class="advanced-summary-meta">${escapeHtml(item?.skillCode || "新建后自动分配")}</span>
          </summary>
          <div class="advanced-grid">
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
          </div>
        </details>
      </div>

      <div class="editor-footer">
        <button type="submit">${state.editorMode === "create" ? "创建技能条目" : "保存技能条目"}</button>
        <button type="button" class="secondary-button" data-close-editor="true">取消</button>
      </div>
    </form>
  `
  syncEditorKindSelection(editorDrawerBody.querySelector("#skill-editor-form"))
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
          : `<div class="kind-bucket-note">点击进入这个 kind 桶，并将右侧审阅面板对准其中第一条技能条目。</div>`
      }
    </article>
  `
}

function renderItemCard(item, options = {}) {
  const statusLabel = options.searchMode ? kindLabel(item.kind) : item.status || "active"
  return `
    <button type="button" class="item-card ${state.selectedSkillCode === item.skillCode ? "is-selected" : ""}" data-select-item="${escapeHtml(item.skillCode)}" aria-pressed="${state.selectedSkillCode === item.skillCode ? "true" : "false"}">
      <div class="item-card-top">
        <span class="item-card-code">${escapeHtml(item.skillCode)}</span>
        <span class="mini-pill subtle">${escapeHtml(statusLabel)}</span>
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

function renderPrimaryContent(item) {
  const readableText = buildReadableRuleText(item)
  const derivedFromStructured = !String(item?.content || "").trim() && hasStructuredPayload(item)
  return `
    <article class="primary-content-card">
      <pre class="reading-block reading-block-emphasis">${escapeHtml(readableText || "当前没有可展示的规则内容。")}</pre>
    </article>
  `
}

function renderCompatibilityPanel(item, detailProfile) {
  if (isTextTruthKind(item?.kind)) {
    return ""
  }

  const hasStructured = hasStructuredPayload(item)
  const fileCount = (detailProfile?.files || []).length
  const provenance = item?.provenance || {}
  const hasProvenance = Object.keys(provenance).length > 0

  return `
    <details class="advanced-panel compatibility-panel">
      <summary>
        <span class="advanced-summary-title">
          <strong>兼容字段 / 调试信息</strong>
          <small>默认阅读可以忽略这里；只有核对结构化规则、来源或导出文件时再展开。</small>
        </span>
        <span class="advanced-summary-meta">${escapeHtml(hasStructured ? "含兼容字段" : fileCount ? `${fileCount} 个已导出文件` : "展开查看详情")}</span>
      </summary>
      <div class="advanced-grid">
        <div class="advanced-explainer">
          ${
            hasStructured
              ? "这条技能底层仍保留了结构化兼容字段，用来支持别名映射、归一化规则、蓝图策略等后端链路。阅读和日常审阅可以继续按上面的“一条正文”理解。"
              : "这条技能本身已经接近“一个技能 = 一条正文”的形式。这里保留的更多是来源、JSON 和兼容导出文件等维护信息。"
          }
        </div>
        ${
          hasStructured
            ? `
              <section class="advanced-card">
                <h3>结构化兼容字段</h3>
                <p class="review-section-copy">这些字段主要用于兼容现有 registry 和知识文件导出，不是主阅读内容。</p>
              ${renderStructuredSummary(item)}
            </section>
            `
            : ""
        }
        <section class="advanced-card">
          <h3>原始 Item JSON</h3>
          <pre class="json-block">${escapeHtml(stringifyJson(item))}</pre>
        </section>
        ${
          hasProvenance
            ? `
              <section class="advanced-card">
                <h3>来源信息 Provenance</h3>
                <pre class="json-block">${escapeHtml(stringifyJson(provenance))}</pre>
              </section>
            `
            : ""
        }
        <section class="advanced-card">
          <h3>兼容导出文件映射</h3>
          <div class="file-summary-list">
            ${fileCount ? detailProfile.files.map(renderFileSummary).join("") : '<div class="workspace-empty"><div><p>当前没有可展示的兼容导出文件。</p></div></div>'}
          </div>
        </section>
      </div>
    </details>
  `
}

function renderStructuredSummary(item) {
  const payload = item?.structuredPayload
  const entries = structuredEntries(payload)
  if (!entries.length) {
    return `
      <div class="workspace-empty">
        <div>
          <h3>没有结构化字段</h3>
          <p>这条 skill 主要依赖正文内容表达约束，完整 item JSON 可以在“调试 / 落盘信息”中查看。</p>
        </div>
      </div>
    `
  }

  if (item?.kind === "forbidden_expansion" && payload?.topic && Array.isArray(payload.entries)) {
    return `
      <div class="structured-summary-stack">
        <div class="structured-summary-grid structured-summary-grid-compact">
          <article class="structured-summary-card">
            <span>适用主题</span>
            <strong>${escapeHtml(payload.topic)}</strong>
          </article>
          <article class="structured-summary-card">
            <span>禁止扩写项数量</span>
            <strong>${escapeHtml(String(payload.entries.length))}</strong>
          </article>
        </div>
        <article class="structured-summary-card">
          <span>禁止扩写项</span>
          <div class="structured-chip-group">
            ${payload.entries.map((entry) => `<span class="structured-value-chip">${escapeHtml(String(entry))}</span>`).join("")}
          </div>
        </article>
      </div>
    `
  }

  if (item?.kind === "source_alias" && payload?.canonical && Array.isArray(payload.aliases)) {
    return `
      <div class="structured-summary-stack">
        <article class="structured-summary-card">
          <span>Canonical</span>
          <strong>${escapeHtml(payload.canonical)}</strong>
        </article>
        <article class="structured-summary-card">
          <span>Aliases</span>
          <div class="structured-chip-group">
            ${payload.aliases.map((alias) => `<span class="structured-value-chip">${escapeHtml(String(alias))}</span>`).join("")}
          </div>
        </article>
      </div>
    `
  }

  if (item?.kind === "normalization_rule" && (payload?.pattern || payload?.replacement)) {
    return `
      <div class="structured-pair-grid">
        <article class="structured-summary-card">
          <span>Pattern</span>
          <strong>${escapeHtml(payload.pattern || "-")}</strong>
        </article>
        <article class="structured-summary-card">
          <span>Replacement</span>
          <strong>${escapeHtml(payload.replacement || "-")}</strong>
        </article>
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
    ${entries.length > 8 ? `<p class="summary">还有 ${entries.length - 8} 个字段已折叠，完整 JSON 见“调试 / 落盘信息”。</p>` : ""}
  `
}

function renderFileSummary(entry) {
  return `
    <article class="file-summary-item">
      <div class="file-summary-row">
        <strong>文件角色：${escapeHtml(entry.role)}</strong>
        <span class="mini-pill ${entry.exists ? "success" : "warning"}">${entry.exists ? "存在" : "缺失"}</span>
        <span class="code-chip">导出位置：${escapeHtml(entry.relativePath)}</span>
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
    setPageStatus("正在导出兼容文件...")
    await request("/api/skill-export/compatibility", { method: "POST" })
    await refreshAll(false)
    setPageStatus("兼容文件已导出，Markdown 与 domain-knowledge.json 已同步。")
  } catch (error) {
    setPageStatus(`导出失败：${error.message}`, true)
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

function getVisibleWorkOrders() {
  return (state.workOrders || []).filter((item) => {
    if (state.workOrderFilters.status && item.status !== state.workOrderFilters.status) return false
    if (state.workOrderFilters.documentType) {
      const haystack = `${item.documentType || ""}`.toLowerCase()
      if (!haystack.includes(state.workOrderFilters.documentType.toLowerCase())) return false
    }
    return true
  })
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
  const base = String(item.preview || buildReadableRuleText(item, { compact: true }) || JSON.stringify(item.structuredPayload || {}))
    .replace(/\s+/g, " ")
    .trim()
  if (!base) return "暂无内容预览。"
  return base.length > 180 ? `${base.slice(0, 180)}...` : base
}

function isTextTruthKind(kind = "") {
  return TEXT_TRUTH_KINDS.has(String(kind || "").trim())
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

function hasStructuredPayload(item) {
  return structuredEntries(item?.structuredPayload).length > 0
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

function buildReadableRuleText(item, options = {}) {
  const compact = Boolean(options.compact)
  const textContent = String(item?.content || "").trim()
  if (textContent) return textContent

  const payload = item?.structuredPayload
  if (!payload) return ""

  if (item?.kind === "forbidden_expansion") {
    return buildForbiddenExpansionText(payload, { compact })
  }

  if (item?.kind === "source_alias") {
    return buildSourceAliasText(payload, { compact })
  }

  if (item?.kind === "normalization_rule") {
    return buildNormalizationRuleText(payload, { compact })
  }

  if (item?.kind === "source_policy_setting") {
    return buildSourcePolicySettingText(payload, { compact })
  }

  if (item?.kind === "document_blueprint_section") {
    return buildDocumentBlueprintSectionText(payload, { compact })
  }

  if (item?.kind === "document_blueprint_policy") {
    return buildDocumentBlueprintPolicyText(payload, { compact })
  }

  if (item?.kind === "rule_hint") {
    return buildRuleHintText(payload, { compact })
  }

  if (item?.kind === "good_example") {
    return buildGoodExampleText(payload, { compact })
  }

  return buildGenericStructuredText(payload, { compact })
}

function buildForbiddenExpansionText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const topic = payload?.topic || "-"
  const entries = Array.isArray(payload?.entries) ? payload.entries.filter(Boolean) : []
  if (compact) {
    return `主题 ${topic} 下禁止扩写：${entries.slice(0, 3).join("、")}${entries.length > 3 ? " 等" : ""}`
  }
  return [
    `适用主题：${topic}`,
    `规则：当生成 ${topic} 相关内容时，不要额外扩写这些对象或子功能。`,
    `禁止扩写项：${entries.length ? entries.join("、") : "-"}`,
    "用途：用于收紧边界，避免模型把不该带入的对象写进正文。"
  ].join("\n")
}

function buildSourceAliasText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const canonical = payload?.canonical || "-"
  const aliases = Array.isArray(payload?.aliases) ? payload.aliases.filter(Boolean) : []
  if (compact) {
    return `规范名 ${canonical}；代码别名 ${aliases.slice(0, 2).join("、")}${aliases.length > 2 ? " 等" : ""}`
  }
  return [
    `规范名称：${canonical}`,
    `代码别名：${aliases.length ? aliases.join("、") : "-"}`,
    `规则：正文和规则描述优先使用规范名称 ${canonical}，必要时仅把这些别名当作映射参考。`
  ].join("\n")
}

function buildNormalizationRuleText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const pattern = payload?.pattern || "-"
  const replacement = payload?.replacement || "-"
  if (compact) {
    return `表达归一：${pattern} -> ${replacement}`
  }
  return [
    `原始表达：${pattern}`,
    `统一表达：${replacement}`,
    "规则：遇到容易漂移的写法时，统一改写成目标表达。"
  ].join("\n")
}

function buildSourcePolicySettingText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const key = String(payload?.key || "").trim()
  const value = payload?.value
  const valueText = formatInlineValue(value)

  const templates = {
    standard: `参考标准：${valueText}`,
    singleSourceOfTruth: `单一事实来源：${formatBooleanPolicy(value, "是", "否")}`,
    forbidCodeStyleSignals: `禁止代码风格信号主导正文：${formatBooleanPolicy(value, "是", "否")}`
  }
  if (compact) return templates[key] || `${friendlyPolicyKey(key)}：${valueText}`
  return [
    `策略项：${friendlyPolicyKey(key)}`,
    `配置值：${valueText}`,
    `含义：${templates[key] || `生成时遵循 ${friendlyPolicyKey(key)} 这项事实边界设置。`}`
  ].join("\n")
}

function buildDocumentBlueprintSectionText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const role = payload?.role || "-"
  const title = payload?.title || "-"
  const requirementTypes = Array.isArray(payload?.coreRequirementTypes) ? payload.coreRequirementTypes.filter(Boolean) : []
  const roleLabel =
    role === "preferredFunctionSection"
      ? "首选功能章节"
      : role === "preferredSubsection"
        ? "首选子章节"
        : role

  if (compact) {
    return `${roleLabel}：${title}${requirementTypes.length ? `（覆盖 ${requirementTypes.join("、")}）` : ""}`
  }

  return [
    `章节角色：${roleLabel}`,
    `章节标题：${title}`,
    requirementTypes.length ? `核心需求类型：${requirementTypes.join("、")}` : "核心需求类型：-",
    "规则：生成文档骨架时，优先按照这条蓝图章节来落位。"
  ].join("\n")
}

function buildDocumentBlueprintPolicyText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const key = String(payload?.key || "").trim()
  const value = payload?.value
  const descriptions = {
    coreFirst: "优先先铺开核心章节和核心规则。",
    preferSymmetricExpansion: "优先按对象或轴对称展开章节和需求。",
    preferObjectSpecificRequirements: "优先输出对象明确、归属明确的需求。",
    discourageGenericScatterRequirements: "避免输出泛泛而散的零碎需求。"
  }
  if (compact) return `${friendlyPolicyKey(key)}：${formatInlineValue(value)}`
  return [
    `蓝图策略：${friendlyPolicyKey(key)}`,
    `配置值：${formatInlineValue(value)}`,
    `含义：${descriptions[key] || "生成文档蓝图时遵循这条高层策略。"}`
  ].join("\n")
}

function buildRuleHintText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const sectionHints = Array.isArray(payload?.sectionHints) ? payload.sectionHints.filter(Boolean) : []
  const sourceBasis = Array.isArray(payload?.sourceBasis) ? payload.sourceBasis.filter(Boolean) : []
  if (compact) {
    return payload?.writingPattern || payload?.targetStyle || sectionHints.join("、")
  }
  return [
    payload?.domain ? `适用领域：${payload.domain}${payload?.subdomain ? ` / ${payload.subdomain}` : ""}` : "",
    sectionHints.length ? `建议章节：${sectionHints.join("、")}` : "",
    payload?.writingPattern ? `写作模式：${payload.writingPattern}` : "",
    payload?.targetStyle ? `目标风格：${payload.targetStyle}` : "",
    sourceBasis.length ? `来源依据：${sourceBasis.join("、")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

function buildGoodExampleText(payload, options = {}) {
  const compact = Boolean(options.compact)
  if (compact) {
    return payload?.requirementText || payload?.preferredTitle || payload?.topic || ""
  }
  return [
    payload?.preferredTitle ? `推荐标题：${payload.preferredTitle}` : "",
    payload?.sectionTitle ? `所属章节：${payload.sectionTitle}` : "",
    payload?.requirementType ? `需求类型：${payload.requirementType}` : "",
    payload?.requirementId ? `参考需求：${payload.requirementId}` : "",
    payload?.requirementText ? `示例内容：${payload.requirementText}` : "",
    Array.isArray(payload?.references) && payload.references.length ? `关联引用：${payload.references.join("、")}` : "",
    Array.isArray(payload?.canonicalBranches) && payload.canonicalBranches.length ? `关键分支：${payload.canonicalBranches.join("、")}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

function buildGenericStructuredText(payload, options = {}) {
  const compact = Boolean(options.compact)
  const entries = structuredEntries(payload)
  if (!entries.length) return ""
  if (compact) {
    return entries
      .slice(0, 2)
      .map(([key, value]) => `${friendlyFieldLabel(key)}：${summarizeValue(value, 40)}`)
      .join("；")
  }
  return entries.map(([key, value]) => `${friendlyFieldLabel(key)}：${formatBlockValue(value)}`).join("\n")
}

function formatInlineValue(value) {
  if (Array.isArray(value)) return value.map((entry) => formatInlineValue(entry)).join("、")
  if (value && typeof value === "object") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value ?? "-")
}

function formatBlockValue(value) {
  if (Array.isArray(value)) return value.map((entry) => formatInlineValue(entry)).join("、")
  if (value && typeof value === "object") {
    return structuredEntries(value)
      .map(([key, innerValue]) => `${friendlyFieldLabel(key)}=${formatInlineValue(innerValue)}`)
      .join("；")
  }
  return formatInlineValue(value)
}

function friendlyFieldLabel(key = "") {
  const mapping = {
    key: "键",
    value: "值",
    topic: "主题",
    entries: "条目",
    canonical: "规范名",
    aliases: "别名",
    pattern: "原始模式",
    replacement: "替换表达",
    role: "角色",
    title: "标题",
    domain: "领域",
    subdomain: "子领域",
    sectionHints: "章节提示",
    writingPattern: "写作模式",
    targetStyle: "目标风格",
    sourceBasis: "来源依据",
    requirementId: "需求编号",
    sectionTitle: "章节标题",
    requirementType: "需求类型",
    preferredTitle: "推荐标题",
    requirementText: "需求正文",
    signals: "涉及信号",
    references: "关联引用",
    canonicalBranches: "关键分支",
    keywords: "关键词",
    coreRequirementTypes: "核心需求类型"
  }
  return mapping[key] || key
}

function friendlyPolicyKey(key = "") {
  const mapping = {
    standard: "参考标准",
    singleSourceOfTruth: "单一事实来源",
    forbidCodeStyleSignals: "禁止代码风格信号",
    coreFirst: "核心优先",
    preferSymmetricExpansion: "偏好对称展开",
    preferObjectSpecificRequirements: "偏好对象化需求",
    discourageGenericScatterRequirements: "避免泛化散点需求"
  }
  return mapping[key] || key
}

function formatBooleanPolicy(value, trueLabel = "是", falseLabel = "否") {
  return value ? trueLabel : falseLabel
}

function kindOptions(layer = "module", selected = "") {
  const allowedKinds = getAllowedKindsByLayer(layer)
  const effectiveSelected = isKindAllowedForLayer(layer, selected) ? selected : allowedKinds[0] || ""
  return allowedKinds.map((kind) => `<option value="${kind}" ${effectiveSelected === kind ? "selected" : ""}>${kind}</option>`).join("")
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
  if (kind === "source_alias") return "把代码别名映射回规范名称，减少正文表达漂移。"
  if (kind === "code_style_prefix") return "标记实现态命名前缀，避免它们主导最终正文。"
  if (kind === "forbidden_expansion") return "约束某类主题下不能凭空扩写哪些对象或子功能。"
  if (kind === "normalization_rule") return "把容易漂移的表达统一成固定说法。"
  if (kind === "source_policy_setting") return "声明事实来源边界，约束生成时该信谁、该避开什么。"
  if (kind === "document_blueprint_section") return "定义文档章节骨架，帮助生成时稳定落位。"
  if (kind === "document_blueprint_policy") return "补充文档蓝图的高层策略与组织方式。"
  return "这类 item 以结构化字段为主，右侧先看摘要，完整 JSON 在“调试 / 落盘信息”中。"
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

function formatWorkOrderStatus(status = "") {
  const labels = {
    pending_review: "待审阅",
    partially_reviewed: "部分已审阅",
    partially_applied: "部分已加入候选",
    applied: "已加入候选",
    closed: "已关闭"
  }
  return labels[status] || status || "未知"
}

function formatWorkOrderItemStatus(status = "") {
  const labels = {
    pending: "待处理",
    accepted: "待加入候选",
    edited: "编辑后待加入",
    rejected: "已拒绝",
    applied: "已应用",
    staged: "已加入候选"
  }
  return labels[status] || status || "未知"
}

function formatBundleStatus(status = "") {
  const labels = {
    active: "Active",
    candidate: "Candidate",
    archived: "Archived",
    rolled_back: "Rolled Back"
  }
  return labels[status] || status || "未知"
}

function formatWorkOrderActionLabel(item = {}) {
  return item.conclusionType === "create_new" ? "新增技能条目" : "修改已有技能条目"
}

function formatScopeDecision(scope = "") {
  const labels = {
    generic: "generic / 通用层",
    docType: "docType / 文档类型层",
    domain: "domain / 领域层",
    module: "module / 模块层"
  }
  return labels[scope] || scope || "未判定"
}

function formatReviewReadiness(value = "") {
  const labels = {
    ready_to_apply: "可直接应用",
    needs_human_refine: "建议人工再提升"
  }
  return labels[value] || value || "未判定"
}

function formatReuseJudgement(value = "") {
  const labels = {
    generic_general: "通用可复用",
    doc_type_general: "文档类型可复用",
    domain_general: "领域内可复用",
    module_specific: "模块特定"
  }
  return labels[value] || value || "未判定"
}

function statusTone(status = "") {
  if (["active", "applied", "staged", "accepted", "closed"].includes(status)) return "success"
  if (["rejected"].includes(status)) return "danger"
  if (["candidate", "edited", "partially_applied", "partially_reviewed"].includes(status)) return "warning"
  return "subtle"
}

function buildWorkOrderListUrl() {
  const params = new URLSearchParams()
  if (state.workOrderFilters.status) params.set("status", state.workOrderFilters.status)
  if (state.workOrderFilters.documentType) params.set("documentType", state.workOrderFilters.documentType)
  return `/api/skill-work-orders?${params.toString()}`
}

async function submitWorkOrderItemAction(itemId, reviewStatus, useEditedContent, sourceNode) {
  const card = sourceNode?.closest(".work-order-item-card")
  const afterContent = card?.querySelector('textarea[name="afterContent"]')?.value || ""
  try {
    await request(`/api/skill-work-orders/${encodeURIComponent(state.selectedWorkOrderId)}/items/${encodeURIComponent(itemId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        useEditedContent
          ? {
              reviewStatus,
              editedPayload: { afterContent }
            }
          : {
              reviewStatus
            }
      )
    })
    await request(`/api/skill-work-orders/${encodeURIComponent(state.selectedWorkOrderId)}/items/${encodeURIComponent(itemId)}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stagedBy: "web-ui" })
    })
    await refreshAll(false)
    setPageStatus("修改项已加入候选技能版本。")
  } catch (error) {
    setPageStatus(`加入候选版本失败：${error.message}`, true)
  }
}

async function jumpToSkill(skillCode = "") {
  if (!skillCode) return
  try {
    const detail = await request(`/api/skill-items/${encodeURIComponent(skillCode)}`)
    state.selectedProfileId = `${detail.item.layer}:${detail.item.profileKey}`
    state.selectedSkillCode = detail.item.skillCode
    state.selectedKind = detail.item.kind
    setView("registry")
    await loadSelection()
    setPageStatus(`已定位到 ${skillCode}。`)
  } catch (error) {
    setPageStatus(`跳转到技能详情失败：${error.message}`, true)
  }
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
