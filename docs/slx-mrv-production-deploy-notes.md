# SLX/MRV 生产测试部署说明

## 当前版本能力

- 新增 `/slx-parser` 页面，可在模块下上传 `.slx` 并生成 `modelRequirementView JSON`。
- SLX 解析结果会进入模块资产，角色为 `model_requirement_view_json`。
- 软件需求生成时支持 `系统需求 + modelRequirementView JSON`，不再必须选择 `.c` 文件。
- 生成前会构建 compact MRV，只保留需求生成需要的模型事实，例如派生信号、Stateflow transition guard、关键阈值和输出动作，避免把完整 MRV 全量喂给 Hermes。
- JSON-only 生成 prompt 已明确要求引用 SLX/MRV `sourceFactIds`，并避免假设或请求 `.c`。

## 部署前置条件

- 生产 Linux 后端推荐通过远程 Hermes Agent 调度生成任务；Hermes Agent 与 MATLAB Worker 都运行在安装 MATLAB 的 Windows VM 上。
- Linux 后端调用远程 Hermes Agent 时使用 HTTP multipart 上传本次 step 需要读取的文件，Windows Agent 落到本机临时目录后再执行 Hermes / MATLAB MCP。
- 仍保留独立 MATLAB Worker HTTP 接口，便于 `/slx-parser` 单独解析 `.slx` 或做连通性验证。
- 当前 Windows Worker 候选机器：
  - 主机：`Wx11v-PRJ130.itk.local`
  - MATLAB 可执行文件：`C:\Program Files\MATLAB\R2022b_Update_1\bin\matlab.exe`
  - 登录用户：`zguan`
  - 密码不写入仓库、文档、脚本或日志，只通过安全运维通道配置。
- 如果在应用本机安装 MATLAB，默认 MATLAB 路径为 `/Applications/MATLAB_R2026a.app`。如果生产机路径不同，需要设置：
  - `MATLAB_ROOT=/实际/MATLAB.app`
- 默认 MCP server 使用仓库内的 `tools/matlab-mcp-core-server`。如果生产机不是当前 macOS 架构，可能需要替换该二进制或设置：
  - `MATLAB_MCP_SERVER_COMMAND=/path/to/matlab-mcp-core-server`
- `tools/matlab-functions/analyze_slx.m` 必须随代码一起部署；server 启动时会把该目录作为初始工作目录。

## 关键环境变量

- `MATLAB_ROOT`：MATLAB 安装路径。
- `MATLAB_MCP_TRANSPORT`：生产 Linux 连接远程 Worker 时设置为 `http`。
- `MATLAB_MCP_HTTP_MODE`：生产 Linux 连接远程 Worker 时设置为 `multipart`。
- `MATLAB_MCP_BASE_URL`：远程 Windows Worker 地址，例如 `http://Wx11v-PRJ130.itk.local:5100`。
- `MATLAB_MCP_AUTH_TOKEN`：Linux App 与 Windows Worker 共享的 Bearer token，必须通过生产环境变量配置，不写入仓库。
- `MATLAB_MCP_TIMEOUT_MS`：SLX 解析超时，默认 `300000`。
- `MATLAB_MCP_TMPDIR`：MATLAB MCP 临时目录，默认 `/tmp`。
- `HERMES_TRANSPORT`：Linux 后端连接 Windows Hermes Agent 时设置为 `api`。
- `HERMES_API_MODE`：Linux 后端连接 Windows Hermes Agent 时设置为 `multipart`。
- `HERMES_BASE_URL`：远程 Windows Hermes Agent 地址，例如 `http://Wx11v-PRJ130.itk.local:3101`。
- `HERMES_AUTH_TOKEN`：Linux App 与 Windows Hermes Agent 共享的 Bearer token。
- `HERMES_MAX_MODEL_REQUIREMENT_FACTS`：生成前 compact MRV 最大 facts，默认 `100`。
- `HERMES_MAX_MODEL_REQUIREMENT_BYTES`：生成前 compact MRV 目标大小，默认 `12000`。

## Linux 生产 App 示例

`env
HERMES_TRANSPORT=api
HERMES_API_MODE=multipart
HERMES_BASE_URL=http://Wx11v-PRJ130.itk.local:3101
HERMES_AUTH_TOKEN=<从安全通道配置>
MATLAB_MCP_TRANSPORT=http
MATLAB_MCP_HTTP_MODE=multipart
MATLAB_MCP_BASE_URL=http://Wx11v-PRJ130.itk.local:5100
MATLAB_MCP_TIMEOUT_MS=600000
MATLAB_MCP_AUTH_TOKEN=<从安全通道配置>
`

Windows VM worker、Hermes Agent 服务端和一键部署包维护在 elease/windows-prod 分支；Linux 生产分支只需要配置上述远程地址和 token。
## 部署注意点

- 不需要预先手动打开 MATLAB；Windows Worker 会通过 MCP server 启动 MATLAB。若 Windows GUI/权限策略阻止 MATLAB 启动，需要先在 VM 上验证 `MATLAB_ROOT` 和 server 权限。
- 远程 Worker 模式下，Linux 生产机不需要能访问 Windows 文件路径；应用会直接 multipart 上传 Hermes step 所需文件和 `.slx` 文件。
- Windows Worker 只应监听网域内地址，并通过防火墙限制只允许生产 Linux VM 访问 `3101` 和 `5100` 端口。
- `.slx` 解析会比普通文档提取慢，首次启动 MATLAB 更慢；生产测试时建议先用一个小模型做连通性验证。
- 当前提交不包含本机测试产生的 `data/uploads`、`input/`、`output/`、`videos/` 等运行产物。生产环境应上传自己的 `.slx` 重新解析。
- 如果生产机已有持久化 `data/`，部署代码时不要覆盖生产 `data/projects`、`data/uploads`、`data/skills.sqlite`，除非明确要同步本机测试数据。
- Hermes token 统计存在 session 级波动。判断 compact 是否生效时，优先看生成任务 debug 中的 compact MRV fact 数/大小，以及 `sourceRefs` 是否来自 `simulink_slx`。
- 目前低压能量管理测试中，compact MRV 能支撑 `.c` 替代路径；但如果某个模型缺少关键派生信号追溯，下一步应优先增强 `derivedSignals` 解析，而不是回退到全量 MRV。

## 生产验证建议

1. 启动服务后打开 `/slx-parser`，选择目标项目和模块，上传 `.slx`。
2. 确认任务完成，并生成 `*-model-requirement-view.json` 资产。
3. 进入软件需求生成，只选择系统需求和该 JSON，不选择 `.c`。
4. 生成完成后检查：
   - 结果条目是否引用 `sourceFactIds`。
   - `sourceRefs.fileRole` 是否包含 `simulink_slx`。
   - 生成内容是否覆盖激活、退出、时序、阈值、输出动作。
   - token 是否明显低于直接喂完整模型事实。

## 本地验证命令

```bash
npm test
```
