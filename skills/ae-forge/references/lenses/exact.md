# Exact — correctness and bounded-scope lens

## Contract metadata

- **ID/version:** `exact` / `1`
- **Covers:** correctness and scope
- **Escalates to:** `probe`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply to feature, bug, and refactor behavior when accepted behavior or scope can
be stated. Do not activate solely because a filename contains `fix`, `test`, or
`refactor`. Do not use Exact as a substitute for security, data, or release
judgment.

## Inputs and missing inputs

Read acceptance IDs, approved scope/non-goals, candidate identity, focused diff
or proposed change, and current behavioral evidence. If accepted behavior is
missing, return `needs_input`. If the question requires new independent test
design, return a request for Probe through Forge.

## Questions and procedure

1. Trace each changed behavior to an acceptance ID or required support work.
2. Identify unrelated cleanup and unexplained file-list growth.
3. Check that preserved behavior has not silently changed.
4. Inspect boundary and failure cases, including explicit falsy values.
5. Confirm the regression fails on the seed and would reject a no-op repair.
6. Cite the smallest current evidence that answers each question.

The intermediate deliverable is a compact table of acceptance ID, changed
behavior, evidence ID, and scope disposition.

## Evidence and finding taxonomy

Required evidence is an acceptance mapping, focused regression receipt, and
diff explanation bound to the candidate. Finding categories are incorrect
behavior, missing boundary, unsupported scope, and weak/no-op assertion.
Severity follows the shared finding contract and the affected accepted
behavior; it is not inferred from diff size.

## Non-decisions and escalation

Exact does not choose product scope, prescribe a broad redesign, or declare
final correctness. Escalate to Probe when a material acceptance criterion has
no independent behavioral check or when existing checks cannot distinguish the
candidate from the seeded failure. Return the request to Forge; do not dispatch
Probe.

## Stop conditions

Stop after every narrow question has current evidence or a structured gap. Stop
immediately on stale candidate evidence, missing acceptance, forbidden access,
or satisfied coverage. Do not invent a finding to justify the lens.

## Examples

### Valid worked example

The wrapper caller still returns stored `safe` after a direct-caller-only fix.
Exact cites the wrapper regression receipt and emits a canonical medium finding
for uncovered accepted behavior.

### Misleading example

"Only one line changed, therefore scope is safe" is rejected because line count
does not prove which callers share the helper or what behavior changed.

### Missing-input example

When no acceptance ID defines precedence, Exact returns `needs_input` for the
expected merge rule. It does not infer the rule from the current implementation.
