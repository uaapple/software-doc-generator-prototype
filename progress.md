# 进度日志

## 会话：2026-04-10

### 阶段：驳回反馈闭环实现与 LLM 回投接入
- **状态：** complete（代码闭环已打通，skill 文件结构迁移尚未开始）
- **执行的操作：**
  - 新增 `SkillRule` / `SkillRuleChangeLog` / `SkillBundleRuleIndex`，为规则级追踪和 proposal item 应用打底。
  - 新增 `RejectionService`，在 requirement 驳回时沉淀结构化 `RejectionRecord`。
  - 新增 `ReplayTaskService`，支持从驳回记录池构造 replay task、生成 proposal item，并将已接受项应用为 candidate bundle。
  - 扩展 `SkillBundleService`，让 candidate bundle 优先从规则级 proposal item 物化，而不是只做粗粒度文本 append。
  - 新增 `feedback-pool.html` / `feedback-pool.js`，提供驳回池浏览、分组、回投、逐条审核与应用界面。
  - 扩展首页驳回交互，`rejected` 审核时改为提交结构化原因，而不是只改 review status。
  - 扩展 `LlmService`，让 replay proposal 可复用现有 LLM Profile；创建 replay task 时可选择已配置模型，不选时走本地 fallback。
  - 修复 `RejectionService` 列表读取时误把 `groups.json` 当成记录文件的问题。
- **创建/修改的文件：**
  - `src/services/skill-rule-service.js`
  - `src/services/rejection-service.js`
  - `src/services/replay-task-service.js`
  - `src/services/project-service.js`
  - `src/services/skill-bundle-service.js`
  - `src/services/llm-service.js`
  - `src/app.js`
  - `src/config.js`
  - `src/services/storage.js`
  - `public/index.html`
  - `public/app.js`
  - `public/feedback-pool.html`
  - `public/feedback-pool.js`
  - `public/app.css`
  - `tests/run-tests.js`
- **验证结果：**
  - `node tests/run-tests.js` -> `All 8 tests passed.`
  - 新增覆盖：
    - requirement 驳回会创建反馈池记录
    - replay task 接受 proposal item 后可生成 candidate bundle
- **补充说明：**
  - 当前“规则级能力”已在系统层落地，但 `skills/active/*.md` 还没有正式迁移成显式编号的规则文档。
  - 因此当前生成需求时，仍然主要加载现有 markdown 形态的 active skill；只是系统已经具备后续按条写回和追踪的基础设施。

## 后续任务
- 把现有 active skill 文件迁移为 `### RW-001 标题` 这类显式编号结构，并让 markdown 成为人类可维护的规则视图。
- 建立 `SkillRule` 与 markdown 位置的稳定映射，避免靠宽松解析恢复规则边界。
- 在 UI 中展示当前生成所使用的 active bundle / skill 版本，减少“代码已支持但运行态未切换”的误判。
- 继续优化 replay proposal prompt，并补充失败重试和人工恢复流程。