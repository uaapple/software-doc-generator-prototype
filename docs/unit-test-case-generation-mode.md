# 单元测试用例生成模式（Agent Mode）

> 用途：当用户要求“为某个 Simulink 模型生成单元测试用例”时，Agent 按本模式执行。
> 本模式是项目十二阶段 TCSD 流水线（`tcsd-agent-stage-pipeline/v2`）的可执行操作说明，
> 与 `docs/tcsd-12-stage-production-deployment-handoff.md`、`skills/hermes/tcsd-stage-*`、
> `skills/hermes/tcsd-runtime` 保持一致。Agent 的职责是“理解模型、设计覆盖刺激、遵守确定性边界”，
> 而不是用自由文本声称成功。
>
> 模式版本：`v1`（对齐 `tcsd-stage-skills/v2` + `tcsd-runtime/v2`）

---

## 1. 模式定位

本模式的目标：给定一个模块级 Simulink 模型 `<model>.slx` 及其配套 `<model>.mat`，
产出一份**覆盖优先**的单元测试用例 Excel（TCSD 工作簿），满足：

- Condition、Decision、MC/DC 三项覆盖优先（默认门槛 80%），expected output 是次要产物；
- 所有 `expValue(...)` 期望值必须来自**实际仿真回填**，且只允许顶层 Outport；
- 每条用例可独立运行、可追溯、可审核；
- 最终交付标准命名 `outputs/<model>_Test0001_tcsd.xlsx`；
- 全过程保留确定性证据链（interface / obligations / Coverage IR / simulation / coverage /
  repair / manifest），Agent 文本不作为完成证据。

本模式有两种运行形态，流程与门禁完全一致：

1. **平台驱动形态**：平台后端（Linux）+ Windows Hermes Agent Worker 逐阶段执行（生产默认）。
2. **本机独立形态**：本 Agent 在 macOS 开发机上直接逐阶段调用确定性运行时并自行执行宿主校验（见第 10 节）。

---

## 2. 输入与前置条件

### 2.1 必选输入

| 输入 | 说明 |
|---|---|
| `<model>.slx` | 目标模块级 Simulink 模型（用户提供，权威事实源，不得修改源文件） |
| `<model>.mat` | 模型配套数据（信号对象、标定对象、查找表、参数值；用户提供） |
| 项目附件（project addon） | 由平台/Hermes Agent 在任务开始前复制进工作区根目录；Agent 把其中所有文件视为有意提供的项目上下文 |
| 模型初始化脚本（可选） | `init_Global.m` / `Global_*.m` / `startup.m` 等，与 addon 一起进入 MATLAB 路径 |
| `coverageThreshold` | 覆盖门槛，默认 `80` |

### 2.2 运行环境（生产 Worker）

- Python（含 `yaml`、`openpyxl`）
- MATLAB + Simulink 许可证、SATK/Simulink Agentic Toolkit、`satk_eval.py` MCP 桥
- 工作区可创建/读/删 sentinel 文件（workspace I/O 门禁）
- SATK 环境变量：
  - `SATK_MCP_LOG_FOLDER`：短 ASCII 路径（Windows `C:\Temp\matlab-mcp-core-server-codex`，macOS `/private/tmp/matlab-mcp-core-server-codex`）
  - `SATK_MATLAB_SESSION_MODE=new`（无人值守生产），`SATK_MATLAB_ROOT` 指向安装根
  - `SATK_MATLAB_DISPLAY_MODE=nodesktop`（默认，MATLAB 无桌面启动，不弹窗口打断用户；调试界面时改 `desktop`）
  - `SATK_MCP_SERVER` / `SATK_MCP_EXTENSION`：非默认安装位置时显式给出
  - `TCSD_DEDICATED_WORKER=1`：仅无人值守 Worker，允许清理同 log 目录的陈旧任务级 MCP 进程

### 2.3 任务工作区布局

```text
<workspaceDir>/
  <model>.slx
  <model>.mat
  <addon 复制内容…>        # 平台已复制，Agent 不得去外部 addon 源目录读取
  inputs/                  # 原始上传归档（只读）
  outputs/                 # 所有阶段产物（结果、证据、最终 Excel）
```

所有阶段产物、证据必须落在 `outputs/` 内；任何路径越出任务 workspace 即失败。

---

## 3. 执行模型与职责边界

每个阶段 = 一个全新 Hermes session + 一个原子技能 + 一次确定性运行时执行 + 宿主独立验证：

```text
┌────────────────────────────────────────────────────────────────┐
│ 宿主（平台后端，权威）                                            │
│  · 写 tcsd-agent-stage-input/v1 manifest（含 job 快照、技能 hash）│
│  · 用 validateStageResult + host_validate_tcsd_stage.py 重新解析 │
│    产物做确定性/语义校验                                          │
│  · 通过才写 checkpoint；失败允许一次“验证修复”重试（attempt≤2）     │
│  · 第 12 阶段由宿主生成 execution manifest（Agent 无权生成）       │
└───────────────────────────────┬────────────────────────────────┘
                                │  prompt：/tcsd-stage-XX-* 精确技能调用
┌───────────────────────────────▼────────────────────────────────┐
│ Agent（Hermes session，推理边界）                                 │
│  · 读取 manifest，只执行所点名的唯一阶段                          │
│  · 先读宿主验证报告（若有）                                       │
│  · 原样运行共享运行时命令（第 10 阶段为 prepare→分析→写 proposal→ │
│    apply 两步）                                                   │
│  · 关键推理产物：Stage 6 探针设计、Stage 10 修复 proposal          │
│  · Agent 文本输出不是完成证据                                     │
└───────────────────────────────┬────────────────────────────────┘
                                │  python run_tcsd_pipeline_stage.py --manifest … --result …
┌───────────────────────────────▼────────────────────────────────┐
│ 确定性运行时（tcsd-runtime/scripts，权威执行边界）                │
│  · 输入校验、环境门禁、工作区初始化、接口/逻辑追踪提取             │
│  · 覆盖率 IR 生成、工作簿构建/校验、用例提取、仿真、expValue 回填、│
│    覆盖率采集、修复候选校验、去重、合成、清理                       │
│  · 只写 tcsd-agent-stage-result/v1；绝不写宿主 checkpoint          │
└────────────────────────────────────────────────────────────────┘
```

铁律：

1. **Agent 绝不写 checkpoint**；checkpoint 只能由宿主在独立验证通过后写入。
2. **Agent 绝不直接编辑既有工作簿**（第 10 阶段）；只能通过 proposal 由运行时合成新版本。
3. **Agent 文本（描述、注释、总结）不是证据**；覆盖率结论只能来自实测（Stage 9 起）。
4. 每阶段启动全新 session；任何 checkpoint 不得复用既有 session。
5. 硬错误（环境、MATLAB、超时、MCP）**不重试**；只有确定性校验失败才允许一次修复 session。

> **宿主侧一键执行器**：优先使用 `dsh_stage_runner.py` 完成整条流水线的阶段编排，宿主不再逐阶段手工拼接命令。流程为 `init`（建任务工作区/拷贝模型与 addon/写 task.json）→ `run --stage N`（manifest → 确定性运行时 → 语义验证 → checkpoint 写入，内部按阶段串行）→ `finish`（工作簿复制到模型目录，并生成 execution/timeline/artifact 三个宿主 manifest）。Stage 10 通过 `--stage10-mode prepare/apply` 两阶段完成（prepare 产生修复提案，apply 合成新工作簿并回填）。仅在单独调试某个子步骤（如只跑运行时、只跑语义验证）时才手工调用 `run_tcsd_pipeline_stage.py` / `host_validate_tcsd_stage.py`。

---

## 4. 十二阶段流程

