import assert from "node:assert/strict";
import fs from "node:fs/promises";

const repoRoot = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("public/software-detail-design-generation.html", repoRoot), "utf8");
const script = await fs.readFile(new URL("public/software-detail-design-generation.js", repoRoot), "utf8");

globalThis.__SOFTWARE_DETAIL_UI_TEST__ = true;
globalThis.window = {
  location: {
    search: "",
    href: "http://localhost/software-detail-design-generation"
  },
  history: {
    replaceState() {}
  }
};
globalThis.document = {
  querySelector() {
    return null;
  }
};

const { renderSoftwareDetailPipeline } = await import(
  new URL(`public/software-detail-design-generation.js?ui-test=${Date.now()}`, repoRoot)
);

const stageIds = [
  "software-detail-stage-01-initialize",
  "software-detail-stage-02-model-plan",
  "software-detail-stage-03-evidence-extract",
  "software-detail-stage-04-output-ledger",
  "software-detail-stage-05-boundary-projection",
  "software-detail-stage-06-architecture-draft",
  "software-detail-stage-07-module-draft",
  "software-detail-stage-08-content-check",
  "software-detail-stage-09-docx-finalize"
];

const stages = stageIds
  .map((id, index) => ({
    id,
    order: (index + 1) * 100,
    skillName: id,
    status: index < 2 ? "completed" : index === 2 ? "running" : index === 6 ? "failed" : "pending",
    attempt: index < 3 || index === 6 ? 1 : 0,
    startedAt: index < 3 ? `2026-07-29T0${index}:00:00.000Z` : "",
    endedAt: index < 2 ? `2026-07-29T0${index}:10:00.000Z` : "",
    error: index === 6 ? { message: "<模型证据不足>" } : null
  }))
  .reverse();

const rendered = renderSoftwareDetailPipeline({
  pipeline: {
    status: "running",
    stages
  }
});

assert.match(rendered, /九阶段生成进度/);
assert.match(rendered, /已完成 2\/9/);
assert.match(rendered, /等待中/);
assert.match(rendered, /运行中/);
assert.match(rendered, /已完成/);
assert.match(rendered, /失败/);
assert.match(rendered, /第 1 次执行/);
assert.match(rendered, /开始：/);
assert.match(rendered, /结束：/);
assert.match(rendered, /class="module-description-stage[^"]*is-running"/);
assert.match(rendered, /aria-current="step"/);
assert.match(rendered, /role="alert">&lt;模型证据不足&gt;<\/p>/);
assert.ok(
  stageIds.every((id, index) => {
    if (index === stageIds.length - 1) return true;
    return rendered.indexOf(id) < rendered.indexOf(stageIds[index + 1]);
  }),
  "九个技能必须按阶段顺序展示"
);
assert.match(rendered, /第九阶段/);
assert.match(rendered, /生成并整理详细设计文档/);
assert.equal(renderSoftwareDetailPipeline({ id: "legacy-task", status: "completed" }), "");
assert.equal(renderSoftwareDetailPipeline({ pipeline: { stages: [] } }), "");

assert.match(html, /id="module-description-form"/);
assert.match(html, /name="modelSlx"/);
assert.match(html, /name="modelMat"/);
assert.match(html, /name="modelInitScript"/);
assert.match(html, /name="projectId"/);
assert.match(html, /name="workerId"/);
assert.match(html, /正在加载 Worker/);
assert.match(html, /src="\/software-detail-design-generation\.js"/);
assert.doesNotMatch(html, /detail-design-generation\.html/);

assert.match(script, /new FormData\(elements\.form\)/);
assert.match(script, /requestJson\("\/api\/software-module-description-generation\/tasks", \{\s*method: "POST"/);
assert.match(
  script,
  /href="\/api\/software-module-description-generation\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/artifacts\/\$\{encodeURIComponent\(artifact\.id\)\}\/download"/
);
assert.match(script, /setInterval\(async \(\) =>/);
assert.match(script, /renderTaskDetail\(task\)/);
assert.doesNotMatch(script, /\/api\/software-detail-pipeline/);
assert.match(script, /const running = task\.status === "running"/);
assert.match(script, /\$\{deleting \|\| running \? "disabled" : ""\}/);
assert.match(script, /任务运行中，暂不可删除/);
assert.match(script, /<h3>Hermes 执行信息<\/h3>/);
assert.match(script, /<dt>执行类型<\/dt>/);
assert.match(script, /<dt>技能<\/dt>/);
assert.doesNotMatch(script, /<h3>Hermes Step<\/h3>/);

delete globalThis.__SOFTWARE_DETAIL_UI_TEST__;
delete globalThis.window;
delete globalThis.document;

console.log("software detail pipeline UI tests passed");
