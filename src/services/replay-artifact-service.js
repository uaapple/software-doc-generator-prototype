import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { resolveStoredFilePath } from "./storage.js";

const ARTIFACT_VERSION = 1;
const TEXT_PREVIEW_LIMIT = 4000;
const MATERIALIZED_ASSET_LIMIT = 12000;
const MAX_SERIALIZE_DEPTH = 6;
const MAX_SERIALIZE_ARRAY_ITEMS = 50;
const MAX_SERIALIZE_OBJECT_KEYS = 50;

function now() {
  return new Date().toISOString();
}

function clipText(value = "", maxLength = TEXT_PREVIEW_LIMIT) {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length <= maxLength) {
    return {
      text,
      length: text.length,
      truncated: false
    };
  }
  return {
    text: `${text.slice(0, Math.max(0, maxLength - 1))}…`,
    length: text.length,
    truncated: true
  };
}

function serializeLargeValue(value, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : MAX_SERIALIZE_DEPTH;
  const maxArrayItems = Number.isInteger(options.maxArrayItems) ? options.maxArrayItems : MAX_SERIALIZE_ARRAY_ITEMS;
  const maxObjectKeys = Number.isInteger(options.maxObjectKeys) ? options.maxObjectKeys : MAX_SERIALIZE_OBJECT_KEYS;
  const maxStringLength = Number.isInteger(options.maxStringLength) ? options.maxStringLength : TEXT_PREVIEW_LIMIT;

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return clipText(value, maxStringLength);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (maxDepth <= 0) {
      return {
        type: "array",
        length: value.length,
        truncated: true
      };
    }
    const items = value
      .slice(0, maxArrayItems)
      .map((entry) =>
        serializeLargeValue(entry, {
          maxDepth: maxDepth - 1,
          maxArrayItems,
          maxObjectKeys,
          maxStringLength
        })
      );
    if (value.length > maxArrayItems) {
      items.push({
        omittedItems: value.length - maxArrayItems,
        truncated: true
      });
    }
    return items;
  }

  if (typeof value === "object") {
    if (maxDepth <= 0) {
      return {
        type: "object",
        keyCount: Object.keys(value).length,
        truncated: true
      };
    }
    const result = {};
    const entries = Object.entries(value);
    for (const [key, entryValue] of entries.slice(0, maxObjectKeys)) {
      result[key] = serializeLargeValue(entryValue, {
        maxDepth: maxDepth - 1,
        maxArrayItems,
        maxObjectKeys,
        maxStringLength
      });
    }
    if (entries.length > maxObjectKeys) {
      result.__truncated = {
        omittedKeys: entries.length - maxObjectKeys,
        truncated: true
      };
    }
    return result;
  }

  return clipText(String(value), maxStringLength);
}

function sanitizePathSegment(value = "", fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/]/g, "-")
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  return normalized || fallback;
}

function sanitizeRelativePath(value = "", fallback = "item.txt") {
  const parts = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment, index, list) => {
      const baseFallback = index === list.length - 1 ? fallback : "dir";
      return sanitizePathSegment(segment, baseFallback);
    });
  return parts.length ? path.posix.join(...parts) : fallback;
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value = "") {
  return String(value || "").trim();
}

function inferArtifactFileName(asset = {}, index = 0) {
  const originalName = normalizeString(asset.originalName || asset.fileName || asset.storedName);
  const parsed = path.parse(originalName || `asset-${index + 1}.txt`);
  const role = sanitizePathSegment(asset.role || "asset", "asset");
  const baseName = sanitizePathSegment(parsed.name || `asset-${index + 1}`, `asset-${index + 1}`);
  const extension = parsed.ext || ".txt";
  return `${String(index + 1).padStart(3, "0")}-${role}-${baseName}${extension}`;
}

function buildMaterializedAssetContent(asset = {}) {
  const preview = clipText(asset.preview || "", MATERIALIZED_ASSET_LIMIT);
  if (preview.text) {
    return preview.text;
  }
  return JSON.stringify(
    {
      originalName: normalizeString(asset.originalName || asset.fileName || asset.storedName),
      role: normalizeString(asset.role),
      mimeType: normalizeString(asset.mimeType),
      notice: "Source file was unavailable, so only metadata could be materialized."
    },
    null,
    2
  );
}

