# Project Addon Support Package

Project-specific support files, including Cornex/ITK files when a project uses them, are now maintained as project addons outside this skill. In production and local Hermes runs, the platform/Hermes Agent selects a project by number and copies that addon's files into the workspace root before this skill starts.

The skill still owns the canonical TCSD template and reusable scripts. The production default is no longer to copy a bundled `assets/support-package` from the skill.

## Contents

After the addon is copied, the workspace contents are project-specific. File names, file types, folder layout, and file count may differ by project. The following are examples from a Cornex/ITK-style package, not required names for every project:

- `Cornex_Config.sldd`
- `CornexMdlCfg.mat`
- `ITKLib.slx`
- `init_Global.m`
- `ITKCToolsV015/ModelingTools/01_Csc`
- `ITKCToolsV015/GenLib`

## Addon Source Locations

Project addon source directories are maintained by users outside the skill:

```text
Windows production: C:\ProgramData\SoftwareDocGenerator\project-addons\<projectId>\
Mac local dev: .local/project-addons/<projectId>
```

For example, the 楚能 support package should be migrated to project `01`:

```text
C:\ProgramData\SoftwareDocGenerator\project-addons\01\
.local/project-addons/01
```

The platform/Hermes Agent copies the selected directory into the model working folder before invoking this skill. Then the user-provided `.slx` and `.mat` live in the same workspace and remain the authoritative model inputs. Skill execution should inspect the actual workspace contents, add relevant support/tool folders, run initialization scripts only when present or explicitly identified, and load target-model-referenced libraries/data dictionaries from the workspace.

## Known Failure Modes

- SATK MCP initialization fails before any MATLAB code runs: inspect the MCP server log under `SATK_MCP_LOG_FOLDER`. Messages such as `Failed to connect to watchdog socket`, `socket file access timed out`, `bind: invalid argument`, or `bind: operation not permitted` mean the local watchdog socket could not be created. Use a short ASCII log folder and run the MCP process outside any sandbox that blocks local socket binding.
- Cornex/ITK packages only: `CornexCsc.Signal` / `CornexCsc.Parameter` not found means the package's modeling tools folder is missing from the MATLAB path before loading the MAT.
- Cornex/ITK packages only: MAT variables load as `uint32 [6x1]` when Cornex classes were missing during MAT load; clear and reload after fixing the path.
- Cornex/ITK packages only: `CornexMdlCfg` conflict means the data dictionary and base workspace may both define it. Prefer loading the model with the dictionary and use a simulation-only config when necessary.
- Missing `rte_bsw_analog.h` or similar custom code headers: original production config references RTE/BSW custom code. For expectation generation, attach `CodexSimOnlyCfg` to run simulation without changing source files.
