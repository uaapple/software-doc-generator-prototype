# Template Filling

Use `assets/templates/Template_Software_Detailed_Design.docx` as the document base. Preserve the existing styles, heading hierarchy, title format, and table-of-contents structure when producing DOCX.

## Expected Structure

The template contains these logical sections:

- `1 功能描述`
- `2 模型总体结构`
- `3 软件模块功能描述`
- one module heading per hierarchy manifest `document_unit`, for example `3.1 A01`
- module subheadings:
  - `功能描述`
  - `设计依据`
  - `实现方式`

## Fill Rules

- Replace the model name in the title with the target model name when practical.
- Fill `1 功能描述` with model-level description text from annotations/DocBlocks when available; otherwise provide a concise model-level summary inferred from top-level inputs/outputs and module names.
- Fill `2 模型总体结构` with the functional model architecture: execution entry or period when model-authored, top-level ports, meaningful first-level modules, important shared signals/data stores, and output flow.
- Do not put evidence-collection or model-configuration audit details in `2 模型总体结构`, including MATLAB/MCP/SATK load or update status, solver, code generation target, model version, or toolchain warnings, unless the user explicitly asks for them.
- Under `3 软件模块功能描述`, create one module heading per selected hierarchy manifest `document_unit`. When an A/B/C hierarchy exists, this normally means one heading per A-level module such as `A01`; B/C descendants are `analysis_unit`s and must not become document headings. Do not create module sections for model-info blocks, function-definition-only containers, pure documentation, pure routing, display/scope, configuration, or final wiring-only structures unless explicitly requested.
- For each module, fill:
  - `功能描述`: what the module does, preferably using model-authored text.
  - `设计依据`: keep the heading but leave the body blank by default. Do not output requirement IDs or DocBlock design-basis text unless the user explicitly requests design bases.
  - `实现方式`: natural-language pseudo-code describing how the `document_unit`'s direct inputs determine its direct outputs. Exact identifiers are limited to that unit's allowlisted boundary inputs, boundary outputs, and explicitly approved public identifiers. Internal signals, child-unit ports, parameters, enums, tables, block names, and state variables remain private evidence by default.
- Before DOCX generation, self-check the Markdown/source draft against `references/writing-rules.md` and `references/module-boundary.md`: design bases blank by default, no toolchain audit details in narrative sections, document units only, no analysis-unit headings, and no internal identifier leakage.
- Before DOCX generation, verify every selected module section is backed by a completed module behavior ledger. Do not assemble the final document from a manually authored static `MODULES` list or high-level module synopsis unless each entry was generated from the corresponding module ledger and checked against it.
- Before DOCX generation, verify selected document units do not omit externally visible state-holding outputs or output finalization behavior. Compare the private output coverage ledger against the draft for hold/update/restore/override behavior, but express that behavior only with the document unit's direct inputs and outputs. Internal lines such as `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, or `*EEW*` are evidence, not required prose identifiers, unless one is itself a direct boundary port.
- Before DOCX generation, search the draft for every `must_mention=yes` boundary output from the ledger. Internal evidence must have `must_mention=no`; finding an internal identifier in the draft is a boundary-validation failure, not a coverage success.
- Before DOCX generation, reject abstract condition labels such as "`...条件`", "`...路径`", "`...逻辑`", or "`...分支`" when an exact allowlisted boundary input identifies the condition. Do not substitute an internal signal, parameter, enum, table, or constant merely because it is more implementation-specific.
- Before DOCX generation, verify `实现方式` does not use "等", "相关条件", "相关逻辑", "若干条件", or vague "影响" to omit logic. Conditions, triggers, and branch lists that affect the described output must be explicit.
- Before DOCX generation, verify no section contains boilerplate process disclaimers such as "模型未提供显式说明", "以下根据端口和结构归纳", or "以下根据结构归纳". If author-provided text is absent, write the module purpose directly without explaining the generation method.
- Before DOCX generation, verify `实现方式` does not contain ports-only aggregation wording such as "共同形成", "共同输出", "参与形成", "参与输出", "形成 ... 输出列表", or "输出 ... 列表". These indicate insufficient evidence; return to module evidence collection instead of generating DOCX.
- Before DOCX generation, verify `实现方式` is not an evidence inventory. Reject and revise drafts containing "模块内部包含", "模块输出按直接来源分组形成", "`RSLatch` 形成", "`Signal Copy` 形成", "保存类输出", "手动计算类输出", or "自动计算类输出" when those phrases replace exact branch conditions.
- Before DOCX generation, verify `实现方式` has translated Simulink structure into behavior. Reject and revise block-instance or routing-mechanism prose such as `RSLatch1`, `Switch5`, `Unit Delay2`, `AND8`, `OR3`, `EdgeFalling1`, `EdgeRising2`, `Goto/From`, or "`<block>` 生成/恢复/决定 `<signal>`". These belong in private evidence only; final prose must state set/reset/select/hold/update/restore/fallback behavior.
- Before DOCX generation, verify complex modules are not compressed into generic broad bullets. If a document unit has multiple non-routing ledger rows or output behavior types, its `实现方式` must visibly include the relevant set/reset/select/hold/update/restore/fallback details, projected onto direct boundary inputs and outputs and usually organized as introductory sentences plus level-one sub-points.
- For complex logic, use an introductory sentence followed by level-one sub-points. Typical sub-points include set condition, reset condition, selection branch, hold branch, restore branch, and fallback branch. Do not use nested lists.

