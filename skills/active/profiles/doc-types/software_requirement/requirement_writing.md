# Requirement Writing Rules

## 写作定位

### DOC-software_requirement-writing_rule-001 软件需求输出定位
输出应采用软件需求条目风格，重点描述触发条件、输出行为、约束和引用关系，不要写成详细设计实现说明、HIL 操作步骤或自然语言摘要。


### DOC-software_requirement-writing_rule-002 人工样例对齐优先
当输入同时包含人工软件需求样例、系统需求和代码证据时，优先对齐人工样例已经稳定下来的主题边界、主题顺序和句式，再用其余证据补齐缺失条件。


### DOC-software_requirement-writing_rule-003 单条需求单主题
每条软件需求优先只承载一个稳定控制主题，例如激活判断、主控制逻辑、记忆逻辑、保护逻辑应分别成条，不要混写成综合描述。

## 结构组织

### DOC-software_requirement-writing_rule-004 父子章节保留
文档应保留父功能与子功能的层级关系；若输出 schema 只能平铺列表，也要在标题中保留“父功能 - 子主题”的归属关系。


### DOC-software_requirement-writing_rule-005 对象对称拆分
对前轴/后轴、充电/放电、请求建立/退出恢复等物理对象或流程状态对称的需求，应拆为独立条目，保持结构对称。


### DOC-software_requirement-writing_rule-006 流程阶段拆条
对同一功能中的进入请求、主控制、停止条件、恢复条件、记忆逻辑、保护限幅等不同阶段，优先拆成多条需求，而不是写成一段步骤说明。

## 句式与逻辑

### DOC-software_requirement-writing_rule-007 激活判断标准句式
激活或判断类需求优先采用“当满足以下任一条件时…，否则…”的句式；条件分点列出，并显式写清与/或关系。


### DOC-software_requirement-writing_rule-008 优先级显式声明
多源请求仲裁、多功能冲突或多模式切换时，应直接写出“优先级顺序为：X > Y > Z”，不得把优先级隐藏在叙述性文字里。


### DOC-software_requirement-writing_rule-009 分支与默认路径完整
计算、控制或状态切换类需求应使用“当…时，输出/动作=…”的句式覆盖主要分支、默认路径和退出/恢复路径。


### DOC-software_requirement-writing_rule-010 阈值状态值显式化
涉及阈值、枚举值、状态位、定时器或滞回条件时，应显式写出比较方向、边界包含关系、超时值和状态编码，不要只写“满足条件后”。

## 追溯与验证

### DOC-software_requirement-writing_rule-011 信号命名与内部引用保留
正文中应优先保留工程中可追溯的输入输出信号名、模式名、内部变量名和需求编号引用，避免改写成无法回溯的自然语言概念。


### DOC-software_requirement-writing_rule-012 可测试与安全边界并存
每条需求都应让测试人员能从输入条件推导出可判定的输出预期；若存在最大/最小限制、超时撤销或故障降级，也应显式写出。