| 阶段 | 技能 | 目的 | 关键产物（schema） | 门禁 |
|---:|---|---|---|---|
| 01 | `tcsd-stage-01-validate-inputs` | 校验输入文件与项目附件 | `tcsd-input-manifest/v1` | SLX/MAT/init 脚本存在且在 workspace 内 |
| 02 | `tcsd-stage-02-check-environment` | 检查 MATLAB 与模型工具环境 | `tcsd-environment-gate/v2`、`tcsd-matlab-satk-canary/v1` | Python 依赖版本、workspace I/O sentinel、MATLAB/Simulink nonce canary、SATK/MCP sentinel 一致 |
| 03 | `tcsd-stage-03-initialize-workspace` | 初始化模型工作区 | `tcsd-workspace-initialization/v1`、`tcsd-owned-resources/v1` | `setup_ut_support` 真实执行；manifest 绑定当前 jobId |
| 04 | `tcsd-stage-04-extract-interface` | 加载模型提取 I/O 接口 | `tcsd-model-interface/v1`、逻辑追踪 JSON | 根 Inport/Outport 名称非虚构；追踪来自真实模型 |
| 05 | `tcsd-stage-05-analyze-coverage` | 分析覆盖目标 | `simulink-ut-logical-mcdc-mapping/v1`、`simulink-ut-logical-mcdc-obligations/v1`、`simulink-ut-tcsd-coverage-ir/v1` | 机器可读；未解析项不得用 prose 掩盖 |
| 06 | `tcsd-stage-06-validate-state-probes` | 生成并验证状态/时序刺激 | `simulink-ut-state-probe-plan/v1`、probe 结果、刷新后 obligations/IR | 有候选必须真实执行 probe；观察计数与执行状态一致 |
| 07 | `tcsd-stage-07-build-initial-cases` | 生成首版用例 | `*_tcsd_spec.json`、`<model>_Test_coverage_ir_iter0.xlsx`、`tcsd-planning-mapping-assessment/v1` | 模板构建、根端口校验、静态映射仅作规划诊断（`authority=planning`、非阻塞、被 Stage 9 实测取代） |
| 08 | `tcsd-stage-08-simulate-backfill` | 仿真并回填期望值 | 仿真结果 JSON、回填证据 | 行/TestID/step/输出/expValue 逐项一一对应，值来自实际仿真 |
| 09 | `tcsd-stage-09-collect-coverage` | 采集首轮实测覆盖率 | `tcsd-coverage-report/v1` | 每模型 Condition/Decision/MC/DC 的 covered/total/percent/passed；与宿主重新解析一致 |
| 10 | `tcsd-stage-10-repair-coverage` | 按覆盖率修正（≤1 轮） | `tcsd-coverage-repair-brief/v1`、`tcsd-agent-coverage-repair-proposal/v1`、候选验证、`*_Test_coverage_ir_iter1.xlsx` | 达标→必须跳过；未达标→必须 attempt；`repair.passes ≤ 1`；候选需通过宿主校验与仿真 |
| 11 | `tcsd-stage-11-final-validation` | 最终仿真与覆盖率 | 最终仿真、`*_final_coverage_summary.json` | 应用过修正→重跑；未应用→明确跳过 |
| 12 | `tcsd-stage-12-package-cleanup` | 清理任务资源 | `tcsd-cleanup-result/v1` | 只清理本 job 资源；manifest 由宿主生成 |

### 4.1 各阶段行为要点

**Stage 01**：校验 `modelSlxPath`、`modelMatPath`、`projectInitScripts` 均在 workspace 内且为文件；
写输入清单（路径 + 大小）与 addon 复制记录。

**Stage 02**：生成随机 nonce → 写 I/O sentinel 并验证创建/读/删 → MATLAB 执行 canary
（Simulink 许可证、版本、`load_system('simulink')`、写回 nonce sentinel）→ 核对 nonce 一致。
任一缺失/不匹配都是硬错误。

**Stage 03**：`setup_ut_support(rootDir, initScripts)` 是**强制预加载引导**，不是恢复步骤。
它恢复 SATK 路径、把整个 workspace（排除生成/缓存目录）加入 MATLAB 路径、执行自动发现的
项目初始化脚本（`init_Global.m`、`Global_*.m`、`startup.m` 等）与环境显式脚本（去重后合并）。
登记任务资源所有权（`tcsd-owned-resources/v1`）。

**Stage 04**：加载模型，读取根 Inport/Outport 名称与端口顺序；随后 `trace_logical_mcdc` 生成
逻辑追踪。编译后的根端口数据类型/维度是仿真外部输入类型的唯一权威（不能用 `CornexCsc.Signal`
名称或 `b*` 前缀猜测，不能把 Boolean 形信号整体转成 `single`/`double`）。

**Stage 05**：`derive_logical_mcdc_mappings.py` → `build_logical_mcdc_obligations.py`
（`--allow-unresolved`）→ 非逻辑块 Decision 义务（`collect_decision_blocks.m` 经
`satk_eval` 收集真实块/连接证据，`build_decision_obligations.py --blocks` 生成
`simulink-ut-decision-obligations/v1`；MATLAB 不可用时自动回退 `--slx` 静态 XML 分析，
两者都失败则跳过）→ `build_coverage_ir.py --decision-obligations` 合并进 Coverage IR。
IR 是“模型分析 → 用例合成”
的确定性边界：每个条目记录覆盖类（Condition/Decision/MCDC）、block path/SID、required outcome、
直接根输入赋值、参数覆盖、嵌套逻辑条件状态、敏化上下文、完整时序刺激、可达性状态
（`required/covered/unsupported/unresolved/unreachable`）与证据。`unreachable` 必须要有结构或
仿真证据；缺失映射或候选耗尽**不得**转成 `unreachable`。非逻辑块义务（Switch/RelationalOperator/
MinMax/MultiPortSwitch/Saturate/Abs/使能门）只接受“能静态追到根输入或字面常量”的控制赋值，
其余保持 `unresolved` 并给出具体原因，绝不猜测根输入名。

**Stage 06**：`build_state_probe_plan.py` 生成候选（每端口 ≤32 候选、每候选 ≤8 步）；有候选则
通过 `probe_logical_mcdc_vectors.m` 真实运行 probe，用 `build_probe_mcdc_obligations.py` 把观测
到的真实输入向量转成 obligations（未观测向量保持 `unresolved`，除非有显式 unreachable 覆盖）。
probe 用内存级临时观测点，`saveflag=0`，绝不保存模型。

**Stage 07**：从模板 `assets/templates/tcsd_template.xlsx` 构建。先写确定性基线 spec
（全部根输入初始化为 0 + 一条基线用例），再 `synthesize_ir_once(iteration=0)`：保留功能用例、
追加可执行的 Decision/MC/DC 用例、按“直接输入 + 参数 + 完整时序刺激”去重、不枚举根输入。
随后 `validate_tcsd_workbook.py` 严格校验（根端口信号名、工作簿形状）。最后生成
`tcsd-planning-mapping-assessment/v1`：静态映射只是规划诊断，`authority=planning`、
`blocking=false`、`supersededBy = stage 9 (measured-simulink-coverage)`。

**Stage 08**：`extract_tcsd_cases.py` 提取用例 → `simulate_tcsd_cases.m` 按编译后端口类型构造
Dataset 仿真（`LoadExternalInput=on`）→ `backfill_expected_outputs.py` 回填稳定顶层输出 →
`simulation_backfill_evidence` 交叉核对：仿真用例集合 == 工作簿用例集合、每步输出集合一致、
数值 `isclose`（rel/abs 1e-7）。回填默认覆盖**全部标量根 Outport**；`stable=false` 自动抑制
动态输出；有状态风险输出用 `--exclude-outputs` 排除；向量输出默认排除。
MATLAB/MCP/SATK 超时（含 600s `mcp_matlab_satk_evaluate_matlab_code`）是**硬失败**，不重试仿真。

**Stage 09**：对已回填工作簿运行实测覆盖率（Condition/Decision/MC/DC），写
`tcsd-coverage-report/v1`。Stage 9 的实测覆盖是**覆盖率权威来源**，静态 obligation 匹配仅作
规划提示。宿主会重新解析并 `coverageMatches` 比对。

**Stage 10**（唯一的 Agent 推理核心）：
1. 宿主先跑 `prepare`：`validate_agent_coverage_repair.py prepare` 从实测报告生成
   `tcsd-coverage-repair-brief/v1`（低于门槛的指标、块级 path/SID、逻辑追踪、Coverage IR、根接口）。
2. Agent 读 brief，对**每个低于门槛的指标**定位未覆盖块；如果只有模型级缺口，先用
   MATLAB/SATK 定位确切块，再**只检查该块局部上游依赖切片**，识别：控制根输入、标量参数及初始值、
   Switch/RelationalOperator/MinMax/Delay/Memory/UnitDelay/状态前提、所需转移顺序/保持时间/阈值跨越、
   必须保持敏化的无关门。
3. 设计**至多 16 个定向候选，每个至多 8 个有序 TCSD action step**（`maxStepsPerTest` 只统计
   `stimulus.steps` 条目，不算求解器步/采样命中/计数器递增/Unit Delay 更新；一个跨成千上万采样周期
   的保持 = 一个 `delay_s` 动作）。
4. 写 `tcsd-agent-coverage-repair-proposal/v1`：每个候选含 `id`、`coverage_class`、精确
   `block.path`/`block.sid`、`required_outcome`（brief 有 `missing_outcomes` 时原样选择）、
   `controller.direct_inputs`/`parameters`、完整 `stimulus`（`initial_inputs`、`initial_params`、
   有序正 delay `steps`、`evidence_step`）、`analysis.upstream_slice` + 基于证据的 `rationale`。
   参数只放初始化；每一步只允许 `delay_s` + 根 `input_updates` + 空 `param_updates`。
5. 无候选时填 `unresolved`，理由只能是五种具体原因之一：
   `logic_unreachable` / `missing_parameter_control` / `state_sequence_not_constructible` /
   `probe_target_unobservable` / `unsupported_model_semantics`。禁止泛化“no candidate”；
   `state_sequence_not_constructible` 需要结构性障碍（不可控 reset、不可用转移、无法保持状态的有界
   动作序列），**大而有限的采样周期数不是障碍**。
