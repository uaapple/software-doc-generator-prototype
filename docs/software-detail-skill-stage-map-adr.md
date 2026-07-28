# 软件详设原技能九阶段完整映射 ADR

- 状态：第 0 轮 A，技能条款映射基线
- 日期：2026-07-29
- 机器清单：`docs/software-detail-skill-stage-map.json`
- 业务源提交：`ce5d3c2c08788fa8ab9013f18bd985f7355df0b6`
- 业务源分支：`origin/release/windows-prod`
- 业务源目录：`skills/hermes/simulink-module-description-generator`

## 决策范围

本轮只把现有 `simulink-module-description-generator` 的业务要求完整映射到已确认的九阶段，不创建实际 stage skill、不修改服务、Worker、MATLAB Gateway、addon、runtime 或部署配置。

映射遵守以下约束：

1. `SKILL.md` 的 24 条 Default behavior、21 项 Workflow、13 条 Output Rules 保留原文，共 58 条。
2. 每条规则分配稳定 ID，并归为 shared rule 或一个/多个确定阶段。多阶段分配只表示原步骤在阶段边界处拆分或连续使用，不改变原意。
3. 五份 reference、五个 script 和一个 DOCX 模板都登记源 blob、内容 SHA-256、唯一 owner stage 和全部 use stages。
4. 每个阶段预留一个与 stage ID 同名的唯一 skill；每个 stage/attempt 创建新 Hermes session。
5. 每个 job 只建立一个 task-owned MATLAB session：Stage 1 建立、初始化并加载模型，Stage 2 至 Stage 8 复用，Stage 9 清理。不同 job 不共享 MATLAB session。

源 `SKILL.md` 的 Git blob 为 `8e99cda6da9b54153b73476f884b463ebe8b1bc4`，文件内容 SHA-256 为 `f9b9fb108ad5bee97597f9dc01a59cf37a6f85f0afd619b21b78df291f8d1dae`。机器清单还记录三个规则集合从固定源提取后的文本摘要；覆盖测试重新计算清单原文摘要，防止映射时改写或漏项。

`agents/openai.yaml` 是技能发现元数据，不包含 Default、Workflow 或 Output 业务条款，也不是 reference/script/template；它不参与本轮业务规则分配。除此之外，源技能的 `SKILL.md` 与十一项受控资源均已登记。

## 九阶段与唯一 skill

| order | stage ID / skill name | 原技能职责映射 |
| ---: | --- | --- |
| 100 | `software-detail-stage-01-initialize` | 定位输入与任务目录；使用 workspace addon/init；建立唯一 task-owned MATLAB session；初始化并只加载一次模型 |
| 200 | `software-detail-stage-02-model-plan` | 轻量 model scan；确定 document/analysis units、父子关系、边界 allowlist 和 analysis queue |
| 300 | `software-detail-stage-03-evidence-extract` | 按 analysis unit 深读端口、结构、参数、lookup、delay、state 和 output-near logic，持久化 evidence shards |
| 400 | `software-detail-stage-04-output-ledger` | 按 document unit 聚合 shards，从 direct outputs 反向追踪，形成 output-first private ledger 与 coverage |
| 500 | `software-detail-stage-05-boundary-projection` | 把内部事实投影到 direct boundary I/O，形成 behavior groups 和 narrative compression plan |
| 600 | `software-detail-stage-06-architecture-draft` | 生成模型功能、总体结构、架构和接口草稿 |
| 700 | `software-detail-stage-07-module-draft` | 每个 document unit 生成 `功能描述`/`实现方式`，`设计依据`正文默认留空 |
| 800 | `software-detail-stage-08-content-check` | 执行并修正 hierarchy、boundary、density、output coverage、内部标识符和 writing checks |
| 900 | `software-detail-stage-09-docx-finalize` | 填充原 DOCX 模板、生成 native Word lists、复验最终文本/边界/coverage/evidence，并清理 task MATLAB |

Stage ID 与 skill name 完全相同。这样后续安装、snapshot 和执行证据可以使用一个稳定键；本 ADR 不创建这些 skill 的文件。

## 条款编号与分配

