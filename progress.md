# 进度日志

## 会话：2026-04-10

### 阶段：驳回反馈闭环实现与 LLM 回投接入
- **状态：** complete（代码闭环已打通，skill 文件结构迁移尚未开始）
- **执行的操作：**
  - 新增 `SkillRule` / `SkillRuleChangeLog` / `SkillBundleRuleIndex`，为规则级追踪和 proposal item 应用打底。
  - 新增 `RejectionService`，在 requirement 驳回时沉淀结构化 `RejectionRecord`。
  - 新增 `ReplayTaskService`，支持从驳回记录池构造 replay task、生成 proposal item，并将已接受项应用为 candidate bundle。
  - 扩展 `SkillBundleService`，让 candidate bundle 优先从规则级 proposal item 物化，而不是只做粗粒度文本 append。
  - 新增 `feedback-pool.html` / `feedback-pool.js`，提供驳回池浏览、分组、回投、逐条审核与应用界面。
  - 扩展首页驳回交互，`rejected` 审核时改为提交结构化原因，而不是只改 review status。
  - 扩展 `LlmService`，让 replay proposal 可复用现有 LLM Profile；创建 replay task 时可选择已配置模型，不选时走本地 fallback。
  - 修复 `RejectionService` 列表读取时误把 `groups.json` 当成记录文件的问题。
- **创建/修改的文件：**
  - `src/services/skill-rule-service.js`
  - `src/services/rejection-service.js`
  - `src/services/replay-task-service.js`
  - `src/services/project-service.js`
  - `src/services/skill-bundle-service.js`
  - `src/services/llm-service.js`
  - `src/app.js`
  - `src/config.js`
  - `src/services/storage.js`
  - `public/index.html`
  - `public/app.js`
  - `public/feedback-pool.html`
  - `public/feedback-pool.js`
  - `public/app.css`
  - `tests/run-tests.js`
- **验证结果：**
  - `node tests/run-tests.js` -> `All 8 tests passed.`
  - 新增覆盖：
    - requirement 驳回会创建反馈池记录
    - replay task 接受 proposal item 后可生成 candidate bundle
- **补充说明：**
  - 当前“规则级能力”已在系统层落地，但 `skills/active/*.md` 还没有正式迁移成显式编号的规则文档。
  - 因此当前生成需求时，仍然主要加载现有 markdown 形态的 active skill；只是系统已经具备后续按条写回和追踪的基础设施。

## 会话：2026-04-14

### 阶段：工程/模块模型重构与迁移演示工程
- **状态：** complete
- **执行的操作：**
  - 将项目模型扩展为“工程 / 功能模块 / 文档空间 / 生成任务 / 已采纳结果”结构。
  - 为模块资产、模块任务、模块接受结果补齐后端接口与服务方法。
  - 新增 `scripts/migrate-legacy-demo.mjs`，把旧版 `Torque Intervention Trial` 与一条 skill refinement case/run 迁入新模型。
  - 生成迁移演示工程 `迁移演示工程 - 扭矩干预`，用于后续界面联调。
- **验证结果：**
  - `npm test` -> `All 10 tests passed.`
  - 迁移结果已确认：
    - 模块 `扭矩干预`：6 个资产、1 条软件需求任务、7 条结果
    - 模块 `Skill Refinement 改进记录`：1 条软件需求任务、1 条详细设计任务

### 阶段：分层导航与页面职责重划
- **状态：** complete（代码完成，仍待人工浏览器走查）
- **执行的操作：**
  - 将首页重做为纯工程列表页，不再堆叠模块、资产、任务和结果。
  - 新增独立的创建工程页、工程详情页、创建模块页、模块主页、任务详情页。
  - 功能模块主页改为主浏览页，展示已采纳结果全文和历史任务列表。
  - 单次任务新增独立详情页，用于完整查看结果、冲突、追溯并执行采纳/驳回。
  - 恢复 `/requirement-generation` 与 `/detail-design-generation` 为真实生成工具页。
  - 新生成工具页支持读取 `projectId + moduleId` 上下文，并在生成完成后返回模块主页。
  - 为分层页面补充 breadcrumb 导航。
