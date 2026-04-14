import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../src/config.js";
import { ensureStorage, readJson } from "../src/services/storage.js";
import { ProjectService } from "../src/services/project-service.js";

const LEGACY_PROJECT_ID = "3c4094a0-1c72-4fd0-8b74-aed79e8dd385";
const SKILL_REFINEMENT_CASE_ID = "f293b06a-6cdf-44f2-9b01-6912c156681f";
const SKILL_REFINEMENT_RUN_ID = "5902b742-e8c2-472f-bfcd-4ec5b0165d31";
const MIGRATION_KIND = "legacy-workspace-demo";

function now() {
  return new Date().toISOString();
}

function normalizeDocumentType(value) {
  return value === "detail_design" ? "detail_design" : "software_requirement";
}

function createDocumentSpace(documentType) {
  return {
    documentType: normalizeDocumentType(documentType),
    generationTasks: [],
    acceptedItems: []
  };
}

function createModule(projectId, name, description) {
  const timestamp = now();
  return {
    id: randomUUID(),
    projectId,
    name,
    description,
    assets: [],
    documentSpaces: {
      software_requirement: createDocumentSpace("software_requirement"),
      detail_design: createDocumentSpace("detail_design")
    },
    auditLog: [
      {
        at: timestamp,
        action: "module_migrated",
        detail: `已迁移模块：${name}`
      }
    ],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureCleanProjectUploadDir(projectId) {
  const targetDir = path.join(config.uploadDir, projectId);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}

async function copyAsset(projectId, moduleId, sourceFile, role) {
  const moduleDir = path.join(config.uploadDir, projectId, moduleId);
  await fs.mkdir(moduleDir, { recursive: true });
  const fileName = `${Date.now()}-${sourceFile.originalName}`;
  const targetPath = path.join(moduleDir, fileName);

  if (sourceFile.absolutePath && (await pathExists(sourceFile.absolutePath))) {
    await fs.copyFile(sourceFile.absolutePath, targetPath);
  } else if (sourceFile.relativePath && (await pathExists(path.join(config.rootDir, sourceFile.relativePath)))) {
    await fs.copyFile(path.join(config.rootDir, sourceFile.relativePath), targetPath);
  } else {
    await fs.writeFile(targetPath, sourceFile.fallbackContent || "", "utf8");
  }

  const stat = await fs.stat(targetPath);
  return {
    id: randomUUID(),
    role,
    originalName: sourceFile.originalName,
    storedName: fileName,
    relativePath: path.join(projectId, moduleId, fileName),
    absolutePath: targetPath,
    mimeType: sourceFile.mimeType || "application/octet-stream",
    size: stat.size,
    uploadedAt: sourceFile.uploadedAt || now()
  };
}

function toSourceRef(fileName, location, excerpt) {
  return {
    fileName: fileName || "migrated-source",
    location: location || "legacy",
    excerpt: excerpt || ""
  };
}

function mapLegacyRequirement(requirement) {
  return {
    ...JSON.parse(JSON.stringify(requirement)),
    id: requirement.id || randomUUID(),
    review: requirement.review || {
      status: "pending",
      reviewer: "",
      comment: "",
      updatedAt: ""
    }
  };
}

function buildAcceptedItemsFromLegacy(task, reviewer = "legacy-import") {
  return (task.resultItems || [])
    .filter((item) => item.review?.status === "accepted")
    .map((item) => ({
      id: randomUUID(),
      sourceTaskId: task.id,
      sourceResultItemId: item.id,
      acceptedSnapshot: JSON.parse(JSON.stringify(item)),
      currentContent: JSON.parse(JSON.stringify(item)),
      review: {
        status: "accepted",
        reviewer,
        comment: "从旧版项目迁移"
      },
      acceptedAt: item.review?.updatedAt || task.createdAt,
      updatedAt: item.review?.updatedAt || task.createdAt
    }));
}

async function main() {
  await ensureStorage();

  const projectService = new ProjectService();
  const legacyProject = await readJson(path.join(config.projectStoreDir, `${LEGACY_PROJECT_ID}.json`));
  const skillCase = await readJson(path.join(config.skillRefinementCaseDir, `${SKILL_REFINEMENT_CASE_ID}.json`));
  const skillRun = await readJson(path.join(config.skillRefinementRunDir, `${SKILL_REFINEMENT_RUN_ID}.json`));

  if (!legacyProject) {
    throw new Error(`Legacy project ${LEGACY_PROJECT_ID} not found`);
  }
  if (!skillCase) {
    throw new Error(`Skill refinement case ${SKILL_REFINEMENT_CASE_ID} not found`);
  }
  if (!skillRun) {
    throw new Error(`Skill refinement run ${SKILL_REFINEMENT_RUN_ID} not found`);
  }

  const existingProjects = await projectService.listProjects();
  let project = existingProjects.find((item) => item.migrationMeta?.kind === MIGRATION_KIND);

  if (!project) {
    project = await projectService.createProject({
      name: "迁移演示工程 - 扭矩干预",
      description: "用于在新工作台中查看旧版项目、软件需求生成记录与 Skill Refinement 历史状态。"
    });
  }

  await ensureCleanProjectUploadDir(project.id);

  project.name = "迁移演示工程 - 扭矩干预";
  project.description =
    "迁移自旧版 Torque Intervention Trial，并附带 2026-04-04 的 Skill Refinement case / run 摘要。";
  project.status = "generated";
  project.modules = [];
  project.auditLog = [
    {
      at: now(),
      action: "migration_refreshed",
      detail: "已从旧版项目和 Skill Refinement 记录刷新演示工程"
    }
  ];
  project.migrationMeta = {
    kind: MIGRATION_KIND,
    migratedAt: now(),
    sourceProjectId: LEGACY_PROJECT_ID,
    sourceSkillCaseId: SKILL_REFINEMENT_CASE_ID,
    sourceSkillRunId: SKILL_REFINEMENT_RUN_ID
  };

  const torqueModule = createModule(
    project.id,
    "扭矩干预",
    "迁移自旧版 Torque Intervention Trial，用于展示模块资产与软件需求生成历史。"
  );

  for (const file of legacyProject.files || []) {
    const asset = await copyAsset(project.id, torqueModule.id, file, file.role);
    torqueModule.assets.push(asset);
  }

  const torqueTaskCreatedAt = legacyProject.lastGeneration?.at || legacyProject.updatedAt || now();
  const torqueTask = {
    id: randomUUID(),
    moduleId: torqueModule.id,
    documentType: "software_requirement",
    status: "completed",
    createdAt: torqueTaskCreatedAt,
    updatedAt: torqueTaskCreatedAt,
    inputAssetIds: torqueModule.assets.map((asset) => asset.id),
    uploadedAssetIds: torqueModule.assets.map((asset) => asset.id),
    resultItems: (legacyProject.requirements || []).map(mapLegacyRequirement),
    extractions: JSON.parse(JSON.stringify(legacyProject.extractions || [])),
    traces: JSON.parse(JSON.stringify(legacyProject.traces || [])),
    conflicts: JSON.parse(JSON.stringify(legacyProject.conflicts || [])),
    llmProfile: legacyProject.lastGeneration?.llmProfile || null,
    summary: `从旧版项目迁移的软件需求生成任务（${(legacyProject.requirements || []).length} 条结果）`,
    auditLog: JSON.parse(JSON.stringify((legacyProject.auditLog || []).slice(-5)))
  };
  torqueModule.documentSpaces.software_requirement.generationTasks.push(torqueTask);
  torqueModule.documentSpaces.software_requirement.acceptedItems.push(...buildAcceptedItemsFromLegacy(torqueTask));

  const refinementModule = createModule(
    project.id,
    "Skill Refinement 改进记录",
    "用于集中查看 benchmark case、golden 详细设计范例，以及 2026-04-04 的提案评审状态。"
  );

  const refinementAssets = [];
  const caseFiles = [
    ...(skillCase.systemInputs || []),
    ...(skillCase.modelInputs || []),
    ...(skillCase.generatedCodeInputs || []),
    ...(skillCase.slxInputs || [])
  ];
  if (skillCase.goldenSourceFile) {
    caseFiles.push({
      ...skillCase.goldenSourceFile,
      role: "golden_source",
      mimeType: skillCase.goldenSourceFile.mimeType || "text/markdown"
    });
  }
  if (skillCase.referenceRequirementFile) {
    caseFiles.push({
      ...skillCase.referenceRequirementFile,
      role: "reference_requirement",
      mimeType: skillCase.referenceRequirementFile.mimeType || "text/markdown"
    });
  }

  for (const file of caseFiles) {
    const originalName = file.originalName || file.name || path.basename(file.absolutePath || file.relativePath || "artifact.txt");
    const role = file.role || inferRoleFromName(originalName);
    const asset = await copyAsset(project.id, refinementModule.id, {
      ...file,
      originalName,
      mimeType: file.mimeType || inferMimeType(originalName)
    }, role);
    refinementAssets.push(asset);
  }
  refinementModule.assets.push(...refinementAssets);

  const goldenSourceAsset = refinementModule.assets.find((item) => item.originalName === skillCase.goldenSourceFile?.originalName);
  let goldenSourceContent = "";
  if (skillCase.goldenSourceFile?.absolutePath && (await pathExists(skillCase.goldenSourceFile.absolutePath))) {
    goldenSourceContent = await fs.readFile(skillCase.goldenSourceFile.absolutePath, "utf8");
  }

  const detailTask = {
    id: randomUUID(),
    moduleId: refinementModule.id,
    documentType: "detail_design",
    status: "completed",
    createdAt: skillCase.createdAt || now(),
    updatedAt: skillCase.updatedAt || skillCase.createdAt || now(),
    inputAssetIds: refinementModule.assets.map((asset) => asset.id),
    uploadedAssetIds: [],
    resultItems: [
      {
        id: randomUUID(),
        requirementId: `DD-REF-${SKILL_REFINEMENT_CASE_ID.slice(0, 8)}`,
        title: `${skillCase.name} - golden 详细设计范例`,
        requirementText: goldenSourceContent || "未找到 golden source 文件内容，已仅迁移元数据。",
        type: "detail_design_reference",
        sourceRefs: [
          toSourceRef(
            goldenSourceAsset?.originalName || skillCase.goldenSourceFile?.originalName || "golden-source",
            "skill-refinement-case",
            "来自 benchmark case 的 golden source 文件"
          )
        ],
        rationale: "从 Skill Refinement benchmark case 迁移的参考详细设计内容。",
        verificationHint: "作为人工对照范例查看。",
        confidence: 1,
        conflictNote: "",
        review: {
          status: "pending",
          reviewer: "",
          comment: "",
          updatedAt: ""
        }
      }
    ],
    extractions: [],
    traces: [],
    conflicts: [],
    llmProfile: null,
    summary: `从 benchmark case 迁移的详细设计范例（${skillCase.name}）`,
    auditLog: []
  };
  refinementModule.documentSpaces.detail_design.generationTasks.push(detailTask);

  const proposalTask = {
    id: randomUUID(),
    moduleId: refinementModule.id,
    documentType: "software_requirement",
    status: skillRun.status || "proposal_review",
    createdAt: skillRun.createdAt || now(),
    updatedAt: skillRun.updatedAt || skillRun.createdAt || now(),
    inputAssetIds: refinementModule.assets.map((asset) => asset.id),
    uploadedAssetIds: [],
    resultItems: (skillRun.proposalItems || []).map((item, index) => ({
      id: item.id || randomUUID(),
      requirementId: `SR-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      requirementText: item.editedContent || item.proposedContent || "",
      type: `skill_refinement_${item.category || "proposal"}`,
      sourceRefs: [
        toSourceRef(
          skillCase.name,
          `proposal:${item.targetFile || "unknown"}`,
          item.reason || "从 Skill Refinement run 迁移"
        )
      ],
      rationale: item.reason || "从 Skill Refinement run 迁移的提案",
      verificationHint: `目标文件：${item.targetFile || "unknown"}`,
      confidence: 0.88,
      conflictNote: "",
      review: {
        status: item.status || "pending",
        reviewer: "",
        comment: "",
        updatedAt: item.updatedAt || ""
      }
    })),
    extractions: [],
    traces: [],
    conflicts: [],
    llmProfile: null,
    summary: `从 Skill Refinement run 迁移的 ${skillRun.proposalItems?.length || 0} 条提案`,
    auditLog: []
  };
  refinementModule.documentSpaces.software_requirement.generationTasks.push(proposalTask);

  project.modules.push(torqueModule, refinementModule);
  await projectService.saveProject(project);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: project.id,
        projectName: project.name,
        modules: project.modules.map((module) => ({
          id: module.id,
          name: module.name,
          assets: module.assets.length,
          softwareRequirementTasks: module.documentSpaces.software_requirement.generationTasks.length,
          detailDesignTasks: module.documentSpaces.detail_design.generationTasks.length
        }))
      },
      null,
      2
    )
  );
}

function inferRoleFromName(name) {
  if (/\.c$/i.test(name)) return "generated_c";
  if (/\.slx$/i.test(name)) return "simulink_slx";
  if (/design|详细设计/i.test(name)) return "golden_source";
  if (/\.pdf$/i.test(name)) return "model_pdf";
  return "system_pdf";
}

function inferMimeType(name) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.md$/i.test(name)) return "text/markdown";
  if (/\.c$/i.test(name)) return "text/plain";
  return "application/octet-stream";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
