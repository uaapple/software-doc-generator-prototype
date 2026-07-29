# 部署分支拆分交接说明

本文档给部署端 AI 使用，用于把开发分支改动拆分到 `release/linux-prod` 和 `release/windows-prod`。当前开发分支已经引入部署边界显性化机制，后续不要再完全按旧方式人工扫所有 diff，应优先使用仓库内的分类器和部署目标清单。

TCSD 从整体 Agent 任务升级到十二阶段流水线的完整生产部署步骤、Linux/Windows 文件边界、环境变量、验收与回滚要求，统一见 `docs/tcsd-12-stage-production-deployment-handoff.md`。

`tcsd-12-stage-pipeline-v1.4-*` 标签是不可变生产证据，不得移动或覆盖；回滚门禁修复应由主任务在验收后使用新的 patch 标签发布。

## OCI 容器化开发候选

Mac 开发侧新增 `sdg-platform` 与 `sdg-hermes-worker` 两个 `linux/amd64`
镜像，统一入口与安全边界见 `docs/containerized-mac-runtime.md`。MATLAB、
Simulink、SATK 和 MCP 仍由宿主原生 Gateway 提供，不进入镜像。

这次变化不直接切换任何生产流量。当前批准的首轮生产基线为 Docker Desktop：
Linux 生产只部署经过 amd64 验证的 platform image ID；Windows Worker 使用同一
worker image ID，通过 Docker Desktop 的 Linux containers 后端和
`host.docker.internal` 访问 Windows 原生 Gateway。独立 WSL Docker Engine CE
适配不在本轮范围。生产持久数据、Hermes Home、项目 addon、日志、secrets、
模型/MAT/SLX 和 MATLAB 许可证始终位于镜像外。

生产 Compose、离线镜像 tar、Windows/Linux env、灰度、真实 TCSD 验收与回滚
统一见 `docs/docker-desktop-production-deployment.md`。生产端不得直接运行
Mac all-in-one `compose.yaml + compose.mac.yaml`。

旧 ZIP/源码包和原生服务在灰度验收完成前继续保留为回滚路径。OCI 交付必须
携带源码 SHA、基础镜像引用、运行时版本、技能 hash、应用镜像 digest、SBOM、
依赖许可证结果和漏洞扫描结果；不能把本地可变 tag 当成发布证据。容器发布扫描将
HIGH/CRITICAL 漏洞作为 manifest 中的审计告警记录，不作为功能部署阻塞项；任何
secret finding 或 `deploy/container-license-policy.json` 明确禁止的许可证仍然
fail-closed。未知许可证分类只记录在原始 Trivy 报告中，不等同于禁用许可证。
Linux Platform 容器同时运行平台与 Wiki；生产 Compose 分别发布原端口 `3000`
和 `3001`，停止旧 systemd 平台/Wiki 服务后必须验证两者。
容器日常分发优先使用私有 GHCR 的精确 digest；完整 docker-save tar 仅用于
首次部署或 GHCR 不可达时的离线回退。release manifest 分别记录镜像输入哈希
`imageRevision` 与 Compose/preflight 所在提交 `deploymentToolRevision`，
仅部署工具变化不触发镜像重建。

Linux 容器部署直接复用原生服务的 `prod-data` 与 `prod-skills` bind mount，
避免空目录或空 Docker volume 隐藏正式项目与技能。preflight 必须在停服务前
确认两个目录已存在、不是符号链接、Docker daemon 可只读挂载，并且镜像内
`node` 的数值 UID/GID 无需修改现有权限即可写入。日志与容器 home 同样使用
预先创建的非 root bind mount；Linux Compose 不再运行 `permissions-init`，
不申请 CHOWN/FOWNER capability，也不对正式目录执行 `chgrp` 或 `chmod`。

Windows 原生 MATLAB Gateway 使用独立 companion release。companion manifest
记录 source/deployment revision、精确受管文件 SHA-256、scan SHA-256，并在
构建时断言 Platform/Worker imageRevision 未变化。只要 rootfs 输入不变，
不得重建或重传镜像；继续使用已验证的 GHCR 精确 digest，只更新
deploymentToolRevision 与 companion asset。旧
`464b45448cd691fe94c4c5c843efe64ccd344a68` Gateway 只有
`/mcp/tools/analyze_slx`，不满足新版 `/version`、`/capabilities`、
workspace/job/evaluate-token contract，不能只补 env 后继续使用。

Windows 正式顺序固定为：只读审计旧服务 → companion 资产/PS5.1 测试 →
companion `-ProvisionDirectories` → companion `-ValidateOnly` →
备份并升级/真实 evaluate 验证 `SoftwareDocMatlabWorker` 5100 → Worker
container config/preflight → 复用既有 Worker digest、只切 Hermes 3101 →
容器内真实 evaluate readiness → Windows 黑盒验收 → 最后部署 Linux。
companion 只管理 manifest 声明的 Gateway 文件、两个 env 中的 Gateway token
键，以及原生 env 中从容器配置确定性派生的映射/MCP 启动键；不修改 MATLAB
R2025b、SATK、runtime/data、addon、Hermes Home/session、用户输入输出或
MATLAB 产物。`MATLAB_GATEWAY_EVALUATE_TOKEN` 必须本地随机生成或安全接收，
并与批准的 `MATLAB_GATEWAY_TOKEN` 保持独立。

