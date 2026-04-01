# Skill Refinement 子功能详细设计

## 1. 背景与目标

当前项目的核心竞争力不只是“能生成软件开发需求”，而是“能持续逼近你们团队认可的软件开发需求写法”。  
因此，项目中需要增加一个独立的子功能，用于从历史优秀样例中反向提炼规则，持续优化现有 skill。

该子功能命名为 `Skill Refinement`。

它的目标不是直接生成最终软件开发需求，而是：

- 从历史输入与人工高质量输出中提炼规则
- 生成对 skill 的更新建议
- 在人工确认后把建议写回 skill 文件

## 2. 功能定位

`Skill Refinement` 是主生成流程之外的旁路能力，不参与每次普通需求生成任务。

### 主生成流程负责

- 接收系统需求 PDF、模型 PDF、C 文件
- 抽取证据
- 调用 LLM 生成软件开发需求草稿
- 做规则校验
- 支持人工审核

### Skill Refinement 负责

- 接收一套历史原始输入物
- 接收一份人工高质量软件开发需求样例
- 建立输入与人工输出之间的对应关系
- 提炼候选规则、正例、反例、校验逻辑
- 形成 skill 更新建议
- 人工确认后落盘到 `skills/` 目录

## 3. 业务边界

### 第一版明确包含

- 上传样例输入物
- 上传人工高质量软件开发需求文档
- 自动生成规则提炼结果
- 输出 skill 更新建议
- 人工接受/拒绝/编辑建议
- 确认后更新 skill 文件

### 第一版明确不包含

- 自动无审核地覆盖现有 skill
- 从单个样例直接推导为绝对规则
- 自动训练模型或微调模型
- 自动替代人工做规范确认

## 4. 输入输出定义

## 4.1 输入

每个 `Skill Refinement Task` 需要支持以下输入：

- 系统需求 PDF
- 模型 PDF
- 生成 C 文件
- 人工编写的软件开发需求样例文档
- 可选文本备注：
  - 该样例为什么好
  - 哪些规则最值得保留
  - 哪些写法必须继承

### 关于样例文档格式

第一版建议优先支持：

- `.md`
- `.txt`
- `.docx`
- `.pdf`

若实现成本有限，可先做：

- 第一版主支持 `.md` / `.txt`
- `.pdf` 通过现有抽取链路处理
- `.docx` 作为后续增强项

## 4.2 输出

第一版输出 4 类结果：

### 1. 样例对齐结果

用于说明人工需求条目与原始输入证据之间的关系。

### 2. 候选规则

包括：

- 写作规则
- 粒度规则
- 异常处理规则
- 追溯规则
- 校验规则

### 3. 候选正反例

包括：

- 建议加入 `good_examples.md` 的正例
- 建议加入 `bad_examples.md` 的反例

### 4. Skill 更新建议

明确告诉系统要更新哪些文件、追加什么内容、依据是什么。

## 5. 页面设计

建议新增一个独立页面：

- 路由：`/skill-refinement`

页面建议分为 5 个区域。

## 5.1 任务创建区

字段：

- `taskName`
- `description`
- `systemPdf`
- `modelPdf[]`
- `generatedCode[]`
- `referenceRequirementFile`
- `analystNotes`

按钮：

- `创建分析任务`

## 5.2 样例概览区

展示：

- 输入文件数量
- 样例文档名称
- 当前任务状态
- 已提炼规则数量
- 已生成 proposal 数量

## 5.3 规则提炼结果区

分组展示：

- 写作规则
- 校验规则
- 追溯规则
- 粒度规则

每条规则需要显示：

- 标题
- 规则内容
- 来源样例数
- 置信度
- 状态

操作：

- 接受
- 拒绝
- 编辑后接受

## 5.4 样例对齐区

展示每条人工需求条目与输入证据的映射：

- 人工需求文本
- 对应的来源文件
- 页码/位置
- 证据片段
- 提炼标签

## 5.5 Skill 更新建议区

按目标文件展示 proposal：

- `skills/requirement_extraction.md`
- `skills/requirement_writing.md`
- `skills/requirement_validation.md`
- `skills/examples/good_examples.md`
- `skills/examples/bad_examples.md`

每项 proposal 展示：

- 目标文件
- 更新类型
- 建议内容
- 对应规则来源
- 当前状态

操作：

