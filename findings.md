# 发现与决策

## 需求
- 当前项目目标不是一次性生成正式 Polarion 成品，而是生成结构化、可审核的软件设计需求草稿。
- 对扭矩干预领域，输出需要贴近工程师人工样例的层级结构和拆分粒度。
- 输出不再需要带具体章节号，例如 `3.31.1`，但需要保留同样的层级关系。
- 文档需满足 ISO 26262 语境下的命名精度与追溯要求。
- 信号命名必须优先服从参考样例或信号字典，避免代码变量名替代标准工程命名。
- 严禁无依据泛化扩写，尤其是 `ABS/EBD/CCO/ISA` 这类未在目标样例中明确要求的逻辑。

## 研究发现
- 第一轮 Doubao 输出更像泛化软件需求列表，结构和粒度与人工样例差距大。
- 第二轮 skill 调优后，输出已经能稳定拆成前轴激活、前轴计算、后轴激活、后轴计算四个核心主题。
- 章节数字虽可被模型学习出来，但当前业务场景并不需要保留这些数字。
- 工程师审议指出，代码化命名和无依据扩写会直接破坏 ISO 26262 下的 Single Source of Truth。
- 现已将标准工程命名与代码别名映射写入 `domain-knowledge.json`，并在生成后处理、validation、benchmark 评分中生效。

## 技术决策
| 决策 | 理由 |
|------|------|
| 使用 `skills/active` 作为当前生效 skill，并同步到根目录和 `bundle-base` | 避免运行时与人工查看的规则不一致 |
| 在 `llm-service` 中对输出做领域知识归一化 | 降低模型偶发跑偏时的命名和扩写风险 |
| 在 `validation-service` 中新增 `code-style-signal`、`non-canonical-signal`、`unsupported-expansion` 冲突类型 | 让 ISO 26262 风险能被显式暴露 |
| 在 benchmark 写作质量评分中纳入命名与扩写风险惩罚 | 让 KPI 更贴近工程师真实审议口径 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 生成结果会把 `icesc_*` 等代码别名直接写进需求正文 | 引入标准工程命名映射并在生成后归一化 |
| 模型会擅自把主动制动扩写成 `AEB/CDP/ABS/EBD` | 在领域知识中加入 forbidden expansions，并在 validation 中按高风险标记 |
| planning-with-files 仓库不是单一 skill 根目录 | 先检查 `SKILL.md` 所在路径，再安装 `skills/planning-with-files-zh` |

## 资源
- `input/software-requirement-writing-rules-vcu.md`
- `input/system-requirements-example-torque-intervention.md`
- `input/software-design-requirements-example-esc-torque-intervention.md`
- `reports/doubao-vs-human-requirements-comparison.md`
- `reports/doubao-vs-human-requirements-comparison-round2.md`
- `skills/active/domain-knowledge.json`

## 视觉/浏览器发现
- `planning-with-files` 仓库中存在三个版本：`planning-with-files`、`planning-with-files-zh`、`planning-with-files-zht`
- 已安装简体中文版 skill：`~/.codex/skills/planning-with-files-zh`

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
