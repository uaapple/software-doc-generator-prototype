# Writing Rules

These rules generalize reviewer feedback from prior Simulink software module descriptions.

## Scope

- Select document and analysis units with `module-boundary.md`. Write one section per `document_unit`; use child `analysis_unit` evidence only to explain the parent boundary.
- When an A/B/C naming hierarchy exists, default to functional A-level document units. B/C children do not become document sections unless the user requests them or the A parent is proven non-functional.
- Select modules by functional ownership, not by every visible first-level block. Include control calculation, demand/level calculation, state management, mode arbitration, protection/fault handling, timer/debounce/after-run behavior, and output-forming logic.
- Exclude non-functional structures from module sections unless the user explicitly asks for them: model information, function-definition-only areas, version/config displays, pure documentation, pure routing, signal reshaping, scopes/displays, and final wiring-only containers.
- Do not produce a full block-by-block explanation. Collapse mechanical Simulink implementation blocks into behavior.
- Keep exact internal identifiers in private evidence. In final prose, retain only direct document-unit Inports/Outports and explicitly approved public identifiers.
- Do not add Chinese meanings for identifiers unless the model itself provides them.
- Cover every boundary-observable behavior while keeping exhaustive internal coverage in the private ledger. Name direct boundary outputs explicitly; map internal states and child outputs to the owning boundary-output group without printing their names.

## Section Semantics

- `功能描述`: describe what the model/module does. Prefer model annotation, DocBlock, subsystem description, or other author-provided text. If no author text exists, summarize observable input-output purpose from the model directly. Do not include process disclaimers such as "模型未提供显式说明", "以下根据端口和结构归纳", or similar meta commentary in the final document.
- `模型总体结构`: use for the top-level functional architecture. Describe execution entry or period when model-authored, major inputs/outputs, meaningful first-level modules, and data flow. Do not label this top-level section as `实现方式`. Do not include evidence-collection or model-configuration metadata such as MATLAB/SATK load/update status, solver, code generation target, or model version unless the user explicitly asks for an audit section.
- `实现方式`: describe how direct document-unit inputs determine direct document-unit outputs. Internal states, child ports, parameters, tables, and enums may guide the private derivation but remain unnamed unless explicitly approved.
- `设计依据`: keep this section heading because the template contains it, but leave the body blank by default. Requirement IDs, DocBlock headings, and design basis text may guide interpretation internally; output them only when the user explicitly asks to fill design bases.

## Natural-Language Pseudo-Code Style

Use concise ordered prose. Good patterns:

- "当 `<condition_signal>` 有效时，输出 `<out_signal>` 取 `<value_or_signal>`；否则保持/复位/切换为 `<fallback>`。"
- "`<boundary_output>` 根据 `<boundary_axis_input_1>` 和 `<boundary_axis_input_2>` 经内部查表/插值处理得到。"
- "对 `<boundary_input>` 进行内部 turn on delay/turn off delay 处理，结果参与 `<boundary_output>` 判定。"
- "以下任一条件满足时，置位 `<flag>`：`<cond1>`、`<cond2>`、`<cond3>`。"
- "以下条件同时满足时，允许 `<output>` 输出：`<cond1>`、`<cond2>`。"
- "`<boundary_output>` 根据 `<boundary_enable_input>` 完成使能选择，并经内部限幅、延时或降级处理后输出。"
- "以上候选等级/候选值最终取 MAX/MIN 后形成 `<raw_output>`。"
- "`<boundary_trigger>` 与允许条件同时满足后进入 turn off delay，最终更新 `<boundary_output>`。"

The target style for complex modules is not a block explanation. It is signal-name-driven natural-language pseudo-code derived from an output-first behavior ledger:

