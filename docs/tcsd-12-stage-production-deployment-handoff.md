# TCSD 十二阶段流水线生产部署交接

> 受众：负责生产环境部署的 Agent
>
> 仓库：`https://github.com/uaapple/software-doc-generator-prototype.git`
>
> 部署源分支：`codex/tcsd-deterministic-pipeline`
>
> 固定发布标签占位符：`tcsd-12-stage-pipeline-vNEXT`（主任务验收并发布后必须替换）
>
> 开发基线：`main@79bc8ea7cfa9625637be0888584080cfa79e62cd`
>
> 目标：将原来一次长程 TCSD Agent 任务替换为十二个输入输出明确、逐段校验、可恢复和可追溯的 Hermes Agent 阶段。

## 1. 部署结论

本次不是单独更新一个技能，而是同时更新 Linux 平台、Windows Hermes/MATLAB Worker、共享协议和十二个阶段技能。两个生产端必须部署同一标签对应的代码，不能只更新一端。

- Linux 后端负责上传、任务创建、Windows 作业轮询、断点对账、十二阶段状态展示和最终 Excel 下载。
- Windows Worker 负责 Hermes Agent、十二个独立 Hermes session、十二个原子技能、MATLAB/SATK、仿真、覆盖率、宿主校验和最终产物整理。
- Shared 负责 V2 作业协议、阶段 schema、覆盖率门禁、错误码、技能版本/hash 和 checkpoint 结构，Linux 与 Windows 必须一致。
- 测试夹具、A02、用户模型、MAT、addon、生成的 Excel、coverage、Hermes session、数据库和日志均不是发布内容。

生产部署不要从旧的独立技能仓库拉取 TCSD 技能。本工程中的 `skills/hermes` 是十二阶段技能及共享 runtime 的唯一生产源码。

## 2. 从远端取得固定版本

```bash
git clone https://github.com/uaapple/software-doc-generator-prototype.git
cd software-doc-generator-prototype
git fetch origin --prune --tags
git show --no-patch --decorate tcsd-12-stage-pipeline-vNEXT
git diff --stat 79bc8ea7cfa9625637be0888584080cfa79e62cd..tcsd-12-stage-pipeline-vNEXT
```

如果仓库已经存在：

```bash
git fetch origin codex/tcsd-deterministic-pipeline --tags
git switch codex/tcsd-deterministic-pipeline
git pull --ff-only origin codex/tcsd-deterministic-pipeline
git rev-parse HEAD
git rev-parse tcsd-12-stage-pipeline-vNEXT
```

上述两个 SHA 必须相同。不要使用本机工作区中的未提交文件，也不要从 `data/**`、`input/**` 或 `output/**` 复制代码。

## 3. 十二阶段内容

| 阶段 | 前端中文名称 | Hermes 指定技能 | 关键输出/门禁 |
|---:|---|---|---|
| 01 | 校验输入文件与项目附件 | `tcsd-stage-01-validate-inputs` | 输入清单、文件 hash、addon 复制证据 |
| 02 | 检查 MATLAB 与模型工具环境 | `tcsd-stage-02-check-environment` | Python 依赖、workspace I/O、MATLAB/SATK nonce canary |
| 03 | 初始化模型工作区 | `tcsd-stage-03-initialize-workspace` | 初始化脚本、MAT、数据字典和支持包证据 |
| 04 | 加载模型并提取输入输出接口 | `tcsd-stage-04-extract-interface` | 根 Inport/Outport、参数、类型与模型接口 JSON |
| 05 | 分析条件、判定与 MC/DC 覆盖目标 | `tcsd-stage-05-analyze-coverage` | 逻辑追踪、Coverage IR、MC/DC obligation |
| 06 | 生成并验证状态及时序刺激 | `tcsd-stage-06-validate-state-probes` | 状态 Probe 计划、真实观察、多步骤 stimulus |
| 07 | 生成并校验首版测试用例 | `tcsd-stage-07-build-initial-cases` | 首版 TCSD workbook、静态规划诊断 |
| 08 | 运行模型仿真并回填期望值 | `tcsd-stage-08-simulate-backfill` | 实际仿真结果、`expValue` 回填与逐项校验 |
| 09 | 采集首轮覆盖率 | `tcsd-stage-09-collect-coverage` | 实测 Condition、Decision、MC/DC |
| 10 | 根据覆盖率修正测试用例 | `tcsd-stage-10-repair-coverage` `1.3.0` | 局部上游切片、定向候选、最多一轮修正 |
| 11 | 运行最终仿真与覆盖率检查 | `tcsd-stage-11-final-validation` | 最终仿真、覆盖率与标准命名 workbook |
| 12 | 整理任务产物并清理运行环境 | `tcsd-stage-12-package-cleanup` | 宿主生成 execution manifest、清理证据、最终下载产物 |

