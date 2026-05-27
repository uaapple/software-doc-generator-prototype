# TCSD Rules

## Required Template

The skill bundles the canonical Excel template at:

```text
assets/templates/tcsd_template.xlsx
```

This workbook is the downstream automatic test software's expected TCSD input form. Always generate final cases by copying/editing this template or by running `scripts/build_tcsd_from_json.py --template <skill_dir>/assets/templates/tcsd_template.xlsx`. Do not create a new blank workbook with similar-looking columns.

## Workbook Shape

- Sheet: `TCSD`.
- Columns:
  - `TestID`
  - `Name`
  - `Type`
  - `Requirement ID`
  - `Test Case Description`
  - `Initialization`
  - `Action`
  - `Work Status`
  - `Report Links`
- Row 2 is a `TestGroup`.
- Test rows use `Type = Test` and `Work Status = reviewed`.
- Preserve template style, comments/status options, row conventions, and freeze pane.
- Every final `Type = Test` row must be self-contained. Its `Initialization` cell must include the full deterministic startup assignment set for all root inputs used by the model, not just deltas from the TestGroup row.

## Initialization

Write all root inputs needed to start the model in a deterministic state:

```text
// Initialization of input signals
SignalA = 0;
SignalB = 1;
p ParamName_C = 1;
```

Use `p Param = value;` for parameter overrides.

Do not rely on downstream tools inheriting TestGroup initialization. TestGroup initialization may be kept as a readable common-default block, but final Test rows must repeat the merged defaults. When a Test needs a different value, put that assignment in the Test row and let it override the common default.

For vector root inputs, use element assignments unless the target importer is explicitly confirmed to support whole-vector syntax:

```text
VectorSig 1=5000;
VectorSig 2=5000;
VectorSig 3=5000;
VectorSig 4=5000;
```

Do not write `VectorSig = [5000 5000 5000 5000];` in the final TCSD workbook for the current target toolchain.

## Action

Use time steps and simple assignments:

```text
[+100ms] // nominal enabled state
Out1 = expValue(1);
[+0.2s]
InputA = 0;
Out1 = expValue(0);
```

Rules from the UT guidance:

- Time markers are relative. Always write time units such as `s` or `ms`; if a unit is omitted, MQT treats the value as seconds.
- Executable statements end with an English semicolon.
- Comments start with `//`.
- A Test can span multiple Excel rows as long as a new `TestID` is not started in column A, but prefer one complete Test per row unless the template forces wrapping.
- Add comments in `Action` to describe input/output signal meaning or condition changes when that helps review.
- Put the test method in `Test Case Description`, for example boundary value, equivalence class, or requirement analysis.
- End every Test `Action` with a final relative delay marker, for example `[+0.1s]`, after the last assignment or `expValue(...)` line.

## Expected Outputs

Only top-level Outports may appear as `expValue(...)` expectations in this workflow.

Allowed example:

```text
PwrLimEng_tqISGMax = expValue(171.88733);
```

Forbidden example:

```text
PwrLimEng_nPredISGChrg = expValue(2000);
```

The documented expectation call is:

```text
outSignal = expValue(var1, duration, offset);
```

- `outSignal`: output signal to check. The UT guidance also allows local signals, but this skill intentionally restricts expectations to top-level Outports.
- `var1`: expected value. It may be a numeric value or an input-signal name string; when it is a string, that input signal's values define the expectation.
- `duration`: check duration. Default is the current interval length.
- `offset`: offset relative to the current time interval. Default is `0s`.

Example: `expValue(170.83727,0.1,0.1)` means expected value `170.83727`, checked for `0.1s`, starting at `0.1s` offset from the current interval. The second and third values are not numeric tolerances.

For simulation-derived values, use `expValue(value)` by default. Use `expValue(value,duration,offset)` only when the output is stable across the requested window and the delayed/windowed check is intentional.

Only write a simulation-derived expected output when that output is stable until the next `[+...]` action step. If the output ramps or keeps changing during the following hold interval, omit that output expectation for the whole Test unless the user explicitly asks for a dense sampled staircase.

