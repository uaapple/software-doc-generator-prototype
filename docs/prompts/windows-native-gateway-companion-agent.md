# Windows 原生 MATLAB Gateway companion 部署 Agent 提示词

你正在 WX11P 上执行一次受控的 Windows 原生 MATLAB Gateway companion
升级。不得构建或重传 Platform/Worker 镜像，不得修改生产分支，也不得读取或
输出任何 token/API key 值。

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

执行顺序：

1. 只读记录当前 `SoftwareDocMatlabWorker` 状态、5100 health、服务 PathName、
   原生 app revision 和当前 Worker image digest。确认旧 Gateway 只有
   `/mcp/tools/analyze_slx` 时，不得把旧 `/health` 当作新版兼容证据。
2. 在解压前后计算 ZIP SHA-256，并与 release JSON 和发布者给出的值比较。
   同时校验 release、manifest、scan 文件 SHA-256；任何不一致立即停止。
3. 将 ZIP 解压到新的临时目录，不覆盖 app。先执行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径> `
     -ValidateOnly
   ```

4. `ValidateOnly` 通过后，去掉 `-ValidateOnly` 执行部署。脚本只能停止
   `SoftwareDocMatlabWorker`，备份 manifest 声明的 Gateway 文件、两个 env 和
   服务配置，再替换受管文件。不得停止/修改 Hermes 服务、Docker、MATLAB
   安装、SATK、addon、runtime/data、Hermes Home/session、输入输出或产物。
5. `MATLAB_GATEWAY_TOKEN` 必须复用原生 env 的现有批准值。不得把它当作
   evaluate token。若两个 env 都没有 `MATLAB_GATEWAY_EVALUATE_TOKEN`，允许
   脚本本地随机生成并原子写入两处；不得回显该值。两个 env 已有不同值时必须
   停止。
6. companion 部署脚本必须在 5100 上完成 `/version`、`/capabilities` 和真实
   `evaluate_matlab_code` probe。失败时确认脚本已自动恢复旧文件/env 和旧
   5100，再停止后续步骤。
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
