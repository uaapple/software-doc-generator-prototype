# Hermes OpenAI API Server 调 Windows MATLAB MCP 验证记录

## 背景和目标

这次最小验证的目标不是修复项目内现有 SLX 解释接口，而是单独跑通一条更直接的链路：

1. Linux 后端或 Linux VM 作为调用方。
2. Windows VM 上启动 Hermes 内置 OpenAI-compatible API Server。
3. Linux 像调用 OpenAI API 一样调用 Windows Hermes。
4. 工具实际在 API Server 所在机器执行，也就是 Windows VM。
5. Windows 侧 Hermes 通过 MATLAB MCP/SATK 读取 `ESCWhlTq.slx`，回答模型顶层输入输出。

本次验证明确避开项目自带的 `http://Wx11v-PRJ130.itk.local:3101/internal/steps/execute`。`3101` 是项目部署包里的 Express Agent 服务，不是 Hermes 内置 `/v1/*` OpenAI-compatible API Server。

## 最终跑通的链路

实际跑通的链路如下：

```text
Linux VM
  POST /v1/runs
  |
  v
Windows Hermes OpenAI-compatible API Server :8642
  |
  |-- terminal 工具：从 Linux 临时 HTTP 地址下载 ESCWhlTq.slx
  |
  |-- matlab_satk MCP 工具：调用 MATLAB/SATK 读取模型
  |
  v
Linux VM
  GET /v1/runs/{run_id}
  取得最终 JSON 结果
```

关键证据：

- Linux 侧调用的是 Windows Hermes `POST /v1/runs`。
- Windows 侧事件流显示 `terminal` 工具下载了 `ESCWhlTq.slx`。
- Hermes 最终结果中的 `evidence_tool` 是 `mcp_matlab_satk_evaluate_matlab_code`。
- Windows 文件落点为 `C:\SoftwareDocWorker\tmp\hermes-openapi-validation\ESCWhlTq.slx`。

## Windows API Server 拉起方式

本次使用独立脚本拉起 Windows Hermes 内置 API Server：

- 脚本路径：`scripts/Enable-HermesOpenApiServer.ps1`
- 默认安装根目录：`C:\SoftwareDocWorker`
- API Server 默认监听：`0.0.0.0:8642`
- 计划任务名：`SoftwareDocHermesOpenApiServer`
- API key 默认存放：`C:\SoftwareDocWorker\config\hermes-api-server.env`；如果明确使用 `-AllowNoApiKey`，则 `API_SERVER_KEY` 写为空，Hermes 本体监听 `127.0.0.1:8643`，Windows `portproxy` 对外暴露 `8642`，Linux 调用 `:8642` 时不需要 `Authorization` 头。

脚本做了几件关键事情：

- 读取部署包已有的 `software-doc-worker.env`、`hermes-llm.active.env`。
- 使用 Hermes 自带 Python runtime 安装或确认 `aiohttp`、`PyYAML`。
- 更新 Hermes `config.yaml`，启用 `platform_toolsets.api_server`。
- 注册 `mcp_servers.matlab_satk`，指向部署包里的 `matlab-mcp-core-server.exe`。
- 从当前 LLM active profile 写入 `model.provider` 和 `model.default`，避免 API Server 启动后模型为空。
- 只为 Linux VM 来源开放 Windows 防火墙 `8642` 端口。

## 验证步骤

1. 在 Windows VM 上执行 API Server 启动脚本。

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Enable-HermesOpenApiServer.ps1 -AllowNoApiKey
   ```

   如果 API Server 已经在运行，也可以只关闭 key 鉴权、启用 `8642 -> 8643` 端口转发并重启计划任务：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Disable-HermesOpenApiServerKey.ps1
   ```

2. 从 Linux VM 验证 API Server 健康状态和模型列表。

   ```bash
   curl -sS http://<windows-vm>:8642/health
   curl -sS http://<windows-vm>:8642/v1/models
   ```

