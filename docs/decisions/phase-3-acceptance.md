# Phase 3 acceptance record

Date: 2026-09-13  
Status: accepted

## Implemented behavior

- Initialization outputs are bounded to the project root and malformed or
  conflicting managed markers fail without rewriting user content.
- Knowledge and rule judgment slots have stable identities. Completed answers
  survive regeneration while generated evidence refreshes.
- Policy generation records its analysis digest and per-field provenance,
  preserves completed project decisions and runtime adaptations, and exposes
  unresolved decisions instead of guessing.
- `--confirm-conservative` provides the Phase 0a confirmation path. The public
  skill requires explicit user acceptance before it is used.
- Conservative generated policy now contains real runtime authority, routing,
  budget, evidence, and release inputs consumable by Forge.
- Doctor reports unanswered policy decisions and policy generated from stale
  analysis.

## Adversarial review

The initial implementation revealed two refresh defects: test-only output paths
did not obey the repository's no-escape invariant, and confirmed policy
provenance changed once on the next regeneration. The fixtures were moved
inside their project roots and confirmation provenance is now stable across
repeated runs. A quoting failure in the preservation fixture was also corrected
before acceptance.

## Verification

- Initialization/artifact suite: 96 passed, 0 failed.
- Scaffold/host suite: 70 passed, 0 failed.
- Forge suite: 86 passed, 0 failed.
- Contract suite: 35 passed, 0 failed.
- `skill-creator` validation: `ae-init` and `ae-forge` both valid.
- Full `npm test`: passed with exit code 0.
- Development model/API spend: $0.

## Exit decision

Accepted. Repeated initialization is attributable and preserves project-owned
adaptation; refreshed facts invalidate stale Forge policy instead of being
silently reused.
