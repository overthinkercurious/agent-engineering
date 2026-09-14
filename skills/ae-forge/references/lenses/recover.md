# Recover — release rollback lens

## Contract metadata

- **ID/version:** `recover` / `1`
- **Covers:** rollback and recovery
- **Escalates to:** `signal`
- **Finding schema:** `finding.schema.json`

## Activation and non-triggers

Apply when the candidate ships a behavior change that could be wrong in
production and needs a way back to the last known-good state — a release,
flag flip, config change, or code deploy. Registry triggers are `migration`,
`release`, `critical`. Do not activate solely because a diff touches a
migration file; the data-repair correctness of a migration's backfill or
transform is `migrate`'s scope, escalating to `shift` — Recover asks only
whether *this release* (including one that ships alongside a migration) can
be safely reverted or disabled without a ratchet-only side effect. Recover
does not decide whether a dependency degrades safely (Failure), whether the
change is fast enough (Speed), or whether a failure would be visible
(Observe); a change can be perfectly observable and fail this lens because
reverting it corrupts state the old code cannot read.

## Inputs and missing inputs

Read the release mechanism for the candidate (feature flag, staged rollout,
plain deploy), any schema or data shape change that ships with it, and the
current rollback procedure if one exists. If the release mechanism is not
stated, return `needs_input` naming `release_mechanism`. If the change writes
data in a new shape or removes a column/field the prior code path reads,
return `needs_input` naming `rollback_compatibility_window` when it is not
already answered — Recover will not assume the old code tolerates the new
shape.

## Questions and procedure

1. Identify the release mechanism and the specific action that reverts it
   (flag off, redeploy prior version, revert commit and redeploy).
2. Check for ratchet-only side effects: a schema change, a one-way data
   migration, a consumed queue message, or a sent external notification that
   a code revert cannot undo.
3. Where the change writes or reads data in a new shape, verify the prior
   code version can still run correctly against data written by the new
   version during a rollback window (dual-read/dual-write compatibility).
4. Define the observable condition that should trigger a rollback and name
   an accountable operator for acting on it; a rollback trigger with no
   accountable owner is a finding.
5. Estimate time-to-recover: how long from trigger to restored known-good
   state, including any manual step (flag flip is fast; a redeploy plus
   warm-up is slower; a data backfill reversal may not be bounded at all).
6. Where a rehearsal in a disposable environment is available, cite its
   receipt; where unavailable, state that rehearsal is unavailable rather
   than asserting the rollback works.

The intermediate deliverable is a table of release mechanism, ratchet-only
effect (yes/no and what), rollback compatibility status, trigger condition,
accountable owner, and estimated time-to-recover.

## Evidence and finding taxonomy

Required evidence is the stated release mechanism, an inspection of any
schema/data-shape change against the prior code version's read path, and,
when available, a rehearsal receipt from a disposable environment. A claim
that "we can always revert the commit" is `INFERRED` at best and rejected
when a ratchet-only side effect exists that the commit revert cannot touch.
Finding categories are ratchet-only side effect with no stated remediation,
rollback-incompatible data shape (old code cannot read new-shape data),
missing or unowned rollback trigger, and unbounded or unestimated
time-to-recover on a critical path. Severity follows the shared finding
contract; a ratchet-only effect on a critical path with no remediation is
`critical`.

## Non-decisions and escalation

Recover does not decide whether the dependency behind a bad release degrades
safely, does not set the metric/alert that would fire the rollback trigger,
and does not judge the release's own latency/capacity behavior — those are
Failure's, Observe's, and Speed's slices, combined by Signal into one
reliability conclusion. It also does not own migration data-repair
correctness (Migrate, escalating to Shift). Escalate to Signal when the
release/rollback table is complete and needs to be combined with the
observability signal that would fire the trigger and the failure-mode
judgment about what "wrong" looks like. Return the request to Forge; do not
dispatch Signal.

## Stop conditions

Stop once the release mechanism, ratchet-only effects, and rollback trigger
have a stated disposition or a recorded gap. Stop immediately on missing
release mechanism, missing data-shape compatibility answer when the change
writes new-shape data, forbidden access, or when the candidate ships no
release-observable behavior change (no findings to force).

## Examples

### Valid worked example

A candidate adds a new required, non-nullable column populated only by new
write code, ships behind a deploy with no feature flag. Recover inspects the
migration (`observed:add-column-migration`) and the prior code version's
insert path (`observed:prior-insert-path`), finding the old code cannot write
a value for the new required column, so a rollback after any new row is
written would crash the reverted version. It emits:

```json
{
  "schema": 2,
  "id": "finding:PLACEHOLDER",
  "lens": "recover",
  "severity": "critical",
  "criterion": "reverting a release must not crash on data the new version wrote",
  "invariant": "prior code version can insert successfully against the post-migration schema",
  "evidence_ids": ["observed:add-column-migration", "observed:prior-insert-path"],
  "affected_behavior": "order table insert path across a version rollback",
  "smallest_repair": "make the new column nullable or backfill-defaulted until the old version is fully retired",
  "verification": "run the prior code version's insert path against the migrated schema and confirm no constraint violation",
  "status": "open"
}
```

### Misleading example

"We can just revert the commit if it's wrong" is rejected: the commit revert
restores the old code, but the migration already ran and the old code cannot
insert against the new required column, so "revert the commit" does not
describe an executable recovery for this release.

### Missing-input example

Given a change with no stated release mechanism (unclear whether it ships
behind a flag or as a plain deploy), Recover returns `needs_input` naming
`release_mechanism`, records no trigger/owner disposition, and asks Forge to
resume once the release plan is supplied rather than assuming a flag exists.
