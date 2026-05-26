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

## Multidimensional Signals

The UT guidance shows vector I/O can use macro syntax such as:

```text
$output[4]$ = expValue(0);
```

Here `4` is the vector output port index. Equivalent macro syntax can be used for vector inputs. Use this only when the target TCSD/MQT import supports the macro and the vector element/port mapping is known; otherwise omit vector expected outputs or document them separately.

## Validation

Before finishing, check:

- Every `expValue(...)` line uses a root Outport name.
- No `expValue(value,duration,offset)` is used as a numeric tolerance. If the 3-argument form is present, the output must be stable over that offset/duration window.
- No internal signals, local logging names, or `out_mil_ec` names are present.
- No root-input assignment uses whole-vector bracket syntax unless importer support was explicitly confirmed.
- Every `Type = Test` row has complete startup inputs in its own `Initialization` cell; no Test row is empty or contains only sparse overrides unless the model truly has no other root inputs.
- Every Test `Action` ends with a final relative delay marker such as `[+0.1s]`.
- Selector values are in valid model ranges.
- MultiPortSwitch invalid-selector errors have been repaired by changing stimulus, settle time, or justified scalar overrides; they are not hidden by global diagnostic suppression in normal generation.
- Uncovered `MinMax`, `MultiPortSwitch`, and `Saturate` outcomes are either covered by supplemental tests or explicitly justified as unreachable/invalid for simulation.
- Workbook opens and imports.
