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

## 单元测试 TCSD 生成 V1

`skills/hermes/simulink-ut-tcsd-generator` 从本轮起是 TCSD 生产技能的工程内唯一源码。独立技能仓库只保留历史或显式同步用途，不再作为生产部署输入。本技能仅进入 `release/windows-prod`；`release/linux-prod` 必须排除该目录，因为 Linux 平台不运行 MATLAB、SATK 或 TCSD Probe。

第一轮状态及时序探测使用确定性脚本闭环：逻辑追踪 v2 输出上游状态依赖，`build_state_probe_plan.py` 对未解析端口生成有界候选，MATLAB Probe 通过显式 CaseJson 验证实际端口向量，随后将完整初始化、输入变化、等待时间和证据步骤写入 obligation 与 TCSD。不得把最终输入快照冒充可复现的有状态刺激，也不得把候选耗尽或未支持结构自动标为不可达。

第二轮把上述片段统一为 `simulink-ut-tcsd-coverage-ir/v1`：Windows 技能使用 `build_coverage_ir.py` 保存 Condition、Decision、MC/DC 的控制量、嵌套逻辑、时序刺激、敏化上下文、可达性和仿真证据，并由 `synthesize_tcsd_from_coverage_ir.py` 确定性追加去重用例。`run_tcsd_quality_loop.py` 固定为“严格工作簿校验 → 仿真/回填 → 首轮覆盖率 → 至多一次报告驱动修正 → 最终仿真/回填与覆盖率”。`unsupported`、`unresolved` 和有证据的 `unreachable` 会以部分完成证据留在 manifest；不能因缺图或候选耗尽猜测不可达。该协议与执行代码仅进入 Windows TCSD 技能，不改变 Linux 前端或异步进度协议。

本功能新增顶层页面 `/unit-test-case-generation`，平台端接收 1 个 `.slx`、1 个 `.mat`、可选 1 个模型初始化 `.m` 脚本和 1 个项目编号，在 `data/unit-test-case-generation/tasks/<taskId>/workspace` 下创建隔离 workspace，并通过 Windows 异步 job API 发给 Windows VM。平台端只登记项目、任务和下载 `workspace/outputs/*.xlsx`，上传的模型、MAT 数据、初始化脚本、项目登记 JSON 和生成的 Excel 都属于运行态数据，不进入 release 分支。

TCSD workbook 现在增加 workbook-vs-rootPorts 校验门禁。平台端在 `simulink_ut_tcsd_generate` prompt 中要求 Hermes Agent 在 checkpoint workbook 生成后运行 `simulink-ut-tcsd-generator` skill 的 `scripts/validate_tcsd_workbook.py`，用模型编译得到的 root Inport/Outport 列表检查 `Initialization`、`Action` 和 `expValue(...)` 左侧信号名。如果校验报告未知输入、未知输出、向量语法问题或缺少最终延时，这属于 Hermes Agent 生成的候选 workbook/spec 缺陷，Agent 应在同一任务内根据报告的 row/cell/test_id/signal/line 修复用例、重建 workbook、重新校验后再进入仿真/回填；不要直接把第一版 workbook 校验失败作为平台任务失败返回给前端。只有 root-port 接口无法获取，或有限修复后仍无法得到合法 workbook，Hermes Agent 才应向平台返回 `status: "failed"`。

## TCSD 第三轮：异步十二阶段协议

Windows Hermes 提供 `POST /internal/tcsd-pipeline/jobs` 与 `GET /internal/tcsd-pipeline/jobs/:jobId`。启动请求立即返回稳定 `jobId`；作业 JSON 和事件持久化在 Windows 的 `APP_DATA_DIR/tcsd-pipeline-jobs`，同一平台 `taskId` 作为幂等键。Hermes 不再调用旧的整块 `simulink_ut_tcsd_generate` CLI；`TcsdWindowsStageExecutor` 直接逐阶段启动技能内 `run_tcsd_pipeline_stage.py`，由该 runner 调用 MATLAB/SATK、Coverage IR、工作簿、仿真、覆盖率和清理子能力并写权威 checkpoint。平台端仅保存 jobId 并以退避轮询同步状态，短暂网络错误不会直接把 MATLAB 作业标为失败。