- 接受
- 拒绝
- 编辑
- 一键应用已接受建议

## 6. 后端处理流程

建议拆为 6 个阶段。

## 6.1 阶段 1：任务初始化

输入上传完成后创建 `SkillRefinementTask`。

状态：

- `draft`
- `files_uploaded`

处理内容：

- 保存文件元数据
- 生成任务记录

## 6.2 阶段 2：原始输入抽取

复用主流程已有抽取逻辑：

- PDF 文本抽取
- C 文件规则抽取

样例需求文档也需要进入统一抽取流程。

状态：

- `extracting`
- `extracted`

输出：

- 输入物证据集合
- 样例需求文本块集合

## 6.3 阶段 3：人工样例结构化

将人工软件开发需求样例拆成结构化条目。

建议输出字段：

- `requirementId`
- `title`
- `requirementText`
- `type`
- `section`
- `rawSourceLocation`

状态：

- `structuring_reference`
- `reference_structured`

## 6.4 阶段 4：样例对齐

对每条人工需求条目，从原始输入证据中找到最可能的来源。

输出：

- 需求条目与证据的一对多映射
- 每条映射的置信度
- 对齐理由

状态：

- `aligning`
- `aligned`

## 6.5 阶段 5：规则提炼

基于“输入证据 -> 人工高质量输出”的对应关系，总结规律。

输出候选规则时要至少覆盖：

- 常用句式
- 条件表达方式
- 异常处理写法
- 粒度控制方式
- 追溯字段约束
- 不推荐写法

状态：

- `refining_rules`
- `rules_generated`

## 6.6 阶段 6：生成 proposal 并应用

把候选规则映射成 skill 更新建议。

状态：

- `proposal_generated`
- `proposal_reviewed`
- `applied`

应用时：

- 只应用人工确认通过的 proposal
- 写入前备份原文件
- 写入后记录审计日志

## 7. 数据结构设计

## 7.1 SkillRefinementTask

