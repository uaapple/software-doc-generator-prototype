---
name: tcsd-stage-06-validate-state-probes
metadata:
  version: "1.2.0"
description: Build and validate state, history, edge, counter, and timing probes against the model for TCSD stage 6. Use only when a tcsd_stage_execute prompt explicitly requests state-probe validation with a tcsd-agent-stage-input/v1 manifest.
---

# Validate State and Timing Probes

Execute only stage 6 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `6` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Build state/timing candidates from model traces and run actual probes when candidates exist. Rising-edge and falling-edge blocks use dedicated stable-initial-state, edge-trigger, observation, and restore sequences.
4. Require probe evidence and refreshed obligations/Coverage IR for executed candidates; an empty candidate set must be explicit.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not fabricate reachability or execute later workbook stages.