For stateful top-level outputs fed by Stateflow Charts, UnitDelay/Delay/Memory, latch/edge logic, or `*_Old` feedback, do not write expectations from initialization/default values. Expectations after `[+delay]` are checked after that delay has elapsed, so a state machine may already have transitioned before the check window starts. Backfill these outputs only from a trusted full simulation or MQTester-equivalent trace that confirms a stable post-delay value; otherwise omit them from the Test.

Stimulus coverage and expected-output backfill are separate concerns. Keep a Test/action step when it is needed to cover a decision outcome even if the relevant top-level output is dynamic and therefore omitted from expected outputs.

### Semantic Claim Consistency Gate

After simulation backfill, every Test must pass semantic claim consistency before delivery.

A semantic claim is any Test name, description, or Action comment that says a gear, state, or mode was reached, entered, shifted to, activated, allowed, blocked, or assigned a concrete value.

For each claim:

1. Identify the top-level output that proves or disproves the claim.
2. Resolve the claimed state value from model constants, enum values, or trusted simulation evidence.
3. Compare the claim with the `expValue(...)` lines in the same action step.

Rules:

- Before simulation evidence exists, use only request/target/attempt wording.
- After backfill, success wording such as `shifted`, `reached`, `entered`, `切换到`, or `进入` is allowed only when `expValue(...)` proves it.
- Inline comments such as `stDrvGear=1(D)` must exactly match the corresponding `GearLvr_stDrvGear = expValue(...)` value.
- If a mismatch is found, the workbook is not deliverable. Repair the stimulus and rerun backfill, rewrite the Test as blocked/not-reached/inhibited, or remove the success claim.
- Never keep a row where text says the transition succeeded while the simulation-backed expectation shows the old/default state.
- Do not set `Work Status = reviewed` for any Test with an unresolved semantic mismatch.

### Default Root-Output Backfill

For simulation backfill, pass all model-derived scalar root Outports to `backfill_expected_outputs.py --outputs` by default. Do not manually restrict `--outputs` to a small subset merely to keep the Action cell short.

- Let simulation results mark unstable outputs as `stable=false`; `backfill_expected_outputs.py` will omit those outputs from the affected Test.
- Stateful-risk root outputs identified during model inspection, such as Stateflow/Delay/Latch/Memory/edge-derived outputs, must be passed through `--exclude-outputs` unless a trusted simulation trace proves stable post-delay behavior.
- Vector root outputs are excluded by default unless the TCSD vector macro syntax and element/port mapping are confirmed.
- A smaller output allowlist is acceptable only with an explicit reason, such as confirmed importer limits, severe workbook readability/performance issues, or an intentionally scoped diagnostic run.

### Continuous Output Plausibility Gate

After simulation backfill, continuous physical outputs must pass a plausibility check before delivery.

Treat root Outports as continuous physical outputs when their names or metadata indicate power, torque, voltage, current, speed, temperature, SOC, pressure, gradient, limit, max/min, peak, continuous, or threshold values. Common name fragments include `pwr`, `tq`, `volt`, `curr`, `u`, `i`, `spd`, `temp`, `soc`, `pct`, `lim`, `max`, `min`, `peak`, `contns`, and `thd`.

For each continuous output:

1. Compare values across all Tests and action steps.
2. Flag suspicious values when:
   - a non-Boolean continuous output is exactly `0` or `1` without a matching description or model fact explaining why;
   - the value changes by more than one order of magnitude compared with neighboring steps or same-family outputs;
   - same-family outputs such as `pwrMax*`, `pwrPeak*`, and `pwrContns*` disagree in an implausible way;
   - a max/peak/continuous limit output violates expected ordering, for example `pwrMax < pwrContns`, unless model logic explicitly explains it;
   - the output remains at an initialization/default/sentinel value while the Test claims a limiting path is active.
3. For every suspicious value, either:
   - confirm it with simulation/probe evidence and add a concise explanatory comment;
   - repair stimulus/hold timing and rerun backfill;
   - remove that output expectation from the affected Test when it is not stable or not trustworthy.

