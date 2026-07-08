---
name: simulink-module-description-generator
description: Generate templated software module function descriptions from Simulink models. Use when the user provides a Simulink .slx model, model folder, or model-derived assets and asks Codex to create or update software detailed design content, software module function descriptions, or DOCX/Markdown drafts using MATLAB MCP/SATK, UI-selected addon files, model annotations, DocBlocks, and the bundled Software Detailed Design template.
---

# Simulink Module Description Generator

Generate software module function descriptions from Simulink model evidence, then place the content into the bundled Software Detailed Design template.

## Default Invocation Contract

Use this skill when the user asks for a software detailed design, software module function description, or similar document based on a Simulink model.

Default behavior:

- Treat the Simulink model as the source of truth. Do not base content on prior generated documents or example documents unless the user explicitly requests that comparison.
- Quality is the first priority. The target for every selected functional module is condition/action implementation prose with explicit set, reset, selection, hold, restore, fallback, lookup, delay, or output-assignment behavior when those constructs exist. Do not narrow evidence scope, skip modules, or emit port-summary prose to save time.
- Use one task-scoped MATLAB MCP/SATK session as the default evidence path. Load and initialize MATLAB once per generation task, keep the model open while collecting evidence and drafting, and close only task-owned model state at the end.
- Static `.slx` XML inspection may supplement MCP/SATK evidence only after targeted MCP/SATK reads fail for a concrete item; it must not replace the MATLAB/SATK evidence path.
- When SATK exposes a fast model scanning utility such as `model_scan`, use it as an optional front-end index for hierarchy, ports, annotations, and candidate module selection. Do not treat scan output as a substitute for targeted MATLAB/MCP/SATK evidence on selected modules.
- For models with multiple functional subsystems, use a split-read workflow: first build a lightweight whole-model index, then read and draft each selected subsystem one by one. A single whole-model scan or top-level port summary must not replace per-subsystem deep evidence.
- Treat each module's externally visible outputs and named output-near state signals as the coverage boundary. Do not stop at the main calculation path or DocBlock summary; for every selected module, close the analysis at each Outport/exported output and every named output-near memory/restore signal by tracing backward through the output cone.
- Generate implementation text from an output-first ledger, not from input lists or block source lists. Each selected module must pass through this sequence before prose is accepted: enumerate outputs and output-near state signals, trace backward from each output, translate Simulink structures into behavior fields, then write condition/action sub-points.
- Assume the UI/platform has copied selected addon files into the task workspace. Add and initialize those workspace addon/project files before loading the model; do not read unrelated external addon roots.
- Before running auto-generated addon/init/data scripts such as `*_dd.m`, sanitize the task-workspace copy by removing standalone `clear`/`clearvars` commands. These commands can erase session variables and break task-scoped MATLAB session reuse.
- Preserve model signal names, calibration names, table names, output names, units, and numeric constants exactly when describing logic.
- Generate module-level descriptions, not a block-by-block SATK dump.
- Keep final documents focused on functional design. Do not output evidence-collection or model-configuration metadata such as MATLAB/SATK load status, update success, solver, target file, or model version unless the user explicitly asks for that audit information.
- Preserve the template's `设计依据` headings but leave their body content blank by default, even when requirement IDs or design basis text appear in annotations or DocBlocks. Use those IDs as internal evidence only unless the user explicitly asks to include design bases.
- Use the bundled DOCX template at `assets/templates/Template_Software_Detailed_Design.docx` for the final document unless the user only asks for Markdown preview.

Minimal prompt example:

```text
Use $simulink-module-description-generator to generate a software module function description for /path/to/Model.slx.
```

## Workflow

1. Locate the model, task workspace, and any UI-selected addon/project files.
2. Open or reuse a task-owned MATLAB MCP/SATK session. Run `scripts/setup_module_doc_support.m` in that same session before model load or SATK reads, add the selected workspace addon/project files once, sanitize and run initialization scripts once, and `load_system` the target model once. Do not repeatedly start `matlab -batch` or reopen/close MATLAB for module-level reads. If `scripts/satk_eval.py` is used as a bridge, keep its default `SATK_MATLAB_SESSION_MODE=auto`: the MCP server should attach to an existing MATLAB session when one is available and start one when none is available. Do not force `new` for repeated evidence reads.
3. If available, run a fast model scan in the already-open session to build a compact index of top-level ports, immediate child subsystems, annotations/DocBlocks, major block categories, and obvious non-functional structures.
4. Select meaningful functional modules before deep reading. Prefer subsystems with clear control, calculation, state, protection, demand, arbitration, or output ownership. Exclude or de-emphasize model-info, function-definition-only, pure documentation, pure routing, display, and configuration structures unless the user explicitly asks for them.
5. For models that contain multiple selected functional subsystems, process them as batches or individually in the same MATLAB session: select the next subsystem, deep-read that subsystem, complete its output coverage ledger, and draft/cache that subsystem's section before moving to the next subsystem. Do not wait for one huge all-model collector if it becomes unreliable, but also do not downgrade to ports-only evidence; split the work by subsystem and continue until every selected subsystem reaches module-level evidence completeness.
6. Read every selected functional module with MCP/SATK/MATLAB APIs from the same open session: overview, hierarchy, ports, annotations, DocBlocks, masks, library links, subsystem internals, parameters, lookup tables, delays, stateflow charts, data dictionaries, and output-near cones. Batch related reads where practical, but batching must not reduce the module set or replace module-level evidence with top-level ports.
7. For each selected module, create a private output coverage ledger before drafting. Enumerate every externally meaningful output, exported signal, and named internal line in the output-near cone that participates in output shaping, including final outputs, `Rem`/`Rstr`/`Restore`/`Old`/`Pre`/`Last`/`Mem`/`Save`/`EEW`, raw/final pairs, status/display outputs, and auxiliary mode-restore outputs.
8. For each ledger item, trace backward from the Outport/exported signal/output-near named line through its cone to identify source signals, final Switch/Multiport Switch selections, feedback, Unit Delay/Memory/Delay, latches, edge detectors, and special-mode gates. Convert those findings into behavior fields: `set`, `reset`, `select`, `hold`, `update`, `restore`, `fallback`, and `affected_output`. A ledger row that only records `source=<block>` or a block type is incomplete and must be expanded before drafting.
9. Translate the behavior ledger into implementation prose using fixed behavior patterns: latch becomes set/reset/hold; Switch/Multiport Switch becomes condition-based selection; Unit Delay/Memory/Delay becomes previous-value hold or calibrated delay; EdgeRising/EdgeFalling becomes rising/falling-edge trigger; AND/OR becomes simultaneous/all or any conditions. Do not write block-instance names or routing mechanisms as the implementation.
10. Extract top-level purpose text from model annotations/DocBlocks and module purpose text from subsystem annotations/DocBlocks when present.
11. Draft the document:
   - `功能描述`: the model or module function expressed from model-authored descriptions.
   - `模型总体结构`: functional architecture only: execution entry/period when model-authored, major inputs/outputs, meaningful subsystem relationship, and data flow. Exclude model tooling/configuration audit details.
   - `软件模块功能描述`: one section per meaningful functional module.
