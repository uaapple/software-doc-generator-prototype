---
name: tcsd-stage-10-repair-coverage
metadata:
  version: "1.1.0"
description: Apply at most one deterministic Coverage IR guided case repair from the initial report for TCSD stage 10. Use only when a tcsd_stage_execute prompt explicitly requests coverage repair with a tcsd-agent-stage-input/v1 manifest.
---

# Repair Coverage Cases

Execute only stage 10 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `10` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Skip explicitly when all initial metrics meet the threshold.
4. Otherwise attempt one Coverage IR guided repair and record whether a unique executable candidate was applied.
5. Require `attempted`, `applied`, `passes`, reason, and evidence fields. Never apply more than one repair pass.
6. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

The host's validation-repair session may rerun this idempotently; it must not create a second coverage repair pass.
