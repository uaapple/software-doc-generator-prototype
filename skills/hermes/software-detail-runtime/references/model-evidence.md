# Model Evidence Collection

Use one task-owned MATLAB process/session as the primary evidence path. Gather deep internal evidence, then project it onto the selected document unit's direct interface. Read `module-boundary.md` before selecting modules.

## Quality Priority

- Complete evidence is mandatory for every `document_unit`. Deep-read required `analysis_unit` children without turning them into document sections or public identifiers.
- Do not stop at top-level ports, subsystem inports/outports, module names, or a single manually reviewed module. A document where one module has detailed branch logic and other selected modules only have input/output summaries is a failed generation.
- For models with multiple functional subsystems, use split processing by default: build a lightweight whole-model index first, then deep-read each selected subsystem in the same MATLAB session and draft/cache that subsystem's section after its evidence is complete. A broad all-model scan may identify boundaries, but it is not sufficient evidence for any module section.
- In multi-subsystem models, skip heavy all-model collectors that traverse every selected subsystem's internals or output cones. The global phase is for module discovery only. Output cones, state-holding signals, and behavior ledgers must be collected inside the per-subsystem queue.
- Do not generate module prose from a static hand-authored module summary list. Each module section must be backed by a behavior ledger for that exact module. If there is no behavior ledger artifact or note for a module, that module is not ready to draft.
- If evidence for a selected module is not sufficient to write condition/action implementation prose, continue reading that module in the same MATLAB session. If MCP/SATK cannot expose a specific item, use bounded `.slx` XML or other model-derived task files as supplement for that item.
- If a selected module still cannot be resolved after the available model-derived evidence paths are attempted, report the unresolved module and limitation instead of writing vague final prose.

## Session Lifecycle and Performance Contract

- Start one task-owned MATLAB process/session for a generation task. In front-end, unattended, or production document-generation tasks, assume no user-open MATLAB exists and prefer a new task-owned MATLAB process, such as one `matlab -batch` job or MCP/SATK `new` session. Keep it alive until evidence collection, drafting, and DOCX validation are complete.
- Run workspace setup, addon/project initialization, model load, and optional model update in that same MATLAB process/session. Do not launch a fresh `matlab -batch` process for each collector pass, selected subsystem, or fallback probe.
- Keep the target model loaded while reading overview, hierarchy, module internals, output cones, parameters, DocBlocks, and data dictionaries. Avoid open/close loops around individual modules.
- Prefer direct MATLAB batch scripts or MCP/SATK tools executed through the task-owned process/session. Helper functions in `scripts/` may be called from that process/session, but they are not the default reason to spawn a separate MATLAB process.
- If `scripts/satk_eval.py` is needed as a bridge to MCP, use the default `SATK_MATLAB_SESSION_MODE=new`. Use `existing` only when the user explicitly says MATLAB is already open or the platform provides an active session. Do not spend time diagnosing `failed to attach to MATLAB session` in a production/front-end task where no existing MATLAB session is expected.
- Use `model_scan` or fast scan as a navigation index when available, then perform targeted deep reads in the same MATLAB process/session. Do not probe scanner signatures repeatedly; try the supported call shape once and continue with normal MCP/SATK reads if unavailable. For multi-subsystem models, the scan must remain index-only.
- Batch related reads by bounded model area, analysis unit, or output group. Avoid one tool/process call per signal or block, but do not treat the entire complex `document_unit` as one deep-read batch. A-level/document-unit scope is the aggregation boundary; analysis-unit or output-group scope is the default execution boundary.
- If a whole-model collector would collect output cones or deep internals for multiple selected subsystems, do not start it for multi-subsystem models. If one was started and becomes slow, times out, or produces an oversized JSON payload, stop relying on it and split the task by selected subsystem. The acceptable path is smaller per-subsystem MCP/SATK reads, not a downgrade to top-level ports, static names, or generic module summaries.
- Compile or update the model at most once unless a specific later read proves compiled data is required and the model state has changed.
- Use static `.slx` XML only as a bounded fallback for a concrete missing item after MCP/SATK evidence was attempted. Do not switch the whole task to XML probing as the normal path.
- If a deep output cone still cannot be resolved within budget, record the unresolved signal and limitation, then continue; do not keep restarting MATLAB or cycling through full collectors.
- At task end, close only task-owned models and remove task-specific paths when safe. Do not run `clear all` or `bdclose all` in a shared/user MATLAB session.
- Treat MATLAB process/session reuse as task-scoped. Do not run two document-generation tasks concurrently in the same MATLAB process/session unless the platform explicitly serializes them.

## Bounded Output-Cone Batch Contract

Apply this contract before any helper or MCP/SATK call that expands output dependencies.

