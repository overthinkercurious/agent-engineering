# Lens workflow template

Use this template for every internal lens. A lens is a method constraint, not
an artifact owner or automatic extra model call.

## Contract metadata

- **ID/version:** `<registry-id>` / `<workflow-version>`
- **Covers:** `<one narrow coverage set matching registry.json>`
- **Escalates to:** `<one registered specialist>`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

List behavior/risk triggers and explicit non-triggers. A filename is a lead,
not proof that the lens is required.

## Inputs and missing inputs

List typed evidence references and the bounded response when essential input is
missing. Never infer the contents of an omitted artifact.

## Questions and procedure

State the narrow questions in execution order and identify deterministic checks
or intermediate observations.

## Evidence and finding taxonomy

Define required evidence, freshness, finding categories, and severity guidance.
Findings use canonical IDs and cite validated evidence IDs.

## Non-decisions and escalation

State what the lens cannot decide. Give one threshold for escalation to the
registered specialist; the lens never invokes that specialist itself.

## Stop conditions

Stop when the narrow questions are answered with current evidence or when the
missing-input/escalation condition is recorded. Do not produce forced findings.

## Examples

### Valid worked example

Show a reproducible observation and a schema-valid finding or explicit no-find.

### Misleading example

Show a plausible but unsupported conclusion and why it is rejected.

### Missing-input example

Show the bounded missing-evidence result and escalation target.
