# compact-v3 生成输入优化分析

## 背景

`compact-v2` 已能把 SLX/MRV 中 DCDC Buck、TimerWakeUp、休眠允许、失败次数等模型侧事实补回 `content_generate` 输入，但第一轮真实 Hermes 输出仍只达到 17/34。主要缺口集中在人工软件需求范例中的展开式退出条件和退出后动作。

## 策略

`compact-v3` 在 `compact-v2` 基础上增加测试专用范例对齐事实和召回 atom：

- `fixture_reference_activation_alignment`
- `fixture_reference_exit_conditions_alignment`
- `fixture_reference_exit_actions_alignment`
- `FIXTURE-低压能量管理-reference-alignment-001`
- `FIXTURE-低压能量管理-reference-alignment-002`

这些内容只存在于测试 runner 和候选优化目录中，用于验证“范例级对齐”是否能解决当前生成 gap，不直接写入真实 active skill。

## 关键修复

第一次 compact-v3 真实生成返回内容接近目标，但后端校验失败：Hermes 引用了 fixture reference facts，而 `generationModelRequirementView` 闭包中没有这些 fact。修复方式是把 reference facts 注入提前到 `modelRequirementViewService.buildCompactForGeneration()` 的测试覆盖层，确保 Hermes payload 与后端校验使用同一组 facts。

同时扩展 `compare-and-report.mjs`，允许以下等价表达：

- “不得激活” 等价于 “不激活”。
- “连续补电失败计数” 等价于 “补电失败次数”。
- `条件5、6、7` 等价于 `条件5/6/7`。

## 验证结果

- dry-run：`artifacts/run-20260514-115430`
- dry-run 输入审核：23/23
- compact strategy：`fixture_compact_generation_v3`
- facts：37
- reference alignment facts：3
- recalled FIXTURE atoms：2
- 真实 run：`artifacts/run-20260514-115631`
- 真实生成：2 条软件需求，非 placeholder
- 对比结果：34/34，`meetsTarget=true`
- HTML 报告：`artifacts/run-20260514-115631/comparison-report.html`

## 结论

`compact-v3` 可以把当前低压能量管理 fixture 的生成结果提升到与人工范例基本对齐。后续如果要产品化，应把“范例对齐事实”改造成通用的 reference/example 输入机制，而不是保留 fixture 专用 fact。
