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
若系统需求和样例都指向“扭矩干预”领域，应进一步标记四类候选条目：前轴激活标志位判断、前轴扭矩计算、后轴激活标志位判断、后轴扭矩计算。


### GEN-generic-extraction_rule-014 系统需求侧抽取规则 10
若系统需求和样例指向“充电管理”领域，应优先标记五类候选条目：堵转加热请求或模式控制、充电截止SOC设置与有效值过滤、充电截止停止与恢复滞回、截止SOC下电记忆、AC/DC 充电跳转至充满标志位。


### GEN-generic-extraction_rule-020 系统需求侧抽取规则 16
对“无主动安全功能激活”“否则”“不再满足时”等默认或退出条件，应单独抽取，避免后续写作时丢失兜底路径。


## 模型代码与模型文档侧抽取规则

### GEN-generic-extraction_rule-021 模型代码与模型文档侧抽取规则 1
从 C 文件中优先抽取函数、条件分支、赋值关系、宏定义、限幅逻辑和模式判断。


### GEN-generic-extraction_rule-022 模型代码与模型文档侧抽取规则 2
优先识别布尔标志位、扭矩请求、制动再生请求、阈值上下限、模式枚举值和目标扭矩输出变量。


### GEN-generic-extraction_rule-023 模型代码与模型文档侧抽取规则 3
若同一逻辑同时在 PDF 和 C 文件中出现，PDF 更适合作为结构提示，C 更适合作为实现细节证据。


### GEN-generic-extraction_rule-024 模型代码与模型文档侧抽取规则 4
从模型产物中抽取的事实只能补充和细化系统需求，不能覆盖系统需求的优先级和边界。


### GEN-generic-extraction_rule-025 模型代码与模型文档侧抽取规则 5
对扭矩干预领域，优先把代码事实归并到六类设计主题中，而不是只做零散抽取：激活标志位赋值表达式、升扭/降扭/RBS/ISA/CCO 触发条件、AEB/CDP 等置零条件、`VehCfg_stRBCCtrlModeSel` 等模式分支、`TqSpltArbt_tqTarFrntAxle / TqSpltArbt_tqTarReAxle` 目标扭矩承接逻辑、`min/max/fminf/fmaxf` 类边界限制。


### GEN-generic-extraction_rule-032 模型代码与模型文档侧抽取规则 12
对充电管理领域，优先把代码事实归并到六类设计主题中：`Chrg_bACChrgReq / Chrg_bDCChrgReq` 等充电请求使能条件、`StallHeatingReq / RModeReq / RMCU2_St_StallHeating` 等堵转加热请求/反馈/超时保护、`ICM/TCP` 截止 SOC 设置与无效值过滤及合法范围、`Chrg_bChrgStopBySOCLim` 等截止停止判定与恢复滞回、`EEW / EER` 类下电记忆变量、`ChargingFull` 与 AC/DC 跳转至充满标志位及充电状态机枚举。


### GEN-generic-extraction_rule-039 模型代码与模型文档侧抽取规则 19
对 `Frnt/Front/F` 和 `Re/Rear/R` 的对象信号，分别建立前轴和后轴事实集合，避免写作时被合并。


### GEN-generic-extraction_rule-040 模型代码与模型文档侧抽取规则 20
若样例库或信号字典中已存在工程侧标准命名，应将代码变量名仅作为别名或实现证据保留，不能直接替代标准工程命名进入最终需求正文。


### GEN-generic-extraction_rule-041 模型代码与模型文档侧抽取规则 21
若代码侧变量与样例中的标准工程命名不一致，应优先记录“标准名 + 代码别名”的映射，而不是让写作阶段自行联想。


## 证据归并规则

### GEN-generic-extraction_rule-042 证据归并规则 1
对同一事实的多来源证据应保留文件名、位置、原文片段和标签。


### GEN-generic-extraction_rule-043 证据归并规则 2
对存在冲突的事实保留差异，不在抽取阶段裁决。


### GEN-generic-extraction_rule-044 证据归并规则 3
对内部引用编号、信号名、变量名、控制模式名优先原样保留。


### GEN-generic-extraction_rule-045 证据归并规则 4
当事实明显对应激活标志位判断、扭矩计算、仲裁逻辑或边界限制时，应标注对应类别，供写作阶段使用。


### GEN-generic-extraction_rule-046 证据归并规则 5
若证据只支持某个章节的共性说明，不要据此生成跨前轴/后轴的合并条目；应优先等待或寻找对象级证据。


### GEN-generic-extraction_rule-047 证据归并规则 6
若存在样例库中的标准章节骨架，应在抽取结果中显式保留该骨架的命中情况，供写作阶段决定“先写哪四条”。


### GEN-generic-extraction_rule-048 证据归并规则 7
若存在“充电过程 -> 堵转加热模式 / 充电截止SOC / 充电截止SOC记忆”这类骨架，应在抽取结果中显式保留命中情况，并把输入设置、停止条件、恢复条件、记忆变量分开归档。


### GEN-generic-extraction_rule-049 证据归并规则 8
若某一安全功能、模式或信号没有在系统需求、参考样例或信号字典中被明确要求，不要因为代码中出现相关变量就自动扩写进设计需求正文。