3. 将 `ESCWhlTq.slx` 放到 Linux VM。

   本次验证文件位于 Linux：

   ```text
   /home/itkuser/ESCWhlTq.slx
   ```

4. Linux VM 临时暴露文件，供 Windows Hermes 工具下载。

   ```bash
   mkdir -p /tmp/hermes-openapi-validation
   cp /home/itkuser/ESCWhlTq.slx /tmp/hermes-openapi-validation/ESCWhlTq.slx
   python3 -m http.server 18080 --bind 0.0.0.0 --directory /tmp/hermes-openapi-validation
   ```

5. 从 Windows VM 验证可以访问 Linux 文件地址。

   ```powershell
   Invoke-WebRequest -UseBasicParsing -Method Head `
     -Uri 'http://10.36.77.221:18080/ESCWhlTq.slx'
   ```

6. 从 Linux VM 调用 Windows Hermes `/v1/runs`。

   推荐使用 `/v1/runs`，不要用普通非流式 `/v1/chat/completions` 做长任务。请求示例：

   ```json
   {
     "model": "deepseek-v4-pro",
     "session_id": "slx-openapi-validation-<timestamp>",
     "instructions": "You are running on the Windows Hermes API-server host. Do not call the project-specific /internal/steps/execute interface. Tools execute on Windows. Use the matlab_satk MCP tools/SATK or MATLAB via that MCP where possible. Do not guess; verify with tool output.",
     "input": "Download http://10.36.77.221:18080/ESCWhlTq.slx to C:\\SoftwareDocWorker\\tmp\\hermes-openapi-validation\\ESCWhlTq.slx, then use MATLAB/SATK through matlab_satk MCP to list top-level Inport and Outport block names in port order. Return concise JSON."
   }
   ```

7. 轮询结果。

   ```bash
   curl -sS \
     http://<windows-vm>:8642/v1/runs/<run_id>
   ```

8. 如遇工具审批，使用审批接口。

   ```bash
   curl -sS -X POST \
     -H "Content-Type: application/json" \
     -d '{"choice":"session","resolve_all":true}' \
     http://<windows-vm>:8642/v1/runs/<run_id>/approval
   ```

9. 验证结束后关闭 Linux 临时文件服务。

   ```bash
   pkill -f "http.server 18080"
   ```

## 踩过的坑

### 1. 把项目 Agent 端口误认为 Hermes 内置 API Server

`http://Wx11v-PRJ130.itk.local:3101` 是项目自带的 Express Agent，不提供 Hermes 内置 `/v1/chat/completions`、`/v1/models`。对它请求 `/v1/*` 会得到 404。

经验：先用 `/health`、`/v1/models`、`/v1/capabilities` 区分服务身份。真正的 Hermes OpenAI-compatible API Server 本次跑在 `8642`。

### 2. Windows PowerShell 5.1 不支持 `RandomNumberGenerator.Fill`

最初生成 API key 时用了：

```powershell
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
```

