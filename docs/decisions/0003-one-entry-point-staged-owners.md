# 0003 — One entry point, staged owners

Status: accepted
Date: 2026-09-12

## Context

Setup was two skills: `ae-setup` scaffolded the project and `ae-init` analyzed
it. Both had descriptions written to fire on overlapping sentences — "set up",
"initialize", "onboard", "index this project" — because in practice a user
asking for any one of those wants all of it.

That produced three problems.

1. **Trigger competition.** Two skills whose descriptions both claim
   "initialize a project" is a coin flip, and the loser leaves the user with a
   half-installed kit. Skill metadata is always in context, so both
   descriptions were also always paying rent.
2. **A chain with no owner.** Analysis is useless without scaffolding first
   (it writes into `.dev/context/`), and the knowledge base is useless without
   analysis. Nothing enforced the order except the user knowing to ask twice.
3. **`CONTRIBUTING.md` forbids the obvious fix.** "No skill invokes another
   skill" exists for good reasons — cycles, untracked context growth, no budget
   enforcement — so `ae-setup` could not simply call `ae-init`.

A third copy of the setup skill, `agent-engineering-setup`, had also survived a
rename and was still shipping. It failed the repo's own validator, broke
`npm test`, and `sync-version.sh` was writing the version file into it rather
than into the live skill.

## Decision

One installed skill, `ae-setup`, whose body is a four-stage chain. Each stage
has exactly one owner and writes exactly one artifact.

| # | Stage | Owner | Artifact |
|---|---|---|---|
| 1 | Scaffold | `scripts/scaffold.sh` | `.dev/`, `ENGINEERING.md`, pointers |
| 2 | Analyze | `scripts/analyze.mjs` | `.dev/context/analysis.json` |
| 3 | Knowledge | `scripts/knowledge.mjs` + `references/stages/3-knowledge.md` | `.dev/knowledge/*.md` |
| 4 | Rules | `scripts/rules.mjs` + `references/stages/4-rules.md` | `.dev/rules/*.md` |

The owners are **scripts and reference files, not skills**. That keeps the
no-skill-invokes-a-skill rule intact while still giving the chain real
delegation, and it is the same argument as decision 0001: a reference file
costs nothing until something reads it, whereas a skill costs context in every
session whether or not it fires.

Stages 3 and 4 are split down the middle. The script emits every fact it can
extract from `analysis.json`; the model fills only the slots marked
`TODO (judgment)`. Facts and judgment are separated in the output, so a reader
can tell which is which.

## Consequences

- One sentence — "set up agent-engineering" — runs the whole pipeline. There is
  nothing for a user to know about ordering.
- Adding a stage is a script plus a reference file plus a row in the table. It
  is not a new skill, so it does not enlarge the always-in-context surface.
- Stage 3 and 4 output cannot be confidently wrong about facts, because the
  model never writes them. The failure mode is a blank judgment slot, which is
  visible, rather than a plausible fabrication, which is not.
- Re-running is safe: every artifact uses the same managed-block convention as
  `lib.sh`, so regeneration replaces the block and preserves anything written
  around it.
- The cost is one long SKILL.md instead of two short ones. It stays under the
  500-line validator limit, and the detail that would have bloated it lives in
  `references/stages/` and is read only when that stage runs.

## Rejected

**Keep two skills and sharpen the descriptions.** Tried in effect; the
overlapping vocabulary is inherent, because a user asking to "initialize" a
project genuinely means both things.

**Let `ae-setup` invoke `ae-init`.** Forbidden by `CONTRIBUTING.md`, and the
reasons hold here: there would be no budget enforcement across the boundary and
no audit trail of what the second skill did.

**One monolithic script.** Rejected because stages 3 and 4 need model judgment
that a script cannot supply, and because a single 1,500-line script has no
seam at which to resume after a failure.
