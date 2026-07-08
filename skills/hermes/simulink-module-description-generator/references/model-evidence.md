# Model Evidence Collection

Use a task-scoped MATLAB MCP/SATK session as the primary evidence path. The goal is to gather enough model-authored information to write module-level behavior without turning the document into a block listing or repeatedly paying MATLAB startup/model-load cost.

## Quality Priority

- Complete module evidence is mandatory for every selected functional module. Performance optimization may reduce repeated MATLAB launches, repeated model loads, and duplicate reads; it must not reduce the set of modules, outputs, or output-near cones that are analyzed.
- Do not stop at top-level ports, subsystem inports/outports, module names, or a single manually reviewed module. A document where one module has detailed branch logic and other selected modules only have input/output summaries is a failed generation.
- For models with multiple functional subsystems, use split processing: build a lightweight whole-model index first, then deep-read each selected subsystem in the same MATLAB session and draft/cache that subsystem's section after its evidence is complete. A broad all-model scan may identify boundaries, but it is not sufficient evidence for any module section.
- If evidence for a selected module is not sufficient to write condition/action implementation prose, continue reading that module in the same MATLAB session. If MCP/SATK cannot expose a specific item, use bounded `.slx` XML or other model-derived task files as supplement for that item.
- If a selected module still cannot be resolved after the available model-derived evidence paths are attempted, report the unresolved module and limitation instead of writing vague final prose.

## Session Lifecycle and Performance Contract

- Start or reuse one task-owned MATLAB MCP/SATK session for a generation task. Keep it alive until evidence collection, drafting, and DOCX validation are complete.
- Run workspace setup, addon/project initialization, model load, and optional model update in that same session. Do not launch a fresh `matlab -batch` process for each collector pass, selected subsystem, or fallback probe.
- Keep the target model loaded while reading overview, hierarchy, module internals, output cones, parameters, DocBlocks, and data dictionaries. Avoid open/close loops around individual modules.
- Prefer direct MCP/SATK tools and MATLAB snippets executed through the open session. Helper functions in `scripts/` may be called from that session, but they are not the default reason to spawn a separate MATLAB process.
- If `scripts/satk_eval.py` is needed as a bridge to MCP, use the default `SATK_MATLAB_SESSION_MODE=auto`. In `auto` mode, the MCP server should attach to an existing MATLAB session when one is available and start one when none is available. Do not force `new` for repeated evidence reads.
- Use `model_scan` or fast scan as a navigation index when available, then perform targeted deep reads in the same session. Do not probe scanner signatures repeatedly; try the supported call shape once and continue with normal MCP/SATK reads if unavailable.
- Batch related reads by model area or by selected module. Avoid one tool/process call per signal or block when the same evidence can be retrieved in one module read, but do not use batching as a reason to skip module internals or output cones.
- If a whole-model collector becomes slow, times out, or produces an oversized JSON payload, split the task by selected subsystem. The acceptable fallback is smaller per-subsystem MCP/SATK reads, not a downgrade to top-level ports, static names, or generic module summaries.
- Compile or update the model at most once unless a specific later read proves compiled data is required and the model state has changed.
- Use static `.slx` XML only as a bounded fallback for a concrete missing item after MCP/SATK evidence was attempted. Do not switch the whole task to XML probing as the normal path.
- If a deep output cone still cannot be resolved within budget, record the unresolved signal and limitation, then continue; do not keep restarting MATLAB or cycling through full collectors.
- At task end, close only task-owned models and remove task-specific paths when safe. Do not run `clear all` or `bdclose all` in a shared/user MATLAB session.
- Treat MATLAB session reuse as task-scoped. Do not run two document-generation tasks concurrently in the same MATLAB session unless the platform explicitly serializes them.

## Workspace and Addon Handling

- Treat the task workspace as authoritative. The platform/Hermes Agent/UI may have copied selected addon files into the workspace; use those files directly.
- Do not assume fixed addon folder names. Search for `.prj`, `.m`, `.slx`, `.sldd`, libraries, data dictionaries, and init scripts under the workspace.
- Add project/addon paths before opening the target model. Run project/addon initialization before model-level init scripts when both exist.
- Prefer `scripts/setup_module_doc_support.m` for setup. It adds useful workspace paths, restores common MATLAB MCP/SATK paths, opens projects, and runs discovered or supplied init scripts.
- Auto-generated data/init scripts such as `*_dd.m` commonly contain standalone `clear` or `clearvars`. Remove those commands from the task-workspace copy before running the script so session variables, addon paths, and model-root variables survive initialization. Do not edit the user's original external addon source when a task-local copy is available.
- Run setup once in the task MATLAB session. If setup needs to be retried after an error, fix the missing path/init cause first rather than restarting MATLAB repeatedly.
- If a dependency is missing, first check whether an addon/setup script in the workspace was skipped. Do not immediately treat the model as unreadable.

