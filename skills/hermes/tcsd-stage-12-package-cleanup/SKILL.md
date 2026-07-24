---
name: tcsd-stage-12-package-cleanup
metadata:
  version: "1.1.0"
description: Clean only resources owned by the current TCSD job and return cleanup evidence for host-side packaging in stage 12. Use only when a tcsd_stage_execute prompt explicitly requests stage 12 cleanup with a tcsd-agent-stage-input/v1 manifest.
---

# Clean Task-Owned TCSD Resources

Execute only stage 12 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `12` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Clean only paths, MATLAB sessions, and MCP processes owned by the current `jobId`.
4. Preserve every validated workbook, simulation, coverage report, and prior checkpoint artifact.
5. Return only the runtime-written cleanup record in `tcsd-agent-stage-result/v1`.
6. Never create or claim a completed execution manifest, stage timeline, artifact manifest, or host checkpoint; the host generates them from previously validated checkpoints.

Do not decide complete versus partial completion in Agent output.
