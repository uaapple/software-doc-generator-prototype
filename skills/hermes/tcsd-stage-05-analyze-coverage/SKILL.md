---
name: tcsd-stage-05-analyze-coverage
description: Derive deterministic Condition, Decision, and MC/DC mappings, obligations, and Coverage IR for TCSD stage 5. Use only when a tcsd_stage_execute prompt explicitly requests coverage analysis with a tcsd-agent-stage-input/v1 manifest.
---

# Analyze Coverage Targets

Execute only stage 5 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `5` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Derive logical mappings and coverage obligations from stage 4 evidence.
4. Require machine-readable Condition, Decision, and MC/DC Coverage IR artifacts; do not replace unresolved evidence with prose.
5. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Do not create or simulate a workbook in this stage.
