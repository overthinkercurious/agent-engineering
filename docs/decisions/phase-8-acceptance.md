# Phase 8 acceptance checkpoint

Date: 2026-09-14
Status: accepted; Phase 0b may begin

## Implemented behavior

All twelve lenses (`exact`, `threat`, `tenancy`, `integrity`, `migrate`,
`access`, `journey`, `failure`, `speed`, `observe`, `recover`, `compat`) are
now authored against `skills/ae-forge/references/templates/lens.md` in full —
contract metadata, activation/non-triggers, inputs and missing-input
handling, a narrow ordered question set, evidence and finding taxonomy,
explicit non-decisions with one escalation target, stop conditions, and three
worked examples (valid, misleading, missing-input) per lens. Before this
phase only `exact` met this bar; the other eleven were 12-line placeholders.

Sibling lenses sharing an escalation target were deliberately scoped to be
mutually exclusive rather than overlapping restatements of their specialist:

- `threat` (abuse of a feature's own function, untrusted input reaching a
  sink) vs. `tenancy` (does the acting identity match the resource's actual
  owner) — both escalate to `vault`.
- `integrity` (ordinary read-modify-write correctness against a stable
  schema) vs. `migrate` (the migration/backfill/rollback operation itself)
  — both escalate to `shift`.
- `failure` (dependency-failure handling: retry/backoff/circuit-breaker),
  `speed` (the candidate's own latency/operation count at scale), `observe`
  (would a failure actually be visible, including self-blinding changes),
  and `recover` (can this release itself be safely rolled back) — all four
  escalate to `signal` and were authored together specifically so a combined
  review never produces the same finding twice under different lens labels.
- `access` (keyboard/assistive-technology operability) vs. `journey` (state
  completeness and coherence for a sighted user) — both escalate to `flow`.
- `compat` (is this specific change to an existing contract additive or
  breaking against enumerated callers) — escalates to `spine`, narrower than
  Spine's full interface-design remit.

Since a lens is a method constraint folded into a specialist's review rather
than an independently dispatched role, each lens's mechanical proof is a
small dependency-free Node script (`scripts/test-lens-<name>.mjs`, modeled on
`scripts/test-risk.mjs`) built directly against `validate.mjs`'s exported
`findingId`, `assertValid`, and `deduplicateFindings` rather than a
dispatch-through-the-runner fixture. Each script proves: the lens's
valid-worked-example finding is schema-valid against `finding.schema.json`;
the lens's stated escalation target agrees with `registry.json`'s
`escalates_to` for that lens; two independently constructed but semantically
identical findings (same `criterion`/`invariant`/`affected_behavior`/
`evidence_ids`) collapse to one canonical ID and dedupe correctly; and two
genuinely distinct findings from the same lens are never over-merged. The
`failure`/`speed` pair additionally proves two different lenses' findings
about the same change stay distinct rather than colliding.

## Capability packs

Not built in this phase. The plan gates them on core workflows remaining
portable without them first ("Add stack- or domain-specific capability packs
only after core workflows remain portable without them"); no stack-specific
need has emerged yet, and adding one now would be speculative rather than
demand-driven. Deferred, not skipped — revisit once a concrete portability
gap is observed.

## Verification

- Per-lens suites: threat 7, tenancy 7, integrity 6, migrate 6, failure 8,
  speed 6, observe 6, recover 6, access 7, journey 7, compat 7 — 73 passed,
  0 failed across all eleven newly authored lenses.
- `validate-forge.mjs`'s generic per-lens structural checks (workflow file
  exists, escalates to a registered specialist, matches registry coverage,
  names its escalation target) pass for all twelve lenses, not just `exact`.
- Full `npm test`: passed, exit code 0.

## Process note

All eleven lens rewrites were authored by five parallel subagents in
isolated git worktrees (grouped by shared escalation target: threat+tenancy,
integrity+migrate, failure+speed+observe+recover, access+journey, compat
alone), each briefed with explicit scope boundaries against its siblings so
overlapping coverage would be a reviewable mistake rather than an
unconsidered default. Every worktree was diffed against every other lens
file before integration to confirm no cross-contamination; none was found.
Each batch was reverified against the full suite before being called done.

## Exit-gate decision

Phase 8 is accepted. Every lens has unique, non-overlapping coverage stated
explicitly against its siblings, produces evidence-backed findings bound to
the canonical finding identity and schema rather than free narrative, and
cannot silently expand into specialist ownership — each lens's own file
states what it cannot decide and where it must stop. This is an
authoring/contract checkpoint over synthetic, deterministic fixtures, not a
Phase 9 claim about review quality under held-out evaluation. Phase 0b
(freeze evaluation identities and execution protocol) is next in the
critical path, though Phase 9 itself remains gated on it.
