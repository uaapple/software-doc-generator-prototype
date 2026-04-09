# 发现与决策

## 当前目标理解
- 这个项目现在同时承担多条主线：
  - 保留软件需求生成的主业务能力。
  - 把首页和工作流完善成真正可用的内部工作台。
  - 持续完善 Skill Refinement / Benchmark / 人工审核闭环。
- 用户当前更关注“内部使用是否顺手”，因此页面要弱化介绍感、强调操作效率和布局秩序。
- 新增的 LLM 能力不是一次性接 OpenAI / 豆包，而是为后续接入 GLM、Minimax、Kimi 等模型打基础。
- 新提出的“驳回原因”需求，目标也不只是留痕，而是把人工驳回反馈沉淀成可再次投喂大模型、用于修正 skill 的训练物料。

## 前端相关发现
- 原始首页在视觉上更像展示页，和“内部工具”定位不一致。
- 用户对页面最敏感的问题依次是：
  - logo 显示不完整
  - 上传控件保留浏览器默认样式，显得突兀
  - 功能模块宽度不一致，破坏对齐感
- 将首页收缩为“顶部导航 + 工作台条 + 两行核心功能卡片”后，更符合后台工具预期。
- 第二排曾采用不等分布局，导致“生成需求”模块明显比“创建项目”窄，后已统一改为两列等宽。
- Skill Refinement 工作台已重做为与首页一致的内部系统风格，说明这套设计语言已经可以作为统一的产品基线继续扩展后续页面。

## LLM 接入相关发现
- 原有后端只支持单一 `config.openai` 配置，本质上是用 OpenAI SDK 兼容 Ark / Doubao。
- `.env.defaults` 中原本就带有豆包默认配置：
  - `OPENAI_MODEL=doubao-seed-2-0-pro-260215`
  - `OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`
- 因为 Ark / Doubao 与 OpenAI 接口兼容，当前首批 provider 可以共用 OpenAI SDK，只需区分 provider 元数据和默认 URL。
- 真正需要抽象的是“模型配置管理”，而不是调用 SDK 的代码路径。

## 驳回反馈闭环的新需求发现（2026-04-09）
- 当前“驳回”按钮只会把单条生成结果的审核状态保存为 `rejected`，并不会要求填写驳回原因，也不会进入更高层级的反馈闭环。
- 用户希望把“驳回”升级成结构化反馈入口，至少应包含：
  - 驳回时填写原因
  - 能统一查看所有被驳回的生成内容及对应驳回原因
  - 能按组将“生成结果 + 驳回原因”重新投入大模型，作为修正 skill 的物料
- 这说明系统后续需要新增一层“反馈物料池”概念，它和普通审核状态不同，目标是沉淀为可再次利用的改进素材。
- 从产品视角看，这个功能更接近“人类反馈驱动的 skill refinement 数据闭环”，而不是简单的审核备注。
- 从数据结构看，至少要补充这些字段或实体：
  - 驳回原因
  - 驳回分组/批次
  - 是否已被重新投喂
  - 投喂目标模型 / 投喂时间 / 投喂结果

## 本轮技术决策
| 决策 | 理由 |
|------|------|
| 新增 `src/services/llm-profile-service.js` | 将 provider、profile、默认模型管理集中化 |
| 在 `data/llm-profiles.json` 持久化模型配置 | 避免只靠环境变量，支持多模型并存 |
| provider 注册表首批只放 `openai` / `doubao` | 先把结构跑通，避免过度设计 |
| 默认从环境变量生成 seed profile | 保留历史豆包配置，不打断现有可用能力 |
| 若历史配置文件为空，也自动补回 seed profile | 提升初始化鲁棒性，避免“服务商下拉为空” |
| 前端启动时单独请求 `/api/llm-profiles` | 减少依赖聚合 meta，定位和修复更直接 |
| 驳回新需求按“反馈物料池”来设计 | 便于后续批量回投大模型、形成 skill 修正闭环 |

## 当前实现范围
- 前端：
  - 首页布局重构
  - logo 品牌接入
  - 上传控件样式统一
  - 生成模块新增“当前模型”选择与“增加模型”表单
  - Skill Refinement 工作台视觉重构
- 后端：
  - 模型配置查询、新增、默认切换接口
  - 生成链路支持按 profile 调用
  - 项目记录最近一次生成使用的模型
- 测试：
  - 新增模型配置持久化测试
  - 保留本地回退测试
  - 现有测试入口可通过 `node tests/run-tests.js` 验证

## 当前未完成事项
- 还没有“编辑模型 / 删除模型 / 测试连接”能力。
- 还没有针对 GLM / Minimax / Kimi 等 provider 的默认配置预置。
- 还缺少在实际运行页面中的人工联调确认，例如：
  - 服务商下拉是否按预期显示
  - 选择默认模型后是否能成功切换
  - 新增模型后是否会立即出现在当前模型列表中
- 还没有“驳回原因采集 + 驳回记录池 + 分组回投大模型”能力。

## 错误与经验
- Windows 环境下 `apply_patch` 在当前工作区失败，PowerShell 直接写文件是可靠兜底方案。
- `planning-with-files` 的 `session-catchup.py` 在本机因 `python` 命令缺失无法运行，后续如果要稳定使用该 skill，需确认 Python 可执行文件路径。
- “服务商为空”不是 provider 定义缺失，而是初始化与前端拉取链路的联调问题。
- PowerShell 的执行策略会拦截 `npm.ps1`，当前环境中更稳妥的测试方式是直接执行 `node tests/run-tests.js`，或后续统一一套不依赖脚本策略的开发命令。

## 关键文件
- `public/index.html`
- `public/app.css`
- `public/app.js`
- `public/skill-refinement.html`
- `public/skill-refinement.css`
- `public/skill-refinement.js`
- `src/services/llm-profile-service.js`
- `src/services/llm-service.js`
- `src/services/pipeline-service.js`
- `src/services/project-service.js`
- `src/app.js`
- `tests/run-tests.js`
