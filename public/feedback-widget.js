const MAX_FILES = 6;

function shouldMountFeedbackWidget() {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

if (!window.__feedbackWidgetInitialized && shouldMountFeedbackWidget()) {
  window.__feedbackWidgetInitialized = true;
  initFeedbackWidget();
}

function initFeedbackWidget() {
  if (!document.body) {
    return;
  }

  const root = document.createElement("div");
  root.className = "feedback-widget-root";
  root.innerHTML = `
    <button type="button" class="feedback-fab" aria-haspopup="dialog" aria-controls="feedback-widget-dialog">
      <span class="feedback-fab-badge" aria-hidden="true">!</span>
      <span class="feedback-fab-copy">
        <strong>问题反馈</strong>
        <span>Issue Desk</span>
      </span>
    </button>
    <dialog id="feedback-widget-dialog" class="feedback-widget-dialog">
      <div class="feedback-widget-shell">
        <section class="feedback-widget-panel feedback-widget-entry-panel" data-feedback-panel="entry">
          <header class="feedback-widget-head">
            <div class="feedback-widget-headline">
              <div>
                <p class="feedback-widget-kicker">Feedback Ticket</p>
                <h2>把现场问题收拢成两条路径</h2>
                <p>现在这个入口既负责现场提报，也能直接跳到工单台集中查看已有问题。</p>
              </div>
              <button type="button" class="feedback-widget-close" aria-label="关闭反馈弹窗">×</button>
            </div>
          </header>
          <div class="feedback-widget-entry-body">
            <div class="feedback-widget-meta">
              <span><strong>当前页面：</strong><span data-feedback-page-title></span></span>
              <span><strong>路径：</strong><span data-feedback-page-path></span></span>
            </div>
            <div class="feedback-widget-entry-grid">
              <button type="button" class="feedback-widget-entry-card" data-feedback-action="create">
                <span class="feedback-widget-entry-eyebrow">Create Ticket</span>
                <strong>新建反馈工单</strong>
                <p>把当前页面的异常、困惑或建议直接记成一条现场工单，并上传截图。</p>
              </button>
              <button type="button" class="feedback-widget-entry-card feedback-widget-entry-card-view" data-feedback-action="view">
                <span class="feedback-widget-entry-eyebrow">View Desk</span>
                <strong>查看已有工单</strong>
                <p>进入反馈工单台，集中查阅问题详情、来源页面和历史截图。</p>
              </button>
            </div>
          </div>
        </section>

        <section class="feedback-widget-panel feedback-widget-form-panel" data-feedback-panel="form" hidden>
          <header class="feedback-widget-head">
            <div class="feedback-widget-headline">
              <div>
                <p class="feedback-widget-kicker">Feedback Ticket</p>
                <h2>把问题留在现场</h2>
                <p>描述你现在看到的异常、困惑或建议。我们会把当前页面上下文和你上传的截图一起记录下来。</p>
              </div>
              <div class="feedback-widget-head-actions">
                <button type="button" class="feedback-widget-back" aria-label="返回反馈入口">返回</button>
                <button type="button" class="feedback-widget-close" aria-label="关闭反馈弹窗">×</button>
              </div>
            </div>
          </header>
          <form class="feedback-widget-form" method="dialog">
            <div class="feedback-widget-meta">
              <span><strong>当前页面：</strong><span data-feedback-page-title></span></span>
              <span><strong>路径：</strong><span data-feedback-page-path></span></span>
            </div>
            <div class="feedback-widget-grid">
              <label class="feedback-widget-label">
                <span>问题标题</span>
                <input name="title" type="text" maxlength="120" placeholder="例如：任务详情页的驳回弹窗状态提示不清晰" required />
              </label>
              <label class="feedback-widget-label">
                <span>内容详情</span>
                <textarea name="detail" maxlength="8000" placeholder="请描述你在哪个页面、进行了什么操作、期望看到什么、实际看到了什么。支持把建议和异常一起写进来。" required></textarea>
              </label>
            </div>
            <section class="feedback-widget-attachments">
              <div class="feedback-widget-attachments-head">
                <div>
                  <span>截图附件</span>
                  <p>支持上传图片，最多 ${MAX_FILES} 张。建议优先附带当前页面截图。</p>
                </div>
                <label class="feedback-widget-upload">
                  <span>上传图片</span>
                  <input name="images" type="file" accept="image/*" multiple />
                </label>
              </div>
              <div class="feedback-widget-preview-list" data-feedback-preview-list>
                <div class="feedback-widget-empty">还没有上传图片。<br />如果是 UI 或交互问题，附图会更容易定位。</div>
              </div>
            </section>
            <p class="feedback-widget-status" aria-live="polite"></p>
            <div class="feedback-widget-success-actions" hidden>
              <a class="feedback-widget-success-link" href="/feedback-tickets">去查看工单</a>
            </div>
            <div class="feedback-widget-actions">
              <button type="button" class="feedback-widget-secondary">取消</button>
              <button type="submit" class="feedback-widget-primary">提交工单</button>
            </div>
          </form>
        </section>
      </div>
    </dialog>
  `;

  document.body.append(root);

  const button = root.querySelector(".feedback-fab");
  const dialog = root.querySelector(".feedback-widget-dialog");
  const entryPanel = root.querySelector('[data-feedback-panel="entry"]');
  const formPanel = root.querySelector('[data-feedback-panel="form"]');
  const closeButtons = root.querySelectorAll(".feedback-widget-close");
  const entryButtons = root.querySelectorAll("[data-feedback-action]");
  const backButton = root.querySelector(".feedback-widget-back");
  const cancelButton = root.querySelector(".feedback-widget-secondary");
  const form = root.querySelector(".feedback-widget-form");
  const titleInput = root.querySelector('input[name="title"]');
  const detailInput = root.querySelector('textarea[name="detail"]');
  const fileInput = root.querySelector('input[name="images"]');
  const previewList = root.querySelector("[data-feedback-preview-list]");
  const status = root.querySelector(".feedback-widget-status");
  const submitButton = root.querySelector(".feedback-widget-primary");
  const successActions = root.querySelector(".feedback-widget-success-actions");
  const successLink = root.querySelector(".feedback-widget-success-link");
  const pageTitleTargets = root.querySelectorAll("[data-feedback-page-title]");
  const pagePathTargets = root.querySelectorAll("[data-feedback-page-path]");

  let selectedFiles = [];
  let objectUrls = [];
  let lastCreatedTicketId = "";

  for (const target of pageTitleTargets) {
    target.textContent = document.title.trim();
  }
  for (const target of pagePathTargets) {
    target.textContent = window.location.pathname;
  }

  function cleanupObjectUrls() {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    objectUrls = [];
  }

  function setPanel(mode) {
    const isEntry = mode !== "form";
    entryPanel.hidden = !isEntry;
    formPanel.hidden = isEntry;
    dialog.classList.toggle("is-form-mode", !isEntry);
    if (isEntry) {
      button.setAttribute("aria-expanded", "true");
      root.querySelector('[data-feedback-action="create"]').focus();
      return;
    }
    titleInput.focus();
  }

  function setStatus(message = "", tone = "") {
    status.textContent = message;
    status.classList.remove("is-error", "is-success");
    if (tone === "error") {
      status.classList.add("is-error");
    }
    if (tone === "success") {
      status.classList.add("is-success");
    }
  }

  function syncFileInput() {
    const transfer = new DataTransfer();
    for (const file of selectedFiles) {
      transfer.items.add(file);
    }
    fileInput.files = transfer.files;
  }

  function renderPreviews() {
    cleanupObjectUrls();
    previewList.innerHTML = "";

    if (!selectedFiles.length) {
      previewList.innerHTML = `<div class="feedback-widget-empty">还没有上传图片。<br />如果是 UI 或交互问题，附图会更容易定位。</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const [index, file] of selectedFiles.entries()) {
      const card = document.createElement("div");
      card.className = "feedback-widget-preview-card";
      const imageUrl = URL.createObjectURL(file);
      objectUrls.push(imageUrl);
      card.innerHTML = `
        <img src="${imageUrl}" alt="${escapeHtml(file.name)}" />
        <div class="feedback-widget-preview-meta">
          <span class="feedback-widget-preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <button type="button" class="feedback-widget-remove" data-feedback-remove="${index}" aria-label="移除图片">×</button>
        </div>
      `;
      fragment.append(card);
    }
    previewList.append(fragment);
  }

  function resetForm() {
    form.reset();
    selectedFiles = [];
    syncFileInput();
    renderPreviews();
  }

  function updateSuccessLink() {
    successLink.href = lastCreatedTicketId
      ? `/feedback-tickets?ticket=${encodeURIComponent(lastCreatedTicketId)}`
      : "/feedback-tickets";
  }

  function openDialog() {
    setStatus("");
    successActions.hidden = true;
    updateSuccessLink();
    if (!dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
    setPanel("entry");
  }

  function closeDialog() {
    dialog.close();
    setStatus("");
    successActions.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", openDialog);
  for (const closeButton of closeButtons) {
    closeButton.addEventListener("click", closeDialog);
  }
  cancelButton.addEventListener("click", closeDialog);
  backButton.addEventListener("click", () => {
    setStatus("");
    successActions.hidden = true;
    setPanel("entry");
  });

  for (const entryButton of entryButtons) {
    entryButton.addEventListener("click", () => {
      const action = entryButton.dataset.feedbackAction || "";
      if (action === "view") {
        window.location.href = "/feedback-tickets";
        return;
      }
      setStatus("");
      successActions.hidden = true;
      setPanel("form");
    });
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  fileInput.addEventListener("change", () => {
    const incoming = Array.from(fileInput.files || []).filter((file) => file.type.startsWith("image/"));
    selectedFiles = [...selectedFiles, ...incoming].slice(0, MAX_FILES);
    syncFileInput();
    renderPreviews();
    if (incoming.length === 0 && fileInput.files?.length) {
      setStatus("只支持上传图片文件。", "error");
      return;
    }
    setStatus(selectedFiles.length >= MAX_FILES ? `已达到最多 ${MAX_FILES} 张图片。` : "");
  });

  previewList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-feedback-remove]");
    if (!removeButton) {
      return;
    }
    const index = Number(removeButton.dataset.feedbackRemove);
    if (Number.isNaN(index)) {
      return;
    }
    selectedFiles.splice(index, 1);
    syncFileInput();
    renderPreviews();
    setStatus("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("正在提交反馈工单...");
    successActions.hidden = true;
    submitButton.disabled = true;
    backButton.disabled = true;
    cancelButton.disabled = true;
    for (const closeButton of closeButtons) {
      closeButton.disabled = true;
    }

    try {
      const payload = new FormData();
      payload.set("title", titleInput.value.trim());
      payload.set("detail", detailInput.value.trim());
      payload.set("pagePath", window.location.pathname);
      payload.set("pageTitle", document.title.trim());
      for (const file of selectedFiles) {
        payload.append("images", file);
      }

      const response = await fetch("/api/feedback-tickets", {
        method: "POST",
        body: payload
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "提交反馈工单失败");
      }

      lastCreatedTicketId = result.id || "";
      updateSuccessLink();
      setStatus("工单已创建，我们已经记录了当前页面上下文。", "success");
      successActions.hidden = false;
      resetForm();
    } catch (error) {
      setStatus(error.message || "提交反馈工单失败", "error");
    } finally {
      submitButton.disabled = false;
      backButton.disabled = false;
      cancelButton.disabled = false;
      for (const closeButton of closeButtons) {
        closeButton.disabled = false;
      }
    }
  });

  dialog.addEventListener("close", cleanupObjectUrls);
  renderPreviews();
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
