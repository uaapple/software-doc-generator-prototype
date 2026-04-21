import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { ValidationService } from "./validation-service.js";
import { LlmProfileService } from "./llm-profile-service.js";
import { ModuleSkillService } from "./module-skill-service.js";
import { HermesAgentClient } from "./hermes-agent-client.js";
import { recallSkillInventory } from "./software-requirement-agent-shared.js";

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function buildTraces(items) {
  return items.flatMap((requirement) =>
    (requirement.sourceRefs || []).map((sourceRef) => ({
      requirementId: requirement.id,
      requirementCode: requirement.requirementId,
      fileName: sourceRef.fileName,
      location: sourceRef.location,
      excerpt: sourceRef.excerpt
    }))
  );
}

function buildRunningSummary(documentType) {
  if (documentType === "detail_design") return "\u6b63\u5728\u751f\u6210\u8be6\u7ec6\u8bbe\u8ba1";
  if (documentType === "hil_test_case") return "\u6b63\u5728\u751f\u6210 HIL \u7528\u4f8b";
  return "\u6b63\u5728\u751f\u6210\u8f6f\u4ef6\u9700\u6c42";
}

function countEvidence(extractions = []) {
  return extractions.reduce((total, item) => total + (Array.isArray(item.evidence) ? item.evidence.length : 0), 0);
}

function buildSkillInventory(skills = {}) {
  const compiledPack = skills.__compiledSkillPack || {};
  const items = Array.isArray(compiledPack.flatItems) ? compiledPack.flatItems : [];
  return {
    selectedProfiles: Array.isArray(compiledPack.selectedProfiles) ? compiledPack.selectedProfiles : skills.__profiles || [],
    items: items.map((item) => ({
      skillCode: item.skillCode || "",
      layer: item.layer || "",
      profileKey: item.profileKey || "",
      kind: item.kind || "",
      title: item.title || "",
      content: item.content || "",
      order: item.order || 0
    }))
  };
}

function isTaskDeletedError(error) {
  return error?.message === "Task not found";
}

const DEBUG_RAW_RESPONSE_LIMIT = 200000;
const DEBUG_STACK_LIMIT = 40000;

function clipDebugText(text = "", maxLength = DEBUG_RAW_RESPONSE_LIMIT) {
  const normalized = typeof text === "string" ? text : "";
  return {
    text: normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized,
    length: normalized.length,
    truncated: normalized.length > maxLength
  };
}

function logGenerationDebug(event, payload = {}) {
  try {
    console.log(
      `[generation-debug] ${JSON.stringify({
        at: new Date().toISOString(),
        event,
        ...payload
      })}`
    );
  } catch (_error) {
    console.log(`[generation-debug] ${event}`);
  }
}

function assertHermesStepResponse(stepType, response = {}) {
  if (!response || response.status !== "succeeded") {
    throw new Error(`Hermes step failed: ${stepType}`);
  }
  return response.artifact || {};
}

function assertValidExtractions(extractions = []) {
  if (!Array.isArray(extractions)) {
    throw new Error("Hermes material_extract must return an extraction array");
  }
  for (const extraction of extractions) {
    if (!Array.isArray(extraction.evidence)) {
      throw new Error("Hermes extraction is missing evidence array");
    }
    for (const evidence of extraction.evidence) {
      if (!evidence?.fileName || !evidence?.location || !evidence?.excerpt || !evidence?.fileRole) {
        throw new Error("Hermes evidence item is missing required fields");
      }
    }
  }
}

function assertValidRecalledAtoms(items = [], inventory = {}) {
  if (!Array.isArray(items)) {
    throw new Error("Hermes atom_recall must return an item array");
  }
  const allowedCodes = new Set((inventory.items || []).map((item) => item.skillCode).filter(Boolean));
  for (const item of items) {
    if (!item?.skillCode || !allowedCodes.has(item.skillCode)) {
      throw new Error("Hermes recalled an atom outside the effective skill inventory");
    }
    if (!item.matchedReason) {
      throw new Error("Hermes recalled atom is missing matchedReason");
    }
  }
}

function assertValidOutline(outline = {}) {
  if (!outline || !Array.isArray(outline.sections) || !outline.sections.length) {
    throw new Error("Hermes outline_build must return at least one outline section");
  }
}

function assertValidResultItems(resultItems = [], extractions = []) {
  if (!Array.isArray(resultItems) || !resultItems.length) {
    throw new Error("Hermes content_generate must return at least one result item");
  }
  const evidenceKeys = new Set(
    extractions.flatMap((item) =>
      (item.evidence || []).map((evidence) => `${evidence.fileName}::${evidence.location}::${evidence.excerpt}`)
    )
  );

  for (const item of resultItems) {
    if (!item?.title || !item?.requirementText || !Array.isArray(item.sourceRefs)) {
      throw new Error("Hermes generated result item is missing required fields");
    }
    for (const sourceRef of item.sourceRefs) {
      const key = `${sourceRef.fileName}::${sourceRef.location}::${sourceRef.excerpt}`;
      if (!evidenceKeys.has(key)) {
        throw new Error("Hermes generated a sourceRef outside the extracted evidence set");
      }
    }
  }
}

