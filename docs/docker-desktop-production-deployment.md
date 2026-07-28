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
- 三个互相独立的 Hermes/Gateway token。
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

部署命令：

```powershell
$env:SDG_PROD_ENV_FILE = '.env.windows-docker-desktop'
npm run container:prod:windows:config
npm run container:prod:windows:preflight
npm run container:prod:windows:up
npm run container:prod:windows:test
```

`config` 不打印展开后的 Compose，避免泄露 secret。`preflight` 验证：

- Docker Server 为 `linux/amd64`。
- 镜像引用不可变且镜像已存在。
- addon 目录齐全。
- Compose 只使用预构建镜像。

`up` 先准备 bind mount/named volume 权限，再以 `--no-build` 启动 Worker。
`test` 等待容器 healthy，并从 Worker 容器真实访问
`http://host.docker.internal:5100` 的 Gateway health/version。

Gateway 启动器会读取同一 env：

```powershell
$env:SDG_CONTAINER_ENV_FILE = '.env.windows-docker-desktop'
npm run matlab:gateway:check
npm run matlab:gateway:start
```

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

1. 记录当前服务、端口、release、镜像、env、数据目录和健康证据。
2. 为新 Worker 使用批准的 canary 端口，避免与原生 3101 冲突。
3. 从 Linux Platform 配置一个 canary Worker profile。
4. 使用批准的非用户测试输入运行真实十二阶段任务。
5. 验证十二阶段、Hermes session、MATLAB Gateway、addon、XLSX 下载和重启恢复。
6. 验收通过后再切正式 3101/平台路由。

本项目的最终 TCSD 验收输入固定为用户已使用过的同类输入：

- `A02.slx`
- `HvCoord.mat`
- `01_楚能` 项目 addon，包括 `init_Global.m`

任务必须在前端达到“已完成”，十二阶段全部完成，最终 XLSX 可下载且可打开。
仅 health check 通过不能表述为部署完成。

回滚入口：

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
- 不同时让原生 Worker 和容器 Worker占用同一端口。
- 不在未知来源可访问的接口上开放 3101 或 5100。
