# Requirement Writing Rules

## 写作目标

### GEN-generic-writing_rule-001 写作目标 1
输出中文、可审核、可追溯、可验证的软件设计需求。


### GEN-generic-writing_rule-002 写作目标 2
优先生成贴近工程师现有写法的结构化设计需求，而不是松散的说明性文字。


### GEN-generic-writing_rule-003 写作目标 3
需求要能承接系统需求和模型代码证据，并可用于后续评审、测试和导出。


### GEN-generic-writing_rule-004 写作目标 4
当输入与已知领域样例高度匹配时，优先复现目标样例的章节骨架、拆分粒度和句式风格，而不是扩散生成更多“看起来也合理”的泛化条目。


### GEN-generic-writing_rule-005 写作目标 5
在需遵守 ISO 26262 的场景下，命名必须优先服从参考样例或信号字典，避免破坏单一真实来源。


## 本轮对齐优先级

### GEN-generic-writing_rule-006 本轮对齐优先级 1
对“扭矩干预功能”领域，首选对齐目标不是“尽量多写需求”，而是“先把人工样例里的核心四条设计需求写准”。


### GEN-generic-writing_rule-007 本轮对齐优先级 2
若证据同时支持“核心设计条目”和“泛化补充条目”，优先输出核心设计条目，补充条目只有在不破坏主结构时才追加。


### GEN-generic-writing_rule-008 本轮对齐优先级 3
若当前任务已提供人工软件设计需求样例，最终输出应优先复现该样例的主条目数量、主题顺序和章节归属；除非用户明确要求扩写，否则不要主动增加新的主条目。


### GEN-generic-writing_rule-009 本轮对齐优先级 4
若当前输入明显对应“扭矩干预功能”，优先输出以下骨架：


### GEN-generic-writing_rule-010 本轮对齐优先级 5
`ESC前轴扭矩干预`


### GEN-generic-writing_rule-011 本轮对齐优先级 6
前轴激活标志位判断


### GEN-generic-writing_rule-012 本轮对齐优先级 7
前轴扭矩计算


### GEN-generic-writing_rule-013 本轮对齐优先级 8
`ESC后轴扭矩干预`


### GEN-generic-writing_rule-014 本轮对齐优先级 9
后轴激活标志位判断


### GEN-generic-writing_rule-015 本轮对齐优先级 10
后轴扭矩计算


### GEN-generic-writing_rule-016 本轮对齐优先级 11
若当前输入明显对应“充电管理”，优先输出以下骨架：


### GEN-generic-writing_rule-017 本轮对齐优先级 12
`充电过程`


### GEN-generic-writing_rule-018 本轮对齐优先级 13
堵转加热模式


### GEN-generic-writing_rule-019 本轮对齐优先级 14
充电截止SOC


### GEN-generic-writing_rule-020 本轮对齐优先级 15
充电截止SOC记忆


### GEN-generic-writing_rule-021 本轮对齐优先级 16
若证据足够，再追加 AC充电跳转至充满标志位 / DC充电跳转至充满标志位


### GEN-generic-writing_rule-022 本轮对齐优先级 17
若当前输入同时提供“充电管理”人工样例，则默认只输出上述三条核心主线；`AC充电跳转至充满标志位 / DC充电跳转至充满标志位` 仅可作为 supplement 追加，不能抢占核心输出位。


### GEN-generic-writing_rule-023 本轮对齐优先级 18
对应关系不清晰时，也应尽量维持“对象拆分优先于主题汇总”的写法，不要把前轴/后轴揉成一条。


### GEN-generic-writing_rule-024 本轮对齐优先级 19
章节层级结构要保留，但章节数字编号只是样例背景，不是当前输出的必需内容。除非用户明确要求，否则不要在输出标题里带 `3.31`、`3.31.1`、`3.31.2` 这类具体编号。


## 结构组织规则

### GEN-generic-writing_rule-025 结构组织规则 1
优先使用多级章节组织需求，明确父功能与子功能的从属关系，例如“扭矩干预功能 -> ESC前轴扭矩干预 -> 前轴激活标志位判断”。


### GEN-generic-writing_rule-026 结构组织规则 2
对物理对象不同但逻辑对称的需求，优先拆分为对称子章节，例如前轴/后轴、左侧/右侧。


### GEN-generic-writing_rule-027 结构组织规则 3
在同一子章节内，优先按照“激活标志位判断 -> 计算/仲裁逻辑 -> 边界限制说明”的顺序展开。


### GEN-generic-writing_rule-028 结构组织规则 4
对充电管理领域，优先按照“请求/模式进入 -> 截止停止 -> 记忆与恢复 -> 充满跳转标志位”的顺序展开。


