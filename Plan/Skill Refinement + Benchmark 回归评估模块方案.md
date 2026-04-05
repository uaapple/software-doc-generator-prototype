# Skill Refinement + Benchmark 回归评估模块方案

## Summary

新增一个独立于现有生成主链路的后端模块，用来持续升级“软件需求编写 skill”。该模块的职责不是直接生成业务需求，而是把你持续投喂的“系统需求 + 模型文件 + 人工优质软件需求答案”沉淀为案例库，基于这些案例提炼候选规则，生成候选 skill 版本，并自动对历史案例库做回归评估，输出量化 KPI，供人工判断本次 skill 更新是优化还是劣化。

首版默认采用以下工作方式：
- 通过单独入口上传一整套标准案例：系统需求、模型 PDF/C 文件、人工优质软件需求
- 人工优质软件需求先结构化为 `golden` 标准答案
- 系统基于新案例和历史已认证案例生成候选 skill 版本，不直接覆盖正式 skill
- 候选 skill 先跑全量 benchmark 回归，再产出评分报告
- 只有人工确认通过后，候选 skill 才升级为正式默认版本

## Key Changes

### 1. 建立案例库与标准答案库
- 新增 `benchmark case` 概念，每个案例是一套完整输入包，而不是零散文件。
- 每个案例永久保存以下内容：
  - 原始输入物：系统需求 PDF、模型 PDF、生成 C 文件
  - 原始人工答案文件
  - 结构化 `golden` 标准答案
  - 案例标签：领域、子功能、状态、备注、创建人、认证状态
- 案例库分两层：
  - `allCases`：所有投喂过的案例都保存
  - `certifiedCases`：只有确认作为标准答案的案例进入 benchmark 回归集
- 首版按“全局主 skill + 领域附录”组织：共性规则留在主 skill，扭矩干预类规则进入领域附录和 few-shot 样例库。

### 2. 建立 Skill 版本化与候选版本机制
- 把当前 `skills/` 从“静态文件集合”升级为“可版本化 skill bundle”。
- 每个 `skill bundle` 包含：
  - 主写作规则
  - 抽取规则
  - 校验规则
  - 正例样例库
  - 反例样例库
  - 领域附录
  - 元数据：版本号、创建来源、基线版本、状态
- 状态分为：
  - `active`
  - `candidate`
  - `archived`
- 新投喂案例不会直接改正式 skill，只会生成一个 `candidate skill bundle`。
- `candidate` 必须附带：
  - 本次新增/修改规则
  - 变更原因
  - 来源案例
  - 回归评估报告摘要

### 3. 建立自动化 refinement 流水线
- 新增独立流水线，阶段固定为：
  1. `case_ingested`：接收一套案例输入
  2. `golden_structured`：把人工优质答案结构化
  3. `example_aligned`：把标准答案条目和输入证据做对齐
  4. `rules_refined`：提炼候选规则和 few-shot 示例
  5. `candidate_built`：生成候选 skill bundle
  6. `benchmark_replayed`：用候选 skill 重跑历史认证案例
  7. `evaluation_scored`：生成 KPI 报告
  8. `approved|rejected`：人工决策是否生效
- LLM 子任务固定拆分为三步：
  - `golden structuring`
  - `alignment`
  - `rule refinement / skill proposal`
- 回归生成阶段沿用现有需求生成链路，但运行时可指定 skill bundle 版本。

### 4. 建立 benchmark 回归评估与 KPI
- 评估对象采用结构化 `golden` 标准答案，不以原始 Word/PDF 文本为主评估依据。
- 首版 KPI 采用“规则命中 + 结构相似”为主，不依赖纯 LLM 主观评分。
- 默认评分维度和权重：
  - `section_structure_score` 20分：章节层级、父子结构、前后轴对称组织
  - `requirement_coverage_score` 20分：golden 中应有的需求是否被生成
  - `logic_branch_score` 20分：条件、否则、优先级、分支逻辑是否覆盖
  - `signal_reference_score` 15分：关键信号、变量、阈值、模式名是否命中
  - `traceability_score` 15分：来源引用、内部引用、关联关系是否完整
  - `writing_quality_score` 10分：是否符合规范，是否出现模糊措辞、臆造、结构错乱
- 额外输出两个惩罚项：
  - `hallucination_penalty`
  - `missing_critical_item_penalty`
- 总分计算：
  - `overall_score = weighted_sum - penalties`
  - 归一化到 `0-100`
- 发布门槛默认：
  - 新候选 skill 的 `overall_score_avg` 不低于当前 active bundle
  - `critical_case_fail_count = 0`
  - 任一认证案例的 `traceability_score` 不得下降到阈值以下
