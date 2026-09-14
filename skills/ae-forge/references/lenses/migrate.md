# Migrate — migration and recovery lens

## Contract metadata

- **ID/version:** `migrate` / `1`
- **Covers:** migration and recovery
- **Escalates to:** `shift`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply to any change to a schema definition, a migration script, a backfill
job, or a data-repair/recovery operation — anything whose correctness depends
on the transition path between an old and a new stored shape, not merely on
the shape's end state. Trigger words `schema`, `migration`, `backfill` are a
lead, not proof: a change that only reads existing data without altering its
shape or transition path is not Migrate's. Do not use Migrate to judge an
ordinary write path's race or constraint correctness against a stable schema
— that is Integrity's narrower slice of Shift's ownership. Do not use Migrate
to approve a destructive operation's authorization or business justification;
state only the migration/backfill/recovery mechanics.

## Inputs and missing inputs

Read the current schema/migration history up to the base commit, the
deployment/rollout topology (single-writer, rolling, blue/green, or
multi-region — i.e., how long old and new code can run against the same
store), row-count/scale evidence for every table the operation touches or
scans, and the proposed migration/backfill diff. If deployment topology or
current schema is missing, return `needs_input` naming the exact field — do
not assume a topology. If row-count/scale evidence for an affected table is
missing, return `needs_input` naming that table; never assume "small enough
to run inline" without a number. If the question is about an ordinary write
path's race or constraint enforcement rather than the migration/backfill
transition itself, return a request for Integrity through Forge.

## Questions and procedure

1. State the existing invariant (what the current schema and running code
   already guarantee) and the desired invariant (what must hold once the
   change is complete).
2. Check whether a single-step change is safe for the entire compatibility
   window: can old code still read/write against the new shape, and does new
   code tolerate rows not yet migrated? If not, require an
   expand/backfill/contract sequence instead of a single mutating step.
3. For any backfill, identify the idempotency key or condition (a
   `WHERE migrated_at IS NULL` guard, a marker column, or a natural-key
   check) that makes a retried or resumed run safe to re-run without
   double-applying.
4. Check batching: is the backfill bounded (explicit batch size, monotonic
   cursor or checkpoint for restart), or does it touch an unbounded row set
   in one transaction or pass — the latter is rejected outright regardless
   of other correctness.
5. Identify concurrent-write hazards: what happens to a row written by live
   traffic while the migration window or backfill cursor is in flight over
   that row, and whether the transition tolerates the race (idempotent
   upsert, version/CAS check) or merely assumes exclusivity.
6. Check for a real rollback/recovery path for partial application: what a
   process killed halfway leaves behind, how that state is detected, and the
   forward-fix or compensating action on the data itself — "revert the
   commit" is rejected as sufficient once any row has been mutated in place.
7. Cite the smallest current evidence (migration history, row-count/scale
   figures, rehearsal receipt if one exists) that answers each question.

The intermediate deliverable is the invariant statement (existing vs.
desired), the compatibility-window disposition (safe as one step, or which
expand/backfill/contract phase is required), the backfill's idempotency key
and batching plan, and the recovery procedure.

## Evidence and finding taxonomy

Required evidence is the current schema/migration history, deployment
topology, row-count/scale evidence for every touched table, and (when a
rehearsal exists) its receipt. Finding categories are missing
expand/contract phasing (single step unsafe across the compatibility
window), non-idempotent backfill (no key or condition preventing
double-apply), unbounded/unbatched backfill, unaddressed concurrent-write
race during the transition window, and code-only recovery (no plan for
already-mutated rows). Severity follows the shared finding contract and the
operation's blast radius (row count affected, reversibility, and whether the
table is on a live write path all raise severity); a green migration-tool
exit code or a fast staging run is never sufficient evidence on its own.

## Non-decisions and escalation

Migrate does not judge an ordinary write path's race or constraint
correctness against an already-stable schema, does not decide retention or
data-ownership policy, and does not render the final release verdict.
Escalate to Shift when the finding requires designing the full
migration/backfill/recovery plan end to end, when a destructive operation
needs explicit policy-gated approval, or when rehearsal against
representative data is required to confirm a claim. Return the request to
Forge; do not dispatch Shift.

## Stop conditions

Stop once compatibility, idempotency, batching, concurrent-write hazards, and
recovery each have a stated disposition or a structured gap is recorded.
Stop immediately on missing schema/topology/scale evidence, forbidden access,
or satisfied coverage. Do not approve an unrehearsed destructive step on a
"looks fine" read.

## Examples

### Valid worked example

A migration adds `NOT NULL` to `orders.currency` in a single `ALTER TABLE`
statement, deployed via a rolling rollout with a 30-minute mixed-version
window, against a table with 40 million rows where the old code path can
still insert rows without a `currency` value during that window. Migrate
cites the rollout topology and row count and emits a critical finding: the
single-step migration will fail (or reject inserts) the moment old code
writes a row without `currency` during the mixed-version window, and running
it as one step against 40 million live rows also risks a long table lock. It
requires expand (nullable `currency` column with an application-level
default), backfill (batched, keyed on `id > :cursor AND currency IS NULL`,
idempotent because the `IS NULL` guard skips rows already migrated), and
contract (`NOT NULL` added only once a validation query confirms zero
remaining nulls and the old insert path is retired).

### Misleading example

"This backfill is safe — it's wrapped in a single transaction so it's all
committed atomically, and there's a unique index protecting against
duplicates" is rejected. Wrapping an unbounded backfill in one transaction
does not bound its size or lock duration — it makes the lock and rollback
segment larger, not safer, and a unique index prevents duplicate rows but
does nothing to stop a resumed backfill from re-running the same
non-idempotent transformation logic (e.g., incrementing a counter or
re-triggering a downstream side effect) on rows it already touched. Atomicity
of the write is not the same claim as idempotency of the operation or
boundedness of its blast radius.

### Missing-input example

Given a request to "run the backfill for the new `orders.currency` column"
with no stated rollout topology and no row-count evidence for `orders`,
Migrate returns `needs_input` naming `deployment_topology` and
`orders_row_count_evidence` as the missing inputs. It records no batching
plan, no idempotency claim, and no compatibility-window disposition, since
each depends on the missing facts, and asks Forge to resume once the packet
supplies them.
