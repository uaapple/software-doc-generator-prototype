import path from "node:path";
import { openZipArchive } from "./zip-archive.js";

function quotePowerShell(value = "") {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

function decodeXmlEntities(value = "") {
  return String(value || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalizeCellText(value = "") {
  return decodeXmlEntities(String(value || ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function readAttributeMap(fragment = "") {
  const attributes = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(fragment))) {
    attributes[match[1]] = decodeXmlEntities(match[2]);
  }
  return attributes;
}

function columnRefToIndex(cellRef = "") {
  const letters = String(cellRef || "").match(/[A-Za-z]+/)?.[0] || "";
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function parseSharedStrings(xml = "") {
  const items = [];
  const pattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    const textMatches = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)];
    items.push(normalizeCellText(textMatches.map((item) => item[1] || "").join("")));
  }
  return items;
}

function parseWorkbookSheets(xml = "") {
  return [...xml.matchAll(/<sheet\b([^>]*)\/>/g)].map((match) => {
    const attrs = readAttributeMap(match[1] || "");
    return {
      name: attrs.name || "",
      relationshipId: attrs["r:id"] || attrs.id || ""
    };
  });
}

function parseWorkbookRelationships(xml = "") {
  const map = new Map();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = readAttributeMap(match[1] || "");
    if (attrs.Id && attrs.Target) {
      map.set(attrs.Id, attrs.Target.replace(/^\/+/, ""));
    }
  }
  return map;
}

function parseSheetRows(xml = "", sharedStrings = []) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = readAttributeMap(cellMatch[1] || "");
      const cellType = attrs.t || "";
      const columnIndex = columnRefToIndex(attrs.r || "");
      let value = "";
      if (cellType === "inlineStr") {
        value = [...cellMatch[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1] || "").join("");
      } else {
        const rawValue = cellMatch[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "";
        if (cellType === "s") {
          const sharedIndex = Number(rawValue);
          value = Number.isInteger(sharedIndex) && sharedIndex >= 0 ? sharedStrings[sharedIndex] || "" : "";
        } else {
          value = rawValue;
        }
      }
      values[columnIndex] = normalizeCellText(value);
    }
    rows.push(values.map((item) => normalizeCellText(item || "")));
  }
  return rows;
}

function findHeaderIndex(rows = [], requiredHeaders = []) {
  const normalizedRequired = requiredHeaders.map((item) => item.trim().toLowerCase());
  return rows.findIndex((row) => {
    const normalizedRow = row.map((cell) => String(cell || "").trim().toLowerCase());
    return normalizedRequired.every((header) => normalizedRow.includes(header));
  });
}

function buildHeaderMap(headerRow = []) {
  return headerRow.reduce((map, value, index) => {
    const key = String(value || "").trim().toLowerCase();
    if (key) {
      map.set(key, index);
    }
    return map;
  }, new Map());
}

function rowValue(row = [], headerMap = new Map(), label = "") {
  const index = headerMap.get(String(label || "").trim().toLowerCase());
  if (typeof index !== "number") {
    return "";
  }
  return normalizeCellText(row[index] || "");
}

function buildHilNormalizedText(sheetName = "", cases = []) {
  return [
    "Spreadsheet source type: HIL test cases",
    `Worksheet: ${sheetName || "Basic Report"}`,
    "",
    ...cases.flatMap((item, index) => [
      `Case ${index + 1}`,
      `Title: ${item.title}`,
      "Precondition:",
      item.precondition || "(empty)",
      "Step Description:",
      item.stepDescription || "(empty)",
      "Expected Result:",
      item.expectedResult || "(empty)",
      ""
    ])
  ]
    .join("\n")
    .trim();
}

export class SpreadsheetExtractionService {
  async parseHilSpreadsheet(filePath = "") {
    const resolvedPath = String(filePath || "").trim();
    if (!resolvedPath) {
      throw new Error("Spreadsheet path is required");
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    if (extension !== ".xlsx") {
      throw new Error("当前仅支持 .xlsx 格式的 HIL Excel 导入");
    }

    const archive = await openZipArchive(resolvedPath, {
      maxArchiveBytes: 64 * 1024 * 1024,
      maxEntryUncompressedBytes: 8 * 1024 * 1024,
      maxTotalUncompressedBytes: 64 * 1024 * 1024
    });
    const workbookXml = archive.readText("xl/workbook.xml");
    const workbookRelsXml = archive.readText("xl/_rels/workbook.xml.rels");
    if (!workbookXml || !workbookRelsXml) {
      throw new Error("无法读取 Excel 工作簿内容");
    }

    const sheets = parseWorkbookSheets(workbookXml);
    const relationshipMap = parseWorkbookRelationships(workbookRelsXml);
    const targetSheet = sheets.find((item) => item.name === "Basic Report") || sheets[0];
    if (!targetSheet) {
      throw new Error("Excel 中未找到可用工作表");
    }

    const targetPath = relationshipMap.get(targetSheet.relationshipId);
    if (!targetPath) {
      throw new Error("无法定位 Excel 工作表内容");
    }

    const sharedStringsXml = archive.readText("xl/sharedStrings.xml");
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
    const sheetXml = archive.readText(`xl/${targetPath.replace(/^xl\//, "")}`);
    if (!sheetXml) {
      throw new Error("无法读取目标工作表内容");
    }

    const rows = parseSheetRows(sheetXml, sharedStrings);
    const headerIndex = findHeaderIndex(rows, ["title", "precondition", "step description", "expected result"]);
    if (headerIndex === -1) {
      throw new Error("未在 Excel 中找到 HIL 用例所需的表头");
    }

    const headerMap = buildHeaderMap(rows[headerIndex] || []);
    const cases = rows
      .slice(headerIndex + 1)
      .map((row) => ({
        id: rowValue(row, headerMap, "id"),
        title: rowValue(row, headerMap, "title"),
        precondition: rowValue(row, headerMap, "precondition"),
        stepDescription: rowValue(row, headerMap, "step description"),
        expectedResult: rowValue(row, headerMap, "expected result")
      }))
      .filter((item) => item.title || item.precondition || item.stepDescription || item.expectedResult);

    if (!cases.length) {
      throw new Error("Excel 中未提取到有效的 HIL 用例");
    }

    return {
      sheetName: targetSheet.name || "Basic Report",
      cases,
      normalizedText: buildHilNormalizedText(targetSheet.name, cases)
    };
  }
}
