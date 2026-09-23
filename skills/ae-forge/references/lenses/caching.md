# Caching lens (stale answers, on purpose)

## Exclusive constraint

Adds cache-correctness depth to Reliability's runtime boundary and Data's
state boundary: what may be served stale, for how long, who may see it, and
what happens when everything expires at once.

A cache is a deliberate decision to serve an out-of-date answer in exchange for
speed. This lens owns whether that trade was actually stated — how wrong the
answer may be, and to whom.

## Activates

Signals: `cache`, `caching`, `redis`, `memcached`, `cdn`, `etag`,
`invalidation`, `ttl`, `stale`, `memo`, `memoize`, `revalidate`, or a change
that stores a computed answer to avoid recomputing it.

Skip when the value is derived fresh on every read. A constant is not a cache.

## Checklist

**Design (Architect)**

1. State the staleness budget as a number with a unit, and who decided it.
   "Cached for performance" is not a budget; "up to 60s stale, accepted by
   product because the figure is advisory" is.
2. State the key, in full. A key missing a dimension the value depends on —
   tenant, user, locale, currency, feature flag — is the mechanism by which
   one caller sees another caller's answer.
3. Decide invalidation before deciding storage. Time-based expiry is honest
   and cheap; event-based invalidation is precise and easy to get wrong; a
   cache with neither is a permanent copy of a past value.
4. Name what must never be cached: anything authorisation-dependent that the
   key does not capture, anything personal at a shared layer, anything whose
   staleness is a correctness failure rather than a delay.
5. Decide the behaviour when the cache is unavailable. A cache whose outage
   takes the system down was a dependency, not an optimisation.

**Implementation (Builder)**

6. Include every authorisation-relevant dimension in the key. A per-user
   response cached under a per-path key is a cross-user disclosure, and it
   will look like a performance win right up until it is reported as a breach.
7. Set an explicit TTL on every entry. An unbounded entry is a memory leak
   that also serves wrong answers.
8. Protect against the stampede: when a hot key expires, every in-flight
   request recomputes it at once. Single-flight, jittered expiry, or
   serve-stale-while-revalidate — pick one and say which.
9. Write through or invalidate at the same place the source of truth changes,
   not in a separate code path that can be forgotten by the next caller.
10. Treat a cache read as possibly absent, always. Code that assumes a hit has
    made the cache a database.

**Verification (Verifier)**

11. Confirm a write is visible within the stated staleness budget. Measure it;
    do not reason about it.
12. Confirm two different principals cannot receive each other's entry — vary
    the dimension you believe is in the key and watch the value change.
13. Confirm the system still serves correctly with the cache emptied and with
    the cache unreachable.

## Evidence

Name the key with `path:line`, the TTL with its source, the invalidation
trigger, and the stampede protection. State which of the cross-principal,
cold-cache and unavailable-cache cases were exercised.

## Findings

Every finding names the entry, the dimension missing from its key or the
window during which it is wrong, and who sees the wrong answer. A finding
about caching that does not name a reader is a performance opinion.

## Authority

This lens narrows what a role must check; it never outranks the project's own
staleness decisions, its cache configuration, or an enforced gate. Where the
project has accepted a longer staleness window deliberately, that wins and
this lens records the difference.

## Hands off

Does not own: query cost and index selection at the source (`database-performance`),
field metrics and page-level budgets (`web-performance`), authorisation policy
itself (Security), or the final delivery verdict (Verifier).