function formatElapsedSeconds(elapsedMs = 0) {
  const seconds = Math.max(0, Math.round((Number(elapsedMs || 0) || 0) / 1000));
  return `${seconds} 秒`;
}

function buildHermesStepDescriptor(stepType = "") {
  if (stepType === "outline_build") {
    return {
      stage: "outline_build",
      runningLabel: "正在调用本机 Hermes 生成提纲",
      actionLabel: "生成提纲",
      runningPercent: 68
    };
  }
  if (stepType === "content_generate") {
    return {
      stage: "content_generate",
      runningLabel: "正在调用本机 Hermes 生成正式内容",
      actionLabel: "生成正式内容",
      runningPercent: 82
    };
  }
  return {
    stage: stepType || "agent_runtime",
    runningLabel: "正在调用本机 Hermes",
    actionLabel: stepType || "agent step",
    runningPercent: 60
  };
}

export class PipelineService {
  constructor(projectService) {
    this.projectService = projectService;
    this.skillLoader = new SkillLoader();
    this.templateService = new TemplateService();
    this.extractionService = new ExtractionService();
    this.llmService = new LlmService();
    this.validationService = new ValidationService();
    this.skillBundleService = new SkillBundleService();
    this.llmProfileService = new LlmProfileService();
    this.moduleSkillService = new ModuleSkillService();
    this.hermesAgentClient = new HermesAgentClient();
  }

  async getMeta() {
    const [skills, template, llmMeta, llmConfigured] = await Promise.all([
      this.skillLoader.loadAll(),
      this.templateService.getTemplate(),
      this.llmProfileService.getMeta(),
      this.llmService.hasAvailableProfile()
    ]);

    return {
      template,
      skills: Object.keys(skills),
      llmConfigured,
      llm: llmMeta
    };
  }

