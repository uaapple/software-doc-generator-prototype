# Workflow Details

## SATK Loading Pattern

For production/Hermes runs, keep SATK startup deterministic before loading the model:

- Use `scripts/satk_eval.py MATLAB_CODE_FILE` as the fallback MCP entrypoint when direct MCP tools are not available.
- Run the MCP process in an environment that allows local watchdog socket creation. If logs mention `socket file access timed out`, `bind: invalid argument`, or `bind: operation not permitted`, the MCP server did not initialize; rerun SATK outside that sandbox or with the host runtime that permits local sockets.
- Set `SATK_MCP_LOG_FOLDER` to a short ASCII path. Recommended values are `C:\Temp\matlab-mcp-core-server-codex` on Windows and `/private/tmp/matlab-mcp-core-server-codex` on macOS.
- For an unattended Windows VM, prefer `SATK_MATLAB_SESSION_MODE=new` plus `SATK_MATLAB_ROOT=C:\Program Files\MATLAB\R2026a` (adjust release/path as installed). Use `existing` only when MATLAB is deliberately pre-launched and reachable.
- If the SATK toolkit is not under the default `%USERPROFILE%\.matlab\agentic-toolkits` or `~/.matlab/agentic-toolkits`, set `SATK_MCP_SERVER` and `SATK_MCP_EXTENSION` explicitly.
- Direct MCP tools can be visible to the agent while MATLAB cannot find their backing functions. If `model_read` / `model_overview` fails with `函数或变量 'model_read' 无法识别`, repair MATLAB path first; this usually means a prior helper called `restoredefaultpath` in a shared MATLAB session.

Use this MATLAB setup before `load_system(model)`:

```matlab
rootDir = pwd;
restoredefaultpath;
rehash toolboxcache;
satkRoot = getenv('SATK_SIMULINK_ROOT');
if isempty(satkRoot)
    homeDir = getenv('HOME');
    if isempty(homeDir)
        homeDir = getenv('USERPROFILE');
    end
    satkRoot = fullfile(homeDir, '.matlab', 'agentic-toolkits', 'simulink');
end
if exist(fullfile(satkRoot, 'tools'), 'dir')
    addpath(satkRoot);
    addpath(genpath(fullfile(satkRoot, 'tools')));
end
addpath(fullfile(rootDir, 'ITKCToolsV015', 'ModelingTools', '01_Csc'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'GenLib'));
addpath(rootDir);
run('init_Global.m');
load('<model>.mat');
load_system('ITKLib.slx');
load_system('<model>.slx');
assert(~isempty(which('model_read')), 'SATK model_read is not on the MATLAB path');
assert(~isempty(which('model_overview')), 'SATK model_overview is not on the MATLAB path');
```

`scripts/setup_ut_support.m` performs the same SATK tools path restoration after `restoredefaultpath`, and also restores the MATLAB MCP Core add-on path when it can find it. Keep that behavior in any copied or model-specific MATLAB helper so simulation/backfill does not leave a reused MATLAB session unable to service later `model_read` calls.

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
- Condition-producing comparison banks: all `RelationalOperator` blocks grouped by controlling root signal or parameter, especially mode/config signals such as `stMod`, `stMode`, and `stCfg`. If one signal is compared to several constants, each constant becomes its own required Condition outcome.

Before drafting TCSD rows, turn these facts into a coverage-obligation matrix with `block path/SID`, `coverage class`, `required outcome`, `controlling root input or scalar parameter`, `planned Test/action`, and `evidence state`. This matrix is the working checklist; Test names and comments are not coverage evidence.

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

## State Transition Path Tracing

Before writing TCSD rows for a Stateflow chart, enum state output, latch, edge-triggered path, or state-machine-like mode/gear output, trace the transition path back to root inputs or scalar parameters.

- Read Stateflow transition labels, entry/exit actions, and guard conditions where available.
- Cross-check upstream `Switch` and `RelationalOperator` criteria that gate the transition, including brake, door, seatbelt, ready, authentication, speed, voltage, mode, and fault-validity prerequisites.
- Resolve enum and constant values from the loaded MAT/init/data dictionary/model workspace before writing TCSD assignments.
- Do not assume setting one request signal is enough. A request such as `icgsm_stGearShiftLvrPosnReq = 4` is only useful after the prerequisite gates that allow the state transition are also true.
- When the exact path is uncertain, keep the Test wording as "request", "target", or "attempt" until simulation/probe evidence proves the state was reached.

## State Transition Hold Timing

State transitions often need more time than a single short step because filters, debounce logic, LowPass blocks, StopWatch/Delay blocks, and chart entry/exit actions may sit upstream.

- Prefer measured probe timing when available.
- If model timing parameters are known, hold for at least `max(2*sampleTime, known filter/debounce/timeout delay + margin)`.
- If timing is unknown, use a conservative sequence: set all prerequisites, hold around `[+1s]`, change the request or triggering input, then hold another `[+1s]` before checking state outputs.
- Avoid combining several state transitions such as P -> R -> N -> D in one Test unless each step has distinct stimulus, sufficient hold time, and simulation evidence that the expected state actually changed. Split the sequence when a failed transition would otherwise make every step show the same default outputs.

## Coverage Heuristics

For each major subsystem, create one or more Test rows that cover:

- Nominal enabled path.
- Each Boolean/condition input flipped one at a time.
- Threshold low/equal/high values.
- Relational equality banks: every compared enum/constant value and one valid non-matching baseline. For example, if the model checks a mode signal against `2` and `3`, generate cases that set the signal to `2`, to `3`, and to a valid non-matching value instead of leaving all Tests at the nominal default.
- Lookup table representative regions and edge breakpoints.
- Saturation and Min/Max limits.
- For `MinMax` blocks, every input port must win at least once unless it is unreachable; equality/tie cases do not count as a reliable win.
- For `MultiPortSwitch` blocks, cover every valid selector value and any default/otherwise branch. Derive selector legality per block, not from a similarly named enum elsewhere in the model.
- A `MultiPortSwitch` invalid-selector simulation stop is useful feedback. Do not globally change MPS default diagnostics to make the model run. Use the enriched `simulate_tcsd_cases.m` error to find the block and selector source, then adjust the stimulus, hold duration, or safe scalar parameter override so the selector reaches a valid intended value.
- For `Saturate` blocks, cover input below lower limit, inside limits, and above upper limit.
- For `Logical Operator` AND/OR blocks, cover MC/DC-style vectors. OR needs all-false and single-true-per-input cases. AND needs all-true and single-false-per-input cases. Apply upstream NOT/inversion before deciding root input values, and keep the mapping from operator-input truth vector to raw TCSD assignments in the obligation matrix.
- Safe divide denominator zero and nonzero cases.
- Delay, latch, stopwatch, and edge-detect transitions.
- Gradient limiter/ramp behavior with enough time steps.
- Mode switches with only model-valid selector values.

Prefer fewer meaningful tests over many random tests. Coverage is the first priority, but invalid selector values that make the model stop are not useful unit-test cases unless the test explicitly targets diagnostic behavior.

## Minimum Functional-Domain Density

For models with identifiable functional domains, build a short checklist before writing the workbook. Each present domain needs at least one independent Test, a clear merge reason, or an unreachable/invalid explanation.

- Fault and validity signal families: inputs such as `*SigErr`, `*Vld`, `*Flt`, `*FltLvl`, and diagnostic enable/reset signals should be covered by family, with safety-critical or output-dominant signals split into their own Tests.
- Continuous thresholds and boundary inputs: inputs such as speed, voltage, current, torque, temperature, slope, and pedal position should cover both sides of each decision threshold; use below/at/above when equality behavior matters.
- Mode/config enums: inputs such as `stMod`, `stMode`, `stCfg`, gear requests, charge modes, drive modes, and scene modes should cover each model-visible configuration that gates logic.
- Stateflow target states: every reachable target state or transition family should have a focused Test or a documented reason for grouping.
- Diagnostic/error paths: `Diag`, `ErrCheck`, lock/unlock, stuck, sensor plausibility, and timeout paths should not be hidden inside nominal mode Tests when they drive distinct outputs.
- Special operating modes: APA/RPA, cruise/ACC, charging, anti-theft, wash, traction, camping, cart, OTA, and similar feature gates should be split when present and model-visible.

Do not combine many unrelated modes or many Stateflow transitions into one broad traversal Test unless every step has distinct stimulus, enough hold time, and simulation evidence proving the intended output change. If the expected outputs remain identical across all steps, split or rewrite the Tests before delivery.

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

By default, pass every model-derived scalar root Outport to `backfill_expected_outputs.py --outputs`. Let the simulation `stable=false` flags suppress dynamic outputs, and use `--exclude-outputs` for unverified stateful-risk outputs. Do not hand-pick a small output subset unless the reason is documented, such as confirmed importer limits or a narrow diagnostic run. Vector outputs remain omitted unless the TCSD vector macro mapping is known.

After backfill, run a continuous-output plausibility pass. Treat physical outputs such as power, torque, voltage, current, speed, temperature, SOC, pressure, and limit/max/min/peak/continuous/threshold signals as continuous unless metadata proves they are Boolean or enum. Flag unexplained `0`/`1` values, order-of-magnitude jumps, default/sentinel values, and implausible output-family ordering.

After backfill, cross-check state/gear/mode claims against the output expectations. For each claim, identify the proof output, resolve the claimed numeric value from model constants or trusted simulation evidence, and compare it with `expValue(...)` in the same step. If a Test description or Action comment says a transition succeeded but the corresponding top-level output still has the previous/default value, the result is not deliverable: fix the prerequisite inputs or hold timing and rerun backfill, rewrite the text to describe a blocked/not-reached path, or remove the success claim. Inline comments like `stDrvGear=1(D)` must match the corresponding `expValue(...)`.

For output-family checks, group related top-level outputs by signal name fragments and physical quantity. Examples include charge/discharge power limits (`pwrMax*`, `pwrPeak*`, `pwrContns*`), torque limits, voltage/current limits, SOC limits, and diagnostic flags. Boolean `b*` outputs may be `0`/`1`; enum/state `st*` outputs may be small integers when resolved from constants. Continuous `pwr*`, `tq*`, voltage/current/speed/temperature/SOC, `*Max*`, `*Peak*`, and `*Contns*` values need engineering-scale or model-evidence justification. If a value is suspicious, confirm it with probe evidence, repair stimulus/hold timing and rerun backfill, or omit the expectation from that Test.

Do not let expected-output stability rules reduce stimulus coverage. It is acceptable for a Test to exist mainly to cover a decision outcome and contain few or no `expValue(...)` lines for dynamic outputs.

At validation time, compare the workbook back to the coverage-obligation matrix. Every traceable RelationalOperator condition, Switch side, MinMax candidate winner, MultiPortSwitch selector/default, Abs source sign, and AND/OR MC/DC vector should be `covered`, `unreachable/invalid` with a specific model reason, or `unresolved` and called out in the task result.

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