```text
`<boundary_output>` 由保持逻辑维护：
• 当 `<boundary_input_set>` 有效时，`<boundary_output>` 置位。
• 当 `<boundary_input_reset>` 有效时，`<boundary_output>` 复位。

`<final_output>` 按以下分支选择：
• 当 `<boundary_input_1>` 满足条件时，取 `<boundary_input_2>`。
• 当 `<boundary_input_3>` 满足条件时，取边界允许的固定值。
• 以上分支均不成立时，取 <fallback_source_or_value>。

`<final_output>` 的内部记忆行为按边界信号描述：
• 当 `<boundary_update_trigger>` 有效时，按当前 `<boundary_source_input>` 更新输出记忆。
• 当 `<boundary_hold_input>` 有效时，`<final_output>` 保持上一周期值。
• 当 `<boundary_restore_trigger>` 有效时，`<final_output>` 恢复为先前保存值。
```

Use `a07-granularity-pattern.md` as the default density and layout authority. Evidence may be exhaustive, but polished prose should normally fit 4-8 behavior groups with 2-5 sub-points per group.

Boundary identifier discipline:

- In `实现方式`, use complete direct document-unit input/output names. Check every identifier against the hierarchy manifest allowlist.
- Keep exact internal signal, parameter, enum, constant, and table names in the private ledger, not polished prose.
- Do not translate model identifiers, abbreviations, signal fragments, or enum fragments into inferred Chinese business labels. Chinese text should describe logical relationships and actions, not replace identifiers.
- Do not replace a condition group with an invented Chinese label such as "`<business label>`条件", "`<business label>`路径", "`<business label>`逻辑", or "`<business label>`分支". Write exact allowlisted boundary inputs when they resolve the condition; otherwise describe only the supported boundary effect without exposing internal identifiers.
- If the model explicitly provides a Chinese term in a DocBlock, annotation, subsystem description, or mask text, it may be used in `功能描述`. Do not attach an internal controlling identifier in `实现方式`; project the behavior onto allowlisted boundary signals.
- Treat Chinese mode names, state names, condition names, value meanings, and functional labels as evidence-bearing claims. Use them only when the private ledger records a `model_authored_label_source` from an annotation, DocBlock, subsystem description, mask text, or enum definition. Otherwise use exact allowlisted boundary inputs/outputs plus supported operators or literal values; keep internal signal, parameter, enum, and table identifiers private. Apply the same constraint to behavior-group titles and to module `功能描述` text that is not copied from model-authored purpose text.
- Use action words such as "置位", "复位", "保持", "恢复", "选择", "输出", "保存", and "上一周期值". Use relationship words such as "同时有效", "任一满足", "无效", "成立", and "不成立".
- Avoid `&&`, `||`, and `!` in normal prose. Prefer "同时有效", "任一满足", and "无效". Comparisons such as `==`, `~=`, `>=`, `<=`, `>`, and `<` may be retained when they match the model expression and improve precision.

Complex-output formatting:

- When an output is driven by multiple set/reset, selection, hold, restore, or fallback branches, use an introductory sentence followed by level-one sub-points.
- Each sub-point must describe one complete condition/action pair, such as a set condition, reset condition, selection branch, hold branch, restore branch, or fallback branch.
- Do not use nested sub-points. If a branch is still too complex, split it into another short paragraph using exact allowlisted boundary names.
- Do not compress complex logic into one sentence that mixes several layers of intermediate signals and final outputs.
- Do not name an unlabeled group only as "normal path", "special path", "mode branch", or "related branch". Name the affected boundary output and use allowlisted controlling inputs directly when available.

Avoid full programming syntax unless the user asks for it. Do not write long nested `if/else` trees when grouped prose is clearer.

## Structure-to-Behavior Translation

The private ledger may contain Simulink block types and block instance names, but final `实现方式` must translate them into behavior:

- `RSLatch` or latch helper -> "置位", "复位", and "保持".
- `Switch` or `Multiport Switch` -> "当 `<boundary_condition_input>` 满足时，`<boundary_output>` 取 `<boundary_source_input_or_literal>`；否则采用下一优先级边界来源或默认行为".
- Cascaded selectors -> ordered level-one sub-points, ending with an explicit fallback.
- `Unit Delay`, `Memory`, or feedback -> "上一周期值", "保持", or "按 `<boundary_trigger>` 更新".
- `Delay` with a calibration or constant -> when the parameter is not allowlisted, write "经内部标定延时处理" without naming it.
- `EdgeRising`, `Detect Rise`, or rising-edge helper -> "`<boundary_input>` 上升沿有效时" when the edge source is boundary-visible.
- `EdgeFalling`, `Detect Fall`, or falling-edge helper -> "`<boundary_input>` 下降沿有效时" when the edge source is boundary-visible.
- `AND` -> "以下条件同时满足" or "`A` 与 `B` 同时有效".
- `OR` -> "以下任一条件满足" or "`A`、`B` 任一有效".
- `Goto/From`, Data Store, Bus, and Signal Copy -> resolve the carried behavior privately; name it only when the carried identifier is an allowlisted boundary port, and never describe the routing mechanism.
- Relational Operator or Compare To Constant -> preserve the exact operator and operand from model evidence, including `==`, `~=`, `>=`, `<=`, `>`, or `<`.

