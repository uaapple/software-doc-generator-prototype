---
name: tcsd-stage-11-final-validation
metadata:
  version: "1.2.0"
description: Run final simulation, expected-output backfill, and coverage validation after an applied repair for TCSD stage 11. Use only when a tcsd_stage_execute prompt explicitly requests final validation with a tcsd-agent-stage-input/v1 manifest.
---

# Run Final TCSD Validation

Execute only stage 11 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `11` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Skip explicitly when stage 10 did not apply a repair.
4. Otherwise rerun simulation/backfill and actual coverage on the repaired workbook. The host splits final coverage collection into bounded batches, merges the raw MathWorks coverage data, and records every batch hash. Do not submit another full-suite probe.
5. Require item-level simulation/workbook evidence and normalized final coverage.
6. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Treat MATLAB/SATK timeout or simulation failure as a hard error.
The host runtime sizes the final coverage-probe timeout from each bounded batch, not from the whole suite; preserve that timeout and do not submit a second probe from the Agent session.