共享契约为 `src/services/tcsd-pipeline-contract.js`（`tcsd-deterministic-pipeline/v1`），固定十二个中文阶段、状态、错误码、检查点、产物、coverage 和 repair 字段。Windows `tcsd-pipeline-job-service` 在每个阶段持久化开始/结束时间、事件和已验证检查点；服务启动时扫描非终态 job，已验证 checkpoint 不重复执行，处于“正在执行”但证据不完整的阶段恢复为等待重试。同一幂等键命中非终态 job 会重新调度。阶段 8 和修正后的阶段 11 都按 `(row, testId, step, output, value)` 将仿真 JSON 与 XLSX 的真实 `expValue` 逐项对账，缺失、多余或值不一致不得通过 checkpoint；阶段 9 校验按模型分组的首轮 Condition/Decision/MC/DC；阶段 10 只依据首轮覆盖率进行至多一次 Coverage IR 修正；阶段 11 只在修正实际应用时运行最终仿真/回填/覆盖率；第 12 阶段校验最终 execution manifest、时间线、产物清单与 job 所有权清理记录。`status=completed, completion=partial`、attempted=true/applied=false、unsupported/unresolved 和最终低覆盖均收敛为“部分完成”，工作簿仍可下载。

Windows 生产使用 `SATK_MATLAB_SESSION_MODE=new`，每次 `satk_eval.py` 都是独立 MATLAB/MCP 会话，任何阶段都不得依赖上一阶段的 base workspace 或 path。阶段 3 仍独立执行 `setup_ut_support` 作为环境/项目初始化门禁并持久化 manifest；阶段 4 的新会话必须在同一 MATLAB 调用内携带 job 的显式 `projectInitScripts`，先再次执行 `setup_ut_support(rootDir, initScripts)`，然后以 `WorkspaceInitialized=true` 执行接口提取与逻辑追踪。重启恢复时可复用已验证的阶段 3 checkpoint，但阶段 4 仍必须自包含地重建当前会话的 MATLAB 初始化状态。

Linux 发布包包含平台轮询、任务 JSON 和中文页面展示，但不运行 MATLAB。Windows 发布包包含 job 执行器、Hermes 路由及全部 TCSD 技能。shared contract、config、部署 ownership 与本交接文档需要同时进入两端。

Linux 端 `UNIT_TEST_CASE_REMOTE_POLL_WINDOW_MS` 只控制单次前台同步窗口；超时后任务保持 `running/workerPending`，由 `UNIT_TEST_CASE_RECONCILE_INTERVAL_MS` 后台恢复。404 job-not-found 是永久失败，Worker 不可用与短暂网络中断保持待同步，Windows 阶段失败使用阶段错误码收敛。Windows 端设置 `TCSD_PIPELINE_PYTHON`、`TCSD_PIPELINE_STAGE_TIMEOUT_MS` 和 `MATLAB_ROOT`；job 状态目录属于运行态数据，不进入 release。

生产拆分端速读：

- Linux 平台端只负责页面、项目登记、上传下载、任务 JSON、队列状态和向 Hermes Agent HTTP 服务发起请求，不直接运行 MATLAB，也不解析 Windows 附加包路径。
- Windows VM 端负责异步 job、项目附加包复制、确定性阶段 runner、MATLAB/SATK 和 `simulink-ut-tcsd-generator` skill 的实际执行；Agent 只启动 job 入口，不决定跳步。
- Shared 协议负责把 `workspaceDir/modelSlxPath/modelMatPath/outputDir/unitTestProject/skillName/expectedOutputPattern` 固定传给 Hermes；如果用户上传模型级初始化脚本，还会传 `modelInitScriptPath/modelInitScriptFileName/projectInitScripts`，并要求 Hermes/skill 优先执行这个显式脚本。协议同时把 workbook/rootPorts 校验与内部修复语义写入 Hermes prompt，再把返回或回收得到的 `outputs/*.xlsx` 归一化成平台 artifact。
- 运行态数据只留在 `data/unit-test-case-generation/**`；外部项目附加包只放在 Agent 机器配置的 addon root 下，部署端不要把用户上传的 `.slx/.mat/.m`、项目登记 JSON、生成的 `.xlsx` 或 addon 包内容带进 release 分支。