- Never run a whole-subsystem output-cone collector across every Outport of a non-trivial `document_unit`. In particular, do not set `IncludeOutputCones=true` or an equivalent full-cone option while selecting an entire complex A-level subsystem as one batch.
- Build an output-first queue without expanding it globally. Process one `analysis_unit` at a time by default. If an analysis unit is still complex, process one direct Outport or one shared-source output family at a time.
- Force subdivision when any of these conditions is known from the index: more than 2 functional child analysis units, more than 5 direct Outports, an estimated cone above 200 nodes, or concentrated Switch/Multiport Switch, Delay/Memory, Stateflow, lookup, or feedback logic. These thresholds trigger smaller reads; they never justify omitting evidence.
- Give each deep-read batch a working budget of 3-5 minutes. The bridge timeout is only a final safety limit and may be longer, such as 20 minutes; do not treat that bridge timeout as the normal batch duration.
- Persist the batch artifact and ledger fragment immediately after the batch completes. Resume from completed artifacts after failure instead of restarting the whole document unit.
- When a batch exceeds its working budget, becomes unresponsive, times out, or produces an oversized payload, do not retry the same scope unchanged. Reduce scope in this order: `document_unit` to `analysis_unit`, `analysis_unit` to direct Outport/shared-source output group, then to a targeted block/parameter/state read.
- After targeted MCP/SATK reads fail for a concrete missing item, use bounded `.slx` XML or other model-derived task files only for that item. If it remains unresolved, record the affected boundary output and limitation and continue other batches; do not generate vague prose for the unresolved behavior.
- Completeness is checked after aggregation: every direct document-unit Outport and every required internal ledger row must be covered by the union of completed batch artifacts. Smaller batches change execution scope, not evidence scope or final document hierarchy.

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

For multi-subsystem models, fast scan and whole-model overview must not collect or summarize all selected modules' output cones in one pass. The scan should answer "which modules exist and which ones need deep reading", not "what every output does". If a helper's default mode combines indexing with all-module output-cone traversal, do not use that mode; use a lighter hierarchy/ports scan or a custom bounded index instead.

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

1. Start the task-owned MATLAB process/session. For front-end or production runs, use a new task-owned process/session by default.
2. Load project/addons and target model once in that process/session.
3. Run an index-only fast scan if available, or otherwise read the top-level overview and hierarchy. For multi-subsystem models, do not include output-cone traversal or deep block internals in this global step.
4. Read the top-level annotations/DocBlocks and identify model-authored purpose text.
5. Create the hierarchy manifest from `module-boundary.md`: select `documentUnits`, attach descendant `analysisUnits`, and capture each document unit's direct Inports/Outports as its identifier allowlist.
6. Create an analysis queue per document unit. Read one analysis unit at a time by default; split a large analysis unit by direct Outport or shared-source output group. Persist each batch artifact, then aggregate child blocks, parameters, state elements, lookup tables, downstream outputs, and output-near cone facts into the parent document-unit ledger. Do not draft child sections from this queue.
7. Resolve parameter values through data dictionaries, base workspace, model workspace, masks, and referenced scripts.
8. Compile or update the model only when needed for resolved types/dimensions/sample times; record any compile failure as a limitation.

## Analysis Queue and Document-Unit Draft Gating

For multi-subsystem models, the parent document unit is the unit of narrative quality control; its child analysis queue is the unit of evidence processing.

- Each analysis queue item should produce a private evidence artifact with its path, parent document unit, local ports, annotations/DocBlocks, output-near named signals, and ledger fragment.
- Treat each queue item as a bounded execution batch. A queue item must identify its analysis-unit path and, when subdivided, its direct Outport or shared-source output group. It must not mean "all output cones under the parent document unit".
- Do not mark a queue item complete until every non-routing output or output-near state signal has behavior fields as described below.
- Draft/cache only the parent document-unit section after all required analysis children are complete and their rows map to direct boundary outputs.
- Do not build the final document from a static `MODULES` array, table, or prose list that was manually summarized from memory. If code uses a `MODULES` data structure to assemble DOCX, each module entry must be generated from checked module-local evidence and behavior ledger rows.
- If a module section is shorter because the module is genuinely simple, record the ledger reason such as `pure_routing`, `single_assignment`, or `documented_constant_output`. Do not make a complex module short only to fit the full-model document.
- If a selected module lacks a completed ledger, either continue evidence collection for that module or explicitly report it as unresolved. Do not silently include a shallow summary in the final DOCX.

When reading a document unit, inspect the final cone of each direct Outport. Capture internal edge detectors, delays, latches, restore/remain signals, selectors, feedback, and mode gates as private behavior evidence. Set internal rows to `visibility=internal_evidence`; their names must not appear in polished prose.

## Output Coverage Ledger

Before drafting each module, build a private output coverage ledger. The ledger is evidence for the writer and self-check; it does not need to be printed in the final document.

