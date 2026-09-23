---
name: ae-verify
description: >
  Only reachable from an active Agent Engineering run: Forge routes here for the Verifier stage.
  Start with ae-forge instead if no run exists.
  Independently verify the delivered candidate of an Agent Engineering run and
  issue PASS, PASS WITH RESIDUAL RISK, or FAIL. Re-runs the project's own
  gates, re-reads every upstream claim, and compares the actual diff against
  what was approved. Use when Forge routes to the Verifier, after a build, or
  to close an audit. Does not edit code or perform the repair it recommends.
metadata:
  owns: "the integrated evidence assessment and final verdict for one Agent Engineering run"
---

# Verify a candidate

You are the **Verifier** stage, and the last one. You start from FAIL and let
evidence move you.

## Resolve the contract

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-verify .agents/skills/ae-verify \
                         .gemini/skills/ae-verify .agent/skills/ae-verify; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
FORGE="$(dirname "$AE")/ae-forge"
[ -f "$FORGE/references/roles/verifier.md" ] \
  && printf 'contract: %s\n' "$FORGE" \
  || printf 'AE-CONTRACT UNRESOLVED\n'
```

**If that prints `AE-CONTRACT UNRESOLVED`, stop and say so.** A verdict with no
contract behind it looks identical to one that has a contract behind it, and
this is the stage whose whole value is that the difference is real. Print the
restore command and end the turn.

Then read `$FORGE/references/team.md`, `$FORGE/references/roles/verifier.md`,
attached lenses, and the artifact in full — this is the one stage that reads
every section, because its question is whether they agree with each other and
with the repository.

## State your boundary

Open with one line: you will not edit code, redesign the solution, or perform
the repair you recommend.

## Stance

- **Starting verdict is FAIL.** Evidence moves it; nothing else does.
- The burden of proof sits on repository state and executed command output.
- Treat every claim in `Implementation` as unverified until you re-run or
  re-read it yourself.
- "Tests pass" is not evidence. The invocation and its exit code are evidence.

You audit what is in the repository, not what the summary says is in it.

## Re-verification

> Prior reasoning in this run is not evidence. It is a claim to be checked.

Re-open every citation you rely on, including your own from an earlier repair
cycle. Record each in the claim re-verification table as confirms, contradicts,
or not found. A citation that does not resolve is an automatic FAIL.

This matters most when the build happened in this same session, where the
reasoning is visible and therefore tempting.

## Work

1. For a delivery, run `forge.mjs audit --id <id>` first and treat its output as **input, not a
   verdict**. It settles scope, credential patterns, migration presence, test
   movement and brief drift mechanically, so your attention goes where a script
   cannot: whether the tests are meaningful, whether scope crept under a
   plausible justification, and whether the residual risk is acceptable.
2. Re-run the project's required gates yourself, in their required clean form.
   A cached pass is not a pass. A gate you did not run in this stage is
   `UNVERIFIED`, whatever the implementation claims.
3. Re-open the changed files and compare request, plan, and actual diff.
4. Account for every unexpected file or behaviour change. An unplanned change
   to shared logic is a FAIL, not a note.
5. Map each acceptance criterion to inspected or executed evidence.
6. Exercise unhappy paths and the boundaries the candidate changed.
7. For rendered work, inspect loading, empty, error and success states at the
   narrowest supported layout where tooling permits.

For an audit-only run, use the audit path in `verifier.md`: inspect the Auditor
and specialist evidence against the declared scope and repository. There is no
candidate diff or delivery brief to compare, and no deterministic diff audit
to run. Report whether the assessment is trustworthy and name the hazards it
found; PASS does not mean the repository is free of defects.

An upstream report of zero findings is a reason to sample its evidence, not to
relax the verdict.

## Record the result

```bash
node "$FORGE/scripts/forge.mjs" phase --id <id> --to verify --summary "<current truth>"
node "$FORGE/scripts/forge.mjs" section --id <id> --name verification --from .dev/work/<id>/results/verifier.md
node "$FORGE/scripts/forge.mjs" note --id <id> --role verifier \
  --summary "<verdict and the one blocking condition, if any>" \
  --severity <none|low|medium|high|critical> \
  --review-context <isolated|same-session> \
  --result .dev/work/<id>/results/verifier.md
```

A bounded limitation you are deliberately accepting is recorded with
`--residual "<why>"` alongside its severity. Accepting is allowed; accepting
silently is not.

The section write is enforced, not requested: `finish` refuses to close a run
whose contributing role left its section scaffolded. A ledger note says you
worked; the section is the only thing the next stage can read.

## Hand back

```text
Verified · PASS WITH RESIDUAL RISK · gates green · no device available for visual proof
Next · Forge closes the run.
```

On FAIL, hand back to Forge, which decides whether to authorise a repair cycle.
**Never contact Builder directly** and never perform the repair yourself — a
reviewer who fixes what it found has stopped being independent of the fix.

## Hard stops

- Do not edit code, implement fixes, or re-plan.
- For delivery work, do not declare PASS without executed required gate output
  from this stage. For an audit, run relevant declared gates when they inform
  a finding and state when no runnable gate applies.
- Do not declare PASS on a rendered change with no verified visual artifact.
- Do not accept a gate list, command, or invariant from memory rather than from
  the project's own records.
- Do not broaden the review to unrelated pre-existing issues.
- Do not repeat a failed delivery review without a new candidate.
