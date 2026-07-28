export const SOFTWARE_DETAIL_STAGE_CATALOG_VERSION = "software-detail-minimal/v1";

function artifact(role, options = {}) {
  return {
    role,
    required: options.required !== false,
    sourceStageId: options.sourceStageId || ""
  };
}

function input(role, sourceStageId, options = {}) {
  return artifact(role, { ...options, sourceStageId });
}

function output(role, options = {}) {
  return artifact(role, options);
}

const definitions = [
  {
    id: "software-detail-stage-01-initialize",
    order: 100,
    skillName: "software-detail-stage-01-initialize",
    hermesSessionRequired: true,
    runtimeKind: "host",
    responsibility: "初始化任务并建立任务级 MATLAB 会话。",
    inputs: [
      input("source-model", "job-input"),
      input("model-data", "job-input"),
      input("model-init-script", "job-input", { required: false }),
      input("project-selection", "job-input"),
      input("worker-selection", "job-input")
    ],
    outputs: [
      output("input-manifest"),
      output("workspace-manifest"),
      output("matlab-session-lease")
    ]
  },
  {
    id: "software-detail-stage-02-model-plan",
    order: 200,
    skillName: "software-detail-stage-02-model-plan",
    hermesSessionRequired: true,
    runtimeKind: "reasoning",
    responsibility: "建立模型索引、层级清单与分析队列。",
    inputs: [
      input("input-manifest", "software-detail-stage-01-initialize"),
      input("workspace-manifest", "software-detail-stage-01-initialize"),
      input("matlab-session-lease", "software-detail-stage-01-initialize")
    ],
    outputs: [
      output("model-index"),
      output("hierarchy-manifest"),
      output("analysis-queue")
    ]
  },
  {
    id: "software-detail-stage-03-evidence-extract",
    order: 300,
    skillName: "software-detail-stage-03-evidence-extract",
    hermesSessionRequired: true,
    runtimeKind: "matlab",
    responsibility: "按计划提取模型证据。",
    inputs: [
      input("input-manifest", "software-detail-stage-01-initialize"),
      input("workspace-manifest", "software-detail-stage-01-initialize"),
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("model-index", "software-detail-stage-02-model-plan"),
      input("hierarchy-manifest", "software-detail-stage-02-model-plan"),
      input("analysis-queue", "software-detail-stage-02-model-plan")
    ],
    outputs: [output("evidence-shards")]
  },
  {
    id: "software-detail-stage-04-output-ledger",
    order: 400,
    skillName: "software-detail-stage-04-output-ledger",
    hermesSessionRequired: true,
    runtimeKind: "host",
    responsibility: "将模型证据整理为输出台账并检查覆盖率。",
    inputs: [
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("analysis-queue", "software-detail-stage-02-model-plan"),
      input("evidence-shards", "software-detail-stage-03-evidence-extract")
    ],
    outputs: [
      output("output-ledger"),
      output("coverage-report")
    ]
  },
  {
    id: "software-detail-stage-05-boundary-projection",
    order: 500,
    skillName: "software-detail-stage-05-boundary-projection",
    hermesSessionRequired: true,
    runtimeKind: "reasoning",
    responsibility: "将输出台账投影为文档边界、行为分组与叙事计划。",
    inputs: [
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("evidence-shards", "software-detail-stage-03-evidence-extract"),
      input("output-ledger", "software-detail-stage-04-output-ledger"),
      input("coverage-report", "software-detail-stage-04-output-ledger")
    ],
    outputs: [
      output("boundary-projection"),
      output("behavior-groups"),
      output("narrative-plan")
    ]
  },
  {
    id: "software-detail-stage-06-architecture-draft",
    order: 600,
    skillName: "software-detail-stage-06-architecture-draft",
    hermesSessionRequired: true,
    runtimeKind: "reasoning",
    responsibility: "生成架构部分草稿。",
    inputs: [
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("output-ledger", "software-detail-stage-04-output-ledger"),
      input("boundary-projection", "software-detail-stage-05-boundary-projection"),
      input("narrative-plan", "software-detail-stage-05-boundary-projection")
    ],
    outputs: [output("architecture-draft")]
  },
  {
    id: "software-detail-stage-07-module-draft",
    order: 700,
    skillName: "software-detail-stage-07-module-draft",
    hermesSessionRequired: true,
    runtimeKind: "reasoning",
    responsibility: "生成模块部分草稿。",
    inputs: [
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("output-ledger", "software-detail-stage-04-output-ledger"),
      input("boundary-projection", "software-detail-stage-05-boundary-projection"),
      input("behavior-groups", "software-detail-stage-05-boundary-projection"),
      input("narrative-plan", "software-detail-stage-05-boundary-projection"),
      input("architecture-draft", "software-detail-stage-06-architecture-draft")
    ],
    outputs: [output("module-draft")]
  },
  {
    id: "software-detail-stage-08-content-check",
    order: 800,
    skillName: "software-detail-stage-08-content-check",
    hermesSessionRequired: true,
    runtimeKind: "reasoning",
    responsibility: "检查草稿内容并形成可交付内容。",
    inputs: [
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("output-ledger", "software-detail-stage-04-output-ledger"),
      input("coverage-report", "software-detail-stage-04-output-ledger"),
      input("architecture-draft", "software-detail-stage-06-architecture-draft"),
      input("module-draft", "software-detail-stage-07-module-draft")
    ],
    outputs: [
      output("content-check-report"),
      output("checked-content")
    ]
  },
  {
    id: "software-detail-stage-09-docx-finalize",
    order: 900,
    skillName: "software-detail-stage-09-docx-finalize",
    hermesSessionRequired: true,
    runtimeKind: "docx-render",
    responsibility: "生成最终 DOCX、整理产物并清理任务级 MATLAB 会话。",
    inputs: [
      input("workspace-manifest", "software-detail-stage-01-initialize"),
      input("matlab-session-lease", "software-detail-stage-01-initialize"),
      input("content-check-report", "software-detail-stage-08-content-check"),
      input("checked-content", "software-detail-stage-08-content-check")
    ],
    outputs: [
      output("detail-design-docx"),
      output("artifact-manifest")
    ]
  }
];

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}

function assertCatalog() {
  if (definitions.length !== 9) {
    throw new Error("software detail stage catalog must contain exactly nine stages");
  }
  const runtimeKinds = new Set(["host", "matlab", "reasoning", "docx-render"]);
  const ids = new Set();
  const orders = new Set();
  const skillNames = new Set();
  for (const definition of definitions) {
    if (
      ids.has(definition.id) ||
      orders.has(definition.order) ||
      skillNames.has(definition.skillName)
    ) {
      throw new Error("software detail stage id, order and skillName must be unique");
    }
    if (
      definition.skillName !== definition.id ||
      definition.hermesSessionRequired !== true ||
      !runtimeKinds.has(definition.runtimeKind)
    ) {
      throw new Error(
        "every software detail stage must execute its matching Hermes skill"
      );
    }
    ids.add(definition.id);
    orders.add(definition.order);
    skillNames.add(definition.skillName);
  }
}

assertCatalog();
deepFreeze(definitions);

export const SOFTWARE_DETAIL_STAGE_DEFINITIONS = definitions;

const stagesById = new Map(definitions.map((definition) => [definition.id, definition]));

export function listSoftwareDetailStages() {
  return [...definitions];
}

export function getSoftwareDetailStage(stageId = "") {
  return stagesById.get(String(stageId || "").trim()) || null;
}