## DOCX Generation Guidance

- Prefer editing the DOCX structure with a document library that preserves styles. If no high-level DOCX library is available, manipulate WordprocessingML carefully and keep the original `styles.xml`, numbering, relationships, and media.
- Keep headings as real Word headings so the table of contents can update in Word/WPS. If possible, update fields after generation; otherwise note that the TOC may need refresh.
- Do not flatten the template to plain text when the requested output is DOCX.
- When the user asks for a quick review first, produce Markdown with the same hierarchy before generating the DOCX.
- Default DOCX validation must be production-compatible and non-visual: inspect the DOCX package, WordprocessingML, styles, numbering, relationships, headings, and extracted text. Do not require page rendering, PDF/PNG export, screenshots, visual overlap checks, or font visual QA as part of the default pass.
- If a user explicitly asks for visual review in an environment that supports it, treat rendering/page screenshots as an optional extra check. Do not block the standard deliverable on visual checks in a non-multimodal or headless production environment.
- Preserve level-one `实现方式` sub-points in DOCX as independent paragraphs. Long conditions may wrap naturally inside a paragraph, but sub-points must not be merged into the preceding or following paragraph.
- Generate every sub-point as a native Word bullet paragraph with `w:numPr` at level 0. Do not depend on the template containing a `List Bullet` style; create a single-level `abstractNum` and `num` programmatically when needed.
- Use deterministic list geometry: left indent `720` DXA, hanging indent `360` DXA, `0 pt` before, `0 pt` after, and `1.15` line spacing. Wrapped lines must align with the bullet text, not with the marker.
- Format the behavior-group introduction with `7 pt` before, `2 pt` after, and `keep_with_next`. Separate groups with the next introduction's paragraph spacing, not with an empty paragraph.
- Never use a literal `• ` prefix as a DOCX fallback. Never attempt `add_paragraph(style='List Bullet')` and catch a missing-style exception after the paragraph has already been inserted; that failure path leaves an empty paragraph in the document.
- Run `scripts/docx_list_format.py` after DOCX assembly. It must remove legacy empty paragraphs immediately before bullets, convert legacy literal bullets to native numbering, and normalize existing native bullets to the geometry above.
- Do not create nested bullets, second-level numbering, or table-based pseudo-lists for implementation sub-points.
- Preserve output-group rhythm in DOCX: each complex direct boundary-output group should appear as an introductory paragraph followed immediately by its level-one sub-points, with visible spacing before the next output-group introduction. Do not insert empty paragraphs inside `实现方式` and do not create a prose group named after an internal output-near state.
- Do not pack multiple behaviors into one DOCX bullet to save space. Split lookup, selection, hold/restore, limiting/saturation, rate limiting, and fallback/default behavior into separate level-one sub-points when they are all relevant to the output.
- Prefer several short bullets over one long bullet. If a bullet contains multiple semicolon-separated clauses or reads as a paragraph-sized algorithm summary, split it before creating the DOCX.
- Do not split symmetric outputs into repetitive DOCX bullet groups when a combined group is clearer. Combined groups must still name every exact allowlisted boundary output and any side-specific allowlisted boundary inputs; internal signals, parameters, and tables remain private.
- After DOCX generation, run `scripts/docx_list_format.py --check-only`. Fail when a sub-point lacks native list markup, uses a literal bullet prefix, has non-level-zero numbering, lacks the required indentation/spacing, or is separated from adjacent bullets by an empty paragraph.
- After DOCX generation, inspect extracted `实现方式` text for overloaded bullets. If a complex module lacks output-group introductory paragraphs or contains paragraph-sized bullets that merge several behavior types, treat the DOCX as failed and regenerate with shorter sub-points.
- After DOCX generation, extract the final DOCX body text, for example through the document library or by reading `word/document.xml`, and run the same wording and narrative-boundary checks used for the Markdown/source draft. The extracted DOCX text must not contain stale draft paragraphs, process disclaimers, ports-only aggregation, block-instance wording, analysis-unit headings, internal model identifiers, or missing implementation sub-points.
- If Markdown/source text and extracted DOCX text disagree materially for a module's `实现方式`, treat the DOCX as failed. Regenerate or patch the DOCX from the checked source, then extract and check again before handing it to the user.

## File Naming

Use a clear default output name:

```text
<ModelName>_软件模块功能描述.docx
```

For Markdown previews:

```text
<ModelName>_软件模块功能描述.md
```
