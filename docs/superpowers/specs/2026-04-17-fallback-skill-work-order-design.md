# Fallback Skill Work Order Design

## 目标

将现有的 `fallback / replay -> proposal -> apply` 链路升级为面向技能维护的工单流：

- 一次 fallback 任务生成一张技能工单
- 一张工单内部包含多条 atomic skill 修改项
- 审阅者可以在技能管理中查看任务上下文、命中的 skill、修改前后内容和理由
- 审阅者点击确认后，系统自动将修改应用到对应 atomic skill

该设计优先复用现有的 replay task、proposal review、atomic skill registry 和 skill item apply 能力，避免重做一套平行系统。

## 用户体验

### 入口

在技能管理工作台新增一个一级视图或页签：`技能工单`。

该视图展示状态为 `pending_review`、`partially_applied`、`applied`、`closed` 的工单。

### 工单卡片

每张工单对应一次 fallback 任务，列表页展示：

- 工单标题
- 来源 fallback 任务 ID
- 模块 / 文档类型 / 模型
- 创建时间
- 结论摘要
- 修改项数量
- 当前状态

工单标题建议格式：

`充电管理 / 软件需求 / fallback 技能修改工单`

### 工单详情

工单详情分四个区域：

1. 任务背景
- 来源 fallback 任务
- 关联 rejection 记录
- 模块、文档类型、模型、时间
- effective skill snapshot 标识

2. 问题上下文
- 被驳回的生成条目
- 人工范例片段
- 驳回说明
- 期望修正

3. 结论摘要
- 命中已有 atomic skill 数量
- 建议新增 atomic skill 数量
- validator 建议数量
- 总体结论

4. 修改项列表
- 每条修改项单独展示并可审阅

### 修改项形态

每条修改项固定包含以下信息：

- `结论类型`
  - 修改已有 atomic skill
  - 新增 atomic skill
- `命中的 skill`
  - `skillCode`
  - `layer`
  - `profileKey`
  - `kind`
- `命中原因`
  - 为什么判断是这条 skill 有问题
- `原文为什么`
  - 当前 skill 原文为什么没有拦住这次问题
- `修改意见`
  - 建议修改成什么
- `修改后为什么`
  - 修改后如何避免类似问题
- `修改前内容`
- `修改后内容`
- `证据引用`
  - fallback 任务
  - rejection 记录
  - 人工范例片段
  - 生成结果片段
  - effective skill snapshot 片段
- `操作`
  - `接受并应用`
  - `编辑后应用`
  - `拒绝`

如果未命中任何已有 skill，则显示：

- `结论：建议新增 atomic skill`
- `建议插入位置`
- `建议 kind`
- `新增标题`
- `新增内容`
- `为什么现有 skill 无法覆盖`

## 核心对象模型

新增顶层对象：`SkillWorkOrder`

```json
{
  "id": "swo_xxx",
  "sourceType": "fallback",
  "sourceTaskId": "replay_task_xxx",
  "sourceTaskSummary": {},
  "moduleId": "",
  "moduleName": "",
  "documentType": "software_requirement",
  "llmProfile": {},
  "effectiveSkillSnapshot": {},
  "status": "pending_review",
  "summary": "",
  "decisionSummary": "",
  "itemStats": {
    "total": 0,
    "modifyExisting": 0,
    "createNew": 0,
    "validatorOnly": 0,
    "accepted": 0,
    "rejected": 0,
    "applied": 0
  },
  "evidenceRefs": [],
  "items": [],
  "createdAt": "",
  "updatedAt": ""
}
```

新增子对象：`SkillWorkOrderItem`

```json
{
  "itemId": "swo_item_xxx",
  "conclusionType": "modify_existing",
  "targetSkillCode": "WRITING-xxx",
  "targetLayer": "docType",
  "targetProfileKey": "software_requirement",
  "targetKind": "writing_rule",
  "targetInsertionHint": "",
  "fallbackReason": "",
  "whyCurrent": "",
  "whyChange": "",
  "beforeContent": "",
  "afterContent": "",
  "evidenceRefs": [],
  "reviewStatus": "pending",
  "reviewComment": "",
  "editedPayload": null,
  "appliedChange": null,
  "appliedAt": "",
  "appliedBy": ""
}
```

