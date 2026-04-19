# Replay Fallback Prompt Handover

## 1. 文档目的

这份文档用于给新的计划会话或新的 Codex 说明 `replay/fallback` prompt 的来龙去脉、之前讨论达成的约束、当前代码已经做到的程度、当前真实效果以及仍然存在的问题。

重点不是介绍“原始需求生成 prompt”，而是介绍“驳回后回放 fallback 给大模型做 skill proposal”的 prompt 设计与当前状态。

## 2. 背景

在软件需求被人工驳回后，系统会创建 replay/fallback 任务，再把该任务投给大模型，让模型输出结构化的 skill 修改提案，而不是重新生成需求正文。

目标是让模型输出可进入技能管理链路的 proposal，例如：

- 修改已有 atomic skill
- 新增一个 atomic skill
- 附带只读 validatorSuggestions

而不是简单地把驳回意见换一种说法重写。

## 3. 我们之前讨论过并确认的核心目标

围绕 replay fallback prompt，我们之前反复确认过这些目标：

1. 模型要先分析驳回意见、期望写法、被驳回输出，再决定怎么提案。
2. 模型要理解 `generic / docType / domain / module` 四种层级分别适用于什么场景。
3. 模型要优先命中已有的 atomic skill 做 `modify_existing`，只有在 existing skill 无法承接时才 `create_new`。
4. 一次 replay 允许输出多个 `items`，但每个 item 只能对应一个 atomic skill 修改项。
5. `afterContent` 必须是可复用的 atomic skill 正文，不能只是把驳回意见或 expectedNote 改写一遍。
6. 手动勾选的参考资产可以提供给模型，但它们是 evidence，不是 skill。

## 4. 之前讨论里达成的理想设计

### 4.1 Prompt 顶层结构

我们最早讨论里认为，replay prompt 的 user payload 顶层理想上应该只有 4 块：

- `taskContext`
- `rejectionContext`
- `originalGenerationSkillContext`
- `referenceAssets`

### 4.2 originalGenerationSkillContext 的理想范围

当时达成的理想设计是：fallback 的 skill 上下文只允许来自“原始生成这条被驳回需求时，模型实际看过的 skill”。

理想上希望保留这些字段：

- `compiledPrompt`
- `requirementExtraction`
- `requirementWriting`
- `requirementValidation`
- `goodExamples`
- `badExamples`
- `domainKnowledge`
- `selectedProfiles`
- `compiledSkillPack`

### 4.3 理想上不希望给模型的内容

理想设计里，我们不希望 replay 再额外塞这些内容：

- 整个原样 `materialPack`
- replay 阶段后端额外推导的 hint
- replay 阶段额外排序出来的 skill 命中建议
- 原始生成时没给模型看过的新增 skill 上下文

## 5. 当前代码里的真实实现

当前实现主要在：

- `src/services/llm-service.js`
- `tests/run-tests.js`

其中 replay prompt builder 的核心位置在：

- `src/services/llm-service.js:699`

### 5.1 当前 system prompt 的真实内容

当前代码里 `buildReplaySystemPrompt()` 输出的是如下约束：

