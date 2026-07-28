# Windows 原生 MATLAB Gateway companion v3 验证 Agent 提示词

你正在 WX11P 上执行 companion v3 的只读/无部署验证。本轮只允许：

1. 审计当前生产安全状态；
2. 下载并校验正式 v3 Release；
3. 从 v3 ZIP 内运行受 manifest hash 保护的 Windows PowerShell 5.1 行为测试；
4. 运行 v3 `-ValidateOnly`；
5. 报告结果并停止。

不得去掉 `-ValidateOnly`，不得停止/启动服务，不得修改 env、app、Docker、
MATLAB、SATK、addon、runtime/data、Hermes Home/session、用户输入输出或产物。
不得部署 Linux，不得切换 Hermes 3101。

禁止运行现场临时修改的：

- `deploy-native-matlab-gateway-ps51.ps1`
- `deploy-native-matlab-gateway-ps51-enhanced.ps1`
- 任何 `enhanced`、手工修补或 v2 脚本副本

只允许使用正式 v3 ZIP 内、且 hash 已核对的两个根目录脚本：

- `test-native-matlab-gateway-companion-ps51.ps1`
- `deploy-native-matlab-gateway.ps1`

## 冻结生产边界

- 服务：`SoftwareDocMatlabWorker`
- 安装根：`C:\SoftwareDocWorker`
- 原生 env：`C:\SoftwareDocWorker\software-doc-worker.env`
- 容器 env：用户提供的未跟踪 `.env.windows-docker-desktop` 绝对路径
- MATLAB：R2025b
- Worker imageRevision：
  `sha256:5e57aff413c616faba9d4d690db1ac6af58d26259c1969a8ba9802f3aa7f69ab`
- Platform imageRevision：
  `sha256:2260ce959b49b5721fd577c0c0a37e0a91b5a3c49ca84fdefb4e5fd007613ff2`

不得 build、push 或替换 Platform/Worker 镜像。

## 执行顺序

1. 只读审计当前状态：

   - 记录 `SoftwareDocMatlabWorker` 状态与 PathName；
   - 若服务为 Running，确认 `http://127.0.0.1:5100/health` 是旧 Gateway health；
     若服务不是 Running，只报告实际状态，不擅自启动；
   - 以 v1/v2 正式 backup manifest 为依据，核对 6 个受管 app 文件的
     hash/存在性是否恢复；没有可信 backup 时报告“无法证明恢复”，不得猜测；
   - 分别统计两个 env 中 `MATLAB_GATEWAY_EVALUATE_TOKEN` 键的数量，只在内存
     中比较值。每个文件必须恰好 1 项且两个值相同；
   - 只报告 `nativeCount`、`containerCount` 和 `valuesEqual=true/false`，不得
     输出 token 值、长度、前后缀或 hash；
   - 明确说明当前 backup 仅代表人工写 token 后的字节基线，不能恢复或证明
     人工写入前状态。

2. 校验 Release 提供的 ZIP、manifest、scan、release JSON 四个外部 SHA-256。
   解压到新的临时目录，不覆盖 `C:\SoftwareDocWorker\app`。

3. 校验 release/manifest：

   - `companionVersion=3`；
   - source/deployment revision 等于发布者给出的 peeled commit；
   - `managedGatewayFileCount=6`；
   - `deploymentToolFileCount=1`；
   - `validationFileCount=1`；
   - `rootfsInputsChanged=false`；
   - manifest 中 validation script 的 `runtime=powershell.exe-5.1`、
     `readOnly=true`、size 和 SHA-256 与 ZIP 内文件完全一致。

4. 仅从解压后的 v3 ZIP 运行 PS5.1 行为测试：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\test-native-matlab-gateway-companion-ps51.ps1 `
     -RepositoryRoot <v3解压目录>
   ```

   该测试只创建并清理系统临时目录。必须看到
   `Native Gateway Windows PowerShell 5.1 tests passed.`。任何
   `not recognized`、函数可见性预检失败、原子文件测试失败或 readiness
   状态机失败都立即停止。

5. PS5.1 行为测试通过后，才运行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <v3解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径> `
     -ValidateOnly
   ```

   `ValidateOnly` 可以在系统临时目录执行 CSPRNG/File.Replace 能力探针，但不得
   修改两个 env、app 或服务。失败时停止，不采用现场脚本绕过。

6. 两项均通过后只报告：

   - tag、tag object、peeled commit；
   - 四项资产 SHA-256；
   - 服务状态和旧 health 结论；
   - 6 个受管文件恢复证据结论；
   - token 键计数与 `valuesEqual`，不得报告值；
   - `powershell.exe` 版本；
   - PS5.1 行为测试通过；
   - v3 `ValidateOnly` 通过。

   报告后停止，等待真实部署的独立授权。
