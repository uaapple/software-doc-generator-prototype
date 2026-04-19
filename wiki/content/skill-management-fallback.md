# 技能管理与 Fallback

## 这页讲什么

这页介绍技能管理工作台中的两类核心视图，以及为什么系统会出现 fallback、工单和后续技能修复动作。

## 技能管理页里有什么

当前公开的技能管理页主要有两种视图：

- `Atomic Skill`
  用来查看当前 Active Skill 的结构化全景。
- `技能工单`
  用来处理 fallback 或 replay 过程中沉淀出来的具体修改项。

## 什么时候会出现 fallback

可以把 fallback 理解成“系统发现当前技能覆盖还不够稳，需要你帮它把问题沉淀为更明确的规则或样例”。它不是简单报错，更像一种修正机制。

## 工单怎么理解

每张技能工单通常会聚合一批需要确认的修改项。你在这里做的不是“重新生成文档”，而是判断：

- 哪些修改建议值得保留
- 它们应该写入哪一层技能
- 应用之后是否能帮助后续任务更稳定

## targetArea 在这里起什么作用

当一条驳回进入 Replay 和技能工单链路后，`targetArea` 会继续影响后续 proposal 的方向。它不是页面上的展示字段而已，而是会参与决定：

- 这次 proposal 允许落到哪些 `kind`
- 模型会优先把问题理解成“写作规则问题”还是“校验规则问题”等
- 工单里的修改项更偏向规则、反例、样例还是领域知识

可以把它理解成“规则类型约束”。

当前系统里：

- `targetArea`
  决定“改哪一类规则”
- `targetLayerConstraint`
  决定“改哪一层规则”

两者会一起约束 Replay，不是二选一。

## 五种 targetArea 的业务含义

- `validation`
  更偏“拦错”和“补边界”。最终工单通常更容易落到 `validation_rule`、`anti_pattern`、`rule_hint`。
- `writing`
  更偏“改写法”和“改组织方式”。最终工单通常更容易落到 `writing_rule`、`good_example`、`generation_priority`、`rule_hint`。
- `extraction`
  更偏“补抽取能力”。最终工单通常更容易落到 `extraction_rule`、`generation_priority`、`rule_hint`。
- `examples`
  更偏“沉淀正例/反例”。最终工单通常更容易落到 `good_example`、`bad_example`、`anti_pattern`。
- `domain_knowledge`
  更偏“沉淀术语、字典、别名、策略、知识组织规则”。最终工单通常更容易落到 `rule_hint`、`source_alias`、`normalization_rule`、`source_policy_setting` 等知识类项。

## layer × kind 矩阵现在已经固化

现在系统不再只是校验 `kind` 是否存在，还会同时校验“这个 `kind` 能不能出现在当前 layer”。凡是不在允许矩阵里的组合，系统都会直接拒绝创建、编辑、Replay proposal 保存或工单应用。

可以把它理解成两层限制一起生效：

- `targetLayerConstraint`
  决定这次修改落在哪一层
- `targetArea`
  决定这次修改属于哪一类规则

最终真正允许的 `kind`，是这两者交集里的结果。

## 先怎么理解 layer 和 kind

可以先用一句最简单的话来记：

- `layer`
  解决“这条规则影响范围有多大”
- `kind`
  解决“这条规则本质上在干什么”

比如同样是“不要把代码保护逻辑写进正文”：

- 如果它适用于所有软件需求写法，可能更像 `docType + validation_rule`
- 如果它只适用于 `充电管理` 模块，可能更像 `module + validation_rule`
- 如果它不是在拦错，而是在教模型“以后优先按这个顺序写”，那又可能更像 `generation_priority`

所以矩阵不是为了增加复杂度，而是为了让“作用范围”和“规则类型”都说清楚。

## 四层允许的 kind 总览

先看矩阵，再看下面的逐项解释会更容易。

### generic

- `writing_rule`
- `extraction_rule`
- `validation_rule`
- `generation_priority`
- `rule_hint`
- `anti_pattern`
- `source_alias`
- `code_style_prefix`
- `forbidden_expansion`
- `normalization_rule`
- `source_policy_setting`

### docType

- `writing_rule`
- `extraction_rule`
- `validation_rule`
- `good_example`
- `bad_example`
- `generation_priority`
- `rule_hint`
- `anti_pattern`
- `source_policy_setting`
- `document_blueprint_section`
- `document_blueprint_policy`

### domain

- `writing_rule`
- `extraction_rule`
- `validation_rule`
- `good_example`
- `bad_example`
- `generation_priority`
- `rule_hint`
- `anti_pattern`
- `source_alias`
- `code_style_prefix`
- `forbidden_expansion`
- `normalization_rule`
- `source_policy_setting`

### module

