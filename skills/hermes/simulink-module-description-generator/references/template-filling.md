# Template Filling

Use `assets/templates/Template_Software_Detailed_Design.docx` as the document base. Preserve the existing styles, heading hierarchy, title format, and table-of-contents structure when producing DOCX.

## Expected Structure

The template contains these logical sections:

- `1 功能描述`
- `2 模型总体结构`
- `3 软件模块功能描述`
- module heading, for example `3.1 A01`
- module subheadings:
  - `功能描述`
  - `设计依据`
  - `实现方式`

## Fill Rules

- Replace the model name in the title with the target model name when practical.
- Fill `1 功能描述` with model-level description text from annotations/DocBlocks when available; otherwise provide a concise model-level summary inferred from top-level inputs/outputs and module names.
- Fill `2 模型总体结构` with the functional model architecture: execution entry or period when model-authored, top-level ports, meaningful first-level modules, important shared signals/data stores, and output flow.
- Do not put evidence-collection or model-configuration audit details in `2 模型总体结构`, including MATLAB/MCP/SATK load or update status, solver, code generation target, model version, or toolchain warnings, unless the user explicitly asks for them.
- Under `3 软件模块功能描述`, create one module heading per selected functional module. Do not create module sections for model-info blocks, function-definition-only containers, pure documentation, pure routing, display/scope, configuration, or final wiring-only structures unless explicitly requested.
- For each module, fill:
  - `功能描述`: what the module does, preferably using model-authored text.
  - `设计依据`: keep the heading but leave the body blank by default. Do not output requirement IDs or DocBlock design-basis text unless the user explicitly requests design bases.
  - `实现方式`: signal-identifier-driven natural-language pseudo-code of the module's computation. Use exact signal, parameter, enum, table, and output names for conditions and branches.
- Before DOCX generation, self-check the Markdown/source draft against `references/writing-rules.md`: design bases blank by default, no toolchain audit details in narrative sections, selected modules only, and no unnecessary block-instance enumeration.
- Before DOCX generation, verify selected modules do not omit auxiliary state-holding outputs, named output-near state signals, or output-near finalization behavior. In particular, compare the private output coverage ledger against the draft for outputs and named internal lines like `*Rem*`, `*Rstr*`, `*Restore*`, `*Old*`, `*Pre*`, `*Last*`, `*Mem*`, `*Save*`, `*EEW*`, raw/final pairs, final request/actuator outputs, and signals affected by feedback, `Unit Delay`/`Memory`/`Delay`, final `Switch`/`Multiport Switch`, or model-named mode/control gates. Add compact behavior-level sentences for any missing hold/update/restore/override behavior before creating DOCX.
- Before DOCX generation, search the draft for every `must mention` exact output or named output-near state signal from the ledger. If a model evidence name such as a `*Rem*` signal is missing from the draft, revise the module unless the ledger explicitly marks it as pure duplicate routing.
- Before DOCX generation, reject abstract condition labels such as "`...条件`", "`...路径`", "`...逻辑`", or "`...分支`" when exact model signal, parameter, enum, or constant identifiers are available for that condition group.
- Before DOCX generation, verify `实现方式` does not use "等", "相关条件", "相关逻辑", "若干条件", or vague "影响" to omit logic. Conditions, triggers, and branch lists that affect the described output must be explicit.
- Before DOCX generation, verify `实现方式` is not an evidence inventory. Reject and revise drafts containing "模块内部包含", "模块输出按直接来源分组形成", "`RSLatch` 形成", "`Signal Copy` 形成", "保存类输出", "手动计算类输出", or "自动计算类输出" when those phrases replace exact branch conditions.
- For complex logic, use an introductory sentence followed by level-one sub-points. Typical sub-points include set condition, reset condition, selection branch, hold branch, restore branch, and fallback branch. Do not use nested lists.

## DOCX Generation Guidance

- Prefer editing the DOCX structure with a document library that preserves styles. If no high-level DOCX library is available, manipulate WordprocessingML carefully and keep the original `styles.xml`, numbering, relationships, and media.
- Keep headings as real Word headings so the table of contents can update in Word/WPS. If possible, update fields after generation; otherwise note that the TOC may need refresh.
- Do not flatten the template to plain text when the requested output is DOCX.
- When the user asks for a quick review first, produce Markdown with the same hierarchy before generating the DOCX.
- Preserve level-one `实现方式` sub-points in DOCX as independent paragraphs. Long conditions may wrap naturally inside a paragraph, but sub-points must not be merged into the preceding or following paragraph.
- Prefer Word native bullet paragraphs for sub-points, using the template's existing numbering/bullet definitions when available. Keep them at level 0 only.
- If native bullet generation is not stable in the current generator, use normal body paragraphs prefixed with `• ` as a fallback. Do not rely on raw Markdown `- ` in the final DOCX body.
- Do not create nested bullets, second-level numbering, or table-based pseudo-lists for implementation sub-points.
- After DOCX generation, verify either native list markup (`w:numPr`) or the fallback `• ` prefix exists for implementation sub-points, and verify text extraction preserves every sub-point line.

## File Naming

Use a clear default output name:

```text
<ModelName>_软件模块功能描述.docx
```

For Markdown previews:

```text
<ModelName>_软件模块功能描述.md
```
