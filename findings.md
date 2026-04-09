# 发现与决策

## 驳回池闭环实现后的新增发现（2026-04-10）
- 现在 requirement review 已不只是写入 `accepted/revised/rejected` 状态；`rejected` 会强制补充结构化原因，并落一条 `RejectionRecord`。
- 反馈池、ReplayTask、proposal item、candidate bundle 这条链路已经连通，因此“驳回 -> 回投 -> 审核 -> 应用”在系统层是可执行的。
- Skill 的“规则级抽象”已经在后端建立起来：系统内部知道每条 rule，也能按条应用 proposal item。
- 但现有 active skill markdown 还没有正式迁移为显式编号的规则文档，所以当前状态是“系统知道每条 rule”，而不是“人看到的 skill 文件已经天然按条组织好”。
- 这意味着下一步的重点不再只是补接口，而是把 `skills/active/*.md` 真正升级为规则化文档，并让 `ruleId` 成为稳定的维护锚点。
- 双轨方案仍然成立：短期内以 `SkillRule` 注册表作为系统真源，markdown 逐步编号化；但如果不尽快完成 markdown 侧迁移，后续人工维护体验会长期停留在过渡态。
- replay proposal 已接入现有 LLM Profile，因此无需再单独发明一套“回投模型配置”；直接复用现有模型服务选择即可。
- 当前 replay proposal 的 prompt 仍偏通用，后续需要更明确地把目标 rule、相关 evidence、bad examples、domain knowledge 一并送入，以提高 proposal 的针对性。
- 当前运行态里 active bundle 仍是 `bundle-base`，尚未看到新的 candidate bundle 被正式批准为 active；所以现阶段生成需求依旧使用旧形态的 active skill。