---
name: ae-init
description: >
  Indexes a software project and creates durable repository knowledge and
  enforceable engineering rules for coding agents. Use when the user asks to
  initialize, index, analyze, onboard, document, or refresh a project for AI
  development. This setup is optional: ae-forge can work directly from the
  repository when no generated knowledge exists.
metadata:
  owns: "indexing a project and generating durable knowledge and rules"
---

# Initialize a project

Create reusable project context without turning setup into a prerequisite for
development. Run four stages:

| Stage | Command | Output |
|---|---|---|
| Scaffold | scripts/scaffold.sh | .dev directories, instruction pointers, ignores |
| Analyze | scripts/analyze.mjs | .dev/context/analysis.json |
| Knowledge | scripts/knowledge.mjs | .dev/knowledge |
| Rules | scripts/rules.mjs | .dev/rules |

Resolve the installed skill directory once:

    AE="${CLAUDE_SKILL_DIR:-}"
    [ -n "$AE" ] || for d in .claude/skills/ae-init .agents/skills/ae-init; do
      [ -f "$d/SKILL.md" ] && AE="$d" && break
    done

## 1. Scaffold

Run the dry run, then apply it:

    bash "$AE/scripts/scaffold.sh" --dry-run
    bash "$AE/scripts/scaffold.sh"

The scaffold preserves user content and writes only inside the project.

## 2. Analyze

Estimate the reading set, then run the deterministic analyzer:

    node "$AE/scripts/analyze.mjs" --estimate
    node "$AE/scripts/analyze.mjs"

Use --budget-tokens N for a different reading budget or --depth full when the
user explicitly wants complete indexing. Report high-signal files that did not
fit rather than implying they were inspected.

## 3. Generate knowledge

    node "$AE/scripts/knowledge.mjs"

Read references/stages/knowledge.md and fill the marked judgment slots from the
selected files. Preserve generated facts. Use INFERRED or UNKNOWN when the
repository does not establish an answer.

## 4. Generate rules

    node "$AE/scripts/rules.mjs"

Read references/stages/rules.md and add only rules backed by a command that can
fail when the rule is broken. Preferences with no enforcement mechanism belong
in ordinary project documentation, not the generated rules.

## Verify

    bash "$AE/scripts/doctor.sh"

Run the doctor last. Report generated knowledge, unanswered judgment slots,
coverage limitations, and the one useful next action. Do not block ordinary
Forge work merely because initialization is incomplete.

## Boundaries

- Never modify application code.
- Never write outside the project root.
- Never edit generated facts except through the generating script.
- Never present inferred information as observed.
