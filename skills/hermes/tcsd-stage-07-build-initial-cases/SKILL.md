---
name: tcsd-stage-07-build-initial-cases
description: Build the first coverage-oriented TCSD workbook and validate it against model interfaces and obligations for stage 7. Use only when a tcsd_stage_execute prompt explicitly requests initial case generation with a tcsd-agent-stage-input/v1 manifest.
---

# Build Initial TCSD Cases

Execute only stage 7 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `7` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Build from the canonical template and the prior interface/Coverage IR evidence.
4. Require root-port workbook validation and logical obligation mapping before accepting the candidate workbook.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not simulate, backfill, or claim final delivery in this stage.
