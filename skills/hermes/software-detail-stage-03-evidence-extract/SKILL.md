---
name: software-detail-stage-03-evidence-extract
metadata:
  version: "1.0.0"
description: Deep-read the bounded analysis queue in the existing task-owned MATLAB session and persist private evidence shards for software-detail stage 3. Use only when a software-detail-minimal-stage-input/v1 manifest explicitly requests software-detail-stage-03-evidence-extract in a fresh Hermes session.
---

# Software Detail Stage 03: Evidence Extract

Execute only `software-detail-stage-03-evidence-extract`. This stage reads the planned model areas and persists private evidence shards. It does not aggregate the Stage 4 output ledger, project final narrative, draft prose, or render DOCX.

## Required shared contract

Before taking any stage action, read all rules from `../software-detail-runtime/shared/software-detail-shared-rules.json`. Then read:

- `../software-detail-runtime/references/model-evidence.md`, including its bounded output-cone batch contract and required evidence fields.
- `../software-detail-runtime/scripts/collect_module_doc_evidence.m` when a bounded compact snapshot is useful for the current queue item.
- `../software-detail-runtime/scripts/satk_eval.py` only when the supplied environment uses that MCP bridge to the existing task-owned MATLAB session.

## Inputs

Require a `software-detail-minimal-stage-input/v1` manifest whose `stageId` is exactly `software-detail-stage-03-evidence-extract`. Consume only:

- `input-manifest` from `software-detail-stage-01-initialize`.
- `workspace-manifest` from `software-detail-stage-01-initialize`.
- `matlab-session-lease` from `software-detail-stage-01-initialize`.
- `model-index` from `software-detail-stage-02-model-plan`.
- `hierarchy-manifest` from `software-detail-stage-02-model-plan`.
- `analysis-queue` from `software-detail-stage-02-model-plan`.

The invocation must use a fresh Hermes session for this stage attempt while reusing the exact live MATLAB session identified by `matlab-session-lease`. Do not run workspace setup again, reload the model, start another MATLAB process, or close the session.

## Procedure

1. Confirm all six input artifacts identify the same job, workspace, model, hierarchy, queue, and task-owned MATLAB session.
2. Process the `analysis-queue` in its declared order. Read one `analysis_unit` at a time by default in the existing MATLAB session. Use a small batch only for demonstrably bounded simple children; split a remaining large unit by direct Outport or shared-source output group. Persist each completed shard before starting the next item. (`SDD-DEF-006`, `SDD-DEF-007`, `SDD-WF-006`)
3. For every required document/analysis unit, use MATLAB/MCP/SATK APIs to read the bounded scope's overview, hierarchy, local ports, annotations, DocBlocks, masks, library links, subsystem internals, parameters, lookup tables, delays, Stateflow charts, data dictionaries, and output-near cones. Keep exact model identifiers in private evidence. (`SDD-WF-007`)
4. Treat output-near Switch/Multiport Switch selection, feedback, Unit Delay/Memory/Delay, edge detection, latch, and special-mode gates as functional until model evidence proves otherwise. Capture their exact conditions, selected values/sources, hold/update/restore behavior, fallbacks, and affected direct boundary outputs in the private shard. (`SDD-OUT-010`)
5. Apply the bounded output-cone contract from `model-evidence.md`: do not expand every Outport cone of a non-trivial parent document unit in one call. When `collect_module_doc_evidence.m` is useful, call it inside the existing session with setup and model close disabled, select only the current bounded subsystem, and enable deep options only within that bounded queue scope.
6. Use static `.slx` XML only to supplement one concrete fact after targeted MATLAB/MCP/SATK reads for that fact fail. Never replace the normal MATLAB/SATK evidence path with whole-model XML inspection. (`SDD-DEF-004`)
7. Persist one private shard per completed queue item. Each shard records its analysis-unit or output-group scope, parent document unit, local ports, annotations/DocBlocks, exact internal facts, relevant parameters/state/lookup/delay/output-near logic, visibility, affected boundary outputs, and any unresolved evidence limitation.
8. Write the `evidence-shards` role as the complete index of the persisted shards and their queue-item coverage. Do not draft module prose, collapse internal facts into summaries, or perform Stage 4 aggregation.

## Output

- `evidence-shards`: an index plus the persisted private shard artifacts for every completed analysis-queue item. The union must retain the per-item evidence needed to aggregate each parent document unit and must identify unresolved items without inventing facts.

Complete the stage only after every planned queue item is represented by a persisted shard or an explicit unresolved limitation. Leave the task-owned MATLAB session open for later stages.

## Mapped source clauses

- `SDD-DEF-004`
- `SDD-DEF-006`
- `SDD-DEF-007`
- `SDD-WF-006`
- `SDD-WF-007`
- `SDD-OUT-010`
