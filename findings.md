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
