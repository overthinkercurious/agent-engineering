---
name: ae-setup
description: >
  Sets up the agent-engineering development suite in a project and builds its
  knowledge base: scaffolds .dev/, ENGINEERING.md and the instruction-file
  pointers, analyzes every file in the codebase, then writes the project's
  knowledge documents and enforceable rules. Use this whenever the user asks to
  set up, install, initialize, bootstrap, onboard, index, analyze or document a
  project for AI use, asks to generate project rules, standards or conventions,
  asks what this codebase does or how it is structured - and also whenever
  agent-engineering is mentioned in a project with no .dev/ directory, or the
  project has .dev/ but no .dev/knowledge/, even if they do not explicitly ask.
owns: installing the suite and generating a project's knowledge base and rules
---

# Set up agent-engineering

One command, four stages. Each stage has one owner, reads what the previous
stage wrote, and produces exactly one artifact. Run them in order.

| # | Stage | Owner | Artifact |
|---|---|---|---|
| 1 | Scaffold | `scripts/scaffold.sh` | `.dev/`, `ENGINEERING.md`, pointer blocks, `.gitignore` |
| 2 | Analyze | `scripts/analyze.mjs` | `.dev/context/analysis.json` |
| 3 | Knowledge | `scripts/knowledge.mjs` + you | `.dev/knowledge/*.md` |
| 4 | Rules | `scripts/rules.mjs` + you | `.dev/rules/*.md` |
| — | Verify | `scripts/doctor.sh` | an exit code |

Stages 1 and 2 are fully deterministic — no judgment, so do not add any.
Stages 3 and 4 are half deterministic: a script writes the facts, you write the
judgment into the slots it leaves. Never edit the facts.

If the project already has `.dev/knowledge/`, this is a re-run. Every stage is
idempotent, so say what changed rather than announcing a fresh install.

## Locate the kit

Everything below needs the skill's own directory. Claude Code sets
`CLAUDE_SKILL_DIR`; other tools do not, so resolve it with a fallback:

```bash
AE="${CLAUDE_SKILL_DIR:-}"
[ -n "$AE" ] || for d in .claude/skills/ae-setup .agents/skills/ae-setup; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
[ -n "$AE" ] || echo "cannot find the ae-setup skill directory"
```

After stage 1 the kit is copied to `.dev/kit/`, so stages 2 to 4 run from
there and no longer depend on this.

## Stage 1 — Scaffold

```bash
bash "$AE/scripts/scaffold.sh" --dry-run   # show the plan
bash "$AE/scripts/scaffold.sh"             # apply it
```

Show the user the dry run before applying it. The script is create-if-absent
and write-between-markers throughout, so it will not touch anything it did not
write. Report what it created, updated and left alone.

## Stage 2 — Analyze

Estimate before spending anything:

```bash
node .dev/kit/scripts/analyze.mjs --estimate
```

This parses every file and costs nothing. It reports how many files it would
have you read, roughly how many tokens that is, and what share of import
fan-in, routes and risk-flagged files that covers. **Show the user that report
and let them decide before running the real pass.**

```bash
node .dev/kit/scripts/analyze.mjs
```

Options: `--budget-tokens N` to change the reading budget, `--depth full` to
select every code file regardless of budget, `--root DIR` for another directory.

If it warns that high-signal files did not fit the budget, say so plainly and
ask before continuing. Never quietly analyze less than the user thinks you did.

## Stage 3 — Knowledge

```bash
node .dev/kit/scripts/knowledge.mjs
```

This writes the factual half of `.dev/knowledge/` straight from
`analysis.json` — languages, dependencies, commands, routes, fan-in rankings,
risk surfaces, coverage. None of it can be wrong, because none of it was
guessed.

Then do your half. Read `references/stages/3-knowledge.md` and follow it.
In short: read exactly the files in `selection.files`, then answer each
`TODO (judgment)` slot in place, inside the managed block.

## Stage 4 — Rules

```bash
node .dev/kit/scripts/rules.mjs
```

This derives the rules whose enforcement already exists in the project and
writes `.dev/rules/`. Then read `references/stages/4-rules.md` and add the
stack-specific rules, under one admission test: **a rule is admitted only if
it names a command that fails when the rule is broken.**

## Verify

```bash
bash .dev/kit/scripts/doctor.sh
```

Non-zero means something is missing or stale, and it says which thing. Run it
last, every time, and show the user the result. Do not report success on your
own assessment when an exit code is available.

## Report

Close with what exists now, what is still a `TODO (judgment)` slot, and the one
next action. If anything was skipped — budget, unreadable files, a stage that
failed — say so explicitly rather than letting the artifact imply completeness.

## Hard stops

- Never overwrite `ENGINEERING.md`. It is human-owned, at any version, for any reason.
- Never edit inside a generated block except to fill a `TODO (judgment)` slot.
- Never write outside the project root.
- Never modify application code. This skill reads and documents; it does not fix.
- Never present an inferred claim as verified. Mark anything derived rather than
  read as `INFERRED`, and write `UNKNOWN` when the evidence does not support an
  answer. A knowledge base that is confidently wrong is worse than none.
