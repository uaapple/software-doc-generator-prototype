---
name: tcsd-stage-09-collect-coverage
description: Collect and normalize the first actual Condition, Decision, and MC/DC coverage report for TCSD stage 9. Use only when a tcsd_stage_execute prompt explicitly requests initial coverage collection with a tcsd-agent-stage-input/v1 manifest.
---

# Collect Initial Coverage

Execute only stage 9 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `9` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Run actual coverage against the initial simulated/backfilled cases.
4. Require per-model Condition, Decision, and MC/DC percentages plus pass flags.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not infer coverage from workbook mappings or repair cases in this stage.
