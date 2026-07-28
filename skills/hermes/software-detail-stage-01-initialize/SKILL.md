---
name: software-detail-stage-01-initialize
metadata:
  version: "1.0.0"
description: Initialize one software-detail pipeline job from task-local model, project, addon, and initialization inputs. Use only when a software-detail-minimal-stage-input/v1 manifest explicitly requests software-detail-stage-01-initialize in a fresh Hermes session.
---

# Software Detail Stage 01: Initialize

Execute only `software-detail-stage-01-initialize`. This stage validates the task-local inputs, initializes the task workspace, establishes the one task-owned MATLAB session used by the entire job, and loads the target model once.

## Required shared contract

Before taking any stage action, read all rules from `../software-detail-runtime/shared/software-detail-shared-rules.json`. The shared rule set is mandatory and has the same meaning for every software-detail stage. Then read:

- `../software-detail-runtime/references/model-evidence.md` for task-owned MATLAB, workspace, addon, and initialization behavior.
- `../software-detail-runtime/scripts/setup_module_doc_support.m` before setting up project/addon paths and initialization scripts.
- `../software-detail-runtime/scripts/satk_eval.py` only when the execution adapter guarantees that the task-owned MATLAB session survives MCP server exit and can be reconnected through `matlab-session-lease`.

## Inputs

Require a `software-detail-minimal-stage-input/v1` manifest whose `stageId` is exactly `software-detail-stage-01-initialize`. Consume only these declared input artifact roles:

- `source-model`: the task-local Simulink model.
- `model-data`: the task-local model data selected for this job.
- `model-init-script`: optional task-local model initialization script.
- `project-selection`: the selected project and its task-workspace addon/project copy.
- `worker-selection`: the Worker chosen for this job.

The invocation must use a fresh Hermes session for this stage attempt. Do not execute a prompt for another stage.

## Procedure

1. Locate the source model, task workspace, model data, optional initialization script, selected project files, and Worker from the declared inputs. Record the resolved task-local items for `input-manifest`. (`SDD-WF-001`)
2. Use only addon/project files already copied into the task workspace. Do not read an unrelated external addon root. Add project/addon paths before model loading, and run project/addon initialization before model-level initialization when both exist. (`SDD-DEF-016`)
3. On the task-workspace copy of every auto-generated addon/init/data script such as `*_dd.m`, remove standalone `clear` and `clearvars` commands before execution. Do not modify the original external addon source. (`SDD-DEF-017`)
4. Prefer the Worker or native MATLAB Gateway to create one task-owned MATLAB process/session that remains alive across stages, and write its stable session identity and reconnect handle into `matlab-session-lease`. For an unattended/front-end job, create a new task-owned session; attach only when the user explicitly supplied an active session or the platform provided one. Do not pre-create another MATLAB session for later stages.
5. In that same MATLAB session, run `setup_module_doc_support.m`, add the selected workspace project/addon files once, run the sanitized initialization scripts once, load model data as required, and call `load_system` for the target model once. `satk_eval.py` may establish the new session only when its execution adapter guarantees that MATLAB remains alive after the MCP server exits and that later stages can reconnect by the lease; otherwise use the Worker/native MATLAB Gateway creation path. Do not reopen, close, or repeatedly initialize the model. (`SDD-WF-002`)
6. Write all three required output artifacts to the paths supplied for their roles. Preserve the live MATLAB session for Stage 2 and later stages; do not collect hierarchy, deep evidence, prose, or DOCX in this stage.

## Outputs

- `input-manifest`: identifies the job, selected Worker/project, task-local model/data/init inputs, and the exact task-local paths used.
- `workspace-manifest`: identifies the task workspace, copied addon/project files, sanitized task-local initialization copies, support paths, and loaded model identity.
- `matlab-session-lease`: identifies the live MATLAB session, its owning job, its task-owned lifecycle, the Worker/native MATLAB Gateway identity or reconnect handle, and the model loaded once in that session so later stages can reuse it after the Stage 1 Hermes/MCP process exits.

Complete the stage only after all three artifacts exist and describe the same job and workspace. Leave the MATLAB session open. Do not run Stage 2 scanning or Stage 3 evidence extraction.

## Mapped source clauses

- `SDD-DEF-016`
- `SDD-DEF-017`
- `SDD-WF-001`
- `SDD-WF-002`