6. 宿主 `validate_agent_coverage_repair.py validate` 独立校验：目标范围、根输入名、仅初始化参数、
   有序正 delay、有界大小、具体 unresolved 原因；只把通过候选归一化进 Coverage IR。
7. `synthesize_ir_once(iteration=1)` 去重并追加 → 构建新工作簿 → 校验 → 提取 → 候选仿真 + 回填
   验证（失败则 `repair_applied=false`，保留首轮工作簿）。
8. 判定：首轮三项均 ≥80% → `status=skipped`；否则必须 attempt；`repair.passes` 只能是 0 或 1，
   `applied === (passes===1)`。已应用 → `workbook/spec` 切换到 iter1。

**Stage 11**：`repairApplied=true` → 对修正后工作簿重跑“提取→仿真→回填→实测覆盖率”，并做
`simulation_backfill_evidence` 与 `coverageMatches`；`repairApplied=false` → 明确跳过。
本阶段是最终结果的权威仿真与覆盖。

**Stage 12**：只清理本 job 拥有的资源（任务目录内的生成入口文件等），写
`tcsd-cleanup-result/v1`（`ownerJobId == jobId`）。宿主随后生成
`simulink-ut-tcsd-execution-manifest/v1`（`authority=host`、`status=completed`、
`completion=complete|partial`、initial/final coverage、repair 记录、planning mapping 引用）、
`tcsd-stage-timeline/v1`、`tcsd-artifact-manifest/v1`。

### 4.2 阶段产物命名约定（`outputs/`）

```text
<model>_interface.json                     # Stage 04  tcsd-model-interface/v1
<model>_logical_traces.json                # Stage 04  逻辑追踪
<model>_logical_operators.json             # Stage 05  simulink-ut-logical-mcdc-mapping/v1
<model>_coverage_obligations.json          # Stage 05  simulink-ut-logical-mcdc-obligations/v1
<model>_coverage_ir.json                   # Stage 05  simulink-ut-tcsd-coverage-ir/v1
<model>_state_probe_plan.json              # Stage 06  simulink-ut-state-probe-plan/v1
<model>_state_probe_results.json           # Stage 06  probe 实测
<model>_tcsd_spec.json                     # Stage 07  JSON spec
<model>_Test_coverage_ir_iter0.xlsx        # Stage 07  首版工作簿（合成器追加用例后重命名；未追加时首版即 Test0001 名）
<model>_planning_mapping_assessment.json   # Stage 07  tcsd-planning-mapping-assessment/v1
<model>_cases_mcdc.json                    # Stage 08  提取的用例
<model>_sim_results*.json                  # Stage 08/10/11  仿真结果
<model>_initial_coverage_summary.json      # Stage 09  首轮覆盖率
<model>_coverage_repair_brief.json         # Stage 10  tcsd-coverage-repair-brief/v1
<model>_agent_coverage_repair_proposal.json# Stage 10  tcsd-agent-coverage-repair-proposal/v1
<model>_agent_repair_validation.json       # Stage 10  宿主候选校验
<model>_agent_repair_coverage_ir.json      # Stage 10  归一化候选 IR
<model>_coverage_ir_synthesis_iter1.json   # Stage 10  合成报告（added 数）
<model>_repair_candidate_validation.json   # Stage 10  tcsd-repair-candidate-validation/v1
<model>_Test_coverage_ir_iter1.xlsx        # Stage 10  修正后工作簿（证据）
<model>_final_coverage_summary.json        # Stage 11  最终覆盖率
<model>_Test0001_tcsd.xlsx                 # 最终交付（标准命名，唯一用户下载产物）
<model>_tcsd_cleanup.json                  # Stage 12  tcsd-cleanup-result/v1
.tcsd-evidence/                            # input-manifest / environment / canary / initialization
.tcsd-checkpoints/                         # 宿主 checkpoint（每阶段一个）
.tcsd-agent/stage-XX/attempt-N/            # 每阶段 manifest/result/validation/semantic
.tcsd-host/                                # execution-manifest / timeline / artifact-manifest
```

---

## 5. TCSD 工作簿核心规则

### 5.1 模板与形状

- 必须从**捆绑模板** `skills/hermes/tcsd-runtime/assets/templates/tcsd_template.xlsx` 复制/编辑，
  或经 `build_tcsd_from_json.py --template <模板>` 生成；禁止自建相似空白工作簿。
- Sheet 名 `TCSD`；列：`TestID / Name / Type / Requirement ID / Test Case Description /
  Initialization / Action / Work Status / Report Links`。
- 第 2 行为 `TestGroup`；测试行 `Type = Test`、`Work Status = reviewed`；保留模板样式、
  冻结窗格、批注/状态选项。
- 每条 `Type = Test` 行**自包含**：`Initialization` 必须含全部根输入的确定性启动赋值全集，
  不能只写相对 TestGroup 的增量；下游执行器不继承 TestGroup。

### 5.2 Initialization

```text
// Initialization of input signals
SignalA = 0;
SignalB = 1;
p ParamName_C = 1;        // 标量参数覆盖，p 前缀
VectorSig 1=5000;         // 向量根输入逐元素赋值（最终工作簿禁用整体括号语法）
VectorSig 2=5000;
```

- 每条可执行赋值左值必须是**编译后根 Inport** 的确切名称；不得沿用其他模型的公共初始化、
  不得写共享 MAT 里有但本模型根端口没有的信号、不得按命名约定发明别名。
- 标量标定/参数覆盖用 `p Param = value;`，允许出现在 Initialization 与 Action；
  用于满足判定/MC/DC 向量（例如默认 0 的使能标定必须置 1 才能让 AND 输入为真）。

### 5.3 Action

```text
[+100ms]                    // 相对时间标记，必须带单位（s/ms）
Out1 = expValue(1);         // 期望输出赋值（左值必须根 Outport）
[+0.2s]
InputA = 0;
[+0.01s]
p EngStrtStop_bRefuEndGearPShd_C=1;
[+0.1s]                     // 每条 Test 最后必须有最终相对延时标记
```

- 可执行语句以英文分号结尾；注释 `//` 开头；`Test Case Description` 写明方法
  （边界值、等价类、需求分析、coverage feedback 等）。
- 一条 Test 可跨多行，但同一 TestID 不得重启；优先一行一 Test。

### 5.4 expValue 语义（本项目最容易出错处）

- **只允许顶层 Outport** 出现在 `expValue(...)` 左值；禁止内部信号、本地记录名、
  `out_mil_ec` 名。
- 调用形式 `expValue(var1, duration, offset)`：`var1` 为期望值（数值或输入信号名字符串），
  `duration` 为检查时长，`offset` 为相对当前区间偏移。**第二、三个参数不是数值容差**。
- 仿真回填默认写 `expValue(value)`；仅当输出在目标窗口内稳定、且刻意做延迟/窗口检查时才用
  三参形式。
- 输出在下一 `[+...]` 步骤前仍在 ramp/持续变化 → 该 Test 省略该输出期望（除非用户显式要求
  密集采样阶梯）。不得把单个采样值写成保持常量。
- 有状态输出（Stateflow、UnitDelay/Delay/Memory、锁存、边沿、`*_Old` 反馈）**不得**从初始化/
  默认值推断；`[+delay]` 后的检查看到的是延时结束后的状态，必须来自可信全仿真/MQTester
  等价轨迹确认的稳定后延时值，否则省略。

### 5.5 语义声明一致性门禁（语义声明 = Test 名/描述/Action 注释中声称到达了某状态/档位/模式）

1. 找出能证明/证伪该声明的顶层输出。
2. 从模型常量/枚举/可信仿真解析声称的状态值。
3. 与同一 action step 的 `expValue(...)` 比对：
   - 无仿真证据前只能用 request/target/attempt 措辞；
   - 回填后只有 `expValue(...)` 证明时才允许 `shifted/reached/entered/切换到/进入` 等成功措辞；
   - 内联注释声称的具体值必须与对应顶层状态输出 `expValue(...)` 完全一致；
   - 文本说成功而仿真期望仍为旧/默认状态 → 工作簿不可交付：修复刺激并重跑回填，或改写为
     blocked/not-reached/inhibited，或删除成功声明；未解决的语义冲突行不得 `reviewed`。

### 5.6 连续输出合理性门禁 + 输出族一致性

- 名称含 `pwr/tq/volt/curr/u/i/spd/temp/soc/pct/lim/max/min/peak/contns/thd` 等片段的顶层输出
  视为连续物理量。逐项检查：非布尔连续输出恰好为 0/1 且无解释；跨步/同族数量级跳变；同族
  （`pwrMax*`/`pwrPeak*`/`pwrContns*`）违背常理排序（如 `pwrMax < pwrContns`）；Test 声称
  限值路径激活但输出停留在初始化/sentinel 值。
- 可疑值三选一：仿真/probe 证据确认并加注释；修刺激/保持时间重跑回填；从该 Test 移除。
- 输出族分组核对：布尔 `b*` 可用 0/1；枚举/状态 `st*` 用模型常量解析的小整数；连续族用
  工程量级。

---

## 6. 覆盖目标设计规则（Stage 05/06/07 的思维清单）