在 Windows PowerShell 5.1 上会报方法不存在。兼容写法是：

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
} finally {
  $rng.Dispose()
}
```

经验：Windows VM 上的系统 PowerShell 仍可能是 5.1，脚本尽量避免只在新 .NET 上可用的 API。

### 3. Hermes embedded Python 依赖不一定齐全

Hermes API Server 需要 `aiohttp`，更新 YAML 配置需要 `PyYAML`。部署包带的 Hermes Python runtime 不应假设这些包一定已经存在。

经验：启动脚本要用 Hermes 自带 Python 检查并补齐依赖，不要装到系统 Python。

### 4. LLM API key 环境变量名和 provider 期望不一致

Windows active LLM 配置里 `OPENAI_API_KEY` 已有值，但 provider 为 `deepseek` 时 Hermes runtime 会找 provider 专用 key，例如 `DEEPSEEK_API_KEY`。第一次调用模型因此出现上游 401。

经验：启动 API Server 的 runner 应做进程内 alias：

- `deepseek`：从 active key 复制到 `DEEPSEEK_API_KEY`
- `glm`、`zai`、`zhipu`：复制到 `GLM_API_KEY`、`ZAI_API_KEY`
- `kimi-coding`：复制到 `KIMI_API_KEY`

注意：只在进程环境中补 alias，不把 key 打印到日志，也不写入文档。

### 5. Hermes 模型名为空会导致上游 400/502

修完 key 后又遇到模型为空的问题，上游返回类似“支持 deepseek-v4-pro 或 deepseek-v4-flash，但请求传了空 model”。

经验：仅设置 API Server 暴露的 model name 不够，还要让 Hermes runtime 能解析实际 provider/model。脚本需要写入 Hermes `config.yaml`：

```yaml
model:
  provider: deepseek
  default: deepseek-v4-pro
```

### 6. `/v1/chat/completions` 不是纯模型补全

Hermes 的 Chat Completions 入口会创建 server-side AIAgent，并按 `platform_toolsets.api_server` 加载工具。即使用“只回复 OK”的 smoke prompt，也可能进入工具调用和多轮 agent loop。

经验：

- 简单连通性可以用 `/health`、`/v1/models`。
- 需要跑工具任务时优先用 `/v1/runs`。
- `/v1/runs` 能立即返回 `run_id`，适合轮询、事件流、审批和停止。
- 当前 Hermes API Server 不把 OpenAI 的 `tool_choice` 当作可靠的工具禁用或工具强制选择机制。

### 7. 从 PowerShell 拼远端 Bash 容易混入 CRLF

多次远端命令出现了路径末尾带 `\r` 的问题，例如：

```text
No such file or directory: '/tmp/hermes-openapi-validation/start_run.py\r'
```

也出现过 here-doc 结束符被 CRLF 破坏，导致 Python 脚本尾部多出 `PY`。

经验：

- 复杂 Linux 远端脚本不要直接靠 PowerShell here-string 管道拼接。
- 更稳的做法是本地生成临时 `.sh`，用 UTF-8 no BOM 和 LF 写入，再用 `plink -m` 执行。
- JSON 请求体和 Python 脚本可以 base64 传输，降低 shell quoting 风险。

### 8. Linux 侧 `curl --data-binary` 的 Invalid JSON 不一定是 JSON 本身坏了

本次遇到 Linux 文件里 `python3 -m json.tool` 校验通过，但 API Server 仍返回 `Invalid JSON`。根因更可能是远端命令拼接、换行、quoting 或 CRLF 污染，而不是业务 JSON 结构。

经验：当 JSON 文件本地校验通过但服务端说无效时，先排查传输命令本身。最终改为 Linux 上用 Python `urllib.request` POST，同一份 JSON 就能正常启动 run。

### 9. DNS 名称在 Linux 到 Windows 方向可能间歇失败

轮询 run 状态时，Linux 偶发无法解析 `Wx11v-PRJ130.itk.local`。改用 Windows VM 当前 IP 后轮询正常。

经验：

- 初始验证可以用 hostname，失败时立刻切 IP。
- 长任务轮询建议用 IP 或确保 Linux DNS/hosts 稳定。
- 文档和脚本里要把“服务发现失败”和“API Server 挂了”区分开。

### 10. `pscp` 可能失败，`psftp` 更稳

上传 SLX 到 Linux 时，`pscp` 可能报 `Cannot assign requested address`。

经验：部署文档里提到的 `psftp` batch 方式更稳定，遇到 `pscp` 失败可以直接切 `psftp`。

### 11. 工具执行位置必须用事件流确认

只看最终答案不够，因为模型可能猜。事件流能看到实际工具：

- `tool.started terminal`：Windows 侧下载 Linux 文件。
- `tool.completed terminal`：下载完成。
- 最终 evidence 使用 `mcp_matlab_satk_evaluate_matlab_code`。

经验：最小验证最好同时记录 `/v1/runs/{run_id}/events`，这是证明“工具在 Windows API-server host 上执行”的关键证据。

### 12. 临时文件服务要及时清理

为了证明“文件从 Linux 部署到 Windows”，本次在 Linux 开了临时 `python3 -m http.server 18080`。验证完成后已停止。

经验：这类临时服务只用于最小验证，不应作为生产长期文件传输方案。生产化时应改成明确的文件投递、对象存储、共享目录、或后端受控下载接口。

## 推荐复现策略

下次要复现或扩展这个链路，建议按以下顺序做：

1. Windows VM 上确认 `8642` API Server 存活。
2. Linux VM 上先请求 `/v1/models`，确认认证和 model name。
3. Linux 上准备 SLX 文件，并用临时 HTTP 或正式文件服务暴露。
4. Windows VM 上先 `HEAD` Linux 文件 URL，确认反向可达。
5. Linux 调 `/v1/runs`，不要一上来用非流式 `/v1/chat/completions`。
6. 轮询 `/v1/runs/{run_id}`，必要时接 `/events`。
7. 如果状态变成 `waiting_for_approval`，走 `/approval`。
8. 以工具事件和 `evidence_tool` 判断任务是否真的通过 MATLAB MCP/SATK 完成。
9. 清理 Linux 临时 HTTP 服务和 Windows 临时模型文件。

## 接入生产 SLX 解释器

本次经验已经沉淀为生产 SLX 解释器的一条可配置执行路径。启用后，仅 `/slx-interpreter` 的交互问答步骤 `slx_interpret_answer` 会走 Windows Hermes 内置 OpenAI-compatible API Server；其他 Hermes 生成步骤仍保持原有 `HERMES_TRANSPORT` 行为。

Linux 生产 `.env.production` 推荐配置：

```dotenv
APP_PUBLIC_BASE_URL=http://10.36.77.221:3000