## Optional Fast Model Scan

When the installed SATK environment exposes a fast scanner such as `model_scan`, use it before deep reads to create a compact model index. Treat scan results as navigation evidence, not as the full design evidence.

Use the scan to identify:

- top-level ports, immediate child subsystems, and high-level hierarchy
- annotations, DocBlocks, model-info blocks, and documentation-only areas
- major block categories such as Lookup, Prelookup, Stateflow, MinMax, Switch, Delay, Memory, Data Store, Bus, From/Goto, and routing blocks
- candidate functional modules and obvious structures to skip

Do not use scan output alone for final implementation claims. After candidate module selection, deep-read the selected modules with MATLAB/MCP/SATK APIs to resolve parameters, masks, data dictionaries, compiled properties, lookup tables, Stateflow logic, and DocBlock payloads.

If `model_scan` is unavailable, continue with the MCP/SATK read pattern below. Do not fail the task only because the fast scan path is missing.

## MCP/SATK Read Pattern

Use whichever MCP/SATK tools are available in the current environment. Useful reads include:

- model overview and compile/load status
- top-level ports, sample times, data types, dimensions, and buses
- subsystem hierarchy, especially enabled/triggered/function-call/atomic subsystems
- annotations, DocBlocks, masked block prompts/help, and subsystem descriptions
- inports/outports, Goto/From tags, Data Store, Merge, Bus Creator/Selector, Switch, Multiport Switch, Relay, Saturation, MinMax, Lookup Table, Prelookup, Interpolation, Unit Delay, Memory, Delay, edge-detection helpers, Rate Transition, and Stateflow charts
- tunable parameters, calibration constants, lookup table axes, breakpoints, initial values, and saturation limits
- library links and referenced models

Recommended sequence:

1. Start or reuse the task MATLAB MCP/SATK session.
2. Load project/addons and target model once in that session.
3. Run a fast scan if available, or otherwise read the top-level overview and hierarchy.
4. Read the top-level annotations/DocBlocks and identify model-authored purpose text.
5. Enumerate immediate child subsystems and select meaningful functional modules before doing expensive deep reads.
6. For each selected module, read its local ports, annotations, DocBlocks, child blocks, parameters, state elements, lookup tables, downstream outputs, and output-near cone. Complete that module's output coverage ledger and draft/cache its section before proceeding when this keeps evidence bounded. This applies to every selected module, not only to the visually complex or user-mentioned modules.
7. Resolve parameter values through data dictionaries, base workspace, model workspace, masks, and referenced scripts.
8. Compile or update the model only when needed for resolved types/dimensions/sample times; record any compile failure as a limitation.

When reading a selected module, inspect the final output cone before drafting. Do not stop at the main algorithm DocBlock, the visually dominant left-to-right calculation path, or a signal that merely looks like the module's main result. If downstream logic contains edge detectors, Unit Delay/Memory, latches, restore/rem/remain signals, Switch/Multiport Switch selections, feedback lines, or special-mode gates that can change an externally visible output, capture those as behavior-level evidence. A named internal line in this output-near cone is evidence-bearing when it feeds a final selector, feedback path, delay, latch, or restore path; include it in the ledger even when it is not an Outport.

## Output Coverage Ledger

Before drafting each module, build a private output coverage ledger. The ledger is evidence for the writer and self-check; it does not need to be printed in the final document.

The ledger is output-first. Do not start from input lists and guess what they influence. Start from the output or output-near named state signal, then trace backward until the behavior can be written as conditions and actions.

