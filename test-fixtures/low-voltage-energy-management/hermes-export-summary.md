# Hermes content_generate 导出摘要

本文件用于说明授权后真实 `Hermes CLI` 生成会接收哪些类别的输入。它来自 dry-run 产物：

```bash
artifacts/run-20260513-174306/dry-run-content-generate-input-artifact.json
```

该 dry-run 未调用 Hermes，只保存了准备交给 `content_generate` 的输入包。

## 运行上下文

- runId：`run-20260513-174306`
- stage：`dry-run`
- optimizationMode：`compact-v2`
- transport：`cli`
- 预计真实命令：`hermes chat -q <content_generate prompt> -Q --source tool --max-turns <n> --yolo`

## 输入包大小

- `dry-run-content-generate-input-artifact.json`：约 88 KB
- `dry-run-content-generate-payload.json`：约 196 KB
- `dry-run-skill-inventory.json`：约 92 KB

## 输入包顶层结构

真实 `content_generate` prompt 会包含以下顶层部分：

- `project`
- `template`
- `assets`
- `anchors`
- `recalledAtoms`
- `modelRequirementView`
- `requiredTitleOutline`
- `requiredLeafCount`
- `skillBundle`

## 项目与标题框架

- 项目/模块：`低压能量管理 SLX Hermes 对齐测试 / 低压能量管理`
- 文档类型：`software_requirement`
- 领域：`embedded_vcu`
- 模块技能键：`低压能量管理`
- 生成叶子数：2

标题框架：

```text
智能补电
  - 智能补电激活判断
  - 智能补电退出判断
```

## 资产与证据

- assetCount：1
- anchorCount：1
- 资产来源：测试目录中的 `低压能量管理-系统需求.md`
- 模型证据：`model_requirement_view_json`，来自已解析的 `HvCoorn.slx` MRV 产物

## compact MRV

- compact 策略：`fixture_compact_generation_v2`
- 原始/补充后 MRV facts：373
- 进入生成输入的 compact facts：34
- base facts：16
- supplement facts：18
- 包含测试专用补充 fact：`fixture_raw_slx_dcdc_buck_calibrations`

`compact-v2` 的作用：

- 保留当前系统 compact 结果。
- 从完整 MRV 中补入智能补电相关模型信号。
- 从原始 `HvCoorn.slx` XML 中补入 DCDC Buck 状态/请求/标定名。
- 该逻辑仅存在于测试 runner，不修改真实系统代码。

## 召回 skill atoms

真实输入包会携带 24 条 recalled skill atoms，包含：

- `MOD-低压能量管理-rule_hint-001`
- `MOD-低压能量管理-rule_hint-002`
- `MOD-低压能量管理-rule_hint-003`
- `MOD-低压能量管理-generation_priority-001`
- `MOD-低压能量管理-generation_priority-002`
- `MOD-低压能量管理-generation_priority-003`
- `MOD-低压能量管理-generation_priority-004`
- `MOD-低压能量管理-generation_priority-005`
- `MOD-低压能量管理-source_policy_setting-001`
- `MOD-低压能量管理-source_policy_setting-002`
- `MOD-低压能量管理-source_policy_setting-003`
- `MOD-低压能量管理-source_policy_setting-004`
- `MOD-低压能量管理-source_policy_setting-005`
- `MOD-低压能量管理-source_policy_setting-006`
- `MOD-低压能量管理-anti_pattern-001`
- `MOD-低压能量管理-anti_pattern-002`
- `MOD-低压能量管理-anti_pattern-003`
- `MOD-低压能量管理-anti_pattern-004`
- `MOD-低压能量管理-anti_pattern-005`
- `MOD-低压能量管理-anti_pattern-006`
- `DOC-software_requirement-rule_hint-001`
- `DOM-embedded_vcu-source_policy_setting-001`
- `DOM-embedded_vcu-source_policy_setting-002`
- `DOM-embedded_vcu-source_alias-001`

## 授权风险

授权真实生成即表示允许上述输入包内容进入本机 Hermes CLI 当前配置的模型链路。当前仓库代码无法单独证明 Hermes 后端一定是本地模型或受信内部服务。

本机 Hermes 配置核对结果：

- 默认 provider：`openai-codex`
- base URL：`https://chatgpt.com/backend-api/codex`
- auth mode：ChatGPT OAuth

因此，当前真实生成会进入 ChatGPT/Codex 后端，不是本地-only 模型。

## 本地-only 替代核对

测试数据中的 `llm-profiles.json` 虽包含应用侧 `ollama` profile，但本轮 `RUN_STAGE=generate` 使用的是 Hermes CLI 传输。代码路径为：

- `run-real-chain.mjs` 调用真实 `PipelineService.generateForModule()`
- `PipelineService.finalizeSoftwareRequirementGeneration()` 在 CLI 模式下将模型记录为 `configured-in-hermes`
- `HermesAgentClient.executeCliStep()` 通过 `hermes chat -q <prompt> ...` 执行

因此应用侧 `llmProfile` 不能覆盖 Hermes CLI 的 active provider。若要避免外发，需要先把 Hermes 自身配置切到一个已验证的本地-only provider，再重新核对 `~/.hermes/config.yaml` / `~/.hermes/auth.json` 后运行。

## 运行守门

测试 runner 已增加 provider gate：当前 Hermes provider 被判断为外部 provider 且未设置 `ALLOW_EXTERNAL_HERMES=1` 时，`RUN_STAGE=generate` 会在调用 Hermes CLI 之前失败。该环境变量只用于标记用户已明确授权当前外发范围，不应在未授权时设置。

收尾脚本也已增加真实输出 gate：`finalize-real-run.mjs` 会拒绝包含 `DRY_RUN_PLACEHOLDER` 的生成稿，要求使用真实 Hermes 输出后再进行达标判断和 HTML 报告生成。

在用户明确确认前，不应执行真实 `Hermes CLI` 生成命令。
