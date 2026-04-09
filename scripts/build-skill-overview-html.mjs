import { promises as fs } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');
const outputPath = path.join(docsDir, 'skill-overview.html');

const appendixSources = [
  {
    title: 'A1. <code>skills/requirement_extraction.md</code>',
    path: path.join(rootDir, 'skills', 'requirement_extraction.md'),
    type: 'text'
  },
  {
    title: 'A2. <code>skills/requirement_writing.md</code>',
    path: path.join(rootDir, 'skills', 'requirement_writing.md'),
    type: 'text'
  },
  {
    title: 'A3. <code>skills/requirement_validation.md</code>',
    path: path.join(rootDir, 'skills', 'requirement_validation.md'),
    type: 'text'
  },
  {
    title: 'A4. <code>skills/domain-knowledge.json</code>',
    path: path.join(rootDir, 'skills', 'domain-knowledge.json'),
    type: 'json'
  },
  {
    title: 'A5. <code>skills/examples/good_examples.md</code>',
    path: path.join(rootDir, 'skills', 'examples', 'good_examples.md'),
    type: 'text'
  },
  {
    title: 'A6. <code>skills/examples/bad_examples.md</code>',
    path: path.join(rootDir, 'skills', 'examples', 'bad_examples.md'),
    type: 'text'
  }
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function block(title, content) {
  return `
    <div class="appendix-block">
      <h3>${title}</h3>
      <pre>${escapeHtml(content)}</pre>
    </div>`;
}

async function loadAppendix() {
  const parts = [];
  for (const source of appendixSources) {
    const raw = await fs.readFile(source.path, 'utf8');
    const content = source.type === 'json' ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
    parts.push(block(source.title, content));
  }
  return parts.join('\n');
}

const summaryHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>软件需求生成平台 Skill 体系说明</title>
    <style>
      :root {
        --ink: #18314f;
        --muted: #5c6b7a;
        --line: #d7e0ea;
        --panel: #f7f9fc;
        --accent: #0f5fa8;
        --accent-soft: #e8f2fb;
        --good: #1c7a43;
        --warn: #9a4b12;
      }
      @page {
        size: A4;
        margin: 18mm 16mm 18mm 16mm;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
        line-height: 1.6;
        background:
          radial-gradient(circle at top right, rgba(15, 95, 168, 0.1), transparent 28%),
          linear-gradient(180deg, #f4f8fb 0%, #ffffff 18%);
      }
      main { width: 100%; }
      .hero {
        padding: 22px 24px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(15, 95, 168, 0.12), rgba(255, 255, 255, 0.95));
      }
      .eyebrow {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        color: var(--accent);
        background: rgba(255,255,255,0.85);
        letter-spacing: .08em;
      }
      h1 { margin: 14px 0 10px; font-size: 28px; line-height: 1.25; }
      .subtitle { margin: 0; font-size: 14px; color: var(--muted); }
      section {
        margin-top: 18px;
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.96);
      }
      h2 { margin: 0 0 12px; font-size: 18px; }
      h3 { margin: 0 0 8px; font-size: 15px; }
      p { margin: 0 0 10px; }
      ul, ol { margin: 8px 0 0 18px; padding: 0; }
      li { margin: 6px 0; }
      .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
      .card {
        padding: 14px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: var(--panel);
      }
      .pill {
        display: inline-block;
        margin-bottom: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
      }
      .flow { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; }
      .flow-step {
        min-height: 118px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, #ffffff, #f6f9fc);
      }
      .flow-step strong { display: block; margin-bottom: 6px; color: var(--accent); }
      .highlight {
        padding: 12px 14px;
        border-left: 4px solid var(--accent);
        border-radius: 10px;
        background: #f7fbff;
      }
      .compare { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
      .good, .bad { padding: 14px; border-radius: 14px; }
      .good { border: 1px solid rgba(28,122,67,.22); background: rgba(28,122,67,.08); }
      .bad { border: 1px solid rgba(154,75,18,.22); background: rgba(154,75,18,.08); }
      .good h3 { color: var(--good); }
      .bad h3 { color: var(--warn); }
      .caption { color: var(--muted); font-size: 12px; }
      .page-break { break-before: page; }
      .footer-note { margin-top: 16px; font-size: 11px; color: var(--muted); }
      .appendix-block {
        margin-top: 14px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #fbfcfe;
      }
      code {
        padding: 1px 4px;
        border-radius: 6px;
        background: #eef3f8;
        font-family: "Consolas", "Microsoft YaHei", monospace;
        font-size: .95em;
      }
      pre {
        margin: 0;
        padding: 14px;
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        background: #f4f7fb;
        color: #213549;
        font-family: "Consolas", "Microsoft YaHei", monospace;
        font-size: 11px;
        line-height: 1.55;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="eyebrow">PROJECT SKILL SYSTEM</span>
        <h1>软件需求生成平台 Skill 体系说明</h1>
        <p class="subtitle">面向同事展示的当前工程 Skill 总览。重点说明“为什么这样拆、每个 Skill 管什么、运行时如何协同、后续如何迭代升级”，并在后半部分附上全部原始内容。</p>
      </section>

      <section>
        <h2>1. 一页结论</h2>
        <div class="highlight">当前工程并不是把所有规则写成一个大 Prompt，而是把能力拆成 <strong>抽取、写作、校验</strong> 三个核心 Skill，再叠加 <strong>领域知识、正反例、版本化 bundle</strong> 形成可维护、可评估、可升级的 Skill 体系。</div>
        <ul>
          <li>拆分目标：把“证据理解”“需求生成”“质量把关”三个环节解耦。</li>
          <li>核心收益：规则边界更清楚，后续 refinement 和 benchmark 更容易做。</li>
          <li>当前主领域：嵌入式 VCU 的“扭矩干预”类软件设计需求生成。</li>
        </ul>
      </section>

      <section>
        <h2>2. 当前 Skill 组成</h2>
        <div class="grid-2">
          <article class="card">
            <span class="pill">Skill 01</span>
            <h3><code>requirement_extraction.md</code></h3>
            <p>负责“先看懂材料”。从系统需求 PDF、模型 PDF、生成 C 文件里提炼可写作的结构化事实。</p>
            <ul>
              <li>关注条件、状态、优先级、阈值、边界、模式、内部变量和引用线索。</li>
              <li>强调“先抽证据，不直接写正文”。</li>
              <li>遇到冲突先保留，不在抽取阶段武断裁决。</li>
            </ul>
          </article>
          <article class="card">
            <span class="pill">Skill 02</span>
            <h3><code>requirement_writing.md</code></h3>
            <p>负责“把证据写成工程化需求”。输出中文、可审核、可追溯、可验证的软件设计需求。</p>
            <ul>
              <li>优先复现人工样例的章节骨架和条目粒度。</li>
              <li>要求对象拆分明确，例如前轴与后轴必须分开成条。</li>
              <li>控制句式、优先级、边界写法和命名精度。</li>
            </ul>
          </article>
          <article class="card">
            <span class="pill">Skill 03</span>
            <h3><code>requirement_validation.md</code></h3>
            <p>负责“生成后的质量闸门”。检查生成结果是否完整、可追溯、结构正确且没有明显泛化失真。</p>
            <ul>
              <li>校验编号、来源、验证建议、置信度。</li>
              <li>识别结构缺失、对象粒度退化、命名偏差和无依据扩写。</li>
              <li>对 ISO 26262 场景重点关注单一真实来源约束。</li>
            </ul>
          </article>
          <article class="card">
            <span class="pill">Support Layer</span>
            <h3><code>domain-knowledge.json</code> + 正反例</h3>
            <p>负责“给核心 Skill 提供领域上下文和少样本约束”。它们不是主流程 Skill，但会直接影响生成风格和命名收敛。</p>
            <ul>
              <li>定义目标领域、推荐骨架、优先级和禁扩写项。</li>
              <li>维护标准工程命名与代码别名映射。</li>
              <li>用 good/bad examples 把“什么是好输出”讲具体。</li>
            </ul>
          </article>
        </div>
      </section>

      <section>
        <h2>3. 为什么拆成这三类 Skill</h2>
        <div class="grid-2">
          <div class="card">
            <h3>如果不拆</h3>
            <ul>
              <li>一个大 Prompt 同时承担理解、写作、校验，后续很难定位问题。</li>
              <li>模型一旦输出漂移，很难判断是事实抽错、写法跑偏还是校验没兜住。</li>
              <li>后续做 refinement 时，无法只优化某一层。</li>
            </ul>
          </div>
          <div class="card">
            <h3>拆开后的价值</h3>
            <ul>
              <li>抽取层负责“事实正确”，写作层负责“表达像工程文档”，校验层负责“结果可交付”。</li>
              <li>每层规则都能单独扩充、回归评估和版本管理。</li>
              <li>更适合沉淀成 bundle，并支持 candidate / active 的升级机制。</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="page-break">
        <h2>4. 运行时协同方式</h2>
        <div class="flow">
          <div class="flow-step"><strong>步骤 1</strong>系统接收输入文件：系统需求 PDF、模型 PDF、生成 C 文件。</div>
          <div class="flow-step"><strong>步骤 2</strong>抽取层先把证据整理成可消费事实，而不是直接拼需求正文。</div>
          <div class="flow-step"><strong>步骤 3</strong>LLM 编排层把三类 Skill、正反例、领域知识一起组织进模型输入。</div>
          <div class="flow-step"><strong>步骤 4</strong>模型或本地 fallback 按约束生成结构化需求条目。</div>
          <div class="flow-step"><strong>步骤 5</strong>校验层和人工审核共同收口，确认是否可作为可追溯需求草案。</div>
        </div>
        <p class="footer-note">工程实现上，<code>src/services/llm-service.js</code> 会在系统提示中同时注入 <code>requirement_extraction.md</code>、<code>requirement_writing.md</code>、<code>requirement_validation.md</code>、正反例和 <code>domain-knowledge.json</code>。</p>
      </section>

      <section>
        <h2>5. 当前工程里的 Skill Bundle 机制</h2>
        <p>当前仓库已经不再把 <code>skills/</code> 仅仅当成静态文件夹，而是在往 <strong>版本化 Skill Bundle</strong> 方向演进。</p>
        <ul>
          <li><code>skills/active/</code>：当前正式生效的 Skill。</li>
          <li><code>skills/bundles/&lt;bundleId&gt;/</code>：某次候选版本或历史版本的完整快照。</li>
          <li><code>SkillBundleService</code>：负责初始化、复制、激活、归档和 domain knowledge 补齐。</li>
        </ul>
        <div class="highlight">这意味着后续 Skill 不需要“直接覆盖老文件”，而是可以先形成 candidate bundle，跑 benchmark，再由人工决定是否升级为 active。</div>
      </section>

      <section>
        <h2>6. Skill Refinement 的定位</h2>
        <p>项目里新增的 <strong>Skill Refinement</strong> 不是日常生成流程的一部分，而是一个“旁路升级机制”。</p>
        <ol>
          <li>投喂高质量案例。</li>
          <li>从历史输入与人工答案中提炼新规则。</li>
          <li>生成 proposal 和 candidate skill bundle。</li>
          <li>跑 benchmark 回归评估。</li>
          <li>人工确认通过后，再升级 active skill。</li>
        </ol>
        <p>这套设计的核心是：<strong>让 skill 升级可解释、可量化、可回退</strong>，而不是每次人工直接改 Prompt。</p>
      </section>

      <section>
        <h2>7. 结尾总结</h2>
        <p>当前工程里的 Skill 体系，本质上是在把“经验性的需求写作方法”沉淀成 <strong>结构化、可执行、可演进的工程知识</strong>。</p>
        <p>它不是只为了把这一次需求写出来，而是为了让后续案例、规则、命名习惯和 review 标准，能够被持续复用、持续评估、持续升级。</p>
        <p class="footer-note">文档依据：<code>skills/*.md</code>、<code>skills/domain-knowledge.json</code>、<code>skills/examples/*</code>、<code>src/services/llm-service.js</code>、<code>src/services/skill-loader.js</code>、<code>src/services/skill-bundle-service.js</code>、<code>SKILL_REFINEMENT_DESIGN.md</code>、<code>Plan/Skill Refinement + Benchmark 回归评估模块方案.md</code>。</p>
      </section>

      <section class="page-break">
        <h2>附录 A. 核心 Skill 与知识资产完整内容</h2>
        <p>以下附录直接收录当前工程中的完整内容，方便同事在看完前面的讲解后，继续查看每一类 Skill 和支撑知识的原始定义。</p>
        __APPENDIX__
      </section>
    </main>
  </body>
</html>`;

async function main() {
  await fs.mkdir(docsDir, { recursive: true });
  const appendix = await loadAppendix();
  const html = summaryHtml.replace('__APPENDIX__', appendix);
  await fs.writeFile(outputPath, html, 'utf8');
  console.log(`HTML 已生成：${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
