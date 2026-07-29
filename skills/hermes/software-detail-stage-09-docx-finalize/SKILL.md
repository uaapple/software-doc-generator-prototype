---
name: software-detail-stage-09-docx-finalize
metadata:
  version: "1.0.0"
description: Fill, normalize, validate, and package the final software-detail DOCX in pipeline stage 9, then clean only task-owned MATLAB state. Use only when the pipeline explicitly invokes stage 9 in a fresh Hermes session.
---

# Finalize Software-Detail DOCX

Execute only `software-detail-stage-09-docx-finalize`. Do not invoke another stage, recollect model evidence by default, or reuse a Hermes session from another stage or failed attempt.

## Host execution envelope

Read the authoritative stage input manifest named by the host invocation before any business artifact. Require schema `software-detail-minimal-stage-input/v1`, this exact `stageId`, and the supplied `jobId`, `attempt`, `status`, input `artifacts`, `outputArtifacts`, `gatewayLease`, `runtime.installedPath`, and `candidateResultPath`. Treat every supplied role/path binding and Gateway lease field as immutable.

`runtime.installedPath` is the absolute path of the snapshotted shared runtime installed for this job. Require it to be absolute and readable, call it `<runtime-root>`, and resolve every shared resource below from that root. Never resolve the runtime from the task working directory or a skill-adjacent relative path.

Write every declared result artifact to the exact `relativePath` bound to its role in `outputArtifacts`. After all artifacts validate, write the candidate JSON only to `candidateResultPath` with schema `software-detail-minimal-stage-result/v1`, the manifest's exact `jobId`, `stageId`, `attempt`, `status: "completed"`, `matlabSessionId`, an exact copy of `gatewayLease`, and `artifacts` produced by mapping every `outputArtifacts` entry one-for-one to `{ "role", "relativePath" }`. Do not add, omit, rename, or rebind artifact roles, and do not claim completion before the files exist.

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

As the first operational action, read `<runtime-root>/shared/software-detail-shared-rules.json`. Require rule-set ID `software-detail-shared-rules`, version `1.0.0`, and all of these rules:

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

- `<runtime-root>/references/a07-granularity-pattern.md`
- `<runtime-root>/references/writing-rules.md`
- `<runtime-root>/references/template-filling.md`
- `<runtime-root>/scripts/docx_list_format.py`
- `<runtime-root>/scripts/validate_narrative_boundary.py`
- `<runtime-root>/assets/templates/Template_Software_Detailed_Design.docx`

## Finalize and validate

1. Validate the four required roles and relative paths, confirm that they belong to the same job, retain their individual source-stage/source-attempt provenance, require `content-check-report` to record a content pass, and keep every mutable path task-owned. Accept the minimal role-plus-relative-path contract; record a content hash only when the host already supplies one.
2. Preserve every template `设计依据` heading while leaving its body blank by default. Keep requirement IDs and design-basis text as private evidence unless the user explicitly requests design bases; never create a requirements trace matrix (`SDD-DEF-021`).
3. Use `<runtime-root>/assets/templates/Template_Software_Detailed_Design.docx` as the original base unless the user requested only a Markdown preview. Preserve styles, heading hierarchy, title structure, table-of-contents structure, relationships, media, and numbering (`SDD-DEF-022`).
4. Reuse `checked-content`, its hierarchy/ledger provenance, and any checked task-local DOCX for formatting-only requests. Do not restart MATLAB or recollect model evidence unless formatting exposes missing or inconsistent content; then fail this stage and request the appropriate upstream retry (`SDD-DEF-023`).
5. Create implementation sub-points as deterministic native Word level-zero lists. Never depend on a `List Bullet` style and never leave a literal `• ` fallback (`SDD-DEF-024`).
6. Fill the template from `checked-content`, preserving real headings and one module section per document unit. Normalize the generated document with:

   ```text
   python <runtime-root>/scripts/docx_list_format.py <generated.docx> --out <normalized.docx>
   ```

   Require native level-zero numbering, 720 DXA left indent, 360 DXA hanging indent, zero before/after spacing, 1.15 line spacing, and properly spaced introductions (`SDD-WF-018`).
7. Materialize the boundary validator manifest from the hierarchy, allowlist, and identifier data carried by the declared `content-check-report` and `checked-content` outputs. If those business outputs cannot represent the manifest, fail final content validation; never fetch or treat a separate hierarchy-manifest as an additional stage input. Run final non-visual checks:

   ```text
   python <runtime-root>/scripts/docx_list_format.py <final.docx> --check-only
   python <runtime-root>/scripts/validate_narrative_boundary.py --manifest <hierarchy-manifest.json> --text <extracted-docx.txt> --format text
   ```

   Inspect the DOCX package, extract body text, compare it materially with `checked-content`, and rerun boundary-output coverage, evidence mapping, writing, blank-design-basis, and density checks. Render pages only when the user explicitly requests visual review (`SDD-WF-019`).
8. Remove toolchain/load/update metadata from narrative sections, keep design-basis bodies blank, and express final routing or output plumbing only as boundary-visible behavior (`SDD-OUT-012`).
9. After validation, close only models opened for this job and remove only task-specific MATLAB paths recorded by `matlab-session-lease` and `workspace-manifest`. Never run broad cleanup such as `bdclose all` or disturb another task or user session (`SDD-WF-021`).

## Package outputs

Publish `detail-design-docx` only after every final check passes. Use the exact filename bound to its `outputArtifacts.relativePath`: it is derived from the uploaded SLX filename as `<上传的SLX模型文件名去掉扩展名>-software-detail-design.docx`. Do not substitute a workspace, MATLAB-normalized, or legacy filename.

Write `artifact-manifest` with schema `software-detail-artifact-manifest/v1`, exact `jobId`, exact `stageId`, and a positive safe-integer `attempt`. Add `sourceStages["content-check"]` with `stageId: "software-detail-stage-08-content-check"` and the completed stage 8 attempt as a positive safe-integer `sourceAttempt`. `artifacts` must contain exactly one entry with artifact role `role: "detail-design-docx"`, task-relative path in `relativePath`, output filename in `filename`, media type `mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"`, the exact positive safe-integer byte size in `sizeBytes`, and validation results in a non-empty `validation` object containing at least `boundaryValidation: "PASS"`. These values must match the bound output artifact and bytes on disk; when `sha256` is supplied it must match those bytes. Do not use legacy keys `fileName` or `size`. Optional cleanup, `gatewayLease`, and `matlabSessionId` evidence may be included only when already available; their absence does not invalidate an otherwise valid document. Include content hashes and task-owned cleanup evidence only when they are already available; their absence does not invalidate an otherwise valid document. Never include credentials, environment contents, private absolute host paths, or unrequested internal model evidence. On content validation failure, do not publish `detail-design-docx`; preserve any diagnostic and cleanup result for the host.
