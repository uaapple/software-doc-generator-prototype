# 移植任务书：将 DSH 运行时 +「单元测试用例生成模式」整体移植进 Worker 容器，替换 Hermes Agent

> 本文件是本移植任务（在 `dsh/tcsd-worker-port` 分支、`~/Documents/DSH_Proj/tcsd-worker-port` worktree 内执行）的完整任务书。
> 已获用户确认（2026-08-17）。DSH 当前工作区 `~/Documents/DSH_Proj/tcsd-pipeline-analysis`（`dsh/tcsd-pipeline-analysis` 分支）保留给日常任务生成，本任务不得影响它。

## 目标

把已在 DSH「单元测试用例生成模式」上验证成熟的确定性生成流程（7 个真实模型：
RngPrdn B04/B05、HvCoorn B09/B14/B15、ParkCrl B01/B02；ParkCrl B02 三项全过 complete）
整体移植进现有 Worker 容器，替代容器内的 Hermes Agent：任务通过容器内 DSH 会话执行，
体验与 DSH 桌面端跑生成完全一致（LLM 全程在环 + 确定性运行时 + runner）。

## 工作位置与边界

- 工作位置：本 worktree `~/Documents/DSH_Proj/tcsd-worker-port`，分支 `dsh/tcsd-worker-port`
  （基于 `dsh/tcsd-pipeline-analysis` @ f040d58，即已验证的最新稳定状态）
- 生产分支 `codex/tcsd-deterministic-pipeline` 是 DSH 分支的祖先（合回为快进、零冲突）
- 合并动作在 Codex 工作区执行（`git merge --ff-only dsh/tcsd-worker-port`），
  本任务产出「已验证的分支状态 + 容器交付物 + 合并指引」
- 全程不修改 Codex 工作区与 DSH 当前工作区；以下参考文件**只读**核对：
  - /Users/a0000/.codex/worktrees/ccde/软件文档生成-tcsd-deterministic-pipeline/skills/hermes/software-detail-runtime/scripts/matlab_gateway_lease.py
  - /Users/a0000/.codex/worktrees/ccde/软件文档生成-tcsd-deterministic-pipeline/skills/hermes/tcsd-runtime/scripts/satk_eval.py
  - /Users/a0000/.codex/worktrees/ccde/软件文档生成-tcsd-deterministic-pipeline/src/matlab-gateway-app.js
  - /Users/a0000/.codex/worktrees/ccde/软件文档生成-tcsd-deterministic-pipeline/src/services/matlab-gateway-contract.js

## 已确认事实（设计依据，无需再澄清）

### DSH 授权与容器支持
- @deepseek-ai/dsh：官方 npm 包（github.com/deepseek-ai/deepseek-harness），MIT，
  开发者预览，最新 0.1.0-rc.7，官方提示可能有破坏性变更
- 生产集成要求：**固定精确版本**（禁止 latest）；镜像**构建期安装**（禁止容器启动时在线
  npx）；保留 MIT 许可证与第三方依赖声明；升级 DSH 单独做兼容性验收
- 容器形态：Windows Docker Desktop 上的 **linux/amd64** Worker 容器（非 Windows 内核容器）；
  DSH 是 Node.js 应用，要求 Node 22.19+ 或 24+，官方无平台限制 → 装入现有 linux/amd64
  镜像可行；官方无「生产容器集成」现成支持承诺，兼容性由我方镜像构建/协议适配/验收负责
- 无界面执行：`dsh --profile headless "<任务指令>"`，不启动自带 3080 管理页
- 凭据：推荐平台现有管理端统一管理，Worker 启动/任务执行时安全注入 DSH
  （DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL，或 OpenAI 兼容端点），不维护两套凭据库

### Native MATLAB Gateway（:5100）契约
- Gateway 是**受保护 HTTP 作业接口，不是标准 MCP 服务**——DSH 不得自行拼接 Gateway 请求；
  架构固定为：DSH Agent → 现有技能脚本 → Gateway HTTP → 宿主 MATLAB
- 认证：Bearer <Gateway token>；执行 MATLAB 代码还需
  x-sdg-evaluate-token: <独立 evaluate token> + x-sdg-gateway-caller: tcsd-runtime
  （或 software-detail-runtime）——Gateway 只接受这两个调用方
