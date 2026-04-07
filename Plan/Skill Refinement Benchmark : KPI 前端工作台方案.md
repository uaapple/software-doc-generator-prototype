# Skill Refinement / Benchmark / KPI 前端工作台方案

## Summary

新增一个独立于当前项目生成页的 `Skill Refinement` 工作台页面，用来承接“投喂优质范例 -> 自动入库 -> 基于 active skill 自动生成并对比打分 -> 产出可逐条审核的 skill 改进意见 -> 应用到 candidate skill -> 自动跑 benchmark -> 人工决定是否升级 active skill”的完整闭环。

默认交互约束如下：
- 单独页面，不挤进现有首页主流程
- 新上传的优质范例默认立即进入 benchmark 集
- 范例删除采用“停用归档”，不做硬删除
- 应用改进意见后只生成 candidate skill，不直接替换 active
- benchmark 报告是 candidate 升级 active 的唯一人工决策依据

## Key Changes

### 1. 前端信息架构
- 保留现有首页 `/` 不变，只在顶部增加跳转入口到 `/skill-refinement`。
- 新增独立页面：
  - `/skill-refinement`
- 页面采用单页工作台布局，包含 4 个区域：
  - `上传投喂区`
  - `范例库区`
  - `改进意见审核区`
  - `Benchmark 报告区`
- 页面默认展示当前 active skill 概览，说明当前基线 bundle、版本、最近一次评估结果。

### 2. 上传投喂与自动入库流程
- 新页面提供专用上传表单，字段固定：
  - `name`
  - `domain`
  - `subdomain`
  - `notes`
  - `systemPdf`
  - `modelPdf[]`
  - `generatedCode[]`
  - `goldenSourceFile`
- 上传成功后前端自动串行触发：
  1. 创建 benchmark case
  2. 自动标记为 benchmark 标准案例
  3. 以当前 active bundle 为基线启动 refinement run
- 上传完成后立即跳转到该次 run 的详情视图，不要求用户再额外点击“开始分析”。
- 上传区要明确显示本次 run 的阶段状态：
  - `案例入库`
  - `golden 结构化`
  - `生成结果打分`
  - `改进意见生成`
  - `candidate benchmark 验证`
  - `等待人工决策`

### 3. 范例库管理页面行为
- 范例库主列表展示：
  - 名称
  - 领域/子域
  - 创建时间
  - 是否在 benchmark 中启用
  - 最近一次 candidate 对比得分
  - 当前状态
- 支持操作：
  - 查看详情
  - 查看人工答案结构化结果
  - 查看“当前 active skill 生成结果 vs 人工答案”的对比分数
  - 归档停用
  - 重新启用
- 归档停用语义：
  - 默认从“启用案例”列表移除
  - 不再参与后续 benchmark
  - 保留历史 run、评分和审计记录
- 页面需要支持按领域、状态、是否启用、得分变化进行筛选。

### 4. 改进意见审核区
- 当前后端的 `proposal` 要从单个大对象升级为“可逐条审核”的 proposal 列表。
- 每条 proposal 至少包含：
  - `id`
  - `category`
  - `targetFile`
  - `title`
  - `proposedContent`
  - `reason`
  - `basedOnCaseIds`
  - `status`
- 前端按目标位置分组展示：
  - 写作规则
  - 抽取规则
  - 校验规则
  - 正例样例
  - 领域知识
- 每条 proposal 支持：
  - 接受
  - 拒绝
  - 编辑后接受
- 只有“已接受”的 proposal 会进入 candidate bundle 构建。
- 页面需同时显示“本次新增案例触发了哪些改进建议”，并可展开查看与 golden 范例的对应依据。

### 5. Benchmark 报告区
- proposal 被应用后，前端展示 candidate bundle 的 benchmark 验证报告，不允许直接一键设为 active。
- 报告页至少展示：
  - candidate vs active 总分
  - 发布门槛是否通过
  - 每个案例的总分对比
  - 分维度涨跌
  - Top improvements
  - Top regressions
