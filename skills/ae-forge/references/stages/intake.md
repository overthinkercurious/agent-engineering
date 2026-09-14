# Intake

Own `intent.md` and `manifest.json` until classification is complete.

## Read

- The user's request and explicit constraints.
- `.dev/knowledge/05-product.md` when present.
- The knowledge index and only the documents it routes for this request.
- `.dev/policy/authority.yml` and `.dev/policy/routing.yml` when present.

## Produce

Write a compact intent containing the actor, situation, desired outcome,
observable success, constraints, non-goals, known evidence, assumptions, and
unknowns. Preserve the user's words for requirements whose exact meaning
matters.

Classify the run and record behavior or risk signals. Signals describe the work
(`ui`, `auth`, `migration`, `external`) rather than merely copying filenames.
Use the runner's routing result as a proposal; add or remove a specialist only
with a recorded evidence-based reason.

The runner records blast radius, irreversibility, data/security sensitivity,
uncertainty, cross-system scope, the project-policy floor, and any user
override in `context/risk-assessment.json`. Explicit dimensions may raise but
never lower inferred risk. `light`, `standard`, and `deep` control rigor; they
do not weaken approval or independent verification required for delivery.

## Ready

Intake is ready when another specialist can explain whose outcome matters, what
must become true, what is excluded, and which uncertainty requires discovery.
Missing product evidence sends an idea to discovery; it does not force the user
to invent certainty.
