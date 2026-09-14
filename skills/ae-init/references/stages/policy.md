# Stage 5 — Project policy

Owner of `.dev/policy/`. Run after knowledge and rules exist.

`policy.mjs` has written conservative defaults and the commands and risk signals
that analysis supports. Fill only `TODO (judgment)` values. Preserve generated
observations and restrictions.

Each policy records the analysis input digest and provenance for its judgment
fields. Regeneration preserves completed decisions and refreshes generated
observations. Conflicting managed markers fail instead of guessing ownership.

Determine product maturity, change tolerance, any additional delegated actions,
required user journeys, non-functional budgets, concerns that always need a
specialist, the preview command, and realistic recovery behavior.

Prefer project documentation, deployment configuration, and explicit user
decisions. Mark unsupported conclusions `UNKNOWN`. Never infer permission for
external access, spending, destructive work, or production deployment.

This policy is committed and applies to future ae-forge runs. Keep it narrow:
preferences that cannot change routing, authority, or verification do not
belong here.

If the user does not have project-specific answers, explain the conservative
defaults and ask once whether to accept them. Only after explicit acceptance,
run `policy.mjs --confirm-conservative`. That action resolves the material
slots without granting network, spending, destructive work, or production
deployment authority.
