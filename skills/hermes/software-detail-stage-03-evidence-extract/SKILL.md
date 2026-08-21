---
name: software-detail-stage-03-evidence-extract
metadata:
  version: "1.0.0"
description: Deep-read the bounded analysis queue in the existing task-owned MATLAB session and persist private evidence shards for software-detail stage 3. Use only when a software-detail-minimal-stage-input/v1 manifest explicitly requests software-detail-stage-03-evidence-extract in a fresh Hermes session.
---

# Software Detail Stage 03: Evidence Extract

Execute only `software-detail-stage-03-evidence-extract`. This stage reads the planned model areas and persists private evidence shards. It does not aggregate the Stage 4 output ledger, project final narrative, draft prose, or render DOCX.

## Host execution envelope

Read the authoritative stage input manifest named by the host invocation before any business artifact. Require schema `software-detail-minimal-stage-input/v1`, this exact `stageId`, and the supplied `jobId`, `attempt`, `status`, input `artifacts`, `outputArtifacts`, `gatewayLease`, `runtime.installedPath`, and `candidateResultPath`. Treat every supplied role/path binding and Gateway lease field as immutable.

`runtime.installedPath` is the absolute path of the snapshotted shared runtime installed for this job. Require it to be absolute and readable, call it `<runtime-root>`, and resolve every shared resource below from that root. Never resolve the runtime from the task working directory or a skill-adjacent relative path.

Write every declared result artifact to the exact `relativePath` bound to its role in `outputArtifacts`. After all artifacts validate, write the candidate JSON only to `candidateResultPath` with schema `software-detail-minimal-stage-result/v1`, the manifest's exact `jobId`, `stageId`, `attempt`, `status: "completed"`, `matlabSessionId`, an exact copy of `gatewayLease`, and `artifacts` produced by mapping every `outputArtifacts` entry one-for-one to `{ "role", "relativePath" }`. Do not add, omit, rename, or rebind artifact roles, and do not claim completion before the files exist.

## Required shared contract

Before taking any stage action, read all rules from `<runtime-root>/shared/software-detail-shared-rules.json`. Then read:

- `<runtime-root>/references/model-evidence.md`, including its bounded output-cone batch contract and required evidence fields.
- `<runtime-root>/scripts/collect_module_doc_evidence.m` when a bounded compact snapshot is useful for the current queue item.
- `<runtime-root>/scripts/satk_eval.py` only through an execution adapter explicitly bound to `matlab-session-lease` and the existing Worker/native MATLAB Gateway session.

## Inputs

Require a `software-detail-minimal-stage-input/v1` manifest whose `stageId` is exactly `software-detail-stage-03-evidence-extract`. Consume only:

- `input-manifest` from `software-detail-stage-01-initialize`.
- `workspace-manifest` from `software-detail-stage-01-initialize`.
- `matlab-session-lease` from `software-detail-stage-01-initialize`.
- `model-index` from `software-detail-stage-02-model-plan`.
- `hierarchy-manifest` from `software-detail-stage-02-model-plan`.
- `analysis-queue` from `software-detail-stage-02-model-plan`.

The invocation must use a fresh Hermes session for this stage attempt while reusing the exact live MATLAB session identified by `matlab-session-lease`. It must not start a new MATLAB session. If `satk_eval.py` cannot bind to the leased existing Gateway session, use the Worker-provided Gateway call path instead. Do not run workspace setup again, reload the model, start another MATLAB process, or close the leased session.

## Procedure

