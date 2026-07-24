---
name: tcsd-stage-12-package-cleanup
description: Package final TCSD manifests and artifacts and clean only resources owned by the current job for stage 12. Use only when a tcsd_stage_execute prompt explicitly requests packaging and cleanup with a tcsd-agent-stage-input/v1 manifest.
---

# Package Artifacts and Clean Resources

Execute only stage 12 from the manifest named in the prompt.

1. Require the manifest `stageIndex` to equal `12` and inspect any host validation report.
2. Invoke the exact shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py` command from the prompt.
3. Require the final execution manifest, stage timeline, artifact manifest, and cleanup record.
4. Clean only paths, MATLAB sessions, and MCP processes owned by the current `jobId`.
5. Preserve the validated workbook and all delivery evidence referenced by the manifest.
6. Accept only the runtime-written `tcsd-agent-stage-result/v1`; never write a host checkpoint.

Report partial completion when bounded coverage work remains; do not convert residual coverage gaps into fabricated success.
