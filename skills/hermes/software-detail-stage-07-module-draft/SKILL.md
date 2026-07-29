---
name: software-detail-stage-07-module-draft
metadata:
  version: "1.0.0"
description: Draft the module-function sections for software-detail pipeline stage 7 from pinned architecture, ledger, boundary, behavior-group, and narrative-plan artifacts. Use only when the pipeline explicitly invokes stage 7 in a fresh Hermes session.
---

# Draft Software-Detail Modules

Execute only `software-detail-stage-07-module-draft`. Do not invoke another stage, recollect model evidence, render DOCX, or reuse a Hermes session from another stage or failed attempt.

## Host execution envelope

Read the authoritative stage input manifest named by the host invocation before any business artifact. Require schema `software-detail-minimal-stage-input/v1`, this exact `stageId`, and the supplied `jobId`, `attempt`, `status`, input `artifacts`, `outputArtifacts`, `gatewayLease`, `runtime.installedPath`, and `candidateResultPath`. Treat every supplied role/path binding and Gateway lease field as immutable.

`runtime.installedPath` is the absolute path of the snapshotted shared runtime installed for this job. Require it to be absolute and readable, call it `<runtime-root>`, and resolve every shared resource below from that root. Never resolve the runtime from the task working directory or a skill-adjacent relative path.

Write every declared result artifact to the exact `relativePath` bound to its role in `outputArtifacts`. After all artifacts validate, write the candidate JSON only to `candidateResultPath` with schema `software-detail-minimal-stage-result/v1`, the manifest's exact `jobId`, `stageId`, `attempt`, `status: "completed"`, `matlabSessionId`, an exact copy of `gatewayLease`, and `artifacts` produced by mapping every `outputArtifacts` entry one-for-one to `{ "role", "relativePath" }`. Do not add, omit, rename, or rebind artifact roles, and do not claim completion before the files exist.

## Stage contract

```json
{
  "stageId": "software-detail-stage-07-module-draft",
  "version": "1.0.0",
  "hermesSession": "new",
  "responsibility": "Draft each document unit's function description and implementation behavior while leaving design-basis bodies blank by default.",
  "inputs": [
    "matlab-session-lease",
    "output-ledger",
    "boundary-projection",
    "behavior-groups",
    "narrative-plan",
    "architecture-draft"
  ],
  "outputs": [
    "module-draft"
  ]
}
```

Treat every input as a read-only artifact from the same job. Preserve each input's own source stage and source attempt; cross-stage inputs are expected and their attempt identifiers need not match. Use `matlab-session-lease` only to preserve ownership and provenance; this reasoning stage must not call MATLAB. Write only the `module-draft` artifact in the task workspace.

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

Then read these pinned runtime references:

- `<runtime-root>/references/module-boundary.md`
- `<runtime-root>/references/a07-granularity-pattern.md`
- `<runtime-root>/references/writing-rules.md`
- `<runtime-root>/references/template-filling.md`

## Draft procedure

1. Validate the six required roles and task-relative paths, confirm that they belong to the same job, and retain their individual source-stage/source-attempt provenance. Reject missing roles, cross-job artifacts, and paths outside the task workspace. Accept the minimal role-plus-relative-path contract; record a content hash only when the host already supplies one.
2. Read the `document_unit` list carried by `boundary-projection` or `narrative-plan`, then confirm that every listed unit has a complete ledger, boundary projection, behavior groups, and narrative plan. Do not require or fetch a separate hierarchy-manifest input. Treat the whole-model phase as index-only and consume the per-subsystem evidence already produced upstream; never substitute a single scan or top-level port summary (`SDD-DEF-006`).
3. Keep exhaustive private coverage separate from public narrative. Map every internal ledger row to its affected boundary-output group, while keeping internal identifiers out of prose and never marking them as required public mentions (`SDD-DEF-012`).
4. Draft exactly one module section per `document_unit`, never per analysis child. Use model- or subsystem-authored descriptions when present for `功能描述`; retain the supplied `architecture-draft` as context rather than rewriting its model-level section (`SDD-WF-012`, `SDD-WF-013`).
5. For each module, emit `功能描述`, an unchanged `设计依据` heading with a blank body by default, and `实现方式`. Name the direct boundary outputs and only the direct boundary inputs needed to explain them. Cover internal evidence through the owning output group without printing internal names (`SDD-WF-014`).
6. Derive every section from that module's behavior ledger. If applicable `set`, `reset`, `select`, `hold`, `update`, `restore`, or `fallback` facts are missing, fail the stage with an upstream-evidence diagnostic; do not author a static or compressed summary (`SDD-DEF-015`).
7. Translate ledger facts to boundary-observable behavior. Do not paste ledger rows, child names, signals, block counts, direct-source lists, block-instance names, routing mechanisms, or anonymous inferred labels (`SDD-WF-015`, `SDD-DEF-019`).
8. Apply the A07 prose-density pattern: normally 4–8 behavior groups per module, 2–5 level-one sub-points per group, and about 12–30 sub-points total. Treat A07 only as a prose pattern, never as a hierarchy selector (`SDD-DEF-014`).

## Writing gates

- Use Chinese for actions and logical relationships. Use a Chinese mode, state, condition, or value meaning only when model-authored evidence records its source (`SDD-OUT-003`).
- Use compact natural-language pseudo-code for condition groups, thresholds, selections, delays, lookup behavior, latches, assignments, and fallbacks (`SDD-OUT-004`).
- Organize prose by direct document-unit outputs, not ledger rows or private states (`SDD-OUT-005`).
- Keep block-instance names private; translate structural evidence into behavior such as maximum/minimum selection, internal calibrated delay, any/all conditions, lookup, hold, restore, and output assignment (`SDD-OUT-006`).
- Reject evidence inventories, block counts, direct-source summaries, and generic output categories that omit exact supported branches (`SDD-OUT-007`).
- Mention raw, remembered, or final signal identifiers only when they are direct document-unit outputs (`SDD-OUT-008`).
- Keep auxiliary `*Rem*`, `*Old*`, `*Pre*`, `*Save*`, and `*EEW*` state names private unless they are direct ports or explicitly approved (`SDD-OUT-009`).
- Treat output-near selection, feedback, delay, edge, latch, or special-mode logic as functional output shaping until evidence proves pure routing (`SDD-OUT-010`).
- Continue the description through downstream final, restore, or held-output behavior; never stop at an intermediate calculation (`SDD-OUT-011`).

## Validate and return

Before writing `module-draft`, verify exact `document_unit` coverage, exact required boundary-output mentions, complete ledger-to-group mappings, blank design-basis bodies, allowlist-only identifiers, model-authored label provenance, and density limits. Do not create a requirements trace matrix or infer requirements, calibrations, safety intent, or business meaning.

Return one deterministic `module-draft` artifact containing the ordered module sections plus private validation/provenance metadata sufficient for stage 8. On validation failure, return the stage diagnostic and no successful artifact.
