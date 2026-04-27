# Windows VM Zip 部署

本方案用于正式 Windows 虚拟机部署。代码和 Wiki 从 `release/windows-prod` 打成 zip 发布包，正式运行数据放在 VM 外置目录，发布新版本时不会覆盖正式数据。

## 目录约定

- 应用根目录：`C:\apps\software-doc-generator`
- 发布包入口：`C:\apps\software-doc-generator\incoming\latest.zip`
- 当前运行版本：`C:\apps\software-doc-generator\current`
- 历史版本：`C:\apps\software-doc-generator\releases`
- 正式业务数据：`C:\apps\software-doc-generator\prod-data`
- 正式可变技能文件：`C:\apps\software-doc-generator\prod-skills`
- 正式配置：`C:\apps\software-doc-generator\config\.env.production`

## Mac 侧打包

只允许从发布分支打包：

```bash
git switch release/windows-prod
git status --short
npm run release:zip
```

默认输出到 `release-dist/`：

- `software-doc-generator-<时间>-<sha>.zip`
- `latest.zip`
- `deploy-release.ps1`
- `install-windows-services.ps1`

发布包只包含代码、前端、Wiki、seed 技能、脚本、模板和文档，不包含 `.git`、`node_modules`、`.env`、`.local`、运行态 `data/`。

发布包中的 `skills/` 是初版 seed 技能库。VM 首次部署时，如果 `prod-skills` 还没有正式技能文件，部署脚本会自动把这份当前版本技能库初始化进去；后续部署如果 `prod-skills\active\skill-manifest.json` 已存在，则保留正式环境技能库，不用新包覆盖。

## VM 首次服务安装

VM 需要先安装 Node.js 22+，并准备 WinSW 可执行文件，例如：

```powershell
C:\apps\software-doc-generator\service\winsw-x64.exe
```

如果 VM 还没有 `current` 目录，把 `deploy-release.ps1` 和 `latest.zip` 一起拷贝到 `incoming`，先解出第一版代码但不启动服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\software-doc-generator\incoming\deploy-release.ps1 -NoServiceRestart
```

首次部署出 `current` 目录后，以管理员 PowerShell 执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\software-doc-generator\current\scripts\install-windows-services.ps1
```

该脚本会安装两个 Windows 服务：

- `SoftwareDocGenerator`
- `SoftwareDocWiki`

服务通过 `APP_ENV_FILE` 读取 `config\.env.production`。

## VM 一键部署新包

把 Mac 生成的 zip 拷贝到：

```powershell
C:\apps\software-doc-generator\incoming\latest.zip
```

然后在 VM 上执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\software-doc-generator\current\scripts\deploy-release.ps1
```

也可以显式指定包路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\software-doc-generator\current\scripts\deploy-release.ps1 -PackagePath C:\apps\software-doc-generator\incoming\software-doc-generator-xxxx.zip
```

脚本会完成：

1. 停止两个 Windows 服务。
2. 解压发布包到 `releases\<version>`。
3. 复制 `config\.env.production` 到新版本目录。
4. 如果 `prod-skills` 为空，用发布包内 `skills/` 初始化正式技能库。
5. 执行 `npm ci --omit=dev`。
6. 将 `current` 更新为新版本目录的 junction。
7. 启动服务。
8. 检查 `http://127.0.0.1:3000/api/health` 和 `http://127.0.0.1:3001/health`。
9. 失败时回滚到上一个版本。

## 正式数据策略

正式数据不进入 zip 包。`APP_DATA_DIR` 和 `APP_SKILLS_DIR` 负责把运行态写入外置目录：

```env
APP_DATA_DIR=C:\apps\software-doc-generator\prod-data
APP_SKILLS_DIR=C:\apps\software-doc-generator\prod-skills
```

其中 `prod-data` 保存工程、上传文件、生成产物、反馈、replay、工单和 `skills.sqlite`；`prod-skills` 保存运行中可变的 active skill 与 skill bundles。

初版发布后，`skills.sqlite` 会在服务启动时根据 `prod-skills` 中的 active skill registry 初始化/导入。后续如果在正式环境通过技能管理页面调整技能，应以 VM 的 `prod-skills` 和 `prod-data` 为正式真源。