**设计前必须产出覆盖义务矩阵**：`block path/SID → 覆盖类(Condition/Decision/MCDC) → required
outcome → 控制根输入或标量参数 → 计划 Test/action → 证据状态`。Test 名和注释不是覆盖证据。

| 块类型 | 义务 |
|---|---|
| Switch | true/false 两侧都驱动（真实触发信号跨过判据） |
| RelationalOperator | 相等/不等：每个被比较常量 + 一个合法不匹配基线；大小比较：below/equal/above；符号判据（`<0`、`~=0`）：负/零/正 |
| 相等银行 | 同一模式信号（`stMod`/`stMode`/`stCfg`）对多个常量比较 → 每个常量一个用例 |
| Logical Operator | AND：全真 + 每输入单独假；OR：全假 + 每输入单独真；考虑上游 NOT/反相后反推根输入赋值；映射保留在义务矩阵。若某输入条件**严格蕴含**另一输入（同信号同向比较，如 `(x>0.01)` ⊃ `(x>0)`），弱端独立向量代数不可达——义务构建器自动标记 `unreachable`（带证据），Stage 10 无需重复证明 |
| MinMax | 每个输入端口至少赢一次；相等/平局不算可靠赢家 |
| MultiPortSwitch | 每个合法 selector 值 + default 分支（按该块合法性推导，不按同名枚举）；非法 selector 必须通过改刺激/保持/安全标定修复，不靠全局诊断抑制 |
| Saturate | 低于下限 / 区间内 / 高于上限三区 |
| Abs | 两种源符号 |
| Safe_Divide | 分母 0（保护路径）与非 0 |
| Lookup | 代表性区域 + 边界断点 |
| Delay/Latch/StopWatch/Edge | 初始、置位、保持、复位、超时多步序列 |
| 有状态 MC/DC 条件 | 先做状态可达性：回查 From/Goto、RSLatch/Memory/UnitDelay、EdgeRising/Falling、CountR/StopWatch、Switch 触发路径，直到根输入/参数/保持/复位阻断；先驱动内部状态到位，再保持/转移足够久；够不到 → 记 `unresolved`/`unreachable` 并给出上游阻断证据 |
| 锁存布尔根输出 | 激活侧有覆盖需求时，工作簿必须出现至少一条稳定 `expValue(1)`/激活态期望，或给出不可达证据；不能全册 0 |

**覆盖启发式**：每个主要子系统 ≥1 条 Test；阈值 low/equal/high；关系相等银行全覆盖；
`maxStepsPerTest` 只数 TCSD action 条目；滤波/去抖/LowPass/StopWatch 前置时用足够保持时间
（未知时序时保守 `[+1s]`）；模式/状态转移拆成聚焦 Test，禁止一个长遍历 Test 吞掉多个转移
（除非每步刺激不同、保持足够、且有仿真证明输出真的变化）。

**使能信号不得全钉一侧（B04/B14/B15/ParkCrlB02/liutsA04B02/B03 六次实证，2026-08-17~18）**：首版用例必须包含每个使能/状态判据根
输入（如 `wSOE`/`bXXVld` 类使能位）激活与非激活两侧的刺激。B04 首版 4 条用例全部
`wSOE≤0`，能量信号恒 ≤0，EdgeFalling/比较器/RampLimiter/限幅逻辑整片钉死一侧
（首轮 Condition 50% / Decision 55% / MC/DC 0%）；B14 主链 `bRemLvBatMntnReq` 需
`pctLvBatSoc≤70 ∧ stSocPrcsn==2` 同刻成立，首版未同时满足；B15 首版把 `icbms_pctHVBatSOCDisp`
钉在 0（<10）→ `SocWkup=0` → `Inhb=1` → `Req` 整链死锁（首轮 Condition 83.5% / Decision 64.6% /
MC/DC 37.5%）；ParkCrl B02：`RPACmd` 为 R/S 两链共享根，锁存无法独立翻转；liuts A04_B02：标定参数 `WarnMsg_bSelBatSOE_C` 默认非 0 钉死 Switch23 判据 → u3 子树（Product→Divide→Switch1→MultiPortSwitch20）整链因惰性求值从不执行（探针 decisioninfo 坐实），参数覆盖 `p WarnMsg_bSelBatSOE_C=0` 打开后 Switch1 两侧各执行 101 次；liuts A04_B03：`WarnMsg_bHvBatPrdnRngOvrd_C` 默认 1 钉死顶层 Switch3 → in3 链（Switch1/Switch2）惰性死寂，参数覆盖 0 后整链激活（两次标定默认值变体）。五次同构：**某个多条件 AND 使能链 / Switch 判据的根输入（含标定参数默认值）被钉死一侧**，未选中子树因惰性求值整链死寂。Stage 07 基线生成时
先扫 Switch 判据/状态可达性链上的使能根输入，确保正反两侧都进首版，而不是留到 Stage 10 补救。

**场景激活矩阵——初版必打清单（11 次运行实证，2026-08-19）**：逐次复盘证明，Stage 10 修复轮
几乎总是在重建**模块级业务场景**，而初版只打了散点义务。初版必须包含每个主要子系统的
"场景激活"用例（场景条件同刻成立），否则该子系统全部义务留到修复轮：

| 运行 | 场景 | 根条件（初版缺） |
|---|---|---|
| B04 | 能量使能 | `wSOE>0` 全 0 钉死 |
| B09 | 上电边沿 | KeyOn/OTAOn/KeyStrt 无翻转序列 |
| B14 | 电池维护 | `pctLvBatSoc≤70 ∧ stSocPrcsn==2` 未同刻 |
| B15 | SOC 唤醒 | `SOCDisp≥10` 全 <10 |
| ParkCrlB01 | RPA 告警 | `LrcpReq≠0 ∧ RPACmd==0` 未同刻 |
| ParkCrlB02 | RPA 锁存 | KeyOn+Gear+RPACmd+LrcpReq 组合未构 |
| liutsB01 | 计数极限 | CountR 未驱动到 MAX=400 |
| liutsB02/B03 | 标定默认值 | `bSelBatSOE_C/bHvBatPrdnRngOvrd_C` 默认非 0 钉死 Switch |
| EngA09 | 工况越界 | MoutnUp/Dwn 触发 MPS 越界（不可达，证据） |
| EngA11 | **加油场景** | 51 用例仅 2 条置加油请求=1，整模块未激活 |
| EngA12 | AnulInsp 检查锁存 | `stAnulInsp 0→2 边沿 ∧ stIdleSpd∈{1,2} ∧ tCoolt≥80 ∧ SOC∈(20,93) ∧ Gear=6` 五条件从未同刻，RSLatch.Q 恒 0 |

**六种场景模板（初版合成器应按此扫描生成）**：
1. 使能链激活：模块级 AND/Switch 链根条件同刻成立（含比较常量核对）
2. 标定默认值翻转：从 MAT 读参数默认值，非 0 门控判据的加 `p Param=0` 用例（B02/B03）
3. 模式/枚举遍历：Stateflow 工况/枚举端口每个合法值一条（A11 挡位 N/P、发动机状态、加油请求）
4. 边沿序列：KeyOn/请求类 0→1→0 完整翻转（B09）
5. 计数/延迟到极限：CountR/StopWatch 驱动到 MAX 或超时边界（liutsB01/A09 库块）
6. 锁存 set→hold→reset：RSLatch 全时序（ParkCrlB02/A11）
实现提示：Stage 5 扫描各子系统顶层 Switch/AND 的根条件（含标定参数默认值），Stage 7 按模板
生成场景用例。**批次 1 已代码化（2026-08-19）**：Switch 控制端口按判据解析（u2→端口 2，
修复硬编码端口 3）、标定默认值翻转义务（scenario_activation_calibration_default 证据）、
MPS DataPortIndices。**批次 2 缺口（EngA12 实测）**：Switch 控制端经 Logic/Relational/
UnitDelay 链时追踪器停下（unsupported_src_type_*）→ 多条件根输入链仍无法生成翻转用例。
**批次 2 已代码化（2026-08-21）**：`collect_decision_blocks.m` 的 `trace_upstream` 对
Logic/RelationalOperator/UnitDelay/Delay/Memory/Switch/MinMax/Abs/Saturate/Sum/Gain/Bias
生成结构化表达式节点（kind 与 trace_logical_mcdc 对齐：logic/relational/stateful/switch/
minmax/abs/sum，子系统 Inport 与 From 穿透到根输入）；`build_decision_obligations.py`
Switch 分支对控制端表达式复用 `derive_state` 推导 true/false 根输入组合义务（证据
`scenario_activation_logic_chain`）。实证（EngA11 任务模型）：Switch 控制端 expression
从 0 → 19 个；简单 AND 链（`AND(stRefuReq~=0, stMode==2)`）端到端推导
`{stRefuReq:1,stMode:2}` / `{stRefuReq:0,stMode:2}`；跨层 From/Sum+UnitDelay 复杂链
derive_state 保守标 `logic_chain_unresolved`（留给探针，符合设计）。