- **创建/修改的文件：**
  - `public/index.html`
  - `public/project-create.html`
  - `public/project-detail.html`
  - `public/module-create.html`
  - `public/module-detail.html`
  - `public/task-detail.html`
  - `public/hierarchy.css`
  - `public/hierarchy.js`
  - `public/requirement-generation.html`
  - `public/detail-design-generation.html`
  - `public/generator.js`
  - `public/app.css`
  - `src/app.js`
  - `src/services/project-service.js`
  - `src/services/pipeline-service.js`
  - `tests/run-tests.js`
- **验证结果：**
  - `node --check public/hierarchy.js`
  - `node --check public/generator.js`
  - 应用初始化检查：`APP_OK`
  - `npm test` -> `All 10 tests passed.`
- **补充说明：**
  - 用户明确要求“生成页就只是做生成页”，因此主审阅入口改成了任务详情页。
  - 模块主页保留已采纳结果全文展示，不做摘要折叠。

### 阶段：分支整理与提交
- **状态：** complete
- **执行的操作：**
  - 创建并切换到新开发分支：`codex-layered-navigation-workflow`
  - 创建提交：`8bfcd66 Implement layered project module task navigation`
- **遇到的问题：**
  - `git switch -c codex/...` 因 ref 目录创建失败未采用
  - sandbox 下直接创建 branch 失败，后通过提权完成

## 后续任务
- 在真实浏览器中手动走查：
  - 工程列表 -> 工程页 -> 模块页 -> 生成页 -> 模块页 -> 任务详情页
- 检查迁移演示工程在新导航下的显示是否完全符合预期
- 如有需要，继续收口任务详情页的视觉与审阅交互
- 继续推进 skill markdown 规则化迁移与编码问题治理

## 会话：2026-04-16

### 阶段：软件需求文档类型技能初始化
- **状态：** complete
- **执行的操作：**
  - 读取 `input/20260404` 中的软件需求写作规范、系统需求示例与扭矩干预样例，提炼软件需求条目的共性写法。
  - 读取 `input/20260411/AI case_ITK_20260411.docx`，确认本轮只需要覆盖软件需求层，并识别充电管理、高低系统管理、高压能量管理等主题范围。
  - 检查 `software_requirement` profile 当前状态，确认 manifest 已注册但 profile 仍为空壳，仅有空的 `skill-items.json`。
  - 交叉读取 `充电管理`、`高低系统管理`、`高压能量管理` 模块 profile 中的 good examples 与 domain knowledge，作为软件需求文档类型层的样例锚点。
- **创建/修改的文件：**
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `skills/active/skill-manifest.json`
  - `skills/active/profiles/doc-types/software_requirement/requirement_writing.md`
  - `skills/active/profiles/doc-types/software_requirement/requirement_validation.md`
  - `skills/active/profiles/doc-types/software_requirement/examples/good_examples.md`
  - `skills/active/profiles/doc-types/software_requirement/domain-knowledge.json`
  - `skills/active/profiles/doc-types/software_requirement/skill-items.json`
- **补充说明：**
  - 当前方向不是恢复 `detail_design` / `hil_test_case`，而是为 `software_requirement` 文档类型层补齐第一版可用技能文件。
  - 静态校验已通过：相关 JSON 文件均可解析，`git diff --check` 通过，registry 与 markdown / domain knowledge 的条目数量一致。

## 会话：2026-04-17

### 阶段：Fallback 技能工单链路收口与 prompt-first 回调
- **状态：** complete（实现已落地，真实案例质量仍待继续验证）
- **执行的操作：**
  - 完成 fallback -> skill work order 的主链路接通，新增工单列表、详情、item 级审阅与应用。
  - 修复 replay 结果可见但工单未生成的问题，支持从 replay proposal items 回填工单项。
  - 将 replay / work order 面向用户的默认标题、摘要和标签统一为中文。
  - 修复本地启动脚本、健康检查与 SQLite 锁等待问题，补充 `restart-local.cmd` 便于重启后端。
  - 修复技能工单列表卡片文字颜色错误，保证工单内容默认可见。
  - 在工单详情中展示 `scopeDecision / scopeReason / abstractionScore / reviewReadiness / reuseJudgement` 等质量信号。
  - 按用户要求放弃“后端对单案例做硬约束纠偏”的思路，切回 prompt-first：通过优化 replay prompt，让 LLM 自主输出正确层级和可复用规则正文；后端只保留轻量质量元数据。