Suspicious values are not automatically wrong, but they are not deliverable without evidence. Do not deliver a reviewed workbook containing unexplained expectations such as `pwrMax... = expValue(1)` when neighboring power expectations are in the thousands or tens of thousands.

### Output Family Consistency

Group top-level outputs by common physical quantity and suffix, such as charge/discharge power limits, torque limits, voltage limits, current limits, and diagnostic flags.

- Boolean outputs such as `b*` may use `0`/`1`.
- Enum/state outputs such as `st*` may use small integers when resolved from model constants.
- Continuous limit outputs such as `pwr*`, `tq*`, voltage/current/speed/temperature/SOC, `*Max*`, `*Min*`, `*Peak*`, and `*Contns*` should use engineering-scale values unless the model evidence says otherwise.
- If a continuous output has `expValue(0)` or `expValue(1)`, verify whether zero/one is physically meaningful for that condition.
- Check expected ordering when names imply it: peak limit should usually be greater than or equal to continuous limit, max should usually be greater than or equal to min, and charge/discharge sign conventions must be explained when negative values are expected.

## Multidimensional Signals

The UT guidance shows vector I/O can use macro syntax such as:

```text
$output[4]$ = expValue(0);
```

Here `4` is the vector output port index. Equivalent macro syntax can be used for vector inputs. Use this only when the target TCSD/MQT import supports the macro and the vector element/port mapping is known; otherwise omit vector expected outputs or document them separately.

## Validation

Before finishing, check:

- The workbook was designed from a model-derived coverage-obligation matrix for Condition, Decision, and MCDC items, not only from scenario names or comments.
- RelationalOperator equality banks are represented by actual TCSD root-input assignments for every compared constant and a valid non-matching baseline where applicable.
- Every `expValue(...)` line uses a root Outport name.
- No `expValue(value,duration,offset)` is used as a numeric tolerance. If the 3-argument form is present, the output must be stable over that offset/duration window.
- No internal signals, local logging names, or `out_mil_ec` names are present.
- No root-input assignment uses whole-vector bracket syntax unless importer support was explicitly confirmed.
- Every `Type = Test` row has complete startup inputs in its own `Initialization` cell; no Test row is empty or contains only sparse overrides unless the model truly has no other root inputs.
- Every Test `Action` ends with a final relative delay marker such as `[+0.1s]`.
- Selector values are in valid model ranges.
- MultiPortSwitch invalid-selector errors have been repaired by changing stimulus, settle time, or justified scalar overrides; they are not hidden by global diagnostic suppression in normal generation.
- Uncovered `MinMax`, `MultiPortSwitch`, and `Saturate` outcomes are either covered by supplemental tests or explicitly justified as unreachable/invalid for simulation.
- Uncovered `RelationalOperator`, `Switch`, `Abs`, and AND/OR MC/DC outcomes are either covered by TCSD assignments that drive the relevant block input, explicitly justified as unreachable/invalid, or reported as unresolved. A Test description that names a condition is not enough.
- `backfill_expected_outputs.py --outputs` was given all scalar root Outports unless a documented exception applies; unverified stateful outputs are excluded through `--exclude-outputs`.
- Continuous physical outputs passed the plausibility gate: unexplained Boolean-scale values, large order-of-magnitude jumps, default/sentinel values, and impossible family ordering were justified, repaired, or omitted.
- Output family consistency was checked for groups such as `pwrMax*` / `pwrPeak*` / `pwrContns*`; Boolean `b*` and enum/state `st*` outputs are not judged by continuous-output scale rules.
- Any Test name, description, or Action comment claiming a state/gear/mode was reached matches the relevant top-level output `expValue(...)` in the same action step. Inline `Signal=value` comments match the corresponding `expValue(...)`. If the output still shows the old/default state, revise the stimulus/hold timing, rewrite the text as a blocked/not-reached path, or remove the success claim.
- No Test with an unresolved semantic mismatch has `Work Status = reviewed`.
- Workbook opens and imports.
