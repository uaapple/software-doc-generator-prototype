---
name: tcsd-stage-02-check-environment
description: Check the MATLAB, Simulink, SATK, MCP, Python, and TCSD runtime prerequisites for stage 2. Use only when a tcsd_stage_execute prompt explicitly requests the environment gate with a tcsd-agent-stage-input/v1 manifest.
---

# Check the TCSD Environment

Execute only stage 2 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `2` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Require the runtime environment gate to identify the configured MATLAB root and the SATK/MCP runner needed by later stages.
4. Treat unavailable MATLAB, Simulink, SATK, MCP, Python dependencies, or an invalid worker configuration as hard errors.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never hand-write a checkpoint or infer success from Agent text.

Do not initialize the model workspace or execute another TCSD stage.
