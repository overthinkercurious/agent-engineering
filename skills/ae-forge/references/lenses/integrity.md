# Integrity — data-integrity and concurrency lens

## Contract metadata

- **ID/version:** `integrity` / `1`
- **Covers:** data integrity and concurrency
- **Escalates to:** `shift`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply to any changed write path over shared or persisted state: an
application-level read-modify-write sequence, a uniqueness or relational
constraint claimed by application code, or an operation that can be invoked
twice (retry, duplicate request, concurrent tab) against the same record. Do
not activate solely because a filename contains `data`, `db`, or `model` —
trigger words `data`, `database`, `concurrency` are a lead, not proof. Do not
use Integrity to judge a schema migration, backfill, or rollout-compatibility
question; that is Migrate's narrower slice of Shift's ownership. Do not use
Integrity as a substitute for authorization or tenant-isolation judgment
(Tenancy) or for general reliability under external failure (Failure).

## Inputs and missing inputs

Read the current write path (the code that reads, decides, and writes),
the storage layer's actual enforced constraints (schema-level unique/foreign-
key/check constraints, transaction isolation level, or explicit locking
primitives in use), and any observed or reported symptom (duplicate row,
lost update, orphaned reference). If the storage layer's enforced constraints
are not stated or visible in the diff, return `needs_input` naming
`storage_constraint_definition` — do not assume a constraint exists because
application code checks for it first. If the question requires designing or
approving a schema change, backfill, or migration/rollout sequence, return a
request for Migrate through Forge.

## Questions and procedure

1. Identify every read-modify-write sequence in the changed path: what is
   read, what decision is made from it, and what is written back.
2. For each sequence, ask whether two concurrent invocations can both read
   the same stale state before either writes — a race window — and what each
   would then write.
3. For every uniqueness, ordering, or relational invariant the code assumes
   (email is unique, balance never goes negative, child row always has a
   parent), check whether the database enforces it or only the application
   does. An application-only check window (e.g., "SELECT then INSERT if not
   found") that is not wrapped in a real constraint, upsert, or CAS is a race
   window even without concurrency, once retried.
4. Identify duplicate and delayed delivery: what happens if this exact
   operation runs twice (retry, replay, double-submit) with no other state
   change in between.
5. Identify partial-failure states: if the operation writes to more than one
   place (two tables, a table and a queue, a table and an external call) and
   fails between writes, what inconsistent state results, and is there a
   compensating action or is it silently left inconsistent.
6. Cite the smallest current evidence (constraint definition, transaction
   boundary, existing test) that answers each question; do not reason from
   the code's apparent intent alone.

The intermediate deliverable is a compact table of write path, race or
duplicate scenario, current enforcement mechanism (`database` /
`application-only` / `none`), and disposition.

## Evidence and finding taxonomy

Required evidence is the write path's transaction/locking mechanics as
actually implemented, the storage layer's actual enforced constraints (not
the application's assumption of them), and either a reproducible interleaving
or an existing regression that fails when the invariant breaks. Finding
categories are unenforced invariant (constraint assumed, not enforced),
race window (concurrent read-modify-write with no lock/CAS/upsert), duplicate
non-idempotency (retried operation double-applies), and unaddressed partial
failure (multi-write operation with no compensating action). Severity follows
the shared finding contract and the invariant's blast radius (money, identity,
and irreversible external side effects raise severity); it is not inferred
from how rare the race appears to be.

## Non-decisions and escalation

Integrity does not design a migration, backfill, or expand/contract sequence,
does not decide retention or deletion policy, and does not render a final
data-safety verdict. Escalate to Shift when a finding requires a schema
change (adding a real constraint, an idempotency key column, or a version
column for CAS), when the fix requires backfilling existing rows before the
constraint can be enforced, or when the invariant's correct behavior during a
mixed-version rollout is unclear. Return the request to Forge; do not
dispatch Shift.

## Stop conditions

Stop after every write path in scope has a stated enforcement mechanism and
disposition, or a structured gap is recorded. Stop immediately on stale
evidence of the storage schema, missing write-path visibility, forbidden
access, or satisfied coverage. Do not invent a race that the code's actual
transaction boundaries foreclose.

## Examples

### Valid worked example

A "claim a support ticket" endpoint does `SELECT * FROM tickets WHERE id = ?
AND assignee IS NULL` followed by a separate `UPDATE tickets SET assignee =
? WHERE id = ?` with no `WHERE assignee IS NULL` guard on the update and no
row lock between the two statements. Integrity cites the two-statement
sequence and the absence of any `SELECT ... FOR UPDATE`, optimistic version
column, or conditional `WHERE` clause on the write, and emits a high-severity
finding: two agents claiming the same ticket concurrently can both pass the
read check and both writes succeed, with the second silently overwriting the
first's claim and no error to either caller.

### Misleading example

"The ORM wraps this in a transaction, so it's already atomic" is rejected
because a transaction around two statements does not by itself prevent a
lost update — it only groups the visibility of writes, and under the
database's default isolation level (read-committed, the common default) a
second transaction's SELECT can still see the pre-write state and issue a
conflicting UPDATE unless the read takes a lock, uses a conditional write, or
the isolation level is serializable. Wrapping the sequence in a transaction
without a locking or conditional-write mechanism does not close the race.

### Missing-input example

Given a diff that adds a `transferFunds` function performing a debit and a
credit as two separate writes, with no visible transaction boundary or
storage schema in the packet, Integrity returns `needs_input` naming
`storage_constraint_definition` and `transaction_boundary_definition` as the
missing inputs. It does not assume the two writes are wrapped in a
transaction, and it does not speculate on isolation level without the schema
and transaction code in evidence.
