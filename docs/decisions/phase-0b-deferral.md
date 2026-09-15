# Phase 0b / Phase 9 deferral record

Date: 2026-09-15
Status: Phase 0b closed as partially frozen; Phase 9 deferred indefinitely

## Decision

The bounded comparative evaluation (Phase 9) and the remainder of its freeze
checkpoint (Phase 0b) are deferred. Implementation continues to Phase 10
(packaging, documentation, and release readiness) with its evaluation-dependent
deliverables explicitly scoped down rather than filled in with unmeasured
values.

## Why

The kit is being built for the maintainer's own use, not for distribution with
a performance pitch. The shipped `README.md` and `docs/DEVELOPMENT-KIT-PRD.md`
were checked and make **no comparative, cost, or smaller-model-equivalence
claims**, so no published statement currently depends on the measurement.

Phase 9 exists to substantiate exactly one kind of statement — "smaller-model
Forge matched frontier-model Forge's accepted-delivery quality at materially
lower total cost, on these models, this host, this date." Absent that
statement, sixty scored executions would consume real money and human grading
time to produce a deliberately provisional result (the plan itself concedes
fifteen observations per arm cannot establish equivalence) that the project
does not need. Daily use on real work is a cheaper and more relevant source of
signal for a single maintainer.

## What was decided before deferral

These Phase 0b choices are recorded so the work is not lost:

- **Evaluation repositories:** committed synthetic repositories, not real named
  third-party repositories. The plan permits this ("committed synthetic
  repositories are acceptable with their limits disclosed") and it avoids
  permission, licensing, and disclosure problems. The three held-out scenario
  families remain as planned — configuration precedence, cross-service
  integration/authorization, and payment idempotency/data recovery — and must
  be built as instances distinct from the Alpha
  (`scripts/fixtures/forge/config-precedence/`) and flagship
  (`scripts/fixtures/forge/payment-duplicate-charge/`) authoring fixtures.
- **Gemini Queen Core Contract v1 baseline:** not available to this project.
  The comparator arm is unresolved; it is neither snapshotted nor substituted.
  If it cannot be supplied with permission to snapshot, Phase 9 runs three
  configurations rather than four and must say so.
- **Monetary ceiling:** deliberately unset. This is a hard blocker on Phase 9
  starting; no scored run may begin until a ceiling is frozen.
- **Model identities:** deliberately unpinned. The runtime is model-agnostic by
  design — `forge.mjs` and `dispatch.mjs` hardcode no model, observe host
  capability per dispatch, and resolve `smaller-model-only` / `mixed` profiles
  from project policy. Pinning identities is meaningful only for a specific
  benchmark claim, which is what has been deferred. Phase 4's authoring trace
  used `gpt-5.6-luna` and `gpt-6-astra` through the read-only Codex adapter;
  that is a historical record of one exercise, not a supported-model list.

## Consequences

- No Stable release claim. Phase 10 delivers a usable, documented kit whose
  host/model capability matrix and cost guidance are marked **unevaluated**,
  not estimated.
- No performance, cost, or model-equivalence claim may appear in the README,
  PRD, skill descriptions, or marketplace manifests. Adding one later requires
  completing Phase 0b and Phase 9 first, in that order.
- The Phase 0a success formulas, margins, and accounting rules remain frozen
  and unmodified. They were ratified before any pilot outcome existed and must
  not be renegotiated if evaluation later resumes — that ordering is the entire
  reason the checkpoint was split from the evaluation.

## Reversal condition

To resume, reopen Phase 0b and close its three open items: a frozen monetary
ceiling, a decision on the Queen comparator (supply it or formally drop to
three arms), and a pinned smaller/frontier model pair available on the
evaluation host. Then build the three held-out synthetic cases, the harness
(`scripts/test-evaluation.mjs`), and the versioned manifest
(`docs/evaluation/release-manifest.json`) before any scored execution.
