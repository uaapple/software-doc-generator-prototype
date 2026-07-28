# Windows 原生 MATLAB Gateway companion v6 部署 Agent 提示词

你正在为未来的新 Windows Worker 或重建节点部署正式 companion v6。当前已用
v5 成功通过协议/evaluate readiness 的 WX11P 无需重新部署。只允许使用发布者
给出的 v6 annotated tag、peeled commit、GitHub Release URL 和四项资产
SHA-256；旧 tag/Release 保持不可变，禁止使用现场临时脚本。

冻结边界：

- 服务：`SoftwareDocMatlabWorker`
- 安装根：`C:\SoftwareDocWorker`
- 原生 env：`C:\SoftwareDocWorker\software-doc-worker.env`
- 容器 env：用户提供的未跟踪 `.env.windows-docker-desktop` 绝对路径
- Worker imageRevision：
  `sha256:5e57aff413c616faba9d4d690db1ac6af58d26259c1969a8ba9802f3aa7f69ab`
- Platform imageRevision：
  `sha256:2260ce959b49b5721fd577c0c0a37e0a91b5a3c49ca84fdefb4e5fd007613ff2`

不得 build、push 或替换镜像，不得输出 env 值、路径、token 或 API key，不得
修改 addon、旧 app\data、Hermes Home/session、用户输入输出或 MATLAB 产物。

## 固定执行顺序

1. 在全新临时目录下载 v6 ZIP、manifest、scan、release JSON，逐项核对发布者
   提供的 SHA-256。核对 companionVersion=6、source/deployment revision 等于
   peeled commit、6 个 managed Gateway files、1 个 deployment tool、2 个
   read-only validation inputs、`rootfsInputsChanged=false`，并复核 ZIP 内
   每项 size/SHA-256。

2. 从解压目录运行受保护的 Windows PowerShell 5.1 测试：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\test-native-matlab-gateway-companion-ps51.ps1 `
     -RepositoryRoot <v6解压目录>
   ```

   必须看到 `Native Gateway Windows PowerShell 5.1 tests passed.`。

3. 用管理员 Windows PowerShell 5.1 初始化批准的空目录：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <v6解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径> `
     -ProvisionDirectories
   ```

   只接受固定布尔字段和 `Approved directory initialization passed.`。该模式只
   能创建/验证批准根下的 data/state 空目录，不得修改 env、服务或已有内容。

4. 再执行严格只读验证：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy-native-matlab-gateway.ps1 `
     -CompanionRoot <v6解压目录> `
     -InstallDir C:\SoftwareDocWorker `
     -ContainerEnvFile <未跟踪容器env绝对路径> `
     -ValidateOnly
   ```

   失败时只报告安全类别并停止，不得临时改脚本绕过。

5. 只有前四步全部通过，才去掉且仅去掉 `-ValidateOnly` 正式升级。脚本会备份
   6 个受管文件、两个 env 原字节和服务配置；有界等待服务/TCP 5100/health，
   再验证 version/capabilities/workspace/mapping/evaluate。失败必须自动恢复
   旧 5100，禁止手工续跑。

6. 成功后独立核验服务 Running、health/version/capabilities、`worker-data`
   mapping、真实 evaluate readiness、受 ACL 保护的 backup，以及两个 env 的
   evaluate-token 键各一个且内存比较相同。只报告布尔结论。

7. 报告 tag、tag object、peeled commit、四项资产 SHA-256、PS5.1 测试、
   ProvisionDirectories、ValidateOnly、正式部署、readiness 与 rollback 结论，
   然后停止等待 Worker 容器部署指令。