- `writing_rule`
- `extraction_rule`
- `validation_rule`
- `good_example`
- `bad_example`
- `generation_priority`
- `rule_hint`
- `anti_pattern`
- `source_alias`
- `code_style_prefix`
- `forbidden_expansion`
- `normalization_rule`
- `source_policy_setting`

## 每个 kind 具体是什么意思

下面这部分更偏“读者指南”。如果你在技能管理页、Replay Lab、工单详情里看到某个 `kind`，可以直接来这里对照。

### `writing_rule`

用于约束“正文应该怎么写”。它关心的是表达方式、句式组织、条目拆分和写作边界，而不是事实本身。

适合的场景：

- 需求正文应该保持什么结构
- 同一条里应该写几个主题
- 应该用什么语气、什么粒度表达

例子：

- “软件需求正文优先写‘触发条件 + 软件行为 + 结果’，不要把实现步骤展开成流程说明。”
- “记忆类需求只写记忆、恢复和更新，不要把保护逻辑混入同一条正文。”

### `extraction_rule`

用于约束“从源材料里先抽什么事实”。它更靠前，发生在写作之前。

适合的场景：

- 某类变量、阈值、状态机条件总是没被抽出来
- 代码或系统需求里有关键前置条件，但写作阶段拿不到

例子：

- “遇到充电控制逻辑时，优先抽取使能条件、退出条件和阈值信号。”
- “如果代码里存在中间量判断链，要尽量向上追到可表达的软件约束，而不是只停在临时变量名。”

### `validation_rule`

用于约束“生成结果怎样才算合格”。它是最典型的拦错规则。

适合的场景：

- 缺少边界条件
- 补写了没有证据支持的逻辑
- 缺少验收性或可验证性表达

例子：

- “如果当前证据只支持‘下电记忆’，就不能补写‘无效值回退默认值’。”
- “软件需求必须能从源证据中追溯到明确的触发条件或状态变化。”

### `good_example`

用于提供“应该怎样写”的正例。它本质上是 few-shot 参考。

适合的场景：

- 你希望模型以后尽量贴近某种成熟写法
- 某类对象以前已经有人写得很好，值得直接示范给模型看

例子：

- “CheryVCU-12147 只写记忆和更新行为，不混入控制兜底逻辑。”
- “HIL 用例里把前置条件、操作步骤、预期结果拆成固定三段。”

### `bad_example`

用于提供“不应该这样写”的反例。

适合的场景：

- 模型总在重复某种典型坏写法
- 你想让团队成员一眼看到什么叫“越界扩写”

例子：

- “正文里突然写进了代码侧默认值回退，但系统需求和人工样例都没有提这件事。”
- “把两个不同功能主题揉成一条需求，导致验证条件混乱。”

### `generation_priority`

用于表达“生成时什么更应该优先考虑”。它不是逐句规则，更像高层排序策略。

适合的场景：

- 某类主题应该先覆盖，另一类主题应后覆盖
- 某些对象在写正文时优先级明显更高

例子：

- “软件需求生成时，优先覆盖主控制流程，再补充异常和边界情况。”
- “先围绕人工样例中已稳定出现的对象组织章节，再考虑补充次级主题。”

### `rule_hint`

用于提供较轻量的高层提醒。它比 `writing_rule`、`validation_rule` 更松，通常是辅助方向提示。

适合的场景：

- 你想提醒模型注意某类隐含边界
- 你不想把规则写得特别硬，但希望它有明确倾向

例子：

- “优先沿人工样例的主题边界组织正文。”
- “遇到封装后的判断链时，优先回推业务条件，而不是照搬局部变量名。”

### `anti_pattern`

用于明确列出“必须避免的错误模式”。

适合的场景：

- 某类坏结果反复出现
- 你希望用负面约束快速拦住常见误写

例子：

- “不要把默认值回退逻辑写进记忆类需求。”
- “不要为了补齐‘看起来完整’而凭空引入未出现在证据里的保护动作。”

### `source_alias`

用于把实现态命名、别名、缩写映射回规范表达。它更像术语字典的一部分。

适合的场景：

- 同一个对象在代码里有多个名字
- 模型容易把底层信号名直接抄进正文

例子：

- “`ChgCutoffSOC`、`SOC_LimitPointSet` 都应统一理解为‘充电截止 SOC 设置值’。”
- “`VehSpd` 统一映射为‘车速’。”

### `code_style_prefix`

用于告诉系统“哪些前缀明显是代码命名痕迹，不应直接主导正文表达”。

适合的场景：

- 模型总把 `rtb_`、`tmp_`、`u8_` 这类实现前缀写进正文
- 你想弱化代码风格信号对自然语言的污染

例子：