The ledger is output-first. Do not start from input lists and guess what they influence. Start from the output or output-near named state signal, then trace backward until the behavior can be written as conditions and actions.

1. Enumerate the document unit's direct Outports first. Trace named output-near states, Goto/Data Store values, save/restore values, and child outputs only as private evidence supporting those direct Outports.
2. For every row record exact private facts plus `visibility`, `affected_boundary_output`, and `behavior_group`.
3. Group outputs by role: main state/value, final actuator/request output, automatic/manual calculation flags, EEW/save values, `Rem`/restore/remembered values, raw/final pairs, diagnostic/display states, mode-dependent held outputs, and named output-near state signals that support a final output.
4. For every Outport/exported output, trace backward from the output, not only forward from the module inputs. Follow the direct source cone at least through final Switch/Multiport Switch blocks, feedback paths, Unit Delay/Memory/Delay, latches, edge detectors, and mode gates. Continue until the behavior can be summarized as current-value selection, held previous value, restored value, default/fallback, suppression, override, or pure routing.
5. For signals whose names contain `Rem`, `Rstr`, `Restore`, `Old`, `Pre`, `Last`, `Mem`, `Save`, `EEW`, or similar state-holding terms, trace their source cone even if they are not Outports and even if they are not the primary output named in the module title.
6. In each output cone, look for `Unit Delay`, `Memory`, `Delay`, `RSLatch`, `Detect Change`, `EdgeRising`, `EdgeFalling`, feedback lines into `Switch`/`Multiport Switch`, and model-named mode/control gates that can hold, restore, suppress, or override outputs.
7. Treat right-side or output-near logic as behavior-bearing until proven otherwise. A final Switch with feedback, delay, latch, edge detection, or special-mode selection is output shaping/hold/restore logic, not pure Outport plumbing.
8. Record the behavior-level rule for each non-routing output or named output-near state signal: when the value is remembered, when it is held, when it is restored or updated, which source value wins, and which final or auxiliary output it affects.
9. Record exact branch conditions privately. Before prose, project them onto direct document-unit inputs and outputs:
   - set conditions and reset conditions for latch/save outputs
   - true/false selector conditions for `Switch` and `Multiport Switch`
   - ordered priority branches for cascaded selectors
   - hold/update/restore triggers for memory and feedback paths
   - fallback/default value when no branch condition applies
10. Keep every control, parameter, enum, constant, and table identifier exact in private evidence. Do not copy a non-allowlisted identifier into prose.
11. Classify each row as `primary_output`, `material_state`, `supporting_state`, `mechanical_postprocess`, `symmetric_family`, or `pure_routing`. Set `must_mention=yes` only when `visibility=document_boundary`; internal `material_state` rows always use `must_mention=no`.
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
- `narrative_class`: one of `primary_output`, `material_state`, `supporting_state`, `mechanical_postprocess`, `symmetric_family`, or `pure_routing`.
- `visibility`: `document_boundary` for direct document-unit ports; otherwise `internal_evidence`.
- `affected_boundary_output`: direct document-unit Outport affected by the row.
- `must_mention`: `yes` only for allowlisted boundary identifiers required in prose.
- `behavior_group`: identifier of the narrative group that covers the row.

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
- If a boundary `must_mention=yes` identifier is absent, mark coverage as `missing`. Fail separately if any `internal_evidence` identifier appears in the draft.
- If condition groups cannot be resolved for a non-routing output, state the limitation only after attempting deeper module evidence. Do not replace missing conditions with "`<block>` 形成 `<signal>`".
- Final prose should answer "when and why does this output take this value", not "which block is wired to this output".

Use a compact ledger shape such as:

```text
<module> output coverage:
- <signal_or_output>: visibility=<document_boundary/internal_evidence>; role=<final/EEW/Rem/status/output-near-state/...>; narrative_class=<...>; behavior=<...>; source=<private>; control_signals=[...]; set=[...]; reset=[...]; select=[...]; hold=[...]; update=[...]; restore=[...]; fallback=<...>; affected_boundary_output=<direct_outport>; must_mention=<yes/no>; behavior_group=<group_id>; draft_coverage=<covered/missing/leaked>
```

Before drafting, every row must have visibility, an affected boundary output, and a behavior group or justified routing exclusion. Every boundary `must_mention=yes` row must appear by exact name. Every internal row must remain absent by exact name.

## Narrative Compression Plan

After the ledger is complete, create a private behavior-group plan before prose:

```text
<group_id>: title=<boundary_output_or_behavior_role>; boundary_inputs=[...]; boundary_outputs=[...]; internal_evidence_rows=[...]; condition_actions=[...]; covered_ledger_items=[...]
```

