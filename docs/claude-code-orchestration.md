# Codex 编排 Claude Code 工作流

本文档记录在本仓库中由 Codex 担任任务编排器、Claude Code 执行具体编码、再由 Codex 复核验收的协作方式。

## 当前本机状态

- VS Code 命令可用：`/opt/homebrew/bin/code`
- 已安装 VS Code 扩展：`anthropic.claude-code`
- 当前扩展版本目录：`/Users/guanzhengyang/.vscode/extensions/anthropic.claude-code-2.1.126-darwin-arm64`
- Claude Code 原生 CLI 路径：`/Users/guanzhengyang/.vscode/extensions/anthropic.claude-code-2.1.126-darwin-arm64/resources/native-binary/claude`
- 仓库内已有 Claude Code 本地权限文件：`.claude/settings.local.json`

验证结果：

- `claude --help` 可正常返回，说明原生二进制可被命令行调用。
- 直接执行 `claude --print "..."` 的 smoke test 在本次验证中超过 30 秒未返回，已终止测试进程；后续正式调度前应优先使用 VS Code 内已连接的 Claude Code 面板，或重新验证非交互模式是否能稳定返回。

## 角色分工

Codex 负责：

- 和用户讨论并确定本轮开发计划，把计划拆成可执行的 Claude Code 任务卡。
- 在需要时读取相关源码、测试和 `git status`，但不把 `task_plan.md`、`progress.md`、`findings.md` 作为每轮默认入口。
- 把需求拆成可交给 Claude Code 的小任务。
- 约束 Claude Code 的修改范围、禁止事项、验收标准和测试命令。
- 检查 Claude Code 的 diff、运行测试、做浏览器或接口验收。
- 在必要时直接修补小问题，并给出最终结论。

Claude Code 负责：

- 按 Codex 给出的单个任务 prompt 修改代码。
- 遵守指定文件范围，不主动重构无关模块。
- 完成后报告实际修改文件、测试结果、仍不确定的问题。

## 标准调度流程

1. Codex 先和用户确认本轮开发计划：
   - 目标是什么
   - 交付边界是什么
   - 哪些行为必须验收
   - 哪些文件或方向不能碰

2. Codex 按计划做最小必要现场盘点：
   - `git status --short --branch`
   - `git diff --stat`
   - 读取与本轮任务直接相关的源码、测试和文档。

3. Codex 写出本轮任务卡：
   - 背景和目标
   - 允许修改的文件范围
   - 不允许做的事
   - 预期行为
   - 必跑测试
   - 完成后需要汇报的内容

4. Codex 把任务卡交给 Claude Code：
   - 优先路径：VS Code Claude Code 面板，使用当前仓库上下文。
   - 可选路径：原生 CLI 非交互模式，待再次验证稳定后使用。

5. Claude Code 完成后，Codex 复核：
   - `git diff --check`
   - `npm test`
   - 针对改动范围运行额外检查，例如 `npm run check:wiki` 或浏览器走查。

6. Codex 做最终判断：
   - 通过：汇总修改和验证结果。
   - 未通过：指出具体失败点，再发下一轮修正任务或由 Codex 直接修补。

## Claude Code 任务卡模板

```text
你是本仓库的编码执行 worker。请只处理下面这个子任务，不要顺手重构无关代码。

仓库：
/Users/guanzhengyang/Documents/software-doc-generator-prototype

当前目标：
<一句话描述用户目标>

背景：
<Codex 已确认的真实上下文、相关页面/API/服务路径>

允许修改：
- <文件或目录 1>
- <文件或目录 2>

不要修改：
- <明确排除的文件或目录>
- 不要清理或回滚已有未提交改动，除非它们属于本任务且确有必要。

实现要求：
- <行为要求 1>
- <行为要求 2>
- 保持现有代码风格和数据结构约定。

验收命令：
- npm test
- <如有额外命令>

完成后请汇报：
- 实际修改的文件
- 核心实现思路
- 测试结果
- 仍需 Codex 或用户确认的风险点
```

## Codex 复核清单

- 是否只改了任务卡允许范围内的文件。
- 是否误改了用户已有未提交改动。
- 是否引入了新的运行态数据、临时文件或大文件。
- 是否覆盖了关键路径测试。
- UI 改动是否需要真实浏览器确认。
- Hermes / Replay / Skill 相关改动是否和现有计划文件中的当前架构一致。

## 当前建议

在这个仓库里，先采用“用户与 Codex 讨论计划 -> Codex 下发 Claude Code 任务卡 -> Claude Code 执行 -> Codex 复核验收”的方式。等非交互 `--print` 路径稳定后，再把 Claude Code CLI 纳入自动化调度。
