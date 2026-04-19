# 发现与决策

## 驳回池闭环实现后的新增发现（2026-04-10）
- 现在 requirement review 已不只是写入 `accepted/revised/rejected` 状态；`rejected` 会强制补充结构化原因，并落一条 `RejectionRecord`。
- 反馈池、ReplayTask、proposal item、candidate bundle 这条链路已经连通，因此“驳回 -> 回投 -> 审核 -> 应用”在系统层是可执行的。
- Skill 的“规则级抽象”已经在后端建立起来：系统内部知道每条 rule，也能按条应用 proposal item。
- 但现有 active skill markdown 还没有正式迁移为显式编号的规则文档，所以当前状态是“系统知道每条 rule”，而不是“人看到的 skill 文件已经天然按条组织好”。
- 这意味着下一步的重点不再只是补接口，而是把 `skills/active/*.md` 真正升级为规则化文档，并让 `ruleId` 成为稳定的维护锚点。
- 双轨方案仍然成立：短期内以 `SkillRule` 注册表作为系统真源，markdown 逐步编号化；但如果不尽快完成 markdown 侧迁移，后续人工维护体验会长期停留在过渡态。
- replay proposal 已接入现有 LLM Profile，因此无需再单独发明一套“回投模型配置”；直接复用现有模型服务选择即可。
- 当前 replay proposal 的 prompt 仍偏通用，后续需要更明确地把目标 rule、相关 evidence、bad examples、domain knowledge 一并送入，以提高 proposal 的针对性。
- 当前运行态里 active bundle 仍是 `bundle-base`，尚未看到新的 candidate bundle 被正式批准为 active；所以现阶段生成需求依旧使用旧形态的 active skill。

## 模块化工作台与导航分层新增发现（2026-04-14）
- 用户对“把工程、模块、资产、任务、已采纳结果全部堆在首页”的方案明确不满意，信息架构必须改成显式分层。
- 首页的正确职责不是工作台总览，而是“工程列表入口”；工程页的职责是“模块入口”；功能模块页才是主工作台。
- 旧的“软件需求生成 / 详细设计生成”页面不能直接废弃，也不能只保留跳首页；用户仍然需要它们作为真实生成工具页。
- 用户明确要求“生成页就只是做生成页”，所以生成页不应再承担主审阅入口。
- 审阅最适合落在“单次任务详情页”，这样模块主页不会无限膨胀，也不会破坏旧生成页的心智模型。
- 模块主页最合适的内容组合是：
  - 已采纳结果全文列表
  - 历史生成任务列表
  - 进入软件需求生成 / 详细设计生成的入口
- 历史任务列表需要默认展示执行时间、文档类型、状态、结果数、模型信息和输入摘要，用户再点击进入单任务详情看完整内容。
- 已采纳结果在模块主页不应只显示摘要；用户希望直接看到全文内容。
- 从旧生成页发起任务后，最合理的回跳位置是模块主页，而不是停留在生成页或直接进任务详情页。
- 旧生成页接回后，最重要的不是“重做界面”，而是“按 `projectId + moduleId` 上下文正确过滤与写回模块级任务”。
- 当前后端已经具备模块级 `generationTasks`、`acceptedItems`、任务详情读取和采纳写回能力，说明主要工作在前端信息架构和页面职责重划，而不是重新设计后端模型。
- 当前迁移演示工程已经可以作为新导航结构下的真实联调样本，不需要再额外造一份假数据。

## 当前换环境续开发需要记住的事实（2026-04-14）
- 最新开发分支：`codex-layered-navigation-workflow`
- 最新提交：`8bfcd66 Implement layered project module task navigation`
- 本轮关键新增页面：
  - `public/project-create.html`
  - `public/project-detail.html`
  - `public/module-create.html`
  - `public/module-detail.html`
  - `public/task-detail.html`
- 本轮关键新增脚本：
  - `public/hierarchy.js`
  - `public/generator.js`
  - `scripts/migrate-legacy-demo.mjs`
- 当前旧生成页已被接回为真实页面，并依赖 query 参数中的 `projectId` 与 `moduleId`
- 自动化测试当前通过：`npm test` -> `All 10 tests passed.`