### 状态机

工单状态建议如下：

- `pending_review`
  - 工单已生成，待人工审阅
- `partially_reviewed`
  - 已有部分 item 被接受或拒绝
- `partially_applied`
  - 已有部分接受项被写入 atomic skill
- `applied`
  - 所有被接受项都已应用
- `closed`
  - 全部处理完毕，无需继续操作

单条 item 状态建议如下：

- `pending`
- `accepted`
- `edited`
- `rejected`
- `applied`

## 与现有系统的关系

### 现状

当前系统已经有：

- rejection pool
- replay task
- proposal item review
- atomic skill registry
- create / update / delete skill item
- provenance 字段

### 升级方式

不删除现有 proposal 能力，而是在 fallback 分支上增加 `工单包装层`：

1. fallback 任务完成
2. 大模型返回结构化技能修改建议
3. 系统将建议映射成 `SkillWorkOrder`
4. 技能管理页读取并审阅工单
5. 审阅动作最终复用现有 skill item create / update 能力

也就是说：

- `proposal` 仍然是底层修改建议对象
- `work order` 成为面向用户审阅的主对象

## Fallback 输入上下文

为了让大模型能真的定位 skill 问题，fallback 请求必须带上完整上下文，而不是只给驳回说明。

建议 material pack 至少包含：

1. 任务输入与输出
- 系统需求范例
- 人工软件需求范例
- 本次生成结果
- 被驳回的目标条目

2. 驳回信息
- 原因分类
- 原因标签
- 驳回说明
- 期望修正

3. 当次任务实际生效的完整 skill 快照
- writing / extraction / validation 规则
- 模块 profile
- doc type profile
- domain knowledge
- good examples / bad examples

4. skill 结构索引
- layer
- profile
- skillCode
- kind
- 标题
- 当前正文

5. 命中证据
- 人工范例片段
- 生成结果片段
- rejection 记录
- 如有必要的代码 / 模型证据

6. 元数据
- 模块名
- 文档类型
- 模型名
- 任务时间
- skill snapshot hash

## Fallback Prompt 目标

fallback prompt 不再让模型泛泛输出“改进建议”，而是要求它输出：

1. 问题是否由 skill 缺陷导致
2. 命中了哪些已有 atomic skill
3. 每条命中的 skill 该如何改
4. 如果没有命中，应该新增什么 atomic skill
5. 哪些问题应该进入 validator，而不是只改 skill

模型输出必须满足：

- 中文输出
- 面向技能维护
- 一条修改项只改一个 atomic skill
- 不允许只写空泛结论

## 建议的 LLM 输出结构

fallback 响应建议升级为：

```json
{
  "summary": "",
  "decisionSummary": "",
  "items": [
    {
      "conclusionType": "modify_existing",
      "targetSkillCode": "",
      "targetLayer": "",
      "targetProfileKey": "",
      "targetKind": "",
      "fallbackReason": "",
      "whyCurrent": "",
      "whyChange": "",
      "beforeContent": "",
      "afterContent": "",
      "evidenceRefs": []
    }
  ],
  "validatorSuggestions": [
    {
      "title": "",
      "ruleText": "",
      "why": ""
    }
  ]
}
```

## 审阅与应用流程

### 审阅

工单详情页允许两层审阅：

1. 工单级审阅
- 看任务背景与整体结论

2. item 级审阅
- 接受
- 编辑后接受
- 拒绝

### 点击确认后的行为

点击 `接受并应用` 后：

1. 读取修改项
2. 若 `conclusionType = modify_existing`
   - 根据 `targetSkillCode` 更新现有 atomic skill
