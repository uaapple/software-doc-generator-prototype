---
name: tcsd-stage-10-repair-coverage
metadata:
  version: "1.6.0"
description: Analyze measured Condition, Decision, and MC/DC deficits, inspect only each target block's local upstream model slice, propose focused temporal TCSD cases, and submit them to deterministic host validation for the single bounded stage-10 repair pass. Use only when a tcsd_stage_execute prompt explicitly requests stage 10 with a tcsd-agent-stage-input/v1 manifest.
---

# Repair Coverage Cases

Execute only stage 10 from the manifest named in the prompt.
Both prompt commands invoke the shared `tcsd-runtime/scripts/run_tcsd_pipeline_stage.py`; do not substitute another runner.

1. Require `stageIndex=10`. Inspect any host validation report before the initial manifest.
2. Run the exact **prepare command** from the prompt. Read the generated `tcsd-coverage-repair-brief/v1`.
3. If `repairRequired=false`, run the exact apply command without inventing a proposal; the runtime will emit the skipped result.
4. For every below-threshold metric, start from the brief's measured block path, SID, missing outcome, description, logical trace, and Coverage IR. Prefer the matching `complexTargetGuidance` entry: it already summarizes controlling root inputs, resolved thresholds, state or delay elements, and structurally similar blocks. If the report exposes only a model-level deficit, use MATLAB/SATK to locate the exact uncovered block before proposing a case.
5. Inspect only the target block's local upstream dependency slice. Identify:
   - controlling root inputs;
   - scalar parameters and their initialization values;
   - Switch, Relational Operator, MinMax, Delay, Memory, Unit Delay, or state prerequisites;
   - required transition order, hold time, and threshold crossing;
   - unrelated gates that must remain sensitized.
   Reuse the timing skeleton of a structurally similar block only when its root-input mapping is explicit. Compute long waits from resolved delays, thresholds, increments, and sample time instead of rescanning the entire model or guessing a short hold.
6. Do not enumerate all root-input combinations or rerun whole-model truth tables. Design at most 16 focused candidates. A candidate may contain as many ordered **TCSD action steps** as its evidenced state or timing sequence requires.
   - `stimulus.steps` counts TCSD action entries; it does not count Simulink solver steps, sample hits, counter increments, or Unit Delay updates that occur during one `delay_s`.
   - A hold spanning thousands of sample periods is still one TCSD action step. When the local slice proves a fixed-rate counter/timer must cross a threshold, compute the required hold duration and encode it as one positive `delay_s`.
   - Never report `state_sequence_not_constructible` because a sequence needs more than eight action steps; no per-test action-step count limit exists.
7. Write `tcsd-agent-coverage-repair-proposal/v1` to the exact proposal path from the prompt. Each candidate must contain:
   - `id`, `coverage_class`, exact `block.path` and `block.sid`;
   - `required_outcome`，当简报提供 `missing_outcomes` 时必须原样选择其中一项；
   - `controller.direct_inputs` and `controller.parameters`;
   - full `stimulus.initial_inputs`, `stimulus.initial_params`, ordered positive-delay `steps`, and `evidence_step`;
   - `analysis.upstream_slice` and a concise evidence-based `analysis.rationale`.
8. Put parameters only in initialization. Every step may contain only `delay_s`, root `input_updates`, and an empty `param_updates`.
9. When no executable candidate can be constructed, populate `unresolved` with the exact block/SID, evidence, and one specific reason:
   - `logic_unreachable`;
   - `missing_parameter_control`;
   - `state_sequence_not_constructible`;
   - `probe_target_unobservable`;
   - `unsupported_model_semantics`.
   Never use a generic “no candidate” reason and never mark an item unreachable without structural or simulation evidence.
   `state_sequence_not_constructible` requires a structural obstacle such as an uncontrollable reset, an unavailable transition, or a bounded action sequence that cannot preserve the required state. A large but finite number of sample periods is not such an obstacle when it can be represented by one justified wait.
10. Run the exact **apply command**. The deterministic runtime owns schema validation, root-input checks, parameter placement, ordered-step checks, deduplication, workbook conversion, candidate simulation, `expValue` backfill, and the authoritative result file.
11. The host evaluates MC/DC in the explicit mode recorded by `coverageContext.mcdcMode`; the stage-9 baseline and candidate measurement must use the same model checksum and support-library context. A runnable candidate is not accepted merely because its outputs were backfilled. The full candidate suite is measured once and compared with the stage-9 baseline. When the proposal contains MC/DC targets, the suite passes only when it adds a declared target independent-effect pair or increases the authoritative model-wide MC/DC covered count. The second rule preserves a real contribution that occurs at a different measured block from the Agent's declared target; a zero-gain suite still fails validation.
12. On a validation retry, read `tcsd-mcdc-coverage-delta/v1`. Repair only targets whose `reasonCode` is one of:
    - `target_condition_not_toggled`;
    - `decision_not_toggled`;
    - `other_conditions_not_held`;
    - `effect_masked`;
    - `complementary_vector_missing`.
    Do not resubmit an unchanged stimulus. Targets marked `independent_effect_pair_added` or `already_covered_before_candidate_suite` require no replacement.
    When `acceptanceReason=suite_added_global_mcdc_coverage`, the suite already produced a measured MC/DC gain and must not be rejected only because the declared target stayed unchanged.
13. Never edit the existing workbook directly, never write the host checkpoint, and never claim coverage closure from rationale alone. Stage 11 performs the final measured simulation and coverage collection.

The host may retry deterministic validation in a fresh session. Re-read the repair brief and validation report, repair only the reported defect, and keep the total coverage repair pass bounded to one.
