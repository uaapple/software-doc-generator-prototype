---
name: simulink-ut-tcsd-generator
description: Generate coverage-oriented Simulink unit-test TCSD Excel cases from models. Use when the user provides a specific `.slx` model and matching `.mat` data file and asks Codex to create, repair, or backfill unit-test cases in the same TCSD style as the ACCtl/PwrLimEng examples, especially when Simulink Agentic Toolkit, Cornex/ITK dependencies, `.sldd` data dictionaries, or simulation-derived expected outputs are involved. When this skill is named for a model, treat the full coverage-first UT TCSD workflow as the default task contract without requiring the user to repeat it.
---

# Simulink Unit-Test TCSD Generator

Use this skill to turn one Simulink module model plus its MAT data file into a TCSD Excel unit-test workbook whose tests prioritize model coverage.

## Default Invocation Contract

When the user invokes or names `simulink-ut-tcsd-generator` and provides a model work folder, `.slx`, or `.mat`, assume the complete workflow below by default. The user should not need to restate the standard requirements every time.

Minimal user prompt is enough:

```text
使用 simulink-ut-tcsd-generator，为 <workdir>/<model>.slx 和 <workdir>/<model>.mat 生成单元测试 TCSD 用例。
```

By default, you must:

- Copy `assets/support-package` into the model workdir before loading the model unless equivalent dependencies already exist there.
- Use Simulink Agentic Toolkit / SATK for model reading and MATLAB evaluation.
- Generate coverage-first unit-test cases, with decision coverage as the first optimization target.
- Derive Condition, Decision, and MCDC obligations directly from the model before writing TCSD rows; external feedback documents or screenshots may inform future repairs, but they are not required generation inputs.
- Fill `expValue(...)` only for top-level Outports, never for internal/local/MIL signals.
- Simulate successfully when possible, then backfill only stable top-level output expectations from simulation results.
- Avoid hold-style expected values for dynamic, ramping, or continuously changing outputs.
- Build the Excel workbook from `assets/templates/tcsd_template.xlsx`; this bundled template is the canonical TCSD input format expected by the downstream automatic test software.
- In Hermes/production runs, build and verify the workbook before any simulation, coverage run, or expected-output backfill. This workbook is an early checkpoint, not a completed deliverable until simulation-backed top-level `expValue(...)` expectations have been added.
- Make every final `Type = Test` row self-contained: its `Initialization` cell must include all root inputs needed for deterministic startup. Do not rely on the TestGroup row, previous Test rows, or hidden runner inheritance for required inputs.
- Write the templated workbook to `outputs/<model>_Test0001_tcsd.xlsx`, or the next versioned filename if that output already exists.
- Deliver the Excel workbook with `expValue(...)` expectations as the required output. Generation JSON/spec/simulation files may be used as internal script artifacts when helpful, but do not require a separate validation report unless the user explicitly asks for one.
- If a post-workbook simulation or backfill MATLAB/MCP/SATK call times out once, including a 600s MCP timeout, stop retrying simulation/backfill in the same request and return `status=failed` with a clear warning rather than marking a workbook without expectations as completed.
- Leave MATLAB clean after the task: close any model or library loaded from the task workspace, clear task-local variables, restore MATLAB path/current folder when possible, and stop task-owned MCP/SATK sessions so later Hermes tasks cannot inherit stale loaded models.

Ask the user only when required input files or runtime dependencies are missing, or when the model cannot be loaded after applying the bundled support package.

## Core Rules

