---
name: software-detail-stage-04-output-ledger
metadata:
  version: "1.0.0"
description: Aggregate completed Simulink evidence shards by document unit into a private output-first behavior ledger and coverage report. Use only when the software-detail orchestrator explicitly invokes stage 4 with its pinned stage inputs.
---

# Software Detail Stage 04 Output Ledger

Execute only Stage 4. Use a new Hermes session for this stage attempt; never reuse a
Hermes session from another stage or a failed attempt. Reuse the task-owned MATLAB
session identified by the lease, but do not initialize, replace, or close it.

## Mandatory first read

Before reading or transforming any business artifact, read
`../software-detail-runtime/shared/software-detail-shared-rules.json`. Require the
shared rule set to be present and readable, then apply these mapped shared clauses:

- `SDD-DEF-001`, `SDD-DEF-002`, `SDD-DEF-003`
- `SDD-DEF-010`, `SDD-DEF-011`, `SDD-DEF-018`, `SDD-DEF-020`
- `SDD-OUT-001`, `SDD-OUT-002`, `SDD-OUT-013`

These clauses keep the model as source of truth, preserve evidence quality and the
job-owned MATLAB session, enforce per-document-unit boundary allowlists and private
internal identifiers, exclude tool metadata, use Chinese narrative where applicable,
and prohibit invented meanings.

Then read, without modifying:

- `../software-detail-runtime/references/model-evidence.md` for the output-first
  ledger fields, reverse-trace behavior, bounded aggregation, and coverage rules.
- `../software-detail-runtime/references/module-boundary.md` for document-unit
  boundaries, visibility, allowlists, and internal-row mapping.

Wave0 assigns no shared runtime script to Stage 4. Do not invoke a script owned by
another stage or recollect model evidence.

## Contract

### Inputs

Require exactly the pinned Stage 4 inputs:

- `matlab-session-lease`
- `analysis-queue`
- `evidence-shards`

### Outputs

Produce exactly these output roles:

- `output-ledger`
- `coverage-report`

Write only the artifacts bound to those roles. Do not draft architecture or module
prose, generate DOCX, or execute another stage.

## Procedure

1. Validate that the inputs belong to the same job, preserve each input's originating
   stage and attempt for traceability, confirm that the MATLAB lease names the
   existing task-owned session, and tie every completed shard to an analysis-queue
   item and its parent `document_unit`.
2. Aggregate shard fragments by parent `document_unit`. Treat a document unit as the
   aggregation boundary, not as a new whole-subsystem deep-read batch. Preserve
   unresolved evidence limitations instead of filling them with guesses.
3. For each document unit, enumerate its direct Outports and work backward through
   the supplied evidence. Retain final selections, feedback, delay/memory, latches,
   edge detectors, special-mode gates, lookup/calculation facts, priorities, and
   fallback behavior that shape each direct output.
4. Store model facts rather than prose. Preserve exact private identifiers,
   comparison operators, operands, edges, actions, selected sources or values,
   affected outputs, priorities, and fallbacks. Continue past a bare block type or
   routing source until condition/action fields are available, or mark the item
   `pure_routing` with its evidence-backed reason.
5. Give every ledger row `visibility`, `affected_boundary_output`,
   `behavior_group`, and `must_mention`. Use `must_mention=yes` only for a direct
   document-unit boundary identifier; every internal row, including material state,
   uses `visibility=internal_evidence`, `must_mention=no`, and maps to a direct
   boundary output.
6. Treat Switch/Multiport Switch with feedback, Delay/Memory/Unit Delay, edge
   detection, latch, and special-mode logic near an Outport as functional output
   shaping until evidence proves pure routing.
7. Build `coverage-report` separately from the private ledger. Report coverage for
   every direct output, every analysis-queue fragment, and every internal row's
   boundary-output mapping. Mark missing or unresolved coverage explicitly; do not
   turn incomplete evidence into generic prose.

## Stage-specific source clauses

- `SDD-DEF-007`: merge bounded analysis-unit or output-group ledger fragments into
  the parent document unit without expanding a complex document unit as one batch.
- `SDD-DEF-012`: keep exhaustive private evidence coverage separate from later
  boundary-projected narrative coverage.
- `SDD-DEF-013`: keep the ledger factual and exact; never replace facts with inferred
  Chinese business meanings or free-form summary sentences.
- `SDD-WF-008`: start from direct Outports, assign visibility and `must_mention`, and
  map every internal row to an affected direct output.
- `SDD-WF-009`: reverse-trace each ledger item through selection, feedback,
  delay/memory, latch, edge, and special-mode behavior.
- `SDD-OUT-010`: preserve output-near state-holding and selection logic as functional
  evidence until proven otherwise.

Fail the stage when a required input is missing, a direct output has neither coverage
nor an explicit unresolved record, a ledger row lacks its boundary mapping, or an
output role cannot be written.
