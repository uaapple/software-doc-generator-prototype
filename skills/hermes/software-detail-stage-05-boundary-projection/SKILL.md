---
name: software-detail-stage-05-boundary-projection
metadata:
  version: "1.0.0"
description: Project private Simulink evidence and output-ledger facts onto each document unit's direct boundary, behavior groups, and narrative plan. Use only when the software-detail orchestrator explicitly invokes stage 5 with its pinned stage inputs.
---

# Software Detail Stage 05 Boundary Projection

Execute only Stage 5. Use a new Hermes session for this stage attempt; never reuse a
Hermes session from another stage or a failed attempt. Reuse the task-owned MATLAB
session identified by the lease without initializing, replacing, or closing it.

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

Then read, without modifying,
`../software-detail-runtime/references/module-boundary.md` for the document-unit
allowlist, cross-unit port treatment, private-to-public projection, and ledger
visibility rules.

Wave0 assigns no shared runtime script to Stage 5. Do not invoke a script owned by
another stage or perform drafting or evidence recollection.

## Contract

### Inputs

Require exactly the pinned Stage 5 inputs:

- `matlab-session-lease`
- `evidence-shards`
- `output-ledger`
- `coverage-report`

### Outputs

Produce exactly these output roles:

- `boundary-projection`
- `behavior-groups`
- `narrative-plan`

Write only the artifacts bound to those roles. Do not write architecture text, module
body text, or DOCX, and do not execute another stage.

## Procedure

1. Validate that all inputs belong to the same job and attempt and that the ledger
   rows and coverage entries refer only to supplied evidence shards and document
   units.
2. Apply the allowlist independently for each `document_unit`. A cross-A signal is
   usable only when it is a direct port of the current unit; when connected port
   names differ, use the current unit's direct Inport name for its projection.
3. Project conditions onto current-unit direct inputs and actions/results onto
   current-unit direct outputs. Keep child ports, internal lines, states, parameters,
   calibration/table names, enums, tags, and block names private unless the user
   explicitly approved them.
4. When an internal condition cannot be traced to a direct input, retain the exact
   fact privately and describe only the supported boundary behavior. Do not invent a
   label, threshold, mode, value, requirement, or business meaning.
5. Group rows by direct boundary output and shared set/reset/select/hold/update/
   restore/fallback behavior. Never use an internal identifier as a group title.
   Ensure every internal ledger row is covered by one affected-output group.
6. Build the private `narrative-plan` with `boundary_inputs`,
   `boundary_outputs`, `internal_evidence_rows`, `condition_actions`, and
   `covered_ledger_items`. Combine conditions that produce the same action, while
   retaining exact private traceability to ledger items.
7. Keep evidence coverage and narrative coverage distinct. Preserve missing or
   unresolved ledger coverage in the outputs rather than hiding it with compressed
   prose.

## Stage-specific source clauses

- `SDD-DEF-012`: project exhaustive private evidence onto direct boundary behavior;
  internal identifiers are not `must_mention` by default.
- `SDD-WF-010`: group the private narrative compression plan by direct outputs with
  the five mapped plan fields, never by internal signal names.
- `SDD-WF-011`: express conditions and actions with the current document unit's
  direct boundary, allow valid cross-A direct ports, and keep unresolved or
  unapproved internals private without invention.

Fail the stage when an input is missing, an internal row is unmapped, a behavior group
uses a private identifier as its public title, a projection crosses the current
document unit's allowlist, or an output role cannot be written.
