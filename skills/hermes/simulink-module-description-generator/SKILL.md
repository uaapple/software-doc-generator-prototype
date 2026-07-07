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
- Use MATLAB MCP/SATK first to load and inspect the model. Static `.slx` XML inspection may supplement MCP/SATK evidence but must not replace it.
- When SATK exposes a fast model scanning utility such as `model_scan`, use it as an optional front-end index for hierarchy, ports, annotations, and candidate module selection. Do not treat scan output as a substitute for targeted MATLAB/MCP/SATK evidence on selected modules.
- Treat each module's externally visible outputs and named output-near state signals as the coverage boundary. Do not stop at the main calculation path or DocBlock summary; for every selected module, close the analysis at each Outport/exported output and every named output-near memory/restore signal by tracing backward through the output cone.
- Assume the UI/platform has copied selected addon files into the task workspace. Add and initialize those workspace addon/project files before loading the model; do not read unrelated external addon roots.
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
2. Run `scripts/setup_module_doc_support.m` in MATLAB before model load or SATK reads. If direct MCP tools are unavailable, use `scripts/satk_eval.py` to evaluate MATLAB setup/read snippets through SATK.
3. If available, run a fast model scan first to build a compact index of top-level ports, immediate child subsystems, annotations/DocBlocks, major block categories, and obvious non-functional structures.
4. Select meaningful functional modules before deep reading. Prefer subsystems with clear control, calculation, state, protection, demand, arbitration, or output ownership. Exclude or de-emphasize model-info, function-definition-only, pure documentation, pure routing, display, and configuration structures unless the user explicitly asks for them.
5. Read the selected model areas with MCP/SATK/MATLAB APIs: overview, hierarchy, ports, annotations, DocBlocks, masks, library links, subsystem internals, parameters, lookup tables, delays, stateflow charts, and data dictionaries.
6. For each selected module, create a private output coverage ledger before drafting. Enumerate every externally meaningful output, exported signal, and named internal line in the output-near cone that participates in output shaping, including final outputs, `Rem`/`Rstr`/`Restore`/`Old`/`Pre`/`Last`/`Mem`/`Save`/`EEW`, raw/final pairs, status/display outputs, and auxiliary mode-restore outputs. For each output or named output-near state signal, trace backward from the Outport/exported signal/output-near named line through its cone to identify source signals, final Switch/Multiport Switch selections, feedback, Unit Delay/Memory/Delay, latches, edge detectors, and special-mode gates.
7. Extract top-level purpose text from model annotations/DocBlocks and module purpose text from subsystem annotations/DocBlocks when present.
8. Draft the document:
   - `功能描述`: the model or module function expressed from model-authored descriptions.
   - `模型总体结构`: functional architecture only: execution entry/period when model-authored, major inputs/outputs, meaningful subsystem relationship, and data flow. Exclude model tooling/configuration audit details.
   - `软件模块功能描述`: one section per meaningful functional module.
9. For each module, write `功能描述` and `实现方式`. Keep `设计依据` blank unless the user explicitly requests populated design bases. In `实现方式`, cover every non-routing row in the output coverage ledger at least once by exact signal/output name. Do not collapse a named output-near memory/restore signal into an unnamed grouped role.
10. Convert evidence into behavior before writing final prose. Do not paste private ledger rows, block counts, direct-source block lists, or statements such as "`<block>` 形成 `<signal>`" as `实现方式`.
11. Run the output self-check from `references/writing-rules.md` before creating the final file. If the draft omits any non-routing ledger output or named output-near memory/restore signal, replaces a model identifier with a Chinese business-label condition, or if `实现方式` is only an evidence inventory instead of condition/action logic, revise the module section before generating DOCX.
12. Create DOCX from the template, preserving styles and heading structure. Provide Markdown only when requested or as a review preview.
13. Validate that every implementation claim has traceable model evidence and that no required module is missing.
14. Clean MATLAB task state before finishing when safe: close loaded models opened for this task and avoid leaving temporary paths or variables that affect future tasks.

## References

Read these references as needed:

- `references/model-evidence.md`: MATLAB MCP/SATK access pattern, addon handling, and evidence collection checklist.
- `references/writing-rules.md`: generalized reviewer feedback and wording rules for module descriptions.
- `references/template-filling.md`: how to fill the bundled Software Detailed Design DOCX template.

## Output Rules

- Use Chinese for narrative text unless the user asks otherwise.
- Keep signal names and model identifiers untranslated. Do not invent Chinese expansions for identifiers.
- Prefer compact natural-language pseudo-code: describe condition groups, thresholds, selections, delays, tables, latches, and output assignment in ordered prose.
- Avoid internal block instance names unless they are the only stable identifier needed for traceability. For example, prefer "取最大值", "按标定延时", "以下任一条件满足", or "查表输出" over listing `Switch2`, `Unit Delay1`, `AND1`, or `Prelookup3`.
- Do not satisfy `实现方式` with evidence inventory. Forbidden final prose patterns include block-type counts, "模块输出按直接来源分组形成", "`RSLatch` 形成 `<signal>`", "`Signal Copy` 形成 `<signal>`", and generic categories such as "保存类输出/手动计算类输出/自动计算类输出" when they are not followed by exact branch conditions.
- Mention raw and final outputs when the model has both. Describe gating, fallback, saturation, hysteresis, delay, edge-triggered memory, and restore behavior when they materially affect outputs, but compress mechanical post-processing into behavior-level phrases such as "候选值取最大值", "下降时按 `<param>` 延时处理", "进入 turn off delay", and "最终输出 `<output>`".
- Mention auxiliary state-holding outputs and named output-near state signals such as `*Rem*`, `*Old*`, `*Pre*`, `*Save*`, and `*EEW*` when they leave the module or affect final outputs. Describe when the value is held, updated, or restored; do not reduce these paths to anonymous Switch/Unit Delay plumbing.
- Treat output-near logic as functional until proven otherwise. A Switch/Multiport Switch plus feedback, Unit Delay/Memory/Delay, edge detection, latch, or special-mode input near an Outport is output shaping/hold/restore behavior, not disposable final wiring.
- Do not end a module description at an intermediate calculation signal when downstream output logic produces a final output, `Rem`/restore output, or held value. Summarize the downstream behavior compactly and name the affected output.
- Before finalizing, remove toolchain/load/update metadata from narrative sections, leave every `设计依据` body blank by default, and reduce final routing or output plumbing to behavior-level wording.
- Do not infer requirements, design bases, calibration intent, or business meaning beyond the model evidence.
