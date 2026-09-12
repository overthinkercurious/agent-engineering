# 0001 - Specialists are reference files, not installed skills

Date: 2026-09-11
Status: accepted

## Context

The suite is meant to carry a deep roster of domain specialists: database query
performance, tenancy and authorization, migration safety, bundle size, and so
on. Sixty to a hundred of them is the target.

The obvious packaging is one installed skill each. That makes every specialist
individually invocable, independently updatable, and visible in the tool's skill
list.

Two costs argue against it:

1. Skill metadata is always in context, roughly 100 words per skill. At eighty
   specialists that is close to 10k tokens loaded into every session before any
   work begins, whether or not a specialist is ever used.
2. A skill fires on its description. Eighty descriptions, each written to
   trigger reliably in its own domain, compete with each other. Precision drops
   as the roster grows, which is the opposite of what a deep roster is for.

## Decision

Install roughly eight skills: `ae-setup`, `ae-init`, `ae-orchestrate`, and the
stages. Specialists live as reference markdown under
`skills/ae-orchestrate/references/specialists/<domain>/<name>.md`, beside a
machine-readable `manifest.yml`.

The orchestrator filters the manifest deterministically on paths, signals and
risk tier, then reads only the selected specialist files.

## Consequences

- Always-on context stays roughly constant as the roster grows from three
  specialists to a hundred.
- A specialist is still addressable by name, through the orchestrator rather
  than directly.
- Specialists version with the orchestrator rather than independently. They
  already share a manifest, so this costs little.
- Reversible. Promoting a specialist to a standalone skill is a directory move
  plus a manifest entry, if one turns out to deserve its own trigger.

## Rejected

**All specialists installed as skills.** Rejected on the two costs above. If the
roster settles below about fifteen, this is worth revisiting.

**Split install with specialists opt-in.** Rejected because it makes the default
install incomplete and forces the documentation to explain two install paths.
