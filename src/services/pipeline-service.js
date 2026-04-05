import { SkillLoader } from "./skill-loader.js";
import { SkillBundleService } from "./skill-bundle-service.js";
import { TemplateService } from "./template-service.js";
import { ExtractionService } from "./extraction-service.js";
import { LlmService } from "./llm-service.js";
import { ValidationService } from "./validation-service.js";

export class PipelineService {
  constructor(projectService) {
    this.projectService = projectService;
    this.skillLoader = new SkillLoader();
    this.templateService = new TemplateService();
    this.extractionService = new ExtractionService();
    this.llmService = new LlmService();
    this.validationService = new ValidationService();
    this.skillBundleService = new SkillBundleService();
  }

  async getMeta() {
    const [skills, template] = await Promise.all([
      this.skillLoader.loadAll(),
      this.templateService.getTemplate()
    ]);

    return {
      template,
      skills: Object.keys(skills),
      llmConfigured: Boolean(this.llmService.client)
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
      conflicts
    });

    return saved;
  }
}