**最小功能域密度**：故障/有效性信号族（`*SigErr`/`*Vld`/`*Flt`/`*FltLvl`/诊断使能复位）、
连续阈值边界输入、模式/配置枚举、Stateflow 目标状态、诊断/错误路径、独立运行模式 —— 每个域
至少一条独立 Test、明确的合并理由、或不可达/无效解释。

---

## 7. 确定性运行时与宿主验证门禁（每个阶段必须通过的关卡）

Agent 只负责产出 `tcsd-agent-stage-result/v1` 引用的产物；宿主执行：

1. `assertArtifact`：产物存在、非空、JSON 可解析、XLSX 为 zip（`PK` 头）、路径在 workspace 内。
2. 阶段专属 schema 检查（第 1/2/3/4/5/6/7/8/10/12 节内容见第 4.1 节）。
3. 语义验证（`host_validate_tcsd_stage.py`，阶段 {2,6,7,8,9,10,11}）：
   - Stage 2：环境门禁证据完整（`matlabRoot`、`runner`、passed）；
   - Stage 6：probe 计划、执行状态、观察计数一致；
   - Stage 7：工作簿含 `TCSD`、`testCount ≥ 1`、`actionStepCount ≥ testCount`、planning
     assessment 为 `satisfied|advisory` 且 `blocking=false`、`supersededBy.stageIndex=9`；
   - Stage 8：Agent 计数（simulation/workbook/expValue）与宿主逐项回填明细一致；
   - Stage 9/11：Agent coverage 与宿主重新解析的覆盖率报告一致（`coverageMatches`），
     `raw.coverage` 以宿主解析为准；
   - Stage 10：proposalItemCount/acceptedCandidateCount/unresolvedCount/synthesisAddedCount
     与宿主验证一致；`applied=true` 时 `candidateValidationPassed=true`。
4. checkpoint 追溯封套：技能名/版本/bundleVersion/bundleHash/skillFileHash、runtime hash、
   sessionId 不重复、profile/model/tokenUsage、skill 实际加载证据（`hermes-state-db+skill-usage`）、
   prompt sha256、toolLogs 摘要（禁止 hiddenReasoning/chainOfThought/secret 字段）。
5. Stage 10/11 状态机：首轮不足 80% → 不得 skip；达标 → 必须 skip；应用过修正 → Stage 11 不得
   skip；未应用 → Stage 11 必须 skip。
6. Stage 12：Agent 只能交清理证据；execution manifest 必须 `authority=host` 且与已验证的
   coverage/repair 状态完全一致（含 planning mapping 的 `supersededBy.coverageArtifact` 指向
   首轮覆盖率产物）。

---

## 8. 错误处理与重试策略

| 情形 | 处理 |
|---|---|
| 输入缺失/越界（Stage 1） | 硬失败 `tcsd_input_invalid`，不重试 |
| 环境门禁失败（Stage 2） | 硬失败 `tcsd_environment_gate_failed`，不重试 |
| MATLAB/SATK/MCP 超时或仿真失败（8/11 等） | 硬失败 `tcsd_stage_timeout`/`tcsd_stage_runtime_failed`，不重试、不补回填 |
| session 复用 | 失败 `tcsd_session_reused`，禁止 |
| 确定性校验失败（产物/schema/语义） | 允许**一次**新 session 修复：读宿主验证报告，只修报告指出的缺陷，重跑同一阶段（attempt ≤ 2） |
| 覆盖率未达 80% | 不是失败：Stage 10 最多修正一轮，修正后结果即最终结果，`completion=partial` 交付 |
| Agent 无候选 | 必须给出五种具体 unresolved 原因之一，禁止泛化；generic `no_unique_executable_coverage_ir_candidates` 不是可接受结论 |
| 候选仿真失败/重复 | `repair_applied=false`，保留首轮工作簿，partial 交付 |
| 未解析/unsupported 的 IR 项 | 即使百分比达标也强制 partial 完成 |

---

## 9. 验收标准与交付物

最终交付（前端只暴露这些）：

1. `outputs/<model>_Test0001_tcsd.xlsx` —— 标准命名最终工作簿（iter0/iter1 工作簿仅作证据）；
   另复制一份到用户提供的模型/输入所在目录（`<model>.slx` 同目录，文件名不变），最终汇报中给出该副本路径。
2. 宿主生成的 `simulink-ut-tcsd-execution-manifest/v1`：`status=completed`、
   `completion=complete|partial`、initial/final coverage、repair 记录、workbook 引用。
3. 逐阶段 checkpoint（技能版本/hash、runtime hash、session、token usage、验证报告）。

交付前自查清单（对齐 `validate_tcsd_workbook.py` 与宿主语义门禁）：

- [ ] 工作簿基于模板构建，Sheet=TCSD，Test 行 `Type=Test` + `reviewed`；
- [ ] 每条 Test 自包含初始化（全部根输入），Action 以最终相对延时标记结束；
- [ ] 所有普通赋值左值 = 编译后根 Inport；所有 `expValue` 左值 = 顶层 Outport；
- [ ] 无三参 expValue 被当容差；无 ramp 输出的保持式期望；有状态输出来自可信轨迹；
- [ ] 向量输入逐元素；向量输出已排除（除非宏语法与端口映射确认）；
- [ ] 连续物理输出通过合理性门禁；输出族排序合理；
- [ ] 语义声明与 `expValue` 证明一致；无未解决的语义冲突行；
- [ ] 覆盖义务矩阵逐项核对：covered / unreachable(invalid，带具体模型理由) / unresolved(明确列出)；
- [ ] 首轮覆盖率达标或已完成单轮修正，final coverage 为实测；
- [ ] 源 `.slx`/`.mat` 未改动；工作区已清理；环境/session 已还原。

---

## 10. 本机独立执行模式（无平台/Hermes 时，本 Agent 直接执行）

当本 Agent 在 macOS 开发机上直接执行（无 Linux 平台 + Windows Worker 时），职责不变：
**Agent 负责推理边界（分析与 proposal），确定性运行时负责执行边界，Agent 自任宿主做验证与
checkpoint**。步骤：

0. **工作区边界（DSH 专用）**：所有任务产物一律落在 DSH 工作区
   `/Users/a0000/Documents/DSH_Proj/tcsd-pipeline-analysis/` 下；严禁在 Codex 工作区
   （`/Users/a0000/Documents/Codex_Proj/软件文档生成-tcsd-deterministic-pipeline`）创建、
   修改或删除任何文件（包括其 `data/` 下的任务产物）。
1. **准备任务工作区**：新建
   `/Users/a0000/Documents/DSH_Proj/tcsd-pipeline-analysis/data/unit-test-case-generation/tasks/<uuid>/workspace/`，放入
   `<model>.slx`、`<model>.mat`、`inputs/`、`outputs/`，复制项目 addon（如
   `skills/hermes/tcsd-runtime/assets/support-package/` 或 `.local/project-addons/<projectId>/`）。
2. **环境准备（macOS）**：
   - `MATLAB_ROOT=/Applications/MATLAB_R2026a.app`（本机约定，见 AGENTS.md）；
   - `SATK_MCP_LOG_FOLDER=/private/tmp/matlab-mcp-core-server-codex`（短 ASCII 路径，
     允许本地 socket 创建）；
   - `SATK_MATLAB_SESSION_MODE=new`、`TCSD_DEDICATED_WORKER=1`（本机为无人值守 Worker 形态）；
   - `satk_eval.py` 必须能以“允许创建本地 socket”的方式运行（沙箱外权限）；
   - Python 需 `yaml`、`openpyxl`。
3. **逐阶段执行**（`for stage in 01..12`）：
   - 写 `tcsd-agent-stage-input/v1` manifest（job 快照：`modelSlxPath`、`modelMatPath`、
     `workspaceDir`、`outputDir`、`projectInitScripts`、`coverageThreshold=80`、
     `stageIndex`、`attempt`、skill/runtime 版本与 hash）；
   - 运行 `python3 run_tcsd_pipeline_stage.py --manifest <manifest> --result <result>`
     （Stage 10 用 `--stage10-mode prepare/apply` 两步，之间写 `tcsd-agent-coverage-repair-proposal/v1`）；
   - 读 `tcsd-agent-stage-result/v1`；对语义阶段（2/6/7/8/9/10/11）运行
     `host_validate_tcsd_stage.py --request <semantic-request>` 取得 `tcsd-host-semantic-validation/v1`；
   - 用 `validateStageResult`（`src/services/tcsd-pipeline-contract.js`）做宿主侧校验；
   - 通过后写 checkpoint `tcsd-agent-stage-checkpoint/v2`（含验证报告、追溯封套）；
   - 失败且属确定性校验缺陷 → 新 manifest（attempt 2）重跑该阶段；硬错误 → 停止并报告。
4. **收尾**：Stage 12 清理证据后，宿主侧生成 execution manifest / timeline / artifact
   manifest（可复用 `packageStage12` 的逻辑），最终工作簿复制为 `<model>_Test0001_tcsd.xlsx`。

