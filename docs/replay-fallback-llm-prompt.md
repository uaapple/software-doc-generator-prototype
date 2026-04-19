# Replay / Fallback LLM Prompt

- 生成时间: 2026-04-17T12:13:20.009Z
- 驳回记录 ID: 76a2bc6a-b4c8-404a-9163-3c3196c42d0e
- 项目: VCU
- 模块: 充电管理
- System Prompt 字符数: 1486
- User Prompt 字符数: 39311
- 总字符数: 40797

## System Prompt

```text
你是技能维护工单生成助手，需要根据驳回记录、期望写法、被驳回输出、原始生成时实际提供过的 skill 上下文，以及用户手动勾选的参考资产，输出可直接进入技能管理的结构化修改建议。
返回内容必须全部使用中文，并严格符合给定 JSON schema。
每个 items 条目只能对应一个 atomic skill 修改项。
层级说明：generic 表示跨模块和跨文档通用的基础规则；docType 表示仅对某一类文档类型生效的规则；domain 表示在某个领域内广泛适用但不局限于单一模块的规则；module 表示仅对当前模块生效的规则。
请先分析驳回意见、期望写法和被驳回输出，再判断建议应该沉淀到 generic / docType / domain / module 哪一层。
如果建议依赖具体模块名、模块专属流程语义、局部边界、模块专属信号、枚举值或阈值，则优先落到 module；不要错误上提到 docType。
优先在原始生成时已提供给模型的 skill 上下文中寻找可以修改的 existing atomic skill；只有在 existing atomic skill 无法覆盖某个独立问题时，才允许输出 conclusionType=create_new。
action 只能填写 add_skill_item、modify_skill_item、split_skill_item、deprecate_skill_item 之一，不要输出自然语言句子。
evidenceRefs 只能填写 rejectionContext.records 中给出的 id，不要填写 requirementCode、标题或自然语言。
modify_existing 时 targetSkillCode 必须来自 candidateSkillInventory 里的 skillCode；不要编造 skillCode。
如果 candidateSkillInventory 为空，或没有任何 skillCode 能精确承接本次修改，就必须输出 create_new + add_skill_item，并把 targetSkillCode 设为空字符串。
不要编造新的 kind，targetKind 必须来自 taskContext.allowedKindsByArea 的允许值。
afterContent 必须是可复用的 atomic skill 正文，不要只是把驳回说明换一种语气重写。
如果当前案例只适合沉淀为模块规则，请把正文抽象成“某类需求在什么条件下不得补写什么内容”的规则，而不是“请把某条结果改成什么”。
beforeContent 应表示当前 skill 原文或当前能力边界；afterContent 应表示建议修改后的 atomic skill 正文。
whyCurrent 必须说明当前 skill 为什么没拦住问题；whyChange 必须说明修改后为什么能避免同类问题。
validatorSuggestions 只做只读建议，不进入自动应用链路。
一次 replay 可以输出多个 items，但每个 item 只能对应一个 atomic skill 修改项。
只要存在驳回记录，items 至少输出 1 条可执行提案；不要返回空数组。
参考资产是案例证据和写法参考，不是 skill；如果人工优质范例与代码证据冲突，应优先对齐人工范例界定的边界和粒度。
不要输出整份 markdown 文件，只输出单条 atomic skill 级别的修改。
```

## User Prompt

