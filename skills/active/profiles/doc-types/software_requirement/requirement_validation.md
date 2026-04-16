# Requirement Validation Rules

## 校验目标

### DOC-software_requirement-validation_rule-001 文档风格校验
检查输出是否保持软件需求风格；若正文主要由实现步骤、状态机内部变量解释或测试操作说明构成，应判为风格偏移。


### DOC-software_requirement-validation_rule-002 主题粒度校验
检查每条需求是否只承载一个稳定主题；若把控制逻辑、记忆逻辑和保护逻辑混写在一条正文中，应标记为主题混写风险。

## 结构校验

### DOC-software_requirement-validation_rule-003 层级结构校验
检查父功能、子功能和需求条目的层级是否清晰；若样例明显存在父子结构而输出完全平铺且无归属提示，应标记为结构退化。


### DOC-software_requirement-validation_rule-004 对象对称性校验
对前后轴、充放电、请求与恢复等对称对象，若只生成一侧或只保留单条总纲需求，应标记为结构不完整。


### DOC-software_requirement-validation_rule-005 激活与恢复分支校验
对激活判断、模式进入、停止控制类需求，若缺少“否则”路径、恢复条件、重新进入条件或超时撤销条件，应标记为内容不完整。

## 内容校验

### DOC-software_requirement-validation_rule-006 优先级与默认路径校验
对仲裁、计算、功率限制类需求，若缺少优先级顺序、兜底分支或默认输出路径，应标记为高风险缺失。


### DOC-software_requirement-validation_rule-007 阈值与状态值校验
检查是否保留关键阈值、状态枚举、时间参数、边界包含关系和滞回条件；若只保留模糊表述，应降低置信度。


### DOC-software_requirement-validation_rule-008 命名与引用校验
检查信号命名、模式名和需求编号是否可追溯；若编造编号、误改信号名或把代码内部别名当成正式需求名，应标记为高风险。

## 输出风险

### DOC-software_requirement-validation_rule-009 可测试性校验
检查正文是否能够直接导出测试场景：输入条件、触发动作、输出行为和保护边界应可判定。


### DOC-software_requirement-validation_rule-010 无依据扩写校验
若当前证据只支持核心主题，而输出擅自扩写到新的模块主题、支撑逻辑或实现细节，应标记为越界扩写。