Windows companion v7 保留 PowerShell 5.1/.NET Framework 边界：CSPRNG 使用
`RandomNumberGenerator.Create()`/`GetBytes()` 并可靠释放；存在的 env 使用
同目录临时文件、继承 ACL 和非空 backup path 的 `File.Replace`，不存在目标
走单独的同卷原子创建路径。两个 env 已有同一个 evaluate token 时，v7 将其
视为合法续跑输入并先备份当前字节，不重新生成或输出；backup 仅代表 v7
执行前状态，不能证明现场人工写 token 之前的状态。重复键或不一致值
fail-closed。

服务 Start 后必须在 120 秒总上限内联合检查服务状态、TCP 5100 和
`/health`；Running 不等于 ready，服务提前停止立即失败。health 就绪后才执行
version/capabilities/evaluate probe，回滚恢复旧 Gateway 时使用相同有界等待。
`ValidateOnly` 在停服务前验证 PS5.1 CSPRNG、带非空 backup 的 replace 和
不存在目标的原子创建能力，且不修改 env。现场临时 `ps51`/`enhanced` 脚本不
属于 companion release，禁止继续使用。

v7 保留旧原生 env workspace mapping 修复，并修正 v4 PowerShell preflight
只接受 `C:\...`、错误拒绝正式 Docker Desktop env 示例 `C:/...` 的缺陷。
两种盘符绝对路径会先规范化再做等价/冲突判断；drive-relative、root-relative、
POSIX、相对路径和盘符根继续拒绝。部署工具从未跟踪
container env 读取 `SDG_CONTAINER_DATA_DIR` 作为唯一 host-root 来源，同步
state/container-root/mapping-id 到原生 env；显式旧值只有在等价时才接受。
`ValidateOnly` 在停服务前验证 host/state/tmp 可写、MATLAB/toolkit 目录和 MCP
command/tools 文件存在、container root 固定 `/var/lib/sdg/data`、mapping ID
固定 `worker-data`，并将 Windows session mode 缺省为 `new`。MCP log folder
不属于 Windows 启动必需项；若 legacy native env 已配置则一并验证。

v7 提供与 `-ValidateOnly`、`-Rollback` 互斥的 `-ProvisionDirectories`。
它只从未跟踪 container env 读取 `SDG_CONTAINER_DATA_DIR` 和
`MATLAB_GATEWAY_STATE_DIR`，仅允许 `C:\ProgramData\SoftwareDocGenerator`
严格子目录。缺失目录仅创建空目录并继承父 ACL；已有目录只验证，绝不清空、
迁移或改 ACL。盘符根、相对/drive-relative/POSIX/UNC、普通文件和任意 reparse
point 均 fail-closed。该模式不读取或修改原生 env、服务、addon、Hermes、
MATLAB 产物，也不使用现场临时日志。`ValidateOnly` 继续严格只读并要求目录
已经存在；正式升级绝不隐式创建目录。

v7 在解析 env、创建目录或读取服务前由版本化脚本自身强制关键键唯一且非空：
ProvisionDirectories 检查 data/state 两项，ValidateOnly 和正式部署检查
data/state/container-root/mapping-id 四项。重复键即使值相同也以
`<KEY>_MULTIPLICITY` 拒绝，空白赋值以 `<KEY>_EMPTY` 拒绝；注释不算赋值。
Windows container-production preflight 使用同一 fail-closed 规则，不再依赖
生产 Agent 人工发现 last-wins 配置。

Windows wrapper 也执行同一 fail-closed 边界，在导入监听服务前建立
`createConfiguredWorkspaceMapping`。启动失败只向服务日志写固定安全类别；
部署 readiness 不能把 Win32 exit code 0 当作应用成功，会从本轮日志提取该
类别。Windows CI 另以生产等价最小 env 启动 wrapper 配置入口，覆盖缺目录、
相对路径和映射冲突。

v7 companion manifest 将 6 个受管 Gateway payload、1 个 deployment tool、
1 个只读 PS5.1 validation script 和正式 Windows env example 分为三个独立
清单。两个 validation inputs 同时受 ZIP、manifest size/SHA-256 和 scan
保护，支持从仓库或解压目录运行；
它只解析部署脚本中列出的函数并在测试脚本作用域导入，不能 dot-source 部署
脚本顶层。测试启动后先逐个通过 `Get-Command -CommandType Function` 验证
函数可见性。

`.github/workflows/native-gateway-companion-ps51.yml` 在 Windows runner 上
明确调用 `powershell.exe` 5.1。只有对应 source revision 的远端 job 成功后
才能创建 annotated tag/Release。未来新 Worker 或重建节点必须从新临时目录
下载 v7，依次运行受保护测试、`-ProvisionDirectories` 和 `-ValidateOnly`；
通过后才可用同一受 hash 保护脚本正式升级。当前已用 v5 成功完成
协议/evaluate readiness 的 WX11P 无需仅为目录初始化重新部署。旧 tag/Release
保持不可变。失败
自动恢复部署前原字节与旧 5100；成功必须验证 health/version/mapping/evaluate
后才可继续 Worker 容器部署。

