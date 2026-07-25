---
name: tcsd-stage-01-validate-inputs
metadata:
  version: "1.1.0"
description: Validate the model, MAT data, initialization scripts, project attachments, and workspace boundaries for TCSD stage 1. Use only when a tcsd_stage_execute prompt explicitly requests stage 1 input validation with a tcsd-agent-stage-input/v1 manifest.
---

# Validate TCSD Inputs

Execute only stage 1 from the manifest named in the prompt.

1. Read the `tcsd-agent-stage-input/v1` manifest and require `stageIndex` to equal `1`.
2. If a host validation report is present, inspect it before rerunning the stage.
3. Invoke the shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command exactly as supplied by the prompt.
4. Require the runtime to verify the model SLX, matching MAT file, optional initialization scripts, copied project attachments, and workspace containment.
5. Leave `tcsd-agent-stage-result/v1` creation to the shared runtime. Never write a checkpoint or claim success from prose.

Stop on missing, unreadable, or out-of-workspace input. Do not execute another TCSD stage.
