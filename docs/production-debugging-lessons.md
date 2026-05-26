# 生产调试部署经验记录

本文档记录 2026-05-26 这轮生产调试和部署拆分中踩过的坑，以及后续复用时应优先检查的经验。范围包括 `release/linux-prod`、`release/windows-prod`、SLX 解释器、Hermes OpenAI-compatible API Server、Windows Hermes Agent/MATLAB Worker，以及单元测试 TCSD Excel 生成链路。

## 快速结论

- 本地 `feat/slx-parser-integration` 是 Mac 开发分支的镜像输入，不应在 Windows 本机直接修改。生产改动应落到 `C:\sdg-linux` 的 `release/linux-prod` 和 `C:\sdg-rwp` 的 `release/windows-prod`。
- Linux 生产端只负责平台页面、任务状态、文件接收/下载和 HTTP 调度；MATLAB、SATK、MCP、Hermes CLI 工具执行都应发生在 Windows VM。
- 项目 Hermes Agent `:3101` 和 Hermes 内置 OpenAI-compatible API Server `:8642` 是两条不同通道。`3101` 走项目自定义 `/internal/steps/execute`，`8642` 走 Hermes `/v1/runs`。
- 如果 Windows Hermes API Server 明确启用 no-key 模式，Linux 不需要配置 `HERMES_OPENAI_API_KEY`，也不应发送 `Authorization` 头。
- TCSD 生成是长任务，必须同时处理 HTTP 超时、Hermes CLI turn 上限、MATLAB 首次启动耗时、非严格 JSON 返回、以及 Windows 侧产物回传。
- 任何 API key、Hermes token、Windows 登录凭据、MATLAB/MCP token 都不得写入仓库、文档、提交信息或日志。

## 分支和拆分

1. 先确认当前 worktree。

   ```powershell
   git status --short --branch
   ```

   看到 `feat/slx-parser-integration` 时只读，不在该 worktree 落地生产改动。

2. Linux 生产改动在：

   ```text
   C:\sdg-linux
   release/linux-prod
   ```

   Windows Worker 改动在：

   ```text
   C:\sdg-rwp
   release/windows-prod
   ```

3. 从开发分支拆改动时，先看提交 body 和 `docs/deployment-split-handoff.md` 的目标说明，再运行分类器辅助判断。

   ```bash
   npm run classify:changes -- <base>..<head> --allow-ambiguous
   ```

4. `shared` 不等于机械两边全拷贝。要看运行边界：平台页面、Linux API、生产 env 示例进 Linux；Windows Worker 服务、Hermes CLI/MATLAB 执行、安装/更新脚本进 Windows；协议、客户端、测试通常两边都要。

5. 运行态数据不要进 release 分支。特别注意 `data/skills.sqlite`、`data/skill-rules/bundle-base.json`、`data/projects/**`、`data/unit-test-case-generation/**`、`release-dist/**`。测试或调试可能把这些文件弄脏，提交前必须单独确认。

## Linux 和 Windows 边界

- Linux 生产端必须通过 HTTP 调 Windows VM，不在 Linux 上直接跑 `hermes` 或 MATLAB MCP stdio。
- Windows VM 是工具宿主机。Hermes CLI、MATLAB、SATK、MCP server、`simulink-ut-tcsd-generator` skill 都应在 Windows VM 可见。
- Linux 传给 Windows 的路径不能默认复用 Linux 绝对路径。如果两边没有共享盘，需要用 multipart 上传、受控下载 URL，或设置 `UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT` 做路径映射。
- 最小验证可以用 Linux 临时 HTTP 服务暴露 SLX，但生产链路应使用受控下载接口、multipart 文件投递或明确的共享目录。

## Hermes API Server

1. 不要把 `http://<windows-vm>:3101` 当成 Hermes OpenAI API。`/v1/models` 返回 404 时，多半说明打到了项目 Agent。

2. OpenAI-compatible API Server 本次跑通的是 `http://<windows-vm>:8642`。健康检查顺序：

   ```bash
   curl -sS http://<windows-vm>:8642/health
   curl -sS http://<windows-vm>:8642/v1/models
   ```

3. no-key 模式下，Windows 侧 `API_SERVER_KEY` 为空，Hermes 本体可监听 `127.0.0.1:8643`，再由 Windows `portproxy` 对外暴露 `8642`。Linux 侧不需要 API key。

4. `/v1/chat/completions` 不是纯模型补全入口，可能进入工具调用和多轮 agent loop。长任务和需要工具证据的任务优先使用 `/v1/runs`，再轮询 run 状态和事件。

5. 只看最终回答不够。要看 `/v1/runs/<run_id>/events` 或任务 debug，确认工具确实在 Windows API-server host 上执行，并且 evidence 来自 MATLAB/SATK 或 MCP 工具。

## Windows 脚本和环境

- Windows VM 可能仍是 Windows PowerShell 5.1。脚本里不要依赖较新 .NET API，例如 `RandomNumberGenerator.Fill`；兼容写法是 `RandomNumberGenerator.Create().GetBytes(...)`。
- PowerShell 到远端 Bash 的 here-string 容易混入 CRLF，导致脚本路径尾部带 `\r` 或 here-doc 结束符失效。复杂远端脚本优先写成 LF 临时文件，再用 `plink -m` 执行。
- Provider key 名称要和 Hermes runtime 期望一致。Windows active profile 里有通用 key 不代表 provider 可用，runner 需要在进程环境里补 provider 专用 alias，但不能打印 key。
- Windows Worker 服务启动时要加载 Hermes LLM secrets 和 active profile。只改文件不重启计划任务或服务，通常不会生效。
- Hermes CLI 要用 Windows-safe launcher 调用，避免 `cmd.exe` 对 prompt、引号和换行做二次拆分。
- 嵌入式 Hermes CLI 要设置正确的 `HERMES_HOME`/配置目录，否则会读不到 profile、state db 或 secrets。
- DNS 名称可能在 Linux 到 Windows 方向间歇失败。长任务轮询时，如果 hostname 不稳定，优先切当前 IP 或修 Linux hosts/DNS。