每个阶段启动全新的 Hermes session，prompt 以相应 `/tcsd-stage-xx-*` 精确调用开头。Agent 文本不作为完成证据；宿主必须重新解析阶段结果和产物，成功后才写入 checkpoint。

## 4. 关键行为变化

1. 旧的整体 TCSD Agent 入口和平台端 Python fallback 已移除，生产只运行 `tcsd-agent-stage-pipeline/v2`。
2. 每阶段有独立输入、结果、checkpoint、Hermes session、技能版本/hash、token usage 和错误归属。
3. 阶段 2 不再只检查可执行文件是否存在，而是实际执行 MATLAB/SATK nonce canary。
4. 有状态或时序 MC/DC 条件使用“初始化—触发—保持—跨越阈值—观察”的多步骤刺激。
5. `maxStepsPerTest` 表示 TCSD 动作条目数，不是 Simulink sample period 数；长时间保持可以是一个动作。
6. 第 9 阶段的实测覆盖率是覆盖率权威来源，静态 obligation 匹配只作为规划提示。
7. 首轮三项覆盖率均达到 80% 时直接结束；否则只修正一轮，修正后的结果作为最终结果，不要求强行达到 80%。
8. 只有候选产物的确定性校验失败才允许一次新的 Agent 修复 session；环境、Hermes、MATLAB、超时等硬错误不重试。
9. 最终只向前端暴露 `<模型名>_Test0001_tcsd.xlsx`，中间 iter0/iter1 workbook 保留为任务证据但不作为用户下载产物。
10. 前端任务详情支持滚动查看全部十二阶段，并以中文显示阶段状态、错误和 checkpoint 摘要。

## 5. 部署归属

### 5.1 Linux 后端

Linux 需要的主要内容：

- `public/**`
- `src/app.js`
- `src/services/unit-test-case-generation-service.js`
- `src/services/hermes-agent-client.js`
- `src/services/tcsd-pipeline-contract.js`
- `src/services/tcsd-stage-catalog.js`
- `src/config.js`
- `.env.linux-prod.example`
- `deploy/targets/linux-prod.json`
- shared 配置、schema、文档和 package lock

Linux 明确不部署：

- `skills/hermes/tcsd-runtime`
- `skills/hermes/tcsd-stage-*`
- MATLAB/MCP 工具
- `tests/**`
- Windows 安装脚本

Linux 生产环境至少确认：

```dotenv
APP_ENV=production
APP_RUNTIME_ROLE=platform
HOST=0.0.0.0
PORT=3000

HERMES_TRANSPORT=api
HERMES_BASE_URL=http://<WINDOWS_WORKER>:3101
HERMES_SERVER_REQUEST_TIMEOUT_MS=0

UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT=C:\\software-doc-generator\\data\\unit-test-case-generation\\tasks
UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN=outputs/*_tcsd.xlsx
UNIT_TEST_CASE_REMOTE_POLL_WINDOW_MS=300000
UNIT_TEST_CASE_RECONCILE_INTERVAL_MS=30000
```

