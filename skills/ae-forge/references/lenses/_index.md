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

## Backlog (named, not yet written)

`ios`, `mobile-release`, `internationalization`, `cloud-security`,
`identity-access`, `ai-generated-code-audit`, `secrets-hygiene`,
`compliance`, `privacy`, `database-performance`, `database-reliability`,
`payments`, `accessibility`, `data-visualization`,
`realtime-collaboration`, `sre-observability`, `finops`, `release-pipeline`,
`test-automation`, `api-platform`, `multi-agent-architecture`,
`prompt-engineering`, `rag-pipeline`, `mcp-builder`, `technical-writing`,
`developer-tooling`.

A signal in `team.json` that names a backlog lens is expected to fire
`LENS UNAVAILABLE` (see `team.md`) until that lens is written. That is not a
bug — it is the mechanism that stops a role from inventing expertise it
doesn't have a checked source for.
