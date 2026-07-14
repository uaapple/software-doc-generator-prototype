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
- Use one task-owned MATLAB process/session as the default evidence path. For front-end, unattended, or production document-generation tasks, start a task-owned new MATLAB process, such as one `matlab -batch` job or MCP/SATK `new` session, rather than trying to attach to a user-open MATLAB first. Load and initialize MATLAB once per generation task, keep the model open while collecting evidence and drafting, and close only task-owned model state at the end.
- Static `.slx` XML inspection may supplement MCP/SATK evidence only after targeted MCP/SATK reads fail for a concrete item; it must not replace the MATLAB/SATK evidence path.
- When SATK exposes a fast model scanning utility such as `model_scan`, use it as an optional front-end index for hierarchy, ports, annotations, and candidate module selection. Do not treat scan output as a substitute for targeted MATLAB/MCP/SATK evidence on selected modules.
- For models with multiple functional subsystems, use a split-read workflow by default: first build a lightweight whole-model index, then read and draft each selected subsystem one by one. The whole-model phase is index-only; do not run a heavy all-model output-cone or full-internals collector before the per-subsystem queue. A single whole-model scan or top-level port summary must not replace per-subsystem deep evidence.
- Treat a `document_unit` as the evidence aggregation and narrative boundary, not as the default deep-read batch. For a non-trivial document unit, never enable a helper's whole-subsystem `IncludeOutputCones=true` mode or equivalent single-call expansion across all of its Outports. Process descendant `analysis_unit`s individually by default; when one remains large, split it again by direct Outport or shared-source output group, and merge the resulting ledger fragments into the parent.
- Separate document hierarchy from analysis depth. Use `document_unit` for final `3.x` sections and `analysis_unit` for child subsystems read only to understand the parent. Deep-reading B/C children must not promote them into document modules.
- When the model uses `A\d+_`/`B\d+_`/`C\d+_` naming, default to functional A-level subsystems as `document_unit`; treat B/C descendants as `analysis_unit`. Promote a B/C subsystem only when the user explicitly requests that level or model evidence proves its A parent is pure routing, documentation, or configuration.
- Treat each `document_unit`'s direct Inports and Outports as the default narrative boundary. Trace internal signals, states, parameters, tables, and child outputs as private evidence, but do not print identifiers that are invisible at the document-unit boundary.
- Apply the boundary allowlist per document unit, not as exclusive global signal ownership. A signal may legitimately be an A02 direct output and an A01 direct input; it may appear in A01 prose when it is listed in A01 `allowedInputs`. If the connected A02 Outport and A01 Inport use different names, use the A01-side direct Inport name inside the A01 section.
- Keep evidence coverage and narrative coverage separate. The private output-first ledger may be exhaustive; final prose must project internal behavior onto direct document-unit inputs and outputs. Every internal row must map to a boundary-output behavior group, but internal identifiers are never `must_mention` by default.
- Treat the private ledger as a model-fact ledger, not a prose draft. Store exact identifiers, comparison operators, operands, edges, actions, selected values/sources, affected outputs, priorities, and fallbacks. Do not store inferred Chinese business meanings or free-form summary sentences as substitutes for those facts.
- Target the behavior-density pattern defined in `references/a07-granularity-pattern.md`: normally 4-8 behavior groups per module, 2-5 level-one sub-points per group, and about 12-30 sub-points total. "A07-style" names a prose pattern only; it never selects a Simulink hierarchy level.
- Do not hand-author a static module summary list as the source of the final document. Each module section must be derived from that module's behavior ledger. If a selected module lacks a behavior ledger with explicit `set`, `reset`, `select`, `hold`, `update`, `restore`, or `fallback` fields as applicable, keep collecting evidence for that module instead of drafting a compressed summary.
- Assume the UI/platform has copied selected addon files into the task workspace. Add and initialize those workspace addon/project files before loading the model; do not read unrelated external addon roots.
- Before running auto-generated addon/init/data scripts such as `*_dd.m`, sanitize the task-workspace copy by removing standalone `clear`/`clearvars` commands. These commands can erase session variables and break task-scoped MATLAB session reuse.
- Preserve exact identifiers in private evidence. In final prose, use only identifiers on the document-unit allowlist: direct Inports, direct Outports, and identifiers the user explicitly approves for publication.
- Generate module-level descriptions, not a block-by-block SATK dump.
- Keep final documents focused on functional design. Do not output evidence-collection or model-configuration metadata such as MATLAB/SATK load status, update success, solver, target file, or model version unless the user explicitly asks for that audit information.
- Preserve the template's `设计依据` headings but leave their body content blank by default, even when requirement IDs or design basis text appear in annotations or DocBlocks. Use those IDs as internal evidence only unless the user explicitly asks to include design bases.
- Use the bundled DOCX template at `assets/templates/Template_Software_Detailed_Design.docx` for the final document unless the user only asks for Markdown preview.
- When the user requests only DOCX formatting, title, list, TOC, or page-layout changes and a checked Markdown draft, hierarchy manifest, ledger, or DOCX already exists, reuse those task artifacts. Do not restart MATLAB or recollect model evidence unless the formatting pass exposes missing or inconsistent content.
- Generate `实现方式` sub-points as deterministic native Word lists. Do not depend on a template-provided `List Bullet` style and do not use a literal `• ` paragraph as fallback.

