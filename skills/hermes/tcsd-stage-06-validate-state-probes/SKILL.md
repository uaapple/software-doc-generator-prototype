---
name: tcsd-stage-06-validate-state-probes
metadata:
  version: "1.2.2"
description: Build and validate state, history, edge, counter, and timing probes against the model for TCSD stage 6. Use only when a tcsd_stage_execute prompt explicitly requests state-probe validation with a tcsd-agent-stage-input/v1 manifest.
---

# Validate State and Timing Probes

Execute only stage 6 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `6` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Build state/timing candidates from model traces and run actual probes when candidates exist. Rising-edge and falling-edge blocks use dedicated stable-initial-state, edge-trigger, observation, and restore sequences.
4. Enforce a global candidate bound and deterministic batches. A failed batch must identify its exact candidate range and retain a sanitized MATLAB diagnostic before temporary Gateway state is cleaned.
5. If a model Constant references an external calibration that is absent from the task MAT and project initialization, a strict numeric model annotation may be used only as a temporary, in-memory compilation fallback. Skip every candidate that depends on that resource, record the resource and expected source, and never count the skipped candidate as observed or verified. Never save the source model.
6. Require probe evidence and refreshed obligations/Coverage IR for executed candidates; an empty candidate set must be explicit.
7. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not fabricate reachability or execute later workbook stages.
