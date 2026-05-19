# 低压能量管理 SLX + Hermes 生成对齐完成审计

## 最终结论（2026-05-14）

本目标已完成。full access 后已通过真实 Hermes `openai-codex` provider 生成软件需求，并对同一真实 run 完成最终对比：

- 真实 run：`artifacts/run-20260514-115631`
- 生成稿：`artifacts/run-20260514-115631/hermes-generated-software-requirements.md`
- 对比结果：34/34，`meetsTarget=true`，`placeholderDetected=false`
- HTML 报告：`artifacts/run-20260514-115631/comparison-report.html`
- token usage：model=`gpt-5.4`，totalTokens=498144，costStatus=`included`

## 目标拆解

本轮目标可拆为以下交付物和成功标准：

1. 在测试目录中准备低压能量管理材料：系统需求、人工标题框架、软件需求范例和 `HvCoorn.slx`。
2. 使用当前 SLX 解析器解析 `HvCoorn.slx`，保存解析产物。
3. 结合系统需求、人工标题框架、解析产物和相关 skill，按真实软件需求生成链路调用 Hermes agent。
4. 将 Hermes 生成的软件需求与 `低压能量管理软件需求范例.md` 对比。
5. 如果结果存在差距，先在测试目录中优化解析、MRV 压缩、skill 召回或生成输入，不直接更新真实系统。
6. 最终生成内容需要基本对齐范例。
7. 若判断达标，需要生成左右并列 HTML 报告，并说明达标理由。

## Prompt-to-Artifact 检查表

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| 建立测试专用目录 | `test-fixtures/low-voltage-energy-management/` | 已完成 |
| 放入系统需求文件 | `低压能量管理-系统需求.md` | 已完成 |
| 放入截图提取的软件需求范例 | `低压能量管理软件需求范例.md` | 已完成 |
| 放入人工标题框架文件 | `人工标题框架.md`，内容为 `智能补电 / 智能补电激活判断 / 智能补电退出判断` | 已完成 |
| 放入模型文件 | `HvCoorn.slx` | 已完成 |
| 用当前 SLX 解析器解析 `HvCoorn.slx` | `artifacts/run-20260513-171544/parsed-model-requirement-view.json`，371 条 facts | 已完成 |
| 记录沙箱解析失败根因 | `实验记录.md`，记录 MATLAB MCP watchdog socket 在沙箱内 `bind: operation not permitted` | 已完成 |
| 召回相关 skill 并进入生成输入 | `artifacts/run-20260513-174306/content-input-audit.md` 显示召回 `MOD-低压能量管理-rule_hint-001/002/003` 等 | 已完成 |
| 当前系统 compact 缺口识别 | `artifacts/run-20260513-172526/content-input-audit.md` 与 `candidate-optimizations/compact-v1-analysis.md` | 已完成 |
| 测试目录内候选优化 | `candidate-optimizations/compact-v1-analysis.md`、`candidate-optimizations/compact-v3-analysis.md` | 已完成 |
| 不直接更新真实系统 | 候选优化仅存在于 `run-real-chain.mjs` 测试 runner 和 `candidate-optimizations/` 文档 | 已完成 |
| 推荐输入优化通过审核 | `artifacts/run-20260514-115430/content-input-audit.md`，`compact=v3`，23/23 | 已完成 |
| 授权前导出摘要 | `hermes-export-summary.md`，记录真实 Hermes 生成将接收的输入类别、数量、大小、标题框架和 skill atoms | 已完成 |
| 授权前 preflight | `preflight.mjs` 已执行通过，`preflight-summary.json` 显示 `readyForAuthorizedHermesRun=true`、`blockedOnUserHermesAuthorization=false` | 已完成 |
| Hermes provider gate | `preflight-summary.json` 显示当前 provider 为 `openai-codex`、base URL 为 `https://chatgpt.com/backend-api/codex`、`external=true`、`allowExternalHermes=true`；`run-real-chain.mjs` 未设置 `ALLOW_EXTERNAL_HERMES=1` 时仍会在调用 Hermes 前拒绝真实生成 | 已完成 |
| fixture profile 脱敏 | `preflight-summary.json` 显示 `fixture profile 脱敏核对` 为 `14 files, 0 unredacted keys`；`run-real-chain.mjs` 写入 artifact 时会把非空 `apiKey` 改为 `[REDACTED_IN_FIXTURE]` | 已完成 |
| 对比脚本可判定达标 | `artifacts/report-script-selftest/manual-outline-pass/comparison-evaluation.json`，34/34，`meetsTarget=true` | 已完成 |
| HTML 报告脚本可生成左右并列报告 | `artifacts/report-script-selftest/manual-outline-pass/comparison-report.html` | 已完成 |
| 授权后收尾脚本 | `finalize-real-run.mjs`，已用 `artifacts/report-script-selftest/reference-content-with-manual-outline.md` 自测通过并输出 `finalize-summary.json` | 已完成 |
| dry-run 占位稿拒绝 | `artifacts/run-20260513-174306/finalize-summary.json` 显示 `placeholderDetected=true`、`meetsTarget=false`；`finalize-real-run.mjs` 遇到 `DRY_RUN_PLACEHOLDER` 会失败 | 已完成 |
| 授权后一键执行与收尾 | `run-authorized-and-finalize.mjs` 会先检查 preflight/provider gate，再执行真实生成，并自动调用 `finalize-real-run.mjs` 输出 `authorized-run-summary.json` | 已完成 |
| 真实 Hermes agent 软件需求生成 | `artifacts/run-20260514-115631/generation-task.json`，状态 completed，生成 2 条需求 | 已完成 |
| 生成稿与范例对比 | `artifacts/run-20260514-115631/finalize-summary.json`，34/34，`meetsTarget=true` | 已完成 |
| 达标 HTML 报告 | `artifacts/run-20260514-115631/comparison-report.html` | 已完成 |