- **token 只注入受控脚本的进程环境，不进入模型上下文；错误日志不得含凭据**
- 健康/能力：GET /health（免认证，activeJobs/activeLeases）、GET /version、GET /capabilities
  （需认证；能力：evaluate_matlab_code / analyze_slx / call_mcp_tool）
- 标准作业流：PUT /api/workspaces/<id> {"mappingId":"worker-data"} → PUT assets（text/upload）
  → POST /api/jobs/<id>（workspaceId/operation/inputAssetId/timeoutMs）→ GET 轮询
  （终态 succeeded/failed/cancelled/timed_out）→ GET artifacts → DELETE job/workspace
- 软件详设九阶段租约：PUT /api/workspaces/<id>/leases/<leaseId> {"ownerJobId":...} →
  作业携带 leaseId+ownerJobId → 全部阶段完成后 DELETE lease；关闭前租约无执行/排队作业；
  租约身份 = workspaceId+leaseId+ownerJobId
- 安全边界（不可破坏）：请求禁止宿主/容器绝对路径；仅 mappingId=worker-data；
  SLX 必须资产上传或共享工作区；MATLAB 代码禁止 OS/网络命令；call_mcp_tool 仅限
  model_overview/model_read/model_query_params/model_resolve_params

### 实施结论（已定，按此执行）
1. Worker 镜像固定安装 @deepseek-ai/dsh@0.1.0-rc.7
2. 用 DSH 无界面执行模式替换 Hermes 会话启动层
3. 保留现有九阶段技能、TCSD 技能与确定性脚本
4. 保留 matlab_gateway_lease.py 与 satk_eval.py（MATLAB 接口层不重写）
5. DSH 通过技能脚本访问 Gateway，不把 Gateway 当标准 MCP 服务
6. 模型凭据继续由现有管理端/持久化凭据体系管理
7. Gateway/evaluate token 只注入受控脚本，不暴露给模型上下文
8. DSH 固定版本 + 增加版本兼容测试

## 目标架构

```
Linux 平台后端 ──任务──▶ Windows Docker 上的 linux/amd64 Worker 容器
  (任务创建/产物/事件/凭据)        │
                                  ├─ @deepseek-ai/dsh@0.1.0-rc.7 (headless CLI)
                                  │    └─ 单元测试用例生成模式预设(生产变体)
                                  ├─ skills/hermes/tcsd-runtime (12 阶段确定性脚本+runner)
                                  ├─ skills/hermes/software-detail-runtime (保留)
                                  │    └─ matlab_gateway_lease.py / satk_eval.py
                                  └─ 宿主网络 → Gateway :5100 → 宿主原生 MATLAB
```

## 工作流（按序）

### W1 容器内 DSH 运行时
- 基础镜像沿用现有 linux/amd64 Worker 镜像；构建期安装 Node 22.19+/24+ 与
  @deepseek-ai/dsh@0.1.0-rc.7（固定版本，禁 latest；保留 MIT/第三方声明）
- 装载：tcsd-runtime 全部脚本+assets+references、模式预设生产变体、
  docs/unit-test-case-generation-mode.md、dsh_stage_runner.py、satk_eval.py、
  matlab_gateway_lease.py、yaml/openpyxl 依赖
- 凭据注入：容器启动/任务执行时由平台注入 DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL；
  Gateway token 与 evaluate token 只进受控脚本环境（satk_eval/matlab_gateway_lease），
  不进 DSH 模型上下文
- 入口：dsh --profile headless "<任务指令>"；会话日志落卷；任务 workspace 卷映射为
  容器内固定任务根

### W2 模式预设生产变体
- 基线：`~/.dsh/.agent-presets/unit-test-case-generation/`（agent.cordis.yml + preset.yml）
  复制为生产变体，persona 仅适配：
  - 工作根目录：DSH 工作区路径 → 容器任务根
  - MATLAB 访问：macOS 直连形态 → Gateway 传输（经技能脚本，见 W3）
  - SATK_MCP_LOG_FOLDER：/private/tmp/... → C:\Temp\matlab-mcp-core-server-codex
