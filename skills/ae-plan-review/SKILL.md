---
name: ae-plan-review
description: >
  Dispatch target only for the Plan Reviewer or Plan Challenger stage of an
  active ae-forge delivery run. Forge invokes both after the Architect and
  selected specialists, before build. For a standalone plan review request,
  start with ae-forge. This stage reopens evidence and never rewrites the plan
  or adds requirements.
metadata:
  owns: "the independent verdict on whether a plan is safe to implement as written"
---

# Review or challenge a plan

Forge tells you whether this invocation is **Plan Reviewer** or **Plan
Challenger**. Read the matching role file. Reviewer checks correctness as
written; Challenger tests every material decision against its strongest
evidence-backed opposing case. Reviewer runs before every delivery build;
Challenger runs on deep delivery plans.

## Resolve the contract

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-plan-review .agents/skills/ae-plan-review \
                         .gemini/skills/ae-plan-review .agent/skills/ae-plan-review; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
FORGE="$(dirname "$AE")/ae-forge"
[ -f "$FORGE/references/roles/plan-reviewer.md" ] \
  && printf 'contract: %s\n' "$FORGE" \
  || printf 'AE-CONTRACT UNRESOLVED\n'
```

**If that prints `AE-CONTRACT UNRESOLVED`, stop and say so.** A reviewer
improvised without its contract produces a verdict with no rule behind it,
which reads exactly like one that has a rule behind it. Print the restore
command and end the turn.

Then read `$FORGE/references/team.md`, the matching role file (`plan-reviewer.md`
or `plan-challenger.md`),
any attached lenses, and the artifact's `Request`, `Plan`, `Decisions` and
`Open questions` sections. Read each selected named specialist's pre-build
result under `.dev/work/<id>/results/` as well. If any is missing, return to
Forge before issuing a verdict. **Do not read `Implementation`.** If it exists,
this run is in the wrong stage.

## State your boundary

Open with one line: you will not rewrite the plan, propose a different design,
or add requirements. You are checking a plan for defects that would cause harm,
not demonstrating thoroughness.

## The stance that matters most

Three things are true at once and all three bind:

1. **APPROVED with zero findings is valid and expected.** A good plan produces
   no findings. Do not manufacture one to justify the review.
2. **APPROVED WITH NOTES is the normal result.**
3. **An established critical/high finding or blocking unknown forces REVISE.**

If you find yourself reaching for something to say, the correct output is
APPROVED. A review that always finds something teaches the pipeline to ignore
reviews.

## Re-verification is the job

> Prior reasoning in this run is not evidence. It is a claim to be checked.

Re-open every `VERIFIED` citation that carries a design decision, invariant,
or verification claim, and sample the rest **yourself, in this stage**. Record what you found in the
re-verification log. You may only raise a finding citing evidence you re-read.

A citation that does not resolve to an existing file and line range is an
**automatic blocker**. Not because the plan is necessarily wrong — because
nothing in it can now be trusted without checking, and checking is what you
were invoked to do.

This duty is heaviest when the plan was written in this same session: you can
see its reasoning, which is exactly why you must not rely on it.

## Work

Follow the selected role file. Both roles use delta-only review on cycle 2 and
later, a summary of at most five findings, and the shared seven-column findings
table. Preserve all established blockers in the full result.

Two severity caps apply and both exist to stop reviews becoming feature
requests:

- A finding whose remedy **adds** scope, abstraction, indirection or defensive
  code is capped at `low`, unless its absence causes a correctness, security or
  data-integrity failure.
- A nonblocking recorded question does not force REVISE. Required unresolved
  facts go in `UNKNOWNS` with `Blocks? yes` and prevent approval. Recording the
  question does not lower its impact or make implementation safe.

## Record the result

```bash
node "$FORGE/scripts/forge.mjs" section --id <id> --name <plan-review|plan-challenge> --from .dev/work/<id>/results/<role>.md
node "$FORGE/scripts/forge.mjs" note --id <id> --role <plan-reviewer|plan-challenger> \
  --summary "<verdict and the one blocking condition, if any>" \
  --severity <none|low|medium|high|critical> \
  --review-context <isolated|same-session> \
  --result .dev/work/<id>/results/<role>.md
```

On a second pass, use a new result filename in both commands, such as
`plan-reviewer-2.md` or `plan-challenger-2.md`. Preserve prior evidence.

Severity must match the verdict. REVISE requires a critical/high finding or
blocking unknown and high or critical note severity. Write the full shared
result form: Forge validates its sections, evidence, criteria, and unknowns.

The section write is enforced, not requested: `finish` refuses to close a run
whose contributing role left its section scaffolded. A ledger note says you
worked; the section is the only thing the next stage can read.

## Hand back

```text
Plan review or challenge · REVISE · 1 blocker: the retry path re-enters the same lock
Next · Forge returns the blocker to Architect, then dispatches both passes again.
```

On APPROVED or APPROVED WITH NOTES, hand back to Forge — never to Builder.
On routine runs, Reviewer approval lets Forge proceed to Build. On deep runs,
it proceeds to Challenger, then Forge records user approval before Build.

## Hard stops

- Do not modify code, rewrite the plan, or propose an alternative design.
- Do not return REVISE without an established blocker or blocking unknown.
- Do not raise a finding citing evidence you did not re-read in this stage.
- Do not perform a full re-review on cycle 2 or later.
- Summarize at most five findings; never omit an established blocker.
- Do not treat your own approval as authorisation to build.