如果 Linux 与 Windows 通过共享目录交换任务，`UNIT_TEST_CASE_AGENT_WORKSPACE_ROOT` 必须是 Windows Worker 实际可读写的任务根目录映射。Linux 不得配置 `HERMES_TRANSPORT=cli` 或 `MATLAB_MCP_TRANSPORT=stdio`。

### 5.2 Windows Worker

Windows 需要的主要内容：

- `src/hermes-app.js`
- `src/hermes-server.js`
- `src/services/tcsd-pipeline-job-service.js`
- `src/services/tcsd-hermes-stage-executor.js`
- `src/services/tcsd-host-semantic-validator.js`
- `src/services/tcsd-hermes-skill-registry.js`
- `src/services/tcsd-pipeline-contract.js`
- `src/services/tcsd-stage-catalog.js`
- `skills/hermes/tcsd-stage-*`
- `skills/hermes/tcsd-runtime`
- `scripts/install-tcsd-hermes-skills.mjs`
- `scripts/install-tcsd-hermes-skills.ps1`
- MATLAB/SATK 支持工具和 `.env.windows-prod.example`

Windows 生产环境至少确认：

```dotenv
APP_ENV=production
APP_RUNTIME_ROLE=hermes-agent
HERMES_HOST=0.0.0.0
HERMES_PORT=3101
HERMES_TRANSPORT=cli
HERMES_COMMAND=hermes
HERMES_WORKDIR=C:\\software-doc-generator\\current
HERMES_STATE_DB_PATH=C:\\Users\\Administrator\\.hermes\\state.db
HERMES_SERVER_REQUEST_TIMEOUT_MS=0

TCSD_STAGE_HERMES_TIMEOUT_MS=3600000
TCSD_STAGE_HERMES_MAX_TURNS=200
TCSD_PIPELINE_PYTHON=C:\\Path\\From\\PyLauncher\\python.exe

UNIT_TEST_CASE_PROJECT_ADDON_ROOT=C:\\ProgramData\\SoftwareDocGenerator\\project-addons
UNIT_TEST_CASE_PROJECT_ADMIN_CODE=114301
UNIT_TEST_CASE_DEFAULT_PROJECTS=01_楚能,02_TMS

MATLAB_MCP_TRANSPORT=stdio
SLX_ANALYSIS_BACKEND=satk
SATK_MATLAB_SESSION_MODE=new
MATLAB_ROOT=C:\\Program Files\\MATLAB\\R2026a
SATK_MCP_LOG_FOLDER=C:\\Temp\\matlab-mcp-core-server-codex

APP_DATA_DIR=C:\\software-doc-generator\\data
APP_SKILLS_DIR=C:\\software-doc-generator\\skills
```

如使用命名 Hermes profile：

```dotenv
HERMES_PROFILE=<生产 profile>
TCSD_STAGE_HERMES_PROFILE=<生产 profile>
TCSD_STAGE_HERMES_STATE_DB_PATH=<该 profile 的 state.db>
TCSD_STAGE_HERMES_SKILLS_DIR=<该 profile 的 skills 目录>
```

不要把 macOS 的 `/Applications/MATLAB_R2026a.app` 配置带入生产。Windows 必须继续使用 `SATK_MATLAB_SESSION_MODE=new`，避免依赖跨阶段共享的 MATLAB base workspace。

Windows 部署前先执行 `py -3.11 -c "import sys; print(sys.executable)"`，把输出的绝对 `python.exe` 路径写入 `TCSD_PIPELINE_PYTHON`；不要配置为 PATH 中可能指向 Python 3.9 或 Microsoft Store alias 的 `python`/`python3`。仅在未配置该变量时，Node 生产代码才回退为独立 executable `py` 与参数前缀 `-3.11`。

### 5.3 Shared

以下内容必须在 Linux 和 Windows 使用同一提交版本：

