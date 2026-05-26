# Support Package

The bundled `assets/support-package` contains the reusable Cornex/ITK files used to make module-level models load and simulate when the user supplies only `<model>.slx` and `<model>.mat`.

## Contents

- `Cornex_Config.sldd`
- `CornexMdlCfg.mat`
- `ITKLib.slx`
- `init_Global.m`
- `ITKCToolsV015/ModelingTools/01_Csc`
- `ITKCToolsV015/GenLib`

## Copy Pattern

For a new module model, copy support files into the model working folder:

```bash
cp -R <skill_dir>/assets/support-package/. <model_workdir>/
```

`<skill_dir>` is the directory containing this skill's `SKILL.md`.

Then place the user-provided `.slx` and `.mat` in the same folder.

## Known Failure Modes

- SATK MCP initialization fails before any MATLAB code runs: inspect the MCP server log under `SATK_MCP_LOG_FOLDER`. Messages such as `Failed to connect to watchdog socket`, `socket file access timed out`, `bind: invalid argument`, or `bind: operation not permitted` mean the local watchdog socket could not be created. Use a short ASCII log folder and run the MCP process outside any sandbox that blocks local socket binding.
- `CornexCsc.Signal` / `CornexCsc.Parameter` not found: ensure `ITKCToolsV015/ModelingTools/01_Csc` is on the MATLAB path before loading the MAT.
- MAT variables load as `uint32 [6x1]`: Cornex classes were missing when loading the MAT; clear and reload after fixing the path.
- `CornexMdlCfg` conflict: the data dictionary and base workspace may both define it. Prefer loading the model with the dictionary and use a simulation-only config when necessary.
- Missing `rte_bsw_analog.h` or similar custom code headers: original production config references RTE/BSW custom code. For expectation generation, attach `CodexSimOnlyCfg` to run simulation without changing source files.
