# Module Hierarchy and Narrative Boundary

Use this contract before module selection, evidence queue construction, drafting, and DOCX validation.

## Two Different Units

- `document_unit`: a subsystem that receives one `3.x` section in the final document.
- `analysis_unit`: a child subsystem read to understand its parent document unit. It may have its own evidence artifact or ledger fragment, but it does not receive a `3.x` section by default.

Never derive final headings directly from the deep-read queue.

## Hierarchy Selection

1. Resolve the functional root past same-name wrappers, scheduler shells, model-info areas, and final routing containers.
2. Detect an `A\d+_`/`B\d+_`/`C\d+_` hierarchy from sibling names and parent paths.
3. When functional A-level subsystems exist, select them as `document_unit` by default.
4. Treat B/C descendants as `analysis_unit` and attach them to the nearest A-level document unit.
5. Promote a B/C child only when:
   - the user explicitly requests that hierarchy level; or
   - evidence proves the A parent owns no functional behavior and is only routing, documentation, or configuration.
6. Record the promotion reason and supporting evidence. A name regex alone is never sufficient.
7. When no A/B/C convention exists, select functional first-level subsystems under the resolved functional root.

Fail hierarchy selection when every proposed document unit is B/C-level while functional A parents exist and no promotion evidence is recorded.

## Required Hierarchy Manifest

Create a task-local JSON manifest before deep reading:

```json
{
  "allModelIdentifiers": [
    "A01_Function",
    "A01_Input1",
    "A01_Output1",
    "B01_Calculation",
    "internal_state"
  ],
  "documentUnits": [
    {
      "path": "Model/A01_Function",
      "name": "A01_Function",
      "hierarchyTier": "A",
      "selectionReason": "functional A-level subsystem",
      "allowedInputs": ["A01_Input1"],
      "allowedOutputs": ["A01_Output1"],
      "approvedPublicIdentifiers": []
    }
  ],
  "analysisUnits": [
    {
      "path": "Model/A01_Function/B01_Calculation",
      "parentDocumentUnit": "Model/A01_Function"
    }
  ]
}
```

`allowedInputs` and `allowedOutputs` must come from direct Inport and Outport blocks of the document unit, not from descendants. `allModelIdentifiers` must contain every exact model-authored identifier collected during evidence extraction, including document units, analysis units, direct ports, internal signals, parameters, tables, enums, tags, and states. The validator uses this closed vocabulary to distinguish model identifiers from ordinary English prose without guessing from spelling.

Allowlists are evaluated per document unit and do not imply exclusive global ownership. Cross-A connections are normal: when an A02 direct Outport feeds an A01 direct Inport, the signal may appear in both units' allowlists and is valid in both sections. If the connected ports use different names, the A01 section uses the A01 direct Inport name; the A02-side alias is not valid in A01 merely because it is connected upstream. The model-level architecture section may separately describe the A02-to-A01 connection.

## Narrative Boundary

The default final prose is a black-box description of each document unit:

- conditions and source values may name direct document-unit inputs;
- actions and results may name direct document-unit outputs;
- the document-unit name may appear in its heading and purpose text;
- any other model identifier is private unless listed in `approvedPublicIdentifiers` by explicit user request.

The following stay in private evidence by default:

- B/C subsystem names and their ports;
- internal named lines, Goto/From tags, Data Stores, bus elements, and copied signals;
- internal `Rem`, `Rstr`, `Restore`, `Old`, `Pre`, `Last`, `Mem`, `Save`, or `EEW` states;
- internal PI states/results, lookup outputs, comparator results, latch states, and feedback signals;
- calibration names, table names, enum identifiers, and constants that are not direct boundary inputs.

Deep-read these items when they affect a boundary output, but set `visibility=internal_evidence` and `must_mention=no`. Map each internal row to an affected direct output.

## Boundary Projection

Project private behavior onto the boundary before drafting:

```text
private: internal_state updates from boundary_input_A and later selects boundary_output_Y
public:  boundary_output_Y is updated or restored in response to boundary_input_A
```

Continue tracing an internal condition until its controlling direct input is known. If no direct-input expression can be resolved:

- keep the exact internal fact in the private ledger;
- describe only the supported boundary behavior;
- do not expose the internal identifier;
- do not invent a Chinese condition, threshold, mode, or value meaning.

This boundary rule takes precedence over exact-identifier traceability in polished prose. Exact internal identifiers remain available in evidence artifacts.

## Ledger Visibility

Every ledger row must include:

- `visibility`: `document_boundary` or `internal_evidence`;
- `affected_boundary_output`;
- `behavior_group`;
- `must_mention`.

Apply:

```text
must_mention=yes only when visibility=document_boundary
```

An internal `material_state` can be behaviorally important without being narratively visible.

## Structural and Identifier Gates

Before DOCX generation and again on extracted DOCX text, verify:

1. Heading 2 module names exactly match `documentUnits`.
2. Analysis-unit names are not Heading 2 modules.
3. Every direct output appears in its document-unit section unless explicitly classified as pure routing and covered by another boundary output.
4. Every model identifier in a module section belongs to that unit's `allowedInputs`, `allowedOutputs`, or `approvedPublicIdentifiers`.
   The same identifier may belong to more than one unit's allowlist when it crosses A-level boundaries; this is valid and must not be reported as a foreign-module leak.
5. Every internal ledger row maps to an affected boundary-output group.
6. No internal identifier is repaired with an inferred Chinese label.

Use `scripts/validate_narrative_boundary.py` for identifier and heading checks. Treat any leak as a failed document, not a warning.
