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
