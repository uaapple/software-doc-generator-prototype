# MCDC Feedback Repair

Use this reference when the user wants the generator to use real Simulink Coverage feedback to improve MC/DC after the first TCSD workbook is built.

## Default Scope

Run at most one feedback repair pass unless the user explicitly asks for more. The pass is:

1. Build and validate the first workbook from model-derived obligations.
2. Extract TCSD actions to case JSON.
3. Run the extracted cases with Simulink Coverage metrics enabled for decision, condition, and MCDC.
4. Write `outputs/<model>_mcdc_feedback.json` and, when possible, `outputs/<model>_mcdc_coverage_report.html`.
5. If MCDC is below target, inspect uncovered blocks from the JSON/report and add focused supplemental Tests.
6. Rebuild a versioned workbook such as `outputs/<model>_Test0002_tcsd.xlsx`.
7. Re-run workbook validation and normal simulation/backfill for the repaired workbook.

Do not start an unbounded coverage loop during normal generation. If the first repair still leaves MCDC below target, report the remaining uncovered items as `still_uncovered` or `unreachable_candidate` with the available evidence.

## Coverage Feedback Script

After `extract_tcsd_cases.py` writes the case JSON, call MATLAB through `satk_eval.py` with an entry file like:

```matlab
rootDir = '/path/to/workspace';
addpath('/path/to/skill/scripts');
collect_mcdc_coverage_feedback( ...
    rootDir, ...
    'ModelName', ...
    'ModelName.mat', ...
    fullfile(rootDir, 'outputs', 'ModelName_cases.json'), ...
    fullfile(rootDir, 'outputs', 'ModelName_mcdc_feedback.json'), ...
    'ReportHtml', fullfile(rootDir, 'outputs', 'ModelName_mcdc_coverage_report'));
```

The script uses the same workspace/bootstrap conventions as simulation backfill and writes a JSON payload with:

- `status`: `ok` or `failed`
- `mcdc`, `decision`, `condition`: aggregate metric summaries
- `items`: block-level MCDC gaps where available
- `error_id` / `error_message`: when coverage could not be trusted

If `status != "ok"`, do not claim MCDC feedback was applied. Continue only with the existing static/probe MC/DC gates and report the coverage feedback failure.

## Repair Heuristics

For each uncovered MCDC item:

- Locate the exact block path in SATK/model inspection.
- Identify each condition in the boolean equation and the root input or scalar parameter that controls it.
- Add the minimum baseline-plus-independent-toggle cases needed for MC/DC, not all `2^N` combinations.
- Preserve all Test-row self-contained initialization rules.
- Use `p Param=value;` for scalar calibration states needed to independently toggle a condition.
- Hold filtered, debounced, delayed, or Stateflow-gated paths long enough for the target condition to be evaluated.
- Backfill only top-level Outport expectations after the repaired workbook simulates.

Prefer adding new supplemental Tests over mutating already useful functional Tests. Name the description method `coverage feedback` and include the target block path/outcome.

## Stop Conditions

Stop the feedback repair pass and report partial status when:

- Simulink Coverage is not installed or `cvtest` / `cvsim` / `mcdcinfo` are unavailable.
- The coverage run fails or times out.
- The uncovered item cannot be traced to root inputs or scalar parameters in one bounded inspection pass.
- The missing vector requires contradictory assignments or a literal unmodifiable constant to change.
- A supplemental Test causes invalid selector or compile/simulation errors that cannot be repaired without unsafe assumptions.

In these cases, keep the first validated/backfilled workbook if it is otherwise deliverable, and include the MCDC feedback artifact or error in the summary.
