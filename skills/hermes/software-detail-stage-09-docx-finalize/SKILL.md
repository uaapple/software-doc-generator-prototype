---
name: software-detail-stage-09-docx-finalize
metadata:
  version: "1.0.0"
description: Fill, normalize, validate, and package the final software-detail DOCX in pipeline stage 9, then clean only task-owned MATLAB state. Use only when the pipeline explicitly invokes stage 9 in a fresh Hermes session.
---

# Finalize Software-Detail DOCX

Execute only `software-detail-stage-09-docx-finalize`. Do not invoke another stage, recollect model evidence by default, or reuse a Hermes session from another stage or failed attempt.

## Stage contract

```json
{
  "stageId": "software-detail-stage-09-docx-finalize",
  "version": "1.0.0",
  "hermesSession": "new",
  "responsibility": "Fill the original DOCX template, normalize native Word lists, rerun final text/boundary/coverage/evidence checks, and clean task MATLAB state.",
  "inputs": [
    "workspace-manifest",
    "matlab-session-lease",
    "content-check-report",
    "checked-content"
  ],
  "outputs": [
    "detail-design-docx",
    "artifact-manifest"
  ]
}
```

Treat every input as a read-only artifact from the same job. Preserve each input's own source stage and source attempt; cross-stage inputs are expected and their attempt identifiers need not match. Write only `detail-design-docx`, `artifact-manifest`, and task-owned temporary files declared by `workspace-manifest`.

## Read shared rules first

As the first operational action, read `../software-detail-runtime/shared/software-detail-shared-rules.json`. Require rule-set ID `software-detail-shared-rules`, version `1.0.0`, and all of these rules:

- `SDD-DEF-001`
- `SDD-DEF-002`
- `SDD-DEF-003`
- `SDD-DEF-010`
- `SDD-DEF-011`
- `SDD-DEF-018`
- `SDD-DEF-020`
- `SDD-OUT-001`
- `SDD-OUT-002`
- `SDD-OUT-013`

Fail closed with a safe diagnostic if the shared artifact is missing, unreadable, non-JSON, version-mismatched, or incomplete. Do not infer or reconstruct shared rules.

Then read these pinned runtime resources:

- `../software-detail-runtime/references/a07-granularity-pattern.md`
- `../software-detail-runtime/references/writing-rules.md`
- `../software-detail-runtime/references/template-filling.md`
- `../software-detail-runtime/scripts/docx_list_format.py`
- `../software-detail-runtime/scripts/validate_narrative_boundary.py`
- `../software-detail-runtime/assets/templates/Template_Software_Detailed_Design.docx`

## Finalize and validate

1. Validate the four required roles and relative paths, confirm that they belong to the same job, retain their individual source-stage/source-attempt provenance, require `content-check-report` to record a content pass, and keep every mutable path task-owned. Accept the minimal role-plus-relative-path contract; record a content hash only when the host already supplies one.
2. Preserve every template `设计依据` heading while leaving its body blank by default. Keep requirement IDs and design-basis text as private evidence unless the user explicitly requests design bases; never create a requirements trace matrix (`SDD-DEF-021`).
3. Use `../software-detail-runtime/assets/templates/Template_Software_Detailed_Design.docx` as the original base unless the user requested only a Markdown preview. Preserve styles, heading hierarchy, title structure, table-of-contents structure, relationships, media, and numbering (`SDD-DEF-022`).
4. Reuse `checked-content`, its hierarchy/ledger provenance, and any checked task-local DOCX for formatting-only requests. Do not restart MATLAB or recollect model evidence unless formatting exposes missing or inconsistent content; then fail this stage and request the appropriate upstream retry (`SDD-DEF-023`).
5. Create implementation sub-points as deterministic native Word level-zero lists. Never depend on a `List Bullet` style and never leave a literal `• ` fallback (`SDD-DEF-024`).
6. Fill the template from `checked-content`, preserving real headings and one module section per document unit. Normalize the generated document with:

   ```text
   python ../software-detail-runtime/scripts/docx_list_format.py <generated.docx> --out <normalized.docx>
   ```

   Require native level-zero numbering, 720 DXA left indent, 360 DXA hanging indent, zero before/after spacing, 1.15 line spacing, and properly spaced introductions (`SDD-WF-018`).
7. Materialize the boundary validator manifest from the hierarchy, allowlist, and identifier data carried by the declared `content-check-report` and `checked-content` outputs. If those business outputs cannot represent the manifest, fail final content validation; never fetch or treat a separate hierarchy-manifest as an additional stage input. Run final non-visual checks:

   ```text
   python ../software-detail-runtime/scripts/docx_list_format.py <final.docx> --check-only
   python ../software-detail-runtime/scripts/validate_narrative_boundary.py --manifest <hierarchy-manifest.json> --text <extracted-docx.txt> --format text
   ```

   Inspect the DOCX package, extract body text, compare it materially with `checked-content`, and rerun boundary-output coverage, evidence mapping, writing, blank-design-basis, and density checks. Render pages only when the user explicitly requests visual review (`SDD-WF-019`).
8. Remove toolchain/load/update metadata from narrative sections, keep design-basis bodies blank, and express final routing or output plumbing only as boundary-visible behavior (`SDD-OUT-012`).
9. After validation, close only models opened for this job and remove only task-specific MATLAB paths recorded by `matlab-session-lease` and `workspace-manifest`. Never run broad cleanup such as `bdclose all` or disturb another task or user session (`SDD-WF-021`).

## Package outputs

Publish `detail-design-docx` only after every final check passes. Use the deterministic default filename `<ModelName>_软件模块功能描述.docx` unless the job specifies another safe name.

Write `artifact-manifest` with the contract version, job/stage/attempt identity, source-stage/source-attempt provenance, artifact role, task-relative path, output filename, media type, size, and validation results. Include content hashes and task-owned cleanup evidence only when they are already available; their absence does not invalidate an otherwise valid document. Never include credentials, environment contents, private absolute host paths, or unrequested internal model evidence. On content validation failure, do not publish `detail-design-docx`; preserve any diagnostic and cleanup result for the host.
