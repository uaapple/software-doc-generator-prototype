const configSummary = document.querySelector("#config-summary");
const configGrid = document.querySelector("#config-grid");
const refreshConfigBtn = document.querySelector("#refresh-config-btn");
const healthBtn = document.querySelector("#health-btn");
const uploadBtn = document.querySelector("#upload-btn");
const hermesBtn = document.querySelector("#hermes-btn");
const artifactBtn = document.querySelector("#artifact-btn");
const retainUpload = document.querySelector("#retain-upload");
const probeSource = document.querySelector("#probe-source");

refreshConfigBtn?.addEventListener("click", loadConfig);
healthBtn?.addEventListener("click", runHealthCheck);
uploadBtn?.addEventListener("click", runUploadProbe);
hermesBtn?.addEventListener("click", runHermesProbe);
artifactBtn?.addEventListener("click", loadLatestArtifact);

await loadConfig();

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body;
}

async function loadConfig() {
  setStatus("config", "正在读取配置。");
  try {
    const config = await requestJson("/api/windows-worker-debug/config");
    configSummary.textContent = "远程地址来自当前后端环境变量。token 只显示是否已配置。";
    configGrid.innerHTML = [
      ["Hermes Agent", config.hermes?.baseURL || "-"],
      ["Hermes API 模式", config.hermes?.apiMode || "-"],
      ["Hermes token", config.hermes?.authConfigured ? "已配置" : "未配置"],
      ["MATLAB Worker", config.matlabWorker?.baseURL || "-"],
      ["MATLAB HTTP 模式", config.matlabWorker?.httpMode || "-"],
      ["MATLAB token", config.matlabWorker?.authConfigured ? "已配置" : "未配置"]
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  } catch (error) {
    configSummary.textContent = error.message || "读取配置失败";
  }
}

async function runHealthCheck() {
  await runStep({
    button: healthBtn,
    statusId: "health",
    resultId: "health-result",
    started: "正在检查远程 Worker 连接。",
    request: () => requestJson("/api/windows-worker-debug/health", {
      method: "POST",
      body: JSON.stringify({ timeoutMs: 10000 })
    }),
    summarize: (data) => {
      const hermes = data.checks?.hermes;
      const matlab = data.checks?.matlabWorker;
      return [
        `Hermes Agent: ${formatCheck(hermes)}`,
        `MATLAB Worker: ${formatCheck(matlab)}`
      ].join("<br>");
    }
  });
}

async function runUploadProbe() {
  await runStep({
    button: uploadBtn,
    statusId: "upload",
    resultId: "upload-result",
    started: "正在上传 probe 文件。",
    request: () => requestJson("/api/windows-worker-debug/upload-probe", {
      method: "POST",
      body: JSON.stringify({
        timeoutMs: 60000,
        retainUploadedFiles: Boolean(retainUpload?.checked)
      })
    }),
    summarize: (data) => {
      const artifact = data.artifact || {};
      const file = artifact.file || {};
      return [
        `Probe: ${escapeHtml(data.probeId || "-")}`,
        `Windows 路径: ${escapeHtml(artifact.receivedPath || "-")}`,
        `文件存在: ${file.exists ? "是" : "否"}`,
        `内容匹配: ${file.contentMatches ? "是" : "否"}`,
        `保留文件: ${data.retainedOnWindows ? "是" : "否"}`
      ].join("<br>");
    }
  });
}

async function runHermesProbe() {
  await runStep({
    button: hermesBtn,
    statusId: "hermes",
    resultId: "hermes-result",
    started: "正在调度 Hermes Agent。",
    request: () => requestJson("/api/windows-worker-debug/hermes-probe", {
      method: "POST",
      body: JSON.stringify({
        timeoutMs: 60000,
        sourceText: probeSource?.value || ""
      })
    }),
    summarize: (data) => {
      const artifact = data.artifact || {};
      return [
        `Probe: ${escapeHtml(data.probeId || "-")}`,
        `标题: ${escapeHtml(artifact.title || "-")}`,
        `摘要: ${escapeHtml(artifact.summary || "-")}`,
        `Markdown 长度: ${String(artifact.markdown || "").length}`
      ].join("<br>");
    },
    after: async () => {
      await loadLatestArtifact({ quiet: true });
    }
  });
}

async function loadLatestArtifact(options = {}) {
  await runStep({
    button: artifactBtn,
    statusId: "artifact",
    resultId: "artifact-result",
    started: options.quiet ? "" : "正在读取最近产物。",
    request: () => requestJson("/api/windows-worker-debug/latest-artifact"),
    summarize: (data) => renderArtifactPreview(data.record),
    quiet: options.quiet
  });
}

async function runStep({ button, statusId, resultId, started, request, summarize, after, quiet = false }) {
  const resultRoot = document.querySelector(`#${resultId}`);
  button.disabled = true;
  if (started) {
    setStatus(statusId, started);
  }
  try {
    const data = await request();
    const summary = summarize ? summarize(data) : "";
    setStatus(statusId, data.ok === false ? "完成，但远程检查未全部通过。" : "完成。", data.ok === false ? "warn" : "ok");
    resultRoot.innerHTML = `${summary ? `<div class="debug-summary">${summary}</div>` : ""}<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    if (after) {
      await after(data);
    }
  } catch (error) {
    setStatus(statusId, error.message || "执行失败。", "error");
    resultRoot.innerHTML = `<pre>${escapeHtml(error.stack || error.message || String(error))}</pre>`;
  } finally {
    button.disabled = false;
  }
  if (quiet) {
    document.querySelector(`#${statusId}-status`).textContent = "";
  }
}

function renderArtifactPreview(record) {
  const preview = document.querySelector("#artifact-preview");
  if (!record) {
    preview.innerHTML = '<div class="empty-state">暂无 artifact。</div>';
    return "暂无最近产物。";
  }
  const artifact = record.artifact || {};
  const markdown = artifact.markdown || "";
  preview.innerHTML = `
    <div class="debug-summary">
      <strong>${escapeHtml(record.type || "artifact")}</strong>
      <span>${escapeHtml(record.savedAt || "")}</span>
    </div>
    ${markdown ? `<pre>${escapeHtml(markdown)}</pre>` : `<pre>${escapeHtml(JSON.stringify(artifact, null, 2))}</pre>`}
  `;
  return `已读取最近产物：${escapeHtml(record.type || "artifact")}`;
}

function formatCheck(check) {
  if (!check) {
    return "无响应";
  }
  const label = check.ok ? "OK" : "失败";
  const detail = check.body?.service || check.error || `HTTP ${check.status}`;
  return `${label} (${escapeHtml(detail)}, ${check.elapsedMs || 0}ms)`;
}

function setStatus(id, text, tone = "") {
  const target = id === "config" ? configSummary : document.querySelector(`#${id}-status`);
  if (!target) return;
  target.textContent = text;
  target.className = id === "config" ? "" : `status ${tone ? `debug-status-${tone}` : ""}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
