import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";
import { resolveStoredFilePath } from "./storage.js";

export class PdfExtractor {
  async extract(fileRecord, options = {}) {
    const sourcePath = resolveStoredFilePath(fileRecord, options);
    const buffer = await readFile(sourcePath);

    try {
      const parsed = await pdfParse(buffer);
      const pages = splitIntoPages(parsed.text);
      return {
        summary: inferSummary(pages.join("\n")),
        blocks: pages.map((pageText, index) => ({
          location: `page:${index + 1}`,
          text: pageText.trim()
        }))
      };
    } catch (_error) {
      const fallbackText = buffer.toString("utf8");
      const pages = splitIntoPages(fallbackText);
      return {
        summary: inferSummary(fallbackText),
        blocks: pages.map((pageText, index) => ({
          location: `page:${index + 1}`,
          text: pageText.trim()
        }))
      };
    }
  }
}

function splitIntoPages(text) {
  const normalized = text.replace(/\r/g, "");
  const pages = normalized.split(/\f+/).map((item) => item.trim()).filter(Boolean);
  if (pages.length > 0) {
    return pages;
  }

  return normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function inferSummary(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 220);
}
