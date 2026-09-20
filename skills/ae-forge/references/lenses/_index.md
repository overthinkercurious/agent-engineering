# Lens catalog

A lens adds domain depth to a role that the generic role files cannot own
generically — platform, protocol, or standard-specific constraints. It never
replaces a role's exclusive ownership; it narrows what that role must check
within its own boundary.

Selection is `team.md`'s job, driven by `team.json`'s `lenses` block. This
file just lists what exists and what's still backlog, so a role or Forge can
tell a real gap ("this signal fired but nothing covers it yet") from a normal
"no lens applies" run.

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

Kept deliberately short. A backlog exists to flag domains where *absence is
itself a risk worth announcing* — not to enumerate every domain that could one
day have a lens. A long backlog mostly announces absence, which is why this
one is down to the single domain where a silent gap would be dangerous.

`payments`.

A signal naming one of these fires `LENS UNAVAILABLE` (see `team.md`) until
it is written. That is not a bug — it is the mechanism that stops a role
inventing expertise it has no checked source for.
