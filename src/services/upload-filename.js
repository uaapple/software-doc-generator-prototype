import { TextDecoder } from "node:util";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const LATIN1_ONLY_PATTERN = /^[\u0000-\u00ff]*$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const COMMON_NAME_PATTERN = /[\p{Letter}\p{Number}]/u;
const MOJIBAKE_MARKER_PATTERN = /[ÃÂÐÑØÞ]/u;
const SAFE_STORED_NAME_PATTERN = /[^\w.\-\u4e00-\u9fa5]/g;

function countPattern(pattern, value = "") {
  const matches = String(value || "").match(new RegExp(pattern.source, `${pattern.flags.replaceAll("g", "")}g`));
  return matches?.length || 0;
}

function scoreFileName(value = "") {
  let score = 0;
  for (const char of String(value || "")) {
    if (char === "\uFFFD") {
      score -= 6;
    } else if (CONTROL_PATTERN.test(char)) {
      score -= 5;
    } else if (CJK_PATTERN.test(char)) {
      score += 4;
    } else if (COMMON_NAME_PATTERN.test(char)) {
      score += 1;
    } else if (/^[.\-_\s()[\]]$/u.test(char)) {
      score += 0.25;
    } else {
      score -= 0.25;
    }
  }

  if (MOJIBAKE_MARKER_PATTERN.test(value)) {
    score -= 2;
  }

  return score;
}

function tryDecodeLatin1AsUtf8(value = "") {
  try {
    return UTF8_DECODER.decode(Buffer.from(value, "latin1"));
  } catch (_error) {
    return "";
  }
}

function shouldPreferDecodedName(original = "", decoded = "") {
  if (!decoded || decoded === original || decoded.includes("\uFFFD")) {
    return false;
  }

  const originalCjk = countPattern(CJK_PATTERN, original);
  const decodedCjk = countPattern(CJK_PATTERN, decoded);
  if (decodedCjk > originalCjk) {
    return true;
  }

  const originalMarkers = countPattern(MOJIBAKE_MARKER_PATTERN, original);
  const decodedMarkers = countPattern(MOJIBAKE_MARKER_PATTERN, decoded);
  if (originalMarkers > 0 && decodedMarkers < originalMarkers) {
    return true;
  }

  return scoreFileName(decoded) > scoreFileName(original);
}

export function normalizeUploadedFileName(value = "") {
  let current = String(value || "").trim();
  if (!current) {
    return "";
  }
  if (!LATIN1_ONLY_PATTERN.test(current)) {
    return current;
  }

  for (let pass = 0; pass < 3; pass += 1) {
    if (!LATIN1_ONLY_PATTERN.test(current)) {
      break;
    }
    const decoded = tryDecodeLatin1AsUtf8(current);
    if (!decoded || decoded === current) {
      break;
    }
    if (!shouldPreferDecodedName(current, decoded)) {
      break;
    }
    current = decoded;
  }

  return current;
}

export function sanitizeStoredUploadName(value = "") {
  return normalizeUploadedFileName(value).replace(SAFE_STORED_NAME_PATTERN, "_");
}

export function buildStoredUploadName(value = "", timestamp = Date.now()) {
  return `${timestamp}-${sanitizeStoredUploadName(value)}`;
}