## TCSD 生成链路

1. 入口页面是 `/unit-test-case-generation`。平台端接收 `.slx` 和 `.mat`，创建 `data/unit-test-case-generation/tasks/<taskId>/workspace`，再调用 Hermes step `simulink_ut_tcsd_generate`。

2. 生产配置要给长任务留足空间：

   ```dotenv
   HERMES_TIMEOUT_SIMULINK_UT_TCSD_GENERATE_MS=3600000
   HERMES_MAX_TURNS_SIMULINK_UT_TCSD_GENERATE=10000
   UNIT_TEST_CASE_SKILL_NAME=simulink-ut-tcsd-generator
   UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN=outputs/*_tcsd.xlsx
   ```

   本地 sidecar 或 Windows Agent 还要避免 HTTP server 在 5 分钟左右中断长连接，必要时设置 `HERMES_SERVER_REQUEST_TIMEOUT_MS=0`。

3. skill 产物必须落在 `outputs/*.xlsx`。后端只登记这个范围内的 Excel，避免把任意 Windows 路径或临时文件暴露给平台下载。

4. Hermes CLI 不一定返回严格 JSON。当前兜底策略是：如果 stdout/stderr 不能解析成 JSON，但 `outputs/` 下已经有 `.xlsx`，后端仍回收产物并登记结果。

5. multipart 远程调用时，不能只返回 Windows 侧绝对路径。Windows Agent 需要把 `outputs/*.xlsx` 读成受限大小的 base64 `outputFiles`，Linux 客户端再写回本地 task workspace。否则 UI 会看到 Hermes 成功但下载列表为空。

6. `execute_code` 的隔离 Python 环境不一定有 `openpyxl`。TCSD skill 需要用终端里的 Python 执行 `scripts/build_tcsd_from_json.py`，确保能访问已安装依赖。

7. MATLAB/SATK 不稳定或仿真回填失败时，仍应生成带 warnings 的 best-effort workbook，而不是整个任务无 Excel 失败。验证目标先是产物闭环，再逐步提高用例质量。

## Windows Worker 部署

- 日常更新优先走 source update 包，不要每次都完整重装 Windows Worker。
- source update 包需要保留外置配置、LLM secrets、MATLAB/MCP 配置、Hermes CLI 安装，以及计划任务设置。
- SLX 交互解释和 TCSD 都依赖真正的 Hermes CLI。打包或部署时要确认 VM `PATH` 中已有 `hermes`，或把 Hermes portable/installer 放入 `offline-installers/hermes`。
- 部署完成后至少检查：

  ```powershell
  Invoke-RestMethod http://127.0.0.1:3101/api/health
  Invoke-RestMethod http://127.0.0.1:5100/health
  ```

- 如果 Windows 防火墙或服务账号策略阻止 MATLAB 启动，先在 VM 本机验证 MATLAB executable、MCP server command、工作目录和权限。

## 验证顺序

1. 在 Linux 生产端确认服务健康、项目数据目录仍指向外置 `prod-data`。
2. 从 Linux 调 Windows Worker debug health，确认 `3101` 和 `5100` 都可达。
3. 在 Windows VM 本机确认 Hermes Agent 和 MATLAB Worker health。
4. 用小模型先跑 SLX/MATLAB 连通性，再跑 `ESCWhlTq` 或 `EMTqFil` 这类真实模型。
5. TCSD 验证时打开 `/unit-test-case-generation`，上传匹配的 `.slx` 和 `.mat`，等待任务完成后下载 Excel。
6. 如果任务失败，优先看任务 debug/runtime events、Windows Worker 日志、Hermes session id、`outputs/` 是否实际生成文件。
7. 验证完成后清理临时 HTTP server、临时模型文件和不需要保留的 runtime workspace；不要把生成的 `.xlsx` 提交进 release 分支。

## 常见症状和判断

- `/v1/models` 返回 404：打到了项目 Agent `3101`，不是 Hermes OpenAI API Server。
- `/v1/models` 返回 401：Windows API Server 启用了 key，Linux 需要配置 key，或改成 no-key 模式并重启 API Server。
- Hermes 上游 401：通常是 provider 专用 key 没有进进程环境，不是 Linux 到 Windows 的鉴权问题。
- 上游报空 model：Windows Hermes `config.yaml` 没写入 `model.provider` 和 `model.default`。
- `Invalid JSON` 但本地 JSON 校验通过：优先排查 shell quoting、CRLF 和传输命令。
- 任务长时间运行后 HTTP 断开：检查 request timeout、server timeout、Hermes step timeout 和 max turns。
- Hermes 成功但平台无下载：检查 Windows Agent 是否把 `outputs/*.xlsx` 回传为 `outputFiles.contentBase64`，以及 Linux 是否物化到本地 workspace。
- 生产项目消失：先查 `APP_DATA_DIR`、`APP_SKILLS_DIR` 是否仍指向 `/opt/software-doc-generator/prod-data` 和 `/opt/software-doc-generator/prod-skills`，不要先假设数据被删。

## 提交前检查

```powershell
git status --short --branch
git diff --stat
git diff --name-status
```

确认只包含本次目标文件。生产分支尤其要确认没有混入：

- `.env`
- `release-dist/**`
- `data/projects/**`
- `data/uploads/**`
- `data/unit-test-case-generation/**`
- `data/skills.sqlite`
- `data/skill-rules/bundle-base.json`

