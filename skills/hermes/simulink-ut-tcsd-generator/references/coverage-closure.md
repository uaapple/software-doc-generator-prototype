# Coverage Closure

Use this reference when designing or repairing TCSD cases for model coverage. Coverage is the first priority; expected outputs are added afterward only where top-level outputs are stable.

## Build Coverage Obligations

Create a short checklist before writing the workbook:

- `Switch` / relational logic: true and false outcomes.
- `Logical Operator` AND/OR: production-default MC/DC at the operator input ports. This is required from the model structure itself and does not depend on an external coverage report.
- `MinMax`: each input port is the selected maximum/minimum at least once.
- `MultiPortSwitch`: every valid selector value, plus default/otherwise branch when the block has one.
- `Saturate`: below lower limit, pass-through region, above upper limit.
- `Lookup_n-D`: representative low/mid/high breakpoints and edge values that drive downstream selectors.
- `Safe_Divide`: denominator zero/protected path and normal nonzero path.
- `Abs` / sign-sensitive logic: negative, zero, and positive inputs.
- Delay/latch/edge/stopwatch: initial state, set edge, reset edge, hold/timeout path.
- Gradient limiter / LowPass: increase, decrease, disabled/bypass, and enough hold time for downstream decisions to change.

For every item, write one of: `covered by TC_xxx`, `needs supplemental test`, or `unreachable because ...`.

## Generate Targeted Stimuli

- Make one condition dominate at a time. For `MinMax`, set a clear margin so the intended port wins; avoid equal values because coverage tools may attribute ties unexpectedly.
- For `MultiPortSwitch`, derive selector values from the actual block and upstream logic. Do not assume a model-wide enum is valid for every switch.
- If a generated case makes a `MultiPortSwitch` selector invalid during simulation, do not keep it by suppressing the default-case diagnostic. Inspect the diagnostic summary, then fix the root-input values, settle time, or safe scalar overrides that drive the selector. Use `TCSD_ALLOW_MPS_DEFAULT_OVERRIDE=1` only for a temporary diagnosis run, not for trusted backfill.
- For `Switch` and `RelationalOperator`, read the block criterion/threshold first, then choose root input values on both sides of that exact condition. For sign-based conditions, use negative, zero, and positive values rather than only "normal positive" values.
- For an N-input OR, generate an all-false baseline to get false output, then N single-true cases such as `TFF`, `FTF`, `FFT` so each input independently drives true output.
- For an N-input AND, generate an all-true baseline to get true output, then N single-false cases such as `FTT`, `TFT`, `TTF` so each input independently drives false output.
- MC/DC is not full combinational coverage. Do not generate `2^N` combinations unless the user explicitly asks for truth-table exhaustion; the default obligation is the baseline plus one independent-toggle case per input.
- For nested or chained logical expressions, target the effective logical operator input values. If an upstream NOT feeds the operator, invert the raw stimulus so the operator input receives the intended true/false value.
- For enum/constant equality inputs, resolve the constant value from the loaded MAT/init/data-dictionary/model workspace before writing TCSD. Example: if a logical input is `icbms_stHvBat == BMSActSt_ACChrg`, the action must use the resolved value of `BMSActSt_ACChrg`, not a guessed Boolean `1`. In BMS-style models, mappings such as `BMSActSt_online=4`, `BMSActSt_DCChrg=8`, `BMSActSt_ACChrg=9`, and relay closed `=2` are enum/state values that must be written as root-input assignments when they are the resolved comparison constants.
- When a selector is produced by voltage/current/speed filtering or lookup logic, hold the source input long enough for the selector to settle, or put the desired source value in Initialization.
- For `Saturate`, identify `UpperLimit`, `LowerLimit`, and the pre-saturation input before writing stimuli. If that input is produced by lookup tables or calibration arithmetic, inspect the MAT/table min/max over valid input ranges first. Design root inputs or safe explicit parameter overrides that make the pre-saturation value lower than the lower limit, inside range, and higher than the upper limit; exact boundary values usually do not close both decisions.
- If a value causes simulation to stop because the selector is invalid, do not keep it as a normal unit-test case. Cover the default branch only when the block and model allow that selector safely.
- Use scalar parameter overrides to accelerate filters or bypass ramping only when needed for coverage. Keep them explicit in `Initialization` and avoid hiding model behavior without explanation.

## Use Coverage Feedback

When a coverage report shows uncovered outcomes:

1. Locate the exact block path and missing outcome, such as `input 2 is the maximum` or `selector = 3`.
2. Identify the root inputs or calibration parameters that control the block input/selector.
3. Add a supplemental Test with a narrow description naming the block/outcome.
4. Run simulation to ensure the model accepts the stimulus.
5. Backfill only stable top-level outputs. Do not add internal expected signals to prove the outcome.
6. Re-run coverage if possible; repeat until the target is met or remaining outcomes are justified.

Do not mark a missing outcome as closed only because the Test name, comments, or input values appear to target it. A supplemental Test is successful only when coverage feedback changes, or when a focused simulation probe confirms the relevant internal block input/selector actually crossed the intended side.

Useful probes for closure, while still keeping TCSD expectations top-level only:

- `Abs`: log or infer the source signal sign; cover negative, zero, and positive source values before the `Abs`, not just positive magnitudes after it.
- `MinMax`: log every candidate input during the step and confirm the intended candidate is strictly greater/less than the others. Avoid ties and near-ties.
- `MultiPortSwitch`: log the integer selector at the block input. High source values such as voltage or mode commands do not prove the selector reached the intended port when a filter, lookup, or quantizer is upstream.
- `Saturate`: log the pre-saturation value and confirm it is below low, inside range, and above high. Do not claim closure from the saturated output alone. If valid MAT/calibration data keeps the pre-saturation value inside the limits, record the low/high outcomes as unreachable instead of inventing unsafe table edits.
- `Switch` / relational logic: log the logical trigger value; for sign-based switches, deliberately cover both positive and negative root inputs.
- `Logical Operator`: log or otherwise prove each operator input port saw the intended truth vector, not just the final output. OR needs all-false and single-true vectors; AND needs all-true and single-false vectors. The generated TCSD workbook must contain the actual root-input assignments for each traceable vector; do not rely on a separate report as the coverage artifact.
- Filtered or ramp-limited paths: use longer hold time, Initialization, or explicit parameter overrides, then confirm the downstream decision saw the settled value.

## PwrLimEng Feedback Pattern

The PwrLimEng feedback exposed common misses:

- A `Max` block in `A02_ISGMaxMinTq/B01_PredSpd` had only input 1 winning. Add a speed-decrease case so the derivative/filtered acceleration path goes negative and the zero input wins; then add a speed-increase step so the other port wins.
- A `MultiPortSwitch` in `B02_ISGPwrEff` covered selectors `0/1/2` but not `3` and `4`. Put 380V/400V values in Initialization or shorten `PwrLimEng_tiISGVoltFilt_C` so the selector settles. A short step with a slow LowPass may not move the selector far enough.
- For AWD/non-AWD efficiency selection, toggle the root mode signal and cover the same high-voltage selector regions in both paths when separate MultiPortSwitch blocks exist.
- Saturation in efficiency paths needs explicit pre-saturation below-low, normal, and above-high cases. If the real lookup tables never exceed the saturation limits, record the high/low saturation outcome as unreachable from normal calibration rather than inventing unsafe table overrides.
- `B03_ISGLimTq` output Min/Max blocks need cases where each candidate limit wins, including torque command, electrical power limit, zero override, and startup/temperature limit branches.
- For final Min/Max candidate coverage, disable ramp limiters with explicit `p ...RampEna_C = 0` when the ramp output prevents a stable candidate from becoming the selected value within the test interval. Keep separate ramp tests for GradientLimiter behavior.

The later PwrLimEng_Test0002 feedback added a stronger lesson: coverage intent was present in several Test descriptions, but the actual coverage report still showed holes. When fixing similar models:

- In `A01_EngMaxTq`, `Abs` before the engine torque comparison needs both signs of `icisg_tqISGMin`; a normal negative torque limit only covers the negative-source side.
- In `B01_PredSpd`, cover negative `icisg_nAct` or a sufficiently strong decreasing speed transition before the `Abs`, and separately confirm the `Max` constant-zero input wins. A mild speed decrease may still leave the filtered acceleration path above zero.
- In `B02_ISGPwrEff`, selector `*,4` for the `MultiPortSwitch` is not guaranteed by setting `icisg_uAct` to 400/450. Probe the selector after the voltage LowPass/lookup path, or initialize/override the filter so the selector actually becomes port 4.
- For `Saturate` blocks fed by efficiency lookup tables or similar calibrated maps, extreme voltage/speed/torque inputs are not evidence by themselves. Inspect or probe the pre-saturation map output; if valid calibration data keeps it inside the saturation limits, document the low/high outcomes as unreachable rather than claiming them covered.
- For mode-switched subpaths such as AWD/non-AWD branches, do not assume the mode signal covers internal `Switch` blocks inside that subpath. Identify each internal `Switch` trigger, such as torque sign or zero/nonzero logic, and separately cover true/false with negative, zero, and positive/equality-side values as applicable.
- In `B03_ISGLimTq`, final `PwrLimEng_tqISGMin` Max and `PwrLimEng_tqISGMax` Min candidate coverage must be verified by probing candidate inputs. Cases that reduce charge/discharge power or disable ramping may still leave the wrong candidate selected.
- For a PwrLimEng coverage-repair pass, prefer producing a new version such as `PwrLimEng_Test0003_tcsd.xlsx`. If the user asks for a repair summary, map each Word/coverage feedback item to `confirmed covered`, `still uncovered`, or `unreachable`; otherwise keep the TCSD workbook as the deliverable.

## HvGrid Pattern

The HvGrid run exposed issues common to larger integration-style modules:

- Start from a complete nominal input baseline. Large modules have many unrelated gates; missing one can prevent the target branch from becoming reachable.
- Use model metadata to split scalar and vector root outputs. Backfill scalar top-level outputs first and omit vector outputs unless the TCSD macro/index mapping is known.
- For vector root inputs, keep simulation-friendly arrays only in intermediate specs if helpful; expand them to element assignments in the final TCSD workbook.
- Cover feature clusters as separate Tests: high-voltage ready path, zero-voltage Safe_Divide, battery charge/discharge limits, V2L/V2In/DC-charge modes, ECC priority/SOC hysteresis, startup/relay delay, energy reset edges, and motor bypass/stall heating.
- For latch, hysteresis, and delay logic, use multi-step actions that cross low/high thresholds and then return, rather than only one static initialization.
- For large modules, use JSON specs plus generated Excel instead of hand-editing. Keep a scalar-output allowlist and a validation script that rejects internal, local, and vector expectations.
- Reject generated rows whose `Action` ends on an assignment or `expValue(...)`; append a short final delay such as `[+0.1s]`.