async function fileExists(filePath = "") {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function renderTaskBrief(task = {}, materialPack = {}, referenceAssets = [], effectiveSkillFiles = []) {
  const moduleContext = materialPack.moduleContext || {};
  const selectedProfiles = normalizeList(materialPack.effectiveSkillSnapshot?.selectedProfiles)
    .map((profile) => `${normalizeString(profile.kind || "profile")}:${normalizeString(profile.key)}`)
    .filter(Boolean);
  const lines = [
    "# Replay Task Artifact",
    "",
    `- Generated at: ${now()}`,
    `- Task ID: ${normalizeString(task.id) || "n/a"}`,
    `- Project: ${normalizeString(task.projectName || moduleContext.projectName) || "n/a"}`,
    `- Module: ${normalizeString(task.moduleName || moduleContext.moduleName) || "n/a"}`,
    `- Document type: ${normalizeString(moduleContext.documentType) || "software_requirement"}`,
    `- Target areas: ${normalizeList(materialPack.targetAreas).join(", ") || "n/a"}`,
    `- Target layer constraint: ${normalizeString(materialPack.targetLayerConstraint) || "n/a"}`,
    `- Target profile key: ${normalizeString(materialPack.targetProfileKeyConstraint) || "n/a"}`,
    `- Rejections: ${normalizeList(materialPack.rejectionSnapshots).length}`,
    `- Layer skill inventory: ${
      normalizeList(materialPack.layerSkillItems).length || normalizeList(materialPack.candidateSkillItems).length
    }`,
    `- Reference assets: ${referenceAssets.length}`,
    `- Effective skill files: ${effectiveSkillFiles.length}`,
    `- Selected profiles: ${selectedProfiles.join(", ") || "n/a"}`
  ];
  return lines.join("\n");
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function inferFileFormat(value) {
  if (typeof value === "string") return "text";
  return "json";
}

export class ReplayArtifactService {
  async buildReplayTaskArtifact({ outputDir = "", task = {}, materialPack = {}, referenceAssets = null, uploadBaseDir = "" } = {}) {
    const artifactRoot = outputDir || path.join(config.generationTaskArtifactDir, normalizeString(task.id) || "replay-artifact");
    const selectedAssets = Array.isArray(referenceAssets) ? referenceAssets : normalizeList(materialPack.referenceAssets);
    const writtenFiles = [];
    const moduleContext = materialPack.moduleContext || {};

    const writeArtifactFile = async (relativePath, content, encoding = "utf8") => {
      const safeRelativePath = sanitizeRelativePath(relativePath, "artifact.txt");
      const targetPath = path.join(artifactRoot, safeRelativePath);
      await ensureParentDir(targetPath);
      await fs.writeFile(targetPath, content, encoding);
      writtenFiles.push(safeRelativePath);
      return targetPath;
    };

    const writeArtifactJson = async (relativePath, value) => {
      const targetPath = await writeArtifactFile(relativePath, JSON.stringify(value, null, 2), "utf8");
      return targetPath;
    };

    await fs.rm(artifactRoot, { recursive: true, force: true });
    await fs.mkdir(artifactRoot, { recursive: true });

    const effectiveSkillSnapshot = materialPack.effectiveSkillSnapshot || {};
    const effectiveSkillFiles = [];
    for (const [relativeFilePath, fileValue] of Object.entries(effectiveSkillSnapshot.files || {})) {
      const safeFilePath = sanitizeRelativePath(relativeFilePath, "skill-file.txt");
      const artifactRelativePath = path.posix.join("effective-skill", safeFilePath);
      const content =
        typeof fileValue === "string"
          ? fileValue
          : `${JSON.stringify(fileValue ?? null, null, 2)}\n`;
      await writeArtifactFile(artifactRelativePath, content, "utf8");
      effectiveSkillFiles.push({
        relativePath: safeFilePath,
        artifactPath: artifactRelativePath,
        format: inferFileFormat(fileValue),
        preview: clipText(typeof fileValue === "string" ? fileValue : JSON.stringify(fileValue ?? null, null, 2))
      });
    }

    const inventoryItems = normalizeList(materialPack.layerSkillItems).length
      ? normalizeList(materialPack.layerSkillItems)
      : normalizeList(materialPack.candidateSkillItems);

    const serializedInventory = {
      generatedAt: now(),
      itemCount: inventoryItems.length,
      items: inventoryItems.map((item) => ({
        skillCode: normalizeString(item.skillCode || item.ruleId),
        layer: normalizeString(item.layer || item.targetLayer),
        profileKey: normalizeString(item.profileKey || item.targetProfileKey),
        kind: normalizeString(item.kind || item.targetKind),
        title: normalizeString(item.title),
        targetFile: normalizeString(item.targetFile),
        targetAreas: normalizeList(item.targetAreas),
        whyRelevant: normalizeString(item.whyRelevant),
        contentSummary: normalizeString(item.contentSummary),
        contentPreview: clipText(item.content || item.contentSummary || "")
      }))
    };

    const serializedRejections = {
      generatedAt: now(),
      taskId: normalizeString(task.id),
      recordCount: normalizeList(materialPack.rejectionSnapshots).length,
      records: normalizeList(materialPack.rejectionSnapshots).map((record) => ({
        id: normalizeString(record.id),
        requirementCode: normalizeString(record.requirementCode),
        reasonCategory: normalizeString(record.reasonCategory),
        reasonText: clipText(record.reasonText || ""),
        expectedNote: clipText(record.expectedNote || ""),
        targetArea: normalizeString(record.targetArea),
        targetLayerConstraint: normalizeString(record.targetLayerConstraint),
        outputSnapshot: serializeLargeValue(record.outputSnapshot || {}),
        sourceRefsSnapshot: serializeLargeValue(record.sourceRefsSnapshot || []),
        projectEvidenceSnapshot: serializeLargeValue(record.projectEvidenceSnapshot || []),
        relevantRules: serializeLargeValue(record.relevantRules || [])
      }))
    };

    const referenceAssetEntries = [];
    for (const [index, asset] of selectedAssets.entries()) {
      const relativeName = inferArtifactFileName(asset, index);
      const artifactRelativePath = path.posix.join("reference-assets", relativeName);
      const sourcePath = resolveStoredFilePath(asset, {
        baseDir: uploadBaseDir || config.uploadDir,
        allowStoredNameFallback: true
      });

      let mode = "materialized";
      if (await fileExists(sourcePath)) {
        const targetPath = path.join(artifactRoot, artifactRelativePath);
        await ensureParentDir(targetPath);
        await fs.copyFile(sourcePath, targetPath);
        writtenFiles.push(artifactRelativePath);
        mode = "copied";
      } else {
        await writeArtifactFile(artifactRelativePath, buildMaterializedAssetContent(asset), "utf8");
      }

      referenceAssetEntries.push({
        id: normalizeString(asset.id),
        originalName: normalizeString(asset.originalName || asset.fileName || asset.storedName),
        role: normalizeString(asset.role),
        mimeType: normalizeString(asset.mimeType),
        mode,
        artifactPath: artifactRelativePath,
        sourcePath: mode === "copied" ? sourcePath : "",
        preview: clipText(asset.preview || "")
      });
    }

    const effectiveSkillManifest = {
      generatedAt: now(),
      bundleId: normalizeString(materialPack.targetBundleId),
      ruleIndexVersion: normalizeString(materialPack.ruleIndexVersion),
      hash: normalizeString(effectiveSkillSnapshot.hash),
      selectedProfiles: normalizeList(effectiveSkillSnapshot.selectedProfiles),
      compiledPrompt: clipText(effectiveSkillSnapshot.compiledPrompt || ""),
      compiledSkillPackPreview: serializeLargeValue(effectiveSkillSnapshot.compiledSkillPack || null),
      files: effectiveSkillFiles
    };

    const manifest = {
      artifactVersion: ARTIFACT_VERSION,
      generatedAt: now(),
      task: {
        id: normalizeString(task.id),
        projectId: normalizeString(task.projectId || moduleContext.projectId),
        projectName: normalizeString(task.projectName || moduleContext.projectName),
        moduleId: normalizeString(task.moduleId || moduleContext.moduleId),
        moduleName: normalizeString(task.moduleName || moduleContext.moduleName),
        documentType: normalizeString(moduleContext.documentType) || "software_requirement"
      },
      taskContext: {
        projectName: normalizeString(task.projectName || moduleContext.projectName),
        moduleName: normalizeString(task.moduleName || moduleContext.moduleName),
        moduleSkillKey: normalizeString(moduleContext.moduleSkillKey),
        domain: normalizeString(moduleContext.domain),
        documentType: normalizeString(moduleContext.documentType) || "software_requirement",
        targetAreas: normalizeList(materialPack.targetAreas),
        targetLayerConstraint: normalizeString(materialPack.targetLayerConstraint),
        targetProfileKeyConstraint: normalizeString(materialPack.targetProfileKeyConstraint),
        allowedKindsForReplay: normalizeList(materialPack.allowedKindsForReplay)
      },
      rejectionContext: {
        recordCount: serializedRejections.recordCount,
        records: serializedRejections.records
      },
      layerSkillInventory: serializedInventory.items,
      candidateSkillInventory: serializedInventory.items,
      replayScope: {
        targetAreas: normalizeList(materialPack.targetAreas),
        targetLayerConstraint: normalizeString(materialPack.targetLayerConstraint),
        targetProfileKeyConstraint: normalizeString(materialPack.targetProfileKeyConstraint),
        bundleId: normalizeString(materialPack.targetBundleId),
        ruleIndexVersion: normalizeString(materialPack.ruleIndexVersion)
      },
      counts: {
        rejections: serializedRejections.recordCount,
        layerSkillItems: serializedInventory.itemCount,
        referenceAssets: referenceAssetEntries.length,
        effectiveSkillFiles: effectiveSkillFiles.length
      },
      paths: {
        manifest: "manifest.json",
        taskBrief: "task-brief.md",
        rejections: "rejections.json",
        effectiveSkillManifest: "effective-skill-manifest.json",
        effectiveSkillDir: "effective-skill",
        layerSkillInventory: "layer-skill-inventory.json",
        referenceAssetsDir: "reference-assets"
      },
      effectiveSkillSnapshot: {
        hash: normalizeString(effectiveSkillSnapshot.hash),
        selectedProfiles: normalizeList(effectiveSkillSnapshot.selectedProfiles)
      },
      effectiveSkillFiles,
      referenceAssets: referenceAssetEntries,
      truncationPolicy: {
        textPreviewLimit: TEXT_PREVIEW_LIMIT,
        materializedAssetLimit: MATERIALIZED_ASSET_LIMIT,
        maxSerializeDepth: MAX_SERIALIZE_DEPTH,
        maxSerializeArrayItems: MAX_SERIALIZE_ARRAY_ITEMS,
        maxSerializeObjectKeys: MAX_SERIALIZE_OBJECT_KEYS
      }
    };

    const taskBriefPath = await writeArtifactFile(
      "task-brief.md",
      renderTaskBrief(task, materialPack, referenceAssetEntries, effectiveSkillFiles),
      "utf8"
    );
    const rejectionsPath = await writeArtifactJson("rejections.json", serializedRejections);
    const effectiveSkillManifestPath = await writeArtifactJson("effective-skill-manifest.json", effectiveSkillManifest);
    const layerSkillInventoryPath = await writeArtifactJson("layer-skill-inventory.json", serializedInventory);
    const manifestPath = await writeArtifactJson("manifest.json", manifest);

    return {
      outputDir: artifactRoot,
      manifestPath,
      manifest,
      taskBriefPath,
      rejectionsPath,
      effectiveSkillManifestPath,
      layerSkillInventoryPath,
      writtenFiles,
      referenceAssets: referenceAssetEntries
    };
  }
}
