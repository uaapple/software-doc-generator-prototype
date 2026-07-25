import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { getProjectPath, readJson, resolveStoredFilePath, writeJson } from "./storage.js";
import { RejectionService } from "./rejection-service.js";
import { normalizeUploadedFileName } from "./upload-filename.js";

function now() {
  return new Date().toISOString();
}

function isInterruptedTaskAfterRestart(task = {}) {
  if (task.status !== "running" && task.status !== "queued") return false;
  const reference = task.progress?.updatedAt || task.updatedAt || task.createdAt || "";
  const timestamp = new Date(reference).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp > 30 * 60 * 1000;
}

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function getDocumentTypeLabel(documentType) {
  if (documentType === "detail_design") return "\u8be6\u7ec6\u8bbe\u8ba1";
  if (documentType === "hil_test_case") return "HIL \u7528\u4f8b";
  return "\u8f6f\u4ef6\u9700\u6c42";
}

function getGenerationActionLabel(documentType) {
  if (documentType === "detail_design") return "details_generated";
  if (documentType === "hil_test_case") return "hil_cases_generated";
  return "requirements_generated";
}

function normalizeDomain(value) {
  return String(value || "").trim() || "embedded_vcu";
}

function normalizeModuleSkillKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeSkillInitMode(value = "") {
  const normalized = String(value || "").trim();
  if (normalized === "import_existing") return "import_existing";
  if (normalized === "cold_start") return "cold_start";
  return "";
}

function normalizeTaskKind(value = "") {
  return String(value || "").trim() === "module_skill_bootstrap" ? "module_skill_bootstrap" : "generation";
}

function normalizeTaskManualTitleOutline(value = {}) {
  const candidate =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (_error) {
            return null;
          }
        })()
      : value;

  const normalizedSections = [];
  for (const section of Array.isArray(candidate?.sections) ? candidate.sections : []) {
    const sectionTitle = String(section?.sectionTitle || section?.title || "").trim();
    if (!sectionTitle) {
      continue;
    }

    const items = [];
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      const itemTitle = String(item?.itemTitle || item?.title || "").trim();
      if (!itemTitle) {
        continue;
      }
      items.push({ itemTitle });
    }

    if (items.length) {
      normalizedSections.push({
        sectionTitle,
        items
      });
    }
  }

  if (!normalizedSections.length) {
    return null;
  }

  return {
    sections: normalizedSections
  };
}

