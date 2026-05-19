# compact-v1 测试候选优化

## 背景

`artifacts/run-20260513-172526` 使用系统当前 `mrv_compact_generation_v1` 生成 `content_generate` 输入包，compact MRV 只有 16 条 facts：

- 状态与模式：6
- 派生信号定义：8
- 逻辑与条件：1
- 时序与周期：1

其中系统需求被保留为一整条事实，模块 skill 召回命中低压能量管理相关规则；但模型侧与智能补电退出后动作相关的若干信号没有进入 compact MRV。

## 测试专用优化

`run-real-chain.mjs` 增加 `RUN_OPTIMIZATION=compact-v1`，只在测试 runner 内包装 `modelRequirementViewService.buildCompactForGeneration()`，不会修改 `src/` 实际系统代码。

该策略在系统当前 compact 结果基础上，从完整 371 条 MRV facts 中补入已存在的低压能量管理相关模型事实，匹配范围包括：

- `HvCoorn_bAllwShutNet`
- `HvCoorn_bAllwSlep`
- `HvCoorn_bTimerWkupReq`
- `HvCoorn_bTimerWkupReqEEW`
- `HvCoorn_bSocWkup`
- `HvCoorn_bSocWkupEEW`
- `HvCoorn_bLbmsLvBatMntnReq`
- `HvCoorn_bRemLvBatMntnReq`
- `HvCoorn_bStartUpReq`
- `HvCoorn_bVehNetWkupEna`
- `HvCoorn_stDCDCModeReq`
- `HvCoorn_bDCDCHvilErr`
- `HvCoorn_ctSmtBatMntnFailEEW`
- `HvCoorn_ctSmtBatMntnSucsEEW`
- `HvCoorn_stRemLvBatMntnFailRsn`
- `HvCoorn_stRemLvBatMntnFailRsnEEW`
- `HvCoorn_pctLbmsSocMntnThd`
- `timer>=10`

## 验证结果

`artifacts/run-20260513-172857` 使用 `RUN_OPTIMIZATION=compact-v1` 干运行，得到 `fixture_compact_generation_v1`：

- factCount：34
- bytes：约 35.9 KB
- 状态与模式：6
- 派生信号定义：24
- 逻辑与条件：1
- 时序与周期：1
- 接口与信号：2

该版本已补回以下模型侧信号：

- `HvCoorn_bAllwShutNet`
- `HvCoorn_bAllwSlep`
- `HvCoorn_bTimerWkupReq`
- `HvCoorn_stDCDCModeReq`
- `HvCoorn_bDCDCHvilErr`
- `HvCoorn_bSocWkup`
- `HvCoorn_stRemLvBatMntnFailRsn`
- `HvCoorn_pctLbmsSocMntnThd`
- `HvCoorn_ctSmtBatMntnFailEEW`

## 仍未覆盖

完整 MRV 本身没有直接包含人工范例中的以下标准表述或阈值：

- `VCU_IntelligentChgSt`
- `90%`
- `2小时`
- `13V`
- `Buck`
- `B9`

因此如果后续 Hermes 生成仍缺少这些内容，优先考虑测试目录内的 skill/prompt 候选优化，而不是把这些值硬塞进 MRV 解析结果。
