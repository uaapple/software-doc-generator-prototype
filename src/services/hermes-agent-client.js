import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);
const CLI_JSON_MAX_LENGTH = 120000;
const CLI_EXCERPT_MAX_LENGTH = 600;
const CLI_SKILL_CONTENT_MAX_LENGTH = 1200;

function trimTrailingSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function clipText(value = "", maxLength = CLI_JSON_MAX_LENGTH) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function emitHermesEvent(onEvent, event = {}) {
  if (typeof onEvent !== "function") {
    return;
  }
  await Promise.resolve(
    onEvent({
      at: new Date().toISOString(),
      ...event
    })
  );
}

function sanitizeEvidenceItem(item = {}) {
  return {
    fileName: String(item.fileName || "").trim(),
    fileRole: String(item.fileRole || item.role || "").trim(),
    location: String(item.location || "").trim(),
    excerpt: clipText(item.excerpt || "", CLI_EXCERPT_MAX_LENGTH)
  };
}

function sanitizeSkillInventory(skillInventory = {}) {
  return {
    selectedProfiles: Array.isArray(skillInventory.selectedProfiles)
      ? skillInventory.selectedProfiles.map((item) => ({
          layer: String(item?.layer || "").trim(),
          key: String(item?.key || item?.profileKey || "").trim(),
          title: String(item?.title || "").trim(),
          version: String(item?.version || "").trim()
        }))
      : [],
    items: Array.isArray(skillInventory.items)
      ? skillInventory.items.map((item) => ({
          skillCode: String(item?.skillCode || "").trim(),
          layer: String(item?.layer || "").trim(),
          profileKey: String(item?.profileKey || "").trim(),
          kind: String(item?.kind || "").trim(),
          title: String(item?.title || "").trim(),
          content: clipText(item?.content || "", CLI_SKILL_CONTENT_MAX_LENGTH),
          order: Number(item?.order || 0) || 0
        }))
      : []
  };
}

function sanitizeOutline(outline = {}) {
  return {
    summary: clipText(outline.summary || "", 3000),
    sections: Array.isArray(outline.sections)
      ? outline.sections.map((section) => ({
          title: clipText(section?.title || "", 200),
          objective: clipText(section?.objective || "", 600),
          evidenceKeys: Array.isArray(section?.evidenceKeys)
            ? section.evidenceKeys.map((item) => clipText(item || "", 200)).slice(0, 20)
            : []
        }))
      : []
  };
}

function extractJsonText(text = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return withoutFence.trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }
  return trimmed;
}

function parseCliResponse(stdout = "") {
  const normalized = String(stdout || "").replace(/\r/g, "");
  const match = normalized.match(/(?:^|\n)session_id:\s*(.+?)\s*$/i);
  const sessionId = match ? match[1].trim() : "";
  const body = match ? normalized.slice(0, match.index).trim() : normalized.trim();
  return {
    body,
    sessionId
  };
}

