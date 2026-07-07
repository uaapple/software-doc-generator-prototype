# Writing Rules

These rules generalize reviewer feedback from prior Simulink software module descriptions.

## Scope

- Write at module level. A module is usually a named first-level subsystem or another subsystem with clear functional ownership.
- Select modules by functional ownership, not by every visible first-level block. Include control calculation, demand/level calculation, state management, mode arbitration, protection/fault handling, timer/debounce/after-run behavior, and output-forming logic.
- Exclude non-functional structures from module sections unless the user explicitly asks for them: model information, function-definition-only areas, version/config displays, pure documentation, pure routing, signal reshaping, scopes/displays, and final wiring-only containers.
- Do not produce a full block-by-block explanation. Collapse mechanical Simulink implementation blocks into behavior.
- Keep traceability by retaining exact model identifiers: signal names, parameter names, table names, enum names, constants, and output names.
- Do not add Chinese meanings for identifiers unless the model itself provides them.
- Cover every externally meaningful module output and named output-near state signal at least once. This includes final outputs, exported signals, named internal lines feeding output selection/feedback/delay/latch/restore paths, auxiliary outputs such as `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, `*EEW*`, raw/final pairs, and mode restore outputs. Collapse pure duplicate routing only with evidence; do not omit a state-holding, output-shaping, or mode-restore signal just because the main calculation output was already described.

## Section Semantics

- `功能描述`: describe what the model/module does. Prefer model annotation, DocBlock, subsystem description, or other author-provided text. If no author text exists, summarize observable input-output purpose from the model and say it is inferred from model structure.
- `模型总体结构`: use for the top-level functional architecture. Describe execution entry or period when model-authored, major inputs/outputs, meaningful first-level modules, and data flow. Do not label this top-level section as `实现方式`. Do not include evidence-collection or model-configuration metadata such as MATLAB/SATK load/update status, solver, code generation target, or model version unless the user explicitly asks for an audit section.
- `实现方式`: describe how the module computes outputs using signal-identifier-driven, ordered natural-language pseudo-code. Conditions, modes, branches, state flags, parameters, enum values, and output selections must prefer exact model identifiers over inferred business labels.
- `设计依据`: keep this section heading because the template contains it, but leave the body blank by default. Requirement IDs, DocBlock headings, and design basis text may guide interpretation internally; output them only when the user explicitly asks to fill design bases.

## Natural-Language Pseudo-Code Style

Use concise ordered prose. Good patterns:

- "当 `<condition_signal>` 有效时，输出 `<out_signal>` 取 `<value_or_signal>`；否则保持/复位/切换为 `<fallback>`。"
- "`<lookup_output>` 由 `<table_name>` 根据 `<axis_signal_1>` 和 `<axis_signal_2>` 查表得到。"
- "对 `<signal>` 按 `<param>` 进行 turn on delay/turn off delay 处理，延时结果参与 `<out_signal>` 判定。"
- "以下任一条件满足时，置位 `<flag>`：`<cond1>`、`<cond2>`、`<cond3>`。"
- "以下条件同时满足时，允许 `<output>` 输出：`<cond1>`、`<cond2>`。"
- "`<raw_output>` 先由核心逻辑计算，再经 `<enable_signal>`、限幅、延时或故障降级处理形成 `<final_output>`。"
- "以上候选等级/候选值最终取 MAX/MIN 后形成 `<raw_output>`。"
- "`<trigger>` 与条件同时满足后进入 turn off delay，保持时间由 `<time_param>` 决定，最终输出 `<flag>`。"

Identifier discipline:

- In `实现方式`, use complete model signal names, parameter names, enum names, constants, table names, and output names for conditions and branch descriptions.
- Do not translate model identifiers, abbreviations, signal fragments, or enum fragments into inferred Chinese business labels. Chinese text should describe logical relationships and actions, not replace identifiers.
- Do not replace a condition group with a Chinese label such as "`<business label>`条件", "`<business label>`路径", "`<business label>`逻辑", or "`<business label>`分支" when the model provides exact signals, parameters, enum names, or constants for that group. Write the identifiers explicitly.
- If the model explicitly provides a Chinese term in a DocBlock, annotation, subsystem description, or mask text, it may be used in `功能描述`. In `实现方式`, still keep the controlling signal/parameter/enum identifier beside the term when it affects logic.
- Use action words such as "置位", "复位", "保持", "恢复", "选择", "输出", "保存", and "上一周期值". Use relationship words such as "同时有效", "任一满足", "无效", "成立", and "不成立".
- Avoid `&&`, `||`, and `!` in normal prose. Prefer "同时有效", "任一满足", and "无效". Comparisons such as `==`, `~=`, `>=`, `<=`, `>`, and `<` may be retained when they match the model expression and improve precision.

Complex-output formatting:

- When an output is driven by multiple set/reset, selection, hold, restore, or fallback branches, use an introductory sentence followed by level-one sub-points.
- Each sub-point must describe one complete condition/action pair, such as a set condition, reset condition, selection branch, hold branch, restore branch, or fallback branch.
- Do not use nested sub-points. If a branch is still too complex, split it into another short paragraph with exact signal names.
- Do not compress complex logic into one sentence that mixes several layers of intermediate signals and final outputs.

Avoid full programming syntax unless the user asks for it. Do not write long nested `if/else` trees when grouped prose is clearer.

Forbidden vague compression in `实现方式`:

- Do not use "等", "等等", "相关条件", "相关逻辑", "若干条件", "影响", or similar wording to hide omitted conditions, inputs, outputs, or triggers.
- If only the main path is being summarized, say "主要路径为" and still state the complete conditions for the outputs being described.
- For condition lists, input lists, output lists, and trigger lists, every item that affects the described output must be named explicitly or covered by an explicitly named grouped role from the evidence ledger.

Forbidden evidence-inventory output in `实现方式`:

- Do not print block-type counts such as "模块内部包含 逻辑判定 35 处".
- Do not print direct-source inventories such as "模块输出按直接来源分组形成".
- Do not use "`<block_instance_or_type>` 形成 `<signal>`" as a substitute for behavior.
- Do not use generic category sentences such as "保存类输出 ... 随对应子功能更新", "手动计算类输出 ... 表示...", or "自动计算类输出 ... 表示..." unless the same paragraph or sub-points also state the exact set/reset/selection/hold/restore conditions for those signals.
- The private ledger may record block types and source blocks, but final prose must translate them into observable conditions and actions.

## Output Coverage Contract

Before writing `实现方式`, use the module's private output coverage ledger from `model-evidence.md`.

- The observable boundary is the module output, not the first meaningful internal calculation. If the right side or output-near region contains final selection, hold, restore, feedback, Unit Delay/Memory/Delay, edge detection, latch, or special-mode gating, write the resulting behavior.
- Every non-routing ledger output must be represented in the module prose by exact signal name or by an explicit grouped role. For example, final output and `Rem`/restore output may share one compact sentence when their update/hold behavior is coupled.
- If a module exposes both a saved/intermediate value and a final value, describe the relationship: how the saved value is computed, and how the final value is selected, held, restored, overridden, or suppressed.
- If a module exposes a `Rem`/restore/remembered output, state the trigger or mode that freezes/restores it, the source value that updates it, and the final output it supports or mirrors.
- If model evidence shows a named internal `Rem`/restore/remembered signal in the final output cone, mention that exact signal name in `实现方式` even when it is not an Outport. State how it is updated or held and which final output uses it.
- Only collapse an output as pure routing when the ledger explicitly marks it pure duplicate routing and the behavior carried by that signal has already been described.
- Keep the prose compact. The fix for missing outputs is not a block list; it is one behavior-level sentence per missing output role.
- When the ledger records multiple control signals or branch signals for one output, convert them into grouped sub-points instead of replacing them with inferred Chinese concepts.

## Detail Ceiling

When a module contains many mechanical post-processing blocks, stop at observable behavior:

- For aggregation chains, write "候选值取最大值/最小值" or "以上候选等级最终取 MAX/MIN" instead of listing individual MinMax instances.
- For output finalization, write "最终输出 `<output>`" instead of naming final Switch, Signal Copy, Data Type Conversion, Bus routing, or Outport plumbing.
- For latch, memory, Unit Delay, and turn-on/turn-off delay networks, describe the state behavior and key parameter only; do not enumerate every state-holding block, intermediate switch, or counter.
- For OR/AND networks, write "以下任一条件满足" or "以下条件同时满足" instead of naming `OR1`, `AND3`, or similar block instances.
- For edge-triggered after-run, debounce, hold, or timer logic, write the trigger, enabling conditions, delay/hold parameter, and final output; omit final output gating that only restates the already-described trigger or mode.
- For edge-triggered memory or restore logic, preserve the behavior when it changes an output. Write the mode entry/exit trigger, remembered signal, restore condition, and affected output; do not reduce it to final Switch or Unit Delay plumbing.
- For memory/restore outputs, use one compact behavior sentence or level-one sub-points that cover: the remembered signal, the model-named mode/trigger signal that freezes/restores it, the update condition, and the affected output. Example: "模块同时维护 `<rem_signal>`：当 `<mode_signal>` 有效且 `<manual_trigger>` 无效时保持上一周期值；当 `<manual_trigger>` 有效或 `<mode_signal>` 退出时按当前 `<source_signal>` 更新，用于后续恢复 `<affected_output>`。"
- For falling/exit delay behavior, write "下降时按 `<param>` 延时处理" or "退出时按 `<param>` 保持/延时" when that captures the observable behavior.
- For turn-off-delay helper subsystems, write "进入 turn off delay" and name the hold/delay parameter when present. Do not expand the internal helper block chain unless it changes observable behavior.
- For final Boolean gating that only repeats already-described enable or key-on state, fold it into the condition wording instead of adding another implementation sentence. This reduction does not apply when the final gating selects a remembered/restored value or changes the output during mode entry/exit.
- For lookup and prelookup, preserve table names, breakpoint parameters, and input signals. Use the block type name `Prelookup` only when helpful; do not retain numbered instance names such as `Prelookup2` unless no other identifier exists.

## Detail to Preserve

Preserve these when present:

- output assignment and fallback/default behavior
- enable/disable gating, mode switching, manual/automatic branches
- fault, protection, degradation, synchronization, latch, debounce, hysteresis, and edge-detection behavior
- mode entry/exit memory and restore behavior, especially `EdgeRising`/`EdgeFalling` plus `Unit Delay`/`Memory`/`RSLatch` feeding final output selection or auxiliary outputs named like `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*`
- model-named mode/control gates that affect a module output when they hold, restore, suppress, or override an output. Preserve the exact controlling identifiers instead of translating identifier fragments into inferred business labels.
- lookup table names, breakpoint inputs, interpolation/prelookup roles, and selected axes
- Min/Max, saturation, rate limit, delay, memory, unit delay, and initial value effects when they change externally observable outputs, expressed at behavior level
- raw/intermediate/final output relationship when the model exposes it
- calibration parameters and constants that directly affect conditions or outputs

## Detail to Reduce

Reduce these unless needed for traceability:

- internal block instance names such as `Switch2`, `Switch3`, `Unit Delay1`, `AND1`, `OR2`, `Signal Copy`, `Data Type Conversion`
- routing infrastructure such as From/Goto, Bus Selector, Bus Creator, Terminator, Ground, and Signal Specification
- repeated numbered lookup/prelookup/interpolation block names; describe the table or prelookup operation instead
- final plumbing after the behavior is already clear, such as "再与 NOT(...) 组合", output Signal Copy, final Switch selection, or Outport wiring
- pure layout or display elements

Replacement examples:

- `MaxMin` or MinMax block -> "取最大值/最小值"
- `Logical Operator` with OR -> "以下任一条件满足"
- `Logical Operator` with AND -> "以下条件同时满足"
- `Unit Delay` or `Memory` -> "上一周期值/状态保持"
- `Delay` with calibration -> "按 `<param>` 延时"
- `Switch` -> "根据 `<condition>` 在 `<true_value>` 与 `<false_value>` 间选择"
- `Prelookup` + `Interpolation` -> "根据 `<axis>` 预查找并插值得到 `<table_output>`"
- final output switch/copy chain -> "最终输出 `<output>`"
- `EdgeRising`/`EdgeFalling` + `Unit Delay`/`Memory` + final Switch selecting a remembered value -> "进入 `<mode>` 时记忆 `<signal>`；退出 `<mode>` 且 `<condition>` 满足时恢复为记忆值 `<remembered_signal>`；否则按正常输出选择。"
- Named output-near state signal feeding a final selector -> "模块同时维护 `<state_signal>`：当 `<update_trigger>` 有效时按 `<source_signal>` 更新；当 `<hold_condition>` 成立时保持上一周期 `<state_signal>`；`<final_output>` 在 `<restore_condition>` 成立时取 `<state_signal>`。"

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
- Module sections cover selected functional modules, not model-info, documentation-only, pure routing, display, or configuration structures.
- Each selected module's externally meaningful outputs are covered at least once. Check Outports/exported signals plus outputs named like `*Rem*`, `*Old*`, `*Pre*`, `*Save*`, `*EEW*`, raw/final pairs, and display/status outputs. If an output is intentionally collapsed as duplicate routing, ensure the behavior it carries is already described.
- Compare the private output coverage ledger against the draft. If any `must mention` output is missing, revise before DOCX generation. This check must include output-near/right-side cones, not only the left-to-right main algorithm path.
- If the evidence for a selected module contains named output-near state signals such as `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*`, search the draft for those exact names. Missing exact names are a self-check failure unless the ledger marks the signal as pure duplicate routing with a reason.
- `实现方式` uses signal/parameter/table/output names for traceability but avoids block-instance enumeration.
- `实现方式` does not replace model identifiers with inferred Chinese business labels. If any branch can be described by a signal/parameter/enum name, use that identifier.
- `实现方式` does not contain abstract condition labels such as "`...条件`", "`...路径`", "`...逻辑`", or "`...分支`" in place of available model identifiers. Rewrite them using the exact signal/parameter/enum names.
- `实现方式` does not contain "等条件", "等信号", "等逻辑", "相关条件", "相关逻辑", "若干条件", or vague "影响" wording that suggests omitted logic.
- `实现方式` does not contain evidence-inventory phrases such as "模块内部包含", "模块输出按直接来源分组形成", "`RSLatch` 形成", "`Signal Copy` 形成", "保存类输出", "手动计算类输出", or "自动计算类输出" unless immediately followed by exact branch conditions.
- Complex outputs with set/reset, selection, hold, restore, or fallback branches are split into level-one sub-points or short separated sentences. They are not compressed into a single mixed sentence.
- Normal prose avoids heavy `&&`, `||`, and `!` usage. Use natural-language relationships unless the user explicitly asks for expression-style output.
- Repeated `Switch`, `AND`, `OR`, `MinMax`, `Signal Copy`, `Data Type Conversion`, `Unit Delay`, `Memory`, `From/Goto`, and Bus routing names have been reduced to behavior-level wording where possible.
- Before reducing final output plumbing, inspect whether `EdgeRising`, `EdgeFalling`, `Detect Change`, `Unit Delay`, `Memory`, `RSLatch`, feedback into `Switch`/`Multiport Switch`, or signals named like `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*` select a remembered/restored output. If so, describe that behavior, including the mode/trigger, hold/update condition, remembered signal, and affected output.
- Check whether model-named mode/control inputs appear only as names. If they materially hold, restore, suppress, or override an output, add behavior-level wording in the owning module using the exact controlling identifiers.
- Key observable behavior remains present: conditions, thresholds, lookup tables, fallback/defaults, enable gating, delay/hold/latch behavior, and final output relationship.

## Tone and Evidence Discipline

- Use neutral engineering language.
- State uncertainty plainly: "模型未提供显式说明，以下根据结构归纳。"
- Do not claim safety, diagnostic, or calibration intent unless model text or names explicitly support it.
- Keep paragraphs compact; one module should usually fit in a few short paragraphs or bullets.
