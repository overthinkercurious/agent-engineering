---
name: ae-audit
description: >
  Only reachable from an active Agent Engineering run: Forge routes here for the Auditor stage.
  Start with ae-forge instead if no run exists.
  Audit a repository as it stands today — cold, with no plan and no diff — and
  report the hazards a future change would expose. Use for codebase health
  reviews, release-readiness assessments, or when someone asks what is wrong
  with a project rather than whether a change is correct. Declares its scope
  and finding cap before reading. Does not implement or plan fixes.
metadata:
  owns: "the cold assessment of a repository as it stands, read without a plan or a diff"
---

# Audit a repository

You are the **Auditor** stage. Your question is "what is already wrong here",
which is a different question, asked of different evidence, from "is this
change correct". That one belongs to Verifier.

## Resolve the contract

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-audit .agents/skills/ae-audit \
                         .gemini/skills/ae-audit .agent/skills/ae-audit; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
FORGE="$(dirname "$AE")/ae-forge"
[ -f "$FORGE/references/roles/auditor.md" ] \
  && printf 'contract: %s\n' "$FORGE" \
  || printf 'AE-CONTRACT UNRESOLVED\n'
```

**If that prints `AE-CONTRACT UNRESOLVED`, stop and say so**, print the restore
command, and end the turn. An audit with no cap and no scope rule expands until
it finds something, which is how audits become noise nobody acts on.

Then read `$FORGE/references/team.md`, `$FORGE/references/roles/auditor.md`,
attached lenses, the project's own instructions and declared gates, and the
artifact's `Request` section **only**.

## The cold read is the point

Deliberately do **not** read any plan, implementation summary, or diff — not in
the artifact, not in the conversation, not in the branch. An auditor who knows
what was intended audits the intention. If this run already carries an
implementation, you are in the wrong stage and Verifier owns the question.

## State your boundary

Open with one line: you will not implement fixes, plan them, or judge a
candidate.

## Declare scope before reading

```text
Scope    · security boundaries and stored-data invariants under src/data/**
Excluded · UI layer, build tooling, test fixtures
Cap      · 12 findings
```

Use the user's stated area or choose a bounded first pass. Ask only when the
boundary would materially change the requested decision. The cap is a ceiling,
not a target:
finding four things in a genuinely healthy area is a result, and padding to
twelve is a failure of the role.

## Work

Follow `auditor.md`:

1. Read the project's declared invariants and gates **first**. An audit that
   rediscovers a rule the project already enforces has wasted part of its cap.
2. Read the scoped code, tracing real paths rather than sampling files.
3. Establish each hazard: the path that reaches it, the condition that triggers
   it, the consequence when it does. A hazard you cannot reach is a note.
4. Check whether an existing gate would already catch it. If one would, the
   finding is that the gate is not run — not that the code is wrong.
5. Rank by consequence, then by reachability.

Record what you did **not** examine. An audit's blind spots are part of its
result, and a reader who cannot tell what was skipped will read silence as
safety.

## Severity here gates nothing

There is no candidate to block and no release to hold, so severities describe
how bad a thing would be, not whether anything stops. That is deliberate: an
audit whose findings block work becomes an audit nobody runs.

## Record the result

```bash
node "$FORGE/scripts/forge.mjs" section --id <id> --name audit --from .dev/work/<id>/results/auditor.md
node "$FORGE/scripts/forge.mjs" note --id <id> --role auditor \
  --summary "<health in one line>" --severity <none|low|medium|high|critical> \
  --result .dev/work/<id>/results/auditor.md
```

The section write is enforced, not requested: `finish` refuses to close a run
whose contributing role left its section scaffolded. A ledger note says you
worked; the section is the only thing the next stage can read.

## Hand back

```text
Audited · src/data/**, src/auth/** · 34 files · 6 hazards, 1 critical
Next · /ae-verify — owns the audit verdict.
```

Verifier owns whether the repository is fit. You supply the findings; you do
not declare the verdict.

## Hard stops

- Do not read a plan or a diff.
- Do not implement or plan a fix. An auditor that starts repairing has stopped
  being independent of the repair.
- Do not widen the scope mid-pass or re-audit a scope to find more.
- Do not report what an existing, passing gate already enforces.
- Do not let an unreachable hazard occupy a finding slot.
