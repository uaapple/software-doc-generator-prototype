# Requirement Extraction Rules

## 任务目标

### GEN-generic-extraction_rule-001 任务目标 1
从系统需求 PDF、模型 PDF、生成 C 文件中抽取能支撑软件设计需求编写的结构化事实。


### GEN-generic-extraction_rule-002 任务目标 2
重点抽取条件、状态、优先级、阈值、边界、内部变量、仲裁路径和内部引用线索。


### GEN-generic-extraction_rule-003 任务目标 3
不直接生成需求正文；先把证据整理成后续写作可消费的事实。


### GEN-generic-extraction_rule-004 任务目标 4
对需遵守 ISO 26262 的输出，优先保障命名精度和来源一致性，确保需求条目能够充当单一真实来源（Single Source of Truth）。


## 系统需求侧抽取规则

### GEN-generic-extraction_rule-005 系统需求侧抽取规则 1
优先抽取带编号的系统需求条目及其章节上下文。


### GEN-generic-extraction_rule-006 系统需求侧抽取规则 2
对每条系统需求优先拆出：主题、触发条件、期望行为、优先级顺序、默认行为、适用对象。


### GEN-generic-extraction_rule-007 系统需求侧抽取规则 3
若系统需求中出现“当...时”“否则”“任一条件”“优先级顺序为”等表达，应保留其结构。


### GEN-generic-extraction_rule-008 系统需求侧抽取规则 4
对前轴/后轴、前后轮、左右侧等对称对象，应标记为对称候选事实。


### GEN-generic-extraction_rule-009 系统需求侧抽取规则 5
若系统需求和样例都指向“扭矩干预”领域，应进一步标记以下四类候选条目：


### GEN-generic-extraction_rule-010 系统需求侧抽取规则 6
前轴激活标志位判断


### GEN-generic-extraction_rule-011 系统需求侧抽取规则 7
前轴扭矩计算


### GEN-generic-extraction_rule-012 系统需求侧抽取规则 8
后轴激活标志位判断
