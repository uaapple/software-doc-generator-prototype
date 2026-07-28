# Windows 原生 MATLAB Gateway companion v5 部署 Agent 提示词

你正在 WX11P 上验证并部署正式 companion v5。只允许使用发布者给出的 v5
annotated tag、peeled commit、GitHub Release URL 和四项资产 SHA-256；禁止
继续使用 v1/v2/v3/v4、现场 `ps51`/`enhanced` 副本或任何手工修改脚本。
必须下载到全新的临时目录，不得复用 v4 解压目录。

冻结边界：

- 服务：`SoftwareDocMatlabWorker`
- 安装根：`C:\SoftwareDocWorker`
- 原生 env：`C:\SoftwareDocWorker\software-doc-worker.env`
- 容器 env：用户提供的未跟踪 `.env.windows-docker-desktop` 绝对路径
- MATLAB：R2025b
- Worker imageRevision：
  `sha256:5e57aff413c616faba9d4d690db1ac6af58d26259c1969a8ba9802f3aa7f69ab`
- Platform imageRevision：
  `sha256:2260ce959b49b5721fd577c0c0a37e0a91b5a3c49ca84fdefb4e5fd007613ff2`

不得 build、push 或替换 Platform/Worker 镜像，不得修改 addon、runtime/data、
Hermes Home/session、用户输入输出或 MATLAB 产物。不得输出 env 值、token、
API key、路径中的用户名或日志中的环境值。

## 执行顺序

1. 只读审计当前状态：

   - 记录服务状态与 PathName；若 Running，确认旧
     `http://127.0.0.1:5100/health` 正常且 `/version` 为 404；
   - 只报告当前 6 个受管文件是否与可信旧 backup manifest 一致；没有可信
     backup 时报告“无法证明”，不得读取受 ACL 保护备份之外的秘密；
   - 分别统计两个 env 的 `MATLAB_GATEWAY_EVALUATE_TOKEN` 键数量，只在内存
     比较值，报告 count 与 `valuesEqual`，绝不报告值、长度、hash 或前后缀；
   - 确认容器 env 的 `SDG_CONTAINER_DATA_DIR`、
     `MATLAB_GATEWAY_STATE_DIR`、`MATLAB_GATEWAY_CONTAINER_ROOT`、
     `SATK_GATEWAY_MAPPING_ID` 各恰好一个非空值，只报告
     `present=true/false`。不要输出路径值。

2. 下载 v5 Release 的 ZIP、manifest、scan、release JSON 到新临时目录，逐项
   核对发布者提供的外部 SHA-256。解压到新目录，不覆盖生产 app。

3. 核对 release/manifest：

   - `companionVersion=5`；
   - source/deployment revision 等于发布者给出的 peeled commit；
   - 6 个 managed Gateway files、1 个 deployment tool、1 个 read-only
     `powershell.exe-5.1` validation file；
   - ZIP 内每项 size/SHA-256 与 manifest 一致；
   - `rootfsInputsChanged=false`，两个 imageRevision 与冻结值一致。

4. 从解压后的 v5 ZIP 运行受 hash 保护的 PS5.1 测试：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\test-native-matlab-gateway-companion-ps51.ps1 `
     -RepositoryRoot <v5解压目录>
   ```

   必须看到 `Native Gateway Windows PowerShell 5.1 tests passed.`；失败立即
   停止，不采用临时脚本绕过。

5. 用管理员 Windows PowerShell 5.1 先执行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <v5解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径> `
     -ValidateOnly
   ```

   `ValidateOnly` 必须在服务仍运行时完成，并报告 mapping/MATLAB/MCP/session
   configuration validation passed。若报告 `HOST_ROOT_*`、`STATE_DIR_*`、
   `CONTAINER_ROOT_*`、`MAPPING_ID_*`、`MATLAB_ROOT_*`、`MCP_*`、
   `TOOLKIT_*` 或 `SESSION_MODE_*` 类别，停止并只报告类别。

6. 只有步骤 1–5 全部通过，才在同一管理员会话中使用同一受 hash 保护脚本
   正式升级（去掉且仅去掉 `-ValidateOnly`）：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <v5解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径>
   ```

   脚本会先备份部署前的 6 个受管文件、两个 env 原字节与服务配置，再精确
   停止/恢复 `SoftwareDocMatlabWorker`。它会在 120 秒有界等待内检查服务、
   TCP 5100 和 `/health`，随后真实验证 `/version`、`/capabilities`、
   `worker-data` workspace mapping 和 `evaluate_matlab_code`。任何失败必须
   自动恢复旧 5100；不得手工续跑或继续容器部署。

7. 正式脚本成功后再独立核验：

   - 服务 Running；
   - `/health` 返回 ok；
   - 带批准 Gateway token 的 `/version` 返回 gatewayVersion；
   - `/capabilities` 包含 workspace/job 与 evaluate 能力；
   - 新 backup manifest 存在且受 ACL 保护；
   - 两个 env 的 evaluate-token key 各恰好一个且内存比较相同；
   - 原生映射键与容器来源键内存比较等价，mapping ID 为 `worker-data`、
     container root 为 `/var/lib/sdg/data`，只报告布尔结论，不输出 host 路径。

8. 只报告 tag、tag object、peeled commit、四项资产 SHA-256、PS5.1 测试、
   ValidateOnly、正式部署、health/version/capabilities/mapping/evaluate 和
   rollback 结论。成功后停止，等待 Worker 容器部署指令；不得自行切 Hermes
   3101 或部署 Linux。
