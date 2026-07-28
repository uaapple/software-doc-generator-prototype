# Windows 原生 MATLAB Gateway companion v2 部署 Agent 提示词

你正在 WX11P 上执行一次受控的 Windows 原生 MATLAB Gateway companion
升级。不得构建或重传 Platform/Worker 镜像，不得修改生产分支，也不得读取或
输出任何 token/API key 值。

禁止继续运行现场临时修改的
`deploy-native-matlab-gateway-ps51.ps1`、
`deploy-native-matlab-gateway-ps51-enhanced.ps1` 或任何 `enhanced` 副本。
它们不是正式制品。只允许使用发布者给出的 v2 ZIP 内、且 hash 已核对的
`deploy-native-matlab-gateway.ps1`。

已批准且必须保持：

- 服务：`SoftwareDocMatlabWorker`
- 安装根：`C:\SoftwareDocWorker`
- 原生 env：`C:\SoftwareDocWorker\software-doc-worker.env`
- 容器 env：用户提供的未跟踪 `.env.windows-docker-desktop` 绝对路径
- MATLAB：R2025b
- Hermes provider：`deepseek`
- model：`deepseek-v4-pro`
- base URL：`https://api.deepseek.com`
- Worker imageRevision：
  `sha256:5e57aff413c616faba9d4d690db1ac6af58d26259c1969a8ba9802f3aa7f69ab`
- Worker GHCR reference：继续使用既有 manifest 中已在 WX11P 验证的精确
  `repository@sha256:...`，不得改成 tag、重新 build 或重新 push。

只接受以下输入：

1. companion ZIP；
2. companion release JSON、manifest JSON、scan JSON；
3.发布者给出的四个 SHA-256；
4. 未跟踪容器 env 的绝对路径。
5. 如 v1 失败曾生成正式 backup，提供该 backup 的绝对路径；它只能证明当次
   backup 时的字节，不能证明人工写入 evaluate token 之前的状态。

执行顺序：

1. 首先只读审计当前安全状态，不复制、不改写 env：

   - `SoftwareDocMatlabWorker` 必须为 `Running`，记录服务状态与 PathName；
   - `http://127.0.0.1:5100/health` 必须返回旧 Gateway 健康；
   - 以 v1 正式 backup manifest 中的文件 hash/存在性为基线，确认 6 个受管
     app 文件已恢复。没有可信 backup 时明确报告“无法证明恢复”，不得猜测；
   - 分别读取两个 env 中名为 `MATLAB_GATEWAY_EVALUATE_TOKEN` 的键，只在内存
     中确认每个文件恰好 1 项且两个值相同。只报告计数和 `valuesEqual=true`，
     不得输出值、长度、前后缀或 hash；
   - 记录当前 Worker 精确 image digest，必须仍是已批准 digest。

   任一项不满足时停止，不运行 v2。当前 backup 是人工写 token 后的字节基线；
   不得声称 v2 能恢复到 token 写入前状态。旧 Gateway 只有
   `/mcp/tools/analyze_slx` 时，不得把旧 `/health` 当作新版兼容证据。
2. 在解压前后计算 ZIP SHA-256，并与 release JSON 和发布者给出的值比较。
   同时校验 release、manifest、scan 文件 SHA-256；任何不一致立即停止。
3. 将 v2 ZIP 解压到新的临时目录，不覆盖 app。确认 asset/manifest 的
   `companionVersion=2` 后，先执行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径> `
     -ValidateOnly
   ```

4. `ValidateOnly` 必须先验证 Windows PowerShell 5.1/.NET Framework 的
   CSPRNG、非空 backup `File.Replace` 与不存在目标的原子创建能力，且不能
   修改两个 env。通过后，去掉 `-ValidateOnly` 执行部署。脚本只能停止
   `SoftwareDocMatlabWorker`，备份 manifest 声明的 Gateway 文件、两个 env 和
   服务配置，再替换受管文件。不得停止/修改 Hermes 服务、Docker、MATLAB
   安装、SATK、addon、runtime/data、Hermes Home/session、输入输出或产物。
5. `MATLAB_GATEWAY_TOKEN` 必须复用原生 env 的现有批准值。不得把它当作
   evaluate token。两个 env 已有同一个 evaluate token 是合法的续跑输入：
   v2 必须先备份当前字节，然后保留该值，不重新生成、不回显、不删除。若两个
   env 都没有 `MATLAB_GATEWAY_EVALUATE_TOKEN`，允许脚本以
   `RandomNumberGenerator.Create()` 生成新的 32-byte 随机值并原子写入两处；
   不得回显。两个 env 值不同或任一 env 出现重复键时必须停止。
6. 服务 Start 后不能仅以 `Service=Running` 判定成功。v2 必须在 120 秒总
   上限内轮询服务状态、TCP 5100 与 `/health`；服务提前停止应立即失败，单次
   health 请求不得突破总等待上限。health 就绪后才执行 `/version`、
   `/capabilities` 和真实 `evaluate_matlab_code` probe。失败时确认脚本已
   自动恢复 backup 中的旧文件/env，并用同样有界策略恢复旧 5100，再停止。
7. Gateway 验证通过后，才执行容器配置与 preflight：

   ```powershell
   $env:SDG_PROD_ENV_FILE = '<未跟踪容器env绝对路径>'
   npm run container:prod:windows:config
   npm run container:prod:windows:preflight
   ```

8. 继续复用已验证的 Worker 精确 digest，只切换 Hermes 3101：

   ```powershell
   npm run container:prod:windows:up
   npm run container:prod:windows:test
   ```

   `test` 必须从 Worker 容器真实完成 Gateway evaluate probe。仅 health/version
   通过不算完成。
9. Windows Worker 通过后才允许部署 Linux Platform。Linux 仍使用已有精确
   digest，不接受 `latest` 或本地 build。

回滚：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy-native-matlab-gateway.ps1 `
  -CompanionRoot <解压目录> `
  -InstallDir C:\SoftwareDocWorker `
  -ContainerEnvFile <未跟踪容器env绝对路径> `
  -Rollback `
  -BackupDir <部署输出的backup目录> `
  -ValidateOnly

# ValidateOnly 通过后去掉该开关执行真实回滚。
```

最终仅报告 revision、digest、文件 hash、服务状态、readiness 类别和备份目录；
不得报告 env 内容、token、API key、Hermes session 内容或用户文件名。
