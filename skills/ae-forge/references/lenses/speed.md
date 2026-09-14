# Speed — latency and capacity lens

## Contract metadata

- **ID/version:** `speed` / `1`
- **Covers:** latency and capacity
- **Escalates to:** `signal`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when the candidate changes a query, loop, batch size, cache, or
synchronous call on a path with a stated or inferable performance
expectation. Registry triggers are `performance`, `database`, `critical`. Do
not activate solely because a diff touches a database file; confirm the
change alters the number, size, or synchrony of operations performed per
request. Speed judges the candidate's own resource use at realistic scale —
it does not judge what happens when a dependency fails (Failure), whether a
regression would be visible (Observe), or whether the change can be rolled
back (Recover); a query can be perfectly observable and revertible and still
fail this lens because it issues N round trips where one would do.

## Inputs and missing inputs

Read the accepted latency/throughput budget for the affected operation (or an
explicit statement that none is defined), the current baseline measurement
method, the candidate diff, and the realistic data volume/concurrency for the
operation. If no budget exists and none can be derived from an existing SLO,
return `needs_input` naming `latency_budget`. If a baseline measurement is
absent, return `needs_input` naming `baseline_measurement` rather than
comparing the candidate against an assumed prior number.

## Questions and procedure

1. State the user-visible budget (p50/p99 latency, throughput, or resource
   ceiling) or record its absence as an explicit unknown.
2. Locate the operation count per request: does the change introduce a loop
   that issues one query/call per item (N+1), or does it stay batched?
3. Check whether any result set or loop bound is fixed by data size that can
   grow unboundedly (no page limit, no cap on a fan-out).
4. Identify whether a call that could be async/batched/cached is instead
   synchronous and on the critical path of a user-visible operation.
5. Measure baseline and candidate with the same method and representative
   data volume and concurrency when a test target is available; state
   measurement as unavailable, not assumed, when it is not.
6. Record any accuracy, cost, or complexity traded away to gain speed (a
   cache with staleness, a sampled computation) as part of the finding, not
   as a silent side effect.

The intermediate deliverable is a table of operation, count-per-request or
scaling factor, synchronous/async, measured baseline, measured candidate, and
budget disposition.

## Evidence and finding taxonomy

Required evidence is a reproducible measurement (baseline and candidate, same
method) or, when measurement is unavailable, an explicit statement of that
absence plus a static count of operations per request from the diff. A
synthetic microbenchmark on a single input is not accepted as proof of
end-to-end behavior at realistic volume. Finding categories are N+1 or
per-item operation growth, unbounded result set or fan-out, unnecessary
synchronous call on the critical path, and missing/undefined budget for a
path with materially changed cost. Severity follows the shared finding
contract; an unbounded fan-out on a critical path is `critical` even with no
observed incident yet.

## Non-decisions and escalation

Speed does not decide what happens when the dependency it calls is failing,
does not define the metric/alert that would catch a regression, and does not
authorize a rollback plan for a change that turns out too slow — those slices
belong to Failure, Observe, and Recover, combined by Signal into one
reliability/performance conclusion. Escalate to Signal when the
operation-count table is complete and needs a load-test receipt, an
idempotency/concurrency judgment, or a bound to declare a performance
finding's severity final. Return the request to Forge; do not dispatch
Signal.

## Stop conditions

Stop once every changed operation has a stated count-per-request and either a
measurement or a recorded absence of one. Stop immediately on missing budget
with no derivable SLO, missing baseline, forbidden access, or when the
candidate changes no operation count, synchrony, or bound (no findings to
force).

## Examples

### Valid worked example

A candidate replaces a single joined query with a loop that issues one
lookup query per order line to populate line-item names. Speed measures
baseline (`receipt:orders-query-baseline`, 1 query, 40ms) against candidate
(`receipt:orders-query-candidate`, 1+N queries, 40ms + 12ms per line, 620ms at
50 lines) and emits:

```json
{
  "schema": 2,
  "id": "finding:PLACEHOLDER",
  "lens": "speed",
  "severity": "high",
  "criterion": "per-request operation count must not scale with input size on a critical path",
  "invariant": "order-line lookup issues one query regardless of line count",
  "evidence_ids": ["receipt:orders-query-baseline", "receipt:orders-query-candidate"],
  "affected_behavior": "order detail line-item name lookup",
  "smallest_repair": "batch line-item name lookup into the original join or a single IN-list query",
  "verification": "re-run the 50-line-order measurement and confirm query count stays at 1",
  "status": "open"
}
```

### Misleading example

"It's just one extra query per line, and lines are usually small" is
rejected: "usually small" is not a stated bound, and the same code path is
reachable by orders with realistic line counts the diff does not cap —
absence of a bound is the finding, not the typical case.

### Missing-input example

Given a change to a report-generation endpoint with no stated latency budget
and no existing SLO to derive one from, Speed returns `needs_input` naming
`latency_budget`, records the operation-count table without a pass/fail
disposition, and asks Forge to resume once an accepted budget is supplied
rather than inventing an acceptable duration.