HERMES_TRANSPORT=api
HERMES_BASE_URL=http://Wx11v-PRJ130.itk.local:3101

HERMES_SLX_INTERPRETER_TRANSPORT=openai-api
HERMES_OPENAI_API_BASE_URL=http://Wx11v-PRJ130.itk.local:8642
HERMES_OPENAI_API_MODEL=deepseek-v4-pro
HERMES_OPENAI_API_AUTO_APPROVE=true
HERMES_OPENAI_API_POLL_INTERVAL_MS=5000
HERMES_TIMEOUT_SLX_INTERPRET_ANSWER_MS=600000
```

实现要点：

- Linux 后端为模块资产新增受控下载端点：
  - `GET /api/projects/:projectId/modules/:moduleId/assets/:assetId/download`
- `PipelineService.interpretSlxForModule()` 会把 `downloadUrl` 放入 SLX interpreter 的 model artifact。
- `HermesAgentClient` 在 `HERMES_SLX_INTERPRETER_TRANSPORT=openai-api` 时，会：
  - `POST /v1/runs` 启动 Windows Hermes run。
  - 轮询 `GET /v1/runs/{run_id}`。
  - 遇到 `waiting_for_approval` 时按配置调用 `/approval`。
  - 从 run 的 `output` 解析严格 JSON，并复用原有 `slx_interpret_answer` artifact 规范。
- Prompt 明确告诉 Windows Hermes：
  - 工具运行在 API-server host。
  - 不要调用项目内部 `/internal/steps/execute`。
  - 如存在 `downloadUrl`，先下载到 Windows 本地，再通过 MATLAB MCP/SATK 分析。

验证时优先看任务 debug：

- `debug.agent.transport` 应为 `openai-api`。
- `debug.agent.sessionId` 应为 Hermes `run_id`。
- runtime events 应出现 `Hermes OpenAI API run accepted/status/completed`。
- 回答 evidence 应引用 `simulink_slx` 文件和 MATLAB/SATK 相关 scope。

## 本次模型解析结果

模型：`ESCWhlTq`

顶层输入共 56 个：

```text
fc_ESCWhlTq
icesc_bFrntAxleTqDecActv
icesc_bFrntAxleTqIncActv
icesc_bReAxleTqDecActv
icesc_bReAxleTqIncActv
icesc_tqReqFrntAxleDec
icesc_tqReqReAxleDec
icesc_tqReqFrntAxleInc
icesc_tqReqReAxleInc
icesc_bFrntAxleRBSTqActv
icesc_bReAxleRBSTqActv
icesc_tqRBSReqFrntAxle
icesc_tqRBSReqReAxle
TqSpltArbt_tqTarFrntAxle
TqSpltArbt_tqTarReAxle
PwrLimEM_tqMaxFrntAxle
PwrLimEM_tqMinFrntAxle
PwrLimEM_tqMaxReAxle
PwrLimEM_tqMinReAxle
VehCfg_stRBCCtrlModeSel
icesc_bABSActv
icesc_bEBDActv
icadas_bAEBActv
icesc_bCDPActv
ParkCtrl_bAPAActv
ACCtl_bAccActv
icadas_bTqVLCTrgtReqVld
icesc_bTCSActv
icesc_stCCOActv
icesc_stTABActv
icesc_bCCOFrntTqReqVld
icesc_tqCCOFrntTqReq
icesc_bCCOReTqReqVld
icesc_tqCCOReTqReq
PwrLimEM_tqMinFrntAxle4ESC
PwrLimEM_tqMinReAxle4ESC
ipf_bCCAN0x10BSG6Vld
ipf_bCCAN0x10FSG4Vld
CrCtl_stCrCtl
BrkPedDev_bBrk
GearLvr_stDrvGear
VehSpd_vVeh
DrvMod_stDrvMod
icesc_bISAActv
icesc_stISAAvl
icesc_bISAFrntTqReqVld
icesc_tqISAFrntReq
icesc_bISAReTqReqVld
icesc_tqISAReReq
HvCoorn_stVoltMod
icbms_tMinBat
icems_stEng
SpdLim_bFrntWhlVDiffActv
SpdLim_tqFrntWhlVDiffMax
SpdLim_bReWhlVDiffActv
SpdLim_tqReWhlVDiffMax
```

顶层输出共 12 个：

```text
ESCWhlTq_tqTarFrntAxle
ESCWhlTq_bFrntAxleTqIntvActv
ESCWhlTq_tqTarReAxle
ESCWhlTq_bReAxleTqIntvActv
ESCWhlTq_tqTarCstRgnFrntAxle
ESCWhlTq_tqTarCstRgnReAxle
ESCWhlTq_bFrntAxleOnlyRBSActv
ESCWhlTq_bReAxleOnlyRBSActv
ESCWhlTq_bFrntAxleTqDecActv
ESCWhlTq_bReAxleTqDecActv
ESCWhlTq_tqFrntBrkRegenMax
ESCWhlTq_tqReBrkRegenMax
```

## 后续可产品化的点

- 为 Linux 后端增加一个独立的 Hermes OpenAI API Server client，不复用项目旧 Agent 3101 接口。
- 将 SLX 文件投递抽象出来，避免生产环境依赖临时 HTTP server。
- 将 `/v1/runs` 的轮询、事件流、审批处理封装为统一任务 runner。
- 把 `evidence_tool`、工具事件摘要、Windows 文件路径写入调试记录，便于排查“模型猜测”和“真实工具执行”的差异。
- 给 Windows API Server 增加健康检查项：`/health`、`/v1/models`、MCP toolset 是否包含 `mcp-matlab_satk`。
- 明确 API key、provider key alias、model.default 的配置来源，避免部署包升级后再次出现 401 或空 model。