- 一字保留：执行纪律 7 条、Stage 10 速查（库块死路径 6 步法/代数冗余/候选有效性）、
  交付规则（工作簿复制到模型目录）、覆盖度即评价标准、多模型目录处理（文档 11.1）

### W3 MATLAB 传输（不重写，做整合）
- 保留 satk_eval.py 与 matlab_gateway_lease.py 作为 Gateway 唯一入口
- 检查两分支差异：生产分支 satk_eval.py（:342 起）的 Gateway/传输逻辑与 DSH 分支
  satk_eval.py（macOS new 模式 + nodesktop + CLEAN_STALE 解耦 + terminate 修复）合并为
  双路径：SATK_MATLAB_SESSION_MODE=new（本地开发）/ gateway（容器生产）；
  以参考文件为准核对 MATLAB_MCP_TRANSPORT 语义
- DSH 模式预设中的工具调用指向技能脚本，不直连 Gateway；token 处理遵循实施结论 5/7

### W4 平台侧集成
- tcsd-hermes-stage-executor.js 增加 dsh 模式：TCSD_STAGE_EXECUTOR=hermes|dsh
  （默认 dsh，实验期可切回）
- dsh 模式 = 平台后端驱动容器内 DSH 会话：headless 起会话（装载生产变体预设）→ 发送
  任务提示词（模板见下）→ 轮询完成 → 读取 outputs/checkpoints/.tcsd-host 三件套 →
  事件/产物注册沿用现有通道
- 每任务 1 个 DSH 会话（替代 12 个 Hermes 会话）；12 个原子技能不再逐阶段装载，
  skill/runtime bundle 字段保留作追溯
- telemetry：hermes-state-db → DSH 会话产物统计/计时；schema ID 不变，新字段附加式

### 任务提示词模板（平台 → DSH 会话，已验证格式）
```
slx 文件 <任务输入的 slx 路径>，
mat 文件是同一目录下的 <mat 文件名>（<mat 完整路径>），
addon 文件 <addon 目录>，
开始生成。
生成的最终测试用例 Excel（<model>_Test0001_tcsd.xlsx）额外复制一份到模型所在的目录
<模型所在目录>。
```

### W5 验证（按序）
a. python 62+ 测试全过；JS 契约测试（dsh 执行器路径）全过
b. macOS 本地：headless CLI 驱动 DSH 会话（不经 UI）跑 1 个真实模型端到端，
   证明平台可程序化驱动 DSH；对照历史记录不劣化
c. 容器模式：构建镜像 → 容器内 headless 起会话 → 经 Gateway 全链路跑通 1 个真实模型
   12 阶段；核对 12/12 checkpoint、无头 MATLAB、manifest 三件套、completion 最终门禁
d. 回退验证：TCSD_STAGE_EXECUTOR=hermes 路径仍可执行
e. 租约/并发：DSH 会话 × Gateway 租约（复用/并发/清理）记录并对照旧流
f. DSH 版本兼容测试：固定 0.1.0-rc.7 的升级验收流程条目

### W6 提交与交付
- dsh: 前缀 + 中文信息；npm run classify:changes -- --allow-ambiguous 按归属拆分；
  实验期不更新 deploy/ownership.yml、targets、release 打包
- 交付物：已验证的 DSH 分支状态 + 容器 Dockerfile/构建说明 + 生产变体预设 +
  凭据注入说明 + 合并指引（Codex 工作区 git merge --ff-only dsh/tcsd-worker-port）

## 验收标准
1. 容器内 DSH headless 会话装载生产变体预设，经技能脚本 → Gateway 跑完整 12 阶段，
   覆盖率对照历史记录不劣化
2. 平台侧 TCSD_STAGE_EXECUTOR=dsh 驱动完整任务；hermes 可切回
3. python 62+ 与 JS 测试全过；manifest 三件套完整、completion 按最终门禁
4. Gateway token/evaluate token 全程不出现在模型上下文与日志
5. codex/tcsd-deterministic-pipeline 仍为 DSH 分支祖先（快进可合并）
6. 全程未修改 Codex 工作区与 DSH 当前工作区

## 边界（不做）
agent-presets macOS 形态（保留为开发基线）、session-logs、staging、/private/tmp 路径、
release 仪式（打包/标签/ownership/targets）。schema ID 与 12 阶段协议不变。