1. Enumerate the module's externally meaningful outputs and named output-near state signals: Outport blocks, top-level exported signals, Goto/Data Store outputs that leave the module, EEW/save outputs, display/status outputs, auxiliary restore/remain outputs, and named internal lines that feed final output selection, feedback, delay, latch, or restore paths.
2. For each output or named output-near state signal, record at least: exact name, port number when available, output role, direct source signal/block for private traceability, upstream block types in the output cone, control signals, branch signals, behavior type, condition groups, and whether the final draft covers it.
3. Group outputs by role: main state/value, final actuator/request output, automatic/manual calculation flags, EEW/save values, `Rem`/restore/remembered values, raw/final pairs, diagnostic/display states, mode-dependent held outputs, and named output-near state signals that support a final output.
4. For every Outport/exported output, trace backward from the output, not only forward from the module inputs. Follow the direct source cone at least through final Switch/Multiport Switch blocks, feedback paths, Unit Delay/Memory/Delay, latches, edge detectors, and mode gates. Continue until the behavior can be summarized as current-value selection, held previous value, restored value, default/fallback, suppression, override, or pure routing.
5. For signals whose names contain `Rem`, `Rstr`, `Restore`, `Old`, `Pre`, `Last`, `Mem`, `Save`, `EEW`, or similar state-holding terms, trace their source cone even if they are not Outports and even if they are not the primary output named in the module title.
6. In each output cone, look for `Unit Delay`, `Memory`, `Delay`, `RSLatch`, `Detect Change`, `EdgeRising`, `EdgeFalling`, feedback lines into `Switch`/`Multiport Switch`, and model-named mode/control gates that can hold, restore, suppress, or override outputs.
7. Treat right-side or output-near logic as behavior-bearing until proven otherwise. A final Switch with feedback, delay, latch, edge detection, or special-mode selection is output shaping/hold/restore logic, not pure Outport plumbing.
8. Record the behavior-level rule for each non-routing output or named output-near state signal: when the value is remembered, when it is held, when it is restored or updated, which source value wins, and which final or auxiliary output it affects.
9. Record branch conditions in a form that can be copied into `实现方式` without inventing business labels:
   - set conditions and reset conditions for latch/save outputs
   - true/false selector conditions for `Switch` and `Multiport Switch`
   - ordered priority branches for cascaded selectors
   - hold/update/restore triggers for memory and feedback paths
   - fallback/default value when no branch condition applies
10. For every control or branch signal, keep the exact signal, parameter, enum, constant, or table identifier. Do not reduce `control_signals` to inferred Chinese concepts.
11. When branch logic is complex, mark which rows should become level-one sub-points in `实现方式`.
12. If an output or named output-near state signal is pure plumbing or duplicate routing, mark it as such in the ledger with a reason so it can be safely collapsed. Do not silently drop a signal only because it is internal or not the main final state.

Required behavior fields:

- `behavior`: one or more of `latch`, `selection`, `priority_selection`, `hold`, `update`, `restore`, `delay`, `lookup`, `calculation`, `fallback`, or `pure_routing`.
- `set`: set/true/update conditions when a latch, save, or held output is set.
- `reset`: reset/false/cancel conditions when a latch, save, or held output is reset.
- `select`: selector conditions and selected source/value for Switch or Multiport Switch paths.
- `hold`: conditions that keep a previous value, memory value, or feedback value.
- `update`: trigger and source value used to refresh a remembered/saved state.
- `restore`: trigger and remembered value used to restore a final output or mode-dependent output.
- `fallback`: explicit default source/value when higher-priority branches do not apply.
- `affected_output`: final output or auxiliary output whose behavior is changed by the ledger row.
- `subpoints`: `yes` when the row should become level-one implementation sub-points.

A row is incomplete when it only says `source=RSLatch`, `source=Switch`, `source=Unit Delay`, `source=Memory`, `source=Goto/From`, or records only block types. Continue reverse tracing until the row has condition/action behavior fields or is explicitly marked `pure_routing` with a reason.

Use this fixed structure-to-behavior translation while building the ledger:

- `RSLatch` or latch helper: record `set`, `reset`, and held behavior.
- `Switch` or `Multiport Switch`: record `select` branches, priority/order when cascaded, and `fallback`.
- `Unit Delay`, `Memory`, or feedback line: record previous-value `hold`, update trigger, and initial/default value when model evidence exposes it.
- `EdgeRising`, `Detect Rise`, or rising-edge helper: record rising-edge trigger and triggered update/set behavior.
- `EdgeFalling`, `Detect Fall`, or falling-edge helper: record falling-edge trigger and triggered restore/reset behavior.
- `AND`: record all conditions as simultaneously required.
- `OR`: record all alternatives as any-one-satisfied.
- `Goto/From`, Data Store, Bus, or Signal Copy: resolve the named signal and continue tracing; do not treat the routing mechanism as final behavior.
- Relational Operator or Compare To Constant: record the exact operator and operand, such as `==`, `~=`, `>=`, `<=`, `>`, or `<`. Do not change comparison operators during prose conversion.

The ledger is not final prose:

- Do not copy block counts, block-type summaries, direct source block names, or `source=<block>` rows into `实现方式`.
- If the ledger only says a signal is sourced from `RSLatch`, `Switch`, `Signal Copy`, `Unit Delay`, `Memory`, or a subsystem name, continue reading that output cone until the set/reset/selection/hold/restore/fallback conditions are known.
- If model evidence contains a named output-near state signal but the draft does not mention that exact name, mark draft coverage as `missing` unless the ledger explicitly proves it is pure duplicate routing.
- If condition groups cannot be resolved for a non-routing output, state the limitation only after attempting deeper module evidence. Do not replace missing conditions with "`<block>` 形成 `<signal>`".
- Final prose should answer "when and why does this output take this value", not "which block is wired to this output".

Use a compact ledger shape such as:

