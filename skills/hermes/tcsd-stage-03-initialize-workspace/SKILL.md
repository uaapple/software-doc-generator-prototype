---
name: tcsd-stage-03-initialize-workspace
description: Initialize project and model workspace dependencies and register task-owned resources for TCSD stage 3. Use only when a tcsd_stage_execute prompt explicitly requests workspace initialization with a tcsd-agent-stage-input/v1 manifest.
---

# Initialize the TCSD Workspace

Execute only stage 3 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `3` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Require project/addon initialization before model-specific initialization.
4. Require a completed workspace-initialization manifest bound to the current `jobId` and a task-owned resource record.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Stop on MATLAB/SATK initialization errors. Do not load or analyze coverage in this stage.