  async finalizeSoftwareRequirementGeneration({
    projectId,
    moduleId,
    taskId,
    project,
    module,
    inputAssets,
    options = {},
    selectedProfile,
    updateTaskProgress
  }) {
    const contextProject = {
      name: `${project.name} / ${module.name}`,
      description: module.description || project.description,
      language: project.language,
      documentType: "software_requirement",
      domain: module.domain || "embedded_vcu",
      moduleSkillKey: module.moduleSkillKey || ""
    };
    const hermesExecutionMode =
      this.hermesAgentClient.transport === "cli" ? "hermes_agent_cli" : "hermes_agent_api";
    const hermesEndpoint =
      this.hermesAgentClient.transport === "cli" ? this.hermesAgentClient.command : this.hermesAgentClient.baseURL;
    const llmProfile = selectedProfile
      ? {
          id: selectedProfile.id,
          provider: this.hermesAgentClient.transport === "cli" ? "hermes_cli" : selectedProfile.provider,
          name: this.hermesAgentClient.transport === "cli" ? "Installed Hermes CLI" : selectedProfile.name,
          model: this.hermesAgentClient.transport === "cli" ? "configured-in-hermes" : selectedProfile.model,
          baseURL: this.hermesAgentClient.transport === "cli" ? "" : selectedProfile.baseURL,
          executionMode: hermesExecutionMode,
          agentEndpoint: hermesEndpoint
        }
      : {
          id: "",
          provider: this.hermesAgentClient.transport === "cli" ? "hermes_cli" : "local_fallback",
          name: this.hermesAgentClient.transport === "cli" ? "Installed Hermes CLI" : "Hermes 本地回退",
          model: this.hermesAgentClient.transport === "cli" ? "configured-in-hermes" : "",
          baseURL: "",
          executionMode: hermesExecutionMode,
          agentEndpoint: hermesEndpoint
        };

    const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
    let composedSkills = null;
    try {
      composedSkills = await this.skillLoader.loadFromRegistryContext(
        {
          documentType: "software_requirement",
          domain: module.domain || "embedded_vcu",
          moduleSkillKey: module.moduleSkillKey || ""
        },
        skillDir
      );
    } catch (_error) {
      composedSkills = await this.skillLoader.loadForContext(
        {
          documentType: "software_requirement",
          domain: module.domain || "embedded_vcu",
          moduleSkillKey: module.moduleSkillKey || ""
        },
        skillDir
      );
    }

    const template = await this.templateService.getTemplate("software_requirement");
    const domainKnowledge = composedSkills["domain-knowledge.json"] || {};
    const effectiveSkillInventory = buildSkillInventory(composedSkills);

    await updateTaskProgress(
      {
        stage: "effective_skill_resolve",
        label: "正在解析生效技能",
        message: `已命中 ${effectiveSkillInventory.selectedProfiles.length || 0} 层 profile，准备下发 ${effectiveSkillInventory.items.length} 条 skill atom。`,
        percent: 22
      },
      {
        timelineEntry: {
          stage: "effective_skill_resolve",
          label: "解析生效技能",
          message: `已完成 software_requirement skill inventory 解析，命中 ${effectiveSkillInventory.items.length} 条 atom。`,
          level: "info"
        }
      }
    );

    if (!effectiveSkillInventory.items.length) {
      throw new Error("当前 software_requirement skill inventory 为空，无法继续执行 Hermes 生成链路");
    }

    const runHermesStep = async (stepType, inputArtifact) => {
      const descriptor = buildHermesStepDescriptor(stepType);
      const startedAt = new Date().toISOString();
      await updateTaskProgress(
        {
          stage: descriptor.stage,
          label: descriptor.runningLabel,
          message: `已启动 ${this.hermesAgentClient.transport === "cli" ? "本机 Hermes CLI" : "Hermes API"}，等待返回 ${descriptor.actionLabel} 结果。`,
          percent: descriptor.runningPercent,
          current: inputAssets.length,
          total: inputAssets.length
        },
        {
          timelineEntry: {
            stage: descriptor.stage,
            label: descriptor.runningLabel,
            message: `已开始调用 ${this.hermesAgentClient.transport === "cli" ? "本机 Hermes CLI" : "Hermes API"} 执行 ${descriptor.actionLabel}。`,
            level: "info"
          },
          debug: {
            agent: {
              transport: this.hermesAgentClient.transport,
              currentStep: stepType,
              status: "running",
              startedAt,
              lastEventAt: startedAt,
              elapsedMs: 0
            }
          }
        }
      );

      const response = await this.hermesAgentClient.executeStep(
        {
          taskId,
          stepType,
          allowedPaths: [],
          inputArtifact,
          skillInventory: effectiveSkillInventory,
          llmProfileSnapshot: llmProfile
        },
        {
          onEvent: async (event = {}) => {
            const status = String(event.status || "").trim();
            const eventAt = event.at || new Date().toISOString();
            const debugUpdate = {
              agent: {
                transport: event.transport || this.hermesAgentClient.transport,
                currentStep: event.stepType || stepType,
                status: status || "running",
                startedAt: event.startedAt || startedAt,
                lastHeartbeatAt: event.heartbeatAt || "",
                lastEventAt: eventAt,
                sessionId: event.sessionId || "",
                stdoutExcerpt: event.stdoutExcerpt || "",
                stderrExcerpt: event.stderrExcerpt || "",
                elapsedMs: Number(event.elapsedMs || 0) || 0
              }
            };
            const debugEvent = {
              stage: descriptor.stage,
              label: event.label || descriptor.runningLabel,
              message: event.message || `${descriptor.actionLabel} 状态已更新。`,
              level: event.level || (status === "failed" ? "error" : "info"),
              type: event.type || "agent_runtime",
              status,
              transport: event.transport || this.hermesAgentClient.transport,
              stepType: event.stepType || stepType,
              sessionId: event.sessionId || "",
              startedAt: event.startedAt || startedAt,
              heartbeatAt: event.heartbeatAt || "",
              elapsedMs: Number(event.elapsedMs || 0) || 0,
              stdoutExcerpt: event.stdoutExcerpt || "",
              stderrExcerpt: event.stderrExcerpt || ""
            };

            const runningMessage =
              status === "heartbeat"
                ? `${descriptor.runningLabel}，已运行 ${formatElapsedSeconds(event.elapsedMs || 0)}，最近一次心跳已写入运行日志。`
                : status === "started"
                  ? `已启动 ${this.hermesAgentClient.transport === "cli" ? "本机 Hermes CLI" : "Hermes API"}，等待返回 ${descriptor.actionLabel} 结果。`
                  : null;

            if (status === "failed") {
              await updateTaskProgress(
                {
                  stage: "failed",
                  label: "任务执行失败",
                  message: event.message || `${descriptor.actionLabel} 失败`,
                  percent: 100
                },
                {
                  status: "failed",
                  errorMessage: event.message || `${descriptor.actionLabel} 失败`,
                  summary: event.message || `${descriptor.actionLabel} 失败`,
                  debug: debugUpdate,
                  debugEvent,
                  timelineEntry: {
                    stage: "failed",
                    label: event.label || "任务失败",
                    message: event.message || `${descriptor.actionLabel} 失败`,
                    level: event.level || "error"
                  }
                }
              );
              return;
            }

            if (runningMessage) {
              await updateTaskProgress(
                {
                  stage: descriptor.stage,
                  label: descriptor.runningLabel,
                  message: runningMessage,
                  percent: descriptor.runningPercent,
                  current: inputAssets.length,
                  total: inputAssets.length
                },
                {
                  debug: debugUpdate,
                  debugEvent
                }
              );
              return;
            }

            await updateTaskProgress(
              {},
              {
                debug: debugUpdate,
                debugEvent
              }
            );
          }
        }
      );

      return assertHermesStepResponse(stepType, response);
    };

    let extractions = [];
    if (this.hermesAgentClient.transport === "cli") {
      extractions = await this.extractionService.extractFiles(
        {
          files: inputAssets.map((asset) => ({
            id: asset.id,
            role: asset.role,
            fileRole: asset.role,
            originalName: asset.originalName,
            absolutePath: asset.absolutePath,
            relativePath: asset.relativePath,
            storedName: asset.storedName,
            mimeType: asset.mimeType,
            size: asset.size
          }))
        },
        { allowStoredNameFallback: true }
      );
    } else {
      const extractArtifact = assertHermesStepResponse(
        "material_extract",
        await this.hermesAgentClient.executeStep({
          taskId,
          stepType: "material_extract",
          allowedPaths: inputAssets.map((asset) => asset.absolutePath).filter(Boolean),
          inputArtifact: {
            files: inputAssets.map((asset) => ({
              id: asset.id,
              role: asset.role,
              fileRole: asset.role,
              originalName: asset.originalName,
              absolutePath: asset.absolutePath,
              relativePath: asset.relativePath,
              storedName: asset.storedName,
              mimeType: asset.mimeType,
              size: asset.size
            }))
          },
          skillInventory: effectiveSkillInventory,
          llmProfileSnapshot: llmProfile
        })
      );
      extractions = Array.isArray(extractArtifact.extractions) ? extractArtifact.extractions : [];
    }
    assertValidExtractions(extractions);
    const evidence = extractions.flatMap((item) => item.evidence || []);

    await updateTaskProgress(
      {
        stage: "material_extract",
        label: "正在抽取输入证据",
        message:
          this.hermesAgentClient.transport === "cli"
            ? `后端本地抽取已完成 ${inputAssets.length} 个输入文件，共得到 ${evidence.length} 条证据。`
            : `Hermes 已完成 ${inputAssets.length} 个输入文件抽取，共得到 ${evidence.length} 条证据。`,
        percent: 42,
        current: inputAssets.length,
        total: inputAssets.length
      },
      {
        metrics: {
          extractionFileCount: inputAssets.length,
          extractionEvidenceCount: evidence.length
        },
        timelineEntry: {
          stage: "material_extract",
          label: "抽取输入证据",
          message: `已完成文件抽取，得到 ${evidence.length} 条结构化证据。`,
          level: "info"
        }
      }
    );

    let recalledAtoms = [];
    if (this.hermesAgentClient.transport === "cli") {
      recalledAtoms = recallSkillInventory(effectiveSkillInventory, evidence);
    } else {
      const recallArtifact = assertHermesStepResponse(
        "atom_recall",
        await this.hermesAgentClient.executeStep({
          taskId,
          stepType: "atom_recall",
          allowedPaths: [],
          inputArtifact: { evidence },
          skillInventory: effectiveSkillInventory,
          llmProfileSnapshot: llmProfile
        })
      );
      recalledAtoms = Array.isArray(recallArtifact.items) ? recallArtifact.items : [];
    }
    assertValidRecalledAtoms(recalledAtoms, effectiveSkillInventory);

    await updateTaskProgress(
      {
        stage: "atom_recall",
        label: "正在召回相关技能原子",
        message:
          this.hermesAgentClient.transport === "cli"
            ? `后端已基于有效 skill inventory 召回 ${recalledAtoms.length} 条相关 skill atom。`
            : `Hermes 已召回 ${recalledAtoms.length} 条相关 skill atom。`,
        percent: 56
      },
      {
        timelineEntry: {
          stage: "atom_recall",
          label: "召回技能原子",
          message: `召回完成，得到 ${recalledAtoms.length} 条候选 atom。`,
          level: "info"
        }
      }
    );

    const outline = await runHermesStep("outline_build", { evidence, recalledAtoms });
    assertValidOutline(outline);

    await updateTaskProgress(
      {
        stage: "outline_build",
        label: "正在生成需求提纲",
        message: `Hermes 已构建 ${outline.sections.length} 个主题分解。`,
        percent: 68
      },
      {
        timelineEntry: {
          stage: "outline_build",
          label: "生成需求提纲",
          message: `提纲生成完成，覆盖 ${outline.sections.length} 个主题。`,
          level: "info"
        }
      }
    );

    const contentArtifact = await runHermesStep("content_generate", {
      project: contextProject,
      template,
      evidence,
      recalledAtoms,
      outline
    });
    const resultItems = Array.isArray(contentArtifact.items) ? contentArtifact.items : [];

    await updateTaskProgress(
      {
        stage: "content_postprocess",
        label: "正在校验 Hermes 返回内容",
        message: `Hermes 已返回 ${resultItems.length} 条候选软件需求，正在校验来源引用与结果结构。`,
        percent: 84
      },
      {
        debug: {
          postProcess: {
            lastStage: "content_generate_returned"
          }
        },
        debugEvent: {
          stage: "content_generate_returned",
          label: "Hermes 已返回结果",
          message: `已收到 ${resultItems.length} 条候选软件需求，准备进行结果校验。`,
          level: "info"
        }
      }
    );

    assertValidResultItems(resultItems, extractions);

    await updateTaskProgress(
      {
        stage: "content_generate",
        label: "正在生成软件需求",
        message: `Hermes 已返回 ${resultItems.length} 条候选软件需求，准备执行规则校验。`,
        percent: 82
      },
      {
        llmProfile,
        debug: {
          postProcess: {
            lastStage: "result_items_validated"
          }
        },
        debugEvent: {
          stage: "result_items_validated",
          label: "结果校验通过",
          message: `候选结果已通过来源引用与结构校验，共 ${resultItems.length} 条。`,
          level: "info"
        },
        timelineEntry: {
          stage: "content_generate",
          label: "生成软件需求",
          message: `内容生成完成，得到 ${resultItems.length} 条候选结果。`,
          level: "info"
        }
      }
    );

    const conflicts = this.validationService.validate(resultItems, { domainKnowledge, documentType: "software_requirement" });
    const traces = buildTraces(resultItems);

    await updateTaskProgress(
      {
        stage: "rule_validate",
        label: "正在校验生成结果",
        message: `规则校验完成，识别到 ${conflicts.length} 个冲突，准备保存任务结果。`,
        percent: 92
      },
      {
        metrics: {
          generatedItemCount: resultItems.length,
          conflictCount: conflicts.length
        },
        timelineEntry: {
          stage: "rule_validate",
          label: "规则校验",
          message: `已完成规则校验，得到 ${traces.length} 条追溯信息和 ${conflicts.length} 个冲突。`,
          level: "info"
        }
      }
    );

    const updatedTask = await this.projectService.updateGenerationTask(projectId, moduleId, "software_requirement", taskId, {
      status: "completed",
      resultItems,
      extractions,
      traces,
      conflicts,
      llmProfile,
      metrics: {
        extractionFileCount: inputAssets.length,
        extractionEvidenceCount: evidence.length,
        generatedItemCount: resultItems.length,
        conflictCount: conflicts.length
      },
      progress: {
        stage: "completed",
        label: "任务已完成",
        message: `Hermes 已生成 ${resultItems.length} 条软件需求，可开始审核。`,
        percent: 100
      },
      timelineEntry: {
        stage: "persist_result",
        label: "保存结果",
        message: `任务结果已写入模块工作区，可在历史任务中查看详情。`,
        level: "info"
      },
      summary: llmProfile.model
        ? `通过 Hermes + ${llmProfile.name} 生成 ${resultItems.length} 条软件需求`
        : `通过 Hermes 本地回退生成 ${resultItems.length} 条软件需求`
    });

    return {
      projectId,
      moduleId,
      documentType: "software_requirement",
      task: updatedTask
    };
  }

