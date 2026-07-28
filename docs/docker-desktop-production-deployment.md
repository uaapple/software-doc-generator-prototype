# Docker Desktop 生产部署说明

本文定义当前批准的容器生产基线：

- Linux VM 运行 `sdg-platform` 的 `linux/amd64` 容器。
- 两台 Windows Worker 使用 Docker Desktop 的 Linux containers 后端运行
  `sdg-hermes-worker`。
- MATLAB R2025b、Simulink、SATK 和 MATLAB Gateway 继续原生运行在各自
  Windows 宿主上。
- 生产端只加载已经构建并校验的镜像，不从生产 checkout 重新构建镜像。

Docker Desktop 商用许可、企业软件准入、虚拟化能力和防火墙变更必须由生产
负责人先行确认。任一 Windows 机器不能启动 Linux containers 时，不得把它
切换到本部署方式。

## 制品与版本

日常发布优先推送私有 GHCR：

```bash
npm run container:release:publish
```

首次部署或离线回退需要完整 tar 时才运行：

```bash
npm run container:release:build
```

镜像版本与部署工具版本相互独立：

- `imageRevision` 是镜像实际输入文件的 Git blob/tree 清单哈希。Compose、生产
  preflight、env 示例、测试或文档变化不会改变它，也不会要求重建镜像。
- `deploymentToolRevision` 是生成 release manifest 时的精确 Git 提交，标识本次
  使用的 Compose、preflight 和部署说明。
- `org.opencontainers.image.revision` 写入 `imageRevision`。镜像不写入动态构建
  时间，避免仅因构建时间或部署脚本提交变化而生成新 image config/layer。

默认 GHCR 仓库为：

```text
ghcr.io/uaapple/software-doc-generator-platform
ghcr.io/uaapple/software-doc-generator-worker
```

构建器按 `linux/amd64` 构建并扫描两个镜像。GHCR 发布 manifest 记录 tag、
`imageRevision`、精确 registry digest 和 `repository@sha256:...` 引用。生产端
只允许 pull manifest 中的 digest 引用，禁止 `latest`。

首次离线构建额外生成：

```text
release-dist/container/
├─ platform-<image-revision>-linux-amd64.tar
├─ worker-<image-revision>-linux-amd64.tar
└─ container-release-<deployment-tool-revision>.json
```

manifest 还记录镜像 ID、tar SHA-256、大小、架构及扫描证据。构建器从精确
`git archive HEAD` 创建 Docker context，未跟踪文件不会进入镜像；Syft 和
Trivy 必须对两个镜像都成功，否则不会生成正式 manifest。HIGH/CRITICAL 漏洞
和未知许可证只记录告警；secret finding 和明确禁用许可证仍然硬失败。
`release-dist/**` 是构建产物，不进入 Git。

Windows 原生 Gateway 与容器镜像是独立发布单元。若 Gateway 协议或部署工具
变化、但 Platform/Worker imageRevision 未变化，必须运行：

```bash
node scripts/build-native-matlab-gateway-companion.mjs
```

它只生成 `release-dist/native-gateway/` 下的 companion ZIP、manifest、scan
和 release JSON，不调用 Docker、不构建或推送镜像。companion manifest 记录
精确 source/deployment revision、受管目标文件清单/大小/SHA-256，并断言
Platform/Worker rootfs 输入仍等于冻结 imageRevision。生产继续复用既有 GHCR
`repository@sha256:...`，不得因为 companion 更新重新上传相同镜像。

companion v4 是 Windows PowerShell 5.1 兼容发布：本地 evaluate token 使用
`RandomNumberGenerator.Create()`/`GetBytes()`；现有 env 通过同目录临时文件和
带非空 backup path 的 `File.Replace` 原子替换，不存在的目标使用同卷原子
创建。`ValidateOnly` 在停服务前执行这些 .NET 能力探针，但不修改 env。
v4 ZIP 还包含独立、只读且由 manifest size/SHA-256 保护的
`test-native-matlab-gateway-companion-ps51.ps1`。该测试不 dot-source 部署
脚本顶层逻辑，只解析所需函数、在脚本作用域导入并逐个检查可见性。

