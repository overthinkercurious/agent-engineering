---
name: ae-init
description: >
  Indexes a project and writes its knowledge base: what the stack is, how to
  run and test it, how it is shaped, where the risk sits, and which rules the
  project can actually enforce. Use this whenever the user asks to init,
  initialize, index, analyze, onboard, set up or document a project for AI use,
  asks to generate project rules, standards or conventions, or asks what this
  codebase does or how it is structured - and also whenever agent-engineering
  is mentioned in a project that has no .dev/knowledge/ directory yet, even if
  they do not explicitly ask for it.
metadata:
  owns: "indexing a project and generating its knowledge, rules, and operating policy"
---

# Initialize a project

Five stages. Each has one owner, reads what the previous stage wrote, and
produces exactly one artifact.

| # | Stage | Owner | Artifact |
|---|---|---|---|
| 1 | Scaffold | `scripts/scaffold.sh` | `.dev/`, pointer blocks, `.gitignore` |
| 2 | Analyze | `scripts/analyze.mjs` | `.dev/context/analysis.json` |
| 3 | Knowledge | `scripts/knowledge.mjs` + you | `.dev/knowledge/*.md` |
| 4 | Rules | `scripts/rules.mjs` + you | `.dev/rules/*.md` |
| 5 | Policy | `scripts/policy.mjs` + you | `.dev/policy/*.yml` |
| — | Verify | `scripts/doctor.sh` | an exit code |

Stages 1 and 2 are fully deterministic — no judgment, so do not add any.
Stages 3 through 5 are half deterministic: a script writes the evidence-backed
defaults, you write the judgment into the slots it leaves. **Never edit the
facts.**

If `.dev/knowledge/` already exists, this is a re-run. Every stage is
idempotent, so say what changed rather than announcing a fresh install.

## Locate the kit

Every command below needs the skill's own directory. Claude Code sets
`CLAUDE_SKILL_DIR`; other tools do not, so resolve it with a fallback and reuse
`$AE` throughout:

```bash
AE="${CLAUDE_SKILL_DIR:-}"
[ -n "$AE" ] || for d in .claude/skills/ae-init .agents/skills/ae-init; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
[ -n "$AE" ] || echo "cannot find the ae-init skill directory"
```

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
node "$AE/scripts/analyze.mjs" --estimate
```

This parses every file and costs nothing. It reports how many files it would
have you read, roughly how many tokens that is, and what share of import
fan-in, routes and risk-flagged files that covers. **Show the user that report
and let them decide before running the real pass.**

```bash
node "$AE/scripts/analyze.mjs"
```

Options: `--budget-tokens N` to change the reading budget, `--depth full` to
select every code file regardless of budget, `--root DIR` for another directory.

If it warns that high-signal files did not fit the budget, say so plainly and
ask before continuing. Never quietly analyze less than the user thinks you did.

## Stage 3 — Knowledge

```bash
node "$AE/scripts/knowledge.mjs"
```

This writes the factual half of `.dev/knowledge/` straight from
`analysis.json` — languages, dependencies, commands, routes, fan-in rankings,
risk surfaces, coverage. None of it can be wrong, because none of it was
guessed.

Then do your half. Read `references/stages/knowledge.md` and follow it. In
short: read exactly the files in `selection.files`, then answer each
`TODO (judgment)` slot in place, inside the managed block.

## Stage 4 — Rules

```bash
node "$AE/scripts/rules.mjs"
```

This derives the rules whose enforcement already exists in the project. Then
read `references/stages/rules.md` and add the stack-specific ones, under a
single admission test: **a rule is admitted only if it names a command that
fails when the rule is broken.**

## Stage 5 — Policy

```bash
node "$AE/scripts/policy.mjs"
```

This derives conservative authority boundaries, executable quality gates,
routing signals, and release requirements from the analysis. Then read
`references/stages/policy.md` and fill only its `TODO (judgment)` values. The
policy is the committed operating contract that `ae-forge` reads on every run.
Show the unresolved decisions to the user. If they explicitly accept the safe
defaults instead of providing project-specific answers, run `policy.mjs` again
with `--confirm-conservative`. Never apply that confirmation flag implicitly.

## Verify

```bash
bash "$AE/scripts/doctor.sh"
```

Non-zero means something is missing, and it says which thing. Run it last,
every time, and show the user the result. Do not report success on your own
assessment when an exit code is available.

## Report

Close with what exists now, what is still a `TODO (judgment)` slot, and the one
next action. If anything was skipped — budget, unreadable files, a stage that
failed — say so explicitly rather than letting the artifacts imply
completeness.

## Hard stops

- Never edit inside a generated block except to fill a `TODO (judgment)` slot.
- Never write outside the project root.
- Never modify application code. This skill reads and documents; it does not fix.
- Never present an inferred claim as verified. Mark anything derived rather than
  read as `INFERRED`, and write `UNKNOWN` when the evidence does not support an
  answer. A knowledge base that is confidently wrong is worse than none, because
  everything downstream trusts it.
