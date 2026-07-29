---
name: software-detail-stage-08-content-check
metadata:
  version: "1.0.0"
description: Validate and repair software-detail pipeline content in stage 8 for hierarchy, boundary, density, coverage, evidence traceability, identifiers, and writing rules. Use only when the pipeline explicitly invokes stage 8 in a fresh Hermes session.
---

# Check Software-Detail Content

Execute only `software-detail-stage-08-content-check`. Do not invoke another stage, recollect model evidence, render DOCX, or reuse a Hermes session from another stage or failed attempt.

## Host execution envelope

Read the authoritative stage input manifest named by the host invocation before any business artifact. Require schema `software-detail-minimal-stage-input/v1`, this exact `stageId`, and the supplied `jobId`, `attempt`, `status`, input `artifacts`, `outputArtifacts`, `gatewayLease`, `runtime.installedPath`, and `candidateResultPath`. Treat every supplied role/path binding and Gateway lease field as immutable.

`runtime.installedPath` is the absolute path of the snapshotted shared runtime installed for this job. Require it to be absolute and readable, call it `<runtime-root>`, and resolve every shared resource below from that root. Never resolve the runtime from the task working directory or a skill-adjacent relative path.

Write every declared result artifact to the exact `relativePath` bound to its role in `outputArtifacts`. After all artifacts validate, write the candidate JSON only to `candidateResultPath` with schema `software-detail-minimal-stage-result/v1`, the manifest's exact `jobId`, `stageId`, `attempt`, `status: "completed"`, `matlabSessionId`, an exact copy of `gatewayLease`, and `artifacts` produced by mapping every `outputArtifacts` entry one-for-one to `{ "role", "relativePath" }`. Do not add, omit, rename, or rebind artifact roles, and do not claim completion before the files exist.

## Stage contract

```json
{
  "stageId": "software-detail-stage-08-content-check",
  "version": "1.0.0",
  "hermesSession": "new",
  "responsibility": "Run and repair hierarchy, boundary, density, output-coverage, internal-identifier, traceability, and writing checks.",
  "inputs": [
    "matlab-session-lease",
    "output-ledger",
    "coverage-report",
    "architecture-draft",
    "module-draft"
  ],
  "outputs": [
    "checked-content",
    "content-check-report"
  ]
}
```

Treat every input as a read-only artifact from the same job. Preserve each input's own source stage and source attempt; cross-stage inputs are expected and their attempt identifiers need not match. Use `matlab-session-lease` only for ownership and provenance; this reasoning stage must not call MATLAB. Write only `checked-content` and `content-check-report` in the task workspace.

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

- `<runtime-root>/references/model-evidence.md`
- `<runtime-root>/references/module-boundary.md`
- `<runtime-root>/references/a07-granularity-pattern.md`
- `<runtime-root>/references/writing-rules.md`
- `<runtime-root>/references/template-filling.md`
- `<runtime-root>/scripts/validate_narrative_boundary.py`

## Check and repair

1. Validate the five required roles and task-relative paths, confirm that they belong to the same job, and retain their individual source-stage/source-attempt provenance. Reject missing roles, cross-job artifacts, and paths outside the task workspace. Accept the minimal role-plus-relative-path contract; record a content hash only when the host already supplies one.
2. Combine `architecture-draft` and `module-draft` into a candidate without changing the prescribed hierarchy. Compare it with the private `output-ledger` and `coverage-report`.
3. Run every writing self-check, hierarchy/boundary check, and density gate. Fail if a Heading 2 does not exactly match a `document_unit`, an analysis child becomes a module heading, any internal row is unmapped, any internal identifier leaks into prose, or any required boundary output is absent (`SDD-WF-016`).
4. Enforce normally 4–8 behavior groups per module, 2–5 level-one sub-points per group, and about 12–30 sub-points total after regrouping. Never use A07 prose density to change Simulink hierarchy (`SDD-DEF-014`).
5. Materialize the candidate source draft and derive the boundary validator manifest from document-unit, analysis-unit, allowlist, and identifier data carried by the declared `output-ledger`, `coverage-report`, `architecture-draft`, or `module-draft` inputs. If those business artifacts cannot represent the required manifest, fail content validation; never fetch or treat a separate hierarchy-manifest as an additional stage input. Then run:

   ```text
   python <runtime-root>/scripts/validate_narrative_boundary.py --manifest <hierarchy-manifest.json> --text <candidate.md> --format markdown
   ```

   Treat unreadable/non-JSON manifests, missing headings or outputs, and every identifier leak as failures. Repair all supported leaks before DOCX generation and rerun the validator (`SDD-WF-017`).
6. Check claim-to-evidence traceability: every implementation claim must cite private model evidence, every internal row must map to one boundary-output narrative group or justified routing exclusion, and no required unit or output may be missing (`SDD-WF-020`). This is evidence traceability only; never create or infer a requirements trace matrix.
7. Remove toolchain, load, update, solver, model-version, and similar audit metadata from narrative sections. Leave every `设计依据` body blank by default and reduce final routing/plumbing to behavior-level wording (`SDD-OUT-012`).
8. Repair only when the declared artifacts contain sufficient exact evidence. Never invent a missing condition, label, identifier meaning, requirement, calibration, safety intent, or business meaning. If evidence is incomplete or contradictory, fail with a diagnostic that names the affected artifact role and boundary output without leaking sensitive paths or content.

## Produce deterministic outputs

Write `checked-content` as the fully ordered, repaired source content ready for controlled template filling. Preserve exact hierarchy headings, blank design-basis sections, level-one implementation sub-points, and provenance links to private evidence.

Write `content-check-report` with deterministic rule results, validator command status, document-unit and boundary-output coverage, ledger mapping counts, density counts, repair records, source-stage/source-attempt provenance, optional host-provided content hashes, and final pass/fail. Do not report success unless every content gate passes. On failure, emit no successful `checked-content`.
