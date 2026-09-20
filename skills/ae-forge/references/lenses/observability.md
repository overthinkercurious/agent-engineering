# Observability lens (can an operator see what happened)

## Exclusive constraint

Adds operator-visibility depth to Reliability's runtime boundary: whether a
failure in this change can be detected, attributed and diagnosed without
adding code after the incident. Reliability still owns the failure model; this
lens owns whether anyone can see it happen.

## Activates

Signals: `observability`, `telemetry`, `logging`, `metrics`, `tracing`,
`alert`, `slo`, `incident`, or a detected telemetry SDK in the project.

Skip for a change with no runtime behaviour - a pure documentation or build
change has nothing to observe.

## Checklist

**Detectable (Reliability)**

1. Confirm the failure modes this change introduces each produce a signal: an
   error counter, a log with enough context to identify the request, or a span
   that fails.
2. Confirm a silent failure is impossible where it matters: a swallowed
   exception, a default-on-error, or a queue that drains to nowhere must
   surface somewhere.
3. Confirm signals distinguish "not happening" from "happening and failing".
   A metric that only counts successes cannot alert on a total outage.

**Attributable (Reliability)**

4. Confirm a request can be followed across the boundaries this change
   touches, with a correlation or trace identifier that survives the hop.
5. Confirm logs carry the identifiers an operator would filter by - request,
   user or tenant, and operation - without carrying personal data or secrets.
6. Confirm errors record cause, not just symptom: the upstream status, the
   failing dependency, the input class that triggered it.

**Affordable (Reliability, Architect)**

7. Check metric cardinality before adding a label. A user id, a request id or
   a raw URL as a label multiplies series without bound and is the usual cause
   of a telemetry bill incident.
8. Check log volume on the hot path, and that debug-level detail is not
   emitted per request in production.
9. Confirm sampling, where used, still captures errors - sampling away the
   failures defeats the purpose.

**Actionable (Reliability)**

10. Confirm an alert, where this change warrants one, names a condition a human
    can act on, and points at what to do. An alert with no action is noise
    that trains people to ignore the channel.
11. Confirm dashboards or queries an operator would reach for actually exist
    for the new behaviour, rather than being assumed.
12. For a rollout, confirm the signal that would indicate it is going wrong is
    watched before the rollout proceeds, not after.

## Evidence

Name the signals actually emitted and where they land. State whether they were
observed in a running environment or only read in source - a log line that
exists in code and is filtered out downstream is not observability.

## Findings

Every finding names the failure that would go unseen and what an operator
would be missing at 3am. "Add more logging" is not actionable; "a failed
webhook retry emits nothing, so a stalled payment queue is invisible until a
customer complains" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
telemetry conventions, its declared service objectives, or an enforced gate.
Where the project defines a logging format, a cardinality budget, or an
alerting policy, that wins and this lens records the difference as a finding.

## Hands off

Does not own: the failure model itself and retry design (Reliability), what
counts as a security-relevant event and its retention (Security), data
schema for analytics (Data), or the final delivery verdict (Verifier).