- 案例级详情支持展开查看：
  - overall score
  - baseline score
  - section / coverage / logic / signal-reference / traceability / writing quality
  - hallucination penalty
  - missing critical item penalty
- 报告页底部提供两个最终操作：
  - `升级为 Active Skill`
  - `驳回这次更新`
- 只有当 benchmark 报告已经生成后，才显示这两个操作按钮。

### 6. 为页面补齐后端接口与数据结构
- 现有接口需要补足以下能力，才能支撑页面：
  - `GET /api/skill-refinement/cases`
    - 返回列表时带 `archived`、`lastEvaluationSummary`、`lastRunId`
  - `POST /api/skill-refinement/cases/:caseId/archive`
    - 停用归档案例
  - `POST /api/skill-refinement/cases/:caseId/restore`
    - 重新启用案例
  - `GET /api/skill-refinement/runs/:runId`
    - 返回完整 run 详情，包含：
      - `proposalItems[]`
      - `candidateBundle`
      - `evaluation`
      - `triggerCase`
      - `baselineBundle`
  - `POST /api/skill-refinement/runs/:runId/proposals/:proposalId/review`
    - 支持 `accepted / rejected / edited`
  - `POST /api/skill-refinement/runs/:runId/build-candidate`
    - 用已审核 proposal 重建 candidate 并重跑 benchmark
- refinement 服务内部要新增：
  - proposal item 拆分和状态管理
  - case 归档/恢复状态
  - run 阶段状态细分
  - case 最近一次评估摘要回写
- 首页现有 API 不需要改 UI，只增加一个跳转入口即可。

## Public APIs / UI Contracts

### 前端新增页面与资源
- `public/skill-refinement.html`
- `public/skill-refinement.js`
- `public/skill-refinement.css`
- 首页 `public/index.html` 增加导航入口，不改现有主流程结构

### run 详情返回结构
- `GET /api/skill-refinement/runs/:runId` 需保证前端一次拿全：
  - `run`
  - `triggerCase`
  - `baselineBundle`
  - `candidateBundle`
  - `proposalItems[]`
  - `evaluation`
  - `decisionHints`
- `proposalItems[]` 是这次页面实现的关键新增，不再只返回单个 `proposal` blob。

### case 列表返回结构
- `GET /api/skill-refinement/cases` 返回每条 case 的最小展示字段：
  - `id`
  - `name`
  - `domain`
  - `subdomain`
  - `certified`
  - `archived`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `lastEvaluationSummary`
  - `lastRunId`

## Test Plan

- 页面入口：
  - 首页能跳转到 `/skill-refinement`
  - 页面刷新后可正确加载 active bundle 与范例库
- 上传流程：
  - 上传一套完整案例后，自动创建 case、自动启用 benchmark、自动触发 run
  - 上传过程中阶段状态正确刷新
- 范例库：
  - 新案例自动出现在列表中
  - 归档后从启用列表消失，恢复后重新参与 benchmark
  - 归档不丢失历史详情和 run 记录
- proposal 审核：
  - proposal 能按条展示、接受、拒绝、编辑
  - 只有 accepted proposal 进入 candidate 构建
- benchmark 报告：
  - 报告页能显示总分、分项分、案例对比、发布门槛结果
  - 报告未生成前不显示“升级为 active”
- 发布控制：
  - 点击“升级为 Active Skill”后，active bundle 更新
  - 点击“驳回”后 candidate 不生效，run 状态更新为 rejected

## Assumptions

- 首版前端重点是工作流闭环，不做复杂权限系统。
- 归档案例默认不参与 benchmark，但历史 run 和评分继续保留。
- 新上传的“优质范例”默认立即作为 benchmark 标准案例，无需额外确认。
- candidate bundle 只有在 benchmark 报告生成后才允许人工决定是否升级为 active。
- 若现有后端 proposal 仍是单体对象，本次页面实现会同时要求后端补齐 proposal item 化能力，否则无法满足“逐条审核”需求。
