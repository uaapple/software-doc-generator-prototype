# compact-v2 测试候选优化

## 背景

`compact-v1` 能把完整 MRV 中已存在的智能补电相关模型信号补回 `content_generate` 输入包，但进一步核对原始 `HvCoorn.slx` 后发现，模型 XML 中还有 DCDC Buck 相关状态、请求和标定名没有出现在当前解析 MRV 中。

这些内容与人工范例中的“DCDC 15s 未 Buck”退出条件高度相关，因此更适合作为解析侧补充候选，而不是让生成环节凭空补写。

## 测试专用优化

`run-real-chain.mjs` 增加 `RUN_OPTIMIZATION=compact-v2`：

- 先沿用 `compact-v1` 的测试专用 compact 补充策略。
- 额外扫描测试目录中的 `HvCoorn.slx` 原始 zip XML。
- 仅把原始模型中确实命中的 DCDC Buck 词条写成一条补充 fact：`fixture_raw_slx_dcdc_buck_calibrations`。
- `fixture_raw_*` fact 在 compact 补充阶段优先入包，避免被普通模型事实数量上限挤掉。
- 该逻辑只存在于测试 runner 中，不修改 `src/` 真实系统代码。

## 原始 SLX 命中项

`artifacts/run-20260513-174306/raw-slx-supplement-facts.json` 记录了当前命中的模型侧词条：

- `DCDCActSt_buck`
- `DCDCReqSt_buck`
- `VoltMod_stDCBuck_SC`
- `HvCoorn_tiMaxWait4DCBuck_C`
- `HvCoorn_tiMntnFailNoBuckThd_C`
- `HvCoorn_tiRemMntnDcdcNoBuckEx_C`
- `HvCoorn_tiRemMntnDCBuckRst_C`
- `HvCoorn_bHVReq2DCBuck`
- `HvCoorn_bDCBuck2Rdy`
- `HvCoorn_bDCBuck2Shtdwn`
- `HvCoorn_bDCBuck2Dft`
- `HvCoorn_bHvCnt2DCBuck`
- `HvCoorn_bDCBuck2EngStrt`

## dry-run 验证结果

`artifacts/run-20260513-174306` 使用 `RUN_OPTIMIZATION=compact-v2` 干运行，未调用真实 Hermes 内容生成。

- compact 策略：`fixture_compact_generation_v2`
- compact facts：34
- compact bytes：约 36.6 KB
- 审核通过：23/23
- 新增通过项：DCDC Buck 状态/请求、DCDC Buck 超时/失败标定

## 仍需生成侧验证

当前输入包仍未显式出现人工范例中的以下内容：

- `EBS_SOC>=90%`
- `EBS_U_BATT<13V`
- `B9`

如果真实 Hermes 生成结果缺失这些项，需要优先检查相关 skill/prompt 是否应把它们作为低压能量管理软件需求范例中的经验规则或退出逻辑补充，而不是把这些值伪造成 SLX 解析事实。