- Group rows that affect the same direct document-unit output through the same set/reset/select/hold/update/restore contract.
- Combine conditions that produce the same action into one condition group.
- Map comparator outputs, anonymous Boolean intermediates, copies, conversions, and final routing to the owning group instead of creating prose bullets.
- Detect shared cones and symmetric families before drafting. Describe a homologous branch tree once and keep only side/profile-specific differences separate.
- Use `a07-granularity-pattern.md` for the density gate and final layout.

Do not draft from a ports-only ledger. A ledger that contains only inport/outport names, direct source names, or broad input/output groups is an index, not sufficient evidence for `实现方式`.
Do not draft from a block-source ledger. A ledger that contains only `RSLatch`, `Switch`, `Unit Delay`, `Memory`, `Goto/From`, or direct source block names is private traceability, not sufficient evidence for `实现方式`.

## Pipeline Evidence-Coverage Execution Clarification

This clarification makes the original evidence requirements executable across the
staged pipeline; it does not add a new business rule or change document hierarchy.

- Every selected `document_unit` must own at least one bounded analysis-queue item.
  When it has no eligible analysis child, queue the small unit itself with
  `scope=document_unit_direct`, or split it by direct Outport/shared-source output
  group. A zero-item parent is never implicitly covered by its port list.
- Use one fixed evidence-shard field set for every queue scope. Predeclare `scope`
  and all optional fields before constructing MATLAB structure arrays, and normalize
  field sets before concatenation. A structure-append error is a failed required
  evidence read, not an ignorable limitation.
- The persisted `software-detail-evidence-shards/v1` index has a top-level
  `shards[]`. Each entry inlines its document-unit path, queue identity when
  available, scope and scope path, canonical direct-output names as
  `outports: [{"name": "..."}]`, limitations, and the persistent private-shard
  path. Analysis entries inline every direct output they affect; `direct_outport`
  entries put the exact short-name output in `directOutport` and canonical
  `outports`. Mirror `scopePath` from the queue item exactly, including an empty
  value. A queue-item ID is an additional identity check, not a replacement for
  parent, scope, scope-path, or output checks. A shard-file path alone is not an
  evidence index.
- Before Stage 3 completes, verify every queue item, every document unit, and every
  direct Outport. Each direct Outport needs model evidence or an explicit limitation
  backed by recorded targeted reads. “No evidence shard”, an empty shard, or a
  boundary-only inference is not sufficient coverage.
- Reread the written evidence index JSON and run queue-item, document-unit, and
  direct-output checks against the parsed file before writing a successful stage
  candidate. In-memory structures do not prove that required fields survived JSON
  serialization.
- Stages that aggregate, project, or draft must fail on missing evidence. They must
  not turn an uncovered output into a ledger claim, boundary behavior, or prose.

For complex outputs, private facts should be specific enough to produce boundary-projected wording like the following. Every identifier shown in final prose must be allowlisted:

```text
<output>:
- set: <signal_a> 与 <signal_b> 同时有效；或 <signal_c> 有效且 <selector> == <value>
- reset: <signal_d> 无效；或 <signal_e> 有效且 <selector> == <other_value>
- priority: first <condition_1> -> <value_1>; then <condition_2> -> <value_2>; fallback -> <fallback_value>
```

Document-unit selection guidance:

- Keep functional A-level modules that own externally meaningful calculations, mode arbitration, demand levels, state management, fault/protection decisions, after-run/debounce/timer behavior, or final outputs.
- Skip or summarize only at top level: model information, version/configuration displays, function-definition-only containers, pure documentation, pure routing, signal reshaping, scope/display areas, and unused/test harness fragments.
- When an A-level document unit has functional children, deep-read the children as analysis units and aggregate their behavior into the A-level section. Promote children only under the exception rules in `module-boundary.md`.

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

- Use one MATLAB process/session, one workspace setup pass, one model load, and at most one model update/compile pass per task unless the model state changes.
- Avoid speculative tool probing in production tasks. Unknown `model_scan` signatures should not trigger multiple MATLAB calls.
- Prefer one compact top-level index plus complete module reads for every selected module in the same MATLAB process/session over dozens of per-module process launches. The top-level index is navigation evidence only.
- Do not enable every helper detail option globally for large models. Use targeted MCP/SATK reads, or call helper functions inside the task-owned MATLAB process/session only for selected troubleshooting, while still covering every selected module.
- Do not create screenshots or visual scans unless the user asks for visual verification or the model evidence is contradictory.
- Do not export full DocBlock bodies for all modules when `设计依据` is intentionally blank.
- If a model is large, process selected modules through the bounded analysis-unit/output-group queue. Prioritize batches with named state/restore signals, Stateflow, lookup tables, unresolved output-cone conditions, or output-near right-side logic first, but do not omit the remaining batches from module-level evidence collection.
