import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { ValidationService } from "./validation-service.js";
import { LlmProfileService } from "./llm-profile-service.js";

function normalizeDocumentType(value) {
  return value === "detail_design" ? "detail_design" : "software_requirement";
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
    const requirements = await this.llmService.generateRequirements(project, extractions, options);
    const domainKnowledge = await this.skillBundleService.getDomainKnowledge(options.skillBundleId);
    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const conflicts = this.validationService.validate(requirements, { domainKnowledge });
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

  async generateForModule(projectId, moduleId, documentType, options = {}) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    const { project, module } = await this.projectService.getProjectAndModule(projectId, moduleId);
    const domainKnowledge = await this.skillBundleService.getDomainKnowledge(options.skillBundleId);
    const selectedProfile = await this.llmProfileService.resolveProfile(options.llmProfileId);
    const selectedAssetIds = Array.isArray(options.assetIds) && options.assetIds.length
      ? options.assetIds
      : module.assets.map((asset) => asset.id);
    const inputAssets = module.assets.filter((asset) => selectedAssetIds.includes(asset.id));

    if (!inputAssets.length) {
      throw new Error("No assets selected");
    }

    const contextProject = {
      name: `${project.name} / ${module.name}`,
      description: module.description || project.description,
      language: project.language,
      documentType: normalizedDocumentType
    };

    const extractions = await this.extractionService.extractFiles({ files: inputAssets });
    const resultItems = await this.llmService.generateRequirements(contextProject, extractions, options);
    const conflicts = this.validationService.validate(resultItems, { domainKnowledge });
    const traces = buildTraces(resultItems);
    const task = await this.projectService.recordGenerationTask(projectId, moduleId, normalizedDocumentType, {
      status: "completed",
      inputAssetIds: inputAssets.map((asset) => asset.id),
      uploadedAssetIds: Array.isArray(options.uploadedAssetIds) ? options.uploadedAssetIds : [],
      resultItems,
      extractions,
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
        : null,
      summary: selectedProfile
        ? `使用 ${selectedProfile.name} 生成 ${resultItems.length} 条结果`
        : `使用本地回退模式生成 ${resultItems.length} 条结果`
    });

    return {
      projectId,
      moduleId,
      documentType: normalizedDocumentType,
      task
    };
  }
}
