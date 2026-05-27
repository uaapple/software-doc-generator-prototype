# Hermes Agent Handoff

Read this reference when another agent must generate Simulink unit-test TCSD cases without access to the original development conversation. It captures the reusable lessons from the ACCtl sample, PwrLimEng generation/repair, and HvGrid generation work.

## Mission

Given a module-level Simulink model `<model>.slx` and its matching `<model>.mat`, generate a unit-test TCSD Excel workbook in the same style as the ACCtl/PwrLimEng examples. The first priority is model coverage, especially decision coverage. Expected outputs are secondary and must be derived from simulation only where stable and only for top-level Outports.

## Default Task Contract

If a user tells Hermes or another agent to use `simulink-ut-tcsd-generator` for a model, all standard requirements in this handoff are implicit. Do not ask the user to repeat them.

A minimal prompt is sufficient:

```text
使用 simulink-ut-tcsd-generator，为 <workdir>/<model>.slx 和 <workdir>/<model>.mat 生成单元测试 TCSD 用例。
```

The agent must automatically:

- copy `assets/support-package` into the workdir;
- use Simulink Agentic Toolkit / SATK to read the model;
- generate coverage-first unit-test TCSD cases, prioritizing decision coverage;
- write expected values only for top-level Outports;
- simulate when possible and backfill stable top-level outputs from simulation;
- omit hold-style expectations for ramping or continuously changing outputs;
- build the workbook from the bundled canonical template `assets/templates/tcsd_template.xlsx`;
- save `outputs/<model>_Test0001_tcsd.xlsx`, or the next versioned filename if it exists;
- deliver the Excel workbook with `expValue(...)` expectations as the required output. JSON/spec/simulation files may be used as internal script artifacts, but a separate validation report is not required unless the user explicitly asks for one.
- build and validate the `.xlsx` before any simulation, coverage run, or expected-output backfill. In Hermes/production, this workbook is an artifact checkpoint; final success still requires simulation-backed top-level `expValue(...)` lines.
- stop simulation/backfill after the first MATLAB/MCP/SATK timeout, including a 600s `mcp_matlab_satk_evaluate_matlab_code` timeout, and return `status: "failed"` with a clear warning rather than marking a workbook without expectations as completed.
- clean the MATLAB/SATK session before returning, so later Hermes tasks do not inherit loaded models, copied support paths, or stale MCP state from this task.

Only ask for clarification when the `.slx`, matching `.mat`, MATLAB/SATK runtime, or a required dependency is actually missing.

## Assumptions and Required Runtime

- The agent runs on the same machine/user account that can read this skill directory.
- MATLAB, Simulink, Simulink Agentic Toolkit, and the local SATK bridge are available.
- The supplied `.mat` is the model-specific authority for signal objects, calibration objects, lookup tables, and parameter values.
- The user normally provides only `<model>.slx` and `<model>.mat`; reusable Cornex/ITK dependencies must come from this skill.
- Direct `model_read` / `model_overview` can appear in the agent tool list while MATLAB cannot find the backing SATK functions. If MATLAB reports `函数或变量 'model_read' 无法识别`, repair the SATK tools path first instead of treating MCP model reading as unavailable.

If any of those assumptions are false, stop and report the missing runtime or file dependency before inventing cases.

## Support Package

The reusable dependency package is bundled at:

```text
assets/support-package/
```

It contains:

- `Cornex_Config.sldd`
- `CornexMdlCfg.mat`
- `ITKLib.slx`
- `init_Global.m`
- `ITKCToolsV015/ModelingTools/01_Csc` including `+CornexCsc`
- `ITKCToolsV015/GenLib`

For a fresh work folder, copy it before loading the model:

```bash
cp -R <skill_dir>/assets/support-package/. <model_workdir>/
```

`<skill_dir>` is the folder containing this `SKILL.md`. Do not rely on the old conversation’s workspace having those files already.

## Known Dependency Lessons

