# Coverage Closure

Use this reference when designing or repairing TCSD cases for model coverage. Coverage is the first priority; expected outputs are added afterward only where top-level outputs are stable.

## Build Coverage Obligations

Create a short checklist before writing the workbook:

- `Condition` coverage: every `RelationalOperator` and Switch trigger condition must have explicit true/false-driving values derived from the actual block criterion.
- `RelationalOperator` equality banks: when one root signal or mode/config signal is compared against multiple constants, such as `stMod == 2` and `stMod == 3`, include a matching case for each compared constant plus a valid non-matching baseline. A nominal default such as `stMod = 1` does not cover the `2` or `3` comparisons.
- `Switch` / relational logic: true and false outcomes.
- `Logical Operator` AND/OR: production-default MC/DC at the operator input ports. This is required from the model structure itself and does not depend on an external coverage report.
- Calibration/parameter-fed logic: when a `Constant` block or scalar parameter/calibration such as `*_C` drives a logical input or comparison, include both parameter states needed for coverage and write them as TCSD `p Param=value;` overrides. Do not treat the MAT/default value as immutable unless the source is a literal unmodifiable constant.
- `MinMax`: each input port is the selected maximum/minimum at least once.
- `MultiPortSwitch`: every valid selector value, plus default/otherwise branch when the block has one.
- `Saturate`: below lower limit, pass-through region, above upper limit.
- `Lookup_n-D`: representative low/mid/high breakpoints and edge values that drive downstream selectors.
- `Safe_Divide`: denominator zero/protected path and normal nonzero path.
- `Abs` / sign-sensitive logic: negative, zero, and positive inputs.
- Delay/latch/edge/stopwatch: initial state, set edge, reset edge, hold/timeout path.
- Gradient limiter / LowPass: increase, decrease, disabled/bypass, and enough hold time for downstream decisions to change.

For every item, write one of: `covered by TC_xxx`, `needs supplemental test`, or `unreachable because ...`.

Keep this as a model-derived obligation matrix while drafting Tests. Recommended columns are `block path/SID`, `coverage class` (`Condition`, `Decision`, `MCDC`), `required outcome`, `controlling root input or scalar parameter`, `planned Test/action`, and `evidence state`. The matrix may live in the JSON spec or a sidecar note, but the workbook design should be traceable to it.

### Skill-only Logical MC/DC gate

For AND/OR `Logical Operator` blocks, do not rely on prompt language or Test descriptions to remember all vectors. Create a machine-checkable port mapping before writing TCSD rows:

```json
{
  "model": "ModelName",
  "operators": [
    {
      "id": "LO_001",
      "block_path": "Model/Sub/Logical Operator",
      "operator": "AND",
      "common_inputs": {
        "EnableRoot": 1
      },
      "ports": [
        {
          "index": 1,
          "source": "Mode == 2",
          "true_inputs": {
            "Mode": 2
          },
          "false_inputs": {
            "Mode": 1
          }
        },
        {
          "index": 2,
          "source": "Voltage > 300",
          "true_inputs": {
            "Voltage": 320
          },
          "false_inputs": {
            "Voltage": 280
          }
        },
        {
          "index": 3,
          "source": "Constant Value EngStrtStop_bRefuEndGearPShd_C",
          "true_params": {
            "EngStrtStop_bRefuEndGearPShd_C": 1
          },
          "false_params": {
            "EngStrtStop_bRefuEndGearPShd_C": 0
          }
        }
      ]
    }
  ]
}
```

Then expand and validate:

```bash
python3 scripts/build_logical_mcdc_obligations.py \
  --logical-operators outputs/ModelName_logical_operators.json \
  --output outputs/ModelName_coverage_obligations.json

python3 scripts/validate_logical_mcdc_mapping.py \
  --workbook outputs/ModelName_Test0001_tcsd.xlsx \
  --obligations outputs/ModelName_coverage_obligations.json \
  --report-json outputs/ModelName_mcdc_validation_report.json
```

The builder creates these default vectors:

- OR: all-false baseline plus one single-true vector per input port.
- AND: all-true baseline plus one single-false vector per input port.

If the builder reports a missing or conflicting port mapping, repair the traceability. If the vector is genuinely unreachable, edit the resulting obligation to `status: "unreachable"` or `status: "not_traceable"` and include a concrete `reason`; do not leave it as `unresolved` and do not invent root-input values that cannot drive the operator port.

The mapping validator checks workbook assignment states, not comments. A vector is counted only when a Test initialization or action step contains the root-input and scalar-parameter state declared in the obligation. Passing this gate proves only that the workbook contains the intended stimuli. Actual block-port truth vectors and Simulink Coverage must still be collected. By default, a Condition, Decision, or MC/DC result below 80% triggers one report-guided repair pass; the measured result after that pass is final even when a metric remains below 80%.

## Generate Targeted Stimuli

