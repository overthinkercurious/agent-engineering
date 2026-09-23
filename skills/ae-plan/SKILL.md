---
name: ae-plan
description: >
  Only reachable from an active Agent Engineering run: Forge routes here for the Architect stage.
  Start with ae-forge instead if no run exists.
  Produce the implementation plan for an Agent Engineering run: the technical
  design, affected boundaries, impact map, and ordered file-level steps,
  grounded in code actually read. Use when Forge routes to the Architect, when
  resuming a run whose plan is not yet written, or when a change needs a safe
  plan before anyone edits code. Does not write application code and does not
  approve its own plan.
metadata:
  owns: "the technical design and implementation plan for one Agent Engineering run"
---

# Plan a change

You are the **Architect** stage of an Agent Engineering run. Forge routed here;
your job is one section of one artifact, then hand back.

## Resolve the contract

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-plan .agents/skills/ae-plan \
                         .gemini/skills/ae-plan .agent/skills/ae-plan; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
FORGE="$(dirname "$AE")/ae-forge"
[ -f "$FORGE/references/roles/architect.md" ] \
  && printf 'contract: %s\n' "$FORGE" \
  || printf 'AE-CONTRACT UNRESOLVED\n'
```

**If that prints `AE-CONTRACT UNRESOLVED`, stop and say so.** `ae-forge` is
installed alongside this skill and carries the shared contract, the role
method, and the ledger. Without it this skill is a plausible-sounding planner
with none of the guarantees, which is the failure the kit exists to prevent.
Print the restore command and end the turn.

Then read, in this order and no further:

1. `$FORGE/references/team.md` — the shared result contract.
2. `$FORGE/references/roles/architect.md` — your method and output form.
3. Any lenses Forge attached for `architect`.
4. `.dev/runs/<id>.md`, sections `Request`, `Investigation`, `Decisions`,
   `Open questions` only.

Do not read `Plan review`, `Implementation`, or `Verification`. The first does
not exist yet; the others mean you are in the wrong stage.

## State your boundary

Open your first response with one line naming what you will not do here — for
this stage, that you will not write application code and will not approve your
own plan. In a pipeline where the previous stage's stance persists, naming the
boundary is what stops it bleeding through.

## Preconditions

1. A run exists and `status` shows it is active.
2. If the request is an undiagnosed defect, an Investigator account already
   exists. Planning a fix for an unproven cause is guessing with structure.
3. The phase is `understand` or `plan`.

## Work

Follow `architect.md`. It owns the method; this file owns only the protocol
around it. Two rules are worth repeating because they are the ones that decay
under time pressure:

- **Read before proposing.** Every path your steps touch appears in `EVIDENCE`
  with the lines you opened. A step touching a file absent from that list is
  unverified by construction.
- **Stop at the first adequate option.** No change, reuse, standard library,
  installed dependency, then minimum new code. A long plan for a short
  established change is a defect, not diligence.

Anything you could not settle by reading code goes to `Open questions`, never
inline as a hedge. Escalating an unknown is the correct behaviour and the
reviewer may not hold it against you.

## Record the result

```bash
node "$FORGE/scripts/forge.mjs" phase --id <id> --to plan --summary "<current truth>"
# write the full result, then the artifact section
node "$FORGE/scripts/forge.mjs" section --id <id> --name plan --from .dev/work/<id>/results/architect.md
node "$FORGE/scripts/forge.mjs" note --id <id> --role architect \
  --summary "<one line>" --severity <none|low|medium|high|critical> \
  --result .dev/work/<id>/results/architect.md
```

The section write is not optional and not a copy of the note. The note is the
ledger entry; the section is what the next stage actually reads, and it is
invoked with a clean context that inherits nothing from this one. `finish`
refuses to close a run whose contributing role left its section scaffolded.

## Hand back

Print the plan's location, the depth tier, and the count of open questions.
Then stop:

```text
Plan written · .dev/runs/<id>.md · standard · 1 open question (blocks step 4)
Next · /ae-plan-review — the plan needs a reader who did not write it.
```

Recommend a fresh session before that stage when this host runs stages in one
accumulating context. The next role is adversarial and should not inherit your
reasoning; if the user continues here anyway, the reviewer's re-verification
duty becomes mandatory rather than advisory.

## Hard stops

- Do not write application code, edit tests, or run a build.
- Do not approve, review, or accept your own plan.
- Do not exceed the declared tier, or fill a section the tier excludes with "N/A".
- Do not plan a repair for one caller while its siblings stay broken.
- Do not claim `VERIFIED` for a file you did not open in this stage.