- Use Simulink Agentic Toolkit / MCP first for model understanding: `model_overview`, `model_read`, `model_query_params`, `model_resolve_params`, and `evaluate_matlab_code`.
- Before treating direct `model_overview` / `model_read` as unavailable, check whether MATLAB says `函数或变量 'model_read' 无法识别` or cannot find `model_overview`. That usually means a previous `restoredefaultpath` removed SATK tool folders from the shared MATLAB session. Repair the MATLAB path first with `addpath(genpath(fullfile(satkRoot, 'tools')))` or by running `scripts/setup_ut_support.m`; do not immediately fall back to static SLX parsing.
- If direct MATLAB MCP tools are unavailable, run `scripts/satk_eval.py` with a MATLAB code file.
- For Hermes/production runs, make SATK startup deterministic: run `scripts/satk_eval.py` in an environment that allows the MCP server to create its local watchdog socket, and set a short ASCII `SATK_MCP_LOG_FOLDER` such as `C:\Temp\matlab-mcp-core-server-codex` on Windows or `/private/tmp/matlab-mcp-core-server-codex` on macOS. If initialization logs show `watchdog`, `socket file access timed out`, `bind: invalid argument`, or `bind: operation not permitted`, treat it as a runtime/sandbox problem and rerun SATK outside that sandbox rather than falling back to static SLX parsing.
- Do not replace SATK/MCP/MATLAB model reading with static `.slx` XML parsing. Static XML is only a supplement after SATK/MCP/MATLAB has been attempted or used, and only for exact SIDs, block parameters, or connectivity.
- Do not pipe `.slx`/zip/XML output directly into interpreters such as `python3 -c`, `perl`, `ruby`, or `node -e`. If static XML inspection is needed, use `scripts/inspect_slx_xml.py MODEL.slx --pattern REGEX` or a checked-in file-reading script.
- Copy `assets/support-package` into the working folder before loading the model unless the project already has equivalent Cornex/ITK dependencies.
- Treat MATLAB as a reusable long-lived process unless `SATK_MATLAB_SESSION_MODE=new` guarantees isolation. At task start, close any preloaded model/library whose loaded file path is outside the current workspace before loading the current workspace copy. At task end, run the cleanup rules in **MATLAB Cleanup Contract** even after failures.
- Use `assets/templates/tcsd_template.xlsx` as the required TCSD workbook template. Preserve its `TCSD` sheet, columns, row conventions, freeze pane, styles, comments/status options, and workbook structure so the downstream automatic test software can import it.
- Artifact-first checkpoint rule for Hermes/production: do not call `simulate_tcsd_cases`, `sim`, coverage APIs, or expected-output backfill until `outputs/<model>_Test0001_tcsd.xlsx` or the next versioned workbook has been written and basic workbook validation has passed. Final success still requires simulation-backed top-level `expValue(...)`.
- Treat TestGroup initialization as documentation/common defaults only. The final workbook must repeat the merged defaults in each Test row, with Test-specific assignments overriding common values.
- Write vector root-input assignments element by element in TCSD, for example `Sig 1=5000;`, `Sig 2=5000;`. Do not write whole-vector input assignments like `Sig = [5000 5000];` unless the target importer has been explicitly confirmed to support them.
- End every Test `Action` with a final relative delay marker such as `[+0.1s]` so the target has a run/sampling interval after the last assignment or expectation. Do not let a Test end on an input assignment or `expValue(...)` line.
- Fill expected outputs only for top-level Outport signals. Never put model-internal/local signals in `Action` as `expValue(...)`.
- TCSD expectation syntax is `outSignal = expValue(var1, duration, offset);`. `var1` is a numeric expected value or an input-signal name string, `duration` is the expected-value check duration, and `offset` is the offset relative to the current time interval. Extra arguments are time-window controls, not numeric tolerance.
- For simulation-sampled values, write `expValue(value)` by default. Use `expValue(value,duration,offset)` only when deliberately checking a stable value over that time window.
- Do not write hold-style expectations for outputs that keep changing before the next action step. Backfill only outputs that are stable across the following hold interval; omit ramping outputs from that Test unless deliberately generating dense per-sample staircase expectations.
- Treat top-level outputs sourced from Stateflow Charts, UnitDelay/Delay/Memory blocks, latches, edge detectors, or `*_Old` feedback as stateful expected-output risks. Do not fill them from initial/default/static values. Write `expValue(...)` for these outputs only when a full simulation or MQTester-equivalent result confirms the post-delay value is stable across the checked interval; otherwise omit those outputs from that Test.
- Treat continuous physical root outputs as an expected-value plausibility risk after backfill. Power, torque, voltage, current, speed, temperature, SOC, pressure, gradient, limit, max/min, peak, continuous, and threshold-style outputs are continuous unless model metadata proves they are Boolean or enum. Unexplained `expValue(0)`/`expValue(1)`, order-of-magnitude jumps, default/sentinel values, or impossible output-family ordering must be justified with simulation/probe evidence, repaired by stimulus/hold changes and rerun backfill, or omitted from the affected Test before delivery.
- Remember TCSD delay semantics: expectations written after `[+500ms]` are checked in the interval after that delay, not at the initialization instant. Stateful outputs must reflect the state reached after the delay has elapsed.
- Treat semantic state, gear, and mode claims as a hard delivery gate. A claim is any Test name, description, or Action comment that says a state/mode was reached, entered, shifted to, activated, allowed, blocked, or assigned a concrete value. Before simulation, use request/target/attempt wording only. After backfill, success wording such as `shifted`, `reached`, `entered`, `切换到`, or `进入` is allowed only when a matching top-level `expValue(...)` proves that same state in the same action step. Inline comments such as `stDrvGear=1(D)` must exactly match the corresponding `GearLvr_stDrvGear = expValue(...)`; otherwise repair the stimulus and rerun backfill, rewrite the Test as blocked/not-reached/inhibited, or remove the success claim. Do not set `Work Status = reviewed` for Tests with unresolved semantic mismatches.
- Before designing Tests for Stateflow charts, enum state outputs, latches, edge detectors, or state-machine-like mode logic, trace the transition path from chart conditions, Switch/RelationalOperator gates, and prerequisite enables back to root inputs or scalar parameters. Do not assume a request signal alone, such as a gear or mode request, is sufficient to reach the target state.
- For Stateflow or state-machine transition Tests, use enough hold time for upstream filters, debounce logic, LowPass blocks, StopWatch/Delay blocks, and chart entry/exit actions to settle. Prefer measured probe timing when available; otherwise use a conservative sequence such as prerequisites held for `[+1s]`, request change, then another `[+1s]` hold, or `max(2*sampleTime, known filter/debounce delay + margin)` when those parameters are known.
- Default expected-output backfill should pass every model-derived scalar root Outport to `scripts/backfill_expected_outputs.py --outputs`. Do not hand-pick a small subset such as 4 to 6 outputs unless there is a documented import/readability/performance reason. Let simulation stability filtering remove dynamic outputs, and pass model-inspected unverified stateful outputs through `--exclude-outputs` unless simulation evidence proves a stable post-delay value. Omit vector outputs by default unless TCSD vector macro mapping is confirmed.
- Generate tests for coverage first: condition true/false sides, decision outcomes, MC/DC logical vectors, threshold sides, limiters, lookup-table regions, delay/latch behavior, divide-by-zero protection, and mode switches.
- Maintain a model-derived coverage-obligation matrix before writing Tests. At minimum it must track `block path/SID`, `coverage class` (`Condition`, `Decision`, or `MCDC`), `required outcome`, `controlling root input or scalar parameter`, and the planned Test/action that drives it. Do not rely on Test names or comments as the coverage map.
- For models with recognizable functional domains, maintain a minimum coverage-density checklist before writing the workbook: nominal path, fault/validity signal families, continuous threshold/boundary inputs, mode/config enums, Stateflow target states, diagnostic/error paths, and special operating modes. Each identified domain needs at least one independent Test or an explicit merge/unreachable reason. Do not hide many unrelated modes inside one broad scenario when a failed stimulus would be hard to diagnose.
- Treat decision outcomes as explicit coverage obligations. For `MinMax`, make each input become the selected output at least once. For `MultiPortSwitch`, cover every valid selector value and the default/otherwise branch when present. For `Saturate`, cover below-low, pass-through, and above-high regions.
- If simulation fails because a `MultiPortSwitch` selector value is invalid, treat it as a stimulus/design problem first. Use the `simulate_tcsd_cases.m` diagnostic summary to identify the block, selector source, and indexing mode, then repair TCSD inputs or safe scalar overrides. Do not silently set `DiagnosticForDefault=None` for all MPS blocks in normal generation.
- `TCSD_ALLOW_MPS_DEFAULT_OVERRIDE=1` is allowed only for an explicitly diagnostic simulation run. It may suppress MPS default-case errors without saving the model, but results from that run must not be used as trusted expected-output backfill unless the selector/default behavior has been deliberately justified.
- Treat every `Logical Operator` AND/OR block as a production-default MC/DC obligation, even when the only inputs are the user-provided `.slx` and `.mat`. For N-input OR, include an all-false case plus one case per input where only that input is true. For N-input AND, include an all-true case plus one case per input where only that input is false. Target the truth vector at the logical-operator input ports, not the Test description or final output.
- For logical inputs driven by `RelationalOperator` or `Switch` criteria, trace the immediate upstream condition back to root inputs or parameters. If the condition compares a root signal with an enum/constant, resolve that value from the loaded `.mat`, `init_Global.m`, model workspace, or data dictionary; do not use generic Boolean `0/1` unless the resolved value is actually `0` or `1`. Write the resolved values directly into TCSD root-input assignments, for example BMS-style states such as `BMSActSt_online=4`, `BMSActSt_DCChrg=8`, `BMSActSt_ACChrg=9`, or relay closed values such as `2` when those mappings exist in the model data. If the same root signal feeds multiple equality comparisons, such as `stMod == 2` and `stMod == 3`, generate cases that hit each compared value plus a non-matching baseline instead of leaving only the nominal default value.
- For every `RelationalOperator`, cover the exact condition outcome from the block criterion: `==`/`~=` comparisons need matching and non-matching values, ordered comparisons need below/equal/above when equality changes the outcome, and sign comparisons need negative/zero/positive as applicable. Resolve the compared constants before writing TCSD assignments.
- For every `Saturate` block, identify the pre-saturation input signal and prove it is below the lower limit, inside range, and above the upper limit. Do not infer saturation coverage only from extreme root inputs or from the saturated output value. If the upstream lookup/calibration range cannot cross a limit with valid inputs, mark that outcome unreachable rather than forcing unsafe table edits.
- For every `Abs` block, design coverage on the pre-Abs source signal: negative, zero, and positive values. Do not treat a positive `Abs` output as covering a positive source input.
- For every `Switch` or `RelationalOperator`, inspect the actual trigger/criterion and drive the trigger signal to both sides of the condition. For sign-based criteria such as `< 0`, `<= 0`, `~= 0`, or `u2 ~= 0`, include explicit negative, zero, and positive/equality-side values as applicable; do not assume toggling an adjacent mode or selector covers the true branch.
- For filtered selector or gradient-limited logic, use Initialization, long enough hold time, or documented scalar parameter overrides to make the intended outcome actually settle before expecting coverage.
- A TCSD comment or Test description is not coverage evidence. After coverage feedback names a missing outcome, treat it as unresolved until a rerun coverage report or a targeted simulation probe shows the intended block input, selector, or branch actually occurred.
- When repairing misses, probe intermediate decision inputs if needed for stimulus design, but never write those internal signals as TCSD `expValue(...)` expectations.
- Do not stop after one static draft when coverage evidence is available. Use coverage reports, screenshots, or simulation probes to add supplemental tests for uncovered decision outcomes, then rebuild/backfill the workbook.
- When regenerating after coverage feedback, create a versioned workbook/output JSON rather than overwriting the last reviewed workbook unless the user explicitly asks for overwrite.
- Preserve user files. Do not overwrite the source `.slx` or `.mat`; write outputs under `outputs/`.

