import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { ValidationService } from "./validation-service.js";
import { LlmProfileService } from "./llm-profile-service.js";
import { ModuleSkillService } from "./module-skill-service.js";

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

      await updateTaskProgress(
        {
          stage: "module_bootstrap",
          label: "正在准备模块上下文",
          message: "正在校验模块资料、加载技能与生成上下文。",
          percent: 10
        },
        {
          timelineEntry: {
            stage: "module_bootstrap",
            label: "准备模块上下文",
            message: "已开始准备模块技能、文档类型和输入资产。",
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
