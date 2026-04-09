import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { getProjectPath, readJson, writeJson } from "./storage.js";
import { RejectionService } from "./rejection-service.js";

function now() {
  return new Date().toISOString();
}

function buildFileRecord(projectId, file, role) {
  return {
    id: randomUUID(),
    role,
    originalName: file.originalname,
    storedName: file.filename,
    relativePath: path.join(projectId, file.filename),
    absolutePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: now()
  };
}

function clearGeneratedArtifacts(project) {
  project.extractions = [];
  project.requirements = [];
  project.traces = [];
  project.conflicts = [];
  project.lastGeneration = null;
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

export class ProjectService {
  constructor() {
    this.rejectionService = new RejectionService();
  }

  async listProjects() {
    const names = await fs.readdir(config.projectStoreDir);
    const projects = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(path.join(config.projectStoreDir, name)))
    );

    return projects
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createProject(input) {
    const project = {
      id: randomUUID(),
      name: input.name?.trim() || "未命名项目",
      description: input.description?.trim() || "",
      language: input.language || "zh-CN",
      templateName: input.templateName || "default-template",
      status: "draft",
      files: [],
      extractions: [],
      requirements: [],
      traces: [],
      conflicts: [],
      lastGeneration: null,
      auditLog: [
        {
          at: now(),
          action: "project_created",
          detail: "项目已创建"
        }
      ],
      createdAt: now(),
      updatedAt: now()
    };

    await writeJson(getProjectPath(project.id), project);
    return project;
  }

  async getProject(projectId) {
    return readJson(getProjectPath(projectId));
  }

  async saveProject(project) {
    project.updatedAt = now();
    await writeJson(getProjectPath(project.id), project);
    return project;
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
        project.files.push(buildFileRecord(projectId, file, roleMap[fieldName] || fieldName));
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

    if (removedFile?.absolutePath) {
      await fs.rm(removedFile.absolutePath, { force: true });
    }

    clearGeneratedArtifacts(project);
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
    project.auditLog.push({
      at: now(),
      action: "requirements_generated",
      detail: result.llmProfile
        ? `使用 ${result.llmProfile.name}（${result.llmProfile.model}）生成 ${result.requirements.length} 条需求`
        : `使用本地回退模式生成 ${result.requirements.length} 条需求`
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
    if (nextStatus === "rejected" && (!review.reasonCategory || !String(review.reasonText || "").trim())) {
      const error = new Error("Rejected review requires reasonCategory and reasonText");
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
      severity: review.severity || requirement.review?.severity || "medium",
      expectedNote: review.expectedNote?.trim() || "",
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
          reasonTags: requirement.review.reasonTags
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
