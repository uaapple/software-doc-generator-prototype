# 部署分支拆分交接说明

本文档给部署端 AI 使用，用于把开发分支改动拆分到 `release/linux-prod` 和 `release/windows-prod`。当前开发分支已经引入部署边界显性化机制，后续不要再完全按旧方式人工扫所有 diff，应优先使用仓库内的分类器和部署目标清单。

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

## 单元测试 TCSD Agent 十二阶段流水线 V2

TCSD 生产入口固定为 `POST /internal/tcsd-pipeline/jobs` 与 `GET /internal/tcsd-pipeline/jobs/:jobId`，共享作业协议为 `tcsd-agent-stage-pipeline/v2`。Linux 平台只创建、轮询和对账远端 job；Windows Hermes Agent 持久化 job 与阶段事件，并通过 `TcsdHermesStageExecutor` 为十二个阶段分别启动一个全新的 Hermes session。旧整体 Agent step 和平台直接运行 Python 的生产入口已经删除，不存在双轨或 fallback。

十二个 `skills/hermes/tcsd-stage-*` 目录各自只包含一个原子 `SKILL.md` 与发现元数据。每个阶段 prompt 都显式指定对应 `$tcsd-stage-xx-*` 技能和通用 `tcsd_stage_execute`，不得调用其他 TCSD 阶段技能。脚本、模板、MATLAB/SATK、Coverage IR、仿真、工作簿和覆盖率能力集中在非技能目录 `skills/hermes/tcsd-runtime`；技能只调用共享 runtime，不复制整套实现。技能和 runtime 均计算稳定内容 hash，并在 checkpoint 中记录 bundle version。

阶段边界协议为 `tcsd-agent-stage-input/v1` 与 `tcsd-agent-stage-result/v1`。Agent 只负责调用共享 runtime 生成候选 result；宿主不采信 Agent 文本，而是检查 schema、workspace 路径、JSON/XLSX 实体、仿真与 `expValue` 逐项对账、Condition/Decision/MC/DC、Coverage IR 修正证据、最终 execution manifest、产物清单和资源所有权。只有 validator 通过后，宿主才写 `tcsd-agent-stage-checkpoint/v2`。

checkpoint 记录技能名/版本/bundle hash、runtime hash、Hermes session、profile、实际 model、token usage、prompt hash、attempt、输入/结果文件及 hash、验证报告、工具日志摘要和产物。只保存 stdout/stderr 字节数等摘要，不保存 Agent 隐藏推理、原始对话、凭据或敏感日志。默认每阶段 `200` turns、`3600000` ms；Windows 可设置 `TCSD_STAGE_HERMES_MAX_TURNS`、`TCSD_STAGE_HERMES_TIMEOUT_MS` 与 `TCSD_STAGE_HERMES_PROFILE`，其中 profile 回退到 `HERMES_PROFILE`。如 profile 使用独立状态库，可设置 `TCSD_STAGE_HERMES_STATE_DB_PATH`，以便读取实际 model/token 遥测。

只有候选 result、产物或 checkpoint 的确定性校验失败才允许自动修复一次。修复必须启动第十三个新 session，并携带上一尝试的宿主验证报告；第二次仍失败即终止。输入、环境、MATLAB/SATK、Hermes 不可用、遥测缺失、session 复用和超时等硬错误直接失败，不重试。阶段 10 内部仍只允许一次 Coverage IR 用例修正；宿主验证修复不会放宽此限制。

服务启动时扫描非终态 V2 job：已验证 checkpoint 不重复执行，并恢复 coverage、repair 和产物汇总；无有效 checkpoint 的未完成阶段只能使用剩余的新 session 机会恢复。同一幂等键不会创建第二个 job。终态 `tcsd-deterministic-pipeline/v1` 仅只读保留，非终态 V1 标为 `tcsd_pipeline_version_obsolete`，不得混入 V2 恢复。

十二个中文阶段及其职责固定为输入校验、环境检查、工作区初始化、接口提取、覆盖目标分析、状态 Probe、首版用例、仿真回填、首轮覆盖率、Coverage IR 修正、最终验证和产物/清理。Windows 继续使用 `SATK_MATLAB_SESSION_MODE=new`，每次 MATLAB/SATK 调用自包含，不依赖上一 session 的 base workspace。`unsupported`、`unresolved`、有证据的 `unreachable` 或最终覆盖不足以“部分完成”保留，不得伪装成完全达标。

部署边界如下：

- `release/linux-prod` 包含页面、任务创建/轮询、V2 状态同步和十二阶段追溯展示；明确排除 `tcsd-stage-*` 与 `tcsd-runtime`。
- `release/windows-prod` 包含 Hermes job 路由、`TcsdHermesStageExecutor`、十二技能、共享 runtime、MATLAB/SATK 和宿主 checkpoint。
- shared 包含协议/schema、阶段目录、错误分类、bundle hash、配置和部署说明。
- `data/unit-test-case-generation/**`、`APP_DATA_DIR/tcsd-pipeline-jobs`、`.tcsd-agent/**`、`.tcsd-checkpoints/**`、Hermes session/state DB、模型、MAT、addon、XLSX、coverage、日志和临时文件均是 runtime/local，不进入 release 或功能提交。

Linux 的 `UNIT_TEST_CASE_REMOTE_POLL_WINDOW_MS` 只控制单次同步窗口；超时或短暂网络失败保持 `running/workerPending`，由 `UNIT_TEST_CASE_RECONCILE_INTERVAL_MS` 继续对账。404 job-not-found 才作为永久失败。Windows 需要配置 `TCSD_PIPELINE_PYTHON`、`MATLAB_ROOT` 和上述阶段 Hermes 变量。

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

Mac 本机开发的一键脚本默认启动平台服务和本地 Hermes Agent sidecar：平台端监听 `3000`，Hermes Agent 监听 `3101`，平台端通过 `HERMES_TRANSPORT=api` 调用 sidecar，并将 `HERMES_SERVER_REQUEST_TIMEOUT_MS` 设为 `0` 以支持长任务。TCSD 每阶段默认 `TCSD_STAGE_HERMES_TIMEOUT_MS=3600000`、`TCSD_STAGE_HERMES_MAX_TURNS=200`。可以通过 `TCSD_STAGE_HERMES_PROFILE=deepseek` 只覆盖 TCSD 阶段 profile；未设置时回退 `HERMES_PROFILE`。若使用命名 profile，必须确保对应的 Hermes `state.db` 可由 Agent 读取，必要时设置 `TCSD_STAGE_HERMES_STATE_DB_PATH`。

项目选择只在平台端保存编号和展示名，例如 `01_楚能`、`02_TMS`；任务 payload 内部只依赖 `unitTestProject.id`，例如 `01`。Hermes Agent 启动 CLI 前会从当前 Agent 进程的 `UNIT_TEST_CASE_PROJECT_ADDON_ROOT/<编号>` 复制全部 addon 内容到 workspace 根目录。Mac 本地默认 addon root 是 `.local/project-addons`，目录示例为 `.local/project-addons/01`；Windows 生产默认 addon root 是 `C:\ProgramData\SoftwareDocGenerator\project-addons`，目录示例为 `C:\ProgramData\SoftwareDocGenerator\project-addons\01`。

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
   - `runtime-data` 和 `local-only` 排除
   - `ambiguous` 结合提交说明和文件内容人工判断
5. 每个 release 分支提交前检查：

```bash
git diff --cached --stat
git diff --cached --name-status
```

确认没有混入运行态数据后再提交。