### Hermes Agent 0.18.2 推理配置边界

Hermes Agent 0.18.2 不会自动把应用层 `ZHIPU_*` 配置解释成 Hermes CLI 的
provider 选择。Mac 与 Windows Worker 使用同一 worker 镜像时，Compose 必须
显式传入 `HERMES_INFERENCE_PROVIDER` 与 `HERMES_INFERENCE_MODEL`，再按
provider 注入其原生变量。当前 Mac 主路径为 `deepseek`，使用
`deepseek-v4-pro`、`DEEPSEEK_API_KEY` 与
`DEEPSEEK_BASE_URL=https://api.deepseek.com`；兼容的 `zai` 路径把现有
`ZHIPU_MODEL`、`ZHIPU_API_KEY`、`ZHIPU_BASE_URL` 映射为 Hermes 识别的
model、`GLM_API_KEY` 与 `GLM_BASE_URL`。

这些 provider 凭据只能在运行时注入 Worker，不得进入镜像层、Git、
`config.yaml` 或日志。Linux platform 不运行 Hermes CLI，因此不得获得
`DEEPSEEK_API_KEY`、`GLM_API_KEY`、`ZAI_API_KEY` 或 `Z_AI_API_KEY`；
平台与 Worker 之间只共享独立的 `HERMES_AGENT_TOKEN`。

Hermes Agent 0.18.2 的 `hermes chat -q` 路径不会可靠采用环境变量或命令行
`--provider/-m`；oneshot/TUI 冒烟因此不能代表十二阶段 chat 路径。Worker
入口必须在 Hermes Server 监听前，将 `HERMES_INFERENCE_PROVIDER` 与
`HERMES_INFERENCE_MODEL` 原子、幂等地写入当前 `HERMES_HOME` 的默认及实际
使用的命名 profile 配置，仅托管 `model.provider`、`model.default` 两个键。
缺少 provider/model 时入口 fail-closed，API key、base URL 以及其他 secret
只能来自环境变量，不能写进 `config.yaml`。运行态验收必须检查真实
`hermes chat -q` 的 provider/model，而不能用 `hermes --safe-mode -z`
或显式 flags 冒烟替代。

## 关键提交

与新拆分流程相关的提交：

- `87be900 显性化开发侧部署边界`

这个提交新增或修改了以下核心入口：

- `deploy/ownership.yml`
- `deploy/targets/linux-prod.json`
- `deploy/targets/windows-prod-full.json`
- `deploy/targets/windows-prod-source.json`
- `scripts/classify-changes.mjs`
- `scripts/build-release-zip.mjs`
- `.env.linux-prod.example`
- `.env.windows-prod.example`
- `.env.dev-distributed.example`
- `src/config.js`
- `package.json`

## 拆分入口

部署端拿到开发分支后，先运行分类器判断文件归属：

```bash
npm run classify:changes -- <base>..<head> --allow-ambiguous
```

例如：

```bash
npm run classify:changes -- release/linux-prod..feat/slx-parser-integration --allow-ambiguous
```

分类结果含义：

- `linux`: 优先进入 `release/linux-prod`
- `windows`: 优先进入 `release/windows-prod`
- `shared`: 两边都要评估，通常两边都需要
- `dev-only`: 只用于测试、合成模型和实机验收脚本，不进入生产 release
- `runtime-data`: 不进入部署分支
- `local-only`: 不进入部署分支
- `ambiguous`: 需要人工判断，不能机械 cherry-pick

## 这次新机制本身如何拆

`87be900` 这个提交本身要让两个部署分支都具备新的拆分能力，因此不能只进入一边。

### `release/linux-prod`

建议包含：

- `.env.linux-prod.example`
- `.env.dev-distributed.example`
- `deploy/ownership.yml`
- `deploy/targets/linux-prod.json`
- `scripts/classify-changes.mjs`
- `scripts/build-release-zip.mjs`
- `src/config.js`
- `package.json`

原因：

- Linux 端是平台后端和前端入口。
- Linux 生产环境应设置 `APP_RUNTIME_ROLE=platform`。
- 生产数据和 skill 目录通过 `APP_DATA_DIR`、`APP_SKILLS_DIR` 外置。
- Linux 端通过 HTTP 访问 Windows VM 上的 Hermes Agent 和 MATLAB Worker。
- 后续通过 `npm run release:zip:linux` 构建 Linux 包。

### `release/windows-prod`

建议包含：

- `.env.windows-prod.example`
- `.env.dev-distributed.example`
- `deploy/ownership.yml`
- `deploy/targets/windows-prod-full.json`
- `deploy/targets/windows-prod-source.json`
- `scripts/classify-changes.mjs`
- `scripts/build-release-zip.mjs`
- `requirements/tcsd-runtime.txt`
- `scripts/tcsd-python-dependencies.mjs`
- `scripts/check-tcsd-python.py`
- `src/config.js`
- `package.json`