## 软件需求文档类型技能初始化新增发现（2026-04-16）
- 用户已明确收窄范围：当前只需要填充 `software_requirement` 文档类型层，不需要生成 `detail_design` 或 `hil_test_case` 两层的技能内容。
- `skills/active/profiles/doc-types/software_requirement/skill-items.json` 当前是空 registry，manifest 已注册该 profile，但尚未物化 `requirement_writing.md`、`requirement_validation.md`、`domain-knowledge.json`。
- `input/20260404/software-requirement-writing-rules-vcu.md` 提供了可直接抽象为文档类型层规则的写法基准：
  - 多级章节与对象对称拆分
  - “当…时…否则…”与“优先级顺序为…”句式
  - 阈值/边界/状态值显式化
  - 内部引用与外部系统联动
  - 可测试性与安全边界显式说明
- `input/20260404/software-design-requirements-example-esc-torque-intervention.md` 虽然标题是软件设计需求示例，但其中呈现的条目形态、内部引用、优先级、阈值与分支写法，依然可以作为“软件需求条目长相”的样本来源。
- `input/20260411/AI case_ITK_20260411.docx` 给出了当前人工整理的目标范围：扭矩干预已完成，新增的软件需求相关主题包括高低系统管理、高压安全管理、充电管理、高压能量管理、低压能量管理、V2L、V2IN 以及模板。
- 当前工程里与本轮最相关的模块 profile 里，已经积累了软件需求风格样例：
  - `充电管理`：堵转加热模式、充电截止SOC、充电截止SOC记忆
  - `高低系统管理`：本地KL15上高压请求激活判断、本地KL15上高压建立流程
  - `高压能量管理`：可用放电功率、单体保护、可用充电功率、峰值放电功率
- 现有 generic 层已经沉淀了不少“软件需求/设计需求通用写法”，但其中有一部分内容明显偏向扭矩干预与充电管理具体案例；`software_requirement` 文档类型层更适合补一版“面向软件需求文档”的通用规则，再让 module 层保留具体主题偏好。

## Fallback 技能工单质量收敛新增发现（2026-04-17）
- 用户已经明确给出一条原则：不要通过后端针对单个案例增加“如果是 `CheryVCU-12147` 就强制判成 module 并写入推荐正文”这类硬性条件约束；更希望通过优化 prompt，让 LLM 自主输出正确层级和规则内容。
- 因此当前 replay/work order 链路的正确收敛方向是：
  - prompt 负责层级判断与规则抽象
  - 后端只保留轻量的质量信号与审阅辅助信息
  - 人工通过工单确认是否应用，而不是让后端把单案例结论直接写死
- 当前代码已经具备把以下元数据从 replay proposal 传到技能工单详情页的能力：
  - `scopeDecision`
  - `scopeReason`
  - `scopeConfidence`
  - `abstractionScore`
  - `isParaphraseOfRejection`
  - `reviewReadiness`
  - `ruleIntent`
  - `recommendedSkillText`
- 这些元数据更适合作为“审阅辅助信号”，而不是“强制覆盖输出”的依据。
- 目前最值得验证的不是“后端能不能把这条工单修正成对的”，而是“真实 fallback 重跑后，LLM 会不会自己把这类强模块特征的建议落到 `module`，并输出可以复用的原子技能正文”。
- 当前仍有一个实现层风险需要后续清理：`src/services/llm-service.js` 里还残留旧版 replay quality 逻辑和不可达的旧分支。虽然现在已切到 prompt-first 路线，但这些遗留代码会增加维护噪音，容易让后续接手的人误以为系统仍在走 case-specific backend override。
- 对这条链路的下一步验证，至少要覆盖两类样本：
  - 模块特定型案例：应更倾向 `module`
  - 文档类型通用型案例：应仍然保留在 `docType/software_requirement`
- 如果新 replay 输出仍然只是把驳回说明换个语气重写，那优先应该继续优化 prompt、schema 和 few-shot，而不是再往后端堆规则。

