import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const projectPath = path.join(rootDir, 'data', 'projects', '7d893fd2-2cce-4165-9baa-5feea62b8f68.json');
const docsDir = path.join(rootDir, 'docs');
const outputPath = path.join(docsDir, 'generated-requirements-overview.html');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function badge(text) {
  return `<span class="badge">${escapeHtml(text)}</span>`;
}

function card(title, body) {
  return `<article class="card"><h3>${title}</h3>${body}</article>`;
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

async function main() {
  await fs.mkdir(docsDir, { recursive: true });
  const project = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  const requirements = project.requirements || [];
  const files = project.files || [];
  const conflicts = project.conflicts || [];
  const auditLog = project.auditLog || [];
  const generatedLog = [...auditLog].reverse().find((item) => item.action === 'requirements_generated');

  const summaryCards = [
    card('项目概览', list([
      `项目名称：<strong>${escapeHtml(project.name)}</strong>`,
      `项目状态：${escapeHtml(project.status || 'unknown')}`,
      `需求条目数：<strong>${requirements.length}</strong>`,
      `冲突条目数：<strong>${conflicts.length}</strong>`
    ])),
    card('本次生成信息', list([
      `生成时间：${escapeHtml(project.updatedAt || '')}`,
      `生成记录：${escapeHtml(generatedLog?.detail || '无')}`,
      `审核状态：当前 8 条需求均为 pending`,
      `说明：本文件基于工程内最新项目落盘结果自动整理`
    ]))
  ].join('');

  const fileCards = files.map((file) => card(
    escapeHtml(file.role || 'unknown'),
    list([
      `原始文件名：<strong>${escapeHtml(file.originalName || '')}</strong>`,
      `类型：${escapeHtml(file.mimeType || '')}`,
      `大小：${escapeHtml(file.size || '')} bytes`,
      `上传时间：${escapeHtml(file.uploadedAt || '')}`
    ])
  )).join('');

  const requirementBlocks = requirements.map((req, index) => {
    const refs = (req.sourceRefs || []).map((ref) => `
      <li>
        <strong>${escapeHtml(ref.fileName)}</strong>
        <span class="meta">${escapeHtml(ref.location)}</span>
        <div class="quote">${escapeHtml(ref.excerpt)}</div>
      </li>`).join('');

    return `
      <section class="requirement ${index > 0 ? 'page-break' : ''}">
        <div class="req-head">
          <div>
            <div class="eyebrow">${escapeHtml(req.requirementId)}</div>
            <h2>${escapeHtml(req.title)}</h2>
          </div>
          <div class="badges">${badge(req.type || 'functional')}${badge(`confidence ${req.confidence ?? ''}`)}</div>
        </div>

        <div class="panel">
          <h3>需求正文</h3>
          <p class="req-text">${escapeHtml(req.requirementText)}</p>
        </div>

        <div class="grid-2">
          <div class="panel">
            <h3>生成理由</h3>
            <p>${escapeHtml(req.rationale || '')}</p>
          </div>
          <div class="panel">
            <h3>验证建议</h3>
            <p>${escapeHtml(req.verificationHint || '')}</p>
          </div>
        </div>

        <div class="panel">
          <h3>追溯来源</h3>
          <ul class="trace-list">${refs || '<li>无</li>'}</ul>
        </div>

        <div class="grid-2">
          <div class="panel">
            <h3>冲突说明</h3>
            <p>${escapeHtml(req.conflictNote || '无')}</p>
          </div>
          <div class="panel">
            <h3>审核状态</h3>
            <p>${escapeHtml(req.review?.status || 'pending')}</p>
          </div>
        </div>
      </section>`;
  }).join('\n');

  const riskNote = requirements
    .filter((item) => item.conflictNote)
    .map((item) => `<li><strong>${escapeHtml(item.requirementId)}</strong>：${escapeHtml(item.conflictNote)}</li>`)
    .join('') || '<li>本次项目落盘结果中未记录结构化 conflicts；仅有个别需求正文自带人工复核提示。</li>';

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>项目生成软件需求整理</title>
  <style>
    :root {
      --ink: #17324d;
      --muted: #607080;
      --line: #dbe4ed;
      --accent: #0e5d9f;
      --bg: #f5f8fb;
      --panel: #ffffff;
    }
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: linear-gradient(180deg, #eef5fb 0%, #ffffff 20%);
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      line-height: 1.6;
    }
    .hero, .section, .requirement {
      margin-top: 18px;
      padding: 18px 20px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,255,.97);
    }
    .hero {
      background: linear-gradient(135deg, rgba(14,93,159,.12), rgba(255,255,255,.96));
    }
    .top-tag, .eyebrow, .badge {
      display: inline-block;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }
    .top-tag, .eyebrow {
      padding: 4px 10px;
      color: var(--accent);
      background: #eef6ff;
      letter-spacing: .08em;
    }
    .badge {
      padding: 4px 8px;
      margin-left: 6px;
      color: var(--accent);
      background: #edf4fb;
    }
    h1 { margin: 14px 0 10px; font-size: 28px; }
    h2 { margin: 8px 0 10px; font-size: 20px; }
    h3 { margin: 0 0 8px; font-size: 15px; }
    p { margin: 0 0 10px; }
    ul { margin: 8px 0 0 18px; padding: 0; }
    li { margin: 6px 0; }
    .subtitle, .meta { color: var(--muted); }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
    .card, .panel {
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--bg);
    }
    .req-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .req-text {
      font-size: 14px;
      white-space: pre-wrap;
    }
    .trace-list { margin-left: 18px; }
    .quote {
      margin-top: 4px;
      padding: 8px 10px;
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      background: #f7fbff;
      color: #34506b;
    }
    .page-break { break-before: page; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="top-tag">GENERATED REQUIREMENTS</span>
      <h1>项目生成软件需求整理</h1>
      <p class="subtitle">基于工程内最新项目落盘结果自动整理，面向展示和评审使用。</p>
    </section>

    <section class="section">
      <h2>1. 项目摘要</h2>
      <div class="grid-2">${summaryCards}</div>
    </section>

    <section class="section">
      <h2>2. 输入文件</h2>
      <div class="grid-2">${fileCards}</div>
    </section>

    <section class="section">
      <h2>3. 结果判断</h2>
      <ul>
        <li>本次共生成 8 条需求，覆盖前轴/后轴激活判断、前轴/后轴扭矩计算、输入输出接口、状态切换和执行周期。</li>
        <li>项目文件中未记录结构化 conflicts，整体落盘状态完整。</li>
        <li>其中 <strong>SWR-008</strong> 自带“10ms 为同领域通用值，需后续项目定义确认”的提示，属于需要人工再确认的一条。</li>
      </ul>
      <div class="panel">
        <h3>人工复核提示</h3>
        <ul>${riskNote}</ul>
      </div>
    </section>

    ${requirementBlocks}
  </main>
</body>
</html>`;

  await fs.writeFile(outputPath, html, 'utf8');
  console.log(`HTML 已生成：${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