If this translation cannot be performed because a condition is unknown, return to evidence collection for that module. Do not fill the gap with block names or broad phrases.

Forbidden vague compression in `实现方式`:

- Do not use "等", "等等", "相关条件", "相关逻辑", "若干条件", "影响", or similar wording to hide omitted conditions, inputs, outputs, or triggers.
- Do not use "共同形成", "共同输出", "参与形成", "参与输出", "形成 ... 输出列表", "输出 ... 列表", or similar ports-only aggregation wording as `实现方式`. If several inputs feed an output, state the condition/action rule, priority, selection, latch, hold, restore, lookup, delay, or fallback behavior that makes the output take its value.
- If only the main path is being summarized, say "主要路径为" and still state the complete conditions for the outputs being described.
- For condition and trigger lists, name every relevant allowlisted boundary input explicitly. Internal contributors remain covered by the private ledger mapping and must not be printed merely for completeness.

Forbidden evidence-inventory output in `实现方式`:

- Do not print block-type counts such as "模块内部包含 逻辑判定 35 处".
- Do not print direct-source inventories such as "模块输出按直接来源分组形成".
- Do not print ports-only summaries such as "`<input_a>`、`<input_b>` 共同形成 `<output_a>`、`<output_b>`" or "`<input_a>`、`<input_b>` 共同输出 `<output_a>`、`<output_b>`".
- Do not use "`<block_instance_or_type>` 形成 `<signal>`" as a substitute for behavior.
- Do not use block instance names or routing mechanisms as implementation subjects, including names like `RSLatch1`, `Switch5`, `Unit Delay2`, `AND8`, `OR3`, `EdgeFalling1`, `EdgeRising2`, `Goto/From`, `Signal Copy`, or similar numbered/internal block names. Replace them with boundary-visible behavior and exact allowlisted port names.
- Do not use generic category sentences such as "保存类输出 ... 随对应子功能更新", "手动计算类输出 ... 表示...", or "自动计算类输出 ... 表示..." unless the same paragraph or sub-points also state the exact set/reset/selection/hold/restore conditions for those signals.
- The private ledger may record block types and source blocks, but final prose must translate them into observable conditions and actions.

## Output Coverage Contract

Before writing `实现方式`, use the module's private output coverage ledger from `model-evidence.md`.

### Model-Fact Ledger Contract

- Use the ledger as a structured private model-fact record. Store exact internal facts plus `visibility` and `affected_boundary_output`; do not prewrite polished prose in the ledger.
- Preserve model identifiers and literal facts only. Do not store inferred phrases such as "自动计算有效", "制冷/除湿候选", "正常候选", "远程分支", "特殊模式", "有效值", or "开启值" in place of the corresponding signals, operators, operands, enums, or constants.
- Store a Chinese or functional label only with `model_authored_label_source`. When no model-authored source exists, leave the label empty; downstream grouping and DOCX generation must not invent one.
- Merge ledger facts only when they produce the same action. Retain every exact condition while combining them, for example `HvacReq_stThermReq == 1` or `HvacReq_stThermReq == 2`; never replace the merged expression with an inferred value meaning.
- Generate DOCX prose by deterministic boundary projection of ledger facts. Replace internal subjects with their behavior on direct inputs/outputs; never expose an internal identifier merely to preserve traceability.
- Reject the ledger and return to evidence collection when an applicable condition signal, operator, operand, selected value/source, affected output, priority, or fallback is missing. Do not repair incomplete facts with natural-language interpretation.