```json
{
  "id": "string",
  "projectId": "string",
  "taskName": "string",
  "description": "string",
  "status": "draft|files_uploaded|extracting|extracted|structuring_reference|reference_structured|aligning|aligned|refining_rules|rules_generated|proposal_generated|proposal_reviewed|applied|failed",
  "inputFiles": [],
  "referenceRequirementFile": {},
  "analystNotes": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

## 7.2 ReferenceRequirementItem

```json
{
  "id": "string",
  "taskId": "string",
  "requirementId": "string",
  "title": "string",
  "requirementText": "string",
  "type": "string",
  "section": "string",
  "rawSourceLocation": "string"
}
```

## 7.3 AlignedRequirementExample

```json
{
  "id": "string",
  "taskId": "string",
  "referenceRequirementItemId": "string",
  "sourceEvidenceRefs": [],
  "alignmentRationale": "string",
  "confidence": 0.0
}
```

## 7.4 CandidateRule

```json
{
  "id": "string",
  "taskId": "string",
  "category": "writing|validation|traceability|granularity|anti_pattern",
  "title": "string",
  "ruleText": "string",
  "evidenceExampleIds": [],
  "confidence": 0.0,
  "status": "pending|accepted|rejected|edited"
}
```

## 7.5 SkillUpdateProposal

```json
{
  "id": "string",
  "taskId": "string",
  "targetFile": "string",
  "changeType": "append_rule|append_good_example|append_bad_example|revise_section",
  "proposedContent": "string",
  "basedOnRuleIds": [],
  "status": "pending|accepted|rejected|edited|applied"
}
```

## 8. 接口设计

以下接口建议新增到后端。

## 8.1 创建任务

- `POST /api/skill-refinement/tasks`

请求：

- 基础信息

响应：

- 新任务对象

## 8.2 上传任务文件

- `POST /api/skill-refinement/tasks/:taskId/files`

支持字段：

- `systemPdf`
- `modelPdf`
- `generatedCode`
- `referenceRequirementFile`

## 8.3 获取任务详情

- `GET /api/skill-refinement/tasks/:taskId`

返回：

- task
- structured reference items
- aligned examples
- candidate rules
- proposals

## 8.4 启动分析

- `POST /api/skill-refinement/tasks/:taskId/analyze`

职责：

- 执行抽取
- 执行结构化
- 执行对齐
- 执行规则提炼
- 生成 proposal

## 8.5 更新候选规则状态

- `POST /api/skill-refinement/tasks/:taskId/rules/:ruleId/review`

请求：

- `status`
- `editedRuleText`

## 8.6 更新 proposal 状态

- `POST /api/skill-refinement/tasks/:taskId/proposals/:proposalId/review`

请求：

- `status`
- `editedContent`

## 8.7 应用 proposal

- `POST /api/skill-refinement/tasks/:taskId/apply`

职责：

- 将已接受 proposal 写入 skill 文件
- 记录写入日志

## 9. 文件写入策略

这是第一版最重要的风险控制点。

## 9.1 原则

- 不允许直接覆盖整个 skill 文件
- 优先做“追加式更新”
- 每次写入前先备份
- 每次写入都记录来源 taskId 与 proposalId

## 9.2 写入方式

### 对 `requirement_writing.md`

- 在“编写规则”末尾追加新规则
- 若是编辑型 proposal，则人工确认后再改已有段落

### 对 `requirement_validation.md`

- 在“校验目标”或“输出要求”区域追加规则

### 对 `good_examples.md`

- 追加正例条目

### 对 `bad_examples.md`

- 追加反例条目

## 9.3 备份建议

每次应用前，在 `skills/history/` 下生成备份文件：

- `skills/history/2026-04-02-requirement_writing.md`

或生成 JSON 审计记录：

- `data/skill-refinement/audit/<taskId>.json`

## 10. LLM 提示策略

该子功能建议拆成 3 个 LLM 子步骤。

## 10.1 样例结构化 Prompt

目标：

- 将人工软件开发需求样例拆成结构化条目

输出：

- JSON 列表

## 10.2 样例对齐 Prompt

目标：

- 将人工需求条目映射回系统需求、模型 PDF、C 文件中的证据

输出：

- `sourceEvidenceRefs`
- `alignmentRationale`
- `confidence`

## 10.3 规则提炼 Prompt

目标：

- 从已对齐的高质量样例中提炼稳定规则，而不是总结具体项目内容

输出：

- 候选规则列表
- 候选正反例
- 候选 proposal

## 11. 风险与控制

## 风险 1：单个样例把偶然写法误提炼成规则

控制：

- 每条规则都必须绑定对应样例
- 明确显示置信度
- 需要人工接受后才能生效

## 风险 2：把项目内容规则误认为通用编写规范

控制：

- 区分“领域写法”与“项目特例”
- proposal 上增加标签：
  - `general`
  - `project_specific`

## 风险 3：自动写盘污染已有 skill

控制：

- 第一版仅支持对已接受 proposal 做追加
- 修改现有段落必须显式人工确认
- 保留备份

## 风险 4：样例对齐不准导致规则提炼偏差

控制：

- 对齐结果要可视化
- 允许人工筛掉低质量对齐项

## 12. 建议代码落点

第一版建议新增以下文件：

- `src/services/skill-refinement-service.js`
- `src/services/reference-requirement-parser.js`
- `src/services/skill-refinement-llm-service.js`
- `src/services/skill-proposal-writer.js`
- `public/skill-refinement.html`
- `public/skill-refinement.js`

如需本地持久化，可新增：

- `data/skill-refinement/tasks/`
- `data/skill-refinement/audit/`

## 13. 第一版开发顺序

建议按以下顺序实施：

1. 建数据模型与任务存储
2. 做页面和文件上传
3. 做人工样例结构化
4. 做样例对齐
5. 做规则提炼
6. 做 proposal 展示与审核
7. 做 skill 写盘和备份

## 14. 第一版验收标准

- 能创建一个 `Skill Refinement Task`
- 能上传一套输入物和一份人工高质量需求样例
- 能把样例拆成结构化需求条目
- 能生成输入与人工条目的对齐结果
- 能生成候选规则和候选 proposal
- 能人工接受/拒绝/编辑 proposal
- 能把通过的 proposal 写入目标 skill 文件
- 写盘后有审计记录与备份

## 15. 明天开发时的推荐切入点

若明天在另一台电脑上开始落地，建议先只做最小闭环：

1. 新建 `Skill Refinement` 页面
2. 支持上传样例输入物和人工需求文档
3. 先只生成候选规则 JSON
4. 暂时不写盘
5. 等候选规则展示稳定后，再做 proposal 和写盘

这样能先验证方向正确，再逐步推进到“更新 skill 文件”。