```text
你是技能维护工单生成助手，需要根据驳回记录、期望写法、被驳回输出、原始生成时实际提供过的 skill 上下文，以及用户手动勾选的参考资产，输出可直接进入技能管理的结构化修改建议。
返回内容必须全部使用中文，并严格符合给定 JSON schema。
每个 items 条目只能对应一个 atomic skill 修改项。
层级说明：generic 表示跨模块和跨文档通用的基础规则；docType 表示仅对某一类文档类型生效的规则；domain 表示在某个领域内广泛适用但不局限于单一模块的规则；module 表示仅对当前模块生效的规则。
请先分析驳回意见、期望写法和被驳回输出，再判断建议应该沉淀到 generic / docType / domain / module 哪一层。
如果建议依赖具体模块名、模块专属流程语义、局部边界、模块专属信号、枚举值或阈值，则优先落到 module；不要错误上提到 docType。
优先在原始生成时已提供给模型的 skill 上下文中寻找可以修改的 existing atomic skill；只有在 existing atomic skill 无法覆盖某个独立问题时，才允许输出 conclusionType=create_new。
action 只能填写 add_skill_item、modify_skill_item、split_skill_item、deprecate_skill_item 之一，不要输出自然语言句子。
evidenceRefs 只能填写 rejectionContext.records 中给出的 id，不要填写 requirementCode、标题或自然语言。
modify_existing 时 targetSkillCode 必须来自 candidateSkillInventory 里的 skillCode；不要编造 skillCode。
如果 candidateSkillInventory 为空，或没有任何 skillCode 能精确承接本次修改，就必须输出 create_new + add_skill_item，并把 targetSkillCode 设为空字符串。
不要编造新的 kind，targetKind 必须来自 taskContext.allowedKindsByArea 的允许值。
afterContent 必须是可复用的 atomic skill 正文，不要只是把驳回说明换一种语气重写。
如果当前案例只适合沉淀为模块规则，请把正文抽象成“某类需求在什么条件下不得补写什么内容”的规则，而不是“请把某条结果改成什么”。
beforeContent 应表示当前 skill 原文或当前能力边界；afterContent 应表示建议修改后的 atomic skill 正文。
whyCurrent 必须说明当前 skill 为什么没拦住问题；whyChange 必须说明修改后为什么能避免同类问题。
validatorSuggestions 只做只读建议，不进入自动应用链路。
一次 replay 可以输出多个 items，但每个 item 只能对应一个 atomic skill 修改项。
只要存在驳回记录，items 至少输出 1 条可执行提案；不要返回空数组。
参考资产是案例证据和写法参考，不是 skill；如果人工优质范例与代码证据冲突，应优先对齐人工范例界定的边界和粒度。
不要输出整份 markdown 文件，只输出单条 atomic skill 级别的修改。
```

### 5.2 当前 user payload 的真实顶层结构

当前 `buildReplayPromptContext()` 真实输出的顶层不是最早讨论的 4 块，而是 5 块：

- `taskContext`
- `rejectionContext`
- `originalGenerationSkillContext`
- `candidateSkillInventory`
- `referenceAssets`

也就是说，当前实现已经引入了一个“精简版候选 skill inventory”。

### 5.3 当前 taskContext 的真实内容

当前 `taskContext` 包含：

- `projectName`
- `moduleName`
- `documentType`
- `targetAreas`
- `allowedKindsByArea`
- `candidateSkillCount`

### 5.4 当前 rejectionContext 的真实内容

当前 `rejectionContext.records[*]` 包含：

- `id`
- `requirementCode`
- `reasonCategory`
- `reasonText`
- `expectedNote`
- `rejectedOutput`
- `sourceRefsSnapshot`
- `projectEvidenceSnapshot`

其中 `rejectedOutput` 至少包含：

- `title`
- `requirementText`
- `verificationHint`
- `confidence`

### 5.5 当前 originalGenerationSkillContext 的真实内容

当前实现并没有保留最初理想设计里的全部原始字段。

现在真实提供给模型的是：

- `requirementExtraction`
- `requirementWriting`
- `requirementValidation`
- `goodExamples`
- `badExamples`
- `domainKnowledge`
- `selectedProfiles`

当前实现没有继续给模型这些字段：

- `compiledPrompt`
- `compiledSkillPack`

这一点和最早讨论过的理想方案不一致。

### 5.6 当前 candidateSkillInventory 的真实内容

当前实现额外构造了 `candidateSkillInventory`，每项会提供：

- `skillCode`
- `title`
- `targetLayer`
- `targetProfileKey`
- `targetKind`
- `targetFile`
- `contentSummary`

当前 system prompt 还明确约束：

- `modify_existing` 时，`targetSkillCode` 必须来自这个 inventory
- 如果 inventory 为空或没有合适 skill，就必须走 `create_new`

### 5.7 当前 referenceAssets 的真实内容

当前 `referenceAssets[*]` 会提供：

- `fileName`
- `role`
- `typeDescription`
- `contentSummary`
- `whyRelevant`
- `preview`

按 role 的语义说明如下：

- `system_pdf`
  - 系统需求来源，用于确认上游约束、边界、条件、阈值和主题范围
- `reference_requirement_example`
  - 人工软件需求优质范例，用于确认期望写法、粒度、边界和表达风格
- `generated_c`
  - 实现/代码证据，用于解释模型为何可能扩写，但不能直接覆盖人工范例定义的需求边界

## 6. 当前测试覆盖的真实状态

