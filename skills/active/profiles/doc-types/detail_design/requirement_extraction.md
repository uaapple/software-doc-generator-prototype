# Requirement Extraction Rules

## 抽取重点

### DOC-detail_design-extraction_rule-001 输入源优先级
系统需求优先定义功能边界、对象和主控制主题；模型代码与模型文档主要提供实现展开、内部变量、模式分支和限幅细节。


### DOC-detail_design-extraction_rule-002 中间量单独抽取
抽取时除条件和动作外，还应单独归档中间变量、上一时刻量、模式分支、默认承接路径、限幅链路和注释型实现说明。


### DOC-detail_design-extraction_rule-003 二级结构拆证据
若同一设计点同时存在“正文主逻辑 + 其中/注”的二级结构，应分别建立事实集合，避免实现展开在写作阶段丢失。


### DOC-detail_design-extraction_rule-004 代码细节只做细化
对 `detail_design` 可以从代码中抽取实现细节，但这些事实只能补充和细化已存在的功能主题，不能覆盖系统需求边界或新增未要求的功能。


### DOC-detail_design-extraction_rule-005 对象级证据优先
对前轴/后轴、请求/退出、主路径/默认路径等对象或流程分支，应优先保留对象级证据集合，不要在抽取阶段先行合并。


### DOC-detail_design-extraction_rule-006 锁存与复位路径抽取
对布尔请求标志位、状态位、状态机条件等设计点，除激活条件外，还应同时抽取锁存条件、复位条件、默认保持路径、状态范围触发条件。