- If `CornexCsc.Signal` or `CornexCsc.Parameter` is missing, MATLAB may load MAT variables as raw numeric arrays such as `uint32 [6x1]`. Fix the path, clear the workspace, and reload the MAT.
- Add `ITKCToolsV015/ModelingTools/01_Csc`, `ITKCToolsV015/GenLib`, the model workdir, and the skill `scripts/` folder to the MATLAB path before loading/simulating.
- If any helper calls `restoredefaultpath`, add the SATK root and `simulink/tools` tree back to the MATLAB path before later direct MCP calls. The bundled `scripts/setup_ut_support.m` does this automatically, and also restores the MATLAB MCP Core add-on path when it can find it; keep that behavior in copied model-specific helpers.
- If the model’s original config references missing generated-code headers such as `rte_bsw_analog.h`, attach an in-memory `CodexSimOnlyCfg` and simulate with that. Do not edit the source `.slx`.
- Load `ITKLib.slx` before the model if present.
- Treat MATLAB as a reusable long-lived process unless production explicitly uses `SATK_MATLAB_SESSION_MODE=new`. If a model or library such as `ITKLib` is already loaded from a path outside the current workdir, close that loaded instance before loading the current workdir copy.
- Kill stale task-owned `matlab-mcp-core-server` processes after SATK calls if they remain running and block later calls.

## Preferred End-to-End Workflow

Production invocation is intentionally minimal: the backend may provide only `<model>.slx`, `<model>.mat`, and this skill. The agent must not wait for screenshots, prior chat context, or MQTester reports before generating AND/OR MC/DC stimuli.

### Artifact-First Failure Policy

For Hermes and Windows VM runs, artifact creation is a hard gate:

1. Inspect the model and design coverage-oriented Tests.
2. Build `outputs/<model>_Test0001_tcsd.xlsx` from `assets/templates/tcsd_template.xlsx`.
3. Verify the workbook exists and passes basic workbook/TCSD validation.
4. Only then extract cases, run simulation, collect coverage, or backfill `expValue(...)`.

If the post-workbook simulation/backfill phase hits any MATLAB/MCP/SATK timeout or instability, stop that phase immediately. Do not retry `sim()`, do not run extra coverage exploration, and do not let the outer Hermes request reach its one-hour timeout. Return strict JSON with `status: "failed"`, a clear `errorMessage`, and a warning that expected-output backfill was skipped or partial. A checkpoint workbook may be included in `outputFiles` for diagnosis, but it must not be presented as a completed automated-test deliverable.

1. Create or select a clean model workdir.
2. Copy `assets/support-package/.` into the workdir.
3. Place the user’s `<model>.slx` and `<model>.mat` in the same workdir.
4. Load support paths, run `init_Global.m`, load the MAT, load `ITKLib.slx`, then load the model.
5. Verify `which model_read` and `which model_overview` are nonempty after MATLAB setup. If not, restore the SATK tools path before deriving model facts.
6. Derive root Inports and Outports from the model, including port order, data type, and dimensions. Do not guess.
7. Inspect hierarchy and decision-producing blocks: Switch, RelationalOperator, Logical Operator, MinMax, MultiPortSwitch, Saturate, Lookup, Safe_Divide, Delay, Latch, StopWatch, LowPass, GradientLimiter.
8. Build a coverage-obligation checklist before writing TCSD rows.
9. Create a JSON spec or workbook draft, then build the final workbook from `assets/templates/tcsd_template.xlsx`.
10. Validate workbook existence, sheet shape, self-contained Test initialization, final action delays, and Excel zip integrity before starting simulation/backfill.
11. Extract TCSD actions to simulation JSON.
12. Run one bounded simulation pass and export results.
13. Backfill stable top-level output expectations when simulation succeeds within the time budget.
14. Validate workbook shape, `expValue` left-hand names, vector-output omissions, and Excel zip integrity.
15. Run the MATLAB cleanup contract before returning the final artifact JSON.
16. If coverage feedback exists and the user explicitly asks for a repair iteration, add versioned supplemental Tests and repeat. Do not start unbounded repair loops during the first production generation task.

## MATLAB Cleanup Contract for Hermes

Hermes generation tasks must leave MATLAB in a clean enough state for the next task. This matters on developer Macs that reuse a MATLAB desktop and on Windows VMs that may keep a MATLAB/SATK process warm for throughput.

At task start:

- Record the original MATLAB current folder and path.
- Record models/libraries already loaded before the task.
- If `ITKLib` or the target model is already loaded from another path, close that loaded instance with `bdclose(name)` before loading the workspace copy.

During the task:

- Track each model/library loaded from the task workdir, including support libraries.
- Avoid saving source models or libraries unless the user explicitly requested model edits.

At task completion, including failures:

- Close every model/library loaded by this task whose `FileName` is under the task workdir.
- Clear task-local variables and simulation outputs.
- Restore the original current folder and path when possible; otherwise remove the task workdir, support-package paths, and skill script paths that were added by this run.
- Shut down task-owned MCP/SATK sessions. If a task-owned `matlab-mcp-core-server` remains and blocks future calls, terminate only that stale task-owned process and report it in the task warnings.
- Put cleanup in `try`/`catch` or MATLAB `onCleanup` so it runs after model-load errors, failed simulations, timeouts, and interrupted Hermes runs.

## TCSD Style Learned From ACCtl/PwrLimEng

- The bundled `assets/templates/tcsd_template.xlsx` is the canonical Excel input form for the downstream automatic test software. Do not create a blank workbook from scratch.
- One `TCSD` sheet.
- Row 2 is `TestGroup`.
- Test rows use `Type = Test` and `Work Status = reviewed`.
- Preserve the template's columns, freeze pane, cell styles, comments/status options, and workbook structure.
- `Test Case Description` should include a method, such as requirement analysis, boundary value, equivalence class, or coverage feedback.
- Each Test row's `Initialization` assigns all root inputs required for deterministic startup, plus explicit parameter overrides as `p ParamName = value;`. Do not rely on the TestGroup row or previous Tests being inherited by the downstream runner.
- If using a JSON spec, keep shared startup values in `test_group.initialization_1/2` for readability and put only per-Test overrides in `test.initialization`; `scripts/build_tcsd_from_json.py` expands the shared startup values into every Test row and lets the Test-specific values win.
- `Action` uses relative time markers like `[+100ms]` or `[+0.2s]`.
- Vector root inputs are initialized element by element, for example `VectorSig 1=5000;`, not as `VectorSig = [5000 5000];`.
- Every Test `Action` ends with a final relative delay marker such as `[+0.1s]` after the last assignment or expectation.
- Executable lines end with English semicolons.
- Comments use `//`.
- Keep comments practical: name the branch/selector/condition change being targeted.
- For state, gear, or mode transitions, comments and descriptions should say "request/target/attempt" until simulation evidence proves the target state. After backfill, do not claim "shifted/entered/reached" unless the matching top-level output expectation proves it in the same action step.
- Inline comments that state concrete values, such as `stDrvGear=1(D)`, must match the corresponding `expValue(...)` line after backfill. If not, repair the stimulus and rerun backfill, rewrite the Test as blocked/not-reached/inhibited, or remove the claim.
- Do not combine many state transitions into one Stateflow traversal Test unless every transition step has distinct stimulus, enough hold time, and simulation evidence that the state output changed as intended.

## Expected Output Rules

The biggest correctness issue in the thread was expected-output semantics:

- Only top-level Outports may be used as `expValue(...)` left-hand sides. Do not put internal/local signals or `out_mil_ec` names into TCSD expected outputs.
- `expValue(var1,duration,offset)` means:
  - `var1`: expected value or input-signal name string;
  - `duration`: check duration;
  - `offset`: offset from the current interval.
- The second and third arguments are not numeric tolerance. Do not use them to express tolerance.
- For simulation-sampled expected values, write `expValue(value)` by default.
- If an output ramps or changes during the following hold interval, omit that output from the Test. Do not write one sampled value and then let the unit-test/MQT checker compare it as a held constant.
- For Stateflow/state-machine/history-feedback outputs, omit expectations unless a full simulation or MQTester-equivalent trace confirms the stable post-delay value. Do not copy initialization/default values into later `[+delay]` intervals.
- Stimulus coverage and expected-output coverage are separate. Keep a Test/action if it improves model coverage even when few outputs are stable enough to backfill.
- Treat semantic consistency as a hard quality gate after backfill. For every claim that a state, gear, or mode was reached, identify the proof output, resolve the claimed value from model constants or trusted simulation evidence, and compare it with the `expValue(...)` lines in the same step. If a Test says the model reached D, charging, ready, sleep, traction, or another named state/mode but the relevant top-level `expValue(...)` still shows the old/default value, repair the stimulus/prerequisites/hold timing and rerun backfill, rewrite the Test as a blocked/not-reached path, or remove the success claim before returning the workbook. Do not mark mismatched Tests as `reviewed`.

## Default Backfill Output Scope