- `src/services/tcsd-pipeline-contract.js`
- `src/services/tcsd-stage-catalog.js`
- `src/config.js`
- `package.json`、`package-lock.json`
- `.env.defaults`
- `deploy/ownership.yml`
- `docs/**`

如果共享协议只更新一端，会表现为 schema、技能版本、bundle hash、checkpoint 或状态转换校验失败；不要通过放宽门禁规避版本不一致。

## 6. Release 分支集成与构包

部署 Agent 应在现有生产 release 分支上合入固定标签。不要把运行态数据或本机 `.env` 带入合并。

### Linux

```bash
git switch release/linux-prod
git pull --ff-only origin release/linux-prod
git merge --no-ff tcsd-12-stage-pipeline-vNEXT
npm ci
npm test
npm run classify:changes -- --allow-ambiguous
npm run release:zip:linux
```

Linux 包由 `deploy/targets/linux-prod.json` 控制，构包后检查压缩包中不存在：

```text
skills/hermes/tcsd-runtime
skills/hermes/tcsd-stage-*
tools/
tests/
data/
input/
output/
```

### Windows

```powershell
git switch release/windows-prod
git pull --ff-only origin release/windows-prod
git merge --no-ff tcsd-12-stage-pipeline-vNEXT
$PythonExe = py -3.11 -c "import sys; print(sys.executable)"
$env:TCSD_PIPELINE_PYTHON = $PythonExe.Trim()
npm run install:tcsd-python
npm run check:tcsd-python
npm ci
npm test
npm run classify:changes -- --allow-ambiguous
npm run release:zip:windows-full
```

如果生产机已有经过验证的 MATLAB/MCP 二进制，只更新源代码可使用：

```powershell
npm run release:zip:windows-source
```

完整包与源码包都必须包含十二个 `skills/hermes/tcsd-stage-*` 目录、`skills/hermes/tcsd-runtime`、技能安装脚本、`requirements/tcsd-runtime.txt`、`scripts/tcsd-python-dependencies.mjs` 和 `scripts/check-tcsd-python.py`。源码包不包含仓库内的 MCP 二进制，必须复用生产机现有且通过 Stage 02 canary 的 MCP。Linux 包明确排除这两个 Python 安装/门禁脚本和 TCSD requirements 清单。

`scripts/build-release-zip.mjs` 要求当前分支与目标定义中的 release branch 一致、worktree 干净。Windows full/source 构包先运行 `check:tcsd-python`，再运行工程测试、wiki 和编码检查；Linux 构包不执行 TCSD Python 门禁。构包不会执行 pip 或联网安装。不要设置 `SKIP_RELEASE_CHECKS=1` 进行正式发布。

## 7. Windows 技能安装与启动前检查

部署包解压后，先解析并固定同一个 Python 3.11 解释器，再安装固定依赖、执行门禁和安装 Node 依赖：

```powershell
$PythonExe = py -3.11 -c "import sys; print(sys.executable)"
$env:TCSD_PIPELINE_PYTHON = $PythonExe.Trim()
npm run install:tcsd-python
npm run check:tcsd-python
npm ci
npm test
hermes --version
matlab -batch "disp(version); disp(ver('simulink'))"
.\scripts\install-tcsd-hermes-skills.ps1 `
  -SnapshotPath C:\ProgramData\SoftwareDocGenerator\tcsd-skill-snapshot.json
```

安装命令必须返回：

- `ok: true`
- `discoveredSkills: 12`
- 非空 `runtimeBundleHash`
- 与生产 profile 对应的 `profile`

安装器只覆盖由自身 marker 证明未被人工修改的 TCSD 技能目录。同名目录被人工修改时会 fail-closed；应先备份并查明来源，不要直接绕过检查。

随后用生产既有的服务管理方式重启 Windows Hermes Agent 与 MATLAB/MCP 服务。工程没有要求替换生产环境原有的 Windows Service、NSSM、任务计划程序或容器编排方式。

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3101/api/health
```

