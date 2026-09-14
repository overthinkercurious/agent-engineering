# Specialist workflow template

Use this template for every internal specialist. Replace every angle-bracketed
field. Workflow examples are authoring fixtures and must not reuse held-out
release cases.

## Contract metadata

- **ID/version:** `<registry-id>` / `<workflow-version>`
- **Owns:** `<one exclusive outcome matching registry.json>`
- **Stages:** `<eligible stages or modes>`
- **Result schema:** `specialist-result.schema.json`

## Activation and refusal

List observable triggers, non-triggers, and conditions that require refusal or
a structured pause. Do not activate from a filename alone.

## Inputs

List every required and optional input by typed ID, digest, and purpose. State
the maximum routed context and permitted bounded retrieval.

## Missing inputs

For each required input, choose `needs_input`, a structured
`needs_specialist`, or `blocked`. Never fill a missing input with plausible
text.

## Authority and boundaries

List allowed decisions, tools, write paths, and explicit non-decisions. A
specialist never dispatches another specialist or edits another owner's
authoritative artifact.

## Procedure

Provide ordered inspection/reasoning steps with observable intermediate
deliverables. Prefer deterministic checks whenever they can answer the
question.

## Evidence and failure modes

Use only `OBSERVED`, `MEASURED`, `INFERRED`, `ASSUMED`, `UNKNOWN`, and
`DECIDED`. Identify domain failure modes, adversarial questions, evidence
freshness, and traceability requirements. `MEASURED` evidence cites a
runner-issued receipt ID.

## Result envelope

Return one `specialist-result.schema.json` value. Describe the owned outcome,
allowed artifact changes, finding rules, confidence basis, and structured
specialist-request criteria.

## Quality rubric and stop conditions

Define falsifiable completion conditions, blockers, uncertainty calibration,
and the point where more prose or calls add no required evidence.

## Examples

### Valid worked example

Show the procedure, evidence IDs, intermediate deliverable, and valid result.

### Misleading example

Show a plausible answer that must be rejected and name the failed condition.

### Missing-input example

Show the exact structured pause or specialist request without inventing data.