约束：

- 每阶段都是新 session/新环境，不跨阶段共享 MATLAB base workspace（`SATK_MATLAB_SESSION_MODE=new`）；
- 本机交互式 MATLAB Desktop 存在时，只清理任务归属的 MCP 进程，不强制关闭用户会话；
- 不得把本机配置（macOS 路径）带入生产部署。

### 10.1 进程与超时执行经验（实测，2026-08-16 会话 3c951a5a 与 3c9d00d3）

以下规则来自真实运行事故，Agent 必须遵守，否则会误判失败并反复重试：

1. **`satk_eval.py` / `run_tcsd_pipeline_stage.py` 一律前台执行，`timeoutMs` 给足 1,200,000（20 分钟）**。
   MATLAB 冷启动可能 10 分钟（卡在启动对话框）也可能 30 秒（热会话复用），给足超时后耐心等待。
2. **DSH 后台任务被 `SIGTERM` 杀掉 ≠ 任务失败**。实测中 bash 作业只杀"直接命令进程"，
   不杀其子进程组——被杀的通常是 bash 包装/runner 本身，而 satk_eval/MCP/MATLAB 会作为
   孤儿进程继续工作并正常完成（canary、探针、仿真全部落地）。**以产物文件为准**：
   canary sentinel、`tcsd-agent-stage-result/v1`、探针输出 JSON 出现即成功，不要用 job 状态判断。
3. **串行执行 satk_eval，禁止并发**。`TCSD_DEDICATED_WORKER=1`（或 `TCSD_CLEAN_STALE_MCP=1`）时，
   每次 satk_eval 启动都会执行 `clean_stale_mcp_processes()`，杀掉同 `SATK_MCP_LOG_FOLDER` 下
   所有"陈旧"任务 MCP——并发启动会互相杀掉对方刚启动的 MCP server。一个任务内连续多次调用时
   也要等上一次完全退出（server 日志出现 "Application shutdown complete"）再启动下一次。
4. **失败诊断顺序**：① 检查产物文件（sentinel/result/probe JSON）；② 读 MCP 日志
   `/private/tmp/matlab-mcp-core-server-codex/server-*.log` 与 `watchdog-*.log`（记录 evaluate
   开始/完成、MATLAB PID、清理动作，能区分"正常完成"与"真失败"）；③ 检查残留进程
   （`ps aux | grep -E "matlab-mcp|MATLAB_R2026a"`）；④ 确认后才决定是否重试。
5. **不要动用户自己的 MCP 服务器**（`--matlab-session-mode=existing`、log-folder 为
   `/var/folders/.../T/matlab-mcp-server-*` 的进程）。`clean_stale_mcp_processes` 只匹配
   同 `SATK_MCP_LOG_FOLDER` 的任务 MCP，用户 existing 服务器不在任务树里，误杀会破坏其他会话。
6. **MATLAB 由 watchdog 按设计清理**：server 正常关闭后 watchdog 会 "Trying to terminate children"
   杀掉任务 MATLAB——这是正常清理，不是异常；不要因此误报"进程被杀"。
7. 环境变量必须以 `SATK_MATLAB_ROOT` 为准（`satk_eval.py` 只读取它来传 `--matlab-root`；
   只设 `MATLAB_ROOT` 会得到 "no valid MATLAB environments found"）。两者都设最稳妥。
8. **不要设置 `TCSD_CLEAN_STALE_MCP=1`（实测 2026-08-17）**：杀掉残留任务 MCP 的动作会被
   DSH 执行环境观测到，导致整个命令被 SIGTERM（工作仍由孤儿进程完成，但每个阶段都要
   sleep 等待，单任务浪费 30+ 分钟）。残留 MCP 不影响新 server 启动，无需清理；`TCSD_DEDICATED_WORKER=1`
   不再隐含清理（satk_eval.py 已解耦，仅显式 `TCSD_CLEAN_STALE_MCP=1` 才清理）。
9. **`dsh_stage_runner.py` 全链路编排已实测通过（B04，2026-08-17）**：12 阶段 12 个 checkpoint
   全部 `completed`，全程 0 次 SIGTERM 干扰、无 MATLAB/MCP 硬错误。两个宿主侧要点：
   ① 语义阶段（7 起）结果不含 interface 产物时，runner 会回退到 `outputs/*_interface.json`
   查找，不要把这个文件删掉；② `finish` 从产物解析真实 initial/final 覆盖率与修复事实，
   按**最终**三指标门禁判定 `completion`（首轮未达标是信息性记录，修复成功即 `complete`；
   ParkCrl B02 实测：首轮 41.7/27.3 → 最终 100/84.8 判 `complete`），不要手工改写
   execution-manifest；unresolved 明细 = 修复提案条目 + final coverage summary 的实测缺口
   合并去重（提案未记录时回退到 items，ParkCrl B01/B02 实测验证）。
10. **`getOrStashExceptions 未定义`排查（B15 实测，2026-08-17）**：simulate 脚本执行
   `restoredefaultpath` 后 MCP 核心路径未恢复会报此错。本机 addon 工具箱目录名是
   "MATLAB MCP **Server** Toolbox"（非 "Core Server"），`setup_ut_support.m` 的
   `restore_matlab_mcp_core_path()` 已修复为扫描 `+matlab_mcp` 兼容任意目录名；若在
   新机器上再遇此错，优先检查该函数是否找到了正确的工具箱目录。

### 10.2 Stage 10 常见难点速查（A02_B02 实战沉淀，2026-08-17）

**场景：唯一覆盖缺口是"库块（ITKLib/自定义库）内部块的 Decision/MC/DC 分支未执行"**（如
`StopWatchRE/Switch1 触发器 false`）。这类缺口曾耗时 50 分钟（其中 30 分钟浪费在探针等待），
按以下步骤可压缩到 10-15 分钟：

1. **定位库块**：缺口块在 `simulink/systems/system_<X>.xml` 里是 Reference 块（`SourceBlock=库名/块名`，
   SID 如 `98:1125`），库内部结构在**库 SLX**（如 `ITKLib.slx`）的 system xml 里；先解库 SLX 还原内部。
2. **端口映射**：库块 `PortCounts in="N"` → 按库内 Inport 的 `Port` 参数对应父系统 Line 的
   `Src` 连接，逐个确认每个端口的真实信号来源（如 E=充电状态 OR 输出、R=NOT(E)、dT=时间步常量）。
3. **代数化简**：把库内 Switch/UnitDelay 链化简为布尔表达式（如 `y = E ? Sum1 : 0`），
   判断缺口分支的值是否**可能影响任何可观测输出**；若不可能 → 结构死路径候选。
4. **布线互补检查**：若缺口分支的判据与另一判据严格互补（如 `R = NOT(E)`），
   代数上该分支不可达，直接在 proposal 里报 `logic_unreachable` 并给出化简证据。
5. **代数冗余检查（AND/OR 输入互含，B04 实测 2026-08-17）**：当 AND/OR 两个输入是对同一信号
   的比较且一者**严格强于**另一者（如 `(x>0.01)` 强于 `(x>0)`、`(x≥c)` 强于 `(x>c)`），
   强端 true 必然蕴含弱端 true，弱输入端的独立影响向量（AND 的 `(T,F)`、OR 的 `(F,T)`）
   **代数不可达**，无需探针即可判定。
   **该判定已静态化（2026-08-17 实施）**：`build_logical_mcdc_obligations.py` 构建义务时自动
   完成（穿透 DataTypeConversion/子系统 Inport/From 链解析常量，如 RampLimiter2 的
   `LimitUp`→Constant7 `resolvedValue=0.01`），不可达向量标记 `status=unreachable` + 蕴含
   证据；`run_tcsd_quality_loop.py` 在 Stage 9/11 自动把带证据的不可达向量从覆盖率分母排除
   （clamp 不低于 covered）。Stage 10 遇到此类缺口直接引用构建期证据，无需重新证明。
   B04 实测：`AND(233,234)`（233: `(In-y_prev)>LimitUp(0.01)`，234: `(In-y_prev)>0`）与
   `AND(235,236)`（LimitDown(0.005) 同构）各 1 条 MC/DC 缺口即此类；静态标记后 MC/DC
   66.7%(4/6) → 100%(4/4)。
5.5. **类型域/值域代数证据（liuts A04_B01 实测，2026-08-18）**：当比较/Equal 的一侧是
    **值域受类型约束**的信号（如 `DTC(CountR.Out)` 把布尔比较结果转 uint8 → 值域恒
    `{0,1}`），与常量 2/3/4 的 Equal/GE 及后续链（OR2 端口2、Switch 判据）代数不可达——
    直接报 `logic_unreachable` 并给类型推导证据（无需探针即可判定，探针坐实更稳）。
    同类还包括：uint16 计数器 vs int32 饱和边界、布尔→uint8 值域排除常量比较。
    注：**Simulink 惰性求值**（条件输入执行）会使未选中分支的块（如 MinMax 输入 2 wins）
    在正常分支下永不执行——这类缺口若只有异常分支（如参数覆盖 `LimUp<LimLow`）可达，
    超单轮修复限制时按 `measured_uncovered` 如实记录，不要硬造用例。