## 当前推荐运行路径

真实 Hermes 生成需使用已验证的测试专用输入优化：

```bash
env ALLOW_EXTERNAL_HERMES=1 RUN_STAGE=generate RUN_OPTIMIZATION=compact-v3 PARSED_MRV_PATH=test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json node --disable-warning=ExperimentalWarning test-fixtures/low-voltage-energy-management/run-real-chain.mjs
```

`ALLOW_EXTERNAL_HERMES=1` 仅应在用户已明确授权当前 Hermes CLI 外发范围后设置；未设置时，测试 runner 会在进入 Hermes 前拒绝当前 `openai-codex / https://chatgpt.com/backend-api/codex` provider。

推荐授权后使用一键执行与收尾：

```bash
env ALLOW_EXTERNAL_HERMES=1 RUN_OPTIMIZATION=compact-v3 PARSED_MRV_PATH=test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json node test-fixtures/low-voltage-energy-management/run-authorized-and-finalize.mjs
```

如果只运行真实生成命令，生成后还需要手动使用：

```bash
GENERATED_MD=<run-dir>/hermes-generated-software-requirements.md node test-fixtures/low-voltage-energy-management/compare-and-report.mjs
```

## 阻塞项

无当前阻塞项。此前外部 provider 调用被拒绝，原因是当时 Codex 运行权限不足；用户切换 full access 后，已用显式 `ALLOW_EXTERNAL_HERMES=1` 通过 `openai-codex / https://chatgpt.com/backend-api/codex` 完成真实生成。

测试 runner 仍保留 provider gate：如果未显式设置 `ALLOW_EXTERNAL_HERMES=1`，且当前 Hermes provider 判断为外部 provider，真实生成会在进入 Hermes 前失败。

## Hermes 调用风险核对

本地代码核对结果：

- `src/config.js` 默认 `config.hermes.transport = "cli"`，默认命令为 `hermes`，`content_generate` 超时为 600000ms。
- `src/services/hermes-agent-client.js` 的 CLI 分支会构造 `content_generate` prompt，并通过 `hermes chat -q <prompt> -Q --source tool --max-turns <n> --yolo` 执行。
- `content_generate` prompt 明确包含 `Project`、`Template`、`Required title outline`、`Assets`、`Anchors`、`Model requirement view`、`Task skill bundle` 和 `Recalled skill atoms`。
- `src/services/pipeline-service.js` 会在调用 `content_generate` 前把 compact 后的 `generationModelRequirementView` 放入输入包；本轮最终输入为 `fixture_compact_generation_v3`。
- 因此，真实生成时进入 Hermes 的不是空任务，而是包含系统需求摘要、SLX/MRV 事实、人工标题框架和 skill 内容的完整生成上下文。

授权请求需要覆盖的具体风险：

- 这些测试材料会进入本机 Hermes CLI 当前配置的模型后端。
- prompt 会作为 `hermes chat -q` 的命令参数传给本机 Hermes 进程。
- 本机 `~/.hermes/config.yaml` 显示当前默认 provider 为 `openai-codex`，base URL 为 `https://chatgpt.com/backend-api/codex`；`~/.hermes/auth.json` 显示认证模式为 ChatGPT OAuth。
- 因此当前 Hermes 真实生成会进入 ChatGPT/Codex 后端，不是本地-only 模型。

授权前的输入包摘要已写入 `hermes-export-summary.md`。
