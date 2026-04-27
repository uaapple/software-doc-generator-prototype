# Requirement Validation Rules

## 校验目标

### GEN-generic-validation_rule-001 校验目标 1
检查每条需求是否有正文、来源、验证建议和置信度。


### GEN-generic-validation_rule-002 校验目标 2
检查需求是否遵循目标样例的章节层级和对称展开方式。


### GEN-generic-validation_rule-003 校验目标 3
检查是否保留了关键信号、内部变量、优先级、边界说明和内部引用。


### GEN-generic-validation_rule-004 校验目标 4
检查是否存在重复、模糊措辞、臆造事实和明显冲突。


### GEN-generic-validation_rule-005 校验目标 5
对需满足 ISO 26262 的文档，检查信号命名是否来自参考样例或信号字典，避免破坏单一真实来源。


## 结构校验

### GEN-generic-validation_rule-006 结构校验 1
若输出应为章节化设计需求，需校验章节层级是否合理。


### GEN-generic-validation_rule-007 结构校验 2
对前轴/后轴等对称对象，若只生成单侧需求，应标记为结构缺失风险。


### GEN-generic-validation_rule-008 结构校验 3
若需求主题属于激活标志位判断或扭矩计算，应检查是否落在正确的功能子章节内。


### GEN-generic-validation_rule-009 结构校验 4
若输入明显命中“扭矩干预功能”样例，而输出未形成“前轴激活 / 前轴计算 / 后轴激活 / 后轴计算”四个核心主题，应标记为高风险结构偏差。


### GEN-generic-validation_rule-010 结构校验 5
若输出主要由泛化条目组成，而缺少核心设计条目，应标记为“与目标样例风格不一致”。


### GEN-generic-validation_rule-011 结构校验 6
若用户未要求具体章节编号，而输出仍带 `3.31`、`3.31.1` 等字面数字编号，应标记为格式偏差。


### GEN-generic-validation_rule-012 结构校验 7
若当前任务提供人工样例，而生成结果的主条目数量明显多于样例核心条目数量，应标记为“主输出越界”风险。


### GEN-generic-validation_rule-013 结构校验 8
若当前任务提供人工样例，而样例中的核心主题未全部命中，却先输出了补充条目，应标记为高风险结构偏差。


## 内容校验

### GEN-generic-validation_rule-014 内容校验 1
若系统需求给出优先级顺序，设计需求中应显式保留。


### GEN-generic-validation_rule-015 内容校验 2
若模型代码提供阈值、限幅、模式状态或内部变量，设计需求中应尽量保留关键命名。


### GEN-generic-validation_rule-016 内容校验 3
若正文中引用其他需求编号，应检查这些内部引用是否存在、格式是否合理。


### GEN-generic-validation_rule-017 内容校验 4
若发现来源不足、逻辑分支缺失、默认路径缺失或边界限制缺失，应保留问题说明。


### GEN-generic-validation_rule-018 内容校验 5
对激活标志位类需求，若缺少 `active/inactive` 或缺少“否则”路径，应标记为内容不完整。


### GEN-generic-validation_rule-019 内容校验 6
对扭矩计算类需求，若缺少优先级、置零分支、模式分支或限幅说明，应标记为内容不完整。


### GEN-generic-validation_rule-020 内容校验 7
若输出把前轴/后轴统一写成“对应轴”，应标记为对象粒度退化。


### GEN-generic-validation_rule-021 内容校验 8
若输出使用 `icesc_*`、`icadas_*`、`ACCtl_*` 等代码化输入信号命名，而参考样例中存在对应的标准工程命名，应标记为高风险命名偏差。


### GEN-generic-validation_rule-022 内容校验 9
若输出把人工样例中未要求的逻辑擅自扩写进正文，例如把 `AEB/CDP` 扩成 `AEB/CDP/ABS/EBD`，或加入 `CCO/ISA` 等未在目标样例中的分支，应标记为高风险泛化扩写。


### GEN-generic-validation_rule-023 内容校验 10
若人工样例将“控制逻辑”和“记忆逻辑”拆为独立条目，而输出把两者混写进同一条正文，应标记为主题混写风险。


### GEN-generic-validation_rule-024 内容校验 11
若人工样例已明确给出信号枚举值、挡位值、状态值或阈值，而输出改写为不同字面值，应标记为高风险事实漂移。


### GEN-generic-validation_rule-025 内容校验 12
若代码证据支持的只是内部实现细节，而输出把这些细节直接提升为主要求正文，应标记为“实现细节越位”风险。


## 输出要求

### GEN-generic-validation_rule-026 输出要求 1
若发现问题，保留问题说明并降低置信度。


### GEN-generic-validation_rule-027 输出要求 2
若发现多来源冲突，不自动消解，保留冲突说明给审核人员。


### GEN-generic-validation_rule-028 输出要求 3
对模糊措辞、无来源结论和臆造内部引用编号优先标记为高风险。


### GEN-generic-validation_rule-029 输出要求 4
若输出比目标样例“更全”但“更散”，应优先判定为结构退化，而不是加分。


### GEN-generic-validation_rule-030 输出要求 5
对违反命名精度或单一真实来源约束的问题，应按高风险处理，因为这类问题会直接影响 ISO 26262 合规性审查。
