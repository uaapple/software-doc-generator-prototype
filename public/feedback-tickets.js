const query = new URLSearchParams(window.location.search);

const state = {
  tickets: [],
  filteredTickets: [],
  search: "",
  imagesOnly: false,
  selectedTicketId: query.get("ticket") || ""
};

const pageStatus = document.querySelector("#page-status");
const refreshButton = document.querySelector("#ticket-refresh");
const searchInput = document.querySelector("#ticket-search");
const imagesOnlyInput = document.querySelector("#ticket-images-only");
const resultCount = document.querySelector("#ticket-result-count");
const ticketList = document.querySelector("#ticket-list");
const ticketDetail = document.querySelector("#ticket-detail");
const metricTotal = document.querySelector("#metric-total");
const metricToday = document.querySelector("#metric-today");
const metricImages = document.querySelector("#metric-images");
const imageDialog = document.querySelector("#image-preview-dialog");
const imagePreviewTarget = document.querySelector("#image-preview-target");
const imagePreviewTitle = document.querySelector("#image-preview-title");
const imagePreviewClose = document.querySelector("#image-preview-close");

refreshButton.addEventListener("click", () => bootstrap(true));
searchInput.addEventListener("input", () => {
  state.search = searchInput.value.trim();
  applyFilters();
});
imagesOnlyInput.addEventListener("change", () => {
  state.imagesOnly = imagesOnlyInput.checked;
  applyFilters();
});
ticketList.addEventListener("click", handleTicketSelection);
ticketDetail.addEventListener("click", handleAttachmentPreview);
imagePreviewClose.addEventListener("click", () => imageDialog.close());
imageDialog.addEventListener("click", (event) => {
  if (event.target === imageDialog) {
    imageDialog.close();
  }
});

await bootstrap(false);

async function bootstrap(force = false) {
  try {
    setStatus(force ? "正在刷新反馈工单..." : "正在加载反馈工单...");
    state.tickets = await request("/api/feedback-tickets");
    renderMetrics();
    applyFilters();
    setStatus(state.tickets.length ? `已加载 ${state.tickets.length} 条反馈工单。` : "当前还没有反馈工单。");
  } catch (error) {
    state.tickets = [];
    state.filteredTickets = [];
    renderMetrics();
    renderList();
    renderDetail();
    setStatus(`加载反馈工单失败：${error.message}`, true);
  }
}