当前已有的主要测试点如下：

### 6.1 replay prompt 结构测试

测试位置：

- `tests/run-tests.js:466`

当前测试验证的是“当前真实实现”，而不是“最早理想设计”。也就是说，测试已经确认：

- 顶层存在 `candidateSkillInventory`
- `originalGenerationSkillContext` 不包含 `compiledPrompt`
- `originalGenerationSkillContext` 不包含 `compiledSkillPack`

### 6.2 多 item 兼容性测试

测试位置：

- `tests/run-tests.js:1725`

这部分确认了一次 replay 返回多个 `items` 时，work order 侧可以正常接收和存储。

## 7. 之前真实跑出来的效果与问题

在 2026-04-17，我们针对 `充电管理` 模块里那个被驳回的软件需求做过多次 replay fallback 实验。

虽然 prompt 结构已经比最早版本更收敛，但真实结果仍然暴露出这些问题：

1. 模型仍然倾向只返回 1 条 item。
2. 模型仍然倾向输出 `create_new`，而不是稳定命中 existing skill。
3. 层级判断仍然容易落到 `docType/software_requirement`。
4. `afterContent` 虽然比最早版本更像规则，但本质上仍然经常接近“把驳回意见/expectedNote 改写成一条规则”。
5. 没有稳定地落到更合理的 `module` 层。

## 8. 一个关键事实：其实存在明显可命中的 existing skill

我们在真实样本里查过，当时原始 skill snapshot 中并不是“完全没有可命中的 existing skill”。

至少存在这些明显候选：

- `DOC-software_requirement-validation_rule-010`
  - 无依据扩写校验
- `DOC-software_requirement-writing_rule-002`
  - 人工样例对齐优先
- `MOD-充电管理-anti_pattern-002`
  - 不要在人工样例已经拆分“截止SOC控制”和“截止SOC记忆”时，再把两者混写成一条增强版需求
- `MOD-充电管理-rule_hint-001`
- `MOD-充电管理-generation_priority-002`

所以问题更像是：

- prompt 还不足以让模型稳定优先命中 existing skill
- 或 candidateSkillInventory 的构造和约束方式仍然不够理想
- 或当前只给 `selectedProfiles + 渲染文件`，却拿掉了 `compiledPrompt / compiledSkillPack` 后，模型失去了对已有 skill 整体结构的把握

## 9. 当前历史样本状态

一个非常重要的事实是：

之前为了清理环境，本地历史 fallback 工单和 `充电管理` 对应的 replay task 记录已经被删除。

因此，新的 Codex 不要再依赖本地旧 replay 样本文件去恢复完整上下文。

现在应当以：

- 当前代码状态
- 当前测试状态
- 本文档里的文字结论

作为主要事实来源。

## 10. 当前最准确的状态总结

一句话总结当前进展：

我们已经把 replay fallback prompt 从“整包 materialPack 原样发给模型”，收敛成了“结构化 task/rejection/skill/reference 输入”，并补上了四层说明、existing skill 优先、reference asset 类型说明、多 item 兼容等约束；但当前真实实现已经演化成“5 段 payload + candidateSkillInventory + 去掉 compiledPrompt/compiledSkillPack”，而且从真实效果看，模型仍然容易产出 `docType + create_new + 驳回意见改写型 afterContent`，说明这套 prompt 还没有把“精准命中 existing skill / 正确分层 / 输出真正可复用 atomic rule”这件事完全做稳。

## 11. 新 Codex 接手时最值得优先核对的点

建议新 Codex 重点检查以下问题：

1. `candidateSkillInventory` 是否真的提高了 existing skill 命中率，还是反而把模型推向了更机械的 `create_new`。
2. 去掉 `compiledPrompt` 和 `compiledSkillPack` 后，是否损失了模型对“当前 skill 全貌”的理解。
3. 对明显依赖模块边界的驳回场景，`module` 优先的约束是否还不够强。
4. 是否需要在后处理阶段对“驳回意见改写型 afterContent”增加识别和拦截。

## 12. 关键代码位置

- replay system prompt
  - `src/services/llm-service.js:699`
- replay payload 结构
  - `src/services/llm-service.js:851`
- replay prompt 结构测试
  - `tests/run-tests.js:466`
- multi-item 兼容测试
  - `tests/run-tests.js:1725`

