# 部署分支拆分交接说明

本文档给部署端 AI 使用，用于把开发分支改动拆分到 `release/linux-prod` 和 `release/windows-prod`。当前开发分支已经引入部署边界显性化机制，后续不要再完全按旧方式人工扫所有 diff，应优先使用仓库内的分类器和部署目标清单。

2026-05-26 生产调试部署阶段的通用坑点和经验已沉淀到 `docs/production-debugging-lessons.md`。后续拆分、部署或排查 TCSD/SLX/Hermes 问题时，建议先读本文的部署边界，再读该经验记录。

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

## 单元测试 TCSD 生成 V1

本功能新增顶层页面 `/unit-test-case-generation`，平台端接收 1 个 `.slx`、1 个 `.mat` 和 1 个项目编号，在 `data/unit-test-case-generation/tasks/<taskId>/workspace` 下创建隔离 workspace，并通过 Hermes step `simulink_ut_tcsd_generate` 发给 Windows VM。平台端只登记项目、任务和下载 `workspace/outputs/*.xlsx`，上传的模型、MAT 数据、项目登记 JSON 和生成的 Excel 都属于运行态数据，不进入 release 分支。

生产拆分端速读：

- Linux 平台端只负责页面、项目登记、上传下载、任务 JSON、队列状态和向 Hermes Agent HTTP 服务发起请求，不直接运行 MATLAB，也不解析 Windows 附加包路径。
- Windows VM 端负责 Hermes Agent step、项目附加包复制、Hermes CLI、MATLAB/SATK 和 `simulink-ut-tcsd-generator` skill 的实际执行。
- Shared 协议负责把 `workspaceDir/modelSlxPath/modelMatPath/outputDir/unitTestProject/skillName/expectedOutputPattern` 固定传给 Hermes，并把返回或回收得到的 `outputs/*.xlsx` 归一化成平台 artifact。
- 运行态数据只留在 `data/unit-test-case-generation/**`；外部项目附加包只放在 Agent 机器配置的 addon root 下，部署端不要把用户上传的 `.slx/.mat`、项目登记 JSON、生成的 `.xlsx` 或 addon 包内容带进 release 分支。

拆分建议：

- `release/linux-prod` 包含前端页面、`src/app.js` API、`src/services/unit-test-case-generation-service.js`、`src/services/hermes-task-queue-service.js`。
- `release/windows-prod` 包含 `src/hermes-app.js`，用于校验 `allowedPaths`，按项目编号复制 addon 包到 workspace 后调用本机 Hermes CLI 执行 `simulink-ut-tcsd-generator` skill。
- `shared` 包含 `src/services/hermes-agent-client.js`、`src/config.js`、`.env.dev-distributed.example`、测试和本文档。
- `data/unit-test-case-generation/**`、`.local/project-addons/**` 和 Windows 生产 `C:\ProgramData\SoftwareDocGenerator\project-addons\**` 始终按 runtime/local 排除。

Mac 本机开发的一键脚本默认启动平台服务和本地 Hermes Agent sidecar：平台端监听 `3000`，Hermes Agent 监听 `3101`，平台端通过 `HERMES_TRANSPORT=api` 调用 sidecar，并将 sidecar 的 `HERMES_SERVER_REQUEST_TIMEOUT_MS` 设为 `0` 以支持 TCSD/MATLAB 长任务。`simulink_ut_tcsd_generate` 默认使用 60 分钟超时；由于 Hermes CLI 本身没有 unlimited turn 开关且省略 `--max-turns` 会回落到默认 `90`，平台将 `HERMES_MAX_TURNS_SIMULINK_UT_TCSD_GENERATE` 设为 `10000`，让复杂 Simulink 模型的实际约束落在超时而不是工具调用轮次。可以通过 `HERMES_PROFILE=deepseek` 让 Hermes Agent 内部调用 CLI 时显式走 `~/.hermes/profiles/deepseek`。该变量只影响 CLI transport；Linux 平台端走 `HERMES_TRANSPORT=api` 时不直接读取本机 profile。若 Windows VM 也要用命名 profile，需要在 Windows Hermes Agent 进程上设置 `HERMES_PROFILE`，并确保 `HERMES_STATE_DB_PATH` 没有覆盖到默认 profile 的 `state.db`。

项目选择只在平台端保存编号和展示名，例如 `01_楚能`、`02_TMS`；任务 payload 内部只依赖 `unitTestProject.id`，例如 `01`。Hermes Agent 启动 CLI 前会从当前 Agent 进程的 `UNIT_TEST_CASE_PROJECT_ADDON_ROOT/<编号>` 复制全部 addon 内容到 workspace 根目录。Mac 本地默认 addon root 是 `.local/project-addons`，目录示例为 `.local/project-addons/01`；Windows 生产默认 addon root 是 `C:\ProgramData\SoftwareDocGenerator\project-addons`，目录示例为 `C:\ProgramData\SoftwareDocGenerator\project-addons\01`。

生产 Linux 和 Windows VM 如果不是同一套绝对路径，需要在 Linux 平台端设置：

```bash
UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT=C:\\software-doc-generator\\data\\unit-test-case-generation\\tasks
```

该变量会把 Linux 平台本地 task workspace 映射成 Windows Hermes Agent 可见路径。Windows VM 需要安装或随包携带 `simulink-ut-tcsd-generator` skill，并准备 MATLAB/SATK 环境变量，例如：

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
   - `runtime-data` 和 `local-only` 排除
   - `ambiguous` 结合提交说明和文件内容人工判断
5. 每个 release 分支提交前检查：

```bash
git diff --cached --stat
git diff --cached --name-status
```

确认没有混入运行态数据后再提交。