5.6. **MPS selector 越界模型固有约束（EngStrtStop A09 实测，2026-08-18）**：当 Stateflow/
    上游逻辑的工况 ID 可输出**超出 MultiPortSwitch 合法选择范围**的值（如 MoutnUp/Dwn 的
    ID=4/5 喂 0..3 的 MPS，`DiagnosticForDefault=Error`），驱动该状态的向量**仿真即报错**——
    这是模型固有约束，不是覆盖缺口：探针已容错记录 `simulation_error_mps_selector` + 错误
    消息，义务构建器把该算子全部未观测向量标 `unreachable`（证据 = MPS 约束 + 实测报错），
    宿主校验接受该证据。识别要点：探针报 MPS selector out of range → 查其控制端口上游
    （Stateflow 输出/枚举转换），确认值域越界是模型设计如此，而非刺激错误。
5.7. **MC/DC 组合性缺口与候选配额（A11 实测，2026-08-19）**：长向量 OR/AND（6~17 输入）
    的独立效应向量是**全局状态组合**缺口——覆盖一个端口需其余全部输入同时反相
    （OR 全假 / AND 全真），每个输入自身可能是标定/状态链。处置：
    ① 修复前先判"兄弟全反状态"可达性（共享根/标定钉死 → 代数证据 unreachable；
    探针可构造 → required），不要盲目消耗候选；② 同块多个向量共享同一兄弟上下文，
    一个序列可覆盖多个（候选按块分组，比逐向量候选高效）；③ RSLatch/StopWatch 锁存块
    是持续软肋（B09 state_sequence_not_constructible / ParkCrlB02 共享根 / A11 两处
    各剩 2-3 向量，三次实证）：先查 set/reset 链是否共享根，否则给 set→保持→reset 全
    时序，且预期每块每轮只能覆盖部分向量。
    **配额预期**：单轮 16 候选 ≈ +20~25 向量；MC/DC 缺口 >30 向量的模型（如 A11 总量
    85）单轮必然 partial——按配额如实交付并列出缺口清单，这不是失败。
5.8. **MPS 数据链标定门控（RngPrdn A05 D04 实测，2026-08-21）**：MultiPortSwitch 的
    **selector 义务正确（match 根输入合法值）但用例执行后 MPS 覆盖恒 0**——根因不是
    覆盖记录问题，而是 **MPS 输出链被下游 Switch 旁路（惰性求值）**：MPS 输出直连的
    Switch（如 Switch5/7/9）判据是 `~= 0` 的标定参数（如 `RngPrdn_bFuRngEstimUseSwt_C`
    默认=1），参数非 0 时 Switch 选非 MPS 分支 → MPS 从不执行 → `decisioninfo [0 4]`，
    而 MPS 又**出现在覆盖分母**（110 含 MPS）→ 覆盖缺口看似"义务无效"实则"块没执行"。
    识别要点：① selector 用例仿真成功但该 MPS 的 `executionCount` 全 0；② 物理探针/
    cvt 逆向确认 selector 值确实到达（链直连根输入）；③ 查 MPS 输出端口直接下游的
    Switch 判据来源——若为标定参数 Constant 且判据 `~= 0`，即门控参数。处置：
    **selector 义务必须附带门控参数覆盖 `p Param=0`**（打开 MPS 链），证据
    `scenario_activation_mps_gate`。**已代码化（2026-08-21）**：`collect_decision_blocks.m`
    对 MPS 收集输出链下游 Switch 判据参数（`rec.gate_params`，含 DataPortIndices 收集），
    `build_decision_obligations.py` 把门控参数并入 selector 义务 `match.params`。
    这是"标定默认值钉死"模式（liuts B02/B03 Switch 判据门控）的 **MPS 变体**：B02/B03
    门控的是 Switch 判据本身，这里门控的是 **MPS 输出链**——修复轮遇到 MPS 全 0 覆盖时
    优先查输出链门控，而不是怀疑 selector 义务/探针。
6. **探针确认（可选但强烈建议）**：用 `probe_block_inputs.py` 或一次多场景 probe
   （充电/非充电各若干步）实测缺口块执行计数；执行计数 0 即坐实死路径。
7. **结果**：0 候选 + 1 具体 unresolved（`logic_unreachable`）是**合法且高质量**的 Stage 10
   收尾——不要为了凑候选硬造用例；宿主校验接受后按 partial 交付并列出证据。

**执行节奏**：每次 MATLAB 命令被 SIGTERM 后，孤儿进程会完成工作；`sleep 60-240` 等产物
（探针 JSON/日志出现 "Application shutdown complete"）再继续，不要立即重跑同一命令。

**修复提案格式与 apply 基线（B04 实测，2026-08-17）**：
- `direct_inputs` 必须是对象形式 `{"信号名": 值}`（不是数组）；`parameters` 必须是 dict；
  `controller.parameters` 必须与 `initial_params` 一致，否则宿主校验拒绝——每条候选的
  init 值必须逐候选给出，不能只写首候选；
- `run --stage 10 apply` 前确保 `.tcsd-runtime` 状态指向干净 iter0 基线：上一次 apply 会
  把状态推进到 iter1，直接重跑 apply 会在错误基线上叠加（用例翻倍/基线漂移）；必要时
  重置状态再 apply。

**候选有效性（B14/B09 实测，2026-08-17）**：
- **候选的比较值必须先核对模型实际常量**：B14 主链候选误用 `pctLvBatSoc=95`（Greater6 实际要求
  `≤70`）、`stSocPrcsn=3`（Greater7 要求 `==2`），导致 `bRemLvBatMntnReq` 整链未激活（探针
  2828 次观测中 AND 端口5 恒 0）。RelationalOperator 候选的常量必须从 IR/模型 XML 实际值核对，
  不能凭印象——一个错值会静默杀死整条激活链，且仿真通过（仿真只证明刺激被执行，不证明分支被覆盖）。
- **边沿/锁存候选的 init 必须保持翻转前状态（B09 教训，已修复）**：修复候选的
  `controller.direct_inputs` 存的是翻转**后**值（KeyOn=1），而 `stimulus.initial_inputs` 才是
  翻转前值（KeyOn=0）。合成器曾把 direct_inputs 写进工作簿 Initialization，导致边沿逻辑
  （KeyOn 恒 1、OTAOn 恒 0、KeyStrt 恒 1）全部失效（r_keyon_rise/r_otaon_fall/r_rsl75_c1）。
  **已修复**：`synthesize_tcsd_from_coverage_ir.py` 现在优先用 `stimulus.initial_inputs/
  initial_params` 作为 Initialization（direct_inputs 仅作基底）。提案作者仍应在 stimulus 里给出
  完整的翻转前 initial_inputs，不能只写 direct_inputs——有 stimulus 的候选翻转步骤才会进 Action。
- **大模型缺口优先打主激活链**：当模型很大（数百 Condition/上百 MC/DC）且覆盖率远低于门槛时，
  先找门控整条子系统的根条件链（如 `bRemLvBatMntnReq`），按链核对全部比较常量后集中刺激；
  主链未通时散点候选提升有限（B14 一轮 16 候选仅 +1~2pp，生效的 3 类全部驱动计数链）。
  剩余缺口按规则如实 partial 交付，不要试图超出 ≤1 轮限制。

---

## 11. 模式调用方式

### 11.1 直接交付形态（默认）

用户直接把文件放到某个目录（例如 `input/<任务名>/`）并告知路径，即可触发本模式：

```text
<input 目录>/
  <model>.slx                     # 必选
  <model>.mat                     # 必选
  <addon 文件集合…>               # 对应项目的附件（如 Cornex_Config.sldd、ITKLib.slx、
                                  #   init_Global.m、ITKCToolsV015/ 等，全部视为项目上下文）
  [模型初始化脚本]                 # 可选，未提供则依赖 addon 内自动发现的 init_Global.m 等
```

**输入目录含多个模型时**（实测 B04/B14 两例）：目录里常有同系列其他模型（RngPrdn 目录的
B01~B05/A04/A09、hvcoorn 目录的 B09/B15 等）。只处理用户指定的那一个：`dsh_stage_runner.py
init` 前先把目标 slx + 对应 mat 放进一个仅含这两个文件的临时目录作为 `--model-dir`
（init 会取目录里第一个 slx，直接传原目录会拿错模型），init 后把 task.json 的 `modelDir`
改回真实交付目录（finish 按它复制最终工作簿）。

Agent 收到后：把该目录视为“平台已复制的任务工作区”，直接按第 10 节本机独立形态逐阶段执行——
不再需要项目 id/上传流程；addon 集合里有什么就用什么，文件名、布局、数量按实际内容为准。

### 11.2 用户只需提供/指明

- `<model>.slx` 与 `<model>.mat`（及可选模型初始化脚本）；
- 项目（决定复制哪个 addon，例如 `01_楚能` / `02_TMS`）；
- 可选：覆盖门槛（默认 80）、是否要求生成中间产物。