## 当前进度审计新增发现（2026-04-17）
- 规划文件里的“最新提交”已经落后于仓库实际状态：当前分支仍是 `codex-layered-navigation-workflow`，但最新提交已经前进到 `f0ed15c feat: add standalone wiki service`。
- 工作树当前干净，说明最近这轮 wiki / 文档能力已经提交落盘，不是停留在未提交草稿状态。
- `npm test` 当前已通过 33 个测试，`npm run check:wiki` 也已通过，说明代码主线和独立 Wiki 主线都处于健康状态。
- 仓库现在不是单一主线：至少同时存在两条活跃工作流：
  - 主线 1：阶段 9 的 fallback / replay / skill work order 质量验证与 prompt 收敛
  - 主线 2：独立用户 Wiki 与使用说明沉淀
- 新增的独立 Wiki 已经覆盖快速开始、工程/模块工作区、反馈池/Replay、技能管理等首批页面，因此“最终使用说明与交付说明”这件事已经开始落地，不再是纯待办。
- `STATUS.md` 仍停留在更早的原型阶段，和当前真实进度不一致；后续恢复上下文时，应优先信任 `task_plan.md`、`progress.md`、`findings.md` 与 `git log`，不要单独依赖 `STATUS.md`。
- 尽管自动化测试健康，阶段 6 中要求的真实浏览器全链路走查依然没有被替代；它仍然是后续需要补上的人工验证项。
- 结合已做决策与当前健康度，下一步最该优先做的不是继续写功能，而是重跑真实 `充电管理 / software_requirement` fallback 样本，验证 prompt-first 路线是否真的把建议落到正确层级并输出可复用规则正文。

## 充电管理最新 fallback 审计新增发现（2026-04-17）
- 当前“最新一次已落盘 replay task”是 `data/replay-tasks/574ebc77-423e-4367-8a8b-f8af4ee6ec51.json`（`createdAt = 2026-04-17T02:42:36.542Z`，上海时间 2026-04-17 10:42:36），对应同一条 rejection `CheryVCU-12147`。
- 这条最新 replay task 的 proposal item 仍然把建议落到 `docType/software_requirement`，而不是预期中的 `module/charging_management`。
- proposal 正文仍然是“建议补充以下约束：请按人工范例对齐 CheryVCU-12147 ...”这类 rejection 改写，直接带着 requirement code 与具体案例细节，没有抽象成可复用的模块级规则正文。
- 用当前代码重新对该 replay task 的 `materialPack` 执行本地 fallback 生成后，结果仍是：
  - `scopeDecision = docType`
  - `abstractionScore = 0.38`
  - `isParaphraseOfRejection = true`
  - `reviewReadiness = needs_human_refine`
  说明“当前 fallback 逻辑本身”也还没有达到预期，不只是旧记录没迁移。
- 代码层原因很明确：当前 fallback 归一化走的是 `inferReplayScopeDecisionV2/applyReplayQualityGuardsV2`，它会优先沿用模型或默认的 `targetLayer`，但不再包含旧版 `looksLikeChargingSocMemoryBoundaryCase` 那套充电管理记忆边界特征判定，因此 validation 类新建项会自然回落到 `docType`。
- 另外，技能工单从 replay task 水合时，`SkillWorkOrderService.createFromReplayTask()` 只是把 replay proposal item 直接规范化为 work order item，并不会重新跑一次 replay quality guard；因此现有 work order 里 `scopeDecision/recommendedSkillText/reviewReadiness` 等字段仍可能为空，不能把“最新工单详情”直接当成 prompt-first 已生效的证据。
- 结论：截至本次审计，充电管理最新一次 fallback 仍不满足阶段 9 的预期，需要继续依赖真实重跑样本验证 prompt 输出，不能把当前已落盘样本视为通过。

## 真实远端 replay 与浏览器工单验证新增发现（2026-04-18）
- 真实远端 `充电管理 / software_requirement / CheryVCU-12147` replay 在精简 prompt、补强 schema 和归一化逻辑后，已经能返回可执行 proposal，而不再是空 `items`。
- 这条真实远端结果会给出 `create_new + add_skill_item`，层级为 `module / 充电管理 / validation_rule`，说明 prompt-first 路线已经能把该样本自主下沉到模块层。
- 真实返回里的 `evidenceRefs` 已经能回填为 rejection record id，说明模型现在可以输出后端可消费的证据引用，而不是只吐 requirement code。
- 真实返回同时包含两份“正文”：
  - `afterContent`：更像“修正后的需求句子”
  - `newRuleDraft.content`：更像真正可复用的 skill 规则正文
