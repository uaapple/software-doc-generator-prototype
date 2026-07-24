---
name: tcsd-stage-04-extract-interface
description: Load the initialized Simulink model and extract its root Inport, Outport, and logical trace evidence for TCSD stage 4. Use only when a tcsd_stage_execute prompt explicitly requests interface extraction with a tcsd-agent-stage-input/v1 manifest.
---

# Extract the Model Interface

Execute only stage 4 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `4` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Use the initialized MATLAB/SATK workspace to load the target model.
4. Require non-fabricated root interface JSON and logical trace JSON produced from the model.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not generate test cases or substitute static guesses for unavailable model evidence.
