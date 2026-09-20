# Database performance lens (access paths, locks, and volume)

## Exclusive constraint

Adds access-path and volume depth to Data's persistent-state boundary and to
Architect's design decisions: what the planner will actually do, what a
migration locks and for how long, and how both behave at real row counts. Data
still owns whether stored state stays correct; this lens owns whether getting
at it stays affordable.

## Activates

Signals: `database-performance`, `query`, `index`, `slow-query`, `n+1`,
`explain`, `lock`, `replica`, `vacuum`, or a `stored-shape` risk on a table
whose size is not trivially bounded.

Skip when the change reads an unchanged contract at trivial volume, and say so
rather than producing an unmeasured verdict.

## Checklist

**Read the plan, not the query (Data, Architect)**

1. Obtain the actual execution plan for the changed query at realistic volume.
   A query's appearance does not predict its plan, and a plan on a seeded
   development database predicts nothing about production.
2. Check for sequential scans on filtered or joined columns, and for an index
   that exists but cannot be used — a leading-column mismatch, a function or
   cast applied to the column, or a type coercion.
3. Check selectivity before adding an index. An index on a low-cardinality
   column is write cost with no read benefit.
4. Check whether an added index duplicates an existing one by prefix. Two
   indexes covering the same leading columns cost writes twice for one benefit.

**Volume and shape (Data)**

5. Confirm every query over a growing table is bounded — a LIMIT, a keyset
   page, or a time window. Offset pagination degrades linearly and is not a
   bound at depth.
6. Check for N+1 access: one query per row of a prior result, including the
   version hidden behind a lazy relation or a serializer.
7. Check that a new column's default and nullability do not force a full table
   rewrite on a large table.
8. State the row count the analysis assumes. Where production volume is
   unknown, that is UNKNOWN and load-bearing — not an estimate.

**Locks and availability (Data, Reliability)**

9. Name what each migration statement locks, at what strength, and for how
   long. An index build, a type change, a constraint validation, and a default
   backfill each behave differently.
10. Prefer the non-blocking form the engine offers — concurrent index builds,
    add-then-validate for constraints, expand/migrate/contract for shape — and
    say explicitly when none exists.
11. Check behaviour under a statement or lock timeout: a migration that cannot
    acquire its lock should fail fast, not queue behind traffic and block it.

**Replication and caching (Data, Reliability)**

12. Check whether a read moved to a replica can tolerate replication lag, and
    what a stale read means for the user-visible behaviour.
13. Check that a long-running backfill does not generate lag that degrades
    unrelated reads.
14. Check that a cache introduced here has a defined invalidation path, and
    that a miss storm cannot stampede the database.

## Evidence

Report the plan, the row count, and the conditions. "Added an index" is not a
finding resolved; the same query's plan before and after, at the same volume,
is. Where no production-like data is available, say which numbers are
unverified rather than presenting development timings as results.

## Findings

Every finding names the query or migration, the access path observed, and the
volume at which it becomes a problem. A recommendation with no plan behind it
is a hypothesis and must be labelled as one.

## Authority

This lens narrows what a role must check; it never outranks the project's own
migration conventions, its declared availability requirements, or an enforced
gate. Where the project documents a required migration pattern, that wins and
this lens records the difference as a finding.

## Hands off

Does not own: whether stored state remains correct across a transition (Data's
own invariant boundary), authorization and row-level security policy
(Security), client-side rendering performance (`web-performance`), or the
final delivery verdict (Verifier).