- A module section is ready to write only when its own behavior ledger is complete. Do not write from a hand-authored module summary list, a static `MODULES` array, or an all-model synopsis that was not generated from the module's ledger.
- The observable boundary is the direct document-unit interface, not a child output or internal calculation. Trace final selection, hold, restore, feedback, delay, edge detection, and latch behavior internally, then state only its effect on direct boundary outputs.
- Classify ledger rows by visibility before prose. Exact names are mandatory only for allowlisted boundary ports. Every internal `material_state`, `supporting_state`, `mechanical_postprocess`, and child output must map privately to a boundary-output group.
- Every ledger row must map to one narrative behavior group or a justified `pure_routing` exclusion. This private mapping, not literal appearance of every signal name, is the completeness check.
- If a module exposes both a saved/intermediate value and a final value, describe the relationship: how the saved value is computed, and how the final value is selected, held, restored, overridden, or suppressed.
- If a module exposes a `Rem`/restore/remembered output, state the trigger or mode that freezes/restores it, the source value that updates it, and the final output it supports or mirrors.
- If model evidence shows a named internal `Rem`/restore/remembered signal with a unique update/hold/restore contract, classify it as internal `material_state`, set `must_mention=no`, and state only how the direct boundary output is held, updated, or restored.
- Only collapse an output as pure routing when the ledger explicitly marks it pure duplicate routing and the behavior carried by that signal has already been described.
- Keep the prose compact. The fix for missing coverage is to map the row to the correct behavior group, not to add one sentence or bullet per ledger row.
- When the ledger records multiple control signals or branch signals for one output, convert them into grouped sub-points instead of replacing them with inferred Chinese concepts.
- When a module has multiple externally meaningful outputs or one output has multiple behavior types, do not compress the entire module into one bullet per output if that hides set/reset/select/hold/update/restore/fallback details. Use separate introductory paragraphs and level-one sub-points for complex outputs.

## Implementation Layout Contract

Format complex `实现方式` sections as behavior-grouped, short natural-language pseudo-code. The target style is:

```text
`<boundary_output>` 由 `<behavior_role>` 维护：
• 置位条件为 ...
• 复位条件为 ...
• 当上述条件均不成立时，保持上一周期值。

`<final_output>` 按以下优先级选择：
• 当 ... 时，输出 ...
• 当 ... 时，输出 ...
```

- Use one introductory paragraph per observable behavior group. A group may own one output, a tightly coupled remembered/final pair, or a symmetric output family. Do not create a new group solely because another supporting signal or internal block exists.
- Use level-one sub-points after the introduction when an output has more than one condition/action branch. Do not write a long paragraph or one broad bullet for multiple branches.
- Each sub-point should carry one behavior only: set, reset, hold, update, restore, select, lookup, limit, rate limit, default/fallback, or final output. If a sentence needs to describe two of these behaviors, split it into two sub-points.
- Keep sub-points short enough to read as one condition/action. A sub-point that combines several semicolon-separated clauses, multiple table lookups, and final output selection is too dense; split it by behavior or by output.
- For lookup-heavy or calibration-heavy outputs, describe lookup, limiting/saturation, and rate behavior at the boundary without naming internal tables or calibration identifiers unless approved.
- Compactness must not be achieved by merging unrelated behavior into one bullet. Prefer several short sub-points over one long bullet that hides branch order.
- Short sub-points must not become mechanical over-splitting. If symmetric boundary outputs share the same behavior pattern, describe them as one group and list only allowlisted side-specific inputs and outputs.
- Do not expand every homologous output into a separate group solely to satisfy the "short bullet" rule. The target is readable condition/action prose, not one bullet per signal.
- Leave a blank line or visible paragraph break between output groups in Markdown/source text so the DOCX writer can preserve the reading rhythm.
- Target 4-8 behavior groups, 2-5 sub-points per group, and about 12-30 sub-points per module. If the draft exceeds this density, regroup shared cones, same-action conditions, symmetric outputs, and mechanical post-processing before accepting additional detail.

## Detail Ceiling

When a module contains many mechanical post-processing blocks, stop at observable behavior:

- For aggregation chains, write "候选值取最大值/最小值" or "以上候选等级最终取 MAX/MIN" instead of listing individual MinMax instances.
- For output finalization, write "最终输出 `<output>`" instead of naming final Switch, Signal Copy, Data Type Conversion, Bus routing, or Outport plumbing.
- For latch, memory, Unit Delay, and turn-on/turn-off delay networks, describe the boundary-visible state or delay behavior; name a parameter only if explicitly allowlisted, and do not enumerate state-holding blocks, intermediate switches, or counters.
- For OR/AND networks, write "以下任一条件满足" or "以下条件同时满足" instead of naming `OR1`, `AND3`, or similar block instances.
- For edge-triggered after-run, debounce, hold, or timer logic, write the allowlisted boundary trigger, enabling inputs, observable delay/hold behavior, and boundary output; name an internal delay parameter only when explicitly approved.
- For edge-triggered memory or restore logic, preserve the behavior when it changes an output. Write the boundary-visible entry/exit trigger, hold/update/restore condition, and affected boundary output; keep the remembered internal signal private.
- For memory/restore behavior, use one compact sentence or level-one sub-points that cover the allowlisted boundary trigger, update/hold/restore behavior, and affected boundary output. Example: "`<boundary_mode_input>` 有效时，`<boundary_output>` 保持上一周期值；`<boundary_restore_input>` 有效时，`<boundary_output>` 恢复为先前保存值。"
- For falling/exit delay behavior, write "`<boundary_input>` 下降时经内部延时处理" or "退出时保持/延时" when that captures observable behavior; do not name an internal parameter.
- For turn-off-delay helper subsystems, write "进入 turn off delay" and name the hold/delay parameter only when it is explicitly allowlisted. Do not expand the internal helper block chain unless it changes observable behavior.
- For final Boolean gating that only repeats already-described enable or key-on state, fold it into the condition wording instead of adding another implementation sentence. This reduction does not apply when the final gating selects a remembered/restored value or changes the output during mode entry/exit.
- For lookup and prelookup, preserve table names and breakpoints in private evidence. In prose, name only allowlisted boundary axes and outputs; describe the operation as lookup/interpolation without exposing internal tables.

## Detail to Preserve

Preserve these when present:

- output assignment and fallback/default behavior
- enable/disable gating, mode switching, manual/automatic branches
- fault, protection, degradation, synchronization, latch, debounce, hysteresis, and edge-detection behavior
- mode entry/exit memory and restore behavior, especially `EdgeRising`/`EdgeFalling` plus `Unit Delay`/`Memory`/`RSLatch` feeding final output selection or auxiliary outputs named like `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*`
- model-named mode/control gates that affect a module output when they hold, restore, suppress, or override an output. Preserve exact controlling identifiers in prose only when they are allowlisted boundary inputs; otherwise preserve them only in private evidence.
- lookup tables, breakpoints, and interpolation roles in private evidence; only boundary-visible axes and outputs in prose
- Min/Max, saturation, rate limit, delay, memory, unit delay, and initial value effects when they change externally observable outputs, expressed at behavior level
- raw/intermediate/final output relationship when the model exposes it
- calibration parameters and constants in private evidence; publish them only when explicitly allowlisted

## Detail to Reduce

Reduce these unless needed for traceability:

- internal block instance names such as `Switch2`, `Switch3`, `Unit Delay1`, `AND1`, `OR2`, `Signal Copy`, `Data Type Conversion`
- routing infrastructure such as From/Goto, Bus Selector, Bus Creator, Terminator, Ground, and Signal Specification
- repeated numbered lookup/prelookup/interpolation block names; describe only the boundary-visible lookup/interpolation behavior instead
- final plumbing after the behavior is already clear, such as "再与 NOT(...) 组合", output Signal Copy, final Switch selection, or Outport wiring
- pure layout or display elements

Replacement examples:

- `MaxMin` or MinMax block -> "取最大值/最小值"
- `Logical Operator` with OR -> "以下任一条件满足"
- `Logical Operator` with AND -> "以下条件同时满足"
- `Unit Delay` or `Memory` -> "上一周期值/状态保持"
- `Delay` with internal calibration -> "经内部标定延时处理"; name the parameter only when allowlisted
- `Switch` -> "根据 `<condition>` 在 `<true_value>` 与 `<false_value>` 间选择"
- `Prelookup` + `Interpolation` -> "根据 `<boundary_axis_input>` 经内部预查找和插值处理得到 `<boundary_output>`"
- final output switch/copy chain -> "最终输出 `<output>`"
- Internal edge/memory plus final selection -> "`<boundary_trigger>` 有效时保存当前 `<boundary_source>`；`<boundary_restore_input>` 有效时，`<boundary_output>` 恢复为先前保存值。"
- Named internal state feeding a final selector -> keep the state name private and write "`<boundary_update_trigger>` 有效时更新输出记忆；`<boundary_hold_input>` 有效时，`<boundary_output>` 保持上一周期值。"

Sub-point example:

```text
`<saved_output>` 由锁存逻辑生成：
• 当 `<set_enable>` 与 `<set_condition>` 同时有效，或 `<manual_set>` 有效且 `<selector> == <set_value>` 时，置位 `<saved_output>`。
• 当 `<reset_enable>` 与 `<reset_condition>` 同时有效，或 `<manual_reset>` 有效且 `<selector> == <reset_value>` 时，复位 `<saved_output>`。

当 `<auto_flag>` 有效时，`<select_result>` 取 `<condition_a> == <value_a>` 与 `<condition_b> == <value_b>` 任一满足的结果；当 `<auto_flag>` 无效时，按以下顺序形成 `<select_result>`：
• `<hold_trigger>` 的上升沿置位保持结果。
• `<mode_signal> == <mode_enum>` 时取 `TRUE`。
• `<manual_enable>` 有效时取 `<saved_output>`。
• 以上分支均不成立时取 `<fallback_value>`。
```

## Output Self-Check

Before finalizing Markdown or DOCX, check and revise the draft:

- `模型总体结构` contains only functional architecture, major inputs/outputs, meaningful modules, and data flow. Remove MATLAB/MCP/SATK load status, update success, solver, target file, model version, and warnings unless the user requested an audit.
- Every `设计依据` section body is blank by default. Remove requirement IDs, DocBlock headings, and unit-design references unless the user explicitly requested design bases.
- No final section contains process disclaimers such as "模型未提供显式说明", "以下根据端口和结构归纳", "以下根据结构归纳", or "根据端口和结构归纳".
- Module sections exactly cover hierarchy-manifest `document_unit`s, not B/C analysis units, model-info, documentation-only, pure routing, display, or configuration structures.
- Each document unit's direct outputs are covered by exact name. Internal `material_state` and supporting rows are covered through their mapped boundary-output group without exact-name leakage.
- Compare the private ledger and narrative plan against the draft. Fail if a `must_mention` row is absent or any non-routing row lacks a `covered_ledger_items` mapping.
- For internal `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*` signals, require a private mapping and require their exact names to be absent from prose.
- `实现方式` uses allowlisted boundary input/output names for traceability; internal signal, parameter, table, enum, state, and block identifiers remain private.
- `实现方式` does not replace hidden identifiers with inferred Chinese business labels. Use an identifier only when it is on the document-unit allowlist.
- Every Chinese mode, state, condition, or value label in `实现方式`, behavior-group titles, and inferred module-purpose text has a recorded `model_authored_label_source`; otherwise replace it with supported boundary-level wording and allowlisted identifiers, never hidden model identifiers.
- Every Relational Operator and Compare To Constant that materially affects an output retains its exact operator and operand in the model-fact ledger and the owning behavior group. Output-name coverage alone does not satisfy this check.
- `实现方式` does not contain abstract condition labels such as "`...条件`", "`...路径`", "`...逻辑`", or "`...分支`" in place of available boundary identifiers. Rewrite them using exact allowlisted inputs; do not expose internal signals, parameters, or enums.
- `实现方式` does not contain "等条件", "等信号", "等逻辑", "相关条件", "相关逻辑", "若干条件", or vague "影响" wording that suggests omitted logic.
- `实现方式` does not contain ports-only aggregation wording such as "共同形成", "共同输出", "参与形成", "参与输出", "形成 ... 输出列表", or "输出 ... 列表". If such wording appears, return to evidence collection for that module and replace it with condition/action behavior.
- `实现方式` does not contain evidence-inventory phrases such as "模块内部包含", "模块输出按直接来源分组形成", "`RSLatch` 形成", "`Signal Copy` 形成", "保存类输出", "手动计算类输出", or "自动计算类输出" unless immediately followed by exact branch conditions.
- `实现方式` does not contain block instance or routing-mechanism prose such as `RSLatch1`, `Switch5`, `Unit Delay2`, `AND8`, `OR3`, `EdgeFalling1`, `EdgeRising2`, `Goto/From`, or "`<block>` 生成/恢复/决定 `<signal>`". If such wording appears, translate it to set/reset/select/hold/update/restore/fallback behavior.
- Complex outputs with set/reset, selection, hold, restore, or fallback branches are split into level-one sub-points or short separated sentences. They are not compressed into a single mixed sentence.
- A selected module may use a small set of behavior groups only when every group contains complete set/reset/select/hold/update/restore/fallback fields and all ledger rows map to those groups. Generic high-level summaries without condition/action behavior remain invalid.
- `实现方式` bullets are not overloaded. A bullet that combines lookup, hysteresis, limiting, rate limiting, and output selection should be split by behavior or by output before DOCX generation.
- Complex modules show output-group rhythm: an introductory sentence naming the signal/role, followed by short level-one sub-points for conditions/actions, with a paragraph break before the next output group.
- Complex modules are not over-fragmented. Symmetric outputs may share one group when each direct boundary output remains visible and internal identifiers remain hidden.
- The density gate passes: normally 4-8 behavior groups and 12-30 sub-points; exceptionally complex modules use no more than 10 groups or 40 sub-points after a documented private regrouping pass.
- Reject mechanical repetition when three or more consecutive bullets share the same sentence template and differ only by a signal suffix, profile index, side, or channel.
- Normal prose avoids heavy `&&`, `||`, and `!` usage. Use natural-language relationships unless the user explicitly asks for expression-style output.
- Repeated `Switch`, `AND`, `OR`, `MinMax`, `Signal Copy`, `Data Type Conversion`, `Unit Delay`, `Memory`, `From/Goto`, and Bus routing names have been reduced to behavior-level wording where possible.
- For each complex output, at least one of the behavior words "置位", "复位", "取", "保持", "更新", "恢复", "延时", or "fallback/default/默认" should appear as applicable. If a paragraph names outputs but has no behavior action, it is likely an evidence summary and must be rewritten.
- Before reducing final output plumbing, inspect whether `EdgeRising`, `EdgeFalling`, `Detect Change`, `Unit Delay`, `Memory`, `RSLatch`, feedback into `Switch`/`Multiport Switch`, or signals named like `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*` select a remembered/restored output. If so, describe the boundary-visible trigger, hold/update/restore behavior, and affected output while keeping remembered internal signals unnamed.
- Check whether model-named mode/control inputs materially hold, restore, suppress, or override an output. Add behavior-level wording using their exact identifiers only when they are direct allowlisted inputs.
- Key observable behavior remains present: boundary-visible conditions and thresholds, lookup/interpolation effects, fallback/defaults, enable gating, delay/hold/latch behavior, and final output relationships. Internal table and calibration names remain private.
- After generating DOCX, extract the final DOCX text and run this self-check again. The final DOCX must not contain old draft text, block-instance wording, process disclaimers, or ports-only aggregation that was absent from the checked Markdown/source draft.

## Tone and Evidence Discipline

- Use neutral engineering language.
- State uncertainty only when it is necessary to explain a genuine unresolved limitation, and keep that note outside polished module prose when possible. Do not use boilerplate disclaimers for missing DocBlocks.
- Do not claim safety, diagnostic, or calibration intent unless model text or names explicitly support it.
- Keep paragraphs compact, but do not use compactness as a reason to merge unrelated branches into a dense bullet. A module should usually fit in a few short output groups, and each group should contain short condition/action paragraphs or sub-points.
