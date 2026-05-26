# Workflow Details

## SATK Loading Pattern

For production/Hermes runs, keep SATK startup deterministic before loading the model:

- Use `scripts/satk_eval.py MATLAB_CODE_FILE` as the fallback MCP entrypoint when direct MCP tools are not available.
- Run the MCP process in an environment that allows local watchdog socket creation. If logs mention `socket file access timed out`, `bind: invalid argument`, or `bind: operation not permitted`, the MCP server did not initialize; rerun SATK outside that sandbox or with the host runtime that permits local sockets.
- Set `SATK_MCP_LOG_FOLDER` to a short ASCII path. Recommended values are `C:\Temp\matlab-mcp-core-server-codex` on Windows and `/private/tmp/matlab-mcp-core-server-codex` on macOS.
- For an unattended Windows VM, prefer `SATK_MATLAB_SESSION_MODE=new` plus `SATK_MATLAB_ROOT=C:\Program Files\MATLAB\R2026a` (adjust release/path as installed). Use `existing` only when MATLAB is deliberately pre-launched and reachable.
- If the SATK toolkit is not under the default `%USERPROFILE%\.matlab\agentic-toolkits` or `~/.matlab/agentic-toolkits`, set `SATK_MCP_SERVER` and `SATK_MCP_EXTENSION` explicitly.

Use this MATLAB setup before `load_system(model)`:

```matlab
rootDir = pwd;
restoredefaultpath;
rehash toolboxcache;
addpath(fullfile(rootDir, 'ITKCToolsV015', 'ModelingTools', '01_Csc'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'GenLib'));
addpath(rootDir);
run('init_Global.m');
load('<model>.mat');
load_system('ITKLib.slx');
load_system('<model>.slx');
```

If the original config references missing RTE/BSW custom code headers, attach a simulation-only config instead of changing the model file:

```matlab
if any(strcmp(getConfigSets(modelName), 'CodexSimOnlyCfg'))
    detachConfigSet(modelName, 'CodexSimOnlyCfg');
end
cs = Simulink.ConfigSet;
set_param(cs, 'Name', 'CodexSimOnlyCfg');
attachConfigSet(modelName, cs, true);
setActiveConfigSet(modelName, 'CodexSimOnlyCfg');
```

## Model Reading

Collect:

- Root input names and port order.
- Root output names and port order.
- Data types from `CornexCsc.Signal.DataType` where available.
- Subsystem hierarchy.
- Parameters from block masks, descriptions, `CornexCsc.Parameter.Value`, lookup tables, constants, and data dictionaries.
- Decision-producing blocks and their required outcomes: Switch true/false, RelationalOperator true/false, Logical Operator input truth vectors, each `MinMax` winning input, each `MultiPortSwitch` selector/default, each Saturate low/pass/high region.

Do not assume `.mat` variables are valid until `CornexCsc.Signal` and `CornexCsc.Parameter` resolve to classes.

### Static SLX Inspection

Use SATK/MCP/MATLAB as the authority. Static `.slx` XML inspection is only a supplement after SATK/MCP/MATLAB has been attempted or used, and only when you need exact block parameters, SIDs, or connectivity.

```bash
SKILL_DIR=/path/to/simulink-ut-tcsd-generator
MODEL_SLX=MODEL.slx
python3 "$SKILL_DIR/scripts/inspect_slx_xml.py" "$MODEL_SLX" --pattern "MultiPortSwitch|MinMax|Saturate|<Line|PwrLim"
```

This is especially useful for:

- finding `DataPortOrder`, `Inputs`, `UpperLimit`, `LowerLimit`, constants, and calibration names before designing stimuli;
- mapping SIDs from coverage reports/screenshots to block names and line sources/destinations;
- checking whether a selector is filter-derived, lookup-derived, or a direct root input.

Do not pipe `.slx`/zip/XML output directly into an interpreter such as `python3 -c`. Use `scripts/inspect_slx_xml.py` or another file-reading script instead.

Do not use XML alone for final values. Run simulation after drafting the stimuli.

## Coverage Heuristics

For each major subsystem, create one or more Test rows that cover:

- Nominal enabled path.
- Each Boolean/condition input flipped one at a time.
- Threshold low/equal/high values.
- Lookup table representative regions and edge breakpoints.
- Saturation and Min/Max limits.
- For `MinMax` blocks, every input port must win at least once unless it is unreachable; equality/tie cases do not count as a reliable win.
- For `MultiPortSwitch` blocks, cover every valid selector value and any default/otherwise branch. Derive selector legality per block, not from a similarly named enum elsewhere in the model.
- A `MultiPortSwitch` invalid-selector simulation stop is useful feedback. Do not globally change MPS default diagnostics to make the model run. Use the enriched `simulate_tcsd_cases.m` error to find the block and selector source, then adjust the stimulus, hold duration, or safe scalar parameter override so the selector reaches a valid intended value.
- For `Saturate` blocks, cover input below lower limit, inside limits, and above upper limit.
- For `Logical Operator` AND/OR blocks, cover MC/DC-style vectors. OR needs all-false and single-true-per-input cases. AND needs all-true and single-false-per-input cases. Apply upstream NOT/inversion before deciding root input values.
- Safe divide denominator zero and nonzero cases.
- Delay, latch, stopwatch, and edge-detect transitions.
- Gradient limiter/ramp behavior with enough time steps.
- Mode switches with only model-valid selector values.

Prefer fewer meaningful tests over many random tests. Coverage is the first priority, but invalid selector values that make the model stop are not useful unit-test cases unless the test explicitly targets diagnostic behavior.

## Coverage Feedback Loop

When a coverage report or screenshot shows uncovered decisions:

1. Map each uncovered outcome back to the block and port/selector/region.
2. Add a supplemental TCSD Test or action step whose only purpose is to make that outcome happen.
3. Use initialization or a long enough hold when LowPass, Delay, GradientLimiter, or lookup selector logic sits upstream of the decision.
4. Re-run simulation/backfill and, when possible, coverage. Keep iterating until the target is met or the remaining outcome has a concrete unreachable/invalid reason.

### Regeneration Pattern

When repairing coverage after a reviewed workbook already exists:

- create a new versioned workbook, for example `Model_Test0002_tcsd.xlsx`;
- create matching versioned JSON/results files so the old simulation evidence remains available;
- reuse model-specific simulation scripts if they encode working setup fixes, but parameterize workbook/spec/result paths where possible;
- keep added Tests narrow and name the uncovered block/outcome in `Test Case Description`.

## Simulation Backfill

Use simulation to compute expected values for top-level outputs only. If internal signals are useful for reasoning, keep them in notes, not as TCSD expectations.

`expValue(var1,duration,offset)` uses time-window controls: `duration` is the check duration and `offset` is the offset from the current interval. These are not numeric tolerance arguments.

For ramped outputs, do not write a single hold-style expectation. TCSD keeps or window-checks the sampled expected value over time, so a sampled ramp value becomes a wrong constant expectation. Prefer omitting that output from the Test, or generate a separate dense 10 ms staircase only when the user explicitly wants ramp-shape checking.

State-machine and history-feedback outputs need an additional guard. If a root Outport is sourced by a Stateflow Chart, UnitDelay/Delay/Memory, latch, edge detector, or `*_Old` feedback path, treat it as stateful. Do not fill it from a nominal initial value in every step. A line after `[+500ms]` is checked after the 500 ms delay, so the correct value is the state reached after the delay, not the initialization state. If full simulation/MQTester-equivalent evidence is missing or conflicts with the downstream report, exclude that output from expected values for the affected Test.

Do not let expected-output stability rules reduce stimulus coverage. It is acceptable for a Test to exist mainly to cover a decision outcome and contain few or no `expValue(...)` lines for dynamic outputs.

For larger modules such as HvGrid, many root outputs may be vectors or unsupported by the target TCSD import. Build a root-output allowlist from model metadata and backfill scalar top-level outputs first. Validate vector outputs are absent unless the vector macro syntax and element mapping are confirmed.

For vector root inputs in the final TCSD workbook, expand values element by element, for example `EMTqFil_dtqIncGrdt 1=5000;` through `EMTqFil_dtqIncGrdt 4=5000;`. Do not leave whole-vector assignments such as `EMTqFil_dtqIncGrdt = [5000 5000 5000 5000];` unless the downstream importer has been explicitly confirmed to accept them.

Every Test row must be self-contained. Keep common startup values in the JSON TestGroup if helpful, but build the final workbook so each `Type = Test` row repeats the full root-input initialization set with its own overrides applied. Some downstream runners and the simulation extraction script execute a Test row directly and do not inherit TestGroup cells.

Every Test `Action` should end with a final relative delay marker such as `[+0.1s]` so the runner has a short interval after the last assignment or expectation.

### Parameter Overrides for Coverage

Scalar calibration overrides are useful when model dynamics hide a decision outcome during short unit-test-style steps:

- shorten filter time constants for voltage/speed selector coverage;
- disable ramp/gradient limiter enable switches when the goal is final Min/Max candidate coverage rather than ramp-shape verification;
- keep the override visible in `Initialization` with `p Param = value;` and describe why in the Test description/action comment.

Avoid table/array overrides unless the parser and target unit-test toolchain support them.
