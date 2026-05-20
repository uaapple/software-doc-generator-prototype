# 技能库重构为知识卡片体系的设计说明

## 背景判断

当前 `feat/slx-parser-integration` 分支中的主生成链路已经说明一个关键事实：软件需求正文质量的主要决定因素不是技能库规则数量，而是证据是否足够结构化、标题框架是否清楚、模型是否能按证据写。

现有 `content_generate` 的核心输入包括：

- 系统需求 / 项目上下文。
- `manualTitleOutline`，即人工输入的一二级标题框架。
- `modelRequirementView`，即来自 SLX、MATLAB MCP、SATK 的模型事实。
- 可选的 `recalledAtoms` / `skillBundle`。

代码上仍保留技能入口，例如：

- `src/services/pipeline-service.js` 会把 `modelRequirementView`、`requiredTitleOutline`、`recalledAtoms` 传给 Hermes。
- `src/services/hermes-agent-client.js` 要求 Hermes 优先使用 `modelRequirementView.facts`。

因此，当前观察到的现象是合理的：技能库不是主发动机，模型事实才是主发动机。

## 重构目标

下一步不应继续把技能库做成“用户能看懂的一堆规则”。更合适的方向是把它重构为一套给 AI 按需借用的文档经验记忆。

新的技能库应当：

- 不覆盖系统需求和模型事实。
- 不在生成时加载整套规则。
- 不要求用户手工维护庞大的规则墙。
- 支持持续投喂优质人工文档，并从中自动提炼可复用知识。
- 支持生成前按二级标题、模型事实、系统需求关键词召回少量高相关知识。
- 支持候选知识审核、benchmark 对比和发布控制。

## 三层架构

### 1. 事实层

事实层不能被技能库替代。

当前最核心的输入仍然是：

```text
系统需求 + MATLAB MCP 模型事实 + 人工标题框架
```

这一层决定“写什么”。技能库只能补充表达、术语、风格和少量行业约定，不能覆盖或改写事实来源。

生成时应保持以下原则：

- 系统需求和 `modelRequirementView.facts` 是事实来源。
- 人工标题框架是输出顺序和数量约束。
- 知识库只提供表达和规范提示。
- 知识库内容不能被当作事实证据引用。

### 2. 知识卡片层

新的技能库应从“大段规则文件”转为“小型、可检索、可合并、可追溯的知识卡片”。

术语 / 信号别名卡片示例：

```json
{
  "type": "term_alias",
  "scope": {
    "documentType": "software_requirement",
    "domain": "embedded_vcu",
    "module": "低压能量管理"
  },
  "trigger": ["DCDC_Sts", "LvBattVolt"],
  "content": {
    "signal": "DCDC_Sts",
    "zhName": "DCDC 工作状态",
    "preferredExpression": "DCDC 处于使能状态"
  },
  "evidence": ["人工范例-低压能量管理-第3.2节"],
  "confidence": 0.92
}
```

写作模式卡片示例：

```json
{
  "type": "writing_pattern",
  "trigger": ["退出条件", "计时器", "模式切换"],
  "content": "退出判断应按触发条件、持续时间、恢复条件、输出动作分别描述。",
  "examples": ["当...持续...后，软件应..."],
  "antiPatterns": ["不要只写“满足条件后退出”，必须展开条件来源。"]
}
```

### 3. 自学习层

用户希望的“喂十篇二十篇优质文档，系统自己掌握一些东西”，应实现为候选知识卡片生成闭环，而不是直接改 prompt 或直接污染 active 知识库。

```mermaid
flowchart LR
  A["人工优质文档"] --> B["解析章节/条款/术语/信号"]
  B --> C["提炼候选知识卡片"]
  C --> D["聚类合并: 去重/归纳/提升置信度"]
  D --> E["candidate knowledge base"]
  E --> F["benchmark 对比当前生成"]
  F --> G["人工审核或自动低风险发布"]
  G --> H["active knowledge base"]
```

这里的“学习”不是直接改正文生成链路，而是生成候选知识卡片。它比旧 skill 体系更轻，也更适合长期生长。

## 知识卡片类型

| 类型 | 作用 | 是否强约束 |
| --- | --- | --- |
| 术语 / 信号别名库 | 信号名转中文名、枚举值解释、缩写解释 | 中等强约束 |
| 写作模式库 | 某类逻辑怎么写，例如进入、退出、保持、恢复 | 软约束 |
| 优质范例片段库 | 生成时找相似标题 / 相似逻辑参考表达 | 软约束 |
| 反例 / 禁用表达库 | 避免空泛、臆造、漏引用、标题重复 | 强约束 |

