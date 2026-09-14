# Observe — operator-visibility lens

## Contract metadata

- **ID/version:** `observe` / `1`
- **Covers:** observability
- **Escalates to:** `signal`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when the candidate changes a service boundary, touches an external
call, or is on a critical path where a failure or anomaly must be caught by a
human rather than a customer. Registry triggers are `service`, `external`,
`critical`. Do not activate solely because a diff adds a log line; confirm
whether the change alters what would be visible when the behavior in scope
goes wrong. Observe judges detectability only — whether a metric, log, or
alert would catch the failure and route it to someone. It does not decide
whether the dependency behind the failure degrades safely (Failure), whether
the operation is fast enough (Speed), or whether the change can be rolled
back once detected (Recover); an incident can be perfectly recoverable and
still fail this lens because nothing would ever page anyone about it.

## Inputs and missing inputs

Read the existing metric/log/alert inventory for the affected path, the
candidate diff, and the failure or anomaly modes in scope for this review
(as identified by Failure/Speed findings on the same candidate, or by direct
inspection when those are unavailable). If no observability inventory exists
for the path and the candidate is not the one introducing it, return
`needs_input` naming `existing_observability_coverage`. If the failure modes
in scope are not identified, return `needs_input` naming
`failure_modes_in_scope` — Observe cannot judge detectability of a failure it
has not been told to look for.

## Questions and procedure

1. For each failure or anomaly mode in scope, name the signal (metric, log
   line, trace span, or alert) that would distinguish healthy from degraded
   from failed behavior.
2. Check whether the candidate diff removes, renames, downgrades, or
   silently changes the meaning of an existing metric/log/alert that
   currently covers a failure mode in scope — this is a distinct finding from
   simply lacking a signal, and is easy to miss because the change reads as
   unrelated cleanup or a "simplification."
3. Verify a structured log or metric carries enough identifying context
   (operation, tenant/request id, outcome) to be actionable, without logging
   sensitive fields the candidate did not already expose.
4. Confirm any new or existing alert threshold has a named, actionable owner
   and a condition that fires before a customer would notice, not only after.
5. Where a fault-injection or fixture run is available, trigger the failure
   mode and cite the receipt showing the expected signal actually fired;
   where unavailable, state that verification is unavailable rather than
   asserting the signal works.

The intermediate deliverable is a table of failure mode, signal name,
present/removed/unchanged, actionable owner, and verification status.

## Evidence and finding taxonomy

Required evidence is the current metric/log/alert definition (or its
absence) for each failure mode in scope, and, when available, a
fault-injection receipt showing the signal fired. A claim that "the logs
would show it" without citing the actual log statement is `INFERRED` at best
and not sufficient alone for a passing disposition on a critical path.
Finding categories are missing signal for an in-scope failure mode,
self-blinding change (removes or weakens existing coverage), unactionable
alert (no owner or fires too late), and log/metric missing identifying
context. Severity follows the shared finding contract; a self-blinding
change on a critical path is `critical` because it silently regresses
coverage that previously existed.

## Non-decisions and escalation

Observe does not decide what the failure-handling behavior should be, does
not set the latency/error budget the alert threshold should track, and does
not authorize a rollback plan — those are Failure's, Speed's, and Recover's
slices, combined by Signal into one reliability conclusion. Escalate to
Signal when the signal table is complete and a required metric/log/alert
needs to be specified as part of the overall reliability finding, or when
detectability depends on an idempotency or blast-radius judgment outside
Observe's scope. Return the request to Forge; do not dispatch Signal.

## Stop conditions

Stop once every failure mode in scope has a stated signal disposition or a
recorded gap. Stop immediately on unidentified failure modes in scope, no
existing observability inventory to check against, forbidden access, or when
the candidate changes no metric, log, alert, or the behavior they cover (no
findings to force).

## Examples

### Valid worked example

A candidate refactors a payment-charge handler and, in the same diff, removes
a `charge_attempt{result}` metric emission that was previously incremented on
every code path, replacing it with a log line only on the error path. Observe
cites the removed metric call (`observed:charge-metric-removed`) and the
existing alert definition that reads it (`observed:charge-attempt-alert`) and
emits:

```json
{
  "schema": 2,
  "id": "finding:PLACEHOLDER",
  "lens": "observe",
  "severity": "critical",
  "criterion": "an existing failure signal must not be silently removed or weakened by an unrelated change",
  "invariant": "charge_attempt metric is emitted on every charge outcome so the paired alert can evaluate",
  "evidence_ids": ["observed:charge-metric-removed", "observed:charge-attempt-alert"],
  "affected_behavior": "payment charge attempt metric emission",
  "smallest_repair": "restore charge_attempt{result} emission on every charge code path",
  "verification": "confirm the metric increments on both success and failure charge outcomes and the alert evaluates non-empty data",
  "status": "open"
}
```

### Misleading example

"We still log errors, so it's still observable" is rejected: the removed
metric fed a specific alert threshold that the remaining error log does not
reach, so the operator-facing detection path is gone even though a human
reading logs after the fact could still find the error.

### Missing-input example

Given a new critical-path integration with no existing metric/log/alert
inventory documented and no fault-injection fixture available, Observe
returns `needs_input` naming `existing_observability_coverage`, records no
signal-table disposition, and asks Forge to resume once the inventory or a
fixture is supplied rather than assuming standard logging is present.