function normalizeReasonTags(reasonTags) {
  if (Array.isArray(reasonTags)) {
    return reasonTags.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof reasonTags === "string") {
    return reasonTags.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTargetArea(value = "") {
  const normalized = String(value || "").trim();
  return ["writing", "extraction", "validation", "examples", "domain_knowledge"].includes(normalized) ? normalized : "";
}

function createEmptyDocumentSpace(documentType) {
  return {
    documentType: normalizeDocumentType(documentType),
    generationTasks: [],
    acceptedItems: []
  };
}

function normalizeDocumentExtractionType(value) {
  if (value === "system_requirement") return "system_requirement";
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function getDocumentExtractionTypeLabel(documentType) {
  if (documentType === "system_requirement") return "系统需求";
  if (documentType === "detail_design") return "详细设计";
  if (documentType === "hil_test_case") return "HIL测试用例";
  return "软件需求";
}

function getExtractedAssetRole(documentType) {
  if (documentType === "system_requirement") return "extracted_system_requirement";
  if (documentType === "detail_design") return "extracted_detail_design";
  if (documentType === "hil_test_case") return "extracted_hil_test_case";
  return "extracted_software_requirement";
}

function ensureDocumentSpaces(documentSpaces = {}) {
  return {
    software_requirement:
      documentSpaces.software_requirement || createEmptyDocumentSpace("software_requirement"),
    detail_design: documentSpaces.detail_design || createEmptyDocumentSpace("detail_design"),
    hil_test_case: documentSpaces.hil_test_case || createEmptyDocumentSpace("hil_test_case")
  };
}

function buildFileRecord(projectId, moduleId, file, role) {
  return {
    id: randomUUID(),
    role,
    originalName: normalizeUploadedFileName(file.originalname),
    storedName: file.filename,
    relativePath: moduleId ? path.join(projectId, moduleId, file.filename) : path.join(projectId, file.filename),
    absolutePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: now()
  };
}

function toSafeStoredName(fileName = "") {
  return String(fileName || "").replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
}

function formatAssetTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildExtractedAssetBaseName(moduleName, documentType) {
  return `${String(moduleName || "").trim() || "未命名模块"}-${getDocumentExtractionTypeLabel(documentType)}.md`;
}

function createGeneratedModuleAssetRecord(projectId, moduleId, fileName, role) {
  const storedName = toSafeStoredName(fileName);
  const relativePath = path.join(projectId, moduleId, storedName);
  return {
    id: randomUUID(),
    role,
    originalName: fileName,
    storedName,
    relativePath,
    absolutePath: path.join(config.uploadDir, relativePath),
    mimeType: "text/markdown",
    size: 0,
    uploadedAt: now()
  };
}

function createModuleRecord(projectId, input = {}) {
  const importedSkillKey = normalizeModuleSkillKey(input.importedSkillKey || "");
  const skillInitMode = Object.hasOwn(input, "skillInitMode")
    ? normalizeSkillInitMode(input.skillInitMode)
    : importedSkillKey
      ? "import_existing"
      : "";
  return {
    id: randomUUID(),
    projectId,
    name: input.name?.trim() || "未命名功能模块",
    description: input.description?.trim() || "",
    domain: normalizeDomain(input.domain),
    moduleSkillKey: normalizeModuleSkillKey(importedSkillKey || input.moduleSkillKey || input.name),
    skillInitMode,
    skillStatus: input.skillStatus || (importedSkillKey ? "imported" : "draft"),
    skillSource: input.skillSource || (importedSkillKey ? { type: "module_profile", key: importedSkillKey } : null),
    seededAt: input.seededAt || null,
    assets: [],
    documentSpaces: ensureDocumentSpaces(),
    documentExtractionTasks: [],
    slxParserTasks: [],
    slxInterpreterSessions: [],
    auditLog: [
      {
        at: now(),
        action: "module_created",
        detail: "功能模块已创建"
      }
    ],
    createdAt: now(),
    updatedAt: now()
  };
}

function normalizeTask(task = {}) {
  const progress = normalizeTaskProgress(task.progress);
  const timeline = normalizeTaskTimeline(task.timeline);
  return {
    id: task.id || randomUUID(),
    moduleId: task.moduleId || "",
    documentType: normalizeDocumentType(task.documentType),
    taskKind: normalizeTaskKind(task.taskKind),
    status: task.status || "completed",
    createdAt: task.createdAt || now(),
    updatedAt: task.updatedAt || task.createdAt || now(),
    inputAssetIds: Array.isArray(task.inputAssetIds) ? task.inputAssetIds : [],
    uploadedAssetIds: Array.isArray(task.uploadedAssetIds) ? task.uploadedAssetIds : [],
    manualTitleOutline: normalizeTaskManualTitleOutline(task.manualTitleOutline),
    generationMode: String(task.generationMode || "").trim(),
    resultMarkdown: normalizeDebugText(task.resultMarkdown || "", 200000),
    resultMarkdownArtifact: normalizeTaskMarkdownArtifact(task.resultMarkdownArtifact),
    skillVersion: normalizeSkillVersionRef(task.skillVersion),
    resultItems: Array.isArray(task.resultItems) ? task.resultItems.map(normalizeTaskResultItem) : [],
    extractions: Array.isArray(task.extractions) ? task.extractions : [],
    traces: Array.isArray(task.traces) ? task.traces : [],
    conflicts: Array.isArray(task.conflicts) ? task.conflicts : [],
    llmProfile: task.llmProfile || null,
    summary: task.summary || "",
    auditLog: Array.isArray(task.auditLog) ? task.auditLog : [],
    progress,
    timeline,
    metrics: normalizeTaskMetrics(task.metrics),
    debug: normalizeTaskDebug(task.debug),
    errorMessage: String(task.errorMessage || "").trim()
  };
}

function normalizeSkillVersionRef(ref = {}) {
  if (!ref || typeof ref !== "object") {
    return null;
  }
  const bundleId = String(ref.bundleId || ref.id || "").trim();
  if (!bundleId) {
    return null;
  }
  return {
    bundleId,
    baseBundleId: String(ref.baseBundleId || "").trim(),
    version: String(ref.version || "").trim(),
    status: String(ref.status || "").trim(),
    snapshotHash: String(ref.snapshotHash || "").trim(),
    ruleIndexVersion: String(ref.ruleIndexVersion || "").trim(),
    sqliteSnapshotPath: String(ref.sqliteSnapshotPath || "").trim()
  };
}

function normalizeTaskResultItem(item = {}) {
  const nextItemTitle = String(item?.itemTitle || item?.title || "").trim();
  const nextTitle = String(item?.title || item?.itemTitle || "").trim();
  return {
    ...item,
    id: item.id || randomUUID(),
    sectionTitle: String(item?.sectionTitle || "").trim(),
    itemTitle: nextItemTitle,
    title: nextTitle || nextItemTitle
  };
}

function normalizeTaskProgress(progress = {}) {
  return {
    stage: String(progress?.stage || "").trim(),
    label: String(progress?.label || "").trim(),
    message: String(progress?.message || "").trim(),
    percent: Math.max(0, Math.min(100, Number(progress?.percent || 0) || 0)),
    current: Math.max(0, Number(progress?.current || 0) || 0),
    total: Math.max(0, Number(progress?.total || 0) || 0),
    updatedAt: progress?.updatedAt || ""
  };
}

function normalizeTaskTimeline(timeline = []) {
  return Array.isArray(timeline)
    ? timeline
        .map((entry) => ({
          at: entry?.at || now(),
          stage: String(entry?.stage || "").trim(),
          label: String(entry?.label || "").trim(),
          message: String(entry?.message || "").trim(),
          level: String(entry?.level || "info").trim() || "info"
        }))
        .filter((entry) => entry.message)
        .slice(-24)
    : [];
}

function normalizeTaskMetrics(metrics = {}) {
  return {
    extractionFileCount: Math.max(0, Number(metrics?.extractionFileCount || 0) || 0),
    extractionEvidenceCount: Math.max(0, Number(metrics?.extractionEvidenceCount || 0) || 0),
    llmDurationMs: Math.max(0, Number(metrics?.llmDurationMs || 0) || 0),
    generatedItemCount: Math.max(0, Number(metrics?.generatedItemCount || 0) || 0),
    conflictCount: Math.max(0, Number(metrics?.conflictCount || 0) || 0)
  };
}

function normalizeTaskMarkdownArtifact(artifact = {}) {
  if (!artifact || typeof artifact !== "object") {
    return null;
  }
  const markdownPath = String(artifact.markdownPath || "").trim();
  const absoluteMarkdownPath = String(artifact.absoluteMarkdownPath || "").trim();
  const workspaceDir = String(artifact.workspaceDir || "").trim();
  const manifestPath = String(artifact.manifestPath || "").trim();
  const taskBriefPath = String(artifact.taskBriefPath || "").trim();
  const promptPath = String(artifact.promptPath || "").trim();
  const hasArtifact = markdownPath || absoluteMarkdownPath || workspaceDir || manifestPath || taskBriefPath || promptPath;
  if (!hasArtifact) {
    return null;
  }
  return {
    workspaceDir: normalizeDebugText(workspaceDir, 4000),
    manifestPath: normalizeDebugText(manifestPath, 4000),
    taskBriefPath: normalizeDebugText(taskBriefPath, 4000),
    promptPath: normalizeDebugText(promptPath, 4000),
    markdownPath: normalizeDebugText(markdownPath, 1000),
    absoluteMarkdownPath: normalizeDebugText(absoluteMarkdownPath, 4000),
    itemCount: Math.max(0, Number(artifact.itemCount || 0) || 0),
    summary: normalizeDebugText(artifact.summary || "", 2000),
    inputFiles: Array.isArray(artifact.inputFiles)
      ? artifact.inputFiles
          .map((item) => ({
            assetId: String(item?.assetId || "").trim(),
            originalName: String(item?.originalName || "").trim(),
            fileName: String(item?.fileName || "").trim(),
            role: String(item?.role || "").trim(),
            relativePath: String(item?.relativePath || "").trim(),
            isSystemRequirement: Boolean(item?.isSystemRequirement),
            isSlx: Boolean(item?.isSlx)
          }))
          .slice(0, 200)
      : []
  };
}

function normalizeDebugText(value, maxLength = 200000) {
  const text = typeof value === "string" ? value : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeTaskDebugEvent(event = {}) {
  return {
    at: event?.at || now(),
    stage: String(event?.stage || "").trim(),
    label: String(event?.label || "").trim(),
    message: String(event?.message || "").trim(),
    level: String(event?.level || "info").trim() || "info",
    type: String(event?.type || "").trim(),
    status: String(event?.status || "").trim(),
    transport: String(event?.transport || "").trim(),
    stepType: String(event?.stepType || "").trim(),
    sessionId: String(event?.sessionId || "").trim(),
    startedAt: String(event?.startedAt || "").trim(),
    heartbeatAt: String(event?.heartbeatAt || "").trim(),
    elapsedMs: Math.max(0, Number(event?.elapsedMs || 0) || 0),
    tokenUsage: event?.tokenUsage && typeof event.tokenUsage === "object"
      ? {
          model: String(event.tokenUsage.model || "").trim(),
          inputTokens: Math.max(0, Number(event.tokenUsage.inputTokens || 0) || 0),
          outputTokens: Math.max(0, Number(event.tokenUsage.outputTokens || 0) || 0),
          cacheReadTokens: Math.max(0, Number(event.tokenUsage.cacheReadTokens || 0) || 0),
          cacheWriteTokens: Math.max(0, Number(event.tokenUsage.cacheWriteTokens || 0) || 0),
          reasoningTokens: Math.max(0, Number(event.tokenUsage.reasoningTokens || 0) || 0),
          totalTokens: Math.max(0, Number(event.tokenUsage.totalTokens || 0) || 0),
          estimatedCostUsd: Number.isFinite(Number(event.tokenUsage.estimatedCostUsd))
            ? Number(event.tokenUsage.estimatedCostUsd)
            : null,
          actualCostUsd: Number.isFinite(Number(event.tokenUsage.actualCostUsd))
            ? Number(event.tokenUsage.actualCostUsd)
            : null,
          costStatus: String(event.tokenUsage.costStatus || "").trim(),
          contextTokens: Math.max(0, Number(event.tokenUsage.contextTokens || 0) || 0),
          contextLength: Math.max(0, Number(event.tokenUsage.contextLength || 0) || 0),
          contextPercent: event.tokenUsage.contextPercent == null
            ? null
            : Math.max(0, Math.min(100, Number(event.tokenUsage.contextPercent || 0) || 0))
        }
      : null,
    stdoutExcerpt: normalizeDebugText(event?.stdoutExcerpt || "", 4000),
    stderrExcerpt: normalizeDebugText(event?.stderrExcerpt || "", 4000)
  };
}

function normalizeTaskDebug(debug = {}) {
  const llm = debug?.llm || {};
  const postProcess = debug?.postProcess || {};
  const agent = debug?.agent || {};
  const artifacts = debug?.artifacts || {};
  const lastError = debug?.lastError && typeof debug.lastError === "object"
    ? {
        at: debug.lastError.at || "",
        stage: String(debug.lastError.stage || "").trim(),
        message: String(debug.lastError.message || "").trim(),
        stack: normalizeDebugText(debug.lastError.stack || "", 40000)
      }
    : null;

  return {
    updatedAt: debug?.updatedAt || "",
    llm: {
      requestModel: String(llm.requestModel || "").trim(),
      requestProvider: String(llm.requestProvider || "").trim(),
      rawResponseText: normalizeDebugText(llm.rawResponseText || "", 200000),
      rawResponseLength: Math.max(0, Number(llm.rawResponseLength || 0) || 0),
      rawResponseTruncated: Boolean(llm.rawResponseTruncated),
      parsedTopLevelKeys: Array.isArray(llm.parsedTopLevelKeys)
        ? llm.parsedTopLevelKeys.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40)
        : [],
      rawItemCount: Math.max(0, Number(llm.rawItemCount || 0) || 0)
    },
    postProcess: {
      lastStage: String(postProcess.lastStage || "").trim(),
      normalizeResultItemsMs: Math.max(0, Number(postProcess.normalizeResultItemsMs || 0) || 0),
      applyPoliciesMs: Math.max(0, Number(postProcess.applyPoliciesMs || 0) || 0),
      validationMs: Math.max(0, Number(postProcess.validationMs || 0) || 0),
      saveMs: Math.max(0, Number(postProcess.saveMs || 0) || 0),
      totalAfterModelMs: Math.max(0, Number(postProcess.totalAfterModelMs || 0) || 0)
    },
    agent: {
      transport: String(agent.transport || "").trim(),
      currentStep: String(agent.currentStep || "").trim(),
      status: String(agent.status || "").trim(),
      startedAt: String(agent.startedAt || "").trim(),
      lastHeartbeatAt: String(agent.lastHeartbeatAt || "").trim(),
      lastEventAt: String(agent.lastEventAt || "").trim(),
      sessionId: String(agent.sessionId || "").trim(),
      stdoutExcerpt: normalizeDebugText(agent.stdoutExcerpt || "", 4000),
      stderrExcerpt: normalizeDebugText(agent.stderrExcerpt || "", 4000),
      elapsedMs: Math.max(0, Number(agent.elapsedMs || 0) || 0),
      tokenUsage: agent.tokenUsage && typeof agent.tokenUsage === "object"
        ? {
            model: String(agent.tokenUsage.model || "").trim(),
            inputTokens: Math.max(0, Number(agent.tokenUsage.inputTokens || 0) || 0),
            outputTokens: Math.max(0, Number(agent.tokenUsage.outputTokens || 0) || 0),
            cacheReadTokens: Math.max(0, Number(agent.tokenUsage.cacheReadTokens || 0) || 0),
            cacheWriteTokens: Math.max(0, Number(agent.tokenUsage.cacheWriteTokens || 0) || 0),
            reasoningTokens: Math.max(0, Number(agent.tokenUsage.reasoningTokens || 0) || 0),
            totalTokens: Math.max(0, Number(agent.tokenUsage.totalTokens || 0) || 0),
            estimatedCostUsd: Number.isFinite(Number(agent.tokenUsage.estimatedCostUsd))
              ? Number(agent.tokenUsage.estimatedCostUsd)
              : null,
            actualCostUsd: Number.isFinite(Number(agent.tokenUsage.actualCostUsd))
              ? Number(agent.tokenUsage.actualCostUsd)
              : null,
            costStatus: String(agent.tokenUsage.costStatus || "").trim(),
            contextTokens: Math.max(0, Number(agent.tokenUsage.contextTokens || 0) || 0),
            contextLength: Math.max(0, Number(agent.tokenUsage.contextLength || 0) || 0),
            contextPercent: agent.tokenUsage.contextPercent == null
              ? null
              : Math.max(0, Math.min(100, Number(agent.tokenUsage.contextPercent || 0) || 0))
          }
        : null
    },
    artifacts: {
      assetManifest: Array.isArray(artifacts.assetManifest)
        ? artifacts.assetManifest
            .map((item) => ({
              assetId: String(item?.assetId || "").trim(),
              fileName: String(item?.fileName || "").trim(),
              fileRole: String(item?.fileRole || "").trim(),
              absolutePath: normalizeDebugText(item?.absolutePath || "", 4000)
            }))
            .filter((item) => item.assetId || item.fileName)
            .slice(0, 200)
        : [],
      anchors: Array.isArray(artifacts.anchors)
        ? artifacts.anchors
            .map((item) => ({
              anchorId: String(item?.anchorId || "").trim(),
              assetId: String(item?.assetId || "").trim(),
              fileName: String(item?.fileName || "").trim(),
              fileRole: String(item?.fileRole || "").trim(),
              location: String(item?.location || "").trim(),
              anchorType: String(item?.anchorType || "").trim(),
              excerpt: normalizeDebugText(item?.excerpt || "", 2000),
              summary: normalizeDebugText(item?.summary || "", 1000),
              tags: Array.isArray(item?.tags)
                ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 20)
                : []
            }))
            .filter((item) => item.anchorId)
            .slice(0, 500)
        : [],
      taskSkillBundle: artifacts.taskSkillBundle && typeof artifacts.taskSkillBundle === "object"
        ? {
            skillBundlePath: normalizeDebugText(artifacts.taskSkillBundle.skillBundlePath || "", 4000),
            skillManifestPath: normalizeDebugText(artifacts.taskSkillBundle.skillManifestPath || "", 4000),
            recommendedSkillCodes: Array.isArray(artifacts.taskSkillBundle.recommendedSkillCodes)
              ? artifacts.taskSkillBundle.recommendedSkillCodes
                  .map((item) => String(item || "").trim())
                  .filter(Boolean)
                  .slice(0, 80)
              : [],
            effectiveSkillCount: Math.max(0, Number(artifacts.taskSkillBundle.effectiveSkillCount || 0) || 0),
            chunks: Array.isArray(artifacts.taskSkillBundle.chunks)
              ? artifacts.taskSkillBundle.chunks
                  .map((chunk) => ({
                    kind: String(chunk?.kind || "").trim(),
                    title: String(chunk?.title || "").trim(),
                    path: normalizeDebugText(chunk?.path || "", 2000),
                    itemCount: Math.max(0, Number(chunk?.itemCount || 0) || 0)
                  }))
                  .slice(0, 120)
              : []
          }
        : null
    },
    lastError,
    events: Array.isArray(debug?.events)
      ? debug.events
          .map((event) => normalizeTaskDebugEvent(event))
          .filter((event) => event.message)
          .slice(-40)
      : []
  };
}

function mergeTaskDebug(current = {}, updates = {}) {
  const merged = normalizeTaskDebug({
    ...current,
    ...updates,
    llm: {
      ...(current.llm || {}),
      ...(updates.llm || {})
    },
    postProcess: {
      ...(current.postProcess || {}),
      ...(updates.postProcess || {})
    },
    agent: {
      ...(current.agent || {}),
      ...(updates.agent || {})
    },
    artifacts: {
      ...(current.artifacts || {}),
      ...(updates.artifacts || {})
    },
    lastError: updates.lastError
      ? {
          ...(current.lastError || {}),
          ...updates.lastError
        }
      : current.lastError,
    events: Array.isArray(current.events) ? [...current.events] : []
  });
  merged.updatedAt = now();
  return merged;
}

function appendTaskDebugEvent(task, debugEvent) {
  if (!debugEvent?.message) {
    return;
  }

  const entry = normalizeTaskDebugEvent(debugEvent);
  const currentDebug = normalizeTaskDebug(task.debug);
  const lastEntry = currentDebug.events.at(-1);
  if (
    lastEntry &&
    lastEntry.stage === entry.stage &&
    lastEntry.message === entry.message &&
    lastEntry.level === entry.level
  ) {
    currentDebug.events[currentDebug.events.length - 1] = entry;
  } else {
    currentDebug.events.push(entry);
    currentDebug.events = currentDebug.events.slice(-40);
  }
  currentDebug.updatedAt = now();
  task.debug = currentDebug;
}

function appendTimelineEntry(task, timelineEntry) {
  if (!timelineEntry?.message) {
    return;
  }

  const entry = {
    at: timelineEntry.at || now(),
    stage: String(timelineEntry.stage || "").trim(),
    label: String(timelineEntry.label || "").trim(),
    message: String(timelineEntry.message || "").trim(),
    level: String(timelineEntry.level || "info").trim() || "info"
  };
  const lastEntry = task.timeline.at(-1);
  if (
    lastEntry &&
    lastEntry.stage === entry.stage &&
    lastEntry.message === entry.message &&
    lastEntry.level === entry.level
  ) {
    task.timeline[task.timeline.length - 1] = entry;
  } else {
    task.timeline.push(entry);
    task.timeline = task.timeline.slice(-24);
  }
}

function buildTaskSummary(task = {}) {
  const documentTypeLabel = getDocumentTypeLabel(task.documentType);
  const taskKind = normalizeTaskKind(task.taskKind);
  const subjectLabel = taskKind === "module_skill_bootstrap" ? `${documentTypeLabel}技能冷启动` : documentTypeLabel;
  if (task.status === "running") {
    return task.progress?.label || task.progress?.message || (taskKind === "module_skill_bootstrap" ? `正在提炼${subjectLabel}` : `正在生成${documentTypeLabel}`);
  }
  if (task.status === "failed") {
    return task.errorMessage || task.summary || `${subjectLabel}失败`;
  }
  if (task.summary) {
    return task.summary;
  }
  return taskKind === "module_skill_bootstrap" ? `${subjectLabel}任务` : `${documentTypeLabel}任务`;
}

function buildDocumentExtractionTaskSummary(task = {}) {
  const documentTypeLabel = getDocumentExtractionTypeLabel(task.targetDocumentType);
  if (task.status === "running") {
    return task.progress?.label || task.progress?.message || `正在提取${documentTypeLabel}`;
  }
  if (task.status === "failed") {
    return task.errorMessage || task.summary || `${documentTypeLabel}提取失败`;
  }
  if (task.summary) {
    return task.summary;
  }
  return `${documentTypeLabel}提取任务`;
}

function normalizeDocumentExtractionTask(task = {}) {
  return {
    id: task.id || randomUUID(),
    moduleId: task.moduleId || "",
    status: String(task.status || "completed").trim() || "completed",
    targetDocumentType: normalizeDocumentExtractionType(task.targetDocumentType),
    sourceMode: String(task.sourceMode || "text").trim() || "text",
    sourceText: typeof task.sourceText === "string" ? task.sourceText : "",
    inputArtifacts: Array.isArray(task.inputArtifacts)
      ? task.inputArtifacts.map((item) => ({
          originalName: String(item?.originalName || item?.originalname || "").trim(),
          storedName: String(item?.storedName || item?.filename || "").trim(),
          mimeType: String(item?.mimeType || item?.mimetype || "").trim(),
          size: Math.max(0, Number(item?.size || 0) || 0),
          absolutePath: String(item?.absolutePath || item?.path || "").trim(),
          relativePath: String(item?.relativePath || "").trim()
        }))
      : [],
    outputAssetId: String(task.outputAssetId || "").trim(),
    outputAssetName: String(task.outputAssetName || "").trim(),
    summary: String(task.summary || "").trim(),
    progress: normalizeTaskProgress(task.progress),
    timeline: normalizeTaskTimeline(task.timeline),
    debug: normalizeTaskDebug(task.debug),
    errorMessage: String(task.errorMessage || "").trim(),
    createdAt: task.createdAt || now(),
    updatedAt: task.updatedAt || task.createdAt || now()
  };
}

function normalizeAcceptedItem(item = {}) {
  return {
    id: item.id || randomUUID(),
    sourceTaskId: item.sourceTaskId || "",
    sourceResultItemId: item.sourceResultItemId || "",
    acceptedSnapshot: item.acceptedSnapshot || null,
    currentContent: item.currentContent || null,
    review: item.review || {
      status: "accepted",
      reviewer: "当前用户",
      comment: ""
    },
    acceptedAt: item.acceptedAt || now(),
    updatedAt: item.updatedAt || item.acceptedAt || now()
  };
}

function normalizeSlxParserTask(task = {}) {
  return {
    id: task.id || randomUUID(),
    moduleId: task.moduleId || "",
    status: String(task.status || "completed").trim() || "completed",
    inputArtifacts: Array.isArray(task.inputArtifacts)
      ? task.inputArtifacts.map((item) => ({
          originalName: String(item?.originalName || item?.originalname || "").trim(),
          storedName: String(item?.storedName || item?.filename || "").trim(),
          mimeType: String(item?.mimeType || item?.mimetype || "").trim(),
          size: Math.max(0, Number(item?.size || 0) || 0),
          absolutePath: String(item?.absolutePath || item?.path || "").trim(),
          relativePath: String(item?.relativePath || "").trim()
        }))
      : [],
    outputAssetId: String(task.outputAssetId || "").trim(),
    outputAssetName: String(task.outputAssetName || "").trim(),
    summary: String(task.summary || "").trim(),
    progress: normalizeTaskProgress(task.progress),
    timeline: normalizeTaskTimeline(task.timeline),
    debug: normalizeTaskDebug(task.debug),
    errorMessage: String(task.errorMessage || "").trim(),
    createdAt: task.createdAt || now(),
    updatedAt: task.updatedAt || task.createdAt || now()
  };
}

function isSlxModelAsset(asset = {}) {
  const role = String(asset.role || "").trim();
  const originalName = String(asset.originalName || asset.fileName || "").trim().toLowerCase();
  return role === "simulink_slx" || originalName.endsWith(".slx");
}

function toSlxModelOption(asset = {}) {
  return {
    id: String(asset.id || "").trim(),
    role: String(asset.role || "").trim(),
    originalName: String(asset.originalName || "").trim(),
    storedName: String(asset.storedName || "").trim(),
    relativePath: String(asset.relativePath || "").trim(),
    absolutePath: String(asset.absolutePath || "").trim(),
    mimeType: String(asset.mimeType || "").trim(),
    size: Math.max(0, Number(asset.size || 0) || 0),
    uploadedAt: asset.uploadedAt || ""
  };
}

function normalizeSlxInterpreterEvidenceItem(item = {}) {
  return {
    fileName: String(item?.fileName || item?.originalName || "").trim(),
    fileRole: String(item?.fileRole || item?.role || "").trim(),
    location: String(item?.location || "").trim(),
    excerpt: normalizeDebugText(item?.excerpt || "", 2000)
  };
}

function normalizeSlxInterpreterMessage(message = {}) {
  return {
    id: message.id || randomUUID(),
    role: String(message.role || "assistant").trim() === "user" ? "user" : "assistant",
    content: normalizeDebugText(message.content || "", 200000),
    status: String(message.status || "completed").trim() || "completed",
    taskId: String(message.taskId || "").trim(),
    summary: String(message.summary || "").trim(),
    question: normalizeDebugText(message.question || "", 20000),
    progress: normalizeTaskProgress(message.progress),
    timeline: normalizeTaskTimeline(message.timeline),
    evidence: Array.isArray(message.evidence)
      ? message.evidence.map(normalizeSlxInterpreterEvidenceItem).filter((item) => item.fileName || item.location || item.excerpt)
      : [],
    warnings: Array.isArray(message.warnings)
      ? message.warnings.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [],
    debug: normalizeTaskDebug(message.debug),
    errorMessage: String(message.errorMessage || "").trim(),
    createdAt: message.createdAt || now(),
    updatedAt: message.updatedAt || message.createdAt || now()
  };
}

function normalizeSlxInterpreterSession(session = {}) {
  return {
    id: session.id || randomUUID(),
    moduleId: String(session.moduleId || "").trim(),
    modelAssetId: String(session.modelAssetId || "").trim(),
    modelName: String(session.modelName || "").trim(),
    messages: Array.isArray(session.messages)
      ? session.messages.map(normalizeSlxInterpreterMessage)
      : [],
    createdAt: session.createdAt || now(),
    updatedAt: session.updatedAt || session.createdAt || now()
  };
}

function findSlxInterpreterTask(module = {}, taskId = "") {
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) return null;
  for (const session of module.slxInterpreterSessions || []) {
    const message = (session.messages || []).find((item) => item.taskId === normalizedTaskId);
    if (message) {
      return { session, message };
    }
  }
  return null;
}

function buildSlxInterpreterTaskSummary(message = {}) {
  if (message.status === "running" || message.status === "queued") {
    return message.progress?.label || message.progress?.message || "正在解释 SLX 模型";
  }
  if (message.status === "failed") {
    return message.errorMessage || message.summary || "SLX 模型解释失败";
  }
  return message.summary || "SLX 模型解释完成";
}

function buildSlxParserTaskSummary(task = {}) {
  if (task.status === "running") {
    return task.progress?.label || task.progress?.message || "正在解析 SLX 模型";
  }
  if (task.status === "failed") {
    return task.errorMessage || task.summary || "SLX 解析失败";
  }
  if (task.summary) {
    return task.summary;
  }
  return "SLX 解析任务";
}

function normalizeModule(module, projectId) {
  if (!module) {
    return createModuleRecord(projectId);
  }

  return {
    id: module.id || randomUUID(),
    projectId: module.projectId || projectId,
    name: module.name?.trim() || "未命名功能模块",
    description: module.description?.trim() || "",
    domain: normalizeDomain(module.domain),
    moduleSkillKey: normalizeModuleSkillKey(module.moduleSkillKey || module.name),
    skillInitMode: Object.hasOwn(module, "skillInitMode")
      ? normalizeSkillInitMode(module.skillInitMode)
      : module.skillSource?.type === "module_profile"
        ? "import_existing"
        : "",
    skillStatus: module.skillStatus || "draft",
    skillSource: module.skillSource || null,
    seededAt: module.seededAt || null,
    assets: Array.isArray(module.assets) ? module.assets : [],
    documentSpaces: Object.fromEntries(
      Object.entries(ensureDocumentSpaces(module.documentSpaces)).map(([key, value]) => [
        key,
        {
          documentType: normalizeDocumentType(value.documentType || key),
          generationTasks: Array.isArray(value.generationTasks) ? value.generationTasks.map(normalizeTask) : [],
          acceptedItems: Array.isArray(value.acceptedItems) ? value.acceptedItems.map(normalizeAcceptedItem) : []
        }
      ])
    ),
    documentExtractionTasks: Array.isArray(module.documentExtractionTasks)
      ? module.documentExtractionTasks.map(normalizeDocumentExtractionTask)
      : [],
    slxParserTasks: Array.isArray(module.slxParserTasks)
      ? module.slxParserTasks.map(normalizeSlxParserTask)
      : [],
    slxInterpreterSessions: Array.isArray(module.slxInterpreterSessions)
      ? module.slxInterpreterSessions.map((session) => normalizeSlxInterpreterSession({ ...session, moduleId: session.moduleId || module.id }))
      : [],
    auditLog: Array.isArray(module.auditLog) ? module.auditLog : [],
    createdAt: module.createdAt || now(),
    updatedAt: module.updatedAt || module.createdAt || now()
  };
}

function normalizeProject(project) {
  if (!project) {
    return project;
  }

  const normalized = {
    ...project,
    documentType: normalizeDocumentType(project.documentType),
    language: project.language || "zh-CN",
    templateName: project.templateName || "default-template",
    status: project.status || "draft",
    files: Array.isArray(project.files) ? project.files : [],
    extractions: Array.isArray(project.extractions) ? project.extractions : [],
    requirements: Array.isArray(project.requirements) ? project.requirements : [],
    traces: Array.isArray(project.traces) ? project.traces : [],
    conflicts: Array.isArray(project.conflicts) ? project.conflicts : [],
    lastGeneration: project.lastGeneration || null,
    auditLog: Array.isArray(project.auditLog) ? project.auditLog : [],
    modules: Array.isArray(project.modules) ? project.modules.map((module) => normalizeModule(module, project.id)) : [],
    createdAt: project.createdAt || now(),
    updatedAt: project.updatedAt || project.createdAt || now()
  };

  return normalized;
}

function touchModule(module, action, detail) {
  module.updatedAt = now();
  module.auditLog.push({
    at: module.updatedAt,
    action,
    detail
  });
}

function cloneForAcceptedSnapshot(item) {
  return JSON.parse(JSON.stringify(item));
}

export class ProjectService {
  constructor() {
    this.rejectionService = new RejectionService();
    this.generationTaskMutationQueues = new Map();
  }

  enqueueGenerationTaskMutation(taskKey, mutation) {
    const key = String(taskKey || "").trim();
    const runner = typeof mutation === "function" ? mutation : async () => null;
    if (!key) {
      return runner();
    }

    const previous = this.generationTaskMutationQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(() => runner());
    this.generationTaskMutationQueues.set(key, current);
    current.finally(() => {
      if (this.generationTaskMutationQueues.get(key) === current) {
        this.generationTaskMutationQueues.delete(key);
      }
    });
    return current;
  }

  async listProjects() {
    const names = await fs.readdir(config.projectStoreDir);
    const projects = await Promise.all(
      names.filter((name) => name.endsWith(".json")).map(async (name) => normalizeProject(await readJson(path.join(config.projectStoreDir, name))))
    );

    return projects.filter(Boolean).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async recoverStaleGenerationTasks() {
    const projects = await this.listProjects();
    let recoveredCount = 0;

    for (const project of projects) {
      let changed = false;
      for (const module of project.modules || []) {
        for (const space of Object.values(module.documentSpaces || {})) {
          for (const task of space.generationTasks || []) {
            if (!isInterruptedTaskAfterRestart(task)) {
              continue;
            }
            const previousStatus = task.status;
            task.status = "failed";
            task.errorMessage = previousStatus === "queued"
              ? "任务在服务重启后仍处于排队状态，请重新发起。"
              : "任务在服务重启或中断后未恢复，已标记为失败。";
            task.progress = normalizeTaskProgress({
              ...task.progress,
              stage: "failed",
              label: "任务已中断",
              message: task.errorMessage,
              percent: 100,
              updatedAt: now()
            });
            appendTimelineEntry(task, {
              at: now(),
              stage: "failed",
              label: "任务已中断",
              message: task.errorMessage,
              level: "error"
            });
            task.summary = task.errorMessage;
            task.updatedAt = now();
            recoveredCount += 1;
            changed = true;
          }
        }
        for (const task of module.documentExtractionTasks || []) {
          if (!isInterruptedTaskAfterRestart(task)) {
            continue;
          }
          const previousStatus = task.status;
          task.status = "failed";
          task.errorMessage = previousStatus === "queued"
            ? "任务在服务重启后仍处于排队状态，请重新发起。"
            : "任务在服务重启或中断后未恢复，已标记为失败。";
          task.progress = normalizeTaskProgress({
            ...task.progress,
            stage: "failed",
            label: "任务已中断",
            message: task.errorMessage,
            percent: 100,
            updatedAt: now()
          });
          appendTimelineEntry(task, {
            at: now(),
            stage: "failed",
            label: "任务已中断",
            message: task.errorMessage,
            level: "error"
          });
          task.summary = task.errorMessage;
          task.updatedAt = now();
          recoveredCount += 1;
          changed = true;
        }
        for (const task of module.slxParserTasks || []) {
          if (!isInterruptedTaskAfterRestart(task)) {
            continue;
          }
          const previousStatus = task.status;
          task.status = "failed";
          task.errorMessage = previousStatus === "queued"
            ? "SLX 解析任务在服务重启后仍处于排队状态，请重新发起。"
            : "SLX 解析任务在服务重启或中断后未恢复，已标记为失败。";
          task.progress = normalizeTaskProgress({
            ...task.progress,
            stage: "failed",
            label: "任务已中断",
            message: task.errorMessage,
            percent: 100,
            updatedAt: now()
          });
          appendTimelineEntry(task, {
            at: now(),
            stage: "failed",
            label: "任务已中断",
            message: task.errorMessage,
            level: "error"
          });
          task.summary = task.errorMessage;
          task.updatedAt = now();
          recoveredCount += 1;
          changed = true;
        }
        for (const session of module.slxInterpreterSessions || []) {
          for (const message of session.messages || []) {
            if (!isInterruptedTaskAfterRestart(message)) {
              continue;
            }
            const previousStatus = message.status;
            message.status = "failed";
            message.errorMessage = previousStatus === "queued"
              ? "SLX 解释任务在服务重启后仍处于排队状态，请重新发起。"
              : "SLX 解释任务在服务重启或中断后未恢复，已标记为失败。";
            message.progress = normalizeTaskProgress({
              ...message.progress,
              stage: "failed",
              label: "任务已中断",
              message: message.errorMessage,
              percent: 100,
              updatedAt: now()
            });
            appendTimelineEntry(message, {
              at: now(),
              stage: "failed",
              label: "任务已中断",
              message: message.errorMessage,
              level: "error"
            });
            message.summary = message.errorMessage;
            message.updatedAt = now();
            session.updatedAt = now();
            recoveredCount += 1;
            changed = true;
          }
        }
      }
      if (changed) {
        await this.saveProject(project);
      }
    }

    return { recoveredCount };
  }

  async createProject(input) {
    const project = normalizeProject({
      id: randomUUID(),
      name: input.name?.trim() || "未命名工程",
      description: input.description?.trim() || "",
      documentType: normalizeDocumentType(input.documentType),
      language: input.language || "zh-CN",
      templateName: input.templateName || "default-template",
      status: "draft",
      files: [],
      extractions: [],
      requirements: [],
      traces: [],
      conflicts: [],
      lastGeneration: null,
      modules: [],
      auditLog: [
        {
          at: now(),
          action: "project_created",
          detail: "工程已创建"
        }
      ],
      createdAt: now(),
      updatedAt: now()
    });

    await writeJson(getProjectPath(project.id), project);
    return project;
  }

  async getProject(projectId) {
    return normalizeProject(await readJson(getProjectPath(projectId)));
  }

  async saveProject(project) {
    const normalized = normalizeProject(project);
    normalized.updatedAt = now();
    await writeJson(getProjectPath(normalized.id), normalized);
    return normalized;
  }

  async updateProject(projectId, input = {}) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (typeof input.name === "string" && input.name.trim()) {
      project.name = input.name.trim();
    }
    if (Object.hasOwn(input, "description")) {
      project.description = String(input.description || "").trim();
    }
    if (Object.hasOwn(input, "status") && input.status) {
      project.status = input.status;
    }

    project.auditLog.push({
      at: now(),
      action: "project_updated",
      detail: "工程信息已更新"
    });
    return this.saveProject(project);
  }

  async deleteProject(projectId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await Promise.all([
      fs.rm(getProjectPath(projectId), { force: true }),
      fs.rm(path.join(config.uploadDir, projectId), { recursive: true, force: true })
    ]);

    return { id: projectId, deleted: true };
  }

  async createModule(projectId, input = {}) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const module = createModuleRecord(project.id, input);
    project.modules.push(module);
    project.auditLog.push({
      at: now(),
      action: "module_created",
      detail: `已创建功能模块：${module.name}`
    });
    await this.saveProject(project);
    return module;
  }

  async updateModule(projectId, moduleId, input = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    module.name = input.name?.trim() || module.name;
    module.description = input.description?.trim() || "";
    module.domain = normalizeDomain(input.domain || module.domain);
    module.moduleSkillKey = normalizeModuleSkillKey(input.importedSkillKey || input.moduleSkillKey || module.moduleSkillKey || module.name);
    if (Object.hasOwn(input, "skillInitMode")) {
      module.skillInitMode = normalizeSkillInitMode(input.skillInitMode || module.skillInitMode);
    }
    if (Object.hasOwn(input, "skillStatus")) {
      module.skillStatus = input.skillStatus || module.skillStatus || "draft";
    }
    if (Object.hasOwn(input, "skillSource")) {
      module.skillSource = input.skillSource || null;
    }
    if (Object.hasOwn(input, "seededAt")) {
      module.seededAt = input.seededAt || null;
    }
    touchModule(module, "module_updated", "功能模块信息已更新");
    await this.saveProject(project);
    return module;
  }

  async deleteModule(projectId, moduleId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const moduleIndex = project.modules.findIndex((item) => item.id === moduleId);
    if (moduleIndex === -1) {
      throw new Error("Module not found");
    }

    const [removedModule] = project.modules.splice(moduleIndex, 1);
    project.auditLog.push({
      at: now(),
      action: "module_deleted",
      detail: `已删除功能模块：${removedModule.name}`
    });

    await Promise.all([
      this.saveProject(project),
      fs.rm(path.join(config.uploadDir, projectId, moduleId), { recursive: true, force: true })
    ]);

    return { id: moduleId, deleted: true };
  }

  async updateModuleSkillState(projectId, moduleId, updates = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    if (Object.hasOwn(updates, "moduleSkillKey")) {
      module.moduleSkillKey = normalizeModuleSkillKey(updates.moduleSkillKey || module.moduleSkillKey || module.name);
    }
    if (Object.hasOwn(updates, "domain")) {
      module.domain = normalizeDomain(updates.domain || module.domain);
    }
    if (Object.hasOwn(updates, "skillInitMode")) {
      module.skillInitMode = normalizeSkillInitMode(updates.skillInitMode || module.skillInitMode);
    }
    if (Object.hasOwn(updates, "skillStatus")) {
      module.skillStatus = updates.skillStatus || module.skillStatus || "draft";
    }
    if (Object.hasOwn(updates, "skillSource")) {
      module.skillSource = updates.skillSource || null;
    }
    if (Object.hasOwn(updates, "seededAt")) {
      module.seededAt = updates.seededAt || null;
    }
    touchModule(module, "module_skill_updated", "功能模块 skill 状态已更新");
    await this.saveProject(project);
    return module;
  }

  async getModule(projectId, moduleId) {
    const { module } = await this.getProjectAndModule(projectId, moduleId);
    return module;
  }

  async listAssets(projectId, moduleId) {
    const module = await this.getModule(projectId, moduleId);
    return module.assets;
  }

  async getModuleAssetContent(projectId, moduleId, assetId) {
    const module = await this.getModule(projectId, moduleId);
    const asset = module.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }

    const assetPath = resolveStoredFilePath(asset, { baseDir: config.uploadDir });
    if (!assetPath) {
      throw new Error("Asset not found");
    }

    const content = await fs.readFile(assetPath, "utf8");
    return {
      assetId: asset.id,
      originalName: asset.originalName,
      mimeType: asset.mimeType || "text/plain",
      role: asset.role || "",
      uploadedAt: asset.uploadedAt || "",
      content
    };
  }

  async getModuleAssetDownload(projectId, moduleId, assetId) {
    const module = await this.getModule(projectId, moduleId);
    const asset = module.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }

    const assetPath = resolveStoredFilePath(asset, { baseDir: config.uploadDir });
    if (!assetPath) {
      throw new Error("Asset not found");
    }

    const stat = await fs.stat(assetPath).catch(() => null);
    if (!stat?.isFile()) {
      throw new Error("Asset not found");
    }

    return {
      asset,
      path: assetPath,
      fileName: asset.originalName || asset.storedName || path.basename(assetPath),
      mimeType: asset.mimeType || "application/octet-stream",
      size: stat.size
    };
  }

  async attachModuleAssets(projectId, moduleId, filesByField, options = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const referenceRole =
      options.documentType === "detail_design"
        ? "reference_detail_design_example"
        : options.documentType === "hil_test_case"
          ? "reference_hil_test_case_example"
          : "reference_requirement_example";
    const roleMap = {
      systemPdf: "system_pdf",
      modelPdf: "model_pdf",
      generatedCode: "generated_c",
      slx: "simulink_slx",
      referenceExample: referenceRole
    };

    const appendedAssets = [];
    for (const [fieldName, files] of Object.entries(filesByField)) {
      for (const file of files) {
        const record = buildFileRecord(projectId, moduleId, file, roleMap[fieldName] || fieldName);
        module.assets.push(record);
        appendedAssets.push(record);
      }
    }

    if (appendedAssets.length) {
      touchModule(module, "assets_uploaded", `已上传 ${appendedAssets.length} 个模块资产`);
      project.auditLog.push({
        at: now(),
        action: "module_assets_uploaded",
        detail: `${module.name} 已上传 ${appendedAssets.length} 个文件`
      });
      await this.saveProject(project);
    }

    return { module, assets: appendedAssets };
  }

  async deleteModuleAsset(projectId, moduleId, assetId) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const assetIndex = module.assets.findIndex((item) => item.id === assetId);
    if (assetIndex === -1) {
      throw new Error("Asset not found");
    }

    const [removedAsset] = module.assets.splice(assetIndex, 1);
    const assetPath = resolveStoredFilePath(removedAsset, { baseDir: config.uploadDir });
    if (assetPath) {
      await fs.rm(assetPath, { force: true });
    }

    touchModule(module, "asset_deleted", `已删除资产：${removedAsset.originalName}`);
    await this.saveProject(project);
    return module;
  }

  async listSlxInterpreterModels(projectId, moduleId) {
    const module = await this.getModule(projectId, moduleId);
    return (module.assets || [])
      .filter(isSlxModelAsset)
      .map(toSlxModelOption)
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
  }

  async listSlxInterpreterSessions(projectId, moduleId) {
    const module = await this.getModule(projectId, moduleId);
    return [...(module.slxInterpreterSessions || [])].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
  }

  async getSlxInterpreterTask(projectId, moduleId, taskId) {
    const module = await this.getModule(projectId, moduleId);
    const found = findSlxInterpreterTask(module, taskId);
    if (!found) return null;
    const model = (module.assets || []).find((asset) => asset.id === found.session.modelAssetId) || null;
    return {
      session: found.session,
      message: found.message,
      task: found.message,
      model: model ? toSlxModelOption(model) : null
    };
  }

  async recordSlxInterpreterQuestion(projectId, moduleId, input = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const modelAssetId = String(input.modelAssetId || "").trim();
    const question = String(input.question || "").trim();
    if (!modelAssetId) {
      throw new Error("SLX model asset is required");
    }
    if (!question) {
      throw new Error("SLX interpreter question is required");
    }

    const model = (module.assets || []).find((asset) => asset.id === modelAssetId && isSlxModelAsset(asset));
    if (!model) {
      throw new Error("SLX model asset not found");
    }

    const sessionId = String(input.sessionId || "").trim();
    let session = sessionId
      ? (module.slxInterpreterSessions || []).find((item) => item.id === sessionId)
      : null;
    if (session && session.modelAssetId !== model.id) {
      throw new Error("SLX interpreter session does not match selected model");
    }
    if (!session) {
      session = (module.slxInterpreterSessions || []).find((item) => item.modelAssetId === model.id) || null;
    }
    if (!session) {
      session = normalizeSlxInterpreterSession({
        moduleId,
        modelAssetId: model.id,
        modelName: model.originalName || "model.slx",
        messages: []
      });
      module.slxInterpreterSessions.unshift(session);
    }

    const createdAt = now();
    const userMessage = normalizeSlxInterpreterMessage({
      role: "user",
      content: question,
      status: "completed",
      createdAt,
      updatedAt: createdAt
    });
    const assistantMessage = normalizeSlxInterpreterMessage({
      role: "assistant",
      content: "",
      status: "queued",
      taskId: randomUUID(),
      question,
      summary: "等待 Hermes 解释 SLX 模型",
      progress: {
        stage: "slx_interpret_queued",
        label: "等待解释模型",
        message: "问题已进入 Hermes 队列，等待读取 SLX 模型。",
        percent: 2,
        updatedAt: createdAt
      },
      timeline: [{
        at: createdAt,
        stage: "slx_interpret_queued",
        label: "SLX 解释任务已创建",
        message: `已创建模型解释任务：${model.originalName || "model.slx"}`,
        level: "info"
      }],
      createdAt,
      updatedAt: createdAt
    });

    session.messages.push(userMessage, assistantMessage);
    session.updatedAt = createdAt;
    touchModule(module, "slx_interpreter_question_created", "SLX 解释问题已创建");
    project.auditLog.push({
      at: now(),
      action: "module_slx_interpreter_question_created",
      detail: `${module.name} 已新增 SLX 模型解释问题`
    });
    await this.saveProject(project);
    return {
      session,
      userMessage,
      assistantMessage,
      task: assistantMessage,
      model: toSlxModelOption(model)
    };
  }

  async updateSlxInterpreterTask(projectId, moduleId, sessionId, messageId, updates = {}) {
    const taskKey = `${projectId}:${moduleId}:slx_interpret:${messageId}`;
    return this.enqueueGenerationTaskMutation(taskKey, async () => {
      const { project, module } = await this.getProjectAndModule(projectId, moduleId);
      const session = (module.slxInterpreterSessions || []).find((item) => item.id === sessionId);
      if (!session) {
        throw new Error("SLX interpreter session not found");
      }
      const message = (session.messages || []).find((item) => item.id === messageId);
      if (!message) {
        throw new Error("SLX interpreter message not found");
      }

      if (updates.status) {
        message.status = String(updates.status).trim();
      }
      if (Object.hasOwn(updates, "content")) {
        message.content = normalizeDebugText(updates.content || "", 200000);
      }
      if (Object.hasOwn(updates, "summary")) {
        message.summary = String(updates.summary || "").trim();
      }
      if (Object.hasOwn(updates, "errorMessage")) {
        message.errorMessage = String(updates.errorMessage || "").trim();
      }
      if (Array.isArray(updates.evidence)) {
        message.evidence = updates.evidence
          .map(normalizeSlxInterpreterEvidenceItem)
          .filter((item) => item.fileName || item.location || item.excerpt);
      }
      if (Array.isArray(updates.warnings)) {
        message.warnings = updates.warnings.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
      }
      if (updates.progress && typeof updates.progress === "object") {
        message.progress = {
          ...normalizeTaskProgress(message.progress),
          ...normalizeTaskProgress({
            ...message.progress,
            ...updates.progress,
            updatedAt: now()
          })
        };
      }
      if (updates.debug && typeof updates.debug === "object") {
        message.debug = mergeTaskDebug(message.debug, updates.debug);
      }
      if (updates.timelineEntry && typeof updates.timelineEntry === "object") {
        appendTimelineEntry(message, updates.timelineEntry);
      }
      if (updates.debugEvent && typeof updates.debugEvent === "object") {
        appendTaskDebugEvent(message, updates.debugEvent);
      }

      message.summary = buildSlxInterpreterTaskSummary(message);
      message.updatedAt = now();
      session.updatedAt = message.updatedAt;

      if (message.status === "completed") {
        touchModule(module, "slx_interpreter_completed", "SLX 解释任务已完成");
      } else if (message.status === "failed") {
        touchModule(module, "slx_interpreter_failed", "SLX 解释任务失败");
      } else {
        touchModule(module, "slx_interpreter_task_updated", "SLX 解释任务状态已更新");
      }

      await this.saveProject(project);
      return { session, message, task: message };
    });
  }

  async getDocumentSpace(projectId, moduleId, documentType) {
    const module = await this.getModule(projectId, moduleId);
    return module.documentSpaces[normalizeDocumentType(documentType)];
  }

  async listGenerationTasks(projectId, moduleId, documentType) {
    const space = await this.getDocumentSpace(projectId, moduleId, documentType);
    return [...space.generationTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getGenerationTask(projectId, moduleId, documentType, taskId) {
    const space = await this.getDocumentSpace(projectId, moduleId, documentType);
    return space.generationTasks.find((task) => task.id === taskId) || null;
  }

  async getLatestGenerationTask(projectId, moduleId, documentType) {
    const tasks = await this.listGenerationTasks(projectId, moduleId, documentType);
    return tasks[0] || null;
  }

  async deleteGenerationTask(projectId, moduleId, documentType, taskId) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const taskIndex = space.generationTasks.findIndex((item) => item.id === taskId);
    if (taskIndex === -1) {
      throw new Error("Task not found");
    }

    const task = space.generationTasks[taskIndex];
    const [removedTask] = space.generationTasks.splice(taskIndex, 1);

    const acceptedCountBefore = space.acceptedItems.length;
    space.acceptedItems = space.acceptedItems.filter((item) => item.sourceTaskId !== taskId);
    const removedAcceptedCount = acceptedCountBefore - space.acceptedItems.length;

    touchModule(
      module,
      "task_deleted",
      `${getDocumentTypeLabel(normalizedDocumentType)}任务已删除${removedAcceptedCount ? `，并移除 ${removedAcceptedCount} 条已采纳结果` : ""}${removedTask.status === "running" ? "（任务在运行中被手动删除）" : ""}`
    );
    project.auditLog.push({
      at: now(),
      action: "module_task_deleted",
      detail: `${module.name} / ${getDocumentTypeLabel(normalizedDocumentType)} 已删除任务`
    });
    await this.saveProject(project);
    return { id: taskId, deleted: true, removedAcceptedCount };
  }

  async recordGenerationTask(projectId, moduleId, documentType, taskInput = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const task = normalizeTask({
      ...taskInput,
      moduleId,
      documentType: normalizedDocumentType,
      createdAt: now(),
      updatedAt: now()
    });

    space.generationTasks.unshift(task);
    touchModule(module, getGenerationActionLabel(normalizedDocumentType), `${getDocumentTypeLabel(normalizedDocumentType)}任务已生成`);
    project.status = "generated";
    project.auditLog.push({
      at: now(),
      action: "module_task_generated",
      detail: `${module.name} / ${getDocumentTypeLabel(normalizedDocumentType)} 已新增任务`
    });
    await this.saveProject(project);
    return task;
  }

  async updateGenerationTask(projectId, moduleId, documentType, taskId, updates = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const taskKey = `${projectId}:${moduleId}:${normalizedDocumentType}:${taskId}`;
    return this.enqueueGenerationTaskMutation(taskKey, async () => {
      const { project, module } = await this.getProjectAndModule(projectId, moduleId);
      const space = module.documentSpaces[normalizedDocumentType];
      const task = space.generationTasks.find((item) => item.id === taskId);
      if (!task) {
        throw new Error("Task not found");
      }

      if (updates.status) {
        task.status = updates.status;
      }
      if (Array.isArray(updates.inputAssetIds)) {
        task.inputAssetIds = updates.inputAssetIds;
      }
      if (Array.isArray(updates.uploadedAssetIds)) {
        task.uploadedAssetIds = updates.uploadedAssetIds;
      }
      if (Array.isArray(updates.resultItems)) {
        task.resultItems = updates.resultItems.map(normalizeTaskResultItem);
      }
      if (Array.isArray(updates.extractions)) {
        task.extractions = updates.extractions;
      }
      if (Array.isArray(updates.traces)) {
        task.traces = updates.traces;
      }
      if (Array.isArray(updates.conflicts)) {
        task.conflicts = updates.conflicts;
      }
      if (Object.hasOwn(updates, "llmProfile")) {
        task.llmProfile = updates.llmProfile || null;
      }
      if (Object.hasOwn(updates, "generationMode")) {
        task.generationMode = String(updates.generationMode || "").trim();
      }
      if (Object.hasOwn(updates, "resultMarkdown")) {
        task.resultMarkdown = normalizeDebugText(updates.resultMarkdown || "", 200000);
      }
      if (Object.hasOwn(updates, "resultMarkdownArtifact")) {
        task.resultMarkdownArtifact = normalizeTaskMarkdownArtifact(updates.resultMarkdownArtifact);
      }
      if (Object.hasOwn(updates, "skillVersion")) {
        task.skillVersion = normalizeSkillVersionRef(updates.skillVersion);
      }
      if (typeof updates.summary === "string") {
        task.summary = updates.summary;
      }
      if (Object.hasOwn(updates, "errorMessage")) {
        task.errorMessage = String(updates.errorMessage || "").trim();
      }
      if (updates.progress && typeof updates.progress === "object") {
        task.progress = {
          ...normalizeTaskProgress(task.progress),
          ...normalizeTaskProgress({
            ...task.progress,
            ...updates.progress,
            updatedAt: now()
          })
        };
      }
      if (updates.metrics && typeof updates.metrics === "object") {
        task.metrics = {
          ...normalizeTaskMetrics(task.metrics),
          ...normalizeTaskMetrics({
            ...task.metrics,
            ...updates.metrics
          })
        };
      }
      if (updates.debug && typeof updates.debug === "object") {
        task.debug = mergeTaskDebug(task.debug, updates.debug);
      }
      if (updates.timelineEntry && typeof updates.timelineEntry === "object") {
        appendTimelineEntry(task, updates.timelineEntry);
      }
      if (updates.debugEvent && typeof updates.debugEvent === "object") {
        appendTaskDebugEvent(task, updates.debugEvent);
      }
      task.summary = buildTaskSummary(task);
      task.updatedAt = now();

      if (task.status === "completed") {
        touchModule(module, getGenerationActionLabel(normalizedDocumentType), `${getDocumentTypeLabel(normalizedDocumentType)}任务已完成`);
      } else if (task.status === "failed") {
        touchModule(module, "task_failed", `${getDocumentTypeLabel(normalizedDocumentType)}任务执行失败`);
      } else {
        touchModule(module, "task_updated", `${getDocumentTypeLabel(normalizedDocumentType)}任务状态已更新`);
      }

      await this.saveProject(project);
      return task;
    });
  }

  async reviewTaskResult(projectId, moduleId, documentType, taskId, resultItemId, review = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const task = module.documentSpaces[normalizedDocumentType].generationTasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    const resultItem = task.resultItems.find((item) => item.id === resultItemId);
    if (!resultItem) {
      throw new Error("Result item not found");
    }

    if (typeof review.requirementText === "string" && review.requirementText.trim()) {
      resultItem.requirementText = review.requirementText.trim();
    }
    if (typeof review.sectionTitle === "string" && review.sectionTitle.trim()) {
      resultItem.sectionTitle = review.sectionTitle.trim();
    }
    if (typeof review.itemTitle === "string" && review.itemTitle.trim()) {
      const nextItemTitle = review.itemTitle.trim();
      resultItem.itemTitle = nextItemTitle;
      resultItem.title = nextItemTitle;
    }
    if (typeof review.title === "string" && review.title.trim()) {
      const nextTitle = review.title.trim();
      resultItem.title = nextTitle;
      resultItem.itemTitle = nextTitle;
    }

    const nextStatus = review.status || resultItem.review?.status || "pending";
    const effectiveTargetArea = normalizeTargetArea(review.targetArea) || normalizeTargetArea(resultItem.review?.targetArea);
    if (
      nextStatus === "rejected" &&
      (!review.reasonCategory || !String(review.reasonText || "").trim() || !effectiveTargetArea)
    ) {
      const error = new Error("Rejected review requires reasonCategory, reasonText, and targetArea");
      error.statusCode = 400;
      throw error;
    }

    resultItem.review = {
      ...(resultItem.review || {}),
      status: nextStatus,
      reviewer: review.reviewer || resultItem.review?.reviewer || "当前用户",
      comment: review.comment?.trim() || "",
      reasonCategory: review.reasonCategory || resultItem.review?.reasonCategory || "",
      reasonTags: normalizeReasonTags(review.reasonTags),
      reasonText: review.reasonText?.trim() || "",
      targetArea: effectiveTargetArea || "",
      severity: review.severity || resultItem.review?.severity || "medium",
      expectedNote: review.expectedNote?.trim() || "",
      targetLayerConstraint: review.targetLayerConstraint || resultItem.review?.targetLayerConstraint || "docType",
      includeInPool: review.includeInPool !== false,
      rejectionId: resultItem.review?.rejectionId || "",
      updatedAt: now()
    };

    if (nextStatus === "rejected") {
      const rejection = await this.rejectionService.createRecord({
          project: {
            ...project,
            extractions: task.extractions || [],
            lastGeneration: {
              at: task.updatedAt || task.createdAt || now(),
              llmProfile: task.llmProfile || null
            }
          },
          module,
          task,
          documentType: normalizedDocumentType,
          conflicts: (task.conflicts || []).filter(
            (item) => item.requirementId === resultItem.id || item.requirementId === resultItem.requirementId
          ),
          traces: (task.traces || []).filter(
            (item) =>
              item.requirementId === resultItem.id ||
              item.requirementId === resultItem.requirementId ||
              item.requirementCode === resultItem.requirementId
          ),
          requirement: {
            id: resultItem.id,
            requirementId: resultItem.requirementId,
            title: resultItem.title,
            requirementText: resultItem.requirementText,
            type: resultItem.type,
            confidence: resultItem.confidence,
            verificationHint: resultItem.verificationHint || "",
            conflictNote: resultItem.conflictNote || "",
            sourceRefs: resultItem.sourceRefs || []
          },
          review: {
            ...review,
            status: nextStatus,
            reasonTags: resultItem.review.reasonTags,
            targetArea: resultItem.review.targetArea,
            targetLayerConstraint: resultItem.review.targetLayerConstraint,
            generationId: task.id,
            resultItemId: resultItem.id,
            documentType: normalizedDocumentType,
            moduleId: module.id,
            moduleName: module.name
          }
        });
      resultItem.review.rejectionId = rejection.id;
    }

    task.updatedAt = now();
    touchModule(module, "task_result_reviewed", `${getDocumentTypeLabel(normalizedDocumentType)}结果已审核`);
    await this.saveProject(project);
    return resultItem;
  }

  async listAcceptedItems(projectId, moduleId, documentType) {
    const space = await this.getDocumentSpace(projectId, moduleId, documentType);
    return [...space.acceptedItems];
  }

  async createAcceptedItem(projectId, moduleId, documentType, input = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const task = space.generationTasks.find((item) => item.id === input.sourceTaskId);
    if (!task) {
      throw new Error("Task not found");
    }

    const resultItem = task.resultItems.find((item) => item.id === input.sourceResultItemId);
    if (!resultItem) {
      throw new Error("Result item not found");
    }

    const nextTitle = input.itemTitle?.trim() || input.title?.trim() || resultItem.itemTitle || resultItem.title || "";
    const nextSectionTitle = input.sectionTitle?.trim() || resultItem.sectionTitle || "";

    const acceptedItem = normalizeAcceptedItem({
      sourceTaskId: task.id,
      sourceResultItemId: resultItem.id,
      acceptedSnapshot: cloneForAcceptedSnapshot(resultItem),
      currentContent: {
        ...cloneForAcceptedSnapshot(resultItem),
        sectionTitle: nextSectionTitle,
        requirementText: input.requirementText?.trim() || resultItem.requirementText,
        title: nextTitle,
        itemTitle: nextTitle
      },
      review: {
        status: "accepted",
        reviewer: input.reviewer || "当前用户",
        comment: input.comment?.trim() || ""
      }
    });

    resultItem.review = {
      status: "accepted",
      reviewer: acceptedItem.review.reviewer,
      comment: acceptedItem.review.comment,
      updatedAt: now()
    };
    task.updatedAt = now();
    space.acceptedItems.unshift(acceptedItem);

    touchModule(module, "accepted_item_created", `${getDocumentTypeLabel(normalizedDocumentType)}条目已接受`);
    await this.saveProject(project);
    return acceptedItem;
  }

  async updateAcceptedItem(projectId, moduleId, documentType, acceptedItemId, input = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const acceptedItem = space.acceptedItems.find((item) => item.id === acceptedItemId);
    if (!acceptedItem) {
      throw new Error("Accepted item not found");
    }

    const nextTitle =
      input.itemTitle?.trim() ||
      input.title?.trim() ||
      acceptedItem.currentContent?.itemTitle ||
      acceptedItem.currentContent?.title ||
      acceptedItem.acceptedSnapshot?.itemTitle ||
      acceptedItem.acceptedSnapshot?.title ||
      "";
    acceptedItem.currentContent = {
      ...(acceptedItem.currentContent || {}),
      sectionTitle:
        input.sectionTitle?.trim() ||
        acceptedItem.currentContent?.sectionTitle ||
        acceptedItem.acceptedSnapshot?.sectionTitle ||
        "",
      title: nextTitle,
      itemTitle: nextTitle,
      requirementText:
        input.requirementText?.trim() ||
        acceptedItem.currentContent?.requirementText ||
        acceptedItem.acceptedSnapshot?.requirementText ||
        ""
    };
    acceptedItem.review = {
      ...(acceptedItem.review || {}),
      reviewer: input.reviewer || acceptedItem.review?.reviewer || "当前用户",
      comment: input.comment?.trim() || acceptedItem.review?.comment || "",
      updatedAt: now()
    };
    acceptedItem.updatedAt = now();

    touchModule(module, "accepted_item_updated", `${getDocumentTypeLabel(normalizedDocumentType)}接受结果已更新`);
    await this.saveProject(project);
    return acceptedItem;
  }

  async deleteAcceptedItem(projectId, moduleId, documentType, acceptedItemId) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const acceptedIndex = space.acceptedItems.findIndex((item) => item.id === acceptedItemId);
    if (acceptedIndex === -1) {
      throw new Error("Accepted item not found");
    }

    const [acceptedItem] = space.acceptedItems.splice(acceptedIndex, 1);
    const sourceTask = space.generationTasks.find((item) => item.id === acceptedItem.sourceTaskId);
    const sourceResult = sourceTask?.resultItems?.find((item) => item.id === acceptedItem.sourceResultItemId);
    if (sourceResult?.review?.status === "accepted") {
      sourceResult.review = {
        ...(sourceResult.review || {}),
        status: "pending",
        reviewer: sourceResult.review?.reviewer || "当前用户",
        comment: "已从采纳结果区移除",
        updatedAt: now()
      };
      sourceTask.updatedAt = now();
    }

    touchModule(module, "accepted_item_deleted", `${getDocumentTypeLabel(normalizedDocumentType)}接受结果已删除`);
    await this.saveProject(project);
    return { id: acceptedItemId, deleted: true };
  }

  async reorderAcceptedItems(projectId, moduleId, documentType, orderedIds = []) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const space = module.documentSpaces[normalizedDocumentType];
    const currentItems = [...space.acceptedItems];
    const idSet = new Set(currentItems.map((item) => item.id));
    const normalizedOrderedIds = Array.isArray(orderedIds) ? orderedIds.map((item) => String(item || "").trim()).filter(Boolean) : [];

    if (normalizedOrderedIds.length !== currentItems.length || normalizedOrderedIds.some((id) => !idSet.has(id))) {
      const error = new Error("Accepted item order is invalid");
      error.statusCode = 400;
      throw error;
    }

    const itemMap = new Map(currentItems.map((item) => [item.id, item]));
    space.acceptedItems = normalizedOrderedIds.map((id) => itemMap.get(id)).filter(Boolean);

    touchModule(module, "accepted_item_reordered", `${getDocumentTypeLabel(normalizedDocumentType)}接受结果顺序已调整`);
    await this.saveProject(project);
    return [...space.acceptedItems];
  }

  async listDocumentExtractionTasks(projectId, moduleId) {
    const module = await this.getModule(projectId, moduleId);
    return [...(module.documentExtractionTasks || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getDocumentExtractionTask(projectId, moduleId, taskId) {
    const module = await this.getModule(projectId, moduleId);
    return (module.documentExtractionTasks || []).find((task) => task.id === taskId) || null;
  }

  async deleteDocumentExtractionTask(projectId, moduleId, taskId) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const taskIndex = (module.documentExtractionTasks || []).findIndex((item) => item.id === taskId);
    if (taskIndex === -1) {
      throw new Error("Document extraction task not found");
    }

    const [removedTask] = module.documentExtractionTasks.splice(taskIndex, 1);
    touchModule(
      module,
      "document_extraction_task_deleted",
      `${getDocumentExtractionTypeLabel(removedTask.targetDocumentType)}提取任务已删除`
    );
    project.auditLog.push({
      at: now(),
      action: "module_document_extraction_task_deleted",
      detail: `${module.name} / ${getDocumentExtractionTypeLabel(removedTask.targetDocumentType)} 提取任务已删除`
    });
    await this.saveProject(project);
    return { id: taskId, deleted: true };
  }

  async recordDocumentExtractionTask(projectId, moduleId, taskInput = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const task = normalizeDocumentExtractionTask({
      ...taskInput,
      moduleId,
      createdAt: now(),
      updatedAt: now()
    });
    task.summary = buildDocumentExtractionTaskSummary(task);
    module.documentExtractionTasks.unshift(task);
    touchModule(
      module,
      "document_extraction_task_created",
      `${getDocumentExtractionTypeLabel(task.targetDocumentType)}提取任务已创建`
    );
    project.auditLog.push({
      at: now(),
      action: "module_document_extraction_task_created",
      detail: `${module.name} / ${getDocumentExtractionTypeLabel(task.targetDocumentType)} 已新增提取任务`
    });
    await this.saveProject(project);
    return task;
  }

  async updateDocumentExtractionTask(projectId, moduleId, taskId, updates = {}) {
    const taskKey = `${projectId}:${moduleId}:document_extraction:${taskId}`;
    return this.enqueueGenerationTaskMutation(taskKey, async () => {
      const { project, module } = await this.getProjectAndModule(projectId, moduleId);
      const task = (module.documentExtractionTasks || []).find((item) => item.id === taskId);
      if (!task) {
        throw new Error("Document extraction task not found");
      }

      if (updates.status) {
        task.status = String(updates.status).trim();
      }
      if (Object.hasOwn(updates, "sourceMode")) {
        task.sourceMode = String(updates.sourceMode || task.sourceMode || "text").trim() || "text";
      }
      if (typeof updates.sourceText === "string") {
        task.sourceText = updates.sourceText;
      }
      if (Array.isArray(updates.inputArtifacts)) {
        task.inputArtifacts = normalizeDocumentExtractionTask({
          inputArtifacts: updates.inputArtifacts
        }).inputArtifacts;
      }
      if (typeof updates.outputAssetId === "string") {
        task.outputAssetId = updates.outputAssetId.trim();
      }
      if (typeof updates.outputAssetName === "string") {
        task.outputAssetName = updates.outputAssetName.trim();
      }
      if (typeof updates.summary === "string") {
        task.summary = updates.summary;
      }
      if (Object.hasOwn(updates, "errorMessage")) {
        task.errorMessage = String(updates.errorMessage || "").trim();
      }
      if (updates.progress && typeof updates.progress === "object") {
        task.progress = {
          ...normalizeTaskProgress(task.progress),
          ...normalizeTaskProgress({
            ...task.progress,
            ...updates.progress,
            updatedAt: now()
          })
        };
      }
      if (updates.debug && typeof updates.debug === "object") {
        task.debug = mergeTaskDebug(task.debug, updates.debug);
      }
      if (updates.timelineEntry && typeof updates.timelineEntry === "object") {
        appendTimelineEntry(task, updates.timelineEntry);
      }
      if (updates.debugEvent && typeof updates.debugEvent === "object") {
        appendTaskDebugEvent(task, updates.debugEvent);
      }

      task.summary = buildDocumentExtractionTaskSummary(task);
      task.updatedAt = now();

      if (task.status === "completed") {
        touchModule(module, "document_extracted", `${getDocumentExtractionTypeLabel(task.targetDocumentType)}提取任务已完成`);
      } else if (task.status === "failed") {
        touchModule(module, "document_extraction_failed", `${getDocumentExtractionTypeLabel(task.targetDocumentType)}提取任务失败`);
      } else {
        touchModule(module, "document_extraction_task_updated", `${getDocumentExtractionTypeLabel(task.targetDocumentType)}提取任务状态已更新`);
      }

      await this.saveProject(project);
      return task;
    });
  }

  async createExtractedModuleAsset(projectId, moduleId, input = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const normalizedDocumentType = normalizeDocumentExtractionType(input.targetDocumentType);
    const role = getExtractedAssetRole(normalizedDocumentType);
    const baseName = buildExtractedAssetBaseName(module.name, normalizedDocumentType);
    const existingNames = new Set((module.assets || []).map((asset) => asset.originalName));
    let fileName = baseName;
    if (existingNames.has(fileName)) {
      const stampedName = `${baseName.replace(/\.md$/i, "")}-${formatAssetTimestamp()}.md`;
      fileName = existingNames.has(stampedName) ? `${baseName.replace(/\.md$/i, "")}-${formatAssetTimestamp()}-2.md` : stampedName;
    }

    const record = createGeneratedModuleAssetRecord(projectId, moduleId, fileName, role);
    await fs.mkdir(path.dirname(record.absolutePath), { recursive: true });
    await fs.writeFile(record.absolutePath, String(input.markdown || ""), "utf8");
    const stat = await fs.stat(record.absolutePath);
    record.size = stat.size;
    record.uploadedAt = now();

    module.assets.push(record);

    if (input.sourceTaskId) {
      const task = (module.documentExtractionTasks || []).find((item) => item.id === input.sourceTaskId);
      if (task) {
        task.outputAssetId = record.id;
        task.outputAssetName = record.originalName;
        task.updatedAt = now();
      }
    }

    touchModule(module, "extracted_asset_created", `已生成提取资产：${record.originalName}`);
    project.auditLog.push({
      at: now(),
      action: "module_extracted_asset_created",
      detail: `${module.name} 已新增提取资产：${record.originalName}`
    });
    await this.saveProject(project);
    return record;
  }

  async createSlxJsonModuleAsset(projectId, moduleId, input = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const role = "model_requirement_view_json";
    const moduleName = String(module.name || "").trim() || "未命名模块";
    const baseName = `${moduleName}-model-requirement-view`;
    const existingNames = new Set((module.assets || []).map((asset) => asset.originalName));
    let fileName = `${baseName}.json`;
    if (existingNames.has(fileName)) {
      const stampedName = `${baseName}-${formatAssetTimestamp()}.json`;
      fileName = existingNames.has(stampedName) ? `${baseName}-${formatAssetTimestamp()}-2.json` : stampedName;
    }

    const storedName = toSafeStoredName(fileName);
    const relativePath = path.join(projectId, moduleId, storedName);
    const absolutePath = path.join(config.uploadDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const jsonContent = typeof input.modelRequirementView === "string"
      ? input.modelRequirementView
      : JSON.stringify(input.modelRequirementView || {}, null, 2);
    await fs.writeFile(absolutePath, jsonContent, "utf8");
    const stat = await fs.stat(absolutePath);

    const record = {
      id: randomUUID(),
      role,
      originalName: fileName,
      storedName,
      relativePath,
      absolutePath,
      mimeType: "application/json",
      size: stat.size,
      uploadedAt: now()
    };

    module.assets.push(record);

    if (input.sourceTaskId) {
      const task = (module.slxParserTasks || []).find((item) => item.id === input.sourceTaskId);
      if (task) {
        task.outputAssetId = record.id;
        task.outputAssetName = record.originalName;
        task.updatedAt = now();
      }
    }

    touchModule(module, "slx_json_asset_created", `已生成模型需求 JSON 资产：${record.originalName}`);
    project.auditLog.push({
      at: now(),
      action: "module_slx_json_asset_created",
      detail: `${module.name} 已新增模型需求 JSON 资产：${record.originalName}`
    });
    await this.saveProject(project);
    return record;
  }

  async listSlxParserTasks(projectId, moduleId) {
    const module = await this.getModule(projectId, moduleId);
    return [...(module.slxParserTasks || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getSlxParserTask(projectId, moduleId, taskId) {
    const module = await this.getModule(projectId, moduleId);
    return (module.slxParserTasks || []).find((task) => task.id === taskId) || null;
  }

  async deleteSlxParserTask(projectId, moduleId, taskId) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const taskIndex = (module.slxParserTasks || []).findIndex((item) => item.id === taskId);
    if (taskIndex === -1) {
      throw new Error("SLX parser task not found");
    }

    const [removedTask] = module.slxParserTasks.splice(taskIndex, 1);
    touchModule(module, "slx_parser_task_deleted", "SLX 解析任务已删除");
    project.auditLog.push({
      at: now(),
      action: "module_slx_parser_task_deleted",
      detail: `${module.name} SLX 解析任务已删除`
    });
    await this.saveProject(project);
    return { id: taskId, deleted: true };
  }

  async recordSlxParserTask(projectId, moduleId, taskInput = {}) {
    const { project, module } = await this.getProjectAndModule(projectId, moduleId);
    const task = normalizeSlxParserTask({
      ...taskInput,
      moduleId,
      createdAt: now(),
      updatedAt: now()
    });
    task.summary = buildSlxParserTaskSummary(task);
    module.slxParserTasks.unshift(task);
    touchModule(module, "slx_parser_task_created", "SLX 解析任务已创建");
    project.auditLog.push({
      at: now(),
      action: "module_slx_parser_task_created",
      detail: `${module.name} 已新增 SLX 解析任务`
    });
    await this.saveProject(project);
    return task;
  }

  async updateSlxParserTask(projectId, moduleId, taskId, updates = {}) {
    const taskKey = `${projectId}:${moduleId}:slx_parser:${taskId}`;
    return this.enqueueGenerationTaskMutation(taskKey, async () => {
      const { project, module } = await this.getProjectAndModule(projectId, moduleId);
      const task = (module.slxParserTasks || []).find((item) => item.id === taskId);
      if (!task) {
        throw new Error("SLX parser task not found");
      }

      if (updates.status) {
        task.status = String(updates.status).trim();
      }
      if (Array.isArray(updates.inputArtifacts)) {
        task.inputArtifacts = normalizeSlxParserTask({
          inputArtifacts: updates.inputArtifacts
        }).inputArtifacts;
      }
      if (typeof updates.outputAssetId === "string") {
        task.outputAssetId = updates.outputAssetId.trim();
      }
      if (typeof updates.outputAssetName === "string") {
        task.outputAssetName = updates.outputAssetName.trim();
      }
      if (typeof updates.summary === "string") {
        task.summary = updates.summary;
      }
      if (Object.hasOwn(updates, "errorMessage")) {
        task.errorMessage = String(updates.errorMessage || "").trim();
      }
      if (updates.progress && typeof updates.progress === "object") {
        task.progress = {
          ...normalizeTaskProgress(task.progress),
          ...normalizeTaskProgress({
            ...task.progress,
            ...updates.progress,
            updatedAt: now()
          })
        };
      }
      if (updates.debug && typeof updates.debug === "object") {
        task.debug = mergeTaskDebug(task.debug, updates.debug);
      }
      if (updates.timelineEntry && typeof updates.timelineEntry === "object") {
        appendTimelineEntry(task, updates.timelineEntry);
      }
      if (updates.debugEvent && typeof updates.debugEvent === "object") {
        appendTaskDebugEvent(task, updates.debugEvent);
      }

      task.summary = buildSlxParserTaskSummary(task);
      task.updatedAt = now();

      if (task.status === "completed") {
        touchModule(module, "slx_parser_completed", "SLX 解析任务已完成");
      } else if (task.status === "failed") {
        touchModule(module, "slx_parser_failed", "SLX 解析任务失败");
      } else {
        touchModule(module, "slx_parser_task_updated", "SLX 解析任务状态已更新");
      }

      await this.saveProject(project);
      return task;
    });
  }

  async getProjectAndModule(projectId, moduleId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const module = project.modules.find((item) => item.id === moduleId);
    if (!module) {
      throw new Error("Module not found");
    }

    return { project, module };
  }

  async attachFiles(projectId, filesByField) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const roleMap = {
      systemPdf: "system_pdf",
      modelPdf: "model_pdf",
      generatedCode: "generated_c",
      slx: "simulink_slx"
    };

    for (const [fieldName, files] of Object.entries(filesByField)) {
      for (const file of files) {
        project.files.push(buildFileRecord(projectId, "", file, roleMap[fieldName] || fieldName));
      }
    }

    project.status = "files_uploaded";
    project.auditLog.push({
      at: now(),
      action: "files_uploaded",
      detail: `已上传 ${project.files.length} 个文件`
    });

    return this.saveProject(project);
  }

  async deleteFile(projectId, fileId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const fileIndex = project.files.findIndex((item) => item.id === fileId);
    if (fileIndex === -1) {
      throw new Error("File not found");
    }

    const [removedFile] = project.files.splice(fileIndex, 1);
    const filePath = resolveStoredFilePath(removedFile, { baseDir: config.uploadDir });
    if (filePath) {
      await fs.rm(filePath, { force: true });
    }

    project.extractions = [];
    project.requirements = [];
    project.traces = [];
    project.conflicts = [];
    project.lastGeneration = null;
    project.status = project.files.length ? "files_uploaded" : "draft";
    project.auditLog.push({
      at: now(),
      action: "file_deleted",
      detail: `已删除文件：${removedFile.originalName}`
    });

    return this.saveProject(project);
  }

  async updateGeneratedArtifacts(projectId, result) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    project.extractions = result.extractions;
    project.requirements = result.requirements;
    project.traces = result.traces;
    project.conflicts = result.conflicts;
    project.lastGeneration = result.llmProfile
      ? {
          at: now(),
          llmProfile: result.llmProfile
        }
      : {
          at: now(),
          llmProfile: null
        };
    project.status = "generated";
    const documentTypeLabel = getDocumentTypeLabel(project.documentType);
    project.auditLog.push({
      at: now(),
      action: getGenerationActionLabel(project.documentType),
      detail: result.llmProfile
        ? `使用 ${result.llmProfile.name}（${result.llmProfile.model}）生成 ${result.requirements.length} 条${documentTypeLabel}`
        : `使用本地回退模式生成 ${result.requirements.length} 条${documentTypeLabel}`
    });

    return this.saveProject(project);
  }

  async deleteRequirement(projectId, requirementId) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const requirementIndex = project.requirements.findIndex((item) => item.id === requirementId);
    if (requirementIndex === -1) {
      throw new Error("Requirement not found");
    }

    const [removedRequirement] = project.requirements.splice(requirementIndex, 1);
    project.traces = (project.traces || []).filter((item) => item.requirementId !== requirementId);
    project.conflicts = (project.conflicts || []).filter(
      (item) => item.requirementId !== requirementId && item.requirementCode !== removedRequirement.requirementId
    );

    project.auditLog.push({
      at: now(),
      action: "requirement_deleted",
      detail: `${removedRequirement.requirementId} 已删除`
    });

    return this.saveProject(project);
  }

  async reviewRequirement(projectId, requirementId, review) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const requirement = project.requirements.find((item) => item.id === requirementId);
    if (!requirement) {
      throw new Error("Requirement not found");
    }

    if (typeof review.requirementText === "string" && review.requirementText.trim()) {
      requirement.requirementText = review.requirementText.trim();
    }

    const nextStatus = review.status || requirement.review?.status || "pending";
    const effectiveTargetArea = normalizeTargetArea(review.targetArea) || normalizeTargetArea(requirement.review?.targetArea);
    if (
      nextStatus === "rejected" &&
      (!review.reasonCategory || !String(review.reasonText || "").trim() || !effectiveTargetArea)
    ) {
      const error = new Error("Rejected review requires reasonCategory, reasonText, and targetArea");
      error.statusCode = 400;
      throw error;
    }

    requirement.review = {
      status: nextStatus,
      reviewer: review.reviewer || "当前用户",
      comment: review.comment?.trim() || "",
      reasonCategory: review.reasonCategory || requirement.review?.reasonCategory || "",
      reasonTags: normalizeReasonTags(review.reasonTags),
      reasonText: review.reasonText?.trim() || "",
      targetArea: effectiveTargetArea || "",
      severity: review.severity || requirement.review?.severity || "medium",
      expectedNote: review.expectedNote?.trim() || "",
      targetLayerConstraint: review.targetLayerConstraint || requirement.review?.targetLayerConstraint || "docType",
      includeInPool: review.includeInPool !== false,
      rejectionId: requirement.review?.rejectionId || "",
      updatedAt: now()
    };

    if (nextStatus === "rejected") {
      const rejection = await this.rejectionService.createRecord({
        project,
        requirement,
        review: {
          ...review,
          status: nextStatus,
          reasonTags: requirement.review.reasonTags,
          targetArea: requirement.review.targetArea,
          targetLayerConstraint: requirement.review.targetLayerConstraint
        }
      });
      requirement.review.rejectionId = rejection.id;
    }

    project.auditLog.push({
      at: now(),
      action: "requirement_reviewed",
      detail: `${requirement.requirementId} -> ${requirement.review.status}`
    });

    return this.saveProject(project);
  }
}