## MATLAB Cleanup Contract

Hermes may reuse the same MATLAB desktop/session across generation tasks. Always make the MATLAB side idempotent:

- Record the original MATLAB current folder and path before adding task support paths.
- Keep a list of models/libraries loaded by this task, including `ITKLib` and the target model.
- Before loading a model or library, if `bdIsLoaded(name)` is true and `get_param(name, "FileName")` points outside the current task workspace, close that loaded instance with `bdclose(name)` and then load the workspace copy.
- At task completion, whether success or failure, close all task-loaded models/libraries whose `FileName` is under the current task workspace. Use `bdclose(modelName)` / `bdclose(libraryName)`; do not save them unless the user explicitly asked to modify the source model.
- Clear task-local variables and simulation outputs with `clearvars` or a scoped cleanup script, but do not clear user/global MATLAB preferences or unrelated models that were open before the task.
- Restore the original current folder and path when possible. If exact path restoration is unsafe, at least remove the task workspace, copied support-package paths, and skill script paths that were added during this run.
- If SATK/MCP started a task-owned MATLAB or MCP server process, shut it down cleanly. If the process remains and blocks later calls, report it and terminate only that task-owned stale `matlab-mcp-core-server` process.
- Put cleanup in `try`/`catch` or `onCleanup` so it runs after errors, timeouts, or failed simulations.

