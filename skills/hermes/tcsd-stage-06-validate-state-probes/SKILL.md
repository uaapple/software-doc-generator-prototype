---
name: tcsd-stage-06-validate-state-probes
metadata:
  version: "1.4.0"
description: Build and validate state, history, edge, counter, and timing probes against the model for TCSD stage 6. Use only when a tcsd_stage_execute prompt explicitly requests state-probe validation with a tcsd-agent-stage-input/v1 manifest.
---

# Validate State and Timing Probes

Execute only stage 6 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `6` and inspect any host validation report.
2. The Worker host owns all deterministic MATLAB probe batches before this Hermes session starts. Invoke only the exact `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` host-result verification command from the prompt; never start MATLAB, SATK, a Gateway job, or another probe process.
3. Read the host-prepared plan, primary/secondary batch evidence, merged observations, and target classification. Do not edit them.
4. Require target-level strict success, causal-transition, no-transition, missing-observation, expected-direction-conflict, and simulation-mismatch evidence. Expected-direction conflicts indicate a possible static evaluator defect: retain them as unresolved planning evidence after the bounded second pass instead of failing the whole stage. A simulation mismatch remains a hard validation failure. A failed batch must retain its exact candidate range and sanitized MATLAB diagnostic.
5. Require the first pass to preserve one primary candidate for every planned target. A second pass may run only a statically provable candidate that supplies the exact missing target direction; never spend MATLAB capacity on an unprovable alternate duration or control direction.
6. Require refreshed obligations and coverage planning data from the merged probe results; an empty candidate set must be explicit.
7. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not fabricate reachability or execute later workbook stages.
