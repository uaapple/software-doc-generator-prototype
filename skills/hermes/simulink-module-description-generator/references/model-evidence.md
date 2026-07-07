# Model Evidence Collection

Use MATLAB MCP/SATK as the primary evidence path. The goal is to gather enough model-authored information to write module-level behavior without turning the document into a block listing.

## Workspace and Addon Handling

- Treat the task workspace as authoritative. The platform/Hermes Agent/UI may have copied selected addon files into the workspace; use those files directly.
- Do not assume fixed addon folder names. Search for `.prj`, `.m`, `.slx`, `.sldd`, libraries, data dictionaries, and init scripts under the workspace.
- Add project/addon paths before opening the target model. Run project/addon initialization before model-level init scripts when both exist.
- Prefer `scripts/setup_module_doc_support.m` for setup. It adds useful workspace paths, restores common MATLAB MCP/SATK paths, opens projects, and runs discovered or supplied init scripts.
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

1. Load project/addons and target model.
2. Run a fast scan if available, or otherwise read the top-level overview and hierarchy.
3. Read the top-level annotations/DocBlocks and identify model-authored purpose text.
4. Enumerate immediate child subsystems and select meaningful functional modules before doing expensive deep reads.
5. For each selected module, read its local ports, annotations, DocBlocks, child blocks, parameters, state elements, lookup tables, and downstream outputs.
6. Resolve parameter values through data dictionaries, base workspace, model workspace, masks, and referenced scripts.
7. Compile or update the model only when needed for resolved types/dimensions/sample times; record any compile failure as a limitation.

When reading a selected module, inspect the final output cone before drafting. Do not stop at the main algorithm DocBlock, the visually dominant left-to-right calculation path, or a signal that merely looks like the module's main result. If downstream logic contains edge detectors, Unit Delay/Memory, latches, restore/rem/remain signals, Switch/Multiport Switch selections, feedback lines, or special-mode gates that can change an externally visible output, capture those as behavior-level evidence.

## Output Coverage Ledger

Before drafting each module, build a private output coverage ledger. The ledger is evidence for the writer and self-check; it does not need to be printed in the final document.

1. Enumerate the module's externally meaningful outputs: Outport blocks, top-level exported signals, Goto/Data Store outputs that leave the module, EEW/save outputs, display/status outputs, and auxiliary restore/remain outputs.
2. For each output, record at least: output name, port number when available, direct source signal/block, upstream block types in the output cone, output role, control signals, branch signals, condition groups, and whether the final draft covers it.
3. Group outputs by role: main state/value, final actuator/request output, automatic/manual calculation flags, EEW/save values, `Rem`/restore/remembered values, raw/final pairs, diagnostic/display states, and mode-dependent held outputs.
4. For every Outport/exported output, trace backward from the output, not only forward from the module inputs. Follow the direct source cone at least through final Switch/Multiport Switch blocks, feedback paths, Unit Delay/Memory/Delay, latches, edge detectors, and mode gates. Continue until the behavior can be summarized as current-value selection, held previous value, restored value, default/fallback, suppression, override, or pure routing.
5. For outputs whose names contain `Rem`, `Rstr`, `Restore`, `Old`, `Pre`, `Last`, `Mem`, `Save`, `EEW`, or similar state-holding terms, trace their source cone even if they are not the primary output named in the module title.
6. In each output cone, look for `Unit Delay`, `Memory`, `Delay`, `RSLatch`, `Detect Change`, `EdgeRising`, `EdgeFalling`, feedback lines into `Switch`/`Multiport Switch`, and model-named mode/control gates that can hold, restore, suppress, or override outputs.
7. Treat right-side or output-near logic as behavior-bearing until proven otherwise. A final Switch with feedback, delay, latch, edge detection, or special-mode selection is output shaping/hold/restore logic, not pure Outport plumbing.
8. Record the behavior-level rule for each non-routing output: when the value is remembered, when it is held, when it is restored or updated, which source value wins, and which final or auxiliary output it affects.
9. Record branch conditions in a form that can be copied into `实现方式` without inventing business labels:
   - set conditions and reset conditions for latch/save outputs
   - true/false selector conditions for `Switch` and `Multiport Switch`
   - ordered priority branches for cascaded selectors
   - hold/update/restore triggers for memory and feedback paths
   - fallback/default value when no branch condition applies
10. For every control or branch signal, keep the exact signal, parameter, enum, constant, or table identifier. Do not reduce `control_signals` to inferred Chinese concepts.
11. When branch logic is complex, mark which rows should become level-one sub-points in `实现方式`.
12. If an output is pure plumbing or duplicate routing, mark it as such in the ledger with a reason so it can be safely collapsed. Do not silently drop an output only because it is not the main final state.

Use a compact ledger shape such as:

```text
<module> output coverage:
- <output>: role=<final/EEW/Rem/status/...>; source=<signal/block>; cone=<Switch, Unit Delay, mode gate>; control_signals=[...]; branch_signals=[...]; condition_groups=<set/reset/priority/hold/restore/fallback>; must mention=<yes/no>; subpoints=<yes/no>; draft coverage=<covered/missing>
```

Before drafting prose, every `must mention=yes` row must have a behavior-level note and, when relevant, explicit condition groups. After drafting prose, re-read the ledger and revise any module whose `draft coverage` is missing.

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

## Evidence Notes

Maintain a compact evidence map while drafting:

- model name, version, and source path
- module path and module display name
- source of `功能描述` text
- key inputs, outputs, parameters, lookup tables, and state elements
- limitations such as unresolved library links, missing dictionaries, or failed compile

Use static `.slx` XML only as a supplement after MCP/SATK has been attempted or used. Static XML is useful for recovering annotations or parameters, but it can miss compiled semantics and linked/library behavior.
