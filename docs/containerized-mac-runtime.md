# Mac 容器化开发运行说明

本运行方式把平台与 Hermes Worker 固定为 `linux/amd64` 容器，同时让
MATLAB R2026a、Simulink、SATK 和 MCP 保留在 macOS 宿主。它不会替换现有
原生启动脚本，删除容器不会影响原生回滚路径。

## 运行边界

- `sdg-platform`：前端、后端、Wiki、调度和 Worker 路由。
- `sdg-hermes-worker`：Hermes Agent、固定 Node/Python、十二阶段技能及运行脚本。
- 宿主 MATLAB Gateway：提供受限的 workspace/job/asset/artifact API；容器不提交
  `/Users/...` 或 Windows 盘符路径。
- 任务数据、项目 addon、Hermes Home、平台技能状态和日志全部挂载在镜像外。

容器与 Gateway 使用共同映射：

```text
mappingId=worker-data
containerRoot=/var/lib/sdg/data
hostRoot=<SDG_CONTAINER_DATA_DIR 的宿主绝对路径>
```

Gateway 只接受 `mappingId`、`workspaceId`、`assetId`、`artifactId` 和 `jobId`
组合，不接受调用方指定的任意宿主绝对路径。`SDG_CONTAINER_DATA_DIR` 必须是
Docker Desktop 与宿主 Gateway 都可访问的本地目录。

## 首次准备

要求 Docker Desktop daemon、Buildx 和 Compose plugin 可用。复制示例配置，
将文件权限收紧后，仅在未跟踪文件中填写真实凭据。以下三个 token 均为必填，
并应使用三个彼此独立的高熵值；不要把它们提交到 Git、命令行参数或日志：

```bash
cp .env.container.example .env.container
chmod 600 .env.container
```

宿主 Gateway 的一键入口会安全读取同一个 `.env.container`，不会回显 token。
它固定使用 `127.0.0.1:5100`、`SATK_MATLAB_SESSION_MODE=new`，默认 MATLAB
根目录为 `/Applications/MATLAB_R2026a.app`，并在启动前检查该目录存在。
`MATLAB_GATEWAY_STATE_DIR` 默认为仓库内
`.local/container/matlab-gateway-state`，权限会收紧为 `0700`。MCP temp/socket
目录不再放入该长仓库路径：macOS 默认使用 `os.tmpdir()/sdg-mcp`，路径超过
80 bytes 时回退到短路径 `/tmp/sdg-mcp`；目录权限为 `0700`。MCP 日志仍位于
state 目录下的 `mcp-logs`，Mac MCP 参数显式携带 `--log-folder`。Windows
不注入 Mac 日志路径或参数。只有确有需要时才显式设置
`MATLAB_MCP_TMPDIR` 覆盖短路径默认值。

Mac 启动器默认设置 `MATLAB_GATEWAY_MCP_PREFLIGHT=1`。Gateway 在监听 5100
之前必须完成真实 MCP `initialize` 与一个最小 `evaluate_matlab_code`；失败
则直接退出，避免业务任务进入 Stage 2 后才发现 MATLAB/MCP 不可用。
`npm run matlab:gateway:check` 也执行同一真实 preflight，而不再只检查 binary
或 MATLAB 目录是否存在。MCP stderr 只保留有界、脱敏尾部，任务错误仅暴露
诊断类别与安全摘要，不包含 token、API key 或宿主用户绝对路径。
preflight 默认最多运行 120 秒，可通过
`MATLAB_GATEWAY_MCP_PREFLIGHT_TIMEOUT_MS` 收紧；超时会终止 MCP child，并以
`mcp_preflight_timeout` 类别退出，不会继续监听端口。

Stage 2 的 `environment.json` 按实际 discovery 模式保存不同证据。direct
stdio 模式继续记录宿主可见的 MCP executable path、size 与 SHA-256，并由
同一宿主重新读取校验；Gateway 模式绝不伪造容器内不存在的 executable
路径，而是记录经过认证的 `/health` 与 `/version` 响应字段及其规范化
SHA-256。host semantic validator 会核对 schema、服务标识、版本字段和证据
hash，并使用配置的 URL/token 重新请求当前 `/health` 与 `/version` 比对，
拒绝 Gateway 证据中夹带的本地 path、size 或 executable hash。

为容忍 Docker Desktop 的 `host.docker.internal` 瞬时路由中断，TCSD Gateway
客户端只对幂等 `GET`、`PUT`、`DELETE` 的网络类 `URLError` 最多重试两次，
退避固定为 100ms、250ms。`POST` job/cancel 永不自动重试，避免重复提交；
HTTP 4xx/5xx 也不重试。host validator 的只读 health/version 复核使用相同
的有界策略。

```bash
npm run matlab:gateway:check
npm run matlab:gateway:start
```

如确需覆盖 MATLAB 安装位置，只能通过 `MATLAB_ROOT` 指向一个已存在的目录；
启动器会把同一值同时传给 `MATLAB_ROOT` 与 `SATK_MATLAB_ROOT`。Gateway 的
`evaluate_matlab_code` 使用独立 token 和固定调用方标识，仅供十二阶段运行时；
通用 MCP 调用只允许显式 allowlist 工具和结构化参数，不能透传任意 MATLAB
代码或宿主路径。

容器侧固定访问 `http://host.docker.internal:5100`。`container:dev:test` 会从
Worker 容器真实请求 Gateway 的 health/version；若 Docker Desktop 无法访问
宿主回环地址，测试会失败并停止，不会自动把 Gateway 降级为未认证的
`0.0.0.0` 监听。

## 一键运行

```bash
npm run container:dev:config
npm run container:dev:build
npm run container:dev:up
npm run container:dev:test
```

Compose 首先由一次性 `permissions-init` 以最小 `CHOWN/FOWNER` capability 将
共享 data、两类日志和三个 named volume 调整为组 `20000`、模式 `2770`，
随后 platform/worker 始终以各自非 root UID 运行。`up` 和 `test` 都会在
platform 的 data/logs/skills/home 以及 worker 的 data/logs/hermes-home
执行真实写入并立即清理哨兵文件；不使用 `chmod 777`。

Mac 默认只在 `127.0.0.1` 发布平台 `3000` 和 Worker `3101`。需要局域网访问时
必须显式修改 Compose 覆盖文件，并先完成认证、主机防火墙和网络边界评审。

停止并保留持久数据：

```bash
npm run container:dev:down
```

`down` 不删除 volume。若要清理任务数据、Hermes 状态或 addon，必须单独确认
精确目录/volume 后处理。

## 发布候选证据

发布候选必须显式构建 `linux/amd64`，不能以 Apple Silicon 原生架构构建结果
代替。生成 manifest 和扫描入口：

```bash
npm run container:manifest
npm run container:scan
```

manifest 记录源码 Git SHA、基础镜像引用、Node/Python/Hermes 版本、技能 hash
和最终镜像 digest。生产交付时基础镜像和两个应用镜像都必须替换为
`@sha256:` 引用；本地 `:mac-dev` 标签不是生产证据。

扫描脚本会调用已安装的 Syft、Trivy 或 Grype。工具缺失会明确记为未执行，
不会生成伪造的通过结果。生成的 SBOM、扫描报告和 release manifest 位于
`release-dist/`，不提交源码。

## 回滚

容器化没有删除、覆盖或接管原生 Mac 启动脚本。停止 Compose 后，可继续使用
现有原生 `scripts/start-local.sh`；容器运行态目录与原生运行态目录应保持分离。