新 companion tag/Release 只能在 GitHub Actions 的 Windows runner 使用
`powershell.exe` 5.1 跑完该行为测试和 Windows wrapper 启动合同后创建。
v4 在停服务前从未跟踪容器 env 的 `SDG_CONTAINER_DATA_DIR`、
`MATLAB_GATEWAY_STATE_DIR`、`MATLAB_GATEWAY_CONTAINER_ROOT` 和
`SATK_GATEWAY_MAPPING_ID` 派生原生 Gateway 映射；host/state 必须是存在、
可写、非盘符根的绝对 Windows 路径，container root 和 mapping ID 必须分别
等于 `/var/lib/sdg/data` 与 `worker-data`。原生 env 已有等价键时必须一致，
冲突 fail-closed。`MATLAB_ROOT`、MCP command/tmp 必须在停服务前验证；
Windows session mode 缺省并固定为 `new`；`MATLAB_MCP_LOG_FOLDER` 在 Windows
仍为可选项，但一旦配置也必须是存在且可写的绝对路径。

生产顺序固定为：核对 v4 资产 → 从 ZIP 运行受保护的 PS5.1 测试 →
`-ValidateOnly` → 管理员 PowerShell 正式执行 → 验证 `/health`、`/version`、
`/capabilities`、`worker-data` mapping 和真实 evaluate readiness。任一步
失败由脚本恢复部署前的 6 个受管文件、两个 env 原字节及旧 5100 服务。

GHCR 会复用已存在的 OCI layers，因此后续 push/pull 只传缺失 layer。两个
Containerfile 均先安装固定 OS、npm/Python/Hermes 依赖，再复制源码和 skills；
源码小改不会重新上传稳定依赖层。

GHCR package 必须保持 private。发布账号使用不输出、不提交的 classic PAT
`write:packages` 登录；生产端每台机器仅使用 classic PAT `read:packages`：

```text
<token 通过安全输入> | docker login ghcr.io -u <批准账号> --password-stdin
docker pull ghcr.io/uaapple/<image>@sha256:<manifest 中的精确 digest>
```

GHCR 不可达时才使用离线 tar。每台 Windows 只需要 Worker tar；Linux VM 只
需要 Platform tar。传输前后必须重新计算 SHA-256 并与 manifest 完全匹配。
`docker load` 后使用 manifest 中的不可变 `imageId` 配置生产 env。

## Windows Docker Desktop Worker

生产配置文件来自：

```text
.env.windows-docker-desktop.example
compose.windows-docker-desktop.yaml
```

复制为未跟踪文件 `.env.windows-docker-desktop`，填写：

- 已加载的 Worker `sha256:` image ID。
- DeepSeek 或批准的 Hermes provider 凭据。
- 三个互相独立的 Hermes/Gateway token。其中
  `MATLAB_GATEWAY_EVALUATE_TOKEN` 是每台 Worker 本地生成的随机秘密，不是
  DeepSeek 或其他外部供应商凭据，也不得复用 `MATLAB_GATEWAY_TOKEN`。
- 本机 Hermes profile。
- 项目 addon 根目录。

固定宿主目录为：

```text
C:\ProgramData\SoftwareDocGenerator\data
C:\ProgramData\SoftwareDocGenerator\project-addons
C:\ProgramData\SoftwareDocGenerator\logs\worker
C:\ProgramData\SoftwareDocGenerator\matlab-gateway-state
```

Worker 映射为：

```text
C:\ProgramData\SoftwareDocGenerator\data
  -> /var/lib/sdg/data

C:\ProgramData\SoftwareDocGenerator\project-addons
  -> /var/lib/sdg/project-addons (read-only)
```

MATLAB Gateway 的 `MATLAB_GATEWAY_HOST_ROOT` 必须解析到同一个 Windows
`data` 目录，`MATLAB_GATEWAY_CONTAINER_ROOT` 固定为 `/var/lib/sdg/data`，
mapping ID 固定为 `worker-data`。因此 Gateway 与 Worker 共享任务文件，但
容器不会获得任意 Windows 绝对路径。

项目 addon 不进入镜像。每个启用项目必须存在独立目录，例如：

```text
C:\ProgramData\SoftwareDocGenerator\project-addons\01\init_Global.m
C:\ProgramData\SoftwareDocGenerator\project-addons\02\
```

`UNIT_TEST_CASE_DEFAULT_PROJECTS=01_楚能,02_TMS` 保留前端展示名；生产 preflight
和 Worker 运行时都从展示名解析项目 ID，只检查并挂载 `01`、`02` 目录。

### Windows 原生 Gateway companion