### GEN-generic-writing_rule-029 结构组织规则 5
标题和章节名要直接体现功能主题和对象，避免笼统命名。


### GEN-generic-writing_rule-030 结构组织规则 6
若输出 schema 只能承载平铺需求列表，也要通过 `title`、顺序或正文中的结构描述保留层级归属，例如 `ESC前轴扭矩干预 - 激活标志位判断`。


### GEN-generic-writing_rule-031 结构组织规则 7
每条需求只承载一个设计主题。前轴激活判断、后轴激活判断、前轴扭矩计算、后轴扭矩计算应视为四条独立主题。


## 句式与逻辑规则

### GEN-generic-writing_rule-032 句式与逻辑规则 1
激活或判断逻辑优先采用“当满足以下任一条件时...，否则...”的句式。


### GEN-generic-writing_rule-033 句式与逻辑规则 2
条件应分点列出，并明确逻辑关系是“与”还是“或”。


### GEN-generic-writing_rule-034 句式与逻辑规则 3
计算或仲裁逻辑优先显式声明优先级顺序，使用“优先级顺序为：X > Y > Z”。


### GEN-generic-writing_rule-035 句式与逻辑规则 4
分支逻辑优先采用“当...时，输出=...”的句式，覆盖主要路径、兜底路径和退出条件。


### GEN-generic-writing_rule-036 句式与逻辑规则 5
对状态、区间、阈值、比较关系写明边界，例如“大于低阈值且小于等于高阈值”。


### GEN-generic-writing_rule-037 句式与逻辑规则 6
对激活标志位类需求，正文中应显式出现 `active` 和 `inactive` 两个输出状态。


### GEN-generic-writing_rule-038 句式与逻辑规则 7
对充电管理类需求，应尽量显式写出以下分支：


### GEN-generic-writing_rule-039 句式与逻辑规则 8
进入请求条件


### GEN-generic-writing_rule-040 句式与逻辑规则 9
超时或故障撤销条件


### GEN-generic-writing_rule-041 句式与逻辑规则 10
截止触发条件


### GEN-generic-writing_rule-042 句式与逻辑规则 11
恢复充电条件


### GEN-generic-writing_rule-043 句式与逻辑规则 12
记忆更新与默认回退


### GEN-generic-writing_rule-044 句式与逻辑规则 13
对扭矩计算类需求，应尽量显式写出以下分支：


### GEN-generic-writing_rule-045 句式与逻辑规则 14
升扭请求分支


### GEN-generic-writing_rule-046 句式与逻辑规则 15
降扭请求分支


### GEN-generic-writing_rule-047 句式与逻辑规则 16
AEB/CDP 等置零分支


### GEN-generic-writing_rule-048 句式与逻辑规则 17
VLC 分支


### GEN-generic-writing_rule-049 句式与逻辑规则 18
RBS 分支


### GEN-generic-writing_rule-050 句式与逻辑规则 19
默认分支


### GEN-generic-writing_rule-051 句式与逻辑规则 20
对边界限制，优先使用“注：...”单独写出，而不是埋在长句里。


## 信号与引用规则

### GEN-generic-writing_rule-052 信号与引用规则 1
保留输入信号、输出信号、内部变量和控制模式的原始命名，避免将工程信号泛化成自然语言概念。


### GEN-generic-writing_rule-053 信号与引用规则 2
输入信号优先保留来源前缀，例如 `ESC_`、`EHB_`、`ADAS_`。


### GEN-generic-writing_rule-054 信号与引用规则 3
内部变量或内部使用量应在正文中显式出现，必要时补充“内部使用”说明。


### GEN-generic-writing_rule-055 信号与引用规则 4
如果设计需求依赖其他需求项，应显式保留内部引用编号，例如 `SMiVCU-10160`、`SMiVCU-9477`。


### GEN-generic-writing_rule-056 信号与引用规则 5
需求自身编号通常由外部需求管理系统生成，不作为当前写作质量的核心目标；没有明确要求时，不要为对齐样例而额外追求编号复现。


### GEN-generic-writing_rule-057 信号与引用规则 6
不得编造内部引用编号；没有证据时宁可留空并标注证据不足。


### GEN-generic-writing_rule-058 信号与引用规则 7
若样例库中已经给出领域内标准写法，应优先沿用其信号命名和引用习惯。


### GEN-generic-writing_rule-059 信号与引用规则 8
若当前输入能明确区分前轴与后轴，应分别保留 `_F / _R`、`Frnt / Re` 等对象后缀，不可统一改写为“对应轴”。


