---
name: tcsd-stage-02-check-environment
metadata:
  version: "1.1.0"
description: Check the MATLAB, Simulink, SATK, MCP, Python, and TCSD runtime prerequisites for stage 2. Use only when a tcsd_stage_execute prompt explicitly requests the environment gate with a tcsd-agent-stage-input/v1 manifest.
---

# Check the TCSD Environment

Execute only stage 2 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `2` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Require the runtime to import PyYAML/openpyxl, create/read/delete a workspace sentinel, execute MATLAB with a random nonce, load Simulink with an available license, and write the matching SATK/MCP sentinel.
4. Treat a missing sentinel, empty MCP response, nonce mismatch, unavailable MATLAB/Simulink/SATK/MCP/Python dependency, or invalid worker configuration as a hard error.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never hand-write a checkpoint or infer success from Agent text.

Do not initialize the model workspace or execute another TCSD stage.
