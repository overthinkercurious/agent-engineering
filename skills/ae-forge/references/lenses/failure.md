# Failure — dependency failure-mode lens

## Contract metadata

- **ID/version:** `failure` / `1`
- **Covers:** failure-modes and degradation
- **Escalates to:** `signal`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when the candidate calls or is called through an external dependency,
another service, a queue, or a third-party integration, and a failure or
slowness of that dependency is reachable from the change. Registry triggers
are `external`, `integration`, `critical`. Do not activate solely because a
file imports an HTTP client or SDK; confirm the candidate's own code path
actually invokes the dependency on a route reachable by the change. Do not use
Failure to judge whether the candidate's own code is fast enough (that is
Speed) or whether a failure would be visible to an operator (that is Observe)
or whether a bad release of this change can be undone (that is Recover) — a
dependency call can be perfectly observable and instantly revertible and still
fail this lens because it amplifies load onto a struggling dependency.

## Inputs and missing inputs

Read the dependency/call map for the affected path, the candidate diff or
implementation summary, and current retry/timeout/circuit-breaker
configuration for the call. If the dependency the change calls is not
identified, return `needs_input` naming `dependency_call_map`. If retry
behavior exists but its bounds (max attempts, backoff, jitter) cannot be read
from the candidate or its shared helper, return `needs_input` naming
`retry_configuration` rather than inferring "probably bounded" from the
presence of a retry library.

## Questions and procedure

1. Identify every dependency the changed code calls, directly or through a
   shared helper, on the path exercised by the change.
2. For each dependency, enumerate timeout, slow-but-not-timed-out, connection
   refusal, and partial/malformed response as separate cases — not one
   generic "failure" case.
3. For each case, trace what the caller does: fixed retry, backoff with
   jitter, circuit breaker, queue redelivery, or nothing.
4. Determine whether concurrent callers on the same path amplify load onto
   the degraded dependency (thundering herd) or shed it (breaker opens,
   requests fail fast).
5. Check whether a non-critical dependency's failure is isolated from
   otherwise-available behavior, or whether it takes down an unrelated path
   that does not need it.
6. Cite the smallest current evidence — an injected-failure receipt or the
   retry/backoff code itself — that answers each case; do not accept a code
   comment or docstring claiming graceful degradation as evidence.

The intermediate deliverable is a table of dependency, failure case, caller
response, amplifies-or-sheds, and evidence ID.

## Evidence and finding taxonomy

Required evidence is an injected or observed failure/slowness response for
the dependency and the caller's measured or inspected reaction to it. A
narrative of how the code "should" behave under failure is `INFERRED`, never
`MEASURED`. Finding categories are unbounded retry, missing backoff/jitter,
missing circuit breaker, unnecessary coupling of unrelated behavior to a
failing dependency, and retry-storm amplification. Severity follows the
shared finding contract; a critical-path dependency with no bound on retries
is `critical` regardless of how rare the failure is expected to be.

## Non-decisions and escalation

Failure does not decide the required latency budget, define metrics or
alerts, or authorize a rollback plan — those are Speed's, Observe's, and
Recover's slices of the same review, owned end to end by Signal. Escalate to
Signal when the failure-mode table is complete and needs to be combined with
idempotency, blast-radius, and rollback judgment into one reliability
conclusion, or when a finding needs a required backoff/circuit-breaker
mechanism specified. Return the request to Forge; do not dispatch Signal.

## Stop conditions

Stop once every dependency reachable from the change has a stated case table
with cited evidence or a recorded gap. Stop immediately on an unidentified
dependency, missing retry configuration, forbidden access, or when the
candidate makes no outbound call reachable from the change (no findings to
force).

## Examples

### Valid worked example

A notification-send path calls a third-party email API with a fixed 3-attempt
retry on any non-2xx response, no backoff, and no jitter, shared across all
concurrent senders. Failure cites the retry helper source
(`observed:notify-retry-loop`) and an injected 503 response
(`receipt:notify-503-fault`) showing all three attempts fire within 200ms of
each other. It emits:

```json
{
  "schema": 2,
  "id": "finding:PLACEHOLDER",
  "lens": "failure",
  "severity": "high",
  "criterion": "dependency failure must not amplify load during degradation",
  "invariant": "retries against a degraded dependency use backoff and jitter, not a fixed fast interval",
  "evidence_ids": ["observed:notify-retry-loop", "receipt:notify-503-fault"],
  "affected_behavior": "notification send retry loop",
  "smallest_repair": "add exponential backoff with jitter and a max-attempt cap to the notify retry helper",
  "verification": "re-run the 503 fault injection and confirm retry spacing grows and total attempts stay bounded",
  "status": "open"
}
```

(`id` is computed by `findingId()` from the normalized criterion, invariant,
affected_behavior, and evidence_ids — never hand-typed.)

### Misleading example

"The client library retries automatically, so it degrades gracefully" is
rejected: an automatic retry with no backoff is exactly the mechanism that
turns a slow dependency into amplified concurrent load, and "the library
handles it" is not evidence about that library's specific retry policy on
this path.

### Missing-input example

Given a change that adds a call to a new internal service with no documented
retry or timeout configuration, Failure returns `needs_input` naming
`retry_configuration`, records no case-table row for that dependency, and
asks Forge to resume once the timeout/retry settings are supplied rather than
assuming a sane default.