  async generate(projectId, options = {}) {
    const project = await this.projectService.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.files.length) {
      throw new Error("No files uploaded");
    }

    const extractions = await this.extractionService.extractFiles(project);
    const requirements = await this.llmService.generateDocumentItems(project, extractions, options);
    const domainKnowledge = await this.skillBundleService.getDomainKnowledge(options.skillBundleId, {
      documentType: project.documentType,
      domain: project.domain || "",
      moduleSkillKey: project.moduleSkillKey || ""
    });
    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const conflicts = this.validationService.validate(requirements, { domainKnowledge, documentType: project.documentType });
    const traces = buildTraces(requirements);

    const saved = await this.projectService.updateGeneratedArtifacts(project.id, {
      extractions,
      requirements,
      traces,
      conflicts,
      llmProfile: selectedProfile
        ? {
            id: selectedProfile.id,
            provider: selectedProfile.provider,
            name: selectedProfile.name,
            model: selectedProfile.model,
            baseURL: selectedProfile.baseURL
          }
        : null
    });

    return saved;
  }

  async finalizeModuleGeneration(projectId, moduleId, normalizedDocumentType, inputAssets, options = {}) {
    const taskId = options.taskId || "";
    const updateTaskProgress = async (progress = {}, extraUpdates = {}) =>
      this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, taskId, {
        progress,
        ...extraUpdates
      });

    try {
      const saveStartedAt = () => Date.now();
      const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
      logGenerationDebug("task_started", {
        projectId,
        moduleId,
        taskId,
        documentType: normalizedDocumentType,
        inputAssetCount: inputAssets.length
      });
      const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
      const llmProfile = selectedProfile
        ? {
            id: selectedProfile.id,
            provider: selectedProfile.provider,
            name: selectedProfile.name,
            model: selectedProfile.model,
            baseURL: selectedProfile.baseURL
          }
        : null;
      const contextProject = {
        name: `${project.name} / ${module.name}`,
        description: module.description || project.description,
        language: project.language,
        documentType: normalizedDocumentType,
        domain: module.domain || "embedded_vcu",
        moduleSkillKey: module.moduleSkillKey || ""
      };

      const initStage = normalizedDocumentType === "software_requirement" ? "task_init" : "module_bootstrap";
      await updateTaskProgress(
        {
          stage: initStage,
          label: normalizedDocumentType === "software_requirement" ? "正在初始化任务上下文" : "正在准备模块上下文",
          message:
            normalizedDocumentType === "software_requirement"
              ? "正在校验输入资产、模块技能和 Hermes 执行上下文。"
              : "正在校验模块资料、加载技能与生成上下文。",
          percent: 10
        },
        {
          timelineEntry: {
            stage: initStage,
            label: normalizedDocumentType === "software_requirement" ? "初始化任务上下文" : "准备模块上下文",
            message:
              normalizedDocumentType === "software_requirement"
                ? "已开始准备 Hermes 软件需求生成任务。"
                : "已开始准备模块技能、文档类型和输入资产。",
            level: "info"
          }
        }
      );

      const readiness = await this.moduleSkillService.ensureModuleReady(project, module, normalizedDocumentType, {
        llmProfileId: options.llmProfileId || ""
      });
      if (readiness.bootstrapped) {
        await this.projectService.updateModuleSkillState(projectId, moduleId, {
          skillStatus: "bootstrapped",
          skillSource: {
            type: "bootstrap",
            documentType: normalizedDocumentType,
            strategy: readiness.bootstrapStrategy || "rule_based",
            llmProfileName: readiness.bootstrapLlmProfile?.name || ""
          },
          seededAt: new Date().toISOString()
        });
      }

      if (normalizedDocumentType === "software_requirement") {
        return this.finalizeSoftwareRequirementGeneration({
          projectId,
          moduleId,
          taskId,
          project,
          module,
          inputAssets,
          options,
          selectedProfile,
          updateTaskProgress
        });
      }

      const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
      const composedSkills = await this.skillLoader.loadForContext(
        {
          documentType: normalizedDocumentType,
          domain: module.domain || "embedded_vcu",
          moduleSkillKey: module.moduleSkillKey || ""
        },
        skillDir
      );
      const domainKnowledge = composedSkills["domain-knowledge.json"] || {};

      await updateTaskProgress(
        {
          stage: "extracting_inputs",
          label: "正在解析输入资料",
          message: `准备解析 ${inputAssets.length} 个输入资产。`,
          percent: 22,
          current: 0,
          total: inputAssets.length
        },
        {
          timelineEntry: {
            stage: "extracting_inputs",
            label: "解析输入资料",
            message: `开始解析 ${inputAssets.length} 个输入资产。`,
            level: "info"
          }
        }
      );

      const extractions = await this.extractionService.extractFiles(
        { files: inputAssets },
        {
          onProgress: async (event) => {
            if (event.phase === "extracting_file") {
              await updateTaskProgress({
                stage: "extracting_inputs",
                label: "正在解析输入资料",
                message: `正在解析第 ${event.current}/${event.total} 个文件：${event.fileName}`,
                percent: Math.min(48, 22 + Math.round((event.current / Math.max(event.total, 1)) * 22)),
                current: event.current,
                total: event.total
              });
            }
            if (event.phase === "file_extracted") {
              await updateTaskProgress(
                {
                  stage: "extracting_inputs",
                  label: "正在解析输入资料",
                  message: `已完成 ${event.current}/${event.total} 个文件：${event.fileName}`,
                  percent: Math.min(50, 24 + Math.round((event.current / Math.max(event.total, 1)) * 24)),
                  current: event.current,
                  total: event.total
                },
                {
                  timelineEntry: {
                    stage: "extracting_inputs",
                    label: "文件解析完成",
                    message: `${event.fileName} 解析完成，提取 ${event.evidenceCount || 0} 条证据。`,
                    level: "info"
                  }
                }
              );
            }
          }
        }
      );

      await updateTaskProgress(
        {
          stage: "llm_generating",
          label: "正在请求模型生成",
          message: `已提取 ${countEvidence(extractions)} 条证据，准备请求模型生成。`,
          percent: 58
        },
        {
          metrics: {
            extractionFileCount: inputAssets.length,
            extractionEvidenceCount: countEvidence(extractions)
          },
          timelineEntry: {
            stage: "llm_generating",
            label: "模型生成",
            message: `输入解析完成，准备调用 ${selectedProfile?.name || "本地回退"}。`,
            level: "info"
          }
        }
      );

      let llmDurationMs = 0;
      const resultItems = await this.llmService.generateDocumentItems(contextProject, extractions, {
        ...options,
        onProgress: async (event) => {
          if (event.phase === "fallback_generation") {
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "正在使用本地回退生成",
                message: event.message,
                percent: 68
              },
              {
                timelineEntry: {
                  stage: "llm_generating",
                  label: "本地回退",
                  message: event.message,
                  level: "warning"
                }
              }
            );
          }
          if (event.phase === "llm_request_started") {
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "正在等待模型返回",
                message: event.message,
                percent: 70
              },
              {
                timelineEntry: {
                  stage: "llm_generating",
                  label: "模型请求已发出",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_request_completed") {
            llmDurationMs = Number(event.durationMs || 0) || 0;
            logGenerationDebug("llm_request_completed", {
              projectId,
              moduleId,
              taskId,
              durationMs: llmDurationMs,
              model: selectedProfile?.model || "",
              provider: selectedProfile?.provider || ""
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "模型已返回，正在整理输出",
                message: `${event.message}${llmDurationMs ? `（耗时 ${llmDurationMs} ms）` : ""}`,
                percent: 78
              },
              {
                metrics: { llmDurationMs },
                timelineEntry: {
                  stage: "llm_generating",
                  label: "模型已返回",
                  message: `${selectedProfile?.name || "模型"} 已返回结果${llmDurationMs ? `，耗时 ${llmDurationMs} ms` : ""}。`,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_payload_parsed") {
            const rawCapture = clipDebugText(event.rawResponseText || "", DEBUG_RAW_RESPONSE_LIMIT);
            logGenerationDebug("llm_payload_parsed", {
              projectId,
              moduleId,
              taskId,
              rawItemCount: Number(event.rawItemCount || 0) || 0,
              rawResponseLength: rawCapture.length,
              rawResponseTruncated: rawCapture.truncated
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "模型结果已解析，正在规范化条目",
                message: event.message,
                percent: 80
              },
              {
                debug: {
                  llm: {
                    requestModel: selectedProfile?.model || "",
                    requestProvider: selectedProfile?.provider || "",
                    rawResponseText: rawCapture.text,
                    rawResponseLength: rawCapture.length,
                    rawResponseTruncated: rawCapture.truncated,
                    parsedTopLevelKeys: Array.isArray(event.parsedTopLevelKeys) ? event.parsedTopLevelKeys : [],
                    rawItemCount: Number(event.rawItemCount || 0) || 0
                  },
                  postProcess: {
                    lastStage: "llm_payload_parsed"
                  }
                },
                debugEvent: {
                  stage: "llm_payload_parsed",
                  label: "模型结果已解析",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_items_normalized") {
            logGenerationDebug("llm_items_normalized", {
              projectId,
              moduleId,
              taskId,
              normalizeResultItemsMs: Number(event.normalizeResultItemsMs || 0) || 0,
              normalizedItemCount: Number(event.normalizedItemCount || 0) || 0
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "已完成条目规范化，正在应用技能规则",
                message: event.message,
                percent: 82
              },
              {
                debug: {
                  postProcess: {
                    lastStage: "llm_items_normalized",
                    normalizeResultItemsMs: Number(event.normalizeResultItemsMs || 0) || 0
                  }
                },
                debugEvent: {
                  stage: "llm_items_normalized",
                  label: "条目规范化完成",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_policies_applied") {
            logGenerationDebug("llm_policies_applied", {
              projectId,
              moduleId,
              taskId,
              applyPoliciesMs: Number(event.applyPoliciesMs || 0) || 0,
              totalAfterModelMs: Number(event.totalAfterModelMs || 0) || 0,
              finalItemCount: Number(event.finalItemCount || 0) || 0
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "已完成技能规则处理，准备进入校验",
                message: event.message,
                percent: 84
              },
              {
                metrics: {
                  generatedItemCount: Number(event.finalItemCount || 0) || 0
                },
                debug: {
                  postProcess: {
                    lastStage: "llm_policies_applied",
                    applyPoliciesMs: Number(event.applyPoliciesMs || 0) || 0,
                    totalAfterModelMs: Number(event.totalAfterModelMs || 0) || 0
                  }
                },
                debugEvent: {
                  stage: "llm_policies_applied",
                  label: "技能规则处理完成",
                  message: event.message,
                  level: "info"
                }
              }
            );
          }
          if (event.phase === "llm_postprocess_failed") {
            const rawCapture = clipDebugText(event.rawResponseText || "", DEBUG_RAW_RESPONSE_LIMIT);
            const stackCapture = clipDebugText(event.errorStack || "", DEBUG_STACK_LIMIT);
            logGenerationDebug("llm_postprocess_failed", {
              projectId,
              moduleId,
              taskId,
              stage: event.stage || "llm_postprocess_failed",
              message: event.message || "",
              rawResponseLength: rawCapture.length,
              rawResponseTruncated: rawCapture.truncated
            });
            await updateTaskProgress(
              {
                stage: "llm_generating",
                label: "模型后处理失败",
                message: event.message || "模型结果后处理失败",
                percent: 79
              },
              {
                debug: {
                  llm: {
                    requestModel: selectedProfile?.model || "",
                    requestProvider: selectedProfile?.provider || "",
                    rawResponseText: rawCapture.text,
                    rawResponseLength: rawCapture.length,
                    rawResponseTruncated: rawCapture.truncated
                  },
                  postProcess: {
                    lastStage: event.stage || "llm_postprocess_failed"
                  },
                  lastError: {
                    at: new Date().toISOString(),
                    stage: event.stage || "llm_postprocess_failed",
                    message: event.message || "模型结果后处理失败",
                    stack: stackCapture.text
                  }
                },
                debugEvent: {
                  stage: event.stage || "llm_postprocess_failed",
                  label: "模型后处理失败",
                  message: event.message || "模型结果后处理失败",
                  level: "error"
                }
              }
            );
          }
        }
      });

      const validationStartedAt = saveStartedAt();
      await updateTaskProgress(
        {
          stage: "validating_results",
          label: "正在校验生成结果",
          message: `模型生成完成，正在校验 ${resultItems.length} 条结果。`,
          percent: 86
        },
        {
          metrics: { generatedItemCount: resultItems.length },
          timelineEntry: {
            stage: "validating_results",
            label: "校验结果",
            message: `开始校验 ${resultItems.length} 条生成结果。`,
            level: "info"
          }
        }
      );
      const conflicts = this.validationService.validate(resultItems, { domainKnowledge, documentType: normalizedDocumentType });
      const validationMs = Date.now() - validationStartedAt;
      const traces = buildTraces(resultItems);
      logGenerationDebug("validation_completed", {
        projectId,
        moduleId,
        taskId,
        validationMs,
        resultCount: resultItems.length,
        conflictCount: conflicts.length,
        traceCount: traces.length
      });
      const savingStartedAt = saveStartedAt();
      await updateTaskProgress(
        {
          stage: "saving_results",
          label: "正在保存结果",
          message: `校验完成，发现 ${conflicts.length} 个冲突，正在保存任务结果。`,
          percent: 94
        },
        {
          metrics: { conflictCount: conflicts.length },
          debug: {
            postProcess: {
              lastStage: "validation_completed",
              validationMs
            }
          },
          timelineEntry: {
            stage: "saving_results",
            label: "保存结果",
            message: `已完成校验，准备写入 ${resultItems.length} 条结果和 ${traces.length} 条追溯信息。`,
            level: "info"
          }
        }
      );
      const updatedTask = await this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, taskId, {
        status: "completed",
        resultItems,
        extractions,
        traces,
        conflicts,
        llmProfile,
        metrics: {
          extractionFileCount: inputAssets.length,
          extractionEvidenceCount: countEvidence(extractions),
          llmDurationMs,
          generatedItemCount: resultItems.length,
          conflictCount: conflicts.length
        },
        debug: {
          postProcess: {
            lastStage: "completed",
            validationMs,
            saveMs: Date.now() - savingStartedAt
          }
        },
        progress: {
          stage: "completed",
          label: "任务已完成",
          message: `已生成 ${resultItems.length} 条结果，可开始审核。`,
          percent: 100
        },
        timelineEntry: {
          stage: "completed",
          label: "任务完成",
          message: `任务完成，生成 ${resultItems.length} 条结果，发现 ${conflicts.length} 个冲突。`,
          level: "info"
        },
        summary: selectedProfile
          ? `使用 ${selectedProfile.name} 生成 ${resultItems.length} 条结果`
          : `使用本地回退模式生成 ${resultItems.length} 条结果`
      });
      logGenerationDebug("task_completed", {
        projectId,
        moduleId,
        taskId,
        resultCount: resultItems.length,
        conflictCount: conflicts.length,
        traceCount: traces.length
      });

      return {
        projectId,
        moduleId,
        documentType: normalizedDocumentType,
        task: updatedTask
      };
    } catch (error) {
      if (isTaskDeletedError(error)) {
        return {
          projectId,
          moduleId,
          documentType: normalizedDocumentType,
          task: null,
          deleted: true
        };
      }

      const stackCapture = clipDebugText(error.stack || "", DEBUG_STACK_LIMIT);
      logGenerationDebug("task_failed", {
        projectId,
        moduleId,
        taskId,
        stage: error.stage || error.debugStage || "pipeline",
        message: error.message || "生成失败"
      });
      await this.projectService.updateGenerationTask(projectId, moduleId, normalizedDocumentType, taskId, {
        status: "failed",
        errorMessage: error.message || "生成失败",
        debug: {
          postProcess: {
            lastStage: error.stage || error.debugStage || "pipeline"
          },
          lastError: {
            at: new Date().toISOString(),
            stage: error.stage || error.debugStage || "pipeline",
            message: error.message || "生成失败",
            stack: stackCapture.text
          }
        },
        debugEvent: {
          stage: error.stage || error.debugStage || "pipeline",
          label: "任务失败",
          message: error.message || "生成失败",
          level: "error"
        },
        progress: {
          stage: "failed",
          label: "任务执行失败",
          message: error.message || "生成失败",
          percent: 100
        },
        timelineEntry: {
          stage: "failed",
          label: "任务失败",
          message: error.message || "生成失败",
          level: "error"
        },
        summary: error.message || "生成失败"
      });
      throw error;
    }
  }

  async generateForModule(projectId, moduleId, documentType, options = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const selectedAssetIds = Array.isArray(options.assetIds) && options.assetIds.length
      ? options.assetIds
      : module.assets.map((asset) => asset.id);
    const inputAssets = module.assets.filter((asset) => selectedAssetIds.includes(asset.id));

    if (!inputAssets.length) {
      throw new Error("No assets selected");
    }

    const skillDir = await this.skillBundleService.getSkillDir(options.skillBundleId);
    const composedSkills = await this.skillLoader.loadForContext(
      {
        documentType: normalizedDocumentType,
        domain: module.domain || "embedded_vcu",
        moduleSkillKey: module.moduleSkillKey || ""
      },
      skillDir
    );
    const domainKnowledge = composedSkills["domain-knowledge.json"] || {};

    const llmProfile = selectedProfile
      ? {
          id: selectedProfile.id,
          provider: selectedProfile.provider,
          name: selectedProfile.name,
          model: selectedProfile.model,
          baseURL: selectedProfile.baseURL
        }
      : null;

    const task = await this.projectService.recordGenerationTask(projectId, moduleId, normalizedDocumentType, {
      status: "running",
      inputAssetIds: inputAssets.map((asset) => asset.id),
      uploadedAssetIds: Array.isArray(options.uploadedAssetIds) ? options.uploadedAssetIds : [],
      llmProfile,
      summary: buildRunningSummary(normalizedDocumentType),
      progress: {
        stage: "queued",
        label: "任务已启动",
        message: `任务已创建，正在排队准备生成${normalizeDocumentType(documentType) === "hil_test_case" ? " HIL 用例" : ""}。`,
        percent: 3,
        current: 0,
        total: inputAssets.length
      },
      timeline: [
        {
          at: new Date().toISOString(),
          stage: "queued",
          label: "任务已启动",
          message: `任务已创建，等待后台开始处理 ${inputAssets.length} 个输入资产。`,
          level: "info"
        }
      ]
    });

    const resultPromise = this.finalizeModuleGeneration(projectId, moduleId, normalizedDocumentType, inputAssets, {
      ...options,
      taskId: task.id
    });

    if (options.asyncStart) {
      resultPromise.catch((error) => {
        console.error("Module generation failed", error);
      });
      return {
        projectId,
        moduleId,
        documentType: normalizedDocumentType,
        task
      };
    }

    return resultPromise;
  }
}