By default, call `scripts/backfill_expected_outputs.py --outputs` with every scalar root Outport discovered during model inspection.

- Do not hand-select only a few outputs to keep Actions short; that hides simulation evidence.
- Let the simulation `stable=false` metadata suppress ramping or dynamic outputs per Test.
- Pass model-inspected stateful-risk outputs through `--exclude-outputs` unless a trusted trace proves stable post-delay behavior.
- Omit vector root outputs unless the target TCSD/MQT vector macro syntax and element mapping are confirmed.
- A smaller output allowlist is acceptable only for a documented importer/readability/performance limit or an intentionally narrow diagnostic run.

## State Transition Design Rules

For Stateflow charts, enum state outputs, latches, edge-triggered paths, and mode/gear state machines:

- Trace transition conditions before drafting TCSD rows. Use Stateflow guards, Switch/RelationalOperator criteria, and prerequisite enables to identify the root inputs or scalar parameters that must be set.
- Resolve enum and constant values from the loaded MAT/init/data dictionary/model workspace. Do not guess mode values from similar signal names.
- Do not assume a request signal alone reaches the target state. Set all prerequisite gates first, such as brake, door, seatbelt, ready, authentication, speed, voltage, fault-validity, and mode enables.
- Use enough hold time for filters, debounce logic, LowPass blocks, StopWatch/Delay blocks, and chart entry/exit actions. Prefer measured probe timing. If timing is unknown, hold prerequisites for around `[+1s]`, change the request/trigger, then hold another `[+1s]` before checking state outputs.
- Split transitions into narrower Tests when one long sequence would make failures ambiguous.

## Minimum Functional-Domain Coverage

For models with recognizable functional domains, each present domain needs at least one independent Test, a clear merge reason, or an unreachable/invalid explanation:

- fault and validity signal families such as `*SigErr`, `*Vld`, `*Flt`, `*FltLvl`, diagnostic enable/reset;
- continuous threshold inputs such as speed, voltage, current, torque, temperature, slope, and pedal position, covering both sides of thresholds and equality where relevant;
- mode/config enum inputs such as `stMod`, `stMode`, `stCfg`, gear request, charge mode, drive mode, scene mode;
- Stateflow target states or transition families;
- diagnostic/error paths such as `Diag`, `ErrCheck`, lock/unlock, stuck, plausibility, timeout;
- special operating modes such as APA/RPA, cruise/ACC, charging, anti-theft, wash, traction, camping, cart, OTA, and similar model-visible feature gates.

Prefer splitting unrelated modes and diagnostic paths into focused Tests. Do not hide them inside one broad scenario when the resulting expected outputs cannot prove which condition actually changed.

## Coverage Design Rules

Treat every decision outcome as an obligation:

- `MinMax`: every input port should win at least once. Avoid equal/tie values because coverage attribution can be ambiguous.
- `MultiPortSwitch`: cover every valid selector value and default/otherwise only if the model safely accepts that selector.
- Invalid `MultiPortSwitch` selector errors must be diagnosed, not hidden. The simulation script reports `simulate_tcsd_cases:InvalidMultiPortSwitchSelector` with block/source/indexing details. Fix the TCSD stimulus, settle time, or safe scalar override first; use `TCSD_ALLOW_MPS_DEFAULT_OVERRIDE=1` only for temporary diagnosis and do not use that run for trusted expected-output backfill unless the default behavior is intentionally justified.
- `Saturate`: cover below-low, pass-through, and above-high regions by proving the pre-saturation input crosses the limits. If calibration/lookup values can never exceed a limit, record the remaining region as unreachable rather than unsafe table manipulation.
- `RelationalOperator`/`Switch`: cover both true and false by driving the actual trigger signal across the block criterion. For sign criteria such as `< 0`, `<= 0`, `~= 0`, or `u2 ~= 0`, include negative, zero, and positive/equality-side values as applicable.
- `Logical Operator`: satisfy MC/DC from model structure during the initial production run. For N-input OR, use all inputs false plus one case for each single true input. For N-input AND, use all inputs true plus one case for each single false input. For chained logic, NOT-fed inputs, relational outputs, and enum equality banks, target the truth vector at the logical operator input ports and resolve the raw root-input values needed to produce that vector. Write the resolved enum/state values into TCSD root-input assignments, such as BMS activity states `4/8/9` or relay closed state `2`, when those constants are present in the loaded model data.
- `Safe_Divide`: denominator zero/protected path and normal nonzero path.
- `Lookup_n-D`: use low/mid/high and edge breakpoints that influence downstream decisions.
- `LowPass`/filter/GradientLimiter upstream of a selector: use Initialization, longer hold time, or explicit scalar parameter override so the intended selector/result actually settles.
- Delay/latch/StopWatch: use multi-step action sequences for initial, set, hold, reset, and timeout states.
- Coverage closure requires evidence. Do not mark a feedback item fixed only because a Test comment says it targets that outcome; confirm with a coverage rerun or a focused probe of the relevant internal block inputs/selectors.