`464b45448cd691fe94c4c5c843efe64ccd344a68` 的旧
`src/matlab-worker-server.js` 只提供 `/mcp/tools/analyze_slx`，没有新版
`/version`、`/capabilities`、workspace/job API，也没有独立 evaluate-token
边界。旧 `/health` 成功不能证明它满足容器 Worker contract；只补 env token
也无法补出缺失路由。

Windows 容器部署前必须先使用 companion asset 升级原生
`SoftwareDocMatlabWorker`。生产机不执行 npm install/build；companion 只替换
manifest 声明的 Gateway 源文件，并复用现有 Node `node_modules`、MATLAB
R2025b 和 SATK。脚本会备份受管源、原生/容器 env 与服务配置，只停止并恢复
`SoftwareDocMatlabWorker`；不触碰 Hermes、runtime/data、addon、Hermes
Home/session、用户输入输出或 MATLAB 产物。

校验外部提供的 ZIP/release/manifest/scan SHA-256 后，解压并先执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy-native-matlab-gateway.ps1 `
  -CompanionRoot <解压目录> `
  -InstallDir C:\SoftwareDocWorker `
  -ContainerEnvFile <未跟踪.env.windows-docker-desktop绝对路径> `
  -ValidateOnly

# ValidateOnly 通过后去掉该开关执行升级。
```

脚本复用 `software-doc-worker.env` 中现有批准的
`MATLAB_GATEWAY_TOKEN`。若 evaluate token 尚不存在，脚本使用系统加密随机数
生成一个值并原子写入原生与未跟踪容器 env；永不回显或写入制品。两个 env
已有同一个 token 时保留原值并先备份当前字节；不同 token 或重复键时
fail-closed。该 backup 只能恢复到执行 v2 前的现场状态，不能恢复到现场人工
写入 token 之前。部署完成前先在 120 秒总上限内等待服务、TCP 5100 和
`/health`，随后必须真实通过 `/version`、
`/capabilities` 和 `evaluate_matlab_code` readiness；失败自动恢复旧 5100。
服务状态为 Running 本身不构成 readiness。回滚后的旧 Gateway 也使用相同
有界等待，不得立即探测端口。

Gateway 通过后再执行容器命令：

```powershell
$env:SDG_PROD_ENV_FILE = '.env.windows-docker-desktop'
npm run container:prod:windows:config
npm run container:prod:windows:preflight
npm run container:prod:windows:up
npm run container:prod:windows:test
```

可直接交给生产 Agent 的冻结流程位于
`docs/prompts/windows-native-gateway-companion-agent.md`；不得自行省略其中的
外部 SHA 校验、`ValidateOnly`、evaluate readiness 或回滚验证。
现场临时的 `deploy-native-matlab-gateway-ps51.ps1` 与
`deploy-native-matlab-gateway-ps51-enhanced.ps1` 不属于发布制品，禁止执行。

`config` 不打印展开后的 Compose，避免泄露 secret。`preflight` 验证：

- Docker Server 为 `linux/amd64`。
- 镜像引用不可变且镜像已存在。
- addon 目录齐全。
- Compose 只使用预构建镜像。

`up` 先准备 bind mount/named volume 权限，再以 `--no-build` 启动 Worker。
`test` 等待容器 healthy，并从 Worker 容器真实访问
`http://host.docker.internal:5100` 的 Gateway health/version/capabilities，
创建隔离 workspace 并完成真实 evaluate probe。不得用 host 侧 probe 替代
容器侧路由验收。

Windows 生产 env 明确设置：

```text
MATLAB_ROOT=C:/Program Files/MATLAB/R2025b
MATLAB_WORKER_HOST=0.0.0.0
MATLAB_WORKER_PORT=5100
```

示例要求填写明确的 Windows 宿主地址，不默认使用 `0.0.0.0`。绑定非回环地址
只允许在 Gateway token 已配置、Windows Firewall 已限制到 Linux VM 等批准
来源后进行。3101 和 5100 都不能对不受信网络开放；如企业边界不允许受控网段
内的 token HTTP，必须先配置批准的 TLS 反向代理再部署。

## Linux Platform

生产配置文件来自：

```text
.env.linux-container-prod.example
compose.linux-prod.yaml
```

复制为未跟踪文件 `.env.linux-container-prod`，填写 Platform image ID、实际
Windows 地址、共享 Hermes token 和 Gateway token。Worker 配置必须保留稳定
ID，例如 `vm` 和 `physical`；不得把示例中的 `WINDOWS_*` 占位符带入生产。
平台容器同时运行 Platform 和 Wiki，并分别将宿主 `3000`、`3001` 映射到容器。

