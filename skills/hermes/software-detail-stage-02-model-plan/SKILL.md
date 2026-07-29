---
name: software-detail-stage-02-model-plan
metadata:
  version: "1.0.0"
description: Build the bounded whole-model index, document and analysis hierarchy, direct boundary allowlists, and analysis queue for software-detail stage 2. Use only when a software-detail-minimal-stage-input/v1 manifest explicitly requests software-detail-stage-02-model-plan in a fresh Hermes session.
---

# Software Detail Stage 02: Model Plan

Execute only `software-detail-stage-02-model-plan`. This stage creates the lightweight model plan used by evidence extraction; it does not deep-read all internals, build the output ledger, draft prose, or render DOCX.

## Host execution envelope

Read the authoritative stage input manifest named by the host invocation before any business artifact. Require schema `software-detail-minimal-stage-input/v1`, this exact `stageId`, and the supplied `jobId`, `attempt`, `status`, input `artifacts`, `outputArtifacts`, `gatewayLease`, `runtime.installedPath`, and `candidateResultPath`. Treat every supplied role/path binding and Gateway lease field as immutable.

`runtime.installedPath` is the absolute path of the snapshotted shared runtime installed for this job. Require it to be absolute and readable, call it `<runtime-root>`, and resolve every shared resource below from that root. Never resolve the runtime from the task working directory or a skill-adjacent relative path.

Write every declared result artifact to the exact `relativePath` bound to its role in `outputArtifacts`. After all artifacts validate, write the candidate JSON only to `candidateResultPath` with schema `software-detail-minimal-stage-result/v1`, the manifest's exact `jobId`, `stageId`, `attempt`, `status: "completed"`, `matlabSessionId`, an exact copy of `gatewayLease`, and `artifacts` produced by mapping every `outputArtifacts` entry one-for-one to `{ "role", "relativePath" }`. Do not add, omit, rename, or rebind artifact roles, and do not claim completion before the files exist.

## Required shared contract

Before taking any stage action, read all rules from `<runtime-root>/shared/software-detail-shared-rules.json`. Then read:

- `<runtime-root>/references/model-evidence.md` for the index-only scan and bounded analysis-queue contract.
- `<runtime-root>/references/module-boundary.md` before selecting document units or producing interface allowlists.
- `<runtime-root>/scripts/collect_module_doc_evidence.m` only as an optional compact index helper in the already-open MATLAB session.
- `<runtime-root>/scripts/satk_eval.py` only through an execution adapter explicitly bound to `matlab-session-lease` and the existing Worker/native MATLAB Gateway session.

## Inputs

Require a `software-detail-minimal-stage-input/v1` manifest whose `stageId` is exactly `software-detail-stage-02-model-plan`. Consume only:

- `input-manifest` from `software-detail-stage-01-initialize`.
- `workspace-manifest` from `software-detail-stage-01-initialize`.
- `matlab-session-lease` from `software-detail-stage-01-initialize`.

The invocation must use a fresh Hermes session for this stage attempt while reusing the exact MATLAB session identified by `matlab-session-lease`. It must not start a new MATLAB session. If `satk_eval.py` cannot bind to the leased existing Gateway session, use the Worker-provided Gateway call path instead. Do not initialize, reload, close, or replace the leased MATLAB session.

## Procedure

1. Confirm the three Stage 1 artifacts identify the same job, workspace, model, and live task-owned MATLAB session. Read the already-loaded model through that session.
2. When SATK exposes `model_scan` or another fast scan, use it only as an optional index of hierarchy, ports, annotations, and module candidates. If it is unavailable, continue with a lightweight MATLAB/MCP/SATK overview. Never treat the scan as selected-module evidence. (`SDD-DEF-005`, `SDD-WF-003`)
3. Keep the whole-model pass index-only. Record top-level ports, immediate child subsystems, annotations/DocBlocks, major block categories, and obvious non-functional structures, but do not traverse every selected subsystem's full internals or output cones. A scan or top-level port summary cannot replace the later per-subsystem reads. (`SDD-DEF-006`)
4. If `collect_module_doc_evidence.m` is used for the compact index, call it inside the existing MATLAB session with setup and model close disabled, and keep output-cone/deep-internals options disabled. Do not use the helper to expand every output cone of a document unit.
5. Resolve the meaningful functional root past same-name wrappers or scheduler shells. Select `document_unit` entries from model evidence, not one name regular expression. Prefer functional A-level subsystems when A/B/C naming exists; exclude model-info, function-definition-only, pure documentation, pure routing, display, and configuration structures. Promote a B/C child only after recording evidence that the user requested it or its A parent is non-functional. (`SDD-DEF-008`, `SDD-DEF-009`, `SDD-WF-005`)
6. Build `hierarchy-manifest` before deep reading. Record `documentUnits`, `analysisUnits`, every analysis unit's `parentDocumentUnit`, and every document unit's direct `allowedInputs` and `allowedOutputs`. Keep document hierarchy separate from analysis depth; analysis children do not become final `3.x` sections. (`SDD-WF-004`)
7. Treat each `document_unit` as the parent evidence-aggregation and narrative boundary, not as one deep-read batch. Create an `analysis_unit` queue from the descendants needed to understand each parent. If a document unit has no eligible analysis child, it must still have at least one bounded queue item: use `scope=document_unit_direct` for a demonstrably small unit, or create one `scope=direct_outport` item per direct Outport or bounded shared-source output group. If a unit is still large, subdivide its queue entry by direct Outport or shared-source output group; never plan a whole-subsystem `IncludeOutputCones=true` expansion across every Outport of a non-trivial document unit. An ordinary, `analysis_unit`, or `document_unit_direct` item must contain non-empty `analysisUnit`. A `scope=direct_outport` item must instead contain the exact non-empty `directOutport` name and may omit `analysisUnit`; keep `parentDocumentUnit` on every item and do not rename `directOutport` to another field. (`SDD-DEF-007`, `SDD-WF-006`)
8. Before writing artifacts, group the queue by `parentDocumentUnit` and prove that every selected `document_unit` has at least one queue item. Also prove that every direct Outport belongs to an analysis child, a `document_unit_direct` item, or a `direct_outport`/shared-source item. A document unit with zero queue items is an invalid plan, not a simple-module exception.
9. Write `model-index`, `hierarchy-manifest`, and `analysis-queue` to the paths supplied for those roles. Do not perform the Stage 3 deep reads or write evidence claims in this stage.

## Outputs

- `model-index`: the lightweight whole-model scan containing top-level ports, immediate hierarchy, annotations/DocBlocks, major block categories, candidate modules, and recorded exclusion/promotion evidence.
- `hierarchy-manifest`: the selected `documentUnits`, their direct `allowedInputs`/`allowedOutputs`, all required `analysisUnits`, and every `parentDocumentUnit` relationship.
- `analysis-queue`: the bounded ordered work items needed for Stage 3. Every item has `parentDocumentUnit`; ordinary items use `analysisUnit`, while `scope=direct_outport` items use the exact `directOutport` field and may omit `analysisUnit`.

Complete the stage only after the three artifacts agree on all selected units and queue membership, every document unit has a bounded queue item, and every direct Outport has a planned evidence scope. Leave the task-owned MATLAB session open and unchanged.

## Mapped source clauses

- `SDD-DEF-005`
- `SDD-DEF-006`
- `SDD-DEF-007`
- `SDD-DEF-008`
- `SDD-DEF-009`
- `SDD-WF-003`
- `SDD-WF-004`
- `SDD-WF-005`
- `SDD-WF-006`