- 浏览器中打开这张由真实结果模拟生成的技能工单后，可以确认页面当前展示在“修改后内容”里的仍是 `afterContent`，不是 `newRuleDraft.content`。
- 这意味着阶段 9 的主阻塞已经从“LLM 会不会给出 module 级提案”转移为“工单展示/应用链路是否该优先使用抽象后的规则正文”。
- 真实浏览器中当前可见的工单状态为：
  - 标题：`充电管理 / software_requirement / fallback 技能修改工单`
  - 状态：`待审阅`
  - 来源任务：`7aa27011-6f01-4890-8a04-7b8d242f7545`
  - 修改项数：`1`
  - 当前展示正文：`VCU应对当前充电截止SOC值进行下电记忆；若ICM或TCP设置值更新，应在本次循环生效，并在下次下电时继续保存该值。`

## 仓库未提交修改盘点新增发现（2026-04-20）
- 当前工作树的未提交修改不是零散小修，而是围绕 7 个主题成组推进：
  - Replay / Fallback 主链继续收口
  - 新增 Replay Lab 实验台
  - 固化 `layer × kind` 规则矩阵并在前后端共用
  - 工作台交互补强
  - Skill 资产与规则数据重排
  - Wiki / prompt 文档 / Windows 脚本补齐
  - 真实运行态数据快照保留
- `src/services/replay-task-service.js`、`src/services/llm-service.js`、`src/services/rejection-service.js`、`src/services/project-service.js` 这组改动共同表明：Replay 已从“模型自由判断层级”切换为“人工先给硬约束层级，再让模型在该层内 modify/create”。
- `targetArea` 和 `targetLayerConstraint` 已经不是 UI 上的附属字段，而是驱动 replay candidate inventory、proposal kind 合法性和工单应用校验的硬约束输入。
- 新增的 `public/skill-kind-matrix.js` 实际上把“layer 允许哪些 kind、targetArea 允许哪些 kind”抽成了统一真源；`feedback-pool`、`skill-management`、`skill-refinement`、Replay 后端都开始依赖它。
- Replay 的候选池已从宽泛的 `candidateSkillInventory` 收敛为同层 `layerSkillInventory`，这意味着当前验证重点更偏“同层命中 existing skill 的能力”而不是“能否随便创建一条新 skill”。
- Replay Lab 已经成为一条新的显式工作流：给定历史 replay task，重建当前 material pack、查看 prompt 预览、诊断 rule index、审阅最新 work order，并直接发起一次软件需求生成验证。
- `public/task-detail.html` 与 `public/hierarchy.js` 的结构化驳回交互已经更新到和后端约束一致：驳回时必须手动选择 `targetArea` 与 `targetLayerConstraint`，并加入了提交流程状态控制。
- `data/skill-rules/bundle-base.json`、`data/skills.sqlite`、`skills/active/profiles/generic/skill-items.json`、`skills/active/requirement_writing.md`、`skills/active/requirement_extraction.md` 的大幅改动说明：当前不仅在改 replay 链路，也在同步刷新 active skill / rule index / sqlite 三套技能表示。
- generic skill 的内容不只是修格式，还在做内容层重排：将原来碎片化的骨架、抽取主题和领域条目合并为更完整的可复用条目，并补齐 `structuredPayload` 一致性。
- Wiki 与 handover 文档已经跟上新模型，明确引入了：
  - `targetArea`
  - `targetLayerConstraint`
  - `layer × kind`
  - `layerSkillInventory`
  - “Replay 只能在约束层内 modify 或 create”的原则
- Windows 平台的 Wiki 启停脚本现在已经补齐，说明独立 Wiki 已经不只面向类 Unix 环境。
- 运行态数据也被显式保留进仓库：当前存在新的 rejection record、group、replay task 和 project review 状态快照，说明团队希望跨机器继续沿真实 `充电管理` 样本调试，而不是每次从空白状态重建现场。
- 当前存在一个明显的临时残留文件：`skills/active/skill-manifest.json.tmp-3696-1776614708939-50e5911f-ec20-491a-88fd-43502de12381`，后续提交前应确认是否需要清理。
