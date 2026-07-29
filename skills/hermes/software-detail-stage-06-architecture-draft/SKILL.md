---
name: software-detail-stage-06-architecture-draft
metadata:
  version: "1.0.0"
description: Draft only the Simulink model purpose, overall functional structure, architecture, and interfaces from checked boundary artifacts. Use only when the software-detail orchestrator explicitly invokes stage 6 with its pinned stage inputs.
---

# Software Detail Stage 06 Architecture Draft

Execute only Stage 6. Use a new Hermes session for this stage attempt; never reuse a
Hermes session from another stage or a failed attempt. Reuse the task-owned MATLAB
session identified by the lease without initializing, replacing, or closing it.

## Host execution envelope

Read the authoritative stage input manifest named by the host invocation before any business artifact. Require schema `software-detail-minimal-stage-input/v1`, this exact `stageId`, and the supplied `jobId`, `attempt`, `status`, input `artifacts`, `outputArtifacts`, `gatewayLease`, `runtime.installedPath`, and `candidateResultPath`. Treat every supplied role/path binding and Gateway lease field as immutable.

`runtime.installedPath` is the absolute path of the snapshotted shared runtime installed for this job. Require it to be absolute and readable, call it `<runtime-root>`, and resolve every shared resource below from that root. Never resolve the runtime from the task working directory or a skill-adjacent relative path.

Write every declared result artifact to the exact `relativePath` bound to its role in `outputArtifacts`. After all artifacts validate, write the candidate JSON only to `candidateResultPath` with schema `software-detail-minimal-stage-result/v1`, the manifest's exact `jobId`, `stageId`, `attempt`, `status: "completed"`, `matlabSessionId`, an exact copy of `gatewayLease`, and `artifacts` produced by mapping every `outputArtifacts` entry one-for-one to `{ "role", "relativePath" }`. Do not add, omit, rename, or rebind artifact roles, and do not claim completion before the files exist.

## Mandatory first read

Before reading or transforming any business artifact, read
`<runtime-root>/shared/software-detail-shared-rules.json`. Require the
shared rule set to be present and readable, then apply these mapped shared clauses:

- `SDD-DEF-001`, `SDD-DEF-002`, `SDD-DEF-003`
- `SDD-DEF-010`, `SDD-DEF-011`, `SDD-DEF-018`, `SDD-DEF-020`
- `SDD-OUT-001`, `SDD-OUT-002`, `SDD-OUT-013`

These clauses keep the model as source of truth, preserve evidence quality and the
job-owned MATLAB session, enforce per-document-unit boundary allowlists and private
internal identifiers, exclude tool metadata, use Chinese narrative unless requested
otherwise, and prohibit invented meanings.

Then read, without modifying,
`<runtime-root>/references/template-filling.md`. Apply only its model-level
`功能描述` and `模型总体结构` guidance in this stage; leave module-section authoring
and DOCX generation to their owning later stages.

Wave0 assigns no shared runtime script to Stage 6. Do not invoke a script owned by
another stage.

## Contract

### Inputs

Require exactly the pinned Stage 6 inputs:

- `matlab-session-lease`
- `output-ledger`
- `boundary-projection`
- `narrative-plan`

### Outputs

Produce exactly this output role:

- `architecture-draft`

Write only the artifact bound to that role. Do not produce a module draft, checked
content, DOCX, or final artifact manifest, and do not execute another stage.

## Procedure

1. Validate that all inputs belong to the same job, preserve each input's originating
   stage and attempt for traceability, and confirm that their document units, direct
   boundary inputs/outputs, and coverage references agree.
2. Draft model-level `功能描述` from model-authored annotation or DocBlock purpose
   evidence carried by the declared inputs when available. If author-provided purpose
   is absent, write a concise model-level summary inferred only from available
   top-level inputs/outputs and module names.
3. Draft `模型总体结构` and architecture/interface content from functional facts:
   model-authored execution entry or period, major inputs and outputs, meaningful
   first-level document-unit relationships, shared functional signals or data stores,
   and data/output flow.
4. Use only current allowlisted boundary identifiers in reader-facing text. Preserve
   exact internal facts in the private inputs; do not expose internal identifiers or
   invent Chinese expansions, calibration intent, requirements, design bases, or
   business meaning.
5. Exclude evidence-collection and model-configuration audit details, including
   MATLAB/MCP/SATK load or update status, solver, code-generation target, model
   version, and toolchain warnings unless the user explicitly requested them.
6. Limit the artifact to model function, overall structure, architecture, and
   interfaces. Document-unit names may describe architectural relationships.
   Do not create `3.x` module sections, `功能描述`/`实现方式` module bodies, or any
   DOCX content in this stage.

## Stage-specific source clauses

- `SDD-WF-012`: use model-authored top-level purpose evidence when present; reserve
  document-unit purpose prose for the module-draft stage.
- `SDD-WF-013`: draft the model-level function and functional overall structure from
  authored descriptions and functional evidence, while the later module-draft stage
  owns one section per `document_unit`.

Fail the stage when a required input is missing, input boundaries disagree, the draft
depends on unsupported or internal identifiers, module正文 or DOCX work appears in
the result, or `architecture-draft` cannot be written.