标准触发语（示例）：“用单元测试用例生成模式，为 `A02.slx` 生成 TCSD 单元测试用例（项目 01_楚能）。”
直接交付形态下触发语更简单：“`<输入目录>` 里的模型，直接生成测试用例”。

Agent 收到后：

1. 先按第 2 节核对输入与环境，缺失即停止并报告（不发明用例）；
2. 按第 4 节逐阶段执行，每阶段通过第 7 节门禁后才前进；
3. 遵守第 5/6 节工作簿与覆盖规则；
4. 按第 8 节处理错误、按第 9 节验收交付；
5. 最终回复中给出：最终工作簿路径、首轮与最终三项覆盖率、修正轮次与结果、
   未解析/未覆盖项清单及原因、manifest 引用。

---

## 附录 A：关键文件索引

```text
skills/hermes/tcsd-stage-01..12-*/SKILL.md    # 十二个原子阶段技能
skills/hermes/tcsd-runtime/                   # 共享运行时（assets/scripts/references）
skills/hermes/tcsd-runtime/scripts/run_tcsd_pipeline_stage.py   # 确定性运行时入口
skills/hermes/tcsd-runtime/scripts/collect_decision_blocks.m     # 非逻辑块真实连接收集（S05）
skills/hermes/tcsd-runtime/scripts/build_decision_obligations.py # 非逻辑块 Decision 义务（S05）
skills/hermes/tcsd-runtime/scripts/probe_block_inputs.py         # 参数覆盖+块输入观测探针（S10 工具）
skills/hermes/tcsd-runtime/scripts/probe_block_inputs_with_params.m
skills/hermes/tcsd-runtime/scripts/dsh_stage_runner.py          # 宿主侧一键执行器（init/run/finish）
skills/hermes/tcsd-runtime/scripts/run_tcsd_quality_loop.py     # 质量环（合成/校验/仿真/回填/probe）
skills/hermes/tcsd-runtime/scripts/host_validate_tcsd_stage.py  # 宿主语义验证
skills/hermes/tcsd-runtime/references/tcsd-rules.md             # 工作簿规则全集
skills/hermes/tcsd-runtime/references/workflow-details.md       # 模型读取/仿真/回填细节
skills/hermes/tcsd-runtime/references/hermes-agent-handoff.md   # Agent 交接手册
skills/hermes/tcsd-runtime/references/coverage-ir-contract.md   # Coverage IR 契约
skills/hermes/tcsd-runtime/references/mcdc-feedback-repair.md   # Stage 10 修复协议
skills/hermes/tcsd-runtime/assets/templates/tcsd_template.xlsx  # 唯一合法模板
src/services/tcsd-pipeline-contract.js        # schema/阶段定义/宿主校验（validateStageResult）
src/services/tcsd-stage-catalog.js            # 技能 bundle hash/版本目录
src/services/tcsd-hermes-stage-executor.js    # 平台端逐阶段编排（manifest/prompt/checkpoint）
src/services/tcsd-host-semantic-validator.js  # 语义验证请求构造
src/services/unit-test-case-generation-service.js  # 任务创建/输入/产物注册
docs/tcsd-12-stage-production-deployment-handoff.md  # 生产部署交接
```

## 附录 B：关键 schema 清单

```text
tcsd-agent-stage-pipeline/v2        任务流水线协议
tcsd-agent-stage-input/v1           阶段输入 manifest
tcsd-agent-stage-result/v1          阶段结果
tcsd-agent-stage-checkpoint/v2      宿主 checkpoint
tcsd-input-manifest/v1              输入清单（S1）
tcsd-environment-gate/v2            环境门禁（S2）
tcsd-workspace-initialization/v1    工作区初始化（S3）
tcsd-owned-resources/v1             资源所有权（S3）
tcsd-model-interface/v1             模型接口（S4）
simulink-ut-logical-mcdc-mapping/v1         逻辑映射（S5）
simulink-ut-logical-mcdc-obligations/v1     覆盖义务（S5）
simulink-ut-tcsd-coverage-ir/v1             Coverage IR（S5/S10）
simulink-ut-state-probe-plan/v1     状态探针计划（S6）
tcsd-planning-mapping-assessment/v1 规划映射诊断（S7，非阻塞）
tcsd-coverage-report/v1             覆盖率报告（S9/S11）
tcsd-coverage-repair-brief/v1       修复简报（S10）
tcsd-agent-coverage-repair-proposal/v1      Agent 修复提案（S10）
tcsd-repair-candidate-validation/v1 候选验证（S10）
tcsd-host-semantic-validation/v1    宿主语义验证
tcsd-host-validation-report/v1      宿主验证报告
tcsd-cleanup-result/v1              清理证据（S12）
simulink-ut-tcsd-execution-manifest/v1     最终执行 manifest（宿主）
tcsd-stage-timeline/v1              阶段时间线（宿主）
tcsd-artifact-manifest/v1           产物清单（宿主）
```

## 附录 D：关键 schema 字段速查

```text
tcsd-agent-stage-input/v1（阶段输入指针，checkpoint.input）
  { schema, path, sha256 }              # path 指向 manifest.json，宿主按 sha256 校验
                                        # manifest.json = { schema, jobId, stageIndex, attempt, job }

tcsd-agent-stage-result/v1（阶段结果，checkpoint.result）
  { schema, jobId, stageIndex, status, summary, artifacts }
  artifacts[] = { path, kind, role, sha256 }     # role: evidence / output
  # Stage 10 结果追加 repair + evidence 字段

tcsd-agent-stage-checkpoint/v2（宿主 checkpoint，每阶段唯一产物）
  { schema, pipelineSchema, jobId, stageIndex, status, summary, attempt,
    skill: { name, version, bundleVersion, bundleHash, skillFileHash },
    runtime: { bundleVersion, bundleHash },
    agent, prompt, input, result,
    validation: { passed, reportPath, semantic }, toolLogs }

simulink-ut-tcsd-coverage-ir/v1（覆盖 IR，S5 产物 / S10 输入）
  { schema, model, items, summary }
  items[] = { id, model, coverage_class, block: { path, sid },
              required_outcome, ... }             # coverage_class: Condition/Decision/MCDC
  summary = { covered, required, unreachable, unresolved, unsupported }

simulink-ut-logical-mcdc-obligations/v1（逻辑义务，S5）
  { schema, model, summary, obligations, source }   # source 指向探针结果文件
  obligations[] = { id, model, block_path, sid, operator, coverage_class, required_outcome, ... }
  # status: required | unresolved | unreachable（代数蕴含证据，构建期静态判定）
  # unreachable 项带 reason（蕴含证明）+ evidence_state=unreachable_algebraic
  summary = { operator_count, obligation_count, required_count, unreachable_count, unresolved_count, ... }

tcsd-agent-coverage-repair-proposal/v1（Stage 10 修复提案）
  { schema, jobId, model, tests, unresolved }
  tests[] = { id, coverage_class, block: { path, sid }, required_outcome,
              controller, stimulus, analysis }
  # controller.direct_inputs 为对象 {信号:值}（非数组）；controller.parameters 为 dict
  # 且与 initial_params 一致；unresolved[] 必须带 reason_code（如 logic_unreachable）+ evidence

tcsd-host-semantic-validation/v1（宿主语义验证，挂在 checkpoint.validation.semantic）
  validation = { passed, reportPath, semantic }     # semantic.schema 必须等于本 schema

simulink-ut-tcsd-execution-manifest/v1（最终执行 manifest，宿主 finish 产物）
  { schema, authority, jobId, status, completion, workbook, coverage, evidence }
  coverage = { initial, final, repair_required, repair_attempted, repair_applied,
               repair_passes, repair_reason, repair_evidence }

tcsd-stage-timeline/v1 / tcsd-artifact-manifest/v1（宿主 finish 产物）
  timeline：阶段时间线；artifact：{ schema, authority, jobId, artifacts }
```

## 附录 C：常用环境变量

```text
MATLAB_ROOT / SATK_MATLAB_ROOT          MATLAB 安装根
SATK_MCP_SERVER / SATK_MCP_EXTENSION    非默认 SATK 位置
SATK_MCP_LOG_FOLDER                     短 ASCII 日志/socket 目录
SATK_MATLAB_SESSION_MODE                new（生产）/ existing（复用桌面）
SATK_MATLAB_DISPLAY_MODE                nodesktop（默认，无桌面）/ desktop（调试界面用）
TCSD_DEDICATED_WORKER                   无人值守 Worker 清理模式
TCSD_CLEAN_STALE_MCP                    仅清理陈旧 MCP
TCSD_PROJECT_INIT_SCRIPTS               显式模型初始化脚本列表
TCSD_PIPELINE_PYTHON                    运行时 Python
TCSD_STAGE_HERMES_MAX_TURNS / TCSD_STAGE_HERMES_TIMEOUT_MS   每阶段 200 turns / 60min
UNIT_TEST_CASE_EXPECTED_OUTPUT_PATTERN  outputs/*_tcsd.xlsx
```
