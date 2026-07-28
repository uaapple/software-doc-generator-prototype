---
name: software-detail-stage-02-model-plan
metadata:
  version: "1.0.0"
description: Build the bounded whole-model index, document and analysis hierarchy, direct boundary allowlists, and analysis queue for software-detail stage 2. Use only when a software-detail-minimal-stage-input/v1 manifest explicitly requests software-detail-stage-02-model-plan in a fresh Hermes session.
---

# Software Detail Stage 02: Model Plan

Execute only `software-detail-stage-02-model-plan`. This stage creates the lightweight model plan used by evidence extraction; it does not deep-read all internals, build the output ledger, draft prose, or render DOCX.

## Required shared contract

Before taking any stage action, read all rules from `../software-detail-runtime/shared/software-detail-shared-rules.json`. Then read:

- `../software-detail-runtime/references/model-evidence.md` for the index-only scan and bounded analysis-queue contract.
- `../software-detail-runtime/references/module-boundary.md` before selecting document units or producing interface allowlists.
- `../software-detail-runtime/scripts/collect_module_doc_evidence.m` only as an optional compact index helper in the already-open MATLAB session.
- `../software-detail-runtime/scripts/satk_eval.py` only through an execution adapter explicitly bound to `matlab-session-lease` and the existing Worker/native MATLAB Gateway session.

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
7. Treat each `document_unit` as the parent evidence-aggregation and narrative boundary, not as one deep-read batch. Create an `analysis_unit` queue from the descendants needed to understand each parent. If a unit is still large, subdivide its queue entry by direct Outport or shared-source output group; never plan a whole-subsystem `IncludeOutputCones=true` expansion across every Outport of a non-trivial document unit. (`SDD-DEF-007`, `SDD-WF-006`)
8. Write `model-index`, `hierarchy-manifest`, and `analysis-queue` to the paths supplied for those roles. Do not perform the Stage 3 deep reads or write evidence claims in this stage.

## Outputs

- `model-index`: the lightweight whole-model scan containing top-level ports, immediate hierarchy, annotations/DocBlocks, major block categories, candidate modules, and recorded exclusion/promotion evidence.
- `hierarchy-manifest`: the selected `documentUnits`, their direct `allowedInputs`/`allowedOutputs`, all required `analysisUnits`, and every `parentDocumentUnit` relationship.
- `analysis-queue`: the bounded ordered work items needed for Stage 3, each tied to one parent document unit and one analysis-unit, direct-Outport, or shared-source output-group scope.

Complete the stage only after the three artifacts agree on all selected units and queue membership. Leave the task-owned MATLAB session open and unchanged.

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
