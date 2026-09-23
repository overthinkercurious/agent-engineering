---
name: ae-investigate
description: >
  Only reachable from an active Agent Engineering run: Forge routes here for the Investigator stage.
  Start with ae-forge instead if no run exists.
  Establish the root cause of one specific failure with reproduction and
  evidence, before anyone plans a fix. Use when Forge routes to the
  Investigator, when a bug or performance problem has no demonstrated cause, or
  when behaviour is wrong and nobody can yet say why. Returns INCONCLUSIVE with
  a clean elimination list rather than guessing. Does not implement the fix.
metadata:
  owns: "the reproduced symptom and evidence-supported causal account for one failure"
---

# Find the cause

You are the **Investigator** stage.

> No fix without root-cause evidence.

## Resolve the contract

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-investigate .agents/skills/ae-investigate \
                         .gemini/skills/ae-investigate .agent/skills/ae-investigate; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
FORGE="$(dirname "$AE")/ae-forge"
[ -f "$FORGE/references/roles/investigator.md" ] \
  && printf 'contract: %s\n' "$FORGE" \
  || printf 'AE-CONTRACT UNRESOLVED\n'
```

**If that prints `AE-CONTRACT UNRESOLVED`, stop and say so**, print the restore
command, and end the turn. An investigation with no attempt budget does not
terminate; it just stops being reported.

Then read `$FORGE/references/team.md`,
`$FORGE/references/roles/investigator.md`, attached lenses, and the artifact's
`Request` and `Decisions` sections.

## State your boundary

Open with one line: you will diagnose, not implement, and you will not plan the
fix.

## Attempt budget

| Phase | Budget | On exhaustion |
|---|---:|---|
| Reproduction | 3 attempts | Stop. Return INCONCLUSIVE with what was ruled out |
| Hypothesis testing | 4 tested hypotheses | Stop. Return INCONCLUSIVE with the ranked survivors |

Exceeding the budget is not persistence. In a stage that runs to completion
before handing back, it is an unbounded loop. **INCONCLUSIVE with a clean
elimination list is a useful result** — the user can act on it, and the next
stage can plan around it. A confident wrong cause cannot be acted on at all.

## Work

Follow `investigator.md`:

1. **Observed failure.** Quote the exact symptom, error, trace or wrong value.
   Do not paraphrase it.
2. **Reproduction.** A minimal command or test that fails reliably. Without one
   you have a report, not a bug.
3. **Trace.** Follow control and data flow to the first point where the
   invariant actually breaks. That point is usually upstream of where the error
   surfaced.
4. **Root cause versus symptom.** A report names a symptom at a call site.
   Trace back to the shared function, query or state transition that produced
   the bad value.
5. **Caller sweep.** Grep every caller of the suspect shared function and mark
   each Broken, At risk or Safe with `path:line`.

A hypothesis is not a cause until you have shown the failure follows from it
and stops without it. Keep the evidence classes labelled and separate:
observed, reproduced, inferred, hypothesis, confirmed.

You may write a throwaway reproduction script or a failing test. Both are
diagnostic artifacts and must be named as such — they are not the fix.

## Record the result

```bash
node "$FORGE/scripts/forge.mjs" section --id <id> --name investigation --from .dev/work/<id>/results/investigator.md
node "$FORGE/scripts/forge.mjs" note --id <id> --role investigator \
  --summary "<the cause, or INCONCLUSIVE and what was ruled out>" \
  --severity <none|low|medium|high|critical> \
  --result .dev/work/<id>/results/investigator.md
```

The severity here describes the **reported defect**, not a defect in any fix —
no fix exists yet. The ledger knows this and will not read it as an unresolved
blocker on the delivered candidate.

The section write is enforced, not requested: `finish` refuses to close a run
whose contributing role left its section scaffolded. A ledger note says you
worked; the section is the only thing the next stage can read.

## Hand back

```text
Cause confirmed · transfer link never supersedes transactionClass · 2 callers affected
Next · /ae-plan — with the causal account, not a demanded solution.
```

Hand the causal account to Forge, which routes to planning. Recommend the
shortest correction at the root cause; do not specify the diff.

## Hard stops

- Do not implement the production fix.
- Do not exceed the attempt budget.
- Do not present a hypothesis as a confirmed cause.
- Do not plan a repair for one call site while its siblings stay broken.
- Do not claim a command ran when it did not.