拆分建议：

- `release/linux-prod` 包含前端页面、`src/app.js` API、`src/services/unit-test-case-generation-service.js`、`src/services/hermes-task-queue-service.js`。
- `release/windows-prod` 包含 `src/hermes-app.js`，用于校验 `allowedPaths`，按项目编号复制 addon 包到 workspace 后调用本机 Hermes CLI 执行 `simulink-ut-tcsd-generator` skill。
- `shared` 包含 `src/services/hermes-agent-client.js`、`src/config.js`、`.env.dev-distributed.example`、测试和本文档。
- `data/unit-test-case-generation/**`、`.local/project-addons/**` 和 Windows 生产 `C:\ProgramData\SoftwareDocGenerator\project-addons\**` 始终按 runtime/local 排除。

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

Mac 本机开发的一键脚本默认启动平台服务和本地 Hermes Agent sidecar：平台端监听 `3000`，Hermes Agent 监听 `3101`，平台端通过 `HERMES_TRANSPORT=api` 调用 sidecar，并将 sidecar 的 `HERMES_SERVER_REQUEST_TIMEOUT_MS` 设为 `0` 以支持 TCSD/MATLAB 长任务。`simulink_ut_tcsd_generate` 默认使用 60 分钟超时；由于 Hermes CLI 本身没有 unlimited turn 开关且省略 `--max-turns` 会回落到默认 `90`，平台将 `HERMES_MAX_TURNS_SIMULINK_UT_TCSD_GENERATE` 设为 `10000`，让复杂 Simulink 模型的实际约束落在超时而不是工具调用轮次。可以通过 `HERMES_PROFILE=deepseek` 让 Hermes Agent 内部调用 CLI 时显式走 `~/.hermes/profiles/deepseek`。该变量只影响 CLI transport；Linux 平台端走 `HERMES_TRANSPORT=api` 时不直接读取本机 profile。若 Windows VM 也要用命名 profile，需要在 Windows Hermes Agent 进程上设置 `HERMES_PROFILE`，并确保 `HERMES_STATE_DB_PATH` 没有覆盖到默认 profile 的 `state.db`。

项目选择只在平台端保存编号和展示名，例如 `01_楚能`、`02_TMS`；任务 payload 内部只依赖 `unitTestProject.id`，例如 `01`。Hermes Agent 启动 CLI 前会从当前 Agent 进程的 `UNIT_TEST_CASE_PROJECT_ADDON_ROOT/<编号>` 复制全部 addon 内容到 workspace 根目录。Mac 本地默认 addon root 是 `.local/project-addons`，目录示例为 `.local/project-addons/01`；Windows 生产默认 addon root 是 `C:\ProgramData\SoftwareDocGenerator\project-addons`，目录示例为 `C:\ProgramData\SoftwareDocGenerator\project-addons\01`。

初始化脚本支持两种模式：未上传 `.m` 时，Hermes/skill 使用项目 addon 中已经复制到 workspace 的通用初始化脚本，由 `setup_ut_support(rootDir)` 自动发现；上传 `.m` 时，平台把脚本放入 `workspace/inputs` 并通过 `projectInitScripts` 显式传给 Hermes，Hermes/skill 应优先执行该模型级脚本，不再用 addon 自动发现来决定初始化入口。addon 仍会照常复制和加入 MATLAB path，用于库、数据字典、接口包和其他项目依赖。

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