1. Confirm all six input artifacts identify the same job, workspace, model, hierarchy, queue, and task-owned MATLAB session.
2. Process the `analysis-queue` in its declared order. Read one `analysis_unit` at a time by default in the existing MATLAB session. Process `document_unit_direct`, `direct_outport`, and shared-source fallback items exactly like other required queue items. When reading a persisted `scope=document_unit_direct` item, use its `analysisUnit` when present; when it is absent, deterministically use `parentDocumentUnit` as the effective analysis unit. If an explicit `analysisUnit` differs from `parentDocumentUnit`, fail the stage. Write the effective parent path to the shard's `analysisUnitPath`. For `scope=direct_outport`, read the exact `directOutport` even when `analysisUnit` is absent, and write one separate shard whose `parentDocumentUnit` matches the queue item and whose `outports` contains that exact `directOutport`. One shard must not stand in for multiple direct-Outport queue items. Use a small batch only for demonstrably bounded simple children; split a remaining large unit by direct Outport or shared-source output group. Persist each completed shard before starting the next item. (`SDD-DEF-006`, `SDD-DEF-007`, `SDD-WF-006`)
3. For every required document/analysis unit, use MATLAB/MCP/SATK APIs to read the bounded scope's overview, hierarchy, local ports, annotations, DocBlocks, masks, library links, subsystem internals, parameters, lookup tables, delays, Stateflow charts, data dictionaries, and output-near cones. Keep exact model identifiers in private evidence. (`SDD-WF-007`)
4. Treat output-near Switch/Multiport Switch selection, feedback, Unit Delay/Memory/Delay, edge detection, latch, and special-mode gates as functional until model evidence proves otherwise. Capture their exact conditions, selected values/sources, hold/update/restore behavior, fallbacks, and affected direct boundary outputs in the private shard. (`SDD-OUT-010`)
5. Apply the bounded output-cone contract from `model-evidence.md`: do not expand every Outport cone of a non-trivial parent document unit in one call. When `collect_module_doc_evidence.m` is useful, call it inside the existing session with setup and model close disabled, select only the current bounded subsystem, and enable deep options only within that bounded queue scope.
6. Use static `.slx` XML only to supplement one concrete fact after targeted MATLAB/MCP/SATK reads for that fact fail. Never replace the normal MATLAB/SATK evidence path with whole-model XML inspection. (`SDD-DEF-004`)
7. Define one fixed shard schema before collecting any item. The template must predeclare `scope` and every other field used by analysis-child, `document_unit_direct`, direct-Outport, and shared-source shards. Do not add a field to only one MATLAB structure before concatenating or appending it. Normalize each collected shard to the fixed field set and field order before adding it to the result.
8. Persist one private shard per completed queue item. Each shard records its analysis-unit or output-group scope, parent document unit, local ports, annotations/DocBlocks, exact internal facts, relevant parameters/state/lookup/delay/output-near logic, visibility, affected boundary outputs, and any unresolved evidence limitation. A failed fallback read is a failed required queue item: record the safe diagnostic and fail this stage; do not omit the shard and continue to a successful candidate.
9. Write `evidence-shards` as one JSON object with top-level schema `software-detail-evidence-shards/v1` and a top-level `shards` array. Every `shards[]` entry must inline `parentDocumentUnitPath`, `scope`, `scopePath`, canonical `outports` as an array of `{ "name": "<direct-output-short-name>" }`, `limitations` as an array, and a task-relative `shardPath` reference to the persisted private shard. Mirror the queue item's `scopePath` exactly; when the queue item omits it, keep the shard `scopePath` empty. Never fill an omitted `scopePath` with `analysisUnitPath`. Inline `queueItemId` when the queue item supplies `id` or `queueItemId`, but retain the other identity fields because an ID never replaces parent/scope/output checks. For ordinary analysis items, also inline `analysisUnitPath` and every direct document-unit output affected by that analysis item in canonical `outports`. For `direct_outport`, require `scope: "direct_outport"`, set `directOutport` to the exact short-name output from the queue item, and make canonical `outports` contain that exact output. The index may reference persistent shard files, but it must not reduce an entry to only `shardPath`.
10. After writing `evidence-shards`, read that JSON file back from disk and validate the parsed top-level `shards[]` rather than the in-memory MATLAB structures. Check every queue item by `queueItemId` when present and otherwise by its scope identity; check every selected document unit has at least one shard entry; and compare every direct Outport short name with the inlined canonical `outports[].name`. Do not write the successful candidate until this reread validation passes.
11. Write the candidate result only after the persisted `evidence-shards` index passes the reread self-check. Do not draft module prose, collapse internal facts into summaries, or perform Stage 4 aggregation.

## Output

- `evidence-shards`: a self-contained top-level `shards[]` index plus one persisted private shard artifact for every completed analysis-queue item. Each index entry carries its queue/document/scope identity, canonical direct-output names, limitations, and persistent `shardPath`; each `direct_outport` entry lists the queue item's exact short-name `directOutport` in canonical `outports`.

Complete the stage only after every planned queue item is represented, every document unit has evidence, and every direct Outport has direct evidence in its corresponding `direct_outport` shard. Any required fallback execution error fails the stage. Leave the task-owned MATLAB session open for later stages.

## Mapped source clauses

- `SDD-DEF-004`
- `SDD-DEF-006`
- `SDD-DEF-007`
- `SDD-WF-006`
- `SDD-WF-007`
- `SDD-OUT-010`