- **创建/修改的文件：**
  - `src/services/llm-service.js`
  - `src/services/replay-task-service.js`
  - `src/services/skill-work-order-service.js`
  - `src/services/skill-database-service.js`
  - `src/services/storage.js`
  - `src/app.js`
  - `src/config.js`
  - `public/skill-management.html`
  - `public/skill-management.js`
  - `public/skill-management.css`
  - `public/feedback-pool.js`
  - `scripts/start-local.ps1`
  - `scripts/restart-local.ps1`
  - `restart-local.cmd`
  - `tests/run-tests.js`
- **验证结果：**
  - `node .\\tests\\run-tests.js` -> `All 29 tests passed.`
  - `node --check .\\src\\services\\llm-service.js`
  - `node --check .\\public\\skill-management.js`
- **遇到的问题：**
  - `planning-with-files` 推荐的 `session-catchup.py` 在本机无法直接运行：`python` 命令不存在。
  - 因为 Windows 终端编码与项目中文内容混合，部分 PowerShell 输出存在视觉乱码风险；后续编辑继续优先使用 `apply_patch`。
- **补充说明：**
  - 当前最重要的不是再补更多后端修正规则，而是用真实 fallback 案例验证：LLM 是否已经会把模块特定建议正确沉淀到 `module` 层，并输出可复用的原子技能正文。
  - 旧的 replay/task/工单记录不会自动变成新 prompt 风格，后续验证应以新跑出的样本为准。

## 下一步建议验证方向
- 重跑 `充电管理 / software_requirement` 的真实 fallback，重点观察：
  - 是否自主选择 `module` 而不是错误落到 `docType`
  - 推荐正文是否已经抽象成“某类需求在什么条件下不得补写什么内容”的规则文本
  - `isParaphraseOfRejection` 与 `reviewReadiness` 是否和人工直觉一致
- 再选一条真正通用的 `software_requirement` 驳回样本做对照，确认 prompt 不会把本来应该上提到文档类型层的规则误沉到模块层。
- 如果验证后仍然发现“只是改写驳回意见”的问题，下一轮优先增强 prompt 与 few-shot，而不是回头加入 case-specific backend override。

## 会话：2026-04-17（进度审计与规划同步）

### 阶段：当前进度盘点
- **状态：** complete
- **执行的操作：**
  - 读取 `task_plan.md`、`progress.md`、`findings.md`，恢复当前规划上下文。
  - 运行 `session-catchup.py`，确认 Codex 当前未实现原生 session 解析，因此本次恢复主要依赖规划文件与 git 状态。
  - 核对当前 git 状态，确认分支仍为 `codex-layered-navigation-workflow`，工作树干净，最新提交已前进到 `f0ed15c feat: add standalone wiki service`。
  - 阅读最近 5 条提交与最新提交的文件列表，确认最近新增了一条独立用户 Wiki 交付线。
  - 运行 `npm test`，确认 `All 33 tests passed.`
  - 运行 `npm run check:wiki`，确认 `Wiki validation passed.`
  - 交叉读取 `README.md`、`STATUS.md` 与 `wiki/content/*.md` 样例页面，判断项目级说明是否已跟上当前功能。
- **关键结论：**
  - fallback / replay / skill work order 主线实现已经提交并通过测试，但“真实样本质量是否达标”仍未验证完。
  - 独立 Wiki 已经落地第一版，说明“最终使用说明”方向已启动，但还没有完全覆盖最新审阅路径。
  - `STATUS.md` 进度明显滞后，后续恢复上下文时不应单独依赖它。
- **下一步建议：**
  - 先从真实 `充电管理 / software_requirement` fallback 样本验证开始，确认 prompt-first 是否真的输出正确层级与可复用正文。
  - 之后补一轮真实浏览器走查，覆盖“工程 -> 模块 -> 生成页 -> 模块页 -> 任务详情页”以及新增 wiki / skill work order 入口。

## 会话：2026-04-17（充电管理 fallback 审计）