- Make one condition dominate at a time. For `MinMax`, set a clear margin so the intended port wins; avoid equal values because coverage tools may attribute ties unexpectedly.
- For `MultiPortSwitch`, derive selector values from the actual block and upstream logic. Do not assume a model-wide enum is valid for every switch.
- If a generated case makes a `MultiPortSwitch` selector invalid during simulation, do not keep it by suppressing the default-case diagnostic. Inspect the diagnostic summary, then fix the root-input values, settle time, or safe scalar overrides that drive the selector. Use `TCSD_ALLOW_MPS_DEFAULT_OVERRIDE=1` only for a temporary diagnosis run, not for trusted backfill.
- For `Switch` and `RelationalOperator`, read the block criterion/threshold first, then choose root input values on both sides of that exact condition. For `==` and `~=` comparisons, use the resolved matching constant plus a model-valid non-matching value. For `>` / `<` / `>=` / `<=`, use below/equal/above when the equality boundary can affect coverage. For sign-based conditions, use negative, zero, and positive values rather than only "normal positive" values.
- For an N-input OR, generate an all-false baseline to get false output, then N single-true cases such as `TFF`, `FTF`, `FFT` so each input independently drives true output.
- For an N-input AND, generate an all-true baseline to get true output, then N single-false cases such as `FTT`, `TFT`, `TTF` so each input independently drives false output.
- MC/DC is not full combinational coverage. Do not generate `2^N` combinations unless the user explicitly asks for truth-table exhaustion; the default obligation is the baseline plus one independent-toggle case per input.
- For nested or chained logical expressions, target the effective logical operator input values. If an upstream NOT feeds the operator, invert the raw stimulus so the operator input receives the intended true/false value.
- For an EdgeRising or EdgeFalling path, use a dedicated ordered sequence: hold the opposite state for one sample interval, trigger the requested edge, observe for one sample interval, then restore the input. Keep unrelated AND inputs true and unrelated OR inputs false while observing the edge.
- For enum/constant equality inputs, resolve the constant value from the loaded MAT/init/data-dictionary/model workspace before writing TCSD. If a logical input compares `ModeInput == TargetMode`, use the resolved value of `TargetMode`, not a guessed Boolean `1`.
- For Boolean scalar calibrations/parameters that feed logical ports directly, create paired parameter mappings. For an AND input, the all-true vector needs `p Cal=1;` and that port's single-false vector needs `p Cal=0;`; for an OR input, the all-false baseline needs `p Cal=0;` and that port's single-true vector needs `p Cal=1;`. If the calibration default is `0`, the generated TCSD still must include the `p Cal=1;` override wherever the true state is required.
- If a calibration participates through a RelationalOperator, resolve the compared threshold/enum first, then choose parameter values on both sides of that exact comparison. Put those values in `true_params` / `false_params`, not in comments.
- When two operator ports share the same root signal, check for impossible MC/DC vectors before drafting cases. Equality banks can make an AND all-true vector unreachable, while OR all-false may require one valid baseline outside all compared constants. Record these outcomes explicitly instead of letting the generator produce contradictory assignments.
- For mode/config signals such as `stMod`, `stMode`, `stCfg`, gear request, or charge mode, scan all relational comparisons that consume the same signal before selecting cases. Generate one case for every model-visible compared value, then add a baseline outside that set only if the value is valid for the model. Do not let one default mode stand in for the whole comparison bank.
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
- `Logical Operator`: log or otherwise prove each operator input port saw the intended truth vector, not just the final output. OR needs all-false and single-true vectors; AND needs all-true and single-false vectors. The generated TCSD workbook must contain the actual root-input assignments and any required `p Param=value;` calibration overrides for each traceable vector; do not rely on a separate report as the coverage artifact.
- `Logical Operator` mapping validator: keep `outputs/<model>_coverage_obligations.json` and `outputs/<model>_mcdc_validation_report.json` with the generated workbook. A failed report means the workbook omitted at least one required vector or left a traceability conflict unresolved; repair the workbook before calling it coverage-ready.
- Filtered or ramp-limited paths: use longer hold time, Initialization, or explicit parameter overrides, then confirm the downstream decision saw the settled value.

## Generic Feedback Patterns

- Start from a complete nominal root-input baseline; an unrelated missing gate can prevent the intended branch from becoming reachable.
- Confirm `MinMax` candidates, switch triggers, selectors and pre-saturation values with focused probes. Upstream stimulus magnitude alone is not proof.
- Split independent mode, diagnostic and state-machine paths into focused Tests so coverage feedback remains attributable.
- Use model metadata to separate scalar and vector ports. Expand vector input assignments in the workbook and backfill only importer-supported outputs.
- For latch, hysteresis, delay, filter and ramp logic, use multi-step actions and measured hold time.
- Reject rows whose `Action` ends on an assignment or `expValue(...)`; append a short final delay such as `[+0.1s]`.


## Automated Logical MC/DC Quality Loop

Use the bundled scripts to reduce repeated manual repair work:

1. Run `trace_logical_mcdc.m` after model load/bootstrap to write structural Logical Operator input traces.
2. Run `derive_logical_mcdc_mappings.py` to convert root inputs, NOT paths, nested AND/OR paths, and symbolic Constant parameters into explicit true/false input and parameter mappings.
3. Build normal obligations with `build_logical_mcdc_obligations.py`.
4. If workbook validation reports missing vectors whose obligations already contain `match.inputs`/`match.params`, run `augment_tcsd_for_mcdc.py` and rebuild the workbook.
5. For unresolved state/timing ports, run `build_state_probe_plan.py`; it searches only the target dependency slice and emits at most 32 candidates per target port. A candidate may contain all ordered action steps required by its evidenced sequence.
6. Run `probe_logical_mcdc_vectors.m` with the explicit state-probe CaseJson. Keep the complete verified `stimulus` sequence in the generated obligation and TCSD supplemental Test.
7. Probe the augmented workbook for actual vectors and Simulink Coverage, then run `build_probe_mcdc_obligations.py` again.
8. Treat unresolved probe vectors as mapping failures unless a reviewer supplies an explicit `unreachable` override with a concrete structural reason. Treat any actual Condition/Decision/MC/DC metric below the target (80% by default) as the trigger for one report-guided repair pass, not as a hard final-delivery failure.

The default mapping gate remains `missing_count = 0` and `unresolved_count = 0`; `unreachable_count > 0` is acceptable only when every item has a specific model/probe reason. The coverage target is Condition/Decision/MC/DC each at least 80%. If the first report misses that target, repair once and then deliver the final measured result while explicitly reporting any metric still below 80%.
