# Release engineering lens (getting it to people, and taking it back)

## Exclusive constraint

Adds release-mechanics depth to Reliability's operational boundary and
Architect's rollout decisions: how a change reaches users, how far it has
reached at any moment, and how it is withdrawn once it has.

`infrastructure` owns what an apply does to an environment. This lens owns the
version that is running, who has it, and what "undo" means after people are
already using it — which is rarely a code revert.

## Activates

Signals: `release`, `deploy`, `rollout`, `version`, `versioning`, `semver`,
`changelog`, `tag`, `feature-flag`, `canary`, `staged-rollout`, `hotfix`,
`rollback`, or a change that alters what ships or how it ships.

Skip when the change cannot reach a user without a separate, already-governed
release. Editing code is not releasing it.

## Checklist

**Design (Architect)**

1. State the version this ships as, and who sets it. A version derived
   automatically from commits and a version bumped deliberately are different
   contracts with users, and only one of them can be reasoned about.
2. Decide the rollout shape before the change: everyone at once, a percentage,
   a cohort, or behind a flag off by default. "Ship it and watch" is a shape,
   but say so.
3. State the signal that would stop the rollout, and its threshold. A rollout
   with no stopping rule completes regardless of what it does.
4. **Separate rollback from revert.** Reverting code restores behaviour for
   requests that have not happened yet. It does not restore data written under
   the new behaviour, un-send notifications, or downgrade a client someone has
   already installed. Say which of those apply.
5. For a client that users install, state the floor you must keep supporting.
   Mobile and desktop users do not upgrade on your schedule, so a server
   change that assumes the newest client is an outage for everyone else.

**Implementation (Builder)**

6. Make the flag removable. A flag with no removal plan becomes permanent
   configuration, and permanent configuration doubles the number of code paths
   anyone must reason about.
7. Keep the changelog entry in the same change as the behaviour. A changelog
   written later is written from a diff, and describes what changed rather
   than what it means.
8. Make migrations forward-compatible across the rollout window. During a
   staged rollout, old and new code run simultaneously against one database;
   any change that only the new code can read will break the old one.
9. Never let a build carry a version it did not declare. A tag that does not
   match the artifact is how the wrong thing gets shipped and confidently
   reported as the right thing.

**Verification (Verifier)**

10. Confirm the released artifact reports the version that was intended.
11. Confirm the flag's off-state is the current behaviour, by exercising it.
12. Confirm the stated rollback actually restores the observable behaviour,
    and name explicitly what it does not restore.

## Evidence

Name the version and where it is set with `path:line`, the rollout shape and
its stopping signal, the flag and its default, and the rollback procedure.
State which parts were exercised and which are documented intent.

## Findings

Every finding names what users would experience and at which stage. "Rollback
is incomplete" is not a finding; "reverting restores the endpoint but leaves
rows written in the new shape at `migrations/014`, which the old reader
rejects" is.

## Authority

This lens narrows what a role must check; it never outranks the project's own
release process, its versioning policy, or an enforced gate. Where the project
bumps versions by hand or forbids automated tagging, that decision wins and
this lens records the difference rather than proposing a pipeline.

## Hands off

Does not own: environment provisioning and apply semantics (`infrastructure`),
operator signals and alerting (`observability`), migration correctness itself
(Data), store-review policy for a mobile build (`android`, `ios`), or the final
delivery verdict (Verifier).