### 阶段：Fallback 技能工单质量验证与 Prompt 收敛
- **状态：** complete（完成一次基于已落盘数据与当前代码路径的审计，结论为“不满足预期”）
- **执行的操作：**
  - 读取 `data/rejections/76a2bc6a-b4c8-404a-9163-3c3196c42d0e.json`，确认本轮样本仍是 `充电管理 / software_requirement / CheryVCU-12147`。
  - 按时间检查 `data/replay-tasks/*.json` 与 `data/skill-work-orders/*.json`，确认最新 replay task 是 `574ebc77-423e-4367-8a8b-f8af4ee6ec51`，最新 work order 是 `17abdbb3-e7fb-4eae-9030-cf5732957ecf`。
  - 抽取 5 条已落盘 replay/work order 的关键字段，对比 `targetLayer / scopeDecision / afterContent / reviewReadiness`。
  - 读取 `src/services/llm-service.js`、`src/services/replay-task-service.js`、`src/services/skill-work-order-service.js` 与相关测试，核对当前 fallback 归一化和工单水合逻辑。
  - 用最新 replay task 的 `materialPack` 直接调用当前 `LlmService.generateReplayProposal(..., {})` 本地 fallback 路径，复核当前代码在同样输入下的实际输出。
- **关键结论：**
  - 最新 replay task 仍把建议落到 `docType/software_requirement`，没有达到预期中的 `module/charging_management`。
  - 当前 fallback 生成结果仍被识别为 `isParaphraseOfRejection = true`，`abstractionScore = 0.38`，`reviewReadiness = needs_human_refine`，说明正文还不是可直接沉淀的 reusable rule。
  - `SkillWorkOrderService` 在从 replay task 生成/修复 work order 时不会重新执行 replay quality guard，因此现有工单里的空白质量字段不能被视为“prompt-first 已通过验证”。
- **补充说明：**
  - 这次审计证明“最新已落盘样本”还不能作为阶段 9 通过的证据。
  - 下一步若要继续验证，应优先重跑新的真实样本，而不是继续阅读现有 work order 记录。

## 会话：2026-04-18（真实远端 replay 验证与工单落地）

### 阶段：Fallback 技能工单质量验证与 Prompt 收敛
- **状态：** in_progress（完成真实远端验证，已定位当前主阻塞到工单正文选择）
- **执行的操作：**

## 会话：2026-04-22

### 阶段：Hermes Agent 软件需求链路交接文档补齐
- **状态：** complete
- **执行的操作：**
  - 新增 [docs/superpowers/hermes-agent-generation-handover.md](/Users/guanzhengyang/Documents/software-doc-generator-prototype/docs/superpowers/hermes-agent-generation-handover.md)，集中记录当前 `software_requirement` 的 Hermes agent 生成模式。
  - 在 handoff 中明确了当前真实运行方式：默认 `HERMES_TRANSPORT=cli`，后端按 step 拉起本机 `hermes chat`，而不是依赖常驻 Hermes HTTP 服务。
  - 在 handoff 中记录了当前主协议：`anchors -> sourceAnchorIds -> reference_resolve -> sourceRefs`。
  - 在 handoff 中记录了 task skill bundle、token usage 读取方式、已解决问题、已知基线失败和“新模块冷启动切换到 Hermes 模式”的阅读入口。
- **建议后续线程优先阅读：**
  - `docs/superpowers/hermes-agent-generation-handover.md`
  - `progress.md`
  - `src/services/pipeline-service.js`
  - `src/services/hermes-agent-client.js`
  - `tests/run-tests.js`
  - 继续沿着 `充电管理 / software_requirement / CheryVCU-12147` 真实样本排查远端 replay 失败原因，确认最初问题是 prompt 过长。
  - 将 replay prompt 收敛为“原始生成 skill 文本 + rejectionContext + candidateSkillInventory + referenceAssets”，去掉重复的 `compiledPrompt / compiledSkillPack`。
  - 补强 replay system prompt、schema 和后处理归一化逻辑，让模型必须输出 machine enum 风格的 `action`、合法 `evidenceRefs` 与可用的 `targetSkillCode / targetLayer / targetProfileKey / targetKind`。
  - 生成一份基于真实样本的 `docs/replay-fallback-llm-prompt.md`，方便后续换环境继续看真实 prompt。
  - 用真实远端 profile 重跑该样本，确认远端已经会返回 `module / 充电管理 / validation_rule` 的新增提案。
  - 按真实远端返回结果模拟创建 replay task 与 skill work order，生成：
    - replay task `7aa27011-6f01-4890-8a04-7b8d242f7545`
    - work order `fee6a306-f5fb-4295-9d28-0b34a55238d4`
  - 使用真实浏览器打开 `127.0.0.1:3000/skill-management?view=work-orders&workOrderId=fee6a306-f5fb-4295-9d28-0b34a55238d4`，确认工单已成功渲染。