## Static SLX Inspection

SATK/MCP/MATLAB is the authority. Static `.slx` XML inspection is only a supplement after SATK/MCP/MATLAB model reading has been attempted or used, and only for exact SIDs, block parameters, and line connectivity:

```bash
SKILL_DIR=/path/to/simulink-ut-tcsd-generator
MODEL_SLX=MODEL.slx
python3 "$SKILL_DIR/scripts/inspect_slx_xml.py" "$MODEL_SLX" --pattern "MultiPortSwitch|MinMax|Saturate|<Line|<Branch"
```

Do not pipe `.slx`/zip/XML output directly into interpreters such as `python3 -c`, `perl`, `ruby`, or `node -e`. That pattern can trigger security approval and encourages bypassing SATK/MCP model reading.

Use static inspection to find SIDs, constants, block parameters, `DataPortOrder`, `Inputs`, `UpperLimit`, `LowerLimit`, and line connectivity. Always run simulation after designing stimuli.

## Simulation and Script Lessons

- Use the skill scripts rather than rewriting large boilerplate:
  - `scripts/build_tcsd_from_json.py`
  - `scripts/extract_tcsd_cases.py`
  - `scripts/simulate_tcsd_cases.m`
  - `scripts/backfill_expected_outputs.py`
  - `scripts/setup_ut_support.m`
  - `scripts/satk_eval.py`
- The generic builder expands bracketed vector assignments into TCSD element assignments, and the extractor can read element syntax such as `VectorSig 1=5000;`.
- Bracketed vectors may be convenient inside intermediate JSON/spec drafts, but the final TCSD workbook for the current target toolchain should use element assignments.
- The generic simulation script handles vector root inputs/outputs; backfill should still usually allow only scalar top-level outputs unless vector TCSD macro mapping is confirmed.
- `openpyxl` is required for the Python workbook scripts. If system Python lacks it, use the runtime Python available in the agent environment or install/use an environment with `openpyxl`.
- For large models such as GearLvr, keep simulation/backfill behind the artifact-first checkpoint. If a 600s MCP call timeout occurs during backfill, do not make a second simulation attempt in the same request; mark the task failed/partial instead of returning a workbook with no expected values as completed.
- Write model-specific helper scripts only when the generic scripts cannot reasonably support a model-specific constraint. If such a script encodes a working MATLAB setup, parameterize paths instead of hardcoding one workbook forever.

## SATK Runtime for Hermes and Windows VMs

Hermes production must make SATK startup deterministic. The skill's `scripts/satk_eval.py` supports these environment variables:

- `SATK_MCP_SERVER`: full path to `matlab-mcp-core-server` or `matlab-mcp-core-server.exe` when the toolkit is not in the default user `.matlab/agentic-toolkits` folder.
- `SATK_MCP_EXTENSION`: full path to `simulink/tools/tools.json`.
- `SATK_MCP_LOG_FOLDER`: short ASCII log/socket folder. Use `C:\Temp\matlab-mcp-core-server-codex` on Windows when possible.
- `SATK_MATLAB_SESSION_MODE`: use `new` for unattended production VMs, or `existing` only when MATLAB is already open and intended to be reused.
- `SATK_MATLAB_ROOT`: MATLAB installation root, for example `C:\Program Files\MATLAB\R2026a`; this is passed only when `SATK_MATLAB_SESSION_MODE` is not `existing`.

Recommended Windows VM bootstrap before invoking Hermes generation:

```bat
set SATK_MCP_LOG_FOLDER=C:\Temp\matlab-mcp-core-server-codex
set SATK_MATLAB_SESSION_MODE=new
set SATK_MATLAB_ROOT=C:\Program Files\MATLAB\R2026a
```

