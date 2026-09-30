# Lens catalog

A lens adds domain depth to a role that the generic role files cannot own
generically — platform, protocol, or standard-specific constraints. It never
replaces a role's exclusive ownership; it narrows what that role must check
within its own boundary.

Selection is mechanical and change-aware. `lens-select.mjs` reads Forge's
fresh analyzer output and derives domain tags from repository dependencies. When the
request names a domain, it takes precedence and unrelated project-only tags
remain visible without attaching their lenses. Otherwise the detected stack
supplies domain depth. `--domain`, `--risk`, and `--kind` describe this change.

Three outputs matter besides the attachments: `unavailable` (a domain fired
but no lens exists yet), `stale` (an attached lens is past its review date),
and `assessed: false` (no domain input at all — not the same as "nothing
applies"). `scripts/validate-kit.mjs` proves every tag a detector can emit is
handled by a lens, a role signal, or a backlog entry, so a detected domain
can never be silently ignored.

## Built

| Lens | File | Attaches to | Owns |
|---|---|---|---|
| `android` | `lenses/android.md` | architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Android/Kotlin platform behavior: lifecycle, background limits, permissions, build/release config |
| `ui-finish` | `lenses/ui-finish.md` | experience, architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Visual craft and design-system depth: layout composition, spacing/typography scale, component consistency, interaction-state visual polish |
| `accessibility` | `lenses/accessibility.md` | experience, verifier, builder, plan-reviewer, plan-challenger, auditor | WCAG conformance depth: keyboard operability, name/role/state exposure, reflow and zoom, user-preference modes, and the AA thresholds themselves |
| `secrets-hygiene` | `lenses/secrets-hygiene.md` | security, builder, verifier, architect, reliability, plan-reviewer, plan-challenger, auditor | Credential lifecycle: origin, transport, accidental persistence in logs or history, rotation, fail-closed behaviour |
| `web-performance` | `lenses/web-performance.md` | reliability, experience, builder, plan-reviewer, plan-challenger, auditor | Field metrics and thresholds: which metric describes the problem, what counts as good, what a measurement must control for |
| `database-performance` | `lenses/database-performance.md` | data, architect, reliability, plan-reviewer, plan-challenger, auditor | Access paths, lock behaviour and volume: what the planner does, what a migration locks, how both behave at real row counts |
| `api-platform` | `lenses/api-platform.md` | architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Contract evolution: what a published interface promises, which changes break it, how a change reaches existing callers |
| `test-automation` | `lenses/test-automation.md` | builder, verifier, reliability, plan-reviewer, plan-challenger, auditor | Whether a passing test is evidence: fails for the right reason, covers real risk, stays deterministic, reports honestly |
| `ai-llm` | `lenses/ai-llm.md` | security, architect, reliability, builder, experience, verifier, plan-reviewer, plan-challenger, auditor | Model-backed features and agents: untrusted model output, excessive agency, retrieval scoping, cost and loop ceilings |
| `payments` | `lenses/payments.md` | security, data, reliability, builder, plan-reviewer, plan-challenger, auditor | Money movement: exactly-once intent, exact amounts, append-only records, reconciliation and refunds |
| `observability` | `lenses/observability.md` | reliability, architect, builder, plan-reviewer, plan-challenger, auditor | Operator visibility: detectable, attributable, affordable, actionable |
| `ios` | `lenses/ios.md` | architect, builder, verifier, security, experience, plan-reviewer, plan-challenger, auditor | Apple platform: lifecycle and background limits, permission declarations, interface conventions, review constraints |
| `infrastructure` | `lenses/infrastructure.md` | architect, reliability, builder, security, plan-reviewer, plan-challenger, auditor | Declared environment: what an apply really does, safe rollout, rollback, pipeline trust |
| `privacy` | `lenses/privacy.md` | security, data, product, experience, plan-reviewer, plan-challenger, auditor | Personal data: justified collection, every destination, enforced retention and deletion, data-subject requests |
| `identity-auth` | `lenses/identity-auth.md` | security, architect, builder, experience, verifier, plan-reviewer, plan-challenger, auditor | How a caller proves who they are and for how long: flow choice, token validation, session lifetime, revocation, account linking |
| `queue-messaging` | `lenses/queue-messaging.md` | reliability, data, architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Asynchronous delivery: what arrives twice, what arrives out of order, and what happens to a message nobody can process |
| `caching` | `lenses/caching.md` | reliability, data, architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Deliberate staleness: how wrong a cached answer may be, to whom, and what happens when every entry expires at once |
| `release-engineering` | `lenses/release-engineering.md` | reliability, architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Reaching users and taking it back: versioning, rollout shape, feature flags, rollback as distinct from revert |
| `i18n` | `lenses/i18n.md` | experience, builder, architect, verifier, plan-reviewer, plan-challenger, auditor | Locale correctness: translatable messages, plural rules, locale-aware formatting and collation, timezone boundaries, layout direction |
| `compliance` | `lenses/compliance.md` | security, data, architect, builder, verifier, plan-reviewer, plan-challenger, auditor | Control frameworks and their evidence: scope, audit-trail content and integrity, attributable privileged action |

## Dated specifics, not durable method

A role file holds the reasoning procedure, which does not rot. A lens holds
what does: thresholds, standard versions, named criteria, current metric
names. Any lens carrying such a fact declares its source and date:

```yaml
standard: WCAG 2.2 (W3C Recommendation, October 2023)
verified: "2026-09-20 w3.org/TR/WCAG22/"
review_after: "2027-09-20"
```

Past `review_after`, record `LENS STALE` alongside `LENS UNAVAILABLE` and
re-verify before quoting the number. This provenance discipline exists
because the opposite failure is silent: a lens that confidently
cites a superseded threshold is worse than a lens that admits it is old.

The project always outranks a lens. Where the repository declares its own
target size, contrast ratio, or supported width, the project's value wins and
the lens records the difference.

## Backlog (named, not yet written)

`realtime`, `collaborative-editing`, `search-relevance`.

A backlog exists to flag domains where *absence is itself a risk worth
announcing* — not to enumerate every domain that could one day have a lens.
The entries that previously stood here (`internationalization`, `i18n`,
`queue`) are now written; these three replaced them because a role asked about
presence, conflict resolution or ranking quality with no checked source would
improvise confidently, which is the failure this list prevents.

When a detector emits a tag nothing handles, `scripts/validate-kit.mjs` fails: a
domain the kit can detect in a project and then silently ignore is the exact
failure this system exists to prevent. So a new backlog entry is how you
announce a gap deliberately, and an empty backlog means every domain the kit
can currently detect has somewhere to go.

A signal naming a backlog entry fires `LENS UNAVAILABLE` (see `team.md`) until
it is written. That is not a bug — it is the mechanism that stops a role
inventing expertise it has no checked source for.