## Workflow

1. **Prepare workspace**
   - Confirm the user-provided `.slx` and matching `.mat` are in the working folder.
   - Copy the support package:
     ```bash
     cp -R /path/to/skill/assets/support-package/. .
     ```
   - Keep the model-specific `.slx` and `.mat` supplied by the user as the authority.

2. **Load and inspect the model**
   - Use SATK to load support paths, run `init_Global.m`, load the `.mat`, load `ITKLib.slx`, then load the model.
   - After any MATLAB setup that calls `restoredefaultpath`, verify `which model_read` and `which model_overview` find SATK tool functions before calling direct MCP `model_read` / `model_overview`. If not, restore the SATK tools path as documented in `references/workflow-details.md`.
   - Derive root Inport and Outport order from the model, not from guesses.
   - Read the subsystem hierarchy and the blocks around Switch, Multiport Switch, Lookup Table, Delay, Latch, GradientLimiter, Safe_Divide, Min/Max, and logical operators.
   - Build a model-derived coverage-obligation matrix for Condition, Decision, and MCDC before drafting cases. Include RelationalOperator comparison values, Switch criteria, MinMax candidate ports, MultiPortSwitch selectors/defaults, Abs source signs, and AND/OR operator-input truth vectors.
   - For AND/OR `Logical Operator` blocks, identify immediate input sources and whether each port is driven by a root signal, relational comparison, enum equality, NOT, or nested logical expression. Use this to derive MC/DC truth vectors before writing the workbook.
   - Identify stateful top-level outputs whose source chain passes through Stateflow, UnitDelay/Delay/Memory, latch, edge, or old-state feedback blocks. Use this list as an exclusion list for unverified expected-output backfill.
   - Use static `.slx` XML inspection only as a supplement after SATK/MCP/MATLAB model reading, when block paths, SIDs, constants, or line connectivity are needed. Prefer `scripts/inspect_slx_xml.py`; do not use shell pipelines that feed zip/XML output into inline interpreter commands.
   - Build a block-level coverage-obligation checklist before writing tests. See `references/coverage-closure.md`.