原因：

- Windows VM 端运行 Hermes Agent、MATLAB Worker 和 MATLAB/MCP 相关能力。
- Windows VM 生产环境应设置 `APP_RUNTIME_ROLE=hermes-agent`。
- 后续区分完整包和源码更新包：
  - `npm run release:zip:windows-full`
  - `npm run release:zip:windows-source`

## 运行态数据排除规则

无论分类器结果如何，以下内容默认不要进入 release 分支：

- `.mcp.json`
- `.env`
- `data/projects/**`
- `data/uploads/**`
- `data/rejections/**`
- `data/skills.sqlite`
- `data/skill-rules/**`
- `output/**`
- `videos/**`
- `input/**`
- `release-dist/**`
- `test-fixtures/**/artifacts/**`

这些属于本机配置、生产或开发运行态数据、生成产物、验证快照。

## 生产运行边界

`src/config.js` 已经加入生产保护。

Linux 生产端如果设置：

```bash
APP_ENV=production
APP_RUNTIME_ROLE=platform
```

则不能再使用：

```bash
HERMES_TRANSPORT=cli
MATLAB_MCP_TRANSPORT=stdio
```

Linux 生产端必须通过 HTTP 调 Windows VM：

```bash
HERMES_TRANSPORT=api
HERMES_BASE_URL=http://WINDOWS_VM_HOST:3101

MATLAB_MCP_TRANSPORT=http
MATLAB_MCP_BASE_URL=http://WINDOWS_VM_HOST:5100
```

Windows VM 负责运行 Hermes Agent、MATLAB Worker 和 MATLAB/MCP 相关能力。

