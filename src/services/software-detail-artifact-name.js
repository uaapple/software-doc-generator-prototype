import path from "node:path";

const SAFE_MODEL_NAME_CHARACTERS = /[^A-Za-z0-9._\-\u4e00-\u9fff]+/g;
const DETAIL_DESIGN_SUFFIX = "-software-detail-design.docx";

/**
 * Produces the stable, filesystem-safe name used for a generated detail design.
 * The source is the uploaded SLX name, never the task-specific stored filename.
 */
export function buildSoftwareDetailDocxFileName(modelSlxOriginalName = "") {
  const uploadedName = path.basename(String(modelSlxOriginalName || "").trim());
  const modelName = path.parse(uploadedName).name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(SAFE_MODEL_NAME_CHARACTERS, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  return `${modelName || "model"}${DETAIL_DESIGN_SUFFIX}`;
}