If SATK initialization fails before any MATLAB code executes, inspect `server-*.log` and `watchdog-*.log` in `SATK_MCP_LOG_FOLDER`. Errors such as `socket file access timed out`, `bind: invalid argument`, or `bind: operation not permitted` are MCP runtime/socket problems. Do not treat them as model-load failures and do not replace SATK reading with static SLX parsing; fix the runtime by using a short log folder and a host execution mode that allows local socket binding.

## PwrLimEng Lessons

Relevant root outputs for expected values:

- `PwrLimEng_tqEngMax`
- `PwrLimEng_tqISGMax`
- `PwrLimEng_tqISGMin`
- `PwrLimEng_pwrMaxISGMecChrg`
- `PwrLimEng_pwrMaxISGMecDchrg`
- `PwrLimEng_effISGDchrg`

Important misses and fixes:

- The first draft covered execution well but decision coverage was low. The feedback screenshot showed condition coverage around 90.9%, decision coverage around 69.3%, and execution 100%.
- A later `PwrLimEng_Test0002` repair improved coverage but still missed outcomes because several Tests described the desired branch without making the internal decision input actually reach it. For future repair passes, create `PwrLimEng_Test0003_tcsd.xlsx` or another versioned workbook and verify each feedback item with coverage/probes.
- A `Max` in `A02_ISGMaxMinTq/B01_PredSpd` had only input 1 winning. Add a speed-decrease case so derivative/filter output is negative and the zero/other input wins, then a speed-increase step to cover the other side.
- `Abs` blocks need source-sign coverage, not just magnitude coverage. In `A01_EngMaxTq`, a normal negative `icisg_tqISGMin` covers only the negative-source side; add a positive-source case if the coverage report flags the other side. In `B01_PredSpd`/efficiency paths, use negative speed or a strong transition before the `Abs` when the source sign is what matters.
- `B02_ISGPwrEff` `MultiPortSwitch` covered selector `0/1/2` but missed `3` and `4`. Use 380V/400V in Initialization or shorten `PwrLimEng_tiISGVoltFilt_C`; a short 0.2s step with the original LowPass may not settle enough.
- For `B02_ISGPwrEff`, setting `icisg_uAct` to 400 or 450 is not sufficient evidence that selector `*,4` was reached. Probe the selector after LowPass/lookup, or force a settled high-voltage selector with Initialization/parameter override.
- `B02_ISGPwrEff` `Saturation1` must cover below-low, pass-through, and above-high pre-saturation values. Before generating cases, inspect or probe the signal entering `Saturation1`; extreme `icisg_uAct`, speed, or torque values are not evidence by themselves. If the MAT lookup/calibration tables keep values within `[0.1, 1]`, document low/high saturation branches as unreachable rather than using unsafe table edits.
- AWD and non-AWD efficiency paths can have separate MultiPortSwitch/Saturate blocks; cover high-voltage selector regions in both when present.
- In `B04_ISGPwrEffAWD`, the final Switch true branch requires `icisg_tqAct < 0`. AWD mode, high voltage, or `icisg_tqAct > 0` only exercises the false branch; include a negative `icisg_tqAct` step and confirm the logical trigger is true.
- `B03_ISGLimTq` final output Min/Max blocks need tests where each candidate wins: input torque limit, power-derived limit, zero override/protection, startup/temperature limit.
- For `B03_ISGLimTq`, final candidate coverage must be checked by probing the candidate inputs of the final Max/Min blocks. Reducing charge/discharge power or disabling ramping can still leave a different candidate winning.
- For final Min/Max candidate coverage, use explicit `p ...RampEna_C = 0` when ramp limiters otherwise prevent the intended candidate from becoming selected within the test interval. Keep separate tests for GradientLimiter behavior.
- Do not backfill hold-window expected values for ramped torque outputs. The instant value can be right while the later hold check fails.
- When regenerating after coverage feedback, write a versioned workbook such as `PwrLimEng_Test0002_tcsd.xlsx` and preserve the previous workbook.

## HvGrid Lessons

HvGrid is a larger integration-style model. The main lesson is to build a strong nominal baseline before targeting branches:

- Many unrelated gate signals can make a desired branch unreachable if they are left at zero.
- Cover feature clusters as separate Tests:
  - high-voltage ready normal drive path;
  - zero-voltage Safe_Divide protection;
  - battery charge/discharge limits;
  - V2L/V2In/DC-charge modes;
  - ECC priority, SOC hysteresis, and low-temperature logic;
  - APU charging and engine-start request;
  - energy/odometer reset edges;
  - front/rear motor bypass and stall heating;
  - relay open/close and heating delay paths.
- HvGrid has vector root inputs such as `EMTqFil_dtqIncGrdt` and `EMTqFil_dtqDecGrdt`; express them element by element in final TCSD initialization/action, for example `EMTqFil_dtqIncGrdt 1=5000;` through `EMTqFil_dtqIncGrdt 4=5000;`.
- HvGrid has vector root outputs such as `HvGrid_pwrAvl`. Do not auto-backfill vector outputs unless the target TCSD/MQT macro syntax and element mapping are known. Build and pass a scalar-output allowlist to the backfill script.
- For latch/hysteresis/delay, use multi-step sequences that cross low/high thresholds and then return. Static one-shot initialization is rarely enough.
- Each HvGrid Test should include a final `[+0.1s]` or equivalent delay at the end of `Action`; otherwise the downstream runner may not execute/sample after the last expected-value line.

## HvCoorn Lessons

HvCoorn feedback exposed a recurring logical-operator miss:

- Relay-state OR logic, such as "one of several relay/battery states matches", needs an all-false baseline and single-true cases for every OR input port. Do not cover only the all-false or nominal state.
- HVIL/status AND logic, especially nested AND chains with NOT-fed inputs, needs one satisfying baseline and one single-fault case per condition. Derive the required raw root-input value from the actual operator input polarity.
- Coverage reports may label combined logic as `Includes N blocks` with `C1..Cn`. Treat each listed condition as an obligation and generate the `N+1` MC/DC pattern unless a condition is unreachable.
- Probe logical-operator input ports or their immediate relational outputs when repairing coverage; the final mode/status output alone is not enough evidence.

For production generation without coverage feedback, still apply the same MC/DC pattern to AND/OR groups that can be traced from the model. If a required truth vector cannot be mapped to root inputs or scalar parameters, do not invent a Boolean `0/1` assignment or add a fake coverage row.

HvCoorn also exposed a state-machine expected-output failure pattern:

- Outputs such as `HvCoorn_stHVP` and downstream mode requests (`HvCoorn_stFMCUModeReq`, `HvCoorn_stRMCUModeReq`, `HvCoorn_stISGModeReq`) can transition during the initial delay. If a Test writes `expValue` after `[+500ms]`, the expected value must match the state reached after 500 ms. Do not keep expecting the initialization state (`1`/`2`) unless a trusted trace proves it remains stable.

## Validation Checklist Before Delivery

- Workbook path is under `outputs/`.
- Source `.slx` and `.mat` are unchanged.
- `unzip -t <workbook>.xlsx` succeeds.
- Sheet name is `TCSD`.
- Test rows have `Type = Test` and `Work Status = reviewed`.
- Every Test row is independently runnable: all root inputs needed for startup are initialized in that row, not only in the TestGroup row.
- Every `expValue(...)` left-hand side is a top-level Outport.
- No internal/local/MIL signal names appear as expected outputs.
- No three-argument `expValue` is present unless it is intentionally checking a stable window.
- Vector outputs are omitted unless explicitly supported.
- Vector root inputs are not written as whole-vector bracket assignments in the final workbook.
- Every Test `Action` has a final relative delay marker such as `[+0.1s]`.
- Selector values do not make simulation stop.
- AND/OR `Logical Operator` blocks have MC/DC-style truth vectors, not only the nominal all-true/all-false case.
- Coverage feedback, if available, has been translated into supplemental Tests or justified as unreachable/invalid.

## Readiness for Hermes

This skill is suitable for a Hermes-style agent if it can:

- read the skill directory and its `assets/`, `references/`, and `scripts/`;
- copy `assets/support-package/.` into the model workdir;
- run Python with `openpyxl`;
- run SATK/MATLAB to load and simulate the model;
- create local MCP watchdog sockets in `SATK_MCP_LOG_FOLDER`;
- create small model-specific JSON/spec helper scripts when model structure requires judgment.

It is not a fully push-button generator. The intended agent still must inspect the model and design coverage-oriented stimuli. The bundled scripts make Excel creation, action extraction, simulation, and expected-output backfill repeatable.
