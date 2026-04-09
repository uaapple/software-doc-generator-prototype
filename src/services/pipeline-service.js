import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { ValidationService } from "./validation-service.js";
import { LlmProfileService } from "./llm-profile-service.js";

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
    const traces = requirements.flatMap((requirement) =>
      requirement.sourceRefs.map((sourceRef) => ({
        requirementId: requirement.id,
        requirementCode: requirement.requirementId,
        fileName: sourceRef.fileName,
        location: sourceRef.location,
        excerpt: sourceRef.excerpt
      }))
    );

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
}