部署命令：

```bash
export SDG_PROD_ENV_FILE=.env.linux-container-prod
npm run container:prod:linux:config
npm run container:prod:linux:preflight
npm run container:prod:linux:up
npm run container:prod:linux:test
```

Linux `test` 会先验证容器内 Wiki `3001/health`，再从 Platform 容器逐一访问
每个 Worker 的 3101 health 和 MATLAB Gateway 的 5100 health。Platform 不接收
DeepSeek、GLM 或其他 Worker 推理凭据。

Platform 固定使用 `HERMES_API_MODE=upload`。创建 TCSD 或软件详设任务时，
Platform 通过受认证 multipart 请求把本地 workspace 输入传到所选 Worker；
Worker 使用自己的隔离 workspace 执行，并在终态轮询响应中返回有界、校验过的
XLSX/DOCX。Platform 将产物原子写回自己的任务 workspace。因此 Linux 与
Windows 不需要共享 SMB/NFS 目录，也不得把 Linux 绝对路径当成 Windows 路径。平台确认终态产物已落盘并通过 workbook 校验后，会调用受认证清理接口删除 Worker 的本次上传工作区。Worker 每小时清理超过 24 小时的终态上传会话和孤儿目录，并将超过 7 天且没有活动执行器的非终态作业标记为租约过期后清理；运行中的作业不会被直接删除。单次 multipart 请求同时受单文件、文件数和 1 GiB 聚合大小限制。

## 灰度、验收与回滚

首次部署不得立即删除原生服务或旧 release：

1. 旧服务运行时只读审计：记录 3101/5100、服务配置、release、env 路径、
   镜像精确 digest 和健康证据，不输出 secret。
2. 校验 companion ZIP/manifest/scan，升级并真实验证原生 Gateway 5100；保留
   自动生成的 backup 目录。
3. 执行 Windows Worker container config/preflight。
4. 复用既有 Worker digest，只切 Hermes 3101；运行容器侧 evaluate readiness。
5. 使用批准的非用户测试输入运行真实十二阶段任务。
6. Windows 验收通过后才部署 Linux Platform 的既有精确 digest。
7. 验证十二阶段、Hermes session、MATLAB Gateway、addon、XLSX 下载和重启恢复。

本项目的最终 TCSD 验收输入固定为用户已使用过的同类输入：

- `A02.slx`
- `HvCoord.mat`
- `01_楚能` 项目 addon，包括 `init_Global.m`

任务必须在前端达到“已完成”，十二阶段全部完成，最终 XLSX 可下载且可打开。
仅 health check 通过不能表述为部署完成。

回滚入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy-native-matlab-gateway.ps1 `
  -CompanionRoot <解压目录> `
  -InstallDir C:\SoftwareDocWorker `
  -ContainerEnvFile <未跟踪容器env绝对路径> `
  -Rollback `
  -BackupDir <native-gateway backup目录> `
  -ValidateOnly

# 校验通过后去掉 -ValidateOnly。
```

```powershell
$env:SDG_PROD_ENV_FILE = '.env.windows-docker-desktop'
npm run container:prod:windows:down
```

```bash
export SDG_PROD_ENV_FILE=.env.linux-container-prod
npm run container:prod:linux:down
```

停止容器不会删除 named volume、任务数据或 addon。真实回滚还必须恢复部署前
记录的原生服务或 Linux `current` release；不得删除或覆盖运行数据来完成回滚。

## 禁止事项

- 不在生产机执行 `docker build`。
- 不使用 `latest`、本地可变 tag 或未知 image ID。
- 不把 `.env`、API Key、token、addon、输入输出、Hermes Home 或 MATLAB
  产物提交 Git 或写入镜像。
- 不因为容器 health 通过而跳过真实 TCSD 任务。
- 不让旧 `/mcp/tools/analyze_slx` Gateway 冒充新版 workspace/job contract。
- 不用 `MATLAB_GATEWAY_TOKEN` 代替 `MATLAB_GATEWAY_EVALUATE_TOKEN`，也不关闭
  Gateway 鉴权来通过 readiness。
- 不同时让原生 Worker 和容器 Worker占用同一端口。
- 不在未知来源可访问的接口上开放 3101 或 5100。