## 生成时的使用方式

生成时不再加载整个技能库，而是在每个二级标题生成前做一次召回。

查询输入：

```text
二级标题 + 相关 modelRequirementView facts + 系统需求关键词
```

召回结果示例：

```text
- 3 条术语卡片
- 2 条写作模式
- 1 个相似人工范例片段
- 1 条禁用表达
```

注入 Hermes 时应附带明确边界：

```text
这些知识只用于表达和规范，不得作为事实来源；
事实来源只能来自系统需求和 modelRequirementView.facts。
```

这样可以保持当前主链路的事实可靠性，又能让知识库提供增量价值。

## 检索策略

这里的“检索”应采用混合检索，而不是只靠 AI，也不是纯规则。

推荐链路：

```text
二级标题 + 模型事实 + 系统需求关键词
  -> 结构化过滤
  -> 信号/术语精确匹配
  -> BM25/全文检索
  -> embedding 语义检索
  -> 合并去重
  -> 可选 LLM rerank
  -> 注入少量知识卡片给 Hermes
```

固有知识用规则查，经验表达用语义找，最终只把少量高相关内容交给 AI。

### 规则 / 结构化检索

用于硬过滤：

- 文档类型：`software_requirement`
- 领域：`embedded_vcu`
- 模块：`低压能量管理`
- 二级标题：`退出条件`、`补电控制`
- 信号名：`DCDC_Sts`、`LvBattVolt`

### 精确知识查表

用于不能让 AI 猜的固有知识：

```text
DCDC_Sts -> DCDC 工作状态
LvBattVolt -> 低压蓄电池电压
```

### 语义检索

用于写作风格、相似范例和表达模式。

例如当前二级标题是“退出条件”，模型事实里包含“电压恢复、计时器、状态复位”，则可以用 embedding / 向量检索找到以前人工文档里类似的条款表达。

### 小范围重排

后端先召回一批候选卡片，再用轻量 rerank 或 LLM rerank 选择最相关的少量卡片。不要让 Hermes Agent 自己在整个知识库中自由翻找。

## LightRAG 与 DSPy 的位置

### LightRAG

LightRAG 可以后上。

当术语、信号、模块、条件、章节之间的关系越来越多，普通 SQLite + embedding 检索不够用时，再引入图谱检索。

它适合解决：

- 信号、术语、模块之间存在复杂关系。
- 某条写作规则需要通过多跳关系召回。
- 知识卡片之间需要关系图谱和增量更新。

### DSPy

DSPy 不应先进入主生成链路。

它更适合优化：

- 怎么从人工文档提炼知识卡片。
- 怎么选择最有用的范例。
- 怎么根据 benchmark 反馈优化提炼器和选择器。

DSPy 的产物不应是最终软件需求正文，而应是内部优化后的：

```text
optimized_card_extractor
optimized_example_selector
```

也就是说，DSPy 优化的是知识库的生产和选择过程，不是每次正文生成的写作过程。

## 推荐实施路线

1. 保留当前 Hermes + MATLAB MCP + 人工标题框架主生成链路。
2. 弱化旧 skill bundle，不再把它作为生成核心。
3. 新建 `knowledge cards` 体系，先支持术语、写作模式、好例子、反例。
4. 生成每个二级标题前，只检索少量相关卡片注入 prompt。
5. 建立 benchmark：同一套输入，对比“无知识库”和“有知识库”的差异。
6. 确认有效后，再做自动学习：上传人工文档，自动提炼候选卡片。
7. 等候选卡片变多后，再考虑 LightRAG。
8. 等 benchmark 样本足够后，再考虑 DSPy 优化提炼器。

## 设计原则

- 事实主线仍来自系统需求和 MATLAB/MCP 模型证据。
- 技能库只补充术语、表达模式、优秀范例和禁用表达。
- 任何自动学习结果先进入 candidate knowledge base。
- 候选知识发布前应经过 benchmark 或人工审核。
- 每次生成只注入少量高相关知识，避免重新形成规则墙。
- 知识库召回内容不得作为事实证据引用。

## 部署拆分

- `linux-prod`：新知识卡片存储、检索 API、生成前召回逻辑、benchmark 对比逻辑。
- `windows-prod`：MATLAB MCP / SLX 模型证据链路保持主导，不应被知识库重构打断。
- `shared`：knowledge card schema、检索结果注入协议、benchmark 指标定义。
- `dev-only`：自动提炼实验脚本、DSPy/LightRAG PoC、临时评估报告。
- `runtime/local`：上传的人工样例原文、生成任务输出、未审核候选知识库、LightRAG 索引文件。
