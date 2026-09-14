# Phase 1 acceptance record

Record ID: `phase-1-contracts-v1`  
Date: 2026-09-13  
Disposition: **PASS**  
Dependency: `phase-0a-contract-v1`

## Implemented scope

- Shipped `AE Schema Subset 1` validator with contained local references,
  unsupported-keyword rejection, runtime instance validation, semantic result
  checks, and canonical finding identity/deduplication.
- Added schemas for registry, project policies, effective policy, usage,
  budgets, context packets, bounded task briefs, command receipts, approval
  receipts, specialist results, findings, feature manifests, and run state.
- Shipped `AE YAML Subset 1` parser and minimal effective-policy compiler with
  duplicate-key rejection, source digests, leaf provenance, conservative
  defaults, material-judgment readiness, and source-revision agreement.
- Centralized lifecycle vocabulary and transitions at run-state schema v2,
  including paused/terminal states and the mandatory repair return through
  implementation.
- Added specialist and lens templates. Probe and Exact are the first complete
  instances, including valid, misleading, and missing-input examples.
- Added the committed Alpha precedence defect, direct/wrapper callers, hidden
  behavioral regression, and prototype/critical policy variants.
- Updated Forge read/write boundaries for registry, manifest, state, approval,
  and budget validation. Zero-usage state v1 migrates; ambiguous nonzero token
  aggregates halt rather than being relabeled.

## Exit-gate evidence

| Exit requirement | Named evidence |
|---|---|
| Same shipped validator accepts/rejects machine artifacts | `scripts/test-contracts.mjs`: valid/invalid findings, specialist results, packets, briefs, receipts, policies, budgets, and schemas |
| Local reference resolution and unsupported keywords | `schema.escape.json`, `schema.unsupported.json`, and Phase 1 contract acceptance |
| Templates cannot drift from registry ownership/coverage | `scripts/validate-forge.mjs` ownership, coverage, escalation, template-section, and schema checks |
| All states and forbidden transitions enumerated | `transitions.json` and exhaustive state-pair assertion |
| Policy syntax and stale/incomplete inputs fail safely | strict YAML duplicate, malformed, unsupported, unknown-field, unresolved-judgment, and revision-disagreement assertions |
| Alpha seed is behaviorally meaningful | regression fails on seeded resolver and passes on the intended shared-helper repair |

## Verification result

The canonical `npm test` gate passed on 2026-09-13 through Git Bash with a
native Windows `TMPDIR`:

- suite and package validation: pass;
- Phase 1 contract acceptance: 35 passed, 0 failed;
- scaffold acceptance: 70 assertions passed;
- artifact acceptance: 80 assertions passed;
- Forge acceptance: 29 assertions passed.

No model-backed development fixture was invoked, so this phase consumed USD 0
of the Phase 0a metered development ceiling. Subscription usage is not
converted into a cost claim.

## Review disposition

The first adversarial run exposed four lens/registry wording mismatches and a
Windows sandbox dependency in the fixture test. Coverage wording was aligned
to the registry, and the fixture now exercises direct and wrapper behavior in
process. Assertions were preserved; no gate was removed or weakened.

Phase 2 may begin. Phase 3 and later remain gated.
