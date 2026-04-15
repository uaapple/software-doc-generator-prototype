# Skill Profile Schema

## Purpose

This document explains the current skill profile structure used by the project, including:

- profile layers
- manifest layout
- merge behavior
- field definitions in `domain-knowledge.json`
- recommended ownership for each layer

Primary implementation references:

- `skills/active/skill-manifest.json`
- `src/services/skill-loader.js`

## Layer Model

The current skill system uses four layers:

1. `generic`
Shared rules that apply to every document type and every module.

2. `docType`
Rules specific to one artifact type, such as:

- `software_requirement`
- `detail_design`
- `hil_test_case`

3. `domain`
Rules shared by a larger business domain, such as:

- `embedded_vcu`

4. `module`
Rules specific to one functional module, such as:

- `torque_intervention`
- `charging_management`

Resolution order is fixed:

`generic -> docType -> domain -> module`

This means later layers are more specific and can refine earlier layers.

## What the Manifest Defines

The manifest file does not store the rule content itself. It defines:

- which profiles exist
- which files belong to each profile
- which resolution order the loader should use

Each profile can contribute:

- markdown rule files
- one or more `domain-knowledge.json` files

## How the Loader Merges Content

### Markdown

Markdown files are concatenated in layer order.

That lets the system:

- start from general guidance
- add document-type-specific constraints
- add domain conventions
- finally add module-specific rules

### Structured Knowledge

Structured knowledge is merged by `mergeKnowledge()` in `src/services/skill-loader.js`.

Current merge behavior:

- normal scalar fields: later layer overrides earlier layer
- `examples`: append
- `ruleHints`: append
- `antiPatterns`: append
- `sourceOfTruthPolicy`: merge by subfield

Special merge behavior inside `sourceOfTruthPolicy`:

- `codeStylePrefixes`: deduplicated append
- `canonicalSignalAliases`: append
- `normalizationRules`: append
- `forbiddenExpansions`: object merge

## domain-knowledge.json Field Definitions

### `version`

Knowledge file version.

Use it when:

- tracking structure upgrades
- debugging which profile content is active

### `sourceOfTruthPolicy`

A boundary and normalization policy for factual output.

It defines:

- what should be treated as the canonical expression
- which code-style names should not dominate the final text
- how aliases map back to canonical signal names
- which expansions are forbidden
- which wording patterns should be normalized

Typical subfields:

#### `standard`
Reference standard, for example `ISO 26262`.

#### `singleSourceOfTruth`
Signals that generation should stay grounded in approved inputs, examples, and rules.

#### `forbidCodeStyleSignals`
Marks whether implementation-style variable names should be prevented from dominating final prose.

#### `codeStylePrefixes`
Known implementation naming prefixes such as `icesc_` or `icadas_`.

#### `canonicalSignalAliases`
Mapping from canonical names to code aliases.

Example:

```json
{
  "canonical": "ESC_TqDecReqAct_F",
  "aliases": ["icesc_bFrntAxleTqDecActv"]
}
```

#### `forbiddenExpansions`
Restrictions on what the model must not invent for a given requirement type.

Example:

```json
{
  "activation_flag_logic": ["CCO", "ISA"],
  "torque_calculation_logic": ["ABS", "EBD", "CCO", "ISA"]
}
```

#### `normalizationRules`
Pattern-level wording normalization.

Example:

```json
{
  "pattern": "AEB/CDP/ABS/EBD????",
  "replacement": "AEB?CDP????"
}
```

### `examples`

Structured few-shot examples.

These teach the system what a good output looks like for a specific module.

Typical fields:

- `requirementId`
- `topic`
- `sectionNumber`
- `sectionTitle`
- `requirementType`
- `preferredTitle`
- `requirementText`
- `signals`
- `references`
- `canonicalBranches`
- `keywords`

Field intent:

- `requirementId`: source traceability label
- `topic`: semantic topic summary
- `sectionTitle`: where the example belongs in document structure
- `requirementType`: what kind of item it is
- `preferredTitle`: preferred title pattern
- `requirementText`: the most important body example
- `signals`: signal and variable hints
- `references`: linked requirements or dependencies
- `canonicalBranches`: branches the model should not forget
- `keywords`: retrieval hints

### `ruleHints`

High-level writing guidance.

These do not provide a full example body. They provide compressed instructions such as:

- preferred section structure
- writing order
- target writing style
- source basis

Typical fields:

- `domain`
- `subdomain`
- `sectionHints`
- `writingPattern`
- `targetStyle`
- `sourceBasis`

### `antiPatterns`

A blacklist of mistakes the model should avoid.

Examples:

- dropping one side of a symmetric object pair
- omitting priority order
- merging control logic and memory logic into one item
- promoting supplement logic into a core output item too early

### `generationPriorities`

An ordered list of generation priorities.

This field answers:

- what should be generated first
- what must remain core
- what must not take priority over core topics

It is especially useful for:

- core topic selection
- topic ordering
- preventing over-expansion

### `documentBlueprint`

A target document skeleton for a module.

This is most useful when a module has a stable, repeated human-authored structure.

Typical content includes:

- `preferredFunctionSection`
- `preferredSubsections`
- `targetOutputPolicy`

Use `documentBlueprint` when the module needs:

- stable section layout
- symmetric object decomposition
- fixed core requirement categories

## What Should Live in Each Layer

### `generic`

Good fit:

- global `generationPriorities`
- cross-module `antiPatterns`
- universal writing hints
- sample-alignment rules

Avoid putting here:

- module-only signal sets
- one module's document skeleton

### `docType`

Good fit:

- rules unique to one artifact type
- document-type validation rules
- document-type-specific few-shot examples

Examples:

- detail design should preserve states, interfaces, and internal variables
- HIL test cases should include preconditions, stimulus, expected result, and acceptance criteria

### `domain`

Good fit:

- domain-wide `sourceOfTruthPolicy`
- naming conventions
- wording normalization shared by several modules

### `module`

Good fit:

- module-specific `examples`
- module-specific `documentBlueprint`
- module-specific `ruleHints`
- module-specific `antiPatterns`
- module-specific `generationPriorities`

## Current Project Examples

- generic knowledge:
  - `skills/active/profiles/generic/domain-knowledge.json`
- domain knowledge:
  - `skills/active/profiles/domains/embedded_vcu/domain-knowledge.json`
- torque module knowledge:
  - `skills/active/profiles/modules/torque_intervention/domain-knowledge.json`
- charging module knowledge:
  - `skills/active/profiles/modules/charging_management/domain-knowledge.json`

## Recommended Principles

1. Push shared rules upward and sink specialized rules downward.
2. Keep module examples close to the module profile.
3. Prefer duplication over loss for high-value constraints.
4. Use `sourceOfTruthPolicy` mainly for normalization and boundary control.
5. Use `documentBlueprint` only when a stable skeleton truly exists.

## Next Step Suggestions

To make this structure more maintainable, add:

- a formal JSON schema for profile knowledge files
- required vs optional field documentation
- explicit validation for `documentBlueprint`
- enum validation for `examples.requirementType`
- path validation for `ruleHints.sourceBasis`
