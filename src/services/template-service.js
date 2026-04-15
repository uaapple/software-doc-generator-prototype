import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

const TEMPLATE_FILES = {
  software_requirement: "software-requirement-template.json",
  detail_design: "detail-design-template.json",
  hil_test_case: "hil-test-case-template.json"
};

export class TemplateService {
  getTemplatePath(documentType = "software_requirement") {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    return path.join(config.templateDir || path.dirname(config.templatePath), TEMPLATE_FILES[normalizedDocumentType]);
  }

  async getTemplate(documentType = "software_requirement") {
    const templatePath = this.getTemplatePath(documentType);
    const content = await readFile(templatePath, "utf8");
    return JSON.parse(content.replace(/^﻿/, ""));
  }
}
