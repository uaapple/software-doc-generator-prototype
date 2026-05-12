import { randomUUID } from "node:crypto";
import { PdfExtractor } from "./pdf-extractor.js";
import { CExtractor } from "./c-extractor.js";
import { SlxModelAnalysisService, SlxAnalysisError } from "./slx-model-analysis-service.js";
import { MatlabMcpError } from "./matlab-mcp-client.js";

export class ExtractionService {
  constructor(options = {}) {
    this.pdfExtractor = new PdfExtractor();
    this.cExtractor = new CExtractor();
    this.slxAnalysisService = options.slxAnalysisService || new SlxModelAnalysisService(options);
  }

  async extractFiles(project, options = {}) {
    const extractions = [];
    const files = Array.isArray(project.files) ? project.files : [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      options.onProgress?.({
        phase: "extracting_file",
        current: index + 1,
        total: files.length,
        fileName: file.originalName,
        fileRole: file.role
      });

      if (file.role === "simulink_slx") {
        options.onProgress?.({
          phase: "extracting_file",
          current: index + 1,
          total: files.length,
          fileName: file.originalName,
          fileRole: file.role,
          slxParsing: true
        });

        try {
          const extraction = await this.slxAnalysisService.analyzeAndConvertToExtraction(file, {
            absolutePath: file.absolutePath,
            documentType: options.documentType || "software_requirement"
          });
          extractions.push(extraction);
          options.onProgress?.({
            phase: "file_extracted",
            current: index + 1,
            total: files.length,
            fileName: file.originalName,
            evidenceCount: extraction.evidence.length,
            slxParsed: true
          });
        } catch (slxError) {
          const isMcpUnavailable = slxError instanceof MatlabMcpError && (slxError.code === "CONNECTION_ERROR" || slxError.code === "TIMEOUT");
          const errorMessage = isMcpUnavailable
            ? `MATLAB MCP 不可用，无法解析 SLX 文件 ${file.originalName}：${slxError.message}。请检查 MATLAB MCP 服务配置。`
            : `SLX 文件 ${file.originalName} 解析失败：${slxError.message}`;

          options.onProgress?.({
            phase: "slx_parse_failed",
            current: index + 1,
            total: files.length,
            fileName: file.originalName,
            error: errorMessage,
            errorCode: slxError.code || "SLX_PARSE_ERROR"
          });

          throw new Error(errorMessage);
        }
        continue;
      }

      const extractor = file.role === "generated_c" ? this.cExtractor : this.pdfExtractor;
      const result = await extractor.extract(file, {
        baseDir: options.fileBaseDir,
        allowStoredNameFallback: options.allowStoredNameFallback
      });
      extractions.push({
        id: randomUUID(),
        fileId: file.id,
        fileRole: file.role,
        fileName: file.originalName,
        summary: result.summary,
        evidence: result.blocks.map((block) => ({
          id: randomUUID(),
          fileId: file.id,
          fileRole: file.role,
          fileName: file.originalName,
          location: block.location,
          excerpt: block.text,
          tags: block.tags || inferTags(block.text, file.role),
          confidence: inferConfidence(file.role, block.text)
        }))
      });
      options.onProgress?.({
        phase: "file_extracted",
        current: index + 1,
        total: files.length,
        fileName: file.originalName,
        evidenceCount: result.blocks.length
      });
    }

    return extractions;
  }
}

function inferTags(text, role) {
  const tags = [];
  if (role === "system_pdf") tags.push("system-source");
  if (role === "model_pdf") tags.push("model-source");
  if (/状态|mode|state/i.test(text)) tags.push("state");
  if (/接口|signal|input|output/i.test(text)) tags.push("interface");
  if (/故障|fault|error|诊断/i.test(text)) tags.push("diagnostic");
  if (/周期|ms|Hz|step|period/i.test(text)) tags.push("timing");
  if (/阈值|标定|limit|max|min/i.test(text)) tags.push("threshold");
  if (/应|shall|must/i.test(text)) tags.push("requirement-like");
  return tags.length > 0 ? tags : ["general"];
}

function inferConfidence(role, text) {
  let confidence = 0.65;
  if (role === "system_pdf") confidence += 0.15;
  if (role === "generated_c") confidence -= 0.05;
  if (/应|shall|must/i.test(text)) confidence += 0.1;
  return Math.max(0.2, Math.min(0.95, Number(confidence.toFixed(2))));
}
