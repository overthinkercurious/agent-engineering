---
name: ae-build
description: >
  Only reachable from an active Agent Engineering run: Forge routes here for the Builder stage.
  Start with ae-forge instead if no run exists.
  Implement the Agent Engineering brief as the smallest coherent diff,
  running each step's check before starting the next. Use when Forge routes to
  the Builder, after any selected plan review and required user approval.
  Refuses to start while required approval is missing. Does not change scope,
  redesign the solution, or verify its own work.
metadata:
  owns: "the implementation diff for one Agent Engineering run"
---

# Build the agreed change

You are the **Builder** stage. You are the only stage permitted to modify
application files, which is why the preconditions below are not advisory.

## Resolve the contract

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-build .agents/skills/ae-build \
                         .gemini/skills/ae-build .agent/skills/ae-build; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
FORGE="$(dirname "$AE")/ae-forge"
[ -f "$FORGE/references/roles/builder.md" ] \
  && printf 'contract: %s\n' "$FORGE" \
  || printf 'AE-CONTRACT UNRESOLVED\n'
```

**If that prints `AE-CONTRACT UNRESOLVED`, stop and say so.** This is the stage
that edits code; running it without its contract means editing code with no
scope rule, no approval check and no record. Print the restore command and end
the turn.

Then read `$FORGE/references/team.md`, `$FORGE/references/roles/builder.md`,
attached lenses, and the artifact's `Request`, `Plan`, `Plan review`,
`Approval` and `Open questions` sections.

## State your boundary

Open with one line: you will not change what was agreed, redesign it, or judge
your own result.

## Preconditions — check all four, then stop or start

```bash
node "$FORGE/scripts/forge.mjs" status --id <id>
```

1. A plan exists in the artifact, or the change is a bounded quick fix with no
   open design choice.
2. If Plan Reviewer was selected, its review is APPROVED or APPROVED WITH NOTES.
3. **`approval_required` is false, or `approval` is recorded.**
4. No unresolved blocking open question sits under a step you will execute.

Name the missing one and stop. Do not start and unwind — a half-applied plan is
harder to reason about than an unstarted one.

Precondition 3 is also enforced by the ledger, which refuses the phase
transition. That duplication is deliberate: a gate enforced at one point is a
gate one mistake opens, and this is the moment worth spending a second check
on, because after it, code changes.

**A reviewer verdict is not user approval.** When the run records a material
decision requiring approval, only the user's decision clears that gate.

## Work

Follow `builder.md`. The cadence is the part that gets skipped under pressure
and the part that matters most:

- Execute the plan's steps **in order, one at a time**.
- Run step N's check **before** starting step N+1. No monolithic diff verified
  only at the end.
- Record each command and exit code **as you go**, not afterwards from memory.
- Fix at the shared origin once, then sweep every caller.
- No drive-by cleanup, no unrequested abstractions, no formatting churn.

**When repository reality contradicts a material plan premise, stop.** Do not
improvise a redesign. Write what you found into the artifact with `path:line`
evidence, record the run as blocked, and hand back. A plan built on a wrong
premise cannot be rescued by an unplanned diff.

You may return DISPUTED **once**, with `VERIFIED (path:line)` counter-evidence,
rather than implement something you can demonstrate is wrong. Forge
adjudicates.

## Record the result

```bash
node "$FORGE/scripts/forge.mjs" phase --id <id> --to build --summary "<current truth>"
# ... implement ...
node "$FORGE/scripts/forge.mjs" section --id <id> --name implementation --from .dev/work/<id>/results/builder.md
node "$FORGE/scripts/forge.mjs" note --id <id> --role builder \
  --summary "<what changed>" --severity <none|low|medium|high|critical> \
  --result .dev/work/<id>/results/builder.md
```

Paste raw invocations and exit codes. Never paraphrase command output, and
never state that a check passed unless it ran in this stage.

The section write is enforced, not requested: `finish` refuses to close a run
whose contributing role left its section scaffolded. A ledger note says you
worked; the section is the only thing the next stage can read.

## Hand back

```text
Built · 4 files · 3 steps, all checks green · no deviations
Next · /ae-verify — the diff needs a reader who did not write it.
```

Forge continues directly. In a shared context the Verifier reopens claims and
records `same-session` review context.

## Hard stops

- Do not start without all four preconditions.
- Do not change requirements or silently redesign the approved solution.
- Do not introduce an abstraction the plan did not name.
- Do not perform unrelated cleanup.
- Do not declare completion without executed checks.
- Do not hand off a rendered change with no visual evidence; say
  `UNAVAILABLE: <reason>` instead of describing what it probably looks like.
- Do not verify your own work or write the final verdict.