```text
<module> output coverage:
- <signal_or_output>: role=<final/EEW/Rem/status/output-near-state/...>; behavior=<latch/selection/hold/update/restore/fallback/...>; source=<private traceability only>; cone=<private traceability only>; control_signals=[...]; branch_signals=[...]; set=[...]; reset=[...]; select=[condition -> source/value, ...]; hold=[...]; update=[trigger -> source/value]; restore=[trigger -> remembered_signal]; fallback=<source/value>; affected_output=<final_output_or_aux_output>; must mention=<yes/no>; subpoints=<yes/no>; draft coverage=<covered/missing>
```

Before drafting prose, every `must mention=yes` row must have a behavior-level note and, when relevant, explicit `set`, `reset`, `select`, `hold`, `update`, `restore`, or `fallback` fields. After drafting prose, re-read the ledger and revise any module whose `draft coverage` is missing.

Do not draft from a ports-only ledger. A ledger that contains only inport/outport names, direct source names, or broad input/output groups is an index, not sufficient evidence for `实现方式`.
Do not draft from a block-source ledger. A ledger that contains only `RSLatch`, `Switch`, `Unit Delay`, `Memory`, `Goto/From`, or direct source block names is private traceability, not sufficient evidence for `实现方式`.

For complex outputs, the ledger should be specific enough to produce wording like:

```text
<output>:
- set: <signal_a> 与 <signal_b> 同时有效；或 <signal_c> 有效且 <selector> == <value>
- reset: <signal_d> 无效；或 <signal_e> 有效且 <selector> == <other_value>
- priority: first <condition_1> -> <value_1>; then <condition_2> -> <value_2>; fallback -> <fallback_value>
```

Module selection guidance:

- Keep modules that own externally meaningful calculations, mode arbitration, demand levels, state management, fault/protection decisions, after-run/debounce/timer behavior, or final outputs.
- Skip or summarize only at top level: model information, version/configuration displays, function-definition-only containers, pure documentation, pure routing, signal reshaping, scope/display areas, and unused/test harness fragments.
- When a container has both documentation and functional children, write about the functional children and use the documentation only as evidence for `功能描述`.

## DocBlock and Annotation Text

Model-authored descriptions are high-value evidence. Search for:

- Simulink annotations at model and subsystem levels
- DocBlock blocks, including RTF/RTF_ZIP content
- block `Description`, mask `Description`, and mask prompts
- Stateflow chart descriptions and transition labels
- model info blocks and custom metadata annotations

For compressed DocBlock payloads, read the block `UserData` through MATLAB/MCP. If `UserData` is a struct with fields such as `content` and `format`, and `format` is `RTF_ZIP`, export the `uint8` `content`, zlib-decompress it, then convert the RTF to plain text using available local document tools such as `textutil` on macOS or a document conversion library. Do not treat an empty block `Description` as evidence that the DocBlock is empty. Keep the extracted text as evidence; do not paraphrase it into new requirements.

Because `设计依据` is blank by default, do not bulk-export every DocBlock body. Read full DocBlock bodies only for:

- model-level or module-level `功能描述` when no plain annotation/description is available
- Stateflow or masked subsystems whose behavior cannot be understood from ports, selected parameters, and output cones
- user-requested design-basis extraction

For ordinary generation, DocBlock names, direct descriptions, and visible annotations are enough.

## Evidence Notes

Maintain a compact evidence map while drafting:

- model name, version, and source path
- module path and module display name
- source of `功能描述` text
- key inputs, outputs, parameters, lookup tables, and state elements
- limitations such as unresolved library links, missing dictionaries, or failed compile

Use static `.slx` XML only as a supplement after MCP/SATK has been attempted or used for the specific missing evidence item. Static XML is useful for recovering annotations or parameters, but it can miss compiled semantics and linked/library behavior. XML fallback must be bounded and should not trigger a second full model-understanding workflow.

## Performance Guardrails

- Use one MATLAB session, one workspace setup pass, one model load, and at most one model update/compile pass per task unless the model state changes.
- Avoid speculative tool probing in production tasks. Unknown `model_scan` signatures should not trigger multiple MATLAB calls.
- Prefer one compact top-level index plus complete module reads for every selected module in the same session over dozens of per-module process launches. The top-level index is navigation evidence only.
- Do not enable every helper detail option globally for large models. Use targeted MCP/SATK reads, or call helper functions inside the open session only for selected troubleshooting, while still covering every selected module.
- Do not create screenshots or visual scans unless the user asks for visual verification or the model evidence is contradictory.
- Do not export full DocBlock bodies for all modules when `设计依据` is intentionally blank.
- If a model is large, process selected modules in batches. Prioritize modules with named state/restore signals, Stateflow, lookup tables, unresolved output-cone conditions, or output-near right-side logic first, but do not omit the remaining selected modules from module-level evidence collection.