12. For each module, write `功能描述` and `实现方式`. Keep `设计依据` blank unless the user explicitly requests populated design bases. In `实现方式`, cover every non-routing row in the output coverage ledger at least once by exact signal/output name. Do not collapse a named output-near memory/restore signal into an unnamed grouped role.
13. Convert evidence into behavior before writing final prose. Do not paste private ledger rows, block counts, direct-source block lists, block-instance names, routing mechanisms, or statements such as "`<block>` 形成 `<signal>`" as `实现方式`.
14. Run the output self-check from `references/writing-rules.md` before creating the final file. If the draft omits any non-routing ledger output or named output-near memory/restore signal, replaces a model identifier with a Chinese business-label condition, contains port-summary wording such as "共同形成"/"共同输出", contains process disclaimers such as "模型未提供显式说明，以下根据端口和结构归纳", contains block-instance or routing-mechanism prose such as "`RSLatch1`", "`Switch5`", "`Unit Delay2`", or "`Goto/From`", or if `实现方式` is only an evidence inventory instead of condition/action logic, return to evidence collection and revise before generating DOCX.
15. Create DOCX from the template, preserving styles and heading structure. Provide Markdown only when requested or as a review preview.
16. Extract text from the final DOCX and run the same output self-check on the DOCX text, not only on the Markdown/source draft. If DOCX text differs in quality from the checked draft or reintroduces forbidden wording, repair the DOCX and re-check.
17. Validate that every implementation claim has traceable model evidence and that no required module is missing.
18. Clean MATLAB task state before finishing when safe: close only models opened for this task, remove task-specific paths if they were added, and avoid leaving temporary variables that affect future tasks. Do not use broad cleanup such as `bdclose all` when other sessions/models may be user-owned.

## References

Read these references as needed:

- `references/model-evidence.md`: MATLAB MCP/SATK access pattern, addon handling, and evidence collection checklist.
- `references/writing-rules.md`: generalized reviewer feedback and wording rules for module descriptions.
- `references/template-filling.md`: how to fill the bundled Software Detailed Design DOCX template.

## Output Rules

- Use Chinese for narrative text unless the user asks otherwise.
- Keep signal names and model identifiers untranslated. Do not invent Chinese expansions for identifiers.
- Prefer compact natural-language pseudo-code: describe condition groups, thresholds, selections, delays, tables, latches, and output assignment in ordered prose.
- Avoid internal block instance names in final prose. For example, prefer "取最大值", "按标定延时", "以下任一条件满足", or "查表输出" over listing `Switch2`, `Unit Delay1`, `AND1`, or `Prelookup3`. If a block name is the only available traceability handle, keep it in private evidence, not in polished `实现方式`.
- Do not satisfy `实现方式` with evidence inventory. Forbidden final prose patterns include block-type counts, "模块输出按直接来源分组形成", "`RSLatch` 形成 `<signal>`", "`Signal Copy` 形成 `<signal>`", and generic categories such as "保存类输出/手动计算类输出/自动计算类输出" when they are not followed by exact branch conditions.
- Mention raw and final outputs when the model has both. Describe gating, fallback, saturation, hysteresis, delay, edge-triggered memory, and restore behavior when they materially affect outputs, but compress mechanical post-processing into behavior-level phrases such as "候选值取最大值", "下降时按 `<param>` 延时处理", "进入 turn off delay", and "最终输出 `<output>`".
- Mention auxiliary state-holding outputs and named output-near state signals such as `*Rem*`, `*Old*`, `*Pre*`, `*Save*`, and `*EEW*` when they leave the module or affect final outputs. Describe when the value is held, updated, or restored; do not reduce these paths to anonymous Switch/Unit Delay plumbing.
- Treat output-near logic as functional until proven otherwise. A Switch/Multiport Switch plus feedback, Unit Delay/Memory/Delay, edge detection, latch, or special-mode input near an Outport is output shaping/hold/restore behavior, not disposable final wiring.
- Do not end a module description at an intermediate calculation signal when downstream output logic produces a final output, `Rem`/restore output, or held value. Summarize the downstream behavior compactly and name the affected output.
- Before finalizing, remove toolchain/load/update metadata from narrative sections, leave every `设计依据` body blank by default, and reduce final routing or output plumbing to behavior-level wording.
- Do not infer requirements, design bases, calibration intent, or business meaning beyond the model evidence.