Minimal prompt example:

```text
Use $simulink-module-description-generator to generate a software module function description for /path/to/Model.slx.
```

## Workflow

1. Locate the model, task workspace, and any UI-selected addon/project files.
2. Start one task-owned MATLAB process/session for the generation task. For front-end, unattended, or production tasks, prefer `matlab -batch` or MCP/SATK `SATK_MATLAB_SESSION_MODE=new`; use `existing`/attach only when the user explicitly says a MATLAB session is already open or the platform provides an active session. Run `scripts/setup_module_doc_support.m` in that same MATLAB process before model load or SATK reads, add the selected workspace addon/project files once, sanitize and run initialization scripts once, and `load_system` the target model once. Do not repeatedly start `matlab -batch`, reopen/close MATLAB, or create a fresh MATLAB process for module-level reads. If `scripts/satk_eval.py` is used as a bridge, keep its default `SATK_MATLAB_SESSION_MODE=new`; do not spend time diagnosing an attach failure when no existing MATLAB session is expected.
3. If available, run a fast model scan in the task-owned MATLAB process/session to build a compact index of top-level ports, immediate child subsystems, annotations/DocBlocks, major block categories, and obvious non-functional structures. For multi-subsystem models, keep this scan index-only: do not traverse every selected subsystem's output cone, full internals, or deep dependencies during the global phase.
4. Build a hierarchy manifest before deep reading. Record `documentUnits`, `analysisUnits`, each analysis unit's `parentDocumentUnit`, and each document unit's direct `allowedInputs` and `allowedOutputs`. Never select final document modules with one name regex. Follow `references/module-boundary.md`.
5. Select meaningful `document_unit` modules. Resolve the functional root past same-name wrappers or scheduler shells. Prefer functional A-level subsystems when an A/B/C naming scheme exists. Exclude model-info, function-definition-only, pure documentation, pure routing, display, and configuration structures. Record evidence before promoting any B/C child over an A parent.
6. Create an `analysis_unit` queue from the descendants needed to understand each document unit. Process each child individually in the same MATLAB process/session by default. Use a small batch only when the children are simple and demonstrably bounded. If an analysis unit is still large, create sub-batches by direct Outport or shared-source output group. Persist each completed ledger fragment before starting the next batch, aggregate all fragments into the parent document unit, and never draft a `3.x` section for an analysis unit.
7. Read every document unit and required analysis unit with MCP/SATK/MATLAB APIs from the same task-owned MATLAB process/session: overview, hierarchy, ports, annotations, DocBlocks, masks, library links, subsystem internals, parameters, lookup tables, delays, Stateflow charts, data dictionaries, and output-near cones. Apply the bounded output-cone contract in `references/model-evidence.md`; "output-first" means queueing from outputs, not expanding every output cone of a complex document unit in one call.
8. For each document unit, create a private output coverage ledger before drafting. Start from its direct Outports and trace backward through analysis units. Include internal lines and state signals needed to understand output shaping, but add `visibility=document_boundary|internal_evidence` to every row. Mark `must_mention=yes` only for direct document-unit Inports/Outports that the narrative must name; internal rows, including behaviorally unique `material_state` rows, always use `must_mention=no` and map to an affected boundary output.
9. For each ledger item, trace backward through its cone to identify source signals, final selections, feedback, delay/memory, latches, edge detectors, and special-mode gates. Keep exact internal facts privately and map each one to a direct document-unit output.
10. Build a private narrative compression plan grouped by direct document-unit outputs. Record `boundary_inputs`, `boundary_outputs`, `internal_evidence_rows`, `condition_actions`, and `covered_ledger_items`. Do not use an internal signal as a group title.
11. Project the behavior groups onto the current document unit's boundary. Express conditions with that unit's direct inputs and actions with that unit's direct outputs. Allow a cross-A signal when it is a direct port of the current unit, even if the same signal is also another A unit's output. If a condition cannot be traced to a current-unit boundary input, keep it private and describe only the supported boundary behavior without inventing a label, threshold, or identifier. Do not expose internal signals, child ports, state names, calibration names, or table names unless the user explicitly approves them.
12. Extract top-level purpose text from model annotations/DocBlocks and document-unit purpose text from subsystem annotations/DocBlocks when present.
13. Draft the document:
   - `功能描述`: the model or module function expressed from model-authored descriptions.
   - `模型总体结构`: functional architecture only: execution entry/period when model-authored, major inputs/outputs, meaningful subsystem relationship, and data flow. Exclude model tooling/configuration audit details.
   - `软件模块功能描述`: one section per `document_unit`, never one section per analysis child by default.
