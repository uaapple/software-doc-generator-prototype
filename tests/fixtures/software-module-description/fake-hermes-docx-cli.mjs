import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildZipArchive } from "../../zip-fixture.js";

export const FIXTURE_DOCX_NAME = "软件模块详细设计.docx";
export const FIXTURE_DOCX_RELATIVE_PATH = `outputs/${FIXTURE_DOCX_NAME}`;

export function buildFixtureDocx() {
  return buildZipArchive([
    {
      name: "[Content_Types].xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        "</Types>"
      ].join("")
    },
    {
      name: "_rels/.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
        "</Relationships>"
      ].join("")
    },
    {
      name: "word/document.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        "<w:body><w:p><w:r><w:t>software module description transport fixture</w:t></w:r></w:p>",
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>',
        "</w:document>"
      ].join("")
    }
  ]);
}

async function main() {
  const outputPath = path.join(process.cwd(), ...FIXTURE_DOCX_RELATIVE_PATH.split("/"));
  const bytes = buildFixtureDocx();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  process.stdout.write(JSON.stringify({
    status: "completed",
    summary: "Fixture Hermes CLI generated one software module description DOCX.",
    outputFiles: [
      {
        relativePath: FIXTURE_DOCX_RELATIVE_PATH,
        kind: "software_module_description_docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        description: "Deterministic software module description transport fixture",
        size: bytes.length
      }
    ],
    warnings: []
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