- “`rtb_`、`tmp_`、`UnitDelay_` 一般是实现中间量，不应直接出现在软件需求正文。”
- “带类型前缀的局部变量名不能当作业务对象名直接输出。”

### `forbidden_expansion`

用于限制“哪些主题下不能自己扩写出额外对象或子功能”。

适合的场景：

- 模型总在某个主题里顺手补很多其实没有证据的子功能
- 你想明确圈出扩写禁区

例子：

- “讨论充电截止 SOC 记忆时，不允许自行扩写默认值回退、重新插枪恢复等主题。”
- “如果当前条目只讲状态上报，就不要补写诊断策略和故障恢复流程。”

### `normalization_rule`

用于把容易漂移的表达统一成稳定说法。

适合的场景：

- 团队内部同一概念有很多写法
- 模型总在术语表达上来回飘

例子：

- “‘驻车充电状态’统一写法，不再混用‘停车充电状态’和‘P 档充电状态’。”
- “把‘下次上电恢复’统一规范成‘下次上电后恢复上次记忆值’。”

### `source_policy_setting`

用于声明“事实来源边界”和“哪些来源更可信”。它不是具体写法，而是证据使用政策。

适合的场景：

- 某类任务中人工样例应优先于代码
- 某些来源只能辅助解释，不能单独作为正文依据

例子：

- “人工软件需求范例优先决定正文边界，代码只用于补充可验证前置条件。”
- “中间变量命名只能作为线索，不能单独当作业务结论写入正文。”

### `document_blueprint_section`

用于定义某类文档应该有哪些章节骨架。它描述的是“文档结构”，不是单条规则，所以只允许放在 `docType`。

适合的场景：

- 你希望某种文档类型固定按哪些章节组织
- 章节顺序和章节对象本身很重要

例子：

- “软件详细设计固定包含：功能概述、接口定义、时序/流程、异常处理。”
- “HIL 测试用例固定包含：测试目的、前置条件、测试步骤、预期结果。”

### `document_blueprint_policy`

用于补充文档蓝图的高层组织策略。它不是在定义“有哪些章节”，而是在定义“章节应该怎么组织”。

适合的场景：

- 你希望文档按对象维度展开，而不是按信号维度展开
- 你希望章节组织体现某种固定策略

例子：

- “优先按对象或业务轴对称展开章节，而不是按代码函数顺序罗列。”
- “文档骨架优先覆盖主流程，再在各章节内补充边界和异常。”

## 最容易踩坑的硬限制

- `document_blueprint_section` 和 `document_blueprint_policy` 只能放在 `docType`
- `good_example` 和 `bad_example` 不能放在 `generic`
- `source_alias`、`code_style_prefix`、`forbidden_expansion`、`normalization_rule` 不能放在 `docType`

如果你在页面上发现某个 `kind` 选不到，通常不是 bug，而是因为这条组合已经被矩阵明确禁止。

## 一个快速判断法

如果你还在纠结一条 proposal 属于什么 `kind`，可以先问自己下面三个问题：

1. 它是在教模型“怎么写”，还是在告诉模型“什么不能写”？
2. 它是在补事实来源，还是在约束生成结果？
3. 它是在定义文档结构，还是在定义单条规则？

通常会得到这样的落点：

- 偏写法：`writing_rule`
- 偏拦错：`validation_rule` 或 `anti_pattern`
- 偏抽取：`extraction_rule`
- 偏样例：`good_example` / `bad_example`
- 偏术语和来源政策：`source_alias` / `normalization_rule` / `source_policy_setting`
- 偏文档结构：`document_blueprint_section` / `document_blueprint_policy`

## 为什么现在改成人工选择

现在 `targetArea` 已经不再由系统根据驳回说明自动判断，而是完全由人工选择。这样做有两个主要原因：

- 用户最清楚这次驳回到底是在修“规则类型”还是修“写法风格”
- Replay 现在已经有了明确的层级硬约束，再继续让系统自动猜 `targetArea`，容易让 proposal 方向漂移

如果你发现某次工单的 proposal 总是偏掉，除了检查层级是否选对，也建议先回头看这次驳回的 `targetArea` 是否选对了。

## 什么时候应该先看这页

- 你发现系统经常在同一类主题上重复出错
- 你已经有明确的修正意见，希望沉淀成长期有效的能力
- 你看到结果页里出现了和 fallback、工单相关的提示

## 和反馈池的关系

技能管理更偏“修能力本身”，而 [反馈池与 Replay](/pages/feedback-pool-replay) 更偏“管理驳回记录和回投任务”。两者会互相衔接，但不是同一个页面。

## 背后原理

从业务视角看，这一层的目标不是多造一个结果页，而是让问题能被结构化保留、再次审阅，并最终回写到 active skill 中，减少同类错误反复出现。
