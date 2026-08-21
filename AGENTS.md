# 全局协作约定

- 以后由 Codex 生成的 Git commit message 默认使用中文，除非用户明确要求使用其他语言。

<!-- core-principles:start -->
## 核心原则

1. Choose the simplest implementation that fully satisfies the current requirements. Avoid unnecessary abstraction, configuration, indirection, or speculative extensibility.
2. Make the smallest necessary change that fixes the root cause. Do not refactor unrelated modules or change strategy semantics unless explicitly requested.
3. Grow the system in layers. Start from the smallest working end-to-end version and add new capabilities incrementally. Never replace a working system with unfinished complexity.
<!-- core-principles:end -->

<!-- dsh-analysis-sync:start -->
# 本分支定位与同步机制（dsh/tcsd-pipeline-analysis）

## 分支定位

`dsh/tcsd-pipeline-analysis` 是**经验累积分支**：复现生产环境效果不理想的模型、分析根因、沉淀经验，并把有价值的改进同步回生产。本分支上运行的 DSH 会话（单元测试用例生成模式）必须与生产集成分支 `codex/dsh-worker-production-integration` 上实际跑生成任务的 headless DSH 会话**行为一致**——同一套 12 阶段技能、同一套 tcsd-runtime 脚本、同一套执行纪律，仅额外注入本分支的经验知识。

## 代码分层

按"运行时代码"与"经验内容"分层，两条同步方向不同：

| 层 | 内容 | 权威来源 | 同步方向 |
|---|---|---|---|
| **运行时** | `skills/hermes/`（12 阶段技能 SKILL.md、`tcsd-runtime/scripts/`、`simulink-ut-tcsd-generator/`、`software-detail-*`） | 集成分支 `codex/dsh-worker-production-integration` | **集成分支 → 本分支**（单向覆盖，保证行为一致） |
| **经验文档** | `docs/unit-test-case-generation-mode.md`（场景激活矩阵、10.2 速查、实测教训等） | 本分支 | **本分支 → 集成分支**（cherry-pick/复制同步） |
| **经验代码** | 因实测教训而修改的运行时脚本（如 `build_decision_obligations.py` 的场景矩阵代码化、`probe_logical_mcdc_vectors.m` 的探针容错、`dsh_stage_runner.py` 的 unresolved 回退） | 本分支（以实测为依据的修改） | **本分支 → 集成分支**（cherry-pick/复制同步） |

## 如何判定一次改动属于哪一层

- **运行时改动**：修复 bug、适配新环境（gateway 凭据、实时事件、工具链升级）、新增功能——不属于任何实测教训。这类改动在集成分支做，然后同步到本分支的 `skills/hermes/`。
- **经验沉淀**：来自某个模型实测的教训、场景、模式（提交主题通常带模型名/用例名，如 `B04`、`ParkCrl`、`EngStrtStop`、`场景矩阵`、`教训`、`实证`）。经验沉淀**不限文档**：可以只改 `docs/unit-test-case-generation-mode.md`，也可能**修改运行时脚本**（把经验固化成代码，如场景矩阵代码化、探针容错、义务构建改进）。判断标准是**改动动机**：是否为某个实测案例的沉淀——是则属于经验层，应在**本分支**完成并同步回集成分支。

## 同步纪律

1. **运行时同步（集成分支 → 本分支）**：集成分支每次对 `skills/hermes/` 有改动（功能/修复/工具链），必须同步到本分支：
   ```bash
   git checkout codex/dsh-worker-production-integration -- skills/hermes/
   git commit -m "dsh: 运行时对齐集成分支 <commit>——<概要>"
   ```
   提交后验证 `git diff <integration-tip> HEAD --stat -- skills/hermes/` 为空。
2. **经验同步（本分支 → 集成分支）**：本分支每次经验沉淀（文档或脚本），在集成分支 worktree 里 cherry-pick 或复制同步：
   ```bash
   # 在集成分支 worktree 中
   git cherry-pick <analysis-commit>   # 或按文件复制后提交
   git commit -m "fix/feat: <同主题>（同步自 dsh/tcsd-pipeline-analysis <commit>）"
   ```
   脚本类经验沉淀同步后，必须跑对应回归测试（`tests/tcsd-runtime/`）确认集成分支行为不变差。
3. **禁止反向污染**：本分支不独立开发与经验无关的功能改动（那属于集成分支）；集成分支不直接修改经验文档/经验代码而不经本分支沉淀。
4. **对齐验证**：本分支会话开始前，如怀疑不一致，运行
   `git diff <集成分支最新> HEAD --stat -- skills/hermes/` 检查运行时是否滞后；有滞后先执行第 1 条。
<!-- dsh-analysis-sync:end -->
