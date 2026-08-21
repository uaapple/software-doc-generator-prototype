# A07 Behavior-Density Pattern

Use this reference before drafting every module. It defines prose density and layout only; "A07" does not select the Simulink A/B/C hierarchy level. Select document units with `module-boundary.md` first.

## Target Shape

- Write one short `功能描述` paragraph, normally 1-3 sentences.
- Organize `实现方式` by observable behavior groups rather than ledger rows, internal blocks, or individual comparators.
- Target 4-8 behavior groups per module.
- Give each group an introductory sentence naming a direct document-unit output and its role.
- Use 2-5 level-one sub-points for the complete condition/action branches in that group.
- Target about 12-30 sub-points per module. Exceptionally complex modules may use up to 10 groups or 40 sub-points only after regrouping shared and symmetric behavior.
- Leave a visible paragraph break between groups.

The limits are density gates, not reasons to omit behavior. If the evidence does not fit, first combine conditions with the same action, deduplicate shared cones, collapse symmetric families, and remove mechanical post-processing from prose.

## Two-Layer Coverage

Keep the private evidence ledger exhaustive. Before prose, classify rows:

- `primary_output`: direct document-unit output; exact name must appear.
- `material_state`: named state with a unique hold/update/restore role affecting a primary output; keep its exact name private unless it is itself a direct document-unit port.
- `supporting_state`: internal state whose behavior is already represented by the owning group; map it privately without a separate prose group.
- `mechanical_postprocess`: conversion, copy, simple comparison, anonymous Boolean intermediate, or final routing; map it privately and omit implementation detail.
- `symmetric_family`: homologous outputs with the same condition/action structure; describe once and state exact differences.
- `pure_routing`: exclude from prose after confirming the carried behavior is covered.

Every ledger row must map to a direct boundary-output behavior group or documented routing exclusion. Narrative completeness means every boundary-visible behavior is covered without leaking internal identifiers.

## Behavior-Group Selection

Create a new group only when at least one of these changes:

- affected primary output
- state update/hold/restore contract
- branch priority or fallback
- mode entry/exit behavior
- lookup, limit, delay, hysteresis, or rate behavior that materially changes the output

Do not create a new group only because another Switch, comparator, Unit Delay, copied signal, or named supporting line exists.

Combine conditions that cause the same action:

```text
• 置位：`<cond1>` 有效，或 `<cond2>` 与 `<cond3>` 同时有效。
```

Do not split that sentence into one bullet for each comparator or intermediate Boolean result.

## Clean Boundary-Visible Example

The following shape is valid only when every shown identifier belongs to the selected document unit's allowlist. It is a compact behavioral example, not a source of model evidence.

```text
`<A_output_enable>` 根据 A 层级输入完成使能判定：
• `<A_input_power_valid>` 有效且 `<A_input_inhibit>` 无效时置为有效。
• `<A_input_power_valid>` 无效或 `<A_input_inhibit>` 有效时置为无效。

`<A_output_mode>` 根据请求和允许状态选择工作模式：
• `<A_input_request>` 有效且 `<A_input_mode_allowed>` 有效时选择请求模式。
• 请求无效或模式不允许时选择默认模式。

`<A_output_request>` 根据使能条件决定请求传递方式：
• `<A_input_enable>` 有效时输出 `<A_input_request>` 对应的请求。
• `<A_input_enable>` 无效时保持上一周期的 `<A_output_request>`。

`<A_output_fault>` 汇总 A 层级可见的故障条件：
• `<A_input_sensor_valid>` 无效时置为有效。
• `<A_input_sensor_valid>` 恢复且 `<A_input_fault_reset>` 有效时清除。
```

Angle-bracketed names above stand for direct A-level ports. Keep this shape, but replace them only with allowlisted boundary identifiers and derive every condition from the current model.

## Symmetric Families

When Profile1/Profile2/Profile3, left/right, front/rear, or raw/final outputs share one structure:

- describe the common update/hold/select behavior once;
- list all primary output names in the introductory sentence when needed;
- use separate sub-points only for side/profile-specific allowlisted boundary conditions, outputs, literal behavior, or fallback values;
- do not repeat the complete shared branch tree for each family member.

## Compact Anti-Pattern Checklist

Do not embed a large failed document as an example. Reject the following symptoms instead:

- one bullet per comparator, Boolean operator, delay block, or ledger event;
- anonymous phrases such as "组合判定结果" or "下一优先级选择结果";
- repeated "最终输出 `<signal>`" after every supporting row;
- separate full groups for symmetric outputs with identical behavior;
- prose that prints every ledger signal name even when several names carry one behavior;
- more than 8 groups or 30 sub-points without a regrouping pass;
- three or more consecutive bullets with the same sentence template but different signal suffixes.

## Final Density Check

Before DOCX generation, confirm:

1. Every `must_mention` direct input/output appears by exact name, and no internal `material_state` name appears.
2. Every ledger row maps to a behavior group or routing exclusion.
3. Every group contains observable condition/action behavior.
4. Shared conditions with the same action are combined.
5. Symmetric families are not mechanically repeated.
6. Internal block names, routing names, evidence metadata, and process disclaimers are absent.
7. The section is behavior-complete at the document boundary, allowlist-compliant, and compact.
