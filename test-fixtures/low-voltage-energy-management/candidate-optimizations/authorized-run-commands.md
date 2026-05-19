# 后续授权运行命令

## 前置产物

当前已完成的解析产物：

```bash
test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json
```

当前推荐的测试专用输入优化：

```bash
RUN_OPTIMIZATION=compact-v3
```

## 真实 Hermes 生成

以下命令会通过真实 `PipelineService.generateForModule()` 调用 Hermes `content_generate`，会把测试目录中的系统需求、人工标题框架、解析/补充后的 MRV 和召回 skill 输入给 Hermes 执行。

当前本机 Hermes 配置核对结果为：

- provider：`openai-codex`
- base URL：`https://chatgpt.com/backend-api/codex`
- auth mode：ChatGPT OAuth

因此该命令不是本地-only 生成，会把上述测试输入包发送到 ChatGPT/Codex 后端。需在用户明确确认允许调用 Hermes CLI 并接受该数据导出风险后运行。

补充核对：仓库测试数据里的应用侧 `ollama` profile 不能覆盖该命令使用的 Hermes CLI active provider。CLI 模式下 `PipelineService` 只把 profile 写入任务记录，真实模型选择由 `~/.hermes/config.yaml` / Hermes CLI 自身决定。若用户希望本地-only 运行，需要先切换并验证 Hermes 自身 provider，而不是只切换应用内 LLM profile。

建议用户确认句：

```text
确认允许调用 Hermes CLI，用 compact-v3 执行真实软件需求生成。
```

授权前可先运行本地 preflight，不会调用 Hermes：

```bash
node test-fixtures/low-voltage-energy-management/preflight.mjs
```

```bash
env ALLOW_EXTERNAL_HERMES=1 RUN_STAGE=generate RUN_OPTIMIZATION=compact-v3 PARSED_MRV_PATH=test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json node --disable-warning=ExperimentalWarning test-fixtures/low-voltage-energy-management/run-real-chain.mjs
```

## 生成后对比与报告

推荐授权后直接使用一键 runner，它会先检查 preflight/provider gate，再执行真实生成，随后自动运行 `finalize-real-run.mjs`：

```bash
env ALLOW_EXTERNAL_HERMES=1 RUN_OPTIMIZATION=compact-v3 PARSED_MRV_PATH=test-fixtures/low-voltage-energy-management/artifacts/run-20260513-171544/parsed-model-requirement-view.json node test-fixtures/low-voltage-energy-management/run-authorized-and-finalize.mjs
```

若 provider gate 仍阻塞，该脚本会在调用 Hermes 前失败。

将 `<run-dir>` 替换为真实生成命令输出的运行目录：

```bash
GENERATED_MD=<run-dir>/hermes-generated-software-requirements.md node test-fixtures/low-voltage-energy-management/compare-and-report.mjs
```

推荐直接使用一键收尾脚本，它会检查生成稿、执行对比、验证达标 HTML 是否生成，并输出 `finalize-summary.json`：

```bash
RUN_DIR=<run-dir> node test-fixtures/low-voltage-energy-management/finalize-real-run.mjs
```

收尾脚本还有一个真实输出 gate：若生成稿仍包含 `DRY_RUN_PLACEHOLDER`，会写出 `placeholderDetected=true` 的 `finalize-summary.json` 后失败，避免把 dry-run 占位稿误判为达标。

若脚本输出 `meetsTarget: true`，同目录会生成：

```bash
comparison-report.html
comparison-evaluation.json
finalize-summary.json
```

`comparison-report.html` 会左右并列展示 Hermes 生成稿和人工范例，并说明达标判断依据。