HTTP 健康只能证明 Node 服务存活。必须再发起一次 TCSD 验收任务，由 Stage 02 的 MATLAB/SATK nonce canary 证明执行通道可用。

## 8. Linux 启动前检查

```bash
npm ci
npm test
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://<WINDOWS_WORKER>:3101/api/health
```

确认页面可访问：

```text
http://<LINUX_PLATFORM>:3000/unit-test-case-generation
```

页面应显示十二个中文阶段；任务详情区域可以滚动到第 12 阶段；成功任务只显示一个标准命名的最终 Excel 下载链接。

## 9. 生产验收

先使用生产允许的非敏感回归模型，或经授权的 A02 输入，发起一条真实任务。验收必须同时检查：

1. Linux 任务创建成功，并取得 Windows `jobId`。
2. Windows 生成十二个不同的 Hermes session，不复用 session。
3. 每阶段 checkpoint 中存在技能名、版本、技能 hash、runtime hash、实际 model 和 token usage。
4. Stage 02 nonce 一致，MATLAB、Simulink、SATK/MCP 和 workspace I/O 全部通过。
5. Stage 08 的每个 `expValue` 来自实际仿真。
6. Stage 09 生成真实 Condition、Decision、MC/DC 覆盖率。
7. 未达到 80% 时 Stage 10 最多修正一次；达到 80% 时按规则跳过修正。
8. Stage 11 始终对最终用例重新仿真并重新采集覆盖率。
9. Stage 12 由宿主生成 `simulink-ut-tcsd-execution-manifest/v1`。
10. 前端最终只提供 `<模型名>_Test0001_tcsd.xlsx`。
11. 服务重启后，已完成 checkpoint 不重复执行，未完成任务可以继续对账。
12. 任务错误能够定位到具体中文阶段，并显示 MATLAB/SATK 的公开错误摘要，不泄露 token、密码或 API key。

本机黑盒基准已经验证：

- 17 条首版用例；
- 首轮 Condition 100%、Decision 75%、MC/DC 100%；
- Stage 10 增加 1 条针对 MinMax 缺失分支的多步骤用例；
- 最终 18 条用例；
- Condition、Decision、MC/DC 均为 100%；
- 最终 workbook 含 25 个仿真回填的 `expValue`。

该结果用于证明流水线能力，不应作为其他模型必须达到相同百分比的硬编码预期。生产代码不得包含 A02 或具体业务信号名。

## 10. 回滚

部署前记录 Linux、Windows 当前 release SHA、环境文件和外置技能目录备份。出现问题时两个生产端应成对回滚到部署前 SHA，避免 V2 协议一端新、一端旧。

不要删除：

- `APP_DATA_DIR`
- Windows `tcsd-pipeline-jobs`
- Hermes profile、`state.db` 和 `.usage.json`
- `UNIT_TEST_CASE_PROJECT_ADDON_ROOT`
- 用户上传模型或历史任务 workspace

回滚代码后，重新安装与回滚版本匹配的 TCSD 技能，并重启 Windows Hermes Agent；随后再回滚/重启 Linux 平台。

## 11. 不得进入提交或发布包的内容

```text
.mcp.json
.env
.agents/
.local/
data/**
input/**
output/**
release-dist/**
test-fixtures/**/artifacts/**
用户 SLX/MAT/init/addon
生成的 XLSX/coverage/JSON/log
Hermes session/state.db/.usage.json
MATLAB 临时文件和覆盖率运行产物
```

部署 Agent 如需确认文件归属，先运行：

```bash
npm run classify:changes -- 79bc8ea7cfa9625637be0888584080cfa79e62cd..tcsd-12-stage-pipeline-vNEXT --allow-ambiguous
```

分类结果以 `deploy/ownership.yml` 和三个 `deploy/targets/*.json` 为准，不能根据文件名猜测。