Windows source update 必须把 `requirements` 作为托管源码，并在覆盖前生成、校验 SHA-256 backup manifest。验证与恢复只使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\SoftwareDocWorker\app\scripts\restore-windows-worker-source.ps1 -InstallDir C:\SoftwareDocWorker -BackupDir C:\SoftwareDocWorker\backups\source-update-YYYYMMDD-HHMMSS -ValidateOnly
powershell -NoProfile -ExecutionPolicy Bypass -File C:\SoftwareDocWorker\app\scripts\restore-windows-worker-source.ps1 -InstallDir C:\SoftwareDocWorker -BackupDir C:\SoftwareDocWorker\backups\source-update-YYYYMMDD-HHMMSS
```

Linux release 在切换前必须先对旧 release 执行 `scripts/rollback-linux-release.sh --app-root /opt/software-doc-generator --target-release /opt/software-doc-generator/releases/<OLD_RELEASE> --validate-only`。真实回滚使用同一命令去掉 `--validate-only`，不得以未经校验的手工软链接或复制命令替代。

## 单元测试 TCSD Agent 十二阶段流水线 V2

本功能新增顶层页面 `/unit-test-case-generation`，平台端接收 1 个 `.slx`、1 个 `.mat`、可选 1 个模型初始化 `.m` 脚本和 1 个项目编号，在 `data/unit-test-case-generation/tasks/<taskId>/workspace` 下创建隔离 workspace，并在创建任务时固化所选 Windows Worker。平台端通过该 Worker 对应的 Hermes Client 创建和轮询十二阶段 job，只登记项目、任务和下载 `workspace/outputs/*.xlsx`；上传的模型、MAT 数据、初始化脚本、项目登记 JSON 和生成的 Excel 都属于运行态数据，不进入 release 分支。

TCSD 生产入口固定为 `POST /internal/tcsd-pipeline/jobs` 与 `GET /internal/tcsd-pipeline/jobs/:jobId`，共享作业协议为 `tcsd-agent-stage-pipeline/v2`。Linux 平台只创建、轮询和对账远端 job；Windows Hermes Agent 持久化 job 与阶段事件，并通过 `TcsdHermesStageExecutor` 为十二个阶段分别启动一个全新的 Hermes session。旧整体 Agent step 和平台直接运行 Python 的生产入口已经删除，不存在双轨或 fallback。

十二个 `skills/hermes/tcsd-stage-*` 目录各自只包含一个原子 `SKILL.md` 与发现元数据。Windows 任务启动前由 `TcsdHermesSkillRegistry` 把它们安装到所选 Hermes profile 的 `skills/tcsd/<skill-name>`，把共享 runtime 安装到相邻的 `skills/tcsd/tcsd-runtime`，然后真实执行 `hermes [-p <profile>] skills list`；缺少任一名称、目录、版本、SKILL.md hash 或 bundle hash时，任务 fail-closed。可以在发布后运行：

```powershell
.\scripts\install-tcsd-hermes-skills.ps1 -SnapshotPath C:\ProgramData\SoftwareDocGenerator\tcsd-skill-snapshot.json
```

安装器只覆盖其自身 marker 证明未被人工修改的 TCSD 目录；同名的未知/已修改目录会中止安装。任务保存 `tcsd-hermes-skill-snapshot/v1`，随后每个阶段 prompt 以对应 `/tcsd-stage-xx-*` 斜杠命令开头并执行通用 `tcsd_stage_execute`。脚本、模板、MATLAB/SATK、Coverage IR、仿真、工作簿和覆盖率能力集中在非技能目录 `skills/hermes/tcsd-runtime`；技能只调用共享 runtime，不复制整套实现。技能和 runtime 均计算稳定内容 hash，并在 checkpoint 中记录 bundle version。

阶段边界协议为 `tcsd-agent-stage-input/v1` 与 `tcsd-agent-stage-result/v1`。Agent 只负责调用共享 runtime 生成候选 result；宿主不采信 Agent 文本。宿主用 openpyxl/JSON 重新解析 Probe 计划与实际观察、TCSD workbook 的根端口/参数/动作/等待顺序、每个 simulation 用例/步骤/输出/`expValue`，并从覆盖率报告的 covered/total 推导百分比。空模板、空 simulation、空 coverage、伪造计数/覆盖率、覆盖不足却跳过修正、修正后跳过最终验证均被拒绝。阶段 12 Agent 只能给出清理证据；`completed` execution manifest、timeline 和 artifact manifest 必须由宿主从已验证 checkpoint 自动生成。只有这些 validator 通过后，宿主才写 `tcsd-agent-stage-checkpoint/v2`。

checkpoint 记录技能名/版本/SKILL.md hash/bundle hash、runtime hash、Hermes session、profile、实际 model、token usage、prompt hash、attempt、输入/结果文件及 hash、验证报告、工具日志摘要和产物。`read_hermes_session.py` 只读查询所选 profile 的 `state.db`，要求该 session 的首轮 user message 以精确 `/技能名` 调用开头；同时校验 Hermes 官方 `skills/.usage.json` 中该技能的 `use_count` 在 CLI 调用窗口内递增且 `last_used_at` 位于该窗口，并校验已安装 SKILL.md 的字节 hash。checkpoint 只保存 invocation message id/hash、计数、时间与 skill hash，不保存消息正文。这是由 state.db 与 Hermes 技能 usage sidecar 组合形成的运行态加载证据，不是 Agent 自报。只保存 stdout/stderr 字节数等摘要，不保存 Agent 隐藏推理、原始对话、凭据或敏感日志。默认每阶段 `200` turns、`3600000` ms；Windows 可设置 `TCSD_STAGE_HERMES_MAX_TURNS`、`TCSD_STAGE_HERMES_TIMEOUT_MS` 与 `TCSD_STAGE_HERMES_PROFILE`，其中 profile 回退到 `HERMES_PROFILE`。如 profile 使用独立状态库，可设置 `TCSD_STAGE_HERMES_STATE_DB_PATH`；如 Hermes skills 不在 state.db 同目录的 `skills`，可设置 `TCSD_STAGE_HERMES_SKILLS_DIR`。

阶段 2 使用真实执行 Canary，而非可执行文件存在性检查：导入 PyYAML/openpyxl、在 workspace 创建/读取/删除随机 sentinel、通过 SATK/MCP 让 MATLAB 返回随机 nonce、检查 Simulink license/load/version，并要求 MATLAB 写出同 nonce sentinel。direct MCP server 按固定跨平台顺序发现：显式 `SATK_MCP_SERVER`、官方 `~/.matlab/agentic-toolkits/bin/matlab-mcp-server(.exe)`、旧 `matlab-mcp-core-server(.exe)`、发布仓库 `tools` fallback；direct 环境证据保存实际路径、发现来源、文件大小和 SHA-256，宿主重新读取并校验 hash。Gateway discovery 不得伪造 Worker 容器内不存在的 executable path；它保存经过认证的 Gateway `/health` 与 `/version` schema/版本证据及规范化 SHA-256，host validator 使用配置的 Gateway URL/token 重新请求当前 health/version，重算 hash、核对服务和版本字段，并拒绝混入 path/size/executable hash 的 Gateway 证据。MATLAB nonce sentinel 仍证明该 Gateway 实际完成了 canary 执行。MCP 返回空而 sentinel 不存在属于执行通道故障。`TCSD_PIPELINE_ENV_CANARY_FIXTURE` 只供 `tests/tcsd-runtime` 的 dev-only 单元测试使用，Windows 生产不得设置。

Gateway 网络恢复边界固定为：仅 `GET`、`PUT`、`DELETE` 遇到网络类
`URLError` 时按 100ms、250ms 退避，最多形成三次总尝试；host validator
读取 health/version 使用相同策略。`POST` job/cancel 不自动重试，HTTP
4xx/5xx 也不重试，防止重复 job、cancel 或掩盖确定性服务错误。

第 7 阶段的静态 workbook/obligation 匹配仅是规划诊断，使用不可变的 `*_planning_obligations_snapshot.json` 生成 `tcsd-planning-mapping-assessment/v1`。该 assessment 只允许 `satisfied` 或非阻断的 `advisory`，不能声明实测覆盖率；阶段 checkpoint 与宿主 execution manifest 均把它标记为 `authority=planning`，并明确由第 9 阶段的 `measured-simulink-coverage` 取代。最终 Condition/Decision/MC/DC、80% 判断和未解决项只采信宿主解析的真实覆盖率报告，不保留未解释的 `failed` 静态质量报告。

只有候选 result、产物或 checkpoint 的确定性校验失败才允许自动修复一次。修复必须启动第十三个新 session，并携带上一尝试的宿主验证报告；第二次仍失败即终止。输入、环境、MATLAB/SATK、Hermes 不可用、遥测缺失、session 复用和超时等硬错误直接失败，不重试。阶段 10 内部仍只允许一次 Coverage IR 用例修正；宿主验证修复不会放宽此限制。

服务启动时扫描非终态 V2 job：已验证 checkpoint 不重复执行，并恢复 coverage、repair 和产物汇总；无有效 checkpoint 的未完成阶段只能使用剩余的新 session 机会恢复。同一幂等键不会创建第二个 job。终态 `tcsd-deterministic-pipeline/v1` 仅只读保留，非终态 V1 标为 `tcsd_pipeline_version_obsolete`，不得混入 V2 恢复。

十二个中文阶段及其职责固定为输入校验、环境检查、工作区初始化、接口提取、覆盖目标分析、状态 Probe、首版用例、仿真回填、首轮覆盖率、Coverage IR 修正、最终验证和产物/清理。Windows 继续使用 `SATK_MATLAB_SESSION_MODE=new`，每次 MATLAB/SATK 调用自包含，不依赖上一 session 的 base workspace。`unsupported`、`unresolved`、有证据的 `unreachable` 或最终覆盖不足以“部分完成”保留，不得伪装成完全达标。

部署边界如下：

- `release/linux-prod` 包含页面、任务创建/轮询、V2 状态同步和十二阶段追溯展示；明确排除 `tcsd-stage-*` 与 `tcsd-runtime`。
- `release/windows-prod` 包含 Hermes job 路由、`TcsdHermesStageExecutor`、十二技能、共享 runtime、MATLAB/SATK 和宿主 checkpoint。
- shared 包含协议/schema、阶段目录、错误分类、bundle hash、配置和部署说明。
- dev-only 包含 `tests/tcsd-runtime` 的合成模型、fake Hermes、负向合同测试和真实黑盒验收驱动；Windows release 不含 `tests/**`，runtime hash 也不包含测试夹具。
- `data/unit-test-case-generation/**`、`APP_DATA_DIR/tcsd-pipeline-jobs`、`.tcsd-agent/**`、`.tcsd-checkpoints/**`、Hermes session/state DB、模型、MAT、addon、XLSX、coverage、日志和临时文件均是 runtime/local，不进入 release 或功能提交。

Linux 的 `UNIT_TEST_CASE_REMOTE_POLL_WINDOW_MS` 只控制单次同步窗口；超时或短暂网络失败保持 `running/workerPending`，由 `UNIT_TEST_CASE_RECONCILE_INTERVAL_MS` 继续对账。404 job-not-found 才作为永久失败。Windows 需要配置 `TCSD_PIPELINE_PYTHON`、`MATLAB_ROOT` 和上述阶段 Hermes 变量。

多 Worker 生产拓扑由 Linux 的 `UNIT_TEST_WORKER_PROFILES_JSON` 定义，每项至少包含稳定 `id`、展示 `label`、对应物理机的 `hermesBaseURL` 和 `matlabBaseURL`，默认项由 `UNIT_TEST_DEFAULT_WORKER_ID` 指定。任务保存 Worker 快照，队列按 `worker:<id>` 约束同机串行，TCSD 首次创建和重启后轮询必须始终使用该任务对应的 Hermes 客户端。两台 Windows Worker 不共享配置分支：`release/windows-prod` 与 `worker/wx11p-laptop10` 各自保留服务、Hermes profile、依赖和机器路径差异，只共同接收 shared/Windows TCSD 协议与技能载荷。

Windows 供应阶段应运行 `py -3.11 -c "import sys; print(sys.executable)"`，并将输出的绝对 `python.exe` 路径配置为 `TCSD_PIPELINE_PYTHON`。不要使用 PATH 中的 `python` 或 `python3` 示例，因为它们可能解析到旧版本或 Microsoft Store alias。变量未配置时，共享 Node resolver 才回退到 executable `py` 和独立参数前缀 `-3.11`；Linux/macOS 无显式配置时仍使用 `python3`。

Windows full/source 包同时携带固定清单 `requirements/tcsd-runtime.txt`、跨平台入口 `scripts/tcsd-python-dependencies.mjs` 和离线门禁 `scripts/check-tcsd-python.py`。供应顺序固定为：设置上述绝对解释器路径，运行 `npm run install:tcsd-python`，再运行 `npm run check:tcsd-python`、`npm ci` 和 `npm test`。安装入口只用同一解释器执行 `-m pip install --requirement requirements/tcsd-runtime.txt`；门禁核对 Python 3.11、PyYAML 6.0.3、openpyxl 3.1.5 和必要传递依赖 et_xmlfile 2.0.0，并以同一解释器通过 `-I -B` 执行 `host_validate_tcsd_stage.py --self-check`，证明隔离 `sys.path` 下三个受信同目录模块的导入闭包可执行。自检不读取任务 request、不调用 MATLAB/Hermes、不写 `__pycache__` 或 runtime/local 数据；失败必须在 `npm test` 之前终止。正式构包只执行门禁，不自动 pip install 或联网。Linux target 显式排除这两个脚本和清单，也不执行 TCSD Python 门禁。

## 独立软件详设 / 模块功能描述生成 V1

本功能新增独立页面 `/software-detail-design-generation`，UI 展示为“软件详设生成”，代码、API 和任务类型使用 `software_module_description_generation` / `module-description` 语义，不接入旧 `/detail-design-generation`、`detail_design`、`generator.js` 或旧软件详设生成服务。平台端接收 1 个 `.slx`、1 个 `.mat`、可选 1 个模型初始化 `.m` 脚本和 1 个项目编号，在 `data/software-module-description-generation/tasks/<taskId>/workspace` 下创建隔离 workspace，并通过 Hermes step `simulink_module_description_generate` 发给 Windows VM。平台端只登记项目、任务和下载 `workspace/outputs/*.docx`；上传文件、任务 JSON 和生成 DOCX 都属于运行态数据，不进入 release 分支。

项目 registry、项目编号和 addon root 继续复用单元测试用例生成配置。Hermes Agent 在启动 CLI 前从 `UNIT_TEST_CASE_PROJECT_ADDON_ROOT/<编号>` 复制项目 addon 到 workspace 根目录，并继续拒绝 symlink、路径逃逸和覆盖上传输入文件。新链路的 Hermes prompt 要求调用 `simulink-module-description-generator` skill，使用 workspace 中已经复制的 addon/init 文件，不读取外部 addon root，不假设存在需求 PDF，只登记 `outputs/*.docx`。

生产拆分端速读：

- Linux 平台端负责 `/software-detail-design-generation` 页面、`/api/software-module-description-generation/tasks` API、上传下载、任务持久化、队列状态和向 Hermes Agent HTTP 服务发起请求，不直接运行 MATLAB，也不读取 Windows addon root。
- Windows VM 端负责 `simulink_module_description_generate` step、项目 addon 复制、Hermes CLI、MATLAB/SATK、`simulink-module-description-generator` skill 和 DOCX 产物生成。
- Shared 协议负责把 `workspaceDir/modelSlxPath/modelMatPath/outputDir/unitTestProject/skillName/expectedOutputPattern` 以及可选 `modelInitScriptPath/modelInitScriptFileName/projectInitScripts` 固定传给 Hermes，再把返回或回收得到的 `outputs/*.docx` 归一化成平台 artifact。
- 运行态数据只留在 `data/software-module-description-generation/**`；外部项目 addon 包仍只放在 Agent 机器配置的 addon root 下，部署端不要把用户上传的 `.slx/.mat/.m`、生成的 `.docx` 或 addon 包内容带进 release 分支。

新增配置项：

```bash
SOFTWARE_MODULE_DESCRIPTION_SKILL_NAME=simulink-module-description-generator
SOFTWARE_MODULE_DESCRIPTION_EXPECTED_OUTPUT_PATTERN=outputs/*.docx
SOFTWARE_MODULE_DESCRIPTION_AGENT_WORKSPACE_ROOT=
HERMES_TIMEOUT_SIMULINK_MODULE_DESCRIPTION_GENERATE_MS=3600000
HERMES_MAX_TURNS_SIMULINK_MODULE_DESCRIPTION_GENERATE=10000
```

如果 Linux 平台和 Windows VM 不是同一套绝对路径，`SOFTWARE_MODULE_DESCRIPTION_AGENT_WORKSPACE_ROOT` 可显式设置；未设置时会回退到 `UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT`。Windows VM 需要安装或随包携带 `simulink-module-description-generator` skill，并准备 MATLAB/SATK 环境。

Mac 本机开发的一键脚本默认启动平台服务和本地 Hermes Agent sidecar：平台端监听 `3000`，Hermes Agent 监听 `3101`，平台端通过 `HERMES_TRANSPORT=api` 调用 sidecar，并将 `HERMES_SERVER_REQUEST_TIMEOUT_MS` 设为 `0` 以支持长任务。在 Darwin 上，`scripts/start-local.sh` 仅为本机 all-in-one 进程显式注入 `MATLAB_ROOT=/Applications/MATLAB_R2026a.app`、`SATK_MATLAB_ROOT=/Applications/MATLAB_R2026a.app` 和 `SATK_MATLAB_SESSION_MODE=new`，避免电脑重启后 Stage 02 依赖不存在的共享 MATLAB 会话；该 macOS 路径不得进入 Windows/Linux 生产环境配置，Windows 生产仍使用自己配置的 MATLAB 根目录与 `SATK_MATLAB_SESSION_MODE=new`。sidecar health 只证明 Node API 壳可访问；只有 checkpoint 中的真实外部 model、12 个不同 session、token usage，以及 `state.db` 精确 slash invocation 与 Hermes skill-usage 计数/时间组合证据才能证明 LLM-backed 阶段执行，fake Hermes E2E 不能替代。TCSD 每阶段默认 `TCSD_STAGE_HERMES_TIMEOUT_MS=3600000`、`TCSD_STAGE_HERMES_MAX_TURNS=200`。可以通过 `TCSD_STAGE_HERMES_PROFILE=deepseek` 只覆盖 TCSD 阶段 profile；未设置时回退 `HERMES_PROFILE`。若使用命名 profile，必须确保对应的 Hermes `state.db` 可由 Agent 读取，必要时设置 `TCSD_STAGE_HERMES_STATE_DB_PATH`。

Mac 宿主 Gateway 还必须在监听端口前通过真实 MCP `initialize` 加最小
`evaluate_matlab_code` preflight，并为 MCP 使用状态目录内权限为 `0700` 的
专用 log 目录及显式 `--log-folder`。macOS MCP temp/socket 默认改用有界的
`os.tmpdir()/sdg-mcp`（超过 80 bytes 时使用 `/tmp/sdg-mcp`），权限为 `0700`，
避免仓库长路径触发 MATLAB `File name too long`。preflight 受
`MATLAB_GATEWAY_MCP_PREFLIGHT_TIMEOUT_MS` 硬超时约束，失败必须在监听前退出
并给出脱敏类别。该 Darwin 参数和路径不得进入
Windows release；Windows 继续使用自己的 MCP 参数。MCP 子进程错误只允许
传播固定大小的脱敏 stderr 尾部和结构化类别，不能传播 token、环境值、用户
绝对路径或隐藏推理。MCP tool 的 `isError`、structured error，以及明确失败
文本都必须使 Gateway job 进入 `failed`，不能生成 succeeded artifact。

项目选择只在平台端保存编号和展示名，例如 `01_楚能`、`02_TMS`；任务 payload 内部只依赖 `unitTestProject.id`，例如 `01`。Hermes Agent 启动 CLI 前会从当前 Agent 进程的 `UNIT_TEST_CASE_PROJECT_ADDON_ROOT/<编号>` 复制全部 addon 内容到 workspace 根目录。Mac 本地默认 addon root 是 `.local/project-addons`，目录示例为 `.local/project-addons/01`；Windows 生产默认 addon root 是 `C:\ProgramData\SoftwareDocGenerator\project-addons`，目录示例为 `C:\ProgramData\SoftwareDocGenerator\project-addons\01`。
Windows 容器生产 preflight 同样从 `UNIT_TEST_CASE_DEFAULT_PROJECTS` 的展示名解析数字项目 ID，不能要求宿主目录使用 `01_楚能` 或 `02_TMS`。

初始化脚本支持两种模式：未上传 `.m` 时，Hermes/skill 使用项目 addon 中已经复制到 workspace 的通用初始化脚本，由 `setup_ut_support(rootDir)` 自动发现；上传 `.m` 时，平台把脚本放入 `workspace/inputs` 并通过 `projectInitScripts` 显式传给 Hermes，Hermes/skill 应优先执行该模型级脚本，不再用 addon 自动发现来决定初始化入口。addon 仍会照常复制和加入 MATLAB path，用于库、数据字典、接口包和其他项目依赖。

生产 Linux 和 Windows VM 如果不是同一套绝对路径，需要在 Linux 平台端设置：

```bash
UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT=C:\\software-doc-generator\\data\\unit-test-case-generation\\tasks
```

该变量会把 Linux 平台本地 task workspace 映射成 Windows Hermes Agent 可见路径。Windows VM 需要随包携带十二个 `tcsd-stage-*` 技能与 `tcsd-runtime`，并准备 Hermes CLI、MATLAB/SATK 环境变量，例如：

```bash
UNIT_TEST_CASE_PROJECT_ADDON_ROOT=C:\\ProgramData\\SoftwareDocGenerator\\project-addons
UNIT_TEST_CASE_PROJECT_ADMIN_CODE=114301
UNIT_TEST_CASE_DEFAULT_PROJECTS=01_楚能,02_TMS
```

Windows VM 用户自行维护 addon 目录内容；平台和 Agent 只按编号复制，不创建、不删除、不编辑这些外部包。

```bash
SATK_MCP_LOG_FOLDER=C:\\Temp\\matlab-mcp-core-server-codex
SATK_MATLAB_SESSION_MODE=new
```

## Release 包构建入口

Linux 包：

```bash
npm run release:zip:linux
```

Windows 完整包：

```bash
npm run release:zip:windows-full
```

Windows 源码更新包：

```bash
npm run release:zip:windows-source
```

这些命令读取 `deploy/targets/*.json`，不要再手写 include/exclude 列表。

## 部署端 AI 推荐流程

1. 拉取开发分支最新提交。
2. 确认要拆分的 commit range。
3. 运行 `npm run classify:changes -- <base>..<head> --allow-ambiguous`。
4. 按分类结果处理：
   - `linux` 进入 `release/linux-prod`
   - `windows` 进入 `release/windows-prod`
   - `shared` 两边都评估，通常两边都需要
   - `dev-only`、`runtime-data` 和 `local-only` 排除
   - `ambiguous` 结合提交说明和文件内容人工判断
5. 每个 release 分支提交前检查：

```bash
git diff --cached --stat
git diff --cached --name-status
```

确认没有混入运行态数据后再提交。
