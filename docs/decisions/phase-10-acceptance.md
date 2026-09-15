# Phase 10 acceptance checkpoint

Date: 2026-09-15
Status: accepted as a Beta-quality release, not a Stable candidate

## Scope of this closure

Phase 10's exit gate reads: "Fresh-install acceptance passes, documentation
matches observed behavior, and one external repository completes the release
checklist without unpublished setup knowledge." The first two are met and
verified automatically. The third cannot be met here, because Phase 9 is
deferred ([`phase-0b-deferral.md`](phase-0b-deferral.md)) and the kit is built
for its maintainer's own use; external validation on a repository not used for
authoring is therefore an open item, not a passed one. This phase closes as a
**Beta-quality release** — usable, documented, and tested — and explicitly not
as a Stable candidate.

## Implemented behavior

### Fresh-install acceptance

`scripts/test-packaging.mjs` copies only the six entries of `package.json`'s
`files` array into a temporary directory — no `scripts/`, `docs/`,
`node_modules/`, or `.git/` — and proves the kit works from that copy alone:
the runner starts and reports usage; `validate.mjs` resolves its schema
directory and validates all 32 shipped schemas including every local `$ref`;
`lifecycle.mjs` builds a real run state, forcing the cross-file budget and
usage references; and every `ae-init` deterministic script (`scaffold.sh`,
`analyze.mjs`, `knowledge.mjs`, `rules.mjs`, `policy.mjs`, `doctor.sh`) runs
against a throwaway Git project, after which the installed `ae-forge` reads
that project — proving the two skills compose with no development checkout
present.

It also scans every shipped file under `skills/` for references that would
escape its skill directory (machine-absolute paths, relative climbs above the
skill root, unpackaged imports, `$AE/…` references to unshipped files) and
verifies all three plugin manifests reference only packaged paths and agree
with `package.json` and `kit-version.txt` on one version.

**No packaging defect was found**; no shipped file required a change. The scan
was mutation-tested against nine injected defects (cross-repo import, bare
dependency import, missing relative import, an above-root `resolve`, a
hardcoded absolute path, a markdown link out of the skill, an unshipped `$AE`
reference, a bad manifest path, a mismatched version) and reported every one,
so its green result is not vacuous.

### Documentation matching observed behavior

`README.md` was rewritten against the code. It had drifted materially: it
documented six of the sixteen shipped runner commands, omitted `verify`
entirely — the only source of command receipts in the system — and made no
mention of the host-adapter layer, so a reader could not have made the kit
perform model work at all. Four further contradictions were corrected: the
workspace tree omitted directories `start` actually creates; the state diagram
showed discovery as mandatory when `classified → definition` is legal; the
approval-invalidation description covered artifact edits but not base-commit,
ancestry, or policy-digest drift; and supported scope was implicit. It now also
documents the durability boundary of `.dev/work/`, budgets and execution tiers,
both model profiles, and secret handling.

`docs/DEVELOPMENT-KIT-PRD.md` section 17 was corrected. It prescribed fixed
per-role model classes ("use strongest models for … architecture, sensitive
specialist work … integrated final review"), which since Phase 5 has been a
second routing authority contradicting the resolved `model_profile` — a
`smaller-model-only` run refuses a strongest-class host outright regardless of
what the task appears to warrant. It now defers to the resolved profile and
states that registry `model` fields are hints that never override it.

`scripts/test-docs-consistency.mjs` prevents this class of drift from
returning: it asserts every dispatched runner command appears in the README,
that the README advertises no command the runner lacks, that every registered
specialist is named, that the Git-only scope and unevaluated status are stated
explicitly, that the PRD does not reassert fixed model-class routing, and that
neither shipped document contains an unmeasured comparative claim. It was
mutation-tested by removing the `verify` row from the README, which failed two
assertions as intended.

### Interface consistency

`doctor.sh` accepted the project root only positionally while `scaffold.sh`
used `--root`, so the flag a user would reasonably expect failed with a
confusing "not a directory: --root". It now accepts both forms; existing
positional callers are unaffected.

## Verification

- Packaging/clean-install suite: 38 passed, 0 failed (3 bash checks skip
  cleanly where bash is unavailable).
- Documentation consistency suite: 8 passed, 0 failed.
- Full `npm test`, including all prior phases' suites: passed, exit code 0.

## Open items, stated rather than closed

- **External validation** on a repository not used for authoring. For a
  single-maintainer kit this is satisfied by real use, not a synthetic
  checklist; it remains formally open.
- **Performance, cost, and model-capability characteristics** are unevaluated
  and no document claims otherwise. The capability matrix Phase 10 nominally
  owed is reduced to an honest statement of the one shipped adapter's observed
  limits: read-only, no model shell, host-measured tokens, monetary charge and
  cancellation acknowledgement unavailable.
- **Stable** is not claimed and cannot be until Phase 0b and Phase 9 complete.
- **Non-Git support** remains out of scope, enforced in code and documented.

## Exit-gate decision

Phase 10 is accepted as a Beta-quality release. A clean install built from only
the published files runs both skills end to end with no development checkout
present, the shipped documentation has been reconciled with the shipped
behavior and is now guarded against drift by an executable check, and the two
things the kit cannot honestly claim — measured performance and external
validation — are recorded as open rather than quietly asserted.