- 评估报告同时输出：
  - 候选版 vs 基线版总分对比
  - 每个案例分数对比
  - 每个维度涨跌
  - Top 改善项
  - Top 回归项

### 5. 与现有生成系统的集成方式
- 不改前端展示作为首版目标。
- 现有生成服务新增“按 skill bundle 版本运行”的能力，供 benchmark 回放使用。
- 现有 `skills/` 继续作为 active bundle 的落盘载体，但不再直接被人手工覆盖；正式发布时由 bundle 激活动作同步到运行目录。
- 当前 `input/` 目录中的样例只作为首批 seed cases；正式模块使用 `data/skill-refinement/` 作为运行存储。

## Public APIs / Data Interfaces

### 1. 新增核心实体
- `BenchmarkCase`
  - `id`
  - `name`
  - `domain`
  - `subdomain`
  - `status`
  - `certified`
  - `inputFiles`
  - `goldenSourceFile`
  - `goldenStructured`
  - `notes`
  - `createdAt`
  - `updatedAt`
- `SkillBundle`
  - `id`
  - `version`
  - `baseBundleId`
  - `status`
  - `files`
  - `changeSummary`
  - `createdFromCaseIds`
  - `evaluationSummary`
- `RefinementRun`
  - `id`
  - `triggerCaseId`
  - `baseBundleId`
  - `candidateBundleId`
  - `status`
  - `proposal`
  - `evaluationRunId`
- `EvaluationRun`
  - `id`
  - `bundleId`
  - `baselineBundleId`
  - `caseIds`
  - `caseResults`
  - `aggregateScores`
  - `decisionHints`
- `CaseEvaluationResult`
  - `caseId`
  - `overallScore`
  - `dimensionScores`
  - `penalties`
  - `regressions`
  - `improvements`

### 2. 新增接口
- `POST /api/skill-refinement/cases`
  - 创建案例并上传输入物与人工答案
- `GET /api/skill-refinement/cases/:caseId`
  - 查看案例详情、golden 结构和认证状态
- `POST /api/skill-refinement/cases/:caseId/certify`
  - 将案例标记为 benchmark 标准案例
- `POST /api/skill-refinement/runs`
  - 以某个案例为触发器，生成候选 skill 并跑回归
- `GET /api/skill-refinement/runs/:runId`
  - 查看 refinement 过程、proposal 和评估结果
- `POST /api/skill-refinement/runs/:runId/approve`
  - 审核通过后将 candidate bundle 激活
- `POST /api/skill-refinement/runs/:runId/reject`
  - 驳回候选版本
- `GET /api/skill-refinement/bundles`
  - 查看 active/candidate/archived skill 版本
- `POST /api/projects/:projectId/generate`
  - 新增可选参数 `skillBundleId`，用于指定生成时使用哪个版本

### 3. 存储布局默认值
- `data/skill-refinement/cases/`
- `data/skill-refinement/bundles/`
- `data/skill-refinement/runs/`
- `data/skill-refinement/evaluations/`
- `data/skill-refinement/audit/`
- `skills/active/`
  - 当前正式生效 skill
- `skills/bundles/<bundleId>/`
  - 版本化 skill 内容快照

## Test Plan

- 案例入库：
  - 能上传一套系统需求、模型文件、人工优质软件需求
  - 能生成对应 `goldenStructured`
  - 案例被认证后进入 benchmark 集
- candidate 生成：
  - 基于新增案例能生成候选规则、few-shot 样例和 candidate bundle
  - candidate 不会覆盖 active bundle
- benchmark 回放：
  - 能对所有认证案例按 candidate bundle 重跑生成
  - 每个案例都能产出结构化生成结果和评分结果
- KPI 计算：
  - 维度分、总分、惩罚项、基线对比均能落盘
  - 有回归时能定位到具体案例和维度
- 发布控制：
  - 未审核前 candidate 不生效
  - 审核通过后 active bundle 正确切换
  - 审核驳回后保留 run、candidate 和报告，不影响线上默认 skill
- 回归安全性：
  - 单个案例结构化失败不会污染已有 benchmark
  - 评分失败时 run 标记失败，不自动发布
  - 新案例不会改变历史 golden

## Assumptions

- 首版不做前端页面，全部通过后端接口和本地数据落盘驱动。
- 标准答案以结构化 `golden` 为主，原始人工文档只做审计和复核依据。
- 首版评估优先覆盖扭矩干预领域，后续通过案例标签扩展到更多 VCU 子域。
- 首版不做自动发布，所有 skill 更新都必须经过人工审批。
- 首版默认使用规则评分为主，不将 LLM 打分作为发布门槛；若后续需要，可增加辅助语义分但不替代主评分。
