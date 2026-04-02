import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const now = 1710000000000;
let seed = 1000;
let nonce = 2000;

function base(id, type, x, y, width, height, extra = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: extra.strokeColor || "#1f1f1f",
    backgroundColor: extra.backgroundColor || "transparent",
    fillStyle: "solid",
    strokeWidth: extra.strokeWidth || 2,
    strokeStyle: extra.strokeStyle || "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: extra.roundness === undefined ? { type: 2 } : extra.roundness,
    seed: seed++,
    version: 1,
    versionNonce: nonce++,
    isDeleted: false,
    boundElements: extra.boundElements === undefined ? [] : extra.boundElements,
    updated: now,
    link: null,
    locked: false,
    ...extra
  };
}

function rect(id, x, y, width, height, backgroundColor) {
  return base(id, "rectangle", x, y, width, height, { backgroundColor });
}

function ellipse(id, x, y, width, height, backgroundColor) {
  return base(id, "ellipse", x, y, width, height, {
    backgroundColor,
    roundness: null
  });
}

function diamond(id, x, y, width, height, backgroundColor) {
  return base(id, "diamond", x, y, width, height, {
    backgroundColor,
    roundness: null
  });
}

function text(id, x, y, width, height, textValue, containerId = null, fontSize = 18, color = "#1f1f1f") {
  return {
    ...base(id, "text", x, y, width, height, {
      strokeColor: color,
      backgroundColor: "transparent",
      strokeWidth: 1,
      roundness: null,
      boundElements: null
    }),
    text: textValue,
    fontSize,
    fontFamily: 1,
    textAlign: containerId ? "center" : "left",
    verticalAlign: containerId ? "middle" : "top",
    baseline: Math.max(18, fontSize - 2),
    containerId,
    originalText: textValue,
    lineHeight: 1.25
  };
}

function arrow(id, x, y, points, strokeStyle = "solid") {
  return {
    ...base(id, "arrow", x, y, 0, 0, {
      backgroundColor: "transparent",
      strokeStyle,
      roundness: null,
      boundElements: null
    }),
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow"
  };
}

const elements = [
  text(
    "title",
    80,
    28,
    700,
    36,
    "软件设计需求生成流程（Excalidraw 风格）",
    null,
    28
  ),
  text(
    "subtitle",
    82,
    72,
    980,
    24,
    "面向非技术人员：理解系统需求 PDF、模型说明 PDF、C 代码如何借助大模型生成软件设计需求",
    null,
    18,
    "#5f6368"
  ),

  rect("step1", 180, 120, 250, 120, "#d9ecff"),
  text("step1-text", 210, 150, 190, 60, "1. 上传资料并点击生成\n网页界面\n选择项目、上传文件、发起生成", "step1"),

  rect("step2", 500, 120, 220, 120, "#ddeed2"),
  text("step2-text", 530, 152, 160, 52, "2. 系统接收生成请求\n后端接口\n把请求交给生成流程", "step2"),

  rect("step3", 790, 120, 300, 120, "#fff1bf"),
  text("step3-text", 825, 148, 230, 60, "3. 生成流程总控\n把“读取输入-抽取信息-\n调用大模型-校验结果”串起来", "step3"),

  diamond("inputs", 40, 315, 220, 160, "#f6d9e3"),
  text("inputs-text", 77, 355, 146, 82, "输入材料\n系统需求 PDF\n模型说明 PDF\n生成的 C 代码\nSLX（当前预留）", "inputs"),

  rect("step4", 300, 330, 250, 130, "#fde2bf"),
  text("step4-text", 334, 370, 182, 54, "4. 先把材料归档\n记录项目、文件类型、\n文件名和上传时间", "step4"),

  rect("step5", 620, 310, 320, 170, "#f6d5d2"),
  text("step5-text", 660, 352, 240, 90, "5. 提取关键信息\nPDF：正文、段落、关键描述\nC 代码：函数、条件、阈值、接口线索\n产出：摘要 + 证据片段", "step5"),

  rect("step6", 1010, 330, 240, 130, "#fff1bf"),
  text("step6-text", 1042, 368, 176, 68, "6. 准备生成规范\nskills 编写规则\ntemplate 文档模板\nschema 输出格式", "step6"),

  ellipse("openai", 1290, 120, 250, 120, "#d8eef0"),
  text("openai-text", 1330, 156, 170, 66, "大模型能力\n理解输入材料\n按规范组织内容\n生成结构化需求条目", "openai"),

  rect("step7", 1320, 320, 320, 170, "#ddd4ef"),
  text("step7-text", 1358, 360, 244, 90, "7. 调用大模型生成需求\n把“项目背景 + 输入证据 + 编写规范”\n一起发给大模型\n未配置 API 时走本地规则兜底", "step7"),

  rect("step8", 1320, 560, 250, 120, "#f8cda1"),
  text("step8-text", 1350, 596, 190, 54, "8. 自动检查生成结果\n是否缺来源、是否重复、\n是否表述模糊", "step8"),

  rect("step9", 940, 560, 290, 140, "#fde2bf"),
  text("step9-text", 976, 602, 218, 72, "9. 形成软件设计需求草稿\nrequirements 需求条目\ntraces 来源追溯\nconflicts 风险/冲突提示", "step9"),

  rect("step10", 560, 560, 280, 130, "#d9ead3"),
  text("step10-text", 598, 602, 204, 54, "10. 人工审核与修订\n接受、修改、驳回\n把最终意见回写到项目中", "step10"),

  ellipse("storage", 200, 555, 270, 130, "#cfe2f3"),
  text("storage-text", 246, 596, 178, 54, "项目资料库\n保存原始输入、生成结果\n和审核记录", "storage"),

  arrow("a1", 430, 180, [[0, 0], [70, 0]]),
  arrow("a2", 720, 180, [[0, 0], [70, 0]]),
  arrow("a3", 940, 240, [[0, 0], [0, 70], [-390, 20]]),
  arrow("a4", 260, 395, [[0, 0], [40, 0]]),
  arrow("a5", 550, 395, [[0, 0], [70, 0]]),
  arrow("a6", 940, 395, [[0, 0], [70, 0]]),
  arrow("a7", 1415, 240, [[0, 0], [0, 80]]),
  arrow("a8", 1450, 490, [[0, 0], [0, 70]]),
  arrow("a9", 1320, 625, [[0, 0], [-90, 0]]),
  arrow("a10", 940, 625, [[0, 0], [-100, 0]]),
  arrow("a11", 560, 625, [[0, 0], [-90, -5]]),
  arrow("a12", 425, 460, [[0, 0], [0, 95]], "dashed"),

  text(
    "legend",
    82,
    748,
    1080,
    48,
    "核心理解：系统不是把原始文档直接变成最终需求，而是先从 PDF 和 C 代码里抽取证据，再结合编写规范，把“输入证据 + 规则约束”一起交给大模型生成草稿，最后再自动校验并人工审核。",
    null,
    18,
    "#5f6368"
  )
];

const scene = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    gridSize: 20,
    viewBackgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 0.8 }
  },
  files: {}
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, "..", "diagrams", "software-design-requirement-flow.excalidraw");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(scene, null, 2), "utf8");
console.log(outputPath);