- **关键结论：**
  - 真实远端 replay 已能自主把这条建议下沉到 `module`，不再错误停留在 `docType`。
  - 当前技能工单页面里“修改后内容”显示的仍是 `afterContent`，也就是修正后的需求句子，而不是更抽象的 `newRuleDraft.content`。
  - 因此阶段 9 的后续重点应转为：新建 skill 的工单展示与应用是否要优先采用 `newRuleDraft.content`。
- **验证结果：**
  - `node tests/run-tests.js` -> `All 40 tests passed.`
  - 真实浏览器页面已验证能打开，并能看到：
    - 工单标题：`充电管理 / software_requirement / fallback 技能修改工单`
    - 状态：`待审阅`
    - 修改项：`1`
    - 当前展示正文：`VCU应对当前充电截止SOC值进行下电记忆；若ICM或TCP设置值更新，应在本次循环生效，并在下次下电时继续保存该值。`

## 会话：2026-04-19（跨机器续开发数据快照）

### 阶段：运行态调试现场保留
- **状态：** in_progress
- **执行的操作：**
  - 按用户要求，将本地 `data/rejections`、`data/replay-tasks` 以及对应 `data/skill-work-orders` 的调试现场纳入版本控制，便于切换到 Windows 机器后继续沿同一条真实样本调试。
  - 继续补充 `data/skills.sqlite`，把当前技能数据库状态一并带到新环境，避免新环境只拿到 skill 文件而缺失最新数据库状态。
  - 保留当前真实 replay / work order 样本：
  - replay task `7aa27011-6f01-4890-8a04-7b8d242f7545`
  - work order `fee6a306-f5fb-4295-9d28-0b34a55238d4`
  - 同步当前 rejection/group 状态与旧 replay task 删除结果，使新环境看到的现场与本机一致。

## 会话：2026-04-20（培训材料整理）

### 阶段：新人培训 slides 提纲输出
- **状态：** complete
- **执行的操作：**
  - 读取 `README.md`、`ARCHITECTURE.md`、独立 Wiki 页面、前端入口页与关键后端接口，按“新人培训”视角梳理系统定位、名词概念、主功能、业务流与审核闭环。
  - 新增两份可直接交给制 slides AI 的 Markdown 提纲，分别覆盖：
    - 培训一：从零认识系统并跑通主流程
    - 培训二：审核闭环、修正机制与高级能力
  - 根据用户追加要求，补充了一页关于 `Skill` 的介绍，并进一步收敛为“Skill 是团队经验沉淀为数字化资产、会随着使用持续迭代完善”的表达。
- **创建/修改的文件：**
  - `output/培训一_从零认识系统并跑通主流程_slides提纲.md`
  - `output/培训二_审核闭环修正机制与高级能力_slides提纲.md`
- **补充说明：**
  - `Skill` 的补充页提纲按用户要求仅在对话中给出，未写入文件。
  - 本次没有修改业务源码或测试文件，主要产出为培训材料整理与落盘。

## 会话：2026-04-20（仓库未提交修改盘点）

### 阶段：按 planning-with-files 整理当前工作树改动
- **状态：** complete
- **执行的操作：**
  - 运行 `git status --short`、`git diff --stat`、`git diff --name-only`，按主题盘点当前工作树未提交修改。
  - 交叉读取关键代码与页面文件，确认这批改动主要覆盖：
    - Replay / Fallback 主链收口
    - Replay Lab 新实验台
    - `layer × kind` 规则矩阵固化
    - 结构化驳回、反馈池、技能管理、Skill Refinement 交互补强
    - active skill / rule index / SQLite 数据刷新
    - Wiki、prompt handover 与 Windows Wiki 启停脚本补齐
    - 真实 rejection / replay task / project review 运行态快照保留
  - 将上述盘点结果同步回 `task_plan.md` 与 `findings.md`，避免后续只看旧规划文件时遗漏当前未提交工作面。
- **关键结论：**
  - 当前工作树不是单点修改，而是一轮围绕 fallback / replay 验证体系的系统性收口。
  - Replay 已切换到“人工指定 targetArea + targetLayerConstraint，模型只能在该层内处理”的约束模式。
  - 新增 Replay Lab 后，当前最适合的验证路径已经从“读旧 replay 记录”变成“用历史 task 做模板，在当前规则下重跑并直接验证”。
  - 当前还带着真实运行态调试数据与一个疑似临时文件，后续提交前需要再次判断哪些应保留、哪些应清理。