3. **Design TCSD cases**
   - Create one TestGroup and multiple Test rows.
   - Each Test should describe one functional coverage target.
   - In `Test Case Description`, state the test method such as boundary value, equivalence class, requirement analysis, or coverage feedback.
   - Before drafting a Test whose target is a Stateflow transition, enum state output, latch, edge-triggered path, or mode state machine, trace the exact prerequisites and transition conditions back to root inputs or scalar parameters. Use Stateflow entry/exit conditions plus upstream Switch/RelationalOperator criteria as the authority; do not assume one request input reaches the target state by itself.
   - In each Test row's `Initialization`, assign all root inputs and any needed parameter overrides (`p Param = value;`). You may keep common defaults in the TestGroup row for readability, but the final Test row must be independently runnable.
   - In `Action`, step inputs over time with `[+100ms]`, `[+0.2s]`, etc.
   - For state-machine transitions, first set all prerequisites, hold long enough for filters/debounce paths to settle, then change the request signal, then hold again for chart entry/exit actions. If no model-specific delay is known, prefer `[+1s]` to `[+2s]` transition holds over short `[+500ms]` assumptions.
   - Expand vector root inputs into element assignments, for example `EMTqFil_dtqIncGrdt 1=5000;` through `EMTqFil_dtqIncGrdt 4=5000;`.
   - Add a final `[+0.1s]` or equivalent final delay at the end of every Test `Action`.
   - Use explicit time units (`s`, `ms`, etc.), terminate executable statements with English semicolons, and write comments with `//`.
   - Describe input/output meanings or condition changes in `Action` comments when they clarify the coverage target. Before simulation, use "request/target/attempt" wording for transitions; after backfill, use "reached/shifted/entered" wording only when the corresponding top-level output expectation proves that state.
   - Avoid combining several state transitions such as P -> R -> N -> D in one Test unless each step has distinct stimulus, sufficient hold time, and simulation evidence that the expected state actually changed. Split the sequence into narrower Tests when a failed transition would otherwise make every step look like the same default output.
   - Build a functional-domain checklist before finalizing Tests. Include independent coverage for fault/validity inputs, threshold or boundary inputs, mode/config enums, Stateflow target states, diagnostic/error paths, and special modes when those domains are present. If a domain is merged into another Test or cannot be reached safely, write that reason in the description/spec instead of silently omitting it.
   - Add targeted supplemental Tests for uncovered `MinMax`, `MultiPortSwitch`, `Saturate`, `Logical Operator`, relational, and selector outcomes before optimizing for compactness.
   - For RelationalOperator equality banks on the same root signal or mode/config signal, include one case for every compared constant and one non-matching baseline when that baseline is model-valid. Do not let a default value such as `stMod = 1` stand in for comparisons that require `stMod = 2` or `stMod = 3`.
   - Do not wait for MQTester reports or chat history to cover AND/OR logic. In the first production workbook, include TCSD actions that realize the derived MC/DC truth vectors for model-visible AND/OR blocks where the upstream conditions can be traced to root inputs or scalar parameters.
   - For each supplemental Test, record the exact missing decision outcome it targets. Do not count it as closed merely because the stimulus appears plausible.
   - Keep coverage-only stimuli even when their outputs are dynamic and therefore have few expected-output lines.
   - Add only top-level output expectations.

