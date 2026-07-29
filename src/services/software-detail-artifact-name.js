const WINDOWS_AND_POSIX_DANGEROUS_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const DETAIL_DESIGN_SUFFIX = "-software-detail-design.docx";
const MAX_COMPONENT_BYTES = 255;

function uploadedBaseName(value = "") {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .at(-1) || "";
}

function truncateByUtf8Grapheme(value = "", maxBytes = 0) {
  if (maxBytes <= 0) return "";
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    .segment(value);
  let result = "";
  let bytes = 0;
  for (const { segment } of segments) {
    const segmentBytes = Buffer.byteLength(segment, "utf8");
    if (bytes + segmentBytes > maxBytes) break;
    result += segment;
    bytes += segmentBytes;
  }
  return result;
}

/**
 * Produces the stable, filesystem-safe name used for a generated detail design.
 * The source is the uploaded SLX name, never the task-specific stored filename.
 */
export function buildSoftwareDetailDocxFileName(modelSlxOriginalName = "") {
  const uploadedName = uploadedBaseName(modelSlxOriginalName);
  const modelName = uploadedName
    .replace(/\.slx$/iu, "")
    .normalize("NFC")
    .replace(WINDOWS_AND_POSIX_DANGEROUS_CHARACTERS, "_")
    .replace(/[. ]+$/u, "");
  const fallback = "model";
  const baseName = truncateByUtf8Grapheme(
    modelName || fallback,
    MAX_COMPONENT_BYTES - Buffer.byteLength(DETAIL_DESIGN_SUFFIX, "utf8")
  ) || fallback;
  return `${baseName}${DETAIL_DESIGN_SUFFIX}`;
}