| 原章节 | ID 范围 | 数量 | 分配规则 |
| --- | --- | ---: | --- |
| Default behavior | `SDD-DEF-001` 至 `SDD-DEF-024` | 24 | 全局不变量标为 shared；具体采集、边界、写作或 DOCX 规则分配到负责阶段 |
| Workflow | `SDD-WF-001` 至 `SDD-WF-021` | 21 | 保留原步骤顺序；跨边界步骤允许映射到相邻多个阶段 |
| Output Rules | `SDD-OUT-001` 至 `SDD-OUT-013` | 13 | 语言/不推断等全局规则标为 shared；采集、模块写作和最终检查规则分配到相应阶段 |

58 个 ID 全局唯一，没有 `unmapped`。Shared 规则共 10 条。九条规则跨多个阶段，原因均来自原条款本身的连续职责：

- `SDD-DEF-006` 同时规定 index、逐 subsystem 深读和逐模块 drafting，因此覆盖 Stage 2、3、7。
- `SDD-DEF-007` 同时定义 analysis plan、bounded deep-read 和 parent ledger 聚合，因此覆盖 Stage 2、3、4。
- `SDD-WF-006` 的前半建立 analysis queue，后半逐项处理并持久化 shard，因此覆盖 Stage 2、3。
- `SDD-WF-012`、`SDD-WF-013` 同时涉及模型级架构草稿和模块级草稿，因此覆盖 Stage 6、7。
- evidence/narrative 分离、boundary projection、output-near logic 和最终去除元数据等规则按其原文覆盖采集、投影、写作或终检的多个阶段。

机器清单保存每条完整英文原文，是逐条审查的权威载体；ADR 只说明边界，不替代原文。

## Reference、script 与模板归属

| 资源 | owner stage | use stages |
| --- | --- | --- |
| `references/model-evidence.md` | Stage 3 | Stage 1、2、3、4、8 |
| `references/module-boundary.md` | Stage 2 | Stage 2、4、5、7、8 |
| `references/a07-granularity-pattern.md` | Stage 7 | Stage 7、8、9 |
| `references/writing-rules.md` | Stage 8 | Stage 7、8、9 |
| `references/template-filling.md` | Stage 9 | Stage 6、7、8、9 |
| `scripts/setup_module_doc_support.m` | Stage 1 | Stage 1 |
| `scripts/satk_eval.py` | Stage 3 | Stage 1、2、3 |
| `scripts/collect_module_doc_evidence.m` | Stage 3 | Stage 2、3 |
| `scripts/validate_narrative_boundary.py` | Stage 8 | Stage 8、9 |
| `scripts/docx_list_format.py` | Stage 9 | Stage 9 |
| `assets/templates/Template_Software_Detailed_Design.docx` | Stage 9 | Stage 9 |

Owner 表示未来负责把资源收入该 stage skill snapshot 的唯一阶段；use stages 表示读取或执行该资源约束的阶段。映射不复制资源，也不改变其内容。

## 会话语义

MATLAB 与 Hermes 的生命周期互相独立：

- MATLAB：Stage 1 建立一个 job-owned session，完成 workspace addon/init、支持脚本和 `load_system`；Stage 2 至 Stage 8 使用同一 session；Stage 9 只清理此任务打开的模型和路径。不得按 module、analysis unit 或 stage 重启 MATLAB，也不得让并发 job 共享该 session。
- Hermes：Stage 1 至 Stage 9 的每个 stage/attempt 都创建新 session；不得跨 stage 或复用失败 attempt 的 session。新的 Hermes session 通过 stage artifact 与同一个 MATLAB session 协作，并不意味着重启 MATLAB。

这同时保留了原技能“一个任务复用一个 MATLAB process/session”的性能与所有权规则，并满足多阶段独立、可观测的 Hermes 会话边界。

## 覆盖门禁

`tests/software-detail-skill-stage-map-tests.mjs` 独立验证：

- 固定源 commit、SKILL blob/SHA-256 和三个规则集合文本摘要；
- 24/21/13 的原始数量、连续 ordinal、稳定 ID 和全局唯一性；
- 所有非 shared 条款至少映射一个已确认 stage，没有未知 stage 或 unmapped；
- 九阶段顺序、ID、唯一同名 skill 和每阶段新 Hermes session；
- 五份 reference、五个 script、一个 template 的集合完全相等，且每项 owner/use stage 有效；
- MATLAB 从 Stage 1 建立、九阶段复用、Stage 9 清理且不同 job 不共享。

## 部署边界

本轮只有 shared 文档/机器清单和 dev-only 覆盖测试。没有添加真实 Hermes skill、MATLAB script、template、服务或发布内容，因此不改变 Platform/Worker image revision，也无需修改 deploy target 或 deployment handoff。
