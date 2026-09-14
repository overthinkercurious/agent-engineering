# Phase 6 acceptance checkpoint

Date: 2026-09-13
Status: accepted; Phase 7 may begin

## Implemented behavior

- `forge.mjs verify` is the only sanctioned way to produce a command-receipt.
  It executes the exact command from the project's effective quality policy
  itself, in the project root, and derives `exit_code`, `output_sha256`, and
  `output_bytes` from what actually ran — never from a claimed value. The
  receipt is bound to the current candidate identity and stamped
  `issuer: "forge"`. `verify` only runs during `audit`, `verification`, or
  `repair`, and a repeated receipt ID for the same command is idempotent
  rather than re-executed.
- A specialist result may cite `MEASURED` evidence only by an exact receipt
  ID. `validateMeasuredEvidence` (`dispatch.mjs`) resolves that ID against the
  run's own `evidence/` tree; a citation that does not match a real,
  `forge`-issued receipt on the current candidate is rejected before the
  result is accepted. A specialist — including Judge — can no longer
  self-certify a measured claim.
- The release policy's `requires` list, resolved into
  `manifest.release_requires`, is now enforced at the `ready_for_pr`
  transition instead of being computed and ignored:
  - `independent_release_audit` requires a `judge` dispatch in the
    `verification` stage, validated, `complete`, on the current candidate,
    with observed host isolation other than `shared_context`.
  - `acceptance_evidence` requires that Judge's cited acceptance IDs are a
    superset of every acceptance ID any `implementation`-stage dispatch
    claimed on the current candidate; an uncovered ID fails the transition
    by name.
  - `residual_risks_recorded` requires every open finding ID to appear in
    `reviews/release-audit.md` when the run has open findings.
  - `project_gates_pass` continues to be enforced by the existing
    candidate-bound command-receipt check, now satisfied only by a real
    `verify` execution rather than a hand-placed receipt file.
- The Alpha fixture (`scripts/fixtures/forge/config-precedence/`) now runs
  through the full lifecycle via the runner, not only as an imported-module
  regression: Probe independently establishes the cause from a fresh context
  before `definition` opens, the one-line repair is confined to
  `src/config.mjs`, the regression is executed by the runner itself, and
  Judge's verdict cites that exact receipt.
- `ae-forge/SKILL.md` documents the `verify` workflow so the orchestrating
  model is instructed to produce evidence this way rather than writing
  `evidence/*.json` by hand.

## Three Alpha modes

- **Normal completion** — `alpha-precedence` reaches `complete` with an
  independent Probe diagnosis, a runner-executed regression that genuinely
  passes on the repaired candidate, and a Judge verdict citing that receipt.
- **Approval-bound artifact mutation** — mutating `plan/implementation.md`
  after approval blocks the next transition (`changed after approval`) until
  the approved content is restored, exercised directly on the Alpha fixture.
- **Interruption and resume** — pausing mid-`verification` and resuming
  returns to the recorded state without repeating an already-acknowledged
  side effect, exercised directly on the Alpha fixture.

## Negative cases

- A specialist citing `MEASURED` evidence for a receipt ID that was never
  produced by `verify` is rejected (`fabricated-evidence` fixture).
- `ready_for_pr` is refused when no independent Judge verification dispatch
  exists on the candidate (`missing-release-audit` fixture).
- `ready_for_pr` is refused when Judge's cited acceptance IDs are a strict
  subset of what implementation claimed; the uncovered ID is named in the
  failure (`alpha-uncovered` fixture).

## Known, deliberately deferred gap

A generic "weak or no-op assertion" content-quality detector was scoped out
after verification rather than shipped as an untested guard: Node's `--test`
runner (v24) reports at least one test for the invoked file regardless of
whether it contains assertions, so a literal zero-test heuristic is dead code
that no realistic fixture can exercise, and was removed rather than left as
false assurance. The practical mitigation already in place is structural
rather than content-based: the hidden test file sits outside the
implementer's `allowed_write_roots`, so a specialist cannot report having
weakened it through the sanctioned `artifact_changes` path, and any actual
change to it changes candidate identity, invalidating stale passing evidence.
Judging the semantic strength of a test's assertions is left to specialist
and lens depth in Phase 7, not to a mechanical output check.

## Verification

- Forge acceptance suite (`scripts/test-forge.sh`): 278 passed, 0 failed.
- Contract suite: 35 passed, 0 failed.
- Risk-classification suite: 6 passed, 0 failed.
- Scaffold/host suite: 70 passed, 0 failed.
- Initialization/artifact suite: 96 passed, 0 failed.
- Suite validation: 2 skills valid, 0 warnings.
- Full `npm test`: passed, exit code 0.

## Exit-gate decision

Phase 6 is accepted. Implementation cannot self-certify: every command
receipt is runner-executed and candidate-bound, every `MEASURED` claim must
resolve to a real receipt, and `ready_for_pr` cannot be reached without an
independent Judge verdict that demonstrably covers what was implemented and
accounts for every open finding. All three Alpha modes pass on the committed
fixture without bypassing a gate. This is an authoring/contract checkpoint;
the deferred content-quality gap above is carried forward explicitly rather
than hidden. Phase 7 may begin.