4. **Build the Excel**
   - Start from `assets/templates/tcsd_template.xlsx`; do not create a fresh workbook from scratch.
   - Either edit a copy of the template directly or create a JSON spec and run `scripts/build_tcsd_from_json.py --template <skill_dir>/assets/templates/tcsd_template.xlsx`. The builder merges `test_group.initialization_1/2` into every Test row and lets each Test's own `initialization` override the shared defaults.
   - Keep sheet name `TCSD`, columns, row 2 `TestGroup`, freeze pane, comments/status options, cell styles, and reviewed status consistent with the template.
   - In Hermes/production, immediately run the basic workbook validation (`unzip -t` and a quick `TCSD` sheet/root-input check) after this step. If later simulation/backfill fails or times out, this workbook is only an incomplete checkpoint.

5. **Backfill expected outputs from simulation**
   - Run this step only after the workbook exists and has passed basic validation.
   - In Hermes/production, expected-output backfill is required for a completed task. If a MATLAB/MCP/SATK call for simulation or backfill times out once, stop this step, do not retry `sim()` or coverage exploration in the same request, and report the task as failed/partial rather than completed.
   - Extract actions with `scripts/extract_tcsd_cases.py`.
   - Run `scripts/simulate_tcsd_cases.m` through `scripts/satk_eval.py`. In Hermes or Windows VM production, configure the environment variables documented in `references/hermes-agent-handoff.md` before running SATK.
   - If simulation reports `simulate_tcsd_cases:InvalidMultiPortSwitchSelector`, inspect the diagnostic block list and fix the selector-driving inputs, hold time, or safe scalar parameter overrides before backfilling.
   - Apply results with `scripts/backfill_expected_outputs.py`. Pass any unverified stateful outputs as `--exclude-outputs` so they are removed from expectations instead of being filled with misleading default states.
   - Unless vector output mapping or workbook/import limits justify a narrower allowlist, call `backfill_expected_outputs.py --outputs` with all scalar root Outports discovered during model inspection. A small manual output subset hides simulation evidence and is not the default production path.
   - Validate that every `expValue(...)` left side is a root Outport.
   - Run the continuous-output plausibility gate after backfill. Check `pwr*`, `tq*`, voltage/current/speed/temperature/SOC, `*Max*`, `*Min*`, `*Peak*`, `*Contns*`, and other physical limit outputs for unexplained Boolean-scale values, large jumps, default/sentinel values, and implausible same-family ordering. Do not deliver `reviewed` rows with suspicious continuous expectations unless they are justified, repaired, or omitted.
   - Validate that the final workbook contains `expValue(...)` expectations before reporting success. A workbook with only stimuli is not a completed TCSD deliverable for automated test execution.