function applyFilters() {
  const keyword = state.search.trim().toLowerCase();
  state.filteredTickets = state.tickets.filter((ticket) => {
    if (state.imagesOnly && !hasImages(ticket)) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return [ticket.title, ticket.detail, ticket.pageTitle, ticket.pagePath]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  const hasSelected = state.filteredTickets.some((ticket) => ticket.id === state.selectedTicketId);
  if (!hasSelected) {
    state.selectedTicketId = state.filteredTickets[0]?.id || "";
  }

  renderList();
  renderDetail();
}

function renderMetrics() {
  metricTotal.textContent = String(state.tickets.length);
  metricToday.textContent = String(state.tickets.filter((ticket) => isToday(ticket.createdAt)).length);
  metricImages.textContent = String(state.tickets.filter((ticket) => hasImages(ticket)).length);
}

function renderList() {
  resultCount.textContent = `${state.filteredTickets.length} 条结果`;

  if (!state.tickets.length) {
    ticketList.innerHTML = `
      <div class="ticket-list-empty">
        当前还没有反馈工单。<br />
        右下角“问题反馈”按钮现在也能直接新建工单。
      </div>
    `;
    return;
  }

  if (!state.filteredTickets.length) {
    ticketList.innerHTML = `
      <div class="ticket-list-empty">
        当前筛选条件下没有找到工单。<br />
        试试清空关键字或取消“仅看带图片工单”。
      </div>
    `;
    return;
  }

  ticketList.innerHTML = state.filteredTickets
    .map((ticket) => {
      const activeClass = ticket.id === state.selectedTicketId ? "is-active" : "";
      return `
        <button type="button" class="ticket-card ${activeClass}" data-ticket-id="${escapeHtml(ticket.id)}">
          <div class="ticket-card-top">
            <div>
              <h3 class="ticket-card-title">${escapeHtml(ticket.title || "未命名工单")}</h3>
              <div class="ticket-card-source">${escapeHtml(ticket.pageTitle || ticket.pagePath || "未记录来源页面")}</div>
            </div>
            <span class="ticket-status-pill">${escapeHtml(formatStatus(ticket.status))}</span>
          </div>
          <div class="ticket-card-bottom">
            <span class="ticket-card-time">${escapeHtml(formatDateTime(ticket.updatedAt || ticket.createdAt))}</span>
            <span class="ticket-attachment-pill">${hasImages(ticket) ? `${ticket.attachments.length} 张图片` : "无图片"}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderDetail() {
  const ticket = state.filteredTickets.find((item) => item.id === state.selectedTicketId);

  if (!state.tickets.length) {
    ticketDetail.innerHTML = `
      <div class="ticket-detail-empty">
        这里会显示你提交的问题详情、来源页面和截图。<br />
        先用右下角入口创建第一条工单吧。
      </div>
    `;
    return;
  }

  if (!ticket) {
    ticketDetail.innerHTML = `
      <div class="ticket-detail-empty">
        当前没有可展示的工单。<br />
        请从左侧选择一条，或者放宽筛选条件。
      </div>
    `;
    return;
  }

  syncSelectedTicketQuery(ticket.id);
  ticketDetail.innerHTML = `
    <header class="ticket-detail-head">
      <div>
        <p class="strip-label">Selected Ticket</p>
        <h3>${escapeHtml(ticket.title || "未命名工单")}</h3>
        ${ticket.pagePath ? `<a class="ticket-detail-path" href="${escapeAttribute(ticket.pagePath)}">${escapeHtml(ticket.pageTitle || ticket.pagePath)}</a>` : ""}
      </div>
      <span class="ticket-status-pill">${escapeHtml(formatStatus(ticket.status))}</span>
    </header>

    <section class="ticket-meta-grid">
      <article class="ticket-meta-card">
        <span>创建时间</span>
        <strong>${escapeHtml(formatDateTime(ticket.createdAt))}</strong>
      </article>
      <article class="ticket-meta-card">
        <span>最近更新</span>
        <strong>${escapeHtml(formatDateTime(ticket.updatedAt || ticket.createdAt))}</strong>
      </article>
      <article class="ticket-meta-card">
        <span>来源页面</span>
        <strong>${escapeHtml(ticket.pageTitle || ticket.pagePath || "未记录")}</strong>
      </article>
    </section>

    <section class="ticket-body-card">
      <span>问题详情</span>
      <p class="ticket-detail-text">${escapeHtml(ticket.detail || "暂无详情")}</p>
    </section>

    <section class="ticket-attachments-card">
      <span>截图附件</span>
      ${
        hasImages(ticket)
          ? `
            <div class="ticket-attachment-grid">
              ${(ticket.attachments || [])
                .map(
                  (attachment) => `
                    <article class="ticket-attachment">
                      <button
                        type="button"
                        class="ticket-attachment-preview"
                        data-preview-url="${escapeAttribute(attachment.url || "")}"
                        data-preview-title="${escapeAttribute(attachment.originalName || ticket.title || "截图预览")}"
                      >
                        <img src="${escapeAttribute(attachment.url || "")}" alt="${escapeAttribute(attachment.originalName || "反馈截图")}" />
                      </button>
                      <div class="ticket-attachment-meta">
                        <span>Attachment</span>
                        <strong>${escapeHtml(attachment.originalName || attachment.storedName || "未命名图片")}</strong>
                        <p>${escapeHtml(formatFileSize(attachment.size))}</p>
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : `<div class="ticket-detail-empty">这条工单没有上传图片。</div>`
      }
    </section>
  `;
}

function handleTicketSelection(event) {
  const button = event.target.closest("[data-ticket-id]");
  if (!button) {
    return;
  }

  state.selectedTicketId = button.dataset.ticketId || "";
  renderList();
  renderDetail();
}

function handleAttachmentPreview(event) {
  const previewButton = event.target.closest("[data-preview-url]");
  if (!previewButton) {
    return;
  }

  const previewUrl = previewButton.dataset.previewUrl || "";
  if (!previewUrl) {
    return;
  }

  imagePreviewTarget.src = previewUrl;
  imagePreviewTarget.alt = previewButton.dataset.previewTitle || "截图预览";
  imagePreviewTitle.textContent = previewButton.dataset.previewTitle || "截图预览";
  imageDialog.showModal();
}

function hasImages(ticket) {
  return Array.isArray(ticket.attachments) && ticket.attachments.length > 0;
}

function isToday(value) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function syncSelectedTicketQuery(ticketId) {
  const nextQuery = new URLSearchParams(window.location.search);
  if (ticketId) {
    nextQuery.set("ticket", ticketId);
  } else {
    nextQuery.delete("ticket");
  }
  const nextUrl = `${window.location.pathname}${nextQuery.toString() ? `?${nextQuery.toString()}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}

function formatStatus(status) {
  if (status === "open") {
    return "OPEN";
  }
  if (!status) {
    return "UNKNOWN";
  }
  return String(status).replaceAll("_", " ").toUpperCase();
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (size <= 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(message, isError = false) {
  pageStatus.hidden = !message;
  pageStatus.textContent = message || "";
  pageStatus.classList.toggle("status-busy", !isError && Boolean(message));
  pageStatus.classList.toggle("status-error", isError);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value);
}
