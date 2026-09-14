# Journey — flow-completeness lens

## Contract metadata

- **ID/version:** `journey` / `1`
- **Covers:** user-flow, interface-states
- **Escalates to:** `flow`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when work creates or changes a multi-step flow, a form, a loading or
async operation, or any state a user can land in other than the designed
happy path. Do not activate solely because a screen has a spinner or an error
boundary in its code — the question is whether that state is reachable,
coherent, and recoverable in practice, not whether handling exists in source.
Do not use Journey to judge whether a control is operable by keyboard or
assistive technology; a control that is invisible to a screen reader but
otherwise part of a complete, recoverable flow is an `access` finding, not a
`journey` one.

## Inputs and missing inputs

Read the approved journey or wireframe (or the current interface when no
separate design artifact exists), the acceptance IDs the journey must satisfy,
and a way to exercise the journey's non-happy states — a runnable
preview/build or recorded interaction evidence for loading, empty, error, and
retry. If there is no way to exercise a state beyond the happy path, return
`needs_input` naming `exercisable_error_or_empty_state`. Never infer that an
error, empty, or retry state is coherent from the presence of a code branch
that appears to handle it — an unexercised branch is not evidence.

## Questions and procedure

1. From the user's entry condition and goal, does every state the journey can
   actually be in (loading, error, empty, success, retry) get reached when the
   corresponding trigger occurs, or does the trigger produce nothing
   observable?
2. When a state is reached, does it render something coherent and specific —
   not just "an error occurred," but content that tells the user what
   happened and what they can do next?
3. After a failure, can the user retry without losing input or progress they
   already supplied? A retry that resets the form or discards prior selections
   is a failure mode of the journey, not a neutral restart.
4. Does the journey's happy-path assumption hold under a realistic non-happy
   input — an empty result set, a slow or failed dependency, a validation
   error, a user who abandons and returns — or does the flow silently break,
   stall, or dead-end?
5. For a multi-step or onboarding flow, does walking it from a genuinely
   first-time/empty state (not a pre-configured one) reach the same
   conclusions as walking it from the happy-path starting point assumed in the
   design?
6. Does every terminal step give the user a specific, visible outcome, so
   success and failure are distinguishable rather than both ending in silence?

The intermediate deliverable is a state map (loading, empty, error, success,
retry) with, for each state, whether it was reached, what rendered, and
whether prior user input survived.

## Evidence and finding taxonomy

Required evidence is a walked-path log for the happy path and at least one
realistic non-happy trigger, captured from a working preview or recorded
interaction — not inferred from source. Finding categories are unreachable
state, incoherent or generic state content, input lost on retry, silent
completion (success or failure with no visible confirmation), and
happy-path-only validation. Severity follows the shared finding contract,
weighted by whether the gap blocks completion or only degrades clarity.

## Non-decisions and escalation

Journey does not decide whether a control is keyboard- or
screen-reader-operable, does not set product priority or scope, and does not
own component implementation. Escalate to Flow when a missing or broken state
blocks completion of the journey itself (no error path exists at all, a retry
permanently traps the user) or when the correct recovery behavior for an
ambiguous failure mode is not established. Return the request to Forge; do not
dispatch Flow.

## Stop conditions

Stop once the happy path and at least one realistic non-happy path have been
walked to a terminal state with current evidence, or the missing-input
condition is recorded. Stop immediately on no exercisable non-happy state,
stale walked-path evidence, forbidden access, or satisfied coverage. Do not
report a state as broken because its code path looks fragile if it was
actually walked and rendered coherently.

## Examples

### Valid worked example

For `AC-search-empty-state`, the search results screen is walked with a query
that returns zero results. Nothing renders — no empty-state message, no
suggestion, just a blank list where results would be — while the loading
spinner from the previous state remains visible indefinitely. Journey cites
the walked-path log and emits:

```json
{
  "schema": 2,
  "id": "finding:<computed>",
  "lens": "journey",
  "severity": "high",
  "criterion": "AC-search-empty-state",
  "invariant": "every reachable journey state renders coherent, terminal content for the user",
  "evidence_ids": ["observed:walked-path-search-zero-results"],
  "affected_behavior": "a zero-result search leaves the stale loading spinner on screen with no empty-state message or next action",
  "smallest_repair": "render an explicit empty-state message and clear the loading indicator when the result count is zero",
  "verification": "repeat the walked path with a zero-result query and confirm the spinner clears and an empty-state message appears",
  "status": "open"
}
```

### Misleading example

"The empty-state component exists in the codebase, so the zero-result case is
handled" is rejected because the presence of a component or branch in source
is not evidence it is reached or renders correctly — only walking the actual
trigger (a query that returns zero results) shows what the user sees.

### Missing-input example

Without a runnable build or recorded interaction to force the payment-retry
flow's failure state, Journey cannot walk whether prior input survives a
failed submission. It returns `needs_input`, names
`exercisable_error_or_empty_state` as the missing input, and does not assume
the retry preserves the user's entered data because the happy path alone was
available.