14. For each document unit, write `功能描述` and `实现方式`. Keep `设计依据` blank unless explicitly requested. Name direct boundary outputs and the direct boundary inputs needed to explain them. Cover internal rows through their affected boundary-output group without printing internal names.
15. Convert evidence into behavior before writing final prose. Do not paste ledger rows, child subsystem names, internal signals, block counts, direct-source lists, block-instance names, routing mechanisms, or anonymous inferred labels.
16. Run the self-check from `references/writing-rules.md`, hierarchy/boundary checks from `references/module-boundary.md`, and the density gate from `references/a07-granularity-pattern.md`. Fail if a Heading 2 does not match `documentUnits`, any internal row is unmapped, any internal identifier appears in prose, or any required boundary output is absent.
17. Run `scripts/validate_narrative_boundary.py` on the Markdown/source draft with the hierarchy manifest. Fix every leaked identifier before DOCX generation.
18. Create DOCX from the template, preserving styles and heading structure. Run `scripts/docx_list_format.py` on the generated DOCX so every `实现方式` sub-point uses native level-zero numbering with deterministic indentation and spacing. Provide Markdown only when requested or as a review preview.
19. Run `scripts/docx_list_format.py --check-only` on the final DOCX, then extract its text and rerun the boundary validator plus output and density checks. Use non-visual DOCX/package checks by default; do not run page rendering unless the user explicitly asks for visual review.
20. Validate that every implementation claim has traceable private evidence, every internal row maps to a boundary-output narrative group, and no required document unit or boundary output is missing.
21. Clean MATLAB task state before finishing when safe: close only models opened for this task, remove task-specific paths if they were added, and avoid broad cleanup such as `bdclose all` when other sessions/models may be user-owned.

## References

Read these references as needed:

- `references/model-evidence.md`: MATLAB MCP/SATK access pattern, addon handling, and evidence collection checklist.
- `references/module-boundary.md`: mandatory document-unit selection, A/B/C hierarchy, interface allowlist, and narrative-boundary validation. Read it before selecting modules or drafting.
- `references/writing-rules.md`: generalized reviewer feedback and wording rules for module descriptions.
- `references/a07-granularity-pattern.md`: mandatory target granularity, behavior-group layout, density gate, compact example, and short anti-pattern checklist. Read it before drafting module prose.
- `references/template-filling.md`: how to fill the bundled Software Detailed Design DOCX template.

## Output Rules

- Use Chinese for narrative text unless the user asks otherwise.
- Keep allowed boundary signal names untranslated. Do not print internal identifiers or invent Chinese expansions for them.
- In `实现方式`, use Chinese only for actions and logical relationships by default. Use Chinese mode, state, condition, or value meanings only when the model explicitly authors that label and the private ledger records its source.
- Prefer compact natural-language pseudo-code: describe condition groups, thresholds, selections, delays, tables, latches, and output assignment in ordered prose.
- Organize prose by direct document-unit outputs, not by every ledger row or internal signal. Keep internal states in private evidence even when their behavior is unique.
- Avoid internal block instance names in final prose. For example, prefer "取最大值", "按标定延时", "以下任一条件满足", or "查表输出" over listing `Switch2`, `Unit Delay1`, `AND1`, or `Prelookup3`. If a block name is the only available traceability handle, keep it in private evidence, not in polished `实现方式`.
- Do not satisfy `实现方式` with evidence inventory. Forbidden final prose patterns include block-type counts, "模块输出按直接来源分组形成", "`RSLatch` 形成 `<signal>`", "`Signal Copy` 形成 `<signal>`", and generic categories such as "保存类输出/手动计算类输出/自动计算类输出" when they are not followed by exact branch conditions.
- Mention raw, remembered, and final signals only when they are direct outputs of the document unit. If they are internal, describe their effect on a boundary output without naming them.
- Keep auxiliary state-holding signals such as `*Rem*`, `*Old*`, `*Pre*`, `*Save*`, and `*EEW*` private unless they are direct document-unit ports or the user explicitly approves publication.
- Treat output-near logic as functional until proven otherwise. A Switch/Multiport Switch plus feedback, Unit Delay/Memory/Delay, edge detection, latch, or special-mode input near an Outport is output shaping/hold/restore behavior, not disposable final wiring.
- Do not end a module description at an intermediate calculation signal when downstream output logic produces a final output, `Rem`/restore output, or held value. Summarize the downstream behavior compactly and name the affected output.
- Before finalizing, remove toolchain/load/update metadata from narrative sections, leave every `设计依据` body blank by default, and reduce final routing or output plumbing to behavior-level wording.
- Do not infer requirements, design bases, calibration intent, or business meaning beyond the model evidence.