3. 若 `conclusionType = create_new`
   - 根据 `targetLayer / profileKey / kind` 新建 atomic skill
4. 记录 provenance
   - `sourceType = fallback_work_order`
   - `sourceTaskId`
   - `workOrderId`
   - `workOrderItemId`
   - `rejectionIds`
5. 更新 item 状态为 `applied`
6. 回刷对应 profile 的 skill 索引

### 审计要求

每次应用必须记录：

- 应用人
- 应用时间
- 修改前快照
- 修改后快照
- 来源 fallback 任务
- 来源工单
- 来源 rejection 记录

## 技能管理页面改造

建议在技能管理页增加一个新的双栏或抽屉区域：

- 左侧：工单列表
- 右侧：工单详情

或者新增页签：

- `Atomic Skill`
- `技能工单`

推荐页签方式，避免把当前 skill 审阅视图塞得过满。

### 列表过滤

工单列表建议支持：

- 状态筛选
- 模块筛选
- 文档类型筛选
- 来源 fallback 任务筛选
- 时间筛选

### 工单详情中的原子技能联动

当某条修改项命中已有 `skillCode` 时：

- 显示该 skill 当前详情摘要
- 支持跳转到当前 atomic skill 详情
- 支持对修改后正文做轻编辑

## 后端改造建议

### 新服务

建议新增：

- `skill-work-order-service.js`

职责：

- 创建工单
- 获取工单列表 / 详情
- 审阅工单 item
- 应用工单 item
- 关闭工单

### 与 replay-task-service 的关系

建议在 fallback 任务完成后：

- `replay-task-service`
  - 负责生成 fallback 结果
- `skill-work-order-service`
  - 负责把 fallback 结果映射成工单

即：

`fallback task -> proposal/work-order material -> skill work order`

### 与 skill-rule-service / registry 的关系

应用确认后直接复用：

- `skill-management-service`
- `skill-registry-service`

避免写第二套 skill 落盘逻辑。

## 风险与防护

### 风险 1：一个 fallback 任务改太多 skill

防护：

- 一条 item 只能对应一个 atomic skill
- 工单级允许多条 item，但 item 必须独立审阅

### 风险 2：fallback 命中错误的 skill

防护：

- 要求输出 `whyCurrent`
- 审阅页展示 skill 原文、修改前后内容和证据
- 支持编辑后接受

### 风险 3：直接改 active skill 风险过高

防护：

- 先按 item 级确认
- 全量记录 provenance 和 before/after snapshot
- 后续可增加“回滚到上一个版本”

### 风险 4：同一问题同时需要 skill 和 validator

防护：

- 工单允许同时包含 `skill item` 与 `validator suggestion`
- validator 建议可以先只展示，不自动应用

## 验收标准

### 第一阶段

1. fallback 任务结束后可自动生成一张技能工单
2. 工单中可看到来源任务、驳回上下文、命中的 skill 和修改前后内容
3. 审阅者可逐条接受、编辑后接受、拒绝
4. 点击确认后能自动更新已有 atomic skill 或新增 atomic skill
5. 应用后能在技能管理中立即看到更新结果
6. 每条改动都能追溯到 fallback 任务和工单 item

### 第二阶段

1. 支持工单关闭与历史追踪
2. 支持工单筛选与统计
3. 支持按工单驱动 validator 改造建议
4. 支持工单应用后的 benchmark 回归闭环

## 推荐实施顺序

1. 先补 fallback 输出 schema
2. 再增加 `skill-work-order-service`
3. 接入技能管理页的工单视图
4. 打通 `接受并应用 -> skill registry`
5. 最后补 validator suggestion 与 benchmark 闭环

## 决策结论

本方案采用：

- `一个工单 = 一次 fallback 任务`
- `一个工单包含多条 atomic skill 修改项`
- `用户在技能管理中审阅工单`
- `点击确认后直接应用到 active atomic skill`

这是当前系统演进成本最低、用户感知最强、且最符合“技能维护工单化”的方案。
