# Requirement Validation Rules

## 校验重点

### DOC-detail_design-validation_rule-001 详细设计基础字段校验
每条详细设计必须同时具备 `requirementText`、`sourceRefs`、`verificationHint` 和 `structuredContent`，任一缺失都应判为高风险。


### DOC-detail_design-validation_rule-002 实现展开充分性校验
若正文只有需求复述，没有实现分解、内部变量、分支承接、模式判断或限幅说明，应判为“过于像软件需求”。


### DOC-detail_design-validation_rule-003 结构化内容空壳校验
若 `structuredContent` 为空壳，或与正文中的主行为、分支和对象归属不一致，应判为高风险结构问题。


### DOC-detail_design-validation_rule-004 对象级设计点校验
若输出只写总述，没有落到对象级设计点、对称子项或默认路径，应判为结构不完整。


### DOC-detail_design-validation_rule-005 实现细节越位校验
若把代码局部实现直接抬升为新的功能主题，或脱离系统需求新增章节，应标记为越界扩写。


### DOC-detail_design-validation_rule-006 请求标志位完整性校验
若详细设计写了激活条件，但漏写锁存、清除、复位、默认路径或状态范围限制，应判为实现展开不足。
