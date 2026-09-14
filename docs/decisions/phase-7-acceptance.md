# Phase 7 acceptance checkpoint

Date: 2026-09-14
Status: accepted; Phase 8 may begin

## Implemented behavior

All twelve specialists (`scout`, `pulse`, `rift`, `flow`, `spine`, `pixel`,
`core`, `shift`, `vault`, `signal`, `probe`, `judge`) are now authored against
`skills/ae-forge/references/templates/specialist.md` in full — contract
metadata, activation/refusal, inputs, missing-input handling, authority and
boundaries, a concrete procedure, evidence and named domain failure modes, the
result envelope, a falsifiable quality rubric, and three worked examples
(valid, misleading, missing-input) per specialist. Before this phase only
`probe` met this bar; the other eleven were ~35-line placeholders from before
the template existed.

Each specialist has a dedicated, deterministic contract test
(`scripts/test-specialist-<name>.sh`) driving the real runner
(`forge.mjs dispatch`) through a purpose-built fake host
(`scripts/fixtures/forge/fake-host-<name>.mjs`), proving three things per
specialist rather than asserting them in prose:

- a **positive** case validates and completes with no inappropriate
  escalation;
- an **ambiguous** case returns `needs_input`/`needs_specialist` naming the
  exact missing input the specialist's own Inputs/Missing-inputs sections
  describe;
- a **negative** case — where a plausible answer would be "looks fine" — is
  never accepted uncontested: it surfaces as a recorded, tracked finding,
  escalation, or refusal consistent with the specialist's own
  Authority-and-boundaries section, never a silent clean pass.

Ownership boundaries between paired roles were kept sharp during authoring:
Spine designs interfaces, Core implements them and escalates to Spine on
ambiguity; Flow designs journeys, Pixel implements them and escalates to Flow
on an unspecified state; Scout gathers opportunity evidence, Pulse decides
scope/outcome, Rift adversarially challenges Pulse's recommendation before
approval. Judge's rewrite documents the mechanism Phase 6 already enforces in
code (`requireReleaseGate`, `validateMeasuredEvidence`) rather than a generic
"reviews everything" narrative — its own fixture demonstrates Judge correctly
refusing to render a clean verdict when no real receipt or independent
verification backs the claim.

## Beta flagship

`scripts/fixtures/forge/payment-duplicate-charge/` seeds a real defect (a
charge handler with no idempotency key, so retries or concurrent requests
double-charge) with a hidden Node test that genuinely fails 2/3 on the seed
and genuinely passes 3/3 on the one-line guard fix.
`scripts/test-flagship-payment.sh` runs the full lifecycle through the real
runner — intake through Probe diagnosis, definition, plan (Spine's
idempotency contract, Vault's abuse-angle review, Signal's concurrency and
rollout/rollback design), approval, Core's implementation, integration,
audit (Vault/Shift/Signal re-dispatched against the integrated candidate),
a real `forge.mjs verify` regression that fails pre-fix and passes post-fix,
an independent Probe re-check, and an independent Judge verdict covering
every acceptance ID — and asserts by name that all seven required evidence
dimensions (idempotency, concurrency, data repair, observability, rollout,
rollback, customer-impact) are actually present in the recorded dispatch
results, not merely claimed.

## Verification

- Per-specialist suites: Vault 29, Shift 40, Signal 22, Spine 31, Core 42,
  Judge 49, Scout 25, Pulse 19, Flow 22, Rift 26, Pixel 38 — 343 passed,
  0 failed across all twelve.
- Payment flagship suite: 51 passed, 0 failed.
- Forge acceptance suite: 278 passed, 0 failed.
- Contract suite: 35 passed, 0 failed. Risk suite: 6 passed, 0 failed.
- Scaffold/host suite: 70 passed, 0 failed. Initialization/artifact suite:
  96 passed, 0 failed.
- Full `npm test`: passed, exit code 0.

## Process note

All twelve specialist rewrites and the flagship build were authored by
parallel subagents in isolated git worktrees, then reviewed, cross-checked
for boundary violations (diffed against every other specialist's file to
confirm no cross-contamination), integrated one batch at a time, and
reverified against the full suite before each subsequent batch — no batch
was trusted without an independent full-suite run afterward. One real
regression was caught this way (a hard-wrapped `Owns:` line broke the
registry-ownership substring check) and fixed before integration completed.
Prior to this phase, Phases 0a-6 existed only as uncommitted working-tree
state; that state is now committed (`9a764ec`) so that git-worktree-isolated
work has a real base to start from.

## Exit-gate decision

Phase 7 is accepted. Every specialist meets the common contract with
authentic, falsifiable domain content rather than restated template
language, and the high-risk group (Vault, Shift, Signal, Spine, Core, Probe,
Judge) completes the payment flagship with evidence across every required
dimension, none of it invented and none of it self-certified. This is an
authoring/contract checkpoint: it demonstrates the specialists behave like
bounded experts against synthetic, deterministic fixtures. It is not a Phase
9 claim about quality under held-out evaluation or real-model behavior.
Phase 8 (lenses and capability packs) may begin.