### GEN-generic-writing_rule-060 信号与引用规则 9
若参考样例中已经给出标准工程命名，如 `ESC_TqDecReqAct_F`、`ESC_EHB_RBS_F_Active`、`ESC_TrqIncReqActv_F`，则最终正文优先使用这些标准名，不要退化成 `icesc_*` 等代码变量名。


### GEN-generic-writing_rule-061 信号与引用规则 10
若代码变量和标准工程命名并存，正文中优先写标准工程命名；代码变量只可作为追溯证据，不应主导需求正文表达。


### GEN-generic-writing_rule-062 信号与引用规则 11
若充电管理样例中同时出现工程需求名和代码变量名，正文优先使用需求侧名称如 `充电截止SOC`、`VCU1_St_ChrStopRequest`、`VCU2_St_StallHeatingReq`；`Chrg_*EEW/EER` 等代码变量更适合放在追溯或证据位。


### GEN-generic-writing_rule-063 信号与引用规则 12
若代码证据仅补充了实现细节，如 `EEW/EER` 持久化变量、默认回退值、状态机内部枚举、延时计数器等，而人工样例正文未将其写成主要求，则这些内容优先放入来源追溯、依据说明或校验注记，不要直接抬升为正文主句。


### GEN-generic-writing_rule-064 信号与引用规则 13
对信号枚举值、挡位值、状态值和比较阈值，若人工样例已经明确给出，应优先保持与样例完全一致，不要在改写过程中替换为不同字面值。


### GEN-generic-writing_rule-065 信号与引用规则 14
不要因为代码中出现相关变量，就自动把未在参考样例中出现的逻辑写入需求，例如 `ABS/EBD/CCO/ISA` 等；除非系统需求、样例或信号字典明确要求。


## 测试与边界规则

### GEN-generic-writing_rule-066 测试与边界规则 1
每条需求应具备明确的可验证预期，便于测试人员构造输入组合验证输出行为。


### GEN-generic-writing_rule-067 测试与边界规则 2
对激活标志位类需求，应能通过输入条件切换验证输出状态。


### GEN-generic-writing_rule-068 测试与边界规则 3
对仲裁和计算类需求，应能基于优先级分支和边界条件设计测试用例。


### GEN-generic-writing_rule-069 测试与边界规则 4
对最大值、最小值、限幅、保护逻辑等安全边界，优先在“注”或边界说明中显式写出。


## 取舍规则

### GEN-generic-writing_rule-070 取舍规则 1
若目标样例没有把某些接口、时序、诊断条目作为主输出，就不要为了“覆盖更全”而优先输出这类泛化条目。


### GEN-generic-writing_rule-071 取舍规则 2
若必须在“多写几条泛化需求”和“少写但贴近人工样例的设计条目”之间取舍，优先后者。


### GEN-generic-writing_rule-072 取舍规则 3
不要先写总括性条目，再用一句“前后轴类似”带过；应优先分别落成前轴和后轴条目。


### GEN-generic-writing_rule-073 取舍规则 4
在充电管理场景下，不要先写泛化的“充电状态机总述”或“充电电流计算总表”；优先把系统需求已经给出的堵转加热、截止SOC和记忆条目写实。


### GEN-generic-writing_rule-074 取舍规则 5
若人工样例已经把某一逻辑拆成两条，例如“截止SOC控制”与“截止SOC记忆”，不要为了看起来更完整而把它们重新揉成一条。


### GEN-generic-writing_rule-075 取舍规则 6
若代码还能支撑额外条目，但人工样例本轮未将其列为核心输出，应先保证核心条目逐条对齐，再决定是否追加补充条目。


## 禁止事项

### GEN-generic-writing_rule-076 禁止事项 1
避免“适当”“尽量”“必要时”“合理”“优化”“可能”等模糊措辞。


### GEN-generic-writing_rule-077 禁止事项 2
不要把系统需求未明确、模型证据也未支持的推测写成设计需求。


### GEN-generic-writing_rule-078 禁止事项 3
不要把多个独立逻辑主题挤在同一条需求里，除非样例明确采用该组织方式。


### GEN-generic-writing_rule-079 禁止事项 4
不要把人工样例中的主条目和代码侧补充条目混写成“增强版综合需求”。


### GEN-generic-writing_rule-080 禁止事项 5
不要把前轴/后轴合并成“对应轴”后统一描述。


### GEN-generic-writing_rule-081 禁止事项 6
不要在扭矩干预样例中优先生成“接口总表”“执行周期”“越野 TCS”等偏离目标样例核心结构的条目，除非用户明确要求或证据强制要求。


### GEN-generic-writing_rule-082 禁止事项 7
不要把 `ChargingFull`、预约充电、截止SOC、堵转加热、充电电流计算等多个主题揉成一条“充电管理综合需求”。
