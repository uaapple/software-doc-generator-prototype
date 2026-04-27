# Requirement Writing Rules

## 写作定位

### DOC-detail_design-writing_rule-001 详细设计输出定位
详细设计输出应描述“软件内部实现分解”，不是仅复述系统需求，也不是把源码变量逐句翻译成说明文字。


### DOC-detail_design-writing_rule-002 实现展开要素
每条详细设计除主行为外，还应尽量写出内部变量、中间量、模式分支、承接路径或限幅关系，形成可审核的实现展开。


### DOC-detail_design-writing_rule-003 允许实现性句式
正文允许使用“其中”“注”“计算方法为”等实现展开句式，以承载计算方法、上一时刻量、模式判断和边界限制。


## 结构组织

### DOC-detail_design-writing_rule-004 层级保留但不强制编号
标题层级仍应保留“父功能 -> 子功能 -> 设计点”的结构，但除非用户明确要求，不强制复现原始章节号。


### DOC-detail_design-writing_rule-005 结构化内容一致性
每条详细设计的 `structuredContent` 应与正文语义一致，至少能映射出可审阅的 `designBreakdown`。


## 写作定位

### DOC-detail_design-writing_rule-006 详细设计优先内部量
与软件需求相比，详细设计可以更显式写出内部量计算方法、上一时刻量、模式枚举和限幅路径，但不得脱离系统需求边界创造新功能主题。