6. **Verify**
   - Run `unzip -t` on the output workbook.
   - Inspect the TCSD sheet with a spreadsheet library or artifact-tool.
   - Check every Test row has the full root-input initialization set needed to run by itself; reject workbooks where Tests only contain sparse deltas and depend on TestGroup inheritance.
   - Check there are no internal-signal expectations and no unsupported input values exposed by simulation.
   - Check that stateful top-level outputs are either backed by verified stable post-delay simulation evidence or omitted from the affected Test. Never leave a state-machine output expected to stay at its initialization value merely because the first action begins with a delay.
   - Check continuous physical outputs for plausibility and output-family consistency. Boolean `b*` outputs may be `0`/`1`, and enum/state `st*` outputs may be small integers; continuous `pwr*`, `tq*`, voltage/current/speed/temperature/SOC, and limit/max/min/peak/continuous outputs need engineering-scale or model-evidence justification.
   - Cross-check semantic claims after backfill: for every state/gear/mode claim, identify the proof output, resolve the claimed value from model constants or trusted simulation evidence, and compare it with `expValue(...)` in the same step. If a Test name, description, or Action comment says a state was reached while the proof output still shows the old/default value, repair the stimulus/hold timing and rerun backfill, rewrite the text as a blocked/not-reached path, or remove the success claim before delivery.
   - Check the workbook Actions themselves for Logical Operator MC/DC: each traceable AND/OR group must have TCSD input assignments that realize the required truth vectors. If a truth vector cannot be traced to root inputs or scalar parameters, do not add a fake coverage row or claim it covered.
   - Check the workbook against the model-derived coverage-obligation matrix: every traceable RelationalOperator condition, MinMax winner, MultiPortSwitch selector, Switch side, Abs source sign, and AND/OR MC/DC vector is either mapped to a Test/action, marked unreachable/invalid with a concrete model reason, or reported as unresolved.
   - If model coverage evidence is available, use it to confirm or refine the generated MC/DC obligations. Coverage feedback is not a prerequisite for generating AND/OR MC/DC cases.

7. **Clean MATLAB session**
   - Run the cleanup contract above before returning the final artifact JSON.
   - Mention any cleanup failure in the task summary or warnings so the platform can surface that the next task may need a fresh MATLAB session.

## References

- Read `references/hermes-agent-handoff.md` when handing this workflow to another agent, when the agent lacks the original conversation context, or when assessing whether the skill is ready for Hermes-style execution.
- Read `references/workflow-details.md` when starting a new model.
- Read `references/coverage-closure.md` when designing or repairing cases for coverage.
- Read `references/tcsd-rules.md` before editing or validating the workbook.
- Read `references/support-package.md` when dependency loading fails.