```json
{
  "taskContext": {
    "projectName": "VCU",
    "moduleName": "充电管理",
    "documentType": "software_requirement",
    "targetAreas": [
      "validation"
    ],
    "allowedKindsByArea": {
      "writing": [
        "writing_rule",
        "good_example",
        "rule_hint",
        "generation_priority"
      ],
      "extraction": [
        "extraction_rule",
        "rule_hint",
        "generation_priority"
      ],
      "validation": [
        "validation_rule",
        "anti_pattern",
        "rule_hint"
      ],
      "examples": [
        "good_example",
        "bad_example",
        "anti_pattern"
      ],
      "domain_knowledge": [
        "source_alias",
        "normalization_rule",
        "forbidden_expansion",
        "source_policy_setting",
        "document_blueprint_section",
        "document_blueprint_policy",
        "code_style_prefix",
        "rule_hint",
        "generation_priority",
        "anti_pattern"
      ]
    },
    "candidateSkillCount": 0
  },
  "rejectionContext": {
    "records": [
      {
        "id": "76a2bc6a-b4c8-404a-9163-3c3196c42d0e",
        "requirementCode": "CheryVCU-12147",
        "reasonCategory": "coverage_gap",
        "reasonText": "该结果与人工软件需求范例不一致。人工范例中的 CheryVCU-12147 仅描述“下电记忆当前充电截止SOC，设置更新时及时更新，并在下次下电记忆”，未包含“记忆值无效或超出50%-100%范围时回退默认值”的要求。当前生成结果把代码侧推断出的保护/回退逻辑写进了需求正文，导致需求边界超出人工范例，也与人工范例中“以图片原文为准，不过度引入代码补充解释”的风格不一致。",
        "expectedNote": "请按人工范例对齐 CheryVCU-12147 的表达边界，仅保留下电记忆、更新生效、下次下电记忆这三个核心行为；不要把“无效值处理/默认值回退/范围兜底”写入该条需求，除非系统需求或人工输出范例中有明确独立表述。涉及“50%-100%范围”“112无效值”“重新插枪后重新判断”等内容，应保留在充电截止SOC控制条目中，不要混入记忆条目。优先保持与人工范例相同的条目粒度",
        "rejectedOutput": {
          "title": "充电过程 - 充电截止SOC记忆",
          "requirementText": "VCU应对当前充电截止SOC值进行下电记忆；若ICM或TCP设置值更新，应在本次循环生效，并在下次下电时继续保存该值。若记忆值无效或超出50%-100%范围，则应回退为默认有效值。",
          "verificationHint": "通过实车测试验证：设置充电截止SOC后下电，再次上电检查是否恢复设置值；测试超出范围设置时的回退行为。",
          "confidence": 0.85
        },
        "sourceRefsSnapshot": [
          {
            "fileName": "system-requirements-example-charging-management.md",
            "location": "page:1",
            "excerpt": "当 AC 或 DC 充电功能激活时，用户通过大屏或手机 APP 上设置充电 SOC 截止点后，ICM/TCP 向 HCU 发送充电 SOC 截止点设置信号，设置范围 50% - 100%（HCU 需要下电记忆）"
          }
        ],
        "projectEvidenceSnapshot": [
          {
            "fileName": "system-requirements-example-charging-management.md",
            "fileRole": "system_pdf",
            "location": "page:1",
            "excerpt": "# 系统需求示例：充电管理\n\n## 文档信息\n\n- 文档类型：系统需求示例\n- 领域：嵌入式 VCU\n- 语言：中文\n- 版本：v1\n- 来源：`AI case_ITK_20260411.docx` 中 `充电管理(20260410新增) -> 输入：系统需求` 图片，人工提取整理\n- 整理日期：2026-04-14\n\n## 章节信息\n\n- 章节编号：`5.1.3.2`\n- 章节标题：`电池充电堵转加热`\n- 章节编号：`5.1.3.3`\n- 章节标题：`充电截止SOC控制`\n\n## 需求条目\n\n### CheryVCU-1088\n\n- 主题：DC充电场景下的堵转加热请求转发\n- 原文：\n  当车辆处于 DC 充电，HCU 在接收到 ECC 的堵转加热需求后，且 MCU 反馈状态允许进行堵转加热时，HCU 应将堵转加热请求发送给 MCU。\n- 条件：\n  - 车辆处于 DC 充电\n  - ECC 发出堵转加热需求\n  - MCU 反馈状态允许进行堵转加热\n- 期望行为：\n  - HCU 应将堵转加热请求发送给 MCU\n\n### CheryVCU-1077\n\n- 主题：堵转加热请求超时撤销\n- 原文：\n  HCU 请求堵转加热 2s 后，如 MCU 反馈仍未正常进入 Trq 模式进行堵转加热，HCU 停止请求堵转加热。\n- 条件：\n  - HCU 已发起堵转加热请求\n  - 持续时间达到 2s\n  - MCU 反馈未正常进入 Trq 模式进行堵转加热\n- 期望行为：\n  - HCU 应停止堵转加热请求\n- 时序约束：\n  - 请求超时阈值为 2s\n\n### CheryVCU-10935\n\n- 主题：充电截止SOC控制与恢复\n- 原文：\n  当 AC 或 DC 充电功能激活时，用户通过大屏或手机 APP 上设置充电 SOC 截止点后，ICM/TCP 向 HCU 发送充电 SOC 截止点设置信号，设置范围 50% - 100%（HCU 需要下电记忆），当仪表显示 SOC 大于等于截止 SOC 时，HCU 通过向 BMS 发送充电 Stop 指令临时停止充电，当表显 SOC 小于截止 SOC 1% 时，Stop 指令停止发送，OBC 重新恢复充电，直到再次等于截止 SOC。\n- 条件：\n  - AC 或 DC 充电功能激活\n  - 用户通过大屏或手机 APP 设置充电 SOC 截止点\n  - ICM 或 TCP 向 HCU 发送充电 SOC 截止点设置信号\n- 参数约束：\n  - 充电 SOC 截止点设置范围为 50% - 100%\n  - HCU 需要对充电截止点进行下电记忆\n- 期望行为：\n  - HCU 应接收并记忆充电 SOC 截止点\n  - 当表显 SOC 大于等于截止 SOC 时，HCU 应向 BMS 发送充电 Stop 指令以临时停止充电\n  - 当表显 SOC 小于截止 SOC 1% 时，HCU 应停止发送 Stop 指令\n  - OBC 应恢复充电，直到再次达到截止 SOC\n\n## 提炼摘要\n\n- 主主题：充电管理在 DC 充电堵转加热和充电截止 SOC 控制场景下的请求下发、超时保护、截止停止与恢复\n- 关键概念：\n  - DC 充电\n  - 堵转加热请求\n  - Trq 模式\n  - 充电截止 SOC\n  - 下电记忆\n  - Stop 指令\n  - 充电恢复滞回",
            "tags": [
              "system-source",
              "state",
              "timing",
              "threshold",
              "requirement-like"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(rtb_Delay_k)",
            "tags": [
              "function"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(Chrg_stChrgModSet == 3)",
            "tags": [
              "function"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(!rtb_AND1_n)",
            "tags": [
              "function"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(rtb_TmpSignalConversionAtictc_c != Chrg_noSngBookStrtMthEEW)",
            "tags": [
              "function"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(rtb_TmpSignalConversionAtict_br != Chrg_noSngBookStrtDayEEW)",
            "tags": [
              "function"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(rtb_TmpSignalConversionAtictc_c != Chrg_noSngBookStopMthEEW)",
            "tags": [
              "function"
            ]
          },
          {
            "fileName": "Chrg.c",
            "fileRole": "generated_c",
            "location": "function",
            "excerpt": "函数 if(rtb_TmpSignalConversionAtict_br != Chrg_noSngBookStopDayEEW)",
            "tags": [
              "function"
            ]
          }
        ]
      }
    ]
  },
  "originalGenerationSkillContext": {
    "requirementExtraction": "# Requirement Extraction Rules\n\n## 任务目标\n\n### GEN-generic-extraction_rule-001 任务目标 1\n从系统需求 PDF、模型 PDF、生成 C 文件中抽取能支撑软件设计需求编写的结构化事实。\n\n\n### GEN-generic-extraction_rule-002 任务目标 2\n重点抽取条件、状态、优先级、阈值、边界、内部变量、仲裁路径和内部引用线索。\n\n\n### GEN-generic-extraction_rule-003 任务目标 3\n不直接生成需求正文；先把证据整理成后续写作可消费的事实。\n\n\n### GEN-generic-extraction_rule-004 任务目标 4\n对需遵守 ISO 26262 的输出，优先保障命名精度和来源一致性，确保需求条目能够充当单一真实来源（Single Source of Truth）。\n\n\n## 系统需求侧抽取规则\n\n### GEN-generic-extraction_rule-005 系统需求侧抽取规则 1\n优先抽取带编号的系统需求条目及其章节上下文。\n\n\n### GEN-generic-extraction_rule-006 系统需求侧抽取规则 2\n对每条系统需求优先拆出：主题、触发条件、期望行为、优先级顺序、默认行为、适用对象。\n\n\n### GEN-generic-extraction_rule-007 系统需求侧抽取规则 3\n若系统需求中出现“当...时”“否则”“任一条件”“优先级顺序为”等表达，应保留其结构。\n\n\n### GEN-generic-extraction_rule-008 系统需求侧抽取规则 4\n对前轴/后轴、前后轮、左右侧等对称对象，应标记为对称候选事实。\n\n\n### GEN-generic-extraction_rule-009 系统需求侧抽取规则 5\n若系统需求和样例都指向“扭矩干预”领域，应进一步标记以下四类候选条目：\n\n\n### GEN-generic-extraction_rule-010 系统需求侧抽取规则 6\n前轴激活标志位判断\n\n\n### GEN-generic-extraction_rule-011 系统需求侧抽取规则 7\n前轴扭矩计算\n\n\n### GEN-generic-extraction_rule-012 系统需求侧抽取规则 8\n后轴激活标志位判断\n\n\n### GEN-generic-extraction_rule-013 系统需求侧抽取规则 9\n后轴扭矩计算\n\n\n### GEN-generic-extraction_rule-014 系统需求侧抽取规则 10\n若系统需求和样例指向“充电管理”领域，应优先标记以下候选条目：\n\n\n### GEN-generic-extraction_rule-015 系统需求侧抽取规则 11\n堵转加热请求或模式控制\n\n\n### GEN-generic-extraction_rule-016 系统需求侧抽取规则 12\n充电截止SOC设置与有效值过滤\n\n\n### GEN-generic-extraction_rule-017 系统需求侧抽取规则 13\n充电截止停止与恢复滞回\n\n\n### GEN-generic-extraction_rule-018 系统需求侧抽取规则 14\n截止SOC下电记忆\n\n\n### GEN-generic-extraction_rule-019 系统需求侧抽取规则 15\nAC/DC充电跳转至充满标志位\n\n\n### GEN-generic-extraction_rule-020 系统需求侧抽取规则 16\n对“无主动安全功能激活”“否则”“不再满足时”等默认或退出条件，应单独抽取，避免后续写作时丢失兜底路径。\n\n\n## 模型代码与模型文档侧抽取规则\n\n### GEN-generic-extraction_rule-021 模型代码与模型文档侧抽取规则 1\n从 C 文件中优先抽取函数、条件分支、赋值关系、宏定义、限幅逻辑和模式判断。\n\n\n### GEN-generic-extraction_rule-022 模型代码与模型文档侧抽取规则 2\n优先识别布尔标志位、扭矩请求、制动再生请求、阈值上下限、模式枚举值和目标扭矩输出变量。\n\n\n### GEN-generic-extraction_rule-023 模型代码与模型文档侧抽取规则 3\n若同一逻辑同时在 PDF 和 C 文件中出现，PDF 更适合作为结构提示，C 更适合作为实现细节证据。\n\n\n### GEN-generic-extraction_rule-024 模型代码与模型文档侧抽取规则 4\n从模型产物中抽取的事实只能补充和细化系统需求，不能覆盖系统需求的优先级和边界。\n\n\n### GEN-generic-extraction_rule-025 模型代码与模型文档侧抽取规则 5\n对扭矩干预领域，优先把代码事实归并到以下设计主题中，而不是只做零散抽取：\n\n\n### GEN-generic-extraction_rule-026 模型代码与模型文档侧抽取规则 6\n激活标志位赋值表达式\n\n\n### GEN-generic-extraction_rule-027 模型代码与模型文档侧抽取规则 7\n升扭/降扭/RBS/ISA/CCO 触发条件\n\n\n### GEN-generic-extraction_rule-028 模型代码与模型文档侧抽取规则 8\nAEB/CDP 等置零条件\n\n\n### GEN-generic-extraction_rule-029 模型代码与模型文档侧抽取规则 9\n`VehCfg_stRBCCtrlModeSel` 等模式分支\n\n\n### GEN-generic-extraction_rule-030 模型代码与模型文档侧抽取规则 10\n`TqSpltArbt_tqTarFrntAxle / TqSpltArbt_tqTarReAxle` 目标扭矩承接逻辑\n\n\n### GEN-generic-extraction_rule-031 模型代码与模型文档侧抽取规则 11\n`min/max/fminf/fmaxf` 类边界限制\n\n\n### GEN-generic-extraction_rule-032 模型代码与模型文档侧抽取规则 12\n对充电管理领域，优先把代码事实归并到以下设计主题中：\n\n\n### GEN-generic-extraction_rule-033 模型代码与模型文档侧抽取规则 13\n`Chrg_bACChrgReq / Chrg_bDCChrgReq` 等充电请求使能条件\n\n\n### GEN-generic-extraction_rule-034 模型代码与模型文档侧抽取规则 14\n`StallHeatingReq / RModeReq / RMCU2_St_StallHeating` 等堵转加热请求、反馈和超时保护\n\n\n### GEN-generic-extraction_rule-035 模型代码与模型文档侧抽取规则 15\n`ICM/TCP` 截止SOC设置、`112` 无效值过滤、`50%-100%` 合法范围\n\n\n### GEN-generic-extraction_rule-036 模型代码与模型文档侧抽取规则 16\n`Chrg_bChrgStopBySOCLim` 等截止停止判定与 `1%` 恢复滞回\n\n\n### GEN-generic-extraction_rule-037 模型代码与模型文档侧抽取规则 17\n`EEW / EER` 类下电记忆变量\n\n\n### GEN-generic-extraction_rule-038 模型代码与模型文档侧抽取规则 18\n`ChargingFull`、AC/DC 跳转至充满标志位、充电状态机枚举\n\n\n### GEN-generic-extraction_rule-039 模型代码与模型文档侧抽取规则 19\n对 `Frnt/Front/F` 和 `Re/Rear/R` 的对象信号，分别建立前轴和后轴事实集合，避免写作时被合并。\n\n\n### GEN-generic-extraction_rule-040 模型代码与模型文档侧抽取规则 20\n若样例库或信号字典中已存在工程侧标准命名，应将代码变量名仅作为别名或实现证据保留，不能直接替代标准工程命名进入最终需求正文。\n\n\n### GEN-generic-extraction_rule-041 模型代码与模型文档侧抽取规则 21\n若代码侧变量与样例中的标准工程命名不一致，应优先记录“标准名 + 代码别名”的映射，而不是让写作阶段自行联想。\n\n\n## 证据归并规则\n\n### GEN-generic-extraction_rule-042 证据归并规则 1\n对同一事实的多来源证据应保留文件名、位置、原文片段和标签。\n\n\n### GEN-generic-extraction_rule-043 证据归并规则 2\n对存在冲突的事实保留差异，不在抽取阶段裁决。\n\n\n### GEN-generic-extraction_rule-044 证据归并规则 3\n对内部引用编号、信号名、变量名、控制模式名优先原样保留。\n\n\n### GEN-generic-extraction_rule-045 证据归并规则 4\n当事实明显对应激活标志位判断、扭矩计算、仲裁逻辑或边界限制时，应标注对应类别，供写作阶段使用。\n\n\n### GEN-generic-extraction_rule-046 证据归并规则 5\n若证据只支持某个章节的共性说明，不要据此生成跨前轴/后轴的合并条目；应优先等待或寻找对象级证据。\n\n\n### GEN-generic-extraction_rule-047 证据归并规则 6\n若存在样例库中的标准章节骨架，应在抽取结果中显式保留该骨架的命中情况，供写作阶段决定“先写哪四条”。\n\n\n### GEN-generic-extraction_rule-048 证据归并规则 7\n若存在“充电过程 -> 堵转加热模式 / 充电截止SOC / 充电截止SOC记忆”这类骨架，应在抽取结果中显式保留命中情况，并把输入设置、停止条件、恢复条件、记忆变量分开归档。\n\n\n### GEN-generic-extraction_rule-049 证据归并规则 8\n若某一安全功能、模式或信号没有在系统需求、参考样例或信号字典中被明确要求，不要因为代码中出现相关变量就自动扩写进设计需求正文。",
    "requirementWriting": "# Requirement Writing Rules\n\n## 写作定位\n\n### DOC-software_requirement-writing_rule-001 软件需求输出定位\n输出应采用软件需求条目风格，重点描述触发条件、输出行为、约束和引用关系，不要写成详细设计实现说明、HIL 操作步骤或自然语言摘要。\n\n\n### DOC-software_requirement-writing_rule-002 人工样例对齐优先\n当输入同时包含人工软件需求样例、系统需求和代码证据时，优先对齐人工样例已经稳定下来的主题边界、主题顺序和句式，再用其余证据补齐缺失条件。\n\n\n### DOC-software_requirement-writing_rule-003 单条需求单主题\n每条软件需求优先只承载一个稳定控制主题，例如激活判断、主控制逻辑、记忆逻辑、保护逻辑应分别成条，不要混写成综合描述。\n\n\n## 结构组织\n\n### DOC-software_requirement-writing_rule-004 父子章节保留\n文档应保留父功能与子功能的层级关系；若输出 schema 只能平铺列表，也要在标题中保留“父功能 - 子主题”的归属关系。\n\n\n### DOC-software_requirement-writing_rule-005 对象对称拆分\n对前轴/后轴、充电/放电、请求建立/退出恢复等物理对象或流程状态对称的需求，应拆为独立条目，保持结构对称。\n\n\n### DOC-software_requirement-writing_rule-006 流程阶段拆条\n对同一功能中的进入请求、主控制、停止条件、恢复条件、记忆逻辑、保护限幅等不同阶段，优先拆成多条需求，而不是写成一段步骤说明。\n\n\n## 句式与逻辑\n\n### DOC-software_requirement-writing_rule-007 激活判断标准句式\n激活或判断类需求优先采用“当满足以下任一条件时…，否则…”的句式；条件分点列出，并显式写清与/或关系。\n\n\n### DOC-software_requirement-writing_rule-008 优先级显式声明\n多源请求仲裁、多功能冲突或多模式切换时，应直接写出“优先级顺序为：X > Y > Z”，不得把优先级隐藏在叙述性文字里。\n\n\n### DOC-software_requirement-writing_rule-009 分支与默认路径完整\n计算、控制或状态切换类需求应使用“当…时，输出/动作=…”的句式覆盖主要分支、默认路径和退出/恢复路径。\n\n\n### DOC-software_requirement-writing_rule-010 阈值状态值显式化\n涉及阈值、枚举值、状态位、定时器或滞回条件时，应显式写出比较方向、边界包含关系、超时值和状态编码，不要只写“满足条件后”。\n\n\n## 追溯与验证\n\n### DOC-software_requirement-writing_rule-011 信号命名与内部引用保留\n正文中应优先保留工程中可追溯的输入输出信号名、模式名、内部变量名和需求编号引用，避免改写成无法回溯的自然语言概念。\n\n\n### DOC-software_requirement-writing_rule-012 可测试与安全边界并存\n每条需求都应让测试人员能从输入条件推导出可判定的输出预期；若存在最大/最小限制、超时撤销或故障降级，也应显式写出。\n\n\n## 写作目标\n\n### GEN-generic-writing_rule-001 写作目标 1\n输出中文、可审核、可追溯、可验证的软件设计需求。\n\n\n### GEN-generic-writing_rule-002 写作目标 2\n优先生成贴近工程师现有写法的结构化设计需求，而不是松散的说明性文字。\n\n\n### GEN-generic-writing_rule-003 写作目标 3\n需求要能承接系统需求和模型代码证据，并可用于后续评审、测试和导出。\n\n\n### GEN-generic-writing_rule-004 写作目标 4\n当输入与已知领域样例高度匹配时，优先复现目标样例的章节骨架、拆分粒度和句式风格，而不是扩散生成更多“看起来也合理”的泛化条目。\n\n\n### GEN-generic-writing_rule-005 写作目标 5\n在需遵守 ISO 26262 的场景下，命名必须优先服从参考样例或信号字典，避免破坏单一真实来源。\n\n\n## 本轮对齐优先级\n\n### GEN-generic-writing_rule-006 本轮对齐优先级 1\n对“扭矩干预功能”领域，首选对齐目标不是“尽量多写需求”，而是“先把人工样例里的核心四条设计需求写准”。\n\n\n### GEN-generic-writing_rule-007 本轮对齐优先级 2\n若证据同时支持“核心设计条目”和“泛化补充条目”，优先输出核心设计条目，补充条目只有在不破坏主结构时才追加。\n\n\n### GEN-generic-writing_rule-008 本轮对齐优先级 3\n若当前任务已提供人工软件设计需求样例，最终输出应优先复现该样例的主条目数量、主题顺序和章节归属；除非用户明确要求扩写，否则不要主动增加新的主条目。\n\n\n### GEN-generic-writing_rule-009 本轮对齐优先级 4\n若当前输入明显对应“扭矩干预功能”，优先输出以下骨架：\n\n\n### GEN-generic-writing_rule-010 本轮对齐优先级 5\n`ESC前轴扭矩干预`\n\n\n### GEN-generic-writing_rule-011 本轮对齐优先级 6\n前轴激活标志位判断\n\n\n### GEN-generic-writing_rule-012 本轮对齐优先级 7\n前轴扭矩计算\n\n\n### GEN-generic-writing_rule-013 本轮对齐优先级 8\n`ESC后轴扭矩干预`\n\n\n### GEN-generic-writing_rule-014 本轮对齐优先级 9\n后轴激活标志位判断\n\n\n### GEN-generic-writing_rule-015 本轮对齐优先级 10\n后轴扭矩计算\n\n\n### GEN-generic-writing_rule-016 本轮对齐优先级 11\n若当前输入明显对应“充电管理”，优先输出以下骨架：\n\n\n### GEN-generic-writing_rule-017 本轮对齐优先级 12\n`充电过程`\n\n\n### GEN-generic-writing_rule-018 本轮对齐优先级 13\n堵转加热模式\n\n\n### GEN-generic-writing_rule-019 本轮对齐优先级 14\n充电截止SOC\n\n\n### GEN-generic-writing_rule-020 本轮对齐优先级 15\n充电截止SOC记忆\n\n\n### GEN-generic-writing_rule-021 本轮对齐优先级 16\n若证据足够，再追加 AC充电跳转至充满标志位 / DC充电跳转至充满标志位\n\n\n### GEN-generic-writing_rule-022 本轮对齐优先级 17\n若当前输入同时提供“充电管理”人工样例，则默认只输出上述三条核心主线；`AC充电跳转至充满标志位 / DC充电跳转至充满标志位` 仅可作为 supplement 追加，不能抢占核心输出位。\n\n\n### GEN-generic-writing_rule-023 本轮对齐优先级 18\n对应关系不清晰时，也应尽量维持“对象拆分优先于主题汇总”的写法，不要把前轴/后轴揉成一条。\n\n\n### GEN-generic-writing_rule-024 本轮对齐优先级 19\n章节层级结构要保留，但章节数字编号只是样例背景，不是当前输出的必需内容。除非用户明确要求，否则不要在输出标题里带 `3.31`、`3.31.1`、`3.31.2` 这类具体编号。\n\n\n## 结构组织规则\n\n### GEN-generic-writing_rule-025 结构组织规则 1\n优先使用多级章节组织需求，明确父功能与子功能的从属关系，例如“扭矩干预功能 -> ESC前轴扭矩干预 -> 前轴激活标志位判断”。\n\n\n### GEN-generic-writing_rule-026 结构组织规则 2\n对物理对象不同但逻辑对称的需求，优先拆分为对称子章节，例如前轴/后轴、左侧/右侧。\n\n\n### GEN-generic-writing_rule-027 结构组织规则 3\n在同一子章节内，优先按照“激活标志位判断 -> 计算/仲裁逻辑 -> 边界限制说明”的顺序展开。\n\n\n### GEN-generic-writing_rule-028 结构组织规则 4\n对充电管理领域，优先按照“请求/模式进入 -> 截止停止 -> 记忆与恢复 -> 充满跳转标志位”的顺序展开。\n\n\n### GEN-generic-writing_rule-029 结构组织规则 5\n标题和章节名要直接体现功能主题和对象，避免笼统命名。\n\n\n### GEN-generic-writing_rule-030 结构组织规则 6\n若输出 schema 只能承载平铺需求列表，也要通过 `title`、顺序或正文中的结构描述保留层级归属，例如 `ESC前轴扭矩干预 - 激活标志位判断`。\n\n\n### GEN-generic-writing_rule-031 结构组织规则 7\n每条需求只承载一个设计主题。前轴激活判断、后轴激活判断、前轴扭矩计算、后轴扭矩计算应视为四条独立主题。\n\n\n## 句式与逻辑规则\n\n### GEN-generic-writing_rule-032 句式与逻辑规则 1\n激活或判断逻辑优先采用“当满足以下任一条件时...，否则...”的句式。\n\n\n### GEN-generic-writing_rule-033 句式与逻辑规则 2\n条件应分点列出，并明确逻辑关系是“与”还是“或”。\n\n\n### GEN-generic-writing_rule-034 句式与逻辑规则 3\n计算或仲裁逻辑优先显式声明优先级顺序，使用“优先级顺序为：X > Y > Z”。\n\n\n### GEN-generic-writing_rule-035 句式与逻辑规则 4\n分支逻辑优先采用“当...时，输出=...”的句式，覆盖主要路径、兜底路径和退出条件。\n\n\n### GEN-generic-writing_rule-036 句式与逻辑规则 5\n对状态、区间、阈值、比较关系写明边界，例如“大于低阈值且小于等于高阈值”。\n\n\n### GEN-generic-writing_rule-037 句式与逻辑规则 6\n对激活标志位类需求，正文中应显式出现 `active` 和 `inactive` 两个输出状态。\n\n\n### GEN-generic-writing_rule-038 句式与逻辑规则 7\n对充电管理类需求，应尽量显式写出以下分支：\n\n\n### GEN-generic-writing_rule-039 句式与逻辑规则 8\n进入请求条件\n\n\n### GEN-generic-writing_rule-040 句式与逻辑规则 9\n超时或故障撤销条件\n\n\n### GEN-generic-writing_rule-041 句式与逻辑规则 10\n截止触发条件\n\n\n### GEN-generic-writing_rule-042 句式与逻辑规则 11\n恢复充电条件\n\n\n### GEN-generic-writing_rule-043 句式与逻辑规则 12\n记忆更新与默认回退\n\n\n### GEN-generic-writing_rule-044 句式与逻辑规则 13\n对扭矩计算类需求，应尽量显式写出以下分支：\n\n\n### GEN-generic-writing_rule-045 句式与逻辑规则 14\n升扭请求分支\n\n\n### GEN-generic-writing_rule-046 句式与逻辑规则 15\n降扭请求分支\n\n\n### GEN-generic-writing_rule-047 句式与逻辑规则 16\nAEB/CDP 等置零分支\n\n\n### GEN-generic-writing_rule-048 句式与逻辑规则 17\nVLC 分支\n\n\n### GEN-generic-writing_rule-049 句式与逻辑规则 18\nRBS 分支\n\n\n### GEN-generic-writing_rule-050 句式与逻辑规则 19\n默认分支\n\n\n### GEN-generic-writing_rule-051 句式与逻辑规则 20\n对边界限制，优先使用“注：...”单独写出，而不是埋在长句里。\n\n\n## 信号与引用规则\n\n### GEN-generic-writing_rule-052 信号与引用规则 1\n保留输入信号、输出信号、内部变量和控制模式的原始命名，避免将工程信号泛化成自然语言概念。\n\n\n### GEN-generic-writing_rule-053 信号与引用规则 2\n输入信号优先保留来源前缀，例如 `ESC_`、`EHB_`、`ADAS_`。\n\n\n### GEN-generic-writing_rule-054 信号与引用规则 3\n内部变量或内部使用量应在正文中显式出现，必要时补充“内部使用”说明。\n\n\n### GEN-generic-writing_rule-055 信号与引用规则 4\n如果设计需求依赖其他需求项，应显式保留内部引用编号，例如 `SMiVCU-10160`、`SMiVCU-9477`。\n\n\n### GEN-generic-writing_rule-056 信号与引用规则 5\n需求自身编号通常由外部需求管理系统生成，不作为当前写作质量的核心目标；没有明确要求时，不要为对齐样例而额外追求编号复现。\n\n\n### GEN-generic-writing_rule-057 信号与引用规则 6\n不得编造内部引用编号；没有证据时宁可留空并标注证据不足。\n\n\n### GEN-generic-writing_rule-058 信号与引用规则 7\n若样例库中已经给出领域内标准写法，应优先沿用其信号命名和引用习惯。\n\n\n### GEN-generic-writing_rule-059 信号与引用规则 8\n若当前输入能明确区分前轴与后轴，应分别保留 `_F / _R`、`Frnt / Re` 等对象后缀，不可统一改写为“对应轴”。\n\n\n### GEN-generic-writing_rule-060 信号与引用规则 9\n若参考样例中已经给出标准工程命名，如 `ESC_TqDecReqAct_F`、`ESC_EHB_RBS_F_Active`、`ESC_TrqIncReqActv_F`，则最终正文优先使用这些标准名，不要退化成 `icesc_*` 等代码变量名。\n\n\n### GEN-generic-writing_rule-061 信号与引用规则 10\n若代码变量和标准工程命名并存，正文中优先写标准工程命名；代码变量只可作为追溯证据，不应主导需求正文表达。\n\n\n### GEN-generic-writing_rule-062 信号与引用规则 11\n若充电管理样例中同时出现工程需求名和代码变量名，正文优先使用需求侧名称如 `充电截止SOC`、`VCU1_St_ChrStopRequest`、`VCU2_St_StallHeatingReq`；`Chrg_*EEW/EER` 等代码变量更适合放在追溯或证据位。\n\n\n### GEN-generic-writing_rule-063 信号与引用规则 12\n若代码证据仅补充了实现细节，如 `EEW/EER` 持久化变量、默认回退值、状态机内部枚举、延时计数器等，而人工样例正文未将其写成主要求，则这些内容优先放入来源追溯、依据说明或校验注记，不要直接抬升为正文主句。\n\n\n### GEN-generic-writing_rule-064 信号与引用规则 13\n对信号枚举值、挡位值、状态值和比较阈值，若人工样例已经明确给出，应优先保持与样例完全一致，不要在改写过程中替换为不同字面值。\n\n\n### GEN-generic-writing_rule-065 信号与引用规则 14\n不要因为代码中出现相关变量，就自动把未在参考样例中出现的逻辑写入需求，例如 `ABS/EBD/CCO/ISA` 等；除非系统需求、样例或信号字典明确要求。\n\n\n## 测试与边界规则\n\n### GEN-generic-writing_rule-066 测试与边界规则 1\n每条需求应具备明确的可验证预期，便于测试人员构造输入组合验证输出行为。\n\n\n### GEN-generic-writing_rule-067 测试与边界规则 2\n对激活标志位类需求，应能通过输入条件切换验证输出状态。\n\n\n### GEN-generic-writing_rule-068 测试与边界规则 3\n对仲裁和计算类需求，应能基于优先级分支和边界条件设计测试用例。\n\n\n### GEN-generic-writing_rule-069 测试与边界规则 4\n对最大值、最小值、限幅、保护逻辑等安全边界，优先在“注”或边界说明中显式写出。\n\n\n## 取舍规则\n\n### GEN-generic-writing_rule-070 取舍规则 1\n若目标样例没有把某些接口、时序、诊断条目作为主输出，就不要为了“覆盖更全”而优先输出这类泛化条目。\n\n\n### GEN-generic-writing_rule-071 取舍规则 2\n若必须在“多写几条泛化需求”和“少写但贴近人工样例的设计条目”之间取舍，优先后者。\n\n\n### GEN-generic-writing_rule-072 取舍规则 3\n不要先写总括性条目，再用一句“前后轴类似”带过；应优先分别落成前轴和后轴条目。\n\n\n### GEN-generic-writing_rule-073 取舍规则 4\n在充电管理场景下，不要先写泛化的“充电状态机总述”或“充电电流计算总表”；优先把系统需求已经给出的堵转加热、截止SOC和记忆条目写实。\n\n\n### GEN-generic-writing_rule-074 取舍规则 5\n若人工样例已经把某一逻辑拆成两条，例如“截止SOC控制”与“截止SOC记忆”，不要为了看起来更完整而把它们重新揉成一条。\n\n\n### GEN-generic-writing_rule-075 取舍规则 6\n若代码还能支撑额外条目，但人工样例本轮未将其列为核心输出，应先保证核心条目逐条对齐，再决定是否追加补充条目。\n\n\n## 禁止事项\n\n### GEN-generic-writing_rule-076 禁止事项 1\n避免“适当”“尽量”“必要时”“合理”“优化”“可能”等模糊措辞。\n\n\n### GEN-generic-writing_rule-077 禁止事项 2\n不要把系统需求未明确、模型证据也未支持的推测写成设计需求。\n\n\n### GEN-generic-writing_rule-078 禁止事项 3\n不要把多个独立逻辑主题挤在同一条需求里，除非样例明确采用该组织方式。\n\n\n### GEN-generic-writing_rule-079 禁止事项 4\n不要把人工样例中的主条目和代码侧补充条目混写成“增强版综合需求”。\n\n\n### GEN-generic-writing_rule-080 禁止事项 5\n不要把前轴/后轴合并成“对应轴”后统一描述。\n\n\n### GEN-generic-writing_rule-081 禁止事项 6\n不要在扭矩干预样例中优先生成“接口总表”“执行周期”“越野 TCS”等偏离目标样例核心结构的条目，除非用户明确要求或证据强制要求。\n\n\n### GEN-generic-writing_rule-082 禁止事项 7\n不要把 `ChargingFull`、预约充电、截止SOC、堵转加热、充电电流计算等多个主题揉成一条“充电管理综合需求”。",
    "requirementValidation": "# Requirement Validation Rules\n\n## 校验目标\n\n### DOC-software_requirement-validation_rule-001 文档风格校验\n检查输出是否保持软件需求风格；若正文主要由实现步骤、状态机内部变量解释或测试操作说明构成，应判为风格偏移。\n\n\n### DOC-software_requirement-validation_rule-002 主题粒度校验\n检查每条需求是否只承载一个稳定主题；若把控制逻辑、记忆逻辑和保护逻辑混写在一条正文中，应标记为主题混写风险。\n\n\n## 结构校验\n\n### DOC-software_requirement-validation_rule-003 层级结构校验\n检查父功能、子功能和需求条目的层级是否清晰；若样例明显存在父子结构而输出完全平铺且无归属提示，应标记为结构退化。\n\n\n### DOC-software_requirement-validation_rule-004 对象对称性校验\n对前后轴、充放电、请求与恢复等对称对象，若只生成一侧或只保留单条总纲需求，应标记为结构不完整。\n\n\n### DOC-software_requirement-validation_rule-005 激活与恢复分支校验\n对激活判断、模式进入、停止控制类需求，若缺少“否则”路径、恢复条件、重新进入条件或超时撤销条件，应标记为内容不完整。\n\n\n## 内容校验\n\n### DOC-software_requirement-validation_rule-006 优先级与默认路径校验\n对仲裁、计算、功率限制类需求，若缺少优先级顺序、兜底分支或默认输出路径，应标记为高风险缺失。\n\n\n### DOC-software_requirement-validation_rule-007 阈值与状态值校验\n检查是否保留关键阈值、状态枚举、时间参数、边界包含关系和滞回条件；若只保留模糊表述，应降低置信度。\n\n\n### DOC-software_requirement-validation_rule-008 命名与引用校验\n检查信号命名、模式名和需求编号是否可追溯；若编造编号、误改信号名或把代码内部别名当成正式需求名，应标记为高风险。\n\n\n## 输出风险\n\n### DOC-software_requirement-validation_rule-009 可测试性校验\n检查正文是否能够直接导出测试场景：输入条件、触发动作、输出行为和保护边界应可判定。\n\n\n### DOC-software_requirement-validation_rule-010 无依据扩写校验\n若当前证据只支持核心主题，而输出擅自扩写到新的模块主题、支撑逻辑或实现细节，应标记为越界扩写。\n\n\n## 校验目标\n\n### GEN-generic-validation_rule-001 校验目标 1\n检查每条需求是否有正文、来源、验证建议和置信度。\n\n\n### GEN-generic-validation_rule-002 校验目标 2\n检查需求是否遵循目标样例的章节层级和对称展开方式。\n\n\n### GEN-generic-validation_rule-003 校验目标 3\n检查是否保留了关键信号、内部变量、优先级、边界说明和内部引用。\n\n\n### GEN-generic-validation_rule-004 校验目标 4\n检查是否存在重复、模糊措辞、臆造事实和明显冲突。\n\n\n### GEN-generic-validation_rule-005 校验目标 5\n对需满足 ISO 26262 的文档，检查信号命名是否来自参考样例或信号字典，避免破坏单一真实来源。\n\n\n## 结构校验\n\n### GEN-generic-validation_rule-006 结构校验 1\n若输出应为章节化设计需求，需校验章节层级是否合理。\n\n\n### GEN-generic-validation_rule-007 结构校验 2\n对前轴/后轴等对称对象，若只生成单侧需求，应标记为结构缺失风险。\n\n\n### GEN-generic-validation_rule-008 结构校验 3\n若需求主题属于激活标志位判断或扭矩计算，应检查是否落在正确的功能子章节内。\n\n\n### GEN-generic-validation_rule-009 结构校验 4\n若输入明显命中“扭矩干预功能”样例，而输出未形成“前轴激活 / 前轴计算 / 后轴激活 / 后轴计算”四个核心主题，应标记为高风险结构偏差。\n\n\n### GEN-generic-validation_rule-010 结构校验 5\n若输出主要由泛化条目组成，而缺少核心设计条目，应标记为“与目标样例风格不一致”。\n\n\n### GEN-generic-validation_rule-011 结构校验 6\n若用户未要求具体章节编号，而输出仍带 `3.31`、`3.31.1` 等字面数字编号，应标记为格式偏差。\n\n\n### GEN-generic-validation_rule-012 结构校验 7\n若当前任务提供人工样例，而生成结果的主条目数量明显多于样例核心条目数量，应标记为“主输出越界”风险。\n\n\n### GEN-generic-validation_rule-013 结构校验 8\n若当前任务提供人工样例，而样例中的核心主题未全部命中，却先输出了补充条目，应标记为高风险结构偏差。\n\n\n## 内容校验\n\n### GEN-generic-validation_rule-014 内容校验 1\n若系统需求给出优先级顺序，设计需求中应显式保留。\n\n\n### GEN-generic-validation_rule-015 内容校验 2\n若模型代码提供阈值、限幅、模式状态或内部变量，设计需求中应尽量保留关键命名。\n\n\n### GEN-generic-validation_rule-016 内容校验 3\n若正文中引用其他需求编号，应检查这些内部引用是否存在、格式是否合理。\n\n\n### GEN-generic-validation_rule-017 内容校验 4\n若发现来源不足、逻辑分支缺失、默认路径缺失或边界限制缺失，应保留问题说明。\n\n\n### GEN-generic-validation_rule-018 内容校验 5\n对激活标志位类需求，若缺少 `active/inactive` 或缺少“否则”路径，应标记为内容不完整。\n\n\n### GEN-generic-validation_rule-019 内容校验 6\n对扭矩计算类需求，若缺少优先级、置零分支、模式分支或限幅说明，应标记为内容不完整。\n\n\n### GEN-generic-validation_rule-020 内容校验 7\n若输出把前轴/后轴统一写成“对应轴”，应标记为对象粒度退化。\n\n\n### GEN-generic-validation_rule-021 内容校验 8\n若输出使用 `icesc_*`、`icadas_*`、`ACCtl_*` 等代码化输入信号命名，而参考样例中存在对应的标准工程命名，应标记为高风险命名偏差。\n\n\n### GEN-generic-validation_rule-022 内容校验 9\n若输出把人工样例中未要求的逻辑擅自扩写进正文，例如把 `AEB/CDP` 扩成 `AEB/CDP/ABS/EBD`，或加入 `CCO/ISA` 等未在目标样例中的分支，应标记为高风险泛化扩写。\n\n\n### GEN-generic-validation_rule-023 内容校验 10\n若人工样例将“控制逻辑”和“记忆逻辑”拆为独立条目，而输出把两者混写进同一条正文，应标记为主题混写风险。\n\n\n### GEN-generic-validation_rule-024 内容校验 11\n若人工样例已明确给出信号枚举值、挡位值、状态值或阈值，而输出改写为不同字面值，应标记为高风险事实漂移。\n\n\n### GEN-generic-validation_rule-025 内容校验 12\n若代码证据支持的只是内部实现细节，而输出把这些细节直接提升为主要求正文，应标记为“实现细节越位”风险。\n\n\n## 输出要求\n\n### GEN-generic-validation_rule-026 输出要求 1\n若发现问题，保留问题说明并降低置信度。\n\n\n### GEN-generic-validation_rule-027 输出要求 2\n若发现多来源冲突，不自动消解，保留冲突说明给审核人员。\n\n\n### GEN-generic-validation_rule-028 输出要求 3\n对模糊措辞、无来源结论和臆造内部引用编号优先标记为高风险。\n\n\n### GEN-generic-validation_rule-029 输出要求 4\n若输出比目标样例“更全”但“更散”，应优先判定为结构退化，而不是加分。\n\n\n### GEN-generic-validation_rule-030 输出要求 5\n对违反命名精度或单一真实来源约束的问题，应按高风险处理，因为这类问题会直接影响 ISO 26262 合规性审查。",
    "goodExamples": "# Good Examples\n\n### MOD-充电管理-good_example-001 充电过程堵转加热模式\n当 ECC_StallHeatingReq = ON、DC充电枪已连接、车辆处于P挡、车速低于允许阈值、电池处于DC Charge状态，且 RMCU 堵转加热状态不处于 Heating Failed / Heating Over 时，VCU 应发送堵转加热请求 VCU2_St_StallHeatingReq = Request，并发送后驱模式请求 VCU82_St_RModeReq = TrqCtl。若请求发出 2s 后 RMCU2_St_StallHeating 仍未进入 Heating，则应撤销该请求。\n\n\n### MOD-充电管理-good_example-002 充电截止SOC\n当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。\n\n\n### MOD-充电管理-good_example-003 充电截止SOC记忆\nVCU 应对当前充电截止SOC值进行下电记忆；若 ICM 或 TCP 设置值更新，应在本次循环生效，并在下次下电时继续保存该值。若记忆值无效或超出 50%-100% 范围，则应回退为默认有效值。\n\n\n## 扭矩干预\n\n### DOC-software_requirement-good_example-001 ESC干预前轴激活标志位判断\n当满足以下任一条件时，ESC干预前轴激活标志位置为 active：ESC_TqDecReqAct_F = 0x1 且前电机降扭请求标志位激活，或 ESC_EHB_RBS_F_Active = 0x1 且前轴制动再生扭矩请求标志位激活，或 ESC_TrqIncReqActv_F = 0x1 且前电机升扭请求标志位激活。否则，ESC干预前轴激活标志位置为 inactive。对升扭、降扭和制动再生请求还应结合低/高阈值进行有效性判断。\n\n\n## 充电管理\n\n### DOC-software_requirement-good_example-002 充电过程 - 充电截止SOC\n当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。\n\n\n## 高低系统管理\n\n### DOC-software_requirement-good_example-003 本地KL15上高压建立流程\n当HCU确定整车高压需求后，应向BMS发送高压连通请求以闭合主高压回路；在确认高压回路连通后，请求高压附件使能及DCDC进入Buck状态，并最终判定整车上高压成功。\n\n\n## 高压能量管理\n\n### DOC-software_requirement-good_example-004 动力电池可用放电功率计算\nVCU 内部对动力电池可用放电功率应优先采用 BMS 10s 可用放电功率（BMS4_N_SOF10D），并在此基础上结合 SOC 保护、预留功率及低 SOC 限制进行修正；在怠速发电和行车发电场景下，当动力电池 SOC 大于默认 6% 时，应按 BMS 10s 可用放电功率减去默认 3kW 预留功率计算；当 SOC 低于默认 6% 时，应随 SOC 下降逐步降低，并在 3% 以下限制为 3kW。\n\n\n### GEN-generic-good_example-001 good example 1\n当输入条件满足且保护条件未触发时，软件应输出明确的控制动作；否则应输出默认动作或恢复状态。\n\n\n### GEN-generic-good_example-002 good example 2\n若同一主题存在多个分支，应显式写出优先级顺序或分支条件，不要把仲裁逻辑隐藏在“按情况处理”这类模糊表达里。\n\n\n### GEN-generic-good_example-003 good example 3\n当需求涉及阈值、超时、上升沿或状态切换时，应直接写出边界和触发方式，而不是只写“满足条件后处理”。\n\n\n### GEN-generic-good_example-004 good example 4\n若某条需求依赖其他信号、模式或内部引用，应在正文或注记中显式保留名称和关联关系。",
    "badExamples": "# Bad Examples\n\n### GEN-generic-bad_example-001 bad example 1\n软件应合理处理相关功能。\n\n\n### GEN-generic-bad_example-002 bad example 2\n系统按情况执行对应逻辑。\n\n\n### GEN-generic-bad_example-003 bad example 3\n当功能激活时，输出相应结果。\n\n\n### GEN-generic-bad_example-004 bad example 4\n参考已有需求实现即可。",
    "domainKnowledge": {
      "version": 1,
      "generationPriorities": [
        "若输入明显属于充电管理，优先生成堵转加热模式、充电截止SOC、充电截止SOC记忆，再考虑充满跳转标志位等补充条目。",
        "若当前输入同时提供人工软件设计需求样例，优先复现样例中的核心条目数、主题顺序和章节归属，不要把代码还能支持的补充逻辑提前写成新的主条目。",
        "若输出 schema 只能承载列表，也要在标题或正文中保留层级关系和对象归属，但不要输出具体章节数字。",
        "优先输出符合人工软件需求条目风格的内容，再考虑补充说明，不要先生成详细设计化的过程描述。",
        "对已经有人工样例锚点的主题，优先复现样例中的主条目边界、顺序和对象拆分，再补充阈值、引用和恢复路径。",
        "在充电管理、高低系统管理、高压能量管理等主题中，先输出核心主线条目，再决定是否追加补充主题。",
        "优先保留输入中的正式信号名、需求编号、状态值和模式名，不要为了顺口改写成模糊概念。",
        "当没有完全同构的人工样例时，优先复用最接近样本的章节骨架与句式，而不是重新发明新的写法。",
        "若系统需求、软件需求样例与代码证据存在层次差异，软件需求层的输出应聚焦可审核的功能条目，不要下沉到实现细节。",
        "优先保证输出可审核、可追溯、可验证，再追求覆盖面扩张。",
        "若输入同时包含人工优质样例，应优先对齐样例的主题顺序、粒度和写法风格。",
        "每条需求优先只承载一个设计主题，不要把多个独立控制逻辑揉成一条综合描述。",
        "若输出 schema 只能承载平铺列表，也要在标题或正文中保留功能层级和对象归属。",
        "在模型代码、系统需求和人工样例同时存在时，正文命名优先服从样例或信号字典，不要让代码变量名主导最终表达。"
      ],
      "examples": [
        {
          "requirementId": "CheryVCU-3015",
          "topic": "充电过程堵转加热模式",
          "sectionTitle": "充电过程",
          "requirementType": "charge_mode_request_logic",
          "preferredTitle": "充电过程 - 堵转加热模式",
          "requirementText": "当 ECC_StallHeatingReq = ON、DC充电枪已连接、车辆处于P挡、车速低于允许阈值、电池处于DC Charge状态，且 RMCU 堵转加热状态不处于 Heating Failed / Heating Over 时，VCU 应发送堵转加热请求 VCU2_St_StallHeatingReq = Request，并发送后驱模式请求 VCU82_St_RModeReq = TrqCtl。若请求发出 2s 后 RMCU2_St_StallHeating 仍未进入 Heating，则应撤销该请求。",
          "signals": [
            "ECC_StallHeatingReq",
            "VCU2_St_StallHeatingReq",
            "VCU82_St_RModeReq",
            "BMS3_St_DCChargePlugin",
            "VCU1_N_ActualGear",
            "ESC_VehiclESCspeed",
            "BMS1_St_BatteryMode",
            "RMCU2_St_StallHeating"
          ],
          "references": [
            "CheryVCU-1088",
            "CheryVCU-1077"
          ],
          "canonicalBranches": [
            "ECC请求成立",
            "DC充电连接成立",
            "P挡且低车速成立",
            "电池DC充电模式成立",
            "RMCU状态允许",
            "发送请求与模式",
            "2s超时撤销"
          ],
          "keywords": [
            "充电过程",
            "堵转加热",
            "DC充电",
            "TrqCtl",
            "超时保护"
          ]
        },
        {
          "requirementId": "CheryVCU-8102",
          "topic": "充电截止SOC",
          "sectionTitle": "充电过程",
          "requirementType": "charge_soc_limit_control",
          "preferredTitle": "充电过程 - 充电截止SOC",
          "requirementText": "当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。",
          "signals": [
            "ICM_Chg_SOC_LimitPointSet",
            "TCP_Chg_SOC_LimitPointSet",
            "VCU_Chg_SOC_LimitSts",
            "VCU1_St_ChrStopRequest",
            "BMS2_N_SOC",
            "OBC1_St_ChargerConnection",
            "BMS3_St_DCChargePlugin",
            "Chrg_bChrgStopBySOCLim"
          ],
          "references": [
            "CheryVCU-10935"
          ],
          "canonicalBranches": [
            "设置值更新",
            "112无效值过滤",
            "达到截止点发送Stop",
            "低于截止点1%恢复",
            "插枪上升沿恢复"
          ],
          "keywords": [
            "充电截止SOC",
            "设置记忆",
            "Stop请求",
            "恢复滞回",
            "重新插枪"
          ]
        },
        {
          "requirementId": "CheryVCU-12147",
          "topic": "充电截止SOC记忆",
          "sectionTitle": "充电过程",
          "requirementType": "charge_soc_memory",
          "preferredTitle": "充电过程 - 充电截止SOC记忆",
          "requirementText": "VCU 应对当前充电截止SOC值进行下电记忆；若 ICM 或 TCP 设置值更新，应在本次循环生效，并在下次下电时继续保存该值。若记忆值无效或超出 50%-100% 范围，则应回退为默认有效值。",
          "signals": [
            "ICM_Chg_SOC_LimitPointSet",
            "TCP_Chg_SOC_LimitPointSet",
            "Chrg_pctBookChrgSocSetEEW",
            "Chrg_pctBookChrgSocSetEER"
          ],
          "references": [
            "CheryVCU-12147"
          ],
          "canonicalBranches": [
            "设置值更新",
            "下电记忆",
            "上电读取",
            "50%-100%范围校验",
            "无效值默认回退"
          ],
          "keywords": [
            "充电截止SOC记忆",
            "下电记忆",
            "EEW",
            "EER",
            "默认回退"
          ]
        },
        {
          "requirementId": "SMiVCU-10160",
          "topic": "ESC干预前轴激活标志位判断",
          "sectionTitle": "ESC前轴扭矩干预",
          "requirementType": "activation_flag_logic",
          "preferredTitle": "ESC前轴扭矩干预 - 激活标志位判断",
          "requirementText": "当满足以下任一条件时，ESC干预前轴激活标志位置为 active：ESC_TqDecReqAct_F = 0x1 且前电机降扭请求标志位激活，或 ESC_EHB_RBS_F_Active = 0x1 且前轴制动再生扭矩请求标志位激活，或 ESC_TrqIncReqActv_F = 0x1 且前电机升扭请求标志位激活。否则，ESC干预前轴激活标志位置为 inactive。对升扭、降扭和制动再生请求还应结合低/高阈值进行有效性判断。",
          "signals": [
            "ESC_TqDecReqAct_F",
            "ESC_EHB_RBS_F_Active",
            "ESC_TrqIncReqActv_F",
            "ESC_TrqIncReq_F",
            "ESC_EHB_RBS_F_TargetRegenTrq"
          ]
        },
        {
          "requirementId": "CheryVCU-8102",
          "topic": "充电截止SOC",
          "sectionTitle": "充电过程",
          "requirementType": "charge_soc_limit_control",
          "preferredTitle": "充电过程 - 充电截止SOC",
          "requirementText": "当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。",
          "signals": [
            "ICM_Chg_SOC_LimitPointSet",
            "TCP_Chg_SOC_LimitPointSet",
            "VCU_Chg_SOC_LimitSts",
            "VCU1_St_ChrStopRequest",
            "BMS2_N_SOC"
          ],
          "references": [
            "CheryVCU-10935"
          ]
        },
        {
          "requirementId": "CheryVCU-1120",
          "topic": "本地KL15上高压建立流程",
          "sectionTitle": "本地KL15上高压",
          "requirementType": "high_voltage_power_on_sequence",
          "preferredTitle": "本地KL15上高压建立流程",
          "requirementText": "当HCU确定整车高压需求后，应向BMS发送高压连通请求以闭合主高压回路；在确认高压回路连通后，请求高压附件使能及DCDC进入Buck状态，并最终判定整车上高压成功。",
          "signals": [
            "HvCoorn_stBMSModeReq",
            "icbms_stMainPosRly",
            "icbms_stMainNegRly",
            "icdc_stMode",
            "HvCoorn_bHvReady"
          ],
          "references": [
            "CheryVCU-1120"
          ]
        },
        {
          "requirementId": "CheryVCU-4098",
          "topic": "动力电池可用放电功率计算",
          "sectionTitle": "电池可用充放功率计算",
          "requirementType": "charge_discharge_power_calculation",
          "preferredTitle": "动力电池可用放电功率计算",
          "requirementText": "VCU 内部对动力电池可用放电功率应优先采用 BMS 10s 可用放电功率（BMS4_N_SOF10D），并在此基础上结合 SOC 保护、预留功率及低 SOC 限制进行修正；在怠速发电和行车发电场景下，当动力电池 SOC 大于默认 6% 时，应按 BMS 10s 可用放电功率减去默认 3kW 预留功率计算；当 SOC 低于默认 6% 时，应随 SOC 下降逐步降低，并在 3% 以下限制为 3kW。",
          "signals": [
            "BMS2_N_SOC",
            "BMS4_N_SOF10D"
          ],
          "references": [
            "CheryVCU-7532",
            "CheryVCU-7549"
          ]
        },
        {
          "topic": "good example 1",
          "requirementText": "当输入条件满足且保护条件未触发时，软件应输出明确的控制动作；否则应输出默认动作或恢复状态。"
        },
        {
          "topic": "good example 2",
          "requirementText": "若同一主题存在多个分支，应显式写出优先级顺序或分支条件，不要把仲裁逻辑隐藏在“按情况处理”这类模糊表达里。"
        },
        {
          "topic": "good example 3",
          "requirementText": "当需求涉及阈值、超时、上升沿或状态切换时，应直接写出边界和触发方式，而不是只写“满足条件后处理”。"
        },
        {
          "topic": "good example 4",
          "requirementText": "若某条需求依赖其他信号、模式或内部引用，应在正文或注记中显式保留名称和关联关系。"
        }
      ],
      "ruleHints": [
        {
          "domain": "embedded_vcu",
          "subdomain": "充电管理",
          "writingPattern": "优先按充电过程下的控制主题拆条；先写堵转加热请求及超时保护，再写截止SOC设置与停止逻辑，最后单独写截止SOC记忆；若人工样例只保留三条主线，则先严格对齐这三条，再决定是否追加充满跳转标志位等 supplement。",
          "targetStyle": "输出应贴近人工样例条目，显式写出输入信号、条件、输出动作和恢复路径，但不要把代码中的内部实现细节直接抬升为新的主条目或混入控制正文。"
        },
        {
          "domain": "embedded_vcu",
          "subdomain": "扭矩干预",
          "writingPattern": "优先按前轴/后轴对称拆分，先写激活判断，再写扭矩计算；显式保留优先级、阈值、active/inactive 和内部引用。",
          "targetStyle": "输出应接近人工软件需求/设计样例的条目写法，而不是系统需求摘要。"
        },
        {
          "domain": "embedded_vcu",
          "subdomain": "充电管理",
          "writingPattern": "优先按充电过程下的控制主题拆条；先写进入请求与撤销，再写截止停止，再写记忆与恢复。",
          "targetStyle": "输出应显式写出输入条件、动作、停止条件和恢复路径，但不要把内部实现细节抬升为新的主条目。"
        },
        {
          "domain": "embedded_vcu",
          "subdomain": "高低系统管理",
          "writingPattern": "围绕高压请求激活、主回路建立、附件使能和Ready判定组织软件需求，不要把整个状态机直接摊平成实现步骤。",
          "targetStyle": "输出应体现请求条件、执行动作、完成判据和退出条件，保持功能需求语气。"
        },
        {
          "domain": "embedded_vcu",
          "subdomain": "高压能量管理",
          "writingPattern": "优先保持五条核心主线：可用放电功率、放电单体保护、可用充电功率、充电单体保护、峰值可用放电功率。",
          "targetStyle": "输出应保留功率源、阈值、预留功率、查表限制和前序需求引用，不要泛化成总纲说明。"
        },
        {
          "domain": "embedded_vcu",
          "subdomain": "generic",
          "writingPattern": "优先采用“条件/触发 + 输出动作 + 否则或恢复路径”的句式；若存在多分支或仲裁关系，应显式写出优先级和边界条件。",
          "targetStyle": "输出应接近工程设计需求条目，而不是摘要式说明或自然语言概括。"
        }
      ],
      "antiPatterns": [
        "不要把堵转加热、截止SOC、记忆、充满跳转标志位、电流计算等充电主题揉成一条综合需求。",
        "不要在人工样例已经拆分“截止SOC控制”和“截止SOC记忆”时，再把两者混写成一条增强版需求。",
        "不要把代码侧补充条目如 ChargingFull 状态跳转，提前写成与人工样例并列的核心主输出。",
        "不要把激活判断、主控制逻辑、恢复逻辑、记忆逻辑和保护逻辑揉成一条综合需求。",
        "不要把软件需求写成详细设计实现说明、状态机代码解说或 HIL 测试步骤。",
        "不要省略否则路径、默认路径、恢复条件、重新进入条件或超时撤销条件。",
        "不要在没有证据的情况下编造需求编号、阈值、枚举值、默认值或模式名。",
        "不要直接使用代码变量名或模块名作为章节标题而不给出需求侧语义主题。",
        "不要因为代码里还能看到补充逻辑，就抢在核心主线之前扩写新的模块主题或支撑条目。",
        "不要使用“合理”“按情况”“必要时”“适当”等模糊措辞。",
        "不要只复述系统需求主题，不落到具体输入、条件、动作和输出。",
        "不要把多个独立控制主题混成一条综合需求。",
        "不要省略否则路径、恢复路径、边界条件或超时条件。",
        "不要写没有来源依据的内部引用编号。",
        "不要让实现代码变量名直接替代需求侧标准命名。"
      ],
      "sourceOfTruthPolicy": {
        "standard": "ISO 26262",
        "singleSourceOfTruth": true,
        "forbidCodeStyleSignals": true,
        "codeStylePrefixes": [
          "icesc_",
          "icadas_",
          "ACCtl_",
          "ParkCtrl_"
        ],
        "canonicalSignalAliases": [
          {
            "canonical": "ESC_TqDecReqAct_F",
            "aliases": [
              "icesc_bFrntAxleTqDecActv"
            ]
          },
          {
            "canonical": "ESC_EHB_RBS_F_Active",
            "aliases": [
              "icesc_bFrntAxleRBSTqActv"
            ]
          },
          {
            "canonical": "ESC_TrqIncReqActv_F",
            "aliases": [
              "icesc_bFrntAxleTqIncActv"
            ]
          },
          {
            "canonical": "ESC_TrqIncReq_F",
            "aliases": [
              "icesc_tqReqFrntAxleInc"
            ]
          },
          {
            "canonical": "ESC_TqDecReq_F",
            "aliases": [
              "icesc_tqReqFrntAxleDec"
            ]
          },
          {
            "canonical": "ESC_EHB_RBS_F_TargetRegenTrq",
            "aliases": [
              "icesc_tqRBSReqFrntAxle"
            ]
          },
          {
            "canonical": "ESC_TqDecReqAct_R",
            "aliases": [
              "icesc_bReAxleTqDecActv"
            ]
          },
          {
            "canonical": "ESC_EHB_RBS_R_Active",
            "aliases": [
              "icesc_bReAxleRBSTqActv"
            ]
          },
          {
            "canonical": "ESC_TrqIncReqActv_R",
            "aliases": [
              "icesc_bReAxleTqIncActv"
            ]
          },
          {
            "canonical": "ESC_TrqIncReq_R",
            "aliases": [
              "icesc_tqReqReAxleInc"
            ]
          },
          {
            "canonical": "ESC_TqDecReq_R",
            "aliases": [
              "icesc_tqReqReAxleDec"
            ]
          },
          {
            "canonical": "ESC_EHB_RBS_R_TargetRegenTrq",
            "aliases": [
              "icesc_tqRBSReqReAxle"
            ]
          },
          {
            "canonical": "ESC_AEB_Active",
            "aliases": [
              "icadas_bAEBActv"
            ]
          },
          {
            "canonical": "ESC_CDP_Active",
            "aliases": [
              "icesc_bCDPActv"
            ]
          },
          {
            "canonical": "ESC_VLC_TorqCtrlActive",
            "aliases": [
              "icadas_bTqVLCTrgtReqVld"
            ]
          }
        ],
        "normalizationRules": [
          {
            "pattern": "AEB/CDP/ABS/EBD任一功能",
            "replacement": "AEB或CDP任一功能"
          },
          {
            "pattern": "主动制动（AEB/CDP/ABS/EBD）",
            "replacement": "主动制动（AEB/CDP）"
          },
          {
            "pattern": "；4. 前轴CCO/ISA扭矩请求有效"
          },
          {
            "pattern": "；4. 后轴CCO/ISA扭矩请求有效"
          }
        ],
        "forbiddenExpansions": {
          "activation_flag_logic": [
            "CCO",
            "ISA"
          ],
          "torque_calculation_logic": [
            "ABS",
            "EBD",
            "CCO",
            "ISA"
          ]
        }
      },
      "documentBlueprint": {
        "preferredSubsections": []
      }
    },
    "selectedProfiles": [
      {
        "key": "generic",
        "kind": "generic"
      },
      {
        "key": "software_requirement",
        "kind": "docType"
      },
      {
        "key": "embedded_vcu",
        "kind": "domain"
      },
      {
        "key": "充电管理",
        "kind": "module"
      }
    ]
  },
  "candidateSkillInventory": [],
  "referenceAssets": []
}
```
