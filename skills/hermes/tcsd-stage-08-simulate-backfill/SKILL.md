---
name: tcsd-stage-08-simulate-backfill
description: Simulate initial TCSD cases and backfill stable top-level expected outputs with item-level evidence for stage 8. Use only when a tcsd_stage_execute prompt explicitly requests simulation and backfill with a tcsd-agent-stage-input/v1 manifest.
---

# Simulate and Backfill Expectations

Execute only stage 8 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `8` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Simulate the validated stage 7 workbook using compiled root-port metadata.
4. Require one-to-one evidence across simulation case, workbook row, step, top-level output, and `expValue`.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Treat MATLAB/SATK timeout or simulation failure as a hard error. Do not collect coverage here.
