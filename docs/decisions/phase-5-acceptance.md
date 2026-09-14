# Phase 5 acceptance checkpoint

Date: 2026-09-13
Status: accepted; Phase 6 may begin

## Implemented behavior

- A deterministic risk record (`scripts/fixtures` schema `risk-assessment`) is
  computed at intake, on explicit signal updates, and on completed-diff
  reclassification. Inputs are affected behaviors, interfaces, explicit user
  signals, the routing-policy execution-tier floor, and — for completed work —
  the actual diff text/paths/digest, never filename pattern alone.
- Tiers only escalate. `riskEvent` carries the prior effective tier forward and
  raises it; nothing in the reclassification path can lower previously earned
  rigor, and the source of every change (`intake`, `signal_update`,
  `completed_diff`) is recorded next to the new tier.
- A filename match is treated as a lead: it can widen requested coverage
  (`route`) without by itself raising the execution tier, which is asserted
  directly in `scripts/test-risk.mjs`.
- Probe's diagnosis mode is enforced by the runner, not left to prose. A
  completed diagnosis result must name `established_cause`, cite only known
  evidence IDs from observations and hypotheses, and include at least one
  hypothesis marked `supported`; disproved hypotheses are retained rather than
  discarded. A corrective `definition` transition is blocked until a tested
  causal account exists (`tested diagnosis is required`), and an unresolved
  diagnosis halts with `established_cause: null` preserved instead of a
  fabricated cause.
- Diagnosis dispatches require an observed fresh independent context
  (`--independent`, checked against host capability observation), matching the
  Phase 4 isolation guarantee rather than a second, weaker promise.
- `model_profile` is enforced at dispatch: `smaller-model-only` cannot invoke a
  `strongest`-class observed host model. A `mixed` profile may escalate only
  with an explicit `--model-escalation-reason`, which is bound into the packet
  and charged as a mixed-profile call so a smaller-only result can never absorb
  an unexplained stronger-model charge.
- Exactly one local retry is permitted for a repairable output/contract
  failure (`validateRetry`); a second attempt against the same dispatch is
  denied with `local retry limit is exhausted`, and retries are content-bound
  to the original bounded task so a changed candidate, workflow, or policy
  cannot silently reuse stale evidence.
- `rejectSatisfiedDuplicate` stops a redundant specialist call: a new dispatch
  whose specialist, stage, request, candidate identity, workflow/contract
  digests, acceptance IDs, inputs, and allowed tools/writes exactly match an
  already-`acknowledged`, `passed`, `complete` prior dispatch is denied with
  `current evidence already satisfies this bounded specialist task` instead of
  spending another call. A retry (`--retry-of`) is exempt from this check by
  design, since a retry exists specifically to replace failed evidence.

## Verification

- Risk-classification suite (`scripts/test-risk.mjs`): 6 passed, 0 failed —
  isolated-vs-security-boundary tier escalation, filename-as-lead (not proof),
  completed-diff risk raising coverage, non-lowering reclassification, and
  cross-system scope adding integration/failure coverage.
- Forge acceptance suite (`scripts/test-forge.sh`): 211 passed, 0 failed,
  including the diagnosis-gate/diagnosis-uncertain fixtures, the mixed-model
  escalation-reason fixtures, the completed-diff reclassification fixture, and
  the evidence-satisfaction stop against a redundant dispatch.
- Contract suite: 35 passed, 0 failed.
- Scaffold/host suite: 70 passed, 0 failed.
- Initialization/artifact suite: 96 passed, 0 failed.
- Suite validation: 2 skills valid, 0 warnings.
- Full `npm test` (validate-suite → validate-forge → test-contracts →
  test-risk → test-scaffold → test-artifacts → test-forge): passed, exit
  code 0.

## Exit-gate decision

Phase 5 is accepted. Routing depth is predictable from a recorded,
non-lowering risk signal rather than persona intensity or word count;
corrective work on a diagnosis-required request cannot begin without a tested
causal account naming a supported hypothesis over known evidence; an
uncertainty-preserving halt is available when no cause can be established; and
no model profile can weaken required evidence or hide a stronger-model
escalation as a smaller-only result. Redundant specialist activation against
unchanged evidence is now stopped deterministically rather than left as a
prompt convention.

This is an authoring/contract checkpoint, not a Phase 9 claim about routing
quality under held-out evaluation. Phase 6 may begin.