function buildMaterialExtractPrompt(payload = {}) {
  const files = Array.isArray(payload.inputArtifact?.files) ? payload.inputArtifact.files : [];
  return [
    "You are executing the Hermes step `material_extract` for software requirement generation.",
    "Use your local tools to read ONLY the files listed below from the local filesystem.",
    "Do not read any other files. Do not infer excerpts without reading the files.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Allowed files:",
    JSON.stringify(
      files.map((file) => ({
        originalName: file.originalName,
        fileRole: file.fileRole || file.role,
        absolutePath: file.absolutePath
      })),
      null,
      2
    ),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        extractions: [
          {
            fileName: "file.ext",
            fileRole: "generatedCode",
            evidence: [
              {
                fileName: "file.ext",
                fileRole: "generatedCode",
                location: "line 10-18",
                excerpt: "verbatim excerpt from the file"
              }
            ]
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Each file must appear exactly once in `extractions`.",
    "- If a file has no relevant evidence, include it with an empty evidence array.",
    "- `excerpt` must be verbatim from the file.",
    "- `location` should be a concrete locator like line numbers or page markers.",
    "- Focus on content relevant to software requirements and control logic."
  ].join("\n");
}

function buildAtomRecallPrompt(payload = {}) {
  const evidence = Array.isArray(payload.inputArtifact?.evidence) ? payload.inputArtifact.evidence.map(sanitizeEvidenceItem) : [];
  const inventory = sanitizeSkillInventory(payload.skillInventory || {});
  return [
    "You are executing the Hermes step `atom_recall` for software requirement generation.",
    "Select the most relevant skill atoms from the effective skill inventory for the given evidence.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Evidence:",
    JSON.stringify(evidence, null, 2),
    "",
    "Effective skill inventory:",
    JSON.stringify(inventory, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        items: [
          {
            skillCode: "module_rule_1",
            layer: "module",
            profileKey: "charging_management",
            kind: "writing_rule",
            title: "Rule title",
            content: "Rule content",
            order: 10,
            matchedReason: "Why this atom is relevant"
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Only return atoms from the provided inventory.",
    `- Return at most ${Math.max(1, Number(config.hermes.maxRecalledAtoms || 24))} atoms.`,
    "- Prefer module/domain-specific atoms when they clearly match the evidence.",
    "- `matchedReason` must be short and concrete."
  ].join("\n");
}

function buildOutlinePrompt(payload = {}) {
  const evidence = Array.isArray(payload.inputArtifact?.evidence) ? payload.inputArtifact.evidence.map(sanitizeEvidenceItem) : [];
  const recalledAtoms = Array.isArray(payload.inputArtifact?.recalledAtoms)
    ? payload.inputArtifact.recalledAtoms.map((item) => ({
        skillCode: item.skillCode,
        title: item.title,
        matchedReason: clipText(item.matchedReason || "", 300),
        content: clipText(item.content || "", 800)
      }))
    : [];
  return [
    "You are executing the Hermes step `outline_build` for software requirement generation.",
    "Create a concise requirement-writing outline from the evidence and recalled skill atoms.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Evidence:",
    JSON.stringify(evidence, null, 2),
    "",
    "Recalled skill atoms:",
    JSON.stringify(recalledAtoms, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        summary: "One paragraph summary",
        sections: [
          {
            title: "Functional behavior",
            objective: "What this section should cover",
            evidenceKeys: ["file.c::line 10-18"]
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    `- Return at most ${Math.max(1, Number(config.hermes.maxOutlineSections || 6))} sections.`,
    "- Keep the outline within software requirements scope.",
    "- Do not include detail design or HIL-specific fields."
  ].join("\n");
}

function buildContentGeneratePrompt(payload = {}) {
  const inputArtifact = payload.inputArtifact || {};
  const evidence = Array.isArray(inputArtifact.evidence) ? inputArtifact.evidence.map(sanitizeEvidenceItem) : [];
  const recalledAtoms = Array.isArray(inputArtifact.recalledAtoms)
    ? inputArtifact.recalledAtoms.map((item) => ({
        skillCode: item.skillCode,
        title: item.title,
        matchedReason: clipText(item.matchedReason || "", 300),
        content: clipText(item.content || "", 900)
      }))
    : [];
  const outline = sanitizeOutline(inputArtifact.outline || {});
  const project = {
    name: clipText(inputArtifact.project?.name || "", 200),
    description: clipText(inputArtifact.project?.description || "", 1000),
    language: clipText(inputArtifact.project?.language || "", 80),
    documentType: clipText(inputArtifact.project?.documentType || "software_requirement", 80),
    domain: clipText(inputArtifact.project?.domain || "", 120),
    moduleSkillKey: clipText(inputArtifact.project?.moduleSkillKey || "", 120)
  };
  const template = inputArtifact.template || {};
  return [
    "You are executing the Hermes step `content_generate` for software requirement generation.",
    "Generate structured software requirement items from the provided project context, template, evidence, recalled skill atoms, and outline.",
    "Return strict JSON only. No markdown fences. No explanation.",
    "",
    "Project:",
    JSON.stringify(project, null, 2),
    "",
    "Template:",
    JSON.stringify(template, null, 2),
    "",
    "Outline:",
    JSON.stringify(outline, null, 2),
    "",
    "Evidence:",
    JSON.stringify(evidence, null, 2),
    "",
    "Recalled skill atoms:",
    JSON.stringify(recalledAtoms, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify(
      {
        items: [
          {
            title: "Requirement title",
            requirementText: "The software shall ...",
            type: "functional",
            verificationHint: "How to verify",
            sourceRefs: [
              {
                fileName: "file.ext",
                fileRole: "generatedCode",
                location: "line 10-18",
                excerpt: "verbatim excerpt"
              }
            ],
            conflictNote: ""
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Every requirement must be traceable to one or more sourceRefs from the provided evidence.",
    "- sourceRefs must exactly reuse fileName, location, excerpt, and fileRole from the provided evidence.",
    "- Keep content at software requirement level, not implementation detail level.",
    "- Do not invent sources or ids."
  ].join("\n");
}

function buildCliPrompt(payload = {}) {
  switch (payload.stepType) {
    case "material_extract":
      return buildMaterialExtractPrompt(payload);
    case "atom_recall":
      return buildAtomRecallPrompt(payload);
    case "outline_build":
      return buildOutlinePrompt(payload);
    case "content_generate":
      return buildContentGeneratePrompt(payload);
    default:
      throw Object.assign(new Error(`Unsupported Hermes CLI step: ${payload.stepType || ""}`), {
        code: "hermes_step_unsupported"
      });
  }
}

function normalizeStepTimeoutMap(stepTimeoutMs = {}) {
  return Object.fromEntries(
    Object.entries(stepTimeoutMs || {})
      .map(([stepType, timeoutMs]) => [
        String(stepType || "").trim(),
        Math.max(1000, Number(timeoutMs || 0) || 0)
      ])
      .filter(([stepType, timeoutMs]) => stepType && timeoutMs > 0)
  );
}

function normalizeCliArtifact(stepType, parsed = {}) {
  if (stepType === "material_extract") {
    return { extractions: Array.isArray(parsed.extractions) ? parsed.extractions : [] };
  }
  if (stepType === "atom_recall") {
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  }
  if (stepType === "outline_build") {
    return {
      summary: String(parsed.summary || "").trim(),
      sections: Array.isArray(parsed.sections) ? parsed.sections : []
    };
  }
  if (stepType === "content_generate") {
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  }
  return parsed;
}

async function defaultCommandRunner(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: options.env
  });
}

export class HermesAgentClient {
  constructor(options = {}) {
    this.transport = String(options.transport || config.hermes.transport || "cli").trim().toLowerCase();
    this.baseURL = trimTrailingSlash(options.baseURL || config.hermes.baseURL);
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs || config.hermes.timeoutMs) || config.hermes.timeoutMs);
    this.stepTimeoutMs = normalizeStepTimeoutMap(options.stepTimeoutMs || config.hermes.stepTimeoutMs || {});
    this.command = String(options.command || config.hermes.command || "hermes").trim() || "hermes";
    this.maxTurns = Math.max(1, Number(options.maxTurns || config.hermes.maxTurns) || config.hermes.maxTurns || 40);
    this.heartbeatIntervalMs = Math.max(
      10,
      Number(options.heartbeatIntervalMs || config.hermes.heartbeatIntervalMs) || config.hermes.heartbeatIntervalMs || 5000
    );
    this.workdir = String(options.workdir || config.hermes.workdir || config.rootDir || process.cwd());
    this.commandRunner = typeof options.commandRunner === "function" ? options.commandRunner : defaultCommandRunner;
  }

  getTimeoutMsForStep(stepType = "") {
    return this.stepTimeoutMs[String(stepType || "").trim()] || this.timeoutMs;
  }

  async executeApiStep(payload = {}, runtime = {}) {
    const timeoutMs = this.getTimeoutMsForStep(payload.stepType);
    await emitHermesEvent(runtime.onEvent, {
      type: "agent_runtime",
      transport: "api",
      stepType: payload.stepType || "",
      status: "started",
      label: "已开始调用 Hermes API",
      message: `正在请求 Hermes API 执行 ${payload.stepType || "step"}。`,
      elapsedMs: 0
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseURL}/internal/steps/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      let body = null;
      try {
        body = await response.json();
      } catch (_error) {
        const error = new Error("Hermes returned an invalid JSON response");
        error.code = "hermes_invalid_response";
        throw error;
      }

      if (!response.ok) {
        const error = new Error(body?.error || "Hermes step execution failed");
        error.code = body?.code || "hermes_request_failed";
        error.details = body?.details || null;
        throw error;
      }

      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "api",
        stepType: payload.stepType || "",
        status: "completed",
        label: "Hermes API 已返回",
        message: `Hermes API 已完成 ${payload.stepType || "step"}。`
      });
      return body;
    } catch (error) {
      if (error?.code === "hermes_invalid_response") {
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 返回非法 JSON",
          message: "Hermes API 返回了无法解析的 JSON 响应。"
        });
        throw error;
      }
      if (error?.name === "AbortError") {
        const timeoutError = new Error(`Hermes request timed out after ${timeoutMs}ms`);
        timeoutError.code = "hermes_timeout";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 请求超时",
          message: timeoutError.message
        });
        throw timeoutError;
      }
      if (error instanceof TypeError) {
        const connectionError = new Error(`Hermes is unavailable at ${this.baseURL}`);
        connectionError.code = "hermes_unavailable";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "api",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes API 不可用",
          message: connectionError.message
        });
        throw connectionError;
      }
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "api",
        stepType: payload.stepType || "",
        status: "failed",
        level: "error",
        label: "Hermes API 请求失败",
        message: error?.message || "Hermes API 请求失败"
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeCliStep(payload = {}, runtime = {}) {
    const prompt = buildCliPrompt(payload);
    const args = ["chat", "-q", prompt, "-Q", "--source", "tool", "--max-turns", String(this.maxTurns), "--yolo"];
    const startedAt = Date.now();
    const timeoutMs = this.getTimeoutMsForStep(payload.stepType);
    let heartbeatTimer = null;

    try {
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "cli",
        stepType: payload.stepType || "",
        status: "started",
        command: this.command,
        label: "已启动本机 Hermes CLI",
        message: `正在调用本机 Hermes 执行 ${payload.stepType || "step"}。`,
        startedAt: new Date(startedAt).toISOString()
      });
      heartbeatTimer = setInterval(() => {
        void emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "heartbeat",
          label: "Hermes CLI 仍在运行",
          message: `本机 Hermes 正在执行 ${payload.stepType || "step"}，已运行 ${Math.round((Date.now() - startedAt) / 1000)} 秒。`,
          startedAt: new Date(startedAt).toISOString(),
          heartbeatAt: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt
        });
      }, this.heartbeatIntervalMs);
      const { stdout = "", stderr = "" } = await this.commandRunner(this.command, args, {
        cwd: this.workdir,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1" }
      });
      const { body, sessionId } = parseCliResponse(stdout);
      let parsed = null;
      try {
        parsed = JSON.parse(extractJsonText(body));
      } catch (_error) {
        const invalidError = new Error("Hermes returned an invalid JSON response");
        invalidError.code = "hermes_invalid_response";
        invalidError.rawOutput = body;
        invalidError.sessionId = sessionId;
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes CLI 返回非法 JSON",
          message: "Hermes CLI 返回了无法解析的 JSON 响应。",
          sessionId,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt,
          stdoutExcerpt: clipText(body, 2000),
          stderrExcerpt: clipText(stderr, 2000)
        });
        throw invalidError;
      }

      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "cli",
        stepType: payload.stepType || "",
        status: "completed",
        label: "Hermes CLI 已返回",
        message: `本机 Hermes 已完成 ${payload.stepType || "step"}。`,
        sessionId,
        startedAt: new Date(startedAt).toISOString(),
        heartbeatAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        stdoutExcerpt: clipText(body, 2000),
        stderrExcerpt: clipText(stderr, 2000)
      });
      return {
        status: "succeeded",
        stepType: payload.stepType,
        artifact: normalizeCliArtifact(payload.stepType, parsed),
        metrics: {},
        logs: stderr ? [clipText(stderr, 4000)] : [],
        error: null,
        sessionId
      };
    } catch (error) {
      if (error?.code === "hermes_invalid_response") {
        throw error;
      }
      if (error?.code === "ENOENT") {
        const unavailableError = new Error(`Hermes CLI is unavailable: ${this.command}`);
        unavailableError.code = "hermes_unavailable";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes CLI 不可用",
          message: unavailableError.message,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt
        });
        throw unavailableError;
      }
      if (error?.killed || error?.signal === "SIGTERM") {
        const timeoutError = new Error(`Hermes CLI request timed out after ${timeoutMs}ms`);
        timeoutError.code = "hermes_timeout";
        await emitHermesEvent(runtime.onEvent, {
          type: "agent_runtime",
          transport: "cli",
          stepType: payload.stepType || "",
          status: "failed",
          level: "error",
          label: "Hermes CLI 请求超时",
          message: timeoutError.message,
          startedAt: new Date(startedAt).toISOString(),
          elapsedMs: Date.now() - startedAt
        });
        throw timeoutError;
      }
      const requestError = new Error(error?.stderr || error?.message || "Hermes CLI request failed");
      requestError.code = error?.code || "hermes_request_failed";
      await emitHermesEvent(runtime.onEvent, {
        type: "agent_runtime",
        transport: "cli",
        stepType: payload.stepType || "",
        status: "failed",
        level: "error",
        label: "Hermes CLI 请求失败",
        message: requestError.message,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs: Date.now() - startedAt,
        stderrExcerpt: clipText(error?.stderr || "", 2000)
      });
      throw requestError;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  async executeStep(payload = {}, runtime = {}) {
    if (this.transport === "api") {
      return this.executeApiStep(payload, runtime);
    }
    return this.executeCliStep(payload, runtime);
  }
}
