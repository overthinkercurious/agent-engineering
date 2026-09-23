# Lens catalog

A lens adds domain depth to a role that the generic role files cannot own
generically — platform, protocol, or standard-specific constraints. It never
replaces a role's exclusive ownership; it narrows what that role must check
within its own boundary.

Selection is mechanical and project-driven. `lens-select.mjs` reads the
survey's sensor dump and derives domain tags from what is actually in the
repository — a React dependency attaches the web-performance and accessibility
lenses whether or not anyone thought to ask. Supplied `--domain` words are
merged on top, never required.

Three outputs matter besides the attachments: `unavailable` (a domain fired
but no lens exists yet), `stale` (an attached lens is past its review date),
and `assessed: false` (no domain input at all — not the same as "nothing
applies"). `validate-forge.mjs` proves every tag a detector can emit is
handled by a lens, a role signal, or a backlog entry, so a detected domain
can never be silently ignored.

## Built

| Lens | File | Attaches to | Owns |
|---|---|---|---|
| `android` | `lenses/android.md` | architect, builder, verifier | Android/Kotlin platform behavior: lifecycle, background limits, permissions, build/release config |
| `ui-finish` | `lenses/ui-finish.md` | experience, architect, builder | Visual craft and design-system depth: layout composition, spacing/typography scale, component consistency, interaction-state visual polish |
| `accessibility` | `lenses/accessibility.md` | experience, verifier, builder | WCAG conformance depth: keyboard operability, name/role/state exposure, reflow and zoom, user-preference modes, and the AA thresholds themselves |
| `secrets-hygiene` | `lenses/secrets-hygiene.md` | security, builder, verifier | Credential lifecycle: origin, transport, accidental persistence in logs or history, rotation, fail-closed behaviour |
| `web-performance` | `lenses/web-performance.md` | reliability, experience, builder | Field metrics and thresholds: which metric describes the problem, what counts as good, what a measurement must control for |
| `database-performance` | `lenses/database-performance.md` | data, architect, reliability | Access paths, lock behaviour and volume: what the planner does, what a migration locks, how both behave at real row counts |
| `api-platform` | `lenses/api-platform.md` | architect, builder, verifier | Contract evolution: what a published interface promises, which changes break it, how a change reaches existing callers |
| `test-automation` | `lenses/test-automation.md` | builder, verifier | Whether a passing test is evidence: fails for the right reason, covers real risk, stays deterministic, reports honestly |
| `ai-llm` | `lenses/ai-llm.md` | security, architect, reliability, builder | Model-backed features and agents: untrusted model output, excessive agency, retrieval scoping, cost and loop ceilings |
| `payments` | `lenses/payments.md` | security, data, reliability, builder | Money movement: exactly-once intent, exact amounts, append-only records, reconciliation and refunds |
| `observability` | `lenses/observability.md` | reliability, architect, builder | Operator visibility: detectable, attributable, affordable, actionable |
| `ios` | `lenses/ios.md` | architect, builder, verifier | Apple platform: lifecycle and background limits, permission declarations, interface conventions, review constraints |
| `infrastructure` | `lenses/infrastructure.md` | architect, reliability, builder | Declared environment: what an apply really does, safe rollout, rollback, pipeline trust |
| `privacy` | `lenses/privacy.md` | security, data, product | Personal data: justified collection, every destination, enforced retention and deletion, data-subject requests |
| `identity-auth` | `lenses/identity-auth.md` | security, architect, builder, experience | How a caller proves who they are and for how long: flow choice, token validation, session lifetime, revocation, account linking |
| `queue-messaging` | `lenses/queue-messaging.md` | reliability, data, architect, builder | Asynchronous delivery: what arrives twice, what arrives out of order, and what happens to a message nobody can process |
| `caching` | `lenses/caching.md` | reliability, data, architect, builder | Deliberate staleness: how wrong a cached answer may be, to whom, and what happens when every entry expires at once |
| `release-engineering` | `lenses/release-engineering.md` | reliability, architect, builder | Reaching users and taking it back: versioning, rollout shape, feature flags, rollback as distinct from revert |
| `i18n` | `lenses/i18n.md` | experience, builder, architect | Locale correctness: translatable messages, plural rules, locale-aware formatting and collation, timezone boundaries, layout direction |
| `compliance` | `lenses/compliance.md` | security, data, architect | Control frameworks and their evidence: scope, audit-trail content and integrity, attributable privileged action |

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
re-verify before quoting the number. This is the same provenance discipline
`ae-surveyor`'s `targets.yml` uses for tool paths, applied to domain facts,
and it exists because the opposite failure is silent: a lens that confidently
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

When a detector emits a tag nothing handles, `validate-forge.mjs` fails: a
domain the kit can detect in a project and then silently ignore is the exact
failure this system exists to prevent. So a new backlog entry is how you
announce a gap deliberately, and an empty backlog means every domain the kit
can currently detect has somewhere to go.

A signal naming a backlog entry fires `LENS UNAVAILABLE` (see `team.md`) until
it is written. That is not a bug — it is the mechanism that stops a role
inventing expertise it has no checked source for.
